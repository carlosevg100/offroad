-- A natural-language correction in the project composer must enter the same governed revision
-- rail as the explicit artifact form. The command keeps the user turn, revision decision, job,
-- activation acknowledgement and eventual completion message in one conversation and one
-- transaction. It never treats a chat message as approval or external authorization.

create or replace function private.submit_advisor_artifact_revision_turn_v1(
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
  normalized_content text := trim(coalesce(p_content, ''));
  project_row public.capital_projects;
  session_row public.document_intake_sessions;
  conversation_row public.agent_conversations;
  artifact_row public.capital_project_artifacts;
  existing_message public.agent_messages;
  assistant_message_id uuid := gen_random_uuid();
  expected_artifact_type text;
  analysis_scope text;
  revision_result jsonb;
  revision_job_id uuid;
  assistant_copy text;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_message_id is null
    or p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_content) not between 2 and 5000 then
    raise exception 'invalid_advisor_artifact_revision' using errcode = '22023';
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
    and project.access_basis = 'public_information'
    and project.entry_job in ('origination_thesis', 'company_debt_view', 'capital_planning')
  for update of project;
  if not found then
    raise exception 'capital_project_not_found' using errcode = 'P0002';
  end if;

  analysis_scope := project_row.entry_job;
  expected_artifact_type := case project_row.entry_job
    when 'origination_thesis' then 'meeting_brief'
    when 'company_debt_view' then 'company_debt_diagnostic'
    when 'capital_planning' then 'alternative_map'
  end;

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

  select artifact.* into artifact_row
  from public.capital_project_artifacts artifact
  where artifact.organization_id = project_row.organization_id
    and artifact.capital_project_id = project_row.id
    and artifact.artifact_type = expected_artifact_type
    and artifact.status = 'pending_confirmation'
  order by artifact.created_at desc
  limit 1
  for update;
  if not found then
    raise exception 'advisor_revision_artifact_not_available' using errcode = 'P0002';
  end if;

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status,
    content, locale, metadata, created_by
  ) values (
    p_message_id, project_row.organization_id, conversation_row.id, session_row.id,
    'user', 'completed', normalized_content, p_locale,
    jsonb_build_object(
      'kind', 'artifact_revision_request',
      'projectId', project_row.id,
      'artifactId', artifact_row.id,
      'artifactFingerprint', artifact_row.artifact_fingerprint,
      'analysisScope', analysis_scope
    ),
    caller_id
  );

  revision_result := case project_row.entry_job
    when 'origination_thesis' then private.request_origination_thesis_revision_v1(
      artifact_row.id, artifact_row.artifact_fingerprint, normalized_content
    )
    when 'company_debt_view' then private.request_company_debt_view_revision_v1(
      artifact_row.id, artifact_row.artifact_fingerprint, normalized_content
    )
    when 'capital_planning' then private.request_capital_planning_revision_v1(
      artifact_row.id, artifact_row.artifact_fingerprint, normalized_content
    )
  end;
  revision_job_id := (revision_result ->> 'job_id')::uuid;
  if revision_job_id is null then
    raise exception 'advisor_revision_job_not_created' using errcode = '55000';
  end if;

  assistant_copy := case when p_locale = 'en-US' then
    'I understood the adjustment. I will deepen the analysis from the work already completed, preserve its evidence, and show clearly what changed, what remains valid, and what still depends on additional information.'
  else
    'Entendi o ajuste. Vou aprofundar a análise a partir do trabalho já concluído, preservar as evidências e mostrar com clareza o que mudou, o que continua válido e o que ainda depende de informação adicional.'
  end;

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status,
    content, locale, reply_to_message_id, metadata, created_by
  ) values (
    assistant_message_id, project_row.organization_id, conversation_row.id, session_row.id,
    'assistant', 'completed', assistant_copy, p_locale, p_message_id,
    jsonb_build_object(
      'kind', 'advisor_revision_started',
      'activation', jsonb_build_object(
        'analysisScope', analysis_scope,
        'jobId', revision_job_id,
        'revisionOfArtifactId', artifact_row.id
      )
    ),
    caller_id
  );

  update public.processing_jobs job
  set payload = job.payload || jsonb_build_object(
        'message_id', p_message_id,
        'trigger_event', jsonb_build_object(
          'type', 'advisor_semantic_route',
          'sourceMessageId', p_message_id,
          'assistantMessageId', assistant_message_id,
          'revisionOfArtifactId', artifact_row.id,
          'correctionDecisionId', revision_result ->> 'decision_id'
        )
      ),
      updated_at = now()
  where job.organization_id = project_row.organization_id
    and job.id = revision_job_id
    and job.kind = 'capital_project_analysis';
  if not found then
    raise exception 'advisor_revision_job_not_available' using errcode = 'P0002';
  end if;

  update public.agent_conversations conversation
  set state = 'analyzing', updated_at = now()
  where conversation.organization_id = project_row.organization_id
    and conversation.id = conversation_row.id;

  update public.capital_projects project
  set updated_at = now()
  where project.organization_id = project_row.organization_id
    and project.id = project_row.id;

  return jsonb_build_object(
    'message_id', p_message_id,
    'assistant_message_id', assistant_message_id,
    'conversation_id', conversation_row.id,
    'artifact_id', artifact_row.id,
    'decision_id', revision_result ->> 'decision_id',
    'job_id', revision_job_id,
    'analysis_scope', analysis_scope,
    'status', 'queued',
    'replayed', false
  );
end;
$$;

create or replace function public.submit_advisor_artifact_revision_turn_v1(
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
  select private.submit_advisor_artifact_revision_turn_v1(
    p_project_id, p_message_id, p_locale, p_content
  );
$$;

revoke all on function private.submit_advisor_artifact_revision_turn_v1(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.submit_advisor_artifact_revision_turn_v1(uuid, uuid, text, text)
  from public, anon;
grant execute on function private.submit_advisor_artifact_revision_turn_v1(uuid, uuid, text, text)
  to authenticated;
grant execute on function public.submit_advisor_artifact_revision_turn_v1(uuid, uuid, text, text)
  to authenticated;

comment on function public.submit_advisor_artifact_revision_turn_v1(uuid, uuid, text, text) is
  'Records an explicit conversational work-product revision and queues the matching governed public executor without routing the correction through a generic model turn.';
