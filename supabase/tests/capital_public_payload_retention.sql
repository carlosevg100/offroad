-- Transactional SQL contract only. storage.objects rows below are metadata fixtures,
-- NOT physical byte/purge evidence. Real Storage HTTP and worker eval are separate gates.
begin;
select set_config('request.jwt.claim.sub','',true);
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_persistent_work_fixture.sql
\ir support/provider_research_plan_snapshot.sql
\ir support/execution_approval.sql
-- A real authorized synthetic job proves identity replay and that no complete
-- receipt or payload bytes are fabricated by the metadata-only foundation.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
('10000000-0000-4000-8000-000000000981','authenticated','authenticated','capture-owner@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false),
('10000000-0000-4000-8000-000000000982','authenticated','authenticated','capture-foreign@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false),
('10000000-0000-4000-8000-000000000983','authenticated','authenticated','capture-publisher@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000981','originator','Synthetic capture A','10000000-0000-4000-8000-000000000981'),
('20000000-0000-4000-8000-000000000982','originator','Synthetic capture B','10000000-0000-4000-8000-000000000982');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
('20000000-0000-4000-8000-000000000981','10000000-0000-4000-8000-000000000981','owner','active',now()),
('20000000-0000-4000-8000-000000000982','10000000-0000-4000-8000-000000000982','owner','active',now());
insert into public.onboarding_progress(organization_id,user_id,journey,current_step) values
('20000000-0000-4000-8000-000000000981','10000000-0000-4000-8000-000000000981','originator','organization');
insert into public.funds(id,organization_id,name,strategy,created_by) values
('40000000-0000-4000-8000-000000000981','20000000-0000-4000-8000-000000000981','Synthetic capture fund','credit','10000000-0000-4000-8000-000000000981');
insert into public.fund_directory(id,legal_name,kind,status,claimed_by_organization_id,claimed_at) values
('50000000-0000-4000-8000-000000000981','Synthetic capture directory','credit_fund','registered','20000000-0000-4000-8000-000000000981',now());
-- The publisher is a separate Offroad organization. Its right never becomes a
-- consumer-tenant source row by virtue of the consumer's membership.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000983","role":"authenticated"}',true);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000983','offroad','Synthetic capture publisher','10000000-0000-4000-8000-000000000983');
insert into public.organization_memberships(organization_id,user_id,role,status) values
('20000000-0000-4000-8000-000000000983','10000000-0000-4000-8000-000000000983','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by) values
('30000000-0000-4000-8000-000000000983','20000000-0000-4000-8000-000000000983','Synthetic capture source','10000000-0000-4000-8000-000000000983');
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000983"}',true);
create temp table capture_public_license_fixture(source_version_id uuid,source_binding_id uuid,rights_version_id uuid,payload jsonb);
grant select on capture_public_license_fixture to authenticated;
do $$ declare v uuid:=gen_random_uuid(); b uuid; r uuid; sample jsonb; begin
 sample:='{"url":"https://example.invalid/capture-licensed","title":"Synthetic licensed source","snippet":"Licensed excerpt only","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'::jsonb;
 insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by)
 values(v,'20000000-0000-4000-8000-000000000983','30000000-0000-4000-8000-000000000983','30000000-0000-4000-8000-000000000983','10000000-0000-4000-8000-000000000983');
 insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,initial_verification_state,created_by)
 values(v,'20000000-0000-4000-8000-000000000983',v,1,1,'opportunity-documents','20000000-0000-4000-8000-000000000983/synthetic/'||v,'Synthetic excerpt','pending_verification','10000000-0000-4000-8000-000000000983');
 insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
 values('20000000-0000-4000-8000-000000000983',v,'30000000-0000-4000-8000-000000000983','30000000-0000-4000-8000-000000000983',gen_random_uuid(),'10000000-0000-4000-8000-000000000983') returning id into b;
 r:=public.declare_public_source_reuse_v1(v,0,sample->>'url',private.public_source_payload_sha256_v1(sample),now()+interval '60 days',now()+interval '60 days',v,repeat('b',64));
 insert into pg_temp.capture_public_license_fixture values(v,b,r,sample);
end $$;
select set_config('request.jwt.claims','{}',true);
select set_config('request.headers','{}',true);
create temp table capture_job_fixture(job_id uuid, capability text, capture_id uuid);
grant all on capture_job_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
do $$ declare plan jsonb:=pg_temp.provider_research_plan_fixture(); result jsonb; request uuid:=gen_random_uuid(); begin
 perform pg_temp.legacy_advisor_result(public.start_advisor_project_v1(request,'pt-BR','Synthetic capture',plan#>>'{job,id}',
  'Pesquise financiadores para a organização.','public_information',plan));
 result:=public.start_provider_research_project_v1(request,'pt-BR','Synthetic capture','Pesquise financiadores para a organização.',plan,null);
 insert into pg_temp.capture_job_fixture(job_id) values((result->>'research_job_id')::uuid);
end $$;
reset role;
insert into private.worker_tokens(label,token_sha256,execution_account_user_id) values
('synthetic-capture-worker',extensions.digest(repeat('z',64),'sha256'),'10000000-0000-4000-8000-000000000981');
do $$ declare job uuid; claim jsonb; begin
 select job_id into strict job from pg_temp.capture_job_fixture;
 perform pg_temp.fixture_approve_execution(job);
 update public.processing_jobs set available_at=now()-interval '1 day' where id=job;
 claim:=public.worker_claim_job_v3(repeat('z',64),600);
 if claim->>'job_id' is distinct from job::text then raise exception 'capture fixture claim mismatch'; end if;
 update pg_temp.capture_job_fixture set capability=claim->>'capability_token';
end $$;

create temp table retained_test_fixture(delivery_id uuid,request_id uuid,allocation_id uuid,retained_id uuid,object_id uuid,result jsonb);
grant all on retained_test_fixture to authenticated;
update private.capital_public_retention_controls set enabled=false;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
do $$ declare j record; l record; capture jsonb; delivery jsonb; origin jsonb; begin
 select * into strict j from pg_temp.capture_job_fixture;
 select * into strict l from pg_temp.capture_public_license_fixture;
 capture:=public.worker_load_capital_project_capture_context_v1(j.job_id,j.capability);
 update pg_temp.capture_job_fixture set capture_id=(capture#>>'{capture,id}')::uuid;
 origin:=jsonb_build_array(jsonb_build_object('kind','published_public_payload','licensingOrganizationId','20000000-0000-4000-8000-000000000983',
  'sourceVersionId',l.source_version_id,'rightsVersionId',l.rights_version_id,'sourceBindingId',l.source_binding_id));
 delivery:=public.worker_capture_capital_project_delivery_v1(j.job_id,j.capability,(capture#>>'{capture,id}')::uuid,'synthetic:retained:1',l.payload,origin);
 insert into pg_temp.retained_test_fixture(delivery_id,request_id) values((delivery->>'deliveryId')::uuid,gen_random_uuid());
 begin
  perform public.worker_prepare_capital_public_payload_v1(j.job_id,j.capability,(delivery->>'deliveryId')::uuid,gen_random_uuid(),l.payload);
  raise exception 'disabled admission accepted';
 exception when insufficient_privilege then null; end;
end; $$;
reset role;
update private.capital_public_retention_controls set enabled=true;
set local role authenticated;
do $$ declare j record; l record; d record; begin
 select * into strict j from pg_temp.capture_job_fixture; select * into strict l from pg_temp.capture_public_license_fixture;
 select * into strict d from pg_temp.retained_test_fixture;
 begin
  perform public.worker_prepare_capital_public_payload_v1(j.job_id,j.capability,d.delivery_id,d.request_id,l.payload);
  raise exception 'admission without purge heartbeat accepted';
 exception when insufficient_privilege then null; end;
 perform public.worker_claim_capital_capture_purge_v1(repeat('z',64));
end; $$;
do $$ declare j record; l record; d record; allocated jsonb; replay jsonb; begin
 select * into strict j from pg_temp.capture_job_fixture; select * into strict l from pg_temp.capture_public_license_fixture;
 select * into strict d from pg_temp.retained_test_fixture;
 allocated:=public.worker_prepare_capital_public_payload_v1(j.job_id,j.capability,d.delivery_id,d.request_id,l.payload);
 replay:=public.worker_prepare_capital_public_payload_v1(j.job_id,j.capability,d.delivery_id,d.request_id,l.payload);
 if allocated->>'state'<>'allocated' or allocated->>'allocationId' is distinct from replay->>'allocationId' or replay->>'replayed'<>'true'
  or allocated->>'canonicalPayload' is distinct from l.payload::text
  or (allocated->>'byteLength')::bigint<>octet_length(l.payload::text)
  or not((allocated->>'retainedAt')::timestamptz<(allocated->>'purgeAt')::timestamptz and (allocated->>'purgeAt')::timestamptz<(allocated->>'expiresAt')::timestamptz)
  or (allocated->>'expiresAt')::timestamptz-(allocated->>'retainedAt')::timestamptz<>interval '30 days' then raise exception 'allocation identity/deadline/replay failed'; end if;
 update pg_temp.retained_test_fixture set allocation_id=(allocated->>'allocationId')::uuid,result=allocated;
 begin
  perform public.worker_prepare_capital_public_payload_v1(j.job_id,j.capability,d.delivery_id,gen_random_uuid(),l.payload||'{"privateValue":1}');
  raise exception 'extra private content accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.worker_commit_capital_public_payload_v1(j.job_id,j.capability,(allocated->>'allocationId')::uuid,gen_random_uuid(),'v1',repeat('0',64),octet_length(l.payload::text));
  raise exception 'wrong sha proof accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.worker_commit_capital_public_payload_v1(j.job_id,j.capability,(allocated->>'allocationId')::uuid,gen_random_uuid(),'v1',allocated->>'payloadFingerprint',octet_length(l.payload::text));
  raise exception 'absent object accepted';
 exception when invalid_parameter_value then null; end;
end; $$;
-- A public allocation is not an authenticated-account-wide upload grant either.
do $$ declare j record;d record;valid_headers jsonb;bad_headers jsonb;begin
 select * into strict j from pg_temp.capture_job_fixture;select * into strict d from pg_temp.retained_test_fixture;
 valid_headers:=jsonb_build_object('x-offroad-workspace','20000000-0000-4000-8000-000000000981','x-offroad-job-id',j.job_id,'x-offroad-capability',j.capability);
 perform set_config('storage.operation','object.upload',true);
 for bad_headers in select value from jsonb_array_elements(jsonb_build_array('{}'::jsonb,
 valid_headers-'x-offroad-job-id',valid_headers-'x-offroad-capability',
 valid_headers||jsonb_build_object('x-offroad-job-id',gen_random_uuid()),
 valid_headers||jsonb_build_object('x-offroad-capability',repeat('x',64)),
 valid_headers||jsonb_build_object('x-offroad-workspace','20000000-0000-4000-8000-000000000982'))) loop
 perform set_config('request.headers',bad_headers::text,true);
 begin
 insert into storage.objects(bucket_id,name,metadata,version) values('capital-input-capture',d.result->>'path',jsonb_build_object('size',(d.result->>'byteLength')::bigint,'mimetype','application/json'),'public-rls-rejected');
 raise exception 'public upload accepted unbound capability';exception when insufficient_privilege then null;end;
 end loop;
 perform set_config('request.headers',valid_headers::text,true);
 begin
 insert into storage.objects(bucket_id,name,metadata,version) values('capital-input-capture',d.result->>'path',jsonb_build_object('size',(d.result->>'byteLength')::bigint,'mimetype','application/json'),'public-rls-accepted');
 raise exception 'fixture_rollback' using errcode='P3091';exception when sqlstate 'P3091' then null;end;
 perform set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000981"}',true);
end; $$;
reset role;
-- Metadata fixture is deliberately privileged and rolled back. It does not store bytes.
insert into storage.objects(bucket_id,name,metadata,version)
 select 'capital-input-capture',result->>'path',jsonb_build_object('size',(result->>'byteLength')::bigint,'mimetype','application/json'),'retention-sql-v1'
 from pg_temp.retained_test_fixture;
update pg_temp.retained_test_fixture f set object_id=o.id from storage.objects o where o.bucket_id='capital-input-capture' and o.name=f.result->>'path';
set local role authenticated;
-- The server POST can read back an allocated upload before the immutable receipt.
-- Direct GET/info/head/sign/copy remain closed even for this exact live job.
do $$ declare j record;d record;scope jsonb;op text;begin
 select * into strict j from pg_temp.capture_job_fixture;select * into strict d from pg_temp.retained_test_fixture;
 scope:=public.worker_read_capital_public_payload_allocation_v1(j.job_id,j.capability,d.allocation_id);
 if scope->>'schemaVersion'<>'capital-public-storage-scope.v1' or scope->>'state'<>'allocated'
 or scope->>'storageObjectId' is distinct from d.object_id::text or scope->>'storageVersion'<>'retention-sql-v1'
 or scope->>'payloadFingerprint' is distinct from d.result->>'payloadFingerprint'
 or scope->>'path' is distinct from d.result->>'path' or scope->>'byteLength' is distinct from d.result->>'byteLength'
 or scope->'retainedPayloadId'<>'null'::jsonb or scope?'canonicalPayload' then raise exception 'public allocated physical scope mismatch';end if;
 begin perform public.worker_read_capital_public_payload_allocation_v1(j.job_id,repeat('x',64),d.allocation_id);raise exception 'public physical scope wrongcap accepted';exception when insufficient_privilege then null;end;
 begin perform public.worker_read_capital_public_payload_allocation_v1(gen_random_uuid(),j.capability,d.allocation_id);raise exception 'public physical scope wrongjob accepted';exception when insufficient_privilege then null;end;
 begin perform public.worker_read_capital_public_payload_allocation_v1(j.job_id,j.capability,gen_random_uuid());raise exception 'public physical scope unknownallocation accepted';exception when insufficient_privilege then null;end;
 begin perform public.worker_read_capital_body_allocation_v1(j.job_id,j.capability,d.allocation_id);raise exception 'public scope entered typed family';exception when insufficient_privilege then null;end;
 perform set_config('request.headers',jsonb_build_object('x-offroad-workspace','20000000-0000-4000-8000-000000000981','x-offroad-job-id',j.job_id,'x-offroad-capability',j.capability)::text,true);
 foreach op in array array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info','object.sign','object.copy'] loop
 perform set_config('storage.operation',op,true);
 if (select count(*) from storage.objects where bucket_id='capital-input-capture' and name=d.result->>'path')<>0 then raise exception 'public direct Storage read allowed for %',op;end if;
 end loop;
 perform set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000981"}',true);
end; $$;
do $$ declare j record; d record; r jsonb; replay jsonb; readback jsonb; l record; begin
 select * into strict j from pg_temp.capture_job_fixture; select * into strict d from pg_temp.retained_test_fixture;
 select * into strict l from pg_temp.capture_public_license_fixture;
 begin
  perform public.worker_commit_capital_public_payload_v1(j.job_id,j.capability,d.allocation_id,d.object_id,'wrong-version',d.result->>'payloadFingerprint',(d.result->>'byteLength')::bigint);
  raise exception 'wrong object version accepted';
 exception when invalid_parameter_value then null; end;
 r:=public.worker_commit_capital_public_payload_v1(j.job_id,j.capability,d.allocation_id,d.object_id,'retention-sql-v1',d.result->>'payloadFingerprint',(d.result->>'byteLength')::bigint);
 replay:=public.worker_commit_capital_public_payload_v1(j.job_id,j.capability,d.allocation_id,d.object_id,'retention-sql-v1',d.result->>'payloadFingerprint',(d.result->>'byteLength')::bigint);
 if r->>'state'<>'complete' or replay->>'retainedPayloadId' is distinct from r->>'retainedPayloadId' or replay->>'replayed'<>'true' then raise exception 'receipt/replay failed'; end if;
 readback:=public.worker_read_capital_public_payload_v1(j.job_id,j.capability,(r->>'retainedPayloadId')::uuid);
 if readback->>'storageObjectId' is distinct from d.object_id::text or readback->>'storageVersion'<>'retention-sql-v1' then raise exception 'read receipt mismatch'; end if;
 readback:=public.worker_read_capital_public_payload_allocation_v1(j.job_id,j.capability,d.allocation_id);
 if readback->>'state'<>'complete' or readback->>'retainedPayloadId' is distinct from r->>'retainedPayloadId' or readback->>'storageObjectId' is distinct from d.object_id::text then raise exception 'public retained physical scope mismatch';end if;
 replay:=public.worker_prepare_capital_public_payload_v1(j.job_id,j.capability,d.delivery_id,d.request_id,l.payload);
 if replay->>'state'<>'complete' or replay->>'retainedPayloadId' is distinct from r->>'retainedPayloadId' or replay?'canonicalPayload' then raise exception 'prepare committed replay failed'; end if;
 update pg_temp.retained_test_fixture set retained_id=(r->>'retainedPayloadId')::uuid;
end; $$;
reset role;
do $$ declare t text; d record; j record; begin
 foreach t in array array['capital_public_payload_allocations','capital_public_retained_payloads','capital_public_payload_purge_queue','capital_public_payload_erasure_events'] loop
  if not(select relrowsecurity and relforcerowsecurity from pg_class where oid=to_regclass('private.'||t))
   or has_table_privilege('authenticated','private.'||t,'select') or has_table_privilege('authenticated','private.'||t,'insert')
   or has_table_privilege('authenticated','private.'||t,'update') or has_table_privilege('authenticated','private.'||t,'delete') then raise exception 'RLS/grants %',t; end if;
 end loop;
 if not(public.worker_runtime_schema_contract_v1()->'capabilities'?'capital-public-retention.v1') then raise exception 'runtime capability absent'; end if;
 if exists(select 1 from private.capital_public_deliveries where state<>'unresolved') or exists(select 1 from private.capital_public_input_snapshots where state<>'unresolved') then raise exception 'retention promoted unrelated object'; end if;
 select * into strict d from pg_temp.retained_test_fixture; select * into strict j from pg_temp.capture_job_fixture;
 begin
  update private.capital_public_retained_payloads set verified_sha256=repeat('0',64) where id=d.retained_id;
  raise exception 'immutable receipt overwritten';
 exception when sqlstate '55000' then null; end;
 -- Metadata-only cloned fixture proves replay after upload window; no immutability
 -- trigger or installed row is disabled/rewritten to manufacture the past.
 begin
  declare clone_id uuid:=gen_random_uuid(); clone_request uuid:=gen_random_uuid(); clone_object uuid; clone_receipt uuid; clone_path text;
  begin
   clone_path:='20000000-0000-4000-8000-000000000981/'||clone_id::text||'/payload.json';
   insert into private.capital_public_payload_allocations(id,organization_id,delivery_id,request_id,license_id,licensing_organization_id,job_id,
    worker_token_id,worker_account_id,capability_sha256,policy_id,payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at)
   select clone_id,organization_id,delivery_id,clone_request,license_id,licensing_organization_id,job_id,worker_token_id,worker_account_id,capability_sha256,
    policy_id,payload_fingerprint,byte_length,clone_path,retained_at,expires_at,purge_at,clock_timestamp()-interval '1 second'
    from private.capital_public_payload_allocations where id=d.allocation_id;
   insert into storage.objects(bucket_id,name,metadata,version) values('capital-input-capture',clone_path,
    jsonb_build_object('size',(d.result->>'byteLength')::bigint,'mimetype','application/json'),'synthetic-past-window') returning id into clone_object;
   insert into private.capital_public_retained_payloads(organization_id,allocation_id,storage_object_id,storage_version,verified_sha256,verified_size,verified_by)
   values('20000000-0000-4000-8000-000000000981',clone_id,clone_object,'synthetic-past-window',d.result->>'payloadFingerprint',
    (d.result->>'byteLength')::bigint,'10000000-0000-4000-8000-000000000981') returning id into clone_receipt;
   insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at)
    select organization_id,id,purge_at,purge_at from private.capital_public_payload_allocations where id=clone_id;
   if public.worker_prepare_capital_public_payload_v1(j.job_id,j.capability,d.delivery_id,clone_request,
    (select payload from pg_temp.capture_public_license_fixture))->>'retainedPayloadId' is distinct from clone_receipt::text then raise exception 'completed window replay lost'; end if;
  end;
  raise exception 'fixture_rollback' using errcode='P3091';
 exception when sqlstate 'P3091' then null; end;
 -- Deadline of a newly restrictive right is enforced, and its event expedites the queue.
 begin
  insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,expires_at,store_until,evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256)
  select organization_id,source_version_id,revision+1,operations,purposes,audience,clock_timestamp(),clock_timestamp()+interval '20 minutes',clock_timestamp()+interval '15 minutes',
   evidence_kind,evidence_reference,evidence_sha256,created_by,public_source_url,public_payload_sha256 from private.source_rights_versions where id=(select rights_version_id from pg_temp.capture_public_license_fixture);
  if (public.worker_read_capital_public_payload_v1(j.job_id,j.capability,d.retained_id)->>'expiresAt')::timestamptz>clock_timestamp()+interval '15 minutes'
   or (select next_check_at from private.capital_public_payload_purge_queue where allocation_id=d.allocation_id)>clock_timestamp() then raise exception 'shortened current deadline/notification ignored'; end if;
  raise exception 'fixture_rollback' using errcode='P3091';
 exception when sqlstate 'P3091' then null; end;
end; $$;
-- Fake Storage metadata cannot turn wrong size/version into a valid receipt/read.
do $$ declare d record; j record; begin
 select * into strict d from pg_temp.retained_test_fixture; select * into strict j from pg_temp.capture_job_fixture;
 begin
  update storage.objects set metadata=jsonb_build_object('size',1,'mimetype','application/json') where id=d.object_id;
  begin
   perform public.worker_read_capital_public_payload_v1(j.job_id,j.capability,d.retained_id); raise exception 'changed object size read';
  exception when insufficient_privilege then null; end;
  begin perform public.worker_read_capital_public_payload_allocation_v1(j.job_id,j.capability,d.allocation_id);raise exception 'public server scope changed size accepted';exception when insufficient_privilege then null;end;
  raise exception 'fixture_rollback' using errcode='P3091';
 exception when sqlstate 'P3091' then null; end;
end; $$;
-- Rights revocation reaches reads immediately, but deletion is independent of the human.
insert into private.worker_tokens(label,token_sha256,execution_account_user_id) values
 ('synthetic-capture-purger',extensions.digest(repeat('v',64),'sha256'),'10000000-0000-4000-8000-000000000982');
update public.source_bindings set revoked_at=clock_timestamp(),revoked_by='10000000-0000-4000-8000-000000000983'
 where id=(select source_binding_id from pg_temp.capture_public_license_fixture);
set local role authenticated;
do $$ declare d record; j record; begin
 select * into strict d from pg_temp.retained_test_fixture; select * into strict j from pg_temp.capture_job_fixture;
 begin
  perform public.worker_read_capital_public_payload_v1(j.job_id,j.capability,d.retained_id); raise exception 'revoked binding read';
 exception when insufficient_privilege then null; end;
 begin perform public.worker_read_capital_public_payload_allocation_v1(j.job_id,j.capability,d.allocation_id);raise exception 'public server scope revoked binding accepted';exception when insufficient_privilege then null;end;
end; $$;
reset role;
update auth.users set banned_until=clock_timestamp()+interval '1 day' where id='10000000-0000-4000-8000-000000000981';
create temp table capture_purge_test_ticket(ticket jsonb);
grant all on capture_purge_test_ticket to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000982","role":"authenticated"}',true);
do $$ declare tickets jsonb; ticket jsonb; again jsonb; begin
 tickets:=public.worker_claim_capital_capture_purge_v1(repeat('v',64));
 ticket:=tickets#>'{items,0}';
 if ticket is null or ticket->>'allocationId' is distinct from (select allocation_id::text from pg_temp.retained_test_fixture) then raise exception 'purge depended on revoked human'; end if;
 insert into pg_temp.capture_purge_test_ticket values(ticket);
 begin
  perform public.worker_ack_capital_capture_purge_v1(repeat('v',64),(ticket->>'purgeId')::uuid,ticket->>'purgeCapability',false);
  raise exception 'missing physical confirmation accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.worker_ack_capital_capture_purge_v1(repeat('v',64),(ticket->>'purgeId')::uuid,ticket->>'purgeCapability',true);
  raise exception 'metadata present marked purged';
 exception when invalid_parameter_value then null; end;
 perform public.worker_retry_capital_capture_purge_v1(repeat('v',64),(ticket->>'purgeId')::uuid,ticket->>'purgeCapability','storage_delete_failed');
end; $$;
reset role;
-- Advance queue fixture, not the immutable body identity or a production deadline.
update private.capital_public_payload_purge_queue set next_check_at=clock_timestamp()-interval '1 second' where allocation_id=(select allocation_id from pg_temp.retained_test_fixture);
set local role authenticated;
do $$ declare next_ticket jsonb; begin
 next_ticket:=public.worker_claim_capital_capture_purge_v1(repeat('v',64))#>'{items,0}';
 if next_ticket is null then raise exception 'retry did not converge'; end if;
 update pg_temp.capture_purge_test_ticket set ticket=next_ticket;
end; $$;
reset role;
-- Storage's own trigger forbids direct SQL deletion. Keep the metadata present and
-- prove ACK denial here; the HTTP eval covers real DELETE, 404 and successful ACK.
set local role authenticated;
do $$ declare t jsonb; begin
 select ticket into strict t from pg_temp.capture_purge_test_ticket;
 begin
  perform public.worker_ack_capital_capture_purge_v1(repeat('v',64),(t->>'purgeId')::uuid,t->>'purgeCapability',true);
  raise exception 'metadata-present retry acknowledged';
 exception when invalid_parameter_value then null; end;
end; $$;
reset role;
do $$ declare t jsonb; begin
 select ticket into strict t from pg_temp.capture_purge_test_ticket;
 if exists(select 1 from private.capital_public_payload_erasure_events where purge_id=(t->>'purgeId')::uuid)
  then raise exception 'denied ACK wrote erasure event'; end if;
end; $$;
select 'capital_public_payload_retention' as test,'PASS' as result;
rollback;
