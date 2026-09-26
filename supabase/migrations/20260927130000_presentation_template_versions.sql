-- Stage 19, increment 5: presentation templates with a versioned semantic structure.
--
-- The problem, measured on main b1d56d62: public.presentation_templates is mutable and keeps no
-- history (set_presentation_template_v1 deletes, updates in place or inserts; the audit trigger
-- records only the operation); the vault pins the mutable row by (template id, reference
-- fingerprint); a template defines only the visual (logo, colours, fonts) with no semantic
-- structure; the worker ignores client templates and renders with the house template.
--
-- What changes:
--   1. New public.presentation_template_versions: immutable, numbered per template, carrying the
--      visual definition (as today), the semantic structure (ordered sections, each with a title
--      per locale, the audiences it is for and fields with key, kind and required flag) and a
--      fingerprint computed here as sha256 of the canonical jsonb text of definition plus
--      structure. Versions are content addressed inside a template: saving the content of the
--      current version replays; saving the content of an older version moves the pointer back to
--      that version instead of writing a duplicate; anything else is version last + 1.
--   2. presentation_templates keeps its columns and gains current_version_id (nullable pointer),
--      retired_at and retired_by. definition and fingerprint on the row are the first definition,
--      frozen: nothing updates them in place any more; readers read the current version. Clearing
--      a template retires it (readers ignore a retired template); storing a definition for a
--      retired target revives it with the next version number.
--   3. set_presentation_template_v1 keeps its three arguments and gains p_structure jsonb default
--      null, which yields the house structure (private.presentation_template_house_structure_v1,
--      the same data packages/case-export/src/presentation-structure.ts exports; the unit test
--      proves both literals equal). The three-argument functions are dropped after their current
--      bodies are pinned by md5, so the existing caller keeps working through the default.
--   4. read_presentation_template_v1 returns the current version id, number, structure and
--      fingerprint alongside what it returned, plus the version history (number, date, author).
--      New read_presentation_template_version_v1(p_version_id) returns one exact version under
--      the same access rule. New worker_read_presentation_template_version_v1(job, capability)
--      lets the worker render with the project's current client version; a storage policy lets
--      the worker holding an active lease for that organization read the logo object.
--   5. The vault pin moves to the exact version: vault_entry_versions gains
--      presentation_template_version_id; submit_vault_entry_version_v1 pins the current version
--      and its fingerprint; vault_reference_allowed_v1 resolves the exact version (legacy rows
--      without a version id keep the old check). Both are restated in full, pinned by md5.
--   6. Backfill: every existing template becomes version 1 with the house structure (production
--      has zero rows; the SQL test proves it on synthetic rows); legacy vault pins whose reference
--      fingerprint equals the frozen definition fingerprint receive version 1.
set search_path='';
set local lock_timeout = '5s';

-- 0. The bodies restated in full or replaced below are pinned to the ones they replace (md5 of
-- pg_proc.prosrc as production carries them, including the authorization line 20260915204116
-- injected by text into the two template commands): a parallel change stops this migration.
do $$begin
 if (select md5(prosrc) from pg_proc where oid='private.set_presentation_template_v1(uuid,uuid,jsonb)'::regprocedure)<>'913cc73f862586271a738fdee2114dda' then
  raise exception 'presentation_template_command_contract_changed';
 end if;
 if (select md5(prosrc) from pg_proc where oid='private.read_presentation_template_v1(uuid)'::regprocedure)<>'2de79292aa23ba038a2da6875ebfe0a0' then
  raise exception 'presentation_template_reader_contract_changed';
 end if;
 if (select md5(prosrc) from pg_proc where oid='private.submit_vault_entry_version_v1(uuid,uuid,uuid,text,text,text,uuid,uuid[])'::regprocedure)<>'49f887bc91622eb5629c1bdff5600ac6' then
  raise exception 'vault_submit_contract_changed';
 end if;
 if (select md5(prosrc) from pg_proc where oid='private.vault_reference_allowed_v1(uuid,uuid,text)'::regprocedure)<>'c6f54c4b0fa187aa0388aefb75513203' then
  raise exception 'vault_reference_contract_changed';
 end if;
end $$;

-- 1. The versions table.
create table public.presentation_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  template_id uuid not null,
  version_no integer not null check (version_no > 0),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  structure jsonb not null check (jsonb_typeof(structure) = 'object'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presentation_template_versions_organization_id_id_key unique (organization_id, id),
  constraint presentation_template_versions_number_key unique (organization_id, template_id, version_no),
  -- Content addressed inside a template: the same definition and structure is one version.
  constraint presentation_template_versions_fingerprint_key unique (organization_id, template_id, fingerprint),
  constraint presentation_template_versions_template_fkey foreign key (organization_id, template_id)
    references public.presentation_templates(organization_id, id)
);
create index presentation_template_versions_fingerprint_idx on public.presentation_template_versions (organization_id, fingerprint);
create index presentation_template_versions_created_by_idx on public.presentation_template_versions (created_by);
comment on table public.presentation_template_versions is
  'Immutable, numbered versions of a presentation template: the visual definition, the semantic structure (sections, fields, audiences) and the fingerprint of both. Written only by set_presentation_template_v1; the vault and every rendered file pin a version, never the mutable row.';
comment on column public.presentation_template_versions.fingerprint is
  'sha256 of jsonb_build_object(definition, structure)::text; the identity a rendered file and a vault pin carry.';

create or replace function private.presentation_template_version_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'presentation_template_version_immutable' using errcode = '55000';
end;
$$;
revoke all on function private.presentation_template_version_guard() from public, anon, authenticated, service_role;
create trigger presentation_template_versions_immutable before update or delete on public.presentation_template_versions
  for each row execute function private.presentation_template_version_guard();
create trigger presentation_template_versions_truncate_guard before truncate on public.presentation_template_versions
  for each statement execute function private.presentation_template_version_guard();
create trigger presentation_template_versions_set_updated_at before update on public.presentation_template_versions
  for each row execute function private.set_updated_at();
create trigger presentation_template_versions_audit after insert or update or delete on public.presentation_template_versions
  for each row execute function private.capture_audit_event();

-- The same rule the template row has: an organization template is read by every member, a project
-- template by whoever accesses the project. Security definer so the policy does not nest RLS.
create or replace function private.can_read_presentation_template_v1(p_organization_id uuid, p_template_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.presentation_templates t
    where t.organization_id = p_organization_id and t.id = p_template_id
      and case when t.capital_project_id is null
        then private.is_org_member(t.organization_id)
        else private.can_access_capital_project(t.organization_id, t.capital_project_id) end
  );
$$;
revoke all on function private.can_read_presentation_template_v1(uuid, uuid) from public, anon, service_role;
grant execute on function private.can_read_presentation_template_v1(uuid, uuid) to authenticated;

alter table public.presentation_template_versions enable row level security;
alter table public.presentation_template_versions force row level security;
create policy presentation_template_versions_select on public.presentation_template_versions for select to authenticated
  using ((select private.can_read_presentation_template_v1(organization_id, template_id)));
create policy presentation_template_versions_deny_insert on public.presentation_template_versions for insert to authenticated with check (false);
create policy presentation_template_versions_deny_update on public.presentation_template_versions for update to authenticated using (false) with check (false);
create policy presentation_template_versions_deny_delete on public.presentation_template_versions for delete to authenticated using (false);
revoke all privileges on public.presentation_template_versions from public, anon, authenticated, service_role;
grant select on public.presentation_template_versions to authenticated;

-- 2. The template row points at its current version and can be retired instead of deleted.
alter table public.presentation_templates
  add column current_version_id uuid,
  add column retired_at timestamptz,
  add column retired_by uuid references auth.users(id) on delete restrict,
  add constraint presentation_templates_current_version_fkey foreign key (organization_id, current_version_id)
    references public.presentation_template_versions(organization_id, id),
  add constraint presentation_templates_retired_pair check (num_nonnulls(retired_at, retired_by) in (0, 2));
create index presentation_templates_current_version_idx on public.presentation_templates (organization_id, current_version_id);
create index presentation_templates_retired_by_idx on public.presentation_templates (retired_by);
comment on column public.presentation_templates.current_version_id is 'The version readers and renderers use; null only before the backfill of a legacy row.';
comment on column public.presentation_templates.retired_at is 'A retired template is ignored by readers and renderers; storing a definition for the same target revives it with the next version.';
comment on column public.presentation_templates.definition is 'The first definition of this template, frozen since 20260927130000; the current definition is the one of current_version_id.';
comment on column public.presentation_templates.fingerprint is 'Fingerprint of the first definition, frozen since 20260927130000; legacy vault pins compare against it. The current identity is the version fingerprint.';

-- 3. The house structure as data: the sections the house deck renders today, keyed by its block
-- ids. packages/case-export/src/presentation-structure.ts exports the same object; the unit test
-- reads this literal between the dollar-quoted house markers and requires equality.
create or replace function private.presentation_template_house_structure_v1()
returns jsonb language sql immutable set search_path = '' as $$
  select $house$
{
  "schemaVersion": "2026.09.27-structure-v1",
  "sections": [
    {
      "key": "decision-headline",
      "title": {
        "pt-BR": "Situação e implicação",
        "en-US": "Situation and implication"
      },
      "audiences": [
        "internal",
        "advisor",
        "external"
      ],
      "fields": [
        {
          "key": "headline-metrics",
          "kind": "number",
          "required": true,
          "title": {
            "pt-BR": "Indicadores da leitura financeira",
            "en-US": "Financial view indicators"
          }
        }
      ]
    },
    {
      "key": "maturity-wall",
      "title": {
        "pt-BR": "Vencimentos contratuais",
        "en-US": "Contractual maturities"
      },
      "audiences": [
        "internal",
        "advisor",
        "external"
      ],
      "fields": [
        {
          "key": "maturity-series",
          "kind": "chart",
          "required": false,
          "title": {
            "pt-BR": "Série de vencimentos",
            "en-US": "Maturity series"
          }
        },
        {
          "key": "peak-maturity",
          "kind": "number",
          "required": false,
          "title": {
            "pt-BR": "Pico de vencimentos",
            "en-US": "Peak maturity"
          }
        }
      ]
    },
    {
      "key": "analytical-direction",
      "title": {
        "pt-BR": "Direção analítica",
        "en-US": "Analytical direction"
      },
      "audiences": [
        "internal",
        "advisor"
      ],
      "fields": [
        {
          "key": "leading-alternative",
          "kind": "text",
          "required": false,
          "title": {
            "pt-BR": "Alternativa em destaque",
            "en-US": "Leading alternative"
          }
        }
      ]
    },
    {
      "key": "open-gaps",
      "title": {
        "pt-BR": "O que ainda muda a decisão",
        "en-US": "What still changes the decision"
      },
      "audiences": [
        "internal",
        "advisor"
      ],
      "fields": [
        {
          "key": "gap-list",
          "kind": "table",
          "required": false,
          "title": {
            "pt-BR": "Pontos em aberto",
            "en-US": "Open items"
          }
        }
      ]
    },
    {
      "key": "source-register",
      "title": {
        "pt-BR": "Fontes e data-base",
        "en-US": "Sources and reference date"
      },
      "audiences": [
        "internal",
        "advisor",
        "external"
      ],
      "fields": [
        {
          "key": "sources",
          "kind": "source_list",
          "required": true,
          "title": {
            "pt-BR": "Fontes citadas",
            "en-US": "Cited sources"
          }
        }
      ]
    }
  ]
}
$house$::jsonb;
$$;
revoke all on function private.presentation_template_house_structure_v1() from public, anon, authenticated, service_role;

/*
 * Structural validation of a semantic structure. Named refusals, all invalid_parameter_value:
 *   presentation_template_structure_empty                no sections, or a section without fields
 *   presentation_template_structure_duplicate_key        a section key, a field key inside a section or an audience repeated
 *   presentation_template_structure_unknown_kind         a field kind outside text, number, table, chart, source_list
 *   presentation_template_structure_required_without_key a required field with no valid key
 *   presentation_template_structure_unknown_audience     an audience outside internal, advisor, external
 *   invalid_presentation_template_structure              anything else the renderers cannot honour
 * Returns the canonical structure: only the known keys, in the order given.
 */
create or replace function private.validate_presentation_template_structure_v1(p_structure jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare section jsonb; field jsonb; title jsonb; audience jsonb; section_key text; field_key text; kind text; required boolean;
  section_keys text[] := '{}'; field_keys text[]; audiences text[]; sections jsonb := '[]'::jsonb; fields jsonb; locale text;
begin
  if p_structure is null or jsonb_typeof(p_structure) <> 'object' then raise exception 'invalid_presentation_template_structure' using errcode = '22023'; end if;
  if jsonb_typeof(p_structure -> 'schemaVersion') <> 'string' or char_length(p_structure ->> 'schemaVersion') not between 1 and 40 then
    raise exception 'invalid_presentation_template_structure' using errcode = '22023';
  end if;
  if jsonb_typeof(p_structure -> 'sections') <> 'array' then raise exception 'invalid_presentation_template_structure' using errcode = '22023'; end if;
  if jsonb_array_length(p_structure -> 'sections') = 0 then raise exception 'presentation_template_structure_empty' using errcode = '22023'; end if;
  if jsonb_array_length(p_structure -> 'sections') > 40 then raise exception 'invalid_presentation_template_structure' using errcode = '22023'; end if;
  for section in select value from jsonb_array_elements(p_structure -> 'sections') loop
    if jsonb_typeof(section) <> 'object' then raise exception 'invalid_presentation_template_structure' using errcode = '22023'; end if;
    section_key := section ->> 'key';
    if section_key is null or section_key !~ '^[a-z0-9][a-z0-9-]{0,62}$' then raise exception 'invalid_presentation_template_structure' using errcode = '22023'; end if;
    if section_key = any (section_keys) then raise exception 'presentation_template_structure_duplicate_key' using errcode = '22023'; end if;
    section_keys := section_keys || section_key;
    title := section -> 'title';
    if jsonb_typeof(title) <> 'object' then raise exception 'invalid_presentation_template_structure' using errcode = '22023'; end if;
    foreach locale in array array['pt-BR', 'en-US'] loop
      if jsonb_typeof(title -> locale) <> 'string' or char_length(btrim(title ->> locale)) not between 1 and 120 then
        raise exception 'invalid_presentation_template_structure' using errcode = '22023';
      end if;
    end loop;
    if jsonb_typeof(section -> 'audiences') <> 'array' or jsonb_array_length(section -> 'audiences') = 0 then
      raise exception 'invalid_presentation_template_structure' using errcode = '22023';
    end if;
    audiences := '{}';
    for audience in select value from jsonb_array_elements(section -> 'audiences') loop
      if jsonb_typeof(audience) <> 'string' or (audience #>> '{}') not in ('internal', 'advisor', 'external') then
        raise exception 'presentation_template_structure_unknown_audience' using errcode = '22023';
      end if;
      if (audience #>> '{}') = any (audiences) then raise exception 'presentation_template_structure_duplicate_key' using errcode = '22023'; end if;
      audiences := audiences || (audience #>> '{}');
    end loop;
    if jsonb_typeof(section -> 'fields') <> 'array' then raise exception 'invalid_presentation_template_structure' using errcode = '22023'; end if;
    if jsonb_array_length(section -> 'fields') = 0 then raise exception 'presentation_template_structure_empty' using errcode = '22023'; end if;
    if jsonb_array_length(section -> 'fields') > 40 then raise exception 'invalid_presentation_template_structure' using errcode = '22023'; end if;
    field_keys := '{}'; fields := '[]'::jsonb;
    for field in select value from jsonb_array_elements(section -> 'fields') loop
      if jsonb_typeof(field) <> 'object' or jsonb_typeof(field -> 'required') <> 'boolean' then
        raise exception 'invalid_presentation_template_structure' using errcode = '22023';
      end if;
      required := (field ->> 'required')::boolean;
      field_key := field ->> 'key';
      if field_key is null or field_key !~ '^[a-z0-9][a-z0-9-]{0,62}$' then
        if required then raise exception 'presentation_template_structure_required_without_key' using errcode = '22023'; end if;
        raise exception 'invalid_presentation_template_structure' using errcode = '22023';
      end if;
      if field_key = any (field_keys) then raise exception 'presentation_template_structure_duplicate_key' using errcode = '22023'; end if;
      field_keys := field_keys || field_key;
      kind := field ->> 'kind';
      if kind is null or kind not in ('text', 'number', 'table', 'chart', 'source_list') then
        raise exception 'presentation_template_structure_unknown_kind' using errcode = '22023';
      end if;
      title := field -> 'title';
      if jsonb_typeof(title) <> 'object' then raise exception 'invalid_presentation_template_structure' using errcode = '22023'; end if;
      foreach locale in array array['pt-BR', 'en-US'] loop
        if jsonb_typeof(title -> locale) <> 'string' or char_length(btrim(title ->> locale)) not between 1 and 120 then
          raise exception 'invalid_presentation_template_structure' using errcode = '22023';
        end if;
      end loop;
      fields := fields || jsonb_build_object('key', field_key, 'kind', kind, 'required', required,
        'title', jsonb_build_object('pt-BR', title ->> 'pt-BR', 'en-US', title ->> 'en-US'));
    end loop;
    sections := sections || jsonb_build_object('key', section_key,
      'title', jsonb_build_object('pt-BR', section -> 'title' ->> 'pt-BR', 'en-US', section -> 'title' ->> 'en-US'),
      'audiences', to_jsonb(audiences), 'fields', fields);
  end loop;
  return jsonb_build_object('schemaVersion', p_structure ->> 'schemaVersion', 'sections', sections);
end;
$$;
revoke all on function private.validate_presentation_template_structure_v1(jsonb) from public, anon, authenticated, service_role;

-- 4. The command. The three-argument functions go; the four-argument ones keep the caller working
-- through the default. The authorization line 20260915204116 injected stays first.
drop function public.set_presentation_template_v1(uuid, uuid, jsonb);
drop function private.set_presentation_template_v1(uuid, uuid, jsonb);
create function private.set_presentation_template_v1(p_organization_id uuid, p_project_id uuid, p_definition jsonb, p_structure jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); v_organization uuid; v_canonical jsonb; v_structure jsonb; v_definition_fingerprint text; v_fingerprint text;
  v_key text; v_version text; v_origin text; existing public.presentation_templates; same_content public.presentation_template_versions;
  v_version_id uuid; v_version_no integer; reused boolean := false;
begin
 if p_project_id is not null then perform private.require_resource_access_v1(p_project_id,'manage'); elsif not private.can_manage_organization(p_organization_id) then raise exception 'resource_access_denied' using errcode='42501'; end if;
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
$$;
create function public.set_presentation_template_v1(p_organization_id uuid, p_project_id uuid, p_definition jsonb, p_structure jsonb default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_presentation_template_v1(p_organization_id, p_project_id, p_definition, p_structure);
$$;
revoke all on function private.set_presentation_template_v1(uuid, uuid, jsonb, jsonb), public.set_presentation_template_v1(uuid, uuid, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function private.set_presentation_template_v1(uuid, uuid, jsonb, jsonb), public.set_presentation_template_v1(uuid, uuid, jsonb, jsonb) to authenticated;

-- 5. Readers. One template row becomes one object: its current version and its history.
create or replace function private.presentation_template_json_v1(p_template public.presentation_templates)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare current_row public.presentation_template_versions; history jsonb;
begin
  if p_template.id is null or p_template.retired_at is not null or p_template.current_version_id is null then return null; end if;
  select * into current_row from public.presentation_template_versions v where v.organization_id = p_template.organization_id and v.id = p_template.current_version_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'version_id', v.id, 'version_no', v.version_no, 'created_at', v.created_at,
      'author_name', nullif(btrim(author.full_name), ''), 'is_current', v.id = p_template.current_version_id, 'fingerprint', v.fingerprint)
      order by v.version_no desc), '[]'::jsonb)
    into history
    from public.presentation_template_versions v left join public.profiles author on author.id = v.created_by
    where v.organization_id = p_template.organization_id and v.template_id = p_template.id;
  return jsonb_build_object(
    'template_id', p_template.id, 'scope', p_template.scope, 'template_key', p_template.template_key,
    'template_version', p_template.template_version, 'origin', p_template.origin,
    'fingerprint', current_row.fingerprint, 'definition_fingerprint', encode(extensions.digest(current_row.definition::text, 'sha256'), 'hex'),
    'definition', current_row.definition, 'structure', current_row.structure,
    'version_id', current_row.id, 'version_no', current_row.version_no, 'version_created_at', current_row.created_at,
    'updated_at', p_template.updated_at, 'versions', history);
end;
$$;
revoke all on function private.presentation_template_json_v1(public.presentation_templates) from public, anon, authenticated, service_role;

create or replace function private.read_presentation_template_v1(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare project public.capital_projects; organization_row public.presentation_templates; project_row public.presentation_templates; effective public.presentation_templates;
begin
 perform private.require_resource_access_v1(p_project_id,'read');
  select * into project from public.capital_projects p
    where p.id = p_project_id and private.can_access_capital_project(p.organization_id, p.id);
  if not found then raise exception 'capital_project_not_found' using errcode = 'P0002'; end if;
  -- A retired template is not effective, not shown and not offered; its versions stay readable by id.
  select * into organization_row from public.presentation_templates t
    where t.organization_id = project.organization_id and t.capital_project_id is null and t.retired_at is null;
  select * into project_row from public.presentation_templates t
    where t.organization_id = project.organization_id and t.capital_project_id = project.id and t.retired_at is null;
  if project_row.id is not null then effective := project_row; else effective := organization_row; end if;
  return jsonb_build_object(
    'project_id', project.id,
    'organization_id', project.organization_id,
    'can_manage', private.can_manage_organization(project.organization_id),
    'effective', private.presentation_template_json_v1(effective),
    'organization', private.presentation_template_json_v1(organization_row),
    'project', private.presentation_template_json_v1(project_row),
    'house_structure', private.presentation_template_house_structure_v1(),
    'pdf_fonts', to_jsonb(private.presentation_template_pdf_fonts()));
end;
$$;

-- One exact version, under the rule of its template: organization members for an organization
-- template, project access for a project template. Absence and refusal look the same.
create function private.read_presentation_template_version_v1(p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v public.presentation_template_versions; t public.presentation_templates;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select * into v from public.presentation_template_versions x where x.id = p_version_id;
  if v.id is not null then
    select * into t from public.presentation_templates x where x.organization_id = v.organization_id and x.id = v.template_id;
  end if;
  if v.id is null or t.id is null
    or (t.capital_project_id is null and not private.is_org_member(t.organization_id))
    or (t.capital_project_id is not null and not private.can_access_capital_project(t.organization_id, t.capital_project_id)) then
    raise exception 'presentation_template_version_not_found' using errcode = 'P0002';
  end if;
  if t.capital_project_id is not null then perform private.require_resource_access_v1(t.capital_project_id, 'read'); end if;
  return jsonb_build_object(
    'version_id', v.id, 'template_id', t.id, 'organization_id', t.organization_id, 'scope', t.scope, 'capital_project_id', t.capital_project_id,
    'template_key', t.template_key, 'template_version', t.template_version, 'origin', t.origin,
    'version_no', v.version_no, 'definition', v.definition, 'structure', v.structure, 'fingerprint', v.fingerprint,
    'created_at', v.created_at, 'is_current', t.current_version_id = v.id, 'retired', t.retired_at is not null);
end;
$$;
create function public.read_presentation_template_version_v1(p_version_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_presentation_template_version_v1(p_version_id);
$$;
revoke all on function private.read_presentation_template_version_v1(uuid), public.read_presentation_template_version_v1(uuid) from public, anon, authenticated, service_role;
grant execute on function private.read_presentation_template_version_v1(uuid), public.read_presentation_template_version_v1(uuid) to authenticated;

-- 6. The worker reads the current client version of the project its leased job belongs to (the
-- project template wins, then the organization one; a retired template is absent), and may read
-- the logo object of that organization while it holds an active capital-analysis lease there.
create function private.worker_read_presentation_template_version_v1(p_job_id uuid, p_capability_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token); project_id uuid; t public.presentation_templates; v public.presentation_template_versions;
begin
  if job_row.kind <> 'capital_project_analysis' then raise exception 'capital_project_analysis_capability_required' using errcode = '42501'; end if;
  begin
    project_id := (job_row.payload ->> 'capital_project_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'capital_project_material_project_invalid' using errcode = '22023';
  end;
  if project_id is null then return jsonb_build_object('template', null); end if;
  select * into t from public.presentation_templates x
    where x.organization_id = job_row.organization_id and x.capital_project_id = project_id and x.retired_at is null;
  if t.id is null then
    select * into t from public.presentation_templates x
      where x.organization_id = job_row.organization_id and x.capital_project_id is null and x.retired_at is null;
  end if;
  if t.id is null or t.current_version_id is null then return jsonb_build_object('template', null); end if;
  select * into v from public.presentation_template_versions x where x.organization_id = t.organization_id and x.id = t.current_version_id;
  return jsonb_build_object('template', jsonb_build_object(
    'template_id', t.id, 'scope', t.scope, 'template_key', t.template_key, 'template_version', t.template_version, 'origin', t.origin,
    'version_id', v.id, 'version_no', v.version_no, 'fingerprint', v.fingerprint, 'definition', v.definition, 'structure', v.structure));
end;
$$;
create function public.worker_read_presentation_template_version_v1(p_job_id uuid, p_capability_token text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.worker_read_presentation_template_version_v1(p_job_id, p_capability_token);
$$;
revoke all on function private.worker_read_presentation_template_version_v1(uuid, text), public.worker_read_presentation_template_version_v1(uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.worker_read_presentation_template_version_v1(uuid, text), public.worker_read_presentation_template_version_v1(uuid, text) to authenticated;

create function private.worker_can_read_brand_template_v1(p_object_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and (storage.foldername(p_object_path))[2] = 'presentation-templates'
    and exists (
      select 1 from public.processing_jobs j
      where j.status = 'leased' and j.kind = 'capital_project_analysis'
        and j.leased_account_user_id = (select auth.uid()) and j.lease_expires_at > now()
        and j.organization_id = private.storage_organization_id(p_object_path)
    );
$$;
revoke all on function private.worker_can_read_brand_template_v1(text) from public, anon, service_role;
grant execute on function private.worker_can_read_brand_template_v1(text) to authenticated;
create policy brand_templates_worker_select on storage.objects for select to authenticated
  using (bucket_id = 'brand-templates' and (select private.worker_can_read_brand_template_v1(name)));

-- 7. The vault pins the exact version. The old columns stay readable; legacy rows without a
-- version id keep the old check.
alter table public.vault_entry_versions
  add column presentation_template_version_id uuid,
  add constraint vault_entry_versions_template_version_fkey foreign key (organization_id, presentation_template_version_id)
    references public.presentation_template_versions(organization_id, id);
create index vault_versions_template_version_idx on public.vault_entry_versions (organization_id, presentation_template_version_id);
comment on column public.vault_entry_versions.presentation_template_version_id is
  'The exact template version a template reference pins since 20260927130000; reference_fingerprint is that version''s fingerprint. Null on legacy rows the backfill could not resolve.';

-- private.submit_vault_entry_version_v1: restated in full (pinned above). The template branch
-- selects the current version of a non-retired template and pins its id and fingerprint.
create or replace function private.submit_vault_entry_version_v1(p_entry_id uuid,p_version_id uuid,p_expected_version_id uuid,p_kind text,p_title text,p_directive_text text default null,p_reference_id uuid default null,p_source_version_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();e public.vault_entries;v public.vault_entry_versions;scope uuid;rf text;fp text;source uuid;assumption uuid;template uuid;template_version uuid;rev integer;provenance jsonb;dependencies jsonb;begin
 if p_entry_id is null or p_version_id is null or p_kind is null or p_kind not in ('source','adoption','directive','template') or p_title is null or length(btrim(p_title)) not between 1 and 180
 or cardinality(coalesce(p_source_version_ids,'{}'::uuid[]))>100 or (p_kind='directive' and (p_reference_id is not null or p_directive_text is null or length(btrim(p_directive_text)) not between 1 and 32000))
 or (p_kind<>'directive' and (p_reference_id is null or p_directive_text is not null)) then raise exception 'vault_version_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(jsonb_build_object('entry',p_entry_id,'previous',p_expected_version_id,'kind',p_kind,'title',btrim(p_title),'text',p_directive_text,'reference',p_reference_id,'sources',coalesce(p_source_version_ids,'{}'::uuid[]))::text,'sha256'),'hex');
 select * into e from public.vault_entries where id=p_entry_id for update;
 if found then
  if e.organization_id<>org or e.kind<>p_kind or not private.can_access_resource_v1(org,e.id,'work') then raise exception 'vault_access_denied' using errcode='42501';end if;
 else
  if p_expected_version_id is not null then raise exception 'vault_version_conflict' using errcode='40001';end if;
  select id into strict scope from public.vault_scopes where organization_id=org;
  insert into public.vault_entries(id,organization_id,scope_id,kind,created_by) values(p_entry_id,org,scope,p_kind,auth.uid()) returning * into e;
  insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,grant_basis,granted_by)
  values(org,e.id,auth.uid(),'work','creator_bootstrap',auth.uid());
 end if;
 select * into v from public.vault_entry_versions where id=p_version_id;
 if found then
  if v.organization_id<>org or v.entry_id<>e.id or v.request_fingerprint<>fp then raise exception 'vault_request_reused' using errcode='22023';end if;
  if not private.can_read_vault_version_v1(org,v.id) then raise exception 'vault_access_denied' using errcode='42501';end if;return v.id;
 end if;
 if e.head_version_id is distinct from p_expected_version_id then raise exception 'vault_version_conflict' using errcode='40001';end if;
 if p_kind='source' then
  select id,encode(extensions.digest(jsonb_build_object('sourceVersion',id,'source',source_id,'version',version_no,'declaredHash',declared_sha256)::text,'sha256'),'hex') into source,rf from public.source_versions where organization_id=org and id=p_reference_id;
  if source is null or not private.source_use_allowed_v1(org,source,auth.uid(),'read','analysis') then raise exception 'vault_reference_denied' using errcode='42501';end if;
 elsif p_kind='adoption' then
  select id,content_fingerprint into assumption,rf from public.assumption_versions where organization_id=org and id=p_reference_id;
  if assumption is null or not private.can_read_assumption_version_v1(org,assumption) then raise exception 'vault_reference_denied' using errcode='42501';end if;
 elsif p_kind='template' then
  -- The pin is the exact current version of a template that is not retired, and its fingerprint.
  select t.id,pv.id,pv.fingerprint into template,template_version,rf from public.presentation_templates t
  join public.presentation_template_versions pv on pv.organization_id=t.organization_id and pv.id=t.current_version_id
  where t.organization_id=org and t.id=p_reference_id and t.retired_at is null
  and (t.capital_project_id is null or private.can_access_resource_v1(org,t.capital_project_id,'read'));
  if template is null then raise exception 'vault_reference_denied' using errcode='42501';end if;
 end if;
 select coalesce(max(revision),0)+1 into rev from public.vault_entry_versions where organization_id=org and entry_id=e.id;
 -- A source reference is not a derived copy; a newly reviewed reference pins the current license.
 -- Derived directives/adoptions preserve prior dependencies and cannot launder restrictions.
 dependencies:=private.collect_vault_dependencies_v1(org,case when p_kind='source' then null else e.head_version_id end,source,assumption,p_source_version_ids);
 provenance:=jsonb_build_object('kind','human_candidate','author',auth.uid(),'referenceId',p_reference_id,'referenceFingerprint',rf);
 insert into public.vault_entry_versions(id,organization_id,entry_id,revision,previous_version_id,title,directive_text,source_version_id,assumption_version_id,presentation_template_id,presentation_template_version_id,reference_fingerprint,dependency_manifest,provenance,content_fingerprint,request_fingerprint,created_by)
 values(p_version_id,org,e.id,rev,e.head_version_id,btrim(p_title),p_directive_text,source,assumption,template,template_version,rf,dependencies,provenance,
 encode(extensions.digest(jsonb_build_object('kind',p_kind,'title',btrim(p_title),'text',p_directive_text,'referenceId',p_reference_id,'referenceFingerprint',rf,'previous',e.head_version_id,'sources',coalesce(p_source_version_ids,'{}'::uuid[]),'author',auth.uid(),'dependencies',dependencies)::text,'sha256'),'hex'),fp,auth.uid());
 perform private.pin_vault_dependencies_v1(org,p_version_id);
 update public.vault_entries set head_version_id=p_version_id where organization_id=org and id=e.id;
 return p_version_id;
end $$;

-- private.vault_reference_allowed_v1: restated in full (pinned above). A template reference with
-- a version id resolves the exact immutable version (its fingerprint, or for a backfilled version 1
-- the frozen definition fingerprint the legacy row carried); a legacy row without one keeps the
-- old check against the frozen row fingerprint.
create or replace function private.vault_reference_allowed_v1(p_org uuid,p_version uuid,p_purpose text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v public.vault_entry_versions; k text; d record; op text;
begin
 select * into v from public.vault_entry_versions where organization_id=p_org and id=p_version;
 if v.id is null or not private.workspace_context_matches_v1(p_org) or p_purpose not in ('analysis','retrieval','publication','export') then return false;end if;
 select kind into k from public.vault_entries where organization_id=p_org and id=v.entry_id;
 if v.source_version_id is not null and not exists(select 1 from private.vault_source_dependencies where organization_id=p_org and version_id=v.id and source_version_id=v.source_version_id) then return false;end if;
 if v.source_version_id is not null and not private.source_use_allowed_v1(p_org,v.source_version_id,auth.uid(),'read',p_purpose) then return false;end if;
 if v.assumption_version_id is not null and not private.can_read_assumption_version_v1(p_org,v.assumption_version_id) then return false;end if;
 if v.presentation_template_version_id is not null then
  if not exists(select 1 from public.presentation_template_versions pv join public.presentation_templates t on t.organization_id=pv.organization_id and t.id=pv.template_id
  where pv.organization_id=p_org and pv.id=v.presentation_template_version_id and pv.template_id=v.presentation_template_id
  and (pv.fingerprint=v.reference_fingerprint or (pv.version_no=1 and t.fingerprint=v.reference_fingerprint))
  and (t.capital_project_id is null or private.can_access_resource_v1(p_org,t.capital_project_id,'read'))) then return false;end if;
 elsif v.presentation_template_id is not null and not exists(select 1 from public.presentation_templates t where t.organization_id=p_org and t.id=v.presentation_template_id and t.fingerprint=v.reference_fingerprint
 and (t.capital_project_id is null or private.can_access_resource_v1(p_org,t.capital_project_id,'read'))) then return false;end if;
 for d in select * from private.vault_source_dependencies where organization_id=p_org and version_id=p_version loop
  foreach op in array (case when k='source' then array['read','store'] else array['read','store','derive'] end || case when p_purpose='export' then array['export'] else '{}'::text[] end) loop
   if not exists(select 1 from private.source_rights_versions r where r.organization_id=p_org and r.id=d.rights_version_id and r.source_version_id=d.source_version_id
    and op=any(r.operations) and p_purpose=any(r.purposes) and r.valid_from<=clock_timestamp()
    and (r.expires_at is null or r.expires_at>clock_timestamp()) and (r.store_until is null or r.store_until>clock_timestamp()))
    or not private.source_use_allowed_v1(p_org,d.source_version_id,auth.uid(),op,p_purpose) then return false;end if;
  end loop;
 end loop;
 return true;
end $$;

-- 8. Backfill: every existing template row becomes version 1 with the house structure and points
-- at it; legacy vault pins that still match the frozen definition fingerprint receive version 1.
insert into public.presentation_template_versions (organization_id, template_id, version_no, definition, structure, fingerprint, created_by, created_at, updated_at)
select t.organization_id, t.id, 1, t.definition, private.presentation_template_house_structure_v1(),
  encode(extensions.digest(jsonb_build_object('definition', t.definition, 'structure', private.presentation_template_house_structure_v1())::text, 'sha256'), 'hex'),
  t.created_by, t.created_at, t.created_at
from public.presentation_templates t
where t.current_version_id is null;
update public.presentation_templates t set current_version_id = v.id
from public.presentation_template_versions v
where v.organization_id = t.organization_id and v.template_id = t.id and v.version_no = 1 and t.current_version_id is null;
-- The vault version is immutable by trigger; annotating legacy rows with the version their pin
-- already names is the one write the guard is lifted for, inside this transaction only.
alter table public.vault_entry_versions disable trigger vault_version_immutable;
update public.vault_entry_versions v set presentation_template_version_id = t.current_version_id
from public.presentation_templates t
where t.organization_id = v.organization_id and t.id = v.presentation_template_id
  and v.presentation_template_version_id is null and t.fingerprint = v.reference_fingerprint;
alter table public.vault_entry_versions enable trigger vault_version_immutable;
