-- Permission expiry inside a long transaction must block the eventual commit.
begin;
\ir support/execution_commands_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select private.set_information_barrier_v1(null,'a11b0000-0000-4000-9000-000000000002','Synthetic expiring authority',
 jsonb_build_array(jsonb_build_object('userId','a11b0000-0000-4000-8000-000000000001','effect','allow','expiresAt',clock_timestamp()+interval '1 second')));
-- Barrier command may invalidate a previous pin; construct the request afterwards.
update execution_fixture set contract=pg_temp.execution_contract_fixture('a4171000-0000-4000-9000-000000000002');
update execution_fixture set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
update execution_fixture set claim=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(request->>'jobId')::uuid,60);
select pg_sleep(1.1);
select pg_temp.expect_execution_command_error($q$select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{}','succeeded','calculated') from execution_fixture$q$,'execution_authority_denied','expired barrier permission denies commit within same transaction');
select 'execution_policy_expiry: PASS' result;
rollback;
