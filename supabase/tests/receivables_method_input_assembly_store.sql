begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000721', 'authenticated', 'authenticated',
   'assembly-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000722', 'authenticated', 'authenticated',
   'assembly-worker@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values (
  '20000000-0000-4000-8000-000000000721', 'originator', 'Assembly Tenant',
  '10000000-0000-4000-8000-000000000721'
);
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values (
  '20000000-0000-4000-8000-000000000721', '10000000-0000-4000-8000-000000000721',
  'owner', 'active', now()
);
insert into public.capital_projects (id, organization_id, project_name, entry_job, created_by) values (
  '30000000-0000-4000-8000-000000000721', '20000000-0000-4000-8000-000000000721',
  'Receivables Assembly Test', 'capital_planning', '10000000-0000-4000-8000-000000000721'
);
insert into public.document_intake_sessions (
  id, organization_id, capital_project_id, started_by, journey, locale
) values (
  '40000000-0000-4000-8000-000000000721', '20000000-0000-4000-8000-000000000721',
  '30000000-0000-4000-8000-000000000721', '10000000-0000-4000-8000-000000000721',
  'company', 'pt-BR'
);
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000721', '20000000-0000-4000-8000-000000000721',
  '40000000-0000-4000-8000-000000000721', 1, 'manual', 'running', 'assembly-test-v1',
  '10000000-0000-4000-8000-000000000721'
);
insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  attempts, lease_expires_at, capability_sha256
) values (
  '80000000-0000-4000-8000-000000000721', '20000000-0000-4000-8000-000000000721',
  '70000000-0000-4000-8000-000000000721', '40000000-0000-4000-8000-000000000721',
  'case_analysis', 'leased', '{"analysis_scope":"full_case"}'::jsonb, 1,
  now() + interval '10 minutes', extensions.digest(repeat('s',64), 'sha256')
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000722","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  assembly jsonb := jsonb_build_object(
    'schemaVersion','2026.09.07-v1',
    'source',jsonb_build_object(
      'universeId','pool-1','datasetHash',repeat('a',64),
      'titleMapping',jsonb_build_array(jsonb_build_object('sourceReceivableId','source-1','methodReceivableId','method-1'))
    ),
    'evidence',jsonb_build_object('cedentAndServicing',jsonb_build_array(jsonb_build_object('sourceClass','provided_document','sourceId','doc-1','anchor','page:1'))),
    'findingResolutions',jsonb_build_array(),
    'input',jsonb_build_object('currency','BRL','case',jsonb_build_object('portfolio',jsonb_build_array(jsonb_build_object('id','method-1'))))
  );
  first_result jsonb;
  replay_result jsonb;
  shadow_result jsonb;
  shadow_replay jsonb;
  loaded jsonb;
  case_input jsonb;
  accepted boolean;
begin
  first_result := public.worker_record_receivables_method_input_assembly_v1(
    '80000000-0000-4000-8000-000000000721', repeat('s',64), assembly
  );
  if (first_result ->> 'replayed')::boolean
    or first_result ->> 'source_dataset_hash' <> repeat('a',64)
    or coalesce(first_result ->> 'assembly_fingerprint','') !~ '^[0-9a-f]{64}$' then
    raise exception 'assembly was not recorded correctly: %', first_result;
  end if;

  replay_result := public.worker_record_receivables_method_input_assembly_v1(
    '80000000-0000-4000-8000-000000000721', repeat('s',64), assembly
  );
  if replay_result ->> 'id' <> first_result ->> 'id'
    or not (replay_result ->> 'replayed')::boolean then
    raise exception 'identical assembly did not replay: %', replay_result;
  end if;

  loaded := public.worker_load_receivables_method_input_assembly_v1(
    '80000000-0000-4000-8000-000000000721', repeat('s',64)
  );
  if loaded -> 'assembly' <> assembly
    or loaded ->> 'assembly_fingerprint' <> first_result ->> 'assembly_fingerprint' then
    raise exception 'assembly load did not preserve exact JSON: %', loaded;
  end if;

  shadow_result := public.worker_record_receivables_specialist_shadow_run_v1(
    '80000000-0000-4000-8000-000000000721', repeat('s',64),
    (first_result ->> 'id')::uuid,
    jsonb_build_object(
      'mode','internal_shadow','taskId','R01',
      'executorKey','@offroad/receivables-analysis#underwriteReceivablesPool',
      'executorVersion','2026.09.06-v1','externalEffectAllowed',false,
      'artifact',jsonb_build_object(
        'artifactType','receivables_pool_underwriting','status','draft',
        'inputFingerprint',repeat('b',64),'outputFingerprint',repeat('c',64),
        'content',jsonb_build_object('decisionBoundary',jsonb_build_object('externalDirectionAllowed',false))
      ),
      'qualityResults',jsonb_build_array(jsonb_build_object('id','source_row_coverage','status','passed','detail','complete'))
    )
  );
  if (shadow_result ->> 'replayed')::boolean
    or shadow_result ->> 'input_fingerprint' <> repeat('b',64)
    or shadow_result ->> 'output_fingerprint' <> repeat('c',64) then
    raise exception 'shadow run was not recorded correctly: %', shadow_result;
  end if;
  shadow_replay := public.worker_record_receivables_specialist_shadow_run_v1(
    '80000000-0000-4000-8000-000000000721', repeat('s',64),
    (first_result ->> 'id')::uuid,
    jsonb_build_object(
      'mode','internal_shadow','taskId','R01',
      'executorKey','@offroad/receivables-analysis#underwriteReceivablesPool',
      'executorVersion','2026.09.06-v1','externalEffectAllowed',false,
      'artifact',jsonb_build_object(
        'artifactType','receivables_pool_underwriting','status','draft',
        'inputFingerprint',repeat('b',64),'outputFingerprint',repeat('c',64),
        'content',jsonb_build_object('decisionBoundary',jsonb_build_object('externalDirectionAllowed',false))
      ),
      'qualityResults',jsonb_build_array(jsonb_build_object('id','source_row_coverage','status','passed','detail','complete'))
    )
  );
  if shadow_replay ->> 'id' <> shadow_result ->> 'id'
    or not (shadow_replay ->> 'replayed')::boolean then
    raise exception 'identical shadow run did not replay: %', shadow_replay;
  end if;

  case_input := public.worker_load_case_input(
    '80000000-0000-4000-8000-000000000721', repeat('s',64)
  );
  if case_input #>> '{receivables_method_input_assembly,source_dataset_hash}' <> repeat('a',64)
    or case_input #>> '{receivables_method_input_assembly,assembly,source,universeId}' <> 'pool-1' then
    raise exception 'assembly was not attached to the capability-scoped case input: %', case_input;
  end if;

  begin
    perform public.worker_load_receivables_method_input_assembly_v1(
      '80000000-0000-4000-8000-000000000721', repeat('x',64)
    );
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'invalid capability loaded a private assembly'; end if;

  begin
    perform public.worker_record_receivables_method_input_assembly_v1(
      '80000000-0000-4000-8000-000000000721', repeat('s',64),
      jsonb_set(assembly, '{source,datasetHash}', '"not-a-hash"'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'invalid assembly contract was accepted'; end if;

  begin
    perform public.worker_record_receivables_specialist_shadow_run_v1(
      '80000000-0000-4000-8000-000000000721', repeat('s',64),
      (first_result ->> 'id')::uuid,
      jsonb_build_object(
        'mode','internal_shadow','taskId','R01',
        'executorKey','@offroad/receivables-analysis#underwriteReceivablesPool',
        'executorVersion','2026.09.06-v1','externalEffectAllowed',true,
        'artifact',jsonb_build_object(
          'artifactType','receivables_pool_underwriting','status','draft',
          'inputFingerprint',repeat('d',64),'outputFingerprint',repeat('e',64)
        ),
        'qualityResults',jsonb_build_array(jsonb_build_object('id','boundary','status','passed'))
      )
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'shadow result with an external effect was accepted'; end if;
end;
$$;

-- Even an organization owner cannot query the exact method payload through the Data API role.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000721","role":"authenticated","aal":"aal1"}', true);
do $$
declare accepted boolean;
begin
  begin
    perform 1 from private.receivables_method_input_assemblies;
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant role read the private method payload directly'; end if;
  begin
    perform 1 from private.receivables_specialist_shadow_runs;
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant role read the private specialist result directly'; end if;
end;
$$;

rollback;
