-- Project template controls and organization template controls project their own authority.
set search_path='';
do $$ declare definition text;replacement text;begin
 select pg_get_functiondef('private.read_presentation_template_v1(uuid)'::regprocedure) into definition;
 replacement:=replace(definition,
  '''can_manage'', private.can_manage_organization(project.organization_id),',
  '''can_manage'', private.can_manage_organization(project.organization_id) and (private.method_scope_allowed_v1(project.organization_id,''work'') or private.can_access_resource_v1(project.organization_id,project.id,''manage'')),
    ''can_manage_organization'', private.can_manage_organization(project.organization_id) and private.method_scope_allowed_v1(project.organization_id,''work''),
    ''can_manage_project'', private.can_manage_organization(project.organization_id) and private.can_access_resource_v1(project.organization_id,project.id,''manage''),');
 if replacement=definition then raise exception 'template_authoring_projection_anchor_missing';end if;
 execute replacement;
end;$$;
