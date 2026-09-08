-- Correct the earlier legacy infected branch, which precedes the additive taxonomy rule.
-- Preserve every other branch and the already reconciled worker failure implementation.
do $reconcile$
declare
  definition text;
  old_branch text := $old$when coalesce(p_error ->> 'reason', '') = 'infected' then 'authorization'$old$;
begin
  select pg_get_functiondef('private.job_failure_class(jsonb)'::regprocedure) into definition;
  if private.job_failure_class('{"reason":"infected","signature":"x"}'::jsonb) <> 'invalid_input' then
    if array_length(string_to_array(definition,old_branch),1) <> 2 then
      raise exception 'legacy infected classification branch drifted';
    end if;
    execute replace(definition,old_branch,
      $new$when coalesce(p_error ->> 'reason', '') = 'infected' then 'invalid_input'$new$);
  end if;
  if private.job_failure_class('{"reason":"infected","signature":"x"}'::jsonb) <> 'invalid_input'
    or private.job_failure_class('{"reason":"unreadable_document"}'::jsonb) <> 'invalid_input' then
    raise exception 'rejected document classification parity not established';
  end if;
end;
$reconcile$;
