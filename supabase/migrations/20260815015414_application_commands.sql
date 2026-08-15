-- Atomic application commands. These functions are security invoker and remain subject to RLS.

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

  insert into public.organizations (
    organization_type,
    name,
    legal_name,
    country_code,
    website,
    created_by
  ) values (
    p_journey,
    trim(p_name),
    nullif(trim(p_legal_name), ''),
    upper(p_country_code),
    nullif(trim(p_website), ''),
    actor_id
  )
  returning id into organization_id;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    joined_at
  ) values (
    organization_id,
    actor_id,
    'owner',
    'active',
    now()
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

create or replace function public.create_opportunity_intake(
  p_organization_id uuid,
  p_legal_name text,
  p_sector text,
  p_purpose text,
  p_requested_amount numeric,
  p_currency text,
  p_desired_term_months integer,
  p_output_locale text default 'pt-BR'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  company_id uuid;
  request_id uuid;
  opportunity_id uuid;
  normalized_currency text := upper(p_currency);
  fingerprint bytea;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not (select private.is_org_member(p_organization_id)) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  if p_requested_amount <= 0 or p_desired_term_months not between 1 and 360 then
    raise exception 'invalid_economic_input' using errcode = '22023';
  end if;

  fingerprint := extensions.digest(
    concat_ws(
      '|',
      p_organization_id::text,
      lower(trim(p_legal_name)),
      lower(trim(p_purpose)),
      p_requested_amount::text,
      normalized_currency,
      p_desired_term_months::text
    ),
    'sha256'
  );

  insert into public.companies (
    organization_id,
    legal_name,
    display_name,
    jurisdiction_code,
    sector,
    reporting_currency,
    created_by
  ) values (
    p_organization_id,
    trim(p_legal_name),
    trim(p_legal_name),
    'BR',
    nullif(trim(p_sector), ''),
    normalized_currency,
    actor_id
  )
  returning id into company_id;

  insert into public.capital_requests (
    organization_id,
    company_id,
    purpose,
    requested_amount,
    currency,
    desired_term_months,
    output_locale,
    status,
    created_by
  ) values (
    p_organization_id,
    company_id,
    trim(p_purpose),
    p_requested_amount,
    normalized_currency,
    p_desired_term_months,
    p_output_locale,
    'submitted',
    actor_id
  )
  returning id into request_id;

  insert into public.opportunities (
    organization_id,
    company_id,
    capital_request_id,
    title,
    purpose,
    requested_amount,
    currency,
    fingerprint_hash,
    lead_user_id,
    created_by
  ) values (
    p_organization_id,
    company_id,
    request_id,
    trim(p_legal_name) || ' · ' || trim(p_purpose),
    trim(p_purpose),
    p_requested_amount,
    normalized_currency,
    fingerprint,
    actor_id,
    actor_id
  )
  returning id into opportunity_id;

  return opportunity_id;
end;
$$;

revoke all on function public.complete_onboarding(text, text, text, text, text) from public;
revoke all on function public.create_opportunity_intake(uuid, text, text, text, numeric, text, integer, text) from public;
grant execute on function public.complete_onboarding(text, text, text, text, text) to authenticated;
grant execute on function public.create_opportunity_intake(uuid, text, text, text, numeric, text, integer, text) to authenticated;
