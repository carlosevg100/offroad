-- Objective-plan preflights are immutable, tenant-bound and written only through a live job
-- capability. Structural and readiness task sets must remain an exact partition.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000711', 'authenticated', 'authenticated',
   'preflight-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000712', 'authenticated', 'authenticated',
   'preflight-stranger@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000713', 'authenticated', 'authenticated',
   'preflight-worker@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000711', 'originator', 'Preflight Tenant A', '10000000-0000-4000-8000-000000000711'),
  ('20000000-0000-4000-8000-000000000712', 'originator', 'Preflight Tenant B', '10000000-0000-4000-8000-000000000712');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000711', '10000000-0000-4000-8000-000000000711', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000712', '10000000-0000-4000-8000-000000000712', 'owner', 'active', now());

insert into public.capital_projects (id, organization_id, project_name, entry_job, created_by) values (
  '30000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  'Objective Preflight Test', 'capital_planning', '10000000-0000-4000-8000-000000000711'
);
insert into public.document_intake_sessions (
  id, organization_id, capital_project_id, started_by, journey, locale
) values (
  '40000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  '30000000-0000-4000-8000-000000000711', '10000000-0000-4000-8000-000000000711',
  'company', 'pt-BR'
);
insert into public.agent_conversations (
  id, organization_id, intake_session_id, created_by
) values (
  '50000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  '40000000-0000-4000-8000-000000000711', '10000000-0000-4000-8000-000000000711'
);
insert into public.agent_messages (
  id, organization_id, conversation_id, intake_session_id, role, status, content,
  locale, created_by
) values (
  '60000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  '50000000-0000-4000-8000-000000000711', '40000000-0000-4000-8000-000000000711',
  'user', 'processing', 'Compare alternativas de estrutura de capital.', 'pt-BR',
  '10000000-0000-4000-8000-000000000711'
);
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  '40000000-0000-4000-8000-000000000711', 1, 'manual', 'running', 'objective-preflight-test-v1',
  '10000000-0000-4000-8000-000000000711'
);
insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  attempts, lease_expires_at, capability_sha256
) values (
  '80000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  '70000000-0000-4000-8000-000000000711', '40000000-0000-4000-8000-000000000711',
  'agent_operation_brief', 'leased',
  '{"message_id":"60000000-0000-4000-8000-000000000711","locale":"pt-BR"}'::jsonb,
  1, now() + interval '10 minutes', extensions.digest(repeat('r',64), 'sha256')
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000713","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  objective_plan jsonb := jsonb_build_object(
    'schemaVersion','objective-plan.v1','objectiveKind','capital_strategy',
    'structuralIdentity',repeat('a',64),'targetTaskIds',jsonb_build_array('M02'),
    'taskGraph',jsonb_build_object('tasks',jsonb_build_array(jsonb_build_object('id','M02')))
  );
  blocked_preflight jsonb := jsonb_build_object(
    'schemaVersion','objective-plan-readiness.v1','status','blocked','terminalReachable',false,
    'readinessFingerprint',repeat('b',64),'executableTaskIds',jsonb_build_array(),
    'blockedTaskIds',jsonb_build_array('M02'),
    'tasks',jsonb_build_array(jsonb_build_object(
      'taskId','M02','executable',false,'executorKey',null,
      'reasons',jsonb_build_array(jsonb_build_object('code','executor_unbound','detail',null))
    ))
  );
  first_result jsonb;
  replay_result jsonb;
  accepted boolean;
begin
  first_result := public.worker_record_objective_plan_preflight_v1(
    '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan, blocked_preflight
  );
  if first_result ->> 'status' <> 'blocked'
    or (first_result ->> 'terminal_reachable')::boolean
    or (first_result ->> 'replayed')::boolean then
    raise exception 'first objective preflight was not recorded correctly: %', first_result;
  end if;
  replay_result := public.worker_record_objective_plan_preflight_v1(
    '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan, blocked_preflight
  );
  if replay_result ->> 'id' <> first_result ->> 'id'
    or not (replay_result ->> 'replayed')::boolean then
    raise exception 'identical objective preflight did not replay: %', replay_result;
  end if;

  begin
    perform public.worker_record_objective_plan_preflight_v1(
      '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
      jsonb_set(blocked_preflight, '{terminalReachable}', 'true'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'blocked target was allowed to claim a reachable terminal'; end if;

  begin
    perform public.worker_record_objective_plan_preflight_v1(
      '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
      jsonb_set(blocked_preflight, '{executableTaskIds}', '["M02"]'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'overlapping executable and blocked task partition was accepted'; end if;

  begin
    perform public.worker_record_objective_plan_preflight_v1(
      '80000000-0000-4000-8000-000000000711', repeat('x',64), objective_plan, blocked_preflight
    );
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'forged job capability recorded an objective preflight'; end if;

  if (select count(*) from public.capital_project_objective_preflights) <> 0 then
    raise exception 'worker principal gained direct visibility into tenant preflights';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000711","role":"authenticated","aal":"aal1"}', true);

do $$
declare accepted boolean;
begin
  if (select count(*) from public.capital_project_objective_preflights) <> 1 then
    raise exception 'project owner could not read the objective preflight';
  end if;
  begin
    insert into public.capital_project_objective_preflights (
      organization_id, capital_project_id, source_message_id, processing_job_id,
      objective_kind, plan_schema_version, structural_identity, readiness_schema_version,
      readiness_fingerprint, readiness_status, terminal_reachable, objective_plan,
      preflight_decision, created_by
    ) values (
      '20000000-0000-4000-8000-000000000711', '30000000-0000-4000-8000-000000000711',
      '60000000-0000-4000-8000-000000000711', '80000000-0000-4000-8000-000000000711',
      'capital_strategy', 'objective-plan.v1', repeat('c',64), 'objective-plan-readiness.v1',
      repeat('d',64), 'ready', true, '{}'::jsonb, '{}'::jsonb,
      '10000000-0000-4000-8000-000000000711'
    );
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'authenticated client inserted an objective preflight directly'; end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000712","role":"authenticated","aal":"aal1"}', true);
do $$
begin
  if (select count(*) from public.capital_project_objective_preflights) <> 0 then
    raise exception 'tenant B read tenant A objective preflight';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('anon', 'public.capital_project_objective_preflights', 'select')
    or has_table_privilege('authenticated', 'public.capital_project_objective_preflights', 'insert')
    or has_table_privilege('authenticated', 'public.capital_project_objective_preflights', 'update')
    or has_table_privilege('authenticated', 'public.capital_project_objective_preflights', 'delete')
    or has_function_privilege('anon', 'public.worker_record_objective_plan_preflight_v1(uuid,text,jsonb,jsonb)', 'execute') then
    raise exception 'objective preflight grants are wider than the design';
  end if;
end;
$$;

select 'objective_plan_preflight_passed' as result;

rollback;
