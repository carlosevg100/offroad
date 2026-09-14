-- Qualified contact preparation and release, entirely inside the product. Preparation binds an
-- existing contact-free target of the qualified introduction plan to the exact pack revision the
-- recipient organization can already open. A candidate whose fit is a research hypothesis may be
-- prepared for study and can never be released. Release writes a record with the timestamp and the
-- authorizing person; it creates no delivery mechanism and promises no approval or funding.

create table public.qualified_contact_preparations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  plan_id uuid not null,
  target_id uuid not null,
  share_id uuid,
  pack_revision_id uuid,
  pack_fingerprint text,
  candidate_fit text not null check (candidate_fit in ('eligible', 'hypothesis')),
  rationale text not null check (length(trim(rationale)) between 20 and 4000),
  status text not null default 'prepared' check (status in ('prepared', 'released')),
  released_by uuid references auth.users(id) on delete restrict,
  released_at timestamptz,
  prepared_by uuid not null references auth.users(id) on delete restrict,
  prepared_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, target_id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, plan_id)
    references public.qualified_introduction_plans(organization_id, id) on delete cascade,
  foreign key (organization_id, target_id)
    references public.qualified_introduction_targets(organization_id, id) on delete cascade,
  foreign key (organization_id, share_id)
    references public.pack_distribution_shares(organization_id, id) on delete restrict,
  foreign key (organization_id, pack_revision_id)
    references public.information_pack_revisions(organization_id, id) on delete restrict,
  constraint qualified_contact_preparations_eligible_has_pack check (
    (candidate_fit = 'eligible')
      = (share_id is not null and pack_revision_id is not null and pack_fingerprint is not null)
  ),
  constraint qualified_contact_preparations_fingerprint_shape check (
    pack_fingerprint is null or pack_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint qualified_contact_preparations_release_paired check (
    (status = 'released') = (released_by is not null and released_at is not null)
  ),
  constraint qualified_contact_preparations_research_is_never_released check (
    status = 'prepared' or candidate_fit = 'eligible'
  )
);

create unique index qualified_contact_preparations_share_idx
  on public.qualified_contact_preparations (organization_id, share_id)
  where share_id is not null;
create index qualified_contact_preparations_plan_idx
  on public.qualified_contact_preparations (organization_id, plan_id, prepared_at desc);
create index qualified_contact_preparations_session_idx
  on public.qualified_contact_preparations (organization_id, intake_session_id, prepared_at desc);
create index qualified_contact_preparations_revision_idx
  on public.qualified_contact_preparations (organization_id, pack_revision_id)
  where pack_revision_id is not null;
create index qualified_contact_preparations_prepared_by_idx
  on public.qualified_contact_preparations (prepared_by);
create index qualified_contact_preparations_released_by_idx
  on public.qualified_contact_preparations (released_by) where released_by is not null;

create trigger qualified_contact_preparations_set_updated_at
  before update on public.qualified_contact_preparations
  for each row execute function private.set_updated_at();
create trigger qualified_contact_preparations_audit
  after insert or update or delete on public.qualified_contact_preparations
  for each row execute function private.capture_audit_event();

alter table public.qualified_contact_preparations enable row level security;
alter table public.qualified_contact_preparations force row level security;

create policy qualified_contact_preparations_select
  on public.qualified_contact_preparations for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

revoke all privileges on public.qualified_contact_preparations from public, anon, authenticated;
grant select on public.qualified_contact_preparations to authenticated;

create or replace function private.prepare_qualified_contact(
  p_target_id uuid,
  p_share_id uuid,
  p_candidate_fit text,
  p_rationale text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target public.qualified_introduction_targets;
  plan public.qualified_introduction_plans;
  share_row public.pack_distribution_shares;
  revision public.information_pack_revisions;
  existing public.qualified_contact_preparations;
  preparation_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_candidate_fit not in ('eligible', 'hypothesis') then
    raise exception 'qualified_contact_fit_invalid' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_rationale, ''))) not between 20 and 4000 then
    raise exception 'qualified_contact_rationale_required' using errcode = '22023';
  end if;

  select row.* into target
  from public.qualified_introduction_targets row
  where row.id = p_target_id
  for share;
  if not found then
    raise exception 'qualified_introduction_target_not_found' using errcode = 'P0002';
  end if;
  if not (select private.can_access_intake_session(target.organization_id, target.intake_session_id)) then
    raise exception 'qualified_contact_forbidden' using errcode = '42501';
  end if;

  select row.* into plan
  from public.qualified_introduction_plans row
  where row.organization_id = target.organization_id and row.id = target.plan_id
  for share;
  if not found or plan.status = 'revoked' then
    raise exception 'qualified_introduction_plan_not_found' using errcode = 'P0002';
  end if;

  if p_candidate_fit = 'hypothesis' then
    if p_share_id is not null then
      raise exception 'research_hypothesis_is_never_shared' using errcode = '22023';
    end if;
  else
    select row.* into share_row
    from public.pack_distribution_shares row
    where row.organization_id = target.organization_id
      and row.id = p_share_id
      and row.intake_session_id = target.intake_session_id
      and row.status = 'active'
      and row.delivery_state = 'available'
    for share;
    if not found then
      raise exception 'authorized_pack_share_required' using errcode = '22023';
    end if;
    if not exists (
      select 1
      from public.pack_distribution_authorizations authorization_row
      where authorization_row.organization_id = share_row.organization_id
        and authorization_row.id = share_row.authorization_id
        and authorization_row.status = 'active'
    ) then
      raise exception 'authorized_pack_share_required' using errcode = '22023';
    end if;
    select row.* into revision
    from public.information_pack_revisions row
    where row.organization_id = share_row.organization_id and row.id = share_row.pack_revision_id;
  end if;

  select row.* into existing
  from public.qualified_contact_preparations row
  where row.organization_id = target.organization_id and row.target_id = target.id
  for update;
  if found then
    if existing.status = 'released' then
      raise exception 'qualified_contact_already_released' using errcode = '55000';
    end if;
    update public.qualified_contact_preparations
    set share_id = share_row.id,
        pack_revision_id = revision.id,
        pack_fingerprint = revision.pack_fingerprint,
        candidate_fit = p_candidate_fit,
        rationale = trim(p_rationale)
    where organization_id = existing.organization_id and id = existing.id;
    return existing.id;
  end if;

  insert into public.qualified_contact_preparations (
    organization_id, intake_session_id, plan_id, target_id, share_id,
    pack_revision_id, pack_fingerprint, candidate_fit, rationale, prepared_by
  ) values (
    target.organization_id, target.intake_session_id, plan.id, target.id, share_row.id,
    revision.id, revision.pack_fingerprint, p_candidate_fit, trim(p_rationale), actor_id
  ) returning id into preparation_id;

  return preparation_id;
end;
$$;

-- The release is the qualified introduction itself, recorded inside the product. It changes a
-- status and writes who and when. No message, no file transfer and no external call happen here.
create or replace function private.release_qualified_contact(
  p_preparation_id uuid,
  p_pack_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  preparation public.qualified_contact_preparations;
  plan public.qualified_introduction_plans;
  share_row public.pack_distribution_shares;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select row.* into preparation
  from public.qualified_contact_preparations row
  where row.id = p_preparation_id
  for update;
  if not found then
    raise exception 'qualified_contact_preparation_not_found' using errcode = 'P0002';
  end if;
  if not (select private.can_access_intake_session(preparation.organization_id, preparation.intake_session_id)) then
    raise exception 'qualified_contact_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = preparation.organization_id
      and membership.user_id = actor_id
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then
    raise exception 'qualified_contact_release_role_required' using errcode = '42501';
  end if;
  if preparation.status = 'released' then
    if preparation.pack_fingerprint is distinct from p_pack_fingerprint then
      raise exception 'qualified_contact_pack_changed' using errcode = '22023';
    end if;
    return preparation.id;
  end if;
  if preparation.candidate_fit <> 'eligible' then
    raise exception 'research_hypothesis_is_never_introduced' using errcode = '22023';
  end if;
  if preparation.pack_fingerprint is distinct from p_pack_fingerprint then
    raise exception 'qualified_contact_pack_changed' using errcode = '22023';
  end if;

  select row.* into plan
  from public.qualified_introduction_plans row
  where row.organization_id = preparation.organization_id and row.id = preparation.plan_id
  for share;
  if not found or plan.status <> 'authorized' then
    raise exception 'authorized_qualified_introduction_plan_required' using errcode = '42501';
  end if;

  select row.* into share_row
  from public.pack_distribution_shares row
  where row.organization_id = preparation.organization_id
    and row.id = preparation.share_id
    and row.status = 'active'
    and row.delivery_state = 'available'
  for share;
  if not found then
    raise exception 'authorized_pack_share_required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.pack_distribution_authorizations authorization_row
    where authorization_row.organization_id = share_row.organization_id
      and authorization_row.id = share_row.authorization_id
      and authorization_row.status = 'active'
      and authorization_row.pack_fingerprint = preparation.pack_fingerprint
  ) then
    raise exception 'authorized_pack_share_required' using errcode = '42501';
  end if;

  update public.qualified_contact_preparations
  set status = 'released', released_by = actor_id, released_at = now()
  where organization_id = preparation.organization_id and id = preparation.id;

  return preparation.id;
end;
$$;

create or replace function public.prepare_qualified_contact(
  p_target_id uuid,
  p_candidate_fit text,
  p_rationale text,
  p_share_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.prepare_qualified_contact(p_target_id, p_share_id, p_candidate_fit, p_rationale);
$$;

create or replace function public.release_qualified_contact(
  p_preparation_id uuid,
  p_pack_fingerprint text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.release_qualified_contact(p_preparation_id, p_pack_fingerprint);
$$;

revoke all on function private.prepare_qualified_contact(uuid, uuid, text, text) from public, anon;
revoke all on function private.release_qualified_contact(uuid, text) from public, anon;
revoke all on function public.prepare_qualified_contact(uuid, text, text, uuid) from public, anon;
revoke all on function public.release_qualified_contact(uuid, text) from public, anon;
grant execute on function private.prepare_qualified_contact(uuid, uuid, text, text) to authenticated;
grant execute on function private.release_qualified_contact(uuid, text) to authenticated;
grant execute on function public.prepare_qualified_contact(uuid, text, text, uuid) to authenticated;
grant execute on function public.release_qualified_contact(uuid, text) to authenticated;

comment on table public.qualified_contact_preparations is
  'Preparation and in-product release of a qualified introduction bound to an exact pack revision. A research hypothesis is prepared for study and never released.';
comment on function public.release_qualified_contact(uuid, text) is
  'Records the qualified introduction inside the product with its timestamp and authorizing person. It creates no delivery mechanism and implies no approval or funding.';
