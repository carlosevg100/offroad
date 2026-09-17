-- Synthetic staging probe; every record is rolled back. No production execution.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
select set_config('request.jwt.claims','{}',true);
do $$
declare
 a uuid := 'a11b0000-0000-4000-8000-000000000001';
 b uuid := 'a11b0000-0000-4000-8000-000000000002';
 o uuid := 'a11b0000-0000-4000-9000-000000000001';
 p uuid := 'a11b0000-0000-4000-9000-000000000002';
 s uuid := 'a11b0000-0000-4000-9000-000000000003';
 d uuid := 'a11b0000-0000-4000-9000-000000000004';
 r uuid := 'a11b0000-0000-4000-9000-000000000005';
 c uuid := 'a11b0000-0000-4000-9000-000000000006';
begin
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
 values(a,'authenticated','authenticated','a11b-a@example.invalid','{}','{}',now(),now(),false,false),
 (b,'authenticated','authenticated','a11b-b@example.invalid','{}','{}',now(),now(),false,false);
 insert into public.organizations(id,organization_type,name,created_by) values(o,'originator','Synthetic 1B organization',a);
 insert into public.organization_memberships(organization_id,user_id,role,status) values(o,a,'owner','active'),(o,b,'member','active');
 perform set_config('request.jwt.claim.sub',a::text,true);
 insert into public.capital_projects(id,organization_id,project_name,created_by,private_access_granted_at,private_access_granted_by)
 values(p,o,'Synthetic restricted project',a,now(),a);
 insert into public.document_intake_sessions(id,organization_id,started_by,journey,capital_project_id) values(s,o,a,'originator',p);
 insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,created_by,processing_status)
 values(d,o,s,o::text||'/'||s::text||'/synthetic.txt','Synthetic confidential source','text/plain',a,'ready');
 insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by)
 values(r,o,s,1,'manual','synthetic-1b',a);
 insert into public.case_retrieval_chunks(organization_id,intake_session_id,source_document_id,document_version,processing_run_id,chunk_key,content,content_hash,source_anchor)
 values(o,s,d,1,r,'synthetic-1b','Synthetic confidential information for access boundary probe.',repeat('a',64),'{}');
 insert into public.agent_conversations(id,organization_id,intake_session_id,created_by) values(c,o,s,a);
 insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,created_by)
 values('a11b0000-0000-4000-9000-000000000007',o,c,s,'user','completed','Synthetic confidential question','pt-BR',a);
end $$;

insert into private.worker_tokens(id,label,token_sha256) values('a11b0000-0000-4000-9000-000000000010','Synthetic 1B token',extensions.digest(repeat('b',64),'sha256'));
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,available_at,leased_by,lease_expires_at,capability_sha256)
values('a11b0000-0000-4000-9000-000000000011','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000004','document_pipeline','queued','-infinity',null,null,null),
('a11b0000-0000-4000-9000-000000000012','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000004','document_pipeline','leased',now(),'a11b0000-0000-4000-9000-000000000010',now()+interval '10 minutes',extensions.digest(repeat('c',64),'sha256'));
update public.organization_memberships set status='suspended' where organization_id='a11b0000-0000-4000-9000-000000000001' and user_id='a11b0000-0000-4000-8000-000000000001';
create temp table job_probe_result(key text,value boolean);
do $$
declare j jsonb; held public.processing_jobs;
begin
 j:=private.worker_claim_job_v2(repeat('b',64),600);
 insert into job_probe_result values('queued_job_claimed_after_human_revocation',coalesce(j->>'job_id'='a11b0000-0000-4000-9000-000000000011',false));
 begin
  held:=private.job_for_capability('a11b0000-0000-4000-9000-000000000012',repeat('c',64));
  insert into job_probe_result values('leased_job_capability_after_human_revocation',held.id is not null);
 exception when insufficient_privilege then insert into job_probe_result values('leased_job_capability_after_human_revocation',false);
 end;
 begin
  perform private.worker_heartbeat('a11b0000-0000-4000-9000-000000000012',repeat('c',64),600);
  insert into job_probe_result values('heartbeat_after_human_revocation',true);
 exception when insufficient_privilege then insert into job_probe_result values('heartbeat_after_human_revocation',false);
 end;
 begin
  perform private.worker_complete_job('a11b0000-0000-4000-9000-000000000012',repeat('c',64),'{"synthetic":true}');
  insert into job_probe_result values('result_published_after_human_revocation',true);
 exception when insufficient_privilege then insert into job_probe_result values('result_published_after_human_revocation',false);
 end;
end $$;
do $$ begin if exists(select 1 from job_probe_result where value is distinct from false) then raise exception 'revoked job retained authority'; end if; end $$;
select jsonb_object_agg(key,value) as result from job_probe_result;
rollback;
