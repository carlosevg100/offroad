CREATE OR REPLACE FUNCTION private.worker_claim_job_v2(p_worker_token text, p_lease_seconds integer DEFAULT 600)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  worker_id uuid := private.worker_identity(p_worker_token);
  lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 600), 60), 3600);
  capability_token text := encode(extensions.gen_random_bytes(32), 'hex');
  job_row public.processing_jobs;
begin
  perform private.settle_stale_execution_jobs_v1();
  -- reclaim expired leases as well as fresh jobs, oldest first
  select * into job_row
  from public.processing_jobs
  where kind not in ('work_execution','governed_evaluation') and ((status = 'queued' and available_at <= now())
     or (status = 'leased' and lease_expires_at < now()))
    and kind<>'work_conversation' and (not private.requires_execution_brief_approval(id) or private.execution_dispatch_is_current(id,true))
  order by available_at
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('claimed', false);
  end if;

  if not private.lock_job_authority_v1(job_row.id) then
 update public.processing_jobs set status='cancelled',capability_sha256=null,leased_by=null,lease_expires_at=null,last_error=jsonb_build_object('reason','authorization_revoked') where id=job_row.id;
 return jsonb_build_object('claimed',false);
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
      payload = private.canonical_job_storage_payload_v1(id), leased_by = worker_id, leased_account_user_id = auth.uid(),
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
    'payload', job_row.payload,
    -- A project bound to a frozen source pack tells the worker to read that pack and nothing else.
    'source_pack_id', (
      select binding.source_pack_id
      from private.gold_case_bindings binding
      join public.document_intake_sessions session
        on session.organization_id = binding.organization_id and session.capital_project_id = binding.capital_project_id
      where session.organization_id = job_row.organization_id and session.id = job_row.intake_session_id
    ),
    -- The job's project runs the internal integration_preview mode (organization-wide grant, or a
    -- grant scoped to listed projects): implemented methods may execute for it.
    'integration_preview', private.integration_preview_enabled_for_session(job_row.organization_id, job_row.intake_session_id),
    -- deterministic: the regex router of the skeleton. live: the semantic router decides, one model
    -- call per turn under budget. Null when the job's project does not run in preview.
    'integration_preview_mode', case
      when private.integration_preview_enabled_for_session(job_row.organization_id, job_row.intake_session_id) then (
        select grant_row.mode from private.integration_preview_grants grant_row
        where grant_row.organization_id = job_row.organization_id and grant_row.enabled
      )
      else null
    end
  );
end;
$function$
