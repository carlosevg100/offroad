-- A model retry must learn from the gate that rejected the prior attempt. Successful artifacts
-- already resume through context v3; v5 adds only bounded failure metadata from this job or the
-- explicit failed-analysis predecessor. No source content or cross-tenant data is exposed.

create or replace function private.worker_load_capital_project_context_v5(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_context jsonb := private.worker_load_capital_project_context_v4(p_job_id, p_capability_token);
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  prior_job_id uuid;
  failed_feedback jsonb;
begin
  begin
    prior_job_id := nullif(job_row.payload #>> '{trigger_event,priorJobId}', '')::uuid;
  exception when invalid_text_representation then
    prior_job_id := null;
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'task_id', failed.task_id,
    'attempt_no', failed.attempt_no,
    'quality_results', failed.quality_results,
    'error', failed.error
  ) order by failed.task_id), '[]'::jsonb)
  into failed_feedback
  from (
    select distinct on (plan_task.task_id)
      plan_task.task_id,
      task_run.attempt_no,
      task_run.quality_results,
      task_run.error,
      task_run.completed_at,
      task_run.id
    from public.capital_project_task_runs task_run
    join public.capital_project_plan_tasks plan_task
      on plan_task.organization_id = task_run.organization_id
      and plan_task.id = task_run.plan_task_id
    where task_run.organization_id = job_row.organization_id
      and task_run.capital_project_id = (job_row.payload ->> 'capital_project_id')::uuid
      and task_run.status = 'failed'
      and jsonb_array_length(task_run.quality_results) > 0
      and task_run.processing_job_id in (job_row.id, coalesce(prior_job_id, job_row.id))
    order by plan_task.task_id, task_run.completed_at desc nulls last, task_run.id desc
  ) failed;

  return base_context || jsonb_build_object('prior_failed_task_feedback', failed_feedback);
end;
$$;

create or replace function public.worker_load_capital_project_context_v5(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_capital_project_context_v5(p_job_id, p_capability_token);
$$;

revoke all on function private.worker_load_capital_project_context_v5(uuid, text)
  from public, anon, authenticated;
revoke all on function public.worker_load_capital_project_context_v5(uuid, text)
  from public, anon;
grant execute on function private.worker_load_capital_project_context_v5(uuid, text)
  to authenticated;
grant execute on function public.worker_load_capital_project_context_v5(uuid, text)
  to authenticated;

comment on function public.worker_load_capital_project_context_v5(uuid, text) is
  'Loads capability-bound project context plus bounded quality feedback from failed task attempts in the current or explicitly linked predecessor job.';
