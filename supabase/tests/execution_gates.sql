-- Disposable synthetic proof: an execution request carries its professional gates. The v2 basis says which company the basis is about and whether it is registered and researched; the v2 producer refuses blocked, free-text and mismatched gates and stores one immutable receipt in the same transaction as the execution; the v2 reader returns it.
begin;
\ir support/contextual_adoption_setup.sql
\ir support/execution_method_fixture.sql
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('a11b0000-0000-4000-8000-000000000003','authenticated','authenticated','a11b-c@example.invalid','{}','{}',now(),now(),false,false);
insert into private.platform_principals(user_id,role,label) values
 ('a11b0000-0000-4000-8000-000000000001','founder','Synthetic founder'),
 ('a11b0000-0000-4000-8000-000000000003','operator','Synthetic operator two');
create function pg_temp.expect_gates_error(command text,expected text,test_name text) returns void language plpgsql as $$
begin
 begin execute command;exception when others then
  if sqlerrm=expected then raise notice 'PASS: %',test_name;return;end if;raise;
 end;raise exception 'Missing expected rejection: %',test_name;
end $$;
-- The company block of the v2 basis for a version of the fixture work, read as the synthetic human.
create function pg_temp.company(p_version uuid default 'a9990000-0000-4000-9000-000000000003') returns jsonb language sql as $$
 select public.execution_contract_basis_v2('a11b0000-0000-4000-9000-000000000002',p_version,'synthetic-execution')->'company';
$$;
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb);
-- The fixture organization has no founder member, so enabling its producer is the founder's act; the operator's pause path is proven in execution_producer_authority.sql.
select private.grant_execution_producer_v1('c4173000-0000-4000-9000-000000000021','a11b0000-0000-4000-9000-000000000001',true,'Synthetic producer grant by the founder','a11b0000-0000-4000-8000-000000000001');
-- The gates are the canonical text the TypeScript contract test pins byte for byte (execution-gates.test.ts).
create temporary table gates_fixture(basis jsonb,contract jsonb,gates text,request jsonb);
grant select,insert,update on gates_fixture to authenticated;
insert into gates_fixture(gates) values('{"blocked":false,"companyRegistration":"registered","conventions":[{"effective":"approved","key":"iof.rate","status":"approved","version":"2026.09.05-v9"},{"effective":"gap","key":"anbima.curve","status":null,"version":null}],"gatesVersion":"2026.09.24-v1","methodSelection":{"methodId":"synthetic-execution","methodVersion":"test-v1","selectionVersion":"2026.09.24-v1","situationIds":["refinancing","near-covenant"]},"research":"recorded","schemaVersion":"execution-gates.v1","voice":{"blockCount":0,"version":"2026.09.24-v1","warnCount":2}}');

-- 1. Registration. The fixture declares its adopted entity as the subject of the intake-session dossier under the work, with a reviewed CNPJ.
-- Withdrawn, the company is missing; declared again it is registered; without a current reviewed identifier it is missing again.
set local role authenticated;
select public.withdraw_dossier_entity_link_v1(l.id,'Synthetic withdrawal of the declared subject') from public.dossier_entity_links l
 where l.dossier_id=current_setting('test.adoption.dossier')::uuid and l.relationship='subject' and l.withdrawn_at is null;
do $$declare b1 jsonb;b2 jsonb;e uuid:=(current_setting('test.adoption.dimensions')::jsonb->>'entityId')::uuid;begin
 b1:=public.execution_contract_basis_v1('a11b0000-0000-4000-9000-000000000002','a9990000-0000-4000-9000-000000000003','synthetic-execution');
 b2:=public.execution_contract_basis_v2('a11b0000-0000-4000-9000-000000000002','a9990000-0000-4000-9000-000000000003','synthetic-execution');
 if b2->>'schemaVersion'<>'execution-contract-basis.v2' or b2-'company'-'schemaVersion'<>b1-'schemaVersion' then raise exception 'v2 basis changed the v1 object: %',b2;end if;
 if b2->'company'<>jsonb_build_object('entityId',e,'registration','missing','research','missing','researchAsOf',null) then raise exception 'company block wrong: %',b2->'company';end if;
 raise notice 'PASS: the v2 basis is the v1 object plus the company block, missing without a declared subject';
end $$;
select public.link_dossier_entity_v1(current_setting('test.adoption.dossier')::uuid,(current_setting('test.adoption.dimensions')::jsonb->>'entityId')::uuid,'subject','{"basis":"standalone"}','2020-01-01',null,'Synthetic renewed subject declaration','a4173000-0000-4000-9000-000000000041');
do $$begin
 if pg_temp.company()->>'registration'<>'registered' then raise exception 'declared subject not registered: %',pg_temp.company();end if;
 raise notice 'PASS: the adopted entity declared as subject of a dossier of the work, with a reviewed identifier, is registered';
end $$;
reset role;
update public.entity_identifiers set valid_until=now() where entity_id=(current_setting('test.adoption.dimensions')::jsonb->>'entityId')::uuid and review_state='reviewed' and valid_until is null;
set local role authenticated;
do $$begin
 if pg_temp.company()->>'registration'<>'missing' then raise exception 'subject without a current reviewed identifier registered: %',pg_temp.company();end if;
 raise notice 'PASS: a declared subject without a current reviewed identifier is missing';
end $$;
select public.review_dossier_identity_v1(current_setting('test.adoption.dossier')::uuid,(current_setting('test.adoption.dimensions')::jsonb->>'entityId')::uuid,'Synthetic adoption entity','BR:CNPJ','00000000000272','Synthetic renewed identity review');
do $$begin
 if pg_temp.company()->>'registration'<>'registered' then raise exception 'renewed identifier not registered: %',pg_temp.company();end if;
 raise notice 'PASS: a renewed reviewed identifier registers the company again';
end $$;
-- The legacy path: without the declaration, only a verified legacy company registers the work.
select public.withdraw_dossier_entity_link_v1(l.id,'Synthetic second withdrawal of the declared subject') from public.dossier_entity_links l
 where l.dossier_id=current_setting('test.adoption.dossier')::uuid and l.relationship='subject' and l.withdrawn_at is null;
reset role;
insert into public.companies(id,organization_id,legal_name,jurisdiction_code,created_by,verification_status)
values('a4173000-0000-4000-9000-000000000051','a11b0000-0000-4000-9000-000000000001','Synthetic legacy company','BR','a11b0000-0000-4000-8000-000000000001','pending');
update public.capital_projects set company_id='a4173000-0000-4000-9000-000000000051' where id='a11b0000-0000-4000-9000-000000000002';
set local role authenticated;
do $$begin
 if pg_temp.company()->>'registration'<>'missing' then raise exception 'unverified legacy company registered: %',pg_temp.company();end if;
 raise notice 'PASS: an unverified legacy company leaves the work missing';
end $$;
reset role;
update public.companies set verification_status='verified' where id='a4173000-0000-4000-9000-000000000051';
set local role authenticated;
do $$begin
 if pg_temp.company()->>'registration'<>'registered' then raise exception 'verified legacy company not registered: %',pg_temp.company();end if;
 raise notice 'PASS: a verified legacy company registers the work';
end $$;
reset role;

-- 2. Research: the runs recorded for the work's intake sessions. Abstained is research attempted without a usable source; a recorded run dates the research even when a later run abstained.
insert into public.public_research_runs(organization_id,intake_session_id,processing_run_id,status,query_fingerprint,plan,created_by,created_at)
values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000005','abstained',repeat('a',64),'[]','a11b0000-0000-4000-8000-000000000001',now()-interval '1 day');
set local role authenticated;
do $$begin
 if pg_temp.company()->>'research'<>'abstained' or (pg_temp.company()->>'researchAsOf')::timestamptz<>now()-interval '1 day' then raise exception 'abstained research wrong: %',pg_temp.company();end if;
 raise notice 'PASS: an abstained run is abstained research, dated';
end $$;
reset role;
insert into public.public_research_runs(organization_id,intake_session_id,processing_run_id,status,query_fingerprint,plan,created_by,created_at)
values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000005','succeeded',repeat('b',64),'[]','a11b0000-0000-4000-8000-000000000001',now()-interval '2 days');
set local role authenticated;
do $$begin
 if pg_temp.company()->>'research'<>'recorded' or (pg_temp.company()->>'researchAsOf')::timestamptz<>now()-interval '2 days' then raise exception 'recorded research wrong: %',pg_temp.company();end if;
 raise notice 'PASS: a succeeded run is recorded research, dated by that run';
end $$;

-- 3. The dominant entity: most pinned decisions win, and a tie goes to the smallest entity id.
do $$declare d uuid:=current_setting('test.adoption.dossier')::uuid;e1 uuid:=(current_setting('test.adoption.dimensions')::jsonb->>'entityId')::uuid;e2 uuid;dims jsonb;v2 uuid;v3 uuid;begin
 e2:=public.review_dossier_identity_v1(d,null,'Synthetic second entity','BR:CNPJ','00000000000353','Synthetic second identity review');
 dims:=current_setting('test.adoption.dimensions')::jsonb||jsonb_build_object('entityId',e2);
 v2:=public.propose_assumption_revision_v1(jsonb_build_object('requestId','a4173000-0000-4000-9000-000000000061','workId','a11b0000-0000-4000-9000-000000000002',
  'purpose','capital structure decision','contextKey','actual-2025','expectedVersionId','a9990000-0000-4000-9000-000000000003','reason','Synthetic hypothesis on a second entity',
  'fieldPath','financials.gross_debt','dimensions',dims,'value',jsonb_build_object('type','number','value','500'),'referenceObservationId',null));
 if (pg_temp.company(v2)->>'entityId')::uuid<>least(e1,e2) then raise exception 'tie not broken by the smallest entity id: %',pg_temp.company(v2);end if;
 v3:=public.propose_assumption_revision_v1(jsonb_build_object('requestId','a4173000-0000-4000-9000-000000000062','workId','a11b0000-0000-4000-9000-000000000002',
  'purpose','capital structure decision','contextKey','actual-2025','expectedVersionId',v2,'reason','Synthetic second hypothesis on the second entity',
  'fieldPath','financials.cash','dimensions',dims,'value',jsonb_build_object('type','number','value','50'),'referenceObservationId',null));
 if (pg_temp.company(v3)->>'entityId')::uuid<>e2 then raise exception 'majority entity not dominant: %',pg_temp.company(v3);end if;
 raise notice 'PASS: the dominant entity is the one most decisions pin, a tie going to the smallest id';
end $$;

-- 4. The contract comes from the v2 basis exactly as in 4A.
update gates_fixture set basis=public.execution_contract_basis_v2('a11b0000-0000-4000-9000-000000000002','a9990000-0000-4000-9000-000000000003','synthetic-execution');
update gates_fixture set contract=jsonb_build_object('schemaVersion','execution-contract.v1','executionId','a4173000-0000-4000-9000-000000000012','organizationId',basis->>'organizationId','workId',basis->>'workId','principalId',basis->>'principalId',
 'requestId','a4173000-0000-4000-9000-000000000012','processingRunId','a4173000-0000-4000-9000-000000000012','purpose',basis->>'purpose','method',basis#>'{profile,method}','tools',basis#>'{profile,tools}','allowedEffects',basis#>'{profile,allowedEffects}',
 'audience',jsonb_build_object('kind','work_participants','workId',basis->>'workId','policyFingerprint',basis->>'policyFingerprint'),
 'policy',jsonb_build_object('version','execution-authority.v1','authorityRevision',basis->>'authorityRevision','fingerprint',basis->>'policyFingerprint'),
 'inputs',jsonb_build_object('snapshotId','a4173000-0000-4000-9000-000000000012','fingerprint',encode(extensions.digest('{}','sha256'),'hex'),'sources',basis->'sources','adoptions',basis->'adoptions','hypotheses',basis->'hypotheses'),
 'budget',jsonb_build_object('maxCostMicrousd',0,'maxModelCalls',0,'maxDurationMs',31000,'expiresAt',clock_timestamp()+interval '1 hour'),'requestedAt',clock_timestamp());
do $$begin
 if (select (basis->'company')-'entityId'-'researchAsOf' from gates_fixture)<>'{"registration":"registered","research":"recorded"}'::jsonb then raise exception 'basis does not match the fixture gates';end if;
end $$;
-- (b) Blocked gates are refused before anything is requested.
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'"blocked":false','"blocked":true')) from gates_fixture$q$,'execution_gates_blocked','blocked gates are refused');
-- (c) The gates text is closed: no key outside the allowlist at any level, no free text in a value, no client fingerprint, only canonical bytes.
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'"research":','"note":"Synthetic free text","research":')) from gates_fixture$q$,'execution_gates_invalid','a free-text key at the top is refused');
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'{"methodId":','{"label":"Giro sazonal","methodId":')) from gates_fixture$q$,'execution_gates_invalid','a free-text key inside the method selection is refused');
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'"key":"iof.rate",','"key":"iof.rate","owner":"Synthetic owner",')) from gates_fixture$q$,'execution_gates_invalid','a free-text key inside a convention is refused');
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'"blockCount":0,','"blockCount":0,"message":"Synthetic finding",')) from gates_fixture$q$,'execution_gates_invalid','a free-text key inside the voice summary is refused');
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'"gatesVersion":"2026.09.24-v1"','"gatesVersion":"free text version"')) from gates_fixture$q$,'execution_gates_invalid','free text inside a version token is refused');
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'"gatesVersion":','"gatesFingerprint":"'||repeat('a',64)||'","gatesVersion":')) from gates_fixture$q$,'execution_gates_invalid','a client fingerprint is refused');
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'{"blocked":false,','{ "blocked": false, ')) from gates_fixture$q$,'execution_gates_invalid','noncanonical bytes are refused');
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'{"blocked":false,','{"blocked":true,"blocked":false,')) from gates_fixture$q$,'execution_gates_invalid','a duplicated key is refused');
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'"refinancing","near-covenant"','"refinancing","refinancing"')) from gates_fixture$q$,'execution_gates_invalid','a repeated situation is refused');
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}','not json') from gates_fixture$q$,'execution_gates_invalid','malformed gates are refused');
-- (d) Gates must be about this method, this basis version and the registration the server computes.
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'"methodId":"synthetic-execution"','"methodId":"prepare-capital-structure-decision"')) from gates_fixture$q$,'execution_gates_mismatch','gates for another method are refused');
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'"methodVersion":"test-v1"','"methodVersion":"test-v2"')) from gates_fixture$q$,'execution_gates_mismatch','gates for another method version are refused');
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(jsonb_set(contract,'{inputs,adoptions}','[]')::text,'{}',gates) from gates_fixture$q$,'execution_gates_mismatch','a contract that pins no basis version is refused');
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'"companyRegistration":"registered"','"companyRegistration":"missing"')) from gates_fixture$q$,'execution_gates_mismatch','a registration the server does not compute is refused');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',replace(gates,'"companyRegistration":"registered"','"companyRegistration":"missing"')) from gates_fixture$q$,'execution_access_denied','a member without work access learns nothing about the registration');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
reset role;
do $$begin
 if exists(select 1 from public.work_executions) or exists(select 1 from private.execution_gate_receipts) then raise exception 'a refused request left an execution or a receipt';end if;
 raise notice 'PASS: refused gates leave no execution and no receipt';
end $$;

-- 5. (e) One transaction: a receipt that cannot be written takes the execution with it; a valid request writes both.
create function pg_temp.refuse_gate_receipt() returns trigger language plpgsql as $$begin raise exception 'synthetic_receipt_failure';end $$;
create trigger zzz_refuse_gate_receipt before insert on private.execution_gate_receipts for each row execute function pg_temp.refuse_gate_receipt();
set local role authenticated;
select pg_temp.expect_gates_error($q$select public.request_work_execution_v2(contract::text,'{}',gates) from gates_fixture$q$,'synthetic_receipt_failure','a receipt failure takes the execution with it');
reset role;
drop trigger zzz_refuse_gate_receipt on private.execution_gate_receipts;
do $$begin if exists(select 1 from public.work_executions) then raise exception 'execution survived without its receipt';end if;end $$;
set local role authenticated;
update gates_fixture set request=public.request_work_execution_v2(contract::text,'{}',gates);
reset role;
do $$declare f gates_fixture;x private.execution_gate_receipts;begin
 select * into strict f from gates_fixture;
 select * into strict x from private.execution_gate_receipts;
 if f.request->>'executionId'<>'a4173000-0000-4000-9000-000000000012' or (f.request->>'replayed')::boolean then raise exception 'v2 request wrong: %',f.request;end if;
 if (select count(*) from public.work_executions)<>1 or x.organization_id<>'a11b0000-0000-4000-9000-000000000001' or x.execution_id<>'a4173000-0000-4000-9000-000000000012'
 or x.canonical_gates<>f.gates or x.gates_version<>'2026.09.24-v1' or x.blocked then raise exception 'receipt wrong: %',to_jsonb(x);end if;
 if x.gates_fingerprint<>encode(extensions.digest(convert_to(f.gates,'UTF8'),'sha256'),'hex') or x.gates_fingerprint<>'e5ee03da8c031f0188e84879540ece7dc9a476be077338b26ad86fd9e0602074'
 or f.request->>'gatesFingerprint'<>x.gates_fingerprint then raise exception 'fingerprint not the server-side SHA-256: %',to_jsonb(x);end if;
 raise notice 'PASS: one request writes the execution and its receipt, fingerprinted on the server';
end $$;
set local role authenticated;
do $$declare r1 jsonb;r2 jsonb;g text;begin
 select gates into strict g from gates_fixture;
 r1:=public.read_work_execution_v1('a4173000-0000-4000-9000-000000000012');
 r2:=public.read_work_execution_v2('a4173000-0000-4000-9000-000000000012');
 if r1->>'schemaVersion'<>'work-execution-read.v1' or r1->>'executionId'<>'a4173000-0000-4000-9000-000000000012' or r1 ? 'gates' then raise exception 'v1 read changed: %',r1;end if;
 if r2->>'schemaVersion'<>'work-execution-read.v2' or r2-'gates'-'schemaVersion'<>r1-'schemaVersion' then raise exception 'v2 read is not the v1 read plus gates: %',r2;end if;
 if r2#>>'{gates,gatesVersion}'<>'2026.09.24-v1' or (r2#>>'{gates,blocked}')::boolean or r2#>>'{gates,fingerprint}'<>'e5ee03da8c031f0188e84879540ece7dc9a476be077338b26ad86fd9e0602074'
 or r2#>'{gates,canonical}'<>g::jsonb or (r2#>>'{gates,createdAt}')::timestamptz is null then raise exception 'v2 read gates wrong: %',r2->'gates';end if;
 raise notice 'PASS: the v2 reader returns the receipt and the v1 reader still works';
end $$;

-- 6. (f) Retries: the same request with other bytes names the existing execution, and nothing writes a second receipt.
do $$declare d text;begin
 begin perform public.request_work_execution_v2(jsonb_set(contract,'{purpose}','"Changed purpose"')::text,'{}',gates) from gates_fixture;raise exception 'changed bytes under the same request id were accepted';
 exception when unique_violation then get stacked diagnostics d=pg_exception_detail;
  if sqlerrm<>'execution_request_conflict' or d<>'a4173000-0000-4000-9000-000000000012' then raise;end if;end;
 raise notice 'PASS: a conflicting retry names the execution the request already created';
end $$;
do $$declare r jsonb;begin
 select public.request_work_execution_v2(contract::text,'{}',gates) into strict r from gates_fixture;
 if not (r->>'replayed')::boolean or r->>'executionId'<>'a4173000-0000-4000-9000-000000000012' or r->>'gatesFingerprint'<>'e5ee03da8c031f0188e84879540ece7dc9a476be077338b26ad86fd9e0602074' then raise exception 'identical retry wrong: %',r;end if;
 raise notice 'PASS: an identical retry replays the execution with its receipt';
end $$;
do $$declare d text;begin
 begin perform public.request_work_execution_v2(contract::text,'{}',replace(gates,'"warnCount":2','"warnCount":3')) from gates_fixture;raise exception 'other gates under the same request were accepted';
 exception when unique_violation then get stacked diagnostics d=pg_exception_detail;
  if sqlerrm<>'execution_request_conflict' or d<>'a4173000-0000-4000-9000-000000000012' then raise;end if;end;
 raise notice 'PASS: other gates under the same request are a conflicting retry naming the execution';
end $$;
-- An execution requested through v1 reads without gates, and gates cannot be attached to it afterwards.
update gates_fixture set contract=contract||jsonb_build_object('executionId','a4173000-0000-4000-9000-000000000013','requestId','a4173000-0000-4000-9000-000000000013','processingRunId','a4173000-0000-4000-9000-000000000013')
 ||jsonb_build_object('inputs',(contract->'inputs')||jsonb_build_object('snapshotId','a4173000-0000-4000-9000-000000000013'));
select public.request_work_execution_v1(contract::text,'{}') from gates_fixture;
do $$declare d text;begin
 if public.read_work_execution_v2('a4173000-0000-4000-9000-000000000013')->'gates'<>'null'::jsonb then raise exception 'execution without gates reads a receipt';end if;
 begin perform public.request_work_execution_v2(contract::text,'{}',gates) from gates_fixture;raise exception 'gates attached to an execution requested without them';
 exception when unique_violation then get stacked diagnostics d=pg_exception_detail;
  if sqlerrm<>'execution_request_conflict' or d<>'a4173000-0000-4000-9000-000000000013' then raise;end if;end;
 raise notice 'PASS: an execution requested without gates reads gates null and cannot receive them later';
end $$;
reset role;
do $$begin
 if (select count(*) from private.execution_gate_receipts)<>1 or (select count(*) from public.work_executions)<>2 then raise exception 'retries wrote a second receipt or execution';end if;
 raise notice 'PASS: retries wrote no second receipt';
end $$;

-- 7. (g) A receipt is never updated, deleted or truncated, and its fingerprint and projection are its canonical text's.
select pg_temp.expect_gates_error($q$update private.execution_gate_receipts set blocked=true$q$,'contribution_revision_immutable','a receipt cannot be updated');
select pg_temp.expect_gates_error($q$delete from private.execution_gate_receipts$q$,'contribution_revision_immutable','a receipt cannot be deleted');
select pg_temp.expect_gates_error($q$truncate private.execution_gate_receipts$q$,'platform_ledger_immutable','receipts cannot be truncated');
do $$declare c text;g text;begin
 select gates into strict g from gates_fixture;
 begin
  insert into private.execution_gate_receipts(organization_id,execution_id,gates_version,canonical_gates,gates_fingerprint,blocked)
  values('a11b0000-0000-4000-9000-000000000001','a4173000-0000-4000-9000-000000000013','2026.09.24-v1',g,repeat('0',64),false);
  raise exception 'forged fingerprint accepted';
 exception when check_violation then get stacked diagnostics c=constraint_name;if c<>'execution_gate_receipts_fingerprint_check' then raise;end if;end;
 begin
  insert into private.execution_gate_receipts(organization_id,execution_id,gates_version,canonical_gates,gates_fingerprint,blocked)
  values('a11b0000-0000-4000-9000-000000000001','a4173000-0000-4000-9000-000000000013','2026.09.24-v2',g,encode(extensions.digest(convert_to(g,'UTF8'),'sha256'),'hex'),false);
  raise exception 'receipt projection diverging from its text accepted';
 exception when check_violation then get stacked diagnostics c=constraint_name;if c<>'execution_gate_receipts_projection_check' then raise;end if;end;
 raise notice 'PASS: a receipt fingerprint and projection are its canonical text''s or nothing';
end $$;

-- 8. (h) Only the three v2 wrappers and their private twins are reachable by tenants; nothing by anon or service_role.
set local role authenticated;
do $$begin
 begin perform count(*) from private.execution_gate_receipts;raise exception 'tenant read receipts directly';exception when insufficient_privilege then null;end;
 begin insert into private.execution_gate_receipts(organization_id,execution_id,gates_version,canonical_gates,gates_fingerprint,blocked) values(gen_random_uuid(),gen_random_uuid(),'v1','{}',repeat('0',64),false);raise exception 'tenant wrote a receipt directly';exception when insufficient_privilege then null;end;
 begin perform private.execution_gates_projection_v1('{}');raise exception 'tenant reached the gates projection';exception when insufficient_privilege then null;end;
 begin perform private.execution_company_basis_v1(gen_random_uuid(),gen_random_uuid(),'[]');raise exception 'tenant reached the company helper';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$declare role_name text;sig text;
 surface text[]:=array['public.execution_contract_basis_v2(uuid,uuid,text)','public.request_work_execution_v2(text,text,text)','public.read_work_execution_v2(uuid)',
  'private.execution_contract_basis_v2(uuid,uuid,text)','private.request_work_execution_producer_v2(text,text,text)','private.read_work_execution_v2(uuid)'];
begin
 foreach sig in array surface loop
  if not has_function_privilege('authenticated',sig,'EXECUTE') then raise exception 'tenant path not granted: %',sig;end if;
  foreach role_name in array array['anon','service_role'] loop
   if has_function_privilege(role_name,sig,'EXECUTE') then raise exception 'exposed to %: %',role_name,sig;end if;
  end loop;
 end loop;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  foreach sig in array array['private.execution_company_basis_v1(uuid,uuid,jsonb)','private.execution_gates_projection_v1(text)','private.execution_gates_canonical_text_v1(jsonb)'] loop
   if has_function_privilege(role_name,sig,'EXECUTE') then raise exception 'helper exposed to %: %',role_name,sig;end if;
  end loop;
  if has_table_privilege(role_name,'private.execution_gate_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'receipts exposed to %',role_name;end if;
 end loop;
 if not exists(select 1 from pg_class where oid='private.execution_gate_receipts'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'receipts without forced RLS';end if;
 raise notice 'PASS: only the three v2 wrappers and their private twins are reachable by tenants';
end $$;
select 'execution_gates: PASS' result;
rollback;
