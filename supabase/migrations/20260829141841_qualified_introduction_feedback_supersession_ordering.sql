-- Two observations can legitimately share a business timestamp. Ordering is still explicit:
-- a correction must name the event it supersedes, while an unsuperseded decline blocks every
-- later or same-time positive signal.
create or replace function private.record_qualified_introduction_feedback(
  p_introduction_id uuid,
  p_event_type text,
  p_occurred_at timestamptz,
  p_source_kind text,
  p_verification_state text,
  p_reason_code text,
  p_note text,
  p_requested_information_count integer,
  p_amount numeric,
  p_currency text,
  p_supersedes_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  introduction public.qualified_introductions;
  superseded public.qualified_introduction_feedback_events;
  feedback_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'qualified_introduction_feedback_authentication_required' using errcode = '42501';
  end if;

  select * into introduction
  from public.qualified_introductions row
  where row.id = p_introduction_id;
  if not found then
    raise exception 'qualified_introduction_not_found' using errcode = 'P0002';
  end if;
  if not (select private.can_access_intake_session(introduction.organization_id, introduction.intake_session_id)) then
    raise exception 'qualified_introduction_feedback_forbidden' using errcode = '42501';
  end if;
  if p_event_type not in (
    'introduction_accepted', 'case_declined', 'diligence_requested',
    'process_advanced', 'proposal_issued', 'funded'
  ) then raise exception 'qualified_introduction_feedback_event_type_invalid' using errcode = '22023'; end if;
  if p_source_kind not in ('lender', 'company', 'advisor', 'offroad', 'system') then
    raise exception 'qualified_introduction_feedback_source_invalid' using errcode = '22023';
  end if;
  if p_verification_state not in ('reported', 'confirmed', 'verified') then
    raise exception 'qualified_introduction_feedback_verification_invalid' using errcode = '22023';
  end if;
  if p_occurred_at < introduction.introduced_at or p_occurred_at > now() + interval '5 minutes' then
    raise exception 'qualified_introduction_feedback_time_invalid' using errcode = '22023';
  end if;
  if p_event_type = 'case_declined' and nullif(trim(p_reason_code), '') is null then
    raise exception 'qualified_introduction_feedback_decline_reason_required' using errcode = '22023';
  end if;
  if p_event_type = 'diligence_requested' and coalesce(p_requested_information_count, 0) < 1 then
    raise exception 'qualified_introduction_feedback_request_count_required' using errcode = '22023';
  end if;
  if (p_amount is null) <> (p_currency is null) then
    raise exception 'qualified_introduction_feedback_amount_currency_pair_required' using errcode = '22023';
  end if;

  if p_supersedes_event_id is not null then
    select * into superseded
    from public.qualified_introduction_feedback_events row
    where row.organization_id = introduction.organization_id
      and row.id = p_supersedes_event_id;
    if not found
      or superseded.qualified_introduction_id <> introduction.id
      or superseded.occurred_at > p_occurred_at then
      raise exception 'qualified_introduction_feedback_supersession_invalid' using errcode = '22023';
    end if;
  end if;

  if p_event_type <> 'case_declined' and exists (
    select 1
    from public.qualified_introduction_feedback_events decline
    where decline.organization_id = introduction.organization_id
      and decline.qualified_introduction_id = introduction.id
      and decline.event_type = 'case_declined'
      and not exists (
        select 1
        from public.qualified_introduction_feedback_events replacement
        where replacement.organization_id = decline.organization_id
          and replacement.supersedes_event_id = decline.id
      )
      and decline.id is distinct from p_supersedes_event_id
      and decline.occurred_at <= p_occurred_at
  ) then
    raise exception 'qualified_introduction_feedback_decline_supersession_required' using errcode = '22023';
  end if;

  insert into public.qualified_introduction_feedback_events (
    organization_id, intake_session_id, qualified_introduction_id, case_fingerprint,
    event_type, source_kind, verification_state, reason_code, note,
    requested_information_count, amount, currency, supersedes_event_id, occurred_at, recorded_by
  ) values (
    introduction.organization_id, introduction.intake_session_id, introduction.id, introduction.case_fingerprint,
    p_event_type, p_source_kind, p_verification_state, nullif(trim(p_reason_code), ''), nullif(trim(p_note), ''),
    p_requested_information_count, p_amount, upper(p_currency), p_supersedes_event_id, p_occurred_at, (select auth.uid())
  ) returning id into feedback_id;

  return feedback_id;
end;
$$;

revoke all on function private.record_qualified_introduction_feedback(
  uuid, text, timestamptz, text, text, text, text, integer, numeric, text, uuid
) from public, anon;
grant execute on function private.record_qualified_introduction_feedback(
  uuid, text, timestamptz, text, text, text, text, integer, numeric, text, uuid
) to authenticated;
