-- Market reference foundation, third review round (ADR 0023). A version's lifecycle becomes one row of
-- state (open, sealed, purged) that every writer locks before deciding and that every transition
-- updates. Under READ COMMITTED a waiting writer then sees the committed state; under REPEATABLE READ or
-- SERIALIZABLE a writer whose snapshot predates a committed transition fails with a serialization error
-- instead of acting on a stale view. Content enters only an open version; a seal locks its own state and
-- every dependency's state in a fixed order; a purge closes the version for good; and event subjects
-- must be written in canonical UUID form so one object never has two identities in the ledger.
set search_path='';

create table private.market_version_states(
 version_id uuid primary key references private.market_versions(id),
 state text not null check(state in ('open','sealed','purged')),
 changed_at timestamptz not null default clock_timestamp());

-- Every version is born open; no other insert is accepted.
create function private.open_market_version_state_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.market_version_states(version_id,state) values(new.id,'open');
 return null;
end $$;
-- Versions recorded before this migration take the state their seal and events already imply.
insert into private.market_version_states(version_id,state)
 select v.id,case when exists(select 1 from private.market_events e where e.subject_kind='version' and e.subject_id=v.id::text and e.event='purged') then 'purged'
  when exists(select 1 from private.market_version_seals s where s.version_id=v.id) then 'sealed' else 'open' end
 from private.market_versions v;

create trigger market_versions_open_state after insert on private.market_versions for each row execute function private.open_market_version_state_v1();
-- Only forward transitions: open to sealed, open to purged, sealed to purged.
create function private.guard_market_version_state_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.state<>'open' or not exists(select 1 from private.market_versions where id=new.version_id) then raise exception 'market_version_state_invalid' using errcode='23514';end if;
  return new;
 end if;
 if tg_op='UPDATE' and new.version_id=old.version_id and ((old.state='open' and new.state in ('sealed','purged')) or (old.state='sealed' and new.state='purged')) then
  new.changed_at:=clock_timestamp();return new;end if;
 raise exception 'market_version_state_invalid' using errcode='23514';
end $$;
create trigger market_version_states_guard before insert or update or delete on private.market_version_states for each row execute function private.guard_market_version_state_v1();

-- The state of a version, locked: the decision that follows sees it current, or the snapshot fails.
create function private.lock_market_version_state_v1(p_version uuid,p_exclusive boolean) returns text
language plpgsql security definer set search_path='' as $$
declare s text;begin
 if p_exclusive then select state into s from private.market_version_states where version_id=p_version for update;
 else select state into s from private.market_version_states where version_id=p_version for share;end if;
 if s is null then raise exception 'market_version_unknown' using errcode='23503';end if;
 return s;
end $$;

-- Content (observations and inputs) enters only an open version.
create or replace function private.guard_market_version_open_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.market_versions;lo private.market_logical_objects;a private.market_acquisitions;begin
 if private.lock_market_version_state_v1(new.version_id,true)<>'open' then raise exception 'market_version_closed' using errcode='23514';end if;
 select * into v from private.market_versions where id=new.version_id;
 if tg_table_name='market_version_inputs' then
  select * into lo from private.market_logical_objects where logical_id=v.logical_id;
  if lo.category in ('observed','consensus','document_fact') then
   if new.acquisition_id is null then raise exception 'market_direct_version_needs_acquisition' using errcode='22023';end if;
   select * into a from private.market_acquisitions where id=new.acquisition_id;
   if a.source_id<>lo.source_id then raise exception 'market_input_other_source' using errcode='22023';end if;
  else
   -- A derived object reads sealed, quality-approved versions with content only, never itself.
   if new.dependency_version_id is null or new.dependency_version_id=new.version_id
   or private.lock_market_version_state_v1(new.dependency_version_id,false)<>'sealed'
   or not private.market_version_quality_approved_v1(new.dependency_version_id)
   or not exists(select 1 from private.market_observations x where x.version_id=new.dependency_version_id)
   then raise exception 'market_derived_version_needs_approved_dependency' using errcode='22023';end if;
  end if;
 end if;
 return new;
end $$;

-- The seal locks its own state, then every dependency's state in id order, before any decision, and
-- moves its own state to sealed in the same transaction.
create or replace function private.guard_market_version_seal_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.market_versions;lo private.market_logical_objects;n_obs integer;n_in integer;dep uuid;begin
 if private.lock_market_version_state_v1(new.version_id,true)<>'open' then raise exception 'market_version_closed' using errcode='23514';end if;
 for dep in select i.dependency_version_id from private.market_version_inputs i where i.version_id=new.version_id and i.dependency_version_id is not null order by 1 loop
  if private.lock_market_version_state_v1(dep,false)<>'sealed' then raise exception 'market_version_dependency_invalid' using errcode='22023';end if;
 end loop;
 select * into v from private.market_versions where id=new.version_id;
 select * into lo from private.market_logical_objects where logical_id=v.logical_id;
 select count(*) into n_obs from private.market_observations where version_id=new.version_id;
 select count(*) into n_in from private.market_version_inputs where version_id=new.version_id;
 if n_obs=0 or n_in=0 or new.observation_count<>n_obs or new.input_count<>n_in then raise exception 'market_version_seal_counts' using errcode='22023';end if;
 if encode(extensions.digest(convert_to(private.market_version_canonical_v1(new.version_id),'UTF8'),'sha256'),'hex')<>v.sha256 then
  raise exception 'market_version_fingerprint_mismatch' using errcode='22023';end if;
 if lo.category in ('observed','consensus','document_fact') then
  if exists(select 1 from private.market_version_inputs i join private.market_acquisitions a on a.id=i.acquisition_id
   join private.market_source_revisions s on s.source_id=a.source_id and s.revision=a.source_revision
   where i.version_id=new.version_id and s.license<>v.license) then raise exception 'market_version_license_mismatch' using errcode='22023';end if;
  if exists(select 1 from private.market_observations o where o.version_id=new.version_id and not exists(
   select 1 from private.market_version_inputs i join private.market_acquisitions a on a.id=i.acquisition_id where i.version_id=new.version_id and a.acquired_at=o.acquired_at))
  then raise exception 'market_observation_acquisition_mismatch' using errcode='22023';end if;
 else
  if exists(select 1 from private.market_version_inputs i join private.market_versions d on d.id=i.dependency_version_id
   where i.version_id=new.version_id and (d.license<>v.license or not private.market_version_quality_approved_v1(d.id)
    or not exists(select 1 from private.market_observations x where x.version_id=d.id)))
  then raise exception 'market_version_dependency_invalid' using errcode='22023';end if;
  if exists(select 1 from private.market_observations o, private.market_version_inputs i
   where o.version_id=new.version_id and i.version_id=new.version_id and (
    o.available_at<(select max(x.available_at) from private.market_observations x where x.version_id=i.dependency_version_id)
    or o.acquired_at<(select max(x.acquired_at) from private.market_observations x where x.version_id=i.dependency_version_id)))
  then raise exception 'market_derived_dates_before_dependencies' using errcode='22023';end if;
 end if;
 update private.market_version_states set state='sealed' where version_id=new.version_id;
 return new;
end $$;

create or replace function private.seal_market_version_v1(p_version uuid) returns void
language plpgsql security definer set search_path='' as $$
declare n_obs integer;n_in integer;begin
 perform private.lock_market_version_state_v1(p_version,true);
 select count(*) into n_obs from private.market_observations where version_id=p_version;
 select count(*) into n_in from private.market_version_inputs where version_id=p_version;
 insert into private.market_version_seals(version_id,observation_count,input_count) values(p_version,n_obs,n_in);
end $$;

-- Quality: sealed (and not purged) and last approved.
create or replace function private.market_version_quality_approved_v1(p_version uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select s.state='sealed' from private.market_version_states s where s.version_id=p_version),false)
  and coalesce((select e.event='approved' from private.market_events e
  where e.subject_kind='version' and e.subject_id=p_version::text and e.event in ('approved','quarantined','revoked','purged')
  order by e.sequence desc limit 1),false);
$$;

-- Events: canonical UUID subjects; a version event locks the state; a purge moves it to purged for good.
create or replace function private.guard_market_event_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare s text;begin
 if new.subject_kind in ('version','acquisition') then
  if new.subject_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'market_event_subject_not_canonical' using errcode='22023';end if;
 end if;
 if new.subject_kind='version' then
  if not exists(select 1 from private.market_versions where id=new.subject_id::uuid) then raise exception 'market_event_subject_unknown' using errcode='23503';end if;
  s:=private.lock_market_version_state_v1(new.subject_id::uuid,true);
  if s='purged' then raise exception 'market_version_purged' using errcode='23514';end if;
  if new.event='approved' and s<>'sealed' then raise exception 'market_version_not_sealed' using errcode='22023';end if;
  if new.event='purged' then update private.market_version_states set state='purged' where version_id=new.subject_id::uuid;end if;
 elsif new.subject_kind='acquisition' then
  if not exists(select 1 from private.market_acquisitions where id=new.subject_id::uuid) then raise exception 'market_event_subject_unknown' using errcode='23503';end if;
 elsif not exists(select 1 from private.market_source_revisions where source_id=new.subject_id) then raise exception 'market_event_subject_unknown' using errcode='23503';
 end if;
 new.transaction_id:=txid_current();
 return new;
end $$;

-- Content leaves only a purged version, in the transaction of its purge event.
create or replace function private.guard_market_content_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' and private.lock_market_version_state_v1(old.version_id,true)='purged'
 and exists(select 1 from private.market_events e where e.subject_kind='version' and e.subject_id=old.version_id::text
  and e.event='purged' and e.transaction_id=txid_current()) then return old;end if;
 raise exception 'market_content_immutable' using errcode='23514';
end $$;

do $$ begin
 execute 'alter table private.market_version_states enable row level security';
 execute 'alter table private.market_version_states force row level security';
 execute 'create policy market_version_states_deny on private.market_version_states as restrictive for all to public using(false) with check(false)';
 execute 'revoke all on private.market_version_states from public,anon,authenticated,service_role';
 execute 'create trigger market_version_states_truncate_guard before truncate on private.market_version_states for each statement execute function private.guard_platform_ledger_truncate_v1()';
end $$;
revoke all on function private.open_market_version_state_v1(),private.guard_market_version_state_v1(),private.lock_market_version_state_v1(uuid,boolean),
 private.guard_market_version_open_v1(),private.guard_market_version_seal_v1(),private.seal_market_version_v1(uuid),private.market_version_quality_approved_v1(uuid),
 private.guard_market_event_v1(),private.guard_market_content_v1()
 from public,anon,authenticated,service_role;
