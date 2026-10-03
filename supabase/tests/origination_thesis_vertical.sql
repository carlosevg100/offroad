-- Public origination thesis: atomic project memory, frozen plan, capability-scoped worker read,
-- idempotency, and tenant isolation. All fixtures are rolled back.

begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_persistent_work_fixture.sql
\ir support/execution_approval.sql

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

do $$
declare
  claim jsonb;
  context jsonb;
  revision_claim jsonb;
  revision_context jsonb;
  revision_result jsonb;
  revision_replay jsonb;
  chat_replay jsonb;
  v_task_id text;
  v_task_run_id uuid;
  v_input_fingerprint text;
  v_dependencies jsonb;
  v_artifact jsonb;
  v_artifact_content jsonb;
  v_meeting_artifact_id uuid;
  v_meeting_artifact_fingerprint text;
  rejected boolean := false;
begin
  perform pg_temp.fixture_approve_pending_executions();
  claim := public.worker_claim_job_v3(repeat('w', 64), 600);
  if claim ->> 'kind' <> 'capital_project_analysis'
    or claim #>> '{payload,analysis_scope}' <> 'origination_thesis' then
    raise exception 'origination worker did not claim the bounded job: %', claim;
  end if;

  context := public.worker_load_capital_project_context(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token'
  );
  if context #>> '{project,entry_job}' <> 'origination_thesis'
    or context #>> '{project,access_basis}' <> 'public_information'
    or context #>> '{brief,kind}' <> 'origination_thesis'
    or jsonb_array_length(context -> 'tasks') <> 9
    or context #>> '{tasks,8,id}' <> 'K04' then
    raise exception 'worker context was incomplete or not bound to the frozen plan: %', context;
  end if;

  begin
    perform public.worker_load_capital_project_context(
      (claim ->> 'job_id')::uuid, repeat('x', 64)
    );
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'worker context accepted a guessed capability'; end if;

  perform set_config('offroad_test.capital_job_id',claim->>'job_id',true);
  perform set_config('offroad_test.capability',claim->>'capability_token',true);
  perform set_config('offroad_test.worker_token',repeat('w',64),true);
end;
$$;
\ir support/capital_m07_complete_claimed_sql_fixture.sql
set local role authenticated;
do $$declare
 f record;t record;result jsonb;prior_jobs bigint;prior_decisions bigint;blocked boolean;
 artifact_id uuid:=current_setting('offroad_test.native_artifact_id')::uuid;
 artifact_fp text:=current_setting('offroad_test.native_artifact_fingerprint');
 project_id uuid;
begin
 select * into strict f from pg_temp.m07_recipe_fixture;select * into strict t from pg_temp.m07_lifecycle;
 project_id:=(f.base->>'workId')::uuid;
 perform public.worker_complete_job(f.job_id,f.capability,jsonb_build_object('meeting_brief_artifact_id',artifact_id));
 if(select status from public.processing_jobs where id=f.job_id)<>'succeeded'
 or not exists(select 1 from public.capital_project_artifacts a where a.id=artifact_id and a.artifact_fingerprint=artifact_fp and a.content->>'schemaVersion'='capital-m07-projection.v1')
 then raise exception 'origination_native_completion_missing';end if;
 -- The historical revision commands cannot revise a native physical product.
 -- Review/return positives belong to capital_public_artifact_review_cutover.sql;
 -- these assertions preserve the legacy boundary without fabricating a CPA.
 select count(*) into prior_jobs from public.processing_jobs where work_id=project_id;
 select count(*) into prior_decisions from public.capital_project_artifact_decisions where capital_project_id=project_id;
 blocked:=false;
 begin
  perform public.request_origination_thesis_revision_v1(artifact_id,artifact_fp,'Priorizar capital de giro; a hipótese de refinanciamento não reflete a conversa.');
 exception when insufficient_privilege then
  if sqlerrm<>'capital_artifact_review_upgrade_required' then raise;end if;blocked:=true;
 end;
 if not blocked then raise exception 'origination_old_revision_native_shortcut';end if;
 blocked:=false;
 begin
  perform public.submit_advisor_artifact_revision_turn_v1(project_id,'90000000-0000-4000-8000-000000000201','pt-BR','Priorizar capital de giro; a hipótese de refinanciamento não reflete a conversa.');
 exception when insufficient_privilege then
  if sqlerrm<>'capital_artifact_review_upgrade_required' then raise;end if;blocked:=true;
 end;
 if not blocked then raise exception 'origination_old_chat_revision_native_shortcut';end if;
 if(select count(*) from public.processing_jobs where work_id=project_id)<>prior_jobs
 or(select count(*) from public.capital_project_artifact_decisions where capital_project_id=project_id)<>prior_decisions
 or exists(select 1 from public.agent_messages where id='90000000-0000-4000-8000-000000000201')
 then raise exception 'origination_denied_revision_left_effects';end if;
 if(select count(*) from public.capital_project_task_runs rt join public.capital_project_plan_tasks pt on pt.organization_id=rt.organization_id and pt.id=rt.plan_task_id where rt.organization_id=(f.base->>'organizationId')::uuid and rt.plan_id=(f.base->>'planId')::uuid and pt.task_id in('M06','C02','K04') and rt.status='succeeded')<>3
 then raise exception 'origination_native_dependencies_not_real';end if;
 raise notice 'PASS origination_native_completion real_predecessors old_revision_shortcuts_denied no_partial_effects';
end;$$;
rollback;
select 'origination_thesis_vertical_passed' as result;
