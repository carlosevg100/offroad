-- A contextual question is a governed project object, not loose assistant prose. The browser
-- answers the exact open request the person saw; the database binds that answer to the queued
-- turn, closes the request atomically and keeps customer prose only in the conversation message.

create unique index capital_project_question_answer_message_idx
  on public.capital_project_agent_events (
    organization_id, (detail ->> 'messageId')
  )
  where event_type = 'question_answered' and detail ? 'messageId';

create or replace function private.submit_advisor_information_response_v1(
  p_project_id uuid,
  p_request_id uuid,
  p_expected_updated_at timestamptz,
  p_message_id uuid,
  p_locale text,
  p_answer_source text,
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
  request_row public.capital_project_information_requests;
  existing_message public.agent_messages;
  active_plan_id uuid;
  normalized_content text := trim(coalesce(p_content, ''));
  response_fingerprint text;
  next_status text;
  turn_result jsonb;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_project_id is null or p_request_id is null or p_expected_updated_at is null
    or p_message_id is null or p_locale not in ('pt-BR', 'en-US')
    or p_answer_source not in ('choice', 'custom', 'unavailable')
    or char_length(normalized_content) not between 1 and 8000 then
    raise exception 'invalid_information_response' using errcode = '22023';
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

  select request.* into request_row
  from public.capital_project_information_requests request
  where request.organization_id = project_row.organization_id
    and request.capital_project_id = project_row.id
    and request.id = p_request_id
  for update;
  if not found then
    raise exception 'information_request_not_found' using errcode = 'P0002';
  end if;

  select message.* into existing_message
  from public.agent_messages message
  where message.id = p_message_id;
  if found then
    if existing_message.organization_id = project_row.organization_id
      and existing_message.created_by = caller_id
      and existing_message.content = normalized_content
      and existing_message.metadata ->> 'kind' = 'information_request_response'
      and existing_message.metadata ->> 'informationRequestId' = request_row.id::text
      and existing_message.metadata ->> 'answerSource' = p_answer_source
      and request_row.answer_ref ->> 'messageId' = p_message_id::text then
      return jsonb_build_object(
        'message_id', existing_message.id,
        'request_id', request_row.id,
        'request_status', request_row.status,
        'status', existing_message.status,
        'replayed', true
      );
    end if;
    raise exception 'information_response_message_already_in_use' using errcode = '23505';
  end if;

  if request_row.status <> 'open' or request_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'information_request_stale' using errcode = '40001';
  end if;
  if p_answer_source = 'choice' then
    if request_row.answer_kind not in ('choice', 'confirmation')
      or (cardinality(request_row.choices) > 0 and not (normalized_content = any(request_row.choices))) then
      raise exception 'invalid_information_response_choice' using errcode = '22023';
    end if;
  end if;

  turn_result := private.submit_advisor_turn_v1(
    p_project_id, p_message_id, p_locale, normalized_content
  );
  response_fingerprint := encode(
    extensions.digest(convert_to(normalized_content, 'utf8'), 'sha256'), 'hex'
  );
  next_status := case when p_answer_source = 'unavailable' then 'waived' else 'answered' end;

  update public.agent_messages
  set metadata = metadata || jsonb_build_object(
    'kind', 'information_request_response',
    'informationRequestId', request_row.id,
    'requirementKey', request_row.requirement_key,
    'answerSource', p_answer_source,
    'expectedRequestUpdatedAt', p_expected_updated_at
  )
  where organization_id = project_row.organization_id and id = p_message_id;

  update public.capital_project_information_requests
  set status = next_status,
      answer_ref = jsonb_build_object(
        'messageId', p_message_id,
        'answeredBy', caller_id,
        'answeredAt', now(),
        'answerSource', p_answer_source,
        'responseFingerprint', response_fingerprint
      )
  where organization_id = project_row.organization_id and id = request_row.id;

  select plan.id into active_plan_id
  from public.capital_project_agent_plans plan
  where plan.organization_id = project_row.organization_id
    and plan.capital_project_id = project_row.id
    and plan.status = 'active'
  order by plan.revision desc limit 1;

  insert into public.capital_project_agent_events (
    organization_id, capital_project_id, agent_plan_id, event_type,
    summary_pt, summary_en, detail
  ) values (
    project_row.organization_id, project_row.id, active_plan_id, 'question_answered',
    case when next_status = 'waived'
      then 'Informação indisponível registrada; o plano será ajustado sem preencher a lacuna.'
      else 'Resposta incorporada; o plano será atualizado a partir deste novo contexto.' end,
    case when next_status = 'waived'
      then 'Unavailable information recorded; the plan will adjust without filling the gap.'
      else 'Answer incorporated; the plan will update from this new context.' end,
    jsonb_build_object(
      'messageId', p_message_id,
      'informationRequestId', request_row.id,
      'requirementKey', request_row.requirement_key,
      'answerSource', p_answer_source,
      'responseFingerprint', response_fingerprint
    )
  );

  return turn_result || jsonb_build_object(
    'request_id', request_row.id,
    'request_status', next_status,
    'replayed', false
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid_information_response' using errcode = '22023';
end;
$$;

create or replace function public.submit_advisor_information_response_v1(
  p_project_id uuid,
  p_request_id uuid,
  p_expected_updated_at timestamptz,
  p_message_id uuid,
  p_locale text,
  p_answer_source text,
  p_content text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.submit_advisor_information_response_v1(
    p_project_id, p_request_id, p_expected_updated_at, p_message_id,
    p_locale, p_answer_source, p_content
  );
$$;

revoke all on function private.submit_advisor_information_response_v1(
  uuid, uuid, timestamptz, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function public.submit_advisor_information_response_v1(
  uuid, uuid, timestamptz, uuid, text, text, text
) from public, anon;
grant execute on function private.submit_advisor_information_response_v1(
  uuid, uuid, timestamptz, uuid, text, text, text
) to authenticated;
grant execute on function public.submit_advisor_information_response_v1(
  uuid, uuid, timestamptz, uuid, text, text, text
) to authenticated;

-- Give the worker the exact question named by the machine-owned message metadata. The response
-- text remains the normal current message; this small joined object prevents a model from having
-- to guess which of several open questions the user answered.
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
  base_context jsonb := private.worker_load_agent_context_before_execution_brief_v1(
    p_job_id, p_capability_token
  );
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  project_id uuid := nullif(base_context #>> '{project,id}', '')::uuid;
  message_id uuid := nullif(base_context ->> 'message_id', '')::uuid;
  message_metadata jsonb;
begin
  select coalesce(message.metadata, '{}'::jsonb) into message_metadata
  from public.agent_messages message
  where message.organization_id = job_row.organization_id and message.id = message_id;

  return base_context || jsonb_build_object(
    'message_metadata', coalesce(message_metadata, '{}'::jsonb),
    'answered_information_request', (
      select jsonb_build_object(
        'id', request.id,
        'requirementKey', request.requirement_key,
        'question', request.question,
        'answerSource', message_metadata ->> 'answerSource'
      )
      from public.capital_project_information_requests request
      where request.organization_id = job_row.organization_id
        and request.capital_project_id = project_id
        and request.id = nullif(message_metadata ->> 'informationRequestId', '')::uuid
    ),
    'active_plan', (
      select plan.snapshot
      from public.capital_project_plans plan
      where plan.organization_id = job_row.organization_id
        and plan.capital_project_id = project_id
        and plan.status = 'active'
      order by plan.plan_version desc limit 1
    ),
    'latest_execution_brief', (
      select jsonb_build_object(
        'id', brief.id, 'version', brief.brief_version,
        'fingerprint', brief.brief_fingerprint,
        'visibleSnapshot', brief.visible_snapshot
      )
      from public.capital_project_execution_briefs brief
      where brief.organization_id = job_row.organization_id
        and brief.capital_project_id = project_id
      order by brief.brief_version desc limit 1
    )
  );
exception
  when invalid_text_representation then
    raise exception 'invalid_information_request_project_context' using errcode = '22023';
end;
$$;

comment on function public.submit_advisor_information_response_v1(
  uuid, uuid, timestamptz, uuid, text, text, text
) is 'Atomically binds a user response to the exact open information request, closes it and queues governed replanning.';
