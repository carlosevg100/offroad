CREATE OR REPLACE FUNCTION private.worker_record_capital_project_execution_brief_v1(p_job_id uuid, p_capability_token text, p_internal_snapshot jsonb, p_visible_snapshot jsonb, p_parent_brief_id uuid DEFAULT NULL::uuid, p_change_summary jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  plan_row public.capital_project_plans;
  existing_row public.capital_project_execution_briefs;
  latest_row public.capital_project_execution_briefs;
  inserted_row public.capital_project_execution_briefs;
  expected_task_ids text[];
  projected_task_ids text[];
  projected_task_count integer;
  distinct_projected_task_count integer;
  next_version integer;
  v_brief_fingerprint text := lower(coalesce(p_internal_snapshot ->> 'fingerprint', ''));
  workstream_count integer;
  computed_storage_fingerprint text;
begin
  perform private.validate_receivables_scope_brief(job_row.organization_id,job_row.intake_session_id,p_internal_snapshot,p_visible_snapshot);
  if job_row.kind not in ('agent_operation_brief', 'capital_project_analysis', 'execution_brief_proposal') then
    raise exception 'execution_brief_job_invalid' using errcode = '22023';
  end if;
  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.capital_project_id is not null;
  if not found then
    raise exception 'execution_brief_project_not_found' using errcode = 'P0002';
  end if;
  select plan.* into plan_row
  from public.capital_project_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.capital_project_id = session_row.capital_project_id
    and plan.status = 'active'
    and (
      job_row.kind <> 'capital_project_analysis'
      or plan.id::text = job_row.payload ->> 'capital_project_plan_id'
    )
  for update of plan;
  if not found then
    raise exception 'active_capital_project_plan_not_found' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_internal_snapshot) is distinct from 'object'
    or jsonb_typeof(p_visible_snapshot) is distinct from 'object'
    or p_internal_snapshot ->> 'schemaVersion' is distinct from 'execution-brief.v1'
    or p_visible_snapshot ->> 'schemaVersion' is distinct from 'execution-brief.v1'
    or v_brief_fingerprint !~ '^[0-9a-f]{64}$'
    or p_visible_snapshot ->> 'fingerprint' is distinct from v_brief_fingerprint
    or char_length(trim(coalesce(p_internal_snapshot ->> 'planVersion', ''))) < 3
    or jsonb_typeof(p_internal_snapshot -> 'authority') is distinct from 'object'
    or p_internal_snapshot ->> 'objective' is distinct from p_visible_snapshot ->> 'objective'
    or p_internal_snapshot ->> 'proposedDeliverable' is distinct from p_visible_snapshot ->> 'proposedDeliverable'
    or p_internal_snapshot ->> 'executionMode' is distinct from p_visible_snapshot ->> 'executionMode'
    or p_internal_snapshot -> 'currentContext' is distinct from p_visible_snapshot -> 'currentContext'
    or p_internal_snapshot -> 'assumptions' is distinct from p_visible_snapshot -> 'assumptions'
    or p_internal_snapshot -> 'checkpoints' is distinct from p_visible_snapshot -> 'checkpoints'
    or not (coalesce(p_internal_snapshot ->> 'executionMode', '') = any(array[
      'start_after_display', 'confirm_before_expensive_work', 'approve_external_effect'
    ]))
    or jsonb_typeof(p_internal_snapshot -> 'workstreams') is distinct from 'array'
    or jsonb_typeof(p_visible_snapshot -> 'workstreams') is distinct from 'array'
    or jsonb_typeof(p_internal_snapshot -> 'currentContext') is distinct from 'array'
    or jsonb_typeof(p_internal_snapshot -> 'assumptions') is distinct from 'array'
    or jsonb_typeof(p_internal_snapshot -> 'checkpoints') is distinct from 'array'
    or jsonb_typeof(p_visible_snapshot -> 'currentContext') is distinct from 'array'
    or jsonb_typeof(p_visible_snapshot -> 'assumptions') is distinct from 'array'
    or jsonb_typeof(p_visible_snapshot -> 'checkpoints') is distinct from 'array'
    or jsonb_typeof(p_change_summary) is distinct from 'array' then
    raise exception 'invalid_execution_brief' using errcode = '22023';
  end if;

  workstream_count := jsonb_array_length(p_internal_snapshot -> 'workstreams');
  if workstream_count not between 1 and 7
    or jsonb_array_length(p_visible_snapshot -> 'workstreams') <> workstream_count
    or p_visible_snapshot ? 'planVersion'
    or p_visible_snapshot ? 'authority'
    or exists (
      select 1 from jsonb_array_elements(p_visible_snapshot -> 'workstreams') workstream
      where workstream ? 'sourceTaskIds' or workstream ? 'key' or workstream ? 'inclusionReasons'
    )
    or exists (
      select 1
      from jsonb_array_elements(p_internal_snapshot -> 'workstreams') with ordinality internal_workstream(value, position)
      join jsonb_array_elements(p_visible_snapshot -> 'workstreams') with ordinality visible_workstream(value, position)
        using (position)
      where internal_workstream.value ->> 'label' is distinct from visible_workstream.value ->> 'label'
        or internal_workstream.value ->> 'purpose' is distinct from visible_workstream.value ->> 'purpose'
        or internal_workstream.value ->> 'output' is distinct from visible_workstream.value ->> 'output'
        or internal_workstream.value -> 'analyses' is distinct from visible_workstream.value -> 'analyses'
        or visible_workstream.value -> 'sources' is distinct from (
          select coalesce(jsonb_agg(jsonb_build_object(
            'label', source.value ->> 'label',
            'status', source.value ->> 'status',
            'informationClass', source.value ->> 'informationClass'
          ) order by source.position), '[]'::jsonb)
          from jsonb_array_elements(internal_workstream.value -> 'sources')
            with ordinality source(value, position)
        )
        or visible_workstream.value -> 'dependencies' is distinct from (
          select coalesce(jsonb_agg(to_jsonb(dependency_workstream.value ->> 'label') order by dependency.position), '[]'::jsonb)
          from jsonb_array_elements_text(internal_workstream.value -> 'dependencies')
            with ordinality dependency(key, position)
          join jsonb_array_elements(p_internal_snapshot -> 'workstreams') dependency_workstream(value)
            on dependency_workstream.value ->> 'key' = dependency.key
        )
    )
    or exists (
      select 1 from jsonb_array_elements(p_internal_snapshot -> 'workstreams') workstream
      where jsonb_typeof(workstream -> 'sourceTaskIds') is distinct from 'array'
        or jsonb_array_length(workstream -> 'sourceTaskIds') = 0
        or jsonb_typeof(workstream -> 'sources') is distinct from 'array'
        or jsonb_typeof(workstream -> 'analyses') is distinct from 'array'
        or jsonb_typeof(workstream -> 'dependencies') is distinct from 'array'
    ) then
    raise exception 'invalid_execution_brief_projection' using errcode = '22023';
  end if;

  select array_agg(task.task_id order by task.task_id)
  into expected_task_ids
  from public.capital_project_plan_tasks task
  where task.organization_id = plan_row.organization_id
    and task.plan_id = plan_row.id;

  select
    array_agg(projected.task_id order by projected.task_id),
    count(*),
    count(distinct projected.task_id)
  into projected_task_ids, projected_task_count, distinct_projected_task_count
  from (
    select jsonb_array_elements_text(workstream -> 'sourceTaskIds') as task_id
    from jsonb_array_elements(p_internal_snapshot -> 'workstreams') workstream
  ) projected;
  if projected_task_count <> cardinality(expected_task_ids)
    or distinct_projected_task_count <> projected_task_count
    or projected_task_ids is distinct from expected_task_ids then
    raise exception 'execution_brief_task_projection_mismatch' using errcode = '22023';
  end if;

  select brief.* into existing_row
  from public.capital_project_execution_briefs brief
  where brief.organization_id = plan_row.organization_id
    and brief.capital_project_id = session_row.capital_project_id
    and brief.brief_fingerprint = v_brief_fingerprint;
  if found then
    return jsonb_build_object('id', existing_row.id, 'version', existing_row.brief_version, 'replayed', true);
  end if;

  select brief.* into latest_row
  from public.capital_project_execution_briefs brief
  where brief.organization_id = plan_row.organization_id
    and brief.capital_project_id = session_row.capital_project_id
  order by brief.brief_version desc
  limit 1;
  if found and p_parent_brief_id is distinct from latest_row.id then
    raise exception 'execution_brief_parent_mismatch' using errcode = '40001';
  elsif not found and p_parent_brief_id is not null then
    raise exception 'execution_brief_parent_without_history' using errcode = '22023';
  end if;
  next_version := coalesce(latest_row.brief_version, 0) + 1;
  computed_storage_fingerprint := encode(extensions.digest(
    convert_to(p_internal_snapshot::text || E'\n' || p_visible_snapshot::text, 'utf8'),
    'sha256'
  ), 'hex');

  insert into public.capital_project_execution_briefs (
    organization_id, capital_project_id, plan_id, brief_version, schema_version,
    brief_fingerprint, storage_fingerprint, execution_mode, objective,
    proposed_deliverable, workstream_count, internal_snapshot, visible_snapshot,
    parent_brief_id, change_summary, created_by
  ) values (
    plan_row.organization_id, session_row.capital_project_id, plan_row.id, next_version, 'execution-brief.v1',
    v_brief_fingerprint, computed_storage_fingerprint, p_internal_snapshot ->> 'executionMode',
    p_internal_snapshot ->> 'objective', p_internal_snapshot ->> 'proposedDeliverable',
    workstream_count, p_internal_snapshot, p_visible_snapshot, p_parent_brief_id,
    p_change_summary, plan_row.created_by
  ) returning * into inserted_row;

  insert into public.capital_project_execution_brief_events (
    organization_id, capital_project_id, execution_brief_id, event_type, actor_type, event_payload
  ) values (
    plan_row.organization_id, session_row.capital_project_id, inserted_row.id, 'presented', 'system',
    jsonb_build_object('fingerprint', v_brief_fingerprint, 'version', next_version)
  );
  if p_parent_brief_id is not null then
    insert into public.capital_project_execution_brief_events (
      organization_id, capital_project_id, execution_brief_id, event_type, actor_type, event_payload
    ) values (
      plan_row.organization_id, session_row.capital_project_id, p_parent_brief_id, 'superseded', 'system',
      jsonb_build_object('replaced_by_fingerprint', v_brief_fingerprint, 'replaced_by_version', next_version)
    );
  end if;
  return jsonb_build_object('id', inserted_row.id, 'version', inserted_row.brief_version, 'replayed', false);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid_execution_brief' using errcode = '22023';
end;
$function$
