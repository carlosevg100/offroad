set search_path='';
create or replace function private.process_revocation_targets_v1(p_worker_token text,p_limit integer default 20)
returns integer language plpgsql security definer set search_path='' as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);r private.revocation_runs;receipt text;n integer:=0;cancelled integer;target_record private.revocation_targets;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'revocation_limit_invalid' using errcode='22023';end if;
 for r in select rr.* from private.revocation_runs rr join private.event_outbox o on o.organization_id=rr.organization_id and o.event_id=rr.domain_event_id
 where o.status='completed' and exists(select 1 from private.revocation_targets t where t.organization_id=rr.organization_id and t.run_id=rr.id and t.state='pending')
 order by rr.created_at,rr.id limit p_limit for update of rr skip locked loop
  perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||r.organization_id::text,0));
  if exists(select 1 from public.processing_jobs j where j.organization_id=r.organization_id and j.status in ('queued','leased','awaiting_approval') and not private.job_authority_is_current_v1(j.id)) then continue;end if;
  update private.artifact_roundtrip_tasks t set state='cancelled',capability_sha256=null,lease_expires_at=null,failure_code='source_revoked'
  where t.organization_id=r.organization_id and t.state in ('queued','leased') and not private.artifact_roundtrip_task_allowed_v1(t);
  get diagnostics cancelled=row_count;
  -- A permission change does not erase shared evidence. Search, Storage and artifacts use
  -- current policy at each use; the private case index has no user-owned cached authorization.
  -- The only query cache is licensed public research, not a private financial-content cache.
  -- The receipt identifies that disposition explicitly, rather than certifying byte erasure.
  for target_record in select*from private.revocation_targets where organization_id=r.organization_id and run_id=r.id and destination<>'authority_outbox'and state='pending'for update loop
   receipt:=encode(extensions.digest(jsonb_build_object('eventId',r.domain_event_id,'destination',target_record.destination,'workerId',worker,
    'completedAt',clock_timestamp(),'cancelledRoundtripTasks',case when target_record.destination='jobs'then cancelled else 0 end,
    'disposition','current_authority_revalidated_shared_evidence_preserved','boundary',case target_record.destination
     when 'search'then 'candidate_and_delivery_source_policy'when 'cache'then 'no_private_authorization_cache'
     when 'jobs'then 'current_job_and_roundtrip_capability'when 'artifacts'then 'revision_ancestry_and_review_policy'else 'authenticated_storage_operation_policy'end)::text,'sha256'),'hex');
   update private.revocation_targets set state='completed',completed_at=clock_timestamp(),receipt_fingerprint=receipt where id=target_record.id;
  end loop;
  n:=n+1;
 end loop;
 return n;
end;$$;


