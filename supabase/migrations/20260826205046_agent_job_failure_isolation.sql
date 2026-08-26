-- An Agent Offroad turn is an auxiliary run over the operation brief. Its failure must never
-- fail a document-intake session that may be processing independently at the same time.

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

