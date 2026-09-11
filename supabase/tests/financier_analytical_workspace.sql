-- Financier analytical workspace: an organization of type capital_provider starts its own
-- analysis, accepts the workspace terms with an information-usage declaration that claims no
-- representation, registers and reads its documents, continues the session and reads its own
-- state. Anonymous callers, revoked members, other tenants, tampered file bindings, organization
-- switches inside a command and every origination, representation, disclosure or introduction
-- command are refused. Company and advisor behaviour is unchanged. All fixtures roll back.

begin;

-- ---------------------------------------------------------------------------------------------
-- Test helpers (pg_temp only; created before any role switch)
-- ---------------------------------------------------------------------------------------------

create function pg_temp.expect_sqlstate(p_sql text, p_states text[], p_label text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = any (p_states) then
      return;
    end if;
    raise exception '% failed with % (%), expected one of %', p_label, sqlstate, sqlerrm, p_states;
  end;
  raise exception '% did not fail, expected one of %', p_label, p_states;
end;
$$;

-- A dependency-closed plan snapshot per entry job, valid for private.record_capital_project_plan.
create function pg_temp.plan_for(p_job text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  targets jsonb;
  tasks jsonb;
  batches jsonb;
  access_policy text;
begin
  case p_job
    when 'company_debt_view' then
      targets := '["C11"]'::jsonb;
      tasks := '[{"id":"M01","label":"Resolver companhia","graph":"case","dependencies":[],"executionClass":"extraction","effect":"propose_state","maturity":"specified","ordinal":0,"batch":0},
                 {"id":"C11","label":"Compilar visão de dívida","graph":"knowledge","dependencies":["M01"],"executionClass":"compilation","effect":"propose_state","maturity":"specified","ordinal":1,"batch":1}]'::jsonb;
      batches := '[["M01"],["C11"]]'::jsonb;
      access_policy := 'public_or_private';
    when 'capital_planning' then
      targets := '["S11"]'::jsonb;
      tasks := '[{"id":"M01","label":"Resolver companhia","graph":"case","dependencies":[],"executionClass":"extraction","effect":"propose_state","maturity":"specified","ordinal":0,"batch":0},
                 {"id":"S11","label":"Comparar alternativas","graph":"case","dependencies":["M01"],"executionClass":"deterministic","effect":"propose_state","maturity":"specified","ordinal":1,"batch":1}]'::jsonb;
      batches := '[["M01"],["S11"]]'::jsonb;
      access_policy := 'public_or_private';
    when 'structure_from_documents' then
      targets := '["S11"]'::jsonb;
      tasks := '[{"id":"M01","label":"Resolver companhia","graph":"case","dependencies":[],"executionClass":"extraction","effect":"propose_state","maturity":"specified","ordinal":0,"batch":0},
                 {"id":"S11","label":"Comparar alternativas","graph":"case","dependencies":["M01"],"executionClass":"deterministic","effect":"propose_state","maturity":"specified","ordinal":1,"batch":1}]'::jsonb;
      batches := '[["M01"],["S11"]]'::jsonb;
      access_policy := 'private_required';
    when 'review_existing_operation' then
      targets := '["S10","S12"]'::jsonb;
      tasks := '[{"id":"M01","label":"Resolver companhia","graph":"case","dependencies":[],"executionClass":"extraction","effect":"propose_state","maturity":"specified","ordinal":0,"batch":0},
                 {"id":"S10","label":"Reconstruir a operação","graph":"case","dependencies":["M01"],"executionClass":"deterministic","effect":"propose_state","maturity":"specified","ordinal":1,"batch":1},
                 {"id":"S12","label":"Testar e melhorar","graph":"case","dependencies":["S10"],"executionClass":"judgment","effect":"propose_state","maturity":"specified","ordinal":2,"batch":2}]'::jsonb;
      batches := '[["M01"],["S10"],["S12"]]'::jsonb;
      access_policy := 'private_required';
    when 'origination_thesis' then
      targets := '["M07","C02","K04"]'::jsonb;
      tasks := '[{"id":"M01","label":"Resolver companhia","graph":"case","dependencies":[],"executionClass":"extraction","effect":"propose_state","maturity":"specified","ordinal":0,"batch":0},
                 {"id":"C02","label":"Pesquisar setor","graph":"knowledge","dependencies":["M01"],"executionClass":"research","effect":"none","maturity":"specified","ordinal":1,"batch":1},
                 {"id":"K04","label":"Pesquisar comparáveis","graph":"market","dependencies":["M01"],"executionClass":"research","effect":"none","maturity":"specified","ordinal":2,"batch":1},
                 {"id":"M07","label":"Emitir entendimento","graph":"case","dependencies":["C02","K04"],"executionClass":"compilation","effect":"propose_state","maturity":"specified","ordinal":3,"batch":2}]'::jsonb;
      batches := '[["M01"],["C02","K04"],["M07"]]'::jsonb;
      access_policy := 'public_or_private';
    else
      raise exception 'unsupported fixture job %', p_job;
  end case;
  return jsonb_build_object(
    'schemaVersion', 'capital-project-plan.v1',
    'compilerVersion', 'financier-test-v1',
    'registryVersion', 'financier-test-v1',
    'job', jsonb_build_object(
      'id', p_job,
      'targetTaskIds', targets,
      'firstWorkProduct', 'fixture_result',
      'confirmationGate', 'preliminary_understanding',
      'accessPolicy', access_policy,
      'inputPolicy', jsonb_build_object('company', 'optional', 'documents', 'optional')
    ),
    'taskSpecs', tasks,
    'parallelBatches', batches
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Fixtures: one financier tenant (owner + analyst), a second financier tenant, a company, an
-- advisor and two users with memberships in two organizations of different types.
-- ---------------------------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
)
select id, 'authenticated', 'authenticated', email, '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), false, false
from (values
  ('10000000-0000-4000-8000-000000000f01'::uuid, 'financier-owner@example.invalid'),
  ('10000000-0000-4000-8000-000000000f02'::uuid, 'financier-analyst@example.invalid'),
  ('10000000-0000-4000-8000-000000000f03'::uuid, 'other-financier@example.invalid'),
  ('10000000-0000-4000-8000-000000000f04'::uuid, 'company-owner@example.invalid'),
  ('10000000-0000-4000-8000-000000000f05'::uuid, 'advisor-owner@example.invalid'),
  ('10000000-0000-4000-8000-000000000f06'::uuid, 'multi-financier-first@example.invalid'),
  ('10000000-0000-4000-8000-000000000f07'::uuid, 'multi-company-first@example.invalid')
) fixture(id, email);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000f01', 'capital_provider', 'Gestora Horizonte Crédito', '10000000-0000-4000-8000-000000000f01'),
  ('20000000-0000-4000-8000-000000000f02', 'capital_provider', 'Outro Fundo de Crédito', '10000000-0000-4000-8000-000000000f03'),
  ('20000000-0000-4000-8000-000000000f03', 'company', 'Companhia Emissora', '10000000-0000-4000-8000-000000000f04'),
  ('20000000-0000-4000-8000-000000000f04', 'originator', 'Assessoria de Dívida', '10000000-0000-4000-8000-000000000f05');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at, created_at) values
  ('20000000-0000-4000-8000-000000000f01', '10000000-0000-4000-8000-000000000f01', 'owner', 'active', now(), now() - interval '10 days'),
  ('20000000-0000-4000-8000-000000000f01', '10000000-0000-4000-8000-000000000f02', 'analyst', 'active', now(), now() - interval '9 days'),
  ('20000000-0000-4000-8000-000000000f02', '10000000-0000-4000-8000-000000000f03', 'owner', 'active', now(), now() - interval '10 days'),
  ('20000000-0000-4000-8000-000000000f03', '10000000-0000-4000-8000-000000000f04', 'owner', 'active', now(), now() - interval '10 days'),
  ('20000000-0000-4000-8000-000000000f04', '10000000-0000-4000-8000-000000000f05', 'owner', 'active', now(), now() - interval '10 days'),
  -- Multi-membership: the oldest membership is the displayed workspace.
  ('20000000-0000-4000-8000-000000000f01', '10000000-0000-4000-8000-000000000f06', 'admin', 'active', now(), now() - interval '5 days'),
  ('20000000-0000-4000-8000-000000000f03', '10000000-0000-4000-8000-000000000f06', 'admin', 'active', now(), now() - interval '1 day'),
  ('20000000-0000-4000-8000-000000000f03', '10000000-0000-4000-8000-000000000f07', 'admin', 'active', now(), now() - interval '5 days'),
  ('20000000-0000-4000-8000-000000000f01', '10000000-0000-4000-8000-000000000f07', 'admin', 'active', now(), now() - interval '1 day');

insert into public.onboarding_progress (organization_id, user_id, journey, current_step, answers, completed_at) values
  ('20000000-0000-4000-8000-000000000f01', '10000000-0000-4000-8000-000000000f01', 'capital_provider', 'organization', '{}'::jsonb, null),
  -- Legacy financier workspace: onboarding completed through the mandate path, no terms accepted.
  ('20000000-0000-4000-8000-000000000f02', '10000000-0000-4000-8000-000000000f03', 'capital_provider', 'complete', '{}'::jsonb, now() - interval '30 days'),
  ('20000000-0000-4000-8000-000000000f03', '10000000-0000-4000-8000-000000000f04', 'company', 'organization', '{}'::jsonb, null),
  ('20000000-0000-4000-8000-000000000f04', '10000000-0000-4000-8000-000000000f05', 'originator', 'organization', '{}'::jsonb, null),
  ('20000000-0000-4000-8000-000000000f01', '10000000-0000-4000-8000-000000000f06', 'capital_provider', 'complete', '{}'::jsonb, now() - interval '4 days'),
  ('20000000-0000-4000-8000-000000000f03', '10000000-0000-4000-8000-000000000f07', 'company', 'complete', '{}'::jsonb, now() - interval '4 days');

create temporary table financier_state (
  key text primary key,
  value uuid
) on commit drop;
-- Test scratch state only; the role switches below must be able to record ids in it.
grant select, insert on financier_state to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- 1. Financier owner: onboarding through the analytical entry, terms with no representation
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000f01","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  bootstrap jsonb;
  onboarding jsonb;
  entry jsonb;
begin
  bootstrap := public.get_workspace_bootstrap();
  if bootstrap #>> '{organization,id}' <> '20000000-0000-4000-8000-000000000f01'
    or bootstrap #>> '{organization,organization_type}' <> 'capital_provider'
    or (bootstrap ->> 'workspace_ready')::boolean then
    raise exception 'financier bootstrap before onboarding is wrong: %', bootstrap;
  end if;

  onboarding := public.get_onboarding_bootstrap('pt-BR');
  if onboarding -> 'legal_document' is null
    or (onboarding ->> 'terms_accepted')::boolean
    or onboarding #>> '{legal_document,information_rights_statement}' not like 'Confirmo que minha organização está autorizada a usar as informações%'
    or onboarding #>> '{legal_document,information_rights_statement}' like '%em nome da companhia%' then
    raise exception 'financier onboarding must show the workspace terms with an information-usage declaration and no representation: %', onboarding -> 'legal_document';
  end if;

  entry := public.start_financier_analytical_workspace_v1('pt-BR', 'Ana Analista', 'Analista de crédito', true, true);
  if entry ->> 'organization_id' <> '20000000-0000-4000-8000-000000000f01' or not (entry ->> 'workspace_ready')::boolean then
    raise exception 'financier analytical entry did not complete: %', entry;
  end if;

  bootstrap := public.get_workspace_bootstrap();
  if not (bootstrap ->> 'workspace_ready')::boolean
    or bootstrap #>> '{onboarding,answers,workspace_entry}' <> 'own_analysis' then
    raise exception 'financier workspace is not ready after the analytical entry: %', bootstrap;
  end if;
  if (select count(*) from public.funds where organization_id = '20000000-0000-4000-8000-000000000f01') <> 0
    or (select count(*) from public.mandate_versions where organization_id = '20000000-0000-4000-8000-000000000f01') <> 0 then
    raise exception 'the analytical entry must not create funds or mandates';
  end if;
end;
$$;

-- The entry is not repeatable once onboarding is complete.
select pg_temp.expect_sqlstate(
  $$select public.start_financier_analytical_workspace_v1('pt-BR', 'Ana Analista', 'Analista de crédito', true, true)$$,
  array['P0002'], 'repeated financier entry'
);

set local role postgres;
do $$
declare
  acceptance public.organization_legal_acceptances;
begin
  select * into acceptance
  from public.organization_legal_acceptances
  where organization_id = '20000000-0000-4000-8000-000000000f01';
  if not found
    or acceptance.authority_declared is not null
    or acceptance.terms_agreed is not true
    or acceptance.information_rights_declared is not true
    or acceptance.information_rights_statement <> private.financier_information_rights_statement('pt-BR')
    or acceptance.accepted_by <> '10000000-0000-4000-8000-000000000f01' then
    raise exception 'financier acceptance must record information usage without authority to represent: %', to_jsonb(acceptance);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Financier owner: private project, folder, documents, answer, continuity, own state
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000f01","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  started jsonb;
  replayed jsonb;
  project_id uuid;
  session_id uuid;
  folder_id uuid;
  document_id uuid := '50000000-0000-4000-8000-000000000f01';
  registered jsonb;
  removed jsonb;
  answered jsonb;
  renamed jsonb;
  public_project_id uuid;
  public_session_id uuid;
  authorized uuid;
  session_row public.document_intake_sessions;
begin
  started := public.start_advisor_project_v1(
    '30000000-0000-4000-8000-000000000f01', 'pt-BR', 'Revisão da oportunidade Farol', 'review_existing_operation',
    'Recebi a proposta da Companhia Farol e quero uma leitura própria antes do comitê.',
    'authorized_private', pg_temp.plan_for('review_existing_operation')
  );
  project_id := (started ->> 'capital_project_id')::uuid;
  session_id := (started ->> 'intake_session_id')::uuid;
  insert into financier_state (key, value) values ('project', project_id), ('session', session_id);

  select * into session_row from public.document_intake_sessions where id = session_id;
  if started ->> 'replayed' <> 'false'
    or session_row.organization_id <> '20000000-0000-4000-8000-000000000f01'
    or session_row.journey <> 'capital_provider'
    or session_row.representation_status <> 'not_claimed'
    or session_row.representation_kind is not null
    or session_row.privacy_status <> 'private'
    or (select access_basis from public.capital_projects where id = project_id) <> 'authorized_private'
    or (select count(*) from public.capital_project_plans where capital_project_id = project_id and status = 'active') <> 1
    or (select workspace_group_id from public.capital_projects where id = project_id) is null
    or (select count(*) from public.agent_messages where intake_session_id = session_id) <> 2 then
    raise exception 'financier project was not created as its own analysis: % / %', started, to_jsonb(session_row);
  end if;

  replayed := public.start_advisor_project_v1(
    '30000000-0000-4000-8000-000000000f01', 'pt-BR', 'Ignorado', 'review_existing_operation', 'Replay ignorado',
    'authorized_private', pg_temp.plan_for('review_existing_operation')
  );
  if replayed ->> 'replayed' <> 'true' or replayed ->> 'capital_project_id' <> project_id::text then
    raise exception 'financier project creation was not idempotent: %', replayed;
  end if;

  folder_id := public.create_workspace_project_group('Comitê de setembro');
  if (select organization_id from public.workspace_project_groups where id = folder_id) <> '20000000-0000-4000-8000-000000000f01' then
    raise exception 'financier folder landed in the wrong tenant';
  end if;

  registered := public.register_intake_document_command(
    '20000000-0000-4000-8000-000000000f01', session_id, '60000000-0000-4000-8000-000000000f01', document_id,
    'opportunity-documents',
    '20000000-0000-4000-8000-000000000f01/' || session_id::text || '/' || document_id::text || '-proposta.pdf',
    'proposta.pdf', 'application/pdf', 4096, repeat('a', 64)
  );
  if registered ->> 'id' <> document_id::text or (registered ->> 'duplicate')::boolean then
    raise exception 'financier document was not registered: %', registered;
  end if;
  if (select count(*) from public.source_documents where organization_id = '20000000-0000-4000-8000-000000000f01' and intake_session_id = session_id) <> 1
    or (select count(*) from public.intake_domain_events where intake_session_id = session_id and event_type = 'document_received') <> 1 then
    raise exception 'financier cannot read its own registered document or receipt';
  end if;

  removed := public.remove_intake_document_command(
    '20000000-0000-4000-8000-000000000f01', session_id, '60000000-0000-4000-8000-000000000f02', document_id
  );
  if (select count(*) from public.source_documents where intake_session_id = session_id) <> 0 then
    raise exception 'financier document removal did not take effect: %', removed;
  end if;
  registered := public.register_intake_document_command(
    '20000000-0000-4000-8000-000000000f01', session_id, '60000000-0000-4000-8000-000000000f03', '50000000-0000-4000-8000-000000000f02',
    'opportunity-documents',
    '20000000-0000-4000-8000-000000000f01/' || session_id::text || '/50000000-0000-4000-8000-000000000f02-balanco.xlsx',
    'balanco.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 8192, repeat('b', 64)
  );
  insert into financier_state (key, value) values ('document', '50000000-0000-4000-8000-000000000f02');

  answered := public.record_intake_information_command(
    '20000000-0000-4000-8000-000000000f01', session_id, '60000000-0000-4000-8000-000000000f04',
    'case_review_feedback', 'A garantia informada não bate com o contrato anexado.', 'provided', null
  );
  if answered ->> 'replayed' <> 'false' then
    raise exception 'financier answer was not recorded: %', answered;
  end if;

  renamed := public.manage_workspace_project(session_id, 'rename', 'Revisão Farol, comitê de setembro');
  if renamed ->> 'action' <> 'renamed'
    or (select project_name from public.document_intake_sessions where id = session_id) <> 'Revisão Farol, comitê de setembro' then
    raise exception 'financier project rename failed: %', renamed;
  end if;
  perform public.update_workspace_project(session_id, 'Revisão Farol', 'identified_restricted');

  -- Own state is readable: session, project, plan, conversation, documents, receipts.
  if (select count(*) from public.document_intake_sessions where id = session_id) <> 1
    or (select count(*) from public.capital_projects where id = project_id) <> 1
    or (select count(*) from public.capital_project_plans where capital_project_id = project_id) <> 1
    or (select count(*) from public.agent_conversations where intake_session_id = session_id) <> 1
    or (select count(*) from public.source_documents where intake_session_id = session_id) <> 1
    or (select count(*) from public.intake_domain_events where intake_session_id = session_id) < 4 then
    raise exception 'financier cannot read the state of its own project';
  end if;

  -- A public-information project promoted to private keeps representation not declared.
  started := public.start_advisor_project_v1(
    '30000000-0000-4000-8000-000000000f02', 'pt-BR', 'Leitura pública da Companhia Farol', 'company_debt_view',
    'Quero entender a Companhia Farol pela ótica de dívida antes de pedir documentos.',
    'public_information', pg_temp.plan_for('company_debt_view')
  );
  public_project_id := (started ->> 'capital_project_id')::uuid;
  public_session_id := (started ->> 'intake_session_id')::uuid;
  insert into financier_state (key, value) values ('public_project', public_project_id);
  authorized := public.authorize_capital_project_private_work(public_project_id, true);
  select * into session_row from public.document_intake_sessions where id = public_session_id;
  if authorized <> public_project_id
    or (select access_basis from public.capital_projects where id = public_project_id) <> 'authorized_private'
    or session_row.privacy_status <> 'private'
    or session_row.representation_status <> 'not_claimed'
    or session_row.representation_kind is not null
    or (select count(*) from public.project_representation_evidence where intake_session_id = public_session_id) <> 0 then
    raise exception 'promoting a financier project to private must not declare representation: %', to_jsonb(session_row);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Financier owner: origination, representation, disclosure and introduction stay closed
-- ---------------------------------------------------------------------------------------------

select pg_temp.expect_sqlstate(
  format($$select public.start_advisor_project_v1('30000000-0000-4000-8000-000000000f03', 'pt-BR', 'Tese de originação', 'origination_thesis', 'Reunião com a companhia para originar um mandato.', 'public_information', %L::jsonb)$$, pg_temp.plan_for('origination_thesis')),
  array['42501'], 'financier origination thesis'
);
select pg_temp.expect_sqlstate(
  format($$select public.start_workspace_capital_project_v2('pt-BR', 'Captação legada', 'identified_restricted', true, 'capital_planning', %L::jsonb)$$, pg_temp.plan_for('capital_planning')),
  array['42501'], 'financier representation-declared project'
);
select pg_temp.expect_sqlstate(
  $$select public.start_public_onboarding_capital_project('pt-BR', 'Companhia pública', 'company_debt_view', 'Companhia Alvo', 'https://alvo.example')$$,
  array['42501'], 'financier public company view entry'
);
select pg_temp.expect_sqlstate(
  format($$select public.set_intake_operation_context_command('20000000-0000-4000-8000-000000000f01', %L, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), null, gen_random_uuid(), gen_random_uuid(), 'working_capital', 'high', 'Contexto de operação declarado pela organização.', '{}'::text[], null, null, null)$$,
    (select value from financier_state where key = 'session')),
  array['42501'], 'financier operation context (member organization as borrower)'
);
select pg_temp.expect_sqlstate(
  format($$select public.record_intake_capital_need_command('20000000-0000-4000-8000-000000000f01', %L, gen_random_uuid(), 'working_capital')$$,
    (select value from financier_state where key = 'session')),
  array['42501'], 'financier capital need declaration'
);
select pg_temp.expect_sqlstate(
  format($$select public.confirm_document_intake('20000000-0000-4000-8000-000000000f01', %L, 'pt-BR')$$,
    (select value from financier_state where key = 'session')),
  array['42501'], 'financier opportunity confirmation'
);
select pg_temp.expect_sqlstate(
  format($$select public.attach_intake_session_to_opportunity('20000000-0000-4000-8000-000000000f01', %L, gen_random_uuid())$$,
    (select value from financier_state where key = 'session')),
  array['42501'], 'financier opportunity attachment'
);
select pg_temp.expect_sqlstate(
  format($$select public.prepare_qualified_introduction_plan('20000000-0000-4000-8000-000000000f01', %L, %L)$$,
    (select value from financier_state where key = 'session'), repeat('c', 64)),
  array['42501'], 'financier qualified introduction'
);
select pg_temp.expect_sqlstate(
  format($$select public.verify_advisor_authorization_command('20000000-0000-4000-8000-000000000f01', %L, gen_random_uuid(), 'Comprovação enviada')$$,
    (select value from financier_state where key = 'session')),
  array['22023', '42501', '55000'], 'financier advisor authorization verification'
);
select pg_temp.expect_sqlstate(
  format($$select public.revoke_advisor_authorization_command('20000000-0000-4000-8000-000000000f01', %L, gen_random_uuid(), 'Sem autorização')$$,
    (select value from financier_state where key = 'session')),
  array['22023', '42501', '55000'], 'financier advisor authorization revocation'
);

-- Tampered file bindings: another tenant's path, or another session's path, under the same command.
select pg_temp.expect_sqlstate(
  format($$select public.register_intake_document_command('20000000-0000-4000-8000-000000000f01', %L, gen_random_uuid(), gen_random_uuid(), 'opportunity-documents', '20000000-0000-4000-8000-000000000f02/' || %L || '/hijack.pdf', 'hijack.pdf', 'application/pdf', 10, repeat('d', 64))$$,
    (select value from financier_state where key = 'session'), (select value from financier_state where key = 'session')),
  array['22023'], 'file bound to another tenant path'
);
select pg_temp.expect_sqlstate(
  format($$select public.register_intake_document_command('20000000-0000-4000-8000-000000000f01', %L, gen_random_uuid(), gen_random_uuid(), 'opportunity-documents', '20000000-0000-4000-8000-000000000f01/40000000-0000-4000-8000-0000000000ff/hijack.pdf', 'hijack.pdf', 'application/pdf', 10, repeat('d', 64))$$,
    (select value from financier_state where key = 'session')),
  array['22023'], 'file bound to another session path'
);

-- Organization switch inside the command: the session belongs to the financier, the tenant argument does not.
select pg_temp.expect_sqlstate(
  format($$select public.register_intake_document_command('20000000-0000-4000-8000-000000000f02', %L, gen_random_uuid(), gen_random_uuid(), 'opportunity-documents', '20000000-0000-4000-8000-000000000f02/' || %L || '/switch.pdf', 'switch.pdf', 'application/pdf', 10, repeat('e', 64))$$,
    (select value from financier_state where key = 'session'), (select value from financier_state where key = 'session')),
  array['42501'], 'organization switch on document registration'
);
select pg_temp.expect_sqlstate(
  format($$select public.record_intake_information_command('20000000-0000-4000-8000-000000000f03', %L, gen_random_uuid(), 'case_review_feedback', 'Troca de organização', 'provided', null)$$,
    (select value from financier_state where key = 'session')),
  array['42501'], 'organization switch on answer'
);

-- ---------------------------------------------------------------------------------------------
-- 4. Financier analyst: reads the tenant's work, cannot accept terms for it; revoked afterwards
-- ---------------------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000f02","role":"authenticated","aal":"aal1"}', true);
do $$
begin
  if (select count(*) from public.document_intake_sessions where id = (select value from financier_state where key = 'session')) <> 1 then
    raise exception 'an active analyst of the financier tenant must read its sessions';
  end if;
end;
$$;
select pg_temp.expect_sqlstate(
  $$select public.accept_private_workspace_terms('pt-BR', 'Bruno Analista', 'Analista', true, true)$$,
  array['42501'], 'analyst accepting workspace terms outside onboarding'
);

set local role postgres;
update public.organization_memberships set status = 'revoked'
where organization_id = '20000000-0000-4000-8000-000000000f01' and user_id = '10000000-0000-4000-8000-000000000f02';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000f02","role":"authenticated","aal":"aal1"}', true);

select pg_temp.expect_sqlstate($$select public.get_workspace_bootstrap()$$, array['P0002'], 'revoked member bootstrap');
select pg_temp.expect_sqlstate(
  format($$select public.register_intake_document_command('20000000-0000-4000-8000-000000000f01', %L, gen_random_uuid(), gen_random_uuid(), 'opportunity-documents', '20000000-0000-4000-8000-000000000f01/' || %L || '/revoked.pdf', 'revoked.pdf', 'application/pdf', 10, repeat('f', 64))$$,
    (select value from financier_state where key = 'session'), (select value from financier_state where key = 'session')),
  array['42501'], 'revoked member document registration'
);
do $$
begin
  if (select count(*) from public.document_intake_sessions where id = (select value from financier_state where key = 'session')) <> 0
    or (select count(*) from public.source_documents where intake_session_id = (select value from financier_state where key = 'session')) <> 0 then
    raise exception 'a revoked member still reads the tenant''s sessions or documents';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Other financier tenant: ids of the first tenant are refused; legacy terms path
-- ---------------------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000f03","role":"authenticated","aal":"aal1"}', true);

do $$
begin
  if (select count(*) from public.document_intake_sessions where id = (select value from financier_state where key = 'session')) <> 0
    or (select count(*) from public.capital_projects where id = (select value from financier_state where key = 'project')) <> 0
    or (select count(*) from public.source_documents where intake_session_id = (select value from financier_state where key = 'session')) <> 0
    or (select count(*) from public.workspace_project_groups where organization_id = '20000000-0000-4000-8000-000000000f01') <> 0 then
    raise exception 'another tenant reads the financier''s project, session, documents or folders';
  end if;
end;
$$;
select pg_temp.expect_sqlstate(
  format($$select public.register_intake_document_command('20000000-0000-4000-8000-000000000f01', %L, gen_random_uuid(), gen_random_uuid(), 'opportunity-documents', '20000000-0000-4000-8000-000000000f01/' || %L || '/other.pdf', 'other.pdf', 'application/pdf', 10, repeat('1', 64))$$,
    (select value from financier_state where key = 'session'), (select value from financier_state where key = 'session')),
  array['42501'], 'other tenant registering into the financier session'
);
select pg_temp.expect_sqlstate(
  format($$select public.record_intake_information_command('20000000-0000-4000-8000-000000000f02', %L, gen_random_uuid(), 'case_review_feedback', 'Outra organização', 'provided', null)$$,
    (select value from financier_state where key = 'session')),
  array['P0002'], 'other tenant answering with its own tenant id and a foreign session id'
);
select pg_temp.expect_sqlstate(
  format($$select public.authorize_capital_project_private_work(%L, true)$$, (select value from financier_state where key = 'project')),
  array['P0002'], 'other tenant authorizing the financier project'
);
select pg_temp.expect_sqlstate(
  format($$select public.manage_workspace_project(%L, 'rename', 'Sequestro')$$, (select value from financier_state where key = 'session')),
  array['P0002'], 'other tenant renaming the financier project'
);

-- Legacy financier workspace (onboarding completed through the mandate path, no acceptance):
-- private work waits for the terms; an owner records them from the workspace; the record carries
-- the information-usage declaration in the locale of acceptance.
select pg_temp.expect_sqlstate(
  format($$select public.start_advisor_project_v1('30000000-0000-4000-8000-000000000f04', 'en-US', 'Private review without terms', 'review_existing_operation', 'Review this proposal before the committee.', 'authorized_private', %L::jsonb)$$, pg_temp.plan_for('review_existing_operation')),
  array['42501'], 'legacy financier private project before the terms'
);
do $$
declare
  started jsonb;
  project_id uuid;
begin
  started := public.start_advisor_project_v1(
    '30000000-0000-4000-8000-000000000f05', 'en-US', 'Public view before the terms', 'company_debt_view',
    'Understand the target company through a debt lens.', 'public_information', pg_temp.plan_for('company_debt_view')
  );
  project_id := (started ->> 'capital_project_id')::uuid;
  insert into financier_state (key, value) values ('legacy_public_project', project_id);
  if (select organization_id from public.capital_projects where id = project_id) <> '20000000-0000-4000-8000-000000000f02' then
    raise exception 'legacy financier public project landed in the wrong tenant';
  end if;
end;
$$;
select pg_temp.expect_sqlstate(
  format($$select public.authorize_capital_project_private_work(%L, true)$$, (select value from financier_state where key = 'legacy_public_project')),
  array['42501'], 'legacy financier private document without accepted terms'
);
do $$
declare
  acceptance_id uuid;
  setup jsonb;
begin
  setup := public.get_workspace_project_setup('en-US');
  if (setup ->> 'terms_accepted')::boolean
    or setup #>> '{legal_document,information_rights_statement}' not like 'I confirm that my organization is authorized to use the information%' then
    raise exception 'legacy financier workspace setup must offer the terms with the information-usage declaration: %', setup;
  end if;
  acceptance_id := public.accept_private_workspace_terms('en-US', 'Xavier Gestor', 'Portfolio manager', true, true);
  setup := public.get_workspace_project_setup('en-US');
  if not (setup ->> 'terms_accepted')::boolean then
    raise exception 'legacy financier acceptance was not recorded for the displayed workspace';
  end if;
  if public.authorize_capital_project_private_work((select value from financier_state where key = 'legacy_public_project'), true)
    <> (select value from financier_state where key = 'legacy_public_project') then
    raise exception 'legacy financier private work was not authorized after the terms';
  end if;
end;
$$;
set local role postgres;
do $$
declare
  acceptance public.organization_legal_acceptances;
begin
  select * into acceptance from public.organization_legal_acceptances where organization_id = '20000000-0000-4000-8000-000000000f02';
  if not found
    or acceptance.locale <> 'en-US'
    or acceptance.authority_declared is not null
    or acceptance.information_rights_statement <> private.financier_information_rights_statement('en-US')
    or acceptance.accepted_by <> '10000000-0000-4000-8000-000000000f03' then
    raise exception 'legacy financier acceptance is wrong: %', to_jsonb(acceptance);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Multiple memberships resolve to the displayed organization, never to another one
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000f06","role":"authenticated","aal":"aal1"}', true);
do $$
declare
  bootstrap jsonb := public.get_workspace_bootstrap();
  started jsonb;
  folder_id uuid;
begin
  if bootstrap #>> '{organization,id}' <> '20000000-0000-4000-8000-000000000f01' then
    raise exception 'oldest membership must be the displayed workspace: %', bootstrap;
  end if;
  started := public.start_advisor_project_v1(
    '30000000-0000-4000-8000-000000000f06', 'pt-BR', 'Planejamento no financiador', 'capital_planning',
    'Comparar alternativas para a companhia analisada.', 'public_information', pg_temp.plan_for('capital_planning')
  );
  folder_id := public.create_workspace_project_group('Pasta do financiador');
  if (select organization_id from public.capital_projects where id = (started ->> 'capital_project_id')::uuid) <> '20000000-0000-4000-8000-000000000f01'
    or (select organization_id from public.workspace_project_groups where id = folder_id) <> '20000000-0000-4000-8000-000000000f01' then
    raise exception 'creation switched to a different membership than the displayed one';
  end if;
end;
$$;
-- The displayed workspace lacks representation; the company membership must not be used instead.
select pg_temp.expect_sqlstate(
  format($$select public.start_workspace_capital_project_v2('pt-BR', 'Captação pela outra membership', 'identified_restricted', true, 'capital_planning', %L::jsonb)$$, pg_temp.plan_for('capital_planning')),
  array['42501'], 'representation through a non-displayed membership'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000f07","role":"authenticated","aal":"aal1"}', true);
do $$
declare
  bootstrap jsonb := public.get_workspace_bootstrap();
  started jsonb;
begin
  if bootstrap #>> '{organization,id}' <> '20000000-0000-4000-8000-000000000f03' then
    raise exception 'oldest membership must be the displayed workspace (company first): %', bootstrap;
  end if;
  started := public.start_advisor_project_v1(
    '30000000-0000-4000-8000-000000000f07', 'pt-BR', 'Planejamento na companhia', 'capital_planning',
    'Comparar alternativas de financiamento da companhia.', 'public_information', pg_temp.plan_for('capital_planning')
  );
  if (select organization_id from public.capital_projects where id = (started ->> 'capital_project_id')::uuid) <> '20000000-0000-4000-8000-000000000f03'
    or (select journey from public.document_intake_sessions where id = (started ->> 'intake_session_id')::uuid) <> 'company' then
    raise exception 'company-first user created outside the displayed company workspace';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. Company and advisor regressions: terms, representation and origination unchanged
-- ---------------------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000f04","role":"authenticated","aal":"aal1"}', true);
do $$
declare
  acceptance_id uuid;
  session_id uuid;
  session_row public.document_intake_sessions;
begin
  acceptance_id := public.accept_private_workspace_terms('pt-BR', 'Carla Financeira', 'Diretora financeira', true, true);
  session_id := public.start_workspace_capital_project_v2('pt-BR', 'Captação da Companhia', 'identified_restricted', true, 'capital_planning', pg_temp.plan_for('capital_planning'));
  select * into session_row from public.document_intake_sessions where id = session_id;
  if session_row.organization_id <> '20000000-0000-4000-8000-000000000f03'
    or session_row.journey <> 'company'
    or session_row.representation_kind <> 'company'
    or session_row.representation_status <> 'declared'
    or (select count(*) from public.project_representation_evidence where intake_session_id = session_id and representation_kind = 'company') <> 1 then
    raise exception 'company representation path changed: %', to_jsonb(session_row);
  end if;
end;
$$;
set local role postgres;
do $$
declare
  acceptance public.organization_legal_acceptances;
begin
  select * into acceptance from public.organization_legal_acceptances where organization_id = '20000000-0000-4000-8000-000000000f03';
  if not found
    or acceptance.authority_declared is not true
    or acceptance.information_rights_statement = private.financier_information_rights_statement('pt-BR')
    or acceptance.information_rights_statement <> (
      select document.information_rights_statement from public.platform_legal_documents document
      where document.document_key = 'private_workspace_terms' and document.locale = 'pt-BR' and document.status = 'active'
      order by document.effective_at desc limit 1
    ) then
    raise exception 'company acceptance changed: %', to_jsonb(acceptance);
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000f05","role":"authenticated","aal":"aal1"}', true);
do $$
declare
  started jsonb;
  session_id uuid;
  session_row public.document_intake_sessions;
begin
  started := public.start_advisor_project_v1(
    '30000000-0000-4000-8000-000000000f08', 'pt-BR', 'Tese para a reunião', 'origination_thesis',
    'Reunião com a Companhia Farol para chegar com leitura própria.', 'public_information', pg_temp.plan_for('origination_thesis')
  );
  if started ->> 'replayed' <> 'false'
    or (select journey from public.document_intake_sessions where id = (started ->> 'intake_session_id')::uuid) <> 'originator' then
    raise exception 'advisor origination thesis changed: %', started;
  end if;
  perform public.accept_private_workspace_terms('pt-BR', 'Daniel Assessor', 'Sócio', true, true);
  session_id := public.start_workspace_capital_project_v2('pt-BR', 'Captação assessorada', 'identified_restricted', true, 'capital_planning', pg_temp.plan_for('capital_planning'));
  select * into session_row from public.document_intake_sessions where id = session_id;
  if session_row.representation_kind <> 'advisor' or session_row.representation_status <> 'declared' then
    raise exception 'advisor representation path changed: %', to_jsonb(session_row);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 8. Anonymous: nothing
-- ---------------------------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '', true);
select pg_temp.expect_sqlstate($$select public.get_workspace_bootstrap()$$, array['42501'], 'anonymous bootstrap');
select pg_temp.expect_sqlstate(
  format($$select public.start_advisor_project_v1(gen_random_uuid(), 'pt-BR', 'Anônimo', 'capital_planning', 'Sem identidade.', 'public_information', %L::jsonb)$$, pg_temp.plan_for('capital_planning')),
  array['42501'], 'anonymous project creation'
);
select pg_temp.expect_sqlstate($$select count(*) from public.document_intake_sessions$$, array['42501'], 'anonymous session read');
select pg_temp.expect_sqlstate(
  $$select public.start_financier_analytical_workspace_v1('pt-BR', 'Anônimo', 'Ninguém', true, true)$$,
  array['42501'], 'anonymous financier entry'
);

rollback;
