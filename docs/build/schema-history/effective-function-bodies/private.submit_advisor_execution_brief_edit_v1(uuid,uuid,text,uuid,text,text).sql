CREATE OR REPLACE FUNCTION private.submit_advisor_execution_brief_edit_v1(p_project_id uuid, p_execution_brief_id uuid, p_expected_fingerprint text, p_message_id uuid, p_locale text, p_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  project_row public.capital_projects;
  latest_brief public.capital_project_execution_briefs;
  current_brief public.capital_project_execution_briefs;
  existing_message public.agent_messages;
  existing_event public.capital_project_execution_brief_events;
  normalized_content text := trim(coalesce(p_content, ''));
  normalized_fingerprint text := lower(trim(coalesce(p_expected_fingerprint, '')));
  request_fingerprint text;
  turn_result jsonb;
begin
 perform private.require_resource_access_v1(p_project_id,'read');
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_project_id is null
    or p_execution_brief_id is null
    or p_message_id is null
    or p_locale not in ('pt-BR', 'en-US')
    or normalized_fingerprint !~ '^[0-9a-f]{64}$'
    or char_length(normalized_content) not between 3 and 8000 then
    raise exception 'invalid_execution_brief_edit' using errcode = '22023';
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

  select brief.* into current_brief
  from public.capital_project_execution_briefs brief
  where brief.organization_id = project_row.organization_id
    and brief.capital_project_id = project_row.id
    and brief.id = p_execution_brief_id;
  if not found then
    raise exception 'execution_brief_not_found' using errcode = 'P0002';
  end if;

  perform private.review_execution_brief_edit_v1(project_row.organization_id, project_row.id, current_brief.id, caller_id);
  -- The worker that appends a new brief locks the plan. Taking the same lock before the latest
  -- check prevents a request from being accepted against a version superseded concurrently.
  perform 1
  from public.capital_project_plans plan
  where plan.organization_id = current_brief.organization_id
    and plan.id = current_brief.plan_id
  for update;

  select brief.* into latest_brief
  from public.capital_project_execution_briefs brief
  where brief.organization_id = project_row.organization_id
    and brief.capital_project_id = project_row.id
  order by brief.brief_version desc
  limit 1;
  if latest_brief.id is distinct from current_brief.id
    or latest_brief.brief_fingerprint is distinct from normalized_fingerprint then
    raise exception 'execution_brief_edit_stale' using errcode = '40001';
  end if;

  select message.* into existing_message
  from public.agent_messages message
  where message.id = p_message_id;
  if found then
    select event.* into existing_event
    from public.capital_project_execution_brief_events event
    join public.document_intake_sessions session
      on session.organization_id = existing_message.organization_id
      and session.id = existing_message.intake_session_id
    where event.organization_id = project_row.organization_id
      and event.capital_project_id = project_row.id
      and event.execution_brief_id = current_brief.id
      and event.event_type = 'edit_requested'
      and event.actor_user_id = caller_id
      and event.event_payload ->> 'messageId' = p_message_id::text
      and session.capital_project_id = project_row.id
      and existing_message.created_by = caller_id
      and existing_message.content = normalized_content;
    if found then
      return jsonb_build_object(
        'message_id', existing_message.id,
        'execution_brief_id', current_brief.id,
        'expected_version', current_brief.brief_version,
        'status', existing_message.status,
        'replayed', true
      );
    end if;
    raise exception 'execution_brief_edit_message_already_in_use' using errcode = '23505';
  end if;

  insert into private.review_execution_authorizations(id,organization_id,resource_id,subject_user_id,execution_brief_id) values(p_message_id,project_row.organization_id,p_project_id,auth.uid(),current_brief.id);
 turn_result := private.submit_review_execution_turn_v1(
    p_project_id, p_message_id, p_locale, normalized_content
  );
  request_fingerprint := encode(
    extensions.digest(convert_to(normalized_content, 'utf8'), 'sha256'), 'hex'
  );

  update public.agent_messages
  set metadata = metadata || jsonb_build_object(
    'kind', 'execution_brief_edit',
    'executionBriefId', current_brief.id,
    'expectedBriefFingerprint', current_brief.brief_fingerprint,
    'expectedBriefVersion', current_brief.brief_version
  )
  where organization_id = project_row.organization_id
    and id = p_message_id;

  insert into public.capital_project_execution_brief_events (
    organization_id, capital_project_id, execution_brief_id, event_type,
    actor_type, actor_user_id, event_payload
  ) values (
    project_row.organization_id, project_row.id, current_brief.id, 'edit_requested',
    'user', caller_id, jsonb_build_object(
      'messageId', p_message_id,
      'expectedFingerprint', current_brief.brief_fingerprint,
      'expectedVersion', current_brief.brief_version,
      'requestFingerprint', request_fingerprint
    )
  );

  return turn_result || jsonb_build_object(
    'execution_brief_id', current_brief.id,
    'expected_version', current_brief.brief_version,
    'replayed', false
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid_execution_brief_edit' using errcode = '22023';
end;
$function$
