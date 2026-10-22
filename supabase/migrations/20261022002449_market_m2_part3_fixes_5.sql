-- M2 part 3: the readers' anchor order is the byte order of the key, carried by the distinct key itself.
create or replace function private.lock_market_read_authority_v1(p_versions uuid[],p_acquisitions uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare k text;v uuid;begin
 for k in select distinct z.key collate "C" as key from (
   select 'market-authority:acquisition:'||x::text key from unnest(p_acquisitions) x where x is not null
   union select 'market-authority:source:'||a.source_id from private.market_acquisitions a where a.id=any(p_acquisitions)) z order by 1 loop
  perform pg_advisory_xact_lock_shared(hashtextextended(k,0));
 end loop;
 for v in select distinct x from unnest(p_versions) x where x is not null order by 1 loop
  perform private.lock_market_version_state_v1(v,false);
 end loop;
end $$;
revoke all on function private.lock_market_read_authority_v1(uuid[],uuid[]) from public,anon,authenticated,service_role;
