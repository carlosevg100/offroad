CREATE OR REPLACE FUNCTION private.set_presentation_template_v1(p_organization_id uuid, p_project_id uuid, p_definition jsonb, p_structure jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller_id uuid := (select auth.uid()); v_organization uuid; v_canonical jsonb; v_structure jsonb; v_definition_fingerprint text; v_fingerprint text;
  v_key text; v_version text; v_origin text; existing public.presentation_templates; same_content public.presentation_template_versions;
  v_version_id uuid; v_version_no integer; reused boolean := false;
begin
 if p_project_id is null and not private.method_scope_allowed_v1(p_organization_id,'work') then raise exception 'template_authoring_denied' using errcode='42501';end if; if p_project_id is not null then perform private.require_resource_access_v1(p_project_id,'manage'); elsif not private.can_manage_organization(p_organization_id) then raise exception 'resource_access_denied' using errcode='42501'; end if;
  if caller_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if (p_organization_id is null) = (p_project_id is null) then raise exception 'invalid_presentation_template_target' using errcode = '22023'; end if;
  if p_project_id is not null then
    select p.organization_id into v_organization from public.capital_projects p
      where p.id = p_project_id and p.status <> 'archived' and private.can_access_capital_project(p.organization_id, p.id);
    if v_organization is null then raise exception 'capital_project_not_found' using errcode = 'P0002'; end if;
  else
    if not (select private.is_org_member(p_organization_id)) then raise exception 'organization_not_found' using errcode = 'P0002'; end if;
    v_organization := p_organization_id;
  end if;
  if not private.can_manage_organization(v_organization) then
    raise exception 'presentation_template_management_denied' using errcode = '42501';
  end if;
  select * into existing from public.presentation_templates t
    where t.organization_id = v_organization and t.capital_project_id is not distinct from p_project_id for update;
  -- Clearing retires: the row, its versions and every pin they carry stay readable by id.
  if p_definition is null or jsonb_typeof(p_definition) = 'null' then
    if existing.id is null or existing.retired_at is not null then return jsonb_build_object('template_id', existing.id, 'status', 'cleared', 'replayed', true); end if;
    update public.presentation_templates set retired_at = now(), retired_by = caller_id, updated_by = caller_id where id = existing.id;
    return jsonb_build_object('template_id', existing.id, 'status', 'cleared', 'replayed', false);
  end if;
  v_key := p_definition ->> 'template_key';
  v_version := p_definition ->> 'template_version';
  v_origin := p_definition ->> 'origin';
  if v_origin not in ('offroad_house', 'client_supplied') then raise exception 'invalid_presentation_template' using errcode = '22023'; end if;
  v_canonical := private.validate_presentation_template(v_organization, p_definition);
  v_structure := private.validate_presentation_template_structure_v1(coalesce(p_structure, private.presentation_template_house_structure_v1()));
  v_definition_fingerprint := encode(extensions.digest(v_canonical::text, 'sha256'), 'hex');
  -- jsonb orders keys canonically, so the same definition and structure always produce the same fingerprint.
  v_fingerprint := encode(extensions.digest(jsonb_build_object('definition', v_canonical, 'structure', v_structure)::text, 'sha256'), 'hex');
  if existing.id is null then
    insert into public.presentation_templates (organization_id, capital_project_id, scope, template_key, template_version, origin, definition, fingerprint, created_by, updated_by)
      values (v_organization, p_project_id, case when p_project_id is null then 'organization' else 'project' end,
        v_key, v_version, v_origin, v_canonical, v_definition_fingerprint, caller_id, caller_id)
      returning * into existing;
  else
    select * into same_content from public.presentation_template_versions v
      where v.organization_id = v_organization and v.template_id = existing.id and v.fingerprint = v_fingerprint;
    if same_content.id is not null and existing.retired_at is null and existing.current_version_id = same_content.id then
      return jsonb_build_object('template_id', existing.id, 'status', 'stored', 'replayed', true, 'fingerprint', v_fingerprint,
        'version_id', same_content.id, 'version_no', same_content.version_no, 'definition_fingerprint', v_definition_fingerprint, 'reused_version', false);
    end if;
  end if;
  if same_content.id is not null then
    -- The content of an earlier version: the pointer moves back to it; nothing is rewritten.
    v_version_id := same_content.id; v_version_no := same_content.version_no; reused := true;
  else
    select coalesce(max(v.version_no), 0) + 1 into v_version_no from public.presentation_template_versions v
      where v.organization_id = v_organization and v.template_id = existing.id;
    insert into public.presentation_template_versions (organization_id, template_id, version_no, definition, structure, fingerprint, created_by)
      values (v_organization, existing.id, v_version_no, v_canonical, v_structure, v_fingerprint, caller_id)
      returning id into v_version_id;
  end if;
  update public.presentation_templates set template_key = v_key, template_version = v_version, origin = v_origin,
    current_version_id = v_version_id, retired_at = null, retired_by = null, updated_by = caller_id
    where id = existing.id;
  return jsonb_build_object('template_id', existing.id, 'status', 'stored', 'replayed', false, 'fingerprint', v_fingerprint,
    'version_id', v_version_id, 'version_no', v_version_no, 'definition_fingerprint', v_definition_fingerprint, 'reused_version', reused);
end;
$function$
