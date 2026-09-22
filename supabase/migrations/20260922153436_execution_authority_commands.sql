-- Stage 17 / 2B. Closed control plane: no grants, producer, provider egress or client activation.
set search_path='';

create table private.execution_method_profiles (
 id uuid primary key, platform_release_id text not null references private.platform_method_releases(id),
 serialization_version text not null check(serialization_version='offroad-execution-json-utf16-v1'),
 canonical_payload text not null, payload_fingerprint text not null,
 payload jsonb generated always as (private.execution_json_projection_v1(canonical_payload)) stored,
 adapter_source_commit text not null check(adapter_source_commit ~ '^[a-f0-9]{40}$'),
 review_evidence jsonb not null check(jsonb_typeof(review_evidence)='object'),
 created_at timestamptz not null default now(),
 unique(platform_release_id,payload_fingerprint),
 check(payload_fingerprint=encode(extensions.digest(convert_to(canonical_payload,'UTF8'),'sha256'),'hex'))
);
create function private.validate_execution_profile_storage_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare p jsonb:=private.execution_json_projection_v1(new.canonical_payload);r private.platform_method_releases;begin
 select * into strict r from private.platform_method_releases where id=new.platform_release_id;
 if p->>'schemaVersion' is distinct from 'execution-profile.v1'
 or p->>'adapter' is distinct from 'compiled-single-deterministic.v1'
 or p->>'grantsExecution' is distinct from 'false'
 or p#>>'{method,platformReleaseId}' is distinct from r.id
 or p#>>'{method,manifestHash}' is distinct from r.manifest_hash
 or p#>>'{method,baseManifestHash}' is distinct from r.manifest_hash
 or p#>>'{method,methodId}' is distinct from r.method_id
 or p#>>'{method,methodVersion}' is distinct from r.version
 or p#>'{method,houseReleaseId}' is distinct from 'null'::jsonb
 or p->'tools' is distinct from '[]'::jsonb
 or p->'allowedEffects' is distinct from '["read_only"]'::jsonb
 or p#>'{limits,maxCostMicrousd}' is distinct from '0'::jsonb
 or p#>'{limits,maxModelCalls}' is distinct from '0'::jsonb
 or p#>'{originalBudget}' is distinct from r.manifest->'budget'
 or p#>'{limits,maxDurationMs}' is distinct from r.manifest#>'{budget,maxDurationMs}'
 or coalesce((p#>>'{limits,maxDurationMs}')::bigint,0) not between 1 and 9007199254740991
 or p#>'{method,compilerHash}' is distinct from r.manifest#>'{compiler,hash}'
 or p#>'{method,compilerVersion}' is distinct from r.manifest#>'{compiler,version}'
 then raise exception 'execution_profile_release_mismatch' using errcode='23514';end if;
 -- Operator-only storage of a reviewed derivation; a hash is not its own attestation.
 -- The actual adapter/test review is required by deployment, before inserting a profile.
 if new.review_evidence->>'result' is distinct from 'approved'
 or new.review_evidence->>'subjectCommit' is distinct from new.adapter_source_commit
 or coalesce(new.review_evidence->>'reviewer','')=''
 or coalesce(new.review_evidence->>'sourceHash','') !~ '^[a-f0-9]{64}$'
 then raise exception 'execution_profile_review_required' using errcode='23514';end if;
 return new;
end $$;
create trigger execution_method_profiles_validate before insert on private.execution_method_profiles for each row execute function private.validate_execution_profile_storage_v1();
create trigger execution_method_profiles_immutable before update or delete on private.execution_method_profiles for each row execute function private.guard_contribution_immutable_v1();

create table private.execution_control_bindings (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),execution_id uuid not null,
 profile_id uuid not null references private.execution_method_profiles(id),
 unique(organization_id,id),unique(organization_id,execution_id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index execution_control_profile_idx on private.execution_control_bindings(profile_id);
create table private.execution_source_bindings (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),execution_id uuid not null,
 source_version_id uuid not null,resource_id uuid not null,rights_version_id uuid not null,
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 unique(organization_id,id),unique(organization_id,execution_id,source_version_id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 foreign key(organization_id,resource_id) references private.access_resources(organization_id,id),
 foreign key(organization_id,source_version_id,rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index execution_source_resource_idx on private.execution_source_bindings(organization_id,resource_id);
create index execution_source_rights_idx on private.execution_source_bindings(organization_id,source_version_id,rights_version_id);
create table private.execution_basis_bindings (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),execution_id uuid not null,
 assumption_version_id uuid not null,decision_id uuid not null,kind text not null check(kind in ('observation','hypothesis')),
 content_fingerprint text not null check(content_fingerprint ~ '^[a-f0-9]{64}$'),
 unique(organization_id,id),unique(organization_id,execution_id,decision_id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 foreign key(organization_id,assumption_version_id,decision_id) references private.assumption_version_items(organization_id,version_id,decision_id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index execution_basis_version_idx on private.execution_basis_bindings(organization_id,assumption_version_id,decision_id);
create table private.execution_budget_accounts (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),execution_id uuid not null,
 spent_microusd bigint not null default 0 check(spent_microusd between 0 and 9007199254740991),
 reserved_microusd bigint not null default 0 check(reserved_microusd between 0 and 9007199254740991),
 spent_calls bigint not null default 0 check(spent_calls between 0 and 9007199254740991),
 reserved_calls bigint not null default 0 check(reserved_calls between 0 and 9007199254740991),
 active_duration_ms bigint not null default 0 check(active_duration_ms between 0 and 9007199254740991),
 accounted_at timestamptz, lease_id uuid,
 unique(organization_id,id),unique(organization_id,execution_id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table private.execution_operation_receipts (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),execution_id uuid not null,
 operation_id uuid not null,lease_id uuid not null,request_fingerprint text not null check(request_fingerprint ~ '^[a-f0-9]{64}$'),
 tool_id text not null,tool_version text not null,effect text not null check(effect in ('read_only','propose_state','compile_artifact')),
 reserved_microusd bigint not null check(reserved_microusd between 0 and 9007199254740991),
 reserved_calls bigint not null check(reserved_calls between 0 and 9007199254740991),
 state text not null check(state in ('reserved','settled','uncertain')),
 spent_microusd bigint check(spent_microusd between 0 and reserved_microusd),spent_calls bigint check(spent_calls between 0 and reserved_calls),
 result_fingerprint text check(result_fingerprint ~ '^[a-f0-9]{64}$'),
 unique(organization_id,id),unique(organization_id,execution_id,operation_id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 check((state='settled')=(spent_microusd is not null and spent_calls is not null and result_fingerprint is not null)),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table private.execution_result_receipts (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),execution_id uuid not null,
 lease_id uuid not null,contract_fingerprint text not null check(contract_fingerprint ~ '^[a-f0-9]{64}$'),input_fingerprint text not null check(input_fingerprint ~ '^[a-f0-9]{64}$'),
 result_fingerprint text not null,canonical_result text not null,
 result jsonb generated always as(private.execution_json_projection_v1(canonical_result)) stored,
 outcome text not null check(outcome in ('succeeded','partial')),reason text not null check(length(reason) between 1 and 120),
 unique(organization_id,id),unique(organization_id,execution_id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 check(result_fingerprint=encode(extensions.digest(convert_to(canonical_result,'UTF8'),'sha256'),'hex')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

do $$ declare t text;begin
 foreach t in array array['execution_method_profiles','execution_control_bindings','execution_source_bindings','execution_basis_bindings','execution_budget_accounts','execution_operation_receipts','execution_result_receipts'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create policy %I on private.%I for select to public using(false)',t||'_deny_select',t);
  execute format('create policy %I on private.%I for insert to public with check(false)',t||'_deny_insert',t);
  execute format('create policy %I on private.%I for update to public using(false) with check(false)',t||'_deny_update',t);
  execute format('create policy %I on private.%I for delete to public using(false)',t||'_deny_delete',t);
  if t<>'execution_method_profiles' then
   execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated',t);
   execute format('create trigger %I after insert or update on private.%I for each row execute function private.capture_identity_audit_v1()',t||'_audit',t);
   if t not in ('execution_budget_accounts','execution_operation_receipts') then
    execute format('create trigger %I before update or delete on private.%I for each row execute function private.guard_contribution_immutable_v1()',t||'_immutable',t);
   end if;
  end if;
 end loop;
end $$;

alter table public.processing_jobs add column execution_id uuid,add column lease_id uuid;
alter table public.processing_jobs add constraint processing_jobs_execution_fk foreign key(organization_id,execution_id) references public.work_executions(organization_id,id);
create unique index processing_jobs_execution_unique on public.processing_jobs(organization_id,execution_id) where execution_id is not null;
alter table public.processing_jobs drop constraint processing_jobs_kind_check;
alter table public.processing_jobs add constraint processing_jobs_kind_check check(kind in ('document_pipeline','preliminary_analysis','case_analysis','capital_project_analysis','agent_operation_brief','execution_brief_proposal','work_conversation','work_execution'));
alter table public.processing_jobs drop constraint job_intake_by_kind;
alter table public.processing_jobs add constraint job_intake_by_kind check(
 (kind in ('work_conversation','work_execution') and work_id is not null and intake_session_id is null and source_document_id is null and controlled_execution_id is null)
 or (kind not in ('work_conversation','work_execution') and intake_session_id is not null));
alter table public.processing_jobs add constraint job_execution_identity check((kind='work_execution')=(execution_id is not null));
alter table public.processing_runs drop constraint run_work_or_intake;
alter table public.processing_runs add constraint run_work_or_intake check(intake_session_id is not null or(work_id is not null and pipeline_version in ('work-conversation-v1','pinned-work-execution-v1')));

-- No old claim or capability consumer may handle the new kind.
do $$ declare name text;old text;body text;begin
 foreach name in array array['worker_claim_job','worker_claim_job_v2','worker_claim_job_v4'] loop
  select pg_get_functiondef(to_regprocedure('private.'||name||'(text,integer)')) into old;
  body:=replace(old,'where ((status', 'where kind<>''work_execution'' and ((status');
  if body=old then raise exception 'execution_legacy_claim_contract_changed: %',name;end if;execute body;
 end loop;
 select pg_get_functiondef('private.job_for_capability(uuid,text)'::regprocedure) into old;
 body:=replace(old,'where id=p_job_id and status=''leased''','where id=p_job_id and kind<>''work_execution'' and status=''leased''');
 if body=old then raise exception 'execution_legacy_capability_contract_changed';end if;execute body;
 foreach name in array array['bind_job_authority_v1()','job_authority_is_current_v1(uuid)'] loop
  select pg_get_functiondef(to_regprocedure('private.'||name)) into old;
  body:=replace(replace(old,'new.kind=''work_conversation''','new.kind in (''work_conversation'',''work_execution'')'),'j.kind=''work_conversation''','j.kind in (''work_conversation'',''work_execution'')');
  if body=old then raise exception 'execution_authority_contract_changed';end if;execute body;
 end loop;
end $$;

create function private.execution_basis_current_v1(p_org uuid,p_decision uuid,p_subject uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 with selected as (
  select a.*,d.contract_source_version_id,d.contract_rights_version_id,m.dossier_id as definition_dossier,
   o.source_version_id,o.source_rights_version_id,o.dossier_id as observation_dossier,o.entity_id as observation_entity,
   od.contract_source_version_id as observation_definition_source,od.contract_rights_version_id as observation_definition_rights,
   om.dossier_id as observation_definition_dossier
  from public.adoption_decisions a join public.definition_versions d on d.organization_id=a.organization_id and d.id=a.definition_version_id
  join public.metric_definitions m on m.organization_id=d.organization_id and m.id=d.metric_definition_id
  left join public.observations o on o.organization_id=a.organization_id and o.id=a.reference_observation_id
  left join public.definition_versions od on od.organization_id=o.organization_id and od.id=o.definition_version_id
  left join public.metric_definitions om on om.organization_id=od.organization_id and om.id=od.metric_definition_id
  where a.organization_id=p_org and a.id=p_decision
 ), dossiers as (
  select definition_dossier id from selected union select observation_dossier from selected union select observation_definition_dossier from selected
  union select e.origin_dossier_id from selected s join public.entities e on e.id=s.entity_id or e.id=s.observation_entity where e.organization_id is not null
 ), sources as (
  select contract_source_version_id id,contract_rights_version_id rights from selected
  union select source_version_id,source_rights_version_id from selected
  union select observation_definition_source,observation_definition_rights from selected
 )
 select exists(select 1 from selected)
 and not exists(select 1 from dossiers x where x.id is not null and not exists(select 1 from public.dossiers d where d.id=x.id and d.organization_id=p_org
  and private.evaluate_resource_policy_v1(p_org,d.resource_id,p_subject,'read','analysis')))
 and not exists(select 1 from sources x where x.id is not null and not exists(select 1 from private.source_rights_versions r
  where r.organization_id=p_org and r.source_version_id=x.id and r.id=x.rights
  and r.operations @> array['read','process','store','derive'] and 'analysis'=any(r.purposes) and r.valid_from<=clock_timestamp()
  and (r.expires_at is null or r.expires_at>clock_timestamp()) and (r.store_until is null or r.store_until>clock_timestamp())
  and private.source_use_allowed_v1(p_org,x.id,p_subject,'process','analysis')
  and private.source_use_allowed_v1(p_org,x.id,p_subject,'store','analysis')
  and private.source_use_allowed_v1(p_org,x.id,p_subject,'derive','analysis')));
$$;

create function private.execution_inputs_current_v1(p_org uuid,p_execution uuid,p_subject uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select not exists(
  select 1 from private.execution_source_bindings b
  join private.source_rights_versions r on r.organization_id=b.organization_id and r.id=b.rights_version_id
  where b.organization_id=p_org and b.execution_id=p_execution and not(
   r.operations @> array['read','process','store','derive'] and 'analysis'=any(r.purposes) and r.valid_from<=clock_timestamp()
   and (r.expires_at is null or r.expires_at>clock_timestamp()) and (r.store_until is null or r.store_until>clock_timestamp())
   and private.source_use_allowed_v1(p_org,b.source_version_id,p_subject,'process','analysis')
   and private.source_use_allowed_v1(p_org,b.source_version_id,p_subject,'store','analysis')
   and private.source_use_allowed_v1(p_org,b.source_version_id,p_subject,'derive','analysis')
   and private.evaluate_resource_policy_v1(p_org,b.resource_id,p_subject,'read','analysis')
   and exists(select 1 from public.source_bindings s where s.organization_id=p_org and s.source_version_id=b.source_version_id and s.resource_id=b.resource_id and s.revoked_at is null)))
 and not exists(select 1 from private.execution_basis_bindings b
  join public.assumption_versions v on v.organization_id=b.organization_id and v.id=b.assumption_version_id
  join public.assumption_sets s on s.organization_id=v.organization_id and s.id=v.set_id
  where b.organization_id=p_org and b.execution_id=p_execution and not(
   v.content_fingerprint=b.content_fingerprint and s.work_id is not null
   and private.execution_basis_current_v1(p_org,b.decision_id,p_subject)
   and private.evaluate_resource_policy_v1(p_org,s.work_id,p_subject,'read','analysis')));
$$;
-- Existing invalidation sees the new inputs, including their pinned rights. No second graph.
do $$ declare old text;body text;begin
 select pg_get_functiondef('private.job_sources_rights_current_v1(uuid)'::regprocedure) into old;
 body:=replace(old,'create or replace function','CREATE OR REPLACE FUNCTION');
 -- Preserve the legacy predicate under its own name; only this one dispatch point changes.
 body:=replace(body,'private.job_sources_rights_current_v1(', 'private.legacy_job_sources_rights_current_v1(');execute body;
end $$;
create or replace function private.job_sources_rights_current_v1(p_job_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select case when j.kind='work_execution' then private.execution_inputs_current_v1(j.organization_id,j.execution_id,j.authorization_subject_id)
 else private.legacy_job_sources_rights_current_v1(j.id) end from public.processing_jobs j where j.id=p_job_id;
$$;

create function private.execution_policy_fingerprint_v1(p_org uuid,p_work uuid,p_principal uuid,p_revision bigint) returns text
language sql immutable security invoker set search_path='' as $$
 select encode(extensions.digest('execution-authority.v1:'||p_org::text||':'||p_work::text||':'||p_principal::text||':'||p_revision::text,'sha256'),'hex');
$$;
create function private.require_execution_release_v1(p_profile uuid) returns private.execution_method_profiles
language plpgsql security definer set search_path='' as $$
declare p private.execution_method_profiles;r private.platform_method_releases;c private.platform_capability_releases;begin
 select * into p from private.execution_method_profiles where id=p_profile;
 if not found then raise exception 'execution_profile_unavailable' using errcode='42501';end if;
 select * into strict r from private.platform_method_releases where id=p.platform_release_id;
 select * into c from private.platform_capability_releases where capability_key=r.capability_key for share;
 if not found or not c.released or c.exposure<>'universal' or c.method_id<>r.method_id or c.method_version<>r.version
 or not private.platform_method_reference_available_v1(r.id)
 then raise exception 'execution_method_unavailable' using errcode='42501';end if;
 return p;
end $$;

create function private.request_work_execution_v1(p_profile_id uuid,p_contract_text text,p_snapshot_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb:=private.execution_json_projection_v1(p_contract_text);p private.execution_method_profiles;
 w public.capital_projects;human private.principals;rev bigint;policy_hash text;e public.work_executions;
 ex uuid;run_id uuid;request_id uuid;snap uuid;job uuid:=gen_random_uuid();next_no integer;item jsonb;rights uuid;
 digest text:=encode(extensions.digest(convert_to(p_contract_text,'UTF8'),'sha256'),'hex');
 input_hash text:=encode(extensions.digest(convert_to(p_snapshot_text,'UTF8'),'sha256'),'hex');
 version_row public.assumption_versions;decision public.adoption_decisions;array_name text;
begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 select * into w from public.capital_projects where id=(c->>'workId')::uuid;
 if not found then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||w.organization_id::text,0));
 select * into human from private.principals where organization_id=w.organization_id and user_id=auth.uid() and kind='human' and revoked_at is null;
 if not found or not private.evaluate_resource_policy_v1(w.organization_id,w.id,auth.uid(),'work','analysis')
 or w.status='archived' then raise exception 'execution_access_denied' using errcode='42501';end if;
 p:=private.require_execution_release_v1(p_profile_id);
 insert into private.authorization_revisions(organization_id,resource_id,subject_user_id) values(w.organization_id,private.resource_root_v1(w.organization_id,w.id),auth.uid()) on conflict do nothing;
 select revision into strict rev from private.authorization_revisions where organization_id=w.organization_id and resource_id=private.resource_root_v1(w.organization_id,w.id) and subject_user_id=auth.uid() for share;
 policy_hash:=private.execution_policy_fingerprint_v1(w.organization_id,w.id,human.id,rev);
 if c->>'schemaVersion' is distinct from 'execution-contract.v1'
 or c->>'organizationId' is distinct from w.organization_id::text or c->>'principalId' is distinct from human.id::text
 or c->'method' is distinct from p.payload->'method'
 or c->'tools' is distinct from p.payload->'tools' or c->'allowedEffects' is distinct from p.payload->'allowedEffects'
 or c#>>'{inputs,fingerprint}' is distinct from input_hash
 or c#>>'{audience,workId}' is distinct from w.id::text or c#>>'{audience,kind}' is distinct from 'work_participants'
 or c#>>'{audience,policyFingerprint}' is distinct from policy_hash
 or c#>>'{policy,version}' is distinct from 'execution-authority.v1'
 or c#>>'{policy,fingerprint}' is distinct from policy_hash or c#>>'{policy,authorityRevision}' is distinct from rev::text
 or coalesce(length(btrim(c->>'purpose')),0) not between 1 and 8000
 or c#>'{budget,maxCostMicrousd}' is distinct from '0'::jsonb or c#>'{budget,maxModelCalls}' is distinct from '0'::jsonb
 or coalesce((c#>>'{budget,maxDurationMs}')::bigint,0) not between 1 and (p.payload#>>'{limits,maxDurationMs}')::bigint
 or jsonb_typeof(c#>'{inputs,sources}') is distinct from 'array' or jsonb_typeof(c#>'{inputs,adoptions}') is distinct from 'array'
 or jsonb_typeof(c#>'{inputs,hypotheses}') is distinct from 'array'
 then raise exception 'execution_contract_denied' using errcode='42501';end if;
 perform private.execution_json_projection_v1(p_snapshot_text);
 ex:=(c->>'executionId')::uuid;run_id:=(c->>'processingRunId')::uuid;request_id:=(c->>'requestId')::uuid;snap:=(c#>>'{inputs,snapshotId}')::uuid;
 if ex is null or run_id is null or request_id is null or snap is null then raise exception 'execution_identity_required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('execution-request:'||w.organization_id::text||human.id::text||request_id::text,0));
 select * into e from public.work_executions where organization_id=w.organization_id and principal_id=human.id and work_executions.request_id=(c->>'requestId')::uuid;
 if found then
  if not exists(select 1 from private.execution_manifests m join private.execution_control_bindings b on b.organization_id=m.organization_id and b.execution_id=m.execution_id
   where m.execution_id=e.id and m.organization_id=e.organization_id and m.payload_fingerprint=digest and b.profile_id=p_profile_id)
  then raise exception 'execution_request_conflict' using errcode='23505';end if;
  if not private.execution_inputs_current_v1(e.organization_id,e.id,auth.uid()) then raise exception 'execution_inputs_denied' using errcode='42501';end if;
  return jsonb_build_object('executionId',e.id,'replayed',true);
 end if;
 if (c#>>'{budget,expiresAt}')::timestamptz is null or (c->>'requestedAt')::timestamptz is null
 or (c#>>'{budget,expiresAt}')::timestamptz<=clock_timestamp()
 or (c#>>'{budget,expiresAt}')::timestamptz<=(c->>'requestedAt')::timestamptz
 or (c->>'requestedAt')::timestamptz>clock_timestamp()
 then raise exception 'execution_budget_expired' using errcode='22023';end if;
 -- Same work row lock as the existing conversation producer protects run_no allocation.
 perform 1 from public.capital_projects where id=w.id for update;
 select coalesce(max(run_no),0)+1 into next_no from public.processing_runs where organization_id=w.organization_id and work_id=w.id and intake_session_id is null;
 insert into public.processing_runs(id,organization_id,work_id,run_no,trigger,pipeline_version,budget,created_by)
 values(run_id,w.organization_id,w.id,next_no,'manual','pinned-work-execution-v1',c->'budget',auth.uid());
 insert into public.work_executions(id,organization_id,work_id,principal_id,request_id,processing_run_id) values(ex,w.organization_id,w.id,human.id,request_id,run_id);
 insert into private.execution_input_snapshots(id,organization_id,execution_id,serialization_version,canonical_payload,payload_fingerprint)
 values(snap,w.organization_id,ex,'offroad-execution-json-utf16-v1',p_snapshot_text,input_hash);
 insert into private.execution_manifests(id,organization_id,execution_id,snapshot_id,snapshot_fingerprint,platform_release_id,serialization_version,canonical_payload,payload_fingerprint)
 values(gen_random_uuid(),w.organization_id,ex,snap,input_hash,p.platform_release_id,'offroad-execution-json-utf16-v1',p_contract_text,digest);
 insert into private.execution_control_bindings(organization_id,execution_id,profile_id) values(w.organization_id,ex,p_profile_id);
 if jsonb_array_length(c#>'{inputs,sources}')>10000 or jsonb_array_length(c#>'{inputs,adoptions}')>10000 or jsonb_array_length(c#>'{inputs,hypotheses}')>10000 then raise exception 'execution_input_limit' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(c#>'{inputs,sources}') loop
  select r.id into rights from private.source_rights_versions r join public.source_versions v on v.organization_id=r.organization_id and v.id=r.source_version_id
   where r.organization_id=w.organization_id and r.source_version_id=(item->>'sourceVersionId')::uuid and r.revision::text=item->>'rightsRevision'
   and v.declared_sha256=item->>'contentHash';
  if not found then raise exception 'execution_source_pin_denied' using errcode='42501';end if;
  insert into private.execution_source_bindings(organization_id,execution_id,source_version_id,resource_id,rights_version_id,content_hash)
  values(w.organization_id,ex,(item->>'sourceVersionId')::uuid,(item->>'resourceId')::uuid,rights,item->>'contentHash');
 end loop;
 foreach array_name in array array['adoptions','hypotheses'] loop
  for item in select value from jsonb_array_elements(c#>array['inputs',array_name]) loop
   select v.* into version_row from public.assumption_versions v join public.assumption_sets s on s.organization_id=v.organization_id and s.id=v.set_id
   where v.organization_id=w.organization_id and v.id=(item->>'assumptionVersionId')::uuid and s.work_id=w.id and v.content_fingerprint=item->>'fingerprint';
   if not found then raise exception 'execution_basis_pin_denied' using errcode='42501';end if;
   select * into decision from public.adoption_decisions where organization_id=w.organization_id and id=(item->>'id')::uuid and set_id=version_row.set_id
   and kind=case when array_name='hypotheses' then 'hypothesis' else 'observation' end;
   if not found then raise exception 'execution_basis_decision_denied' using errcode='42501';end if;
   insert into private.execution_basis_bindings(organization_id,execution_id,assumption_version_id,decision_id,kind,content_fingerprint)
   values(w.organization_id,ex,version_row.id,decision.id,decision.kind,version_row.content_fingerprint);
  end loop;
 end loop;
 if not private.execution_inputs_current_v1(w.organization_id,ex,auth.uid()) then raise exception 'execution_inputs_denied' using errcode='42501';end if;
 insert into private.execution_budget_accounts(organization_id,execution_id) values(w.organization_id,ex);
 insert into public.processing_jobs(id,organization_id,work_id,processing_run_id,kind,execution_id,payload)
 values(job,w.organization_id,w.id,run_id,'work_execution',ex,jsonb_build_object('executionId',ex));
 return jsonb_build_object('executionId',ex,'jobId',job,'replayed',false);
end $$;

create function private.lock_execution_authority_v1(p_job uuid) returns public.processing_jobs
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;b private.execution_control_bindings;begin
 select * into j from public.processing_jobs where id=p_job and kind='work_execution';
 if not found then raise exception 'execution_authority_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0));
 select * into strict b from private.execution_control_bindings where organization_id=j.organization_id and execution_id=j.execution_id;
 perform private.require_execution_release_v1(b.profile_id);
 -- The existing authority predicate also checks the persisted human/delegated principal.
 perform 1 from private.authorization_revisions where organization_id=j.organization_id and resource_id=j.authorization_resource_id and subject_user_id=j.authorization_subject_id for share;
 select * into strict j from public.processing_jobs where id=p_job for update;
 if not private.job_authority_is_current_v1(j.id) then raise exception 'execution_authority_denied' using errcode='42501';end if;
 if not exists(select 1 from public.work_executions e join public.processing_runs r on r.organization_id=e.organization_id and r.id=e.processing_run_id
 where e.id=j.execution_id and e.organization_id=j.organization_id and e.work_id=j.work_id and e.processing_run_id=j.processing_run_id
 and r.work_id=j.work_id and r.pipeline_version='pinned-work-execution-v1')
 then raise exception 'execution_run_mismatch' using errcode='42501';end if;
 return j;
end $$;
create function private.execution_for_lease_v1(p_job uuid,p_capability text,p_lease uuid,p_allow_completed boolean default false)
returns public.processing_jobs language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;begin
 j:=private.lock_execution_authority_v1(p_job);
 if p_lease is null or p_capability is null or length(p_capability)<32 or auth.uid() is null
 or j.lease_id is distinct from p_lease or j.capability_sha256 is distinct from extensions.digest(p_capability,'sha256')
 or j.leased_account_user_id is distinct from auth.uid()
 or not exists(select 1 from private.worker_tokens where id=j.leased_by and revoked_at is null and status='active')
 or not exists(select 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()))
 or not (j.status='leased' or (p_allow_completed and j.status='succeeded'))
 or j.lease_expires_at is null or j.lease_expires_at<=clock_timestamp()
 then raise exception 'execution_lease_denied' using errcode='42501';end if;
 return j;
end $$;
create function private.account_execution_duration_v1(p_job public.processing_jobs) returns private.execution_budget_accounts
language plpgsql security definer set search_path='' as $$
declare b private.execution_budget_accounts;t timestamptz:=clock_timestamp();until_at timestamptz;delta bigint;begin
 select * into strict b from private.execution_budget_accounts where organization_id=p_job.organization_id and execution_id=p_job.execution_id for update;
 -- Every interval is charged at most once; queue wait after lease expiry is excluded.
 if b.accounted_at is not null and b.lease_id=p_job.lease_id then
  until_at:=least(t,p_job.lease_expires_at);
  delta:=greatest(0,floor(extract(epoch from (until_at-b.accounted_at))*1000)::bigint);
  update private.execution_budget_accounts set active_duration_ms=active_duration_ms+delta,
   accounted_at=b.accounted_at+delta*interval '1 millisecond' where id=b.id returning * into b;
 end if;
 return b;
end $$;
create function private.claim_work_execution_v1(p_worker_token text,p_job_id uuid,p_lease_seconds integer default 60) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;worker uuid;cap text;lease uuid:=gen_random_uuid();m private.execution_manifests;b private.execution_budget_accounts;t timestamptz;begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp())) then raise exception 'worker_account_required' using errcode='42501';end if;
 worker:=private.worker_identity(p_worker_token);
 if not exists(select 1 from private.worker_tokens where id=worker and revoked_at is null) then raise exception 'worker_token_invalid' using errcode='42501';end if;
 j:=private.lock_execution_authority_v1(p_job_id);
 t:=clock_timestamp();
 if not ((j.status='queued' and j.available_at<=t) or (j.status='leased' and j.lease_expires_at<=t)) then return jsonb_build_object('claimed',false);end if;
 b:=private.account_execution_duration_v1(j);
 select * into strict m from private.execution_manifests where organization_id=j.organization_id and execution_id=j.execution_id;
 if j.attempts>=j.max_attempts then raise exception 'execution_attempts_exhausted' using errcode='55000';end if;
 -- Do not release unconfirmed spend when a worker disappeared after transmission.
 update private.execution_operation_receipts set state='uncertain' where organization_id=j.organization_id and execution_id=j.execution_id and state='reserved';
 cap:=encode(extensions.gen_random_bytes(32),'hex');
 update public.processing_jobs set status='leased',attempts=attempts+1,leased_by=worker,leased_account_user_id=auth.uid(),
 lease_id=lease,lease_expires_at=t+make_interval(secs=>least(greatest(coalesce(p_lease_seconds,60),1),3600)),capability_sha256=extensions.digest(cap,'sha256')
 where id=j.id returning * into j;
 update private.execution_budget_accounts set lease_id=lease,accounted_at=t where id=b.id;
 update public.processing_runs set status='running',started_at=coalesce(started_at,t) where organization_id=j.organization_id and id=j.processing_run_id;
 return jsonb_build_object('claimed',true,'jobId',j.id,'leaseId',lease,'capability',cap,'attempt',j.attempts,
 'executionId',j.execution_id,'contractText',m.canonical_payload,'contractFingerprint',m.payload_fingerprint,
 'snapshotText',(select canonical_payload from private.execution_input_snapshots where organization_id=j.organization_id and execution_id=j.execution_id),
 'elapsedDurationMs',b.active_duration_ms,'leaseExpiresAt',j.lease_expires_at,
 'budgetExpired',(m.payload#>>'{budget,expiresAt}')::timestamptz<=clock_timestamp() or b.active_duration_ms>=(m.payload#>>'{budget,maxDurationMs}')::bigint);
end $$;

create function private.reserve_execution_operation_v1(p_job uuid,p_capability text,p_lease uuid,p_operation uuid,p_fingerprint text,p_tool text,p_version text,p_effect text,p_cost bigint,p_calls bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;m private.execution_manifests;b private.execution_budget_accounts;r private.execution_operation_receipts;begin
 j:=private.execution_for_lease_v1(p_job,p_capability,p_lease);
 b:=private.account_execution_duration_v1(j);
 select * into strict m from private.execution_manifests where organization_id=j.organization_id and execution_id=j.execution_id;
 if p_operation is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
 or p_cost is null or p_cost not between 0 and 9007199254740991 or p_calls is null or p_calls not between 0 and 9007199254740991
 then raise exception 'execution_operation_invalid' using errcode='22023';end if;
 -- Only the pinned deterministic kernel is available in this closed increment.
 -- External tools, providers, research and fallback have no transmission receipt here.
 if p_tool is distinct from m.payload#>>'{method,executor,key}' or p_version is distinct from m.payload#>>'{method,executor,version}'
 or p_effect is distinct from 'read_only' or p_cost<>0 or p_calls<>0
 then raise exception 'execution_operation_denied' using errcode='42501';end if;
 select * into r from private.execution_operation_receipts where organization_id=j.organization_id and execution_id=j.execution_id and operation_id=p_operation for update;
 if found then
  if r.request_fingerprint<>p_fingerprint or r.tool_id<>p_tool or r.tool_version<>p_version or r.effect<>p_effect or r.reserved_microusd<>p_cost or r.reserved_calls<>p_calls
  then raise exception 'execution_operation_conflict' using errcode='23505';end if;
  return jsonb_build_object('operationId',r.operation_id,'state',r.state,'replayed',true,'mayExecute',false);
 end if;
 if b.active_duration_ms>=(m.payload#>>'{budget,maxDurationMs}')::bigint or clock_timestamp()>=(m.payload#>>'{budget,expiresAt}')::timestamptz
 or b.spent_microusd+b.reserved_microusd>(m.payload#>>'{budget,maxCostMicrousd}')::bigint-p_cost
 or b.spent_calls+b.reserved_calls>(m.payload#>>'{budget,maxModelCalls}')::bigint-p_calls
 then return jsonb_build_object('state','partial_budget_exhausted','mayExecute',false);end if;
 insert into private.execution_operation_receipts(organization_id,execution_id,operation_id,lease_id,request_fingerprint,tool_id,tool_version,effect,reserved_microusd,reserved_calls,state)
 values(j.organization_id,j.execution_id,p_operation,p_lease,p_fingerprint,p_tool,p_version,p_effect,p_cost,p_calls,'reserved');
 update private.execution_budget_accounts set reserved_microusd=reserved_microusd+p_cost,reserved_calls=reserved_calls+p_calls where id=b.id;
 return jsonb_build_object('operationId',p_operation,'state','reserved','replayed',false,'mayExecute',true);
end $$;
create function private.settle_execution_operation_v1(p_job uuid,p_capability text,p_lease uuid,p_operation uuid,p_fingerprint text,p_result_hash text,p_spent bigint,p_calls bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;b private.execution_budget_accounts;r private.execution_operation_receipts;begin
 j:=private.execution_for_lease_v1(p_job,p_capability,p_lease);
 b:=private.account_execution_duration_v1(j);
 select * into r from private.execution_operation_receipts where organization_id=j.organization_id and execution_id=j.execution_id and operation_id=p_operation for update;
 if not found or r.lease_id is distinct from p_lease then raise exception 'execution_operation_lease_denied' using errcode='42501';end if;
 if r.request_fingerprint is distinct from p_fingerprint or p_result_hash is null or p_result_hash !~ '^[a-f0-9]{64}$'
 or p_spent is null or p_spent not between 0 and r.reserved_microusd or p_calls is null or p_calls not between 0 and r.reserved_calls
 then raise exception 'execution_settlement_invalid' using errcode='22023';end if;
 if r.state='settled' then
  if r.result_fingerprint<>p_result_hash or r.spent_microusd<>p_spent or r.spent_calls<>p_calls then raise exception 'execution_settlement_conflict' using errcode='23505';end if;
  return jsonb_build_object('settled',true,'replayed',true);
 end if;
 if r.state<>'reserved' then raise exception 'execution_operation_uncertain' using errcode='55000';end if;
 update private.execution_operation_receipts set state='settled',spent_microusd=p_spent,spent_calls=p_calls,result_fingerprint=p_result_hash where id=r.id;
 update private.execution_budget_accounts set reserved_microusd=reserved_microusd-r.reserved_microusd,reserved_calls=reserved_calls-r.reserved_calls,
 spent_microusd=spent_microusd+p_spent,spent_calls=spent_calls+p_calls where id=b.id;
 return jsonb_build_object('settled',true,'replayed',false);
end $$;
create function private.commit_work_execution_result_v1(p_job uuid,p_capability text,p_lease uuid,p_contract_hash text,p_input_hash text,p_result_text text,p_outcome text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;b private.execution_budget_accounts;m private.execution_manifests;r private.execution_result_receipts;
 result_hash text:=encode(extensions.digest(convert_to(p_result_text,'UTF8'),'sha256'),'hex');expired boolean;begin
 j:=private.execution_for_lease_v1(p_job,p_capability,p_lease,true);
 select * into strict m from private.execution_manifests where organization_id=j.organization_id and execution_id=j.execution_id;
 if m.payload_fingerprint is distinct from p_contract_hash or m.snapshot_fingerprint is distinct from p_input_hash then raise exception 'execution_result_input_mismatch' using errcode='42501';end if;
 perform private.execution_json_projection_v1(p_result_text);
 if p_outcome is null or p_outcome not in ('succeeded','partial') or p_reason is null or length(p_reason) not between 1 and 120 then raise exception 'execution_result_invalid' using errcode='22023';end if;
 select * into r from private.execution_result_receipts where organization_id=j.organization_id and execution_id=j.execution_id;
 if found then
  if r.lease_id<>p_lease or r.result_fingerprint<>result_hash or r.outcome<>p_outcome or r.reason<>p_reason then raise exception 'execution_result_conflict' using errcode='23505';end if;
  return jsonb_build_object('committed',true,'replayed',true,'outcome',r.outcome);
 end if;
 b:=private.account_execution_duration_v1(j);
 expired:=clock_timestamp()>=(m.payload#>>'{budget,expiresAt}')::timestamptz or b.active_duration_ms>=(m.payload#>>'{budget,maxDurationMs}')::bigint;
 if (expired and (p_outcome<>'partial' or p_reason<>'budget_exhausted'))
 or (exists(select 1 from private.execution_operation_receipts where organization_id=j.organization_id and execution_id=j.execution_id and state<>'settled') and (p_outcome<>'partial' or (not expired and p_reason<>'operation_uncertain')))
 then raise exception 'execution_partial_result_required' using errcode='55000';end if;
 -- Recheck current clocks after all lock waits and immediately before publication.
 if j.lease_expires_at<=clock_timestamp() or not private.execution_inputs_current_v1(j.organization_id,j.execution_id,j.authorization_subject_id)
 then raise exception 'execution_authority_denied' using errcode='42501';end if;
 insert into private.execution_result_receipts(organization_id,execution_id,lease_id,contract_fingerprint,input_fingerprint,result_fingerprint,canonical_result,outcome,reason)
 values(j.organization_id,j.execution_id,p_lease,p_contract_hash,p_input_hash,result_hash,p_result_text,p_outcome,p_reason);
 update public.processing_jobs set status='succeeded',result=jsonb_build_object('executionId',j.execution_id,'outcome',p_outcome,'resultFingerprint',result_hash) where id=j.id;
 update public.processing_runs set status=p_outcome,completed_at=clock_timestamp(),usage=jsonb_build_object('costMicrousd',b.spent_microusd,'modelCalls',b.spent_calls,'activeDurationMs',b.active_duration_ms)
 where organization_id=j.organization_id and id=j.processing_run_id;
 update private.execution_budget_accounts set accounted_at=null where id=b.id;
 return jsonb_build_object('committed',true,'replayed',false,'outcome',p_outcome);
end $$;

-- Every new helper/command is closed. Only a later consumer increment may grant its API.
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('validate_execution_profile_storage_v1','execution_basis_current_v1','execution_inputs_current_v1','legacy_job_sources_rights_current_v1',
 'execution_policy_fingerprint_v1','require_execution_release_v1','request_work_execution_v1','lock_execution_authority_v1','execution_for_lease_v1',
 'account_execution_duration_v1','claim_work_execution_v1','reserve_execution_operation_v1','settle_execution_operation_v1','commit_work_execution_result_v1')
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end $$;
