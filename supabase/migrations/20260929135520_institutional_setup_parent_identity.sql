-- Stage 20 / 3I: preserve editorial parent when source changes remove calculation eligibility.
set search_path='';
set local lock_timeout='5s';
create or replace function private.worker_load_institutional_model_context_v3(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs; s private.institutional_model_setup_submissions; x private.institutional_setup_input_snapshots;
 body jsonb; source jsonb; version_id uuid; rights_id uuid;
begin
 select * into j from public.processing_jobs where id=p_job_id;
 select * into s from private.institutional_model_setup_submissions where organization_id=j.organization_id
  and intake_session_id=j.intake_session_id and id=nullif(j.payload->>'message_id','')::uuid and j.kind='agent_operation_brief';
 if s.id is null then return private.worker_load_institutional_model_context_v2(p_job_id,p_capability_token);end if;
 j:=private.institutional_job_for_capture_v1(p_job_id,p_capability_token);
 select * into s from private.institutional_model_setup_submissions where organization_id=j.organization_id and id=s.id for update nowait;
 select * into x from private.institutional_setup_input_snapshots where organization_id=j.organization_id and submission_id=s.id;
 if x.id is null then
  -- A completed legacy assessment receives no retrospective context. Resume only its recorded outcome.
  if s.assessment is not null then
   if j.lease_expires_at<=clock_timestamp() then raise exception 'institutional_capture_denied' using errcode='42501';end if;
   return jsonb_build_object('setupReplay',jsonb_build_object('submissionId',s.id,'status',s.status,'candidateId',s.candidate_id,
    'revision',(select revision from private.institutional_model_configurations where organization_id=s.organization_id and id=s.candidate_id),
    'informationRequestBasis',case when s.status='missing_inputs' then jsonb_build_object('configurationFingerprint',s.assessment#>>'{prepared,configurationFingerprint}','missingInputs',(select jsonb_agg(jsonb_build_object('targetPath',g->>'targetPath','code',g->>'code') order by ord) from jsonb_array_elements(s.assessment#>'{prepared,missingInputs}') with ordinality gaps(g,ord))) else null end));
  end if;
  if s.status<>'queued' then raise exception 'institutional_setup_capture_state_invalid';end if;
  body:=private.worker_load_institutional_model_context_v2(p_job_id,p_capability_token);
  if body#>>'{pendingSetup,submissionId}' is distinct from s.id::text
   or body->>'projectId' is distinct from s.capital_project_id::text
   or body#>>'{pendingSetup,sourceManifestFingerprint}' is distinct from body->>'sourceManifestFingerprint'
   or body#>'{pendingSetup,configuration}' is distinct from s.configuration
   or body#>'{pendingSetup,sourceReviews}' is distinct from s.source_reviews
   then raise exception 'institutional_setup_capture_context_unbound';end if;
  -- Editorial ancestry is independent of current calculation eligibility.
  body:=body||jsonb_build_object('setupParent',(select jsonb_build_object('id',c.id,'fingerprint',c.configuration_fingerprint,'revision',c.revision,'workId',c.capital_project_id)
   from private.institutional_model_configurations c where c.organization_id=j.organization_id and c.capital_project_id=s.capital_project_id
    and c.status='approved' order by c.revision desc,c.id limit 1));
  insert into private.institutional_setup_input_snapshots(organization_id,job_id,work_id,intake_session_id,submission_id,subject_id,context,context_fingerprint)
   values(j.organization_id,j.id,s.capital_project_id,j.intake_session_id,s.id,j.authorization_subject_id,body,private.institutional_config_hash(body)) returning * into x;
  -- Select only from the immutable context actually delivered to the preparer.
  insert into private.institutional_setup_parent_pins(organization_id,snapshot_id,work_id,parent_configuration_id,parent_fingerprint)
  select j.organization_id,x.id,s.capital_project_id,(parent->>'id')::uuid,parent->>'fingerprint'
  from (select body->'setupParent' as parent) captured;
  for source in select value from jsonb_array_elements(body->'currentSources') loop
   select id into version_id from public.source_versions where organization_id=j.organization_id
    and id=(source->>'sourceDocument')::uuid and legacy_document_version::text=source->>'version' and declared_sha256=source->>'hash';
   if version_id is null then raise exception 'institutional_setup_capture_source_unbound' using errcode='42501';end if;
   select id into rights_id from private.source_rights_versions where organization_id=j.organization_id and source_version_id=version_id order by revision desc limit 1;
   if rights_id is null then raise exception 'institutional_setup_capture_rights_missing' using errcode='42501';end if;
   insert into private.institutional_setup_source_links(organization_id,snapshot_id,source_version_id,rights_version_id) values(j.organization_id,x.id,version_id,rights_id);
  end loop;
  if exists(select 1 from jsonb_array_elements(body->'candidates') c where not exists(select 1 from jsonb_array_elements(body->'currentSources') d
   where d->>'sourceDocument'=c->>'source_document_id' and d->>'version'=c->>'extraction_document_version' and d->>'hash'=c->>'extraction_source_sha256'))
   then raise exception 'institutional_setup_capture_candidate_unbound' using errcode='42501';end if;
 end if;
 if not private.institutional_setup_snapshot_authorized_v1(x.id,j.id) or j.lease_expires_at<=clock_timestamp()
  then raise exception 'institutional_setup_capture_rights_revoked' using errcode='42501';end if;
 return x.context||jsonb_build_object('setupInputSnapshot',jsonb_build_object('id',x.id,'fingerprint',x.context_fingerprint));
exception when lock_not_available then raise exception 'institutional_capture_retry' using errcode='40001';
end $$;
create or replace function private.institutional_configuration_capture_state_v1(p_org uuid,p_configuration uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c private.institutional_model_configurations;s private.institutional_model_setup_submissions;
 x private.institutional_setup_input_snapshots;b private.institutional_setup_input_bindings;pin private.institutional_setup_parent_pins;expected_parent jsonb;
begin
 select * into c from private.institutional_model_configurations where organization_id=p_org and id=p_configuration;
 if c.id is null then return jsonb_build_object('state','unresolved','reason','configuration_missing');end if;
 if c.answer_evidence->>'kind' is distinct from 'initial_configuration' then return jsonb_build_object('state','unresolved','reason','contribution_lineage_unclassified');end if;
 if c.parent_fingerprint is not null and not exists(select 1 from private.institutional_setup_parent_pins p join private.institutional_setup_input_bindings ib on (ib.organization_id,ib.snapshot_id)=(p.organization_id,p.snapshot_id) where ib.organization_id=p_org and ib.candidate_id=c.id) then return jsonb_build_object('state','unresolved','reason','parent_lineage_unclassified');end if;
 select * into b from private.institutional_setup_input_bindings where organization_id=p_org and candidate_id=c.id;
 select * into x from private.institutional_setup_input_snapshots where organization_id=p_org and id=b.snapshot_id;
 select * into s from private.institutional_model_setup_submissions where organization_id=p_org and id=b.submission_id;
 if b.id is null or x.id is null or s.id is null then return jsonb_build_object('state','unresolved','reason','setup_capture_missing');end if;
 if x.work_id is distinct from c.capital_project_id or s.capital_project_id is distinct from c.capital_project_id
  or c.answer_message_id is distinct from s.id or c.answer_evidence->>'submissionId' is distinct from s.id::text
  or s.candidate_id is distinct from c.id or b.assessment_fingerprint is distinct from private.institutional_config_hash(s.assessment)
  or s.assessment->'configuration' is distinct from c.configuration or s.assessment->>'configurationFingerprint' is distinct from c.configuration_fingerprint
  or c.configuration_fingerprint is distinct from private.institutional_config_hash(c.configuration)
  or s.assessment->'sourceBindings' is distinct from c.answer_evidence->'sourceBindings'
  or s.assessment->'lineage' is distinct from c.answer_evidence->'lineage'
  or x.context#>'{pendingSetup,configuration}' is distinct from s.configuration
  or x.context#>'{pendingSetup,sourceReviews}' is distinct from s.source_reviews
  or (select count(*) from private.institutional_setup_source_links where organization_id=p_org and snapshot_id=x.id)<>jsonb_array_length(x.context->'currentSources')
  or exists(select 1 from jsonb_array_elements(x.context->'currentSources') d where not exists(
   select 1 from private.institutional_setup_source_links l join public.source_versions v on v.organization_id=l.organization_id and v.id=l.source_version_id
   where l.organization_id=p_org and l.snapshot_id=x.id and v.id::text=d->>'sourceDocument' and v.legacy_document_version::text=d->>'version' and v.declared_sha256=d->>'hash'))
  then return jsonb_build_object('state','unresolved','reason','setup_capture_mismatch');end if;
 select * into pin from private.institutional_setup_parent_pins where organization_id=p_org and snapshot_id=x.id;
 if pin.snapshot_id is not null then
  if x.context ? 'setupParent' then expected_parent:=x.context->'setupParent';
  else select item into expected_parent from jsonb_array_elements(x.context->'approvedConfigurations') item
   order by (item->>'revision')::integer desc,item->>'id' limit 1;end if;
  if pin.work_id is distinct from c.capital_project_id or pin.parent_fingerprint is distinct from c.parent_fingerprint
   or (pin.parent_configuration_id::text,pin.parent_fingerprint) is distinct from (expected_parent->>'id',expected_parent->>'fingerprint')
   or (pin.parent_configuration_id is not null and not exists(select 1 from private.institutional_model_configurations parent
    where parent.organization_id=p_org and parent.id=pin.parent_configuration_id and parent.capital_project_id=c.capital_project_id
     and parent.configuration_fingerprint=pin.parent_fingerprint and parent.configuration_fingerprint=private.institutional_config_hash(parent.configuration)
     and parent.revision<c.revision
     and (not (x.context ? 'setupParent') or (expected_parent->>'revision',expected_parent->>'workId')=(parent.revision::text,parent.capital_project_id::text))))
   then return jsonb_build_object('state','unresolved','reason','setup_parent_mismatch');end if;
  if pin.parent_configuration_id is not null then return jsonb_build_object('state','captured_setup','snapshotId',x.id,'contextFingerprint',x.context_fingerprint,
   'configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint,'parentConfigurationId',pin.parent_configuration_id,'parentFingerprint',pin.parent_fingerprint);end if;
 end if;
 return jsonb_build_object('state','captured_root','snapshotId',x.id,'contextFingerprint',x.context_fingerprint,'configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint);
end $$;
