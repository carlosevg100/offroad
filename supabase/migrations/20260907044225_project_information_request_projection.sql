-- Project-level information requests are first-class workflow objects. They do not depend on an
-- agent-plan row: a compiled capital-project workflow can discover a material ambiguity and ask
-- the person directly. The capability-bound worker may only project questions for its own job,
-- organization and project, and an answered/waived question is never silently reopened.

alter table public.capital_project_information_requests
  add column if not exists source_namespace text not null default 'agent_assessment'
  check (source_namespace ~ '^[a-z0-9_.-]{3,80}$');

create index if not exists capital_project_information_requests_source_idx
  on public.capital_project_information_requests (
    organization_id, capital_project_id, source_namespace, status, information_gain desc
  );

create unique index if not exists capital_project_agent_events_projection_ref_idx
  on public.capital_project_agent_events (
    organization_id, capital_project_id, event_type, (detail ->> 'projection_ref')
  )
  where event_type = 'question_created' and detail ->> 'projection_ref' is not null;

create or replace function private.worker_sync_project_information_requests_v1(
  p_job_id uuid,
  p_capability_token text,
  p_projection jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  active_plan_id uuid;
  request_item jsonb;
  prior_request public.capital_project_information_requests;
  request_keys text[];
  projection_namespace text;
  projection_reference text;
  open_count integer := 0;
  preserved_closed_count integer := 0;
  superseded_count integer := 0;
begin
  if job_row.kind <> 'capital_project_analysis'
    or coalesce(jsonb_typeof(p_projection), 'null') <> 'object'
    or p_projection ->> 'schemaVersion' <> 'project-information-request-projection.v1'
    or coalesce(jsonb_typeof(p_projection -> 'requests'), 'null') <> 'array'
    or jsonb_array_length(p_projection -> 'requests') > 3 then
    raise exception 'information_request_projection_invalid' using errcode = '22023';
  end if;

  projection_namespace := nullif(trim(p_projection ->> 'sourceNamespace'), '');
  projection_reference := nullif(trim(p_projection ->> 'projectionRef'), '');
  if projection_namespace is null or projection_namespace !~ '^[a-z0-9_.-]{3,80}$'
    or projection_reference is null or char_length(projection_reference) > 300 then
    raise exception 'information_request_projection_identity_invalid' using errcode = '22023';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.capital_project_id is not null;
  if not found then
    raise exception 'information_request_projection_project_not_available' using errcode = 'P0002';
  end if;
  if p_projection ->> 'projectId' <> session_row.capital_project_id::text then
    raise exception 'information_request_projection_project_mismatch' using errcode = '42501';
  end if;

  -- The browser answer command locks project then request. Use the same order here so a workflow
  -- projection and a person's answer cannot race into a duplicate open question or deadlock.
  perform 1
  from public.capital_projects project
  where project.organization_id = job_row.organization_id
    and project.id = session_row.capital_project_id
  for update;

  select array_agg(value ->> 'requirementKey' order by value ->> 'requirementKey')
  into request_keys
  from jsonb_array_elements(p_projection -> 'requests') value;
  if cardinality(coalesce(request_keys, '{}'::text[]))
      <> cardinality(array(select distinct unnest(coalesce(request_keys, '{}'::text[])))) then
    raise exception 'information_request_projection_duplicate_key' using errcode = '22023';
  end if;

  -- Only this producer's prior open questions can be superseded. Questions from a credit pack or
  -- another workflow remain untouched.
  with superseded as (
    update public.capital_project_information_requests request
    set status = 'superseded'
    where request.organization_id = job_row.organization_id
      and request.capital_project_id = session_row.capital_project_id
      and request.source_namespace = projection_namespace
      and request.status = 'open'
      and not (request.requirement_key = any(coalesce(request_keys, '{}'::text[])))
    returning 1
  ) select count(*) into superseded_count from superseded;

  for request_item in
    select value
    from jsonb_array_elements(p_projection -> 'requests') value
    order by value ->> 'requirementKey'
  loop
    if request_item ->> 'projectId' <> session_row.capital_project_id::text
      or request_item ->> 'schemaVersion' <> 'dcm-information-request.v1'
      or request_item ->> 'status' <> 'open'
      or coalesce(request_item ->> 'requirementKey', '') !~ '^[a-z0-9_.-]{3,120}$'
      or char_length(trim(coalesce(request_item ->> 'question', ''))) not between 5 and 1000
      or char_length(trim(coalesce(request_item ->> 'whyItMatters', ''))) not between 5 and 1000
      or char_length(trim(coalesce(request_item ->> 'decisionImpact', ''))) not between 5 and 1000
      or request_item ->> 'answerKind' not in ('text', 'number', 'date', 'choice', 'document', 'confirmation')
      or request_item ->> 'priority' not in ('blocking', 'high_value', 'later')
      or coalesce(jsonb_typeof(request_item -> 'acceptableEvidence'), 'null') <> 'array'
      or jsonb_array_length(request_item -> 'acceptableEvidence') not between 1 and 12
      or coalesce(jsonb_typeof(request_item -> 'choices'), 'null') <> 'array'
      or jsonb_array_length(request_item -> 'choices') > 12
      or (request_item ->> 'answerKind' = 'choice' and jsonb_array_length(request_item -> 'choices') < 2)
      or (request_item ->> 'informationGain')::numeric not between 0 and 1
      or (request_item ->> 'materiality')::numeric not between 0 and 1
      or (request_item ->> 'answerability')::numeric not between 0 and 1
      or (request_item ->> 'redundancyPenalty')::numeric not between 0 and 1 then
      raise exception 'project_information_request_invalid' using errcode = '22023';
    end if;

    -- A person's answer is durable project context. A later run may update an open question, but
    -- may not recreate one already answered or explicitly waived under the same stable key.
    select request.* into prior_request
    from public.capital_project_information_requests request
    where request.organization_id = job_row.organization_id
      and request.capital_project_id = session_row.capital_project_id
      and request.requirement_key = request_item ->> 'requirementKey'
    order by request.created_at desc, request.id desc
    limit 1
    for update;

    if found and prior_request.status in ('answered', 'waived') then
      preserved_closed_count := preserved_closed_count + 1;
      continue;
    end if;

    if found and prior_request.status = 'open' then
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
          redundancy_penalty = (request_item ->> 'redundancyPenalty')::numeric,
          source_namespace = projection_namespace
      where request.organization_id = job_row.organization_id
        and request.id = prior_request.id;
    else
      insert into public.capital_project_information_requests (
        id, organization_id, capital_project_id, requirement_key, question,
        why_it_matters, decision_impact, acceptable_evidence, answer_kind, choices,
        priority, information_gain, materiality, answerability, redundancy_penalty,
        status, source_namespace
      ) values (
        (request_item ->> 'id')::uuid, job_row.organization_id, session_row.capital_project_id,
        request_item ->> 'requirementKey', request_item ->> 'question',
        request_item ->> 'whyItMatters', request_item ->> 'decisionImpact',
        array(select value::text from jsonb_array_elements_text(request_item -> 'acceptableEvidence') value),
        request_item ->> 'answerKind',
        array(select value::text from jsonb_array_elements_text(request_item -> 'choices') value),
        request_item ->> 'priority', (request_item ->> 'informationGain')::numeric,
        (request_item ->> 'materiality')::numeric, (request_item ->> 'answerability')::numeric,
        (request_item ->> 'redundancyPenalty')::numeric, 'open', projection_namespace
      );
    end if;
    open_count := open_count + 1;
  end loop;

  select plan.id into active_plan_id
  from public.capital_project_agent_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.capital_project_id = session_row.capital_project_id
    and plan.status = 'active'
  order by plan.revision desc
  limit 1;

  if open_count > 0 then
    insert into public.capital_project_agent_events (
      organization_id, capital_project_id, agent_plan_id, event_type,
      summary_pt, summary_en, detail
    ) values (
      job_row.organization_id, session_row.capital_project_id, active_plan_id,
      'question_created',
      'Separei a pergunta que mais pode alterar o próximo passo.',
      'I surfaced the question most likely to change the next step.',
      jsonb_build_object(
        'projection_ref', projection_reference,
        'source_namespace', projection_namespace,
        'open_count', open_count,
        'preserved_closed_count', preserved_closed_count
      )
    )
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'open_count', open_count,
    'preserved_closed_count', preserved_closed_count,
    'superseded_count', superseded_count
  );
end;
$$;

create or replace function public.worker_sync_project_information_requests_v1(
  p_job_id uuid,
  p_capability_token text,
  p_projection jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_sync_project_information_requests_v1(
    p_job_id, p_capability_token, p_projection
  );
$$;

revoke all on function private.worker_sync_project_information_requests_v1(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.worker_sync_project_information_requests_v1(uuid, text, jsonb)
  from public, anon;
grant execute on function private.worker_sync_project_information_requests_v1(uuid, text, jsonb)
  to authenticated;
grant execute on function public.worker_sync_project_information_requests_v1(uuid, text, jsonb)
  to authenticated;

comment on function public.worker_sync_project_information_requests_v1(uuid, text, jsonb) is
  'Capability-bound projection of a capital-project workflow''s prioritized questions; preserves answered and waived context.';
