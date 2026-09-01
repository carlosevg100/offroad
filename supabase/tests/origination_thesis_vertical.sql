-- Public origination thesis: atomic project memory, frozen plan, capability-scoped worker read,
-- idempotency, and tenant isolation. All fixtures are rolled back.

begin;

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
    request_id, 'pt-BR', 'Ignored on replay', 'Ignored S.A.', '',
    jsonb_build_object('meetingContext', 'This valid-length context must not create a second project.'),
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
insert into private.worker_tokens (label, token_sha256)
values ('origination-thesis-worker-test', extensions.digest(repeat('w', 64), 'sha256'))
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
  claim := public.worker_claim_job(repeat('w', 64), 600);
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

  -- Emulate the governed worker lifecycle for every frozen TaskSpec. The test intentionally
  -- records artifacts through the capability-bound commands, rather than inserting fixtures
  -- directly, so dependency and evidence contracts are exercised before revision is allowed.
  foreach v_task_id in array array['M01','M02','M03','M04','M05','M06','C02','K04','M07']::text[]
  loop
    v_input_fingerprint := encode(
      extensions.digest(convert_to('origination-test:' || v_task_id, 'utf8'), 'sha256'), 'hex'
    );
    v_task_run_id := public.worker_start_capital_project_task(
      (claim ->> 'job_id')::uuid, claim ->> 'capability_token', v_task_id,
      'offroad.origination_thesis', '2026.09.01-v1', v_input_fingerprint,
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

    v_artifact_content := case v_task_id
      when 'C02' then jsonb_build_object(
        'status', 'succeeded',
        'researchRunId', '80000000-0000-4000-8000-000000000201',
        'sources', jsonb_build_array(jsonb_build_object(
          'provider', 'perplexity', 'topic', 'sector', 'title', 'Fonte setorial pública',
          'url', 'https://farol.example/setor', 'snippet', 'Sinal público preservado.',
          'publishedAt', null, 'retrievedAt', '2026-09-01T12:00:00.000Z',
          'contentHash', repeat('d', 64)
        )),
        'failures', jsonb_build_array()
      )
      when 'K04' then jsonb_build_object(
        'status', 'succeeded',
        'researchRunId', '80000000-0000-4000-8000-000000000201',
        'sources', jsonb_build_array(), 'failures', jsonb_build_array()
      )
      else jsonb_build_object('taskId', v_task_id, 'fixture', true)
    end;
    v_artifact := public.worker_record_capital_project_artifact(
      (claim ->> 'job_id')::uuid, claim ->> 'capability_token', v_task_run_id,
      case when v_task_id = 'M07' then 'meeting_brief' else 'origination_' || lower(v_task_id) end,
      'capital-artifact.v1',
      case when v_task_id = 'M07' then 'pending_confirmation' else 'draft' end,
      v_input_fingerprint, v_artifact_content, jsonb_build_array(), v_dependencies
    );
    perform public.worker_finish_capital_project_task(
      (claim ->> 'job_id')::uuid, claim ->> 'capability_token', v_task_run_id,
      'succeeded', jsonb_build_object('type', 'capital_project_artifact', 'id', v_artifact ->> 'id'),
      v_artifact ->> 'artifact_fingerprint',
      jsonb_build_array(jsonb_build_object('id', 'test_contract', 'passed', true)),
      jsonb_build_object(), null
    );
    if v_task_id = 'M07' then
      v_meeting_artifact_id := (v_artifact ->> 'id')::uuid;
      v_meeting_artifact_fingerprint := v_artifact ->> 'artifact_fingerprint';
    end if;
  end loop;

  perform public.worker_complete_job(
    (claim ->> 'job_id')::uuid, claim ->> 'capability_token',
    jsonb_build_object('meeting_brief_artifact_id', v_meeting_artifact_id)
  );

  revision_result := public.request_origination_thesis_revision_v1(
    v_meeting_artifact_id, v_meeting_artifact_fingerprint,
    'Priorizar capital de giro; a hipótese de refinanciamento não reflete a conversa.'
  );
  if revision_result ->> 'replayed' <> 'false'
    or (select status from public.capital_project_artifacts where id = v_meeting_artifact_id) <> 'superseded'
    or (select status from public.capital_project_task_runs where id = v_task_run_id) <> 'invalidated'
    or (select count(*) from public.capital_project_task_runs task_run
        join public.capital_project_plan_tasks plan_task on plan_task.id = task_run.plan_task_id
        where task_run.organization_id = (claim ->> 'organization_id')::uuid
          and plan_task.task_id in ('M06','C02','K04') and task_run.status = 'succeeded') <> 3 then
    raise exception 'incremental revision did not preserve the exact M07-only boundary: %', revision_result;
  end if;

  revision_replay := public.request_origination_thesis_revision_v1(
    v_meeting_artifact_id, v_meeting_artifact_fingerprint,
    'Priorizar capital de giro; a hipótese de refinanciamento não reflete a conversa.'
  );
  if revision_replay ->> 'replayed' <> 'true'
    or revision_replay ->> 'decision_id' <> revision_result ->> 'decision_id'
    or revision_replay ->> 'job_id' <> revision_result ->> 'job_id' then
    raise exception 'incremental revision idempotency failed: %', revision_replay;
  end if;

  revision_claim := public.worker_claim_job(repeat('w', 64), 600);
  if revision_claim ->> 'job_id' <> revision_result ->> 'job_id'
    or revision_claim #>> '{payload,capital_task_ids,0}' <> 'M07'
    or jsonb_array_length(revision_claim #> '{payload,capital_task_ids}') <> 1
    or revision_claim #>> '{payload,model_budget,max_calls}' <> '1'
    or coalesce(revision_claim #>> '{payload,revision_of_artifact_id}', '') <> v_meeting_artifact_id::text then
    raise exception 'worker did not claim the exact revision job: %', revision_claim;
  end if;
  revision_context := public.worker_load_capital_project_context(
    (revision_claim ->> 'job_id')::uuid, revision_claim ->> 'capability_token'
  );
  if revision_context #>> '{revision,of_artifact_id}' <> v_meeting_artifact_id::text
    or revision_context #>> '{revision,correction_note}' <>
      'Priorizar capital de giro; a hipótese de refinanciamento não reflete a conversa.'
    or jsonb_array_length(revision_context -> 'dependency_artifacts') <> 3 then
    raise exception 'revision context did not reuse the governed dependencies: %', revision_context;
  end if;
end;
$$;

rollback;

select 'origination_thesis_vertical_passed' as result;
