CREATE OR REPLACE FUNCTION private.lock_job_authority_v1(p_job_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||organization_id::text,0)) from public.processing_jobs where id=p_job_id;
 -- Revocation locks this same row exclusively. Publication and revocation have a
 -- defined order; a completed revocation cannot be followed by a stale publication.
 perform 1 from private.authorization_revisions r join public.processing_jobs j
 on r.organization_id=j.organization_id and r.resource_id=j.authorization_resource_id and r.subject_user_id=j.authorization_subject_id
 where j.id=p_job_id for share of r;
 return private.job_authority_is_current_v1(p_job_id);
end $function$
