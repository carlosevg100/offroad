-- Closed control-plane commands. All synthetic rows and assertions roll back.
begin;
\ir support/execution_commands_fixture.sql
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_v1(gen_random_uuid(),contract::text,'{}') from execution_fixture$q$,'execution_profile_unavailable','unknown profile denied');
update private.platform_capability_releases set released=false where capability_key='synthetic-execution';
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}') from execution_fixture$q$,'execution_method_unavailable','publication is not release');
update private.platform_capability_releases set released=true where capability_key='synthetic-execution';
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',jsonb_set(contract,'{budget,maxCostMicrousd}','1')::text,'{}') from execution_fixture$q$,'execution_contract_denied','caller cannot increase budget');
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',jsonb_set(contract,'{method,executor,version}','"other"')::text,'{}') from execution_fixture$q$,'execution_contract_denied','caller cannot substitute executor');
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{"changed":true}') from execution_fixture$q$,'execution_contract_denied','snapshot bytes bound');
update execution_fixture set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
do $$ declare r jsonb;begin
 select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}') into r from execution_fixture;
 if not(r->>'replayed')::boolean or (select count(*) from public.work_executions)<>1 then raise exception 'request not idempotent';end if;
 raise notice 'PASS: identical request is one execution';
end $$;
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',jsonb_set(contract,'{purpose}','"Changed purpose"')::text,'{}') from execution_fixture$q$,'execution_request_conflict','request identity cannot carry new content');
-- Old worker versions cannot claim or use the new logical execution.
do $$ declare r jsonb;begin
 r:=private.worker_claim_job_v4('synthetic-policy-worker-fixture-token-v1',60);
 if (r->>'claimed')::boolean then raise exception 'legacy worker claimed new kind';end if;
 raise notice 'PASS: old claim excludes execution';
end $$;
update execution_fixture set claim=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(request->>'jobId')::uuid,60);
do $$ declare r jsonb;begin
 select private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(request->>'jobId')::uuid,60) into r from execution_fixture;
 if (r->>'claimed')::boolean then raise exception 'live lease was stolen';end if;
 raise notice 'PASS: active lease is not reclaimed';
end $$;
select pg_temp.expect_execution_command_error($q$select private.job_for_capability((request->>'jobId')::uuid,claim->>'capability') from execution_fixture$q$,'job_capability_invalid','legacy capability API denied');
select pg_temp.expect_execution_command_error($q$select private.reserve_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',gen_random_uuid(),gen_random_uuid(),repeat('a',64),'synthetic#calculate','test-v1','read_only',0,0) from execution_fixture$q$,'execution_lease_denied','wrong lease denied');
select pg_temp.expect_execution_command_error($q$select private.reserve_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,gen_random_uuid(),repeat('a',64),'external_search','test-v1','read_only',0,0) from execution_fixture$q$,'execution_operation_denied','undeclared search transmits nothing');
select private.reserve_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'a4171000-0000-4000-9000-000000000003',repeat('a',64),'synthetic#calculate','test-v1','read_only',0,0) from execution_fixture;
do $$ declare r jsonb;begin
 select private.reserve_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'a4171000-0000-4000-9000-000000000003',repeat('a',64),'synthetic#calculate','test-v1','read_only',0,0) into r from execution_fixture;
 if (r->>'mayExecute')::boolean or not(r->>'replayed')::boolean then raise exception 'operation replay authorized second execution';end if;
 raise notice 'PASS: replay does not authorize repeated execution';
end $$;
select pg_temp.expect_execution_command_error($q$select private.reserve_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'a4171000-0000-4000-9000-000000000003',repeat('b',64),'synthetic#calculate','test-v1','read_only',0,0) from execution_fixture$q$,'execution_operation_conflict','operation content conflict');
select private.settle_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'a4171000-0000-4000-9000-000000000003',repeat('a',64),encode(extensions.digest('{"calculation":"synthetic"}','sha256'),'hex'),0,0) from execution_fixture;
select private.settle_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'a4171000-0000-4000-9000-000000000003',repeat('a',64),encode(extensions.digest('{"calculation":"synthetic"}','sha256'),'hex'),0,0) from execution_fixture;
select pg_temp.expect_execution_command_error($q$select private.settle_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'a4171000-0000-4000-9000-000000000003',repeat('a',64),repeat('c',64),0,0) from execution_fixture$q$,'execution_settlement_conflict','settlement result immutable');
select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{"calculation":"synthetic"}','succeeded','calculated') from execution_fixture;
select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{"calculation":"synthetic"}','succeeded','calculated') from execution_fixture;
select pg_temp.expect_execution_command_error($q$select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{"changed":true}','succeeded','calculated') from execution_fixture$q$,'execution_result_conflict','result identity immutable');
select private.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000001');
select pg_temp.expect_execution_command_error($q$select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{"calculation":"synthetic"}','succeeded','calculated') from execution_fixture$q$,'execution_authority_denied','revocation denies receipt replay');
-- No direct role, RPC, API or storage opening accompanies these commands.
do $$ declare f record;r text;t text;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('request_work_execution_v1','claim_work_execution_v1','reserve_execution_operation_v1','settle_execution_operation_v1','commit_work_execution_result_v1') loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(r,f.signature,'EXECUTE') then raise exception 'command exposed: % %',r,f.signature;end if;
  end loop;
 end loop;
 foreach t in array array['execution_method_profiles','execution_control_bindings','execution_source_bindings','execution_basis_bindings','execution_budget_accounts','execution_operation_receipts','execution_result_receipts'] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(r,'private.'||t,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'storage exposed: % %',r,t;end if;
  end loop;
  if not exists(select 1 from pg_class where oid=('private.'||t)::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'RLS missing: %',t;end if;
 end loop;
 raise notice 'PASS: commands and storage remain closed';
end $$;
select 'execution_commands: PASS' result;
rollback;
