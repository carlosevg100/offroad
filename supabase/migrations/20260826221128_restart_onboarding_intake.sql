-- Let the person who opened an unfinished document-first onboarding discard that attempt and
-- return to the welcome screen without deleting the organization, account, or audit history.
--
-- The old session remains as `cancelled`, together with any documents already received. This is
-- intentionally not a delete: a restart must be reversible for operations and must never make
-- uploaded evidence disappear silently. Confirmed and processing sessions cannot be restarted.

create function private.restart_onboarding_intake(
  p_organization_id uuid,
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  progress_updated integer;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not (select private.is_org_type_member(
    p_organization_id,
    array['company', 'originator']
  )) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id
    and session.id = p_session_id
    and session.started_by = caller_id
  for update;

  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;

  if session_row.status = 'confirmed' then
    raise exception 'confirmed_intake_cannot_restart' using errcode = '55000';
  end if;
  if session_row.status = 'processing' then
    raise exception 'processing_intake_cannot_restart' using errcode = '55000';
  end if;

  if session_row.status <> 'cancelled' then
    update public.document_intake_sessions
    set status = 'cancelled', updated_at = now()
    where organization_id = p_organization_id
      and id = p_session_id;
  end if;

  update public.onboarding_progress progress
  set current_step = 'organization',
      answers = jsonb_build_object(
        'registration', coalesce(progress.answers -> 'registration', '{}'::jsonb)
      ),
      completed_at = null,
      updated_at = now()
  where progress.organization_id = p_organization_id
    and progress.user_id = caller_id
    and progress.journey = session_row.journey;
  get diagnostics progress_updated = row_count;

  if progress_updated <> 1 then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.restart_onboarding_intake(
  p_organization_id uuid,
  p_session_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.restart_onboarding_intake(p_organization_id, p_session_id);
$wrapper$;

revoke all on function private.restart_onboarding_intake(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.restart_onboarding_intake(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.restart_onboarding_intake(uuid, uuid) to authenticated;
grant execute on function public.restart_onboarding_intake(uuid, uuid) to authenticated;

comment on function public.restart_onboarding_intake(uuid, uuid) is
  'Cancels the caller-owned, unfinished document-first onboarding session and restores only that caller onboarding to its welcome state. The cancelled session and uploaded documents remain auditable.';
