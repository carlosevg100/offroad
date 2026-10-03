-- Contract checks; integrated positive producer fixture runs separately.
begin;
set search_path='';
do $$declare ns oid;cmd text;def text;begin
 select oid into strict ns from pg_class where oid='private.capital_s11_task_projections'::regclass and relrowsecurity and relforcerowsecurity;
 foreach cmd in array array['r','a','w','d'] loop
 if not exists(select 1 from pg_policy where polrelid=ns and polcmd=cmd::"char" and not polpermissive) then raise exception 's11_task_explicit_policy_missing:%',cmd;end if;
 end loop;
 if has_table_privilege('authenticated','private.capital_s11_task_projections','SELECT') or has_table_privilege('service_role','private.capital_s11_task_projections','INSERT') then raise exception 's11_task_raw_grant';end if;
 if private.capital_s11_task_type_v1('M01') is distinct from 'company_scope' or private.capital_s11_task_type_v1('M04') is distinct from 'candidate_archetypes' or private.capital_s11_task_type_v1('C11') is distinct from 'structuring_thesis' or private.capital_s11_task_type_v1('S10') is distinct from 'alternative_comparison' then raise exception 's11_task_map_wrong';end if;
 if private.capital_s11_task_type_v1('M07') is not null or private.capital_s11_task_type_v1('S11') is not null or private.capital_s11_task_type_v1('fake') is not null then raise exception 's11_task_map_widened';end if;
 if not has_function_privilege('authenticated','public.worker_prepare_capital_s11_task_projection_v1(uuid,text,uuid,uuid,uuid,uuid,jsonb,text,uuid)','EXECUTE') or not has_function_privilege('authenticated','public.worker_commit_capital_s11_task_projection_v1(uuid,text,uuid,uuid,uuid)','EXECUTE') then raise exception 's11_task_consumer_grant_missing';end if;
 if not has_function_privilege('authenticated','public.worker_prepare_capital_s11_recovered_task_projection_v1(uuid,text,uuid,uuid,uuid,uuid,jsonb,text,uuid)','EXECUTE') or not has_function_privilege('authenticated','public.worker_commit_capital_s11_recovered_task_projection_v1(uuid,text,uuid,uuid,uuid)','EXECUTE') or not has_function_privilege('authenticated','public.worker_read_capital_s11_recovered_task_body_v1(uuid,text,uuid,uuid)','EXECUTE') then raise exception 's11_task_recovery_consumer_grant_missing';end if;
 if has_function_privilege('anon','private.capital_s11_physical_allocation_bound_v1(uuid,uuid,uuid)','EXECUTE') or has_function_privilege('authenticated','private.capital_s11_physical_allocation_bound_v1(uuid,uuid,uuid)','EXECUTE') or has_function_privilege('service_role','private.capital_s11_physical_allocation_bound_v1(uuid,uuid,uuid)','EXECUTE') then raise exception 's11_physical_bound_authority_grant';end if;
 select pg_get_functiondef('private.capital_s11_allocation_deadline_v1(uuid,uuid,uuid)'::regprocedure) into def;
 if position('private.capital_s11_recipe_deadline_v1(p_org,b.recipe_id,p_subject)' in def)=0 or position('private.capital_s11_physical_allocation_bound_v1(p_org,p_allocation,b.recipe_id)' in def)=0 then raise exception 's11_current_authority_or_physical_bound_missing';end if;
 select pg_get_functiondef('private.capital_s11_physical_allocation_bound_v1(uuid,uuid,uuid)'::regprocedure) into def;
 if position('private.capital_s11_recipe_deadline_v1' in def)>0 or position('b.recipe_id is distinct from p_recipe' in def)=0 or position('private.capital_body_physical_receipt_v1' in def)=0 or position('q.status=''pending''' in def)=0 then raise exception 's11_physical_bound_not_closed';end if;
 if has_function_privilege('authenticated','private.capital_s11_task_recipe_v1(uuid,text,uuid,uuid,boolean)','EXECUTE') or has_function_privilege('authenticated','private.require_capital_s11_task_run_v1(uuid,uuid,uuid,uuid)','EXECUTE') then raise exception 's11_task_internal_grant';end if;
 select pg_get_functiondef('private.guard_capital_s11_task_projection_v1()'::regprocedure) into def;
 if position('left join private.capital_s11_recipes' in def)=0 or position('scope=''capital_planning''' in def)=0 then raise exception 's11_task_uncaptured_old_writer_bypass';end if;
 if not exists(select 1 from pg_trigger where tgrelid=ns and tgname='capital_s11_tasks_updated_at') or not exists(select 1 from pg_trigger where tgrelid=ns and tgname='capital_s11_tasks_audit') then raise exception 's11_task_required_triggers_missing';end if;
 raise notice 'PASS s11_task_map_RLS_grants_no_uncaptured_shortcut';
end; $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000991","role":"authenticated"}',true);
do $$declare denied boolean:=false;begin
 begin
 perform public.worker_prepare_capital_s11_task_projection_v1('10000000-0000-4000-8000-000000000992','not-a-real-capability','10000000-0000-4000-8000-000000000993','10000000-0000-4000-8000-000000000994','10000000-0000-4000-8000-000000000995',null,'{"schemaVersion":"capital-planning-task.v1","taskId":"M01","artifactType":"company_scope","content":{}}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','10000000-0000-4000-8000-000000000996');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 's11_task_fake_prelude_capability_allowed';end if;
 denied:=false;
 begin perform public.worker_commit_capital_s11_task_projection_v1('10000000-0000-4000-8000-000000000992','not-a-real-capability','10000000-0000-4000-8000-000000000993','10000000-0000-4000-8000-000000000995','10000000-0000-4000-8000-000000000996');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 's11_task_fake_commit_capability_allowed';end if;
 denied:=false;
 begin perform public.worker_prepare_capital_s11_recovered_task_projection_v1('10000000-0000-4000-8000-000000000992','not-a-real-capability','10000000-0000-4000-8000-000000000993','10000000-0000-4000-8000-000000000994','10000000-0000-4000-8000-000000000995',null,'{}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','10000000-0000-4000-8000-000000000996');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 's11_recovery_fake_prepare_allowed';end if;
 denied:=false;
 begin perform public.worker_commit_capital_s11_recovered_task_projection_v1('10000000-0000-4000-8000-000000000992','not-a-real-capability','10000000-0000-4000-8000-000000000993','10000000-0000-4000-8000-000000000995','10000000-0000-4000-8000-000000000996');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 's11_recovery_fake_commit_allowed';end if;
 denied:=false;
 begin perform public.worker_read_capital_s11_recovered_task_body_v1('10000000-0000-4000-8000-000000000992','not-a-real-capability','10000000-0000-4000-8000-000000000993','10000000-0000-4000-8000-000000000995');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 's11_recovery_fake_read_allowed';end if;
 raise notice 'PASS s11_task_no_fake_capability_or_prelude';
end; $$;
reset role;
rollback;
