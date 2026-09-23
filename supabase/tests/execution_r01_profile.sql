-- Synthetic rollback-only storage proof. No activation.
begin;
\ir support/r01_execution_profile.sql
create function pg_temp.expect_r01_error(command text,expected text,label text) returns void language plpgsql as $$
begin
 begin execute command;exception when others then
  if sqlerrm=expected then raise notice 'PASS: %',label;return;end if;raise;
 end;raise exception 'missing denial: %',label;
end $$;
create temporary table r01_profile_stored as select pg_temp.insert_r01_profile(payload) id from r01_profile_test;
do $$ begin
 if not exists(select 1 from private.execution_method_profiles p join r01_profile_stored s using(id)
 where p.payload#>'{originalBudget}'='null'::jsonb and p.payload#>>'{limits,maxDurationMs}'='31000')
 then raise exception 'historical absence or operational containment changed';end if;
 raise notice 'PASS: exact R01 profile stored without inventing a historical budget';
end $$;
select pg_temp.expect_r01_error('select private.require_execution_release_v1(id) from r01_profile_stored','execution_r01_provenance_unavailable','stored profile cannot authorize R01');
select pg_temp.expect_r01_error($q$select private.request_work_execution_v1(id,'{}','{}') from r01_profile_stored$q$,'execution_subject_required','anonymous request denied');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(payload,'{}') from r01_profile_test$q$,'execution_profile_review_required','review still required');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(jsonb_set(payload,'{adapter}','"compiled-single-deterministic.v1"')) from r01_profile_test$q$,'execution_r01_profile_mismatch','compiled adapter cannot impersonate R01');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(jsonb_set(payload,'{limits,maxDurationMs}','31001')) from r01_profile_test$q$,'execution_r01_profile_mismatch','duration escalation denied');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(jsonb_set(payload,'{limits,maxCostMicrousd}','1')) from r01_profile_test$q$,'execution_r01_profile_mismatch','paid cost denied');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(jsonb_set(payload,'{limits,maxModelCalls}','1')) from r01_profile_test$q$,'execution_r01_profile_mismatch','model call denied');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(jsonb_set(payload,'{originalBudget}','{"maxDurationMs":31000}')) from r01_profile_test$q$,'execution_r01_profile_mismatch','invented historical budget denied');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(jsonb_set(payload,'{grantsExecution}','true')) from r01_profile_test$q$,'execution_r01_profile_mismatch','profile grant denied');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(jsonb_set(payload,'{sourceFingerprint}','"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"')) from r01_profile_test$q$,'execution_r01_profile_mismatch','different source bundle denied');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(jsonb_set(payload,'{method,executor,inputContractHash}','"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"')) from r01_profile_test$q$,'execution_r01_profile_mismatch','substituted input contract denied');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(jsonb_set(payload,'{method,executor,outputContractHash}','"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"')) from r01_profile_test$q$,'execution_r01_profile_mismatch','substituted output contract denied');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(jsonb_set(payload,'{method,executor,sourceClosureHash}','"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"')) from r01_profile_test$q$,'execution_r01_profile_mismatch','substituted executor denied');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(jsonb_set(payload,'{containment,version}','"future"')) from r01_profile_test$q$,'execution_r01_profile_mismatch','unreviewed containment denied');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(jsonb_set(payload,'{tools}','["tool"]')) from r01_profile_test$q$,'execution_r01_profile_mismatch','undeclared tool denied');
select pg_temp.expect_r01_error($q$select pg_temp.insert_r01_profile(jsonb_set(payload,'{allowedEffects}','["compile_artifact"]')) from r01_profile_test$q$,'execution_r01_profile_mismatch','artifact effect denied');
select pg_temp.expect_r01_error($q$update private.execution_method_profiles set canonical_payload=canonical_payload where id in(select id from r01_profile_stored)$q$,'contribution_revision_immutable','profile cannot be overwritten');
do $$ declare role_name text;begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'private.execution_method_profiles','SELECT,INSERT,UPDATE,DELETE')
  or has_function_privilege(role_name,'private.require_execution_release_v1(uuid)','EXECUTE') then raise exception 'R01 boundary exposed';end if;
 end loop;
 raise notice 'PASS: API roles receive neither storage nor release command';
end $$;
select 'execution_r01_profile: PASS' result;
rollback;
