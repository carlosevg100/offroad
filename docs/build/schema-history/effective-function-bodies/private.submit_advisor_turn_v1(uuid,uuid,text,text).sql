CREATE OR REPLACE FUNCTION private.submit_advisor_turn_v1(p_project_id uuid, p_message_id uuid, p_locale text, p_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 perform private.require_resource_access_v1(p_project_id,'work');
 if not exists(select 1 from public.document_intake_sessions where capital_project_id=p_project_id) then
  return private.append_work_turn_v1(p_project_id,p_message_id,p_locale,p_content);
 end if;
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
    if existing_message.work_id is distinct from p_project_id then raise exception 'advisor_message_work_mismatch' using errcode='42501'; end if;
    if existing_message.content is distinct from normalized_content or existing_message.locale is distinct from p_locale then raise exception 'advisor_message_replay_conflict' using errcode='22023'; end if;
    return jsonb_build_object(
      'message_id', existing_message.id,
      'conversation_id', existing_message.conversation_id,
      'status', existing_message.status,
      'replayed', true
    );
  end if;

  perform 1 from public.document_intake_sessions approval_session
      join public.organization_memberships approval_member on approval_member.organization_id=approval_session.organization_id
      where approval_session.capital_project_id=p_project_id and approval_member.user_id=auth.uid() and approval_member.status='active'
      order by approval_session.id for update of approval_session;
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
$function$
