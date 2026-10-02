CREATE OR REPLACE FUNCTION private.review_institutional_configuration_and_calculate_v1(p_project_id uuid, p_candidate_id uuid, p_expected_parent_fingerprint text, p_decision text, p_expected_candidate_fingerprint text, p_request_id uuid, p_locale text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c private.institutional_model_configurations; proof jsonb;
begin
 select * into c from private.institutional_model_configurations where id=p_candidate_id and capital_project_id=p_project_id;
 if c.id is null or not private.can_access_capital_project(c.organization_id,p_project_id) then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 proof:=private.institutional_configuration_ancestry_before_review_projection_v1(c.organization_id,p_project_id,c.id);
 if proof->>'state'='captured_lineage' or private.institutional_configuration_requires_native_review_v1(c.organization_id,c.id) then
  raise exception 'institutional_configuration_native_review_required' using errcode='42501';
 end if;
 -- Imported/historical proposal remains in its previous regime until its own producer cut.
 return private.apply_institutional_configuration_calculation_before_projection_v1(p_project_id,p_candidate_id,p_expected_parent_fingerprint,p_decision,p_expected_candidate_fingerprint,p_request_id,p_locale);
end $function$
