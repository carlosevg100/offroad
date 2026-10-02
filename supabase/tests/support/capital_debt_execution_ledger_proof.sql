-- Continuation ONLY after the actual human-approved and licensed native seal.
-- SQL Storage metadata/provider observations are fixtures, not SDK/HTTP claims.
reset role;
create temp table debt_lifecycle(recipe jsonb,decision jsonb,input jsonb,accepted jsonb,parsed jsonb);
grant all on debt_lifecycle to authenticated;
insert into debt_lifecycle(recipe) select v from debt_proof where k='native_recipe';
create function pg_temp.debt_route() returns jsonb language sql as $$select jsonb_build_object('provider','anthropic','model','claude-sonnet-5','accountRef','debt-sql-account','projectRef','debt-sql-project','credentialBinding','debt-sql-key','endpoint','https://api.anthropic.com/v1/messages','region','global');$$;
do $$declare resource text;d jsonb;begin
 foreach resource in array array['inference','prompt_cache','schema_cache'] loop
 d:=pg_temp.debt_route()-'model'||jsonb_build_object('id',gen_random_uuid(),'policyVersion','offroad-provider-retention-v2','resource',resource,'models',jsonb_build_array('claude-sonnet-5'),'purposes',jsonb_build_array('case_analysis'),'classifications',jsonb_build_array('restricted'),'rights',jsonb_build_array('process'),'trainingUse','prohibited','eligibility','supported','zeroRetention','not_contracted','revokedAt',null,'reviewedBy','SQL-fixture','reviewedAt',clock_timestamp()-interval '1 minute','validThrough',clock_timestamp()+interval '2 days','retention',jsonb_build_object('requestContentSeconds',0,'abuseMonitoringSeconds',0,'applicationStateSeconds',0,'cacheSeconds',0,'metadataSeconds',0,'exceptions','[]'::jsonb),'evidence',jsonb_build_array(jsonb_build_object('kind','provider_terms','reference','synthetic-rollback-only','sha256',repeat('1',64)),jsonb_build_object('kind','account_configuration','reference','synthetic-rollback-only','sha256',repeat('2',64)),jsonb_build_object('kind','credential_binding','reference','synthetic-rollback-only','sha256',repeat('3',64))));
 perform private.record_provider_processing_assurance_v1(d,'Synthetic rollback-only provider evidence');
 end loop;
end$$;
set local role authenticated;
do $$declare f record;n jsonb;a jsonb;d jsonb;i jsonb;begin
 select * into strict f from debt_recipe_fixture;select v into strict n from agent_fixture where k='debt_render_product_2';
 a:=jsonb_build_object('adapterInputVersion','gateway-adapter-input.v1','task','company_debt_view','schemaName','company_debt_diagnostic_v1','requestFingerprint',n->>'primaryRequestFingerprint','inputFingerprint',n->>'inputFingerprint','promptFingerprint',n->>'promptFingerprint','invocationId',gen_random_uuid(),'retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',false,'reservationUsd',0.1);
 begin perform public.worker_authorize_capital_debt_processing_v1(f.job_id,f.capability,(f.base->>'recipeId')::uuid,a||jsonb_build_object('inputFingerprint',repeat('0',64)),pg_temp.debt_route(),array['inference','prompt_cache','schema_cache'],'case_analysis');raise exception 'debt_substituted_input_admitted';exception when insufficient_privilege then null;end;
 begin perform public.worker_authorize_capital_debt_processing_v1(f.job_id,f.capability,(f.base->>'recipeId')::uuid,a||jsonb_build_object('privateBody','canary'),pg_temp.debt_route(),array['inference','prompt_cache','schema_cache'],'case_analysis');raise exception 'debt_attempt_raw_content_admitted';exception when invalid_parameter_value then null;end;
 begin perform public.worker_authorize_capital_debt_processing_v1(f.job_id,repeat('x',64),(f.base->>'recipeId')::uuid,a,pg_temp.debt_route(),array['inference','prompt_cache','schema_cache'],'case_analysis');raise exception 'debt_wrong_capability_admitted';exception when insufficient_privilege then null;end;
 d:=public.worker_authorize_capital_debt_processing_v1(f.job_id,f.capability,(f.base->>'recipeId')::uuid,a,pg_temp.debt_route(),array['inference','prompt_cache','schema_cache'],'case_analysis');
 if not(d->>'allowed')::boolean then raise exception 'debt_real_license_processing_denied';end if;
 i:=public.worker_record_capital_debt_input_v1(f.job_id,f.capability,(d->>'attemptReceiptId')::uuid);
 if not(i->>'dispatchAllowed')::boolean then raise exception 'debt_first_dispatch_denied';end if;
 if(public.worker_record_capital_debt_input_v1(f.job_id,f.capability,(d->>'attemptReceiptId')::uuid)->>'dispatchAllowed')::boolean then raise exception 'debt_dispatch_replay_resends';end if;
 update debt_lifecycle set decision=d,input=i;
end$$;
reset role;
create function pg_temp.debt_materialize(p_job uuid,p_cap text,p_allocation jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare o uuid;begin
 insert into storage.objects(bucket_id,name,metadata,version) values(p_allocation->>'bucket',p_allocation->>'path',jsonb_build_object('size',(p_allocation->>'byteLength')::bigint,'mimetype','application/json'),'debt-output-sql-v1') returning id into o;
 return public.worker_commit_capital_debt_body_v1(p_job,p_cap,(p_allocation->>'allocationId')::uuid,o,'debt-output-sql-v1',p_allocation->>'payloadFingerprint',(p_allocation->>'byteLength')::bigint);
end$$;
create function pg_temp.debt_outcome(p_decision jsonb,p_input jsonb,p_output_fp text) returns jsonb language plpgsql security definer set search_path='' as $$declare a private.capital_debt_gateway_attempts;dto jsonb;begin
 select * into strict a from private.capital_debt_gateway_attempts where id=(p_decision->>'attemptReceiptId')::uuid;
 dto:=jsonb_build_object('schemaVersion','gateway-attempt-outcome.v1','fingerprintVersion','gateway-attempt-outcome-fingerprint.v1','outcomeFingerprint',repeat('0',64),'invocationId',a.invocation_id,'task','company_debt_view','provider','anthropic','configuredModel',a.model,'schemaName','company_debt_diagnostic_v1','adapterInputVersion','gateway-adapter-input.v1','requestFingerprint',a.request_fingerprint,'inputFingerprint',a.input_fingerprint,'promptFingerprint',a.prompt_fingerprint,'previousInvocationId',null,'retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',false,'processingDecisionId',a.processing_decision_id,'inputAttestationReceiptId',p_input->>'receiptId','fromCassette',false,'outcome','accepted','failureCode',null,'outputFingerprintVersion','gateway-parsed-output.v1','outputFingerprint',p_output_fp,'reportedModel',a.model,'validationIssueCodeFingerprint',null,'reservationMicroUsd',a.reservation_micro_usd,'costMicroUsd',null,'exposureMicroUsd',a.reservation_micro_usd,'costStatus','unknown','inputTokens',null,'outputTokens',null,'cachedInputTokens',null,'latencyMillis',11);
 return dto||jsonb_build_object('outcomeFingerprint',private.capital_debt_attempt_outcome_fingerprint_v1(dto));
end$$;
create function pg_temp.debt_invalid_outcome(p_decision jsonb,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare dto jsonb;begin
 dto:=pg_temp.debt_outcome(p_decision,p_input,repeat('1',64))||jsonb_build_object('outcome','invalid_output','failureCode','schema_invalid','outputFingerprintVersion',null,'outputFingerprint',null,'reportedModel',null,'validationIssueCodeFingerprint',repeat('2',64));
 return dto||jsonb_build_object('outcomeFingerprint',private.capital_debt_attempt_outcome_fingerprint_v1(dto));
end$$;
create function pg_temp.debt_terminal_invariants(p_recipe uuid) returns boolean language sql security definer set search_path='' as $$
 select (select status='succeeded' from public.capital_project_task_runs where id=s.execution_plan_task_run_id)
 and exists(select 1 from private.capital_debt_execution_failures where recipe_id=p_recipe)
 and not exists(select 1 from private.capital_debt_accepted_invocations where recipe_id=p_recipe)
 and (select count(*)=1 from private.capital_debt_input_dispatches d join private.capital_debt_operations o on o.id=d.operation_id where o.recipe_id=p_recipe)
 from private.capital_debt_recipe_seals s where s.recipe_id=p_recipe;
$$;
set local role authenticated;
-- Each terminal branch rolls back only its own diagnostic/outcome, preserving
-- the same genuinely sealed and dispatched source→M06 fixture for accepted proof.
do $$declare f record;t record;o jsonb;receipt jsonb;again jsonb;begin
 select * into strict f from debt_recipe_fixture;select * into strict t from debt_lifecycle;
 begin perform public.worker_record_capital_debt_execution_failure_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,'model_attempts_exhausted');raise exception 'debt_terminal_without_outcome_admitted';exception when insufficient_privilege then null;end;
 begin
 o:=pg_temp.debt_invalid_outcome(t.decision,t.input);
 perform public.worker_record_capital_debt_attempt_outcome_v1(f.job_id,f.capability,(t.decision->>'attemptReceiptId')::uuid,o);
 begin perform public.worker_record_capital_debt_execution_failure_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,'model_attempts_exhausted',array[gen_random_uuid()]);raise exception 'debt_terminal_forged_outcome_ids_admitted';exception when insufficient_privilege then null;end;
 receipt:=public.worker_record_capital_debt_execution_failure_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,'model_attempts_exhausted');
 again:=public.worker_record_capital_debt_execution_failure_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,'model_attempts_exhausted');
 if receipt->>'executionPlanTaskRunId'<>t.recipe->>'executionPlanTaskRunId' or not(again->>'replayed')::boolean
 or receipt->'outcomeIds'<>again->'outcomeIds' or not pg_temp.debt_terminal_invariants((t.recipe->>'recipeId')::uuid)then raise exception 'debt_terminal_rewrites_M06_or_budget';end if;
 raise exception using errcode='P9998',message='terminal_branch_rollback';
 exception when sqlstate 'P9998' then null;end;
 begin
 o:=pg_temp.debt_invalid_outcome(t.decision,t.input);
 perform public.worker_record_capital_debt_attempt_outcome_v1(f.job_id,f.capability,(t.decision->>'attemptReceiptId')::uuid,o);
 receipt:=public.worker_record_capital_debt_execution_failure_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,'budget_denied');
 if receipt->>'reason'<>'budget_denied' or not pg_temp.debt_terminal_invariants((t.recipe->>'recipeId')::uuid)then raise exception 'debt_budget_terminal_false_success';end if;
 raise exception using errcode='P9998',message='terminal_branch_rollback';
 exception when sqlstate 'P9998' then null;end;
 raise notice 'PASS debt_terminal_real_invalid_outcome_fallback_budget_exhaustion_replay_preserves_M06';
end$$;
set local role authenticated;
do $$declare f record;t record;n jsonb;o jsonb;accepted_dto jsonb;allocation jsonb;replayed jsonb;begin
 select * into strict f from debt_recipe_fixture;select * into strict t from debt_lifecycle;select v into strict n from agent_fixture where k='debt_render_product_2';
 o:=pg_temp.debt_outcome(t.decision,t.input,n->>'outputFingerprint');
 accepted_dto:=jsonb_build_object('schemaVersion','gateway-accepted-invocation.v1','adapterInputVersion','gateway-adapter-input.v1','outputFingerprintVersion','gateway-parsed-output.v1','provider','anthropic','configuredModel','claude-sonnet-5','reportedModel','claude-sonnet-5','schemaName','company_debt_diagnostic_v1','invocationId',t.input->>'invocationId','inputAttestationReceiptId',t.input->>'receiptId','adapterRequestFingerprint',n->>'primaryRequestFingerprint','inputFingerprint',n->>'inputFingerprint','promptFingerprint',n->>'promptFingerprint','outputFingerprint',n->>'outputFingerprint','retryOrdinal',0,'isSameModelRepair',false,'fromCassette',false,'usedProviderFallback',false);
 begin perform public.worker_record_capital_debt_accepted_v1(f.job_id,f.capability,(t.input->>'receiptId')::uuid,accepted_dto);raise exception 'debt_accepted_without_observed_outcome_admitted';exception when insufficient_privilege then null;end;
 perform public.worker_record_capital_debt_attempt_outcome_v1(f.job_id,f.capability,(t.decision->>'attemptReceiptId')::uuid,o);
 replayed:=public.worker_record_capital_debt_attempt_outcome_v1(f.job_id,f.capability,(t.decision->>'attemptReceiptId')::uuid,o);
 if not(replayed->>'replayed')::boolean then raise exception 'debt_outcome_replay_not_exact';end if;
 begin perform public.worker_record_capital_debt_accepted_v1(f.job_id,f.capability,(t.input->>'receiptId')::uuid,accepted_dto||jsonb_build_object('outputFingerprint',repeat('0',64)));raise exception 'debt_accepted_substituted_output_admitted';exception when invalid_parameter_value then null;end;
 replayed:=public.worker_record_capital_debt_accepted_v1(f.job_id,f.capability,(t.input->>'receiptId')::uuid,accepted_dto);
 accepted_dto:=public.worker_record_capital_debt_accepted_v1(f.job_id,f.capability,(t.input->>'receiptId')::uuid,accepted_dto);
 if replayed<>accepted_dto then raise exception 'debt_accepted_replay_changed_identity';end if;
 begin perform public.worker_prepare_capital_debt_output_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,gen_random_uuid(),'parsed',(t.recipe->>'executionPlanTaskRunId')::uuid,n->'parsed',n->>'outputFingerprint',null);raise exception 'debt_m06_task_as_paid_accepted_admitted';exception when insufficient_privilege then null;end;
 allocation:=public.worker_prepare_capital_debt_output_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,gen_random_uuid(),'parsed',(accepted_dto->>'acceptedInvocationId')::uuid,n->'parsed',n->>'outputFingerprint',null);
 update debt_lifecycle set accepted=accepted_dto,parsed=pg_temp.debt_materialize(f.job_id,f.capability,allocation);
 select * into strict t from debt_lifecycle;
end$$;
reset role;
do $$declare t record;s private.capital_debt_recipe_seals;basis private.capital_debt_body_bases;begin
 select * into strict t from debt_lifecycle;
 select * into strict s from private.capital_debt_recipe_seals where recipe_id=(t.recipe->>'recipeId')::uuid;
 select * into strict basis from private.capital_debt_body_bases where id=(t.parsed->>'bodyBasisId')::uuid;
 if basis.kind<>'parsed' or basis.accepted_invocation_id<>(t.accepted->>'acceptedInvocationId')::uuid
 or basis.semantic_fingerprint<>t.accepted->>'outputFingerprint' or basis.task_run_id is not null
 or not private.capital_body_physical_receipt_v1(s.organization_id,(t.parsed->>'retainedPayloadId')::uuid)
 or(select status from public.capital_project_task_runs where id=s.execution_plan_task_run_id)<>'succeeded'
 or(select count(*) from private.capital_debt_operations where recipe_id=s.recipe_id)<>1
 or(select count(*) from private.capital_debt_input_dispatches d join private.capital_debt_operations o on o.id=d.operation_id where o.recipe_id=s.recipe_id)<>1 then
 raise exception 'debt_accepted_parsed_or_real_m06_identity_broken';end if;
 insert into debt_proof values('ledger_decision',t.decision),('ledger_input',t.input),('accepted',t.accepted),('parsed_retained',t.parsed);
 raise notice 'PASS debt_legitimate_M06_then_oneuse_authorize_outcome_accepted_and_distinct_physical_parsed';
end$$;
