-- Market reference foundation, fifth review round (ADR 0023). Two orderings become the database's own.
-- A version's events carry an ordinal assigned while its state row is locked, so the latest event in
-- the quality decision is the one serialized last, not the one that drew the higher identity first.
-- And a seal closes the version for content within the same command: an insert that follows the seal
-- row (a data-modifying CTE, for instance) is refused even before the state moves to sealed.
set search_path='';

alter table private.market_events add column version_ordinal bigint check(version_ordinal>0);
alter table private.market_events add constraint market_events_version_ordinal_required check((subject_kind='version')=(version_ordinal is not null));
create unique index market_events_version_ordinal on private.market_events(subject_id,version_ordinal) where subject_kind='version';

-- Every version event moves the anchor forward and takes its new value as ordinal.
create or replace function private.guard_market_event_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare s text;begin
 if new.subject_kind in ('version','acquisition') then
  if new.subject_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'market_event_subject_not_canonical' using errcode='22023';end if;
 end if;
 new.version_ordinal:=null;
 if new.subject_kind='version' then
  if not exists(select 1 from private.market_versions where id=new.subject_id::uuid) then raise exception 'market_event_subject_unknown' using errcode='23503';end if;
  s:=private.lock_market_version_state_v1(new.subject_id::uuid,true);
  if s='purged' then raise exception 'market_version_purged' using errcode='23514';end if;
  if new.event='approved' and s<>'sealed' then raise exception 'market_version_not_sealed' using errcode='22023';end if;
  update private.market_version_states set quality_revision=quality_revision+1 where version_id=new.subject_id::uuid
   returning quality_revision into new.version_ordinal;
 elsif new.subject_kind='acquisition' then
  if not exists(select 1 from private.market_acquisitions where id=new.subject_id::uuid) then raise exception 'market_event_subject_unknown' using errcode='23503';end if;
 elsif not exists(select 1 from private.market_source_revisions where source_id=new.subject_id) then raise exception 'market_event_subject_unknown' using errcode='23503';
 end if;
 new.transaction_id:=txid_current();
 return new;
end $$;

-- Quality: sealed (and not purged) and last approved, in the order serialized on the state row.
create or replace function private.market_version_quality_approved_v1(p_version uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select s.state='sealed' from private.market_version_states s where s.version_id=p_version),false)
  and coalesce((select e.event='approved' from private.market_events e
  where e.subject_kind='version' and e.subject_id=p_version::text and e.event in ('approved','quarantined','revoked','purged')
  order by e.version_ordinal desc limit 1),false);
$$;

-- Content enters only an open version that has no seal row, including one inserted earlier in the
-- same command; it updates the anchor.
create or replace function private.guard_market_version_open_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare v private.market_versions;lo private.market_logical_objects;a private.market_acquisitions;begin
 if private.lock_market_version_state_v1(new.version_id,true)<>'open'
 or exists(select 1 from private.market_version_seals s where s.version_id=new.version_id) then raise exception 'market_version_closed' using errcode='23514';end if;
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

revoke all on function private.guard_market_event_v1(),private.market_version_quality_approved_v1(uuid),private.guard_market_version_open_v1()
 from public,anon,authenticated,service_role;
