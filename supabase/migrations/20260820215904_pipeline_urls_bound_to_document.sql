-- The job payload's URLs must point at the document they claim to carry.
--
-- `begin_processing_run` copied `download_url`, `layer_object_path` and `layer_upload_url`
-- straight from its caller. The function is granted to `authenticated`, so those three fields
-- were, in effect, a tenant member writing directly into a message that a process in our AWS
-- account acts on. `http://169.254.170.2/v2/credentials/...` as the download and any endpoint
-- at all as the upload is a complete exfiltration path for the worker's task role, requiring
-- no other defect anywhere.
--
-- Two checks in two places, because neither is sufficient alone and each is cheap:
--
--   * here, the URL is bound to the object it names. A link may only be handed to the worker
--     for the document row this run actually resolved, and a layer may only be written under
--     `<organization>/<session>/`, which is the prefix the Storage policies read.
--   * in the worker (`apps/document-worker/src/storage-url.ts`), the URL is bound to the
--     origin the worker was configured with. Only that process knows, from its environment
--     rather than from the message, which storage is ours.
--
-- The database cannot do the origin check honestly: it does not know its own public URL, and
-- hardcoding one here would be a constant that silently rots when the project moves. The
-- worker cannot do the object check: it has no way to know which document row the link was
-- signed for. So each side checks the half it can actually prove.
create or replace function private.begin_processing_run(
  p_organization_id uuid,
  p_session_id uuid,
  p_trigger text,
  p_documents jsonb,
  p_pipeline_version text,
  p_budget jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
  run_row public.processing_runs;
  next_run_no integer;
  document_entry jsonb;
  document_row public.source_documents;
  created_jobs uuid[] := array[]::uuid[];
  job_id uuid;
  download_url text;
  layer_object_path text;
  layer_upload_url text;
  layer_prefix text;
  storage_at integer;
begin
  if p_trigger not in ('upload', 'manual', 'answer', 'reprocess', 'document_removed') then
    raise exception 'processing_trigger_invalid' using errcode = '22023';
  end if;
  if p_documents is null or jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) = 0 then
    raise exception 'processing_documents_required' using errcode = '22023';
  end if;
  if coalesce(trim(p_pipeline_version), '') = '' then
    raise exception 'pipeline_version_required' using errcode = '22023';
  end if;

  session_row := private.intake_session_for_update(p_organization_id, p_session_id);

  if session_row.status not in ('collecting', 'processing', 'review_ready', 'failed') then
    raise exception 'intake_session_not_processable' using errcode = '22023';
  end if;

  layer_prefix := p_organization_id::text || '/' || p_session_id::text || '/';

  select coalesce(max(run_no), 0) + 1 into next_run_no
  from public.processing_runs
  where organization_id = p_organization_id and intake_session_id = p_session_id;

  insert into public.processing_runs (
    organization_id, intake_session_id, run_no, trigger, status, pipeline_version, budget, created_by
  )
  values (
    p_organization_id, p_session_id, next_run_no, p_trigger, 'queued', trim(p_pipeline_version),
    coalesce(p_budget, '{}'::jsonb), (select auth.uid())
  )
  returning * into run_row;

  for document_entry in select * from jsonb_array_elements(p_documents)
  loop
    select * into document_row
    from public.source_documents
    where organization_id = p_organization_id
      and id = (document_entry->>'source_document_id')::uuid
      and intake_session_id = p_session_id;

    if not found then
      raise exception 'source_document_not_in_session' using errcode = 'P0002';
    end if;

    download_url := document_entry->>'download_url';
    layer_object_path := document_entry->>'layer_object_path';
    layer_upload_url := document_entry->>'layer_upload_url';

    -- A download link is only acceptable for the object this row already resolved to. The
    -- object path has to appear inside the Storage part of the URL rather than anywhere in
    -- it, so a query string cannot be used to smuggle the expected text past the check.
    if download_url is not null then
      storage_at := position('/storage/v1/' in download_url);
      if storage_at = 0 or position(document_row.object_path in download_url) <= storage_at then
        raise exception 'processing_url_not_for_document' using errcode = '22023';
      end if;
    end if;

    -- The layer is written under `<organization>/<session>/`, which is the prefix the Storage
    -- policies read (`private.storage_organization_id` and `private.storage_opportunity_id`
    -- take folders 1 and 2). A path outside it is either another tenant's or unpoliced.
    if layer_object_path is not null and left(layer_object_path, length(layer_prefix)) <> layer_prefix then
      raise exception 'processing_layer_path_outside_session' using errcode = '22023';
    end if;

    if layer_upload_url is not null then
      if layer_object_path is null then
        raise exception 'processing_layer_path_required' using errcode = '22023';
      end if;
      storage_at := position('/storage/v1/' in layer_upload_url);
      if storage_at = 0 or position(layer_object_path in layer_upload_url) <= storage_at then
        raise exception 'processing_url_not_for_document' using errcode = '22023';
      end if;
    end if;

    insert into public.processing_jobs (
      organization_id, processing_run_id, intake_session_id, source_document_id, kind, payload
    )
    values (
      p_organization_id, run_row.id, p_session_id, document_row.id, 'document_pipeline',
      jsonb_strip_nulls(jsonb_build_object(
        'source_document_id', document_row.id,
        'document_version', document_row.document_version,
        'original_name', document_row.original_name,
        'mime_type', document_row.mime_type,
        'byte_size', document_row.byte_size,
        'sha256', document_row.sha256,
        'object_path', document_row.object_path,
        'download_url', download_url,
        'layer_object_path', layer_object_path,
        'layer_upload_url', layer_upload_url,
        'locale', session_row.locale
      ))
    )
    returning id into job_id;

    created_jobs := created_jobs || job_id;
  end loop;

  update public.document_intake_sessions
  set status = 'processing',
      current_run_id = run_row.id,
      pipeline_version = trim(p_pipeline_version),
      processing_started_at = now(),
      processing_completed_at = null
  where organization_id = p_organization_id and id = p_session_id;

  return jsonb_build_object(
    'processing_run_id', run_row.id,
    'run_no', run_row.run_no,
    'job_ids', to_jsonb(created_jobs),
    'job_count', coalesce(array_length(created_jobs, 1), 0)
  );
end;
$$;

-- And the path the check above matches against is now itself constrained.
--
-- `object_path` became tenant-insertable when the write surface narrowed to named columns, and
-- it is the string the Storage policies parse into an organization and a session. Two things
-- follow. It has to start with the row's own organization, or a tenant could register a row
-- describing another tenant's object, and it has to stay inside the alphabet the uploader
-- already produces (`safeObjectName`), because a path containing a space or a percent sign
-- would appear percent-encoded in a signed URL and the match above would refuse a legitimate
-- run. The single existing row was checked against this before it was added.
alter table public.source_documents
  add constraint source_documents_object_path_scoped
  check (
    object_path like organization_id::text || '/%'
    and object_path !~ '\.\.'
    and object_path ~ '^[A-Za-z0-9._/-]+$'
  );
