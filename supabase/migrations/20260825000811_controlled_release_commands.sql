-- Release evidence is not merely documentation. These commands make it the precondition for a
-- rollout transition. They are private, not granted through the Data API, and every approval is
-- tied to a real auth identity.

alter table public.organization_rollout_policies
  add constraint organization_rollout_external_release_only_active
  check (not external_release_enabled or state = 'active');

create or replace function private.create_release_cohort(
  p_cohort_kind text,
  p_pipeline_version text,
  p_model_policy_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare cohort_id uuid;
begin
  if p_cohort_kind not in ('wave_1', 'wave_2')
    or char_length(trim(coalesce(p_pipeline_version, ''))) < 3
    or char_length(trim(coalesce(p_model_policy_version, ''))) < 3 then
    raise exception 'release_cohort_contract_invalid' using errcode = '22023';
  end if;
  insert into private.release_cohorts (cohort_kind, pipeline_version, model_policy_version)
  values (p_cohort_kind, trim(p_pipeline_version), trim(p_model_policy_version))
  returning id into cohort_id;
  return cohort_id;
end;
$$;

create or replace function private.attest_release_case(
  p_cohort_id uuid,
  p_candidate_execution_id uuid,
  p_attestation_basis text,
  p_attested_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cohort private.release_cohorts;
  candidate public.controlled_case_executions;
  comparison public.case_execution_comparisons;
begin
  select * into cohort from private.release_cohorts row where row.id = p_cohort_id for update;
  if not found or cohort.status <> 'draft' then
    raise exception 'draft_release_cohort_required' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_attestation_basis, ''))) < 10
    or not exists (select 1 from auth.users where id = p_attested_by) then
    raise exception 'release_case_attestation_invalid' using errcode = '22023';
  end if;

  select * into candidate from public.controlled_case_executions execution
  where execution.id = p_candidate_execution_id
    and execution.mode in ('shadow', 'replay')
    and execution.status = 'succeeded';
  if not found then raise exception 'successful_candidate_execution_required' using errcode = '22023'; end if;
  if candidate.pipeline_version <> cohort.pipeline_version
    or candidate.model_policy_version <> cohort.model_policy_version then
    raise exception 'candidate_version_outside_cohort' using errcode = '22023';
  end if;

  select * into comparison from public.case_execution_comparisons row
  where row.organization_id = candidate.organization_id
    and row.candidate_execution_id = candidate.id
    and row.baseline_execution_id = candidate.baseline_execution_id
    and row.comparable and row.passed and row.critical_count = 0;
  if not found then raise exception 'passing_candidate_comparison_required' using errcode = '22023'; end if;

  insert into private.release_cohort_cases (
    cohort_id, organization_id, intake_session_id, baseline_execution_id,
    candidate_execution_id, real_case_attested, attestation_basis, attested_by
  ) values (
    cohort.id, candidate.organization_id, candidate.intake_session_id,
    candidate.baseline_execution_id, candidate.id, true, trim(p_attestation_basis), p_attested_by
  );
end;
$$;

create or replace function private.accept_release_cohort(
  p_cohort_id uuid,
  p_approved_by uuid,
  p_acceptance_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cohort private.release_cohorts;
  case_count integer;
begin
  select * into cohort from private.release_cohorts row where row.id = p_cohort_id for update;
  if not found or cohort.status <> 'draft' then
    raise exception 'draft_release_cohort_required' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_acceptance_note, ''))) < 10
    or not exists (select 1 from auth.users where id = p_approved_by) then
    raise exception 'release_cohort_approval_invalid' using errcode = '22023';
  end if;

  select count(*) into case_count from private.release_cohort_cases member
  join public.case_execution_comparisons comparison
    on comparison.organization_id = member.organization_id
   and comparison.candidate_execution_id = member.candidate_execution_id
  where member.cohort_id = cohort.id
    and member.real_case_attested
    and comparison.comparable and comparison.passed and comparison.critical_count = 0;
  if case_count <> 10 then
    raise exception 'release_cohort_requires_exactly_ten_passing_real_cases' using errcode = '22023';
  end if;

  update private.release_cohorts
  set status = 'accepted', acceptance_note = trim(p_acceptance_note),
      accepted_by = p_approved_by, accepted_at = now()
  where id = cohort.id;
end;
$$;

create or replace function private.promote_organization_rollout(
  p_organization_id uuid,
  p_to_state text,
  p_approved_by uuid,
  p_approval_note text,
  p_wave_1_cohort_id uuid default null,
  p_wave_2_cohort_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy public.organization_rollout_policies;
  wave_1 private.release_cohorts;
  wave_2 private.release_cohorts;
  decision_id uuid;
  evidence_fingerprint text;
  transition_allowed boolean := false;
begin
  select * into policy from public.organization_rollout_policies row
  where row.organization_id = p_organization_id for update;
  if not found then raise exception 'organization_rollout_policy_not_found' using errcode = 'P0002'; end if;
  if p_to_state not in ('off', 'shadow', 'canary', 'active', 'paused')
    or char_length(trim(coalesce(p_approval_note, ''))) < 10
    or not exists (select 1 from auth.users where id = p_approved_by) then
    raise exception 'rollout_approval_invalid' using errcode = '22023';
  end if;

  transition_allowed := policy.state = p_to_state
    or p_to_state = 'paused'
    or (policy.state = 'off' and p_to_state = 'shadow')
    or (policy.state = 'paused' and p_to_state in ('shadow', 'canary'))
    or (policy.state = 'shadow' and p_to_state in ('off', 'canary'))
    or (policy.state = 'canary' and p_to_state in ('shadow', 'active'))
    or (policy.state = 'active' and p_to_state = 'canary');
  if not transition_allowed then
    raise exception 'rollout_transition_not_allowed' using errcode = '22023';
  end if;

  if p_to_state in ('canary', 'active') then
    select * into wave_1 from private.release_cohorts cohort
    where cohort.id = p_wave_1_cohort_id and cohort.cohort_kind = 'wave_1'
      and cohort.status = 'accepted'
      and cohort.pipeline_version = policy.target_pipeline_version
      and cohort.model_policy_version = policy.target_model_policy_version;
    if not found then raise exception 'accepted_wave_1_required' using errcode = '22023'; end if;
  end if;

  if p_to_state = 'active' then
    select * into wave_2 from private.release_cohorts cohort
    where cohort.id = p_wave_2_cohort_id and cohort.cohort_kind = 'wave_2'
      and cohort.status = 'accepted'
      and cohort.pipeline_version = policy.target_pipeline_version
      and cohort.model_policy_version = policy.target_model_policy_version;
    if not found then raise exception 'accepted_wave_2_required' using errcode = '22023'; end if;
    if exists (
      select 1 from private.release_cohort_cases first_wave
      join private.release_cohort_cases second_wave
        on second_wave.intake_session_id = first_wave.intake_session_id
      where first_wave.cohort_id = wave_1.id and second_wave.cohort_id = wave_2.id
    ) then raise exception 'release_cohort_cases_must_not_overlap' using errcode = '22023'; end if;
  end if;

  evidence_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'organization_id', p_organization_id,
    'from', policy.state,
    'to', p_to_state,
    'policy_version', policy.policy_version,
    'pipeline_version', policy.target_pipeline_version,
    'model_policy_version', policy.target_model_policy_version,
    'wave_1', p_wave_1_cohort_id,
    'wave_2', p_wave_2_cohort_id
  )::text, 'utf8'), 'sha256'), 'hex');

  insert into private.release_decisions (
    organization_id, from_state, to_state, wave_1_cohort_id, wave_2_cohort_id,
    evidence_fingerprint, approval_note, approved_by
  ) values (
    p_organization_id, policy.state, p_to_state, p_wave_1_cohort_id, p_wave_2_cohort_id,
    evidence_fingerprint, trim(p_approval_note), p_approved_by
  ) returning id into decision_id;

  perform set_config('offroad.release_decision_id', decision_id::text, true);
  update public.organization_rollout_policies
  set state = p_to_state,
      external_release_enabled = p_to_state = 'active',
      promotion_basis = trim(p_approval_note),
      updated_by = p_approved_by
  where organization_id = p_organization_id;
  perform set_config('offroad.release_decision_id', '', true);

  return decision_id;
end;
$$;

create or replace function private.guard_rollout_policy_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare decision_id uuid;
begin
  if new.state = old.state
    and new.target_pipeline_version = old.target_pipeline_version
    and new.target_model_policy_version = old.target_model_policy_version
    and new.external_release_enabled = old.external_release_enabled then
    return new;
  end if;
  begin
    decision_id := nullif(current_setting('offroad.release_decision_id', true), '')::uuid;
  exception when invalid_text_representation then
    decision_id := null;
  end;
  if decision_id is null or not exists (
    select 1 from private.release_decisions decision
    where decision.id = decision_id
      and decision.organization_id = old.organization_id
      and decision.from_state = old.state
      and decision.to_state = new.state
  ) then
    raise exception 'rollout_update_requires_release_decision' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organization_rollout_policies_guard_update
  before update on public.organization_rollout_policies
  for each row execute function private.guard_rollout_policy_update();

revoke all on function private.create_release_cohort(text, text, text) from public, anon, authenticated;
revoke all on function private.attest_release_case(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.accept_release_cohort(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.promote_organization_rollout(uuid, text, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function private.guard_rollout_policy_update() from public, anon, authenticated;
