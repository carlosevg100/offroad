-- Fail closed when an integration-preview activation differs from the immutable workflow recipe
-- selected for the same conversational job. The model may help interpret intent; it cannot swap
-- the recipe, outcome, task slice or execution batches after the control plane persisted them.

create or replace function private.worker_validate_integration_preview_workflow_selection_v1(
  p_job_id uuid,
  p_capability_token text,
  p_activation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  selection_row public.capital_project_objective_workflow_selections;
  selection_count integer;
  activation_task_ids text[];
  expected_outcome text;
  composition text := trim(coalesce(p_activation ->> 'composition', ''));
  workflow jsonb := p_activation -> 'workflow';
  plan_snapshot jsonb := p_activation -> 'plan';
begin
  if job_row.kind <> 'agent_operation_brief'
    or jsonb_typeof(p_activation) <> 'object'
    or p_activation ->> 'job' <> 'integration_preview' then
    raise exception 'integration_preview_workflow_selection_activation_invalid' using errcode = '22023';
  end if;

  expected_outcome := case
    when composition in ('prepare_material', 'prepare_decision') then 'material'
    when composition in ('prepare_meeting', 'deepen', 'change_premise') then 'meeting_plan'
    else null
  end;
  if expected_outcome is null
    or jsonb_typeof(workflow) <> 'object'
    or jsonb_typeof(plan_snapshot) <> 'object'
    or jsonb_typeof(plan_snapshot -> 'taskSpecs') <> 'array'
    or jsonb_typeof(plan_snapshot -> 'parallelBatches') <> 'array' then
    raise exception 'integration_preview_workflow_selection_activation_invalid' using errcode = '22023';
  end if;

  select count(*) into selection_count
  from public.capital_project_objective_workflow_selections selection
  join public.document_intake_sessions session
    on session.organization_id = selection.organization_id
   and session.capital_project_id = selection.capital_project_id
  where selection.organization_id = job_row.organization_id
    and selection.processing_job_id = job_row.id
    and session.id = job_row.intake_session_id;
  if selection_count = 0 then
    raise exception 'integration_preview_workflow_selection_required' using errcode = 'P0002';
  elsif selection_count <> 1 then
    raise exception 'integration_preview_workflow_selection_ambiguous' using errcode = '21000';
  end if;

  select selection.* into strict selection_row
  from public.capital_project_objective_workflow_selections selection
  join public.document_intake_sessions session
    on session.organization_id = selection.organization_id
   and session.capital_project_id = selection.capital_project_id
  where selection.organization_id = job_row.organization_id
    and selection.processing_job_id = job_row.id
    and session.id = job_row.intake_session_id;

  select coalesce(array_agg(task.value ->> 'id' order by task.value ->> 'id'), '{}'::text[])
    into activation_task_ids
  from jsonb_array_elements(plan_snapshot -> 'taskSpecs') task(value);

  if selection_row.selection_status <> 'selected'
    or selection_row.selection_reason <> 'selected'
    or selection_row.outcome <> expected_outcome
    or workflow ->> 'id' <> selection_row.recipe_id || '.' || expected_outcome
    or workflow ->> 'version' <> selection_row.recipe_version
    or workflow ->> 'fingerprint' <> selection_row.slice_fingerprint
    or cardinality(activation_task_ids) <> jsonb_array_length(plan_snapshot -> 'taskSpecs')
    or activation_task_ids is distinct from selection_row.task_ids
    or plan_snapshot -> 'parallelBatches' is distinct from selection_row.parallel_batches then
    raise exception 'integration_preview_workflow_selection_mismatch' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', selection_row.id,
    'fingerprint', selection_row.selection_fingerprint,
    'recipe_id', selection_row.recipe_id,
    'recipe_version', selection_row.recipe_version,
    'slice_fingerprint', selection_row.slice_fingerprint,
    'outcome', selection_row.outcome,
    'task_ids', selection_row.task_ids
  );
end;
$$;

revoke all on function private.worker_validate_integration_preview_workflow_selection_v1(
  uuid, text, jsonb
) from public, anon, authenticated;

create or replace function private.worker_record_agent_response_and_activate_v5(
  p_job_id uuid,
  p_capability_token text,
  p_assistant_message_id uuid,
  p_response jsonb,
  p_proposal jsonb default null,
  p_activation jsonb default null,
  p_execution_brief_internal jsonb default null,
  p_execution_brief_visible jsonb default null,
  p_execution_brief_change_summary jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selection jsonb;
  recorded jsonb;
begin
  if p_activation is not null and p_activation ->> 'job' = 'integration_preview' then
    selection := private.worker_validate_integration_preview_workflow_selection_v1(
      p_job_id, p_capability_token, p_activation
    );
  end if;
  recorded := private.worker_record_agent_response_and_activate_v4(
    p_job_id, p_capability_token, p_assistant_message_id,
    p_response, p_proposal, p_activation,
    p_execution_brief_internal, p_execution_brief_visible,
    p_execution_brief_change_summary
  );
  if selection is not null then
    return recorded || jsonb_build_object('workflow_selection', selection);
  end if;
  return recorded;
end;
$$;

create or replace function public.worker_record_agent_response_and_activate_v5(
  p_job_id uuid,
  p_capability_token text,
  p_assistant_message_id uuid,
  p_response jsonb,
  p_proposal jsonb default null,
  p_activation jsonb default null,
  p_execution_brief_internal jsonb default null,
  p_execution_brief_visible jsonb default null,
  p_execution_brief_change_summary jsonb default '[]'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_agent_response_and_activate_v5(
    p_job_id, p_capability_token, p_assistant_message_id,
    p_response, p_proposal, p_activation,
    p_execution_brief_internal, p_execution_brief_visible,
    p_execution_brief_change_summary
  );
$$;

revoke all on function private.worker_record_agent_response_and_activate_v5(
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;
revoke all on function public.worker_record_agent_response_and_activate_v5(
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function private.worker_record_agent_response_and_activate_v5(
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;
grant execute on function public.worker_record_agent_response_and_activate_v5(
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

comment on function public.worker_record_agent_response_and_activate_v5(
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) is 'Atomically validates an integration-preview activation against its immutable workflow selection, then records the response, governed plan and Execution Brief.';
