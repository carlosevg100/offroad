-- Phase 0 observability: every failed job must carry a cause, and the numbers that describe the
-- rail must be readable segmented, not as one headline.
--
-- The worker now persists `last_error.cause` ({name, class, code, message}) beside the category
-- it always wrote. This migration reads both shapes: rows written before the change are
-- classified from what they do carry (the gateway code, the message, the validation issues), so
-- the taxonomy covers the whole history and the "without cause" list names exactly the rows a
-- person still cannot explain.
--
-- Everything lives in `private`. Nothing here is exposed through the Data API; it is read by
-- operators through SQL and by the evaluation harness.

create or replace function private.job_failure_class(p_error jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_error is null or p_error = '{}'::jsonb then 'unclassified'
    when p_error #>> '{cause,class}' is not null then p_error #>> '{cause,class}'
    when coalesce(p_error ->> 'code', '') ~* 'budget' then 'budget'
    when coalesce(p_error ->> 'code', '') in ('all_attempts_failed', 'timeout') then 'model_exhausted'
    when coalesce(p_error ->> 'code', '') in ('invalid_output', 'output_truncated') then 'model_invalid_output'
    when coalesce(p_error ->> 'code', '') in ('model_not_allowed', 'data_policy_violation', 'cassette_missing') then 'model_policy'
    when coalesce(p_error ->> 'code', '') ~* 'quality_gate' then 'quality_gate'
    when coalesce(p_error ->> 'reason', '') = 'infected' then 'authorization'
    when coalesce(p_error ->> 'reason', '') = 'unreadable_document' then 'invalid_input'
    when coalesce(p_error ->> 'code', '') ~* 'invalid_.*input|invalid_case'
      or p_error ? 'validation' then 'invalid_input'
    when coalesce(p_error ->> 'message', p_error ->> 'reason', '') ~* 'unrecognized_keys' then 'schema_mismatch'
    when coalesce(p_error ->> 'message', p_error ->> 'reason', '') ~* 'statement timeout|canceling statement|lock timeout' then 'db_timeout'
    when coalesce(p_error ->> 'message', p_error ->> 'reason', '') ~* 'violates .*constraint|null value in column|duplicate key|foreign key' then 'db_constraint'
    when coalesce(p_error ->> 'message', p_error ->> 'reason', '') ~* '42501|permission denied|authentication_required|organization_access_denied' then 'authorization'
    when coalesce(p_error ->> 'reason', '') = 'transient_error'
      or coalesce(p_error ->> 'message', '') ~* 'timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|rate.?limit' then 'transient'
    when coalesce(p_error ->> 'message', p_error ->> 'reason', '') <> ''
      and coalesce(p_error ->> 'reason', '') not in ('case_analysis_failed') then 'worker_error'
    else 'unclassified'
  end
$$;

comment on function private.job_failure_class(jsonb) is
  'Classifies a failed job''s last_error into a cause class. Reads the cause the worker now writes '
  'and falls back to the gateway code, the message and the validation issues for older rows.';

-- Whether the row explains itself: a cause with a message, or an older row whose message or
-- validation issues say what happened. A bare category does not count.
create or replace function private.job_failure_has_cause(p_error jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_error is not null
    and (
      coalesce(p_error #>> '{cause,message}', '') <> ''
      or coalesce(p_error ->> 'message', '') <> ''
      or p_error ? 'validation'
      or coalesce(p_error ->> 'code', '') in ('budget_exceeded', 'all_attempts_failed', 'timeout', 'invalid_output', 'output_truncated')
    )
$$;

create or replace view private.job_failure_causes with (security_invoker = true) as
  select
    job.id,
    job.organization_id,
    job.processing_run_id,
    job.kind,
    job.created_at,
    job.attempts,
    job.max_attempts,
    job.last_error ->> 'code' as code,
    job.last_error ->> 'stage' as stage,
    private.job_failure_class(job.last_error) as failure_class,
    private.job_failure_has_cause(job.last_error) as has_cause,
    job.last_error #>> '{cause,name}' as cause_name,
    left(coalesce(job.last_error #>> '{cause,message}', job.last_error ->> 'message', job.last_error ->> 'reason'), 300) as cause_message
  from public.processing_jobs job
  where job.status in ('failed', 'poison');

comment on view private.job_failure_causes is
  'One row per failed job with its cause class and whether the row explains itself.';

create or replace view private.failures_without_cause with (security_invoker = true) as
  select id, organization_id, processing_run_id, kind, created_at, code, failure_class
  from private.job_failure_causes
  where not has_cause;

comment on view private.failures_without_cause is
  'Phase 0 gate: this view must be empty. A failed job that a person cannot explain from its own row is a defect.';

create or replace view private.run_metrics_by_pipeline with (security_invoker = true) as
  select
    run.pipeline_version,
    count(*) as runs,
    count(*) filter (where run.status = 'succeeded') as succeeded,
    count(*) filter (where run.status = 'failed') as failed,
    count(*) filter (where run.status = 'partial') as partial,
    count(*) filter (where run.status = 'cancelled') as cancelled,
    round(percentile_cont(0.5) within group (order by extract(epoch from (run.completed_at - run.started_at)))::numeric) as p50_seconds,
    round(percentile_cont(0.95) within group (order by extract(epoch from (run.completed_at - run.started_at)))::numeric) as p95_seconds,
    round(sum(coalesce(run.model_cost_usd, 0))::numeric, 2) as model_cost_usd,
    sum(coalesce(run.model_calls, 0)) as model_calls
  from public.processing_runs run
  group by run.pipeline_version;

create or replace view private.run_metrics_by_day with (security_invoker = true) as
  select
    run.created_at::date as day,
    run.pipeline_version,
    count(*) as runs,
    count(*) filter (where run.status = 'failed') as failed,
    round(sum(coalesce(run.model_cost_usd, 0))::numeric, 2) as model_cost_usd
  from public.processing_runs run
  group by run.created_at::date, run.pipeline_version;

-- Cohort: whether the run was created by a person or by the worker's service account. It says
-- nothing about who the person is; the point is to separate real usage from the rail's own work.
create or replace view private.run_metrics_by_cohort with (security_invoker = true) as
  select
    case when usr.email like 'document-worker@%' then 'service_account' else 'person' end as cohort,
    run.trigger,
    count(*) as runs,
    count(*) filter (where run.status = 'failed') as failed
  from public.processing_runs run
  left join auth.users usr on usr.id = run.created_by
  group by 1, 2;

-- Time to value per project: first artifact and first material question. Both are proxies; the
-- honest measures (first useful result, first evidence) need instrumentation the rail does not
-- emit yet.
create or replace view private.project_time_to_value with (security_invoker = true) as
  select
    project.id as capital_project_id,
    project.organization_id,
    project.entry_job,
    project.access_basis,
    project.created_at,
    (select min(artifact.created_at) from public.capital_project_artifacts artifact where artifact.capital_project_id = project.id) - project.created_at as time_to_first_artifact,
    (select min(request.created_at) from public.capital_project_information_requests request where request.capital_project_id = project.id) - project.created_at as time_to_first_question
  from public.capital_projects project;

revoke all on function private.job_failure_class(jsonb) from public, anon, authenticated;
revoke all on function private.job_failure_has_cause(jsonb) from public, anon, authenticated;
revoke all on private.job_failure_causes from public, anon, authenticated;
revoke all on private.failures_without_cause from public, anon, authenticated;
revoke all on private.run_metrics_by_pipeline from public, anon, authenticated;
revoke all on private.run_metrics_by_day from public, anon, authenticated;
revoke all on private.run_metrics_by_cohort from public, anon, authenticated;
revoke all on private.project_time_to_value from public, anon, authenticated;
