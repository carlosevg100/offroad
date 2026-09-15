select
 (select version from supabase_migrations.schema_migrations where name='reconcile_preexisting_main_schema_gaps') as consolidation_version,
 (select md5(btrim(array_to_string(statements,E'\n'))) from supabase_migrations.schema_migrations where name='reconcile_preexisting_main_schema_gaps') as consolidation_md5,
 to_regclass('private.intent_objective_routing_metrics_by_day') is not null as metrics_exists,
 (select reloptions from pg_class where oid=to_regclass('private.intent_objective_routing_metrics_by_day')) as metrics_options,
 to_regclass('private.capital_project_material_upload_grants') is not null as upload_grants_exists,
 position('select distinct on (plan_task.task_id, artifact.artifact_type)' in pg_get_functiondef('private.worker_load_capital_project_context_v6(uuid,text)'::regprocedure))>0 as artifact_distinct,
 position('order by plan_task.task_id, artifact.artifact_type, artifact.created_at desc, artifact.id desc' in pg_get_functiondef('private.worker_load_capital_project_context_v6(uuid,text)'::regprocedure))>0 as artifact_inner_order,
 position(') order by latest.task_id, latest.artifact_type)' in pg_get_functiondef('private.worker_load_capital_project_context_v6(uuid,text)'::regprocedure))>0 as artifact_outer_order,
 (select md5(string_agg(pg_get_functiondef(p.oid),E'\n' order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f') as functions_md5,
 (select md5(string_agg(row_to_json(c)::text,E'\n' order by table_schema,table_name,ordinal_position)) from information_schema.columns c where table_schema in ('public','private')) as columns_md5,
 (select md5(string_agg(row_to_json(p)::text,E'\n' order by schemaname,tablename,policyname)) from pg_policies p where schemaname in ('public','private','storage')) as policies_md5;
