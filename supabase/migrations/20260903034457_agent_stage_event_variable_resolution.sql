-- Existing hosted environments may already have received the first version of
-- worker_record_agent_stage_event_v1, where the local variable agent_plan_id
-- collided with the column of the same name. Fresh databases receive the
-- corrected definition from 20260903025647; this guarded rewrite repairs only
-- environments that still contain the ambiguous version.

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'private.worker_record_agent_stage_event_v1(uuid,text,text,text,jsonb)'::regprocedure
  ) into function_definition;

  if function_definition like '%agent_plan_id uuid;%'
    and function_definition not like '%active_agent_plan_id uuid;%' then
    function_definition := replace(
      function_definition,
      E'  agent_plan_id uuid;',
      E'  active_agent_plan_id uuid;'
    );
    function_definition := replace(
      function_definition,
      'select plan.id into agent_plan_id',
      'select plan.id into active_agent_plan_id'
    );
    function_definition := replace(
      function_definition,
      'if agent_plan_id is null then',
      'if active_agent_plan_id is null then'
    );
    function_definition := replace(
      function_definition,
      'and event.agent_plan_id = agent_plan_id',
      'and event.agent_plan_id = active_agent_plan_id'
    );
    function_definition := replace(
      function_definition,
      'event_id, job_row.organization_id, project_id, agent_plan_id, event_kind',
      'event_id, job_row.organization_id, project_id, active_agent_plan_id, event_kind'
    );

    execute function_definition;
  end if;
end;
$$;
