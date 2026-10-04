CREATE OR REPLACE FUNCTION private.worker_record_capital_project_artifact(p_job_id uuid, p_capability_token text, p_task_run_id uuid, p_artifact_type text, p_schema_version text, p_status text, p_input_fingerprint text, p_content jsonb, p_evidence_refs jsonb DEFAULT '[]'::jsonb, p_dependencies jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);begin
 if j.payload->>'analysis_scope'in('provider_research','provider_case_fit')then raise exception 'capital_native_provider_commit_required'using errcode='42501';end if;
 return private.worker_record_capital_project_artifact_pre_native(p_job_id,p_capability_token,p_task_run_id,p_artifact_type,p_schema_version,p_status,p_input_fingerprint,p_content,p_evidence_refs,p_dependencies);end$function$
