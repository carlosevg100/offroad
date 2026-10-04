CREATE OR REPLACE FUNCTION private.worker_finish_capital_project_task(p_job_id uuid, p_capability_token text, p_task_run_id uuid, p_status text, p_output_reference jsonb DEFAULT NULL::jsonb, p_output_fingerprint text DEFAULT NULL::text, p_quality_results jsonb DEFAULT '[]'::jsonb, p_usage jsonb DEFAULT '{}'::jsonb, p_error jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);begin
 if j.payload->>'analysis_scope'in('provider_research','provider_case_fit')and p_status='succeeded'then raise exception 'capital_native_provider_commit_required'using errcode='42501';end if;
 return private.worker_finish_capital_project_task_pre_native(p_job_id,p_capability_token,p_task_run_id,p_status,p_output_reference,p_output_fingerprint,p_quality_results,p_usage,p_error);end$function$
