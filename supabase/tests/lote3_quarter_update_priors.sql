-- The quarter close (C54) reads its priors as completed executions of the same work. The verdicts refuse
-- each failure by name; the resolver reaches the stored rows and the normal rights machinery; the v3
-- producer is the only door and only for the quarter close; the provenance walk is unchanged for every
-- other method. Synthetic and rolled back.
begin;
\ir support/execution_commands_fixture.sql

-- 1. Identity verdicts over row data: another organization and another work are not found (no
-- existence is disclosed outside this work); an execution without a succeeded result is refused by name.
do $$
declare o uuid:='a11b0000-0000-4000-9000-000000000001';w uuid:='a11b0000-0000-4000-9000-000000000002';x uuid:='a11b0000-0000-4000-9000-0000000000ff';
begin
 if private.quarter_update_prior_identity_v1(o,w,true,o,w,'succeeded') is not null then raise exception 'a succeeded prior of the same work refused';end if;
 if private.quarter_update_prior_identity_v1(o,w,false,null,null,null) is distinct from 'quarter_update_prior_not_found' then raise exception 'missing prior not refused';end if;
 if private.quarter_update_prior_identity_v1(o,w,true,x,w,'succeeded') is distinct from 'quarter_update_prior_not_found' then raise exception 'cross organization prior not refused as not found';end if;
 if private.quarter_update_prior_identity_v1(o,w,true,o,x,'succeeded') is distinct from 'quarter_update_prior_not_found' then raise exception 'cross case prior not refused as not found';end if;
 if private.quarter_update_prior_identity_v1(o,w,true,o,w,'partial') is distinct from 'quarter_update_prior_not_completed' then raise exception 'partial prior not refused';end if;
 if private.quarter_update_prior_identity_v1(o,w,true,o,w,null) is distinct from 'quarter_update_prior_not_completed' then raise exception 'uncommitted prior not refused';end if;
 raise notice 'PASS: identity verdicts';
end $$;

-- 2. Content verdicts: method and version, packet fingerprint, the stored input byte for byte, and the
-- prior's sources pinned again by this contract.
do $$
declare fp text:=repeat('a',64);
 contract jsonb:=jsonb_build_object('method',jsonb_build_object('methodId','project-weekly-cash','methodVersion','2026.10.23-v1'),
  'inputs',jsonb_build_object('sources',jsonb_build_array(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId','a4171000-0000-4000-9000-000000000010','contentHash',repeat('f',64),'rightsRevision','1'))));
 snapshot jsonb:='{"schemaVersion":"weekly-cash-packet-input.v1","question":"q","analysis":{"analysisId":"x","streams":[{"id":"folha"}]}}';
 result jsonb:=jsonb_build_object('schemaVersion','weekly-cash-packet.v1','fingerprint',fp);
 ref jsonb:=jsonb_build_object('role','weekly_cash','executionId','a11b0000-0000-4000-9000-0000000000aa','resultFingerprint',fp);
 sources jsonb:=contract#>'{inputs,sources}';
begin
 if private.quarter_update_prior_content_v1('weekly_cash',ref,snapshot->'analysis',sources,contract,snapshot,result) is not null then raise exception 'a matching prior refused';end if;
 if private.quarter_update_prior_content_v1('covenant',ref,snapshot->'analysis',sources,contract,snapshot,result) is distinct from 'quarter_update_prior_method_mismatch' then raise exception 'wrong method not refused';end if;
 if private.quarter_update_prior_content_v1('weekly_cash',ref,snapshot->'analysis',sources,jsonb_set(contract,'{method,methodVersion}','"2026.10.19-v2"'),snapshot,result) is distinct from 'quarter_update_prior_method_mismatch' then raise exception 'wrong version not refused';end if;
 if private.quarter_update_prior_content_v1('weekly_cash',jsonb_set(ref,'{resultFingerprint}',to_jsonb(repeat('b',64))),snapshot->'analysis',sources,contract,snapshot,result) is distinct from 'quarter_update_prior_fingerprint_mismatch' then raise exception 'wrong fingerprint not refused';end if;
 if private.quarter_update_prior_content_v1('weekly_cash',ref,jsonb_set(snapshot->'analysis','{analysisId}','"y"'),sources,contract,snapshot,result) is distinct from 'quarter_update_prior_input_mismatch' then raise exception 'changed input not refused';end if;
 if private.quarter_update_prior_content_v1('weekly_cash',ref,null,sources,contract,snapshot,result) is distinct from 'quarter_update_prior_input_mismatch' then raise exception 'missing input not refused';end if;
 if private.quarter_update_prior_content_v1('weekly_cash',ref,snapshot->'analysis','[]',contract,snapshot,result) is distinct from 'quarter_update_prior_source_unpinned' then raise exception 'unpinned source not refused';end if;
 if private.quarter_update_prior_content_v1('weekly_cash',ref,snapshot->'analysis',jsonb_set(sources,'{0,contentHash}',to_jsonb(repeat('e',64))),contract,snapshot,result) is distinct from 'quarter_update_prior_source_unpinned' then raise exception 'source with other bytes not refused';end if;
 if private.quarter_update_prior_content_v1('weekly_cash',ref,snapshot->'analysis',jsonb_set(sources,'{0,rightsRevision}','"2"'),contract,snapshot,result) is not null then raise exception 'source pinned under the current rights refused';end if;
 raise notice 'PASS: content verdicts';
end $$;

-- 3. The resolver against stored rows: a reference of the wrong shape, an execution that does not exist,
-- an execution not committed, and a committed execution of another method, each by name.
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select pg_temp.expect_execution_command_error($q$select private.quarter_update_prior_resolve_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','weekly_cash','{"role":"covenant"}','{}','[]',auth.uid())$q$,'quarter_update_priors_invalid','reference of another role refused');
select pg_temp.expect_execution_command_error($q$select private.quarter_update_prior_resolve_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','weekly_cash',jsonb_build_object('role','weekly_cash','executionId','a11b0000-0000-4000-9000-0000000000ee','resultFingerprint',repeat('a',64)),'{}','[]',auth.uid())$q$,'quarter_update_prior_not_found','unknown execution refused');
-- A prior that pins a source: requested, claimed, settled and committed through the normal commands.
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status)
values('a4171000-0000-4000-9000-000000000010','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',
 'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/synthetic-prior.txt','Synthetic prior source','text/plain',1,repeat('f',64),'a11b0000-0000-4000-8000-000000000001','ready');
insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
values('a11b0000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000010','a4171000-0000-4000-9000-000000000099',repeat('f',64),1,'synthetic-only-prior-source');
update execution_fixture set contract=jsonb_set(contract,'{inputs,sources}',jsonb_build_array(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId','a4171000-0000-4000-9000-000000000010','contentHash',repeat('f',64),'rightsRevision','1')));
update execution_fixture set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
create temporary table prior_ref as select jsonb_build_object('role','weekly_cash','executionId',request->>'executionId','resultFingerprint',repeat('a',64)) ref from execution_fixture;
select pg_temp.expect_execution_command_error($q$select private.quarter_update_prior_resolve_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','weekly_cash',ref,'{}','[]',auth.uid()) from prior_ref$q$,'quarter_update_prior_not_completed','uncommitted prior refused');
select pg_temp.expect_execution_command_error($q$select private.quarter_update_prior_resolve_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-0000000000ef','weekly_cash',ref,'{}','[]',auth.uid()) from prior_ref$q$,'quarter_update_prior_not_found','an uncommitted prior of another work is not found');
update execution_fixture set claim=public.worker_claim_execution_v1('synthetic-policy-worker-fixture-token-v1',array[repeat('a',64)]);
select public.worker_reserve_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid) from execution_fixture;
select public.worker_settle_execution_v2((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,'{"calculation":"synthetic"}','succeeded','calculated') from execution_fixture;
select public.worker_commit_execution_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{"calculation":"synthetic"}','succeeded','calculated') from execution_fixture;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select pg_temp.expect_execution_command_error($q$select private.quarter_update_prior_resolve_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-0000000000ef','weekly_cash',ref,'{}','[]',auth.uid()) from prior_ref$q$,'quarter_update_prior_not_found','a committed prior of another work is not found, never named as existing');
select pg_temp.expect_execution_command_error($q$select private.quarter_update_prior_resolve_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','weekly_cash',ref,'{}',(select contract#>'{inputs,sources}' from execution_fixture),auth.uid()) from prior_ref$q$,'quarter_update_prior_method_mismatch','committed prior of another method refused');
-- 3b. Rights: once read is removed from the prior's source, the prior fails through its own closure, before any content is read.
select private.set_source_rights_v1('a4171000-0000-4000-9000-000000000010',1,array['process','store','derive','export'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('c',64));
select pg_temp.expect_execution_command_error($q$select private.quarter_update_prior_resolve_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','weekly_cash',ref,'{}',(select contract#>'{inputs,sources}' from execution_fixture),auth.uid()) from prior_ref$q$,'quarter_update_prior_rights_denied','prior with revoked source rights refused at request time');
-- The latest prior of a role is absent when its closure cannot be read, never replaced by an older one.
do $$begin
 if private.quarter_update_latest_prior_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','weekly_cash',auth.uid()) is not null then raise exception 'synthetic method read as a weekly cash prior';end if;
 raise notice 'PASS: latest prior only of the expected method';
end $$;

-- 4. The v3 producer is the quarter close's only door and refuses any other method by name.
select pg_temp.expect_execution_command_error($q$select public.request_work_execution_v3(contract::text,'{}','{}','[]') from execution_fixture$q$,'quarter_update_priors_method_denied','another method cannot use the priors door');

-- 5. The provenance walk: a method it does not bind keeps its answer, and the quarter close is refused
-- unless the v3 producer recorded both priors for this very execution. A request through v1 or v2 carries
-- no recorded priors, so the walk inside request_work_execution_v1 (which v2 and v3 both reach) refuses it.
do $$
declare c jsonb:=jsonb_build_object('organizationId','a11b0000-0000-4000-9000-000000000001','workId','a11b0000-0000-4000-9000-000000000002','executionId','a11b0000-0000-4000-9000-0000000000c5',
 'method',jsonb_build_object('methodId','update-after-quarter-close','methodVersion','2026.10.26-v1'));
begin
 if not private.execution_capital_payload_current_v1(jsonb_build_object('method',jsonb_build_object('methodId','synthetic-execution')),'{}',auth.uid()) then raise exception 'unbound method changed answer';end if;
 if private.execution_capital_payload_current_v1(c,'{"schemaVersion":"quarter-update-packet-input.v1","analysis":{"prior":{"weeklyCash":{},"covenant":{}}}}',auth.uid()) then raise exception 'priors not stored accepted';end if;
 if private.execution_capital_payload_current_v1(jsonb_set(c,'{method,methodVersion}','"2026.10.26-v2"'),'{"schemaVersion":"quarter-update-packet-input.v1"}',auth.uid()) then raise exception 'other version accepted';end if;
 if private.quarter_update_priors_recorded_v1(c,'{"analysis":{"prior":{"weeklyCash":{},"covenant":{}}}}') then raise exception 'priors not recorded through v3 accepted';end if;
 -- Embedded priors equal to a stored input are not enough: the execution itself must carry the v3 record.
 if private.quarter_update_priors_recorded_v1(c,jsonb_build_object('analysis',jsonb_build_object('prior',jsonb_build_object(
   'weeklyCash',(select s.payload->'analysis' from private.execution_input_snapshots s limit 1),'covenant','{}'::jsonb)))) then raise exception 'equal analyses without a v3 record accepted';end if;
 raise notice 'PASS: provenance walk binds the quarter close and leaves other methods as they were';
end $$;

-- 5b. Behaviourally: a quarter close requested through the common request path (request_work_execution_v1,
-- which the v1 and v2 producers both reach through request_work_execution_as_subject_v1) carries no v3 record
-- of its priors and is refused by the provenance walk, even with priors embedded in the snapshot.
insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source)
values('synthetic-quarter-close',true,'universal','update-after-quarter-close','2026.10.26-v1','tested','Synthetic approver',current_date,'Synthetic rollback-only fixture');
insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)
select 'synthetic-quarter-close-2026.10.26-v1','update-after-quarter-close','2026.10.26-v1',repeat('a',64),manifest,components,evidence,approval,'synthetic-quarter-close'
from private.platform_method_releases where id='synthetic-execution-test-v1';
insert into private.execution_method_profiles(id,platform_release_id,serialization_version,canonical_payload,payload_fingerprint,adapter_source_commit,review_evidence)
select 'a4171000-0000-4000-9000-0000000000c5','synthetic-quarter-close-2026.10.26-v1','offroad-execution-json-utf16-v1',payload::text,encode(extensions.digest(payload::text,'sha256'),'hex'),adapter_source_commit,review_evidence
from (select jsonb_set(jsonb_set(jsonb_set(p.payload,'{method,platformReleaseId}','"synthetic-quarter-close-2026.10.26-v1"'),'{method,methodId}','"update-after-quarter-close"'),'{method,methodVersion}','"2026.10.26-v1"') payload,
 p.adapter_source_commit,p.review_evidence from private.execution_method_profiles p where p.id='a4171000-0000-4000-9000-000000000001') x;
create temporary table quarter_close_request as
select jsonb_set(jsonb_set(pg_temp.execution_contract_fixture('a4171000-0000-4000-9000-0000000000c6'),'{method}',(select payload->'method' from private.execution_method_profiles where id='a4171000-0000-4000-9000-0000000000c5')),
 '{inputs,fingerprint}',to_jsonb(encode(extensions.digest(snap::text,'sha256'),'hex'))) contract,snap::text snapshot
from (select jsonb_build_object('schemaVersion','quarter-update-packet-input.v1','question','Fechou o trimestre. Atualiza tudo.','askedDependentIds','[]'::jsonb,
 'analysis',jsonb_build_object('prior',jsonb_build_object('weeklyCash','{}'::jsonb,'covenant','{}'::jsonb),'update','{}'::jsonb)) snap) s;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_v1('a4171000-0000-4000-9000-0000000000c5',contract::text,snapshot) from quarter_close_request$q$,
 'execution_payload_provenance_denied','a quarter close outside v3 is refused by the provenance walk');
-- And v3 refuses a reference list without both roles before anything is recorded.
select pg_temp.expect_execution_command_error($q$select public.request_work_execution_v3(contract::text,snapshot,'{}','[]') from quarter_close_request$q$,
 'quarter_update_priors_invalid','v3 without both priors refused');

-- 6. Grants: the three doors for authenticated only; every helper and the pins closed.
do $$ declare f text;
begin
 foreach f in array array['public.request_work_execution_v3(text,text,text,jsonb)','public.quarter_update_prior_results_v1(uuid)','public.worker_quarter_update_priors_v1(uuid,text)'] loop
  if not has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then raise exception 'door grant wrong: %',f;end if;
 end loop;
 foreach f in array array['private.quarter_update_prior_method_v1(text)','private.quarter_update_prior_identity_v1(uuid,uuid,boolean,uuid,uuid,text)',
  'private.quarter_update_prior_content_v1(text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)','private.quarter_update_prior_resolve_v1(uuid,uuid,text,jsonb,jsonb,jsonb,uuid)',
  'private.quarter_update_priors_recorded_v1(jsonb,jsonb)','private.quarter_update_latest_prior_v1(uuid,uuid,text,uuid)'] loop
  if has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then raise exception 'helper exposed: %',f;end if;
 end loop;
 if has_table_privilege('authenticated','private.execution_prior_results','SELECT') or has_table_privilege('service_role','private.execution_prior_results','SELECT') then raise exception 'prior pins exposed';end if;
 raise notice 'PASS: priors doors and helpers granted narrowly';
end $$;

select 'lote3_quarter_update_priors_passed' as result;
rollback;