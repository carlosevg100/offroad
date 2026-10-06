-- Stage22/3: sealed metadata batches; bytes are archived outside this database under Object Lock.
set search_path='';
create table private.audit_archive_wakes (
 organization_id uuid primary key references public.organizations(id),last_event_id bigint not null,
 archived_through_id bigint not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,last_event_id),check(archived_through_id<=last_event_id)
);
create table private.audit_export_batches (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 first_event_id bigint not null,last_event_id bigint not null,canonical_payload text not null check(octet_length(canonical_payload)<=1048576),
 payload_sha256 text not null check(payload_sha256~'^[a-f0-9]{64}$'),
 state text not null default 'pending' check(state in('pending','leased','completed','blocked')),
 attempts integer not null default 0 check(attempts between 0 and 5),worker_token_id uuid references private.worker_tokens(id),leased_account_id uuid references auth.users(id),
 capability_sha256 bytea,lease_expires_at timestamptz,s3_version_id text,completed_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),unique(organization_id,first_event_id,last_event_id),
 check(first_event_id<=last_event_id),check((state='completed')=(completed_at is not null and s3_version_id is not null))
);
create index audit_batches_ready_idx on private.audit_export_batches(created_at,id)where state in('pending','leased');
create index audit_batches_worker_idx on private.audit_export_batches(worker_token_id);
create index audit_batches_account_idx on private.audit_export_batches(leased_account_id);
do $$declare t text;begin foreach t in array array['audit_archive_wakes','audit_export_batches']loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy %I on private.%I for all to authenticated using(false) with check(false)',t||'_deny',t);
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated',t);
 end loop;end;$$;
create function private.audit_batch_immutable_v1()returns trigger language plpgsql set search_path=''as $$begin
 if tg_op='DELETE' or tg_op='TRUNCATE' then raise exception 'audit_batch_immutable'using errcode='42501';end if;
 if(new.id,new.organization_id,new.first_event_id,new.last_event_id,new.canonical_payload,new.payload_sha256,new.created_at)
 is distinct from(old.id,old.organization_id,old.first_event_id,old.last_event_id,old.canonical_payload,old.payload_sha256,old.created_at)
 or(old.state='completed' and new is distinct from old)then raise exception 'audit_batch_immutable'using errcode='42501';end if;
 return new;
end;$$;
create trigger audit_batch_immutable before update or delete on private.audit_export_batches for each row execute function private.audit_batch_immutable_v1();
create trigger audit_batch_no_truncate before truncate on private.audit_export_batches for each statement execute function private.audit_batch_immutable_v1();
create function private.wake_audit_archive_v1()returns trigger language plpgsql security definer set search_path=''as $$begin
 insert into private.audit_archive_wakes(organization_id,last_event_id)values(new.organization_id,new.id)
 on conflict(organization_id)do update set last_event_id=greatest(private.audit_archive_wakes.last_event_id,excluded.last_event_id);return new;
end;$$;
create trigger audit_archive_wake after insert on public.audit_events for each row execute function private.wake_audit_archive_v1();
insert into private.audit_archive_wakes(organization_id,last_event_id)select organization_id,max(id)from public.audit_events group by organization_id;

create function private.worker_claim_audit_batch_v1(p_worker_token text)returns jsonb language plpgsql security definer set search_path=''as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);b private.audit_export_batches;w private.audit_archive_wakes;events jsonb;changes jsonb;payload text;first_id bigint;last_id bigint;cap text;blocked bigint;oldest double precision;
begin
 update private.audit_export_batches set state='blocked'where state='leased'and lease_expires_at<=clock_timestamp()and attempts>=5;
 select count(*)into blocked from private.audit_export_batches where state='blocked';
 select coalesce(extract(epoch from clock_timestamp()-min(created_at)),0)into oldest from private.audit_export_batches where state<>'completed';
 select*into b from private.audit_export_batches where state='pending'or(state='leased'and lease_expires_at<=clock_timestamp()and attempts<5)order by created_at,id limit 1 for update skip locked;
 if b.id is null then
  select*into w from private.audit_archive_wakes q where q.last_event_id>q.archived_through_id
  and not exists(select 1 from private.audit_export_batches prior where prior.organization_id=q.organization_id and prior.state<>'completed')
  order by q.updated_at,q.organization_id limit 1 for update skip locked;
  if w.organization_id is null then return jsonb_build_object('claimed',false,'blockedCount',blocked,'oldestPendingSeconds',greatest(oldest,0));end if;
  select min(id),max(id),jsonb_agg(event order by id)into first_id,last_id,events from(select id,jsonb_build_object('id',id,'actorId',actor_user_id,
   'action',case when action~'^[a-zA-Z0-9_.:-]{1,100}$'then action else 'legacy.unspecified'end,
   'resourceType',case when resource_type~'^[a-zA-Z0-9_.:-]{1,100}$'then resource_type else 'legacy_unspecified'end,
   'resourceId',case when resource_id~'^[a-f0-9-]{36}$'then resource_id else null end,'occurredAt',occurred_at)event
   from public.audit_events where organization_id=w.organization_id and id>w.archived_through_id order by id limit 500)q;
  if first_id is null then raise exception 'audit_archive_cursor_invalid'using errcode='55000';end if;
  select coalesce(jsonb_agg(jsonb_build_object('eventId',d.id,'kind',d.aggregate_kind,'aggregateId',d.aggregate_id,'revision',d.aggregate_version,'reason',d.reason,
   'fingerprint',d.fingerprint,'state',d.protected_state)order by d.audit_event_id),'[]')into changes from private.domain_events d
   where d.organization_id=w.organization_id and d.audit_event_id between first_id and last_id
   and d.aggregate_kind in('membership','resource_grant','workspace_capability','commercial_account_link');
  payload:=jsonb_build_object('schemaVersion','audit-archive.v1','organizationId',w.organization_id,'firstEventId',first_id,'lastEventId',last_id,'events',events,'authorityChanges',changes)::text;
  insert into private.audit_export_batches(organization_id,first_event_id,last_event_id,canonical_payload,payload_sha256)
  values(w.organization_id,first_id,last_id,payload,encode(extensions.digest(convert_to(payload,'utf8'),'sha256'),'hex'))returning*into b;
 end if;
 cap:=encode(extensions.gen_random_bytes(32),'hex');
 update private.audit_export_batches set state='leased',attempts=attempts+1,worker_token_id=worker,leased_account_id=auth.uid(),capability_sha256=extensions.digest(cap,'sha256'),lease_expires_at=clock_timestamp()+interval '120 seconds'where id=b.id returning*into b;
 return jsonb_build_object('claimed',true,'blockedCount',blocked,'oldestPendingSeconds',greatest(oldest,0),'batchId',b.id,'organizationId',b.organization_id,
 'capability',cap,'canonicalPayload',b.canonical_payload,'sha256',b.payload_sha256,'leaseExpiresAt',b.lease_expires_at);
end;$$;
create function private.worker_ack_audit_batch_v1(p_worker_token text,p_batch_id uuid,p_capability text,p_verified_sha256 text,p_s3_version_id text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);b private.audit_export_batches;
begin
 select*into b from private.audit_export_batches where id=p_batch_id for update;
 if b.id is null or b.worker_token_id is distinct from worker or b.leased_account_id is distinct from auth.uid()
 or b.capability_sha256 is distinct from extensions.digest(p_capability,'sha256')or b.payload_sha256 is distinct from p_verified_sha256
 or p_s3_version_id is null or length(p_s3_version_id)not between 1 and 512 then raise exception 'audit_batch_ack_denied'using errcode='42501';end if;
 if b.state='completed'then
  if b.s3_version_id<>p_s3_version_id then raise exception 'audit_archive_retry_conflict'using errcode='22023';end if;
  return jsonb_build_object('completed',true,'replayed',true);
 end if;
 if b.state<>'leased'or b.lease_expires_at<=clock_timestamp()then raise exception 'audit_batch_lease_expired'using errcode='42501';end if;
 update private.audit_export_batches set state='completed',s3_version_id=p_s3_version_id,completed_at=clock_timestamp()where id=b.id;
 update private.audit_archive_wakes set archived_through_id=greatest(archived_through_id,b.last_event_id)where organization_id=b.organization_id;
 return jsonb_build_object('completed',true,'replayed',false);
end;$$;
create function public.worker_claim_audit_batch_v1(p_worker_token text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_claim_audit_batch_v1(p_worker_token);$$;
create function public.worker_ack_audit_batch_v1(p_worker_token text,p_batch_id uuid,p_capability text,p_verified_sha256 text,p_s3_version_id text)
returns jsonb language sql security invoker set search_path=''as $$select private.worker_ack_audit_batch_v1(p_worker_token,p_batch_id,p_capability,p_verified_sha256,p_s3_version_id);$$;
do $$declare f record;begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')and p.proname in('audit_batch_immutable_v1','wake_audit_archive_v1','worker_claim_audit_batch_v1','worker_ack_audit_batch_v1')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
 if f.proname like 'worker_%'then execute format('grant execute on function %s to authenticated',f.oid::regprocedure);end if;
 end loop;
end;$$;
