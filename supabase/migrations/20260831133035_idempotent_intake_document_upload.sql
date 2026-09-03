-- Re-uploading a document already present in the same intake is an expected, idempotent
-- outcome. The original command let the scope/hash unique index raise 23505 after the object
-- had reached Storage. The browser correctly removed that temporary object, but surfaced the
-- expected duplicate protection as a registration failure.
create or replace function private.register_intake_document_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_document_id uuid,
  p_bucket_id text,
  p_object_path text,
  p_original_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  existing public.intake_domain_events;
  event_row public.intake_domain_events;
  document_row public.source_documents;
  duplicate_row public.source_documents;
  document_payload jsonb;
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status not in ('collecting', 'failed') then
    raise exception 'intake_session_not_collecting' using errcode = '55000';
  end if;
  if p_event_id is null or p_document_id is null
    or p_bucket_id <> 'opportunity-documents'
    or char_length(trim(coalesce(p_original_name, ''))) not between 1 and 500
    or char_length(trim(coalesce(p_object_path, ''))) not between 1 and 1024
    or p_object_path not like p_organization_id::text || '/' || p_session_id::text || '/%'
    or p_byte_size not between 1 and 52428800
    or p_sha256 !~ '^[a-f0-9]{64}$'
    or char_length(coalesce(nullif(trim(p_mime_type), ''), '')) > 255 then
    raise exception 'intake_document_command_invalid' using errcode = '22023';
  end if;

  document_payload := jsonb_strip_nulls(jsonb_build_object(
    'id', p_document_id,
    'originalName', trim(p_original_name),
    'objectPath', p_object_path,
    'sha256', p_sha256,
    'byteSize', p_byte_size,
    'mimeType', nullif(trim(coalesce(p_mime_type, '')), '')
  ));

  -- Preserve command idempotency before looking for a content duplicate. A true replay returns
  -- the result of the original event; a newly generated command for the same bytes returns the
  -- canonical document without appending a second receipt.
  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'document_received'
      or existing.payload is distinct from jsonb_build_object('document', document_payload, 'actorId', actor_id) then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'id', p_document_id,
      'original_name', existing.payload -> 'document' ->> 'originalName',
      'byte_size', (existing.payload -> 'document' ->> 'byteSize')::bigint,
      'duplicate', false,
      'replayed', true
    );
  end if;

  select document.* into duplicate_row
  from public.source_documents document
  where document.organization_id = p_organization_id
    and document.intake_session_id = p_session_id
    and document.sha256 = p_sha256
  order by document.created_at, document.id
  limit 1;

  if found then
    return jsonb_build_object(
      'id', duplicate_row.id,
      'original_name', duplicate_row.original_name,
      'byte_size', duplicate_row.byte_size,
      'duplicate', true,
      'replayed', false
    );
  end if;

  begin
    insert into public.source_documents (
      id, organization_id, opportunity_id, intake_session_id, bucket_id, object_path,
      original_name, mime_type, byte_size, sha256, created_by
    ) values (
      p_document_id, p_organization_id, null, p_session_id, p_bucket_id, p_object_path,
      trim(p_original_name), nullif(trim(coalesce(p_mime_type, '')), ''), p_byte_size,
      p_sha256, actor_id
    ) returning * into document_row;
  exception when unique_violation then
    -- Two identical uploads can pass the first lookup concurrently. Only the scope/hash conflict
    -- is an idempotent duplicate; UUID or object-path collisions remain genuine errors.
    select document.* into duplicate_row
    from public.source_documents document
    where document.organization_id = p_organization_id
      and document.intake_session_id = p_session_id
      and document.sha256 = p_sha256
    order by document.created_at, document.id
    limit 1;

    if found then
      return jsonb_build_object(
        'id', duplicate_row.id,
        'original_name', duplicate_row.original_name,
        'byte_size', duplicate_row.byte_size,
        'duplicate', true,
        'replayed', false
      );
    end if;
    raise;
  end;

  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, 'document_received',
    jsonb_build_object('document', document_payload, 'actorId', actor_id),
    occurred_at, actor_id
  );

  return jsonb_build_object(
    'id', document_row.id,
    'original_name', document_row.original_name,
    'byte_size', document_row.byte_size,
    'duplicate', false,
    'event_id', event_row.event_id,
    'replayed', false
  );
end;
$$;

comment on function private.register_intake_document_command(
  uuid, uuid, uuid, uuid, text, text, text, text, bigint, text
) is
  'Atomically registers an intake document and receipt; identical bytes in the same intake return the canonical document as an idempotent duplicate.';
