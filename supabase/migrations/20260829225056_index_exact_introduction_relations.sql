-- Cover the new exact-recipient relations used by plan loading, review and audit.

create index if not exists qualified_introduction_targets_session_fk_idx
  on public.qualified_introduction_targets (organization_id, intake_session_id);

create index if not exists qualified_introduction_targets_created_by_fk_idx
  on public.qualified_introduction_targets (created_by);

create index if not exists qualified_introduction_targets_mandate_reviewer_fk_idx
  on public.qualified_introduction_targets (mandate_revalidated_by)
  where mandate_revalidated_by is not null;
