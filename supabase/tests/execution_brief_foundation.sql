-- Execution Briefs are immutable, tenant-bound, capability-written and exact projections of plans.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000601', 'authenticated', 'authenticated',
   'brief-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000602', 'authenticated', 'authenticated',
   'brief-other@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000603', 'authenticated', 'authenticated',
   'brief-worker@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000601', 'originator', 'Brief Tenant A', '10000000-0000-4000-8000-000000000601'),
  ('20000000-0000-4000-8000-000000000602', 'originator', 'Brief Tenant B', '10000000-0000-4000-8000-000000000602');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000601', '10000000-0000-4000-8000-000000000601', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000602', '10000000-0000-4000-8000-000000000602', 'owner', 'active', now());

insert into public.capital_projects (
  id, organization_id, project_name, entry_job, created_by
) values (
  '30000000-0000-4000-8000-000000000601', '20000000-0000-4000-8000-000000000601',
  'Execution Brief Test', 'capital_planning', '10000000-0000-4000-8000-000000000601'
);
insert into public.capital_project_plans (
  id, organization_id, capital_project_id, plan_version, entry_job, schema_version,
  compiler_version, registry_version, plan_fingerprint, status, confirmation_gate,
  first_work_product, target_task_ids, input_policy, parallel_batches, task_count,
  snapshot, created_by
) values (
  '40000000-0000-4000-8000-000000000601', '20000000-0000-4000-8000-000000000601',
  '30000000-0000-4000-8000-000000000601', 1, 'capital_planning', 'capital-project-plan.v1',
  'brief-test-v1', 'brief-test-v1', repeat('a', 64), 'active', 'structure',
  'alternative_map', array['M03'], '{}'::jsonb,
  '[["M01"],["M02"],["M03"]]'::jsonb, 3, '{}'::jsonb,
  '10000000-0000-4000-8000-000000000601'
);
insert into public.capital_project_plan_tasks (
  organization_id, capital_project_id, plan_id, task_id, ordinal, batch_no, label,
  graph, dependencies, execution_class, effect, maturity_at_compile
) values
  ('20000000-0000-4000-8000-000000000601', '30000000-0000-4000-8000-000000000601', '40000000-0000-4000-8000-000000000601', 'M01', 0, 0, 'Resolver perímetro', 'case', '{}', 'extraction', 'propose_state', 'specified'),
  ('20000000-0000-4000-8000-000000000601', '30000000-0000-4000-8000-000000000601', '40000000-0000-4000-8000-000000000601', 'M02', 1, 1, 'Normalizar objetivo', 'case', '{M01}', 'extraction', 'propose_state', 'specified'),
  ('20000000-0000-4000-8000-000000000601', '30000000-0000-4000-8000-000000000601', '40000000-0000-4000-8000-000000000601', 'M03', 2, 2, 'Registrar restrições', 'case', '{M02}', 'extraction', 'propose_state', 'specified');

insert into public.document_intake_sessions (
  id, organization_id, capital_project_id, started_by, journey, locale
) values (
  '50000000-0000-4000-8000-000000000601', '20000000-0000-4000-8000-000000000601',
  '30000000-0000-4000-8000-000000000601', '10000000-0000-4000-8000-000000000601',
  'company', 'pt-BR'
);
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '60000000-0000-4000-8000-000000000601', '20000000-0000-4000-8000-000000000601',
  '50000000-0000-4000-8000-000000000601', 1, 'manual', 'running', 'execution-brief-test-v1',
  '10000000-0000-4000-8000-000000000601'
);
insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  attempts, lease_expires_at, capability_sha256
) values (
  '70000000-0000-4000-8000-000000000601', '20000000-0000-4000-8000-000000000601',
  '60000000-0000-4000-8000-000000000601', '50000000-0000-4000-8000-000000000601',
  'agent_operation_brief', 'leased',
  '{"message_id":"80000000-0000-4000-8000-000000000601","locale":"pt-BR"}'::jsonb,
  1, now() + interval '10 minutes', extensions.digest(repeat('q',64), 'sha256')
);
insert into public.capital_project_task_runs (
  organization_id, capital_project_id, plan_id, plan_task_id, attempt_no, status,
  trigger_event, started_at, completed_at
)
select
  task.organization_id, task.capital_project_id, task.plan_id, task.id, 1, 'succeeded',
  '{"type":"execution_brief_test"}'::jsonb, now(), now()
from public.capital_project_plan_tasks task
where task.organization_id = '20000000-0000-4000-8000-000000000601'
  and task.plan_id = '40000000-0000-4000-8000-000000000601'
  and task.task_id = 'M01';

do $$
declare
  definition text;
begin
  definition := pg_get_functiondef('private.record_capital_project_plan(uuid,jsonb)'::regprocedure);
  if position('target_ids in (array[''M07'',''C02'',''K04''], array[''M07'',''S11'',''K04''])' in definition) = 0 then
    raise exception 'origination thesis target compatibility contract was not installed';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000603","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  internal_v1 jsonb;
  visible_v1 jsonb;
  internal_v2 jsonb;
  visible_v2 jsonb;
  first_result jsonb;
  replay_result jsonb;
  second_result jsonb;
  first_id uuid;
  accepted boolean;
begin
  internal_v1 := jsonb_build_object(
    'schemaVersion', 'execution-brief.v1', 'planVersion', 'brief-test-v1',
    'fingerprint', repeat('b', 64), 'locale', 'pt-BR',
    'objective', 'Comparar alternativas para uma necessidade de capital',
    'currentContext', jsonb_build_array(), 'proposedDeliverable', 'Mapa comparável de alternativas',
    'workstreams', jsonb_build_array(
      jsonb_build_object('key','scope','label','Fixar necessidade e horizonte','purpose','Delimitar a decisão','sourceTaskIds',jsonb_build_array('M01'),'sources',jsonb_build_array(),'analyses',jsonb_build_array('Perímetro'),'output','Escopo','inclusionReasons',jsonb_build_array('prevents_material_error'),'dependencies',jsonb_build_array()),
      jsonb_build_object('key','analysis','label','Testar capacidade e downside','purpose','Dimensionar folga','sourceTaskIds',jsonb_build_array('M02'),'sources',jsonb_build_array(),'analyses',jsonb_build_array('Capacidade'),'output','Teste','inclusionReasons',jsonb_build_array('tests_hypothesis'),'dependencies',jsonb_build_array('scope')),
      jsonb_build_object('key','delivery','label','Comparar formas de financiar','purpose','Preparar a escolha','sourceTaskIds',jsonb_build_array('M03'),'sources',jsonb_build_array(),'analyses',jsonb_build_array('Alternativas'),'output','Mapa','inclusionReasons',jsonb_build_array('produces_deliverable'),'dependencies',jsonb_build_array('analysis'))
    ),
    'assumptions', jsonb_build_array(), 'checkpoints', jsonb_build_array(),
    'executionMode', 'start_after_display',
    'authority', jsonb_build_object('evidenceRegime','private','executionAuthority','analysis_only','establishedBy','system_policy')
  );
  visible_v1 := jsonb_build_object(
    'schemaVersion','execution-brief.v1','fingerprint',repeat('b',64),'locale','pt-BR',
    'objective','Comparar alternativas para uma necessidade de capital',
    'currentContext',jsonb_build_array(),'proposedDeliverable','Mapa comparável de alternativas',
    'workstreams',jsonb_build_array(
      jsonb_build_object('label','Fixar necessidade e horizonte','purpose','Delimitar a decisão','sources',jsonb_build_array(),'analyses',jsonb_build_array('Perímetro'),'output','Escopo','dependencies',jsonb_build_array()),
      jsonb_build_object('label','Testar capacidade e downside','purpose','Dimensionar folga','sources',jsonb_build_array(),'analyses',jsonb_build_array('Capacidade'),'output','Teste','dependencies',jsonb_build_array('Fixar necessidade e horizonte')),
      jsonb_build_object('label','Comparar formas de financiar','purpose','Preparar a escolha','sources',jsonb_build_array(),'analyses',jsonb_build_array('Alternativas'),'output','Mapa','dependencies',jsonb_build_array('Testar capacidade e downside'))
    ),
    'assumptions',jsonb_build_array(),'checkpoints',jsonb_build_array(),
    'executionMode','start_after_display'
  );
  first_result := public.worker_record_capital_project_execution_brief_v1(
    '70000000-0000-4000-8000-000000000601', repeat('q',64),
    internal_v1, visible_v1
  );
  first_id := (first_result ->> 'id')::uuid;
  if first_result ->> 'version' <> '1' or (first_result ->> 'replayed')::boolean then
    raise exception 'first brief was not version one: %', first_result;
  end if;
  replay_result := public.worker_record_capital_project_execution_brief_v1(
    '70000000-0000-4000-8000-000000000601', repeat('q',64),
    internal_v1, visible_v1
  );
  if replay_result ->> 'id' <> first_id::text or not (replay_result ->> 'replayed')::boolean then
    raise exception 'identical brief did not replay: %', replay_result;
  end if;

  begin
    perform public.worker_record_capital_project_execution_brief_v1(
      '70000000-0000-4000-8000-000000000601', repeat('q',64),
      jsonb_set(internal_v1, '{workstreams,2,sourceTaskIds}', '["NOT_IN_PLAN"]'::jsonb), visible_v1
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'brief with a task outside the plan was accepted'; end if;

  begin
    perform public.worker_record_capital_project_execution_brief_v1(
      '70000000-0000-4000-8000-000000000601', repeat('q',64),
      jsonb_set(internal_v1, '{fingerprint}', to_jsonb(repeat('d',64))),
      jsonb_set(
        jsonb_set(visible_v1, '{fingerprint}', to_jsonb(repeat('d',64))),
        '{workstreams,0,sources}', '[{"label":"Fonte não presente","status":"available","informationClass":"public"}]'::jsonb
      )
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'forged visible source projection was accepted'; end if;

  internal_v2 := jsonb_set(
    jsonb_set(internal_v1, '{fingerprint}', to_jsonb(repeat('c',64))),
    '{assumptions}', '[{"label":"Prazo","value":"60 meses","basis":"Usuário","editable":true}]'::jsonb
  );
  visible_v2 := jsonb_set(
    jsonb_set(visible_v1, '{fingerprint}', to_jsonb(repeat('c',64))),
    '{assumptions}', '[{"label":"Prazo","value":"60 meses","basis":"Usuário","editable":true}]'::jsonb
  );
  begin
    perform public.worker_record_capital_project_execution_brief_v1(
      '70000000-0000-4000-8000-000000000601', repeat('q',64),
      internal_v2, visible_v2, null, '[{"kind":"assumption_added"}]'::jsonb
    );
    accepted := true;
  exception when serialization_failure then accepted := false;
  end;
  if accepted then raise exception 'second brief without the latest parent was accepted'; end if;

  second_result := public.worker_record_capital_project_execution_brief_v1(
    '70000000-0000-4000-8000-000000000601', repeat('q',64),
    internal_v2, visible_v2, first_id, '[{"kind":"assumption_added"}]'::jsonb
  );
  if second_result ->> 'version' <> '2' or (second_result ->> 'replayed')::boolean then
    raise exception 'second brief was not appended: %', second_result;
  end if;
  if (select count(*) from public.capital_project_execution_brief_events) <> 2 then
    raise exception 'presented events did not follow immutable brief versions';
  end if;
  begin
    perform public.worker_record_capital_project_execution_brief_v1(
      '70000000-0000-4000-8000-000000000601', repeat('x',64), internal_v2, visible_v2, first_id
    );
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'forged job capability recorded a brief'; end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000601","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  accepted boolean;
  latest_brief_id uuid;
  progress jsonb;
begin
  if (select count(*) from public.capital_project_execution_briefs) <> 2
    or (select count(*) from public.capital_project_execution_brief_events) <> 2 then
    raise exception 'owner could not read its brief history';
  end if;
  begin
    insert into public.capital_project_execution_brief_events (
      organization_id, capital_project_id, execution_brief_id, event_type, actor_type, actor_user_id
    ) select organization_id, capital_project_id, id, 'accepted', 'user', auth.uid()
      from public.capital_project_execution_briefs limit 1;
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'authenticated client wrote an event directly'; end if;

  select id into latest_brief_id
  from public.capital_project_execution_briefs
  order by brief_version desc
  limit 1;
  progress := public.read_capital_project_execution_brief_progress_v1(latest_brief_id);
  if progress #>> '{workstreams,0,status}' <> 'completed'
    or progress #>> '{workstreams,0,completed}' <> '1'
    or progress #>> '{workstreams,1,status}' <> 'waiting'
    or progress #>> '{workstreams,2,status}' <> 'waiting' then
    raise exception 'workstream progress did not reflect real task runs: %', progress;
  end if;
  if progress::text ~ 'M0[1-3]' or progress::text ~ 'plan_task' then
    raise exception 'workstream progress exposed an internal task binding: %', progress;
  end if;

  begin
    perform internal_snapshot from public.capital_project_execution_briefs limit 1;
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'authenticated client read the internal brief snapshot'; end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000602","role":"authenticated","aal":"aal1"}', true);
do $$
begin
  if (select count(*) from public.capital_project_execution_briefs) <> 0
    or (select count(*) from public.capital_project_execution_brief_events) <> 0 then
    raise exception 'brief history crossed the tenant boundary';
  end if;
end;
$$;

reset role;
do $$
begin
  if has_table_privilege('authenticated', 'public.capital_project_execution_briefs', 'insert')
    or has_table_privilege('authenticated', 'public.capital_project_execution_brief_events', 'insert')
    or has_function_privilege('anon', 'public.worker_record_capital_project_execution_brief_v1(uuid,text,jsonb,jsonb,uuid,jsonb)', 'execute')
    or has_function_privilege('anon', 'public.worker_record_agent_response_and_activate_v4(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 'execute')
    or has_column_privilege('authenticated', 'public.capital_project_execution_briefs', 'internal_snapshot', 'select')
    or not has_column_privilege('authenticated', 'public.capital_project_execution_briefs', 'visible_snapshot', 'select')
    or not has_function_privilege('authenticated', 'public.worker_record_capital_project_execution_brief_v1(uuid,text,jsonb,jsonb,uuid,jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.worker_record_agent_response_and_activate_v4(uuid,text,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.read_capital_project_execution_brief_progress_v1(uuid)', 'execute') then
    raise exception 'Execution Brief grants are wider or narrower than designed';
  end if;
end;
$$;

select 'execution_brief_foundation_passed' as result;

rollback;
