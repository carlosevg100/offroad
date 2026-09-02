-- Fail-closed operating-control plane. Every fixture is rolled back.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  (
    '91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'controls-a@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, now(), now(), false, false
  ),
  (
    '91000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'controls-b@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, now(), now(), false, false
  ),
  (
    '91000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
    'controls-worker@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, now(), now(), false, false
  );

insert into public.organizations (id, organization_type, name, created_by) values
  ('92000000-0000-4000-8000-000000000001', 'company', 'Control Tenant A', '91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002', 'company', 'Control Tenant B', '91000000-0000-4000-8000-000000000002');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 'owner', 'active', now());
insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale) values
  ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'company', 'pt-BR'),
  ('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', 'company', 'pt-BR');
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001', 1, 'manual', 'running', 'controls-test-v1',
  '91000000-0000-4000-8000-000000000001'
);
insert into public.controlled_case_executions (
  id, organization_id, intake_session_id, processing_run_id, mode, status,
  pipeline_version, model_policy_version, input_fingerprint, created_by
) values (
  '94500000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001',
  'primary', 'running', 'controls-test-v1', 'controls-model-v1', repeat('a',64),
  '91000000-0000-4000-8000-000000000001'
);
insert into private.case_execution_inputs (
  organization_id, execution_id, input_json, input_fingerprint
) values (
  '92000000-0000-4000-8000-000000000001', '94500000-0000-4000-8000-000000000001',
  '{"fixture":"frozen"}'::jsonb, repeat('a',64)
);
insert into private.case_execution_results (
  organization_id, execution_id, report, manifest
) values (
  '92000000-0000-4000-8000-000000000001', '94500000-0000-4000-8000-000000000001',
  jsonb_build_object('reportFingerprint', repeat('c',64)),
  jsonb_build_object('manifestFingerprint', repeat('d',64))
);
insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  available_at, controlled_execution_id
) values (
  '95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
  'case_analysis', 'queued',
  '{"analysis_scope":"full_case","execution_mode":"primary","model_budget":{"max_cost_usd":1,"max_calls":4}}'::jsonb,
  '2000-01-01T00:00:00Z', '94500000-0000-4000-8000-000000000001'
);
insert into private.worker_tokens (label, token_sha256)
values ('operating-controls-worker', extensions.digest(repeat('k', 64), 'sha256'));

do $$
begin
  begin
    perform private.record_platform_capability_accreditation_v1(
      'case-analysis:test-v1', 'external_release', 'production', 'production', true,
      jsonb_build_object(
        'procedureVersion', 'MK-27-v1', 'implementationFingerprint', repeat('1', 64),
        'ownerId', 'release-owner', 'goldCasesRequired', 1, 'goldCasesPassed', 1,
        'adversarialCasesRequired', 1, 'adversarialCasesPassed', 1,
        'criticalRegressions', 0, 'openCriticalFindings', 0,
        'realCaseEvidenceSource', 'controlled_execution_ledger',
        'realCaseIds', '["only-one-case"]'::jsonb
      ), '{}'::text[], now(), now() + interval '1 day',
      '91000000-0000-4000-8000-000000000001'
    );
    raise exception 'production accreditation accepted fewer than twenty distinct real cases';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

select private.record_platform_capability_accreditation_v1(
  'case-analysis:2026.08.29-v15', 'recommend', 'tested', 'tested', true,
  jsonb_build_object(
    'procedureVersion', 'HOUSE-v2', 'implementationFingerprint', repeat('2', 64),
    'ownerId', 'case-analysis-owner', 'goldCasesRequired', 4, 'goldCasesPassed', 4,
    'adversarialCasesRequired', 4, 'adversarialCasesPassed', 4,
    'criticalRegressions', 0, 'openCriticalFindings', 0,
    'realCaseEvidenceSource', null, 'realCaseIds', '[]'::jsonb
  ), '{}'::text[], now(), now() + interval '1 day',
  '91000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  claim jsonb;
  job_id uuid;
  capability text;
  blocked jsonb;
  allowed jsonb;
  replay jsonb;
  base_snapshot jsonb;
begin
  claim := public.worker_claim_job(repeat('k', 64), 600);
  job_id := (claim ->> 'job_id')::uuid;
  capability := claim ->> 'capability_token';
  if job_id <> '95000000-0000-4000-8000-000000000001' or capability is null then
    raise exception 'worker did not receive the exact control-plane capability';
  end if;

  base_snapshot := jsonb_build_object(
    'snapshotAt', clock_timestamp(),
    'mandate', jsonb_build_object('status','satisfied','objectiveCaptured',true,'decisionContextCaptured',true),
    'sources', jsonb_build_object('status','satisfied','materialClaims',2,'sourceBoundMaterialClaims',2,'entityPeriodValidMaterialClaims',2,'staleMaterialClaims',0),
    'calculations', jsonb_build_object('status','satisfied','criticalCalculations',2,'deterministicCalculations',2,'reconciledCalculations',2,'unresolvedExceptions',0),
    'coverage', jsonb_build_object('status','satisfied','requiredItems',5,'coveredItems',5,'materialGaps',1,'gapsWithReasonAndNextAction',1),
    'judgment', jsonb_build_object('status','satisfied','maturity','internal_decision_valid','uncertaintyDisclosed',true,'alternativesCompared',true,'downsideTested',true),
    'artifacts', jsonb_build_object('status','not_applicable','generatedArtifacts',0,'consistentArtifacts',0,'staleArtifacts',0,'approvedForExternalUse',false),
    'market', jsonb_build_object('status','not_applicable','applicable',false,'currentMandates',false,'explainableFit',false),
    'security', jsonb_build_object('status','failed','retrievalBounded',true,'tenantIsolationVerified',true,'providerPolicyEnforced',false,'externalToolsAllowlisted',true),
    'authority', jsonb_build_object('status','not_applicable','externalActionRequested',false,'exactAuthorizationCaptured',false,'authorizedTargetsFingerprint',null),
    'freshness', jsonb_build_object('status','satisfied','transitiveInvalidationEnabled',true,'staleDependents',0),
    'economics', jsonb_build_object('status','satisfied','costWithinBudget',true,'manualMinutes',0,'untrackedManualMinutes',0,'repeatedManualRootCauses',0),
    'outcome', jsonb_build_object('status','not_applicable','decisionLinked',false,'outcomeTaxonomyApplied',false)
  );
  blocked := public.worker_record_operating_control_snapshot_v1(
    job_id, capability, 'case-analysis:2026.08.29-v15', 'internal_decision', repeat('a',64),
    jsonb_build_object(
      'caseFingerprint',repeat('b',64),
      'controlledExecutionFingerprint',repeat('c',64),
      'manifestFingerprint',repeat('d',64)
    ), base_snapshot
  );
  if (blocked ->> 'allowed')::boolean
    or not ((blocked -> 'blockers') ? 'security_boundary_not_verified') then
    raise exception 'provider-policy failure did not close the operating gate: %', blocked;
  end if;

  begin
    perform public.worker_record_operating_control_snapshot_v1(
      job_id, repeat('x',64), 'case-analysis:2026.08.29-v15', 'internal_decision', repeat('a',64),
      '{}'::jsonb, base_snapshot
    );
    raise exception 'forged worker capability persisted a control decision';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.worker_record_operating_control_snapshot_v1(
      job_id, capability, 'case-analysis:wrong-version', 'internal_decision', repeat('a',64),
      jsonb_build_object(
        'caseFingerprint',repeat('b',64),
        'controlledExecutionFingerprint',repeat('c',64),
        'manifestFingerprint',repeat('d',64)
      ), base_snapshot
    );
    raise exception 'worker reused a capability accreditation from the wrong implementation';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.worker_record_operating_control_snapshot_v1(
      job_id, capability, 'case-analysis:2026.08.29-v15', 'internal_decision', repeat('f',64),
      jsonb_build_object(
        'caseFingerprint',repeat('b',64),
        'controlledExecutionFingerprint',repeat('c',64),
        'manifestFingerprint',repeat('d',64)
      ), base_snapshot
    );
    raise exception 'worker bound controls to an input other than the frozen execution';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.worker_record_operating_control_snapshot_v1(
      job_id, capability, 'case-analysis:2026.08.29-v15', 'internal_decision', repeat('a',64),
      jsonb_build_object(
        'caseFingerprint',repeat('b',64),
        'controlledExecutionFingerprint',repeat('f',64),
        'manifestFingerprint',repeat('d',64)
      ), base_snapshot
    );
    raise exception 'worker bound controls to a report other than the persisted execution';
  exception when insufficient_privilege then null;
  end;

  allowed := public.worker_record_operating_control_snapshot_v1(
    job_id, capability, 'case-analysis:2026.08.29-v15', 'internal_decision', repeat('a',64),
    jsonb_build_object(
      'caseFingerprint',repeat('b',64),
      'controlledExecutionFingerprint',repeat('c',64),
      'manifestFingerprint',repeat('d',64)
    ),
    jsonb_set(base_snapshot, '{security}',
      jsonb_build_object('status','satisfied','retrievalBounded',true,'tenantIsolationVerified',true,'providerPolicyEnforced',true,'externalToolsAllowlisted',true))
  );
  if not (allowed ->> 'allowed')::boolean or jsonb_array_length(allowed -> 'blockers') <> 0 then
    raise exception 'fully proved internal-decision controls did not pass: %', allowed;
  end if;
  replay := public.worker_record_operating_control_snapshot_v1(
    job_id, capability, 'case-analysis:2026.08.29-v15', 'internal_decision', repeat('a',64),
    jsonb_build_object(
      'caseFingerprint',repeat('b',64),
      'controlledExecutionFingerprint',repeat('c',64),
      'manifestFingerprint',repeat('d',64)
    ),
    jsonb_set(base_snapshot, '{security}',
      jsonb_build_object('status','satisfied','retrievalBounded',true,'tenantIsolationVerified',true,'providerPolicyEnforced',true,'externalToolsAllowlisted',true))
  );
  if not (replay ->> 'replayed')::boolean or replay ->> 'id' <> allowed ->> 'id' then
    raise exception 'identical operating-control decision was not idempotent';
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
do $$
begin
  if (select count(*) from public.operating_control_snapshots) <> 2 then
    raise exception 'tenant A cannot read its immutable operating-control evidence';
  end if;
  begin
    insert into public.operating_control_snapshots (
      organization_id, intake_session_id, processing_job_id, requested_use, scope_id,
      schema_version, input_fingerprint, binding, snapshot, snapshot_fingerprint,
      allowed, blockers, warnings, decision_fingerprint, valid_until
    ) values (
      '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
      '95000000-0000-4000-8000-000000000001', 'internal_decision', 'forged',
      'operating-control-snapshot.v1', repeat('a',64), '{}'::jsonb, '{}'::jsonb,
      repeat('b',64), true, '{}'::text[], '{}'::text[], repeat('c',64), now()+interval '1 hour'
    );
    raise exception 'tenant directly forged an operating-control snapshot';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from private.platform_capability_accreditations;
    raise exception 'tenant read private capability accreditation evidence';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
  true
);
do $$
begin
  if (select count(*) from public.operating_control_snapshots) <> 0 then
    raise exception 'tenant B read tenant A operating-control evidence';
  end if;
  if (select count(*) from public.dependency_invalidation_events) <> 0 then
    raise exception 'tenant B read tenant A invalidation evidence';
  end if;
end;
$$;

set local role postgres;
select pg_sleep(0.01);
insert into public.deal_state_objects (
  organization_id, intake_session_id, object_type, object_version, status,
  input_fingerprint, object_fingerprint, payload, dependencies, created_by_kind
) values (
  '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
  'understanding_snapshot', 1, 'pending_confirmation', repeat('d',64), repeat('e',64),
  '{"readiness":{"state":"ready","blockers":[]}}'::jsonb, '[]'::jsonb, 'worker'
);

do $$
declare current_allowed_count integer;
begin
  if (select count(*) from public.dependency_invalidation_events
      where intake_session_id = '93000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'canonical state change did not persist invalidation evidence';
  end if;
  select count(*) into current_allowed_count
  from public.operating_control_snapshots control
  where control.intake_session_id = '93000000-0000-4000-8000-000000000001'
    and control.allowed
    and not exists (
      select 1 from public.dependency_invalidation_events event
      where event.organization_id = control.organization_id
        and event.intake_session_id = control.intake_session_id
        and event.occurred_at > control.created_at
    );
  if current_allowed_count <> 0 then
    raise exception 'downstream operating decision survived a newer canonical-state change';
  end if;
  begin
    update public.operating_control_snapshots set allowed = false;
    raise exception 'append-only operating-control evidence accepted an update';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.dependency_invalidation_events;
    raise exception 'append-only invalidation evidence accepted a delete';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;

select 'operating_controls_passed' as result;
