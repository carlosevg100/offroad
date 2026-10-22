-- M2 part 3, fourth review round: authority is one transaction lock the server owns, not a setting a caller
-- can change. Every market command and every version-state or anchor read takes it shared on entry; a
-- revocation or purge of an acquisition or a source takes it exclusive, and is refused when its transaction
-- already holds it only shared. A writer that must read before revoking takes it exclusive first
-- (begin_market_authority_write_v1), so its whole set is held before any read. With one exclusive writer
-- and readers that wait at the door, no cycle can form between writers and readers.
create function private.market_authority_mode_v1() returns text
language sql stable set search_path='' as $$
 select case when bool_or(mode='ExclusiveLock') then 'exclusive' when bool_or(mode='ShareLock') then 'shared' end
 from pg_catalog.pg_locks where locktype='advisory' and pid=pg_catalog.pg_backend_pid() and classid=7340501 and objid=23 and objsubid=2 and granted;
$$;

create function private.market_authority_read_v1() returns void
language plpgsql security definer set search_path='' as $$
begin
 if private.market_authority_mode_v1() is null then perform pg_advisory_xact_lock_shared(7340501,23);end if;
end $$;

create function private.begin_market_authority_write_v1() returns void
language plpgsql security definer set search_path='' as $$
begin
 if private.market_authority_mode_v1()='shared' then raise exception 'market_authority_order' using errcode='55000';end if;
 perform pg_advisory_xact_lock(7340501,23);
end $$;

-- Every market command passes this gate first; it now also enters the authority door.
create or replace function private.market_require_read_committed_v1() returns void
language plpgsql volatile set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'market_isolation_unsupported' using errcode='25001';end if;
 perform private.market_authority_read_v1();
end $$;

create or replace function private.lock_market_version_state_v1(p_version uuid,p_exclusive boolean) returns text
language plpgsql security definer set search_path='' as $$
declare s text;begin
 perform private.market_authority_read_v1();
 if p_exclusive then select state into s from private.market_version_states where version_id=p_version for update;
 else select state into s from private.market_version_states where version_id=p_version for share;end if;
 if s is null then raise exception 'market_version_unknown' using errcode='23503';end if;
 return s;
end $$;

create or replace function private.lock_market_read_authority_v1(p_versions uuid[],p_acquisitions uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare k text;v uuid;begin
 perform private.market_authority_read_v1();
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
begin
 if new.subject_kind in ('acquisition','source') and new.event in ('revoked','purged') then
  if (new.subject_kind='acquisition' and not exists(select 1 from private.market_acquisitions where id::text=new.subject_id))
  or (new.subject_kind='source' and not exists(select 1 from private.market_source_revisions where source_id=new.subject_id)) then return new;end if;
  perform private.begin_market_authority_write_v1();
  perform pg_advisory_xact_lock(hashtextextended('market-authority:'||new.subject_kind||':'||new.subject_id,0));
 end if;
 return new;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('market_authority_mode_v1','market_authority_read_v1','begin_market_authority_write_v1','market_require_read_committed_v1',
  'lock_market_version_state_v1','lock_market_read_authority_v1','anchor_market_authority_v1')
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
