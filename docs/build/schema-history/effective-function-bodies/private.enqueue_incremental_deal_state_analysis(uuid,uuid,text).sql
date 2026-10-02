CREATE OR REPLACE FUNCTION private.enqueue_incremental_deal_state_analysis(p_organization_id uuid, p_session_id uuid, p_trigger_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 if p_trigger_source='material_package_approved' and exists(select 1 from private.material_production_recipes where(organization_id,session_id)=(p_organization_id,p_session_id)) and not exists(select 1 from private.material_package_review_intents i join public.artifact_reviews v on(v.organization_id,v.id)=(i.organization_id,i.review_id) join private.material_production_bindings b on(b.organization_id,b.revision_id)=(v.organization_id,v.revision_id) join private.material_production_recipes r on(r.organization_id,r.id)=(b.organization_id,b.recipe_id) where i.organization_id=p_organization_id and r.session_id=p_session_id and i.actor_id=auth.uid() and i.transaction_id=txid_current() and not exists(select 1 from private.material_package_review_projections p where(p.organization_id,p.review_id)=(i.organization_id,i.review_id)) and v.act='approve' and private.material_package_review_current_v1(i.organization_id,v.revision_id,auth.uid())) then raise exception 'material_package_native_review_required' using errcode='42501';end if;
 return private.enqueue_incremental_deal_state_analysis_pre_material_package_v1(p_organization_id,p_session_id,p_trigger_source);
end$function$
