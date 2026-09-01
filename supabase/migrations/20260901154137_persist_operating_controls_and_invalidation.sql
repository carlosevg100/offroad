-- Persist the pre-mortem control plane as evidence, not prose. No tenant may write these
-- ledgers directly. A worker can record only inside the exact job capability it leased, and
-- external release fails closed unless a current control snapshot is bound to the exact case,
-- material, match and recipient authorization.

create table private.platform_capability_accreditations (
  id uuid primary key default gen_random_uuid(),
  scope_id text not null check (char_length(trim(scope_id)) between 3 and 200),
  stage text not null check (stage in (
    'represent', 'analyze', 'recommend', 'structure', 'external_release'
  )),
  claimed_maturity text not null check (claimed_maturity in (
    'unsupported', 'specified', 'implemented', 'tested', 'production'
  )),
  effective_maturity text not null check (effective_maturity in (
    'unsupported', 'specified', 'implemented', 'tested', 'production'
  )),
  accredited boolean not null,
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  blockers text[] not null default '{}'::text[],
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  decision_fingerprint text not null check (decision_fingerprint ~ '^[a-f0-9]{64}$'),
  evaluated_at timestamptz not null,
  valid_through timestamptz not null,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (decision_fingerprint),
  check (valid_through > evaluated_at),
  check ((accredited and cardinality(blockers) = 0)
    or (not accredited and cardinality(blockers) > 0))
);

create index platform_capability_accreditations_current_idx
  on private.platform_capability_accreditations (scope_id, stage, created_at desc);
create index platform_capability_accreditations_recorded_by_idx
  on private.platform_capability_accreditations (recorded_by);

alter table private.platform_capability_accreditations enable row level security;
alter table private.platform_capability_accreditations force row level security;
revoke all privileges on private.platform_capability_accreditations
  from public, anon, authenticated;

create table public.operating_control_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  processing_job_id uuid not null,
  requested_use text not null check (requested_use in (
    'preliminary', 'internal_decision', 'external_material', 'external_action'
  )),
  scope_id text not null check (char_length(trim(scope_id)) between 3 and 200),
  schema_version text not null check (schema_version = 'operating-control-snapshot.v1'),
  input_fingerprint text not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
  binding jsonb not null check (jsonb_typeof(binding) = 'object'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_fingerprint text not null check (snapshot_fingerprint ~ '^[a-f0-9]{64}$'),
  capability_accreditation_id uuid references private.platform_capability_accreditations(id) on delete restrict,
  allowed boolean not null,
  blockers text[] not null default '{}'::text[],
  warnings text[] not null default '{}'::text[],
  decision_fingerprint text not null check (decision_fingerprint ~ '^[a-f0-9]{64}$'),
  valid_until timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (organization_id, id),
  unique (organization_id, processing_job_id, requested_use, decision_fingerprint),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, processing_job_id)
    references public.processing_jobs(organization_id, id) on delete restrict,
  check ((allowed and cardinality(blockers) = 0) or (not allowed and cardinality(blockers) > 0)),
  check (valid_until > created_at)
);

create index operating_control_snapshots_case_idx
  on public.operating_control_snapshots (
    organization_id, intake_session_id, requested_use, created_at desc
  );
create index operating_control_snapshots_job_idx
  on public.operating_control_snapshots (organization_id, processing_job_id);
create index operating_control_snapshots_capability_idx
  on public.operating_control_snapshots (capability_accreditation_id)
  where capability_accreditation_id is not null;

alter table public.operating_control_snapshots enable row level security;
alter table public.operating_control_snapshots force row level security;
create policy operating_control_snapshots_select
  on public.operating_control_snapshots for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
revoke all privileges on public.operating_control_snapshots from public, anon, authenticated;
grant select on public.operating_control_snapshots to authenticated;

create table public.dependency_invalidation_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  source_kind text not null check (source_kind in (
    'source_document', 'case_input', 'deal_state', 'human_intervention'
  )),
  source_reference text not null check (char_length(trim(source_reference)) between 3 and 300),
  changed_roots jsonb not null check (
    jsonb_typeof(changed_roots) = 'array' and jsonb_array_length(changed_roots) between 1 and 100
  ),
  invalidated jsonb not null check (
    jsonb_typeof(invalidated) = 'array' and jsonb_array_length(invalidated) between 1 and 500
  ),
  graph_fingerprint text not null check (graph_fingerprint ~ '^[a-f0-9]{64}$'),
  result_fingerprint text not null check (result_fingerprint ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null default clock_timestamp(),
  unique (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade
);

create index dependency_invalidation_events_case_idx
  on public.dependency_invalidation_events (organization_id, intake_session_id, occurred_at desc);
alter table public.dependency_invalidation_events enable row level security;
alter table public.dependency_invalidation_events force row level security;
create policy dependency_invalidation_events_select
  on public.dependency_invalidation_events for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
revoke all privileges on public.dependency_invalidation_events from public, anon, authenticated;
grant select on public.dependency_invalidation_events to authenticated;

create table private.human_intervention_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  task_id text not null check (char_length(trim(task_id)) between 1 and 100),
  cause text not null check (cause in (
    'missing_product_capability', 'model_quality_failure', 'data_quality_failure',
    'workflow_failure', 'client_request', 'required_professional_judgment', 'exception_handling'
  )),
  minutes numeric(10,2) not null check (minutes > 0 and minutes <= 10000),
  captured boolean not null,
  changed_canonical_state boolean not null,
  reviewed boolean not null,
  review_reference text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  check (not reviewed or char_length(trim(coalesce(review_reference, ''))) between 3 and 500),
  check (not changed_canonical_state or reviewed or not captured)
);

create index human_intervention_ledger_case_idx
  on private.human_intervention_ledger (organization_id, intake_session_id, occurred_at desc);
create index human_intervention_ledger_recorded_by_idx
  on private.human_intervention_ledger (recorded_by);
alter table private.human_intervention_ledger enable row level security;
alter table private.human_intervention_ledger force row level security;
revoke all privileges on private.human_intervention_ledger from public, anon, authenticated;

create function private.reject_control_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A project deletion owns the lifecycle of its tenant-scoped evidence. PostgreSQL executes
  -- the FK cascade inside a nested trigger; permit only that privacy/deletion path. A direct
  -- ledger DELETE or any UPDATE remains forbidden, including to service_role.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'operating_control_ledger_is_append_only' using errcode = '42501';
end;
$$;

create trigger platform_capability_accreditations_immutable
  before update or delete on private.platform_capability_accreditations
  for each row execute function private.reject_control_ledger_mutation();
create trigger operating_control_snapshots_immutable
  before update or delete on public.operating_control_snapshots
  for each row execute function private.reject_control_ledger_mutation();
create trigger dependency_invalidation_events_immutable
  before update or delete on public.dependency_invalidation_events
  for each row execute function private.reject_control_ledger_mutation();
create trigger human_intervention_ledger_immutable
  before update or delete on private.human_intervention_ledger
  for each row execute function private.reject_control_ledger_mutation();
revoke all on function private.reject_control_ledger_mutation()
  from public, anon, authenticated;

create function private.record_platform_capability_accreditation_v1(
  p_scope_id text,
  p_stage text,
  p_claimed_maturity text,
  p_effective_maturity text,
  p_accredited boolean,
  p_evidence jsonb,
  p_blockers text[],
  p_evaluated_at timestamptz,
  p_valid_through timestamptz,
  p_recorded_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  evidence_fingerprint text;
  decision_fingerprint text;
  accreditation_id uuid;
  real_case_count integer;
  distinct_real_case_count integer;
begin
  if char_length(trim(coalesce(p_scope_id, ''))) not between 3 and 200
    or p_stage not in ('represent', 'analyze', 'recommend', 'structure', 'external_release')
    or p_claimed_maturity not in ('unsupported', 'specified', 'implemented', 'tested', 'production')
    or p_effective_maturity not in ('unsupported', 'specified', 'implemented', 'tested', 'production')
    or coalesce(jsonb_typeof(p_evidence), 'null') <> 'object'
    or p_valid_through <= p_evaluated_at
    or not exists (select 1 from auth.users where id = p_recorded_by)
    or (p_accredited and coalesce(cardinality(p_blockers), 0) <> 0)
    or (not p_accredited and coalesce(cardinality(p_blockers), 0) = 0)
    or (case p_effective_maturity
          when 'unsupported' then 0 when 'specified' then 1 when 'implemented' then 2
          when 'tested' then 3 when 'production' then 4 else 99 end)
       > (case p_claimed_maturity
          when 'unsupported' then 0 when 'specified' then 1 when 'implemented' then 2
          when 'tested' then 3 when 'production' then 4 else -1 end)
    or (p_accredited and p_effective_maturity <> p_claimed_maturity) then
    raise exception 'invalid_capability_accreditation' using errcode = '22023';
  end if;

  p_evidence := p_evidence || jsonb_build_object(
    'evaluatedAt', p_evaluated_at,
    'validThrough', p_valid_through
  );

  if p_accredited then
    if coalesce(p_evidence ->> 'procedureVersion', '') = ''
      or coalesce(p_evidence ->> 'ownerId', '') = ''
      or coalesce(jsonb_typeof(p_evidence -> 'realCaseIds'), 'null') <> 'array'
      or not (p_evidence ? 'realCaseEvidenceSource')
      or (p_effective_maturity in ('implemented', 'tested', 'production')
          and coalesce(p_evidence ->> 'implementationFingerprint', '') !~ '^[a-f0-9]{64}$')
      or (p_effective_maturity in ('tested', 'production') and (
        coalesce((p_evidence ->> 'goldCasesPassed')::integer, 0)
          < coalesce((p_evidence ->> 'goldCasesRequired')::integer, 1)
        or coalesce((p_evidence ->> 'adversarialCasesPassed')::integer, 0)
          < coalesce((p_evidence ->> 'adversarialCasesRequired')::integer, 1)
        or coalesce((p_evidence ->> 'criticalRegressions')::integer, 0) <> 0
        or coalesce((p_evidence ->> 'openCriticalFindings')::integer, 0) <> 0
      )) then
      raise exception 'capability_accreditation_evidence_incomplete' using errcode = '22023';
    end if;
    if p_effective_maturity = 'production' then
      if coalesce(jsonb_typeof(p_evidence -> 'realCaseIds'), 'null') <> 'array'
        or p_evidence ->> 'realCaseEvidenceSource' <> 'controlled_execution_ledger' then
        raise exception 'production_capability_requires_controlled_real_cases' using errcode = '22023';
      end if;
      real_case_count := jsonb_array_length(p_evidence -> 'realCaseIds');
      select count(distinct value)
      into distinct_real_case_count
      from jsonb_array_elements_text(p_evidence -> 'realCaseIds');
      if real_case_count < 20 or distinct_real_case_count <> real_case_count then
        raise exception 'production_capability_requires_twenty_distinct_real_cases' using errcode = '22023';
      end if;
    end if;
  end if;

  evidence_fingerprint := encode(
    extensions.digest(convert_to(p_evidence::text, 'utf8'), 'sha256'), 'hex'
  );
  decision_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'scopeId', trim(p_scope_id), 'stage', p_stage,
    'claimedMaturity', p_claimed_maturity, 'effectiveMaturity', p_effective_maturity,
    'accredited', p_accredited, 'evidenceFingerprint', evidence_fingerprint,
    'blockers', to_jsonb(coalesce(p_blockers, '{}'::text[])),
    'evaluatedAt', p_evaluated_at, 'validThrough', p_valid_through
  )::text, 'utf8'), 'sha256'), 'hex');

  select row.id into accreditation_id
  from private.platform_capability_accreditations row
  where row.decision_fingerprint = decision_fingerprint;
  if accreditation_id is not null then return accreditation_id; end if;

  insert into private.platform_capability_accreditations (
    scope_id, stage, claimed_maturity, effective_maturity, accredited, evidence,
    blockers, evidence_fingerprint, decision_fingerprint, evaluated_at,
    valid_through, recorded_by
  ) values (
    trim(p_scope_id), p_stage, p_claimed_maturity, p_effective_maturity, p_accredited,
    p_evidence, coalesce(p_blockers, '{}'::text[]), evidence_fingerprint,
    decision_fingerprint, p_evaluated_at, p_valid_through, p_recorded_by
  ) returning id into accreditation_id;
  return accreditation_id;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid_capability_accreditation' using errcode = '22023';
end;
$$;

revoke all on function private.record_platform_capability_accreditation_v1(
  text, text, text, text, boolean, jsonb, text[], timestamptz, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function private.record_platform_capability_accreditation_v1(
  text, text, text, text, boolean, jsonb, text[], timestamptz, timestamptz, uuid
) to service_role;

create function private.evaluate_operating_control_snapshot_v1(
  p_scope_id text,
  p_requested_use text,
  p_snapshot jsonb,
  p_binding jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  required_stage text := case p_requested_use
    when 'preliminary' then 'analyze'
    when 'internal_decision' then 'recommend'
    when 'external_material' then 'structure'
    when 'external_action' then 'external_release'
    else null end;
  accreditation private.platform_capability_accreditations;
  blockers text[] := '{}'::text[];
  warnings text[] := '{}'::text[];
  decision_fingerprint text;
  allowed boolean;
begin
  if required_stage is null
    or char_length(trim(coalesce(p_scope_id, ''))) not between 3 and 200
    or coalesce(jsonb_typeof(p_snapshot), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_binding), 'null') <> 'object'
    or not (
      p_snapshot ?& array[
        'snapshotAt','mandate','sources','calculations','coverage','judgment','artifacts',
        'market','security','authority','freshness','economics','outcome'
      ]
    ) then
    raise exception 'invalid_operating_control_snapshot' using errcode = '22023';
  end if;

  select row.* into accreditation
  from private.platform_capability_accreditations row
  where row.scope_id = trim(p_scope_id)
    and row.stage = required_stage
    and row.evaluated_at <= now()
    and row.valid_through >= now()
  order by row.created_at desc
  limit 1;

  if coalesce(p_snapshot #>> '{mandate,status}', '') <> 'satisfied'
    or coalesce((p_snapshot #>> '{mandate,objectiveCaptured}')::boolean, false) is not true
    or coalesce((p_snapshot #>> '{mandate,decisionContextCaptured}')::boolean, false) is not true then
    blockers := array_append(blockers, 'mandate_not_sufficiently_defined');
  end if;
  if coalesce(p_snapshot #>> '{sources,status}', '') <> 'satisfied'
    or coalesce((p_snapshot #>> '{sources,materialClaims}')::integer, 0)
      <> coalesce((p_snapshot #>> '{sources,sourceBoundMaterialClaims}')::integer, -1)
    or coalesce((p_snapshot #>> '{sources,materialClaims}')::integer, 0)
      <> coalesce((p_snapshot #>> '{sources,entityPeriodValidMaterialClaims}')::integer, -1)
    or coalesce((p_snapshot #>> '{sources,staleMaterialClaims}')::integer, -1) <> 0 then
    blockers := array_append(blockers, 'material_claims_not_fully_grounded');
  end if;
  if coalesce(p_snapshot #>> '{security,status}', '') <> 'satisfied'
    or coalesce((p_snapshot #>> '{security,retrievalBounded}')::boolean, false) is not true
    or coalesce((p_snapshot #>> '{security,tenantIsolationVerified}')::boolean, false) is not true
    or coalesce((p_snapshot #>> '{security,providerPolicyEnforced}')::boolean, false) is not true
    or coalesce((p_snapshot #>> '{security,externalToolsAllowlisted}')::boolean, false) is not true then
    blockers := array_append(blockers, 'security_boundary_not_verified');
  end if;
  if coalesce(p_snapshot #>> '{freshness,status}', '') <> 'satisfied'
    or coalesce((p_snapshot #>> '{freshness,transitiveInvalidationEnabled}')::boolean, false) is not true
    or coalesce((p_snapshot #>> '{freshness,staleDependents}')::integer, -1) <> 0 then
    blockers := array_append(blockers, 'stale_or_non_invalidated_state');
  end if;

  if p_requested_use <> 'preliminary' then
    if coalesce((p_snapshot #>> '{sources,materialClaims}')::integer, 0) = 0 then
      blockers := array_append(blockers, 'internal_decision_requires_material_claims');
    end if;
    if coalesce(p_snapshot #>> '{calculations,status}', '') <> 'satisfied'
      or coalesce((p_snapshot #>> '{calculations,criticalCalculations}')::integer, 0) <= 0
      or coalesce((p_snapshot #>> '{calculations,criticalCalculations}')::integer, 0)
        <> coalesce((p_snapshot #>> '{calculations,deterministicCalculations}')::integer, -1)
      or coalesce((p_snapshot #>> '{calculations,criticalCalculations}')::integer, 0)
        <> coalesce((p_snapshot #>> '{calculations,reconciledCalculations}')::integer, -1)
      or coalesce((p_snapshot #>> '{calculations,unresolvedExceptions}')::integer, -1) <> 0 then
      blockers := array_append(blockers, 'critical_math_not_deterministic_and_reconciled');
    end if;
    if coalesce(p_snapshot #>> '{coverage,status}', '') <> 'satisfied'
      or coalesce((p_snapshot #>> '{coverage,requiredItems}')::integer, 0) <= 0
      or coalesce((p_snapshot #>> '{coverage,requiredItems}')::integer, 0)
        <> coalesce((p_snapshot #>> '{coverage,coveredItems}')::integer, -1)
      or coalesce((p_snapshot #>> '{coverage,materialGaps}')::integer, 0)
        <> coalesce((p_snapshot #>> '{coverage,gapsWithReasonAndNextAction}')::integer, -1) then
      blockers := array_append(blockers, 'material_coverage_incomplete');
    end if;
    if coalesce(p_snapshot #>> '{judgment,status}', '') <> 'satisfied'
      or coalesce(p_snapshot #>> '{judgment,maturity}', '') <> 'internal_decision_valid'
      or coalesce((p_snapshot #>> '{judgment,uncertaintyDisclosed}')::boolean, false) is not true
      or coalesce((p_snapshot #>> '{judgment,alternativesCompared}')::boolean, false) is not true
      or coalesce((p_snapshot #>> '{judgment,downsideTested}')::boolean, false) is not true then
      blockers := array_append(blockers, 'judgment_not_valid_for_internal_decision');
    end if;
    if coalesce(p_snapshot #>> '{economics,status}', '') <> 'satisfied'
      or coalesce((p_snapshot #>> '{economics,costWithinBudget}')::boolean, false) is not true then
      blockers := array_append(blockers, 'case_cost_outside_approved_budget');
    end if;
  end if;

  if p_requested_use in ('external_material', 'external_action') then
    if coalesce(p_snapshot #>> '{artifacts,status}', '') <> 'satisfied'
      or coalesce((p_snapshot #>> '{artifacts,generatedArtifacts}')::integer, 0) <= 0
      or coalesce((p_snapshot #>> '{artifacts,generatedArtifacts}')::integer, 0)
        <> coalesce((p_snapshot #>> '{artifacts,consistentArtifacts}')::integer, -1)
      or coalesce((p_snapshot #>> '{artifacts,staleArtifacts}')::integer, -1) <> 0
      or coalesce((p_snapshot #>> '{artifacts,approvedForExternalUse}')::boolean, false) is not true then
      blockers := array_append(blockers, 'external_artifacts_not_consistent_current_and_approved');
    end if;
  end if;

  if p_requested_use = 'external_action' then
    if coalesce(p_snapshot #>> '{market,status}', '') <> 'satisfied'
      or coalesce((p_snapshot #>> '{market,applicable}')::boolean, false) is not true
      or coalesce((p_snapshot #>> '{market,currentMandates}')::boolean, false) is not true
      or coalesce((p_snapshot #>> '{market,explainableFit}')::boolean, false) is not true then
      blockers := array_append(blockers, 'market_fit_not_current_and_explainable');
    end if;
    if coalesce(p_snapshot #>> '{authority,status}', '') <> 'satisfied'
      or coalesce((p_snapshot #>> '{authority,externalActionRequested}')::boolean, false) is not true
      or coalesce((p_snapshot #>> '{authority,exactAuthorizationCaptured}')::boolean, false) is not true
      or coalesce(p_snapshot #>> '{authority,authorizedTargetsFingerprint}', '') !~ '^[a-f0-9]{64}$' then
      blockers := array_append(blockers, 'exact_external_authority_missing');
    end if;
    if coalesce(p_binding ->> 'caseFingerprint', '') !~ '^[a-f0-9]{64}$'
      or coalesce(p_binding ->> 'materialFingerprint', '') !~ '^[a-f0-9]{64}$'
      or coalesce(p_binding ->> 'matchScreenFingerprint', '') !~ '^[a-f0-9]{64}$'
      or coalesce(p_binding ->> 'authorizationFingerprint', '') !~ '^[a-f0-9]{64}$'
      or coalesce(p_binding ->> 'qualifiedIntroductionPlanId', '') = '' then
      blockers := array_append(blockers, 'external_action_binding_incomplete');
    end if;
  end if;

  if accreditation.id is null
    or not accreditation.accredited
    or accreditation.effective_maturity not in ('tested', 'production') then
    blockers := array_append(blockers, 'capability_not_accredited_for_' || required_stage);
  end if;
  if p_requested_use in ('external_material', 'external_action')
    and coalesce(accreditation.effective_maturity, 'unsupported') <> 'production' then
    blockers := array_append(blockers, 'external_use_requires_production_capability');
  end if;
  if coalesce((p_snapshot #>> '{economics,untrackedManualMinutes}')::numeric, 0) > 0 then
    warnings := array_append(warnings, 'untracked_manual_work_present');
  end if;
  if coalesce((p_snapshot #>> '{economics,repeatedManualRootCauses}')::integer, 0) > 0 then
    warnings := array_append(warnings, 'repeated_manual_root_causes_present');
  end if;
  if coalesce(p_snapshot #>> '{outcome,status}', '') <> 'not_applicable'
    and (coalesce((p_snapshot #>> '{outcome,decisionLinked}')::boolean, false) is not true
      or coalesce((p_snapshot #>> '{outcome,outcomeTaxonomyApplied}')::boolean, false) is not true) then
    warnings := array_append(warnings, 'outcome_learning_not_attributable');
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::text[])
  into blockers from unnest(blockers) value;
  select coalesce(array_agg(distinct value order by value), '{}'::text[])
  into warnings from unnest(warnings) value;
  allowed := cardinality(blockers) = 0;
  decision_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'scopeId', trim(p_scope_id), 'requestedUse', p_requested_use,
    'snapshot', p_snapshot, 'binding', p_binding,
    'capabilityDecisionFingerprint', accreditation.decision_fingerprint,
    'allowed', allowed, 'blockers', to_jsonb(blockers), 'warnings', to_jsonb(warnings)
  )::text, 'utf8'), 'sha256'), 'hex');
  return jsonb_build_object(
    'allowed', allowed, 'blockers', to_jsonb(blockers), 'warnings', to_jsonb(warnings),
    'capabilityAccreditationId', accreditation.id,
    'decisionFingerprint', decision_fingerprint
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid_operating_control_snapshot' using errcode = '22023';
end;
$$;

revoke all on function private.evaluate_operating_control_snapshot_v1(text, text, jsonb, jsonb)
  from public, anon, authenticated;

create function private.worker_record_operating_control_snapshot_v1(
  p_job_id uuid,
  p_capability_token text,
  p_scope_id text,
  p_requested_use text,
  p_input_fingerprint text,
  p_binding jsonb,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  frozen_input private.case_execution_inputs;
  execution_result private.case_execution_results;
  evaluation jsonb;
  snapshot_fingerprint text;
  snapshot_id uuid;
  existing public.operating_control_snapshots;
  valid_until timestamptz;
  snapshot_at timestamptz;
begin
  if job_row.kind <> 'case_analysis'
    or p_scope_id <> 'case-analysis:2026.08.29-v15'
    or p_input_fingerprint !~ '^[a-f0-9]{64}$'
    or p_requested_use <> 'internal_decision'
    or job_row.controlled_execution_id is null then
    raise exception 'operating_control_capability_scope_invalid' using errcode = '42501';
  end if;

  select row.* into frozen_input
  from private.case_execution_inputs row
  where row.organization_id = job_row.organization_id
    and row.execution_id = job_row.controlled_execution_id;
  select row.* into execution_result
  from private.case_execution_results row
  where row.organization_id = job_row.organization_id
    and row.execution_id = job_row.controlled_execution_id;
  if frozen_input.execution_id is null
    or execution_result.execution_id is null
    or frozen_input.input_fingerprint <> p_input_fingerprint
    or coalesce(p_binding ->> 'controlledExecutionFingerprint', '')
      <> coalesce(execution_result.report ->> 'reportFingerprint', '')
    or coalesce(p_binding ->> 'manifestFingerprint', '')
      <> coalesce(execution_result.manifest ->> 'manifestFingerprint', '') then
    raise exception 'operating_control_execution_binding_invalid' using errcode = '42501';
  end if;

  snapshot_at := (p_snapshot ->> 'snapshotAt')::timestamptz;
  if snapshot_at < now() - interval '10 minutes' or snapshot_at > now() + interval '1 minute' then
    raise exception 'operating_control_snapshot_time_invalid' using errcode = '22023';
  end if;

  evaluation := private.evaluate_operating_control_snapshot_v1(
    p_scope_id, p_requested_use, p_snapshot, p_binding
  );
  snapshot_fingerprint := encode(
    extensions.digest(convert_to(p_snapshot::text, 'utf8'), 'sha256'), 'hex'
  );
  valid_until := clock_timestamp() + case
    when p_requested_use in ('external_material', 'external_action') then interval '1 hour'
    else interval '24 hours' end;

  select row.* into existing
  from public.operating_control_snapshots row
  where row.organization_id = job_row.organization_id
    and row.processing_job_id = job_row.id
    and row.requested_use = p_requested_use
    and row.decision_fingerprint = evaluation ->> 'decisionFingerprint';
  if found then
    return jsonb_build_object(
      'id', existing.id, 'allowed', existing.allowed,
      'blockers', to_jsonb(existing.blockers), 'warnings', to_jsonb(existing.warnings),
      'decisionFingerprint', existing.decision_fingerprint, 'replayed', true
    );
  end if;

  insert into public.operating_control_snapshots (
    organization_id, intake_session_id, processing_job_id, requested_use, scope_id,
    schema_version, input_fingerprint, binding, snapshot, snapshot_fingerprint,
    capability_accreditation_id, allowed, blockers, warnings, decision_fingerprint, valid_until
  ) values (
    job_row.organization_id, job_row.intake_session_id, job_row.id, p_requested_use,
    trim(p_scope_id), 'operating-control-snapshot.v1', p_input_fingerprint,
    p_binding, p_snapshot, snapshot_fingerprint,
    nullif(evaluation ->> 'capabilityAccreditationId', '')::uuid,
    (evaluation ->> 'allowed')::boolean,
    array(select value from jsonb_array_elements_text(evaluation -> 'blockers')),
    array(select value from jsonb_array_elements_text(evaluation -> 'warnings')),
    evaluation ->> 'decisionFingerprint', valid_until
  ) returning id into snapshot_id;
  return evaluation || jsonb_build_object('id', snapshot_id, 'replayed', false);
exception
  when invalid_text_representation or datetime_field_overflow then
    raise exception 'invalid_operating_control_snapshot' using errcode = '22023';
end;
$$;

create function public.worker_record_operating_control_snapshot_v1(
  p_job_id uuid,
  p_capability_token text,
  p_scope_id text,
  p_requested_use text,
  p_input_fingerprint text,
  p_binding jsonb,
  p_snapshot jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_operating_control_snapshot_v1(
    p_job_id, p_capability_token, p_scope_id, p_requested_use,
    p_input_fingerprint, p_binding, p_snapshot
  );
$$;

revoke all on function private.worker_record_operating_control_snapshot_v1(
  uuid, text, text, text, text, jsonb, jsonb
) from public, anon;
revoke all on function public.worker_record_operating_control_snapshot_v1(
  uuid, text, text, text, text, jsonb, jsonb
) from public, anon;
grant execute on function private.worker_record_operating_control_snapshot_v1(
  uuid, text, text, text, text, jsonb, jsonb
) to authenticated;
grant execute on function public.worker_record_operating_control_snapshot_v1(
  uuid, text, text, text, text, jsonb, jsonb
) to authenticated;

create function private.append_dependency_invalidation_event_v1(
  p_organization_id uuid,
  p_session_id uuid,
  p_source_kind text,
  p_source_reference text,
  p_changed_roots jsonb,
  p_invalidated jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  graph_fingerprint text;
  result_fingerprint text;
  event_id uuid;
begin
  if p_source_kind not in ('source_document', 'case_input', 'deal_state', 'human_intervention')
    or char_length(trim(coalesce(p_source_reference, ''))) not between 3 and 300
    or coalesce(jsonb_typeof(p_changed_roots), 'null') <> 'array'
    or jsonb_array_length(p_changed_roots) not between 1 and 100
    or coalesce(jsonb_typeof(p_invalidated), 'null') <> 'array'
    or jsonb_array_length(p_invalidated) not between 1 and 500 then
    raise exception 'invalid_dependency_invalidation_event' using errcode = '22023';
  end if;
  graph_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'schemaVersion', 'offroad-dependency-graph.v1',
    'nodeKinds', jsonb_build_array('source','fact','calculation','claim','artifact','approval','lender_match')
  )::text, 'utf8'), 'sha256'), 'hex');
  result_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'organizationId', p_organization_id, 'intakeSessionId', p_session_id,
    'sourceKind', p_source_kind, 'sourceReference', trim(p_source_reference),
    'changedRoots', p_changed_roots, 'invalidated', p_invalidated,
    'graphFingerprint', graph_fingerprint
  )::text, 'utf8'), 'sha256'), 'hex');
  insert into public.dependency_invalidation_events (
    organization_id, intake_session_id, source_kind, source_reference,
    changed_roots, invalidated, graph_fingerprint, result_fingerprint
  ) values (
    p_organization_id, p_session_id, p_source_kind, trim(p_source_reference),
    p_changed_roots, p_invalidated, graph_fingerprint, result_fingerprint
  ) returning id into event_id;
  return event_id;
end;
$$;

revoke all on function private.append_dependency_invalidation_event_v1(
  uuid, uuid, text, text, jsonb, jsonb
) from public, anon, authenticated;

create function private.invalidate_controls_from_source_document_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.source_documents%rowtype;
begin
  if tg_op = 'DELETE' then
    target := old;
  else
    target := new;
  end if;
  if target.intake_session_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  perform private.append_dependency_invalidation_event_v1(
    target.organization_id, target.intake_session_id, 'source_document',
    target.id::text || ':v' || target.document_version::text,
    jsonb_build_array(jsonb_build_object(
      'nodeId', 'source:' || target.id::text, 'kind', 'source', 'direct', true
    )),
    jsonb_build_array(
      jsonb_build_object('nodeId','facts','kind','fact','direct',false),
      jsonb_build_object('nodeId','calculations','kind','calculation','direct',false),
      jsonb_build_object('nodeId','claims','kind','claim','direct',false),
      jsonb_build_object('nodeId','materials','kind','artifact','direct',false),
      jsonb_build_object('nodeId','approvals','kind','approval','direct',false),
      jsonb_build_object('nodeId','matching','kind','lender_match','direct',false)
    )
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger source_documents_operating_control_invalidation_insert
  after insert on public.source_documents
  for each row execute function private.invalidate_controls_from_source_document_v1();
create trigger source_documents_operating_control_invalidation_update
  after update of object_path, original_name, byte_size, sha256, document_version on public.source_documents
  for each row when (
    old.object_path is distinct from new.object_path
    or old.original_name is distinct from new.original_name
    or old.byte_size is distinct from new.byte_size
    or old.sha256 is distinct from new.sha256
    or old.document_version is distinct from new.document_version
  ) execute function private.invalidate_controls_from_source_document_v1();
create trigger source_documents_operating_control_invalidation_delete
  after delete on public.source_documents
  for each row execute function private.invalidate_controls_from_source_document_v1();
revoke all on function private.invalidate_controls_from_source_document_v1()
  from public, anon, authenticated;

create function private.invalidate_controls_from_case_input_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.append_dependency_invalidation_event_v1(
    new.organization_id, new.id, 'case_input', 'document_intake_session:' || new.id::text,
    jsonb_build_array(jsonb_build_object(
      'nodeId', 'case_input:' || new.id::text, 'kind', 'source', 'direct', true
    )),
    jsonb_build_array(
      jsonb_build_object('nodeId','facts','kind','fact','direct',false),
      jsonb_build_object('nodeId','calculations','kind','calculation','direct',false),
      jsonb_build_object('nodeId','claims','kind','claim','direct',false),
      jsonb_build_object('nodeId','materials','kind','artifact','direct',false),
      jsonb_build_object('nodeId','approvals','kind','approval','direct',false),
      jsonb_build_object('nodeId','matching','kind','lender_match','direct',false)
    )
  );
  return new;
end;
$$;

create trigger document_intake_sessions_operating_control_invalidation
  after update of company_profile, archetype, capital_objective, requested_amount,
    capital_currency, capital_urgency, requested_term_months, requested_grace_months,
    capital_consequence, sector, geography, instruments, collateral_kinds
  on public.document_intake_sessions
  for each row when (
    old.company_profile is distinct from new.company_profile
    or old.archetype is distinct from new.archetype
    or old.capital_objective is distinct from new.capital_objective
    or old.requested_amount is distinct from new.requested_amount
    or old.capital_currency is distinct from new.capital_currency
    or old.capital_urgency is distinct from new.capital_urgency
    or old.requested_term_months is distinct from new.requested_term_months
    or old.requested_grace_months is distinct from new.requested_grace_months
    or old.capital_consequence is distinct from new.capital_consequence
    or old.sector is distinct from new.sector
    or old.geography is distinct from new.geography
    or old.instruments is distinct from new.instruments
    or old.collateral_kinds is distinct from new.collateral_kinds
  ) execute function private.invalidate_controls_from_case_input_v1();
revoke all on function private.invalidate_controls_from_case_input_v1()
  from public, anon, authenticated;

create function private.invalidate_controls_from_deal_state_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invalidated jsonb;
begin
  invalidated := case new.object_type
    when 'understanding_snapshot' then jsonb_build_array(
      jsonb_build_object('nodeId','structure','kind','claim','direct',false),
      jsonb_build_object('nodeId','materials','kind','artifact','direct',false),
      jsonb_build_object('nodeId','approvals','kind','approval','direct',false),
      jsonb_build_object('nodeId','matching','kind','lender_match','direct',false))
    when 'structure_option' then jsonb_build_array(
      jsonb_build_object('nodeId','structure_decision','kind','claim','direct',false),
      jsonb_build_object('nodeId','materials','kind','artifact','direct',false),
      jsonb_build_object('nodeId','approvals','kind','approval','direct',false),
      jsonb_build_object('nodeId','matching','kind','lender_match','direct',false))
    when 'structure_decision' then jsonb_build_array(
      jsonb_build_object('nodeId','materials','kind','artifact','direct',false),
      jsonb_build_object('nodeId','approvals','kind','approval','direct',false),
      jsonb_build_object('nodeId','matching','kind','lender_match','direct',false))
    when 'production_plan' then jsonb_build_array(
      jsonb_build_object('nodeId','materials','kind','artifact','direct',false),
      jsonb_build_object('nodeId','approvals','kind','approval','direct',false),
      jsonb_build_object('nodeId','matching','kind','lender_match','direct',false))
    when 'material_artifact' then jsonb_build_array(
      jsonb_build_object('nodeId','package_review','kind','approval','direct',false),
      jsonb_build_object('nodeId','matching','kind','lender_match','direct',false))
    when 'package_review' then jsonb_build_array(
      jsonb_build_object('nodeId','matching','kind','lender_match','direct',false),
      jsonb_build_object('nodeId','release_authorization','kind','approval','direct',false))
    when 'match_screen' then jsonb_build_array(
      jsonb_build_object('nodeId','release_authorization','kind','approval','direct',false))
    else jsonb_build_array(
      jsonb_build_object('nodeId','external_action','kind','approval','direct',false))
    end;
  perform private.append_dependency_invalidation_event_v1(
    new.organization_id, new.intake_session_id, 'deal_state',
    new.object_type || ':' || new.object_fingerprint,
    jsonb_build_array(jsonb_build_object(
      'nodeId', new.object_type, 'kind',
      case when new.object_type in ('material_artifact') then 'artifact'
           when new.object_type in ('package_review','release_authorization') then 'approval'
           when new.object_type = 'match_screen' then 'lender_match'
           else 'claim' end,
      'direct', true
    )),
    invalidated
  );
  return new;
end;
$$;

create trigger deal_state_objects_operating_control_invalidation
  after insert on public.deal_state_objects
  for each row execute function private.invalidate_controls_from_deal_state_v1();
revoke all on function private.invalidate_controls_from_deal_state_v1()
  from public, anon, authenticated;

create function private.record_human_intervention_v1(
  p_organization_id uuid,
  p_session_id uuid,
  p_task_id text,
  p_cause text,
  p_minutes numeric,
  p_captured boolean,
  p_changed_canonical_state boolean,
  p_reviewed boolean,
  p_review_reference text,
  p_recorded_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare intervention_id uuid;
begin
  if not exists (
    select 1 from public.document_intake_sessions session
    where session.organization_id = p_organization_id and session.id = p_session_id
  ) or not exists (select 1 from auth.users where id = p_recorded_by) then
    raise exception 'human_intervention_scope_invalid' using errcode = '22023';
  end if;
  insert into private.human_intervention_ledger (
    organization_id, intake_session_id, task_id, cause, minutes, captured,
    changed_canonical_state, reviewed, review_reference, recorded_by
  ) values (
    p_organization_id, p_session_id, trim(p_task_id), p_cause, p_minutes, p_captured,
    p_changed_canonical_state, p_reviewed, nullif(trim(coalesce(p_review_reference, '')), ''),
    p_recorded_by
  ) returning id into intervention_id;
  if p_changed_canonical_state then
    perform private.append_dependency_invalidation_event_v1(
      p_organization_id, p_session_id, 'human_intervention', intervention_id::text,
      jsonb_build_array(jsonb_build_object(
        'nodeId','human:' || intervention_id::text,'kind','source','direct',true
      )),
      jsonb_build_array(
        jsonb_build_object('nodeId','claims','kind','claim','direct',false),
        jsonb_build_object('nodeId','materials','kind','artifact','direct',false),
        jsonb_build_object('nodeId','approvals','kind','approval','direct',false),
        jsonb_build_object('nodeId','matching','kind','lender_match','direct',false)
      )
    );
  end if;
  return intervention_id;
end;
$$;

revoke all on function private.record_human_intervention_v1(
  uuid, uuid, text, text, numeric, boolean, boolean, boolean, text, uuid
) from public, anon, authenticated;
grant execute on function private.record_human_intervention_v1(
  uuid, uuid, text, text, numeric, boolean, boolean, boolean, text, uuid
) to service_role;

create function private.enforce_external_material_operating_controls_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.object_type <> 'package_review'
    or new.status <> 'approved'
    or new.payload #>> '{approval,scope}' <> 'external_material_package' then
    return new;
  end if;
  if not exists (
    select 1
    from public.operating_control_snapshots control
    join private.platform_capability_accreditations accreditation
      on accreditation.id = control.capability_accreditation_id
    where control.organization_id = new.organization_id
      and control.intake_session_id = new.intake_session_id
      and control.requested_use = 'external_material'
      and control.allowed
      and control.valid_until >= now()
      and control.binding ->> 'materialArtifactFingerprint' = new.payload #>> '{approval,artifactFingerprint}'
      and accreditation.accredited
      and accreditation.stage = 'structure'
      and accreditation.effective_maturity = 'production'
      and accreditation.valid_through >= now()
      and not exists (
        select 1 from private.platform_capability_accreditations newer
        where newer.scope_id = accreditation.scope_id and newer.stage = accreditation.stage
          and newer.created_at > accreditation.created_at
      )
      and not exists (
        select 1 from public.dependency_invalidation_events event
        where event.organization_id = control.organization_id
          and event.intake_session_id = control.intake_session_id
          and event.occurred_at > control.created_at
      )
  ) then
    raise exception 'current_external_material_operating_controls_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger deal_state_external_material_operating_controls
  before insert on public.deal_state_objects
  for each row execute function private.enforce_external_material_operating_controls_v1();
revoke all on function private.enforce_external_material_operating_controls_v1()
  from public, anon, authenticated;

create function private.enforce_qualified_introduction_operating_controls_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  plan public.qualified_introduction_plans;
  authorization_fingerprint text;
begin
  select row.* into plan
  from public.qualified_introduction_plans row
  where row.organization_id = new.organization_id and row.id = new.plan_id;
  authorization_fingerprint := encode(
    extensions.digest(convert_to(coalesce(plan.authorization_snapshot, '{}'::jsonb)::text, 'utf8'), 'sha256'),
    'hex'
  );
  if plan.id is null or not exists (
    select 1
    from public.operating_control_snapshots control
    join private.platform_capability_accreditations accreditation
      on accreditation.id = control.capability_accreditation_id
    where control.organization_id = new.organization_id
      and control.intake_session_id = new.intake_session_id
      and control.requested_use = 'external_action'
      and control.allowed
      and control.valid_until >= now()
      and control.binding ->> 'caseFingerprint' = new.case_fingerprint
      and control.binding ->> 'materialFingerprint' = new.material_fingerprint
      and control.binding ->> 'matchScreenFingerprint' = plan.match_screen_fingerprint
      and control.binding ->> 'qualifiedIntroductionPlanId' = plan.id::text
      and control.binding ->> 'authorizationFingerprint' = authorization_fingerprint
      and control.snapshot #>> '{authority,authorizedTargetsFingerprint}' = authorization_fingerprint
      and accreditation.accredited
      and accreditation.stage = 'external_release'
      and accreditation.effective_maturity = 'production'
      and accreditation.valid_through >= now()
      and not exists (
        select 1 from private.platform_capability_accreditations newer
        where newer.scope_id = accreditation.scope_id and newer.stage = accreditation.stage
          and newer.created_at > accreditation.created_at
      )
      and not exists (
        select 1 from public.dependency_invalidation_events event
        where event.organization_id = control.organization_id
          and event.intake_session_id = control.intake_session_id
          and event.occurred_at > control.created_at
      )
      and not exists (
        select 1 from private.human_intervention_ledger intervention
        where intervention.organization_id = control.organization_id
          and intervention.intake_session_id = control.intake_session_id
          and intervention.occurred_at > control.created_at
          and intervention.changed_canonical_state
          and not intervention.reviewed
      )
  ) then
    raise exception 'current_external_action_operating_controls_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger qualified_introductions_operating_controls_gate
  before insert on public.qualified_introductions
  for each row execute function private.enforce_qualified_introduction_operating_controls_v1();
revoke all on function private.enforce_qualified_introduction_operating_controls_v1()
  from public, anon, authenticated;

comment on table public.operating_control_snapshots is
  'Immutable, capability-written decisions for a narrow use. External use requires production accreditation and exact current bindings.';
comment on table public.dependency_invalidation_events is
  'Append-only evidence that a source, case input, governed decision or human intervention invalidated downstream state.';
comment on table private.platform_capability_accreditations is
  'Platform-only accreditation ledger. Production requires controlled real-case evidence and cannot be asserted by a tenant or worker.';
comment on table private.human_intervention_ledger is
  'Platform-only record of manual work used to expose hidden service labour and invalidate changed canonical state.';
