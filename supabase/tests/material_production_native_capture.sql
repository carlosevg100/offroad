-- Catalogue and denied metadata primitive only; not a positive producer eval.
begin;
do $$declare n text;t oid;begin
 foreach n in array array['material_production_recipes','material_production_source_pins','material_production_body_bases','material_production_seals','material_production_bindings','material_production_plan_precursors','material_production_plan_approvals','material_production_research_seals','material_production_public_source_pins','material_production_cutover','material_production_approval_intents','material_production_terminals'] loop
 t:=to_regclass('private.'||n);
 if t is null or not exists(select 1 from pg_class where oid=t and relrowsecurity and relforcerowsecurity) then raise exception 'material_rls_missing:%',n;end if;
 if(select count(*) from pg_policy where polrelid=t and polcmd in('r','a','w','d'))<>4 then raise exception 'material_four_policies_missing:%',n;end if;
 if has_table_privilege('authenticated',t,'SELECT') or has_table_privilege('service_role',t,'INSERT') then raise exception 'material_direct_grant:%',n;end if;
 if not exists(select 1 from pg_trigger where tgrelid=t and tgname=n||'_audit') or not exists(select 1 from pg_trigger where tgrelid=t and tgname=n||'_updated_at') then raise exception 'material_required_trigger:%',n;end if;
 end loop;
 if private.material_production_sources_current_v1('a9300000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000002','a9300000-0000-4000-8000-000000000003') then raise exception 'missing_material_recipe_admitted';end if;
 if has_function_privilege('authenticated','private.material_production_sources_current_v1(uuid,uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','private.material_production_source_closure_fingerprint_v1(uuid,uuid)','EXECUTE') then raise exception 'material_internal_grant';end if;
 if private.material_production_allocation_deadline_v1('a9300000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000002','a9300000-0000-4000-8000-000000000003') is not null then raise exception 'missing_material_allocation_admitted';end if;
 if not has_function_privilege('authenticated','public.worker_commit_material_production_body_v1(uuid,text,uuid,uuid,text,text,bigint)','EXECUTE') or has_function_privilege('authenticated','private.worker_can_access_capital_public_payload_pre_material_v1(text,text,text)','EXECUTE') then raise exception 'material_command_grant_invalid';end if;
 raise notice 'PASS material_catalogue_four_policies_audit_no_missing_recipe';
end$$;
rollback;
