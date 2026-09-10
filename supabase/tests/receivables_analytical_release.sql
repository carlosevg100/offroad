-- Released R01 analytical result: the organization that owns the session reads its own
-- calculation; another tenant, a revoked member and a portfolio selection that changed read
-- nothing. Synthetic, rollback-only. No policy, grant or check constraint is relaxed here.
begin;
\ir support/execution_approval.sql

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000731', 'authenticated', 'authenticated',
   'release-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000732', 'authenticated', 'authenticated',
   'release-worker@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000733', 'authenticated', 'authenticated',
   'release-outsider@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000734', 'authenticated', 'authenticated',
   'release-removed@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000731', 'originator', 'Release Tenant', '10000000-0000-4000-8000-000000000731'),
  ('20000000-0000-4000-8000-000000000732', 'originator', 'Other Tenant', '10000000-0000-4000-8000-000000000733');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000731', '10000000-0000-4000-8000-000000000731', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000731', '10000000-0000-4000-8000-000000000734', 'member', 'active', now()),
  ('20000000-0000-4000-8000-000000000732', '10000000-0000-4000-8000-000000000733', 'owner', 'active', now());
insert into public.capital_projects (id, organization_id, project_name, entry_job, created_by) values (
  '30000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  'Receivables Release Test', 'capital_planning', '10000000-0000-4000-8000-000000000731'
);
insert into public.document_intake_sessions (
  id, organization_id, capital_project_id, started_by, journey, locale
) values (
  '40000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  '30000000-0000-4000-8000-000000000731', '10000000-0000-4000-8000-000000000731',
  'company', 'pt-BR'
);
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  '40000000-0000-4000-8000-000000000731', 1, 'manual', 'running', 'release-test-v1',
  '10000000-0000-4000-8000-000000000731'
);
insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  attempts, lease_expires_at, capability_sha256
) values (
  '80000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  '70000000-0000-4000-8000-000000000731', '40000000-0000-4000-8000-000000000731',
  'case_analysis', 'leased', '{"analysis_scope":"full_case"}'::jsonb, 1,
  now() + interval '10 minutes', extensions.digest(repeat('r',64), 'sha256')
);
-- The tape the confirmed selection points at, plus the extracted layer that proves the
-- bytes did not move. Without both, no evidence scope is ever fresh, so no released
-- result could ever read as current.
insert into public.source_documents (
  id, organization_id, intake_session_id, bucket_id, object_path, original_name,
  mime_type, byte_size, sha256, processing_status, document_version, scan_result, created_by
) values (
  '50000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  '40000000-0000-4000-8000-000000000731', 'opportunity-documents',
  '20000000-0000-4000-8000-000000000731/release-tape.xlsx', 'release-tape.xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 4096,
  repeat('4',64), 'ready', 1, jsonb_build_object('verdict','clean'),
  '10000000-0000-4000-8000-000000000731'
);
insert into private.receivables_evidence_fragments (
  organization_id, intake_session_id, source_document_id, document_version, processing_run_id,
  content_kind, schema_version, source_sha256, content_sha256, payload_sha256,
  codec, uncompressed_bytes, compressed_payload
) values (
  '20000000-0000-4000-8000-000000000731', '40000000-0000-4000-8000-000000000731',
  '50000000-0000-4000-8000-000000000731', 1, '70000000-0000-4000-8000-000000000731',
  'document_layer', 'receivables-evidence-fragment.v1',
  repeat('4',64), repeat('2',64), repeat('3',64), 'gzip-json-v1', 2, '\x1f8b'::bytea
);
update public.document_intake_sessions
  set current_run_id = '70000000-0000-4000-8000-000000000731',
      result_summary = jsonb_build_object('case_state', jsonb_build_object('receivablesVertical', jsonb_build_object(
        'sourceManifest', jsonb_build_object('schemaVersion','receivables-evidence-manifest.v1','fingerprint',repeat('9',64),
          'sources',jsonb_build_array(jsonb_build_object(
            'sourceDocumentId','50000000-0000-4000-8000-000000000731','documentVersion',1,
          'sourceSha256',repeat('4',64),'contentSha256',repeat('2',64),
          'contentKind','document_layer','schemaVersion','receivables-evidence-fragment.v1'))),
        'candidates', jsonb_build_array(jsonb_build_object('documentId','50000000-0000-4000-8000-000000000731','sheet','Titles','headerRow',1)),
        'supportSheetCandidates', jsonb_build_array()
      )))
  where id = '40000000-0000-4000-8000-000000000731';
-- The confirmed portfolio selection the released result must be bound to.
insert into private.receivables_evidence_scopes (
  id, organization_id, capital_project_id, intake_session_id, command_id, request_fingerprint,
  fingerprint, scope, confirmed_by, processing_run_id
) values (
  '90000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  '30000000-0000-4000-8000-000000000731', '40000000-0000-4000-8000-000000000731',
  '90000000-0000-4000-8000-000000000741', repeat('7',64), repeat('8',64),
  jsonb_build_object(
    'schemaVersion','receivables-evidence-scope.v2','id','90000000-0000-4000-8000-000000000731',
    'fingerprint',repeat('8',64),'sourceManifestFingerprint',repeat('9',64),
    'primaryTape',jsonb_build_object('documentId','50000000-0000-4000-8000-000000000731','sheet','Titles','headerRow',1),
    'primarySupportSheets',jsonb_build_array(),'complementDocumentIds',jsonb_build_array(),
    'sourceRevisions',jsonb_build_array(jsonb_build_object(
      'sourceDocumentId','50000000-0000-4000-8000-000000000731','documentVersion',1,
      'sourceSha256',repeat('4',64),'contentSha256',repeat('2',64),
      'contentKind','document_layer','schemaVersion','receivables-evidence-fragment.v1')),
    'reportingDate','2026-08-31',
    'confirmedBy','10000000-0000-4000-8000-000000000731','confirmedAt','2026-09-10T12:00:00Z'
  ),
  '10000000-0000-4000-8000-000000000731', '70000000-0000-4000-8000-000000000731'
);

select pg_temp.fixture_approve_execution('80000000-0000-4000-8000-000000000731', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000732","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  assembly jsonb := jsonb_build_object(
    'schemaVersion','2026.09.07-v1',
    'source',jsonb_build_object(
      'universeId','pool-release','datasetHash',repeat('a',64),
      'titleMapping',jsonb_build_array(jsonb_build_object('sourceReceivableId','source-1','methodReceivableId','method-1'))
    ),
    'evidence',jsonb_build_object('cedentAndServicing',jsonb_build_array(jsonb_build_object('sourceClass','provided_document','sourceId','doc-1','anchor','page:1'))),
    'findingResolutions',jsonb_build_array(),
    'input',jsonb_build_object('currency','BRL','case',jsonb_build_object('portfolio',jsonb_build_array(jsonb_build_object('id','method-1'))))
  );
  released jsonb;
  assembly_row jsonb;
  recorded jsonb;
  replayed jsonb;
  accepted boolean;
begin
  assembly_row := public.worker_record_receivables_method_input_assembly_v1(
    '80000000-0000-4000-8000-000000000731', repeat('r',64), assembly
  );
  -- The stored assembly is reachable only through the worker RPC: the tenant role never
  -- reads a private table, so the identifier travels in a transaction-local setting.
  perform set_config('offroad.test_release_assembly_id', assembly_row ->> 'id', true);
  released := jsonb_build_object(
    'mode','analytical_release','taskId','R01',
    'executorKey','@offroad/receivables-analysis#underwriteReceivablesPool',
    'executorVersion','2026.09.06-v1','externalEffectAllowed',false,
    'release',jsonb_build_object(
      'organizationId','20000000-0000-4000-8000-000000000731',
      'procedure',jsonb_build_object('id','underwrite-receivables-pool','version','2026.09.06-v1','maturity','tested'),
      'methodMaturity','tested',
      'allowedUses',jsonb_build_array('internal_validation','customer_work'),
      'maximumEffect','none',
      'confirmedScope',jsonb_build_object('id','90000000-0000-4000-8000-000000000731','fingerprint',repeat('8',64)),
      'sourceDatasetHash',repeat('a',64)
    ),
    'artifact',jsonb_build_object(
      'artifactType','receivables_pool_underwriting','schemaVersion','method.underwrite-receivables-pool.v1',
      'status','released','inputFingerprint',repeat('b',64),'outputFingerprint',repeat('c',64),
      'content',jsonb_build_object('decision_boundary',jsonb_build_object('externalDirectionAllowed',false)),
      'evidenceRefs',jsonb_build_array(jsonb_build_object('section','cedentAndServicing','sourceClass','provided_document','sourceId','doc-1','anchor','page:1'))
    ),
    'qualityResults',jsonb_build_array(jsonb_build_object('id','trace_output_fingerprint_present','status','passed','detail','ok'))
  );

  -- Without the organization concession the release is refused, not degraded.
  begin
    perform public.worker_record_receivables_released_result_v1(
      '80000000-0000-4000-8000-000000000731', repeat('r',64), (assembly_row ->> 'id')::uuid, released
    );
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'released result was accepted without the organization grant'; end if;
end;
$$;

-- Operators write the concession outside the Data API; it never travels in source control.
reset role;
insert into private.receivables_analytical_release_grants (organization_id, granted_by, note)
values ('20000000-0000-4000-8000-000000000731', 'sql-contract-test', 'synthetic rollback-only grant');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000732","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  assembly_row jsonb;
  released jsonb;
  recorded jsonb;
  replayed jsonb;
  accepted boolean;
begin
  assembly_row := jsonb_build_object(
    'id', current_setting('offroad.test_release_assembly_id', true)
  );
  released := jsonb_build_object(
    'mode','analytical_release','taskId','R01',
    'executorKey','@offroad/receivables-analysis#underwriteReceivablesPool',
    'executorVersion','2026.09.06-v1','externalEffectAllowed',false,
    'release',jsonb_build_object(
      'organizationId','20000000-0000-4000-8000-000000000731',
      'procedure',jsonb_build_object('id','underwrite-receivables-pool','version','2026.09.06-v1','maturity','tested'),
      'methodMaturity','tested',
      'allowedUses',jsonb_build_array('internal_validation','customer_work'),
      'maximumEffect','none',
      'confirmedScope',jsonb_build_object('id','90000000-0000-4000-8000-000000000731','fingerprint',repeat('8',64)),
      'sourceDatasetHash',repeat('a',64)
    ),
    'artifact',jsonb_build_object(
      'artifactType','receivables_pool_underwriting','schemaVersion','method.underwrite-receivables-pool.v1',
      'status','released','inputFingerprint',repeat('b',64),'outputFingerprint',repeat('c',64),
      'content',jsonb_build_object('decision_boundary',jsonb_build_object('externalDirectionAllowed',false)),
      'evidenceRefs',jsonb_build_array(jsonb_build_object('section','cedentAndServicing','sourceClass','provided_document','sourceId','doc-1','anchor','page:1'))
    ),
    'qualityResults',jsonb_build_array(jsonb_build_object('id','trace_output_fingerprint_present','status','passed','detail','ok'))
  );

  recorded := public.worker_record_receivables_released_result_v1(
    '80000000-0000-4000-8000-000000000731', repeat('r',64), (assembly_row ->> 'id')::uuid, released
  );
  if (recorded ->> 'replayed')::boolean
    or recorded ->> 'input_fingerprint' <> repeat('b',64)
    or recorded ->> 'output_fingerprint' <> repeat('c',64) then
    raise exception 'released result was not recorded correctly: %', recorded;
  end if;
  replayed := public.worker_record_receivables_released_result_v1(
    '80000000-0000-4000-8000-000000000731', repeat('r',64), (assembly_row ->> 'id')::uuid, released
  );
  if replayed ->> 'id' <> recorded ->> 'id' or not (replayed ->> 'replayed')::boolean then
    raise exception 'identical released result did not replay: %', replayed;
  end if;

  -- A different payload under the same input fingerprint is a conflict, never a silent rewrite.
  begin
    perform public.worker_record_receivables_released_result_v1(
      '80000000-0000-4000-8000-000000000731', repeat('r',64), (assembly_row ->> 'id')::uuid,
      jsonb_set(released, '{artifact,outputFingerprint}', to_jsonb(repeat('d',64)))
    );
    accepted := true;
  exception when unique_violation then accepted := false;
  end;
  if accepted then raise exception 'released result was mutated in place'; end if;

  -- Contract refusals: an external effect, an external use, an unproven rung, a failed check.
  begin
    perform public.worker_record_receivables_released_result_v1(
      '80000000-0000-4000-8000-000000000731', repeat('r',64), (assembly_row ->> 'id')::uuid,
      jsonb_set(released, '{externalEffectAllowed}', 'true'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'released result with an external effect was accepted'; end if;

  begin
    perform public.worker_record_receivables_released_result_v1(
      '80000000-0000-4000-8000-000000000731', repeat('r',64), (assembly_row ->> 'id')::uuid,
      jsonb_set(released, '{release,allowedUses}', '["internal_validation","external_material"]'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'released result carrying an external use was accepted'; end if;

  begin
    perform public.worker_record_receivables_released_result_v1(
      '80000000-0000-4000-8000-000000000731', repeat('r',64), (assembly_row ->> 'id')::uuid,
      jsonb_set(released, '{release,methodMaturity}', '"implemented"'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'released result below the tested rung was accepted'; end if;

  begin
    perform public.worker_record_receivables_released_result_v1(
      '80000000-0000-4000-8000-000000000731', repeat('r',64), (assembly_row ->> 'id')::uuid,
      jsonb_set(released, '{qualityResults}', '[{"id":"trace_output_fingerprint_present","status":"failed","detail":"no"}]'::jsonb)
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'released result with a failed quality check was accepted'; end if;

  -- A dataset or a portfolio selection the organization did not confirm never reaches a result.
  begin
    perform public.worker_record_receivables_released_result_v1(
      '80000000-0000-4000-8000-000000000731', repeat('r',64), (assembly_row ->> 'id')::uuid,
      jsonb_set(jsonb_set(released, '{release,sourceDatasetHash}', to_jsonb(repeat('e',64))),
        '{artifact,inputFingerprint}', to_jsonb(repeat('f',64)))
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'released result for an unconfirmed dataset was accepted'; end if;

  begin
    perform public.worker_record_receivables_released_result_v1(
      '80000000-0000-4000-8000-000000000731', repeat('r',64), (assembly_row ->> 'id')::uuid,
      jsonb_set(jsonb_set(released, '{release,confirmedScope,fingerprint}', to_jsonb(repeat('1',64))),
        '{artifact,inputFingerprint}', to_jsonb(repeat('2',64)))
    );
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'released result for an unconfirmed portfolio selection was accepted'; end if;

  -- Another organization's identity inside the payload is refused by the database, not trusted.
  begin
    perform public.worker_record_receivables_released_result_v1(
      '80000000-0000-4000-8000-000000000731', repeat('r',64), (assembly_row ->> 'id')::uuid,
      jsonb_set(jsonb_set(released, '{release,organizationId}', '"20000000-0000-4000-8000-000000000732"'::jsonb),
        '{artifact,inputFingerprint}', to_jsonb(repeat('3',64)))
    );
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'released result for another organization was accepted'; end if;
end;
$$;

-- The organization that owns the session reads its own current result.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000731","role":"authenticated","aal":"aal1"}', true);
do $$
declare payload jsonb; accepted boolean;
begin
  payload := public.read_receivables_released_result_v1('40000000-0000-4000-8000-000000000731');
  if payload ->> 'state' <> 'current'
    or payload #>> '{result,outputFingerprint}' <> repeat('c',64)
    or payload #>> '{result,methodMaturity}' <> 'tested'
    or payload #>> '{result,evidenceScope,fingerprint}' <> repeat('8',64)
    or payload #>> '{result,sourceDatasetHash}' <> repeat('a',64)
    or payload #>> '{result,release,maximumEffect}' <> 'none' then
    raise exception 'owner did not read the current released result: %', payload;
  end if;
  if payload #> '{result,release,allowedUses}' ? 'external_material'
    or payload #> '{result,release,allowedUses}' ? 'external_action' then
    raise exception 'released result exposed an external use: %', payload;
  end if;
  -- Even the owner cannot reach the stored table through the Data API role.
  begin
    perform 1 from private.receivables_released_results;
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant role read the released result table directly'; end if;
  begin
    perform 1 from private.receivables_analytical_release_grants;
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant role read the grant table directly'; end if;
end;
$$;

-- Another tenant reads nothing, and a member whose access was revoked stops reading.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000733","role":"authenticated","aal":"aal1"}', true);
do $$
declare accepted boolean;
begin
  begin
    perform public.read_receivables_released_result_v1('40000000-0000-4000-8000-000000000731');
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'another tenant read the released result'; end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000734","role":"authenticated","aal":"aal1"}', true);
do $$
declare payload jsonb; accepted boolean;
begin
  payload := public.read_receivables_released_result_v1('40000000-0000-4000-8000-000000000731');
  if payload ->> 'state' <> 'current' then
    raise exception 'active member did not read the released result: %', payload;
  end if;
end;
$$;

reset role;
update public.organization_memberships set status = 'revoked'
  where organization_id = '20000000-0000-4000-8000-000000000731'
    and user_id = '10000000-0000-4000-8000-000000000734';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000734","role":"authenticated","aal":"aal1"}', true);
do $$
declare accepted boolean;
begin
  begin
    perform public.read_receivables_released_result_v1('40000000-0000-4000-8000-000000000731');
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'a revoked member kept reading the released result'; end if;
end;
$$;

-- A portfolio selection confirmed afterwards supersedes the stored result; it is never current.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000731","role":"authenticated","aal":"aal1"}', true);
reset role;
insert into private.receivables_evidence_scopes (
    id, organization_id, capital_project_id, intake_session_id, command_id, request_fingerprint,
    fingerprint, scope, confirmed_by, processing_run_id
  ) values (
    '90000000-0000-4000-8000-000000000732', '20000000-0000-4000-8000-000000000731',
    '30000000-0000-4000-8000-000000000731', '40000000-0000-4000-8000-000000000731',
    '90000000-0000-4000-8000-000000000742', repeat('6',64), repeat('5',64),
    jsonb_build_object(
      'schemaVersion','receivables-evidence-scope.v2','id','90000000-0000-4000-8000-000000000732',
      'fingerprint',repeat('5',64),'sourceManifestFingerprint',repeat('9',64),
      'primaryTape',jsonb_build_object('documentId','50000000-0000-4000-8000-000000000731','sheet','Titles','headerRow',1),
      'primarySupportSheets',jsonb_build_array(),'complementDocumentIds',jsonb_build_array(),
      'sourceRevisions',jsonb_build_array(jsonb_build_object(
        'sourceDocumentId','50000000-0000-4000-8000-000000000731','documentVersion',1,
        'sourceSha256',repeat('4',64),'contentSha256',repeat('2',64),
        'contentKind','document_layer','schemaVersion','receivables-evidence-fragment.v1')),
      'reportingDate','2026-08-31',
      'confirmedBy','10000000-0000-4000-8000-000000000731','confirmedAt','2026-09-10T13:00:00Z'
    ),
  '10000000-0000-4000-8000-000000000731', '70000000-0000-4000-8000-000000000731'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000731","role":"authenticated","aal":"aal1"}', true);
do $$
declare payload jsonb;
begin
  payload := public.read_receivables_released_result_v1('40000000-0000-4000-8000-000000000731');
  if payload ->> 'state' <> 'superseded'
    or payload ->> 'supersededReason' <> 'scope_replaced'
    or payload -> 'result' <> 'null'::jsonb then
    raise exception 'a result computed for a replaced selection stayed current: %', payload;
  end if;
end;
$$;

-- Withdrawing the concession restores exactly today's behaviour: no released reading at all.
reset role;
update private.receivables_analytical_release_grants set enabled = false
  where organization_id = '20000000-0000-4000-8000-000000000731';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000731","role":"authenticated","aal":"aal1"}', true);
do $$
declare payload jsonb;
begin
  payload := public.read_receivables_released_result_v1('40000000-0000-4000-8000-000000000731');
  if payload ->> 'state' <> 'not_granted' or payload -> 'result' <> 'null'::jsonb then
    raise exception 'withdrawing the grant did not close the released reading: %', payload;
  end if;
end;
$$;

rollback;
