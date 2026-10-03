-- Actual returned C11 worker with finite prior/M06/C09/C10 observations. No
-- pre-existing TaskRun, seal, receipt or model budget is rewritten by this proof.
set local role authenticated;
do $$declare j jsonb;b jsonb;n jsonb;s jsonb;retained jsonb;before uuid;begin
 select v into strict j from debt_revision_human_fixture where k='claim';select v into strict b from debt_revision_human_fixture where k='base';
 select v into strict n from agent_fixture where k='debt_revision_render_product';select v into strict retained from debt_revision_human_fixture where k='context_retained';
 select (v->>'executionPlanTaskRunId')::uuid into before from debt_proof where k='native_recipe';
 s:=public.worker_finalize_capital_debt_recipe_v1((j->>'job_id')::uuid,j->>'capability_token',(b->>'recipeId')::uuid,(retained->>'retainedPayloadId')::uuid,n->'components',n->>'inputFingerprint',n->>'promptFingerprint',n->>'primaryRequestFingerprint',n->>'fallbackRequestFingerprint',850000,1,'succeeded');
 if (s->>'executionPlanTaskRunId')::uuid<>before or(s#>>'{operationalBudget,maxExposureMicroUsd}')::bigint<>850000 or(s#>>'{operationalBudget,maxDispatches}')::integer<>1 then raise exception 'debt_revision_original_M06_or_budget_not_preserved';end if;
 insert into debt_revision_human_fixture values('recipe',s);
 raise notice 'PASS debt_return_same_original_succeeded_M06_distinct_paid_origin_no_research_fixed850k_onecall';
end$$;
do $$declare j jsonb;s jsonb;n jsonb;a jsonb;d jsonb;i jsonb;o jsonb;accepted jsonb;parsed jsonb;final jsonb;fp text;c jsonb;again jsonb;g jsonb;begin
 select v into strict j from debt_revision_human_fixture where k='claim';select v into strict s from debt_revision_human_fixture where k='recipe';select v into strict n from agent_fixture where k='debt_revision_render_product';
 a:=jsonb_build_object('adapterInputVersion','gateway-adapter-input.v1','task','company_debt_view','schemaName','company_debt_diagnostic_v1','requestFingerprint',n->>'primaryRequestFingerprint','inputFingerprint',n->>'inputFingerprint','promptFingerprint',n->>'promptFingerprint','invocationId',gen_random_uuid(),'retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',false,'reservationUsd',0.1);
 d:=public.worker_authorize_capital_debt_processing_v1((j->>'job_id')::uuid,j->>'capability_token',(s->>'recipeId')::uuid,a,pg_temp.debt_route(),array['inference','prompt_cache','schema_cache'],'case_analysis');
 if not(d->>'allowed')::boolean then raise exception 'debt_revision_authorize_denied';end if;
 i:=public.worker_record_capital_debt_input_v1((j->>'job_id')::uuid,j->>'capability_token',(d->>'attemptReceiptId')::uuid);
 if not(i->>'dispatchAllowed')::boolean then raise exception 'debt_revision_first_dispatch_denied';end if;
 o:=pg_temp.debt_outcome(d,i,n->>'outputFingerprint');
 perform public.worker_record_capital_debt_attempt_outcome_v1((j->>'job_id')::uuid,j->>'capability_token',(d->>'attemptReceiptId')::uuid,o);
 accepted:=public.worker_record_capital_debt_accepted_v1((j->>'job_id')::uuid,j->>'capability_token',(i->>'receiptId')::uuid,jsonb_build_object('schemaVersion','gateway-accepted-invocation.v1','adapterInputVersion','gateway-adapter-input.v1','outputFingerprintVersion','gateway-parsed-output.v1','provider','anthropic','configuredModel','claude-sonnet-5','reportedModel','claude-sonnet-5','schemaName','company_debt_diagnostic_v1','invocationId',i->>'invocationId','inputAttestationReceiptId',i->>'receiptId','adapterRequestFingerprint',n->>'primaryRequestFingerprint','inputFingerprint',n->>'inputFingerprint','promptFingerprint',n->>'promptFingerprint','outputFingerprint',n->>'outputFingerprint','retryOrdinal',0,'isSameModelRepair',false,'fromCassette',false,'usedProviderFallback',false));
 parsed:=pg_temp.debt_materialize((j->>'job_id')::uuid,j->>'capability_token',public.worker_prepare_capital_debt_output_v1((j->>'job_id')::uuid,j->>'capability_token',(s->>'recipeId')::uuid,gen_random_uuid(),'parsed',(accepted->>'acceptedInvocationId')::uuid,n->'parsed',n->>'outputFingerprint',null));
 fp:=encode(extensions.digest('["capital-debt-final-output.v1",'||to_jsonb(n->>'outputFingerprint')::text||','||to_jsonb(s->>'recipeFingerprint')::text||','||to_jsonb(n->>'finalBodyFingerprint')::text||']','sha256'),'hex');
 final:=pg_temp.debt_materialize((j->>'job_id')::uuid,j->>'capability_token',public.worker_prepare_capital_debt_output_v1((j->>'job_id')::uuid,j->>'capability_token',(s->>'recipeId')::uuid,gen_random_uuid(),'final',(accepted->>'acceptedInvocationId')::uuid,n->'final',fp,(parsed->>'retainedPayloadId')::uuid));
 c:=public.worker_commit_capital_debt_result_v1((j->>'job_id')::uuid,j->>'capability_token',(s->>'recipeId')::uuid,(accepted->>'acceptedInvocationId')::uuid,(parsed->>'retainedPayloadId')::uuid,(final->>'retainedPayloadId')::uuid,fp,n->'qualityResults');
 again:=public.worker_commit_capital_debt_result_v1((j->>'job_id')::uuid,j->>'capability_token',(s->>'recipeId')::uuid,(accepted->>'acceptedInvocationId')::uuid,(parsed->>'retainedPayloadId')::uuid,(final->>'retainedPayloadId')::uuid,fp,n->'qualityResults');
 if not(again->>'replayed')::boolean or c->>'taskRunId'=s->>'executionPlanTaskRunId' then raise exception 'debt_revision_distinct_final_or_replay_wrong';end if;
 g:=public.worker_recover_capital_debt_result_v1((j->>'job_id')::uuid,j->>'capability_token',(s->>'recipeId')::uuid);
 if g->>'state'<>'committed' or(g->>'dispatchAllowed')::boolean then raise exception 'debt_revision_recovery_not_zero_dispatch';end if;
 insert into debt_revision_human_fixture values('committed',c),('recovered',g);
 raise notice 'PASS debt_revision_new_accepted_parsed_final_distinct_C11_exact_replay_recovery_zero_dispatch';
end$$;
reset role;
do $$declare j jsonb;c jsonb;s jsonb;begin
 select v into strict j from debt_revision_human_fixture where k='claim';select v into strict c from debt_revision_human_fixture where k='committed';select v into strict s from debt_revision_human_fixture where k='recipe';
 if(select count(*) from public.capital_project_task_runs where processing_job_id=(j->>'job_id')::uuid)<>1 or(select count(*) from private.capital_debt_task_projections where recipe_id=(s->>'recipeId')::uuid)<>0 then raise exception 'debt_revision_cloned_predecessor_tasks';end if;
 if not exists(select 1 from private.artifact_dependency_links l, debt_revision_human_fixture f where f.k='basis' and l.revision_id=(c->>'revisionId')::uuid and l.derived_from_revision_id=(f.v->>'revisionId')::uuid) then raise exception 'debt_revision_physical_ancestry_missing';end if;
 raise notice 'PASS debt_return_one_new_final_TaskRun_zero_cloned_intermediates_real_revision_ancestry';
end$$;
