-- The execution commit revalidates after lock waits. A transaction-start clock
-- must not keep an expired grant, group membership or barrier admission alive.
-- Preserve the single policy evaluator and its rules; only use the current clock.
set search_path='';
do $$ declare signature text;old text;body text;begin
 foreach signature in array array['private.policy_group_ids_v1(uuid,uuid)','private.evaluate_resource_policy_v1(uuid,uuid,uuid,text,text)'] loop
  select pg_get_functiondef(signature::regprocedure) into old;
  body:=replace(old,'now()','clock_timestamp()');
  if body=old then raise exception 'execution_policy_clock_contract_changed: %',signature;end if;
  execute body;
  execute format('alter function %s volatile',signature);
 end loop;
end $$;
