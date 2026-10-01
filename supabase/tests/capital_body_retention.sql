-- Transactional SQL contract only. storage.objects rows below are metadata fixtures,
-- NOT physical byte/purge evidence. Real Storage HTTP and worker eval are separate gates.
begin;
-- auth.uid prefers this scalar setting when another evaluator seeded it. This
-- suite changes principals through claims only, so clear the inherited scalar.
select set_config('request.jwt.claim.sub','',true);
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_persistent_work_fixture.sql
\ir support/provider_research_plan_snapshot.sql
\ir support/execution_approval.sql
-- A real authorized synthetic job proves identity replay and that no complete
-- receipt or payload bytes are fabricated by the metadata-only foundation.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
('10000000-0000-4000-8000-000000000991','authenticated','authenticated','body-owner@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false),
('10000000-0000-4000-8000-000000000992','authenticated','authenticated','body-foreign@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false),
('10000000-0000-4000-8000-000000000993','authenticated','authenticated','body-publisher@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000991','originator','Synthetic capture A','10000000-0000-4000-8000-000000000991'),
('20000000-0000-4000-8000-000000000992','originator','Synthetic capture B','10000000-0000-4000-8000-000000000992');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
('20000000-0000-4000-8000-000000000991','10000000-0000-4000-8000-000000000991','owner','active',now()),
('20000000-0000-4000-8000-000000000992','10000000-0000-4000-8000-000000000992','owner','active',now());
insert into public.onboarding_progress(organization_id,user_id,journey,current_step) values
('20000000-0000-4000-8000-000000000991','10000000-0000-4000-8000-000000000991','originator','organization');
insert into public.funds(id,organization_id,name,strategy,created_by) values
('40000000-0000-4000-8000-000000000991','20000000-0000-4000-8000-000000000991','Synthetic capture fund','credit','10000000-0000-4000-8000-000000000991');
insert into public.fund_directory(id,legal_name,kind,status,claimed_by_organization_id,claimed_at) values
('50000000-0000-4000-8000-000000000991','Synthetic capture directory','credit_fund','registered','20000000-0000-4000-8000-000000000991',now());
-- The publisher is a separate Offroad organization. Its right never becomes a
-- consumer-tenant source row by virtue of the consumer's membership.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000993","role":"authenticated"}',true);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000993','offroad','Synthetic capture publisher','10000000-0000-4000-8000-000000000993');
insert into public.organization_memberships(organization_id,user_id,role,status) values
('20000000-0000-4000-8000-000000000993','10000000-0000-4000-8000-000000000993','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by) values
('30000000-0000-4000-8000-000000000993','20000000-0000-4000-8000-000000000993','Synthetic capture source','10000000-0000-4000-8000-000000000993');
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000993"}',true);
create temp table capture_public_license_fixture(source_version_id uuid,source_binding_id uuid,rights_version_id uuid,payload jsonb);
grant select on capture_public_license_fixture to authenticated;
do $$ declare v uuid:=gen_random_uuid(); b uuid; r uuid; sample jsonb; begin
 sample:='{"url":"https://example.invalid/capture-licensed","title":"Synthetic licensed source","snippet":"Licensed excerpt only","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'::jsonb;
 insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by)
 values(v,'20000000-0000-4000-8000-000000000993','30000000-0000-4000-8000-000000000993','30000000-0000-4000-8000-000000000993','10000000-0000-4000-8000-000000000993');
 insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,initial_verification_state,created_by)
 values(v,'20000000-0000-4000-8000-000000000993',v,1,1,'opportunity-documents','20000000-0000-4000-8000-000000000993/synthetic/'||v,'Synthetic excerpt','pending_verification','10000000-0000-4000-8000-000000000993');
 insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
 values('20000000-0000-4000-8000-000000000993',v,'30000000-0000-4000-8000-000000000993','30000000-0000-4000-8000-000000000993',gen_random_uuid(),'10000000-0000-4000-8000-000000000993') returning id into b;
 r:=public.declare_public_source_reuse_v1(v,0,sample->>'url',private.public_source_payload_sha256_v1(sample),now()+interval '60 days',now()+interval '60 days',v,repeat('b',64));
 insert into pg_temp.capture_public_license_fixture values(v,b,r,sample);
end $$;
select set_config('request.jwt.claims','{}',true);
select set_config('request.headers','{}',true);
create temp table capture_job_fixture(job_id uuid, capability text, capture_id uuid);
grant all on capture_job_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000991","role":"authenticated"}',true);
do $$ declare plan jsonb:=pg_temp.provider_research_plan_fixture(); result jsonb; request uuid:=gen_random_uuid(); begin
 perform pg_temp.legacy_advisor_result(public.start_advisor_project_v1(request,'pt-BR','Synthetic capture',plan#>>'{job,id}',
  'Pesquise financiadores para a organização.','public_information',plan));
 result:=public.start_provider_research_project_v1(request,'pt-BR','Synthetic capture','Pesquise financiadores para a organização.',plan,null);
 insert into pg_temp.capture_job_fixture(job_id) values((result->>'research_job_id')::uuid);
end $$;
reset role;

create temp table body_test_fixture(work_id uuid,revision_id uuid,foreign_revision_id uuid,source_id uuid,ancestor_id uuid,rights_id uuid,ancestor_rights_id uuid,
 allocation jsonb,retained jsonb,response jsonb,response_retained jsonb,input_receipt jsonb,accepted jsonb,object_id uuid,response_object_id uuid,public_parent jsonb);
grant all on body_test_fixture to authenticated;
insert into body_test_fixture(work_id,revision_id,foreign_revision_id,source_id,ancestor_id)
 select coalesce(work_id,(payload->>'capital_project_id')::uuid),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()
 from public.processing_jobs where id=(select job_id from capture_job_fixture);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000991","role":"authenticated"}',true);
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000991"}',true);
do $$ declare f record;v uuid;begin
 select * into strict f from pg_temp.body_test_fixture;
 foreach v in array array[f.source_id,f.ancestor_id] loop
 insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by)
 values(v,'20000000-0000-4000-8000-000000000991',f.work_id,f.work_id,'10000000-0000-4000-8000-000000000991');
 insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,initial_verification_state,created_by)
 values(v,'20000000-0000-4000-8000-000000000991',v,1,1,'opportunity-documents','20000000-0000-4000-8000-000000000991/synthetic/'||v,'Synthetic body provenance','pending_verification','10000000-0000-4000-8000-000000000991');
 insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
 values('20000000-0000-4000-8000-000000000991',v,f.work_id,f.work_id,gen_random_uuid(),'10000000-0000-4000-8000-000000000991');
 end loop;
end; $$;
set local role authenticated;
do $$ declare f record;begin
 select * into strict f from pg_temp.body_test_fixture;
 update pg_temp.body_test_fixture set rights_id=public.set_source_rights_v1(f.source_id,0,array['read','process','store','derive'],array['analysis'],clock_timestamp()+interval '40 days',clock_timestamp()+interval '35 days',f.source_id,repeat('c',64)),
 ancestor_rights_id=public.set_source_rights_v1(f.ancestor_id,0,array['read','process','store','derive'],array['analysis'],clock_timestamp()+interval '20 days',clock_timestamp()+interval '18 days',f.ancestor_id,repeat('d',64));
 perform public.add_source_dependency_v1(f.source_id,f.ancestor_id);
 perform public.submit_work_contribution_v1(f.work_id,gen_random_uuid(),f.revision_id,null,null,'Synthetic authorized private financial question',array[f.source_id]);
end; $$;
reset role;
-- Separate tenant contribution is a real command too; it never becomes an origin
-- for the consumer by virtue of the supplied revision UUID.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000993","role":"authenticated"}',true);
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000993"}',true);
set local role authenticated;
do $$ begin
 perform public.submit_work_contribution_v1('30000000-0000-4000-8000-000000000993',gen_random_uuid(),(select foreign_revision_id from pg_temp.body_test_fixture),null,null,'Synthetic foreign contribution');
end; $$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000991","role":"authenticated"}',true);
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000991"}',true);
insert into private.worker_tokens(label,token_sha256,execution_account_user_id) values
('synthetic-body-worker',extensions.digest(repeat('z',64),'sha256'),'10000000-0000-4000-8000-000000000991');
do $$ declare job uuid; claim jsonb; session_row public.document_intake_sessions; job_row public.processing_jobs; begin
 select job_id into strict job from pg_temp.capture_job_fixture;
 select * into strict job_row from public.processing_jobs where id=job;
 select * into strict session_row from public.document_intake_sessions where id=job_row.intake_session_id;
 -- Match the existing approval helper's real owner to the exact workspace. Do
 -- not rely on the caller's last unrelated source-publication/contribution JWT.
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',session_row.started_by,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-offroad-workspace',session_row.organization_id)::text,true);
 if session_row.organization_id is distinct from job_row.organization_id or session_row.capital_project_id is distinct from (select work_id from pg_temp.body_test_fixture)
 or session_row.started_by is distinct from '10000000-0000-4000-8000-000000000991'::uuid then
 raise exception 'body_fixture_identity_mismatch';end if;
 if not private.can_access_capital_project(session_row.organization_id,session_row.capital_project_id) then
 raise exception 'body_fixture_project_access_denied actor=%,org=%,project=%,root=%,membership=%,read=%,headers=%',auth.uid(),session_row.organization_id,session_row.capital_project_id,
 private.resource_root_v1(session_row.organization_id,session_row.capital_project_id),
 (select status from public.organization_memberships where organization_id=session_row.organization_id and user_id=session_row.started_by),
 private.resource_access_as_subject_v1(session_row.organization_id,session_row.capital_project_id,session_row.started_by,'read'),current_setting('request.headers',true);
 end if;
 perform pg_temp.fixture_approve_execution(job);
 update public.processing_jobs set available_at=now()-interval '1 day' where id=job;
 claim:=public.worker_claim_job_v3(repeat('z',64),600);
 if claim->>'job_id' is distinct from job::text then raise exception 'capture fixture claim mismatch'; end if;
 update pg_temp.capture_job_fixture set capability=claim->>'capability_token';
end $$;


update private.capital_public_retention_controls set enabled=true;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000991","role":"authenticated"}',true);
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000991"}',true);
select public.worker_claim_capital_capture_purge_v1(repeat('z',64));
do $$ declare f record;j record;a jsonb;replay jsonb;begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 begin perform public.worker_prepare_capital_body_v1(j.job_id,j.capability,gen_random_uuid(),'contribution_input',f.foreign_revision_id);raise exception 'foreign tenant admitted';exception when insufficient_privilege then null;end;
 begin perform public.worker_prepare_capital_body_v1(j.job_id,repeat('x',64),gen_random_uuid(),'contribution_input',f.revision_id);raise exception 'wrong capability admitted';exception when insufficient_privilege then null;end;
 begin perform public.worker_prepare_capital_body_v1(j.job_id,j.capability,gen_random_uuid(),'native_material',f.revision_id);raise exception 'native kind admitted';exception when invalid_parameter_value then null;end;
 begin perform public.worker_prepare_capital_body_v1(j.job_id,j.capability,gen_random_uuid(),'contribution_input',f.revision_id,'{"raw":"arbitrary"}');raise exception 'caller replaced canonical contribution';exception when invalid_parameter_value then null;end;
 a:=public.worker_prepare_capital_body_v1(j.job_id,j.capability,'b09d0000-0000-4000-9000-000000000001','contribution_input',f.revision_id);
 replay:=public.worker_prepare_capital_body_v1(j.job_id,j.capability,'b09d0000-0000-4000-9000-000000000001','contribution_input',f.revision_id);
 if a->>'retentionState'<>'allocated' or a->>'schemaVersion'<>'capital-retained-body.v1' or a->>'allocationId' is distinct from replay->>'allocationId' or replay->>'replayed'<>'true'
 or (a->>'canonicalBody')::jsonb is distinct from jsonb_build_object('schemaVersion','capital-body.contribution.v1','content','Synthetic authorized private financial question')
 or (a->>'byteLength')::bigint<>octet_length(a->>'canonicalBody')
 or a->>'payloadFingerprint'<>encode(extensions.digest(a->>'canonicalBody','sha256'),'hex')
 or (a->>'expiresAt')::timestamptz>clock_timestamp()+interval '18 days'
 or not((a->>'retainedAt')::timestamptz<(a->>'purgeAt')::timestamptz and (a->>'purgeAt')::timestamptz<(a->>'expiresAt')::timestamptz) then raise exception 'body allocation/provenance/deadline/replay failed';end if;
 update pg_temp.body_test_fixture set allocation=a;
 begin perform public.worker_commit_capital_body_v1(j.job_id,j.capability,(a->>'allocationId')::uuid,gen_random_uuid(),'v1',repeat('0',64),(a->>'byteLength')::bigint);raise exception 'wrong byte hash accepted';exception when invalid_parameter_value then null;end;
 begin perform public.worker_commit_capital_body_v1(j.job_id,j.capability,(a->>'allocationId')::uuid,gen_random_uuid(),'v1',a->>'payloadFingerprint',(a->>'byteLength')::bigint);raise exception 'missing Storage object accepted';exception when invalid_parameter_value then null;end;
end; $$;
reset role;
-- Metadata fixture ONLY. HTTP eval must prove that bytes exist and match worker SHA.
insert into storage.objects(bucket_id,name,metadata,version)
 select 'capital-input-capture',allocation->>'path',jsonb_build_object('size',(allocation->>'byteLength')::bigint,'mimetype','application/json'),'body-sql-v1' from body_test_fixture;
update body_test_fixture f set object_id=o.id from storage.objects o where o.bucket_id='capital-input-capture' and o.name=f.allocation->>'path';
set local role authenticated;
do $$ declare f record;j record;r jsonb;begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 begin perform public.worker_commit_capital_body_v1(j.job_id,j.capability,(f.allocation->>'allocationId')::uuid,f.object_id,'wrong',f.allocation->>'payloadFingerprint',(f.allocation->>'byteLength')::bigint);raise exception 'wrong Storage version accepted';exception when invalid_parameter_value then null;end;
 r:=public.worker_commit_capital_body_v1(j.job_id,j.capability,(f.allocation->>'allocationId')::uuid,f.object_id,'body-sql-v1',f.allocation->>'payloadFingerprint',(f.allocation->>'byteLength')::bigint);
 if r->>'retentionState'<>'retained' or r?'canonicalBody' then raise exception 'retained DTO includes raw bytes';end if;
 update pg_temp.body_test_fixture set retained=r;
 if public.worker_commit_capital_body_v1(j.job_id,j.capability,(f.allocation->>'allocationId')::uuid,f.object_id,'body-sql-v1',f.allocation->>'payloadFingerprint',(f.allocation->>'byteLength')::bigint)->>'replayed'<>'true' then raise exception 'commit idempotency failed';end if;
 if public.worker_read_capital_body_v1(j.job_id,j.capability,(r->>'retainedPayloadId')::uuid)->>'storageObjectId' is distinct from f.object_id::text then raise exception 'read receipt failed';end if;
 r:=public.worker_prepare_capital_body_v1(j.job_id,j.capability,'b09d0000-0000-4000-9000-000000000001','contribution_input',f.revision_id);
 if r->>'retentionState'<>'retained' or r?'canonicalBody' or r->>'replayed'<>'true' then raise exception 'committed prepare replay failed';end if;
end; $$;
reset role;
-- Private origins store exact direct + ancestor rights/bindings, never content.
do $$ declare f record;begin
 select * into strict f from pg_temp.body_test_fixture;
 if (select count(distinct source_version_id) from private.capital_body_source_pins where origin_id=(select origin_id from private.capital_body_bases where id=(f.retained->>'bodyBasisId')::uuid))<>2 then raise exception 'ancestry not pinned';end if;
 if exists(select 1 from private.capital_public_payload_allocations where id=(f.allocation->>'allocationId')::uuid and (delivery_id is not null or license_id is not null or licensing_organization_id is not null or content_kind<>'typed_body')) then raise exception 'typed body fabricated public license';end if;
end; $$;
-- Receipts before dispatch and accepted attempt fields are content-free and exact.
set local role authenticated;
do $$ declare f record;j record;input jsonb;accepted_receipt jsonb;dto jsonb;r jsonb;begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 input:=public.worker_record_capital_body_input_v1(j.job_id,j.capability,'b09d0000-0000-4000-9000-000000000002',repeat('a',64),repeat('b',64),repeat('c',64),'openai','synthetic-model',jsonb_build_array(jsonb_build_object('kind','contribution','id',f.revision_id),jsonb_build_object('kind','retained_payload','id',f.retained->>'retainedPayloadId')));
 if input->>'requestFingerprint'<>repeat('a',64) then raise exception 'pre-dispatch binding mismatch';end if;
 begin perform public.worker_record_capital_body_input_v1(j.job_id,j.capability,'b09d0000-0000-4000-9000-000000000002',repeat('d',64),repeat('b',64),repeat('c',64),'openai','synthetic-model',jsonb_build_array(jsonb_build_object('kind','contribution','id',f.revision_id)));raise exception 'invocation rewritten';exception when unique_violation then null;end;
 dto:=jsonb_build_object('schemaVersion','gateway-accepted-invocation.v1','invocationId',input->>'invocationId','adapterInputVersion','gateway-adapter-input.v1','adapterRequestFingerprint',input->>'requestFingerprint','outputFingerprintVersion','gateway-parsed-output.v1','outputFingerprint',repeat('e',64),'inputFingerprint',repeat('b',64),'promptFingerprint',repeat('c',64),'provider','openai','configuredModel','synthetic-model','reportedModel','synthetic-model','schemaName','origination_senior_readout_v2','retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',false,'fromCassette',false,'inputAttestationReceiptId',input->>'receiptId');
 begin perform public.worker_record_capital_body_accepted_v1(j.job_id,j.capability,(input->>'receiptId')::uuid,dto||'{"fromCassette":true}');raise exception 'cassette accepted as egress';exception when invalid_parameter_value then null;end;
 begin perform public.worker_record_capital_body_accepted_v1(j.job_id,j.capability,(input->>'receiptId')::uuid,dto||'{"fromCassette":"false"}');raise exception 'untyped metadata accepted';exception when invalid_parameter_value then null;end;
 begin perform public.worker_record_capital_body_accepted_v1(j.job_id,j.capability,(input->>'receiptId')::uuid,dto||'{"rawText":"private"}');raise exception 'raw body in metadata accepted';exception when invalid_parameter_value then null;end;
 accepted_receipt:=public.worker_record_capital_body_accepted_v1(j.job_id,j.capability,(input->>'receiptId')::uuid,dto);
 if public.worker_record_capital_body_accepted_v1(j.job_id,j.capability,(input->>'receiptId')::uuid,dto)->>'acceptedInvocationId' is distinct from accepted_receipt->>'acceptedInvocationId' then raise exception 'accepted replay duplicated';end if;
 begin perform public.worker_record_capital_body_input_v1(j.job_id,j.capability,gen_random_uuid(),repeat('a',64),repeat('b',64),repeat('c',64),'anthropic','synthetic-fallback',jsonb_build_array(jsonb_build_object('kind','contribution','id',f.revision_id)),0,false,true,gen_random_uuid());raise exception 'invented predecessor accepted';exception when invalid_parameter_value then null;end;
 r:=public.worker_prepare_capital_body_v1(j.job_id,j.capability,'b09d0000-0000-4000-9000-000000000003','gateway_accepted_output',(accepted_receipt->>'acceptedInvocationId')::uuid,'{"question":"Synthetic parsed response"}',repeat('e',64));
 if r->>'payloadFingerprint'=repeat('e',64) or (r->>'expiresAt')::timestamptz>(f.retained->>'expiresAt')::timestamptz then raise exception 'semantic hash conflated/ancestor refreshed';end if;
 update pg_temp.body_test_fixture set input_receipt=input,accepted=accepted_receipt,response=r;
end; $$;
reset role;
insert into storage.objects(bucket_id,name,metadata,version)
 select 'capital-input-capture',response->>'path',jsonb_build_object('size',(response->>'byteLength')::bigint,'mimetype','application/json'),'body-response-sql-v1' from body_test_fixture;
update body_test_fixture f set response_object_id=o.id from storage.objects o where o.bucket_id='capital-input-capture' and o.name=f.response->>'path';
set local role authenticated;
do $$ declare f record;j record;r jsonb;begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 r:=public.worker_commit_capital_body_v1(j.job_id,j.capability,(f.response->>'allocationId')::uuid,f.response_object_id,'body-response-sql-v1',f.response->>'payloadFingerprint',(f.response->>'byteLength')::bigint);
 update pg_temp.body_test_fixture set response_retained=r;
end; $$;
reset role;
-- A second tenant is provisioned through the same legitimate lifecycle; its
-- pending wake must not stall an unrelated consumer's already-retained body.
insert into public.funds(id,organization_id,name,strategy,created_by) values
('40000000-0000-4000-8000-000000000992','20000000-0000-4000-8000-000000000992','Synthetic body unrelated fund','credit','10000000-0000-4000-8000-000000000992');
insert into public.fund_directory(id,legal_name,kind,status,claimed_by_organization_id,claimed_at) values
('50000000-0000-4000-8000-000000000992','Synthetic body unrelated directory','credit_fund','registered','20000000-0000-4000-8000-000000000992',now());
insert into private.worker_tokens(label,token_sha256,execution_account_user_id) values
('synthetic-body-unrelated-worker',extensions.digest(repeat('y',64),'sha256'),'10000000-0000-4000-8000-000000000992');
create temp table body_unrelated_fixture(allocation jsonb);grant all on body_unrelated_fixture to authenticated;
do $$ declare result jsonb;plan jsonb:=pg_temp.provider_research_plan_fixture();request uuid:=gen_random_uuid();job uuid;claim jsonb;revision uuid:=gen_random_uuid();work uuid;allocated jsonb;begin
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000992","role":"authenticated"}',true);
 perform set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000992"}',true);
 perform pg_temp.legacy_advisor_result(public.start_advisor_project_v1(request,'pt-BR','Synthetic unrelated',plan#>>'{job,id}','Pesquise financiadores para a organização.','public_information',plan));
 result:=public.start_provider_research_project_v1(request,'pt-BR','Synthetic unrelated','Pesquise financiadores para a organização.',plan,null);
 job:=(result->>'research_job_id')::uuid;work:=(result->>'capital_project_id')::uuid;
 perform pg_temp.fixture_approve_execution(job);
 update public.processing_jobs set available_at=now()-interval '1 day' where id=job;
 claim:=public.worker_claim_job_v3(repeat('y',64),600);
 if claim->>'job_id' is distinct from job::text then raise exception 'unrelated fixture claim mismatch';end if;
 perform public.worker_claim_capital_capture_purge_v1(repeat('y',64));
 perform public.submit_work_contribution_v1(work,gen_random_uuid(),revision,null,null,'Synthetic unrelated authorized contribution');
 allocated:=public.worker_prepare_capital_body_v1(job,claim->>'capability_token',gen_random_uuid(),'contribution_input',revision);
 insert into pg_temp.body_unrelated_fixture values(allocated);
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000991","role":"authenticated"}',true);
 perform set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000991"}',true);
end; $$;
do $$ declare f record;j record;before_deadline timestamptz;begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 begin
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select '20000000-0000-4000-8000-000000000992',(allocation->>'allocationId')::uuid from pg_temp.body_unrelated_fixture;
 perform public.worker_read_capital_body_v1(j.job_id,j.capability,(f.response_retained->>'retainedPayloadId')::uuid);
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 begin
 select effective_purge_at into before_deadline from private.capital_public_payload_purge_queue where allocation_id=(f.allocation->>'allocationId')::uuid;
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select '20000000-0000-4000-8000-000000000991',(f.allocation->>'allocationId')::uuid from generate_series(1,2);
 if (select count(*) from private.capital_body_retention_wakes where allocation_id=(f.allocation->>'allocationId')::uuid)<>2 then raise exception 'wake events silently deduplicated';end if;
 begin perform public.worker_read_capital_body_v1(j.job_id,j.capability,(f.response_retained->>'retainedPayloadId')::uuid);raise exception 'relevant parent wake allowed read';exception when serialization_failure then if sqlerrm<>'capital_body_retention_pending' then raise;end if;end;
 perform private.drain_capital_body_retention_wakes_v1(repeat('z',64),100);
 if exists(select 1 from private.capital_body_retention_wakes where allocation_id=(f.allocation->>'allocationId')::uuid)
 or (select effective_purge_at from private.capital_public_payload_purge_queue where allocation_id=(f.allocation->>'allocationId')::uuid)>before_deadline then raise exception 'wake drain lost/renewed parent';end if;
 if private.drain_capital_body_retention_wakes_v1(repeat('z',64),100)<>0 then raise exception 'wake drain perpetually recreates events';end if;
 perform public.worker_read_capital_body_v1(j.job_id,j.capability,(f.response_retained->>'retainedPayloadId')::uuid);
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
end; $$;
-- Every mutability/rights/authority negative below rolls back its own perturbation.
do $$ declare f record;j record;before_count bigint;v uuid;operation_name text;begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 begin
 insert into private.capital_body_retention_wakes(organization_id,allocation_id) values('20000000-0000-4000-8000-000000000991',(f.allocation->>'allocationId')::uuid);
 begin perform public.worker_commit_capital_body_v1(j.job_id,j.capability,(f.response->>'allocationId')::uuid,f.response_object_id,'body-response-sql-v1',f.response->>'payloadFingerprint',(f.response->>'byteLength')::bigint);raise exception 'pending wake commit allowed';exception when serialization_failure then if sqlerrm<>'capital_body_retention_pending' then raise;end if;end;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 foreach v in array array[f.source_id,f.ancestor_id] loop
 foreach operation_name in array array['read','process','store','derive'] loop
 begin
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 select organization_id,source_version_id,revision+1,array_remove(array['read','process','store','derive'],operation_name),purposes,audience,clock_timestamp(),evidence_kind,evidence_reference,evidence_sha256,created_by from private.source_rights_versions where source_version_id=v order by revision desc limit 1;
 if not exists(select 1 from private.capital_body_retention_wakes where allocation_id=(f.allocation->>'allocationId')::uuid) then raise exception 'rights notification absent';end if;
 begin perform public.worker_read_capital_body_v1(j.job_id,j.capability,(f.retained->>'retainedPayloadId')::uuid);raise exception 'removed process read allowed';exception when insufficient_privilege then null;end;
 begin perform public.worker_read_capital_body_v1(j.job_id,j.capability,(f.response_retained->>'retainedPayloadId')::uuid);raise exception 'restricted derivative read allowed';exception when insufficient_privilege then null;end;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 end loop;
 end loop;
 begin
 update public.source_bindings set revoked_at=clock_timestamp(),revoked_by='10000000-0000-4000-8000-000000000991' where source_version_id=f.ancestor_id;
 begin perform public.worker_read_capital_body_v1(j.job_id,j.capability,(f.response_retained->>'retainedPayloadId')::uuid);raise exception 'revoked ancestor binding read allowed';exception when insufficient_privilege then null;end;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 begin
 update public.organization_memberships set status='suspended' where organization_id='20000000-0000-4000-8000-000000000991' and user_id='10000000-0000-4000-8000-000000000991';
 begin perform public.worker_read_capital_body_v1(j.job_id,j.capability,(f.retained->>'retainedPayloadId')::uuid);raise exception 'revoked subject read allowed';exception when insufficient_privilege then null;end;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 begin
 update private.worker_tokens set execution_account_user_id='10000000-0000-4000-8000-000000000992' where id=(select leased_by from public.processing_jobs where id=j.job_id);
 begin perform public.worker_read_capital_body_v1(j.job_id,j.capability,(f.retained->>'retainedPayloadId')::uuid);raise exception 'reassigned worker read allowed';exception when insufficient_privilege then null;end;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 begin
 update public.processing_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=j.job_id;
 begin perform public.worker_read_capital_body_v1(j.job_id,j.capability,(f.retained->>'retainedPayloadId')::uuid);raise exception 'expired lease read allowed';exception when insufficient_privilege then null;end;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 begin
 update storage.objects set metadata=jsonb_build_object('size',1,'mimetype','application/json') where id=f.object_id;
 begin perform public.worker_read_capital_body_v1(j.job_id,j.capability,(f.retained->>'retainedPayloadId')::uuid);raise exception 'changed physical size read allowed';exception when insufficient_privilege then null;end;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
end; $$;
-- Exact pin and contemporaneity proof: a current valid declaration never
-- authorizes rewriting the original capture's historical rights identity.
do $$ declare f record;origin_row private.capital_body_origins;pins jsonb;mutated jsonb;new_right uuid;begin
 select * into strict f from pg_temp.body_test_fixture;
 select o.* into strict origin_row from private.capital_body_origins o join private.capital_body_bases b on b.organization_id=o.organization_id and b.origin_id=o.id where b.id=(f.retained->>'bodyBasisId')::uuid;
 select jsonb_agg(jsonb_build_object('sourceVersionId',source_version_id,'rightsVersionId',rights_version_id,'sourceBindingId',source_binding_id,'kind',pin_kind)) into pins
 from private.capital_body_source_pins where origin_id=origin_row.id;
 select jsonb_agg(case when e->>'sourceVersionId'=f.source_id::text then e||jsonb_build_object('rightsVersionId',f.ancestor_rights_id) else e end) into mutated from jsonb_array_elements(pins) e;
 if private.capital_body_contribution_proof_v1(origin_row.organization_id,f.revision_id,'10000000-0000-4000-8000-000000000991',origin_row.captured_at,mutated,origin_row.source_closure_fingerprint) is not null
 then raise exception 'wrong source rights pin admitted';end if;
 if private.capital_body_contribution_proof_v1(origin_row.organization_id,f.revision_id,'10000000-0000-4000-8000-000000000991',origin_row.captured_at,pins,repeat('0',64)) is not null
 then raise exception 'wrong dependency closure admitted';end if;
 begin
 new_right:=public.set_source_rights_v1(f.source_id,(select max(revision) from private.source_rights_versions where source_version_id=f.source_id),array['read','process','store','derive'],array['analysis'],clock_timestamp()+interval '30 days',clock_timestamp()+interval '25 days',f.source_id,repeat('f',64));
 select jsonb_agg(case when e->>'sourceVersionId'=f.source_id::text and e->>'kind'='captured_latest' then e||jsonb_build_object('rightsVersionId',new_right) else e end) into mutated from jsonb_array_elements(pins) e;
 if private.capital_body_contribution_proof_v1(origin_row.organization_id,f.revision_id,'10000000-0000-4000-8000-000000000991',origin_row.captured_at,mutated,origin_row.source_closure_fingerprint) is not null
 then raise exception 'post-capture right admitted';end if;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
end; $$;
-- Parent purge closes derivative read without refreshing its deadline and leaves wake durable.
update private.capital_public_payload_purge_queue set next_check_at=clock_timestamp()-interval '1 second',effective_purge_at=clock_timestamp()-interval '1 second' where allocation_id=(select (allocation->>'allocationId')::uuid from body_test_fixture);
set local role authenticated;
create temp table body_purge_tickets(ticket jsonb);grant all on body_purge_tickets to authenticated;
do $$ declare f record;j record;ticket jsonb;begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 ticket:=public.worker_claim_capital_capture_purge_v1(repeat('z',64))#>'{items,0}';
 if ticket is null or ticket->>'allocationId' is distinct from f.allocation->>'allocationId' then raise exception 'parent not claimed';end if;
 insert into body_purge_tickets values(ticket);
 begin perform public.worker_read_capital_body_v1(j.job_id,j.capability,(f.response_retained->>'retainedPayloadId')::uuid);raise exception 'purged parent derivative read allowed';exception when insufficient_privilege then null;end;
 begin perform public.worker_ack_capital_capture_purge_v1(repeat('z',64),(ticket->>'purgeId')::uuid,ticket->>'purgeCapability',true);raise exception 'metadata present ACK passed';exception when invalid_parameter_value then null;end;
end; $$;
reset role;
do $$ declare t text;begin
 foreach t in array array['capital_body_origins','capital_body_source_pins','capital_body_invocation_inputs','capital_body_input_components','capital_body_accepted_invocations','capital_body_bases','capital_body_retention_wakes'] loop
 if not(select relrowsecurity and relforcerowsecurity from pg_class where oid=to_regclass('private.'||t))
 or has_table_privilege('authenticated','private.'||t,'select') or has_table_privilege('authenticated','private.'||t,'insert') or has_table_privilege('authenticated','private.'||t,'update') or has_table_privilege('authenticated','private.'||t,'delete') then raise exception 'body RLS/grants %',t;end if;
 if exists(select 1 from information_schema.columns where table_schema='private' and table_name=t and column_name in ('content','payload','raw_body','canonical_body','context')) then raise exception 'body content permanently stored %',t;end if;
 end loop;
 if has_function_privilege('anon','public.worker_prepare_capital_body_v1(uuid,text,uuid,text,uuid,jsonb,text)','execute') or has_function_privilege('service_role','public.worker_prepare_capital_body_v1(uuid,text,uuid,text,uuid,jsonb,text)','execute') then raise exception 'public body RPC broadly granted';end if;
 if exists(select 1 from public.audit_events where organization_id='20000000-0000-4000-8000-000000000991' and resource_type like 'capital_body_%' and metadata<>jsonb_build_object('operation',upper(action))) then raise exception 'body content in audit';end if;
end; $$;
select 'capital_body_retention' as test,'PASS' as result;
rollback;
