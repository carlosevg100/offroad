-- Real request/claim/settlement/commit producers; no private execution snapshots
-- or invented result rows. Historical base is approved by the real fixture command.
begin;
\ir execution_artifact_setup.sql
\ir execution_approval.sql
insert into public.organization_review_policies(organization_id,assignment_required,self_approval_allowed,updated_by)
values('a11b0000-0000-4000-9000-000000000001',false,true,'a11b0000-0000-4000-8000-000000000001')
on conflict(organization_id) do update set assignment_required=false,self_approval_allowed=true;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values('a3f00000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',41,'manual','queued','approval-fixture-v1','a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values('a3f00000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a3f00000-0000-4000-9000-000000000001','case_analysis','queued','{"analysis_scope":"full_case"}');
-- New source has actual declared bytes and capability-bound verification, unlike
-- the historical access-boundary fixture whose document intentionally has no hash.
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,sha256,byte_size,processing_status,scan_result,created_by)
values('a3f00000-0000-4000-9000-000000000006','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',
 'a11b0000-0000-4000-9000-000000000001/adoption-source.txt','adoption-source.txt','text/plain',encode(extensions.digest('native adoption fixture','sha256'),'hex'),23,
 'ready','{"verdict":"clean"}','a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,payload,lease_expires_at,capability_sha256)
values('a3f00000-0000-4000-9000-000000000007','a11b0000-0000-4000-9000-000000000001','a3f00000-0000-4000-9000-000000000001',
 'a11b0000-0000-4000-9000-000000000003','a3f00000-0000-4000-9000-000000000006','document_pipeline','leased',
 jsonb_build_object('document_version',1,'sha256',encode(extensions.digest('native adoption fixture','sha256'),'hex')),
 clock_timestamp()+interval '10 minutes',extensions.digest(repeat('d',64),'sha256'));
select private.register_source_verification_v1('a3f00000-0000-4000-9000-000000000007',repeat('d',64),
 jsonb_build_object('verdict','clean','organizationId','a11b0000-0000-4000-9000-000000000001','sourceDocumentId','a3f00000-0000-4000-9000-000000000006',
 'operationId','a3f00000-0000-4000-9000-000000000007','documentVersion',1,'observedSha256',encode(extensions.digest('native adoption fixture','sha256'),'hex'),
 'expectedSha256',encode(extensions.digest('native adoption fixture','sha256'),'hex'),'observedByteSize',23,'expectedByteSize',23,'receiptId','sha256:'||repeat('d',64)));

select pg_temp.fixture_approve_execution('a3f00000-0000-4000-9000-000000000002');
update public.processing_jobs set status='cancelled' where id='a3f00000-0000-4000-9000-000000000002';
select public.request_work_continuation_v1('a3f00000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000002','pt-BR',
 'Aprofundar o cenário de refinanciamento',m.id,m.subject_id,m.revision)
from public.work_milestones m where m.organization_id='a11b0000-0000-4000-9000-000000000001' and m.work_id='a11b0000-0000-4000-9000-000000000002'
 and m.kind='decision' and m.subject_kind='execution_brief' order by occurred_at desc limit 1;

do $$declare c jsonb;snapshot jsonb;req jsonb;claim jsonb;packet text:=current_setting('test.producers.packet');exec uuid:='a3f00000-0000-4000-9000-000000000004';begin
 c:=pg_temp.execution_contract_fixture(exec);
 snapshot:=jsonb_build_object('decision',jsonb_build_object('review',jsonb_build_object('composition',jsonb_build_object('question','Synthetic follow-up',
  'objectives',jsonb_build_array('Aprofundar o cenário de refinanciamento')))));
 c:=jsonb_set(c,'{inputs,fingerprint}',to_jsonb(encode(extensions.digest(snapshot::text,'sha256'),'hex')));
 c:=jsonb_set(c,'{inputs,sources}',(select jsonb_build_array(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003',
  'sourceVersionId',id,'contentHash',declared_sha256,'rightsRevision','1')) from public.source_versions where id='a3f00000-0000-4000-9000-000000000006'));
 req:=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',c::text,snapshot::text);
 claim:=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(req->>'jobId')::uuid,60);
 perform private.reserve_execution_operation_v1((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,exec,claim->>'contractFingerprint','synthetic#calculate','test-v1','read_only',0,0);
 perform private.settle_execution_operation_v2((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,exec,claim->>'contractFingerprint',packet,'succeeded','calculated',0,0);
 perform private.commit_work_execution_result_v1((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',c#>>'{inputs,fingerprint}',packet,'succeeded','calculated');
end $$;
set local role authenticated;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
create function pg_temp.expect_work_update_native_error(p_sql text,p_error text) returns void language plpgsql security invoker as $$
begin
 begin execute p_sql;exception when others then if position(p_error in sqlerrm)>0 then return;end if;raise;end;
 raise exception 'expected native adoption rejection: %',p_error;
end $$;
select set_config('test.adoption_basis',public.read_work_update_adoption_basis_v2('a3f00000-0000-4000-9000-000000000003')::text,true);
select pg_temp.expect_work_update_native_error($q$select public.adopt_work_update_v1('a3f00000-0000-4000-9000-000000000005','a3f00000-0000-4000-9000-000000000003',(current_setting('test.adoption_basis')::jsonb->>'revision')::integer)$q$,'work_update_native_command_required');
select pg_temp.expect_work_update_native_error($q$select public.adopt_work_update_v2('a3f00000-0000-4000-9000-000000000005','a3f00000-0000-4000-9000-000000000003',(current_setting('test.adoption_basis')::jsonb->>'revision')::integer,current_setting('test.adoption_basis')::jsonb->>'basisFingerprint',false)$q$,'capital_project_self_approval_forbidden');
select set_config('test.adoption_result',public.adopt_work_update_v2('a3f00000-0000-4000-9000-000000000005','a3f00000-0000-4000-9000-000000000003',
 (current_setting('test.adoption_basis')::jsonb->>'revision')::integer,current_setting('test.adoption_basis')::jsonb->>'basisFingerprint',true)::text,true);
do $$declare r jsonb;begin
 r:=public.adopt_work_update_v2('a3f00000-0000-4000-9000-000000000005','a3f00000-0000-4000-9000-000000000003',
  (current_setting('test.adoption_basis')::jsonb->>'revision')::integer,current_setting('test.adoption_basis')::jsonb->>'basisFingerprint',true);
 if not(r->>'replayed')::boolean or r->>'decisionId' is distinct from current_setting('test.adoption_result')::jsonb->>'decisionId' then raise exception 'adoption replay changed';end if;
 if(select count(*) from public.work_milestones where subject_id='a3f00000-0000-4000-9000-000000000003' and kind='update_adopted')<>1 then raise exception 'adoption duplicated its milestone';end if;
end $$;
reset role;
do $$begin
 if not exists(select 1 from private.work_update_milestone_receipts r join private.review_basis_receipts b on(b.organization_id,b.id)=(r.organization_id,r.basis_receipt_id)
 where r.milestone_id=any(array(select(value#>>'{}')::uuid from jsonb_array_elements(current_setting('test.adoption_basis')::jsonb->'adoptedResults'))) and b.source_count>0) then
  raise exception 'actual adopted execution source absent from receipt';end if;
end $$;
set local role authenticated;
select public.set_source_rights_v1('a3f00000-0000-4000-9000-000000000006',1,'{}',array['analysis'],null,null,'a11b0000-0000-4000-9000-000000000004',repeat('c',64));
select pg_temp.expect_work_update_native_error($q$select public.adopt_work_update_v2('a3f00000-0000-4000-9000-000000000005','a3f00000-0000-4000-9000-000000000003',(current_setting('test.adoption_basis')::jsonb->>'revision')::integer,current_setting('test.adoption_basis')::jsonb->>'basisFingerprint',true)$q$,'work_update_basis_denied');
rollback;
