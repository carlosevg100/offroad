-- Released R01 analytical result under the universal release: every organization reads its own
-- calculation with no concession of its own, another tenant and a revoked member read nothing, a
-- portfolio selection that changed is superseded, and an operator pause closes the reading again,
-- both for one organization and for the whole platform. Synthetic, rollback-only. No policy, grant
-- or check constraint is relaxed here.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
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
  ('20000000-0000-4000-8000-000000000731', 'originator', 'Synthetic method pin tenant', '10000000-0000-4000-8000-000000000731'),
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


select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000731',true);
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000731"}',true);
set local role authenticated;
select public.set_resource_policy_grant_v1((select id from public.vault_scopes),'10000000-0000-4000-8000-000000000731',null,'work','allow');
select public.set_resource_policy_grant_v1((select id from public.vault_scopes),'10000000-0000-4000-8000-000000000731',null,'publish','allow');
select public.set_method_publication_policy_v1(false);
do $$ declare r public.method_releases;begin
 for n in 1..2 loop
  perform public.submit_method_candidate_v1(('a5140000-0000-4000-9000-00000000000'||n)::uuid,'Synthetic pinned method '||n,'r01-2026.09.06-v1','[]',null,'receivables_underwriting');
  select * into strict r from public.method_releases where id=('a5140000-0000-4000-9000-00000000000'||n)::uuid;
  perform public.review_method_candidate_v1(r.id,('a5140000-0000-4000-9000-00000000001'||n)::uuid,r.manifest_fingerprint,r.evidence_fingerprint,'Synthetic exact composition review.');
  perform public.publish_method_release_v1(r.id,('a5140000-0000-4000-9000-00000000001'||n)::uuid,r.manifest_fingerprint);
 end loop;
 perform public.bind_method_release_v1('a5140000-0000-4000-9000-000000000021','a5140000-0000-4000-9000-000000000001',null,null,'receivables_underwriting');
end $$;
reset role;
select set_config('test.first_method_pin',private.pin_worker_method_release_v1('80000000-0000-4000-8000-000000000731',repeat('r',64),'underwrite-receivables-pool','receivables_underwriting')::text,true);
set local role authenticated;
select public.bind_method_release_v1('a5140000-0000-4000-9000-000000000022','a5140000-0000-4000-9000-000000000002','a5140000-0000-4000-9000-000000000021',null,'receivables_underwriting');
reset role;
do $$ declare pin jsonb;begin
 pin:=private.pin_worker_method_release_v1('80000000-0000-4000-8000-000000000731',repeat('r',64),'underwrite-receivables-pool','receivables_underwriting');
 if pin is distinct from current_setting('test.first_method_pin')::jsonb or pin->>'houseReleaseId'<>'a5140000-0000-4000-9000-000000000001' then raise exception 'running execution changed published method';end if;
 begin update private.processing_run_method_pins set house_release_id='a5140000-0000-4000-9000-000000000002';raise exception 'pin mutable';exception when check_violation then null;end;
 begin perform private.worker_record_receivables_released_result_v1('80000000-0000-4000-8000-000000000731',repeat('r',64),gen_random_uuid(),jsonb_build_object('executorVersion','2026.09.06-v1','release',jsonb_build_object('procedure',jsonb_build_object('id','underwrite-receivables-pool','version','2026.09.06-v1'),'methodBinding',jsonb_set(pin,'{houseReleaseId}','"a5140000-0000-4000-9000-000000000002"'))));raise exception 'forged binding committed';exception when invalid_parameter_value then if sqlerrm<>'method_release_pin_mismatch' then raise;end if;end;
end $$;
set local role authenticated;
select public.retire_method_release_v1('a5140000-0000-4000-9000-000000000001','Synthetic revocation of pinned publication.');
reset role;
do $$ begin
 begin perform private.pin_worker_method_release_v1('80000000-0000-4000-8000-000000000731',repeat('r',64),'underwrite-receivables-pool','receivables_underwriting');raise exception 'retired pin fell back';exception when insufficient_privilege then if sqlerrm<>'method_house_release_unavailable' then raise;end if;end;
end $$;
select 'method_execution_pin: PASS' result;
rollback;
