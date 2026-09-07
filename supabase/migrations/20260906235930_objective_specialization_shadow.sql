-- Persist the exact composable DCM specialization selected for an objective preflight. The
-- composition remains shadow-only: it records required coverage, procedures and maturity, but
-- neither the model nor this command gains authority to dispatch an unaccredited executor.

create table public.capital_project_objective_specializations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  objective_preflight_id uuid not null,
  source_message_id uuid not null,
  processing_job_id uuid not null,
  schema_version text not null check (schema_version = 'objective-specialization.v1'),
  activation_ruleset_version text not null
    check (activation_ruleset_version = 'dcm-specialization-activation.2026-09-06-v1'),
  specialization_fingerprint text not null check (specialization_fingerprint ~ '^[0-9a-f]{64}$'),
  profile_fingerprint text not null check (profile_fingerprint ~ '^[0-9a-f]{64}$'),
  minimum_maturity text not null check (minimum_maturity in ('specified', 'implemented', 'tested', 'production')),
  activation_keys text[] not null default '{}',
  unmatched_activation_keys text[] not null default '{}',
  selected_pack_ids text[] not null,
  specialization jsonb not null check (jsonb_typeof(specialization) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, objective_preflight_id, specialization_fingerprint),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, objective_preflight_id)
    references public.capital_project_objective_preflights(organization_id, id) on delete cascade,
  foreign key (organization_id, source_message_id)
    references public.agent_messages(organization_id, id) on delete restrict,
  foreign key (organization_id, processing_job_id)
    references public.processing_jobs(organization_id, id) on delete restrict,
  check (cardinality(selected_pack_ids) between 1 and 50),
  check ('core.institutional-dcm' = any(selected_pack_ids)),
  check (cardinality(activation_keys) <= 100),
  check (cardinality(unmatched_activation_keys) <= 100)
);

create index capital_project_objective_specializations_project_idx
  on public.capital_project_objective_specializations (
    organization_id, capital_project_id, created_at desc
  );
create index capital_project_objective_specializations_job_idx
  on public.capital_project_objective_specializations (organization_id, processing_job_id);
create index capital_project_objective_specializations_packs_idx
  on public.capital_project_objective_specializations using gin (selected_pack_ids);

alter table public.capital_project_objective_specializations enable row level security;
alter table public.capital_project_objective_specializations force row level security;

create policy capital_project_objective_specializations_select
  on public.capital_project_objective_specializations for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));

revoke all privileges on public.capital_project_objective_specializations
  from public, anon, authenticated;
grant select on public.capital_project_objective_specializations to authenticated;

create trigger capital_project_objective_specializations_audit
  after insert on public.capital_project_objective_specializations
  for each row execute function private.capture_audit_event();

create or replace function private.worker_record_objective_plan_preflight_v2(
  p_job_id uuid,
  p_capability_token text,
  p_objective_plan jsonb,
  p_preflight_decision jsonb,
  p_specialization jsonb
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
  inserted_row public.capital_project_objective_specializations;
  existing_row public.capital_project_objective_specializations;
  activation_keys text[];
  unmatched_keys text[];
  selected_pack_ids text[];
  profile_pack_ids text[];
  plan_task_ids text[];
  coverage_task_ids text[];
  profile_requirement_keys text[];
  mapped_requirement_keys text[];
  unmapped_requirement_keys text[];
  partition_requirement_keys text[];
begin
  if job_row.kind <> 'agent_operation_brief'
    or jsonb_typeof(p_specialization) <> 'object'
    or p_specialization ->> 'schemaVersion' <> 'objective-specialization.v1'
    or p_specialization ->> 'activationRulesetVersion' <> 'dcm-specialization-activation.2026-09-06-v1'
    or coalesce(p_specialization ->> 'fingerprint', '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_specialization -> 'activations') <> 'array'
    or jsonb_typeof(p_specialization -> 'explicitPackIds') <> 'array'
    or jsonb_typeof(p_specialization -> 'selectedPackIds') <> 'array'
    or jsonb_typeof(p_specialization -> 'unmatchedActivationKeys') <> 'array'
    or jsonb_typeof(p_specialization -> 'profile') <> 'object'
    or p_specialization #>> '{profile,schemaVersion}' <> 'dcm-specialization-profile.v1'
    or coalesce(p_specialization #>> '{profile,fingerprint}', '') !~ '^[0-9a-f]{64}$'
    or p_specialization #>> '{profile,minimumMaturity}' not in ('specified', 'implemented', 'tested', 'production')
    or jsonb_typeof(p_specialization #> '{profile,packIds}') <> 'array'
    or jsonb_typeof(p_specialization #> '{profile,requirements}') <> 'array'
    or jsonb_typeof(p_specialization #> '{profile,procedureIds}') <> 'array'
    or jsonb_typeof(p_specialization #> '{profile,calculationIds}') <> 'array'
    or jsonb_typeof(p_specialization #> '{profile,qualityGateIds}') <> 'array'
    or jsonb_typeof(p_specialization #> '{coverageBinding,taskIds}') <> 'array'
    or jsonb_typeof(p_specialization #> '{coverageBinding,requirementKeysByTask}') <> 'object'
    or jsonb_typeof(p_specialization #> '{coverageBinding,unmappedRequirementKeys}') <> 'array'
    or jsonb_array_length(p_specialization -> 'activations') > 100
    or jsonb_array_length(p_specialization -> 'explicitPackIds') > 50
    or jsonb_array_length(p_specialization -> 'selectedPackIds') not between 1 and 50
    or jsonb_array_length(p_specialization -> 'unmatchedActivationKeys') > 100
    or jsonb_array_length(p_specialization #> '{profile,requirements}') > 1000
    or jsonb_array_length(p_specialization #> '{coverageBinding,taskIds}') > 80
    or jsonb_array_length(p_specialization #> '{coverageBinding,unmappedRequirementKeys}') > 1000
    or octet_length(p_specialization::text) > 2097152 then
    raise exception 'objective_specialization_contract_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_specialization -> 'activations') activation
    where jsonb_typeof(activation) <> 'object'
      or coalesce(activation ->> 'key', '') !~ '^[A-Za-z0-9:_-]{2,160}$'
      or jsonb_typeof(activation -> 'sources') <> 'array'
      or jsonb_array_length(activation -> 'sources') not between 1 and 2
      or exists (
        select 1 from jsonb_array_elements_text(activation -> 'sources') source(value)
        where value not in ('objective_text', 'semantic_envelope')
      )
  ) then
    raise exception 'objective_specialization_activation_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_specialization #> '{profile,requirements}') requirement
    where coalesce(requirement ->> 'key', '') !~ '^[a-z0-9_.-]{3,120}$'
  ) or exists (
    select 1
    from jsonb_each(p_specialization #> '{coverageBinding,requirementKeysByTask}') task_requirements
    where task_requirements.key !~ '^[A-Z][0-9]{2}$'
      or jsonb_typeof(task_requirements.value) <> 'array'
  ) then
    raise exception 'objective_specialization_coverage_invalid' using errcode = '22023';
  end if;

  select coalesce(array_agg(activation ->> 'key' order by activation ->> 'key'), '{}'::text[])
  into activation_keys
  from jsonb_array_elements(p_specialization -> 'activations') activation;
  select coalesce(array_agg(value order by value), '{}'::text[])
  into unmatched_keys
  from jsonb_array_elements_text(p_specialization -> 'unmatchedActivationKeys') item(value);
  select coalesce(array_agg(value order by value), '{}'::text[])
  into selected_pack_ids
  from jsonb_array_elements_text(p_specialization -> 'selectedPackIds') item(value);
  select coalesce(array_agg(value order by value), '{}'::text[])
  into profile_pack_ids
  from jsonb_array_elements_text(p_specialization #> '{profile,packIds}') item(value);
  select coalesce(array_agg(task ->> 'id' order by task ->> 'id'), '{}'::text[])
  into plan_task_ids
  from jsonb_array_elements(p_objective_plan #> '{taskGraph,tasks}') task;
  select coalesce(array_agg(value order by value), '{}'::text[])
  into coverage_task_ids
  from jsonb_array_elements_text(p_specialization #> '{coverageBinding,taskIds}') item(value);
  select coalesce(array_agg(requirement ->> 'key' order by requirement ->> 'key'), '{}'::text[])
  into profile_requirement_keys
  from jsonb_array_elements(p_specialization #> '{profile,requirements}') requirement;
  select coalesce(array_agg(requirement_key order by requirement_key), '{}'::text[])
  into mapped_requirement_keys
  from (
    select jsonb_array_elements_text(task_requirements.value) as requirement_key
    from jsonb_each(p_specialization #> '{coverageBinding,requirementKeysByTask}') task_requirements
  ) mapped;
  select coalesce(array_agg(value order by value), '{}'::text[])
  into unmapped_requirement_keys
  from jsonb_array_elements_text(p_specialization #> '{coverageBinding,unmappedRequirementKeys}') item(value);
  select coalesce(array_agg(value order by value), '{}'::text[])
  into partition_requirement_keys
  from unnest(mapped_requirement_keys || unmapped_requirement_keys) item(value);

  if cardinality(activation_keys) <> (select count(distinct value) from unnest(activation_keys) item(value))
    or cardinality(selected_pack_ids) <> (select count(distinct value) from unnest(selected_pack_ids) item(value))
    or cardinality(unmatched_keys) <> (select count(distinct value) from unnest(unmatched_keys) item(value))
    or selected_pack_ids is distinct from profile_pack_ids
    or not ('core.institutional-dcm' = any(selected_pack_ids))
    or exists (select 1 from unnest(unmatched_keys) item(value) where not (value = any(activation_keys)))
    or coverage_task_ids is distinct from plan_task_ids
    or cardinality(profile_requirement_keys) <> (select count(distinct value) from unnest(profile_requirement_keys) item(value))
    or cardinality(partition_requirement_keys) <> (select count(distinct value) from unnest(partition_requirement_keys) item(value))
    or partition_requirement_keys is distinct from profile_requirement_keys
    or exists (
      select 1
      from jsonb_each(p_specialization #> '{coverageBinding,requirementKeysByTask}') task_requirements
      where task_requirements.key <> all(coverage_task_ids)
    ) then
    raise exception 'objective_specialization_composition_invalid' using errcode = '22023';
  end if;

  preflight_result := private.worker_record_objective_plan_preflight_v1(
    p_job_id, p_capability_token, p_objective_plan, p_preflight_decision
  );
  select preflight.* into preflight_row
  from public.capital_project_objective_preflights preflight
  where preflight.organization_id = job_row.organization_id
    and preflight.id = (preflight_result ->> 'id')::uuid;
  if not found then
    raise exception 'objective_preflight_not_found_after_record' using errcode = 'P0002';
  end if;

  select specialization.* into existing_row
  from public.capital_project_objective_specializations specialization
  where specialization.organization_id = job_row.organization_id
    and specialization.objective_preflight_id = preflight_row.id
    and specialization.specialization_fingerprint = p_specialization ->> 'fingerprint';
  if found then
    return preflight_result || jsonb_build_object(
      'specialization_id', existing_row.id,
      'specialization_fingerprint', existing_row.specialization_fingerprint,
      'pack_ids', to_jsonb(existing_row.selected_pack_ids),
      'minimum_maturity', existing_row.minimum_maturity,
      'specialization_replayed', true
    );
  end if;

  insert into public.capital_project_objective_specializations (
    organization_id, capital_project_id, objective_preflight_id, source_message_id,
    processing_job_id, schema_version, activation_ruleset_version,
    specialization_fingerprint, profile_fingerprint, minimum_maturity,
    activation_keys, unmatched_activation_keys, selected_pack_ids, specialization, created_by
  ) values (
    job_row.organization_id, preflight_row.capital_project_id, preflight_row.id,
    preflight_row.source_message_id, job_row.id, p_specialization ->> 'schemaVersion',
    p_specialization ->> 'activationRulesetVersion', p_specialization ->> 'fingerprint',
    p_specialization #>> '{profile,fingerprint}', p_specialization #>> '{profile,minimumMaturity}',
    activation_keys, unmatched_keys, selected_pack_ids, p_specialization, preflight_row.created_by
  )
  on conflict (organization_id, objective_preflight_id, specialization_fingerprint) do nothing
  returning * into inserted_row;

  if inserted_row.id is null then
    select specialization.* into existing_row
    from public.capital_project_objective_specializations specialization
    where specialization.organization_id = job_row.organization_id
      and specialization.objective_preflight_id = preflight_row.id
      and specialization.specialization_fingerprint = p_specialization ->> 'fingerprint';
    inserted_row := existing_row;
  end if;

  return preflight_result || jsonb_build_object(
    'specialization_id', inserted_row.id,
    'specialization_fingerprint', inserted_row.specialization_fingerprint,
    'pack_ids', to_jsonb(inserted_row.selected_pack_ids),
    'minimum_maturity', inserted_row.minimum_maturity,
    'specialization_replayed', false
  );
end;
$$;

create or replace function public.worker_record_objective_plan_preflight_v2(
  p_job_id uuid,
  p_capability_token text,
  p_objective_plan jsonb,
  p_preflight_decision jsonb,
  p_specialization jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_objective_plan_preflight_v2(
    p_job_id, p_capability_token, p_objective_plan, p_preflight_decision, p_specialization
  );
$$;

revoke all on function private.worker_record_objective_plan_preflight_v2(
  uuid, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.worker_record_objective_plan_preflight_v2(
  uuid, text, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function private.worker_record_objective_plan_preflight_v2(
  uuid, text, jsonb, jsonb, jsonb
) to authenticated;
grant execute on function public.worker_record_objective_plan_preflight_v2(
  uuid, text, jsonb, jsonb, jsonb
) to authenticated;

comment on table public.capital_project_objective_specializations is
  'Immutable shadow composition of reusable DCM depth packs selected for one objective preflight.';
comment on function public.worker_record_objective_plan_preflight_v2(
  uuid, text, jsonb, jsonb, jsonb
) is
  'Capability-bound worker command that atomically records an objective preflight and its non-authorizing specialization composition.';
