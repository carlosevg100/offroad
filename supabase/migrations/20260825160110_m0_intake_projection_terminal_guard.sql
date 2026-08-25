-- M0 adaptive intake, terminal-state guard.
--
-- Confirmed and cancelled sessions are immutable. These triggers protect the two projections
-- introduced behind commands by the event-ledger migration. The answer trigger deliberately
-- allows a cascading delete after the parent session has disappeared, preserving controlled
-- case and account erasure.

create or replace function private.guard_intake_session_terminal_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('confirmed', 'cancelled')
    and new.archetype is distinct from old.archetype then
    raise exception 'intake_session_terminal' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_intake_session_terminal_projection()
  from public, anon, authenticated;

create trigger document_intake_sessions_guard_terminal_archetype
  before update of archetype on public.document_intake_sessions
  for each row execute function private.guard_intake_session_terminal_projection();

create or replace function private.guard_intake_information_terminal_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  target_session_id uuid;
  session_status text;
begin
  if tg_op = 'DELETE' then
    target_organization_id := old.organization_id;
    target_session_id := old.intake_session_id;
  else
    target_organization_id := new.organization_id;
    target_session_id := new.intake_session_id;
  end if;

  select session.status into session_status
  from public.document_intake_sessions session
  where session.organization_id = target_organization_id
    and session.id = target_session_id;

  -- A missing parent during DELETE is the controlled ON DELETE CASCADE path.
  if not found and tg_op = 'DELETE' then
    return old;
  end if;
  if session_status in ('confirmed', 'cancelled') then
    raise exception 'intake_session_terminal' using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_intake_information_terminal_projection()
  from public, anon, authenticated;

create trigger intake_information_answers_guard_terminal
  before insert or update or delete on public.intake_information_answers
  for each row execute function private.guard_intake_information_terminal_projection();

comment on function private.guard_intake_session_terminal_projection() is
  'Rejects archetype changes after an intake session reaches a terminal state.';
comment on function private.guard_intake_information_terminal_projection() is
  'Rejects answer projection changes after a terminal state while allowing parent-session erasure cascades.';
