-- Isolated LOCAL SDK fixture: real human start/approval/publication and reviewed synthetic accounts.
-- No Storage objects, attempts, outcomes, accepted bodies or grants are fabricated here.
-- Runner requires a loopback API and database; reset the disposable local stack after the eval.

begin;
select set_config('request.jwt.claim.sub','',true);
\ir legacy_workspace_capabilities.sql
\ir legacy_persistent_work_fixture.sql
\ir execution_approval.sql

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000201', 'authenticated', 'authenticated',
   'origination-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000202', 'authenticated', 'authenticated',
   'other-tenant@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000201', 'originator', 'Origination Workspace',
   '10000000-0000-4000-8000-000000000201'),
  ('20000000-0000-4000-8000-000000000202', 'originator', 'Other Workspace',
   '10000000-0000-4000-8000-000000000202');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000201', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000202', 'owner', 'active', now());

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000201","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  request_id constant uuid := '30000000-0000-4000-8000-000000000201';
  plan_snapshot jsonb;
  first_result jsonb;
  replay_result jsonb;
  project_id uuid;
  session_id uuid;
  brief_id uuid;
  rejected boolean := false;
begin
  select jsonb_build_object(
    'schemaVersion', 'capital-project-plan.v1',
    'compilerVersion', '2026.09.01-v2',
    'registryVersion', '2026.09.01-v2',
    'job', jsonb_build_object(
      'id', 'origination_thesis',
      'targetTaskIds', jsonb_build_array('M07', 'C02', 'K04'),
      'firstWorkProduct', 'meeting_brief',
      'confirmationGate', 'preliminary_understanding',
      'accessPolicy', 'public_or_private',
      'inputPolicy', jsonb_build_object(
        'company', 'required', 'documents', 'optional', 'capitalIntent', 'optional',
        'existingTransaction', 'not_applicable', 'publicResearch', 'required'
      )
    ),
    'taskSpecs', jsonb_agg(jsonb_build_object(
      'id', spec.id, 'label', spec.label, 'graph', spec.graph,
      'dependencies', to_jsonb(spec.dependencies), 'executionClass', spec.execution_class,
      'effect', spec.effect, 'maturity', 'specified', 'ordinal', spec.ordinal, 'batch', spec.batch
    ) order by spec.ordinal),
    'parallelBatches', jsonb_build_array(
      jsonb_build_array('M01', 'M02'),
      jsonb_build_array('M03', 'M04'),
      jsonb_build_array('M05', 'C02', 'K04'),
      jsonb_build_array('M06'),
      jsonb_build_array('M07')
    )
  ) into plan_snapshot
  from (values
    ('M01','Resolver companhia e grupo','case',array[]::text[],'extraction','propose_state',0,0),
    ('M02','Normalizar objetivo','case',array[]::text[],'extraction','propose_state',1,0),
    ('M03','Registrar restrições','case',array['M02'],'extraction','propose_state',2,1),
    ('M04','Inferir arquétipos candidatos','case',array['M01','M02'],'judgment','propose_state',3,1),
    ('M05','Definir entregáveis','case',array['M02','M03'],'deterministic','propose_state',4,2),
    ('M06','Compilar plano de tarefas','case',array['M04','M05'],'deterministic','commit',5,3),
    ('M07','Emitir entendimento corrigível','case',array['M06','C02','K04'],'compilation','propose_state',6,4),
    ('C02','Pesquisar setor e regulação','knowledge',array['M01','M04'],'research','none',7,2),
    ('K04','Pesquisar transações comparáveis','market',array['M01','M04'],'research','commit',8,2)
  ) spec(id,label,graph,dependencies,execution_class,effect,ordinal,batch);

  perform pg_temp.legacy_specialized_work(
    request_id, 'pt-BR', 'Projeto Farol', 'Companhia Farol S.A.',
    'https://farol.example',
    jsonb_build_object(
      'meetingContext', 'Preparar uma primeira conversa com a diretoria financeira sobre prioridades de dívida.',
      'audience', 'CFO e tesouraria',
      'thesisToTest', 'Testar se o perfil de vencimentos cria uma oportunidade de refinanciamento.'
    ),
    plan_snapshot
  );
  first_result := public.start_public_origination_thesis_v1(
    request_id, 'pt-BR', 'Projeto Farol', 'Companhia Farol S.A.',
    'https://farol.example',
    jsonb_build_object(
      'meetingContext', 'Preparar uma primeira conversa com a diretoria financeira sobre prioridades de dívida.',
      'audience', 'CFO e tesouraria',
      'thesisToTest', 'Testar se o perfil de vencimentos cria uma oportunidade de refinanciamento.'
    ),
    plan_snapshot
  );
  project_id := (first_result ->> 'capital_project_id')::uuid;
  session_id := (first_result ->> 'intake_session_id')::uuid;
  brief_id := (first_result ->> 'brief_id')::uuid;

  if first_result ->> 'replayed' <> 'false'
    or (select access_basis from public.capital_projects where id = project_id) <> 'public_information'
    or (select privacy_status from public.document_intake_sessions where id = session_id) <> 'public_information'
    or (select representation_status from public.document_intake_sessions where id = session_id) <> 'not_claimed'
    or (select count(*) from public.capital_project_briefs where id = brief_id and status = 'active') <> 1
    or (select count(*) from public.capital_project_plan_tasks task
        join public.capital_project_plans plan on plan.id = task.plan_id and plan.organization_id = task.organization_id
        where plan.capital_project_id = project_id) <> 9
    or (select dependencies from public.capital_project_plan_tasks task
        join public.capital_project_plans plan on plan.id = task.plan_id and plan.organization_id = task.organization_id
        where plan.capital_project_id = project_id and task.task_id = 'M07')
       is distinct from array['M06','C02','K04']::text[] then
    raise exception 'public origination start did not persist the exact bounded contract: %', first_result;
  end if;

  replay_result := public.start_public_origination_thesis_v1(
    request_id, 'pt-BR', 'Projeto Farol', 'Companhia Farol S.A.',
    'https://farol.example',
    jsonb_build_object(
      'meetingContext', 'Preparar uma primeira conversa com a diretoria financeira sobre prioridades de dívida.',
      'audience', 'CFO e tesouraria',
      'thesisToTest', 'Testar se o perfil de vencimentos cria uma oportunidade de refinanciamento.'
    ),
    plan_snapshot
  );
  if replay_result ->> 'replayed' <> 'true'
    or replay_result ->> 'capital_project_id' <> project_id::text
    or replay_result ->> 'job_id' <> first_result ->> 'job_id'
    or (select count(*) from public.capital_projects where id = project_id) <> 1 then
    raise exception 'origination request idempotency failed: %', replay_result;
  end if;

  begin
    insert into public.capital_project_briefs (
      organization_id, capital_project_id, request_id, brief_kind, brief_version,
      status, content, content_fingerprint, created_by
    ) values (
      '20000000-0000-4000-8000-000000000201', project_id, gen_random_uuid(),
      'origination_thesis', 2, 'active', '{}'::jsonb, repeat('a', 64),
      '10000000-0000-4000-8000-000000000201'
    );
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'tenant wrote project memory outside the command'; end if;
end;
$$;

-- A different organization cannot read the project brief or resolve the project through RLS.
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000202","role":"authenticated","aal":"aal1"}',
  true
);

do $$
begin
  if (select count(*) from public.capital_project_briefs
      where request_id = '30000000-0000-4000-8000-000000000201') <> 0
    or (select count(*) from public.capital_projects where project_name = 'Projeto Farol') <> 0 then
    raise exception 'origination project memory crossed tenant boundaries';
  end if;
end;
$$;

-- The worker can load the exact project context only with the one-job capability returned by
-- the queue. A guessed or stale token is rejected.
reset role;
insert into private.worker_tokens (label, token_sha256,execution_account_user_id)
values ('origination-thesis-worker-test', extensions.digest(repeat('w', 64), 'sha256'),'10000000-0000-4000-8000-000000000201')
on conflict (token_sha256) do update set status = 'active', revoked_at = null;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000201","role":"authenticated","aal":"aal1"}',
  true
);


do $$begin perform pg_temp.fixture_approve_pending_executions();end;$$;
reset role;
-- This runs last in the disposable CI stack. Select only this human-created job,
-- and move it ahead of surviving earlier fixtures without changing their jobs.
do $$declare fixture_job uuid; matched integer; begin
 select count(*), min(j.id::text)::uuid into matched,fixture_job
 from public.processing_jobs j
 join public.document_intake_sessions s on s.id=j.intake_session_id and s.organization_id=j.organization_id
 join public.capital_project_briefs b on b.capital_project_id=s.capital_project_id and b.organization_id=j.organization_id
 where j.organization_id='20000000-0000-4000-8000-000000000201'
 and j.kind='capital_project_analysis' and j.status='queued'
 and j.payload->>'analysis_scope'='origination_thesis'
 and b.request_id='30000000-0000-4000-8000-000000000201';
 if matched<>1 then raise exception 'sdk_fixture_exact_job_required';end if;
 update public.processing_jobs set available_at=least(clock_timestamp(),
   coalesce((select min(available_at)-interval '1 second' from public.processing_jobs),clock_timestamp()))
 where id=fixture_job;
end;$$;
update private.capital_public_retention_controls set enabled=true;
-- Publication is an actual cross-tenant human command for synthetic content only.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('10000000-0000-4000-8000-000000000993','authenticated','authenticated','m07-publisher@example.invalid','{}','{}',now(),now(),false,false);
-- The publisher is a separate Offroad organization. Its right never becomes a
-- consumer-tenant source row by virtue of the consumer's membership.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000993","role":"authenticated"}',true);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000993','offroad','Synthetic capture publisher','10000000-0000-4000-8000-000000000993');
insert into public.organization_memberships(organization_id,user_id,role,status) values
('20000000-0000-4000-8000-000000000993','10000000-0000-4000-8000-000000000993','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by) values
('30000000-0000-4000-8000-000000000993','20000000-0000-4000-8000-000000000993','Synthetic capture source','10000000-0000-4000-8000-000000000993');
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000993"}',true);
create temp table capture_public_license_fixture(source_version_id uuid,source_binding_id uuid,rights_version_id uuid,payload jsonb);
grant select on capture_public_license_fixture to authenticated;
do $$ declare v uuid:=gen_random_uuid(); b uuid; r uuid; sample jsonb; begin
 sample:='{"url":"https://example.invalid/capture-licensed","title":"Synthetic licensed source","snippet":"Licensed excerpt only","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'::jsonb;
 insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by)
 values(v,'20000000-0000-4000-8000-000000000993','30000000-0000-4000-8000-000000000993','30000000-0000-4000-8000-000000000993','10000000-0000-4000-8000-000000000993');
 insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,initial_verification_state,created_by)
 values(v,'20000000-0000-4000-8000-000000000993',v,1,1,'opportunity-documents','20000000-0000-4000-8000-000000000993/synthetic/'||v,'Synthetic excerpt','pending_verification','10000000-0000-4000-8000-000000000993');
 insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
 values('20000000-0000-4000-8000-000000000993',v,'30000000-0000-4000-8000-000000000993','30000000-0000-4000-8000-000000000993',gen_random_uuid(),'10000000-0000-4000-8000-000000000993') returning id into b;
 r:=public.declare_public_source_reuse_v1(v,0,sample->>'url',private.public_source_payload_sha256_v1(sample),now()+interval '60 days',now()+interval '60 days',v,repeat('b',64));
 insert into pg_temp.capture_public_license_fixture values(v,b,r,sample);
end; $$;

select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000201","role":"authenticated"}',true);
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000201"}',true);
reset role;
create function pg_temp.m07_route() returns jsonb language sql as $$ select jsonb_build_object('provider','openai','model','gpt-5.6-sol','accountRef','m07-sql-account','projectRef','m07-sql-project','credentialBinding','m07-sql-key','endpoint','https://api.openai.com/v1/responses','region','global'); $$;
do $$declare resource text;d jsonb;begin
 foreach resource in array array['inference','prompt_cache','schema_cache'] loop
 d:=pg_temp.m07_route()-'model'||jsonb_build_object('id',gen_random_uuid(),'policyVersion','offroad-provider-retention-v2','resource',resource,'models',jsonb_build_array('gpt-5.6-sol','gpt-5.6-terra'),'purposes',jsonb_build_array('case_analysis'),'classifications',jsonb_build_array('restricted'),'rights',jsonb_build_array('process'),'trainingUse','prohibited','eligibility','supported','zeroRetention','not_contracted','revokedAt',null,'reviewedBy','SQL-fixture','reviewedAt',clock_timestamp()-interval '1 minute','validThrough',clock_timestamp()+interval '2 days','retention',jsonb_build_object('requestContentSeconds',0,'abuseMonitoringSeconds',0,'applicationStateSeconds',0,'cacheSeconds',0,'metadataSeconds',0,'exceptions','[]'::jsonb),'evidence',jsonb_build_array(jsonb_build_object('kind','provider_terms','reference','synthetic-local-sdk-only','sha256',repeat('1',64)),jsonb_build_object('kind','account_configuration','reference','synthetic-local-sdk-only','sha256',repeat('2',64)),jsonb_build_object('kind','credential_binding','reference','synthetic-local-sdk-only','sha256',repeat('3',64))));
 perform private.record_provider_processing_assurance_v1(d,'Local SDK fixture, no commercial assertion');
 end loop;
end;$$;
reset role;
-- Disposable local fixture account, never a production login.
update auth.users set instance_id='00000000-0000-0000-0000-000000000000',
 encrypted_password=extensions.crypt('m07-isolated-local-eval-password',extensions.gen_salt('bf')),
 email_confirmed_at=clock_timestamp(),confirmation_token='',recovery_token='',email_change_token_new='',email_change=''
 where id='10000000-0000-4000-8000-000000000201';
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)
values(gen_random_uuid(),'10000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000201','email',
 '{"sub":"10000000-0000-4000-8000-000000000201","email":"origination-owner@example.invalid"}',clock_timestamp(),clock_timestamp());
commit;
