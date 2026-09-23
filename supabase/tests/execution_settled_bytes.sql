-- Disposable synthetic proof: settled bytes survive a lost lease, publish under the next lease with
-- their settled outcome, and a hash-only or partial settlement never becomes a later success.
begin;
\ir support/execution_commands_fixture.sql
update execution_fixture set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
update execution_fixture set claim=public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('a',64)]);
do $$begin if not(select (claim->>'claimed')::boolean from execution_fixture) then raise exception 'first claim failed';end if;end $$;
-- Nothing is available before a settlement.
do $$declare r jsonb;begin
 select public.worker_settled_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) into r from execution_fixture;
 if r is distinct from '{"available":false}'::jsonb then raise exception 'settled bytes reported before settlement';end if;
end $$;
select public.worker_reserve_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) from execution_fixture;
-- Outcome and reason must agree; bytes that are not a JSON projection are refused before any settlement.
select pg_temp.expect_execution_command_error($q$select public.worker_settle_execution_v2((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'{"calculation":"synthetic"}','succeeded','calculation_failed') from execution_fixture$q$,'execution_settlement_invalid','success with a failure reason refused');
select pg_temp.expect_execution_command_error($q$select public.worker_settle_execution_v2((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'not json','succeeded','calculated') from execution_fixture$q$,'invalid input syntax for type json','non JSON bytes refused');
select public.worker_settle_execution_v2((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'{"calculation":"synthetic"}','succeeded','calculated') from execution_fixture;
-- The same lease replays identical bytes and conflicts on different bytes or a different outcome.
do $$declare r jsonb;begin
 select public.worker_settle_execution_v2((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'{"calculation":"synthetic"}','succeeded','calculated') into r from execution_fixture;
 if r is distinct from '{"settled":true,"replayed":true}'::jsonb then raise exception 'identical bytes did not replay';end if;
end $$;
select pg_temp.expect_execution_command_error($q$select public.worker_settle_execution_v2((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'{"calculation":"other"}','succeeded','calculated') from execution_fixture$q$,'execution_settlement_conflict','conflicting settlement refused');
select pg_temp.expect_execution_command_error($q$select public.worker_settle_execution_v2((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'{"calculation":"synthetic"}','partial','budget_exhausted') from execution_fixture$q$,'execution_settlement_conflict','conflicting outcome refused');
-- The stored bytes carry the settled hash and outcome.
do $$begin
 if not exists(select 1 from private.execution_operation_receipts o join execution_fixture f on true
  where o.execution_id=(f.request->>'executionId')::uuid and o.state='settled' and o.canonical_result='{"calculation":"synthetic"}' and o.settled_outcome='succeeded' and o.settled_reason='calculated'
  and o.result_fingerprint=encode(extensions.digest(convert_to(o.canonical_result,'UTF8'),'sha256'),'hex'))
 then raise exception 'settled bytes not stored with their hash and outcome';end if;
end $$;
-- The lease is lost before publication; the next claim is a new lease of the same execution.
create temporary table first_lease as select (claim->>'leaseId')::uuid lease from execution_fixture;
update public.processing_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=(select (request->>'jobId')::uuid from execution_fixture);
update execution_fixture set claim=public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('a',64)]);
do $$begin
 if not(select (claim->>'claimed')::boolean from execution_fixture) then raise exception 'second claim failed';end if;
 if (select (claim->>'leaseId')::uuid from execution_fixture)=(select lease from first_lease) then raise exception 'lease was not renewed';end if;
end $$;
-- The old lease can neither settle nor read; the reservation replays as settled for the new lease.
select pg_temp.expect_execution_command_error($q$select public.worker_settle_execution_v2((request->>'jobId')::uuid,claim->>'capability',(select lease from first_lease),'{"calculation":"synthetic"}','succeeded','calculated') from execution_fixture$q$,'execution_lease_denied','old lease cannot settle');
select pg_temp.expect_execution_command_error($q$select public.worker_settled_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(select lease from first_lease)) from execution_fixture$q$,'execution_lease_denied','old lease cannot read settled bytes');
do $$declare r jsonb;begin
 select public.worker_reserve_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) into r from execution_fixture;
 if r->>'state' is distinct from 'settled' or (r->>'replayed')::boolean is not true or (r->>'mayExecute')::boolean is not false then raise exception 'reservation did not replay as settled: %',r;end if;
 select public.worker_settled_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) into r from execution_fixture;
 if (r->>'available')::boolean is not true or r->>'resultText' is distinct from '{"calculation":"synthetic"}' or r->>'outcome' is distinct from 'succeeded' or r->>'reason' is distinct from 'calculated'
 or r->>'resultHash' is distinct from encode(extensions.digest(convert_to('{"calculation":"synthetic"}','UTF8'),'sha256'),'hex')
 or (r->>'settledByLease')::uuid is distinct from (select lease from first_lease) then raise exception 'settled bytes unavailable to the new lease: %',r;end if;
end $$;
-- Bytes that differ from the settlement cannot be published as success under the new lease.
select pg_temp.expect_execution_command_error($q$select public.worker_commit_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{"calculation":"other"}','succeeded','calculated') from execution_fixture$q$,'execution_calculation_receipt_required','foreign bytes refused');
-- The exact settled bytes publish under the new lease and the receipt records both leases.
do $$declare r jsonb;begin
 select public.worker_commit_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{"calculation":"synthetic"}','succeeded','calculated') into r from execution_fixture;
 if r->>'outcome' is distinct from 'succeeded' or (r->>'replayed')::boolean is not false then raise exception 'settled result not published: %',r;end if;
 if not exists(select 1 from private.execution_result_receipts x join execution_fixture f on true
  where x.execution_id=(f.request->>'executionId')::uuid and x.outcome='succeeded' and x.canonical_result='{"calculation":"synthetic"}'
  and x.lease_id=(f.claim->>'leaseId')::uuid and x.settlement_lease_id=(select lease from first_lease))
 then raise exception 'result receipt does not record settlement and publication leases';end if;
end $$;
-- A partial marker settled by one lease keeps its outcome under the next lease; it never becomes success.
create temporary table execution_b(contract jsonb,request jsonb,claim jsonb);
insert into execution_b(contract) select pg_temp.execution_contract_fixture('a4171000-0000-4000-9000-000000000005');
update execution_b set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
update execution_b set claim=public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('a',64)]);
do $$begin if (select claim->>'executionId' from execution_b) is distinct from (select request->>'executionId' from execution_b) then raise exception 'second execution not claimed';end if;end $$;
select public.worker_reserve_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) from execution_b;
select public.worker_settle_execution_v2((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'{"reason":"calculation_failed","status":"partial"}','partial','calculation_failed') from execution_b;
update public.processing_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=(select (request->>'jobId')::uuid from execution_b);
update execution_b set claim=public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('a',64)]);
do $$declare r jsonb;begin
 select public.worker_settled_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) into r from execution_b;
 if (r->>'available')::boolean is not true or r->>'outcome' is distinct from 'partial' or r->>'reason' is distinct from 'calculation_failed' then raise exception 'partial settlement not reported as partial: %',r;end if;
end $$;
select pg_temp.expect_execution_command_error($q$select public.worker_commit_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{"reason":"calculation_failed","status":"partial"}','succeeded','calculated') from execution_b$q$,'execution_calculation_receipt_required','partial marker cannot become success');
do $$declare r jsonb;begin
 select public.worker_commit_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{"reason":"calculation_failed","status":"partial"}','partial','calculation_failed') into r from execution_b;
 if r->>'outcome' is distinct from 'partial' then raise exception 'partial marker not republished as partial: %',r;end if;
end $$;
-- A hash-only settlement (v1) of a lost lease never publishes as success under the next lease.
create temporary table execution_c(contract jsonb,request jsonb,claim jsonb);
insert into execution_c(contract) select pg_temp.execution_contract_fixture('a4171000-0000-4000-9000-000000000006');
update execution_c set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
update execution_c set claim=public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('a',64)]);
do $$begin if (select claim->>'executionId' from execution_c) is distinct from (select request->>'executionId' from execution_c) then raise exception 'third execution not claimed';end if;end $$;
select public.worker_reserve_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) from execution_c;
select public.worker_settle_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,encode(extensions.digest(convert_to('{"calculation":"synthetic"}','UTF8'),'sha256'),'hex')) from execution_c;
update public.processing_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=(select (request->>'jobId')::uuid from execution_c);
update execution_c set claim=public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('a',64)]);
do $$declare r jsonb;begin
 select public.worker_settled_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) into r from execution_c;
 if r is distinct from '{"available":false}'::jsonb then raise exception 'hash-only settlement reported bytes: %',r;end if;
end $$;
select pg_temp.expect_execution_command_error($q$select public.worker_commit_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{"calculation":"synthetic"}','succeeded','calculated') from execution_c$q$,'execution_calculation_receipt_required','hash of another lease cannot publish');
do $$declare r jsonb;begin
 select public.worker_commit_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{"reason":"operation_uncertain","status":"partial"}','partial','operation_uncertain') into r from execution_c;
 if r->>'outcome' is distinct from 'partial' then raise exception 'uncertain operation not closed as partial: %',r;end if;
end $$;
-- API grants are as narrow as the v1 wrappers; core functions stay closed.
do $$declare n text;schema_name text;begin
 foreach n in array array['worker_settle_execution_v2','worker_settled_execution_result_v1'] loop
  foreach schema_name in array array['public','private'] loop
   if exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname=schema_name and p.proname=n and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE') or not has_function_privilege('authenticated',p.oid,'EXECUTE')))
   then raise exception 'grant drift on %.%',schema_name,n;end if;
  end loop;
 end loop;
 if has_function_privilege('authenticated','private.settle_execution_operation_v2(uuid,text,uuid,uuid,text,text,text,text,bigint,bigint)','EXECUTE')
 or has_function_privilege('authenticated','private.execution_settled_result_v1(uuid,text,uuid)','EXECUTE') then raise exception 'core settlement exposed';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('worker_settle_execution_v2','worker_settled_execution_result_v1') and p.prosecdef) then raise exception 'public definer created';end if;
end $$;
select 'execution_settled_bytes: PASS' result;
rollback;
