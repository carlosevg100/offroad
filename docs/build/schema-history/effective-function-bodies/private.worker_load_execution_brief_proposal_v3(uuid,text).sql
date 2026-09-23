CREATE OR REPLACE FUNCTION private.worker_load_execution_brief_proposal_v3(p_job_id uuid, p_capability_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin perform private.require_receivables_support_sheet_reader(p_job_id,p_capability_token); return private.worker_load_execution_brief_proposal_v4(p_job_id,p_capability_token) #- array['confirmed_receivables_scope','supportSheetCandidates']; end; $function$
