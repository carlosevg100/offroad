set search_path='';
-- Hold pauses the existing licensed capture cleanup without consuming a destruction attempt.
CREATE OR REPLACE FUNCTION private.worker_claim_capital_capture_purge_v1(p_worker_token text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token); item private.capital_public_payload_purge_queue;
 a private.capital_public_payload_allocations; deadline timestamptz; margin integer; capability text;
 items jsonb:='[]'::jsonb; polled timestamptz:=clock_timestamp(); object_id uuid; object_version text; has_receipt boolean;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'capture_purge_invalid' using errcode='22023'; end if;
 if not private.capital_public_capture_bucket_safe_v1() then raise exception 'capture_bucket_unsafe' using errcode='42501'; end if;
 perform private.drain_capital_body_retention_wakes_v1(p_worker_token,p_limit*10);
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
  perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||a.organization_id::text,0));
  if private.storage_has_legal_hold_v1(a.bucket_id,a.object_path)then
   update private.capital_public_payload_purge_queue set status='pending',next_check_at=clock_timestamp()+interval '30 seconds',
    last_reason='legal_hold',worker_token_id=null,leased_account_id=null,capability_sha256=null,lease_expires_at=null where id=item.id;
   continue;
  end if;
  begin
   deadline:=private.capital_capture_allocation_deadline_v2(a.organization_id,a.id);
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
end; $function$
