-- Document-first intake: let users remove a wrongly uploaded file while the session is still
-- open, and record server-side content verification.
--
-- 1. `source_documents` gains a DELETE policy (and grant) limited to documents that belong to an
--    intake session of the caller's borrower-side tenant, are not yet linked to an opportunity,
--    and whose session is not confirmed. Once a document is evidence (session confirmed /
--    opportunity linked) it cannot be deleted through the Data API — versioning comes later.
-- 2. `sha256_verified_at` records when the server recomputed the SHA-256 of the stored object.
--    Until this exists, `sha256` is a value asserted by the browser; the processing step now
--    downloads the object, recomputes the hash, stores the verified value and stamps this column.

alter table public.source_documents
  add column if not exists sha256_verified_at timestamptz;

comment on column public.source_documents.sha256_verified_at is
  'Set when the server recomputed sha256 from the stored object; null means the value is still the browser-asserted hash.';

drop policy if exists source_documents_delete on public.source_documents;
create policy source_documents_delete on public.source_documents for delete to authenticated
  using (
    intake_session_id is not null
    and opportunity_id is null
    and (select private.can_access_intake_session(organization_id, intake_session_id))
    and (select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad']))
    and exists (
      select 1
      from public.document_intake_sessions s
      where s.organization_id = source_documents.organization_id
        and s.id = source_documents.intake_session_id
        and s.status <> 'confirmed'
    )
  );

grant delete on public.source_documents to authenticated;
