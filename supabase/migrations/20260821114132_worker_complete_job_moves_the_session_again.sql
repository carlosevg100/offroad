-- The last job moves the session to `review_ready` again.
--
-- A regression from the spend migration, and the kind that is invisible until somebody runs the
-- whole line. `worker_complete_job` had already been replaced once, by `20260820104922`, with a
-- version that moves the session when a run's last job lands. The spend rewrite started from the
-- older body in `20260818171246` instead, kept the run bookkeeping, and silently dropped the
-- session transition.
--
-- What that cost: the pipeline finishes, the candidates are written, the run says `succeeded`,
-- and the session sits in `processing` forever. The review screen watches the session, so a
-- company would upload its data room, wait, and watch a spinner that never resolves, with every
-- fact it needed already extracted and one status change away.
--
-- Found by running a full case through the database as a real tenant. Nothing else would have
-- found it: every command involved passed its own test, because each one was correct.

create or replace function private.worker_complete_job(
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
  candidate_count integer;
  spent_usd numeric(12, 4) := private.reported_spend_usd(p_result);
  spent_calls integer := private.reported_spend_calls(p_result);
begin
  update public.processing_jobs
  set status = 'succeeded',
      result = coalesce(p_result, '{}'::jsonb),
      -- Accumulated, like the failure path, because each attempt gets a fresh gateway and
      -- reports only its own spend. A document that failed twice and then succeeded cost us
      -- three attempts, and replacing here would quietly discard the two expensive ones.
      model_cost_usd = model_cost_usd + spent_usd,
      model_calls = model_calls + spent_calls,
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

  -- The run is recomputed from its jobs rather than incremented, so it cannot drift from them.
  update public.processing_runs
  set model_cost_usd = (
        select coalesce(sum(model_cost_usd), 0) from public.processing_jobs
        where organization_id = job_row.organization_id and processing_run_id = job_row.processing_run_id
      ),
      model_calls = (
        select coalesce(sum(model_calls), 0) from public.processing_jobs
        where organization_id = job_row.organization_id and processing_run_id = job_row.processing_run_id
      ),
      status = case when pending = 0 then (case when failed > 0 then 'partial' else 'succeeded' end) else status end,
      completed_at = case when pending = 0 then now() else completed_at end
  where organization_id = job_row.organization_id and id = job_row.processing_run_id;

  if pending = 0 then
    select count(*) into candidate_count
    from public.intake_field_candidates
    where organization_id = job_row.organization_id and intake_session_id = job_row.intake_session_id;

    -- Only the run the session is currently following may move it, and only out of
    -- `processing`: a stale job from a superseded run never reopens a confirmed case.
    update public.document_intake_sessions
    set status = case when failed > 0 and candidate_count = 0 then 'failed' else 'review_ready' end,
        processing_completed_at = now(),
        result_summary = coalesce(result_summary, '{}'::jsonb)
          || jsonb_build_object('candidates', candidate_count, 'failed_documents', failed, 'pipeline', true)
    where organization_id = job_row.organization_id
      and id = job_row.intake_session_id
      and current_run_id = job_row.processing_run_id
      and status = 'processing';
  end if;

  return jsonb_build_object('job_id', job_row.id, 'pending_jobs', pending, 'failed_jobs', failed);
end;
$$;
