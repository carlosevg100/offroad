-- LOCAL disposable HTTP fixture only. Grandfathered execution approval is explicitly
-- fixture history; the native provider input/body/Storage/receipts are actual SDK products.
-- Synthetic provider records only. Execute transactionally; never leaves business fixtures.
begin;
\ir legacy_workspace_capabilities.sql
\ir legacy_persistent_work_fixture.sql
create function pg_temp.provider_research_plan_fixture() returns jsonb language sql as $fn$ select $plan${"schemaVersion": "capital-project-plan.v1", "compilerVersion": "2026.09.01-v3", "registryVersion": "2026.09.10-public-research-v2", "job": {"id": "company_debt_view", "targetTaskIds": ["K02"], "firstWorkProduct": "provider_research", "confirmationGate": "diagnostic", "accessPolicy": "public_or_private", "inputPolicy": {"company": "not_applicable", "documents": "not_applicable", "capitalIntent": "not_applicable", "existingTransaction": "not_applicable", "publicResearch": "allowed"}}, "taskSpecs": [{"id": "M01", "label": "Resolver companhia, grupo, jurisdição e regime de evidência", "graph": "case", "dependencies": [], "executionClass": "extraction", "effect": "propose_state", "maturity": "specified", "readingStrategies": ["exhaustive_corpus"], "ordinal": 0, "batch": 0}, {"id": "K01", "label": "Atualizar universo de financiadores", "graph": "market", "dependencies": ["M01"], "executionClass": "research", "effect": "commit", "maturity": "specified", "readingStrategies": ["exact_search", "semantic_retrieval"], "ordinal": 1, "batch": 1}, {"id": "K02", "label": "Normalizar mandatos", "graph": "market", "dependencies": ["K01"], "executionClass": "deterministic", "effect": "commit", "maturity": "specified", "readingStrategies": ["structured_query"], "ordinal": 2, "batch": 2}], "parallelBatches": [["M01"], ["K01"], ["K02"]]}$plan$::jsonb; $fn$;
\ir execution_approval.sql
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
('10000000-0000-4000-8000-000000000981','authenticated','authenticated','provider-research-a@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false),
('10000000-0000-4000-8000-000000000982','authenticated','authenticated','provider-research-b@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000981','originator','Synthetic research A','10000000-0000-4000-8000-000000000981'),
('20000000-0000-4000-8000-000000000982','originator','Synthetic research B','10000000-0000-4000-8000-000000000982');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
('20000000-0000-4000-8000-000000000981','10000000-0000-4000-8000-000000000981','owner','active',now()),
('20000000-0000-4000-8000-000000000982','10000000-0000-4000-8000-000000000982','owner','active',now());
insert into public.onboarding_progress(organization_id,user_id,journey,current_step) values
('20000000-0000-4000-8000-000000000981','10000000-0000-4000-8000-000000000981','originator','organization');
insert into public.funds(id,organization_id,name,strategy,created_by) values
('40000000-0000-4000-8000-000000000981','20000000-0000-4000-8000-000000000981','Synthetic owned fund','credit','10000000-0000-4000-8000-000000000981'),
('40000000-0000-4000-8000-000000000982','20000000-0000-4000-8000-000000000982','Synthetic other tenant fund','credit','10000000-0000-4000-8000-000000000982');
insert into public.mandate_versions(organization_id,fund_id,version_number,status,source_kind,constraints,valid_from,created_by) values
('20000000-0000-4000-8000-000000000981','40000000-0000-4000-8000-000000000981',1,'active','synthetic','{"ticket_min":1000000,"sectors":["synthetic"],"notes":"MUST NOT LEAK","contact_email":"private@example.invalid"}',current_date,'10000000-0000-4000-8000-000000000981');
insert into public.fund_directory(id,legal_name,kind,status,claimed_by_organization_id,claimed_at) values
('50000000-0000-4000-8000-000000000981','Synthetic owned directory','credit_fund','registered','20000000-0000-4000-8000-000000000981',now()),
('50000000-0000-4000-8000-000000000982','Synthetic other directory','credit_fund','registered','20000000-0000-4000-8000-000000000982',now());
create temp table provider_research_fixture(job_id uuid, frozen jsonb);
grant all on provider_research_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
do $$
declare p jsonb:=pg_temp.provider_research_plan_fixture(); r jsonb; replay jsonb; request uuid:=gen_random_uuid(); mutation jsonb;
begin
  perform pg_temp.legacy_advisor_result(public.start_advisor_project_v1(request,'pt-BR','Synthetic provider research',p#>>'{job,id}','Pesquise os financiadores disponíveis para nossa organização.','public_information',p));
  r:=public.start_provider_research_project_v1(request,'pt-BR','Synthetic provider research','Pesquise os financiadores disponíveis para nossa organização.',p,null);
  replay:=public.start_provider_research_project_v1(request,'pt-BR','Synthetic provider research','Pesquise os financiadores disponíveis para nossa organização.',p,null);
  if replay->>'research_job_id' is distinct from r->>'research_job_id' then raise exception 'research replay duplicated job'; end if;
  if (select count(*) from public.processing_jobs where id=(r->>'research_job_id')::uuid and status='awaiting_approval')<>1 then raise exception 'research not held for approval'; end if;
  if (select array_agg(task_id order by ordinal) from public.capital_project_plan_tasks where capital_project_id=(r->>'capital_project_id')::uuid) is distinct from array['M01','K01','K02'] then raise exception 'research plan task mismatch'; end if;
  insert into pg_temp.provider_research_fixture select (r->>'research_job_id')::uuid,content from public.capital_project_briefs where capital_project_id=(r->>'capital_project_id')::uuid and brief_kind='provider_research';
  begin
    perform public.start_provider_research_project_v1(request,'pt-BR','Synthetic provider research','Changed objective',p,null);
    raise exception 'changed objective replay accepted';
  exception when invalid_parameter_value then null; end;
  for mutation in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_set(p,'{job,targetTaskIds}','["K04"]'),jsonb_set(p,'{taskSpecs,2,dependencies}','[]'),
    jsonb_set(p,'{job,firstWorkProduct}','"match_screen"'),jsonb_set(p,'{registryVersion}','"unknown"')
  )) loop
    begin
      perform public.start_provider_research_project_v1(gen_random_uuid(),'pt-BR','Synthetic mutation','Pesquise financiadores.',mutation,null);
      raise exception 'altered research plan accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  begin
    perform public.worker_load_provider_research_context((r->>'research_job_id')::uuid,repeat('x',64));
    raise exception 'unapproved research capability accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into private.worker_tokens(label,token_sha256,execution_account_user_id) values('synthetic-provider-research-worker',extensions.digest(repeat('v',64),'sha256'),'10000000-0000-4000-8000-000000000981') on conflict(token_sha256) do update set status='active',revoked_at=null;


select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
do $$declare job uuid;begin select job_id into strict job from pg_temp.provider_research_fixture;perform pg_temp.fixture_approve_execution(job);update public.processing_jobs set available_at=clock_timestamp()-interval'1 day'where id=job;end$$;
update auth.users set instance_id='00000000-0000-0000-0000-000000000000',encrypted_password=extensions.crypt('native-provider-isolated-local-password',extensions.gen_salt('bf')),
 email_confirmed_at=clock_timestamp(),confirmation_token='',recovery_token='',email_change_token_new='',email_change=''where id='10000000-0000-4000-8000-000000000981';
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)
select gen_random_uuid(),id,id::text,'email',jsonb_build_object('sub',id,'email',email),clock_timestamp(),clock_timestamp()from auth.users where id='10000000-0000-4000-8000-000000000981';
select job_id::text from pg_temp.provider_research_fixture;
commit;
