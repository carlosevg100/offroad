-- Persist the exact specialist method bindings compiled for an objective. This remains a
-- shadow observation: a method binding proves what would run, but only a separately accredited
-- live TaskExecutionCapability can authorize execution.

create table public.capital_project_objective_method_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  objective_preflight_id uuid not null,
  objective_specialization_id uuid not null,
  source_message_id uuid not null,
  processing_job_id uuid not null,
  schema_version text not null check (schema_version = 'objective-method-binding.v1'),
  binding_fingerprint text not null check (binding_fingerprint ~ '^[0-9a-f]{64}$'),
  method_registry_hash text not null check (method_registry_hash ~ '^[0-9a-f]{64}$'),
  binding_status text not null check (binding_status in ('bound', 'partial', 'blocked', 'conflicted')),
  selected_pack_ids text[] not null,
  base_target_task_ids text[] not null default '{}',
  specialist_task_ids text[] not null default '{}',
  effective_target_task_ids text[] not null default '{}',
  bound_task_ids text[] not null default '{}',
  unbound_task_ids text[] not null default '{}',
  method_binding jsonb not null check (jsonb_typeof(method_binding) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, objective_preflight_id, binding_fingerprint),
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
  check (cardinality(selected_pack_ids) between 1 and 50),
  check ('core.institutional-dcm' = any(selected_pack_ids)),
  check (cardinality(base_target_task_ids) <= 100),
  check (cardinality(specialist_task_ids) <= 100),
  check (cardinality(effective_target_task_ids) <= 100),
  check (cardinality(bound_task_ids) <= 100),
  check (cardinality(unbound_task_ids) <= 100)
);

create index capital_project_objective_method_bindings_project_idx
  on public.capital_project_objective_method_bindings (
    organization_id, capital_project_id, created_at desc
  );
create index capital_project_objective_method_bindings_job_idx
  on public.capital_project_objective_method_bindings (organization_id, processing_job_id);
create index capital_project_objective_method_bindings_tasks_idx
  on public.capital_project_objective_method_bindings using gin (specialist_task_ids);

alter table public.capital_project_objective_method_bindings enable row level security;
alter table public.capital_project_objective_method_bindings force row level security;

create policy capital_project_objective_method_bindings_select
  on public.capital_project_objective_method_bindings for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));

revoke all privileges on public.capital_project_objective_method_bindings
  from public, anon, authenticated;
grant select on public.capital_project_objective_method_bindings to authenticated;

create trigger capital_project_objective_method_bindings_audit
  after insert on public.capital_project_objective_method_bindings
  for each row execute function private.capture_audit_event();

create or replace function private.worker_record_objective_plan_preflight_v3(
  p_job_id uuid,
  p_capability_token text,
  p_objective_plan jsonb,
  p_preflight_decision jsonb,
  p_specialization jsonb,
  p_method_binding jsonb
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
  inserted_row public.capital_project_objective_method_bindings;
  existing_row public.capital_project_objective_method_bindings;
  selected_pack_ids text[];
  specialization_pack_ids text[];
  base_target_ids text[];
  specialist_task_ids text[];
  effective_target_ids text[];
  expected_effective_ids text[];
  plan_target_ids text[];
  plan_task_ids text[];
  bound_task_ids text[];
  unbound_task_ids text[];
  partition_task_ids text[];
  conflict_count integer;
  computed_status text;
begin
  if job_row.kind <> 'agent_operation_brief'
    or jsonb_typeof(p_method_binding) <> 'object'
    or p_method_binding ->> 'schemaVersion' <> 'objective-method-binding.v1'
    or coalesce(p_method_binding ->> 'specializationFingerprint', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_method_binding ->> 'methodRegistryHash', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_method_binding ->> 'fingerprint', '') !~ '^[0-9a-f]{64}$'
    or p_method_binding ->> 'status' not in ('bound', 'partial', 'blocked', 'conflicted')
    or jsonb_typeof(p_method_binding -> 'selectedPackIds') <> 'array'
    or jsonb_typeof(p_method_binding -> 'baseTargetTaskIds') <> 'array'
    or jsonb_typeof(p_method_binding -> 'specialistTaskIds') <> 'array'
    or jsonb_typeof(p_method_binding -> 'effectiveTargetTaskIds') <> 'array'
    or jsonb_typeof(p_method_binding -> 'bindings') <> 'array'
    or jsonb_typeof(p_method_binding -> 'unboundTaskIds') <> 'array'
    or jsonb_typeof(p_method_binding -> 'conflicts') <> 'array'
    or jsonb_array_length(p_method_binding -> 'selectedPackIds') not between 1 and 50
    or jsonb_array_length(p_method_binding -> 'baseTargetTaskIds') > 100
    or jsonb_array_length(p_method_binding -> 'specialistTaskIds') > 100
    or jsonb_array_length(p_method_binding -> 'effectiveTargetTaskIds') > 100
    or jsonb_array_length(p_method_binding -> 'bindings') > 100
    or jsonb_array_length(p_method_binding -> 'unboundTaskIds') > 100
    or jsonb_array_length(p_method_binding -> 'conflicts') > 100
    or octet_length(p_method_binding::text) > 2097152 then
    raise exception 'objective_method_binding_contract_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_method_binding -> 'bindings') binding
    where jsonb_typeof(binding) <> 'object'
      or coalesce(binding ->> 'taskId', '') !~ '^[A-Z][0-9]{2}$'
      or jsonb_typeof(binding -> 'procedure') <> 'object'
      or coalesce(binding #>> '{procedure,id}', '') = ''
      or coalesce(binding #>> '{procedure,version}', '') = ''
      or binding ->> 'maturity' not in ('draft','candidate','implemented','ai_reviewed','tested','ready_for_founder','production')
      or jsonb_typeof(binding -> 'requiredPackIds') <> 'array'
      or jsonb_array_length(binding -> 'requiredPackIds') < 1
      or jsonb_typeof(binding -> 'bindingPriority') <> 'number'
      or (binding ->> 'bindingPriority')::integer not between 0 and 1000
      or jsonb_typeof(binding -> 'executor') <> 'object'
      or coalesce(binding #>> '{executor,module}', '') = ''
      or coalesce(binding #>> '{executor,exportName}', '') = ''
      or coalesce(binding ->> 'resultContract', '') = ''
      or coalesce(binding ->> 'sourcePath', '') = ''
      or coalesce(binding ->> 'sourceHash', '') !~ '^[0-9a-f]{64}$'
  ) or exists (
    select 1 from jsonb_array_elements(p_method_binding -> 'conflicts') conflict
    where jsonb_typeof(conflict) <> 'object'
      or coalesce(conflict ->> 'taskId', '') !~ '^[A-Z][0-9]{2}$'
      or jsonb_typeof(conflict -> 'candidates') <> 'array'
      or jsonb_array_length(conflict -> 'candidates') < 2
  ) then
    raise exception 'objective_method_binding_entry_invalid' using errcode = '22023';
  end if;

  select coalesce(array_agg(value order by value), '{}'::text[])
    into selected_pack_ids from jsonb_array_elements_text(p_method_binding -> 'selectedPackIds') item(value);
  select coalesce(array_agg(value order by value), '{}'::text[])
    into specialization_pack_ids from jsonb_array_elements_text(p_specialization -> 'selectedPackIds') item(value);
  select coalesce(array_agg(value order by value), '{}'::text[])
    into base_target_ids from jsonb_array_elements_text(p_method_binding -> 'baseTargetTaskIds') item(value);
  select coalesce(array_agg(value order by value), '{}'::text[])
    into specialist_task_ids from jsonb_array_elements_text(p_method_binding -> 'specialistTaskIds') item(value);
  select coalesce(array_agg(value order by value), '{}'::text[])
    into effective_target_ids from jsonb_array_elements_text(p_method_binding -> 'effectiveTargetTaskIds') item(value);
  select coalesce(array_agg(value order by value), '{}'::text[])
    into plan_target_ids from jsonb_array_elements_text(p_objective_plan -> 'targetTaskIds') item(value);
  select coalesce(array_agg(task ->> 'id' order by task ->> 'id'), '{}'::text[])
    into plan_task_ids from jsonb_array_elements(p_objective_plan #> '{taskGraph,tasks}') task;
  select coalesce(array_agg(binding ->> 'taskId' order by binding ->> 'taskId'), '{}'::text[])
    into bound_task_ids from jsonb_array_elements(p_method_binding -> 'bindings') binding;
  select coalesce(array_agg(value order by value), '{}'::text[])
    into unbound_task_ids from jsonb_array_elements_text(p_method_binding -> 'unboundTaskIds') item(value);
  select coalesce(array_agg(value order by value), '{}'::text[])
    into expected_effective_ids from (
      select distinct value from unnest(base_target_ids || specialist_task_ids) item(value)
    ) expected;
  select coalesce(array_agg(value order by value), '{}'::text[])
    into partition_task_ids from unnest(bound_task_ids || unbound_task_ids) item(value);
  conflict_count := jsonb_array_length(p_method_binding -> 'conflicts');
  computed_status := case
    when conflict_count > 0 then 'conflicted'
    when cardinality(bound_task_ids) = 0 then 'blocked'
    when cardinality(unbound_task_ids) = 0 then 'bound'
    else 'partial'
  end;

  if cardinality(selected_pack_ids) <> (select count(distinct value) from unnest(selected_pack_ids) item(value))
    or selected_pack_ids is distinct from specialization_pack_ids
    or p_method_binding ->> 'specializationFingerprint' <> p_specialization ->> 'fingerprint'
    or cardinality(base_target_ids) <> (select count(distinct value) from unnest(base_target_ids) item(value))
    or cardinality(specialist_task_ids) <> (select count(distinct value) from unnest(specialist_task_ids) item(value))
    or cardinality(effective_target_ids) <> (select count(distinct value) from unnest(effective_target_ids) item(value))
    or effective_target_ids is distinct from expected_effective_ids
    or effective_target_ids is distinct from plan_target_ids
    or cardinality(bound_task_ids) <> (select count(distinct value) from unnest(bound_task_ids) item(value))
    or cardinality(unbound_task_ids) <> (select count(distinct value) from unnest(unbound_task_ids) item(value))
    or cardinality(partition_task_ids) <> (select count(distinct value) from unnest(partition_task_ids) item(value))
    or partition_task_ids is distinct from plan_task_ids
    or p_method_binding ->> 'status' <> computed_status
    or exists (
      select 1 from jsonb_array_elements(p_method_binding -> 'conflicts') conflict
      where conflict ->> 'taskId' <> all(unbound_task_ids)
    )
    or exists (
      select 1 from jsonb_array_elements(p_method_binding -> 'bindings') binding,
        jsonb_array_elements_text(binding -> 'requiredPackIds') required_pack(value)
      where not (required_pack.value = any(selected_pack_ids))
    ) then
    raise exception 'objective_method_binding_composition_invalid' using errcode = '22023';
  end if;

  preflight_result := private.worker_record_objective_plan_preflight_v2(
    p_job_id, p_capability_token, p_objective_plan, p_preflight_decision, p_specialization
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

  select binding.* into existing_row
  from public.capital_project_objective_method_bindings binding
  where binding.organization_id = job_row.organization_id
    and binding.objective_preflight_id = preflight_row.id
    and binding.binding_fingerprint = p_method_binding ->> 'fingerprint';
  if found then
    return preflight_result || jsonb_build_object(
      'method_binding_id', existing_row.id,
      'method_binding_fingerprint', existing_row.binding_fingerprint,
      'method_binding_status', existing_row.binding_status,
      'bound_task_ids', to_jsonb(existing_row.bound_task_ids),
      'specialist_task_ids', to_jsonb(existing_row.specialist_task_ids),
      'method_binding_replayed', true
    );
  end if;

  insert into public.capital_project_objective_method_bindings (
    organization_id, capital_project_id, objective_preflight_id, objective_specialization_id,
    source_message_id, processing_job_id, schema_version, binding_fingerprint,
    method_registry_hash, binding_status, selected_pack_ids, base_target_task_ids,
    specialist_task_ids, effective_target_task_ids, bound_task_ids, unbound_task_ids,
    method_binding, created_by
  ) values (
    job_row.organization_id, preflight_row.capital_project_id, preflight_row.id,
    specialization_row.id, preflight_row.source_message_id, job_row.id,
    p_method_binding ->> 'schemaVersion', p_method_binding ->> 'fingerprint',
    p_method_binding ->> 'methodRegistryHash', p_method_binding ->> 'status',
    selected_pack_ids, base_target_ids, specialist_task_ids, effective_target_ids,
    bound_task_ids, unbound_task_ids, p_method_binding, preflight_row.created_by
  )
  on conflict (organization_id, objective_preflight_id, binding_fingerprint) do nothing
  returning * into inserted_row;

  if inserted_row.id is null then
    select binding.* into inserted_row
    from public.capital_project_objective_method_bindings binding
    where binding.organization_id = job_row.organization_id
      and binding.objective_preflight_id = preflight_row.id
      and binding.binding_fingerprint = p_method_binding ->> 'fingerprint';
  end if;

  return preflight_result || jsonb_build_object(
    'method_binding_id', inserted_row.id,
    'method_binding_fingerprint', inserted_row.binding_fingerprint,
    'method_binding_status', inserted_row.binding_status,
    'bound_task_ids', to_jsonb(inserted_row.bound_task_ids),
    'specialist_task_ids', to_jsonb(inserted_row.specialist_task_ids),
    'method_binding_replayed', false
  );
end;
$$;

create or replace function public.worker_record_objective_plan_preflight_v3(
  p_job_id uuid,
  p_capability_token text,
  p_objective_plan jsonb,
  p_preflight_decision jsonb,
  p_specialization jsonb,
  p_method_binding jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_objective_plan_preflight_v3(
    p_job_id, p_capability_token, p_objective_plan, p_preflight_decision,
    p_specialization, p_method_binding
  );
$$;

revoke all on function private.worker_record_objective_plan_preflight_v3(
  uuid, text, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.worker_record_objective_plan_preflight_v3(
  uuid, text, jsonb, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function private.worker_record_objective_plan_preflight_v3(
  uuid, text, jsonb, jsonb, jsonb, jsonb
) to authenticated;
grant execute on function public.worker_record_objective_plan_preflight_v3(
  uuid, text, jsonb, jsonb, jsonb, jsonb
) to authenticated;

comment on table public.capital_project_objective_method_bindings is
  'Immutable shadow binding of objective-specialist tasks to exact method, executor and result-contract versions.';
comment on function public.worker_record_objective_plan_preflight_v3(
  uuid, text, jsonb, jsonb, jsonb, jsonb
) is
  'Capability-bound worker command that records objective plan, specialization and non-authorizing exact method bindings atomically.';
