-- Covering indexes for the foreign keys introduced by the F1 pipeline (20260818171246).
--
-- The performance advisor flagged ten unindexed foreign keys, all of them on tables this
-- phase created or extended. Two reasons to close them now, while the tables are empty:
--
--   * the read paths of the Documents tab (F1-4) are exactly these: jobs of a session, jobs
--     of a document, profile and layer of a document, candidates and issues of a run;
--   * every one of these keys is declared `on delete cascade` or `on delete set null`, so
--     deleting a run, a session or a document triggers a sequential scan per referencing
--     table without them.
--
-- Naming follows the existing `<table>_<subject>_idx` convention.

create index processing_jobs_session_idx
  on public.processing_jobs (organization_id, intake_session_id, created_at desc);
create index processing_jobs_document_idx
  on public.processing_jobs (organization_id, source_document_id);
create index processing_jobs_leased_by_idx
  on public.processing_jobs (leased_by)
  where leased_by is not null;

create index processing_runs_created_by_idx
  on public.processing_runs (created_by);

create index document_profiles_run_idx
  on public.document_profiles (organization_id, processing_run_id)
  where processing_run_id is not null;
create index document_profiles_reviewed_by_idx
  on public.document_profiles (reviewed_by)
  where reviewed_by is not null;

create index document_layers_run_idx
  on public.document_layers (organization_id, processing_run_id)
  where processing_run_id is not null;

create index document_intake_sessions_current_run_idx
  on public.document_intake_sessions (organization_id, current_run_id)
  where current_run_id is not null;

create index intake_field_candidates_run_idx
  on public.intake_field_candidates (organization_id, processing_run_id)
  where processing_run_id is not null;

create index intake_issues_run_idx
  on public.intake_issues (organization_id, processing_run_id)
  where processing_run_id is not null;
