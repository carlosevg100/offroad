-- Feedback after a qualified introduction is market intelligence, not execution by Offroad.
-- The ledger records what a lender reports or does after the authorized introduction. It does
-- not model underwriting tasks, diligence work, negotiation, documentation, funding operations
-- or monitoring as activities performed by Offroad.

create table public.qualified_introduction_feedback_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  qualified_introduction_id uuid not null,
  case_fingerprint text not null check (case_fingerprint ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type in (
    'introduction_accepted',
    'case_declined',
    'diligence_requested',
    'process_advanced',
    'proposal_issued',
    'funded'
  )),
  source_kind text not null check (source_kind in ('lender', 'company', 'advisor', 'offroad', 'system')),
  verification_state text not null check (verification_state in ('reported', 'confirmed', 'verified')),
  reason_code text check (reason_code is null or reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  note text check (note is null or length(trim(note)) between 3 and 4000),
  requested_information_count integer check (requested_information_count is null or requested_information_count between 1 and 500),
  amount numeric(22, 2) check (amount is null or amount >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  supersedes_event_id uuid,
  occurred_at timestamptz not null,
  recorded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade,
  foreign key (organization_id, qualified_introduction_id)
    references public.qualified_introductions (organization_id, id) on delete cascade,
  foreign key (organization_id, supersedes_event_id)
    references public.qualified_introduction_feedback_events (organization_id, id),
  check (event_type <> 'case_declined' or reason_code is not null),
  check (event_type <> 'diligence_requested' or requested_information_count is not null),
  check ((amount is null) = (currency is null))
);

comment on table public.qualified_introduction_feedback_events is
  'Append-only observations after an authorized qualified introduction. These signals inform the lender graph and product metrics without extending Offroad into lender underwriting or closing.';

create index qualified_introduction_feedback_session_idx
  on public.qualified_introduction_feedback_events (organization_id, intake_session_id, occurred_at, id);
create index qualified_introduction_feedback_introduction_idx
  on public.qualified_introduction_feedback_events (organization_id, qualified_introduction_id, occurred_at, id);
create unique index qualified_introduction_feedback_supersedes_fk_idx
  on public.qualified_introduction_feedback_events (organization_id, supersedes_event_id)
  where supersedes_event_id is not null;

create trigger qualified_introduction_feedback_set_updated_at
  before update on public.qualified_introduction_feedback_events
  for each row execute function private.set_updated_at();
create trigger qualified_introduction_feedback_audit
  after insert or update or delete on public.qualified_introduction_feedback_events
  for each row execute function private.capture_audit_event();

alter table public.qualified_introduction_feedback_events enable row level security;
alter table public.qualified_introduction_feedback_events force row level security;

create policy qualified_introduction_feedback_select
  on public.qualified_introduction_feedback_events for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

revoke all on public.qualified_introduction_feedback_events from public, anon, authenticated;
grant select on public.qualified_introduction_feedback_events to authenticated;

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
      or superseded.occurred_at >= p_occurred_at then
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
      and decline.occurred_at < p_occurred_at
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

create function public.record_qualified_introduction_feedback(
  p_introduction_id uuid,
  p_event_type text,
  p_occurred_at timestamptz,
  p_source_kind text,
  p_verification_state text,
  p_reason_code text default null,
  p_note text default null,
  p_requested_information_count integer default null,
  p_amount numeric default null,
  p_currency text default null,
  p_supersedes_event_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_qualified_introduction_feedback(
    p_introduction_id, p_event_type, p_occurred_at, p_source_kind, p_verification_state,
    p_reason_code, p_note, p_requested_information_count, p_amount, p_currency, p_supersedes_event_id
  );
$$;

revoke all on function public.record_qualified_introduction_feedback(
  uuid, text, timestamptz, text, text, text, text, integer, numeric, text, uuid
) from public, anon;
grant execute on function public.record_qualified_introduction_feedback(
  uuid, text, timestamptz, text, text, text, text, integer, numeric, text, uuid
) to authenticated;

-- Platform-only projection. It remains outside the exposed schema and aggregates observed
-- behaviour separately from a lender's declared mandate.
create view private.lender_feedback_rollup
with (security_invoker = true)
as
with active_feedback as (
  select feedback.*
  from public.qualified_introduction_feedback_events feedback
  where not exists (
    select 1
    from public.qualified_introduction_feedback_events replacement
    where replacement.organization_id = feedback.organization_id
      and replacement.supersedes_event_id = feedback.id
  )
)
select
  introduction.fund_directory_id,
  introduction.mandate_fingerprint,
  count(distinct introduction.id) as introduction_count,
  count(distinct introduction.id) filter (where feedback.event_type = 'introduction_accepted') as accepted_count,
  count(distinct introduction.id) filter (where feedback.event_type = 'case_declined') as declined_count,
  coalesce(sum(feedback.requested_information_count) filter (where feedback.event_type = 'diligence_requested'), 0) as requested_information_count,
  count(distinct introduction.id) filter (where feedback.event_type = 'process_advanced') as advanced_count,
  count(distinct introduction.id) filter (where feedback.event_type = 'proposal_issued') as proposal_count,
  count(distinct introduction.id) filter (where feedback.event_type = 'funded') as funded_count,
  max(feedback.occurred_at) as latest_signal_at
from public.qualified_introductions introduction
left join active_feedback feedback
  on feedback.organization_id = introduction.organization_id
 and feedback.qualified_introduction_id = introduction.id
group by introduction.fund_directory_id, introduction.mandate_fingerprint;

revoke all on private.lender_feedback_rollup from public, anon, authenticated;
grant select on private.lender_feedback_rollup to service_role;
