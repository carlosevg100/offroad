-- Synthetic rollback-only storage proof. Does not execute R01 or mutate its publication.
begin;
create temporary table r01_profile_test(payload jsonb);
insert into r01_profile_test values($profile${"adapter":"legacy-r01-artifact.v1","allowedEffects":["read_only"],"containment":{"maxCostMicrousd":0,"maxDurationMs":31000,"maxModelCalls":0,"version":"r01-runtime-containment.2026-09-22.v1"},"contractHashAlgorithm":"published-artifact-schema-export-sha256-v1","descriptors":{"input":{"artifactHash":"25e7fb90c4dcb08f3550d4969762320e2a7592625cc15c8f0a61d6939610edb5","exportName":"receivablesPoolUnderwritingInputSchema","schemaVersion":"published-artifact-schema-export.v1"},"output":{"artifactHash":"25e7fb90c4dcb08f3550d4969762320e2a7592625cc15c8f0a61d6939610edb5","exportName":"receivablesPoolUnderwritingSchema","schemaVersion":"published-artifact-schema-export.v1"}},"fingerprint":"7fc3be6e6169c027b1ba2f11f61abefdeccd5f0e087bd980a35c85e6575297b9","formulaCoverage":"executor_source_closure","grantsExecution":false,"limits":{"maxCostMicrousd":0,"maxDurationMs":31000,"maxModelCalls":0},"manifestHashAlgorithm":"method-stable-json-utf16-sha256-v1","method":{"baseManifestHash":"17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090","compilerHash":"757a3e46d1fc3fd4225e0f91e3302759bd59bb2aae5a3390a8a4db9b55c6bf2e","compilerVersion":"2026.09.18-v1","executor":{"inputContractHash":"898aeeb044bf8a66d85fb82df0d9dbc0f79f913c0f5402fa461669819949e3de","key":"@offroad/receivables-analysis#underwriteReceivablesPool","outputContractHash":"ee6b50df3822914a29c00d8750ed1d7f84c2dbf1ea8d08021d23917dd3491e2d","sourceClosureHash":"37ed5a9a2253f25e3c2b8d79d0e9cabf92c76e9bb3d06a74e52380d164c7e9e6","version":"2026.09.06-v1"},"formulas":[],"houseReleaseId":null,"manifestHash":"17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090","methodId":"underwrite-receivables-pool","methodVersion":"2026.09.06-v1","platformReleaseId":"r01-2026.09.06-v1"},"originalBudget":null,"schemaVersion":"execution-profile.v1","selectedComponentId":"legacy:R01","sourceFingerprint":"9e71b791b0f5a9c586c2865e6c3d61b8490d56d34918b1f8c1ea0fe9a8054c3a","tools":[]}$profile$::jsonb);
create function pg_temp.insert_r01_profile(p jsonb,review jsonb default null) returns uuid language plpgsql as $$
declare result uuid:=gen_random_uuid();begin
 insert into private.execution_method_profiles(id,platform_release_id,serialization_version,canonical_payload,payload_fingerprint,adapter_source_commit,review_evidence)
 values(result,'r01-2026.09.06-v1','offroad-execution-json-utf16-v1',p::text,encode(extensions.digest(p::text,'sha256'),'hex'),repeat('c',40),
 coalesce(review,jsonb_build_object('result','approved','subjectCommit',repeat('c',40),'reviewer','Synthetic SQL proof','sourceHash',repeat('d',64))));
 return result;
end $$;
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
