-- Actual deterministic adapter output plus a subsequent governed premise revision.
-- This proves persistence, not live orchestration or publication of an R01 artifact.
begin;
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
  '40000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  '30000000-0000-4000-8000-000000000731', '10000000-0000-4000-8000-000000000731',
  'company', 'pt-BR'
);
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  '40000000-0000-4000-8000-000000000731', 1, 'manual', 'running', 'supplement-store-test-v1',
  '10000000-0000-4000-8000-000000000731'
);
insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  attempts, lease_expires_at, capability_sha256
) values (
  '80000000-0000-4000-8000-000000000731', '20000000-0000-4000-8000-000000000731',
  '70000000-0000-4000-8000-000000000731', '40000000-0000-4000-8000-000000000731',
  'case_analysis', 'leased', '{"analysis_scope":"full_case"}'::jsonb, 1,
  now() + interval '10 minutes', extensions.digest(repeat('u',64), 'sha256')
);

select pg_temp.fixture_approve_execution('80000000-0000-4000-8000-000000000731',true);


-- Real deterministic R01 question payload; only synthetic identities/dataset change.
create function pg_temp.field_projection(dataset text) returns jsonb language sql as $$ select jsonb_set(jsonb_set(jsonb_set($projection${"schemaVersion": "project-information-request-projection.v1", "projectId": "30000000-0000-4000-8000-000000000731", "sourceNamespace": "receivables_method_r01_fields", "projectionRef": "20000000-0000-4000-8000-000000000001:R01:fields:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:/structure/advanceRate", "requests": [{"id": "06825bf1-f7c1-4165-9b62-7a1b3e3de092", "schemaVersion": "dcm-information-request.v1", "projectId": "30000000-0000-4000-8000-000000000731", "requirementKey": "receivables.r01.field.structure.advance_rate", "question": "Qual advance rate devemos testar? Informe de 0% a 100%.", "whyItMatters": "Este par\u00e2metro altera o dimensionamento, a prote\u00e7\u00e3o de cr\u00e9dito ou a aloca\u00e7\u00e3o do caixa.", "decisionImpact": "O valor confirmado vira input rastre\u00e1vel do modelo; qualquer altera\u00e7\u00e3o cria uma nova revis\u00e3o.", "acceptableEvidence": ["Confirma\u00e7\u00e3o expressa do par\u00e2metro da estrutura"], "answerKind": "number", "choices": [], "priority": "blocking", "informationGain": 1, "materiality": 0.98, "answerability": 0.95, "redundancyPenalty": 0, "status": "open", "producerBinding": {"schemaVersion": "receivables-information-request-binding.v1", "methodId": "R01", "sourceDatasetHash": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "fieldPath": "/structure/advanceRate", "valueKind": "percentage", "unit": "percent_0_100", "minimum": 0, "maximum": 100, "options": []}}]}$projection$::jsonb,'{requests,0,producerBinding,sourceDatasetHash}',to_jsonb(dataset)),'{requests,0,id}',to_jsonb(gen_random_uuid()::text)),'{projectionRef}',to_jsonb('dataset-revision:'||dataset)); $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000732","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.worker_sync_receivables_information_requests_v1('80000000-0000-4000-8000-000000000731',repeat('u',64),$projection${"schemaVersion": "project-information-request-projection.v1", "projectId": "30000000-0000-4000-8000-000000000731", "sourceNamespace": "receivables_method_r01_evidence", "projectionRef": "20000000-0000-4000-8000-000000000001:R01:evidence:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:blocked", "requests": [{"id": "730606de-edd7-4a7f-9833-68210a35b9f0", "schemaVersion": "dcm-information-request.v1", "projectId": "30000000-0000-4000-8000-000000000731", "requirementKey": "receivables.r01.performance_history_incomplete", "question": "Envie os hist\u00f3ricos completos de liquida\u00e7\u00e3o, dilui\u00e7\u00e3o, prorroga\u00e7\u00e3o, recompra, substitui\u00e7\u00e3o e cess\u00f5es/\u00f4nus para o per\u00edodo analisado.", "whyItMatters": "O hist\u00f3rico est\u00e1 incompleto para: settlements, dilutions, extensions, repurchases, assignmentsAndLiens. Aus\u00eancia de evento n\u00e3o ser\u00e1 tratada como zero.", "decisionImpact": "Sem esta evid\u00eancia, o R01 permanece bloqueado e n\u00e3o produz conclus\u00e3o por t\u00edtulo.", "acceptableEvidence": ["Hist\u00f3rico de baixas", "Dilui\u00e7\u00e3o, prorroga\u00e7\u00e3o, recompra, substitui\u00e7\u00e3o e perdas"], "answerKind": "document", "choices": [], "priority": "blocking", "informationGain": 1, "materiality": 0.98, "answerability": 0.75, "redundancyPenalty": 0, "status": "open"}]}$projection$::jsonb);
reset role;
create temp table dataset_request_observations as select id,to_jsonb(r) original from public.capital_project_information_requests r where source_namespace='receivables_method_r01_evidence' and capital_project_id='30000000-0000-4000-8000-000000000731';
set local role authenticated;
select public.worker_sync_receivables_information_requests_v1('80000000-0000-4000-8000-000000000731',repeat('u',64),pg_temp.field_projection(repeat('a',64)));
reset role;
do $$ declare n integer; begin
 select count(*) into n from public.capital_project_information_requests r join private.receivables_information_request_bindings b on b.organization_id=r.organization_id and b.information_request_id=r.id
 where r.capital_project_id='30000000-0000-4000-8000-000000000731' and r.status='open' and b.binding->>'sourceDatasetHash'=repeat('a',64);
 if n<>1 then raise exception 'Expected one current bound question for dataset a'; end if;
end; $$;
set local role authenticated;
select public.worker_sync_receivables_information_requests_v1('80000000-0000-4000-8000-000000000731',repeat('u',64),pg_temp.field_projection(repeat('b',64)));
reset role;
do $$ declare n integer; begin
 select count(*) into n from public.capital_project_information_requests r join private.receivables_information_request_bindings b on b.organization_id=r.organization_id and b.information_request_id=r.id
 where r.capital_project_id='30000000-0000-4000-8000-000000000731' and r.status='open' and b.binding->>'sourceDatasetHash'=repeat('b',64);
 if n<>1 then raise exception 'Expected one current bound question for dataset b'; end if;
end; $$;
-- Historical answered state still passes the real bound numeric-response trigger.
insert into public.agent_conversations(organization_id,intake_session_id,created_by) values('20000000-0000-4000-8000-000000000731','40000000-0000-4000-8000-000000000731','10000000-0000-4000-8000-000000000731') on conflict(organization_id,intake_session_id) do nothing;
insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,metadata,created_by)
select '90000000-0000-4000-8000-000000000731',organization_id,id,intake_session_id,'user','completed','50','pt-BR','{"kind":"synthetic_historical_answer"}','10000000-0000-4000-8000-000000000731' from public.agent_conversations where organization_id='20000000-0000-4000-8000-000000000731' and intake_session_id='40000000-0000-4000-8000-000000000731';
update public.capital_project_information_requests r set status='answered',answer_ref='{"messageId":"90000000-0000-4000-8000-000000000731"}' where capital_project_id='30000000-0000-4000-8000-000000000731' and source_namespace='receivables_method_r01_fields' and status='open';
set local role authenticated;
do $$ declare outcome jsonb; begin
 outcome:=public.worker_sync_receivables_information_requests_v1('80000000-0000-4000-8000-000000000731',repeat('u',64),pg_temp.field_projection(repeat('b',64)));
 if outcome->>'open_count'<>'0' or outcome->>'preserved_closed_count'<>'1' then raise exception 'Same-binding closed question reopened'; end if;
end; $$;
reset role;

set local role authenticated;
select public.worker_sync_receivables_information_requests_v1('80000000-0000-4000-8000-000000000731',repeat('u',64),pg_temp.field_projection(repeat('c',64)));
reset role;
do $$ declare n integer; begin
 select count(*) into n from public.capital_project_information_requests r join private.receivables_information_request_bindings b on b.organization_id=r.organization_id and b.information_request_id=r.id
 where r.capital_project_id='30000000-0000-4000-8000-000000000731' and r.status='open' and b.binding->>'sourceDatasetHash'=repeat('c',64);
 if n<>1 then raise exception 'Expected one current bound question for dataset c'; end if;
end; $$;
update public.capital_project_information_requests r set status='waived',answer_ref='{"synthetic":true}' where capital_project_id='30000000-0000-4000-8000-000000000731' and source_namespace='receivables_method_r01_fields' and status='open';
set local role authenticated;
do $$ declare outcome jsonb; begin
 outcome:=public.worker_sync_receivables_information_requests_v1('80000000-0000-4000-8000-000000000731',repeat('u',64),pg_temp.field_projection(repeat('c',64)));
 if outcome->>'open_count'<>'0' or outcome->>'preserved_closed_count'<>'1' then raise exception 'Same-binding closed question reopened'; end if;
end; $$;
reset role;

set local role authenticated;
select public.worker_sync_receivables_information_requests_v1('80000000-0000-4000-8000-000000000731',repeat('u',64),pg_temp.field_projection(repeat('d',64)));
reset role;
do $$ declare n integer; begin
 select count(*) into n from public.capital_project_information_requests r join private.receivables_information_request_bindings b on b.organization_id=r.organization_id and b.information_request_id=r.id
 where r.capital_project_id='30000000-0000-4000-8000-000000000731' and r.status='open' and b.binding->>'sourceDatasetHash'=repeat('d',64);
 if n<>1 then raise exception 'Expected one current bound question for dataset d'; end if;
end; $$;
-- Repeating the current exact binding retains request and immutable binding identities.
create temp table prior_dataset_requests as select r.id,to_jsonb(r) request,b.id binding_id,to_jsonb(b) binding from public.capital_project_information_requests r join private.receivables_information_request_bindings b on b.organization_id=r.organization_id and b.information_request_id=r.id where r.capital_project_id='30000000-0000-4000-8000-000000000731';
set local role authenticated;
select public.worker_sync_receivables_information_requests_v1('80000000-0000-4000-8000-000000000731',repeat('u',64),pg_temp.field_projection(repeat('d',64)));
reset role;
do $$ begin
 if (select count(*) from public.capital_project_information_requests where capital_project_id='30000000-0000-4000-8000-000000000731' and source_namespace='receivables_method_r01_fields')<>4 then raise exception 'Dataset change did not preserve four distinct question identities'; end if;
 if exists(select 1 from prior_dataset_requests p join private.receivables_information_request_bindings b on b.id=p.binding_id where to_jsonb(b)<>p.binding) then raise exception 'Immutable prior binding changed'; end if;
 if exists(select 1 from dataset_request_observations p join public.capital_project_information_requests r on r.id=p.id where to_jsonb(r)<>p.original) then raise exception 'Other producer questions changed'; end if;
 if exists(select 1 from public.capital_project_information_requests r join private.receivables_information_request_bindings b on b.information_request_id=r.id and b.organization_id=r.organization_id where r.capital_project_id='30000000-0000-4000-8000-000000000731' and r.status is distinct from case b.binding->>'sourceDatasetHash' when repeat('a',64) then 'superseded' when repeat('b',64) then 'answered' when repeat('c',64) then 'waived' when repeat('d',64) then 'open' end) then raise exception 'Prior statuses were rewritten'; end if;
end; $$;
-- A changed numeric contract on the same dataset also gets a new immutable binding.
set local role authenticated;
select public.worker_sync_receivables_information_requests_v1('80000000-0000-4000-8000-000000000731',repeat('u',64),jsonb_set(pg_temp.field_projection(repeat('d',64)),'{requests,0,producerBinding,maximum}','90'::jsonb));
reset role;
do $$ begin
 if (select count(*) from public.capital_project_information_requests r join private.receivables_information_request_bindings b on b.organization_id=r.organization_id and b.information_request_id=r.id where r.capital_project_id='30000000-0000-4000-8000-000000000731' and r.status='open' and b.binding->>'sourceDatasetHash'=repeat('d',64) and b.binding->>'maximum'='90')<>1 then raise exception 'Changed limit did not create the exact new contract'; end if;
 if exists(select 1 from prior_dataset_requests p join private.receivables_information_request_bindings b on b.id=p.binding_id where to_jsonb(b)<>p.binding) then raise exception 'Limit revision mutated historical binding'; end if;
end; $$;
-- A user cannot answer the retired first-dataset question.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000731","role":"authenticated"}',true);
set local role authenticated;
do $$ declare r public.capital_project_information_requests; denied boolean:=false; begin
 select * into strict r from public.capital_project_information_requests where capital_project_id='30000000-0000-4000-8000-000000000731' and source_namespace='receivables_method_r01_fields' and status='superseded' order by created_at,id limit 1;
 begin perform public.submit_advisor_information_response_v1(r.capital_project_id,r.id,r.updated_at,gen_random_uuid(),'pt-BR','custom','50'); exception when others then
 if sqlerrm like '%information_request%' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Retired dataset question accepted a response'; end if;
end; $$;
reset role;
-- An answered documentary request for the old corpus cannot suppress a new-corpus gap.
update public.capital_project_information_requests set status='answered',answer_ref='{"synthetic":true}' where capital_project_id='30000000-0000-4000-8000-000000000731' and source_namespace='receivables_method_r01_evidence';
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000732","role":"authenticated"}',true);
set local role authenticated;
select public.worker_sync_receivables_information_requests_v1('80000000-0000-4000-8000-000000000731',repeat('u',64),$projection${"schemaVersion": "project-information-request-projection.v1", "projectId": "30000000-0000-4000-8000-000000000731", "sourceNamespace": "receivables_method_r01_evidence", "projectionRef": "dataset-evidence:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "requests": [{"id": "c3f1e6aa-c689-4f82-bea3-a14ee10d64ff", "schemaVersion": "dcm-information-request.v1", "projectId": "30000000-0000-4000-8000-000000000731", "requirementKey": "receivables.r01.evidence.63fb195bb53381436f8e30f45ccdff4650d52953ca95a715b122703b4e9f3bf3", "question": "Envie os hist\u00f3ricos completos de liquida\u00e7\u00e3o, dilui\u00e7\u00e3o, prorroga\u00e7\u00e3o, recompra, substitui\u00e7\u00e3o e cess\u00f5es/\u00f4nus para o per\u00edodo analisado.", "whyItMatters": "O hist\u00f3rico est\u00e1 incompleto para: settlements, dilutions, extensions, repurchases, assignmentsAndLiens. Aus\u00eancia de evento n\u00e3o ser\u00e1 tratada como zero.", "decisionImpact": "Sem esta evid\u00eancia, o R01 permanece bloqueado e n\u00e3o produz conclus\u00e3o por t\u00edtulo.", "acceptableEvidence": ["Hist\u00f3rico de baixas", "Dilui\u00e7\u00e3o, prorroga\u00e7\u00e3o, recompra, substitui\u00e7\u00e3o e perdas"], "answerKind": "document", "choices": [], "priority": "blocking", "informationGain": 1, "materiality": 0.98, "answerability": 0.75, "redundancyPenalty": 0, "status": "open"}]}$projection$::jsonb);
reset role;
do $$ begin
 if (select count(*) from public.capital_project_information_requests where capital_project_id='30000000-0000-4000-8000-000000000731' and source_namespace='receivables_method_r01_evidence' and status='answered')<>1 or
 (select count(*) from public.capital_project_information_requests where capital_project_id='30000000-0000-4000-8000-000000000731' and source_namespace='receivables_method_r01_evidence' and status='open')<>1 then raise exception 'New evidence dataset inherited old response'; end if;
end; $$;
rollback;
