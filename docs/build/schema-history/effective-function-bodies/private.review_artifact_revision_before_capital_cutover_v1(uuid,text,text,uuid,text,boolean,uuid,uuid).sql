CREATE OR REPLACE FUNCTION private.review_artifact_revision_before_capital_cutover_v1(p_revision_id uuid, p_expected_fingerprint text, p_act text, p_block_id uuid, p_note text, p_self_approval_declared boolean, p_command_id uuid, p_basis_review_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();r public.artifact_revisions;a public.artifacts;org uuid;
 policy jsonb;mode text;preparer uuid;block_key_value text;basis public.artifact_reviews;existing public.artifact_reviews;
 change jsonb;review_id uuid;has_substance boolean;
begin
 select * into r from public.artifact_revisions where id=p_revision_id;
 select * into a from public.artifacts where organization_id=r.organization_id and id=r.artifact_id;
 org:=private.lock_review_work_v1(a.work_id);
 if org is distinct from r.organization_id then raise exception 'review_work_access_required' using errcode='42501'; end if;
 if p_expected_fingerprint is distinct from r.manifest_fingerprint then raise exception 'artifact_review_stale' using errcode='22023'; end if;
 if p_act is null or p_act not in ('comment','return','approve','reaffirm','revoke_approval') or p_command_id is null
  or p_self_approval_declared is null or (p_note is not null and length(btrim(p_note)) not between 1 and 5000)
 then raise exception 'artifact_review_invalid' using errcode='22023'; end if;
 -- All content-bearing acts, including comments, require the complete inherited source closure.
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501'; end if;
 if p_block_id is not null then
  select b.block_key into block_key_value from public.artifact_blocks b where b.organization_id=org and b.revision_id=r.id and b.id=p_block_id;
  if not found or p_act not in ('comment','return') then raise exception 'review_block_act_invalid' using errcode='22023'; end if;
 end if;
 policy:=private.review_policy_snapshot_v1(org,a.work_id,actor);
 mode:=case when (policy->>'assignmentRequired')::boolean then 'assigned' when (policy->>'selfApprovalAllowed')::boolean then 'individual' else 'open' end;
 preparer:=private.artifact_review_preparer_v1(r);
 if (policy->>'assignmentRequired')::boolean and p_act<>'comment' and not (
  (p_act in ('approve','reaffirm','revoke_approval') and policy->'roles' ? 'approver')
  or (p_act='return' and (policy->'roles' ? 'reviewer' or policy->'roles' ? 'approver')))
 then raise exception 'review_assignment_required' using errcode='42501'; end if;
 if p_act in ('approve','reaffirm') then
  has_substance:=(exists(select 1 from private.capital_debt_native_bindings nb where nb.organization_id=org and nb.revision_id=r.id and exists(select 1 from private.capital_debt_recipe_components src where src.organization_id=nb.organization_id and src.recipe_id=nb.recipe_id and src.slot='source') and private.capital_debt_native_read_allowed_v1(org,r.id,actor))) or (exists(select 1 from private.capital_s11_native_bindings nb where nb.organization_id=org and nb.revision_id=r.id and exists(select 1 from private.capital_s11_recipe_components src where src.organization_id=nb.organization_id and src.recipe_id=nb.recipe_id and src.slot='source') and private.capital_s11_native_read_allowed_v1(org,r.id,actor))) or (exists(select 1 from private.capital_m07_native_bindings nb where nb.organization_id=org and nb.revision_id=r.id and exists(select 1 from private.capital_m07_recipe_components src where src.organization_id=nb.organization_id and src.recipe_id=nb.recipe_id and src.slot='source') and private.capital_m07_native_read_allowed_v1(org,r.id,actor))) or jsonb_array_length(r.manifest->'sources')>0 or jsonb_typeof(r.manifest->'execution')='object'
   or jsonb_typeof(r.manifest->'institutionalResult')='object'
   or exists(select 1 from public.artifact_blocks b where b.organization_id=org and b.revision_id=r.id and jsonb_array_length(b.claims)>0)
   or (a.kind='answer' and exists(select 1 from public.artifact_blocks b where b.organization_id=org and b.revision_id=r.id)
    and not exists(select 1 from public.artifact_blocks b where b.organization_id=org and b.revision_id=r.id
     and (b.kind not in ('section','paragraph') or jsonb_array_length(b.claims)>0 or private.artifact_content_carries_number_v1(b.content))));
  if not has_substance and exists(select 1 from private.material_production_bindings where(organization_id,revision_id)=(org,r.id)) then has_substance:=(exists(select 1 from private.capital_debt_native_bindings nb where nb.organization_id=org and nb.revision_id=r.id and exists(select 1 from private.capital_debt_recipe_components src where src.organization_id=nb.organization_id and src.recipe_id=nb.recipe_id and src.slot='source') and private.capital_debt_native_read_allowed_v1(org,r.id,actor))) or (exists(select 1 from private.capital_s11_native_bindings nb where nb.organization_id=org and nb.revision_id=r.id and exists(select 1 from private.capital_s11_recipe_components src where src.organization_id=nb.organization_id and src.recipe_id=nb.recipe_id and src.slot='source') and private.capital_s11_native_read_allowed_v1(org,r.id,actor))) or private.material_package_review_current_v1(org,r.id,actor);end if; if not has_substance and exists(select 1 from private.capital_preview_native_bindings where(organization_id,revision_id)=(org,r.id)) then has_substance:=private.capital_preview_native_read_allowed_v1(org,r.id,actor);end if; if not has_substance then raise exception 'review_substance_required' using errcode='23514'; end if;
  if preparer=actor and (not (policy->>'selfApprovalAllowed')::boolean or not p_self_approval_declared)
  then raise exception 'capital_project_self_approval_forbidden' using errcode='42501'; end if;
 end if;
 if p_act in ('reaffirm','revoke_approval') then
  select * into basis from public.artifact_reviews where organization_id=org and id=p_basis_review_id;
  if basis.id is null or basis.artifact_id<>r.artifact_id or basis.work_id<>a.work_id or basis.audience<>r.audience or basis.act not in ('approve','reaffirm')
   or (p_act='revoke_approval' and basis.revision_id<>r.id)
   or (p_act='reaffirm' and (basis.revision_id=r.id or not private.artifact_review_is_active_v1(org,basis.id)))
  then raise exception 'artifact_review_basis_invalid' using errcode='22023'; end if;
  if p_act='reaffirm' then
   if not private.artifact_review_sources_allowed_v1(org,basis.revision_id,actor) then raise exception 'review_source_access_required' using errcode='42501'; end if;
   change:=private.artifact_revision_change_v1(basis.revision_id,r.id);
   if change->>'outcome'<>'cosmetic' then raise exception 'artifact_review_material_change' using errcode='22023'; end if;
  end if;
 elsif p_basis_review_id is not null then raise exception 'artifact_review_basis_invalid' using errcode='22023'; end if;
 select * into existing from public.artifact_reviews where organization_id=org and work_id=a.work_id and command_id=p_command_id;
 if found then
  if existing.revision_id<>r.id or existing.manifest_fingerprint<>p_expected_fingerprint or existing.act<>p_act or existing.reviewer_id<>actor
   or existing.block_id is distinct from p_block_id or existing.note is distinct from p_note
   or existing.self_approval_declared<>p_self_approval_declared or existing.basis_review_id is distinct from p_basis_review_id
  then raise exception 'artifact_review_replay_mismatch' using errcode='23505'; end if;
  if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501';end if;
  return jsonb_build_object('reviewId',existing.id,'revisionId',r.id,'act',existing.act,'replayed',true);
 end if;
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501';end if;
 insert into public.artifact_reviews(organization_id,work_id,artifact_id,revision_id,manifest_fingerprint,audience,act,reviewer_id,prepared_by,
  self_approval_declared,review_mode,policy_snapshot,block_id,block_key,basis_review_id,change_report,command_id,note)
 values(org,a.work_id,a.id,r.id,r.manifest_fingerprint,r.audience,p_act,actor,preparer,p_self_approval_declared,mode,policy,p_block_id,block_key_value,p_basis_review_id,change,p_command_id,p_note)
 returning id into review_id;
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501';end if;
 return jsonb_build_object('reviewId',review_id,'revisionId',r.id,'act',p_act,'replayed',false);
end $function$
