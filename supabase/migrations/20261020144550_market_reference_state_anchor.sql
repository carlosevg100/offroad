-- Market reference foundation, fourth review round (ADR 0023). The version state row becomes the
-- update anchor of everything a decision depends on: adding content and recording a quality event
-- (approved, quarantined, revoked) update it, so a writer whose REPEATABLE READ or SERIALIZABLE
-- snapshot predates either change fails when it locks the row. State transitions are tied to their
-- evidence in the database: a version becomes sealed only once its validated seal row exists, and
-- purged only once a purge event of the same transaction exists; a direct UPDATE cannot skip either.
set search_path='';

alter table private.market_version_states
 add column content_revision bigint not null default 0 check(content_revision>=0),
 add column quality_revision bigint not null default 0 check(quality_revision>=0);

-- Transitions need their evidence; revisions only move forward; nothing else changes.
create or replace function private.guard_market_version_state_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.state<>'open' or new.content_revision<>0 or new.quality_revision<>0 or not exists(select 1 from private.market_versions where id=new.version_id)
  then raise exception 'market_version_state_invalid' using errcode='23514';end if;
  return new;
 end if;
 if tg_op<>'UPDATE' or new.version_id<>old.version_id or new.content_revision<old.content_revision or new.quality_revision<old.quality_revision then
  raise exception 'market_version_state_invalid' using errcode='23514';end if;
 if new.state<>old.state then
  if not ((old.state='open' and new.state in ('sealed','purged')) or (old.state='sealed' and new.state='purged')) then raise exception 'market_version_state_invalid' using errcode='23514';end if;
  if new.state='sealed' and not exists(select 1 from private.market_version_seals s where s.version_id=new.version_id) then raise exception 'market_version_state_invalid' using errcode='23514';end if;
  if new.state='purged' and not exists(select 1 from private.market_events e where e.subject_kind='version' and e.subject_id=new.version_id::text
   and e.event='purged' and e.transaction_id=txid_current()) then raise exception 'market_version_state_invalid' using errcode='23514';end if;
 end if;
 new.changed_at:=clock_timestamp();
 return new;
end $$;

-- Content enters only an open version and updates the anchor.
create or replace function private.guard_market_version_open_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.market_versions;lo private.market_logical_objects;a private.market_acquisitions;begin
 if private.lock_market_version_state_v1(new.version_id,true)<>'open' then raise exception 'market_version_closed' using errcode='23514';end if;
 update private.market_version_states set content_revision=content_revision+1 where version_id=new.version_id;
 select * into v from private.market_versions where id=new.version_id;
 if tg_table_name='market_version_inputs' then
  select * into lo from private.market_logical_objects where logical_id=v.logical_id;
  if lo.category in ('observed','consensus','document_fact') then
   if new.acquisition_id is null then raise exception 'market_direct_version_needs_acquisition' using errcode='22023';end if;
   select * into a from private.market_acquisitions where id=new.acquisition_id;
   if a.source_id<>lo.source_id then raise exception 'market_input_other_source' using errcode='22023';end if;
  else
   if new.dependency_version_id is null or new.dependency_version_id=new.version_id
   or private.lock_market_version_state_v1(new.dependency_version_id,false)<>'sealed'
   or not private.market_version_quality_approved_v1(new.dependency_version_id)
   or not exists(select 1 from private.market_observations x where x.version_id=new.dependency_version_id)
   then raise exception 'market_derived_version_needs_approved_dependency' using errcode='22023';end if;
  end if;
 end if;
 return new;
end $$;

-- The seal row is validated before insert (unchanged checks, without moving the state); the state
-- moves to sealed after the row exists.
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
 return new;
end $$;
create function private.mark_market_version_sealed_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update private.market_version_states set state='sealed' where version_id=new.version_id;
 return null;
end $$;
create trigger market_version_seals_mark_sealed after insert on private.market_version_seals for each row execute function private.mark_market_version_sealed_v1();

-- Events: quality events update the anchor; a purge moves the state after its event row exists.
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
  if new.event in ('approved','quarantined','revoked') then
   update private.market_version_states set quality_revision=quality_revision+1 where version_id=new.subject_id::uuid;end if;
 elsif new.subject_kind='acquisition' then
  if not exists(select 1 from private.market_acquisitions where id=new.subject_id::uuid) then raise exception 'market_event_subject_unknown' using errcode='23503';end if;
 elsif not exists(select 1 from private.market_source_revisions where source_id=new.subject_id) then raise exception 'market_event_subject_unknown' using errcode='23503';
 end if;
 new.transaction_id:=txid_current();
 return new;
end $$;
create function private.mark_market_version_purged_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.subject_kind='version' and new.event='purged' then
  update private.market_version_states set state='purged' where version_id=new.subject_id::uuid;end if;
 return null;
end $$;
create trigger market_events_mark_purged after insert on private.market_events for each row execute function private.mark_market_version_purged_v1();

revoke all on function private.guard_market_version_state_v1(),private.guard_market_version_open_v1(),private.guard_market_version_seal_v1(),
 private.mark_market_version_sealed_v1(),private.guard_market_event_v1(),private.mark_market_version_purged_v1()
 from public,anon,authenticated,service_role;
