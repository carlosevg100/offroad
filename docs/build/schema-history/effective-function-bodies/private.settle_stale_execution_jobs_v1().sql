CREATE OR REPLACE FUNCTION private.settle_stale_execution_jobs_v1()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
