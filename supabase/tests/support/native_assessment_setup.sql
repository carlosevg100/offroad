-- Rollback-only real work creation, loaded document and capability-bound verification.
\ir legacy_workspace_capabilities.sql
\ir legacy_persistent_work_fixture.sql
\ir source_rights_fixture.sql
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  '10000000-0000-4000-8000-000000000126', 'authenticated', 'authenticated',
  'agent-work-system-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), false, false
);
insert into public.organizations (id, organization_type, name, created_by) values (
  '20000000-0000-4000-8000-000000000126', 'originator', 'Agent Work System Test',
  '10000000-0000-4000-8000-000000000126'
);
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values (
  '20000000-0000-4000-8000-000000000126', '10000000-0000-4000-8000-000000000126',
  'owner', 'active', now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000126","role":"authenticated","aal":"aal1"}',
  true
);

create temporary table native_assessment_ids (
  session_id uuid, project_id uuid, base_plan_id uuid, agent_plan_id uuid, run_id uuid, job_id uuid
);

do $$
declare
  session_id uuid;
  project_id uuid;
  base_plan_id uuid;
  agent_plan_id constant uuid := '30000000-0000-4000-8000-000000000126';
  run_id constant uuid := '40000000-0000-4000-8000-000000000126';
  job_id constant uuid := '50000000-0000-4000-8000-000000000126';
  plan jsonb := jsonb_build_object(
    'schemaVersion', 'capital-project-plan.v1',
    'compilerVersion', 'agent-work-system-test-v1',
    'registryVersion', 'agent-work-system-test-v1',
    'job', jsonb_build_object(
      'id', 'company_debt_view', 'targetTaskIds', jsonb_build_array('C11'),
      'firstWorkProduct', 'company_debt_view', 'confirmationGate', 'diagnostic',
      'accessPolicy', 'public_or_private', 'inputPolicy', '{}'::jsonb
    ),
    'taskSpecs', jsonb_build_array(jsonb_build_object(
      'id', 'C11', 'label', 'Sintetizar leitura de dívida', 'graph', 'case',
      'dependencies', '[]'::jsonb, 'executionClass', 'compilation',
      'effect', 'propose_state', 'maturity', 'implemented', 'ordinal', 0, 'batch', 0
    )),
    'parallelBatches', jsonb_build_array(jsonb_build_array('C11'))
  );
begin
  session_id := pg_temp.legacy_intake_for_work(public.start_public_capital_project_v2(
    'pt-BR', 'Projeto Teste do Deal Captain', 'company_debt_view',
    'Companhia Teste S.A.', '', plan
  ));
  select session.capital_project_id into project_id
  from public.document_intake_sessions session where session.id = session_id;
  select capital_plan.id into base_plan_id
  from public.capital_project_plans capital_plan
  where capital_plan.capital_project_id = project_id and capital_plan.status = 'active';
  insert into native_assessment_ids values (
    session_id, project_id, base_plan_id, agent_plan_id, run_id, job_id
  );
end;
$$;

reset role;
do $$
declare ids native_assessment_ids%rowtype;
begin
  select * into ids from native_assessment_ids;
  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    ids.run_id, '20000000-0000-4000-8000-000000000126', ids.session_id, 1,
    'manual', 'running', 'agent-work-system-test-v1', '{}', '{}',
    '10000000-0000-4000-8000-000000000126'
  );
  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, status,
    payload, lease_expires_at, capability_sha256
  ) values (
    ids.job_id, '20000000-0000-4000-8000-000000000126', ids.run_id, ids.session_id,
    'preliminary_analysis', 'leased', jsonb_build_object('analysis_scope','preliminary_understanding'), now() + interval '10 minutes',
    extensions.digest(repeat('c', 64), 'sha256')
  );
  update public.document_intake_sessions set current_run_id=ids.run_id where id=ids.session_id;
  insert into public.capital_project_agent_plans (
    id, organization_id, capital_project_id, base_plan_id, revision, status, goal,
    trigger_type, trigger_ref, schema_version, snapshot, plan_fingerprint, created_by
  ) values (
    ids.agent_plan_id, '20000000-0000-4000-8000-000000000126', ids.project_id,
    ids.base_plan_id, 1, 'active', 'Analisar a estrutura de capital da companhia.',
    'project_created', ids.project_id::text, 'dcm-agent-plan.v1', '{}', repeat('a', 64),
    '10000000-0000-4000-8000-000000000126'
  );
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000126","role":"authenticated","aal":"aal1"}',
  true
);


select public.accept_private_workspace_terms('pt-BR','Synthetic assessment reviewer','Analista',true,true);
select public.authorize_capital_project_private_work(project_id,true) from native_assessment_ids;
reset role;
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,sha256,byte_size,processing_status,scan_result,created_by)
select '51000000-0000-4000-8000-000000000126','20000000-0000-4000-8000-000000000126',session_id,
 '20000000-0000-4000-8000-000000000126/native-document.txt','native-document.txt',encode(extensions.digest('native assessment fixture','sha256'),'hex'),25,'ready','{"verdict":"clean"}','10000000-0000-4000-8000-000000000126'
from native_assessment_ids;
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,payload,lease_expires_at,capability_sha256)
select '52000000-0000-4000-8000-000000000126','20000000-0000-4000-8000-000000000126',run_id,session_id,'51000000-0000-4000-8000-000000000126',
 'document_pipeline','leased',jsonb_build_object('document_version',1,'sha256',encode(extensions.digest('native assessment fixture','sha256'),'hex')),clock_timestamp()+interval '10 minutes',extensions.digest(repeat('d',64),'sha256') from native_assessment_ids;
create function pg_temp.verify_native_assessment_source() returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.register_source_verification_v1('52000000-0000-4000-8000-000000000126',repeat('d',64),
 jsonb_build_object('verdict','clean','organizationId','20000000-0000-4000-8000-000000000126','sourceDocumentId','51000000-0000-4000-8000-000000000126',
 'operationId','52000000-0000-4000-8000-000000000126','documentVersion',1,'observedSha256',encode(extensions.digest('native assessment fixture','sha256'),'hex'),
 'expectedSha256',encode(extensions.digest('native assessment fixture','sha256'),'hex'),'observedByteSize',25,'expectedByteSize',25,'receiptId','sha256:'||repeat('d',64)));
end $$;
insert into public.organization_review_policies(organization_id,assignment_required,self_approval_allowed,updated_by)
values('20000000-0000-4000-8000-000000000126',false,true,'10000000-0000-4000-8000-000000000126')
on conflict(organization_id) do update set assignment_required=false,self_approval_allowed=true;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000126","role":"authenticated","aal":"aal1"}',true);
select pg_temp.verify_native_assessment_source();

-- Real server-closed abstention: no licensed physical public source exists in this work.
select public.worker_prepare_assessment_research_v1(job_id,repeat('c',64))from native_assessment_ids;
