-- A retried processing job must resume the immutable DAG from its proven artifacts. Returning only
-- the plan caused the worker to try to recreate already-succeeded M01..K04 outputs after a later
-- quality-gate failure. The task lifecycle correctly rejected that replay, but the whole job then
-- failed with a generic error. V3 adds the current successful artifacts to the capability-bound
-- context so executors can skip completed nodes and retry only the failed frontier.

create or replace function private.worker_load_capital_project_context_v3(
  p_job_id uuid, p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  base_context jsonb := private.worker_load_capital_project_context_v2(p_job_id, p_capability_token);
  plan_id uuid := nullif(base_context #>> '{plan,id}', '')::uuid;
  project_id uuid := nullif(base_context #>> '{project,id}', '')::uuid;
  completed jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'task_id', current_artifact.task_id,
    'id', current_artifact.id,
    'artifact_fingerprint', current_artifact.artifact_fingerprint,
    'content', current_artifact.content,
    'evidence_refs', current_artifact.evidence_refs
  ) order by current_artifact.ordinal), '[]'::jsonb)
  into completed
  from (
    select distinct on (plan_task.task_id)
      plan_task.task_id,
      plan_task.ordinal,
      artifact.id,
      artifact.artifact_fingerprint,
      artifact.content,
      artifact.evidence_refs,
      artifact.created_at
    from public.capital_project_artifacts artifact
    join public.capital_project_task_runs task_run
      on task_run.organization_id = artifact.organization_id
      and task_run.id = artifact.task_run_id
      and task_run.status = 'succeeded'
    join public.capital_project_plan_tasks plan_task
      on plan_task.organization_id = task_run.organization_id
      and plan_task.id = task_run.plan_task_id
    where artifact.organization_id = job_row.organization_id
      and artifact.capital_project_id = project_id
      and artifact.plan_id = plan_id
      and artifact.status not in ('stale', 'superseded')
    order by plan_task.task_id, artifact.created_at desc, artifact.id desc
  ) current_artifact;

  return base_context || jsonb_build_object('completed_artifacts', completed);
end;
$$;

create or replace function public.worker_load_capital_project_context_v3(
  p_job_id uuid, p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_capital_project_context_v3(p_job_id, p_capability_token);
$$;

revoke all on function private.worker_load_capital_project_context_v3(uuid, text)
  from public, anon, authenticated;
revoke all on function public.worker_load_capital_project_context_v3(uuid, text)
  from public, anon;
grant execute on function private.worker_load_capital_project_context_v3(uuid, text)
  to authenticated;
grant execute on function public.worker_load_capital_project_context_v3(uuid, text)
  to authenticated;

comment on function public.worker_load_capital_project_context_v3(uuid, text) is
  'Loads the capability-bound capital-project context plus successful current-plan artifacts for deterministic DAG resume.';
