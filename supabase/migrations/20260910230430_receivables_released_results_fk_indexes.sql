-- Covering indexes for the composite foreign keys of the released R01 result. The session and
-- scope lookups already have theirs; the project, run and input-assembly keys did not, and the
-- performance advisor reports each one. Indexes only: no policy, grant or contract changes here.
create index if not exists receivables_released_results_project_idx
  on private.receivables_released_results (organization_id, capital_project_id);
create index if not exists receivables_released_results_run_idx
  on private.receivables_released_results (organization_id, processing_run_id);
create index if not exists receivables_released_results_assembly_idx
  on private.receivables_released_results (organization_id, input_assembly_id);
