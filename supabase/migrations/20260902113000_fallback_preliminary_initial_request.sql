-- Keep the zero-model fallback aligned with the production preliminary worker: the first project
-- message is declaration context and can start the first read without a duplicate form field or
-- a dummy upload. The immutable preliminary payload remains schema-checked by the original
-- command and the deep diagnostic still requires the later evidence gate.

create or replace function private.record_fallback_preliminary_understanding_v2(
  p_organization_id uuid,
  p_session_id uuid,
  p_input_fingerprint text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
begin
  if actor_id is null
    or not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'preliminary_understanding_access_denied' using errcode = '42501';
  end if;
  if coalesce((select organization.pipeline_enabled
    from public.organizations organization
    where organization.id = p_organization_id), false)
    and coalesce((select policy.state
      from public.organization_rollout_policies policy
      where policy.organization_id = p_organization_id), 'active') in ('shadow', 'canary', 'active') then
    raise exception 'fallback_preliminary_pipeline_enabled' using errcode = '55000';
  end if;
  if p_input_fingerprint !~ '^[a-f0-9]{64}$'
    or coalesce(jsonb_typeof(p_payload), 'null') <> 'object'
    or p_payload ->> 'schemaVersion' <> '2026.08.31-v1'
    or p_payload ->> 'caseId' <> p_session_id::text
    or p_payload ->> 'locale' not in ('pt-BR', 'en-US')
    or coalesce(jsonb_typeof(p_payload -> 'company'), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_payload -> 'operation'), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_payload -> 'basis'), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_payload -> 'preliminaryAssessment'), 'null') <> 'object'
    or coalesce(p_payload #>> '{basis,publicResearch,status}', '') <> 'abstained'
    or coalesce((p_payload #>> '{basis,publicResearch,sourceCount}')::integer, -1) <> 0 then
    raise exception 'invalid_fallback_preliminary_understanding' using errcode = '22023';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id
    and session.id = p_session_id
  for update;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;

  if session_row.status = 'collecting'
    and char_length(trim(coalesce(session_row.capital_objective, ''))) < 3
    and char_length(trim(coalesce(p_payload #>> '{operation,objective}', ''))) >= 3
    and exists (
      select 1 from public.agent_messages message
      where message.organization_id = p_organization_id
        and message.intake_session_id = p_session_id
        and message.role = 'user'
        and message.status in ('completed', 'processing')
        and message.metadata ->> 'kind' = 'request'
        and trim(message.content) = trim(p_payload #>> '{operation,objective}')
    )
    and not exists (
      select 1 from public.source_documents document
      where document.organization_id = p_organization_id
        and document.intake_session_id = p_session_id
    ) then
    update public.document_intake_sessions session
    set status = 'review_ready',
        result_summary = coalesce(session.result_summary, '{}'::jsonb) || jsonb_build_object(
          'preliminary_input', 'project_request_only'
        ),
        updated_at = now()
    where session.organization_id = p_organization_id
      and session.id = p_session_id;
  end if;

  return private.record_fallback_preliminary_understanding(
    p_organization_id,
    p_session_id,
    p_input_fingerprint,
    p_payload
  );
end;
$$;

create or replace function public.record_fallback_preliminary_understanding(
  p_organization_id uuid,
  p_session_id uuid,
  p_input_fingerprint text,
  p_payload jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_fallback_preliminary_understanding_v2(
    p_organization_id,
    p_session_id,
    p_input_fingerprint,
    p_payload
  );
$$;

revoke all on function private.record_fallback_preliminary_understanding_v2(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.record_fallback_preliminary_understanding(uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function private.record_fallback_preliminary_understanding_v2(uuid, uuid, text, jsonb)
  to authenticated;
grant execute on function public.record_fallback_preliminary_understanding(uuid, uuid, text, jsonb)
  to authenticated;

comment on function public.record_fallback_preliminary_understanding(uuid, uuid, text, jsonb) is
  'Records a schema-validated zero-model preliminary read from documents, saved operation context, or the initial project request.';
