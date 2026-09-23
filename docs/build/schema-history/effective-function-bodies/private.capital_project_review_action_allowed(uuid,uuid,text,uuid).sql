CREATE OR REPLACE FUNCTION private.capital_project_review_action_allowed(p_organization_id uuid, p_project_id uuid, p_action text, p_preparer uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id uuid := (select auth.uid()); roles text[]; mode text;
begin
  if p_action not in ('prepare', 'return', 'approve') then
    raise exception 'invalid_review_action' using errcode = '22023';
  end if;
  if caller_id is null or not private.can_access_capital_project(p_organization_id, p_project_id) then
    return 'capital_project_not_found';
  end if;
  mode := private.capital_project_review_mode(p_organization_id, p_project_id);
  if mode = 'open' then
 if private.can_access_resource_v1(p_organization_id,p_project_id,'work') then return null; end if;
 return 'capital_project_review_role_required';
 end if;
  roles := private.capital_project_review_roles(p_organization_id, p_project_id, caller_id);
  if p_action = 'prepare' and not ('preparer' = any(roles)) then return 'capital_project_review_role_required'; end if;
  if p_action = 'return' and not ('reviewer' = any(roles) or 'approver' = any(roles)) then return 'capital_project_review_role_required'; end if;
  if p_action = 'approve' then
    if not ('approver' = any(roles)) then return 'capital_project_review_role_required'; end if;
    if p_preparer is not null and p_preparer = caller_id
      and not private.capital_project_self_approval_allowed(p_organization_id, p_project_id) then
      return 'capital_project_self_approval_forbidden';
    end if;
  end if;
  return null;
end;
$function$
