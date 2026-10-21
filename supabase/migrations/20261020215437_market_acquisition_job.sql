-- Market reference layer, acquisition job (ADR 0023, decision 3 and phase M1b). A platform job that
-- fetches one public file from a source's own hosts, stores the bytes at an exact path in the
-- publisher's private bucket and records the publisher's receipt. It has its own queue instead of a
-- kind in public.processing_jobs: no tenant claim, capability, authority binding or outbox consumer
-- reads this table, so no tenant path can lease, see or cancel an acquisition, and the acquisition
-- path reaches no tenant row. Jobs are enqueued by a live founder or operator (the scheduler arrives
-- with its own delegation); the worker account that holds an active worker token claims, renews,
-- confirms or fails them under a lease and a capability, exactly like the execution consumers. The
-- transport is installed closed: its switch starts unreleased and no deployed worker calls it.
set search_path='';

-- 1. Jobs, allocations and their ledger.
create table private.market_acquisition_jobs(
 id uuid primary key,
 command_id uuid not null unique,
 requested_by uuid not null references auth.users(id),
 reason text not null check(length(btrim(reason)) between 10 and 2000),
 source_id text not null,
 source_revision integer not null,
 url text not null check(length(url) between 9 and 2000),
 extension text not null check(extension in ('json','csv','zip','xml','pdf','txt','html')),
 status text not null default 'queued' check(status in ('queued','leased','succeeded','failed','cancelled')),
 attempts integer not null default 0 check(attempts>=0),
 max_attempts integer not null default 3 check(max_attempts between 1 and 5),
 available_at timestamptz not null default clock_timestamp(),
 allocation_id uuid,
 leased_by uuid references private.worker_tokens(id),
 leased_account_user_id uuid references auth.users(id),
 lease_id uuid,
 leased_at timestamptz,
 lease_expires_at timestamptz,
 capability_sha256 bytea,
 acquisition_id uuid unique,
 last_error jsonb check(last_error is null or jsonb_typeof(last_error)='object'),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(source_id,source_revision) references private.market_source_revisions(source_id,revision),
 check(attempts<=max_attempts),
 check((status='leased')=(lease_id is not null and leased_by is not null and leased_account_user_id is not null and leased_at is not null
  and lease_expires_at is not null and capability_sha256 is not null and allocation_id is not null)),
 check((status='succeeded')=(acquisition_id is not null)));
create index market_acquisition_jobs_claimable on private.market_acquisition_jobs(available_at,created_at,id) where status in ('queued','leased');
create index market_acquisition_jobs_source on private.market_acquisition_jobs(source_id,source_revision);
create index market_acquisition_jobs_requested_by on private.market_acquisition_jobs(requested_by);
create index market_acquisition_jobs_leased_by on private.market_acquisition_jobs(leased_by);
create index market_acquisition_jobs_leased_account on private.market_acquisition_jobs(leased_account_user_id);

-- One exact object path per attempt. The path is the publisher's receipt path if the attempt commits.
create table private.market_acquisition_allocations(
 id uuid primary key,
 job_id uuid not null references private.market_acquisition_jobs(id),
 lease_id uuid not null unique,
 bucket_id text not null default 'market-reference' check(bucket_id='market-reference'),
 object_path text not null unique check(object_path ~ '^[a-z0-9._-]+/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.[a-z0-9]{2,5}$'),
 created_at timestamptz not null default clock_timestamp());
create index market_acquisition_allocations_job on private.market_acquisition_allocations(job_id);
alter table private.market_acquisition_jobs add constraint market_acquisition_jobs_allocation_fk foreign key(allocation_id) references private.market_acquisition_allocations(id);
create index market_acquisition_jobs_allocation on private.market_acquisition_jobs(allocation_id);

create table private.market_acquisition_job_events(
 sequence bigint generated always as identity primary key,
 job_id uuid not null references private.market_acquisition_jobs(id),
 event text not null check(event in ('enqueued','claimed','renewed','committed','retry_scheduled','failed','cancelled','exhausted','source_withdrawn')),
 actor_user_id uuid references auth.users(id),
 worker_token_id uuid references private.worker_tokens(id),
 lease_id uuid,
 command_id uuid,
 detail jsonb not null default '{}'::jsonb check(jsonb_typeof(detail)='object'),
 created_at timestamptz not null default clock_timestamp());
create index market_acquisition_job_events_job on private.market_acquisition_job_events(job_id);
create index market_acquisition_job_events_actor on private.market_acquisition_job_events(actor_user_id);
create index market_acquisition_job_events_worker on private.market_acquisition_job_events(worker_token_id);
create unique index market_acquisition_job_events_command on private.market_acquisition_job_events(command_id) where command_id is not null;

-- A job's identity never changes; its state only moves along the lease protocol; nothing is deleted.
create function private.guard_market_acquisition_job_v1() returns trigger
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
  or (old.status='leased' and new.status in ('leased','queued','succeeded','failed')))
 then raise exception 'market_acquisition_job_invalid' using errcode='23514';end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
create trigger market_acquisition_jobs_guard before insert or update or delete on private.market_acquisition_jobs
 for each row execute function private.guard_market_acquisition_job_v1();

do $$ declare t text;begin
 foreach t in array array['market_acquisition_allocations','market_acquisition_job_events'] loop
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.guard_contribution_immutable_v1()',t||'_immutable',t);
 end loop;
 foreach t in array array['market_acquisition_jobs','market_acquisition_allocations','market_acquisition_job_events'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('create policy %I on private.%I as restrictive for all to public using(false) with check(false)',t||'_deny',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.guard_platform_ledger_truncate_v1()',t||'_truncate_guard',t);
 end loop;
end $$;
revoke all on sequence private.market_acquisition_job_events_sequence_seq from public,anon,authenticated,service_role;

-- 2. The transport switch: installed closed, opened only by its own command, paused by either.
insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source,note)
values('market-acquisition-transport',false,'internal','market-acquisition-transport','2026.10.20-v1','tested',
 'Market reference executor under the founder instruction of 2026-10-20',date '2026-10-20',
 'docs/adr/0023-market-reference-layer.md; founder instruction of 2026-10-20 (public sources only, ready to license later)',
 'Market acquisition transport switch, not a method release. Installed closed; opened only by release_market_acquisition_transport_v1.');

create function private.market_acquisition_transport_released_v1() returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare released boolean;begin
 select c.released into released from private.platform_capability_releases c where c.capability_key='market-acquisition-transport' for share;
 return coalesce(released,false);
end $$;

create function private.release_market_acquisition_transport_v1(p_command uuid,p_released boolean,p_actor_user_id uuid,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare prior private.platform_capability_release_events;begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_released is null or p_reason is null or length(btrim(p_reason)) not between 10 and 2000
 then raise exception 'platform_capability_release_invalid' using errcode='22023';end if;
 perform 1 from private.platform_capability_releases where capability_key='market-acquisition-transport' for update;
 if not found then raise exception 'platform_capability_release_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.platform_capability_release_events where command_id=p_command order by sequence desc limit 1;
 if found then
  if prior.capability_key<>'market-acquisition-transport' or prior.released is distinct from p_released or prior.actor_user_id is distinct from p_actor_user_id or prior.reason is distinct from btrim(p_reason)
  then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return;
 end if;
 perform set_config('offroad.actor_user_id',p_actor_user_id::text,true);
 perform set_config('offroad.command_id',p_command::text,true);
 perform set_config('offroad.command_reason',btrim(p_reason),true);
 update private.platform_capability_releases set released=p_released,updated_at=now() where capability_key='market-acquisition-transport';
 perform set_config('offroad.actor_user_id','',true);perform set_config('offroad.command_id','',true);perform set_config('offroad.command_reason','',true);
end $$;

-- 3. Hosts. A URL is accepted only as https, with a lowercase DNS host among the source's hosts,
-- no user information, and no port other than 443. DNS answers and redirects are checked by the
-- worker on every hop; the database checks the final URL again at confirmation.
create function private.market_url_host_v1(p_url text) returns text
language sql immutable set search_path='' as $$
 select substring(p_url from '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+)(:443)?([/?#][^[:space:][:cntrl:]]*)?$');
$$;
create function private.market_url_allowed_v1(p_url text,p_hosts text[]) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(private.market_url_host_v1(p_url)=any(p_hosts),false);
$$;
create function private.market_extension_content_type_v1(p_extension text,p_content_type text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(case p_extension
  when 'json' then p_content_type='application/json'
  when 'csv' then p_content_type='text/csv'
  when 'zip' then p_content_type='application/zip'
  when 'xml' then p_content_type in ('application/xml','text/xml')
  when 'pdf' then p_content_type='application/pdf'
  when 'txt' then p_content_type='text/plain'
  when 'html' then p_content_type='text/html'
 end,false);
$$;

-- The bucket keeps the configuration the foundation gave it; any drift closes the transport's storage.
create function private.market_reference_bucket_safe_v1() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from storage.buckets b where b.id='market-reference' and not b.public and b.file_size_limit=52428800
  and b.allowed_mime_types=array['application/zip','text/csv','application/json','application/xml','text/xml','application/pdf','text/plain','text/html']::text[]
  and coalesce(to_jsonb(b)->>'versioning_status','DISABLED')='DISABLED');
$$;

-- 4. Enqueue: a live founder or operator, an enabled source in force today, a URL on its hosts.
create function private.enqueue_market_acquisition_v1(p_command uuid,p_source_id text,p_url text,p_extension text,p_reason text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_acquisition_jobs;s private.market_source_revisions;job uuid:=gen_random_uuid();begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_source_id is null or p_url is null or p_extension is null or p_reason is null
 then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_acquisition_jobs where command_id=p_command;
 if found then
  if prior.source_id<>p_source_id or prior.url<>p_url or prior.extension<>p_extension or prior.requested_by<>p_actor_user_id or prior.reason<>btrim(p_reason)
  then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('jobId',prior.id,'replayed',true);
 end if;
 if private.market_publisher_organization_v1() is null then raise exception 'market_publisher_required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('market-source:'||p_source_id,0));
 s:=private.market_source_in_force_v1(p_source_id);
 if s.source_id is null or not private.market_source_acquirable_v1(p_source_id,(clock_timestamp() at time zone 'America/Sao_Paulo')::date)
 then raise exception 'market_source_not_acquirable' using errcode='42501';end if;
 if not private.market_url_allowed_v1(p_url,s.allowed_hosts) then raise exception 'market_host_not_allowed' using errcode='42501';end if;
 insert into private.market_acquisition_jobs(id,command_id,requested_by,reason,source_id,source_revision,url,extension)
 values(job,p_command,p_actor_user_id,btrim(p_reason),s.source_id,s.revision,p_url,p_extension);
 insert into private.market_acquisition_job_events(job_id,event,actor_user_id,command_id,detail)
 values(job,'enqueued',p_actor_user_id,p_command,jsonb_build_object('sourceId',s.source_id,'sourceRevision',s.revision));
 return jsonb_build_object('jobId',job,'replayed',false);
end $$;

create function private.cancel_market_acquisition_v1(p_command uuid,p_job_id uuid,p_reason text,p_actor_user_id uuid) returns void
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
 select * into j from private.market_acquisition_jobs where id=p_job_id for update;
 -- A leased attempt may be fetching already: it ends by its own confirmation, failure or expiry.
 if not found or j.status<>'queued' then raise exception 'market_acquisition_not_cancellable' using errcode='55000';end if;
 update private.market_acquisition_jobs set status='cancelled' where id=j.id;
 insert into private.market_acquisition_job_events(job_id,event,actor_user_id,command_id,detail)
 values(j.id,'cancelled',p_actor_user_id,p_command,jsonb_build_object('reason',btrim(p_reason)));
end $$;

-- 5. Worker commands. The account is bound to an active worker token; the lease is checked by
-- identity, capability and clock on every call.
create function private.market_worker_identity_v1(p_worker_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare worker uuid;begin
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'worker_account_binding_required' using errcode='42501';end if;
 worker:=private.worker_identity(p_worker_token);
 perform 1 from private.worker_tokens t where t.id=worker and t.execution_account_user_id=auth.uid() and t.status='active' and t.revoked_at is null for share;
 if not found then raise exception 'worker_account_binding_required' using errcode='42501';end if;
 return worker;
end $$;

create function private.market_acquisition_for_lease_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid) returns private.market_acquisition_jobs
language plpgsql security definer set search_path='' as $$
declare j private.market_acquisition_jobs;begin
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
 select * into j from private.market_acquisition_jobs where id=p_job_id for update;
 if not found then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
 perform 1 from private.worker_tokens where id=j.leased_by and execution_account_user_id=auth.uid() and status='active' and revoked_at is null for share;
 if not found or p_lease_id is null or p_capability_token is null or length(p_capability_token)<32
 or j.status<>'leased' or j.lease_id is distinct from p_lease_id or j.leased_account_user_id is distinct from auth.uid()
 or j.capability_sha256 is distinct from extensions.digest(p_capability_token,'sha256') or j.lease_expires_at<=clock_timestamp()
 then raise exception 'market_acquisition_lease_denied' using errcode='42501';end if;
 return j;
end $$;

create function private.worker_claim_market_acquisition_v1(p_worker_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare worker uuid;j private.market_acquisition_jobs;s private.market_source_revisions;cap text;lease uuid;alloc uuid;path text;t timestamptz;begin
 worker:=private.market_worker_identity_v1(p_worker_token);
 -- Paused in the database, without a deploy: nothing is claimed while the switch is off.
 if not private.market_acquisition_transport_released_v1() then return jsonb_build_object('claimed',false);end if;
 loop
  t:=clock_timestamp();
  select * into j from private.market_acquisition_jobs
  where (status='queued' and available_at<=t) or (status='leased' and lease_expires_at<=t)
  order by available_at,created_at,id limit 1 for update skip locked;
  if not found then return jsonb_build_object('claimed',false);end if;
  if j.attempts>=j.max_attempts then
   -- An expired last attempt ends the job; its object path stays recorded in the allocations.
   update private.market_acquisition_jobs set status='failed',lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,lease_expires_at=null,
    capability_sha256=null,last_error=jsonb_build_object('code','attempts_exhausted') where id=j.id;
   insert into private.market_acquisition_job_events(job_id,event,detail) values(j.id,'exhausted',jsonb_build_object('attempts',j.attempts));
   continue;
  end if;
  -- The job is pinned to the revision it was enqueued under: a later revision or a disabled source
  -- withdraws it instead of fetching under terms nobody approved for this request.
  s:=private.market_source_in_force_v1(j.source_id);
  if s.revision is distinct from j.source_revision or not private.market_source_acquirable_v1(j.source_id,(t at time zone 'America/Sao_Paulo')::date)
  or not private.market_url_allowed_v1(j.url,s.allowed_hosts) then
   update private.market_acquisition_jobs set status='failed',lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,lease_expires_at=null,
    capability_sha256=null,last_error=jsonb_build_object('code','source_not_acquirable') where id=j.id;
   insert into private.market_acquisition_job_events(job_id,event,detail) values(j.id,'source_withdrawn',jsonb_build_object('sourceRevision',j.source_revision));
   continue;
  end if;
  exit;
 end loop;
 if not private.market_reference_bucket_safe_v1() then raise exception 'market_reference_bucket_unsafe' using errcode='55000';end if;
 cap:=encode(extensions.gen_random_bytes(32),'hex');lease:=gen_random_uuid();alloc:=gen_random_uuid();
 path:=j.source_id||'/'||to_char(t at time zone 'UTC','YYYY')||'/'||to_char(t at time zone 'UTC','MM')||'/'||alloc::text||'.'||j.extension;
 insert into private.market_acquisition_allocations(id,job_id,lease_id,object_path) values(alloc,j.id,lease,path);
 update private.market_acquisition_jobs set status='leased',attempts=attempts+1,allocation_id=alloc,leased_by=worker,leased_account_user_id=auth.uid(),
  lease_id=lease,leased_at=t,lease_expires_at=t+interval '120 seconds',capability_sha256=extensions.digest(cap,'sha256') where id=j.id returning * into j;
 insert into private.market_acquisition_job_events(job_id,event,worker_token_id,lease_id,detail) values(j.id,'claimed',worker,lease,jsonb_build_object('attempt',j.attempts,'objectPath',path));
 return jsonb_build_object('claimed',true,'jobId',j.id,'leaseId',lease,'capability',cap,'attempt',j.attempts,'leaseExpiresAt',j.lease_expires_at,
  'sourceId',j.source_id,'sourceRevision',j.source_revision,'url',j.url,'allowedHosts',to_jsonb(s.allowed_hosts),'extension',j.extension,
  'bucket','market-reference','objectPath',path,'maxBytes',52428800);
end $$;

create function private.worker_renew_market_acquisition_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.market_acquisition_jobs;begin
 j:=private.market_acquisition_for_lease_v1(p_job_id,p_capability_token,p_lease_id);
 if not private.market_acquisition_transport_released_v1() then raise exception 'market_acquisition_transport_paused' using errcode='42501';end if;
 update private.market_acquisition_jobs set lease_expires_at=clock_timestamp()+interval '120 seconds' where id=j.id returning * into j;
 return jsonb_build_object('renewed',true,'leaseExpiresAt',j.lease_expires_at);
end $$;

-- Confirmation reads the stored object itself: it exists at the allocated path, with the size, type
-- and MD5 Storage recorded for it; the final URL is on the same hosts; the moment is inside the lease.
create function private.worker_commit_market_acquisition_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_final_url text,p_sha256 text,p_md5 text,
 p_byte_size bigint,p_content_type text,p_acquired_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.market_acquisition_jobs;a private.market_acquisition_allocations;s private.market_source_revisions;o storage.objects;begin
 select * into j from private.market_acquisition_jobs where id=p_job_id;
 if found and j.status='succeeded' then
  -- Replay of the same confirmation answers with the same receipt.
  if exists(select 1 from private.market_acquisitions x join private.market_acquisition_allocations l on l.object_path=x.object_path
   where x.id=j.acquisition_id and l.lease_id=p_lease_id and x.sha256=p_sha256 and x.byte_size=p_byte_size and x.final_url=p_final_url)
  then return jsonb_build_object('committed',true,'replayed',true,'acquisitionId',j.acquisition_id);end if;
  raise exception 'market_acquisition_lease_denied' using errcode='42501';
 end if;
 j:=private.market_acquisition_for_lease_v1(p_job_id,p_capability_token,p_lease_id);
 if not private.market_acquisition_transport_released_v1() then raise exception 'market_acquisition_transport_paused' using errcode='42501';end if;
 select * into strict a from private.market_acquisition_allocations where id=j.allocation_id and lease_id=j.lease_id;
 s:=private.market_source_in_force_v1(j.source_id);
 if s.revision is distinct from j.source_revision then raise exception 'market_source_not_acquirable' using errcode='42501';end if;
 if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_md5 is null or p_md5 !~ '^[a-f0-9]{32}$' or p_byte_size is null or p_byte_size<=0
 or p_acquired_at is null or p_acquired_at<j.leased_at or p_acquired_at>clock_timestamp()
 or not private.market_extension_content_type_v1(j.extension,p_content_type)
 then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 if not private.market_url_allowed_v1(p_final_url,s.allowed_hosts) then raise exception 'market_host_not_allowed' using errcode='42501';end if;
 select * into o from storage.objects where bucket_id=a.bucket_id and name=a.object_path;
 if not found or (o.metadata->>'size')::bigint is distinct from p_byte_size or o.metadata->>'mimetype' is distinct from p_content_type
 or o.metadata->>'eTag' is distinct from '"'||p_md5||'"'
 or (to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null
 then raise exception 'market_acquisition_object_mismatch' using errcode='55000';end if;
 insert into private.market_acquisitions(id,publisher_organization_id,source_id,source_revision,url,final_url,acquired_at,sha256,byte_size,content_type,object_path,processing_job_id)
 values(a.id,private.market_publisher_organization_v1(),j.source_id,j.source_revision,j.url,p_final_url,p_acquired_at,p_sha256,p_byte_size,p_content_type,a.object_path,j.id);
 update private.market_acquisition_jobs set status='succeeded',acquisition_id=a.id,lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,
  lease_expires_at=null,capability_sha256=null where id=j.id;
 insert into private.market_acquisition_job_events(job_id,event,worker_token_id,lease_id,detail)
 values(j.id,'committed',j.leased_by,p_lease_id,jsonb_build_object('acquisitionId',a.id,'sha256',p_sha256,'byteSize',p_byte_size));
 return jsonb_build_object('committed',true,'replayed',false,'acquisitionId',a.id);
end $$;

-- A failed attempt is recorded with its code; a retryable one returns to the queue with a delay.
create function private.worker_fail_market_acquisition_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_code text,p_retryable boolean,p_detail text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.market_acquisition_jobs;retry boolean;begin
 if p_code is null or p_code not in ('host_not_allowed','redirect_not_allowed','private_address','http_status','too_large','content_type','timeout','network',
  'upload_failed','verification_failed','transport_paused') or p_retryable is null or (p_detail is not null and length(p_detail)>500)
 then raise exception 'market_acquisition_invalid' using errcode='22023';end if;
 j:=private.market_acquisition_for_lease_v1(p_job_id,p_capability_token,p_lease_id);
 -- Host and address refusals are never retried: the same URL would be refused again.
 retry:=p_retryable and p_code not in ('host_not_allowed','redirect_not_allowed','private_address') and j.attempts<j.max_attempts;
 update private.market_acquisition_jobs set status=case when retry then 'queued' else 'failed' end,
  available_at=case when retry then clock_timestamp()+make_interval(secs=>30*j.attempts) else available_at end,
  lease_id=null,leased_by=null,leased_account_user_id=null,leased_at=null,lease_expires_at=null,capability_sha256=null,
  last_error=jsonb_build_object('code',p_code,'detail',p_detail) where id=j.id;
 insert into private.market_acquisition_job_events(job_id,event,worker_token_id,lease_id,detail)
 values(j.id,case when retry then 'retry_scheduled' else 'failed' end,j.leased_by,p_lease_id,jsonb_build_object('code',p_code,'detail',p_detail));
 return jsonb_build_object('retryScheduled',retry);
end $$;

create function public.worker_claim_market_acquisition_v1(p_worker_token text) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_claim_market_acquisition_v1(p_worker_token);$$;
create function public.worker_renew_market_acquisition_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_renew_market_acquisition_v1(p_job_id,p_capability_token,p_lease_id);$$;
create function public.worker_commit_market_acquisition_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_final_url text,p_sha256 text,p_md5 text,
 p_byte_size bigint,p_content_type text,p_acquired_at timestamptz) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_commit_market_acquisition_v1(p_job_id,p_capability_token,p_lease_id,p_final_url,p_sha256,p_md5,p_byte_size,p_content_type,p_acquired_at);$$;
create function public.worker_fail_market_acquisition_v1(p_job_id uuid,p_capability_token text,p_lease_id uuid,p_code text,p_retryable boolean,p_detail text) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_fail_market_acquisition_v1(p_job_id,p_capability_token,p_lease_id,p_code,p_retryable,p_detail);$$;

-- 6. Exact-path storage. Only the account holding the current lease of the attempt that allocated the
-- path may upload to it, see its metadata or delete it, and only before the attempt is confirmed.
-- Reading the bytes stays closed: the restrictive export barrier refuses authenticated downloads.
create function private.worker_can_access_market_object_v1(p_bucket text,p_path text,p_mode text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare a private.market_acquisition_allocations;j private.market_acquisition_jobs;begin
 if auth.uid() is null or p_bucket<>'market-reference' or p_mode not in ('upload','metadata','delete') or not private.market_reference_bucket_safe_v1() then return false;end if;
 if p_mode='upload' and not storage.allow_any_operation(array['object.upload']) then return false;end if;
 if p_mode='metadata' and not storage.allow_any_operation(array['object.upload','object.delete','object.get_authenticated_info','object.head_authenticated_info']) then return false;end if;
 if p_mode='delete' and not storage.allow_any_operation(array['object.delete']) then return false;end if;
 select * into a from private.market_acquisition_allocations where bucket_id=p_bucket and object_path=p_path;
 if not found then return false;end if;
 select * into j from private.market_acquisition_jobs where id=a.job_id;
 if j.status<>'leased' or j.lease_id is distinct from a.lease_id or j.leased_account_user_id is distinct from auth.uid() or j.lease_expires_at<=clock_timestamp()
 or exists(select 1 from private.market_acquisitions x where x.object_path=p_path)
 or not private.market_acquisition_transport_released_v1() then return false;end if;
 return exists(select 1 from private.worker_tokens w join auth.users u on u.id=w.execution_account_user_id
  where w.id=j.leased_by and w.execution_account_user_id=auth.uid() and w.status='active' and w.revoked_at is null
  and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()));
end $$;
create policy market_reference_objects_insert on storage.objects for insert to authenticated
 with check(bucket_id='market-reference' and private.worker_can_access_market_object_v1(bucket_id,name,'upload'));
create policy market_reference_objects_select on storage.objects for select to authenticated
 using(bucket_id='market-reference' and private.worker_can_access_market_object_v1(bucket_id,name,'metadata'));
create policy market_reference_objects_delete on storage.objects for delete to authenticated
 using(bucket_id='market-reference' and private.worker_can_access_market_object_v1(bucket_id,name,'delete'));

-- 7. Grants. The worker-facing claim, renew, commit and fail and the storage predicate are granted to
-- authenticated; everything else is closed to every API role.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('guard_market_acquisition_job_v1','market_acquisition_transport_released_v1','release_market_acquisition_transport_v1',
  'market_url_host_v1','market_url_allowed_v1','market_extension_content_type_v1','market_reference_bucket_safe_v1','enqueue_market_acquisition_v1',
  'cancel_market_acquisition_v1','market_worker_identity_v1','market_acquisition_for_lease_v1','worker_claim_market_acquisition_v1','worker_renew_market_acquisition_v1',
  'worker_commit_market_acquisition_v1','worker_fail_market_acquisition_v1','worker_can_access_market_object_v1'))
 or (n.nspname='public' and p.proname in ('worker_claim_market_acquisition_v1','worker_renew_market_acquisition_v1','worker_commit_market_acquisition_v1','worker_fail_market_acquisition_v1'))
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('worker_claim_market_acquisition_v1','worker_renew_market_acquisition_v1','worker_commit_market_acquisition_v1','worker_fail_market_acquisition_v1','worker_can_access_market_object_v1') then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
 end loop;
end $$;

-- 8. Boot contract: the database announces the consumer before any image requires it.
do $$declare body text;begin
 select pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure) into body;
 if position('market-acquisition-consumer.v1' in body)>0 then raise exception 'market_capability_already_registered';end if;
 if position('governed-evaluation-consumer.v1' in body)=0 then raise exception 'runtime_capability_anchor_missing';end if;
 body:=replace(body,'governed-evaluation-consumer.v1','governed-evaluation-consumer.v1","market-acquisition-consumer.v1');
 execute body;
end $$;

comment on table private.market_acquisition_jobs is 'Platform acquisition jobs of the market reference publisher (ADR 0023): one URL on a source''s hosts, pinned to the source revision in force when enqueued, leased to the worker account under a capability. No tenant consumer reads this table.';
comment on table private.market_acquisition_allocations is 'One exact object path in the market-reference bucket per acquisition attempt. Paths of attempts that did not commit identify any bytes left behind for the purge sweep.';
