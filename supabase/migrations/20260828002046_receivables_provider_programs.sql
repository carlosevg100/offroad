-- A capital provider is not a synonym for a FIDC. One legal institution may operate several
-- receivables programs with different routes, policies, capacity and contacts. The existing
-- platform-owned directory remains the institution layer; this migration adds the program layer
-- and lets append-only mandate observations point to the exact program they describe.

alter table public.fund_directory
  drop constraint if exists fund_directory_kind_check;

alter table public.fund_directory
  add constraint fund_directory_kind_check check (kind in (
    'fidc', 'credit_fund', 'securitizadora', 'bank', 'family_office',
    'multi_strategy', 'factoring', 'development_agency', 'other',
    'credit_finance_company', 'digital_credit_company', 'private_credit_lender',
    'institutional_investor', 'buyer_sponsored_program'
  ));

create table public.capital_provider_programs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.fund_directory (id) on delete cascade,
  program_name text not null check (length(btrim(program_name)) between 2 and 160),
  legal_entity_name text,
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  provider_kind text not null check (provider_kind in (
    'bank', 'credit_finance_company', 'digital_credit_company', 'factoring_company',
    'fidc', 'private_credit_fund', 'family_office', 'institutional_investor',
    'buyer_sponsored_program'
  )),
  route_ids text[] not null check (
    cardinality(route_ids) > 0
    and route_ids <@ array[
      'factoring_purchase',
      'financial_institution_receivables_discount',
      'digital_credit_receivables_purchase',
      'fidc_multicedent_assignment',
      'buyer_confirmed_payables_program',
      'secured_revolving_facility',
      'ccb_with_fiduciary_assignment',
      'dedicated_receivables_vehicle',
      'receivables_certificate_securitisation'
    ]::text[]
  ),
  status text not null default 'mapped' check (status in ('mapped', 'confirming', 'active', 'paused', 'inactive')),
  recorded_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, id),
  unique (provider_id, program_name)
);

comment on table public.capital_provider_programs is
  'Version-independent identity of a receivables funding program. Provider, vehicle, route and service channel remain separate concepts.';

create index capital_provider_programs_provider_idx
  on public.capital_provider_programs (provider_id, status);
create index capital_provider_programs_kind_route_idx
  on public.capital_provider_programs (provider_kind, status);
create index capital_provider_programs_route_ids_gin_idx
  on public.capital_provider_programs using gin (route_ids);
create index capital_provider_programs_recorded_by_idx
  on public.capital_provider_programs (recorded_by)
  where recorded_by is not null;

alter table public.fund_mandate_observations
  add column program_id uuid,
  add column valid_until date;

alter table public.fund_mandate_observations
  drop constraint if exists fund_mandate_observations_criterion_check;

alter table public.fund_mandate_observations
  add constraint fund_mandate_observations_criterion_check check (criterion in (
    'ticket', 'term_months', 'sectors', 'instruments', 'collateral',
    'geographies', 'leverage_ceiling', 'minimum_dscr', 'active',
    'eligible_routes', 'currencies', 'weighted_average_term_days',
    'minimum_history_months', 'maximum_past_due_over_30_ratio',
    'maximum_past_due_over_90_ratio', 'maximum_dilution_ratio',
    'maximum_adjusted_loss_ratio', 'maximum_single_obligor_ratio',
    'maximum_top_ten_obligor_ratio', 'minimum_eligible_portfolio_amount',
    'live_appetite', 'available_capacity'
  ));

alter table public.fund_mandate_observations
  add constraint fund_mandate_observations_program_fk
    foreign key (fund_id, program_id)
    references public.capital_provider_programs (provider_id, id)
    on delete cascade,
  add constraint fund_mandate_observations_validity_check
    check (valid_until is null or valid_until >= observed_at),
  add constraint fund_mandate_observations_receivables_program_check
    check (
      criterion not in (
        'eligible_routes', 'currencies', 'weighted_average_term_days',
        'minimum_history_months', 'maximum_past_due_over_30_ratio',
        'maximum_past_due_over_90_ratio', 'maximum_dilution_ratio',
        'maximum_adjusted_loss_ratio', 'maximum_single_obligor_ratio',
        'maximum_top_ten_obligor_ratio', 'minimum_eligible_portfolio_amount',
        'live_appetite', 'available_capacity'
      )
      or (program_id is not null and valid_until is not null)
    );

-- The provider id is part of the composite foreign key. Keeping it as the leading column both
-- covers cascades from the exact provider/program pair and supports the mandate resolver's lookup.
create index fund_mandate_observations_provider_program_idx
  on public.fund_mandate_observations (fund_id, program_id, criterion, observed_at desc)
  where program_id is not null;

alter table public.capital_provider_programs enable row level security;
alter table public.capital_provider_programs force row level security;

create policy capital_provider_programs_select_own
  on public.capital_provider_programs for select to authenticated
  using ((select private.can_manage_fund(provider_id)));

create policy capital_provider_programs_insert_own
  on public.capital_provider_programs for insert to authenticated
  with check (
    (select private.can_manage_fund(provider_id))
    and recorded_by = (select auth.uid())
  );

create policy capital_provider_programs_update_own
  on public.capital_provider_programs for update to authenticated
  using ((select private.can_manage_fund(provider_id)))
  with check ((select private.can_manage_fund(provider_id)));

revoke all on table public.capital_provider_programs from public, anon, authenticated;
grant select, insert on table public.capital_provider_programs to authenticated;
grant update (program_name, legal_entity_name, cnpj, route_ids, status) on table public.capital_provider_programs to authenticated;

drop trigger if exists capital_provider_programs_set_updated_at on public.capital_provider_programs;
create trigger capital_provider_programs_set_updated_at
  before update on public.capital_provider_programs
  for each row execute function private.set_updated_at();

-- Existing observations remain readable under their prior access model. The two new columns are
-- deliberately append-only with the rest of the row: authenticated clients keep insert and select
-- only, while updates and deletes remain withheld.
revoke all on table public.fund_mandate_observations from public, anon, authenticated;
grant select, insert on table public.fund_mandate_observations to authenticated;
