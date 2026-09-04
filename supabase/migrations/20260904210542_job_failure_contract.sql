-- A failed job that cannot explain itself is refused, not recorded.
--
-- The worker now builds every failure with the envelope (code, stage, retryable, cause). The
-- observability views find historical rows without a cause; this migration stops new ones at
-- the boundary: `worker_fail_job` asserts the shape before writing, so a regression in any
-- executor surfaces as a refused call, not as a silent row.

create or replace function private.assert_job_failure_record(p_error jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  cause jsonb := p_error -> 'cause';
begin
  if p_error is null or jsonb_typeof(p_error) <> 'object' then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'error must be an object';
  end if;
  if coalesce(p_error ->> 'code', '') !~ '^[a-z0-9_]{3,120}$' then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'code missing or malformed';
  end if;
  if coalesce(p_error ->> 'stage', '') = '' or char_length(p_error ->> 'stage') > 80 then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'stage missing';
  end if;
  if jsonb_typeof(p_error -> 'retryable') <> 'boolean' then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'retryable must be boolean';
  end if;
  if cause is null or jsonb_typeof(cause) <> 'object' then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'cause missing';
  end if;
  if coalesce(cause ->> 'name', '') = '' or char_length(cause ->> 'name') > 80 then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'cause.name missing';
  end if;
  if coalesce(cause ->> 'class', '') not in (
    'budget', 'model_exhausted', 'model_invalid_output', 'model_policy', 'quality_gate',
    'invalid_input', 'schema_mismatch', 'db_constraint', 'db_timeout', 'authorization',
    'transient', 'worker_error'
  ) then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'cause.class outside the taxonomy';
  end if;
  if coalesce(cause ->> 'message', '') = '' or char_length(cause ->> 'message') > 300 then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'cause.message missing or too long';
  end if;
  -- Defence in depth for the scrub the worker already applies: no value that could have come
  -- out of a document reaches a telemetry row.
  if (cause ->> 'message') ~ '[0-9]{4,}'
    or (cause ->> 'message') ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
    raise exception 'invalid_failure_record' using errcode = '22023', detail = 'cause.message carries a value';
  end if;
end;
$$;

revoke all on function private.assert_job_failure_record(jsonb) from public, anon, authenticated;

comment on function private.assert_job_failure_record(jsonb) is
  'Refuses a failure record that does not carry code, stage, retryable and a scrubbed cause. Called by worker_fail_job.';

-- A rejected file is a rejected input, on both sides of the boundary.
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
    when coalesce(p_error ->> 'reason', '') in ('infected', 'unreadable_document') then 'invalid_input'
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

create or replace function private.worker_fail_job(
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
  spent_usd numeric(12, 4) := private.reported_spend_usd(p_error);
  spent_calls integer := private.reported_spend_calls(p_error);
begin
  perform private.assert_job_failure_record(p_error);

  will_retry := coalesce(p_retryable, true) and job_row.attempts < job_row.max_attempts;

  update public.processing_jobs
  set status = case when will_retry then 'queued' else 'failed' end,
      available_at = case when will_retry then now() + make_interval(secs => retry_seconds) else available_at end,
      capability_sha256 = null,
      leased_by = null,
      lease_expires_at = null,
      model_cost_usd = model_cost_usd + spent_usd,
      model_calls = model_calls + spent_calls,
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

  update public.processing_runs
  set model_cost_usd = (
        select coalesce(sum(model_cost_usd), 0) from public.processing_jobs
        where organization_id = job_row.organization_id and processing_run_id = job_row.processing_run_id
      ),
      model_calls = (
        select coalesce(sum(model_calls), 0) from public.processing_jobs
        where organization_id = job_row.organization_id and processing_run_id = job_row.processing_run_id
      ),
      status = case when pending = 0 then (case when failed > 0 then 'failed' else 'succeeded' end) else status end,
      error = case when pending = 0 and failed > 0 then coalesce(p_error, '{}'::jsonb) else error end,
      completed_at = case when pending = 0 then now() else completed_at end
  where organization_id = job_row.organization_id and id = job_row.processing_run_id;

  if pending = 0 and failed > 0 and job_row.kind <> 'agent_operation_brief' then
    update public.document_intake_sessions
    set status = 'failed'
    where organization_id = job_row.organization_id
      and id = job_row.intake_session_id
      and status = 'processing';
  end if;

  return jsonb_build_object(
    'job_id', job_row.id,
    'retrying', will_retry,
    'pending_jobs', pending,
    'failed_jobs', failed
  );
end;
$$;
