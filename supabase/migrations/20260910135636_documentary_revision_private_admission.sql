-- The wider entry vocabulary must not widen documentary evidence authority. Some entries also
-- support public research, but the released Q graph always requires authorized private work.
do $migration$
declare signature text; definition text; needle text;
begin
  foreach signature in array array['private.record_capital_project_plan(uuid,jsonb)','private.record_execution_proposal_plan_as_actor(uuid,jsonb,uuid)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    needle:='  if p_snapshot ->> ''schemaVersion'' <> ''capital-project-plan.v1''';
    if position(needle in definition)=0 then raise exception 'documentary admission guard drift'; end if;
    execute replace(definition,needle,'  if private.is_released_documentary_plan_v1(p_snapshot, project_row.entry_job) and project_row.access_basis <> ''authorized_private'' then
    raise exception ''documentary_plan_private_access_required'' using errcode=''42501'';
  end if;'||chr(10)||needle);
  end loop;
end;
$migration$;
revoke all on function private.record_capital_project_plan(uuid,jsonb),private.record_execution_proposal_plan_as_actor(uuid,jsonb,uuid) from public,anon,authenticated;
