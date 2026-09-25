-- Domain event identifiers the database derives are RFC 9562 UUIDs, which the worker's event contract
-- (packages/domain-contracts, z.uuid) requires: the procedure aggregate of a method release and the
-- event of a published platform release are version 5 UUIDs, deterministic, equal to the vector
-- shared with packages/domain-contracts/src/domain-event.test.ts, and closed to every API role.
begin;
do $$
declare rfc constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
 aggregate uuid:=private.method_procedure_aggregate_v1('synthetic-execution');
 event_id uuid:=private.platform_method_release_event_id_v1('synthetic-execution-test-v2','a11b0000-0000-4000-9000-000000000001');
 f record;role_name text;
begin
 if aggregate<>'8c12d8e2-daa1-5bc6-b9ab-fb695c749cab'::uuid or aggregate::text !~ rfc then
  raise exception 'procedure aggregate is not the shared version 5 vector: %',aggregate;
 end if;
 if event_id<>'ee927d77-2a6f-5d0f-a5d3-7d147f914061'::uuid or event_id::text !~ rfc then
  raise exception 'platform release event id is not the shared version 5 vector: %',event_id;
 end if;
 if private.method_procedure_aggregate_v1('synthetic-execution')<>aggregate
 or private.method_procedure_aggregate_v1('prepare-capital-structure-decision')=aggregate then
  raise exception 'procedure aggregate is not a deterministic function of the method';
 end if;
 if private.platform_method_release_event_id_v1('synthetic-execution-test-v2','a11b0000-0000-4000-9000-000000000002')=event_id
 or private.platform_method_release_event_id_v1('synthetic-execution-test-v3','a11b0000-0000-4000-9000-000000000001')=event_id then
  raise exception 'platform release event id does not separate releases and organizations';
 end if;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in ('method_procedure_aggregate_v1','platform_method_release_event_id_v1','capture_method_release_event_v1') loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,f.signature,'execute') then raise exception '% can execute %',role_name,f.signature; end if;
  end loop;
 end loop;
 if exists(select 1 from pg_proc where prosrc ~* 'md5\([^;]*\)::uuid' and oid in ('private.method_procedure_aggregate_v1(text)'::regprocedure,'private.capture_method_release_event_v1()'::regprocedure)) then
  raise exception 'an md5 digest still becomes a domain event identifier';
 end if;
 raise notice 'PASS: method_release identifiers are RFC 9562 version 5 UUIDs, deterministic, equal to the shared vector and closed to every API role';
end $$;
select 'domain_event_identifiers: PASS' result;
rollback;
