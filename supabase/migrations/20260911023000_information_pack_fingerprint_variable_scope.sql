-- The local fingerprint variable shadowed the column of the same name, so the replay lookup
-- compared the column with itself and every identical pack opened a new revision. The command is
-- unchanged apart from the variable name.

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
  computed_pack_fingerprint text;
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

  computed_pack_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
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
    and row.pack_fingerprint = computed_pack_fingerprint;
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
    artifact.input_fingerprint, artifact.object_fingerprint, computed_pack_fingerprint, manifest, 'current', actor_id
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
    'pack_fingerprint', computed_pack_fingerprint,
    'status', 'current',
    'superseded_id', current_revision.id,
    'replayed', false
  );
end;
$$;

comment on function private.record_information_pack_revision(uuid, uuid, jsonb) is
  'Records one immutable pack revision from the approved material package, with an unambiguous pack fingerprint.';
