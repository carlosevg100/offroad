-- Operational attempt-ledger SQL contract. This reuses real workspace/source/contribution/job commands.
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
end; $$;
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
end; $$;
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
end; $$;


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
-- Direct Storage upload is bound to the request's exact live job capability.
-- SQL metadata insertion proves RLS only; separate HTTP gates prove physical bytes.
do $$ declare f record;j record;valid_headers jsonb;bad_headers jsonb;begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 valid_headers:=jsonb_build_object('x-offroad-workspace','20000000-0000-4000-8000-000000000991','x-offroad-job-id',j.job_id::text,'x-offroad-capability',j.capability);
 perform set_config('storage.operation','object.upload',true);
 for bad_headers in select value from jsonb_array_elements(jsonb_build_array(
 '{}'::jsonb,
 valid_headers-'x-offroad-job-id',valid_headers-'x-offroad-capability',
 valid_headers||jsonb_build_object('x-offroad-job-id',gen_random_uuid()::text),
 valid_headers||jsonb_build_object('x-offroad-capability',repeat('x',64)),
 valid_headers||jsonb_build_object('x-offroad-job-id',123),
 valid_headers||jsonb_build_object('x-offroad-capability',true),
 valid_headers||jsonb_build_object('x-offroad-workspace','20000000-0000-4000-8000-000000000992'))) loop
 perform set_config('request.headers',bad_headers::text,true);
 if private.worker_can_access_capital_public_payload_v1('capital-input-capture',f.allocation->>'path','upload') then raise exception 'direct Storage upload accepted unbound request';end if;
 begin
 insert into storage.objects(bucket_id,name,metadata,version) values('capital-input-capture',f.allocation->>'path',jsonb_build_object('size',(f.allocation->>'byteLength')::bigint,'mimetype','application/json'),'body-rls-rejected');
 raise exception 'direct Storage upload bypassed job capability';exception when insufficient_privilege then null;end;
 end loop;
 perform set_config('request.headers',valid_headers::text,true);
 if not private.worker_can_access_capital_public_payload_v1('capital-input-capture',f.allocation->>'path','upload') then raise exception 'exact Storage upload authority rejected';end if;
 begin
 insert into storage.objects(bucket_id,name,metadata,version) values('capital-input-capture',f.allocation->>'path',jsonb_build_object('size',(f.allocation->>'byteLength')::bigint,'mimetype','application/json'),'body-rls-accepted');
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 perform set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000991"}',true);
end; $$;
reset role;
-- Metadata fixture ONLY. HTTP eval must prove that bytes exist and match worker SHA.
insert into storage.objects(bucket_id,name,metadata,version)
 select 'capital-input-capture',allocation->>'path',jsonb_build_object('size',(allocation->>'byteLength')::bigint,'mimetype','application/json'),'body-sql-v1' from body_test_fixture;
update body_test_fixture f set object_id=o.id from storage.objects o where o.bucket_id='capital-input-capture' and o.name=f.allocation->>'path';
set local role authenticated;
do $$ declare f record;j record;scope jsonb;begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 scope:=public.worker_read_capital_body_allocation_v1(j.job_id,j.capability,(f.allocation->>'allocationId')::uuid);
 if scope->>'retentionState'<>'allocated' or scope->>'storageObjectId' is distinct from f.object_id::text
 or scope->>'storageVersion'<>'body-sql-v1' or scope->>'path' is distinct from f.allocation->>'path'
 or scope->>'payloadFingerprint' is distinct from f.allocation->>'payloadFingerprint'
 or scope->>'byteLength' is distinct from f.allocation->>'byteLength' or scope->'retainedPayloadId'<>'null'::jsonb
 or scope?'canonicalBody' then raise exception 'allocated server scope not physical/exact';end if;
 begin perform public.worker_read_capital_body_allocation_v1(j.job_id,repeat('x',64),(f.allocation->>'allocationId')::uuid);raise exception 'server scope wrong capability admitted';exception when insufficient_privilege then null;end;
 begin perform public.worker_read_capital_body_allocation_v1(gen_random_uuid(),j.capability,(f.allocation->>'allocationId')::uuid);raise exception 'server scope wrong job admitted';exception when insufficient_privilege then null;end;
 begin perform public.worker_read_capital_body_allocation_v1(j.job_id,j.capability,gen_random_uuid());raise exception 'server scope caller allocation admitted';exception when insufficient_privilege then null;end;
 begin perform public.worker_read_capital_body_allocation_v1(j.job_id,j.capability,null);raise exception 'null server scope admitted';exception when invalid_parameter_value then null;end;
 begin perform public.worker_read_capital_public_payload_allocation_v1(j.job_id,j.capability,(f.allocation->>'allocationId')::uuid);raise exception 'wrong scope family admitted';exception when insufficient_privilege then null;end;
end; $$;
do $$ declare f record;j record;r jsonb;begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 begin perform public.worker_commit_capital_body_v1(j.job_id,j.capability,(f.allocation->>'allocationId')::uuid,f.object_id,'wrong',f.allocation->>'payloadFingerprint',(f.allocation->>'byteLength')::bigint);raise exception 'wrong Storage version accepted';exception when invalid_parameter_value then null;end;
 r:=public.worker_commit_capital_body_v1(j.job_id,j.capability,(f.allocation->>'allocationId')::uuid,f.object_id,'body-sql-v1',f.allocation->>'payloadFingerprint',(f.allocation->>'byteLength')::bigint);
 if r->>'retentionState'<>'retained' or r?'canonicalBody' then raise exception 'retained DTO includes raw bytes';end if;
 update pg_temp.body_test_fixture set retained=r;
 if public.worker_read_capital_body_allocation_v1(j.job_id,j.capability,(f.allocation->>'allocationId')::uuid) is distinct from r||jsonb_build_object('replayed',true) then raise exception 'retained server scope changed identity';end if;
 if public.worker_commit_capital_body_v1(j.job_id,j.capability,(f.allocation->>'allocationId')::uuid,f.object_id,'body-sql-v1',f.allocation->>'payloadFingerprint',(f.allocation->>'byteLength')::bigint)->>'replayed'<>'true' then raise exception 'commit idempotency failed';end if;
 if public.worker_read_capital_body_v1(j.job_id,j.capability,(r->>'retainedPayloadId')::uuid)->>'storageObjectId' is distinct from f.object_id::text then raise exception 'read receipt failed';end if;
 r:=public.worker_prepare_capital_body_v1(j.job_id,j.capability,'b09d0000-0000-4000-9000-000000000001','contribution_input',f.revision_id);
 if r->>'retentionState'<>'retained' or r?'canonicalBody' or r->>'replayed'<>'true' then raise exception 'committed prepare replay failed';end if;
end; $$;
-- All direct GET/HEAD/info are denied, including the correct live job.
-- Physical readback requires the server POST and its two fresh scope checks.
do $$ declare f record;j record;valid_headers jsonb;bad_headers jsonb;op text;n bigint;begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 valid_headers:=jsonb_build_object('x-offroad-workspace','20000000-0000-4000-8000-000000000991','x-offroad-job-id',j.job_id::text,'x-offroad-capability',j.capability);
 foreach op in array array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info'] loop
 perform set_config('storage.operation',op,true);
 perform set_config('request.headers',valid_headers::text,true);
 select count(*) into n from storage.objects where bucket_id='capital-input-capture' and name=f.allocation->>'path';
 if n<>0 then raise exception 'typed Storage direct read permitted for correct live job %',op;end if;
 for bad_headers in select value from jsonb_array_elements(jsonb_build_array(
 '{}'::jsonb,valid_headers-'x-offroad-job-id',valid_headers-'x-offroad-capability',
 valid_headers||jsonb_build_object('x-offroad-job-id',gen_random_uuid()::text),
 valid_headers||jsonb_build_object('x-offroad-capability',repeat('x',64)),
 valid_headers||jsonb_build_object('x-offroad-job-id',123),
 valid_headers||jsonb_build_object('x-offroad-capability',true),
 valid_headers||jsonb_build_object('x-offroad-workspace','20000000-0000-4000-8000-000000000992'))) loop
 perform set_config('request.headers',bad_headers::text,true);
 select count(*) into n from storage.objects where bucket_id='capital-input-capture' and name=f.allocation->>'path';
 if n<>0 then raise exception 'direct Storage read bypassed job capability for %',op;end if;
 end loop;
 end loop;
 perform set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000991"}',true);
end; $$;
reset role;
-- Malformed/non-object header GUC cannot become Storage authority. This direct
-- owner call tests parser behavior, not a client function grant.
do $$ declare f record;h text;begin
 select * into strict f from pg_temp.body_test_fixture;
 foreach h in array array['not-json','[]','null','"string"'] loop
 perform set_config('request.headers',h,true);
 if private.capital_body_storage_job_authority_v1((f.allocation->>'allocationId')::uuid) then raise exception 'malformed Storage headers authorized';end if;
 end loop;
 perform set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000991"}',true);
end; $$;
-- Private origins store exact direct + ancestor rights/bindings, never content.
do $$ declare f record;begin
 select * into strict f from pg_temp.body_test_fixture;
 if (select count(distinct source_version_id) from private.capital_body_source_pins where origin_id=(select origin_id from private.capital_body_bases where id=(f.retained->>'bodyBasisId')::uuid))<>2 then raise exception 'ancestry not pinned';end if;
 if exists(select 1 from private.capital_public_payload_allocations where id=(f.allocation->>'allocationId')::uuid and (delivery_id is not null or license_id is not null or licensing_organization_id is not null or content_kind<>'typed_body')) then raise exception 'typed body fabricated public license';end if;
end; $$;
create function pg_temp.ledger_route(provider_name text) returns jsonb language sql as $$
 select jsonb_build_object('provider',provider_name,'model',case when provider_name='anthropic' then 'claude-sonnet-5' else 'gpt-5.6-terra' end,
 'accountRef','synthetic-body-ledger-account','projectRef','synthetic-body-ledger-project','credentialBinding','synthetic-body-ledger-credential',
 'endpoint',case when provider_name='anthropic' then 'https://api.anthropic.com/v1/messages' else 'https://api.openai.com/v1/responses' end,'region','global');
$$;
create function pg_temp.ledger_attempt(invocation uuid,fallback_flag boolean default false,previous_invocation uuid default null) returns jsonb language sql as $$
 select jsonb_build_object('adapterInputVersion','gateway-adapter-input.v1','task','preliminary_understanding','schemaName','origination_senior_readout_v2',
 'requestFingerprint',case when fallback_flag then repeat('6',64) else repeat('5',64) end,'inputFingerprint',repeat('7',64),'promptFingerprint',repeat('8',64),
 'invocationId',invocation,'retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',fallback_flag,'reservationUsd',0.1)
 ||case when previous_invocation is null then '{}'::jsonb else jsonb_build_object('previousInvocationId',previous_invocation) end;
$$;
do $$ declare provider_name text;resource_name text;route jsonb;seconds integer;document jsonb;begin
 foreach provider_name in array array['anthropic','openai'] loop
 route:=pg_temp.ledger_route(provider_name);seconds:=case when provider_name='anthropic' then 2592000 else 0 end;
 foreach resource_name in array array['inference','prompt_cache','schema_cache'] loop
 document:=route-'model'||jsonb_build_object('id',gen_random_uuid(),'policyVersion','offroad-provider-retention-v2','resource',resource_name,
 'models',jsonb_build_array(route->>'model'),'purposes',jsonb_build_array('case_analysis'),'classifications',jsonb_build_array('restricted'),'rights',jsonb_build_array('process'),
 'trainingUse','prohibited','eligibility','supported','zeroRetention','not_contracted','revokedAt',null,'reviewedBy','synthetic-test-operator',
 'reviewedAt',clock_timestamp()-interval '1 minute','validThrough',clock_timestamp()+interval '2 days',
 'retention',jsonb_build_object('requestContentSeconds',seconds,'abuseMonitoringSeconds',seconds,'applicationStateSeconds',seconds,'cacheSeconds',seconds,'metadataSeconds',seconds,'exceptions','[]'::jsonb),
 'evidence',jsonb_build_array(jsonb_build_object('kind','provider_terms','reference','synthetic-fixture-not-a-commercial-assertion','sha256',repeat('1',64)),
 jsonb_build_object('kind','account_configuration','reference','synthetic-fixture-configuration','sha256',repeat('2',64)),
 jsonb_build_object('kind','credential_binding','reference','synthetic-fixture-credential','sha256',repeat('3',64))));
 perform private.record_provider_processing_assurance_v1(document,'SQL synthetic rollback fixture for body attempt ledger');
 end loop;
 end loop;
end; $$;


-- A distinct operator-owned route retains for900 seconds. Later narrowing
-- its already-sent source operating horizon must not restart that provider TTL.
do $$ declare x record;document jsonb;begin
 for x in select pa.document from private.provider_processing_assurances pa where pa.account_ref='synthetic-body-ledger-account' and pa.provider='openai' loop
 document:=x.document||jsonb_build_object('id',gen_random_uuid(),'accountRef','synthetic-body-outcomes-postsend',
 'retention',jsonb_build_object('requestContentSeconds',900,'abuseMonitoringSeconds',900,'applicationStateSeconds',900,'cacheSeconds',900,'metadataSeconds',900,'exceptions','[]'::jsonb));
 perform private.record_provider_processing_assurance_v1(document,'SQL synthetic post-send fixed retention window fixture');
 end loop;
end; $$;

-- No prior input exists for the retained contribution in this fixture. Drain real
-- wakes through the actual purger before opening the new prospective operation.
select public.worker_claim_capital_capture_purge_v1(repeat('z',64),100);
create temp table outcome_fixture(primary_decision jsonb,fallback_decision jsonb,input_receipt jsonb,outcome_dto jsonb,outcome_receipt jsonb);
grant all on outcome_fixture to authenticated;
insert into outcome_fixture default values;

create function pg_temp.outcome_observation_v1(p_decision jsonb,p_input jsonb,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.capital_body_gateway_attempts;prior uuid;dto jsonb;
begin
 select * into strict a from private.capital_body_gateway_attempts x where x.id=(p_decision->>'attemptReceiptId')::uuid;
 select invocation_id into prior from private.capital_body_gateway_attempts x where x.organization_id=a.organization_id and x.id=a.previous_attempt_id;
 dto:=jsonb_build_object('schemaVersion','gateway-attempt-outcome.v1','fingerprintVersion','gateway-attempt-outcome-fingerprint.v1',
 'outcomeFingerprint',repeat('0',64),'invocationId',a.invocation_id,'task',a.task,'provider',a.provider,'configuredModel',a.model,
 'schemaName',a.schema_name,'adapterInputVersion',a.adapter_input_version,'requestFingerprint',a.adapter_request_fingerprint,
 'inputFingerprint',a.input_fingerprint,'promptFingerprint',a.prompt_fingerprint,'previousInvocationId',prior,
 'retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',a.used_provider_fallback,'processingDecisionId',a.processing_decision_id,
 'inputAttestationReceiptId',p_input->>'receiptId','fromCassette',false,'outcome',p_kind,
 'failureCode',case p_kind when 'accepted' then null when 'invalid_output' then 'schema_invalid' when 'provider_error' then 'provider_failure' when 'timeout' then 'provider_timeout' else 'provider_refusal' end,
 'outputFingerprintVersion',case when p_kind='accepted' then 'gateway-parsed-output.v1' else null end,
 'outputFingerprint',case when p_kind='accepted' then repeat('e',64) else null end,
 'reportedModel',case when p_kind='accepted' then a.model else null end,
 'validationIssueCodeFingerprint',case when p_kind='invalid_output' then repeat('f',64) else null end,
 'reservationMicroUsd',a.reservation_micro_usd,'costMicroUsd',null,'exposureMicroUsd',a.reservation_micro_usd,'costStatus','unknown',
 'inputTokens',null,'outputTokens',null,'cachedInputTokens',null,'latencyMillis',11);
 return dto||jsonb_build_object('outcomeFingerprint',private.capital_body_attempt_outcome_fingerprint_v1(dto));
end; $$;

create function pg_temp.outcome_rehash_v1(p_dto jsonb) returns jsonb
language sql security definer set search_path='' as $$
 select p_dto||jsonb_build_object('outcomeFingerprint',private.capital_body_attempt_outcome_fingerprint_v1(p_dto));
$$;

create function pg_temp.outcome_fresh_basis_v1(p_label text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f record;j record;r uuid:=gen_random_uuid();a jsonb;object_id uuid;retained jsonb;poll_no integer;poll_result jsonb;
begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 perform public.submit_work_contribution_v1(f.work_id,gen_random_uuid(),r,null,null,'Synthetic outcomes contribution '||p_label,array[f.source_id]);
 a:=public.worker_prepare_capital_body_v1(j.job_id,j.capability,gen_random_uuid(),'contribution_input',r);
 -- SQL metadata fixture only; actual bytes/POST/purge are separate HTTP gates.
 insert into storage.objects(bucket_id,name,metadata,version) values('capital-input-capture',a->>'path',
 jsonb_build_object('size',(a->>'byteLength')::bigint,'mimetype','application/json'),'outcome-sql-v1') returning id into object_id;
 retained:=public.worker_commit_capital_body_v1(j.job_id,j.capability,(a->>'allocationId')::uuid,object_id,'outcome-sql-v1',a->>'payloadFingerprint',(a->>'byteLength')::bigint);
 for poll_no in 1..10 loop
 poll_result:=public.worker_claim_capital_capture_purge_v1(repeat('z',64),100);
 if jsonb_array_length(poll_result->'items')<>0 then raise exception 'fresh fixture premature erasure';end if;
 exit when not private.capital_body_wakes_pending_v1('20000000-0000-4000-8000-000000000991',(a->>'allocationId')::uuid);
 end loop;
 return retained;
end; $$;
set local role authenticated;

-- Primary SQL denial is real and has no fictitious dispatch/outcome. The fallback
-- uses its own allowed decision and one-time claim under the same durable root.
do $$ declare f record;j record;components jsonb;primary_dto jsonb;fallback_dto jsonb;claim jsonb;replay jsonb;dto jsonb;receipt jsonb;accepted_dto jsonb;
begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',f.retained->>'retainedPayloadId'));
 primary_dto:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt('b0af0000-0000-4000-9000-000000000001'),pg_temp.ledger_route('anthropic'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 if primary_dto->>'allowed'<>'false' or primary_dto->>'schemaVersion'<>'capital-body-processing-decision.v2' then raise exception 'expected SQLdenied primary';end if;
 begin perform public.worker_record_capital_body_input_v3(j.job_id,j.capability,(primary_dto->>'attemptReceiptId')::uuid);raise exception 'denied dispatch granted';exception when insufficient_privilege then null;end;
 fallback_dto:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt('b0af0000-0000-4000-9000-000000000002',true,(primary_dto->>'invocationId')::uuid),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 if fallback_dto->>'allowed'<>'true' or fallback_dto->>'operationId' is distinct from primary_dto->>'operationId'
 or fallback_dto->>'rootAttemptReceiptId' is distinct from primary_dto->>'attemptReceiptId' then raise exception 'denied fallback operation binding';end if;
 begin perform public.worker_record_capital_body_input_v2(j.job_id,j.capability,(fallback_dto->>'attemptReceiptId')::uuid);raise exception 'v2 dispatched new regime';exception when insufficient_privilege then null;end;
 claim:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(fallback_dto->>'attemptReceiptId')::uuid);
 replay:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(fallback_dto->>'attemptReceiptId')::uuid);
 if claim->>'dispatchAllowed'<>'true' or claim->>'replayed'<>'false' or replay->>'dispatchAllowed'<>'false' or replay->>'replayed'<>'true'
 or claim->>'dispatchClaimId' is distinct from replay->>'dispatchClaimId' or claim->>'receiptId' is distinct from replay->>'receiptId'
 or claim->>'reservationMicroUsd'<>'100000' or (claim->>'serverReservationMicroUsd')::bigint<100000 or claim->>'rendererPolicyFingerprint'!~'^[a-f0-9]{64}$' then
 raise exception 'atomic grant/replay/server budget wrong';end if;
 -- No outcome means no accepted authority, even with a forged parsed-output hash.
 accepted_dto:=jsonb_build_object('schemaVersion','gateway-accepted-invocation.v1','invocationId',claim->>'invocationId','adapterInputVersion','gateway-adapter-input.v1',
 'adapterRequestFingerprint',claim->>'requestFingerprint','outputFingerprintVersion','gateway-parsed-output.v1','outputFingerprint',repeat('e',64),
 'inputFingerprint',repeat('7',64),'promptFingerprint',repeat('8',64),'provider','openai','configuredModel','gpt-5.6-terra','reportedModel','gpt-5.6-terra',
 'schemaName','origination_senior_readout_v2','retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',true,'fromCassette',false,'inputAttestationReceiptId',claim->>'receiptId');
 begin perform public.worker_record_capital_body_accepted_v1(j.job_id,j.capability,(claim->>'receiptId')::uuid,accepted_dto);raise exception 'accepted without outcome';exception when insufficient_privilege then null;end;
 dto:=pg_temp.outcome_observation_v1(fallback_dto,claim,'accepted');
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,repeat('x',64),(fallback_dto->>'attemptReceiptId')::uuid,dto);raise exception 'wrongcap outcome';exception when insufficient_privilege then null;end;
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(primary_dto->>'attemptReceiptId')::uuid,dto);raise exception 'denied sent outcome';exception when insufficient_privilege then null;end;
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(fallback_dto->>'attemptReceiptId')::uuid,dto||'{"rawText":"private-canary"}');raise exception 'raw canary admitted';exception when invalid_parameter_value then null;end;
 receipt:=public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(fallback_dto->>'attemptReceiptId')::uuid,dto);
 replay:=public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(fallback_dto->>'attemptReceiptId')::uuid,dto);
 if receipt->>'operationId' is distinct from fallback_dto->>'operationId' or receipt->>'inputReceiptId' is distinct from claim->>'receiptId'
 or receipt->>'outcomeFingerprint' is distinct from dto->>'outcomeFingerprint' or receipt->>'replayed'<>'false' or replay->>'replayed'<>'true'
 or receipt->>'receiptId' is distinct from replay->>'receiptId' then raise exception 'outcome receipt/replay wrong';end if;
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(fallback_dto->>'attemptReceiptId')::uuid,pg_temp.outcome_observation_v1(fallback_dto,claim,'refusal'));raise exception 'accepted rewritten failure';exception when unique_violation then null;end;
 perform public.worker_record_capital_body_accepted_v1(j.job_id,j.capability,(claim->>'receiptId')::uuid,accepted_dto);
 -- New root/factory and old input endpoints cannot restart this same origin.
 begin perform public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);raise exception 'new UUID reset operation';exception when insufficient_privilege then null;end;
 begin perform public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);raise exception 'v1 reset operation';exception when insufficient_privilege then null;end;
 begin perform public.worker_record_capital_body_input_v1(j.job_id,j.capability,gen_random_uuid(),repeat('1',64),repeat('2',64),repeat('3',64),'openai','gpt-5.6-terra',components);raise exception 'inputv1 reset operation';exception when insufficient_privilege then null;end;
 update pg_temp.outcome_fixture set primary_decision=primary_dto,fallback_decision=fallback_dto,input_receipt=claim,outcome_dto=dto,outcome_receipt=receipt;
end; $$;

-- A sent failure must be closed before a fallback is eligible. No fake output
-- body is stored. The SQL tuple identity is compared to the actual dispatch rows.
do $$ declare j record;r jsonb;components jsonb;primary_decision jsonb;fallback_decision jsonb;claim jsonb;fallback_claim jsonb;dto jsonb;receipt jsonb;
begin
 select * into strict j from pg_temp.capture_job_fixture;r:=pg_temp.outcome_fresh_basis_v1('sent-failure');
 components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',r->>'retainedPayloadId'));
 -- OpenAI is allowed; the return path can use an allowed Anthropic control document
 -- created separately below, without changing the installed production policy.
 primary_decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 claim:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(primary_decision->>'attemptReceiptId')::uuid);
 begin perform public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid(),true,(primary_decision->>'invocationId')::uuid),pg_temp.ledger_route('anthropic'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);raise exception 'unclosed failure permitted fallback';exception when insufficient_privilege then null;end;
 dto:=pg_temp.outcome_observation_v1(primary_decision,claim,'provider_error');
 receipt:=public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(primary_decision->>'attemptReceiptId')::uuid,dto);
 fallback_decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid(),true,(primary_decision->>'invocationId')::uuid),pg_temp.ledger_route('anthropic'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 if fallback_decision->>'allowed'<>'false' then raise exception 'fallback skipped real provider MIN';end if;
 begin perform public.worker_record_capital_body_input_v3(j.job_id,j.capability,(fallback_decision->>'attemptReceiptId')::uuid);raise exception 'denied matrix fallback sent';exception when insufficient_privilege then null;end;
end; $$;
reset role;
-- Add a legitimate synthetic operator assurance for the sent-failure→allowed
-- fallback positive case. Old documents are immutable; the new account is exact.
do $$ declare x record;document jsonb;begin
 for x in select pa.document from private.provider_processing_assurances pa where pa.account_ref='synthetic-body-ledger-account' and pa.provider='anthropic' loop
 document:=x.document||jsonb_build_object('id',gen_random_uuid(),'accountRef','synthetic-body-outcomes-allowed',
 'retention',jsonb_build_object('requestContentSeconds',0,'abuseMonitoringSeconds',0,'applicationStateSeconds',0,'cacheSeconds',0,'metadataSeconds',0,'exceptions','[]'::jsonb));
 perform private.record_provider_processing_assurance_v1(document,'Synthetic outcomes allowed fallback rollback fixture');
 end loop;
end; $$;
set local role authenticated;
do $$ declare j record;r jsonb;components jsonb;primary_decision jsonb;fallback_decision jsonb;claim jsonb;child_claim jsonb;route jsonb;dto jsonb;
begin
 select * into strict j from pg_temp.capture_job_fixture;r:=pg_temp.outcome_fresh_basis_v1('failure-allowed-fallback');
 components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',r->>'retainedPayloadId'));
 primary_decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 claim:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(primary_decision->>'attemptReceiptId')::uuid);
 dto:=pg_temp.outcome_observation_v1(primary_decision,claim,'invalid_output');
 perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(primary_decision->>'attemptReceiptId')::uuid,dto);
 route:=pg_temp.ledger_route('anthropic')||jsonb_build_object('accountRef','synthetic-body-outcomes-allowed');
 fallback_decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid(),true,(primary_decision->>'invocationId')::uuid),route,array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 if fallback_decision->>'allowed'<>'true' then raise exception 'real failure→fallback matrix denied';end if;
 child_claim:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(fallback_decision->>'attemptReceiptId')::uuid);
 if child_claim->>'dispatchAllowed'<>'true' or child_claim->>'operationId' is distinct from claim->>'operationId' then raise exception 'failure child claim binding wrong';end if;
 perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(fallback_decision->>'attemptReceiptId')::uuid,pg_temp.outcome_observation_v1(fallback_decision,child_claim,'accepted'));
end; $$;

reset role;
-- A child eligibility decision is not a reusable dispatch grant: primary
-- revocation after child authorization must deny its claim and replay.
do $$ declare j record;r jsonb;components jsonb;primary_decision jsonb;child_decision jsonb;claim jsonb;child_attempt jsonb;child_route jsonb;begin
 select * into strict j from pg_temp.capture_job_fixture;r:=pg_temp.outcome_fresh_basis_v1('preauthorized-child-revocation');
 components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',r->>'retainedPayloadId'));
 primary_decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 claim:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(primary_decision->>'attemptReceiptId')::uuid);
 perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(primary_decision->>'attemptReceiptId')::uuid,pg_temp.outcome_observation_v1(primary_decision,claim,'refusal'));
 child_attempt:=pg_temp.ledger_attempt(gen_random_uuid(),true,(primary_decision->>'invocationId')::uuid);
 child_route:=pg_temp.ledger_route('anthropic')||jsonb_build_object('accountRef','synthetic-body-outcomes-allowed');
 child_decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,child_attempt,child_route,array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 if child_decision->>'allowed'<>'true' then raise exception 'child-before-primary-revocation not allowed';end if;
 begin
 perform private.revoke_provider_processing_assurance_v1((primary_decision#>>'{assuranceIds,0}')::uuid,'Synthetic primary revocation after child eligibility fixture');
 begin perform public.worker_record_capital_body_input_v3(j.job_id,j.capability,(child_decision->>'attemptReceiptId')::uuid);raise exception 'preauthorized child dispatched after primary revocation';exception when insufficient_privilege then
 if sqlerrm<>'capital_body_processing_denied' then raise;end if;end;
 begin perform public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,child_attempt,child_route,array['inference','prompt_cache','schema_cache'],'case_analysis',components);raise exception 'preauthorized child replayed after primary revocation';exception when insufficient_privilege then
 if sqlerrm<>'capital_body_processing_denied' then raise;end if;end;
 if exists(select 1 from private.capital_body_operation_dispatches d where d.attempt_id=(child_decision->>'attemptReceiptId')::uuid) then raise exception 'denied child persisted claim';end if;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 -- Restoring the fixture subtransaction does not fabricate a new operation.
 claim:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(child_decision->>'attemptReceiptId')::uuid);
 begin
 perform private.revoke_provider_processing_assurance_v1((primary_decision#>>'{assuranceIds,0}')::uuid,'Synthetic primary revocation after child dispatch fixture');
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(child_decision->>'attemptReceiptId')::uuid,pg_temp.outcome_observation_v1(child_decision,claim,'accepted'));raise exception 'child outcome bypassed primary revocation';exception when insufficient_privilege then
 if sqlerrm<>'capital_body_processing_denied' then raise;end if;end;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
end; $$;
set local role authenticated;

-- Old allowed-but-unsent attempts must not use old input endpoints after a new
-- regime operation exists. Conversely a genuine old input prevents a fresh v2
-- budget. Both are real origins/receipts, not an invocation-hash comparison.
do $$ declare j record;r jsonb;components jsonb;legacy_decision jsonb;new_decision jsonb;legacy_receipt jsonb;
begin
 select * into strict j from pg_temp.capture_job_fixture;r:=pg_temp.outcome_fresh_basis_v1('legacy-allowed-unsent');
 components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',r->>'retainedPayloadId'));
 legacy_decision:=public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 new_decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 begin perform public.worker_record_capital_body_input_v2(j.job_id,j.capability,(legacy_decision->>'attemptReceiptId')::uuid);raise exception 'preexisting legacy attempt dispatched after operation';exception when insufficient_privilege then null;end;
 r:=pg_temp.outcome_fresh_basis_v1('legacy-already-sent');components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',r->>'retainedPayloadId'));
 legacy_decision:=public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 legacy_receipt:=public.worker_record_capital_body_input_v2(j.job_id,j.capability,(legacy_decision->>'attemptReceiptId')::uuid);
 begin perform public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);raise exception 'old possible-send became fresh budget';exception when insufficient_privilege then null;end;
 if public.worker_record_capital_body_input_v2(j.job_id,j.capability,(legacy_decision->>'attemptReceiptId')::uuid) is distinct from legacy_receipt then raise exception 'historical legacy input replay lost';end if;
end; $$;

-- Zero/understated caller observation does not lower the authoritative claim.
-- The worker separately compares the real gateway estimate; SQL uses its pinned
-- physical-byte upperbound, not this caller observation as its budget authority.
do $$ declare j record;r jsonb;components jsonb;decision jsonb;claim jsonb;attempt jsonb;
begin
 select * into strict j from pg_temp.capture_job_fixture;r:=pg_temp.outcome_fresh_basis_v1('zero-reserve');
 components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',r->>'retainedPayloadId'));
 attempt:=pg_temp.ledger_attempt(gen_random_uuid())||jsonb_build_object('reservationUsd',0);
 decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,attempt,pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 claim:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid);
 if claim->>'reservationMicroUsd'<>'0' or(claim->>'serverReservationMicroUsd')::bigint<=0 then raise exception 'observed zero reduced server claim';end if;
end; $$;
reset role;
do $$ declare j record;r jsonb;components jsonb;decision jsonb;claim jsonb;bound jsonb;original_job public.processing_jobs;physical_length bigint;
begin
 select * into strict j from pg_temp.capture_job_fixture;select * into strict original_job from public.processing_jobs x where x.id=j.job_id;
 r:=pg_temp.outcome_fresh_basis_v1('bound-policy');components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',r->>'retainedPayloadId'));
 physical_length:=(r->>'byteLength')::bigint;bound:=private.capital_body_dispatch_policy_v1('openai','gpt-5.6-terra',physical_length);
 decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid())||jsonb_build_object('reservationUsd',0.0000001),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 claim:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid);
 if claim->>'reservationMicroUsd'<>'1' or claim->>'serverReservationMicroUsd' is distinct from bound->>'serverBoundMicroUsd'
 or claim->>'rendererPolicyFingerprint' is distinct from bound->>'fingerprint' then raise exception 'server policy/rounding claim wrong';end if;
 begin perform private.capital_body_dispatch_policy_v1('openai','gpt-5.6-terra',100001);raise exception 'bytecap bypass';exception when insufficient_privilege then null;end;
 begin perform private.capital_body_dispatch_policy_v1('openai','unregistered-model',physical_length);raise exception 'unregistered pricing';exception when insufficient_privilege then null;end;
end; $$;
set local role authenticated;

-- Measured cheaper success/failure cannot release the server's reservation. Two
-- claims of 0.6USD exceed the durable 1USD even if the core's measured cost is tiny.
do $$ declare j record;r jsonb;components jsonb;primary_decision jsonb;child_decision jsonb;claim jsonb;attempt jsonb;dto jsonb;route jsonb;
begin
 select * into strict j from pg_temp.capture_job_fixture;r:=pg_temp.outcome_fresh_basis_v1('durable-budget');
 components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',r->>'retainedPayloadId'));
 attempt:=pg_temp.ledger_attempt(gen_random_uuid())||jsonb_build_object('reservationUsd',0.6);
 primary_decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,attempt,pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 claim:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(primary_decision->>'attemptReceiptId')::uuid);
 dto:=pg_temp.outcome_observation_v1(primary_decision,claim,'refusal')||jsonb_build_object('costStatus','measured','costMicroUsd',10,'inputTokens',1,'outputTokens',1,'cachedInputTokens',0);
 -- Hash is recomputed by an owner pg_temp helper below, never trusted by echo.
 dto:=pg_temp.outcome_rehash_v1(dto);
 perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(primary_decision->>'attemptReceiptId')::uuid,dto);
 route:=pg_temp.ledger_route('anthropic')||jsonb_build_object('accountRef','synthetic-body-outcomes-allowed');
 child_decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid(),true,(primary_decision->>'invocationId')::uuid)||jsonb_build_object('reservationUsd',0.6),route,array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 if child_decision->>'allowed'<>'true' then raise exception 'budget test matrix was denied';end if;
 begin perform public.worker_record_capital_body_input_v3(j.job_id,j.capability,(child_decision->>'attemptReceiptId')::uuid);raise exception 'durable reservation released by cheap measured cost';exception when insufficient_privilege then
 if sqlerrm<>'capital_body_budget_denied' then raise;end if;end;
end; $$;

-- Current source authority is mandatory even after an actual dispatch claim.
-- Refusal metadata cannot become a privileged factual write after revocation.
do $$ declare j record;r jsonb;components jsonb;decision jsonb;claim jsonb;dto jsonb;f record;current_revision integer;before_receipt uuid;
begin
 select * into strict j from pg_temp.capture_job_fixture;select * into strict f from pg_temp.body_test_fixture;
 r:=pg_temp.outcome_fresh_basis_v1('postsend-revocation');components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',r->>'retainedPayloadId'));
 decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 claim:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid);
 dto:=pg_temp.outcome_observation_v1(decision,claim,'timeout');
 begin
 -- Real rights command; this subtransaction rolls back after the assertions.
 perform public.set_source_rights_v1(f.source_id,1,array['read','store','derive'],array['analysis'],clock_timestamp()+interval '40 days',clock_timestamp()+interval '35 days',gen_random_uuid(),repeat('4',64));
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid,dto);raise exception 'revoked source wrote factual outcome';exception when insufficient_privilege then null;end;
 begin perform public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid(),true,(decision->>'invocationId')::uuid),pg_temp.ledger_route('anthropic'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);raise exception 'revoked source dispatched child';exception when insufficient_privilege then null;end;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 -- No hidden resend to settle the timeout; the same observation closes once.
 perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid,dto);
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid,pg_temp.outcome_observation_v1(decision,claim,'accepted'));raise exception 'timeout promoted to accepted';exception when unique_violation then null;end;
end; $$;
reset role;

-- MIN-operating proof was inherited unchanged from the published ledger. A
-- provider replay cannot renew it. Post-send outcome checks current pinned
-- assurance identities without restarting their admitted retention window.
do $$ declare j record;r jsonb;components jsonb;decision jsonb;claim jsonb;dto jsonb;before_deadline timestamptz;current_job public.processing_jobs;poll jsonb;n integer;
begin
 select * into strict j from pg_temp.capture_job_fixture;r:=pg_temp.outcome_fresh_basis_v1('postsend-provider-policy');
 components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',r->>'retainedPayloadId'));
 decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 claim:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid);
 select observed_deadline into before_deadline from private.capital_body_gateway_attempts a where a.id=(decision->>'attemptReceiptId')::uuid;
 begin
 perform private.revoke_provider_processing_assurance_v1((decision#>>'{assuranceIds,0}')::uuid,'Synthetic post-send outcomes revocation rollback');
 begin perform public.worker_record_capital_body_input_v3(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid);raise exception 'provider revoked replay admitted';exception when serialization_failure then if sqlerrm<>'capital_body_processing_changed' then raise;end if;end;
 dto:=pg_temp.outcome_observation_v1(decision,claim,'refusal');
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid,dto);raise exception 'revoked assurance wrote factual outcome';exception when insufficient_privilege then
 if sqlerrm<>'capital_body_processing_denied' then raise;end if;end;
 begin perform public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid(),true,(decision->>'invocationId')::uuid),pg_temp.ledger_route('anthropic'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);raise exception 'revoked assurance dispatched child';exception when insufficient_privilege then null;end;
 if exists(select 1 from private.capital_body_attempt_outcomes o where o.attempt_id=(decision->>'attemptReceiptId')::uuid) then raise exception 'revoked assurance persisted outcome';end if;
 if before_deadline is distinct from(select a.observed_deadline from private.capital_body_gateway_attempts a where a.id=(decision->>'attemptReceiptId')::uuid) then raise exception 'outcome refreshed TTL';end if;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 begin
 -- Failure was legitimately closed first; a later assurance revocation still
 -- denies the child even though its terminal predecessor exists.
 perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid,pg_temp.outcome_observation_v1(decision,claim,'refusal'));
 perform private.revoke_provider_processing_assurance_v1((decision#>>'{assuranceIds,0}')::uuid,'Synthetic post-outcome assurance revocation rollback');
 begin perform public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid(),true,(decision->>'invocationId')::uuid),pg_temp.ledger_route('anthropic'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);raise exception 'revoked closed predecessor admitted child';exception when insufficient_privilege then
 if sqlerrm<>'capital_body_processing_denied' then raise;end if;end;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid,pg_temp.outcome_observation_v1(decision,claim,'refusal'));
 if before_deadline is distinct from(select a.observed_deadline from private.capital_body_gateway_attempts a where a.id=(decision->>'attemptReceiptId')::uuid) then raise exception 'outcome refreshed TTL after rollback';end if;
end; $$;

-- Current assurance also guards the prospective accepted endpoint after an
-- accepted outcome exists. Legitimate historical (terminal=false) is unchanged.
do $$ declare f record;j record;begin
 select * into strict f from pg_temp.outcome_fixture;select * into strict j from pg_temp.capture_job_fixture;
 begin
 perform private.revoke_provider_processing_assurance_v1((f.fallback_decision#>>'{assuranceIds,0}')::uuid,'Synthetic post-accepted outcome assurance revocation rollback');
 begin perform public.worker_record_capital_body_accepted_v1(j.job_id,j.capability,(f.input_receipt->>'receiptId')::uuid,
 (select x.accepted_identity from private.capital_body_accepted_invocations x where x.organization_id='20000000-0000-4000-8000-000000000991' and x.input_receipt_id=(f.input_receipt->>'receiptId')::uuid));
 raise exception 'prospective accepted replay bypassed revoked assurance';exception when insufficient_privilege then
 if sqlerrm<>'capital_body_processing_denied' then raise;end if;end;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
end; $$;

-- Already admitted provider retention is not a new900-second window on
-- outcome. Current pins and source authority still live: narrowed horizon600s
-- denies a new input admission, while the original terminal fact can close.
do $$ declare j record;r jsonb;components jsonb;decision jsonb;claim jsonb;poll jsonb;poll_no integer;before_deadline timestamptz;result_dto jsonb;
begin
 select * into strict j from pg_temp.capture_job_fixture;r:=pg_temp.outcome_fresh_basis_v1('postsend-fixed-window');
 components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',r->>'retainedPayloadId'));
 decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),
 pg_temp.ledger_route('openai')||jsonb_build_object('accountRef','synthetic-body-outcomes-postsend'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 if decision->>'allowed'<>'true' then raise exception 'fixed-window initial900s route denied';end if;
 claim:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid);
 select a.observed_deadline into before_deadline from private.capital_body_gateway_attempts a where a.id=(decision->>'attemptReceiptId')::uuid;
 update private.capital_public_payload_purge_queue q set effective_purge_at=clock_timestamp()+interval '600 seconds'
 where q.organization_id='20000000-0000-4000-8000-000000000991' and q.allocation_id=(r->>'allocationId')::uuid;
 for poll_no in 1..10 loop
 poll:=public.worker_claim_capital_capture_purge_v1(repeat('z',64),100);
 if jsonb_array_length(poll->'items')<>0 then raise exception 'fixed-window narrowed future deadline caused premature purge';end if;
 exit when not private.capital_body_wakes_pending_v1('20000000-0000-4000-8000-000000000991',(r->>'allocationId')::uuid);
 end loop;
 if private.capital_body_wakes_pending_v1('20000000-0000-4000-8000-000000000991',(r->>'allocationId')::uuid) then raise exception 'fixed-window pending did not converge';end if;
 begin perform public.worker_record_capital_body_input_v3(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid);raise exception 'new900s dispatch admitted after horizon narrowed';exception when serialization_failure then
 if sqlerrm<>'capital_body_processing_changed' then raise;end if;end;
 result_dto:=public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid,pg_temp.outcome_observation_v1(decision,claim,'refusal'));
 if result_dto->>'outcome'<>'refusal' or before_deadline is distinct from(select a.observed_deadline from private.capital_body_gateway_attempts a where a.id=(decision->>'attemptReceiptId')::uuid) then raise exception 'fixed-window outcome restarted TTL';end if;
end; $$;

-- Real wall-clock expiry of an operator declaration denies metadata writer,
-- a new dispatch and child lineage. This is not an edited immutable assurance.
do $$ declare j record;r jsonb;components jsonb;decision jsonb;claim jsonb;dto jsonb;route jsonb;x record;document jsonb;valid_until timestamptz;
begin
 select * into strict j from pg_temp.capture_job_fixture;r:=pg_temp.outcome_fresh_basis_v1('postsend-assurance-expiry');
 components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',r->>'retainedPayloadId'));
 route:=pg_temp.ledger_route('openai')||jsonb_build_object('accountRef','synthetic-body-outcomes-expiring');
 valid_until:=clock_timestamp()+interval '5 seconds';
 for x in select pa.document from private.provider_processing_assurances pa where pa.account_ref='synthetic-body-ledger-account' and pa.provider='openai' loop
 document:=x.document||jsonb_build_object('id',gen_random_uuid(),'accountRef','synthetic-body-outcomes-expiring','validThrough',valid_until);
 perform private.record_provider_processing_assurance_v1(document,'SQL synthetic five-second post-send expiry declaration');
 end loop;
 decision:=public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),route,array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 if decision->>'allowed'<>'true' then raise exception 'expiring assurance unavailable before dispatch';end if;
 claim:=public.worker_record_capital_body_input_v3(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid);
 dto:=pg_temp.outcome_observation_v1(decision,claim,'refusal');
 perform pg_sleep(greatest(0,extract(epoch from valid_until-clock_timestamp()))+0.1);
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid,dto);raise exception 'expired assurance wrote terminal outcome';exception when insufficient_privilege then
 if sqlerrm<>'capital_body_processing_denied' then raise;end if;end;
 begin perform public.worker_record_capital_body_input_v3(j.job_id,j.capability,(decision->>'attemptReceiptId')::uuid);raise exception 'expired assurance replayed dispatch';exception when serialization_failure then
 if sqlerrm<>'capital_body_processing_changed' then raise;end if;end;
 begin perform public.worker_authorize_capital_body_processing_v2(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid(),true,(decision->>'invocationId')::uuid),pg_temp.ledger_route('anthropic'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);raise exception 'expired unresolved attempt dispatched child';exception when insufficient_privilege then null;end;
 if exists(select 1 from private.capital_body_attempt_outcomes o where o.attempt_id=(decision->>'attemptReceiptId')::uuid) then raise exception 'expired assurance persisted outcome';end if;
end; $$;

-- The private current-pin resolver rejects duplicate resources, mismatched
-- credentials/purpose and an unrelated allowed/denied decision. Local records
-- exercise the guard; installed attempt/decision rows remain immutable.
do $$ declare j record;job_row public.processing_jobs;attempt_row private.capital_body_gateway_attempts;bad private.capital_body_gateway_attempts;f record;
begin
 select * into strict j from pg_temp.capture_job_fixture;select * into strict f from pg_temp.outcome_fixture;
 select * into strict job_row from public.processing_jobs x where x.id=j.job_id;
 select * into strict attempt_row from private.capital_body_gateway_attempts x where x.id=(f.fallback_decision->>'attemptReceiptId')::uuid;
 perform private.capital_body_attempt_assurances_current_v1(job_row,attempt_row);
 bad:=attempt_row;bad.resources:=array['inference','inference','schema_cache'];
 begin perform private.capital_body_attempt_assurances_current_v1(job_row,bad);raise exception 'duplicate pinned resource admitted';exception when insufficient_privilege then null;end;
 bad:=attempt_row;bad.route:=bad.route||jsonb_build_object('credentialBinding','synthetic-wrong-credential');
 begin perform private.capital_body_attempt_assurances_current_v1(job_row,bad);raise exception 'mismatched credential admitted';exception when insufficient_privilege then null;end;
 bad:=attempt_row;bad.purpose:='synthetic-wrong-purpose';
 begin perform private.capital_body_attempt_assurances_current_v1(job_row,bad);raise exception 'mismatched purpose admitted';exception when insufficient_privilege then null;end;
 bad:=attempt_row;bad.processing_decision_id:=(f.primary_decision->>'decisionId')::uuid;
 begin perform private.capital_body_attempt_assurances_current_v1(job_row,bad);raise exception 'wrong decision admitted';exception when insufficient_privilege then null;end;
end; $$;

-- SQL component/body/physical identity rows are the authority. Client values
-- cannot mutate an observation into another job/input/provider or accepted body.
set local role authenticated;
do $$ declare f record;j record;bad jsonb;dto jsonb;mutator jsonb;t text;
begin
 select * into strict f from pg_temp.outcome_fixture;select * into strict j from pg_temp.capture_job_fixture;
 foreach t in array array['rawText','prompt','errorMessage','validationPath','allowedValues','repairGuidance'] loop
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(f.fallback_decision->>'attemptReceiptId')::uuid,f.outcome_dto||jsonb_build_object(t,'private-canary'));raise exception 'private key admitted';exception when invalid_parameter_value then null;end;
 end loop;
 for mutator in select value from jsonb_array_elements(jsonb_build_array(
 jsonb_build_object('processingDecisionId',gen_random_uuid()),jsonb_build_object('inputAttestationReceiptId',gen_random_uuid()),
 jsonb_build_object('invocationId',gen_random_uuid()),jsonb_build_object('inputFingerprint',repeat('0',64)),
 jsonb_build_object('requestFingerprint',repeat('0',64)),jsonb_build_object('reservationMicroUsd',200000,'exposureMicroUsd',200000))) loop
 dto:=pg_temp.outcome_rehash_v1(f.outcome_dto||mutator);
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(f.fallback_decision->>'attemptReceiptId')::uuid,dto);raise exception 'forged observation binding admitted';exception when insufficient_privilege then null;end;
 end loop;
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(f.fallback_decision->>'attemptReceiptId')::uuid,f.outcome_dto||jsonb_build_object('outcomeFingerprint',repeat('0',64)));raise exception 'bad common fingerprint echoed';exception when invalid_parameter_value then null;end;
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,(f.fallback_decision->>'attemptReceiptId')::uuid,f.outcome_dto||jsonb_build_object('fromCassette',true));raise exception 'cassette native observation';exception when invalid_parameter_value then null;end;
 begin perform public.worker_record_capital_body_input_v3(j.job_id,j.capability,null);raise exception 'null attempt admitted';exception when invalid_parameter_value then null;end;
 begin perform public.worker_record_capital_body_attempt_outcome_v1(j.job_id,j.capability,null,f.outcome_dto);raise exception 'null outcomeattempt admitted';exception when invalid_parameter_value then null;end;
 foreach t in array array['capital_body_processing_operations','capital_body_operation_dispatches','capital_body_attempt_outcomes'] loop
 begin execute format('select 1 from private.%I',t);raise exception 'API direct private ledger read';exception when insufficient_privilege then null;end;
 end loop;
 begin perform private.capital_body_attempt_outcome_fingerprint_v1(f.outcome_dto);raise exception 'pure helper exposed to API';exception when insufficient_privilege then null;end;
 begin perform private.capital_body_dispatch_policy_v1('openai','gpt-5.6-terra',100);raise exception 'policy helper exposed to API';exception when insufficient_privilege then null;end;
 begin perform private.capital_body_attempt_assurances_current_v1(null::public.processing_jobs,null::private.capital_body_gateway_attempts);raise exception 'assurance proof helper exposed to API';exception when insufficient_privilege then null;end;
 begin perform private.capital_body_attempt_predecessor_current_v1(null::public.processing_jobs,null::private.capital_body_gateway_attempts);raise exception 'predecessor proof helper exposed to API';exception when insufficient_privilege then null;end;
end; $$;
reset role;
do $$ declare t text;begin
 foreach t in array array['capital_body_processing_operations','capital_body_operation_dispatches','capital_body_attempt_outcomes'] loop
 if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname=t and c.relrowsecurity and c.relforcerowsecurity)
 or (select count(*) from pg_policies where schemaname='private' and tablename=t and permissive='RESTRICTIVE')<>4 then raise exception 'ledger RLS incomplete';end if;
 if has_table_privilege('authenticated','private.'||t,'select') or has_table_privilege('service_role','private.'||t,'select') then raise exception 'ledger grant too broad';end if;
 end loop;
 if not exists(select 1 from pg_index i where i.indexrelid='private.capital_body_accepted_input_identity_fk_idx'::regclass
 and i.indrelid='private.capital_body_accepted_invocations'::regclass and i.indisvalid and i.indisready
 and i.indpred is null and i.indnkeyatts=3
 and array(select a.attname::text from unnest(i.indkey::smallint[]) with ordinality k(number,position)
 join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.number where k.position<=3 order by k.position)
 =array['organization_id','input_receipt_id','invocation_id']::text[]) then raise exception 'accepted input identity FK index missing';end if;
 if exists(select 1 from private.capital_body_attempt_outcomes o where o.observation::text like '%private-canary%') then raise exception 'private content persisted';end if;
 if exists(select 1 from private.capital_body_processing_operations o join private.capital_body_operation_dispatches d on d.organization_id=o.organization_id and d.operation_id=o.id
 group by o.id,o.max_dispatches having count(*)>o.max_dispatches) then raise exception 'durable slot cap violated';end if;
end; $$;
select 'capital_body_attempt_outcomes' as test,'PASS' as result;
rollback;
