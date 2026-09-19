-- Stage 14: immutable compositions, explicit human review, exact publication and bindings.
set search_path='';
-- Platform corpus has its own provenance. It contains no customer data and has no tenant key.
create table private.platform_method_releases (
 id text primary key, method_id text not null, version text not null, manifest_hash text not null check(manifest_hash ~ '^[a-f0-9]{64}$'),
 manifest jsonb not null check(jsonb_typeof(manifest)='object'), components jsonb not null check(jsonb_typeof(components)='array'),
 evidence jsonb not null check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence)>0),
 approval jsonb not null check(jsonb_typeof(approval)='object'), capability_key text not null references private.platform_capability_releases(capability_key),
 created_at timestamptz not null default now(), unique(method_id,version,manifest_hash)
);
alter table private.platform_method_releases enable row level security;
alter table private.platform_method_releases force row level security;
revoke all on private.platform_method_releases from public,anon,authenticated,service_role;
create policy platform_method_releases_deny on private.platform_method_releases for all to public using(false) with check(false);
create trigger platform_method_immutable before update or delete on private.platform_method_releases for each row execute function private.guard_contribution_immutable_v1();

create table public.method_components (
 id uuid primary key, organization_id uuid not null references public.organizations(id), scope_id uuid not null,
 component_key text not null check(length(component_key) between 3 and 120),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,component_key),foreign key(organization_id,scope_id) references public.vault_scopes(organization_id,id)
);
create table public.method_component_versions (
 id uuid primary key, organization_id uuid not null references public.organizations(id),component_id uuid not null,
 content jsonb not null check(jsonb_typeof(content)='object'),content_fingerprint text not null check(content_fingerprint ~ '^[a-f0-9]{64}$'),
 vault_version_id uuid not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,component_id,id),
 foreign key(organization_id,component_id) references public.method_components(organization_id,id),
 foreign key(organization_id,vault_version_id) references public.vault_entry_versions(organization_id,id)
);
create table public.method_releases (
 id uuid primary key,organization_id uuid not null references public.organizations(id),scope_id uuid not null,
 base_release_id text references private.platform_method_releases(id), title text not null check(length(btrim(title)) between 1 and 180),
 status text not null default 'candidate' check(status in ('candidate','published','retired')),
 manifest jsonb not null check(jsonb_typeof(manifest)='object'),manifest_fingerprint text not null check(manifest_fingerprint ~ '^[a-f0-9]{64}$'),
 evidence_fingerprint text not null check(evidence_fingerprint ~ '^[a-f0-9]{64}$'),
 legacy_methodology_id uuid,created_by uuid references auth.users(id),published_by uuid references auth.users(id),published_at timestamptz,
 retired_by uuid references auth.users(id),retired_at timestamptz,retirement_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,legacy_methodology_id),
 foreign key(organization_id,scope_id) references public.vault_scopes(organization_id,id),
 foreign key(organization_id,legacy_methodology_id) references public.organization_methodologies(organization_id,id),
 check((status='candidate' and published_by is null and published_at is null and retired_at is null)
 or (status='published' and published_by is not null and published_at is not null and retired_at is null)
 or (status='retired' and published_by is not null and published_at is not null and retired_by is not null and retired_at is not null and length(btrim(retirement_reason)) between 5 and 2000))
);
create table public.method_release_components (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),release_id uuid not null,component_version_id uuid not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,release_id,component_version_id),
 foreign key(organization_id,release_id) references public.method_releases(organization_id,id),
 foreign key(organization_id,component_version_id) references public.method_component_versions(organization_id,id)
);
create table public.method_review_records (
 id uuid primary key,organization_id uuid not null references public.organizations(id),release_id uuid not null,
 manifest_fingerprint text not null,evidence_fingerprint text not null,review_text text not null check(length(btrim(review_text)) between 20 and 4000),
 reviewed_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,release_id) references public.method_releases(organization_id,id)
);
create table public.method_scope_bindings (
 id uuid primary key,organization_id uuid not null references public.organizations(id),release_id uuid not null,
 unit_id uuid,work_type text,work_id uuid,previous_binding_id uuid,
 created_by uuid not null references auth.users(id),retired_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,release_id) references public.method_releases(organization_id,id),
 foreign key(organization_id,unit_id) references private.organization_units(organization_id,id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,previous_binding_id) references public.method_scope_bindings(organization_id,id),
 check(work_type is null or length(btrim(work_type)) between 3 and 120)
);
create unique index method_binding_active on public.method_scope_bindings(organization_id,unit_id,work_type,work_id) nulls not distinct where retired_at is null;
create table private.method_publication_policies (
 id uuid not null unique default gen_random_uuid(),organization_id uuid primary key references public.organizations(id),separate_reviewer boolean not null default true,
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
alter table private.method_publication_policies enable row level security;
alter table private.method_publication_policies force row level security;
revoke all on private.method_publication_policies from public,anon,authenticated,service_role;
create policy method_policy_deny on private.method_publication_policies for all to public using(false) with check(false);
create trigger method_policy_audit after insert or update or delete on private.method_publication_policies for each row execute function private.capture_identity_audit_v1();

-- The existing vault policy is the publication authority for reusable house knowledge.
-- Being an administrator/creator alone never confers publish permission.
create function private.method_scope_allowed_v1(p_org uuid,p_action text) returns boolean language sql volatile security definer set search_path='' as $$
 select private.workspace_context_matches_v1(p_org) and exists(select 1 from public.vault_scopes s where s.organization_id=p_org
 and private.evaluate_resource_policy_v1(p_org,s.id,auth.uid(),p_action,case when p_action='publish' then 'publication' else 'analysis' end));
$$;
create function private.method_release_readable_v1(p_org uuid,p_release uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select private.method_scope_allowed_v1(p_org,'read') and exists(select 1 from public.method_releases r where r.organization_id=p_org and r.id=p_release)
 and not exists(select 1 from public.method_release_components rc join public.method_component_versions v on v.organization_id=rc.organization_id and v.id=rc.component_version_id
 where rc.organization_id=p_org and rc.release_id=p_release and not private.can_read_vault_version_v1(p_org,v.vault_version_id));
$$;
revoke all on function private.method_scope_allowed_v1(uuid,text),private.method_release_readable_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.method_scope_allowed_v1(uuid,text),private.method_release_readable_v1(uuid,uuid) to authenticated;
do $$ declare t text;predicate text;begin
 foreach t in array array['method_components','method_component_versions','method_releases','method_release_components','method_review_records','method_scope_bindings'] loop
  execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select on public.%I to authenticated',t);
  predicate:=case t when 'method_components' then 'private.method_scope_allowed_v1(organization_id,''read'')'
   when 'method_component_versions' then 'private.method_scope_allowed_v1(organization_id,''read'') and private.can_read_vault_version_v1(organization_id,vault_version_id)'
   when 'method_releases' then 'private.method_release_readable_v1(organization_id,id)' else 'private.method_release_readable_v1(organization_id,release_id)' end;
  execute format('create policy %I on public.%I for select to authenticated using(%s)',t||'_select',t,predicate);
  execute format('create policy %I on public.%I for insert to authenticated with check(false)',t||'_insert',t);
  execute format('create policy %I on public.%I for update to authenticated using(false) with check(false)',t||'_update',t);
  execute format('create policy %I on public.%I for delete to authenticated using(false)',t||'_delete',t);
  execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',t||'_updated',t);
  execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.capture_identity_audit_v1()',t||'_audit',t);
  if t not in ('method_releases','method_scope_bindings') then execute format('create trigger %I before update or delete on public.%I for each row execute function private.guard_contribution_immutable_v1()',t||'_immutable',t);end if;
 end loop;
end $$;
-- Publication mutates status only; no reader, worker or future candidate can rewrite its bytes.
create function private.guard_method_release_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'method_history_immutable' using errcode='23514';end if;
 if tg_table_name='method_scope_bindings' then
  if old.retired_at is not null or new.retired_at is null or to_jsonb(new)-array['retired_at','updated_at'] is distinct from to_jsonb(old)-array['retired_at','updated_at'] then raise exception 'method_binding_immutable' using errcode='23514';end if;
 else
  if to_jsonb(new)-array['status','published_by','published_at','retired_by','retired_at','retirement_reason','updated_at'] is distinct from to_jsonb(old)-array['status','published_by','published_at','retired_by','retired_at','retirement_reason','updated_at']
  or not ((old.status='candidate' and new.status='published') or (old.status='published' and new.status='retired' and old.published_by=new.published_by and old.published_at=new.published_at)) then raise exception 'method_release_immutable' using errcode='23514';end if;
 end if;return new;
end $$;
revoke all on function private.guard_method_release_v1() from public,anon,authenticated,service_role;
create trigger method_release_immutable before update or delete on public.method_releases for each row execute function private.guard_method_release_v1();
create trigger method_binding_immutable before update or delete on public.method_scope_bindings for each row execute function private.guard_method_release_v1();

create function private.method_value_matches_v1(t jsonb,v jsonb,depth integer default 0) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text;f jsonb;begin
 if depth>24 or t is null or v is null then return false;end if;
 case t->>'type'
 when 'string' then return jsonb_typeof(v)='string';
 when 'decimal_string' then return jsonb_typeof(v)='string' and v#>>'{}' ~ '^-?[0-9]+(\.[0-9]+)?$';
 when 'boolean' then return jsonb_typeof(v)='boolean';
 when 'integer' then return jsonb_typeof(v)='number' and v#>>'{}' ~ '^-?[0-9]+$' and abs((v#>>'{}')::numeric)<=9007199254740991;
 when 'date' then
  if jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false;end if;
  begin return to_char((v#>>'{}')::date,'YYYY-MM-DD')=v#>>'{}';exception when others then return false;end;
 when 'enum' then return jsonb_typeof(v)='string' and coalesce(t->'values' @> jsonb_build_array(v),false);
 when 'array' then
  if jsonb_typeof(v)<>'array' then return false;end if;
  return not exists(select 1 from jsonb_array_elements(v) x where not private.method_value_matches_v1(t->'items',x,depth+1));
 when 'object' then
  if jsonb_typeof(v)<>'object' or jsonb_typeof(t->'fields')<>'object' then return false;end if;
  if exists(select 1 from jsonb_object_keys(v) x where not t->'fields' ? x) then return false;end if;
  for k,f in select * from jsonb_each(t->'fields') loop
   if v ? k then if not private.method_value_matches_v1(f->'value',v->k,depth+1) then return false;end if;
   elsif coalesce((f->>'required')::boolean,false) then return false;end if;
  end loop;return true;
 else return false;
 end case;
end $$;

create function private.compose_method_v1(p_org uuid,p_base text,p_overrides jsonb,p_unit uuid,p_work_type text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare b private.platform_method_releases;o jsonb;c jsonb;point jsonb;v public.vault_entry_versions;seen text[]:='{}';key text;ordered jsonb;parameters jsonb;begin
 select * into b from private.platform_method_releases where id=p_base;
 if b.id is null or not exists(select 1 from private.platform_capability_releases x where x.capability_key=b.capability_key and x.released and x.method_id=b.method_id and x.method_version=b.version) then raise exception 'method_base_unavailable' using errcode='22023';end if;
 if p_overrides is null or jsonb_typeof(p_overrides)<>'array' or jsonb_array_length(p_overrides)>100 or octet_length(p_overrides::text)>100000
 or p_work_type is null or length(btrim(p_work_type)) not between 3 and 120 then raise exception 'method_candidate_invalid' using errcode='22023';end if;
 if p_unit is not null and not exists(select 1 from private.organization_units where organization_id=p_org and id=p_unit and enabled) then raise exception 'method_scope_denied' using errcode='42501';end if;
 for o in select * from jsonb_array_elements(p_overrides) loop
  if exists(select 1 from unnest(array['componentId','pointId','version','scope','scopeId','rationale']) k where jsonb_typeof(o->k) is distinct from 'string') then raise exception 'method_override_invalid' using errcode='22023';end if;
  if jsonb_typeof(o)<>'object' or not o ?& array['componentId','pointId','version','scope','scopeId','rationale','source','value']
  or (select count(*) from jsonb_object_keys(o))<>8 or jsonb_typeof(o->'source')<>'object'
  or not o->'source' ?& array['versionId','fingerprint'] or (select count(*) from jsonb_object_keys(o->'source'))<>2
  or o->>'version' !~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-v[0-9]+$' or length(btrim(o->>'rationale')) not between 5 and 2000
  or o->>'scope' not in ('organization','unit','work_type') then raise exception 'method_override_invalid' using errcode='22023';end if;
  if o->>'scopeId' is distinct from (case o->>'scope' when 'organization' then p_org::text when 'unit' then p_unit::text else p_work_type end) then raise exception 'method_override_scope_conflict' using errcode='22023';end if;
  select x into c from jsonb_array_elements(b.components) x where x->>'id'=o->>'componentId';
  select x into point from jsonb_array_elements(coalesce(c->'overridePoints','[]')) x where x->>'id'=o->>'pointId';
  if c is null or point is null or c->>'kind' in ('formula','quality_gate') or (c->>'kind'='rule' and c->>'authority' in ('law','contract'))
  or point->>'target' not in ('narrative','template','assumption') or point->>'requiresRationale' is distinct from 'true' then raise exception 'method_protected_override' using errcode='22023';end if;
  if not private.method_value_matches_v1(point->'contract'->'value',o->'value') then raise exception 'method_override_contract_conflict' using errcode='22023';end if;
  key:=(o->>'componentId')||':'||(o->>'pointId')||':'||(o->>'scope');
  if key=any(seen) then raise exception 'method_override_ambiguous' using errcode='22023';end if;seen:=array_append(seen,key);
  select * into v from public.vault_entry_versions where organization_id=p_org and id=(o->'source'->>'versionId')::uuid;
  if v.id is null or v.content_fingerprint is distinct from o->'source'->>'fingerprint' or not private.can_read_vault_version_v1(p_org,v.id)
  or not private.vault_reference_allowed_v1(p_org,v.id,'publication') or not exists(select 1 from public.vault_publications pub join public.vault_publication_requests req on req.organization_id=pub.organization_id and req.id=pub.request_id
    where pub.organization_id=p_org and pub.withdrawn_at is null and req.version_id=v.id and req.work_scope_id is null and req.purpose in ('analysis','retrieval')) then raise exception 'method_source_not_published' using errcode='42501';end if;
 end loop;
 select coalesce(jsonb_agg(x order by case x->>'scope' when 'organization' then 0 when 'unit' then 1 else 2 end,x->>'componentId' collate "C",x->>'pointId' collate "C"),'[]') into ordered from jsonb_array_elements(p_overrides) x;
 select coalesce(jsonb_agg(x order by x->>'componentId' collate "C",x->>'pointId' collate "C"),'[]') into parameters from (
  select distinct on(x->>'componentId',x->>'pointId') x from jsonb_array_elements(ordered) x
  order by x->>'componentId',x->>'pointId',case x->>'scope' when 'organization' then 0 when 'unit' then 1 else 2 end desc
 ) chosen;
 return jsonb_build_object('schemaVersion','method-composition.v1','baseReleaseId',b.id,'baseManifestHash',b.manifest_hash,
 'context',jsonb_build_object('organizationId',p_org,'unitId',p_unit,'workType',p_work_type),'components',b.components,'overrides',ordered,'parameters',parameters,'grantsExecution',false);
end $$;

create function private.submit_method_candidate_v1(p_id uuid,p_title text,p_base_release_id text,p_overrides jsonb,p_unit_id uuid default null,p_work_type text default 'analysis') returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();scope uuid;m jsonb;fp text;ef text;existing public.method_releases;o jsonb;cid uuid;vid uuid;key text;begin
 if not private.method_scope_allowed_v1(org,'work') then raise exception 'method_access_denied' using errcode='42501';end if;
 if p_id is null or p_title is null or length(btrim(p_title)) not between 1 and 180 then raise exception 'method_candidate_invalid' using errcode='22023';end if;
 m:=private.compose_method_v1(org,p_base_release_id,p_overrides,p_unit_id,p_work_type);
 fp:=encode(extensions.digest(m::text,'sha256'),'hex');
 select encode(extensions.digest(evidence::text,'sha256'),'hex') into ef from private.platform_method_releases where id=p_base_release_id;
 select * into existing from public.method_releases where id=p_id;
 if found then
  if existing.organization_id<>org or existing.manifest_fingerprint<>fp or existing.title<>btrim(p_title) then raise exception 'method_request_reused' using errcode='22023';end if;return p_id;
 end if;
 select id into strict scope from public.vault_scopes where organization_id=org;
 insert into public.method_releases(id,organization_id,scope_id,base_release_id,title,manifest,manifest_fingerprint,evidence_fingerprint,created_by)
 values(p_id,org,scope,p_base_release_id,btrim(p_title),m,fp,ef,auth.uid());
 for o in select * from jsonb_array_elements(m->'overrides') loop
  key:=encode(extensions.digest(concat_ws(':',o->>'componentId',o->>'pointId',o->>'scope',o->>'scopeId'),'sha256'),'hex');
  select id into cid from public.method_components where organization_id=org and component_key=key;
  if cid is null then cid:=gen_random_uuid();insert into public.method_components(id,organization_id,scope_id,component_key,created_by) values(cid,org,scope,key,auth.uid());end if;
  vid:=gen_random_uuid();insert into public.method_component_versions(id,organization_id,component_id,content,content_fingerprint,vault_version_id,created_by)
   values(vid,org,cid,o,encode(extensions.digest(o::text,'sha256'),'hex'),(o->'source'->>'versionId')::uuid,auth.uid());
  insert into public.method_release_components(organization_id,release_id,component_version_id) values(org,p_id,vid);
 end loop;return p_id;
end $$;

create function private.review_method_candidate_v1(p_release_id uuid,p_review_id uuid,p_manifest_fingerprint text,p_evidence_fingerprint text,p_review_text text) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();r public.method_releases;m jsonb;ef text;existing public.method_review_records;begin
 if not private.method_scope_allowed_v1(org,'publish') or not private.method_release_readable_v1(org,p_release_id) then raise exception 'method_review_denied' using errcode='42501';end if;
 select * into r from public.method_releases where organization_id=org and id=p_release_id for update;
 if r.id is null or r.status<>'candidate' or r.base_release_id is null then raise exception 'method_candidate_unpublishable' using errcode='22023';end if;
 if coalesce((select separate_reviewer from private.method_publication_policies where organization_id=org),true) and r.created_by=auth.uid() then raise exception 'method_independent_review_required' using errcode='42501';end if;
 m:=private.compose_method_v1(org,r.base_release_id,r.manifest->'overrides',(r.manifest->'context'->>'unitId')::uuid,r.manifest->'context'->>'workType');
 select encode(extensions.digest(evidence::text,'sha256'),'hex') into ef from private.platform_method_releases where id=r.base_release_id;
 if m is distinct from r.manifest or r.manifest_fingerprint is distinct from p_manifest_fingerprint or ef is distinct from p_evidence_fingerprint or ef<>r.evidence_fingerprint then raise exception 'method_review_stale' using errcode='40001';end if;
 if p_review_id is null or p_review_text is null or length(btrim(p_review_text)) not between 20 and 4000 then raise exception 'method_review_invalid' using errcode='22023';end if;
 select * into existing from public.method_review_records where id=p_review_id;
 if found then
  if existing.organization_id<>org or existing.release_id<>r.id or existing.review_text<>btrim(p_review_text) or existing.reviewed_by<>auth.uid() then raise exception 'method_request_reused' using errcode='22023';end if;return p_review_id;
 end if;
 insert into public.method_review_records(id,organization_id,release_id,manifest_fingerprint,evidence_fingerprint,review_text,reviewed_by)
 values(p_review_id,org,r.id,r.manifest_fingerprint,ef,btrim(p_review_text),auth.uid());return p_review_id;
end $$;

create function private.publish_method_release_v1(p_release_id uuid,p_review_id uuid,p_manifest_fingerprint text) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();r public.method_releases;review public.method_review_records;m jsonb;ef text;begin
 if not private.method_scope_allowed_v1(org,'publish') or not private.method_release_readable_v1(org,p_release_id) then raise exception 'method_publish_denied' using errcode='42501';end if;
 select * into r from public.method_releases where organization_id=org and id=p_release_id for update;
 select * into review from public.method_review_records where organization_id=org and id=p_review_id and release_id=r.id;
 if r.id is null or r.status='retired' or r.base_release_id is null or review.id is null then raise exception 'method_publication_invalid' using errcode='22023';end if;
 if coalesce((select separate_reviewer from private.method_publication_policies where organization_id=org),true)
 and (r.created_by=review.reviewed_by or auth.uid()=review.reviewed_by) then raise exception 'method_separation_required' using errcode='42501';end if;
 -- A revoked reviewer cannot lend residual authority to a pending publication.
 if not private.evaluate_resource_policy_v1(org,r.scope_id,review.reviewed_by,'publish','publication') then raise exception 'method_reviewer_revoked' using errcode='42501';end if;
 m:=private.compose_method_v1(org,r.base_release_id,r.manifest->'overrides',(r.manifest->'context'->>'unitId')::uuid,r.manifest->'context'->>'workType');
 select encode(extensions.digest(evidence::text,'sha256'),'hex') into ef from private.platform_method_releases where id=r.base_release_id;
 if m is distinct from r.manifest or r.manifest_fingerprint is distinct from p_manifest_fingerprint or review.manifest_fingerprint<>r.manifest_fingerprint or review.evidence_fingerprint<>ef or r.evidence_fingerprint<>ef then raise exception 'method_review_stale' using errcode='40001';end if;
 if r.status='published' then return r.id;end if;
 update public.method_releases set status='published',published_by=auth.uid(),published_at=now() where id=r.id;return r.id;
end $$;

create function private.bind_method_release_v1(p_binding_id uuid,p_release_id uuid,p_expected_binding_id uuid,p_unit_id uuid default null,p_work_type text default null,p_work_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();r public.method_releases;current_id uuid;existing public.method_scope_bindings;begin
 if not private.method_scope_allowed_v1(org,'publish') or not private.method_release_readable_v1(org,p_release_id) then raise exception 'method_binding_denied' using errcode='42501';end if;
 if p_binding_id is null or (p_work_id is not null and not private.can_access_resource_v1(org,p_work_id,'work'))
 or (p_unit_id is not null and not exists(select 1 from private.organization_units where organization_id=org and id=p_unit_id and enabled)) then raise exception 'method_binding_denied' using errcode='42501';end if;
 select * into r from public.method_releases where organization_id=org and id=p_release_id for update;
 if r.id is null or r.status<>'published' or (r.manifest->'context'->>'unitId')::uuid is distinct from p_unit_id
 or (p_work_type is not null and r.manifest->'context'->>'workType'<>p_work_type) then raise exception 'method_binding_conflict' using errcode='22023';end if;
 perform private.compose_method_v1(org,r.base_release_id,r.manifest->'overrides',p_unit_id,r.manifest->'context'->>'workType');
 select * into existing from public.method_scope_bindings where id=p_binding_id;
 if found then
  if existing.organization_id<>org or existing.release_id<>p_release_id or existing.unit_id is distinct from p_unit_id or existing.work_type is distinct from p_work_type or existing.work_id is distinct from p_work_id or existing.retired_at is not null then raise exception 'method_request_reused' using errcode='22023';end if;return existing.id;
 end if;
 select id into current_id from public.method_scope_bindings where organization_id=org and unit_id is not distinct from p_unit_id and work_type is not distinct from p_work_type and work_id is not distinct from p_work_id and retired_at is null for update;
 if current_id is distinct from p_expected_binding_id then raise exception 'method_binding_stale' using errcode='40001';end if;
 update public.method_scope_bindings set retired_at=now() where id=current_id;
 insert into public.method_scope_bindings(id,organization_id,release_id,unit_id,work_type,work_id,previous_binding_id,created_by)
 values(p_binding_id,org,r.id,p_unit_id,p_work_type,p_work_id,current_id,auth.uid());return p_binding_id;
end $$;
create function private.retire_method_release_v1(p_release_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();r public.method_releases;begin
 -- Withdrawal remains possible after a dependency becomes unreadable; it reveals no content.
 if not private.method_scope_allowed_v1(org,'publish') then raise exception 'method_retirement_denied' using errcode='42501';end if;
 if p_reason is null or length(btrim(p_reason)) not between 5 and 2000 then raise exception 'method_retirement_invalid' using errcode='22023';end if;
 select * into r from public.method_releases where organization_id=org and id=p_release_id for update;
 if r.id is null or r.status='candidate' then raise exception 'method_release_unavailable' using errcode='22023';end if;
 if r.status='retired' then return r.id;end if;
 update public.method_releases set status='retired',retired_by=auth.uid(),retired_at=now(),retirement_reason=btrim(p_reason) where id=r.id;
 -- Keep bindings visible. A retired house method blocks instead of falling back to the default.
 return r.id;
end $$;
create function private.set_method_publication_policy_v1(p_separate_reviewer boolean) returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();begin
 if not private.can_manage_organization(org) or p_separate_reviewer is null then raise exception 'method_policy_denied' using errcode='42501';end if;
 insert into private.method_publication_policies(organization_id,separate_reviewer,updated_by) values(org,p_separate_reviewer,auth.uid())
 on conflict(organization_id) do update set separate_reviewer=excluded.separate_reviewer,updated_by=excluded.updated_by,updated_at=now();
end $$;

create function private.list_method_releases_v1(p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();rows jsonb;bases jsonb;scope uuid;begin
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'method_page_invalid' using errcode='22023';end if;
 select id into strict scope from public.vault_scopes where organization_id=org;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'methodId',b.method_id,'version',b.version,'manifestHash',b.manifest_hash,'components',b.components,'evidence',b.evidence,'approval',b.approval) order by b.id),'[]') into bases
 from private.platform_method_releases b join private.platform_capability_releases c on c.capability_key=b.capability_key where c.released and c.method_id=b.method_id and c.method_version=b.version;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (
  select r.id,r.title,r.status,r.base_release_id,r.manifest,r.manifest_fingerprint,r.evidence_fingerprint,r.created_by,r.published_at,r.retired_at,
  (select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'reviewed_by',v.reviewed_by,'review_text',v.review_text,'created_at',v.created_at) order by v.created_at,v.id),'[]') from public.method_review_records v where v.organization_id=org and v.release_id=r.id) reviews
  from public.method_releases r where r.organization_id=org and private.method_release_readable_v1(org,r.id) order by r.created_at desc,r.id limit 26 offset p_offset
 ) q;
 return jsonb_build_object('rows',rows,'bases',bases,'scopeId',scope,'canRead',private.method_scope_allowed_v1(org,'read'),
 'canWork',private.method_scope_allowed_v1(org,'work'),'canPublish',private.method_scope_allowed_v1(org,'publish'),'canManage',private.can_manage_organization(org),
 'separateReviewer',coalesce((select separate_reviewer from private.method_publication_policies where organization_id=org),true),'offset',p_offset);
end $$;

-- Existing RPC becomes authoring only. Caller-supplied "reviewed" never supplies approval.
alter table public.organization_methodologies drop constraint organization_methodologies_status_check;
alter table public.organization_methodologies add constraint organization_methodologies_status_check check(status in ('active','superseded','candidate'));
insert into public.method_releases(id,organization_id,scope_id,title,manifest,manifest_fingerprint,evidence_fingerprint,legacy_methodology_id,created_by)
select gen_random_uuid(),m.organization_id,s.id,'Legacy methodology candidate',jsonb_build_object('schemaVersion','legacy-methodology-candidate.v1','content',m.content,'grantsExecution',false,'pendingContent',jsonb_build_array('typed composition','test evidence','human review')),
encode(extensions.digest(m.content::text,'sha256'),'hex'),encode(extensions.digest('[]','sha256'),'hex'),m.id,m.created_by
from public.organization_methodologies m join public.vault_scopes s on s.organization_id=m.organization_id;
update public.organization_methodologies set status='superseded' where status='active';
create or replace function private.save_organization_methodology(p_organization_id uuid,p_content jsonb,p_source_kind text default 'self_declared') returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();scope uuid;v integer;id uuid:=gen_random_uuid();fp text;begin
 if org<>p_organization_id or not private.can_manage_organization(org) then raise exception 'organization_access_denied' using errcode='42501';end if;
 if p_content is null or jsonb_typeof(p_content)<>'object' or p_content->>'schemaVersion' is distinct from 'organization-methodology.v1'
 or p_content->>'capabilitiesReference' is distinct from 'institution_capability_profiles' or p_source_kind is null or p_source_kind not in ('house_default','self_declared','reviewed')
 or octet_length(p_content::text)>100000 then raise exception 'invalid_methodology' using errcode='22023';end if;
 select coalesce(max(version_number),0)+1 into v from public.organization_methodologies where organization_id=org;
 insert into public.organization_methodologies(id,organization_id,version_number,status,content,source_kind,created_by) values(id,org,v,'candidate',p_content,p_source_kind,auth.uid());
 select s.id into strict scope from public.vault_scopes s where organization_id=org;
 fp:=encode(extensions.digest(p_content::text,'sha256'),'hex');
 insert into public.method_releases(id,organization_id,scope_id,title,manifest,manifest_fingerprint,evidence_fingerprint,legacy_methodology_id,created_by)
 values(gen_random_uuid(),org,scope,'Legacy methodology candidate',jsonb_build_object('schemaVersion','legacy-methodology-candidate.v1','content',p_content,'grantsExecution',false,'pendingContent',jsonb_build_array('typed composition','test evidence','human review')),fp,encode(extensions.digest('[]','sha256'),'hex'),id,auth.uid());
 return jsonb_build_object('id',id,'version',v,'status','candidate');
end $$;
-- Historical rows stay historical; loaders cannot elevate them into an executable method.
drop policy organization_methodologies_select on public.organization_methodologies;
create policy organization_methodologies_select on public.organization_methodologies for select to authenticated using(private.method_scope_allowed_v1(organization_id,'read'));
comment on table public.organization_methodologies is 'Historical authoring projection. Candidate content is not a published method; runtime authority belongs to method_releases.';
do $$ declare f record;body text;changed integer:=0;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.prokind='f' and p.prosrc like '%public.organization_methodologies%' and p.prosrc like '%methodology.status%' loop
  select pg_get_functiondef(f.oid) into body;
  if position('methodology.status = ''active''' in body)=0 then raise exception 'legacy_methodology_loader_changed';end if;
  body:=replace(body,'methodology.status = ''active''','false /* historical methodology is not publication authority */');execute body;changed:=changed+1;
 end loop;
 if changed=0 then raise exception 'legacy_methodology_loaders_missing';end if;
end $$;

-- Bounded invoker API, no service-role publication. Helpers stay inaccessible to callers.
create function public.submit_method_candidate_v1(p_id uuid,p_title text,p_base_release_id text,p_overrides jsonb,p_unit_id uuid default null,p_work_type text default 'analysis') returns uuid language sql security invoker set search_path='' as $$ select private.submit_method_candidate_v1(p_id,p_title,p_base_release_id,p_overrides,p_unit_id,p_work_type); $$;
create function public.review_method_candidate_v1(p_release_id uuid,p_review_id uuid,p_manifest_fingerprint text,p_evidence_fingerprint text,p_review_text text) returns uuid language sql security invoker set search_path='' as $$ select private.review_method_candidate_v1(p_release_id,p_review_id,p_manifest_fingerprint,p_evidence_fingerprint,p_review_text); $$;
create function public.publish_method_release_v1(p_release_id uuid,p_review_id uuid,p_manifest_fingerprint text) returns uuid language sql security invoker set search_path='' as $$ select private.publish_method_release_v1(p_release_id,p_review_id,p_manifest_fingerprint); $$;
create function public.bind_method_release_v1(p_binding_id uuid,p_release_id uuid,p_expected_binding_id uuid,p_unit_id uuid default null,p_work_type text default null,p_work_id uuid default null) returns uuid language sql security invoker set search_path='' as $$ select private.bind_method_release_v1(p_binding_id,p_release_id,p_expected_binding_id,p_unit_id,p_work_type,p_work_id); $$;
create function public.retire_method_release_v1(p_release_id uuid,p_reason text) returns uuid language sql security invoker set search_path='' as $$ select private.retire_method_release_v1(p_release_id,p_reason); $$;
create function public.set_method_publication_policy_v1(p_separate_reviewer boolean) returns void language sql security invoker set search_path='' as $$ select private.set_method_publication_policy_v1(p_separate_reviewer); $$;
create function public.list_method_releases_v1(p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select private.list_method_releases_v1(p_offset); $$;
do $$ declare f record;begin
 for f in select p.oid::regprocedure sig,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
 and p.proname=any(array['method_value_matches_v1','compose_method_v1','submit_method_candidate_v1','review_method_candidate_v1','publish_method_release_v1','bind_method_release_v1','retire_method_release_v1','set_method_publication_policy_v1','list_method_releases_v1']) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
  if f.proname not in ('method_value_matches_v1','compose_method_v1') then execute format('grant execute on function %s to authenticated',f.sig);end if;
 end loop;
end $$;

create table private.processing_run_method_pins (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),processing_run_id uuid not null,method_id text not null,
 platform_release_id text not null references private.platform_method_releases(id),house_release_id uuid,manifest_fingerprint text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,processing_run_id,method_id),
 foreign key(organization_id,processing_run_id) references public.processing_runs(organization_id,id),
 foreign key(organization_id,house_release_id) references public.method_releases(organization_id,id)
);
alter table private.processing_run_method_pins enable row level security;
alter table private.processing_run_method_pins force row level security;
revoke all on private.processing_run_method_pins from public,anon,authenticated,service_role;
create policy method_pins_deny on private.processing_run_method_pins for all to public using(false) with check(false);
create trigger method_pins_immutable before update or delete on private.processing_run_method_pins for each row execute function private.guard_contribution_immutable_v1();
create trigger method_pins_audit after insert or update or delete on private.processing_run_method_pins for each row execute function private.capture_identity_audit_v1();

create function private.pin_worker_method_release_v1(p_job_id uuid,p_capability_token text,p_method_id text,p_work_type text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);actor uuid;work uuid;pin private.processing_run_method_pins;
 binding public.method_scope_bindings;r public.method_releases;b private.platform_method_releases;begin
 select created_by into strict actor from public.processing_runs where organization_id=j.organization_id and id=j.processing_run_id;
 select capital_project_id into work from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||j.organization_id::text,0));
 select * into pin from private.processing_run_method_pins where organization_id=j.organization_id and processing_run_id=j.processing_run_id and method_id=p_method_id;
 if pin.id is null then
  -- Unit-specific composition requires an explicit work binding, never a guessed actor profile.
  select x.* into binding from public.method_scope_bindings x join public.method_releases m on m.organization_id=x.organization_id and m.id=x.release_id
  join private.platform_method_releases base on base.id=m.base_release_id
  where x.organization_id=j.organization_id and x.retired_at is null and base.method_id=p_method_id
  and (x.work_id=work or (x.work_id is null and x.unit_id is null)) and (x.work_type is null or x.work_type=p_work_type)
  order by (x.work_id is not null) desc,(x.work_type is not null) desc,x.created_at desc,x.id limit 1;
  if binding.id is not null then
   select * into r from public.method_releases where organization_id=j.organization_id and id=binding.release_id;
   select * into b from private.platform_method_releases where id=r.base_release_id;
  else
   select base.* into b from private.platform_method_releases base join private.platform_capability_releases c on c.capability_key=base.capability_key
   where base.method_id=p_method_id and c.released and c.method_id=base.method_id and c.method_version=base.version order by base.created_at desc,base.id limit 1;
  end if;
  if b.id is null then raise exception 'method_release_unavailable' using errcode='42501';end if;
  insert into private.processing_run_method_pins(organization_id,processing_run_id,method_id,platform_release_id,house_release_id,manifest_fingerprint)
  values(j.organization_id,j.processing_run_id,p_method_id,b.id,r.id,coalesce(r.manifest_fingerprint,b.manifest_hash)) returning * into pin;
 else
  select * into b from private.platform_method_releases where id=pin.platform_release_id;
  if pin.house_release_id is not null then select * into r from public.method_releases where organization_id=j.organization_id and id=pin.house_release_id;end if;
 end if;
 if not exists(select 1 from private.platform_capability_releases c where c.capability_key=b.capability_key and c.released and c.method_id=b.method_id and c.method_version=b.version) then raise exception 'method_release_unavailable' using errcode='42501';end if;
 if pin.house_release_id is not null then
  if r.id is null or r.status<>'published' or r.manifest_fingerprint<>pin.manifest_fingerprint
  or not private.evaluate_resource_policy_v1(j.organization_id,r.scope_id,actor,'read','analysis') then raise exception 'method_house_release_unavailable' using errcode='42501';end if;
  -- R01 has no declared override points. Other executors must explicitly consume parameters
  -- and revalidate all inherited source rights before their release can be dispatched (stage 17).
  if jsonb_array_length(r.manifest->'overrides')<>0 then raise exception 'method_executor_composition_unsupported' using errcode='42501';end if;
 end if;
 return jsonb_build_object('platformReleaseId',b.id,'baseManifestHash',b.manifest_hash,'houseReleaseId',pin.house_release_id,'manifestFingerprint',pin.manifest_fingerprint,'processingRunId',pin.processing_run_id,'methodId',b.method_id,'methodVersion',b.version);
end $$;
revoke all on function private.pin_worker_method_release_v1(uuid,text,text,text) from public,anon,authenticated,service_role;
-- Bind the existing released path, including its live pause, without changing financial math.
do $$ declare body text;begin
 select pg_get_functiondef('private.worker_load_receivables_analytical_release_v1(uuid,text)'::regprocedure) into body;
 if position('''granted'', v_open' in body)=0 then raise exception 'receivables_release_loader_changed';end if;
 body:=replace(body,'''granted'', v_open',E'''methodBinding'', case when v_open then private.pin_worker_method_release_v1(p_job_id,p_capability_token,''underwrite-receivables-pool'',''receivables_underwriting'') else null end,\n    ''granted'', v_open');execute body;
end $$;

-- Index every foreign-key traversal, including reviewers and historical references.
create index method_components_scope_id_idx on public.method_components(organization_id,scope_id);
create index method_components_created_by_idx on public.method_components(created_by);
create index method_component_versions_component_id_idx on public.method_component_versions(organization_id,component_id);
create index method_component_versions_vault_version_id_idx on public.method_component_versions(organization_id,vault_version_id);
create index method_component_versions_created_by_idx on public.method_component_versions(created_by);
create index method_releases_scope_id_idx on public.method_releases(organization_id,scope_id);
create index method_releases_base_release_id_idx on public.method_releases(base_release_id);
create index method_releases_created_by_idx on public.method_releases(created_by);
create index method_releases_published_by_idx on public.method_releases(published_by);
create index method_releases_retired_by_idx on public.method_releases(retired_by);
create index method_release_components_component_version_id_idx on public.method_release_components(organization_id,component_version_id);
create index method_review_records_release_id_idx on public.method_review_records(organization_id,release_id);
create index method_review_records_reviewed_by_idx on public.method_review_records(reviewed_by);
create index method_scope_bindings_release_id_idx on public.method_scope_bindings(organization_id,release_id);
create index method_scope_bindings_unit_id_idx on public.method_scope_bindings(organization_id,unit_id);
create index method_scope_bindings_work_id_idx on public.method_scope_bindings(organization_id,work_id);
create index method_scope_bindings_previous_binding_id_idx on public.method_scope_bindings(organization_id,previous_binding_id);
create index method_scope_bindings_created_by_idx on public.method_scope_bindings(created_by);
create index method_pins_platform_idx on private.processing_run_method_pins(platform_release_id);
create index method_pins_house_idx on private.processing_run_method_pins(organization_id,house_release_id);
create index method_policy_actor_idx on private.method_publication_policies(updated_by);
create index platform_method_capability_idx on private.platform_method_releases(capability_key);

-- Import the real 10 September human approval, not a new agent promotion. R01 exposes no
-- customization points until professionally reviewed typed components exist.
insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)
select 'r01-2026.09.06-v1',method_id,method_version,'17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090','{"schemaVersion":"legacy-procedure-adapter.v1","procedure":{"id":"underwrite-receivables-pool","version":"2026.09.06-v1","maturity":"production"},"source":{"path":"receivables/underwrite-receivables-pool.md","hash":"9f5cf24e6751c708a7ff9825afebdd1878e2e07fc652c295df7493cb8e246264"},"compiler":{"version":"2026.09.18-v1","sources":[{"path":"packages/credit-playbook/src/build-method-manifest.ts","hash":"38dacf680a45fc8e55dc2a862fa8cf950e6b34d626b485a85bc088b997decaec"},{"path":"packages/credit-playbook/src/method-component.ts","hash":"50a0dc0769ce9bd9d6f909f2a7242d69ed63bcd00e62850772b007ee37dd74e0"},{"path":"packages/credit-playbook/src/procedure-compiler.ts","hash":"f33177013196299df7c1345ed030b4af548fc815978b0c8ca639936620d8e93a"},{"path":"packages/credit-playbook/src/procedure-contract.ts","hash":"a5d53552cb262804d32573ee5d954cf5b225dc605851cc1d76cea19be29f70c7"},{"path":"packages/credit-playbook/src/procedure-markdown.ts","hash":"e4a0b52163edbdfe7d7ed3e8b0f4dd34ca9415628fd1e48b768cb1285b8ebf21"},{"path":"packages/credit-playbook/src/review-record.ts","hash":"d44342d3d38509c2a616b737e4d9f79e151305a35b918ce2e0dc9d3de5cd013a"},{"path":"pnpm-lock.yaml","hash":"9c58538e770b8ae181c088a42ba33a5456fbbc112eda3188b9898c084464df5b"},{"path":"tsconfig.base.json","hash":"0b80c49c86ed761d3e51788378c8e43cbcabebf8ccfbdd520c147223e9d543da"}],"hash":"757a3e46d1fc3fd4225e0f91e3302759bd59bb2aae5a3390a8a4db9b55c6bf2e"},"adapterHash":"caf448f8e194522a4fed02a967098ae8da0b6a6cb0ea22995c4b15d3e5c5d288","compositionStatus":"legacy_contract","grantsExecution":false,"pendingContent":["typed component contracts require explicit authorship"],"executor":{"module":"@offroad/receivables-analysis","exportName":"underwriteReceivablesPool","sourceClosureHash":"37ed5a9a2253f25e3c2b8d79d0e9cabf92c76e9bb3d06a74e52380d164c7e9e6"},"evidence":[{"path":"packages/credit-playbook/knowledge/reviews/runs/underwrite-receivables-pool-2026-09-10-adversarial/run.json","hash":"c28b9da4748cadeafaa1d3e66f6c4bec18f0bd3e4734c09e9d270347a058c99c"},{"path":"packages/credit-playbook/knowledge/reviews/runs/underwrite-receivables-pool-2026-09-10-consistency/run.json","hash":"4b7a1f6ee4aa6bcfa2e2e57cce17389288645862f5527ed9ff2d0d98c15e8e2c"},{"path":"packages/credit-playbook/knowledge/reviews/runs/underwrite-receivables-pool-2026-09-10-gold/run.json","hash":"47686335ebeedd9a0a651019d617963765162afd8119c3b1cbf2f2b81a330833"},{"path":"packages/credit-playbook/knowledge/reviews/underwrite-receivables-pool-2026-09-10-independent-review.json","hash":"829490e6200a23a7b62736706e3c7655ff5d81cc36ff980b06541a8d36a09e01"},{"path":"packages/receivables-analysis/src/underwrite.test.ts","hash":"511f0c30353dc6c0c2d038d7f7738e9f7cb566ab827b8a373d7ee5d773f7e2b7"}],"manifestHash":"17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090"}'::jsonb,'[]'::jsonb,'[{"path":"packages/credit-playbook/knowledge/reviews/runs/underwrite-receivables-pool-2026-09-10-adversarial/run.json","hash":"c28b9da4748cadeafaa1d3e66f6c4bec18f0bd3e4734c09e9d270347a058c99c"},{"path":"packages/credit-playbook/knowledge/reviews/runs/underwrite-receivables-pool-2026-09-10-consistency/run.json","hash":"4b7a1f6ee4aa6bcfa2e2e57cce17389288645862f5527ed9ff2d0d98c15e8e2c"},{"path":"packages/credit-playbook/knowledge/reviews/runs/underwrite-receivables-pool-2026-09-10-gold/run.json","hash":"47686335ebeedd9a0a651019d617963765162afd8119c3b1cbf2f2b81a330833"},{"path":"packages/credit-playbook/knowledge/reviews/underwrite-receivables-pool-2026-09-10-independent-review.json","hash":"829490e6200a23a7b62736706e3c7655ff5d81cc36ff980b06541a8d36a09e01"},{"path":"packages/receivables-analysis/src/underwrite.test.ts","hash":"511f0c30353dc6c0c2d038d7f7738e9f7cb566ab827b8a373d7ee5d773f7e2b7"}]'::jsonb,'{"procedure":{"id":"underwrite-receivables-pool","version":"2026.09.06-v1"},"approvedBy":"Carlos Eduardo Galves","approvedAt":"2026-09-10","approvalSource":"instrução do fundador na sessão de coordenação de 10/09/2026"}'::jsonb,capability_key
from private.platform_capability_releases where capability_key='finance.receivables-released-analysis' and method_id='underwrite-receivables-pool' and method_version='2026.09.06-v1' and approved_by='Carlos Eduardo Galves' and approved_at=date '2026-09-10' and approval_source='instrução do fundador na sessão de coordenação de 10/09/2026';
do $$ begin if not exists(select 1 from private.platform_method_releases where id='r01-2026.09.06-v1') then raise exception 'r01_human_approval_not_reconciled';end if;end $$;
