-- The recipient organization opens the exact file that was authorized, not a later one. This
-- returns the governed objects the shared pack revision was built from, so the same renderer that
-- produced the issuer's file produces the recipient's, and refuses when the project has moved on
-- and the authorized revision no longer matches the current material artifact. The read is logged.

create or replace function private.read_shared_pack_item_material(p_share_id uuid, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  share_row public.pack_distribution_shares;
  revision public.information_pack_revisions;
  item public.information_pack_items;
  rows_payload jsonb;
  current_material text;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select row.* into share_row
  from public.pack_distribution_shares row
  where row.id = p_share_id;
  if not found then
    raise exception 'shared_information_pack_not_available' using errcode = '42501';
  end if;
  if not (select private.pack_share_live_for_recipient(share_row.organization_id, share_row.id)) then
    raise exception 'shared_information_pack_not_available' using errcode = '42501';
  end if;

  select row.* into revision
  from public.information_pack_revisions row
  where row.organization_id = share_row.organization_id and row.id = share_row.pack_revision_id;

  select row.* into item
  from public.information_pack_items row
  where row.organization_id = share_row.organization_id
    and row.id = p_item_id
    and row.pack_revision_id = revision.id;
  if not found then
    raise exception 'shared_information_pack_item_not_found' using errcode = 'P0002';
  end if;

  select state_object.object_fingerprint into current_material
  from public.deal_state_objects state_object
  where state_object.organization_id = share_row.organization_id
    and state_object.intake_session_id = share_row.intake_session_id
    and state_object.object_type = 'material_artifact'
    and state_object.superseded_at is null
  order by state_object.object_version desc
  limit 1;
  if current_material is distinct from revision.material_fingerprint then
    raise exception 'shared_information_pack_revision_outdated' using errcode = '55000';
  end if;

  select coalesce(jsonb_agg(to_jsonb(state_object) order by state_object.object_version desc), '[]'::jsonb)
  into rows_payload
  from public.deal_state_objects state_object
  where state_object.organization_id = share_row.organization_id
    and state_object.intake_session_id = share_row.intake_session_id
    and state_object.object_type in (
      'structure_option', 'structure_decision', 'production_plan', 'material_artifact'
    );

  insert into public.pack_access_events (
    organization_id, intake_session_id, share_id, pack_revision_id,
    recipient_organization_id, pack_item_id, access_kind, accessed_by
  ) values (
    share_row.organization_id, share_row.intake_session_id, share_row.id, revision.id,
    share_row.recipient_organization_id, item.id, 'item_opened', actor_id
  );

  return jsonb_build_object(
    'share_id', share_row.id,
    'pack_revision_id', revision.id,
    'revision_number', revision.revision_number,
    'pack_fingerprint', revision.pack_fingerprint,
    'material_fingerprint', revision.material_fingerprint,
    'issued_at', revision.created_at,
    'issuer_name', share_row.issuer_display_name,
    'deliverable_id', item.deliverable_id,
    'format', item.format,
    'artifact_fingerprint', item.artifact_fingerprint,
    'template_key', item.template_key,
    'template_version', item.template_version,
    'template_origin', item.template_origin,
    'template_fingerprint', item.template_fingerprint,
    'deal_state_rows', rows_payload
  );
end;
$$;

create or replace function public.read_shared_pack_item_material(p_share_id uuid, p_item_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.read_shared_pack_item_material(p_share_id, p_item_id);
$$;

revoke all on function private.read_shared_pack_item_material(uuid, uuid) from public, anon;
revoke all on function public.read_shared_pack_item_material(uuid, uuid) from public, anon;
grant execute on function private.read_shared_pack_item_material(uuid, uuid) to authenticated;
grant execute on function public.read_shared_pack_item_material(uuid, uuid) to authenticated;

comment on function public.read_shared_pack_item_material(uuid, uuid) is
  'Returns the governed objects behind one file of a live shared pack revision so the recipient opens the exact authorized artifact. It logs the read and refuses when the authorized revision no longer matches the project material.';
