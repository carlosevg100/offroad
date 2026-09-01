-- Persist the exact dependency-closed TaskSpec plan compiled for every capital project.
-- The snapshot is immutable; later registry releases create a new plan version rather than
-- rewriting history. Task execution is append-only and remains separate from the plan itself.

create table public.capital_project_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  plan_version integer not null check (plan_version > 0),
  entry_job text not null check (entry_job in (
    'company_debt_view', 'origination_thesis', 'capital_planning',
    'structure_from_documents', 'review_existing_operation', 'prepare_materials_and_process'
  )),
  schema_version text not null check (schema_version ~ '^capital-project-plan[.]v[0-9]+$'),
  compiler_version text not null check (char_length(trim(compiler_version)) between 3 and 80),
  registry_version text not null check (char_length(trim(registry_version)) between 3 and 80),
  plan_fingerprint text not null check (plan_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (status in ('active', 'superseded', 'completed', 'invalidated')),
  confirmation_gate text not null check (confirmation_gate in (
    'preliminary_understanding', 'diagnostic', 'structure', 'production_plan'
  )),
  first_work_product text not null check (first_work_product ~ '^[a-z0-9_]{3,80}$'),
  target_task_ids text[] not null check (cardinality(target_task_ids) between 1 and 80),
  input_policy jsonb not null check (jsonb_typeof(input_policy) = 'object'),
  parallel_batches jsonb not null check (
    jsonb_typeof(parallel_batches) = 'array' and jsonb_array_length(parallel_batches) between 1 and 80
  ),
  task_count integer not null check (task_count between 1 and 80),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, capital_project_id, plan_version),
  unique (organization_id, capital_project_id, plan_fingerprint),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade
);

create unique index capital_project_plans_one_active_idx
  on public.capital_project_plans (organization_id, capital_project_id)
  where status = 'active';
create index capital_project_plans_project_created_idx
  on public.capital_project_plans (organization_id, capital_project_id, created_at desc);
create index capital_project_plans_created_by_idx
  on public.capital_project_plans (created_by);

create table public.capital_project_plan_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  plan_id uuid not null,
  task_id text not null check (task_id ~ '^[A-Z][0-9]{2}$'),
  ordinal integer not null check (ordinal between 0 and 79),
  batch_no integer not null check (batch_no between 0 and 79),
  label text not null check (char_length(trim(label)) between 3 and 200),
  graph text not null check (graph in ('knowledge', 'case', 'market')),
  dependencies text[] not null default '{}'::text[],
  execution_class text not null check (execution_class in (
    'deterministic', 'extraction', 'research', 'judgment', 'compilation', 'action'
  )),
  effect text not null check (effect in ('none', 'propose_state', 'commit')),
  maturity_at_compile text not null check (maturity_at_compile in ('specified', 'implemented', 'tested', 'production')),
  context_policy text not null default 'task_scoped' check (context_policy = 'task_scoped'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, plan_id, task_id),
  unique (organization_id, plan_id, ordinal),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, plan_id)
    references public.capital_project_plans(organization_id, id) on delete cascade
);

create index capital_project_plan_tasks_batch_idx
  on public.capital_project_plan_tasks (organization_id, plan_id, batch_no, ordinal);

create table public.capital_project_task_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  plan_id uuid not null,
  plan_task_id uuid not null,
  attempt_no integer not null check (attempt_no between 1 and 10),
  status text not null check (status in (
    'queued', 'running', 'waiting_user', 'blocked', 'succeeded', 'failed',
    'cancelled', 'invalidated'
  )),
  trigger_event jsonb not null check (jsonb_typeof(trigger_event) = 'object'),
  context_manifest jsonb check (context_manifest is null or jsonb_typeof(context_manifest) = 'object'),
  input_fingerprint text check (input_fingerprint is null or input_fingerprint ~ '^[0-9a-f]{64}$'),
  output_reference jsonb check (output_reference is null or jsonb_typeof(output_reference) = 'object'),
  quality_results jsonb not null default '[]'::jsonb check (jsonb_typeof(quality_results) = 'array'),
  usage jsonb not null default '{}'::jsonb check (jsonb_typeof(usage) = 'object'),
  error jsonb check (error is null or jsonb_typeof(error) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, plan_task_id, attempt_no),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, plan_id)
    references public.capital_project_plans(organization_id, id) on delete cascade,
  foreign key (organization_id, plan_task_id)
    references public.capital_project_plan_tasks(organization_id, id) on delete cascade,
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index capital_project_task_runs_plan_status_idx
  on public.capital_project_task_runs (organization_id, plan_id, status, created_at);

alter table public.capital_project_plans enable row level security;
alter table public.capital_project_plans force row level security;
alter table public.capital_project_plan_tasks enable row level security;
alter table public.capital_project_plan_tasks force row level security;
alter table public.capital_project_task_runs enable row level security;
alter table public.capital_project_task_runs force row level security;

create policy capital_project_plans_select
  on public.capital_project_plans for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));
create policy capital_project_plan_tasks_select
  on public.capital_project_plan_tasks for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));
create policy capital_project_task_runs_select
  on public.capital_project_task_runs for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));

revoke all privileges on public.capital_project_plans from public, anon, authenticated;
revoke all privileges on public.capital_project_plan_tasks from public, anon, authenticated;
revoke all privileges on public.capital_project_task_runs from public, anon, authenticated;
grant select on public.capital_project_plans to authenticated;
grant select on public.capital_project_plan_tasks to authenticated;
grant select on public.capital_project_task_runs to authenticated;

create trigger capital_project_plans_set_updated_at
  before update on public.capital_project_plans
  for each row execute function private.set_updated_at();
create trigger capital_project_plans_audit
  after insert or update or delete on public.capital_project_plans
  for each row execute function private.capture_audit_event();
create trigger capital_project_plan_tasks_audit
  after insert or update or delete on public.capital_project_plan_tasks
  for each row execute function private.capture_audit_event();
create trigger capital_project_task_runs_audit
  after insert or update or delete on public.capital_project_task_runs
  for each row execute function private.capture_audit_event();

create or replace function private.record_capital_project_plan(
  p_project_id uuid,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  project_row public.capital_projects;
  plan_id uuid;
  existing_plan_id uuid;
  next_version integer;
  plan_fingerprint text;
  task_record jsonb;
  dependency_id text;
  dependency_batch integer;
  task_ids text[];
  target_ids text[];
  flattened_batch_ids text[];
  expected_access_policy text;
  allowed_task_ids constant text[] := array[
    'M01','M02','M03','M04','M05','M06','M07',
    'D01','D02','D03','D04','D05','D06','D07','D08','D09','D10','D11',
    'C01','C02','C03','C04','C05','C06','C07','C08','C09','C10','C11',
    'S01','S02','S03','S04','S05','S06','S07','S08','S09','S10','S11','S12',
    'K01','K02','K03','K04','K05','K06','K07','K08','K09','K10',
    'A01','A02','A03','A04','A05','A06','A07','A08','A09','A10','A11',
    'X01','X02','X03','X04','X05','X06','X07','X08','X09','X10','X11','X12',
    'L01','L02','L03','L04','L05','L06'
  ];
begin
  if caller_id is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'invalid_capital_project_plan' using errcode = '22023';
  end if;

  select project.* into project_row
  from public.capital_projects project
  join public.organization_memberships membership
    on membership.organization_id = project.organization_id
  where project.id = p_project_id
    and membership.user_id = caller_id
    and membership.status = 'active'
    and project.status <> 'archived'
  for update of project;
  if not found then
    raise exception 'capital_project_not_found' using errcode = 'P0002';
  end if;

  if p_snapshot ->> 'schemaVersion' <> 'capital-project-plan.v1'
    or p_snapshot #>> '{job,id}' <> project_row.entry_job
    or coalesce(p_snapshot #>> '{job,firstWorkProduct}', '') !~ '^[a-z0-9_]{3,80}$'
    or p_snapshot #>> '{job,confirmationGate}' not in (
      'preliminary_understanding', 'diagnostic', 'structure', 'production_plan'
    )
    or p_snapshot #>> '{job,accessPolicy}' not in (
      'public_or_private', 'private_required', 'existing_project'
    )
    or jsonb_typeof(p_snapshot #> '{job,inputPolicy}') <> 'object'
    or jsonb_typeof(p_snapshot -> 'taskSpecs') <> 'array'
    or jsonb_array_length(p_snapshot -> 'taskSpecs') not between 1 and 80
    or jsonb_typeof(p_snapshot -> 'parallelBatches') <> 'array'
    or jsonb_array_length(p_snapshot -> 'parallelBatches') not between 1 and 80
    or jsonb_typeof(p_snapshot #> '{job,targetTaskIds}') <> 'array'
    or jsonb_array_length(p_snapshot #> '{job,targetTaskIds}') not between 1 and 80
    or char_length(trim(coalesce(p_snapshot ->> 'compilerVersion', ''))) not between 3 and 80
    or char_length(trim(coalesce(p_snapshot ->> 'registryVersion', ''))) not between 3 and 80 then
    raise exception 'invalid_capital_project_plan' using errcode = '22023';
  end if;

  select array_agg(task ->> 'id' order by (task ->> 'ordinal')::integer)
  into task_ids
  from jsonb_array_elements(p_snapshot -> 'taskSpecs') task;
  select array_agg(value order by position)
  into target_ids
  from jsonb_array_elements_text(p_snapshot #> '{job,targetTaskIds}') with ordinality targets(value, position);
  if cardinality(task_ids) <> (select count(distinct id) from unnest(task_ids) id)
    or exists (select 1 from unnest(task_ids) id where not (id = any(allowed_task_ids))) then
    raise exception 'invalid_capital_project_plan_tasks' using errcode = '22023';
  end if;
  if target_ids is distinct from (case project_row.entry_job
      when 'company_debt_view' then array['C11']
      when 'origination_thesis' then array['M07','C02','K04']
      when 'capital_planning' then array['S11']
      when 'structure_from_documents' then array['S11']
      when 'review_existing_operation' then array['S10','S12']
      when 'prepare_materials_and_process' then array['A11','K09']
    end) then
    raise exception 'capital_project_plan_targets_invalid' using errcode = '22023';
  end if;
  expected_access_policy := case
    when project_row.entry_job in ('company_debt_view', 'origination_thesis', 'capital_planning')
      then 'public_or_private'
    when project_row.entry_job in ('structure_from_documents', 'review_existing_operation')
      then 'private_required'
    else 'existing_project'
  end;
  if p_snapshot #>> '{job,accessPolicy}' <> expected_access_policy
    or (project_row.access_basis = 'public_information' and expected_access_policy <> 'public_or_private') then
    raise exception 'capital_project_plan_access_invalid' using errcode = '42501';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_snapshot #> '{job,targetTaskIds}') target(target_id)
    where not (target.target_id = any(task_ids))
  ) then
    raise exception 'capital_project_plan_target_missing' using errcode = '22023';
  end if;

  select array_agg(task_id order by batch_no, batch_ordinal)
  into flattened_batch_ids
  from (
    select batch_no, batch_ordinal, task_id
    from jsonb_array_elements(p_snapshot -> 'parallelBatches') with ordinality batches(batch, batch_no),
         jsonb_array_elements_text(batches.batch) with ordinality ids(task_id, batch_ordinal)
  ) flattened;
  if cardinality(flattened_batch_ids) <> cardinality(task_ids)
    or (select count(distinct id) from unnest(flattened_batch_ids) id) <> cardinality(task_ids)
    or exists (select 1 from unnest(flattened_batch_ids) id where not (id = any(task_ids))) then
    raise exception 'invalid_capital_project_plan_batches' using errcode = '22023';
  end if;

  for task_record in select value from jsonb_array_elements(p_snapshot -> 'taskSpecs') loop
    if coalesce(task_record ->> 'id', '') !~ '^[A-Z][0-9]{2}$'
      or coalesce(task_record ->> 'label', '') = ''
      or task_record ->> 'graph' not in ('knowledge', 'case', 'market')
      or task_record ->> 'executionClass' not in (
        'deterministic', 'extraction', 'research', 'judgment', 'compilation', 'action'
      )
      or task_record ->> 'effect' not in ('none', 'propose_state', 'commit')
      or task_record ->> 'maturity' not in ('specified', 'implemented', 'tested', 'production')
      or jsonb_typeof(task_record -> 'dependencies') <> 'array'
      or (task_record ->> 'ordinal')::integer not between 0 and 79
      or (task_record ->> 'batch')::integer not between 0 and 79
      or not exists (
        select 1
        from jsonb_array_elements_text(
          p_snapshot -> 'parallelBatches' -> ((task_record ->> 'batch')::integer)
        ) batch_task(task_id)
        where batch_task.task_id = task_record ->> 'id'
      ) then
      raise exception 'invalid_capital_project_task_spec' using errcode = '22023';
    end if;
    for dependency_id in select value from jsonb_array_elements_text(task_record -> 'dependencies') loop
      if not (dependency_id = any(task_ids)) then
        raise exception 'capital_project_plan_not_dependency_closed' using errcode = '22023';
      end if;
      select (dependency ->> 'batch')::integer into dependency_batch
      from jsonb_array_elements(p_snapshot -> 'taskSpecs') dependency
      where dependency ->> 'id' = dependency_id;
      if dependency_batch >= (task_record ->> 'batch')::integer then
        raise exception 'capital_project_plan_dependency_order_invalid' using errcode = '22023';
      end if;
    end loop;
  end loop;

  plan_fingerprint := encode(extensions.digest(convert_to(p_snapshot::text, 'utf8'), 'sha256'), 'hex');
  select plan.id into existing_plan_id
  from public.capital_project_plans plan
  where plan.organization_id = project_row.organization_id
    and plan.capital_project_id = project_row.id
    and plan.plan_fingerprint = plan_fingerprint;
  if existing_plan_id is not null then return existing_plan_id; end if;

  update public.capital_project_plans plan
  set status = 'superseded', updated_at = now()
  where plan.organization_id = project_row.organization_id
    and plan.capital_project_id = project_row.id
    and plan.status = 'active';
  select coalesce(max(plan.plan_version), 0) + 1 into next_version
  from public.capital_project_plans plan
  where plan.organization_id = project_row.organization_id
    and plan.capital_project_id = project_row.id;

  insert into public.capital_project_plans (
    organization_id, capital_project_id, plan_version, entry_job, schema_version,
    compiler_version, registry_version, plan_fingerprint, status, confirmation_gate,
    first_work_product, target_task_ids, input_policy, parallel_batches, task_count,
    snapshot, created_by
  ) values (
    project_row.organization_id, project_row.id, next_version, project_row.entry_job,
    p_snapshot ->> 'schemaVersion', p_snapshot ->> 'compilerVersion',
    p_snapshot ->> 'registryVersion', plan_fingerprint, 'active',
    p_snapshot #>> '{job,confirmationGate}', p_snapshot #>> '{job,firstWorkProduct}',
    array(select value from jsonb_array_elements_text(p_snapshot #> '{job,targetTaskIds}')),
    p_snapshot #> '{job,inputPolicy}', p_snapshot -> 'parallelBatches', cardinality(task_ids),
    p_snapshot, caller_id
  ) returning id into plan_id;

  for task_record in select value from jsonb_array_elements(p_snapshot -> 'taskSpecs') loop
    insert into public.capital_project_plan_tasks (
      organization_id, capital_project_id, plan_id, task_id, ordinal, batch_no,
      label, graph, dependencies, execution_class, effect, maturity_at_compile
    ) values (
      project_row.organization_id, project_row.id, plan_id, task_record ->> 'id',
      (task_record ->> 'ordinal')::integer, (task_record ->> 'batch')::integer,
      task_record ->> 'label', task_record ->> 'graph',
      array(select value from jsonb_array_elements_text(task_record -> 'dependencies')),
      task_record ->> 'executionClass', task_record ->> 'effect', task_record ->> 'maturity'
    );
  end loop;
  return plan_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid_capital_project_plan' using errcode = '22023';
end;
$$;

revoke all on function private.record_capital_project_plan(uuid, jsonb)
  from public, anon, authenticated;

create or replace function private.capital_project_id_for_session(p_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select session.capital_project_id
  from public.document_intake_sessions session
  where session.id = p_session_id;
$$;

revoke all on function private.capital_project_id_for_session(uuid)
  from public, anon, authenticated;

create or replace function private.start_workspace_capital_project_v2(
  p_locale text,
  p_project_name text,
  p_identity_policy text,
  p_representation_declared boolean,
  p_entry_job text,
  p_plan jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_id uuid;
begin
  session_id := private.start_workspace_capital_project(
    p_locale, p_project_name, p_identity_policy, p_representation_declared, p_entry_job
  );
  perform private.record_capital_project_plan(
    private.capital_project_id_for_session(session_id), p_plan
  );
  return session_id;
end;
$$;

create or replace function public.start_workspace_capital_project_v2(
  p_locale text,
  p_project_name text,
  p_identity_policy text,
  p_representation_declared boolean,
  p_entry_job text,
  p_plan jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.start_workspace_capital_project_v2(
    p_locale, p_project_name, p_identity_policy, p_representation_declared, p_entry_job, p_plan
  );
$$;

create or replace function private.start_onboarding_capital_project_v2(
  p_locale text,
  p_project_name text,
  p_identity_policy text,
  p_representation_declared boolean,
  p_entry_job text,
  p_plan jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_id uuid;
begin
  session_id := private.start_onboarding_capital_project(
    p_locale, p_project_name, p_identity_policy, p_representation_declared, p_entry_job
  );
  perform private.record_capital_project_plan(
    private.capital_project_id_for_session(session_id), p_plan
  );
  return session_id;
end;
$$;

create or replace function public.start_onboarding_capital_project_v2(
  p_locale text,
  p_project_name text,
  p_identity_policy text,
  p_representation_declared boolean,
  p_entry_job text,
  p_plan jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.start_onboarding_capital_project_v2(
    p_locale, p_project_name, p_identity_policy, p_representation_declared, p_entry_job, p_plan
  );
$$;

create or replace function private.start_public_capital_project_v2(
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_company_name text,
  p_company_website text,
  p_plan jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_id uuid;
begin
  session_id := private.start_public_capital_project(
    p_locale, p_project_name, p_entry_job, p_company_name, p_company_website
  );
  perform private.record_capital_project_plan(
    private.capital_project_id_for_session(session_id), p_plan
  );
  return session_id;
end;
$$;

create or replace function public.start_public_capital_project_v2(
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_company_name text,
  p_company_website text,
  p_plan jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.start_public_capital_project_v2(
    p_locale, p_project_name, p_entry_job, p_company_name, p_company_website, p_plan
  );
$$;

create or replace function private.start_public_onboarding_capital_project_v2(
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_company_name text,
  p_company_website text,
  p_plan jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_id uuid;
begin
  session_id := private.start_public_onboarding_capital_project(
    p_locale, p_project_name, p_entry_job, p_company_name, p_company_website
  );
  perform private.record_capital_project_plan(
    private.capital_project_id_for_session(session_id), p_plan
  );
  return session_id;
end;
$$;

create or replace function public.start_public_onboarding_capital_project_v2(
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_company_name text,
  p_company_website text,
  p_plan jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.start_public_onboarding_capital_project_v2(
    p_locale, p_project_name, p_entry_job, p_company_name, p_company_website, p_plan
  );
$$;

revoke all on function private.start_workspace_capital_project_v2(text, text, text, boolean, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.start_workspace_capital_project_v2(text, text, text, boolean, text, jsonb)
  from public, anon;
grant execute on function private.start_workspace_capital_project_v2(text, text, text, boolean, text, jsonb)
  to authenticated;
grant execute on function public.start_workspace_capital_project_v2(text, text, text, boolean, text, jsonb)
  to authenticated;

revoke all on function private.start_onboarding_capital_project_v2(text, text, text, boolean, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.start_onboarding_capital_project_v2(text, text, text, boolean, text, jsonb)
  from public, anon;
grant execute on function private.start_onboarding_capital_project_v2(text, text, text, boolean, text, jsonb)
  to authenticated;
grant execute on function public.start_onboarding_capital_project_v2(text, text, text, boolean, text, jsonb)
  to authenticated;

revoke all on function private.start_public_capital_project_v2(text, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.start_public_capital_project_v2(text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function private.start_public_capital_project_v2(text, text, text, text, text, jsonb)
  to authenticated;
grant execute on function public.start_public_capital_project_v2(text, text, text, text, text, jsonb)
  to authenticated;

revoke all on function private.start_public_onboarding_capital_project_v2(text, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.start_public_onboarding_capital_project_v2(text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function private.start_public_onboarding_capital_project_v2(text, text, text, text, text, jsonb)
  to authenticated;
grant execute on function public.start_public_onboarding_capital_project_v2(text, text, text, text, text, jsonb)
  to authenticated;

comment on table public.capital_project_plans is
  'Immutable, versioned TaskSpec DAG snapshots compiled for a capital project.';
comment on table public.capital_project_plan_tasks is
  'TaskSpec identities, dependencies and execution classes frozen at plan compilation.';
comment on table public.capital_project_task_runs is
  'Append-only execution attempts. Absence of a run means pending; progress never comes from UI animation.';
