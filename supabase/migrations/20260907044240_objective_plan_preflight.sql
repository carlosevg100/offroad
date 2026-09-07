-- Record the objective-specific plan and its fail-closed execution decision in shadow before the
-- legacy activation path runs. This is deliberately additive: it observes the migration from the
-- six fixed rails without weakening their exact target checks or claiming a general dispatcher.

create table public.capital_project_objective_preflights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  source_message_id uuid not null,
  processing_job_id uuid not null,
  mode text not null default 'shadow' check (mode = 'shadow'),
  objective_kind text not null check (objective_kind in (
    'factual_question', 'risk_matrix', 'meeting_preparation', 'board_decision',
    'documents_to_case', 'capital_matching', 'operation_review', 'company_analysis',
    'capital_strategy', 'material_preparation', 'ambiguous'
  )),
  plan_schema_version text not null check (plan_schema_version = 'objective-plan.v1'),
  structural_identity text not null check (structural_identity ~ '^[0-9a-f]{64}$'),
  readiness_schema_version text not null check (readiness_schema_version = 'objective-plan-readiness.v1'),
  readiness_fingerprint text not null check (readiness_fingerprint ~ '^[0-9a-f]{64}$'),
  readiness_status text not null check (readiness_status in ('ready', 'partial', 'blocked')),
  terminal_reachable boolean not null,
  objective_plan jsonb not null check (jsonb_typeof(objective_plan) = 'object'),
  preflight_decision jsonb not null check (jsonb_typeof(preflight_decision) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (
    organization_id, source_message_id, structural_identity, readiness_fingerprint
  ),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, source_message_id)
    references public.agent_messages(organization_id, id) on delete restrict,
  foreign key (organization_id, processing_job_id)
    references public.processing_jobs(organization_id, id) on delete restrict
);

create index capital_project_objective_preflights_project_idx
  on public.capital_project_objective_preflights (
    organization_id, capital_project_id, created_at desc
  );
create index capital_project_objective_preflights_job_idx
  on public.capital_project_objective_preflights (organization_id, processing_job_id);

alter table public.capital_project_objective_preflights enable row level security;
alter table public.capital_project_objective_preflights force row level security;

create policy capital_project_objective_preflights_select
  on public.capital_project_objective_preflights for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));

revoke all privileges on public.capital_project_objective_preflights
  from public, anon, authenticated;
grant select on public.capital_project_objective_preflights to authenticated;

create trigger capital_project_objective_preflights_audit
  after insert on public.capital_project_objective_preflights
  for each row execute function private.capture_audit_event();

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
      'capital_strategy', 'material_preparation', 'ambiguous'
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

create or replace function public.worker_record_objective_plan_preflight_v1(
  p_job_id uuid,
  p_capability_token text,
  p_objective_plan jsonb,
  p_preflight_decision jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_objective_plan_preflight_v1(
    p_job_id, p_capability_token, p_objective_plan, p_preflight_decision
  );
$$;

revoke all on function private.worker_record_objective_plan_preflight_v1(
  uuid, text, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.worker_record_objective_plan_preflight_v1(
  uuid, text, jsonb, jsonb
) from public, anon;
grant execute on function private.worker_record_objective_plan_preflight_v1(
  uuid, text, jsonb, jsonb
) to authenticated;
grant execute on function public.worker_record_objective_plan_preflight_v1(
  uuid, text, jsonb, jsonb
) to authenticated;

comment on table public.capital_project_objective_preflights is
  'Immutable shadow record of an objective-specific graph and its fail-closed execution readiness decision.';
comment on function public.worker_record_objective_plan_preflight_v1(
  uuid, text, jsonb, jsonb
) is
  'Capability-bound worker command that records, but does not yet activate, an objective-specific plan and preflight decision.';
