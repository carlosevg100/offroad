-- Rollback-only verification; concurrency is a separate local-CI suite.
begin;
\ir support/execution_commands_fixture.sql
do $$declare org uuid:='a11b0000-0000-4000-9000-000000000001';begin
 if private.receivables_analytical_release_enabled(null) is distinct from false then raise exception 'null organization enabled';end if;
 if private.receivables_analytical_release_enabled(org) is not true then raise exception 'fixture release not enabled';end if;
 raise notice 'PASS: existing release is readable and null organization is denied';
 insert into private.receivables_analytical_release_grants(organization_id,enabled,granted_by)
 values(org,false,'Synthetic rollback-only pause');
 if private.receivables_analytical_release_enabled(org) is not false then raise exception 'first pause not applied';end if;
 update private.receivables_analytical_release_grants set enabled=true where organization_id=org;
 if private.receivables_analytical_release_enabled(org) is not true then raise exception 'unpause not visible';end if;
 delete from private.receivables_analytical_release_grants where organization_id=org;
 if private.receivables_analytical_release_enabled(org) is not true then raise exception 'removed exception not visible';end if;
 raise notice 'PASS: first pause, update and deletion use the same gate';
 update private.platform_capability_releases set released=false where capability_key='finance.receivables-released-analysis';
 if private.receivables_analytical_release_enabled(org) is not false then raise exception 'global withdrawal not applied';end if;
 update private.platform_capability_releases set released=true where capability_key='finance.receivables-released-analysis';
 if private.receivables_analytical_release_enabled(org) is not true then raise exception 'global release not visible';end if;
 raise notice 'PASS: global capability withdrawal and restore are current';
end $$;
do $$declare r text;begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.guard_receivables_release_write_v1()','EXECUTE') then raise exception 'release guard exposed';end if;
 end loop;
 if not exists(select 1 from pg_proc where oid='private.receivables_analytical_release_enabled(uuid)'::regprocedure and provolatile='v') then raise exception 'release predicate snapshot is stale';end if;
 raise notice 'PASS: trigger implementation private and release predicate volatile';
end $$;
rollback;

begin isolation level repeatable read;
do $$begin
 begin perform private.receivables_analytical_release_enabled('a11b0000-0000-4000-9000-000000000001');
 raise exception 'old snapshot accepted';exception when invalid_transaction_state then
 if sqlerrm<>'receivables_release_isolation_unsupported' then raise;end if;end;
 raise notice 'PASS: repeatable-read authorization is refused';
end $$;
rollback;
begin isolation level serializable;
do $$begin
 begin perform private.receivables_analytical_release_enabled('a11b0000-0000-4000-9000-000000000001');
 raise exception 'old snapshot accepted';exception when invalid_transaction_state then
 if sqlerrm<>'receivables_release_isolation_unsupported' then raise;end if;end;
 raise notice 'PASS: serializable authorization is refused';
end $$;
rollback;
select 'r01_release_serialization: PASS' result;
