drop index if exists public.source_documents_org_sha_idx;

create unique index source_documents_opportunity_sha_idx
  on public.source_documents (organization_id, opportunity_id, sha256)
  where opportunity_id is not null and intake_session_id is null and sha256 is not null;

create unique index source_documents_intake_sha_idx
  on public.source_documents (organization_id, intake_session_id, sha256)
  where intake_session_id is not null and sha256 is not null;
