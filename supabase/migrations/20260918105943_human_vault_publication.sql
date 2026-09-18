-- Stage 12 draft. Publication is a separate, explicit human permission.
set search_path='';
create table public.vault_scopes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null unique references public.organizations(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id)
);
create table public.vault_entries (
 id uuid primary key,organization_id uuid not null references public.organizations(id),scope_id uuid not null,
 kind text not null check(kind in ('source','adoption','directive','template')),
 created_by uuid references auth.users(id),head_version_id uuid,
 legacy_source_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,legacy_source_id),
 foreign key(organization_id,scope_id) references public.vault_scopes(organization_id,id),
 foreign key(organization_id,legacy_source_id) references public.sources(organization_id,id)
);
create table public.vault_entry_versions (
 id uuid primary key,organization_id uuid not null references public.organizations(id),entry_id uuid not null,
 revision integer not null check(revision>0),previous_version_id uuid,
 title text not null check(length(btrim(title)) between 1 and 180),
 directive_text text check(length(btrim(directive_text)) between 1 and 32000),
 source_version_id uuid,assumption_version_id uuid,presentation_template_id uuid,
 dependency_manifest jsonb not null check(jsonb_typeof(dependency_manifest)='array' and jsonb_array_length(dependency_manifest)<=1000),
 reference_fingerprint text check(reference_fingerprint ~ '^[a-f0-9]{64}$'),
 provenance jsonb not null check(jsonb_typeof(provenance)='object' and octet_length(provenance::text)<=4096),
 content_fingerprint text not null check(content_fingerprint ~ '^[a-f0-9]{64}$'),
 request_fingerprint text not null check(request_fingerprint ~ '^[a-f0-9]{64}$'),
 created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,entry_id,id),unique(organization_id,entry_id,revision),
 foreign key(organization_id,entry_id) references public.vault_entries(organization_id,id),
 foreign key(organization_id,entry_id,previous_version_id) references public.vault_entry_versions(organization_id,entry_id,id),
 foreign key(organization_id,source_version_id) references public.source_versions(organization_id,id),
 foreign key(organization_id,assumption_version_id) references public.assumption_versions(organization_id,id),
 foreign key(organization_id,presentation_template_id) references public.presentation_templates(organization_id,id),
 check(num_nonnulls(directive_text,source_version_id,assumption_version_id,presentation_template_id)=1),
 check((revision=1)=(previous_version_id is null))
);
alter table public.vault_entries add foreign key(organization_id,id,head_version_id) references public.vault_entry_versions(organization_id,entry_id,id);
create table public.vault_publication_requests (
 id uuid primary key,organization_id uuid not null references public.organizations(id),entry_id uuid not null,version_id uuid not null,
 version_fingerprint text not null check(version_fingerprint ~ '^[a-f0-9]{64}$'),
 review_fingerprint text not null check(review_fingerprint ~ '^[a-f0-9]{64}$'),
 work_scope_id uuid,purpose text not null check(purpose in ('analysis','retrieval','export')),
 expected_publication_id uuid,
 reason text not null check(length(btrim(reason)) between 5 and 2000),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,entry_id,id),
 foreign key(organization_id,entry_id,version_id) references public.vault_entry_versions(organization_id,entry_id,id),
 foreign key(organization_id,work_scope_id) references public.capital_projects(organization_id,id)
);
create table public.vault_publications (
 id uuid primary key,organization_id uuid not null references public.organizations(id),entry_id uuid not null,request_id uuid not null,
 published_by uuid not null references auth.users(id),published_at timestamptz not null default now(),
 withdrawn_by uuid references auth.users(id),withdrawn_at timestamptz,withdrawal_reason text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,entry_id,id),unique(organization_id,request_id),
 foreign key(organization_id,entry_id,request_id) references public.vault_publication_requests(organization_id,entry_id,id),
 check(num_nonnulls(withdrawn_by,withdrawn_at,withdrawal_reason) in (0,3)),
 check(withdrawal_reason is null or length(btrim(withdrawal_reason)) between 5 and 2000)
);
create unique index vault_publications_one_active on public.vault_publications(organization_id,entry_id) where withdrawn_at is null;
alter table public.vault_publication_requests add foreign key(organization_id,entry_id,expected_publication_id) references public.vault_publications(organization_id,entry_id,id);
create table private.vault_source_dependencies (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),version_id uuid not null,
 source_version_id uuid not null,rights_version_id uuid not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,version_id,source_version_id,rights_version_id),
 foreign key(organization_id,version_id) references public.vault_entry_versions(organization_id,id),
 foreign key(organization_id,source_version_id,rights_version_id) references private.source_rights_versions(organization_id,source_version_id,id)
);
create index vault_entries_scope_idx on public.vault_entries(organization_id,scope_id);
create index vault_entries_actor_idx on public.vault_entries(created_by);
create index vault_entries_head_idx on public.vault_entries(organization_id,id,head_version_id);
create index vault_versions_previous_idx on public.vault_entry_versions(organization_id,entry_id,previous_version_id);
create index vault_versions_source_idx on public.vault_entry_versions(organization_id,source_version_id);
create index vault_versions_assumption_idx on public.vault_entry_versions(organization_id,assumption_version_id);
create index vault_versions_template_idx on public.vault_entry_versions(organization_id,presentation_template_id);
create index vault_versions_actor_idx on public.vault_entry_versions(created_by);
create index vault_requests_version_idx on public.vault_publication_requests(organization_id,entry_id,version_id);
create index vault_requests_work_idx on public.vault_publication_requests(organization_id,work_scope_id);
create index vault_requests_previous_idx on public.vault_publication_requests(organization_id,entry_id,expected_publication_id);
create index vault_requests_actor_idx on public.vault_publication_requests(created_by);
create index vault_publications_request_idx on public.vault_publications(organization_id,entry_id,request_id);
create index vault_publications_actor_idx on public.vault_publications(published_by);
create index vault_publications_withdrawer_idx on public.vault_publications(withdrawn_by);
create index vault_dependencies_rights_idx on private.vault_source_dependencies(organization_id,source_version_id,rights_version_id);

-- Extend the canonical resource registry, not a second ACL.
alter table private.access_resources add column vault_scope_id uuid,add column vault_entry_id uuid,
 add foreign key(organization_id,vault_scope_id) references public.vault_scopes(organization_id,id),
 add foreign key(organization_id,vault_entry_id) references public.vault_entries(organization_id,id);
do $$ declare c record; begin
 for c in select conname,pg_get_constraintdef(oid) d from pg_constraint where conrelid='private.access_resources'::regclass and contype='c' loop
  if c.d like '%num_nonnulls%' or c.d like '%coalesce(%' or c.d like '%COALESCE(%' or c.d like '%parent_resource_id%' or (c.d like '%resource_kind%' and c.d not like '%IS NOT NULL%') then execute format('alter table private.access_resources drop constraint %I',c.conname);end if;
 end loop;
end $$;
alter table private.access_resources add constraint access_resources_kinds check(resource_kind in ('capital_project','intake_session','opportunity','workspace_group','company','vault_scope','vault_entry')),
 add constraint access_resources_one_identity check(num_nonnulls(capital_project_id,intake_session_id,opportunity_id,workspace_group_id,company_id,vault_scope_id,vault_entry_id)=1),
 add constraint access_resources_identity check(id=coalesce(capital_project_id,intake_session_id,opportunity_id,workspace_group_id,company_id,vault_scope_id,vault_entry_id)),
 add constraint access_resources_vault_scope_identity check((resource_kind='vault_scope')=(vault_scope_id is not null)),
 add constraint access_resources_vault_entry_identity check((resource_kind='vault_entry')=(vault_entry_id is not null)),
 add constraint access_resources_parent_kind check(parent_resource_id is null or (parent_resource_id<>id and resource_kind in ('intake_session','opportunity','vault_entry')));
create index access_resources_vault_scope_idx on private.access_resources(organization_id,vault_scope_id);
create index access_resources_vault_entry_idx on private.access_resources(organization_id,vault_entry_id);
alter table private.resource_access_grants drop constraint resource_access_grants_action_check;
alter table private.resource_access_grants add constraint resource_access_grants_action_check check(action in ('read','work','manage','publish'));
-- Publication is not implied by manage, and is limited to vault resources.
do $$ declare body text; begin
 select pg_get_functiondef('private.evaluate_resource_policy_v1(uuid,uuid,uuid,text,text)'::regprocedure) into body;
 if position('g.action=''manage''' in body)=0 then raise exception 'pdp_contract_changed';end if;
 body:=replace(body,'p_action not in (''read'',''work'',''manage'')','p_action not in (''read'',''work'',''manage'',''publish'')');
 body:=replace(body,'g.action=''manage''','(g.action=''manage'' and p_action<>''publish'')');
 body:=replace(body,'root:=private.resource_root_v1',E'if p_action=''publish'' and not exists(select 1 from private.access_resources where organization_id=p_org and id=p_resource and resource_kind in (''vault_scope'',''vault_entry'')) then return false;end if;\n root:=private.resource_root_v1');
 execute body;
 select pg_get_functiondef('private.set_resource_policy_grant_v1(uuid,uuid,uuid,text,text,boolean,timestamptz)'::regprocedure) into body;
 if position('p_action not in (''read'',''work'',''manage'')' in body)=0 then raise exception 'grant_contract_changed';end if;
 body:=replace(body,'p_action not in (''read'',''work'',''manage'')','p_action not in (''read'',''work'',''manage'',''publish'')');
 body:=replace(body,'root:=private.resource_root_v1',E'if p_action=''publish'' and not exists(select 1 from private.access_resources where organization_id=org and id=p_resource_id and resource_kind in (''vault_scope'',''vault_entry'')) then raise exception ''vault_publisher_scope_invalid'' using errcode=''22023'';end if;\n root:=private.resource_root_v1');execute body;
end $$;
create function private.register_vault_resource_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='vault_scopes' then
  insert into private.access_resources(id,organization_id,resource_kind,vault_scope_id) values(new.id,new.organization_id,'vault_scope',new.id);
 else
  insert into private.access_resources(id,organization_id,resource_kind,vault_entry_id,parent_resource_id) values(new.id,new.organization_id,'vault_entry',new.id,new.scope_id);
 end if;
 return new;
end $$;
revoke all on function private.register_vault_resource_v1() from public,anon,authenticated,service_role;
create trigger vault_scope_resource after insert on public.vault_scopes for each row execute function private.register_vault_resource_v1();
create trigger vault_entry_resource after insert on public.vault_entries for each row execute function private.register_vault_resource_v1();
create function private.seed_vault_scope_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.vault_scopes(organization_id) values(new.id);return new;end $$;
revoke all on function private.seed_vault_scope_v1() from public,anon,authenticated,service_role;
create trigger organizations_vault_scope after insert on public.organizations for each row execute function private.seed_vault_scope_v1();
insert into public.vault_scopes(organization_id) select id from public.organizations;

create function private.vault_reference_allowed_v1(p_org uuid,p_version uuid,p_purpose text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v public.vault_entry_versions; k text; d record; op text;
begin
 select * into v from public.vault_entry_versions where organization_id=p_org and id=p_version;
 if v.id is null or not private.workspace_context_matches_v1(p_org) or p_purpose not in ('analysis','retrieval','publication','export') then return false;end if;
 select kind into k from public.vault_entries where organization_id=p_org and id=v.entry_id;
 if v.source_version_id is not null and not exists(select 1 from private.vault_source_dependencies where organization_id=p_org and version_id=v.id and source_version_id=v.source_version_id) then return false;end if;
 if v.source_version_id is not null and not private.source_use_allowed_v1(p_org,v.source_version_id,auth.uid(),'read',p_purpose) then return false;end if;
 if v.assumption_version_id is not null and not private.can_read_assumption_version_v1(p_org,v.assumption_version_id) then return false;end if;
 if v.presentation_template_id is not null and not exists(select 1 from public.presentation_templates t where t.organization_id=p_org and t.id=v.presentation_template_id and t.fingerprint=v.reference_fingerprint
 and (t.capital_project_id is null or private.can_access_resource_v1(p_org,t.capital_project_id,'read'))) then return false;end if;
 for d in select * from private.vault_source_dependencies where organization_id=p_org and version_id=p_version loop
  foreach op in array case when k='source' then array['read','store'] else array['read','store','derive'] end loop
   if not exists(select 1 from private.source_rights_versions r where r.organization_id=p_org and r.id=d.rights_version_id and r.source_version_id=d.source_version_id
    and op=any(r.operations) and p_purpose=any(r.purposes) and r.valid_from<=clock_timestamp()
    and (r.expires_at is null or r.expires_at>clock_timestamp()) and (r.store_until is null or r.store_until>clock_timestamp()))
    or not private.source_use_allowed_v1(p_org,d.source_version_id,auth.uid(),op,p_purpose) then return false;end if;
  end loop;
 end loop;
 return true;
end $$;
create function private.can_read_vault_version_v1(p_org uuid,p_version uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare v public.vault_entry_versions;r public.vault_publication_requests;
begin
 select * into v from public.vault_entry_versions where organization_id=p_org and id=p_version;
 if v.id is null or not private.can_access_resource_v1(p_org,v.entry_id,'read') then return false;end if;
 if (private.can_access_resource_v1(p_org,v.entry_id,'work') or private.evaluate_resource_policy_v1(p_org,v.entry_id,auth.uid(),'publish','publication'))
 and private.vault_reference_allowed_v1(p_org,p_version,'analysis') then return true;end if;
 select q.* into r from public.vault_publications p join public.vault_publication_requests q on q.organization_id=p.organization_id and q.id=p.request_id
 where p.organization_id=p_org and p.entry_id=v.entry_id and p.withdrawn_at is null and q.version_id=p_version;
 return r.id is not null and (r.work_scope_id is null or private.can_access_resource_v1(p_org,r.work_scope_id,'read'))
 and private.vault_reference_allowed_v1(p_org,p_version,'publication') and private.vault_reference_allowed_v1(p_org,p_version,r.purpose);
end $$;
create function private.can_read_vault_entry_v1(p_org uuid,p_entry uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select private.can_access_resource_v1(p_org,p_entry,'read') and exists(select 1 from public.vault_entry_versions v where v.organization_id=p_org and v.entry_id=p_entry and private.can_read_vault_version_v1(p_org,v.id));
$$;
revoke all on function private.vault_reference_allowed_v1(uuid,uuid,text),private.can_read_vault_version_v1(uuid,uuid),private.can_read_vault_entry_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_read_vault_version_v1(uuid,uuid),private.can_read_vault_entry_v1(uuid,uuid) to authenticated;

create function private.can_read_vault_scope_v1(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.workspace_context_matches_v1(p_org) and exists(select 1 from private.principals p join auth.users u on u.id=p.user_id where p.organization_id=p_org and p.user_id=auth.uid() and p.kind='human' and p.revoked_at is null and u.deleted_at is null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now()));
$$;
revoke all on function private.can_read_vault_scope_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.can_read_vault_scope_v1(uuid) to authenticated;
do $$ declare t text; pred text; begin
 foreach t in array array['vault_scopes','vault_entries','vault_entry_versions','vault_publication_requests','vault_publications'] loop
  execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select on public.%I to authenticated',t);
  pred:=case t when 'vault_scopes' then 'private.can_read_vault_scope_v1(organization_id)'
  when 'vault_entries' then 'private.can_read_vault_entry_v1(organization_id,id)'
  when 'vault_entry_versions' then 'private.can_read_vault_version_v1(organization_id,id)'
  when 'vault_publication_requests' then 'private.can_read_vault_version_v1(organization_id,version_id)'
  else 'private.can_read_vault_entry_v1(organization_id,entry_id)' end;
  execute format('create policy %I on public.%I for select to authenticated using (%s)',t||'_select',t,pred);
  execute format('create policy %I on public.%I for insert to authenticated with check(false)',t||'_deny_insert',t);
  execute format('create policy %I on public.%I for update to authenticated using(false) with check(false)',t||'_deny_update',t);
  execute format('create policy %I on public.%I for delete to authenticated using(false)',t||'_deny_delete',t);
  execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',t||'_updated',t);
  execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.capture_identity_audit_v1()',t||'_audit',t);
 end loop;
end $$;
alter table private.vault_source_dependencies enable row level security;
alter table private.vault_source_dependencies force row level security;
revoke all on private.vault_source_dependencies from public,anon,authenticated,service_role;
create policy vault_dependencies_select on private.vault_source_dependencies for select to authenticated using(false);
create policy vault_dependencies_insert on private.vault_source_dependencies for insert to authenticated with check(false);
create policy vault_dependencies_update on private.vault_source_dependencies for update to authenticated using(false) with check(false);
create policy vault_dependencies_delete on private.vault_source_dependencies for delete to authenticated using(false);
create trigger vault_dependencies_updated before update on private.vault_source_dependencies for each row execute function private.set_updated_at();
create trigger vault_dependencies_audit after insert or update or delete on private.vault_source_dependencies for each row execute function private.capture_identity_audit_v1();
create trigger vault_version_immutable before update or delete on public.vault_entry_versions for each row execute function private.guard_contribution_immutable_v1();
create trigger vault_request_immutable before update or delete on public.vault_publication_requests for each row execute function private.guard_contribution_immutable_v1();
create trigger vault_dependency_immutable before update or delete on private.vault_source_dependencies for each row execute function private.guard_contribution_immutable_v1();
create function private.guard_vault_identity_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'vault_history_immutable' using errcode='23514';end if;
 if tg_table_name='vault_entries' then
  if to_jsonb(new)-array['head_version_id','updated_at'] is distinct from to_jsonb(old)-array['head_version_id','updated_at'] then raise exception 'vault_identity_immutable' using errcode='23514';end if;
 elsif tg_table_name='vault_publications' then
  if old.withdrawn_at is not null or new.withdrawn_at is null or to_jsonb(new)-array['withdrawn_at','withdrawn_by','withdrawal_reason','updated_at'] is distinct from to_jsonb(old)-array['withdrawn_at','withdrawn_by','withdrawal_reason','updated_at'] then raise exception 'vault_publication_immutable' using errcode='23514';end if;
 else raise exception 'vault_scope_immutable' using errcode='23514';end if;
 return new;
end $$;
revoke all on function private.guard_vault_identity_v1() from public,anon,authenticated,service_role;
create trigger vault_scope_immutable before update or delete on public.vault_scopes for each row execute function private.guard_vault_identity_v1();
create trigger vault_entry_identity before update or delete on public.vault_entries for each row execute function private.guard_vault_identity_v1();
create trigger vault_publication_history before update or delete on public.vault_publications for each row execute function private.guard_vault_identity_v1();
create function private.require_vault_actor_v1() returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid;begin
 select organization_id into org from private.workspace_membership_v1();
 if org is null or not exists(select 1 from private.principals p join auth.users u on u.id=p.user_id
 where p.organization_id=org and p.user_id=auth.uid() and p.kind='human' and p.revoked_at is null and u.deleted_at is null
 and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=clock_timestamp())) then raise exception 'vault_access_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||org::text,0));
 if not exists(select 1 from public.organization_memberships m join private.principals p on p.organization_id=m.organization_id and p.user_id=m.user_id
 where m.organization_id=org and m.user_id=auth.uid() and m.status='active' and p.revoked_at is null) then raise exception 'vault_access_denied' using errcode='42501';end if;
 return org;
end $$;
create function private.collect_vault_dependencies_v1(p_org uuid,p_previous uuid,p_source uuid,p_assumption uuid,p_sources uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 with refs as (
  select d.source_version_id source,d.rights_version_id rights from private.vault_source_dependencies d where d.organization_id=p_org and d.version_id=p_previous
  union
  select x,(select id from private.source_rights_versions where organization_id=p_org and source_version_id=x order by revision desc limit 1)
  from unnest(coalesce(p_sources,'{}'::uuid[])||case when p_source is null then '{}'::uuid[] else array[p_source] end) x
  union
  select ref.source,ref.rights from private.assumption_version_items i join public.adoption_decisions a on a.organization_id=i.organization_id and a.id=i.decision_id
  join public.definition_versions d on d.organization_id=a.organization_id and d.id=a.definition_version_id
  left join public.observations o on o.organization_id=a.organization_id and o.id=a.reference_observation_id
  cross join lateral(values(o.source_version_id,o.source_rights_version_id),(d.contract_source_version_id,d.contract_rights_version_id)) ref(source,rights)
  where i.organization_id=p_org and i.version_id=p_assumption and ref.source is not null
 ) select coalesce(jsonb_agg(jsonb_build_object('source',source,'rights',rights) order by source,rights),'[]'::jsonb) into result from refs;
 if jsonb_array_length(result)>1000 then raise exception 'vault_lineage_limit' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(result) d where d->>'source' is null or d->>'rights' is null) then raise exception 'vault_source_rights_unknown' using errcode='42501';end if;
 return result;
end $$;
create function private.pin_vault_dependencies_v1(p_org uuid,p_version uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into private.vault_source_dependencies(organization_id,version_id,source_version_id,rights_version_id)
 select p_org,p_version,(d->>'source')::uuid,(d->>'rights')::uuid from public.vault_entry_versions v cross join lateral jsonb_array_elements(v.dependency_manifest) d
 where v.organization_id=p_org and v.id=p_version;
 if not private.vault_reference_allowed_v1(p_org,p_version,'analysis') then raise exception 'vault_source_use_denied' using errcode='42501';end if;
end $$;
create function private.submit_vault_entry_version_v1(p_entry_id uuid,p_version_id uuid,p_expected_version_id uuid,p_kind text,p_title text,p_directive_text text default null,p_reference_id uuid default null,p_source_version_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();e public.vault_entries;v public.vault_entry_versions;scope uuid;rf text;fp text;source uuid;assumption uuid;template uuid;rev integer;provenance jsonb;dependencies jsonb;begin
 if p_entry_id is null or p_version_id is null or p_kind is null or p_kind not in ('source','adoption','directive','template') or p_title is null or length(btrim(p_title)) not between 1 and 180
 or cardinality(coalesce(p_source_version_ids,'{}'::uuid[]))>100 or (p_kind='directive' and (p_reference_id is not null or p_directive_text is null or length(btrim(p_directive_text)) not between 1 and 32000))
 or (p_kind<>'directive' and (p_reference_id is null or p_directive_text is not null)) then raise exception 'vault_version_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(jsonb_build_object('entry',p_entry_id,'previous',p_expected_version_id,'kind',p_kind,'title',btrim(p_title),'text',p_directive_text,'reference',p_reference_id,'sources',coalesce(p_source_version_ids,'{}'::uuid[]))::text,'sha256'),'hex');
 select * into e from public.vault_entries where id=p_entry_id for update;
 if found then
  if e.organization_id<>org or e.kind<>p_kind or not private.can_access_resource_v1(org,e.id,'work') then raise exception 'vault_access_denied' using errcode='42501';end if;
 else
  if p_expected_version_id is not null then raise exception 'vault_version_conflict' using errcode='40001';end if;
  select id into strict scope from public.vault_scopes where organization_id=org;
  insert into public.vault_entries(id,organization_id,scope_id,kind,created_by) values(p_entry_id,org,scope,p_kind,auth.uid()) returning * into e;
  insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,grant_basis,granted_by)
  values(org,e.id,auth.uid(),'work','creator_bootstrap',auth.uid());
 end if;
 select * into v from public.vault_entry_versions where id=p_version_id;
 if found then
  if v.organization_id<>org or v.entry_id<>e.id or v.request_fingerprint<>fp then raise exception 'vault_request_reused' using errcode='22023';end if;
  if not private.can_read_vault_version_v1(org,v.id) then raise exception 'vault_access_denied' using errcode='42501';end if;return v.id;
 end if;
 if e.head_version_id is distinct from p_expected_version_id then raise exception 'vault_version_conflict' using errcode='40001';end if;
 if p_kind='source' then
  select id,encode(extensions.digest(jsonb_build_object('sourceVersion',id,'source',source_id,'version',version_no,'declaredHash',declared_sha256)::text,'sha256'),'hex') into source,rf from public.source_versions where organization_id=org and id=p_reference_id;
  if source is null or not private.source_use_allowed_v1(org,source,auth.uid(),'read','analysis') then raise exception 'vault_reference_denied' using errcode='42501';end if;
 elsif p_kind='adoption' then
  select id,content_fingerprint into assumption,rf from public.assumption_versions where organization_id=org and id=p_reference_id;
  if assumption is null or not private.can_read_assumption_version_v1(org,assumption) then raise exception 'vault_reference_denied' using errcode='42501';end if;
 elsif p_kind='template' then
  select id,fingerprint into template,rf from public.presentation_templates where organization_id=org and id=p_reference_id
  and (capital_project_id is null or private.can_access_resource_v1(org,capital_project_id,'read'));
  if template is null then raise exception 'vault_reference_denied' using errcode='42501';end if;
 end if;
 select coalesce(max(revision),0)+1 into rev from public.vault_entry_versions where organization_id=org and entry_id=e.id;
 -- A source reference is not a derived copy; a newly reviewed reference pins the current license.
 -- Derived directives/adoptions preserve prior dependencies and cannot launder restrictions.
 dependencies:=private.collect_vault_dependencies_v1(org,case when p_kind='source' then null else e.head_version_id end,source,assumption,p_source_version_ids);
 provenance:=jsonb_build_object('kind','human_candidate','author',auth.uid(),'referenceId',p_reference_id,'referenceFingerprint',rf);
 insert into public.vault_entry_versions(id,organization_id,entry_id,revision,previous_version_id,title,directive_text,source_version_id,assumption_version_id,presentation_template_id,reference_fingerprint,dependency_manifest,provenance,content_fingerprint,request_fingerprint,created_by)
 values(p_version_id,org,e.id,rev,e.head_version_id,btrim(p_title),p_directive_text,source,assumption,template,rf,dependencies,provenance,
 encode(extensions.digest(jsonb_build_object('kind',p_kind,'title',btrim(p_title),'text',p_directive_text,'referenceId',p_reference_id,'referenceFingerprint',rf,'previous',e.head_version_id,'sources',coalesce(p_source_version_ids,'{}'::uuid[]),'author',auth.uid(),'dependencies',dependencies)::text,'sha256'),'hex'),fp,auth.uid());
 perform private.pin_vault_dependencies_v1(org,p_version_id);
 update public.vault_entries set head_version_id=p_version_id where organization_id=org and id=e.id;
 return p_version_id;
end $$;
revoke all on function private.require_vault_actor_v1(),private.pin_vault_dependencies_v1(uuid,uuid),private.collect_vault_dependencies_v1(uuid,uuid,uuid,uuid,uuid[]),private.submit_vault_entry_version_v1(uuid,uuid,uuid,text,text,text,uuid,uuid[]) from public,anon,authenticated,service_role;
create function public.submit_vault_entry_version_v1(p_entry_id uuid,p_version_id uuid,p_expected_version_id uuid,p_kind text,p_title text,p_directive_text text default null,p_reference_id uuid default null,p_source_version_ids uuid[] default '{}')
returns uuid language sql security invoker set search_path='' as $$select private.submit_vault_entry_version_v1(p_entry_id,p_version_id,p_expected_version_id,p_kind,p_title,p_directive_text,p_reference_id,p_source_version_ids);$$;
revoke all on function public.submit_vault_entry_version_v1(uuid,uuid,uuid,text,text,text,uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.submit_vault_entry_version_v1(uuid,uuid,uuid,text,text,text,uuid,uuid[]),private.submit_vault_entry_version_v1(uuid,uuid,uuid,text,text,text,uuid,uuid[]) to authenticated;
create function private.propose_vault_publication_v1(p_request_id uuid,p_version_id uuid,p_version_fingerprint text,p_expected_publication_id uuid,p_work_scope_id uuid,p_purpose text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();v public.vault_entry_versions;e public.vault_entries;r public.vault_publication_requests;active uuid;begin
 if p_request_id is null or p_purpose is null or p_purpose not in ('analysis','retrieval','export') or p_reason is null or length(btrim(p_reason)) not between 5 and 2000 then raise exception 'vault_request_invalid' using errcode='22023';end if;
 select * into v from public.vault_entry_versions where organization_id=org and id=p_version_id;
 if v.id is null or not private.can_read_vault_version_v1(org,v.id) or not(private.can_access_resource_v1(org,v.entry_id,'work') or private.evaluate_resource_policy_v1(org,v.entry_id,auth.uid(),'publish','publication')) then raise exception 'vault_access_denied' using errcode='42501';end if;
 if p_work_scope_id is not null and not exists(select 1 from public.capital_projects where organization_id=org and id=p_work_scope_id and status<>'archived' and private.can_access_resource_v1(org,id,'work')) then raise exception 'vault_scope_denied' using errcode='42501';end if;
 select * into r from public.vault_publication_requests where id=p_request_id;
 if found then
  if r.organization_id<>org or r.version_id<>p_version_id or r.version_fingerprint is distinct from p_version_fingerprint or r.expected_publication_id is distinct from p_expected_publication_id or r.work_scope_id is distinct from p_work_scope_id or r.purpose<>p_purpose or r.reason<>btrim(p_reason) then raise exception 'vault_request_reused' using errcode='22023';end if;return r.id;
 end if;
 select * into e from public.vault_entries where organization_id=org and id=v.entry_id for update;
 select id into active from public.vault_publications where organization_id=org and entry_id=e.id and withdrawn_at is null;
 if e.head_version_id<>v.id or v.content_fingerprint is distinct from p_version_fingerprint or active is distinct from p_expected_publication_id then raise exception 'vault_review_stale' using errcode='40001';end if;
 insert into public.vault_publication_requests(id,organization_id,entry_id,version_id,version_fingerprint,review_fingerprint,work_scope_id,purpose,expected_publication_id,reason,created_by)
 values(p_request_id,org,e.id,v.id,v.content_fingerprint,encode(extensions.digest(jsonb_build_object('version',v.id,'fingerprint',v.content_fingerprint,'scope',p_work_scope_id,'purpose',p_purpose,'previousPublication',p_expected_publication_id,'reason',btrim(p_reason))::text,'sha256'),'hex'),p_work_scope_id,p_purpose,p_expected_publication_id,btrim(p_reason),auth.uid());return p_request_id;
end $$;
create function private.publish_vault_entry_v1(p_request_id uuid,p_publication_id uuid,p_reviewed_fingerprint text)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();r public.vault_publication_requests;v public.vault_entry_versions;e public.vault_entries;prior public.vault_publications;active uuid;reader record;d record;purpose text;op text;begin
 if p_publication_id is null then raise exception 'vault_publication_invalid' using errcode='22023';end if;
 select * into r from public.vault_publication_requests where organization_id=org and id=p_request_id;
 if r.id is null or not private.can_access_resource_v1(org,r.entry_id,'read') or not private.evaluate_resource_policy_v1(org,r.entry_id,auth.uid(),'publish','publication') then raise exception 'vault_publication_denied' using errcode='42501';end if;
 select * into v from public.vault_entry_versions where organization_id=org and id=r.version_id;
 if p_reviewed_fingerprint is null or p_reviewed_fingerprint<>r.review_fingerprint or v.content_fingerprint<>r.version_fingerprint then raise exception 'vault_review_stale' using errcode='40001';end if;
 select * into prior from public.vault_publications where id=p_publication_id or (organization_id=org and request_id=r.id) order by id=p_publication_id desc limit 1;
 if found then
  if prior.organization_id<>org or prior.request_id<>r.id then raise exception 'vault_request_reused' using errcode='22023';end if;
  -- An active retry is idempotent; a withdrawn act requires a new human review.
  if prior.withdrawn_at is not null then raise exception 'vault_publication_withdrawn' using errcode='40001';end if;
  return prior.id;
 end if;
 select * into e from public.vault_entries where organization_id=org and id=r.entry_id for update;
 select id into active from public.vault_publications where organization_id=org and entry_id=e.id and withdrawn_at is null;
 if e.head_version_id<>v.id or active is distinct from r.expected_publication_id then raise exception 'vault_review_stale' using errcode='40001';end if;
 if r.work_scope_id is not null and not exists(select 1 from public.capital_projects where organization_id=org and id=r.work_scope_id and status<>'archived' and private.can_access_resource_v1(org,id,'work')) then raise exception 'vault_scope_denied' using errcode='42501';end if;
 if not private.vault_reference_allowed_v1(org,v.id,'publication') or not private.vault_reference_allowed_v1(org,v.id,r.purpose) then raise exception 'vault_publication_rights_denied' using errcode='42501';end if;
 -- Current audience is checked before disclosure. Later grants never confer source rights.
 for reader in select p.user_id from private.principals p where p.organization_id=org and p.kind='human' and p.revoked_at is null
 and private.evaluate_resource_policy_v1(org,e.id,p.user_id,'read','retrieval')
 and (r.work_scope_id is null or private.evaluate_resource_policy_v1(org,r.work_scope_id,p.user_id,'read','retrieval')) loop
  for d in select * from private.vault_source_dependencies where organization_id=org and version_id=v.id loop
   foreach purpose in array array['publication',r.purpose] loop
    foreach op in array case when e.kind='source' then array['read','store'] else array['read','store','derive'] end loop
     if not private.source_use_allowed_v1(org,d.source_version_id,reader.user_id,op,purpose) then raise exception 'vault_audience_rights_denied' using errcode='42501';end if;
    end loop;
   end loop;
  end loop;
 end loop;
 if active is not null then update public.vault_publications set withdrawn_by=auth.uid(),withdrawn_at=clock_timestamp(),withdrawal_reason='Superseded by explicitly reviewed publication '||p_publication_id::text where organization_id=org and id=active;end if;
 insert into public.vault_publications(id,organization_id,entry_id,request_id,published_by) values(p_publication_id,org,e.id,r.id,auth.uid());
 return p_publication_id;
end $$;
create function private.withdraw_vault_publication_v1(p_publication_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();p public.vault_publications;begin
 if p_reason is null or length(btrim(p_reason)) not between 5 and 2000 then raise exception 'vault_withdrawal_invalid' using errcode='22023';end if;
 select * into p from public.vault_publications where organization_id=org and id=p_publication_id for update;
 if p.id is null or not private.can_access_resource_v1(org,p.entry_id,'read') or not private.evaluate_resource_policy_v1(org,p.entry_id,auth.uid(),'publish','publication') then raise exception 'vault_publication_denied' using errcode='42501';end if;
 if p.withdrawn_at is null then update public.vault_publications set withdrawn_at=clock_timestamp(),withdrawn_by=auth.uid(),withdrawal_reason=btrim(p_reason) where organization_id=org and id=p.id;end if;return p.id;
end $$;
create function public.propose_vault_publication_v1(p_request_id uuid,p_version_id uuid,p_version_fingerprint text,p_expected_publication_id uuid,p_work_scope_id uuid,p_purpose text,p_reason text) returns uuid
language sql security invoker set search_path='' as $$select private.propose_vault_publication_v1(p_request_id,p_version_id,p_version_fingerprint,p_expected_publication_id,p_work_scope_id,p_purpose,p_reason);$$;
create function public.publish_vault_entry_v1(p_request_id uuid,p_publication_id uuid,p_reviewed_fingerprint text) returns uuid
language sql security invoker set search_path='' as $$select private.publish_vault_entry_v1(p_request_id,p_publication_id,p_reviewed_fingerprint);$$;
create function public.withdraw_vault_publication_v1(p_publication_id uuid,p_reason text) returns uuid
language sql security invoker set search_path='' as $$select private.withdraw_vault_publication_v1(p_publication_id,p_reason);$$;
revoke all on function private.propose_vault_publication_v1(uuid,uuid,text,uuid,uuid,text,text),public.propose_vault_publication_v1(uuid,uuid,text,uuid,uuid,text,text),private.publish_vault_entry_v1(uuid,uuid,text),public.publish_vault_entry_v1(uuid,uuid,text),private.withdraw_vault_publication_v1(uuid,text),public.withdraw_vault_publication_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.propose_vault_publication_v1(uuid,uuid,text,uuid,uuid,text,text),public.propose_vault_publication_v1(uuid,uuid,text,uuid,uuid,text,text),private.publish_vault_entry_v1(uuid,uuid,text),public.publish_vault_entry_v1(uuid,uuid,text),private.withdraw_vault_publication_v1(uuid,text),public.withdraw_vault_publication_v1(uuid,text) to authenticated;
-- Reads use current identity without taking the publication mutation lock.
create function private.vault_reader_org_v1() returns uuid language plpgsql stable security definer set search_path='' as $$
declare org uuid;begin
 select organization_id into org from private.workspace_membership_v1();
 if org is null or not exists(select 1 from private.principals p join auth.users u on u.id=p.user_id where p.organization_id=org and p.user_id=auth.uid() and p.kind='human' and p.revoked_at is null and u.deleted_at is null and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now())) then raise exception 'vault_access_denied' using errcode='42501';end if;return org;
end $$;
revoke all on function private.vault_reader_org_v1() from public,anon,authenticated,service_role;
create index vault_versions_search_idx on public.vault_entry_versions using gin(to_tsvector('simple',title));
create function private.search_vault_v1(p_work_id uuid,p_search text,p_offset integer,p_mode text,p_purpose text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare org uuid:=private.vault_reader_org_v1();scope uuid;rows jsonb;begin
 if p_search is null or length(p_search)>160 or p_offset is null or p_offset<0 or p_offset>100000 or p_mode is null or p_mode not in ('published','candidates') or p_purpose is null or p_purpose not in ('analysis','retrieval','export') then raise exception 'vault_search_invalid' using errcode='22023';end if;
 if p_work_id is not null and not exists(select 1 from public.capital_projects where organization_id=org and id=p_work_id and status<>'archived' and private.can_access_resource_v1(org,id,case when p_mode='candidates' then 'work' else 'read' end)) then raise exception 'vault_work_denied' using errcode='42501';end if;
 select id into strict scope from public.vault_scopes where organization_id=org;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (
  select e.id entry_id,e.kind,v.id version_id,v.revision,v.title,v.directive_text,v.source_version_id,v.assumption_version_id,v.presentation_template_id,
  v.reference_fingerprint,v.content_fingerprint,v.dependency_manifest,v.provenance,v.created_by,v.created_at,
  p.id publication_id,p.published_at,p.published_by,
  (p.id is not null and exists(select 1 from public.vault_publication_requests official where official.organization_id=org and official.id=p.request_id and official.version_id=v.id)) is_official,
  coalesce(nullif(btrim(author.full_name),''),left(v.created_by::text,8)) author_name,
  coalesce(nullif(btrim(publisher.full_name),''),left(p.published_by::text,8)) publisher_name,
  r.id request_id,r.review_fingerprint,r.work_scope_id,r.purpose,r.reason,
  private.can_access_resource_v1(org,e.id,'work') can_edit,
  private.evaluate_resource_policy_v1(org,e.id,auth.uid(),'publish','publication') can_publish
  from public.vault_entries e
  join public.vault_entry_versions v on v.organization_id=e.organization_id and v.entry_id=e.id
  left join public.vault_publications p on p.organization_id=e.organization_id and p.entry_id=e.id and p.withdrawn_at is null
  left join lateral(select x.* from public.vault_publication_requests x where x.organization_id=e.organization_id and x.version_id=v.id
   and (case when p_mode='published' then x.id=p.request_id else true end) order by x.created_at desc,x.id desc limit 1) r on true
  left join public.profiles author on author.id=v.created_by left join public.profiles publisher on publisher.id=p.published_by
  where e.organization_id=org and private.can_access_resource_v1(org,e.id,'read')
  and (p_search='' or to_tsvector('simple',v.title) @@ plainto_tsquery('simple',p_search))
  and ((p_mode='published' and p.id is not null and r.id=p.request_id and r.version_id=v.id and r.purpose=p_purpose
   and (r.work_scope_id is null or ((p_work_id is null or r.work_scope_id=p_work_id) and private.can_access_resource_v1(org,r.work_scope_id,'read')))
   and private.vault_reference_allowed_v1(org,v.id,'publication') and private.vault_reference_allowed_v1(org,v.id,p_purpose))
   or (p_mode='candidates' and v.id=e.head_version_id and (private.can_access_resource_v1(org,e.id,'work') or private.evaluate_resource_policy_v1(org,e.id,auth.uid(),'publish','publication'))
    and private.vault_reference_allowed_v1(org,v.id,'analysis')))
  order by v.created_at desc,v.id limit 26 offset p_offset
 ) q;
 return jsonb_build_object('scopeId',scope,'viewerId',auth.uid(),'canAdminister',private.can_admin_resource_policy_v1(org,scope),'rows',rows,'offset',p_offset);
end $$;
create function public.search_vault_for_work_v1(p_work_id uuid,p_search text default '',p_offset integer default 0,p_include_candidates boolean default false,p_purpose text default 'analysis') returns jsonb
language sql security invoker set search_path='' as $$select private.search_vault_v1(p_work_id,p_search,p_offset,case when p_include_candidates then 'candidates' else 'published' end,p_purpose) where p_work_id is not null;$$;
create function public.list_vault_entries_v1(p_search text default '',p_offset integer default 0,p_mode text default 'published',p_purpose text default 'analysis') returns jsonb
language sql security invoker set search_path='' as $$select private.search_vault_v1(null,p_search,p_offset,p_mode,p_purpose);$$;
revoke all on function private.search_vault_v1(uuid,text,integer,text,text),public.search_vault_for_work_v1(uuid,text,integer,boolean,text),public.list_vault_entries_v1(text,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function private.search_vault_v1(uuid,text,integer,text,text),public.search_vault_for_work_v1(uuid,text,integer,boolean,text),public.list_vault_entries_v1(text,integer,text,text) to authenticated;

create function private.list_vault_people_v1(p_resource_id uuid,p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid:=private.vault_reader_org_v1();rows jsonb;begin
 if not private.can_admin_resource_policy_v1(org,p_resource_id) or not exists(select 1 from private.access_resources where organization_id=org and id=p_resource_id and resource_kind in ('vault_scope','vault_entry')) then raise exception 'vault_administration_denied' using errcode='42501';end if;
 if p_search is null or length(p_search)>160 or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'vault_people_invalid' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (
 select m.user_id,coalesce(nullif(btrim(p.full_name),''),left(m.user_id::text,8)) name,
 private.evaluate_resource_policy_v1(org,p_resource_id,m.user_id,'read','retrieval') can_read,
 private.evaluate_resource_policy_v1(org,p_resource_id,m.user_id,'publish','publication') can_publish
 from public.organization_memberships m join private.principals principal on principal.organization_id=m.organization_id and principal.user_id=m.user_id and principal.revoked_at is null
 left join public.profiles p on p.id=m.user_id where m.organization_id=org and m.status='active'
 and (p_search='' or position(lower(p_search) in lower(coalesce(p.full_name,'')))>0)
 order by m.user_id limit 26 offset p_offset
 ) q;return jsonb_build_object('rows',rows,'offset',p_offset);
end $$;
create function public.list_vault_people_v1(p_resource_id uuid,p_search text default '',p_offset integer default 0) returns jsonb
language sql security invoker set search_path='' as $$select private.list_vault_people_v1(p_resource_id,p_search,p_offset);$$;
revoke all on function private.list_vault_people_v1(uuid,text,integer),public.list_vault_people_v1(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function private.list_vault_people_v1(uuid,text,integer),public.list_vault_people_v1(uuid,text,integer) to authenticated;
-- Inventory historical source versions as candidates, never as human-authored or published acts.
-- Exact references only: no byte copying, no fabricated validation/hash receipt, no role-based read.
do $$ declare s record;v record;e uuid;previous uuid;version uuid;scope uuid;rights uuid;deps jsonb;ref text;n integer;begin
 for s in select * from public.sources order by organization_id,id loop
  select id into strict scope from public.vault_scopes where organization_id=s.organization_id;
  e:=gen_random_uuid();previous:=null;n:=0;
  insert into public.vault_entries(id,organization_id,scope_id,kind,legacy_source_id) values(e,s.organization_id,scope,'source',s.id);
  insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,grant_basis)
  values(s.organization_id,e,s.created_by,'work','historical_assignment');
  for v in select * from public.source_versions where organization_id=s.organization_id and source_id=s.id order by version_no loop
   version:=gen_random_uuid();n:=n+1;
   select id into rights from private.source_rights_versions where organization_id=s.organization_id and source_version_id=v.id order by revision desc limit 1;
   deps:=case when rights is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('source',v.id,'rights',rights)) end;
   ref:=encode(extensions.digest(jsonb_build_object('sourceVersion',v.id,'source',s.id,'version',v.version_no,'declaredHash',v.declared_sha256)::text,'sha256'),'hex');
   insert into public.vault_entry_versions(id,organization_id,entry_id,revision,previous_version_id,title,source_version_id,reference_fingerprint,dependency_manifest,provenance,content_fingerprint,request_fingerprint)
   values(version,s.organization_id,e,n,previous,left(v.original_name,180),v.id,ref,deps,
    jsonb_build_object('kind','legacy_source','sourceVersion',v.id,'originCreatedBy',v.created_by,'sourceCreatedAt',v.created_at,'import','human_vault_publication','publicationEvidence',null),
    encode(extensions.digest(jsonb_build_object('reference',ref,'dependencies',deps,'previous',previous,'title',left(v.original_name,180))::text,'sha256'),'hex'),
    encode(extensions.digest('legacy-source:'||v.id::text,'sha256'),'hex'));
   if rights is not null then insert into private.vault_source_dependencies(organization_id,version_id,source_version_id,rights_version_id) values(s.organization_id,version,v.id,rights);end if;
   previous:=version;
  end loop;
  update public.vault_entries set head_version_id=previous where organization_id=s.organization_id and id=e;
 end loop;
end $$;
