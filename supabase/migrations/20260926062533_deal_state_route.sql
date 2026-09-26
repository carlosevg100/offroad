-- The company-led route continues after the first incremental analysis.
--
-- Every intake session belongs to a project (20260901035248), so every case analysis that
-- enqueue_incremental_deal_state_analysis inserts is held as awaiting_approval with an
-- execution_brief_proposal (20260908035026). Two defects followed, measured on a local replay of
-- every migration:
--
-- 1. The replay and the refusal while an analysis runs looked only at queued, leased and
--    succeeded jobs. A second call for the same decision while its job was held inserted a second
--    held job and a second proposal, and the response reported job_status queued for a job that
--    the queue guard had held.
-- 2. approve_advisor_execution_brief_v1 moved the session to processing for every held job, also
--    for the analysis of a later decision on a confirmed case. worker_complete_job then moved it
--    to review_ready, and every later trigger was refused with confirmed_case_required: the
--    analyses of the structure, the production plan and the material package could never be
--    queued.
--
-- The state machine is the one 20260829205848 documented: an incremental analysis starts only
-- from a confirmed case with its opportunity, and "incremental analysis must be allowed to
-- persist a new immutable snapshot while the intake session stays confirmed". worker_complete_job
-- (20260821114132) moves only a processing session followed by the run, so a confirmed case is
-- never reopened by the completion. The approval command is what drifted; the enqueue
-- precondition, the completion writer and every gate are kept.
--
-- A held job counts as live work only while it can still be approved: its dispatch is current,
-- its brief is being prepared, or a conversation turn of its session may still bind a new brief
-- to it. A held job whose dispatch stopped being current (a newer brief in the project, an edit
-- requested on its brief, a new document or request in the session, a replaced plan, an archived
-- project) could never be approved and nothing cancelled it: settle_stale_execution_jobs_v1 took
-- only stale queued and expired leased jobs. It now takes such a dead held job too, with the same
-- locks and the same cancellation.
--
-- One new helper, two text patches (each old text present exactly once, or the migration stops
-- with a named *_contract_changed exception before changing anything) and one full redefinition
-- pinned by md5 of the current prosrc. Signatures, grants, security modes, search_path, locks,
-- stale checks, budgets and the run and job shape are kept. No table is touched.

-- The liveness of a held job: it waits for a person and can still be approved. Read by the queue
-- (replay and refusal) and by the settlement; never granted to a client.
create or replace function private.execution_hold_is_live_v1(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.processing_jobs job
    where job.id = p_job_id
      and job.status = 'awaiting_approval'
      and private.requires_execution_brief_approval(job.id)
      and (
        -- Its dispatch is current: the person can approve it now.
        private.execution_dispatch_is_current(job.id, false)
        -- Its brief is being prepared.
        or exists (
          select 1
          from public.processing_jobs proposal
          where proposal.organization_id = job.organization_id
            and proposal.intake_session_id = job.intake_session_id
            and proposal.kind = 'execution_brief_proposal'
            and proposal.payload ->> 'approval_target_job_id' = job.id::text
            and proposal.status in ('queued', 'leased')
        )
        -- A conversation turn of its session, a brief edit included, may still bind a new brief to
        -- it: the condition under which the approval refuses with advisor_message_in_progress.
        or exists (
          select 1
          from public.agent_messages message
          where message.organization_id = job.organization_id
            and message.intake_session_id = job.intake_session_id
            and message.role = 'user'
            and message.status in ('queued', 'processing')
        )
      )
  );
$$;

revoke all on function private.execution_hold_is_live_v1(uuid) from public, anon, authenticated;

-- enqueue_incremental_deal_state_analysis: a live held job is live work of its decision. The same
-- decision replays it with its real status; another decision is refused with
-- deal_state_analysis_awaiting_approval while it is held, as it already was with
-- deal_state_analysis_already_running while a job is queued or leased. A held job that can no
-- longer be approved is neither replayed nor blocking. A new job reports the status the queue guard
-- gave it. Old texts from 20260829211621, lines 99 and 100, 108, 128 to 134 and 197, left unchanged
-- by 20260925153755 and 20260926053701.
do $deal_state_route_enqueue$
declare
  body text;
  old_comment constant text := $old$  -- Exact replay is idempotent. A failed job may be retried, but queued, leased and
  -- successful work for the same decision fingerprint is never duplicated.$old$;
  new_comment constant text := $new$  -- Exact replay is idempotent. A failed job, and a held job that can no longer be approved,
  -- may be retried; live held, queued, leased and successful work for the same decision
  -- fingerprint is never duplicated.$new$;
  old_replay constant text := $old$    and job.status in ('queued', 'leased', 'succeeded')$old$;
  new_replay constant text := $new$    and (job.status in ('queued', 'leased', 'succeeded')
      or (job.status = 'awaiting_approval' and private.execution_hold_is_live_v1(job.id)))$new$;
  old_active constant text := $old$    and job.status in ('queued', 'leased')
  order by job.created_at desc
  limit 1;

  if found then
    raise exception 'deal_state_analysis_already_running' using errcode = '55000';
  end if;$old$;
  new_active constant text := $new$    and (job.status in ('queued', 'leased')
      or (job.status = 'awaiting_approval' and private.execution_hold_is_live_v1(job.id)))
  order by job.created_at desc
  limit 1;

  -- A held job that can still be approved, or whose brief is being prepared, waits for a person.
  -- Another decision is refused until that approval, never queued beside it.
  if found and active_job.status = 'awaiting_approval' then
    raise exception 'deal_state_analysis_awaiting_approval' using errcode = '55000';
  end if;
  if found then
    raise exception 'deal_state_analysis_already_running' using errcode = '55000';
  end if;$new$;
  old_status constant text := $old$    'job_status', 'queued',$old$;
  new_status constant text := $new$    'job_status', (select job.status from public.processing_jobs job where job.id = job_id),$new$;
begin
  select pg_get_functiondef('private.enqueue_incremental_deal_state_analysis(uuid,uuid,text)'::regprocedure) into body;
  if (length(body) - length(replace(body, old_comment, ''))) / length(old_comment) <> 1
    or (length(body) - length(replace(body, old_replay, ''))) / length(old_replay) <> 1
    or (length(body) - length(replace(body, old_active, ''))) / length(old_active) <> 1
    or (length(body) - length(replace(body, old_status, ''))) / length(old_status) <> 1
    or position('deal_state_analysis_awaiting_approval' in body) > 0 then
    raise exception 'deal_state_analysis_replay_contract_changed';
  end if;
  execute replace(replace(replace(replace(body,
    old_comment, new_comment), old_replay, new_replay), old_active, new_active), old_status, new_status);
end $deal_state_route_enqueue$;

-- approve_advisor_execution_brief_v1: the approval of a held job queues it and moves the session
-- to processing only while the case is not confirmed, as for the intake analysis. A confirmed case
-- stays confirmed, so worker_complete_job, worker_fail_job and the terminal run trigger, which move
-- only a processing session, leave it confirmed. Old text from 20260910230211, lines 337 and 338.
do $deal_state_route_approval$
declare
  body text;
  old_session constant text := $old$  update public.document_intake_sessions set current_run_id=j.processing_run_id,status='processing',processing_started_at=now(),processing_completed_at=null
    where organization_id=j.organization_id and id=j.intake_session_id;$old$;
  new_session constant text := $new$  -- A confirmed case stays confirmed: the analysis of a later decision runs on it and never
  -- reopens the intake (enqueue_incremental_deal_state_analysis).
  update public.document_intake_sessions set current_run_id=j.processing_run_id,status='processing',processing_started_at=now(),processing_completed_at=null
    where organization_id=j.organization_id and id=j.intake_session_id and status<>'confirmed';$new$;
begin
  select pg_get_functiondef('private.approve_advisor_execution_brief_v1(uuid,uuid,text,uuid)'::regprocedure) into body;
  if (length(body) - length(replace(body, old_session, ''))) / length(old_session) <> 1
    or position('A confirmed case stays confirmed' in body) > 0 then
    raise exception 'execution_brief_approval_session_contract_changed';
  end if;
  execute replace(body, old_session, new_session);
end $deal_state_route_approval$;

-- settle_stale_execution_jobs_v1 is restated from the body 20260908035026 created, pinned here: a
-- parallel change stops this migration instead of being overwritten.
do $deal_state_route_settlement_pin$
begin
  if (select md5(prosrc) from pg_proc where oid = 'private.settle_stale_execution_jobs_v1()'::regprocedure)
    <> 'e8151062934a1b67539feb0ed8dcc032' then
    raise exception 'stale_execution_settlement_contract_changed';
  end if;
end $deal_state_route_settlement_pin$;

-- The settlement also takes a held job that can no longer be approved. Same selection for queued
-- and expired leased jobs, same skip-locked batch, same lock order (job, session, project), a
-- re-check under the locks, the same cancellation and the same run and session handling.
create or replace function private.settle_stale_execution_jobs_v1()
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare j public.processing_jobs;
begin
  for j in select * from public.processing_jobs jobs
    where (((jobs.status='queued' or (jobs.status='leased' and jobs.lease_expires_at<now()))
        and private.requires_execution_brief_approval(jobs.id) and not private.execution_dispatch_is_current(jobs.id,true))
      or (jobs.status='awaiting_approval'
        and private.requires_execution_brief_approval(jobs.id) and not private.execution_hold_is_live_v1(jobs.id)))
    order by jobs.available_at for update skip locked limit 20
  loop
    perform 1 from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id for update;
    perform 1 from public.capital_projects p join public.document_intake_sessions s on s.organization_id=p.organization_id and s.capital_project_id=p.id
      where s.organization_id=j.organization_id and s.id=j.intake_session_id for update of p;
    -- Under the locks: a queued or leased job whose approved dispatch became current, and a held
    -- job that became live again, are left as they are.
    if j.status='awaiting_approval' then
      if private.execution_hold_is_live_v1(j.id) then continue; end if;
    elsif private.execution_dispatch_is_current(j.id,true) then continue; end if;
    update public.processing_jobs set status='cancelled',capability_sha256=null,leased_by=null,lease_expires_at=null,
      last_error=jsonb_build_object('reason','execution_approval_superseded') where id=j.id;
    update public.processing_runs r set status='cancelled',completed_at=now()
      where r.organization_id=j.organization_id and r.id=j.processing_run_id
        and not exists(select 1 from public.processing_jobs p where p.organization_id=r.organization_id and p.processing_run_id=r.id and p.status in ('queued','leased','awaiting_approval'));
    update public.document_intake_sessions set status='review_ready'
      where organization_id=j.organization_id and id=j.intake_session_id and current_run_id=j.processing_run_id and status='processing'
        and not exists(select 1 from public.processing_jobs p where p.organization_id=j.organization_id and p.processing_run_id=j.processing_run_id and p.status in ('queued','leased'));
  end loop;
end;
$function$;

-- The installed bodies, read back: the settlement takes held jobs only through the liveness
-- predicate, the predicate keeps its three conditions, and neither is callable by a client.
do $deal_state_route_verify$
begin
  if position('private.execution_hold_is_live_v1(jobs.id)' in pg_get_functiondef('private.settle_stale_execution_jobs_v1()'::regprocedure)) = 0
    or position('execution_brief_proposal' in pg_get_functiondef('private.execution_hold_is_live_v1(uuid)'::regprocedure)) = 0
    or has_function_privilege('authenticated', 'private.execution_hold_is_live_v1(uuid)', 'execute')
    or has_function_privilege('authenticated', 'private.settle_stale_execution_jobs_v1()', 'execute') then
    raise exception 'deal_state_route_verification_failed';
  end if;
end $deal_state_route_verify$;
