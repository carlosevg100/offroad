CREATE OR REPLACE FUNCTION private.worker_load_institutional_model_context_v3(p_job_id uuid, p_capability_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.processing_jobs;begin
 if exists(
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
 end if;
 if j.kind='case_analysis'and exists(select 1 from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id and origin in('case_input','case_effective_input'))then
  return private.worker_load_assessment_institutional_context_v1(j.id,p_capability_token);
 end if;
 return private.worker_load_institutional_before_assessment_v3(j.id,p_capability_token);
end$function$
