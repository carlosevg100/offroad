-- Prioritize only this fixture job ahead of the surviving local queue; every claim still uses the real queue and authority guards.
-- This disposable fixture owns a distinct worker credential; never reactivate another fixture token.
-- Native recipe SQL contracts. Storage catalogue rows are metadata fixtures only;
-- physical byte and purge proofs require the separate actual Storage gate.
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
insert into private.worker_tokens(label,token_sha256,execution_account_user_id) values('synthetic-capital_native_provider_recipe-worker',extensions.digest('f59510d5ae3051f77576a9a2ed09e37c85a29d7a626d8396739785d87772f1e0','sha256'),'10000000-0000-4000-8000-000000000981');

select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','',true);
do $$
declare f record;claim jsonb;prepared jsonb;cap text;r uuid;a uuid;before_count integer; deadline timestamptz;object_id uuid;retained jsonb;old_cap text;allocation_before jsonb;failure_result jsonb;
begin
 select * into strict f from pg_temp.provider_research_fixture;
 perform pg_temp.fixture_approve_execution(f.job_id);
 update public.processing_jobs set available_at=(select least(now(),coalesce(min(available_at),now()))-interval '1 second' from public.processing_jobs where status='queued' or (status='leased' and lease_expires_at<now())) where id=f.job_id;
 claim:=public.worker_claim_job_v3('f59510d5ae3051f77576a9a2ed09e37c85a29d7a626d8396739785d87772f1e0',600);cap:=claim->>'capability_token';
 if claim->>'claimed' is distinct from 'true' or claim->>'job_id' is distinct from f.job_id::text or cap is null then raise exception 'native_provider_claim_mismatch';end if;
 begin perform private.worker_prepare_capital_native_recipe_v1(f.job_id,cap);raise exception 'native recipe admitted without purge heartbeat';exception when insufficient_privilege then null;end;
 if exists(select 1 from private.capital_native_recipes where job_id=f.job_id)then raise exception 'failed admission left recipe';end if;
 update private.capital_public_retention_controls set enabled=true;
 perform public.worker_claim_capital_capture_purge_v1('f59510d5ae3051f77576a9a2ed09e37c85a29d7a626d8396739785d87772f1e0');
 prepared:=private.worker_prepare_capital_native_recipe_v1(f.job_id,cap);r:=(prepared->>'recipeId')::uuid;a:=(prepared#>>'{body,allocationId}')::uuid;
 if prepared->>'schemaVersion'<>'capital-native-recipe-preparation.v1' or prepared#>>'{body,retentionState}'<>'allocated'
 or (prepared#>>'{body,retainedPayloadId}')is not null or (select count(*)from private.capital_native_provider_resource_pins where recipe_id=r)<>2 then raise exception 'native preparation manufactured receipt or lost resource pins';end if;
 if prepared->>'contextFingerprint'<>encode(extensions.digest(prepared#>>'{body,canonicalBody}','sha256'),'hex')then raise exception 'native original context bytes mismatch';end if;
 before_count:=(select count(*)from private.capital_public_payload_allocations where job_id=f.job_id);
 if jsonb_set(private.worker_prepare_capital_native_recipe_v1(f.job_id,cap),'{body,replayed}','false')is distinct from prepared then raise exception 'original pending capture recovery changed';end if;
 if (select count(*)from private.capital_public_payload_allocations where job_id=f.job_id)<>before_count then raise exception 'native recapture extended retention';end if;
 -- Real queue retry re-leases the same job; the original allocation is never
 -- rebound to a new capability or given a renewed deadline.
 select to_jsonb(x)into allocation_before from private.capital_public_payload_allocations x where id=a;
 old_cap:=cap;
 failure_result:=public.worker_fail_job(f.job_id,cap,'{"code":"synthetic_retry","stage":"native_capture","retryable":true,"cause":{"name":"SyntheticError","class":"transient","message":"Synthetic transient failure"}}'::jsonb,true,5);
 if failure_result->>'retrying' is distinct from 'true' or not exists(select 1 from public.processing_jobs where id=f.job_id and status='queued' and capability_sha256 is null and attempts<max_attempts) then raise exception 'native_real_retry_not_queued';end if;
 update public.processing_jobs set available_at=(select least(now(),coalesce(min(available_at),now()))-interval '1 second' from public.processing_jobs where status='queued' or (status='leased' and lease_expires_at<now()))where id=f.job_id;
 claim:=public.worker_claim_job_v3('f59510d5ae3051f77576a9a2ed09e37c85a29d7a626d8396739785d87772f1e0',600);cap:=claim->>'capability_token';
 if claim->>'claimed' is distinct from 'true' or claim->>'job_id' is distinct from f.job_id::text or cap is null or cap=old_cap then raise exception 'native real retry did not re-lease original job';end if;
 begin perform private.worker_prepare_capital_native_recipe_v1(f.job_id,old_cap);raise exception 'obsolete lease still admitted';exception when insufficient_privilege then null;end;
 if jsonb_set(private.worker_prepare_capital_native_recipe_v1(f.job_id,cap),'{body,replayed}','false')is distinct from prepared then raise exception 'new lease changed original capture';end if;
 if(select to_jsonb(x)from private.capital_public_payload_allocations x where id=a)is distinct from allocation_before then raise exception 'new lease rewrote original allocation receipt';end if;
 begin perform private.worker_finalize_capital_native_recipe_v1(f.job_id,cap,r,gen_random_uuid());raise exception 'native closure accepted fabricated retained id';exception when insufficient_privilege then null;end;
 if exists(select 1 from private.capital_native_recipe_closures where recipe_id=r)then raise exception 'failed closure left immutable record';end if;
 -- A rolled-back Storage catalogue fixture tests the server receipt contract;
 -- it is explicitly not an HTTP byte/purge proof.
 insert into storage.objects(bucket_id,name,metadata,version)values('capital-input-capture',prepared#>>'{body,path}',
 jsonb_build_object('size',(prepared#>>'{body,byteLength}')::bigint,'mimetype','application/json'),'native-provider-sql-v1')returning id into object_id;
 retained:=private.worker_commit_capital_body_v1(f.job_id,cap,a,object_id,'native-provider-sql-v1',prepared#>>'{body,payloadFingerprint}',(prepared#>>'{body,byteLength}')::bigint);
 if retained->>'retentionState'<>'retained'then raise exception 'native context metadata receipt failed';end if;
 begin perform private.worker_finalize_capital_native_recipe_v1(f.job_id,cap,r,(retained->>'retainedPayloadId')::uuid);
 raise exception 'v2 catalogue accepted with no real publication';exception when insufficient_privilege then
 if sqlerrm<>'capital_native_catalog_publication_required'then raise;end if;end;
 if exists(select 1 from private.capital_native_recipe_closures where recipe_id=r)then raise exception 'missing catalogue left closure';end if;
 if to_regprocedure('pg_temp.assert_native_catalog_contract(uuid,text,uuid,uuid,uuid,text)')is not null then
 perform pg_temp.assert_native_catalog_contract(f.job_id,cap,r,(retained->>'retainedPayloadId')::uuid,a,prepared->>'catalogFingerprint');end if;


 begin perform private.worker_read_capital_native_recipe_v1(f.job_id,cap,r,gen_random_uuid(),'context');raise exception 'native reader accepted unclosed/foreign id';exception when insufficient_privilege then null;end;
 deadline:=private.capital_native_recipe_deadline_v1('20000000-0000-4000-8000-000000000981',r,'10000000-0000-4000-8000-000000000981');
 if deadline is null then raise exception 'authorized frozen recipe not current';end if;
 update public.mandate_versions set constraints='{"ticket_min":9999999}'where fund_id='40000000-0000-4000-8000-000000000981';
 if private.capital_native_recipe_deadline_v1('20000000-0000-4000-8000-000000000981',r,'10000000-0000-4000-8000-000000000981')is distinct from deadline then raise exception 'current observation rewrote approved input';end if;
 update public.fund_directory set claimed_by_organization_id=null,claimed_at=null where id='50000000-0000-4000-8000-000000000981';
 if private.capital_native_recipe_deadline_v1('20000000-0000-4000-8000-000000000981',r,'10000000-0000-4000-8000-000000000981')is not null then raise exception 'native current source revocation did not deny';end if;
 update public.fund_directory set claimed_by_organization_id='20000000-0000-4000-8000-000000000981',claimed_at=now()where id='50000000-0000-4000-8000-000000000981';
 begin update private.capital_native_recipes set expires_at=expires_at+interval '1 day'where id=r;raise exception 'native immutable recipe renewed';exception when sqlstate '55000' then null;end;
 update public.organization_memberships set status='revoked'where organization_id='20000000-0000-4000-8000-000000000981'and user_id='10000000-0000-4000-8000-000000000981';
 if private.capital_native_recipe_deadline_v1('20000000-0000-4000-8000-000000000981',r,'10000000-0000-4000-8000-000000000981')is not null then raise exception 'native human revocation did not deny';end if;
 update public.organization_memberships set status='active'where organization_id='20000000-0000-4000-8000-000000000981'and user_id='10000000-0000-4000-8000-000000000981';
 update public.capital_project_briefs set content_fingerprint=repeat('f',64)where id=(select brief_id from private.capital_native_recipes where id=r);
 if private.capital_native_recipe_deadline_v1('20000000-0000-4000-8000-000000000981',r,'10000000-0000-4000-8000-000000000981')is not null then raise exception 'native brief alteration did not deny';end if;
end$$;
rollback;
