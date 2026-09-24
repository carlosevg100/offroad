-- Disposable synthetic proof of the governed evaluation transport. All rows roll back; never production.
begin;
\ir support/governed_evaluation_fixture.sql
create temporary table evaluation_proof(n serial primary key,line text not null);
create temporary table evaluation_fixture(name text primary key,contract jsonb,request jsonb,claim jsonb);
create temporary table kernel_receipts_before as select count(*) receipts from private.execution_operation_receipts;
create function pg_temp.evaluation_pass(p_line text) returns void language plpgsql security definer set search_path='' as $$
begin insert into pg_temp.evaluation_proof(line) values('PASS: '||p_line);raise notice 'PASS: %',p_line;end $$;
create function pg_temp.expect_evaluation_error(command text,expected text,test_name text) returns void language plpgsql as $$
begin
 begin execute command;exception when others then
  if sqlerrm=expected then perform pg_temp.evaluation_pass(test_name);return;end if;raise;
 end;raise exception 'Missing expected rejection: %',test_name;
end $$;
create function pg_temp.reserve(p_name text,p_operation uuid,p_cost bigint,p_route jsonb default null) returns jsonb language sql as $$
 select pg_temp.as_worker();
 select private.worker_reserve_evaluation_operation_v1((f.claim->>'jobId')::uuid,f.claim->>'capability',(f.claim->>'leaseId')::uuid,p_operation,
  coalesce(p_route,pg_temp.evaluation_route()),'["inference"]'::jsonb,p_cost,1) from evaluation_fixture f where f.name=p_name;
$$;
create function pg_temp.settle(p_name text,p_operation uuid,p_outcome text,p_spent bigint,p_calls integer) returns jsonb language sql as $$
 select pg_temp.as_worker();
 select private.worker_settle_evaluation_operation_v1((f.claim->>'jobId')::uuid,f.claim->>'capability',(f.claim->>'leaseId')::uuid,p_operation,p_outcome,p_spent,p_calls)
 from evaluation_fixture f where f.name=p_name;
$$;
create function pg_temp.commit_evaluation(p_name text,p_result text,p_outcome text,p_reason text) returns jsonb language sql as $$
 select pg_temp.as_worker();
 select private.worker_commit_evaluation_v1((f.claim->>'jobId')::uuid,f.claim->>'capability',(f.claim->>'leaseId')::uuid,f.claim->>'contractFingerprint',
  encode(extensions.digest(convert_to(pg_temp.evaluation_snapshot(),'UTF8'),'sha256'),'hex'),p_result,p_outcome,p_reason) from evaluation_fixture f where f.name=p_name;
$$;
create function pg_temp.open_evaluation(p_name text,p_execution uuid,p_cost bigint default 1000,p_lease integer default 60,p_actor uuid default 'e5a10000-0000-4000-8000-000000000003') returns void language sql as $$
 insert into evaluation_fixture(name,contract) values(p_name,pg_temp.evaluation_contract(p_execution,p_cost));
 update evaluation_fixture set request=pg_temp.request_evaluation(contract,p_actor) where name=p_name;
 update evaluation_fixture set claim=pg_temp.claim_evaluation((request->>'jobId')::uuid,p_lease) where name=p_name;
$$;

-- 1. An evaluator requests and reads evaluations and nothing else; nobody else requests one.
select pg_temp.expect_evaluation_error($q$select pg_temp.request_evaluation(pg_temp.evaluation_contract('e5a10000-0000-4000-c000-000000000001'),'e5a10000-0000-4000-8000-000000000005')$q$,'platform_principal_required','a tenant human who is not an evaluator cannot request');
select pg_temp.expect_evaluation_error($q$select pg_temp.request_evaluation(pg_temp.evaluation_contract('e5a10000-0000-4000-c000-000000000001'),'e5a10000-0000-4000-8000-000000000002')$q$,'platform_principal_required','an operator who is not an evaluator cannot request');
select pg_temp.expect_evaluation_error($q$select pg_temp.request_evaluation(pg_temp.evaluation_contract('e5a10000-0000-4000-c000-000000000001'),'e5a10000-0000-4000-8000-000000000001')$q$,'platform_principal_required','the founder is not an evaluator either');
select pg_temp.expect_evaluation_error($q$select private.grant_execution_producer_v1('e5a10000-0000-4000-a000-000000000011','e5a10000-0000-4000-9000-000000000001',true,null,'e5a10000-0000-4000-8000-000000000003')$q$,'platform_principal_required','an evaluator cannot grant a producer');
select pg_temp.expect_evaluation_error($q$select private.release_platform_capability_v1('e5a10000-0000-4000-a000-000000000012','governed-evaluation-transport',false,'internal','e5a10000-0000-4000-8000-000000000003','Synthetic evaluator pause attempt')$q$,'platform_principal_required','an evaluator cannot pause a capability');
select pg_temp.expect_evaluation_error($q$select private.release_governed_evaluation_transport_v1('e5a10000-0000-4000-a000-000000000013',true,'e5a10000-0000-4000-8000-000000000003','Synthetic evaluator release attempt')$q$,'platform_principal_required','an evaluator cannot open the transport');
select pg_temp.expect_evaluation_error($q$select private.register_platform_evaluation_organization_v1('e5a10000-0000-4000-a000-000000000014','e5a10000-0000-4000-9000-000000000001',null,'e5a10000-0000-4000-8000-000000000003')$q$,'platform_principal_required','an evaluator cannot register an evaluation organization');
select pg_temp.expect_evaluation_error($q$select private.pause_receivables_release_v1('e5a10000-0000-4000-a000-000000000015','e5a10000-0000-4000-9000-000000000001',false,null,'e5a10000-0000-4000-8000-000000000003')$q$,'platform_principal_required','an evaluator cannot pause a release');
select set_config('offroad.actor_user_id','e5a10000-0000-4000-8000-000000000003',true);
select pg_temp.expect_evaluation_error($q$update private.platform_capability_releases set note=note where capability_key='governed-evaluation-transport'$q$,'platform_principal_required','an evaluator identity never enters an operator ledger');
select set_config('offroad.actor_user_id','',true);

-- 2. Evaluation organizations move only through the operator command, once, and ledgered.
select private.register_platform_evaluation_organization_v1('e5a10000-0000-4000-a000-000000000001','e5a10000-0000-4000-9000-000000000001','Synthetic evaluation workspace','e5a10000-0000-4000-8000-000000000002');
do $$begin
 if (select count(*) from private.platform_evaluation_organization_events where organization_id='e5a10000-0000-4000-9000-000000000001'
  and command_id='e5a10000-0000-4000-a000-000000000001' and actor_user_id='e5a10000-0000-4000-8000-000000000002')<>1
 or not exists(select 1 from private.platform_evaluation_organizations where organization_id='e5a10000-0000-4000-9000-000000000001' and registered_by_user_id='e5a10000-0000-4000-8000-000000000002')
 then raise exception 'registration not ledgered once with the acting operator';end if;
 if (select current_setting('offroad.actor_user_id',true))<>'' or (select current_setting('offroad.command_id',true))<>'' then raise exception 'command settings leaked';end if;
 perform pg_temp.evaluation_pass('an operator registers the founder''s workspace once; the replay adds no ledger row');
end $$;
select pg_temp.expect_evaluation_error($q$select private.register_platform_evaluation_organization_v1('e5a10000-0000-4000-a000-000000000001','e5a10000-0000-4000-9000-000000000001','Another note','e5a10000-0000-4000-8000-000000000002')$q$,'platform_method_request_reused','a registration command id cannot change its effect');
select pg_temp.expect_evaluation_error($q$select private.register_platform_evaluation_organization_v1('e5a10000-0000-4000-a000-000000000016','e5a10000-0000-4000-9000-000000000001',null,'e5a10000-0000-4000-8000-000000000002')$q$,'platform_evaluation_organization_registered','an organization is registered once');
select pg_temp.expect_evaluation_error($q$select private.register_platform_evaluation_organization_v1('e5a10000-0000-4000-a000-000000000017','e5a10000-0000-4000-9000-000000000002',null,'e5a10000-0000-4000-8000-000000000002')$q$,'platform_principal_required','an operator cannot register a client organization');
savepoint founder_registration;
select private.register_platform_evaluation_organization_v1('e5a10000-0000-4000-a000-000000000017','e5a10000-0000-4000-9000-000000000002','Synthetic client evaluations','e5a10000-0000-4000-8000-000000000001');
do $$begin
 if not exists(select 1 from private.platform_evaluation_organizations where organization_id='e5a10000-0000-4000-9000-000000000002' and registered_by_user_id='e5a10000-0000-4000-8000-000000000001') then raise exception 'founder registration ineffective';end if;
 perform pg_temp.evaluation_pass('only the founder registers an organization the founder does not belong to');
end $$;
rollback to savepoint founder_registration;
select pg_temp.expect_evaluation_error($q$insert into private.platform_evaluation_organizations(organization_id,registered_by_user_id) values('e5a10000-0000-4000-9000-000000000002','e5a10000-0000-4000-8000-000000000002')$q$,'platform_evaluation_organization_command_required','no registration outside the command');
select pg_temp.expect_evaluation_error($q$update private.platform_evaluation_organizations set note='Changed' where organization_id='e5a10000-0000-4000-9000-000000000001'$q$,'platform_ledger_immutable','a registration is immutable');
select pg_temp.expect_evaluation_error($q$delete from private.platform_evaluation_organizations where organization_id='e5a10000-0000-4000-9000-000000000001'$q$,'platform_ledger_immutable','a registration is never removed');
select pg_temp.expect_evaluation_error($q$delete from private.platform_evaluation_organization_events$q$,'contribution_revision_immutable','the registration ledger is immutable');
select pg_temp.expect_evaluation_error($q$truncate private.platform_evaluation_organization_events$q$,'platform_ledger_immutable','the registration ledger cannot be truncated');

-- 3. Requests are refused outside a registered evaluation organization and for any other shape.
select pg_temp.expect_evaluation_error($q$select pg_temp.request_evaluation(pg_temp.evaluation_contract('e5a10000-0000-4000-c000-000000000001',p_organization=>'e5a10000-0000-4000-9000-000000000002'))$q$,'evaluation_organization_required','a request outside a registered evaluation organization is refused');
do $$declare base jsonb:=pg_temp.evaluation_contract('e5a10000-0000-4000-c000-000000000001');bad jsonb;label text;begin
 for bad,label in select v.contract,v.label from (values
  (jsonb_set(base,'{inputs,sources}','[{"contentHash":"https://example.invalid/source.pdf"}]'),'a source given as a URL'),
  (jsonb_set(base,'{inputs,sources,0,url}','"https://example.invalid/source.pdf"'),'a source carrying a URL'),
  (jsonb_set(base,'{inputs,sources,0,text}','"Synthetic confidential text"'),'a source carrying text'),
  (jsonb_set(base,'{inputs,sources}','[{"text":"Synthetic confidential text"}]'),'a source given as text'),
  (jsonb_set(base,'{purpose}','"case_analysis"'),'another purpose'),
  (jsonb_set(base,'{audience,kind}','"work_participants"'),'another audience'),
  (base#-'{audience,scriptId}','an audience without its script'),
  (jsonb_set(base,'{tools}','[]'),'no tools'),
  (jsonb_set(base,'{tools,0,effect}','"propose_state"'),'a tool with a write effect'),
  (jsonb_set(base,'{tools,0,id}','"external_search"'),'a tool that is not a provider route'),
  (jsonb_set(base,'{budget,maxModelCalls}','0'),'zero model calls'),
  (jsonb_set(base,'{budget,maxDurationMs}','999'),'less than one second'),
  (jsonb_set(base,'{budget,maxCostMicrousd}','1.5'),'fractional microdollars'),
  (base#-'{budget,expiresAt}','a budget without expiry'),
  (jsonb_set(base,'{budget,expiresAt}',to_jsonb(clock_timestamp()-interval '1 minute')),'an expired budget'),
  (jsonb_set(base,'{inputs,fingerprint}',to_jsonb(repeat('0',64))),'a snapshot fingerprint that does not match'),
  (jsonb_set(base,'{executionId}','"not-a-uuid"'),'a malformed identity'),
  (base||'{"workId":"e5a10000-0000-4000-9000-000000000002"}'::jsonb,'an extra field')) v(contract,label)
 loop
  begin
   perform private.request_governed_evaluation_v1(bad::text,pg_temp.evaluation_snapshot(),'e5a10000-0000-4000-8000-000000000003');
   raise exception 'contract accepted: %',label;
  exception when insufficient_privilege then
   if sqlerrm<>'evaluation_contract_denied' then raise;end if;
  end;
  perform pg_temp.evaluation_pass('evaluation_contract_denied: '||label);
 end loop;
end $$;
select pg_temp.expect_evaluation_error($q$select private.request_governed_evaluation_v1(pg_temp.evaluation_contract('e5a10000-0000-4000-c000-000000000001')::text,'{"cases":[]}','e5a10000-0000-4000-8000-000000000003')$q$,'evaluation_contract_denied','snapshot bytes are bound to the contract fingerprint');
do $$begin
 if exists(select 1 from private.governed_evaluations where organization_id in ('e5a10000-0000-4000-9000-000000000001','e5a10000-0000-4000-9000-000000000002'))
 or exists(select 1 from public.processing_jobs where kind='governed_evaluation' and organization_id in ('e5a10000-0000-4000-9000-000000000001','e5a10000-0000-4000-9000-000000000002'))
 then raise exception 'a refused request left rows behind';end if;
 perform pg_temp.evaluation_pass('refused requests store nothing');
end $$;

-- 4. One request stores everything in one transaction; a replay adds nothing; new content conflicts.
insert into evaluation_fixture(name,contract) values('a',pg_temp.evaluation_contract('e5a10000-0000-4000-c000-00000000000a'));
update evaluation_fixture set request=pg_temp.request_evaluation(contract) where name='a';
do $$declare f record;r jsonb;ex uuid:='e5a10000-0000-4000-c000-00000000000a';begin
 select * into f from evaluation_fixture where name='a';
 if f.request->>'executionId'<>ex::text or f.request->>'processingRunId'<>ex::text or f.request->>'requestId'<>ex::text or (f.request->>'replayed')::boolean
 then raise exception 'request did not return its identities: %',f.request;end if;
 r:=pg_temp.request_evaluation(f.contract);
 if not (r->>'replayed')::boolean or r->>'executionId'<>ex::text or r->>'jobId'<>f.request->>'jobId' then raise exception 'request not idempotent: %',r;end if;
 if (select count(*) from private.governed_evaluations where id=ex)<>1
 or not exists(select 1 from private.governed_evaluations e where e.id=ex and e.contract_text=f.contract::text and e.snapshot_text=pg_temp.evaluation_snapshot()
  and e.requested_by_user_id='e5a10000-0000-4000-8000-000000000003' and e.organization_id='e5a10000-0000-4000-9000-000000000001')
 or not exists(select 1 from public.processing_jobs j where j.id=(f.request->>'jobId')::uuid and j.kind='governed_evaluation' and j.status='queued' and j.evaluation_id=ex
  and j.execution_id is null and j.work_id is null and j.intake_session_id is null and j.authorization_subject_id is null and j.authorization_resource_id is null)
 or not exists(select 1 from public.processing_runs r where r.id=ex and r.pipeline_version='governed-evaluation-v1' and r.created_by='e5a10000-0000-4000-8000-000000000003'
  and r.work_id is null and r.intake_session_id is null and r.budget=f.contract->'budget')
 or not exists(select 1 from private.evaluation_budget_accounts b where b.evaluation_id=ex and b.spent_microusd=0 and b.reserved_microusd=0 and b.exhausted_at is null)
 or (select count(*) from private.governed_evaluation_request_events x where x.evaluation_id=ex and x.actor_user_id='e5a10000-0000-4000-8000-000000000003'
  and x.contract_fingerprint=encode(extensions.digest(convert_to(f.contract::text,'UTF8'),'sha256'),'hex'))<>1
 then raise exception 'request did not store identity, bytes, account, job and ledger together';end if;
 perform pg_temp.evaluation_pass('one request stores identity, contract and snapshot bytes, budget account, job and request ledger; a replay adds nothing');
end $$;
select pg_temp.expect_evaluation_error($q$select pg_temp.request_evaluation(jsonb_set(contract,'{audience,caseVersion}','"v2"')) from evaluation_fixture where name='a'$q$,'execution_request_conflict','a request id cannot carry new content');
select pg_temp.expect_evaluation_error($q$update private.governed_evaluations set snapshot_text='{}' where id='e5a10000-0000-4000-c000-00000000000a'$q$,'contribution_revision_immutable','the evaluation identity and its bytes are immutable');

-- 5. The worker deployed today never receives an evaluation: its claims and capability API skip the kind.
update public.processing_jobs set available_at=now()-interval '10 years' where id=(select (request->>'jobId')::uuid from evaluation_fixture where name='a');
select pg_temp.as_worker();
do $$declare r jsonb;job uuid:=(select (request->>'jobId')::uuid from evaluation_fixture where name='a');name text;begin
 foreach name in array array['worker_claim_job','worker_claim_job_v2','worker_claim_job_v4'] loop
  execute format('select private.%I($1,60)',name) into r using 'synthetic-evaluation-worker-token-e5a10000';
  if r->>'job_id' is not distinct from job::text then raise exception 'legacy claim % returned an evaluation',name;end if;
 end loop;
 r:=public.worker_claim_job_v4('synthetic-evaluation-worker-token-e5a10000',60);
 if r->>'job_id' is not distinct from job::text then raise exception 'the deployed claim returned an evaluation';end if;
 r:=public.worker_claim_execution_v1('synthetic-evaluation-worker-token-e5a10000',array[repeat('a',64)]);
 if (r->>'claimed')::boolean then raise exception 'the execution claim returned a job';end if;
 if not exists(select 1 from public.processing_jobs where id=job and status='queued' and attempts=0 and capability_sha256 is null and leased_by is null)
 then raise exception 'an existing claim touched the evaluation';end if;
 perform pg_temp.evaluation_pass('existing claims leave even the oldest queued evaluation untouched');
end $$;

-- 6. The transport is closed until an operator opens it; the method release path never opens it.
-- Installed closed: until an operator acts on it, the switch has only its installation ledger row.
do $$begin
 if exists(select 1 from private.platform_capability_release_events where capability_key='governed-evaluation-transport' and operation<>'INSERT') then
  perform pg_temp.evaluation_pass('the transport switch changed after installation only through ledgered writes');
 elsif not exists(select 1 from private.platform_capability_releases where capability_key='governed-evaluation-transport' and not released and exposure='internal') then
  raise exception 'the transport switch was not installed closed';
 else
  perform pg_temp.evaluation_pass('the transport switch is installed closed');
 end if;
end $$;
-- A database where an operator already opened it is paused here, inside this rolled-back proof.
select private.release_platform_capability_v1('e5a10000-0000-4000-a000-000000000020','governed-evaluation-transport',false,'internal','e5a10000-0000-4000-8000-000000000002','Synthetic pause before the closed-switch proof');
do $$declare r jsonb:=pg_temp.poll_evaluation();begin
 if (r->>'claimed')::boolean then raise exception 'a closed transport handed out an evaluation';end if;
 perform pg_temp.evaluation_pass('the evaluation claim returns nothing while the switch is off');
end $$;
select pg_temp.expect_evaluation_error($q$select private.release_platform_capability_v1('e5a10000-0000-4000-a000-000000000021','governed-evaluation-transport',true,'internal','e5a10000-0000-4000-8000-000000000002','Synthetic release through the method path')$q$,'platform_method_reviews_required','the method release command cannot open the transport');
select private.release_governed_evaluation_transport_v1('e5a10000-0000-4000-a000-000000000022',true,'e5a10000-0000-4000-8000-000000000002','Synthetic release of the evaluation transport');
select private.release_governed_evaluation_transport_v1('e5a10000-0000-4000-a000-000000000022',true,'e5a10000-0000-4000-8000-000000000002','Synthetic release of the evaluation transport');
select pg_temp.expect_evaluation_error($q$select private.release_governed_evaluation_transport_v1('e5a10000-0000-4000-a000-000000000022',false,'e5a10000-0000-4000-8000-000000000002','Synthetic release of the evaluation transport')$q$,'platform_method_request_reused','a release command id cannot change its effect');
do $$begin
 if (select count(*) from private.platform_capability_release_events where command_id='e5a10000-0000-4000-a000-000000000022' and capability_key='governed-evaluation-transport'
  and released and actor_user_id='e5a10000-0000-4000-8000-000000000002' and operation='UPDATE')<>1 then raise exception 'transport release not ledgered once with the operator';end if;
 perform pg_temp.evaluation_pass('an operator opens the transport through its own command, ledgered once');
end $$;
update evaluation_fixture set claim=pg_temp.poll_evaluation() where name='a';
do $$declare f record;begin
 select * into f from evaluation_fixture where name='a';
 if not (f.claim->>'claimed')::boolean or f.claim->>'jobId'<>f.request->>'jobId' or f.claim->>'executionId'<>f.request->>'executionId'
 or f.claim->>'contractText'<>f.contract::text or f.claim->>'snapshotText'<>pg_temp.evaluation_snapshot()
 or f.claim->>'contractFingerprint'<>encode(extensions.digest(convert_to(f.contract::text,'UTF8'),'sha256'),'hex') or (f.claim->>'budgetExpired')::boolean
 then raise exception 'the released transport did not hand over the evaluation: %',f.claim;end if;
 perform pg_temp.evaluation_pass('once an operator releases it, the evaluation claim returns the job with its exact bytes');
end $$;
select pg_temp.expect_evaluation_error($q$select private.job_for_capability((claim->>'jobId')::uuid,claim->>'capability') from evaluation_fixture where name='a'$q$,'job_capability_invalid','the legacy capability API refuses an evaluation lease');
select pg_temp.expect_evaluation_error($q$select public.worker_authorize_provider_processing_v1((claim->>'jobId')::uuid,claim->>'capability',pg_temp.evaluation_route()-'toolVersion',array['inference'],'evaluation') from evaluation_fixture where name='a'$q$,'job_capability_invalid','the legacy provider authorization refuses an evaluation lease');

-- 7. Only a declared route at its declared version transmits; its decision is journaled first.
select pg_temp.expect_evaluation_error($q$select pg_temp.reserve('a','e5a10000-0000-4000-d000-00000000000a',100,jsonb_set(pg_temp.evaluation_route(),'{model}','"synthetic-undeclared-model"'))$q$,'execution_operation_denied','an undeclared route is denied at reserve');
select pg_temp.expect_evaluation_error($q$select pg_temp.reserve('a','e5a10000-0000-4000-d000-00000000000a',100,jsonb_set(pg_temp.evaluation_route(),'{toolVersion}','"synthetic-gateway.v2"'))$q$,'execution_operation_denied','a declared route at another version is denied at reserve');
do $$declare f record;begin
 select * into f from evaluation_fixture where name='a';
 if exists(select 1 from private.evaluation_operation_receipts where evaluation_id=(f.request->>'executionId')::uuid)
 or exists(select 1 from private.processing_eligibility_decisions where job_id=(f.claim->>'jobId')::uuid)
 or exists(select 1 from private.evaluation_budget_accounts where evaluation_id=(f.request->>'executionId')::uuid and (reserved_microusd<>0 or reserved_calls<>0))
 then raise exception 'an undeclared route reserved or journaled something';end if;
 perform pg_temp.evaluation_pass('an undeclared route reserves nothing');
end $$;
select pg_temp.reserve('a','e5a10000-0000-4000-d000-00000000000a',400);
do $$declare r jsonb;f record;d private.processing_eligibility_decisions;begin
 select * into f from evaluation_fixture where name='a';
 select * into strict d from private.processing_eligibility_decisions where job_id=(f.claim->>'jobId')::uuid;
 if not d.allowed or d.purpose<>'evaluation' or d.resources<>array['inference'] or d.route<>pg_temp.evaluation_route()-'toolVersion' or d.classification<>'restricted'
 then raise exception 'the reservation decision was not journaled for evaluation';end if;
 if not exists(select 1 from private.evaluation_operation_receipts where evaluation_id=(f.request->>'executionId')::uuid and operation_id='e5a10000-0000-4000-d000-00000000000a'
  and state='reserved' and decision_id=d.id and reserved_microusd=400 and reserved_calls=1 and tool_id='provider:openai:synthetic-evaluation-model' and tool_version='synthetic-gateway.v1')
 or not exists(select 1 from private.evaluation_budget_accounts where evaluation_id=(f.request->>'executionId')::uuid and reserved_microusd=400 and reserved_calls=1)
 then raise exception 'the reservation was not recorded';end if;
 r:=pg_temp.reserve('a','e5a10000-0000-4000-d000-00000000000a',400);
 if (r->>'mayExecute')::boolean or not (r->>'replayed')::boolean then raise exception 'a replayed reservation authorized a second send';end if;
 if (select count(*) from private.processing_eligibility_decisions where job_id=(f.claim->>'jobId')::uuid)<>1 then raise exception 'a replay journaled another decision';end if;
 perform pg_temp.evaluation_pass('a declared route is decided with purpose evaluation, journaled and reserved; a replay never sends twice');
end $$;
select pg_temp.expect_evaluation_error($q$select pg_temp.reserve('a','e5a10000-0000-4000-d000-00000000000a',500)$q$,'evaluation_operation_conflict','an operation cannot change its reservation');

-- 8. Success needs every receipt settled; the committed bytes carry the pinned execution fingerprint.
select pg_temp.expect_evaluation_error($q$select pg_temp.commit_evaluation('a','{"scores":{"synthetic-case":1}}','succeeded','evaluated')$q$,'evaluation_partial_result_required','success is refused while a receipt is unsettled');
select pg_temp.expect_evaluation_error($q$select pg_temp.settle('a','e5a10000-0000-4000-d000-00000000000a','settled',500,1)$q$,'evaluation_settlement_invalid','spend cannot exceed its reservation');
select pg_temp.settle('a','e5a10000-0000-4000-d000-00000000000a','settled',300,1);
select pg_temp.settle('a','e5a10000-0000-4000-d000-00000000000a','settled',300,1);
select pg_temp.expect_evaluation_error($q$select pg_temp.settle('a','e5a10000-0000-4000-d000-00000000000a','settled',200,1)$q$,'evaluation_settlement_conflict','a settlement is immutable');
select pg_temp.expect_evaluation_error($q$select pg_temp.commit_evaluation('a','{"scores":{"synthetic-case":1}}','partial','transport_denied')$q$,'evaluation_partial_result_required','a partial reason must be true');
select pg_temp.commit_evaluation('a','{"scores":{"synthetic-case":1}}','succeeded','evaluated');
select pg_temp.commit_evaluation('a','{"scores":{"synthetic-case":1}}','succeeded','evaluated');
select pg_temp.expect_evaluation_error($q$select pg_temp.commit_evaluation('a','{"scores":{"synthetic-case":0}}','succeeded','evaluated')$q$,'execution_result_conflict','a committed result is immutable');
do $$declare f record;begin
 select * into f from evaluation_fixture where name='a';
 if not exists(select 1 from private.evaluation_result_receipts r where r.evaluation_id=(f.request->>'executionId')::uuid and r.outcome='succeeded' and r.reason='evaluated'
  and r.canonical_result='{"scores":{"synthetic-case":1}}' and r.result_fingerprint=encode(extensions.digest(convert_to('{"scores":{"synthetic-case":1}}','UTF8'),'sha256'),'hex'))
 or not exists(select 1 from public.processing_jobs where id=(f.claim->>'jobId')::uuid and status='succeeded')
 or not exists(select 1 from public.processing_runs where id=(f.request->>'processingRunId')::uuid and status='succeeded' and (usage->>'costMicrousd')::bigint=300)
 or not exists(select 1 from private.evaluation_budget_accounts where evaluation_id=(f.request->>'executionId')::uuid and spent_microusd=300 and reserved_microusd=0 and spent_calls=1)
 then raise exception 'success was not published once with its receipt and spend';end if;
 perform pg_temp.evaluation_pass('a fully settled evaluation publishes success once; replay returns it and other bytes conflict');
end $$;

-- 9. The evaluator reads bytes, receipts and cost; nobody else reads an evaluation.
select set_config('request.jwt.claim.sub','',true);
do $$declare r jsonb;begin
 r:=private.read_governed_evaluation_v1('e5a10000-0000-4000-c000-00000000000a','e5a10000-0000-4000-8000-000000000003');
 if r->>'outcome'<>'succeeded' or r->>'reason'<>'evaluated' or r#>>'{result,canonicalResult}'<>'{"scores":{"synthetic-case":1}}'
 or r#>>'{result,resultFingerprint}'<>encode(extensions.digest(convert_to('{"scores":{"synthetic-case":1}}','UTF8'),'sha256'),'hex')
 or jsonb_array_length(r->'receipts')<>1 or r#>>'{receipts,0,state}'<>'settled' or (r#>>'{receipts,0,spentMicrousd}')::bigint<>300
 or (r->>'totalCostMicrousd')::bigint<>300 or (r#>>'{cost,spentCalls}')::bigint<>1 or r#>>'{state,job}'<>'succeeded' or r#>>'{state,run}'<>'succeeded'
 or jsonb_array_length(r->'decisions')<>2 or r#>>'{audience,scriptId}'<>'run-gold-baseline'
 then raise exception 'the evaluator read is incomplete: %',r;end if;
 perform pg_temp.evaluation_pass('the evaluator reads state, outcome, reason, result bytes, receipts, decisions and total cost');
end $$;
select pg_temp.expect_evaluation_error($q$select private.read_governed_evaluation_v1('e5a10000-0000-4000-c000-00000000000a','e5a10000-0000-4000-8000-000000000002')$q$,'platform_principal_required','an operator cannot read an evaluation');
select pg_temp.expect_evaluation_error($q$select private.read_governed_evaluation_v1('e5a10000-0000-4000-c000-00000000000a','e5a10000-0000-4000-8000-000000000005')$q$,'platform_principal_required','a tenant human cannot read an evaluation');
select set_config('request.jwt.claim.sub','e5a10000-0000-4000-8000-000000000005',true);
set local role authenticated;
select pg_temp.expect_evaluation_error($q$select public.read_work_execution_v1('e5a10000-0000-4000-c000-00000000000a')$q$,'execution_access_denied','a tenant reader gets execution_access_denied for an evaluation id');
do $$begin
 if exists(select 1 from public.processing_jobs where kind='governed_evaluation') or exists(select 1 from public.processing_runs where pipeline_version='governed-evaluation-v1')
 then raise exception 'a tenant sees an evaluation job or run';end if;
 begin perform private.request_governed_evaluation_v1('{}','{}','e5a10000-0000-4000-8000-000000000003');raise exception 'the API reached the request';
 exception when insufficient_privilege then if sqlerrm not like 'permission denied%' then raise;end if;end;
 begin perform private.read_governed_evaluation_v1('e5a10000-0000-4000-c000-00000000000a','e5a10000-0000-4000-8000-000000000003');raise exception 'the API reached the read';
 exception when insufficient_privilege then if sqlerrm not like 'permission denied%' then raise;end if;end;
 begin perform private.release_governed_evaluation_transport_v1(gen_random_uuid(),true,'e5a10000-0000-4000-8000-000000000002','Tenant release attempt');raise exception 'the API reached the switch';
 exception when insufficient_privilege then if sqlerrm not like 'permission denied%' then raise;end if;end;
 begin perform public.worker_claim_evaluation_v1('synthetic-evaluation-worker-token-e5a10000');raise exception 'a tenant claimed as the worker';
 exception when insufficient_privilege then if sqlerrm<>'worker_account_binding_required' then raise;end if;end;
 perform pg_temp.evaluation_pass('tenants see no evaluation job or run and reach no evaluation command');
end $$;
reset role;

-- 10. Unknown usage stays charged and turns success into operation_uncertain.
select pg_temp.open_evaluation('b','e5a10000-0000-4000-c000-00000000000b');
select pg_temp.reserve('b','e5a10000-0000-4000-d000-00000000000b',400);
select pg_temp.settle('b','e5a10000-0000-4000-d000-00000000000b','uncertain',null,null);
select pg_temp.expect_evaluation_error($q$select pg_temp.commit_evaluation('b','{"scores":{}}','succeeded','evaluated')$q$,'evaluation_partial_result_required','success is refused while a receipt is uncertain');
select pg_temp.commit_evaluation('b','{"scores":{}}','partial','operation_uncertain');
do $$begin
 if not exists(select 1 from private.evaluation_budget_accounts where evaluation_id='e5a10000-0000-4000-c000-00000000000b' and reserved_microusd=400 and spent_microusd=0)
 or not exists(select 1 from private.evaluation_result_receipts where evaluation_id='e5a10000-0000-4000-c000-00000000000b' and outcome='partial' and reason='operation_uncertain')
 then raise exception 'an uncertain send was released or published as success';end if;
 perform pg_temp.evaluation_pass('an uncertain send stays charged and the evaluation commits partial operation_uncertain');
end $$;

-- 11. An exhausted budget commits partial with budget_exhausted.
select pg_temp.open_evaluation('c','e5a10000-0000-4000-c000-00000000000c',500);
select pg_temp.reserve('c','e5a10000-0000-4000-d000-00000000000c',400);
select pg_temp.settle('c','e5a10000-0000-4000-d000-00000000000c','settled',400,1);
do $$declare r jsonb:=pg_temp.reserve('c','e5a10000-0000-4000-d000-0000000000c2',400);begin
 if (r->>'allowed')::boolean or r->>'state'<>'partial_budget_exhausted' or (r->>'mayExecute')::boolean then raise exception 'a send beyond the budget was reserved: %',r;end if;
 if exists(select 1 from private.evaluation_operation_receipts where operation_id='e5a10000-0000-4000-d000-0000000000c2')
 or not exists(select 1 from private.evaluation_budget_accounts where evaluation_id='e5a10000-0000-4000-c000-00000000000c' and exhausted_at is not null and reserved_microusd=0 and spent_microusd=400)
 or (select count(*) from private.processing_eligibility_decisions where job_id=(select (claim->>'jobId')::uuid from evaluation_fixture where name='c'))<>1
 then raise exception 'budget exhaustion reserved, journaled or was not recorded';end if;
 perform pg_temp.evaluation_pass('a send beyond the budget reserves nothing and marks the budget exhausted');
end $$;
select pg_temp.expect_evaluation_error($q$select pg_temp.commit_evaluation('c','{"scores":{}}','succeeded','evaluated')$q$,'evaluation_partial_result_required','an exhausted budget cannot publish success');
select pg_temp.expect_evaluation_error($q$select pg_temp.commit_evaluation('c','{"scores":{}}','partial','evaluation_failed')$q$,'evaluation_partial_result_required','an exhausted budget names its own reason');
select pg_temp.commit_evaluation('c','{"scores":{}}','partial','budget_exhausted');
do $$begin
 if not exists(select 1 from private.evaluation_result_receipts where evaluation_id='e5a10000-0000-4000-c000-00000000000c' and outcome='partial' and reason='budget_exhausted')
 then raise exception 'exhaustion not committed as partial';end if;
 perform pg_temp.evaluation_pass('an exhausted budget commits partial with budget_exhausted');
end $$;

-- 12. An expired lease cannot reserve or settle; the next lease keeps the unconfirmed send charged.
select pg_temp.open_evaluation('e','e5a10000-0000-4000-c000-00000000000e',1000,1);
select pg_temp.reserve('e','e5a10000-0000-4000-d000-00000000000e',400);
select pg_sleep(1.1);
select pg_temp.expect_evaluation_error($q$select pg_temp.reserve('e','e5a10000-0000-4000-d000-0000000000e2',100)$q$,'evaluation_lease_denied','an expired lease cannot reserve');
select pg_temp.expect_evaluation_error($q$select pg_temp.settle('e','e5a10000-0000-4000-d000-00000000000e','settled',300,1)$q$,'evaluation_lease_denied','an expired lease cannot settle');
create temporary table old_evaluation_claim as select claim from evaluation_fixture where name='e';
update evaluation_fixture set claim=pg_temp.claim_evaluation((request->>'jobId')::uuid,60) where name='e';
do $$begin
 if (select claim->>'leaseId' from evaluation_fixture where name='e')=(select claim->>'leaseId' from old_evaluation_claim)
 or (select state from private.evaluation_operation_receipts where operation_id='e5a10000-0000-4000-d000-00000000000e')<>'uncertain'
 or not exists(select 1 from private.evaluation_budget_accounts where evaluation_id='e5a10000-0000-4000-c000-00000000000e' and reserved_microusd=400 and active_duration_ms>=1000)
 then raise exception 'a reclaim released an unconfirmed send or reset elapsed time';end if;
 perform pg_temp.evaluation_pass('a new lease keeps the unconfirmed send charged as uncertain and the elapsed time');
end $$;
select pg_temp.expect_evaluation_error($q$select pg_temp.settle('e','e5a10000-0000-4000-d000-00000000000e','settled',300,1)$q$,'evaluation_operation_lease_denied','a send reserved under another lease is not settled by this one');

-- 13. A pause stops claims and sends at once; renewal still lets work already paid for land.
select pg_temp.open_evaluation('p','e5a10000-0000-4000-c000-00000000000f');
select private.release_platform_capability_v1('e5a10000-0000-4000-a000-000000000031','governed-evaluation-transport',false,'internal','e5a10000-0000-4000-8000-000000000002','Synthetic pause of the evaluation transport');
select pg_temp.expect_evaluation_error($q$select pg_temp.reserve('p','e5a10000-0000-4000-d000-00000000000f',400)$q$,'evaluation_transport_paused','a paused transport sends nothing');
insert into evaluation_fixture(name,contract) values('q',pg_temp.evaluation_contract('e5a10000-0000-4000-c000-000000000010'));
update evaluation_fixture set request=pg_temp.request_evaluation(contract) where name='q';
do $$declare r jsonb;f record;begin
 r:=pg_temp.poll_evaluation();
 if (r->>'claimed')::boolean then raise exception 'a paused transport handed out an evaluation';end if;
 select * into f from evaluation_fixture where name='p';
 perform pg_temp.as_worker();
 r:=private.worker_renew_evaluation_v1((f.claim->>'jobId')::uuid,f.claim->>'capability',(f.claim->>'leaseId')::uuid);
 if not (r->>'allowed')::boolean then raise exception 'a pause revoked the lease of work in flight';end if;
 perform pg_temp.evaluation_pass('a pause stops claims and sends at once, in the database, and in-flight leases still renew');
end $$;
select private.release_governed_evaluation_transport_v1('e5a10000-0000-4000-a000-000000000032',true,'e5a10000-0000-4000-8000-000000000002','Synthetic reopening of the evaluation transport');
select pg_temp.reserve('p','e5a10000-0000-4000-d000-00000000000f',400);
select pg_temp.settle('p','e5a10000-0000-4000-d000-00000000000f','settled',300,1);

-- 14. A route whose assurance is revoked after the claim is denied, journaled, and reserves nothing;
-- a send already reserved before the revocation cannot publish success afterwards.
select pg_temp.open_evaluation('d','e5a10000-0000-4000-c000-00000000000d');
select private.revoke_provider_processing_assurance_v1('e5a10000-0000-4000-b000-000000000001','Synthetic withdrawal between claim and reserve');
do $$declare r jsonb:=pg_temp.reserve('d','e5a10000-0000-4000-d000-00000000000d',400);d private.processing_eligibility_decisions;begin
 if (r->>'allowed')::boolean or r->>'decisionId' is null or (r->>'mayExecute')::boolean then raise exception 'a revoked route was allowed: %',r;end if;
 select * into strict d from private.processing_eligibility_decisions where id=(r->>'decisionId')::uuid;
 if d.allowed or d.purpose<>'evaluation' or d.reasons<>array['processing_resource_ineligible:inference'] or d.job_id<>(select (claim->>'jobId')::uuid from evaluation_fixture where name='d')
 or exists(select 1 from private.evaluation_operation_receipts where operation_id='e5a10000-0000-4000-d000-00000000000d')
 or not exists(select 1 from private.evaluation_budget_accounts where evaluation_id='e5a10000-0000-4000-c000-00000000000d' and reserved_microusd=0 and reserved_calls=0 and spent_microusd=0)
 then raise exception 'a revoked route was not journaled as denied with zero reservation';end if;
 perform pg_temp.evaluation_pass('a route whose assurance is revoked between claim and reserve is denied, journaled, and reserves nothing');
end $$;
select pg_temp.expect_evaluation_error($q$select pg_temp.commit_evaluation('d','{"scores":{}}','succeeded','evaluated')$q$,'evaluation_partial_result_required','a denied send cannot publish success');
select pg_temp.commit_evaluation('d','{"scores":{}}','partial','transport_denied');
select pg_temp.expect_evaluation_error($q$select pg_temp.commit_evaluation('p','{"scores":{"synthetic-case":1}}','succeeded','evaluated')$q$,'evaluation_partial_result_required','a send reserved before the revocation cannot publish success after it');
select pg_temp.commit_evaluation('p','{"scores":{"synthetic-case":1}}','partial','transport_denied');
do $$begin
 if (select count(*) from private.evaluation_result_receipts where evaluation_id in ('e5a10000-0000-4000-c000-00000000000d','e5a10000-0000-4000-c000-00000000000f') and outcome='partial' and reason='transport_denied')<>2
 or not exists(select 1 from private.processing_eligibility_decisions where job_id=(select (claim->>'jobId')::uuid from evaluation_fixture where name='p') and not allowed and purpose='evaluation')
 then raise exception 'a revoked route did not end in transport_denied';end if;
 perform pg_temp.evaluation_pass('publication revalidates every route used: a revoked assurance ends the evaluation partial with transport_denied');
end $$;

-- 15. A revoked evaluator stops its evaluations and can neither request nor read.
select pg_temp.open_evaluation('v','e5a10000-0000-4000-c000-000000000011',1000,60,'e5a10000-0000-4000-8000-000000000004');
update private.platform_principals set revoked_at=now(),revoked_reason='Synthetic evaluator revocation' where user_id='e5a10000-0000-4000-8000-000000000004';
select pg_temp.expect_evaluation_error($q$select pg_temp.reserve('v','e5a10000-0000-4000-d000-000000000011',100)$q$,'evaluation_authority_denied','a revoked evaluator''s evaluation sends nothing');
select pg_temp.expect_evaluation_error($q$select pg_temp.commit_evaluation('v','{"scores":{}}','partial','evaluation_failed')$q$,'evaluation_authority_denied','a revoked evaluator''s evaluation publishes nothing');
select pg_temp.expect_evaluation_error($q$select pg_temp.request_evaluation(pg_temp.evaluation_contract('e5a10000-0000-4000-c000-000000000012'),'e5a10000-0000-4000-8000-000000000004')$q$,'platform_principal_required','a revoked evaluator cannot request');
select pg_temp.expect_evaluation_error($q$select private.read_governed_evaluation_v1('e5a10000-0000-4000-c000-000000000011','e5a10000-0000-4000-8000-000000000004')$q$,'platform_principal_required','a revoked evaluator cannot read');

-- 16. Closed surfaces, an untouched kernel receipt index, and a boot contract the deployed worker still accepts.
do $$declare role_name text;f record;t text;
 worker_surface text[]:=array['worker_claim_evaluation_v1','worker_renew_evaluation_v1','worker_reserve_evaluation_operation_v1','worker_settle_evaluation_operation_v1','worker_commit_evaluation_v1'];begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.proname in ('require_platform_principal_v1','platform_principal_live_v1','platform_evaluator_live_v1','require_platform_evaluator_v1',
  'guard_platform_evaluation_organization_v1','ledger_platform_evaluation_organization_v1','register_platform_evaluation_organization_v1','guard_evaluation_operation_receipt_v1',
  'provider_processing_decision_v1','governed_evaluation_transport_released_v1','release_governed_evaluation_transport_v1','lock_governed_evaluation_v1','evaluation_for_lease_v1',
  'account_evaluation_duration_v1','close_exhausted_evaluations_v1','request_governed_evaluation_v1','claim_governed_evaluation_v1','read_governed_evaluation_v1',
  'worker_claim_evaluation_v1','worker_renew_evaluation_v1','worker_reserve_evaluation_operation_v1','worker_settle_evaluation_operation_v1','worker_commit_evaluation_v1')
 loop
  foreach role_name in array array['anon','service_role'] loop
   if has_function_privilege(role_name,f.signature,'EXECUTE') then raise exception 'command exposed to %: %',role_name,f.signature;end if;
  end loop;
  if has_function_privilege('authenticated',f.signature,'EXECUTE')<>(f.proname=any(worker_surface)) then raise exception 'authenticated surface differs from the pinned consumer: %',f.signature;end if;
 end loop;
 foreach t in array array['platform_evaluation_organizations','platform_evaluation_organization_events','governed_evaluations','governed_evaluation_request_events',
  'evaluation_budget_accounts','evaluation_operation_receipts','evaluation_result_receipts'] loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(role_name,'private.'||t,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'storage exposed to %: %',role_name,t;end if;
  end loop;
  if not exists(select 1 from pg_class where oid=('private.'||t)::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'RLS missing: %',t;end if;
 end loop;
 if (select count(*) from private.execution_operation_receipts)<>(select receipts from kernel_receipts_before) then raise exception 'the kernel receipt table changed';end if;
 perform pg_temp.evaluation_pass('evaluation commands and storage stay closed, the worker transport is granted like the pinned consumer, and no kernel receipt was written');
end $$;
set local role authenticated;
do $$declare contract jsonb:=public.worker_runtime_schema_contract_v1();begin
 if contract->>'schemaVersion'<>'document-worker-runtime.2026-09-08.execution-approval.v1'
 or not (contract->'capabilities' @> '["domain-event-outbox.v1","pinned-execution-consumer.v1","explicit-resource-access.v1","explicit-workspace-context.v1","authenticated-document-storage.v1","review-bound-execution.v1","legacy-storage-rotation.v1","integration-preview-workflow-continuity.v1","receivables-information-request-bindings.v1","receivables-complete-draft-refresh.v1","universal-dispatch-candidate-shadow.v1","explicit-execution-brief-approval.v1","execution-brief-proposal.v1","governed-sector-planning-context.v1","confirmed-receivables-evidence-scope.v1","confirmed-receivables-support-sheets.v1","document-work-product-request-binding.v1","documentary-execution-scope.v1","atomic-documentary-commit.v1","provider-resource-retention.v2"]'::jsonb)
 or not (contract->'capabilities' ? 'governed-evaluation-consumer.v1')
 then raise exception 'the boot contract would stop the deployed worker: %',contract;end if;
 perform pg_temp.evaluation_pass('the deployed worker boot contract is unchanged in version and a superset of its capabilities, now naming the evaluation consumer');
end $$;
reset role;
select 'governed_evaluation_transport: PASS' result;
rollback;
