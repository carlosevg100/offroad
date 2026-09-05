-- integration_preview: the preview run's model budget fits the questions and the synthesis.
--
-- The live gate showed the synthesis call refused by the preflight reservation: ten cents did
-- not cover the questions already spent plus a reservation sized on the synthesis output cap.
-- The run now carries fifty cents and four calls; the worker's per-job caps still bound it, and
-- the synthesis output cap was lowered to four thousand tokens. Nothing else in the activation
-- changes.

create or replace function private.worker_activate_integration_preview_run_v1(
  p_job_id uuid,
  p_capability_token text,
  p_assistant_message_id uuid,
  p_activation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  source_message public.agent_messages;
  assistant_message public.agent_messages;
  session_row public.document_intake_sessions;
  project_row public.capital_projects;
  plan_row public.capital_project_plans;
  existing_brief public.capital_project_briefs;
  existing_job public.processing_jobs;
  composition text := trim(coalesce(p_activation ->> 'composition', ''));
  case_id text := trim(coalesce(p_activation ->> 'caseId', ''));
  workflow jsonb := p_activation -> 'workflow';
  plan_snapshot jsonb := p_activation -> 'plan';
  brief_content jsonb := coalesce(p_activation -> 'brief', '{}'::jsonb) || jsonb_build_object(
    'composition', trim(coalesce(p_activation ->> 'composition', '')),
    'caseId', trim(coalesce(p_activation ->> 'caseId', '')),
    'workflow', p_activation -> 'workflow'
  );
  v_plan_fingerprint text;
  brief_fingerprint text;
  brief_id uuid;
  next_brief_version integer;
  next_plan_version integer;
  task_record jsonb;
  task_ids jsonb;
  dependency_id text;
  plan_task_ids text[];
  run_id uuid := gen_random_uuid();
  capital_job_id uuid := gen_random_uuid();
  next_run_no integer;
  v_pipeline_version text;
  actor_id uuid := (select auth.uid());
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
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if job_row.kind <> 'agent_operation_brief'
    or jsonb_typeof(p_activation) <> 'object'
    or p_activation ->> 'job' <> 'integration_preview' then
    raise exception 'invalid_integration_preview_activation' using errcode = '22023';
  end if;
  -- The mode is a grant scoped to the job's project, not a payload flag: without it the activation stops here.
  if not private.integration_preview_enabled_for_session(job_row.organization_id, job_row.intake_session_id) then
    raise exception 'integration_preview_not_granted' using errcode = '42501';
  end if;
  if composition not in ('prepare_meeting', 'prepare_material', 'change_premise', 'deepen', 'prepare_decision')
    or case_id !~ '^[a-z0-9][a-z0-9_-]{1,79}$'
    or jsonb_typeof(workflow) <> 'object'
    or coalesce(workflow ->> 'id', '') !~ '^[a-z0-9][a-z0-9_.-]{1,119}$'
    or char_length(trim(coalesce(workflow ->> 'version', ''))) not between 3 and 80
    or coalesce(workflow ->> 'fingerprint', '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(plan_snapshot) <> 'object'
    or plan_snapshot ->> 'schemaVersion' <> 'capital-project-plan.v1'
    or char_length(trim(coalesce(plan_snapshot ->> 'compilerVersion', ''))) not between 3 and 80
    or char_length(trim(coalesce(plan_snapshot ->> 'registryVersion', ''))) not between 3 and 80
    or jsonb_typeof(plan_snapshot -> 'taskSpecs') <> 'array'
    or jsonb_array_length(plan_snapshot -> 'taskSpecs') not between 1 and 80
    or jsonb_typeof(plan_snapshot -> 'parallelBatches') <> 'array'
    or jsonb_array_length(plan_snapshot -> 'parallelBatches') not between 1 and 80
    or jsonb_typeof(plan_snapshot #> '{job,targetTaskIds}') <> 'array'
    or jsonb_array_length(plan_snapshot #> '{job,targetTaskIds}') not between 1 and 80
    or coalesce(plan_snapshot #>> '{job,firstWorkProduct}', '') !~ '^[a-z0-9_]{3,80}$'
    or jsonb_typeof(p_activation -> 'brief') <> 'object' then
    raise exception 'invalid_integration_preview_activation' using errcode = '22023';
  end if;

  select message.* into source_message
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = (job_row.payload ->> 'message_id')::uuid
    and message.role = 'user'
  for update;
  if not found then raise exception 'agent_source_message_not_found' using errcode = 'P0002'; end if;

  select message.* into assistant_message
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = p_assistant_message_id
    and message.role = 'assistant'
    and message.reply_to_message_id = source_message.id
  for update;
  if not found then raise exception 'agent_activation_message_not_found' using errcode = 'P0002'; end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
  for update;
  if not found then raise exception 'capital_project_session_not_available' using errcode = 'P0002'; end if;

  select project.* into project_row
  from public.capital_projects project
  where project.organization_id = job_row.organization_id
    and project.id = session_row.capital_project_id
    and project.status <> 'archived'
  for update;
  if not found then raise exception 'capital_project_not_available' using errcode = 'P0002'; end if;

  -- Replay: the same user turn activates the same run once.
  brief_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'capitalProjectId', project_row.id,
    'briefKind', 'integration_preview',
    'content', brief_content,
    'sourceMessageId', source_message.id
  )::text, 'utf8'), 'sha256'), 'hex');
  select brief.* into existing_brief
  from public.capital_project_briefs brief
  where brief.organization_id = job_row.organization_id
    and brief.capital_project_id = project_row.id
    and brief.brief_kind = 'integration_preview'
    and brief.content_fingerprint = brief_fingerprint
  order by brief.brief_version desc
  limit 1;
  if found then
    select queued.* into existing_job
    from public.processing_jobs queued
    where queued.organization_id = job_row.organization_id
      and queued.kind = 'capital_project_analysis'
      and queued.payload ->> 'capital_project_brief_id' = existing_brief.id::text
    order by queued.created_at desc
    limit 1;
    if not found then raise exception 'integration_preview_activation_incomplete' using errcode = '55000'; end if;
    update public.agent_messages message
    set metadata = message.metadata || jsonb_build_object(
          'activation', jsonb_build_object(
            'analysisScope', 'integration_preview',
            'composition', composition,
            'briefId', existing_brief.id,
            'jobId', existing_job.id
          )
        ),
        updated_at = now()
    where message.organization_id = job_row.organization_id and message.id = assistant_message.id;
    update public.agent_conversations conversation
    set state = case when existing_job.status in ('queued', 'leased') then 'analyzing' else 'idle' end,
        updated_at = now()
    where conversation.organization_id = job_row.organization_id
      and conversation.id = source_message.conversation_id;
    return jsonb_build_object(
      'brief_id', existing_brief.id,
      'job_id', existing_job.id,
      'plan_id', (existing_job.payload ->> 'capital_project_plan_id')::uuid,
      'analysis_scope', 'integration_preview',
      'composition', composition,
      'replayed', true
    );
  end if;

  -- The preview plan: the workflow compiled for this composition, its tasks bound to methods in
  -- the implemented rung. A plan with the same fingerprint is reused; otherwise it supersedes
  -- the active plan of the project.
  select array_agg(task ->> 'id' order by (task ->> 'ordinal')::integer)
  into plan_task_ids
  from jsonb_array_elements(plan_snapshot -> 'taskSpecs') task;
  if cardinality(plan_task_ids) <> (select count(distinct id) from unnest(plan_task_ids) id)
    or exists (select 1 from unnest(plan_task_ids) id where not (id = any(allowed_task_ids))) then
    raise exception 'invalid_integration_preview_plan_tasks' using errcode = '22023';
  end if;
  for task_record in select value from jsonb_array_elements(plan_snapshot -> 'taskSpecs') loop
    if coalesce(task_record ->> 'id', '') !~ '^[A-Z][0-9]{2}$'
      or char_length(trim(coalesce(task_record ->> 'label', ''))) not between 3 and 200
      or task_record ->> 'graph' not in ('knowledge', 'case', 'market')
      or task_record ->> 'executionClass' not in (
        'deterministic', 'extraction', 'research', 'judgment', 'compilation', 'action'
      )
      or task_record ->> 'effect' not in ('none', 'propose_state', 'commit')
      or task_record ->> 'maturity' not in ('specified', 'implemented', 'tested', 'production')
      or jsonb_typeof(task_record -> 'dependencies') <> 'array'
      or (task_record ->> 'ordinal')::integer not between 0 and 79
      or (task_record ->> 'batch')::integer not between 0 and 79 then
      raise exception 'invalid_integration_preview_task_spec' using errcode = '22023';
    end if;
    for dependency_id in select value from jsonb_array_elements_text(task_record -> 'dependencies') loop
      if not (dependency_id = any(plan_task_ids)) then
        raise exception 'integration_preview_plan_not_dependency_closed' using errcode = '22023';
      end if;
    end loop;
  end loop;
  if exists (
    select 1
    from jsonb_array_elements_text(plan_snapshot #> '{job,targetTaskIds}') target(target_id)
    where not (target.target_id = any(plan_task_ids))
  ) then
    raise exception 'integration_preview_plan_target_missing' using errcode = '22023';
  end if;

  v_plan_fingerprint := encode(extensions.digest(convert_to(plan_snapshot::text, 'utf8'), 'sha256'), 'hex');
  select plan.* into plan_row
  from public.capital_project_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.capital_project_id = project_row.id
    and plan.plan_fingerprint = v_plan_fingerprint
  for update;
  if not found then
    update public.capital_project_plans plan
    set status = 'superseded', updated_at = now()
    where plan.organization_id = job_row.organization_id
      and plan.capital_project_id = project_row.id
      and plan.status = 'active';
    select coalesce(max(plan.plan_version), 0) + 1 into next_plan_version
    from public.capital_project_plans plan
    where plan.organization_id = job_row.organization_id
      and plan.capital_project_id = project_row.id;
    insert into public.capital_project_plans (
      organization_id, capital_project_id, plan_version, entry_job, schema_version,
      compiler_version, registry_version, plan_fingerprint, status, confirmation_gate,
      first_work_product, target_task_ids, input_policy, parallel_batches, task_count,
      snapshot, created_by
    ) values (
      job_row.organization_id, project_row.id, next_plan_version, project_row.entry_job,
      plan_snapshot ->> 'schemaVersion', plan_snapshot ->> 'compilerVersion',
      plan_snapshot ->> 'registryVersion', v_plan_fingerprint, 'active',
      coalesce(plan_snapshot #>> '{job,confirmationGate}', 'preliminary_understanding'),
      plan_snapshot #>> '{job,firstWorkProduct}',
      array(select value from jsonb_array_elements_text(plan_snapshot #> '{job,targetTaskIds}')),
      coalesce(plan_snapshot #> '{job,inputPolicy}', '{}'::jsonb), plan_snapshot -> 'parallelBatches',
      cardinality(plan_task_ids), plan_snapshot, source_message.created_by
    ) returning * into plan_row;
    for task_record in select value from jsonb_array_elements(plan_snapshot -> 'taskSpecs') loop
      insert into public.capital_project_plan_tasks (
        organization_id, capital_project_id, plan_id, task_id, ordinal, batch_no,
        label, graph, dependencies, execution_class, effect, maturity_at_compile
      ) values (
        job_row.organization_id, project_row.id, plan_row.id, task_record ->> 'id',
        (task_record ->> 'ordinal')::integer, (task_record ->> 'batch')::integer,
        task_record ->> 'label', task_record ->> 'graph',
        array(select value from jsonb_array_elements_text(task_record -> 'dependencies')),
        task_record ->> 'executionClass', task_record ->> 'effect', task_record ->> 'maturity'
      );
    end loop;
  elsif plan_row.status <> 'active' then
    update public.capital_project_plans plan
    set status = 'superseded', updated_at = now()
    where plan.organization_id = job_row.organization_id
      and plan.capital_project_id = project_row.id
      and plan.status = 'active'
      and plan.id <> plan_row.id;
    update public.capital_project_plans plan
    set status = 'active', updated_at = now()
    where plan.organization_id = job_row.organization_id and plan.id = plan_row.id
    returning * into plan_row;
  end if;

  -- The brief: one active preview brief per project, versioned by turn.
  select coalesce(max(brief.brief_version), 0) + 1 into next_brief_version
  from public.capital_project_briefs brief
  where brief.organization_id = job_row.organization_id
    and brief.capital_project_id = project_row.id
    and brief.brief_kind = 'integration_preview';
  update public.capital_project_briefs brief
  set status = 'superseded', updated_at = now()
  where brief.organization_id = job_row.organization_id
    and brief.capital_project_id = project_row.id
    and brief.brief_kind = 'integration_preview'
    and brief.status = 'active';
  insert into public.capital_project_briefs (
    organization_id, capital_project_id, request_id, brief_kind, brief_version,
    status, content, content_fingerprint, created_by
  ) values (
    job_row.organization_id, project_row.id, source_message.id, 'integration_preview', next_brief_version,
    'active', brief_content, brief_fingerprint, source_message.created_by
  ) returning id into brief_id;

  select coalesce(jsonb_agg(task.task_id order by task.ordinal), '[]'::jsonb)
  into task_ids
  from public.capital_project_plan_tasks task
  where task.organization_id = job_row.organization_id and task.plan_id = plan_row.id;

  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.organization_id = job_row.organization_id
    and run.intake_session_id = session_row.id;
  v_pipeline_version := 'integration-preview-' || (workflow ->> 'version');

  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    run_id, job_row.organization_id, session_row.id, next_run_no, 'answer', 'queued',
    v_pipeline_version,
    jsonb_build_object('maxCalls', 4, 'maxCostUsd', 0.50),
    jsonb_build_object(
      'planId', plan_row.id,
      'briefId', brief_id,
      'executor', v_pipeline_version,
      'workflow', workflow,
      'activatedBy', 'integration_preview_v1',
      'mode', 'integration_preview'
    ),
    source_message.created_by
  );

  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload, max_attempts
  ) values (
    capital_job_id, job_row.organization_id, run_id, session_row.id, 'capital_project_analysis',
    jsonb_build_object(
      'analysis_scope', 'integration_preview',
      'locale', source_message.locale,
      'capital_project_id', project_row.id,
      'capital_project_plan_id', plan_row.id,
      'capital_project_brief_id', brief_id,
      'capital_task_ids', task_ids,
      -- A replayed step is a run of this plan whose output points at the object of an earlier
      -- plan; the per-run artifact requirement would refuse it. Computed steps still write theirs.
      'capital_artifact_required', false,
      'trigger_event', jsonb_build_object(
        'type', 'advisor_semantic_route',
        'mode', 'integration_preview',
        'sourceMessageId', source_message.id,
        'assistantMessageId', assistant_message.id
      ),
      -- Deterministic runs spend nothing; a live run may make one bounded call for the questions
      -- and, later, one for the synthesis. The worker's own caps still apply on top.
      -- Questions and synthesis in live mode: two bounded calls whose preflight reservations must fit.
      'model_budget', jsonb_build_object('max_cost_usd', 0.50, 'max_calls', 4),
      'preview', jsonb_build_object(
        'mode', 'integration_preview',
        'composition', composition,
        'caseId', case_id,
        'workflow', workflow,
        'premises', coalesce(p_activation #> '{brief,premises}', '{}'::jsonb)
      )
    ),
    2
  );

  update public.document_intake_sessions session
  set current_run_id = run_id,
      status = 'processing',
      processing_started_at = now(),
      processing_completed_at = null,
      pipeline_version = v_pipeline_version,
      updated_at = now()
  where session.organization_id = job_row.organization_id and session.id = session_row.id;

  update public.agent_messages message
  set metadata = message.metadata || jsonb_build_object(
        'activation', jsonb_build_object(
          'analysisScope', 'integration_preview',
          'composition', composition,
          'briefId', brief_id,
          'jobId', capital_job_id
        )
      ),
      updated_at = now()
  where message.organization_id = job_row.organization_id and message.id = assistant_message.id;

  update public.agent_conversations conversation
  set state = 'analyzing', updated_at = now()
  where conversation.organization_id = job_row.organization_id
    and conversation.id = source_message.conversation_id;

  return jsonb_build_object(
    'brief_id', brief_id,
    'job_id', capital_job_id,
    'plan_id', plan_row.id,
    'analysis_scope', 'integration_preview',
    'composition', composition,
    'replayed', false
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid_integration_preview_activation' using errcode = '22023';
end;
$$;
