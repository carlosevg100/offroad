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
-- Setup commands and retained-parent creation enqueue real durable wake intents.
-- Advance the canonical purge poll lifecycle before admitting a new dispatch;
-- never erase wake rows or bypass the fail-closed health guard in the fixture.
do $$ declare f record;poll_no integer;poll_result jsonb;begin
 select * into strict f from pg_temp.body_test_fixture;
 for poll_no in 1..10 loop
 poll_result:=public.worker_claim_capital_capture_purge_v1(repeat('z',64),100);
 if jsonb_array_length(poll_result->'items')<>0 then raise exception 'fixture unexpectedly claimed a live allocation for erasure';end if;
 exit when not private.capital_body_wakes_pending_v1('20000000-0000-4000-8000-000000000991',(f.retained->>'allocationId')::uuid)
 and not private.capital_body_wakes_pending_v1('20000000-0000-4000-8000-000000000991',(f.response_retained->>'allocationId')::uuid);
 end loop;
 if private.capital_body_wakes_pending_v1('20000000-0000-4000-8000-000000000991',(f.retained->>'allocationId')::uuid)
 or private.capital_body_wakes_pending_v1('20000000-0000-4000-8000-000000000991',(f.response_retained->>'allocationId')::uuid) then raise exception 'fixture wake drain did not converge';end if;
end; $$;
-- Synthetic provider-control documents are recorded by the actual operator
-- command inside this rollback transaction. They attest only this fixture.
create temp table ledger_fixture(primary_attempt jsonb,fallback_attempt jsonb,input_receipt jsonb,accepted_receipt jsonb);
grant all on ledger_fixture to authenticated;
insert into ledger_fixture default values;
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

-- A separately scoped operator fixture admits 900 seconds in every retention
-- dimension. An ancestor's effective purge in 600 seconds must deny it even
-- though the legal deadline and 600-second purge margin would otherwise admit.
do $$ declare x record;document jsonb;begin
 for x in select pa.document from private.provider_processing_assurances pa where pa.account_ref='synthetic-body-ledger-account' and pa.provider='openai' loop
 document:=x.document||jsonb_build_object('id',gen_random_uuid(),'accountRef','synthetic-body-ledger-operating',
 'retention',jsonb_build_object('requestContentSeconds',900,'abuseMonitoringSeconds',900,'applicationStateSeconds',900,'cacheSeconds',900,'metadataSeconds',900,'exceptions','[]'::jsonb));
 perform private.record_provider_processing_assurance_v1(document,'SQL synthetic operating deadline rollback fixture');
 end loop;
end; $$;

set local role authenticated;
do $$ declare f record;j record;components jsonb;attempt_json jsonb;result_dto jsonb;resource_set text[];begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',f.retained->>'retainedPayloadId'));
 attempt_json:=pg_temp.ledger_attempt('b0ae0000-0000-4000-9000-000000000001');
 -- Every resource is mandatory. Empty, duplicate, subset and extra-resource
 -- requests fail before a processing fact or input receipt is fabricated.
 for resource_set in select value from (values
 (array[]::text[]),(array['inference']),(array['inference','prompt_cache']),
 (array['inference','schema_cache']),(array['prompt_cache','schema_cache']),
 (array['inference','prompt_cache','prompt_cache']),
 (array['inference','prompt_cache','schema_cache','file_upload'])) fixtures(value) loop
 begin perform public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,attempt_json,pg_temp.ledger_route('openai'),resource_set,'case_analysis',components);
 raise exception 'incomplete resource set accepted';exception when invalid_parameter_value then null;end;
 end loop;
 begin perform public.worker_authorize_capital_body_processing_v1(j.job_id,repeat('x',64),attempt_json,pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 raise exception 'wrong capability accepted';exception when insufficient_privilege then null;end;
 begin perform public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,attempt_json||'{"rawInput":"private"}',pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 raise exception 'content in metadata accepted';exception when invalid_parameter_value then null;end;
 begin perform public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,attempt_json||'{"retryOrdinal":1,"isSameModelRepair":true}',pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 raise exception 'repair without outcome ledger accepted';exception when invalid_parameter_value then null;end;
 result_dto:=public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,attempt_json,pg_temp.ledger_route('anthropic'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 if result_dto->>'allowed'<>'false' or result_dto->>'classification'<>'restricted' or jsonb_array_length(result_dto->'reasons')<>3
 or result_dto->>'schemaVersion'<>'capital-body-processing-decision.v1' or result_dto->>'replayed'<>'false'
 or result_dto?'rawInput' then raise exception 'MIN ancestor deadline did not deny retained excessive route';end if;
 update pg_temp.ledger_fixture set primary_attempt=result_dto;
 begin perform public.worker_record_capital_body_input_v2(j.job_id,j.capability,(result_dto->>'attemptReceiptId')::uuid);raise exception 'denied attempt produced input';exception when insufficient_privilege then null;end;
 begin perform public.worker_record_capital_body_input_v1(j.job_id,j.capability,'b0ae0000-0000-4000-9000-000000000001',repeat('5',64),repeat('7',64),repeat('8',64),'anthropic','claude-sonnet-5',components);
 raise exception 'v1 bypassed denied attempt';exception when insufficient_privilege then null;end;
 begin perform public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,pg_temp.ledger_attempt('b09d0000-0000-4000-9000-000000000002'),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 raise exception 'legacy input retroactively rebound';exception when insufficient_privilege then null;end;
 begin perform public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid(),true,gen_random_uuid()),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 raise exception 'invented denied predecessor accepted';exception when insufficient_privilege then null;end;
 result_dto:=public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,pg_temp.ledger_attempt('b0ae0000-0000-4000-9000-000000000002',true,'b0ae0000-0000-4000-9000-000000000001'),
 pg_temp.ledger_route('openai'),array['schema_cache','inference','prompt_cache'],'case_analysis',components);
 if result_dto->>'allowed'<>'true' or result_dto->'reasons'<>'[]'::jsonb or result_dto->'assuranceId'<>'null'::jsonb or jsonb_array_length(result_dto->'assuranceIds')<>3 then
 raise exception 'SQL-denied primary legitimate eligible fallback refused';end if;
 update pg_temp.ledger_fixture set fallback_attempt=result_dto;
 result_dto:=public.worker_record_capital_body_input_v2(j.job_id,j.capability,(result_dto->>'attemptReceiptId')::uuid);
 update pg_temp.ledger_fixture set input_receipt=result_dto;
 if public.worker_record_capital_body_input_v2(j.job_id,j.capability,(select(fallback_attempt->>'attemptReceiptId')::uuid from pg_temp.ledger_fixture)) is distinct from result_dto then raise exception 'inputv2 replay changed';end if;
 begin perform public.worker_record_capital_body_input_v2(j.job_id,j.capability,null);raise exception 'null attempt accepted';exception when invalid_parameter_value then null;end;
 begin perform public.worker_record_capital_body_input_v2(j.job_id,j.capability,gen_random_uuid());raise exception 'foreign attempt accepted';exception when insufficient_privilege then null;end;
 begin perform public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid(),true,'b0ae0000-0000-4000-9000-000000000002'),
 pg_temp.ledger_route('anthropic'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);raise exception 'post-send fallback accepted without outcome proof';exception when insufficient_privilege then null;end;
end; $$;
reset role;

-- Pure replay makes no new decision and does not renew any component deadline.
do $$ declare f record;j record;l record;n bigint;dto jsonb;components jsonb;before_deadline timestamptz;after_deadline timestamptz;poll_no integer;poll_result jsonb;original_job public.processing_jobs;begin
 select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;select * into strict l from pg_temp.ledger_fixture;
 components:=jsonb_build_array(jsonb_build_object('kind','retained_payload','id',f.retained->>'retainedPayloadId'));
 select count(*) into n from private.processing_eligibility_decisions where job_id=j.job_id;
 select observed_deadline into before_deadline from private.capital_body_gateway_attempts where id=(l.fallback_attempt->>'attemptReceiptId')::uuid;
 dto:=public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,pg_temp.ledger_attempt('b0ae0000-0000-4000-9000-000000000002',true,'b0ae0000-0000-4000-9000-000000000001'),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 if dto->>'replayed'<>'true' or dto-'replayed' is distinct from l.fallback_attempt-'replayed'
 or(select count(*) from private.processing_eligibility_decisions where job_id=j.job_id)<>n then raise exception 'replay inserted or changed processing decision';end if;
 select observed_deadline into after_deadline from private.capital_body_gateway_attempts where id=(l.fallback_attempt->>'attemptReceiptId')::uuid;
 if before_deadline is distinct from after_deadline then raise exception 'replay refreshed TTL';end if;
 if exists(select 1 from private.capital_body_invocation_inputs i where i.id=(l.input_receipt->>'receiptId')::uuid
 and(i.lineage_scheme<>'processing-attempt.v1' or i.previous_invocation_id is not null or i.previous_attempt_id is distinct from(l.primary_attempt->>'attemptReceiptId')::uuid)) then raise exception 'fallback fabricated previous input receipt';end if;
 begin perform public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,pg_temp.ledger_attempt('b0ae0000-0000-4000-9000-000000000002',true,'b0ae0000-0000-4000-9000-000000000001')||jsonb_build_object('reservationUsd',0.2),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',components);
 raise exception 'frozen attempt metadata overwritten';exception when unique_violation then null;end;
 -- Assurance revocation invalidates admission without inserting a replacement fact.
 begin
 perform private.revoke_provider_processing_assurance_v1((l.fallback_attempt#>>'{assuranceIds,0}')::uuid,'Synthetic rollback revocation of one structured resource');
 begin perform public.worker_record_capital_body_input_v2(j.job_id,j.capability,(l.fallback_attempt->>'attemptReceiptId')::uuid);raise exception 'revoked resource reached dispatch';exception when serialization_failure then
 if sqlerrm<>'capital_body_processing_changed' then raise;end if;end;
 if(select count(*) from private.processing_eligibility_decisions where job_id=j.job_id)<>n then raise exception 'pure refresh wrote a decision';end if;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 -- MIN operating bound, not the additional legal erasure margin.
 begin
 update private.capital_public_payload_purge_queue set effective_purge_at=clock_timestamp()+interval '600 seconds'
 where allocation_id=(f.retained->>'allocationId')::uuid;
 -- Queue shortening emits descendant wakes. Advance the actual purge poll
 -- before checking provider MIN, so this is a policy decision rather than the
 -- earlier fail-closed 'pending' boundary.
 for poll_no in 1..10 loop
 poll_result:=public.worker_claim_capital_capture_purge_v1(repeat('z',64),100);
 if jsonb_array_length(poll_result->'items')<>0 then raise exception 'future operating bound caused premature purge';end if;
 exit when not private.capital_body_wakes_pending_v1('20000000-0000-4000-8000-000000000991',(f.response_retained->>'allocationId')::uuid);
 end loop;
 if private.capital_body_wakes_pending_v1('20000000-0000-4000-8000-000000000991',(f.response_retained->>'allocationId')::uuid) then raise exception 'MIN fixture wake did not drain';end if;
 dto:=public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),
 pg_temp.ledger_route('openai')||jsonb_build_object('accountRef','synthetic-body-ledger-operating'),array['inference','prompt_cache','schema_cache'],'case_analysis',
 jsonb_build_array(jsonb_build_object('kind','retained_payload','id',f.response_retained->>'retainedPayloadId')));
 if dto->>'allowed'<>'false' or jsonb_array_length(dto->'reasons')<>3 then raise exception 'provider retention exceeded indirect operating deadline';end if;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 -- Current operating deadline of an indirect ancestor is stricter than its
 -- still-valid legal deadline. The descendant cannot mask a parent's purge.
 begin
 update private.capital_public_payload_purge_queue set effective_purge_at=clock_timestamp()-interval '1 second'
 where allocation_id=(f.retained->>'allocationId')::uuid;
 -- Internal purge proof must detect the expired ancestor even before its wake
 -- is drained. This is an owner SQL test of proof, never API authorization.
 select * into strict original_job from public.processing_jobs x where x.id=j.job_id;
 begin perform private.capital_body_processing_allocation_proof_v1(original_job,(f.response_retained->>'allocationId')::uuid,false);
 raise exception 'pure proof masked expired indirect ancestor';exception when insufficient_privilege then null;end;
 for poll_no in 1..10 loop
 poll_result:=public.worker_claim_capital_capture_purge_v1(repeat('z',64),100);
 exit when not private.capital_body_wakes_pending_v1('20000000-0000-4000-8000-000000000991',(f.response_retained->>'allocationId')::uuid);
 end loop;
 begin perform public.worker_authorize_capital_body_processing_v1(j.job_id,j.capability,pg_temp.ledger_attempt(gen_random_uuid()),pg_temp.ledger_route('openai'),array['inference','prompt_cache','schema_cache'],'case_analysis',
 jsonb_build_array(jsonb_build_object('kind','retained_payload','id',f.response_retained->>'retainedPayloadId')));
 raise exception 'expired indirect ancestor operating deadline accepted';exception when insufficient_privilege then null;end;
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
end; $$;


-- The accepted output is bound to the actual allowed attempt/input and retains
-- source inheritance. SQL fixtures prove metadata, not physical bytes.
alter table pg_temp.ledger_fixture add column response_allocation jsonb,add column response_retained jsonb,add column response_object_id uuid,add column accepted_request jsonb;
set local role authenticated;
do $$ declare l record;j record;dto jsonb;accepted_dto jsonb;allocated_dto jsonb;begin
 select * into strict l from pg_temp.ledger_fixture;select * into strict j from pg_temp.capture_job_fixture;
 dto:=jsonb_build_object('schemaVersion','gateway-accepted-invocation.v1','invocationId',l.input_receipt->>'invocationId',
 'adapterInputVersion','gateway-adapter-input.v1','adapterRequestFingerprint',l.input_receipt->>'requestFingerprint',
 'outputFingerprintVersion','gateway-parsed-output.v1','outputFingerprint',repeat('9',64),'inputFingerprint',repeat('7',64),'promptFingerprint',repeat('8',64),
 'provider','openai','configuredModel','gpt-5.6-terra','reportedModel','gpt-5.6-terra','schemaName','origination_senior_readout_v2',
 'retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',true,'fromCassette',false,'inputAttestationReceiptId',l.input_receipt->>'receiptId');
 accepted_dto:=public.worker_record_capital_body_accepted_v1(j.job_id,j.capability,(l.input_receipt->>'receiptId')::uuid,dto);
 allocated_dto:=public.worker_prepare_capital_body_v1(j.job_id,j.capability,'b0ae0000-0000-4000-9000-000000000003','gateway_accepted_output',
 (accepted_dto->>'acceptedInvocationId')::uuid,'{"question":"Synthetic strict SQL output"}',repeat('9',64));
 if allocated_dto->>'payloadFingerprint'=repeat('9',64) then raise exception 'parsed output hash conflated with physical SHA';end if;
 update pg_temp.ledger_fixture set accepted_receipt=accepted_dto,response_allocation=allocated_dto,accepted_request=dto;
end; $$;
reset role;
insert into storage.objects(bucket_id,name,metadata,version)
 select 'capital-input-capture',response_allocation->>'path',jsonb_build_object('size',(response_allocation->>'byteLength')::bigint,'mimetype','application/json'),'body-ledger-sql-output-v1' from pg_temp.ledger_fixture;
update pg_temp.ledger_fixture l set response_object_id=o.id from storage.objects o where o.bucket_id='capital-input-capture' and o.name=l.response_allocation->>'path';
set local role authenticated;
do $$ declare l record;j record;r jsonb;begin
 select * into strict l from pg_temp.ledger_fixture;select * into strict j from pg_temp.capture_job_fixture;
 r:=public.worker_commit_capital_body_v1(j.job_id,j.capability,(l.response_allocation->>'allocationId')::uuid,l.response_object_id,'body-ledger-sql-output-v1',l.response_allocation->>'payloadFingerprint',(l.response_allocation->>'byteLength')::bigint);
 update pg_temp.ledger_fixture set response_retained=r;
 if public.worker_read_capital_body_v1(j.job_id,j.capability,(r->>'retainedPayloadId')::uuid)->>'payloadFingerprint' is distinct from r->>'payloadFingerprint' then raise exception 'strict output unreadable';end if;
end; $$;
reset role;
do $$ declare l record;f record;j record;current_revision integer;poll_no integer;poll_result jsonb;before_deadline timestamptz;begin
 select * into strict l from pg_temp.ledger_fixture;select * into strict f from pg_temp.body_test_fixture;select * into strict j from pg_temp.capture_job_fixture;
 -- A durable wake row is a real retention-queue fixture, not a mocked guard.
 -- Its own presence must close reads until the ordinary purge poll proves and
 -- drains it. This exercises strict output, whose sources are retained parents.
 begin
 select effective_purge_at into strict before_deadline from private.capital_public_payload_purge_queue where allocation_id=(l.response_retained->>'allocationId')::uuid;
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 values('20000000-0000-4000-8000-000000000991',(l.response_retained->>'allocationId')::uuid);
 begin perform public.worker_read_capital_body_v1(j.job_id,j.capability,(l.response_retained->>'retainedPayloadId')::uuid);raise exception 'pending strict wake allowed read';exception when serialization_failure then
 if sqlerrm<>'capital_body_retention_pending' then raise;end if;end;
 for poll_no in 1..10 loop
 poll_result:=public.worker_claim_capital_capture_purge_v1(repeat('z',64),100);
 if jsonb_array_length(poll_result->'items')<>0 then raise exception 'valid strict wake caused premature purge';end if;
 exit when not private.capital_body_wakes_pending_v1('20000000-0000-4000-8000-000000000991',(l.response_retained->>'allocationId')::uuid);
 end loop;
 if private.capital_body_wakes_pending_v1('20000000-0000-4000-8000-000000000991',(l.response_retained->>'allocationId')::uuid) then raise exception 'strict wake drain self-blocked';end if;
 if (select effective_purge_at from private.capital_public_payload_purge_queue where allocation_id=(l.response_retained->>'allocationId')::uuid)>before_deadline then raise exception 'strict wake drain refreshed TTL';end if;
 perform public.worker_read_capital_body_v1(j.job_id,j.capability,(l.response_retained->>'retainedPayloadId')::uuid);
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 -- Provider admission is revalidated before sending; a later provider-policy
 -- revocation is not a fabricated second send or a reason to restart TTL.
 begin
 perform private.revoke_provider_processing_assurance_v1((l.fallback_attempt#>>'{assuranceIds,0}')::uuid,'Synthetic post-dispatch policy revocation rollback');
 begin perform public.worker_record_capital_body_input_v2(j.job_id,j.capability,(l.fallback_attempt->>'attemptReceiptId')::uuid);raise exception 'revoked provider policy admitted a new send';exception when serialization_failure then
 if sqlerrm<>'capital_body_processing_changed' then raise;end if;end;
 if public.worker_record_capital_body_accepted_v1(j.job_id,j.capability,(l.input_receipt->>'receiptId')::uuid,l.accepted_request)->>'acceptedInvocationId'
 is distinct from l.accepted_receipt->>'acceptedInvocationId' then raise exception 'accepted fact changed after provider revocation';end if;
 if public.worker_prepare_capital_body_v1(j.job_id,j.capability,'b0ae0000-0000-4000-9000-000000000003','gateway_accepted_output',
 (l.accepted_receipt->>'acceptedInvocationId')::uuid,'{"question":"Synthetic strict SQL output"}',repeat('9',64))->>'allocationId'
 is distinct from l.response_allocation->>'allocationId' then raise exception 'post-dispatch retention refreshed allocation';end if;
 perform public.worker_read_capital_body_v1(j.job_id,j.capability,(l.response_retained->>'retainedPayloadId')::uuid);
 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
 -- A source-right change in an indirect ancestor immediately closes retained
 -- output reads as well as later input dispatch. The fixture transaction restores
 -- the real command's rights record and wake rows on leaving this subtransaction.
 begin
 select revision into strict current_revision from private.source_rights_versions x where x.organization_id='20000000-0000-4000-8000-000000000991' and x.source_version_id=f.ancestor_id order by revision desc limit 1;
 perform public.set_source_rights_v1(f.ancestor_id,current_revision,array['read','store','derive'],array['analysis'],clock_timestamp()+interval '20 days',clock_timestamp()+interval '18 days',f.ancestor_id,repeat('d',64));
 begin perform public.worker_record_capital_body_input_v2(j.job_id,j.capability,(l.fallback_attempt->>'attemptReceiptId')::uuid);raise exception 'missing ancestor process admitted';exception when insufficient_privilege then null;end;
 begin perform public.worker_read_capital_body_v1(j.job_id,j.capability,(l.response_retained->>'retainedPayloadId')::uuid);raise exception 'strict output read ignored revoked ancestor process';exception when insufficient_privilege then null;end;
 -- The real rights command above emits wake intents. Purge remains independent
 -- of human dispatch authority and must lease the now-unlawful strict output.
 for poll_no in 1..10 loop
 poll_result:=public.worker_claim_capital_capture_purge_v1(repeat('z',64),100);
 exit when exists(select 1 from private.capital_public_payload_purge_queue q where q.allocation_id=(l.response_retained->>'allocationId')::uuid and q.status='leased');
 end loop;
 if not exists(select 1 from private.capital_public_payload_purge_queue q where q.allocation_id=(l.response_retained->>'allocationId')::uuid and q.status='leased') then raise exception 'dead strict source did not progress to purge lease';end if;
 -- SQL metadata fixture does not acknowledge physical erasure; HTTP gate does.

 raise exception 'fixture_rollback' using errcode='P3991';exception when sqlstate 'P3991' then null;end;
end; $$;

-- New private tables and pure helpers are never API access paths.
set local role authenticated;
do $$ begin
 begin perform 1 from private.capital_body_gateway_attempts;raise exception 'ledger directly readable';exception when insufficient_privilege then null;end;
 begin perform 1 from private.capital_body_gateway_attempt_components;raise exception 'ledger components directly readable';exception when insufficient_privilege then null;end;
 begin perform private.resolve_capital_body_processing_v1(null,'{}',array['inference','prompt_cache','schema_cache'],'case_analysis',clock_timestamp()+interval '1 day');raise exception 'pure resolver API exposed';exception when insufficient_privilege then null;end;
 begin perform private.capital_body_processing_allocation_proof_v1(null,null,false);raise exception 'allocation purge-only proof exposed';exception when insufficient_privilege then null;end;
 begin perform private.capital_body_processing_components_proof_v1(null,'[]',clock_timestamp(),null,false);raise exception 'components purge-only proof exposed';exception when insufficient_privilege then null;end;
 begin perform private.capital_body_attempt_sources_proof_v1(null,null,false);raise exception 'attempt purge-only proof exposed';exception when insufficient_privilege then null;end;

end; $$;
reset role;
select 'capital_body_attempt_ledger' as test,'PASS' as result;
rollback;
