\ir source_rights_fixture.sql
\ir legacy_workspace_capabilities.sql
\ir execution_approval.sql

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000731', 'authenticated', 'authenticated',
   'supplement-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000732', 'authenticated', 'authenticated',
   'supplement-worker@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values (
  '20000000-0000-4000-8000-000000000731', 'originator', 'Supplement Tenant',
  '10000000-0000-4000-8000-000000000731'
);
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values (
  '20000000-0000-4000-8000-000000000731', '10000000-0000-4000-8000-000000000731',
  'owner', 'active', now()
);
insert into public.capital_projects (id, organization_id, project_name, entry_job, created_by) values (
  '30000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  'Receivables Supplement Test', 'capital_planning', '10000000-0000-4000-8000-000000000731'
);
insert into public.document_intake_sessions (
  id, organization_id, capital_project_id, started_by, journey, locale
) values (
  '10000000-0000-4000-8000-000000000090', '20000000-0000-4000-8000-000000000731',
  '30000000-0000-4000-8000-000000000731', '10000000-0000-4000-8000-000000000731',
  'company', 'pt-BR'
);
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  '10000000-0000-4000-8000-000000000090', 1, 'manual', 'running', 'supplement-store-test-v1',
  '10000000-0000-4000-8000-000000000731'
);
insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  attempts, lease_expires_at, capability_sha256
) values (
  '80000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  '70000000-0000-4000-8000-000000000731', '10000000-0000-4000-8000-000000000090',
  'case_analysis', 'leased', '{"analysis_scope":"full_case"}'::jsonb, 1,
  now() + interval '10 minutes', extensions.digest(repeat('u',64), 'sha256')
);

select pg_temp.fixture_approve_execution('80000000-0000-4000-8000-000000000731',true);

-- Explicit synthetic worker lease identity; the capability is not transferable between accounts.
update public.processing_jobs set leased_account_user_id='10000000-0000-4000-8000-000000000732' where organization_id='20000000-0000-4000-8000-000000000731' and status='leased';

\set r01_fixture `cat packages/testing-fixtures/assets/receivables-preparation/synthetic-complete.json`
create temporary table r01_loader_fixture(input jsonb);
insert into r01_loader_fixture values(:'r01_fixture'::jsonb->'input');
-- Trusted synthetic parser output; only installed on an isolated test transaction.
do $$declare x jsonb; e jsonb; c jsonb; p jsonb; patch uuid;begin
 select input into x from r01_loader_fixture;e:=x#>'{evidence,0}';c:=x->'confirmedScope';
 insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,sha256,processing_status,scan_result,created_by)
 values((e->>'source_document_id')::uuid,'20000000-0000-4000-8000-000000000731',(x->>'sessionId')::uuid,
 '20000000-0000-4000-8000-000000000731/'||(x->>'sessionId')||'/synthetic.xlsx','sala-de-dados.xlsx',e->>'source_sha256','ready','{"verdict":"clean"}',
 '10000000-0000-4000-8000-000000000731');
 insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
 values('20000000-0000-4000-8000-000000000731',(e->>'source_document_id')::uuid,'80000000-0000-4000-8000-000000000731',e->>'source_sha256',0,'sha256:'||repeat('e',64));
 insert into private.receivables_evidence_fragments(organization_id,intake_session_id,source_document_id,document_version,processing_run_id,
 content_kind,schema_version,source_sha256,content_sha256,payload_sha256,codec,uncompressed_bytes,compressed_payload)
 values('20000000-0000-4000-8000-000000000731',(x->>'sessionId')::uuid,(e->>'source_document_id')::uuid,(e->>'document_version')::integer,
 '70000000-0000-4000-8000-000000000731',e->>'content_kind',e->>'schema_version',e->>'source_sha256',e->>'content_sha256',e->>'payload_sha256',e->>'codec',
 (e->>'uncompressed_bytes')::bigint,decode(e->>'payload_base64','base64'));
 update public.document_intake_sessions set result_summary=jsonb_build_object('case_state',jsonb_build_object('receivablesVertical',c)) where id=(x->>'sessionId')::uuid;
 insert into private.receivables_evidence_scopes(id,organization_id,capital_project_id,intake_session_id,command_id,request_fingerprint,fingerprint,scope,confirmed_by,confirmed_at)
 values((c#>>'{scope,id}')::uuid,'20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731',(x->>'sessionId')::uuid,
 gen_random_uuid(),repeat('f',64),c#>>'{scope,fingerprint}',c->'scope','10000000-0000-4000-8000-000000000731',clock_timestamp());
 for p in select y from jsonb_array_elements(x->'history') y loop
  insert into private.receivables_method_supplement_patches(organization_id,capital_project_id,intake_session_id,processing_run_id,processing_job_id,source_dataset_hash,patch_id,patch_fingerprint,patch)
  values('20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731',(x->>'sessionId')::uuid,
  '70000000-0000-4000-8000-000000000731','80000000-0000-4000-8000-000000000731',p#>>'{patch,sourceDatasetHash}',p#>>'{patch,patchId}',
  encode(extensions.digest(convert_to((p->'patch')::text,'UTF8'),'sha256'),'hex'),p->'patch') returning id into patch;
  insert into private.receivables_method_supplement_drafts(organization_id,capital_project_id,intake_session_id,source_dataset_hash,revision,draft_fingerprint,caused_by_patch_id,draft)
  values('20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731',(x->>'sessionId')::uuid,p#>>'{patch,sourceDatasetHash}',
  (p#>>'{resultingDraft,revision}')::integer,encode(extensions.digest(convert_to((p->'resultingDraft')::text,'UTF8'),'sha256'),'hex'),patch,p->'resultingDraft');
 end loop;
end $$;
