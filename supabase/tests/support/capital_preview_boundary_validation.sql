-- EXTERNAL SUPPORT EVAL: execute only in an authorized rollback database session.
-- No runtime result is claimed by distributing this file.
\set ON_ERROR_STOP on
begin;
create temp table preview_performance_before on commit drop as
select oid,oid::regprocedure::text signature,proacl,prosecdef,provolatile,proconfig,prosrc,
 proname in ('capital_preview_projection_deadline_v1','capital_preview_allocation_deadline_v1',
 'capital_preview_run_deadline_v1','worker_seal_capital_preview_boundary_v1') unchanged_body
from pg_proc where pronamespace='private'::regnamespace and proname in
 ('require_capital_preview_run_v1','require_capital_preview_recipe_v1',
 'worker_prepare_capital_preview_boundary_v1','capital_preview_projection_deadline_v1',
 'capital_preview_allocation_deadline_v1','capital_preview_run_deadline_v1',
 'worker_seal_capital_preview_boundary_v1');
\ir ../../pending/capital_preview_boundary_validation.sql
do $$declare role_name text;helper text;begin
 if (select count(*) from pg_temp.preview_performance_before)<>7 then
 raise exception 'preview_performance_snapshot_count';end if;
 if exists(select 1 from pg_temp.preview_performance_before b left join pg_proc p on p.oid=b.oid
 where p.oid is null or p.proacl is distinct from b.proacl or p.prosecdef is distinct from b.prosecdef
 or p.provolatile is distinct from b.provolatile or p.proconfig is distinct from b.proconfig
 or (b.unchanged_body and p.prosrc is distinct from b.prosrc))then
 raise exception 'preview_performance_wrapper_or_untouched_contract_changed';end if;
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
