-- Synthetic provider records only. Execute transactionally; never leaves business fixtures.
begin;
\ir support/provider_research_plan_snapshot.sql
\ir support/execution_approval.sql
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
insert into private.worker_tokens(label,token_sha256) values('synthetic-provider-research-worker',extensions.digest(repeat('v',64),'sha256')) on conflict(token_sha256) do update set status='active',revoked_at=null;
do $$
declare f record; context jsonb; task_run uuid; artifact jsonb; claim jsonb; cap text; task text; dependencies jsonb;
begin
  select * into strict f from pg_temp.provider_research_fixture;
  if jsonb_array_length(f.frozen->'providers')<>2 or f.frozen::text like '%MUST NOT LEAK%' or f.frozen::text like '%private@example.invalid%'
    or f.frozen::text like '%other tenant%' or f.frozen::text like '%other directory%' then raise exception 'source tenant or allowlist boundary failed'; end if;
  if not exists(select 1 from jsonb_array_elements(f.frozen->'providers') p where p->>'sourceClass'='directory') then raise exception 'owned directory absent'; end if;
  perform pg_temp.fixture_approve_execution(f.job_id);
  update public.processing_jobs set available_at=now()-interval '1 day' where id=f.job_id;
  claim:=public.worker_claim_job(repeat('v',64),600);
  if claim->>'job_id' is distinct from f.job_id::text then raise exception 'research claim mismatch'; end if;
  cap:=claim->>'capability_token';
  context:=public.worker_load_provider_research_context(f.job_id,cap);
  if context-'approvalStatus'-'priorArtifacts' is distinct from f.frozen then raise exception 'loader changed frozen snapshot'; end if;
  update public.mandate_versions set constraints='{"ticket_min":9999999}' where fund_id='40000000-0000-4000-8000-000000000981';
  if public.worker_load_provider_research_context(f.job_id,cap) is distinct from context then raise exception 'source update changed approved research'; end if;
  begin
    update public.processing_jobs set status='succeeded',result='{}' where id=f.job_id;
    raise exception 'unfinished research completed';
  exception when insufficient_privilege then null; end;
  task_run:=public.worker_start_capital_project_task(f.job_id,cap,'M01','provider_research','2026.09.10-v1',repeat('a',64),'{}');
  artifact:=public.worker_record_capital_project_artifact(f.job_id,cap,task_run,'provider_research_scope','provider-research-scope.v1','draft',repeat('a',64),'{"synthetic":true}','[]','[]');
  perform public.worker_finish_capital_project_task(f.job_id,cap,task_run,'succeeded',jsonb_build_object('type','capital_project_artifact','id',artifact->>'id'),artifact->>'artifact_fingerprint','[{"id":"authorized_research_scope","passed":true}]','{}',null);
  context:=public.worker_load_provider_research_context(f.job_id,cap);
  if jsonb_array_length(context->'priorArtifacts')<>1 or context#>>'{priorArtifacts,0,id}' is distinct from artifact->>'id' then raise exception 'partial replay lost persisted reference'; end if;
  if public.worker_load_provider_research_context(f.job_id,cap) is distinct from context then raise exception 'replay context changed'; end if;
  -- Finish dependency-bound artifacts through the existing lifecycle, then complete the real queue job.
  foreach task in array array['K01','K02'] loop
    dependencies:=jsonb_build_array(jsonb_build_object('artifactId',artifact->>'id','artifactFingerprint',artifact->>'artifact_fingerprint'));
    task_run:=public.worker_start_capital_project_task(f.job_id,cap,task,'provider_research','2026.09.10-v1',encode(extensions.digest(task,'sha256'),'hex'),'{}');
    artifact:=public.worker_record_capital_project_artifact(f.job_id,cap,task_run,
      case task when 'K01' then 'provider_research_sources' else 'provider_research' end,
      case task when 'K01' then 'provider-research-sources.v1' else 'provider-research.v1' end,'draft',encode(extensions.digest(task,'sha256'),'hex'),
      '{"synthetic":true,"scope":"research_only","shortlistAuthorized":false,"externalEffectAllowed":false}', '[]',dependencies);
    perform public.worker_finish_capital_project_task(f.job_id,cap,task_run,'succeeded',jsonb_build_object('type','capital_project_artifact','id',artifact->>'id'),artifact->>'artifact_fingerprint','[{"id":"authorized_research_scope","passed":true}]','{}',null);
  end loop;
  update public.fund_directory set claimed_by_organization_id=null,claimed_at=null where id='50000000-0000-4000-8000-000000000981';
  begin
    perform public.worker_load_provider_research_context(f.job_id,cap);
    raise exception 'revoked source ownership accepted';
  exception when insufficient_privilege then null; end;
  update public.fund_directory set claimed_by_organization_id='20000000-0000-4000-8000-000000000981',claimed_at=now() where id='50000000-0000-4000-8000-000000000981';
  perform public.worker_complete_job(f.job_id,cap,jsonb_build_object('provider_research_artifact_id',artifact->>'id','artifact_fingerprint',artifact->>'artifact_fingerprint'));
  if (select status from public.processing_jobs where id=f.job_id)<>'succeeded' then raise exception 'research did not complete'; end if;
end $$;
rollback;
