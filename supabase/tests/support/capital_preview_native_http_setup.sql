-- LOOPBACK CI ONLY, invoked by guarded PREVIEW_HTTP_FIXTURE launcher.
-- No paid invocation, native receipt, TaskRun, CPA or Storage metadata is seeded.
reset role;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('a8800000-0000-4000-8000-000000000993','authenticated','authenticated','preview-publisher@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organizations(id,organization_type,name,created_by)values('a8800000-0000-4000-8000-000000000994','offroad','Synthetic preview publisher','a8800000-0000-4000-8000-000000000993');
insert into public.organization_memberships(organization_id,user_id,role,status)values('a8800000-0000-4000-8000-000000000994','a8800000-0000-4000-8000-000000000993','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by)values('a8800000-0000-4000-8000-000000000995','a8800000-0000-4000-8000-000000000994','Synthetic exact preview source publication','a8800000-0000-4000-8000-000000000993');
create temp table preview_publisher_session as select pg_temp.legacy_intake_for_work('a8800000-0000-4000-8000-000000000995')id;
create temp table preview_verified_documents(id uuid,job_id uuid,file_name text,sha text,size bigint,binding_id uuid);
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,budget,versions,created_by)
select 'a8800000-0000-4000-8000-000000000997','a8800000-0000-4000-8000-000000000994',id,1,'manual','running','preview-ci-verification','{}','{}','a8800000-0000-4000-8000-000000000993'from preview_publisher_session;
do $$declare e jsonb;doc uuid;scanner_job uuid;binding uuid;begin
 for e in select value from jsonb_array_elements(private.capital_preview_consumed_corpus_registry_v1()->'entries')loop
 doc:=gen_random_uuid();scanner_job:=gen_random_uuid();
 insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,sha256,byte_size,processing_status,scan_result,created_by)
 select doc,'a8800000-0000-4000-8000-000000000994',id,'a8800000-0000-4000-8000-000000000994/preview-ci/'||doc,e->>'file',e->>'sha256',(e->>'bytes')::bigint,'ready','{"verdict":"clean"}','a8800000-0000-4000-8000-000000000993'from preview_publisher_session;
 insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,payload,leased_account_user_id,lease_expires_at,capability_sha256)
 select scanner_job,'a8800000-0000-4000-8000-000000000994','a8800000-0000-4000-8000-000000000997',id,doc,'document_pipeline','leased',jsonb_build_object('document_version',1,'sha256',e->>'sha256'),'a8800000-0000-4000-8000-000000000993',clock_timestamp()+interval '10 minutes',extensions.digest(repeat('d',64),'sha256')from preview_publisher_session;
 select id into binding from public.source_bindings where organization_id='a8800000-0000-4000-8000-000000000994'and source_version_id=doc and resource_id='a8800000-0000-4000-8000-000000000995';
 if binding is null then insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)values('a8800000-0000-4000-8000-000000000994',doc,'a8800000-0000-4000-8000-000000000995','a8800000-0000-4000-8000-000000000995',gen_random_uuid(),'a8800000-0000-4000-8000-000000000993')returning id into binding;end if;
 insert into preview_verified_documents values(doc,scanner_job,e->>'file',e->>'sha256',(e->>'bytes')::bigint,binding);
 end loop;
end$$;
create function pg_temp.verify_preview_documents()returns void language plpgsql security definer set search_path=''as $$declare d record;begin
 for d in select*from pg_temp.preview_verified_documents loop
 perform private.register_source_verification_v1(d.job_id,repeat('d',64),jsonb_build_object('verdict','clean','organizationId','a8800000-0000-4000-8000-000000000994','sourceDocumentId',d.id,'operationId',d.job_id,'documentVersion',1,'observedSha256',d.sha,'expectedSha256',d.sha,'observedByteSize',d.size,'expectedByteSize',d.size,'receiptId','sha256:'||d.sha));
 end loop;end$$;
grant select on preview_verified_documents to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a8800000-0000-4000-8000-000000000993","role":"authenticated"}',true);
select set_config('request.headers','{"x-offroad-workspace":"a8800000-0000-4000-8000-000000000994"}',true);
select pg_temp.verify_preview_documents();
do $$declare d record;url text;payload jsonb;begin
 for d in select*from pg_temp.preview_verified_documents loop
 url:='https://example.invalid/preview-ci/'||d.id;
 payload:=jsonb_build_object('url',url,'title','Synthetic isolated publication','snippet','Exact installed extraction for internal test','contentHash',d.sha);
 perform public.declare_public_source_reuse_v1(d.id,0,url,private.public_source_payload_sha256_v1(payload),clock_timestamp()+interval '2 days',clock_timestamp()+interval '2 days',d.id,d.sha);
 end loop;
 insert into pg_temp.agent_fixture values('preview_basis',public.publish_capital_preview_consumed_basis_v1(gen_random_uuid(),(select jsonb_agg(jsonb_build_object('file',file_name,'sourceVersionId',id,'sourceBindingId',binding_id)order by file_name)from pg_temp.preview_verified_documents),clock_timestamp()+interval '1 day'));
end$$;
reset role;
create function pg_temp.preview_route() returns jsonb language sql as $$select jsonb_build_object('provider','anthropic','model','claude-sonnet-5','accountRef','preview-http-account','projectRef','preview-http-project','credentialBinding','preview-http-key','endpoint','https://api.anthropic.com/v1/messages','region','global');$$;
do $$declare resource text;d jsonb;begin
 foreach resource in array array['inference','prompt_cache','schema_cache'] loop
 d:=pg_temp.preview_route()-'model'||jsonb_build_object('id',gen_random_uuid(),'policyVersion','offroad-provider-retention-v2','resource',resource,'models',jsonb_build_array('claude-sonnet-5'),'purposes',jsonb_build_array('case_analysis'),'classifications',jsonb_build_array('restricted'),'rights',jsonb_build_array('process'),'trainingUse','prohibited','eligibility','supported','zeroRetention','not_contracted','revokedAt',null,'reviewedBy','SQL-fixture','reviewedAt',clock_timestamp()-interval '1 minute','validThrough',clock_timestamp()+interval '2 days','retention',jsonb_build_object('requestContentSeconds',0,'abuseMonitoringSeconds',0,'applicationStateSeconds',0,'cacheSeconds',0,'metadataSeconds',0,'exceptions','[]'::jsonb),'evidence',jsonb_build_array(jsonb_build_object('kind','provider_terms','reference','synthetic-rollback-only','sha256',repeat('1',64)),jsonb_build_object('kind','account_configuration','reference','synthetic-rollback-only','sha256',repeat('2',64)),jsonb_build_object('kind','credential_binding','reference','synthetic-rollback-only','sha256',repeat('3',64))));
 perform private.record_provider_processing_assurance_v1(d,'Synthetic rollback-only provider evidence');
 end loop;
end$$;

update auth.users set instance_id='00000000-0000-0000-0000-000000000000',
 encrypted_password=extensions.crypt('preview-isolated-local-eval-password',extensions.gen_salt('bf')),
 email_confirmed_at=clock_timestamp(),confirmation_token='',recovery_token='',email_change_token_new='',email_change=''
 where id='a8800000-0000-4000-8000-000000000001';
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)
values(gen_random_uuid(),'a8800000-0000-4000-8000-000000000001','a8800000-0000-4000-8000-000000000001','email',
 '{"sub":"a8800000-0000-4000-8000-000000000001","email":"native-agent@example.invalid"}',clock_timestamp(),clock_timestamp());

update public.processing_jobs set available_at=(select coalesce(min(available_at),clock_timestamp())-interval '1 second' from public.processing_jobs)
where id=(select(v#>>'{activation,job_id}')::uuid from agent_fixture where k='recorded') and organization_id='a8800000-0000-4000-8000-000000000002' and kind='capital_project_analysis' and payload->>'analysis_scope'='integration_preview' and status='queued';
