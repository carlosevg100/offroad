-- Prospective corrective draft. No applied migration is edited.
-- Restore the setup capture's existing NOWAIT authority path before the
-- assessment wrapper can take the same job lock through generic FOR UPDATE.
set search_path='';
do $capture_order$
declare
 definition text;
 original_metadata jsonb;
 needle constant text := ' j:=private.job_for_capability(p_job_id,p_capability_token);';
 replacement constant text := $replacement$ if exists(
  select 1 from public.processing_jobs setup_job
  join private.institutional_model_setup_submissions submission
   on submission.organization_id=setup_job.organization_id
   and submission.intake_session_id=setup_job.intake_session_id
   and submission.id::text=setup_job.payload->>'message_id'
  where setup_job.id=p_job_id and setup_job.kind='agent_operation_brief'
 ) then
  j:=private.institutional_job_for_capture_v1(p_job_id,p_capability_token);
 else
  j:=private.job_for_capability(p_job_id,p_capability_token);
 end if;$replacement$;
begin
 select pg_get_functiondef('private.worker_load_institutional_model_context_v3(uuid,text)'::regprocedure),to_jsonb(p)-'prosrc' into definition,original_metadata
 from pg_proc p where oid='private.worker_load_institutional_model_context_v3(uuid,text)'::regprocedure;
 if (select md5(prosrc) from pg_proc where oid='private.worker_load_institutional_model_context_v3(uuid,text)'::regprocedure)
  is distinct from 'f08727c8008c02788124e520603dda89'
 then raise exception 'institutional_setup_capture_order_source_changed';end if;
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1
 then raise exception 'institutional_setup_capture_order_contract_changed';end if;
 execute replace(definition,needle,replacement);
 if (select to_jsonb(p)-'prosrc' from pg_proc p
  where oid='private.worker_load_institutional_model_context_v3(uuid,text)'::regprocedure)
  is distinct from original_metadata
 then raise exception 'institutional_setup_capture_order_settings_changed';end if;
end $capture_order$;
