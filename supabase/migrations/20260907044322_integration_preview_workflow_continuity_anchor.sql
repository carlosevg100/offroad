-- Follow-up instructions often omit the economic situation by design ("change the rate", "make
-- three pages"). Recover only the project's last immutable selected recipe through the current
-- job capability. The worker still recompiles a fresh slice for the requested output; this RPC
-- does not authorize activation and never crosses a project or tenant boundary.

create or replace function private.worker_load_latest_objective_workflow_selection_v1(
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
  latest_selection jsonb;
begin
  if job_row.kind <> 'agent_operation_brief' then
    raise exception 'agent_operation_brief_capability_required' using errcode = '42501';
  end if;

  select session.capital_project_id into project_id
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id;
  if project_id is null then return null; end if;

  select selection.workflow_selection into latest_selection
  from public.capital_project_objective_workflow_selections selection
  where selection.organization_id = job_row.organization_id
    and selection.capital_project_id = project_id
    and selection.processing_job_id <> job_row.id
    and selection.selection_status = 'selected'
  order by selection.created_at desc, selection.id desc
  limit 1;

  return latest_selection;
end;
$$;

create or replace function public.worker_load_latest_objective_workflow_selection_v1(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_latest_objective_workflow_selection_v1(
    p_job_id, p_capability_token
  );
$$;

revoke all on function private.worker_load_latest_objective_workflow_selection_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.worker_load_latest_objective_workflow_selection_v1(uuid, text)
  from public, anon;
grant execute on function public.worker_load_latest_objective_workflow_selection_v1(uuid, text)
  to authenticated;

comment on function public.worker_load_latest_objective_workflow_selection_v1(uuid, text) is
  'Returns the latest immutable selected economic workflow in the current job project, for bounded conversational continuity.';
