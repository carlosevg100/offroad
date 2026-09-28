-- Stage 20 / 3C. Capture exactly what the authorized institutional loader delivered.
-- This is NOT a source-closure receipt: contribution/import ancestry is still unproven.
-- v1 stays available for uncaptured jobs only; v2 never reconstructs history at commit.
set search_path='';
set local lock_timeout='5s';
do $$begin
 if (select md5(prosrc) from pg_proc where oid='private.worker_record_institutional_model_result_v1(uuid,text,jsonb)'::regprocedure)<>'d9d05ebcc794f89c4d7f57081c2d764f'
 or (select md5(prosrc) from pg_proc where oid='private.worker_load_institutional_model_context_v1(uuid,text)'::regprocedure)<>'f3fe91ed2a73537cd8c986138f3b7017'
 then raise exception 'institutional_capture_baseline_changed';end if;
end $$;

create table private.institutional_input_snapshots (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 job_id uuid not null, work_id uuid not null, intake_session_id uuid not null, result_id uuid not null,
 subject_id uuid not null references auth.users(id),
 context jsonb not null check(jsonb_typeof(context)='object' and pg_column_size(context)<=16777216),
 context_fingerprint text not null check(context_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(organization_id,job_id), unique(organization_id,result_id),
 unique(organization_id,result_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,intake_session_id) references public.document_intake_sessions(organization_id,id),
 foreign key(organization_id,result_id) references private.institutional_model_results(organization_id,id),
 check(context_fingerprint=private.institutional_config_hash(context))
);
create index institutional_snapshot_work_idx on private.institutional_input_snapshots(organization_id,work_id);
create index institutional_snapshot_session_idx on private.institutional_input_snapshots(organization_id,intake_session_id);
create index institutional_snapshot_subject_idx on private.institutional_input_snapshots(subject_id);
create table private.institutional_input_source_links (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 snapshot_id uuid not null, source_version_id uuid not null, rights_version_id uuid not null,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(organization_id,snapshot_id,source_version_id),
 foreign key(organization_id,snapshot_id) references private.institutional_input_snapshots(organization_id,id),
 foreign key(organization_id,source_version_id,rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id)
);
create index institutional_input_source_rights_idx on private.institutional_input_source_links(organization_id,source_version_id,rights_version_id);
create table private.institutional_result_input_bindings (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 result_id uuid not null, snapshot_id uuid not null,
 result_fingerprint text not null check(result_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(organization_id,result_id),
 foreign key(organization_id,result_id,snapshot_id) references private.institutional_input_snapshots(organization_id,result_id,id)
);
create index institutional_result_snapshot_idx on private.institutional_result_input_bindings(organization_id,snapshot_id);

-- No client role can read raw financial context or manufacture a snapshot/binding.
do $$declare t text;begin
 foreach t in array array['institutional_input_snapshots','institutional_input_source_links','institutional_result_input_bindings'] loop
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

-- Narrow lock ordering for institutional v2. Old consumers are deliberately untouched.
-- Human commands take project before policy: NOWAIT prevents the opposite order from deadlocking.
create function private.institutional_job_for_capture_v1(p_job uuid,p_capability text)
returns public.processing_jobs language plpgsql security definer set search_path='' as $$
declare initial public.processing_jobs; j public.processing_jobs; subject uuid; project uuid;begin
 select * into initial from public.processing_jobs where id=p_job;
 if initial.id is null or initial.kind<>'agent_operation_brief' or auth.uid() is null
 or initial.leased_account_user_id is distinct from auth.uid() or initial.authorization_subject_id is null
 or p_capability is null or length(p_capability)<32
 or initial.capability_sha256 is distinct from extensions.digest(p_capability,'sha256')
 then raise exception 'institutional_capture_denied' using errcode='42501';end if;
 for subject in select distinct x from unnest(array[auth.uid(),initial.authorization_subject_id]) x order by x loop
  perform 1 from auth.users where id=subject and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
  if not found then raise exception 'institutional_capture_denied' using errcode='42501';end if;
 end loop;
 perform 1 from private.worker_tokens where id=initial.leased_by and status='active' and revoked_at is null for share;
 if not found then raise exception 'institutional_capture_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||initial.organization_id::text,0));
 begin
  select capital_project_id into project from public.document_intake_sessions
   where organization_id=initial.organization_id and id=initial.intake_session_id for update nowait;
  perform 1 from public.capital_projects where organization_id=initial.organization_id and id=project for update nowait;
  if not found then raise exception 'institutional_capture_denied' using errcode='42501';end if;
  perform 1 from public.processing_jobs where id=p_job for update nowait;
 exception when lock_not_available then raise exception 'institutional_capture_retry' using errcode='40001';end;
 j:=private.job_for_capability(p_job,p_capability);
 if (j.organization_id,j.intake_session_id,j.authorization_subject_id,j.leased_by,j.leased_account_user_id,j.payload->>'message_id')
 is distinct from (initial.organization_id,initial.intake_session_id,initial.authorization_subject_id,initial.leased_by,initial.leased_account_user_id,initial.payload->>'message_id')
 or j.lease_expires_at<=clock_timestamp() or not private.job_authority_is_current_v1(j.id)
 then raise exception 'institutional_capture_denied' using errcode='42501';end if;
 return j;
end $$;

create function private.institutional_snapshot_authorized_v1(p_snapshot uuid,p_job uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare s private.institutional_input_snapshots; j public.processing_jobs;begin
 select * into s from private.institutional_input_snapshots where id=p_snapshot;
 select * into j from public.processing_jobs where id=p_job;
 if s.id is null or j.id is null or (s.organization_id,s.job_id,s.intake_session_id,s.subject_id,s.result_id::text)
 is distinct from (j.organization_id,j.id,j.intake_session_id,j.authorization_subject_id,j.payload->>'message_id')
 or s.work_id is distinct from (select capital_project_id from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id)
 then return false;end if;
 return not exists (
  select 1 from private.institutional_input_source_links l
  join private.source_rights_versions r on (r.organization_id,r.source_version_id,r.id)=(l.organization_id,l.source_version_id,l.rights_version_id)
  where l.organization_id=s.organization_id and l.snapshot_id=s.id and (
    not (array['read','process','store','derive']::text[] <@ r.operations) or not ('analysis'=any(r.purposes))
    or r.valid_from>clock_timestamp() or (r.expires_at is not null and r.expires_at<=clock_timestamp())
    or (r.store_until is not null and r.store_until<=clock_timestamp())
    or exists(select 1 from unnest(array['read','process','store','derive']) operation
      where not private.source_use_allowed_v1(s.organization_id,l.source_version_id,s.subject_id,operation,'analysis'))
  ));
end $$;

create function private.worker_load_institutional_model_context_v2(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs; s private.institutional_input_snapshots; r private.institutional_model_results;
 body jsonb; source jsonb; version_id uuid; rights_id uuid;begin
 -- Setup/case-analysis is unchanged. This preliminary read exposes nothing to the caller.
 select * into j from public.processing_jobs where id=p_job_id;
 select * into r from private.institutional_model_results where organization_id=j.organization_id
  and intake_session_id=j.intake_session_id and id=nullif(j.payload->>'message_id','')::uuid and j.kind='agent_operation_brief';
 if r.id is null then return private.worker_load_institutional_model_context_v1(p_job_id,p_capability_token);end if;
 j:=private.institutional_job_for_capture_v1(p_job_id,p_capability_token);
 select * into r from private.institutional_model_results where organization_id=j.organization_id and id=r.id for update nowait;
 select * into s from private.institutional_input_snapshots where organization_id=j.organization_id and job_id=j.id;
 if s.id is null then
  -- A completed legacy result cannot acquire a retrospective input record.
  if r.status<>'queued' then return private.worker_load_institutional_model_context_v1(p_job_id,p_capability_token);end if;
  body:=private.worker_load_institutional_model_context_v1(p_job_id,p_capability_token);
  if body#>>'{modelResultRequest,id}' is distinct from r.id::text or body#>>'{modelResultRequest,status}' is distinct from 'queued'
  or body->>'projectId' is distinct from r.capital_project_id::text then raise exception 'institutional_capture_context_unbound';end if;
  insert into private.institutional_input_snapshots(organization_id,job_id,work_id,intake_session_id,result_id,subject_id,context,context_fingerprint)
  values(j.organization_id,j.id,r.capital_project_id,j.intake_session_id,r.id,j.authorization_subject_id,body,private.institutional_config_hash(body)) returning * into s;
  -- Every delivered document counts, including sources consumed by reconciliation but not cited.
  for source in select value from jsonb_array_elements(body->'currentSources') loop
   select id into version_id from public.source_versions where organization_id=j.organization_id
    and id=(source->>'sourceDocument')::uuid and legacy_document_version::text=source->>'version' and declared_sha256=source->>'hash';
   if version_id is null then raise exception 'institutional_capture_source_unbound' using errcode='42501';end if;
   select id into rights_id from private.source_rights_versions where organization_id=j.organization_id and source_version_id=version_id order by revision desc limit 1;
   if rights_id is null then raise exception 'institutional_capture_rights_missing' using errcode='42501';end if;
   insert into private.institutional_input_source_links(organization_id,snapshot_id,source_version_id,rights_version_id)
    values(j.organization_id,s.id,version_id,rights_id);
  end loop;
  if exists(select 1 from jsonb_array_elements(body->'candidates') candidate where not exists(
    select 1 from private.institutional_input_source_links l where l.organization_id=j.organization_id and l.snapshot_id=s.id and l.source_version_id::text=candidate->>'source_document_id'))
  then raise exception 'institutional_capture_candidate_unbound' using errcode='42501';end if;
 end if;
 if not private.institutional_snapshot_authorized_v1(s.id,j.id) then raise exception 'institutional_capture_rights_revoked' using errcode='42501';end if;
 -- The captured input never changes. A terminal request is an envelope over that original body.
 body:=s.context;
 if r.status<>'queued' then body:=jsonb_set(body,'{modelResultRequest}',jsonb_build_object('id',r.id,'configurationId',r.configuration_id,'configurationFingerprint',r.configuration_fingerprint,'sourceManifestFingerprint',r.source_manifest_fingerprint,'status',r.status,'artifact',r.artifact,'blockers',r.blockers));end if;
 if j.lease_expires_at<=clock_timestamp() or not private.institutional_snapshot_authorized_v1(s.id,j.id) then raise exception 'institutional_capture_rights_revoked' using errcode='42501';end if;
 return body||jsonb_build_object('inputSnapshot',jsonb_build_object('id',s.id,'fingerprint',s.context_fingerprint));
exception when lock_not_available then raise exception 'institutional_capture_retry' using errcode='40001';
end $$;

-- Shared financial validator preserved; input guard runs under its result lock.
-- Only the two authenticated wrappers below can enter it; no client EXECUTE grant.
create or replace function private.persist_institutional_model_result_v1(p_job_id uuid, p_capability_token text, p_result jsonb, p_snapshot uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);r private.institutional_model_results;context jsonb;v_artifact jsonb;scenario jsonb;c private.institutional_model_configurations;provenance jsonb;expected jsonb;opening jsonb;revenues jsonb;costs jsonb;taxes jsonb;v_tax_field text;superseded integer:=0;
begin
 if j.kind<>'agent_operation_brief' then raise exception 'institutional_result_capability_required' using errcode='42501';end if;
 select * into r from private.institutional_model_results where organization_id=j.organization_id and intake_session_id=j.intake_session_id and id=nullif(j.payload->>'message_id','')::uuid for update;
 if r.id is null then raise exception 'institutional_result_request_missing' using errcode='42501';end if;
 if exists(select 1 from private.institutional_input_snapshots s where s.organization_id=r.organization_id and s.result_id=r.id
   and (p_snapshot is distinct from s.id or s.job_id is distinct from j.id))
 then raise exception 'institutional_snapshot_requires_v2' using errcode='42501';end if;
 if r.status<>'queued' then
  if p_result->>'status' is distinct from r.status or (r.status='completed' and p_result->'artifact' is distinct from r.artifact) or (r.status='blocked' and p_result->'blockers' is distinct from r.blockers) then raise exception 'institutional_result_replay_mismatch';end if;
  select count(*) into superseded from private.institutional_model_results where organization_id=r.organization_id and superseded_by=r.id;
  return jsonb_build_object('id',r.id,'status',r.status,'replayed',true,'supersededResults',superseded);
 end if;
 perform 1 from public.capital_projects where organization_id=r.organization_id and id=r.capital_project_id for update;
 if p_result->>'status'='blocked' then
  if coalesce(jsonb_typeof(p_result->'blockers'),'null')<>'array' or jsonb_array_length(p_result->'blockers') not between 1 and 100 then raise exception 'institutional_result_blockers_required';end if;
  update private.institutional_model_results set status='blocked',blockers=p_result->'blockers',produced_at=now() where id=r.id;
  return jsonb_build_object('id',r.id,'status','blocked','replayed',false,'supersededResults',0);
 end if;
 context:=private.institutional_source_context(r.organization_id,r.intake_session_id);v_artifact:=p_result->'artifact';
 if p_result->>'status' is distinct from 'completed' or pg_column_size(v_artifact)>8388608 or v_artifact->>'modelKind' is distinct from 'institutional' or v_artifact#>>'{institutional,exportMode}' is distinct from 'approved_snapshot' or coalesce(v_artifact->>'version','') not in ('institutional-workbook-snapshot.v1','institutional-workbook-editable.v2') or v_artifact->>'fingerprint' is distinct from private.institutional_config_hash(v_artifact-'fingerprint') or v_artifact#>>'{institutional,sourceManifestFingerprint}' is distinct from r.source_manifest_fingerprint or r.source_manifest_fingerprint is distinct from context->>'sourceManifestFingerprint' or v_artifact#>>'{institutional,activeScenarioId}' is distinct from r.configuration_id::text or r.configuration_id is distinct from (select id from private.institutional_model_configurations where organization_id=r.organization_id and capital_project_id=r.capital_project_id and status='approved' order by revision desc limit 1) or coalesce(jsonb_typeof(v_artifact#>'{institutional,scenarios}'),'null')<>'array' or jsonb_array_length(v_artifact#>'{institutional,scenarios}') not between 1 and 12 then raise exception 'institutional_result_stale_or_invalid';end if;
 if (select count(distinct x->>'configurationId') from jsonb_array_elements(v_artifact#>'{institutional,scenarios}') x)<>jsonb_array_length(v_artifact#>'{institutional,scenarios}') or not exists(select 1 from jsonb_array_elements(v_artifact#>'{institutional,scenarios}') x where x->>'configurationId'=r.configuration_id::text and x->>'configurationFingerprint'=r.configuration_fingerprint) then raise exception 'institutional_result_scenario_identity_invalid';end if;
 for scenario in select x from jsonb_array_elements(v_artifact#>'{institutional,scenarios}') x loop
  select * into c from private.institutional_model_configurations where organization_id=r.organization_id and capital_project_id=r.capital_project_id and id=(scenario->>'configurationId')::uuid and status='approved';
  if c.id is null or scenario->>'configurationFingerprint' is distinct from c.configuration_fingerprint or scenario->>'revision' is distinct from c.revision::text or scenario->>'reviewedBy' is distinct from c.reviewed_by::text or (scenario->>'reviewedAt')::timestamptz is distinct from c.reviewed_at then raise exception 'institutional_result_configuration_unbound';end if;
  provenance:=private.institutional_configuration_provenance(r.organization_id,c.id);
  if provenance->>'sourceManifestFingerprint' is distinct from r.source_manifest_fingerprint or scenario->'lineage' is distinct from provenance->'lineage' or scenario->'sourceBindings' is distinct from provenance->'sourceBindings' then raise exception 'institutional_result_lineage_unbound';end if;
  select jsonb_object_agg(substr(l->>'targetPath',21),l->'value') into opening from jsonb_array_elements(provenance->'lineage') l where l->>'targetPath' like 'openingBalanceSheet.%';
  opening:=opening||jsonb_build_object('period',c.configuration#>>'{openingBalanceSheet,period}');
  select jsonb_agg(x||jsonb_build_object('baseRevenue',(select l->'value' from jsonb_array_elements(provenance->'lineage') l where l->>'targetPath'='revenueSegments.'||(x->>'id')||'.baseRevenue')) order by ord) into revenues from jsonb_array_elements(c.configuration->'revenueSegments') with ordinality a(x,ord);
  select jsonb_agg(case when x->>'method'='base_and_growth' then x||jsonb_build_object('baseCost',(select l->'value' from jsonb_array_elements(provenance->'lineage') l where l->>'targetPath'='operatingCosts.'||(x->>'id')||'.baseCost')) else x end order by ord) into costs from jsonb_array_elements(c.configuration->'operatingCosts') with ordinality a(x,ord);
  taxes:=c.configuration->'taxes';
  for v_tax_field in select unnest(array['openingTaxLossCarryforward','openingDisallowedInterestCarryforward']) loop taxes:=jsonb_set(taxes,array[v_tax_field],(select l->'value' from jsonb_array_elements(provenance->'lineage') l where l->>'targetPath'='taxes.'||v_tax_field));end loop;
  expected:=c.configuration||jsonb_build_object('openingBalanceSheet',opening,'revenueSegments',revenues,'operatingCosts',costs,'taxes',taxes);
  if scenario->'input' is distinct from expected then raise exception 'institutional_result_economics_unbound';end if;
 end loop;
 update private.institutional_model_results set status='completed',artifact=v_artifact,blockers='[]',produced_at=now() where id=r.id;
 select count(*) into superseded from private.institutional_model_results where organization_id=r.organization_id and superseded_by=r.id;
 return jsonb_build_object('id',r.id,'status','completed','replayed',false,'supersededResults',superseded);
end $function$
;
revoke all on function private.persist_institutional_model_result_v1(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;

create or replace function private.worker_record_institutional_model_result_v1(p_job_id uuid,p_capability_token text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if exists(select 1 from private.institutional_input_snapshots where organization_id=j.organization_id and (job_id=j.id or result_id::text=j.payload->>'message_id'))
 then raise exception 'institutional_snapshot_requires_v2' using errcode='42501';end if;
 return private.persist_institutional_model_result_v1(p_job_id,p_capability_token,p_result,null);
end $$;

create function private.worker_record_institutional_model_result_v2(p_job_id uuid,p_capability_token text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs; s private.institutional_input_snapshots; b private.institutional_result_input_bindings;
 scenario jsonb; captured jsonb; current_config private.institutional_model_configurations; result jsonb; fingerprint text;begin
 j:=private.institutional_job_for_capture_v1(p_job_id,p_capability_token);
 select * into s from private.institutional_input_snapshots where organization_id=j.organization_id and job_id=j.id;
 if s.id is null or p_result#>>'{inputSnapshot,id}' is distinct from s.id::text
 or p_result#>>'{inputSnapshot,fingerprint}' is distinct from s.context_fingerprint
 then raise exception 'institutional_result_snapshot_unbound' using errcode='42501';end if;
 if not private.institutional_snapshot_authorized_v1(s.id,j.id) then raise exception 'institutional_capture_rights_revoked' using errcode='42501';end if;
 if p_result->>'status'='completed' then
  if coalesce(jsonb_typeof(p_result#>'{artifact,institutional,scenarios}'),'null')<>'array' then raise exception 'institutional_snapshot_scenario_unbound';end if;
  -- Each exported configuration must have been delivered. History is not an implicit comparison:
  -- the current worker exports only the latest; another scenario may never be introduced at commit.
  for scenario in select value from jsonb_array_elements(p_result#>'{artifact,institutional,scenarios}') loop
   select value into captured from jsonb_array_elements(s.context->'approvedConfigurations')
    where value->>'id'=scenario->>'configurationId';
   select * into current_config from private.institutional_model_configurations where organization_id=s.organization_id and id=nullif(scenario->>'configurationId','')::uuid;
   if captured is null or captured->>'fingerprint' is distinct from scenario->>'configurationFingerprint'
    or captured->>'revision' is distinct from scenario->>'revision'
    or captured->>'reviewedBy' is distinct from scenario->>'reviewedBy'
    or (captured->>'reviewedAt')::timestamptz is distinct from (scenario->>'reviewedAt')::timestamptz
    or captured->'sourceBindings' is distinct from scenario->'sourceBindings'
    or captured->'configuration' is distinct from current_config.configuration
   then raise exception 'institutional_snapshot_scenario_unbound';end if;
  end loop;
 end if;
 perform 1 from private.institutional_model_results where organization_id=s.organization_id and id=s.result_id for update nowait;
 fingerprint:=private.institutional_config_hash(p_result-'inputSnapshot');
 select * into b from private.institutional_result_input_bindings where organization_id=s.organization_id and result_id=s.result_id;
 if b.id is not null and (b.snapshot_id,b.result_fingerprint) is distinct from (s.id,fingerprint)
 then raise exception 'institutional_result_snapshot_replay_mismatch';end if;
 result:=private.persist_institutional_model_result_v1(p_job_id,p_capability_token,p_result-'inputSnapshot',s.id);
 if b.id is null then
  insert into private.institutional_result_input_bindings(organization_id,result_id,snapshot_id,result_fingerprint)
   values(s.organization_id,s.result_id,s.id,fingerprint);
 end if;
 if j.lease_expires_at<=clock_timestamp() or not private.institutional_snapshot_authorized_v1(s.id,j.id) then raise exception 'institutional_capture_rights_revoked' using errcode='42501';end if;
 return result;
exception when lock_not_available then raise exception 'institutional_capture_retry' using errcode='40001';
end $$;

create function public.worker_load_institutional_model_context_v2(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_institutional_model_context_v2(p_job_id,p_capability_token);$$;
create function public.worker_record_institutional_model_result_v2(p_job_id uuid,p_capability_token text,p_result jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_institutional_model_result_v2(p_job_id,p_capability_token,p_result);$$;
revoke all on function private.institutional_job_for_capture_v1(uuid,text),private.institutional_snapshot_authorized_v1(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.worker_load_institutional_model_context_v2(uuid,text),public.worker_load_institutional_model_context_v2(uuid,text),private.worker_record_institutional_model_result_v2(uuid,text,jsonb),public.worker_record_institutional_model_result_v2(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_institutional_model_context_v2(uuid,text),public.worker_load_institutional_model_context_v2(uuid,text),private.worker_record_institutional_model_result_v2(uuid,text,jsonb),public.worker_record_institutional_model_result_v2(uuid,text,jsonb) to authenticated;

-- Reject the legacy loader as soon as this job has a captured input: no downgrade on retry.
do $$declare body text;needle text:='begin
 if j.kind not in';begin
 body:=pg_get_functiondef('private.worker_load_institutional_model_context_v1(uuid,text)'::regprocedure);
 if length(body)-length(replace(body,needle,''))<>length(needle) then raise exception 'institutional_loader_contract_changed';end if;
 body:=replace(body,needle,'begin
 if exists(select 1 from private.institutional_input_snapshots where organization_id=j.organization_id and (job_id=j.id or result_id::text=j.payload->>''message_id'')) then raise exception ''institutional_snapshot_requires_v2'' using errcode=''42501'';end if;
 if j.kind not in');
 execute body;
end $$;
-- Old images tolerate an extra capability; new images refuse boot until this migration exists.
do $$declare body text;needle text:='"artifact-revision.v1"]''::jsonb';begin
 body:=pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure);
 if length(body)-length(replace(body,needle,''))<>length(needle) then raise exception 'institutional_runtime_contract_changed';end if;
 execute replace(body,needle,'"artifact-revision.v1","institutional-input-snapshot.v1"]''::jsonb');
end $$;
comment on table private.institutional_input_snapshots is 'Exact authorized loader response at first queued result load. Immutable and scoped to job/work/subject. Not a full historical source-closure receipt.';
comment on table private.institutional_result_input_bindings is 'Atomic result-to-input binding for v2 only. Legacy completed results receive no retrospective capture.';
