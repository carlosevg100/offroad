-- A terminal preview task writes both its method artifact and the cross-surface decision contract.
-- The context loader used to keep only one row per task id, so the newer decision contract hid the
-- method artifact. On the following turn this erased the previous meeting brief and, with it, the
-- unanswered governed questions. Keep the latest row per task *and artifact type* instead.

do $$
declare
  function_definition text := pg_get_functiondef(
    'private.worker_load_capital_project_context_v6(uuid,text)'::regprocedure
  );
  old_distinct text := 'select distinct on (plan_task.task_id)';
  new_distinct text := 'select distinct on (plan_task.task_id, artifact.artifact_type)';
  old_inner_order text := 'order by plan_task.task_id, artifact.created_at desc, artifact.id desc';
  new_inner_order text := 'order by plan_task.task_id, artifact.artifact_type, artifact.created_at desc, artifact.id desc';
  old_outer_order text := ') order by latest.task_id)';
  new_outer_order text := ') order by latest.task_id, latest.artifact_type)';
begin
  if position(old_distinct in function_definition) = 0
    or position(old_inner_order in function_definition) = 0
    or position(old_outer_order in function_definition) = 0 then
    raise exception 'capital project context artifact selection drifted; refusing unsafe rewrite';
  end if;

  execute replace(
    replace(
      replace(function_definition, old_distinct, new_distinct),
      old_inner_order, new_inner_order
    ),
    old_outer_order, new_outer_order
  );
end;
$$;

comment on function private.worker_load_capital_project_context_v6(uuid, text) is
  'Loads governed project context and the latest artifact per task and artifact type, preserving method memory alongside cross-surface decision contracts.';
