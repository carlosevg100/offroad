-- The agentic DCM work layer is private by construction: every table is tenant-scoped,
-- forced through RLS and read-only to authenticated browser clients.

begin;

do $$
declare
  table_name text;
  table_names constant text[] := array[
    'capital_project_agent_plans',
    'capital_project_agent_work_items',
    'capital_project_decisions',
    'capital_project_requirement_coverage',
    'capital_project_information_requests',
    'capital_project_agent_events'
  ];
begin
  foreach table_name in array table_names loop
    if not exists (
      select 1
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relrowsecurity
        and relation.relforcerowsecurity
    ) then
      raise exception '% must enable and force RLS', table_name;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = table_name
        and policy.cmd = 'SELECT'
        and 'authenticated' = any(policy.roles)
    ) then
      raise exception '% must expose one authenticated SELECT policy', table_name;
    end if;

    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') then
      raise exception '% exposes an unsafe browser privilege', table_name;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'capital_project_agent_plans_one_active_idx'
      and indexdef ilike '%where (status = ''active''%'
  ) then
    raise exception 'agent plan active-version invariant is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class relation on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'capital_project_agent_work_items'
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) ilike '%effect%external%approval_required%'
  ) then
    raise exception 'external work approval invariant is missing';
  end if;

  if to_regprocedure('public.worker_record_agent_plan_v1(uuid,text,jsonb)') is null
    or has_function_privilege('anon', 'public.worker_record_agent_plan_v1(uuid,text,jsonb)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.worker_record_agent_plan_v1(uuid,text,jsonb)', 'EXECUTE') then
    raise exception 'agent-plan worker command has unsafe or incomplete privileges';
  end if;

  if to_regprocedure('public.worker_load_agent_plan_context_v1(uuid,text)') is null
    or has_function_privilege('anon', 'public.worker_load_agent_plan_context_v1(uuid,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.worker_load_agent_plan_context_v1(uuid,text)', 'EXECUTE') then
    raise exception 'agent-plan context loader has unsafe or incomplete privileges';
  end if;

  if to_regprocedure('public.worker_record_agent_stage_event_v1(uuid,text,text,text,jsonb)') is null
    or has_function_privilege('anon', 'public.worker_record_agent_stage_event_v1(uuid,text,text,text,jsonb)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.worker_record_agent_stage_event_v1(uuid,text,text,text,jsonb)', 'EXECUTE') then
    raise exception 'agent-stage event command has unsafe or incomplete privileges';
  end if;

  if to_regprocedure('public.worker_record_agent_assessment_v1(uuid,text,jsonb)') is null
    or has_function_privilege('anon', 'public.worker_record_agent_assessment_v1(uuid,text,jsonb)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.worker_record_agent_assessment_v1(uuid,text,jsonb)', 'EXECUTE') then
    raise exception 'agent-assessment command has unsafe or incomplete privileges';
  end if;

  if to_regprocedure('public.worker_sync_project_information_requests_v1(uuid,text,jsonb)') is null
    or has_function_privilege('anon', 'public.worker_sync_project_information_requests_v1(uuid,text,jsonb)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.worker_sync_project_information_requests_v1(uuid,text,jsonb)', 'EXECUTE') then
    raise exception 'project information-request projection has unsafe or incomplete privileges';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'capital_project_decisions_assessment_ref_idx'
      and indexdef ilike '%assessment_ref%where (assessment_ref is not null)%'
  ) then
    raise exception 'agent decision assessment idempotency invariant is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_class relation on relation.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'capital_project_decisions'
      and trigger_row.tgname = 'capital_project_decisions_attribute_actor'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'agent decision actor attribution invariant is missing';
  end if;
end;
$$;

-- Exercise the complete worker command, including actor attribution, replay idempotency and the
-- three-question guard. The transaction is rolled back below.
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  '10000000-0000-4000-8000-000000000393', 'authenticated', 'authenticated',
  'agent-work-system-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), false, false
);
insert into public.organizations (id, organization_type, name, created_by) values (
  '20000000-0000-4000-8000-000000000393', 'originator', 'Agent Work System Test',
  '10000000-0000-4000-8000-000000000393'
);
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values (
  '20000000-0000-4000-8000-000000000393', '10000000-0000-4000-8000-000000000393',
  'owner', 'active', now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000393","role":"authenticated","aal":"aal1"}',
  true
);

create temporary table agent_work_system_ids (
  session_id uuid, project_id uuid, base_plan_id uuid, agent_plan_id uuid, run_id uuid, job_id uuid
);

do $$
declare
  session_id uuid;
  project_id uuid;
  base_plan_id uuid;
  agent_plan_id constant uuid := '30000000-0000-4000-8000-000000000393';
  run_id constant uuid := '40000000-0000-4000-8000-000000000393';
  job_id constant uuid := '50000000-0000-4000-8000-000000000393';
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
  session_id := public.start_public_capital_project_v2(
    'pt-BR', 'Projeto Teste do Deal Captain', 'company_debt_view',
    'Companhia Teste S.A.', '', plan
  );
  select session.capital_project_id into project_id
  from public.document_intake_sessions session where session.id = session_id;
  select capital_plan.id into base_plan_id
  from public.capital_project_plans capital_plan
  where capital_plan.capital_project_id = project_id and capital_plan.status = 'active';
  insert into agent_work_system_ids values (
    session_id, project_id, base_plan_id, agent_plan_id, run_id, job_id
  );
end;
$$;

reset role;
do $$
declare ids agent_work_system_ids%rowtype;
begin
  select * into ids from agent_work_system_ids;
  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    ids.run_id, '20000000-0000-4000-8000-000000000393', ids.session_id, 1,
    'manual', 'running', 'agent-work-system-test-v1', '{}', '{}',
    '10000000-0000-4000-8000-000000000393'
  );
  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, status,
    payload, lease_expires_at, capability_sha256
  ) values (
    ids.job_id, '20000000-0000-4000-8000-000000000393', ids.run_id, ids.session_id,
    'capital_project_analysis', 'leased', '{}', now() + interval '10 minutes',
    extensions.digest(repeat('c', 64), 'sha256')
  );
  insert into public.capital_project_agent_plans (
    id, organization_id, capital_project_id, base_plan_id, revision, status, goal,
    trigger_type, trigger_ref, schema_version, snapshot, plan_fingerprint, created_by
  ) values (
    ids.agent_plan_id, '20000000-0000-4000-8000-000000000393', ids.project_id,
    ids.base_plan_id, 1, 'active', 'Analisar a estrutura de capital da companhia.',
    'project_created', ids.project_id::text, 'dcm-agent-plan.v1', '{}', repeat('a', 64),
    '10000000-0000-4000-8000-000000000393'
  );
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000393","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  ids agent_work_system_ids%rowtype;
  assessment jsonb;
  recorded jsonb;
  replayed jsonb;
  rejected boolean := false;
begin
  select * into ids from agent_work_system_ids;
  assessment := jsonb_build_object(
    'schemaVersion', 'dcm-agent-assessment.v1',
    'projectId', ids.project_id,
    'assessmentRef', 'processing_run:' || ids.run_id,
    'coverage', jsonb_build_array(jsonb_build_object(
      'schemaVersion', 'dcm-requirement-coverage.v1',
      'id', '60000000-0000-4000-8000-000000000393',
      'projectId', ids.project_id,
      'requirementKey', 'debt.current_schedule',
      'label', 'Cronograma atual da dívida',
      'status', 'verified', 'materiality', 'blocking',
      'decisionIds', '[]'::jsonb,
      'evidence', jsonb_build_array(jsonb_build_object(
        'type', 'public_source', 'id', 'source:test', 'accessBasis', 'public'
      )),
      'missingReason', null,
      'assessedAt', '2026-09-03T12:00:00.000Z',
      'assessedBy', 'debt_and_capital_structure'
    )),
    'requests', jsonb_build_array(jsonb_build_object(
      'schemaVersion', 'dcm-information-request.v1',
      'id', '70000000-0000-4000-8000-000000000393',
      'projectId', ids.project_id,
      'requirementKey', 'debt.contractual_terms',
      'question', 'Quais são os custos, garantias e covenants por instrumento?',
      'whyItMatters', 'Esses termos determinam a flexibilidade real de refinanciamento.',
      'decisionImpact', 'A resposta pode alterar prazo, estrutura e viabilidade da alternativa.',
      'acceptableEvidence', jsonb_build_array('Contratos ou planilha da dívida'),
      'answerKind', 'document', 'choices', '[]'::jsonb,
      'priority', 'blocking', 'informationGain', 1, 'materiality', 1,
      'answerability', 0.9, 'redundancyPenalty', 0, 'status', 'open',
      'createdAt', '2026-09-03T12:00:00.000Z'
    )),
    'decisions', jsonb_build_array(jsonb_build_object(
      'schemaVersion', 'dcm-decision.v1',
      'id', '80000000-0000-4000-8000-000000000393',
      'projectId', ids.project_id,
      'decisionKey', 'capital_strategy.direction',
      'revision', 1, 'status', 'directional',
      'question', 'Qual alternativa deve ser aprofundada?',
      'recommendation', 'Testar alongamento do perfil de amortização.',
      'alternatives', '[]'::jsonb,
      'rationaleSummary', 'A evidência disponível sustenta aprofundar primeiro a extensão de prazo.',
      'evidence', jsonb_build_array(jsonb_build_object(
        'type', 'public_source', 'id', 'source:test', 'accessBasis', 'public'
      )),
      'assumptions', '[]'::jsonb, 'unresolved', jsonb_build_array('Termos contratuais'),
      'confidence', 'medium', 'proposedBy', 'transaction_structuring',
      'reviewedBy', null, 'createdAt', '2026-09-03T12:00:00.000Z',
      'supersedesDecisionId', null, 'fingerprint', repeat('b', 64)
    ))
  );

  recorded := public.worker_record_agent_assessment_v1(ids.job_id, repeat('c', 64), assessment);
  if recorded ->> 'coverage_count' <> '1'
    or recorded ->> 'request_count' <> '1'
    or recorded ->> 'decision_count' <> '1' then
    raise exception 'agent assessment did not persist the complete projection: %', recorded;
  end if;

  replayed := public.worker_record_agent_assessment_v1(ids.job_id, repeat('c', 64), assessment);
  if replayed ->> 'decision_count' <> '0'
    or (select count(*) from public.capital_project_decisions where capital_project_id = ids.project_id) <> 1
    or (select created_by from public.capital_project_decisions where capital_project_id = ids.project_id)
      <> '10000000-0000-4000-8000-000000000393'::uuid
    or (select count(*) from public.capital_project_information_requests where capital_project_id = ids.project_id and status = 'open') <> 1
    or (select count(*) from public.capital_project_agent_events where capital_project_id = ids.project_id) <> 3 then
    raise exception 'agent assessment replay or attribution invariant failed: %', replayed;
  end if;

  begin
    perform public.worker_record_agent_assessment_v1(
      ids.job_id, repeat('c', 64), assessment || jsonb_build_object(
        'assessmentRef', 'too-many-questions',
        'requests', (assessment -> 'requests') || (assessment -> 'requests') ||
          (assessment -> 'requests') || (assessment -> 'requests')
      )
    );
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'agent assessment accepted more than three questions'; end if;
end;
$$;

-- A browser response closes the exact question it displays, becomes a normal queued turn and
-- leaves a content-free audit binding. Replays are safe; stale and forged choices fail closed.
do $$
declare
  ids agent_work_system_ids%rowtype;
  request_row public.capital_project_information_requests;
  first_result jsonb;
  replay_result jsonb;
  rejected boolean;
begin
  select * into ids from agent_work_system_ids;
  select * into strict request_row
  from public.capital_project_information_requests
  where capital_project_id = ids.project_id and status = 'open';

  rejected := false;
  begin
    perform public.submit_advisor_information_response_v1(
      ids.project_id, request_row.id, request_row.updated_at,
      '90000000-0000-4000-8000-000000000392', 'pt-BR', 'choice', 'Opção inventada.'
    );
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'a non-choice request accepted a choice answer'; end if;

  first_result := public.submit_advisor_information_response_v1(
    ids.project_id, request_row.id, request_row.updated_at,
    '90000000-0000-4000-8000-000000000393', 'pt-BR', 'custom',
    'Vou enviar as escrituras e a planilha de dívida atualizada.'
  );
  if (first_result ->> 'replayed')::boolean
    or first_result ->> 'request_status' <> 'answered'
    or first_result ->> 'status' <> 'queued' then
    raise exception 'governed information response did not queue: %', first_result;
  end if;
  if (select status from public.capital_project_information_requests where id = request_row.id) <> 'answered'
    or (select answer_ref ->> 'messageId' from public.capital_project_information_requests where id = request_row.id)
      <> '90000000-0000-4000-8000-000000000393'
    or (select metadata ->> 'kind' from public.agent_messages where id = '90000000-0000-4000-8000-000000000393')
      <> 'information_request_response'
    or (select metadata ->> 'informationRequestId' from public.agent_messages where id = '90000000-0000-4000-8000-000000000393')
      <> request_row.id::text
    or (select count(*) from public.capital_project_agent_events
        where event_type = 'question_answered' and detail ->> 'messageId' = '90000000-0000-4000-8000-000000000393') <> 1 then
    raise exception 'question answer lost its exact request binding';
  end if;
  if exists (
    select 1 from public.capital_project_agent_events
    where event_type = 'question_answered' and detail::text ilike '%escrituras%'
  ) then
    raise exception 'question answer audit event duplicated raw customer content';
  end if;

  replay_result := public.submit_advisor_information_response_v1(
    ids.project_id, request_row.id, request_row.updated_at,
    '90000000-0000-4000-8000-000000000393', 'pt-BR', 'custom',
    'Vou enviar as escrituras e a planilha de dívida atualizada.'
  );
  if not (replay_result ->> 'replayed')::boolean then
    raise exception 'question answer did not replay idempotently: %', replay_result;
  end if;

  rejected := false;
  begin
    perform public.submit_advisor_information_response_v1(
      ids.project_id, request_row.id, request_row.updated_at,
      '90000000-0000-4000-8000-000000000394', 'pt-BR', 'custom', 'Resposta atrasada.'
    );
  exception when serialization_failure then rejected := true;
  end;
  if not rejected then raise exception 'a stale closed question accepted a second answer'; end if;
end;
$$;

-- A compiled project workflow can surface questions without an agent-plan row. Replays update the
-- same open object; after a person answers, a later projection preserves the answer and does not
-- silently reopen the question.
reset role;
update public.capital_project_agent_plans
set status = 'superseded'
where id = '30000000-0000-4000-8000-000000000393';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000393","role":"authenticated","aal":"aal1"}',
  true
);
do $$
declare
  ids agent_work_system_ids%rowtype;
  projection jsonb;
  first_result jsonb;
  replay_result jsonb;
begin
  select * into ids from agent_work_system_ids;
  projection := jsonb_build_object(
    'schemaVersion', 'project-information-request-projection.v1',
    'projectId', ids.project_id,
    'sourceNamespace', 'integration_preview',
    'projectionRef', 'preview_meeting_brief:first',
    'requests', jsonb_build_array(jsonb_build_object(
      'schemaVersion', 'dcm-information-request.v1',
      'id', '71000000-0000-4000-8000-000000000393',
      'projectId', ids.project_id,
      'requirementKey', 'q-angle',
      'question', 'Refinanciamento como foco ou alternativas mais amplas?',
      'whyItMatters', 'Esse ponto define o universo de alternativas que será aprofundado.',
      'decisionImpact', 'A resposta altera o escopo e a forma da próxima entrega.',
      'acceptableEvidence', jsonb_build_array('Orientação nesta conversa'),
      'answerKind', 'choice',
      'choices', jsonb_build_array('Refinanciamento como foco principal', 'Alternativas mais amplas'),
      'priority', 'blocking', 'informationGain', 1, 'materiality', 0.9,
      'answerability', 0.95, 'redundancyPenalty', 0, 'status', 'open'
    ))
  );

  first_result := public.worker_sync_project_information_requests_v1(
    ids.job_id, repeat('c', 64), projection
  );
  replay_result := public.worker_sync_project_information_requests_v1(
    ids.job_id, repeat('c', 64), projection
  );
  if first_result ->> 'open_count' <> '1'
    or replay_result ->> 'open_count' <> '1'
    or (select count(*) from public.capital_project_information_requests
        where capital_project_id = ids.project_id and requirement_key = 'q-angle') <> 1
    or (select count(*) from public.capital_project_agent_events
        where capital_project_id = ids.project_id and event_type = 'question_created'
          and detail ->> 'projection_ref' = 'preview_meeting_brief:first') <> 1 then
    raise exception 'workflow question projection is not idempotent: %, %', first_result, replay_result;
  end if;
end;
$$;

reset role;
update public.capital_project_information_requests
set status = 'answered', answer_ref = jsonb_build_object('test', true)
where id = '71000000-0000-4000-8000-000000000393';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000393","role":"authenticated","aal":"aal1"}',
  true
);
do $$
declare
  ids agent_work_system_ids%rowtype;
  projection jsonb;
  closed_result jsonb;
begin
  select * into ids from agent_work_system_ids;
  projection := jsonb_build_object(
    'schemaVersion', 'project-information-request-projection.v1',
    'projectId', ids.project_id,
    'sourceNamespace', 'integration_preview',
    'projectionRef', 'preview_meeting_brief:second',
    'requests', jsonb_build_array(jsonb_build_object(
      'schemaVersion', 'dcm-information-request.v1',
      'id', '72000000-0000-4000-8000-000000000393',
      'projectId', ids.project_id,
      'requirementKey', 'q-angle',
      'question', 'Refinanciamento como foco ou alternativas mais amplas?',
      'whyItMatters', 'Esse ponto define o universo de alternativas que será aprofundado.',
      'decisionImpact', 'A resposta altera o escopo e a forma da próxima entrega.',
      'acceptableEvidence', jsonb_build_array('Orientação nesta conversa'),
      'answerKind', 'choice',
      'choices', jsonb_build_array('Refinanciamento como foco principal', 'Alternativas mais amplas'),
      'priority', 'blocking', 'informationGain', 1, 'materiality', 0.9,
      'answerability', 0.95, 'redundancyPenalty', 0, 'status', 'open'
    ))
  );

  closed_result := public.worker_sync_project_information_requests_v1(
    ids.job_id, repeat('c', 64), projection
  );
  if closed_result ->> 'open_count' <> '0'
    or closed_result ->> 'preserved_closed_count' <> '1'
    or (select status from public.capital_project_information_requests
        where id = '71000000-0000-4000-8000-000000000393') <> 'answered'
    or (select count(*) from public.capital_project_information_requests
        where capital_project_id = ids.project_id and requirement_key = 'q-angle') <> 1 then
    raise exception 'a later projection reopened answered project context: %', closed_result;
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000394","role":"authenticated","aal":"aal1"}',
  true
);
do $$
declare ids agent_work_system_ids%rowtype; accepted boolean := false;
begin
  select * into ids from agent_work_system_ids;
  begin
    perform public.submit_advisor_information_response_v1(
      ids.project_id, '70000000-0000-4000-8000-000000000393', now(),
      '90000000-0000-4000-8000-000000000395', 'pt-BR', 'custom', 'Cross tenant.'
    );
    accepted := true;
  exception when no_data_found then accepted := false;
  end;
  if accepted then raise exception 'question answer crossed the tenant boundary'; end if;
end;
$$;

reset role;
do $$
begin
  if has_function_privilege('anon', 'public.submit_advisor_information_response_v1(uuid,uuid,timestamptz,uuid,text,text,text)', 'execute')
    or not has_function_privilege('authenticated', 'public.submit_advisor_information_response_v1(uuid,uuid,timestamptz,uuid,text,text,text)', 'execute') then
    raise exception 'question answer command has unsafe grants';
  end if;
end;
$$;

rollback;
