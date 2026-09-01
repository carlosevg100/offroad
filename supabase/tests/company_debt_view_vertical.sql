-- Public company debt view: exact 24-task plan, capability-scoped execution, tenant isolation,
-- idempotent start and C11-only correction. Every fixture is rolled back.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000211', 'authenticated', 'authenticated',
   'debt-view-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000212', 'authenticated', 'authenticated',
   'debt-view-other@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000211', 'originator', 'Debt View Workspace', '10000000-0000-4000-8000-000000000211'),
  ('20000000-0000-4000-8000-000000000212', 'originator', 'Other Debt View Workspace', '10000000-0000-4000-8000-000000000212');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000211', '10000000-0000-4000-8000-000000000211', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000212', '10000000-0000-4000-8000-000000000212', 'owner', 'active', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000211","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  request_id constant uuid := '30000000-0000-4000-8000-000000000211';
  plan_snapshot jsonb;
  first_result jsonb;
  replay_result jsonb;
  project_id uuid;
begin
  select jsonb_build_object(
    'schemaVersion', 'capital-project-plan.v1',
    'compilerVersion', '2026.09.01-v2',
    'registryVersion', '2026.09.01-v2',
    'job', jsonb_build_object(
      'id', 'company_debt_view', 'targetTaskIds', jsonb_build_array('C11'),
      'firstWorkProduct', 'company_debt_diagnostic', 'confirmationGate', 'diagnostic',
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
      jsonb_build_array('M01','M02'), jsonb_build_array('M03','M04'),
      jsonb_build_array('M05','C02'), jsonb_build_array('M06'), jsonb_build_array('D01'),
      jsonb_build_array('D02'), jsonb_build_array('D03'), jsonb_build_array('D04'),
      jsonb_build_array('D05'), jsonb_build_array('D06'),
      jsonb_build_array('D07','C01','C05','C06'), jsonb_build_array('C03'),
      jsonb_build_array('C04','C07'), jsonb_build_array('C08'), jsonb_build_array('C09'),
      jsonb_build_array('C10'), jsonb_build_array('C11')
    )
  ) into plan_snapshot
  from (values
    ('M01','Resolver companhia e grupo','case',array[]::text[],'extraction','propose_state',0,0),
    ('M02','Normalizar objetivo','case',array[]::text[],'extraction','propose_state',1,0),
    ('M03','Registrar restrições','case',array['M02'],'extraction','propose_state',2,1),
    ('M04','Inferir arquétipos candidatos','case',array['M01','M02'],'judgment','propose_state',3,1),
    ('M05','Definir entregáveis','case',array['M02','M03'],'deterministic','propose_state',4,2),
    ('M06','Compilar plano de tarefas','case',array['M04','M05'],'deterministic','commit',5,3),
    ('D01','Ingerir e versionar arquivos','case',array['M06'],'deterministic','commit',6,4),
    ('D02','Classificar documento','case',array['D01'],'extraction','propose_state',7,5),
    ('D03','Extrair layout e conteúdo','case',array['D02'],'extraction','propose_state',8,6),
    ('D04','Extrair candidatos a fatos','case',array['D03'],'extraction','propose_state',9,7),
    ('D05','Resolver entidade, período e unidade','case',array['D04'],'deterministic','propose_state',10,8),
    ('D06','Conciliar fontes','case',array['D05'],'deterministic','commit',11,9),
    ('D07','Rodar identidades','case',array['D06'],'deterministic','propose_state',12,10),
    ('C01','Reconstruir modelo de negócio','case',array['D06'],'judgment','propose_state',13,10),
    ('C02','Pesquisar setor e regulação','knowledge',array['M01','M04'],'research','none',14,2),
    ('C03','Construir spreading','case',array['D06','D07'],'deterministic','propose_state',15,11),
    ('C04','Analisar qualidade do resultado','case',array['C03'],'judgment','propose_state',16,12),
    ('C05','Mapear dívida econômica','case',array['D06'],'deterministic','propose_state',17,10),
    ('C06','Analisar capital de giro','case',array['D06'],'deterministic','propose_state',18,10),
    ('C07','Normalizar projeções','case',array['C03','D06'],'deterministic','propose_state',19,12),
    ('C08','Rodar cenários e estresses','case',array['C03','C05','C07'],'deterministic','propose_state',20,13),
    ('C09','Identificar riscos e mitigantes','case',array['C01','C02','C03','C04','C05','C06','C07','C08'],'judgment','propose_state',21,14),
    ('C10','Calcular capacidade','case',array['C05','C08','C09'],'deterministic','propose_state',22,15),
    ('C11','Compilar tese de estruturação','case',array['C09','C10'],'judgment','propose_state',23,16)
  ) spec(id,label,graph,dependencies,execution_class,effect,ordinal,batch);

  first_result := public.start_public_company_debt_view_v1(
    request_id, 'pt-BR', 'Projeto Cedro', 'Cedro Distribuição S.A.', 'https://cedro.example',
    jsonb_build_object('focus', 'Compreender situação financeira, riscos e capacidade antes de escolher uma operação.'),
    plan_snapshot
  );
  project_id := (first_result ->> 'capital_project_id')::uuid;
  if first_result ->> 'replayed' <> 'false'
    or (select entry_job from public.capital_projects where id = project_id) <> 'company_debt_view'
    or (select count(*) from public.capital_project_briefs where capital_project_id = project_id and brief_kind = 'company_debt_view') <> 1
    or (select count(*) from public.capital_project_plan_tasks task join public.capital_project_plans plan on plan.id = task.plan_id where plan.capital_project_id = project_id) <> 24
    or (select dependencies from public.capital_project_plan_tasks task join public.capital_project_plans plan on plan.id = task.plan_id where plan.capital_project_id = project_id and task.task_id = 'C11') is distinct from array['C09','C10']::text[] then
    raise exception 'company debt start did not persist exact plan: %', first_result;
  end if;

  replay_result := public.start_public_company_debt_view_v1(
    request_id, 'pt-BR', 'Ignored', 'Ignored S.A.', '', '{}'::jsonb, plan_snapshot
  );
  if replay_result ->> 'replayed' <> 'true'
    or replay_result ->> 'capital_project_id' <> project_id::text
    or replay_result ->> 'job_id' <> first_result ->> 'job_id' then
    raise exception 'company debt start idempotency failed: %', replay_result;
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000212","role":"authenticated","aal":"aal1"}', true);
do $$ begin
  if (select count(*) from public.capital_projects where project_name = 'Projeto Cedro') <> 0
    or (select count(*) from public.capital_project_briefs where request_id = '30000000-0000-4000-8000-000000000211') <> 0 then
    raise exception 'company debt project crossed tenant boundary';
  end if;
end $$;

reset role;
do $$
declare
  v_job public.processing_jobs;
  v_run public.processing_runs;
begin
  select job.* into strict v_job
  from public.processing_jobs job
  join public.capital_project_briefs brief
    on brief.organization_id = job.organization_id
    and brief.id::text = job.payload ->> 'capital_project_brief_id'
  where brief.request_id = '30000000-0000-4000-8000-000000000211';
  select run.* into strict v_run from public.processing_runs run where run.id = v_job.processing_run_id;
  if v_job.payload #>> '{model_budget,max_cost_usd}' <> '0.95'
    or v_job.payload #>> '{model_budget,max_calls}' <> '2'
    or v_run.budget ->> 'maxCostUsd' <> '0.95'
    or v_run.budget ->> 'maxCalls' <> '2'
    or v_run.budget ->> 'externalSearchMaxUsd' <> '0.04' then
    raise exception 'company debt initial budget escaped its ceiling: job=%, run=%', v_job.payload, v_run.budget;
  end if;
end;
$$;

insert into private.worker_tokens (label, token_sha256)
values ('company-debt-worker-test', extensions.digest(repeat('v', 64), 'sha256'))
on conflict (token_sha256) do update set status = 'active', revoked_at = null;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000211","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  claim jsonb;
  context jsonb;
  revision_result jsonb;
  revision_replay jsonb;
  revision_claim jsonb;
  revision_context jsonb;
  v_task_id text;
  v_task_run_id uuid;
  v_input_fingerprint text;
  v_dependencies jsonb;
  v_artifact jsonb;
  v_final_artifact_id uuid;
  v_final_fingerprint text;
begin
  claim := public.worker_claim_job(repeat('v', 64), 600);
  if claim #>> '{payload,analysis_scope}' <> 'company_debt_view'
    or jsonb_array_length(claim #> '{payload,capital_task_ids}') <> 24
    or claim #>> '{payload,model_budget,max_cost_usd}' <> '0.95'
    or claim #>> '{payload,model_budget,max_calls}' <> '2' then
    raise exception 'worker did not claim company debt job: %', claim;
  end if;
  context := public.worker_load_capital_project_context((claim ->> 'job_id')::uuid, claim ->> 'capability_token');
  if context #>> '{project,entry_job}' <> 'company_debt_view'
    or context #>> '{brief,kind}' <> 'company_debt_view'
    or jsonb_array_length(context -> 'tasks') <> 24 then
    raise exception 'company debt worker context was incomplete: %', context;
  end if;

  foreach v_task_id in array array[
    'M01','M02','M03','M04','M05','C02','M06','D01','D02','D03','D04','D05','D06','D07',
    'C01','C03','C04','C05','C06','C07','C08','C09','C10','C11'
  ]::text[] loop
    v_input_fingerprint := encode(extensions.digest(convert_to('company-debt-test:' || v_task_id, 'utf8'), 'sha256'), 'hex');
    v_task_run_id := public.worker_start_capital_project_task(
      (claim ->> 'job_id')::uuid, claim ->> 'capability_token', v_task_id,
      'offroad.company_debt_view', '2026.09.01-v1', v_input_fingerprint,
      jsonb_build_object('schemaVersion', 'capital-context-manifest.v1')
    );
    select coalesce(jsonb_agg(jsonb_build_object(
      'artifactId', dependency_artifact.id,
      'artifactFingerprint', dependency_artifact.artifact_fingerprint
    ) order by dependency_task.task_id), '[]'::jsonb)
    into v_dependencies
    from public.capital_project_plan_tasks current_task
    cross join lateral unnest(current_task.dependencies) dependency_id
    join public.capital_project_plan_tasks dependency_task
      on dependency_task.organization_id = current_task.organization_id
      and dependency_task.plan_id = current_task.plan_id
      and dependency_task.task_id = dependency_id
    join public.capital_project_task_runs dependency_run
      on dependency_run.organization_id = dependency_task.organization_id
      and dependency_run.plan_task_id = dependency_task.id
      and dependency_run.status = 'succeeded'
    join public.capital_project_artifacts dependency_artifact
      on dependency_artifact.organization_id = dependency_run.organization_id
      and dependency_artifact.task_run_id = dependency_run.id
      and dependency_artifact.status not in ('stale', 'superseded')
    where current_task.organization_id = (claim ->> 'organization_id')::uuid
      and current_task.plan_id = (context #>> '{plan,id}')::uuid
      and current_task.task_id = v_task_id;

    v_artifact := public.worker_record_capital_project_artifact(
      (claim ->> 'job_id')::uuid, claim ->> 'capability_token', v_task_run_id,
      case when v_task_id = 'C11' then 'company_debt_diagnostic' else 'company_debt_' || lower(v_task_id) end,
      'capital-artifact.v1', case when v_task_id = 'C11' then 'pending_confirmation' else 'draft' end,
      v_input_fingerprint, jsonb_build_object('taskId', v_task_id, 'fixture', true),
      case when v_task_id in ('C09','C10') then jsonb_build_array(jsonb_build_object('sourceType', 'public_research_run', 'sourceId', '80000000-0000-4000-8000-000000000211')) else jsonb_build_array() end,
      v_dependencies
    );
    perform public.worker_finish_capital_project_task(
      (claim ->> 'job_id')::uuid, claim ->> 'capability_token', v_task_run_id,
      'succeeded', jsonb_build_object('type', 'capital_project_artifact', 'id', v_artifact ->> 'id'),
      v_artifact ->> 'artifact_fingerprint', jsonb_build_array(jsonb_build_object('id', 'contract', 'passed', true)),
      jsonb_build_object(), null
    );
    if v_task_id = 'C11' then
      v_final_artifact_id := (v_artifact ->> 'id')::uuid;
      v_final_fingerprint := v_artifact ->> 'artifact_fingerprint';
    end if;
  end loop;
  perform public.worker_complete_job((claim ->> 'job_id')::uuid, claim ->> 'capability_token', jsonb_build_object('artifactId', v_final_artifact_id));

  revision_result := public.request_company_debt_view_revision_v1(
    v_final_artifact_id, v_final_fingerprint,
    'Deixar explícito que o capital de giro ainda não foi conciliado.'
  );
  if revision_result ->> 'replayed' <> 'false'
    or (select status from public.capital_project_artifacts where id = v_final_artifact_id) <> 'superseded'
    or (select status from public.capital_project_task_runs where id = v_task_run_id) <> 'invalidated'
    or (select count(*) from public.capital_project_task_runs run join public.capital_project_plan_tasks task on task.id = run.plan_task_id where run.organization_id = (claim ->> 'organization_id')::uuid and task.task_id in ('C09','C10') and run.status = 'succeeded') <> 2 then
    raise exception 'company debt revision did not preserve C09/C10: %', revision_result;
  end if;
  revision_replay := public.request_company_debt_view_revision_v1(v_final_artifact_id, v_final_fingerprint, 'Deixar explícito que o capital de giro ainda não foi conciliado.');
  if revision_replay ->> 'replayed' <> 'true'
    or revision_replay ->> 'job_id' <> revision_result ->> 'job_id' then
    raise exception 'company debt revision replay failed: %', revision_replay;
  end if;

  revision_claim := public.worker_claim_job(repeat('v', 64), 600);
  if revision_claim #>> '{payload,analysis_scope}' <> 'company_debt_view'
    or revision_claim #>> '{payload,capital_task_ids,0}' <> 'C11'
    or jsonb_array_length(revision_claim #> '{payload,capital_task_ids}') <> 1
    or revision_claim #>> '{payload,model_budget,max_cost_usd}' <> '0.85'
    or revision_claim #>> '{payload,model_budget,max_calls}' <> '1' then
    raise exception 'worker did not claim C11-only revision: %', revision_claim;
  end if;
  revision_context := public.worker_load_capital_project_context((revision_claim ->> 'job_id')::uuid, revision_claim ->> 'capability_token');
  if revision_context #>> '{revision,of_artifact_id}' <> v_final_artifact_id::text
    or jsonb_array_length(revision_context -> 'dependency_artifacts') <> 2
    or not (select bool_and((item ->> 'task_id') in ('C09','C10')) from jsonb_array_elements(revision_context -> 'dependency_artifacts') item) then
    raise exception 'company debt revision context escaped dependency boundary: %', revision_context;
  end if;
end;
$$;

reset role;
do $$
declare
  v_job public.processing_jobs;
  v_run public.processing_runs;
begin
  select job.* into strict v_job
  from public.processing_jobs job
  where job.payload #>> '{trigger_event,type}' = 'artifact_correction_requested'
    and job.payload ->> 'analysis_scope' = 'company_debt_view';
  select run.* into strict v_run from public.processing_runs run where run.id = v_job.processing_run_id;
  if v_job.payload #>> '{model_budget,max_cost_usd}' <> '0.85'
    or v_job.payload #>> '{model_budget,max_calls}' <> '1'
    or v_run.budget ->> 'maxCostUsd' <> '0.85'
    or v_run.budget ->> 'maxCalls' <> '1'
    or v_run.budget ->> 'externalSearchMaxUsd' <> '0' then
    raise exception 'company debt revision budget escaped its ceiling: job=%, run=%', v_job.payload, v_run.budget;
  end if;
end;
$$;

rollback;

select 'company_debt_view_vertical_passed' as result;
