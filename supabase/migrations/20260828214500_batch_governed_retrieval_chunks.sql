-- Large receivables tapes can produce more than a thousand parser-anchored retrieval chunks.
-- Writing them one row at a time exceeded the Data API statement timeout after the deterministic
-- layer was already stored, and the retry then collided with that stored layer. Validate the
-- complete batch first and insert it set-wise so the governed index remains complete, atomic and
-- bounded by the existing 2,000-chunk capability contract.

create or replace function private.worker_record_retrieval_chunks(
  p_job_id uuid,
  p_capability_token text,
  p_chunks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  document_row public.source_documents;
  written integer := 0;
  invalid_count integer := 0;
begin
  if job_row.kind <> 'document_pipeline' or job_row.source_document_id is null then
    raise exception 'document_pipeline_capability_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) > 2000 then
    raise exception 'retrieval_chunks_invalid' using errcode = '22023';
  end if;

  select * into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;

  select * into document_row
  from public.source_documents document
  where document.organization_id = job_row.organization_id
    and document.id = job_row.source_document_id
    and document.intake_session_id = job_row.intake_session_id;
  if not found then raise exception 'source_document_not_in_job' using errcode = '22023'; end if;

  with entries as (
    select
      entry,
      trim(coalesce(entry ->> 'content', '')) as content,
      coalesce(entry ->> 'content_hash', '') as content_hash
    from jsonb_array_elements(p_chunks) as chunk(entry)
  )
  select count(*) into invalid_count
  from entries
  where jsonb_typeof(entry) <> 'object'
    or char_length(content) not between 20 and 12000
    or content_hash !~ '^[a-f0-9]{64}$'
    or content_hash <> encode(extensions.digest(content, 'sha256'), 'hex')
    or jsonb_typeof(entry -> 'source_anchor') <> 'object'
    or char_length(coalesce(entry ->> 'chunk_key', '')) not between 3 and 500
    or (entry ? 'tags' and jsonb_typeof(entry -> 'tags') <> 'array');

  if invalid_count > 0 then
    raise exception 'retrieval_chunk_invalid' using errcode = '22023';
  end if;

  delete from public.case_retrieval_chunks
  where organization_id = job_row.organization_id
    and source_document_id = document_row.id
    and document_version = document_row.document_version;

  insert into public.case_retrieval_chunks (
    organization_id, intake_session_id, opportunity_id, source_document_id, document_version,
    processing_run_id, chunk_key, content, content_hash, locale, source_anchor, tags
  )
  select
    job_row.organization_id,
    job_row.intake_session_id,
    session_row.opportunity_id,
    document_row.id,
    document_row.document_version,
    job_row.processing_run_id,
    entry ->> 'chunk_key',
    trim(entry ->> 'content'),
    entry ->> 'content_hash',
    case when entry ->> 'locale' in ('pt-BR', 'en-US', 'mixed') then entry ->> 'locale' else 'mixed' end,
    entry -> 'source_anchor',
    coalesce(
      array(select jsonb_array_elements_text(coalesce(entry -> 'tags', '[]'::jsonb))),
      '{}'::text[]
    )
  from jsonb_array_elements(p_chunks) as chunk(entry);

  get diagnostics written = row_count;
  return jsonb_build_object('written', written, 'source_document_id', document_row.id);
end;
$$;

create or replace function public.worker_record_retrieval_chunks(
  p_job_id uuid,
  p_capability_token text,
  p_chunks jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_retrieval_chunks(p_job_id, p_capability_token, p_chunks);
$$;

revoke all on function private.worker_record_retrieval_chunks(uuid, text, jsonb) from public, anon;
revoke all on function public.worker_record_retrieval_chunks(uuid, text, jsonb) from public, anon;
grant execute on function private.worker_record_retrieval_chunks(uuid, text, jsonb) to authenticated;
grant execute on function public.worker_record_retrieval_chunks(uuid, text, jsonb) to authenticated;

comment on function public.worker_record_retrieval_chunks(uuid, text, jsonb) is
  'Atomically validates and set-wise replaces up to 2,000 parser-anchored retrieval chunks for the document capability.';
