-- A bounded plan may require only one or two real workstreams. Do not invent tasks to
-- satisfy presentation cardinality; preserve the existing exact plan-task coverage checks.
alter table public.capital_project_execution_briefs
  drop constraint capital_project_execution_briefs_workstream_count_check;
alter table public.capital_project_execution_briefs
  add constraint capital_project_execution_briefs_workstream_count_check
  check (workstream_count between 1 and 7);
do $migration$
declare definition text;
begin
  definition:=pg_get_functiondef('private.worker_record_capital_project_execution_brief_v1(uuid,text,jsonb,jsonb,uuid,jsonb)'::regprocedure);
  if position('if workstream_count not between 3 and 7' in definition)=0 then
    raise exception 'execution brief workstream validator drift';
  end if;
  execute replace(definition,'if workstream_count not between 3 and 7','if workstream_count not between 1 and 7');
end;
$migration$;
