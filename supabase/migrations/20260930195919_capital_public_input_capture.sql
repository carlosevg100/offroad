-- Stage 20 / 3Q, foundation only. A context snapshot never seals task inputs.
-- This slice records immutable metadata/intents only: no context/payload bytes are stored
-- or replayed, and every response stays unresolved. Actual retained delivery will be a
-- separate child/version with an effective retention/purge proof, not an UPDATE of an intent.
-- Existing writers/releases stay unchanged.
set search_path='';

create table private.capital_public_input_snapshots (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 work_id uuid not null, job_id uuid not null, session_id uuid not null, plan_id uuid not null, brief_id uuid not null,
 human_subject_id uuid not null references auth.users(id), analysis_scope text not null,
 context_fingerprint text not null check(context_fingerprint ~ '^[a-f0-9]{64}$'),
 state text not null default 'unresolved' check(state='unresolved'),
 captured_at timestamptz not null default clock_timestamp(), created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(organization_id,job_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,session_id) references public.document_intake_sessions(organization_id,id),
 foreign key(organization_id,plan_id) references public.capital_project_plans(organization_id,id),
 foreign key(organization_id,brief_id) references public.capital_project_briefs(organization_id,id)
);
create index capital_public_snapshots_work_idx on private.capital_public_input_snapshots(organization_id,work_id);
create index capital_public_snapshots_session_idx on private.capital_public_input_snapshots(organization_id,session_id);
create index capital_public_snapshots_plan_idx on private.capital_public_input_snapshots(organization_id,plan_id);
create index capital_public_snapshots_brief_idx on private.capital_public_input_snapshots(organization_id,brief_id);
create index capital_public_snapshots_subject_idx on private.capital_public_input_snapshots(human_subject_id);

create table private.capital_public_deliveries (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 capture_id uuid not null, delivery_key text not null check(length(delivery_key) between 1 and 160),
 payload_fingerprint text not null check(payload_fingerprint ~ '^[a-f0-9]{64}$'),
 origin_fingerprint text not null check(origin_fingerprint ~ '^[a-f0-9]{64}$'),
 origin_kind text not null check(origin_kind in ('published_public_payload','governed_workspace_source','authorized_workspace_snapshot','compound')),
 state text not null check(state='unresolved'), unresolved_reasons text[] not null,
 -- Observation time of this metadata intent; not proof of bytes delivered to a model.
 delivered_at timestamptz not null, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,capture_id,delivery_key),
 foreign key(organization_id,capture_id) references private.capital_public_input_snapshots(organization_id,id),
 check(cardinality(unresolved_reasons)>0),
 check(unresolved_reasons <@ array['origin_adapter_not_resolved','public_license_missing','public_source_closure_unresolved','retention_storage_not_resolved']::text[])
);
-- Explicit bridge to a publisher. Consumer tenancy never implies publisher row access.
create table private.capital_public_delivery_licenses (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 delivery_id uuid not null, licensing_organization_id uuid not null references public.organizations(id),
 source_version_id uuid not null, rights_version_id uuid not null, source_binding_id uuid not null,
 public_payload_fingerprint text not null check(public_payload_fingerprint ~ '^[a-f0-9]{64}$'),
 dependency_fingerprint text not null check(dependency_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,delivery_id),unique(organization_id,id,licensing_organization_id),
 foreign key(organization_id,delivery_id) references private.capital_public_deliveries(organization_id,id),
 foreign key(licensing_organization_id,source_version_id,rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id),
 foreign key(licensing_organization_id,source_binding_id) references public.source_bindings(organization_id,id)
);
create index capital_public_license_rights_idx on private.capital_public_delivery_licenses(licensing_organization_id,source_version_id,rights_version_id);
create index capital_public_license_binding_idx on private.capital_public_delivery_licenses(licensing_organization_id,source_binding_id);

create table private.capital_public_delivery_license_pins (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 license_id uuid not null, licensing_organization_id uuid not null, source_version_id uuid not null,
 rights_version_id uuid not null, source_binding_id uuid not null, pin_role text not null check(pin_role in ('delivery_latest','dependency')),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,license_id,source_version_id,rights_version_id,pin_role),
 foreign key(organization_id,license_id,licensing_organization_id) references private.capital_public_delivery_licenses(organization_id,id,licensing_organization_id),
 foreign key(licensing_organization_id,source_version_id,rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id),
 foreign key(licensing_organization_id,source_binding_id) references public.source_bindings(organization_id,id)
);
create index capital_public_pins_rights_idx on private.capital_public_delivery_license_pins(licensing_organization_id,source_version_id,rights_version_id);
create index capital_public_pins_binding_idx on private.capital_public_delivery_license_pins(licensing_organization_id,source_binding_id);

do $$ declare t text; begin
 foreach t in array array['capital_public_input_snapshots','capital_public_deliveries','capital_public_delivery_licenses','capital_public_delivery_license_pins'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create policy %I on private.%I for select to anon,authenticated using(false)',t||'_select',t);
  execute format('create policy %I on private.%I for insert to anon,authenticated with check(false)',t||'_insert',t);
  execute format('create policy %I on private.%I for update to anon,authenticated using(false) with check(false)',t||'_update',t);
  execute format('create policy %I on private.%I for delete to anon,authenticated using(false)',t||'_delete',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
  execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end; $$;

-- Existing helpers use transaction time. The new capture boundary also checks the real
-- clock after waiting and immediately before persistence/return.
create function private.capital_public_capture_clock_current_v1(p_job_id uuid,p_capability_token text)
returns boolean language sql volatile security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.processing_jobs j
 join private.worker_tokens w on w.id=j.leased_by
 join private.principals p on p.organization_id=j.organization_id and p.processing_job_id=j.id and p.kind='worker'
 join private.principals h on h.organization_id=p.organization_id and h.id=p.human_principal_id
 where j.id=p_job_id and j.status='leased' and j.kind='capital_project_analysis'
 and j.leased_account_user_id=auth.uid() and j.capability_sha256=extensions.digest(p_capability_token,'sha256')
 and j.lease_expires_at>clock_timestamp() and w.status='active' and w.revoked_at is null and w.execution_account_user_id=auth.uid()
 and p.revoked_at is null and h.revoked_at is null and p.expires_at>clock_timestamp()
 and p.account_user_id=j.leased_account_user_id and p.worker_token_id=j.leased_by and p.resource_id=j.authorization_resource_id
 and h.user_id=j.authorization_subject_id and private.job_authority_is_current_v1(j.id));
$$;
revoke all on function private.capital_public_capture_clock_current_v1(uuid,text) from public,anon,authenticated,service_role;

-- Validate capability without taking a foreign job lock, then preserve the existing
-- capability/dispatch/policy chain. New subordinate locks never wait behind a revoker.
create function private.capital_public_capture_job_v1(p_job_id uuid,p_capability_token text)
returns public.processing_jobs language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs; n integer;
begin
 if auth.uid() is null or p_job_id is null or p_capability_token is null or length(p_capability_token)<32 then
  raise exception 'capital_capture_denied' using errcode='42501'; end if;
 select * into j from public.processing_jobs where id=p_job_id and kind='capital_project_analysis' and status='leased'
  and leased_account_user_id=auth.uid() and lease_expires_at>clock_timestamp()
  and capability_sha256=extensions.digest(p_capability_token,'sha256');
 if not found or j.payload->>'analysis_scope' is null or j.payload->>'analysis_scope' not in ('origination_thesis','company_debt_view','capital_planning','provider_research','provider_case_fit','integration_preview')
  or not private.job_authority_is_current_v1(j.id) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0)) then
  raise exception 'capital_capture_retry' using errcode='40001'; end if;
 begin
  perform 1 from public.processing_jobs where id=j.id for update nowait;
  perform 1 from private.authorization_revisions where organization_id=j.organization_id and resource_id=j.authorization_resource_id
   and subject_user_id=j.authorization_subject_id for share nowait;
  if private.requires_execution_brief_approval(j.id) then
   perform 1 from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id for update nowait;
   perform 1 from public.capital_projects p join public.document_intake_sessions s on s.organization_id=p.organization_id and s.capital_project_id=p.id
    where s.organization_id=j.organization_id and s.id=j.intake_session_id for update of p nowait;
  end if;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001'; end;
 -- Every blocking lock in the legacy helper is already ours, hence reentrant.
 j:=private.job_for_capability(p_job_id,p_capability_token);
 begin
  perform 1 from auth.users where id in (j.authorization_subject_id,j.leased_account_user_id) order by id for share nowait;
  perform 1 from public.organization_memberships where organization_id=j.organization_id and user_id=j.authorization_subject_id for share nowait;
  perform 1 from private.principals where organization_id=j.organization_id and (user_id=j.authorization_subject_id or processing_job_id=j.id) order by id for share nowait;
  perform 1 from private.worker_tokens where id=j.leased_by for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001'; end;
 select count(*) into n from auth.users where id in (j.authorization_subject_id,j.leased_account_user_id)
  and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp());
 if n<>(case when j.authorization_subject_id=j.leased_account_user_id then 1 else 2 end)
  or not exists(select 1 from public.organization_memberships where organization_id=j.organization_id and user_id=j.authorization_subject_id and status='active')
  or not private.job_authority_is_current_v1(j.id) or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
 return j;
end; $$;
revoke all on function private.capital_public_capture_job_v1(uuid,text) from public,anon,authenticated,service_role;

create function private.capital_public_capture_context_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token); c jsonb;
begin
 case j.payload->>'analysis_scope'
 when 'provider_research' then c:=private.worker_load_provider_research_context(p_job_id,p_capability_token);
 when 'provider_case_fit' then c:=private.worker_load_provider_case_fit_context(p_job_id,p_capability_token);
 else c:=private.worker_load_capital_project_context_v6(p_job_id,p_capability_token);
 end case;
 return c;
end; $$;
revoke all on function private.capital_public_capture_context_v1(uuid,text) from public,anon,authenticated,service_role;

create function private.worker_load_capital_project_capture_context_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 c jsonb; s private.capital_public_input_snapshots;
begin
 -- Validate current authority and capture only its hash/identities. This endpoint delivers
 -- no context bytes; its historical fingerprint never labels different current content.
 c:=private.capital_public_capture_context_v1(p_job_id,p_capability_token);
 select * into s from private.capital_public_input_snapshots where organization_id=j.organization_id and job_id=j.id;
 if not found then
  if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
  insert into private.capital_public_input_snapshots(organization_id,work_id,job_id,session_id,plan_id,brief_id,human_subject_id,analysis_scope,context_fingerprint)
  values(j.organization_id,(j.payload->>'capital_project_id')::uuid,j.id,j.intake_session_id,(j.payload->>'capital_project_plan_id')::uuid,
   (j.payload->>'capital_project_brief_id')::uuid,j.authorization_subject_id,j.payload->>'analysis_scope',
   encode(extensions.digest(c::text,'sha256'),'hex')) on conflict(organization_id,job_id) do nothing;
  select * into strict s from private.capital_public_input_snapshots where organization_id=j.organization_id and job_id=j.id;
 end if;
 if s.human_subject_id is distinct from j.authorization_subject_id or s.work_id::text is distinct from j.payload->>'capital_project_id'
  or s.plan_id::text is distinct from j.payload->>'capital_project_plan_id' or s.brief_id::text is distinct from j.payload->>'capital_project_brief_id'
  or s.analysis_scope is distinct from j.payload->>'analysis_scope' then raise exception 'capital_capture_denied' using errcode='42501'; end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
 return jsonb_build_object('context',null,'capture',jsonb_build_object('id',s.id,'fingerprint',s.context_fingerprint,'state','unresolved','schemaVersion','capital-public-capture.v1'));
end; $$;
create function public.worker_load_capital_project_capture_context_v1(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_capital_project_capture_context_v1(p_job_id,p_capability_token);$$;
revoke all on function private.worker_load_capital_project_capture_context_v1(uuid,text),public.worker_load_capital_project_capture_context_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_capital_project_capture_context_v1(uuid,text),public.worker_load_capital_project_capture_context_v1(uuid,text) to authenticated;

-- Individual source schema only. The licensed four-field projection cannot cover arbitrary
-- extra financial/private content hidden beside a URL. Metadata remains in the integral hash.
create function private.capital_public_payload_valid_v1(p_payload jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p_payload)='object' and octet_length(p_payload::text)<=1048576
 and jsonb_typeof(p_payload->'url')='string' and length(p_payload->>'url') between 1 and 4096 and p_payload->>'url' ~ '^https://'
 and jsonb_typeof(p_payload->'title')='string' and length(p_payload->>'title') between 1 and 2000
 and jsonb_typeof(p_payload->'contentHash')='string' and p_payload->>'contentHash' ~ '^[a-f0-9]{64}$'
 and (not(p_payload?'snippet') or (jsonb_typeof(p_payload->'snippet')='string' and length(p_payload->>'snippet')<=200000))
 and not exists(select 1 from jsonb_each(p_payload) e where e.key not in ('url','title','snippet','contentHash','id','provider','topic','queryId','publishedAt','retrievedAt'))
 and not exists(select 1 from jsonb_each(p_payload) e where e.key in ('id','provider','topic','queryId','publishedAt','retrievedAt') and (jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>4096)),false);
$$;
revoke all on function private.capital_public_payload_valid_v1(jsonb) from public,anon,authenticated,service_role;

-- Build a private closure proof, or revalidate the same captured bindings/right pins.
-- Supplied pins are internal persisted data; there is no client-facing receipt constructor.
create function private.capital_public_license_proof_v1(p_org uuid,p_version uuid,p_right uuid,p_binding uuid,
 p_url text,p_public_hash text,p_delivered_at timestamptz,p_pins jsonb default null,p_dependency_fingerprint text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare versions uuid[]; remaining uuid[]; next_remaining uuid[]; deps_fp text; pins jsonb; item jsonb;
 v uuid; r private.source_rights_versions; latest private.source_rights_versions; b public.source_bindings;
begin
 if not exists(select 1 from public.organizations where id=p_org and organization_type='offroad') then return null; end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended('resource-policy:'||p_org::text,0)) then
  raise exception 'capital_capture_retry' using errcode='40001'; end if;
 begin
  perform 1 from public.organizations where id=p_org and organization_type='offroad' for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001'; end;
 if not found then return null; end if;
 with recursive closure(id) as (select p_version union select d.source_version_id from closure c
  join private.resource_dependencies d on d.organization_id=p_org and d.derived_version_id=c.id)
 select array_agg(id order by id) into versions from (select id from closure limit 1001) q;
 if cardinality(versions)>1000 or exists(select 1 from private.resource_dependencies where organization_id=p_org and derived_version_id=any(versions) and created_at>p_delivered_at) then return null; end if;
 if exists(select 1 from public.source_versions where organization_id=p_org and id=any(versions) and created_at>p_delivered_at) then return null; end if;
 if (select count(*) from (select 1 from private.resource_dependencies where organization_id=p_org and derived_version_id=any(versions) limit 10001) bounded)>10000 then return null; end if;
 -- Remove leaves until empty. No leaf means a cycle, never a zero-source proof.
 remaining:=versions;
 while cardinality(remaining)>0 loop
  select coalesce(array_agg(x order by x),'{}'::uuid[]) into next_remaining from unnest(remaining) x
   where exists(select 1 from private.resource_dependencies d where d.organization_id=p_org and d.derived_version_id=x and d.source_version_id=any(remaining));
  if cardinality(next_remaining)=cardinality(remaining) then return null; end if;
  remaining:=next_remaining;
 end loop;
 select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_object('derived',d.derived_version_id,'source',d.source_version_id,'right',d.source_rights_version_id,'id',d.id)
  order by d.id),'[]'::jsonb)::text,'sha256'),'hex') into deps_fp from private.resource_dependencies d
  where d.organization_id=p_org and d.derived_version_id=any(versions);
 if p_dependency_fingerprint is not null and deps_fp<>p_dependency_fingerprint then return null; end if;
 if p_pins is null then
  select coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',q.version,'rightsVersionId',q.right,'sourceBindingId',q.binding,'role',q.role)
   order by q.version,q.right,q.role),'[]'::jsonb) into pins from (
   select v.id as version,r.id as right,b.id as binding,'delivery_latest'::text as role
    from public.source_versions v
    join lateral(select id from private.source_rights_versions r where r.organization_id=p_org and r.source_version_id=v.id order by revision desc limit 1) r on true
    join lateral(select id from public.source_bindings b where b.organization_id=p_org and b.source_version_id=v.id and b.revoked_at is null and b.created_at<=p_delivered_at order by b.id limit 1) b on true
    where v.organization_id=p_org and v.id=any(versions)
   union
   select d.source_version_id,d.source_rights_version_id,b.id,'dependency' from private.resource_dependencies d
    join lateral(select id from public.source_bindings b where b.organization_id=p_org and b.source_version_id=d.source_version_id and b.revoked_at is null and b.created_at<=p_delivered_at order by b.id limit 1) b on true
    where d.organization_id=p_org and d.derived_version_id=any(versions)
  ) q;
  -- Preserve the root publication selected by the resolver, rather than picking a later row.
  select jsonb_agg(case when e->>'sourceVersionId'=p_version::text then jsonb_set(e,'{sourceBindingId}',to_jsonb(p_binding)) else e end
   order by e->>'sourceVersionId',e->>'rightsVersionId',e->>'role') into pins from jsonb_array_elements(pins) e;
 else pins:=p_pins; end if;
 if jsonb_typeof(pins) is distinct from 'array' or jsonb_array_length(pins)=0 or jsonb_array_length(pins)>10000
  or not exists(select 1 from jsonb_array_elements(pins) e where e->>'sourceVersionId'=p_version::text and e->>'rightsVersionId'=p_right::text
    and e->>'sourceBindingId'=p_binding::text and e->>'role'='delivery_latest') then return null; end if;
 foreach v in array versions loop
  if not exists(select 1 from jsonb_array_elements(pins) e where e->>'sourceVersionId'=v::text and e->>'role'='delivery_latest') then return null; end if;
  select r0.* into latest from private.source_rights_versions r0 where r0.organization_id=p_org and r0.source_version_id=v order by revision desc limit 1;
  if not found or latest.audience<>'public_raw_reuse' or not(array['read','process','store','derive']::text[]<@latest.operations)
   or not('analysis'=any(latest.purposes)) or latest.valid_from>clock_timestamp() or latest.expires_at<=clock_timestamp()
   or latest.store_until<=clock_timestamp() or latest.expires_at is null or latest.store_until is null then return null; end if;
  if v=p_version and (latest.public_source_url is distinct from p_url or latest.public_payload_sha256 is distinct from p_public_hash) then return null; end if;
 end loop;
 if exists(select 1 from private.resource_dependencies d where d.organization_id=p_org and d.derived_version_id=any(versions)
  and not exists(select 1 from jsonb_array_elements(pins) e where e->>'sourceVersionId'=d.source_version_id::text
   and e->>'rightsVersionId'=d.source_rights_version_id::text and e->>'role'='dependency')) then return null; end if;
 for item in select value from jsonb_array_elements(pins) loop
  select * into r from private.source_rights_versions where organization_id=p_org and source_version_id=(item->>'sourceVersionId')::uuid and id=(item->>'rightsVersionId')::uuid;
  if not found or r.audience<>'public_raw_reuse' or not(array['read','process','store','derive']::text[]<@r.operations)
   or not('analysis'=any(r.purposes)) or r.created_at>p_delivered_at or r.valid_from>p_delivered_at or r.valid_from>clock_timestamp()
   or r.expires_at is null or r.store_until is null or r.expires_at<=p_delivered_at or r.store_until<=p_delivered_at
   or r.expires_at<=clock_timestamp() or r.store_until<=clock_timestamp() then return null; end if;
  if r.id=p_right and (r.public_source_url is distinct from p_url or r.public_payload_sha256 is distinct from p_public_hash) then return null; end if;
  begin
   perform 1 from public.sources s join public.source_versions v0 on v0.organization_id=s.organization_id and v0.source_id=s.id
    where v0.organization_id=p_org and v0.id=r.source_version_id for share of s nowait;
   select * into b from public.source_bindings where organization_id=p_org and id=(item->>'sourceBindingId')::uuid for share nowait;
  exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001'; end;
  if not found or b.source_version_id<>r.source_version_id or b.revoked_at is not null or b.created_at>p_delivered_at
   or b.resource_id is null or not exists(select 1 from public.source_versions v0 join public.sources s on s.organization_id=v0.organization_id and s.id=v0.source_id
    where v0.organization_id=p_org and v0.id=r.source_version_id and s.origin_resource_id is not null and s.created_at<=p_delivered_at) then return null; end if;
 end loop;
 return jsonb_build_object('pins',pins,'dependencyFingerprint',deps_fp);
end; $$;
revoke all on function private.capital_public_license_proof_v1(uuid,uuid,uuid,uuid,text,text,timestamptz,jsonb,text) from public,anon,authenticated,service_role;

create function private.worker_capture_capital_project_delivery_v1(p_job_id uuid,p_capability_token text,p_capture_id uuid,p_delivery_key text,p_payload jsonb,p_origin_refs jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 s private.capital_public_input_snapshots; d private.capital_public_deliveries; l private.capital_public_delivery_licenses;
 fp text; origin_fp text; public_fp text; delivered_at timestamptz:=clock_timestamp(); origin jsonb; proof jsonb; pins jsonb;
 candidate record; reason text; state text:='unresolved'; license_org uuid; license_version uuid; license_right uuid; license_binding uuid;
 explicit_pin boolean; item jsonb; license_url text;
begin
 if p_capture_id is null or p_delivery_key is null or length(p_delivery_key) not between 1 and 160 or p_payload is null
  or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>1048576 or p_origin_refs is null
  or jsonb_typeof(p_origin_refs)<>'array' or jsonb_array_length(p_origin_refs) not between 1 and 100 then
  raise exception 'capital_capture_delivery_invalid' using errcode='22023'; end if;
 select * into s from private.capital_public_input_snapshots where organization_id=j.organization_id and id=p_capture_id and job_id=j.id;
 if not found or s.human_subject_id<>j.authorization_subject_id or s.work_id::text is distinct from j.payload->>'capital_project_id'
  or s.plan_id::text is distinct from j.payload->>'capital_project_plan_id' or s.brief_id::text is distinct from j.payload->>'capital_project_brief_id'
 then raise exception 'capital_capture_denied' using errcode='42501'; end if;
 perform private.capital_public_capture_context_v1(p_job_id,p_capability_token);
 fp:=encode(extensions.digest(p_payload::text,'sha256'),'hex');
 origin_fp:=encode(extensions.digest(p_origin_refs::text,'sha256'),'hex');
 select * into d from private.capital_public_deliveries where organization_id=j.organization_id and capture_id=s.id and delivery_key=p_delivery_key;
 if found then
  if d.payload_fingerprint is distinct from fp or d.origin_fingerprint is distinct from origin_fp then raise exception 'capital_capture_delivery_conflict' using errcode='23505'; end if;
  select * into l from private.capital_public_delivery_licenses where organization_id=j.organization_id and delivery_id=d.id;
  if found then
   select * into strict l from private.capital_public_delivery_licenses where organization_id=j.organization_id and delivery_id=d.id;
   select jsonb_agg(jsonb_build_object('sourceVersionId',source_version_id,'rightsVersionId',rights_version_id,'sourceBindingId',source_binding_id,'role',pin_role)
    order by source_version_id,rights_version_id,pin_role) into pins from private.capital_public_delivery_license_pins where organization_id=j.organization_id and license_id=l.id;
   select public_source_url into strict license_url from private.source_rights_versions where organization_id=l.licensing_organization_id and source_version_id=l.source_version_id and id=l.rights_version_id;
   proof:=private.capital_public_license_proof_v1(l.licensing_organization_id,l.source_version_id,l.rights_version_id,l.source_binding_id,license_url,l.public_payload_fingerprint,d.delivered_at,pins,l.dependency_fingerprint);
   if proof is null then raise exception 'capital_capture_license_denied' using errcode='42501'; end if;
  end if;
  if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
  return jsonb_build_object('deliveryId',d.id,'payloadFingerprint',d.payload_fingerprint,'state',d.state,'replayed',true,'unresolvedReasons',to_jsonb(d.unresolved_reasons));
 end if;
 -- This slice resolves one exact public source. Compound/workspace adapters are retained
 -- as unresolved; no absent evidence list can manufacture completeness.
 for origin in select value from jsonb_array_elements(p_origin_refs) loop
  if jsonb_typeof(origin) is distinct from 'object' or origin->>'kind' is null or origin->>'kind' not in ('published_public_payload','governed_workspace_source','authorized_workspace_snapshot') then
   raise exception 'capital_capture_origin_invalid' using errcode='22023'; end if;
 end loop;
 origin:=p_origin_refs->0;
 if jsonb_array_length(p_origin_refs)<>1 or origin->>'kind'<>'published_public_payload' then reason:='origin_adapter_not_resolved';
 else
  if not private.capital_public_payload_valid_v1(p_payload) or exists(select 1 from jsonb_object_keys(origin) k
   where k not in ('kind','licensingOrganizationId','sourceVersionId','rightsVersionId','sourceBindingId')) then raise exception 'capital_capture_public_payload_invalid' using errcode='22023'; end if;
  explicit_pin:=origin?'licensingOrganizationId' or origin?'sourceVersionId' or origin?'rightsVersionId' or origin?'sourceBindingId';
  if explicit_pin and (not(origin?'licensingOrganizationId') or not(origin?'sourceVersionId') or not(origin?'rightsVersionId') or not(origin?'sourceBindingId')
   or origin->>'licensingOrganizationId' is null or origin->>'sourceVersionId' is null or origin->>'rightsVersionId' is null or origin->>'sourceBindingId' is null) then
   raise exception 'capital_capture_origin_invalid' using errcode='22023'; end if;
  public_fp:=private.public_source_payload_sha256_v1(p_payload);
  if explicit_pin then
   license_org:=(origin->>'licensingOrganizationId')::uuid; license_version:=(origin->>'sourceVersionId')::uuid;
   license_right:=(origin->>'rightsVersionId')::uuid; license_binding:=(origin->>'sourceBindingId')::uuid;
   -- A requested pin must be the actual latest root at delivery, not a stale permissive right.
   if not exists(select 1 from private.source_rights_versions r where r.organization_id=license_org and r.source_version_id=license_version and r.id=license_right
    and r.audience='public_raw_reuse' and r.public_source_url=p_payload->>'url' and r.public_payload_sha256=public_fp
    and not exists(select 1 from private.source_rights_versions newer where newer.organization_id=r.organization_id and newer.source_version_id=r.source_version_id and newer.revision>r.revision)) then
    raise exception 'capital_capture_license_denied' using errcode='42501'; end if;
   proof:=private.capital_public_license_proof_v1(license_org,license_version,license_right,license_binding,p_payload->>'url',public_fp,delivered_at);
   if proof is null then raise exception 'capital_capture_license_denied' using errcode='42501'; end if;
  else
   reason:='public_license_missing';
   -- Stable order and try-locks; do not call the blocking boolean cache helper.
   for candidate in select r.organization_id,r.source_version_id,r.id as rights_id,b.id as binding_id
    from private.source_rights_versions r join public.organizations o on o.id=r.organization_id and o.organization_type='offroad'
    join public.source_bindings b on b.organization_id=r.organization_id and b.source_version_id=r.source_version_id and b.revoked_at is null
    where r.audience='public_raw_reuse' and r.public_source_url=p_payload->>'url' and r.public_payload_sha256=public_fp
     and not exists(select 1 from private.source_rights_versions newer where newer.organization_id=r.organization_id and newer.source_version_id=r.source_version_id and newer.revision>r.revision)
    order by r.organization_id,r.source_version_id,b.id loop
    proof:=private.capital_public_license_proof_v1(candidate.organization_id,candidate.source_version_id,candidate.rights_id,candidate.binding_id,p_payload->>'url',public_fp,delivered_at);
    if proof is not null then
     license_org:=candidate.organization_id; license_version:=candidate.source_version_id; license_right:=candidate.rights_id; license_binding:=candidate.binding_id; exit;
    end if;
    reason:='public_source_closure_unresolved';
   end loop;
  end if;
  if proof is not null then reason:='retention_storage_not_resolved'; end if;
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
 insert into private.capital_public_deliveries(organization_id,capture_id,delivery_key,payload_fingerprint,origin_fingerprint,origin_kind,state,unresolved_reasons,delivered_at)
 values(j.organization_id,s.id,p_delivery_key,fp,origin_fp,case when jsonb_array_length(p_origin_refs)=1 then origin->>'kind' else 'compound' end,state,array[reason],delivered_at) returning * into d;
 if proof is not null then
  insert into private.capital_public_delivery_licenses(organization_id,delivery_id,licensing_organization_id,source_version_id,rights_version_id,source_binding_id,public_payload_fingerprint,dependency_fingerprint)
  values(j.organization_id,d.id,license_org,license_version,license_right,license_binding,public_fp,proof->>'dependencyFingerprint') returning * into l;
  for item in select value from jsonb_array_elements(proof->'pins') loop
   insert into private.capital_public_delivery_license_pins(organization_id,license_id,licensing_organization_id,source_version_id,rights_version_id,source_binding_id,pin_role)
   values(j.organization_id,l.id,license_org,(item->>'sourceVersionId')::uuid,(item->>'rightsVersionId')::uuid,(item->>'sourceBindingId')::uuid,item->>'role');
  end loop;
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
 return jsonb_build_object('deliveryId',d.id,'payloadFingerprint',d.payload_fingerprint,'state',d.state,'replayed',false,'unresolvedReasons',to_jsonb(d.unresolved_reasons));
end; $$;
create function public.worker_capture_capital_project_delivery_v1(p_job_id uuid,p_capability_token text,p_capture_id uuid,p_delivery_key text,p_payload jsonb,p_origin_refs jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_capture_capital_project_delivery_v1(p_job_id,p_capability_token,p_capture_id,p_delivery_key,p_payload,p_origin_refs);$$;
revoke all on function private.worker_capture_capital_project_delivery_v1(uuid,text,uuid,text,jsonb,jsonb),public.worker_capture_capital_project_delivery_v1(uuid,text,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_capture_capital_project_delivery_v1(uuid,text,uuid,text,jsonb,jsonb),public.worker_capture_capital_project_delivery_v1(uuid,text,uuid,text,jsonb,jsonb) to authenticated;
comment on function public.worker_load_capital_project_capture_context_v1(uuid,text) is '3Q metadata only: context is null, hash/identities unresolved; no retained bytes, task seal, artifact binding or approval.';
comment on function public.worker_capture_capital_project_delivery_v1(uuid,text,uuid,text,jsonb,jsonb) is '3Q metadata only: unresolved intent with integral payload hash/private license pins. No payload storage/replay or promotion; future delivery retention proof is separate.';
