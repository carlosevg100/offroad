-- Stage 20 / 3D. Prospectively capture setup input; never fabricate historical roots.
set search_path='';
set local lock_timeout='5s';
do $$begin
 if (select md5(prosrc) from pg_proc where oid='private.worker_record_initial_institutional_candidate_v1(uuid,text,uuid,jsonb)'::regprocedure)<>'a534b3ed618a1b868a36cf2482fda612'
 then raise exception 'institutional_setup_capture_baseline_changed';end if;
end $$;
create table private.institutional_setup_input_snapshots (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 job_id uuid not null, work_id uuid not null, intake_session_id uuid not null, submission_id uuid not null,
 subject_id uuid not null references auth.users(id),
 context jsonb not null check(jsonb_typeof(context)='object' and pg_column_size(context)<=16777216),
 context_fingerprint text not null check(context_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(organization_id,job_id), unique(organization_id,submission_id),
 unique(organization_id,submission_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,intake_session_id) references public.document_intake_sessions(organization_id,id),
 foreign key(organization_id,submission_id) references private.institutional_model_setup_submissions(organization_id,id),
 check(context_fingerprint=private.institutional_config_hash(context))
);
create index institutional_setup_snapshot_work_idx on private.institutional_setup_input_snapshots(organization_id,work_id);
create index institutional_setup_snapshot_session_idx on private.institutional_setup_input_snapshots(organization_id,intake_session_id);
create index institutional_setup_snapshot_subject_idx on private.institutional_setup_input_snapshots(subject_id);
create table private.institutional_setup_source_links (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 snapshot_id uuid not null, source_version_id uuid not null, rights_version_id uuid not null,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(organization_id,snapshot_id,source_version_id),
 foreign key(organization_id,snapshot_id) references private.institutional_setup_input_snapshots(organization_id,id),
 foreign key(organization_id,source_version_id,rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id)
);
create index institutional_setup_source_rights_idx on private.institutional_setup_source_links(organization_id,source_version_id,rights_version_id);
create table private.institutional_setup_input_bindings (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 submission_id uuid not null, snapshot_id uuid not null,
 candidate_id uuid,
 foreign key(organization_id,candidate_id) references private.institutional_model_configurations(organization_id,id),
 assessment_fingerprint text not null check(assessment_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(organization_id,submission_id),
 foreign key(organization_id,submission_id,snapshot_id) references private.institutional_setup_input_snapshots(organization_id,submission_id,id)
);
create index institutional_setup_binding_snapshot_idx on private.institutional_setup_input_bindings(organization_id,snapshot_id);

-- No client role can read raw financial context or manufacture a snapshot/binding.
do $$declare t text;begin
 foreach t in array array['institutional_setup_input_snapshots','institutional_setup_source_links','institutional_setup_input_bindings'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create policy %I on private.%I as restrictive for select to anon,authenticated using(false)',t||'_deny_select',t);
  execute format('create policy %I on private.%I as restrictive for insert to anon,authenticated with check(false)',t||'_deny_insert',t);
  execute format('create policy %I on private.%I as restrictive for update to anon,authenticated using(false) with check(false)',t||'_deny_update',t);
  execute format('create policy %I on private.%I as restrictive for delete to anon,authenticated using(false)',t||'_deny_delete',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',t||'_immutable',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
  execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated',t);
  execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end $$;


create unique index institutional_setup_binding_candidate_idx on private.institutional_setup_input_bindings(organization_id,candidate_id) where candidate_id is not null;
create function private.institutional_setup_snapshot_authorized_v1(p_snapshot uuid,p_job uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare s private.institutional_setup_input_snapshots; j public.processing_jobs;begin
 select * into s from private.institutional_setup_input_snapshots where id=p_snapshot;
 select * into j from public.processing_jobs where id=p_job;
 if s.id is null or j.id is null or (s.organization_id,s.job_id,s.intake_session_id,s.subject_id,s.submission_id::text)
 is distinct from (j.organization_id,j.id,j.intake_session_id,j.authorization_subject_id,j.payload->>'message_id')
 or s.work_id is distinct from (select capital_project_id from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id)
 then return false;end if;
 return not exists (
  select 1 from private.institutional_setup_source_links l
  join private.source_rights_versions r on (r.organization_id,r.source_version_id,r.id)=(l.organization_id,l.source_version_id,l.rights_version_id)
  where l.organization_id=s.organization_id and l.snapshot_id=s.id and (
    not (array['read','process','store','derive']::text[] <@ r.operations) or not ('analysis'=any(r.purposes))
    or r.valid_from>clock_timestamp() or (r.expires_at is not null and r.expires_at<=clock_timestamp())
    or (r.store_until is not null and r.store_until<=clock_timestamp())
    or exists(select 1 from unnest(array['read','process','store','derive']) operation
      where not private.source_use_allowed_v1(s.organization_id,l.source_version_id,s.subject_id,operation,'analysis'))
  ));
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
 select configuration_fingerprint into parent from private.institutional_model_configurations where organization_id=s.organization_id and capital_project_id=s.capital_project_id and status='approved' order by revision desc limit 1;
 select coalesce(max(revision),0)+1 into next_revision from private.institutional_model_configurations where organization_id=s.organization_id and capital_project_id=s.capital_project_id;
 receipt:=jsonb_build_object('kind','initial_configuration','submissionId',s.id,'sourceManifestFingerprint',s.source_manifest_fingerprint,'sourceBindings',s.source_reviews,'lineage',p_candidate->'lineage','inputFingerprint',p_candidate->>'inputFingerprint','resultFingerprint',p_candidate->>'resultFingerprint','review',p_candidate->'review','submittedBy',s.submitted_by,'submittedAt',s.submitted_at);
 insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_message_id,answer_evidence) values(s.organization_id,s.capital_project_id,next_revision,expected,private.institutional_config_hash(expected),parent,'review_required',s.id,receipt) returning id into v_candidate_id;
 update private.institutional_model_setup_submissions set status='review_required',candidate_id=v_candidate_id,assessment=p_candidate where organization_id=s.organization_id and id=s.id;
 return jsonb_build_object('candidateId',v_candidate_id,'revision',next_revision,'replayed',false);
end $$;


create function private.worker_load_institutional_model_context_v3(p_job_id uuid,p_capability_token text)
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

create or replace function private.worker_record_initial_institutional_candidate_v1(p_job_id uuid,p_capability_token text,p_submission_id uuid,p_candidate jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 -- Guard also runs under the submission lock in the private core, closing the v1/v2 race.
 return private.persist_initial_institutional_candidate_v1(p_job_id,p_capability_token,p_submission_id,p_candidate,null);
end $$;

create function private.worker_record_initial_institutional_candidate_v2(p_job_id uuid,p_capability_token text,p_submission_id uuid,p_candidate jsonb,p_input_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs; s private.institutional_model_setup_submissions; x private.institutional_setup_input_snapshots;
 b private.institutional_setup_input_bindings; result jsonb; fingerprint text;
begin
 j:=private.institutional_job_for_capture_v1(p_job_id,p_capability_token);
 if j.payload->>'message_id' is distinct from p_submission_id::text then raise exception 'institutional_setup_job_mismatch' using errcode='42501';end if;
 select * into s from private.institutional_model_setup_submissions where organization_id=j.organization_id and intake_session_id=j.intake_session_id and id=p_submission_id for update nowait;
 select * into x from private.institutional_setup_input_snapshots where organization_id=j.organization_id and submission_id=s.id and job_id=j.id;
 if x.id is null or coalesce(jsonb_typeof(p_input_snapshot),'null')<>'object'
  or p_input_snapshot is distinct from jsonb_build_object('id',x.id,'fingerprint',x.context_fingerprint)
  or x.context#>'{pendingSetup,configuration}' is distinct from s.configuration
  or x.context#>'{pendingSetup,sourceReviews}' is distinct from s.source_reviews
  or x.context#>>'{pendingSetup,sourceManifestFingerprint}' is distinct from s.source_manifest_fingerprint
  then raise exception 'institutional_setup_snapshot_unbound' using errcode='42501';end if;
 if not private.institutional_setup_snapshot_authorized_v1(x.id,j.id) then raise exception 'institutional_setup_capture_rights_revoked' using errcode='42501';end if;
 fingerprint:=private.institutional_config_hash(p_candidate);
 select * into b from private.institutional_setup_input_bindings where organization_id=j.organization_id and submission_id=s.id;
 if b.id is not null and (b.snapshot_id is distinct from x.id or b.assessment_fingerprint is distinct from fingerprint)
  then raise exception 'institutional_setup_snapshot_replay_mismatch';end if;
 -- Never bind an assessment made by an older writer after the fact.
 if s.assessment is not null and b.id is null then raise exception 'institutional_setup_late_binding_denied';end if;
 result:=private.persist_initial_institutional_candidate_v1(p_job_id,p_capability_token,p_submission_id,p_candidate,x.id);
 if b.id is null then
  insert into private.institutional_setup_input_bindings(organization_id,submission_id,snapshot_id,candidate_id,assessment_fingerprint)
   values(j.organization_id,s.id,x.id,nullif(result->>'candidateId','')::uuid,fingerprint);
 end if;
 if j.lease_expires_at<=clock_timestamp() or not private.institutional_setup_snapshot_authorized_v1(x.id,j.id)
  then raise exception 'institutional_setup_capture_rights_revoked' using errcode='42501';end if;
 return result;
exception when lock_not_available then raise exception 'institutional_capture_retry' using errcode='40001';
end $$;

-- Internal integrity classifier, NOT an authorization predicate or closure/release receipt.
-- Consumers must separately authorize the current subject and source rights before disclosure/use.
create function private.institutional_configuration_capture_state_v1(p_org uuid,p_configuration uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c private.institutional_model_configurations;s private.institutional_model_setup_submissions;
 x private.institutional_setup_input_snapshots;b private.institutional_setup_input_bindings;
begin
 select * into c from private.institutional_model_configurations where organization_id=p_org and id=p_configuration;
 if c.id is null then return jsonb_build_object('state','unresolved','reason','configuration_missing');end if;
 if c.answer_evidence->>'kind' is distinct from 'initial_configuration' then return jsonb_build_object('state','unresolved','reason','contribution_lineage_unclassified');end if;
 if c.parent_fingerprint is not null then return jsonb_build_object('state','unresolved','reason','parent_lineage_unclassified');end if;
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
 return jsonb_build_object('state','captured_root','snapshotId',x.id,'contextFingerprint',x.context_fingerprint,'configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint);
end $$;

create function public.worker_load_institutional_model_context_v3(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_institutional_model_context_v3(p_job_id,p_capability_token);$$;
create function public.worker_record_initial_institutional_candidate_v2(p_job_id uuid,p_capability_token text,p_submission_id uuid,p_candidate jsonb,p_input_snapshot jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_initial_institutional_candidate_v2(p_job_id,p_capability_token,p_submission_id,p_candidate,p_input_snapshot);$$;
revoke all on function private.persist_initial_institutional_candidate_v1(uuid,text,uuid,jsonb,uuid),private.institutional_setup_snapshot_authorized_v1(uuid,uuid),private.institutional_configuration_capture_state_v1(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.worker_load_institutional_model_context_v3(uuid,text),public.worker_load_institutional_model_context_v3(uuid,text),private.worker_record_initial_institutional_candidate_v2(uuid,text,uuid,jsonb,jsonb),public.worker_record_initial_institutional_candidate_v2(uuid,text,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_institutional_model_context_v3(uuid,text),public.worker_load_institutional_model_context_v3(uuid,text),private.worker_record_initial_institutional_candidate_v2(uuid,text,uuid,jsonb,jsonb),public.worker_record_initial_institutional_candidate_v2(uuid,text,uuid,jsonb,jsonb) to authenticated;
do $$declare body text;needle text:='begin
 if exists(select 1 from private.institutional_input_snapshots';begin
 body:=pg_get_functiondef('private.worker_load_institutional_model_context_v1(uuid,text)'::regprocedure);
 if length(body)-length(replace(body,needle,''))<>length(needle) then raise exception 'institutional_setup_loader_contract_changed';end if;
 execute replace(body,needle,'begin
 if exists(select 1 from private.institutional_setup_input_snapshots where organization_id=j.organization_id and (job_id=j.id or submission_id::text=j.payload->>''message_id'')) then raise exception ''institutional_setup_snapshot_requires_v3'' using errcode=''42501'';end if;
 if exists(select 1 from private.institutional_input_snapshots');
end $$;
do $$declare body text;needle text:='"institutional-input-snapshot.v1"]''::jsonb';begin
 body:=pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure);
 if length(body)-length(replace(body,needle,''))<>length(needle) then raise exception 'institutional_setup_runtime_contract_changed';end if;
 execute replace(body,needle,'"institutional-input-snapshot.v1","institutional-setup-input-snapshot.v1"]''::jsonb');
end $$;
comment on table private.institutional_setup_input_snapshots is 'Prospective setup loader capture, not a reconstructed historical source closure. Immutable context and pinned rights.';
comment on function private.institutional_configuration_capture_state_v1(uuid,uuid) is 'Private integrity classifier only. captured_root does not authorize access, attest current rights, approve a model, close contributions/imports or release an artifact.';
