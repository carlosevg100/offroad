-- Persist the all-or-nothing universal dispatch candidate beside the objective preflight. This
-- is evidence only: rows are immutable, mode is internal_shadow, and both execution booleans are
-- constrained false. The released fixed rails remain the only activation path.

create table public.capital_project_objective_dispatch_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  objective_preflight_id uuid not null,
  objective_method_binding_id uuid not null,
  objective_workflow_selection_id uuid not null,
  source_message_id uuid not null,
  processing_job_id uuid not null,
  schema_version text not null check (schema_version = 'universal-dispatch-candidate.v1'),
  mode text not null check (mode = 'internal_shadow'),
  candidate_status text not null check (candidate_status in ('candidate', 'blocked')),
  candidate_fingerprint text not null check (candidate_fingerprint ~ '^[0-9a-f]{64}$'),
  readiness_fingerprint text not null check (readiness_fingerprint ~ '^[0-9a-f]{64}$'),
  capability_manifest_hash text not null check (capability_manifest_hash ~ '^[0-9a-f]{64}$'),
  execution_context_hash text not null check (execution_context_hash ~ '^[0-9a-f]{64}$'),
  executor_registry_hash text not null check (executor_registry_hash ~ '^[0-9a-f]{64}$'),
  task_ids text[] not null default '{}',
  parallel_batches jsonb not null check (jsonb_typeof(parallel_batches) = 'array'),
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  will_execute boolean not null default false check (not will_execute),
  external_effect_allowed boolean not null default false check (not external_effect_allowed),
  dispatch_candidate jsonb not null check (jsonb_typeof(dispatch_candidate) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, objective_preflight_id, candidate_fingerprint),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, objective_preflight_id)
    references public.capital_project_objective_preflights(organization_id, id) on delete cascade,
  foreign key (organization_id, objective_method_binding_id)
    references public.capital_project_objective_method_bindings(organization_id, id) on delete cascade,
  foreign key (organization_id, objective_workflow_selection_id)
    references public.capital_project_objective_workflow_selections(organization_id, id) on delete cascade,
  foreign key (organization_id, source_message_id)
    references public.agent_messages(organization_id, id) on delete restrict,
  foreign key (organization_id, processing_job_id)
    references public.processing_jobs(organization_id, id) on delete restrict,
  check (cardinality(task_ids) <= 80),
  check ((candidate_status = 'candidate') = (cardinality(task_ids) > 0)),
  check ((candidate_status = 'candidate') = (jsonb_array_length(parallel_batches) > 0)),
  check ((candidate_status = 'blocked') = (jsonb_array_length(reasons) > 0))
);

create index capital_project_objective_dispatch_candidates_project_idx
  on public.capital_project_objective_dispatch_candidates (
    organization_id, capital_project_id, created_at desc
  );
create index capital_project_objective_dispatch_candidates_job_idx
  on public.capital_project_objective_dispatch_candidates (organization_id, processing_job_id);
create index capital_project_objective_dispatch_candidates_method_binding_idx
  on public.capital_project_objective_dispatch_candidates (organization_id, objective_method_binding_id);
create index capital_project_objective_dispatch_candidates_workflow_selection_idx
  on public.capital_project_objective_dispatch_candidates (organization_id, objective_workflow_selection_id);
create index capital_project_objective_dispatch_candidates_source_message_idx
  on public.capital_project_objective_dispatch_candidates (organization_id, source_message_id);
create index capital_project_objective_dispatch_candidates_created_by_idx
  on public.capital_project_objective_dispatch_candidates (created_by);

alter table public.capital_project_objective_dispatch_candidates enable row level security;
alter table public.capital_project_objective_dispatch_candidates force row level security;

create policy capital_project_objective_dispatch_candidates_select
  on public.capital_project_objective_dispatch_candidates for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));

revoke all privileges on public.capital_project_objective_dispatch_candidates
  from public, anon, authenticated;
grant select on public.capital_project_objective_dispatch_candidates to authenticated;

create trigger capital_project_objective_dispatch_candidates_audit
  after insert on public.capital_project_objective_dispatch_candidates
  for each row execute function private.capture_audit_event();

create or replace function private.worker_record_objective_plan_preflight_v5(
  p_job_id uuid,
  p_capability_token text,
  p_objective_plan jsonb,
  p_preflight_decision jsonb,
  p_specialization jsonb,
  p_method_binding jsonb,
  p_workflow_selection jsonb,
  p_dispatch_candidate jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  preflight_result jsonb;
  preflight_row public.capital_project_objective_preflights;
  binding_row public.capital_project_objective_method_bindings;
  selection_row public.capital_project_objective_workflow_selections;
  existing_row public.capital_project_objective_dispatch_candidates;
  inserted_row public.capital_project_objective_dispatch_candidates;
  candidate_task_ids text[];
  batched_task_ids text[];
  selection_task_ids text[];
  candidate_state boolean;
begin
  if job_row.kind <> 'agent_operation_brief'
    or jsonb_typeof(p_dispatch_candidate) <> 'object'
    or p_dispatch_candidate ->> 'schemaVersion' <> 'universal-dispatch-candidate.v1'
    or p_dispatch_candidate ->> 'mode' <> 'internal_shadow'
    or p_dispatch_candidate ->> 'status' not in ('candidate', 'blocked')
    or coalesce(p_dispatch_candidate ->> 'fingerprint', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_dispatch_candidate ->> 'objectiveStructuralIdentity', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_dispatch_candidate ->> 'readinessFingerprint', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_dispatch_candidate ->> 'specializationFingerprint', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_dispatch_candidate ->> 'methodBindingFingerprint', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_dispatch_candidate ->> 'workflowSelectionFingerprint', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_dispatch_candidate ->> 'capabilityManifestHash', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_dispatch_candidate ->> 'executionContextHash', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_dispatch_candidate ->> 'executorRegistryHash', '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_dispatch_candidate -> 'tasks') <> 'array'
    or jsonb_array_length(p_dispatch_candidate -> 'tasks') > 80
    or jsonb_typeof(p_dispatch_candidate -> 'parallelBatches') <> 'array'
    or jsonb_array_length(p_dispatch_candidate -> 'parallelBatches') > 80
    or jsonb_typeof(p_dispatch_candidate -> 'reasons') <> 'array'
    or jsonb_array_length(p_dispatch_candidate -> 'reasons') > 240
    or jsonb_typeof(p_dispatch_candidate -> 'willExecute') <> 'boolean'
    or (p_dispatch_candidate ->> 'willExecute')::boolean
    or jsonb_typeof(p_dispatch_candidate -> 'externalEffectAllowed') <> 'boolean'
    or (p_dispatch_candidate ->> 'externalEffectAllowed')::boolean
    or octet_length(p_dispatch_candidate::text) > 2097152 then
    raise exception 'universal_dispatch_candidate_contract_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_dispatch_candidate -> 'tasks') task
    where coalesce(task ->> 'taskId', '') !~ '^[A-Z][0-9]{2}$'
      or coalesce(task ->> 'executorKey', '') = ''
      or coalesce(task ->> 'executorVersion', '') = ''
      or jsonb_typeof(task -> 'procedure') <> 'object'
      or coalesce(task #>> '{procedure,id}', '') = ''
      or coalesce(task #>> '{procedure,version}', '') = ''
      or coalesce(task ->> 'resultContract', '') = ''
  ) or exists (
    select 1 from jsonb_array_elements(p_dispatch_candidate -> 'parallelBatches') batch
    where jsonb_typeof(batch) <> 'array' or jsonb_array_length(batch) = 0
  ) then
    raise exception 'universal_dispatch_candidate_shape_invalid' using errcode = '22023';
  end if;

  select coalesce(array_agg(task ->> 'taskId' order by task ->> 'taskId'), '{}'::text[])
    into candidate_task_ids
  from jsonb_array_elements(p_dispatch_candidate -> 'tasks') task;
  select coalesce(array_agg(task.value order by task.value), '{}'::text[])
    into batched_task_ids
  from jsonb_array_elements(p_dispatch_candidate -> 'parallelBatches') batch,
    lateral jsonb_array_elements_text(batch) task(value);
  select coalesce(array_agg(task.value order by task.value), '{}'::text[])
    into selection_task_ids
  from jsonb_array_elements_text(p_workflow_selection -> 'taskIds') task(value);
  candidate_state := p_dispatch_candidate ->> 'status' = 'candidate';

  if cardinality(candidate_task_ids) <> (select count(distinct task.value) from unnest(candidate_task_ids) task(value))
    or cardinality(batched_task_ids) <> (select count(distinct task.value) from unnest(batched_task_ids) task(value))
    or candidate_task_ids is distinct from batched_task_ids
    or candidate_state <> (cardinality(candidate_task_ids) > 0)
    or candidate_state <> (jsonb_array_length(p_dispatch_candidate -> 'parallelBatches') > 0)
    or candidate_state = (jsonb_array_length(p_dispatch_candidate -> 'reasons') > 0)
    or p_dispatch_candidate ->> 'objectiveStructuralIdentity' <> p_objective_plan ->> 'structuralIdentity'
    or p_dispatch_candidate ->> 'readinessFingerprint' <> p_preflight_decision ->> 'readinessFingerprint'
    or p_dispatch_candidate ->> 'specializationFingerprint' <> p_specialization ->> 'fingerprint'
    or p_dispatch_candidate ->> 'methodBindingFingerprint' <> p_method_binding ->> 'fingerprint'
    or p_dispatch_candidate ->> 'workflowSelectionFingerprint' <> p_workflow_selection ->> 'fingerprint'
    or (candidate_state and p_preflight_decision ->> 'status' <> 'ready')
    or (candidate_state and not (p_preflight_decision ->> 'terminalReachable')::boolean)
    or (candidate_state and p_workflow_selection ->> 'status' <> 'selected')
    or (candidate_state and candidate_task_ids is distinct from selection_task_ids)
    or (candidate_state and p_dispatch_candidate -> 'parallelBatches' is distinct from p_workflow_selection -> 'parallelBatches') then
    raise exception 'universal_dispatch_candidate_composition_invalid' using errcode = '22023';
  end if;

  if candidate_state and exists (
    select 1
    from jsonb_array_elements(p_dispatch_candidate -> 'tasks') candidate
    where not exists (
      select 1 from jsonb_array_elements(p_preflight_decision -> 'tasks') ready
      where ready ->> 'taskId' = candidate ->> 'taskId'
        and (ready ->> 'executable')::boolean
        and ready ->> 'executorKey' = candidate ->> 'executorKey'
    ) or not exists (
      select 1 from jsonb_array_elements(p_method_binding -> 'bindings') binding
      where binding ->> 'taskId' = candidate ->> 'taskId'
        and binding #>> '{procedure,id}' = candidate #>> '{procedure,id}'
        and binding #>> '{procedure,version}' = candidate #>> '{procedure,version}'
        and binding ->> 'resultContract' = candidate ->> 'resultContract'
        and concat(binding #>> '{executor,module}', '#', binding #>> '{executor,exportName}') = candidate ->> 'executorKey'
    )
  ) then
    raise exception 'universal_dispatch_candidate_identity_invalid' using errcode = '22023';
  end if;

  preflight_result := private.worker_record_objective_plan_preflight_v4(
    p_job_id, p_capability_token, p_objective_plan, p_preflight_decision,
    p_specialization, p_method_binding, p_workflow_selection
  );
  select preflight.* into preflight_row
  from public.capital_project_objective_preflights preflight
  where preflight.organization_id = job_row.organization_id
    and preflight.id = (preflight_result ->> 'id')::uuid;
  select binding.* into binding_row
  from public.capital_project_objective_method_bindings binding
  where binding.organization_id = job_row.organization_id
    and binding.id = (preflight_result ->> 'method_binding_id')::uuid;
  select selection.* into selection_row
  from public.capital_project_objective_workflow_selections selection
  where selection.organization_id = job_row.organization_id
    and selection.id = (preflight_result ->> 'workflow_selection_id')::uuid;
  if preflight_row.id is null or binding_row.id is null or selection_row.id is null then
    raise exception 'universal_dispatch_candidate_parent_not_found' using errcode = 'P0002';
  end if;

  select candidate.* into existing_row
  from public.capital_project_objective_dispatch_candidates candidate
  where candidate.organization_id = job_row.organization_id
    and candidate.objective_preflight_id = preflight_row.id
    and candidate.candidate_fingerprint = p_dispatch_candidate ->> 'fingerprint';
  if found then
    return preflight_result || jsonb_build_object(
      'dispatch_candidate_id', existing_row.id,
      'dispatch_candidate_fingerprint', existing_row.candidate_fingerprint,
      'dispatch_candidate_status', existing_row.candidate_status,
      'dispatch_candidate_replayed', true
    );
  end if;

  insert into public.capital_project_objective_dispatch_candidates (
    organization_id, capital_project_id, objective_preflight_id,
    objective_method_binding_id, objective_workflow_selection_id,
    source_message_id, processing_job_id, schema_version, mode, candidate_status,
    candidate_fingerprint, readiness_fingerprint, capability_manifest_hash,
    execution_context_hash, executor_registry_hash, task_ids, parallel_batches, reasons, will_execute,
    external_effect_allowed, dispatch_candidate, created_by
  ) values (
    job_row.organization_id, preflight_row.capital_project_id, preflight_row.id,
    binding_row.id, selection_row.id, preflight_row.source_message_id, job_row.id,
    p_dispatch_candidate ->> 'schemaVersion', p_dispatch_candidate ->> 'mode',
    p_dispatch_candidate ->> 'status', p_dispatch_candidate ->> 'fingerprint',
    p_dispatch_candidate ->> 'readinessFingerprint', p_dispatch_candidate ->> 'capabilityManifestHash',
    p_dispatch_candidate ->> 'executionContextHash', p_dispatch_candidate ->> 'executorRegistryHash', candidate_task_ids,
    p_dispatch_candidate -> 'parallelBatches', p_dispatch_candidate -> 'reasons',
    false, false, p_dispatch_candidate, preflight_row.created_by
  )
  on conflict (organization_id, objective_preflight_id, candidate_fingerprint) do nothing
  returning * into inserted_row;

  if inserted_row.id is null then
    select candidate.* into inserted_row
    from public.capital_project_objective_dispatch_candidates candidate
    where candidate.organization_id = job_row.organization_id
      and candidate.objective_preflight_id = preflight_row.id
      and candidate.candidate_fingerprint = p_dispatch_candidate ->> 'fingerprint';
  end if;

  return preflight_result || jsonb_build_object(
    'dispatch_candidate_id', inserted_row.id,
    'dispatch_candidate_fingerprint', inserted_row.candidate_fingerprint,
    'dispatch_candidate_status', inserted_row.candidate_status,
    'dispatch_candidate_replayed', false
  );
end;
$$;

create or replace function public.worker_record_objective_plan_preflight_v5(
  p_job_id uuid,
  p_capability_token text,
  p_objective_plan jsonb,
  p_preflight_decision jsonb,
  p_specialization jsonb,
  p_method_binding jsonb,
  p_workflow_selection jsonb,
  p_dispatch_candidate jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_objective_plan_preflight_v5(
    p_job_id, p_capability_token, p_objective_plan, p_preflight_decision,
    p_specialization, p_method_binding, p_workflow_selection, p_dispatch_candidate
  );
$$;

revoke all on function private.worker_record_objective_plan_preflight_v5(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.worker_record_objective_plan_preflight_v5(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function private.worker_record_objective_plan_preflight_v5(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;
grant execute on function public.worker_record_objective_plan_preflight_v5(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

comment on table public.capital_project_objective_dispatch_candidates is
  'Immutable internal-shadow decision proving whether one persisted objective slice has exact method, capability and bundled executor identities; never an execution authorization.';
comment on function public.worker_record_objective_plan_preflight_v5(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Capability-bound command that atomically records the objective preflight chain and its fail-closed, non-executing universal dispatch candidate.';
