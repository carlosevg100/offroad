CREATE OR REPLACE FUNCTION private.job_authority_is_current_v1(p_job_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.processing_jobs;p private.material_package_review_projections;v public.artifact_reviews;b private.material_production_bindings;target uuid;
begin
 if not private.job_authority_is_current_pre_material_package_v1(p_job_id) then return false;end if;
 select * into j from public.processing_jobs where id=p_job_id;
 target:=case when j.kind='execution_brief_proposal' then(j.payload->>'approval_target_job_id')::uuid else j.id end;
 select * into p from private.material_package_review_projections where(organization_id,effect_job_id)=(j.organization_id,target);
 if p.id is null then return true;end if;
 select * into v from public.artifact_reviews where(organization_id,id)=(p.organization_id,p.review_id);
 select * into b from private.material_production_bindings where(organization_id,id)=(p.organization_id,p.binding_id);
 return v.id is not null and private.material_package_approval_is_current_v1(v.organization_id,v.id) and private.material_production_revision_allowed_v1(b.organization_id,b.revision_id,j.authorization_subject_id);
end$function$
