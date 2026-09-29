-- Stage 20 / 3I: captured setup parent, mixed ancestry, exact human review and no prospective legacy fallback.
set search_path='';
set local lock_timeout='5s';
create table private.institutional_setup_parent_pins (
 organization_id uuid not null references public.organizations(id), snapshot_id uuid not null,
 work_id uuid not null, parent_configuration_id uuid, parent_fingerprint text,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,snapshot_id),
 foreign key(organization_id,snapshot_id) references private.institutional_setup_input_snapshots(organization_id,id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,parent_configuration_id) references private.institutional_model_configurations(organization_id,id),
 check((parent_configuration_id is null)=(parent_fingerprint is null)),
 check(parent_fingerprint is null or parent_fingerprint ~ '^[a-f0-9]{64}$')
);
create index institutional_setup_parent_work_idx on private.institutional_setup_parent_pins(organization_id,work_id);
create index institutional_setup_parent_configuration_idx on private.institutional_setup_parent_pins(organization_id,parent_configuration_id);
alter table private.institutional_setup_parent_pins enable row level security;
alter table private.institutional_setup_parent_pins force row level security;
revoke all on private.institutional_setup_parent_pins from public,anon,authenticated,service_role;
create policy institutional_setup_parent_pins_deny_select on private.institutional_setup_parent_pins as restrictive for select to anon,authenticated using(false);
create policy institutional_setup_parent_pins_deny_insert on private.institutional_setup_parent_pins as restrictive for insert to anon,authenticated with check(false);
create policy institutional_setup_parent_pins_deny_update on private.institutional_setup_parent_pins as restrictive for update to anon,authenticated using(false) with check(false);
create policy institutional_setup_parent_pins_deny_delete on private.institutional_setup_parent_pins as restrictive for delete to anon,authenticated using(false);
create trigger institutional_setup_parent_pins_immutable before update or delete on private.institutional_setup_parent_pins for each row execute function private.reject_review_history_mutation_v1();
create trigger institutional_setup_parent_pins_no_truncate before truncate on private.institutional_setup_parent_pins for each statement execute function private.reject_review_history_mutation_v1();
create trigger institutional_setup_parent_pins_updated before update on private.institutional_setup_parent_pins for each row execute function private.set_updated_at();
create trigger institutional_setup_parent_pins_audit after insert on private.institutional_setup_parent_pins for each row execute function private.capture_audit_event();

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
  insert into private.institutional_setup_input_snapshots(organization_id,job_id,work_id,intake_session_id,submission_id,subject_id,context,context_fingerprint)
   values(j.organization_id,j.id,s.capital_project_id,j.intake_session_id,s.id,j.authorization_subject_id,body,private.institutional_config_hash(body)) returning * into x;
  -- Select only from the immutable context actually delivered to the preparer.
  insert into private.institutional_setup_parent_pins(organization_id,snapshot_id,work_id,parent_configuration_id,parent_fingerprint)
  select j.organization_id,x.id,s.capital_project_id,(parent->>'id')::uuid,parent->>'fingerprint'
  from (select (select item from jsonb_array_elements(body->'approvedConfigurations') item
   order by (item->>'revision')::integer desc,item->>'id' limit 1) as parent) captured;
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
create or replace function private.persist_initial_institutional_candidate_v1(p_job_id uuid,p_capability_token text,p_submission_id uuid,p_candidate jsonb,p_snapshot uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);s private.institutional_model_setup_submissions;context jsonb;expected jsonb;assumptions jsonb;overrides jsonb;v_candidate_id uuid;next_revision integer;parent text;receipt jsonb;line jsonb;
begin
 if j.kind<>'agent_operation_brief' or j.payload->>'message_id' is distinct from p_submission_id::text then raise exception 'institutional_setup_job_mismatch' using errcode='42501';end if;
 select * into s from private.institutional_model_setup_submissions where organization_id=j.organization_id and intake_session_id=j.intake_session_id and id=p_submission_id for update;
 if s.id is null then raise exception 'institutional_setup_not_found';end if;
 if exists(select 1 from private.institutional_setup_input_snapshots x where x.organization_id=s.organization_id and x.submission_id=s.id and (p_snapshot is distinct from x.id or x.job_id is distinct from j.id)) then raise exception 'institutional_setup_snapshot_requires_v2' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=s.organization_id and id=s.capital_project_id for update;
 if s.assessment is not null then
  if s.assessment is distinct from p_candidate then raise exception 'institutional_setup_assessment_replay_mismatch';end if;
  return jsonb_build_object('candidateId',s.candidate_id,'revision',(select revision from private.institutional_model_configurations where organization_id=s.organization_id and id=s.candidate_id),'replayed',true);
 end if;
 context:=private.institutional_source_context(s.organization_id,s.intake_session_id);
 if s.source_manifest_fingerprint is distinct from context->>'sourceManifestFingerprint' then raise exception 'institutional_setup_sources_changed' using errcode='40001';end if;
 if p_candidate->>'willExecute' is distinct from 'false' or coalesce(p_candidate->>'status','') not in ('review_required','missing_inputs','calculation_blocked') then raise exception 'institutional_setup_assessment_invalid';end if;
 if p_candidate->>'status'<>'review_required' then
  update private.institutional_model_setup_submissions set status=p_candidate->>'status',assessment=p_candidate where organization_id=s.organization_id and id=s.id;
  return jsonb_build_object('candidateId',null,'revision',null,'replayed',false);
 end if;
 select jsonb_agg(value||jsonb_build_object('sourceType','offroad_scenario','confidence','low','evidence','[]'::jsonb) order by ord),jsonb_agg(jsonb_build_object('assumptionId',value->>'id','values',value->'values','rationale',value->>'rationale','requestedBy',s.submitted_by,'createdAt',s.submitted_at) order by ord) into assumptions,overrides from jsonb_array_elements(s.configuration#>'{assumptionBook,assumptions}') with ordinality a(value,ord);
 expected:=jsonb_set(jsonb_set(s.configuration,'{assumptionBook,assumptions}',assumptions),'{assumptionBook,overrides}',overrides,true);
 if p_candidate->'configuration' is distinct from expected or p_candidate->>'configurationFingerprint' is distinct from private.institutional_config_hash(expected)
  or p_candidate->'sourceBindings' is distinct from s.source_reviews or p_candidate#>>'{submission,id}' is distinct from s.id::text or p_candidate#>>'{submission,actorId}' is distinct from s.submitted_by::text or (p_candidate#>>'{submission,submittedAt}')::timestamptz is distinct from s.submitted_at
  or coalesce(p_candidate->>'inputFingerprint','')!~'^[a-f0-9]{64}$' or coalesce(p_candidate->>'resultFingerprint','')!~'^[a-f0-9]{64}$' or coalesce(p_candidate#>>'{review,status}','') not in ('review_required','ready_for_human_review')
  or coalesce(jsonb_typeof(p_candidate->'lineage'),'null')<>'array' or jsonb_array_length(p_candidate->'lineage')<1 then raise exception 'institutional_initial_candidate_invalid';end if;
 for line in select value from jsonb_array_elements(p_candidate->'lineage') loop
  if not exists(select 1 from jsonb_array_elements(context->'candidates') c where c->>'field_path'=line->>'fieldPath' and c->>'source_document_id'=line->>'sourceDocument' and c->>'period_end'=line->>'periodEnd' and (c->>'period_start') is not distinct from (line->>'periodStart') and c->>'entity_name'=line->>'entityName' and c->>'entity_scope'=line->>'entityScope' and c->>'extraction_source_sha256'=line->>'sourceHash' and c->>'extraction_document_version'=line->>'sourceVersion' and c->'source_anchor'=line->'anchor' and (c->>'normalized_value')::numeric=(line->>'value')::numeric and exists(select 1 from jsonb_array_elements(s.source_reviews) sr where sr->>'sourceDocument'=line->>'sourceDocument' and sr->>'asOfDate'=line->>'sourceAsOfDate' and (nullif(c->>'currency','') is null or c->>'currency'=sr->>'currency'))) then raise exception 'institutional_initial_lineage_unbound';end if;
 end loop;
 if p_snapshot is not null and exists(select 1 from private.institutional_setup_parent_pins where organization_id=s.organization_id and snapshot_id=p_snapshot) then
  select parent_fingerprint into parent from private.institutional_setup_parent_pins where organization_id=s.organization_id and snapshot_id=p_snapshot and work_id=s.capital_project_id;
  if not found then raise exception 'institutional_setup_parent_work_mismatch' using errcode='42501';end if;
 else
  select configuration_fingerprint into parent from private.institutional_model_configurations where organization_id=s.organization_id and capital_project_id=s.capital_project_id and status='approved' order by revision desc limit 1;
  if p_snapshot is not null and parent is not null then raise exception 'institutional_setup_parent_capture_missing' using errcode='42501';end if;
 end if;
 select coalesce(max(revision),0)+1 into next_revision from private.institutional_model_configurations where organization_id=s.organization_id and capital_project_id=s.capital_project_id;
 receipt:=jsonb_build_object('kind','initial_configuration','submissionId',s.id,'sourceManifestFingerprint',s.source_manifest_fingerprint,'sourceBindings',s.source_reviews,'lineage',p_candidate->'lineage','inputFingerprint',p_candidate->>'inputFingerprint','resultFingerprint',p_candidate->>'resultFingerprint','review',p_candidate->'review','submittedBy',s.submitted_by,'submittedAt',s.submitted_at);
 insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_message_id,answer_evidence) values(s.organization_id,s.capital_project_id,next_revision,expected,private.institutional_config_hash(expected),parent,'review_required',s.id,receipt) returning id into v_candidate_id;
 update private.institutional_model_setup_submissions set status='review_required',candidate_id=v_candidate_id,assessment=p_candidate where organization_id=s.organization_id and id=s.id;
 return jsonb_build_object('candidateId',v_candidate_id,'revision',next_revision,'replayed',false);
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
  select item into expected_parent from jsonb_array_elements(x.context->'approvedConfigurations') item
   order by (item->>'revision')::integer desc,item->>'id' limit 1;
  if pin.work_id is distinct from c.capital_project_id or pin.parent_fingerprint is distinct from c.parent_fingerprint
   or (pin.parent_configuration_id::text,pin.parent_fingerprint) is distinct from (expected_parent->>'id',expected_parent->>'fingerprint')
   or (pin.parent_configuration_id is not null and not exists(select 1 from private.institutional_model_configurations parent
    where parent.organization_id=p_org and parent.id=pin.parent_configuration_id and parent.capital_project_id=c.capital_project_id
     and parent.configuration_fingerprint=pin.parent_fingerprint and parent.configuration_fingerprint=private.institutional_config_hash(parent.configuration)
     and parent.revision<c.revision))
   then return jsonb_build_object('state','unresolved','reason','setup_parent_mismatch');end if;
  if pin.parent_configuration_id is not null then return jsonb_build_object('state','captured_setup','snapshotId',x.id,'contextFingerprint',x.context_fingerprint,
   'configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint,'parentConfigurationId',pin.parent_configuration_id,'parentFingerprint',pin.parent_fingerprint);end if;
 end if;
 return jsonb_build_object('state','captured_root','snapshotId',x.id,'contextFingerprint',x.context_fingerprint,'configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint);
end $$;
create or replace function private.institutional_configuration_ancestry_v1(p_org uuid,p_work uuid,p_configuration uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 c private.institutional_model_configurations; parent private.institutional_model_configurations;
 r private.institutional_contribution_receipts; m public.agent_messages;
 x private.institutional_setup_input_snapshots; root jsonb; binding jsonb;
 visited uuid[]:='{}'; nodes jsonb:='[]'; sources jsonb;pins jsonb:='[]'::jsonb; application jsonb;
 current_id uuid:=p_configuration; reason text; depth integer;
begin
 for depth in 1..128 loop
  if current_id=any(visited) then reason:='cycle';exit;end if;
  visited:=array_append(visited,current_id);
  select * into c from private.institutional_model_configurations where organization_id=p_org and id=current_id;
  if c.id is null then reason:='configuration_missing';exit;end if;
  if c.capital_project_id is distinct from p_work then reason:='work_mismatch';exit;end if;
  if c.configuration_fingerprint is distinct from private.institutional_config_hash(c.configuration) then reason:='configuration_hash_mismatch';exit;end if;
  if c.answer_evidence->>'kind'='initial_configuration' then
   root:=private.institutional_configuration_capture_state_v1(p_org,c.id);
   if coalesce(root->>'state','') not in ('captured_root','captured_setup') then reason:='root_unproven';exit;end if;
   select * into x from private.institutional_setup_input_snapshots where organization_id=p_org and id=(root->>'snapshotId')::uuid;
   if x.work_id is distinct from p_work or x.context_fingerprint is distinct from private.institutional_config_hash(x.context)
    then reason:='root_snapshot_mismatch';exit;end if;
   select coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',l.source_version_id,'rightsVersionId',l.rights_version_id,
     'declaredSha256',v.declared_sha256) order by l.source_version_id,l.rights_version_id),'[]'::jsonb)
    into sources from private.institutional_setup_source_links l
    join public.source_versions v on (v.organization_id,v.id)=(l.organization_id,l.source_version_id)
    where l.organization_id=p_org and l.snapshot_id=x.id;
   nodes:=nodes||jsonb_build_array(jsonb_build_object('kind','setup','configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint,'snapshotId',x.id,'contextFingerprint',x.context_fingerprint));
   pins:=pins||sources;
   if root->>'state'='captured_setup' then
    nodes:=jsonb_set(nodes,array[(jsonb_array_length(nodes)-1)::text],(nodes->(jsonb_array_length(nodes)-1))||jsonb_build_object('parentConfigurationId',root->'parentConfigurationId','parentFingerprint',root->'parentFingerprint'));
    current_id:=(root->>'parentConfigurationId')::uuid;
    continue;
   end if;
   select coalesce(jsonb_agg(pin order by pin->>'sourceVersionId',pin->>'rightsVersionId'),'[]'::jsonb) into sources
    from (select distinct value as pin from jsonb_array_elements(pins)) unique_pins;
   return jsonb_build_object('state','captured_lineage','authorization','not_evaluated','organizationId',p_org,'workId',p_work,
    'configurationId',p_configuration,'nodes',nodes,'sources',sources);
  end if;
  if c.answer_evidence->>'kind' is not null then reason:='unsupported_origin';exit;end if;
  select * into r from private.institutional_contribution_receipts where organization_id=p_org and candidate_id=c.id;
  if r.id is null then reason:='contribution_receipt_missing';exit;end if;
  select * into parent from private.institutional_model_configurations where organization_id=p_org and id=r.parent_configuration_id;
  if parent.id is null then reason:='parent_missing';exit;end if;
  if (r.work_id,parent.capital_project_id,r.candidate_fingerprint,r.parent_fingerprint)
   is distinct from (p_work,p_work,c.configuration_fingerprint,c.parent_fingerprint)
   or parent.configuration_fingerprint is distinct from r.parent_fingerprint
   or parent.configuration_fingerprint is distinct from private.institutional_config_hash(parent.configuration)
   then reason:='contribution_parent_mismatch';exit;end if;
  select * into m from public.agent_messages where organization_id=p_org and id=r.message_id;
  select b.binding into binding from private.institutional_information_request_bindings b where b.organization_id=p_org and b.information_request_id=r.request_id;
  if m.id is null or (m.intake_session_id,m.created_by,m.role::text) is distinct from (r.intake_session_id,r.author_id,'user')
   or c.answer_message_id is distinct from r.message_id or binding is distinct from r.binding
   or encode(extensions.digest(convert_to(trim(m.content),'utf8'),'sha256'),'hex') is distinct from r.response_fingerprint
   or r.binding->>'expectedConfigurationFingerprint' is distinct from r.parent_fingerprint
   or (r.binding->>'assumptionId',r.binding->>'period',r.binding->>'unit') is distinct from (r.assumption_id,r.period,r.unit)
   or (c.answer_evidence->>'requestId',c.answer_evidence->>'messageId',c.answer_evidence->>'answeredBy',c.answer_evidence->>'responseFingerprint',c.answer_evidence->>'canonicalValue',c.answer_evidence->>'priorValue',c.answer_evidence->>'assumptionId',c.answer_evidence->>'period',c.answer_evidence->>'unit')
    is distinct from (r.request_id::text,r.message_id::text,r.author_id::text,r.response_fingerprint,r.canonical_value,r.prior_value,r.assumption_id,r.period,r.unit)
   or (r.answer_ref->>'messageId',r.answer_ref->>'answeredBy',r.answer_ref->>'responseFingerprint',r.answer_ref->>'answeredAt')
    is distinct from (r.message_id::text,r.author_id::text,r.response_fingerprint,c.answer_evidence->>'answeredAt')
   or not exists(select 1 from public.document_intake_sessions s where (s.organization_id,s.id,s.capital_project_id)=(p_org,r.intake_session_id,p_work))
   or not exists(select 1 from public.capital_project_information_requests q where (q.organization_id,q.id,q.capital_project_id)=(p_org,r.request_id,p_work))
   then reason:='contribution_evidence_mismatch';exit;end if;
  application:=jsonb_build_object('status','review_required','willExecute',false,'patchId','information-response:'||r.message_id::text,
   'expectedConfigurationFingerprint',r.parent_fingerprint,'nextConfigurationFingerprint',r.candidate_fingerprint,
   'nextConfiguration',c.configuration,'answerEvidence',c.answer_evidence);
  if private.institutional_config_hash(application) is distinct from r.application_fingerprint then reason:='contribution_application_mismatch';exit;end if;
  nodes:=nodes||jsonb_build_array(jsonb_build_object('kind','contribution','configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint,
   'receiptId',r.id,'applicationFingerprint',r.application_fingerprint,'parentConfigurationId',parent.id,'parentFingerprint',r.parent_fingerprint));
  current_id:=parent.id;
 end loop;
 -- Never expose a partial chain as proof, including when the fixed traversal limit is reached.
 return jsonb_build_object('state','unresolved','reason',coalesce(reason,'depth_limit'),'authorization','not_evaluated');
end $$;


create function private.institutional_result_requires_native_v1(p_org uuid,p_result uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.institutional_input_snapshots where organization_id=p_org and result_id=p_result);
$$;
revoke all on function private.institutional_result_requires_native_v1(uuid,uuid) from public,anon,authenticated,service_role;

-- Stage 20: institutional native review only. No historical approval or public publication.
create function private.institutional_native_result_content_v1(p_org uuid,p_result uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare b private.institutional_native_bindings; payload jsonb; expected jsonb;
begin
 select * into b from private.institutional_native_bindings where organization_id=p_org and result_id=p_result;
 if not found then
  if private.institutional_result_requires_native_v1(p_org,p_result) then raise exception 'institutional_native_proof_missing' using errcode='42501';end if;
  return null;end if;
 if not private.institutional_native_read_allowed_v1(p_org,b.revision_id,auth.uid()) then raise exception 'institutional_native_read_denied' using errcode='42501';end if;
 select content->'workbook' into payload from public.artifact_blocks where organization_id=p_org and revision_id=b.revision_id and block_key='workbook';
 payload:=jsonb_set(payload,'{institutional,scenarios}',(select jsonb_agg(content->'scenario' order by block_no) from public.artifact_blocks where organization_id=p_org and revision_id=b.revision_id and block_key like 'scenario:%'));
 select artifact into expected from private.institutional_model_results where organization_id=p_org and id=p_result;
 if payload is null or payload is distinct from expected then raise exception 'institutional_native_content_mismatch' using errcode='23514';end if;
 if not private.institutional_native_read_allowed_v1(p_org,b.revision_id,auth.uid()) then raise exception 'institutional_native_read_denied' using errcode='42501';end if;
 return jsonb_build_object('revisionId',b.revision_id,'artifact',payload);
end $$;
revoke all on function private.institutional_native_result_content_v1(uuid,uuid) from public,anon,authenticated,service_role;

-- Exact fingerprint lookup for institutional workbooks copied into historical material packages.
-- No binding is a legacy outcome; denied or ambiguous binding never falls back to legacy.
create function private.read_institutional_workbook_binding_v1(p_work uuid,p_fingerprint text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare org uuid; matches uuid[]; payload jsonb;
begin
 perform private.require_resource_access_v1(p_work,'read');
 select organization_id into org from public.capital_projects where id=p_work;
 if org is null then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 select array_agg(b.result_id) into matches from private.institutional_native_bindings b
 join private.institutional_model_results r on (r.organization_id,r.id)=(b.organization_id,b.result_id)
 where b.organization_id=org and b.work_id=p_work and r.artifact->>'fingerprint'=p_fingerprint;
 if exists(select 1 from private.institutional_model_results r where r.organization_id=org and r.capital_project_id=p_work
  and r.artifact->>'fingerprint'=p_fingerprint and private.institutional_result_requires_native_v1(org,r.id)
  and not exists(select 1 from private.institutional_native_bindings b where (b.organization_id,b.result_id)=(org,r.id)))
 then raise exception 'institutional_native_proof_missing' using errcode='42501';end if;
 if coalesce(cardinality(matches),0)=0 then return jsonb_build_object('state','legacy');end if;
 if cardinality(matches)<>1 then raise exception 'institutional_native_binding_ambiguous' using errcode='42501';end if;
 payload:=private.institutional_native_result_content_v1(org,matches[1]);
 return jsonb_build_object('state','native','resultId',matches[1],'revisionId',payload->'revisionId');
end $$;
create function public.read_institutional_workbook_binding_v1(p_work uuid,p_fingerprint text) returns jsonb
language sql security invoker set search_path='' as $$select private.read_institutional_workbook_binding_v1(p_work,p_fingerprint);$$;
revoke all on function private.read_institutional_workbook_binding_v1(uuid,text),public.read_institutional_workbook_binding_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.read_institutional_workbook_binding_v1(uuid,text),public.read_institutional_workbook_binding_v1(uuid,text) to authenticated;


create function private.institutional_revision_missing_native_v1(p_org uuid,p_revision uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(with recursive ancestry(id) as (select p_revision union select l.derived_from_revision_id from ancestry a
  join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision')
  select 1 from ancestry a join public.artifact_revisions ar on ar.organization_id=p_org and ar.id=a.id
  join private.institutional_model_results ir on ir.organization_id=p_org
   and ir.id::text=coalesce(ar.manifest#>>'{institutionalResult,id}',case when ar.legacy_ref->>'table'='institutional_model_results' then ar.legacy_ref->>'id' end)
  where private.institutional_result_requires_native_v1(p_org,ir.id)
   and not exists(select 1 from private.institutional_native_bindings b where b.organization_id=p_org and b.result_id=ir.id))
;
$$;
revoke all on function private.institutional_revision_missing_native_v1(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.artifact_revision_release_v1(r public.artifact_revisions)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare fps text[]:=array_remove(array[r.manifest_fingerprint,r.content_sha256,r.legacy_ref->>'fingerprint'],null);approved boolean;
begin
 -- Captured but unproved output is never historical fallback, including derivations.
 if private.institutional_revision_missing_native_v1(r.organization_id,r.id) then return 'blocked';end if;
 -- A persisted native binding, including inherited ones, cannot inherit historical approval.
 if exists(with recursive ancestry(id) as (select r.id union select l.derived_from_revision_id from ancestry a
  join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=a.id and l.link_kind='artifact_revision')
  select 1 from ancestry a join private.institutional_native_bindings b on b.organization_id=r.organization_id and b.revision_id=a.id)
 then
  approved:=exists(select 1 from public.artifact_reviews v join public.artifacts a on (a.organization_id,a.id)=(v.organization_id,v.artifact_id)
   where v.organization_id=r.organization_id and v.artifact_id=r.artifact_id and v.revision_id=r.id
    and v.work_id=a.work_id and v.manifest_fingerprint=r.manifest_fingerprint and v.audience=r.audience
    and private.artifact_review_is_active_v1(r.organization_id,v.id));
  return case when approved then 'released' when r.audience='external' then 'blocked' else 'internal' end;
 end if;
 -- The historical counterpart cannot be downloaded as an alternative approved representation.
 if exists(with recursive ancestry(id) as (select r.id union select l.derived_from_revision_id from ancestry a
  join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=a.id and l.link_kind='artifact_revision')
  select 1 from ancestry a join private.institutional_native_bindings b on b.organization_id=r.organization_id and b.ancestor_revision_id=a.id)
 then return 'blocked';end if;
 approved:=exists(select 1 from public.capital_project_artifact_decisions d where d.organization_id=r.organization_id and d.decision='confirm' and d.artifact_fingerprint=any(fps))
  or exists(select 1 from public.deal_state_objects pr cross join unnest(fps) f where pr.organization_id=r.organization_id and pr.object_type='package_review' and pr.status='approved'
   and pr.dependencies @> jsonb_build_array(jsonb_build_object('objectType','material_artifact','objectFingerprint',f)))
  or (jsonb_typeof(r.manifest->'institutionalResult')='object' and exists(select 1 from private.institutional_model_results m
   where m.organization_id=r.organization_id and m.id=(r.manifest#>>'{institutionalResult,id}')::uuid and m.status='completed' and m.superseded_by is null
    and private.institutional_result_established_v1(m.organization_id,m.id)))
  or (jsonb_typeof(r.manifest->'execution')='object' and exists(select 1 from private.execution_result_receipts x
   where x.organization_id=r.organization_id and x.execution_id=(r.manifest#>>'{execution,executionId}')::uuid and x.result_fingerprint=r.manifest#>>'{execution,resultFingerprint}'));
 return case when approved then 'released' when r.audience='external' then 'blocked' else 'internal' end;
end $function$
;

create or replace function private.read_institutional_model_results_v1(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org_id uuid;r private.institutional_model_results;context jsonb;current_id uuid;is_current boolean;job_status text;visible_status text;visible_blockers jsonb;comparison_results jsonb; answer jsonb; native jsonb; item jsonb; safe_comparisons jsonb:='[]'::jsonb;
begin
 perform private.require_resource_access_v1(p_project_id,'read');
 select organization_id into org_id from public.capital_projects where id=p_project_id;
 if org_id is null or not private.can_access_capital_project(org_id,p_project_id) then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 select * into r from private.institutional_model_results x where x.organization_id=org_id and x.capital_project_id=p_project_id and private.institutional_result_established_v1(x.organization_id,x.id) order by x.created_at desc,x.id desc limit 1;
 if r.id is null then return jsonb_build_object('projectId',p_project_id,'latest',null,'comparisonResults','[]'::jsonb);end if;
 if private.institutional_result_requires_native_v1(org_id,r.id) and r.status='completed'
  and not exists(select 1 from private.institutional_native_bindings b where b.organization_id=org_id and b.result_id=r.id) then
  return jsonb_build_object('projectId',p_project_id,'comparisonResults','[]'::jsonb,'latest',jsonb_build_object('id',r.id,'status','blocked',
   'configurationId',r.configuration_id,'configurationFingerprint',r.configuration_fingerprint,'sourceManifestFingerprint',r.source_manifest_fingerprint,
   'artifact',null,'blockers',jsonb_build_array('institutional_native_proof_missing'),'createdAt',r.created_at));
 end if;
 context:=private.institutional_source_context(org_id,r.intake_session_id);
 select id into current_id from private.institutional_model_configurations where organization_id=org_id and capital_project_id=p_project_id and status='approved' order by revision desc limit 1;
 is_current:=coalesce(r.configuration_id=current_id and r.source_manifest_fingerprint=context->>'sourceManifestFingerprint',false);
 select j.status into job_status from public.processing_jobs j where j.organization_id=org_id and j.intake_session_id=r.intake_session_id and j.kind='agent_operation_brief' and j.payload->>'message_id'=r.id::text order by j.created_at desc limit 1;
 visible_status:=case when not is_current then 'stale' when r.status='queued' and (job_status is null or job_status in ('failed','cancelled','poison','succeeded')) then 'blocked' else r.status end;
 visible_blockers:=case when visible_status='blocked' and r.status='queued' then jsonb_build_array(case when job_status is null then 'institutional_result_dispatch_missing' when job_status='succeeded' then 'institutional_result_output_missing' else 'institutional_result_job_'||job_status end) else r.blockers end;
 -- Only completed, still-approved configurations from the same current evidence snapshot.
 -- No stale document snapshot, other project, other tenant, or unfinished result is returned.
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'status','completed','configurationId',h.configuration_id,'configurationFingerprint',h.configuration_fingerprint,'sourceManifestFingerprint',h.source_manifest_fingerprint,'artifact',h.artifact,'blockers',h.blockers,'createdAt',h.created_at) order by h.created_at desc,h.id desc),'[]'::jsonb) into comparison_results
 from (select history.* from private.institutional_model_results history
 join private.institutional_model_configurations c on c.organization_id=history.organization_id and c.capital_project_id=history.capital_project_id and c.id=history.configuration_id and c.configuration_fingerprint=history.configuration_fingerprint and c.status='approved'
 where history.organization_id=org_id and history.capital_project_id=p_project_id and private.institutional_result_established_v1(history.organization_id,history.id)
 and (not private.institutional_result_requires_native_v1(org_id,history.id) or exists(select 1 from private.institutional_native_bindings b where b.organization_id=org_id and b.result_id=history.id))
 and history.intake_session_id=r.intake_session_id and history.status='completed'
 and history.source_manifest_fingerprint=context->>'sourceManifestFingerprint'
 order by history.created_at desc,history.id desc limit 12) h;
 answer:=jsonb_build_object('projectId',p_project_id,'comparisonResults',case when is_current and r.status='completed' then comparison_results else '[]'::jsonb end,'latest',jsonb_build_object('id',r.id,'status',visible_status,'configurationId',r.configuration_id,'configurationFingerprint',r.configuration_fingerprint,'sourceManifestFingerprint',r.source_manifest_fingerprint,'artifact',case when is_current and r.status='completed' then r.artifact else null end,'blockers',visible_blockers,'createdAt',r.created_at));
 if is_current and r.status='completed' then
  native:=private.institutional_native_result_content_v1(org_id,r.id);
  if native is not null then answer:=jsonb_set(answer,'{latest}',(answer->'latest')||jsonb_build_object('artifact',native->'artifact','nativeRevisionId',native->'revisionId'));end if;
  for item in select value from jsonb_array_elements(comparison_results) loop
   native:=private.institutional_native_result_content_v1(org_id,(item->>'id')::uuid);
   if native is not null then item:=item||jsonb_build_object('artifact',native->'artifact','nativeRevisionId',native->'revisionId');end if;
   safe_comparisons:=safe_comparisons||jsonb_build_array(item);
  end loop;
  answer:=jsonb_set(answer,'{comparisonResults}',safe_comparisons);
  -- Re-evaluate all pins after every read and potential wait, including comparison-only sources.
  for item in select value from jsonb_array_elements(safe_comparisons||jsonb_build_array(answer->'latest')) loop
   if item->>'nativeRevisionId' is not null and not private.institutional_native_read_allowed_v1(org_id,(item->>'nativeRevisionId')::uuid,auth.uid())
   then raise exception 'institutional_native_read_denied' using errcode='42501';end if;
  end loop;
 end if;
 return answer;
end $function$
;

create or replace function private.review_artifact_revision_v1(
 p_revision_id uuid,p_expected_fingerprint text,p_act text,p_block_id uuid,p_note text,
 p_self_approval_declared boolean,p_command_id uuid,p_basis_review_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.artifact_revisions;a public.artifacts;org uuid;
 policy jsonb;mode text;preparer uuid;block_key_value text;basis public.artifact_reviews;existing public.artifact_reviews;
 change jsonb;review_id uuid;has_substance boolean;
begin
 select * into r from public.artifact_revisions where id=p_revision_id;
 select * into a from public.artifacts where organization_id=r.organization_id and id=r.artifact_id;
 org:=private.lock_review_work_v1(a.work_id);
 if org is distinct from r.organization_id then raise exception 'review_work_access_required' using errcode='42501'; end if;
 if p_expected_fingerprint is distinct from r.manifest_fingerprint then raise exception 'artifact_review_stale' using errcode='22023'; end if;
 if p_act is null or p_act not in ('comment','return','approve','reaffirm','revoke_approval') or p_command_id is null
  or p_self_approval_declared is null or (p_note is not null and length(btrim(p_note)) not between 1 and 5000)
 then raise exception 'artifact_review_invalid' using errcode='22023'; end if;
 -- All content-bearing acts, including comments, require the complete inherited source closure.
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501'; end if;
 if p_block_id is not null then
  select b.block_key into block_key_value from public.artifact_blocks b where b.organization_id=org and b.revision_id=r.id and b.id=p_block_id;
  if not found or p_act not in ('comment','return') then raise exception 'review_block_act_invalid' using errcode='22023'; end if;
 end if;
 policy:=private.review_policy_snapshot_v1(org,a.work_id,actor);
 mode:=case when (policy->>'assignmentRequired')::boolean then 'assigned' when (policy->>'selfApprovalAllowed')::boolean then 'individual' else 'open' end;
 preparer:=private.artifact_review_preparer_v1(r);
 if (policy->>'assignmentRequired')::boolean and p_act<>'comment' and not (
  (p_act in ('approve','reaffirm','revoke_approval') and policy->'roles' ? 'approver')
  or (p_act='return' and (policy->'roles' ? 'reviewer' or policy->'roles' ? 'approver')))
 then raise exception 'review_assignment_required' using errcode='42501'; end if;
 if p_act in ('approve','reaffirm') then
  has_substance:=jsonb_array_length(r.manifest->'sources')>0 or jsonb_typeof(r.manifest->'execution')='object'
   or jsonb_typeof(r.manifest->'institutionalResult')='object'
   or exists(select 1 from public.artifact_blocks b where b.organization_id=org and b.revision_id=r.id and jsonb_array_length(b.claims)>0)
   or (a.kind='answer' and exists(select 1 from public.artifact_blocks b where b.organization_id=org and b.revision_id=r.id)
    and not exists(select 1 from public.artifact_blocks b where b.organization_id=org and b.revision_id=r.id
     and (b.kind not in ('section','paragraph') or jsonb_array_length(b.claims)>0 or private.artifact_content_carries_number_v1(b.content))));
  if not has_substance then raise exception 'review_substance_required' using errcode='23514'; end if;
  if preparer=actor and (not (policy->>'selfApprovalAllowed')::boolean or not p_self_approval_declared)
  then raise exception 'capital_project_self_approval_forbidden' using errcode='42501'; end if;
 end if;
 if p_act in ('reaffirm','revoke_approval') then
  select * into basis from public.artifact_reviews where organization_id=org and id=p_basis_review_id;
  if basis.id is null or basis.artifact_id<>r.artifact_id or basis.work_id<>a.work_id or basis.audience<>r.audience or basis.act not in ('approve','reaffirm')
   or (p_act='revoke_approval' and basis.revision_id<>r.id)
   or (p_act='reaffirm' and (basis.revision_id=r.id or not private.artifact_review_is_active_v1(org,basis.id)))
  then raise exception 'artifact_review_basis_invalid' using errcode='22023'; end if;
  if p_act='reaffirm' then
   if not private.artifact_review_sources_allowed_v1(org,basis.revision_id,actor) then raise exception 'review_source_access_required' using errcode='42501'; end if;
   change:=private.artifact_revision_change_v1(basis.revision_id,r.id);
   if change->>'outcome'<>'cosmetic' then raise exception 'artifact_review_material_change' using errcode='22023'; end if;
  end if;
 elsif p_basis_review_id is not null then raise exception 'artifact_review_basis_invalid' using errcode='22023'; end if;
 select * into existing from public.artifact_reviews where organization_id=org and work_id=a.work_id and command_id=p_command_id;
 if found then
  if existing.revision_id<>r.id or existing.manifest_fingerprint<>p_expected_fingerprint or existing.act<>p_act or existing.reviewer_id<>actor
   or existing.block_id is distinct from p_block_id or existing.note is distinct from p_note
   or existing.self_approval_declared<>p_self_approval_declared or existing.basis_review_id is distinct from p_basis_review_id
  then raise exception 'artifact_review_replay_mismatch' using errcode='23505'; end if;
  if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501';end if;
  return jsonb_build_object('reviewId',existing.id,'revisionId',r.id,'act',existing.act,'replayed',true);
 end if;
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501';end if;
 insert into public.artifact_reviews(organization_id,work_id,artifact_id,revision_id,manifest_fingerprint,audience,act,reviewer_id,prepared_by,
  self_approval_declared,review_mode,policy_snapshot,block_id,block_key,basis_review_id,change_report,command_id,note)
 values(org,a.work_id,a.id,r.id,r.manifest_fingerprint,r.audience,p_act,actor,preparer,p_self_approval_declared,mode,policy,p_block_id,block_key_value,p_basis_review_id,change,p_command_id,p_note)
 returning id into review_id;
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501';end if;
 return jsonb_build_object('reviewId',review_id,'revisionId',r.id,'act',p_act,'replayed',false);
end $$;

create or replace function private.read_artifact_revision_reviews_v1(p_revision_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.artifact_revisions;a public.artifacts;org uuid;actor uuid:=auth.uid();history jsonb;policy jsonb;allowed boolean;answer jsonb;
begin
 select * into r from public.artifact_revisions where id=p_revision_id;
 select * into a from public.artifacts where organization_id=r.organization_id and id=r.artifact_id;
 org:=private.lock_review_work_v1(a.work_id);
 allowed:=private.artifact_review_sources_allowed_v1(org,r.id,actor);
 if not allowed then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'act',act,'createdAt',created_at) order by created_at,id),'[]') into history
   from public.artifact_reviews where organization_id=org and revision_id=r.id;
  return jsonb_build_object('revisionId',r.id,'withheld',true,'reviews',history);
 end if;
 policy:=private.review_policy_snapshot_v1(org,a.work_id,actor);
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'target',jsonb_build_object('organizationId',org,'workId',a.work_id,'artifactId',a.id,
  'revisionId',r.id,'manifestFingerprint',v.manifest_fingerprint,'audience',v.audience),
  'act',v.act,'reviewerId',v.reviewer_id,'preparedBy',v.prepared_by,'selfApprovalDeclared',v.self_approval_declared,
  'reviewMode',v.review_mode,'policySnapshot',v.policy_snapshot,
  'block',case when v.block_id is not null then jsonb_build_object('id',v.block_id,'key',v.block_key) end,
  'basisReviewId',v.basis_review_id,'changeReport',v.change_report,'commandId',v.command_id,'note',v.note,'createdAt',v.created_at) order by v.created_at,v.id),'[]') into history
  from public.artifact_reviews v where v.organization_id=org and v.revision_id=r.id;
 answer:=jsonb_build_object('revisionId',r.id,'withheld',false,'reviews',history,'snapshot',private.artifact_review_snapshot_v1(org,r.id),
  'artifact',jsonb_build_object('id',a.id,'workId',a.work_id,'kind',a.kind,'subject',a.subject,'headRevisionId',a.head_revision_id),
  'isHead',a.head_revision_id=r.id,'policy',policy,'preparedBy',private.artifact_review_preparer_v1(r),'freshness',private.artifact_revision_freshness_v1(r),
  'release',private.artifact_revision_release_v1(r));
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then return jsonb_build_object('revisionId',r.id,'withheld',true,'reviews','[]'::jsonb);end if;
 return answer;
end $$;

create or replace function private.artifact_review_sources_allowed_v1(p_org uuid, p_revision uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare allowed boolean;
begin
 if private.institutional_revision_missing_native_v1(p_org,p_revision) then return false;end if;
 -- PL/pgSQL establishes sequencing; a SQL AND does not order authority checks.
 if not private.institutional_native_read_allowed_v1(p_org,p_revision,p_actor) then return false;end if;
 if exists(select 1 from private.institutional_native_ancestry_v1(p_org,p_revision))
  and not exists(select 1 from public.artifact_revisions r join public.artifacts a on (a.organization_id,a.id)=(r.organization_id,r.artifact_id)
   where r.organization_id=p_org and r.id=p_revision and private.evaluate_resource_policy_v1(p_org,a.work_id,p_actor,'read','analysis'))
 then return false;end if;
 allowed := (
 with recursive ancestry(revision_id,depth) as (
  select p_revision,0
  union
  select l.derived_from_revision_id,c.depth+1 from ancestry c
   join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=c.revision_id
   where l.link_kind='artifact_revision' and c.depth<64
 )
 select p_actor is not null and exists(select 1 from auth.users u where u.id=p_actor
  and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))
 and not exists(select 1 from ancestry c where not exists(select 1 from public.artifact_revisions r where r.organization_id=p_org and r.id=c.revision_id))
 and not exists(select 1 from ancestry c join public.artifact_revisions r on r.organization_id=p_org and r.id=c.revision_id
  join public.artifacts a on a.organization_id=r.organization_id and a.id=r.artifact_id
  where r.legacy_ref is not null and private.review_basis_receipt_authority_v1(p_org,a.work_id,'artifact_revision',
   jsonb_build_object('artifactRevisionId',r.id,'manifestFingerprint',r.manifest_fingerprint),p_actor)<>'allowed')
 and not exists(select 1 from ancestry c join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=c.revision_id
  where (l.link_kind='source_version' and not private.source_use_allowed_v1(p_org,l.source_version_id,p_actor,'read','analysis'))
   or (c.depth=64 and l.link_kind='artifact_revision' and not exists(select 1 from ancestry visited where visited.revision_id=l.derived_from_revision_id)))
 );
 if not allowed then return false;end if;
 return private.institutional_native_read_allowed_v1(p_org,p_revision,p_actor);
end $function$;
