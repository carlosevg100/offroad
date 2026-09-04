-- Every failed job must explain itself. The classifier reads the cause the worker writes now and
-- the shapes that older rows carry, so the taxonomy covers the whole history.

begin;

do $$
declare
  cls text;
begin
  -- The envelope the worker writes since Phase 0.
  cls := private.job_failure_class('{"code":"agent_processing_failed","cause":{"name":"TypeError","class":"worker_error","message":"cannot read properties of undefined"}}'::jsonb);
  if cls <> 'worker_error' then raise exception 'cause.class was not honoured: %', cls; end if;

  -- The shapes production carried before the envelope existed.
  if private.job_failure_class('{"code":"budget_exceeded","spend":{"costUsd":15}}'::jsonb) <> 'budget' then raise exception 'budget not classified'; end if;
  if private.job_failure_class('{"code":"all_attempts_failed","model_lineage":[]}'::jsonb) <> 'model_exhausted' then raise exception 'gateway exhaustion not classified'; end if;
  if private.job_failure_class('{"code":"quality_gate_m07_failed"}'::jsonb) <> 'quality_gate' then raise exception 'quality gate not classified'; end if;
  if private.job_failure_class('{"code":"invalid_case_input","reason":"case_analysis_failed","validation":{"issueCount":1}}'::jsonb) <> 'invalid_input' then raise exception 'invalid input not classified'; end if;
  if private.job_failure_class('{"reason":"worker_error","message":"[ { \"code\": \"unrecognized_keys\", \"keys\": [ \"requestHash\" ] } ]"}'::jsonb) <> 'schema_mismatch' then raise exception 'schema mismatch not classified'; end if;
  if private.job_failure_class('{"reason":"worker_error","message":"worker_record_retrieval_chunks failed: canceling statement due to statement timeout"}'::jsonb) <> 'db_timeout' then raise exception 'db timeout not classified'; end if;
  if private.job_failure_class('{"reason":"worker_error","message":"worker_record_candidates failed: null value in column \"normalized_value\" violates not-null constraint"}'::jsonb) <> 'db_constraint' then raise exception 'db constraint not classified'; end if;
  if private.job_failure_class('{"reason":"transient_error","message":"fetch failed"}'::jsonb) <> 'transient' then raise exception 'transient not classified'; end if;
  if private.job_failure_class('{"reason":"infected","signature":"x"}'::jsonb) <> 'authorization' then raise exception 'infected file not classified'; end if;

  -- A bare category is the defect Phase 0 removes: it has no cause.
  if private.job_failure_class('{"code":"agent_processing_failed","spend":{"costUsd":0.02}}'::jsonb) <> 'unclassified' then raise exception 'bare category should be unclassified'; end if;
  if private.job_failure_has_cause('{"code":"agent_processing_failed","spend":{"costUsd":0.02}}'::jsonb) then raise exception 'bare category counted as a cause'; end if;
  if private.job_failure_has_cause('{"reason":"case_analysis_failed","code":"case_analysis_failed"}'::jsonb) then raise exception 'circular reason counted as a cause'; end if;
  if not private.job_failure_has_cause('{"code":"x","cause":{"name":"Error","class":"worker_error","message":"boom"}}'::jsonb) then raise exception 'envelope not counted as a cause'; end if;
  if not private.job_failure_has_cause('{"code":"budget_exceeded"}'::jsonb) then raise exception 'self-explaining gateway code not counted as a cause'; end if;
  if private.job_failure_has_cause(null) or private.job_failure_has_cause('{}'::jsonb) then raise exception 'empty error counted as a cause'; end if;
end;
$$;

-- The views stay out of reach of tenant roles: they are operator surfaces.
do $$
begin
  if has_table_privilege('authenticated', 'private.failures_without_cause', 'select')
    or has_table_privilege('anon', 'private.job_failure_causes', 'select')
    or has_table_privilege('authenticated', 'private.run_metrics_by_pipeline', 'select')
    or has_function_privilege('authenticated', 'private.job_failure_class(jsonb)', 'execute') then
    raise exception 'observability views leaked to tenant roles';
  end if;
end;
$$;

select 'job_failure_causes_passed' as result;

rollback;
