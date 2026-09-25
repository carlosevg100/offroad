-- Production model ceilings held by the database, raised to the values the code now derives.
-- Every model attempt reserves the calibrated upper bound of its whole request before it is
-- sent, and the ceilings below were sized for the former, smaller estimate. Each value is the
-- one derived in packages/model-gateway/src/production-budgets.ts; the worker enforces the
-- smaller of that ceiling and the budget written here, so the database must grant at least it.
--
-- One patch per function, rewriting its current body by text. The old text must be present
-- exactly as many times as stated, or the migration stops with a named *_contract_changed
-- exception. Only numbers change: signatures, grants, security mode and search_path are kept
-- and no object is created. Recorded spend and the organization's monthly ceiling are untouched.

-- Origination thesis, job payload and run budget: from 1.50 to 1.55 (originationThesis).
-- Text from 20260903215610_origination_completion_headroom.sql, lines 17 and 25.
do $origination$
declare
  body text;
  old_text constant text := $old$to_jsonb(1.50::numeric),$old$;
  new_text constant text := $new$to_jsonb(1.55::numeric),$new$;
begin
  select pg_get_functiondef('private.normalize_origination_runtime_budget_v1()'::regprocedure) into body;
  if (length(body) - length(replace(body, old_text, ''))) / length(old_text) <> 2 then
    raise exception 'origination_runtime_budget_contract_changed';
  end if;
  execute replace(body, old_text, new_text);
end $origination$;

-- Integration preview job: from 0.50 to 0.60 (integrationPreview).
-- Text from 20260905175807_integration_preview_run_budget_v2.sql, line 345.
do $preview$
declare
  body text;
  old_text constant text := $old$'model_budget', jsonb_build_object('max_cost_usd', 0.50, 'max_calls', 4),$old$;
  new_text constant text := $new$'model_budget', jsonb_build_object('max_cost_usd', 0.60, 'max_calls', 4),$new$;
begin
  select pg_get_functiondef('private.worker_activate_integration_preview_run_v1(uuid,text,uuid,jsonb)'::regprocedure) into body;
  if (length(body) - length(replace(body, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'integration_preview_run_budget_contract_changed';
  end if;
  execute replace(body, old_text, new_text);
end $preview$;

-- Defaults of a processing run, which the database's own callers start with '{}': run from 5 to
-- 16, document from 0.75 to 1.60, case from 1 to 3.10 (productionRunBudget, the budget the web
-- app sends). Text from 20260829003002_economic_pipeline_guardrails.sql, lines 203 to 210; the
-- later rewrite of this function by 20260915204116 does not touch it.
do $run_defaults$
declare
  body text;
  old_text constant text := $old$effective_budget := jsonb_build_object(
    'max_cost_usd', 5,
    'max_calls', 160,
    'document_max_cost_usd', 0.75,
    'document_max_calls', 8,
    'case_max_cost_usd', 1,
    'case_max_calls', 4
  ) || coalesce(p_budget, '{}'::jsonb);$old$;
  new_text constant text := $new$effective_budget := jsonb_build_object(
    'max_cost_usd', 16,
    'max_calls', 160,
    'document_max_cost_usd', 1.60,
    'document_max_calls', 8,
    'case_max_cost_usd', 3.10,
    'case_max_calls', 4
  ) || coalesce(p_budget, '{}'::jsonb);$new$;
begin
  select pg_get_functiondef('private.begin_processing_run(uuid,uuid,text,jsonb,text,jsonb)'::regprocedure) into body;
  if (length(body) - length(replace(body, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'processing_run_budget_contract_changed';
  end if;
  execute replace(body, old_text, new_text);
end $run_defaults$;

-- Case analysis of a run whose budget names no case share: from 1 to 3.10 (caseAnalysis).
-- Text from 20260904040355_preliminary_understanding_completion_budget.sql, line 118; the later
-- rewrite of this function by 20260922155248 does not touch it.
do $primary_case$
declare
  body text;
  old_text constant text := $old$'max_cost_usd', coalesce((run_row.budget->>'case_max_cost_usd')::numeric, 1),$old$;
  new_text constant text := $new$'max_cost_usd', coalesce((run_row.budget->>'case_max_cost_usd')::numeric, 3.10),$new$;
begin
  select pg_get_functiondef('private.enqueue_primary_case_analysis(uuid,uuid,uuid)'::regprocedure) into body;
  if (length(body) - length(replace(body, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'primary_case_budget_contract_changed';
  end if;
  execute replace(body, old_text, new_text);
end $primary_case$;

-- Incremental deal-state analysis: run, its case share and the job, each from 1 to 3.10
-- (caseAnalysis). Text from 20260829211621_enqueue_material_production_from_approved_plan.sql,
-- lines 29 to 36 and 188.
do $incremental_case$
declare
  body text;
  old_run constant text := $old$effective_budget jsonb := jsonb_build_object(
    'max_cost_usd', 1,
    'max_calls', 4,
    'case_max_cost_usd', 1,
    'case_max_calls', 4,
    'document_max_cost_usd', 0,
    'document_max_calls', 0
  );$old$;
  new_run constant text := $new$effective_budget jsonb := jsonb_build_object(
    'max_cost_usd', 3.10,
    'max_calls', 4,
    'case_max_cost_usd', 3.10,
    'case_max_calls', 4,
    'document_max_cost_usd', 0,
    'document_max_calls', 0
  );$new$;
  old_job constant text := $old$'model_budget', jsonb_build_object('max_cost_usd', 1, 'max_calls', 4)$old$;
  new_job constant text := $new$'model_budget', jsonb_build_object('max_cost_usd', 3.10, 'max_calls', 4)$new$;
begin
  select pg_get_functiondef('private.enqueue_incremental_deal_state_analysis(uuid,uuid,text)'::regprocedure) into body;
  if (length(body) - length(replace(body, old_run, ''))) / length(old_run) <> 1
    or (length(body) - length(replace(body, old_job, ''))) / length(old_job) <> 1 then
    raise exception 'incremental_case_budget_contract_changed';
  end if;
  execute replace(replace(body, old_run, new_run), old_job, new_job);
end $incremental_case$;

-- Receivables method refresh run: case share from 1 to 3.10 (caseAnalysis), which
-- enqueue_primary_case_analysis gives the case job, and run from 1.5 to 3.60, still 0.50 above
-- the case share. Text from 20260907054112_receivables_method_complete_refresh.sql, lines 54 to 58.
do $refresh_case$
declare
  body text;
  old_text constant text := $old$refresh_budget jsonb := jsonb_build_object(
    'max_cost_usd',1.5,'max_calls',8,
    'document_max_cost_usd',0.75,'document_max_calls',4,
    'case_max_cost_usd',1,'case_max_calls',4
  );$old$;
  new_text constant text := $new$refresh_budget jsonb := jsonb_build_object(
    'max_cost_usd',3.60,'max_calls',8,
    'document_max_cost_usd',0.75,'document_max_calls',4,
    'case_max_cost_usd',3.10,'case_max_calls',4
  );$new$;
begin
  select pg_get_functiondef('private.worker_enqueue_receivables_method_refresh_v1(uuid,text,text,text)'::regprocedure) into body;
  if (length(body) - length(replace(body, old_text, ''))) / length(old_text) <> 1 then
    raise exception 'receivables_refresh_budget_contract_changed';
  end if;
  execute replace(body, old_text, new_text);
end $refresh_case$;
