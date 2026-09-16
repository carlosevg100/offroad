-- Synthetic dependency-closed plan for workspace identity tests.
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
