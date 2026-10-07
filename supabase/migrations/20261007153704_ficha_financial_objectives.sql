-- Add financial objectives calibrated by the canonical fichas. The four already compiled
-- organization/market/monitoring/workspace kinds also need persistence parity.
-- This observes intent; it does not release methods, grant access or authorize execution.
alter table public.capital_project_objective_preflights
  drop constraint capital_project_objective_preflights_objective_kind_check;
alter table public.capital_project_objective_preflights
  add constraint capital_project_objective_preflights_objective_kind_check check (objective_kind in (
    'factual_question', 'risk_matrix', 'meeting_preparation', 'board_decision',
    'documents_to_case', 'capital_matching', 'operation_review', 'company_analysis',
    'capital_strategy', 'material_preparation', 'information_organization',
    'market_mapping', 'monitoring', 'workspace_management',
    'proposal_comparison', 'relative_debt_cost', 'debt_capacity', 'ambiguous'
  ));

create or replace function private.worker_record_objective_plan_preflight_v1(
  p_job_id uuid,
  p_capability_token text,
  p_objective_plan jsonb,
  p_preflight_decision jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  message_row public.agent_messages;
  inserted_row public.capital_project_objective_preflights;
  existing_row public.capital_project_objective_preflights;
  plan_task_ids text[];
  target_task_ids text[];
  decision_task_ids text[];
  executable_task_ids text[];
  blocked_task_ids text[];
  partition_task_ids text[];
  computed_status text;
  computed_terminal boolean;
begin
  if job_row.kind <> 'agent_operation_brief'
    or jsonb_typeof(p_objective_plan) <> 'object'
    or jsonb_typeof(p_preflight_decision) <> 'object' then
    raise exception 'objective_preflight_job_invalid' using errcode = '22023';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.capital_project_id is not null;
  if not found then
    raise exception 'objective_preflight_project_not_found' using errcode = 'P0002';
  end if;

  begin
    select message.* into message_row
    from public.agent_messages message
    where message.organization_id = job_row.organization_id
      and message.id = (job_row.payload ->> 'message_id')::uuid
      and message.intake_session_id = job_row.intake_session_id
      and message.role = 'user'
      and message.status = 'processing';
  exception when invalid_text_representation then
    raise exception 'objective_preflight_message_invalid' using errcode = '22023';
  end;
  if not found then
    raise exception 'objective_preflight_message_not_found' using errcode = 'P0002';
  end if;

  if p_objective_plan ->> 'schemaVersion' <> 'objective-plan.v1'
    or p_objective_plan ->> 'objectiveKind' not in (
      'factual_question', 'risk_matrix', 'meeting_preparation', 'board_decision',
      'documents_to_case', 'capital_matching', 'operation_review', 'company_analysis',
      'capital_strategy', 'material_preparation', 'information_organization',
      'market_mapping', 'monitoring', 'workspace_management',
      'proposal_comparison', 'relative_debt_cost', 'debt_capacity', 'ambiguous'
    )
    or coalesce(p_objective_plan ->> 'structuralIdentity', '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_objective_plan #> '{taskGraph,tasks}') <> 'array'
    or jsonb_array_length(p_objective_plan #> '{taskGraph,tasks}') > 80
    or jsonb_typeof(p_objective_plan -> 'targetTaskIds') <> 'array'
    or jsonb_array_length(p_objective_plan -> 'targetTaskIds') > 80
    or octet_length(p_objective_plan::text) > 2097152
    or p_preflight_decision ->> 'schemaVersion' <> 'objective-plan-readiness.v1'
    or p_preflight_decision ->> 'status' not in ('ready', 'partial', 'blocked')
    or coalesce(p_preflight_decision ->> 'readinessFingerprint', '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_preflight_decision -> 'terminalReachable') <> 'boolean'
    or jsonb_typeof(p_preflight_decision -> 'tasks') <> 'array'
    or jsonb_typeof(p_preflight_decision -> 'executableTaskIds') <> 'array'
    or jsonb_typeof(p_preflight_decision -> 'blockedTaskIds') <> 'array'
    or octet_length(p_preflight_decision::text) > 2097152 then
    raise exception 'objective_preflight_contract_invalid' using errcode = '22023';
  end if;

  if jsonb_array_length(p_preflight_decision -> 'tasks') > 80
    or jsonb_array_length(p_preflight_decision -> 'executableTaskIds') > 80
    or jsonb_array_length(p_preflight_decision -> 'blockedTaskIds') > 80 then
    raise exception 'objective_preflight_contract_too_large' using errcode = '22023';
  end if;

  select coalesce(array_agg(task ->> 'id' order by task ->> 'id'), '{}'::text[])
  into plan_task_ids
  from jsonb_array_elements(p_objective_plan #> '{taskGraph,tasks}') task;
  select coalesce(array_agg(value order by value), '{}'::text[])
  into target_task_ids
  from jsonb_array_elements_text(p_objective_plan -> 'targetTaskIds') target(value);
  select coalesce(array_agg(task ->> 'taskId' order by task ->> 'taskId'), '{}'::text[])
  into decision_task_ids
  from jsonb_array_elements(p_preflight_decision -> 'tasks') task;
  select coalesce(array_agg(value order by value), '{}'::text[])
  into executable_task_ids
  from jsonb_array_elements_text(p_preflight_decision -> 'executableTaskIds') task(value);
  select coalesce(array_agg(value order by value), '{}'::text[])
  into blocked_task_ids
  from jsonb_array_elements_text(p_preflight_decision -> 'blockedTaskIds') task(value);
  select coalesce(array_agg(value order by value), '{}'::text[])
  into partition_task_ids
  from unnest(executable_task_ids || blocked_task_ids) task(value);

  if cardinality(plan_task_ids) <> (select count(distinct value) from unnest(plan_task_ids) task(value))
    or cardinality(plan_task_ids) = 0
    or cardinality(target_task_ids) = 0
    or cardinality(target_task_ids) <> (select count(distinct value) from unnest(target_task_ids) target(value))
    or exists (select 1 from unnest(plan_task_ids) task(value) where value !~ '^[A-Z][0-9]{2}$')
    or decision_task_ids is distinct from plan_task_ids
    or partition_task_ids is distinct from plan_task_ids
    or exists (select 1 from unnest(target_task_ids) target(value) where not (value = any(plan_task_ids)))
    or exists (
      select 1 from jsonb_array_elements(p_preflight_decision -> 'tasks') task
      where coalesce(task ->> 'taskId', '') !~ '^[A-Z][0-9]{2}$'
        or jsonb_typeof(task -> 'executable') <> 'boolean'
        or jsonb_typeof(task -> 'reasons') <> 'array'
        or ((task ->> 'executable')::boolean and task ->> 'taskId' <> all(executable_task_ids))
        or (not (task ->> 'executable')::boolean and task ->> 'taskId' <> all(blocked_task_ids))
    ) then
    raise exception 'objective_preflight_task_partition_invalid' using errcode = '22023';
  end if;

  computed_status := case
    when cardinality(blocked_task_ids) = 0 then 'ready'
    when cardinality(executable_task_ids) = 0 then 'blocked'
    else 'partial'
  end;
  computed_terminal := not exists (
    select 1 from unnest(target_task_ids) target(value)
    where value = any(blocked_task_ids)
  );
  if p_preflight_decision ->> 'status' <> computed_status
    or (p_preflight_decision ->> 'terminalReachable')::boolean is distinct from computed_terminal then
    raise exception 'objective_preflight_outcome_invalid' using errcode = '22023';
  end if;

  select preflight.* into existing_row
  from public.capital_project_objective_preflights preflight
  where preflight.organization_id = job_row.organization_id
    and preflight.source_message_id = message_row.id
    and preflight.structural_identity = p_objective_plan ->> 'structuralIdentity'
    and preflight.readiness_fingerprint = p_preflight_decision ->> 'readinessFingerprint';
  if found then
    return jsonb_build_object(
      'id', existing_row.id, 'status', existing_row.readiness_status,
      'terminal_reachable', existing_row.terminal_reachable, 'replayed', true
    );
  end if;

  insert into public.capital_project_objective_preflights (
    organization_id, capital_project_id, source_message_id, processing_job_id,
    objective_kind, plan_schema_version, structural_identity,
    readiness_schema_version, readiness_fingerprint, readiness_status,
    terminal_reachable, objective_plan, preflight_decision, created_by
  ) values (
    job_row.organization_id, session_row.capital_project_id, message_row.id, job_row.id,
    p_objective_plan ->> 'objectiveKind', p_objective_plan ->> 'schemaVersion',
    p_objective_plan ->> 'structuralIdentity', p_preflight_decision ->> 'schemaVersion',
    p_preflight_decision ->> 'readinessFingerprint', p_preflight_decision ->> 'status',
    (p_preflight_decision ->> 'terminalReachable')::boolean,
    p_objective_plan, p_preflight_decision, message_row.created_by
  )
  on conflict (
    organization_id, source_message_id, structural_identity, readiness_fingerprint
  ) do nothing
  returning * into inserted_row;

  if inserted_row.id is null then
    select preflight.* into existing_row
    from public.capital_project_objective_preflights preflight
    where preflight.organization_id = job_row.organization_id
      and preflight.source_message_id = message_row.id
      and preflight.structural_identity = p_objective_plan ->> 'structuralIdentity'
      and preflight.readiness_fingerprint = p_preflight_decision ->> 'readinessFingerprint';
    return jsonb_build_object(
      'id', existing_row.id, 'status', existing_row.readiness_status,
      'terminal_reachable', existing_row.terminal_reachable, 'replayed', true
    );
  end if;

  return jsonb_build_object(
    'id', inserted_row.id, 'status', inserted_row.readiness_status,
    'terminal_reachable', inserted_row.terminal_reachable, 'replayed', false
  );
end;
$$;

