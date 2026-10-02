-- Full SQL native lifecycle fed by the actual Node renderer and human-owned
-- source license. Storage objects and provider observations are SQL fixtures;
-- no claim of HTTP transport, commercial terms, or live model inference.
reset role;
create temp table s11_lifecycle(recipe jsonb,decision jsonb,input jsonb,accepted jsonb,parsed jsonb,final jsonb,final_fp text,commit_receipt jsonb);
grant all on s11_lifecycle to authenticated;
insert into s11_lifecycle default values;
set local role authenticated;
do $$declare f record;n jsonb;s jsonb;begin
 select * into strict f from s11_recipe_fixture;select v into strict n from agent_fixture where k='s11_render_product_2';
 s:=public.worker_finalize_capital_s11_recipe_v1(f.job_id,f.capability,(f.base->>'recipeId')::uuid,(f.retention->>'retainedPayloadId')::uuid,n->'components',n->>'inputFingerprint',n->>'promptFingerprint',n->>'primaryRequestFingerprint',n->>'fallbackRequestFingerprint',650000,2,'succeeded','BR',false,repeat('e',64));
 if s->>'producerTaskId'<>'M04' or s->>'finalTaskId'<>'S11' or(s#>>'{operationalBudget,maxExposureMicroUsd}')::bigint<>650000 then raise exception 's11_native_producer_or_budget_wrong';end if;
 update s11_lifecycle set recipe=s;
end$$;

reset role;
create function pg_temp.s11_route() returns jsonb language sql as $$select jsonb_build_object('provider','anthropic','model','claude-sonnet-5','accountRef','s11-sql-account','projectRef','s11-sql-project','credentialBinding','s11-sql-key','endpoint','https://api.anthropic.com/v1/messages','region','global');$$;
do $$declare resource text;d jsonb;begin
 foreach resource in array array['inference','prompt_cache','schema_cache'] loop
 d:=pg_temp.s11_route()-'model'||jsonb_build_object('id',gen_random_uuid(),'policyVersion','offroad-provider-retention-v2','resource',resource,'models',jsonb_build_array('claude-sonnet-5'),'purposes',jsonb_build_array('case_analysis'),'classifications',jsonb_build_array('restricted'),'rights',jsonb_build_array('process'),'trainingUse','prohibited','eligibility','supported','zeroRetention','not_contracted','revokedAt',null,'reviewedBy','SQL-fixture','reviewedAt',clock_timestamp()-interval '1 minute','validThrough',clock_timestamp()+interval '2 days','retention',jsonb_build_object('requestContentSeconds',0,'abuseMonitoringSeconds',0,'applicationStateSeconds',0,'cacheSeconds',0,'metadataSeconds',0,'exceptions','[]'::jsonb),'evidence',jsonb_build_array(jsonb_build_object('kind','provider_terms','reference','synthetic-rollback-only','sha256',repeat('1',64)),jsonb_build_object('kind','account_configuration','reference','synthetic-rollback-only','sha256',repeat('2',64)),jsonb_build_object('kind','credential_binding','reference','synthetic-rollback-only','sha256',repeat('3',64))));
 perform private.record_provider_processing_assurance_v1(d,'Synthetic rollback-only provider evidence');
 end loop;
end$$;
set local role authenticated;
do $$declare f record;n jsonb;a jsonb;d jsonb;i jsonb;begin
 select * into strict f from s11_recipe_fixture;select v into strict n from agent_fixture where k='s11_render_product_2';
 a:=jsonb_build_object('adapterInputVersion','gateway-adapter-input.v1','task','capital_planning','schemaName','capital_planning_map_v1','requestFingerprint',n->>'primaryRequestFingerprint','inputFingerprint',n->>'inputFingerprint','promptFingerprint',n->>'promptFingerprint','invocationId',gen_random_uuid(),'retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',false,'reservationUsd',0.1);
 d:=public.worker_authorize_capital_s11_processing_v1(f.job_id,f.capability,(f.base->>'recipeId')::uuid,a,pg_temp.s11_route(),array['inference','prompt_cache','schema_cache'],'case_analysis');
 if not(d->>'allowed')::boolean then raise exception 's11_real_license_processing_denied';end if;
 i:=public.worker_record_capital_s11_input_v1(f.job_id,f.capability,(d->>'attemptReceiptId')::uuid);
 if not(i->>'dispatchAllowed')::boolean then raise exception 's11_first_dispatch_denied';end if;
 if(public.worker_record_capital_s11_input_v1(f.job_id,f.capability,(d->>'attemptReceiptId')::uuid)->>'dispatchAllowed')::boolean then raise exception 's11_dispatch_replay_resends';end if;
 update s11_lifecycle set decision=d,input=i;
end$$;
reset role;
create function pg_temp.s11_materialize(p_job uuid,p_cap text,p_allocation jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare o uuid;begin
 insert into storage.objects(bucket_id,name,metadata,version) values(p_allocation->>'bucket',p_allocation->>'path',jsonb_build_object('size',(p_allocation->>'byteLength')::bigint,'mimetype','application/json'),'s11-output-sql-v1') returning id into o;
 return public.worker_commit_capital_s11_body_v1(p_job,p_cap,(p_allocation->>'allocationId')::uuid,o,'s11-output-sql-v1',p_allocation->>'payloadFingerprint',(p_allocation->>'byteLength')::bigint);
end$$;
create function pg_temp.s11_outcome(p_decision jsonb,p_input jsonb,p_output_fp text) returns jsonb language plpgsql security definer set search_path='' as $$declare a private.capital_s11_gateway_attempts;dto jsonb;begin
 select * into strict a from private.capital_s11_gateway_attempts where id=(p_decision->>'attemptReceiptId')::uuid;
 dto:=jsonb_build_object('schemaVersion','gateway-attempt-outcome.v1','fingerprintVersion','gateway-attempt-outcome-fingerprint.v1','outcomeFingerprint',repeat('0',64),'invocationId',a.invocation_id,'task','capital_planning','provider','anthropic','configuredModel',a.model,'schemaName','capital_planning_map_v1','adapterInputVersion','gateway-adapter-input.v1','requestFingerprint',a.request_fingerprint,'inputFingerprint',a.input_fingerprint,'promptFingerprint',a.prompt_fingerprint,'previousInvocationId',null,'retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',false,'processingDecisionId',a.processing_decision_id,'inputAttestationReceiptId',p_input->>'receiptId','fromCassette',false,'outcome','accepted','failureCode',null,'outputFingerprintVersion','gateway-parsed-output.v1','outputFingerprint',p_output_fp,'reportedModel',a.model,'validationIssueCodeFingerprint',null,'reservationMicroUsd',a.reservation_micro_usd,'costMicroUsd',null,'exposureMicroUsd',a.reservation_micro_usd,'costStatus','unknown','inputTokens',null,'outputTokens',null,'cachedInputTokens',null,'latencyMillis',11);
 return dto||jsonb_build_object('outcomeFingerprint',private.capital_s11_attempt_outcome_fingerprint_v1(dto));
end$$;
set local role authenticated;
do $$declare f record;t record;n jsonb;o jsonb;accepted_dto jsonb;allocation jsonb;finalfp text;begin
 select * into strict f from s11_recipe_fixture;select * into strict t from s11_lifecycle;select v into strict n from agent_fixture where k='s11_render_product_2';
 o:=pg_temp.s11_outcome(t.decision,t.input,n->>'outputFingerprint');
 perform public.worker_record_capital_s11_attempt_outcome_v1(f.job_id,f.capability,(t.decision->>'attemptReceiptId')::uuid,o);
 accepted_dto:=jsonb_build_object('schemaVersion','gateway-accepted-invocation.v1','adapterInputVersion','gateway-adapter-input.v1','outputFingerprintVersion','gateway-parsed-output.v1','provider','anthropic','configuredModel','claude-sonnet-5','reportedModel','claude-sonnet-5','schemaName','capital_planning_map_v1','invocationId',t.input->>'invocationId','inputAttestationReceiptId',t.input->>'receiptId','adapterRequestFingerprint',n->>'primaryRequestFingerprint','inputFingerprint',n->>'inputFingerprint','promptFingerprint',n->>'promptFingerprint','outputFingerprint',n->>'outputFingerprint','retryOrdinal',0,'isSameModelRepair',false,'fromCassette',false,'usedProviderFallback',false);
 accepted_dto:=public.worker_record_capital_s11_accepted_v1(f.job_id,f.capability,(t.input->>'receiptId')::uuid,accepted_dto);
 allocation:=public.worker_prepare_capital_s11_output_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,gen_random_uuid(),'parsed',(accepted_dto->>'acceptedInvocationId')::uuid,n->'parsed',n->>'outputFingerprint',null);
 update s11_lifecycle set accepted=accepted_dto,parsed=pg_temp.s11_materialize(f.job_id,f.capability,allocation);
 select * into strict t from s11_lifecycle;
 finalfp:=encode(extensions.digest('["capital-s11-final-output.v1",'||to_jsonb(n->>'outputFingerprint')::text||','||to_jsonb(t.recipe->>'recipeFingerprint')::text||','||to_jsonb(n->>'finalBodyFingerprint')::text||']','sha256'),'hex');
 allocation:=public.worker_prepare_capital_s11_output_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,gen_random_uuid(),'final',(accepted_dto->>'acceptedInvocationId')::uuid,n->'final',finalfp,(t.parsed->>'retainedPayloadId')::uuid);
 update s11_lifecycle set final=pg_temp.s11_materialize(f.job_id,f.capability,allocation),final_fp=finalfp;
end$$;
-- All actual published TaskSpecs in their dependency order. M04 already running
-- was started by the seal; no downstream fake predecessor or repeated paid run.
do $$declare f record;t record;x jsonb;begin
 select * into strict f from s11_recipe_fixture;select * into strict t from s11_lifecycle;
 x:=public.worker_load_capital_s11_recovered_projection_state_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,'C11');
 if x->>'state'<>'absent' or x->'body'<>'null'::jsonb or x->'projection'<>'null'::jsonb then raise exception 's11_missing_projection_state_wrong';end if;
 x:=public.worker_load_capital_s11_recovered_projection_state_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,'M01');
 if x->>'state'<>'present' or x#>>'{projection,taskRunId}' is distinct from(select task_run_id::text from s11_prelude_fixture where task_id='M01') then raise exception 's11_original_prelude_reference_changed';end if;
 begin perform public.worker_load_capital_s11_recovered_projection_state_v1(f.job_id,repeat('x',64),(t.recipe->>'recipeId')::uuid,'C11');raise exception 's11_invalid_capability_became_absent';exception when insufficient_privilege then null;end;
 begin perform public.worker_load_capital_s11_recovered_projection_state_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,'M07');raise exception 's11_outside_plan_became_absent';exception when insufficient_privilege then null;end;
 raise notice 'PASS s11_recovery_projection_absence_server_proven_original_run_present_wrong_cap_and_TaskSpec_denied';
end$$;
do $$declare f record;t record;n jsonb;item jsonb;run uuid;allocation jsonb;retained jsonb;projection jsonb;begin
 select * into strict f from s11_recipe_fixture;select * into strict t from s11_lifecycle;select v into strict n from agent_fixture where k='s11_render_product_2';
 for item in select value from jsonb_array_elements(n->'tasks') loop
  if item->>'taskId'='M04' then run:=(t.recipe->>'producerTaskRunId')::uuid;
  else run:=public.worker_start_capital_project_task(f.job_id,f.capability,item->>'taskId','offroad.capital_planning','2026.09.24-v2',item->>'semanticFingerprint',jsonb_build_object('schemaVersion','capital-context-manifest.v1'));end if;
  allocation:=public.worker_prepare_capital_s11_task_projection_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,gen_random_uuid(),run,(t.accepted->>'acceptedInvocationId')::uuid,item->'body',item->>'semanticFingerprint',(t.parsed->>'retainedPayloadId')::uuid);
  retained:=pg_temp.s11_materialize(f.job_id,f.capability,allocation);
  projection:=public.worker_commit_capital_s11_task_projection_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,run,(retained->>'retainedPayloadId')::uuid);
  if projection->>'taskId' is distinct from item->>'taskId' then raise exception 's11_real_task_projection_wrong';end if;
 end loop;
 update s11_lifecycle set commit_receipt=public.worker_commit_capital_s11_result_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,(t.accepted->>'acceptedInvocationId')::uuid,(t.parsed->>'retainedPayloadId')::uuid,(t.final->>'retainedPayloadId')::uuid,t.final_fp,n->'qualityResults');
 select * into strict t from s11_lifecycle;
 if t.commit_receipt->>'producerTaskRunId'=t.commit_receipt->>'taskRunId' then raise exception 's11_paid_producer_aliases_final';end if;
 if public.worker_commit_capital_s11_result_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,(t.accepted->>'acceptedInvocationId')::uuid,(t.parsed->>'retainedPayloadId')::uuid,(t.final->>'retainedPayloadId')::uuid,t.final_fp,n->'qualityResults')->>'replayed' is distinct from 'true' then raise exception 's11_final_replay_failed';end if;
end$$;
reset role;
do $$declare f record;t record;begin
 select * into strict f from s11_recipe_fixture;select * into strict t from s11_lifecycle;
 if(select count(*) from public.capital_project_task_runs where processing_job_id=f.job_id and status='succeeded')<>35 then raise exception 's11_full_published_plan_incomplete';end if;
 if(select count(*) from private.capital_s11_input_dispatches where job_id=f.job_id)<>1 then raise exception 's11_more_than_one_paid_claim';end if;
 if(select count(*) from private.capital_s11_task_projections where recipe_id=(t.recipe->>'recipeId')::uuid)<>34 then raise exception 's11_physical_intermediate_chain_incomplete';end if;
 if exists(select 1 from public.capital_project_artifacts where capital_project_id=(f.base->>'workId')::uuid and schema_version not in('capital-s11-task-projection.v1','capital-s11-projection.v1')) then raise exception 's11_raw_legacy_cpa_body';end if;
 raise notice 'PASS s11_human_licensed_source_real_M04_accepted_physical_34projections_C11_S10_distinct_S11_commit_replay_one_dispatch';
end$$;

set local role authenticated;
do $$declare f record;t record;grant_row jsonb;scope jsonb;begin
 select * into strict f from s11_recipe_fixture;select * into strict t from s11_lifecycle;
 grant_row:=public.worker_recover_capital_s11_result_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid);
 if grant_row->>'state'<>'committed' or(grant_row->>'dispatchAllowed')::boolean
  or grant_row->>'originalJobId'<>f.job_id::text or grant_row->>'authorizedJobId'<>f.job_id::text then raise exception 's11_committed_recovery_dispatch_or_identity_changed';end if;
 scope:=public.worker_read_capital_s11_recovery_body_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,(t.final->>'retainedPayloadId')::uuid);
 if scope->>'payloadFingerprint'<>t.final->>'payloadFingerprint' then raise exception 's11_recovery_physical_final_changed';end if;
 begin perform public.worker_read_capital_s11_recovery_body_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,gen_random_uuid());raise exception 's11_recovery_unrelated_body_admitted';exception when insufficient_privilege then null;end;
 raise notice 'PASS s11_committed_recovery_exact_original_refs_no_dispatch_unrelated_body_denied';
end$$;
reset role;
savepoint s11_c11_physical_loss;
delete from storage.objects where id in(select q.storage_object_id from private.capital_s11_task_projections p join private.capital_public_retained_payloads q on q.organization_id=p.organization_id and q.id=p.derived_retained_payload_id where p.recipe_id=(select(recipe->>'recipeId')::uuid from s11_lifecycle) and p.task_id='C11');
do $$declare f record;t record;begin
 select * into strict f from s11_recipe_fixture;select * into strict t from s11_lifecycle;
 if private.capital_s11_native_read_allowed_v1((f.base->>'organizationId')::uuid,(t.commit_receipt->>'revisionId')::uuid,'a8800000-0000-4000-8000-000000000001') then raise exception 's11_final_survived_lost_C11_physical_dependency';end if;
end$$;
set local role authenticated;
do $$declare f record;t record;begin
 select * into strict f from s11_recipe_fixture;select * into strict t from s11_lifecycle;
 begin perform public.worker_recover_capital_s11_result_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid);raise exception 's11_recovery_survived_lost_C11';exception when insufficient_privilege then null;end;
 begin perform public.worker_load_capital_s11_recovered_projection_state_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,'C11');raise exception 's11_lost_C11_became_absent';exception when insufficient_privilege then null;end;
 raise notice 'PASS s11_final_and_recovery_deny_lost_C11_body_despite_surviving_final_bytes';
end$$;
rollback to s11_c11_physical_loss;
reset role;
