-- Forward repair: the local allocation variable shadowed queue and receipt column names.
-- Both earlier migrations are installed in staging and remain immutable.
set search_path='';
create or replace function private.worker_prepare_capital_public_payload_v1(p_job_id uuid,p_capability_token text,p_delivery_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 intent private.capital_public_deliveries; lic private.capital_public_delivery_licenses;
 a private.capital_public_payload_allocations; policy private.capital_public_retention_policies; receipt private.capital_public_retained_payloads; checked jsonb;
 stamp timestamptz:=clock_timestamp(); deadline timestamptz; new_allocation_id uuid:=gen_random_uuid(); replayed boolean:=false;
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
  values(new_allocation_id,j.organization_id,intent.id,p_request_id,lic.id,lic.licensing_organization_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,
   policy.id,intent.payload_fingerprint,octet_length(p_payload::text),j.organization_id::text||'/'||new_allocation_id::text||'/payload.json',stamp,deadline,
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
   values(a.organization_id,a.id,least(a.upload_expires_at,a.purge_at),least(a.upload_expires_at,a.purge_at)) on conflict do nothing;
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
 return jsonb_build_object('allocationId',a.id,'deliveryId',a.delivery_id,'bucket',a.bucket_id,'path',a.object_path,
  'payloadFingerprint',a.payload_fingerprint,'byteLength',a.byte_length,'canonicalPayload',p_payload::text,
  'retainedAt',a.retained_at,'expiresAt',least(a.expires_at,deadline),'purgeAt',least(a.purge_at,deadline-make_interval(secs=>policy.purge_margin_seconds)),
  'uploadExpiresAt',a.upload_expires_at,'state','allocated','replayed',replayed);
end; $$;
