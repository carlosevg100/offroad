-- Offroad Capital platform foundation.
-- Every tenant-owned table carries organization_id and is protected by RLS.

create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  job_title text,
  phone text,
  locale text not null default 'pt-BR' check (locale in ('pt-BR', 'en-US')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  organization_type text not null check (organization_type in ('company', 'originator', 'capital_provider', 'offroad')),
  name text not null check (char_length(trim(name)) between 2 and 160),
  legal_name text,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  website text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'analyst', 'relationship_manager', 'compliance')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended', 'revoked')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_memberships_user_status_idx
  on public.organization_memberships (user_id, status, organization_id);

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email_hash bytea not null,
  role text not null check (role in ('admin', 'member', 'analyst', 'relationship_manager', 'compliance')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users (id),
  accepted_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email_hash, status)
);

create index organization_invites_org_status_idx
  on public.organization_invites (organization_id, status, expires_at);

create table public.onboarding_progress (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  journey text not null check (journey in ('company', 'originator', 'capital_provider')),
  current_step text not null default 'organization',
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, journey)
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  legal_name text not null check (char_length(trim(legal_name)) between 2 and 200),
  display_name text,
  jurisdiction_code text not null check (jurisdiction_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'),
  legal_identifier_hash bytea,
  sector text,
  description text,
  website text,
  reporting_currency text not null default 'BRL' check (reporting_currency ~ '^[A-Z]{3}$'),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, jurisdiction_code, legal_identifier_hash)
);

create index companies_org_created_idx on public.companies (organization_id, created_at desc);

create table public.capital_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  company_id uuid not null,
  purpose text not null check (char_length(trim(purpose)) between 3 and 500),
  requested_amount numeric(20, 2) not null check (requested_amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  desired_term_months integer check (desired_term_months between 1 and 360),
  output_locale text not null default 'pt-BR' check (output_locale in ('pt-BR', 'en-US')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'in_review', 'structured', 'closed', 'withdrawn')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, company_id) references public.companies (organization_id, id) on delete cascade
);

create index capital_requests_org_status_idx on public.capital_requests (organization_id, status, created_at desc);
create index capital_requests_company_idx on public.capital_requests (organization_id, company_id);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  company_id uuid not null,
  capital_request_id uuid not null,
  title text not null check (char_length(trim(title)) between 3 and 180),
  stage text not null default 'intake' check (stage in ('intake', 'evidence', 'analysis', 'structuring', 'materials', 'matching', 'market_ready', 'introduced', 'closed')),
  purpose text not null,
  requested_amount numeric(20, 2) not null check (requested_amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  fingerprint_hash bytea,
  readiness_status text not null default 'not_ready' check (readiness_status in ('not_ready', 'needs_review', 'ready', 'stale', 'blocked')),
  lead_user_id uuid not null references auth.users (id),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, company_id) references public.companies (organization_id, id),
  foreign key (organization_id, capital_request_id) references public.capital_requests (organization_id, id)
);

create index opportunities_org_stage_idx on public.opportunities (organization_id, stage, updated_at desc);
create unique index opportunities_active_fingerprint_idx
  on public.opportunities (organization_id, fingerprint_hash)
  where fingerprint_hash is not null and stage not in ('closed');

create table public.opportunity_assignments (
  organization_id uuid not null,
  opportunity_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  assignment_role text not null check (assignment_role in ('lead', 'originator', 'advisor', 'reviewer', 'operator')),
  permissions text[] not null default '{}'::text[],
  expires_at timestamptz,
  assigned_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, opportunity_id, user_id),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade
);

create index opportunity_assignments_user_idx
  on public.opportunity_assignments (user_id, expires_at, opportunity_id);

create table public.authority_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  representative_user_id uuid not null references auth.users (id),
  evidence_kind text not null check (evidence_kind in ('corporate_role', 'power_of_attorney', 'mandate', 'board_resolution', 'other')),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'expired', 'revoked')),
  powers text[] not null default '{}'::text[],
  evidence_reference text,
  verified_by uuid references auth.users (id),
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade
);

create index authority_evidence_opportunity_status_idx
  on public.authority_evidence (organization_id, opportunity_id, status, expires_at);

create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  bucket_id text not null default 'opportunity-documents' check (bucket_id = 'opportunity-documents'),
  object_path text not null,
  original_name text not null,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size between 0 and 52428800),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  classification text not null default 'confidential' check (classification in ('internal', 'confidential', 'restricted')),
  processing_status text not null default 'quarantined' check (processing_status in ('quarantined', 'scanning', 'clean', 'processing', 'ready', 'rejected', 'failed')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, object_path),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade
);

create index source_documents_opportunity_status_idx
  on public.source_documents (organization_id, opportunity_id, processing_status, created_at desc);
create unique index source_documents_org_sha_idx
  on public.source_documents (organization_id, sha256)
  where sha256 is not null;

create table public.evidence_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  source_document_id uuid,
  fact_type text not null,
  label text not null,
  value_numeric numeric(30, 8),
  value_text text,
  unit text,
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  period_start date,
  period_end date,
  confidence numeric(5, 4) check (confidence between 0 and 1),
  review_state text not null default 'proposed' check (review_state in ('proposed', 'approved', 'rejected', 'superseded')),
  source_anchor jsonb not null check (jsonb_typeof(source_anchor) = 'object'),
  created_by uuid not null references auth.users (id),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check ((value_numeric is not null)::integer + (value_text is not null)::integer = 1),
  check (period_end is null or period_start is null or period_end >= period_start),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade,
  foreign key (organization_id, source_document_id) references public.source_documents (organization_id, id)
);

create index evidence_facts_opportunity_review_idx
  on public.evidence_facts (organization_id, opportunity_id, review_state, created_at desc);
create index evidence_facts_source_document_idx
  on public.evidence_facts (organization_id, source_document_id)
  where source_document_id is not null;
create index evidence_facts_anchor_gin_idx
  on public.evidence_facts using gin (source_anchor jsonb_path_ops);

create table public.financial_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  period_kind text not null check (period_kind in ('month', 'quarter', 'year', 'ltm', 'projection')),
  starts_on date not null,
  ends_on date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  unit_scale numeric(20, 4) not null default 1 check (unit_scale > 0),
  status text not null default 'draft' check (status in ('draft', 'reconciled', 'approved', 'stale')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, opportunity_id, period_kind, starts_on, ends_on),
  check (ends_on >= starts_on),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade
);

create index financial_periods_opportunity_idx
  on public.financial_periods (organization_id, opportunity_id, ends_on desc);

create table public.financial_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  financial_period_id uuid not null,
  account_code text not null,
  label text not null,
  reported_value numeric(30, 8),
  adjusted_value numeric(30, 8),
  source_fact_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, financial_period_id, account_code),
  check (reported_value is not null or adjusted_value is not null),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade,
  foreign key (organization_id, financial_period_id) references public.financial_periods (organization_id, id) on delete cascade,
  foreign key (organization_id, source_fact_id) references public.evidence_facts (organization_id, id)
);

create index financial_line_items_opportunity_idx
  on public.financial_line_items (organization_id, opportunity_id, financial_period_id);

create table public.calculation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  engine_version text not null,
  policy_version text not null,
  status text not null check (status in ('queued', 'running', 'complete', 'failed', 'stale')),
  outputs jsonb not null default '{}'::jsonb check (jsonb_typeof(outputs) = 'object'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, opportunity_id, input_hash, engine_version, policy_version),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade
);

create index calculation_runs_opportunity_status_idx
  on public.calculation_runs (organization_id, opportunity_id, status, created_at desc);

create table public.structure_scenarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  name text not null,
  scenario_kind text not null check (scenario_kind in ('conservative', 'recommended', 'stretch', 'custom')),
  status text not null default 'draft' check (status in ('draft', 'recommended', 'approved', 'stale', 'rejected')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, opportunity_id, name),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade
);

create index structure_scenarios_opportunity_idx
  on public.structure_scenarios (organization_id, opportunity_id, status);

create table public.scenario_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  structure_scenario_id uuid not null,
  version_number integer not null check (version_number > 0),
  terms jsonb not null check (jsonb_typeof(terms) = 'object'),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'pass', 'warning', 'blocked')),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users (id),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, structure_scenario_id, version_number),
  foreign key (organization_id, structure_scenario_id) references public.structure_scenarios (organization_id, id) on delete cascade
);

create index scenario_versions_scenario_idx
  on public.scenario_versions (organization_id, structure_scenario_id, version_number desc);
create index scenario_versions_terms_gin_idx
  on public.scenario_versions using gin (terms jsonb_path_ops);

create table public.output_artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  artifact_type text not null check (artifact_type in ('readiness_report', 'credit_profile', 'capacity', 'proposed_structure', 'blind_teaser', 'lender_package', 'diligence_roadmap', 'term_sheet', 'handoff_package')),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'stale', 'revoked')),
  current_version_number integer not null default 0 check (current_version_number >= 0),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, opportunity_id, artifact_type),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade
);

create index output_artifacts_opportunity_idx
  on public.output_artifacts (organization_id, opportunity_id, status);

create table public.output_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  output_artifact_id uuid not null,
  version_number integer not null check (version_number > 0),
  locale text not null check (locale in ('pt-BR', 'en-US')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  evidence_coverage numeric(5, 4) not null default 0 check (evidence_coverage between 0 and 1),
  review_status text not null default 'draft' check (review_status in ('draft', 'in_review', 'approved', 'blocked', 'stale')),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, output_artifact_id, version_number, locale),
  foreign key (organization_id, output_artifact_id) references public.output_artifacts (organization_id, id) on delete cascade
);

create index output_versions_artifact_idx
  on public.output_versions (organization_id, output_artifact_id, version_number desc);

create table public.funds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  strategy text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.mandate_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  fund_id uuid not null,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'stale', 'superseded')),
  source_kind text not null check (source_kind in ('declared', 'public', 'coverage_observation', 'synthetic')),
  constraints jsonb not null check (jsonb_typeof(constraints) = 'object'),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  valid_from date not null,
  valid_until date,
  confidence numeric(5, 4) not null default 1 check (confidence between 0 and 1),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, fund_id, version_number),
  check (valid_until is null or valid_until >= valid_from),
  foreign key (organization_id, fund_id) references public.funds (organization_id, id) on delete cascade
);

create index mandate_versions_fund_status_idx
  on public.mandate_versions (organization_id, fund_id, status, valid_until);
create index mandate_versions_constraints_gin_idx
  on public.mandate_versions using gin (constraints jsonb_path_ops);

create table public.published_opportunity_projections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  source_output_version_id uuid,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'revoked', 'expired')),
  sector text not null,
  geography text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_min numeric(20, 2) not null check (amount_min > 0),
  amount_max numeric(20, 2) not null check (amount_max >= amount_min),
  term_months_min integer check (term_months_min between 1 and 360),
  term_months_max integer check (term_months_max between 1 and 360),
  structure_types text[] not null default '{}'::text[],
  collateral_types text[] not null default '{}'::text[],
  summary text not null,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, opportunity_id, version_number),
  check (term_months_max is null or term_months_min is null or term_months_max >= term_months_min),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade,
  foreign key (organization_id, source_output_version_id) references public.output_versions (organization_id, id)
);

create index published_projections_discovery_idx
  on public.published_opportunity_projections (status, currency, geography, sector, amount_min, amount_max)
  where status = 'published';

create table public.match_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  scenario_version_id uuid not null,
  status text not null default 'queued' check (status in ('queued', 'evaluating', 'complete', 'stale', 'superseded', 'failed')),
  objective text not null default 'balanced' check (objective in ('balanced', 'certainty', 'cost', 'speed', 'flexibility')),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  engine_version text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade,
  foreign key (organization_id, scenario_version_id) references public.scenario_versions (organization_id, id)
);

create index match_runs_opportunity_idx
  on public.match_runs (organization_id, opportunity_id, status, created_at desc);

create table public.match_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  match_run_id uuid not null,
  provider_organization_id uuid not null,
  fund_id uuid not null,
  mandate_version_id uuid not null,
  rank integer not null check (rank > 0),
  score numeric(8, 6) not null check (score between 0 and 1),
  hard_filter_status text not null check (hard_filter_status in ('pass', 'fail')),
  fit_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(fit_reasons) = 'array'),
  mismatch_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(mismatch_reasons) = 'array'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, match_run_id, fund_id),
  foreign key (organization_id, match_run_id) references public.match_runs (organization_id, id) on delete cascade,
  foreign key (provider_organization_id, fund_id) references public.funds (organization_id, id),
  foreign key (provider_organization_id, mandate_version_id) references public.mandate_versions (organization_id, id)
);

create index match_results_run_rank_idx
  on public.match_results (organization_id, match_run_id, rank);

create table public.disclosure_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid not null,
  recipient_organization_id uuid not null references public.organizations (id),
  projection_id uuid not null,
  purpose text not null,
  scopes text[] not null check (cardinality(scopes) > 0),
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'active', 'expired', 'revoked')),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (expires_at > created_at),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id) on delete cascade,
  foreign key (organization_id, projection_id) references public.published_opportunity_projections (organization_id, id)
);

create index disclosure_grants_recipient_status_idx
  on public.disclosure_grants (recipient_organization_id, status, expires_at);
create index disclosure_grants_opportunity_idx
  on public.disclosure_grants (organization_id, opportunity_id, status);

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_organization_id uuid not null,
  projection_id uuid not null,
  requested_scopes text[] not null check (cardinality(requested_scopes) > 0),
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn', 'expired')),
  requested_by uuid not null references auth.users (id),
  responded_by uuid references auth.users (id),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (source_organization_id, projection_id) references public.published_opportunity_projections (organization_id, id)
);

create index access_requests_source_status_idx
  on public.access_requests (source_organization_id, status, created_at desc);
create index access_requests_requester_status_idx
  on public.access_requests (organization_id, status, created_at desc);

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id uuid,
  workflow_type text not null,
  status text not null check (status in ('queued', 'running', 'waiting_human', 'complete', 'failed', 'cancelled')),
  input_version text not null,
  safe_metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metrics) = 'object'),
  started_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, opportunity_id) references public.opportunities (organization_id, id)
);

create index workflow_runs_org_status_idx
  on public.workflow_runs (organization_id, status, created_at desc);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create index audit_events_org_time_idx
  on public.audit_events (organization_id, occurred_at desc, id desc);
create index audit_events_resource_idx
  on public.audit_events (organization_id, resource_type, resource_id, occurred_at desc);

create or replace function private.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = p_organization_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    );
$$;

create or replace function private.can_manage_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.organizations organization_record
        where organization_record.id = p_organization_id
          and organization_record.created_by = (select auth.uid())
      )
      or exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = p_organization_id
          and membership.user_id = (select auth.uid())
          and membership.status = 'active'
          and membership.role in ('owner', 'admin')
      )
    );
$$;

create or replace function private.can_access_opportunity(
  p_organization_id uuid,
  p_opportunity_id uuid,
  p_permission text default 'opportunity.read'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.organization_memberships membership
        where membership.organization_id = p_organization_id
          and membership.user_id = (select auth.uid())
          and membership.status = 'active'
      )
      or exists (
        select 1
        from public.opportunity_assignments assignment
        where assignment.organization_id = p_organization_id
          and assignment.opportunity_id = p_opportunity_id
          and assignment.user_id = (select auth.uid())
          and (assignment.expires_at is null or assignment.expires_at > now())
          and (p_permission = any (assignment.permissions) or 'opportunity.*' = any (assignment.permissions))
      )
    );
$$;

create or replace function private.has_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2';
$$;

create or replace function private.storage_organization_id(p_object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_object_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(p_object_name))[1])::uuid
    else null
  end;
$$;

create or replace function private.storage_opportunity_id(p_object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_object_name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(p_object_name))[2])::uuid
    else null
  end;
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  event_organization_id uuid;
  event_resource_id text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  event_organization_id := (row_data ->> 'organization_id')::uuid;
  event_resource_id := coalesce(row_data ->> 'id', row_data ->> 'opportunity_id', row_data ->> 'user_id');

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    event_organization_id,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    event_resource_id,
    jsonb_build_object('operation', tg_op)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, locale)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    case when new.raw_user_meta_data ->> 'locale' in ('pt-BR', 'en-US')
      then new.raw_user_meta_data ->> 'locale'
      else 'pt-BR'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.can_manage_organization(uuid) from public;
revoke all on function private.can_access_opportunity(uuid, uuid, text) from public;
revoke all on function private.has_aal2() from public;
revoke all on function private.storage_organization_id(text) from public;
revoke all on function private.storage_opportunity_id(text) from public;
revoke all on function private.set_updated_at() from public;
revoke all on function private.capture_audit_event() from public;
revoke all on function private.handle_new_user() from public;

grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.can_manage_organization(uuid) to authenticated;
grant execute on function private.can_access_opportunity(uuid, uuid, text) to authenticated;
grant execute on function private.has_aal2() to authenticated;
grant execute on function private.storage_organization_id(text) to authenticated;
grant execute on function private.storage_opportunity_id(text) to authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger memberships_set_updated_at before update on public.organization_memberships
  for each row execute function private.set_updated_at();
create trigger organization_invites_set_updated_at before update on public.organization_invites
  for each row execute function private.set_updated_at();
create trigger onboarding_progress_set_updated_at before update on public.onboarding_progress
  for each row execute function private.set_updated_at();
create trigger companies_set_updated_at before update on public.companies
  for each row execute function private.set_updated_at();
create trigger capital_requests_set_updated_at before update on public.capital_requests
  for each row execute function private.set_updated_at();
create trigger opportunities_set_updated_at before update on public.opportunities
  for each row execute function private.set_updated_at();
create trigger opportunity_assignments_set_updated_at before update on public.opportunity_assignments
  for each row execute function private.set_updated_at();
create trigger authority_evidence_set_updated_at before update on public.authority_evidence
  for each row execute function private.set_updated_at();
create trigger source_documents_set_updated_at before update on public.source_documents
  for each row execute function private.set_updated_at();
create trigger evidence_facts_set_updated_at before update on public.evidence_facts
  for each row execute function private.set_updated_at();
create trigger financial_periods_set_updated_at before update on public.financial_periods
  for each row execute function private.set_updated_at();
create trigger financial_line_items_set_updated_at before update on public.financial_line_items
  for each row execute function private.set_updated_at();
create trigger structure_scenarios_set_updated_at before update on public.structure_scenarios
  for each row execute function private.set_updated_at();
create trigger output_artifacts_set_updated_at before update on public.output_artifacts
  for each row execute function private.set_updated_at();
create trigger funds_set_updated_at before update on public.funds
  for each row execute function private.set_updated_at();
create trigger disclosure_grants_set_updated_at before update on public.disclosure_grants
  for each row execute function private.set_updated_at();
create trigger access_requests_set_updated_at before update on public.access_requests
  for each row execute function private.set_updated_at();

create trigger companies_audit after insert or update or delete on public.companies
  for each row execute function private.capture_audit_event();
create trigger capital_requests_audit after insert or update or delete on public.capital_requests
  for each row execute function private.capture_audit_event();
create trigger opportunities_audit after insert or update or delete on public.opportunities
  for each row execute function private.capture_audit_event();
create trigger authority_evidence_audit after insert or update or delete on public.authority_evidence
  for each row execute function private.capture_audit_event();
create trigger evidence_facts_audit after insert or update or delete on public.evidence_facts
  for each row execute function private.capture_audit_event();
create trigger scenario_versions_audit after insert or update or delete on public.scenario_versions
  for each row execute function private.capture_audit_event();
create trigger output_versions_audit after insert or update or delete on public.output_versions
  for each row execute function private.capture_audit_event();
create trigger disclosure_grants_audit after insert or update or delete on public.disclosure_grants
  for each row execute function private.capture_audit_event();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_invites enable row level security;
alter table public.onboarding_progress enable row level security;
alter table public.companies enable row level security;
alter table public.capital_requests enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_assignments enable row level security;
alter table public.authority_evidence enable row level security;
alter table public.source_documents enable row level security;
alter table public.evidence_facts enable row level security;
alter table public.financial_periods enable row level security;
alter table public.financial_line_items enable row level security;
alter table public.calculation_runs enable row level security;
alter table public.structure_scenarios enable row level security;
alter table public.scenario_versions enable row level security;
alter table public.output_artifacts enable row level security;
alter table public.output_versions enable row level security;
alter table public.funds enable row level security;
alter table public.mandate_versions enable row level security;
alter table public.published_opportunity_projections enable row level security;
alter table public.match_runs enable row level security;
alter table public.match_results enable row level security;
alter table public.disclosure_grants enable row level security;
alter table public.access_requests enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy organizations_select_member on public.organizations for select to authenticated
  using (created_by = (select auth.uid()) or (select private.is_org_member(id)));
create policy organizations_insert_creator on public.organizations for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy organizations_update_admin on public.organizations for update to authenticated
  using ((select private.can_manage_organization(id)))
  with check ((select private.can_manage_organization(id)));

create policy memberships_select_org on public.organization_memberships for select to authenticated
  using ((select private.is_org_member(organization_id)) or user_id = (select auth.uid()));
create policy memberships_insert_admin on public.organization_memberships for insert to authenticated
  with check (
    (select private.can_manage_organization(organization_id))
    and (
      role <> 'owner'
      or user_id = (select auth.uid())
      or (select private.can_manage_organization(organization_id))
    )
  );
create policy memberships_update_admin on public.organization_memberships for update to authenticated
  using ((select private.can_manage_organization(organization_id)))
  with check ((select private.can_manage_organization(organization_id)));
create policy memberships_delete_admin on public.organization_memberships for delete to authenticated
  using ((select private.can_manage_organization(organization_id)) and user_id <> (select auth.uid()));

create policy organization_invites_manage on public.organization_invites for all to authenticated
  using ((select private.can_manage_organization(organization_id)))
  with check ((select private.can_manage_organization(organization_id)) and invited_by = (select auth.uid()));

create policy onboarding_progress_select on public.onboarding_progress for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_org_member(organization_id)));
create policy onboarding_progress_insert on public.onboarding_progress for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_org_member(organization_id)));
create policy onboarding_progress_update on public.onboarding_progress for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_org_member(organization_id)))
  with check (user_id = (select auth.uid()) and (select private.is_org_member(organization_id)));

create policy companies_select on public.companies for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy companies_insert on public.companies for insert to authenticated
  with check ((select private.is_org_member(organization_id)) and created_by = (select auth.uid()));
create policy companies_update on public.companies for update to authenticated
  using ((select private.is_org_member(organization_id)))
  with check ((select private.is_org_member(organization_id)));

create policy capital_requests_select on public.capital_requests for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy capital_requests_insert on public.capital_requests for insert to authenticated
  with check ((select private.is_org_member(organization_id)) and created_by = (select auth.uid()));
create policy capital_requests_update on public.capital_requests for update to authenticated
  using ((select private.is_org_member(organization_id)))
  with check ((select private.is_org_member(organization_id)));

create policy opportunities_select on public.opportunities for select to authenticated
  using ((select private.can_access_opportunity(organization_id, id, 'opportunity.read')));
create policy opportunities_insert on public.opportunities for insert to authenticated
  with check ((select private.is_org_member(organization_id)) and created_by = (select auth.uid()));
create policy opportunities_update on public.opportunities for update to authenticated
  using ((select private.can_access_opportunity(organization_id, id, 'opportunity.update')))
  with check ((select private.can_access_opportunity(organization_id, id, 'opportunity.update')));

create policy opportunity_assignments_select on public.opportunity_assignments for select to authenticated
  using ((select private.can_access_opportunity(organization_id, opportunity_id, 'opportunity.read')));
create policy opportunity_assignments_manage on public.opportunity_assignments for all to authenticated
  using ((select private.can_manage_organization(organization_id)))
  with check ((select private.can_manage_organization(organization_id)) and assigned_by = (select auth.uid()));

create policy authority_evidence_select on public.authority_evidence for select to authenticated
  using ((select private.can_access_opportunity(organization_id, opportunity_id, 'authority.read')));
create policy authority_evidence_insert on public.authority_evidence for insert to authenticated
  with check ((select private.can_access_opportunity(organization_id, opportunity_id, 'authority.write')));
create policy authority_evidence_update on public.authority_evidence for update to authenticated
  using ((select private.can_access_opportunity(organization_id, opportunity_id, 'authority.write')))
  with check ((select private.can_access_opportunity(organization_id, opportunity_id, 'authority.write')));

create policy source_documents_select on public.source_documents for select to authenticated
  using ((select private.can_access_opportunity(organization_id, opportunity_id, 'document.read')));
create policy source_documents_insert on public.source_documents for insert to authenticated
  with check ((select private.can_access_opportunity(organization_id, opportunity_id, 'document.upload')) and created_by = (select auth.uid()));
create policy source_documents_update on public.source_documents for update to authenticated
  using ((select private.can_access_opportunity(organization_id, opportunity_id, 'document.write')))
  with check ((select private.can_access_opportunity(organization_id, opportunity_id, 'document.write')));

create policy evidence_facts_select on public.evidence_facts for select to authenticated
  using ((select private.can_access_opportunity(organization_id, opportunity_id, 'evidence.read')));
create policy evidence_facts_insert on public.evidence_facts for insert to authenticated
  with check ((select private.can_access_opportunity(organization_id, opportunity_id, 'evidence.write')) and created_by = (select auth.uid()));
create policy evidence_facts_update on public.evidence_facts for update to authenticated
  using ((select private.can_access_opportunity(organization_id, opportunity_id, 'evidence.review')))
  with check ((select private.can_access_opportunity(organization_id, opportunity_id, 'evidence.review')));

create policy financial_periods_all on public.financial_periods for all to authenticated
  using ((select private.can_access_opportunity(organization_id, opportunity_id, 'financial.write')))
  with check ((select private.can_access_opportunity(organization_id, opportunity_id, 'financial.write')));
create policy financial_line_items_all on public.financial_line_items for all to authenticated
  using ((select private.can_access_opportunity(organization_id, opportunity_id, 'financial.write')))
  with check ((select private.can_access_opportunity(organization_id, opportunity_id, 'financial.write')));
create policy calculation_runs_all on public.calculation_runs for all to authenticated
  using ((select private.can_access_opportunity(organization_id, opportunity_id, 'financial.compute')))
  with check ((select private.can_access_opportunity(organization_id, opportunity_id, 'financial.compute')) and created_by = (select auth.uid()));

create policy structure_scenarios_all on public.structure_scenarios for all to authenticated
  using ((select private.can_access_opportunity(organization_id, opportunity_id, 'scenario.write')))
  with check ((select private.can_access_opportunity(organization_id, opportunity_id, 'scenario.write')));
create policy scenario_versions_all on public.scenario_versions for all to authenticated
  using ((select private.is_org_member(organization_id)))
  with check ((select private.is_org_member(organization_id)));

create policy output_artifacts_all on public.output_artifacts for all to authenticated
  using ((select private.can_access_opportunity(organization_id, opportunity_id, 'output.write')))
  with check ((select private.can_access_opportunity(organization_id, opportunity_id, 'output.write')));
create policy output_versions_all on public.output_versions for all to authenticated
  using ((select private.is_org_member(organization_id)))
  with check ((select private.is_org_member(organization_id)));

create policy funds_all on public.funds for all to authenticated
  using ((select private.is_org_member(organization_id)))
  with check ((select private.is_org_member(organization_id)));
create policy mandate_versions_all on public.mandate_versions for all to authenticated
  using ((select private.is_org_member(organization_id)))
  with check ((select private.is_org_member(organization_id)));

create policy published_projections_owner_select on public.published_opportunity_projections for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy published_projections_discovery_select on public.published_opportunity_projections for select to authenticated
  using (status = 'published' and (expires_at is null or expires_at > now()));
create policy published_projections_insert on public.published_opportunity_projections for insert to authenticated
  with check ((select private.is_org_member(organization_id)));
create policy published_projections_update on public.published_opportunity_projections for update to authenticated
  using ((select private.is_org_member(organization_id)))
  with check (
    (select private.is_org_member(organization_id))
    and (status not in ('approved', 'published') or (select private.has_aal2()))
  );

create policy match_runs_all on public.match_runs for all to authenticated
  using ((select private.can_access_opportunity(organization_id, opportunity_id, 'matching.run')))
  with check ((select private.can_access_opportunity(organization_id, opportunity_id, 'matching.run')));
create policy match_results_all on public.match_results for all to authenticated
  using ((select private.is_org_member(organization_id)))
  with check ((select private.is_org_member(organization_id)));

create policy disclosure_grants_select on public.disclosure_grants for select to authenticated
  using (
    (select private.is_org_member(organization_id))
    or (select private.is_org_member(recipient_organization_id))
  );
create policy disclosure_grants_insert on public.disclosure_grants for insert to authenticated
  with check (
    (select private.can_manage_organization(organization_id))
    and status in ('draft', 'pending_approval')
    and created_by = (select auth.uid())
  );
create policy disclosure_grants_update on public.disclosure_grants for update to authenticated
  using ((select private.can_manage_organization(organization_id)))
  with check (
    (select private.can_manage_organization(organization_id))
    and (status <> 'active' or (select private.has_aal2()))
  );

create policy access_requests_select on public.access_requests for select to authenticated
  using (
    (select private.is_org_member(organization_id))
    or (select private.is_org_member(source_organization_id))
  );
create policy access_requests_insert on public.access_requests for insert to authenticated
  with check ((select private.is_org_member(organization_id)) and requested_by = (select auth.uid()));
create policy access_requests_update on public.access_requests for update to authenticated
  using (
    (select private.is_org_member(organization_id))
    or (select private.can_manage_organization(source_organization_id))
  )
  with check (
    (select private.is_org_member(organization_id))
    or (select private.can_manage_organization(source_organization_id))
  );

create policy workflow_runs_all on public.workflow_runs for all to authenticated
  using ((select private.is_org_member(organization_id)))
  with check ((select private.is_org_member(organization_id)) and started_by = (select auth.uid()));

create policy audit_events_select_admin on public.audit_events for select to authenticated
  using ((select private.can_manage_organization(organization_id)));

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_memberships to authenticated;
grant select, insert, update, delete on public.organization_invites to authenticated;
grant select, insert, update on public.onboarding_progress to authenticated;
grant select, insert, update on public.companies to authenticated;
grant select, insert, update on public.capital_requests to authenticated;
grant select, insert, update on public.opportunities to authenticated;
grant select, insert, update, delete on public.opportunity_assignments to authenticated;
grant select, insert, update on public.authority_evidence to authenticated;
grant select, insert, update on public.source_documents to authenticated;
grant select, insert, update on public.evidence_facts to authenticated;
grant select, insert, update, delete on public.financial_periods to authenticated;
grant select, insert, update, delete on public.financial_line_items to authenticated;
grant select, insert, update on public.calculation_runs to authenticated;
grant select, insert, update, delete on public.structure_scenarios to authenticated;
grant select, insert, update, delete on public.scenario_versions to authenticated;
grant select, insert, update, delete on public.output_artifacts to authenticated;
grant select, insert, update, delete on public.output_versions to authenticated;
grant select, insert, update, delete on public.funds to authenticated;
grant select, insert, update, delete on public.mandate_versions to authenticated;
grant select, insert, update on public.published_opportunity_projections to authenticated;
grant select, insert, update on public.match_runs to authenticated;
grant select, insert, update on public.match_results to authenticated;
grant select, insert, update on public.disclosure_grants to authenticated;
grant select, insert, update on public.access_requests to authenticated;
grant select, insert, update on public.workflow_runs to authenticated;
grant select on public.audit_events to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'opportunity-documents',
  'opportunity-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy opportunity_documents_select
on storage.objects for select to authenticated
using (
  bucket_id = 'opportunity-documents'
  and (select private.can_access_opportunity(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.read'
  ))
);

create policy opportunity_documents_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'opportunity-documents'
  and (select private.can_access_opportunity(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.upload'
  ))
);

create policy opportunity_documents_update
on storage.objects for update to authenticated
using (
  bucket_id = 'opportunity-documents'
  and (select private.can_access_opportunity(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.write'
  ))
)
with check (
  bucket_id = 'opportunity-documents'
  and (select private.can_access_opportunity(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.write'
  ))
);

create policy opportunity_documents_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'opportunity-documents'
  and (select private.can_access_opportunity(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.delete'
  ))
);
