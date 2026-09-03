-- The original assessment command used the same identifier for a local variable and the
-- assessment_ref column. Existing environments already hold that function body, so rewrite only
-- the local identifier in place. Fresh environments receive the corrected body directly in the
-- preceding migration. The guarded rewrite keeps both migration paths equivalent.

do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'private.worker_record_agent_assessment_v1(uuid,text,jsonb)'::regprocedure
  ) into function_definition;

  if position('  assessment_ref text;' in function_definition) > 0 then
    function_definition := replace(
      function_definition, '  assessment_ref text;', '  assessment_reference text;'
    );
    function_definition := replace(
      function_definition, '  assessment_ref := nullif', '  assessment_reference := nullif'
    );
    function_definition := replace(
      function_definition,
      '  if assessment_ref is null or char_length(assessment_ref) > 300 then',
      '  if assessment_reference is null or char_length(assessment_reference) > 300 then'
    );
    function_definition := replace(
      function_definition, 'decision.assessment_ref = assessment_ref',
      'decision.assessment_ref = assessment_reference'
    );
    function_definition := replace(
      function_definition, E'      assessment_ref, (decision_item',
      E'      assessment_reference, (decision_item'
    );
    function_definition := replace(
      function_definition, E'''assessment_ref'' = assessment_ref',
      E'''assessment_ref'' = assessment_reference'
    );
    function_definition := replace(
      function_definition, E'''assessment_ref'', assessment_ref,',
      E'''assessment_ref'', assessment_reference,'
    );

    if position('  assessment_ref text;' in function_definition) > 0
      or function_definition ~ 'decision\.assessment_ref = assessment_ref([^a-zA-Z0-9_]|$)'
      or function_definition ~ '''assessment_ref'' = assessment_ref([^a-zA-Z0-9_]|$)'
      or function_definition ~ '''assessment_ref'', assessment_ref([^a-zA-Z0-9_]|$)' then
      raise exception 'agent_assessment_variable_rewrite_incomplete';
    end if;
    execute function_definition;
  end if;
end;
$migration$;
