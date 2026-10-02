CREATE OR REPLACE FUNCTION private.worker_finish_capital_project_task(p_job_id uuid, p_capability_token text, p_task_run_id uuid, p_status text, p_output_reference jsonb DEFAULT NULL::jsonb, p_output_fingerprint text DEFAULT NULL::text, p_quality_results jsonb DEFAULT '[]'::jsonb, p_usage jsonb DEFAULT '{}'::jsonb, p_error jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
begin
 if p_status='failed' and exists(select 1 from private.capital_m07_recipe_seals z where z.organization_id=j.organization_id and z.task_run_id=p_task_run_id) then raise exception 'capital_m07_native_quality_required' using errcode='42501';end if;
 if p_status='succeeded' and exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=j.organization_id and tr.id=p_task_run_id and pt.task_id='M07') then raise exception 'capital_m07_native_commit_required' using errcode='42501';end if;
 return private.worker_finish_capital_project_task_pre_m07(p_job_id,p_capability_token,p_task_run_id,p_status,p_output_reference,p_output_fingerprint,p_quality_results,p_usage,p_error);
end; $function$
