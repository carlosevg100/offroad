-- Controlled production: immutable case inputs, primary/shadow/replay executions, per-tenant
-- rollout state and release evidence that cannot be replaced by synthetic fixtures.
--
-- The browser may read its own redacted execution status. It cannot change a rollout state,
-- attest a real case, enqueue a shadow/replay, write a comparison or approve external release.
-- Full frozen inputs and reports stay in the private schema and are reachable only through a
-- claimed worker job capability.

-- ---------------------------------------------------------------------------------------------
-- Per-organization rollout. Existing pre-launch pipeline users start in canary, never active.
-- External release remains false until both real-case cohorts and founder approval exist.
-- ---------------------------------------------------------------------------------------------

create table public.organization_rollout_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  state text not null check (state in ('off', 'shadow', 'canary', 'active', 'paused')),
  policy_version text not null default '2026.08.24-v1',
  target_pipeline_version text not null default 'f2-2026.08.24',
  target_model_policy_version text not null default '2026.08.24-v1',
  external_release_enabled boolean not null default false,
  promotion_basis text not null default 'prelaunch_bootstrap'
    check (char_length(promotion_basis) between 3 and 500),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organization_rollout_policies is
  'Platform-owned rollout state. Canary controls internal case processing; active plus external_release_enabled requires two accepted real-case cohorts and an explicit release decision.';

insert into public.organization_rollout_policies (
  organization_id, state, external_release_enabled, promotion_basis
)
select
  organization.id,
  case when organization.pipeline_enabled then 'canary' else 'off' end,
  false,
  'existing pre-launch pipeline state migrated without external release'
from public.organizations organization
on conflict (organization_id) do nothing;

create or replace function private.bootstrap_organization_rollout_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_rollout_policies (
    organization_id, state, external_release_enabled, promotion_basis
  ) values (
    new.id,
    case when new.pipeline_enabled then 'canary' else 'off' end,
    false,
    'new pre-launch organization; external release disabled'
  ) on conflict (organization_id) do nothing;
  return new;
end;
$$;

revoke all on function private.bootstrap_organization_rollout_policy() from public, anon, authenticated;

create trigger organizations_bootstrap_rollout_policy
  after insert on public.organizations
  for each row execute function private.bootstrap_organization_rollout_policy();

create trigger organization_rollout_policies_set_updated_at
  before update on public.organization_rollout_policies
  for each row execute function private.set_updated_at();

alter table public.organization_rollout_policies enable row level security;
alter table public.organization_rollout_policies force row level security;

create policy organization_rollout_policies_select
  on public.organization_rollout_policies for select to authenticated
  using ((select private.is_org_member(organization_id)));

create trigger organization_rollout_policies_audit
  after insert or update or delete on public.organization_rollout_policies
  for each row execute function private.capture_audit_event();

revoke all privileges on public.organization_rollout_policies from anon, authenticated;
grant select on public.organization_rollout_policies to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Public, content-free execution ledger and comparisons.
-- ---------------------------------------------------------------------------------------------

create table public.controlled_case_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  processing_run_id uuid not null,
  mode text not null check (mode in ('primary', 'shadow', 'replay')),
  baseline_execution_id uuid,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'blocked', 'failed', 'cancelled')),
  pipeline_version text not null,
  model_policy_version text not null,
  input_fingerprint text check (input_fingerprint is null or input_fingerprint ~ '^[0-9a-f]{64}$'),
  report_fingerprint text check (report_fingerprint is null or report_fingerprint ~ '^[0-9a-f]{64}$'),
  manifest_fingerprint text check (manifest_fingerprint is null or manifest_fingerprint ~ '^[0-9a-f]{64}$'),
  comparison_passed boolean,
  critical_regression_count integer not null default 0 check (critical_regression_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, processing_run_id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, processing_run_id)
    references public.processing_runs(organization_id, id) on delete cascade,
  foreign key (organization_id, baseline_execution_id)
    references public.controlled_case_executions(organization_id, id) on delete restrict,
  check ((mode = 'primary' and baseline_execution_id is null)
    or (mode in ('shadow', 'replay') and baseline_execution_id is not null)),
  check (mode <> 'primary' or comparison_passed is null)
);

create index controlled_case_executions_session_idx
  on public.controlled_case_executions (organization_id, intake_session_id, created_at desc);
create index controlled_case_executions_baseline_idx
  on public.controlled_case_executions (organization_id, baseline_execution_id, mode, created_at desc)
  where baseline_execution_id is not null;
create unique index controlled_case_executions_one_candidate_idx
  on public.controlled_case_executions (
    organization_id, baseline_execution_id, mode, pipeline_version, model_policy_version
  ) where baseline_execution_id is not null;

create table public.case_execution_comparisons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  baseline_execution_id uuid not null,
  candidate_execution_id uuid not null,
  mode text not null check (mode in ('shadow', 'replay')),
  comparable boolean not null,
  passed boolean not null,
  critical_count integer not null check (critical_count >= 0),
  warning_count integer not null check (warning_count >= 0),
  differences jsonb not null check (jsonb_typeof(differences) = 'array'),
  comparison_fingerprint text not null check (comparison_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, candidate_execution_id),
  foreign key (organization_id, baseline_execution_id)
    references public.controlled_case_executions(organization_id, id) on delete restrict,
  foreign key (organization_id, candidate_execution_id)
    references public.controlled_case_executions(organization_id, id) on delete cascade,
  check (baseline_execution_id <> candidate_execution_id)
);

create index case_execution_comparisons_baseline_idx
  on public.case_execution_comparisons (organization_id, baseline_execution_id, created_at desc);

create trigger controlled_case_executions_set_updated_at
  before update on public.controlled_case_executions
  for each row execute function private.set_updated_at();

alter table public.controlled_case_executions enable row level security;
alter table public.controlled_case_executions force row level security;
alter table public.case_execution_comparisons enable row level security;
alter table public.case_execution_comparisons force row level security;

create policy controlled_case_executions_select
  on public.controlled_case_executions for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

create policy case_execution_comparisons_select
  on public.case_execution_comparisons for select to authenticated
  using ((select private.is_org_member(organization_id)));

create trigger controlled_case_executions_audit
  after insert or update or delete on public.controlled_case_executions
  for each row execute function private.capture_audit_event();
create trigger case_execution_comparisons_audit
  after insert or update or delete on public.case_execution_comparisons
  for each row execute function private.capture_audit_event();

revoke all privileges on public.controlled_case_executions from anon, authenticated;
revoke all privileges on public.case_execution_comparisons from anon, authenticated;
grant select on public.controlled_case_executions to authenticated;
grant select on public.case_execution_comparisons to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Private frozen inputs, full reports and release evidence. No Data API grants.
-- ---------------------------------------------------------------------------------------------

create table private.case_execution_inputs (
  organization_id uuid not null,
  execution_id uuid not null,
  input_json jsonb not null check (jsonb_typeof(input_json) = 'object'),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now(),
  primary key (organization_id, execution_id),
  foreign key (organization_id, execution_id)
    references public.controlled_case_executions(organization_id, id) on delete cascade
);

create table private.case_execution_results (
  organization_id uuid not null,
  execution_id uuid not null,
  report jsonb not null check (jsonb_typeof(report) = 'object'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  comparison jsonb check (comparison is null or jsonb_typeof(comparison) = 'object'),
  recorded_at timestamptz not null default now(),
  primary key (organization_id, execution_id),
  foreign key (organization_id, execution_id)
    references public.controlled_case_executions(organization_id, id) on delete cascade
);

create table private.release_cohorts (
  id uuid primary key default gen_random_uuid(),
  cohort_kind text not null check (cohort_kind in ('wave_1', 'wave_2')),
  pipeline_version text not null,
  model_policy_version text not null,
  status text not null default 'draft' check (status in ('draft', 'accepted', 'rejected')),
  acceptance_note text,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (cohort_kind, pipeline_version, model_policy_version),
  check (status <> 'accepted' or (accepted_at is not null and char_length(trim(acceptance_note)) >= 10))
);

create table private.release_cohort_cases (
  cohort_id uuid not null references private.release_cohorts(id) on delete cascade,
  organization_id uuid not null,
  intake_session_id uuid not null,
  baseline_execution_id uuid not null,
  candidate_execution_id uuid not null,
  real_case_attested boolean not null check (real_case_attested),
  attestation_basis text not null check (char_length(attestation_basis) between 10 and 1000),
  attested_by uuid references auth.users(id),
  attested_at timestamptz not null default now(),
  primary key (cohort_id, intake_session_id),
  unique (cohort_id, candidate_execution_id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete restrict,
  foreign key (organization_id, baseline_execution_id)
    references public.controlled_case_executions(organization_id, id) on delete restrict,
  foreign key (organization_id, candidate_execution_id)
    references public.controlled_case_executions(organization_id, id) on delete restrict
);

create table private.release_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  from_state text not null check (from_state in ('off', 'shadow', 'canary', 'active', 'paused')),
  to_state text not null check (to_state in ('off', 'shadow', 'canary', 'active', 'paused')),
  wave_1_cohort_id uuid references private.release_cohorts(id) on delete restrict,
  wave_2_cohort_id uuid references private.release_cohorts(id) on delete restrict,
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  approval_note text not null check (char_length(approval_note) between 10 and 2000),
  approved_by uuid references auth.users(id),
  approved_at timestamptz not null default now()
);

revoke all privileges on private.case_execution_inputs from public, anon, authenticated;
revoke all privileges on private.case_execution_results from public, anon, authenticated;
revoke all privileges on private.release_cohorts from public, anon, authenticated;
revoke all privileges on private.release_cohort_cases from public, anon, authenticated;
revoke all privileges on private.release_decisions from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Bind every case-analysis job to an execution. Existing queued jobs remain compatible and are
-- bound lazily by worker_freeze_case_input before they can run.
-- ---------------------------------------------------------------------------------------------

alter table public.processing_jobs
  add column controlled_execution_id uuid;

alter table public.processing_jobs
  add constraint processing_jobs_controlled_execution_fkey
  foreign key (organization_id, controlled_execution_id)
  references public.controlled_case_executions(organization_id, id) on delete cascade;

create index processing_jobs_controlled_execution_idx
  on public.processing_jobs (organization_id, controlled_execution_id)
  where controlled_execution_id is not null;

drop index if exists public.processing_jobs_case_analysis_run_idx;
create unique index processing_jobs_case_analysis_execution_idx
  on public.processing_jobs (organization_id, controlled_execution_id)
  where kind = 'case_analysis' and controlled_execution_id is not null;

create or replace function private.enqueue_case_analysis_after_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_id uuid;
  session_locale text;
  run_version text;
  run_creator uuid;
begin
  if new.kind <> 'document_pipeline'
    or new.status not in ('succeeded', 'failed', 'poison', 'cancelled')
    or old.status = new.status then
    return new;
  end if;

  if exists (
    select 1 from public.processing_jobs pending
    where pending.organization_id = new.organization_id
      and pending.processing_run_id = new.processing_run_id
      and pending.kind = 'document_pipeline'
      and pending.status in ('queued', 'leased')
  ) then
    return new;
  end if;

  select session.locale, run.pipeline_version, run.created_by
  into session_locale, run_version, run_creator
  from public.document_intake_sessions session
  join public.processing_runs run
    on run.organization_id = session.organization_id
   and run.id = new.processing_run_id
   and run.intake_session_id = session.id
  where session.organization_id = new.organization_id
    and session.id = new.intake_session_id
    and session.current_run_id = new.processing_run_id
    and session.status = 'processing';

  if not found then return new; end if;

  select execution.id into execution_id
  from public.controlled_case_executions execution
  where execution.organization_id = new.organization_id
    and execution.processing_run_id = new.processing_run_id;

  if execution_id is null then
    insert into public.controlled_case_executions (
      organization_id, intake_session_id, processing_run_id, mode, status,
      pipeline_version, model_policy_version, created_by
    ) values (
      new.organization_id, new.intake_session_id, new.processing_run_id, 'primary', 'queued',
      run_version,
      coalesce((select policy.target_model_policy_version
        from public.organization_rollout_policies policy
        where policy.organization_id = new.organization_id), '2026.08.24-v1'),
      run_creator
    ) returning id into execution_id;
  end if;

  insert into public.processing_jobs (
    organization_id, processing_run_id, intake_session_id, kind, payload,
    controlled_execution_id, max_attempts
  ) values (
    new.organization_id,
    new.processing_run_id,
    new.intake_session_id,
    'case_analysis',
    jsonb_build_object(
      'locale', session_locale,
      'execution_id', execution_id,
      'execution_mode', 'primary'
    ),
    execution_id,
    2
  ) on conflict (organization_id, controlled_execution_id)
    where kind = 'case_analysis' and controlled_execution_id is not null do nothing;

  return new;
end;
$$;

revoke all on function private.enqueue_case_analysis_after_documents() from public, anon, authenticated;

-- Freeze once. Shadow and replay executions receive the baseline bytes, not a fresh read from
-- mutable intake tables. The input hash is calculated in Postgres over canonical jsonb text.
create or replace function private.worker_freeze_case_input(
  p_job_id uuid,
  p_capability_token text,
  p_live_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  execution_row public.controlled_case_executions;
  baseline_input private.case_execution_inputs;
  frozen private.case_execution_inputs;
  execution_id uuid := job_row.controlled_execution_id;
  input_hash text;
  baseline_report jsonb;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_live_input) <> 'object' then
    raise exception 'case_execution_input_must_be_object' using errcode = '22023';
  end if;

  if execution_id is null then
    insert into public.controlled_case_executions (
      organization_id, intake_session_id, processing_run_id, mode, status,
      pipeline_version, model_policy_version, created_by
    )
    select
      job_row.organization_id, job_row.intake_session_id, job_row.processing_run_id,
      'primary', 'queued', run.pipeline_version,
      coalesce(policy.target_model_policy_version, '2026.08.24-v1'), run.created_by
    from public.processing_runs run
    left join public.organization_rollout_policies policy
      on policy.organization_id = run.organization_id
    where run.organization_id = job_row.organization_id and run.id = job_row.processing_run_id
    on conflict (organization_id, processing_run_id) do update set updated_at = now()
    returning id into execution_id;

    update public.processing_jobs set controlled_execution_id = execution_id,
      payload = payload || jsonb_build_object('execution_id', execution_id, 'execution_mode', 'primary')
    where id = job_row.id and organization_id = job_row.organization_id;
  end if;

  select * into execution_row
  from public.controlled_case_executions execution
  where execution.organization_id = job_row.organization_id and execution.id = execution_id
  for update;
  if not found then raise exception 'controlled_execution_not_found' using errcode = 'P0002'; end if;

  if execution_row.mode = 'primary' then
    input_hash := encode(extensions.digest(convert_to(p_live_input::text, 'utf8'), 'sha256'), 'hex');
    insert into private.case_execution_inputs (organization_id, execution_id, input_json, input_fingerprint)
    values (job_row.organization_id, execution_id, p_live_input, input_hash)
    on conflict (organization_id, execution_id) do nothing;
  else
    select * into baseline_input
    from private.case_execution_inputs input
    where input.organization_id = job_row.organization_id
      and input.execution_id = execution_row.baseline_execution_id;
    if not found then raise exception 'baseline_frozen_input_not_found' using errcode = 'P0002'; end if;

    insert into private.case_execution_inputs (organization_id, execution_id, input_json, input_fingerprint)
    values (job_row.organization_id, execution_id, baseline_input.input_json, baseline_input.input_fingerprint)
    on conflict (organization_id, execution_id) do nothing;
  end if;

  select * into frozen from private.case_execution_inputs input
  where input.organization_id = job_row.organization_id and input.execution_id = execution_id;

  if execution_row.baseline_execution_id is not null then
    select result.report into baseline_report
    from private.case_execution_results result
    where result.organization_id = job_row.organization_id
      and result.execution_id = execution_row.baseline_execution_id;
    if baseline_report is null then raise exception 'baseline_execution_result_not_found' using errcode = 'P0002'; end if;
  end if;

  update public.controlled_case_executions
  set status = 'running', input_fingerprint = frozen.input_fingerprint,
      started_at = coalesce(started_at, now())
  where organization_id = job_row.organization_id and id = execution_id;

  return frozen.input_json || jsonb_build_object('_execution', jsonb_strip_nulls(jsonb_build_object(
    'id', execution_id,
    'mode', execution_row.mode,
    'baseline_execution_id', execution_row.baseline_execution_id,
    'input_fingerprint', frozen.input_fingerprint,
    'pipeline_version', execution_row.pipeline_version,
    'model_policy_version', execution_row.model_policy_version,
    'baseline_report', baseline_report
  )));
end;
$$;

create or replace function public.worker_freeze_case_input(
  p_job_id uuid,
  p_capability_token text,
  p_live_input jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.worker_freeze_case_input(p_job_id, p_capability_token, p_live_input); $$;

revoke all on function private.worker_freeze_case_input(uuid, text, jsonb) from public, anon;
revoke all on function public.worker_freeze_case_input(uuid, text, jsonb) from public, anon;
grant execute on function private.worker_freeze_case_input(uuid, text, jsonb) to authenticated;
grant execute on function public.worker_freeze_case_input(uuid, text, jsonb) to authenticated;

create or replace function private.worker_record_controlled_execution(
  p_job_id uuid,
  p_capability_token text,
  p_report jsonb,
  p_manifest jsonb,
  p_comparison jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  execution_row public.controlled_case_executions;
  comparison_id uuid;
  report_status text := p_report ->> 'status';
  v_report_fingerprint text := p_report ->> 'reportFingerprint';
  v_manifest_fingerprint text := p_manifest ->> 'manifestFingerprint';
begin
  if job_row.kind <> 'case_analysis' or job_row.controlled_execution_id is null then
    raise exception 'controlled_case_analysis_capability_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_report) <> 'object' or jsonb_typeof(p_manifest) <> 'object' then
    raise exception 'controlled_execution_result_must_be_objects' using errcode = '22023';
  end if;
  if report_status not in ('succeeded', 'blocked', 'failed')
    or v_report_fingerprint !~ '^[0-9a-f]{64}$'
    or v_manifest_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'controlled_execution_result_invalid' using errcode = '22023';
  end if;

  select * into execution_row from public.controlled_case_executions execution
  where execution.organization_id = job_row.organization_id
    and execution.id = job_row.controlled_execution_id
  for update;
  if not found then raise exception 'controlled_execution_not_found' using errcode = 'P0002'; end if;

  if execution_row.mode = 'primary' and p_comparison is not null then
    raise exception 'primary_execution_must_not_have_comparison' using errcode = '22023';
  end if;
  if execution_row.mode <> 'primary' and (
    p_comparison is null or jsonb_typeof(p_comparison) <> 'object'
    or p_comparison ->> 'mode' <> execution_row.mode
    or (p_comparison ->> 'comparisonFingerprint') !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'candidate_execution_comparison_required' using errcode = '22023';
  end if;

  insert into private.case_execution_results (
    organization_id, execution_id, report, manifest, comparison
  ) values (
    job_row.organization_id, execution_row.id, p_report, p_manifest, p_comparison
  ) on conflict (organization_id, execution_id) do nothing;

  update public.controlled_case_executions
  set status = report_status,
      report_fingerprint = v_report_fingerprint,
      manifest_fingerprint = v_manifest_fingerprint,
      comparison_passed = case when p_comparison is null then null else (p_comparison ->> 'passed')::boolean end,
      critical_regression_count = coalesce((p_comparison ->> 'criticalCount')::integer, 0),
      warning_count = coalesce((p_comparison ->> 'warningCount')::integer, 0),
      completed_at = now()
  where organization_id = job_row.organization_id and id = execution_row.id;

  if p_comparison is not null then
    insert into public.case_execution_comparisons (
      organization_id, baseline_execution_id, candidate_execution_id, mode,
      comparable, passed, critical_count, warning_count, differences, comparison_fingerprint
    ) values (
      job_row.organization_id, execution_row.baseline_execution_id, execution_row.id, execution_row.mode,
      (p_comparison ->> 'comparable')::boolean,
      (p_comparison ->> 'passed')::boolean,
      (p_comparison ->> 'criticalCount')::integer,
      (p_comparison ->> 'warningCount')::integer,
      p_comparison -> 'differences',
      p_comparison ->> 'comparisonFingerprint'
    ) on conflict (organization_id, candidate_execution_id) do nothing
    returning id into comparison_id;
  end if;

  return coalesce(comparison_id, execution_row.id);
end;
$$;

create or replace function public.worker_record_controlled_execution(
  p_job_id uuid,
  p_capability_token text,
  p_report jsonb,
  p_manifest jsonb,
  p_comparison jsonb default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_controlled_execution(
    p_job_id, p_capability_token, p_report, p_manifest, p_comparison
  );
$$;

revoke all on function private.worker_record_controlled_execution(uuid, text, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.worker_record_controlled_execution(uuid, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function private.worker_record_controlled_execution(uuid, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.worker_record_controlled_execution(uuid, text, jsonb, jsonb, jsonb) to authenticated;

-- Platform-only command used by release operations and by the automatic shadow trigger. It
-- creates a separate processing run, so shadow/replay can never delay or overwrite the user's
-- current run.
create or replace function private.enqueue_controlled_case_execution(
  p_baseline_execution_id uuid,
  p_mode text,
  p_pipeline_version text default null,
  p_model_policy_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  baseline public.controlled_case_executions;
  baseline_run public.processing_runs;
  policy public.organization_rollout_policies;
  new_run_id uuid;
  new_execution_id uuid;
  next_run_no integer;
  session_locale text;
begin
  if p_mode not in ('shadow', 'replay') then
    raise exception 'controlled_execution_mode_invalid' using errcode = '22023';
  end if;

  select * into baseline from public.controlled_case_executions execution
  where execution.id = p_baseline_execution_id and execution.mode = 'primary' and execution.status = 'succeeded';
  if not found then raise exception 'successful_primary_baseline_required' using errcode = '22023'; end if;
  if not exists (
    select 1 from private.case_execution_inputs input
    join private.case_execution_results result
      on result.organization_id = input.organization_id and result.execution_id = input.execution_id
    where input.organization_id = baseline.organization_id and input.execution_id = baseline.id
  ) then raise exception 'complete_frozen_baseline_required' using errcode = '22023'; end if;

  select * into baseline_run from public.processing_runs run
  where run.organization_id = baseline.organization_id and run.id = baseline.processing_run_id;
  select * into policy from public.organization_rollout_policies rollout
  where rollout.organization_id = baseline.organization_id;
  select session.locale into session_locale from public.document_intake_sessions session
  where session.organization_id = baseline.organization_id and session.id = baseline.intake_session_id;
  select coalesce(max(run.run_no), 0) + 1 into next_run_no from public.processing_runs run
  where run.organization_id = baseline.organization_id and run.intake_session_id = baseline.intake_session_id;

  insert into public.processing_runs (
    organization_id, intake_session_id, run_no, trigger, status, pipeline_version,
    budget, versions, created_by
  ) values (
    baseline.organization_id, baseline.intake_session_id, next_run_no, 'reprocess', 'queued',
    coalesce(p_pipeline_version, policy.target_pipeline_version, baseline.pipeline_version),
    baseline_run.budget,
    baseline_run.versions || jsonb_build_object('controlled_execution', jsonb_build_object(
      'mode', p_mode, 'baseline_execution_id', baseline.id
    )),
    baseline_run.created_by
  ) returning id into new_run_id;

  insert into public.controlled_case_executions (
    organization_id, intake_session_id, processing_run_id, mode, baseline_execution_id,
    status, pipeline_version, model_policy_version, created_by
  ) values (
    baseline.organization_id, baseline.intake_session_id, new_run_id, p_mode, baseline.id,
    'queued',
    coalesce(p_pipeline_version, policy.target_pipeline_version, baseline.pipeline_version),
    coalesce(p_model_policy_version, policy.target_model_policy_version, baseline.model_policy_version),
    baseline_run.created_by
  ) returning id into new_execution_id;

  insert into public.processing_jobs (
    organization_id, processing_run_id, intake_session_id, kind, payload,
    controlled_execution_id, max_attempts
  ) values (
    baseline.organization_id, new_run_id, baseline.intake_session_id, 'case_analysis',
    jsonb_build_object(
      'locale', session_locale,
      'execution_id', new_execution_id,
      'execution_mode', p_mode,
      'baseline_execution_id', baseline.id
    ),
    new_execution_id,
    2
  );

  return new_execution_id;
end;
$$;

revoke all on function private.enqueue_controlled_case_execution(uuid, text, text, text)
  from public, anon, authenticated;

create or replace function private.enqueue_shadow_after_primary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution public.controlled_case_executions;
  rollout public.organization_rollout_policies;
begin
  if new.kind <> 'case_analysis' or old.status = new.status or new.status <> 'succeeded'
    or new.controlled_execution_id is null then return new; end if;

  select * into execution from public.controlled_case_executions candidate
  where candidate.organization_id = new.organization_id and candidate.id = new.controlled_execution_id;
  if not found or execution.mode <> 'primary' or execution.status <> 'succeeded' then return new; end if;

  select * into rollout from public.organization_rollout_policies policy
  where policy.organization_id = new.organization_id;
  if rollout.state = 'shadow' then
    perform private.enqueue_controlled_case_execution(
      execution.id, 'shadow', rollout.target_pipeline_version, rollout.target_model_policy_version
    );
  end if;
  return new;
exception when unique_violation then
  return new;
end;
$$;

revoke all on function private.enqueue_shadow_after_primary() from public, anon, authenticated;

create trigger processing_jobs_enqueue_controlled_shadow
  after update of status on public.processing_jobs
  for each row execute function private.enqueue_shadow_after_primary();

-- Tenant clients receive only status columns. The hidden binding remains worker-internal.
revoke select on public.processing_jobs from authenticated;
grant select (
  id, organization_id, processing_run_id, intake_session_id, source_document_id,
  kind, status, attempts, max_attempts, available_at, lease_expires_at,
  created_at, updated_at
) on public.processing_jobs to authenticated;
