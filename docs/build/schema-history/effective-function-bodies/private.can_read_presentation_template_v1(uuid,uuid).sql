CREATE OR REPLACE FUNCTION private.can_read_presentation_template_v1(p_organization_id uuid, p_template_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.presentation_templates t
    where t.organization_id = p_organization_id and t.id = p_template_id
      and case when t.capital_project_id is null
        then private.method_scope_allowed_v1(t.organization_id,'read')
        else private.can_access_capital_project(t.organization_id, t.capital_project_id) end
  );
$function$
