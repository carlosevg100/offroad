-- Internal shortlist planning must not depend on an active external-distribution policy.
-- The policy limits an authorized contact wave later; it does not prevent the borrower from
-- reviewing mandate fit or Offroad from preparing a private recipient plan.

create or replace function private.prepare_qualified_introduction_plan(
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
  policy_wave_limit integer;
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

  select row.wave_limit into policy_wave_limit
  from public.market_distribution_policies row
  where row.status = 'active'
    and row.valid_from <= current_date
    and (row.valid_until is null or row.valid_until >= current_date)
  order by row.valid_from desc
  limit 1;

  select count(distinct selected.provider_id)
  into selected_count
  from jsonb_array_elements_text(match_screen.payload #> '{approval,selectedProviderIds}')
    selected(provider_id);
  if selected_count not between 1 and 20 then
    raise exception 'qualified_introduction_shortlist_invalid' using errcode = '22023';
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
    coalesce(policy_wave_limit, 20),
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

comment on function private.prepare_qualified_introduction_plan(uuid, uuid, text) is
  'Compiles a private target plan from an approved shortlist. An active distribution policy is required only before external authorization.';
