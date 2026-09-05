-- integration_preview: an internal validation mode that lets methods in the `implemented` rung
-- run end to end inside the product for one granted organization, without promoting them and
-- without exposing them to clients. The grant is an operator decision written here or through
-- the management connection, never through the Data API. Everything the mode produces is marked
-- as preview: the claim carries the flag to the worker, the activation records a preview plan,
-- brief and job, the completion publishes a preview-tagged message, and the web surface reads the
-- flag to show the banner. Nothing in this file changes the released routes.

-- ---------------------------------------------------------------------------------------------
-- 1. The grant
-- ---------------------------------------------------------------------------------------------
create table if not exists private.integration_preview_grants (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  note text check (note is null or char_length(note) <= 500),
  granted_by text not null check (char_length(trim(granted_by)) between 3 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table private.integration_preview_grants is
  'Organizations allowed to run the internal integration_preview mode: methods in the implemented rung execute inside the product for validation only. Written by operators, never through the Data API. The flag never promotes a method and never releases anything to clients.';

revoke all on table private.integration_preview_grants from public, anon, authenticated;

create or replace function private.integration_preview_enabled(p_organization_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.integration_preview_grants grant_row
    where grant_row.organization_id = p_organization_id
      and grant_row.enabled
  );
$$;

revoke all on function private.integration_preview_enabled(uuid) from public, anon, authenticated;

-- What the workspace may know: whether its own organization is in the mode, and the note the
-- operator left. Membership is checked; nothing about other organizations is returned. The public
-- wrapper runs as the caller and delegates to the private definer, as every command here does.
create or replace function private.get_integration_preview_status(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  grant_row private.integration_preview_grants;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = caller_id
      and membership.status = 'active'
  ) then
    return jsonb_build_object('enabled', false, 'note', null);
  end if;
  select grant_row_alias.* into grant_row
  from private.integration_preview_grants grant_row_alias
  where grant_row_alias.organization_id = p_organization_id
    and grant_row_alias.enabled;
  if not found then
    return jsonb_build_object('enabled', false, 'note', null);
  end if;
  return jsonb_build_object('enabled', true, 'note', grant_row.note);
end;
$$;

revoke all on function private.get_integration_preview_status(uuid) from public, anon;
grant execute on function private.get_integration_preview_status(uuid) to authenticated;

create or replace function public.get_integration_preview_status_v1(p_organization_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.get_integration_preview_status(p_organization_id);
$$;

revoke all on function public.get_integration_preview_status_v1(uuid) from public, anon;
grant execute on function public.get_integration_preview_status_v1(uuid) to authenticated;

comment on function public.get_integration_preview_status_v1(uuid) is
  'Whether the caller''s organization runs the internal integration_preview mode. Read by the workspace to show the internal validation banner; it grants nothing.';

-- ---------------------------------------------------------------------------------------------
-- 2. Brief kinds: the preview brief, and the capital planning brief the released DAG already
--    writes but the check constraint never admitted.
-- ---------------------------------------------------------------------------------------------
alter table public.capital_project_briefs
  drop constraint if exists capital_project_briefs_brief_kind_check;
alter table public.capital_project_briefs
  add constraint capital_project_briefs_brief_kind_check
  check (brief_kind in ('origination_thesis', 'company_debt_view', 'capital_planning', 'integration_preview'));

-- ---------------------------------------------------------------------------------------------
-- 3. The claim carries the flag, next to the frozen source pack binding.
-- ---------------------------------------------------------------------------------------------
create or replace function private.worker_claim_job(
  p_worker_token text,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_id uuid := private.worker_identity(p_worker_token);
  lease_seconds integer := least(greatest(coalesce(p_lease_seconds, 600), 60), 3600);
  capability_token text := encode(extensions.gen_random_bytes(32), 'hex');
  job_row public.processing_jobs;
begin
  -- reclaim expired leases as well as fresh jobs, oldest first
  select * into job_row
  from public.processing_jobs
  where (status = 'queued' and available_at <= now())
     or (status = 'leased' and lease_expires_at < now())
  order by available_at
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('claimed', false);
  end if;

  if job_row.attempts + 1 > job_row.max_attempts then
    update public.processing_jobs
    set status = 'poison',
        capability_sha256 = null,
        leased_by = null,
        lease_expires_at = null,
        last_error = coalesce(job_row.last_error, '{}'::jsonb) || jsonb_build_object('reason', 'max_attempts_exceeded')
    where id = job_row.id;

    update public.processing_runs
    set status = 'failed',
        error = jsonb_build_object('reason', 'job_poison', 'job_id', job_row.id),
        completed_at = now()
    where organization_id = job_row.organization_id and id = job_row.processing_run_id;

    return jsonb_build_object('claimed', false, 'poisoned_job_id', job_row.id);
  end if;

  update public.processing_jobs
  set status = 'leased',
      attempts = job_row.attempts + 1,
      leased_by = worker_id,
      lease_expires_at = now() + make_interval(secs => lease_seconds),
      capability_sha256 = extensions.digest(capability_token, 'sha256')
  where id = job_row.id
  returning * into job_row;

  update public.processing_runs
  set status = case when status = 'queued' then 'running' else status end,
      started_at = coalesce(started_at, now())
  where organization_id = job_row.organization_id and id = job_row.processing_run_id;

  return jsonb_build_object(
    'claimed', true,
    'job_id', job_row.id,
    'capability_token', capability_token,
    'lease_expires_at', job_row.lease_expires_at,
    'attempt', job_row.attempts,
    'kind', job_row.kind,
    'organization_id', job_row.organization_id,
    'intake_session_id', job_row.intake_session_id,
    'processing_run_id', job_row.processing_run_id,
    'payload', job_row.payload,
    -- A project bound to a frozen source pack tells the worker to read that pack and nothing else.
    'source_pack_id', (
      select binding.source_pack_id
      from private.gold_case_bindings binding
      join public.document_intake_sessions session
        on session.organization_id = binding.organization_id and session.capital_project_id = binding.capital_project_id
      where session.organization_id = job_row.organization_id and session.id = job_row.intake_session_id
    ),
    -- The organization runs the internal integration_preview mode: implemented methods may execute.
    'integration_preview', private.integration_preview_enabled(job_row.organization_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Activation of a preview run from a conversational turn
-- ---------------------------------------------------------------------------------------------
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
  -- The mode is a grant, not a payload flag: without it the activation stops here.
  if not private.integration_preview_enabled(job_row.organization_id) then
    raise exception 'integration_preview_not_granted' using errcode = '42501';
  end if;
  if composition not in ('prepare_meeting', 'prepare_material', 'change_premise', 'deepen')
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
    jsonb_build_object('maxCalls', 1, 'maxCostUsd', 0.01),
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
      'capital_artifact_required', true,
      'trigger_event', jsonb_build_object(
        'type', 'advisor_semantic_route',
        'mode', 'integration_preview',
        'sourceMessageId', source_message.id,
        'assistantMessageId', assistant_message.id
      ),
      'model_budget', jsonb_build_object('max_cost_usd', 0.01, 'max_calls', 1),
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

revoke all on function private.worker_activate_integration_preview_run_v1(uuid, text, uuid, jsonb)
  from public, anon, authenticated;

-- The dispatcher: a preview activation goes to the preview function, everything else keeps the
-- released path (retry, then the specialized activation).
create or replace function private.worker_record_agent_response_and_activate_v3(
  p_job_id uuid,
  p_capability_token text,
  p_assistant_message_id uuid,
  p_response jsonb,
  p_proposal jsonb default null,
  p_activation jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded jsonb;
  activated jsonb;
begin
  if p_activation is not null and p_activation ->> 'job' = 'integration_preview' then
    recorded := private.worker_record_agent_response(
      p_job_id, p_capability_token, p_assistant_message_id, p_response, p_proposal
    );
    activated := private.worker_activate_integration_preview_run_v1(
      p_job_id, p_capability_token, p_assistant_message_id, p_activation
    );
    return recorded || jsonb_build_object('activation', activated);
  end if;
  return private.worker_record_agent_response_and_activate_v2(
    p_job_id, p_capability_token, p_assistant_message_id, p_response, p_proposal, p_activation
  );
end;
$$;

create or replace function public.worker_record_agent_response_and_activate_v3(
  p_job_id uuid,
  p_capability_token text,
  p_assistant_message_id uuid,
  p_response jsonb,
  p_proposal jsonb default null,
  p_activation jsonb default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_agent_response_and_activate_v3(
    p_job_id, p_capability_token, p_assistant_message_id,
    p_response, p_proposal, p_activation
  );
$$;

revoke all on function private.worker_record_agent_response_and_activate_v3(uuid, text, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.worker_record_agent_response_and_activate_v3(uuid, text, uuid, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function private.worker_record_agent_response_and_activate_v3(uuid, text, uuid, jsonb, jsonb, jsonb)
  to authenticated;
grant execute on function public.worker_record_agent_response_and_activate_v3(uuid, text, uuid, jsonb, jsonb, jsonb)
  to authenticated;

comment on function public.worker_record_agent_response_and_activate_v3(uuid, text, uuid, jsonb, jsonb, jsonb) is
  'Records one advisor response and, when the activation names integration_preview and the organization holds the grant, queues the preview run; otherwise behaves exactly as v2.';

-- ---------------------------------------------------------------------------------------------
-- 5. Completion of a preview run: one preview-tagged message in the conversation
-- ---------------------------------------------------------------------------------------------
create or replace function private.worker_complete_integration_preview_run_v1(
  p_job_id uuid,
  p_capability_token text,
  p_completion_message_id uuid,
  p_artifact_id uuid,
  p_artifact_fingerprint text,
  p_content text,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  source_message public.agent_messages;
  activation_message public.agent_messages;
  artifact_row public.capital_project_artifacts;
  existing_completion public.agent_messages;
  completion_result jsonb;
  trigger_event jsonb := coalesce(job_row.payload -> 'trigger_event', '{}'::jsonb);
  source_message_id uuid;
  activation_message_id uuid;
  was_replayed boolean := false;
begin
  if job_row.kind <> 'capital_project_analysis'
    or job_row.payload ->> 'analysis_scope' <> 'integration_preview'
    or jsonb_typeof(trigger_event) <> 'object'
    or trigger_event ->> 'type' <> 'advisor_semantic_route'
    or p_completion_message_id is null
    or p_artifact_id is null
    or coalesce(p_artifact_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or char_length(trim(coalesce(p_content, ''))) not between 1 and 4000
    or jsonb_typeof(coalesce(p_result, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_integration_preview_completion' using errcode = '22023';
  end if;
  begin
    source_message_id := (trigger_event ->> 'sourceMessageId')::uuid;
    activation_message_id := (trigger_event ->> 'assistantMessageId')::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid_integration_preview_completion_source' using errcode = '22023';
  end;

  select message.* into source_message
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = source_message_id
    and message.role = 'user'
  for update;
  if not found then raise exception 'integration_preview_completion_source_not_found' using errcode = 'P0002'; end if;

  select message.* into activation_message
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = activation_message_id
    and message.role = 'assistant'
    and message.metadata #>> '{activation,analysisScope}' = 'integration_preview'
    and message.metadata #>> '{activation,jobId}' = job_row.id::text
  for update;
  if not found then raise exception 'integration_preview_activation_message_not_found' using errcode = 'P0002'; end if;

  select artifact.* into artifact_row
  from public.capital_project_artifacts artifact
  where artifact.organization_id = job_row.organization_id
    and artifact.id = p_artifact_id
    and artifact.capital_project_id = (job_row.payload ->> 'capital_project_id')::uuid
    and artifact.artifact_fingerprint = p_artifact_fingerprint
    and artifact.processing_job_id = job_row.id;
  if not found then raise exception 'integration_preview_completion_artifact_not_found' using errcode = 'P0002'; end if;

  select message.* into existing_completion
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.metadata ->> 'kind' = 'advisor_specialized_completion'
    and message.metadata ->> 'completionForJobId' = job_row.id::text
  for update;
  if found then
    was_replayed := true;
    if existing_completion.id <> p_completion_message_id
      or existing_completion.metadata #>> '{artifact,id}' <> artifact_row.id::text
      or existing_completion.metadata #>> '{artifact,fingerprint}' <> artifact_row.artifact_fingerprint then
      raise exception 'integration_preview_completion_conflict' using errcode = '23505';
    end if;
  else
    insert into public.agent_messages (
      id, organization_id, conversation_id, intake_session_id, role, status, content,
      locale, reply_to_message_id, metadata, created_by
    ) values (
      p_completion_message_id, job_row.organization_id, source_message.conversation_id,
      job_row.intake_session_id, 'assistant', 'completed', trim(p_content),
      source_message.locale, source_message.id,
      jsonb_build_object(
        'kind', 'advisor_specialized_completion',
        'mode', 'integration_preview',
        'completionForJobId', job_row.id,
        'analysisScope', 'integration_preview',
        'composition', job_row.payload #>> '{preview,composition}',
        'sourceMessageId', source_message.id,
        'activationMessageId', activation_message.id,
        'capitalProjectId', artifact_row.capital_project_id,
        'workView', 'work',
        'artifact', jsonb_build_object(
          'id', artifact_row.id,
          'type', artifact_row.artifact_type,
          'status', artifact_row.status,
          'fingerprint', artifact_row.artifact_fingerprint
        )
      ),
      source_message.created_by
    );
  end if;

  update public.agent_messages message
  set metadata = message.metadata || jsonb_build_object(
        'completion', jsonb_build_object(
          'messageId', p_completion_message_id,
          'artifactId', artifact_row.id,
          'artifactFingerprint', artifact_row.artifact_fingerprint
        )
      ),
      updated_at = now()
  where message.organization_id = job_row.organization_id
    and message.id = activation_message.id;

  completion_result := private.worker_complete_job(
    p_job_id, p_capability_token, coalesce(p_result, '{}'::jsonb)
  );

  update public.agent_conversations conversation
  set state = 'idle', updated_at = now()
  where conversation.organization_id = job_row.organization_id
    and conversation.id = source_message.conversation_id
    and conversation.state = 'analyzing'
    and not exists (
      select 1
      from public.agent_messages pending_message
      where pending_message.organization_id = job_row.organization_id
        and pending_message.conversation_id = source_message.conversation_id
        and pending_message.role = 'user'
        and pending_message.status in ('queued', 'processing')
    );

  return completion_result || jsonb_build_object(
    'completion_message_id', p_completion_message_id,
    'artifact_id', artifact_row.id,
    'analysis_scope', 'integration_preview',
    'replayed', was_replayed
  );
end;
$$;

create or replace function public.worker_complete_integration_preview_run_v1(
  p_job_id uuid,
  p_capability_token text,
  p_completion_message_id uuid,
  p_artifact_id uuid,
  p_artifact_fingerprint text,
  p_content text,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_complete_integration_preview_run_v1(
    p_job_id, p_capability_token, p_completion_message_id, p_artifact_id,
    p_artifact_fingerprint, p_content, p_result
  );
$$;

revoke all on function private.worker_complete_integration_preview_run_v1(uuid, text, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.worker_complete_integration_preview_run_v1(uuid, text, uuid, uuid, text, text, jsonb)
  from public, anon;
grant execute on function private.worker_complete_integration_preview_run_v1(uuid, text, uuid, uuid, text, text, jsonb)
  to authenticated;
grant execute on function public.worker_complete_integration_preview_run_v1(uuid, text, uuid, uuid, text, text, jsonb)
  to authenticated;

comment on function public.worker_complete_integration_preview_run_v1(uuid, text, uuid, uuid, text, text, jsonb) is
  'Publishes the preview-tagged completion of an integration_preview run into the same conversation and finishes the job atomically. Internal validation only; nothing it writes is a release.';

-- ---------------------------------------------------------------------------------------------
-- 6. The context of a preview run. The released loaders bind scope, entry job and brief kind
--    together; a preview run keeps the project's entry job, carries a preview brief and a preview
--    plan, and needs the artifacts already produced by that plan so unchanged nodes replay.
-- ---------------------------------------------------------------------------------------------
create or replace function private.worker_load_capital_project_context_v6(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  project_row public.capital_projects;
  session_row public.document_intake_sessions;
  plan_row public.capital_project_plans;
  brief_row public.capital_project_briefs;
  message_actor uuid;
begin
  if job_row.kind <> 'capital_project_analysis' then
    raise exception 'capital_project_analysis_capability_required' using errcode = '42501';
  end if;
  if job_row.payload ->> 'analysis_scope' <> 'integration_preview' then
    return private.worker_load_capital_project_context_v5(p_job_id, p_capability_token);
  end if;
  if not private.integration_preview_enabled(job_row.organization_id) then
    raise exception 'integration_preview_not_granted' using errcode = '42501';
  end if;

  select project.* into project_row
  from public.capital_projects project
  where project.organization_id = job_row.organization_id
    and project.id::text = job_row.payload ->> 'capital_project_id'
    and project.status <> 'archived';
  if not found then raise exception 'capital_project_not_available' using errcode = 'P0002'; end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.capital_project_id = project_row.id;
  if not found then raise exception 'capital_project_session_not_available' using errcode = 'P0002'; end if;

  select plan.* into plan_row
  from public.capital_project_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.id::text = job_row.payload ->> 'capital_project_plan_id'
    and plan.capital_project_id = project_row.id
    and plan.status = 'active';
  if not found then raise exception 'capital_project_plan_not_available' using errcode = 'P0002'; end if;

  select brief.* into brief_row
  from public.capital_project_briefs brief
  where brief.organization_id = job_row.organization_id
    and brief.id::text = job_row.payload ->> 'capital_project_brief_id'
    and brief.capital_project_id = project_row.id
    and brief.brief_kind = 'integration_preview';
  if not found then raise exception 'capital_project_brief_not_available' using errcode = 'P0002'; end if;

  select run.created_by into message_actor
  from public.processing_runs run
  where run.organization_id = job_row.organization_id
    and run.id = job_row.processing_run_id;

  return jsonb_build_object(
    'mode', 'integration_preview',
    'preview', coalesce(job_row.payload -> 'preview', '{}'::jsonb),
    'project', jsonb_build_object(
      'id', project_row.id, 'organization_id', project_row.organization_id,
      'project_name', project_row.project_name, 'entry_job', project_row.entry_job,
      'access_basis', project_row.access_basis, 'current_phase', project_row.current_phase
    ),
    'session', jsonb_build_object(
      'id', session_row.id, 'locale', session_row.locale,
      'company_profile', session_row.company_profile,
      'privacy_status', session_row.privacy_status,
      'representation_status', session_row.representation_status
    ),
    'brief', jsonb_build_object(
      'id', brief_row.id, 'kind', brief_row.brief_kind,
      'version', brief_row.brief_version, 'content', brief_row.content,
      'content_fingerprint', brief_row.content_fingerprint
    ),
    'plan', jsonb_build_object(
      'id', plan_row.id, 'version', plan_row.plan_version,
      'fingerprint', plan_row.plan_fingerprint,
      'compiler_version', plan_row.compiler_version,
      'registry_version', plan_row.registry_version,
      'snapshot', plan_row.snapshot
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task.task_id, 'ordinal', task.ordinal, 'batch', task.batch_no, 'label', task.label,
        'dependencies', task.dependencies, 'execution_class', task.execution_class,
        'effect', task.effect, 'maturity_at_compile', task.maturity_at_compile
      ) order by task.ordinal)
      from public.capital_project_plan_tasks task
      where task.organization_id = job_row.organization_id and task.plan_id = plan_row.id
    ), '[]'::jsonb),
    -- The latest succeeded artifact of every task of this plan: what a later turn may replay
    -- unchanged, and what the material compilers cite by fingerprint.
    'prior_artifacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'task_id', latest.task_id, 'id', latest.id, 'artifact_type', latest.artifact_type,
        'artifact_version', latest.artifact_version, 'artifact_fingerprint', latest.artifact_fingerprint,
        'input_fingerprint', latest.input_fingerprint, 'status', latest.status,
        'content', latest.content, 'created_at', latest.created_at
      ) order by latest.task_id)
      from (
        select distinct on (plan_task.task_id)
          plan_task.task_id, artifact.id, artifact.artifact_type, artifact.artifact_version,
          artifact.artifact_fingerprint, artifact.input_fingerprint, artifact.status,
          artifact.content, artifact.created_at
        from public.capital_project_artifacts artifact
        join public.capital_project_task_runs run
          on run.organization_id = artifact.organization_id and run.id = artifact.task_run_id
          and run.status = 'succeeded'
        join public.capital_project_plan_tasks plan_task
          on plan_task.organization_id = run.organization_id and plan_task.id = run.plan_task_id
        where artifact.organization_id = job_row.organization_id
          and artifact.capital_project_id = project_row.id
          and artifact.plan_id = plan_row.id
          and artifact.status not in ('stale', 'superseded')
        order by plan_task.task_id, artifact.created_at desc, artifact.id desc
      ) latest
    ), '[]'::jsonb),
    'professional_context', (
      select jsonb_build_object(
        'useForms', to_jsonb(profile.use_forms),
        'professionalRoles', to_jsonb(profile.professional_roles),
        'practiceAreas', to_jsonb(profile.practice_areas),
        'primaryObjectives', to_jsonb(profile.primary_objectives),
        'institutionName', profile.institution_name,
        'disclosureStatus', profile.disclosure_status,
        'lastConfirmedAt', profile.last_confirmed_at
      )
      from public.professional_context_profiles profile
      where profile.organization_id = job_row.organization_id
        and profile.user_id = message_actor
    ),
    'recent_messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id, 'role', recent.role, 'content', recent.content, 'created_at', recent.created_at
      ) order by recent.created_at)
      from (
        select message.id, message.role, message.content, message.created_at
        from public.agent_messages message
        join public.agent_conversations conversation
          on conversation.organization_id = message.organization_id and conversation.id = message.conversation_id
        where message.organization_id = job_row.organization_id
          and conversation.intake_session_id = session_row.id
          and message.status = 'completed'
        order by message.created_at desc
        limit 12
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.worker_load_capital_project_context_v6(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_capital_project_context_v6(p_job_id, p_capability_token);
$$;

revoke all on function private.worker_load_capital_project_context_v6(uuid, text) from public, anon, authenticated;
revoke all on function public.worker_load_capital_project_context_v6(uuid, text) from public, anon;
grant execute on function private.worker_load_capital_project_context_v6(uuid, text) to authenticated;
grant execute on function public.worker_load_capital_project_context_v6(uuid, text) to authenticated;

comment on function public.worker_load_capital_project_context_v6(uuid, text) is
  'Context of a capital project job; for integration_preview runs it carries the preview brief, plan, tasks and the latest artifacts so unchanged nodes replay. Other scopes fall through to v5.';
