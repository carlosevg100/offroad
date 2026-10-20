-- Market acquisition job, second independent review (ADR 0023). The storage predicate decides on the
-- lease only after every lock it takes: the source gate and the delegation may wait, and the deadline
-- is read again immediately before the predicate answers. And the attempt's size limit becomes the
-- database's own: a confirmation compares the MD5 Storage records as eTag, which is the whole object's
-- MD5 only for a single-request upload, so the claim offers and the confirmation accepts at most 5 MiB.
set search_path='';

create or replace function private.worker_can_access_market_object_v1(p_bucket text,p_path text,p_mode text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare a private.market_acquisition_allocations;j private.market_acquisition_jobs;worker uuid;begin
 if auth.uid() is null or p_bucket<>'market-reference' or p_mode not in ('upload','metadata','delete') or not private.market_reference_bucket_safe_v1() then return false;end if;
 if p_mode='upload' and not storage.allow_any_operation(array['object.upload']) then return false;end if;
 if p_mode='metadata' and not storage.allow_any_operation(array['object.upload','object.delete','object.delete_many','object.get_authenticated_info','object.head_authenticated_info']) then return false;end if;
 if p_mode='delete' and not storage.allow_any_operation(array['object.delete','object.delete_many']) then return false;end if;
 select * into a from private.market_acquisition_allocations where bucket_id=p_bucket and object_path=p_path;
 if not found then return false;end if;
 select * into j from private.market_acquisition_jobs where id=a.job_id for share;
 if exists(select 1 from private.market_acquisitions x where x.object_path=p_path) or not private.market_acquisition_transport_released_v1() then return false;end if;
 if j.status='leased' and j.lease_id=a.lease_id then
  -- The live attempt: only its holder, under the source gate and its delegation, before expiry.
  if j.leased_account_user_id is distinct from auth.uid()
  or not exists(select 1 from private.worker_tokens w join auth.users u on u.id=w.execution_account_user_id where w.id=j.leased_by
   and w.execution_account_user_id=auth.uid() and w.status='active' and w.revoked_at is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()))
  or not private.market_source_gate_v1(j.source_id,j.source_revision) or not private.market_delegation_live_v1(j.leased_by,j.source_id) then return false;end if;
  -- Every lock above may have waited: the lease must still be current now.
  return j.lease_expires_at>clock_timestamp();
 end if;
 if p_mode='upload' then return false;end if;
 select w.id into worker from private.worker_tokens w join auth.users u on u.id=w.execution_account_user_id
  join private.market_acquisition_delegations d on d.worker_token_id=w.id and d.source_id=j.source_id and d.revoked_at is null
  where w.execution_account_user_id=auth.uid() and w.status='active' and w.revoked_at is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
  limit 1;
 return worker is not null and private.market_delegation_live_v1(worker,j.source_id);
end $$;

create or replace function private.worker_claim_market_acquisition_v1(p_worker_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare worker uuid;j private.market_acquisition_jobs;s private.market_source_revisions;cap text;lease uuid;alloc uuid;path text;t timestamptz;begin
 worker:=private.market_worker_identity_v1(p_worker_token);
 if not private.market_acquisition_transport_released_v1() then return jsonb_build_object('claimed',false);end if;
 loop
  t:=clock_timestamp();
  select * into j from private.market_acquisition_jobs x
  where ((x.status='queued' and x.available_at<=t) or (x.status='leased' and x.lease_expires_at<=t))
  and exists(select 1 from private.market_acquisition_delegations d where d.worker_token_id=worker and d.source_id=x.source_id and d.revoked_at is null)
  order by x.available_at,x.created_at,x.id limit 1 for update skip locked;
  if not found then return jsonb_build_object('claimed',false);end if;
  if j.attempts>=j.max_attempts then
   update private.market_acquisition_jobs set status='failed',lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,lease_expires_at=null,
    capability_sha256=null,last_error=jsonb_build_object('code','attempts_exhausted') where id=j.id;
   insert into private.market_acquisition_job_events(job_id,event,detail) values(j.id,'exhausted',jsonb_build_object('attempts',j.attempts));
   continue;
  end if;
  if not private.market_source_gate_v1(j.source_id,j.source_revision) then
   update private.market_acquisition_jobs set status='failed',lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,lease_expires_at=null,
    capability_sha256=null,last_error=jsonb_build_object('code','source_not_acquirable') where id=j.id;
   insert into private.market_acquisition_job_events(job_id,event,detail) values(j.id,'source_withdrawn',jsonb_build_object('sourceRevision',j.source_revision));
   continue;
  end if;
  s:=private.market_source_in_force_v1(j.source_id);
  if not private.market_url_allowed_v1(j.url,s.allowed_hosts) then
   update private.market_acquisition_jobs set status='failed',last_error=jsonb_build_object('code','source_not_acquirable'),lease_id=null,leased_by=null,
    leased_account_user_id=null,leased_at=null,lease_expires_at=null,capability_sha256=null where id=j.id;
   insert into private.market_acquisition_job_events(job_id,event,detail) values(j.id,'source_withdrawn',jsonb_build_object('sourceRevision',j.source_revision));
   continue;
  end if;
  if not private.market_delegation_live_v1(worker,j.source_id) then return jsonb_build_object('claimed',false);end if;
  exit;
 end loop;
 if not private.market_reference_bucket_safe_v1() then raise exception 'market_reference_bucket_unsafe' using errcode='55000';end if;
 cap:=encode(extensions.gen_random_bytes(32),'hex');lease:=gen_random_uuid();alloc:=gen_random_uuid();t:=clock_timestamp();
 path:=j.source_id||'/'||to_char(t at time zone 'UTC','YYYY')||'/'||to_char(t at time zone 'UTC','MM')||'/'||alloc::text||'.'||j.extension;
 insert into private.market_acquisition_allocations(id,job_id,lease_id,object_path,worker_token_id,leased_account_user_id,capability_sha256)
 values(alloc,j.id,lease,path,worker,auth.uid(),extensions.digest(cap,'sha256'));
 update private.market_acquisition_jobs set status='leased',attempts=attempts+1,allocation_id=alloc,leased_by=worker,leased_account_user_id=auth.uid(),
  lease_id=lease,leased_at=t,lease_expires_at=t+interval '120 seconds',capability_sha256=extensions.digest(cap,'sha256') where id=j.id returning * into j;
 insert into private.market_acquisition_job_events(job_id,event,worker_token_id,lease_id,detail) values(j.id,'claimed',worker,lease,jsonb_build_object('attempt',j.attempts,'objectPath',path));
 return jsonb_build_object('claimed',true,'jobId',j.id,'leaseId',lease,'capability',cap,'attempt',j.attempts,'leaseExpiresAt',j.lease_expires_at,
  'sourceId',j.source_id,'sourceRevision',j.source_revision,'url',j.url,'allowedHosts',to_jsonb(s.allowed_hosts),'extension',j.extension,
  'bucket','market-reference','objectPath',path,'maxBytes',5242880);
end $$;

create or replace function private.worker_commit_market_acquisition_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_final_url text,p_sha256 text,p_md5 text,
 p_byte_size bigint,p_content_type text,p_acquired_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.market_acquisition_jobs;a private.market_acquisition_allocations;s private.market_source_revisions;o storage.objects;fp jsonb;begin
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
 select * into j from private.market_acquisition_jobs where id=p_job_id for update;
 if not found then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
 fp:=jsonb_build_object('finalUrl',p_final_url,'sha256',p_sha256,'md5',p_md5,'byteSize',p_byte_size,'contentType',p_content_type,
  'acquiredAt',to_char(p_acquired_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 if j.status='succeeded' then
  select * into a from private.market_acquisition_allocations where id=j.acquisition_id;
  if a.lease_id is distinct from p_lease_id or p_capability_token is null or a.capability_sha256 is distinct from extensions.digest(p_capability_token,'sha256')
  or a.leased_account_user_id is distinct from auth.uid()
  or not exists(select 1 from private.worker_tokens w where w.id=a.worker_token_id and w.execution_account_user_id=auth.uid() and w.status='active' and w.revoked_at is null)
  or not exists(select 1 from private.market_acquisition_job_events e where e.job_id=j.id and e.event='committed' and e.lease_id=p_lease_id and e.detail->'fingerprint'=fp)
  then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
  return jsonb_build_object('committed',true,'replayed',true,'acquisitionId',j.acquisition_id);
 end if;
 j:=private.market_acquisition_for_lease_v1(p_job_id,p_capability_token,p_lease_id);
 perform private.market_attempt_current_v1(j);
 select * into strict a from private.market_acquisition_allocations where id=j.allocation_id and lease_id=j.lease_id;
 s:=private.market_source_in_force_v1(j.source_id);
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_md5 is null or p_md5 !~ '^[a-f0-9]{32}$' or p_byte_size is null or p_byte_size<=0 or p_byte_size>5242880
 or p_acquired_at is null or p_acquired_at<j.leased_at or p_acquired_at>clock_timestamp()
 or not private.market_extension_content_type_v1(j.extension,p_content_type)
 then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 if not private.market_url_allowed_v1(p_final_url,s.allowed_hosts) then raise exception 'market_host_not_allowed' using errcode='42501';end if;
 select * into o from storage.objects where bucket_id=a.bucket_id and name=a.object_path for share;
 if not found or (o.metadata->>'size')::bigint is distinct from p_byte_size or o.metadata->>'mimetype' is distinct from p_content_type
 or o.metadata->>'eTag' is distinct from '"'||p_md5||'"'
 or (to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null
 then raise exception 'market_acquisition_object_mismatch' using errcode='55000';end if;
 if j.lease_expires_at<=clock_timestamp() then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
 insert into private.market_acquisitions(id,publisher_organization_id,source_id,source_revision,url,final_url,acquired_at,sha256,byte_size,content_type,object_path,processing_job_id)
 values(a.id,private.market_publisher_organization_v1(),j.source_id,j.source_revision,j.url,p_final_url,p_acquired_at,p_sha256,p_byte_size,p_content_type,a.object_path,j.id);
 update private.market_acquisition_jobs set status='succeeded',acquisition_id=a.id,lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,
  lease_expires_at=null,capability_sha256=null where id=j.id;
 insert into private.market_acquisition_job_events(job_id,event,worker_token_id,lease_id,detail)
 values(j.id,'committed',j.leased_by,p_lease_id,jsonb_build_object('acquisitionId',a.id,'fingerprint',fp));
 return jsonb_build_object('committed',true,'replayed',false,'acquisitionId',a.id);
end $$;

revoke all on function private.worker_can_access_market_object_v1(text,text,text),private.worker_claim_market_acquisition_v1(text),
 private.worker_commit_market_acquisition_v1(uuid,text,uuid,text,text,text,bigint,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function private.worker_can_access_market_object_v1(text,text,text),private.worker_claim_market_acquisition_v1(text),
 private.worker_commit_market_acquisition_v1(uuid,text,uuid,text,text,text,bigint,text,timestamptz) to authenticated;
