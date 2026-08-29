-- Cover the auth.users foreign key used by audit and deletion checks.
create index qualified_introduction_feedback_recorded_by_fk_idx
  on public.qualified_introduction_feedback_events (recorded_by);
