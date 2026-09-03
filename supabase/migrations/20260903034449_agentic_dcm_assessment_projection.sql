-- Persist the analytical result as project memory: evidence coverage, at most three active
-- information requests and append-only directional decisions. The worker remains capability
-- bound to one processing job, organization, intake session and capital project.

alter table public.capital_project_decisions
  add column if not exists assessment_ref text
  check (assessment_ref is null or char_length(trim(assessment_ref)) between 1 and 300);

create unique index if not exists capital_project_decisions_assessment_ref_idx
  on public.capital_project_decisions (
    organization_id, capital_project_id, decision_key, assessment_ref
  )
  where assessment_ref is not null;

create or replace function private.worker_record_agent_assessment_v1(
  p_job_id uuid,
  p_capability_token text,
  p_assessment jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  active_plan public.capital_project_agent_plans;
  coverage_item jsonb;
  request_item jsonb;
  decision_item jsonb;
  prior_decision public.capital_project_decisions;
  open_request public.capital_project_information_requests;
  coverage_keys text[];
  request_keys text[];
  decision_keys text[];
  assessment_reference text;
  coverage_count integer := 0;
  request_count integer := 0;
  decision_count integer := 0;
begin
  if job_row.kind not in ('preliminary_analysis', 'case_analysis', 'capital_project_analysis')
    or coalesce(jsonb_typeof(p_assessment), 'null') <> 'object'
    or p_assessment ->> 'schemaVersion' <> 'dcm-agent-assessment.v1'
    or coalesce(jsonb_typeof(p_assessment -> 'coverage'), 'null') <> 'array'
    or coalesce(jsonb_typeof(p_assessment -> 'requests'), 'null') <> 'array'
    or coalesce(jsonb_typeof(p_assessment -> 'decisions'), 'null') <> 'array'
    or jsonb_array_length(p_assessment -> 'coverage') > 200
    or jsonb_array_length(p_assessment -> 'requests') > 3
    or jsonb_array_length(p_assessment -> 'decisions') > 30 then
    raise exception 'agent_assessment_invalid' using errcode = '22023';
  end if;

  assessment_reference := nullif(trim(p_assessment ->> 'assessmentRef'), '');
  if assessment_reference is null or char_length(assessment_reference) > 300 then
    raise exception 'agent_assessment_ref_invalid' using errcode = '22023';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.capital_project_id is not null;
  if not found then
    raise exception 'agent_assessment_project_not_available' using errcode = 'P0002';
  end if;
  if p_assessment ->> 'projectId' <> session_row.capital_project_id::text then
    raise exception 'agent_assessment_project_mismatch' using errcode = '42501';
  end if;

  select plan.* into active_plan
  from public.capital_project_agent_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.capital_project_id = session_row.capital_project_id
    and plan.status = 'active'
  order by plan.revision desc
  limit 1
  for update;
  if not found then
    raise exception 'agent_assessment_plan_not_available' using errcode = 'P0002';
  end if;

  select array_agg(value ->> 'requirementKey' order by value ->> 'requirementKey')
  into coverage_keys
  from jsonb_array_elements(p_assessment -> 'coverage') value;
  select array_agg(value ->> 'requirementKey' order by value ->> 'requirementKey')
  into request_keys
  from jsonb_array_elements(p_assessment -> 'requests') value;
  select array_agg(value ->> 'decisionKey' order by value ->> 'decisionKey')
  into decision_keys
  from jsonb_array_elements(p_assessment -> 'decisions') value;

  if cardinality(coalesce(coverage_keys, '{}'::text[]))
      <> cardinality(array(select distinct unnest(coalesce(coverage_keys, '{}'::text[]))))
    or cardinality(coalesce(request_keys, '{}'::text[]))
      <> cardinality(array(select distinct unnest(coalesce(request_keys, '{}'::text[]))))
    or cardinality(coalesce(decision_keys, '{}'::text[]))
      <> cardinality(array(select distinct unnest(coalesce(decision_keys, '{}'::text[])))) then
    raise exception 'agent_assessment_duplicate_key' using errcode = '22023';
  end if;

  for coverage_item in
    select value from jsonb_array_elements(p_assessment -> 'coverage') value
  loop
    if coverage_item ->> 'projectId' <> session_row.capital_project_id::text
      or coverage_item ->> 'schemaVersion' <> 'dcm-requirement-coverage.v1'
      or coalesce(coverage_item ->> 'requirementKey', '') !~ '^[a-z0-9_.-]{3,120}$'
      or coverage_item ->> 'status' not in (
        'missing', 'candidate', 'partial', 'verified', 'conflicting', 'unavailable', 'not_applicable'
      )
      or coverage_item ->> 'materiality' not in ('blocking', 'high', 'medium', 'low')
      or coverage_item ->> 'assessedBy' not in (
        'deal_captain', 'context_intelligence', 'document_intelligence', 'company_and_sector',
        'financial_analysis', 'debt_and_capital_structure', 'transaction_structuring',
        'market_intelligence', 'materials', 'independent_verifier'
      )
      or coalesce(jsonb_typeof(coverage_item -> 'decisionIds'), 'null') <> 'array'
      or coalesce(jsonb_typeof(coverage_item -> 'evidence'), 'null') <> 'array'
      or (coverage_item ->> 'status' = 'verified' and jsonb_array_length(coverage_item -> 'evidence') = 0)
      or (coverage_item ->> 'status' = 'missing' and nullif(trim(coverage_item ->> 'missingReason'), '') is null) then
      raise exception 'agent_requirement_coverage_invalid' using errcode = '22023';
    end if;

    insert into public.capital_project_requirement_coverage (
      id, organization_id, capital_project_id, requirement_key, label, status,
      materiality, decision_ids, evidence, missing_reason, assessed_by, assessed_at
    ) values (
      (coverage_item ->> 'id')::uuid, job_row.organization_id, session_row.capital_project_id,
      coverage_item ->> 'requirementKey', coverage_item ->> 'label', coverage_item ->> 'status',
      coverage_item ->> 'materiality',
      array(select value::text::uuid from jsonb_array_elements_text(coverage_item -> 'decisionIds') value),
      coverage_item -> 'evidence', nullif(trim(coverage_item ->> 'missingReason'), ''),
      coverage_item ->> 'assessedBy', (coverage_item ->> 'assessedAt')::timestamptz
    )
    on conflict (organization_id, capital_project_id, requirement_key) do update
    set label = excluded.label,
        status = excluded.status,
        materiality = excluded.materiality,
        decision_ids = excluded.decision_ids,
        evidence = excluded.evidence,
        missing_reason = excluded.missing_reason,
        assessed_by = excluded.assessed_by,
        assessed_at = excluded.assessed_at;
    coverage_count := coverage_count + 1;
  end loop;

  update public.capital_project_information_requests request
  set status = 'superseded'
  where request.organization_id = job_row.organization_id
    and request.capital_project_id = session_row.capital_project_id
    and request.status = 'open'
    and not (request.requirement_key = any(coalesce(request_keys, '{}'::text[])));

  for request_item in
    select value from jsonb_array_elements(p_assessment -> 'requests') value
  loop
    if request_item ->> 'projectId' <> session_row.capital_project_id::text
      or request_item ->> 'schemaVersion' <> 'dcm-information-request.v1'
      or request_item ->> 'status' <> 'open'
      or coalesce(request_item ->> 'requirementKey', '') !~ '^[a-z0-9_.-]{3,120}$'
      or request_item ->> 'answerKind' not in ('text', 'number', 'date', 'choice', 'document', 'confirmation')
      or request_item ->> 'priority' not in ('blocking', 'high_value', 'later')
      or coalesce(jsonb_typeof(request_item -> 'acceptableEvidence'), 'null') <> 'array'
      or jsonb_array_length(request_item -> 'acceptableEvidence') not between 1 and 12
      or coalesce(jsonb_typeof(request_item -> 'choices'), 'null') <> 'array' then
      raise exception 'agent_information_request_invalid' using errcode = '22023';
    end if;

    select request.* into open_request
    from public.capital_project_information_requests request
    where request.organization_id = job_row.organization_id
      and request.capital_project_id = session_row.capital_project_id
      and request.requirement_key = request_item ->> 'requirementKey'
      and request.status = 'open'
    limit 1
    for update;

    if found then
      update public.capital_project_information_requests request
      set question = request_item ->> 'question',
          why_it_matters = request_item ->> 'whyItMatters',
          decision_impact = request_item ->> 'decisionImpact',
          acceptable_evidence = array(select value::text from jsonb_array_elements_text(request_item -> 'acceptableEvidence') value),
          answer_kind = request_item ->> 'answerKind',
          choices = array(select value::text from jsonb_array_elements_text(request_item -> 'choices') value),
          priority = request_item ->> 'priority',
          information_gain = (request_item ->> 'informationGain')::numeric,
          materiality = (request_item ->> 'materiality')::numeric,
          answerability = (request_item ->> 'answerability')::numeric,
          redundancy_penalty = (request_item ->> 'redundancyPenalty')::numeric
      where request.organization_id = job_row.organization_id
        and request.id = open_request.id;
    else
      insert into public.capital_project_information_requests (
        id, organization_id, capital_project_id, requirement_key, question,
        why_it_matters, decision_impact, acceptable_evidence, answer_kind, choices,
        priority, information_gain, materiality, answerability, redundancy_penalty, status
      ) values (
        (request_item ->> 'id')::uuid, job_row.organization_id, session_row.capital_project_id,
        request_item ->> 'requirementKey', request_item ->> 'question',
        request_item ->> 'whyItMatters', request_item ->> 'decisionImpact',
        array(select value::text from jsonb_array_elements_text(request_item -> 'acceptableEvidence') value),
        request_item ->> 'answerKind',
        array(select value::text from jsonb_array_elements_text(request_item -> 'choices') value),
        request_item ->> 'priority', (request_item ->> 'informationGain')::numeric,
        (request_item ->> 'materiality')::numeric, (request_item ->> 'answerability')::numeric,
        (request_item ->> 'redundancyPenalty')::numeric, 'open'
      );
    end if;
    request_count := request_count + 1;
  end loop;

  for decision_item in
    select value from jsonb_array_elements(p_assessment -> 'decisions') value
  loop
    if decision_item ->> 'projectId' <> session_row.capital_project_id::text
      or decision_item ->> 'schemaVersion' <> 'dcm-decision.v1'
      or decision_item ->> 'status' not in ('open', 'directional')
      or coalesce(decision_item ->> 'decisionKey', '') !~ '^[a-z0-9_.-]{3,120}$'
      or coalesce(decision_item ->> 'fingerprint', '') !~ '^[0-9a-f]{64}$'
      or coalesce(jsonb_typeof(decision_item -> 'alternatives'), 'null') <> 'array'
      or coalesce(jsonb_typeof(decision_item -> 'evidence'), 'null') <> 'array'
      or coalesce(jsonb_typeof(decision_item -> 'assumptions'), 'null') <> 'array'
      or coalesce(jsonb_typeof(decision_item -> 'unresolved'), 'null') <> 'array'
      or (decision_item ->> 'status' <> 'open' and nullif(trim(decision_item ->> 'recommendation'), '') is null)
      or (decision_item ->> 'confidence' = 'high' and jsonb_array_length(decision_item -> 'evidence') = 0) then
      raise exception 'agent_decision_invalid' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.capital_project_decisions decision
      where decision.organization_id = job_row.organization_id
        and decision.capital_project_id = session_row.capital_project_id
        and decision.decision_key = decision_item ->> 'decisionKey'
        and decision.assessment_ref = assessment_reference
    ) then
      continue;
    end if;

    select decision.* into prior_decision
    from public.capital_project_decisions decision
    where decision.organization_id = job_row.organization_id
      and decision.capital_project_id = session_row.capital_project_id
      and decision.decision_key = decision_item ->> 'decisionKey'
    order by decision.revision desc
    limit 1
    for update;

    -- Automated work never overwrites a decision already confirmed or rejected by a person.
    if found and prior_decision.status in ('confirmed', 'rejected') then
      continue;
    end if;
    if found then
      update public.capital_project_decisions decision
      set status = 'superseded'
      where decision.organization_id = job_row.organization_id
        and decision.id = prior_decision.id;
    end if;

    insert into public.capital_project_decisions (
      id, organization_id, capital_project_id, decision_key, revision, status,
      question, recommendation, alternatives, rationale_summary, evidence,
      assumptions, unresolved, confidence, proposed_by, reviewed_by,
      supersedes_decision_id, schema_version, decision_fingerprint, assessment_ref,
      created_by, created_at
    ) values (
      (decision_item ->> 'id')::uuid, job_row.organization_id, session_row.capital_project_id,
      decision_item ->> 'decisionKey', coalesce(prior_decision.revision, 0) + 1,
      decision_item ->> 'status', decision_item ->> 'question',
      nullif(trim(decision_item ->> 'recommendation'), ''), decision_item -> 'alternatives',
      decision_item ->> 'rationaleSummary', decision_item -> 'evidence',
      decision_item -> 'assumptions', decision_item -> 'unresolved',
      decision_item ->> 'confidence', decision_item ->> 'proposedBy', null,
      prior_decision.id, decision_item ->> 'schemaVersion', decision_item ->> 'fingerprint',
      assessment_reference, session_row.started_by, (decision_item ->> 'createdAt')::timestamptz
    );
    decision_count := decision_count + 1;
  end loop;

  if coverage_count > 0 and not exists (
    select 1 from public.capital_project_agent_events event
    where event.organization_id = job_row.organization_id
      and event.capital_project_id = session_row.capital_project_id
      and event.event_type = 'requirement_assessed'
      and event.detail ->> 'assessment_ref' = assessment_reference
  ) then
    insert into public.capital_project_agent_events (
      organization_id, capital_project_id, agent_plan_id, event_type,
      summary_pt, summary_en, detail
    ) values (
      job_row.organization_id, session_row.capital_project_id, active_plan.id,
      'requirement_assessed',
      'As informações recebidas foram cruzadas com os requisitos da análise.',
      'The received information was checked against the analysis requirements.',
      jsonb_build_object('assessment_ref', assessment_reference, 'coverage_count', coverage_count)
    );
  end if;

  if request_count > 0 and not exists (
    select 1 from public.capital_project_agent_events event
    where event.organization_id = job_row.organization_id
      and event.capital_project_id = session_row.capital_project_id
      and event.event_type = 'question_created'
      and event.detail ->> 'assessment_ref' = assessment_reference
  ) then
    insert into public.capital_project_agent_events (
      organization_id, capital_project_id, agent_plan_id, event_type,
      summary_pt, summary_en, detail
    ) values (
      job_row.organization_id, session_row.capital_project_id, active_plan.id,
      'question_created',
      'Priorizei os pontos que mais alteram a próxima decisão.',
      'I prioritized the points that most affect the next decision.',
      jsonb_build_object('assessment_ref', assessment_reference, 'request_count', request_count)
    );
  end if;

  if decision_count > 0 and not exists (
    select 1 from public.capital_project_agent_events event
    where event.organization_id = job_row.organization_id
      and event.capital_project_id = session_row.capital_project_id
      and event.event_type = 'decision_recorded'
      and event.detail ->> 'assessment_ref' = assessment_reference
  ) then
    insert into public.capital_project_agent_events (
      organization_id, capital_project_id, agent_plan_id, event_type,
      summary_pt, summary_en, detail
    ) values (
      job_row.organization_id, session_row.capital_project_id, active_plan.id,
      'decision_recorded',
      'A recomendação e suas premissas foram registradas para revisão.',
      'The recommendation and its assumptions were recorded for review.',
      jsonb_build_object('assessment_ref', assessment_reference, 'decision_count', decision_count)
    );
  end if;

  return jsonb_build_object(
    'agent_plan_id', active_plan.id,
    'coverage_count', coverage_count,
    'request_count', request_count,
    'decision_count', decision_count
  );
end;
$$;

create or replace function public.worker_record_agent_assessment_v1(
  p_job_id uuid,
  p_capability_token text,
  p_assessment jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_agent_assessment_v1(p_job_id, p_capability_token, p_assessment);
$$;

revoke all on function private.worker_record_agent_assessment_v1(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.worker_record_agent_assessment_v1(uuid, text, jsonb)
  from public, anon;
grant execute on function private.worker_record_agent_assessment_v1(uuid, text, jsonb)
  to authenticated;
grant execute on function public.worker_record_agent_assessment_v1(uuid, text, jsonb)
  to authenticated;

comment on function public.worker_record_agent_assessment_v1(uuid, text, jsonb) is
  'Capability-bound projection of evidence coverage, prioritized questions and directional decisions into one capital project.';
