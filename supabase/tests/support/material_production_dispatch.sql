-- Actual preceding 3S native producer/approval; no classifier/recipe fixture insert.
insert into route_proof select 'material_dispatch_reference_date',to_char(created_at at time zone 'UTC','YYYY-MM-DD')from public.processing_jobs where id=(select(value::jsonb->>'job_id')::uuid from route_proof where label='native_claim');
set local role authenticated;select pg_temp.as_worker();
do $$declare j jsonb;c jsonb;d jsonb;begin
 select value::jsonb into strict j from route_proof where label='native_claim';
 select value::jsonb into strict c from route_proof where label='native_capture';
 d:=public.worker_read_material_production_dispatch_v1((j->>'job_id')::uuid,j->>'capability_token');
 if d->>'schemaVersion'<>'capital-material-dispatch.v1' or d->>'mode'<>'material' or d->>'workId'<>c#>>'{receipt,workId}' or d->>'productionPlanId'<>c#>>'{receipt,productionPlanId}' then raise exception 'material_dispatch_wrong_native_scope';end if;
 if (c->>'canonicalBody')::jsonb->>'material_reference_date' is distinct from (select value from route_proof where label='material_dispatch_reference_date') then raise exception 'material_date_not_server_captured';end if;
 begin perform public.worker_read_material_production_dispatch_v1((j->>'job_id')::uuid,repeat('f',64));raise exception 'material_wrong_capability_allowed';exception when insufficient_privilege then null;end;
 raise notice 'PASS material_dispatch_native_actual_producer_pinned_date_wrong_capability_denied';
end$$;
select pg_temp.as_owner();
do $$declare j jsonb;begin select value::jsonb into strict j from route_proof where label='native_claim';begin perform public.worker_read_material_production_dispatch_v1((j->>'job_id')::uuid,j->>'capability_token');raise exception 'material_other_actor_allowed';exception when insufficient_privilege then null;end;raise notice 'PASS material_dispatch_other_actor_denied';end$$;
reset role;
savepoint material_dispatch_revocation;
update public.organization_memberships set status='revoked'where(organization_id,user_id)=('d5200000-0000-4000-8000-000000000001','d5100000-0000-4000-8000-000000000001');
set local role authenticated;select pg_temp.as_worker();
do $$declare j jsonb;begin select value::jsonb into strict j from route_proof where label='native_claim';begin perform public.worker_read_material_production_dispatch_v1((j->>'job_id')::uuid,j->>'capability_token');raise exception 'material_revoked_human_dispatch_allowed';exception when insufficient_privilege then null;end;raise notice 'PASS material_dispatch_revoked_human_denied';end$$;
reset role;rollback to material_dispatch_revocation;
