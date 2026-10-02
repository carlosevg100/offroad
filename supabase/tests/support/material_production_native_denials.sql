-- Runtime negatives use exact genuine native result from the preceding fixture.
set local role authenticated;select pg_temp.as_owner();
do $$declare r jsonb;s jsonb;begin
 select value::jsonb into strict r from route_proof where label='native_material_commit';
 s:=public.read_material_production_result_v1((r->>'revisionId')::uuid);
 if s->>'recipeId' is distinct from r->>'recipeId' or s->>'bundleFingerprint' is distinct from r->>'bundleFingerprint' then raise exception 'material_human_read_binding_changed';end if;
 begin perform public.read_material_production_result_v1(gen_random_uuid());raise exception 'material_unknown_revision_allowed';exception when insufficient_privilege then null;end;
 raise notice 'PASS material_human_read_exact_binding_unknown_revision_denied';
end$$;
reset role;
-- Alter only this synthetic object's metadata, then restore it. It is not a
-- physical HTTP purge and no production object is touched.
update storage.objects set metadata=jsonb_build_object('size',1,'mimetype','application/json') where id=(select value::uuid from route_proof where label='object:case_state');
set local role authenticated;select pg_temp.as_owner();
do $$declare r jsonb;begin
 select value::jsonb into strict r from route_proof where label='native_material_commit';
 begin perform public.read_material_production_result_v1((r->>'revisionId')::uuid);raise exception 'material_changed_parent_human_read_allowed';exception when insufficient_privilege then null;end;
end$$;
select pg_temp.as_worker();
do $$declare j jsonb;begin
 select value::jsonb into strict j from route_proof where label='native_claim';
 begin perform public.worker_recover_material_production_v1((j->>'job_id')::uuid,j->>'capability_token');raise exception 'material_changed_parent_recovery_allowed';exception when insufficient_privilege then null;end;
 raise notice 'PASS material_changed_parent_closes_human_read_and_recovery';
end$$;
reset role;
update storage.objects set metadata=jsonb_build_object('size',(select(value::jsonb#>>'{scope,byteLength}')::bigint from route_proof where label='body:case_state'),'mimetype','application/json') where id=(select value::uuid from route_proof where label='object:case_state');
update public.organization_memberships set status='revoked' where(organization_id,user_id)=('d5200000-0000-4000-8000-000000000001','d5100000-0000-4000-8000-000000000001');
set local role authenticated;select pg_temp.as_owner();
do $$declare r jsonb;begin
 select value::jsonb into strict r from route_proof where label='native_material_commit';
 begin perform public.read_material_production_result_v1((r->>'revisionId')::uuid);raise exception 'material_revoked_human_read_allowed';exception when insufficient_privilege then null;end;
end$$;
select pg_temp.as_worker();
do $$declare j jsonb;begin
 select value::jsonb into strict j from route_proof where label='native_claim';
 begin perform public.worker_recover_material_production_v1((j->>'job_id')::uuid,j->>'capability_token');raise exception 'material_revoked_recovery_allowed';exception when insufficient_privilege then null;end;
 raise notice 'PASS material_revocation_closes_human_read_and_recovery';
end$$;
reset role;
