-- M0 adaptive intake: versioned request-ladder commands.
--
-- A request may reach the client only after the current evidence revision has passed through the
-- three governed search steps. Ladder events do not themselves change the evidence revision, so
-- one batch can share the same basis. Any later fact, document, answer, route or scope event makes
-- the prior traces stale in deterministic replay.

create or replace function private.record_intake_request_ladders_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_events jsonb,
  p_require_membership boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  event_input jsonb;
  existing public.intake_domain_events;
  event_row public.intake_domain_events;
  input_event_id uuid;
  requirement_id text;
  attempts jsonb;
  trace_version integer;
  basis_revision integer;
  expected_basis_revision integer;
  event_payload jsonb;
  results jsonb := '[]'::jsonb;
  occurred_at timestamptz;
begin
  if actor_id is null or jsonb_typeof(p_events) <> 'array'
    or jsonb_array_length(p_events) not between 1 and 50 then
    raise exception 'intake_request_ladder_batch_invalid' using errcode = '22023';
  end if;

  if p_require_membership then
    session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  else
    select * into session_row
    from public.document_intake_sessions session
    where session.organization_id = p_organization_id and session.id = p_session_id
    for update;
    if not found then
      raise exception 'intake_session_not_found' using errcode = 'P0002';
    end if;
  end if;

  if session_row.status in ('confirmed', 'cancelled') then
    raise exception 'intake_session_terminal' using errcode = '55000';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_events) item
    group by item ->> 'eventId'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_events) item
    group by item ->> 'requirementId'
    having count(*) > 1
  ) then
    raise exception 'intake_request_ladder_batch_duplicate' using errcode = '22023';
  end if;

  select count(*)::integer into basis_revision
  from public.intake_domain_events event
  where event.organization_id = p_organization_id
    and event.intake_session_id = p_session_id
    and event.event_type <> 'request_ladder_recorded';

  for event_input in
    select item.value
    from jsonb_array_elements(p_events) with ordinality item(value, position)
    order by item.position
  loop
    begin
      input_event_id := (event_input ->> 'eventId')::uuid;
      expected_basis_revision := (event_input ->> 'basisRevision')::integer;
    exception when others then
      raise exception 'intake_request_ladder_event_id_invalid' using errcode = '22023';
    end;
    requirement_id := nullif(trim(event_input ->> 'requirementId'), '');
    attempts := event_input -> 'attempts';

    if input_event_id is null or requirement_id is null or char_length(requirement_id) > 100
      or expected_basis_revision is null or expected_basis_revision < 0
      or jsonb_typeof(attempts) <> 'array'
      or jsonb_array_length(attempts) not between 1 and 3
      or exists (
        select 1
        from jsonb_array_elements(attempts) with ordinality attempt(value, position)
        where attempt.value ->> 'source' is distinct from
          (array['classified_room', 'declared_derivation', 'registered_public_source'])[attempt.position::integer]
          or attempt.value ->> 'outcome' not in ('found', 'not_found', 'not_permitted', 'not_applicable')
          or char_length(trim(coalesce(attempt.value ->> 'detail', ''))) not between 1 and 1000
          or jsonb_typeof(attempt.value -> 'evidenceIds') <> 'array'
          or (
            attempt.value ->> 'outcome' = 'found'
            and jsonb_array_length(attempt.value -> 'evidenceIds') = 0
          )
          or (
            attempt.value ->> 'outcome' <> 'found'
            and jsonb_array_length(attempt.value -> 'evidenceIds') <> 0
          )
      )
      or exists (
        select 1
        from jsonb_array_elements(attempts) with ordinality found_attempt(value, position)
        where found_attempt.value ->> 'outcome' = 'found'
          and found_attempt.position <> jsonb_array_length(attempts)
      ) then
      raise exception 'intake_request_ladder_event_invalid' using errcode = '22023';
    end if;

    if expected_basis_revision is distinct from basis_revision then
      raise exception 'intake_request_ladder_stale' using errcode = '40001';
    end if;

    -- Tenant-facing code may only prove that the governed ladder was exhausted. It cannot
    -- manufacture evidence or suppress a requirement as "found". Positive evidence is a
    -- worker capability action and is still validated by the event contract and replay.
    if p_require_membership and (
      jsonb_array_length(attempts) <> 3
      or exists (
        select 1
        from jsonb_array_elements(attempts) attempt(value)
        where attempt.value ->> 'outcome' = 'found'
          or jsonb_array_length(attempt.value -> 'evidenceIds') <> 0
      )
    ) then
      raise exception 'intake_request_ladder_evidence_requires_worker' using errcode = '42501';
    end if;

    select * into existing
    from public.intake_domain_events event
    where event.organization_id = p_organization_id and event.event_id = input_event_id;
    if found then
      if existing.intake_session_id is distinct from p_session_id
        or existing.event_type <> 'request_ladder_recorded'
        or existing.created_by is distinct from actor_id
        or existing.payload -> 'trace' ->> 'requirementId' is distinct from requirement_id
        or existing.payload -> 'trace' -> 'attempts' is distinct from attempts
        or (existing.payload -> 'trace' ->> 'basisRevision')::integer is distinct from basis_revision then
        raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
      end if;
      results := results || jsonb_build_array(jsonb_build_object(
        'eventId', existing.event_id,
        'sequence', existing.sequence,
        'replayed', true
      ));
      continue;
    end if;

    -- Concurrent workers can classify different documents in the same case and compile the
    -- same request against the same locked evidence revision. Preserve one trace, not duplicate
    -- audit noise with different event ids.
    select * into existing
    from public.intake_domain_events event
    where event.organization_id = p_organization_id
      and event.intake_session_id = p_session_id
      and event.event_type = 'request_ladder_recorded'
      and event.payload -> 'trace' ->> 'requirementId' = requirement_id
      and (event.payload -> 'trace' ->> 'basisRevision')::integer = basis_revision
      and event.payload -> 'trace' -> 'attempts' = attempts
    order by event.sequence desc
    limit 1;
    if found then
      results := results || jsonb_build_array(jsonb_build_object(
        'eventId', existing.event_id,
        'sequence', existing.sequence,
        'replayed', true
      ));
      continue;
    end if;

    select count(*)::integer + 1 into trace_version
    from public.intake_domain_events event
    where event.organization_id = p_organization_id
      and event.intake_session_id = p_session_id
      and event.event_type = 'request_ladder_recorded'
      and event.payload -> 'trace' ->> 'requirementId' = requirement_id;

    event_payload := jsonb_build_object('trace', jsonb_build_object(
      'requirementId', requirement_id,
      'attempts', attempts,
      'basisRevision', basis_revision,
      'traceVersion', trace_version
    ));
    occurred_at := clock_timestamp();
    event_row := private.append_intake_domain_event(
      p_organization_id, p_session_id, input_event_id, 'request_ladder_recorded',
      event_payload, occurred_at, actor_id
    );
    results := results || jsonb_build_array(jsonb_build_object(
      'eventId', event_row.event_id,
      'sequence', event_row.sequence,
      'replayed', false
    ));
  end loop;

  return jsonb_build_object(
    'basisRevision', basis_revision,
    'events', results
  );
end;
$$;

create or replace function public.record_intake_request_ladders_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_events jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.record_intake_request_ladders_command(
    p_organization_id, p_session_id, p_events, true
  );
$$;

-- Capability-authorized worker readers and writers. The service account belongs to no tenant;
-- organization and session scope come only from the claimed job.
create or replace function private.worker_load_intake_events(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', event.event_id,
    'event_type', event.event_type,
    'intake_session_id', event.intake_session_id,
    'occurred_at', event.occurred_at,
    'payload', event.payload,
    'sequence', event.sequence
  ) order by event.sequence), '[]'::jsonb)
  into result
  from public.intake_domain_events event
  where event.organization_id = job_row.organization_id
    and event.intake_session_id = job_row.intake_session_id;
  return result;
end;
$$;

create or replace function public.worker_load_intake_events(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_intake_events(p_job_id, p_capability_token);
$$;

create or replace function private.worker_record_intake_request_ladders(
  p_job_id uuid,
  p_capability_token text,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
begin
  return private.record_intake_request_ladders_command(
    job_row.organization_id, job_row.intake_session_id, p_events, false
  );
end;
$$;

create or replace function public.worker_record_intake_request_ladders(
  p_job_id uuid,
  p_capability_token text,
  p_events jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_intake_request_ladders(
    p_job_id, p_capability_token, p_events
  );
$$;

revoke all on function private.record_intake_request_ladders_command(uuid, uuid, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function public.record_intake_request_ladders_command(uuid, uuid, jsonb)
  from public, anon;
grant execute on function private.record_intake_request_ladders_command(uuid, uuid, jsonb, boolean)
  to authenticated;
grant execute on function public.record_intake_request_ladders_command(uuid, uuid, jsonb)
  to authenticated;

revoke all on function private.worker_load_intake_events(uuid, text)
  from public, anon, authenticated;
revoke all on function public.worker_load_intake_events(uuid, text)
  from public, anon;
grant execute on function private.worker_load_intake_events(uuid, text)
  to authenticated;
grant execute on function public.worker_load_intake_events(uuid, text)
  to authenticated;

revoke all on function private.worker_record_intake_request_ladders(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.worker_record_intake_request_ladders(uuid, text, jsonb)
  from public, anon;
grant execute on function private.worker_record_intake_request_ladders(uuid, text, jsonb)
  to authenticated;
grant execute on function public.worker_record_intake_request_ladders(uuid, text, jsonb)
  to authenticated;

comment on function private.record_intake_request_ladders_command(uuid, uuid, jsonb, boolean) is
  'Appends one governed request-ladder batch against the current evidence revision.';
comment on function private.worker_load_intake_events(uuid, text) is
  'Returns the capability-scoped intake event stream to the deterministic worker.';
