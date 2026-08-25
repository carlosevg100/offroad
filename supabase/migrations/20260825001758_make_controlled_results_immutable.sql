-- A leased job may be delivered again after a worker interruption. The retry must be idempotent:
-- the same bytes are accepted, but a different report, manifest or comparison can never replace
-- the first result for a frozen execution.

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
  existing_result private.case_execution_results;
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

  select * into existing_result from private.case_execution_results result
  where result.organization_id = job_row.organization_id
    and result.execution_id = execution_row.id;
  if found then
    if existing_result.report is distinct from p_report
      or existing_result.manifest is distinct from p_manifest
      or existing_result.comparison is distinct from p_comparison then
      raise exception 'controlled_execution_result_immutable' using errcode = '23505';
    end if;
    if p_comparison is not null then
      select comparison.id into comparison_id from public.case_execution_comparisons comparison
      where comparison.organization_id = job_row.organization_id
        and comparison.candidate_execution_id = execution_row.id;
    end if;
    return coalesce(comparison_id, execution_row.id);
  end if;

  insert into private.case_execution_results (
    organization_id, execution_id, report, manifest, comparison
  ) values (
    job_row.organization_id, execution_row.id, p_report, p_manifest, p_comparison
  );

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
    ) returning id into comparison_id;
  end if;

  return coalesce(comparison_id, execution_row.id);
end;
$$;

revoke all on function private.worker_record_controlled_execution(uuid, text, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function private.worker_record_controlled_execution(uuid, text, jsonb, jsonb, jsonb)
  to authenticated;
