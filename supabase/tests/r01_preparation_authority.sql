begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/execution_approval.sql

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
create function pg_temp.load_r01(subject uuid default '10000000-0000-4000-8000-000000000731') returns jsonb language sql as $$
 select private.r01_preparation_authority_v1('20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000090',subject);
$$;
create function pg_temp.r01_denied(label text,command text) returns void language plpgsql as $$begin
 begin execute command;exception when insufficient_privilege then raise notice 'PASS: %',label;return;end;
 raise exception 'Missing R01 denial: %',label;
end $$;
do $$declare got jsonb;want jsonb;begin
 select input into want from r01_loader_fixture;
 got:=pg_temp.load_r01();
 if got->'input' is distinct from want or got#>>'{authority,datasetHash}' is distinct from want#>>'{currentDraft,sourceDatasetHash}' then
  raise exception 'r01 preparation authority did not match pinned synthetic fixture';
 end if;
 raise notice 'PASS: exact scope hash, verified fragment and contiguous history';
end $$;
select pg_temp.r01_denied('worker account has no human authority',$q$select pg_temp.load_r01('10000000-0000-4000-8000-000000000732')$q$);
select pg_temp.r01_denied('another work cannot borrow this session',$q$select private.r01_preparation_authority_v1('20000000-0000-4000-8000-000000000731',gen_random_uuid(),'10000000-0000-4000-8000-000000000090','10000000-0000-4000-8000-000000000731')$q$);
savepoint changed_scope;
update public.document_intake_sessions set result_summary=jsonb_set(result_summary,'{case_state,receivablesVertical,sourceManifest,fingerprint}',to_jsonb(repeat('a',64))) where id='10000000-0000-4000-8000-000000000090';
select pg_temp.r01_denied('changed manifest denies preparation',$q$select pg_temp.load_r01()$q$);
rollback to changed_scope;
savepoint altered_history;
update private.receivables_method_supplement_drafts set revision=2 where intake_session_id='10000000-0000-4000-8000-000000000090';
select pg_temp.r01_denied('gap in draft revisions denies preparation',$q$select pg_temp.load_r01()$q$);
rollback to altered_history;
savepoint altered_patch;
update private.receivables_method_supplement_patches set patch=jsonb_set(patch,'{sections,accounting,value,allowanceBalance}','"999"') where intake_session_id='10000000-0000-4000-8000-000000000090';
select pg_temp.r01_denied('altered stored patch bytes deny preparation',$q$select pg_temp.load_r01()$q$);
rollback to altered_patch;
savepoint altered_fragment;
update private.receivables_evidence_fragments set compressed_payload=compressed_payload||decode('00','hex') where intake_session_id='10000000-0000-4000-8000-000000000090';
select pg_temp.r01_denied('altered fragment bytes deny preparation',$q$select pg_temp.load_r01()$q$);
rollback to altered_fragment;
savepoint newer_unrelated_dataset;
insert into private.receivables_method_supplement_drafts(organization_id,capital_project_id,intake_session_id,source_dataset_hash,revision,draft_fingerprint,caused_by_patch_id,draft)
select organization_id,capital_project_id,intake_session_id,repeat('0',64),revision,draft_fingerprint,caused_by_patch_id,draft
from private.receivables_method_supplement_drafts where intake_session_id='10000000-0000-4000-8000-000000000090';
do $$begin
 if pg_temp.load_r01()#>>'{authority,datasetHash}' is distinct from '2f825e42d7b1f9ce7f564c55f66ab9ba4822bc6af38586f2c4e42715f4eb5fb8' then raise exception 'unrelated dataset won';end if;
 raise notice 'PASS: newer draft in another dataset cannot replace the selected history';
end $$;
rollback to newer_unrelated_dataset;
savepoint denied_session;
-- Same source is readable through its origin and another binding; only the target
-- session is denied. This isolates the loader's session guard from source-use checks.
update public.sources set origin_resource_id='30000000-0000-4000-8000-000000000731',origin_resource_reference='30000000-0000-4000-8000-000000000731'
where organization_id='20000000-0000-4000-8000-000000000731' and id=(select source_id from public.source_versions where organization_id='20000000-0000-4000-8000-000000000731' and id='10000000-0000-4000-8000-000000000001');
insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
values('20000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000731',
'30000000-0000-4000-8000-000000000731',gen_random_uuid(),'10000000-0000-4000-8000-000000000731');
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000731"}',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000731","role":"authenticated","aal":"aal1"}',true);
select public.set_resource_policy_grant_v1('10000000-0000-4000-8000-000000000090','10000000-0000-4000-8000-000000000731',null,'read','deny');
do $$begin
 if private.evaluate_resource_policy_v1('20000000-0000-4000-8000-000000000731','30000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000731','read','analysis') is not true
 or private.source_use_allowed_v1('20000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000731','read','analysis') is not true then
 raise exception 'session-denial fixture did not isolate the target resource';end if;
end $$;
select pg_temp.r01_denied('session deny overrides work allow and other source binding',$q$select pg_temp.load_r01()$q$);
rollback to denied_session;
savepoint withdrawn_binding;
update public.source_bindings set revoked_at=clock_timestamp(),revoked_by='10000000-0000-4000-8000-000000000731' where source_version_id='10000000-0000-4000-8000-000000000001';
select pg_temp.r01_denied('withdrawn source binding denies preparation',$q$select pg_temp.load_r01()$q$);
rollback to withdrawn_binding;
savepoint scope_pause;
insert into private.receivables_analytical_release_grants(organization_id,enabled,note,granted_by)
values('20000000-0000-4000-8000-000000000731',false,'Synthetic pause','synthetic-test');
select pg_temp.r01_denied('organization pause denies preparation',$q$select pg_temp.load_r01()$q$);
rollback to scope_pause;
savepoint revoked_subject;
update private.principals set revoked_at=clock_timestamp() where organization_id='20000000-0000-4000-8000-000000000731' and user_id='10000000-0000-4000-8000-000000000731';
select pg_temp.r01_denied('revoked subject denies preparation',$q$select pg_temp.load_r01()$q$);
rollback to revoked_subject;
do $$declare f text;begin
 foreach f in array array['private.r01_preparation_authority_v1(uuid,uuid,uuid,uuid)','private.worker_load_receivables_preparation_v1(uuid,text)',
 'private.r01_adopted_value_v1(uuid,uuid,text,uuid,uuid,text,uuid)','private.r01_scope_dataset_hash_v1(jsonb)'] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then
   raise exception 'r01 loader exposes private function: %',f;
  end if;
 end loop;
 raise notice 'PASS: preparation helpers deny every application role';
end $$;
select 'r01_preparation_authority: PASS' result;
rollback;
