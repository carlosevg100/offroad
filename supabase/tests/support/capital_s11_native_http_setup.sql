-- LOCAL HTTP bootstrap only. The launcher rejects non-loopback DATABASE_URL.
-- Genuine approved job and human publication; no native receipt, model outcome,
-- TaskRun, CPA, or Storage metadata fabricated. Reset the local stack afterwards.
reset role;
-- Human publication of a synthetic source in the isolated local HTTP fixture.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('10000000-0000-4000-8000-000000000994','authenticated','authenticated','s11-publisher@example.invalid','{}','{}',now(),now(),false,false);
-- The publisher is a separate Offroad organization. Its right never becomes a
-- consumer-tenant source row by virtue of the consumer's membership.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000994","role":"authenticated"}',true);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000994','offroad','Synthetic capture publisher','10000000-0000-4000-8000-000000000994');
insert into public.organization_memberships(organization_id,user_id,role,status) values
('20000000-0000-4000-8000-000000000994','10000000-0000-4000-8000-000000000994','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by) values
('30000000-0000-4000-8000-000000000994','20000000-0000-4000-8000-000000000994','Synthetic capture source','10000000-0000-4000-8000-000000000994');
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000994"}',true);
create temp table capture_public_license_fixture(source_version_id uuid,source_binding_id uuid,rights_version_id uuid,payload jsonb);
grant select on capture_public_license_fixture to authenticated;
do $$ declare v uuid:=gen_random_uuid(); b uuid; r uuid; sample jsonb; begin
 sample:='{"topic":"identity","provider":"official","retrievedAt":"2026-10-02T00:00:00Z","url":"https://example.invalid/capture-licensed","title":"Synthetic licensed source","snippet":"Licensed excerpt only","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'::jsonb;
 insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by)
 values(v,'20000000-0000-4000-8000-000000000994','30000000-0000-4000-8000-000000000994','30000000-0000-4000-8000-000000000994','10000000-0000-4000-8000-000000000994');
 insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,initial_verification_state,created_by)
 values(v,'20000000-0000-4000-8000-000000000994',v,1,1,'opportunity-documents','20000000-0000-4000-8000-000000000994/synthetic/'||v,'Synthetic excerpt','pending_verification','10000000-0000-4000-8000-000000000994');
 insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
 values('20000000-0000-4000-8000-000000000994',v,'30000000-0000-4000-8000-000000000994','30000000-0000-4000-8000-000000000994',gen_random_uuid(),'10000000-0000-4000-8000-000000000994') returning id into b;
 r:=public.declare_public_source_reuse_v1(v,0,sample->>'url',private.public_source_payload_sha256_v1(sample),now()+interval '60 days',now()+interval '60 days',v,repeat('b',64));
 insert into pg_temp.capture_public_license_fixture values(v,b,r,sample);
end; $$;


reset role;
create function pg_temp.s11_route() returns jsonb language sql as $$select jsonb_build_object('provider','anthropic','model','claude-sonnet-5','accountRef','s11-sql-account','projectRef','s11-sql-project','credentialBinding','s11-sql-key','endpoint','https://api.anthropic.com/v1/messages','region','global');$$;
do $$declare resource text;d jsonb;begin
 foreach resource in array array['inference','prompt_cache','schema_cache'] loop
 d:=pg_temp.s11_route()-'model'||jsonb_build_object('id',gen_random_uuid(),'policyVersion','offroad-provider-retention-v2','resource',resource,'models',jsonb_build_array('claude-sonnet-5'),'purposes',jsonb_build_array('case_analysis'),'classifications',jsonb_build_array('restricted'),'rights',jsonb_build_array('process'),'trainingUse','prohibited','eligibility','supported','zeroRetention','not_contracted','revokedAt',null,'reviewedBy','SQL-fixture','reviewedAt',clock_timestamp()-interval '1 minute','validThrough',clock_timestamp()+interval '2 days','retention',jsonb_build_object('requestContentSeconds',0,'abuseMonitoringSeconds',0,'applicationStateSeconds',0,'cacheSeconds',0,'metadataSeconds',0,'exceptions','[]'::jsonb),'evidence',jsonb_build_array(jsonb_build_object('kind','provider_terms','reference','synthetic-rollback-only','sha256',repeat('1',64)),jsonb_build_object('kind','account_configuration','reference','synthetic-rollback-only','sha256',repeat('2',64)),jsonb_build_object('kind','credential_binding','reference','synthetic-rollback-only','sha256',repeat('3',64))));
 perform private.record_provider_processing_assurance_v1(d,'Synthetic rollback-only provider evidence');
 end loop;
end$$;

update auth.users set instance_id='00000000-0000-0000-0000-000000000000',
 encrypted_password=extensions.crypt('s11-isolated-local-eval-password',extensions.gen_salt('bf')),
 email_confirmed_at=clock_timestamp(),confirmation_token='',recovery_token='',email_change_token_new='',email_change=''
 where id='a8800000-0000-4000-8000-000000000001';
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)
values(gen_random_uuid(),'a8800000-0000-4000-8000-000000000001','a8800000-0000-4000-8000-000000000001','email',
 '{"sub":"a8800000-0000-4000-8000-000000000001","email":"native-agent@example.invalid"}',clock_timestamp(),clock_timestamp());

update public.processing_jobs set available_at=(select coalesce(min(available_at),clock_timestamp())-interval '1 second' from public.processing_jobs)
where id=(select(v#>>'{activation,job_id}')::uuid from agent_fixture where k='recorded') and organization_id='a8800000-0000-4000-8000-000000000002' and kind='capital_project_analysis' and payload->>'analysis_scope'='capital_planning' and status='queued';
