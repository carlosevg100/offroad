-- Connect the persistent advisor conversation to the two released public-information DAGs.
-- Routing remains deterministic in the worker. This command only validates and persists the
-- exact activation chosen there; it cannot select another job, read private documents or widen
-- authority. Recording the assistant response and queueing the DAG share one transaction.

create or replace function private.worker_activate_advisor_specialized_job_v1(
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
  max_cost_usd numeric;
  external_search_max_usd numeric;
  v_pipeline_version text;
  identity_supported boolean;
  website_supported boolean;
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if job_row.kind <> 'agent_operation_brief'
    or jsonb_typeof(p_activation) <> 'object'
    or analysis_scope not in ('company_debt_view', 'origination_thesis')
    or char_length(company_name) not between 2 and 160
    or lower(company_name) in ('empresa', 'companhia', 'company', 'operação', 'operacao', 'captação', 'captacao')
    or jsonb_typeof(brief_content) <> 'object' then
    raise exception 'invalid_advisor_specialized_activation' using errcode = '22023';
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

  if project_row.entry_job <> analysis_scope
    or project_row.access_basis <> 'public_information'
    or session_row.privacy_status <> 'public_information'
    or exists (
      select 1 from public.source_documents document
      where document.organization_id = job_row.organization_id
        and document.intake_session_id = session_row.id
    ) then
    raise exception 'public_specialized_executor_not_allowed' using errcode = '42501';
  end if;

  select plan.* into plan_row
  from public.capital_project_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.capital_project_id = project_row.id
    and plan.status = 'active'
  for share;
  if not found then raise exception 'capital_project_plan_not_available' using errcode = 'P0002'; end if;

  if plan_row.entry_job <> analysis_scope then
    raise exception 'capital_project_plan_scope_mismatch' using errcode = '22023';
  end if;

  identity_supported := lower(trim(coalesce(session_row.company_profile ->> 'name', ''))) = lower(company_name)
    or exists (
      select 1
      from public.agent_messages message
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
      select 1
      from public.agent_messages message
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
    and brief.brief_kind = analysis_scope
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
            'analysisScope', analysis_scope,
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
      'analysis_scope', analysis_scope,
      'replayed', true
    );
  end if;

  if analysis_scope = 'origination_thesis' then
    if char_length(trim(coalesce(brief_content ->> 'meetingContext', ''))) not between 10 and 5000
      or coalesce(char_length(brief_content ->> 'thesisToTest'), 0) > 3000
      or coalesce(char_length(brief_content ->> 'audience'), 0) > 240
      or (brief_content ? 'meetingDate' and brief_content ->> 'meetingDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
      raise exception 'invalid_origination_thesis_activation' using errcode = '22023';
    end if;
    max_cost_usd := 0.75;
    external_search_max_usd := 0.04;
    v_pipeline_version := 'origination-thesis-2026.09.01-v1';
  else
    if coalesce(char_length(brief_content ->> 'focus'), 0) > 3000
      or coalesce(char_length(brief_content ->> 'knownContext'), 0) > 5000 then
      raise exception 'invalid_company_debt_view_activation' using errcode = '22023';
    end if;
    max_cost_usd := 0.95;
    external_search_max_usd := 0.04;
    v_pipeline_version := 'company-debt-view-2026.09.01-v1';
  end if;

  update public.document_intake_sessions session
  set company_profile = jsonb_strip_nulls(
        coalesce(session.company_profile, '{}'::jsonb)
        || jsonb_build_object('name', company_name, 'website', company_website)
      ),
      updated_at = now()
  where session.organization_id = job_row.organization_id and session.id = session_row.id;

  brief_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'capitalProjectId', project_row.id,
    'briefKind', analysis_scope,
    'content', brief_content,
    'sourceMessageId', source_message.id
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

  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.organization_id = job_row.organization_id
    and run.intake_session_id = session_row.id;

  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    run_id, job_row.organization_id, session_row.id, next_run_no, 'manual', 'queued',
    v_pipeline_version,
    jsonb_build_object(
      'maxCalls', 2,
      'maxCostUsd', max_cost_usd,
      'externalSearchMaxUsd', external_search_max_usd
    ),
    jsonb_build_object(
      'planId', plan_row.id,
      'briefId', brief_id,
      'executor', v_pipeline_version,
      'activatedBy', 'advisor_semantic_route_v1'
    ),
    source_message.created_by
  );

  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload, max_attempts
  ) values (
    capital_job_id, job_row.organization_id, run_id, session_row.id, 'capital_project_analysis',
    jsonb_build_object(
      'analysis_scope', analysis_scope,
      'locale', source_message.locale,
      'capital_project_id', project_row.id,
      'capital_project_plan_id', plan_row.id,
      'capital_project_brief_id', brief_id,
      'capital_task_ids', task_ids,
      'capital_artifact_required', true,
      'trigger_event', jsonb_build_object(
        'type', 'advisor_semantic_route',
        'sourceMessageId', source_message.id,
        'assistantMessageId', assistant_message.id
      ),
      'model_budget', jsonb_build_object('max_cost_usd', max_cost_usd, 'max_calls', 2)
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
          'analysisScope', analysis_scope,
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
    'analysis_scope', analysis_scope,
    'replayed', false
  );
end;
$$;

create or replace function private.worker_record_agent_response_and_activate_v1(
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
  recorded := private.worker_record_agent_response(
    p_job_id, p_capability_token, p_assistant_message_id, p_response, p_proposal
  );
  if p_activation is not null then
    activated := private.worker_activate_advisor_specialized_job_v1(
      p_job_id, p_capability_token, p_assistant_message_id, p_activation
    );
  end if;
  return recorded || jsonb_build_object('activation', activated);
end;
$$;

create or replace function public.worker_record_agent_response_and_activate_v1(
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
  select private.worker_record_agent_response_and_activate_v1(
    p_job_id, p_capability_token, p_assistant_message_id,
    p_response, p_proposal, p_activation
  );
$$;

revoke all on function private.worker_activate_advisor_specialized_job_v1(uuid, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function private.worker_record_agent_response_and_activate_v1(uuid, text, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.worker_record_agent_response_and_activate_v1(uuid, text, uuid, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function private.worker_record_agent_response_and_activate_v1(uuid, text, uuid, jsonb, jsonb, jsonb)
  to authenticated;
grant execute on function public.worker_record_agent_response_and_activate_v1(uuid, text, uuid, jsonb, jsonb, jsonb)
  to authenticated;

comment on function public.worker_record_agent_response_and_activate_v1(uuid, text, uuid, jsonb, jsonb, jsonb) is
  'Atomically records one advisor response and, when eligible, queues the exact released public-information TaskSpec DAG in the same project.';
