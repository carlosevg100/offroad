-- Market acquisition job, first independent review (ADR 0023, decision 3). The worker credential alone no
-- longer reaches market acquisition: a founder or operator delegates one worker token to one source,
-- revocably, and every claim, renewal, upload and confirmation rechecks that delegation. Source revisions
-- and every step of an attempt serialize on the source's lock, so a withdrawal either precedes an
-- attempt's step or waits for it. Expiry is rechecked after every wait, immediately before each change.
-- Confirmation and deletion of the attempt's object serialize on the job row. A confirmed attempt is
-- replayed only to the account and capability that confirmed it, for the same receipt. A leased attempt
-- can be cancelled; the bytes an abandoned attempt left behind can be swept by a delegated worker.
set search_path='';

-- 1. Delegations: one worker token, one source, granted and revoked by commands, never edited otherwise.
create table private.market_acquisition_delegations(
 id uuid primary key,
 worker_token_id uuid not null references private.worker_tokens(id),
 source_id text not null check(source_id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 reason text not null check(length(btrim(reason)) between 10 and 2000),
 granted_by uuid not null references auth.users(id),
 grant_command_id uuid not null unique,
 granted_at timestamptz not null default clock_timestamp(),
 revoked_by uuid references auth.users(id),
 revoke_command_id uuid unique,
 revoke_reason text check(revoke_reason is null or length(btrim(revoke_reason)) between 10 and 2000),
 revoked_at timestamptz,
 check(num_nulls(revoked_by,revoke_command_id,revoke_reason,revoked_at) in (0,4)));
create unique index market_acquisition_delegations_live on private.market_acquisition_delegations(worker_token_id,source_id) where revoked_at is null;
create index market_acquisition_delegations_granted_by on private.market_acquisition_delegations(granted_by);
create index market_acquisition_delegations_revoked_by on private.market_acquisition_delegations(revoked_by);

create function private.guard_market_acquisition_delegation_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' and new.revoked_at is null then return new;end if;
 if tg_op='UPDATE' and old.revoked_at is null and new.revoked_at is not null
 and (to_jsonb(new)-array['revoked_by','revoke_command_id','revoke_reason','revoked_at'])=(to_jsonb(old)-array['revoked_by','revoke_command_id','revoke_reason','revoked_at'])
 then return new;end if;
 raise exception 'market_acquisition_delegation_invalid' using errcode='23514';
end $$;
create trigger market_acquisition_delegations_guard before insert or update or delete on private.market_acquisition_delegations
 for each row execute function private.guard_market_acquisition_delegation_v1();
do $$ begin
 execute 'alter table private.market_acquisition_delegations enable row level security';
 execute 'alter table private.market_acquisition_delegations force row level security';
 execute 'create policy market_acquisition_delegations_deny on private.market_acquisition_delegations as restrictive for all to public using(false) with check(false)';
 execute 'revoke all on private.market_acquisition_delegations from public,anon,authenticated,service_role';
 execute 'create trigger market_acquisition_delegations_truncate_guard before truncate on private.market_acquisition_delegations for each statement execute function private.guard_platform_ledger_truncate_v1()';
end $$;

create function private.grant_market_acquisition_delegation_v1(p_command uuid,p_worker_token_id uuid,p_source_id text,p_reason text,p_actor_user_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare prior private.market_acquisition_delegations;d uuid:=gen_random_uuid();begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_worker_token_id is null or p_source_id is null or p_reason is null then raise exception 'market_acquisition_delegation_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_acquisition_delegations where grant_command_id=p_command;
 if found then
  if prior.worker_token_id<>p_worker_token_id or prior.source_id<>p_source_id or prior.reason<>btrim(p_reason) or prior.granted_by<>p_actor_user_id
  then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return prior.id;
 end if;
 perform 1 from private.worker_tokens where id=p_worker_token_id and status='active' and revoked_at is null and execution_account_user_id is not null for share;
 if not found then raise exception 'market_acquisition_delegation_invalid' using errcode='22023';end if;
 if not exists(select 1 from private.market_source_revisions where source_id=p_source_id) then raise exception 'market_source_unknown' using errcode='23503';end if;
 insert into private.market_acquisition_delegations(id,worker_token_id,source_id,reason,granted_by,grant_command_id)
 values(d,p_worker_token_id,p_source_id,btrim(p_reason),p_actor_user_id,p_command);
 return d;
end $$;

create function private.revoke_market_acquisition_delegation_v1(p_command uuid,p_delegation_id uuid,p_reason text,p_actor_user_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare d private.market_acquisition_delegations;begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_delegation_id is null or p_reason is null then raise exception 'market_acquisition_delegation_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 -- The exclusive row lock waits for every step that holds the delegation shared, then every later step sees the revocation.
 select * into d from private.market_acquisition_delegations where id=p_delegation_id for update;
 if not found then raise exception 'market_acquisition_delegation_invalid' using errcode='22023';end if;
 if d.revoke_command_id is not null then
  if d.revoke_command_id<>p_command or d.revoked_by<>p_actor_user_id or d.revoke_reason<>btrim(p_reason) then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return;
 end if;
 update private.market_acquisition_delegations set revoked_by=p_actor_user_id,revoke_command_id=p_command,revoke_reason=btrim(p_reason),revoked_at=clock_timestamp() where id=d.id;
end $$;

-- A live delegation of this worker for this source, held shared until the step commits.
create function private.market_delegation_live_v1(p_worker uuid,p_source text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 perform 1 from private.market_acquisition_delegations d join private.worker_tokens w on w.id=d.worker_token_id
  where d.worker_token_id=p_worker and d.source_id=p_source and d.revoked_at is null and w.status='active' and w.revoked_at is null for share of d;
 return found;
end $$;

-- The source's gate: shared with every attempt step, exclusive for a new source revision. Under it the
-- revision of the attempt must still be the one in force and the source acquirable today.
create function private.market_source_gate_v1(p_source text,p_revision integer) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare s private.market_source_revisions;begin
 perform pg_advisory_xact_lock_shared(hashtextextended('market-source:'||p_source,0));
 s:=private.market_source_in_force_v1(p_source);
 return s.revision is not distinct from p_revision and private.market_source_acquirable_v1(p_source,(clock_timestamp() at time zone 'America/Sao_Paulo')::date);
end $$;

-- 2. Allocations remember who held them, so a confirmed attempt is replayed only to its holder.
alter table private.market_acquisition_allocations
 add column worker_token_id uuid references private.worker_tokens(id),
 add column leased_account_user_id uuid references auth.users(id),
 add column capability_sha256 bytea;
create index market_acquisition_allocations_worker on private.market_acquisition_allocations(worker_token_id);
create index market_acquisition_allocations_account on private.market_acquisition_allocations(leased_account_user_id);

-- 3. A leased attempt may now be cancelled as well.
create or replace function private.guard_market_acquisition_job_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.status<>'queued' or new.attempts<>0 or new.allocation_id is not null or new.acquisition_id is not null or new.last_error is not null
  then raise exception 'market_acquisition_job_invalid' using errcode='23514';end if;
  return new;
 end if;
 if tg_op<>'UPDATE'
 or (to_jsonb(new)-array['status','attempts','available_at','allocation_id','leased_by','leased_account_user_id','lease_id','leased_at','lease_expires_at',
     'capability_sha256','acquisition_id','last_error','updated_at'])
  is distinct from (to_jsonb(old)-array['status','attempts','available_at','allocation_id','leased_by','leased_account_user_id','lease_id','leased_at','lease_expires_at',
     'capability_sha256','acquisition_id','last_error','updated_at'])
 or new.attempts<old.attempts
 or old.status in ('succeeded','failed','cancelled')
 or not ((old.status='queued' and new.status in ('queued','leased','failed','cancelled'))
  or (old.status='leased' and new.status in ('leased','queued','succeeded','failed','cancelled')))
 then raise exception 'market_acquisition_job_invalid' using errcode='23514';end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;

create or replace function private.cancel_market_acquisition_v1(p_command uuid,p_job_id uuid,p_reason text,p_actor_user_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare j private.market_acquisition_jobs;prior private.market_acquisition_job_events;begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_job_id is null or p_reason is null or length(btrim(p_reason)) not between 10 and 2000
 then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_acquisition_job_events where command_id=p_command;
 if found then
  if prior.job_id<>p_job_id or prior.event<>'cancelled' or prior.actor_user_id<>p_actor_user_id or prior.detail->>'reason'<>btrim(p_reason)
  then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return;
 end if;
 -- The job row lock waits for a confirmation, renewal or upload in flight; after it no lease step succeeds.
 select * into j from private.market_acquisition_jobs where id=p_job_id for update;
 if not found or j.status not in ('queued','leased') then raise exception 'market_acquisition_not_cancellable' using errcode='55000';end if;
 update private.market_acquisition_jobs set status='cancelled',lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,lease_expires_at=null,
  capability_sha256=null where id=j.id;
 insert into private.market_acquisition_job_events(job_id,event,actor_user_id,command_id,lease_id,detail)
 values(j.id,'cancelled',p_actor_user_id,p_command,j.lease_id,jsonb_build_object('reason',btrim(p_reason),'wasLeased',j.status='leased'));
end $$;

-- 4. Claim: only jobs of sources this worker is delegated for; the gate and the delegation are held
-- through the claim.
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
  -- The delegation is rechecked under its row lock: a revocation committed after candidate discovery wins.
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
  'bucket','market-reference','objectPath',path,'maxBytes',52428800);
end $$;

-- Every lease step after the job lock: switch, source gate, delegation, then the clock again.
create function private.market_attempt_current_v1(p_job private.market_acquisition_jobs) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.market_acquisition_transport_released_v1() then raise exception 'market_acquisition_transport_paused' using errcode='42501';end if;
 if not private.market_source_gate_v1(p_job.source_id,p_job.source_revision) then raise exception 'market_source_not_acquirable' using errcode='42501';end if;
 if not private.market_delegation_live_v1(p_job.leased_by,p_job.source_id) then raise exception 'market_delegation_required' using errcode='42501';end if;
 if p_job.lease_expires_at<=clock_timestamp() then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
end $$;

create or replace function private.worker_renew_market_acquisition_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.market_acquisition_jobs;begin
 j:=private.market_acquisition_for_lease_v1(p_job_id,p_capability_token,p_lease_id);
 perform private.market_attempt_current_v1(j);
 update private.market_acquisition_jobs set lease_expires_at=clock_timestamp()+interval '120 seconds' where id=j.id returning * into j;
 insert into private.market_acquisition_job_events(job_id,event,worker_token_id,lease_id,detail) values(j.id,'renewed',j.leased_by,j.lease_id,'{}');
 return jsonb_build_object('renewed',true,'leaseExpiresAt',j.lease_expires_at);
end $$;

-- 5. Confirmation. The job row is locked first; a confirmed job is answered only to the account and
-- capability of the attempt that confirmed it, for exactly the same receipt.
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
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_md5 is null or p_md5 !~ '^[a-f0-9]{32}$' or p_byte_size is null or p_byte_size<=0 or p_byte_size>52428800
 or p_acquired_at is null or p_acquired_at<j.leased_at or p_acquired_at>clock_timestamp()
 or not private.market_extension_content_type_v1(j.extension,p_content_type)
 then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 if not private.market_url_allowed_v1(p_final_url,s.allowed_hosts) then raise exception 'market_host_not_allowed' using errcode='42501';end if;
 -- The object row is locked: an upload or a deletion of this path either finished before or waits.
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

-- 6. Failure codes include a withdrawn source and a revoked delegation, which another attempt may resolve.
create or replace function private.worker_fail_market_acquisition_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_code text,p_retryable boolean,p_detail text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.market_acquisition_jobs;retry boolean;begin
 if p_code is null or p_code not in ('host_not_allowed','redirect_not_allowed','private_address','http_status','too_large','content_type','timeout','network',
  'upload_failed','verification_failed','transport_paused','source_not_acquirable','delegation_revoked') or p_retryable is null or (p_detail is not null and length(p_detail)>500)
 then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 j:=private.market_acquisition_for_lease_v1(p_job_id,p_capability_token,p_lease_id);
 retry:=p_retryable and p_code not in ('host_not_allowed','redirect_not_allowed','private_address','source_not_acquirable') and j.attempts<j.max_attempts;
 update private.market_acquisition_jobs set status=case when retry then 'queued' else 'failed' end,
  available_at=case when retry then clock_timestamp()+make_interval(secs=>30*j.attempts) else available_at end,
  lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,lease_expires_at=null,capability_sha256=null,
  last_error=jsonb_build_object('code',p_code,'detail',p_detail) where id=j.id;
 insert into private.market_acquisition_job_events(job_id,event,worker_token_id,lease_id,detail)
 values(j.id,case when retry then 'retry_scheduled' else 'failed' end,j.leased_by,p_lease_id,jsonb_build_object('code',p_code,'detail',p_detail));
 return jsonb_build_object('retryScheduled',retry);
end $$;

-- 7. Abandoned bytes: paths of attempts that ended without a receipt and still hold an object, listed
-- to a worker delegated for the source, which deletes them through Storage.
create function private.worker_list_market_orphans_v1(p_worker_token text,p_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare worker uuid;begin
 worker:=private.market_worker_identity_v1(p_worker_token);
 if not private.market_acquisition_transport_released_v1() then return '[]'::jsonb;end if;
 return coalesce((select jsonb_agg(x.object_path order by x.created_at) from (
  select a.object_path,a.created_at from private.market_acquisition_allocations a join private.market_acquisition_jobs j on j.id=a.job_id
  where (j.status<>'leased' or j.lease_id is distinct from a.lease_id)
  and not exists(select 1 from private.market_acquisitions r where r.object_path=a.object_path)
  and exists(select 1 from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_path)
  and exists(select 1 from private.market_acquisition_delegations d where d.worker_token_id=worker and d.source_id=j.source_id and d.revoked_at is null)
  order by a.created_at limit least(greatest(coalesce(p_limit,20),1),100)) x),'[]'::jsonb);
end $$;
create function public.worker_list_market_orphans_v1(p_worker_token text,p_limit integer) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_list_market_orphans_v1(p_worker_token,p_limit);$$;

-- 8. Exact-path storage, now locked and delegated. Upload, metadata and deletion of a live attempt's
-- path lock its job row shared (a confirmation holds it exclusively); a delegated worker may also see
-- and delete the bytes of an abandoned attempt. Downloads stay closed.
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
  if j.leased_account_user_id is distinct from auth.uid() or j.lease_expires_at<=clock_timestamp()
  or not exists(select 1 from private.worker_tokens w join auth.users u on u.id=w.execution_account_user_id where w.id=j.leased_by
   and w.execution_account_user_id=auth.uid() and w.status='active' and w.revoked_at is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()))
  or not private.market_source_gate_v1(j.source_id,j.source_revision) or not private.market_delegation_live_v1(j.leased_by,j.source_id) then return false;end if;
  return true;
 end if;
 -- An abandoned attempt: never written again; seen and deleted by a worker delegated for the source.
 if p_mode='upload' then return false;end if;
 select w.id into worker from private.worker_tokens w join auth.users u on u.id=w.execution_account_user_id
  join private.market_acquisition_delegations d on d.worker_token_id=w.id and d.source_id=j.source_id and d.revoked_at is null
  where w.execution_account_user_id=auth.uid() and w.status='active' and w.revoked_at is null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
  limit 1;
 return worker is not null and private.market_delegation_live_v1(worker,j.source_id);
end $$;

-- 9. Grants: the new worker listing to authenticated, everything else closed.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('guard_market_acquisition_delegation_v1','grant_market_acquisition_delegation_v1','revoke_market_acquisition_delegation_v1',
  'market_delegation_live_v1','market_source_gate_v1','market_attempt_current_v1','worker_list_market_orphans_v1','guard_market_acquisition_job_v1','cancel_market_acquisition_v1',
  'worker_claim_market_acquisition_v1','worker_renew_market_acquisition_v1','worker_commit_market_acquisition_v1','worker_fail_market_acquisition_v1','worker_can_access_market_object_v1'))
 or (n.nspname='public' and p.proname='worker_list_market_orphans_v1')
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('worker_claim_market_acquisition_v1','worker_renew_market_acquisition_v1','worker_commit_market_acquisition_v1','worker_fail_market_acquisition_v1',
   'worker_can_access_market_object_v1','worker_list_market_orphans_v1') then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
 end loop;
end $$;

comment on table private.market_acquisition_delegations is 'Revocable delegation of one worker token to acquire one market source (ADR 0023, decision 3). Granted and revoked only by founder or operator commands; every attempt step rechecks it under a row lock.';
