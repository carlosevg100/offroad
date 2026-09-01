-- The conversational shell creates one project/session/plan/transcript atomically, replays the
-- same request and preserves tenant isolation. All fixtures roll back.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000221', 'authenticated', 'authenticated',
   'advisor-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000222', 'authenticated', 'authenticated',
   'advisor-other@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
   '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000221', 'originator', 'Advisor Workspace', '10000000-0000-4000-8000-000000000221'),
  ('20000000-0000-4000-8000-000000000222', 'originator', 'Other Advisor Workspace', '10000000-0000-4000-8000-000000000222');
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000221', '10000000-0000-4000-8000-000000000221', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000222', '10000000-0000-4000-8000-000000000222', 'owner', 'active', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000221","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  request_id constant uuid := '30000000-0000-4000-8000-000000000221';
  second_message_id constant uuid := '30000000-0000-4000-8000-000000000222';
  plan_snapshot jsonb;
  started jsonb;
  replayed jsonb;
  appended jsonb;
  queued jsonb;
  project_id uuid;
  session_id uuid;
  v_conversation_id uuid;
  v_initial_job_id uuid;
begin
  select jsonb_build_object(
    'schemaVersion', 'capital-project-plan.v1',
    'compilerVersion', '2026.09.01-v2',
    'registryVersion', '2026.09.01-v2',
    'job', jsonb_build_object(
      'id', 'origination_thesis',
      'targetTaskIds', jsonb_build_array('M07', 'C02', 'K04'),
      'firstWorkProduct', 'meeting_brief',
      'confirmationGate', 'preliminary_understanding',
      'accessPolicy', 'public_or_private',
      'inputPolicy', jsonb_build_object(
        'company', 'required', 'documents', 'optional', 'capitalIntent', 'optional',
        'existingTransaction', 'not_applicable', 'publicResearch', 'required'
      )
    ),
    'taskSpecs', jsonb_agg(jsonb_build_object(
      'id', spec.id, 'label', spec.label, 'graph', spec.graph,
      'dependencies', to_jsonb(spec.dependencies), 'executionClass', spec.execution_class,
      'effect', spec.effect, 'maturity', 'specified', 'ordinal', spec.ordinal, 'batch', spec.batch
    ) order by spec.ordinal),
    'parallelBatches', jsonb_build_array(
      jsonb_build_array('M01', 'M02'), jsonb_build_array('M03', 'M04'),
      jsonb_build_array('M05', 'C02', 'K04'), jsonb_build_array('M06'), jsonb_build_array('M07')
    )
  ) into plan_snapshot
  from (values
    ('M01','Resolver companhia e grupo','case',array[]::text[],'extraction','propose_state',0,0),
    ('M02','Normalizar objetivo','case',array[]::text[],'extraction','propose_state',1,0),
    ('M03','Registrar restrições','case',array['M02'],'extraction','propose_state',2,1),
    ('M04','Inferir arquétipos candidatos','case',array['M01','M02'],'judgment','propose_state',3,1),
    ('M05','Definir entregáveis','case',array['M02','M03'],'deterministic','propose_state',4,2),
    ('M06','Compilar plano de tarefas','case',array['M04','M05'],'deterministic','commit',5,3),
    ('M07','Emitir entendimento corrigível','case',array['M06','C02','K04'],'compilation','propose_state',6,4),
    ('C02','Pesquisar setor e regulação','knowledge',array['M01','M04'],'research','none',7,2),
    ('K04','Pesquisar transações comparáveis','market',array['M01','M04'],'research','commit',8,2)
  ) spec(id,label,graph,dependencies,execution_class,effect,ordinal,batch);

  started := public.start_advisor_project_v1(
    request_id, 'pt-BR', 'Projeto Conversacional', 'origination_thesis',
    'Vou me reunir com a Companhia Farol e quero chegar com uma leitura própria.',
    'public_information', plan_snapshot
  );
  project_id := (started ->> 'capital_project_id')::uuid;
  session_id := (started ->> 'intake_session_id')::uuid;
  v_conversation_id := (started ->> 'conversation_id')::uuid;

  if started ->> 'replayed' <> 'false'
    or (select count(*) from public.capital_projects where id = project_id) <> 1
    or (select count(*) from public.document_intake_sessions where id = session_id and representation_status = 'not_claimed') <> 1
    or (select count(*) from public.capital_project_plans where capital_project_id = project_id and status = 'active') <> 1
    or (select count(*) from public.agent_conversations where id = v_conversation_id and intake_session_id = session_id) <> 1
    or (select count(*) from public.agent_messages message where message.conversation_id = v_conversation_id) <> 2 then
    raise exception 'advisor start did not create one coherent memory: %', started;
  end if;

  replayed := public.start_advisor_project_v1(
    request_id, 'pt-BR', 'Ignored', 'origination_thesis', 'Ignored replay content',
    'public_information', plan_snapshot
  );
  if replayed ->> 'replayed' <> 'true'
    or replayed ->> 'capital_project_id' <> project_id::text
    or (select count(*) from public.capital_projects where id = project_id) <> 1 then
    raise exception 'advisor start was not idempotent: %', replayed;
  end if;

  appended := public.append_advisor_message_v1(
    project_id, second_message_id, 'pt-BR', 'A reunião será com o CFO e a tesouraria.'
  );
  if appended ->> 'replayed' <> 'false'
    or (select count(*) from public.agent_messages message where message.conversation_id = v_conversation_id) <> 4 then
    raise exception 'advisor continuation did not preserve the transcript: %', appended;
  end if;
  appended := public.append_advisor_message_v1(
    project_id, second_message_id, 'pt-BR', 'A reunião será com o CFO e a tesouraria.'
  );
  if appended ->> 'replayed' <> 'true'
    or (select count(*) from public.agent_messages message where message.conversation_id = v_conversation_id) <> 4 then
    raise exception 'advisor continuation replay duplicated messages: %', appended;
  end if;

  queued := public.queue_advisor_initial_turn_v1(project_id);
  v_initial_job_id := (queued ->> 'job_id')::uuid;
  if queued ->> 'replayed' <> 'false'
    or v_initial_job_id is null
    or (select status from public.agent_messages where id = request_id) <> 'queued'
    or (select count(*) from public.agent_messages message where message.conversation_id = v_conversation_id) <> 3 then
    raise exception 'initial advisor turn was not queued once: %', queued;
  end if;
  queued := public.queue_advisor_initial_turn_v1(project_id);
  if queued ->> 'replayed' <> 'true'
    or queued ->> 'job_id' <> v_initial_job_id::text then
    raise exception 'initial advisor turn queue replay duplicated work: %', queued;
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000222","role":"authenticated","aal":"aal1"}', true);
do $$ begin
  if (select count(*) from public.capital_projects where project_name = 'Projeto Conversacional') <> 0
    or (select count(*) from public.agent_messages where id = '30000000-0000-4000-8000-000000000221') <> 0 then
    raise exception 'advisor project memory crossed tenant boundaries';
  end if;
end $$;

rollback;
