CREATE OR REPLACE FUNCTION private.approve_advisor_execution_brief_v1(p_project_id uuid, p_execution_brief_id uuid, p_expected_fingerprint text, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if exists(select 1 from private.execution_brief_native_bindings where work_id=p_project_id and execution_brief_id=p_execution_brief_id) then raise exception 'execution_brief_native_review_required' using errcode='42501';end if;
 return private.apply_execution_brief_approval_before_native_capture_v1(p_project_id,p_execution_brief_id,p_expected_fingerprint,p_command_id);
end $function$
