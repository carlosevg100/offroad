-- M2 part 3, fifth review round: a transaction that holds the market authority exclusively only revokes and
-- reads. Every market command enters through market_require_read_committed_v1 and is refused there when its
-- transaction holds the authority exclusively, before it takes a command, job or source lock. The exclusive
-- holder therefore never requests a lock that a transaction waiting at the door can hold, and no cycle can
-- include it. The fan-out of an event runs inside the event's own transaction, so it checks isolation and
-- enters the door itself (a no-op under the exclusive holder) instead of passing the command gate.
create or replace function private.market_require_read_committed_v1() returns void
language plpgsql volatile set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'market_isolation_unsupported' using errcode='25001';end if;
 if private.market_authority_mode_v1()='exclusive' then raise exception 'market_authority_order' using errcode='55000';end if;
 perform private.market_authority_read_v1();
end $$;

create or replace function private.fan_out_market_event_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare c record;k text;n bigint;begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'market_isolation_unsupported' using errcode='25001';end if;
 perform private.market_authority_read_v1();
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

revoke all on function private.market_require_read_committed_v1() from public,anon,authenticated,service_role;
revoke all on function private.fan_out_market_event_v1() from public,anon,authenticated,service_role;
