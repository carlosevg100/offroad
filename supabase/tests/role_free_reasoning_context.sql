-- Synthetic stage 1C non-interference proof. Both transactions roll back.
begin;
\ir support/legacy_workspace_capabilities.sql
-- Synthetic 1B fixture. Caller owns BEGIN/ROLLBACK.
select set_config('request.jwt.claims','{}',true);
do $$
declare
 a uuid := 'a11c0000-0000-4000-8000-000000000001';
 b uuid := 'a11c0000-0000-4000-8000-000000000002';
 o uuid := 'a11c0000-0000-4000-9000-000000000001';
 p uuid := 'a11c0000-0000-4000-9000-000000000002';
 s uuid := 'a11c0000-0000-4000-9000-000000000003';
 d uuid := 'a11c0000-0000-4000-9000-000000000004';
 r uuid := 'a11c0000-0000-4000-9000-000000000005';
 c uuid := 'a11c0000-0000-4000-9000-000000000006';
begin
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
 values(a,'authenticated','authenticated','a11c-a@example.invalid','{}','{}',now(),now(),false,false),
 (b,'authenticated','authenticated','a11c-b@example.invalid','{}','{}',now(),now(),false,false);
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
 values('a11c0000-0000-4000-9000-000000000007',o,c,s,'user','completed','Synthetic confidential question','pt-BR',a);
end $$;

insert into private.worker_tokens(id,label,token_sha256) values('a11c0000-0000-4000-9000-000000000010','Synthetic 1C',extensions.digest(repeat('c',64),'sha256'));
create temp table role_context_probe(profile text,loader text,context jsonb);
do $$
declare idx integer:=0; role_name text; u uuid; run_id uuid; msg_id uuid; job_id uuid; loader text; ctx jsonb;
begin
 foreach role_name in array array['cfo','credit_analyst','financial_advisor','absent'] loop
  idx:=idx+1;u:=gen_random_uuid();run_id:=gen_random_uuid();msg_id:=gen_random_uuid();job_id:=gen_random_uuid();
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values(u,'authenticated','authenticated','synthetic-1c-'||idx||'@example.invalid','{}','{}');
  insert into public.organization_memberships(organization_id,user_id,role,status) values('a11c0000-0000-4000-9000-000000000001',u,'member','active');
  insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,grant_basis) values('a11c0000-0000-4000-9000-000000000001','a11c0000-0000-4000-9000-000000000002',u,'work','explicit');
  if role_name<>'absent' then
   insert into public.professional_context_profiles(organization_id,user_id,use_forms,professional_roles,practice_areas,primary_objectives,disclosure_status)
   values('a11c0000-0000-4000-9000-000000000001',u,array['institutional_work'],array[role_name],array['corporate_finance'],array['evaluate_capital_options'],'complete');
  end if;
  insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by) values(run_id,'a11c0000-0000-4000-9000-000000000001','a11c0000-0000-4000-9000-000000000003',10+idx,'manual','synthetic-1c',u);
  insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,created_by) values(msg_id,'a11c0000-0000-4000-9000-000000000001','a11c0000-0000-4000-9000-000000000006','a11c0000-0000-4000-9000-000000000003','user','queued','Compare as alternativas de estrutura de capital com base no documento disponível.','pt-BR',u);
  insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,status,leased_by,leased_account_user_id,lease_expires_at,capability_sha256,payload)
  values(job_id,'a11c0000-0000-4000-9000-000000000001',run_id,'a11c0000-0000-4000-9000-000000000003','agent_operation_brief','leased','a11c0000-0000-4000-9000-000000000010','a11c0000-0000-4000-8000-000000000001',now()+interval '10 minutes',extensions.digest(repeat('d',64),'sha256'),jsonb_build_object('message_id',msg_id));
  foreach loader in array array['worker_load_agent_context','worker_load_agent_context_v2','worker_load_agent_context_v3','worker_load_agent_context_v4','worker_load_agent_context_v5'] loop
   execute 'set local role authenticated';
   execute format('select public.%I($1,$2)',loader) into ctx using job_id,repeat('d',64);
   execute 'reset role';
   insert into role_context_probe values(role_name,loader,ctx);
  end loop;
 end loop;
end $$;

do $$
begin
 if exists(select 1 from role_context_probe where context ? 'professional_context' or context::text like '%professionalRoles%') then
  raise exception 'professional profile leaked into a loader context';
 end if;
 if exists(select loader from role_context_probe group by loader having count(distinct (context-'message_id')::text) <> 1 or count(*)<>4) then
  raise exception 'loader context changed with requester professional role';
 end if;
 if (select count(*) from public.professional_context_profiles where organization_id='a11c0000-0000-4000-9000-000000000001')<>3 then
  raise exception 'historical private profiles were changed';
 end if;
end $$;
select 'agent_loaders_v1_v5_four_roles' as test, 'PASS' as result;

rollback;

begin;
\ir support/execution_approval.sql
-- Synthetic 1B fixture. Caller owns BEGIN/ROLLBACK.
select set_config('request.jwt.claims','{}',true);
do $$
declare
 a uuid := 'a11c0000-0000-4000-8000-000000000001';
 b uuid := 'a11c0000-0000-4000-8000-000000000002';
 o uuid := 'a11c0000-0000-4000-9000-000000000001';
 p uuid := 'a11c0000-0000-4000-9000-000000000002';
 s uuid := 'a11c0000-0000-4000-9000-000000000003';
 d uuid := 'a11c0000-0000-4000-9000-000000000004';
 r uuid := 'a11c0000-0000-4000-9000-000000000005';
 c uuid := 'a11c0000-0000-4000-9000-000000000006';
begin
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
 values(a,'authenticated','authenticated','a11c-a@example.invalid','{}','{}',now(),now(),false,false),
 (b,'authenticated','authenticated','a11c-b@example.invalid','{}','{}',now(),now(),false,false);
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
 values('a11c0000-0000-4000-9000-000000000007',o,c,s,'user','completed','Synthetic confidential question','pt-BR',a);
end $$;

update public.capital_projects set entry_job='origination_thesis',access_basis='public_information' where id='a11c0000-0000-4000-9000-000000000002';
insert into private.integration_preview_grants(organization_id,granted_by) values('a11c0000-0000-4000-9000-000000000001','Synthetic 1C test');
insert into private.worker_tokens(id,label,token_sha256) values('a11c0000-0000-4000-9000-000000000010','Synthetic 1C',extensions.digest(repeat('c',64),'sha256'));
create temp table role_context_probe(profile text,loader text,context jsonb);
do $$
declare
 role_name text; u uuid; run_id uuid; job_id uuid; loader text; ctx jsonb; idx integer:=20;
 p uuid:='a11c0000-0000-4000-9000-000000000002';
 o uuid:='a11c0000-0000-4000-9000-000000000001';
 s uuid:='a11c0000-0000-4000-9000-000000000003';
 plan_id uuid; brief_id uuid:=gen_random_uuid(); preview_id uuid:=gen_random_uuid(); scope text;
begin
 plan_id:=pg_temp.fixture_execution_plan(s);
 insert into public.capital_project_briefs(id,organization_id,capital_project_id,request_id,brief_kind,brief_version,content,content_fingerprint,created_by)
 values(brief_id,o,p,gen_random_uuid(),'origination_thesis',1,'{"synthetic":true}',repeat('a',64),'a11c0000-0000-4000-8000-000000000001'),
 (preview_id,o,p,gen_random_uuid(),'integration_preview',1,'{"synthetic":true}',repeat('b',64),'a11c0000-0000-4000-8000-000000000001');
 foreach role_name in array array['cfo','credit_analyst','financial_advisor','absent'] loop
  idx:=idx+1;u:=gen_random_uuid();run_id:=gen_random_uuid();
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values(u,'authenticated','authenticated','synthetic-capital-1c-'||idx||'@example.invalid','{}','{}');
  insert into public.organization_memberships(organization_id,user_id,role,status) values(o,u,'member','active');
  insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,grant_basis) values(o,p,u,'work','explicit');
  if role_name<>'absent' then
   insert into public.professional_context_profiles(organization_id,user_id,use_forms,professional_roles,practice_areas,primary_objectives,disclosure_status)
   values(o,u,array['institutional_work'],array[role_name],array['corporate_finance'],array['evaluate_capital_options'],'complete');
  end if;
  insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by) values(run_id,o,s,idx,'manual','synthetic-1c',u);
  foreach scope in array array['origination_thesis','integration_preview'] loop
   job_id:=gen_random_uuid();
   insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,status,leased_by,leased_account_user_id,lease_expires_at,capability_sha256,payload)
   values(job_id,o,run_id,s,'capital_project_analysis','leased','a11c0000-0000-4000-9000-000000000010','a11c0000-0000-4000-8000-000000000001',now()+interval '10 minutes',extensions.digest(repeat('d',64),'sha256'),
    jsonb_build_object('analysis_scope',scope,'capital_project_id',p,'capital_project_plan_id',plan_id,'capital_project_brief_id',case when scope='integration_preview' then preview_id else brief_id end));
   perform pg_temp.fixture_approve_execution(job_id,true);
   foreach loader in array case when scope='integration_preview' then array['worker_load_capital_project_context_v6'] else array['worker_load_capital_project_context','worker_load_capital_project_context_v2','worker_load_capital_project_context_v3','worker_load_capital_project_context_v4','worker_load_capital_project_context_v5','worker_load_capital_project_context_v6'] end loop
    execute 'set local role authenticated';
    execute format('select public.%I($1,$2)',loader) into ctx using job_id,repeat('d',64);
    execute 'reset role';
    insert into role_context_probe values(role_name,loader||':'||scope,ctx);
   end loop;
  end loop;
 end loop;
end $$;

do $$
begin
 if exists(select 1 from role_context_probe where context ? 'professional_context' or context::text like '%professionalRoles%') then
  raise exception 'professional profile leaked into a loader context';
 end if;
 if exists(select loader from role_context_probe group by loader having count(distinct (context-'message_id')::text) <> 1 or count(*)<>4) then
  raise exception 'loader context changed with requester professional role';
 end if;
 if (select count(*) from public.professional_context_profiles where organization_id='a11c0000-0000-4000-9000-000000000001')<>3 then
  raise exception 'historical private profiles were changed';
 end if;
end $$;
select 'capital_loaders_v1_v6_and_preview_four_roles' as test, 'PASS' as result;

set local role authenticated;
do $$
declare helper text; denied boolean;
begin
 foreach helper in array array['worker_load_agent_context_before_execution_brief_v1','worker_load_agent_context_before_professional_context_v1','worker_load_agent_context_before_institutional_v1'] loop
  denied:=false;
  begin
   execute format('select private.%I($1,$2)',helper) using 'a11c0000-0000-4000-9000-000000000099'::uuid,repeat('d',64);
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'internal helper remained callable: %',helper; end if;
 end loop;
end $$;
reset role;
select 'internal_loader_helpers_denied' as test, 'PASS' as result;
do $$
begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.proname like 'worker_load_%'
  and p.prosrc like '%public.professional_context_profiles%') then
  raise exception 'a legacy loader still reads historical professional profiles';
 end if;
end $$;
select 'no_legacy_loader_reads_profiles' as test, 'PASS' as result;


rollback;
