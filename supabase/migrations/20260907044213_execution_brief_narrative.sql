-- A customer-safe narrative of Live Work. The source of truth remains the immutable task-run
-- rail; this projection translates those transitions into the workstreams the person approved.
-- It never returns TaskSpec IDs, executor/provider details, context manifests or error payloads.

create or replace function private.read_capital_project_execution_brief_narrative_v1(
  p_execution_brief_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  brief_row public.capital_project_execution_briefs;
  narrative_events jsonb;
begin
  select brief.* into brief_row
  from public.capital_project_execution_briefs brief
  where brief.id = p_execution_brief_id
    and private.can_access_capital_project(brief.organization_id, brief.capital_project_id);
  if not found then
    raise exception 'execution_brief_not_found' using errcode = 'P0002';
  end if;

  with workstreams as (
    select
      internal_workstream.position - 1 as position,
      internal_workstream.value -> 'sourceTaskIds' as source_task_ids,
      visible_workstream.value ->> 'label' as label,
      visible_workstream.value ->> 'purpose' as purpose,
      visible_workstream.value ->> 'output' as output
    from jsonb_array_elements(brief_row.internal_snapshot -> 'workstreams')
      with ordinality internal_workstream(value, position)
    join jsonb_array_elements(brief_row.visible_snapshot -> 'workstreams')
      with ordinality visible_workstream(value, position)
      on visible_workstream.position = internal_workstream.position
  ),
  bound_tasks as (
    select
      workstream.position,
      workstream.label,
      workstream.purpose,
      workstream.output,
      plan_task.id as plan_task_id
    from workstreams workstream
    cross join lateral jsonb_array_elements_text(workstream.source_task_ids) source_task(task_id)
    join public.capital_project_plan_tasks plan_task
      on plan_task.organization_id = brief_row.organization_id
      and plan_task.plan_id = brief_row.plan_id
      and plan_task.task_id = source_task.task_id
  ),
  current_task_state as (
    select
      bound_task.position,
      bound_task.label,
      bound_task.purpose,
      bound_task.output,
      coalesce(latest_run.status, 'waiting') as status,
      latest_run.started_at,
      latest_run.completed_at,
      latest_run.created_at
    from bound_tasks bound_task
    left join lateral (
      select run.status, run.started_at, run.completed_at, run.created_at
      from public.capital_project_task_runs run
      where run.organization_id = brief_row.organization_id
        and run.plan_id = brief_row.plan_id
        and run.plan_task_id = bound_task.plan_task_id
      order by run.attempt_no desc
      limit 1
    ) latest_run on true
  ),
  summarized as (
    select
      task_state.position,
      task_state.label,
      task_state.purpose,
      task_state.output,
      min(coalesce(task_state.started_at, task_state.created_at))
        filter (where task_state.status <> 'waiting') as first_started_at,
      case
        when bool_or(task_state.status in ('failed', 'blocked')) then 'needs_attention'
        when bool_or(task_state.status = 'waiting_user') then 'waiting_user'
        when bool_and(task_state.status = 'succeeded') then 'completed'
        when bool_or(task_state.status = 'running') then 'running'
        when bool_or(task_state.status = 'queued') then 'queued'
        else 'waiting'
      end as status,
      case
        when bool_or(task_state.status in ('failed', 'blocked')) then
          max(coalesce(task_state.completed_at, task_state.started_at, task_state.created_at))
            filter (where task_state.status in ('failed', 'blocked'))
        when bool_or(task_state.status = 'waiting_user') then
          max(coalesce(task_state.completed_at, task_state.started_at, task_state.created_at))
            filter (where task_state.status = 'waiting_user')
        when bool_and(task_state.status = 'succeeded') then
          max(coalesce(task_state.completed_at, task_state.started_at, task_state.created_at))
        else null
      end as terminal_at
    from current_task_state task_state
    group by task_state.position, task_state.label, task_state.purpose, task_state.output
  ),
  projected_events as (
    select
      summarized.position,
      summarized.label,
      summarized.purpose,
      summarized.output,
      'started'::text as kind,
      greatest(summarized.first_started_at, brief_row.created_at) as occurred_at,
      summarized.first_started_at < brief_row.created_at as carried_forward,
      0 as kind_order
    from summarized
    where summarized.first_started_at is not null
      and (
        summarized.first_started_at >= brief_row.created_at
        or summarized.terminal_at is null
        or summarized.terminal_at >= brief_row.created_at
      )

    union all

    select
      summarized.position,
      summarized.label,
      summarized.purpose,
      summarized.output,
      summarized.status as kind,
      greatest(summarized.terminal_at, brief_row.created_at) as occurred_at,
      summarized.terminal_at < brief_row.created_at as carried_forward,
      1 as kind_order
    from summarized
    where summarized.status in ('completed', 'waiting_user', 'needs_attention')
      and summarized.terminal_at is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventKey', encode(extensions.digest(convert_to(
      brief_row.id::text || ':' || projected_event.position::text || ':' ||
      projected_event.kind || ':' || projected_event.occurred_at::text,
      'utf8'
    ),
      'sha256'
    ), 'hex'),
    'position', projected_event.position,
    'label', projected_event.label,
    'purpose', projected_event.purpose,
    'output', projected_event.output,
    'kind', projected_event.kind,
    'occurredAt', projected_event.occurred_at,
    'carriedForward', projected_event.carried_forward
  ) order by projected_event.occurred_at, projected_event.kind_order, projected_event.position), '[]'::jsonb)
  into narrative_events
  from projected_events projected_event;

  if jsonb_array_length(narrative_events) > brief_row.workstream_count * 2 then
    raise exception 'execution_brief_narrative_binding_invalid' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'briefId', brief_row.id,
    'version', brief_row.brief_version,
    'events', narrative_events
  );
end;
$$;

create or replace function public.read_capital_project_execution_brief_narrative_v1(
  p_execution_brief_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.read_capital_project_execution_brief_narrative_v1(p_execution_brief_id);
$$;

revoke all on function private.read_capital_project_execution_brief_narrative_v1(uuid)
  from public, anon;
revoke all on function public.read_capital_project_execution_brief_narrative_v1(uuid)
  from public, anon;
grant execute on function private.read_capital_project_execution_brief_narrative_v1(uuid)
  to authenticated;
grant execute on function public.read_capital_project_execution_brief_narrative_v1(uuid)
  to authenticated;

comment on function public.read_capital_project_execution_brief_narrative_v1(uuid) is
  'Returns a tenant-authorized, refresh-stable narrative of real workstream transitions without exposing task or worker internals.';
