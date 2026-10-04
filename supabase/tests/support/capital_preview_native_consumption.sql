-- Self-contained catalog/negative gate; the positive SDK uses a real separately
-- approved work and human publication via its explicit loopback launcher.
begin;
set search_path='';
do $$declare name text;table_oid oid;cmd text;row_count integer;begin
 foreach name in array array['capital_preview_consumed_bases','capital_preview_consumed_basis_sources','capital_preview_runs','capital_preview_recipes','capital_preview_recipe_seals','capital_preview_body_bases','capital_preview_operations','capital_preview_gateway_attempts','capital_preview_input_dispatches','capital_preview_attempt_outcomes','capital_preview_accepted_invocations','capital_preview_task_projections','capital_preview_native_bindings','capital_preview_run_results','capital_preview_execution_failures']loop
  table_oid:=to_regclass('private.'||name);
  if table_oid is null then raise exception 'preview_table_missing:%',name;end if;
  if not exists(select 1 from pg_class where oid=table_oid and relrowsecurity and relforcerowsecurity)then raise exception 'preview_rls_not_forced:%',name;end if;
  foreach cmd in array array['r','a','w','d']loop
   if not exists(select 1 from pg_policy where polrelid=table_oid and polcmd=cmd::"char")then raise exception 'preview_policy_missing:%:%',name,cmd;end if;
  end loop;
  if has_table_privilege('authenticated',table_oid,'SELECT')or has_table_privilege('service_role',table_oid,'SELECT')or has_table_privilege('anon',table_oid,'SELECT')then raise exception 'preview_raw_table_exposed:%',name;end if;
  if not exists(select 1 from pg_trigger where tgrelid=table_oid and not tgisinternal and tgname like '%audit%')then raise exception 'preview_audit_missing:%',name;end if;
 end loop;
 foreach name in array array['private.artifact_review_sources_allowed_v1(uuid,uuid,uuid)','private.capital_capture_allocation_deadline_v2(uuid,uuid)']loop
 if has_function_privilege('authenticated',name,'EXECUTE')or has_function_privilege('anon',name,'EXECUTE')or has_function_privilege('service_role',name,'EXECUTE')then raise exception 'preview_common_helper_exposed:%',name;end if;end loop;
 if jsonb_array_length(private.capital_preview_consumed_corpus_registry_v1()->'entries')<>17 then raise exception 'preview_corpus_expanded';end if;
 if jsonb_array_length(private.capital_preview_workflow_v1('prepare_material')->'steps')<>10 then raise exception 'preview_actual_task_count_changed';end if;
 if not has_function_privilege('authenticated','public.worker_read_capital_preview_allocation_v1(uuid,text,uuid)','EXECUTE')or has_function_privilege('anon','public.worker_read_capital_preview_allocation_v1(uuid,text,uuid)','EXECUTE')then raise exception 'preview_reader_grant_invalid';end if;
 if has_function_privilege('authenticated','private.capital_preview_native_read_allowed_v1(uuid,uuid,uuid)','EXECUTE')then raise exception 'preview_helper_exposed';end if;
end$$;
set local role authenticated;
select set_config('request.jwt.claims','{}',true);
do $$begin
 begin perform public.worker_prepare_capital_preview_run_v1(gen_random_uuid(),'not-a-capability',gen_random_uuid(),gen_random_uuid());raise exception 'preview_forged_job_allowed';exception when insufficient_privilege then null;end;
 begin perform public.read_capital_preview_result_body_v1(gen_random_uuid());raise exception 'preview_unknown_revision_allowed';exception when insufficient_privilege then null;end;
end$$;
rollback;
