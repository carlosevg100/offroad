-- Complete a chat-activated public DAG and return its governed work product to the same
-- persistent conversation. The artifact, conversation and job are resolved from one exact
-- capability; callers cannot supply an organization, project, plan, session or destination.

create unique index agent_messages_specialized_completion_job_idx
  on public.agent_messages (organization_id, ((metadata ->> 'completionForJobId')))
  where metadata ->> 'kind' = 'advisor_specialized_completion';

create or replace function private.worker_complete_advisor_specialized_job_v1(
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
  expected_artifact_type text;
  source_message_id uuid;
  activation_message_id uuid;
  was_replayed boolean := false;
begin
  if job_row.kind <> 'capital_project_analysis'
    or jsonb_typeof(trigger_event) <> 'object'
    or trigger_event ->> 'type' <> 'advisor_semantic_route'
    or analysis_scope not in ('origination_thesis', 'company_debt_view')
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

  expected_artifact_type := case analysis_scope
    when 'origination_thesis' then 'meeting_brief'
    when 'company_debt_view' then 'company_debt_diagnostic'
  end;

  select artifact.* into artifact_row
  from public.capital_project_artifacts artifact
  where artifact.organization_id = job_row.organization_id
    and artifact.id = p_artifact_id
    and artifact.capital_project_id::text = job_row.payload ->> 'capital_project_id'
    and artifact.plan_id::text = job_row.payload ->> 'capital_project_plan_id'
    and artifact.processing_job_id = job_row.id
    and artifact.artifact_type = expected_artifact_type
    and artifact.artifact_fingerprint = p_artifact_fingerprint
    and artifact.status = 'pending_confirmation'
  for share;
  if not found then
    raise exception 'advisor_specialized_completion_artifact_not_found' using errcode = 'P0002';
  end if;

  if p_result ->> 'capital_project_id' is distinct from artifact_row.capital_project_id::text
    or p_result ->> 'artifact_fingerprint' is distinct from artifact_row.artifact_fingerprint
    or (
      analysis_scope = 'origination_thesis'
      and p_result ->> 'meeting_brief_artifact_id' is distinct from artifact_row.id::text
    )
    or (
      analysis_scope = 'company_debt_view'
      and p_result ->> 'company_debt_diagnostic_artifact_id' is distinct from artifact_row.id::text
    ) then
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

create or replace function public.worker_complete_advisor_specialized_job_v1(
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
  select private.worker_complete_advisor_specialized_job_v1(
    p_job_id, p_capability_token, p_completion_message_id, p_artifact_id,
    p_artifact_fingerprint, p_content, p_result
  );
$$;

revoke all on function private.worker_complete_advisor_specialized_job_v1(
  uuid, text, uuid, uuid, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.worker_complete_advisor_specialized_job_v1(
  uuid, text, uuid, uuid, text, text, jsonb
) from public, anon;
grant execute on function private.worker_complete_advisor_specialized_job_v1(
  uuid, text, uuid, uuid, text, text, jsonb
) to authenticated;
grant execute on function public.worker_complete_advisor_specialized_job_v1(
  uuid, text, uuid, uuid, text, text, jsonb
) to authenticated;

comment on function public.worker_complete_advisor_specialized_job_v1(
  uuid, text, uuid, uuid, text, text, jsonb
) is 'Atomically completes one chat-activated public DAG and publishes its exact governed artifact back to the same persistent conversation.';
