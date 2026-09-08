-- Forward parity for the rejected-file taxonomy from the omitted failure-contract migration.
-- No whole-function replacement: preserve every other current branch and worker protections.
do $reconcile$
declare definition text;
begin
  -- The same omitted failure-contract migration corrected rejected-file classification.
  -- Add just that precedence branch; preserve all other current taxonomy rules.
  if private.job_failure_class('{"reason":"infected"}'::jsonb) <> 'invalid_input'
    or private.job_failure_class('{"reason":"unreadable_document"}'::jsonb) <> 'invalid_input' then
    select pg_get_functiondef('private.job_failure_class(jsonb)'::regprocedure) into definition;
    if array_length(string_to_array(definition,
      $classification_anchor$when coalesce(p_error ->> 'code', '') ~* 'invalid_.*input|invalid_case'$classification_anchor$),1) <> 2 then
      raise exception 'failure classification insertion point drifted';
    end if;
    execute replace(definition,
      $classification_anchor$when coalesce(p_error ->> 'code', '') ~* 'invalid_.*input|invalid_case'$classification_anchor$,
      $classification_patch$when coalesce(p_error ->> 'reason', '') in ('infected', 'unreadable_document') then 'invalid_input'
    when coalesce(p_error ->> 'code', '') ~* 'invalid_.*input|invalid_case'$classification_patch$);
  end if;

end;
$reconcile$;
