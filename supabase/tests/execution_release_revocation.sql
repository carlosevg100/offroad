-- A claim never freezes availability of the published release. Rollback only.
begin;
\ir support/execution_commands_fixture.sql
update execution_fixture set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
update execution_fixture set claim=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(request->>'jobId')::uuid,60);
update private.platform_capability_releases set released=false where capability_key='synthetic-execution';
select pg_temp.expect_execution_command_error($q$select private.reserve_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,gen_random_uuid(),repeat('a',64),'synthetic#calculate','test-v1','read_only',0,0) from execution_fixture$q$,'execution_method_unavailable','withdrawn release denies reservation after claim');
select pg_temp.expect_execution_command_error($q$select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{}','succeeded','calculated') from execution_fixture$q$,'execution_method_unavailable','withdrawn release denies commit after claim');
update private.platform_capability_releases set released=true,method_version='replacement-v2' where capability_key='synthetic-execution';
select pg_temp.expect_execution_command_error($q$select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{}','succeeded','calculated') from execution_fixture$q$,'execution_method_unavailable','replacement release cannot run a pinned old method');
select 'execution_release_revocation: PASS' result;
rollback;
