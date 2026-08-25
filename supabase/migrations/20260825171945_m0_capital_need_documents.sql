-- M0 adaptive intake: capital-need and document lifecycle commands.
--
-- The event stream becomes the write boundary for the complete deal brief and for every intake
-- document transition. Browser uploads still send bytes directly to the private bucket, but the
-- database receipt and immutable event are one transaction. The worker takes the session lock
-- before the document lock, the same order as removal, so classification and removal cannot
-- deadlock or leave the replay stream out of sync with the projections.

alter table public.document_intake_sessions
  add column if not exists capital_objective text,
  add column if not exists capital_currency text
    check (capital_currency is null or capital_currency in ('BRL', 'USD', 'EUR')),
  add column if not exists capital_urgency text
    check (capital_urgency is null or capital_urgency in ('up_to_3_months', '3_to_6_months', '6_to_12_months', 'no_rush')),
  add column if not exists capital_consequence text;

comment on column public.document_intake_sessions.capital_objective is
  'What the company intends to execute with the requested capital, in its own words.';
comment on column public.document_intake_sessions.capital_currency is
  'Currency of requested_amount. Null means the company has not declared it yet.';
comment on column public.document_intake_sessions.capital_urgency is
  'Declared timing need. It is an intake fact, not an underwriting conclusion.';
comment on column public.document_intake_sessions.capital_consequence is
  'Why the plan matters and what changes if it is not executed, in the company''s own words.';

alter table public.intake_domain_events
  drop constraint if exists intake_domain_events_event_type_check;
alter table public.intake_domain_events
  add constraint intake_domain_events_event_type_check check (event_type in (
    'capital_need_declared', 'archetype_routed', 'document_received',
    'document_classified', 'document_removed', 'information_answered',
    'information_cleared', 'absence_recorded', 'request_ladder_recorded',
    'analysis_scope_recorded', 'advisor_authorization_recorded', 'route_check_recorded'
  ));

-- The append primitive assumes its caller has already authorized the command. It still validates
-- the authenticated actor and locks the session itself. This permits the capability-authorized
-- worker to append a classification without pretending to be a tenant member, while every
-- tenant command continues to call private.intake_session_for_update first.
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
    'analysis_scope_recorded', 'advisor_authorization_recorded', 'route_check_recorded'
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
  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;

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
  where event.organization_id = p_organization_id
    and event.intake_session_id = p_session_id;

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

create or replace function private.record_intake_capital_need_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_use_of_proceeds text,
  p_objective text default null,
  p_requested_amount numeric default null,
  p_currency text default null,
  p_urgency text default null,
  p_requested_term_months integer default null,
  p_requested_grace_months integer default null,
  p_consequence text default null,
  p_sector text default null,
  p_geography text default null,
  p_instruments text[] default '{}',
  p_collateral_kinds text[] default '{}',
  p_expected_rate text default null
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
  frame_version integer;
  actor_role text;
  frame jsonb;
  event_payload jsonb;
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status in ('confirmed', 'cancelled') then
    raise exception 'intake_session_terminal' using errcode = '55000';
  end if;
  if p_use_of_proceeds is null or p_use_of_proceeds not in (
    'working_capital', 'growth_expansion', 'acquisition', 'refinance',
    'equipment_finance', 'venture_debt', 'other'
  ) or p_requested_amount is not null and p_requested_amount <= 0
    or p_currency is not null and p_currency not in ('BRL', 'USD', 'EUR')
    or p_urgency is not null and p_urgency not in ('up_to_3_months', '3_to_6_months', '6_to_12_months', 'no_rush')
    or p_requested_term_months is not null and p_requested_term_months not between 1 and 360
    or p_requested_grace_months is not null and p_requested_grace_months not between 0 and 120
    or p_requested_grace_months is not null and p_requested_term_months is not null
      and p_requested_grace_months >= p_requested_term_months
    or p_geography is not null and trim(p_geography) !~ '^[A-Z]{2}$'
    or char_length(coalesce(nullif(trim(p_objective), ''), '')) > 4000
    or char_length(coalesce(nullif(trim(p_consequence), ''), '')) > 4000
    or char_length(coalesce(nullif(trim(p_sector), ''), '')) > 120
    or char_length(coalesce(nullif(trim(p_expected_rate), ''), '')) > 80
    or not (coalesce(p_instruments, '{}'::text[]) <@ array[
      'debenture', 'nota_comercial', 'ccb', 'cri', 'cra', 'fidc',
      'direct_loan', 'receivables_purchase', 'project_finance', 'equity_kicker_debt'
    ]::text[])
    or not (coalesce(p_collateral_kinds, '{}'::text[]) <@ array[
      'recebiveis', 'imovel', 'equipamento', 'estoque', 'aval_fianca',
      'cessao_fiduciaria', 'alienacao_fiduciaria_quotas', 'conta_reserva', 'quirografario'
    ]::text[]) then
    raise exception 'intake_capital_need_command_invalid' using errcode = '22023';
  end if;

  actor_role := case when session_row.journey = 'originator' then 'advisor' else 'company' end;

  frame := jsonb_strip_nulls(jsonb_build_object(
    'useOfProceeds', p_use_of_proceeds,
    'objective', nullif(trim(coalesce(p_objective, '')), ''),
    'requestedAmount', case when p_requested_amount is null then null else p_requested_amount::text end,
    'currency', p_currency,
    'urgency', p_urgency,
    'requestedTermMonths', p_requested_term_months,
    'requestedGraceMonths', p_requested_grace_months,
    'consequenceIfNotExecuted', nullif(trim(coalesce(p_consequence, '')), ''),
    'sector', nullif(trim(coalesce(p_sector, '')), ''),
    'geography', nullif(trim(coalesce(p_geography, '')), ''),
    'instrumentPreferences', to_jsonb(coalesce(p_instruments, '{}'::text[])),
    'availableCollateral', to_jsonb(coalesce(p_collateral_kinds, '{}'::text[])),
    'expectedRate', nullif(trim(coalesce(p_expected_rate, '')), ''),
    'declaredBy', jsonb_build_object('actorId', actor_id, 'role', actor_role)
  ));

  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'capital_need_declared'
      or existing.created_by is distinct from actor_id
      or (existing.payload -> 'frame') - 'version' is distinct from frame then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', existing.event_id, 'sequence', existing.sequence, 'replayed', true);
  end if;

  select count(*)::integer + 1 into frame_version
  from public.intake_domain_events event
  where event.organization_id = p_organization_id
    and event.intake_session_id = p_session_id
    and event.event_type = 'capital_need_declared';

  frame := frame || jsonb_build_object('version', frame_version);
  event_payload := jsonb_build_object('frame', frame);

  update public.document_intake_sessions
  set capital_objective = nullif(trim(coalesce(p_objective, '')), ''),
      requested_amount = p_requested_amount,
      capital_currency = p_currency,
      capital_urgency = p_urgency,
      requested_term_months = p_requested_term_months,
      requested_grace_months = p_requested_grace_months,
      capital_consequence = nullif(trim(coalesce(p_consequence, '')), ''),
      sector = nullif(trim(coalesce(p_sector, '')), ''),
      geography = nullif(trim(coalesce(p_geography, '')), ''),
      instruments = case when cardinality(coalesce(p_instruments, '{}'::text[])) = 0 then null else p_instruments end,
      collateral_kinds = case when cardinality(coalesce(p_collateral_kinds, '{}'::text[])) = 0 then null else p_collateral_kinds end,
      expected_rate = nullif(trim(coalesce(p_expected_rate, '')), '')
  where organization_id = p_organization_id and id = p_session_id;

  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, 'capital_need_declared',
    event_payload, occurred_at, actor_id
  );
  return jsonb_build_object('eventId', event_row.event_id, 'sequence', event_row.sequence, 'replayed', false);
end;
$$;

create or replace function public.record_intake_capital_need_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_use_of_proceeds text,
  p_objective text default null,
  p_requested_amount numeric default null,
  p_currency text default null,
  p_urgency text default null,
  p_requested_term_months integer default null,
  p_requested_grace_months integer default null,
  p_consequence text default null,
  p_sector text default null,
  p_geography text default null,
  p_instruments text[] default '{}',
  p_collateral_kinds text[] default '{}',
  p_expected_rate text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.record_intake_capital_need_command(
    p_organization_id, p_session_id, p_event_id, p_use_of_proceeds, p_objective,
    p_requested_amount, p_currency, p_urgency, p_requested_term_months,
    p_requested_grace_months, p_consequence, p_sector, p_geography,
    p_instruments, p_collateral_kinds, p_expected_rate
  );
$$;

-- The first click records both the minimum capital need and its route. One transaction means a
-- route can never exist without the frame the deterministic replay requires.
create or replace function private.set_intake_operation_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_frame_event_id uuid,
  p_route_event_id uuid,
  p_archetype text,
  p_confidence text,
  p_rationale text,
  p_retest_triggers text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  frame_result jsonb;
  route_result jsonb;
begin
  if p_frame_event_id = p_route_event_id then
    raise exception 'intake_event_ids_must_be_distinct' using errcode = '22023';
  end if;
  frame_result := private.record_intake_capital_need_command(
    p_organization_id, p_session_id, p_frame_event_id, p_archetype
  );
  route_result := private.set_intake_archetype_command(
    p_organization_id, p_session_id, p_route_event_id, p_archetype,
    p_confidence, p_rationale, p_retest_triggers
  );
  return jsonb_build_object('frame', frame_result, 'route', route_result);
end;
$$;

create or replace function public.set_intake_operation_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_frame_event_id uuid,
  p_route_event_id uuid,
  p_archetype text,
  p_confidence text,
  p_rationale text,
  p_retest_triggers text[] default '{}'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_intake_operation_command(
    p_organization_id, p_session_id, p_frame_event_id, p_route_event_id,
    p_archetype, p_confidence, p_rationale, p_retest_triggers
  );
$$;

create or replace function private.register_intake_document_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_document_id uuid,
  p_bucket_id text,
  p_object_path text,
  p_original_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_sha256 text
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
  document_row public.source_documents;
  document_payload jsonb;
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status not in ('collecting', 'failed') then
    raise exception 'intake_session_not_collecting' using errcode = '55000';
  end if;
  if p_event_id is null or p_document_id is null
    or p_bucket_id <> 'opportunity-documents'
    or char_length(trim(coalesce(p_original_name, ''))) not between 1 and 500
    or char_length(trim(coalesce(p_object_path, ''))) not between 1 and 1024
    or p_object_path not like p_organization_id::text || '/' || p_session_id::text || '/%'
    or p_byte_size not between 1 and 52428800
    or p_sha256 !~ '^[a-f0-9]{64}$'
    or char_length(coalesce(nullif(trim(p_mime_type), ''), '')) > 255 then
    raise exception 'intake_document_command_invalid' using errcode = '22023';
  end if;

  document_payload := jsonb_strip_nulls(jsonb_build_object(
    'id', p_document_id,
    'originalName', trim(p_original_name),
    'objectPath', p_object_path,
    'sha256', p_sha256,
    'byteSize', p_byte_size,
    'mimeType', nullif(trim(coalesce(p_mime_type, '')), '')
  ));

  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'document_received'
      or existing.payload is distinct from jsonb_build_object('document', document_payload, 'actorId', actor_id) then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'id', p_document_id,
      'original_name', existing.payload -> 'document' ->> 'originalName',
      'byte_size', (existing.payload -> 'document' ->> 'byteSize')::bigint,
      'replayed', true
    );
  end if;

  insert into public.source_documents (
    id, organization_id, opportunity_id, intake_session_id, bucket_id, object_path,
    original_name, mime_type, byte_size, sha256, created_by
  ) values (
    p_document_id, p_organization_id, null, p_session_id, p_bucket_id, p_object_path,
    trim(p_original_name), nullif(trim(coalesce(p_mime_type, '')), ''), p_byte_size,
    p_sha256, actor_id
  ) returning * into document_row;

  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, 'document_received',
    jsonb_build_object('document', document_payload, 'actorId', actor_id),
    occurred_at, actor_id
  );

  return jsonb_build_object(
    'id', document_row.id,
    'original_name', document_row.original_name,
    'byte_size', document_row.byte_size,
    'event_id', event_row.event_id,
    'replayed', false
  );
end;
$$;

create or replace function public.register_intake_document_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_document_id uuid,
  p_bucket_id text,
  p_object_path text,
  p_original_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_sha256 text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.register_intake_document_command(
    p_organization_id, p_session_id, p_event_id, p_document_id, p_bucket_id,
    p_object_path, p_original_name, p_mime_type, p_byte_size, p_sha256
  );
$$;

create or replace function private.remove_intake_document_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_document_id uuid
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
  document_row public.source_documents;
  receipt_path text;
  event_payload jsonb;
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status not in ('collecting', 'failed') then
    raise exception 'document_not_removable' using errcode = '55000';
  end if;

  event_payload := jsonb_build_object('documentId', p_document_id, 'actorId', actor_id);
  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'document_removed'
      or existing.payload is distinct from event_payload then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    select received.payload -> 'document' ->> 'objectPath' into receipt_path
    from public.intake_domain_events received
    where received.organization_id = p_organization_id
      and received.intake_session_id = p_session_id
      and received.event_type = 'document_received'
      and received.payload -> 'document' ->> 'id' = p_document_id::text
    order by received.sequence desc
    limit 1;
    return jsonb_build_object('id', p_document_id, 'object_path', receipt_path, 'replayed', true);
  end if;

  select * into document_row
  from public.source_documents document
  where document.organization_id = p_organization_id
    and document.intake_session_id = p_session_id
    and document.opportunity_id is null
    and document.id = p_document_id
  for update;
  if not found then
    raise exception 'document_not_removable' using errcode = 'P0002';
  end if;

  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, 'document_removed',
    event_payload, occurred_at, actor_id
  );

  delete from public.source_documents
  where organization_id = p_organization_id
    and intake_session_id = p_session_id
    and id = p_document_id;

  return jsonb_build_object(
    'id', p_document_id,
    'object_path', document_row.object_path,
    'event_id', event_row.event_id,
    'replayed', false
  );
end;
$$;

create or replace function public.remove_intake_document_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_document_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.remove_intake_document_command(
    p_organization_id, p_session_id, p_event_id, p_document_id
  );
$$;

-- Worker result with session-before-document lock ordering and an atomic classification event.
create or replace function private.worker_record_document_result(
  p_job_id uuid,
  p_capability_token text,
  p_scan_result jsonb,
  p_profile jsonb,
  p_layer jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  document_row public.source_documents;
  profile_id uuid;
  layer_id uuid;
  prior_kind text;
  next_kind text;
  classification_version integer;
  classification_event public.intake_domain_events;
begin
  if job_row.source_document_id is null then
    raise exception 'job_has_no_document' using errcode = '22023';
  end if;

  select * into document_row
  from public.source_documents document
  where document.organization_id = job_row.organization_id and document.id = job_row.source_document_id;
  if not found then
    raise exception 'source_document_not_found' using errcode = 'P0002';
  end if;

  if document_row.intake_session_id is not null then
    perform 1
    from public.document_intake_sessions session
    where session.organization_id = job_row.organization_id
      and session.id = document_row.intake_session_id
    for update;
    if not found then
      raise exception 'intake_session_not_found' using errcode = 'P0002';
    end if;
  end if;

  select * into document_row
  from public.source_documents document
  where document.organization_id = job_row.organization_id and document.id = job_row.source_document_id
  for update;

  if not found then
    raise exception 'source_document_not_found' using errcode = 'P0002';
  end if;

  if p_scan_result is not null then
    update public.source_documents
    set scan_result = p_scan_result,
        processing_status = case
          when coalesce(p_scan_result->>'verdict', 'clean') = 'clean' then 'processing'
          else 'rejected'
        end
    where organization_id = job_row.organization_id and id = document_row.id;
  end if;

  if p_layer is not null then
    insert into public.document_layers (
      organization_id, source_document_id, document_version, processing_run_id, layer_kind,
      object_path, sha256, byte_size, parser_versions, stats, status
    )
    values (
      job_row.organization_id, document_row.id, document_row.document_version, job_row.processing_run_id,
      p_layer->>'layer_kind', p_layer->>'object_path', p_layer->>'sha256',
      (p_layer->>'byte_size')::bigint,
      coalesce(p_layer->'parser_versions', '{}'::jsonb), coalesce(p_layer->'stats', '{}'::jsonb),
      coalesce(p_layer->>'status', 'ready')
    )
    on conflict (organization_id, source_document_id, document_version) do update
    set processing_run_id = excluded.processing_run_id,
        layer_kind = excluded.layer_kind,
        object_path = excluded.object_path,
        sha256 = excluded.sha256,
        byte_size = excluded.byte_size,
        parser_versions = excluded.parser_versions,
        stats = excluded.stats,
        status = excluded.status
    returning id into layer_id;
  end if;

  if p_profile is not null then
    select profile.document_kind into prior_kind
    from public.document_profiles profile
    where profile.organization_id = job_row.organization_id
      and profile.source_document_id = document_row.id
      and profile.document_version = document_row.document_version;

    insert into public.document_profiles as dp (
      organization_id, source_document_id, document_version, processing_run_id, document_kind,
      title, entity_name, entity_role, entity_scope, period_start, period_end, fiscal_year,
      currency, scale, accounting_basis, information_class, evidence_rank, language,
      quality, summary, suggested_folder, suggested_name, classifier, confidence
    )
    values (
      job_row.organization_id, document_row.id, document_row.document_version, job_row.processing_run_id,
      p_profile->>'document_kind', p_profile->>'title', p_profile->>'entity_name',
      p_profile->>'entity_role', p_profile->>'entity_scope',
      (p_profile->>'period_start')::date, (p_profile->>'period_end')::date,
      (p_profile->>'fiscal_year')::integer, p_profile->>'currency', (p_profile->>'scale')::numeric,
      p_profile->>'accounting_basis', p_profile->>'information_class',
      (p_profile->>'evidence_rank')::smallint, p_profile->>'language',
      coalesce(p_profile->'quality', '{}'::jsonb), coalesce(p_profile->'summary', '{}'::jsonb),
      p_profile->>'suggested_folder', p_profile->>'suggested_name',
      coalesce(p_profile->'classifier', '{}'::jsonb), (p_profile->>'confidence')::numeric
    )
    on conflict (organization_id, source_document_id, document_version) do update
    set processing_run_id = excluded.processing_run_id,
        document_kind = excluded.document_kind,
        title = excluded.title,
        entity_name = excluded.entity_name,
        entity_role = excluded.entity_role,
        entity_scope = excluded.entity_scope,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        fiscal_year = excluded.fiscal_year,
        currency = excluded.currency,
        scale = excluded.scale,
        accounting_basis = excluded.accounting_basis,
        information_class = excluded.information_class,
        evidence_rank = excluded.evidence_rank,
        language = excluded.language,
        quality = excluded.quality,
        summary = excluded.summary,
        suggested_folder = excluded.suggested_folder,
        suggested_name = excluded.suggested_name,
        classifier = excluded.classifier,
        confidence = excluded.confidence
    where dp.review_state = 'proposed'
    returning dp.id, dp.document_kind into profile_id, next_kind;

    if profile_id is not null
      and document_row.intake_session_id is not null
      and next_kind is distinct from prior_kind then
      select count(*)::integer + 1 into classification_version
      from public.intake_domain_events event
      where event.organization_id = job_row.organization_id
        and event.intake_session_id = document_row.intake_session_id
        and event.event_type = 'document_classified'
        and event.payload -> 'document' ->> 'id' = document_row.id::text;

      classification_event := private.append_intake_domain_event(
        job_row.organization_id,
        document_row.intake_session_id,
        gen_random_uuid(),
        'document_classified',
        jsonb_build_object(
          'document', jsonb_build_object('id', document_row.id, 'kind', next_kind),
          'classificationVersion', classification_version
        ),
        clock_timestamp(),
        (select auth.uid())
      );
    end if;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'profile_id', profile_id,
    'layer_id', layer_id,
    'classification_event_id', classification_event.event_id
  ));
end;
$$;

-- Current projections are command-written. Opportunity-scoped documents retain their direct
-- upload policy; intake-session rows can only be inserted by register_intake_document_command.
drop policy if exists source_documents_insert on public.source_documents;
create policy source_documents_insert on public.source_documents
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and opportunity_id is not null
    and intake_session_id is null
    and (select private.can_access_opportunity(organization_id, opportunity_id, 'document.upload'))
  );

drop policy if exists source_documents_delete on public.source_documents;
revoke delete on table public.source_documents from authenticated;

revoke update (
  archetype, capital_objective, capital_currency, capital_urgency, capital_consequence,
  requested_amount, requested_grace_months, requested_term_months, sector, geography,
  instruments, collateral_kinds, expected_rate
) on table public.document_intake_sessions from authenticated;

-- The old archetype-only API can create an unreplayable stream. Keep its implementation private
-- for the composite command, but remove the public route from the authenticated surface.
revoke all on function public.set_intake_archetype_command(uuid, uuid, uuid, text, text, text, text[])
  from authenticated;
revoke all on function private.set_intake_archetype_command(uuid, uuid, uuid, text, text, text, text[])
  from authenticated;

revoke all on function private.record_intake_capital_need_command(
  uuid, uuid, uuid, text, text, numeric, text, text, integer, integer, text, text, text, text[], text[], text
) from public, anon, authenticated;
revoke all on function public.record_intake_capital_need_command(
  uuid, uuid, uuid, text, text, numeric, text, text, integer, integer, text, text, text, text[], text[], text
) from public, anon;
grant execute on function private.record_intake_capital_need_command(
  uuid, uuid, uuid, text, text, numeric, text, text, integer, integer, text, text, text, text[], text[], text
) to authenticated;
grant execute on function public.record_intake_capital_need_command(
  uuid, uuid, uuid, text, text, numeric, text, text, integer, integer, text, text, text, text[], text[], text
) to authenticated;

revoke all on function private.set_intake_operation_command(uuid, uuid, uuid, uuid, text, text, text, text[])
  from public, anon, authenticated;
revoke all on function public.set_intake_operation_command(uuid, uuid, uuid, uuid, text, text, text, text[])
  from public, anon;
grant execute on function private.set_intake_operation_command(uuid, uuid, uuid, uuid, text, text, text, text[])
  to authenticated;
grant execute on function public.set_intake_operation_command(uuid, uuid, uuid, uuid, text, text, text, text[])
  to authenticated;

revoke all on function private.register_intake_document_command(
  uuid, uuid, uuid, uuid, text, text, text, text, bigint, text
) from public, anon, authenticated;
revoke all on function public.register_intake_document_command(
  uuid, uuid, uuid, uuid, text, text, text, text, bigint, text
) from public, anon;
grant execute on function private.register_intake_document_command(
  uuid, uuid, uuid, uuid, text, text, text, text, bigint, text
) to authenticated;
grant execute on function public.register_intake_document_command(
  uuid, uuid, uuid, uuid, text, text, text, text, bigint, text
) to authenticated;

revoke all on function private.remove_intake_document_command(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.remove_intake_document_command(uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function private.remove_intake_document_command(uuid, uuid, uuid, uuid)
  to authenticated;
grant execute on function public.remove_intake_document_command(uuid, uuid, uuid, uuid)
  to authenticated;

-- Re-state the worker ACL after replacing the private implementation.
revoke all on function private.worker_record_document_result(uuid, text, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function private.worker_record_document_result(uuid, text, jsonb, jsonb, jsonb)
  to authenticated;

-- Terminal sessions cannot be changed through an accidental future write path either.
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
  ) then
    raise exception 'intake_session_terminal' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_intake_session_terminal_projection()
  from public, anon, authenticated;

drop trigger if exists document_intake_sessions_guard_terminal_archetype
  on public.document_intake_sessions;
drop trigger if exists document_intake_sessions_guard_terminal_capital_need
  on public.document_intake_sessions;
create trigger document_intake_sessions_guard_terminal_capital_need
  before update of
    archetype, capital_objective, capital_currency, capital_urgency, capital_consequence,
    requested_amount, requested_grace_months, requested_term_months, sector, geography,
    instruments, collateral_kinds, expected_rate
  on public.document_intake_sessions
  for each row execute function private.guard_intake_session_terminal_projection();

comment on function private.record_intake_capital_need_command(
  uuid, uuid, uuid, text, text, numeric, text, text, integer, integer, text, text, text, text[], text[], text
) is 'Atomically records a complete capital-need snapshot and updates its session projection.';
comment on function private.register_intake_document_command(
  uuid, uuid, uuid, uuid, text, text, text, text, bigint, text
) is 'Registers one session document and its immutable receipt in the same transaction.';
comment on function private.remove_intake_document_command(uuid, uuid, uuid, uuid) is
  'Records removal and deletes the session document atomically, with session-before-document lock ordering.';
