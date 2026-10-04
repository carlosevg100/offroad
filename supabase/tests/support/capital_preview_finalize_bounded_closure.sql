begin;
do $$declare helper regprocedure:='private.require_capital_preview_finalize_leaves_v1(private.capital_preview_runs,jsonb,timestamptz)'::regprocedure;role_name text;def text;begin
 if not(select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid=helper)then raise exception 'preview_finalize_helper_security_invalid';end if;
 foreach role_name in array array['anon','authenticated','service_role']loop
 if has_function_privilege(role_name,helper,'EXECUTE')then raise exception 'preview_finalize_helper_api_granted';end if;
 end loop;
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))acl where p.oid=helper and acl.grantee=0 and acl.privilege_type='EXECUTE')then raise exception 'preview_finalize_helper_public_granted';end if;
 if not has_function_privilege('authenticated','private.worker_finalize_capital_preview_run_v1(uuid,text,uuid,jsonb)','EXECUTE')
 or not has_function_privilege('authenticated','public.worker_finalize_capital_preview_run_v1(uuid,text,uuid,jsonb)','EXECUTE')then raise exception 'preview_finalize_command_acl_changed';end if;
 if has_function_privilege('anon','private.worker_finalize_capital_preview_run_v1(uuid,text,uuid,jsonb)','EXECUTE')
 or has_function_privilege('service_role','private.worker_finalize_capital_preview_run_v1(uuid,text,uuid,jsonb)','EXECUTE')then raise exception 'preview_finalize_command_widened';end if;
 select prosrc into def from pg_proc where oid='private.worker_finalize_capital_preview_run_v1(uuid,text,uuid,jsonb)'::regprocedure;
 if (length(def)-length(replace(def,'private.require_capital_preview_run_proof_v1','')))/length('private.require_capital_preview_run_proof_v1')<>2 then raise exception 'preview_finalize_full_closure_count_changed';end if;
end $$;
rollback;
