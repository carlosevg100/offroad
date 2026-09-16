-- Stage 5: economic identity never confers access to private dossier content.
set search_path = '';
create table public.dossiers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 resource_id uuid not null, legacy_company_id uuid, profile jsonb not null default '{}'::jsonb check(jsonb_typeof(profile)='object'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,resource_id),
 foreign key(organization_id,resource_id) references private.access_resources(organization_id,id) on delete cascade,
 foreign key(organization_id,legacy_company_id) references public.companies(organization_id,id)
);
-- NULL organization is reserved for registry-proven public identity, never tenant content.
create table public.entities (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), origin_dossier_id uuid,
 kind text not null check(kind in ('legal_entity','economic_group','asset','fund','other')),
 legal_name text not null check(length(btrim(legal_name)) between 2 and 300),
 public_proof jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), foreign key(organization_id,origin_dossier_id) references public.dossiers(organization_id,id),
 check(coalesce((organization_id is not null and origin_dossier_id is not null and public_proof is null) or
 (organization_id is null and origin_dossier_id is null and public_proof is not null and jsonb_typeof(public_proof)='object'
 and public_proof ?& array['registry','sourceUrl','contentHash','reviewedAt']
 and public_proof - array['registry','sourceUrl','contentHash','reviewedAt'] = '{}'::jsonb
 and public_proof->>'registry' in ('cvm','sec','receita_federal','official_registry')
 and public_proof->>'sourceUrl' ~ '^https://[^/ ]+'
 and public_proof->>'contentHash' ~ '^[a-f0-9]{64}$'
 and length(public_proof->>'reviewedAt')>10),false))
);
create table public.entity_identifiers (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), entity_id uuid not null references public.entities(id),
 namespace text not null check(namespace in ('BR:CNPJ','BR:CVM','US:CIK','LEI','legacy_sha256')),
 value text not null check(length(value) between 1 and 80), review_state text not null check(review_state in ('proposed','reviewed')),
 evidence jsonb not null check(jsonb_typeof(evidence)='object'), reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 valid_from timestamptz not null default now(), valid_until timestamptz, supersedes_id uuid references public.entity_identifiers(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,entity_id) references public.entities(organization_id,id),
 check(isfinite(valid_from) and (valid_until is null or (isfinite(valid_until) and valid_until>=valid_from))), check((review_state='reviewed')=(reviewed_at is not null)),
 check(organization_id is null or review_state<>'reviewed' or reviewed_by is not null),
 check(namespace<>'BR:CNPJ' or value ~ '^[0-9A-Z]{12}[0-9]{2}$'),
 check(namespace<>'legacy_sha256' or (organization_id is not null and value ~ '^[a-f0-9]{64}$'))
);
create table public.dossier_entity_links (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), dossier_id uuid not null,
 entity_id uuid not null references public.entities(id), relationship text not null check(relationship in ('subject','parent','subsidiary','guarantor','asset')),
 perimeter jsonb not null check(jsonb_typeof(perimeter)='object' and octet_length(perimeter::text)<=8192), valid_from timestamptz not null, valid_until timestamptz,
 withdrawn_at timestamptz, withdrawn_by uuid references auth.users(id), withdrawal_reason text,
 reviewed_by uuid not null references auth.users(id), review_reason text not null check(length(btrim(review_reason)) between 5 and 2000),
 request_id uuid not null, request_fingerprint text not null check(request_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,dossier_id,request_id),
 constraint reviewed_withdrawal check(num_nonnulls(withdrawn_at,withdrawn_by,withdrawal_reason) in (0,3) and (withdrawal_reason is null or length(btrim(withdrawal_reason)) between 5 and 2000)),
 foreign key(organization_id,dossier_id) references public.dossiers(organization_id,id),
 check(isfinite(valid_from) and (valid_until is null or (isfinite(valid_until) and valid_until>valid_from)))
);
create index dossiers_company_idx on public.dossiers(organization_id,legacy_company_id);
create index entities_name_idx on public.entities(lower(legal_name));
create index entities_origin_idx on public.entities(organization_id,origin_dossier_id);
create index identifiers_entity_idx on public.entity_identifiers(entity_id);
create index identifiers_exact_idx on public.entity_identifiers(namespace,value) where review_state='reviewed';
create index identifiers_supersedes_idx on public.entity_identifiers(supersedes_id);
create index identifiers_reviewer_idx on public.entity_identifiers(reviewed_by);
create index links_entity_idx on public.dossier_entity_links(entity_id);
create index links_reviewer_idx on public.dossier_entity_links(reviewed_by);

create function private.can_read_dossier_v1(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.dossiers d where d.id=p_id and private.can_access_resource_v1(d.organization_id,d.resource_id,'read'));
$$;
create function private.can_read_entity_v1(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.entities e where e.id=p_id and (e.organization_id is null or private.can_read_dossier_v1(e.origin_dossier_id)));
$$;
create function private.require_dossier_v1(p_id uuid,p_action text) returns public.dossiers language plpgsql security definer set search_path='' as $$
declare d public.dossiers; begin
 select * into d from public.dossiers where id=p_id;
 if d.id is null then raise exception 'resource_access_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||d.organization_id::text,0));
 if not private.can_access_resource_v1(d.organization_id,d.resource_id,p_action) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 return d;
end $$;
create function private.guard_identity_scope_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.entities; prior public.entity_identifiers; begin
 select * into e from public.entities where id=new.entity_id;
 if tg_table_name='entity_identifiers' then
  if e.id is null or new.organization_id is distinct from e.organization_id then raise exception 'identity_scope_mismatch' using errcode='23514'; end if;
  if new.supersedes_id is not null then
   select * into prior from public.entity_identifiers where id=new.supersedes_id;
   if prior.entity_id is distinct from new.entity_id or prior.organization_id is distinct from new.organization_id then raise exception 'identity_scope_mismatch' using errcode='23514'; end if;
  end if;
  if new.organization_id is null and (new.review_state<>'reviewed' or new.namespace='legacy_sha256') then raise exception 'public_identity_proof_required' using errcode='23514'; end if;
 else
  if e.id is null or (e.organization_id is not null and (e.organization_id<>new.organization_id or e.origin_dossier_id<>new.dossier_id)) then raise exception 'identity_scope_mismatch' using errcode='23514'; end if;
 end if;
 return new;
end $$;
create trigger identifier_scope before insert or update on public.entity_identifiers for each row execute function private.guard_identity_scope_v1();
create trigger dossier_link_scope before insert or update on public.dossier_entity_links for each row execute function private.guard_identity_scope_v1();

create function private.capture_identity_audit_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end; begin
 if r->>'organization_id' is not null then
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values((r->>'organization_id')::uuid,auth.uid(),lower(tg_op),tg_table_name,r->>'id',jsonb_build_object('operation',tg_op));
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.capture_identity_audit_v1() from public,anon,authenticated,service_role;

-- Clients read through RLS and write only through the bounded commands below.
alter table public.dossiers enable row level security;
alter table public.dossiers force row level security;
revoke all on public.dossiers from public,anon,authenticated,service_role;
grant select on public.dossiers to authenticated;
create policy dossiers_deny_insert on public.dossiers for insert to authenticated with check(false);
create policy dossiers_deny_update on public.dossiers for update to authenticated using(false) with check(false);
create policy dossiers_deny_delete on public.dossiers for delete to authenticated using(false);
create trigger dossiers_updated before update on public.dossiers for each row execute function private.set_updated_at();
create trigger dossiers_audit after insert or update or delete on public.dossiers for each row execute function private.capture_identity_audit_v1();
alter table public.entities enable row level security;
alter table public.entities force row level security;
revoke all on public.entities from public,anon,authenticated,service_role;
grant select on public.entities to authenticated;
create policy entities_deny_insert on public.entities for insert to authenticated with check(false);
create policy entities_deny_update on public.entities for update to authenticated using(false) with check(false);
create policy entities_deny_delete on public.entities for delete to authenticated using(false);
create trigger entities_updated before update on public.entities for each row execute function private.set_updated_at();
create trigger entities_audit after insert or update or delete on public.entities for each row execute function private.capture_identity_audit_v1();
alter table public.entity_identifiers enable row level security;
alter table public.entity_identifiers force row level security;
revoke all on public.entity_identifiers from public,anon,authenticated,service_role;
grant select on public.entity_identifiers to authenticated;
create policy entity_identifiers_deny_insert on public.entity_identifiers for insert to authenticated with check(false);
create policy entity_identifiers_deny_update on public.entity_identifiers for update to authenticated using(false) with check(false);
create policy entity_identifiers_deny_delete on public.entity_identifiers for delete to authenticated using(false);
create trigger entity_identifiers_updated before update on public.entity_identifiers for each row execute function private.set_updated_at();
create trigger entity_identifiers_audit after insert or update or delete on public.entity_identifiers for each row execute function private.capture_identity_audit_v1();
alter table public.dossier_entity_links enable row level security;
alter table public.dossier_entity_links force row level security;
revoke all on public.dossier_entity_links from public,anon,authenticated,service_role;
grant select on public.dossier_entity_links to authenticated;
create policy dossier_entity_links_deny_insert on public.dossier_entity_links for insert to authenticated with check(false);
create policy dossier_entity_links_deny_update on public.dossier_entity_links for update to authenticated using(false) with check(false);
create policy dossier_entity_links_deny_delete on public.dossier_entity_links for delete to authenticated using(false);
create trigger dossier_entity_links_updated before update on public.dossier_entity_links for each row execute function private.set_updated_at();
create trigger dossier_entity_links_audit after insert or update or delete on public.dossier_entity_links for each row execute function private.capture_identity_audit_v1();
create policy dossiers_select on public.dossiers for select to authenticated using(private.can_read_dossier_v1(id));
create policy entities_select on public.entities for select to authenticated using(private.can_read_entity_v1(id));
create policy entity_identifiers_select on public.entity_identifiers for select to authenticated using(private.can_read_entity_v1(entity_id));
create policy dossier_entity_links_select on public.dossier_entity_links for select to authenticated using(private.can_read_dossier_v1(dossier_id));
revoke all on function private.can_read_dossier_v1(uuid),private.can_read_entity_v1(uuid),private.require_dossier_v1(uuid,text),private.guard_identity_scope_v1() from public,anon,authenticated,service_role;
grant execute on function private.can_read_dossier_v1(uuid),private.can_read_entity_v1(uuid) to authenticated;

create function private.backfill_dossiers_v1() returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.dossiers(organization_id,resource_id,legacy_company_id,profile)
 select r.organization_id,r.id,coalesce(c.id,p.company_id,s.client_company_id),
 case when c.id is not null then jsonb_strip_nulls(jsonb_build_object('name',coalesce(c.display_name,c.legal_name),'legal_name',c.legal_name,'website',c.website,'description',c.description,'identifier_last4',c.legal_identifier_last4))
 when s.id is not null then s.company_profile else '{}'::jsonb end
 from private.access_resources r
 left join public.companies c on c.organization_id=r.organization_id and c.id=r.company_id
 left join public.capital_projects p on p.organization_id=r.organization_id and p.id=r.capital_project_id
 left join public.document_intake_sessions s on s.organization_id=r.organization_id and s.id=r.intake_session_id
 where r.resource_kind in ('company','capital_project','intake_session')
 on conflict(organization_id,resource_id) do nothing;
end $$;
revoke all on function private.backfill_dossiers_v1() from public,anon,authenticated,service_role;
select private.backfill_dossiers_v1();
create function private.register_resource_dossier_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.resource_kind in ('company','capital_project','intake_session') then
  insert into public.dossiers(organization_id,resource_id,legacy_company_id) values(new.organization_id,new.id,new.company_id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function private.register_resource_dossier_v1() from public,anon,authenticated,service_role;
create trigger resource_dossier after insert on private.access_resources for each row execute function private.register_resource_dossier_v1();

create function private.read_dossier_v1(p_dossier_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.dossiers:=private.require_dossier_v1(p_dossier_id,'read'); begin
 return jsonb_build_object('schemaVersion','dossier.v1','id',d.id,'organizationId',d.organization_id,'resourceId',d.resource_id,'legacyCompanyId',d.legacy_company_id,'profile',d.profile,
 'links',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'entityId',l.entity_id,'relationship',l.relationship,'perimeter',l.perimeter,'validFrom',l.valid_from,'validUntil',l.valid_until,'reviewedBy',l.reviewed_by,'reviewReason',l.review_reason,'withdrawnAt',l.withdrawn_at,'withdrawnBy',l.withdrawn_by,'withdrawalReason',l.withdrawal_reason) order by l.valid_from,l.id) from public.dossier_entity_links l where l.organization_id=d.organization_id and l.dossier_id=d.id),'[]'::jsonb));
end $$;
create function public.read_dossier_v1(p_dossier_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.read_dossier_v1(p_dossier_id); $$;
create function private.resolve_entity_candidate_v1(p_dossier_id uuid,p_name text,p_namespace text default null,p_value text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.dossiers:=private.require_dossier_v1(p_dossier_id,'read'); result jsonb; begin
 if p_name is null or length(btrim(p_name)) not between 2 and 300 or (p_namespace is null)<>(p_value is null) or (p_namespace is not null and (p_namespace not in ('BR:CNPJ','BR:CVM','US:CIK','LEI','legacy_sha256') or length(p_value) not between 1 and 80)) then raise exception 'invalid_identity_query' using errcode='22023'; end if;
 select coalesce(jsonb_agg(candidate order by rank,id),'[]'::jsonb) into result from (
 select e.id,case when i.id is not null then 0 else 1 end rank,jsonb_build_object('entityId',e.id,'legalName',e.legal_name,'scope',case when e.organization_id is null then 'public' else 'dossier' end,'match',case when i.id is not null then 'reviewed_identifier' else 'name_candidate' end,'identifierId',i.id) candidate
 from public.entities e left join lateral(select x.id from public.entity_identifiers x where x.entity_id=e.id and x.namespace=p_namespace and x.value=p_value and x.review_state='reviewed' and x.valid_from<=now() and (x.valid_until is null or x.valid_until>now()) order by x.valid_from desc limit 1) i on true
 where (e.organization_id is null or (e.organization_id=d.organization_id and e.origin_dossier_id=d.id))
 and (i.id is not null or lower(e.legal_name)=lower(btrim(p_name))) order by rank,e.id limit 20
 ) q;
 return jsonb_build_object('schemaVersion','entity-candidates.v1','candidates',result,'automaticMerge',false);
end $$;
create function public.resolve_entity_candidate_v1(p_dossier_id uuid,p_name text,p_namespace text default null,p_value text default null) returns jsonb language sql security invoker set search_path='' as $$ select private.resolve_entity_candidate_v1(p_dossier_id,p_name,p_namespace,p_value); $$;
create function private.link_dossier_entity_v1(p_dossier_id uuid,p_entity_id uuid,p_relationship text,p_perimeter jsonb,p_valid_from timestamptz,p_valid_until timestamptz,p_reason text,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.dossiers:=private.require_dossier_v1(p_dossier_id,'work'); e public.entities; prior public.dossier_entity_links; fp text; result uuid; begin
 perform 1 from public.dossiers where id=d.id for update;
 select * into e from public.entities where id=p_entity_id and (organization_id is null or (organization_id=d.organization_id and origin_dossier_id=d.id));
 if e.id is null then raise exception 'resource_access_denied' using errcode='42501'; end if;
 fp:=encode(extensions.digest(jsonb_build_array(p_entity_id,p_relationship,p_perimeter,p_valid_from at time zone 'UTC',p_valid_until at time zone 'UTC',p_reason)::text,'sha256'),'hex');
 select * into prior from public.dossier_entity_links where organization_id=d.organization_id and dossier_id=d.id and request_id=p_request_id;
 if prior.id is not null then
  if prior.request_fingerprint<>fp then raise exception 'idempotency_conflict' using errcode='22023'; end if;
  return prior.id;
 end if;
 if exists(select 1 from public.dossier_entity_links l where l.organization_id=d.organization_id and l.dossier_id=d.id and l.withdrawn_at is null and l.entity_id=e.id and l.relationship=p_relationship and tstzrange(l.valid_from,l.valid_until,'[)') && tstzrange(p_valid_from,p_valid_until,'[)')) then raise exception 'identity_period_overlap' using errcode='22023'; end if;
 insert into public.dossier_entity_links(organization_id,dossier_id,entity_id,relationship,perimeter,valid_from,valid_until,reviewed_by,review_reason,request_id,request_fingerprint)
 values(d.organization_id,d.id,e.id,p_relationship,p_perimeter,p_valid_from,p_valid_until,auth.uid(),p_reason,p_request_id,fp) returning id into result;
 return result;
end $$;
create function public.link_dossier_entity_v1(p_dossier_id uuid,p_entity_id uuid,p_relationship text,p_perimeter jsonb,p_valid_from timestamptz,p_valid_until timestamptz,p_reason text,p_request_id uuid) returns uuid language sql security invoker set search_path='' as $$ select private.link_dossier_entity_v1(p_dossier_id,p_entity_id,p_relationship,p_perimeter,p_valid_from,p_valid_until,p_reason,p_request_id); $$;
revoke all on function private.read_dossier_v1(uuid),public.read_dossier_v1(uuid),private.resolve_entity_candidate_v1(uuid,text,text,text),public.resolve_entity_candidate_v1(uuid,text,text,text),private.link_dossier_entity_v1(uuid,uuid,text,jsonb,timestamptz,timestamptz,text,uuid),public.link_dossier_entity_v1(uuid,uuid,text,jsonb,timestamptz,timestamptz,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_dossier_v1(uuid),public.read_dossier_v1(uuid),private.resolve_entity_candidate_v1(uuid,text,text,text),public.resolve_entity_candidate_v1(uuid,text,text,text),private.link_dossier_entity_v1(uuid,uuid,text,jsonb,timestamptz,timestamptz,text,uuid),public.link_dossier_entity_v1(uuid,uuid,text,jsonb,timestamptz,timestamptz,text,uuid) to authenticated;

create function private.review_dossier_identity_v1(p_dossier_id uuid,p_entity_id uuid,p_name text,p_namespace text,p_value text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.dossiers:=private.require_dossier_v1(p_dossier_id,'work'); e public.entities; previous public.entity_identifiers; begin
 perform 1 from public.dossiers where id=d.id for update;
 if p_name is null or length(btrim(p_name)) not between 2 and 300 or p_reason is null or length(btrim(p_reason)) not between 5 and 2000 or p_namespace is null or p_value is null then raise exception 'identity_review_required' using errcode='22023'; end if;
 if p_entity_id is null then
  insert into public.entities(organization_id,origin_dossier_id,kind,legal_name) values(d.organization_id,d.id,'legal_entity',btrim(p_name)) returning * into e;
 else
  select * into e from public.entities where id=p_entity_id and organization_id=d.organization_id and origin_dossier_id=d.id;
  if e.id is null then raise exception 'resource_access_denied' using errcode='42501'; end if;
  if e.legal_name<>btrim(p_name) then raise exception 'different_entity_requires_reviewed_link' using errcode='22023'; end if;
 end if;
 select * into previous from public.entity_identifiers where entity_id=e.id and namespace=p_namespace and review_state='reviewed' and valid_until is null for update;
 if previous.id is not null and previous.value=p_value then return e.id; end if;
 if previous.id is not null then
  update public.entity_identifiers set valid_until=greatest(now(),valid_from) where id=previous.id;
 end if;
 insert into public.entity_identifiers(organization_id,entity_id,namespace,value,review_state,evidence,reviewed_by,reviewed_at,valid_from,supersedes_id)
 values(d.organization_id,e.id,p_namespace,p_value,'reviewed',jsonb_build_object('kind','human_local_review','reason',p_reason),auth.uid(),now(),coalesce((select valid_until from public.entity_identifiers where id=previous.id),now()),previous.id);
 return e.id;
end $$;
create function public.review_dossier_identity_v1(p_dossier_id uuid,p_entity_id uuid,p_name text,p_namespace text,p_value text,p_reason text) returns uuid language sql security invoker set search_path='' as $$ select private.review_dossier_identity_v1(p_dossier_id,p_entity_id,p_name,p_namespace,p_value,p_reason); $$;
revoke all on function private.review_dossier_identity_v1(uuid,uuid,text,text,text,text),public.review_dossier_identity_v1(uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.review_dossier_identity_v1(uuid,uuid,text,text,text,text),public.review_dossier_identity_v1(uuid,uuid,text,text,text,text) to authenticated;
create unique index reviewed_identifier_current on public.entity_identifiers(entity_id,namespace) where review_state='reviewed' and valid_until is null;
create unique index public_identifier_current on public.entity_identifiers(namespace,value) where organization_id is null and review_state='reviewed' and valid_until is null;

-- Keep the legacy profile as an adapter; no folder title or name token identifies an entity.
create function private.sync_session_dossier_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.dossiers set profile=new.company_profile,legacy_company_id=new.client_company_id
 where organization_id=new.organization_id and resource_id=new.id and (profile,legacy_company_id) is distinct from (new.company_profile,new.client_company_id);
 return new;
end $$;
revoke all on function private.sync_session_dossier_v1() from public,anon,authenticated,service_role;
create trigger zz_session_dossier after insert or update of company_profile,client_company_id on public.document_intake_sessions for each row execute function private.sync_session_dossier_v1();
-- A caller cannot use a guessed identifier to rewrite another project's legacy company profile.
do $$ declare body text; needle text; begin
 select pg_get_functiondef('private.save_project_company_profile(uuid,text,text,text,text,bytea,text)'::regprocedure) into body;
 needle:='and company.legal_identifier_hash = p_identifier_hash';
 if position(needle in body)=0 then raise exception 'company_profile_adapter_changed'; end if;
 body:=replace(body,needle,needle||E'\n      and private.can_access_resource_v1(company.organization_id,company.id,''work'')');
 needle:=E'  else\n    update public.companies company';
 if position(needle in body)=0 then raise exception 'company_profile_update_changed'; end if;
 body:=replace(body,needle,E'  else\n    perform private.require_resource_access_v1(resolved_company_id,''work'');\n    update public.companies company');
 execute body;
 select pg_get_functiondef('private.save_guided_company_profile(uuid,text,text,text,text,bytea,text)'::regprocedure) into body;
 needle:=E'    if company_id is not null then\n      update public.companies company';
 if position(needle in body)=0 then raise exception 'guided_company_profile_adapter_changed'; end if;
 body:=replace(body,needle,E'    if company_id is not null then\n      perform private.require_resource_access_v1(company_id,''work'');\n      update public.companies company');
 execute body;
end $$;

create function private.worker_read_public_entity_subject_v1(p_job_id uuid,p_capability_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.worker_public_company_memory_job(p_job_id,p_capability_token); result jsonb; begin
 select case when count(*)=1 then jsonb_agg(subject)->0 else null end into result from (
  select distinct jsonb_build_object('legalName',e.legal_name,'verifiedEntityId',e.id) subject
  from public.dossiers d join public.dossier_entity_links l on l.organization_id=d.organization_id and l.dossier_id=d.id
  join public.entities e on e.id=l.entity_id and e.organization_id is null
  where d.organization_id=j.organization_id and d.resource_id in (j.authorization_resource_id,j.intake_session_id)
  and l.withdrawn_at is null and l.relationship='subject' and l.valid_from<=now() and (l.valid_until is null or l.valid_until>now())
  and private.delegated_policy_access_v1((select dp.id from private.principals dp where dp.organization_id=j.organization_id and dp.processing_job_id=j.id),d.resource_id,'read')
  and length(e.legal_name)<=200
 ) subjects;
 return result;
end $$;
create function public.worker_read_public_entity_subject_v1(p_job_id uuid,p_capability_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_public_entity_subject_v1(p_job_id,p_capability_token); $$;
revoke all on function private.worker_read_public_entity_subject_v1(uuid,text),public.worker_read_public_entity_subject_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_read_public_entity_subject_v1(uuid,text),public.worker_read_public_entity_subject_v1(uuid,text) to authenticated;
-- Legacy name-keyed cache is retained but frozen; only v2 can be read or written by the runtime.
alter table private.public_company_source_memory drop constraint public_company_source_memory_schema_check;
alter table private.public_company_source_memory add constraint public_company_source_memory_schema_check check(schema_version in ('public-company-memory.v1','public-company-memory.v2'));
do $$ declare body text; begin
 select pg_get_functiondef('private.worker_load_public_company_memory(uuid,text,text)'::regprocedure) into body;
 body:=replace(body,'public-company-memory.v1','public-company-memory.v2');
 body:=regexp_replace(body,E'\\mbegin\\M\n',E'begin\n  if p_company_key is distinct from encode(extensions.digest(''public-entity:''||(private.worker_read_public_entity_subject_v1(p_job_id,p_capability_token)->>''verifiedEntityId''),''sha256''),''hex'') then return null; end if;\n');
 execute body;
 select pg_get_functiondef('private.worker_store_public_company_memory(uuid,text,jsonb)'::regprocedure) into body;
 body:=replace(body,'public-company-memory.v1','public-company-memory.v2');
 body:=replace(body,'array[''legalName'',''website'',''sector'',''geography'']','array[''legalName'',''verifiedEntityId'']');
 body:=regexp_replace(body,E'\\mbegin\\M\n',E'begin\n  if private.worker_read_public_entity_subject_v1(p_job_id,p_capability_token) is null or p_record->''subject'' is distinct from private.worker_read_public_entity_subject_v1(p_job_id,p_capability_token) or p_record->>''companyKey'' is distinct from encode(extensions.digest(''public-entity:''||(p_record#>>''{subject,verifiedEntityId}''),''sha256''),''hex'') then raise exception ''verified_public_identity_required'' using errcode=''42501''; end if;\n');
 execute body;
end $$;

create function private.sync_company_dossier_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare profile_value jsonb:=jsonb_strip_nulls(jsonb_build_object('name',coalesce(new.display_name,new.legal_name),'legal_name',new.legal_name,'website',new.website,'description',new.description,'identifier_last4',new.legal_identifier_last4)); begin
 update public.dossiers set profile=profile_value,legacy_company_id=new.id where organization_id=new.organization_id and resource_id=new.id and (profile,legacy_company_id) is distinct from (profile_value,new.id);
 return new;
end $$;
create function private.sync_project_dossier_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.dossiers set legacy_company_id=new.company_id where organization_id=new.organization_id and resource_id=new.id and legacy_company_id is distinct from new.company_id;
 return new;
end $$;
revoke all on function private.sync_company_dossier_v1(),private.sync_project_dossier_v1() from public,anon,authenticated,service_role;
create trigger zz_company_dossier after insert or update of display_name,legal_name,website,description,legal_identifier_last4 on public.companies for each row execute function private.sync_company_dossier_v1();
create trigger zz_project_dossier after insert or update of company_id on public.capital_projects for each row execute function private.sync_project_dossier_v1();

create index links_withdrawn_by_idx on public.dossier_entity_links(withdrawn_by);
create index identifiers_tenant_entity_idx on public.entity_identifiers(organization_id,entity_id);
create function private.withdraw_dossier_entity_link_v1(p_link_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare l public.dossier_entity_links; d public.dossiers; begin
 select * into l from public.dossier_entity_links where id=p_link_id;
 if l.id is null then raise exception 'resource_access_denied' using errcode='42501'; end if;
 d:=private.require_dossier_v1(l.dossier_id,'work');
 perform 1 from public.dossiers where id=d.id for update;
 if p_reason is null or length(btrim(p_reason)) not between 5 and 2000 then raise exception 'identity_review_required' using errcode='22023'; end if;
 update public.dossier_entity_links set withdrawn_at=clock_timestamp(),withdrawn_by=auth.uid(),withdrawal_reason=p_reason where id=l.id and withdrawn_at is null;
end $$;
create function public.withdraw_dossier_entity_link_v1(p_link_id uuid,p_reason text) returns void language sql security invoker set search_path='' as $$ select private.withdraw_dossier_entity_link_v1(p_link_id,p_reason); $$;
revoke all on function private.withdraw_dossier_entity_link_v1(uuid,text),public.withdraw_dossier_entity_link_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.withdraw_dossier_entity_link_v1(uuid,text),public.withdraw_dossier_entity_link_v1(uuid,text) to authenticated;
