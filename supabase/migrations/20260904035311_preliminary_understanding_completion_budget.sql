-- Give the first understanding enough bounded headroom to close its structured response and
-- make the declared fallback reachable. The previous one-call budget made the fallback route
-- impossible and turned a provider truncation into a misleading budget failure.
create or replace function private.enqueue_primary_case_analysis(
  p_organization_id uuid,
  p_processing_run_id uuid,
  p_intake_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_row public.processing_runs;
  session_locale text;
  execution_id uuid;
  case_job_id uuid;
  preliminary_required boolean;
begin
  select run.* into run_row
  from public.processing_runs run
  where run.organization_id = p_organization_id
    and run.id = p_processing_run_id
    and run.intake_session_id = p_intake_session_id
  for update;

  if not found or run_row.status in ('cancelled', 'failed', 'partial') then return null; end if;

  select session.locale into session_locale
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id
    and session.id = p_intake_session_id
    and session.current_run_id = p_processing_run_id
    and session.status = 'processing';
  if not found then return null; end if;

  if exists (
    select 1 from public.processing_jobs document_job
    where document_job.organization_id = p_organization_id
      and document_job.processing_run_id = p_processing_run_id
      and document_job.kind = 'document_pipeline'
      and document_job.status <> 'succeeded'
  ) then return null; end if;

  if not exists (
    select 1 from public.processing_jobs document_job
    where document_job.organization_id = p_organization_id
      and document_job.processing_run_id = p_processing_run_id
      and document_job.kind = 'document_pipeline'
  ) and exists (
    select 1 from public.source_documents source
    where source.organization_id = p_organization_id
      and source.intake_session_id = p_intake_session_id
      and source.processing_status <> 'ready'
  ) then return null; end if;

  preliminary_required := not exists (
    select 1
    from public.preliminary_understandings understanding
    where understanding.organization_id = p_organization_id
      and understanding.intake_session_id = p_intake_session_id
      and understanding.status = 'confirmed'
  );

  if preliminary_required then
    insert into public.processing_jobs (
      organization_id, processing_run_id, intake_session_id, kind, payload, max_attempts
    ) values (
      p_organization_id,
      p_processing_run_id,
      p_intake_session_id,
      'preliminary_analysis',
      jsonb_build_object(
        'locale', session_locale,
        'execution_mode', 'primary',
        'analysis_scope', 'preliminary_understanding',
        'model_budget', jsonb_build_object('max_cost_usd', 0.90, 'max_calls', 2)
      ),
      2
    ) returning id into case_job_id;
    return case_job_id;
  end if;

  select execution.id into execution_id
  from public.controlled_case_executions execution
  where execution.organization_id = p_organization_id
    and execution.processing_run_id = p_processing_run_id;

  if execution_id is null then
    insert into public.controlled_case_executions (
      organization_id, intake_session_id, processing_run_id, mode, status,
      pipeline_version, model_policy_version, created_by
    ) values (
      p_organization_id, p_intake_session_id, p_processing_run_id, 'primary', 'queued',
      run_row.pipeline_version,
      coalesce((select policy.target_model_policy_version
        from public.organization_rollout_policies policy
        where policy.organization_id = p_organization_id), '2026.08.24-v1'),
      run_row.created_by
    ) returning id into execution_id;
  end if;

  insert into public.processing_jobs (
    organization_id, processing_run_id, intake_session_id, kind, payload,
    controlled_execution_id, max_attempts
  ) values (
    p_organization_id,
    p_processing_run_id,
    p_intake_session_id,
    'case_analysis',
    jsonb_build_object(
      'locale', session_locale,
      'execution_id', execution_id,
      'execution_mode', 'primary',
      'analysis_scope', 'full_case',
      'model_budget', jsonb_build_object(
        'max_cost_usd', coalesce((run_row.budget->>'case_max_cost_usd')::numeric, 1),
        'max_calls', coalesce((run_row.budget->>'case_max_calls')::integer, 4)
      )
    ),
    execution_id,
    2
  ) on conflict (organization_id, controlled_execution_id)
    where kind = 'case_analysis' and controlled_execution_id is not null do nothing
  returning id into case_job_id;

  if case_job_id is null then
    select job.id into case_job_id
    from public.processing_jobs job
    where job.organization_id = p_organization_id
      and job.controlled_execution_id = execution_id
      and job.kind = 'case_analysis';
  end if;
  return case_job_id;
end;
$$;

revoke all on function private.enqueue_primary_case_analysis(uuid, uuid, uuid)
  from public, anon, authenticated;
