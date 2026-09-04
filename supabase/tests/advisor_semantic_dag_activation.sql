-- A conversational request activates the exact released public DAG in the same project. The
-- response, company context, versioned brief and queued execution are atomic and capability-bound.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  '10000000-0000-4000-8000-000000000231', 'authenticated', 'authenticated',
  'semantic-router-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), false, false
);

insert into public.organizations (id, organization_type, name, created_by) values (
  '20000000-0000-4000-8000-000000000231', 'originator', 'Semantic Router Workspace',
  '10000000-0000-4000-8000-000000000231'
);
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values (
  '20000000-0000-4000-8000-000000000231',
  '10000000-0000-4000-8000-000000000231', 'owner', 'active', now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000231","role":"authenticated","aal":"aal1"}',
  true
);

select public.save_professional_capability_context_v1(
  '20000000-0000-4000-8000-000000000231',
  'bank', 'dcm_banker', 'DCM',
  array['prepare_meetings', 'originate_ideas'],
  'Banco Farol',
  array['structuring', 'distribution'],
  array['capital_markets'],
  'Contexto usado para calibrar, nunca restringir, as alternativas.',
  false
);

do $$
declare
  source_request_id constant uuid := '30000000-0000-4000-8000-000000000231';
  plan_snapshot jsonb;
  started jsonb;
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
      jsonb_build_array('M01', 'M02'), jsonb_build_array('M03', 'M04'),
      jsonb_build_array('M05', 'C02', 'K04'), jsonb_build_array('M06'), jsonb_build_array('M07')
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

  started := public.start_advisor_project_v1(
    source_request_id, 'pt-BR', 'Reunião Farol', 'origination_thesis',
    'Tenho uma reunião com a Companhia Farol e quero preparar uma tese de originação de dívida.',
    'public_information', plan_snapshot
  );
  perform public.queue_advisor_initial_turn_v1((started ->> 'capital_project_id')::uuid);
end;
$$;

reset role;
insert into private.worker_tokens (label, token_sha256)
values ('advisor-semantic-router-test', extensions.digest(repeat('s', 64), 'sha256'))
on conflict (token_sha256) do update set status = 'active', revoked_at = null;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000231","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  assistant_id constant uuid := '40000000-0000-4000-8000-000000000231';
  claim jsonb;
  context jsonb;
  recorded jsonb;
  replayed jsonb;
  rejected boolean := false;
  identity_rejected boolean := false;
begin
  claim := public.worker_claim_job(repeat('s', 64), 600);
  if claim ->> 'kind' <> 'agent_operation_brief' then
    raise exception 'semantic router did not claim the conversational job: %', claim;
  end if;
  context := public.worker_load_agent_context(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token'
  );
  begin
    perform public.worker_record_agent_response_and_activate_v2(
      (claim ->> 'job_id')::uuid,
      claim ->> 'capability_token',
      assistant_id,
      jsonb_build_object('state', 'idle', 'reply', 'Identidade não suportada.'),
      null,
      jsonb_build_object(
        'job', 'origination_thesis',
        'company', jsonb_build_object('name', 'Companhia Inventada'),
        'brief', jsonb_build_object(
          'meetingContext', 'Preparar uma reunião sobre alternativas de dívida para uma companhia não informada.'
        )
      )
    );
  exception when invalid_parameter_value then identity_rejected := true;
  end;
  if not identity_rejected then
    raise exception 'semantic activation trusted a company identity not supplied by the user';
  end if;

  recorded := public.worker_record_agent_response_and_activate_v2(
    (claim ->> 'job_id')::uuid,
    claim ->> 'capability_token',
    assistant_id,
    jsonb_build_object(
      'state', 'idle',
      'reply', 'Entendi a Companhia Farol. Vou iniciar o plano especializado neste projeto.',
      'activation', jsonb_build_object(
        'job', 'origination_thesis',
        'company', jsonb_build_object('name', 'Companhia Farol'),
        'brief', jsonb_build_object(
          'meetingContext', 'Preparar uma reunião sobre alternativas de dívida para a Companhia Farol.'
        )
      )
    ),
    null,
    jsonb_build_object(
      'job', 'origination_thesis',
      'company', jsonb_build_object('name', 'Companhia Farol'),
      'brief', jsonb_build_object(
        'meetingContext', 'Preparar uma reunião sobre alternativas de dívida para a Companhia Farol.'
      )
    )
  );

  if recorded #>> '{activation,analysis_scope}' <> 'origination_thesis'
    or coalesce(recorded #>> '{activation,job_id}', '') = '' then
    raise exception 'semantic activation did not persist one coherent execution: %', recorded;
  end if;

  replayed := public.worker_record_agent_response_and_activate_v2(
    (claim ->> 'job_id')::uuid,
    claim ->> 'capability_token',
    assistant_id,
    jsonb_build_object('state', 'idle', 'reply', 'Replay idempotente.'),
    null,
    jsonb_build_object(
      'job', 'origination_thesis',
      'company', jsonb_build_object('name', 'Companhia Farol'),
      'brief', jsonb_build_object(
        'meetingContext', 'Preparar uma reunião sobre alternativas de dívida para a Companhia Farol.'
      )
    )
  );
  if replayed #>> '{activation,replayed}' <> 'true'
    or replayed #>> '{activation,job_id}' <> recorded #>> '{activation,job_id}' then
    raise exception 'semantic activation replay duplicated execution: %', replayed;
  end if;

  begin
    perform public.worker_record_agent_response_and_activate_v2(
      (claim ->> 'job_id')::uuid, repeat('x', 64), gen_random_uuid(),
      jsonb_build_object('state', 'idle', 'reply', 'Token inválido.'), null, null
    );
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'semantic activation accepted a guessed capability'; end if;

  -- The conversational job has finished its atomic response-and-activation work. Completing it
  -- cannot move the session away from the newer specialized run that activation just installed.
  perform public.worker_complete_job(
    (claim ->> 'job_id')::uuid,
    claim ->> 'capability_token',
    jsonb_build_object('activation', recorded -> 'activation')
  );
end;
$$;

-- Internal persistence is asserted as the database owner, not by weakening tenant grants merely
-- for a test. The authenticated section above proves the only callable worker surface.
reset role;

do $$
declare
  source_request_id constant uuid := '30000000-0000-4000-8000-000000000231';
  assistant_id constant uuid := '40000000-0000-4000-8000-000000000231';
  project_id uuid;
  session_id uuid;
  capital_job public.processing_jobs;
  capital_run public.processing_runs;
begin
  select brief.capital_project_id into strict project_id
  from public.capital_project_briefs brief
  where brief.request_id = source_request_id;
  select session.id into strict session_id
  from public.document_intake_sessions session
  where session.capital_project_id = project_id;
  select job.* into strict capital_job
  from public.processing_jobs job
  where job.kind = 'capital_project_analysis'
    and job.payload ->> 'capital_project_id' = project_id::text;
  select run.* into strict capital_run
  from public.processing_runs run
  where run.id = capital_job.processing_run_id;

  if capital_job.payload #>> '{trigger_event,type}' <> 'advisor_semantic_route'
    or capital_job.payload #>> '{model_budget,max_cost_usd}' <> '1.50'
    or capital_job.payload #>> '{model_budget,max_calls}' <> '2'
    or capital_run.budget ->> 'maxCostUsd' <> '1.50'
    or capital_run.budget ->> 'externalSearchMaxUsd' <> '0.04'
    or (select company_profile ->> 'name' from public.document_intake_sessions where id = session_id) <> 'Companhia Farol'
    or (select current_run_id from public.document_intake_sessions where id = session_id) <> capital_run.id
    or (select state from public.agent_conversations where intake_session_id = session_id) <> 'analyzing'
    or (select metadata #>> '{activation,analysisScope}' from public.agent_messages where id = assistant_id) <> 'origination_thesis'
    or (select count(*) from public.agent_messages where id = assistant_id) <> 1
    or (select count(*) from public.capital_project_briefs brief where brief.capital_project_id = project_id and brief.request_id = source_request_id) <> 1
    or (select count(*) from public.processing_jobs job where job.kind = 'capital_project_analysis' and job.payload ->> 'capital_project_id' = project_id::text) <> 1 then
    raise exception 'semantic activation did not persist one coherent idempotent execution';
  end if;
end;
$$;

-- A terminal specialized job does not make its brief permanently un-runnable. A later user turn
-- creates one new immutable brief version and one new analysis run with the enriched context.
reset role;
do $$
declare
  project_id uuid;
  session_id uuid;
  failed_job public.processing_jobs;
  failed_task public.capital_project_plan_tasks;
begin
  select brief.capital_project_id into strict project_id
  from public.capital_project_briefs brief
  where brief.request_id = '30000000-0000-4000-8000-000000000231'::uuid;
  select session.id into strict session_id
  from public.document_intake_sessions session
  where session.capital_project_id = project_id;
  select job.* into strict failed_job
  from public.processing_jobs job
  where job.kind = 'capital_project_analysis'
    and job.payload ->> 'capital_project_id' = project_id::text;

  select task.* into strict failed_task
  from public.capital_project_plan_tasks task
  where task.organization_id = failed_job.organization_id
    and task.plan_id = (failed_job.payload ->> 'capital_project_plan_id')::uuid
    and task.task_id = 'M07';
  insert into public.capital_project_task_runs (
    id, organization_id, capital_project_id, plan_id, plan_task_id,
    processing_job_id, attempt_no, status, trigger_event, context_manifest,
    input_fingerprint, executor_key, executor_version, quality_results, error,
    started_at, completed_at
  ) values (
    '50000000-0000-4000-8000-000000000230', failed_job.organization_id,
    project_id, failed_task.plan_id, failed_task.id, failed_job.id, 1, 'failed',
    failed_job.payload -> 'trigger_event', '{}'::jsonb, repeat('f', 64),
    'offroad.origination_thesis', 'fixture-v1',
    jsonb_build_array(jsonb_build_object(
      'id', 'unsupported_material_numbers', 'passed', false,
      'detail', 'Unsupported tokens: 3.5x'
    )),
    jsonb_build_object('code', 'quality_gate_m07_failed'), now(), now()
  );

  update public.processing_jobs
  set status = 'failed', last_error = '{"code":"fixture_failure"}'::jsonb
  where id = failed_job.id;
  update public.processing_runs set status = 'failed' where id = failed_job.processing_run_id;
  update public.document_intake_sessions set status = 'failed' where id = session_id;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000231","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  retry_message_id constant uuid := '30000000-0000-4000-8000-000000000232';
  retry_assistant_id constant uuid := '40000000-0000-4000-8000-000000000232';
  project_id uuid;
  session_id uuid;
  submitted jsonb;
  claim jsonb;
  context jsonb;
  retried jsonb;
begin
  select project.id, session.id into strict project_id, session_id
  from public.document_intake_sessions session
  join public.capital_projects project
    on project.organization_id = session.organization_id
    and project.id = session.capital_project_id
  where project.project_name = 'Reunião Farol';

  submitted := public.submit_advisor_turn_v1(
    project_id,
    retry_message_id,
    'pt-BR',
    'A conversa é com CFO e tesouraria. Não temos exposição. Retome usando este contexto.'
  );
  claim := public.worker_claim_job(repeat('s', 64), 600);
  if claim ->> 'kind' <> 'agent_operation_brief'
    or claim ->> 'job_id' <> submitted ->> 'job_id' then
    raise exception 'failed-analysis retry did not claim the advisor turn: %', claim;
  end if;
  context := public.worker_load_agent_context(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token'
  );
  retried := public.worker_record_agent_response_and_activate_v2(
    (claim ->> 'job_id')::uuid,
    claim ->> 'capability_token',
    retry_assistant_id,
    jsonb_build_object('state', 'idle', 'reply', 'Vou retomar a análise com o contexto já fornecido.'),
    null,
    jsonb_build_object(
      'job', 'origination_thesis',
      'company', jsonb_build_object('name', 'Companhia Farol'),
      'brief', jsonb_build_object(
        'meetingContext', 'Preparar uma reunião sobre alternativas de dívida para a Companhia Farol. A conversa é com CFO e tesouraria. Não temos exposição.'
      )
    )
  );
  if retried #>> '{activation,retried}' <> 'true'
    or retried #>> '{activation,replayed}' <> 'false'
    or coalesce(retried #>> '{activation,job_id}', '') = '' then
    raise exception 'failed specialized analysis was not retried: %', retried;
  end if;
  perform public.worker_complete_job(
    (claim ->> 'job_id')::uuid,
    claim ->> 'capability_token',
    jsonb_build_object('activation', retried -> 'activation')
  );
end;
$$;

reset role;
do $$
declare
  project_id uuid;
  active_brief public.capital_project_briefs;
  retry_job public.processing_jobs;
begin
  select project.id into strict project_id
  from public.capital_projects project
  where project.project_name = 'Reunião Farol';
  select brief.* into strict active_brief
  from public.capital_project_briefs brief
  where brief.capital_project_id = project_id and brief.status = 'active';
  select job.* into strict retry_job
  from public.processing_jobs job
  where job.kind = 'capital_project_analysis'
    and job.payload ->> 'capital_project_id' = project_id::text
    and job.status = 'queued';

  if active_brief.brief_version <> 2
    or active_brief.content ->> 'meetingContext' not like '%CFO e tesouraria%'
    or retry_job.payload #>> '{trigger_event,type}' <> 'advisor_semantic_route'
    or retry_job.payload #>> '{trigger_event,reason}' <> 'failed_analysis_retry'
    or retry_job.payload ->> 'capital_project_brief_id' <> active_brief.id::text
    or (select count(*) from public.capital_project_briefs brief where brief.capital_project_id = project_id) <> 2
    or (select count(*) from public.capital_project_briefs brief where brief.capital_project_id = project_id and brief.status = 'superseded') <> 1
    or (select count(*) from public.processing_jobs job where job.kind = 'capital_project_analysis' and job.payload ->> 'capital_project_id' = project_id::text) <> 2 then
    raise exception 'failed-analysis retry did not preserve one immutable brief and one new run';
  end if;
end;
$$;

-- Claim the newly activated DAG as the worker. Its short-lived capability is carried only in a
-- transaction-local setting so the database-owner fixture can attach one exact final artifact.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000231","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  claim jsonb;
  context jsonb;
begin
  claim := public.worker_claim_job(repeat('s', 64), 600);
  if claim ->> 'kind' <> 'capital_project_analysis'
    or claim #>> '{payload,trigger_event,type}' <> 'advisor_semantic_route'
    or claim #>> '{payload,trigger_event,reason}' <> 'failed_analysis_retry' then
    raise exception 'semantic completion did not claim the activated DAG: %', claim;
  end if;
  context := public.worker_load_capital_project_context_v5(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token'
  );
  if context #>> '{professional_context,professionalRole}' <> 'dcm_banker'
    or context #>> '{professional_context,institutionName}' <> 'Banco Farol'
    or context #>> '{institution_capabilities,operatingModels,0}' <> 'structuring'
    or context #>> '{prior_failed_task_feedback,0,task_id}' <> 'M07'
    or context #>> '{prior_failed_task_feedback,0,quality_results,0,id}' <> 'unsupported_material_numbers' then
    raise exception 'specialized project context did not receive the initiating user profile: %', context;
  end if;
  perform set_config('offroad_test.capital_job_id', claim ->> 'job_id', true);
  perform set_config('offroad_test.capability', claim ->> 'capability_token', true);
end;
$$;

reset role;

do $$
declare
  capital_job public.processing_jobs;
  plan_task public.capital_project_plan_tasks;
  task_run_id constant uuid := '50000000-0000-4000-8000-000000000231';
  artifact_id constant uuid := '60000000-0000-4000-8000-000000000231';
  artifact_fingerprint constant text := repeat('a', 64);
begin
  select job.* into strict capital_job
  from public.processing_jobs job
  where job.id = current_setting('offroad_test.capital_job_id')::uuid;
  select task.* into strict plan_task
  from public.capital_project_plan_tasks task
  where task.organization_id = capital_job.organization_id
    and task.plan_id::text = capital_job.payload ->> 'capital_project_plan_id'
    and task.task_id = 'M07';

  insert into public.capital_project_task_runs (
    id, organization_id, capital_project_id, plan_id, plan_task_id,
    processing_job_id, attempt_no, status, trigger_event, context_manifest,
    input_fingerprint, executor_key, executor_version, started_at
  ) values (
    task_run_id, capital_job.organization_id,
    (capital_job.payload ->> 'capital_project_id')::uuid,
    (capital_job.payload ->> 'capital_project_plan_id')::uuid,
    plan_task.id, capital_job.id, 2, 'running', capital_job.payload -> 'trigger_event',
    '{}'::jsonb, repeat('1', 64), 'origination-thesis', '2026.09.01-v1', now()
  );

  insert into public.capital_project_artifacts (
    id, organization_id, capital_project_id, plan_id, task_run_id, artifact_type,
    schema_version, artifact_version, status, input_fingerprint,
    artifact_fingerprint, content, evidence_refs, dependencies,
    processing_job_id, created_by_kind
  ) values (
    artifact_id, capital_job.organization_id,
    (capital_job.payload ->> 'capital_project_id')::uuid,
    (capital_job.payload ->> 'capital_project_plan_id')::uuid,
    task_run_id, 'meeting_brief', 'origination-meeting-brief.v1', 1,
    'pending_confirmation', repeat('1', 64), artifact_fingerprint,
    jsonb_build_object('schemaVersion', 'origination-meeting-brief.v1'),
    '[]'::jsonb, '[]'::jsonb, capital_job.id, 'worker'
  );

  update public.capital_project_task_runs run
  set status = 'succeeded',
      output_reference = jsonb_build_object('type', 'capital_project_artifact', 'id', artifact_id),
      output_fingerprint = artifact_fingerprint,
      quality_results = jsonb_build_array(jsonb_build_object('grader', 'schema', 'passed', true)),
      completed_at = now()
  where run.id = task_run_id;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000231","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  completion jsonb;
  wrong_artifact_rejected boolean := false;
  mismatched_result_rejected boolean := false;
  project_id uuid;
begin
  select artifact.capital_project_id into strict project_id
  from public.capital_project_artifacts artifact
  where artifact.id = '60000000-0000-4000-8000-000000000231';
  begin
    perform public.worker_complete_advisor_specialized_job_v1(
      current_setting('offroad_test.capital_job_id')::uuid,
      current_setting('offroad_test.capability'),
      '70000000-0000-4000-8000-000000000231',
      '60000000-0000-4000-8000-000000000999', repeat('a', 64),
      'Material incorreto.', '{}'::jsonb
    );
  exception when no_data_found then wrong_artifact_rejected := true;
  end;
  if not wrong_artifact_rejected then
    raise exception 'semantic completion accepted an artifact outside the exact job';
  end if;

  begin
    perform public.worker_complete_advisor_specialized_job_v1(
      current_setting('offroad_test.capital_job_id')::uuid,
      current_setting('offroad_test.capability'),
      '70000000-0000-4000-8000-000000000231',
      '60000000-0000-4000-8000-000000000231', repeat('a', 64),
      'Resultado inconsistente.', jsonb_build_object('capital_project_id', project_id)
    );
  exception when invalid_parameter_value then mismatched_result_rejected := true;
  end;
  if not mismatched_result_rejected then
    raise exception 'semantic completion accepted a job result that disagrees with the artifact';
  end if;

  -- A user may keep talking while the longer specialized DAG runs. Its completion must publish
  -- the result without falsely marking a newer queued turn as idle.
  perform public.submit_advisor_turn_v1(
    project_id,
    '71000000-0000-4000-8000-000000000231',
    'pt-BR',
    'Enquanto isso, registre também a prioridade de capital de giro.'
  );

  completion := public.worker_complete_advisor_specialized_job_v1(
    current_setting('offroad_test.capital_job_id')::uuid,
    current_setting('offroad_test.capability'),
    '70000000-0000-4000-8000-000000000231',
    '60000000-0000-4000-8000-000000000231', repeat('a', 64),
    'Concluí a leitura pública. O material está pronto para sua revisão.',
    jsonb_build_object(
      'capital_project_id', project_id,
      'meeting_brief_artifact_id', '60000000-0000-4000-8000-000000000231',
      'artifact_fingerprint', repeat('a', 64)
    )
  );
  if completion ->> 'completion_message_id' <> '70000000-0000-4000-8000-000000000231'
    or completion ->> 'artifact_id' <> '60000000-0000-4000-8000-000000000231'
    or completion ->> 'analysis_scope' <> 'origination_thesis' then
    raise exception 'semantic completion returned an incoherent result: %', completion;
  end if;
end;
$$;

reset role;

do $$
declare
  capital_job public.processing_jobs;
  completion_message public.agent_messages;
begin
  select job.* into strict capital_job
  from public.processing_jobs job
  where job.id = current_setting('offroad_test.capital_job_id')::uuid;
  select message.* into strict completion_message
  from public.agent_messages message
  where message.id = '70000000-0000-4000-8000-000000000231';

  if capital_job.status <> 'succeeded'
    or capital_job.capability_sha256 is not null
    or completion_message.role <> 'assistant'
    or completion_message.status <> 'completed'
    or completion_message.metadata ->> 'kind' <> 'advisor_specialized_completion'
    or completion_message.metadata ->> 'completionForJobId' <> capital_job.id::text
    or completion_message.metadata #>> '{artifact,id}' <> '60000000-0000-4000-8000-000000000231'
    or completion_message.metadata #>> '{artifact,type}' <> 'meeting_brief'
    or (select state from public.agent_conversations where id = completion_message.conversation_id) <> 'analyzing'
    or (select count(*) from public.agent_messages message where message.id = '71000000-0000-4000-8000-000000000231' and message.status = 'queued') <> 1
    or (select status from public.document_intake_sessions where id = capital_job.intake_session_id) <> 'review_ready'
    or (select count(*) from public.agent_messages message where message.metadata ->> 'completionForJobId' = capital_job.id::text) <> 1
    or not has_function_privilege(
      'authenticated',
      'public.worker_complete_advisor_specialized_job_v1(uuid,text,uuid,uuid,text,text,jsonb)',
      'execute'
    )
    or has_function_privilege(
      'anon',
      'public.worker_complete_advisor_specialized_job_v1(uuid,text,uuid,uuid,text,text,jsonb)',
      'execute'
    ) then
    raise exception 'semantic completion did not atomically publish one governed chat result';
  end if;
end;
$$;

rollback;
