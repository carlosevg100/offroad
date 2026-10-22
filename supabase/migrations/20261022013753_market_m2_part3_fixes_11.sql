-- M2 part 3, seventh review round. (1) Storage authorization and the worker's orphan listing enter the
-- authority door as their first statement, like every market command; each body is pinned by its digest
-- before the change and must equal the exact transformation after it. (2) PostgreSQL locks an observation
-- before a row trigger runs, so a delete or update of observations enters the door in a statement trigger,
-- before any row is locked; the door helper lets an exclusive holder pass to perform its purge.
do $$
declare f record;src text;want text;begin
 for f in select p.oid,p.oid::regprocedure::text sig,p.prosrc,p.prosecdef,p.proconfig,p.proacl,x.pin from pg_proc p
  join (values('worker_can_access_market_object_v1','3bb13c55db541b054fd6af029e14f7cb'),('worker_list_market_orphans_v1','116b999027d0073d82b9c76e2f3b116e')) x(name,pin)
  on p.proname=x.name where p.pronamespace='private'::regnamespace order by 2
 loop
  if md5(f.prosrc)<>f.pin then raise exception 'market gate: unexpected body for %',f.sig;end if;
  want:=regexp_replace(f.prosrc,'^(\s*declare\s[^'']*?;begin)','\1 perform private.market_require_read_committed_v1();');
  if want=f.prosrc then raise exception 'market gate: no block opener in %',f.sig;end if;
  execute regexp_replace(pg_get_functiondef(f.oid),'(AS \$function\$\s*declare\s[^'']*?;begin)','\1 perform private.market_require_read_committed_v1();');
  select prosrc into src from pg_proc where oid=f.oid;
  if src is distinct from want or (select prosecdef is distinct from f.prosecdef or proconfig is distinct from f.proconfig or proacl is distinct from f.proacl from pg_proc where oid=f.oid)
  then raise exception 'market gate: % changed beyond the gate',f.sig;end if;
 end loop;
end $$;

create function private.enter_market_authority_for_content_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.market_authority_read_v1();
 return null;
end $$;
revoke all on function private.enter_market_authority_for_content_v1() from public,anon,authenticated,service_role;
create trigger market_observations_door before update or delete on private.market_observations
 for each statement execute function private.enter_market_authority_for_content_v1();
