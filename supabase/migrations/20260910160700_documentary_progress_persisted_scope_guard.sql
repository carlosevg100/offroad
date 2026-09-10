-- Progress may use an unapproved documentary dispatch to show its own waiting state,
-- but the stored targets and task set must still match the released documentary graph.
-- A released snapshot alone must not expose stages after its persisted scope changes.
do $migration$
declare definition text; needle text := 'and private.is_released_documentary_plan_v1(p.snapshot,p.entry_job)';
begin
  definition := pg_get_functiondef('private.read_capital_project_execution_brief_progress_v1(uuid)'::regprocedure);
  if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1 then
    raise exception 'documentary_progress_persisted_scope_guard_drift';
  end if;
  execute replace(definition,needle,needle||E'\n      and p.target_task_ids = array(select jsonb_array_elements_text(p.snapshot#>''{job,targetTaskIds}''))\n      and (select array_agg(t.task_id order by t.task_id) from public.capital_project_plan_tasks t\n        where t.organization_id=p.organization_id and t.plan_id=p.id) = array[''Q01'',''Q02'',''Q03'']::text[]');
end;
$migration$;
