-- Archive delivery is tracked per exact event, independently of allocation/commit order.
-- User audit inserts never update an organization-wide cursor or wait for the archiver.
set search_path='';
drop trigger audit_archive_wake on public.audit_events;
drop function private.wake_audit_archive_v1();
create table private.audit_export_batch_events(
 organization_id uuid not null,event_id bigint not null references public.audit_events(id),batch_id uuid not null,
 primary key(organization_id,event_id),
 foreign key(organization_id,batch_id)references private.audit_export_batches(organization_id,id)
);
create index audit_batch_events_batch_idx on private.audit_export_batch_events(organization_id,batch_id);
create index audit_events_archive_delivery_idx on public.audit_events(organization_id,id);
alter table private.audit_export_batch_events enable row level security;
alter table private.audit_export_batch_events force row level security;
revoke all on private.audit_export_batch_events from public,anon,authenticated,service_role;
create policy audit_batch_events_deny on private.audit_export_batch_events for all to authenticated using(false)with check(false);
create trigger audit_batch_events_immutable before update or delete on private.audit_export_batch_events for each row execute function private.deny_domain_audit_mutation_v1();
create trigger audit_batch_events_no_truncate before truncate on private.audit_export_batch_events for each statement execute function private.deny_domain_audit_mutation_v1();
insert into private.audit_export_batch_events(organization_id,event_id,batch_id)
select b.organization_id,(e->>'id')::bigint,b.id from private.audit_export_batches b
cross join lateral jsonb_array_elements(b.canonical_payload::jsonb->'events')e;
create function private.worker_claim_audit_batch_for_scope_v1(p_worker_token text,p_org uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare worker uuid:=private.capital_public_purge_worker_v1(p_worker_token);b private.audit_export_batches;w private.audit_archive_wakes;events jsonb;changes jsonb;payload text;first_id bigint;last_id bigint;cap text;blocked bigint;oldest double precision;
begin
 update private.audit_export_batches set state='blocked'where state='leased'and lease_expires_at<=clock_timestamp()and attempts>=5;
 select count(*)into blocked from private.audit_export_batches where state='blocked';
 select coalesce(extract(epoch from clock_timestamp()-min(created_at)),0)into oldest from private.audit_export_batches where state<>'completed';
 select*into b from private.audit_export_batches where (p_org is null or organization_id=p_org)and(state='pending'or(state='leased'and lease_expires_at<=clock_timestamp()and attempts<5))order by created_at,id limit 1 for update skip locked;
 if b.id is null then
  insert into private.audit_archive_wakes(organization_id,last_event_id)
  select e.organization_id,max(e.id) from public.audit_events e
  where (p_org is null or e.organization_id=p_org)and not exists(select 1 from private.audit_archive_wakes x where x.organization_id=e.organization_id)
  group by e.organization_id order by max(e.id) limit 1 on conflict(organization_id)do nothing;
  select*into w from private.audit_archive_wakes q where (p_org is null or q.organization_id=p_org)
  and exists(select 1 from public.audit_events e where e.organization_id=q.organization_id
   and not exists(select 1 from private.audit_export_batch_events x where x.organization_id=e.organization_id and x.event_id=e.id))
  and not exists(select 1 from private.audit_export_batches prior where prior.organization_id=q.organization_id and prior.state<>'completed')
  order by q.updated_at,q.organization_id limit 1 for update skip locked;
  if w.organization_id is null then return jsonb_build_object('claimed',false,'blockedCount',blocked,'oldestPendingSeconds',greatest(oldest,0));end if;
  select min(id),max(id),jsonb_agg(event order by id)into first_id,last_id,events from(select id,jsonb_build_object('id',id,'actorId',actor_user_id,
   'action',case when action~'^[a-zA-Z0-9_.:-]{1,100}$'then action else 'legacy.unspecified'end,
   'resourceType',case when resource_type~'^[a-zA-Z0-9_.:-]{1,100}$'then resource_type else 'legacy_unspecified'end,
   'resourceId',case when resource_id~'^[a-f0-9-]{36}$'then resource_id else null end,'occurredAt',occurred_at,'decision',case when metadata->>'schemaVersion'='sensitive-operation.v1'then jsonb_build_object('resourceVersionId',case when metadata->>'resourceVersionId'~'^[a-f0-9-]{36}$'then metadata->>'resourceVersionId'else null end,'policyVersion','resource-policy.v22','policyFingerprint',case when metadata->>'policyFingerprint'~'^[a-f0-9]{64}$'then metadata->>'policyFingerprint'else null end,'result',case when metadata->>'result'in('allow','deny')then metadata->>'result'else null end)else null end)event
   from public.audit_events where organization_id=w.organization_id and not exists(select 1 from private.audit_export_batch_events x where x.organization_id=public.audit_events.organization_id and x.event_id=public.audit_events.id) order by id limit 500)q;
  if first_id is null then raise exception 'audit_archive_cursor_invalid'using errcode='55000';end if;
  select coalesce(jsonb_agg(jsonb_build_object('eventId',d.id,'kind',d.aggregate_kind,'aggregateId',d.aggregate_id,'revision',d.aggregate_version,'reason','authority_changed',
   'fingerprint',d.fingerprint,'state',jsonb_build_object('before',case when jsonb_typeof(d.protected_state->'before')='object' then (d.protected_state->'before')-'basis' else null end,'after',case when jsonb_typeof(d.protected_state->'after')='object' then (d.protected_state->'after')-'basis' else null end))order by d.audit_event_id),'[]')into changes from private.domain_events d
   where d.organization_id=w.organization_id and d.audit_event_id in(select (e->>'id')::bigint from jsonb_array_elements(events)e)
   and d.aggregate_kind in('membership','resource_grant','workspace_capability','commercial_account_link');
  payload:=jsonb_build_object('schemaVersion','audit-archive.v1','organizationId',w.organization_id,'firstEventId',first_id,'lastEventId',last_id,'events',events,'authorityChanges',changes)::text;
  insert into private.audit_export_batches(organization_id,first_event_id,last_event_id,canonical_payload,payload_sha256)
  values(w.organization_id,first_id,last_id,payload,encode(extensions.digest(convert_to(payload,'utf8'),'sha256'),'hex'))returning*into b;
  insert into private.audit_export_batch_events(organization_id,event_id,batch_id)
  select w.organization_id,(e->>'id')::bigint,b.id from jsonb_array_elements(events)e;
  update private.audit_archive_wakes set last_event_id=greatest(last_event_id,b.last_event_id)where organization_id=w.organization_id;
 end if;
 cap:=encode(extensions.gen_random_bytes(32),'hex');
 update private.audit_export_batches set state='leased',attempts=attempts+1,worker_token_id=worker,leased_account_id=auth.uid(),capability_sha256=extensions.digest(cap,'sha256'),lease_expires_at=clock_timestamp()+interval '120 seconds'where id=b.id returning*into b;
 return jsonb_build_object('claimed',true,'blockedCount',blocked,'oldestPendingSeconds',greatest(oldest,0),'batchId',b.id,'organizationId',b.organization_id,
 'capability',cap,'canonicalPayload',b.canonical_payload,'sha256',b.payload_sha256,'leaseExpiresAt',b.lease_expires_at);
end;$$;

revoke all on function private.worker_claim_audit_batch_for_scope_v1(text,uuid)from public,anon,authenticated,service_role;
create or replace function private.worker_claim_audit_batch_v1(p_worker_token text)returns jsonb language sql security definer set search_path=''as $$select private.worker_claim_audit_batch_for_scope_v1(p_worker_token,null);$$;
