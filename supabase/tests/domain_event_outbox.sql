-- All identities and events below are synthetic and rolled back.
begin;
insert into auth.users(id,email) values
 ('a2240000-0000-4000-8000-000000000001','outbox-owner@example.invalid'),
 ('a2240000-0000-4000-8000-000000000002','outbox-worker@example.invalid'),
 ('a2240000-0000-4000-8000-000000000003','outbox-other@example.invalid');
select set_config('request.jwt.claim.sub','a2240000-0000-4000-8000-000000000001',true);
insert into public.organizations(id,organization_type,workspace_kind,name,created_by)
values('a2240000-0000-4000-9000-000000000001','institutional','institutional','Synthetic outbox test','a2240000-0000-4000-8000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role,status)
values('a2240000-0000-4000-9000-000000000001','a2240000-0000-4000-8000-000000000001','owner','active');
insert into private.worker_tokens(id,label,token_sha256)
values('a2240000-0000-4000-9000-000000000002','Synthetic outbox worker',extensions.digest(repeat('t',40),'sha256'));

-- Events from one mutation transaction keep a common opaque correlation.
do $$ begin
 if (select count(distinct correlation_id) from private.domain_events where organization_id='a2240000-0000-4000-9000-000000000001')<>1 then raise exception 'transaction correlation lost'; end if;
 begin update private.domain_events set reason='removed'; raise exception 'immutable event rewritten'; exception when insufficient_privilege then null; end;
end $$;

-- Producer idempotence, aggregate versions and conflicting replay.
do $$ declare event_id uuid:='a2240000-0000-4000-9000-000000000003'; before_count bigint; begin
 select count(*) into before_count from private.domain_events;
 perform private.append_domain_event_v1(event_id,'a2240000-0000-4000-9000-000000000001','membership','a2240000-0000-4000-8000-000000000001','changed','{}');
 perform private.append_domain_event_v1(event_id,'a2240000-0000-4000-9000-000000000001','membership','a2240000-0000-4000-8000-000000000001','changed','{}');
 if (select count(*) from private.domain_events)<>before_count+1 then raise exception 'duplicate event'; end if;
 begin
  perform private.append_domain_event_v1(event_id,'a2240000-0000-4000-9000-000000000001','membership','a2240000-0000-4000-8000-000000000001','changed','{"conflict":true}');
  raise exception 'conflicting replay accepted';
 exception when invalid_parameter_value then null; end;
 if (select aggregate_version from private.domain_events where id=event_id)<>2 then raise exception 'aggregate version not monotonic'; end if;
end $$;

-- Subtransaction rollback removes mutation, audit, event and outbox together.
do $$ declare events bigint; audits bigint; begin
 select count(*) into events from private.domain_events;
 select count(*) into audits from public.audit_events;
 begin
  update public.organization_memberships set status='revoked' where organization_id='a2240000-0000-4000-9000-000000000001';
  raise exception 'test_rollback';
 exception when raise_exception then if sqlerrm<>'test_rollback' then raise; end if; end;
 if (select count(*) from private.domain_events)<>events or (select count(*) from public.audit_events)<>audits
 or exists(select 1 from public.organization_memberships where organization_id='a2240000-0000-4000-9000-000000000001' and status<>'active') then raise exception 'orphan after rollback'; end if;
 if exists(select 1 from private.domain_events e left join private.event_outbox o on o.organization_id=e.organization_id and o.event_id=e.id where o.id is null) then raise exception 'event lacks durable effect'; end if;
end $$;

create function pg_temp.reject_outbox_test_event() returns trigger language plpgsql as $$ begin raise exception 'synthetic_audit_failure'; end $$;
create trigger synthetic_audit_failure before insert on private.domain_events for each row execute function pg_temp.reject_outbox_test_event();
do $$ begin
 begin
  update public.organization_memberships set status='revoked' where organization_id='a2240000-0000-4000-9000-000000000001';
  raise exception 'mutation survived audit failure';
 exception when raise_exception then if sqlerrm<>'synthetic_audit_failure' then raise; end if; end;
 if exists(select 1 from public.organization_memberships where organization_id='a2240000-0000-4000-9000-000000000001' and status<>'active') then raise exception 'sensitive mutation was not atomic'; end if;
end $$;
drop trigger synthetic_audit_failure on private.domain_events;

create function pg_temp.assert_client_denied() returns void language plpgsql as $$ declare table_name text; begin
 foreach table_name in array array['domain_events','event_outbox','access_decision_events'] loop
  begin execute format('select * from private.%I',table_name); raise exception 'client read audit'; exception when insufficient_privilege then null; end;
  begin execute format('delete from private.%I',table_name); raise exception 'client erased audit'; exception when insufficient_privilege then null; end;
  begin execute format('update private.%I set organization_id=organization_id',table_name); raise exception 'client changed audit'; exception when insufficient_privilege then null; end;
 end loop;
 begin perform private.append_domain_event_v1(gen_random_uuid(),'a2240000-0000-4000-9000-000000000001','membership',auth.uid(),'changed','{}'); raise exception 'client forged event'; exception when insufficient_privilege then null; end;
 begin perform public.claim_event_outbox_v1(repeat('x',40)); raise exception 'client acquired worker lease'; exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select pg_temp.assert_client_denied();
reset role;

-- Lease account isolation, expiration/recovery, stale token denial and retry acknowledgement.
select set_config('request.jwt.claim.sub','a2240000-0000-4000-8000-000000000002',true);
do $$ declare first_claim jsonb; recovered jsonb; result jsonb; item_id uuid; begin
 first_claim:=public.claim_event_outbox_v1(repeat('t',40));
 if not (first_claim->>'claimed')::boolean then raise exception 'nothing claimed'; end if;
 item_id:=(first_claim->>'outboxId')::uuid;
 perform set_config('request.jwt.claim.sub','a2240000-0000-4000-8000-000000000003',true);
 begin perform public.complete_event_outbox_v1(repeat('t',40),item_id,first_claim->>'capability'); raise exception 'another account completed lease'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','a2240000-0000-4000-8000-000000000002',true);
 update private.event_outbox set lease_expires_at=now()-interval '1 minute' where id=item_id;
 recovered:=public.claim_event_outbox_v1(repeat('t',40));
 if recovered->>'outboxId'<>item_id::text or recovered->>'capability'=first_claim->>'capability' then raise exception 'interrupted lease not replaced'; end if;
 begin perform public.complete_event_outbox_v1(repeat('t',40),item_id,first_claim->>'capability'); raise exception 'stale lease completed'; exception when insufficient_privilege then null; end;
 result:=public.complete_event_outbox_v1(repeat('t',40),item_id,recovered->>'capability');
 if result->>'completed'<>'true' or result->>'replayed'<>'false' then raise exception 'completion failed'; end if;
 result:=public.complete_event_outbox_v1(repeat('t',40),item_id,recovered->>'capability');
 if result->>'completed'<>'true' or result->>'replayed'<>'true' then raise exception 'completion retry not idempotent'; end if;
 update private.worker_tokens set status='revoked' where id='a2240000-0000-4000-9000-000000000002';
 begin perform public.complete_event_outbox_v1(repeat('t',40),item_id,recovered->>'capability'); raise exception 'revoked worker completed'; exception when insufficient_privilege then null; end;
 update private.worker_tokens set status='active' where id='a2240000-0000-4000-9000-000000000002';
end $$;

-- Backlog blocks dependent effects, poisoned leases surface in health; snapshots never leak.
do $$ declare claim jsonb; begin
 begin perform private.require_domain_event_propagation_v1('a2240000-0000-4000-9000-000000000001'); raise exception 'pending barrier bypassed'; exception when object_not_in_prerequisite_state then null; end;
 update private.event_outbox set status='leased',attempts=5,lease_expires_at=now()-interval '1 minute' where status='pending';
 claim:=public.claim_event_outbox_v1(repeat('t',40));
 if (claim->>'blockedCount')::integer<1 then raise exception 'poison alarm absent'; end if;
 if claim::text like '%protected_state%' then raise exception 'snapshot leaked'; end if;
end $$;
-- Recovery is a recorded operator command, never a worker privilege or history rewrite.
do $$ declare item private.event_outbox; audit_count bigint; begin
 select * into item from private.event_outbox where status='blocked' order by created_at,id limit 1;
 select count(*) into audit_count from public.audit_events;
 if not private.retry_blocked_event_outbox_v1(item.organization_id,item.id) then raise exception 'blocked event not requeued'; end if;
 if private.retry_blocked_event_outbox_v1(item.organization_id,item.id) then raise exception 'requeue retry not idempotent'; end if;
 if (select count(*) from public.audit_events)<>audit_count+1 then raise exception 'operator recovery not audited exactly once'; end if;
 if exists(select 1 from private.event_outbox where id=item.id and (status<>'pending' or capability_sha256 is not null or worker_token_id is not null)) then raise exception 'operator recovery kept old lease'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform private.retry_blocked_event_outbox_v1('a2240000-0000-4000-9000-000000000001',gen_random_uuid()); raise exception 'worker acquired repair privilege'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'domain_event_outbox: PASS' result;
rollback;
