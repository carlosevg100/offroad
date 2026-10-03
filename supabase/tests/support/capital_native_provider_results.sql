-- Native result SQL contracts. Storage rows are rollback metadata fixtures,
-- not actual physical-byte/erase evidence. The TS consumer separately uses the actual professional engines.
begin;
\ir legacy_workspace_capabilities.sql
\ir legacy_persistent_work_fixture.sql
\ir provider_case_fit_plan_snapshot.sql
\ir provider_research_plan_snapshot.sql
\ir execution_approval.sql
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
 original:=pg_temp.legacy_advisor_result(public.start_advisor_project_v1(gen_random_uuid(),'pt-BR','Synthetic existing case','company_debt_view','Analisar a companhia.','public_information',pg_temp.provider_research_plan_fixture()));
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
insert into private.worker_tokens(label,token_sha256,execution_account_user_id)values('synthetic-case-fit-worker',extensions.digest(repeat('u',64),'sha256'),'10000000-0000-4000-8000-000000000971');

select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000971","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','',true);
do $$declare f record;claim jsonb;cap text;prepared jsonb;r uuid;allocation uuid;object_id uuid;retained jsonb;closed jsonb;content jsonb;task text;seal jsonb;result jsonb;previous uuid;recovery jsonb;scope jsonb;fp text;
begin
 select * into strict f from pg_temp.fit_fixture;
 perform pg_temp.fixture_approve_execution(f.job_id);update public.processing_jobs set available_at=now()-interval'1 day'where id=f.job_id;
 claim:=public.worker_claim_job_v3(repeat('u',64),600);cap:=claim->>'capability_token';if claim->>'job_id'<>f.job_id::text then raise exception 'native fit claim mismatch';end if;
 update private.capital_public_retention_controls set enabled=true;perform public.worker_claim_capital_capture_purge_v1(repeat('u',64));
 recovery:=private.worker_recover_capital_native_provider_v1(f.job_id,cap);if recovery->'recipe'<>'null'::jsonb or recovery->'results'<>'[]'::jsonb then raise exception 'native invented recovery';end if;
 prepared:=private.worker_prepare_capital_native_recipe_v1(f.job_id,cap);r:=(prepared->>'recipeId')::uuid;allocation:=(prepared#>>'{body,allocationId}')::uuid;
 insert into storage.objects(bucket_id,name,metadata,version)values('capital-input-capture',prepared#>>'{body,path}',jsonb_build_object('size',(prepared#>>'{body,byteLength}')::bigint,'mimetype','application/json'),'native-fit-context-v1')returning id into object_id;
 retained:=private.worker_commit_capital_body_v1(f.job_id,cap,allocation,object_id,'native-fit-context-v1',prepared#>>'{body,payloadFingerprint}',(prepared#>>'{body,byteLength}')::bigint);
 closed:=private.worker_finalize_capital_native_recipe_v1(f.job_id,cap,r,(retained->>'retainedPayloadId')::uuid);
 if closed->>'closed'<>'true'or closed->>'contextFingerprint'<>prepared->>'contextFingerprint' then raise exception 'native exact closure failed';end if;
 if private.worker_finalize_capital_native_recipe_v1(f.job_id,cap,r,(retained->>'retainedPayloadId')::uuid)is distinct from closed then raise exception 'native closure replay changed';end if;
 scope:=private.worker_read_capital_native_recipe_v1(f.job_id,cap,r,(retained->>'retainedPayloadId')::uuid,'context');
 if scope?'canonicalBody'or scope->>'payloadFingerprint'<>prepared->>'contextFingerprint'then raise exception 'native reader emitted arbitrary body or wrong hash';end if;
 foreach task in array array['M01','K01','K02']loop
 content:=jsonb_build_object('schemaVersion',case task when'M01'then'provider-case-fit-scope.v1'when'K01'then'provider-case-fit-sources.v1'else'provider-case-fit.v1'end,
 'projectId',closed->>'workId','planId',closed->>'planId','asOf',f.frozen->>'asOf','objective',f.frozen->>'objective','fixture',true);
 if task='K02'then content:=content||'{"scope":"research_case_fit","shortlistAuthorized":false,"externalEffectAllowed":false}'::jsonb;end if;
 begin perform private.worker_prepare_capital_native_result_v1(f.job_id,cap,r,task,'provider_research',content,previous);raise exception 'wrong family accepted';exception when invalid_parameter_value then null;end;
 begin perform private.worker_prepare_capital_native_result_v1(f.job_id,cap,r,task,'provider_case_fit'||case task when'M01'then'_scope'when'K01'then'_sources'else''end,content||'{"grantsApproval":true}',previous);raise exception 'caller approval accepted';exception when invalid_parameter_value then null;end;
 seal:=private.worker_prepare_capital_native_result_v1(f.job_id,cap,r,task,'provider_case_fit'||case task when'M01'then'_scope'when'K01'then'_sources'else''end,content,previous);
 allocation:=(seal#>>'{body,allocationId}')::uuid;
 begin perform private.worker_record_capital_project_artifact(f.job_id,cap,(seal->>'taskRunId')::uuid,'provider_case_fit','provider-case-fit.v1','draft',seal->>'inputFingerprint',content);raise exception 'native legacy writer bypass';exception when insufficient_privilege then if sqlerrm<>'capital_native_provider_commit_required'then raise;end if;end;
 begin perform private.worker_finish_capital_project_task(f.job_id,cap,(seal->>'taskRunId')::uuid,'succeeded','{"type":"capital_project_artifact","id":"fake"}',repeat('a',64),'[{"id":"caller_quality","passed":true}]');raise exception 'native legacy finish bypass';exception when insufficient_privilege then if sqlerrm<>'capital_native_provider_commit_required'then raise;end if;end;
 begin perform private.worker_commit_capital_native_result_v1(f.job_id,cap,r,(seal->>'sealId')::uuid,gen_random_uuid());raise exception 'fake result retention accepted';exception when insufficient_privilege then null;end;
 insert into storage.objects(bucket_id,name,metadata,version)values('capital-input-capture',seal#>>'{body,path}',jsonb_build_object('size',(seal#>>'{body,byteLength}')::bigint,'mimetype','application/json'),'native-fit-result-'||task)returning id into object_id;
 retained:=private.worker_commit_capital_body_v1(f.job_id,cap,allocation,object_id,'native-fit-result-'||task,seal#>>'{body,payloadFingerprint}',(seal#>>'{body,byteLength}')::bigint);
 result:=private.worker_commit_capital_native_result_v1(f.job_id,cap,r,(seal->>'sealId')::uuid,(retained->>'retainedPayloadId')::uuid);
 if result->>'grantsApproval'<>'false'or result->>'grantsExternalEffect'<>'false'or result->>'bodyFingerprint'<>seal#>>'{body,payloadFingerprint}'then raise exception 'native result receipt binding changed';end if;
 if private.worker_commit_capital_native_result_v1(f.job_id,cap,r,(seal->>'sealId')::uuid,(retained->>'retainedPayloadId')::uuid)is distinct from result then raise exception 'native result replay changed';end if;
 select revision_id into strict previous from private.capital_native_result_bindings where organization_id=(closed->>'organizationId')::uuid and revision_id=(result->>'revisionId')::uuid;
 if (select a.content from public.capital_project_artifacts a where a.id=(result->>'artifactId')::uuid)?'fixture'then raise exception 'native body persisted in legacy JSON';end if;
 end loop;
 recovery:=private.worker_recover_capital_native_provider_v1(f.job_id,cap);if jsonb_array_length(recovery->'results')<>3 or recovery->'recipe'is distinct from closed then raise exception 'native recovery lost capsule/results';end if;
 -- Producer-generated predecessor artifacts must not recompute the initial capsule.
 if (select context_fingerprint from private.capital_native_recipes where id=r)<>prepared->>'contextFingerprint'then raise exception 'native producer rewrote input capsule';end if;
 perform set_config('request.headers',jsonb_build_object('x-offroad-workspace',closed->>'organizationId')::text,true);
 scope:=public.read_capital_native_provider_result_body_v1((result->>'revisionId')::uuid);
 if scope?'canonicalBody'or scope->>'retainedPayloadId'<>result->>'retainedPayloadId'then raise exception 'human native scope emitted raw JSON or wrong body';end if;
 perform set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000972"}',true);
 begin perform public.read_capital_native_provider_result_body_v1((result->>'revisionId')::uuid);raise exception 'human cross tenant native read';exception when insufficient_privilege then null;end;
 perform set_config('request.headers',jsonb_build_object('x-offroad-workspace',closed->>'organizationId')::text,true);
 -- Execute the actual completion in a rollback subtransaction, not a fabricated
 -- requeue of an impossible succeeded job. Native result checks remain active.
 begin
 perform public.worker_complete_job(f.job_id,cap,jsonb_build_object('provider_case_fit_artifact_id',result->>'artifactId','artifact_fingerprint',result->>'artifactFingerprint'));
 if(select status from public.processing_jobs where id=f.job_id)<>'succeeded'then raise exception 'native actual completion failed';end if;
 begin perform private.worker_recover_capital_native_provider_v1(f.job_id,cap);raise exception 'closed job retained worker capability';exception when insufficient_privilege then null;end;
 perform public.read_capital_native_provider_result_body_v1((result->>'revisionId')::uuid);
 raise exception 'completion_fixture_rollback'using errcode='P3091';exception when sqlstate'P3091'then null;end;
 -- This SQL fixture contains metadata only. Invalidate the pinned version
 -- without bypassing Storage's API-only DELETE guard. Real byte deletion and
 -- purge are proved by the separate SDK through the Storage API.
 update storage.objects set version='native-fit-result-invalidated-version' where id=object_id;
 begin perform private.worker_recover_capital_native_provider_v1(f.job_id,cap);raise exception 'stale storage version accepted on recovery';exception when insufficient_privilege then null;end;
 if(select count(*)from private.capital_native_result_bindings where recipe_id=r)<>3 then raise exception 'physical deny erased original receipt';end if;
end$$;
rollback;
