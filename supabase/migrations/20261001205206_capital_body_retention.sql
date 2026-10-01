-- 3Q typed retained body service. Original live job only; no task/artifact/release
-- completeness, historical consumer grant, native material, or fabricated license.
-- SQL binds identities/deadlines/metadata; worker verifies physical SHA and semantic
-- gateway-parsed-output.v1 independently after downloading the exact bytes.
set search_path='';

-- Existing contribution command is the source of author/intent/channel authority.
-- A generic clickwrap is NOT converted into a new source license here.
create table private.capital_body_origins (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,contribution_revision_id uuid not null,
 origin_fingerprint text not null check(origin_fingerprint~'^[a-f0-9]{64}$'),
 source_closure_fingerprint text not null check(source_closure_fingerprint~'^[a-f0-9]{64}$'),
 captured_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,contribution_revision_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,work_id,contribution_revision_id) references public.contribution_revisions(organization_id,work_id,id)
);
create index capital_body_origins_work_idx on private.capital_body_origins(organization_id,work_id);
create index capital_body_origins_revision_fk_idx on private.capital_body_origins(organization_id,work_id,contribution_revision_id);
create table private.capital_body_source_pins (
 id uuid not null default gen_random_uuid(),organization_id uuid not null references public.organizations(id),origin_id uuid not null,source_version_id uuid not null,rights_version_id uuid not null,
 source_binding_id uuid not null,pin_kind text not null check(pin_kind in ('contribution_declared','captured_latest','dependency')),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,origin_id,source_version_id,rights_version_id,pin_kind),unique(organization_id,id),
 foreign key(organization_id,origin_id) references private.capital_body_origins(organization_id,id),
 foreign key(organization_id,source_version_id,rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id),
 foreign key(organization_id,source_binding_id) references public.source_bindings(organization_id,id)
);
create index capital_body_pins_rights_idx on private.capital_body_source_pins(organization_id,source_version_id,rights_version_id);
create index capital_body_pins_binding_idx on private.capital_body_source_pins(organization_id,source_binding_id);

-- An input admission binds exact component references to the invocation before dispatch.
-- This is not a task recipe and cannot certify that a producer used every component.
create table private.capital_body_invocation_inputs (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 invocation_id uuid not null,adapter_input_version text not null check(adapter_input_version='gateway-adapter-input.v1'),
 adapter_request_fingerprint text not null check(adapter_request_fingerprint~'^[a-f0-9]{64}$'),
 input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),prompt_fingerprint text not null check(prompt_fingerprint~'^[a-f0-9]{64}$'),
 retry_ordinal integer not null check(retry_ordinal in (0,1)),is_same_model_repair boolean not null,used_provider_fallback boolean not null,
 previous_invocation_id uuid,
 provider text not null check(provider in ('openai','anthropic','perplexity')),model text not null check(length(model) between 1 and 160),
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 captured_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,id,invocation_id),unique(organization_id,invocation_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,previous_invocation_id) references private.capital_body_invocation_inputs(organization_id,invocation_id),
 check((retry_ordinal=0 and not is_same_model_repair and not used_provider_fallback and previous_invocation_id is null)
 or (retry_ordinal=1 and is_same_model_repair and not used_provider_fallback and previous_invocation_id is not null)
 or (retry_ordinal=0 and not is_same_model_repair and used_provider_fallback and previous_invocation_id is not null))
);
create index capital_body_input_job_idx on private.capital_body_invocation_inputs(organization_id,job_id);
create index capital_body_input_previous_idx on private.capital_body_invocation_inputs(organization_id,previous_invocation_id);
create index capital_body_input_worker_idx on private.capital_body_invocation_inputs(worker_account_id);
create index capital_body_input_human_idx on private.capital_body_invocation_inputs(human_subject_id);
create table private.capital_body_input_components (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,input_receipt_id uuid not null,
 component_no integer not null check(component_no between 1 and 1000),
 component_kind text not null check(component_kind in ('contribution','retained_payload')),
 origin_id uuid,retained_payload_id uuid,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,input_receipt_id,component_no),
 foreign key(organization_id,work_id,input_receipt_id) references private.capital_body_invocation_inputs(organization_id,work_id,id),
 foreign key(organization_id,work_id,origin_id) references private.capital_body_origins(organization_id,work_id,id),
 foreign key(organization_id,retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 check((component_kind='contribution' and origin_id is not null and retained_payload_id is null)
    or (component_kind='retained_payload' and retained_payload_id is not null and origin_id is null))
);
create index capital_body_components_input_fk_idx on private.capital_body_input_components(organization_id,work_id,input_receipt_id);
create index capital_body_components_origin_fk_idx on private.capital_body_input_components(organization_id,work_id,origin_id);
create index capital_body_components_origin_idx on private.capital_body_input_components(organization_id,origin_id);
create index capital_body_components_parent_idx on private.capital_body_input_components(organization_id,retained_payload_id);
create table private.capital_body_accepted_invocations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,input_receipt_id uuid not null,
 invocation_id uuid not null,output_fingerprint text not null check(output_fingerprint~'^[a-f0-9]{64}$'),
 accepted_identity jsonb not null check(jsonb_typeof(accepted_identity)='object'),
 from_cassette boolean not null check(not from_cassette),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,input_receipt_id),
 foreign key(organization_id,work_id,input_receipt_id) references private.capital_body_invocation_inputs(organization_id,work_id,id),
 foreign key(organization_id,input_receipt_id,invocation_id) references private.capital_body_invocation_inputs(organization_id,id,invocation_id)
);
create table private.capital_body_bases (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 kind text not null check(kind in ('contribution_input','gateway_accepted_output')),
 origin_id uuid,accepted_invocation_id uuid,
 body_schema_version text not null check(body_schema_version in ('capital-body.contribution.v1','origination_senior_readout_v2')),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,work_id,origin_id) references private.capital_body_origins(organization_id,work_id,id),
 foreign key(organization_id,work_id,accepted_invocation_id) references private.capital_body_accepted_invocations(organization_id,work_id,id),
 check((kind='contribution_input' and origin_id is not null and accepted_invocation_id is null and body_schema_version='capital-body.contribution.v1')
 or (kind='gateway_accepted_output' and origin_id is null and accepted_invocation_id is not null and body_schema_version='origination_senior_readout_v2'))
);

alter table private.capital_public_payload_allocations add column body_basis_id uuid,
 add column content_kind text not null default 'public_source' check(content_kind in ('public_source','typed_body')),
 add foreign key(organization_id,body_basis_id) references private.capital_body_bases(organization_id,id),
 alter column delivery_id drop not null,alter column license_id drop not null,alter column licensing_organization_id drop not null,
 add constraint capital_allocations_kind_invariant check(
  (content_kind='public_source' and body_basis_id is null and num_nonnulls(delivery_id,license_id,licensing_organization_id)=3)
  or (content_kind='typed_body' and body_basis_id is not null and num_nonnulls(delivery_id,license_id,licensing_organization_id)=0));
-- Existing public composite FKs/UNIQUEs/path/deadline/body immutability remain intact.
create unique index capital_body_allocation_request_idx on private.capital_public_payload_allocations(organization_id,job_id,request_id) where content_kind='typed_body';
create index capital_body_allocation_basis_idx on private.capital_public_payload_allocations(organization_id,body_basis_id);
-- Durable wake intents avoid a revoker waiting for a purge queue row. A poll drains
-- these with SKIP LOCKED + NOWAIT. No skipped wake is silently forgotten.
create table private.capital_body_retention_wakes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),allocation_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),
 foreign key(organization_id,allocation_id) references private.capital_public_payload_allocations(organization_id,id)
);
create index capital_body_wake_allocation_idx on private.capital_body_retention_wakes(organization_id,allocation_id);
create index capital_body_wake_drain_idx on private.capital_body_retention_wakes(created_at,id);
alter table private.capital_body_retention_wakes enable row level security;
alter table private.capital_body_retention_wakes force row level security;
revoke all on private.capital_body_retention_wakes from public,anon,authenticated,service_role;
create policy capital_body_wakes_select on private.capital_body_retention_wakes for select to anon,authenticated using(false);
create policy capital_body_wakes_insert on private.capital_body_retention_wakes for insert to anon,authenticated with check(false);
create policy capital_body_wakes_update on private.capital_body_retention_wakes for update to anon,authenticated using(false) with check(false);
create policy capital_body_wakes_delete on private.capital_body_retention_wakes for delete to anon,authenticated using(false);
create trigger capital_body_wakes_updated before update on private.capital_body_retention_wakes for each row execute function private.set_updated_at();
create trigger capital_body_wakes_audit after insert or update or delete on private.capital_body_retention_wakes for each row execute function private.capture_audit_event();
create index capital_body_basis_origin_idx on private.capital_body_bases(organization_id,origin_id);
create index capital_body_basis_accepted_idx on private.capital_body_bases(organization_id,accepted_invocation_id);
create index capital_body_basis_origin_fk_idx on private.capital_body_bases(organization_id,work_id,origin_id);
create index capital_body_basis_accepted_fk_idx on private.capital_body_bases(organization_id,work_id,accepted_invocation_id);
create index capital_body_accepted_input_fk_idx on private.capital_body_accepted_invocations(organization_id,work_id,input_receipt_id);
create index capital_body_accepted_input_idx on private.capital_body_accepted_invocations(organization_id,input_receipt_id);
create index capital_body_inputs_subject_idx on private.capital_body_invocation_inputs(organization_id,human_subject_id);

do $$ declare t text; begin
 foreach t in array array['capital_body_origins','capital_body_source_pins','capital_body_invocation_inputs','capital_body_input_components','capital_body_accepted_invocations','capital_body_bases'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy %I on private.%I for select to anon,authenticated using(false)',t||'_deny_select',t);
 execute format('create policy %I on private.%I for insert to anon,authenticated with check(false)',t||'_deny_insert',t);
 execute format('create policy %I on private.%I for update to anon,authenticated using(false) with check(false)',t||'_deny_update',t);
 execute format('create policy %I on private.%I for delete to anon,authenticated using(false)',t||'_deny_delete',t);
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated',t);
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 end loop;
end; $$;

-- A rights predicate only restricts authorized workspace access; it does not grant it.
create function private.capital_body_subject_allowed_v1(p_org uuid,p_work uuid,p_subject uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select p_subject is not null and exists(select 1 from auth.users u join public.organization_memberships m on m.user_id=u.id
  where u.id=p_subject and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
  and m.organization_id=p_org and m.status='active')
 and exists(select 1 from public.capital_projects p where p.organization_id=p_org and p.id=p_work and p.status<>'archived')
 and private.evaluate_resource_policy_v1(p_org,p_work,p_subject,'read','analysis');
$$;

-- Current channel authority is evaluated as the validated HUMAN, never worker JWT.
create function private.capital_body_contribution_allowed_v1(p_org uuid,p_revision uuid,p_subject uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.contribution_revisions r
 join public.work_contributions c on c.organization_id=r.organization_id and c.work_id=r.work_id and c.id=r.contribution_id
 join public.work_channels h on h.organization_id=c.organization_id and h.work_id=c.work_id and h.id=c.channel_id
 where r.organization_id=p_org and r.id=p_revision
 and r.promoted_from_revision_id is null and r.author_user_id=r.recorded_by
 and private.capital_body_subject_allowed_v1(p_org,r.work_id,p_subject)
 and (h.kind='shared' or (h.kind='personal' and h.owner_user_id=p_subject)));
$$;

-- Build/revalidate a closed set of exact source/right/binding pins. This replaces
-- neither source_use_allowed_v1 nor contribution_sources_allowed_v1: their existing
-- readers remain unchanged. Here process is mandatory in addition to read/store/derive.
create function private.capital_body_contribution_proof_v1(p_org uuid,p_revision uuid,p_subject uuid,
 p_captured_at timestamptz,p_expected_pins jsonb default null,p_expected_closure text default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare versions uuid[];remaining uuid[];next_remaining uuid[];closure_fp text;pins jsonb;item jsonb;v uuid;
 pinned private.source_rights_versions;current_right private.source_rights_versions;binding public.source_bindings;
begin
 if not private.capital_body_contribution_allowed_v1(p_org,p_revision,p_subject)
 or not isfinite(p_captured_at) or p_captured_at>clock_timestamp() then return null;end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended('resource-policy:'||p_org::text,0)) then
 raise exception 'capital_capture_retry' using errcode='40001';end if;
 begin
 perform 1 from public.contribution_revisions where organization_id=p_org and id=p_revision for share nowait;
 perform 1 from public.work_contributions c join public.contribution_revisions r on r.organization_id=c.organization_id and r.contribution_id=c.id
 where r.organization_id=p_org and r.id=p_revision for share of c nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if not private.capital_body_contribution_allowed_v1(p_org,p_revision,p_subject) then return null;end if;
 with recursive closure(id) as (
 select source_version_id from private.contribution_source_dependencies where organization_id=p_org and revision_id=p_revision
 union select d.source_version_id from closure c join private.resource_dependencies d on d.organization_id=p_org and d.derived_version_id=c.id)
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into versions from (select id from closure limit 1001) bounded;
 if cardinality(versions)>1000 then return null;end if;
 if (select count(*) from (select 1 from private.resource_dependencies where organization_id=p_org and derived_version_id=any(versions) limit 10001) bounded)>10000 then return null;end if;
 remaining:=versions;
 while cardinality(remaining)>0 loop
 select coalesce(array_agg(x order by x),'{}'::uuid[]) into next_remaining from unnest(remaining) x
 where exists(select 1 from private.resource_dependencies d where d.organization_id=p_org and d.derived_version_id=x and d.source_version_id=any(remaining));
 if cardinality(next_remaining)=cardinality(remaining) then return null;end if;
 remaining:=next_remaining;
 end loop;
 if exists(select 1 from public.source_versions where organization_id=p_org and id=any(versions) and created_at>p_captured_at)
 or exists(select 1 from private.resource_dependencies where organization_id=p_org and derived_version_id=any(versions) and created_at>p_captured_at) then return null;end if;
 select encode(extensions.digest(jsonb_build_object(
 'declared',(select coalesce(jsonb_agg(jsonb_build_array(source_version_id,rights_version_id) order by source_version_id,rights_version_id),'[]') from private.contribution_source_dependencies where organization_id=p_org and revision_id=p_revision),
 'dependencies',(select coalesce(jsonb_agg(jsonb_build_array(id,derived_version_id,source_version_id,source_rights_version_id) order by id),'[]') from private.resource_dependencies where organization_id=p_org and derived_version_id=any(versions)))::text,'sha256'),'hex') into closure_fp;
 if p_expected_closure is not null and p_expected_closure<>closure_fp then return null;end if;
 if p_expected_pins is null then
 select coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',q.version_id,'rightsVersionId',q.right_id,'sourceBindingId',q.binding_id,'kind',q.kind)
 order by q.version_id,q.right_id,q.kind),'[]'::jsonb) into pins from (
 select d.source_version_id version_id,d.rights_version_id right_id,b.id binding_id,'contribution_declared'::text kind
 from private.contribution_source_dependencies d join lateral(select id from public.source_bindings
 where organization_id=p_org and source_version_id=d.source_version_id and revoked_at is null and created_at<=p_captured_at
 and private.evaluate_resource_policy_v1(p_org,resource_id,p_subject,'read','analysis') order by id limit 1) b on true
 where d.organization_id=p_org and d.revision_id=p_revision
 union select v0.id,r0.id,b.id,'captured_latest' from public.source_versions v0
 join lateral(select id from private.source_rights_versions where organization_id=p_org and source_version_id=v0.id order by revision desc limit 1) r0 on true
 join lateral(select id from public.source_bindings where organization_id=p_org and source_version_id=v0.id and revoked_at is null and created_at<=p_captured_at
 and private.evaluate_resource_policy_v1(p_org,resource_id,p_subject,'read','analysis') order by id limit 1) b on true
 where v0.organization_id=p_org and v0.id=any(versions)
 union select d.source_version_id,d.source_rights_version_id,b.id,'dependency' from private.resource_dependencies d
 join lateral(select id from public.source_bindings where organization_id=p_org and source_version_id=d.source_version_id and revoked_at is null and created_at<=p_captured_at
 and private.evaluate_resource_policy_v1(p_org,resource_id,p_subject,'read','analysis') order by id limit 1) b on true
 where d.organization_id=p_org and d.derived_version_id=any(versions)) q;
 else pins:=p_expected_pins;end if;
 if jsonb_typeof(pins) is distinct from 'array' or jsonb_array_length(pins)>10000 then return null;end if;
 foreach v in array versions loop
 if not exists(select 1 from jsonb_array_elements(pins) e where e->>'sourceVersionId'=v::text and e->>'kind'='captured_latest') then return null;end if;
 select * into current_right from private.source_rights_versions where organization_id=p_org and source_version_id=v order by revision desc limit 1;
 if not found or not(array['read','process','store','derive']::text[]<@current_right.operations)
 or not('analysis'=any(current_right.purposes)) or current_right.valid_from>clock_timestamp()
 or current_right.expires_at<=clock_timestamp() or current_right.store_until<=clock_timestamp()
 or not private.source_use_allowed_v1(p_org,v,p_subject,'process','analysis') then return null;end if;
 end loop;
 if exists(select 1 from private.contribution_source_dependencies d where d.organization_id=p_org and d.revision_id=p_revision
 and not exists(select 1 from jsonb_array_elements(pins) e where e->>'sourceVersionId'=d.source_version_id::text and e->>'rightsVersionId'=d.rights_version_id::text and e->>'kind'='contribution_declared'))
 or exists(select 1 from private.resource_dependencies d where d.organization_id=p_org and d.derived_version_id=any(versions)
 and not exists(select 1 from jsonb_array_elements(pins) e where e->>'sourceVersionId'=d.source_version_id::text and e->>'rightsVersionId'=d.source_rights_version_id::text and e->>'kind'='dependency')) then return null;end if;
 for item in select value from jsonb_array_elements(pins) loop
 select * into pinned from private.source_rights_versions where organization_id=p_org and source_version_id=(item->>'sourceVersionId')::uuid and id=(item->>'rightsVersionId')::uuid;
 if not found or not(array['read','process','store','derive']::text[]<@pinned.operations)
 or not('analysis'=any(pinned.purposes)) or pinned.valid_from>p_captured_at or pinned.created_at>p_captured_at
 or pinned.expires_at<=p_captured_at or pinned.store_until<=p_captured_at or pinned.expires_at<=clock_timestamp() or pinned.store_until<=clock_timestamp() then return null;end if;
 begin
 select * into binding from public.source_bindings where organization_id=p_org and id=(item->>'sourceBindingId')::uuid for share nowait;
 perform 1 from public.sources s join public.source_versions v0 on v0.organization_id=s.organization_id and v0.source_id=s.id
 where v0.organization_id=p_org and v0.id=pinned.source_version_id for share of s nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if binding.id is null or binding.source_version_id<>pinned.source_version_id or binding.revoked_at is not null or binding.created_at>p_captured_at
 or not private.evaluate_resource_policy_v1(p_org,binding.resource_id,p_subject,'read','analysis') then return null;end if;
 end loop;
 return jsonb_build_object('pins',pins,'closureFingerprint',closure_fp);
end; $$;

create function private.capital_body_origin_deadline_v1(p_org uuid,p_origin uuid,p_subject uuid,p_observed timestamptz,p_policy uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare origin private.capital_body_origins;policy private.capital_public_retention_policies;pins jsonb;proof jsonb;bound timestamptz;
begin
 select * into origin from private.capital_body_origins where organization_id=p_org and id=p_origin;
 if not found then return null;end if;
 select * into policy from private.capital_public_retention_policies where id=p_policy;
 if not found or not isfinite(p_observed) then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',source_version_id,'rightsVersionId',rights_version_id,'sourceBindingId',source_binding_id,'kind',pin_kind)
 order by source_version_id,rights_version_id,pin_kind),'[]') into pins from private.capital_body_source_pins where organization_id=p_org and origin_id=p_origin;
 proof:=private.capital_body_contribution_proof_v1(p_org,origin.contribution_revision_id,p_subject,origin.captured_at,pins,origin.source_closure_fingerprint);
 if proof is null then return null;end if;
 select min(least(x.expires_at,x.store_until)) into bound from (
 select r.expires_at,r.store_until from private.capital_body_source_pins p join private.source_rights_versions r
 on r.organization_id=p.organization_id and r.id=p.rights_version_id where p.organization_id=p_org and p.origin_id=p_origin
 union all select r.expires_at,r.store_until from (select distinct source_version_id from private.capital_body_source_pins where organization_id=p_org and origin_id=p_origin) v
 join lateral(select expires_at,store_until from private.source_rights_versions where organization_id=p_org and source_version_id=v.source_version_id order by revision desc limit 1) r on true) x;
 bound:=least(bound,p_observed+make_interval(secs=>policy.maximum_retention_seconds));
 if bound<=clock_timestamp() or not isfinite(bound) then return null;end if;
 return bound;
end; $$;

create function private.capital_body_capture_origin_v1(p_org uuid,p_work uuid,p_revision uuid,p_subject uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare origin private.capital_body_origins;revision_row public.contribution_revisions;proof jsonb;pin jsonb;stamp timestamptz:=clock_timestamp();fp text;
begin
 if not private.capital_body_contribution_allowed_v1(p_org,p_revision,p_subject) then raise exception 'capital_body_origin_denied' using errcode='42501';end if;
 select * into revision_row from public.contribution_revisions where organization_id=p_org and work_id=p_work and id=p_revision;
 if not found then raise exception 'capital_body_origin_denied' using errcode='42501';end if;
 select * into origin from private.capital_body_origins where organization_id=p_org and contribution_revision_id=p_revision;
 if found then
 if private.capital_body_origin_deadline_v1(p_org,origin.id,p_subject,stamp,(select policy_id from private.capital_public_retention_controls where singleton)) is null then
 raise exception 'capital_body_origin_denied' using errcode='42501';end if;
 return origin.id;
 end if;
 proof:=private.capital_body_contribution_proof_v1(p_org,p_revision,p_subject,stamp);
 if proof is null then raise exception 'capital_body_origin_denied' using errcode='42501';end if;
 fp:=encode(extensions.digest(jsonb_build_object('revisionId',revision_row.id,'requestFingerprint',revision_row.request_fingerprint,
 'author',revision_row.author_user_id,'content',revision_row.content)::text,'sha256'),'hex');
 insert into private.capital_body_origins(organization_id,work_id,contribution_revision_id,origin_fingerprint,source_closure_fingerprint,captured_at)
 values(p_org,p_work,p_revision,fp,proof->>'closureFingerprint',stamp)
 on conflict(organization_id,contribution_revision_id) do nothing returning * into origin;
 if not found then
 select * into strict origin from private.capital_body_origins where organization_id=p_org and contribution_revision_id=p_revision;
 if origin.origin_fingerprint<>fp or origin.source_closure_fingerprint<>proof->>'closureFingerprint' then raise exception 'capital_body_origin_changed' using errcode='40001';end if;
 -- Competing winner may pin different contemporaneous rights: never return without its proof.
 if private.capital_body_origin_deadline_v1(p_org,origin.id,p_subject,stamp,(select policy_id from private.capital_public_retention_controls where singleton)) is null then
 raise exception 'capital_body_origin_denied' using errcode='42501';end if;
 return origin.id;
 end if;
 for pin in select value from jsonb_array_elements(proof->'pins') loop
 insert into private.capital_body_source_pins(organization_id,origin_id,source_version_id,rights_version_id,source_binding_id,pin_kind)
 values(p_org,origin.id,(pin->>'sourceVersionId')::uuid,(pin->>'rightsVersionId')::uuid,(pin->>'sourceBindingId')::uuid,pin->>'kind');
 end loop;
 return origin.id;
end; $$;

create function private.capital_body_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid,p_depth integer default 0)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;basis private.capital_body_bases;input_row private.capital_body_invocation_inputs;
 policy private.capital_public_retention_policies;component private.capital_body_input_components;parent private.capital_public_payload_allocations;
 deadline timestamptz;bound timestamptz;queue_deadline timestamptz;
begin
 if p_depth>127 then return null;end if;
 select * into allocation from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 if not found then return null;end if;
 select * into policy from private.capital_public_retention_policies where id=allocation.policy_id;
 if not found then return null;end if;
 select q.effective_purge_at+make_interval(secs=>policy.purge_margin_seconds) into queue_deadline from private.capital_public_payload_purge_queue q
 where q.organization_id=p_org and q.allocation_id=allocation.id and q.status='pending';
 if not found then return null;end if;
 if allocation.content_kind='public_source' then
 bound:=private.capital_public_retention_deadline_v1(allocation.license_id,p_org,allocation.retained_at,allocation.policy_id);
 if bound is null then return null;end if;
 return least(bound,allocation.expires_at,queue_deadline);
 end if;
 select * into basis from private.capital_body_bases where organization_id=p_org and id=allocation.body_basis_id;
 if not found or not private.capital_body_subject_allowed_v1(p_org,basis.work_id,p_subject) then return null;end if;
 deadline:=least(allocation.expires_at,queue_deadline);
 if basis.kind='contribution_input' then
 bound:=private.capital_body_origin_deadline_v1(p_org,basis.origin_id,p_subject,allocation.retained_at,allocation.policy_id);
 if bound is null then return null;end if;
 return least(deadline,bound);
 end if;
 select i.* into input_row from private.capital_body_accepted_invocations ok
 join private.capital_body_invocation_inputs i on i.organization_id=ok.organization_id and i.id=ok.input_receipt_id
 where ok.organization_id=p_org and ok.work_id=basis.work_id and ok.id=basis.accepted_invocation_id;
 if not found or not exists(select 1 from private.capital_body_input_components where organization_id=p_org and input_receipt_id=input_row.id) then return null;end if;
 for component in select * from private.capital_body_input_components where organization_id=p_org and input_receipt_id=input_row.id order by component_no loop
 if component.component_kind='contribution' then
 bound:=private.capital_body_origin_deadline_v1(p_org,component.origin_id,p_subject,input_row.captured_at,allocation.policy_id);
 else
 select a.* into parent from private.capital_public_retained_payloads r join private.capital_public_payload_allocations a
 on a.organization_id=r.organization_id and a.id=r.allocation_id where r.organization_id=p_org and r.id=component.retained_payload_id;
 if not found or not private.capital_body_physical_receipt_v1(p_org,component.retained_payload_id) or parent.created_at>=basis.created_at or not exists(select 1 from private.capital_public_payload_purge_queue
 where organization_id=p_org and allocation_id=parent.id and status='pending') then return null;end if;
 bound:=private.capital_body_allocation_deadline_v1(p_org,parent.id,p_subject,p_depth+1);
 if bound is null then return null;end if;
 bound:=least(bound,parent.expires_at,parent.purge_at+make_interval(secs=>policy.purge_margin_seconds));
 end if;
 if bound is null then return null;end if;
 deadline:=least(deadline,bound);
 end loop;
 if deadline<=clock_timestamp() or not isfinite(deadline) then return null;end if;
 return deadline;
end; $$;

create function private.worker_record_capital_body_input_v1(p_job_id uuid,p_capability_token text,p_invocation_id uuid,
 p_adapter_request_fingerprint text,p_input_fingerprint text,p_prompt_fingerprint text,p_provider text,p_model text,p_components jsonb,
 p_retry_ordinal integer default 0,p_is_same_model_repair boolean default false,p_used_provider_fallback boolean default false,p_previous_invocation_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 work uuid;receipt private.capital_body_invocation_inputs;component jsonb;ordinal integer:=0;origin uuid;
 previous_components jsonb;resolved_components jsonb:='[]';parent private.capital_public_payload_allocations;stamp timestamptz:=clock_timestamp();
begin
 work:=coalesce(job.work_id,(job.payload->>'capital_project_id')::uuid);
 if p_invocation_id is null or p_adapter_request_fingerprint is null or p_adapter_request_fingerprint!~'^[a-f0-9]{64}$'
 or p_input_fingerprint is null or p_input_fingerprint!~'^[a-f0-9]{64}$' or p_prompt_fingerprint is null or p_prompt_fingerprint!~'^[a-f0-9]{64}$'
 or p_provider is null or p_provider not in ('openai','anthropic','perplexity') or coalesce(length(p_model),0) not between 1 and 160
 or p_retry_ordinal is null or p_retry_ordinal not in (0,1) or p_is_same_model_repair is null or p_used_provider_fallback is null
 or not ((p_retry_ordinal=0 and not p_is_same_model_repair and not p_used_provider_fallback and p_previous_invocation_id is null)
 or (p_retry_ordinal=1 and p_is_same_model_repair and not p_used_provider_fallback and p_previous_invocation_id is not null)
 or (p_retry_ordinal=0 and not p_is_same_model_repair and p_used_provider_fallback and p_previous_invocation_id is not null))
 or jsonb_typeof(p_components) is distinct from 'array' or jsonb_array_length(p_components) not between 1 and 1000 then
 raise exception 'capital_body_input_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-invocation:'||job.organization_id::text||':'||p_invocation_id::text,0)) then
 raise exception 'capital_capture_retry' using errcode='40001';end if;
 if p_previous_invocation_id is not null and not exists(select 1 from private.capital_body_invocation_inputs prior
 where prior.organization_id=job.organization_id and prior.job_id=job.id and prior.invocation_id=p_previous_invocation_id
 and not prior.used_provider_fallback and ((p_is_same_model_repair and prior.retry_ordinal=0 and prior.provider=p_provider and prior.model=p_model)
 or (p_used_provider_fallback and (prior.provider,prior.model) is distinct from (p_provider,p_model)))) then
 raise exception 'capital_body_input_invalid' using errcode='22023';end if;
 for component in select value from jsonb_array_elements(p_components) loop
 ordinal:=ordinal+1;
 if jsonb_typeof(component) is distinct from 'object' or component->>'kind' is null or component->>'kind' not in ('contribution','retained_payload')
 or not(component?'id') or (select count(*) from jsonb_object_keys(component))<>2 then raise exception 'capital_body_input_invalid' using errcode='22023';end if;
 if component->>'kind'='contribution' then
 origin:=private.capital_body_capture_origin_v1(job.organization_id,work,(component->>'id')::uuid,job.authorization_subject_id);
 resolved_components:=resolved_components||jsonb_build_array(jsonb_build_object('kind','contribution','id',origin));
 else
 select a.* into parent from private.capital_public_retained_payloads r join private.capital_public_payload_allocations a
 on a.organization_id=r.organization_id and a.id=r.allocation_id where r.organization_id=job.organization_id and r.id=(component->>'id')::uuid;
 if not found or parent.job_id<>job.id or not private.capital_body_physical_receipt_v1(job.organization_id,(component->>'id')::uuid) or private.capital_body_allocation_deadline_v1(job.organization_id,parent.id,job.authorization_subject_id) is null
 or not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=job.organization_id and allocation_id=parent.id and status='pending')
 or (parent.content_kind='typed_body' and not exists(select 1 from private.capital_body_bases where organization_id=job.organization_id and id=parent.body_basis_id and work_id=work))
 or (parent.content_kind='public_source' and not exists(select 1 from private.capital_public_delivery_licenses l join private.capital_public_deliveries d on d.organization_id=l.organization_id and d.id=l.delivery_id
 join private.capital_public_input_snapshots s on s.organization_id=d.organization_id and s.id=d.capture_id where l.organization_id=job.organization_id and l.id=parent.license_id and s.work_id=work)) then
 raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 resolved_components:=resolved_components||jsonb_build_array(jsonb_build_object('kind','retained_payload','id',(component->>'id')::uuid));
 end if;
 end loop;
 select * into receipt from private.capital_body_invocation_inputs where organization_id=job.organization_id and invocation_id=p_invocation_id;
 if found then
 select jsonb_agg(jsonb_build_object('kind',component_kind,'id',coalesce(origin_id,retained_payload_id)) order by component_no) into previous_components
 from private.capital_body_input_components where organization_id=job.organization_id and input_receipt_id=receipt.id;
 if receipt.job_id<>job.id or receipt.work_id<>work or receipt.adapter_request_fingerprint<>p_adapter_request_fingerprint
 or receipt.input_fingerprint<>p_input_fingerprint or receipt.prompt_fingerprint<>p_prompt_fingerprint or receipt.provider<>p_provider or receipt.model<>p_model
 or (receipt.retry_ordinal,receipt.is_same_model_repair,receipt.used_provider_fallback,receipt.previous_invocation_id)
 is distinct from (p_retry_ordinal,p_is_same_model_repair,p_used_provider_fallback,p_previous_invocation_id)
 or previous_components is distinct from resolved_components then raise exception 'capital_body_input_conflict' using errcode='23505';end if;
 else
 insert into private.capital_body_invocation_inputs(organization_id,work_id,job_id,invocation_id,adapter_input_version,adapter_request_fingerprint,input_fingerprint,prompt_fingerprint,provider,model,retry_ordinal,is_same_model_repair,used_provider_fallback,previous_invocation_id,worker_account_id,human_subject_id,captured_at)
 values(job.organization_id,work,job.id,p_invocation_id,'gateway-adapter-input.v1',p_adapter_request_fingerprint,p_input_fingerprint,p_prompt_fingerprint,p_provider,p_model,p_retry_ordinal,p_is_same_model_repair,p_used_provider_fallback,p_previous_invocation_id,auth.uid(),job.authorization_subject_id,stamp) returning * into receipt;
 ordinal:=0;
 for component in select value from jsonb_array_elements(resolved_components) loop
 ordinal:=ordinal+1;
 insert into private.capital_body_input_components(organization_id,work_id,input_receipt_id,component_no,component_kind,origin_id,retained_payload_id)
 values(job.organization_id,work,receipt.id,ordinal,component->>'kind',case when component->>'kind'='contribution' then (component->>'id')::uuid end,
 case when component->>'kind'='retained_payload' then (component->>'id')::uuid end);
 end loop;
 end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return jsonb_build_object('receiptId',receipt.id,'invocationId',receipt.invocation_id,'requestFingerprint',receipt.adapter_request_fingerprint);
end; $$;

-- Matches the published GatewayAcceptedInvocation metadata shape. Output fingerprint
-- uses gateway-parsed-output.v1 (legacyGatewayFingerprint JS/localeCompare), NOT
-- digest(jsonb::text). It stays separate from the retained byte SHA256 below.
create function private.worker_record_capital_body_accepted_v1(p_job_id uuid,p_capability_token text,p_input_receipt_id uuid,p_accepted jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 input_row private.capital_body_invocation_inputs;accepted private.capital_body_accepted_invocations;
begin
 select * into input_row from private.capital_body_invocation_inputs where organization_id=job.organization_id and id=p_input_receipt_id and job_id=job.id;
 if not found or input_row.worker_account_id<>auth.uid() then raise exception 'capital_body_accepted_denied' using errcode='42501';end if;
 if jsonb_typeof(p_accepted) is distinct from 'object' or p_accepted->>'schemaVersion' is distinct from 'gateway-accepted-invocation.v1'
 or p_accepted->>'adapterInputVersion' is distinct from input_row.adapter_input_version
 or p_accepted->>'invocationId' is distinct from input_row.invocation_id::text
 or p_accepted->>'inputAttestationReceiptId' is distinct from input_row.id::text
 or p_accepted->>'adapterRequestFingerprint' is distinct from input_row.adapter_request_fingerprint
 or jsonb_typeof(p_accepted->'fromCassette') is distinct from 'boolean' or p_accepted->>'fromCassette' is distinct from 'false'
 or exists(select 1 from unnest(array['schemaVersion','invocationId','adapterInputVersion','adapterRequestFingerprint','outputFingerprintVersion','outputFingerprint','inputFingerprint','promptFingerprint','provider','configuredModel','reportedModel','schemaName','inputAttestationReceiptId']) key where jsonb_typeof(p_accepted->key) is distinct from 'string')
 or p_accepted->>'outputFingerprintVersion' is distinct from 'gateway-parsed-output.v1'
 or p_accepted->>'inputFingerprint' is distinct from input_row.input_fingerprint
 or p_accepted->>'promptFingerprint' is distinct from input_row.prompt_fingerprint
 or p_accepted->>'provider' is distinct from input_row.provider
 or p_accepted->>'configuredModel' is distinct from input_row.model
 or jsonb_typeof(p_accepted->'reportedModel') is distinct from 'string' or coalesce(length(p_accepted->>'reportedModel'),0) not between 1 and 160
 or p_accepted->>'schemaName' is distinct from 'origination_senior_readout_v2'
 or jsonb_typeof(p_accepted->'retryOrdinal') is distinct from 'number' or p_accepted->>'retryOrdinal' is distinct from input_row.retry_ordinal::text
 or p_accepted->>'isSameModelRepair' is distinct from input_row.is_same_model_repair::text
 or p_accepted->>'usedProviderFallback' is distinct from input_row.used_provider_fallback::text
 or jsonb_typeof(p_accepted->'isSameModelRepair') is distinct from 'boolean' or jsonb_typeof(p_accepted->'usedProviderFallback') is distinct from 'boolean'
 or exists(select 1 from jsonb_object_keys(p_accepted) key where key not in ('schemaVersion','invocationId','adapterInputVersion','adapterRequestFingerprint','outputFingerprintVersion','outputFingerprint','inputFingerprint','promptFingerprint','provider','configuredModel','reportedModel','schemaName','retryOrdinal','isSameModelRepair','usedProviderFallback','fromCassette','inputAttestationReceiptId'))
 or p_accepted->>'outputFingerprint' is null or (p_accepted->>'outputFingerprint')!~'^[a-f0-9]{64}$'
 then raise exception 'capital_body_accepted_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-invocation:'||job.organization_id::text||':'||input_row.invocation_id::text,0)) then
 raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into accepted from private.capital_body_accepted_invocations where organization_id=job.organization_id and input_receipt_id=input_row.id;
 if found then
 if accepted.output_fingerprint<>p_accepted->>'outputFingerprint' or accepted.invocation_id<>input_row.invocation_id or accepted.accepted_identity is distinct from p_accepted then raise exception 'capital_body_accepted_conflict' using errcode='23505';end if;
 else
 insert into private.capital_body_accepted_invocations(organization_id,work_id,input_receipt_id,invocation_id,output_fingerprint,accepted_identity,from_cassette)
 values(job.organization_id,input_row.work_id,input_row.id,input_row.invocation_id,p_accepted->>'outputFingerprint',p_accepted,false) returning * into accepted;
 end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return jsonb_build_object('acceptedInvocationId',accepted.id,'inputReceiptId',input_row.id,'invocationId',accepted.invocation_id,'outputFingerprint',accepted.output_fingerprint);
end; $$;

create function private.worker_commit_capital_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,
 p_storage_version text,p_verified_sha256 text,p_verified_size bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;basis private.capital_body_bases;receipt private.capital_public_retained_payloads;
 object_row storage.objects;deadline timestamptz;margin integer;replayed boolean:=false;result_dto jsonb;
begin
 select * into allocation from private.capital_public_payload_allocations where organization_id=job.organization_id and job_id=job.id and id=p_allocation_id and content_kind='typed_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 if p_storage_object_id is null or coalesce(length(p_storage_version),0) not between 1 and 1024 or p_verified_sha256 is distinct from allocation.payload_fingerprint or p_verified_size is distinct from allocation.byte_length then
 raise exception 'capital_body_proof_invalid' using errcode='22023';end if;
 deadline:=private.capital_body_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 if deadline is null or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
 or not private.capital_public_retention_healthy_v1(job.leased_by,allocation.policy_id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 begin
 perform 1 from private.capital_public_payload_purge_queue where organization_id=job.organization_id and allocation_id=allocation.id and status='pending' for share nowait;
 if not found then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 select * into object_row from storage.objects where id=p_storage_object_id and bucket_id=allocation.bucket_id and name=allocation.object_path for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if object_row.id is null or object_row.version is distinct from p_storage_version or object_row.metadata->>'size' is distinct from allocation.byte_length::text
 or object_row.metadata->>'mimetype' is distinct from 'application/json' or (to_jsonb(object_row)->>'is_versioned')::boolean is true
 or (to_jsonb(object_row)->>'is_delete_marker')::boolean is true or to_jsonb(object_row)->>'archived_at' is not null or not private.capital_public_capture_bucket_safe_v1() then
 raise exception 'capital_body_proof_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-request:'||job.organization_id::text||':'||job.id::text||':'||allocation.request_id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into receipt from private.capital_public_retained_payloads where organization_id=job.organization_id and allocation_id=allocation.id;
 if found then
 if receipt.storage_object_id<>p_storage_object_id or receipt.storage_version<>p_storage_version or receipt.verified_sha256<>p_verified_sha256 or receipt.verified_size<>p_verified_size then
 raise exception 'capital_body_proof_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 if allocation.upload_expires_at<=clock_timestamp() then raise exception 'capital_body_upload_expired' using errcode='42501';end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 insert into private.capital_public_retained_payloads(organization_id,allocation_id,storage_object_id,storage_version,verified_sha256,verified_size,verified_by)
 values(job.organization_id,allocation.id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size,auth.uid()) returning * into receipt;
 update private.capital_public_payload_purge_queue set next_check_at=least(allocation.purge_at,deadline-make_interval(secs=>margin)),
 effective_purge_at=least(effective_purge_at,allocation.purge_at,deadline-make_interval(secs=>margin)),updated_at=clock_timestamp()
 where organization_id=job.organization_id and allocation_id=allocation.id;
 end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token)
 then raise exception 'capital_capture_denied' using errcode='42501';end if;
 result_dto:=private.capital_body_dto_v1(job.organization_id,allocation.id,deadline,replayed);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

-- PR1 exposes only the retained object's ORIGINAL live job. No same-work grant,
-- historical human reader, fabricated task binding, or weakening of public v1.
create function private.worker_read_capital_body_v1(p_job_id uuid,p_capability_token text,p_retained_payload_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 receipt private.capital_public_retained_payloads;allocation private.capital_public_payload_allocations;
 deadline timestamptz;margin integer;result_dto jsonb;
begin
 select r.* into receipt from private.capital_public_retained_payloads r
 join private.capital_public_payload_allocations a on a.organization_id=r.organization_id and a.id=r.allocation_id
 where r.organization_id=job.organization_id and r.id=p_retained_payload_id and a.content_kind='typed_body' and a.job_id=job.id;
 if not found then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 select * into strict allocation from private.capital_public_payload_allocations where organization_id=job.organization_id and id=receipt.allocation_id;
 if not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id)
 or not private.capital_body_physical_receipt_v1(job.organization_id,receipt.id) then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 deadline:=private.capital_body_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 if deadline is null or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
 or not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 result_dto:=private.capital_body_dto_v1(job.organization_id,allocation.id,deadline,true);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

create function private.capital_body_storage_allowed_v1(p_allocation uuid,p_mode text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;human uuid;deadline timestamptz;margin integer;
begin
 if auth.uid() is null or p_mode not in ('read','upload') or not private.capital_public_capture_bucket_safe_v1() then return false;end if;
 select * into allocation from private.capital_public_payload_allocations where id=p_allocation and content_kind='typed_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id) then return false;end if;
 if exists(select 1 from storage.objects o where o.bucket_id=allocation.bucket_id and o.name=allocation.object_path
 and ((to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false;end if;
 if p_mode='upload' and (allocation.upload_expires_at<=clock_timestamp()
 or exists(select 1 from private.capital_public_retained_payloads where organization_id=allocation.organization_id and allocation_id=allocation.id)) then return false;end if;
 if p_mode='read' and not storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info']) then return false;end if;
 select authorization_subject_id into human from public.processing_jobs where organization_id=allocation.organization_id and id=allocation.job_id;
 if not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=allocation.organization_id and allocation_id=allocation.id and status='pending') then return false;end if;
 deadline:=private.capital_body_allocation_deadline_v1(allocation.organization_id,allocation.id,human);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 return deadline is not null and least(allocation.purge_at,deadline-make_interval(secs=>margin))>clock_timestamp()
 and private.capital_body_retention_healthy_v1(allocation.policy_id,allocation.organization_id,allocation.id);
end; $$;

create function private.capital_body_wakes_pending_v1(p_org uuid,p_allocation uuid default null,p_input uuid default null)
returns boolean language sql volatile security definer set search_path='' as $$
 with recursive seeds(organization_id,id) as (
 select a.organization_id,a.id from private.capital_public_payload_allocations a where a.organization_id=p_org and a.id=p_allocation
 union select c.organization_id,r.allocation_id from private.capital_body_input_components c
 join private.capital_public_retained_payloads r on r.organization_id=c.organization_id and r.id=c.retained_payload_id
 where c.organization_id=p_org and c.input_receipt_id=p_input),
 closure(organization_id,id) as (
 select organization_id,id from seeds
 union select c.organization_id,r.allocation_id from closure previous
 join private.capital_public_payload_allocations a on a.organization_id=previous.organization_id and a.id=previous.id
 join private.capital_body_bases b on b.organization_id=a.organization_id and b.id=a.body_basis_id
 join private.capital_body_accepted_invocations ok on ok.organization_id=b.organization_id and ok.id=b.accepted_invocation_id
 join private.capital_body_input_components c on c.organization_id=ok.organization_id and c.input_receipt_id=ok.input_receipt_id
 join private.capital_public_retained_payloads r on r.organization_id=c.organization_id and r.id=c.retained_payload_id)
 select exists(select 1 from private.capital_body_retention_wakes w where
 (p_allocation is null and p_input is null and w.organization_id=p_org)
 or exists(select 1 from closure c where c.organization_id=w.organization_id and c.id=w.allocation_id)
 or exists(select 1 from closure c join private.capital_public_payload_allocations a on a.organization_id=c.organization_id and a.id=c.id
 where a.content_kind='public_source' and a.licensing_organization_id=w.organization_id));
$$;

create function private.capital_body_retention_healthy_v1(p_policy uuid,p_org uuid,p_allocation uuid default null,p_input uuid default null)
returns boolean language sql volatile security definer set search_path='' as $$
 select not private.capital_body_wakes_pending_v1(p_org,p_allocation,p_input)
 and exists(select 1 from private.capital_public_purge_health h where private.capital_public_retention_healthy_v1(h.worker_token_id,p_policy));
$$;

create function private.require_capital_body_retention_ready_v1(p_policy uuid,p_org uuid,p_allocation uuid default null,p_input uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if private.capital_body_wakes_pending_v1(p_org,p_allocation,p_input) then
 raise exception 'capital_body_retention_pending' using errcode='40001';end if;
 if not private.capital_body_retention_healthy_v1(p_policy,p_org,p_allocation,p_input) then
 raise exception 'capital_body_retention_denied' using errcode='42501';end if;
end; $$;

-- Dispatch used only by existing purge and the new body service. Public v1 commands
-- still call their unchanged public-license resolver and cannot admit a body row.
create function private.capital_capture_allocation_deadline_v2(p_org uuid,p_allocation uuid) returns timestamptz
language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;human uuid;
begin
 select * into allocation from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 if not found then return null;end if;
 if allocation.content_kind='public_source' then return private.capital_public_retention_deadline_v1(allocation.license_id,p_org,allocation.retained_at,allocation.policy_id);end if;
 select authorization_subject_id into human from public.processing_jobs where organization_id=p_org and id=allocation.job_id;
 return private.capital_body_allocation_deadline_v1(p_org,allocation.id,human);
end; $$;

create function private.capital_body_physical_receipt_v1(p_org uuid,p_retained uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select private.capital_public_capture_bucket_safe_v1() and exists(select 1 from private.capital_public_retained_payloads r
 join private.capital_public_payload_allocations a on a.organization_id=r.organization_id and a.id=r.allocation_id
 join storage.objects o on o.id=r.storage_object_id and o.bucket_id=a.bucket_id and o.name=a.object_path
 where r.organization_id=p_org and r.id=p_retained and o.version=r.storage_version
 and o.metadata->>'size'=r.verified_size::text and o.metadata->>'mimetype'='application/json'
 and (to_jsonb(o)->>'is_versioned')::boolean is not true and (to_jsonb(o)->>'is_delete_marker')::boolean is not true and to_jsonb(o)->>'archived_at' is null
 and exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending'));
$$;

create function private.capital_body_dto_v1(p_org uuid,p_allocation uuid,p_deadline timestamptz,p_replayed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;receipt private.capital_public_retained_payloads;margin integer;
begin
 select * into strict allocation from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 select * into receipt from private.capital_public_retained_payloads where organization_id=p_org and allocation_id=allocation.id;
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 return jsonb_build_object('schemaVersion','capital-retained-body.v1','retentionState',case when receipt.id is null then 'allocated' else 'retained' end,
 'allocationId',allocation.id,'retainedPayloadId',receipt.id,'bodyBasisId',allocation.body_basis_id,'bucket',allocation.bucket_id,'path',allocation.object_path,
 'payloadFingerprint',allocation.payload_fingerprint,'byteLength',allocation.byte_length,'storageObjectId',receipt.storage_object_id,'storageVersion',receipt.storage_version,
 'retainedAt',allocation.retained_at,'uploadExpiresAt',allocation.upload_expires_at,'expiresAt',least(allocation.expires_at,p_deadline),
 'purgeAt',least(allocation.purge_at,p_deadline-make_interval(secs=>margin)),'replayed',p_replayed);
end; $$;

create function private.worker_prepare_capital_body_v1(p_job_id uuid,p_capability_token text,p_request_id uuid,p_kind text,p_origin_or_accepted_id uuid,
 p_body jsonb default null,p_gateway_output_fingerprint text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 work uuid;origin uuid;accepted private.capital_body_accepted_invocations;input_row private.capital_body_invocation_inputs;
 basis private.capital_body_bases;allocation private.capital_public_payload_allocations;policy private.capital_public_retention_policies;
 canonical_body jsonb;schema_version text;fp text;bytes bigint;stamp timestamptz:=clock_timestamp();deadline timestamptz;
 component private.capital_body_input_components;bound timestamptz;parent private.capital_public_payload_allocations;new_allocation_id uuid:=gen_random_uuid();replayed boolean:=false;result_dto jsonb;
begin
 work:=coalesce(job.work_id,(job.payload->>'capital_project_id')::uuid);
 if p_request_id is null or p_origin_or_accepted_id is null or p_kind is null or p_kind not in ('contribution_input','gateway_accepted_output') then
 raise exception 'capital_body_prepare_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-request:'||job.organization_id::text||':'||job.id::text||':'||p_request_id::text,0)) then
 raise exception 'capital_capture_retry' using errcode='40001';end if;
 begin perform 1 from private.capital_public_retention_controls where singleton for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 select p.* into policy from private.capital_public_retention_policies p join private.capital_public_retention_controls c on c.policy_id=p.id where c.singleton and c.enabled;
 if not found or not private.capital_public_retention_healthy_v1(job.leased_by,policy.id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 if p_kind='contribution_input' then
 if p_body is not null or p_gateway_output_fingerprint is not null then raise exception 'capital_body_prepare_invalid' using errcode='22023';end if;
 origin:=private.capital_body_capture_origin_v1(job.organization_id,work,p_origin_or_accepted_id,job.authorization_subject_id);
 select jsonb_build_object('schemaVersion','capital-body.contribution.v1','content',content) into canonical_body from public.contribution_revisions
 where organization_id=job.organization_id and work_id=work and id=p_origin_or_accepted_id;
 schema_version:='capital-body.contribution.v1';
 deadline:=private.capital_body_origin_deadline_v1(job.organization_id,origin,job.authorization_subject_id,stamp,policy.id);
 else
 select ok.* into accepted from private.capital_body_accepted_invocations ok join private.capital_body_invocation_inputs i on i.organization_id=ok.organization_id and i.id=ok.input_receipt_id
 where ok.organization_id=job.organization_id and ok.work_id=work and ok.id=p_origin_or_accepted_id and i.job_id=job.id and i.worker_account_id=auth.uid();
 if not found or jsonb_typeof(p_body) is distinct from 'object' then raise exception 'capital_body_accepted_denied' using errcode='42501';end if;
 select * into strict input_row from private.capital_body_invocation_inputs where organization_id=job.organization_id and id=accepted.input_receipt_id;
 if p_gateway_output_fingerprint is distinct from accepted.output_fingerprint then raise exception 'capital_body_prepare_invalid' using errcode='22023';end if;
 schema_version:='origination_senior_readout_v2';
 -- Bounded worker MUST parse seniorReadoutSchema and recompute gateway-parsed-output.v1
 -- with the real JS function BEFORE this call and after physical readback. SQL verifies
 -- identity/physical bytes, not semantic fingerprint or model output provenance.
 canonical_body:=p_body;deadline:=stamp+make_interval(secs=>policy.maximum_retention_seconds);
 if not exists(select 1 from private.capital_body_input_components where organization_id=job.organization_id and input_receipt_id=input_row.id) then raise exception 'capital_body_input_denied' using errcode='42501';end if;
 for component in select * from private.capital_body_input_components where organization_id=job.organization_id and input_receipt_id=input_row.id order by component_no loop
 if component.component_kind='contribution' then bound:=private.capital_body_origin_deadline_v1(job.organization_id,component.origin_id,job.authorization_subject_id,input_row.captured_at,policy.id);
 else
 select a.* into parent from private.capital_public_retained_payloads r join private.capital_public_payload_allocations a on a.organization_id=r.organization_id and a.id=r.allocation_id where r.organization_id=job.organization_id and r.id=component.retained_payload_id;
 if not found or not private.capital_body_physical_receipt_v1(job.organization_id,component.retained_payload_id) then raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 bound:=private.capital_body_allocation_deadline_v1(job.organization_id,parent.id,job.authorization_subject_id);
 if bound is null then raise exception 'capital_body_rights_denied' using errcode='42501';end if;
 bound:=least(bound,parent.expires_at,parent.purge_at+make_interval(secs=>policy.purge_margin_seconds));
 end if;
 if bound is null then raise exception 'capital_body_rights_denied' using errcode='42501';end if;
 deadline:=least(deadline,bound);
 end loop;
 end if;
 if deadline is null or deadline-make_interval(secs=>policy.purge_margin_seconds)<=clock_timestamp() then raise exception 'capital_body_rights_denied' using errcode='42501';end if;
 -- New allocation admits only after its recipe's closure resolves pending wakes.
 -- Existing replay is checked below against its exact allocation closure.
 if not exists(select 1 from private.capital_public_payload_allocations a where a.organization_id=job.organization_id and a.job_id=job.id and a.request_id=p_request_id and a.content_kind='typed_body') then
 perform private.require_capital_body_retention_ready_v1(policy.id,job.organization_id,null,input_row.id);end if;
 fp:=encode(extensions.digest(canonical_body::text,'sha256'),'hex');bytes:=octet_length(canonical_body::text);
 if bytes not between 1 and 1048576 then raise exception 'capital_body_size_invalid' using errcode='22023';end if;
 select * into allocation from private.capital_public_payload_allocations where organization_id=job.organization_id and job_id=job.id and request_id=p_request_id and content_kind='typed_body';
 if found then
 select * into strict basis from private.capital_body_bases where organization_id=job.organization_id and id=allocation.body_basis_id;
 replayed:=true;
 if allocation.payload_fingerprint<>fp or allocation.byte_length<>bytes or basis.kind<>p_kind or basis.origin_id is distinct from origin
 or basis.accepted_invocation_id is distinct from accepted.id then raise exception 'capital_body_request_conflict' using errcode='23505';end if;
 deadline:=private.capital_body_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 if deadline is null or least(allocation.purge_at,deadline-make_interval(secs=>policy.purge_margin_seconds))<=clock_timestamp() then raise exception 'capital_body_rights_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(policy.id,job.organization_id,allocation.id);
 if exists(select 1 from private.capital_public_retained_payloads where organization_id=job.organization_id and allocation_id=allocation.id) then
 if not exists(select 1 from private.capital_public_retained_payloads r where r.organization_id=job.organization_id and r.allocation_id=allocation.id
 and private.capital_body_physical_receipt_v1(job.organization_id,r.id)) or not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then
 raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 result_dto:=private.capital_body_dto_v1(job.organization_id,allocation.id,deadline,true);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
 end if;
 if allocation.upload_expires_at<=clock_timestamp() then raise exception 'capital_body_upload_expired' using errcode='42501';end if;
 else
 insert into private.capital_body_bases(organization_id,work_id,kind,origin_id,accepted_invocation_id,body_schema_version)
 values(job.organization_id,work,p_kind,origin,accepted.id,schema_version) returning * into basis;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,
 payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,body_basis_id,content_kind)
 values(new_allocation_id,job.organization_id,p_request_id,job.id,job.leased_by,auth.uid(),job.capability_sha256,policy.id,fp,bytes,job.organization_id::text||'/'||new_allocation_id::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>policy.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>policy.purge_margin_seconds)),basis.id,'typed_body') returning * into allocation;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at)
 values(job.organization_id,allocation.id,least(allocation.upload_expires_at,allocation.purge_at),allocation.purge_at);
 end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 result_dto:=private.capital_body_dto_v1(job.organization_id,allocation.id,deadline,replayed)||jsonb_build_object('canonicalBody',canonical_body::text);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

set search_path='';
create function private.drain_capital_body_retention_wakes_v1(p_worker_token text,p_limit integer default 200) returns integer
language plpgsql security definer set search_path='' as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);wake private.capital_body_retention_wakes;
 queue_row private.capital_public_payload_purge_queue;allocation private.capital_public_payload_allocations;deadline timestamptz;margin integer;n integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'capture_purge_invalid' using errcode='22023';end if;
 for wake in select * from private.capital_body_retention_wakes order by created_at,allocation_id limit p_limit for update skip locked loop
 begin
 select * into queue_row from private.capital_public_payload_purge_queue where organization_id=wake.organization_id and allocation_id=wake.allocation_id for update nowait;
 if not found or queue_row.status='purged' then
 delete from private.capital_body_retention_wakes where id=wake.id;
 continue;
 end if;
 if queue_row.status='leased' and queue_row.lease_expires_at>clock_timestamp() then continue;end if;
 select * into strict allocation from private.capital_public_payload_allocations where organization_id=wake.organization_id and id=wake.allocation_id;
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 deadline:=private.capital_capture_allocation_deadline_v2(wake.organization_id,wake.allocation_id);
 update private.capital_public_payload_purge_queue set next_check_at=clock_timestamp(),
 effective_purge_at=least(effective_purge_at,coalesce(deadline-make_interval(secs=>margin),clock_timestamp())),updated_at=clock_timestamp()
 where organization_id=wake.organization_id and allocation_id=wake.allocation_id;
 delete from private.capital_body_retention_wakes where id=wake.id;
 n:=n+1;
 exception when lock_not_available or sqlstate '40001' then
 -- Subtransaction releases q locks. Durable wake survives and closes body admission.
 continue;
 end;
 end loop;
 return n;
end; $$;

-- Trigger writes only a durable wake; never waits for a purge q row while holding
-- rights/resource-policy authority. The drain's q frontier is NOWAIT and its policy
-- frontier try-lock. Concurrency proof still required before integration.
create function private.wake_capital_body_rights_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare org uuid;version_id uuid;binding_id uuid;
begin
 if tg_table_name='source_rights_versions' then org:=new.organization_id;version_id:=new.source_version_id;
 elsif tg_table_name='source_bindings' then
 if new.revoked_at is not distinct from old.revoked_at then return new;end if;
 org:=new.organization_id;binding_id:=new.id;
 else org:=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
 version_id:=case when tg_op='DELETE' then old.derived_version_id else new.derived_version_id end;
 end if;
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_body_source_pins pin
 join private.capital_body_bases b on b.organization_id=pin.organization_id and
 (b.origin_id=pin.origin_id or exists(select 1 from private.capital_body_accepted_invocations ok
 join private.capital_body_input_components c on c.organization_id=ok.organization_id and c.input_receipt_id=ok.input_receipt_id
 where ok.organization_id=b.organization_id and ok.id=b.accepted_invocation_id and c.origin_id=pin.origin_id))
 join private.capital_public_payload_allocations a on a.organization_id=b.organization_id and a.body_basis_id=b.id
 join private.capital_public_payload_purge_queue q on q.organization_id=a.organization_id and q.allocation_id=a.id and q.status<>'purged'
 where pin.organization_id=org and ((version_id is not null and pin.source_version_id=version_id) or (binding_id is not null and pin.source_binding_id=binding_id))
;
 return case when tg_op='DELETE' then old else new end;
end; $$;
create trigger capital_body_rights_wake after insert on private.source_rights_versions for each row execute function private.wake_capital_body_rights_v1();
create trigger capital_body_binding_wake after update of revoked_at on public.source_bindings for each row execute function private.wake_capital_body_rights_v1();
create trigger capital_body_dependencies_wake after insert or delete on private.resource_dependencies for each row execute function private.wake_capital_body_rights_v1();

-- An expired/revoked parent propagates to derived allocations, including public
-- parents from the unchanged licensed-source service. Indexed exact parent IDs.
create function private.wake_capital_body_descendants_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.effective_purge_at>=old.effective_purge_at and not(new.status='leased' and old.status<>'leased') then return new;end if;
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_retained_payloads r
 join private.capital_body_bases b on b.organization_id=r.organization_id and
 (exists(select 1 from private.capital_body_accepted_invocations ok
 join private.capital_body_input_components c on c.organization_id=ok.organization_id and c.input_receipt_id=ok.input_receipt_id
 where ok.organization_id=b.organization_id and ok.id=b.accepted_invocation_id and c.retained_payload_id=r.id))
 join private.capital_public_payload_allocations a on a.organization_id=b.organization_id and a.body_basis_id=b.id
 join private.capital_public_payload_purge_queue q on q.organization_id=a.organization_id and q.allocation_id=a.id and q.status<>'purged'
 where r.organization_id=new.organization_id and r.allocation_id=new.allocation_id
;
 return new;
end; $$;
create trigger capital_body_parent_wake after update of effective_purge_at,status on private.capital_public_payload_purge_queue
 for each row execute function private.wake_capital_body_descendants_v1();

-- Caller identity/access revocation denies reads immediately; wake origin-actor
-- bodies for physical erasure. This observes existing writers rather than changing them.
create function private.wake_capital_body_subject_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare org uuid;subject uuid;
begin
 if tg_table_name='authorization_revisions' then org:=new.organization_id;subject:=new.subject_user_id;
 elsif tg_table_name='organization_memberships' then
 if tg_op='DELETE' then org:=old.organization_id;subject:=old.user_id;
 else
 if new.status is not distinct from old.status then return new;end if;
 org:=new.organization_id;subject:=new.user_id;end if;
 else
 if new.deleted_at is not distinct from old.deleted_at and new.banned_until is not distinct from old.banned_until then return new;end if;
 subject:=new.id;
 end if;
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select a.organization_id,a.id from private.capital_public_payload_allocations a
 join public.processing_jobs j on j.organization_id=a.organization_id and j.id=a.job_id
 join private.capital_public_payload_purge_queue q on q.organization_id=a.organization_id and q.allocation_id=a.id and q.status<>'purged'
 where a.content_kind='typed_body' and j.authorization_subject_id=subject and (org is null or a.organization_id=org)
 -- Reevaluate source-resource permission changes too, not just the originating work.
;
 if tg_op='DELETE' then return old;end if;
 return new;
end; $$;
create trigger capital_body_authority_wake after update on private.authorization_revisions for each row execute function private.wake_capital_body_subject_v1();
create trigger capital_body_membership_wake after update of status or delete on public.organization_memberships for each row execute function private.wake_capital_body_subject_v1();
create trigger capital_body_identity_wake after update of deleted_at,banned_until on auth.users for each row execute function private.wake_capital_body_subject_v1();

-- Full replacements are copied from installed retention migration 20260930220853;
-- only the typed-body dispatch and durable wake drain below are new. No runtime
-- pg_get_functiondef string patch. Revalidate these bodies against live catalog
-- before converting the draft to a real forward migration.
create or replace function private.worker_can_access_capital_public_payload_v1(p_bucket text,p_path text,p_mode text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations; deadline timestamptz; margin integer;
begin
 if auth.uid() is null or p_bucket<>'capital-input-capture' or not private.capital_public_capture_bucket_safe_v1() then return false; end if;
 select * into a from private.capital_public_payload_allocations where bucket_id=p_bucket and object_path=p_path;
 if not found then return false; end if;
 if a.content_kind='typed_body' and p_mode in ('read','upload') then
  return private.capital_body_storage_allowed_v1(a.id,p_mode);
 end if;
 if exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path
  and ((to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false; end if;
 if p_mode in ('purge','purge_select') then
  if p_mode='purge_select' and not storage.allow_any_operation(array['object.delete','object.delete_many','object.get_authenticated_info','object.head_authenticated_info']) then return false; end if;
  return exists(select 1 from private.capital_public_payload_purge_queue q join private.worker_tokens w on w.id=q.worker_token_id
   join auth.users u on u.id=q.leased_account_id where q.organization_id=a.organization_id and q.allocation_id=a.id and q.status='leased'
   and q.leased_account_id=auth.uid() and q.lease_expires_at>clock_timestamp() and w.status='active' and w.revoked_at is null
   and w.execution_account_user_id=auth.uid() and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()));
 end if;
 if p_mode not in ('read','upload') or not private.capital_public_allocation_job_current_v1(a.id)
  or not private.capital_public_retention_healthy_v1(a.worker_token_id,a.policy_id) then return false; end if;
 if p_mode='upload' and (a.upload_expires_at<=clock_timestamp() or exists(select 1 from private.capital_public_retained_payloads where organization_id=a.organization_id and allocation_id=a.id)) then return false; end if;
 if p_mode='read' and not storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info']) then return false; end if;
 if not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=a.organization_id and allocation_id=a.id and status='pending') then return false; end if;
 deadline:=private.capital_public_retention_deadline_v1(a.license_id,a.organization_id,a.retained_at,a.policy_id);
 select purge_margin_seconds into margin from private.capital_public_retention_policies where id=a.policy_id;
 if deadline is null or least(a.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp() then return false; end if;
 return true;
end; $$;

create or replace function private.worker_claim_capital_capture_purge_v1(p_worker_token text,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token); item private.capital_public_payload_purge_queue;
 a private.capital_public_payload_allocations; deadline timestamptz; margin integer; capability text;
 items jsonb:='[]'::jsonb; polled timestamptz:=clock_timestamp(); object_id uuid; object_version text; has_receipt boolean;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'capture_purge_invalid' using errcode='22023'; end if;
 if not private.capital_public_capture_bucket_safe_v1() then raise exception 'capture_bucket_unsafe' using errcode='42501'; end if;
 perform private.drain_capital_body_retention_wakes_v1(p_worker_token,p_limit*10);
 if not pg_try_advisory_xact_lock(hashtextextended('capital-capture-purge-poll:'||worker::text,0)) then raise exception 'capital_capture_retry' using errcode='40001'; end if;
 insert into private.capital_public_purge_health(worker_token_id,polled_at) values(worker,polled)
 on conflict(worker_token_id) do update set polled_at=excluded.polled_at,updated_at=clock_timestamp();
 -- Rights/binding/dependency events expedite exact linked rows. Poll only due rows;
 -- no periodic full sweep of retained objects. Human/job revocation still denies read.
 for item in select * from private.capital_public_payload_purge_queue
  where status<>'purged' and next_check_at<=clock_timestamp() and (status<>'leased' or lease_expires_at<=clock_timestamp())
  order by next_check_at,id limit p_limit*10 for update skip locked loop
  select * into strict a from private.capital_public_payload_allocations where organization_id=item.organization_id and id=item.allocation_id;
  select purge_margin_seconds into margin from private.capital_public_retention_policies where id=a.policy_id;
  begin
   deadline:=private.capital_capture_allocation_deadline_v2(a.organization_id,a.id);
  exception when sqlstate '40001' then
   update private.capital_public_payload_purge_queue set status='pending',next_check_at=clock_timestamp()+interval '1 second',updated_at=clock_timestamp(),
    last_reason='policy_retry',worker_token_id=null,leased_account_id=null,capability_sha256=null,lease_expires_at=null where id=item.id;
   continue;
  end;
  select exists(select 1 from private.capital_public_retained_payloads where organization_id=a.organization_id and allocation_id=a.id) into has_receipt;
  if deadline is not null and item.effective_purge_at>clock_timestamp() and least(a.purge_at,deadline-make_interval(secs=>margin))>clock_timestamp()
   and (has_receipt or a.upload_expires_at>clock_timestamp()) then
   update private.capital_public_payload_purge_queue set status='pending',next_check_at=least(a.purge_at,
    deadline-make_interval(secs=>margin),case when has_receipt then a.purge_at else a.upload_expires_at end),
    effective_purge_at=least(item.effective_purge_at,a.purge_at,deadline-make_interval(secs=>margin)),updated_at=clock_timestamp(),
    worker_token_id=null,leased_account_id=null,capability_sha256=null,lease_expires_at=null where id=item.id;
   continue;
  end if;
  capability:=encode(extensions.gen_random_bytes(32),'hex');
  update private.capital_public_payload_purge_queue set status='leased',attempts=attempts+1,worker_token_id=worker,leased_account_id=auth.uid(),
   capability_sha256=extensions.digest(capability,'sha256'),lease_expires_at=clock_timestamp()+interval '60 seconds',
   next_check_at=clock_timestamp()+interval '60 seconds',effective_purge_at=least(item.effective_purge_at,clock_timestamp()),updated_at=clock_timestamp() where id=item.id returning * into item;
  if exists(select 1 from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_path
   and ((to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then
   raise exception 'capture_bucket_unsafe' using errcode='42501'; end if;
  select o.id,o.version into object_id,object_version from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_path;
  items:=items||jsonb_build_array(jsonb_build_object('purgeId',item.id,'allocationId',a.id,'bucket',a.bucket_id,'path',a.object_path,
   'storageObjectId',object_id,'storageVersion',object_version,'purgeCapability',capability,'leaseExpiresAt',item.lease_expires_at));
  exit when jsonb_array_length(items)>=p_limit;
 end loop;
 if exists(select 1 from jsonb_array_elements(items) e where (e->>'leaseExpiresAt')::timestamptz<=clock_timestamp()) then raise exception 'capital_capture_retry' using errcode='40001'; end if;
 return jsonb_build_object('items',items,'polledAt',polled);
end; $$;

-- Public wrappers are INVOKER and delegate to private, guarded commands. No table
-- grant, arbitrary origin constructor, service-role bypass, or raw-content audit.
create function public.worker_record_capital_body_input_v1(p_job_id uuid,p_capability_token text,p_invocation_id uuid,p_adapter_request_fingerprint text,p_input_fingerprint text,p_prompt_fingerprint text,p_provider text,p_model text,p_components jsonb,p_retry_ordinal integer default 0,p_is_same_model_repair boolean default false,p_used_provider_fallback boolean default false,p_previous_invocation_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_body_input_v1(p_job_id,p_capability_token,p_invocation_id,p_adapter_request_fingerprint,p_input_fingerprint,p_prompt_fingerprint,p_provider,p_model,p_components,p_retry_ordinal,p_is_same_model_repair,p_used_provider_fallback,p_previous_invocation_id);$$;
create function public.worker_record_capital_body_accepted_v1(p_job_id uuid,p_capability_token text,p_input_receipt_id uuid,p_accepted jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_body_accepted_v1(p_job_id,p_capability_token,p_input_receipt_id,p_accepted);$$;
create function public.worker_prepare_capital_body_v1(p_job_id uuid,p_capability_token text,p_request_id uuid,p_kind text,p_origin_or_accepted_id uuid,p_body jsonb default null,p_gateway_output_fingerprint text default null)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_prepare_capital_body_v1(p_job_id,p_capability_token,p_request_id,p_kind,p_origin_or_accepted_id,p_body,p_gateway_output_fingerprint);$$;
create function public.worker_commit_capital_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,p_storage_version text,p_verified_sha256 text,p_verified_size bigint)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_commit_capital_body_v1(p_job_id,p_capability_token,p_allocation_id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size);$$;
create function public.worker_read_capital_body_v1(p_job_id uuid,p_capability_token text,p_retained_payload_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_read_capital_body_v1(p_job_id,p_capability_token,p_retained_payload_id);$$;
do $$ declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('private','public') and p.proname in ('capital_body_allocation_deadline_v1','capital_body_capture_origin_v1','capital_body_contribution_allowed_v1','capital_body_contribution_proof_v1','capital_body_dto_v1','capital_body_origin_deadline_v1','capital_body_physical_receipt_v1','capital_body_retention_healthy_v1','capital_body_wakes_pending_v1','require_capital_body_retention_ready_v1','capital_body_storage_allowed_v1','capital_body_subject_allowed_v1','capital_capture_allocation_deadline_v2','drain_capital_body_retention_wakes_v1','wake_capital_body_descendants_v1','wake_capital_body_rights_v1','wake_capital_body_subject_v1','worker_commit_capital_body_v1','worker_prepare_capital_body_v1','worker_read_capital_body_v1','worker_record_capital_body_accepted_v1','worker_record_capital_body_input_v1') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',fn);
 end loop;
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('private','public') and p.proname in ('worker_record_capital_body_input_v1','worker_record_capital_body_accepted_v1','worker_prepare_capital_body_v1','worker_commit_capital_body_v1','worker_read_capital_body_v1') loop
 execute format('grant execute on function %s to authenticated',fn);
 end loop;
end; $$;
