-- Proprietary house pricing data. Borrowers, advisors and capital-provider tenants never read
-- these rows. A case worker receives only the governed registry snapshot through its short-lived
-- job capability, and the borrower-facing state contains only the aggregate conclusion.

create table public.pricing_policies (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (char_length(version) between 3 and 120),
  status text not null default 'draft' check (status in ('draft', 'active', 'invalidated', 'superseded')),
  regime text not null check (char_length(regime) between 3 and 120),
  valid_from date not null,
  valid_until date,
  min_observations integer not null check (min_observations between 2 and 100),
  min_distinct_sources integer not null check (min_distinct_sources between 2 and min_observations),
  min_quality numeric(5, 4) not null check (min_quality between 0 and 1),
  max_tenor_delta_months integer not null check (max_tenor_delta_months between 0 and 120),
  min_amount_ratio numeric(12, 6) not null check (min_amount_ratio > 0),
  max_amount_ratio numeric(12, 6) not null check (max_amount_ratio >= min_amount_ratio),
  min_band_width_bps integer not null check (min_band_width_bps > 0),
  max_band_width_bps integer not null check (max_band_width_bps >= min_band_width_bps),
  default_indexer text not null check (default_indexer in ('cdi', 'ipca', 'fixed', 'other')),
  index_levels jsonb not null check (
    jsonb_typeof(index_levels) = 'object'
    and index_levels ?& array['cdi', 'ipca', 'tlp', 'tr', 'source_id', 'observed_on', 'valid_until']
  ),
  methodology_source text not null check (char_length(methodology_source) between 3 and 500),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from),
  check (status <> 'active' or (approved_by is not null and approved_at is not null))
);

create unique index pricing_policies_one_active_idx on public.pricing_policies (status) where status = 'active';
create index pricing_policies_validity_idx on public.pricing_policies (status, valid_from, valid_until);

create table public.pricing_observations (
  id uuid primary key default gen_random_uuid(),
  source_id text not null check (char_length(source_id) between 3 and 240),
  source_owner text not null check (char_length(source_owner) between 2 and 200),
  source_kind text not null check (source_kind in ('public_closing', 'direct_manager_confirmation', 'term_sheet', 'indication', 'sounding', 'authorized_historical')),
  confidentiality text not null check (confidentiality in ('public', 'aggregated_confidential', 'restricted_internal')),
  observed_on date not null,
  valid_until date not null check (valid_until >= observed_on),
  status text not null check (status in ('closed', 'term', 'indication', 'sounding')),
  instrument text not null check (instrument in ('ccb', 'nce', 'debenture_476', 'debenture_160', 'cra', 'cri', 'fidc', 'venture_debt', 'finame', 'leasing')),
  rating text not null check (rating in ('strong', 'adequate', 'watch', 'weak', 'distressed')),
  indexer text not null check (indexer in ('cdi', 'ipca', 'fixed', 'other')),
  tenor_months integer not null check (tenor_months between 1 and 360),
  security_class text not null check (char_length(security_class) between 3 and 300),
  amortization_class text not null check (char_length(amortization_class) between 3 and 120),
  sector_group text not null check (char_length(sector_group) between 2 and 160),
  amount numeric(20, 2) not null check (amount > 0),
  regime text not null check (char_length(regime) between 3 and 120),
  quoted_spread_bps numeric(12, 4) not null,
  fee_bps numeric(12, 4) not null default 0,
  oid_bps numeric(12, 4) not null default 0,
  warrant_bps numeric(12, 4) not null default 0,
  hedge_bps numeric(12, 4) not null default 0,
  normalized_spread_bps numeric(12, 4) generated always as (quoted_spread_bps + fee_bps + oid_bps + warrant_bps + hedge_bps) stored,
  normalization_method text not null check (char_length(normalization_method) between 3 and 1000),
  quality numeric(5, 4) not null check (quality between 0 and 1),
  aggregate_authorized boolean not null default false,
  evidence_locator jsonb not null check (jsonb_typeof(evidence_locator) = 'object'),
  created_at timestamptz not null default now(),
  check (confidentiality <> 'restricted_internal' or aggregate_authorized = false)
);

create index pricing_observations_cell_idx on public.pricing_observations (
  regime, instrument, rating, sector_group, security_class, amortization_class, tenor_months, observed_on desc
);
create index pricing_observations_validity_idx on public.pricing_observations (valid_until, aggregate_authorized);
create index pricing_observations_source_idx on public.pricing_observations (source_id, observed_on desc);

create trigger pricing_policies_set_updated_at before update on public.pricing_policies
  for each row execute function private.set_updated_at();

alter table public.pricing_policies enable row level security;
alter table public.pricing_policies force row level security;
alter table public.pricing_observations enable row level security;
alter table public.pricing_observations force row level security;

revoke all on public.pricing_policies from public, anon, authenticated;
revoke all on public.pricing_observations from public, anon, authenticated;
grant select, insert, update, delete on public.pricing_policies to service_role;
grant select, insert, update, delete on public.pricing_observations to service_role;

create or replace function private.worker_load_pricing_context(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  policy_row public.pricing_policies;
  observations jsonb;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;

  select * into policy_row
  from public.pricing_policies policy
  where policy.status in ('active', 'invalidated')
    and policy.valid_from <= current_date
    and (policy.valid_until is null or policy.valid_until >= current_date)
  order by policy.valid_from desc, case policy.status when 'invalidated' then 0 else 1 end
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', observation.id,
    'sourceId', observation.source_id,
    'sourceOwner', observation.source_owner,
    'sourceKind', observation.source_kind,
    'confidentiality', observation.confidentiality,
    'observedOn', observation.observed_on,
    'validUntil', observation.valid_until,
    'status', observation.status,
    'instrument', observation.instrument,
    'rating', observation.rating,
    'normalizedSpreadBps', observation.normalized_spread_bps,
    'normalizationMethod', observation.normalization_method,
    'tenorMonths', observation.tenor_months,
    'securityClass', observation.security_class,
    'amortizationClass', observation.amortization_class,
    'sectorGroup', observation.sector_group,
    'amount', observation.amount,
    'regime', observation.regime,
    'quality', observation.quality,
    'aggregateAuthorized', observation.aggregate_authorized,
    'economics', jsonb_build_object(
      'quotedSpreadBps', observation.quoted_spread_bps,
      'feeBps', observation.fee_bps,
      'oidBps', observation.oid_bps,
      'warrantBps', observation.warrant_bps,
      'hedgeBps', observation.hedge_bps
    )
  ) order by observation.observed_on desc, observation.id), '[]'::jsonb)
  into observations
  from (
    select candidate.*
    from public.pricing_observations candidate
    where candidate.regime = policy_row.regime
      and candidate.observed_on >= current_date - interval '24 months'
    order by candidate.observed_on desc, candidate.id
    limit 2000
  ) observation;

  return jsonb_build_object(
    'policy', jsonb_build_object(
      'version', policy_row.version,
      'asOf', current_date,
      'regime', policy_row.regime,
      'status', policy_row.status,
      'minObservations', policy_row.min_observations,
      'minDistinctSources', policy_row.min_distinct_sources,
      'minQuality', policy_row.min_quality,
      'maxTenorDeltaMonths', policy_row.max_tenor_delta_months,
      'minAmountRatio', policy_row.min_amount_ratio,
      'maxAmountRatio', policy_row.max_amount_ratio,
      'minBandWidthBps', policy_row.min_band_width_bps,
      'maxBandWidthBps', policy_row.max_band_width_bps
    ),
    'indexLevels', jsonb_build_object(
      'cdi', policy_row.index_levels ->> 'cdi',
      'ipca', policy_row.index_levels ->> 'ipca',
      'tlp', policy_row.index_levels ->> 'tlp',
      'tr', policy_row.index_levels ->> 'tr'
    ),
    'indexer', policy_row.default_indexer,
    'observations', observations
  );
end;
$$;

create or replace function public.worker_load_case_input(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_case_input(p_job_id, p_capability_token)
    || jsonb_build_object('pricing_context', private.worker_load_pricing_context(p_job_id, p_capability_token));
$$;

revoke all on function private.worker_load_pricing_context(uuid, text) from public, anon;
revoke all on function public.worker_load_case_input(uuid, text) from public, anon;
grant execute on function private.worker_load_pricing_context(uuid, text) to authenticated;
grant execute on function public.worker_load_case_input(uuid, text) to authenticated;
