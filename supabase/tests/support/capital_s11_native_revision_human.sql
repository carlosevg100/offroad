-- Genuine human return after the complete S11 native SQL lifecycle. These
-- transaction-local Storage/provider observations remain SQL protocol fixtures.
-- The CI installer owns core11 once; a fixture must not replay its DDL.
reset role;
do $installed_revision_contract$
declare signature text; role_name text; table_oid oid:=to_regclass('private.capital_s11_revision_inputs');
begin
 if table_oid is null or not exists(select 1 from pg_class where oid=table_oid and relrowsecurity and relforcerowsecurity) then raise exception 'capital_s11_revision_installed_table_required';end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,table_oid,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'capital_s11_revision_private_table_exposed';end if;
 end loop;
 foreach signature in array array['public.read_capital_project_artifact_review_v2(uuid,uuid,uuid)','public.decide_capital_project_artifact_v2(uuid,uuid,uuid,text,text,text,text,boolean,uuid)','public.worker_load_capital_s11_revision_inputs_v1(uuid,text)'] loop
  if to_regprocedure(signature) is null then raise exception 'capital_s11_revision_installed_rpc_required:%',signature;end if;
  if not has_function_privilege('authenticated',signature,'EXECUTE') or has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('service_role',signature,'EXECUTE') then raise exception 'capital_s11_revision_installed_rpc_acl_invalid:%',signature;end if;
 end loop;
 signature:='private.capital_s11_revision_dispatch_allowed_v1(uuid)';
 if to_regprocedure(signature) is null then raise exception 'capital_s11_revision_installed_guard_required';end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(role_name,signature,'EXECUTE') then raise exception 'capital_s11_revision_dispatch_guard_exposed';end if;
 end loop;
end $installed_revision_contract$;
\ir capital_s11_native_complete.sql
reset role;
create temp table s11_revision_human_fixture(k text primary key,v jsonb);
grant all on s11_revision_human_fixture to authenticated;
insert into s11_revision_human_fixture select 'basis',jsonb_build_object('projectId',r.work_id,'artifactId',b.capital_artifact_id,'revisionId',b.revision_id,'manifestFingerprint',a.manifest_fingerprint,'artifactFingerprint',c.artifact_fingerprint) from private.capital_s11_native_bindings b join private.capital_s11_recipes r on(r.organization_id,r.id)=(b.organization_id,b.recipe_id) join public.artifact_revisions a on(a.organization_id,a.id)=(b.organization_id,b.revision_id) join public.capital_project_artifacts c on(c.organization_id,c.id)=(b.organization_id,b.capital_artifact_id) where r.organization_id='a8800000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims','{"sub":"a8800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.headers','{"x-offroad-workspace":"a8800000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
do $$declare b jsonb;x jsonb;y jsonb;command uuid:=gen_random_uuid();begin
 select v into strict b from pg_temp.s11_revision_human_fixture where k='basis';
 x:=public.read_capital_project_artifact_review_v2((b->>'projectId')::uuid,(b->>'artifactId')::uuid,(b->>'revisionId')::uuid);
 if x->>'artifactType'<>'alternative_map' or not(x->>'workAccess')::boolean then raise exception 's11_human_basis_unproven';end if;
 x:=public.decide_capital_project_artifact_v2((b->>'projectId')::uuid,(b->>'artifactId')::uuid,(b->>'revisionId')::uuid,b->>'manifestFingerprint',b->>'artifactFingerprint','request_changes','Rever as alternativas usando os mesmos dados licenciados, sem pesquisa externa.',false,command);
 y:=public.decide_capital_project_artifact_v2((b->>'projectId')::uuid,(b->>'artifactId')::uuid,(b->>'revisionId')::uuid,b->>'manifestFingerprint',b->>'artifactFingerprint','request_changes','Rever as alternativas usando os mesmos dados licenciados, sem pesquisa externa.',false,command);
 if x->>'jobId' is null or x->>'jobId' is distinct from y->>'jobId' or not(y->>'replayed')::boolean then raise exception 's11_human_return_replay_diverged';end if;
 insert into pg_temp.s11_revision_human_fixture values('returned',x);
end $$;
reset role;
do $$declare j public.processing_jobs;run public.processing_runs;b jsonb;n integer;begin
 select * into strict j from public.processing_jobs where id=(select(v->>'jobId')::uuid from pg_temp.s11_revision_human_fixture where k='returned');
 select * into strict run from public.processing_runs where id=j.processing_run_id;
 if j.status<>'queued' or j.payload->'capital_task_ids'<>'["M04","S11"]' or j.payload->'model_budget'<>'{"max_cost_usd":0.8,"max_calls":1}' or run.budget<>'{"maxCalls":1,"maxCostUsd":0.8,"externalSearchMaxUsd":0}' then raise exception 's11_human_scoped_revision_not_queued';end if;
 if not private.execution_dispatch_is_current(j.id,true) then raise exception 's11_human_revision_dispatch_denied';end if;
 select count(*) into n from public.capital_project_task_runs where processing_job_id=j.id;
 if n<>0 then raise exception 's11_human_return_cloned_TaskRuns';end if;
 select v into b from pg_temp.s11_revision_human_fixture where k='basis';
 if private.artifact_revision_release_v1((select a from public.artifact_revisions a where id=(b->>'revisionId')::uuid))<>'blocked' then raise exception 's11_superseded_display_not_blocked';end if;
 if not private.capital_s11_native_read_allowed_v1(j.organization_id,(b->>'revisionId')::uuid,j.authorization_subject_id) then raise exception 's11_historical_physical_authority_lost';end if;
 raise notice 'PASS s11_real_human_return_scoped_M04_S11_fixed_budget_zero_research_replay_no_cloned_history_and_display_separation';
end $$;

savepoint s11_revision_budget_changed;
update public.processing_runs set budget=jsonb_set(budget,'{maxCostUsd}','0.81') where id=(select(v->>'runId')::uuid from pg_temp.s11_revision_human_fixture where k='returned');
do $$begin if private.capital_s11_revision_dispatch_allowed_v1((select(v->>'jobId')::uuid from pg_temp.s11_revision_human_fixture where k='returned')) then raise exception 's11_changed_budget_dispatch_admitted';end if;raise notice 'PASS s11_return_fixed_budget_cannot_be_enlarged';end $$;
rollback to s11_revision_budget_changed;

savepoint s11_revision_false_projection;
do $$begin
 begin update public.processing_jobs set payload=jsonb_set(payload,'{revision_review_id}',to_jsonb(gen_random_uuid()::text)) where id=(select(v->>'jobId')::uuid from pg_temp.s11_revision_human_fixture where k='returned');raise exception 's11_approved_dispatch_payload_mutable';exception when insufficient_privilege then null;end;
 raise notice 'PASS s11_approved_return_payload_cannot_be_rewritten';end $$;
rollback to s11_revision_false_projection;

savepoint s11_revision_parent_stale;
update public.capital_project_artifacts set status='stale' where id=(select(v->>'artifactId')::uuid from pg_temp.s11_revision_human_fixture where k='basis');
do $$begin if private.capital_s11_revision_dispatch_allowed_v1((select(v->>'jobId')::uuid from pg_temp.s11_revision_human_fixture where k='returned')) then raise exception 's11_stale_prior_dispatch_admitted';end if;raise notice 'PASS s11_stale_prior_denies_return_dispatch';end $$;
rollback to s11_revision_parent_stale;

savepoint s11_revision_reviewer_work;
set local role authenticated;
select public.set_resource_policy_grant_v1((select(v->>'projectId')::uuid from pg_temp.s11_revision_human_fixture where k='basis'),'a8800000-0000-4000-8000-000000000001',null,'work','deny',true,null);
reset role;
do $$begin if private.capital_s11_revision_dispatch_allowed_v1((select(v->>'jobId')::uuid from pg_temp.s11_revision_human_fixture where k='returned')) then raise exception 's11_reviewer_without_work_dispatch_admitted';end if;raise notice 'PASS s11_current_WORK_revocation_denies_return_dispatch';end $$;
rollback to s11_revision_reviewer_work;

savepoint s11_revision_reviewer_assignment;
set local role authenticated;
select public.set_capital_project_review_assignment_v1((select(v->>'projectId')::uuid from pg_temp.s11_revision_human_fixture where k='basis'),'a8800000-0000-4000-8000-000000000001','reviewer',true);
reset role;
select set_config('test.s11.policy.fp',(select private.review_policy_projection_v2('a8800000-0000-4000-8000-000000000002',(v->>'projectId')::uuid)->>'policy_fingerprint' from pg_temp.s11_revision_human_fixture where k='basis'),true);
set local role authenticated;
select public.set_capital_project_review_policy_v2((select(v->>'projectId')::uuid from pg_temp.s11_revision_human_fixture where k='basis'),'inherit','required',current_setting('test.s11.policy.fp'));
select public.set_capital_project_review_assignment_v1((select(v->>'projectId')::uuid from pg_temp.s11_revision_human_fixture where k='basis'),'a8800000-0000-4000-8000-000000000001','reviewer',false);
reset role;
do $$begin if private.capital_s11_revision_dispatch_allowed_v1((select(v->>'jobId')::uuid from pg_temp.s11_revision_human_fixture where k='returned')) then raise exception 's11_withdrawn_required_reviewer_dispatch_admitted';end if;raise notice 'PASS s11_current_required_assignment_revocation_denies_return_dispatch';end $$;
rollback to s11_revision_reviewer_assignment;

reset role;
update public.processing_jobs set available_at=(select coalesce(min(available_at),clock_timestamp())-interval '1 second' from public.processing_jobs)
where id=(select(v->>'jobId')::uuid from pg_temp.s11_revision_human_fixture where k='returned');
set local role authenticated;
insert into pg_temp.s11_revision_human_fixture values('claim',public.worker_claim_job_v3(repeat('d',64),600));
do $$declare j jsonb;g jsonb;x jsonb;begin
 select v into strict j from pg_temp.s11_revision_human_fixture where k='claim';
 if j->>'job_id' is distinct from(select v->>'jobId' from pg_temp.s11_revision_human_fixture where k='returned') then raise exception 's11_exact_revision_claim_missing';end if;
 g:=public.worker_load_capital_s11_revision_inputs_v1((j->>'job_id')::uuid,j->>'capability_token');
 if jsonb_array_length(g->'predecessors')<>4 or g->>'predecessorRecipeId' is distinct from g->>'priorRecipeId' then raise exception 's11_original_physical_predecessors_unproven';end if;
 x:=public.worker_read_capital_s11_revision_body_v1((j->>'job_id')::uuid,j->>'capability_token',(g#>>'{prior,retainedPayloadId}')::uuid);
 if x is distinct from g->'prior' then raise exception 's11_prior_body_scope_changed';end if;
 for x in select value from jsonb_array_elements(g->'predecessors') loop
 if public.worker_read_capital_s11_revision_task_v1((j->>'job_id')::uuid,j->>'capability_token',(x#>>'{projection,taskRunId}')::uuid) is distinct from x->'retention' then raise exception 's11_prior_task_scope_changed';end if;
 end loop;
 x:=public.worker_read_capital_s11_revision_source_v1((j->>'job_id')::uuid,j->>'capability_token',(g#>>'{sources,0,retainedPayloadId}')::uuid);
 if x->>'deliveryId' is distinct from g#>>'{sources,0,deliveryId}' then raise exception 's11_prior_source_scope_changed';end if;
 begin perform public.worker_read_capital_s11_revision_body_v1((j->>'job_id')::uuid,j->>'capability_token',gen_random_uuid());raise exception 's11_unrelated_prior_body_admitted';exception when insufficient_privilege then null;end;
 begin perform public.worker_read_capital_s11_revision_task_v1((j->>'job_id')::uuid,j->>'capability_token',gen_random_uuid());raise exception 's11_unrelated_prior_task_admitted';exception when insufficient_privilege then null;end;
 begin perform public.worker_load_capital_s11_revision_inputs_v1((j->>'job_id')::uuid,repeat('x',64));raise exception 's11_wrong_revision_capability_admitted';exception when insufficient_privilege then null;end;
 insert into pg_temp.s11_revision_human_fixture values('grant',g);
 raise notice 'PASS s11_real_return_claim_exact_prior_body_four_original_predecessors_licensed_source_and_wrong_refs_denied';
end $$;
-- Physical prior bodies supplied here are the exact renderer observations used
-- by the original SQL fixture, never metadata CPA pointers or guessed history.
reset role;
insert into s11_revision_human_fixture(k,v)
select 'predecessor_bodies',jsonb_agg(jsonb_build_object('taskRunId',ref#>>'{projection,taskRunId}','body',case when ref->>'taskId' in('M01','M02') then
 (select x->'body' from jsonb_array_elements((select v->'preludes' from agent_fixture where k='s11_render_product'))x where x->>'taskId'=ref->>'taskId')
 else(select x->'body' from jsonb_array_elements((select v->'tasks' from agent_fixture where k='s11_render_product_2'))x where x->>'taskId'=ref->>'taskId')end) order by ord)
from s11_revision_human_fixture f,jsonb_array_elements(f.v->'predecessors')with ordinality e(ref,ord)where f.k='grant';
set local role authenticated;
do $$declare j jsonb;prior jsonb;preds jsonb;base jsonb;allocation jsonb;begin
 select v into strict j from s11_revision_human_fixture where k='claim';
 select v->'final' into strict prior from agent_fixture where k='s11_render_product_2';
 select v into strict preds from s11_revision_human_fixture where k='predecessor_bodies';
 begin perform public.worker_prepare_capital_s11_recipe_v1((j->>'job_id')::uuid,j->>'capability_token');raise exception 's11_old_recipe_path_bypasses_physical_revision';exception when insufficient_privilege then null;end;
 begin perform public.worker_prepare_capital_s11_revision_recipe_v1((j->>'job_id')::uuid,j->>'capability_token',prior||'{"tampered":true}',preds);raise exception 's11_wrong_prior_body_admitted';exception when insufficient_privilege then null;end;
 base:=public.worker_prepare_capital_s11_revision_recipe_v1((j->>'job_id')::uuid,j->>'capability_token',prior,preds);
 if(base->>'canonicalContext')::jsonb#>'{revision,prior_content}' is distinct from prior then raise exception 's11_finite_revision_prior_missing';end if;
 allocation:=public.worker_prepare_capital_s11_revision_context_v1((j->>'job_id')::uuid,j->>'capability_token',(base->>'recipeId')::uuid,gen_random_uuid(),prior,preds);
 insert into s11_revision_human_fixture values('base',base),('context_allocation',allocation);
 raise notice 'PASS s11_real_revision_finite_context_prior_four_physical_bodies_no_old_prepare_or_tamper';
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata,version)select v->>'bucket',v->>'path',jsonb_build_object('size',(v->>'byteLength')::bigint,'mimetype','application/json'),'s11-revision-context-sql-v1'from s11_revision_human_fixture where k='context_allocation';
insert into s11_revision_human_fixture select 'context_object',jsonb_build_object('id',o.id)from storage.objects o,s11_revision_human_fixture f where f.k='context_allocation'and o.bucket_id=f.v->>'bucket'and o.name=f.v->>'path';
set local role authenticated;
do $$declare j jsonb;a jsonb;c jsonb;delivery jsonb;source jsonb;begin
 select v into strict j from s11_revision_human_fixture where k='claim';select v into strict a from s11_revision_human_fixture where k='context_allocation';
 insert into s11_revision_human_fixture values('context_retained',public.worker_commit_capital_s11_body_v1((j->>'job_id')::uuid,j->>'capability_token',(a->>'allocationId')::uuid,(select(v->>'id')::uuid from s11_revision_human_fixture where k='context_object'),'s11-revision-context-sql-v1',a->>'payloadFingerprint',(a->>'byteLength')::bigint));
 select payload into strict source from capture_public_license_fixture;
 c:=public.worker_load_capital_project_capture_context_v1((j->>'job_id')::uuid,j->>'capability_token');
 delivery:=public.worker_capture_capital_project_delivery_v1((j->>'job_id')::uuid,j->>'capability_token',(c#>>'{capture,id}')::uuid,'s11:revision:published:1',source,jsonb_build_array(jsonb_build_object('kind','published_public_payload')));
 a:=public.worker_prepare_capital_public_payload_v1((j->>'job_id')::uuid,j->>'capability_token',(delivery->>'deliveryId')::uuid,gen_random_uuid(),source);
 insert into s11_revision_human_fixture values('delivery',delivery),('source_allocation',a);
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata,version)select v->>'bucket',v->>'path',jsonb_build_object('size',(v->>'byteLength')::bigint,'mimetype','application/json'),'s11-revision-source-sql-v1'from s11_revision_human_fixture where k='source_allocation';
insert into s11_revision_human_fixture select 'source_object',jsonb_build_object('id',o.id)from storage.objects o,s11_revision_human_fixture f where f.k='source_allocation'and o.bucket_id=f.v->>'bucket'and o.name=f.v->>'path';
set local role authenticated;
do $$declare j jsonb;a jsonb;begin
 select v into strict j from s11_revision_human_fixture where k='claim';select v into strict a from s11_revision_human_fixture where k='source_allocation';
 insert into s11_revision_human_fixture values('source_retained',public.worker_commit_capital_public_payload_v1((j->>'job_id')::uuid,j->>'capability_token',(a->>'allocationId')::uuid,(select(v->>'id')::uuid from s11_revision_human_fixture where k='source_object'),'s11-revision-source-sql-v1',a->>'payloadFingerprint',(a->>'byteLength')::bigint));
end $$;
reset role;
insert into agent_fixture select 's11_revision_render_input',jsonb_build_object('revision',true,'base',b.v,'context',(b.v->>'canonicalContext')::jsonb,'jobId',j.v->>'job_id','recipeId',b.v->>'recipeId','predecessorRecipeId',g.v->>'predecessorRecipeId','predecessors',(select jsonb_agg(x->'projection' order by ord)from jsonb_array_elements(g.v->'predecessors')with ordinality e(x,ord)), 'deliveryId',d.v->>'deliveryId','retainedPayloadId',r.v->>'retainedPayloadId','source',(select payload from capture_public_license_fixture))
from s11_revision_human_fixture b,s11_revision_human_fixture j,s11_revision_human_fixture g,s11_revision_human_fixture d,s11_revision_human_fixture r where b.k='base'and j.k='claim'and g.k='grant'and d.k='delivery'and r.k='source_retained';
