create index document_intake_sessions_opportunity_fk_idx
  on public.document_intake_sessions (organization_id, opportunity_id)
  where opportunity_id is not null;

create index intake_field_candidates_created_by_idx
  on public.intake_field_candidates (created_by);

create index intake_field_candidates_reviewed_by_idx
  on public.intake_field_candidates (reviewed_by)
  where reviewed_by is not null;

create index intake_issues_resolved_by_idx
  on public.intake_issues (resolved_by)
  where resolved_by is not null;
