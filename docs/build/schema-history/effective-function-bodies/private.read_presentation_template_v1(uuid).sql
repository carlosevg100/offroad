CREATE OR REPLACE FUNCTION private.read_presentation_template_v1(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.capital_projects; organization_row public.presentation_templates; project_row public.presentation_templates; effective public.presentation_templates;
begin
 perform private.require_resource_access_v1(p_project_id,'read');
  select * into project from public.capital_projects p
    where p.id = p_project_id and private.can_access_capital_project(p.organization_id, p.id);
  if not found then raise exception 'capital_project_not_found' using errcode = 'P0002'; end if;
  -- A retired template is not effective, not shown and not offered; its versions stay readable by id.
  select * into organization_row from public.presentation_templates t
    where t.organization_id = project.organization_id and t.capital_project_id is null and t.retired_at is null and private.can_read_presentation_template_v1(t.organization_id,t.id);
  select * into project_row from public.presentation_templates t
    where t.organization_id = project.organization_id and t.capital_project_id = project.id and t.retired_at is null and private.can_read_presentation_template_v1(t.organization_id,t.id);
  if project_row.id is not null then effective := project_row; else effective := organization_row; end if;
  return jsonb_build_object(
    'project_id', project.id,
    'organization_id', project.organization_id,
    'can_manage', private.can_manage_organization(project.organization_id),
    'effective', private.presentation_template_json_v1(effective.organization_id, effective.id),
    'organization', private.presentation_template_json_v1(organization_row.organization_id, organization_row.id),
    'project', private.presentation_template_json_v1(project_row.organization_id, project_row.id),
    'house_structure', private.presentation_template_house_structure_v1(),
    'pdf_fonts', to_jsonb(private.presentation_template_pdf_fonts()));
end;
$function$
