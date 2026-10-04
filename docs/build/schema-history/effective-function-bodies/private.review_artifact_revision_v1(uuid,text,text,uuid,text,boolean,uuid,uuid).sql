CREATE OR REPLACE FUNCTION private.review_artifact_revision_v1(p_revision_id uuid, p_expected_fingerprint text, p_act text, p_block_id uuid, p_note text, p_self_approval_declared boolean, p_command_id uuid, p_basis_review_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b private.capital_debt_native_bindings;c public.capital_project_artifacts;existing public.artifact_reviews;org uuid;begin
 select * into b from private.capital_debt_native_bindings where revision_id=p_revision_id;
 if b.id is not null then
  org:=private.lock_review_work_v1(b.work_id);
  if org is distinct from b.organization_id or not private.can_access_resource_v1(org,b.work_id,'work') then raise exception 'review_work_access_required' using errcode='42501';end if;
  select * into c from public.capital_project_artifacts where organization_id=org and id=b.capital_artifact_id for update;
  select * into existing from public.artifact_reviews where organization_id=org and work_id=b.work_id and command_id=p_command_id;
  if p_act in('approve','return','reaffirm') and c.status in('stale','superseded') and(existing.id is null or p_act<>'return') then
   raise exception 'capital_artifact_review_target_inactive' using errcode='42501';end if;
  if existing.id is not null and existing.act=p_act and p_act in('approve','reaffirm') and not private.artifact_review_is_active_v1(org,existing.id) then raise exception 'capital_artifact_review_not_effective' using errcode='42501';end if;
  if p_act='return' and char_length(trim(coalesce(p_note,''))) not between 2 and 5000 then raise exception 'capital_artifact_return_note_required' using errcode='22023';end if;
 end if;
 return private.review_artifact_revision_before_debt_return_v1(p_revision_id,p_expected_fingerprint,p_act,p_block_id,p_note,p_self_approval_declared,p_command_id,p_basis_review_id);
end $function$
