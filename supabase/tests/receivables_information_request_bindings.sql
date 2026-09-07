begin;

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
insert into public.agent_conversations (
  id, organization_id, intake_session_id, state, created_by
) values (
  '60000000-0000-4000-8000-000000000741', '20000000-0000-4000-8000-000000000741',
  '40000000-0000-4000-8000-000000000741', 'idle', '10000000-0000-4000-8000-000000000741'
);
insert into public.agent_messages (
  id, organization_id, conversation_id, intake_session_id, role, status, content, locale, metadata, created_by
) values
  ('90000000-0000-4000-8000-000000000741', '20000000-0000-4000-8000-000000000741',
   '60000000-0000-4000-8000-000000000741', '40000000-0000-4000-8000-000000000741',
   'user', 'queued', '72,5%', 'pt-BR',
   '{"kind":"information_request_response","informationRequestId":"50000000-0000-4000-8000-000000000741","answerSource":"custom"}'::jsonb,
   '10000000-0000-4000-8000-000000000741'),
  ('90000000-0000-4000-8000-000000000742', '20000000-0000-4000-8000-000000000741',
   '60000000-0000-4000-8000-000000000741', '40000000-0000-4000-8000-000000000741',
   'user', 'completed', '125%', 'pt-BR', '{}'::jsonb,
   '10000000-0000-4000-8000-000000000741');

update public.capital_project_information_requests
set status = 'answered', answer_ref = jsonb_build_object(
  'messageId','90000000-0000-4000-8000-000000000741','answeredBy','10000000-0000-4000-8000-000000000741',
  'answeredAt','2026-09-07T02:00:00.000Z','answerSource','custom'
)
where id = '50000000-0000-4000-8000-000000000741';

do $$
declare accepted boolean := false;
begin
  begin
    update public.capital_project_information_requests
    set status = 'answered', answer_ref = jsonb_build_object(
      'messageId','90000000-0000-4000-8000-000000000742','answeredBy','10000000-0000-4000-8000-000000000741',
      'answeredAt','2026-09-07T02:00:00.000Z','answerSource','custom'
    ) where id = '50000000-0000-4000-8000-000000000742';
    accepted := true;
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'out-of-range bound answer was accepted'; end if;
end;
$$;

insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000742', '20000000-0000-4000-8000-000000000741',
  '40000000-0000-4000-8000-000000000741', 2, 'answer', 'running', 'binding-test-v1',
  '10000000-0000-4000-8000-000000000741'
);
insert into public.processing_jobs (
  id, organization_id, processing_run_id, intake_session_id, kind, status, payload,
  attempts, lease_expires_at, capability_sha256
) values (
  '80000000-0000-4000-8000-000000000742', '20000000-0000-4000-8000-000000000741',
  '70000000-0000-4000-8000-000000000742', '40000000-0000-4000-8000-000000000741',
  'agent_operation_brief', 'leased', '{"message_id":"90000000-0000-4000-8000-000000000741","locale":"pt-BR"}'::jsonb, 1,
  now() + interval '10 minutes', extensions.digest(repeat('v',64), 'sha256')
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000742","role":"authenticated","aal":"aal1"}', true);
do $$
declare context jsonb;
begin
  context := public.worker_load_agent_context(
    '80000000-0000-4000-8000-000000000742', repeat('v',64)
  );
  if context #>> '{answered_information_request,producerBinding,fieldPath}' <> '/structure/advanceRate'
    or context #>> '{answered_information_request,answeredBy}' <> '10000000-0000-4000-8000-000000000741' then
    raise exception 'private binding not loaded for exact answered question: %', context;
  end if;
end;
$$;

-- Tenant users cannot enumerate executor bindings through the Data API role.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000741","role":"authenticated","aal":"aal1"}', true);
do $$
declare accepted boolean := false;
begin
  begin
    perform 1 from private.receivables_information_request_bindings;
    accepted := true;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant read private information-request bindings'; end if;
end;
$$;

rollback;
