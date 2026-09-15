begin;
lock table supabase_migrations.schema_migrations in share row exclusive mode;
do $repair$
begin
 if not exists (select 1 from supabase_migrations.schema_migrations where name='reconcile_preexisting_main_schema_gaps' and md5(btrim(array_to_string(statements,E'\n')))='9396d6b89ea1a89fca99dae5c1b5cfd6') then raise exception 'Consolidation journal proof missing'; end if;
 if to_regclass('private.intent_objective_routing_metrics_by_day') is null
 or not exists(select 1 from pg_class where oid=to_regclass('private.intent_objective_routing_metrics_by_day') and reloptions @> array['security_invoker=true'])
 or to_regclass('private.capital_project_material_upload_grants') is null
 or to_regprocedure('public.worker_authorize_capital_project_material_upload_v1(uuid,text,text,bigint,text,text)') is null
 or to_regprocedure('private.worker_authorize_capital_project_material_upload_v1(uuid,text,text,bigint,text,text)') is null
 or to_regprocedure('public.worker_complete_capital_project_material_upload_v1(uuid,text,uuid,text)') is null
 or to_regprocedure('private.worker_complete_capital_project_material_upload_v1(uuid,text,uuid,text)') is null
 or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='case_artifacts_objects_select' and qual like '%can_read_completed_capital_project_material%')
 or not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='case_artifacts_objects_insert' and with_check like '%worker_can_access_capital_project_material%')
 or position('select distinct on (plan_task.task_id, artifact.artifact_type)' in pg_get_functiondef('private.worker_load_capital_project_context_v6(uuid,text)'::regprocedure))=0
 or position('order by plan_task.task_id, artifact.artifact_type, artifact.created_at desc, artifact.id desc' in pg_get_functiondef('private.worker_load_capital_project_context_v6(uuid,text)'::regprocedure))=0
 or position(') order by latest.task_id, latest.artifact_type)' in pg_get_functiondef('private.worker_load_capital_project_context_v6(uuid,text)'::regprocedure))=0
 then raise exception 'Installed consolidation effects missing'; end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version in ('20260907062224','20260907070000','20260907095418')) then raise exception 'Target history already present; inspect before repair'; end if;
end $repair$;
-- History repair only. These bodies were executed by the consolidation, not by this repair.
-- NULL statements deliberately do not claim another execution of the original SQL.
insert into supabase_migrations.schema_migrations(version,name) values
 ('20260907062224','intent_objective_routing_metrics'),
 ('20260907070000','governed_capital_material_storage'),
 ('20260907095418','preserve_decision_contract_and_method_artifacts');
commit;
select version,name,statements from supabase_migrations.schema_migrations where version in ('20260907062224','20260907070000','20260907095418') order by version;
