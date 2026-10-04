-- Evaluate the already-installed prospective or canonical preview contract.
-- The launcher owns installation; this rollback-only eval never reapplies guarded DDL.
\set ON_ERROR_STOP on
begin;
do $$declare role_name text;helper text;current_function record;begin
 if (select count(*) from pg_proc where pronamespace='private'::regnamespace and proname in
 ('require_capital_preview_run_v1','require_capital_preview_recipe_v1',
 'worker_prepare_capital_preview_boundary_v1','capital_preview_projection_deadline_v1',
 'capital_preview_allocation_deadline_v1','capital_preview_run_deadline_v1',
 'worker_seal_capital_preview_boundary_v1'))<>7 then
 raise exception 'preview_performance_snapshot_count';end if;
 for current_function in select oid,prosecdef,provolatile,proconfig,proacl,proowner,
 proname in ('worker_prepare_capital_preview_boundary_v1','worker_seal_capital_preview_boundary_v1') worker_command
 from pg_proc where pronamespace='private'::regnamespace and proname in
 ('require_capital_preview_run_v1','require_capital_preview_recipe_v1',
 'worker_prepare_capital_preview_boundary_v1','capital_preview_projection_deadline_v1',
 'capital_preview_allocation_deadline_v1','capital_preview_run_deadline_v1',
 'worker_seal_capital_preview_boundary_v1')loop
 if not current_function.prosecdef or current_function.provolatile<>'v'
 or current_function.proconfig is distinct from array['search_path=""']::text[]
 or has_function_privilege('authenticated',current_function.oid,'EXECUTE')is distinct from current_function.worker_command
 or has_function_privilege('anon',current_function.oid,'EXECUTE')
 or has_function_privilege('service_role',current_function.oid,'EXECUTE')
 or exists(select 1 from aclexplode(coalesce(current_function.proacl,acldefault('f',current_function.proowner)))acl where acl.grantee=0 and acl.privilege_type='EXECUTE')then
 raise exception 'preview_performance_wrapper_or_untouched_contract_changed';end if;
 end loop;
 foreach helper in array array[
 'private.require_capital_preview_run_proof_v1(uuid,text,uuid,boolean)',
 'private.capital_preview_projection_leaf_deadline_v1(uuid,uuid,text,timestamptz)']loop
 foreach role_name in array array['anon','authenticated','service_role']loop
 if has_function_privilege(role_name,helper,'EXECUTE')then
 raise exception 'preview_performance_helper_api_privilege';end if;
 end loop;
 if not exists(select 1 from pg_proc where oid=helper::regprocedure and prosecdef
 and provolatile='v' and proconfig=array['search_path=""']::text[])then
 raise exception 'preview_performance_helper_execution_contract';end if;
 end loop;
end$$;
-- Both catalog and actual role invocation are required: body-thrown 42501 alone is insufficient.
set local role anon;
do $$begin
 begin perform private.require_capital_preview_run_proof_v1(null,null,null,true);
 raise exception 'preview_performance_anon_proof_bypass';exception when insufficient_privilege then null;end;
 begin perform private.capital_preview_projection_leaf_deadline_v1(null,null,null,null);
 raise exception 'preview_performance_anon_leaf_bypass';exception when insufficient_privilege then null;end;
end$$;
reset role;
set local role authenticated;
do $$begin
 begin perform private.require_capital_preview_run_proof_v1(null,null,null,true);
 raise exception 'preview_performance_authenticated_proof_bypass';exception when insufficient_privilege then null;end;
 begin perform private.capital_preview_projection_leaf_deadline_v1(null,null,null,null);
 raise exception 'preview_performance_authenticated_leaf_bypass';exception when insufficient_privilege then null;end;
end$$;
reset role;
set local role service_role;
do $$begin
 begin perform private.require_capital_preview_run_proof_v1(null,null,null,true);
 raise exception 'preview_performance_service_proof_bypass';exception when insufficient_privilege then null;end;
 begin perform private.capital_preview_projection_leaf_deadline_v1(null,null,null,null);
 raise exception 'preview_performance_service_leaf_bypass';exception when insufficient_privilege then null;end;
end$$;
reset role;
select 'preview_performance_acl_and_untouched_bodies' as test,'PASS' as result;
rollback;
