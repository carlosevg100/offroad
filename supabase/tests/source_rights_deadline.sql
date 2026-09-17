-- An expiry must advance during a single long SQL request; statement_timestamp is frozen.
begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 perform public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',0,array['read','process','store','derive'],array['analysis'],clock_timestamp()+interval '2 seconds',null,gen_random_uuid(),repeat('a',64));
 if not exists(select 1 from public.source_versions where id='a11b0000-0000-4000-9000-000000000004') then raise exception 'unexpired source denied'; end if;
 perform pg_sleep(2.1);
 if exists(select 1 from public.source_versions where id='a11b0000-0000-4000-9000-000000000004') then raise exception 'expiry frozen at request start'; end if;
end $$;
reset role;
select 'source_rights_deadline' as test,'PASS' as result;
rollback;
