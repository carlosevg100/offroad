-- Actual worker commands consume bodies from the shared Node renderer.
reset role;
create temp table debt_prelude_fixture(task_id text,task_run_id uuid,allocation jsonb,object_id uuid,retained jsonb,projection jsonb);
grant all on debt_prelude_fixture to authenticated;
do $$declare j jsonb;b jsonb;ctx jsonb;item jsonb;run uuid;allocation jsonb;o uuid;retained jsonb;projection jsonb;deps jsonb;begin
 select v into strict j from debt_proof where k='claim';select v into strict b from debt_proof where k='base';ctx:=(b->>'canonicalContext')::jsonb;
 for item in select value from jsonb_array_elements((select v->'preludes' from agent_fixture where k='debt_render_product')) loop
  set local role authenticated;
  run:=public.worker_start_capital_project_task((j->>'job_id')::uuid,j->>'capability_token',item->>'taskId','offroad.company_debt_view','2026.09.01-v1',item->>'semanticFingerprint',jsonb_build_object('schemaVersion','capital-context-manifest.v1'));
  allocation:=public.worker_prepare_capital_debt_task_projection_v1((j->>'job_id')::uuid,j->>'capability_token',(b->>'recipeId')::uuid,gen_random_uuid(),run,null,item->'body',item->>'semanticFingerprint',(select(v->>'retainedPayloadId')::uuid from debt_proof where k='context_retained'));
  reset role;
  insert into storage.objects(bucket_id,name,metadata,version) values(allocation->>'bucket',allocation->>'path',jsonb_build_object('size',(allocation->>'byteLength')::bigint,'mimetype','application/json'),'debt-prelude-sql-v1') returning id into o;
  set local role authenticated;
  retained:=public.worker_commit_capital_debt_body_v1((j->>'job_id')::uuid,j->>'capability_token',(allocation->>'allocationId')::uuid,o,'debt-prelude-sql-v1',allocation->>'payloadFingerprint',(allocation->>'byteLength')::bigint);
  projection:=public.worker_commit_capital_debt_task_projection_v1((j->>'job_id')::uuid,j->>'capability_token',(b->>'recipeId')::uuid,run,(retained->>'retainedPayloadId')::uuid);
  if projection->>'taskId' is distinct from item->>'taskId' or projection->>'taskRunId' is distinct from run::text then raise exception 'debt_prelude_identity_changed';end if;
  if public.worker_commit_capital_debt_task_projection_v1((j->>'job_id')::uuid,j->>'capability_token',(b->>'recipeId')::uuid,run,(retained->>'retainedPayloadId')::uuid)->>'replayed' is distinct from 'true' then raise exception 'debt_prelude_replay_failed';end if;
  insert into debt_prelude_fixture values(item->>'taskId',run,allocation,o,retained,projection);
  reset role;
 end loop;
 if(select count(*) from debt_prelude_fixture)<>6 or(select count(*) from public.capital_project_task_runs where processing_job_id=(j->>'job_id')::uuid and status='succeeded')<>6 then raise exception 'debt_prelude_incomplete';end if;
 if exists(select 1 from private.capital_debt_accepted_invocations where recipe_id=(b->>'recipeId')::uuid) or exists(select 1 from private.capital_debt_input_dispatches where job_id=(j->>'job_id')::uuid) then raise exception 'debt_prelude_created_model_claim';end if;
 raise notice 'PASS debt_actual_human_approved_full_plan_physical_context_and_shared_Node_prelude_replay_zero_dispatch';
end$$;
\ir capital_debt_native_source.sql
