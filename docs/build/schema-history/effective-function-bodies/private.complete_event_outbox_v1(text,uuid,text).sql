CREATE OR REPLACE FUNCTION private.complete_event_outbox_v1(p_worker_token text, p_outbox_id uuid, p_capability text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare worker_id uuid; item private.event_outbox; job record; applied integer:=0; remaining boolean;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=now())) then
  raise exception 'worker_account_required' using errcode='42501';
 end if;
 worker_id:=private.worker_identity(p_worker_token);
 select * into item from private.event_outbox where id=p_outbox_id for update;
 if not found or item.worker_token_id is distinct from worker_id or item.leased_account_user_id is distinct from auth.uid()
 or item.capability_sha256 is distinct from extensions.digest(p_capability,'sha256') then raise exception 'event_capability_invalid' using errcode='42501'; end if;
 if item.status='completed' then return jsonb_build_object('completed',true,'replayed',true,'appliedCount',item.applied_count); end if;
 if item.status<>'leased' or item.lease_expires_at<=clock_timestamp() then raise exception 'event_lease_expired' using errcode='42501'; end if;
 -- A delayed event never overrides a subsequent regrant: the current authority wins.
 for job in select j.id from public.processing_jobs j where j.organization_id=item.organization_id
  and j.status in ('queued','leased','awaiting_approval') and not private.job_authority_is_current_v1(j.id)
  order by j.id limit 100 for update of j skip locked loop
  if not private.lock_job_authority_v1(job.id) then
   insert into private.access_decision_events(organization_id,domain_event_id,processing_job_id,decision,reason)
   values(item.organization_id,item.event_id,job.id,'deny','authorization_revoked');
   update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null,
    last_error=jsonb_build_object('reason','authorization_revoked'),updated_at=clock_timestamp() where id=job.id;
   applied:=applied+1;
  end if;
 end loop;
 update public.processing_runs r set status='cancelled',completed_at=clock_timestamp(),
  error=jsonb_build_object('reason','authorization_revoked'),updated_at=clock_timestamp()
 where r.organization_id=item.organization_id and r.status in ('queued','running')
  and exists(select 1 from private.access_decision_events a join public.processing_jobs j
   on j.organization_id=a.organization_id and j.id=a.processing_job_id
   where a.organization_id=item.organization_id and a.domain_event_id=item.event_id and j.processing_run_id=r.id)
  and not exists(select 1 from public.processing_jobs j where j.organization_id=r.organization_id and j.processing_run_id=r.id and j.status in ('queued','leased','awaiting_approval'));
 select exists(select 1 from public.processing_jobs j where j.organization_id=item.organization_id
  and j.status in ('queued','leased','awaiting_approval') and not private.job_authority_is_current_v1(j.id)) into remaining;
 if not private.apply_outbox_dependency_effect_v1(item.organization_id,item.event_id) and not remaining then
  update private.event_outbox set applied_count=applied_count+applied,updated_at=clock_timestamp() where id=item.id;
  return jsonb_build_object('completed',false,'replayed',false,'appliedCount',item.applied_count+applied);
 end if;
 update private.event_outbox set status=case when remaining then 'pending' else 'completed' end,
 completed_at=case when remaining then null else clock_timestamp() end,applied_count=applied_count+applied,
 attempts=case when remaining then 0 else attempts end,updated_at=clock_timestamp() where id=item.id;
 return jsonb_build_object('completed',not remaining,'replayed',false,'appliedCount',item.applied_count+applied);
end $function$
