begin;
\ir support/execution_approval.sql

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

\ir support/institutional_assumption_answer_fixture.sql
select pg_temp.fixture_approve_execution('80000000-0000-4000-8000-000000000871',true);
insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,status,reviewed_at,reviewed_by)
values('20000000-0000-4000-8000-000000000871','30000000-0000-4000-8000-000000000871',1,current_setting('test.institutional_configuration')::jsonb,private.institutional_config_hash(current_setting('test.institutional_configuration')::jsonb),'approved',now(),'10000000-0000-4000-8000-000000000871');
do $$ begin
 if private.institutional_response_value('7.123456789012345678901234567890123456789','{"locale":"en-US","unit":"percent"}'::jsonb,'{}'::jsonb) is distinct from '0.07123456789012345678901234567890123456789' then raise exception 'exact percent normalization lost precision';end if;
 if private.institutional_config_hash(current_setting('test.institutional_configuration')::jsonb) is distinct from current_setting('test.institutional_application')::jsonb->>'expectedConfigurationFingerprint' then raise exception 'JS/Postgres hash mismatch'; end if;
 if private.institutional_config_hash(current_setting('test.institutional_application')::jsonb->'nextConfiguration') is distinct from current_setting('test.institutional_application')::jsonb->>'nextConfigurationFingerprint' then raise exception 'candidate hash mismatch'; end if;
end $$;
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

set local role authenticated;
do $$ declare result jsonb; accepted boolean; broken jsonb; begin
 foreach broken in array array[
  current_setting('test.institutional_application')::jsonb-'willExecute',
  jsonb_set(current_setting('test.institutional_application')::jsonb,'{nextConfiguration,currency}','"USD"'),
  jsonb_set(current_setting('test.institutional_application')::jsonb,'{answerEvidence,answeredBy}','"10000000-0000-4000-8000-000000000872"')
 ] loop
  accepted:=false;
  begin perform public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),broken);accepted:=true;exception when others then null;end;
  if accepted then raise exception 'malformed candidate accepted';end if;
 end loop;
 result:=public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),current_setting('test.institutional_application')::jsonb);
 if result->>'replayed' is distinct from 'false' then raise exception 'candidate not created'; end if;
 result:=public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),current_setting('test.institutional_application')::jsonb);
 if result->>'replayed' is distinct from 'true' then raise exception 'candidate not idempotent'; end if;
 accepted:=false;
 begin perform public.worker_apply_institutional_assumption_answer_v1('80000000-0000-4000-8000-000000000873',repeat('v',64),jsonb_set(current_setting('test.institutional_application')::jsonb,'{answerEvidence,canonicalValue}','"999"'));accepted:=true;exception when others then null;end;
 if accepted then raise exception 'replay accepted altered evidence';end if;
 accepted:=false;
 begin perform public.review_institutional_configuration_v1('30000000-0000-4000-8000-000000000871',(result->>'candidateId')::uuid,current_setting('test.institutional_application')::jsonb->>'expectedConfigurationFingerprint','approved',current_setting('test.institutional_application')::jsonb->>'nextConfigurationFingerprint');accepted:=true;exception when insufficient_privilege then null;end;
 if accepted then raise exception 'worker actor reviewed without project access';end if;

 if public.worker_load_institutional_configuration_v1('80000000-0000-4000-8000-000000000873',repeat('v',64))->>'revision' is distinct from '1' then raise exception 'proposal silently replaced approved configuration'; end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from private.institutional_model_configurations where capital_project_id='30000000-0000-4000-8000-000000000871')<>2 then raise exception 'unexpected revision count';end if;
 if not exists(select 1 from pg_class where oid='private.institutional_model_configurations'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'RLS missing';end if;
 if has_table_privilege('authenticated','private.institutional_model_configurations','SELECT') then raise exception 'private configuration exposed';end if;
 if not exists(select 1 from public.audit_events where resource_type='institutional_model_configurations') then raise exception 'revision audit missing';end if;
end $$;
-- Two proposed alternatives may share a parent; a stale sibling must remain rejectable.
insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status)
select organization_id,capital_project_id,3,jsonb_set(configuration,'{assumptionBook,scenarioId}','"synthetic-sibling"'),private.institutional_config_hash(jsonb_set(configuration,'{assumptionBook,scenarioId}','"synthetic-sibling"')),parent_fingerprint,'review_required'
from private.institutional_model_configurations where capital_project_id='30000000-0000-4000-8000-000000000871' and revision=2;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000871","role":"authenticated"}',true);
set local role authenticated;
do $$ declare reviews jsonb; candidate jsonb; begin
 reviews:=public.read_institutional_configuration_reviews_v1('30000000-0000-4000-8000-000000000871');
 select value into candidate from jsonb_array_elements(reviews) where value->>'revision'='2';
 if candidate->>'status' is distinct from 'review_required' then raise exception 'review candidate missing';end if;
 perform public.review_institutional_configuration_v1('30000000-0000-4000-8000-000000000871',(candidate->>'candidateId')::uuid,candidate->>'parentFingerprint','approved',candidate->>'configurationFingerprint');
 if not exists(select 1 from jsonb_array_elements(public.read_institutional_configuration_reviews_v1('30000000-0000-4000-8000-000000000871')) where value->>'revision'='2' and value->>'status'='approved') then raise exception 'explicit review failed';end if;
 -- Same queued message replays against its original parent after approval.
 if (public.worker_load_institutional_configuration_v1('80000000-0000-4000-8000-000000000873',repeat('v',64))->>'revision') is distinct from '1' then raise exception 'retry parent changed';end if;
end $$;
do $$ declare sibling jsonb; accepted boolean:=false; begin
 select value into sibling from jsonb_array_elements(public.read_institutional_configuration_reviews_v1('30000000-0000-4000-8000-000000000871')) where value->>'revision'='3';
 begin perform public.review_institutional_configuration_v1('30000000-0000-4000-8000-000000000871',(sibling->>'candidateId')::uuid,sibling->>'parentFingerprint','approved',sibling->>'configurationFingerprint');accepted:=true;exception when serialization_failure then null;end;
 if accepted then raise exception 'stale sibling approved';end if;
 perform public.review_institutional_configuration_v1('30000000-0000-4000-8000-000000000871',(sibling->>'candidateId')::uuid,sibling->>'parentFingerprint','rejected',sibling->>'configurationFingerprint');
end $$;
rollback;
