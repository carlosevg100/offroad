-- A user's statement is durable project memory even when the downstream advisor job fails.
-- Failed assistant output must not be replayed, but dropping the source user message makes a
-- retry forget already supplied context and repeat questions the user has answered.

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
  base_context jsonb := private.worker_load_agent_context_before_professional_context_v1(
    p_job_id,
    p_capability_token
  );
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  message_actor uuid;
  message_conversation uuid;
  durable_recent_messages jsonb;
begin
  select message.created_by, message.conversation_id
  into message_actor, message_conversation
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = (base_context ->> 'message_id')::uuid;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', recent.id,
      'role', recent.role,
      'content', recent.content,
      'created_at', recent.created_at
    ) order by recent.created_at
  ), '[]'::jsonb)
  into durable_recent_messages
  from (
    select message.id, message.role, message.content, message.created_at
    from public.agent_messages message
    where message.organization_id = job_row.organization_id
      and message.conversation_id = message_conversation
      and message.id <> (base_context ->> 'message_id')::uuid
      and (
        message.status = 'completed'
        or (message.role = 'user' and message.status = 'failed')
      )
    order by message.created_at desc
    limit 12
  ) recent;

  return base_context || jsonb_build_object(
    'recent_messages', durable_recent_messages,
    'professional_context', (
      select jsonb_build_object(
        'affiliationKind', profile.affiliation_kind,
        'professionalRole', profile.professional_role,
        'teamName', profile.team_name,
        'institutionName', profile.institution_name,
        'operatingModels', to_jsonb(profile.operating_models),
        'productFamilies', to_jsonb(profile.product_families),
        'primaryObjectives', to_jsonb(profile.primary_objectives),
        'contextNotes', profile.context_notes,
        'disclosureStatus', profile.disclosure_status,
        'lastConfirmedAt', profile.last_confirmed_at
      )
      from public.professional_context_profiles profile
      where profile.organization_id = job_row.organization_id
        and profile.user_id = message_actor
    ),
    'institution_capabilities', (
      select jsonb_build_object(
        'institutionName', capability.institution_name,
        'institutionKind', capability.institution_kind,
        'operatingModels', to_jsonb(capability.operating_models),
        'productFamilies', to_jsonb(capability.product_families),
        'geographies', to_jsonb(capability.geographies),
        'currencies', to_jsonb(capability.currencies),
        'capabilityNotes', capability.capability_notes,
        'sourceKind', capability.source_kind,
        'disclosureStatus', capability.disclosure_status,
        'lastConfirmedAt', capability.last_confirmed_at
      )
      from public.institution_capability_profiles capability
      where capability.organization_id = job_row.organization_id
    )
  );
end;
$$;

revoke all on function private.worker_load_agent_context(uuid, text) from public, anon;
grant execute on function private.worker_load_agent_context(uuid, text) to authenticated;

comment on function public.worker_load_agent_context(uuid, text) is
  'Loads capability-scoped advisor context. Completed turns and failed user-authored source messages remain durable conversation memory; failed assistant output is excluded.';
