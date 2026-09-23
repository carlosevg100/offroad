CREATE OR REPLACE FUNCTION private.record_execution_proposal_plan_as_actor(p_project_id uuid, p_snapshot jsonb, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  documentary boolean := false;
  caller_id uuid := p_actor_id;
  project_row public.capital_projects;
  plan_id uuid;
  existing_plan_id uuid;
  next_version integer;
  computed_plan_fingerprint text;
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
    and private.resource_access_as_subject_v1(project.organization_id,project.id,caller_id,'work')
    and membership.user_id = caller_id
    and membership.status = 'active'
    and project.status <> 'archived'
  for update of project;
  if not found then
    raise exception 'capital_project_not_found' using errcode = 'P0002';
  end if;

  documentary := private.is_released_documentary_plan_v1(p_snapshot, project_row.entry_job) or (project_row.entry_job='company_debt_view' and (p_snapshot=private.provider_research_plan_v1() or p_snapshot=private.provider_research_plan_v2())) or p_snapshot=private.provider_case_fit_plan_v1(project_row.entry_job);

  if private.is_released_documentary_plan_v1(p_snapshot, project_row.entry_job) and project_row.access_basis <> 'authorized_private' then
    raise exception 'documentary_plan_private_access_required' using errcode='42501';
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
    or (not documentary and exists (select 1 from unnest(task_ids) id where not (id = any(allowed_task_ids)))) then
    raise exception 'invalid_capital_project_plan_tasks' using errcode = '22023';
  end if;
  if documentary then
    null;
  elsif project_row.entry_job = 'origination_thesis'
    and target_ids in (array['M07','C02','K04'], array['M07','S11','K04']) then
    null;
  elsif target_ids is distinct from (case project_row.entry_job
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

  computed_plan_fingerprint := encode(
    extensions.digest(convert_to(p_snapshot::text, 'utf8'), 'sha256'),
    'hex'
  );
  select plan.id into existing_plan_id
  from public.capital_project_plans plan
  where plan.organization_id = project_row.organization_id
    and plan.capital_project_id = project_row.id
    and plan.plan_fingerprint = computed_plan_fingerprint;
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
    p_snapshot ->> 'registryVersion', computed_plan_fingerprint, 'active',
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
$function$
