-- Offroad wave 1A: provenance never grants permanent organization authority.
-- Existing active ownership is preserved. No membership is backfilled or reactivated.

create or replace function private.can_manage_organization(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_organization_id and m.user_id=(select auth.uid())
      and m.status='active' and m.role in ('owner','admin')
  );
$$;

create function private.can_assign_organization_role_v1(p_organization_id uuid, p_role text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_role in ('admin','member','analyst','relationship_manager','compliance')
    and exists (
      select 1 from public.organization_memberships actor
      where actor.organization_id=p_organization_id and actor.user_id=(select auth.uid())
        and actor.status='active'
        and (actor.role='owner' or (actor.role='admin' and p_role<>'admin'))
    );
$$;

create function private.can_administer_membership_v1(p_organization_id uuid, p_user_id uuid, p_role text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id<>(select auth.uid())
    and private.can_assign_organization_role_v1(p_organization_id,p_role)
    and not exists (
      select 1 from public.organization_memberships target
      where target.organization_id=p_organization_id and target.user_id=p_user_id
        and (target.role='owner' or (target.role='admin' and not exists (
          select 1 from public.organization_memberships actor
          where actor.organization_id=p_organization_id and actor.user_id=(select auth.uid())
            and actor.role='owner' and actor.status='active'
        )))
    );
$$;

-- Row policies retain customer administration of non-owner memberships. Identity
-- columns cannot be rewritten, and ownership is changed only by the bounded RPC.
drop policy if exists memberships_insert_authorized on public.organization_memberships;
drop policy if exists memberships_insert_admin on public.organization_memberships;
drop policy if exists memberships_insert_creator_owner on public.organization_memberships;
drop policy if exists memberships_update_admin on public.organization_memberships;
drop policy if exists memberships_delete_admin on public.organization_memberships;
create policy memberships_insert_authorized on public.organization_memberships
  for insert to authenticated
  with check ((select private.can_administer_membership_v1(organization_id,user_id,role)));
create policy memberships_update_admin on public.organization_memberships
  for update to authenticated
  using ((select private.can_administer_membership_v1(organization_id,user_id,role)))
  with check ((select private.can_administer_membership_v1(organization_id,user_id,role)));
create policy memberships_delete_admin on public.organization_memberships
  for delete to authenticated
  using ((select private.can_administer_membership_v1(organization_id,user_id,role)));
revoke update on public.organization_memberships from authenticated;
grant update(role,status) on public.organization_memberships to authenticated;

drop policy if exists organization_invites_manage on public.organization_invites;
create policy organization_invites_manage on public.organization_invites for all to authenticated
  using ((select private.can_assign_organization_role_v1(organization_id,role)))
  with check ((select private.can_assign_organization_role_v1(organization_id,role))
    and invited_by=(select auth.uid()));

-- A revoked creator cannot read organization metadata or recreate an owner row.
drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member on public.organizations for select to authenticated
  using ((select private.is_org_member(id)));
drop policy if exists organizations_insert_creator on public.organizations;
revoke insert on public.organizations from authenticated;

create function private.capture_organization_authority_event_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values (
    case when tg_op='DELETE' then old.organization_id else new.organization_id end,
    auth.uid(),'organization_membership_'||lower(tg_op),'organization_memberships',
    (case when tg_op='DELETE' then old.user_id else new.user_id end)::text,
    jsonb_build_object(
      'previous_role',case when tg_op='INSERT' then null else old.role end,
      'role',case when tg_op='DELETE' then null else new.role end,
      'previous_status',case when tg_op='INSERT' then null else old.status end,
      'status',case when tg_op='DELETE' then null else new.status end
    )
  );
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger organization_memberships_authority_audit
  after insert or update or delete on public.organization_memberships
  for each row execute function private.capture_organization_authority_event_v1();

create function private.create_organization_with_owner_v1(
  p_organization_type text, p_name text, p_legal_name text default null,
  p_country_code text default 'BR', p_website text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  result_id uuid;
begin
  if actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_organization_type is null or p_organization_type not in ('company','originator','capital_provider') then
    raise exception 'invalid_organization_type' using errcode='22023';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 160
    or char_length(p_legal_name)>320 or char_length(p_website)>2048
    or (p_country_code is not null and upper(p_country_code)!~'^[A-Z]{2}$') then
    raise exception 'invalid_organization_details' using errcode='22023';
  end if;
  insert into public.organizations(organization_type,name,legal_name,country_code,website,created_by)
  values(p_organization_type,btrim(p_name),nullif(btrim(p_legal_name),''),upper(p_country_code),nullif(btrim(p_website),''),actor)
  returning id into result_id;
  insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
  values(result_id,actor,'owner','active',now());
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(result_id,actor,'organization_created','organizations',result_id::text,'{}');
  return result_id;
end;
$$;

create function public.create_organization_with_owner_v1(
  p_organization_type text, p_name text, p_legal_name text default null,
  p_country_code text default 'BR', p_website text default null
)
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_organization_with_owner_v1(p_organization_type,p_name,p_legal_name,p_country_code,p_website);
$$;

create function private.transfer_organization_owner_v1(p_organization_id uuid,p_new_owner_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target_role text; target_status text;
begin
  if actor is null or not exists (
    select 1 from public.organization_memberships m where m.organization_id=p_organization_id
      and m.user_id=actor and m.role='owner' and m.status='active'
  ) then raise exception 'organization_owner_required' using errcode='42501'; end if;
  if p_new_owner_user_id is null or p_new_owner_user_id=actor then
    raise exception 'invalid_owner_recipient' using errcode='22023';
  end if;
  -- Serialize transfers within one organization without blocking FK KEY SHARE
  -- checks used by membership/audit inserts in concurrent administration.
  perform 1 from public.organizations where id=p_organization_id for no key update;
  perform 1 from public.organization_memberships m where m.organization_id=p_organization_id
    and m.user_id=actor and m.role='owner' and m.status='active' for update;
  if not found then raise exception 'organization_owner_required' using errcode='42501'; end if;
  select m.role,m.status into target_role,target_status from public.organization_memberships m
  where m.organization_id=p_organization_id and m.user_id=p_new_owner_user_id for update;
  if not found or target_status<>'active' then
    raise exception 'active_owner_recipient_required' using errcode='42501';
  end if;
  -- Promote first; the transaction never even transiently has zero owners.
  update public.organization_memberships set role='owner'
  where organization_id=p_organization_id and user_id=p_new_owner_user_id;
  update public.organization_memberships set role='admin'
  where organization_id=p_organization_id and user_id=actor;
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(p_organization_id,actor,'organization_owner_transferred','organizations',p_organization_id::text,
    jsonb_build_object('previous_owner_user_id',actor,'owner_user_id',p_new_owner_user_id));
  return p_organization_id;
end;
$$;

create function public.transfer_organization_owner_v1(p_organization_id uuid,p_new_owner_user_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.transfer_organization_owner_v1(p_organization_id,p_new_owner_user_id);
$$;

-- Existing registration callers retain their contract and use the same bootstrap.
create or replace function public.initialize_professional_onboarding(
  p_journey text,
  p_full_name text,
  p_job_title text default null,
  p_locale text default 'pt-BR'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
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

  select membership.organization_id
  into organization_id
  from public.organization_memberships membership
  where membership.user_id = actor_id
    and membership.status = 'active'
  order by membership.created_at
  limit 1;

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
$$;

create or replace function public.complete_onboarding(
  p_journey text,
  p_name text,
  p_legal_name text default null,
  p_country_code text default 'BR',
  p_website text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
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

  organization_id := private.create_organization_with_owner_v1(
    p_journey,p_name,p_legal_name,p_country_code,p_website
  );

  insert into public.onboarding_progress (
    organization_id,
    user_id,
    journey,
    current_step,
    answers,
    completed_at
  ) values (
    organization_id,
    actor_id,
    p_journey,
    'complete',
    jsonb_build_object('country_code', upper(p_country_code)),
    now()
  );

  return organization_id;
end;
$$;

revoke all on function private.can_assign_organization_role_v1(uuid,text) from public,anon,service_role;
revoke all on function private.can_administer_membership_v1(uuid,uuid,text) from public,anon,service_role;
revoke all on function private.capture_organization_authority_event_v1() from public,anon,authenticated,service_role;
revoke all on function private.create_organization_with_owner_v1(text,text,text,text,text) from public,anon,service_role;
revoke all on function public.create_organization_with_owner_v1(text,text,text,text,text) from public,anon,service_role;
revoke all on function private.transfer_organization_owner_v1(uuid,uuid) from public,anon,service_role;
revoke all on function public.transfer_organization_owner_v1(uuid,uuid) from public,anon,service_role;
grant execute on function private.can_assign_organization_role_v1(uuid,text) to authenticated;
grant execute on function private.can_administer_membership_v1(uuid,uuid,text) to authenticated;
grant execute on function private.create_organization_with_owner_v1(text,text,text,text,text) to authenticated;
grant execute on function public.create_organization_with_owner_v1(text,text,text,text,text) to authenticated;
grant execute on function private.transfer_organization_owner_v1(uuid,uuid) to authenticated;
grant execute on function public.transfer_organization_owner_v1(uuid,uuid) to authenticated;

comment on function private.can_manage_organization(uuid) is
  'Active owner/admin membership is the only organization-management authority. created_by is provenance.';
comment on function public.create_organization_with_owner_v1(text,text,text,text,text) is
  'Atomic self-service bootstrap: a fresh organization and its authenticated active owner, never an existing organization.';
comment on function public.transfer_organization_owner_v1(uuid,uuid) is
  'Active owner transfers their ownership to an active member under an organization lock; previous owner becomes admin.';
