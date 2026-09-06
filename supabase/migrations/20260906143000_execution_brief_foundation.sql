-- Immutable Execution Brief history. The brief is a projection of an existing capital plan:
-- a worker may persist it, project members may read it, and no Data API client may rewrite it.

-- The richer meeting route now reaches the financial and structuring conclusion S11. Update the
-- existing plan recorder fail-closed: the migration proceeds only while its prior definition is
-- exactly the version this repository expects.
do $migration$
declare
  function_definition text;
  old_fragment constant text := 'when ''origination_thesis'' then array[''M07'',''C02'',''K04'']';
  new_fragment constant text := 'when ''origination_thesis'' then array[''M07'',''S11'',''K04'']';
begin
  select pg_get_functiondef('private.record_capital_project_plan(uuid,jsonb)'::regprocedure)
  into function_definition;
  if position(new_fragment in function_definition) > 0 then
    return;
  end if;
  if position(old_fragment in function_definition) = 0 then
    raise exception 'record_capital_project_plan definition drifted; refusing an unsafe rewrite';
  end if;
  execute replace(function_definition, old_fragment, new_fragment);
end;
$migration$;

create table public.capital_project_execution_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  plan_id uuid not null,
  brief_version integer not null check (brief_version > 0),
  schema_version text not null check (schema_version = 'execution-brief.v1'),
  brief_fingerprint text not null check (brief_fingerprint ~ '^[0-9a-f]{64}$'),
  storage_fingerprint text not null check (storage_fingerprint ~ '^[0-9a-f]{64}$'),
  execution_mode text not null check (execution_mode in (
    'start_after_display', 'confirm_before_expensive_work', 'approve_external_effect'
  )),
  objective text not null check (char_length(trim(objective)) between 3 and 2000),
  proposed_deliverable text not null check (char_length(trim(proposed_deliverable)) between 3 and 2000),
  workstream_count integer not null check (workstream_count between 3 and 7),
  internal_snapshot jsonb not null check (jsonb_typeof(internal_snapshot) = 'object'),
  visible_snapshot jsonb not null check (jsonb_typeof(visible_snapshot) = 'object'),
  parent_brief_id uuid,
  change_summary jsonb not null default '[]'::jsonb check (jsonb_typeof(change_summary) = 'array'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, capital_project_id, brief_version),
  unique (organization_id, capital_project_id, brief_fingerprint),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, plan_id)
    references public.capital_project_plans(organization_id, id) on delete cascade,
  foreign key (organization_id, parent_brief_id)
    references public.capital_project_execution_briefs(organization_id, id) on delete restrict
);

create index capital_project_execution_briefs_project_idx
  on public.capital_project_execution_briefs (organization_id, capital_project_id, brief_version desc);
create index capital_project_execution_briefs_plan_idx
  on public.capital_project_execution_briefs (organization_id, plan_id, created_at desc);

create table public.capital_project_execution_brief_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  execution_brief_id uuid not null,
  event_type text not null check (event_type in (
    'presented', 'accepted', 'edit_requested', 'superseded', 'started', 'paused', 'cancelled'
  )),
  actor_type text not null check (actor_type in ('system', 'user')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  event_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(event_payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, execution_brief_id)
    references public.capital_project_execution_briefs(organization_id, id) on delete cascade,
  check ((actor_type = 'user') = (actor_user_id is not null))
);

create index capital_project_execution_brief_events_brief_idx
  on public.capital_project_execution_brief_events (organization_id, execution_brief_id, created_at);

alter table public.capital_project_execution_briefs enable row level security;
alter table public.capital_project_execution_briefs force row level security;
alter table public.capital_project_execution_brief_events enable row level security;
alter table public.capital_project_execution_brief_events force row level security;

create policy capital_project_execution_briefs_select
  on public.capital_project_execution_briefs for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));
create policy capital_project_execution_brief_events_select
  on public.capital_project_execution_brief_events for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));

revoke all privileges on public.capital_project_execution_briefs from public, anon, authenticated;
revoke all privileges on public.capital_project_execution_brief_events from public, anon, authenticated;
grant select on public.capital_project_execution_briefs to authenticated;
grant select on public.capital_project_execution_brief_events to authenticated;

create trigger capital_project_execution_briefs_audit
  after insert on public.capital_project_execution_briefs
  for each row execute function private.capture_audit_event();
create trigger capital_project_execution_brief_events_audit
  after insert on public.capital_project_execution_brief_events
  for each row execute function private.capture_audit_event();

create or replace function private.worker_record_capital_project_execution_brief_v1(
  p_job_id uuid,
  p_capability_token text,
  p_internal_snapshot jsonb,
  p_visible_snapshot jsonb,
  p_parent_brief_id uuid default null,
  p_change_summary jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  brief_fingerprint text := lower(coalesce(p_internal_snapshot ->> 'fingerprint', ''));
  workstream_count integer;
  computed_storage_fingerprint text;
begin
  if job_row.kind not in ('agent_operation_brief', 'capital_project_analysis') then
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
    or brief_fingerprint !~ '^[0-9a-f]{64}$'
    or p_visible_snapshot ->> 'fingerprint' is distinct from brief_fingerprint
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
  if workstream_count not between 3 and 7
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
    and brief.brief_fingerprint = brief_fingerprint;
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
    brief_fingerprint, computed_storage_fingerprint, p_internal_snapshot ->> 'executionMode',
    p_internal_snapshot ->> 'objective', p_internal_snapshot ->> 'proposedDeliverable',
    workstream_count, p_internal_snapshot, p_visible_snapshot, p_parent_brief_id,
    p_change_summary, plan_row.created_by
  ) returning * into inserted_row;

  insert into public.capital_project_execution_brief_events (
    organization_id, capital_project_id, execution_brief_id, event_type, actor_type, event_payload
  ) values (
    plan_row.organization_id, session_row.capital_project_id, inserted_row.id, 'presented', 'system',
    jsonb_build_object('fingerprint', brief_fingerprint, 'version', next_version)
  );
  return jsonb_build_object('id', inserted_row.id, 'version', inserted_row.brief_version, 'replayed', false);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid_execution_brief' using errcode = '22023';
end;
$$;

create or replace function public.worker_record_capital_project_execution_brief_v1(
  p_job_id uuid,
  p_capability_token text,
  p_internal_snapshot jsonb,
  p_visible_snapshot jsonb,
  p_parent_brief_id uuid default null,
  p_change_summary jsonb default '[]'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_capital_project_execution_brief_v1(
    p_job_id, p_capability_token, p_internal_snapshot, p_visible_snapshot,
    p_parent_brief_id, p_change_summary
  );
$$;

revoke all on function private.worker_record_capital_project_execution_brief_v1(
  uuid, text, jsonb, jsonb, uuid, jsonb
) from public, anon;
revoke all on function public.worker_record_capital_project_execution_brief_v1(
  uuid, text, jsonb, jsonb, uuid, jsonb
) from public, anon;
grant execute on function private.worker_record_capital_project_execution_brief_v1(
  uuid, text, jsonb, jsonb, uuid, jsonb
) to authenticated;
grant execute on function public.worker_record_capital_project_execution_brief_v1(
  uuid, text, jsonb, jsonb, uuid, jsonb
) to authenticated;

comment on table public.capital_project_execution_briefs is
  'Immutable versioned Execution Briefs. Internal task bindings and safe visible projection remain paired.';
comment on table public.capital_project_execution_brief_events is
  'Append-only user and system decisions over an immutable Execution Brief version.';
comment on function public.worker_record_capital_project_execution_brief_v1(uuid, text, jsonb, jsonb, uuid, jsonb) is
  'Capability-bound fail-closed persistence for a brief that exactly covers one active capital plan.';

-- Add the immutable active plan and the latest brief identity to the worker's existing context.
-- The wrapper preserves every context field assembled by the hardened loader and only appends
-- records already scoped by the claimed job. This lets the worker compile from the plan that is
-- actually active, including historical projects, rather than silently recompiling from today's
-- registry.
alter function private.worker_load_agent_context(uuid, text)
  rename to worker_load_agent_context_before_execution_brief_v1;

revoke all on function private.worker_load_agent_context_before_execution_brief_v1(uuid, text)
  from public, anon, authenticated;

create function private.worker_load_agent_context(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_context jsonb := private.worker_load_agent_context_before_execution_brief_v1(
    p_job_id, p_capability_token
  );
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  project_id uuid := nullif(base_context #>> '{project,id}', '')::uuid;
begin
  return base_context || jsonb_build_object(
    'active_plan', (
      select plan.snapshot
      from public.capital_project_plans plan
      where plan.organization_id = job_row.organization_id
        and plan.capital_project_id = project_id
        and plan.status = 'active'
      order by plan.plan_version desc
      limit 1
    ),
    'latest_execution_brief', (
      select jsonb_build_object(
        'id', brief.id,
        'version', brief.brief_version,
        'fingerprint', brief.brief_fingerprint
      )
      from public.capital_project_execution_briefs brief
      where brief.organization_id = job_row.organization_id
        and brief.capital_project_id = project_id
      order by brief.brief_version desc
      limit 1
    )
  );
exception
  when invalid_text_representation then
    raise exception 'invalid_execution_brief_project_context' using errcode = '22023';
end;
$$;

revoke all on function private.worker_load_agent_context(uuid, text) from public, anon;
grant execute on function private.worker_load_agent_context(uuid, text) to authenticated;

create or replace function public.worker_load_agent_context(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_agent_context(p_job_id, p_capability_token);
$$;

revoke all on function public.worker_load_agent_context(uuid, text) from public, anon;
grant execute on function public.worker_load_agent_context(uuid, text) to authenticated;

-- Record the assistant response, activate the selected plan and persist the visible agreement in
-- one transaction. The active-plan row serializes competing turns; the parent is selected only
-- after that lock, so two workers cannot silently fork the brief history.
create or replace function private.worker_record_agent_response_and_activate_v4(
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
  recorded jsonb;
  persisted jsonb;
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  plan_row public.capital_project_plans;
  parent_brief_id uuid;
begin
  if (p_execution_brief_internal is null) <> (p_execution_brief_visible is null) then
    raise exception 'execution_brief_pair_required' using errcode = '22023';
  end if;
  if p_execution_brief_internal is not null and p_activation is null then
    raise exception 'execution_brief_requires_activation' using errcode = '22023';
  end if;

  recorded := private.worker_record_agent_response_and_activate_v3(
    p_job_id, p_capability_token, p_assistant_message_id,
    p_response, p_proposal, p_activation
  );
  if p_execution_brief_internal is null then
    return recorded;
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
  order by plan.plan_version desc
  limit 1
  for update;
  if not found then
    raise exception 'active_capital_project_plan_not_found' using errcode = 'P0002';
  end if;
  select brief.id into parent_brief_id
  from public.capital_project_execution_briefs brief
  where brief.organization_id = job_row.organization_id
    and brief.capital_project_id = session_row.capital_project_id
  order by brief.brief_version desc
  limit 1;

  persisted := private.worker_record_capital_project_execution_brief_v1(
    p_job_id, p_capability_token,
    p_execution_brief_internal, p_execution_brief_visible,
    parent_brief_id, p_execution_brief_change_summary
  );
  return recorded || jsonb_build_object('execution_brief', persisted);
end;
$$;

create or replace function public.worker_record_agent_response_and_activate_v4(
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
  select private.worker_record_agent_response_and_activate_v4(
    p_job_id, p_capability_token, p_assistant_message_id,
    p_response, p_proposal, p_activation,
    p_execution_brief_internal, p_execution_brief_visible,
    p_execution_brief_change_summary
  );
$$;

revoke all on function private.worker_record_agent_response_and_activate_v4(
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;
revoke all on function public.worker_record_agent_response_and_activate_v4(
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function private.worker_record_agent_response_and_activate_v4(
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;
grant execute on function public.worker_record_agent_response_and_activate_v4(
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

comment on function public.worker_record_agent_response_and_activate_v4(
  uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) is 'Atomically records an advisor response, activates its governed plan and stores the paired internal and visible Execution Brief.';
