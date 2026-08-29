-- Reuse is case-scoped and capability-scoped. The worker receives only the most recent
-- successful private report for the same intake session; browser clients never receive it.
create index if not exists controlled_case_executions_prior_report_idx
  on public.controlled_case_executions (organization_id, intake_session_id, completed_at desc)
  where mode = 'primary' and status = 'succeeded';

create or replace function private.worker_load_prior_case_report(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  prior_report jsonb;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;

  select result.report
  into prior_report
  from public.controlled_case_executions execution
  join private.case_execution_results result
    on result.organization_id = execution.organization_id
   and result.execution_id = execution.id
  where execution.organization_id = job_row.organization_id
    and execution.intake_session_id = job_row.intake_session_id
    and execution.mode = 'primary'
    and execution.status = 'succeeded'
    and execution.id is distinct from job_row.controlled_execution_id
  order by execution.completed_at desc nulls last, execution.created_at desc
  limit 1;

  return prior_report;
end;
$$;

revoke all on function private.worker_load_prior_case_report(uuid, text) from public, anon;
grant execute on function private.worker_load_prior_case_report(uuid, text) to authenticated;

create or replace function public.worker_load_prior_case_report(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_prior_case_report(p_job_id, p_capability_token);
$$;

revoke all on function public.worker_load_prior_case_report(uuid, text) from public, anon;
grant execute on function public.worker_load_prior_case_report(uuid, text) to authenticated;
