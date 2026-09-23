-- Persisted answer authority through the actual human and binding commands.
-- Run only on disposable local/staging test transaction. Always ends ROLLBACK.
\set ON_ERROR_STOP on
begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/execution_approval.sql

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000741', 'authenticated', 'authenticated',
   'binding-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000742', 'authenticated', 'authenticated',
   'binding-worker@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values (
  '20000000-0000-4000-8000-000000000741', 'originator', 'Binding Tenant',
  '10000000-0000-4000-8000-000000000741'
);
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values (
  '20000000-0000-4000-8000-000000000741', '10000000-0000-4000-8000-000000000741',
  'owner', 'active', now()
);
insert into public.capital_projects (id, organization_id, project_name, entry_job, created_by) values (
  '30000000-0000-4000-8000-000000000741', '20000000-0000-4000-8000-000000000741',
  'Receivables Binding Test', 'capital_planning', '10000000-0000-4000-8000-000000000741'
);
insert into public.document_intake_sessions (
  id, organization_id, capital_project_id, started_by, journey, locale
) values (
  '40000000-0000-4000-8000-000000000741', '20000000-0000-4000-8000-000000000741',
  '30000000-0000-4000-8000-000000000741', '10000000-0000-4000-8000-000000000741',
  'company', 'pt-BR'
);
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000741', '20000000-0000-4000-8000-000000000741',
  '40000000-0000-4000-8000-000000000741', 1, 'manual', 'running', 'binding-test-v1',
  '10000000-0000-4000-8000-000000000741'
);
insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  attempts, lease_expires_at, capability_sha256
) values (
  '80000000-0000-4000-8000-000000000741', '20000000-0000-4000-8000-000000000741',
  '70000000-0000-4000-8000-000000000741', '40000000-0000-4000-8000-000000000741',
  'case_analysis', 'leased', '{"analysis_scope":"full_case"}'::jsonb, 1,
  now() + interval '10 minutes', extensions.digest(repeat('u',64), 'sha256')
);
insert into public.capital_project_information_requests (
  id, organization_id, capital_project_id, requirement_key, question, why_it_matters,
  decision_impact, acceptable_evidence, answer_kind, choices, priority,
  information_gain, materiality, answerability, redundancy_penalty, status, source_namespace
) values
  ('50000000-0000-4000-8000-000000000741', '20000000-0000-4000-8000-000000000741',
   '30000000-0000-4000-8000-000000000741', 'receivables.r01.field.structure.advance_rate',
   'Qual advance rate devemos testar?', 'Altera o borrowing base.', 'Vira input do modelo.',
   array['Confirmação expressa'], 'number', '{}', 'blocking', 1, 1, 1, 0, 'open',
   'receivables_method_r01_fields'),
  ('50000000-0000-4000-8000-000000000742', '20000000-0000-4000-8000-000000000741',
   '30000000-0000-4000-8000-000000000741', 'receivables.r01.field.structure.reserve_rate',
   'Qual reserve rate devemos testar?', 'Altera a proteção.', 'Vira input do modelo.',
   array['Confirmação expressa'], 'number', '{}', 'blocking', 0.9, 1, 1, 0, 'open',
   'receivables_method_r01_fields');

select pg_temp.fixture_approve_execution('80000000-0000-4000-8000-000000000741',true);

update public.processing_jobs set leased_account_user_id='10000000-0000-4000-8000-000000000742' where status='leased';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000742","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  projection jsonb := jsonb_build_object(
    'schemaVersion','project-information-request-projection.v1',
    'projectId','30000000-0000-4000-8000-000000000741',
    'sourceNamespace','receivables_method_r01_fields',
    'requests',jsonb_build_array(
      jsonb_build_object(
        'requirementKey','receivables.r01.field.structure.advance_rate',
        'producerBinding',jsonb_build_object(
          'schemaVersion','receivables-information-request-binding.v1','methodId','R01',
          'sourceDatasetHash',repeat('a',64),'fieldPath','/structure/advanceRate',
          'valueKind','percentage','unit','percent_0_100','minimum',0,'maximum',100,'options',jsonb_build_array()
        )
      ),
      jsonb_build_object(
        'requirementKey','receivables.r01.field.structure.reserve_rate',
        'producerBinding',jsonb_build_object(
          'schemaVersion','receivables-information-request-binding.v1','methodId','R01',
          'sourceDatasetHash',repeat('a',64),'fieldPath','/structure/reserveRate',
          'valueKind','percentage','unit','percent_0_100','minimum',0,'maximum',100,'options',jsonb_build_array()
        )
      )
    )
  );
  result jsonb;
begin
  result := public.worker_bind_receivables_information_request_fields_v1(
    '80000000-0000-4000-8000-000000000741', repeat('u',64), projection
  );
  if result ->> 'bound_count' <> '2' then raise exception 'bindings not recorded: %', result; end if;
  result := public.worker_bind_receivables_information_request_fields_v1(
    '80000000-0000-4000-8000-000000000741', repeat('u',64), projection
  );
  if result ->> 'replayed_count' <> '2' then raise exception 'bindings did not replay: %', result; end if;
end;
$$;

reset role;

-- Produce the response through the actual human command, not fabricated answer_ref.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000741","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.submit_advisor_information_response_v1(
 '30000000-0000-4000-8000-000000000741','50000000-0000-4000-8000-000000000741',
 (select updated_at from public.capital_project_information_requests where id='50000000-0000-4000-8000-000000000741'),
 '90000000-0000-4000-8000-000000000741','pt-BR','custom','72,5%');
reset role;
-- Ambient identity is the worker, but the explicit subject remains the human.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000742","role":"authenticated","aal":"aal1"}',true);
create function pg_temp.response_probe(
 subject uuid default '10000000-0000-4000-8000-000000000741',
 dataset text default repeat('a',64),
 request_id uuid default '50000000-0000-4000-8000-000000000741',
 session_id uuid default '40000000-0000-4000-8000-000000000741'
) returns jsonb language sql as $$
 select private.r01_response_authority_v1('20000000-0000-4000-8000-000000000741',
 '30000000-0000-4000-8000-000000000741',session_id,dataset,
 '90000000-0000-4000-8000-000000000741',request_id,subject);
$$;
create function pg_temp.expect_response_denied(label text,command text) returns void language plpgsql as $$
begin
 begin execute command;
 exception when insufficient_privilege then
  if sqlerrm='r01_response_authority_denied' then raise notice 'PASS: %',label;return;end if;
  raise;
 end;
 raise exception 'Missing authority denial: %',label;
end $$;
do $$ declare result jsonb; begin
 result:=pg_temp.response_probe();
 if result->>'content' is distinct from '72,5%' or result#>>'{answeredRequest,producerBinding,fieldPath}' is distinct from '/structure/advanceRate'
 or result#>>'{answeredRequest,answeredBy}' is distinct from '10000000-0000-4000-8000-000000000741'
 or (select count(*) from jsonb_object_keys(result))<>3 then raise exception 'r01_response_positive_failed';end if;
end $$;
select pg_temp.expect_response_denied('worker cannot become human',$q$select pg_temp.response_probe('10000000-0000-4000-8000-000000000742')$q$);
select pg_temp.expect_response_denied('wrong dataset',$q$select pg_temp.response_probe(dataset=>repeat('b',64))$q$);
select pg_temp.expect_response_denied('wrong request',$q$select pg_temp.response_probe(request_id=>'50000000-0000-4000-8000-000000000742')$q$);
select pg_temp.expect_response_denied('wrong session',$q$select pg_temp.response_probe(session_id=>'40000000-0000-4000-8000-000000000742')$q$);
savepoint altered_message;
update public.agent_messages set content='82,5%' where id='90000000-0000-4000-8000-000000000741';
select pg_temp.expect_response_denied('message bytes changed',$q$select pg_temp.response_probe()$q$);
rollback to altered_message;
savepoint altered_metadata;
update public.agent_messages set metadata=jsonb_set(metadata,'{informationRequestId}','"50000000-0000-4000-8000-000000000742"') where id='90000000-0000-4000-8000-000000000741';
select pg_temp.expect_response_denied('message anchor changed',$q$select pg_temp.response_probe()$q$);
rollback to altered_metadata;
savepoint altered_author;
update public.capital_project_information_requests set answer_ref=jsonb_set(answer_ref,'{answeredBy}','"10000000-0000-4000-8000-000000000742"') where id='50000000-0000-4000-8000-000000000741';
select pg_temp.expect_response_denied('claimed author changed',$q$select pg_temp.response_probe()$q$);
rollback to altered_author;
savepoint withdrawn;
update public.capital_project_information_requests set status='waived' where id='50000000-0000-4000-8000-000000000741';
select pg_temp.expect_response_denied('response no longer answered',$q$select pg_temp.response_probe()$q$);
rollback to withdrawn;
savepoint suspended_subject;
update private.principals set revoked_at=clock_timestamp() where organization_id='20000000-0000-4000-8000-000000000741' and user_id='10000000-0000-4000-8000-000000000741';
select pg_temp.expect_response_denied('subject revoked',$q$select pg_temp.response_probe()$q$);
rollback to suspended_subject;
do $$ begin
 if has_function_privilege('authenticated','private.r01_response_authority_v1(uuid,uuid,uuid,text,uuid,uuid,uuid)','EXECUTE')
 or has_function_privilege('anon','private.r01_response_authority_v1(uuid,uuid,uuid,text,uuid,uuid,uuid)','EXECUTE')
 or has_function_privilege('service_role','private.r01_response_authority_v1(uuid,uuid,uuid,text,uuid,uuid,uuid)','EXECUTE')
 then raise exception 'r01_response_helper_exposed';end if;
end $$;
select 'r01_response_authority: PASS' result;
rollback;
