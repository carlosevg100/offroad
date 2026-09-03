-- Recovered from production migration ledger on 2026-09-03.
-- Recorded statements MD5 (joined with newline): f615c41bb952a621cc48cd60594c0fc2

-- M0 lifecycle governance: documentary scope suggestions and advisor authority state changes.
--
-- The worker may surface an entity mentioned by anchored evidence, but it may not enlarge the
-- economic perimeter. A tenant member must confirm or dismiss the suggestion. Likewise, an
-- authorization document can move an advisor declaration to `documented`; only an Offroad
-- operator may verify it, and neither action grants market sounding or introduction authority.

alter table public.document_intake_sessions
  add column if not exists analysis_scope_suggestions jsonb
    check (analysis_scope_suggestions is null or jsonb_typeof(analysis_scope_suggestions) = 'object');

comment on column public.document_intake_sessions.analysis_scope_suggestions is
  'Current documentary entity suggestions. Pending items do not change the authoritative analysis scope.';

alter table public.intake_domain_events
  drop constraint if exists intake_domain_events_event_type_check;

alter table public.intake_domain_events
  add constraint intake_domain_events_event_type_check check (event_type in (
    'capital_need_declared', 'archetype_routed', 'document_received',
    'document_classified', 'document_removed', 'information_answered',
    'information_cleared', 'absence_recorded', 'request_ladder_recorded',
    'analysis_scope_recorded', 'analysis_scope_suggestions_recorded',
    'advisor_authorization_recorded', 'route_check_recorded'
  ));

-- Keep the event allowlist explicit. Adding the projection without extending this append primitive
-- would make both worker persistence and tenant resolution fail closed with intake_event_type_invalid.
create or replace function private.append_intake_domain_event(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_event_type text,
  p_payload jsonb,
  p_occurred_at timestamptz,
  p_actor_id uuid
)
returns public.intake_domain_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.intake_domain_events;
  next_sequence bigint;
  result public.intake_domain_events;
  digest_input text;
begin
  if p_actor_id is null or p_actor_id is distinct from (select auth.uid()) then
    raise exception 'intake_event_actor_invalid' using errcode = '42501';
  end if;
  if p_event_id is null or p_event_type is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'intake_event_contract_invalid' using errcode = '22023';
  end if;
  if p_event_type not in (
    'capital_need_declared', 'archetype_routed', 'document_received',
    'document_classified', 'document_removed', 'information_answered',
    'information_cleared', 'absence_recorded', 'request_ladder_recorded',
    'analysis_scope_recorded', 'analysis_scope_suggestions_recorded',
    'advisor_authorization_recorded', 'route_check_recorded'
  ) then
    raise exception 'intake_event_type_invalid' using errcode = '22023';
  end if;
  if p_occurred_at is null or p_occurred_at > now() + interval '5 minutes' then
    raise exception 'intake_event_time_invalid' using errcode = '22023';
  end if;

  perform 1
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id and session.id = p_session_id
  for update;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;

  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type is distinct from p_event_type
      or existing.payload is distinct from p_payload
      or existing.created_by is distinct from p_actor_id then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return existing;
  end if;

  select coalesce(max(event.sequence), 0) + 1 into next_sequence
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.intake_session_id = p_session_id;
  digest_input := concat_ws(
    '|', p_organization_id::text, p_session_id::text, next_sequence::text,
    p_event_type, '1', p_occurred_at::text, p_payload::text
  );
  insert into public.intake_domain_events (
    event_id, organization_id, intake_session_id, sequence, event_type, payload,
    payload_version, event_hash, occurred_at, created_by
  ) values (
    p_event_id, p_organization_id, p_session_id, next_sequence, p_event_type, p_payload,
    1, encode(extensions.digest(convert_to(digest_input, 'UTF8'), 'sha256'), 'hex'),
    p_occurred_at, p_actor_id
  ) returning * into result;
  return result;
end;
$$;

revoke all on function private.append_intake_domain_event(uuid, uuid, uuid, text, jsonb, timestamptz, uuid)
  from public, anon, authenticated;

alter table public.document_profiles
  drop constraint if exists document_profiles_document_kind_check;

alter table public.document_profiles
  add constraint document_profiles_document_kind_check
  check (document_kind in (
    'audited_financial_statements', 'auditor_report_only', 'reviewed_interim_statements',
    'trial_balance', 'erp_export', 'management_accounts', 'bank_statements', 'open_finance_export',
    'debt_schedule', 'loan_agreement', 'debenture_indenture', 'collateral_inventory',
    'appraisal_report', 'receivables_aging', 'payables_aging', 'business_plan',
    'financial_model', 'budget', 'investor_deck', 'cim', 'teaser', 'project_memorandum',
    'technical_report', 'capital_request_letter', 'advisor_authority_evidence',
    'company_registration', 'corporate_docs', 'tax_clearance', 'regulatory_filing',
    'customer_concentration', 'customer_contract', 'supplier_contract', 'insurance_policy',
    'cap_table', 'metrics_report', 'other'
  ));

create or replace function private.worker_record_analysis_scope_suggestions(
  p_job_id uuid,
  p_capability_token text,
  p_event_id uuid,
  p_suggestions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  existing public.intake_domain_events;
  event_row public.intake_domain_events;
  current_items jsonb;
  next_items jsonb;
  item jsonb;
  existing_item jsonb;
  evidence_reference text := 'document:' || job_row.source_document_id::text;
  suggestion_version integer;
  suggestion_value jsonb;
  actor_id uuid := (select auth.uid());
  occurred_at timestamptz := clock_timestamp();
begin
  if p_event_id is null or p_suggestions is null or jsonb_typeof(p_suggestions) <> 'array'
    or jsonb_array_length(p_suggestions) > 25 then
    raise exception 'intake_scope_suggestions_invalid' using errcode = '22023';
  end if;

  select * into session_row
  from public.document_intake_sessions session_record
  where session_record.organization_id = job_row.organization_id
    and session_record.id = job_row.intake_session_id
  for update;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;
  if session_row.status in ('confirmed', 'cancelled') then
    raise exception 'intake_session_terminal' using errcode = '55000';
  end if;

  select * into existing
  from public.intake_domain_events event
  where event.organization_id = job_row.organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from job_row.intake_session_id
      or existing.event_type <> 'analysis_scope_suggestions_recorded' then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', existing.event_id, 'sequence', existing.sequence, 'replayed', true);
  end if;

  current_items := coalesce(session_row.analysis_scope_suggestions -> 'items', '[]'::jsonb);
  if jsonb_typeof(current_items) <> 'array' then
    raise exception 'intake_scope_suggestions_projection_invalid' using errcode = '22023';
  end if;
  next_items := current_items;

  for item in select value from jsonb_array_elements(p_suggestions)
  loop
    if jsonb_typeof(item) <> 'object'
      or char_length(trim(coalesce(item ->> 'suggestionId', ''))) not between 1 and 200
      or char_length(trim(coalesce(item ->> 'entityId', ''))) not between 1 and 200
      or char_length(trim(coalesce(item ->> 'legalName', ''))) not between 2 and 240
      or item ->> 'suggestedRole' not in ('operating_company', 'guarantor', 'holding', 'target', 'other')
      or not exists (
        select 1
        from public.intake_field_candidates candidate
        where candidate.organization_id = job_row.organization_id
          and candidate.intake_session_id = job_row.intake_session_id
          and candidate.source_document_id = job_row.source_document_id
          and candidate.anchor_verified
          and candidate.confidence >= 0.80
          and lower(trim(candidate.entity_name)) = lower(trim(item ->> 'legalName'))
      ) then
      raise exception 'intake_scope_suggestion_not_supported' using errcode = '22023';
    end if;

    -- An entity already inside the confirmed perimeter is not a suggestion.
    if exists (
      select 1 from jsonb_array_elements(coalesce(session_row.analysis_scope -> 'entities', '[]'::jsonb)) entity(value)
      where lower(trim(entity.value ->> 'legalName')) = lower(trim(item ->> 'legalName'))
    ) then
      continue;
    end if;

    select value into existing_item
    from jsonb_array_elements(next_items) prior(value)
    where prior.value ->> 'suggestionId' = trim(item ->> 'suggestionId')
      or lower(trim(prior.value ->> 'legalName')) = lower(trim(item ->> 'legalName'))
    limit 1;

    if existing_item is null then
      next_items := next_items || jsonb_build_array(jsonb_build_object(
        'suggestionId', trim(item ->> 'suggestionId'),
        'entityId', trim(item ->> 'entityId'),
        'legalName', trim(item ->> 'legalName'),
        'suggestedRole', item ->> 'suggestedRole',
        'status', 'pending',
        'evidenceReferences', jsonb_build_array(evidence_reference)
      ));
    elsif existing_item ->> 'status' = 'pending'
      and not ((existing_item -> 'evidenceReferences') ? evidence_reference) then
      next_items := (
        select coalesce(jsonb_agg(
          case
            when prior.value ->> 'suggestionId' = existing_item ->> 'suggestionId'
              then jsonb_set(
                prior.value,
                '{evidenceReferences}',
                coalesce(prior.value -> 'evidenceReferences', '[]'::jsonb) || to_jsonb(evidence_reference),
                true
              )
            else prior.value
          end
          order by prior.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(next_items) with ordinality prior(value, ordinality)
      );
    end if;
    existing_item := null;
  end loop;

  if jsonb_array_length(next_items) > 50 then
    raise exception 'intake_scope_suggestions_limit' using errcode = '22023';
  end if;
  if next_items = current_items then
    return jsonb_build_object('recorded', false, 'reason', 'no_new_supported_entities');
  end if;

  select count(*)::integer + 1 into suggestion_version
  from public.intake_domain_events event
  where event.organization_id = job_row.organization_id
    and event.intake_session_id = job_row.intake_session_id
    and event.event_type = 'analysis_scope_suggestions_recorded';
  suggestion_value := jsonb_build_object('items', next_items, 'version', suggestion_version);

  update public.document_intake_sessions
  set analysis_scope_suggestions = suggestion_value
  where organization_id = job_row.organization_id and id = job_row.intake_session_id;

  event_row := private.append_intake_domain_event(
    job_row.organization_id, job_row.intake_session_id, p_event_id,
    'analysis_scope_suggestions_recorded', jsonb_build_object('suggestions', suggestion_value),
    occurred_at, actor_id
  );
  return jsonb_build_object('eventId', event_row.event_id, 'sequence', event_row.sequence, 'replayed', false, 'recorded', true);
end;
$$;

create or replace function public.worker_record_analysis_scope_suggestions(
  p_job_id uuid,
  p_capability_token text,
  p_event_id uuid,
  p_suggestions jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_analysis_scope_suggestions(
    p_job_id, p_capability_token, p_event_id, p_suggestions
  );
$$;

create or replace function private.worker_document_advisor_authorization(
  p_job_id uuid,
  p_capability_token text,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  existing public.intake_domain_events;
  event_row public.intake_domain_events;
  authorization_value jsonb;
  evidence_reference text := 'document:' || job_row.source_document_id::text;
  next_evidence jsonb;
  authorization_version integer;
  actor_id uuid := (select auth.uid());
  occurred_at timestamptz := clock_timestamp();
begin
  if p_event_id is null then raise exception 'intake_authorization_event_required' using errcode = '22023'; end if;

  select * into session_row
  from public.document_intake_sessions session_record
  where session_record.organization_id = job_row.organization_id
    and session_record.id = job_row.intake_session_id
  for update;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;
  if session_row.status in ('confirmed', 'cancelled') then raise exception 'intake_session_terminal' using errcode = '55000'; end if;

  select * into existing
  from public.intake_domain_events event
  where event.organization_id = job_row.organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from job_row.intake_session_id
      or existing.event_type <> 'advisor_authorization_recorded' then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', existing.event_id, 'sequence', existing.sequence, 'replayed', true);
  end if;

  if session_row.journey <> 'originator' or session_row.advisor_authorization is null then
    return jsonb_build_object('recorded', false, 'reason', 'advisor_authorization_not_applicable');
  end if;
  if not exists (
    select 1 from public.document_profiles profile
    where profile.organization_id = job_row.organization_id
      and profile.source_document_id = job_row.source_document_id
      and profile.document_kind = 'advisor_authority_evidence'
  ) then
    raise exception 'advisor_authorization_document_not_classified' using errcode = '22023';
  end if;
  if session_row.advisor_authorization ->> 'status' = 'revoked' then
    return jsonb_build_object('recorded', false, 'reason', 'advisor_authorization_revoked');
  end if;

  next_evidence := coalesce(session_row.advisor_authorization -> 'evidenceReferences', '[]'::jsonb);
  if next_evidence ? evidence_reference then
    return jsonb_build_object('recorded', false, 'reason', 'evidence_already_recorded');
  end if;
  next_evidence := next_evidence || to_jsonb(evidence_reference);

  select count(*)::integer + 1 into authorization_version
  from public.intake_domain_events event
  where event.organization_id = job_row.organization_id
    and event.intake_session_id = job_row.intake_session_id
    and event.event_type = 'advisor_authorization_recorded';

  authorization_value := session_row.advisor_authorization
    || jsonb_build_object(
      'status', case
        when session_row.advisor_authorization ->> 'status' = 'declared' then 'documented'
        else session_row.advisor_authorization ->> 'status'
      end,
      'evidenceReferences', next_evidence,
      'version', authorization_version
    );
  update public.document_intake_sessions
  set advisor_authorization = authorization_value
  where organization_id = job_row.organization_id and id = job_row.intake_session_id;

  event_row := private.append_intake_domain_event(
    job_row.organization_id, job_row.intake_session_id, p_event_id,
    'advisor_authorization_recorded', jsonb_build_object('authorization', authorization_value),
    occurred_at, actor_id
  );
  return jsonb_build_object('eventId', event_row.event_id, 'sequence', event_row.sequence, 'replayed', false, 'recorded', true);
end;
$$;

create or replace function public.worker_document_advisor_authorization(
  p_job_id uuid,
  p_capability_token text,
  p_event_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_document_advisor_authorization(p_job_id, p_capability_token, p_event_id);
$$;

create or replace function private.resolve_analysis_scope_suggestion_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_suggestion_event_id uuid,
  p_scope_event_id uuid,
  p_suggestion_id text,
  p_decision text,
  p_role text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  suggestion jsonb;
  next_items jsonb;
  next_suggestions jsonb;
  next_scope jsonb;
  suggestion_version integer;
  scope_version integer;
  existing public.intake_domain_events;
  scope_event public.intake_domain_events;
  scope_event_id_result uuid;
  suggestion_event public.intake_domain_events;
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status in ('confirmed', 'cancelled') then raise exception 'intake_session_terminal' using errcode = '55000'; end if;
  if p_suggestion_event_id is null
    or char_length(trim(coalesce(p_suggestion_id, ''))) not between 1 and 200
    or p_decision not in ('confirm', 'dismiss')
    or char_length(trim(coalesce(p_reason, ''))) not between 3 and 1000
    or (p_decision = 'confirm' and (p_scope_event_id is null or p_role not in ('operating_company', 'guarantor', 'holding', 'target', 'other')))
    or (p_decision = 'dismiss' and (p_scope_event_id is not null or p_role is not null)) then
    raise exception 'intake_scope_suggestion_decision_invalid' using errcode = '22023';
  end if;

  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_suggestion_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'analysis_scope_suggestions_recorded' then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', existing.event_id, 'sequence', existing.sequence, 'replayed', true);
  end if;

  select value into suggestion
  from jsonb_array_elements(coalesce(session_row.analysis_scope_suggestions -> 'items', '[]'::jsonb)) item(value)
  where item.value ->> 'suggestionId' = trim(p_suggestion_id)
  limit 1;
  if suggestion is null or suggestion ->> 'status' <> 'pending' then
    raise exception 'intake_scope_suggestion_not_pending' using errcode = '55000';
  end if;

  if p_decision = 'confirm' then
    if session_row.analysis_scope is null
      or exists (
        select 1 from jsonb_array_elements(session_row.analysis_scope -> 'entities') entity(value)
        where entity.value ->> 'entityId' = suggestion ->> 'entityId'
          or lower(trim(entity.value ->> 'legalName')) = lower(trim(suggestion ->> 'legalName'))
      ) then
      raise exception 'intake_scope_entity_conflict' using errcode = '23505';
    end if;
    select count(*)::integer + 1 into scope_version
    from public.intake_domain_events event
    where event.organization_id = p_organization_id
      and event.intake_session_id = p_session_id
      and event.event_type = 'analysis_scope_recorded';
    next_scope := jsonb_build_object(
      'entities', (session_row.analysis_scope -> 'entities') || jsonb_build_array(jsonb_build_object(
        'entityId', suggestion ->> 'entityId',
        'legalName', suggestion ->> 'legalName',
        'role', p_role,
        'source', 'document',
        'status', 'confirmed',
        'evidenceReferences', suggestion -> 'evidenceReferences'
      )),
      'reason', trim(p_reason),
      'version', scope_version
    );
    update public.document_intake_sessions set analysis_scope = next_scope
    where organization_id = p_organization_id and id = p_session_id;
    scope_event := private.append_intake_domain_event(
      p_organization_id, p_session_id, p_scope_event_id, 'analysis_scope_recorded',
      jsonb_build_object('scope', next_scope), occurred_at, actor_id
    );
    scope_event_id_result := scope_event.event_id;
  end if;

  next_items := (
    select coalesce(jsonb_agg(
      case
        when item.value ->> 'suggestionId' = trim(p_suggestion_id)
          then item.value || jsonb_build_object(
            'status', case when p_decision = 'confirm' then 'confirmed' else 'dismissed' end,
            'decisionReason', trim(p_reason)
          )
        else item.value
      end
      order by item.ordinality
    ), '[]'::jsonb)
    from jsonb_array_elements(session_row.analysis_scope_suggestions -> 'items') with ordinality item(value, ordinality)
  );
  select count(*)::integer + 1 into suggestion_version
  from public.intake_domain_events event
  where event.organization_id = p_organization_id
    and event.intake_session_id = p_session_id
    and event.event_type = 'analysis_scope_suggestions_recorded';
  next_suggestions := jsonb_build_object('items', next_items, 'version', suggestion_version);
  update public.document_intake_sessions set analysis_scope_suggestions = next_suggestions
  where organization_id = p_organization_id and id = p_session_id;
  suggestion_event := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_suggestion_event_id, 'analysis_scope_suggestions_recorded',
    jsonb_build_object('suggestions', next_suggestions), occurred_at, actor_id
  );

  return jsonb_strip_nulls(jsonb_build_object(
    'scopeEventId', scope_event_id_result,
    'suggestionEventId', suggestion_event.event_id,
    'replayed', false
  ));
end;
$$;

create or replace function public.resolve_analysis_scope_suggestion_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_suggestion_event_id uuid,
  p_scope_event_id uuid,
  p_suggestion_id text,
  p_decision text,
  p_role text,
  p_reason text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.resolve_analysis_scope_suggestion_command(
    p_organization_id, p_session_id, p_suggestion_event_id, p_scope_event_id,
    p_suggestion_id, p_decision, p_role, p_reason
  );
$$;

create or replace function private.revoke_advisor_authorization_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  authorization_value jsonb;
  authorization_version integer;
  existing public.intake_domain_events;
  event_row public.intake_domain_events;
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if p_event_id is null or char_length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'intake_advisor_authorization_revoke_invalid' using errcode = '22023';
  end if;
  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'advisor_authorization_recorded' then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', existing.event_id, 'sequence', existing.sequence, 'replayed', true);
  end if;
  if session_row.status in ('confirmed', 'cancelled') then raise exception 'intake_session_terminal' using errcode = '55000'; end if;
  if session_row.journey <> 'originator' or session_row.advisor_authorization is null
    or session_row.advisor_authorization ->> 'status' = 'revoked' then
    raise exception 'intake_advisor_authorization_revoke_invalid' using errcode = '22023';
  end if;
  select count(*)::integer + 1 into authorization_version
  from public.intake_domain_events event
  where event.organization_id = p_organization_id
    and event.intake_session_id = p_session_id
    and event.event_type = 'advisor_authorization_recorded';
  authorization_value := session_row.advisor_authorization || jsonb_build_object(
    'status', 'revoked', 'scopes', '[]'::jsonb, 'statusReason', trim(p_reason), 'version', authorization_version
  );
  update public.document_intake_sessions set advisor_authorization = authorization_value
  where organization_id = p_organization_id and id = p_session_id;
  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, 'advisor_authorization_recorded',
    jsonb_build_object('authorization', authorization_value), occurred_at, actor_id
  );
  return jsonb_build_object('eventId', event_row.event_id, 'sequence', event_row.sequence, 'replayed', false);
end;
$$;

create or replace function public.revoke_advisor_authorization_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_reason text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.revoke_advisor_authorization_command(p_organization_id, p_session_id, p_event_id, p_reason); $$;

create or replace function private.verify_advisor_authorization_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  authorization_value jsonb;
  authorization_version integer;
  existing public.intake_domain_events;
  event_row public.intake_domain_events;
  occurred_at timestamptz := clock_timestamp();
begin
  if not (select private.is_offroad_member()) then
    raise exception 'offroad_operator_required' using errcode = '42501';
  end if;
  select * into session_row
  from public.document_intake_sessions session_record
  where session_record.organization_id = p_organization_id and session_record.id = p_session_id
  for update;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;
  if p_event_id is null or char_length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'intake_advisor_authorization_verify_invalid' using errcode = '22023';
  end if;
  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'advisor_authorization_recorded' then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', existing.event_id, 'sequence', existing.sequence, 'replayed', true);
  end if;
  if session_row.status in ('confirmed', 'cancelled') then raise exception 'intake_session_terminal' using errcode = '55000'; end if;
  if session_row.journey <> 'originator' or session_row.advisor_authorization is null
    or session_row.advisor_authorization ->> 'status' <> 'documented'
    or jsonb_array_length(coalesce(session_row.advisor_authorization -> 'evidenceReferences', '[]'::jsonb)) = 0 then
    raise exception 'intake_advisor_authorization_verify_invalid' using errcode = '22023';
  end if;
  select count(*)::integer + 1 into authorization_version
  from public.intake_domain_events event
  where event.organization_id = p_organization_id
    and event.intake_session_id = p_session_id
    and event.event_type = 'advisor_authorization_recorded';
  authorization_value := session_row.advisor_authorization || jsonb_build_object(
    'status', 'verified', 'statusReason', trim(p_reason), 'version', authorization_version
  );
  update public.document_intake_sessions set advisor_authorization = authorization_value
  where organization_id = p_organization_id and id = p_session_id;
  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, 'advisor_authorization_recorded',
    jsonb_build_object('authorization', authorization_value), occurred_at, actor_id
  );
  return jsonb_build_object('eventId', event_row.event_id, 'sequence', event_row.sequence, 'replayed', false);
end;
$$;

create or replace function public.verify_advisor_authorization_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_reason text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.verify_advisor_authorization_command(p_organization_id, p_session_id, p_event_id, p_reason); $$;

revoke update (analysis_scope_suggestions) on table public.document_intake_sessions from authenticated;

revoke all on function private.worker_record_analysis_scope_suggestions(uuid, text, uuid, jsonb) from public, anon, authenticated;

revoke all on function public.worker_record_analysis_scope_suggestions(uuid, text, uuid, jsonb) from public, anon;

grant execute on function private.worker_record_analysis_scope_suggestions(uuid, text, uuid, jsonb) to authenticated;

grant execute on function public.worker_record_analysis_scope_suggestions(uuid, text, uuid, jsonb) to authenticated;

revoke all on function private.worker_document_advisor_authorization(uuid, text, uuid) from public, anon, authenticated;

revoke all on function public.worker_document_advisor_authorization(uuid, text, uuid) from public, anon;

grant execute on function private.worker_document_advisor_authorization(uuid, text, uuid) to authenticated;

grant execute on function public.worker_document_advisor_authorization(uuid, text, uuid) to authenticated;

revoke all on function private.resolve_analysis_scope_suggestion_command(uuid, uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;

revoke all on function public.resolve_analysis_scope_suggestion_command(uuid, uuid, uuid, uuid, text, text, text, text) from public, anon;

grant execute on function private.resolve_analysis_scope_suggestion_command(uuid, uuid, uuid, uuid, text, text, text, text) to authenticated;

grant execute on function public.resolve_analysis_scope_suggestion_command(uuid, uuid, uuid, uuid, text, text, text, text) to authenticated;

revoke all on function private.revoke_advisor_authorization_command(uuid, uuid, uuid, text) from public, anon, authenticated;

revoke all on function public.revoke_advisor_authorization_command(uuid, uuid, uuid, text) from public, anon;

grant execute on function private.revoke_advisor_authorization_command(uuid, uuid, uuid, text) to authenticated;

grant execute on function public.revoke_advisor_authorization_command(uuid, uuid, uuid, text) to authenticated;

revoke all on function private.verify_advisor_authorization_command(uuid, uuid, uuid, text) from public, anon, authenticated;

revoke all on function public.verify_advisor_authorization_command(uuid, uuid, uuid, text) from public, anon;

grant execute on function private.verify_advisor_authorization_command(uuid, uuid, uuid, text) to authenticated;

grant execute on function public.verify_advisor_authorization_command(uuid, uuid, uuid, text) to authenticated;

create or replace function private.guard_intake_session_terminal_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('confirmed', 'cancelled') and (
    new.archetype is distinct from old.archetype
    or new.capital_objective is distinct from old.capital_objective
    or new.capital_currency is distinct from old.capital_currency
    or new.capital_urgency is distinct from old.capital_urgency
    or new.capital_consequence is distinct from old.capital_consequence
    or new.requested_amount is distinct from old.requested_amount
    or new.requested_grace_months is distinct from old.requested_grace_months
    or new.requested_term_months is distinct from old.requested_term_months
    or new.sector is distinct from old.sector
    or new.geography is distinct from old.geography
    or new.instruments is distinct from old.instruments
    or new.collateral_kinds is distinct from old.collateral_kinds
    or new.expected_rate is distinct from old.expected_rate
    or new.analysis_scope is distinct from old.analysis_scope
    or new.analysis_scope_suggestions is distinct from old.analysis_scope_suggestions
    or new.advisor_authorization is distinct from old.advisor_authorization
    or new.route_checks is distinct from old.route_checks
  ) then
    raise exception 'intake_session_terminal' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_intake_session_terminal_projection() from public, anon, authenticated;
