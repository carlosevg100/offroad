-- Local E2E setup only. Reuse the synthetic borrower's UI-reviewed candidates, not a
-- fabricated brief. The canonical job trigger holds analysis and queues the real planner.
-- This runs last in the serial journey and intentionally never authorizes substantive work.
begin;
select set_config('offroad.e2e_session', :'session_id', true);
select set_config('offroad.e2e_owner', :'owner_email', true);
select set_config('offroad.e2e_mode', :'mode', true);
do $$
declare s public.document_intake_sessions%rowtype; run_id uuid:=gen_random_uuid(); target_id uuid:=gen_random_uuid(); next_no integer;
begin
  select intake.* into strict s from public.document_intake_sessions intake
  join auth.users u on u.id=intake.started_by
  where intake.id=current_setting('offroad.e2e_session')::uuid
    and u.email=current_setting('offroad.e2e_owner') and u.email like 'e2e-%@example.com';
  if s.capital_project_id is null then raise exception 'Synthetic session has no project'; end if;
  if current_setting('offroad.e2e_mode')='prepare' then
    -- Reopen only this synthetic completed session so the actual review UI is reachable.
    update public.document_intake_sessions set status='review_ready' where id=s.id;
    return;
  elsif current_setting('offroad.e2e_mode')<>'enqueue' then
    raise exception 'Unsupported local setup mode';
  end if;
  select coalesce(max(run_no),0)+1 into next_no from public.processing_runs where intake_session_id=s.id;
  insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
  values(run_id,s.organization_id,s.id,next_no,'manual','queued','local-e2e-sector-proposal',s.started_by);
  update public.document_intake_sessions set current_run_id=run_id,status='processing',processing_started_at=now(),processing_completed_at=null where id=s.id;
  insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
  values(target_id,s.organization_id,s.id,run_id,'case_analysis','queued','{"analysis_scope":"full_case","locale":"pt-BR"}');
  if not exists(select 1 from public.processing_jobs where id=target_id and status='awaiting_approval')
    or not exists(select 1 from public.processing_jobs where processing_run_id=run_id and kind='execution_brief_proposal') then
    raise exception 'Canonical approval boundary did not hold the synthetic target and enqueue its planner';
  end if;
end $$;
commit;
