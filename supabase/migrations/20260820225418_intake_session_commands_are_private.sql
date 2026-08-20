-- The four remaining commands that write the session's state move to `private`.
--
-- The previous migration made `status`, the provenance and `result_summary` unwritable through
-- the Data API, and every command that runs as its caller and writes them broke. That is the
-- guard working, but it has to be answered by moving the commands rather than by handing the
-- grants back: `begin_intake_processing` sets the session processing, `confirm_document_intake`
-- confirms it, `claim_case_brief` takes the one-brief-per-case lease, and
-- `record_case_model_spend` accumulates what a brief cost.
--
-- Two of them were carrying a hole that only became visible on the way here. `claim_case_brief`
-- and `record_case_model_spend` prove nothing about the caller: they take an organization id as
-- an argument and rely entirely on RLS to filter the row. That is sound while they run as the
-- caller, and it would have been a cross-tenant write the moment they ran as the owner. They get
-- the membership check the other two already had, and the check goes in before the move, not
-- after it.
--
-- Moved with `alter function ... set schema` rather than rewritten, so the bodies that were
-- reviewed and tested are the bodies that run.

-- ---------------------------------------------------------------------------------------------
-- First, the missing checks. Still `security invoker` at this point, so a mistake here fails
-- closed rather than open.
-- ---------------------------------------------------------------------------------------------

create or replace function public.claim_case_brief(
  p_organization_id uuid,
  p_session_id uuid,
  p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed_at timestamptz;
begin
  -- The caller has to be a member of this organization. Reached by argument rather than by
  -- policy, this is the only thing standing between a definer and another tenant's session.
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'offroad'])) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  -- `for update` on the caller's own row: two concurrent requests serialise here, and the loser
  -- reads the winner's claim rather than a value from before it was written.
  select (result_summary ->> 'brief_claimed_at')::timestamptz into claimed_at
  from public.document_intake_sessions
  where organization_id = p_organization_id and id = p_session_id
  for update;

  if not found then
    return false;
  end if;

  if claimed_at is not null and claimed_at > now() - make_interval(secs => p_lease_seconds) then
    return false;
  end if;

  update public.document_intake_sessions
  set result_summary = jsonb_set(
        coalesce(result_summary, '{}'::jsonb),
        '{brief_claimed_at}',
        to_jsonb(now()),
        true
      )
  where organization_id = p_organization_id and id = p_session_id;

  return true;
end;
$$;

-- Rewritten from `language sql` to plpgsql so the check can raise before the write.
create or replace function public.record_case_model_spend(
  p_organization_id uuid,
  p_session_id uuid,
  p_cost_usd numeric,
  p_calls integer default 1
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'offroad'])) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  update public.document_intake_sessions
  set result_summary = jsonb_set(
        jsonb_set(
          coalesce(result_summary, '{}'::jsonb),
          '{model_spend_usd}',
          to_jsonb(coalesce((result_summary ->> 'model_spend_usd')::numeric, 0) + greatest(coalesce(p_cost_usd, 0), 0)),
          true
        ),
        '{model_calls}',
        to_jsonb(coalesce((result_summary ->> 'model_calls')::integer, 0) + greatest(coalesce(p_calls, 0), 0)),
        true
      )
  where organization_id = p_organization_id and id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Then the move
-- ---------------------------------------------------------------------------------------------

alter function public.begin_intake_processing(uuid, uuid) set schema private;
alter function private.begin_intake_processing(uuid, uuid) security definer;

alter function public.confirm_document_intake(uuid, uuid, text) set schema private;
alter function private.confirm_document_intake(uuid, uuid, text) security definer;

alter function public.claim_case_brief(uuid, uuid, integer) set schema private;
alter function private.claim_case_brief(uuid, uuid, integer) security definer;

alter function public.record_case_model_spend(uuid, uuid, numeric, integer) set schema private;
alter function private.record_case_model_spend(uuid, uuid, numeric, integer) security definer;

-- ---------------------------------------------------------------------------------------------
-- And the wrappers. `security invoker`, and both halves granted: a wrapper granted without its
-- implementation fails with "permission denied for function".
-- ---------------------------------------------------------------------------------------------

create function public.begin_intake_processing(p_organization_id uuid, p_session_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.begin_intake_processing(p_organization_id, p_session_id);
$wrapper$;

create function public.confirm_document_intake(
  p_organization_id uuid,
  p_session_id uuid,
  p_output_locale text default 'pt-BR'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.confirm_document_intake(p_organization_id, p_session_id, p_output_locale);
$wrapper$;

create function public.claim_case_brief(
  p_organization_id uuid,
  p_session_id uuid,
  p_lease_seconds integer default 180
)
returns boolean
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.claim_case_brief(p_organization_id, p_session_id, p_lease_seconds);
$wrapper$;

create function public.record_case_model_spend(
  p_organization_id uuid,
  p_session_id uuid,
  p_cost_usd numeric,
  p_calls integer default 1
)
returns void
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.record_case_model_spend(p_organization_id, p_session_id, p_cost_usd, p_calls);
$wrapper$;

revoke all on function private.begin_intake_processing(uuid, uuid) from public, anon;
revoke all on function private.confirm_document_intake(uuid, uuid, text) from public, anon;
revoke all on function private.claim_case_brief(uuid, uuid, integer) from public, anon;
revoke all on function private.record_case_model_spend(uuid, uuid, numeric, integer) from public, anon;
revoke all on function public.begin_intake_processing(uuid, uuid) from public, anon;
revoke all on function public.confirm_document_intake(uuid, uuid, text) from public, anon;
revoke all on function public.claim_case_brief(uuid, uuid, integer) from public, anon;
revoke all on function public.record_case_model_spend(uuid, uuid, numeric, integer) from public, anon;

grant execute on function private.begin_intake_processing(uuid, uuid) to authenticated;
grant execute on function private.confirm_document_intake(uuid, uuid, text) to authenticated;
grant execute on function private.claim_case_brief(uuid, uuid, integer) to authenticated;
grant execute on function private.record_case_model_spend(uuid, uuid, numeric, integer) to authenticated;
grant execute on function public.begin_intake_processing(uuid, uuid) to authenticated;
grant execute on function public.confirm_document_intake(uuid, uuid, text) to authenticated;
grant execute on function public.claim_case_brief(uuid, uuid, integer) to authenticated;
grant execute on function public.record_case_model_spend(uuid, uuid, numeric, integer) to authenticated;
