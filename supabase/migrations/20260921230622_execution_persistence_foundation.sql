-- Stage 17 / persistence foundation. Storage is not execution authority.
-- No request RPC, queue producer, method release or client grant is enabled here.
set search_path='';

create function private.validate_execution_json_v1(p_value json,p_depth integer default 0)
returns void language plpgsql immutable security invoker set search_path='' as $$
declare child json;begin
 if p_depth>128 then raise exception 'execution_snapshot_depth_exceeded' using errcode='22023';end if;
 if json_typeof(p_value)='object' then
  if exists(select 1 from json_each(p_value) group by key having count(*)>1)
  or exists(select 1 from json_each(p_value) where key='__proto__') then
   raise exception 'execution_json_ambiguous_key' using errcode='22023';end if;
  for child in select value from json_each(p_value) loop perform private.validate_execution_json_v1(child,p_depth+1);end loop;
 elsif json_typeof(p_value)='array' then
  for child in select value from json_array_elements(p_value) loop perform private.validate_execution_json_v1(child,p_depth+1);end loop;
 end if;
end $$;
create function private.execution_json_projection_v1(p_text text)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
begin
 if p_text is null or octet_length(p_text) not between 1 and 8388608 then raise exception 'execution_json_size_invalid' using errcode='22023';end if;
 perform private.validate_execution_json_v1(p_text::json);
 return p_text::jsonb;
end $$;
revoke all on function private.validate_execution_json_v1(json,integer),private.execution_json_projection_v1(text) from public,anon,authenticated,service_role;

create table public.work_executions (
 id uuid primary key,organization_id uuid not null references public.organizations(id),work_id uuid not null,
 principal_id uuid not null,request_id uuid not null,processing_run_id uuid not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,principal_id,request_id),unique(organization_id,processing_run_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,principal_id) references private.principals(organization_id,id),
 foreign key(organization_id,processing_run_id) references public.processing_runs(organization_id,id)
);
create index work_executions_work_idx on public.work_executions(organization_id,work_id);
create table private.execution_input_snapshots (
 id uuid primary key,organization_id uuid not null references public.organizations(id),execution_id uuid not null,
 serialization_version text not null check(serialization_version='offroad-execution-json-utf16-v1'),
 canonical_payload text not null,payload_fingerprint text not null check(payload_fingerprint ~ '^[a-f0-9]{64}$'),
 payload jsonb generated always as (private.execution_json_projection_v1(canonical_payload)) stored,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,execution_id),unique(organization_id,execution_id,id,payload_fingerprint),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 check(payload_fingerprint=encode(extensions.digest(convert_to(canonical_payload,'UTF8'),'sha256'),'hex'))
);
create table private.execution_manifests (
 id uuid primary key,organization_id uuid not null references public.organizations(id),execution_id uuid not null,
 snapshot_id uuid not null,snapshot_fingerprint text not null,
 platform_release_id text not null references private.platform_method_releases(id),house_release_id uuid,
 serialization_version text not null check(serialization_version='offroad-execution-json-utf16-v1'),
 canonical_payload text not null,payload_fingerprint text not null check(payload_fingerprint ~ '^[a-f0-9]{64}$'),
 payload jsonb generated always as (private.execution_json_projection_v1(canonical_payload)) stored,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,execution_id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 foreign key(organization_id,execution_id,snapshot_id,snapshot_fingerprint) references private.execution_input_snapshots(organization_id,execution_id,id,payload_fingerprint),
 foreign key(organization_id,house_release_id) references public.method_releases(organization_id,id),
 check(payload_fingerprint=encode(extensions.digest(convert_to(canonical_payload,'UTF8'),'sha256'),'hex'))
);
create index execution_manifests_platform_idx on private.execution_manifests(platform_release_id);
create index execution_manifests_house_idx on private.execution_manifests(organization_id,house_release_id);
create index execution_manifests_snapshot_idx on private.execution_manifests(organization_id,execution_id,snapshot_id,snapshot_fingerprint);

create function private.validate_execution_storage_identity_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare e public.work_executions; p jsonb; base private.platform_method_releases; house public.method_releases;begin
 if tg_table_name='work_executions' then
  if not exists(select 1 from private.principals principal join public.processing_runs r on r.organization_id=principal.organization_id
   and r.created_by=principal.user_id where principal.organization_id=new.organization_id and principal.id=new.principal_id
   and principal.kind='human' and r.id=new.processing_run_id and r.work_id=new.work_id) then
   raise exception 'execution_principal_run_mismatch' using errcode='23514';end if;
 else
  -- Generated columns are available only after insertion. The same guarded parser is used.
  p:=private.execution_json_projection_v1(new.canonical_payload);
  select * into strict e from public.work_executions where organization_id=new.organization_id and id=new.execution_id;
  select * into strict base from private.platform_method_releases where id=new.platform_release_id;
  if p->>'schemaVersion' is distinct from 'execution-contract.v1'
   or p->>'organizationId' is distinct from e.organization_id::text or p->>'executionId' is distinct from e.id::text
   or p->>'workId' is distinct from e.work_id::text or p->>'principalId' is distinct from e.principal_id::text
   or p->>'requestId' is distinct from e.request_id::text or p->>'processingRunId' is distinct from e.processing_run_id::text
   or p#>>'{audience,workId}' is distinct from e.work_id::text or p#>>'{audience,kind}' is distinct from 'work_participants'
   or p#>>'{inputs,snapshotId}' is distinct from new.snapshot_id::text or p#>>'{inputs,fingerprint}' is distinct from new.snapshot_fingerprint
   or p#>>'{method,platformReleaseId}' is distinct from base.id or p#>>'{method,methodId}' is distinct from base.method_id
   or p#>>'{method,methodVersion}' is distinct from base.version or p#>>'{method,baseManifestHash}' is distinct from base.manifest_hash
   or p#>'{method,houseReleaseId}' is distinct from coalesce(to_jsonb(new.house_release_id),'null'::jsonb)
   then raise exception 'execution_manifest_identity_mismatch' using errcode='23514';end if;
  if new.house_release_id is null then
   if p#>>'{method,manifestHash}' is distinct from base.manifest_hash then raise exception 'execution_manifest_release_mismatch' using errcode='23514';end if;
  else
   select * into strict house from public.method_releases where organization_id=new.organization_id and id=new.house_release_id;
   if house.base_release_id is distinct from base.id or p#>>'{method,manifestHash}' is distinct from house.manifest_fingerprint then
    raise exception 'execution_manifest_release_mismatch' using errcode='23514';end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.validate_execution_storage_identity_v1() from public,anon,authenticated,service_role;
create trigger work_executions_identity before insert on public.work_executions for each row execute function private.validate_execution_storage_identity_v1();
create trigger execution_manifests_identity before insert on private.execution_manifests for each row execute function private.validate_execution_storage_identity_v1();

-- A root can never commit with only one half of its immutable input/manifest pair.
create function private.require_execution_storage_complete_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from private.execution_manifests m where m.organization_id=new.organization_id and m.execution_id=new.id) then
  raise exception 'execution_storage_incomplete' using errcode='23514';end if;
 return new;
end $$;
revoke all on function private.require_execution_storage_complete_v1() from public,anon,authenticated,service_role;
create constraint trigger work_executions_complete after insert on public.work_executions deferrable initially deferred
for each row execute function private.require_execution_storage_complete_v1();

do $$ declare s text;t text;begin
 foreach t in array array['work_executions','execution_input_snapshots','execution_manifests'] loop
  s:=case when t='work_executions' then 'public' else 'private' end;
  execute format('alter table %I.%I enable row level security',s,t);
  execute format('alter table %I.%I force row level security',s,t);
  execute format('revoke all on %I.%I from public,anon,authenticated,service_role',s,t);
  execute format('create policy %I on %I.%I for select to public using(false)',t||'_deny_select',s,t);
  execute format('create policy %I on %I.%I for insert to public with check(false)',t||'_deny_insert',s,t);
  execute format('create policy %I on %I.%I for update to public using(false) with check(false)',t||'_deny_update',s,t);
  execute format('create policy %I on %I.%I for delete to public using(false)',t||'_deny_delete',s,t);
  execute format('create trigger %I before update or delete on %I.%I for each row execute function private.guard_contribution_immutable_v1()',t||'_immutable',s,t);
  execute format('create trigger %I before update on %I.%I for each row execute function private.set_updated_at()',t||'_updated',s,t);
  execute format('create trigger %I after insert on %I.%I for each row execute function private.capture_identity_audit_v1()',t||'_audit',s,t);
 end loop;
end $$;
comment on table public.work_executions is 'Immutable logical execution identity. Storage only: request/claim/commit and live authority are added in the next stage-17 persistence increment. No client or worker grant.';
comment on table private.execution_input_snapshots is 'Exact retained UTF-8 bytes, SHA-256 and derived JSONB. SQL does not assert TypeScript canonicality; the versioned loader must verify exact canonical text before use.';
comment on table private.execution_manifests is 'Immutable contract storage. Existing release identity is not permission to execute. Full method, source, policy, lease and budget authority must be checked by the forthcoming commands.';
