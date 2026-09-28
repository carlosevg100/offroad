\ir legacy_workspace_capabilities.sql
\ir execution_approval.sql

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000871', 'authenticated', 'authenticated',
   'binding-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000872', 'authenticated', 'authenticated',
   'binding-worker@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values (
  '20000000-0000-4000-8000-000000000871', 'originator', 'Binding Tenant',
  '10000000-0000-4000-8000-000000000871'
);
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values (
  '20000000-0000-4000-8000-000000000871', '10000000-0000-4000-8000-000000000871',
  'owner', 'active', now()
);
insert into public.capital_projects (id, organization_id, project_name, entry_job, created_by) values (
  '30000000-0000-4000-8000-000000000871', '20000000-0000-4000-8000-000000000871',
  'Institutional Configuration Test', 'capital_planning', '10000000-0000-4000-8000-000000000871'
);
insert into public.document_intake_sessions (
  id, organization_id, capital_project_id, started_by, journey, locale
) values (
  '40000000-0000-4000-8000-000000000871', '20000000-0000-4000-8000-000000000871',
  '30000000-0000-4000-8000-000000000871', '10000000-0000-4000-8000-000000000871',
  'company', 'pt-BR'
);
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000871', '20000000-0000-4000-8000-000000000871',
  '40000000-0000-4000-8000-000000000871', 1, 'manual', 'running', 'binding-test-v1',
  '10000000-0000-4000-8000-000000000871'
);
insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  attempts, lease_expires_at, capability_sha256
) values (
  '80000000-0000-4000-8000-000000000871', '20000000-0000-4000-8000-000000000871',
  '70000000-0000-4000-8000-000000000871', '40000000-0000-4000-8000-000000000871',
  'case_analysis', 'leased', '{"analysis_scope":"full_case"}'::jsonb, 1,
  now() + interval '10 minutes', extensions.digest(repeat('u',64), 'sha256')
);

\ir institutional_assumption_answer_fixture.sql
select pg_temp.fixture_approve_execution('80000000-0000-4000-8000-000000000871',true);
insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,status,reviewed_at,reviewed_by)
values('20000000-0000-4000-8000-000000000871','30000000-0000-4000-8000-000000000871',1,current_setting('test.institutional_configuration')::jsonb,private.institutional_config_hash(current_setting('test.institutional_configuration')::jsonb),'approved',now(),'10000000-0000-4000-8000-000000000871');
do $$ begin
 if private.institutional_response_value('7.123456789012345678901234567890123456789','{"locale":"en-US","unit":"percent"}'::jsonb,'{}'::jsonb) is distinct from '0.07123456789012345678901234567890123456789' then raise exception 'exact percent normalization lost precision';end if;
 if private.institutional_config_hash(current_setting('test.institutional_configuration')::jsonb) is distinct from current_setting('test.institutional_application')::jsonb->>'expectedConfigurationFingerprint' then raise exception 'JS/Postgres hash mismatch'; end if;
 if private.institutional_config_hash(current_setting('test.institutional_application')::jsonb->'nextConfiguration') is distinct from current_setting('test.institutional_application')::jsonb->>'nextConfigurationFingerprint' then raise exception 'candidate hash mismatch'; end if;
end $$;
update public.processing_jobs set leased_account_user_id='10000000-0000-4000-8000-000000000872' where status='leased';
-- Explicit synthetic worker lease identity; the capability is not transferable between accounts.
update public.processing_jobs set leased_account_user_id='10000000-0000-4000-8000-000000000872' where organization_id='20000000-0000-4000-8000-000000000871' and status='leased';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000872","role":"authenticated"}',true);
select public.worker_sync_institutional_information_requests_v1('80000000-0000-4000-8000-000000000871',repeat('u',64),jsonb_build_array(current_setting('test.institutional_request')::jsonb));
select public.worker_sync_institutional_information_requests_v1('80000000-0000-4000-8000-000000000871',repeat('u',64),jsonb_build_array(current_setting('test.institutional_request')::jsonb));
reset role;
-- Fixture keeps real generated request identity in the immutable answer evidence.
select set_config('test.institutional_application',jsonb_set(current_setting('test.institutional_application')::jsonb,'{answerEvidence,requestId}',to_jsonb((select id::text from public.capital_project_information_requests where source_namespace='institutional_model_assumptions' and capital_project_id='30000000-0000-4000-8000-000000000871')))::text,true);
insert into public.agent_conversations(id,organization_id,intake_session_id,state,created_by) values('60000000-0000-4000-8000-000000000871','20000000-0000-4000-8000-000000000871','40000000-0000-4000-8000-000000000871','idle','10000000-0000-4000-8000-000000000871');
insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,metadata,created_by) values('90000000-0000-4000-8000-000000000871','20000000-0000-4000-8000-000000000871','60000000-0000-4000-8000-000000000871','40000000-0000-4000-8000-000000000871','user','queued','45','en-US','{}','10000000-0000-4000-8000-000000000871');
update public.capital_project_information_requests set status='answered',answer_ref=(current_setting('test.institutional_answer')::jsonb)-array['id','sourceNamespace','requirementKey','producerBinding','answerKind'] where capital_project_id='30000000-0000-4000-8000-000000000871' and source_namespace='institutional_model_assumptions';
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,status,payload,attempts,lease_expires_at,capability_sha256)
values('80000000-0000-4000-8000-000000000873','20000000-0000-4000-8000-000000000871','70000000-0000-4000-8000-000000000871','40000000-0000-4000-8000-000000000871','agent_operation_brief','leased','{"message_id":"90000000-0000-4000-8000-000000000871","locale":"en-US"}',1,now()+interval '10 minutes',extensions.digest(repeat('v',64),'sha256'));

