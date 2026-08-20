-- Covering indexes for the two foreign keys the linter flagged on extraction_feedback.
-- A cascade delete of an organization or a candidate scans these; without them the delete
-- degrades to a sequential scan of a table that only ever grows.
create index if not exists extraction_feedback_candidate_fk_idx
  on public.extraction_feedback (organization_id, candidate_id);

create index if not exists extraction_feedback_created_by_idx
  on public.extraction_feedback (created_by);
