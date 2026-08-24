-- Keep the privileged implementation outside the Data API schema. The public function is an
-- invoker wrapper, matching every other authenticated command in the platform.

alter function public.record_claim_decision(uuid, uuid, text, text, text, text)
  set schema private;

revoke all on function private.record_claim_decision(uuid, uuid, text, text, text, text)
  from public, anon;
grant execute on function private.record_claim_decision(uuid, uuid, text, text, text, text)
  to authenticated;

create function public.record_claim_decision(
  p_organization_id uuid,
  p_session_id uuid,
  p_claim_id text,
  p_claim_fingerprint text,
  p_decision text,
  p_reason text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_claim_decision(
    p_organization_id,
    p_session_id,
    p_claim_id,
    p_claim_fingerprint,
    p_decision,
    p_reason
  );
$$;

revoke all on function public.record_claim_decision(uuid, uuid, text, text, text, text)
  from public, anon;
grant execute on function public.record_claim_decision(uuid, uuid, text, text, text, text)
  to authenticated;
