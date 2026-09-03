-- Cover every foreign key introduced by the governed agent workspace foundation.
-- These indexes protect deletes and joins from table scans as the audit history grows.

create index public_research_runs_processing_run_fk_idx
  on public.public_research_runs (organization_id, processing_run_id);

create index public_research_runs_created_by_fk_idx
  on public.public_research_runs (created_by);

create index agent_change_proposals_source_manifest_fk_idx
  on public.agent_change_proposals (organization_id, source_manifest_id);

create index agent_change_proposals_proposed_by_fk_idx
  on public.agent_change_proposals (proposed_by);

create index agent_change_proposals_decided_by_fk_idx
  on public.agent_change_proposals (decided_by)
  where decided_by is not null;
