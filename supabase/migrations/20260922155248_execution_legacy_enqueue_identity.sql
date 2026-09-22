-- Adding processing_jobs.execution_id exposed a legacy variable/column collision.
-- Rename only the local identifier; preserve the legacy payload key and authority.
set search_path='';
do $$ declare prior text; revised text; begin
 select pg_get_functiondef('private.enqueue_primary_case_analysis(uuid,uuid,uuid)'::regprocedure) into prior;
 if position('execution_id uuid;' in prior)=0 or position('job.controlled_execution_id = execution_id' in prior)=0 then
  raise exception 'legacy_enqueue_identity_contract_changed';
 end if;
 revised:=regexp_replace(prior,'\mexecution_id\M','v_controlled_execution_id','g');
 revised:=replace(revised,'''v_controlled_execution_id''','''execution_id''');
 if position('job.controlled_execution_id = v_controlled_execution_id' in revised)=0
 or position('''execution_id'', v_controlled_execution_id' in revised)=0 then
  raise exception 'legacy_enqueue_identity_rewrite_failed';
 end if;
 execute revised;
end $$;
