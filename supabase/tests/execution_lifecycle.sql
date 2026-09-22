-- Synthetic lifecycle, deadlines and stale-attempt proof. Never production.
begin;
\ir support/execution_commands_fixture.sql
update execution_fixture set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
update execution_fixture set claim=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(request->>'jobId')::uuid,1);
create temporary table old_execution_claim as select claim from execution_fixture;
select private.reserve_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'a4171000-0000-4000-9000-000000000003',repeat('a',64),'synthetic#calculate','test-v1','read_only',0,0) from execution_fixture;
select pg_sleep(1.1);
select pg_temp.expect_execution_command_error($q$select private.settle_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'a4171000-0000-4000-9000-000000000003',repeat('a',64),repeat('b',64),0,0) from execution_fixture$q$,'execution_lease_denied','expired lease cannot settle');
update execution_fixture set claim=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(request->>'jobId')::uuid,60);
do $$ declare r jsonb;begin
 if (select claim->>'leaseId' from execution_fixture)=(select claim->>'leaseId' from old_execution_claim) then raise exception 'lease identity reused';end if;
 if (select active_duration_ms from private.execution_budget_accounts)<1000 then raise exception 'elapsed attempt time reset';end if;
 if (select state from private.execution_operation_receipts)<>'uncertain' then raise exception 'reservation was silently refunded';end if;
 select private.reserve_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'a4171000-0000-4000-9000-000000000003',repeat('a',64),'synthetic#calculate','test-v1','read_only',0,0) into r from execution_fixture;
 if (r->>'mayExecute')::boolean or r->>'state'<>'uncertain' then raise exception 'uncertain operation repeated';end if;
 raise notice 'PASS: new attempt retains duration and uncertain operation';
end $$;
select pg_temp.expect_execution_command_error($q$select private.commit_work_execution_result_v1((f.request->>'jobId')::uuid,o.claim->>'capability',(o.claim->>'leaseId')::uuid,o.claim->>'contractFingerprint',f.contract#>>'{inputs,fingerprint}','{}','succeeded','calculated') from execution_fixture f cross join old_execution_claim o$q$,'execution_lease_denied','old attempt cannot commit after reclaim');
select pg_temp.expect_execution_command_error($q$select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{}','succeeded','calculated') from execution_fixture$q$,'execution_partial_result_required','uncertain operation cannot become success');
select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{}','partial','operation_uncertain') from execution_fixture;
-- A fresh execution with a short published sub-budget expires without resetting on retry.
truncate execution_fixture;
insert into execution_fixture(contract) select pg_temp.execution_contract_fixture('a4171000-0000-4000-9000-000000000004',10);
update execution_fixture set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
update execution_fixture set claim=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(request->>'jobId')::uuid,60);
select pg_sleep(.03);
do $$ declare r jsonb;begin
 select private.reserve_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,gen_random_uuid(),repeat('a',64),'synthetic#calculate','test-v1','read_only',0,0) into r from execution_fixture;
 if r->>'state'<>'partial_budget_exhausted' or (r->>'mayExecute')::boolean then raise exception 'duration budget bypass';end if;
 raise notice 'PASS: durable duration budget blocks new operation';
end $$;
select pg_temp.expect_execution_command_error($q$select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{}','succeeded','calculated') from execution_fixture$q$,'execution_partial_result_required','exhaustion cannot become success');
select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{}','partial','budget_exhausted') from execution_fixture;
select private.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000001');
select private.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000001','manage',null);
select pg_temp.expect_execution_command_error($q$select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{}','partial','budget_exhausted') from execution_fixture$q$,'execution_authority_denied','regrant never revives an old execution');
select 'execution_lifecycle: PASS' result;
rollback;
