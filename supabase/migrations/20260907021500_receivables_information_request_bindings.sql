-- A visible question may collect a method input only when a private, immutable binding says
-- exactly which field, dataset, unit and parser it controls. Customer prose never selects an
-- executor path. Invalid typed answers fail in the same transaction that would close the card.

create table private.receivables_information_request_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  capital_project_id uuid not null,
  information_request_id uuid not null,
  source_namespace text not null check (source_namespace = 'receivables_method_r01_fields'),
  binding_fingerprint text not null check (binding_fingerprint ~ '^[0-9a-f]{64}$'),
  binding jsonb not null check (jsonb_typeof(binding) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, information_request_id),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, information_request_id)
    references public.capital_project_information_requests(organization_id, id) on delete cascade
);

revoke all privileges on private.receivables_information_request_bindings from public, anon, authenticated;

-- The prior prototype used one namespace for both evidence and policy prose. Those open cards
-- cannot be safely reinterpreted as typed fields after this migration.
update public.capital_project_information_requests
set status = 'superseded'
where source_namespace = 'receivables_method_r01' and status = 'open';

create or replace function private.worker_bind_receivables_information_request_fields_v1(
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
  request_item jsonb;
  request_row public.capital_project_information_requests;
  binding jsonb;
  binding_hash text;
  prior private.receivables_information_request_bindings;
  bound_count integer := 0;
  replayed_count integer := 0;
begin
  if job_row.kind not in ('case_analysis','agent_operation_brief')
    or jsonb_typeof(p_projection) <> 'object'
    or p_projection ->> 'schemaVersion' <> 'project-information-request-projection.v1'
    or p_projection ->> 'sourceNamespace' <> 'receivables_method_r01_fields'
    or jsonb_typeof(p_projection -> 'requests') <> 'array'
    or jsonb_array_length(p_projection -> 'requests') > 3 then
    raise exception 'receivables_information_request_binding_projection_invalid' using errcode = '22023';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.capital_project_id is not null;
  if not found or p_projection ->> 'projectId' <> session_row.capital_project_id::text then
    raise exception 'receivables_information_request_binding_project_mismatch' using errcode = '42501';
  end if;

  for request_item in select value from jsonb_array_elements(p_projection -> 'requests') value
  loop
    binding := request_item -> 'producerBinding';
    if jsonb_typeof(binding) <> 'object'
      or binding ->> 'schemaVersion' <> 'receivables-information-request-binding.v1'
      or binding ->> 'methodId' <> 'R01'
      or coalesce(binding ->> 'sourceDatasetHash','') !~ '^[0-9a-f]{64}$'
      or coalesce(binding ->> 'fieldPath','') !~ '^/(policy|structure)/[A-Za-z0-9/]+$'
      or binding ->> 'valueKind' not in ('integer','percentage','boolean','enum','string_list','money','multiple')
      or binding ->> 'unit' not in ('days','percent_0_100','boolean','enum','text_list','currency_major','multiple')
      or jsonb_typeof(binding -> 'options') <> 'array'
      or jsonb_array_length(binding -> 'options') > 12
      or octet_length(binding::text) > 8192 then
      raise exception 'receivables_information_request_binding_invalid' using errcode = '22023';
    end if;

    select request.* into request_row
    from public.capital_project_information_requests request
    where request.organization_id = job_row.organization_id
      and request.capital_project_id = session_row.capital_project_id
      and request.source_namespace = 'receivables_method_r01_fields'
      and request.requirement_key = request_item ->> 'requirementKey'
    order by request.created_at desc, request.id desc limit 1;
    if not found then
      raise exception 'receivables_information_request_not_projected' using errcode = 'P0002';
    end if;

    binding_hash := encode(extensions.digest(convert_to(binding::text, 'UTF8'), 'sha256'), 'hex');
    select stored.* into prior
    from private.receivables_information_request_bindings stored
    where stored.organization_id = job_row.organization_id
      and stored.information_request_id = request_row.id;
    if found then
      if prior.binding_fingerprint <> binding_hash then
        raise exception 'receivables_information_request_binding_immutable_conflict' using errcode = '23505';
      end if;
      replayed_count := replayed_count + 1;
      continue;
    end if;
    insert into private.receivables_information_request_bindings (
      organization_id, capital_project_id, information_request_id, source_namespace,
      binding_fingerprint, binding
    ) values (
      job_row.organization_id, session_row.capital_project_id, request_row.id,
      'receivables_method_r01_fields', binding_hash, binding
    );
    bound_count := bound_count + 1;
  end loop;
  return jsonb_build_object('bound_count', bound_count, 'replayed_count', replayed_count);
end;
$$;

create or replace function public.worker_bind_receivables_information_request_fields_v1(
  p_job_id uuid, p_capability_token text, p_projection jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_bind_receivables_information_request_fields_v1(
    p_job_id, p_capability_token, p_projection
  );
$$;

revoke all on function private.worker_bind_receivables_information_request_fields_v1(uuid,text,jsonb) from public, anon;
revoke all on function public.worker_bind_receivables_information_request_fields_v1(uuid,text,jsonb) from public, anon;
grant execute on function private.worker_bind_receivables_information_request_fields_v1(uuid,text,jsonb) to authenticated;
grant execute on function public.worker_bind_receivables_information_request_fields_v1(uuid,text,jsonb) to authenticated;

create or replace function private.worker_sync_receivables_information_requests_v1(
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

    select request.* into prior_request
    from public.capital_project_information_requests request
    where request.organization_id = job_row.organization_id
      and request.capital_project_id = session_row.capital_project_id
      and request.requirement_key = request_item ->> 'requirementKey'
    order by request.created_at desc, request.id desc limit 1 for update;

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
$$;

create or replace function public.worker_sync_receivables_information_requests_v1(
  p_job_id uuid, p_capability_token text, p_projection jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_sync_receivables_information_requests_v1(
    p_job_id, p_capability_token, p_projection
  );
$$;

revoke all on function private.worker_sync_receivables_information_requests_v1(uuid,text,jsonb) from public, anon;
revoke all on function public.worker_sync_receivables_information_requests_v1(uuid,text,jsonb) from public, anon;
grant execute on function private.worker_sync_receivables_information_requests_v1(uuid,text,jsonb) to authenticated;
grant execute on function public.worker_sync_receivables_information_requests_v1(uuid,text,jsonb) to authenticated;

create or replace function private.validate_bound_receivables_information_response_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored private.receivables_information_request_bindings;
  message_row public.agent_messages;
  value_kind text;
  normalized text;
  numeric_value numeric;
  minimum_value numeric;
  maximum_value numeric;
begin
  if old.status <> 'open' or new.status <> 'answered' then return new; end if;
  select binding.* into stored
  from private.receivables_information_request_bindings binding
  where binding.organization_id = new.organization_id
    and binding.information_request_id = new.id;
  if not found then return new; end if;

  select message.* into message_row
  from public.agent_messages message
  where message.organization_id = new.organization_id
    and message.id = nullif(new.answer_ref ->> 'messageId','')::uuid;
  if not found then
    raise exception 'bound_information_response_message_missing' using errcode = '22023';
  end if;
  value_kind := stored.binding ->> 'valueKind';
  normalized := trim(message_row.content);

  if value_kind in ('boolean','enum') then
    if not exists (
      select 1 from jsonb_array_elements(stored.binding -> 'options') option
      where option ->> 'label' = normalized
    ) then raise exception 'bound_information_response_choice_invalid' using errcode = '22023'; end if;
    return new;
  end if;
  if value_kind = 'string_list' then
    if char_length(normalized) not between 1 and 1000 then
      raise exception 'bound_information_response_list_invalid' using errcode = '22023';
    end if;
    return new;
  end if;

  normalized := replace(lower(normalized), ',', '.');
  if value_kind = 'percentage' then normalized := regexp_replace(normalized, '%$', ''); end if;
  if value_kind = 'multiple' then normalized := regexp_replace(normalized, 'x$', ''); end if;
  if normalized !~ '^\d+(\.\d+)?$' then
    raise exception 'bound_information_response_number_invalid' using errcode = '22023';
  end if;
  numeric_value := normalized::numeric;
  minimum_value := nullif(stored.binding ->> 'minimum','')::numeric;
  maximum_value := nullif(stored.binding ->> 'maximum','')::numeric;
  if value_kind = 'integer' and trunc(numeric_value) <> numeric_value then
    raise exception 'bound_information_response_integer_invalid' using errcode = '22023';
  end if;
  if (minimum_value is not null and numeric_value < minimum_value)
    or (maximum_value is not null and numeric_value > maximum_value) then
    raise exception 'bound_information_response_range_invalid' using errcode = '22023';
  end if;
  return new;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'bound_information_response_number_invalid' using errcode = '22023';
end;
$$;

revoke all on function private.validate_bound_receivables_information_response_v1() from public, anon, authenticated;
drop trigger if exists capital_project_information_requests_validate_bound_response
  on public.capital_project_information_requests;
create trigger capital_project_information_requests_validate_bound_response
  before update of status, answer_ref on public.capital_project_information_requests
  for each row execute function private.validate_bound_receivables_information_response_v1();

-- Extend the capability-scoped chat context with the private binding for only the exact question
-- named by machine-owned message metadata.
create or replace function private.worker_load_agent_context(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_context jsonb := private.worker_load_agent_context_before_execution_brief_v1(
    p_job_id, p_capability_token
  );
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  project_id uuid := nullif(base_context #>> '{project,id}', '')::uuid;
  message_id uuid := nullif(base_context ->> 'message_id', '')::uuid;
  message_metadata jsonb;
begin
  select coalesce(message.metadata, '{}'::jsonb) into message_metadata
  from public.agent_messages message
  where message.organization_id = job_row.organization_id and message.id = message_id;

  return base_context || jsonb_build_object(
    'message_metadata', coalesce(message_metadata, '{}'::jsonb),
    'answered_information_request', (
      select jsonb_build_object(
        'id', request.id,
        'requirementKey', request.requirement_key,
        'question', request.question,
        'answerKind', request.answer_kind,
        'answerSource', message_metadata ->> 'answerSource',
        'sourceNamespace', request.source_namespace,
        'answeredAt', request.answer_ref ->> 'answeredAt',
        'answeredBy', request.answer_ref ->> 'answeredBy',
        'producerBinding', binding.binding
      )
      from public.capital_project_information_requests request
      left join private.receivables_information_request_bindings binding
        on binding.organization_id = request.organization_id
        and binding.information_request_id = request.id
      where request.organization_id = job_row.organization_id
        and request.capital_project_id = project_id
        and request.id = nullif(message_metadata ->> 'informationRequestId', '')::uuid
    ),
    'active_plan', (
      select plan.snapshot from public.capital_project_plans plan
      where plan.organization_id = job_row.organization_id
        and plan.capital_project_id = project_id and plan.status = 'active'
      order by plan.plan_version desc limit 1
    ),
    'latest_execution_brief', (
      select jsonb_build_object(
        'id', brief.id, 'version', brief.brief_version,
        'fingerprint', brief.brief_fingerprint, 'visibleSnapshot', brief.visible_snapshot
      )
      from public.capital_project_execution_briefs brief
      where brief.organization_id = job_row.organization_id
        and brief.capital_project_id = project_id
      order by brief.brief_version desc limit 1
    )
  );
exception when invalid_text_representation then
  raise exception 'invalid_information_request_project_context' using errcode = '22023';
end;
$$;

revoke all on function private.worker_load_agent_context(uuid,text) from public, anon;
grant execute on function private.worker_load_agent_context(uuid,text) to authenticated;

comment on table private.receivables_information_request_bindings is
  'Private immutable mapping from a visible R01 question to one exact dataset, model field, unit and parser contract.';
