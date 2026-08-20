-- The session's state machine stops being writable by the company whose session it is.
--
-- `status` is the precondition every command in this system reads. `begin_processing_run`
-- refuses a confirmed session, `complete_intake_processing` refuses a confirmed session, and
-- `confirm_document_intake` refuses one that is already confirmed. All three were being asked
-- to trust a column the caller could set to anything: a member could PATCH
-- `status = 'confirmed'` and skip the confirmation command entirely, or set a confirmed session
-- back to `collecting` and reopen a case that had already been sent. A precondition the caller
-- rewrites is not a precondition.
--
-- The same grant covered the provenance columns, which is worse than it sounds:
-- `pipeline_version` and `extraction_version` are the record of *which extractor produced this
-- evidence*, and `result_summary` holds the readiness, the capacity, the term sheet and the
-- brief. A tenant able to write those can author its own analysis and stamp it with a version
-- it never ran.
--
-- What a company legitimately answers about itself stays directly writable: the amount, the
-- term, the grace, the rate it hopes for, the sector, the geography, the instruments, the
-- collateral, the archetype. Those are its own words and it should be able to change them.
-- Everything the machine decides now moves behind a command that proves its own precondition.

-- ---------------------------------------------------------------------------------------------
-- The manual path's confirmation, in one transaction instead of three writes
-- ---------------------------------------------------------------------------------------------
--
-- The application was doing this in three separate statements from a server action: link the
-- documents, set the status, stamp the time. Any failure between them left a session whose
-- documents belong to an opportunity that the session does not admit to, which is the kind of
-- state nobody writes a repair for because nobody expects it.
create or replace function private.attach_intake_session_to_opportunity(
  p_organization_id uuid,
  p_session_id uuid,
  p_opportunity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
  linked integer;
begin
  -- Refuses a caller with no identity and one who is not a member of this organization, before
  -- anything is written. That check, and not the schema, is what makes `security definer` safe.
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);

  if session_row.status in ('confirmed', 'cancelled') then
    raise exception 'intake_session_already_confirmed' using errcode = '55000';
  end if;

  -- The opportunity has to be this organization's own. A definer that skipped this would let a
  -- member attach their session to somebody else's case.
  if not exists (
    select 1 from public.opportunities
    where organization_id = p_organization_id and id = p_opportunity_id
  ) then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  update public.source_documents
  set opportunity_id = p_opportunity_id
  where organization_id = p_organization_id and intake_session_id = p_session_id;
  get diagnostics linked = row_count;

  update public.document_intake_sessions
  set status = 'confirmed',
      opportunity_id = p_opportunity_id,
      confirmed_at = now()
  where organization_id = p_organization_id and id = p_session_id;

  return jsonb_build_object('documents_linked', linked);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Marking a session failed
-- ---------------------------------------------------------------------------------------------
--
-- The reason is recorded as text under a fixed key rather than as a caller-supplied object, so
-- this cannot become a second door into `result_summary`.
create or replace function private.fail_intake_session(
  p_organization_id uuid,
  p_session_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);

  -- A confirmed case does not fail retroactively. It has already been sent.
  if session_row.status in ('confirmed', 'cancelled') then
    raise exception 'intake_session_already_confirmed' using errcode = '55000';
  end if;

  update public.document_intake_sessions
  set status = 'failed',
      processing_completed_at = now(),
      result_summary = result_summary || jsonb_build_object('error', left(coalesce(p_reason, ''), 200))
  where organization_id = p_organization_id and id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Recording the derived analysis
-- ---------------------------------------------------------------------------------------------
--
-- Two things are gained beyond the grant. The merge happens here, in one statement, instead of
-- as a read-modify-write in the application: two concurrent writers used to be able to drop
-- each other's keys, and now the last one in merges rather than replaces. And the analysis of a
-- confirmed case is closed: once a case has been sent, nobody rewrites the readiness or the
-- term sheet that went with it.
--
-- Being honest about what this does not do. The analysis is computed in the application under
-- the caller's own session, so a member can still influence what gets recorded before
-- confirmation; this closes tampering *after* the fact, not authorship before it. Closing that
-- properly means computing the analysis somewhere the tenant is not, which is a larger move and
-- is recorded as the next one rather than pretended away here.
create or replace function private.record_intake_analysis(
  p_organization_id uuid,
  p_session_id uuid,
  p_patch jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);

  if session_row.status in ('confirmed', 'cancelled') then
    raise exception 'intake_session_already_confirmed' using errcode = '55000';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_intake_summary' using errcode = '22023';
  end if;

  update public.document_intake_sessions
  set result_summary = result_summary || p_patch
  where organization_id = p_organization_id and id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The API surface
-- ---------------------------------------------------------------------------------------------
--
-- `security invoker` wrappers, and both halves granted. A wrapper granted without its
-- implementation fails with "permission denied for function", and this repository has walked
-- into that twice.
create or replace function public.attach_intake_session_to_opportunity(
  p_organization_id uuid,
  p_session_id uuid,
  p_opportunity_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.attach_intake_session_to_opportunity(p_organization_id, p_session_id, p_opportunity_id);
$wrapper$;

create or replace function public.fail_intake_session(
  p_organization_id uuid,
  p_session_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.fail_intake_session(p_organization_id, p_session_id, p_reason);
$wrapper$;

create or replace function public.record_intake_analysis(
  p_organization_id uuid,
  p_session_id uuid,
  p_patch jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.record_intake_analysis(p_organization_id, p_session_id, p_patch);
$wrapper$;

revoke all on function private.attach_intake_session_to_opportunity(uuid, uuid, uuid) from public, anon;
revoke all on function private.fail_intake_session(uuid, uuid, text) from public, anon;
revoke all on function private.record_intake_analysis(uuid, uuid, jsonb) from public, anon;
revoke all on function public.attach_intake_session_to_opportunity(uuid, uuid, uuid) from public, anon;
revoke all on function public.fail_intake_session(uuid, uuid, text) from public, anon;
revoke all on function public.record_intake_analysis(uuid, uuid, jsonb) from public, anon;

grant execute on function private.attach_intake_session_to_opportunity(uuid, uuid, uuid) to authenticated;
grant execute on function private.fail_intake_session(uuid, uuid, text) to authenticated;
grant execute on function private.record_intake_analysis(uuid, uuid, jsonb) to authenticated;
grant execute on function public.attach_intake_session_to_opportunity(uuid, uuid, uuid) to authenticated;
grant execute on function public.fail_intake_session(uuid, uuid, text) to authenticated;
grant execute on function public.record_intake_analysis(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- And the grants, stated column by column
-- ---------------------------------------------------------------------------------------------
--
-- A column-level revoke is silent while a table-level grant stands: Postgres reads the table
-- grant as covering every column, including ones added later. So the exclusion only means
-- something if the grant itself is per column, and a column added by a future migration is then
-- excluded by default rather than by whoever remembers.
revoke update on table public.document_intake_sessions from authenticated;

grant update (
  archetype, collateral_kinds, expected_rate, geography, instruments,
  requested_amount, requested_grace_months, requested_term_months, sector
) on table public.document_intake_sessions to authenticated;

revoke insert on table public.document_intake_sessions from authenticated;

-- The session is opened with what the company is and nothing about where it stands: `status`
-- and `extraction_version` carry defaults, and everything else is written by a command.
grant insert (
  id, organization_id, started_by, journey, locale
) on table public.document_intake_sessions to authenticated;

comment on column public.document_intake_sessions.status is
  'Where this session stands. Written only by the intake commands, never through the Data API: it is the precondition every one of those commands reads, and a precondition the caller can rewrite is not a precondition.';
