-- Turn the durable project transcript into an asynchronous advisor surface. A turn queues one
-- bounded worker job and returns immediately; the worker receives only the current project's
-- scoped context. No turn mutates evidence, authorizes distribution or claims representation.

create or replace function private.submit_advisor_turn_v1(
  p_project_id uuid,
  p_message_id uuid,
  p_locale text,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  project_row public.capital_projects;
  session_row public.document_intake_sessions;
  conversation_row public.agent_conversations;
  existing_message public.agent_messages;
  normalized_content text := trim(coalesce(p_content, ''));
  run_id uuid := gen_random_uuid();
  next_run_no integer;
  job_id uuid := gen_random_uuid();
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_message_id is null
    or p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_content) not between 1 and 8000 then
    raise exception 'invalid_advisor_message' using errcode = '22023';
  end if;

  select message.* into existing_message
  from public.agent_messages message
  where message.id = p_message_id and message.created_by = caller_id;
  if found then
    return jsonb_build_object(
      'message_id', existing_message.id,
      'conversation_id', existing_message.conversation_id,
      'status', existing_message.status,
      'replayed', true
    );
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

  select session.* into strict session_row
  from public.document_intake_sessions session
  where session.organization_id = project_row.organization_id
    and session.capital_project_id = project_row.id
  order by session.created_at asc
  limit 1;

  select conversation.* into conversation_row
  from public.agent_conversations conversation
  where conversation.organization_id = project_row.organization_id
    and conversation.intake_session_id = session_row.id
  for update;
  if not found then
    insert into public.agent_conversations (
      organization_id, intake_session_id, state, created_by
    ) values (
      project_row.organization_id, session_row.id, 'idle', caller_id
    ) returning * into conversation_row;
  end if;

  if exists (
    select 1 from public.agent_messages message
    where message.organization_id = project_row.organization_id
      and message.conversation_id = conversation_row.id
      and message.role = 'user'
      and message.status in ('queued', 'processing')
  ) then
    raise exception 'advisor_message_in_progress' using errcode = '55000';
  end if;

  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.organization_id = project_row.organization_id
    and run.intake_session_id = session_row.id;

  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    run_id, project_row.organization_id, session_row.id, next_run_no,
    'answer', 'queued', 'advisor-conversation-2026.09.01-v1',
    jsonb_build_object('maxCalls', 1, 'maxCostUsd', 0.25),
    jsonb_build_object('agentContract', 'advisor-conversation-2026.09.01-v1'),
    caller_id
  );

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status,
    content, locale, metadata, created_by
  ) values (
    p_message_id, project_row.organization_id, conversation_row.id, session_row.id,
    'user', 'queued', normalized_content, p_locale,
    jsonb_build_object('kind', 'message', 'projectId', project_row.id), caller_id
  );

  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload,
    max_attempts
  ) values (
    job_id, project_row.organization_id, run_id, session_row.id,
    'agent_operation_brief',
    jsonb_build_object('message_id', p_message_id, 'locale', p_locale, 'surface', 'project_workspace'),
    2
  );

  update public.agent_conversations
  set state = 'analyzing', updated_at = now()
  where organization_id = project_row.organization_id and id = conversation_row.id;
  update public.capital_projects
  set updated_at = now()
  where organization_id = project_row.organization_id and id = project_row.id;

  return jsonb_build_object(
    'message_id', p_message_id,
    'conversation_id', conversation_row.id,
    'job_id', job_id,
    'status', 'queued',
    'replayed', false
  );
end;
$$;

create or replace function public.submit_advisor_turn_v1(
  p_project_id uuid,
  p_message_id uuid,
  p_locale text,
  p_content text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.submit_advisor_turn_v1(p_project_id, p_message_id, p_locale, p_content);
$$;

revoke all on function private.submit_advisor_turn_v1(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.submit_advisor_turn_v1(uuid, uuid, text, text)
  from public, anon;
grant execute on function private.submit_advisor_turn_v1(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.submit_advisor_turn_v1(uuid, uuid, text, text)
  to authenticated;

-- Queue the very first project request after the shell exists. The deterministic placeholder is
-- removed before it can become durable product output; if queueing is unavailable, the shell
-- remains usable and the placeholder continues to explain the next action.
create or replace function private.queue_advisor_initial_turn_v1(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  project_row public.capital_projects;
  session_row public.document_intake_sessions;
  source_message public.agent_messages;
  existing_job public.processing_jobs;
  run_id uuid := gen_random_uuid();
  next_run_no integer;
  job_id uuid := gen_random_uuid();
begin
  select project.* into project_row
  from public.capital_projects project
  join public.organization_memberships membership
    on membership.organization_id = project.organization_id
  where project.id = p_project_id
    and membership.user_id = caller_id
    and membership.status = 'active'
    and project.status <> 'archived'
  for update of project;
  if not found then raise exception 'capital_project_not_found' using errcode = 'P0002'; end if;

  select session.* into strict session_row
  from public.document_intake_sessions session
  where session.organization_id = project_row.organization_id
    and session.capital_project_id = project_row.id
  order by session.created_at asc limit 1;

  select message.* into source_message
  from public.agent_messages message
  where message.organization_id = project_row.organization_id
    and message.intake_session_id = session_row.id
    and message.role = 'user'
  order by message.created_at asc limit 1
  for update;
  if not found then raise exception 'advisor_initial_message_not_found' using errcode = 'P0002'; end if;

  select job.* into existing_job
  from public.processing_jobs job
  where job.organization_id = project_row.organization_id
    and job.intake_session_id = session_row.id
    and job.kind = 'agent_operation_brief'
    and job.payload ->> 'message_id' = source_message.id::text
  order by job.created_at asc limit 1;
  if found then
    return jsonb_build_object('message_id', source_message.id, 'job_id', existing_job.id, 'replayed', true);
  end if;

  if source_message.status <> 'completed' then
    raise exception 'advisor_initial_message_not_queueable' using errcode = '55000';
  end if;

  delete from public.agent_messages message
  where message.organization_id = project_row.organization_id
    and message.intake_session_id = session_row.id
    and message.role = 'assistant'
    and message.reply_to_message_id = source_message.id
    and message.metadata ->> 'kind' = 'guidance';

  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.organization_id = project_row.organization_id
    and run.intake_session_id = session_row.id;

  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    run_id, project_row.organization_id, session_row.id, next_run_no,
    'manual', 'queued', 'advisor-conversation-2026.09.01-v1',
    jsonb_build_object('maxCalls', 1, 'maxCostUsd', 0.25),
    jsonb_build_object('agentContract', 'advisor-conversation-2026.09.01-v1'),
    caller_id
  );

  update public.agent_messages
  set status = 'queued', updated_at = now()
  where organization_id = project_row.organization_id and id = source_message.id;

  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload,
    max_attempts
  ) values (
    job_id, project_row.organization_id, run_id, session_row.id,
    'agent_operation_brief',
    jsonb_build_object('message_id', source_message.id, 'locale', source_message.locale, 'surface', 'project_workspace'),
    2
  );

  update public.agent_conversations
  set state = 'analyzing', updated_at = now()
  where organization_id = project_row.organization_id
    and intake_session_id = session_row.id;

  return jsonb_build_object('message_id', source_message.id, 'job_id', job_id, 'replayed', false);
end;
$$;

create or replace function public.queue_advisor_initial_turn_v1(p_project_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.queue_advisor_initial_turn_v1(p_project_id); $$;

revoke all on function private.queue_advisor_initial_turn_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.queue_advisor_initial_turn_v1(uuid)
  from public, anon;
grant execute on function private.queue_advisor_initial_turn_v1(uuid) to authenticated;
grant execute on function public.queue_advisor_initial_turn_v1(uuid) to authenticated;

-- Expand the worker's read-only turn context. Project memory and evidence stay tenant-scoped by
-- the claimed job capability; full document contents and lender data are deliberately absent.
create or replace function private.worker_load_agent_context(
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
  session_row public.document_intake_sessions;
  project_row public.capital_projects;
  message_row public.agent_messages;
  manifest_id uuid;
begin
  if job_row.kind <> 'agent_operation_brief' then
    raise exception 'agent_operation_brief_capability_required' using errcode = '42501';
  end if;
  select * into session_row from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id and session.id = job_row.intake_session_id;
  if session_row.capital_project_id is not null then
    select * into project_row from public.capital_projects project
    where project.organization_id = job_row.organization_id
      and project.id = session_row.capital_project_id;
  end if;
  select * into message_row from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = (job_row.payload ->> 'message_id')::uuid
    and message.role = 'user'
  for update;
  if not found then raise exception 'agent_source_message_not_found' using errcode = 'P0002'; end if;

  update public.agent_messages set status = 'processing'
  where organization_id = job_row.organization_id and id = message_row.id and status = 'queued';
  begin
    manifest_id := nullif(session_row.result_summary #>> '{case_manifest,id}', '')::uuid;
  exception when invalid_text_representation then manifest_id := null;
  end;

  return jsonb_build_object(
    'session_id', session_row.id,
    'message_id', message_row.id,
    'locale', message_row.locale,
    'message', message_row.content,
    'brief', private.agent_operation_brief_snapshot(session_row),
    'snapshot_fingerprint', private.agent_snapshot_fingerprint(session_row),
    'projection_updated_at', session_row.updated_at,
    'manifest_id', manifest_id,
    'project', case when project_row.id is null then null else jsonb_build_object(
      'id', project_row.id,
      'name', project_row.project_name,
      'entryJob', project_row.entry_job,
      'accessBasis', project_row.access_basis,
      'phase', project_row.current_phase,
      'status', project_row.status
    ) end,
    'company_profile', coalesce(session_row.company_profile, '{}'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', document.id,
        'name', document.original_name,
        'kind', profile.document_kind,
        'status', document.processing_status
      ) order by document.created_at)
      from public.source_documents document
      left join lateral (
        select document_profile.document_kind
        from public.document_profiles document_profile
        where document_profile.organization_id = document.organization_id
          and document_profile.source_document_id = document.id
        order by document_profile.document_version desc
        limit 1
      ) profile on true
      where document.organization_id = job_row.organization_id
        and document.intake_session_id = session_row.id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'taskId', task.task_id,
        'label', task.label,
        'ordinal', task.ordinal,
        'status', coalesce(run.status, 'waiting')
      ) order by task.ordinal)
      from public.capital_project_plans plan
      join public.capital_project_plan_tasks task
        on task.organization_id = plan.organization_id and task.plan_id = plan.id
      left join lateral (
        select task_run.status
        from public.capital_project_task_runs task_run
        where task_run.organization_id = task.organization_id
          and task_run.plan_id = task.plan_id
          and task_run.plan_task_id = task.id
        order by task_run.attempt_no desc limit 1
      ) run on true
      where plan.organization_id = job_row.organization_id
        and plan.capital_project_id = session_row.capital_project_id
        and plan.status = 'active'
    ), '[]'::jsonb),
    'artifacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', artifact.id,
        'type', artifact.artifact_type,
        'version', artifact.artifact_version,
        'status', artifact.status
      ) order by artifact.created_at desc)
      from public.capital_project_artifacts artifact
      where artifact.organization_id = job_row.organization_id
        and artifact.capital_project_id = session_row.capital_project_id
    ), '[]'::jsonb),
    'recent_messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'role', recent.role,
        'content', recent.content,
        'created_at', recent.created_at
      ) order by recent.created_at)
      from (
        select message.id, message.role, message.content, message.created_at
        from public.agent_messages message
        where message.organization_id = job_row.organization_id
          and message.conversation_id = message_row.conversation_id
          and message.id <> message_row.id
          and message.status = 'completed'
        order by message.created_at desc limit 12
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.submit_advisor_turn_v1(uuid, uuid, text, text) is
  'Queues one bounded advisor response in the durable project conversation without mutating case evidence or external authority.';
comment on function public.queue_advisor_initial_turn_v1(uuid) is
  'Queues the first persisted project request for asynchronous interpretation after the project shell has been created.';
