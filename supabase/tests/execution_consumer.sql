-- Disposable synthetic proof. No producer/profile activation outside this rollback.
begin;
\ir support/execution_commands_fixture.sql
update execution_fixture set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
-- Right token with another active account cannot claim anything.
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
select pg_temp.expect_execution_command_error($q$select public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('a',64)])$q$,'worker_account_binding_required','worker token cannot be borrowed by another account');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id=auth.uid();
select pg_temp.expect_execution_command_error($q$select public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('a',64)])$q$,'worker_account_binding_required','suspended worker denied');
update auth.users set banned_until=null where id=auth.uid();
update private.worker_tokens set revoked_at=clock_timestamp() where execution_account_user_id=auth.uid();
select pg_temp.expect_execution_command_error($q$select public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('a',64)])$q$,'worker_account_binding_required','revoked credential denied');
update private.worker_tokens set revoked_at=null where execution_account_user_id=auth.uid();
do $$declare r jsonb;begin
 r:=public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('b',64)]);
 if r<>'{"claimed":false}'::jsonb then raise exception 'unavailable executor claimed';end if;
end $$;
update execution_fixture set claim=public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('a',64)]);
do $$begin if not(select (claim->>'claimed')::boolean from execution_fixture) then raise exception 'new queue did not claim';end if;end $$;
select pg_temp.expect_execution_command_error($q$select public.worker_commit_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{}','succeeded','calculated') from execution_fixture$q$,'execution_calculation_receipt_required','success requires a calculation receipt');
select public.worker_reserve_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) from execution_fixture;
select pg_temp.expect_execution_command_error($q$select public.worker_commit_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{}','succeeded','calculated') from execution_fixture$q$,'execution_partial_result_required','reservation is not a calculation');
select pg_temp.expect_execution_command_error($q$select private.reserve_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,gen_random_uuid(),claim->>'contractFingerprint','synthetic#calculate','test-v1','read_only',0,0) from execution_fixture$q$,'execution_operation_conflict','changing operation UUID cannot repeat kernel');
select pg_sleep(.03);
create temporary table consumer_renewal as select public.worker_renew_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) r from execution_fixture;
do $$begin
 if (select (r->>'elapsedDurationMs')::bigint from consumer_renewal)<20 or (select (r->>'remainingDurationMs')::bigint from consumer_renewal)>=31000 then raise exception 'renewal reset duration';end if;
 if (select r->>'principalId' from consumer_renewal) is distinct from (select contract->>'principalId' from execution_fixture) then raise exception 'renewal principal mismatched';end if;
end $$;
select public.worker_settle_execution_v2((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'{"calculation":"other"}','succeeded','calculated') from execution_fixture;
select pg_temp.expect_execution_command_error($q$select public.worker_commit_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{}','succeeded','calculated') from execution_fixture$q$,'execution_calculation_receipt_required','terminal bytes must match the settled kernel');
select private.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000001');
select pg_temp.expect_execution_command_error($q$select public.worker_renew_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) from execution_fixture$q$,'execution_authority_denied','heartbeat cannot renew revoked authority');
-- API grants are narrow; core methods, tables, and producer remain closed.
do $$declare n text;schema_name text;begin
 foreach n in array array['worker_claim_execution_v1','worker_renew_execution_v1','worker_reserve_execution_v1','worker_settle_execution_v2','worker_commit_execution_v1'] loop
  foreach schema_name in array array['public','private'] loop
   if exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname=schema_name and p.proname=n and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE') or not has_function_privilege('authenticated',p.oid,'EXECUTE'))) then raise exception 'consumer grant mismatch';end if;
  end loop;
 end loop;
 if has_function_privilege('authenticated','private.request_work_execution_v1(uuid,text,text)','EXECUTE') then raise exception 'producer exposed';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'worker_%execution_v1' and p.prosecdef) then raise exception 'public definer created';end if;
end $$;
select 'execution_consumer: PASS' result;
rollback;
