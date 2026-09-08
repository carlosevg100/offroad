-- Recalculated proposals are revisions of the latest locked project briefing.
create or replace function private.worker_record_execution_brief_proposal_v1(
  p_job_id uuid,p_capability_token text,p_internal_snapshot jsonb,p_visible_snapshot jsonb,p_expected_input_fingerprint text,p_plan jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb; persisted jsonb; target_id uuid; j public.processing_jobs; predecessor_id uuid;
begin
  context:=private.worker_load_execution_brief_proposal_v1(p_job_id,p_capability_token);
  if p_expected_input_fingerprint is distinct from context->>'input_fingerprint' then
    raise exception 'execution_proposal_inputs_changed' using errcode='40001';
  end if;
  target_id:=(context->>'target_job_id')::uuid;
  if context->'plan'='null'::jsonb then
    if p_plan is null then raise exception 'execution_proposal_plan_required' using errcode='22023'; end if;
    perform private.record_execution_proposal_missing_plan(p_job_id,p_capability_token,p_plan);
  elsif p_plan is not null then
    raise exception 'execution_proposal_plan_replacement_forbidden' using errcode='42501';
  end if;
  -- The loader above holds the target, session and project locks. Serialize with
  -- the canonical writer's active-plan lock before resolving the latest revision.
  -- Its parent validation remains authoritative; no prior approval is inherited.
  select * into j from public.processing_jobs where id=target_id;
  perform 1 from public.capital_project_plans
    where organization_id=j.organization_id
      and capital_project_id=(context#>>'{project,id}')::uuid and status='active'
    for update;
  select id into predecessor_id from public.capital_project_execution_briefs
    where organization_id=j.organization_id
      and capital_project_id=(context#>>'{project,id}')::uuid
    order by brief_version desc limit 1;
  persisted:=private.worker_record_capital_project_execution_brief_v1(p_job_id,p_capability_token,p_internal_snapshot,p_visible_snapshot,predecessor_id,'[]'::jsonb);
  perform private.bind_execution_brief_dispatch((persisted->>'id')::uuid,target_id);
  select * into j from public.processing_jobs where id=target_id;
  perform private.worker_complete_job(p_job_id,p_capability_token,jsonb_build_object('execution_brief_id',persisted->>'id','status','proposed'));
  update public.document_intake_sessions set status='review_ready',processing_completed_at=now()
    where organization_id=j.organization_id and id=j.intake_session_id and current_run_id=j.processing_run_id;
  return jsonb_build_object('execution_brief_id',persisted->>'id','processing_job_id',target_id,'status','proposed');
end;
$$;
