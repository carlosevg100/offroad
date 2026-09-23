CREATE OR REPLACE FUNCTION private.capital_project_review_roles(p_organization_id uuid, p_project_id uuid, p_user_id uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array_agg(a.review_role order by a.review_role), '{}'::text[])
  from public.capital_project_review_assignments a
  join public.organization_memberships m
    on m.organization_id = a.organization_id and m.user_id = a.user_id and m.status = 'active'
  where private.resource_access_as_subject_v1(p_organization_id,p_project_id,p_user_id,'read') and a.organization_id = p_organization_id and a.capital_project_id = p_project_id and a.user_id = p_user_id;
$function$
