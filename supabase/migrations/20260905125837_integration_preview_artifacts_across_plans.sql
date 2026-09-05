-- integration_preview: the objects a conversational turn answers from are read across the
-- project's preview plans, not only the active one. Since each turn compiles its own plan, the
-- latest signed object of a task may sit in an earlier plan that a later turn replayed by
-- fingerprint. Only the private implementation changes; the public wrapper stays as it is.

create or replace function private.worker_load_integration_preview_artifacts_v1(
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
  project_id uuid;
begin
  if job_row.kind <> 'agent_operation_brief' then
    raise exception 'agent_operation_brief_capability_required' using errcode = '42501';
  end if;
  if not private.integration_preview_enabled(job_row.organization_id) then
    raise exception 'integration_preview_not_granted' using errcode = '42501';
  end if;
  select session.capital_project_id into project_id
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id;
  if project_id is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'task_id', latest.task_id, 'id', latest.id, 'artifact_type', latest.artifact_type,
      'artifact_fingerprint', latest.artifact_fingerprint, 'content', latest.content
    ) order by latest.task_id)
    from (
      select distinct on (plan_task.task_id)
        plan_task.task_id, artifact.id, artifact.artifact_type, artifact.artifact_fingerprint, artifact.content
      from public.capital_project_artifacts artifact
      join public.capital_project_task_runs run
        on run.organization_id = artifact.organization_id and run.id = artifact.task_run_id and run.status = 'succeeded'
      join public.capital_project_plan_tasks plan_task
        on plan_task.organization_id = run.organization_id and plan_task.id = run.plan_task_id
      -- Across the project's preview plans: each turn compiles its own plan, and the objects a
      -- question is answered from may live in an earlier plan that a later turn replayed.
      where artifact.organization_id = job_row.organization_id
        and artifact.capital_project_id = project_id
        and artifact.artifact_type like 'preview\_%'
        and artifact.status not in ('stale', 'superseded')
      order by plan_task.task_id, artifact.created_at desc, artifact.id desc
    ) latest
  ), '[]'::jsonb);
end;
$$;

