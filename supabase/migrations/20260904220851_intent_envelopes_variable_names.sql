-- Local variables named like columns of intent_envelopes made the insert ambiguous under
-- plpgsql's default variable_conflict. Variables now carry a prefix; behaviour unchanged.

create or replace function private.worker_record_intent_envelope(
  p_job_id uuid,
  p_capability_token text,
  p_envelope jsonb,
  p_classifier jsonb,
  p_model text,
  p_cost_usd numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  v_message_id uuid;
  v_project_id uuid;
  v_recorded uuid;
begin
  if job_row.kind <> 'agent_operation_brief' then
    raise exception 'agent_operation_brief_capability_required' using errcode = '42501';
  end if;
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object'
    or p_envelope ->> 'schemaVersion' <> 'intent-envelope.v1'
    or p_envelope #>> '{executionContext,organizationId,value}' <> job_row.organization_id::text
    or p_envelope #>> '{executionContext,organizationId,state}' <> 'system'
    or p_envelope #>> '{executionContext,authority,state}' <> 'system'
    or p_envelope #>> '{executionContext,evidenceRegime,state}' <> 'system' then
    raise exception 'invalid_intent_envelope' using errcode = '22023';
  end if;
  if p_model !~ '^[a-z0-9._-]{3,80}$' then
    raise exception 'invalid_intent_envelope_model' using errcode = '22023';
  end if;

  v_message_id := (job_row.payload ->> 'message_id')::uuid;
  select session.capital_project_id into v_project_id
  from public.agent_messages message
  join public.agent_conversations conversation
    on conversation.organization_id = message.organization_id and conversation.id = message.conversation_id
  join public.document_intake_sessions session
    on session.organization_id = conversation.organization_id and session.id = conversation.intake_session_id
  where message.organization_id = job_row.organization_id and message.id = v_message_id;

  insert into public.intent_envelopes (
    organization_id, message_id, capital_project_id, processing_job_id, envelope, classifier, model, cost_usd
  ) values (
    job_row.organization_id, v_message_id, v_project_id, job_row.id, p_envelope, coalesce(p_classifier, '{}'::jsonb), p_model, coalesce(p_cost_usd, 0)
  )
  on conflict (organization_id, message_id) do update set
    envelope = excluded.envelope,
    classifier = excluded.classifier,
    model = excluded.model,
    cost_usd = excluded.cost_usd,
    processing_job_id = excluded.processing_job_id
  returning id into v_recorded;

  return v_recorded;
end;
$$;
