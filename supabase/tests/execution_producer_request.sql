-- Disposable synthetic proof: a tenant produces an execution only through the public producer, from a server-assembled basis, and reads it back while inputs stay current.
begin;
\ir support/contextual_adoption_setup.sql
\ir support/execution_method_fixture.sql
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('a11b0000-0000-4000-8000-000000000003','authenticated','authenticated','a11b-c@example.invalid','{}','{}',now(),now(),false,false);
insert into private.platform_principals(user_id,role,label) values('a11b0000-0000-4000-8000-000000000003','operator','Synthetic operator two');
create function pg_temp.expect_producer_error(command text,expected text,test_name text) returns void language plpgsql as $$
begin
 begin execute command;exception when others then
  if sqlerrm=expected then raise notice 'PASS: %',test_name;return;end if;raise;
 end;raise exception 'Missing expected rejection: %',test_name;
end $$;
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb);
create temporary table producer_fixture(basis jsonb,contract jsonb,request jsonb,claim jsonb);
grant select,insert,update on producer_fixture to authenticated;
-- 1. Without a producer grant nothing is assembled or requested, even by a participant of the work.
set local role authenticated;
select pg_temp.expect_producer_error($q$select public.execution_contract_basis_v1('a11b0000-0000-4000-9000-000000000002','a9990000-0000-4000-9000-000000000003','synthetic-execution')$q$,'execution_producer_denied','basis denied without a producer grant');
reset role;
select private.grant_execution_producer_v1('c4173000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001',true,'Synthetic producer grant','a11b0000-0000-4000-8000-000000000003');
-- 2. The basis carries identity, authority, policy, the released profile and the pins; the profile never comes from the client.
set local role authenticated;
insert into producer_fixture(basis) select public.execution_contract_basis_v1('a11b0000-0000-4000-9000-000000000002','a9990000-0000-4000-9000-000000000003','synthetic-execution');
reset role;
do $$declare b jsonb;h uuid;begin
 select basis into b from producer_fixture;
 select id into h from private.principals where organization_id='a11b0000-0000-4000-9000-000000000001' and user_id='a11b0000-0000-4000-8000-000000000001' and kind='human';
 if b->>'schemaVersion'<>'execution-contract-basis.v1' or b->>'organizationId'<>'a11b0000-0000-4000-9000-000000000001' or b->>'workId'<>'a11b0000-0000-4000-9000-000000000002'
 or b->>'principalId'<>h::text or b->>'authorityRevision' !~ '^[0-9]+$' or b->>'policyFingerprint' !~ '^[a-f0-9]{64}$' or b->>'versionId'<>'a9990000-0000-4000-9000-000000000003'
 or b#>>'{profile,id}'<>'a4171000-0000-4000-9000-000000000001' or jsonb_array_length(b->'adoptions')<>1 or jsonb_array_length(b->'hypotheses')<>0
 or b#>>'{envelope,fingerprint}'<>(select content_fingerprint from public.assumption_versions where id='a9990000-0000-4000-9000-000000000003')
 then raise exception 'basis incomplete: %',b;end if;
 if jsonb_array_length(b->'sources')+jsonb_array_length(b->'unverifiedSources')<>1 then raise exception 'basis does not account for the observation source: %',b;end if;
 raise notice 'PASS: basis assembled from persisted rows';
end $$;
set local role authenticated;
update producer_fixture set contract=jsonb_build_object('schemaVersion','execution-contract.v1','executionId','a4173000-0000-4000-9000-000000000002','organizationId',basis->>'organizationId','workId',basis->>'workId','principalId',basis->>'principalId',
 'requestId','a4173000-0000-4000-9000-000000000002','processingRunId','a4173000-0000-4000-9000-000000000002','purpose',basis->>'purpose','method',basis#>'{profile,method}','tools',basis#>'{profile,tools}','allowedEffects',basis#>'{profile,allowedEffects}',
 'audience',jsonb_build_object('kind','work_participants','workId',basis->>'workId','policyFingerprint',basis->>'policyFingerprint'),
 'policy',jsonb_build_object('version','execution-authority.v1','authorityRevision',basis->>'authorityRevision','fingerprint',basis->>'policyFingerprint'),
 'inputs',jsonb_build_object('snapshotId','a4173000-0000-4000-9000-000000000002','fingerprint',encode(extensions.digest('{}','sha256'),'hex'),'sources',basis->'sources','adoptions',basis->'adoptions','hypotheses',basis->'hypotheses'),
 'budget',jsonb_build_object('maxCostMicrousd',0,'maxModelCalls',0,'maxDurationMs',31000,'expiresAt',clock_timestamp()+interval '1 hour'),'requestedAt',clock_timestamp());
select pg_temp.expect_producer_error($q$select public.request_work_execution_v1(jsonb_set(contract,'{method,executor,version}','"other"')::text,'{}') from producer_fixture$q$,'execution_contract_denied','client cannot substitute the method');
select pg_temp.expect_producer_error($q$select public.request_work_execution_v1('not json','{}')$q$,'execution_contract_denied','malformed contract is refused');
update producer_fixture set request=public.request_work_execution_v1(contract::text,'{}');
do $$declare r jsonb;begin
 select public.request_work_execution_v1(contract::text,'{}') into r from producer_fixture;
 if not (r->>'replayed')::boolean then raise exception 'producer request not idempotent';end if;
 raise notice 'PASS: producer requested one execution through the public wrapper';
end $$;
reset role;
do $$begin
 if (select count(*) from public.work_executions)<>1 then raise exception 'replay created a second execution';end if;
 if not exists(select 1 from private.execution_control_bindings where execution_id='a4173000-0000-4000-9000-000000000002' and profile_id='a4171000-0000-4000-9000-000000000001') then raise exception 'profile not resolved on the server';end if;
 raise notice 'PASS: profile resolved on the server';
end $$;
set local role authenticated;
-- 3. Reading: the requester sees identity and state; another member without work access sees nothing.
do $$declare r jsonb;begin
 r:=public.read_work_execution_v1('a4173000-0000-4000-9000-000000000002');
 if r->>'executionId'<>'a4173000-0000-4000-9000-000000000002' or r#>>'{job,status}'<>'queued' or r->'result'<>'null'::jsonb or not (r->>'inputsCurrent')::boolean then raise exception 'read before execution wrong: %',r;end if;
 if r ? 'leaseId' or r->'job' ? 'leasedBy' or r->'job' ? 'leaseExpiresAt' or r->'job' ? 'capabilitySha256' or r->'job' ? 'payload' or r->'job' ? 'lastError' then raise exception 'reader leaks worker internals';end if;
 if jsonb_array_length(public.list_work_executions_v1('a11b0000-0000-4000-9000-000000000002'))<>1 then raise exception 'list incomplete';end if;
 raise notice 'PASS: requester reads identity and state';
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
select pg_temp.expect_producer_error($q$select public.read_work_execution_v1('a4173000-0000-4000-9000-000000000002')$q$,'execution_access_denied','member without work access cannot read');
select pg_temp.expect_producer_error($q$select public.list_work_executions_v1('a11b0000-0000-4000-9000-000000000002')$q$,'execution_access_denied','member without work access cannot list');
select pg_temp.expect_producer_error($q$select public.execution_contract_basis_v1('a11b0000-0000-4000-9000-000000000002','a9990000-0000-4000-9000-000000000003','synthetic-execution')$q$,'execution_access_denied','member without work access cannot assemble a basis');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
reset role;
-- 4. The worker settles and commits the pinned kernel; the requester then reads the exact bytes.
update producer_fixture set claim=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(request->>'jobId')::uuid,60);
select private.reserve_execution_operation_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'a4173000-0000-4000-9000-000000000002',repeat('a',64),'synthetic#calculate','test-v1','read_only',0,0) from producer_fixture;
select private.settle_execution_operation_v2((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'a4173000-0000-4000-9000-000000000002',repeat('a',64),'{"calculation":"synthetic"}','succeeded','calculated',0,0) from producer_fixture;
select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{"calculation":"synthetic"}','succeeded','calculated') from producer_fixture;
set local role authenticated;
do $$declare r jsonb;begin
 r:=public.read_work_execution_v1('a4173000-0000-4000-9000-000000000002');
 if r#>>'{job,status}'<>'succeeded' or r#>>'{result,outcome}'<>'succeeded' or r#>>'{result,canonicalResult}'<>'{"calculation":"synthetic"}' or r#>>'{operation,settledOutcome}'<>'succeeded' then raise exception 'read after commit wrong: %',r;end if;
 if (select item->>'outcome' from jsonb_array_elements(public.list_work_executions_v1('a11b0000-0000-4000-9000-000000000002')) item limit 1)<>'succeeded' then raise exception 'list missing the outcome';end if;
 raise notice 'PASS: requester reads the committed bytes';
end $$;
reset role;
-- 5. A revoked participant loses the result and then the execution itself.
select private.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,array['read','store'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('c',64));
set local role authenticated;
do $$declare r jsonb;begin
 r:=public.read_work_execution_v1('a4173000-0000-4000-9000-000000000002');
 if r#>>'{result,withheld}'<>'inputs_not_current' or r#>'{result,canonicalResult}' is not null or (r->>'inputsCurrent')::boolean then raise exception 'stale inputs still deliver bytes: %',r;end if;
 raise notice 'PASS: result withheld once inputs are no longer current';
end $$;
reset role;
select private.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.expect_producer_error($q$select public.read_work_execution_v1('a4173000-0000-4000-9000-000000000002')$q$,'execution_access_denied','revoked participant cannot read');
reset role;
-- 6. Two released profiles for one method make the basis ambiguous instead of picking one.
insert into private.execution_method_profiles(id,platform_release_id,serialization_version,canonical_payload,payload_fingerprint,adapter_source_commit,review_evidence)
select 'a4171000-0000-4000-9000-000000000005','synthetic-execution-test-v1','offroad-execution-json-utf16-v1',jsonb_set(payload,'{method,executor,version}','"test-v2"')::text,
 encode(extensions.digest(convert_to(jsonb_set(payload,'{method,executor,version}','"test-v2"')::text,'UTF8'),'sha256'),'hex'),repeat('c',40),review_evidence
from private.execution_method_profiles where id='a4171000-0000-4000-9000-000000000001';
select private.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000001','manage',null);
set local role authenticated;
select pg_temp.expect_producer_error($q$select public.execution_contract_basis_v1('a11b0000-0000-4000-9000-000000000002','a9990000-0000-4000-9000-000000000003','synthetic-execution')$q$,'execution_profile_ambiguous','two released profiles make the basis ambiguous');
reset role;
-- 7. Only the three public wrappers and their private twins are reachable by tenants.
do $$declare role_name text;sig text;begin
 foreach role_name in array array['anon','service_role'] loop
  foreach sig in array array['public.execution_contract_basis_v1(uuid,uuid,text)','public.request_work_execution_v1(text,text)','public.read_work_execution_v1(uuid)','public.list_work_executions_v1(uuid,uuid)'] loop
   if has_function_privilege(role_name,sig,'EXECUTE') then raise exception 'wrapper exposed to %: %',role_name,sig;end if;
  end loop;
 end loop;
 foreach sig in array array['private.execution_released_profile_v1(text)','private.execution_read_access_v1(uuid,uuid)','private.request_work_execution_v1(uuid,text,text)','private.request_work_execution_as_subject_v1(uuid,uuid,text,text)'] loop
  if has_function_privilege('authenticated',sig,'EXECUTE') then raise exception 'internal function exposed: %',sig;end if;
 end loop;
end $$;
select 'execution_producer_request: PASS' result;
rollback;
