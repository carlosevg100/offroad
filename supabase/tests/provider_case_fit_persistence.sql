-- Synthetic provider records only. Execute transactionally; never leaves business fixtures.
begin;
\ir support/provider_case_fit_plan_snapshot.sql
\ir support/provider_research_plan_snapshot.sql
\ir support/execution_approval.sql
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
('10000000-0000-4000-8000-000000000971','authenticated','authenticated','case-fit-a@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false),
('10000000-0000-4000-8000-000000000972','authenticated','authenticated','case-fit-b@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000971','originator','Synthetic research A','10000000-0000-4000-8000-000000000971'),
('20000000-0000-4000-8000-000000000972','originator','Synthetic research B','10000000-0000-4000-8000-000000000972');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
('20000000-0000-4000-8000-000000000971','10000000-0000-4000-8000-000000000971','owner','active',now()),
('20000000-0000-4000-8000-000000000972','10000000-0000-4000-8000-000000000972','owner','active',now());
insert into public.onboarding_progress(organization_id,user_id,journey,current_step) values
('20000000-0000-4000-8000-000000000971','10000000-0000-4000-8000-000000000971','originator','organization');
insert into public.funds(id,organization_id,name,strategy,created_by) values
('40000000-0000-4000-8000-000000000971','20000000-0000-4000-8000-000000000971','Synthetic owned fund','credit','10000000-0000-4000-8000-000000000971'),
('40000000-0000-4000-8000-000000000972','20000000-0000-4000-8000-000000000972','Synthetic other tenant fund','credit','10000000-0000-4000-8000-000000000972');
insert into public.mandate_versions(organization_id,fund_id,version_number,status,source_kind,constraints,valid_from,created_by) values
('20000000-0000-4000-8000-000000000971','40000000-0000-4000-8000-000000000971',1,'active','synthetic','{"ticket_min":1000000,"sectors":["synthetic"],"notes":"MUST NOT LEAK","contact_email":"private@example.invalid"}',current_date,'10000000-0000-4000-8000-000000000971');
insert into public.fund_directory(id,legal_name,kind,status,claimed_by_organization_id,claimed_at) values
('50000000-0000-4000-8000-000000000971','Synthetic owned directory','credit_fund','registered','20000000-0000-4000-8000-000000000971',now()),
('50000000-0000-4000-8000-000000000972','Synthetic other directory','credit_fund','registered','20000000-0000-4000-8000-000000000972',now());
create temp table fit_fixture(job_id uuid,project_id uuid,parent_plan uuid,frozen jsonb);
grant all on fit_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000971","role":"authenticated"}',true);
do $$
declare original jsonb; r jsonb; replay jsonb; request uuid:=gen_random_uuid(); criteria jsonb; parent public.capital_project_plans; mutated jsonb;
begin
 original:=public.start_advisor_project_v1(gen_random_uuid(),'pt-BR','Synthetic existing case','company_debt_view','Analisar a companhia.','public_information',pg_temp.provider_research_plan_fixture());
 select * into strict parent from public.capital_project_plans where capital_project_id=(original->>'capital_project_id')::uuid and status='active';
 criteria:=jsonb_build_object('schemaVersion','provider-case-criteria.v1','asOf',now(),'currency','BRL','amount','2000000','source',jsonb_build_object('kind','user_confirmed','referenceId',request));
 begin
  perform public.start_provider_case_fit_project_v1(request,'pt-BR','Ignored existing name','Selecionar financiadores para este caso.',pg_temp.provider_case_fit_plan_fixture(),null,parent.capital_project_id,repeat('f',64),criteria);
  raise exception 'stale parent accepted';
 exception when serialization_failure then null; end;
 r:=public.start_provider_case_fit_project_v1(request,'pt-BR','Ignored existing name','Selecionar financiadores para este caso.',pg_temp.provider_case_fit_plan_fixture(),null,parent.capital_project_id,parent.plan_fingerprint,criteria);
 replay:=public.start_provider_case_fit_project_v1(request,'pt-BR','Ignored existing name','Selecionar financiadores para este caso.',pg_temp.provider_case_fit_plan_fixture(),null,parent.capital_project_id,parent.plan_fingerprint,criteria);
 if r->>'research_job_id' is distinct from replay->>'research_job_id' then raise exception 'replay duplicated case fit'; end if;
 if r->>'capital_project_id' is distinct from original->>'capital_project_id' or r->>'intake_session_id' is distinct from original->>'intake_session_id' or r->>'conversation_id' is distinct from original->>'conversation_id' then raise exception 'existing context replaced'; end if;
 if not exists(select 1 from public.capital_project_plans where id=parent.id and snapshot=parent.snapshot) then raise exception 'parent snapshot mutated'; end if;
 if not exists(select 1 from public.processing_jobs where id=(r->>'research_job_id')::uuid and status='awaiting_approval') then raise exception 'approval skipped'; end if;
 insert into pg_temp.fit_fixture select (r->>'research_job_id')::uuid,parent.capital_project_id,parent.id,content from public.capital_project_briefs where capital_project_id=parent.capital_project_id and brief_kind='provider_case_fit';
 begin
  perform public.start_provider_case_fit_project_v1(request,'pt-BR','Ignored existing name','Selecionar financiadores para este caso.',pg_temp.provider_case_fit_plan_fixture(),null,parent.capital_project_id,parent.plan_fingerprint,jsonb_set(criteria,'{amount}','"9000000"'));
  raise exception 'changed criteria replay accepted';
 exception when raise_exception then if sqlerrm<>'case_fit_criteria_replay_conflict' then raise; end if; end;
 begin
  perform public.worker_load_provider_case_fit_context((r->>'research_job_id')::uuid,repeat('x',64));raise exception 'unapproved claim accepted';
 exception when insufficient_privilege then null; end;
 for mutated in select value from jsonb_array_elements(jsonb_build_array(jsonb_set(criteria,'{amount}','"1,000"'),jsonb_set(criteria,'{instruments}','["fictional"]'),criteria-'currency')) loop
  begin
   perform public.start_provider_case_fit_project_v1(request,'pt-BR','Ignored existing name','Selecionar financiadores para este caso.',pg_temp.provider_case_fit_plan_fixture(),null,parent.capital_project_id,parent.plan_fingerprint,mutated);
   raise exception 'invalid criteria accepted';
  exception when invalid_parameter_value then null; end;
 end loop;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000972","role":"authenticated"}',true);
do $$ declare f record; request uuid:=gen_random_uuid(); begin
 select * into strict f from pg_temp.fit_fixture;
 begin
  perform public.start_provider_case_fit_project_v1(request,'pt-BR','Foreign','Selecionar financiadores.',pg_temp.provider_case_fit_plan_fixture(),null,f.project_id,repeat('a',64),jsonb_set(f.frozen->'caseCriteria','{source,referenceId}',to_jsonb(request::text)));
  raise exception 'foreign project accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into private.worker_tokens(label,token_sha256)values('synthetic-case-fit-worker',extensions.digest(repeat('u',64),'sha256'));
do $$
declare f record; context jsonb; claim jsonb; cap text; task text; run uuid; artifact jsonb; deps jsonb:='[]'; content jsonb;
begin
 select * into strict f from pg_temp.fit_fixture;
 if jsonb_array_length(f.frozen->'providers')<>1 or f.frozen::text like '%MUST NOT LEAK%' or f.frozen::text like '%private@example.invalid%' or f.frozen::text like '%other tenant%' then raise exception 'owned source projection failed'; end if;
 perform pg_temp.fixture_approve_execution(f.job_id);
 update public.processing_jobs set available_at=now()-interval '1 day' where id=f.job_id;
 claim:=public.worker_claim_job(repeat('u',64),600);if claim->>'job_id' is distinct from f.job_id::text then raise exception 'fit claim mismatch'; end if;cap:=claim->>'capability_token';
 context:=public.worker_load_provider_case_fit_context(f.job_id,cap);
 update public.mandate_versions set constraints='{"currencies":["USD"]}' where fund_id='40000000-0000-4000-8000-000000000971';
 if public.worker_load_provider_case_fit_context(f.job_id,cap) is distinct from context then raise exception 'frozen mandate changed'; end if;
 foreach task in array array['M01','K01','K02'] loop
  run:=public.worker_start_capital_project_task(f.job_id,cap,task,'provider_case_fit','2026.09.10-v1',encode(extensions.digest(task,'sha256'),'hex'),'{}');
  content:=jsonb_build_object('scope','research_case_fit','shortlistAuthorized',false,'externalEffectAllowed',false,'projectId',f.project_id,'planId',context->>'planId','planFingerprint',context->>'planFingerprint','caseCriteria',context->'caseCriteria');
  artifact:=public.worker_record_capital_project_artifact(f.job_id,cap,run,case task when 'M01' then 'provider_case_fit_scope' when 'K01' then 'provider_case_fit_sources' else 'provider_case_fit' end,case task when 'M01' then 'provider-case-fit-scope.v1' when 'K01' then 'provider-case-fit-sources.v1' else 'provider-case-fit.v1' end,'draft',encode(extensions.digest(task,'sha256'),'hex'),content,'[]',deps);
  perform public.worker_finish_capital_project_task(f.job_id,cap,run,'succeeded',jsonb_build_object('type','capital_project_artifact','id',artifact->>'id'),artifact->>'artifact_fingerprint','[{"id":"authorized_research_scope","passed":true}]','{}',null);
  deps:=jsonb_build_array(jsonb_build_object('artifactId',artifact->>'id','artifactFingerprint',artifact->>'artifact_fingerprint'));
 end loop;
 if jsonb_array_length(public.worker_load_provider_case_fit_context(f.job_id,cap)->'priorArtifacts')<>3 then raise exception 'fit replay missing artifacts'; end if;
 perform public.worker_complete_job(f.job_id,cap,jsonb_build_object('provider_case_fit_artifact_id',artifact->>'id','artifact_fingerprint',artifact->>'artifact_fingerprint'));
 if (select status from public.processing_jobs where id=f.job_id)<>'succeeded' then raise exception 'fit did not complete'; end if;
end $$;
rollback;
