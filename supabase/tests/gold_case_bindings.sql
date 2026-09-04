-- A project bound to a frozen source pack: the binding is invisible to tenants and travels in
-- the claim, so the worker reads that pack and nothing else for the project's jobs.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  '10000000-0000-4000-8000-000000000241', 'authenticated', 'authenticated',
  'gold-binding-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), false, false
);

insert into public.organizations (id, organization_type, name, created_by) values (
  '20000000-0000-4000-8000-000000000241', 'originator', 'Gold Binding Workspace',
  '10000000-0000-4000-8000-000000000241'
);
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values (
  '20000000-0000-4000-8000-000000000241',
  '10000000-0000-4000-8000-000000000241', 'owner', 'active', now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000241","role":"authenticated","aal":"aal1"}',
  true
);

select public.save_professional_capability_context_v2(
  '20000000-0000-4000-8000-000000000241',
  array['institutional_work'],
  array['banker'],
  array['investment_banking', 'dcm'],
  array['prepare_meetings'],
  'Banco Gold',
  false
);

reset role;
insert into public.institution_capability_profiles (
  organization_id, institution_name, institution_kind, operating_models, product_families,
  source_kind, disclosure_status, last_confirmed_at, updated_by
) values (
  '20000000-0000-4000-8000-000000000241', 'Banco Gold', 'bank',
  array['structuring'], array['capital_markets'],
  'self_declared', 'complete', now(), '10000000-0000-4000-8000-000000000241'
)
on conflict (organization_id) do update set
  operating_models = excluded.operating_models,
  product_families = excluded.product_families;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000241","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  source_request_id constant uuid := '30000000-0000-4000-8000-000000000241';
  plan_snapshot jsonb;
  started jsonb;
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
    source_request_id, 'pt-BR', 'Reunião Camil', 'origination_thesis',
    'Meu VP pediu material para uma reunião com a Camil sobre refinanciamento.',
    'public_information', plan_snapshot
  );
  perform public.queue_advisor_initial_turn_v1((started ->> 'capital_project_id')::uuid);
  perform set_config('test.capital_project_id', started ->> 'capital_project_id', true);
end;
$$;

-- The binding is an operator decision, written outside the Data API.
reset role;
insert into private.gold_case_bindings (organization_id, capital_project_id, source_pack_id, note) values (
  '20000000-0000-4000-8000-000000000241',
  current_setting('test.capital_project_id')::uuid,
  'gc01-analista-ib-camil',
  'test binding'
);
insert into private.worker_tokens (label, token_sha256)
values ('gold-binding-test', extensions.digest(repeat('g', 64), 'sha256'))
on conflict (token_sha256) do update set status = 'active', revoked_at = null;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000241","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  claim jsonb;
begin
  claim := public.worker_claim_job(repeat('g', 64), 600);
  if (claim ->> 'claimed')::boolean is not true then
    raise exception 'no job was claimed: %', claim;
  end if;
  if claim ->> 'source_pack_id' is distinct from 'gc01-analista-ib-camil' then
    raise exception 'the claim did not carry the bound pack: %', claim;
  end if;
  if has_table_privilege('authenticated', 'private.gold_case_bindings', 'select')
    or has_table_privilege('anon', 'private.gold_case_bindings', 'select') then
    raise exception 'tenants can read the bindings';
  end if;
end;
$$;

select 'gold_case_bindings_passed' as result;

rollback;
