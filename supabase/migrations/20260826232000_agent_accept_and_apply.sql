-- One explicit UI action may accept and apply, but it remains one audited transaction with two
-- distinct state transitions. A stale preview is never accepted and left half-applied.

create or replace function private.accept_and_apply_agent_operation_brief_proposal(
  p_organization_id uuid,
  p_proposal_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  proposal_row public.agent_change_proposals;
begin
  select * into proposal_row from public.agent_change_proposals proposal
  where proposal.organization_id = p_organization_id and proposal.id = p_proposal_id
  for update;
  if not found then raise exception 'agent_proposal_not_found' using errcode = 'P0002'; end if;
  if actor_id is null or not (select private.can_access_intake_session(
    proposal_row.organization_id, proposal_row.intake_session_id
  )) then raise exception 'agent_proposal_access_denied' using errcode = '42501'; end if;
  if proposal_row.status <> 'proposed' then
    raise exception 'agent_proposal_already_decided' using errcode = '55000';
  end if;
  update public.agent_change_proposals
  set status = 'accepted', decided_by = actor_id, decided_at = now(),
      decision_reason = 'accepted_and_applied_by_user'
  where organization_id = p_organization_id and id = p_proposal_id;
  return private.apply_agent_operation_brief_proposal(
    p_organization_id, p_proposal_id, p_event_id
  );
end;
$$;

create or replace function public.accept_and_apply_agent_operation_brief_proposal(
  p_organization_id uuid,
  p_proposal_id uuid,
  p_event_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.accept_and_apply_agent_operation_brief_proposal(
    p_organization_id, p_proposal_id, p_event_id
  );
$$;

revoke all on function private.accept_and_apply_agent_operation_brief_proposal(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.accept_and_apply_agent_operation_brief_proposal(uuid, uuid, uuid)
  from public, anon;
grant execute on function private.accept_and_apply_agent_operation_brief_proposal(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.accept_and_apply_agent_operation_brief_proposal(uuid, uuid, uuid)
  to authenticated;
