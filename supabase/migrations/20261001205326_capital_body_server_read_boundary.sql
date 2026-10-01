-- Captured bodies have no authenticated direct Storage read path. The server POST
-- verifies this command before and after physical readback; only that server holds
-- its internal Storage credential. Upload stays capability-bound and purge stays
-- independently scoped to its exact leased path. Both content families now use
-- their own authorized server POST readback and request-bound job capabilities
-- for upload; their existing rights, retention and immutable-proof guards remain.
set search_path='';
-- Reuse the existing internal request-binding helper for both captured families.
-- Its name/signature stay stable; no API role receives direct execution.
create or replace function private.capital_body_storage_job_authority_v1(p_allocation uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;headers jsonb;capability text;
begin
 if auth.uid() is null or p_allocation is null then return false;end if;
 begin
 headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 exception when invalid_text_representation then return false;end;
 if jsonb_typeof(headers) is distinct from 'object'
 or jsonb_typeof(headers->'x-offroad-job-id') is distinct from 'string'
 or jsonb_typeof(headers->'x-offroad-capability') is distinct from 'string' then return false;end if;
 select * into allocation from private.capital_public_payload_allocations a where a.id=p_allocation and a.content_kind in ('typed_body','public_source');
 if not found or headers->>'x-offroad-job-id' is distinct from allocation.job_id::text
 or (headers?'x-offroad-workspace' and headers->>'x-offroad-workspace' is distinct from allocation.organization_id::text) then return false;end if;
 capability:=headers->>'x-offroad-capability';
 if length(capability) not between 1 and 4096 or extensions.digest(capability,'sha256') is distinct from allocation.capability_sha256 then return false;end if;
 return private.capital_public_allocation_job_current_v1(allocation.id)
 and private.capital_public_capture_clock_current_v1(allocation.job_id,capability);
end; $$;
revoke all on function private.capital_body_storage_job_authority_v1(uuid) from public,anon,authenticated,service_role;

create or replace function private.capital_body_storage_allowed_v1(p_allocation uuid,p_mode text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;human uuid;deadline timestamptz;margin integer;
begin
 if auth.uid() is null or p_mode is distinct from 'upload' or not private.capital_body_storage_job_authority_v1(p_allocation) or not private.capital_public_capture_bucket_safe_v1() then return false;end if;
 select * into allocation from private.capital_public_payload_allocations where id=p_allocation and content_kind='typed_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id) then return false;end if;
 if exists(select 1 from storage.objects o where o.bucket_id=allocation.bucket_id and o.name=allocation.object_path
 and ((to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false;end if;
 if p_mode='upload' and (allocation.upload_expires_at<=clock_timestamp()
 or exists(select 1 from private.capital_public_retained_payloads where organization_id=allocation.organization_id and allocation_id=allocation.id)) then return false;end if;
 select authorization_subject_id into human from public.processing_jobs where organization_id=allocation.organization_id and id=allocation.job_id;
 if not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=allocation.organization_id and allocation_id=allocation.id and status='pending') then return false;end if;
 deadline:=private.capital_body_allocation_deadline_v1(allocation.organization_id,allocation.id,human);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 return deadline is not null and least(allocation.purge_at,deadline-make_interval(secs=>margin))>clock_timestamp()
 and private.capital_body_retention_healthy_v1(allocation.policy_id,allocation.organization_id,allocation.id)
 and private.capital_body_storage_job_authority_v1(allocation.id);
end; $$;

create function private.worker_read_capital_body_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;receipt private.capital_public_retained_payloads;
 physical_object storage.objects;deadline timestamptz;checked_deadline timestamptz;margin integer;result_dto jsonb;
begin
 if p_allocation_id is null then raise exception 'capital_body_read_invalid' using errcode='22023';end if;
 select a.* into allocation from private.capital_public_payload_allocations a
 where a.organization_id=job.organization_id and a.job_id=job.id and a.id=p_allocation_id and a.content_kind='typed_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id)
 or not private.capital_public_capture_bucket_safe_v1() then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 deadline:=private.capital_body_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 if deadline is null or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp() then
 raise exception 'capital_body_read_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 begin
 perform 1 from private.capital_public_payload_purge_queue q
 where q.organization_id=job.organization_id and q.allocation_id=allocation.id and q.status='pending' for share nowait;
 if not found then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 select o.* into physical_object from storage.objects o where o.bucket_id=allocation.bucket_id and o.name=allocation.object_path for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if physical_object.id is null or coalesce(length(physical_object.version),0) not between 1 and 1024
 or physical_object.metadata->>'size' is distinct from allocation.byte_length::text
 or physical_object.metadata->>'mimetype' is distinct from 'application/json'
 or (to_jsonb(physical_object)->>'is_versioned')::boolean is true
 or (to_jsonb(physical_object)->>'is_delete_marker')::boolean is true
 or to_jsonb(physical_object)->>'archived_at' is not null then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 select r.* into receipt from private.capital_public_retained_payloads r
 where r.organization_id=job.organization_id and r.allocation_id=allocation.id;
 if receipt.id is null then
 if allocation.upload_expires_at<=clock_timestamp() then raise exception 'capital_body_upload_expired' using errcode='42501';end if;
 else
 if receipt.storage_object_id is distinct from physical_object.id or receipt.storage_version is distinct from physical_object.version
 or receipt.verified_sha256 is distinct from allocation.payload_fingerprint or receipt.verified_size is distinct from allocation.byte_length
 or not private.capital_body_physical_receipt_v1(job.organization_id,receipt.id) then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 end if;
 result_dto:=private.capital_body_dto_v1(job.organization_id,allocation.id,deadline,true)
 ||jsonb_build_object('storageObjectId',physical_object.id,'storageVersion',physical_object.version);
 -- No caller-supplied path/version/hash or storage header authorizes this scope.
 -- Re-run current rights and clock after constructing it, so an elapsed lease
 -- cannot escape through a slow closure/metadata lookup before either server gate.
 checked_deadline:=private.capital_body_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 if checked_deadline is null then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 if checked_deadline is distinct from deadline then raise exception 'capital_capture_retry' using errcode='40001';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token)
 or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
 or (receipt.id is null and allocation.upload_expires_at<=clock_timestamp()) then
 raise exception 'capital_body_read_denied' using errcode='42501';end if;
 return result_dto;
end; $$;
create function public.worker_read_capital_body_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_read_capital_body_allocation_v1(p_job_id,p_capability_token,p_allocation_id);
$$;
revoke all on function private.worker_read_capital_body_allocation_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.worker_read_capital_body_allocation_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_read_capital_body_allocation_v1(uuid,text,uuid) to authenticated;
grant execute on function public.worker_read_capital_body_allocation_v1(uuid,text,uuid) to authenticated;

-- Close the same cache bypass for licensed public payloads in this bucket. A
-- purge ticket admits only its existing metadata operations, never byte GET.
create or replace function private.worker_can_access_capital_public_payload_v1(p_bucket text,p_path text,p_mode text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations; deadline timestamptz; margin integer;
begin
 if p_mode='read' then return false;end if;
 if auth.uid() is null or p_bucket<>'capital-input-capture' or not private.capital_public_capture_bucket_safe_v1() then return false; end if;
 select * into a from private.capital_public_payload_allocations where bucket_id=p_bucket and object_path=p_path;
 if not found then return false; end if;
 if a.content_kind='typed_body' and p_mode in ('read','upload') then
  return private.capital_body_storage_allowed_v1(a.id,p_mode);
 end if;
 if exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path
  and ((to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false; end if;
 if p_mode in ('purge','purge_select') then
  if p_mode='purge_select' and not storage.allow_any_operation(array['object.delete','object.delete_many','object.get_authenticated_info','object.head_authenticated_info']) then return false; end if;
  return exists(select 1 from private.capital_public_payload_purge_queue q join private.worker_tokens w on w.id=q.worker_token_id
   join auth.users u on u.id=q.leased_account_id where q.organization_id=a.organization_id and q.allocation_id=a.id and q.status='leased'
   and q.leased_account_id=auth.uid() and q.lease_expires_at>clock_timestamp() and w.status='active' and w.revoked_at is null
   and w.execution_account_user_id=auth.uid() and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()));
 end if;
 if p_mode='upload' and not private.capital_body_storage_job_authority_v1(a.id) then return false;end if;
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

create function private.worker_read_capital_public_payload_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;receipt private.capital_public_retained_payloads;
 physical_object storage.objects;deadline timestamptz;checked_deadline timestamptz;margin integer;result_dto jsonb;
begin
 if p_allocation_id is null then raise exception 'capture_payload_invalid' using errcode='22023';end if;
 select a.* into allocation from private.capital_public_payload_allocations a
 where a.organization_id=job.organization_id and a.job_id=job.id and a.id=p_allocation_id and a.content_kind='public_source';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id)
 or not private.capital_public_capture_bucket_safe_v1() then raise exception 'capital_capture_retention_denied' using errcode='42501';end if;
 perform private.worker_load_capital_project_capture_context_v1(p_job_id,p_capability_token);
 deadline:=private.capital_public_retention_deadline_v1(allocation.license_id,job.organization_id,allocation.retained_at,allocation.policy_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 if deadline is null or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp() then
 raise exception 'capital_capture_retention_denied' using errcode='42501';end if;
 if not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id) then raise exception 'capital_capture_retention_denied' using errcode='42501';end if;
 begin
 perform 1 from private.capital_public_payload_purge_queue q
 where q.organization_id=job.organization_id and q.allocation_id=allocation.id and q.status='pending' for share nowait;
 if not found then raise exception 'capital_capture_retention_denied' using errcode='42501';end if;
 select o.* into physical_object from storage.objects o where o.bucket_id=allocation.bucket_id and o.name=allocation.object_path for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if physical_object.id is null or coalesce(length(physical_object.version),0) not between 1 and 1024
 or physical_object.metadata->>'size' is distinct from allocation.byte_length::text
 or physical_object.metadata->>'mimetype' is distinct from 'application/json'
 or (to_jsonb(physical_object)->>'is_versioned')::boolean is true
 or (to_jsonb(physical_object)->>'is_delete_marker')::boolean is true
 or to_jsonb(physical_object)->>'archived_at' is not null then raise exception 'capital_capture_retention_denied' using errcode='42501';end if;
 select r.* into receipt from private.capital_public_retained_payloads r
 where r.organization_id=job.organization_id and r.allocation_id=allocation.id;
 if receipt.id is null then
 if allocation.upload_expires_at<=clock_timestamp() then raise exception 'capital_capture_retention_denied' using errcode='42501';end if;
 else
 if receipt.storage_object_id is distinct from physical_object.id or receipt.storage_version is distinct from physical_object.version
 or receipt.verified_sha256 is distinct from allocation.payload_fingerprint or receipt.verified_size is distinct from allocation.byte_length
 then raise exception 'capital_capture_retention_denied' using errcode='42501';end if;
 end if;
 result_dto:=jsonb_build_object('schemaVersion','capital-public-storage-scope.v1','state',case when receipt.id is null then 'allocated' else 'complete' end,
 'allocationId',allocation.id,'retainedPayloadId',receipt.id,'deliveryId',allocation.delivery_id,'bucket',allocation.bucket_id,'path',allocation.object_path,
 'payloadFingerprint',allocation.payload_fingerprint,'byteLength',allocation.byte_length,'storageObjectId',physical_object.id,'storageVersion',physical_object.version,
 'retainedAt',allocation.retained_at,'uploadExpiresAt',allocation.upload_expires_at,'expiresAt',least(allocation.expires_at,deadline),
 'purgeAt',least(allocation.purge_at,deadline-make_interval(secs=>margin)));
 -- No caller-supplied path/version/hash or storage header authorizes this scope.
 -- Re-run current rights and clock after constructing it, so an elapsed lease
 -- cannot escape through a slow closure/metadata lookup before either server gate.
 checked_deadline:=private.capital_public_retention_deadline_v1(allocation.license_id,job.organization_id,allocation.retained_at,allocation.policy_id);
 if checked_deadline is null then raise exception 'capital_capture_retention_denied' using errcode='42501';end if;
 if checked_deadline is distinct from deadline then raise exception 'capital_capture_retry' using errcode='40001';end if;
 if not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id) then raise exception 'capital_capture_retention_denied' using errcode='42501';end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token)
 or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
 or (receipt.id is null and allocation.upload_expires_at<=clock_timestamp()) then
 raise exception 'capital_capture_retention_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

create function public.worker_read_capital_public_payload_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_read_capital_public_payload_allocation_v1(p_job_id,p_capability_token,p_allocation_id);
$$;
revoke all on function private.worker_read_capital_public_payload_allocation_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.worker_read_capital_public_payload_allocation_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_read_capital_public_payload_allocation_v1(uuid,text,uuid) to authenticated;
grant execute on function public.worker_read_capital_public_payload_allocation_v1(uuid,text,uuid) to authenticated;
