CREATE OR REPLACE FUNCTION private.worker_load_agent_context(p_job_id uuid, p_capability_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.require_receivables_scope_aware_reader(p_job_id,p_capability_token);
 return private.worker_load_agent_base_before_scope(p_job_id,p_capability_token);
end;
$function$
