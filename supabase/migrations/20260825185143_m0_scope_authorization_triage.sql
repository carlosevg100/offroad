-- M0 adaptive intake: economic perimeter, advisor authority and deterministic route checks.
--
-- A platform organization is not necessarily the borrower. An advisor may prepare many cases for
-- companies that do not have an Offroad account, so the immutable stream identifies a case entity
-- separately from the tenant. The first operation command records the capital need, route,
-- economic perimeter, authority declaration when applicable, and the two day-zero route checks in
-- one transaction. Client request ladders remain fail-closed until that context exists.

alter table public.document_intake_sessions
  add column if not exists analysis_scope jsonb
    check (analysis_scope is null or jsonb_typeof(analysis_scope) = 'object'),
  add column if not exists advisor_authorization jsonb
    check (advisor_authorization is null or jsonb_typeof(advisor_authorization) = 'object'),
  add column if not exists route_checks jsonb not null default '{}'::jsonb
    check (jsonb_typeof(route_checks) = 'object');

comment on column public.document_intake_sessions.analysis_scope is
  'Current economic perimeter projection. The immutable analysis_scope_recorded events remain authoritative.';
comment on column public.document_intake_sessions.advisor_authorization is
  'Current advisor authority declaration. Declared is not documented or verified.';
comment on column public.document_intake_sessions.route_checks is
  'Latest projection per M0 route check. Review required is a desk flag, not a credit decision.';

create or replace function private.record_analysis_scope_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_entities jsonb,
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
  existing public.intake_domain_events;
  event_row public.intake_domain_events;
  scope_version integer;
  scope_base jsonb;
  scope_value jsonb;
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status in ('confirmed', 'cancelled') then
    raise exception 'intake_session_terminal' using errcode = '55000';
  end if;

  if p_event_id is null or jsonb_typeof(p_entities) <> 'array'
    or jsonb_array_length(p_entities) not between 1 and 25
    or char_length(trim(coalesce(p_reason, ''))) not between 1 and 1000
    or exists (
      select 1
      from jsonb_array_elements(p_entities) entity(value)
      where jsonb_typeof(entity.value) <> 'object'
        or char_length(trim(coalesce(entity.value ->> 'entityId', ''))) not between 1 and 200
        or char_length(trim(coalesce(entity.value ->> 'legalName', ''))) not between 2 and 240
        or entity.value ->> 'role' not in ('borrower', 'operating_company', 'guarantor', 'holding', 'target', 'other')
        or entity.value ->> 'source' not in ('member_organization', 'company_declaration', 'advisor_declaration')
        or entity.value ->> 'status' <> 'declared'
        or (
          session_row.journey = 'company'
          and entity.value ->> 'source' not in ('member_organization', 'company_declaration')
        )
        or (
          session_row.journey = 'originator'
          and entity.value ->> 'source' <> 'advisor_declaration'
        )
    )
    or (
      select count(*) from jsonb_array_elements(p_entities) entity(value)
      where entity.value ->> 'role' = 'borrower'
    ) <> 1
    or exists (
      select 1
      from jsonb_array_elements(p_entities) entity(value)
      group by entity.value ->> 'entityId'
      having count(*) > 1
    ) then
    raise exception 'intake_analysis_scope_invalid' using errcode = '22023';
  end if;

  scope_base := jsonb_build_object(
    'entities', p_entities,
    'reason', trim(p_reason)
  );

  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'analysis_scope_recorded'
      or existing.created_by is distinct from actor_id
      or (existing.payload -> 'scope') - 'version' is distinct from scope_base then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', existing.event_id, 'sequence', existing.sequence, 'replayed', true);
  end if;

  select count(*)::integer + 1 into scope_version
  from public.intake_domain_events event
  where event.organization_id = p_organization_id
    and event.intake_session_id = p_session_id
    and event.event_type = 'analysis_scope_recorded';

  scope_value := scope_base || jsonb_build_object('version', scope_version);
  update public.document_intake_sessions
  set analysis_scope = scope_value
  where organization_id = p_organization_id and id = p_session_id;

  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, 'analysis_scope_recorded',
    jsonb_build_object('scope', scope_value), occurred_at, actor_id
  );
  return jsonb_build_object('eventId', event_row.event_id, 'sequence', event_row.sequence, 'replayed', false);
end;
$$;

create or replace function private.record_advisor_authorization_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_client_entity_id text,
  p_authority_kind text,
  p_scopes text[],
  p_declaration_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  existing public.intake_domain_events;
  event_row public.intake_domain_events;
  authorization_version integer;
  authorization_base jsonb;
  authorization_value jsonb;
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status in ('confirmed', 'cancelled') then
    raise exception 'intake_session_terminal' using errcode = '55000';
  end if;
  if session_row.journey <> 'originator'
    or p_event_id is null
    or char_length(trim(coalesce(p_client_entity_id, ''))) not between 1 and 200
    or p_authority_kind not in (
      'engagement_letter', 'mandate', 'power_of_attorney',
      'board_resolution', 'company_confirmation', 'other'
    )
    or cardinality(coalesce(p_scopes, '{}'::text[])) not between 1 and 3
    or not (coalesce(p_scopes, '{}'::text[]) <@ array[
      'prepare_case', 'market_sounding', 'qualified_introduction'
    ]::text[])
    or char_length(coalesce(nullif(trim(p_declaration_reference), ''), '')) > 500
    or session_row.analysis_scope is null
    or not exists (
      select 1
      from jsonb_array_elements(session_row.analysis_scope -> 'entities') entity(value)
      where entity.value ->> 'entityId' = trim(p_client_entity_id)
        and entity.value ->> 'role' = 'borrower'
    ) then
    raise exception 'intake_advisor_authorization_invalid' using errcode = '22023';
  end if;

  authorization_base := jsonb_strip_nulls(jsonb_build_object(
    'advisorOrganizationId', p_organization_id,
    'clientEntityId', trim(p_client_entity_id),
    'authorityKind', p_authority_kind,
    'status', 'declared',
    'scopes', to_jsonb(p_scopes),
    'declarationReference', nullif(trim(coalesce(p_declaration_reference, '')), ''),
    'evidenceReferences', '[]'::jsonb
  ));

  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'advisor_authorization_recorded'
      or existing.created_by is distinct from actor_id
      or (existing.payload -> 'authorization') - 'version' is distinct from authorization_base then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', existing.event_id, 'sequence', existing.sequence, 'replayed', true);
  end if;

  select count(*)::integer + 1 into authorization_version
  from public.intake_domain_events event
  where event.organization_id = p_organization_id
    and event.intake_session_id = p_session_id
    and event.event_type = 'advisor_authorization_recorded';

  authorization_value := authorization_base || jsonb_build_object('version', authorization_version);
  update public.document_intake_sessions
  set advisor_authorization = authorization_value
  where organization_id = p_organization_id and id = p_session_id;

  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, 'advisor_authorization_recorded',
    jsonb_build_object('authorization', authorization_value), occurred_at, actor_id
  );
  return jsonb_build_object('eventId', event_row.event_id, 'sequence', event_row.sequence, 'replayed', false);
end;
$$;

create or replace function private.record_intake_route_check(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_check text,
  p_outcome text,
  p_rationale text,
  p_evidence_ids text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  existing public.intake_domain_events;
  event_row public.intake_domain_events;
  check_version integer;
  check_base jsonb;
  check_value jsonb;
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status in ('confirmed', 'cancelled') then
    raise exception 'intake_session_terminal' using errcode = '55000';
  end if;
  if p_event_id is null
    or p_check not in ('early_triage', 'urgency', 'disguised_liquidity', 'group_scope')
    or p_outcome not in ('clear', 'review_required', 'routed', 'declined')
    or char_length(trim(coalesce(p_rationale, ''))) not between 1 and 1000
    or exists (
      select 1 from unnest(coalesce(p_evidence_ids, '{}'::text[])) evidence_id
      where char_length(trim(evidence_id)) not between 1 and 300
    ) then
    raise exception 'intake_route_check_invalid' using errcode = '22023';
  end if;

  check_base := jsonb_build_object(
    'check', p_check,
    'outcome', p_outcome,
    'rationale', trim(p_rationale),
    'evidenceIds', to_jsonb(coalesce(p_evidence_ids, '{}'::text[]))
  );

  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'route_check_recorded'
      or existing.created_by is distinct from actor_id
      or (existing.payload -> 'routeCheck') - 'version' is distinct from check_base then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', existing.event_id, 'sequence', existing.sequence, 'replayed', true);
  end if;

  select count(*)::integer + 1 into check_version
  from public.intake_domain_events event
  where event.organization_id = p_organization_id
    and event.intake_session_id = p_session_id
    and event.event_type = 'route_check_recorded'
    and event.payload -> 'routeCheck' ->> 'check' = p_check;

  check_value := check_base || jsonb_build_object('version', check_version);
  update public.document_intake_sessions
  set route_checks = jsonb_set(coalesce(route_checks, '{}'::jsonb), array[p_check], check_value, true)
  where organization_id = p_organization_id and id = p_session_id;

  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, 'route_check_recorded',
    jsonb_build_object('routeCheck', check_value), occurred_at, actor_id
  );
  return jsonb_build_object('eventId', event_row.event_id, 'sequence', event_row.sequence, 'replayed', false);
end;
$$;

create or replace function private.set_intake_operation_context_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_frame_event_id uuid,
  p_route_event_id uuid,
  p_scope_event_id uuid,
  p_authorization_event_id uuid,
  p_early_triage_event_id uuid,
  p_group_scope_event_id uuid,
  p_archetype text,
  p_confidence text,
  p_rationale text,
  p_retest_triggers text[] default '{}',
  p_client_legal_name text default null,
  p_authority_kind text default null,
  p_authority_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
  organization_row public.organizations;
  entity_id text;
  legal_name text;
  source_kind text;
  event_ids uuid[];
  frame_result jsonb;
  route_result jsonb;
  scope_result jsonb;
  authorization_result jsonb;
  early_result jsonb;
  group_result jsonb;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  select * into organization_row
  from public.organizations organization_record
  where organization_record.id = p_organization_id;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;

  event_ids := array[
    p_frame_event_id, p_route_event_id, p_scope_event_id,
    p_early_triage_event_id, p_group_scope_event_id
  ];
  if session_row.journey = 'originator' then
    event_ids := event_ids || p_authorization_event_id;
  elsif p_authorization_event_id is not null or p_client_legal_name is not null
    or p_authority_kind is not null or p_authority_reference is not null then
    raise exception 'company_intake_cannot_declare_advisor_authority' using errcode = '22023';
  end if;
  if array_position(event_ids, null) is not null
    or cardinality(event_ids) <> (select count(distinct event_id) from unnest(event_ids) event_id) then
    raise exception 'intake_event_ids_must_be_distinct' using errcode = '22023';
  end if;

  if session_row.journey = 'originator' then
    legal_name := nullif(trim(coalesce(p_client_legal_name, '')), '');
    if legal_name is null or char_length(legal_name) > 240
      or p_authority_kind is null then
      raise exception 'advisor_client_context_required' using errcode = '22023';
    end if;
    entity_id := 'advisor-client:' || p_session_id::text || ':borrower';
    source_kind := 'advisor_declaration';
  else
    legal_name := coalesce(nullif(trim(organization_row.legal_name), ''), organization_row.name);
    entity_id := 'organization:' || p_organization_id::text;
    source_kind := 'member_organization';
  end if;

  frame_result := private.record_intake_capital_need_command(
    p_organization_id, p_session_id, p_frame_event_id, p_archetype
  );
  route_result := private.set_intake_archetype_command(
    p_organization_id, p_session_id, p_route_event_id, p_archetype,
    p_confidence, p_rationale, p_retest_triggers
  );
  scope_result := private.record_analysis_scope_command(
    p_organization_id, p_session_id, p_scope_event_id,
    jsonb_build_array(jsonb_build_object(
      'entityId', entity_id,
      'legalName', legal_name,
      'role', 'borrower',
      'source', source_kind,
      'status', 'declared'
    )),
    case
      when session_row.journey = 'originator'
        then 'Primary borrower declared by the authorized advisor for this case.'
      else 'The member organization is the primary borrower initially declared for this case.'
    end
  );

  if session_row.journey = 'originator' then
    authorization_result := private.record_advisor_authorization_command(
      p_organization_id, p_session_id, p_authorization_event_id, entity_id,
      p_authority_kind, array['prepare_case']::text[], p_authority_reference
    );
  end if;

  early_result := private.record_intake_route_check(
    p_organization_id, p_session_id, p_early_triage_event_id,
    'early_triage', 'clear',
    case
      when session_row.journey = 'originator'
        then 'Capital purpose, primary borrower and advisor authority declaration are present.'
      else 'Capital purpose and primary borrower are present.'
    end,
    array['event:' || p_frame_event_id::text, 'event:' || p_scope_event_id::text]
  );
  group_result := private.record_intake_route_check(
    p_organization_id, p_session_id, p_group_scope_event_id,
    'group_scope', 'review_required',
    'Only the primary borrower is declared at day zero. Related entities, guarantors and targets remain subject to document review.',
    array['event:' || p_scope_event_id::text]
  );

  return jsonb_strip_nulls(jsonb_build_object(
    'frame', frame_result,
    'route', route_result,
    'scope', scope_result,
    'authorization', authorization_result,
    'earlyTriage', early_result,
    'groupScope', group_result
  ));
end;
$$;

create or replace function public.set_intake_operation_context_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_frame_event_id uuid,
  p_route_event_id uuid,
  p_scope_event_id uuid,
  p_authorization_event_id uuid,
  p_early_triage_event_id uuid,
  p_group_scope_event_id uuid,
  p_archetype text,
  p_confidence text,
  p_rationale text,
  p_retest_triggers text[] default '{}',
  p_client_legal_name text default null,
  p_authority_kind text default null,
  p_authority_reference text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_intake_operation_context_command(
    p_organization_id, p_session_id, p_frame_event_id, p_route_event_id,
    p_scope_event_id, p_authorization_event_id, p_early_triage_event_id,
    p_group_scope_event_id, p_archetype, p_confidence, p_rationale,
    p_retest_triggers, p_client_legal_name, p_authority_kind, p_authority_reference
  );
$$;

-- These projections are derived only by the commands above. New columns were excluded from the
-- existing column-level update grant by default; the explicit revocation documents that boundary.
revoke update (analysis_scope, advisor_authorization, route_checks)
  on table public.document_intake_sessions from authenticated;

revoke all on function private.record_analysis_scope_command(uuid, uuid, uuid, jsonb, text)
  from public, anon, authenticated;
revoke all on function private.record_advisor_authorization_command(uuid, uuid, uuid, text, text, text[], text)
  from public, anon, authenticated;
revoke all on function private.record_intake_route_check(uuid, uuid, uuid, text, text, text, text[])
  from public, anon, authenticated;
revoke all on function private.set_intake_operation_context_command(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text[], text, text, text
) from public, anon, authenticated;
revoke all on function public.set_intake_operation_context_command(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text[], text, text, text
) from public, anon;

grant execute on function private.record_analysis_scope_command(uuid, uuid, uuid, jsonb, text)
  to authenticated;
grant execute on function private.record_advisor_authorization_command(uuid, uuid, uuid, text, text, text[], text)
  to authenticated;
grant execute on function private.record_intake_route_check(uuid, uuid, uuid, text, text, text, text[])
  to authenticated;
grant execute on function private.set_intake_operation_context_command(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text[], text, text, text
) to authenticated;
grant execute on function public.set_intake_operation_context_command(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text[], text, text, text
) to authenticated;

-- The previous entry point can create a routed case without an economic perimeter. Keep the
-- implementation available only to the new composite command and remove the public bypass.
revoke all on function public.set_intake_operation_command(uuid, uuid, uuid, uuid, text, text, text, text[])
  from authenticated;

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
    or new.advisor_authorization is distinct from old.advisor_authorization
    or new.route_checks is distinct from old.route_checks
  ) then
    raise exception 'intake_session_terminal' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_intake_session_terminal_projection()
  from public, anon, authenticated;

