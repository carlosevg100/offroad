-- Catalog/negative contract, self-contained and safe after the corrective draft.
begin;
set search_path='';
do $$declare target_oid regprocedure:='private.capital_preview_storage_job_authority_v1(uuid)'::regprocedure;role_name text;begin
 if not exists(select 1 from pg_proc where pg_proc.oid=target_oid and prosecdef and proconfig=array['search_path=""'])then raise exception 'preview_storage_authority_configuration_invalid';end if;
 foreach role_name in array array['anon','authenticated','service_role']loop
 if has_function_privilege(role_name,target_oid,'EXECUTE')then raise exception 'preview_storage_authority_exposed';end if;end loop;
 if position('private.capital_preview_storage_job_authority_v1(p_allocation)'in(select prosrc from pg_proc where pg_proc.oid='private.capital_preview_storage_allowed_v1(uuid,text)'::regprocedure))=0 then raise exception 'preview_storage_authority_not_bound';end if;
 if private.capital_preview_storage_job_authority_v1(null)or private.capital_preview_storage_job_authority_v1(gen_random_uuid())then raise exception 'preview_storage_unknown_allocation_allowed';end if;
end$$;
rollback;
