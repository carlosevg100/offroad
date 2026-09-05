-- integration_preview: the grant is invisible to tenants, travels in the claim, gates the preview
-- activation, and the preview run completes into the same conversation with a preview-tagged
-- message. Without the grant nothing activates, whatever the payload says.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  '10000000-0000-4000-8000-000000000251', 'authenticated', 'authenticated',
  'integration-preview-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), false, false
), (
  '10000000-0000-4000-8000-000000000252', 'authenticated', 'authenticated',
  'integration-preview-neighbour@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), false, false
);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000251', 'originator', 'Preview Workspace', '10000000-0000-4000-8000-000000000251'),
  ('20000000-0000-4000-8000-000000000252', 'originator', 'Neighbour Workspace', '10000000-0000-4000-8000-000000000252');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000251', '10000000-0000-4000-8000-000000000251', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000252', '10000000-0000-4000-8000-000000000252', 'owner', 'active', now());

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000251","role":"authenticated","aal":"aal1"}',
  true
);

select public.save_professional_capability_context_v2(
  '20000000-0000-4000-8000-000000000251',
  array['institutional_work'],
  array['banker'],
  array['investment_banking', 'dcm'],
  array['prepare_meetings'],
  'Banco Preview',
  false
);

-- The tenant sees no grant before the operator writes one, and cannot write one itself.
do $$
declare
  status jsonb;
  denied boolean := false;
begin
  status := public.get_integration_preview_status_v1('20000000-0000-4000-8000-000000000251');
  if (status ->> 'enabled')::boolean then
    raise exception 'integration_preview reported enabled without a grant: %', status;
  end if;
  begin
    insert into private.integration_preview_grants (organization_id, granted_by)
    values ('20000000-0000-4000-8000-000000000251', 'tenant');
  exception when insufficient_privilege or undefined_table then denied := true;
  end;
  if not denied then raise exception 'a tenant wrote an integration_preview grant'; end if;
end;
$$;

do $$
declare
  source_request_id constant uuid := '30000000-0000-4000-8000-000000000251';
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
    source_request_id, 'pt-BR', 'Reunião Camil (preview)', 'origination_thesis',
    'Sou analista de IB. Meu VP pediu material para uma reunião com a Camil sobre refinanciamento.',
    'public_information', plan_snapshot
  );
  perform public.queue_advisor_initial_turn_v1((started ->> 'capital_project_id')::uuid);
end;
$$;

reset role;
insert into private.worker_tokens (label, token_sha256)
values ('integration-preview-test', extensions.digest(repeat('p', 64), 'sha256'))
on conflict (token_sha256) do update set status = 'active', revoked_at = null;

-- Without the grant: the claim says so and the activation is refused.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000251","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  assistant_id constant uuid := '40000000-0000-4000-8000-000000000251';
  claim jsonb;
  refused boolean := false;
  preview_activation jsonb := jsonb_build_object(
    'job', 'integration_preview',
    'composition', 'prepare_meeting',
    'caseId', 'gc01-analista-ib-camil',
    'workflow', jsonb_build_object('id', 'case01.prepare_meeting', 'version', '2026.09.05-v1', 'fingerprint', repeat('a', 64)),
    'brief', jsonb_build_object('sponsorInstruction', 'refinanciamento', 'premises', '{}'::jsonb),
    'plan', jsonb_build_object(
      'schemaVersion', 'capital-project-plan.v1',
      'compilerVersion', 'integration-preview-2026.09.05-v1',
      'registryVersion', '2026.09.01-v3',
      'job', jsonb_build_object('id', 'origination_thesis', 'targetTaskIds', jsonb_build_array('A03'), 'firstWorkProduct', 'preview_meeting_brief', 'confirmationGate', 'preliminary_understanding', 'inputPolicy', '{}'::jsonb),
      'taskSpecs', jsonb_build_array(
        jsonb_build_object('id', 'C05', 'label', 'Mapear dívida econômica', 'graph', 'case', 'dependencies', '[]'::jsonb, 'executionClass', 'deterministic', 'effect', 'propose_state', 'maturity', 'implemented', 'ordinal', 0, 'batch', 0),
        jsonb_build_object('id', 'A03', 'label', 'Planejar a devolutiva', 'graph', 'case', 'dependencies', jsonb_build_array('C05'), 'executionClass', 'compilation', 'effect', 'propose_state', 'maturity', 'implemented', 'ordinal', 1, 'batch', 1)
      ),
      'parallelBatches', jsonb_build_array(jsonb_build_array('C05'), jsonb_build_array('A03'))
    )
  );
begin
  claim := public.worker_claim_job(repeat('p', 64), 600);
  if claim ->> 'kind' <> 'agent_operation_brief' then
    raise exception 'the conversational job was not claimed: %', claim;
  end if;
  if (claim ->> 'integration_preview')::boolean then
    raise exception 'the claim reported integration_preview without a grant: %', claim;
  end if;
  begin
    perform public.worker_record_agent_response_and_activate_v3(
      (claim ->> 'job_id')::uuid, claim ->> 'capability_token', assistant_id,
      jsonb_build_object('state', 'idle', 'reply', 'Vou iniciar a validação interna.'),
      null, preview_activation
    );
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'the preview activation ran without a grant'; end if;
  -- The response itself is not recorded when the activation is refused: the transaction rolled back.
  if exists (select 1 from public.agent_messages message where message.id = assistant_id) then
    raise exception 'a refused preview activation left the assistant message behind';
  end if;
  -- The turn is closed the way the worker closes a failed brief: the user message becomes failed
  -- and the job records its cause, so the next turn may be submitted.
  perform public.worker_record_agent_failure((claim ->> 'job_id')::uuid, claim ->> 'capability_token', 'integration_preview_not_granted');
  perform public.worker_fail_job(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token',
    jsonb_build_object('code', 'integration_preview_not_granted', 'stage', 'agent_operation_brief', 'retryable', false),
    false
  );
end;
$$;

-- The operator grants the mode to one organization.
reset role;
insert into private.integration_preview_grants (organization_id, note, granted_by)
values ('20000000-0000-4000-8000-000000000251', 'Caso 01 em validação interna', 'operator-test');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000251","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  status jsonb;
begin
  status := public.get_integration_preview_status_v1('20000000-0000-4000-8000-000000000251');
  if not (status ->> 'enabled')::boolean or status ->> 'note' <> 'Caso 01 em validação interna' then
    raise exception 'the grant is not visible to its own organization: %', status;
  end if;
  status := public.get_integration_preview_status_v1('20000000-0000-4000-8000-000000000252');
  if (status ->> 'enabled')::boolean then
    raise exception 'the grant leaked to an organization the caller does not belong to: %', status;
  end if;
end;
$$;

-- The neighbour sees nothing about the granted organization.
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000252","role":"authenticated","aal":"aal1"}',
  true
);
do $$
declare
  status jsonb;
begin
  status := public.get_integration_preview_status_v1('20000000-0000-4000-8000-000000000251');
  if (status ->> 'enabled')::boolean then
    raise exception 'a neighbouring organization read the grant: %', status;
  end if;
end;
$$;

-- A new turn, now granted: the claim carries the flag and the activation installs the preview run.
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000251","role":"authenticated","aal":"aal1"}',
  true
);
do $$
declare
  project_id uuid;
  message_id constant uuid := '50000000-0000-4000-8000-000000000251';
  assistant_id constant uuid := '40000000-0000-4000-8000-000000000252';
  claim jsonb;
  recorded jsonb;
  replayed jsonb;
  preview_activation jsonb;
  plan_tasks integer;
begin
  select brief_project.capital_project_id into strict project_id
  from public.capital_project_plans brief_project
  join public.capital_projects project on project.id = brief_project.capital_project_id
  where project.organization_id = '20000000-0000-4000-8000-000000000251'
  limit 1;
  perform public.submit_advisor_turn_v1(project_id, message_id, 'pt-BR', 'Pode seguir com a leitura de refinanciamento.');
  claim := public.worker_claim_job(repeat('p', 64), 600);
  if claim ->> 'kind' <> 'agent_operation_brief' or not (claim ->> 'integration_preview')::boolean then
    raise exception 'the granted claim did not carry integration_preview: %', claim;
  end if;
  preview_activation := jsonb_build_object(
    'job', 'integration_preview',
    'composition', 'prepare_meeting',
    'caseId', 'gc01-analista-ib-camil',
    'workflow', jsonb_build_object('id', 'case01.prepare_meeting', 'version', '2026.09.05-v1', 'fingerprint', repeat('a', 64)),
    'brief', jsonb_build_object('sponsorInstruction', 'refinanciamento', 'premises', '{}'::jsonb),
    'plan', jsonb_build_object(
      'schemaVersion', 'capital-project-plan.v1',
      'compilerVersion', 'integration-preview-2026.09.05-v1',
      'registryVersion', '2026.09.01-v3',
      'job', jsonb_build_object('id', 'origination_thesis', 'targetTaskIds', jsonb_build_array('A03'), 'firstWorkProduct', 'preview_meeting_brief', 'confirmationGate', 'preliminary_understanding', 'inputPolicy', '{}'::jsonb),
      'taskSpecs', jsonb_build_array(
        jsonb_build_object('id', 'C05', 'label', 'Mapear dívida econômica', 'graph', 'case', 'dependencies', '[]'::jsonb, 'executionClass', 'deterministic', 'effect', 'propose_state', 'maturity', 'implemented', 'ordinal', 0, 'batch', 0),
        jsonb_build_object('id', 'A03', 'label', 'Planejar a devolutiva', 'graph', 'case', 'dependencies', jsonb_build_array('C05'), 'executionClass', 'compilation', 'effect', 'propose_state', 'maturity', 'implemented', 'ordinal', 1, 'batch', 1)
      ),
      'parallelBatches', jsonb_build_array(jsonb_build_array('C05'), jsonb_build_array('A03'))
    )
  );
  recorded := public.worker_record_agent_response_and_activate_v3(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token', assistant_id,
    jsonb_build_object('state', 'idle', 'reply', 'Validação interna: vou rodar os métodos do Caso 01 neste projeto.'),
    null, preview_activation
  );
  if recorded #>> '{activation,analysis_scope}' <> 'integration_preview'
    or recorded #>> '{activation,composition}' <> 'prepare_meeting'
    or coalesce(recorded #>> '{activation,job_id}', '') = '' then
    raise exception 'the preview activation did not persist one run: %', recorded;
  end if;
  select count(*) into plan_tasks
  from public.capital_project_plan_tasks task
  join public.capital_project_plans plan on plan.id = task.plan_id
  where plan.id = (recorded #>> '{activation,plan_id}')::uuid and plan.status = 'active'
    and task.maturity_at_compile = 'implemented';
  if plan_tasks <> 2 then
    raise exception 'the preview plan did not replace the active plan with its two implemented tasks: %', plan_tasks;
  end if;
  replayed := public.worker_record_agent_response_and_activate_v3(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token', assistant_id,
    jsonb_build_object('state', 'idle', 'reply', 'Replay.'),
    null, preview_activation
  );
  if replayed #>> '{activation,replayed}' <> 'true'
    or replayed #>> '{activation,job_id}' <> recorded #>> '{activation,job_id}' then
    raise exception 'the preview activation replay duplicated the run: %', replayed;
  end if;
  perform public.worker_complete_job(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token',
    jsonb_build_object('activation', recorded -> 'activation')
  );
end;
$$;

-- The worker runs the preview job: one task, one preview artifact, one completion message.
do $$
declare
  claim jsonb;
  context jsonb;
  task_run_id uuid;
  artifact jsonb;
  completed jsonb;
  completion_id constant uuid := '60000000-0000-4000-8000-000000000251';
  conversation_state text;
begin
  claim := public.worker_claim_job(repeat('p', 64), 600);
  if claim ->> 'kind' <> 'capital_project_analysis'
    or claim #>> '{payload,analysis_scope}' <> 'integration_preview'
    or claim #>> '{payload,preview,composition}' <> 'prepare_meeting'
    or not (claim ->> 'integration_preview')::boolean then
    raise exception 'the preview run was not claimed as such: %', claim;
  end if;
  context := public.worker_load_capital_project_context_v6((claim ->> 'job_id')::uuid, claim ->> 'capability_token');
  if jsonb_array_length(context -> 'tasks') <> 2 or context ->> 'mode' <> 'integration_preview' then
    raise exception 'the preview context did not carry the preview plan tasks: %', context -> 'tasks';
  end if;
  task_run_id := public.worker_start_capital_project_task(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token', 'C05',
    'integration-preview.build-debt-ledger', '2026.09.05-v15', repeat('1', 64), '{}'::jsonb
  );
  artifact := public.worker_record_capital_project_artifact(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token', task_run_id,
    'preview_debt_ledger', 'method.build-debt-ledger.v15', 'draft', repeat('1', 64),
    jsonb_build_object('preview', jsonb_build_object('mode', 'integration_preview', 'methodMaturity', 'implemented'), 'gross_debt', '5670186'),
    '[]'::jsonb, '[]'::jsonb
  );
  perform public.worker_finish_capital_project_task(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token', task_run_id, 'succeeded',
    jsonb_build_object('type', 'capital_project_artifact', 'id', artifact ->> 'id'),
    artifact ->> 'artifact_fingerprint',
    '[{"id":"bounded_output","passed":true,"detail":"Bounded typed artifact persisted."}]'::jsonb, '{}'::jsonb, null
  );
  context := public.worker_load_capital_project_context_v6((claim ->> 'job_id')::uuid, claim ->> 'capability_token');
  if jsonb_array_length(context -> 'prior_artifacts') <> 1 or context #>> '{prior_artifacts,0,task_id}' <> 'C05' then
    raise exception 'the preview context did not carry the artifact just produced: %', context -> 'prior_artifacts';
  end if;
  completed := public.worker_complete_integration_preview_run_v1(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token', completion_id,
    (artifact ->> 'id')::uuid, artifact ->> 'artifact_fingerprint',
    '[Validação interna, integration_preview] Dívida bruta de 5.670.186 (R$ mil) na base congelada do Caso 01.',
    jsonb_build_object('artifact_fingerprint', artifact ->> 'artifact_fingerprint')
  );
  if completed ->> 'analysis_scope' <> 'integration_preview' or (completed ->> 'replayed')::boolean then
    raise exception 'the preview completion did not finish the run: %', completed;
  end if;
  if not exists (
    select 1 from public.agent_messages message
    where message.id = completion_id
      and message.metadata ->> 'mode' = 'integration_preview'
      and message.metadata ->> 'kind' = 'advisor_specialized_completion'
      and message.metadata #>> '{artifact,id}' = artifact ->> 'id'
  ) then
    raise exception 'the preview completion message is not tagged as integration_preview';
  end if;
  select conversation.state into conversation_state
  from public.agent_conversations conversation
  join public.agent_messages message on message.conversation_id = conversation.id
  where message.id = completion_id;
  if conversation_state <> 'idle' then
    raise exception 'the conversation did not return to idle after the preview completion: %', conversation_state;
  end if;
  -- The job is finished in the same transaction as the message.
  if (select job.status from public.processing_jobs job where job.id = (claim ->> 'job_id')::uuid) <> 'succeeded' then
    raise exception 'the preview job did not finish with its completion';
  end if;
end;
$$;

reset role;

-- The grant never reaches the Data API: anon and authenticated cannot read the table.
do $$
declare
  can_read boolean;
begin
  select has_table_privilege('authenticated', 'private.integration_preview_grants', 'select') into can_read;
  if can_read then raise exception 'authenticated can read integration_preview_grants'; end if;
  select has_table_privilege('anon', 'private.integration_preview_grants', 'select') into can_read;
  if can_read then raise exception 'anon can read integration_preview_grants'; end if;
end;
$$;

rollback;
