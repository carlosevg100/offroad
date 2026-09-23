CREATE OR REPLACE FUNCTION private.job_sources_rights_current_v1(p_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when j.kind='work_execution' then private.execution_inputs_current_v1(j.organization_id,j.execution_id,j.authorization_subject_id)
 else private.legacy_job_sources_rights_current_v1(j.id) end from public.processing_jobs j where j.id=p_job_id;
$function$
