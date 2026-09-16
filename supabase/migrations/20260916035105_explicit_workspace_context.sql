-- Stage 2, additive contract. Legacy registration remains compatible until application cutover.
-- Commercial linkage is billing metadata and is never consulted by a content-access predicate.
alter table public.organizations drop constraint organizations_organization_type_check;
alter table public.organizations add constraint organizations_organization_type_check
 check(organization_type in ('personal','institutional','company','originator','capital_provider','offroad'));
alter table public.organizations add column workspace_kind text not null default 'institutional'
 check(workspace_kind in ('personal','institutional'));
alter table public.organizations add constraint organizations_workspace_kind_consistent
 check((organization_type='personal')=(workspace_kind='personal'));
alter table public.document_intake_sessions drop constraint document_intake_sessions_journey_check;
alter table public.document_intake_sessions add constraint document_intake_sessions_journey_check
 check(journey in ('personal','institutional','company','originator','capital_provider'));

create table private.commercial_accounts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 status text not null default 'active' check(status in ('active','closed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id)
);
create table private.account_organizations (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 account_owner_organization_id uuid not null,
 commercial_account_id uuid not null,
 linked_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id),
 foreign key(account_owner_organization_id,commercial_account_id) references private.commercial_accounts(organization_id,id)
);
create index account_organizations_account on private.account_organizations(account_owner_organization_id,commercial_account_id);
create index account_organizations_linked_by on private.account_organizations(linked_by);
create table private.workspace_capability_grants (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 capability text not null check(capability in ('own_analysis','mandate_management','origination_representation','external_disclosure')),
 enabled boolean not null default true,
 basis text not null check(basis in ('workspace_foundation','legacy_compatibility','explicit_administration')),
 granted_by uuid references auth.users(id),
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,capability)
);
create index workspace_capability_grants_granted_by on private.workspace_capability_grants(granted_by);
create table public.user_workspace_preferences (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 user_id uuid not null,
 last_selected_at timestamptz not null default now(),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,user_id),
 foreign key(organization_id,user_id) references public.organization_memberships(organization_id,user_id) on delete cascade
);
create index user_workspace_preferences_user on public.user_workspace_preferences(user_id,last_selected_at desc);

alter table private.commercial_accounts enable row level security;
alter table private.commercial_accounts force row level security;
alter table private.account_organizations enable row level security;
alter table private.account_organizations force row level security;
alter table private.workspace_capability_grants enable row level security;
alter table private.workspace_capability_grants force row level security;
alter table public.user_workspace_preferences enable row level security;
alter table public.user_workspace_preferences force row level security;
revoke all on private.commercial_accounts,private.account_organizations,private.workspace_capability_grants,public.user_workspace_preferences from public,anon,authenticated,service_role;
create policy commercial_accounts_deny_clients on private.commercial_accounts as restrictive for all to anon,authenticated using(false) with check(false);
create policy account_organizations_deny_clients on private.account_organizations as restrictive for all to anon,authenticated using(false) with check(false);
create policy workspace_capability_grants_deny_clients on private.workspace_capability_grants as restrictive for all to anon,authenticated using(false) with check(false);
grant select on public.user_workspace_preferences to authenticated;
create policy user_workspace_preferences_select_authorized on public.user_workspace_preferences for select to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.organization_memberships m where m.organization_id=user_workspace_preferences.organization_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy user_workspace_preferences_insert_denied on public.user_workspace_preferences as restrictive for insert to anon,authenticated with check(false);
create policy user_workspace_preferences_update_denied on public.user_workspace_preferences as restrictive for update to anon,authenticated using(false) with check(false);
create policy user_workspace_preferences_delete_denied on public.user_workspace_preferences as restrictive for delete to anon,authenticated using(false);

create trigger commercial_accounts_updated_at before update on private.commercial_accounts for each row execute function private.set_updated_at();
create trigger account_organizations_updated_at before update on private.account_organizations for each row execute function private.set_updated_at();
create trigger workspace_capability_grants_updated_at before update on private.workspace_capability_grants for each row execute function private.set_updated_at();
create trigger user_workspace_preferences_updated_at before update on public.user_workspace_preferences for each row execute function private.set_updated_at();
create trigger commercial_accounts_audit after insert or update or delete on private.commercial_accounts for each row execute function private.capture_audit_event();
create trigger account_organizations_audit after insert or update or delete on private.account_organizations for each row execute function private.capture_audit_event();
create trigger workspace_capability_grants_audit after insert or update or delete on private.workspace_capability_grants for each row execute function private.capture_audit_event();

create function private.seed_workspace_foundation_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare account_id uuid;
begin
 insert into private.commercial_accounts(organization_id) values(new.id) returning id into account_id;
 insert into private.account_organizations(organization_id,account_owner_organization_id,commercial_account_id,linked_by)
 values(new.id,new.id,account_id,new.created_by);
 if new.organization_type<>'offroad' then
  insert into private.workspace_capability_grants(organization_id,capability,basis)
  values(new.id,'own_analysis','workspace_foundation');
 end if;
 -- Compatibility only until the stage-2 application is deployed. Removed in cutover migration.
 if new.organization_type in ('company','originator') then
  insert into private.workspace_capability_grants(organization_id,capability,basis)
  values(new.id,'origination_representation','legacy_compatibility'),(new.id,'external_disclosure','legacy_compatibility');
 elsif new.organization_type='capital_provider' then
  insert into private.workspace_capability_grants(organization_id,capability,basis)
  values(new.id,'mandate_management','legacy_compatibility');
 end if;
 return new;
end $$;
revoke all on function private.seed_workspace_foundation_v1() from public,anon,authenticated,service_role;
create trigger organizations_workspace_foundation after insert on public.organizations for each row execute function private.seed_workspace_foundation_v1();
insert into private.commercial_accounts(organization_id) select id from public.organizations;
insert into private.account_organizations(organization_id,account_owner_organization_id,commercial_account_id)
 select organization_id,organization_id,id from private.commercial_accounts;
insert into private.workspace_capability_grants(organization_id,capability,basis)
 select o.id,c.capability,case when c.capability='own_analysis' then 'workspace_foundation' else 'legacy_compatibility' end
 from public.organizations o cross join (values('own_analysis'),('mandate_management'),('origination_representation'),('external_disclosure')) c(capability)
 where private.organization_has_workspace_capability(o.organization_type,c.capability);

create function private.organization_has_workspace_capability(p_organization_id uuid,p_capability text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.workspace_capability_grants g where g.organization_id=p_organization_id and g.capability=p_capability and g.enabled);
$$;
create function private.require_workspace_capability(p_organization_id uuid,p_capability text)
returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not private.organization_has_workspace_capability(p_organization_id,p_capability) then
  raise exception 'workspace_capability_denied' using errcode='42501';
 end if;
end $$;
revoke all on function private.organization_has_workspace_capability(uuid,text),private.require_workspace_capability(uuid,text) from public,anon,authenticated,service_role;

create function private.get_workspace_context_v1() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m record; result jsonb;
begin
 select * into m from private.workspace_membership_v1();
 if m.organization_id is null then raise exception 'workspace_membership_not_found' using errcode='P0002'; end if;
 select jsonb_build_object('user_id',auth.uid(),'organization_id',o.id,'workspace_kind',o.workspace_kind,'role',m.role,
  'commercial_account_id',case when m.role in ('owner','admin') then (select a.commercial_account_id from private.account_organizations a where a.organization_id=o.id) else null end,
  'capabilities',jsonb_build_object('own_analysis',private.organization_has_workspace_capability(o.id,'own_analysis'),
    'mandate_management',private.organization_has_workspace_capability(o.id,'mandate_management'),
    'origination_representation',private.organization_has_workspace_capability(o.id,'origination_representation'),
    'external_disclosure',private.organization_has_workspace_capability(o.id,'external_disclosure')))
 into result from public.organizations o where o.id=m.organization_id;
 return result;
end $$;
create function public.get_workspace_context_v1() returns jsonb language sql stable security invoker set search_path='' as $$select private.get_workspace_context_v1();$$;
revoke all on function private.get_workspace_context_v1(),public.get_workspace_context_v1() from public,anon,authenticated,service_role;
grant execute on function private.get_workspace_context_v1(),public.get_workspace_context_v1() to authenticated;

create function private.remember_workspace_v1(p_organization_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare current_id uuid;
begin
 select organization_id into current_id from private.workspace_membership_v1();
 if current_id is null or current_id is distinct from p_organization_id then raise exception 'workspace_context_denied' using errcode='42501'; end if;
 insert into public.user_workspace_preferences(organization_id,user_id) values(current_id,auth.uid())
 on conflict(organization_id,user_id) do update set last_selected_at=now();
end $$;
create function public.remember_workspace_v1(p_organization_id uuid) returns void language sql security invoker set search_path='' as $$select private.remember_workspace_v1(p_organization_id);$$;
revoke all on function private.remember_workspace_v1(uuid),public.remember_workspace_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.remember_workspace_v1(uuid),public.remember_workspace_v1(uuid) to authenticated;

create function private.set_workspace_capability_v1(p_capability text,p_enabled boolean,p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare org_id uuid; result bigint;
begin
 select organization_id into org_id from private.workspace_membership_v1();
 if org_id is null or not private.can_manage_organization(org_id) then raise exception 'workspace_administration_denied' using errcode='42501'; end if;
 if p_capability is null or p_capability not in ('own_analysis','mandate_management','origination_representation','external_disclosure') or p_enabled is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'invalid_workspace_capability' using errcode='22023'; end if;
 perform 1 from public.organizations where id=org_id for update;
 select revision into result from private.workspace_capability_grants where organization_id=org_id and capability=p_capability;
 if coalesce(result,0)<>p_expected_revision then raise exception 'workspace_capability_stale' using errcode='40001'; end if;
 insert into private.workspace_capability_grants(organization_id,capability,enabled,basis,granted_by)
 values(org_id,p_capability,p_enabled,'explicit_administration',auth.uid())
 on conflict(organization_id,capability) do update set enabled=excluded.enabled,basis=excluded.basis,granted_by=excluded.granted_by,revision=private.workspace_capability_grants.revision+1
 returning revision into result;
 return result;
end $$;
create function public.set_workspace_capability_v1(p_capability text,p_enabled boolean,p_expected_revision bigint)
returns bigint language sql security invoker set search_path='' as $$select private.set_workspace_capability_v1(p_capability,p_enabled,p_expected_revision);$$;
revoke all on function private.set_workspace_capability_v1(text,boolean,bigint),public.set_workspace_capability_v1(text,boolean,bigint) from public,anon,authenticated,service_role;
grant execute on function private.set_workspace_capability_v1(text,boolean,bigint),public.set_workspace_capability_v1(text,boolean,bigint) to authenticated;

create function private.link_commercial_account_v1(p_account_id uuid,p_expected_account_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare org_id uuid; account_org uuid; existing_id uuid;
begin
 select organization_id into org_id from private.workspace_membership_v1();
 select organization_id into account_org from private.commercial_accounts where id=p_account_id and status='active';
 if org_id is null or account_org is null or not private.can_manage_organization(org_id) or not private.can_manage_organization(account_org) then raise exception 'commercial_link_denied' using errcode='42501'; end if;
 select commercial_account_id into existing_id from private.account_organizations where organization_id=org_id for update;
 if existing_id is distinct from p_expected_account_id then raise exception 'commercial_link_stale' using errcode='40001'; end if;
 update private.account_organizations set account_owner_organization_id=account_org,commercial_account_id=p_account_id,linked_by=auth.uid() where organization_id=org_id;
 return p_account_id;
end $$;
create function public.link_commercial_account_v1(p_account_id uuid,p_expected_account_id uuid)
returns uuid language sql security invoker set search_path='' as $$select private.link_commercial_account_v1(p_account_id,p_expected_account_id);$$;
revoke all on function private.link_commercial_account_v1(uuid,uuid),public.link_commercial_account_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.link_commercial_account_v1(uuid,uuid),public.link_commercial_account_v1(uuid,uuid) to authenticated;

create function private.initialize_workspace_v1(p_full_name text,p_locale text default 'pt-BR')
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); org_id uuid;
begin
 if actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_full_name is null or char_length(btrim(p_full_name)) not between 2 and 160 or p_locale is null or p_locale not in ('pt-BR','en-US') then raise exception 'invalid_workspace_identity' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('offroad:registration:'||actor::text,0));
 select organization_id into org_id from private.workspace_membership_v1();
 if org_id is not null then perform private.remember_workspace_v1(org_id); return org_id; end if;
 -- Do not recreate a removed or suspended identity as a new tenant during login retry.
 if exists(select 1 from public.organization_memberships where user_id=actor) then raise exception 'workspace_context_denied' using errcode='42501'; end if;
 update public.profiles set full_name=btrim(p_full_name),locale=p_locale where id=actor;
 org_id:=private.create_organization_with_owner_v1('personal',btrim(p_full_name),null,null,null);
 perform private.remember_workspace_v1(org_id);
 return org_id;
end $$;
create function public.initialize_workspace_v1(p_full_name text,p_locale text default 'pt-BR')
returns uuid language sql security invoker set search_path='' as $$select private.initialize_workspace_v1(p_full_name,p_locale);$$;
revoke all on function private.initialize_workspace_v1(text,text),public.initialize_workspace_v1(text,text) from public,anon,authenticated,service_role;
grant execute on function private.initialize_workspace_v1(text,text),public.initialize_workspace_v1(text,text) to authenticated;

-- Direct legacy onboarding writes use the same context as its versioned commands.
create function private.workspace_context_matches_v1(p_organization_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare selected_id uuid;
begin
 if auth.uid() is null then return false;end if;
 select organization_id into selected_id from private.workspace_membership_v1();
 return coalesce(selected_id=p_organization_id,false);
end $$;
revoke all on function private.workspace_context_matches_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.workspace_context_matches_v1(uuid) to authenticated;
alter policy organizations_update_admin on public.organizations
 using((select private.can_manage_organization(id)) and (select private.workspace_context_matches_v1(id)))
 with check((select private.can_manage_organization(id)) and (select private.workspace_context_matches_v1(id)) and organization_type in ('personal','institutional','company','originator','capital_provider'));
create policy onboarding_progress_insert_context on public.onboarding_progress as restrictive for insert to authenticated
 with check((select private.workspace_context_matches_v1(organization_id)));
create policy onboarding_progress_update_context on public.onboarding_progress as restrictive for update to authenticated
 using((select private.workspace_context_matches_v1(organization_id))) with check((select private.workspace_context_matches_v1(organization_id)));
create policy onboarding_progress_delete_context on public.onboarding_progress as restrictive for delete to authenticated
 using((select private.workspace_context_matches_v1(organization_id)));

-- Existing invite contracts remain valid; new workspaces have no fictitious market-side journey.
do $invite_context$
declare body text; anchor text:='from public.organizations where id=invite.organization_id;';
begin
 select pg_get_functiondef('private.accept_workspace_invite_v1(uuid)'::regprocedure) into body;
 if position(anchor in body)=0 then raise exception 'invitation_contract_drift';end if;
 execute replace(body,anchor,'from public.organizations where id=invite.organization_id and organization_type in (''company'',''originator'',''capital_provider'');');
end $invite_context$;

-- Replace the installed private.create_organization_with_owner_v1 contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.create_organization_with_owner_v1(p_organization_type text, p_name text, p_legal_name text DEFAULT NULL::text, p_country_code text DEFAULT 'BR'::text, p_website text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  result_id uuid;
begin
  if actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_organization_type is null or p_organization_type not in ('personal','institutional','company','originator','capital_provider') then
    raise exception 'invalid_organization_type' using errcode='22023';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 160
    or char_length(p_legal_name)>320 or char_length(p_website)>2048
    or (p_country_code is not null and upper(p_country_code)!~'^[A-Z]{2}$') then
    raise exception 'invalid_organization_details' using errcode='22023';
  end if;
  insert into public.organizations(organization_type,name,legal_name,country_code,website,created_by,workspace_kind)
  values(p_organization_type,btrim(p_name),nullif(btrim(p_legal_name),''),upper(p_country_code),nullif(btrim(p_website),''),actor,case when p_organization_type='personal' then 'personal' else 'institutional' end)
  returning id into result_id;
  insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
  values(result_id,actor,'owner','active',now());
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(result_id,actor,'organization_created','organizations',result_id::text,'{}');
  return result_id;
end;
$function$
;

-- Replace the installed public.initialize_professional_onboarding contract, retaining all other checks.
CREATE OR REPLACE FUNCTION public.initialize_professional_onboarding(p_journey text, p_full_name text, p_job_title text DEFAULT NULL::text, p_locale text DEFAULT 'pt-BR'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_journey not in ('company', 'originator', 'capital_provider') then
    raise exception 'invalid_journey' using errcode = '22023';
  end if;

  if char_length(trim(p_full_name)) not between 2 and 160 then
    raise exception 'invalid_full_name' using errcode = '22023';
  end if;

  -- One registration request cannot race another into creating a second workspace.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('offroad:registration:'||actor_id::text,0));

  if exists(select 1 from public.organization_memberships m where m.user_id=actor_id and m.status='active') then organization_id:=(public.get_workspace_context_v1()->>'organization_id')::uuid; end if;

  if organization_id is not null then
    return organization_id;
  end if;

  update public.profiles
  set full_name = trim(p_full_name),
      job_title = nullif(trim(p_job_title), ''),
      locale = case when p_locale in ('pt-BR', 'en-US') then p_locale else 'pt-BR' end
  where id = actor_id;

  organization_id := private.create_organization_with_owner_v1(
    p_journey,
    case p_journey when 'company' then 'Empresa em cadastro'
      when 'originator' then 'Assessoria em cadastro' else 'Instituição em cadastro' end,
    null,'BR',null
  );

  insert into public.onboarding_progress (
    organization_id,
    user_id,
    journey,
    current_step,
    answers
  ) values (
    organization_id,
    actor_id,
    p_journey,
    'organization',
    jsonb_build_object(
      'registration', jsonb_build_object(
        'full_name', trim(p_full_name),
        'job_title', nullif(trim(p_job_title), '')
      )
    )
  );

  return organization_id;
end;
$function$
;

-- Replace the installed private.create_workspace_project_group contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.create_workspace_project_group(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
  normalized_name text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  group_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if char_length(normalized_name) not between 2 and 80 then
    raise exception 'invalid_project_name' using errcode = '22023';
  end if;

  -- Changed: the displayed tenant, checked for own analysis.
  select resolved.organization_id, resolved.organization_type
  into target_organization_id, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_id, 'own_analysis');

  insert into public.workspace_project_groups (organization_id, name, created_by)
  values (target_organization_id, normalized_name, caller_id)
  returning id into group_id;
  return group_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$function$
;

-- Replace the installed private.start_workspace_project contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.start_workspace_project(p_locale text, p_project_name text, p_identity_policy text, p_representation_declared boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- Changed: the displayed tenant, checked for representation; never another membership.
  select resolved.organization_id, resolved.organization_type
  into target_organization_id, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_id, 'origination_representation');

  return private.start_workspace_intake(
    target_organization_id,
    p_locale,
    p_project_name,
    p_identity_policy,
    p_representation_declared
  );
end;
$function$
;

-- Replace the installed private.start_onboarding_intake contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.start_onboarding_intake(p_locale text, p_project_name text, p_identity_policy text, p_representation_declared boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  progress_row public.onboarding_progress;
  session_id uuid;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  target_representation_kind text;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_project_name) not between 2 and 80
    or p_identity_policy not in ('identified_restricted', 'blind_initial')
    or not coalesce(p_representation_declared, false) then
    raise exception 'invalid_private_project_setup' using errcode = '22023';
  end if;

  select progress.* into progress_row
  from public.onboarding_progress progress
  join public.organization_memberships membership
    on membership.organization_id = progress.organization_id
   and membership.user_id = progress.user_id
  join public.organizations organization
    on organization.id = progress.organization_id
  where progress.organization_id = (select organization_id from private.workspace_membership_v1())
    and progress.user_id = caller_id
    and progress.completed_at is null
    and progress.journey in ('company', 'originator')
    and membership.status = 'active'
    and organization.organization_type in ('company', 'originator')
  order by progress.updated_at desc
  limit 1
  for update of progress;
  if not found then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document on document.id = acceptance.legal_document_id
    where acceptance.organization_id = progress_row.organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and document.status = 'active'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
  ) then
    raise exception 'private_workspace_terms_required' using errcode = '42501';
  end if;

  target_representation_kind := case progress_row.journey when 'originator' then 'advisor' else 'company' end;

  if coalesce(progress_row.answers ->> 'intake_session_id', '') <> '' then
    select session.id into session_id
    from public.document_intake_sessions session
    where session.organization_id = progress_row.organization_id
      and session.id = (progress_row.answers ->> 'intake_session_id')::uuid
      and session.started_by = caller_id
      and session.status not in ('cancelled', 'confirmed')
    limit 1
    for update;
  end if;

  if session_id is null then
    insert into public.document_intake_sessions (
      organization_id, started_by, journey, locale, project_name, identity_policy,
      privacy_status, representation_kind, representation_status
    ) values (
      progress_row.organization_id, caller_id, progress_row.journey, p_locale,
      normalized_project_name, p_identity_policy, 'private', target_representation_kind, 'declared'
    ) returning id into session_id;
  else
    update public.document_intake_sessions session
    set project_name = normalized_project_name,
        identity_policy = p_identity_policy,
        representation_kind = target_representation_kind,
        updated_at = now()
    where session.organization_id = progress_row.organization_id
      and session.id = session_id;
  end if;

  insert into public.project_representation_evidence (
    organization_id, intake_session_id, representation_kind, evidence_type,
    statement, status, submitted_by
  )
  select
    progress_row.organization_id, session_id, target_representation_kind, 'self_declaration',
    case target_representation_kind
      when 'advisor' then 'The user declares that they are authorized to prepare this project on behalf of the company.'
      else 'The user declares that they represent the company and are authorized to prepare this project.'
    end,
    'declared', caller_id
  where not exists (
    select 1
    from public.project_representation_evidence evidence
    where evidence.organization_id = progress_row.organization_id
      and evidence.intake_session_id = session_id
      and evidence.submitted_by = caller_id
      and evidence.evidence_type = 'self_declaration'
      and evidence.status <> 'revoked'
  );

  update public.onboarding_progress progress
  set current_step = 'organization',
      answers = coalesce(progress.answers, '{}'::jsonb)
        || jsonb_build_object(
          'intake_mode', 'documents',
          'intake_session_id', session_id,
          'guided_milestone', coalesce(progress.answers ->> 'guided_milestone', 'company'),
          'project_name', normalized_project_name,
          'identity_policy', p_identity_policy
        ),
      updated_at = now()
  where progress.organization_id = progress_row.organization_id
    and progress.user_id = caller_id
    and progress.journey = progress_row.journey;

  return session_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$function$
;

-- Replace the installed private.start_workspace_intake contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.start_workspace_intake(p_organization_id uuid, p_locale text, p_project_name text, p_identity_policy text, p_representation_declared boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  organization_type text;
  session_id uuid;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  target_representation_kind text;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_project_name) not between 2 and 80
    or p_identity_policy not in ('identified_restricted', 'blind_initial')
    or not coalesce(p_representation_declared, false) then
    raise exception 'invalid_private_project_setup' using errcode = '22023';
  end if;

  select organization.organization_type into organization_type
  from public.organizations organization
  join public.organization_memberships membership
    on membership.organization_id = organization.id
   and membership.user_id = caller_id
   and membership.status = 'active'
  where organization.id = p_organization_id
    and organization.id = (select organization_id from private.workspace_membership_v1())
    and private.organization_has_workspace_capability(organization.id,'origination_representation')
  limit 1;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document on document.id = acceptance.legal_document_id
    where acceptance.organization_id = p_organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and document.status = 'active'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
  ) then
    raise exception 'private_workspace_terms_required' using errcode = '42501';
  end if;

  target_representation_kind := case organization_type when 'originator' then 'advisor' else 'company' end;

  insert into public.document_intake_sessions (
    organization_id, started_by, journey, locale, project_name, identity_policy,
    privacy_status, representation_kind, representation_status
  ) values (
    p_organization_id, caller_id, organization_type, p_locale, normalized_project_name,
    p_identity_policy, 'private', target_representation_kind, 'declared'
  ) returning id into session_id;

  insert into public.project_representation_evidence (
    organization_id, intake_session_id, representation_kind, evidence_type,
    statement, status, submitted_by
  ) values (
    p_organization_id, session_id, target_representation_kind, 'self_declaration',
    case target_representation_kind
      when 'advisor' then 'The user declares that they are authorized to prepare this project on behalf of the company.'
      else 'The user declares that they represent the company and are authorized to prepare this project.'
    end,
    'declared', caller_id
  );

  return session_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$function$
;

-- Replace the installed private.accept_private_workspace_terms contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.accept_private_workspace_terms(p_locale text, p_signatory_name text, p_signatory_title text, p_terms_agreed boolean, p_information_rights_declared boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
  caller_role text;
  legal_document public.platform_legal_documents;
  acceptance_id uuid;
  request_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  client_ip inet;
  user_agent text := left(nullif(request_headers ->> 'user-agent', ''), 1000);
  raw_client_ip text := nullif(
    trim(split_part(coalesce(request_headers ->> 'x-forwarded-for', ''), ',', 1)),
    ''
  );
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(trim(coalesce(p_signatory_name, ''))) not between 2 and 160
    or (nullif(trim(coalesce(p_signatory_title, '')), '') is not null
      and char_length(trim(p_signatory_title)) not between 2 and 160)
    or not coalesce(p_terms_agreed, false)
    or not coalesce(p_information_rights_declared, false) then
    raise exception 'invalid_private_workspace_acceptance' using errcode = '22023';
  end if;

  begin
    if raw_client_ip is not null then
      client_ip := raw_client_ip::inet;
    end if;
  exception when invalid_text_representation then
    client_ip := null;
  end;

  select resolved.organization_id,resolved.role into target_organization_id,caller_role from private.workspace_membership_v1() resolved;
  if target_organization_id is null or caller_role not in ('owner','admin') then raise exception 'workspace_terms_acceptor_role_required' using errcode='42501'; end if;

  select organization.organization_type into target_organization_type
  from public.organizations organization
  where organization.id = target_organization_id;

  select document.* into legal_document
  from public.platform_legal_documents document
  where document.document_key = 'private_workspace_terms'
    and document.locale = p_locale
    and document.status = 'active'
    and document.effective_at <= now()
  order by document.effective_at desc
  limit 1;
  if not found then
    raise exception 'active_private_workspace_terms_not_found' using errcode = 'P0002';
  end if;

  select acceptance.id into acceptance_id
  from public.organization_legal_acceptances acceptance
  where acceptance.organization_id = target_organization_id
    and acceptance.document_key = legal_document.document_key
    and acceptance.document_version = legal_document.version;

  if acceptance_id is not null then
    return acceptance_id;
  end if;

  insert into public.organization_legal_acceptances (
    organization_id,
    legal_document_id,
    document_key,
    document_version,
    document_hash,
    accepted_by,
    signatory_name,
    signatory_title,
    authority_declared,
    information_rights_declared,
    terms_agreed,
    acceptance_statement,
    information_rights_statement,
    acceptance_method,
    accepted_ip,
    accepted_user_agent,
    locale
  ) values (
    target_organization_id,
    legal_document.id,
    legal_document.document_key,
    legal_document.version,
    legal_document.document_hash,
    caller_id,
    trim(p_signatory_name),
    nullif(trim(coalesce(p_signatory_title, '')), ''),
    -- Changed: a financier records no authority to represent the analyzed company.
    case when not private.organization_has_workspace_capability(target_organization_id,'origination_representation') then null else true end,
    true,
    true,
    legal_document.acceptance_statement,
    case when not private.organization_has_workspace_capability(target_organization_id,'origination_representation')
      then private.financier_information_rights_statement(p_locale)
      else legal_document.information_rights_statement end,
    'clickwrap',
    client_ip,
    user_agent,
    p_locale
  )
  returning id into acceptance_id;

  return acceptance_id;
end;
$function$
;

-- Replace the installed private.start_financier_analytical_workspace_v1 contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.start_financier_analytical_workspace_v1(p_locale text, p_signatory_name text, p_signatory_title text, p_terms_agreed boolean, p_information_rights_declared boolean, p_terms_acceptance_recorded boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  progress_row public.onboarding_progress;
  organization_row public.organizations;
  acceptance_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US') then
    raise exception 'unsupported_locale' using errcode = '22023';
  end if;

  select progress.* into progress_row
  from public.onboarding_progress progress
  join public.organization_memberships membership
    on membership.organization_id = progress.organization_id
   and membership.user_id = caller_id
   and membership.status = 'active'
  where progress.organization_id = (select organization_id from private.workspace_membership_v1())
    and progress.user_id = caller_id
    and progress.completed_at is null
    and progress.journey = 'capital_provider'
  order by progress.updated_at desc
  limit 1
  for update of progress;
  if not found then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;

  select organization.* into strict organization_row
  from public.organizations organization
  where organization.id = progress_row.organization_id;
  perform private.require_workspace_capability(organization_row.id, 'own_analysis');
  perform private.require_workspace_capability(organization_row.id, 'mandate_management');

  if coalesce(p_terms_acceptance_recorded, false) then
    select acceptance.id into acceptance_id
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document on document.id = acceptance.legal_document_id
    where acceptance.organization_id = progress_row.organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
      and document.status = 'active'
    order by acceptance.accepted_at desc
    limit 1;
    if acceptance_id is null then
      raise exception 'private_workspace_terms_required' using errcode = '42501';
    end if;
  else
    acceptance_id := private.accept_private_workspace_terms(
      p_locale, p_signatory_name, p_signatory_title, p_terms_agreed, p_information_rights_declared
    );
    if not exists (
      select 1 from public.organization_legal_acceptances acceptance
      where acceptance.id = acceptance_id
        and acceptance.organization_id = progress_row.organization_id
    ) then
      raise exception 'workspace_terms_organization_mismatch' using errcode = '42501';
    end if;
  end if;

  -- The analytical entry completes onboarding without a fund, a mandate or a contact. Mandate
  -- registration remains its own path and never becomes a prerequisite for analysis.
  update public.onboarding_progress progress
  set current_step = 'complete',
      completed_at = coalesce(progress.completed_at, now()),
      answers = coalesce(progress.answers, '{}'::jsonb) || jsonb_build_object(
        'workspace_entry', 'own_analysis',
        'terms_acceptance_id', acceptance_id
      ),
      updated_at = now()
  where progress.organization_id = progress_row.organization_id
    and progress.user_id = caller_id
    and progress.journey = 'capital_provider';

  return jsonb_build_object(
    'organization_id', progress_row.organization_id,
    'acceptance_id', acceptance_id,
    'workspace_ready', true
  );
end;
$function$
;

-- Replace the installed private.get_onboarding_bootstrap contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.get_onboarding_bootstrap(p_locale text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  progress_record public.onboarding_progress;
  organization_record public.organizations;
  profile_record public.profiles;
  legal_document_record public.platform_legal_documents;
  terms_accepted boolean := false;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US') then
    raise exception 'unsupported_locale' using errcode = '22023';
  end if;

  select progress.*
  into progress_record
  from public.onboarding_progress progress
  join public.organization_memberships membership
    on membership.organization_id = progress.organization_id
   and membership.user_id = caller_id
   and membership.status = 'active'
  where progress.organization_id = (select organization_id from private.workspace_membership_v1())
    and progress.user_id = caller_id
    and progress.completed_at is null
  order by progress.updated_at desc
  limit 1;

  if not found then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;
  target_organization_id := progress_record.organization_id;

  select organization.*
  into strict organization_record
  from public.organizations organization
  where organization.id = target_organization_id;

  select profile.*
  into profile_record
  from public.profiles profile
  where profile.id = caller_id;

  -- Changed: the financier journey also accepts the workspace terms during onboarding.
  if progress_record.journey in ('company', 'originator', 'capital_provider') then
    select document.*
    into legal_document_record
    from public.platform_legal_documents document
    where document.document_key = 'private_workspace_terms'
      and document.locale = p_locale
      and document.status = 'active'
      and document.effective_at <= now()
    order by document.effective_at desc
    limit 1;

    if legal_document_record.id is not null then
      select exists (
        select 1
        from public.organization_legal_acceptances acceptance
        where acceptance.organization_id = target_organization_id
          and acceptance.document_key = legal_document_record.document_key
          and acceptance.document_version = legal_document_record.version
          and acceptance.document_hash = legal_document_record.document_hash
      ) into terms_accepted;
      -- Changed: a financier declares information usage, not representation.
      if not private.organization_has_workspace_capability(target_organization_id,'origination_representation') then
        legal_document_record.information_rights_statement := private.financier_information_rights_statement(p_locale);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'user_id', caller_id,
    'organization', jsonb_build_object(
      'id', organization_record.id,
      'name', organization_record.name,
      'legal_name', organization_record.legal_name,
      'website', organization_record.website,
      'country_code', organization_record.country_code,
      'state_code', organization_record.state_code,
      'city', organization_record.city,
      'sector', organization_record.sector,
      'subsector', organization_record.subsector,
      'provider_type', organization_record.provider_type,
      'description', organization_record.description
    ),
    'progress', jsonb_build_object(
      'journey', progress_record.journey,
      'current_step', progress_record.current_step,
      'answers', progress_record.answers,
      'completed_at', progress_record.completed_at
    ),
    'profile', case when profile_record.id is null then null else jsonb_build_object(
      'full_name', profile_record.full_name,
      'job_title', profile_record.job_title
    ) end,
    'legal_document', case when legal_document_record.id is null then null else jsonb_build_object(
      'id', legal_document_record.id,
      'title', legal_document_record.title,
      'version', legal_document_record.version,
      'document_hash', legal_document_record.document_hash,
      'rendered_text', legal_document_record.rendered_text,
      'body_sections', legal_document_record.body_sections,
      'acceptance_statement', legal_document_record.acceptance_statement,
      'information_rights_statement', legal_document_record.information_rights_statement
    ) end,
    'terms_accepted', terms_accepted
  );
end;
$function$
;

-- Replace the installed private.get_workspace_bootstrap contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.get_workspace_bootstrap()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  resolved_organization_id uuid;
  membership_record public.organization_memberships;
  organization_record public.organizations;
  progress_record public.onboarding_progress;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- Changed: the same resolver every creator uses.
  select resolved.organization_id into resolved_organization_id
  from private.workspace_membership_v1() resolved;
  if resolved_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;

  select membership.*
  into strict membership_record
  from public.organization_memberships membership
  where membership.organization_id = resolved_organization_id
    and membership.user_id = caller_id;

  select organization.*
  into strict organization_record
  from public.organizations organization
  where organization.id = membership_record.organization_id;

  select progress.*
  into progress_record
  from public.onboarding_progress progress
  where progress.organization_id = membership_record.organization_id
    and progress.user_id = caller_id
  order by progress.updated_at desc
  limit 1;

  return jsonb_build_object(
    'user_id', caller_id,
    'email', coalesce(auth.jwt() ->> 'email', ''),
    'membership', jsonb_build_object(
      'organization_id', membership_record.organization_id,
      'role', membership_record.role
    ),
    'organization', jsonb_build_object(
      'id', organization_record.id,
      'name', organization_record.name,
      'legal_name', organization_record.legal_name,
      'website', organization_record.website,
      'description', organization_record.description,
      'organization_type', organization_record.organization_type,
      'workspace_kind',organization_record.workspace_kind,
      'capabilities',private.get_workspace_context_v1()->'capabilities',
      'verification_status', organization_record.verification_status
    ),
    'onboarding', case when progress_record.user_id is null then null else jsonb_build_object(
      'journey', progress_record.journey,
      'current_step', progress_record.current_step,
      'answers', progress_record.answers,
      'completed_at', progress_record.completed_at
    ) end,
    'workspace_ready', organization_record.organization_type in ('personal','institutional') or progress_record.completed_at is not null
  );
end;
$function$
;

-- Replace the installed private.get_workspace_project_setup contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.get_workspace_project_setup(p_locale text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
  profile_record public.profiles;
  legal_document_record public.platform_legal_documents;
  terms_accepted boolean := false;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US') then
    raise exception 'unsupported_locale' using errcode = '22023';
  end if;

  -- Changed: the displayed tenant, checked for own analysis.
  select resolved.organization_id, resolved.organization_type
  into target_organization_id, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_id, 'own_analysis');

  select profile.*
  into profile_record
  from public.profiles profile
  where profile.id = caller_id;

  select document.*
  into legal_document_record
  from public.platform_legal_documents document
  where document.document_key = 'private_workspace_terms'
    and document.locale = p_locale
    and document.status = 'active'
    and document.effective_at <= now()
  order by document.effective_at desc
  limit 1;

  if legal_document_record.id is not null then
    select exists (
      select 1
      from public.organization_legal_acceptances acceptance
      where acceptance.organization_id = target_organization_id
        and acceptance.document_key = legal_document_record.document_key
        and acceptance.document_version = legal_document_record.version
        and acceptance.document_hash = legal_document_record.document_hash
    ) into terms_accepted;
    -- Changed: a financier declares information usage, not representation.
    if not private.organization_has_workspace_capability(target_organization_id,'origination_representation') then
      legal_document_record.information_rights_statement := private.financier_information_rights_statement(p_locale);
    end if;
  end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'full_name', coalesce(profile_record.full_name, ''),
      'job_title', coalesce(profile_record.job_title, '')
    ),
    'legal_document', case
      when legal_document_record.id is null then null
      else jsonb_build_object(
        'title', legal_document_record.title,
        'version', legal_document_record.version,
        'rendered_text', legal_document_record.rendered_text,
        'body_sections', legal_document_record.body_sections,
        'acceptance_statement', legal_document_record.acceptance_statement,
        'information_rights_statement', legal_document_record.information_rights_statement
      )
    end,
    'terms_accepted', terms_accepted
  );
end;
$function$
;

-- Replace the installed private.update_workspace_project contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.update_workspace_project(p_session_id uuid, p_project_name text, p_identity_policy text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
begin
 perform private.require_resource_access_v1(p_session_id,'work');
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_session_id is null
    or char_length(normalized_project_name) not between 2 and 80
    or p_identity_policy not in ('identified_restricted', 'blind_initial') then
    raise exception 'invalid_private_project_setup' using errcode = '22023';
  end if;

  -- Changed: the displayed tenant, checked for own analysis.
  select resolved.organization_id, resolved.organization_type
  into target_organization_id, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_id, 'own_analysis');

  update public.document_intake_sessions session
  set project_name = normalized_project_name,
      identity_policy = p_identity_policy,
      updated_at = now()
  where session.organization_id = target_organization_id
    and session.id = p_session_id
    and session.archived_at is null
    and session.status not in ('confirmed', 'cancelled');

  if not found then
    raise exception 'intake_session_not_editable' using errcode = 'P0002';
  end if;

  return p_session_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$function$
;

-- Replace the installed public.start_advisor_project_v1 contract, retaining all other checks.
CREATE OR REPLACE FUNCTION public.start_advisor_project_v1(p_request_id uuid, p_locale text, p_project_name text, p_entry_job text, p_prompt text, p_access_basis text, p_plan jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  normalized_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  available_name text := normalized_name;
begin
  target_organization_id:=(public.get_workspace_context_v1()->>'organization_id')::uuid;

  if target_organization_id is not null and exists (
    select 1
    from public.capital_projects project
    where project.organization_id = target_organization_id
      and lower(project.project_name) = lower(normalized_name)
      and project.status <> 'archived'
  ) then
    available_name := left(normalized_name, 71) || ' · ' || left(p_request_id::text, 6);
  end if;

  return private.start_advisor_project_v1(
    p_request_id,
    p_locale,
    available_name,
    p_entry_job,
    p_prompt,
    p_access_basis,
    p_plan
  );
end;
$function$
;

-- Replace the installed private.start_advisor_project_v1 contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.start_advisor_project_v1(p_request_id uuid, p_locale text, p_project_name text, p_entry_job text, p_prompt text, p_access_basis text, p_plan jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
  normalized_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  normalized_prompt text := trim(coalesce(p_prompt, ''));
  project_id uuid;
  session_id uuid;
  conversation_id uuid;
  assistant_message_id uuid := gen_random_uuid();
  assistant_copy text;
  existing_message public.agent_messages;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- Changed: the displayed tenant, checked for the capability the entry needs.
  select resolved.organization_id, resolved.organization_type
  into target_organization_id, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_id, 'own_analysis');
  if p_entry_job = 'origination_thesis' then
    perform private.require_workspace_capability(target_organization_id, 'origination_representation');
  end if;

  select message.* into existing_message
  from public.agent_messages message
  where message.organization_id = target_organization_id
    and private.can_access_intake_session(message.organization_id,message.intake_session_id)
    and message.id = p_request_id
    and message.created_by = caller_id;
  if found then
    select session.capital_project_id into project_id
    from public.document_intake_sessions session
    where session.organization_id = existing_message.organization_id
      and session.id = existing_message.intake_session_id;
    return jsonb_build_object(
      'capital_project_id', project_id,
      'intake_session_id', existing_message.intake_session_id,
      'conversation_id', existing_message.conversation_id,
      'message_id', existing_message.id,
      'replayed', true
    );
  end if;

  if p_request_id is null
    or p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_name) not between 2 and 80
    or char_length(normalized_prompt) not between 2 and 8000
    or p_entry_job not in (
      'company_debt_view', 'origination_thesis', 'capital_planning',
      'structure_from_documents', 'review_existing_operation'
    )
    or p_access_basis not in ('public_information', 'authorized_private')
    or coalesce(jsonb_typeof(p_plan), 'null') <> 'object'
    or p_plan #>> '{job,id}' <> p_entry_job then
    raise exception 'invalid_advisor_project' using errcode = '22023';
  end if;

  -- Private-document work relies on the one organization-level confidentiality acceptance.
  -- It deliberately does not assert authority to represent the company before investors.
  if p_access_basis = 'authorized_private' and not exists (
    select 1
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document
      on document.id = acceptance.legal_document_id
    where acceptance.organization_id = target_organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
      and document.status = 'active'
  ) then
    raise exception 'private_workspace_terms_required' using errcode = '42501';
  end if;

  insert into public.capital_projects (
    organization_id, project_name, entry_job, access_basis,
    status, current_phase, created_by
  ) values (
    target_organization_id, normalized_name, p_entry_job, p_access_basis,
    'active', 'understand', caller_id
  ) returning id into project_id;

  insert into public.document_intake_sessions (
    organization_id, capital_project_id, started_by, journey, locale,
    project_name, identity_policy, privacy_status,
    representation_kind, representation_status, company_profile
  ) values (
    target_organization_id, project_id, caller_id, target_organization_type, p_locale,
    normalized_name, 'identified_restricted',
    case when p_access_basis = 'authorized_private' then 'private' else 'public_information' end,
    null, 'not_claimed', '{}'::jsonb
  ) returning id into session_id;

  perform private.record_capital_project_plan(project_id, p_plan);

  insert into public.agent_conversations (
    organization_id, intake_session_id, state, created_by
  ) values (
    target_organization_id, session_id, 'asking', caller_id
  ) returning id into conversation_id;

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status,
    content, locale, metadata, created_by
  ) values (
    p_request_id, target_organization_id, conversation_id, session_id,
    'user', 'completed', normalized_prompt, p_locale,
    jsonb_build_object('kind', 'request', 'entryJob', p_entry_job), caller_id
  );

  assistant_copy := case p_locale
    when 'en-US' then
      'Understood. This project will keep the company, evidence, decisions and materials in one context. Add any documents you already have or continue describing the assignment. I will first confirm the company and scope, then show the work plan and the information still needed.'
    else
      'Entendi. Este projeto manterá companhia, evidências, decisões e materiais no mesmo contexto. Anexe o que já tiver ou continue descrevendo o trabalho. Primeiro vou confirmar a companhia e o escopo; depois mostro o plano e o que ainda será necessário.'
  end;

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status,
    content, locale, reply_to_message_id, metadata, created_by
  ) values (
    assistant_message_id, target_organization_id, conversation_id, session_id,
    'assistant', 'completed', assistant_copy, p_locale, p_request_id,
    jsonb_build_object('kind', 'guidance', 'nextAction', 'add_context'), caller_id
  );

  return jsonb_build_object(
    'capital_project_id', project_id,
    'intake_session_id', session_id,
    'conversation_id', conversation_id,
    'message_id', p_request_id,
    'replayed', false
  );
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$function$
;

-- Replace the installed private.register_provider_mandate_v1 contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.register_provider_mandate_v1(p_organization_id uuid, p_fund_id uuid, p_fund_name text, p_fund_strategy text, p_mandate jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  org_type text;
  fund public.funds;
  next_version integer;
  created public.provider_mandates;
  tenor_min integer;
  tenor_max integer;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.is_org_type_member(p_organization_id, array['capital_provider', 'offroad']) then
    raise exception 'provider_mandate_denied' using errcode = '42501';
  end if;
  select organization_record.organization_type into org_type
  from public.organizations organization_record where organization_record.id = p_organization_id;
  perform private.require_workspace_capability(p_organization_id, 'mandate_management');
  if coalesce(jsonb_typeof(p_mandate), 'null') <> 'object' then
    raise exception 'provider_mandate_payload_invalid' using errcode = '22023';
  end if;

  if p_fund_id is null then
    if char_length(btrim(coalesce(p_fund_name, ''))) not between 2 and 200
      or char_length(btrim(coalesce(p_fund_strategy, ''))) not between 2 and 200 then
      raise exception 'provider_fund_identity_invalid' using errcode = '22023';
    end if;
    insert into public.funds (organization_id, name, strategy, created_by)
    values (p_organization_id, btrim(p_fund_name), btrim(p_fund_strategy), (select auth.uid()))
    returning * into fund;
  else
    select * into fund from public.funds
    where funds.organization_id = p_organization_id and funds.id = p_fund_id for update;
    if not found then
      raise exception 'provider_fund_not_found' using errcode = 'P0002';
    end if;
  end if;

  select coalesce(max(mandate.version_number), 0) + 1 into next_version
  from public.provider_mandates mandate
  where mandate.organization_id = p_organization_id and mandate.fund_id = fund.id;

  tenor_min := nullif(p_mandate->>'termMonthsMin', '')::integer;
  tenor_max := nullif(p_mandate->>'termMonthsMax', '')::integer;

  insert into public.provider_mandates (
    organization_id, fund_id, version_number, status, currency, ticket_min, ticket_max,
    instruments, sectors, geographies, collateral, term_months_min, term_months_max,
    leverage_ceiling, minimum_dscr, accepting_new_transactions, valid_from, valid_until,
    sources, note, created_by
  ) values (
    p_organization_id, fund.id, next_version, 'draft',
    p_mandate->>'currency',
    (p_mandate->>'ticketMin')::numeric,
    (p_mandate->>'ticketMax')::numeric,
    coalesce((select array_agg(value#>>'{}') from jsonb_array_elements(p_mandate->'instruments')), '{}'::text[]),
    coalesce((select array_agg(btrim(value#>>'{}')) from jsonb_array_elements(p_mandate->'sectors')), '{}'::text[]),
    coalesce((select array_agg(btrim(value#>>'{}')) from jsonb_array_elements(p_mandate->'geographies')), '{}'::text[]),
    coalesce((select array_agg(value#>>'{}') from jsonb_array_elements(p_mandate->'collateral')), '{}'::text[]),
    tenor_min, tenor_max,
    nullif(p_mandate->>'leverageCeiling', '')::numeric,
    nullif(p_mandate->>'minimumDscr', '')::numeric,
    coalesce((p_mandate->>'acceptingNewTransactions')::boolean, true),
    coalesce(nullif(p_mandate->>'validFrom', '')::date, current_date),
    nullif(p_mandate->>'validUntil', '')::date,
    case when jsonb_typeof(p_mandate->'sources') = 'array' then p_mandate->'sources' else '[]'::jsonb end,
    nullif(btrim(coalesce(p_mandate->>'note', '')), ''),
    (select auth.uid())
  ) returning * into created;

  return jsonb_build_object(
    'fundId', fund.id, 'fundName', fund.name,
    'mandateId', created.id, 'versionNumber', created.version_number, 'status', created.status);
end;
$function$
;

-- Replace the installed private.confirm_provider_mandate_v1 contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.confirm_provider_mandate_v1(p_organization_id uuid, p_mandate_id uuid, p_channel text, p_valid_from date, p_valid_until date, p_document_reference text, p_contact_record_id uuid, p_contact_date date, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  org_type text;
  mandate public.provider_mandates;
  event public.provider_mandate_confirmations;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.is_org_type_member(p_organization_id, array['capital_provider', 'offroad']) then
    raise exception 'provider_mandate_denied' using errcode = '42501';
  end if;
  select organization_record.organization_type into org_type
  from public.organizations organization_record where organization_record.id = p_organization_id;
  perform private.require_workspace_capability(p_organization_id, 'mandate_management');

  select * into mandate from public.provider_mandates
  where provider_mandates.organization_id = p_organization_id
    and provider_mandates.id = p_mandate_id for update;
  if not found then
    raise exception 'provider_mandate_not_found' using errcode = 'P0002';
  end if;
  if mandate.status = 'withdrawn' then
    raise exception 'provider_mandate_withdrawn' using errcode = '40001';
  end if;

  insert into public.provider_mandate_confirmations (
    organization_id, mandate_id, mandate_version_number, channel, document_reference,
    contact_record_id, contact_date, valid_from, valid_until, note, confirmed_by
  ) values (
    p_organization_id, mandate.id, mandate.version_number, p_channel,
    nullif(btrim(coalesce(p_document_reference, '')), ''),
    p_contact_record_id, p_contact_date,
    coalesce(p_valid_from, mandate.valid_from), p_valid_until,
    nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid())
  ) returning * into event;

  update public.provider_mandates set
    status = 'confirmed',
    valid_from = event.valid_from,
    valid_until = event.valid_until,
    confirmed_at = event.confirmed_at,
    confirmed_by = event.confirmed_by
  where provider_mandates.organization_id = p_organization_id and provider_mandates.id = mandate.id
  returning * into mandate;

  return jsonb_build_object(
    'mandateId', mandate.id, 'versionNumber', mandate.version_number, 'status', mandate.status,
    'confirmedAt', mandate.confirmed_at, 'validFrom', mandate.valid_from,
    'validUntil', mandate.valid_until, 'channel', event.channel,
    'effectiveStatus', private.provider_mandate_effective_status_v1(
      mandate.status, mandate.valid_from, mandate.valid_until, current_date));
end;
$function$
;

-- Replace the installed private.start_public_capital_project contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.start_public_capital_project(p_locale text, p_project_name text, p_entry_job text, p_company_name text, p_company_website text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
  project_id uuid;
  session_id uuid;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  normalized_company_name text := trim(regexp_replace(coalesce(p_company_name, ''), '\s+', ' ', 'g'));
  normalized_website text := nullif(trim(coalesce(p_company_website, '')), '');
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_project_name) not between 2 and 80
    or char_length(normalized_company_name) not between 2 and 160
    or p_entry_job not in ('company_debt_view', 'origination_thesis', 'capital_planning')
    or coalesce(char_length(normalized_website), 0) > 500
    or (normalized_website is not null and normalized_website !~* '^https?://[^[:space:]]+$') then
    raise exception 'invalid_public_project_setup' using errcode = '22023';
  end if;

  -- Changed: the displayed tenant, checked for the public entry capability.
  select resolved.organization_id, resolved.organization_type
  into target_organization_id, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_id, 'origination_representation');

  insert into public.capital_projects (
    organization_id, project_name, entry_job, access_basis, status, current_phase, created_by
  ) values (
    target_organization_id, normalized_project_name, p_entry_job,
    'public_information', 'active', 'understand', caller_id
  ) returning id into project_id;

  insert into public.document_intake_sessions (
    organization_id, capital_project_id, started_by, journey, locale,
    project_name, identity_policy, privacy_status, representation_kind,
    representation_status, company_profile, company_context_received_at
  ) values (
    target_organization_id, project_id, caller_id, target_organization_type, p_locale,
    normalized_project_name, 'identified_restricted', 'public_information', null,
    'not_claimed', jsonb_strip_nulls(jsonb_build_object(
      'name', normalized_company_name,
      'website', normalized_website
    )), now()
  ) returning id into session_id;

  return session_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$function$
;

-- Replace the installed private.withdraw_provider_mandate_v1 contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.withdraw_provider_mandate_v1(p_organization_id uuid, p_mandate_id uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  org_type text;
  mandate public.provider_mandates;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.is_org_type_member(p_organization_id, array['capital_provider', 'offroad']) then
    raise exception 'provider_mandate_denied' using errcode = '42501';
  end if;
  select organization_record.organization_type into org_type
  from public.organizations organization_record where organization_record.id = p_organization_id;
  perform private.require_workspace_capability(p_organization_id, 'mandate_management');

  update public.provider_mandates set
    status = 'withdrawn',
    withdrawn_at = now(),
    withdrawn_by = (select auth.uid()),
    note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), provider_mandates.note)
  where provider_mandates.organization_id = p_organization_id
    and provider_mandates.id = p_mandate_id
    and provider_mandates.status <> 'withdrawn'
  returning * into mandate;
  if not found then
    raise exception 'provider_mandate_not_withdrawable' using errcode = 'P0002';
  end if;

  return jsonb_build_object('mandateId', mandate.id, 'status', mandate.status, 'withdrawnAt', mandate.withdrawn_at);
end;
$function$
;

-- Replace the installed private.manage_workspace_project contract, retaining all other checks.
CREATE OR REPLACE FUNCTION private.manage_workspace_project(p_session_id uuid, p_action text, p_project_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  target_organization_id uuid;
  target_organization_type text;
  session_row public.document_intake_sessions;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
begin
 perform private.require_resource_access_v1(p_session_id,'work');
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_session_id is null or p_action not in ('rename', 'archive') then
    raise exception 'invalid_project_action' using errcode = '22023';
  end if;

  -- Changed: the displayed tenant, checked for own analysis.
  select resolved.organization_id, resolved.role, resolved.organization_type
  into target_organization_id, caller_role, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_id, 'own_analysis');

  select session.*
  into session_row
  from public.document_intake_sessions session
  where session.organization_id = target_organization_id
    and session.id = p_session_id
  for update;

  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if p_action = 'rename' then
    if session_row.archived_at is not null then
      raise exception 'project_archived' using errcode = '55000';
    end if;
    if char_length(normalized_project_name) not between 2 and 80 then
      raise exception 'invalid_project_name' using errcode = '22023';
    end if;

    update public.document_intake_sessions session
    set project_name = normalized_project_name,
        updated_at = now()
    where session.organization_id = target_organization_id
      and session.id = p_session_id;

    if session_row.opportunity_id is not null then
      update public.opportunities opportunity
      set title = normalized_project_name,
          updated_at = now()
      where opportunity.organization_id = target_organization_id
        and opportunity.id = session_row.opportunity_id;
    end if;

    return jsonb_build_object('action', 'renamed', 'project_name', normalized_project_name);
  end if;

  if caller_role not in ('owner', 'admin') and session_row.started_by <> caller_id then
    raise exception 'project_archive_denied' using errcode = '42501';
  end if;
  if session_row.archived_at is not null then
    return jsonb_build_object('action', 'archived');
  end if;

  update public.document_intake_sessions session
  set status = case when session.status = 'confirmed' then session.status else 'cancelled' end,
      archived_at = now(),
      archived_by = caller_id,
      updated_at = now()
  where session.organization_id = target_organization_id
    and session.id = p_session_id;

  return jsonb_build_object('action', 'archived');
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$function$
;

create or replace function private.list_my_workspaces_v1()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',m.role,'workspace_kind',o.workspace_kind,'last_selected_at',p.last_selected_at) order by p.last_selected_at desc nulls last,o.name,o.id),'[]'::jsonb)
 from public.organization_memberships m join public.organizations o on o.id=m.organization_id
 left join public.user_workspace_preferences p on p.organization_id=m.organization_id and p.user_id=m.user_id
 where m.user_id=(select auth.uid()) and m.status='active';
$$;
comment on function private.workspace_membership_v1() is 'Current active membership selected explicitly per request; a sole membership can resolve automatically. Preferences and billing linkage never confer authority.';
comment on table private.account_organizations is 'Commercial billing linkage only; never an input to tenant content authorization.';
