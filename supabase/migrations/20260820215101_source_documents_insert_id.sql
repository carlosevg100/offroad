-- A client may choose the row's own id, which is ordinary PostgREST usage and carries no
-- privilege: the primary key and the per-organization uniqueness constraint decide whether the
-- value is acceptable, not the grant. Omitted from the previous migration by oversight, and the
-- `database` CI job caught it, which is the assertion doing its job on the first run.
grant insert (id) on public.source_documents to authenticated;
