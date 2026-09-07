-- Persist the exact economic workflow recipe selection compiled for an objective. The selection
-- remains shadow-only: it records the graph the system would use but does not authorize dispatch.

create table public.capital_project_objective_workflow_selections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  objective_preflight_id uuid not null,
  objective_specialization_id uuid not null,
  source_message_id uuid not null,
  processing_job_id uuid not null,
  schema_version text not null check (schema_version = 'workflow-recipe-selection.v1'),
  selection_fingerprint text not null check (selection_fingerprint ~ '^[0-9a-f]{64}$'),
  selection_status text not null check (selection_status in ('selected', 'blocked')),
  selection_reason text not null check (selection_reason in (
    'selected', 'economic_situation_not_implemented',
    'combined_economic_situations_not_implemented', 'requested_output_not_implemented'
  )),
  recipe_id text,
  recipe_version text,
  recipe_fingerprint text check (recipe_fingerprint is null or recipe_fingerprint ~ '^[0-9a-f]{64}$'),
  slice_fingerprint text check (slice_fingerprint is null or slice_fingerprint ~ '^[0-9a-f]{64}$'),
  outcome text,
  task_ids text[] not null default '{}',
  parallel_batches jsonb not null check (jsonb_typeof(parallel_batches) = 'array'),
  activated_economic_pack_ids text[] not null default '{}',
  workflow_selection jsonb not null check (jsonb_typeof(workflow_selection) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, objective_preflight_id, selection_fingerprint),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, objective_preflight_id)
    references public.capital_project_objective_preflights(organization_id, id) on delete cascade,
  foreign key (organization_id, objective_specialization_id)
    references public.capital_project_objective_specializations(organization_id, id) on delete cascade,
  foreign key (organization_id, source_message_id)
    references public.agent_messages(organization_id, id) on delete restrict,
  foreign key (organization_id, processing_job_id)
    references public.processing_jobs(organization_id, id) on delete restrict,
  check (cardinality(task_ids) <= 80),
  check (cardinality(activated_economic_pack_ids) <= 20),
  check ((selection_status = 'selected') = (recipe_id is not null)),
  check ((selection_status = 'selected') = (recipe_version is not null)),
  check ((selection_status = 'selected') = (recipe_fingerprint is not null)),
  check ((selection_status = 'selected') = (slice_fingerprint is not null)),
  check ((selection_status = 'selected') = (outcome is not null)),
  check ((selection_status = 'selected') = (cardinality(task_ids) > 0))
);

create index capital_project_objective_workflow_selections_project_idx
  on public.capital_project_objective_workflow_selections (
    organization_id, capital_project_id, created_at desc
  );
create index capital_project_objective_workflow_selections_job_idx
  on public.capital_project_objective_workflow_selections (organization_id, processing_job_id);
create index capital_project_objective_workflow_selections_recipe_idx
  on public.capital_project_objective_workflow_selections (
    organization_id, recipe_id, recipe_version, created_at desc
  ) where selection_status = 'selected';

alter table public.capital_project_objective_workflow_selections enable row level security;
alter table public.capital_project_objective_workflow_selections force row level security;

create policy capital_project_objective_workflow_selections_select
  on public.capital_project_objective_workflow_selections for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));

revoke all privileges on public.capital_project_objective_workflow_selections
  from public, anon, authenticated;
grant select on public.capital_project_objective_workflow_selections to authenticated;

create trigger capital_project_objective_workflow_selections_audit
  after insert on public.capital_project_objective_workflow_selections
  for each row execute function private.capture_audit_event();

create or replace function private.worker_record_objective_plan_preflight_v4(
  p_job_id uuid,
  p_capability_token text,
  p_objective_plan jsonb,
  p_preflight_decision jsonb,
  p_specialization jsonb,
  p_method_binding jsonb,
  p_workflow_selection jsonb
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
  specialization_row public.capital_project_objective_specializations;
  existing_row public.capital_project_objective_workflow_selections;
  inserted_row public.capital_project_objective_workflow_selections;
  selected_task_ids text[];
  batched_task_ids text[];
  selected_economic_pack_ids text[];
  specialization_economic_pack_ids text[];
  selected_state boolean;
begin
  if job_row.kind <> 'agent_operation_brief'
    or jsonb_typeof(p_workflow_selection) <> 'object'
    or p_workflow_selection ->> 'schemaVersion' <> 'workflow-recipe-selection.v1'
    or p_workflow_selection ->> 'status' not in ('selected', 'blocked')
    or p_workflow_selection ->> 'reason' not in (
      'selected', 'economic_situation_not_implemented',
      'combined_economic_situations_not_implemented', 'requested_output_not_implemented'
    )
    or coalesce(p_workflow_selection ->> 'fingerprint', '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_workflow_selection -> 'taskIds') <> 'array'
    or jsonb_array_length(p_workflow_selection -> 'taskIds') > 80
    or jsonb_typeof(p_workflow_selection -> 'parallelBatches') <> 'array'
    or jsonb_array_length(p_workflow_selection -> 'parallelBatches') > 80
    or jsonb_typeof(p_workflow_selection -> 'activatedEconomicPacks') <> 'array'
    or jsonb_array_length(p_workflow_selection -> 'activatedEconomicPacks') > 20
    or octet_length(p_workflow_selection::text) > 1048576 then
    raise exception 'workflow_recipe_selection_contract_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_workflow_selection -> 'parallelBatches') batch
    where jsonb_typeof(batch) <> 'array' or jsonb_array_length(batch) = 0
  ) or exists (
    select 1 from jsonb_array_elements_text(p_workflow_selection -> 'taskIds') task(value)
    where task.value !~ '^[A-Z][0-9]{2}$'
  ) or exists (
    select 1 from jsonb_array_elements(p_workflow_selection -> 'parallelBatches') batch,
      lateral jsonb_array_elements_text(batch) task(value)
    where task.value !~ '^[A-Z][0-9]{2}$'
  ) then
    raise exception 'workflow_recipe_selection_graph_invalid' using errcode = '22023';
  end if;

  select coalesce(array_agg(task.value order by task.value), '{}'::text[])
    into selected_task_ids
  from jsonb_array_elements_text(p_workflow_selection -> 'taskIds') task(value);
  select coalesce(array_agg(task.value order by task.value), '{}'::text[])
    into batched_task_ids
  from jsonb_array_elements(p_workflow_selection -> 'parallelBatches') batch,
    lateral jsonb_array_elements_text(batch) task(value);
  select coalesce(array_agg(pack.value order by pack.value), '{}'::text[])
    into selected_economic_pack_ids
  from jsonb_array_elements_text(p_workflow_selection -> 'activatedEconomicPacks') pack(value);
  select coalesce(array_agg(pack.value order by pack.value), '{}'::text[])
    into specialization_economic_pack_ids
  from jsonb_array_elements_text(p_specialization -> 'selectedPackIds') pack(value)
  where pack.value like 'objective.%';
  selected_state := p_workflow_selection ->> 'status' = 'selected';

  if cardinality(selected_task_ids) <> (select count(distinct task.value) from unnest(selected_task_ids) task(value))
    or cardinality(batched_task_ids) <> (select count(distinct task.value) from unnest(batched_task_ids) task(value))
    or selected_task_ids is distinct from batched_task_ids
    or cardinality(selected_economic_pack_ids) <> (select count(distinct pack.value) from unnest(selected_economic_pack_ids) pack(value))
    or selected_economic_pack_ids is distinct from specialization_economic_pack_ids
    or selected_state <> (p_workflow_selection ->> 'reason' = 'selected')
    or selected_state <> (cardinality(selected_task_ids) > 0)
    or selected_state <> (jsonb_array_length(p_workflow_selection -> 'parallelBatches') > 0)
    or selected_state <> (p_workflow_selection ->> 'recipeId' is not null)
    or selected_state <> (p_workflow_selection ->> 'recipeVersion' is not null)
    or selected_state <> (p_workflow_selection ->> 'recipeFingerprint' is not null)
    or selected_state <> (p_workflow_selection ->> 'sliceFingerprint' is not null)
    or selected_state <> (p_workflow_selection ->> 'outcome' is not null)
    or (selected_state and coalesce(p_workflow_selection ->> 'recipeId', '') !~ '^[a-z][a-z0-9-]{2,79}$')
    or (selected_state and coalesce(p_workflow_selection ->> 'recipeVersion', '') !~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-v[0-9]+$')
    or (selected_state and coalesce(p_workflow_selection ->> 'recipeFingerprint', '') !~ '^[0-9a-f]{64}$')
    or (selected_state and coalesce(p_workflow_selection ->> 'sliceFingerprint', '') !~ '^[0-9a-f]{64}$')
    or (selected_state and p_workflow_selection ->> 'outcome' not in (
      'diagnostic', 'scenario_analysis', 'alternatives', 'meeting_plan', 'material'
    )) then
    raise exception 'workflow_recipe_selection_composition_invalid' using errcode = '22023';
  end if;

  preflight_result := private.worker_record_objective_plan_preflight_v3(
    p_job_id, p_capability_token, p_objective_plan, p_preflight_decision,
    p_specialization, p_method_binding
  );
  select preflight.* into preflight_row
  from public.capital_project_objective_preflights preflight
  where preflight.organization_id = job_row.organization_id
    and preflight.id = (preflight_result ->> 'id')::uuid;
  if not found then raise exception 'objective_preflight_not_found_after_record' using errcode = 'P0002'; end if;
  select specialization.* into specialization_row
  from public.capital_project_objective_specializations specialization
  where specialization.organization_id = job_row.organization_id
    and specialization.id = (preflight_result ->> 'specialization_id')::uuid;
  if not found then raise exception 'objective_specialization_not_found_after_record' using errcode = 'P0002'; end if;

  select selection.* into existing_row
  from public.capital_project_objective_workflow_selections selection
  where selection.organization_id = job_row.organization_id
    and selection.objective_preflight_id = preflight_row.id
    and selection.selection_fingerprint = p_workflow_selection ->> 'fingerprint';
  if found then
    return preflight_result || jsonb_build_object(
      'workflow_selection_id', existing_row.id,
      'workflow_selection_fingerprint', existing_row.selection_fingerprint,
      'workflow_selection_status', existing_row.selection_status,
      'workflow_selection_reason', existing_row.selection_reason,
      'workflow_selection_replayed', true
    );
  end if;

  insert into public.capital_project_objective_workflow_selections (
    organization_id, capital_project_id, objective_preflight_id, objective_specialization_id,
    source_message_id, processing_job_id, schema_version, selection_fingerprint,
    selection_status, selection_reason, recipe_id, recipe_version, recipe_fingerprint,
    slice_fingerprint, outcome, task_ids, parallel_batches, activated_economic_pack_ids,
    workflow_selection, created_by
  ) values (
    job_row.organization_id, preflight_row.capital_project_id, preflight_row.id,
    specialization_row.id, preflight_row.source_message_id, job_row.id,
    p_workflow_selection ->> 'schemaVersion', p_workflow_selection ->> 'fingerprint',
    p_workflow_selection ->> 'status', p_workflow_selection ->> 'reason',
    p_workflow_selection ->> 'recipeId', p_workflow_selection ->> 'recipeVersion',
    p_workflow_selection ->> 'recipeFingerprint', p_workflow_selection ->> 'sliceFingerprint',
    p_workflow_selection ->> 'outcome', selected_task_ids,
    p_workflow_selection -> 'parallelBatches', selected_economic_pack_ids,
    p_workflow_selection, preflight_row.created_by
  )
  on conflict (organization_id, objective_preflight_id, selection_fingerprint) do nothing
  returning * into inserted_row;

  if inserted_row.id is null then
    select selection.* into inserted_row
    from public.capital_project_objective_workflow_selections selection
    where selection.organization_id = job_row.organization_id
      and selection.objective_preflight_id = preflight_row.id
      and selection.selection_fingerprint = p_workflow_selection ->> 'fingerprint';
  end if;

  return preflight_result || jsonb_build_object(
    'workflow_selection_id', inserted_row.id,
    'workflow_selection_fingerprint', inserted_row.selection_fingerprint,
    'workflow_selection_status', inserted_row.selection_status,
    'workflow_selection_reason', inserted_row.selection_reason,
    'workflow_selection_replayed', false
  );
end;
$$;

create or replace function public.worker_record_objective_plan_preflight_v4(
  p_job_id uuid,
  p_capability_token text,
  p_objective_plan jsonb,
  p_preflight_decision jsonb,
  p_specialization jsonb,
  p_method_binding jsonb,
  p_workflow_selection jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_objective_plan_preflight_v4(
    p_job_id, p_capability_token, p_objective_plan, p_preflight_decision,
    p_specialization, p_method_binding, p_workflow_selection
  );
$$;

revoke all on function private.worker_record_objective_plan_preflight_v4(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.worker_record_objective_plan_preflight_v4(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function private.worker_record_objective_plan_preflight_v4(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;
grant execute on function public.worker_record_objective_plan_preflight_v4(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

comment on table public.capital_project_objective_workflow_selections is
  'Immutable shadow selection of one versioned economic workflow recipe and dependency-closed outcome slice.';
comment on function public.worker_record_objective_plan_preflight_v4(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Capability-bound worker command that atomically records objective plan, specialization, method binding and fail-closed workflow selection.';
