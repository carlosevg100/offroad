CREATE OR REPLACE FUNCTION private.review_institutional_configuration_before_sources_v1(p_project_id uuid, p_candidate_id uuid, p_expected_parent_fingerprint text, p_decision text, p_expected_candidate_fingerprint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c private.institutional_model_configurations; current_fingerprint text;
begin
 select * into c from private.institutional_model_configurations where id=p_candidate_id and capital_project_id=p_project_id;
 if c.id is null or not private.can_access_capital_project(c.organization_id,p_project_id) then raise exception 'institutional_review_forbidden' using errcode='42501'; end if;
 perform 1 from public.capital_projects where organization_id=c.organization_id and id=p_project_id for no key update;
 select * into c from private.institutional_model_configurations where id=p_candidate_id for update;
 select configuration_fingerprint into current_fingerprint from private.institutional_model_configurations where organization_id=c.organization_id and capital_project_id=p_project_id and status='approved' order by revision desc limit 1;
 if c.status<>'review_required' or c.configuration_fingerprint is distinct from p_expected_candidate_fingerprint or c.parent_fingerprint is distinct from p_expected_parent_fingerprint or (p_decision='approved' and current_fingerprint is distinct from p_expected_parent_fingerprint) or coalesce(p_decision,'') not in ('approved','rejected') then raise exception 'institutional_review_stale' using errcode='40001'; end if;
 update private.institutional_model_configurations set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now() where id=c.id;
 return jsonb_build_object('candidateId',c.id,'status',p_decision,'configurationFingerprint',c.configuration_fingerprint);
end $function$
