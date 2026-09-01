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
    perform public.worker_record_agent_response_and_activate_v1(
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

  recorded := public.worker_record_agent_response_and_activate_v1(
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

  replayed := public.worker_record_agent_response_and_activate_v1(
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
    perform public.worker_record_agent_response_and_activate_v1(
      (claim ->> 'job_id')::uuid, repeat('x', 64), gen_random_uuid(),
      jsonb_build_object('state', 'idle', 'reply', 'Token inválido.'), null, null
    );
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'semantic activation accepted a guessed capability'; end if;
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
    or capital_job.payload #>> '{model_budget,max_cost_usd}' <> '0.75'
    or capital_job.payload #>> '{model_budget,max_calls}' <> '2'
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

rollback;
