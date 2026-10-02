-- Included after the shared genuine claim/context/seal/report upload prefix.
set local role authenticated;select pg_temp.as_worker();
do $$declare j jsonb;c jsonb;s jsonb;r jsonb;t jsonb;replay jsonb;recovery jsonb;state_scope jsonb;state_receipt jsonb;state_id uuid;domain boolean;begin
 select value::jsonb into strict j from route_proof where label='native_claim';select value::jsonb into strict c from route_proof where label='native_capture';select value::jsonb->'scope' into strict s from route_proof where label='body:calculation_report';
 r:=public.worker_commit_material_production_body_v1((j->>'job_id')::uuid,j->>'capability_token',(s->>'allocationId')::uuid,(select value::uuid from route_proof where label='object:calculation_report'),'material-fixture-v1',s->>'payloadFingerprint',(s->>'byteLength')::bigint);
 domain:=exists(select 1 from route_proof where label='body:case_state');
 if domain then
 select value::jsonb->'scope' into strict state_scope from route_proof where label='body:case_state';
 begin perform public.worker_record_material_production_terminal_v1((j->>'job_id')::uuid,j->>'capability_token',(c#>>'{receipt,recipeId}')::uuid,(r->>'retainedPayloadId')::uuid,gen_random_uuid());raise exception 'terminal_unproven_state_allowed';exception when insufficient_privilege then null;end;
 state_receipt:=public.worker_commit_material_production_body_v1((j->>'job_id')::uuid,j->>'capability_token',(state_scope->>'allocationId')::uuid,(select value::uuid from route_proof where label='object:case_state'),'material-fixture-v1',state_scope->>'payloadFingerprint',(state_scope->>'byteLength')::bigint);state_id:=(state_receipt->>'retainedPayloadId')::uuid;
 end if;
 t:=public.worker_record_material_production_terminal_v1((j->>'job_id')::uuid,j->>'capability_token',(c#>>'{receipt,recipeId}')::uuid,(r->>'retainedPayloadId')::uuid,state_id);
 replay:=public.worker_record_material_production_terminal_v1((j->>'job_id')::uuid,j->>'capability_token',(c#>>'{receipt,recipeId}')::uuid,(r->>'retainedPayloadId')::uuid,state_id);
 if(t-'replayed')<>(replay-'replayed') or not(replay->>'replayed')::boolean or t->>'reportStatus'<>(case when domain then 'succeeded' else 'blocked' end) or t->>'reason'<>(case when domain then 'domain_material_blocked' else 'compiler_blocked' end) then raise exception 'material_terminal_replay_changed';end if;
 recovery:=public.worker_recover_material_production_v1((j->>'job_id')::uuid,j->>'capability_token');
 if recovery->>'schemaVersion'<>'capital-material-terminal-recovery.v1' or recovery#>>'{terminal,reportRetainedPayloadId}'<>r->>'retainedPayloadId' then raise exception 'material_terminal_recovery_changed';end if;
 begin perform public.worker_prepare_material_production_output_v1((j->>'job_id')::uuid,j->>'capability_token',(c#>>'{receipt,recipeId}')::uuid,gen_random_uuid(),'material_package','{}');raise exception 'terminal_new_product_allowed';exception when insufficient_privilege then null;end;
 insert into route_proof values('native_material_terminal',t::text);
 raise notice 'PASS material_blocked_native_terminal_exact_replay_recovery';
end$$;
reset role;
do $$declare recipe uuid;begin
 select(value::jsonb->>'recipeId')::uuid into strict recipe from route_proof where label='native_material_terminal';
 if exists(select 1 from private.material_production_bindings where recipe_id=recipe) or exists(select 1 from private.material_production_body_bases where recipe_id=recipe and kind='material_package') then raise exception 'material_terminal_published_product';end if;
 if not exists(select 1 from public.controlled_case_executions e join private.material_production_recipes p on(p.organization_id,p.controlled_execution_id)=(e.organization_id,e.id) where p.id=recipe and e.status='failed') then raise exception 'material_terminal_left_running';end if;
 raise notice 'PASS material_terminal_no_product_no_running_execution';
end$$;
