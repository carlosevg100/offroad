-- A versioned information pack is the exact set of exported files a recipient organization may
-- open. It is immutable: a new revision supersedes the previous one and never deletes it. The
-- pack records what was exported (fingerprint, format, template identity and version, source
-- result ids), never a new rendering. Nothing here shares anything with anyone; authorization
-- and access live in the next migration.

create table public.information_pack_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  capital_project_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  case_fingerprint text not null check (case_fingerprint ~ '^[0-9a-f]{64}$'),
  material_fingerprint text not null check (material_fingerprint ~ '^[0-9a-f]{64}$'),
  pack_fingerprint text not null check (pack_fingerprint ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  status text not null default 'current' check (status in ('current', 'superseded')),
  superseded_by_id uuid,
  superseded_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, intake_session_id, revision_number),
  unique (organization_id, intake_session_id, pack_fingerprint),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, superseded_by_id)
    references public.information_pack_revisions(organization_id, id),
  constraint information_pack_revisions_supersession_paired check (
    (status = 'superseded') = (superseded_by_id is not null and superseded_at is not null)
  ),
  constraint information_pack_revisions_supersedes_other check (superseded_by_id is distinct from id)
);

create unique index information_pack_revisions_one_current_idx
  on public.information_pack_revisions (organization_id, intake_session_id)
  where status = 'current';
create index information_pack_revisions_session_idx
  on public.information_pack_revisions (organization_id, intake_session_id, revision_number desc);
create index information_pack_revisions_project_idx
  on public.information_pack_revisions (organization_id, capital_project_id, created_at desc);
create index information_pack_revisions_created_by_idx
  on public.information_pack_revisions (created_by);
create index information_pack_revisions_superseded_by_idx
  on public.information_pack_revisions (organization_id, superseded_by_id)
  where superseded_by_id is not null;

-- One row per exported file. The pack shows what a recipient will see and nothing more.
create table public.information_pack_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pack_revision_id uuid not null,
  position integer not null check (position between 1 and 40),
  deliverable_id text not null check (deliverable_id ~ '^[a-z][a-z0-9_]{2,60}$'),
  format text not null check (format in ('interactive', 'xlsx', 'pptx', 'docx', 'pdf')),
  artifact_fingerprint text not null check (artifact_fingerprint ~ '^[0-9a-f]{64}$'),
  template_key text not null check (template_key ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  template_version text not null check (template_version ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-v[0-9]{1,3}$'),
  template_origin text not null check (template_origin in ('offroad_house', 'client_supplied')),
  template_fingerprint text check (template_fingerprint is null or template_fingerprint ~ '^[0-9a-f]{64}$'),
  source_result_ids jsonb not null default '[]'::jsonb check (
    jsonb_typeof(source_result_ids) = 'array' and jsonb_array_length(source_result_ids) <= 50
  ),
  title text not null check (length(trim(title)) between 2 and 200),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, pack_revision_id, position),
  unique (organization_id, pack_revision_id, deliverable_id, format),
  foreign key (organization_id, pack_revision_id)
    references public.information_pack_revisions(organization_id, id) on delete cascade,
  constraint information_pack_items_house_template_unsigned check (
    (template_origin = 'offroad_house') = (template_fingerprint is null)
  )
);

create index information_pack_items_revision_idx
  on public.information_pack_items (organization_id, pack_revision_id, position);

create trigger information_pack_revisions_set_updated_at
  before update on public.information_pack_revisions
  for each row execute function private.set_updated_at();
create trigger information_pack_revisions_audit
  after insert or update or delete on public.information_pack_revisions
  for each row execute function private.capture_audit_event();
create trigger information_pack_items_audit
  after insert or update or delete on public.information_pack_items
  for each row execute function private.capture_audit_event();

-- Supersession is the only permitted change. Everything else that identifies the pack stays put,
-- so a fingerprint recorded in an authorization always resolves to the same bytes.
create or replace function private.enforce_information_pack_revision_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.intake_session_id is distinct from old.intake_session_id
    or new.capital_project_id is distinct from old.capital_project_id
    or new.revision_number is distinct from old.revision_number
    or new.case_fingerprint is distinct from old.case_fingerprint
    or new.material_fingerprint is distinct from old.material_fingerprint
    or new.pack_fingerprint is distinct from old.pack_fingerprint
    or new.manifest is distinct from old.manifest
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or (old.status = 'superseded' and new.status <> 'superseded')
  then
    raise exception 'information_pack_revision_is_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_information_pack_item_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'information_pack_item_is_immutable' using errcode = '42501';
end;
$$;

revoke all on function private.enforce_information_pack_revision_immutability() from public, anon, authenticated;
revoke all on function private.enforce_information_pack_item_immutability() from public, anon, authenticated;

create trigger information_pack_revisions_immutable
  before update on public.information_pack_revisions
  for each row execute function private.enforce_information_pack_revision_immutability();
create trigger information_pack_items_immutable
  before update on public.information_pack_items
  for each row execute function private.enforce_information_pack_item_immutability();

alter table public.information_pack_revisions enable row level security;
alter table public.information_pack_revisions force row level security;
alter table public.information_pack_items enable row level security;
alter table public.information_pack_items force row level security;

create policy information_pack_revisions_select
  on public.information_pack_revisions for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy information_pack_items_select
  on public.information_pack_items for select to authenticated
  using (exists (
    select 1
    from public.information_pack_revisions revision
    where revision.organization_id = information_pack_items.organization_id
      and revision.id = information_pack_items.pack_revision_id
      and (select private.can_access_intake_session(revision.organization_id, revision.intake_session_id))
  ));

revoke all privileges on public.information_pack_revisions from public, anon, authenticated;
revoke all privileges on public.information_pack_items from public, anon, authenticated;
grant select on public.information_pack_revisions to authenticated;
grant select on public.information_pack_items to authenticated;

-- Builds one immutable revision from the exact exported files of the approved material package.
-- It never renders anything: the caller passes the fingerprint, format and template identity of
-- files that already exist, and the command records them together with one pack fingerprint.
create or replace function private.record_information_pack_revision(
  p_organization_id uuid,
  p_session_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  artifact public.deal_state_objects;
  review public.deal_state_objects;
  normalized jsonb;
  pack_fingerprint text;
  existing public.information_pack_revisions;
  current_revision public.information_pack_revisions;
  next_number integer;
  revision_id uuid;
  manifest jsonb;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'information_pack_forbidden' using errcode = '42501';
  end if;
  if not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'offroad'])) then
    raise exception 'information_pack_disclosure_capability_required' using errcode = '42501';
  end if;
  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 40 then
    raise exception 'information_pack_items_invalid' using errcode = '22023';
  end if;

  select row.* into session_row
  from public.document_intake_sessions row
  where row.organization_id = p_organization_id and row.id = p_session_id
  for share;
  if not found or session_row.capital_project_id is null then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;

  select row.* into artifact
  from public.deal_state_objects row
  where row.organization_id = p_organization_id
    and row.intake_session_id = p_session_id
    and row.object_type = 'material_artifact'
    and row.superseded_at is null
  order by row.object_version desc
  limit 1;
  if not found then
    raise exception 'approved_material_package_required' using errcode = '22023';
  end if;

  select row.* into review
  from public.deal_state_objects row
  where row.organization_id = p_organization_id
    and row.intake_session_id = p_session_id
    and row.object_type = 'package_review'
    and row.status = 'approved'
    and row.superseded_at is null
  order by row.object_version desc
  limit 1;
  if not found
    or review.payload #>> '{approval,artifactFingerprint}' is distinct from artifact.object_fingerprint
    or not exists (
      select 1
      from jsonb_array_elements(review.dependencies) dependency(value)
      where dependency.value ->> 'objectType' = 'material_artifact'
        and dependency.value ->> 'objectFingerprint' = artifact.object_fingerprint
    )
  then
    raise exception 'approved_material_package_required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) with ordinality item(value, position)
    where jsonb_typeof(item.value) <> 'object'
      or coalesce(item.value ->> 'deliverableId', '') !~ '^[a-z][a-z0-9_]{2,60}$'
      or coalesce(item.value ->> 'format', '') not in ('interactive', 'xlsx', 'pptx', 'docx', 'pdf')
      or coalesce(item.value ->> 'artifactFingerprint', '') !~ '^[0-9a-f]{64}$'
      or coalesce(item.value ->> 'templateKey', '') !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'
      or coalesce(item.value ->> 'templateVersion', '') !~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-v[0-9]{1,3}$'
      or coalesce(item.value ->> 'templateOrigin', '') not in ('offroad_house', 'client_supplied')
      or (item.value ->> 'templateOrigin' = 'client_supplied')
        <> (coalesce(item.value ->> 'templateFingerprint', '') ~ '^[0-9a-f]{64}$')
      or length(trim(coalesce(item.value ->> 'title', ''))) not between 2 and 200
      or coalesce(jsonb_typeof(item.value -> 'sourceResultIds'), 'array') <> 'array'
      or coalesce(jsonb_array_length(item.value -> 'sourceResultIds'), 0) > 50
  ) then
    raise exception 'information_pack_items_invalid' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object(
    'position', item.position,
    'deliverableId', item.value ->> 'deliverableId',
    'format', item.value ->> 'format',
    'artifactFingerprint', item.value ->> 'artifactFingerprint',
    'templateKey', item.value ->> 'templateKey',
    'templateVersion', item.value ->> 'templateVersion',
    'templateOrigin', item.value ->> 'templateOrigin',
    'templateFingerprint', item.value ->> 'templateFingerprint',
    'sourceResultIds', coalesce(item.value -> 'sourceResultIds', '[]'::jsonb),
    'title', trim(item.value ->> 'title')
  ) order by item.position)
  into normalized
  from jsonb_array_elements(p_items) with ordinality item(value, position);

  if exists (
    select 1
    from jsonb_array_elements(normalized) entry(value)
    group by entry.value ->> 'deliverableId', entry.value ->> 'format'
    having count(*) > 1
  ) then
    raise exception 'information_pack_items_invalid' using errcode = '22023';
  end if;

  pack_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'schemaVersion', 'information-pack.v1',
    'intakeSessionId', p_session_id::text,
    'caseFingerprint', artifact.input_fingerprint,
    'materialFingerprint', artifact.object_fingerprint,
    'items', normalized
  )::text, 'utf8'), 'sha256'), 'hex');

  select row.* into existing
  from public.information_pack_revisions row
  where row.organization_id = p_organization_id
    and row.intake_session_id = p_session_id
    and row.pack_fingerprint = pack_fingerprint;
  if found then
    return jsonb_build_object(
      'id', existing.id,
      'revision_number', existing.revision_number,
      'pack_fingerprint', existing.pack_fingerprint,
      'status', existing.status,
      'replayed', true
    );
  end if;

  select row.* into current_revision
  from public.information_pack_revisions row
  where row.organization_id = p_organization_id
    and row.intake_session_id = p_session_id
    and row.status = 'current'
  for update;

  select coalesce(max(row.revision_number), 0) + 1
  into next_number
  from public.information_pack_revisions row
  where row.organization_id = p_organization_id and row.intake_session_id = p_session_id;

  manifest := jsonb_build_object(
    'schemaVersion', 'information-pack.v1',
    'revisionNumber', next_number,
    'caseFingerprint', artifact.input_fingerprint,
    'materialFingerprint', artifact.object_fingerprint,
    'itemCount', jsonb_array_length(normalized),
    'items', normalized
  );

  insert into public.information_pack_revisions (
    organization_id, intake_session_id, capital_project_id, revision_number,
    case_fingerprint, material_fingerprint, pack_fingerprint, manifest, status, created_by
  ) values (
    p_organization_id, p_session_id, session_row.capital_project_id, next_number,
    artifact.input_fingerprint, artifact.object_fingerprint, pack_fingerprint, manifest, 'current', actor_id
  ) returning id into revision_id;

  insert into public.information_pack_items (
    organization_id, pack_revision_id, position, deliverable_id, format, artifact_fingerprint,
    template_key, template_version, template_origin, template_fingerprint, source_result_ids, title
  )
  select
    p_organization_id,
    revision_id,
    (entry.value ->> 'position')::integer,
    entry.value ->> 'deliverableId',
    entry.value ->> 'format',
    entry.value ->> 'artifactFingerprint',
    entry.value ->> 'templateKey',
    entry.value ->> 'templateVersion',
    entry.value ->> 'templateOrigin',
    entry.value ->> 'templateFingerprint',
    coalesce(entry.value -> 'sourceResultIds', '[]'::jsonb),
    entry.value ->> 'title'
  from jsonb_array_elements(normalized) entry(value);

  if current_revision.id is not null then
    update public.information_pack_revisions
    set status = 'superseded', superseded_by_id = revision_id, superseded_at = now()
    where organization_id = p_organization_id and id = current_revision.id;
  end if;

  return jsonb_build_object(
    'id', revision_id,
    'revision_number', next_number,
    'pack_fingerprint', pack_fingerprint,
    'status', 'current',
    'superseded_id', current_revision.id,
    'replayed', false
  );
end;
$$;

create or replace function public.record_information_pack_revision(
  p_organization_id uuid,
  p_session_id uuid,
  p_items jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.record_information_pack_revision(p_organization_id, p_session_id, p_items);
$$;

revoke all on function private.record_information_pack_revision(uuid, uuid, jsonb) from public, anon;
revoke all on function public.record_information_pack_revision(uuid, uuid, jsonb) from public, anon;
grant execute on function private.record_information_pack_revision(uuid, uuid, jsonb) to authenticated;
grant execute on function public.record_information_pack_revision(uuid, uuid, jsonb) to authenticated;

comment on table public.information_pack_revisions is
  'Immutable information pack per project revision. A new revision supersedes the previous one and never deletes it.';
comment on table public.information_pack_items is
  'Exact exported files of one pack revision: fingerprint, format, template identity and version, and the results they came from.';
comment on function public.record_information_pack_revision(uuid, uuid, jsonb) is
  'Records one immutable pack revision from the approved material package. It renders nothing and shares nothing.';
