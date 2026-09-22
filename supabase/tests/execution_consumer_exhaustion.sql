begin;
\ir support/execution_commands_fixture.sql
update execution_fixture set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
update execution_fixture set claim=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(request->>'jobId')::uuid,1);
select public.worker_reserve_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) from execution_fixture;
update public.processing_jobs set max_attempts=attempts where execution_id=(select (request->>'executionId')::uuid from execution_fixture);
select pg_sleep(1.1);
-- Terminalization does not need to re-enable the human or fabricate a successful receipt.
select private.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000001');
select public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('a',64)]);
do $$begin
 if (select status from public.processing_jobs where execution_id=(select (request->>'executionId')::uuid from execution_fixture))<>'failed' then raise exception 'exhausted execution stranded';end if;
 if (select state from private.execution_operation_receipts)<>'uncertain' then raise exception 'unfinished operation lost';end if;
 if (select count(*) from private.execution_result_receipts)<>0 then raise exception 'terminal failure fabricated result';end if;
 if (select active_duration_ms from private.execution_budget_accounts)<1000 then raise exception 'terminal duration lost';end if;
end $$;
select pg_temp.expect_execution_command_error($q$select public.worker_renew_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) from execution_fixture$q$,'execution_authority_denied','failed exhausted job cannot revive delegation');
select 'execution_consumer_exhaustion: PASS' result;
rollback;
