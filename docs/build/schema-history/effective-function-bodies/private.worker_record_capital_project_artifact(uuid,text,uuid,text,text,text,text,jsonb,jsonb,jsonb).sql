CREATE OR REPLACE FUNCTION private.worker_record_capital_project_artifact(p_job_id uuid, p_capability_token text, p_task_run_id uuid, p_artifact_type text, p_schema_version text, p_status text, p_input_fingerprint text, p_content jsonb, p_evidence_refs jsonb DEFAULT '[]'::jsonb, p_dependencies jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
begin
 if (p_artifact_type='meeting_brief' and j.payload->>'analysis_scope'='origination_thesis') or exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=j.organization_id and tr.id=p_task_run_id and pt.task_id='M07') then raise exception 'capital_m07_native_commit_required' using errcode='42501';end if;
 return private.worker_record_capital_project_artifact_pre_m07(p_job_id,p_capability_token,p_task_run_id,p_artifact_type,p_schema_version,p_status,p_input_fingerprint,p_content,p_evidence_refs,p_dependencies);
end; $function$
