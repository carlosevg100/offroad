-- Source identity, independent byte verification and current rights. Rollback only.
begin;
\ir support/execution_commands_fixture.sql
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status)
values('a4171000-0000-4000-9000-000000000010','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',
 'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/synthetic-execution.txt','Synthetic source','text/plain',1,repeat('f',64),'a11b0000-0000-4000-8000-000000000001','ready');
update execution_fixture set contract=jsonb_set(contract,'{inputs,sources}',jsonb_build_array(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId','a4171000-0000-4000-9000-000000000010','contentHash',repeat('f',64),'rightsRevision','1')));
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}') from execution_fixture$q$,'execution_source_pin_denied','declared hash alone is not verified bytes');
insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
values('a11b0000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000010','a4171000-0000-4000-9000-000000000099',repeat('f',64),1,'synthetic-only-execution-source');
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',jsonb_set(contract,'{inputs,sources,0,contentHash}',to_jsonb(repeat('e',64)))::text,'{}') from execution_fixture$q$,'execution_source_pin_denied','changed source hash denied');
update execution_fixture set request=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}');
update execution_fixture set claim=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(request->>'jobId')::uuid,60);
select private.set_source_rights_v1('a4171000-0000-4000-9000-000000000010',1,array['process','store','derive','export'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('c',64));
select pg_temp.expect_execution_command_error($q$select private.commit_work_execution_result_v1((request->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',contract#>>'{inputs,fingerprint}','{}','succeeded','calculated') from execution_fixture$q$,'execution_authority_denied','read removed from current rights denies commit');
select 'execution_read_revocation: PASS' result;
rollback;
