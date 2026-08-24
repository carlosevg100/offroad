create index if not exists retrieval_audit_events_actor_user_idx
  on private.retrieval_audit_events (actor_user_id);

create index if not exists retrieval_audit_events_org_run_idx
  on private.retrieval_audit_events (organization_id, processing_run_id);

create index if not exists case_artifact_manifests_created_by_idx
  on public.case_artifact_manifests (created_by);

create index if not exists case_artifact_manifests_org_run_idx
  on public.case_artifact_manifests (organization_id, processing_run_id);

create index if not exists governed_precedents_approved_by_idx
  on public.governed_precedents (approved_by);

create index if not exists house_playbook_versions_approved_by_idx
  on public.house_playbook_versions (approved_by);

create index if not exists intake_information_answers_answered_by_idx
  on public.intake_information_answers (answered_by);

create index if not exists precedent_authorizations_approved_by_idx
  on public.precedent_authorizations (approved_by);

create index if not exists sounding_events_created_by_idx
  on public.sounding_events (created_by);

create index if not exists sounding_events_org_intake_idx
  on public.sounding_events (organization_id, intake_session_id);

create index if not exists sounding_events_org_investor_idx
  on public.sounding_events (organization_id, investor_id);

create index if not exists sounding_investors_fund_directory_idx
  on public.sounding_investors (fund_directory_id);

create index if not exists sounding_investors_org_intake_idx
  on public.sounding_investors (organization_id, intake_session_id);

create index if not exists soundings_created_by_idx
  on public.soundings (created_by);
