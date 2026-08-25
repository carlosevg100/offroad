-- M0 adaptive intake, persistence boundary.
--
-- The mutable session and answer rows remain query-efficient projections while every user
-- command is recorded as an immutable domain event in the same transaction. The ledger is
-- tenant-readable and command-written: browser roles cannot insert, update or delete rows.
-- Event deletion is allowed only as part of deleting the parent intake session, preserving the
-- product's account-erasure path without permitting history rewriting inside a live case.

create table public.intake_domain_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  organization_id uuid not null,
  intake_session_id uuid not null,
  sequence bigint not null check (sequence > 0),
  event_type text not null check (event_type in (
    'capital_need_declared', 'archetype_routed', 'document_classified', 'document_removed',
    'information_answered', 'information_cleared', 'absence_recorded',
    'request_ladder_recorded', 'analysis_scope_recorded',
    'advisor_authorization_recorded', 'route_check_recorded'
  )),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_version integer not null default 1 check (payload_version > 0),
  event_hash text not null check (event_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  unique (organization_id, event_id),
  unique (organization_id, intake_session_id, sequence),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade
);

create index intake_domain_events_session_time_idx
  on public.intake_domain_events (organization_id, intake_session_id, sequence, occurred_at);
create index intake_domain_events_actor_idx
  on public.intake_domain_events (created_by, recorded_at desc);

comment on table public.intake_domain_events is
  'Append-only history of adaptive-intake decisions. Mutable tables are current projections; this ledger is the replay and audit source. Rows disappear only when the parent intake session is erased.';
comment on column public.intake_domain_events.event_id is
  'Caller-generated UUID idempotency key. Retrying the same command returns the original event; reusing it with different content fails closed.';
comment on column public.intake_domain_events.event_hash is
  'SHA-256 of the case scope, sequence, type, version, occurred_at and canonical jsonb payload.';

alter table public.intake_domain_events enable row level security;
alter table public.intake_domain_events force row level security;

create policy intake_domain_events_select on public.intake_domain_events
  for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

revoke all on table public.intake_domain_events from public, anon, authenticated;
grant select on table public.intake_domain_events to authenticated;

-- UPDATE is impossible even for an accidentally over-privileged application role. DELETE is
-- withheld through ACL/RLS but not trigger-blocked, because the parent session's controlled
-- erasure must be able to cascade.
create or replace function private.reject_intake_event_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'intake_domain_event_immutable' using errcode = '55000';
end;
$$;

revoke all on function private.reject_intake_event_update() from public, anon, authenticated;

create trigger intake_domain_events_reject_update
  before update on public.intake_domain_events
  for each row execute function private.reject_intake_event_update();

-- The only insertion primitive. It holds the session lock while allocating the next sequence,
-- so concurrent commands cannot fork the stream. It is deliberately private and is reached only
-- through typed commands below; the browser never submits an arbitrary event payload.
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
  session_row public.document_intake_sessions;
  existing public.intake_domain_events;
  next_sequence bigint;
  result public.intake_domain_events;
  digest_input text;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if p_actor_id is null or p_actor_id is distinct from (select auth.uid()) then
    raise exception 'intake_event_actor_invalid' using errcode = '42501';
  end if;
  if p_event_id is null or p_event_type is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'intake_event_contract_invalid' using errcode = '22023';
  end if;
  if p_event_type not in (
    'capital_need_declared', 'archetype_routed', 'document_classified', 'document_removed',
    'information_answered', 'information_cleared', 'absence_recorded',
    'request_ladder_recorded', 'analysis_scope_recorded',
    'advisor_authorization_recorded', 'route_check_recorded'
  ) then
    raise exception 'intake_event_type_invalid' using errcode = '22023';
  end if;
  if p_occurred_at is null or p_occurred_at > now() + interval '5 minutes' then
    raise exception 'intake_event_time_invalid' using errcode = '22023';
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

-- Archetype changes and their event are one transaction. The route version is allocated from
-- the ledger, never trusted from the client.
create or replace function private.set_intake_archetype_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
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
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  existing public.intake_domain_events;
  event_row public.intake_domain_events;
  route_version integer;
  route_payload jsonb;
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if p_archetype not in (
    'working_capital', 'growth_expansion', 'acquisition', 'refinance',
    'equipment_finance', 'venture_debt', 'other'
  ) or p_confidence not in ('high', 'medium', 'low')
    or char_length(trim(coalesce(p_rationale, ''))) < 10
    or exists (select 1 from unnest(coalesce(p_retest_triggers, '{}'::text[])) trigger_text where char_length(trim(trigger_text)) = 0) then
    raise exception 'intake_archetype_command_invalid' using errcode = '22023';
  end if;

  select * into existing from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'archetype_routed'
      or existing.payload -> 'route' ->> 'archetypeId' is distinct from p_archetype
      or existing.payload -> 'route' ->> 'confidence' is distinct from p_confidence
      or existing.payload -> 'route' ->> 'rationale' is distinct from trim(p_rationale)
      or existing.payload -> 'route' -> 'retestTriggers' is distinct from to_jsonb(coalesce(p_retest_triggers, '{}'::text[])) then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', existing.event_id, 'sequence', existing.sequence, 'replayed', true);
  end if;

  select count(*)::integer + 1 into route_version
  from public.intake_domain_events event
  where event.organization_id = p_organization_id
    and event.intake_session_id = p_session_id
    and event.event_type = 'archetype_routed';

  route_payload := jsonb_build_object('route', jsonb_build_object(
    'archetypeId', p_archetype,
    'confidence', p_confidence,
    'rationale', trim(p_rationale),
    'retestTriggers', to_jsonb(coalesce(p_retest_triggers, '{}'::text[])),
    'version', route_version
  ));

  update public.document_intake_sessions
  set archetype = p_archetype
  where organization_id = p_organization_id and id = p_session_id;

  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, 'archetype_routed',
    route_payload, occurred_at, actor_id
  );
  return jsonb_build_object('eventId', event_row.event_id, 'sequence', event_row.sequence, 'replayed', false);
end;
$$;

create or replace function public.set_intake_archetype_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
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
  select private.set_intake_archetype_command(
    p_organization_id, p_session_id, p_event_id, p_archetype,
    p_confidence, p_rationale, p_retest_triggers
  );
$$;

-- Information answers keep the query table and the event stream synchronized. Clearing is an
-- event, not erasure: replay can explain why a previously supplied answer is no longer current.
create or replace function private.record_intake_information_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_requirement_id text,
  p_answer text default null,
  p_response text default 'provided',
  p_note text default null
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
  event_type text;
  event_payload jsonb;
  normalized_answer text := nullif(trim(coalesce(p_answer, '')), '');
  normalized_note text := nullif(trim(coalesce(p_note, '')), '');
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if char_length(trim(coalesce(p_requirement_id, ''))) not between 1 and 100
    or p_response not in ('provided', 'partial', 'not_applicable', 'after_nda', 'unavailable')
    or char_length(coalesce(normalized_answer, '')) > 4000 then
    raise exception 'intake_information_command_invalid' using errcode = '22023';
  end if;

  if normalized_answer is null and normalized_note is null then
    event_type := 'information_cleared';
    event_payload := jsonb_build_object(
      'requirementId', trim(p_requirement_id),
      'actorId', actor_id
    );
  elsif p_response in ('provided', 'partial') and normalized_answer is not null then
    event_type := 'information_answered';
    event_payload := jsonb_strip_nulls(jsonb_build_object(
      'requirementId', trim(p_requirement_id),
      'answer', normalized_answer,
      'response', p_response,
      'note', normalized_note,
      'actorId', actor_id
    ));
  elsif p_response = 'partial' and normalized_note is not null then
    event_type := 'absence_recorded';
    event_payload := jsonb_build_object(
      'requirementId', trim(p_requirement_id),
      'response', p_response,
      'note', normalized_note,
      'actorId', actor_id
    );
  elsif p_response in ('not_applicable', 'after_nda', 'unavailable')
    and normalized_answer is null and normalized_note is not null then
    event_type := 'absence_recorded';
    event_payload := jsonb_build_object(
      'requirementId', trim(p_requirement_id),
      'response', p_response,
      'note', normalized_note,
      'actorId', actor_id
    );
  else
    raise exception 'intake_information_response_invalid' using errcode = '22023';
  end if;

  select * into existing from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type is distinct from event_type
      or existing.payload is distinct from event_payload then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', existing.event_id, 'sequence', existing.sequence, 'replayed', true);
  end if;

  if event_type = 'information_cleared' then
    delete from public.intake_information_answers
    where organization_id = p_organization_id
      and intake_session_id = p_session_id
      and requirement_id = trim(p_requirement_id);
  else
    insert into public.intake_information_answers (
      organization_id, intake_session_id, requirement_id, answer,
      response, note, answered_by
    ) values (
      p_organization_id, p_session_id, trim(p_requirement_id), normalized_answer,
      p_response, normalized_note, actor_id
    )
    on conflict (organization_id, intake_session_id, requirement_id) do update
      set answer = excluded.answer,
          response = excluded.response,
          note = excluded.note,
          answered_by = excluded.answered_by;
  end if;

  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, event_type,
    event_payload, occurred_at, actor_id
  );
  return jsonb_build_object('eventId', event_row.event_id, 'sequence', event_row.sequence, 'replayed', false);
end;
$$;

create or replace function public.record_intake_information_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_requirement_id text,
  p_answer text default null,
  p_response text default 'provided',
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.record_intake_information_command(
    p_organization_id, p_session_id, p_event_id, p_requirement_id,
    p_answer, p_response, p_note
  );
$$;

revoke all on function private.set_intake_archetype_command(uuid, uuid, uuid, text, text, text, text[])
  from public, anon;
revoke all on function public.set_intake_archetype_command(uuid, uuid, uuid, text, text, text, text[])
  from public, anon;
revoke all on function private.record_intake_information_command(uuid, uuid, uuid, text, text, text, text)
  from public, anon;
revoke all on function public.record_intake_information_command(uuid, uuid, uuid, text, text, text, text)
  from public, anon;

grant execute on function private.set_intake_archetype_command(uuid, uuid, uuid, text, text, text, text[])
  to authenticated;
grant execute on function public.set_intake_archetype_command(uuid, uuid, uuid, text, text, text, text[])
  to authenticated;
grant execute on function private.record_intake_information_command(uuid, uuid, uuid, text, text, text, text)
  to authenticated;
grant execute on function public.record_intake_information_command(uuid, uuid, uuid, text, text, text, text)
  to authenticated;

-- From this migration onward, these two projections are command-written. Column-level UPDATE on
-- the rest of the session brief remains unchanged until its capital-need command lands.
revoke update (archetype) on table public.document_intake_sessions from authenticated;
revoke insert, update, delete on table public.intake_information_answers from authenticated;
