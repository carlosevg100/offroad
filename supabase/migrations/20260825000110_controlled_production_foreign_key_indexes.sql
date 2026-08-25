-- Every release-governance foreign key gets a covering index. These tables are small during
-- canary but are append-only by design, so missing indexes would become expensive exactly when
-- the evidence history becomes valuable.

create index organization_rollout_policies_updated_by_fk_idx
  on public.organization_rollout_policies (updated_by)
  where updated_by is not null;

create index controlled_case_executions_created_by_fk_idx
  on public.controlled_case_executions (created_by)
  where created_by is not null;

create index release_cohorts_accepted_by_fk_idx
  on private.release_cohorts (accepted_by)
  where accepted_by is not null;

create index release_cohort_cases_session_fk_idx
  on private.release_cohort_cases (organization_id, intake_session_id);
create index release_cohort_cases_baseline_fk_idx
  on private.release_cohort_cases (organization_id, baseline_execution_id);
create index release_cohort_cases_candidate_fk_idx
  on private.release_cohort_cases (organization_id, candidate_execution_id);
create index release_cohort_cases_attested_by_fk_idx
  on private.release_cohort_cases (attested_by)
  where attested_by is not null;

create index release_decisions_organization_fk_idx
  on private.release_decisions (organization_id, approved_at desc);
create index release_decisions_wave_1_fk_idx
  on private.release_decisions (wave_1_cohort_id)
  where wave_1_cohort_id is not null;
create index release_decisions_wave_2_fk_idx
  on private.release_decisions (wave_2_cohort_id)
  where wave_2_cohort_id is not null;
create index release_decisions_approved_by_fk_idx
  on private.release_decisions (approved_by)
  where approved_by is not null;
