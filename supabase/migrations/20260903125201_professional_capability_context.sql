-- Durable user and institution context for the advisor workspace.
-- The information is optional, tenant-scoped and deliberately separate from company/project truth.

create table public.professional_context_profiles (
  organization_id uuid not null,
  user_id uuid not null,
  affiliation_kind text,
  professional_role text,
  team_name text,
  institution_name text,
  operating_models text[] not null default '{}',
  product_families text[] not null default '{}',
  primary_objectives text[] not null default '{}',
  context_notes text,
  disclosure_status text not null default 'partial',
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (organization_id, user_id)
    references public.organization_memberships (organization_id, user_id) on delete cascade,
  constraint professional_context_affiliation_valid check (
    affiliation_kind is null or affiliation_kind in (
      'company', 'bank', 'advisory', 'asset_manager', 'credit_fund', 'family_office', 'independent', 'other'
    )
  ),
  constraint professional_context_role_valid check (
    professional_role is null or professional_role in (
      'cfo_treasury', 'corporate_finance', 'dcm_banker', 'corporate_banker', 'advisor',
      'investor_lender', 'portfolio_manager', 'analyst', 'executive', 'other'
    )
  ),
  constraint professional_context_objectives_valid check (
    primary_objectives <@ array[
      'understand_company', 'prepare_meetings', 'originate_ideas', 'evaluate_capital_options',
      'structure_transactions', 'prepare_materials', 'connect_capital', 'analyze_investments'
    ]::text[] and cardinality(primary_objectives) <= 8
  ),
  constraint professional_context_operating_models_valid check (
    operating_models <@ array[
      'raise_capital', 'balance_sheet_lending', 'structuring', 'distribution', 'advisory', 'investing'
    ]::text[] and cardinality(operating_models) <= 6
  ),
  constraint professional_context_product_families_valid check (
    product_families <@ array[
      'bilateral_credit', 'club_syndicated', 'capital_markets', 'securitization', 'asset_backed',
      'project_acquisition_finance', 'trade_export_agri', 'structured_flexible_capital',
      'special_situations', 'derivatives_hedging'
    ]::text[] and cardinality(product_families) <= 10
  ),
  constraint professional_context_notes_length check (context_notes is null or char_length(context_notes) <= 2000),
  constraint professional_context_institution_name_length check (institution_name is null or char_length(institution_name) <= 200),
  constraint professional_context_status_valid check (disclosure_status in ('complete', 'partial', 'skipped'))
);

create table public.institution_capability_profiles (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  institution_name text,
  institution_kind text,
  operating_models text[] not null default '{}',
  product_families text[] not null default '{}',
  geographies text[] not null default '{}',
  currencies text[] not null default '{}',
  capability_notes text,
  source_kind text not null default 'self_declared',
  disclosure_status text not null default 'partial',
  last_confirmed_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_capability_name_length check (institution_name is null or char_length(institution_name) <= 200),
  constraint institution_capability_kind_valid check (
    institution_kind is null or institution_kind in (
      'company', 'bank', 'advisory', 'asset_manager', 'credit_fund', 'family_office', 'independent', 'other'
    )
  ),
  constraint institution_operating_models_valid check (
    operating_models <@ array[
      'raise_capital', 'balance_sheet_lending', 'structuring', 'distribution', 'advisory', 'investing'
    ]::text[] and cardinality(operating_models) <= 6
  ),
  constraint institution_product_families_valid check (
    product_families <@ array[
      'bilateral_credit', 'club_syndicated', 'capital_markets', 'securitization', 'asset_backed',
      'project_acquisition_finance', 'trade_export_agri', 'structured_flexible_capital',
      'special_situations', 'derivatives_hedging'
    ]::text[] and cardinality(product_families) <= 10
  ),
  constraint institution_geographies_cardinality check (cardinality(geographies) <= 40),
  constraint institution_currencies_cardinality check (cardinality(currencies) <= 20),
  constraint institution_capability_notes_length check (capability_notes is null or char_length(capability_notes) <= 2000),
  constraint institution_capability_source_valid check (source_kind in ('self_declared', 'public_observed', 'mixed', 'unknown')),
  constraint institution_capability_status_valid check (disclosure_status in ('complete', 'partial', 'skipped'))
);

create index professional_context_user_idx on public.professional_context_profiles (user_id, updated_at desc);

create trigger professional_context_set_updated_at before update on public.professional_context_profiles
  for each row execute function private.set_updated_at();
create trigger institution_capability_set_updated_at before update on public.institution_capability_profiles
  for each row execute function private.set_updated_at();

alter table public.professional_context_profiles enable row level security;
alter table public.professional_context_profiles force row level security;
alter table public.institution_capability_profiles enable row level security;
alter table public.institution_capability_profiles force row level security;

create policy professional_context_select on public.professional_context_profiles for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_org_member(organization_id)));
create policy professional_context_insert on public.professional_context_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_org_member(organization_id)));
create policy professional_context_update on public.professional_context_profiles for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_org_member(organization_id)))
  with check (user_id = (select auth.uid()) and (select private.is_org_member(organization_id)));

create policy institution_capability_select on public.institution_capability_profiles for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy institution_capability_insert on public.institution_capability_profiles for insert to authenticated
  with check ((select private.can_manage_organization(organization_id)) and updated_by = (select auth.uid()));
create policy institution_capability_update on public.institution_capability_profiles for update to authenticated
  using ((select private.can_manage_organization(organization_id)))
  with check ((select private.can_manage_organization(organization_id)) and updated_by = (select auth.uid()));

grant select, insert, update on public.professional_context_profiles to authenticated;
grant select, insert, update on public.institution_capability_profiles to authenticated;

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
    'cfo_treasury', 'corporate_finance', 'dcm_banker', 'corporate_banker', 'advisor',
    'investor_lender', 'portfolio_manager', 'analyst', 'executive', 'other'
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
    'professional_context', jsonb_build_object(
      'status', computed_status,
      'updated_at', now()
    )
  )
  where organization_id = p_organization_id and user_id = actor_id;

  return jsonb_build_object(
    'status', computed_status,
    'professional_role', normalized_role,
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

create trigger professional_context_audit after insert or update on public.professional_context_profiles
  for each row execute function private.capture_audit_event();
create trigger institution_capability_audit after insert or update on public.institution_capability_profiles
  for each row execute function private.capture_audit_event();

comment on table public.professional_context_profiles is
  'User-owned, cross-project professional context. Optional and never a substitute for project evidence.';
comment on table public.institution_capability_profiles is
  'Organization-owned operating capability context used to tailor execution paths without inventing mandate or appetite.';

-- Preserve the already hardened project-memory loader and add only the authenticated sender's
-- professional context plus the sender organization's shared capability profile.
alter function private.worker_load_agent_context(uuid, text)
  rename to worker_load_agent_context_before_professional_context_v1;

create function private.worker_load_agent_context(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_context jsonb := private.worker_load_agent_context_before_professional_context_v1(p_job_id, p_capability_token);
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  message_actor uuid;
begin
  select message.created_by into message_actor
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = (base_context ->> 'message_id')::uuid;

  return base_context || jsonb_build_object(
    'professional_context', (
      select jsonb_build_object(
        'affiliationKind', profile.affiliation_kind,
        'professionalRole', profile.professional_role,
        'teamName', profile.team_name,
        'institutionName', profile.institution_name,
        'operatingModels', to_jsonb(profile.operating_models),
        'productFamilies', to_jsonb(profile.product_families),
        'primaryObjectives', to_jsonb(profile.primary_objectives),
        'contextNotes', profile.context_notes,
        'disclosureStatus', profile.disclosure_status,
        'lastConfirmedAt', profile.last_confirmed_at
      )
      from public.professional_context_profiles profile
      where profile.organization_id = job_row.organization_id
        and profile.user_id = message_actor
    ),
    'institution_capabilities', (
      select jsonb_build_object(
        'institutionName', capability.institution_name,
        'institutionKind', capability.institution_kind,
        'operatingModels', to_jsonb(capability.operating_models),
        'productFamilies', to_jsonb(capability.product_families),
        'geographies', to_jsonb(capability.geographies),
        'currencies', to_jsonb(capability.currencies),
        'capabilityNotes', capability.capability_notes,
        'sourceKind', capability.source_kind,
        'disclosureStatus', capability.disclosure_status,
        'lastConfirmedAt', capability.last_confirmed_at
      )
      from public.institution_capability_profiles capability
      where capability.organization_id = job_row.organization_id
    )
  );
end;
$$;

revoke all on function private.worker_load_agent_context(uuid, text) from public, anon;
grant execute on function private.worker_load_agent_context(uuid, text) to authenticated;

comment on function public.worker_load_agent_context(uuid, text) is
  'Loads a capability-scoped advisor turn with project memory and optional user/institution execution context; never cross-tenant context.';
