CREATE OR REPLACE FUNCTION private.approve_advisor_execution_brief_v1(p_project_id uuid, p_execution_brief_id uuid, p_expected_fingerprint text, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  project_row public.capital_projects; b public.capital_project_execution_briefs;
  d public.capital_project_execution_brief_dispatches; j public.processing_jobs; event_id uuid; preparer uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_command_id is null or p_expected_fingerprint is null or p_expected_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_execution_brief_approval' using errcode='22023';
  end if;
  select * into project_row from public.capital_projects p where p.id=p_project_id and p.status<>'archived'
    and private.can_access_capital_project(p.organization_id,p.id);
  if not found then raise exception 'capital_project_not_found' using errcode='P0002'; end if;
  select * into d from public.capital_project_execution_brief_dispatches
    where organization_id=project_row.organization_id and capital_project_id=p_project_id and execution_brief_id=p_execution_brief_id;
  if not found then raise exception 'execution_brief_dispatch_unavailable' using errcode='P0002'; end if;
  -- Same order as worker capabilities: target job, session, project. No bulk job locks in writers.
  select * into j from public.processing_jobs where organization_id=d.organization_id and id=d.processing_job_id for update;
  perform 1 from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id for update;
  perform 1 from public.capital_projects where organization_id=d.organization_id and id=p_project_id for update;
  select * into d from public.capital_project_execution_brief_dispatches where id=d.id for update;
  select * into b from public.capital_project_execution_briefs where organization_id=d.organization_id and id=p_execution_brief_id;
  if b.brief_fingerprint is distinct from p_expected_fingerprint
    or not private.execution_dispatch_is_current(j.id,false) then
    raise exception 'execution_brief_approval_stale' using errcode='40001';
  end if;
  preparer:=private.execution_brief_preparer_v1(b.id);
  perform private.assert_capital_project_review_action(project_row.organization_id,project_row.id,'approve',preparer);
  if exists(select 1 from public.capital_project_execution_brief_dispatches other
    where other.organization_id=d.organization_id and other.approval_command_id=p_command_id and other.id<>d.id) then
    raise exception 'execution_brief_approval_command_conflict' using errcode='23505';
  end if;
  if d.accepted_at is not null then
    return jsonb_build_object('execution_brief_id',b.id,'processing_job_id',j.id,'status','already_approved','replayed',true);
  end if;
  if exists(select 1 from public.agent_messages m where m.organization_id=j.organization_id and m.intake_session_id=j.intake_session_id and m.role='user' and m.status in ('queued','processing')) then
    raise exception 'advisor_message_in_progress' using errcode='55000';
  end if;
  if j.status<>'awaiting_approval' then raise exception 'execution_brief_dispatch_not_pending' using errcode='40001'; end if;
  -- Separate downstream economic/representation/external-effect gates remain enforced by the
  -- original queued payload and its executor; this consent authorizes only that bounded work.
  insert into public.capital_project_execution_brief_events(organization_id,capital_project_id,execution_brief_id,event_type,actor_type,actor_user_id,event_payload)
    values(d.organization_id,p_project_id,b.id,'accepted','user',auth.uid(),jsonb_build_object(
      'commandId',p_command_id,'briefFingerprint',b.brief_fingerprint,'processingJobId',j.id,
      'payloadFingerprint',d.payload_fingerprint,'inputFingerprint',d.input_fingerprint,
      'preparedBy',preparer,'reviewedBy',auth.uid(),'approvedBriefVersion',b.brief_version,
      'reviewMode',private.capital_project_review_mode(project_row.organization_id,project_row.id))) returning id into event_id;
  update public.capital_project_execution_brief_dispatches set approval_command_id=p_command_id,
    accepted_event_id=event_id,accepted_by=auth.uid(),accepted_at=now(),
    prepared_by=preparer,reviewed_by=auth.uid(),reviewed_at=now(),review_decision='approved',
    approved_brief_version=b.brief_version,approved_brief_fingerprint=b.brief_fingerprint where id=d.id;
  update public.processing_jobs set status='queued',available_at=now() where id=j.id;
  update public.processing_runs set status='queued',completed_at=null where organization_id=j.organization_id and id=j.processing_run_id;
  -- A confirmed case stays confirmed: the analysis of a later decision runs on it and never
  -- reopens the intake (enqueue_incremental_deal_state_analysis).
  update public.document_intake_sessions set current_run_id=j.processing_run_id,status='processing',processing_started_at=now(),processing_completed_at=null
    where organization_id=j.organization_id and id=j.intake_session_id and status<>'confirmed';
  return jsonb_build_object('execution_brief_id',b.id,'processing_job_id',j.id,'status','queued','replayed',false);
end;
$function$
