CREATE OR REPLACE FUNCTION private.worker_record_agent_assessment_v1(p_job_id uuid, p_capability_token text, p_assessment jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.processing_jobs;begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 -- No product users rely on legacy case/preliminary experiments. Deny by
 -- server-owned kind even before capture or after a denied capture rolls back.
 if j.kind in('case_analysis','preliminary_analysis')
  or exists(select 1 from private.assessment_input_snapshots where organization_id=j.organization_id and job_id=j.id) then
  raise exception 'assessment_native_writer_required' using errcode='42501';end if;
 return private.worker_record_agent_assessment_before_native_v1(p_job_id,p_capability_token,p_assessment);
end $function$
