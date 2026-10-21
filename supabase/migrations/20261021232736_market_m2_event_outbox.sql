-- Market reference M2, part 3 (ADR 0023; docs/build/market-reference/M2-PARTE-3.md), first half: the market
-- event outbox. Every market event fans out, in the transaction that records it, to one row per enabled
-- consumer that reads it; rows are processed one by one until a receipt, ordered per subject, with no
-- global cursor. Nothing here is tenant data, and no consumer is registered by this migration.

-- Every new market function runs in READ COMMITTED; a longer snapshot is refused at the door.
create function private.market_require_read_committed_v1() returns void
language plpgsql stable set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'market_isolation_unsupported' using errcode='25001';end if;
end $$;

-- 1. Consumers: what each one reads; registration and disabling serialize with every fan-out.
create table private.market_event_consumers(
 id text primary key check(id ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
 events text[] not null check(cardinality(events) between 1 and 6
  and events <@ array['quarantined','approved','superseded','revoked','purged','released']::text[]),
 subject_kinds text[] not null check(cardinality(subject_kinds) between 1 and 3 and subject_kinds <@ array['acquisition','version','source']::text[]),
 state text not null check(state in ('enabled','disabled')),
 reason text not null check(length(btrim(reason)) between 5 and 500),
 registered_by uuid not null references auth.users(id),
 registered_at timestamptz not null default clock_timestamp(),
 disabled_by uuid references auth.users(id),
 disabled_at timestamptz,
 check((state='disabled')=(disabled_at is not null and disabled_by is not null)));

create table private.market_event_consumer_commands(
 command_id uuid primary key,
 consumer_id text not null references private.market_event_consumers(id),
 action text not null check(action in ('register','disable')),
 actor_user_id uuid not null references auth.users(id),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz not null default clock_timestamp());
create index market_event_consumer_commands_consumer on private.market_event_consumer_commands(consumer_id);
create index market_event_consumer_commands_actor on private.market_event_consumer_commands(actor_user_id);
create index market_event_consumers_registered_by on private.market_event_consumers(registered_by);
create index market_event_consumers_disabled_by on private.market_event_consumers(disabled_by);

-- 2. Per-subject ordinals: a counter row per (consumer, subject) whose row lock lasts until commit, so the
-- order of assignment within a subject is the order of commit.
create table private.market_event_subject_counters(
 consumer_id text not null references private.market_event_consumers(id),
 subject_key text not null check(length(subject_key) between 3 and 260),
 last_ordinal bigint not null check(last_ordinal>0),
 primary key(consumer_id,subject_key));

-- 3. The outbox rows.
create table private.market_event_outbox(
 consumer_id text not null references private.market_event_consumers(id),
 event_sequence bigint not null references private.market_events(sequence),
 subject_key text not null check(length(subject_key) between 3 and 260),
 subject_ordinal bigint not null check(subject_ordinal>0),
 status text not null default 'pending' check(status in ('pending','leased','completed','blocked','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 available_at timestamptz not null default clock_timestamp(),
 lease_id uuid,
 leased_by uuid references private.worker_tokens(id),
 leased_account_user_id uuid references auth.users(id),
 lease_expires_at timestamptz,
 capability_sha256 bytea,
 last_error jsonb check(last_error is null or jsonb_typeof(last_error)='object'),
 completed_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(consumer_id,event_sequence),
 unique(consumer_id,subject_key,subject_ordinal),
 check((status='leased')=(lease_id is not null and leased_by is not null and leased_account_user_id is not null and lease_expires_at is not null and capability_sha256 is not null)),
 check((status='completed')=(completed_at is not null)));
create index market_event_outbox_claim on private.market_event_outbox(consumer_id,available_at,event_sequence) where status in ('pending','leased');
create index market_event_outbox_subject on private.market_event_outbox(consumer_id,subject_key,subject_ordinal) where status not in ('completed','cancelled');
create index market_event_outbox_event on private.market_event_outbox(event_sequence);
create index market_event_outbox_leased_by on private.market_event_outbox(leased_by);
create index market_event_outbox_account on private.market_event_outbox(leased_account_user_id);

-- 4. Receipts: the effect and the binding of the attempt that completed a row, immutable.
create table private.market_event_receipts(
 consumer_id text not null,
 event_sequence bigint not null,
 lease_id uuid not null,
 worker_token_id uuid not null references private.worker_tokens(id),
 account_user_id uuid not null references auth.users(id),
 capability_sha256 bytea not null,
 effect jsonb not null check(jsonb_typeof(effect)='object' and octet_length(effect::text)<=65536),
 effect_sha256 text not null check(effect_sha256 ~ '^[a-f0-9]{64}$'),
 completed_at timestamptz not null default clock_timestamp(),
 primary key(consumer_id,event_sequence),
 foreign key(consumer_id,event_sequence) references private.market_event_outbox(consumer_id,event_sequence));
create index market_event_receipts_token on private.market_event_receipts(worker_token_id);
create index market_event_receipts_account on private.market_event_receipts(account_user_id);

-- 5. Delegations of a worker token to a consumer.
create table private.market_event_consumer_delegations(
 id uuid primary key,
 worker_token_id uuid not null references private.worker_tokens(id),
 consumer_id text not null references private.market_event_consumers(id),
 reason text not null check(length(btrim(reason)) between 5 and 500),
 granted_by uuid not null references auth.users(id),
 grant_command_id uuid not null unique,
 granted_at timestamptz not null default clock_timestamp(),
 revoked_by uuid references auth.users(id),
 revoke_command_id uuid unique,
 revoked_at timestamptz,
 check((revoked_at is null)=(revoked_by is null and revoke_command_id is null)));
create unique index market_event_consumer_delegations_live on private.market_event_consumer_delegations(worker_token_id,consumer_id) where revoked_at is null;
create index market_event_consumer_delegations_consumer on private.market_event_consumer_delegations(consumer_id);
create index market_event_consumer_delegations_granted_by on private.market_event_consumer_delegations(granted_by);
create index market_event_consumer_delegations_revoked_by on private.market_event_consumer_delegations(revoked_by);

-- 6. Operator commands over rows (retry of a blocked row).
create table private.market_event_operator_commands(
 command_id uuid primary key,
 consumer_id text not null,
 event_sequence bigint not null,
 action text not null check(action='retry_blocked'),
 reason text not null check(length(btrim(reason)) between 5 and 500),
 actor_user_id uuid not null references auth.users(id),
 recorded_at timestamptz not null default clock_timestamp(),
 foreign key(consumer_id,event_sequence) references private.market_event_outbox(consumer_id,event_sequence));
create index market_event_operator_commands_row on private.market_event_operator_commands(consumer_id,event_sequence);
create index market_event_operator_commands_actor on private.market_event_operator_commands(actor_user_id);

-- Rows change only along their states; receipts, commands and counters' keys never change.
create function private.guard_market_event_outbox_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.status<>'pending' or new.attempts<>0 or new.lease_id is not null or new.completed_at is not null then raise exception 'market_event_outbox_invalid' using errcode='23514';end if;
  return new;
 end if;
 if tg_op<>'UPDATE'
 or (new.consumer_id,new.event_sequence,new.subject_key,new.subject_ordinal,new.created_at) is distinct from (old.consumer_id,old.event_sequence,old.subject_key,old.subject_ordinal,old.created_at)
 or old.status in ('completed','cancelled')
 or not ((old.status='pending' and new.status in ('pending','leased','blocked','cancelled'))
  or (old.status='leased' and new.status in ('leased','pending','completed','blocked','cancelled'))
  or (old.status='blocked' and new.status in ('pending','cancelled')))
 then raise exception 'market_event_outbox_invalid' using errcode='23514';end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
create trigger market_event_outbox_guard before insert or update or delete on private.market_event_outbox for each row execute function private.guard_market_event_outbox_v1();
create trigger market_event_receipts_immutable before update or delete on private.market_event_receipts for each row execute function private.market_reject_change_v1();
create trigger market_event_consumer_commands_immutable before update or delete on private.market_event_consumer_commands for each row execute function private.market_reject_change_v1();
create trigger market_event_operator_commands_immutable before update or delete on private.market_event_operator_commands for each row execute function private.market_reject_change_v1();

create function private.guard_market_event_consumer_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.state='enabled' and new.state='disabled'
 and (to_jsonb(new)-array['state','disabled_by','disabled_at']) is not distinct from (to_jsonb(old)-array['state','disabled_by','disabled_at']) then return new;end if;
 raise exception 'market_event_consumer_immutable' using errcode='23514';
end $$;
create trigger market_event_consumers_guard before update or delete on private.market_event_consumers for each row execute function private.guard_market_event_consumer_v1();

create function private.guard_market_event_delegation_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.revoked_at is null and new.revoked_at is not null
 and (to_jsonb(new)-array['revoked_by','revoke_command_id','revoked_at']) is not distinct from (to_jsonb(old)-array['revoked_by','revoke_command_id','revoked_at']) then return new;end if;
 raise exception 'market_event_delegation_immutable' using errcode='23514';
end $$;
create trigger market_event_consumer_delegations_guard before update or delete on private.market_event_consumer_delegations for each row execute function private.guard_market_event_delegation_v1();

-- 7. Fan-out in the transaction that records the event. The subject of order is the aggregate the
-- consumer keeps: the logical object (the series) for version events, the acquisition or the source
-- otherwise. Lock order: consumers (shared), then counters by key.
create function private.market_event_subject_key_v1(p_kind text,p_subject text) returns text
language sql stable security definer set search_path='' as $$
 select case when p_kind='version' then 'series:'||(select v.logical_id from private.market_versions v where v.id=p_subject::uuid)
  else p_kind||':'||p_subject end;
$$;

create function private.fan_out_market_event_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare c record;k text;n bigint;begin
 perform private.market_require_read_committed_v1();
 perform pg_advisory_xact_lock_shared(hashtextextended('market-event-consumers',0));
 k:=private.market_event_subject_key_v1(new.subject_kind,new.subject_id);
 for c in select x.id from private.market_event_consumers x
  where x.state='enabled' and new.event=any(x.events) and new.subject_kind=any(x.subject_kinds) order by x.id loop
  insert into private.market_event_subject_counters(consumer_id,subject_key,last_ordinal) values(c.id,k,1)
  on conflict (consumer_id,subject_key) do update set last_ordinal=private.market_event_subject_counters.last_ordinal+1
  returning last_ordinal into n;
  insert into private.market_event_outbox(consumer_id,event_sequence,subject_key,subject_ordinal) values(c.id,new.sequence,k,n);
 end loop;
 return null;
end $$;
create trigger market_events_fan_out after insert on private.market_events for each row execute function private.fan_out_market_event_v1();

-- 8. Consumer commands (founder). Registration waits for the event transactions in flight: every event
-- that commits after the registration commits sees the consumer. Disabling cancels the open rows.
create function private.register_market_event_consumer_v1(p_command uuid,p_consumer text,p_events text[],p_subject_kinds text[],p_reason text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_event_consumer_commands;fp text;begin
 perform private.require_platform_principal_v1(p_actor_user_id,true);
 perform private.market_require_read_committed_v1();
 if p_command is null or p_consumer is null or p_events is null or p_subject_kinds is null or p_reason is null then raise exception 'market_event_consumer_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(convert_to(concat_ws(E'\n','register',p_consumer,array_to_string(array(select x from unnest(p_events) x order by x),','),
  array_to_string(array(select x from unnest(p_subject_kinds) x order by x),','),btrim(p_reason),p_actor_user_id::text),'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_event_consumer_commands where command_id=p_command;
 if found then
  if prior.fingerprint<>fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('consumerId',prior.consumer_id,'replayed',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('market-event-consumers',0));
 if exists(select 1 from private.market_event_consumers where id=p_consumer) then raise exception 'market_event_consumer_exists' using errcode='23505';end if;
 insert into private.market_event_consumers(id,events,subject_kinds,state,reason,registered_by)
 values(p_consumer,array(select distinct x from unnest(p_events) x order by x),array(select distinct x from unnest(p_subject_kinds) x order by x),'enabled',btrim(p_reason),p_actor_user_id);
 insert into private.market_event_consumer_commands(command_id,consumer_id,action,actor_user_id,fingerprint) values(p_command,p_consumer,'register',p_actor_user_id,fp);
 return jsonb_build_object('consumerId',p_consumer,'replayed',false);
end $$;

create function private.disable_market_event_consumer_v1(p_command uuid,p_consumer text,p_reason text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_event_consumer_commands;fp text;n integer;begin
 perform private.require_platform_principal_v1(p_actor_user_id,true);
 perform private.market_require_read_committed_v1();
 if p_command is null or p_consumer is null or p_reason is null or length(btrim(p_reason))<5 then raise exception 'market_event_consumer_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(convert_to(concat_ws(E'\n','disable',p_consumer,btrim(p_reason),p_actor_user_id::text),'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_event_consumer_commands where command_id=p_command;
 if found then
  if prior.fingerprint<>fp then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('consumerId',prior.consumer_id,'replayed',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('market-event-consumers',0));
 update private.market_event_consumers set state='disabled',disabled_by=p_actor_user_id,disabled_at=clock_timestamp() where id=p_consumer and state='enabled';
 if not found then raise exception 'market_event_consumer_not_enabled' using errcode='22023';end if;
 update private.market_event_outbox set status='cancelled',lease_id=null,leased_by=null,leased_account_user_id=null,lease_expires_at=null,capability_sha256=null,
  last_error=jsonb_build_object('code','consumer_disabled','reason',btrim(p_reason)) where consumer_id=p_consumer and status in ('pending','leased','blocked');
 get diagnostics n=row_count;
 insert into private.market_event_consumer_commands(command_id,consumer_id,action,actor_user_id,fingerprint) values(p_command,p_consumer,'disable',p_actor_user_id,fp);
 return jsonb_build_object('consumerId',p_consumer,'replayed',false,'cancelled',n);
end $$;

-- 9. Delegations (founder or operator), rechecked under a row lock at every lease step.
create function private.grant_market_event_delegation_v1(p_command uuid,p_worker_token_id uuid,p_consumer text,p_reason text,p_actor_user_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare prior private.market_event_consumer_delegations;d uuid:=gen_random_uuid();begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_worker_token_id is null or p_consumer is null or p_reason is null then raise exception 'market_event_delegation_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_event_consumer_delegations where grant_command_id=p_command;
 if found then
  if prior.worker_token_id<>p_worker_token_id or prior.consumer_id<>p_consumer or prior.reason<>btrim(p_reason) or prior.granted_by<>p_actor_user_id
  then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return prior.id;
 end if;
 perform 1 from private.worker_tokens where id=p_worker_token_id and status='active' and revoked_at is null and execution_account_user_id is not null for share;
 if not found then raise exception 'market_event_delegation_invalid' using errcode='22023';end if;
 if not exists(select 1 from private.market_event_consumers where id=p_consumer and state='enabled') then raise exception 'market_event_consumer_not_enabled' using errcode='22023';end if;
 insert into private.market_event_consumer_delegations(id,worker_token_id,consumer_id,reason,granted_by,grant_command_id)
 values(d,p_worker_token_id,p_consumer,btrim(p_reason),p_actor_user_id,p_command);
 return d;
end $$;

create function private.revoke_market_event_delegation_v1(p_command uuid,p_delegation uuid,p_reason text,p_actor_user_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d private.market_event_consumer_delegations;begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 if p_command is null or p_delegation is null or p_reason is null then raise exception 'market_event_delegation_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into d from private.market_event_consumer_delegations where revoke_command_id=p_command;
 if found then
  if d.id<>p_delegation or d.revoked_by<>p_actor_user_id then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return d.id;
 end if;
 update private.market_event_consumer_delegations set revoked_by=p_actor_user_id,revoke_command_id=p_command,revoked_at=clock_timestamp()
 where id=p_delegation and revoked_at is null returning * into d;
 if not found then raise exception 'market_event_delegation_invalid' using errcode='22023';end if;
 return d.id;
end $$;

create function private.market_event_delegation_live_v1(p_worker uuid,p_consumer text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 perform 1 from private.market_event_consumer_delegations d join private.worker_tokens w on w.id=d.worker_token_id
  where d.worker_token_id=p_worker and d.consumer_id=p_consumer and d.revoked_at is null and w.status='active' and w.revoked_at is null for share of d;
 if not found then return false;end if;
 perform 1 from private.market_event_consumers c where c.id=p_consumer and c.state='enabled' for share;
 return found;
end $$;

-- 10. Lease steps of the worker.
create function private.worker_claim_market_event_v1(p_worker_token text,p_consumer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare worker uuid;r private.market_event_outbox;e private.market_events;cap text;lease uuid;t timestamptz;begin
 perform private.market_require_read_committed_v1();
 worker:=private.market_worker_identity_v1(p_worker_token);
 if not private.market_event_delegation_live_v1(worker,p_consumer) then return jsonb_build_object('claimed',false);end if;
 loop
  t:=clock_timestamp();
  select * into r from private.market_event_outbox x
  where x.consumer_id=p_consumer and ((x.status='pending' and x.available_at<=t) or (x.status='leased' and x.lease_expires_at<=t))
  and not exists(select 1 from private.market_event_outbox y where y.consumer_id=x.consumer_id and y.subject_key=x.subject_key
   and y.subject_ordinal<x.subject_ordinal and y.status not in ('completed','cancelled'))
  order by x.available_at,x.event_sequence limit 1 for update skip locked;
  if not found then return jsonb_build_object('claimed',false);end if;
  if r.attempts>=5 then
   update private.market_event_outbox set status='blocked',lease_id=null,leased_by=null,leased_account_user_id=null,lease_expires_at=null,capability_sha256=null,
    last_error=jsonb_build_object('code','attempts_exhausted') where consumer_id=r.consumer_id and event_sequence=r.event_sequence;
   continue;
  end if;
  exit;
 end loop;
 cap:=encode(extensions.gen_random_bytes(32),'hex');lease:=gen_random_uuid();t:=clock_timestamp();
 update private.market_event_outbox set status='leased',attempts=attempts+1,lease_id=lease,leased_by=worker,leased_account_user_id=auth.uid(),
  lease_expires_at=t+interval '60 seconds',capability_sha256=extensions.digest(cap,'sha256')
 where consumer_id=r.consumer_id and event_sequence=r.event_sequence returning * into r;
 select * into strict e from private.market_events where sequence=r.event_sequence;
 return jsonb_build_object('claimed',true,'consumerId',r.consumer_id,'eventSequence',r.event_sequence,'leaseId',lease,'capability',cap,'attempt',r.attempts,
  'leaseExpiresAt',r.lease_expires_at,'subjectKey',r.subject_key,'subjectOrdinal',r.subject_ordinal,
  'event',jsonb_build_object('subjectKind',e.subject_kind,'subjectId',e.subject_id,'event',e.event,'reason',e.reason,'recordedAt',private.market_instant_text_v1(e.recorded_at)));
end $$;

-- The lease of a row for its holder: account, active token, consumer delegation, lease, capability, deadline.
create function private.market_event_for_lease_v1(p_consumer text,p_sequence bigint,p_capability text,p_lease uuid) returns private.market_event_outbox
language plpgsql security definer set search_path='' as $$
declare r private.market_event_outbox;begin
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'market_event_lease_denied' using errcode='42501';end if;
 select * into r from private.market_event_outbox where consumer_id=p_consumer and event_sequence=p_sequence for update;
 if not found or r.status<>'leased' or r.lease_id is distinct from p_lease or p_capability is null or length(p_capability)<32
 or r.capability_sha256 is distinct from extensions.digest(p_capability,'sha256') or r.leased_account_user_id is distinct from auth.uid()
 then raise exception 'market_event_lease_denied' using errcode='42501';end if;
 perform 1 from private.worker_tokens where id=r.leased_by and execution_account_user_id=auth.uid() and status='active' and revoked_at is null for share;
 if not found then raise exception 'market_event_lease_denied' using errcode='42501';end if;
 if not private.market_event_delegation_live_v1(r.leased_by,p_consumer) then raise exception 'market_event_delegation_required' using errcode='42501';end if;
 if r.lease_expires_at<=clock_timestamp() then raise exception 'market_event_lease_denied' using errcode='42501';end if;
 return r;
end $$;

create function private.worker_renew_market_event_v1(p_consumer text,p_sequence bigint,p_capability text,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.market_event_outbox;begin
 perform private.market_require_read_committed_v1();
 r:=private.market_event_for_lease_v1(p_consumer,p_sequence,p_capability,p_lease);
 update private.market_event_outbox set lease_expires_at=clock_timestamp()+interval '60 seconds' where consumer_id=p_consumer and event_sequence=p_sequence
 returning * into r;
 return jsonb_build_object('renewed',true,'leaseExpiresAt',r.lease_expires_at);
end $$;

-- The effect and the completion in one transaction; the receipt keeps the attempt's binding, and a
-- replay is validated against it, not against the cleared lease.
create function private.worker_complete_market_event_v1(p_consumer text,p_sequence bigint,p_capability text,p_lease uuid,p_effect jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.market_event_outbox;rc private.market_event_receipts;sha text;deadline timestamptz;begin
 perform private.market_require_read_committed_v1();
 if p_effect is null or jsonb_typeof(p_effect)<>'object' or octet_length(p_effect::text)>65536 then raise exception 'market_event_effect_invalid' using errcode='22023';end if;
 sha:=encode(extensions.digest(convert_to(p_effect::text,'UTF8'),'sha256'),'hex');
 select * into rc from private.market_event_receipts where consumer_id=p_consumer and event_sequence=p_sequence;
 if found then
  if rc.lease_id is distinct from p_lease or rc.account_user_id is distinct from auth.uid() or p_capability is null
  or rc.capability_sha256 is distinct from extensions.digest(p_capability,'sha256') or rc.effect_sha256<>sha
  or not exists(select 1 from private.worker_tokens w where w.id=rc.worker_token_id and w.execution_account_user_id=auth.uid() and w.status='active' and w.revoked_at is null)
  then raise exception 'market_event_lease_denied' using errcode='42501';end if;
  return jsonb_build_object('completed',true,'replayed',true);
 end if;
 r:=private.market_event_for_lease_v1(p_consumer,p_sequence,p_capability,p_lease);
 deadline:=r.lease_expires_at;
 insert into private.market_event_receipts(consumer_id,event_sequence,lease_id,worker_token_id,account_user_id,capability_sha256,effect,effect_sha256)
 values(p_consumer,p_sequence,p_lease,r.leased_by,auth.uid(),r.capability_sha256,p_effect,sha);
 update private.market_event_outbox set status='completed',completed_at=clock_timestamp(),lease_id=null,leased_by=null,leased_account_user_id=null,
  lease_expires_at=null,capability_sha256=null,last_error=null where consumer_id=p_consumer and event_sequence=p_sequence;
 -- No wait extends the lease: the deadline is read after the last write.
 if deadline<=clock_timestamp() then raise exception 'market_event_lease_denied' using errcode='42501';end if;
 return jsonb_build_object('completed',true,'replayed',false);
end $$;

create function private.worker_fail_market_event_v1(p_consumer text,p_sequence bigint,p_capability text,p_lease uuid,p_code text,p_detail text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.market_event_outbox;blocked boolean;begin
 perform private.market_require_read_committed_v1();
 if p_code is null or p_code !~ '^[a-z][a-z0-9_]{2,59}$' or (p_detail is not null and length(p_detail)>500) then raise exception 'market_event_invalid' using errcode='22023';end if;
 r:=private.market_event_for_lease_v1(p_consumer,p_sequence,p_capability,p_lease);
 blocked:=r.attempts>=5;
 update private.market_event_outbox set status=case when blocked then 'blocked' else 'pending' end,
  available_at=case when blocked then available_at else clock_timestamp()+make_interval(secs=>30*r.attempts) end,
  lease_id=null,leased_by=null,leased_account_user_id=null,lease_expires_at=null,capability_sha256=null,
  last_error=jsonb_build_object('code',p_code,'detail',p_detail) where consumer_id=p_consumer and event_sequence=p_sequence;
 return jsonb_build_object('blocked',blocked);
end $$;

-- 11. Operator: retry a blocked row with a fresh budget, and read the health of each consumer.
create function private.retry_blocked_market_event_v1(p_command uuid,p_consumer text,p_sequence bigint,p_reason text,p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior private.market_event_operator_commands;begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 perform private.market_require_read_committed_v1();
 if p_command is null or p_consumer is null or p_sequence is null or p_reason is null or length(btrim(p_reason))<5 then raise exception 'market_event_invalid' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-command:'||p_command::text,0));
 select * into prior from private.market_event_operator_commands where command_id=p_command;
 if found then
  if prior.consumer_id<>p_consumer or prior.event_sequence<>p_sequence or prior.actor_user_id<>p_actor_user_id then raise exception 'platform_method_request_reused' using errcode='22023';end if;
  return jsonb_build_object('replayed',true);
 end if;
 update private.market_event_outbox set status='pending',attempts=0,available_at=clock_timestamp(),last_error=null
 where consumer_id=p_consumer and event_sequence=p_sequence and status='blocked';
 if not found then raise exception 'market_event_not_blocked' using errcode='22023';end if;
 insert into private.market_event_operator_commands(command_id,consumer_id,event_sequence,action,reason,actor_user_id)
 values(p_command,p_consumer,p_sequence,'retry_blocked',btrim(p_reason),p_actor_user_id);
 return jsonb_build_object('replayed',false);
end $$;

create function private.market_event_outbox_health_v1(p_actor_user_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 perform private.require_platform_principal_v1(p_actor_user_id);
 return coalesce((select jsonb_agg(jsonb_build_object('consumerId',c.id,'state',c.state,
  'pending',(select count(*) from private.market_event_outbox o where o.consumer_id=c.id and o.status in ('pending','leased')),
  'blocked',(select count(*) from private.market_event_outbox o where o.consumer_id=c.id and o.status='blocked'),
  'oldestPendingSeconds',(select floor(extract(epoch from clock_timestamp()-min(o.created_at)))::bigint from private.market_event_outbox o
    where o.consumer_id=c.id and o.status in ('pending','leased','blocked'))) order by c.id) from private.market_event_consumers c),'[]');
end $$;

-- 12. Public wrappers of the worker steps, reached as authenticated like the acquisition steps.
create function public.worker_claim_market_event_v1(p_worker_token text,p_consumer text) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_claim_market_event_v1(p_worker_token,p_consumer);$$;
create function public.worker_renew_market_event_v1(p_consumer text,p_sequence bigint,p_capability text,p_lease uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_renew_market_event_v1(p_consumer,p_sequence,p_capability,p_lease);$$;
create function public.worker_complete_market_event_v1(p_consumer text,p_sequence bigint,p_capability text,p_lease uuid,p_effect jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_complete_market_event_v1(p_consumer,p_sequence,p_capability,p_lease,p_effect);$$;
create function public.worker_fail_market_event_v1(p_consumer text,p_sequence bigint,p_capability text,p_lease uuid,p_code text,p_detail text) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_fail_market_event_v1(p_consumer,p_sequence,p_capability,p_lease,p_code,p_detail);$$;

do $$ declare t text;begin
 foreach t in array array['market_event_consumers','market_event_consumer_commands','market_event_subject_counters','market_event_outbox',
  'market_event_receipts','market_event_consumer_delegations','market_event_operator_commands'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('create policy %I on private.%I as restrictive for all to public using(false) with check(false)',t||'_deny',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.guard_platform_ledger_truncate_v1()',t||'_truncate_guard',t);
 end loop;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure::text signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('market_require_read_committed_v1','guard_market_event_outbox_v1','guard_market_event_consumer_v1',
  'guard_market_event_delegation_v1','market_event_subject_key_v1','fan_out_market_event_v1','register_market_event_consumer_v1',
  'disable_market_event_consumer_v1','grant_market_event_delegation_v1','revoke_market_event_delegation_v1','market_event_delegation_live_v1',
  'worker_claim_market_event_v1','market_event_for_lease_v1','worker_renew_market_event_v1','worker_complete_market_event_v1',
  'worker_fail_market_event_v1','retry_blocked_market_event_v1','market_event_outbox_health_v1'))
 or (n.nspname='public' and p.proname in ('worker_claim_market_event_v1','worker_renew_market_event_v1','worker_complete_market_event_v1','worker_fail_market_event_v1'))
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('worker_claim_market_event_v1','worker_renew_market_event_v1','worker_complete_market_event_v1','worker_fail_market_event_v1') then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
 end loop;
end $$;

-- Boot contract: the database announces the market outbox before any image requires it.
do $$declare body text;begin
 select pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure) into body;
 if position('market-event-outbox.v1' in body)>0 then raise exception 'market_capability_already_registered';end if;
 if position('market-version-commit.v1' in body)=0 then raise exception 'runtime_capability_anchor_missing';end if;
 body:=replace(body,'market-version-commit.v1','market-version-commit.v1","market-event-outbox.v1');
 execute body;
end $$;

comment on table private.market_event_outbox is 'Market event outbox (ADR 0023, M2 part 3): one row per consumer and event, born with the event, processed per row until a receipt, ordered per subject.';
comment on table private.market_event_receipts is 'Immutable receipts of the market event outbox: the effect and the binding of the attempt that completed the row.';
