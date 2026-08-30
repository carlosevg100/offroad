-- Company confirmation is a property of a financing, not of the account. Reusing the account's
-- company name must never let a later project skip its first guided milestone.

alter table public.document_intake_sessions
  add column if not exists company_profile_confirmed_at timestamptz;

create or replace function private.save_project_company_profile(
  p_session_id uuid,
  p_name text,
  p_legal_name text,
  p_website text,
  p_description text,
  p_identifier_hash bytea,
  p_identifier_last4 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.save_guided_company_profile(
    p_session_id,
    p_name,
    p_legal_name,
    p_website,
    p_description,
    p_identifier_hash,
    p_identifier_last4
  );

  update public.document_intake_sessions session
  set company_profile_confirmed_at = coalesce(session.company_profile_confirmed_at, now()),
      updated_at = now()
  where session.id = p_session_id
    and session.started_by = (select auth.uid())
    and session.status = 'collecting';

  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.save_project_company_profile(
  p_session_id uuid,
  p_name text,
  p_legal_name text,
  p_website text,
  p_description text,
  p_identifier_hash bytea,
  p_identifier_last4 text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.save_project_company_profile(
    p_session_id,
    p_name,
    p_legal_name,
    p_website,
    p_description,
    p_identifier_hash,
    p_identifier_last4
  );
$$;

revoke all on function private.save_project_company_profile(uuid, text, text, text, text, bytea, text)
  from public, anon, authenticated;
revoke all on function public.save_project_company_profile(uuid, text, text, text, text, bytea, text)
  from public, anon, authenticated;
grant execute on function private.save_project_company_profile(uuid, text, text, text, text, bytea, text)
  to authenticated;
grant execute on function public.save_project_company_profile(uuid, text, text, text, text, bytea, text)
  to authenticated;

comment on column public.document_intake_sessions.company_profile_confirmed_at is
  'When the company milestone was explicitly reviewed and saved for this financing.';
comment on function public.save_project_company_profile(uuid, text, text, text, text, bytea, text) is
  'Saves the shared company profile and atomically confirms it for one financing.';
