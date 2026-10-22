-- M2 part 3, third review round: one rule for writers, checked where the locks are taken. A revocation or
-- purge of an acquisition or a source must come before every market read lock of its transaction: the
-- version-state helper and the readers' anchor helper mark the transaction (a transaction-local setting,
-- kept when a savepoint is released and undone when it rolls back), and the anchor trigger refuses once
-- the mark is set. Anchors of one writer go in ascending byte order, as readers take them. A subject that
-- does not exist takes no anchor; its event is refused by the subject guard.
create or replace function private.lock_market_version_state_v1(p_version uuid,p_exclusive boolean) returns text
language plpgsql security definer set search_path='' as $$
declare s text;begin
 perform set_config('offroad.market_read_locked','on',true);
 if p_exclusive then select state into s from private.market_version_states where version_id=p_version for update;
 else select state into s from private.market_version_states where version_id=p_version for share;end if;
 if s is null then raise exception 'market_version_unknown' using errcode='23503';end if;
 return s;
end $$;

create or replace function private.lock_market_read_authority_v1(p_versions uuid[],p_acquisitions uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare k text;v uuid;begin
 perform set_config('offroad.market_read_locked','on',true);
 for k in select distinct z.key collate "C" as key from (
   select 'market-authority:acquisition:'||x::text key from unnest(p_acquisitions) x where x is not null
   union select 'market-authority:source:'||a.source_id from private.market_acquisitions a where a.id=any(p_acquisitions)) z order by 1 loop
  perform pg_advisory_xact_lock_shared(hashtextextended(k,0));
 end loop;
 for v in select distinct x from unnest(p_versions) x where x is not null order by 1 loop
  perform private.lock_market_version_state_v1(v,false);
 end loop;
end $$;

create or replace function private.anchor_market_authority_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare k text:='market-authority:'||new.subject_kind||':'||new.subject_id;begin
 if new.subject_kind in ('acquisition','source') and new.event in ('revoked','purged') then
  if (new.subject_kind='acquisition' and not exists(select 1 from private.market_acquisitions where id::text=new.subject_id))
  or (new.subject_kind='source' and not exists(select 1 from private.market_source_revisions where source_id=new.subject_id)) then return new;end if;
  if coalesce(current_setting('offroad.market_read_locked',true),'')='on'
  or exists(select 1 from private.market_events e where e.transaction_id=txid_current() and e.subject_kind in ('acquisition','source')
   and e.event in ('revoked','purged') and ('market-authority:'||e.subject_kind||':'||e.subject_id) collate "C">k collate "C")
  then raise exception 'market_authority_order' using errcode='55000';end if;
  perform pg_advisory_xact_lock(hashtextextended(k,0));
 end if;
 return new;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('lock_market_version_state_v1','lock_market_read_authority_v1','anchor_market_authority_v1')
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
