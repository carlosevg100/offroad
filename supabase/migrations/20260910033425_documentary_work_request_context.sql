-- Preserve the durable work request separately from the confirmed economic description.
-- This read stays behind the existing job capability and approval fingerprint boundary.
create or replace function private.worker_load_execution_brief_proposal_v3(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
  base jsonb;
  work_request jsonb;
begin
  base:=private.worker_load_execution_brief_proposal_before_scope(p_job_id,p_capability_token);
  select jsonb_build_object('message_id',m.id,'text',m.content) into work_request
  from public.agent_messages m
  where m.organization_id=j.organization_id and m.intake_session_id=j.intake_session_id
    and m.role='user' and m.metadata->>'kind'='request'
    and m.status in ('completed','processing')
  order by m.created_at asc,m.id asc limit 1;
  return base||jsonb_build_object(
    'confirmed_receivables_scope',private.receivables_evidence_scope_context(j.organization_id,j.intake_session_id),
    'initial_work_request',work_request
  );
end;
$$;
revoke all on function private.worker_load_execution_brief_proposal_v3(uuid,text) from public,anon;
grant execute on function private.worker_load_execution_brief_proposal_v3(uuid,text) to authenticated;
