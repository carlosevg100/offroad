-- Preserve distinct professional functions in onboarding and durable user context.
-- These functions change the analysis posture and deliverable, but never narrow the company-first
-- alternative universe.

alter table public.professional_context_profiles
  drop constraint if exists professional_context_role_valid;

alter table public.professional_context_profiles
  add constraint professional_context_role_valid check (
    professional_role is null or professional_role in (
      'cfo_treasury', 'corporate_finance', 'fp_and_a', 'controller_accounting',
      'dcm_banker', 'corporate_banker', 'relationship_manager',
      'structured_finance_banker', 'project_finance_banker', 'syndicate_distribution',
      'advisor', 'investor_lender', 'portfolio_manager', 'credit_analyst',
      'risk_underwriter', 'investment_committee', 'legal_structuring', 'board_shareholder',
      'analyst', 'executive', 'other'
    )
  );

create or replace function public.save_professional_capability_context_v1(
  p_organization_id uuid,
  p_affiliation_kind text default null,
  p_professional_role text default null,
  p_team_name text default null,
  p_primary_objectives text[] default '{}',
  p_institution_name text default null,
  p_operating_models text[] default '{}',
  p_product_families text[] default '{}',
  p_capability_notes text default null,
  p_skip boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  computed_status text;
  normalized_affiliation text := nullif(trim(p_affiliation_kind), '');
  normalized_role text := nullif(trim(p_professional_role), '');
  normalized_team text := nullif(trim(p_team_name), '');
  normalized_institution text := nullif(trim(p_institution_name), '');
  normalized_notes text := nullif(trim(p_capability_notes), '');
  normalized_objectives text[] := coalesce(p_primary_objectives, '{}');
  normalized_models text[] := coalesce(p_operating_models, '{}');
  normalized_products text[] := coalesce(p_product_families, '{}');
  has_institution_context boolean;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.is_org_member(p_organization_id)) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;
  if normalized_affiliation is not null and normalized_affiliation not in (
    'company', 'bank', 'advisory', 'asset_manager', 'credit_fund', 'family_office', 'independent', 'other'
  ) then raise exception 'invalid_affiliation_kind' using errcode = '22023'; end if;
  if normalized_role is not null and normalized_role not in (
    'cfo_treasury', 'corporate_finance', 'fp_and_a', 'controller_accounting',
    'dcm_banker', 'corporate_banker', 'relationship_manager',
    'structured_finance_banker', 'project_finance_banker', 'syndicate_distribution',
    'advisor', 'investor_lender', 'portfolio_manager', 'credit_analyst',
    'risk_underwriter', 'investment_committee', 'legal_structuring', 'board_shareholder',
    'analyst', 'executive', 'other'
  ) then raise exception 'invalid_professional_role' using errcode = '22023'; end if;
  if not normalized_objectives <@ array[
    'understand_company', 'prepare_meetings', 'originate_ideas', 'evaluate_capital_options',
    'structure_transactions', 'prepare_materials', 'connect_capital', 'analyze_investments'
  ]::text[] or cardinality(normalized_objectives) > 8 then
    raise exception 'invalid_primary_objectives' using errcode = '22023';
  end if;
  if not normalized_models <@ array[
    'raise_capital', 'balance_sheet_lending', 'structuring', 'distribution', 'advisory', 'investing'
  ]::text[] or cardinality(normalized_models) > 6 then
    raise exception 'invalid_operating_models' using errcode = '22023';
  end if;
  if not normalized_products <@ array[
    'bilateral_credit', 'club_syndicated', 'capital_markets', 'securitization', 'asset_backed',
    'project_acquisition_finance', 'trade_export_agri', 'structured_flexible_capital',
    'special_situations', 'derivatives_hedging'
  ]::text[] or cardinality(normalized_products) > 10 then
    raise exception 'invalid_product_families' using errcode = '22023';
  end if;

  if p_skip then
    computed_status := 'skipped';
    normalized_affiliation := null;
    normalized_role := null;
    normalized_team := null;
    normalized_institution := null;
    normalized_notes := null;
    normalized_objectives := '{}';
    normalized_models := '{}';
    normalized_products := '{}';
  elsif normalized_role is not null and cardinality(normalized_models) > 0 and cardinality(normalized_objectives) > 0 then
    computed_status := 'complete';
  else
    computed_status := 'partial';
  end if;

  insert into public.professional_context_profiles (
    organization_id, user_id, affiliation_kind, professional_role, team_name, institution_name,
    operating_models, product_families, primary_objectives, context_notes,
    disclosure_status, last_confirmed_at
  ) values (
    p_organization_id, actor_id, normalized_affiliation, normalized_role, normalized_team, normalized_institution,
    normalized_models, normalized_products, normalized_objectives, normalized_notes, computed_status,
    case when computed_status = 'complete' then now() else null end
  )
  on conflict (organization_id, user_id) do update set
    affiliation_kind = excluded.affiliation_kind,
    professional_role = excluded.professional_role,
    team_name = excluded.team_name,
    institution_name = excluded.institution_name,
    operating_models = excluded.operating_models,
    product_families = excluded.product_families,
    primary_objectives = excluded.primary_objectives,
    context_notes = excluded.context_notes,
    disclosure_status = excluded.disclosure_status,
    last_confirmed_at = excluded.last_confirmed_at;

  has_institution_context := normalized_institution is not null
    or normalized_affiliation is not null
    or cardinality(normalized_models) > 0
    or cardinality(normalized_products) > 0
    or normalized_notes is not null;
  if has_institution_context and (select private.can_manage_organization(p_organization_id)) then
    insert into public.institution_capability_profiles (
      organization_id, institution_name, institution_kind, operating_models, product_families,
      capability_notes, source_kind, disclosure_status, last_confirmed_at, updated_by
    ) values (
      p_organization_id, normalized_institution, normalized_affiliation, normalized_models,
      normalized_products, normalized_notes, 'self_declared', computed_status,
      case when computed_status = 'complete' then now() else null end, actor_id
    )
    on conflict (organization_id) do update set
      institution_name = excluded.institution_name,
      institution_kind = excluded.institution_kind,
      operating_models = excluded.operating_models,
      product_families = excluded.product_families,
      capability_notes = excluded.capability_notes,
      source_kind = case
        when public.institution_capability_profiles.source_kind = 'public_observed' then 'mixed'
        else excluded.source_kind
      end,
      disclosure_status = excluded.disclosure_status,
      last_confirmed_at = excluded.last_confirmed_at,
      updated_by = excluded.updated_by;
  end if;

  update public.onboarding_progress
  set answers = coalesce(answers, '{}'::jsonb) || jsonb_build_object(
    'professional_context', jsonb_build_object('status', computed_status, 'updated_at', now())
  )
  where organization_id = p_organization_id and user_id = actor_id;

  return jsonb_build_object(
    'status', computed_status,
    'professional_role', normalized_role,
    'institution_name', normalized_institution,
    'operating_models', to_jsonb(normalized_models),
    'primary_objectives', to_jsonb(normalized_objectives)
  );
end;
$$;

revoke all on function public.save_professional_capability_context_v1(
  uuid, text, text, text, text[], text, text[], text[], text, boolean
) from public, anon;
grant execute on function public.save_professional_capability_context_v1(
  uuid, text, text, text, text[], text, text[], text[], text, boolean
) to authenticated;
