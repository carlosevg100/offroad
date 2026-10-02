-- No privileged recipe/seal/TaskRun writes. Actual human-authorized worker command.
set local role authenticated;
do $$declare f record;n jsonb;s jsonb;begin
 select * into strict f from debt_recipe_fixture;select v into strict n from agent_fixture where k='debt_render_product_2';
 s:=public.worker_finalize_capital_debt_recipe_v1(f.job_id,f.capability,(f.base->>'recipeId')::uuid,(f.retention->>'retainedPayloadId')::uuid,n->'components',n->>'inputFingerprint',n->>'promptFingerprint',n->>'primaryRequestFingerprint',n->>'fallbackRequestFingerprint',750000,2,'succeeded');
 if s->>'executionPlanTaskId'<>'M06' or s->>'finalTaskId'<>'C11' or(s#>>'{operationalBudget,maxExposureMicroUsd}')::bigint<>750000 then raise exception 'debt_native_execution_plan_or_budget_wrong';end if;
 insert into debt_proof values('native_recipe',s),('parsed_body',n->'parsed'),('parsed_fingerprint',to_jsonb(n->>'outputFingerprint'));
 raise notice 'PASS debt_human_licensed_source_shared_renderer_real_M06_sealed_before_paid_invocation';
end$$;
reset role;
\ir capital_debt_execution_ledger_proof.sql
