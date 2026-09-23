CREATE OR REPLACE FUNCTION private.request_work_execution_v1(p_profile_id uuid, p_contract_text text, p_snapshot_text text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.request_work_execution_as_subject_v1(auth.uid(),p_profile_id,p_contract_text,p_snapshot_text);
$function$
