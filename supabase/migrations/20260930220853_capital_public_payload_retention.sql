-- 3Q retained public JSON foundation. Storage owns bytes; SQL owns identities, rights,
-- finite deadlines and scoped deletion leases. No task/snapshot/release is completed.
-- Physical SHA256 and delete confirmation are trusted worker receipts, not ETag/metadata.
-- Admission starts DISABLED; a subsequent controlled rollout may enable only after
-- Storage configuration, worker purge deployment and physical deletion are verified.
set search_path='';

-- Global operational policy/control: no tenant content. Versioned policy is immutable.
create table private.capital_public_retention_policies (
 id uuid primary key default gen_random_uuid(), revision integer not null unique check(revision>0),
 maximum_retention_seconds integer not null check(maximum_retention_seconds between 1200 and 7776000),
 purge_margin_seconds integer not null check(purge_margin_seconds between 60 and 3600),
 heartbeat_seconds integer not null check(heartbeat_seconds between 30 and 300),
 created_at timestamptz not null default clock_timestamp(),
 check(maximum_retention_seconds>purge_margin_seconds+60)
);
insert into private.capital_public_retention_policies(revision,maximum_retention_seconds,purge_margin_seconds,heartbeat_seconds)
 values(1,2592000,600,90);
create table private.capital_public_retention_controls (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 policy_id uuid not null references private.capital_public_retention_policies(id),
 updated_at timestamptz not null default clock_timestamp()
);
insert into private.capital_public_retention_controls(policy_id) select id from private.capital_public_retention_policies where revision=1;
create index capital_public_retention_controls_policy_idx on private.capital_public_retention_controls(policy_id);
create table private.capital_public_purge_health (
 worker_token_id uuid primary key references private.worker_tokens(id),
 polled_at timestamptz not null, updated_at timestamptz not null default clock_timestamp()
);

create table private.capital_public_payload_allocations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 delivery_id uuid not null, request_id uuid not null, license_id uuid not null, licensing_organization_id uuid not null,
 job_id uuid not null, worker_token_id uuid not null references private.worker_tokens(id),
 worker_account_id uuid not null references auth.users(id), capability_sha256 bytea not null,
 policy_id uuid not null references private.capital_public_retention_policies(id),
 payload_fingerprint text not null check(payload_fingerprint~'^[a-f0-9]{64}$'),
 byte_length bigint not null check(byte_length between 1 and 1048576),
 bucket_id text not null default 'capital-input-capture' check(bucket_id='capital-input-capture'),
 object_path text not null unique,
 retained_at timestamptz not null, expires_at timestamptz not null, purge_at timestamptz not null, upload_expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(organization_id,delivery_id,request_id),
 foreign key(organization_id,delivery_id) references private.capital_public_deliveries(organization_id,id),
 foreign key(organization_id,license_id,licensing_organization_id) references private.capital_public_delivery_licenses(organization_id,id,licensing_organization_id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 check(isfinite(retained_at) and isfinite(expires_at) and isfinite(purge_at) and retained_at<purge_at and purge_at<expires_at),
 check(object_path=organization_id::text||'/'||id::text||'/payload.json')
);
create index capital_public_allocations_job_idx on private.capital_public_payload_allocations(organization_id,job_id);
create index capital_public_allocations_license_idx on private.capital_public_payload_allocations(organization_id,license_id,licensing_organization_id);
create index capital_public_allocations_worker_idx on private.capital_public_payload_allocations(worker_token_id);
create index capital_public_allocations_policy_idx on private.capital_public_payload_allocations(policy_id);
create index capital_public_allocations_account_idx on private.capital_public_payload_allocations(worker_account_id);

create table private.capital_public_retained_payloads (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 allocation_id uuid not null, storage_object_id uuid not null, storage_version text not null check(length(storage_version) between 1 and 1024),
 verified_sha256 text not null check(verified_sha256~'^[a-f0-9]{64}$'), verified_size bigint not null check(verified_size between 1 and 1048576),
 verified_by uuid not null references auth.users(id), verified_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(organization_id,allocation_id), unique(storage_object_id),
 foreign key(organization_id,allocation_id) references private.capital_public_payload_allocations(organization_id,id)
 -- Deliberately no FK to storage.objects: physical erase must leave this immutable receipt.
);
create index capital_public_retained_verifier_idx on private.capital_public_retained_payloads(verified_by);
create table private.capital_public_payload_purge_queue (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 allocation_id uuid not null, status text not null default 'pending' check(status in ('pending','leased','purged')),
 next_check_at timestamptz not null default clock_timestamp(), effective_purge_at timestamptz not null check(isfinite(effective_purge_at)), attempts integer not null default 0 check(attempts>=0),
 worker_token_id uuid references private.worker_tokens(id), leased_account_id uuid references auth.users(id),
 capability_sha256 bytea, lease_expires_at timestamptz, last_reason text,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(organization_id,allocation_id),
 foreign key(organization_id,allocation_id) references private.capital_public_payload_allocations(organization_id,id),
 check(status<>'leased' or num_nonnulls(worker_token_id,leased_account_id,capability_sha256,lease_expires_at)=4)
);
create index capital_public_purge_deadline_idx on private.capital_public_payload_purge_queue(effective_purge_at) where status<>'purged';
create index capital_public_purge_due_idx on private.capital_public_payload_purge_queue(next_check_at,id) where status<>'purged';
create index capital_public_purge_worker_idx on private.capital_public_payload_purge_queue(worker_token_id);
create index capital_public_purge_account_idx on private.capital_public_payload_purge_queue(leased_account_id);
create table private.capital_public_payload_erasure_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 purge_id uuid not null, allocation_id uuid not null, erased_by uuid not null references auth.users(id),
 storage_delete_confirmed boolean not null check(storage_delete_confirmed), erased_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id), unique(organization_id,purge_id),
 foreign key(organization_id,purge_id) references private.capital_public_payload_purge_queue(organization_id,id),
 foreign key(organization_id,allocation_id) references private.capital_public_payload_allocations(organization_id,id)
);
create index capital_public_erasure_allocation_idx on private.capital_public_payload_erasure_events(organization_id,allocation_id);
create index capital_public_erasure_actor_idx on private.capital_public_payload_erasure_events(erased_by);

do $$ declare t text; begin
 foreach t in array array['capital_public_retention_policies','capital_public_retention_controls','capital_public_purge_health',
 'capital_public_payload_allocations','capital_public_retained_payloads','capital_public_payload_purge_queue','capital_public_payload_erasure_events'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create policy %I on private.%I for select to anon,authenticated using(false)',t||'_select',t);
  execute format('create policy %I on private.%I for insert to anon,authenticated with check(false)',t||'_insert',t);
  execute format('create policy %I on private.%I for update to anon,authenticated using(false) with check(false)',t||'_update',t);
  execute format('create policy %I on private.%I for delete to anon,authenticated using(false)',t||'_delete',t);
 end loop;
 foreach t in array array['capital_public_retention_policies','capital_public_payload_allocations','capital_public_retained_payloads','capital_public_payload_erasure_events'] loop
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 end loop;
 foreach t in array array['capital_public_payload_allocations','capital_public_retained_payloads','capital_public_payload_erasure_events'] loop
  execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end; $$;
-- Storage owns object mutations. No UPDATE/upsert policy will be granted for this bucket.
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='storage' and table_name='buckets' and column_name='versioning_status') then
  execute $sql$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types,versioning_status)
   values('capital-input-capture','capital-input-capture',false,1048576,array['application/json'],'DISABLED')$sql$;
 else
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('capital-input-capture','capital-input-capture',false,1048576,array['application/json']);
 end if;
end; $$;

create function private.capital_public_capture_bucket_safe_v1() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from storage.buckets b where b.id='capital-input-capture' and not b.public
  and b.file_size_limit=1048576 and b.allowed_mime_types=array['application/json']::text[]
  and coalesce(to_jsonb(b)->>'versioning_status','DISABLED')='DISABLED');
$$;
-- Clock-only maintenance identity. Unlike worker_identity, no token UPDATE or job/human
-- authority is needed to erase expired content. Credential/account revocation still wins.
create function private.capital_public_purge_worker_v1(p_worker_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare worker uuid; begin
 if auth.uid() is null or p_worker_token is null or length(p_worker_token)<32 then raise exception 'capture_purge_denied' using errcode='42501'; end if;
 select t.id into worker from private.worker_tokens t join auth.users u on u.id=t.execution_account_user_id
 where t.token_sha256=extensions.digest(p_worker_token,'sha256') and t.status='active' and t.revoked_at is null
 and t.execution_account_user_id=auth.uid() and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp());
 if worker is null then raise exception 'capture_purge_denied' using errcode='42501'; end if;
 begin
  perform 1 from auth.users where id=auth.uid() for share nowait;
  perform 1 from private.worker_tokens where id=worker for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001'; end;
 if not exists(select 1 from private.worker_tokens t join auth.users u on u.id=t.execution_account_user_id
  where t.id=worker and t.status='active' and t.revoked_at is null and t.execution_account_user_id=auth.uid()
  and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())) then raise exception 'capture_purge_denied' using errcode='42501'; end if;
 return worker;
end; $$;

create function private.capital_public_retention_healthy_v1(p_worker_id uuid,p_policy_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from private.capital_public_retention_controls c
 join private.capital_public_retention_policies p on p.id=p_policy_id
 join private.capital_public_purge_health h on h.worker_token_id=p_worker_id
 join private.worker_tokens w on w.id=h.worker_token_id
 where c.enabled and w.status='active' and w.revoked_at is null
 and h.polled_at>clock_timestamp()-make_interval(secs=>p.heartbeat_seconds))
 and private.capital_public_capture_bucket_safe_v1()
 and not exists(select 1 from private.capital_public_payload_purge_queue q
 where q.status<>'purged' and q.effective_purge_at<=clock_timestamp());
$$;

-- Proof is bound to the immutable intent's exact pins, not freshly substituted rights.
-- Current constraints may shorten, never extend, the versioned local/pinned deadline.
create function private.capital_public_retention_deadline_v1(p_license_id uuid,p_organization_id uuid,p_observed_at timestamptz,p_policy_id uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare lic private.capital_public_delivery_licenses; intent private.capital_public_deliveries;
 pins jsonb; proof jsonb; license_url text; deadline timestamptz; policy private.capital_public_retention_policies;
begin
 select * into lic from private.capital_public_delivery_licenses where organization_id=p_organization_id and id=p_license_id;
 if not found then return null; end if;
 select * into strict intent from private.capital_public_deliveries where organization_id=lic.organization_id and id=lic.delivery_id;
 select * into policy from private.capital_public_retention_policies where id=p_policy_id;
 if not found or not isfinite(p_observed_at) then return null; end if;
 select jsonb_agg(jsonb_build_object('sourceVersionId',source_version_id,'rightsVersionId',rights_version_id,'sourceBindingId',source_binding_id,'role',pin_role)
  order by source_version_id,rights_version_id,pin_role) into pins from private.capital_public_delivery_license_pins
  where organization_id=lic.organization_id and license_id=lic.id;
 select public_source_url into license_url from private.source_rights_versions where organization_id=lic.licensing_organization_id and id=lic.rights_version_id;
 proof:=private.capital_public_license_proof_v1(lic.licensing_organization_id,lic.source_version_id,lic.rights_version_id,lic.source_binding_id,
  license_url,lic.public_payload_fingerprint,intent.delivered_at,pins,lic.dependency_fingerprint);
 if proof is null then return null; end if;
 select min(least(r.expires_at,r.store_until)) into deadline from (
  select r0.expires_at,r0.store_until from private.capital_public_delivery_license_pins x
   join private.source_rights_versions r0 on r0.organization_id=x.licensing_organization_id and r0.source_version_id=x.source_version_id and r0.id=x.rights_version_id
   where x.organization_id=lic.organization_id and x.license_id=lic.id
  union all
  select r0.expires_at,r0.store_until from (select distinct source_version_id from private.capital_public_delivery_license_pins
   where organization_id=lic.organization_id and license_id=lic.id) x
   join lateral(select expires_at,store_until from private.source_rights_versions
    where organization_id=lic.licensing_organization_id and source_version_id=x.source_version_id order by revision desc limit 1) r0 on true
 ) r;
 if deadline is null then return null; end if;
 deadline:=least(deadline,p_observed_at+make_interval(secs=>policy.maximum_retention_seconds));
 if deadline is null or not isfinite(deadline) or deadline<=clock_timestamp() then return null; end if;
 return deadline;
end; $$;

create function private.capital_public_allocation_job_current_v1(p_allocation_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.capital_public_payload_allocations a
 join public.processing_jobs j on j.organization_id=a.organization_id and j.id=a.job_id
 join private.worker_tokens w on w.id=a.worker_token_id
 join auth.users worker on worker.id=a.worker_account_id
 join auth.users human on human.id=j.authorization_subject_id
 join public.organization_memberships m on m.organization_id=j.organization_id and m.user_id=human.id
 where a.id=p_allocation_id and a.worker_account_id=auth.uid() and j.leased_account_user_id=auth.uid()
 and j.leased_by=a.worker_token_id and j.capability_sha256=a.capability_sha256 and j.status='leased'
 and j.lease_expires_at>clock_timestamp() and private.job_authority_is_current_v1(j.id)
 and w.status='active' and w.revoked_at is null and w.execution_account_user_id=auth.uid()
 and worker.deleted_at is null and (worker.banned_until is null or worker.banned_until<=clock_timestamp())
 and human.deleted_at is null and (human.banned_until is null or human.banned_until<=clock_timestamp()) and m.status='active'
 and exists(select 1 from private.principals p join private.principals h on h.organization_id=p.organization_id and h.id=p.human_principal_id
  where p.organization_id=j.organization_id and p.processing_job_id=j.id and p.kind='worker' and p.revoked_at is null
  and p.worker_token_id=j.leased_by and p.account_user_id=auth.uid() and p.expires_at>clock_timestamp()
  and h.user_id=j.authorization_subject_id and h.revoked_at is null));
$$;

create function private.worker_prepare_capital_public_payload_v1(p_job_id uuid,p_capability_token text,p_delivery_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 intent private.capital_public_deliveries; lic private.capital_public_delivery_licenses;
 a private.capital_public_payload_allocations; policy private.capital_public_retention_policies; receipt private.capital_public_retained_payloads; checked jsonb;
 stamp timestamptz:=clock_timestamp(); deadline timestamptz; allocation_id uuid:=gen_random_uuid(); replayed boolean:=false;
begin
 if p_delivery_id is null or p_request_id is null or not private.capital_public_payload_valid_v1(p_payload) then raise exception 'capture_payload_invalid' using errcode='22023'; end if;
 select d.* into intent from private.capital_public_deliveries d join private.capital_public_input_snapshots s on s.organization_id=d.organization_id and s.id=d.capture_id
  where d.organization_id=j.organization_id and d.id=p_delivery_id and s.job_id=j.id and d.origin_kind='published_public_payload';
 if not found or intent.payload_fingerprint<>encode(extensions.digest(p_payload::text,'sha256'),'hex') then raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
 -- Current context must still be the exact identity observed by the metadata frontier.
 perform private.worker_load_capital_project_capture_context_v1(p_job_id,p_capability_token);
 select * into lic from private.capital_public_delivery_licenses where organization_id=j.organization_id and delivery_id=intent.id;
 if not found or lic.public_payload_fingerprint<>private.public_source_payload_sha256_v1(p_payload) then raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
 begin
  perform 1 from private.capital_public_retention_controls where singleton for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001'; end;
 select p.* into policy from private.capital_public_retention_policies p join private.capital_public_retention_controls c on c.policy_id=p.id where c.singleton and c.enabled;
 if not found or not private.capital_public_retention_healthy_v1(j.leased_by,policy.id) then raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and delivery_id=intent.id and request_id=p_request_id;
 if found then
  if a.job_id<>j.id or a.worker_account_id<>auth.uid() or a.worker_token_id<>j.leased_by or a.capability_sha256<>j.capability_sha256
   or a.payload_fingerprint<>intent.payload_fingerprint or a.byte_length<>octet_length(p_payload::text) then raise exception 'capital_capture_retention_conflict' using errcode='23505'; end if;
  deadline:=private.capital_public_retention_deadline_v1(a.license_id,a.organization_id,a.retained_at,a.policy_id);
  if deadline is null or least(a.purge_at,deadline-make_interval(secs=>policy.purge_margin_seconds))<=clock_timestamp()
   or exists(select 1 from private.capital_public_payload_purge_queue where organization_id=a.organization_id and allocation_id=a.id and status<>'pending') then
   raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
  select * into receipt from private.capital_public_retained_payloads where organization_id=a.organization_id and allocation_id=a.id;
  if found then
   checked:=private.worker_read_capital_public_payload_v1(p_job_id,p_capability_token,receipt.id);
   return jsonb_build_object('retainedPayloadId',receipt.id,'allocationId',a.id,'state','complete',
    'expiresAt',checked->'expiresAt','purgeAt',checked->'purgeAt','replayed',true);
  end if;
  if a.upload_expires_at<=clock_timestamp() then raise exception 'capital_capture_upload_expired' using errcode='42501'; end if;
  replayed:=true;
 else
  deadline:=private.capital_public_retention_deadline_v1(lic.id,j.organization_id,stamp,policy.id);
  if deadline is null or deadline<=clock_timestamp()+make_interval(secs=>policy.purge_margin_seconds+120) then raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
  if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
  insert into private.capital_public_payload_allocations(id,organization_id,delivery_id,request_id,license_id,licensing_organization_id,job_id,
   worker_token_id,worker_account_id,capability_sha256,policy_id,payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at)
  values(allocation_id,j.organization_id,intent.id,p_request_id,lic.id,lic.licensing_organization_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,
   policy.id,intent.payload_fingerprint,octet_length(p_payload::text),j.organization_id::text||'/'||allocation_id::text||'/payload.json',stamp,deadline,
   deadline-make_interval(secs=>policy.purge_margin_seconds),stamp+interval '120 seconds') on conflict(organization_id,delivery_id,request_id) do nothing returning * into a;
  if not found then
   select * into strict a from private.capital_public_payload_allocations where organization_id=j.organization_id and delivery_id=intent.id and request_id=p_request_id;
   if a.job_id<>j.id or a.worker_account_id<>auth.uid() or a.worker_token_id<>j.leased_by or a.capability_sha256<>j.capability_sha256
    or a.payload_fingerprint<>intent.payload_fingerprint or a.byte_length<>octet_length(p_payload::text) then raise exception 'capital_capture_retention_conflict' using errcode='23505'; end if;
   deadline:=private.capital_public_retention_deadline_v1(a.license_id,a.organization_id,a.retained_at,a.policy_id);
   if deadline is null or a.upload_expires_at<=clock_timestamp() or least(a.purge_at,deadline-make_interval(secs=>policy.purge_margin_seconds))<=clock_timestamp()
    then raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
   replayed:=true;
  end if;
  insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at)
   values(a.organization_id,a.id,least(a.upload_expires_at,a.purge_at),least(a.upload_expires_at,a.purge_at)) on conflict(organization_id,allocation_id) do nothing;
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
 return jsonb_build_object('allocationId',a.id,'deliveryId',a.delivery_id,'bucket',a.bucket_id,'path',a.object_path,
  'payloadFingerprint',a.payload_fingerprint,'byteLength',a.byte_length,'canonicalPayload',p_payload::text,
  'retainedAt',a.retained_at,'expiresAt',least(a.expires_at,deadline),'purgeAt',least(a.purge_at,deadline-make_interval(secs=>policy.purge_margin_seconds)),
  'uploadExpiresAt',a.upload_expires_at,'state','allocated','replayed',replayed);
end; $$;

create function private.worker_commit_capital_public_payload_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,
 p_storage_version text,p_verified_sha256 text,p_verified_size bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 a private.capital_public_payload_allocations; receipt private.capital_public_retained_payloads;
 object_row storage.objects; deadline timestamptz; margin integer; replayed boolean:=false;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and id=p_allocation_id and job_id=j.id;
 if not found or not private.capital_public_allocation_job_current_v1(a.id) then raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
 if p_verified_sha256 is null or p_verified_size is null or p_storage_object_id is null or p_storage_version is null or length(p_storage_version) not between 1 and 1024 or p_verified_sha256<>a.payload_fingerprint or p_verified_size<>a.byte_length then
  raise exception 'capture_payload_proof_invalid' using errcode='22023'; end if;
 perform private.worker_load_capital_project_capture_context_v1(p_job_id,p_capability_token);
 begin
  perform 1 from private.capital_public_retention_controls where singleton for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001'; end;
 select purge_margin_seconds into margin from private.capital_public_retention_policies where id=a.policy_id;
 deadline:=private.capital_public_retention_deadline_v1(a.license_id,a.organization_id,a.retained_at,a.policy_id);
 if deadline is null or least(a.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp() or not private.capital_public_retention_healthy_v1(j.leased_by,a.policy_id)
  then raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
 begin
  perform 1 from private.capital_public_payload_purge_queue where organization_id=a.organization_id and allocation_id=a.id and status='pending' for share nowait;
  if not found then raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
  select * into object_row from storage.objects where id=p_storage_object_id and bucket_id=a.bucket_id and name=a.object_path for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001'; end;
 if not found or object_row.version is distinct from p_storage_version or (to_jsonb(object_row)->>'is_versioned')::boolean is true
  or (to_jsonb(object_row)->>'is_delete_marker')::boolean is true or to_jsonb(object_row)->>'archived_at' is not null
  or object_row.metadata->>'size' is distinct from a.byte_length::text or object_row.metadata->>'mimetype' is distinct from 'application/json' then
  raise exception 'capture_payload_proof_invalid' using errcode='22023'; end if;
 select * into receipt from private.capital_public_retained_payloads where organization_id=a.organization_id and allocation_id=a.id;
 if found then
  if receipt.storage_object_id<>p_storage_object_id or receipt.storage_version is distinct from p_storage_version
   or receipt.verified_sha256<>p_verified_sha256 or receipt.verified_size<>p_verified_size then raise exception 'capital_capture_retention_conflict' using errcode='23505'; end if;
  replayed:=true;
 else
  if a.upload_expires_at<=clock_timestamp() then raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
  if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
  insert into private.capital_public_retained_payloads(organization_id,allocation_id,storage_object_id,storage_version,verified_sha256,verified_size,verified_by)
  values(a.organization_id,a.id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size,auth.uid()) returning * into receipt;
  update private.capital_public_payload_purge_queue set next_check_at=least(a.purge_at,deadline-make_interval(secs=>margin)),
   effective_purge_at=least(a.purge_at,deadline-make_interval(secs=>margin)),updated_at=clock_timestamp()
   where organization_id=a.organization_id and allocation_id=a.id;
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
 return jsonb_build_object('retainedPayloadId',receipt.id,'allocationId',a.id,'state','complete','expiresAt',least(a.expires_at,deadline),
  'purgeAt',least(a.purge_at,deadline-make_interval(secs=>margin)),'replayed',replayed);
end; $$;

create function private.worker_read_capital_public_payload_v1(p_job_id uuid,p_capability_token text,p_retained_payload_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 a private.capital_public_payload_allocations; receipt private.capital_public_retained_payloads; object_row storage.objects;
 deadline timestamptz; margin integer;
begin
 select * into receipt from private.capital_public_retained_payloads where organization_id=j.organization_id and id=p_retained_payload_id;
 if not found then raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
 select * into strict a from private.capital_public_payload_allocations where organization_id=j.organization_id and id=receipt.allocation_id;
 if a.job_id<>j.id or not private.capital_public_allocation_job_current_v1(a.id) or not private.capital_public_retention_healthy_v1(a.worker_token_id,a.policy_id)
  then raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
 perform private.worker_load_capital_project_capture_context_v1(p_job_id,p_capability_token);
 deadline:=private.capital_public_retention_deadline_v1(a.license_id,a.organization_id,a.retained_at,a.policy_id);
 select purge_margin_seconds into margin from private.capital_public_retention_policies where id=a.policy_id;
 if deadline is null or least(a.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
  or not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=a.organization_id and allocation_id=a.id and status='pending') then
  raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
 select * into object_row from storage.objects where id=receipt.storage_object_id and bucket_id=a.bucket_id and name=a.object_path;
 if not found or object_row.version is distinct from receipt.storage_version or object_row.metadata->>'size' is distinct from receipt.verified_size::text
  or object_row.metadata->>'mimetype' is distinct from 'application/json' or (to_jsonb(object_row)->>'is_versioned')::boolean is true
  or (to_jsonb(object_row)->>'is_delete_marker')::boolean is true or to_jsonb(object_row)->>'archived_at' is not null then
  raise exception 'capital_capture_retention_denied' using errcode='42501'; end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
 return jsonb_build_object('retainedPayloadId',receipt.id,'allocationId',a.id,'bucket',a.bucket_id,'path',a.object_path,
  'payloadFingerprint',receipt.verified_sha256,'byteLength',receipt.verified_size,'storageObjectId',receipt.storage_object_id,'storageVersion',receipt.storage_version,
  'expiresAt',least(a.expires_at,deadline),'purgeAt',least(a.purge_at,deadline-make_interval(secs=>margin)),'state','complete');
end; $$;

create function private.worker_claim_capital_capture_purge_v1(p_worker_token text,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token); item private.capital_public_payload_purge_queue;
 a private.capital_public_payload_allocations; deadline timestamptz; margin integer; capability text;
 items jsonb:='[]'::jsonb; polled timestamptz:=clock_timestamp(); object_id uuid; object_version text; has_receipt boolean;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'capture_purge_invalid' using errcode='22023'; end if;
 if not private.capital_public_capture_bucket_safe_v1() then raise exception 'capture_bucket_unsafe' using errcode='42501'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-capture-purge-poll:'||worker::text,0)) then raise exception 'capital_capture_retry' using errcode='40001'; end if;
 insert into private.capital_public_purge_health(worker_token_id,polled_at) values(worker,polled)
 on conflict(worker_token_id) do update set polled_at=excluded.polled_at,updated_at=clock_timestamp();
 -- Rights/binding/dependency events expedite exact linked rows. Poll only due rows;
 -- no periodic full sweep of retained objects. Human/job revocation still denies read.
 for item in select * from private.capital_public_payload_purge_queue
  where status<>'purged' and next_check_at<=clock_timestamp() and (status<>'leased' or lease_expires_at<=clock_timestamp())
  order by next_check_at,id limit p_limit*10 for update skip locked loop
  select * into strict a from private.capital_public_payload_allocations where organization_id=item.organization_id and id=item.allocation_id;
  select purge_margin_seconds into margin from private.capital_public_retention_policies where id=a.policy_id;
  begin
   deadline:=private.capital_public_retention_deadline_v1(a.license_id,a.organization_id,a.retained_at,a.policy_id);
  exception when sqlstate '40001' then
   update private.capital_public_payload_purge_queue set status='pending',next_check_at=clock_timestamp()+interval '1 second',updated_at=clock_timestamp(),
    last_reason='policy_retry',worker_token_id=null,leased_account_id=null,capability_sha256=null,lease_expires_at=null where id=item.id;
   continue;
  end;
  select exists(select 1 from private.capital_public_retained_payloads where organization_id=a.organization_id and allocation_id=a.id) into has_receipt;
  if deadline is not null and item.effective_purge_at>clock_timestamp() and least(a.purge_at,deadline-make_interval(secs=>margin))>clock_timestamp()
   and (has_receipt or a.upload_expires_at>clock_timestamp()) then
   update private.capital_public_payload_purge_queue set status='pending',next_check_at=least(a.purge_at,
    deadline-make_interval(secs=>margin),case when has_receipt then a.purge_at else a.upload_expires_at end),
    effective_purge_at=least(item.effective_purge_at,a.purge_at,deadline-make_interval(secs=>margin)),updated_at=clock_timestamp(),
    worker_token_id=null,leased_account_id=null,capability_sha256=null,lease_expires_at=null where id=item.id;
   continue;
  end if;
  capability:=encode(extensions.gen_random_bytes(32),'hex');
  update private.capital_public_payload_purge_queue set status='leased',attempts=attempts+1,worker_token_id=worker,leased_account_id=auth.uid(),
   capability_sha256=extensions.digest(capability,'sha256'),lease_expires_at=clock_timestamp()+interval '60 seconds',
   next_check_at=clock_timestamp()+interval '60 seconds',effective_purge_at=least(item.effective_purge_at,clock_timestamp()),updated_at=clock_timestamp() where id=item.id returning * into item;
  if exists(select 1 from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_path
   and ((to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then
   raise exception 'capture_bucket_unsafe' using errcode='42501'; end if;
  select o.id,o.version into object_id,object_version from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_path;
  items:=items||jsonb_build_array(jsonb_build_object('purgeId',item.id,'allocationId',a.id,'bucket',a.bucket_id,'path',a.object_path,
   'storageObjectId',object_id,'storageVersion',object_version,'purgeCapability',capability,'leaseExpiresAt',item.lease_expires_at));
  exit when jsonb_array_length(items)>=p_limit;
 end loop;
 if exists(select 1 from jsonb_array_elements(items) e where (e->>'leaseExpiresAt')::timestamptz<=clock_timestamp()) then raise exception 'capital_capture_retry' using errcode='40001'; end if;
 return jsonb_build_object('items',items,'polledAt',polled);
end; $$;

create function private.worker_ack_capital_capture_purge_v1(p_worker_token text,p_purge_id uuid,p_purge_capability text,p_storage_delete_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token); item private.capital_public_payload_purge_queue;
 a private.capital_public_payload_allocations;
begin
 if p_storage_delete_confirmed is distinct from true then raise exception 'capture_purge_proof_invalid' using errcode='22023'; end if;
 begin
  select * into item from private.capital_public_payload_purge_queue where id=p_purge_id for update nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001'; end;
 if not found or item.worker_token_id is distinct from worker or item.leased_account_id is distinct from auth.uid()
  or p_purge_capability is null or item.capability_sha256 is distinct from extensions.digest(p_purge_capability,'sha256') then
  raise exception 'capture_purge_denied' using errcode='42501'; end if;
 if item.status='purged' then return jsonb_build_object('purged',true,'replayed',true); end if;
 if item.status<>'leased' or item.lease_expires_at<=clock_timestamp() then raise exception 'capture_purge_denied' using errcode='42501'; end if;
 select * into strict a from private.capital_public_payload_allocations where organization_id=item.organization_id and id=item.allocation_id;
 if not private.capital_public_capture_bucket_safe_v1() or exists(select 1 from storage.objects where bucket_id=a.bucket_id and name=a.object_path) then
  raise exception 'capture_purge_proof_invalid' using errcode='22023'; end if;
 -- The bounded worker must have confirmed Storage.remove and authenticated HEAD absence.
 -- SQL absence alone is not a physical receipt; metadata-only SQL DELETE is forbidden.
 insert into private.capital_public_payload_erasure_events(organization_id,purge_id,allocation_id,erased_by,storage_delete_confirmed)
 values(item.organization_id,item.id,item.allocation_id,auth.uid(),true);
 if item.lease_expires_at<=clock_timestamp() then raise exception 'capture_purge_denied' using errcode='42501'; end if;
 update private.capital_public_payload_purge_queue set status='purged',updated_at=clock_timestamp() where id=item.id;
 return jsonb_build_object('purged',true,'replayed',false);
end; $$;

create function private.worker_retry_capital_capture_purge_v1(p_worker_token text,p_purge_id uuid,p_purge_capability text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token); item private.capital_public_payload_purge_queue;
begin
 if p_reason is null or p_reason not in ('storage_unavailable','storage_delete_failed','storage_absence_unconfirmed') then raise exception 'capture_purge_invalid' using errcode='22023'; end if;
 begin
  select * into item from private.capital_public_payload_purge_queue where id=p_purge_id for update nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001'; end;
 if not found or item.worker_token_id is distinct from worker or item.leased_account_id is distinct from auth.uid() or p_purge_capability is null
  or item.capability_sha256 is distinct from extensions.digest(p_purge_capability,'sha256') or item.status<>'leased' or item.lease_expires_at<=clock_timestamp() then
  raise exception 'capture_purge_denied' using errcode='42501'; end if;
 update private.capital_public_payload_purge_queue set status='pending',next_check_at=clock_timestamp()+make_interval(secs=>least(30,greatest(1,item.attempts))),
  last_reason=p_reason,worker_token_id=null,leased_account_id=null,capability_sha256=null,lease_expires_at=null,updated_at=clock_timestamp() where id=item.id;
 return jsonb_build_object('retryScheduled',true);
end; $$;

-- Exact-path grants: no client/owner bucket fallback, no signed URLs, copy, list or
-- replacement. Purge metadata SELECT is operation-limited and cannot read body bytes.
create function private.worker_can_access_capital_public_payload_v1(p_bucket text,p_path text,p_mode text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations; deadline timestamptz; margin integer;
begin
 if auth.uid() is null or p_bucket<>'capital-input-capture' or not private.capital_public_capture_bucket_safe_v1() then return false; end if;
 select * into a from private.capital_public_payload_allocations where bucket_id=p_bucket and object_path=p_path;
 if not found then return false; end if;
 if exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path
  and ((to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false; end if;
 if p_mode in ('purge','purge_select') then
  if p_mode='purge_select' and not storage.allow_any_operation(array['object.delete','object.delete_many','object.get_authenticated_info','object.head_authenticated_info']) then return false; end if;
  return exists(select 1 from private.capital_public_payload_purge_queue q join private.worker_tokens w on w.id=q.worker_token_id
   join auth.users u on u.id=q.leased_account_id where q.organization_id=a.organization_id and q.allocation_id=a.id and q.status='leased'
   and q.leased_account_id=auth.uid() and q.lease_expires_at>clock_timestamp() and w.status='active' and w.revoked_at is null
   and w.execution_account_user_id=auth.uid() and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()));
 end if;
 if p_mode not in ('read','upload') or not private.capital_public_allocation_job_current_v1(a.id)
  or not private.capital_public_retention_healthy_v1(a.worker_token_id,a.policy_id) then return false; end if;
 if p_mode='upload' and (a.upload_expires_at<=clock_timestamp() or exists(select 1 from private.capital_public_retained_payloads where organization_id=a.organization_id and allocation_id=a.id)) then return false; end if;
 if p_mode='read' and not storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info']) then return false; end if;
 if not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=a.organization_id and allocation_id=a.id and status='pending') then return false; end if;
 deadline:=private.capital_public_retention_deadline_v1(a.license_id,a.organization_id,a.retained_at,a.policy_id);
 select purge_margin_seconds into margin from private.capital_public_retention_policies where id=a.policy_id;
 if deadline is null or least(a.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp() then return false; end if;
 return true;
end; $$;
revoke all on function private.worker_can_access_capital_public_payload_v1(text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_can_access_capital_public_payload_v1(text,text,text) to authenticated;
create policy capital_capture_objects_insert on storage.objects for insert to authenticated
 with check(bucket_id='capital-input-capture' and private.worker_can_access_capital_public_payload_v1(bucket_id,name,'upload'));
create policy capital_capture_objects_select on storage.objects for select to authenticated
 using(bucket_id='capital-input-capture' and (private.worker_can_access_capital_public_payload_v1(bucket_id,name,'read')
  or private.worker_can_access_capital_public_payload_v1(bucket_id,name,'purge_select')));
create policy capital_capture_objects_delete on storage.objects for delete to authenticated
 using(bucket_id='capital-input-capture' and private.worker_can_access_capital_public_payload_v1(bucket_id,name,'purge'));
-- The existing global restrictive export barrier remains unchanged for every old bucket.
create or replace function private.storage_export_purpose_allowed_v1(p_bucket text,p_path text)
returns boolean language sql volatile security definer set search_path='' as $$
 select case
 when p_bucket='capital-input-capture' then private.worker_can_access_capital_public_payload_v1(p_bucket,p_path,'read')
  or private.worker_can_access_capital_public_payload_v1(p_bucket,p_path,'purge_select')
 when not storage.allow_any_operation(array['object.get_authenticated','object.copy']) then true
 when p_bucket='brand-templates' then true
 else private.evaluate_resource_policy_v1(private.storage_organization_id(p_path),private.storage_opportunity_id(p_path),auth.uid(),'read','export')
 or private.worker_can_access_document_storage_v1(p_bucket,p_path,false)
 or (p_bucket='case-artifacts' and private.worker_can_access_capital_project_material(p_path,false))
 or private.worker_can_rotate_storage_v1(p_bucket,p_path)
 end;
$$;

create function public.worker_prepare_capital_public_payload_v1(p_job_id uuid,p_capability_token text,p_delivery_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_prepare_capital_public_payload_v1(p_job_id,p_capability_token,p_delivery_id,p_request_id,p_payload);$$;
create function public.worker_commit_capital_public_payload_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,p_storage_version text,p_verified_sha256 text,p_verified_size bigint)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_commit_capital_public_payload_v1(p_job_id,p_capability_token,p_allocation_id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size);$$;
create function public.worker_read_capital_public_payload_v1(p_job_id uuid,p_capability_token text,p_retained_payload_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_read_capital_public_payload_v1(p_job_id,p_capability_token,p_retained_payload_id);$$;
create function public.worker_claim_capital_capture_purge_v1(p_worker_token text,p_limit integer default 20)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_claim_capital_capture_purge_v1(p_worker_token,p_limit);$$;
create function public.worker_ack_capital_capture_purge_v1(p_worker_token text,p_purge_id uuid,p_purge_capability text,p_storage_delete_confirmed boolean)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_ack_capital_capture_purge_v1(p_worker_token,p_purge_id,p_purge_capability,p_storage_delete_confirmed);$$;
create function public.worker_retry_capital_capture_purge_v1(p_worker_token text,p_purge_id uuid,p_purge_capability text,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_retry_capital_capture_purge_v1(p_worker_token,p_purge_id,p_purge_capability,p_reason);$$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('private','public') and p.proname in ('capital_public_capture_bucket_safe_v1','capital_public_purge_worker_v1',
   'capital_public_retention_healthy_v1','capital_public_retention_deadline_v1','capital_public_allocation_job_current_v1',
   'worker_prepare_capital_public_payload_v1','worker_commit_capital_public_payload_v1','worker_read_capital_public_payload_v1',
   'worker_claim_capital_capture_purge_v1','worker_ack_capital_capture_purge_v1','worker_retry_capital_capture_purge_v1') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname like 'worker_%' then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end; $$;

-- Preserve the entire effective contract and all previous capabilities. Refuse drift.
do $$ declare body text; needle text:='"institutional-native-projection.v1"]''::jsonb'; begin
 body:=pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure);
 if length(body)-length(replace(body,needle,''))<>length(needle) then raise exception 'capital_retention_runtime_contract_changed'; end if;
 execute replace(body,needle,'"institutional-native-projection.v1","capital-public-retention.v1"]''::jsonb');
end; $$;

create trigger capital_public_purge_queue_audit after insert or update or delete on private.capital_public_payload_purge_queue
 for each row execute function private.capture_audit_event();
create trigger capital_public_purge_queue_updated_at before update on private.capital_public_payload_purge_queue
 for each row execute function private.set_updated_at();
create trigger capital_public_retention_controls_updated_at before update on private.capital_public_retention_controls
 for each row execute function private.set_updated_at();
create trigger capital_public_purge_health_updated_at before update on private.capital_public_purge_health
 for each row execute function private.set_updated_at();
-- Event propagation only schedules deletion of exact bridge-linked allocations. It does
-- not disclose publisher rows or widen any source/work grant. Queue holders never wait
-- for publisher policy/binding locks (try/NOWAIT), avoiding trigger/queue lock inversion.
create function private.expedite_capital_public_retention_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare publisher uuid; version_id uuid; binding_id uuid; begin
 if tg_table_name='source_rights_versions' then publisher:=new.organization_id; version_id:=new.source_version_id;
 elsif tg_table_name='source_bindings' then
  if new.revoked_at is not distinct from old.revoked_at then return new; end if;
  publisher:=new.organization_id; binding_id:=new.id;
 elsif tg_table_name='resource_dependencies' then
  publisher:=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
  version_id:=case when tg_op='DELETE' then old.derived_version_id else new.derived_version_id end;
 end if;
 update private.capital_public_payload_purge_queue q set next_check_at=clock_timestamp(),updated_at=clock_timestamp()
 from private.capital_public_payload_allocations a where q.organization_id=a.organization_id and q.allocation_id=a.id and q.status<>'purged'
 and exists(select 1 from private.capital_public_delivery_license_pins pin where pin.organization_id=a.organization_id and pin.license_id=a.license_id
  and pin.licensing_organization_id=publisher and ((version_id is not null and pin.source_version_id=version_id) or (binding_id is not null and pin.source_binding_id=binding_id)));
 return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function private.expedite_capital_public_retention_v1() from public,anon,authenticated,service_role;
create trigger capital_public_rights_retention_changed after insert on private.source_rights_versions
 for each row execute function private.expedite_capital_public_retention_v1();
create trigger capital_public_binding_retention_changed after update of revoked_at on public.source_bindings
 for each row execute function private.expedite_capital_public_retention_v1();
create trigger capital_public_dependency_retention_changed after insert or delete on private.resource_dependencies
 for each row execute function private.expedite_capital_public_retention_v1();
