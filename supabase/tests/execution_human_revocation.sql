-- Functional negatives in a rollback transaction; real intersession races live in the CI harness.
begin;
\ir support/execution_commands_fixture.sql
select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}') from execution_fixture;
insert into auth.users(id,email) values('a417c000-0000-4000-8000-000000000003','synthetic-distinct-worker@example.invalid');
update private.worker_tokens set execution_account_user_id='a417c000-0000-4000-8000-000000000003'
 where token_sha256=extensions.digest('synthetic-policy-worker-fixture-token-v1','sha256');
select set_config('request.jwt.claim.sub','a417c000-0000-4000-8000-000000000003',true);
do $$
declare job uuid; c jsonb; command text; denied boolean;
begin
 select id into strict job from public.processing_jobs where execution_id='a4171000-0000-4000-9000-000000000002';
 c:=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',job,60);
 if not (c->>'claimed')::boolean then raise exception 'distinct worker did not claim'; end if;
 perform private.worker_reserve_execution_v1(job,c->>'capability',(c->>'leaseId')::uuid);
 perform private.worker_settle_execution_v2(job,c->>'capability',(c->>'leaseId')::uuid,'{}','succeeded','calculated');
 foreach command in array array[
  'update auth.users set banned_until=clock_timestamp()+interval ''1 hour'' where id=''a11b0000-0000-4000-8000-000000000001''',
  'update auth.users set deleted_at=clock_timestamp() where id=''a11b0000-0000-4000-8000-000000000001'''
 ] loop
  execute command;
  denied:=false;
  begin
   perform private.commit_work_execution_result_v1(job,c->>'capability',(c->>'leaseId')::uuid,c->>'contractFingerprint',
    (c->>'contractText')::jsonb#>>'{inputs,fingerprint}','{}','succeeded','calculated');
  exception when insufficient_privilege then denied:=sqlerrm='execution_authority_denied'; end;
  if not denied then raise exception 'human revocation did not deny result'; end if;
  if exists(select 1 from private.execution_result_receipts where execution_id='a4171000-0000-4000-9000-000000000002') then
   raise exception 'revoked result was recorded'; end if;
  update auth.users set banned_until=null,deleted_at=null where id='a11b0000-0000-4000-8000-000000000001';
 end loop;
end $$;
select 'execution_human_revocation_passed' as result;
rollback;
