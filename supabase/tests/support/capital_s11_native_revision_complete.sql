-- Real human return/seal/new M04; provider and Storage observations remain
-- explicit rollback SQL fixtures. HTTP proof is a separate CI gate.
set local role authenticated;
do $$declare j jsonb;b jsonb;c jsonb;n jsonb;s jsonb;old jsonb;begin
 select v into strict j from s11_revision_human_fixture where k='claim';select v into strict b from s11_revision_human_fixture where k='base';select v into strict c from s11_revision_human_fixture where k='context_retained';select v into strict n from agent_fixture where k='s11_revision_render_product';
 s:=public.worker_finalize_capital_s11_recipe_v1((j->>'job_id')::uuid,j->>'capability_token',(b->>'recipeId')::uuid,(c->>'retainedPayloadId')::uuid,n->'components',n->>'inputFingerprint',n->>'promptFingerprint',n->>'primaryRequestFingerprint',n->>'fallbackRequestFingerprint',800000,1,'succeeded','BR',false,repeat('e',64));
 if(s#>>'{operationalBudget,maxExposureMicroUsd}')::bigint<>800000 or(s#>>'{operationalBudget,maxDispatches}')::integer<>1 or(s#>>'{operationalBudget,researchReservationMicroUsd}')::bigint<>0 then raise exception 's11_revision_budget_or_external_search_changed';end if;
 if public.worker_finalize_capital_s11_recipe_v1((j->>'job_id')::uuid,j->>'capability_token',(b->>'recipeId')::uuid,(c->>'retainedPayloadId')::uuid,n->'components',n->>'inputFingerprint',n->>'promptFingerprint',n->>'primaryRequestFingerprint',n->>'fallbackRequestFingerprint',800000,1,'succeeded','BR',false,repeat('e',64))->>'producerTaskRunId' is distinct from s->>'producerTaskRunId' then raise exception 's11_revision_seal_replay_new_attempt';end if;
 insert into s11_revision_human_fixture values('recipe',s);
 raise notice 'PASS s11_genuine_revision_seal_appends_M04_under_human_proof_no_history_invalidation_one_call_zero_research';
end $$;
reset role;
do $$declare j jsonb;s jsonb;old jsonb;begin
 select v into strict j from s11_revision_human_fixture where k='claim';select v into strict s from s11_revision_human_fixture where k='recipe';
 select recipe into strict old from s11_lifecycle;
 if not exists(select 1 from public.capital_project_task_runs where id=(old->>'producerTaskRunId')::uuid and status='succeeded') then raise exception 's11_revision_destroyed_original_M04';end if;
 if(select count(*)from public.capital_project_task_runs where processing_job_id=(j->>'job_id')::uuid)<>1 then raise exception 's11_revision_cloned_historical_tasks';end if;
 if(select count(*)from private.capital_s11_recipe_components where recipe_id=(s->>'recipeId')::uuid and slot='dependency')<>4 then raise exception 's11_revision_original_dependency_closure_missing';end if;
end $$;

reset role;
create temp table s11_revision_recipe_fixture(job_id uuid,capability text,base jsonb,retention jsonb);
create temp table s11_revision_lifecycle(like s11_lifecycle);
grant all on s11_revision_recipe_fixture,s11_revision_lifecycle to authenticated;
insert into s11_revision_recipe_fixture select(j.v->>'job_id')::uuid,j.v->>'capability_token',b.v,c.v from s11_revision_human_fixture j,s11_revision_human_fixture b,s11_revision_human_fixture c where j.k='claim'and b.k='base'and c.k='context_retained';
insert into s11_revision_lifecycle(recipe)select v from s11_revision_human_fixture where k='recipe';
set local role authenticated;
do $$declare f record;n jsonb;a jsonb;d jsonb;i jsonb;begin
 select * into strict f from s11_revision_recipe_fixture;select v into strict n from agent_fixture where k='s11_revision_render_product';
 a:=jsonb_build_object('adapterInputVersion','gateway-adapter-input.v1','task','capital_planning','schemaName','capital_planning_map_v1','requestFingerprint',n->>'primaryRequestFingerprint','inputFingerprint',n->>'inputFingerprint','promptFingerprint',n->>'promptFingerprint','invocationId',gen_random_uuid(),'retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',false,'reservationUsd',0.1);
 d:=public.worker_authorize_capital_s11_processing_v1(f.job_id,f.capability,(f.base->>'recipeId')::uuid,a,pg_temp.s11_route(),array['inference','prompt_cache','schema_cache'],'case_analysis');
 if not(d->>'allowed')::boolean then raise exception 's11_real_license_processing_denied';end if;
 i:=public.worker_record_capital_s11_input_v1(f.job_id,f.capability,(d->>'attemptReceiptId')::uuid);
 if not(i->>'dispatchAllowed')::boolean then raise exception 's11_first_dispatch_denied';end if;
 if(public.worker_record_capital_s11_input_v1(f.job_id,f.capability,(d->>'attemptReceiptId')::uuid)->>'dispatchAllowed')::boolean then raise exception 's11_dispatch_replay_resends';end if;
 update s11_revision_lifecycle set decision=d,input=i;
end$$;
do $$declare f record;t record;n jsonb;o jsonb;accepted_dto jsonb;allocation jsonb;finalfp text;begin
 select * into strict f from s11_revision_recipe_fixture;select * into strict t from s11_revision_lifecycle;select v into strict n from agent_fixture where k='s11_revision_render_product';
 o:=pg_temp.s11_outcome(t.decision,t.input,n->>'outputFingerprint');
 perform public.worker_record_capital_s11_attempt_outcome_v1(f.job_id,f.capability,(t.decision->>'attemptReceiptId')::uuid,o);
 accepted_dto:=jsonb_build_object('schemaVersion','gateway-accepted-invocation.v1','adapterInputVersion','gateway-adapter-input.v1','outputFingerprintVersion','gateway-parsed-output.v1','provider','anthropic','configuredModel','claude-sonnet-5','reportedModel','claude-sonnet-5','schemaName','capital_planning_map_v1','invocationId',t.input->>'invocationId','inputAttestationReceiptId',t.input->>'receiptId','adapterRequestFingerprint',n->>'primaryRequestFingerprint','inputFingerprint',n->>'inputFingerprint','promptFingerprint',n->>'promptFingerprint','outputFingerprint',n->>'outputFingerprint','retryOrdinal',0,'isSameModelRepair',false,'fromCassette',false,'usedProviderFallback',false);
 accepted_dto:=public.worker_record_capital_s11_accepted_v1(f.job_id,f.capability,(t.input->>'receiptId')::uuid,accepted_dto);
 allocation:=public.worker_prepare_capital_s11_output_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,gen_random_uuid(),'parsed',(accepted_dto->>'acceptedInvocationId')::uuid,n->'parsed',n->>'outputFingerprint',null);
 update s11_revision_lifecycle set accepted=accepted_dto,parsed=pg_temp.s11_materialize(f.job_id,f.capability,allocation);
 select * into strict t from s11_revision_lifecycle;
 finalfp:=encode(extensions.digest('["capital-s11-final-output.v1",'||to_jsonb(n->>'outputFingerprint')::text||','||to_jsonb(t.recipe->>'recipeFingerprint')::text||','||to_jsonb(n->>'finalBodyFingerprint')::text||']','sha256'),'hex');
 allocation:=public.worker_prepare_capital_s11_output_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,gen_random_uuid(),'final',(accepted_dto->>'acceptedInvocationId')::uuid,n->'final',finalfp,(t.parsed->>'retainedPayloadId')::uuid);
 update s11_revision_lifecycle set final=pg_temp.s11_materialize(f.job_id,f.capability,allocation),final_fp=finalfp;
end$$;

do $$declare f record;t record;n jsonb;item jsonb;allocation jsonb;retained jsonb;projection jsonb;begin
 select * into strict f from s11_revision_recipe_fixture;select * into strict t from s11_revision_lifecycle;select v into strict n from agent_fixture where k='s11_revision_render_product';
 select value into strict item from jsonb_array_elements(n->'tasks')where value->>'taskId'='M04';
 allocation:=public.worker_prepare_capital_s11_task_projection_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,gen_random_uuid(),(t.recipe->>'producerTaskRunId')::uuid,(t.accepted->>'acceptedInvocationId')::uuid,item->'body',item->>'semanticFingerprint',(t.parsed->>'retainedPayloadId')::uuid);
 retained:=pg_temp.s11_materialize(f.job_id,f.capability,allocation);
 projection:=public.worker_commit_capital_s11_task_projection_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,(t.recipe->>'producerTaskRunId')::uuid,(retained->>'retainedPayloadId')::uuid);
 update s11_revision_lifecycle set commit_receipt=public.worker_commit_capital_s11_result_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,(t.accepted->>'acceptedInvocationId')::uuid,(t.parsed->>'retainedPayloadId')::uuid,(t.final->>'retainedPayloadId')::uuid,t.final_fp,n->'qualityResults');
 select * into strict t from s11_revision_lifecycle;
 if public.worker_commit_capital_s11_result_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,(t.accepted->>'acceptedInvocationId')::uuid,(t.parsed->>'retainedPayloadId')::uuid,(t.final->>'retainedPayloadId')::uuid,t.final_fp,n->'qualityResults')->>'replayed' is distinct from 'true' then raise exception 's11_revised_final_replay_failed';end if;
end $$;
reset role;
do $$declare f record;t record;begin
 select * into strict f from s11_revision_recipe_fixture;select * into strict t from s11_revision_lifecycle;
 if(select count(*)from public.capital_project_task_runs where processing_job_id=f.job_id and status='succeeded')<>2 then raise exception 's11_revision_should_have_only_actual_M04_S11';end if;
 if(select count(*)from private.capital_s11_task_projections where recipe_id=(t.recipe->>'recipeId')::uuid)<>1 then raise exception 's11_revision_should_not_clone_history';end if;
 if(select count(*)from private.capital_s11_input_dispatches where job_id=f.job_id)<>1 then raise exception 's11_revision_dispatch_repeated';end if;
 if not exists(select 1 from private.artifact_dependency_links where organization_id=(f.base->>'organizationId')::uuid and revision_id=(t.commit_receipt->>'revisionId')::uuid and derived_from_revision_id=(select(v->>'priorRevisionId')::uuid from s11_revision_human_fixture where k='grant'))then raise exception 's11_revision_ancestry_missing';end if;
 raise notice 'PASS s11_genuine_return_new_physical_context_licensed_source_one_model_actual_M04_S11_revised_commit_replay_ancestry_without_history_clone';
end $$;
reset role;
savepoint s11_revision_original_c11_missing;
delete from storage.objects where id in(select q.storage_object_id from private.capital_s11_task_projections p join private.capital_public_retained_payloads q on(q.organization_id,q.id)=(p.organization_id,p.derived_retained_payload_id)where p.recipe_id=(select(v->>'predecessorRecipeId')::uuid from s11_revision_human_fixture where k='grant')and p.task_id='C11');
do $$declare t record;begin
 select * into strict t from s11_revision_lifecycle;
 if private.capital_s11_native_read_allowed_v1('a8800000-0000-4000-8000-000000000002',(t.commit_receipt->>'revisionId')::uuid,'a8800000-0000-4000-8000-000000000001')then raise exception 's11_revised_result_survived_original_c11_physical_loss';end if;
 raise notice 'PASS s11_revised_result_inherits_original_C11_physical_loss';
end $$;
rollback to s11_revision_original_c11_missing;
savepoint s11_revision_source_right_revoked;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000994","role":"authenticated"}',true);
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000994"}',true);
set local role authenticated;
select public.set_source_rights_v1(source_version_id,1,'{}'::text[],array['analysis'],null,null,source_version_id,repeat('b',64))from capture_public_license_fixture;
reset role;
do $$declare t record;begin
 select * into strict t from s11_revision_lifecycle;
 if private.capital_s11_native_read_allowed_v1('a8800000-0000-4000-8000-000000000002',(t.commit_receipt->>'revisionId')::uuid,'a8800000-0000-4000-8000-000000000001')then raise exception 's11_revised_result_survived_human_source_right_revocation';end if;
 raise notice 'PASS s11_revised_result_inherits_genuine_human_source_right_revocation';
end $$;
rollback to s11_revision_source_right_revoked;
savepoint s11_second_return;
select set_config('request.jwt.claims','{"sub":"a8800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.headers','{"x-offroad-workspace":"a8800000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
do $$declare t record;b jsonb;returned jsonb;begin
 select * into strict t from s11_revision_lifecycle;
 b:=public.read_capital_project_artifact_review_v2((select(v->>'workId')::uuid from s11_revision_human_fixture where k='base'),(t.commit_receipt->>'capitalArtifactId')::uuid,(t.commit_receipt->>'revisionId')::uuid);
 returned:=public.decide_capital_project_artifact_v2((select(v->>'workId')::uuid from s11_revision_human_fixture where k='base'),(t.commit_receipt->>'capitalArtifactId')::uuid,(t.commit_receipt->>'revisionId')::uuid,b->>'manifestFingerprint',b->>'artifactFingerprint','request_changes','Refinar novamente usando exclusivamente as fontes licenciadas existentes.',false,gen_random_uuid());
 insert into s11_revision_human_fixture values('second_return',returned);
end $$;
reset role;
do $$declare j uuid;begin
 select(v->>'jobId')::uuid into strict j from s11_revision_human_fixture where k='second_return';
 if not private.capital_s11_revision_dispatch_allowed_v1(j)then raise exception 's11_genuine_repeated_return_ancestry_denied';end if;
 if(select count(*)from private.capital_s11_revision_inputs)<>1 then raise exception 's11_human_return_invented_recipe_before_physical_input';end if;
 raise notice 'PASS s11_second_genuine_human_return_rechecks_current_bounded_original_ancestry';
end $$;
reset role;
savepoint s11_revision_stale_original_parent;
update public.capital_project_artifacts set status='stale'where id=(select(commit_receipt->>'capitalArtifactId')::uuid from s11_lifecycle);
do $$declare t record;begin
 select * into strict t from s11_revision_lifecycle;
 if private.capital_s11_native_read_allowed_v1('a8800000-0000-4000-8000-000000000002',(t.commit_receipt->>'revisionId')::uuid,'a8800000-0000-4000-8000-000000000001')then raise exception 's11_stale_original_final_remained_eligible';end if;
 if private.capital_s11_revision_dispatch_allowed_v1((select(v->>'jobId')::uuid from s11_revision_human_fixture where k='second_return'))then raise exception 's11_repeated_return_survived_stale_original_final';end if;
 raise notice 'PASS s11_stale_original_final_denies_revised_read_and_repeated_return';
end $$;
rollback to s11_revision_stale_original_parent;
set local role authenticated;
do $$declare proof uuid;begin
 select(v->>'recipeId')::uuid into strict proof from s11_revision_human_fixture where k='base';
 begin update private.capital_s11_revision_inputs set prior_recipe_id=recipe_id where recipe_id=proof;raise exception 's11_human_lineage_client_mutable';exception when insufficient_privilege then null;end;
 begin perform private.start_capital_s11_revision_producer_v1((select(v->>'job_id')::uuid from s11_revision_human_fixture where k='claim'),(select v->>'capability_token'from s11_revision_human_fixture where k='claim'),proof,repeat('1',64),'{}');raise exception 's11_worker_direct_revision_producer_granted';exception when insufficient_privilege then null;end;
 raise notice 'PASS s11_immutable_human_lineage_and_seal_only_revision_producer_reject_direct_clients';
end $$;
