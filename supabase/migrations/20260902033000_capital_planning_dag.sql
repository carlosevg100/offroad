-- Release bounded public capital planning without widening the private case or market graphs.

create or replace function private.worker_activate_advisor_specialized_job_v2(
  p_job_id uuid, p_capability_token text, p_assistant_message_id uuid, p_activation jsonb
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
  analysis_scope text := trim(coalesce(p_activation ->> 'job', ''));
  company_name text := trim(regexp_replace(coalesce(p_activation #>> '{company,name}', ''), '\s+', ' ', 'g'));
  company_website text := nullif(trim(coalesce(p_activation #>> '{company,website}', '')), '');
  brief_content jsonb := coalesce(p_activation -> 'brief', '{}'::jsonb);
  brief_fingerprint text;
  brief_id uuid;
  task_ids jsonb;
  run_id uuid := gen_random_uuid();
  capital_job_id uuid := gen_random_uuid();
  next_run_no integer;
  identity_supported boolean;
  website_supported boolean;
  actor_id uuid := (select auth.uid());
begin
  if analysis_scope <> 'capital_planning' then
    return private.worker_activate_advisor_specialized_job_v1(
      p_job_id, p_capability_token, p_assistant_message_id, p_activation
    );
  end if;
  if actor_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if job_row.kind <> 'agent_operation_brief'
    or jsonb_typeof(p_activation) <> 'object'
    or char_length(company_name) not between 2 and 160
    or lower(company_name) in ('empresa', 'companhia', 'company', 'operação', 'operacao', 'captação', 'captacao')
    or jsonb_typeof(brief_content) <> 'object'
    or char_length(trim(coalesce(brief_content ->> 'capitalIntent', ''))) not between 10 and 5000
    or coalesce(char_length(brief_content ->> 'knownConstraints'), 0) > 3000
    or coalesce(char_length(brief_content ->> 'decisionContext'), 0) > 3000 then
    raise exception 'invalid_capital_planning_activation' using errcode = '22023';
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
  if project_row.entry_job <> 'capital_planning'
    or project_row.access_basis <> 'public_information'
    or session_row.privacy_status <> 'public_information'
    or exists (
      select 1 from public.source_documents document
      where document.organization_id = job_row.organization_id
        and document.intake_session_id = session_row.id
    ) then
    raise exception 'public_capital_planning_executor_not_allowed' using errcode = '42501';
  end if;
  select plan.* into plan_row
  from public.capital_project_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.capital_project_id = project_row.id
    and plan.entry_job = 'capital_planning'
    and plan.status = 'active'
  for share;
  if not found then raise exception 'capital_project_plan_not_available' using errcode = 'P0002'; end if;

  identity_supported := lower(trim(coalesce(session_row.company_profile ->> 'name', ''))) = lower(company_name)
    or exists (
      select 1 from public.agent_messages message
      where message.organization_id = job_row.organization_id
        and message.conversation_id = source_message.conversation_id
        and message.role = 'user'
        and position(lower(company_name) in lower(message.content)) > 0
    );
  if not identity_supported then
    raise exception 'advisor_company_identity_not_user_supported' using errcode = '22023';
  end if;
  website_supported := company_website is null
    or company_website = session_row.company_profile ->> 'website'
    or exists (
      select 1 from public.agent_messages message
      where message.organization_id = job_row.organization_id
        and message.conversation_id = source_message.conversation_id
        and message.role = 'user'
        and position(lower(company_website) in lower(message.content)) > 0
    );
  if company_website is not null
    and (company_website !~ '^https://' or not website_supported) then
    raise exception 'advisor_company_website_not_user_supported' using errcode = '22023';
  end if;

  select brief.* into existing_brief
  from public.capital_project_briefs brief
  where brief.organization_id = job_row.organization_id
    and brief.capital_project_id = project_row.id
    and brief.brief_kind = 'capital_planning'
    and brief.status = 'active'
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
    if not found then raise exception 'capital_project_activation_incomplete' using errcode = '55000'; end if;
    update public.agent_messages message
    set metadata = message.metadata || jsonb_build_object(
          'activation', jsonb_build_object(
            'analysisScope', analysis_scope, 'briefId', existing_brief.id, 'jobId', existing_job.id
          )
        ), updated_at = now()
    where message.organization_id = job_row.organization_id and message.id = assistant_message.id;
    update public.agent_conversations conversation
    set state = case when existing_job.status in ('queued', 'leased') then 'analyzing' else 'idle' end,
        updated_at = now()
    where conversation.organization_id = job_row.organization_id
      and conversation.id = source_message.conversation_id;
    return jsonb_build_object(
      'brief_id', existing_brief.id, 'job_id', existing_job.id,
      'analysis_scope', analysis_scope, 'replayed', true
    );
  end if;

  update public.document_intake_sessions session
  set company_profile = jsonb_strip_nulls(
        coalesce(session.company_profile, '{}'::jsonb)
        || jsonb_build_object('name', company_name, 'website', company_website)
      ), updated_at = now()
  where session.organization_id = job_row.organization_id and session.id = session_row.id;
  brief_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'capitalProjectId', project_row.id, 'briefKind', analysis_scope,
    'content', brief_content, 'sourceMessageId', source_message.id
  )::text, 'utf8'), 'sha256'), 'hex');
  insert into public.capital_project_briefs (
    organization_id, capital_project_id, request_id, brief_kind, brief_version,
    status, content, content_fingerprint, created_by
  ) values (
    job_row.organization_id, project_row.id, source_message.id, analysis_scope, 1,
    'active', brief_content, brief_fingerprint, source_message.created_by
  ) returning id into brief_id;
  select coalesce(jsonb_agg(task.task_id order by task.ordinal), '[]'::jsonb)
  into task_ids
  from public.capital_project_plan_tasks task
  where task.organization_id = job_row.organization_id and task.plan_id = plan_row.id;
  if jsonb_array_length(task_ids) <> 35
    or task_ids ->> 0 <> 'M01'
    or task_ids ->> 34 <> 'S11' then
    raise exception 'capital_planning_plan_invalid' using errcode = '22023';
  end if;
  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.organization_id = job_row.organization_id
    and run.intake_session_id = session_row.id;
  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    run_id, job_row.organization_id, session_row.id, next_run_no, 'manual', 'queued',
    'capital-planning-2026.09.02-v1',
    jsonb_build_object('maxCalls', 2, 'maxCostUsd', 0.95, 'externalSearchMaxUsd', 0.20),
    jsonb_build_object(
      'planId', plan_row.id, 'briefId', brief_id,
      'executor', 'capital-planning-2026.09.02-v1', 'activatedBy', 'advisor_semantic_route_v2'
    ), source_message.created_by
  );
  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload, max_attempts
  ) values (
    capital_job_id, job_row.organization_id, run_id, session_row.id, 'capital_project_analysis',
    jsonb_build_object(
      'analysis_scope', analysis_scope, 'locale', source_message.locale,
      'capital_project_id', project_row.id, 'capital_project_plan_id', plan_row.id,
      'capital_project_brief_id', brief_id, 'capital_task_ids', task_ids,
      'capital_artifact_required', true,
      'trigger_event', jsonb_build_object(
        'type', 'advisor_semantic_route', 'sourceMessageId', source_message.id,
        'assistantMessageId', assistant_message.id
      ), 'model_budget', jsonb_build_object('max_cost_usd', 0.95, 'max_calls', 2)
    ), 2
  );
  update public.document_intake_sessions session
  set current_run_id = run_id, status = 'processing', processing_started_at = now(),
      processing_completed_at = null, pipeline_version = 'capital-planning-2026.09.02-v1',
      updated_at = now()
  where session.organization_id = job_row.organization_id and session.id = session_row.id;
  update public.agent_messages message
  set metadata = message.metadata || jsonb_build_object(
        'activation', jsonb_build_object(
          'analysisScope', analysis_scope, 'briefId', brief_id, 'jobId', capital_job_id
        )
      ), updated_at = now()
  where message.organization_id = job_row.organization_id and message.id = assistant_message.id;
  update public.agent_conversations conversation
  set state = 'analyzing', updated_at = now()
  where conversation.organization_id = job_row.organization_id
    and conversation.id = source_message.conversation_id;
  return jsonb_build_object(
    'brief_id', brief_id, 'job_id', capital_job_id,
    'analysis_scope', analysis_scope, 'replayed', false
  );
end;
$$;

create or replace function private.worker_record_agent_response_and_activate_v2(
  p_job_id uuid, p_capability_token text, p_assistant_message_id uuid,
  p_response jsonb, p_proposal jsonb default null, p_activation jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare recorded jsonb; activated jsonb;
begin
  recorded := private.worker_record_agent_response(
    p_job_id, p_capability_token, p_assistant_message_id, p_response, p_proposal
  );
  if p_activation is not null then
    activated := private.worker_activate_advisor_specialized_job_v2(
      p_job_id, p_capability_token, p_assistant_message_id, p_activation
    );
  end if;
  return recorded || jsonb_build_object('activation', activated);
end;
$$;

create or replace function public.worker_record_agent_response_and_activate_v2(
  p_job_id uuid, p_capability_token text, p_assistant_message_id uuid,
  p_response jsonb, p_proposal jsonb default null, p_activation jsonb default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_agent_response_and_activate_v2(
    p_job_id, p_capability_token, p_assistant_message_id, p_response, p_proposal, p_activation
  );
$$;

create or replace function private.worker_load_capital_project_context_v2(
  p_job_id uuid, p_capability_token text
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
  analysis_scope text := job_row.payload ->> 'analysis_scope';
begin
  if analysis_scope <> 'capital_planning' then
    return private.worker_load_capital_project_context(p_job_id, p_capability_token);
  end if;
  if job_row.kind <> 'capital_project_analysis' then
    raise exception 'capital_project_analysis_capability_required' using errcode = '42501';
  end if;
  select project.* into project_row
  from public.capital_projects project
  where project.organization_id = job_row.organization_id
    and project.id::text = job_row.payload ->> 'capital_project_id'
    and project.entry_job = analysis_scope
    and project.access_basis = 'public_information';
  if not found then raise exception 'capital_project_not_available' using errcode = 'P0002'; end if;
  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.capital_project_id = project_row.id
    and session.privacy_status = 'public_information';
  if not found then raise exception 'capital_project_session_not_available' using errcode = 'P0002'; end if;
  select plan.* into plan_row
  from public.capital_project_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.id::text = job_row.payload ->> 'capital_project_plan_id'
    and plan.capital_project_id = project_row.id
    and plan.entry_job = analysis_scope
    and plan.status = 'active';
  if not found then raise exception 'capital_project_plan_not_available' using errcode = 'P0002'; end if;
  select brief.* into brief_row
  from public.capital_project_briefs brief
  where brief.organization_id = job_row.organization_id
    and brief.id::text = job_row.payload ->> 'capital_project_brief_id'
    and brief.capital_project_id = project_row.id
    and brief.brief_kind = analysis_scope
    and brief.status = 'active';
  if not found then raise exception 'capital_project_brief_not_available' using errcode = 'P0002'; end if;
  return jsonb_build_object(
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
      'registry_version', plan_row.registry_version
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task.task_id, 'ordinal', task.ordinal, 'batch', task.batch_no,
        'dependencies', task.dependencies, 'execution_class', task.execution_class,
        'effect', task.effect
      ) order by task.ordinal)
      from public.capital_project_plan_tasks task
      where task.organization_id = job_row.organization_id and task.plan_id = plan_row.id
    ), '[]'::jsonb),
    'revision', case
      when job_row.payload ? 'revision_of_artifact_id' then (
        select jsonb_build_object(
          'of_artifact_id', previous.id, 'prior_content', previous.content,
          'decision_id', decision.id, 'correction_note', decision.note
        )
        from public.capital_project_artifacts previous
        join public.capital_project_artifact_decisions decision
          on decision.organization_id = previous.organization_id
          and decision.artifact_id = previous.id
        where previous.organization_id = job_row.organization_id
          and previous.id::text = job_row.payload ->> 'revision_of_artifact_id'
          and previous.capital_project_id = project_row.id
          and decision.id::text = job_row.payload ->> 'correction_decision_id'
          and decision.decision = 'request_changes'
      )
      else null
    end,
    'dependency_artifacts', case
      when job_row.payload ? 'revision_of_artifact_id' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'task_id', dependency_task.task_id, 'id', artifact.id,
          'artifact_fingerprint', artifact.artifact_fingerprint,
          'content', artifact.content, 'evidence_refs', artifact.evidence_refs
        ) order by dependency_task.task_id)
        from public.capital_project_artifacts artifact
        join public.capital_project_task_runs dependency_run
          on dependency_run.organization_id = artifact.organization_id
          and dependency_run.id = artifact.task_run_id
          and dependency_run.status = 'succeeded'
        join public.capital_project_plan_tasks dependency_task
          on dependency_task.organization_id = dependency_run.organization_id
          and dependency_task.id = dependency_run.plan_task_id
        where artifact.organization_id = job_row.organization_id
          and artifact.capital_project_id = project_row.id
          and artifact.plan_id = plan_row.id
          and artifact.status not in ('stale', 'superseded')
          and dependency_task.task_id = any(array['C11','S10']::text[])
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  );
end;
$$;

create or replace function public.worker_load_capital_project_context_v2(
  p_job_id uuid, p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_capital_project_context_v2(p_job_id, p_capability_token);
$$;

create or replace function private.request_capital_planning_revision_v1(
  p_artifact_id uuid, p_artifact_fingerprint text, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_note text := nullif(trim(coalesce(p_note, '')), '');
  artifact_row public.capital_project_artifacts;
  existing_decision public.capital_project_artifact_decisions;
  v_decision_id uuid;
  v_session_id uuid;
  v_run_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
  next_run_no integer;
begin
  if caller_id is null
    or coalesce(p_artifact_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(normalized_note, '')) not between 2 and 5000 then
    raise exception 'capital_planning_revision_invalid' using errcode = '22023';
  end if;

  select decision.* into existing_decision
  from public.capital_project_artifact_decisions decision
  join public.organization_memberships membership
    on membership.organization_id = decision.organization_id
  join public.capital_projects project
    on project.organization_id = decision.organization_id
    and project.id = decision.capital_project_id
  where decision.artifact_id = p_artifact_id
    and decision.artifact_fingerprint = p_artifact_fingerprint
    and decision.decision = 'request_changes'
    and decision.note = normalized_note
    and project.entry_job = 'capital_planning'
    and membership.user_id = caller_id
    and membership.status = 'active';
  if found then
    select job.id into v_job_id
    from public.processing_jobs job
    where job.organization_id = existing_decision.organization_id
      and job.kind = 'capital_project_analysis'
      and job.payload ->> 'correction_decision_id' = existing_decision.id::text
    order by job.created_at desc limit 1;
    return jsonb_build_object(
      'decision_id', existing_decision.id, 'job_id', v_job_id, 'replayed', true
    );
  end if;

  select artifact.* into artifact_row
  from public.capital_project_artifacts artifact
  join public.capital_projects project
    on project.organization_id = artifact.organization_id
    and project.id = artifact.capital_project_id
  join public.organization_memberships membership
    on membership.organization_id = artifact.organization_id
  where artifact.id = p_artifact_id
    and artifact.artifact_fingerprint = p_artifact_fingerprint
    and artifact.artifact_type = 'alternative_map'
    and artifact.status = 'pending_confirmation'
    and project.entry_job = 'capital_planning'
    and project.access_basis = 'public_information'
    and membership.user_id = caller_id
    and membership.status = 'active'
  for update of artifact;
  if not found then
    raise exception 'capital_planning_revision_artifact_not_available' using errcode = 'P0002';
  end if;

  select session.id into v_session_id
  from public.document_intake_sessions session
  where session.organization_id = artifact_row.organization_id
    and session.capital_project_id = artifact_row.capital_project_id;

  v_decision_id := private.decide_capital_project_artifact(
    p_artifact_id, p_artifact_fingerprint, 'request_changes', normalized_note
  );
  update public.capital_project_task_runs task_run
  set status = 'invalidated', completed_at = now()
  where task_run.organization_id = artifact_row.organization_id
    and task_run.id = artifact_row.task_run_id
    and task_run.status = 'succeeded';
  if not found then
    raise exception 'capital_planning_revision_task_not_invalidateable' using errcode = '55000';
  end if;

  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.organization_id = artifact_row.organization_id
    and run.intake_session_id = v_session_id;
  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    v_run_id, artifact_row.organization_id, v_session_id, next_run_no, 'manual', 'queued',
    'capital-planning-revision-2026.09.02-v1',
    jsonb_build_object('maxCalls', 1, 'maxCostUsd', 0.80, 'externalSearchMaxUsd', 0),
    jsonb_build_object(
      'planId', artifact_row.plan_id, 'revisionOfArtifactId', artifact_row.id,
      'correctionDecisionId', v_decision_id, 'executor', 'capital-planning-2026.09.02-v1'
    ), caller_id
  );
  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload, max_attempts
  ) values (
    v_job_id, artifact_row.organization_id, v_run_id, v_session_id,
    'capital_project_analysis', jsonb_build_object(
      'analysis_scope', 'capital_planning',
      'locale', (select locale from public.document_intake_sessions where id = v_session_id),
      'capital_project_id', artifact_row.capital_project_id,
      'capital_project_plan_id', artifact_row.plan_id,
      'capital_project_brief_id', (
        select brief.id from public.capital_project_briefs brief
        where brief.organization_id = artifact_row.organization_id
          and brief.capital_project_id = artifact_row.capital_project_id
          and brief.brief_kind = 'capital_planning'
          and brief.status = 'active'
      ),
      'capital_task_ids', jsonb_build_array('S11'),
      'capital_artifact_required', true,
      'revision_of_artifact_id', artifact_row.id,
      'correction_decision_id', v_decision_id,
      'trigger_event', jsonb_build_object(
        'type', 'artifact_correction_requested',
        'artifactId', artifact_row.id, 'decisionId', v_decision_id
      ),
      'model_budget', jsonb_build_object('max_cost_usd', 0.80, 'max_calls', 1)
    ), 2
  );
  update public.document_intake_sessions session
  set current_run_id = v_run_id, status = 'processing', processing_started_at = now(),
      processing_completed_at = null,
      pipeline_version = 'capital-planning-revision-2026.09.02-v1', updated_at = now()
  where session.organization_id = artifact_row.organization_id and session.id = v_session_id;
  return jsonb_build_object(
    'decision_id', v_decision_id, 'job_id', v_job_id, 'replayed', false
  );
end;
$$;

create or replace function public.request_capital_planning_revision_v1(
  p_artifact_id uuid, p_artifact_fingerprint text, p_note text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.request_capital_planning_revision_v1(
    p_artifact_id, p_artifact_fingerprint, p_note
  );
$$;

create or replace function private.worker_complete_advisor_specialized_job_v2(
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
  analysis_scope text := job_row.payload ->> 'analysis_scope';
  source_message_id uuid;
  activation_message_id uuid;
  was_replayed boolean := false;
begin
  if analysis_scope <> 'capital_planning' then
    return private.worker_complete_advisor_specialized_job_v1(
      p_job_id, p_capability_token, p_completion_message_id, p_artifact_id,
      p_artifact_fingerprint, p_content, p_result
    );
  end if;
  if job_row.kind <> 'capital_project_analysis'
    or jsonb_typeof(trigger_event) <> 'object'
    or trigger_event ->> 'type' <> 'advisor_semantic_route'
    or p_completion_message_id is null
    or p_artifact_id is null
    or coalesce(p_artifact_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or char_length(trim(coalesce(p_content, ''))) not between 1 and 4000
    or coalesce(jsonb_typeof(p_result), 'null') <> 'object' then
    raise exception 'invalid_advisor_specialized_completion' using errcode = '22023';
  end if;

  begin
    source_message_id := (trigger_event ->> 'sourceMessageId')::uuid;
    activation_message_id := (trigger_event ->> 'assistantMessageId')::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid_advisor_specialized_completion_source' using errcode = '22023';
  end;

  select message.* into source_message
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = source_message_id
    and message.intake_session_id = job_row.intake_session_id
    and message.role = 'user'
    and message.status = 'completed'
  for share;
  if not found then
    raise exception 'advisor_specialized_completion_source_not_found' using errcode = 'P0002';
  end if;

  select message.* into activation_message
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = activation_message_id
    and message.conversation_id = source_message.conversation_id
    and message.intake_session_id = job_row.intake_session_id
    and message.role = 'assistant'
    and message.reply_to_message_id = source_message.id
    and message.metadata #>> '{activation,jobId}' = job_row.id::text
    and message.metadata #>> '{activation,analysisScope}' = analysis_scope
  for update;
  if not found then
    raise exception 'advisor_specialized_activation_message_not_found' using errcode = 'P0002';
  end if;

  select artifact.* into artifact_row
  from public.capital_project_artifacts artifact
  where artifact.organization_id = job_row.organization_id
    and artifact.id = p_artifact_id
    and artifact.capital_project_id::text = job_row.payload ->> 'capital_project_id'
    and artifact.plan_id::text = job_row.payload ->> 'capital_project_plan_id'
    and artifact.processing_job_id = job_row.id
    and artifact.artifact_type = 'alternative_map'
    and artifact.artifact_fingerprint = p_artifact_fingerprint
    and artifact.status = 'pending_confirmation'
  for share;
  if not found then
    raise exception 'advisor_specialized_completion_artifact_not_found' using errcode = 'P0002';
  end if;

  if p_result ->> 'capital_project_id' is distinct from artifact_row.capital_project_id::text
    or p_result ->> 'artifact_fingerprint' is distinct from artifact_row.artifact_fingerprint
    or p_result ->> 'alternative_map_artifact_id' is distinct from artifact_row.id::text then
    raise exception 'advisor_specialized_completion_result_mismatch' using errcode = '22023';
  end if;

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
      raise exception 'advisor_specialized_completion_conflict' using errcode = '23505';
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
        'completionForJobId', job_row.id,
        'analysisScope', analysis_scope,
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
    'analysis_scope', analysis_scope,
    'replayed', was_replayed
  );
end;
$$;

create or replace function public.worker_complete_advisor_specialized_job_v2(
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
  select private.worker_complete_advisor_specialized_job_v2(
    p_job_id, p_capability_token, p_completion_message_id, p_artifact_id,
    p_artifact_fingerprint, p_content, p_result
  );
$$;

revoke all on function private.worker_activate_advisor_specialized_job_v2(
  uuid, text, uuid, jsonb
) from public, anon, authenticated;
revoke all on function private.worker_record_agent_response_and_activate_v2(
  uuid, text, uuid, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.worker_record_agent_response_and_activate_v2(
  uuid, text, uuid, jsonb, jsonb, jsonb
) from public, anon;
revoke all on function private.worker_load_capital_project_context_v2(
  uuid, text
) from public, anon, authenticated;
revoke all on function public.worker_load_capital_project_context_v2(
  uuid, text
) from public, anon;
revoke all on function private.worker_complete_advisor_specialized_job_v2(
  uuid, text, uuid, uuid, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.worker_complete_advisor_specialized_job_v2(
  uuid, text, uuid, uuid, text, text, jsonb
) from public, anon;
revoke all on function private.request_capital_planning_revision_v1(
  uuid, text, text
) from public, anon, authenticated;
revoke all on function public.request_capital_planning_revision_v1(
  uuid, text, text
) from public, anon;

grant execute on function private.worker_record_agent_response_and_activate_v2(
  uuid, text, uuid, jsonb, jsonb, jsonb
) to authenticated;
grant execute on function public.worker_record_agent_response_and_activate_v2(
  uuid, text, uuid, jsonb, jsonb, jsonb
) to authenticated;
grant execute on function private.worker_load_capital_project_context_v2(
  uuid, text
) to authenticated;
grant execute on function public.worker_load_capital_project_context_v2(
  uuid, text
) to authenticated;
grant execute on function private.worker_complete_advisor_specialized_job_v2(
  uuid, text, uuid, uuid, text, text, jsonb
) to authenticated;
grant execute on function public.worker_complete_advisor_specialized_job_v2(
  uuid, text, uuid, uuid, text, text, jsonb
) to authenticated;
grant execute on function private.request_capital_planning_revision_v1(
  uuid, text, text
) to authenticated;
grant execute on function public.request_capital_planning_revision_v1(
  uuid, text, text
) to authenticated;

comment on function public.worker_record_agent_response_and_activate_v2(
  uuid, text, uuid, jsonb, jsonb, jsonb
) is 'Records an advisor answer and atomically activates a governed specialized DAG, including public capital planning.';
comment on function public.worker_load_capital_project_context_v2(uuid, text)
  is 'Loads the capability-scoped context for public capital planning while preserving existing specialized DAG behavior.';
comment on function public.worker_complete_advisor_specialized_job_v2(
  uuid, text, uuid, uuid, text, text, jsonb
) is 'Completes a specialized advisor DAG and publishes only its exact governed artifact to the originating conversation.';
comment on function public.request_capital_planning_revision_v1(uuid, text, text)
  is 'Records a correction against an exact alternatives map and queues only S11, reusing its governed dependencies without new public research.';
