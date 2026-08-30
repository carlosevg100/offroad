-- The approved shortlist and the plan that may later be authorized are separate decisions.
-- This migration compiles the former into a private, exact, contact-free target plan. It does
-- not resolve contacts, authorize distribution or create an introduction.

alter table public.qualified_introduction_plans
  add column match_screen_fingerprint text
    check (match_screen_fingerprint is null or match_screen_fingerprint ~ '^[0-9a-f]{64}$');

create unique index qualified_introduction_plans_match_screen_idx
  on public.qualified_introduction_plans (organization_id, intake_session_id, match_screen_fingerprint)
  where match_screen_fingerprint is not null;

create table public.qualified_introduction_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  plan_id uuid not null,
  match_screen_fingerprint text not null check (match_screen_fingerprint ~ '^[0-9a-f]{64}$'),
  provider_id uuid not null,
  provider_source text not null check (provider_source in ('directory', 'registered')),
  provider_kind text not null check (provider_kind in (
    'fidc', 'credit_fund', 'securitizadora', 'bank', 'family_office', 'multi_strategy',
    'factoring', 'development_agency', 'finance_company', 'alternative_lender', 'other', 'unknown'
  )),
  provider_name text not null check (length(trim(provider_name)) between 2 and 300),
  fund_directory_id uuid references public.fund_directory (id),
  provider_organization_id uuid,
  provider_fund_id uuid,
  mandate_fingerprint text not null check (mandate_fingerprint ~ '^[0-9a-f]{64}$'),
  rationale text not null check (length(trim(rationale)) between 1 and 4000),
  position integer not null check (position between 1 and 20),
  contact_status text not null default 'unresolved'
    check (contact_status in ('unresolved', 'resolved', 'unavailable')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, plan_id, provider_source, provider_id),
  unique (organization_id, plan_id, position),
  foreign key (organization_id, plan_id)
    references public.qualified_introduction_plans (organization_id, id) on delete cascade,
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade,
  foreign key (provider_organization_id, provider_fund_id)
    references public.funds (organization_id, id),
  check (
    (provider_source = 'directory'
      and fund_directory_id = provider_id
      and provider_organization_id is null
      and provider_fund_id is null)
    or
    (provider_source = 'registered'
      and fund_directory_id is null
      and provider_organization_id is not null
      and provider_fund_id = provider_id)
  )
);

create index qualified_introduction_targets_plan_idx
  on public.qualified_introduction_targets (organization_id, plan_id, position);
create index qualified_introduction_targets_directory_idx
  on public.qualified_introduction_targets (fund_directory_id)
  where fund_directory_id is not null;
create index qualified_introduction_targets_registered_idx
  on public.qualified_introduction_targets (provider_organization_id, provider_fund_id)
  where provider_fund_id is not null;

create trigger qualified_introduction_targets_set_updated_at
before update on public.qualified_introduction_targets
for each row execute function private.set_updated_at();

create trigger qualified_introduction_targets_audit
after insert or update or delete on public.qualified_introduction_targets
for each row execute function private.capture_audit_event();

alter table public.qualified_introduction_targets enable row level security;
alter table public.qualified_introduction_targets force row level security;

create policy qualified_introduction_targets_select
on public.qualified_introduction_targets
for select to authenticated
using ((select private.can_access_intake_session(organization_id, intake_session_id)));

revoke all on public.qualified_introduction_targets from public, anon, authenticated;
grant select on public.qualified_introduction_targets to authenticated;

create function private.prepare_qualified_introduction_plan(
  p_organization_id uuid,
  p_session_id uuid,
  p_match_screen_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  match_screen public.deal_state_objects;
  session_row public.document_intake_sessions;
  policy public.market_distribution_policies;
  plan_id uuid;
  selected_count integer;
  inserted_count integer;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'qualified_introduction_plan_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = actor_id
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then
    raise exception 'qualified_introduction_plan_role_required' using errcode = '42501';
  end if;

  select row.* into match_screen
  from public.deal_state_objects row
  where row.organization_id = p_organization_id
    and row.intake_session_id = p_session_id
    and row.object_type = 'match_screen'
    and row.object_fingerprint = p_match_screen_fingerprint
    and row.status = 'approved'
    and row.superseded_at is null
  order by row.object_version desc
  limit 1;
  if not found then
    raise exception 'approved_match_screen_required' using errcode = '22023';
  end if;
  if match_screen.payload ->> 'schemaVersion' <> '2026.08.29-v3'
    or match_screen.payload #>> '{approval,scope}' <> 'match_shortlist_only'
    or jsonb_typeof(match_screen.payload #> '{approval,selectedProviderIds}') <> 'array'
  then
    raise exception 'governed_match_screen_required' using errcode = '22023';
  end if;

  select row.* into session_row
  from public.document_intake_sessions row
  where row.organization_id = p_organization_id and row.id = p_session_id
  for update;
  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;

  select row.* into policy
  from public.market_distribution_policies row
  where row.status = 'active'
    and row.valid_from <= current_date
    and (row.valid_until is null or row.valid_until >= current_date)
  order by row.valid_from desc
  limit 1;
  if not found then
    raise exception 'active_market_distribution_policy_required' using errcode = '22023';
  end if;

  select count(distinct selected.provider_id)
  into selected_count
  from jsonb_array_elements_text(match_screen.payload #> '{approval,selectedProviderIds}')
    selected(provider_id);
  if selected_count < 1 or selected_count > policy.wave_limit then
    raise exception 'qualified_introduction_wave_invalid' using errcode = '22023';
  end if;

  select row.id into plan_id
  from public.qualified_introduction_plans row
  where row.organization_id = p_organization_id
    and row.intake_session_id = p_session_id
    and row.match_screen_fingerprint = p_match_screen_fingerprint
  limit 1;
  if found then
    return plan_id;
  end if;

  insert into public.qualified_introduction_plans (
    organization_id,
    intake_session_id,
    case_fingerprint,
    material_fingerprint,
    match_screen_fingerprint,
    wave_limit,
    identity_policy,
    status,
    created_by
  ) values (
    p_organization_id,
    p_session_id,
    match_screen.input_fingerprint,
    match_screen.payload ->> 'materialArtifactFingerprint',
    p_match_screen_fingerprint,
    policy.wave_limit,
    session_row.identity_policy,
    'draft',
    actor_id
  )
  returning id into plan_id;

  insert into public.qualified_introduction_targets (
    organization_id,
    intake_session_id,
    plan_id,
    match_screen_fingerprint,
    provider_id,
    provider_source,
    provider_kind,
    provider_name,
    fund_directory_id,
    provider_organization_id,
    provider_fund_id,
    mandate_fingerprint,
    rationale,
    position,
    created_by
  )
  select
    p_organization_id,
    p_session_id,
    plan_id,
    p_match_screen_fingerprint,
    selected.provider_id::uuid,
    candidate.value ->> 'providerSource',
    candidate.value ->> 'providerKind',
    candidate.value ->> 'providerName',
    nullif(candidate.value ->> 'fundDirectoryId', '')::uuid,
    nullif(candidate.value ->> 'providerOrganizationId', '')::uuid,
    nullif(candidate.value ->> 'providerFundId', '')::uuid,
    candidate.value ->> 'mandateFingerprint',
    candidate.value ->> 'rationale',
    selected.position::integer,
    actor_id
  from jsonb_array_elements_text(match_screen.payload #> '{approval,selectedProviderIds}')
    with ordinality selected(provider_id, position)
  join lateral (
    select item.value
    from jsonb_array_elements(match_screen.payload -> 'candidates') item(value)
    where item.value ->> 'providerId' = selected.provider_id
      and coalesce((item.value ->> 'eligibleForShortlist')::boolean, false)
    limit 1
  ) candidate on true;

  get diagnostics inserted_count = row_count;
  if inserted_count <> selected_count then
    raise exception 'selected_match_candidate_changed' using errcode = '22023';
  end if;

  return plan_id;
end;
$$;

create function private.approve_match_shortlist_and_prepare_plan(
  p_organization_id uuid,
  p_session_id uuid,
  p_match_screen_fingerprint text,
  p_selected_provider_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_screen_id uuid;
  approved_match_screen_fingerprint text;
  plan_id uuid;
begin
  match_screen_id := private.approve_match_shortlist(
    p_organization_id,
    p_session_id,
    p_match_screen_fingerprint,
    p_selected_provider_ids
  );
  select row.object_fingerprint into approved_match_screen_fingerprint
  from public.deal_state_objects row
  where row.id = match_screen_id;
  plan_id := private.prepare_qualified_introduction_plan(
    p_organization_id,
    p_session_id,
    approved_match_screen_fingerprint
  );
  return jsonb_build_object('match_screen_id', match_screen_id, 'plan_id', plan_id);
end;
$$;

revoke all on function private.prepare_qualified_introduction_plan(uuid, uuid, text)
  from public, anon;
revoke all on function private.approve_match_shortlist_and_prepare_plan(uuid, uuid, text, text[])
  from public, anon;
grant execute on function private.prepare_qualified_introduction_plan(uuid, uuid, text)
  to authenticated;
grant execute on function private.approve_match_shortlist_and_prepare_plan(uuid, uuid, text, text[])
  to authenticated;

create function public.prepare_qualified_introduction_plan(
  p_organization_id uuid,
  p_session_id uuid,
  p_match_screen_fingerprint text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.prepare_qualified_introduction_plan(
    p_organization_id,
    p_session_id,
    p_match_screen_fingerprint
  );
$$;

create function public.approve_match_shortlist_and_prepare_plan(
  p_organization_id uuid,
  p_session_id uuid,
  p_match_screen_fingerprint text,
  p_selected_provider_ids text[]
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.approve_match_shortlist_and_prepare_plan(
    p_organization_id,
    p_session_id,
    p_match_screen_fingerprint,
    p_selected_provider_ids
  );
$$;

revoke all on function public.prepare_qualified_introduction_plan(uuid, uuid, text)
  from public, anon;
revoke all on function public.approve_match_shortlist_and_prepare_plan(uuid, uuid, text, text[])
  from public, anon;
grant execute on function public.prepare_qualified_introduction_plan(uuid, uuid, text)
  to authenticated;
grant execute on function public.approve_match_shortlist_and_prepare_plan(uuid, uuid, text, text[])
  to authenticated;

comment on table public.qualified_introduction_targets is
  'Contact-free targets compiled from the exact approved match screen. A target is not a recipient, an authorization or an introduction.';
comment on function public.approve_match_shortlist_and_prepare_plan(uuid, uuid, text, text[]) is
  'Approves an internal shortlist and atomically prepares a private target plan. It never resolves contacts or authorizes market contact.';
