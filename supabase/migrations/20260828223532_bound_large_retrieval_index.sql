-- A production receivables tape produced roughly six million searchable characters. The
-- governed replacement was correctly set-wise, but its material audit still emitted one row per
-- chunk and the worker role's short statement timeout cancelled the bounded operation. Retrieval
-- chunks are a derived index, so audit the atomic document replacement as a batch and give the
-- already-bounded command enough time to finish its generated tsvectors and GIN maintenance.

drop trigger if exists case_retrieval_chunks_audit on public.case_retrieval_chunks;

create or replace function private.capture_case_retrieval_chunk_insert_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  select
    rows.organization_id,
    (select auth.uid()),
    'insert',
    'case_retrieval_chunks',
    rows.source_document_id::text,
    jsonb_build_object(
      'operation', 'INSERT',
      'row_count', count(*),
      'intake_session_id', rows.intake_session_id,
      'document_version', rows.document_version,
      'processing_run_id', rows.processing_run_id
    )
  from inserted_case_retrieval_chunks rows
  group by
    rows.organization_id,
    rows.intake_session_id,
    rows.source_document_id,
    rows.document_version,
    rows.processing_run_id;

  return null;
end;
$$;

create or replace function private.capture_case_retrieval_chunk_update_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  select
    rows.organization_id,
    (select auth.uid()),
    'update',
    'case_retrieval_chunks',
    rows.source_document_id::text,
    jsonb_build_object(
      'operation', 'UPDATE',
      'row_count', count(*),
      'intake_session_id', rows.intake_session_id,
      'document_version', rows.document_version,
      'processing_run_id', rows.processing_run_id
    )
  from updated_case_retrieval_chunks rows
  group by
    rows.organization_id,
    rows.intake_session_id,
    rows.source_document_id,
    rows.document_version,
    rows.processing_run_id;

  return null;
end;
$$;

create or replace function private.capture_case_retrieval_chunk_delete_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  select
    rows.organization_id,
    (select auth.uid()),
    'delete',
    'case_retrieval_chunks',
    rows.source_document_id::text,
    jsonb_build_object(
      'operation', 'DELETE',
      'row_count', count(*),
      'intake_session_id', rows.intake_session_id,
      'document_version', rows.document_version,
      'processing_run_id', rows.processing_run_id
    )
  from deleted_case_retrieval_chunks rows
  group by
    rows.organization_id,
    rows.intake_session_id,
    rows.source_document_id,
    rows.document_version,
    rows.processing_run_id;

  return null;
end;
$$;

revoke all on function private.capture_case_retrieval_chunk_insert_batch() from public, anon;
revoke all on function private.capture_case_retrieval_chunk_update_batch() from public, anon;
revoke all on function private.capture_case_retrieval_chunk_delete_batch() from public, anon;

create trigger case_retrieval_chunks_insert_audit
  after insert on public.case_retrieval_chunks
  referencing new table as inserted_case_retrieval_chunks
  for each statement execute function private.capture_case_retrieval_chunk_insert_batch();

create trigger case_retrieval_chunks_update_audit
  after update on public.case_retrieval_chunks
  referencing new table as updated_case_retrieval_chunks
  for each statement execute function private.capture_case_retrieval_chunk_update_batch();

create trigger case_retrieval_chunks_delete_audit
  after delete on public.case_retrieval_chunks
  referencing old table as deleted_case_retrieval_chunks
  for each statement execute function private.capture_case_retrieval_chunk_delete_batch();

-- The capability command rejects more than 2,000 chunks and validates every content hash and
-- 12,000-character bound before writing. Thirty seconds is therefore a circuit breaker for a
-- finite, authenticated background operation, not an unbounded request timeout.
alter function private.worker_record_retrieval_chunks(uuid, text, jsonb)
  set statement_timeout = '30s';

comment on function private.worker_record_retrieval_chunks(uuid, text, jsonb) is
  'Validates and atomically replaces at most 2,000 governed chunks; batch-audited and bounded to 30 seconds for large operational tapes.';
