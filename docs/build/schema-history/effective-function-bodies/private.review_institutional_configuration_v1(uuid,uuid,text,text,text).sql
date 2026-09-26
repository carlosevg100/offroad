CREATE OR REPLACE FUNCTION private.review_institutional_configuration_v1(p_project_id uuid, p_candidate_id uuid, p_expected_parent_fingerprint text, p_decision text, p_expected_candidate_fingerprint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org_id uuid;session_id uuid;provenance jsonb;current_context jsonb;
begin
 select organization_id into org_id from public.capital_projects where id=p_project_id;
 if org_id is null or not private.can_access_capital_project(org_id,p_project_id) then raise exception 'institutional_review_forbidden' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=org_id and id=p_project_id for no key update;
 provenance:=private.institutional_configuration_provenance(org_id,p_candidate_id);
 if p_decision='approved' and provenance is not null then
  select intake_session_id into session_id from private.institutional_model_setup_submissions where organization_id=org_id and id=(provenance->>'submissionId')::uuid and capital_project_id=p_project_id;
  current_context:=private.institutional_source_context(org_id,session_id);
  if provenance->>'sourceManifestFingerprint' is distinct from current_context->>'sourceManifestFingerprint' then raise exception 'institutional_review_sources_changed' using errcode='40001';end if;
 end if;
 return private.review_institutional_configuration_before_sources_v1(p_project_id,p_candidate_id,p_expected_parent_fingerprint,p_decision,p_expected_candidate_fingerprint);
end $function$
