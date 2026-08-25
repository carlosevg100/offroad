-- PostgreSQL correctly refuses an unqualified `execution_id` that could mean either the PL/pgSQL
-- variable or the table column. Use an explicit variable name throughout the freeze command.

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
  v_execution_id uuid := job_row.controlled_execution_id;
  input_hash text;
  baseline_report jsonb;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_live_input) <> 'object' then
    raise exception 'case_execution_input_must_be_object' using errcode = '22023';
  end if;

  if v_execution_id is null then
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
    returning id into v_execution_id;

    update public.processing_jobs set controlled_execution_id = v_execution_id,
      payload = payload || jsonb_build_object('execution_id', v_execution_id, 'execution_mode', 'primary')
    where id = job_row.id and organization_id = job_row.organization_id;
  end if;

  select * into execution_row
  from public.controlled_case_executions execution
  where execution.organization_id = job_row.organization_id and execution.id = v_execution_id
  for update;
  if not found then raise exception 'controlled_execution_not_found' using errcode = 'P0002'; end if;

  if execution_row.mode = 'primary' then
    input_hash := encode(extensions.digest(convert_to(p_live_input::text, 'utf8'), 'sha256'), 'hex');
    insert into private.case_execution_inputs (organization_id, execution_id, input_json, input_fingerprint)
    values (job_row.organization_id, v_execution_id, p_live_input, input_hash)
    on conflict (organization_id, execution_id) do nothing;
  else
    select * into baseline_input
    from private.case_execution_inputs input
    where input.organization_id = job_row.organization_id
      and input.execution_id = execution_row.baseline_execution_id;
    if not found then raise exception 'baseline_frozen_input_not_found' using errcode = 'P0002'; end if;

    insert into private.case_execution_inputs (organization_id, execution_id, input_json, input_fingerprint)
    values (job_row.organization_id, v_execution_id, baseline_input.input_json, baseline_input.input_fingerprint)
    on conflict (organization_id, execution_id) do nothing;
  end if;

  select * into frozen from private.case_execution_inputs input
  where input.organization_id = job_row.organization_id and input.execution_id = v_execution_id;

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
  where organization_id = job_row.organization_id and id = v_execution_id;

  return frozen.input_json || jsonb_build_object('_execution', jsonb_strip_nulls(jsonb_build_object(
    'id', v_execution_id,
    'mode', execution_row.mode,
    'baseline_execution_id', execution_row.baseline_execution_id,
    'input_fingerprint', frozen.input_fingerprint,
    'pipeline_version', execution_row.pipeline_version,
    'model_policy_version', execution_row.model_policy_version,
    'baseline_report', baseline_report
  )));
end;
$$;

revoke all on function private.worker_freeze_case_input(uuid, text, jsonb) from public, anon;
grant execute on function private.worker_freeze_case_input(uuid, text, jsonb) to authenticated;
