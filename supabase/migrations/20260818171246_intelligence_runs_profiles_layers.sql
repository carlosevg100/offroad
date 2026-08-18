-- Intelligence pipeline, phase F1: processing runs, job queue, document profiles and layers.
--
-- The P1 pipeline (docs/build/P1_INTELLIGENCE_PLAN.md) runs in an isolated worker outside
-- the web app. This migration creates the state it needs and the narrow commands it may
-- call, with three properties that must not regress:
--
--   1. No service role anywhere. The worker authenticates with a hashed worker credential
--      (private.worker_tokens) to *claim* a job, and from then on with a per-job capability
--      token issued at claim time and stored only as a hash. Its functions never accept an
--      organization_id from the caller: scope always comes from the claimed job.
--   2. Signed URLs are minted by the app (as the authenticated user) and travel inside the
--      job payload, so the worker needs no Storage credential. Organization members can see
--      run/job progress but not the payload (column-level grant).
--   3. Everything stays in the intake-session scope until confirmation, exactly like
--      candidates and issues do today.
--
-- Tables: processing_runs, processing_jobs, document_profiles, document_layers
-- Columns: source_documents (document_version, scan_result), document_intake_sessions
--          (current_run_id, pipeline_version), intake_field_candidates (verification fields)
-- Buckets: document-layers, case-artifacts (both private)
-- Commands: begin_processing_run (app) · worker_claim_job / worker_heartbeat /
--           worker_write_stage_result / worker_record_document_result /
--           worker_complete_job / worker_fail_job (worker)

-- ---------------------------------------------------------------------------------------------
-- Worker credentials (private schema — never exposed through the Data API)
-- ---------------------------------------------------------------------------------------------

create table private.worker_tokens (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(trim(label)) between 3 and 100),
  token_sha256 bytea not null unique,
  status text not null default 'active' check (status in ('active', 'revoked')),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table private.worker_tokens is
  'Hashed credentials of the document worker. Plaintext lives only in the deployment secret store; rotate by inserting a new row and revoking the old one.';

-- Validates a worker credential and returns its id. Raises when unknown or revoked.
create or replace function private.worker_identity(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_id uuid;
begin
  if p_token is null or char_length(p_token) < 32 then
    raise exception 'worker_token_invalid' using errcode = '42501';
  end if;

  update private.worker_tokens
  set last_used_at = now()
  where token_sha256 = extensions.digest(p_token, 'sha256') and status = 'active'
  returning id into token_id;

  if token_id is null then
    raise exception 'worker_token_invalid' using errcode = '42501';
  end if;
  return token_id;
end;
$$;

revoke all on function private.worker_identity(text) from public;

-- ---------------------------------------------------------------------------------------------
-- Processing runs
-- ---------------------------------------------------------------------------------------------

create table public.processing_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  run_no integer not null check (run_no > 0),
  trigger text not null check (trigger in ('upload', 'manual', 'answer', 'reprocess', 'document_removed')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
  pipeline_version text not null,
  stages jsonb not null default '[]'::jsonb check (jsonb_typeof(stages) = 'array'),
  budget jsonb not null default '{}'::jsonb check (jsonb_typeof(budget) = 'object'),
  usage jsonb not null default '{}'::jsonb check (jsonb_typeof(usage) = 'object'),
  versions jsonb not null default '{}'::jsonb check (jsonb_typeof(versions) = 'object'),
  error jsonb check (error is null or jsonb_typeof(error) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, intake_session_id, run_no),
  foreign key (organization_id, intake_session_id) references public.document_intake_sessions (organization_id, id) on delete cascade
);

create index processing_runs_session_idx
  on public.processing_runs (organization_id, intake_session_id, run_no desc);
create index processing_runs_status_idx
  on public.processing_runs (status, created_at)
  where status in ('queued', 'running');

-- ---------------------------------------------------------------------------------------------
-- Job queue (outbox consumed by the worker)
-- ---------------------------------------------------------------------------------------------

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  processing_run_id uuid not null,
  intake_session_id uuid not null,
  source_document_id uuid,
  kind text not null check (kind in ('document_pipeline', 'case_analysis')),
  status text not null default 'queued' check (status in ('queued', 'leased', 'succeeded', 'failed', 'poison', 'cancelled')),
  -- short-lived signed URLs and target paths minted by the app; never readable by tenants
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  leased_by uuid references private.worker_tokens (id),
  capability_sha256 bytea,
  last_error jsonb check (last_error is null or jsonb_typeof(last_error) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, processing_run_id) references public.processing_runs (organization_id, id) on delete cascade,
  foreign key (organization_id, intake_session_id) references public.document_intake_sessions (organization_id, id) on delete cascade,
  foreign key (organization_id, source_document_id) references public.source_documents (organization_id, id) on delete cascade
);

create index processing_jobs_queue_idx
  on public.processing_jobs (status, available_at)
  where status in ('queued', 'leased');
create index processing_jobs_run_idx
  on public.processing_jobs (organization_id, processing_run_id, status);

-- ---------------------------------------------------------------------------------------------
-- Document profiles (stage E1) and layers (stage E2)
-- ---------------------------------------------------------------------------------------------

create table public.document_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_document_id uuid not null,
  document_version integer not null default 1 check (document_version > 0),
  processing_run_id uuid,
  document_kind text not null check (document_kind in (
    'audited_financial_statements', 'auditor_report_only', 'reviewed_interim_statements',
    'trial_balance', 'erp_export', 'management_accounts', 'bank_statements', 'open_finance_export',
    'debt_schedule', 'loan_agreement', 'debenture_indenture', 'collateral_inventory',
    'appraisal_report', 'receivables_aging', 'payables_aging', 'business_plan',
    'financial_model', 'budget', 'investor_deck', 'cim', 'teaser', 'project_memorandum',
    'technical_report', 'capital_request_letter', 'company_registration', 'corporate_docs',
    'tax_clearance', 'regulatory_filing', 'customer_contract', 'supplier_contract',
    'insurance_policy', 'other'
  )),
  title text,
  entity_name text,
  entity_role text check (entity_role is null or entity_role in ('borrower', 'holding', 'subsidiary', 'guarantor', 'related_party', 'other')),
  entity_scope text check (entity_scope is null or entity_scope in ('consolidated', 'standalone', 'segment')),
  period_start date,
  period_end date,
  fiscal_year integer check (fiscal_year is null or fiscal_year between 1990 and 2100),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  scale numeric(20, 4) check (scale is null or scale > 0),
  accounting_basis text check (accounting_basis is null or accounting_basis in ('audited', 'reviewed', 'accounting', 'management', 'projection')),
  information_class text not null check (information_class in ('audited', 'reviewed', 'accounting', 'bank_statement', 'management', 'projection', 'company_document', 'calculated')),
  evidence_rank smallint not null check (evidence_rank between 1 and 7),
  language text check (language is null or language in ('pt', 'en', 'other')),
  quality jsonb not null default '{}'::jsonb check (jsonb_typeof(quality) = 'object'),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  suggested_folder text check (suggested_folder is null or suggested_folder in ('financial', 'debt_and_collateral', 'institutional_and_corporate', 'project_and_plan', 'contracts', 'other')),
  suggested_name text,
  classifier jsonb not null default '{}'::jsonb check (jsonb_typeof(classifier) = 'object'),
  confidence numeric(5, 4) not null check (confidence between 0 and 1),
  review_state text not null default 'proposed' check (review_state in ('proposed', 'accepted', 'edited', 'rejected')),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, source_document_id, document_version),
  check (period_end is null or period_start is null or period_end >= period_start),
  foreign key (organization_id, source_document_id) references public.source_documents (organization_id, id) on delete cascade,
  foreign key (organization_id, processing_run_id) references public.processing_runs (organization_id, id) on delete set null
);

create index document_profiles_kind_idx
  on public.document_profiles (organization_id, document_kind, period_end desc);

create table public.document_layers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_document_id uuid not null,
  document_version integer not null default 1 check (document_version > 0),
  processing_run_id uuid,
  layer_kind text not null check (layer_kind in ('pdf', 'spreadsheet', 'docx', 'pptx', 'csv', 'image')),
  bucket_id text not null default 'document-layers' check (bucket_id = 'document-layers'),
  object_path text not null,
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  parser_versions jsonb not null default '{}'::jsonb check (jsonb_typeof(parser_versions) = 'object'),
  stats jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object'),
  status text not null default 'ready' check (status in ('building', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, source_document_id, document_version),
  unique (organization_id, object_path),
  foreign key (organization_id, source_document_id) references public.source_documents (organization_id, id) on delete cascade,
  foreign key (organization_id, processing_run_id) references public.processing_runs (organization_id, id) on delete set null
);

-- ---------------------------------------------------------------------------------------------
-- Existing tables: document versions, scan result, verification fields, wider vocabularies
-- ---------------------------------------------------------------------------------------------

alter table public.source_documents
  add column document_version integer not null default 1 check (document_version > 0),
  add column scan_result jsonb check (scan_result is null or jsonb_typeof(scan_result) = 'object');

alter table public.document_intake_sessions
  add column current_run_id uuid,
  add column pipeline_version text,
  add constraint document_intake_sessions_current_run_fkey
    foreign key (organization_id, current_run_id)
    references public.processing_runs (organization_id, id) on delete set null;

alter table public.intake_field_candidates
  add column processing_run_id uuid,
  add column anchor_verified boolean not null default false,
  add column anchor_precision text check (anchor_precision is null or anchor_precision in ('cell', 'row', 'block', 'page', 'document')),
  add column entity_name text,
  add column entity_scope text check (entity_scope is null or entity_scope in ('consolidated', 'standalone', 'segment')),
  add column value_scale numeric(20, 4) check (value_scale is null or value_scale > 0),
  add column verifier_flags jsonb not null default '[]'::jsonb check (jsonb_typeof(verifier_flags) = 'array'),
  add constraint intake_field_candidates_run_fkey
    foreign key (organization_id, processing_run_id)
    references public.processing_runs (organization_id, id) on delete set null;

-- Widen the field-group vocabulary for the ontology groups that arrive with the general
-- extractor (debt instruments, customer concentration, management answers).
alter table public.intake_field_candidates
  drop constraint intake_field_candidates_field_group_check,
  add constraint intake_field_candidates_field_group_check check (field_group in (
    'company', 'transaction', 'historical_financials', 'interim_financials', 'projections',
    'project', 'leverage', 'collateral', 'debt', 'customers', 'management_questions'
  ));

alter table public.intake_issues
  drop constraint intake_issues_field_group_check,
  add constraint intake_issues_field_group_check check (field_group is null or field_group in (
    'company', 'transaction', 'historical_financials', 'interim_financials', 'projections',
    'project', 'leverage', 'collateral', 'debt', 'customers', 'management_questions'
  ));

-- Extraction methods produced by the P1 pipeline.
alter table public.intake_field_candidates
  drop constraint intake_field_candidates_extraction_method_check,
  add constraint intake_field_candidates_extraction_method_check check (extraction_method in (
    'native_text', 'ocr', 'spreadsheet_cell', 'deterministic_calculation', 'user_entry',
    'llm_anchored', 'vision_page', 'ocr_llm'
  ));

-- Reconciliation metadata on issues (P1 plan §8.4). Kept nullable so existing rows stay valid.
alter table public.intake_issues
  add column rule_id text,
  add column severity text check (severity is null or severity in ('critical', 'high', 'medium', 'low')),
  add column exception_type text check (exception_type is null or exception_type in (
    'arithmetic', 'period', 'entity', 'source_conflict', 'missing', 'plausibility', 'validation', 'quality', 'adjustment'
  )),
  add column owner_role text check (owner_role is null or owner_role in ('company', 'internal_analyst', 'external_advisor')),
  add column evidence jsonb check (evidence is null or jsonb_typeof(evidence) = 'object'),
  add column proposed_resolution jsonb check (proposed_resolution is null or jsonb_typeof(proposed_resolution) = 'object'),
  add column impacted_outputs jsonb not null default '[]'::jsonb check (jsonb_typeof(impacted_outputs) = 'array'),
  add column blocks_external_outputs boolean not null default false,
  add column processing_run_id uuid,
  add constraint intake_issues_run_fkey
    foreign key (organization_id, processing_run_id)
    references public.processing_runs (organization_id, id) on delete set null;

-- ---------------------------------------------------------------------------------------------
-- Private buckets for layers and case artifacts
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('document-layers', 'document-layers', false, 104857600, array['application/json', 'application/gzip']),
  ('case-artifacts', 'case-artifacts', false, 104857600, array[
    'application/pdf',
    'application/json',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ])
on conflict (id) do nothing;

-- Layers and artifacts follow the same `<organization_id>/<scope_id>/…` convention as
-- opportunity documents, so the existing path helpers apply.
create policy document_layers_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'document-layers'
  and (select private.can_access_document_scope(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.read'
  ))
);

create policy case_artifacts_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'case-artifacts'
  and (select private.can_access_document_scope(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.read'
  ))
);

create policy case_artifacts_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'case-artifacts'
  and (select private.can_access_document_scope(
    private.storage_organization_id(name),
    private.storage_opportunity_id(name),
    'document.write'
  ))
);

-- ---------------------------------------------------------------------------------------------
-- Triggers, RLS, policies and grants
-- ---------------------------------------------------------------------------------------------

create trigger processing_runs_set_updated_at before update on public.processing_runs
  for each row execute function private.set_updated_at();
create trigger processing_jobs_set_updated_at before update on public.processing_jobs
  for each row execute function private.set_updated_at();
create trigger document_profiles_set_updated_at before update on public.document_profiles
  for each row execute function private.set_updated_at();
create trigger document_layers_set_updated_at before update on public.document_layers
  for each row execute function private.set_updated_at();

create trigger processing_runs_audit after insert or update or delete on public.processing_runs
  for each row execute function private.capture_audit_event();
create trigger document_profiles_audit after insert or update or delete on public.document_profiles
  for each row execute function private.capture_audit_event();

alter table public.processing_runs enable row level security;
alter table public.processing_runs force row level security;
alter table public.processing_jobs enable row level security;
alter table public.processing_jobs force row level security;
alter table public.document_profiles enable row level security;
alter table public.document_profiles force row level security;
alter table public.document_layers enable row level security;
alter table public.document_layers force row level security;

-- Runs are read-only for tenants: they are created and advanced by commands.
create policy processing_runs_select on public.processing_runs for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

-- Jobs are internal. Tenants may follow progress but never read the payload (column grant
-- below); no insert/update/delete policy exists, so only the security-definer commands write.
create policy processing_jobs_select on public.processing_jobs for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

create policy document_profiles_select on public.document_profiles for select to authenticated
  using ((select private.can_access_document_scope(
    organization_id,
    (select coalesce(sd.intake_session_id, sd.opportunity_id) from public.source_documents sd
      where sd.organization_id = document_profiles.organization_id and sd.id = document_profiles.source_document_id),
    'document.read'
  )));
create policy document_profiles_update on public.document_profiles for update to authenticated
  using ((select private.can_access_document_scope(
    organization_id,
    (select coalesce(sd.intake_session_id, sd.opportunity_id) from public.source_documents sd
      where sd.organization_id = document_profiles.organization_id and sd.id = document_profiles.source_document_id),
    'document.write'
  )))
  with check ((select private.can_access_document_scope(
    organization_id,
    (select coalesce(sd.intake_session_id, sd.opportunity_id) from public.source_documents sd
      where sd.organization_id = document_profiles.organization_id and sd.id = document_profiles.source_document_id),
    'document.write'
  )));

create policy document_layers_select on public.document_layers for select to authenticated
  using ((select private.can_access_document_scope(
    organization_id,
    (select coalesce(sd.intake_session_id, sd.opportunity_id) from public.source_documents sd
      where sd.organization_id = document_layers.organization_id and sd.id = document_layers.source_document_id),
    'document.read'
  )));

grant select on public.processing_runs to authenticated;
grant select (id, organization_id, processing_run_id, intake_session_id, source_document_id, kind, status, attempts, max_attempts, available_at, lease_expires_at, created_at, updated_at)
  on public.processing_jobs to authenticated;
grant select, update on public.document_profiles to authenticated;
grant select on public.document_layers to authenticated;

-- ---------------------------------------------------------------------------------------------
-- App command: open a processing run for the documents of a session
-- ---------------------------------------------------------------------------------------------

-- p_documents: [{"source_document_id": uuid, "download_url": text, "layer_object_path": text,
--                "layer_upload_url": text}]
-- Signed URLs are minted by the caller (the authenticated user's Storage client) and stay in
-- the job payload, which tenants cannot read. They are short-lived: an expired URL makes the
-- job fail as retryable and the app opens a new run.
--
-- SECURITY DEFINER on purpose (AGENTS.md §6 requires the reason to be documented): tenants
-- have SELECT-only access to runs and jobs, so they can watch progress but can never forge a
-- job — in particular they cannot choose the payload, which would let them point the worker
-- at a URL of their choosing. Authorization is explicit on entry:
-- private.intake_session_for_update checks the caller, the organization type and the session,
-- and every statement below is filtered by (organization_id, intake_session_id).
create or replace function public.begin_processing_run(
  p_organization_id uuid,
  p_session_id uuid,
  p_trigger text,
  p_documents jsonb,
  p_pipeline_version text,
  p_budget jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
  run_row public.processing_runs;
  next_run_no integer;
  document_entry jsonb;
  document_row public.source_documents;
  created_jobs uuid[] := array[]::uuid[];
  job_id uuid;
begin
  if p_trigger not in ('upload', 'manual', 'answer', 'reprocess', 'document_removed') then
    raise exception 'processing_trigger_invalid' using errcode = '22023';
  end if;
  if p_documents is null or jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) = 0 then
    raise exception 'processing_documents_required' using errcode = '22023';
  end if;
  if coalesce(trim(p_pipeline_version), '') = '' then
    raise exception 'pipeline_version_required' using errcode = '22023';
  end if;

  session_row := private.intake_session_for_update(p_organization_id, p_session_id);

  if session_row.status not in ('collecting', 'processing', 'review_ready', 'failed') then
    raise exception 'intake_session_not_processable' using errcode = '22023';
  end if;

  select coalesce(max(run_no), 0) + 1 into next_run_no
  from public.processing_runs
  where organization_id = p_organization_id and intake_session_id = p_session_id;

  insert into public.processing_runs (
    organization_id, intake_session_id, run_no, trigger, status, pipeline_version, budget, created_by
  )
  values (
    p_organization_id, p_session_id, next_run_no, p_trigger, 'queued', trim(p_pipeline_version),
    coalesce(p_budget, '{}'::jsonb), (select auth.uid())
  )
  returning * into run_row;

  for document_entry in select * from jsonb_array_elements(p_documents)
  loop
    select * into document_row
    from public.source_documents
    where organization_id = p_organization_id
      and id = (document_entry->>'source_document_id')::uuid
      and intake_session_id = p_session_id;

    if not found then
      raise exception 'source_document_not_in_session' using errcode = 'P0002';
    end if;

    insert into public.processing_jobs (
      organization_id, processing_run_id, intake_session_id, source_document_id, kind, payload
    )
    values (
      p_organization_id, run_row.id, p_session_id, document_row.id, 'document_pipeline',
      jsonb_strip_nulls(jsonb_build_object(
        'source_document_id', document_row.id,
        'document_version', document_row.document_version,
        'original_name', document_row.original_name,
        'mime_type', document_row.mime_type,
        'byte_size', document_row.byte_size,
        'sha256', document_row.sha256,
        'object_path', document_row.object_path,
        'download_url', document_entry->>'download_url',
        'layer_object_path', document_entry->>'layer_object_path',
        'layer_upload_url', document_entry->>'layer_upload_url',
        'locale', session_row.locale
      ))
    )
    returning id into job_id;

    created_jobs := created_jobs || job_id;
  end loop;

  update public.document_intake_sessions
  set status = 'processing',
      current_run_id = run_row.id,
      pipeline_version = trim(p_pipeline_version),
      processing_started_at = now(),
      processing_completed_at = null
  where organization_id = p_organization_id and id = p_session_id;

  return jsonb_build_object(
    'processing_run_id', run_row.id,
    'run_no', run_row.run_no,
    'job_ids', to_jsonb(created_jobs),
    'job_count', coalesce(array_length(created_jobs, 1), 0)
  );
end;
$$;

revoke all on function public.begin_processing_run(uuid, uuid, text, jsonb, text, jsonb) from public;
grant execute on function public.begin_processing_run(uuid, uuid, text, jsonb, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Worker commands. Two independent credentials, neither sufficient alone:
--   * the worker signs in as a dedicated Supabase service account (so these functions are
--     never reachable anonymously and Supabase auth logs/limits apply). That account is a
--     member of no organization, so RLS grants it nothing on its own;
--   * every call carries either the hashed worker credential (claim) or the per-job
--     capability token issued at claim time (everything after).
-- None of them accepts an organization_id — scope always comes from the claimed job.
-- ---------------------------------------------------------------------------------------------

create or replace function private.job_for_capability(p_job_id uuid, p_capability_token text)
returns public.processing_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs;
begin
  if p_capability_token is null or char_length(p_capability_token) < 32 then
    raise exception 'job_capability_invalid' using errcode = '42501';
  end if;

  select * into job_row
  from public.processing_jobs
  where id = p_job_id
    and status = 'leased'
    and capability_sha256 = extensions.digest(p_capability_token, 'sha256')
    and lease_expires_at > now()
  for update;

  if not found then
    raise exception 'job_capability_invalid' using errcode = '42501';
  end if;
  return job_row;
end;
$$;

revoke all on function private.job_for_capability(uuid, text) from public;

create or replace function public.worker_claim_job(
  p_worker_token text,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_id uuid := private.worker_identity(p_worker_token);
  lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 600), 60), 3600);
  capability_token text := encode(extensions.gen_random_bytes(32), 'hex');
  job_row public.processing_jobs;
begin
  -- reclaim expired leases as well as fresh jobs, oldest first
  select * into job_row
  from public.processing_jobs
  where (status = 'queued' and available_at <= now())
     or (status = 'leased' and lease_expires_at < now())
  order by available_at
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('claimed', false);
  end if;

  if job_row.attempts + 1 > job_row.max_attempts then
    update public.processing_jobs
    set status = 'poison',
        capability_sha256 = null,
        leased_by = null,
        lease_expires_at = null,
        last_error = coalesce(job_row.last_error, '{}'::jsonb) || jsonb_build_object('reason', 'max_attempts_exceeded')
    where id = job_row.id;

    update public.processing_runs
    set status = 'failed',
        error = jsonb_build_object('reason', 'job_poison', 'job_id', job_row.id),
        completed_at = now()
    where organization_id = job_row.organization_id and id = job_row.processing_run_id;

    return jsonb_build_object('claimed', false, 'poisoned_job_id', job_row.id);
  end if;

  update public.processing_jobs
  set status = 'leased',
      attempts = job_row.attempts + 1,
      leased_by = worker_id,
      lease_expires_at = now() + make_interval(secs => lease_seconds),
      capability_sha256 = extensions.digest(capability_token, 'sha256')
  where id = job_row.id
  returning * into job_row;

  update public.processing_runs
  set status = case when status = 'queued' then 'running' else status end,
      started_at = coalesce(started_at, now())
  where organization_id = job_row.organization_id and id = job_row.processing_run_id;

  return jsonb_build_object(
    'claimed', true,
    'job_id', job_row.id,
    'capability_token', capability_token,
    'lease_expires_at', job_row.lease_expires_at,
    'attempt', job_row.attempts,
    'kind', job_row.kind,
    'organization_id', job_row.organization_id,
    'intake_session_id', job_row.intake_session_id,
    'processing_run_id', job_row.processing_run_id,
    'payload', job_row.payload
  );
end;
$$;

revoke all on function public.worker_claim_job(text, integer) from public;
grant execute on function public.worker_claim_job(text, integer) to authenticated;

create or replace function public.worker_heartbeat(
  p_job_id uuid,
  p_capability_token text,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 600), 60), 3600);
begin
  update public.processing_jobs
  set lease_expires_at = now() + make_interval(secs => lease_seconds)
  where id = job_row.id
  returning * into job_row;

  return jsonb_build_object('job_id', job_row.id, 'lease_expires_at', job_row.lease_expires_at);
end;
$$;

revoke all on function public.worker_heartbeat(uuid, text, integer) from public;
grant execute on function public.worker_heartbeat(uuid, text, integer) to authenticated;

-- Adds numeric keys of two flat jsonb objects (token/cost accumulation on the run).
create or replace function public.jsonb_merge_numeric(p_left jsonb, p_right jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_object_agg(key, value)
      from (
        select key,
          case
            when jsonb_typeof(coalesce(l.value, r.value)) = 'number'
              then to_jsonb(coalesce((l.value)::numeric, 0) + coalesce((r.value)::numeric, 0))
            else coalesce(r.value, l.value)
          end as value
        from jsonb_each(coalesce(p_left, '{}'::jsonb)) l
        full outer join jsonb_each(coalesce(p_right, '{}'::jsonb)) r using (key)
      ) merged
    ),
    '{}'::jsonb
  );
$$;

revoke all on function public.jsonb_merge_numeric(jsonb, jsonb) from public;
grant execute on function public.jsonb_merge_numeric(jsonb, jsonb) to authenticated;

-- Progress of one stage of the pipeline (portaria, perfil, camadas, …) on the run timeline.
create or replace function public.worker_write_stage_result(
  p_job_id uuid,
  p_capability_token text,
  p_stage text,
  p_status text,
  p_detail jsonb default '{}'::jsonb,
  p_usage jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  stage_entry jsonb;
begin
  if coalesce(trim(p_stage), '') = '' then
    raise exception 'stage_required' using errcode = '22023';
  end if;
  if p_status not in ('started', 'succeeded', 'failed', 'skipped') then
    raise exception 'stage_status_invalid' using errcode = '22023';
  end if;

  stage_entry := jsonb_build_object(
    'stage', trim(p_stage),
    'status', p_status,
    'job_id', job_row.id,
    'source_document_id', job_row.source_document_id,
    'at', to_jsonb(now()),
    'detail', coalesce(p_detail, '{}'::jsonb)
  );

  update public.processing_runs
  set stages = stages || jsonb_build_array(stage_entry),
      usage = public.jsonb_merge_numeric(usage, coalesce(p_usage, '{}'::jsonb))
  where organization_id = job_row.organization_id and id = job_row.processing_run_id;

  return jsonb_build_object('recorded', true, 'stage', trim(p_stage), 'status', p_status);
end;
$$;

revoke all on function public.worker_write_stage_result(uuid, text, text, text, jsonb, jsonb) from public;
grant execute on function public.worker_write_stage_result(uuid, text, text, text, jsonb, jsonb) to authenticated;

-- Result of the deterministic part of one document: scan verdict, profile and layer pointer.
create or replace function public.worker_record_document_result(
  p_job_id uuid,
  p_capability_token text,
  p_scan_result jsonb,
  p_profile jsonb,
  p_layer jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  document_row public.source_documents;
  profile_id uuid;
  layer_id uuid;
begin
  if job_row.source_document_id is null then
    raise exception 'job_has_no_document' using errcode = '22023';
  end if;

  select * into document_row
  from public.source_documents
  where organization_id = job_row.organization_id and id = job_row.source_document_id
  for update;

  if not found then
    raise exception 'source_document_not_found' using errcode = 'P0002';
  end if;

  if p_scan_result is not null then
    update public.source_documents
    set scan_result = p_scan_result,
        processing_status = case
          when coalesce(p_scan_result->>'verdict', 'clean') = 'clean' then 'processing'
          else 'rejected'
        end
    where organization_id = job_row.organization_id and id = document_row.id;
  end if;

  if p_layer is not null then
    insert into public.document_layers (
      organization_id, source_document_id, document_version, processing_run_id, layer_kind,
      object_path, sha256, byte_size, parser_versions, stats, status
    )
    values (
      job_row.organization_id, document_row.id, document_row.document_version, job_row.processing_run_id,
      p_layer->>'layer_kind', p_layer->>'object_path', p_layer->>'sha256',
      (p_layer->>'byte_size')::bigint,
      coalesce(p_layer->'parser_versions', '{}'::jsonb), coalesce(p_layer->'stats', '{}'::jsonb),
      coalesce(p_layer->>'status', 'ready')
    )
    on conflict (organization_id, source_document_id, document_version) do update
    set processing_run_id = excluded.processing_run_id,
        layer_kind = excluded.layer_kind,
        object_path = excluded.object_path,
        sha256 = excluded.sha256,
        byte_size = excluded.byte_size,
        parser_versions = excluded.parser_versions,
        stats = excluded.stats,
        status = excluded.status
    returning id into layer_id;
  end if;

  if p_profile is not null then
    insert into public.document_profiles as dp (
      organization_id, source_document_id, document_version, processing_run_id, document_kind,
      title, entity_name, entity_role, entity_scope, period_start, period_end, fiscal_year,
      currency, scale, accounting_basis, information_class, evidence_rank, language,
      quality, summary, suggested_folder, suggested_name, classifier, confidence
    )
    values (
      job_row.organization_id, document_row.id, document_row.document_version, job_row.processing_run_id,
      p_profile->>'document_kind', p_profile->>'title', p_profile->>'entity_name',
      p_profile->>'entity_role', p_profile->>'entity_scope',
      (p_profile->>'period_start')::date, (p_profile->>'period_end')::date,
      (p_profile->>'fiscal_year')::integer, p_profile->>'currency', (p_profile->>'scale')::numeric,
      p_profile->>'accounting_basis', p_profile->>'information_class',
      (p_profile->>'evidence_rank')::smallint, p_profile->>'language',
      coalesce(p_profile->'quality', '{}'::jsonb), coalesce(p_profile->'summary', '{}'::jsonb),
      p_profile->>'suggested_folder', p_profile->>'suggested_name',
      coalesce(p_profile->'classifier', '{}'::jsonb), (p_profile->>'confidence')::numeric
    )
    on conflict (organization_id, source_document_id, document_version) do update
    set processing_run_id = excluded.processing_run_id,
        document_kind = excluded.document_kind,
        title = excluded.title,
        entity_name = excluded.entity_name,
        entity_role = excluded.entity_role,
        entity_scope = excluded.entity_scope,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        fiscal_year = excluded.fiscal_year,
        currency = excluded.currency,
        scale = excluded.scale,
        accounting_basis = excluded.accounting_basis,
        information_class = excluded.information_class,
        evidence_rank = excluded.evidence_rank,
        language = excluded.language,
        quality = excluded.quality,
        summary = excluded.summary,
        suggested_folder = excluded.suggested_folder,
        suggested_name = excluded.suggested_name,
        classifier = excluded.classifier,
        confidence = excluded.confidence
    -- a re-run supersedes a previous proposal but never a human decision
    where dp.review_state = 'proposed'
    returning dp.id into profile_id;
  end if;

  return jsonb_strip_nulls(jsonb_build_object('profile_id', profile_id, 'layer_id', layer_id));
end;
$$;

revoke all on function public.worker_record_document_result(uuid, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.worker_record_document_result(uuid, text, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.worker_complete_job(
  p_job_id uuid,
  p_capability_token text,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  pending integer;
  failed integer;
begin
  update public.processing_jobs
  set status = 'succeeded',
      result = coalesce(p_result, '{}'::jsonb),
      capability_sha256 = null,
      leased_by = null,
      lease_expires_at = null
  where id = job_row.id;

  update public.source_documents
  set processing_status = 'ready'
  where organization_id = job_row.organization_id
    and id = job_row.source_document_id
    and processing_status = 'processing';

  select
    count(*) filter (where status in ('queued', 'leased')),
    count(*) filter (where status in ('failed', 'poison'))
  into pending, failed
  from public.processing_jobs
  where organization_id = job_row.organization_id and processing_run_id = job_row.processing_run_id;

  if pending = 0 then
    update public.processing_runs
    set status = case when failed > 0 then 'partial' else 'succeeded' end,
        completed_at = now()
    where organization_id = job_row.organization_id and id = job_row.processing_run_id;
  end if;

  return jsonb_build_object('job_id', job_row.id, 'pending_jobs', pending, 'failed_jobs', failed);
end;
$$;

revoke all on function public.worker_complete_job(uuid, text, jsonb) from public;
grant execute on function public.worker_complete_job(uuid, text, jsonb) to authenticated;

create or replace function public.worker_fail_job(
  p_job_id uuid,
  p_capability_token text,
  p_error jsonb,
  p_retryable boolean default true,
  p_retry_in_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  retry_seconds integer := least(greatest(coalesce(p_retry_in_seconds, 60), 5), 3600);
  will_retry boolean;
  pending integer;
  failed integer;
begin
  will_retry := coalesce(p_retryable, true) and job_row.attempts < job_row.max_attempts;

  update public.processing_jobs
  set status = case when will_retry then 'queued' else 'failed' end,
      available_at = case when will_retry then now() + make_interval(secs => retry_seconds) else available_at end,
      capability_sha256 = null,
      leased_by = null,
      lease_expires_at = null,
      last_error = coalesce(p_error, '{}'::jsonb)
  where id = job_row.id;

  if not will_retry then
    update public.source_documents
    set processing_status = 'failed'
    where organization_id = job_row.organization_id
      and id = job_row.source_document_id
      and processing_status in ('processing', 'quarantined', 'scanning');
  end if;

  select
    count(*) filter (where status in ('queued', 'leased')),
    count(*) filter (where status in ('failed', 'poison'))
  into pending, failed
  from public.processing_jobs
  where organization_id = job_row.organization_id and processing_run_id = job_row.processing_run_id;

  if pending = 0 then
    update public.processing_runs
    set status = case when failed > 0 then 'failed' else 'succeeded' end,
        error = case when failed > 0 then coalesce(p_error, '{}'::jsonb) else error end,
        completed_at = now()
    where organization_id = job_row.organization_id and id = job_row.processing_run_id;

    if failed > 0 then
      update public.document_intake_sessions
      set status = 'failed'
      where organization_id = job_row.organization_id
        and id = job_row.intake_session_id
        and status = 'processing';
    end if;
  end if;

  return jsonb_build_object('job_id', job_row.id, 'retrying', will_retry, 'pending_jobs', pending, 'failed_jobs', failed);
end;
$$;

revoke all on function public.worker_fail_job(uuid, text, jsonb, boolean, integer) from public;
grant execute on function public.worker_fail_job(uuid, text, jsonb, boolean, integer) to authenticated;
