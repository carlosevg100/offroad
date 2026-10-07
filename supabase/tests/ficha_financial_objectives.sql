-- Ficha intent persistence does not confer execution or publication authority.
-- Objective-plan preflights are immutable, tenant-bound and written only through a live job
-- capability. Structural and readiness task sets must remain an exact partition.

begin;
-- Modern synthetic lease: no legacy workspace capabilities or fixture trigger.
insert into private.worker_tokens(id,label,token_sha256) values
 ('a3300000-0000-4000-8000-000000000711','Ficha routing test worker',extensions.digest('synthetic-ficha-routing-worker-token','sha256'));

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
), (
  '60000000-0000-4000-8000-000000000712', '20000000-0000-4000-8000-000000000711',
  '50000000-0000-4000-8000-000000000711', '40000000-0000-4000-8000-000000000711',
  'user', 'processing', 'Prepare uma reunião de refinanciamento.', 'pt-BR',
  '10000000-0000-4000-8000-000000000711'
);
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  '40000000-0000-4000-8000-000000000711', 1, 'manual', 'running', 'objective-preflight-test-v1',
  '10000000-0000-4000-8000-000000000711'
), (
  '70000000-0000-4000-8000-000000000712', '20000000-0000-4000-8000-000000000711',
  '40000000-0000-4000-8000-000000000711', 2, 'manual', 'running', 'objective-preflight-test-v1',
  '10000000-0000-4000-8000-000000000711'
);
insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  attempts, leased_by, leased_account_user_id, lease_expires_at, capability_sha256
) values (
  '80000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  '70000000-0000-4000-8000-000000000711', '40000000-0000-4000-8000-000000000711',
  'agent_operation_brief', 'leased',
  '{"message_id":"60000000-0000-4000-8000-000000000712","locale":"pt-BR"}'::jsonb,
  1, 'a3300000-0000-4000-8000-000000000711', '10000000-0000-4000-8000-000000000713', now() + interval '10 minutes', extensions.digest(repeat('r',64), 'sha256')
), (
  '80000000-0000-4000-8000-000000000712', '20000000-0000-4000-8000-000000000711',
  '70000000-0000-4000-8000-000000000712', '40000000-0000-4000-8000-000000000711',
  'agent_operation_brief', 'leased',
  '{"message_id":"60000000-0000-4000-8000-000000000711","locale":"pt-BR"}'::jsonb,
  1, 'a3300000-0000-4000-8000-000000000711', '10000000-0000-4000-8000-000000000713', now() + interval '10 minutes', extensions.digest(repeat('s',64), 'sha256')
);

-- The capability is bound to the explicit synthetic worker account.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000713","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  kind text;
  result jsonb;
  plan jsonb;
  decision jsonb := jsonb_build_object(
    'schemaVersion','objective-plan-readiness.v1','status','blocked','terminalReachable',false,
    'readinessFingerprint',repeat('b',64),'executableTaskIds',jsonb_build_array(),
    'blockedTaskIds',jsonb_build_array('M02'),
    'tasks',jsonb_build_array(jsonb_build_object('taskId','M02','executable',false,'reasons',jsonb_build_array('method_not_promoted')))
  );
begin
  foreach kind in array array['proposal_comparison','relative_debt_cost','debt_capacity',
    'information_organization','market_mapping','monitoring','workspace_management'] loop
    plan := jsonb_build_object('schemaVersion','objective-plan.v1','objectiveKind',kind,
      'structuralIdentity',encode(extensions.digest(kind,'sha256'),'hex'),
      'targetTaskIds',jsonb_build_array('M02'),
      'taskGraph',jsonb_build_object('tasks',jsonb_build_array(jsonb_build_object('id','M02'))));
    result := public.worker_record_objective_plan_preflight_v1(
      '80000000-0000-4000-8000-000000000711',repeat('r',64),plan,decision);
    if result->>'status' <> 'blocked' or (result->>'terminal_reachable')::boolean then
      raise exception 'financial_objective_recording_granted_execution: %',kind;
    end if;
    if not (public.worker_record_objective_plan_preflight_v1(
      '80000000-0000-4000-8000-000000000711',repeat('r',64),plan,decision)->>'replayed')::boolean then
      raise exception 'financial_objective_replay_not_idempotent: %',kind;
    end if;
  end loop;
  begin
    perform public.worker_record_objective_plan_preflight_v1(
      '80000000-0000-4000-8000-000000000711',repeat('r',64),
      jsonb_set(plan,'{objectiveKind}','"unregistered_financial_objective"'),decision);
    raise exception 'unregistered_objective_was_accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'objective_preflight_contract_invalid' then raise; end if;
  end;
  begin
    perform public.worker_record_objective_plan_preflight_v1(
      '80000000-0000-4000-8000-000000000711',repeat('r',64),plan,
      jsonb_set(decision,'{terminalReachable}','true'));
    raise exception 'classifier_could_forge_terminal_readiness';
  exception when invalid_parameter_value then
    if sqlerrm <> 'objective_preflight_outcome_invalid' then raise; end if;
  end;
end;
$$;
reset role;
do $$
begin
  if (select count(*) from public.capital_project_objective_preflights) <> 7 then
    raise exception 'financial_objective_record_count_wrong';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.capital_project_objective_preflights'::regclass)
    or has_table_privilege('anon','public.capital_project_objective_preflights','select')
    or has_table_privilege('authenticated','public.capital_project_objective_preflights','insert') then
    raise exception 'financial_objective_authority_boundary_changed';
  end if;
end;
$$;
select 'ficha_financial_objectives: PASS' as result;
rollback;
