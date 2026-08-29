-- Keep the privileged command out of the Data API schema and cover the auth.users FK.

alter function public.record_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb)
  set schema private;

revoke all on function private.record_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function private.record_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb)
  to authenticated;

create function public.record_deal_state_object(
  p_organization_id uuid,
  p_session_id uuid,
  p_object_type text,
  p_status text,
  p_input_fingerprint text,
  p_payload jsonb,
  p_dependencies jsonb default '[]'::jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_deal_state_object(
    p_organization_id, p_session_id, p_object_type, p_status,
    p_input_fingerprint, p_payload, p_dependencies
  );
$$;

revoke all on function public.record_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.record_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb)
  to authenticated;

create index deal_state_objects_created_by_fk_idx
  on public.deal_state_objects (created_by)
  where created_by is not null;
