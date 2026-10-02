CREATE OR REPLACE FUNCTION private.review_institutional_configuration_v1(p_project_id uuid, p_candidate_id uuid, p_expected_parent_fingerprint text, p_decision text, p_expected_candidate_fingerprint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c private.institutional_model_configurations; p private.institutional_configuration_review_projections; proof jsonb;
begin
 select * into c from private.institutional_model_configurations where id=p_candidate_id and capital_project_id=p_project_id;
 if c.id is null or not private.can_access_capital_project(c.organization_id,p_project_id) then raise exception 'institutional_review_forbidden' using errcode='42501';end if;
 proof:=private.institutional_configuration_ancestry_before_review_projection_v1(c.organization_id,p_project_id,c.id);
 select * into p from private.institutional_configuration_review_projections where organization_id=c.organization_id and configuration_id=c.id;
 if proof->>'state'='captured_lineage' or private.institutional_configuration_requires_native_review_v1(c.organization_id,c.id) then
  -- Only the v2 transaction has just inserted an exact server projection while still pending.
  if p.id is null or c.status<>'review_required' or (p.actor_id,p.outcome) is distinct from (auth.uid(),p_decision)
   or not exists(select 1 from public.work_decisions d where (d.organization_id,d.id,d.command_id)=(p.organization_id,p.decision_id,p.command_id)
    and d.outcome=p_decision and d.decided_by=auth.uid()) then raise exception 'institutional_configuration_native_review_required' using errcode='42501';end if;
 end if;
 return private.apply_institutional_configuration_review_before_projection_v1(p_project_id,p_candidate_id,p_expected_parent_fingerprint,p_decision,p_expected_candidate_fingerprint);
end $function$
