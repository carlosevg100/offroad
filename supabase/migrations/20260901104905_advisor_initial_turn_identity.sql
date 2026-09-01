-- The initial project request is identified by its durable message kind, not by creation-time
-- ordering. Multiple messages created within one transaction may share a timestamp.

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
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
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
    and message.metadata ->> 'kind' = 'request'
  order by message.created_at asc, message.id asc
  limit 1
  for update;
  if not found then raise exception 'advisor_initial_message_not_found' using errcode = 'P0002'; end if;

  select job.* into existing_job
  from public.processing_jobs job
  where job.organization_id = project_row.organization_id
    and job.intake_session_id = session_row.id
    and job.kind = 'agent_operation_brief'
    and job.payload ->> 'message_id' = source_message.id::text
  order by job.created_at asc, job.id asc limit 1;
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

comment on function public.queue_advisor_initial_turn_v1(uuid) is
  'Queues the durable request message that created the project; timestamp ordering never selects a later conversation turn.';
