-- Client presentation template: the corporate visual identity a delivery is rendered with.
--
-- What this is:
--   * One validated record per organization, plus an optional record per capital project for a
--     team that prepares work for more than one company. The project record wins when it exists.
--   * The record holds the palette, the typography, an optional logo stored as an object reference
--     with its SHA-256, and its own identity and version. A fingerprint computed in the database
--     from the canonical definition binds the identity to every file exported under it.
--   * The Offroad template stays the default: an organization with no record keeps rendering with
--     the house identity, and clearing the record returns to it.
--
-- What this is not: importing an arbitrary PowerPoint, master, animation or proprietary layout.
-- Support for native template files needs its own scope and validation.
--
-- Typography rule, deliberate and enforced here: the PDF renderer embeds a fixed set of families,
-- so the record always carries an explicit PDF alternative chosen by a person. A font outside that
-- set is never silently replaced; the editable Word and PowerPoint keep the client's real font
-- name and the PDF uses the alternative that was explicitly recorded.
--
-- Authorization: only organization owners and administrators write. Every member with access to
-- the project reads, because the surface must show which identity a file will carry.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-templates', 'brand-templates', false, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The first path segment is the organization, exactly like the other private buckets.
create policy brand_templates_objects_select on storage.objects for select to authenticated
using (bucket_id = 'brand-templates' and (select private.is_org_member(private.storage_organization_id(name))));
create policy brand_templates_objects_insert on storage.objects for insert to authenticated
with check (bucket_id = 'brand-templates' and (select private.can_manage_organization(private.storage_organization_id(name))));
create policy brand_templates_objects_update on storage.objects for update to authenticated
using (bucket_id = 'brand-templates' and (select private.can_manage_organization(private.storage_organization_id(name))))
with check (bucket_id = 'brand-templates' and (select private.can_manage_organization(private.storage_organization_id(name))));
create policy brand_templates_objects_delete on storage.objects for delete to authenticated
using (bucket_id = 'brand-templates' and (select private.can_manage_organization(private.storage_organization_id(name))));

create table public.presentation_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid,
  scope text not null check (scope in ('organization', 'project')),
  template_key text not null check (template_key ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  template_version text not null check (template_version ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-v[0-9]{1,3}$'),
  origin text not null check (origin in ('offroad_house', 'client_supplied')),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint presentation_templates_scope_target check ((scope = 'organization') = (capital_project_id is null)),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade
);
create unique index presentation_templates_target_idx
  on public.presentation_templates (organization_id, capital_project_id) nulls not distinct;
create index presentation_templates_updated_by_idx on public.presentation_templates(updated_by);
create index presentation_templates_created_by_idx on public.presentation_templates(created_by);
alter table public.presentation_templates enable row level security;
alter table public.presentation_templates force row level security;
create policy presentation_templates_select on public.presentation_templates for select to authenticated
  using (
    case when capital_project_id is null
      then (select private.is_org_member(organization_id))
      else (select private.can_access_capital_project(organization_id, capital_project_id))
    end
  );
create policy presentation_templates_deny_insert on public.presentation_templates for insert to authenticated with check (false);
create policy presentation_templates_deny_update on public.presentation_templates for update to authenticated using (false) with check (false);
create policy presentation_templates_deny_delete on public.presentation_templates for delete to authenticated using (false);
revoke all privileges on public.presentation_templates from public, anon, authenticated;
grant select on public.presentation_templates to authenticated;
create trigger presentation_templates_set_updated_at before update on public.presentation_templates
  for each row execute function private.set_updated_at();
create trigger presentation_templates_audit after insert or update or delete on public.presentation_templates
  for each row execute function private.capture_audit_event();
comment on table public.presentation_templates is
  'Validated visual identity used to render a delivery. One row per organization plus an optional row per project; the project row wins. Absence means the Offroad house template.';

-- The families the PDF renderer can embed. A client font outside this set is kept for the editable
-- formats and needs an explicit alternative here for the PDF; nothing is substituted silently.
create or replace function private.presentation_template_pdf_fonts()
returns text[] language sql immutable set search_path = '' as $$
  select array['Helvetica', 'Times New Roman', 'Courier New'];
$$;

/*
 * Structural validation of a template definition. It refuses anything it cannot render rather than
 * accepting a plausible record: a colour that is not a six-digit hex, a font name with characters a
 * document format cannot carry, a PDF alternative outside the embeddable set, a logo without its
 * hash or size, or a logo stored outside the organization's own prefix.
 */
create or replace function private.validate_presentation_template(p_organization_id uuid, p_definition jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare colors jsonb; fonts jsonb; logo jsonb; label text; key text; value text; canonical jsonb;
begin
  if p_definition is null or jsonb_typeof(p_definition) <> 'object' then raise exception 'invalid_presentation_template' using errcode = '22023'; end if;
  colors := p_definition -> 'colors'; fonts := p_definition -> 'fonts'; logo := p_definition -> 'logo';
  label := nullif(p_definition ->> 'confidentiality_label', '');
  if jsonb_typeof(colors) <> 'object' or jsonb_typeof(fonts) <> 'object' then raise exception 'invalid_presentation_template' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(colors)) <> 6 then raise exception 'invalid_presentation_template_colors' using errcode = '22023'; end if;
  foreach key in array array['ink', 'paper', 'accent', 'muted', 'warning', 'danger'] loop
    value := colors ->> key;
    if value is null or value !~ '^[0-9A-F]{6}$' then raise exception 'invalid_presentation_template_colors' using errcode = '22023'; end if;
  end loop;
  foreach key in array array['display', 'body'] loop
    value := fonts ->> key;
    if value is null or char_length(value) not between 2 and 64 or value !~ '^[A-Za-z0-9 ()+.-]+$' then
      raise exception 'invalid_presentation_template_fonts' using errcode = '22023';
    end if;
  end loop;
  foreach key in array array['pdf_display', 'pdf_body'] loop
    value := fonts ->> key;
    if value is null or not (value = any (private.presentation_template_pdf_fonts())) then
      raise exception 'unsupported_presentation_template_font' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) from jsonb_object_keys(fonts)) <> 4 then raise exception 'invalid_presentation_template_fonts' using errcode = '22023'; end if;
  if logo is not null and jsonb_typeof(logo) <> 'null' then
    if jsonb_typeof(logo) <> 'object'
      or (logo ->> 'sha256') !~ '^[a-f0-9]{64}$'
      or (logo ->> 'content_type') not in ('image/png', 'image/jpeg')
      or coalesce((logo ->> 'byte_length')::bigint, 0) not between 1 and 2097152
      or (logo ->> 'object_path') is null
      or (storage.foldername(logo ->> 'object_path'))[1] is distinct from p_organization_id::text
      or not exists (select 1 from storage.objects o where o.bucket_id = 'brand-templates' and o.name = logo ->> 'object_path')
    then raise exception 'invalid_presentation_template_logo' using errcode = '22023'; end if;
  end if;
  if label is not null and char_length(label) > 80 then raise exception 'invalid_presentation_template' using errcode = '22023'; end if;
  -- jsonb orders keys canonically, so the same definition always produces the same fingerprint.
  canonical := jsonb_strip_nulls(jsonb_build_object(
    'template_key', p_definition ->> 'template_key',
    'template_version', p_definition ->> 'template_version',
    'origin', p_definition ->> 'origin',
    'colors', colors, 'fonts', fonts,
    'logo', case when logo is null or jsonb_typeof(logo) = 'null' then null else jsonb_build_object(
      'object_path', logo ->> 'object_path', 'sha256', logo ->> 'sha256',
      'byte_length', (logo ->> 'byte_length')::bigint, 'content_type', logo ->> 'content_type') end,
    'confidentiality_label', label));
  return canonical;
end;
$$;

create or replace function private.set_presentation_template_v1(p_organization_id uuid, p_project_id uuid, p_definition jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); v_organization uuid; v_canonical jsonb; v_fingerprint text;
  v_key text; v_version text; v_origin text; existing public.presentation_templates;
begin
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
  if p_definition is null or jsonb_typeof(p_definition) = 'null' then
    if existing.id is null then return jsonb_build_object('template_id', null, 'status', 'cleared', 'replayed', true); end if;
    delete from public.presentation_templates where id = existing.id;
    return jsonb_build_object('template_id', existing.id, 'status', 'cleared', 'replayed', false);
  end if;
  v_key := p_definition ->> 'template_key';
  v_version := p_definition ->> 'template_version';
  v_origin := p_definition ->> 'origin';
  if v_origin not in ('offroad_house', 'client_supplied') then raise exception 'invalid_presentation_template' using errcode = '22023'; end if;
  v_canonical := private.validate_presentation_template(v_organization, p_definition);
  v_fingerprint := encode(extensions.digest(v_canonical::text, 'sha256'), 'hex');
  if existing.id is not null then
    if existing.fingerprint = v_fingerprint then
      return jsonb_build_object('template_id', existing.id, 'status', 'stored', 'replayed', true, 'fingerprint', v_fingerprint);
    end if;
    update public.presentation_templates set template_key = v_key, template_version = v_version,
      origin = v_origin, definition = v_canonical, fingerprint = v_fingerprint, updated_by = caller_id
      where id = existing.id;
    return jsonb_build_object('template_id', existing.id, 'status', 'stored', 'replayed', false, 'fingerprint', v_fingerprint);
  end if;
  insert into public.presentation_templates (organization_id, capital_project_id, scope, template_key, template_version, origin, definition, fingerprint, created_by, updated_by)
    values (v_organization, p_project_id, case when p_project_id is null then 'organization' else 'project' end,
      v_key, v_version, v_origin, v_canonical, v_fingerprint, caller_id, caller_id)
    returning * into existing;
  return jsonb_build_object('template_id', existing.id, 'status', 'stored', 'replayed', false, 'fingerprint', v_fingerprint);
end;
$$;
create or replace function public.set_presentation_template_v1(p_organization_id uuid, p_project_id uuid, p_definition jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_presentation_template_v1(p_organization_id, p_project_id, p_definition);
$$;
revoke all on function private.set_presentation_template_v1(uuid, uuid, jsonb), public.set_presentation_template_v1(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function private.set_presentation_template_v1(uuid, uuid, jsonb), public.set_presentation_template_v1(uuid, uuid, jsonb) to authenticated;

-- One read for the project surface and for the export routes: which identity applies, where it
-- came from, and both records so an administrator can see what it is overriding.
create or replace function private.read_presentation_template_v1(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare project public.capital_projects; organization_row public.presentation_templates; project_row public.presentation_templates; effective public.presentation_templates;
begin
  select * into project from public.capital_projects p
    where p.id = p_project_id and private.can_access_capital_project(p.organization_id, p.id);
  if not found then raise exception 'capital_project_not_found' using errcode = 'P0002'; end if;
  select * into organization_row from public.presentation_templates t
    where t.organization_id = project.organization_id and t.capital_project_id is null;
  select * into project_row from public.presentation_templates t
    where t.organization_id = project.organization_id and t.capital_project_id = project.id;
  if project_row.id is not null then effective := project_row; else effective := organization_row; end if;
  return jsonb_build_object(
    'project_id', project.id,
    'organization_id', project.organization_id,
    'can_manage', private.can_manage_organization(project.organization_id),
    'effective', case when effective.id is null then null else jsonb_build_object(
      'template_id', effective.id, 'scope', effective.scope, 'template_key', effective.template_key,
      'template_version', effective.template_version, 'origin', effective.origin,
      'fingerprint', effective.fingerprint, 'definition', effective.definition,
      'updated_at', effective.updated_at) end,
    'organization', case when organization_row.id is null then null else jsonb_build_object(
      'template_id', organization_row.id, 'template_key', organization_row.template_key,
      'template_version', organization_row.template_version, 'origin', organization_row.origin,
      'fingerprint', organization_row.fingerprint, 'definition', organization_row.definition) end,
    'project', case when project_row.id is null then null else jsonb_build_object(
      'template_id', project_row.id, 'template_key', project_row.template_key,
      'template_version', project_row.template_version, 'origin', project_row.origin,
      'fingerprint', project_row.fingerprint, 'definition', project_row.definition) end,
    'pdf_fonts', to_jsonb(private.presentation_template_pdf_fonts()));
end;
$$;
create or replace function public.read_presentation_template_v1(p_project_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_presentation_template_v1(p_project_id);
$$;
revoke all on function private.read_presentation_template_v1(uuid), public.read_presentation_template_v1(uuid) from public, anon, authenticated;
grant execute on function private.read_presentation_template_v1(uuid), public.read_presentation_template_v1(uuid) to authenticated;
