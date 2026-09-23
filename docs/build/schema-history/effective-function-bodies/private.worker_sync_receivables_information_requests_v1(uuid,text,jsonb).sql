CREATE OR REPLACE FUNCTION private.worker_sync_receivables_information_requests_v1(p_job_id uuid, p_capability_token text, p_projection jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  request_item jsonb;
  prior_request public.capital_project_information_requests;
  request_keys text[];
  projection_namespace text := nullif(trim(p_projection ->> 'sourceNamespace'), '');
  projection_reference text := nullif(trim(p_projection ->> 'projectionRef'), '');
  open_count integer := 0;
  preserved_closed_count integer := 0;
  superseded_count integer := 0;
  binding_result jsonb := '{}'::jsonb;
begin
  if job_row.kind not in ('case_analysis','agent_operation_brief')
    or jsonb_typeof(p_projection) <> 'object'
    or p_projection ->> 'schemaVersion' <> 'project-information-request-projection.v1'
    or projection_namespace not in ('receivables_method_r01_evidence','receivables_method_r01_fields')
    or (job_row.kind = 'agent_operation_brief' and projection_namespace <> 'receivables_method_r01_fields')
    or jsonb_typeof(p_projection -> 'requests') <> 'array'
    or jsonb_array_length(p_projection -> 'requests') > 3
    or projection_reference is null or char_length(projection_reference) > 1000 then
    raise exception 'receivables_information_request_projection_invalid' using errcode = '22023';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.capital_project_id is not null;
  if not found or p_projection ->> 'projectId' <> session_row.capital_project_id::text then
    raise exception 'receivables_information_request_project_mismatch' using errcode = '42501';
  end if;

  perform 1 from public.capital_projects project
  where project.organization_id = job_row.organization_id
    and project.id = session_row.capital_project_id
  for update;

  select array_agg(value ->> 'requirementKey' order by value ->> 'requirementKey')
  into request_keys from jsonb_array_elements(p_projection -> 'requests') value;
  if cardinality(coalesce(request_keys, '{}'::text[]))
      <> cardinality(array(select distinct unnest(coalesce(request_keys, '{}'::text[])))) then
    raise exception 'receivables_information_request_duplicate_key' using errcode = '22023';
  end if;

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
    select value from jsonb_array_elements(p_projection -> 'requests') value
    order by value ->> 'requirementKey'
  loop
    if request_item ->> 'projectId' <> session_row.capital_project_id::text
      or request_item ->> 'schemaVersion' <> 'dcm-information-request.v1'
      or request_item ->> 'status' <> 'open'
      or coalesce(request_item ->> 'requirementKey','') !~ '^[a-z0-9_.-]{3,120}$'
      or char_length(trim(coalesce(request_item ->> 'question',''))) not between 5 and 1000
      or char_length(trim(coalesce(request_item ->> 'whyItMatters',''))) not between 5 and 1000
      or char_length(trim(coalesce(request_item ->> 'decisionImpact',''))) not between 5 and 1000
      or request_item ->> 'answerKind' not in ('text','number','date','choice','document','confirmation')
      or request_item ->> 'priority' not in ('blocking','high_value','later')
      or jsonb_typeof(request_item -> 'acceptableEvidence') <> 'array'
      or jsonb_array_length(request_item -> 'acceptableEvidence') not between 1 and 12
      or jsonb_typeof(request_item -> 'choices') <> 'array'
      or jsonb_array_length(request_item -> 'choices') > 12
      or (request_item ->> 'answerKind' = 'choice' and jsonb_array_length(request_item -> 'choices') < 2)
      or (request_item ->> 'informationGain')::numeric not between 0 and 1
      or (request_item ->> 'materiality')::numeric not between 0 and 1
      or (request_item ->> 'answerability')::numeric not between 0 and 1
      or (request_item ->> 'redundancyPenalty')::numeric not between 0 and 1
      or (projection_namespace = 'receivables_method_r01_fields'
        and jsonb_typeof(request_item -> 'producerBinding') <> 'object') then
      raise exception 'receivables_information_request_invalid' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.capital_project_information_requests request
      where request.organization_id = job_row.organization_id
        and request.capital_project_id = session_row.capital_project_id
        and request.requirement_key = request_item ->> 'requirementKey'
        and request.source_namespace <> projection_namespace
    ) then
      raise exception 'receivables_information_request_namespace_conflict' using errcode = '22023';
    end if;

    if projection_namespace = 'receivables_method_r01_fields' then
      with revised as (
      update public.capital_project_information_requests request set status = 'superseded'
      where request.organization_id = job_row.organization_id
        and request.capital_project_id = session_row.capital_project_id
        and request.source_namespace = projection_namespace
        and request.requirement_key = request_item ->> 'requirementKey'
        and request.status = 'open'
        and not exists (
          select 1 from private.receivables_information_request_bindings binding
          where binding.organization_id = request.organization_id
            and binding.information_request_id = request.id
            and binding.binding = request_item -> 'producerBinding'
        ) returning 1
      ) select superseded_count + count(*)::integer into superseded_count from revised;
    end if;

    select request.* into prior_request
    from public.capital_project_information_requests request
    where request.organization_id = job_row.organization_id
      and request.capital_project_id = session_row.capital_project_id
      and request.source_namespace = projection_namespace
      and request.requirement_key = request_item ->> 'requirementKey'
      and (projection_namespace <> 'receivables_method_r01_fields' or exists (
        select 1 from private.receivables_information_request_bindings binding
        where binding.organization_id = request.organization_id
          and binding.information_request_id = request.id
          and binding.binding = request_item -> 'producerBinding'
      ))
    order by (request.status = 'open') desc, request.created_at desc, request.id desc limit 1 for update;

    if found and prior_request.status in ('answered','waived') then
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
      where request.organization_id = job_row.organization_id and request.id = prior_request.id;
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

  if projection_namespace = 'receivables_method_r01_fields' and open_count > 0 then
    binding_result := private.worker_bind_receivables_information_request_fields_v1(
      p_job_id, p_capability_token, p_projection
    );
  end if;
  if open_count > 0 then
    insert into public.capital_project_agent_events (
      organization_id, capital_project_id, event_type, summary_pt, summary_en, detail
    ) values (
      job_row.organization_id, session_row.capital_project_id, 'question_created',
      'Separei os próximos inputs que mais alteram a análise.',
      'I surfaced the next inputs that most change the analysis.',
      jsonb_build_object('projection_ref',projection_reference,'source_namespace',projection_namespace,
        'open_count',open_count,'preserved_closed_count',preserved_closed_count)
    ) on conflict do nothing;
  end if;
  return jsonb_build_object(
    'open_count',open_count,'preserved_closed_count',preserved_closed_count,
    'superseded_count',superseded_count,
    'bound_count',coalesce((binding_result ->> 'bound_count')::integer,0)
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'receivables_information_request_contract_invalid' using errcode = '22023';
end;
$function$
