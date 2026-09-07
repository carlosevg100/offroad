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
  attempts, lease_expires_at, capability_sha256
) values (
  '80000000-0000-4000-8000-000000000711', '20000000-0000-4000-8000-000000000711',
  '70000000-0000-4000-8000-000000000711', '40000000-0000-4000-8000-000000000711',
  'agent_operation_brief', 'leased',
  '{"message_id":"60000000-0000-4000-8000-000000000712","locale":"pt-BR"}'::jsonb,
  1, now() + interval '10 minutes', extensions.digest(repeat('r',64), 'sha256')
), (
  '80000000-0000-4000-8000-000000000712', '20000000-0000-4000-8000-000000000711',
  '70000000-0000-4000-8000-000000000712', '40000000-0000-4000-8000-000000000711',
  'agent_operation_brief', 'leased',
  '{"message_id":"60000000-0000-4000-8000-000000000711","locale":"pt-BR"}'::jsonb,
  1, now() + interval '10 minutes', extensions.digest(repeat('s',64), 'sha256')
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
  specialization jsonb := jsonb_build_object(
    'schemaVersion','objective-specialization.v1',
    'activationRulesetVersion','dcm-specialization-activation.2026-09-06-v1',
    'fingerprint',repeat('c',64),
    'activations',jsonb_build_array(
      jsonb_build_object('key','objective:refinancing','sources',jsonb_build_array('objective_text'))
    ),
    'explicitPackIds',jsonb_build_array(),
    'selectedPackIds',jsonb_build_array(
      'core.institutional-dcm','objective.refinance-liability-management'
    ),
    'unmatchedActivationKeys',jsonb_build_array(),
    'profile',jsonb_build_object(
      'schemaVersion','dcm-specialization-profile.v1',
      'packIds',jsonb_build_array(
        'core.institutional-dcm','objective.refinance-liability-management'
      ),
      'requirements',jsonb_build_array(jsonb_build_object('key','refi.maturity-wall')),
      'procedureIds',jsonb_build_array('D-03'),
      'calculationIds',jsonb_build_array('financial.maturity_buckets'),
      'qualityGateIds',jsonb_build_array('gate.refi.before-after'),
      'minimumMaturity','implemented',
      'fingerprint',repeat('d',64)
    ),
    'coverageBinding',jsonb_build_object(
      'taskIds',jsonb_build_array('M02'),
      'requirementKeysByTask',jsonb_build_object(
        'M02',jsonb_build_array('refi.maturity-wall')
      ),
      'unmappedRequirementKeys',jsonb_build_array()
    )
  );
  method_binding jsonb := jsonb_build_object(
    'schemaVersion','objective-method-binding.v1',
    'specializationFingerprint',repeat('c',64),
    'methodRegistryHash',repeat('e',64),
    'selectedPackIds',jsonb_build_array(
      'core.institutional-dcm','objective.refinance-liability-management'
    ),
    'baseTargetTaskIds',jsonb_build_array('M02'),
    'specialistTaskIds',jsonb_build_array(),
    'effectiveTargetTaskIds',jsonb_build_array('M02'),
    'bindings',jsonb_build_array(jsonb_build_object(
      'taskId','M02',
      'procedure',jsonb_build_object('id','normalize-objective','version','2026.09.06-v1'),
      'maturity','implemented',
      'requiredPackIds',jsonb_build_array('objective.refinance-liability-management'),
      'bindingPriority',100,
      'executor',jsonb_build_object('module','@offroad/work-plan','exportName','compileObjectiveToPlan'),
      'resultContract','objective-plan.v1',
      'sourcePath','routing/normalize-objective.md',
      'sourceHash',repeat('f',64)
    )),
    'unboundTaskIds',jsonb_build_array(),
    'conflicts',jsonb_build_array(),
    'status','bound',
    'fingerprint',repeat('1',64)
  );
  workflow_selection jsonb := jsonb_build_object(
    'schemaVersion','workflow-recipe-selection.v1',
    'status','selected','reason','selected',
    'recipeId','refinance-liability-management','recipeVersion','2026.09.07-v1',
    'recipeFingerprint',repeat('2',64),'sliceFingerprint',repeat('3',64),
    'outcome','meeting_plan','taskIds',jsonb_build_array('C05','S10'),
    'parallelBatches',jsonb_build_array(jsonb_build_array('C05'),jsonb_build_array('S10')),
    'activatedEconomicPacks',jsonb_build_array('objective.refinance-liability-management'),
    'fingerprint',repeat('4',64)
  );
  dispatch_candidate jsonb := jsonb_build_object(
    'schemaVersion','universal-dispatch-candidate.v1','mode','internal_shadow',
    'status','blocked','objectiveStructuralIdentity',repeat('a',64),
    'readinessFingerprint',repeat('b',64),'specializationFingerprint',repeat('c',64),
    'methodBindingFingerprint',repeat('1',64),'workflowSelectionFingerprint',repeat('4',64),
    'capabilityManifestHash',repeat('5',64),'executorRegistryHash',repeat('6',64),
    'recipeId','refinance-liability-management','recipeVersion','2026.09.07-v1',
    'sliceFingerprint',repeat('3',64),'tasks',jsonb_build_array(),
    'parallelBatches',jsonb_build_array(),
    'reasons',jsonb_build_array(jsonb_build_object(
      'code','preflight_task_blocked','taskId','C05','detail','task_procedure_unbound'
    )),
    'willExecute',false,'externalEffectAllowed',false,'fingerprint',repeat('7',64)
  );
  first_result jsonb;
  replay_result jsonb;
  specialization_result jsonb;
  specialization_replay jsonb;
  method_result jsonb;
  method_replay jsonb;
  workflow_result jsonb;
  workflow_replay jsonb;
  dispatch_result jsonb;
  dispatch_replay jsonb;
  forged_dispatch_candidate jsonb;
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

  specialization_result := public.worker_record_objective_plan_preflight_v2(
    '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
    blocked_preflight, specialization
  );
  if specialization_result ->> 'id' <> first_result ->> 'id'
    or specialization_result ->> 'specialization_fingerprint' <> repeat('c',64)
    or specialization_result ->> 'minimum_maturity' <> 'implemented'
    or (specialization_result ->> 'specialization_replayed')::boolean then
    raise exception 'objective specialization was not recorded correctly: %', specialization_result;
  end if;
  specialization_replay := public.worker_record_objective_plan_preflight_v2(
    '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
    blocked_preflight, specialization
  );
  if specialization_replay ->> 'specialization_id' <> specialization_result ->> 'specialization_id'
    or not (specialization_replay ->> 'specialization_replayed')::boolean then
    raise exception 'identical objective specialization did not replay: %', specialization_replay;
  end if;

  method_result := public.worker_record_objective_plan_preflight_v3(
    '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
    blocked_preflight, specialization, method_binding
  );
  if method_result ->> 'id' <> first_result ->> 'id'
    or method_result ->> 'method_binding_fingerprint' <> repeat('1',64)
    or method_result ->> 'method_binding_status' <> 'bound'
    or (method_result ->> 'method_binding_replayed')::boolean then
    raise exception 'objective method binding was not recorded correctly: %', method_result;
  end if;
  method_replay := public.worker_record_objective_plan_preflight_v3(
    '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
    blocked_preflight, specialization, method_binding
  );
  if method_replay ->> 'method_binding_id' <> method_result ->> 'method_binding_id'
    or not (method_replay ->> 'method_binding_replayed')::boolean then
    raise exception 'identical method binding did not replay: %', method_replay;
  end if;

  workflow_result := public.worker_record_objective_plan_preflight_v4(
    '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
    blocked_preflight, specialization, method_binding, workflow_selection
  );
  if workflow_result ->> 'id' <> first_result ->> 'id'
    or workflow_result ->> 'workflow_selection_fingerprint' <> repeat('4',64)
    or workflow_result ->> 'workflow_selection_status' <> 'selected'
    or workflow_result ->> 'workflow_selection_reason' <> 'selected'
    or (workflow_result ->> 'workflow_selection_replayed')::boolean then
    raise exception 'workflow recipe selection was not recorded correctly: %', workflow_result;
  end if;
  workflow_replay := public.worker_record_objective_plan_preflight_v4(
    '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
    blocked_preflight, specialization, method_binding, workflow_selection
  );
  if workflow_replay ->> 'workflow_selection_id' <> workflow_result ->> 'workflow_selection_id'
    or not (workflow_replay ->> 'workflow_selection_replayed')::boolean then
    raise exception 'identical workflow recipe selection did not replay: %', workflow_replay;
  end if;

  dispatch_result := public.worker_record_objective_plan_preflight_v5(
    '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
    blocked_preflight, specialization, method_binding, workflow_selection, dispatch_candidate
  );
  if dispatch_result ->> 'dispatch_candidate_fingerprint' <> repeat('7',64)
    or dispatch_result ->> 'dispatch_candidate_status' <> 'blocked'
    or (dispatch_result ->> 'dispatch_candidate_replayed')::boolean then
    raise exception 'dispatch candidate was not recorded correctly: %', dispatch_result;
  end if;
  dispatch_replay := public.worker_record_objective_plan_preflight_v5(
    '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
    blocked_preflight, specialization, method_binding, workflow_selection, dispatch_candidate
  );
  if dispatch_replay ->> 'dispatch_candidate_id' <> dispatch_result ->> 'dispatch_candidate_id'
    or not (dispatch_replay ->> 'dispatch_candidate_replayed')::boolean then
    raise exception 'identical dispatch candidate did not replay: %', dispatch_replay;
  end if;

  begin
    perform public.worker_record_objective_plan_preflight_v5(
      '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
      blocked_preflight, specialization, method_binding, workflow_selection,
      jsonb_set(dispatch_candidate, '{readinessFingerprint}', to_jsonb(repeat('8',64)))
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'dispatch candidate detached from persisted readiness was accepted'; end if;

  forged_dispatch_candidate := jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(dispatch_candidate, '{status}', '"candidate"'::jsonb),
        '{tasks}', jsonb_build_array(jsonb_build_object(
          'taskId','C05','executorKey','forged#executor','executorVersion','v1',
          'procedure',jsonb_build_object('id','forged','version','v1'),
          'resultContract','forged.v1'
        ))
      ),
      '{parallelBatches}', '[["C05"]]'::jsonb
    ),
    '{reasons}', '[]'::jsonb
  );
  begin
    perform public.worker_record_objective_plan_preflight_v5(
      '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
      blocked_preflight, specialization, method_binding, workflow_selection,
      forged_dispatch_candidate
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'blocked readiness was allowed to produce a dispatchable candidate'; end if;

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
    perform public.worker_record_objective_plan_preflight_v2(
      '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
      blocked_preflight,
      jsonb_set(specialization, '{selectedPackIds}', '["core.institutional-dcm"]'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'pack list divergent from the compiled profile was accepted'; end if;

  begin
    perform public.worker_record_objective_plan_preflight_v2(
      '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
      blocked_preflight,
      jsonb_set(specialization, '{coverageBinding,taskIds}', '[]'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'coverage binding divergent from the objective graph was accepted'; end if;

  begin
    perform public.worker_record_objective_plan_preflight_v3(
      '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
      blocked_preflight, specialization,
      jsonb_set(method_binding, '{effectiveTargetTaskIds}', '[]'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'method binding divergent from objective targets was accepted'; end if;

  begin
    perform public.worker_record_objective_plan_preflight_v4(
      '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
      blocked_preflight, specialization, method_binding,
      jsonb_set(workflow_selection, '{activatedEconomicPacks}', '[]'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'workflow selection diverging from specialization packs was accepted'; end if;

  begin
    perform public.worker_record_objective_plan_preflight_v4(
      '80000000-0000-4000-8000-000000000711', repeat('r',64), objective_plan,
      blocked_preflight, specialization, method_binding,
      jsonb_set(workflow_selection, '{parallelBatches}', '[["C05"]]'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'workflow selection with an incomplete graph partition was accepted'; end if;

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
  if (select count(*) from public.capital_project_objective_specializations) <> 0 then
    raise exception 'worker principal gained direct visibility into tenant specializations';
  end if;
  if (select count(*) from public.capital_project_objective_method_bindings) <> 0 then
    raise exception 'worker principal gained direct visibility into tenant method bindings';
  end if;
  if (select count(*) from public.capital_project_objective_workflow_selections) <> 0 then
    raise exception 'worker principal gained direct visibility into tenant workflow selections';
  end if;
  if (select count(*) from public.capital_project_objective_dispatch_candidates) <> 0 then
    raise exception 'worker principal gained direct visibility into tenant dispatch candidates';
  end if;
end;
$$;

reset role;

-- The activation boundary accepts only the immutable recipe slice selected for this exact job.
do $$
declare
  activation jsonb := jsonb_build_object(
    'job', 'integration_preview',
    'composition', 'prepare_meeting',
    'workflow', jsonb_build_object(
      'id', 'refinance-liability-management.meeting_plan',
      'version', '2026.09.07-v1',
      'fingerprint', repeat('3',64)
    ),
    'plan', jsonb_build_object(
      'taskSpecs', jsonb_build_array(
        jsonb_build_object('id','C05'), jsonb_build_object('id','S10')
      ),
      'parallelBatches', jsonb_build_array(jsonb_build_array('C05'),jsonb_build_array('S10'))
    )
  );
  validated jsonb;
  accepted boolean;
begin
  validated := private.worker_validate_integration_preview_workflow_selection_v1(
    '80000000-0000-4000-8000-000000000711', repeat('r',64), activation
  );
  if validated ->> 'recipe_id' <> 'refinance-liability-management'
    or validated ->> 'outcome' <> 'meeting_plan'
    or validated ->> 'slice_fingerprint' <> repeat('3',64) then
    raise exception 'the exact persisted workflow selection was not accepted: %', validated;
  end if;

  begin
    perform private.worker_validate_integration_preview_workflow_selection_v1(
      '80000000-0000-4000-8000-000000000711', repeat('r',64),
      jsonb_set(activation, '{workflow,fingerprint}', to_jsonb(repeat('9',64)))
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'an activation with a forged slice fingerprint was accepted'; end if;

  begin
    perform private.worker_validate_integration_preview_workflow_selection_v1(
      '80000000-0000-4000-8000-000000000711', repeat('r',64),
      jsonb_set(activation, '{plan,taskSpecs}', '[{"id":"C05"}]'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'an activation with an incomplete task slice was accepted'; end if;

  begin
    perform private.worker_validate_integration_preview_workflow_selection_v1(
      '80000000-0000-4000-8000-000000000711', repeat('r',64),
      jsonb_set(activation, '{plan,parallelBatches}', '[["C05","S10"]]'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'an activation with different execution batches was accepted'; end if;

  begin
    perform private.worker_validate_integration_preview_workflow_selection_v1(
      '80000000-0000-4000-8000-000000000711', repeat('x',64), activation
    );
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'a forged capability validated a workflow selection'; end if;

  begin
    perform private.worker_validate_integration_preview_workflow_selection_v1(
      '80000000-0000-4000-8000-000000000712', repeat('s',64), activation
    );
    accepted := true;
  exception when no_data_found then accepted := false;
  end;
  if accepted then raise exception 'an activation without a persisted workflow selection was accepted'; end if;

  validated := public.worker_load_latest_objective_workflow_selection_v1(
    '80000000-0000-4000-8000-000000000712', repeat('s',64)
  );
  if validated ->> 'recipeId' <> 'refinance-liability-management'
    or validated ->> 'outcome' <> 'meeting_plan'
    or validated ->> 'fingerprint' <> repeat('4',64) then
    raise exception 'the project continuity anchor did not return the last selected recipe: %', validated;
  end if;

  begin
    perform public.worker_load_latest_objective_workflow_selection_v1(
      '80000000-0000-4000-8000-000000000712', repeat('x',64)
    );
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'a forged capability loaded a workflow continuity anchor'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000711","role":"authenticated","aal":"aal1"}', true);

do $$
declare accepted boolean;
begin
  if (select count(*) from public.capital_project_objective_preflights) <> 1 then
    raise exception 'project owner could not read the objective preflight';
  end if;
  if (select count(*) from public.capital_project_objective_specializations) <> 1 then
    raise exception 'project owner could not read the objective specialization';
  end if;
  if (select count(*) from public.capital_project_objective_method_bindings) <> 1 then
    raise exception 'project owner could not read the objective method binding';
  end if;
  if (select count(*) from public.capital_project_objective_workflow_selections) <> 1 then
    raise exception 'project owner could not read the objective workflow selection';
  end if;
  if (select count(*) from public.capital_project_objective_dispatch_candidates) <> 1 then
    raise exception 'project owner could not read the objective dispatch candidate';
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
  begin
    insert into public.capital_project_objective_specializations (
      organization_id, capital_project_id, objective_preflight_id, source_message_id,
      processing_job_id, schema_version, activation_ruleset_version,
      specialization_fingerprint, profile_fingerprint, minimum_maturity,
      selected_pack_ids, specialization, created_by
    ) select
      organization_id, capital_project_id, id, source_message_id, processing_job_id,
      'objective-specialization.v1', 'dcm-specialization-activation.2026-09-06-v1',
      repeat('e',64), repeat('f',64), 'implemented', array['core.institutional-dcm'],
      '{}'::jsonb, created_by
    from public.capital_project_objective_preflights limit 1;
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'authenticated client inserted an objective specialization directly'; end if;
  begin
    insert into public.capital_project_objective_method_bindings (
      organization_id, capital_project_id, objective_preflight_id, objective_specialization_id,
      source_message_id, processing_job_id, schema_version, binding_fingerprint,
      method_registry_hash, binding_status, selected_pack_ids, method_binding, created_by
    ) select
      preflight.organization_id, preflight.capital_project_id, preflight.id, specialization.id,
      preflight.source_message_id, preflight.processing_job_id, 'objective-method-binding.v1',
      repeat('2',64), repeat('3',64), 'blocked', array['core.institutional-dcm'],
      '{}'::jsonb, preflight.created_by
    from public.capital_project_objective_preflights preflight
    join public.capital_project_objective_specializations specialization
      on specialization.objective_preflight_id = preflight.id limit 1;
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'authenticated client inserted an objective method binding directly'; end if;
  begin
    insert into public.capital_project_objective_workflow_selections (
      organization_id, capital_project_id, objective_preflight_id, objective_specialization_id,
      source_message_id, processing_job_id, schema_version, selection_fingerprint,
      selection_status, selection_reason, parallel_batches, workflow_selection, created_by
    ) select
      preflight.organization_id, preflight.capital_project_id, preflight.id, specialization.id,
      preflight.source_message_id, preflight.processing_job_id, 'workflow-recipe-selection.v1',
      repeat('5',64), 'blocked', 'economic_situation_not_implemented', '[]'::jsonb,
      '{}'::jsonb, preflight.created_by
    from public.capital_project_objective_preflights preflight
    join public.capital_project_objective_specializations specialization
      on specialization.objective_preflight_id = preflight.id limit 1;
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'authenticated client inserted an objective workflow selection directly'; end if;
  begin
    insert into public.capital_project_objective_dispatch_candidates (
      organization_id, capital_project_id, objective_preflight_id,
      objective_method_binding_id, objective_workflow_selection_id,
      source_message_id, processing_job_id, schema_version, mode, candidate_status,
      candidate_fingerprint, readiness_fingerprint, capability_manifest_hash,
      executor_registry_hash, parallel_batches, reasons, dispatch_candidate, created_by
    ) select
      preflight.organization_id, preflight.capital_project_id, preflight.id, binding.id,
      selection.id, preflight.source_message_id, preflight.processing_job_id,
      'universal-dispatch-candidate.v1', 'internal_shadow', 'blocked', repeat('8',64),
      preflight.readiness_fingerprint, repeat('9',64), repeat('a',64), '[]'::jsonb,
      '[{"code":"workflow_not_selected","taskId":null,"detail":null}]'::jsonb,
      '{}'::jsonb, preflight.created_by
    from public.capital_project_objective_preflights preflight
    join public.capital_project_objective_method_bindings binding
      on binding.objective_preflight_id = preflight.id
    join public.capital_project_objective_workflow_selections selection
      on selection.objective_preflight_id = preflight.id limit 1;
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'authenticated client inserted a dispatch candidate directly'; end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000712","role":"authenticated","aal":"aal1"}', true);
do $$
begin
  if (select count(*) from public.capital_project_objective_preflights) <> 0 then
    raise exception 'tenant B read tenant A objective preflight';
  end if;
  if (select count(*) from public.capital_project_objective_specializations) <> 0 then
    raise exception 'tenant B read tenant A objective specialization';
  end if;
  if (select count(*) from public.capital_project_objective_method_bindings) <> 0 then
    raise exception 'tenant B read tenant A objective method binding';
  end if;
  if (select count(*) from public.capital_project_objective_workflow_selections) <> 0 then
    raise exception 'tenant B read tenant A objective workflow selection';
  end if;
  if (select count(*) from public.capital_project_objective_dispatch_candidates) <> 0 then
    raise exception 'tenant B read tenant A dispatch candidate';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('anon', 'public.capital_project_objective_preflights', 'select')
    or has_table_privilege('authenticated', 'public.capital_project_objective_preflights', 'insert')
    or has_table_privilege('authenticated', 'public.capital_project_objective_preflights', 'update')
    or has_table_privilege('authenticated', 'public.capital_project_objective_preflights', 'delete')
    or has_function_privilege('anon', 'public.worker_record_objective_plan_preflight_v1(uuid,text,jsonb,jsonb)', 'execute')
    or has_table_privilege('anon', 'public.capital_project_objective_specializations', 'select')
    or has_table_privilege('authenticated', 'public.capital_project_objective_specializations', 'insert')
    or has_table_privilege('authenticated', 'public.capital_project_objective_specializations', 'update')
    or has_table_privilege('authenticated', 'public.capital_project_objective_specializations', 'delete')
    or has_function_privilege('anon', 'public.worker_record_objective_plan_preflight_v2(uuid,text,jsonb,jsonb,jsonb)', 'execute')
    or has_table_privilege('anon', 'public.capital_project_objective_method_bindings', 'select')
    or has_table_privilege('authenticated', 'public.capital_project_objective_method_bindings', 'insert')
    or has_table_privilege('authenticated', 'public.capital_project_objective_method_bindings', 'update')
    or has_table_privilege('authenticated', 'public.capital_project_objective_method_bindings', 'delete')
    or has_function_privilege('anon', 'public.worker_record_objective_plan_preflight_v3(uuid,text,jsonb,jsonb,jsonb,jsonb)', 'execute')
    or has_table_privilege('anon', 'public.capital_project_objective_workflow_selections', 'select')
    or has_table_privilege('authenticated', 'public.capital_project_objective_workflow_selections', 'insert')
    or has_table_privilege('authenticated', 'public.capital_project_objective_workflow_selections', 'update')
    or has_table_privilege('authenticated', 'public.capital_project_objective_workflow_selections', 'delete')
    or has_function_privilege('anon', 'public.worker_record_objective_plan_preflight_v4(uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb)', 'execute')
    or has_table_privilege('anon', 'public.capital_project_objective_dispatch_candidates', 'select')
    or has_table_privilege('authenticated', 'public.capital_project_objective_dispatch_candidates', 'insert')
    or has_table_privilege('authenticated', 'public.capital_project_objective_dispatch_candidates', 'update')
    or has_table_privilege('authenticated', 'public.capital_project_objective_dispatch_candidates', 'delete')
    or has_function_privilege('anon', 'public.worker_record_objective_plan_preflight_v5(uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 'execute') then
    raise exception 'objective preflight grants are wider than the design';
  end if;
end;
$$;

select 'objective_plan_preflight_passed' as result;

rollback;
