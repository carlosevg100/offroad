-- Stage 3. PostgreSQL is the sole policy decision point. No new client table access.
set search_path = '';
create table private.organization_units (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null check(length(btrim(name)) between 1 and 120), enabled boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id)
);
create table private.principals (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 kind text not null check(kind in ('human','worker')), user_id uuid references auth.users(id),
 human_principal_id uuid, processing_job_id uuid, resource_id uuid, worker_token_id uuid references private.worker_tokens(id),
 account_user_id uuid references auth.users(id), expires_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 unique(organization_id,user_id), unique(organization_id,processing_job_id),
 foreign key(organization_id,human_principal_id) references private.principals(organization_id,id),
 foreign key(organization_id,processing_job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,resource_id) references private.access_resources(organization_id,id),
 check((kind='human' and user_id is not null and num_nonnulls(human_principal_id,processing_job_id,resource_id,worker_token_id,account_user_id,expires_at)=0)
 or (kind='worker' and user_id is null and num_nonnulls(human_principal_id,processing_job_id,resource_id,worker_token_id,account_user_id,expires_at)=6))
);
create table private.access_groups (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), organization_unit_id uuid,
 name text not null check(length(btrim(name)) between 1 and 120), enabled boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,organization_unit_id) references private.organization_units(organization_id,id)
);
create table private.access_group_memberships (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), group_id uuid not null, principal_id uuid not null,
 valid_from timestamptz not null default now(), expires_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,group_id,principal_id),
 foreign key(organization_id,group_id) references private.access_groups(organization_id,id), foreign key(organization_id,principal_id) references private.principals(organization_id,id),
 check(expires_at is null or expires_at>valid_from)
);
create table private.information_barriers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), resource_id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 120), enabled boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,resource_id) references private.access_resources(organization_id,id)
);
create table private.barrier_memberships (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), barrier_id uuid not null,
 principal_id uuid, group_id uuid, effect text not null check(effect in ('allow','deny')),
 valid_from timestamptz not null default now(), expires_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,id),
 unique nulls not distinct(organization_id,barrier_id,principal_id,group_id,effect),
 foreign key(organization_id,barrier_id) references private.information_barriers(organization_id,id),
 foreign key(organization_id,principal_id) references private.principals(organization_id,id), foreign key(organization_id,group_id) references private.access_groups(organization_id,id),
 check(num_nonnulls(principal_id,group_id)=1), check(expires_at is null or expires_at>valid_from)
);
alter table private.resource_access_grants add column subject_group_id uuid;
alter table private.resource_access_grants add column effect text not null default 'allow' check(effect in ('allow','deny'));
alter table private.resource_access_grants add constraint resource_grants_group_fk foreign key(organization_id,subject_group_id) references private.access_groups(organization_id,id);
-- Keep the legacy unique key for its existing ON CONFLICT callers. Group rows need their own key.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='private.resource_access_grants'::regclass and contype='c' and pg_get_constraintdef(oid) like '%num_nonnulls%' loop
  execute format('alter table private.resource_access_grants drop constraint %I',c.conname);
 end loop;
end $$;
alter table private.resource_access_grants add constraint resource_grants_one_subject check(num_nonnulls(subject_user_id,subject_role,subject_group_id)=1);
-- Old NULLS NOT DISTINCT key would permit only one group per action. Partial unique indexes preserve the legacy user/role key and distinguish group subjects.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='private.resource_access_grants'::regclass and contype='u' and pg_get_constraintdef(oid) like '%subject_user_id%' loop execute format('alter table private.resource_access_grants drop constraint %I',c.conname); end loop;
end $$;
create unique index resource_grants_user_role_key on private.resource_access_grants(organization_id,resource_id,subject_user_id,subject_role,action) nulls not distinct where subject_group_id is null;
create unique index resource_grants_group_key on private.resource_access_grants(organization_id,resource_id,subject_group_id,action) where subject_group_id is not null;
alter table private.access_resources add column allowed_purposes text[] not null default array['analysis','retrieval','publication','export'];
alter table private.access_resources add constraint resource_purposes_valid check(cardinality(allowed_purposes)>0 and allowed_purposes <@ array['analysis','retrieval','publication','export']::text[]);
insert into private.principals(organization_id,kind,user_id) select organization_id,'human',user_id from public.organization_memberships on conflict do nothing;
create index policy_principals_human_idx on private.principals(organization_id,human_principal_id);
create index policy_principals_resource_idx on private.principals(organization_id,resource_id);
create index policy_principals_worker_idx on private.principals(worker_token_id);
create index policy_principals_account_idx on private.principals(account_user_id);
create index policy_principals_user_idx on private.principals(user_id);
create index policy_access_groups_unit_idx on private.access_groups(organization_id,organization_unit_id);
create index policy_access_group_memberships_principal_idx on private.access_group_memberships(organization_id,principal_id,group_id);
create index policy_information_barriers_resource_idx on private.information_barriers(organization_id,resource_id);
create index policy_barrier_memberships_principal_idx on private.barrier_memberships(organization_id,principal_id);
create index policy_barrier_memberships_group_idx on private.barrier_memberships(organization_id,group_id);
create index policy_resource_access_grants_group_idx on private.resource_access_grants(organization_id,subject_group_id,resource_id);

alter table private.domain_events drop constraint domain_events_aggregate_kind_check;
alter table private.domain_events add constraint domain_events_aggregate_kind_check check(aggregate_kind in ('membership','resource_grant','workspace_capability','commercial_account_link','access_policy'));
create function private.capture_policy_domain_event_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb; a jsonb; r jsonb; correlation uuid;
begin
 if tg_op<>'INSERT' then b:=to_jsonb(old)-array['name','created_at','updated_at']; end if;
 if tg_op<>'DELETE' then a:=to_jsonb(new)-array['name','created_at','updated_at']; end if;
 if a is not distinct from b then return coalesce(new,old); end if;
 r:=coalesce(a,b); correlation:=nullif(current_setting('offroad.domain_event_correlation',true),'')::uuid;
 if correlation is null then correlation:=gen_random_uuid(); perform set_config('offroad.domain_event_correlation',correlation::text,true); end if;
 perform private.append_domain_event_v1(gen_random_uuid(),(r->>'organization_id')::uuid,'access_policy',(r->>'id')::uuid,
 case tg_op when 'INSERT' then 'created' when 'DELETE' then 'removed' else 'changed' end,
 jsonb_build_object('source',tg_table_name,'before',b,'after',a),null,null,correlation);
 return coalesce(new,old);
end $$;
create trigger access_resources_policy_events after update of allowed_purposes on private.access_resources for each row execute function private.capture_policy_domain_event_v1();
alter table private.organization_units enable row level security;
alter table private.organization_units force row level security;
revoke all on private.organization_units from public,anon,authenticated,service_role;
create policy organization_units_deny_select on private.organization_units for select to authenticated using(false);
create policy organization_units_deny_insert on private.organization_units for insert to authenticated with check(false);
create policy organization_units_deny_update on private.organization_units for update to authenticated using(false) with check(false);
create policy organization_units_deny_delete on private.organization_units for delete to authenticated using(false);
create trigger organization_units_updated before update on private.organization_units for each row execute function private.set_updated_at();
create trigger organization_units_policy_event after insert or update or delete on private.organization_units for each row execute function private.capture_policy_domain_event_v1();
alter table private.principals enable row level security;
alter table private.principals force row level security;
revoke all on private.principals from public,anon,authenticated,service_role;
create policy principals_deny_select on private.principals for select to authenticated using(false);
create policy principals_deny_insert on private.principals for insert to authenticated with check(false);
create policy principals_deny_update on private.principals for update to authenticated using(false) with check(false);
create policy principals_deny_delete on private.principals for delete to authenticated using(false);
create trigger principals_updated before update on private.principals for each row execute function private.set_updated_at();
create trigger principals_policy_event after insert or update or delete on private.principals for each row execute function private.capture_policy_domain_event_v1();
alter table private.access_groups enable row level security;
alter table private.access_groups force row level security;
revoke all on private.access_groups from public,anon,authenticated,service_role;
create policy access_groups_deny_select on private.access_groups for select to authenticated using(false);
create policy access_groups_deny_insert on private.access_groups for insert to authenticated with check(false);
create policy access_groups_deny_update on private.access_groups for update to authenticated using(false) with check(false);
create policy access_groups_deny_delete on private.access_groups for delete to authenticated using(false);
create trigger access_groups_updated before update on private.access_groups for each row execute function private.set_updated_at();
create trigger access_groups_policy_event after insert or update or delete on private.access_groups for each row execute function private.capture_policy_domain_event_v1();
alter table private.access_group_memberships enable row level security;
alter table private.access_group_memberships force row level security;
revoke all on private.access_group_memberships from public,anon,authenticated,service_role;
create policy access_group_memberships_deny_select on private.access_group_memberships for select to authenticated using(false);
create policy access_group_memberships_deny_insert on private.access_group_memberships for insert to authenticated with check(false);
create policy access_group_memberships_deny_update on private.access_group_memberships for update to authenticated using(false) with check(false);
create policy access_group_memberships_deny_delete on private.access_group_memberships for delete to authenticated using(false);
create trigger access_group_memberships_updated before update on private.access_group_memberships for each row execute function private.set_updated_at();
create trigger access_group_memberships_policy_event after insert or update or delete on private.access_group_memberships for each row execute function private.capture_policy_domain_event_v1();
alter table private.information_barriers enable row level security;
alter table private.information_barriers force row level security;
revoke all on private.information_barriers from public,anon,authenticated,service_role;
create policy information_barriers_deny_select on private.information_barriers for select to authenticated using(false);
create policy information_barriers_deny_insert on private.information_barriers for insert to authenticated with check(false);
create policy information_barriers_deny_update on private.information_barriers for update to authenticated using(false) with check(false);
create policy information_barriers_deny_delete on private.information_barriers for delete to authenticated using(false);
create trigger information_barriers_updated before update on private.information_barriers for each row execute function private.set_updated_at();
create trigger information_barriers_policy_event after insert or update or delete on private.information_barriers for each row execute function private.capture_policy_domain_event_v1();
alter table private.barrier_memberships enable row level security;
alter table private.barrier_memberships force row level security;
revoke all on private.barrier_memberships from public,anon,authenticated,service_role;
create policy barrier_memberships_deny_select on private.barrier_memberships for select to authenticated using(false);
create policy barrier_memberships_deny_insert on private.barrier_memberships for insert to authenticated with check(false);
create policy barrier_memberships_deny_update on private.barrier_memberships for update to authenticated using(false) with check(false);
create policy barrier_memberships_deny_delete on private.barrier_memberships for delete to authenticated using(false);
create trigger barrier_memberships_updated before update on private.barrier_memberships for each row execute function private.set_updated_at();
create trigger barrier_memberships_policy_event after insert or update or delete on private.barrier_memberships for each row execute function private.capture_policy_domain_event_v1();

create trigger resource_policy_event after update of allowed_purposes on private.access_resources for each row execute function private.capture_policy_domain_event_v1();
-- Add the new grant fields to the existing protected snapshot allowlist.
do $$ declare body text; begin
 select pg_get_functiondef('private.capture_authority_domain_event_v1()'::regprocedure) into body;
 if position($needle$'subject_role','action'$needle$ in body)=0 then raise exception 'grant_event_contract_changed'; end if;
 body:=replace(body,$needle$'subject_role','action'$needle$,$replacement$'subject_role','subject_group_id','effect','action'$replacement$); execute body;
end $$;
-- Amend all existing upsert targets; otherwise a historical RPC would stop working after the indexed subject extension.
do $$ declare f record; body text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.prokind='f' and p.prosrc ~ 'on conflict\s*\(organization_id,resource_id,subject_user_id,subject_role,action\)' loop
  body:=pg_get_functiondef(f.oid);
  body:=regexp_replace(body,'on conflict\s*\(organization_id,resource_id,subject_user_id,subject_role,action\)','on conflict(organization_id,resource_id,subject_user_id,subject_role,action) where subject_group_id is null','gi');execute body;
 end loop;
end $$;
create function private.ensure_membership_principal_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.principals(organization_id,kind,user_id) values(new.organization_id,'human',new.user_id) on conflict(organization_id,user_id) do nothing;
 return new;
end $$;
create trigger membership_policy_principal after insert on public.organization_memberships for each row execute function private.ensure_membership_principal_v1();

create function private.policy_group_ids_v1(p_org uuid,p_principal uuid)
returns setof uuid language sql stable security definer set search_path='' as $$
 select m.group_id from private.access_group_memberships m join private.access_groups g on g.organization_id=m.organization_id and g.id=m.group_id
 left join private.organization_units u on u.organization_id=g.organization_id and u.id=g.organization_unit_id
 join private.principals p on p.organization_id=m.organization_id and p.id=m.principal_id
 where m.organization_id=p_org and m.principal_id=p_principal and p.kind='human' and p.revoked_at is null
 and g.enabled and (g.organization_unit_id is null or u.enabled) and m.revoked_at is null and m.valid_from<=now() and (m.expires_at is null or m.expires_at>now());
$$;

create function private.evaluate_resource_policy_v1(p_org uuid,p_resource uuid,p_subject uuid,p_action text,p_purpose text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare root uuid; principal uuid; groups uuid[]; allowed boolean;
begin
 if p_subject is null or p_action is null or p_action not in ('read','work','manage') or p_purpose is null or p_purpose not in ('analysis','retrieval','publication','export') then return false; end if;
 select p.id into principal from private.principals p join auth.users u on u.id=p.user_id
 join public.organization_memberships m on m.organization_id=p.organization_id and m.user_id=p.user_id
 where p.organization_id=p_org and p.user_id=p_subject and p.kind='human' and p.revoked_at is null and m.status='active'
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now());
 if principal is null then return false; end if;
 root:=private.resource_root_v1(p_org,p_resource); if root is null then return false; end if;
 -- Both the child and root can narrow purposes. Missing resources never grant authority.
 if exists(select 1 from private.access_resources where organization_id=p_org and id in (root,p_resource) and not(p_purpose=any(allowed_purposes))) then return false; end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into groups from private.policy_group_ids_v1(p_org,principal) id;
 -- Role grants administer relationships through the separate administrative command only.
 -- They never satisfy content actions, including destructive legacy 'manage' paths.
 select coalesce(bool_or(g.effect='allow'),false) and not coalesce(bool_or(g.effect='deny'),false) into allowed
 from private.resource_access_grants g
 where g.organization_id=p_org and g.resource_id in (root,p_resource) and (g.subject_user_id=p_subject or g.subject_group_id=any(groups))
 and (g.action=p_action or g.action='manage' or (p_action='read' and g.action='work'))
 and g.revoked_at is null and g.valid_from<=now() and (g.expires_at is null or g.expires_at>now());
 if not allowed then return false; end if;
 -- All barriers must pass; an explicit deny dominates every allow and every group.
 if exists(
  select 1 from private.information_barriers b where b.organization_id=p_org and b.resource_id in(root,p_resource) and b.enabled and (
   not exists(select 1 from private.barrier_memberships m where m.organization_id=p_org and m.barrier_id=b.id and m.effect='allow'
    and (m.principal_id=principal or m.group_id=any(groups)) and m.revoked_at is null and m.valid_from<=now() and (m.expires_at is null or m.expires_at>now()))
   or exists(select 1 from private.barrier_memberships m where m.organization_id=p_org and m.barrier_id=b.id and m.effect='deny'
    and (m.principal_id=principal or m.group_id=any(groups)) and m.revoked_at is null and m.valid_from<=now() and (m.expires_at is null or m.expires_at>now()))
  )) then return false; end if;
 return true;
end $$;
create or replace function private.resource_access_as_subject_v1(p_organization_id uuid,p_resource_id uuid,p_subject_user_id uuid,p_action text)
returns boolean language sql stable security definer set search_path='' as $$
 select private.evaluate_resource_policy_v1(p_organization_id,p_resource_id,p_subject_user_id,p_action,case when p_action='read' then 'retrieval' else 'analysis' end);
$$;

create function private.policy_admin_context_v1() returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; role_name text;
begin
 select organization_id,role into org,role_name from private.workspace_membership_v1();
 if org is null or role_name not in ('owner','admin') or not exists(select 1 from private.principals p join auth.users u on u.id=p.user_id where p.organization_id=org and p.user_id=auth.uid() and p.revoked_at is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 -- Serialize policy commands with each other and with every job publication in this organization.
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||org::text,0));
 if not exists(select 1 from public.organization_memberships m join private.principals p on p.organization_id=m.organization_id and p.user_id=m.user_id where m.organization_id=org and m.user_id=auth.uid() and m.status='active' and m.role in('owner','admin') and p.revoked_at is null) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 return org;
end $$;
create function private.policy_invalidate_jobs_v1(p_org uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Preserve unaffected jobs; invalidated revisions never become valid after a later regrant.
 update private.authorization_revisions r set revision=r.revision+1,updated_at=now() where r.organization_id=p_org
 and (not private.resource_access_as_subject_v1(r.organization_id,r.resource_id,r.subject_user_id,'work') or exists(select 1 from public.processing_jobs j where j.organization_id=r.organization_id and j.authorization_resource_id=r.resource_id and j.authorization_subject_id=r.subject_user_id and j.status in ('queued','leased','awaiting_approval') and not private.job_authority_is_current_v1(j.id)));
end $$;
-- Lock policy before the existing per-subject revision lock, matching the mutation order.
do $$ declare body text; begin
 select pg_get_functiondef('private.lock_job_authority_v1(uuid)'::regprocedure) into body;
 if position('begin' in body)=0 then raise exception 'job_lock_contract_changed'; end if;
 body:=replace(body,'begin',E'begin\n perform pg_advisory_xact_lock_shared(hashtextextended(''resource-policy:''||organization_id::text,0)) from public.processing_jobs where id=p_job_id;');execute body;
end $$;

create function private.explain_my_access_v1(p_resource_id uuid,p_action text default 'read',p_purpose text default 'retrieval')
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid; allowed boolean; caps jsonb;
begin
 begin select organization_id into org from private.workspace_membership_v1(); exception when insufficient_privilege then return jsonb_build_object('allowed',false,'capabilities','[]'::jsonb); end;
 allowed:=private.evaluate_resource_policy_v1(org,p_resource_id,auth.uid(),p_action,p_purpose);
 if not allowed then return jsonb_build_object('allowed',false,'capabilities','[]'::jsonb); end if;
 select coalesce(jsonb_agg(a),'[]'::jsonb) into caps from unnest(array['read','work','manage']) a where private.evaluate_resource_policy_v1(org,p_resource_id,auth.uid(),a,p_purpose);
 return jsonb_build_object('allowed',true,'capabilities',caps,'policyVersion',1);
end $$;

create function private.set_access_group_v1(p_id uuid,p_name text,p_enabled boolean default true,p_unit_id uuid default null,p_parent_group_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1(); result uuid:=coalesce(p_id,gen_random_uuid());
begin
 if p_parent_group_id is not null then raise exception 'nested_groups_unsupported' using errcode='22023'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_enabled is null then raise exception 'policy_command_invalid' using errcode='22023'; end if;
 if p_unit_id is not null and not exists(select 1 from private.organization_units where organization_id=org and id=p_unit_id) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 if p_id is not null and not exists(select 1 from private.access_groups where organization_id=org and id=p_id) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 insert into private.access_groups(id,organization_id,name,enabled,organization_unit_id) values(result,org,btrim(p_name),p_enabled,p_unit_id)
 on conflict(id) do update set name=excluded.name,enabled=excluded.enabled,organization_unit_id=excluded.organization_unit_id;
 perform private.policy_invalidate_jobs_v1(org);return result;
end $$;
create function private.set_organization_unit_v1(p_id uuid,p_name text,p_enabled boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1(); result uuid:=coalesce(p_id,gen_random_uuid());
begin
 if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_enabled is null then raise exception 'policy_command_invalid' using errcode='22023'; end if;
 if p_id is not null and not exists(select 1 from private.organization_units where organization_id=org and id=p_id) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 insert into private.organization_units(id,organization_id,name,enabled) values(result,org,btrim(p_name),p_enabled) on conflict(id) do update set name=excluded.name,enabled=excluded.enabled;
 perform private.policy_invalidate_jobs_v1(org);return result;
end $$;
create function private.set_access_group_member_v1(p_group_id uuid,p_user_id uuid,p_enabled boolean default true,p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1(); principal uuid; result uuid;
begin
 if p_enabled is null or (p_expires_at is not null and p_expires_at<=now()) then raise exception 'policy_command_invalid' using errcode='22023'; end if;
 select p.id into principal from private.principals p join public.organization_memberships m on m.organization_id=p.organization_id and m.user_id=p.user_id where p.organization_id=org and p.user_id=p_user_id and p.revoked_at is null and p.kind='human' and m.status='active';
 if principal is null or not exists(select 1 from private.access_groups where organization_id=org and id=p_group_id) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 insert into private.access_group_memberships(organization_id,group_id,principal_id,expires_at,revoked_at) values(org,p_group_id,principal,p_expires_at,case when not p_enabled then now() end)
 on conflict(organization_id,group_id,principal_id) do update set valid_from=now(),expires_at=excluded.expires_at,revoked_at=excluded.revoked_at returning id into result;
 perform private.policy_invalidate_jobs_v1(org);return result;
end $$;
create function private.set_information_barrier_v1(p_id uuid,p_resource_id uuid,p_name text,p_members jsonb,p_enabled boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1(); result uuid:=coalesce(p_id,gen_random_uuid()); item jsonb; principal uuid; target_group uuid;
begin
 if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_enabled is null or jsonb_typeof(p_members) is distinct from 'array' or jsonb_array_length(p_members)>1000 then raise exception 'policy_command_invalid' using errcode='22023'; end if;
 if not exists(select 1 from private.access_resources where organization_id=org and id=p_resource_id) or (p_id is not null and not exists(select 1 from private.information_barriers where organization_id=org and id=p_id)) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 insert into private.information_barriers(id,organization_id,resource_id,name,enabled) values(result,org,p_resource_id,btrim(p_name),p_enabled)
 on conflict(id) do update set resource_id=excluded.resource_id,name=excluded.name,enabled=excluded.enabled;
 update private.barrier_memberships set revoked_at=now() where organization_id=org and barrier_id=result and revoked_at is null;
 for item in select value from jsonb_array_elements(p_members) loop
  if jsonb_typeof(item)<>'object' or (item-array['userId','groupId','effect','expiresAt'])<>'{}'::jsonb or item->>'effect' is null or item->>'effect' not in ('allow','deny') or num_nonnulls(item->>'userId',item->>'groupId')<>1 or ((item->>'expiresAt')::timestamptz<=now()) then raise exception 'policy_command_invalid' using errcode='22023'; end if;
  principal:=null;target_group:=(item->>'groupId')::uuid;
  if item->>'userId' is not null then
   select p.id into principal from private.principals p join public.organization_memberships m on m.organization_id=p.organization_id and m.user_id=p.user_id
   where p.organization_id=org and p.user_id=(item->>'userId')::uuid and p.kind='human' and p.revoked_at is null and m.status='active';
   if principal is null then raise exception 'resource_access_denied' using errcode='42501'; end if;
  elsif not exists(select 1 from private.access_groups where organization_id=org and id=target_group) then raise exception 'resource_access_denied' using errcode='42501'; end if;
  insert into private.barrier_memberships(organization_id,barrier_id,principal_id,group_id,effect,expires_at)
  values(org,result,principal,target_group,item->>'effect',(item->>'expiresAt')::timestamptz)
  on conflict(organization_id,barrier_id,principal_id,group_id,effect) do update set valid_from=now(),expires_at=excluded.expires_at,revoked_at=null;
 end loop;
 perform private.policy_invalidate_jobs_v1(org);return result;
end $$;
create function private.set_resource_policy_grant_v1(p_resource_id uuid,p_user_id uuid,p_group_id uuid,p_action text,p_effect text,p_enabled boolean default true,p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1(); root uuid; result uuid;
begin
 if num_nonnulls(p_user_id,p_group_id)<>1 or p_action is null or p_action not in ('read','work','manage') or p_effect is null or p_effect not in ('allow','deny') or p_enabled is null or (p_expires_at is not null and p_expires_at<=now()) then raise exception 'policy_command_invalid' using errcode='22023'; end if;
 root:=private.resource_root_v1(org,p_resource_id);
 if root is null or (p_group_id is not null and not exists(select 1 from private.access_groups where organization_id=org and id=p_group_id)) or (p_user_id is not null and not exists(select 1 from private.principals p join public.organization_memberships m on m.organization_id=p.organization_id and m.user_id=p.user_id where p.organization_id=org and p.user_id=p_user_id and p.revoked_at is null and m.status='active')) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 if p_user_id is not null then
  insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,effect,granted_by,grant_basis,expires_at,revoked_at)
  values(org,root,p_user_id,p_action,p_effect,auth.uid(),'explicit',p_expires_at,case when not p_enabled then now() end)
  on conflict(organization_id,resource_id,subject_user_id,subject_role,action) where subject_group_id is null do update set effect=excluded.effect,granted_by=excluded.granted_by,valid_from=now(),expires_at=excluded.expires_at,revoked_at=excluded.revoked_at,revoked_by=null returning id into result;
 else
  insert into private.resource_access_grants(organization_id,resource_id,subject_group_id,action,effect,granted_by,grant_basis,expires_at,revoked_at)
  values(org,root,p_group_id,p_action,p_effect,auth.uid(),'explicit',p_expires_at,case when not p_enabled then now() end)
  on conflict(organization_id,resource_id,subject_group_id,action) where subject_group_id is not null do update set effect=excluded.effect,granted_by=excluded.granted_by,valid_from=now(),expires_at=excluded.expires_at,revoked_at=excluded.revoked_at,revoked_by=null returning id into result;
 end if;
 perform private.policy_invalidate_jobs_v1(org);return result;
end $$;
create function private.set_resource_purposes_v1(p_resource_id uuid,p_purposes text[])
returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1();
begin
 if p_purposes is null or cardinality(p_purposes)=0 or array_position(p_purposes,null) is not null or not(p_purposes<@array['analysis','retrieval','publication','export']::text[]) then raise exception 'policy_command_invalid' using errcode='22023'; end if;
 update private.access_resources set allowed_purposes=p_purposes where organization_id=org and id=p_resource_id;
 if not found then raise exception 'resource_access_denied' using errcode='42501'; end if;
 perform private.policy_invalidate_jobs_v1(org);
end $$;
create function private.revoke_principal_access_v1(p_principal_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid:=private.policy_admin_context_v1();
begin
 update private.principals set revoked_at=coalesce(revoked_at,now()) where organization_id=org and (id=p_principal_id or human_principal_id=p_principal_id);
 if not found then raise exception 'resource_access_denied' using errcode='42501'; end if;
 update public.organization_memberships m set status='suspended' where m.organization_id=org and m.user_id=(select user_id from private.principals where organization_id=org and id=p_principal_id and kind='human');
 perform private.policy_invalidate_jobs_v1(org);
end $$;

-- Delegation is a persisted reference to the existing protected job lease, not a new grant.
create function private.sync_worker_principal_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare human_id uuid;
begin
 if new.status<>'leased' or new.leased_by is null or new.leased_account_user_id is null or new.lease_expires_at is null or new.authorization_subject_id is null then return new; end if;
 select id into human_id from private.principals where organization_id=new.organization_id and user_id=new.authorization_subject_id and kind='human';
 if human_id is null then raise exception 'job_authorization_revoked' using errcode='42501'; end if;
 insert into private.principals(organization_id,kind,human_principal_id,processing_job_id,resource_id,worker_token_id,account_user_id,expires_at)
 values(new.organization_id,'worker',human_id,new.id,new.authorization_resource_id,new.leased_by,new.leased_account_user_id,new.lease_expires_at)
 on conflict(organization_id,processing_job_id) do update set human_principal_id=excluded.human_principal_id,resource_id=excluded.resource_id,worker_token_id=excluded.worker_token_id,account_user_id=excluded.account_user_id,expires_at=excluded.expires_at;
 return new;
end $$;
-- Keep initial lease materialization inside the same claim transaction.
create trigger processing_jobs_policy_principal after insert or update of status,leased_by,leased_account_user_id,lease_expires_at on public.processing_jobs for each row execute function private.sync_worker_principal_v1();
insert into private.principals(organization_id,kind,human_principal_id,processing_job_id,resource_id,worker_token_id,account_user_id,expires_at)
 select j.organization_id,'worker',p.id,j.id,j.authorization_resource_id,j.leased_by,j.leased_account_user_id,j.lease_expires_at
 from public.processing_jobs j join private.principals p on p.organization_id=j.organization_id and p.user_id=j.authorization_subject_id
 where j.status='leased' and j.leased_by is not null and j.leased_account_user_id is not null and j.lease_expires_at is not null;
create function private.delegated_policy_access_v1(p_principal_id uuid,p_resource_id uuid,p_action text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.principals p join private.principals h on h.organization_id=p.organization_id and h.id=p.human_principal_id
 join public.processing_jobs j on j.organization_id=p.organization_id and j.id=p.processing_job_id
 join private.worker_tokens w on w.id=p.worker_token_id
 where p.id=p_principal_id and p.kind='worker' and p.revoked_at is null and h.revoked_at is null and p.expires_at>now()
 and p.account_user_id=auth.uid() and j.status='leased' and j.leased_by=p.worker_token_id and j.leased_account_user_id=p.account_user_id and j.lease_expires_at>now() and w.revoked_at is null
 and j.authorization_subject_id=h.user_id and j.authorization_resource_id=p.resource_id
 and private.resource_root_v1(p.organization_id,p_resource_id)=p.resource_id and p_action in ('read','work')
 and private.resource_access_as_subject_v1(p.organization_id,p_resource_id,h.user_id,p_action));
$$;
-- Every existing capability consumer already calls job_authority_is_current_v1.
-- Add revoked delegation and exact lease binding without changing its special review authorization branch.
do $$ declare body text; begin
 select pg_get_functiondef('private.job_authority_is_current_v1(uuid)'::regprocedure) into body;
 if position('where j.id=p_job_id' in body)=0 then raise exception 'job_authority_contract_changed'; end if;
 body:=replace(body,'private.resource_access_as_subject_v1(j.organization_id,j.authorization_resource_id,j.authorization_subject_id','private.resource_access_as_subject_v1(j.organization_id,j.intake_session_id,j.authorization_subject_id');
 body:=replace(body,'where j.id=p_job_id',E'where j.id=p_job_id\n and private.resource_access_as_subject_v1(j.organization_id,j.intake_session_id,j.authorization_subject_id,''read'')\n and not exists(select 1 from private.access_resources ar where ar.organization_id=j.organization_id and ar.id in(j.authorization_resource_id,j.intake_session_id) and not(''analysis''=any(ar.allowed_purposes)))\n and not exists(select 1 from private.principals dp where dp.organization_id=j.organization_id and dp.processing_job_id=j.id and dp.revoked_at is not null)\n and (j.status<>''leased'' or j.lease_expires_at<=now() or exists(select 1 from private.principals dp where dp.organization_id=j.organization_id and dp.processing_job_id=j.id and dp.kind=''worker'' and dp.account_user_id=j.leased_account_user_id and dp.worker_token_id=j.leased_by and dp.resource_id=j.authorization_resource_id and dp.expires_at>now()))');execute body;
end $$;
create function private.validate_policy_human_member_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.principal_id is not null and not exists(select 1 from private.principals where organization_id=new.organization_id and id=new.principal_id and kind='human') then raise exception 'policy_human_member_required' using errcode='23514'; end if;
 return new;
end $$;
create trigger group_member_human before insert or update on private.access_group_memberships for each row execute function private.validate_policy_human_member_v1();
create trigger barrier_member_human before insert or update on private.barrier_memberships for each row execute function private.validate_policy_human_member_v1();
-- A role can administer access explicitly without making legacy content mutations available.
create function private.can_admin_resource_policy_v1(p_org uuid,p_resource uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_memberships m join private.principals p on p.organization_id=m.organization_id and p.user_id=m.user_id
 join auth.users u on u.id=m.user_id
 where m.organization_id=p_org and m.user_id=auth.uid() and m.status='active' and m.role in('owner','admin') and p.revoked_at is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))
 and private.resource_root_v1(p_org,p_resource) is not null
 and coalesce(nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-offroad-workspace',''),p_org::text)=p_org::text;
$$;
do $$ declare signature text; body text; begin
 foreach signature in array array['private.grant_resource_access_v1(uuid,uuid,text,timestamp with time zone)','private.revoke_resource_access_v1(uuid,uuid)'] loop
  select pg_get_functiondef(signature::regprocedure) into body;
  if position('not private.can_access_resource_v1(r.organization_id,r.id,''manage'')' in body)=0 then raise exception 'legacy_access_admin_contract_changed'; end if;
  body:=replace(body,'not private.can_access_resource_v1(r.organization_id,r.id,''manage'')','not (private.can_access_resource_v1(r.organization_id,r.id,''manage'') or private.can_admin_resource_policy_v1(r.organization_id,r.id))');
  execute body;
 end loop;
end $$;

create function public.explain_my_access_v1(p_resource_id uuid,p_action text default 'read',p_purpose text default 'retrieval') returns jsonb language sql security invoker set search_path='' as $$select private.explain_my_access_v1(p_resource_id,p_action,p_purpose);$$;

create function public.set_access_group_v1(p_id uuid,p_name text,p_enabled boolean default true,p_unit_id uuid default null,p_parent_group_id uuid default null) returns uuid language sql security invoker set search_path='' as $$select private.set_access_group_v1(p_id,p_name,p_enabled,p_unit_id,p_parent_group_id);$$;

create function public.set_organization_unit_v1(p_id uuid,p_name text,p_enabled boolean default true) returns uuid language sql security invoker set search_path='' as $$select private.set_organization_unit_v1(p_id,p_name,p_enabled);$$;

create function public.set_access_group_member_v1(p_group_id uuid,p_user_id uuid,p_enabled boolean default true,p_expires_at timestamptz default null) returns uuid language sql security invoker set search_path='' as $$select private.set_access_group_member_v1(p_group_id,p_user_id,p_enabled,p_expires_at);$$;

create function public.set_information_barrier_v1(p_id uuid,p_resource_id uuid,p_name text,p_members jsonb,p_enabled boolean default true) returns uuid language sql security invoker set search_path='' as $$select private.set_information_barrier_v1(p_id,p_resource_id,p_name,p_members,p_enabled);$$;

create function public.set_resource_policy_grant_v1(p_resource_id uuid,p_user_id uuid,p_group_id uuid,p_action text,p_effect text,p_enabled boolean default true,p_expires_at timestamptz default null) returns uuid language sql security invoker set search_path='' as $$select private.set_resource_policy_grant_v1(p_resource_id,p_user_id,p_group_id,p_action,p_effect,p_enabled,p_expires_at);$$;

create function public.set_resource_purposes_v1(p_resource_id uuid,p_purposes text[]) returns void language sql security invoker set search_path='' as $$select private.set_resource_purposes_v1(p_resource_id,p_purposes);$$;

create function public.revoke_principal_access_v1(p_principal_id uuid) returns void language sql security invoker set search_path='' as $$select private.revoke_principal_access_v1(p_principal_id);$$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname=any(array['capture_policy_domain_event_v1','ensure_membership_principal_v1','policy_group_ids_v1','evaluate_resource_policy_v1','policy_admin_context_v1','policy_invalidate_jobs_v1','sync_worker_principal_v1','delegated_policy_access_v1','validate_policy_human_member_v1','can_admin_resource_policy_v1','explain_my_access_v1','set_access_group_v1','set_organization_unit_v1','set_access_group_member_v1','set_information_barrier_v1','set_resource_policy_grant_v1','set_resource_purposes_v1','revoke_principal_access_v1']) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname=any(array['explain_my_access_v1','set_access_group_v1','set_organization_unit_v1','set_access_group_member_v1','set_information_barrier_v1','set_resource_policy_grant_v1','set_resource_purposes_v1','revoke_principal_access_v1']) then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;end $$;
-- Remove role-to-capability inference from the web shell. The server emits the action.
do $$ declare body text; begin
 select pg_get_functiondef('private.get_workspace_bootstrap()'::regprocedure) into body;
 if position($needle$'user_id', caller_id,$needle$ in body)=0 then raise exception 'workspace_bootstrap_policy_contract_changed'; end if;
 body:=replace(body,$needle$'user_id', caller_id,$needle$,$replacement$'user_id', caller_id,
    'access_administration',jsonb_build_object('canAdminister',membership_record.role in ('owner','admin') and exists(select 1 from private.principals p join auth.users u on u.id=p.user_id where p.organization_id=resolved_organization_id and p.user_id=caller_id and p.revoked_at is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))),$replacement$);
 execute body;
end $$;
-- A capability is not a bearer permission transferable to another authenticated account.
-- Preserve each existing command; add the same identity binding before authorization locks.
do $$ declare signature text; body text; row_name text; needle text; begin
 foreach signature in array array['private.job_for_capability(uuid,text)','private.job_for_failure_capability(uuid,text)'] loop
  row_name:=case when signature like '%failure%' then 'j' else 'job_row' end;
  select pg_get_functiondef(signature::regprocedure) into body;
  needle:='if not private.lock_job_authority_v1('||row_name||'.id)';
  if position(needle in body)=0 then raise exception 'job_capability_policy_contract_changed'; end if;
  body:=replace(body,needle,
   'if auth.uid() is null or '||row_name||'.leased_account_user_id is distinct from auth.uid() or not exists(select 1 from private.worker_tokens wt where wt.id='||row_name||'.leased_by and wt.revoked_at is null) or not exists(select 1 from auth.users wu where wu.id=auth.uid() and wu.deleted_at is null and (wu.banned_until is null or wu.banned_until<=now())) then raise exception ''job_capability_invalid'' using errcode=''42501''; end if; '||needle);
  execute body;
 end loop;
end $$;
-- Legacy "remove access" must also suppress group-derived access. Its tombstone is distinct
-- from a mandatory explicit policy deny, which a project grant command cannot remove.
alter table private.resource_access_grants drop constraint resource_access_grants_grant_basis_check;
alter table private.resource_access_grants add constraint resource_access_grants_grant_basis_check check(grant_basis in('creator_bootstrap','organization_administrator','historical_assignment','explicit','explicit_revocation'));
create or replace function private.revoke_resource_access_v1(p_resource_id uuid,p_subject_user_id uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare r private.access_resources; root_id uuid; result bigint;
begin
 select * into r from private.access_resources where id=p_resource_id;
 if r.id is null or not (private.can_access_resource_v1(r.organization_id,r.id,'manage') or private.can_admin_resource_policy_v1(r.organization_id,r.id)) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||r.organization_id::text,0));
 if not (private.can_access_resource_v1(r.organization_id,r.id,'manage') or private.can_admin_resource_policy_v1(r.organization_id,r.id)) or not exists(select 1 from public.organization_memberships where organization_id=r.organization_id and user_id=p_subject_user_id) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 root_id:=coalesce(r.parent_resource_id,r.id);
 result:=private.advance_authorization_revision_v1(r.organization_id,root_id,p_subject_user_id);
 update private.resource_access_grants set revoked_at=now(),revoked_by=auth.uid() where organization_id=r.organization_id and resource_id=root_id and subject_user_id=p_subject_user_id and revoked_at is null and effect='allow';
 insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,effect,granted_by,grant_basis)
 values(r.organization_id,root_id,p_subject_user_id,'manage','deny',auth.uid(),'explicit_revocation')
 on conflict(organization_id,resource_id,subject_user_id,subject_role,action) where subject_group_id is null do update set
 effect='deny',revoked_at=null,revoked_by=null,valid_from=now(),expires_at=null,grant_basis=case when private.resource_access_grants.effect='deny' and private.resource_access_grants.grant_basis='explicit' then 'explicit' else 'explicit_revocation' end,granted_by=auth.uid();
 return result;
end $$;
do $$ declare body text; begin
 select pg_get_functiondef('private.grant_resource_access_v1(uuid,uuid,text,timestamp with time zone)'::regprocedure) into body;
 if position('perform private.advance_authorization_revision_v1' in body)=0 then raise exception 'legacy_grant_restore_contract_changed'; end if;
 body:=replace(body,'perform private.advance_authorization_revision_v1',E'perform pg_advisory_xact_lock(hashtextextended(''resource-policy:''||r.organization_id::text,0));\n if not (private.can_access_resource_v1(r.organization_id,r.id,''manage'') or private.can_admin_resource_policy_v1(r.organization_id,r.id)) then raise exception ''resource_access_denied'' using errcode=''42501''; end if;\n update private.resource_access_grants set revoked_at=now(),revoked_by=auth.uid() where organization_id=r.organization_id and resource_id=root_id and subject_user_id=p_subject_user_id and effect=''deny'' and grant_basis=''explicit_revocation'' and revoked_at is null;\n perform private.advance_authorization_revision_v1');
 -- Do not let a legacy upsert turn a mandatory policy deny into a grant.
 body:=replace(body,'update private.resource_access_grants set revoked_at=now(),revoked_by=auth.uid() where',E'if exists(select 1 from private.resource_access_grants where organization_id=r.organization_id and resource_id=root_id and subject_user_id=p_subject_user_id and action=p_action and effect=''deny'' and grant_basis=''explicit'' and revoked_at is null) then raise exception ''resource_access_denied'' using errcode=''42501''; end if;\n update private.resource_access_grants set revoked_at=now(),revoked_by=auth.uid() where');
 body:=replace(body,'granted_by=caller,grant_basis=''explicit'',','effect=''allow'',granted_by=caller,grant_basis=''explicit'',');execute body;
end $$;
-- Existing publication authorization also checks the actual purpose, not only a read grant.
do $$ declare body text; needle text:='perform private.require_domain_event_propagation_v1(plan.organization_id);'; begin
 select pg_get_functiondef('private.authorize_qualified_introduction_plan(uuid,text)'::regprocedure) into body;
 if position(needle in body)=0 then raise exception 'publication_policy_contract_changed'; end if;
 body:=replace(body,needle,E'perform pg_advisory_xact_lock_shared(hashtextextended(''resource-policy:''||plan.organization_id::text,0));\n if not private.evaluate_resource_policy_v1(plan.organization_id,plan.intake_session_id,auth.uid(),''work'',''publication'') then raise exception ''resource_access_denied'' using errcode=''42501''; end if;\n '||needle);execute body;
end $$;

-- Authenticated byte downloads must honor export rights even outside the web routes.
-- Upload/list metadata keep their existing command policies; workers retain bounded analysis.
create function private.storage_export_purpose_allowed_v1(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select case
 when not storage.allow_any_operation(array['object.get_authenticated','object.copy']) then true
 when p_bucket='brand-templates' then true
 else private.evaluate_resource_policy_v1(private.storage_organization_id(p_path),private.storage_opportunity_id(p_path),auth.uid(),'read','export')
 or private.worker_can_access_document_storage_v1(p_bucket,p_path,false)
 or (p_bucket='case-artifacts' and private.worker_can_access_capital_project_material(p_path,false))
 or private.worker_can_rotate_storage_v1(p_bucket,p_path)
 end;
$$;
revoke all on function private.storage_export_purpose_allowed_v1(text,text) from public,anon,authenticated,service_role;
grant execute on function private.storage_export_purpose_allowed_v1(text,text) to authenticated;
create policy private_storage_export_purpose on storage.objects as restrictive for select to authenticated
 using(private.storage_export_purpose_allowed_v1(bucket_id,name));
