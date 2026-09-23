CREATE OR REPLACE FUNCTION public.worker_load_case_input(p_job_id uuid, p_capability_token text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select private.worker_load_case_input_legacy_bundle(p_job_id,p_capability_token);
$function$
