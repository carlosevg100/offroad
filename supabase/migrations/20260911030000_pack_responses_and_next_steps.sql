-- What the market answered, recorded inside the product by the recipient organization itself, and
-- what the issuer decides to do next. A response is an observation: interest, a request for more
-- information, a decline, or nothing yet. It is never approval and never funding. Each response
-- names the pack revision it refers to, so a superseded revision keeps its own answers.

create table public.pack_recipient_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  share_id uuid not null,
  pack_revision_id uuid not null,
  recipient_organization_id uuid not null references public.organizations(id) on delete cascade,
  response_state text not null check (response_state in (
    'interested', 'needs_information', 'declined', 'no_response_yet'
  )),
  note text check (note is null or length(trim(note)) between 3 and 4000),
  ticket_amount numeric(22, 2) check (ticket_amount is null or ticket_amount >= 0),
  ticket_currency text check (ticket_currency is null or ticket_currency ~ '^[A-Z]{3}$'),
  tenor_months integer check (tenor_months is null or tenor_months between 1 and 600),
  pricing_basis text check (pricing_basis is null or pricing_basis ~ '^[a-z][a-z0-9_]{1,60}$'),
  pricing_min numeric(9, 4) check (pricing_min is null or pricing_min >= 0),
  pricing_max numeric(9, 4) check (pricing_max is null or pricing_max >= 0),
  requested_conditions jsonb not null default '[]'::jsonb check (
    jsonb_typeof(requested_conditions) = 'array' and jsonb_array_length(requested_conditions) <= 20
  ),
  term_objections jsonb not null default '[]'::jsonb check (
    jsonb_typeof(term_objections) = 'array' and jsonb_array_length(term_objections) <= 20
  ),
  supersedes_response_id uuid,
  occurred_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, share_id)
    references public.pack_distribution_shares(organization_id, id) on delete cascade,
  foreign key (organization_id, pack_revision_id)
    references public.information_pack_revisions(organization_id, id) on delete restrict,
  foreign key (organization_id, supersedes_response_id)
    references public.pack_recipient_responses(organization_id, id),
  constraint pack_recipient_responses_ticket_paired check (
    (ticket_amount is null) = (ticket_currency is null)
  ),
  constraint pack_recipient_responses_pricing_ordered check (
    pricing_min is null or pricing_max is null or pricing_max >= pricing_min
  ),
  constraint pack_recipient_responses_pricing_basis_needs_range check (
    pricing_basis is null or pricing_min is not null
  ),
  constraint pack_recipient_responses_decline_is_explained check (
    response_state <> 'declined'
      or note is not null
      or jsonb_array_length(term_objections) > 0
  ),
  constraint pack_recipient_responses_silence_is_empty check (
    response_state <> 'no_response_yet'
      or (note is null and ticket_amount is null and tenor_months is null and pricing_min is null
        and jsonb_array_length(requested_conditions) = 0 and jsonb_array_length(term_objections) = 0)
  ),
  constraint pack_recipient_responses_supersedes_other check (
    supersedes_response_id is distinct from id
  )
);

create unique index pack_recipient_responses_supersedes_idx
  on public.pack_recipient_responses (organization_id, supersedes_response_id)
  where supersedes_response_id is not null;
create index pack_recipient_responses_share_idx
  on public.pack_recipient_responses (organization_id, share_id, occurred_at desc);
create index pack_recipient_responses_session_idx
  on public.pack_recipient_responses (organization_id, intake_session_id, occurred_at desc);
create index pack_recipient_responses_revision_idx
  on public.pack_recipient_responses (organization_id, pack_revision_id);
create index pack_recipient_responses_recipient_idx
  on public.pack_recipient_responses (recipient_organization_id, occurred_at desc);
create index pack_recipient_responses_recorded_by_idx
  on public.pack_recipient_responses (recorded_by);

-- The issuer's own next step for one recipient. It stays private to the issuer side.
create table public.pack_distribution_next_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  share_id uuid not null,
  pack_revision_id uuid not null,
  step_code text not null check (step_code in (
    'prepare_information_answer', 'revise_structure', 'schedule_conversation',
    'keep_on_hold', 'close_without_continuation'
  )),
  note text check (note is null or length(trim(note)) between 3 and 2000),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  foreign key (organization_id, share_id)
    references public.pack_distribution_shares(organization_id, id) on delete cascade,
  foreign key (organization_id, pack_revision_id)
    references public.information_pack_revisions(organization_id, id) on delete restrict
);

create index pack_distribution_next_steps_share_idx
  on public.pack_distribution_next_steps (organization_id, share_id, recorded_at desc);
create index pack_distribution_next_steps_session_idx
  on public.pack_distribution_next_steps (organization_id, intake_session_id, recorded_at desc);
create index pack_distribution_next_steps_revision_idx
  on public.pack_distribution_next_steps (organization_id, pack_revision_id);
create index pack_distribution_next_steps_recorded_by_idx
  on public.pack_distribution_next_steps (recorded_by);

create trigger pack_recipient_responses_audit
  after insert or update or delete on public.pack_recipient_responses
  for each row execute function private.capture_audit_event();
create trigger pack_distribution_next_steps_audit
  after insert or update or delete on public.pack_distribution_next_steps
  for each row execute function private.capture_audit_event();

alter table public.pack_recipient_responses enable row level security;
alter table public.pack_recipient_responses force row level security;
alter table public.pack_distribution_next_steps enable row level security;
alter table public.pack_distribution_next_steps force row level security;

create policy pack_recipient_responses_issuer_select
  on public.pack_recipient_responses for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy pack_recipient_responses_recipient_select
  on public.pack_recipient_responses for select to authenticated
  using ((select private.is_org_member(recipient_organization_id)));
create policy pack_distribution_next_steps_select
  on public.pack_distribution_next_steps for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

revoke all privileges on public.pack_recipient_responses from public, anon, authenticated;
revoke all privileges on public.pack_distribution_next_steps from public, anon, authenticated;
grant select on public.pack_recipient_responses to authenticated;
grant select on public.pack_distribution_next_steps to authenticated;

create or replace function private.pack_response_codes_valid(p_entries jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(p_entries), 'null') = 'array'
    and jsonb_array_length(p_entries) <= 20
    and not exists (
      select 1
      from jsonb_array_elements(p_entries) entry(value)
      where jsonb_typeof(entry.value) <> 'object'
        or coalesce(entry.value ->> 'code', '') !~ '^[a-z][a-z0-9_]{1,63}$'
        or length(coalesce(entry.value ->> 'note', '')) > 500
    );
$$;

revoke all on function private.pack_response_codes_valid(jsonb) from public, anon;
grant execute on function private.pack_response_codes_valid(jsonb) to authenticated;

create or replace function private.record_pack_recipient_response(
  p_share_id uuid,
  p_response_state text,
  p_note text,
  p_ticket_amount numeric,
  p_ticket_currency text,
  p_tenor_months integer,
  p_pricing_basis text,
  p_pricing_min numeric,
  p_pricing_max numeric,
  p_requested_conditions jsonb,
  p_term_objections jsonb,
  p_supersedes_response_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  share_row public.pack_distribution_shares;
  superseded public.pack_recipient_responses;
  conditions jsonb := coalesce(p_requested_conditions, '[]'::jsonb);
  objections jsonb := coalesce(p_term_objections, '[]'::jsonb);
  response_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select row.* into share_row
  from public.pack_distribution_shares row
  where row.id = p_share_id;
  if not found then
    raise exception 'shared_information_pack_not_available' using errcode = '42501';
  end if;
  if not (select private.pack_share_live_for_recipient(share_row.organization_id, share_row.id)) then
    raise exception 'shared_information_pack_not_available' using errcode = '42501';
  end if;
  if p_response_state not in ('interested', 'needs_information', 'declined', 'no_response_yet') then
    raise exception 'pack_response_state_invalid' using errcode = '22023';
  end if;
  if not (select private.pack_response_codes_valid(conditions))
    or not (select private.pack_response_codes_valid(objections)) then
    raise exception 'pack_response_structured_feedback_invalid' using errcode = '22023';
  end if;
  if p_supersedes_response_id is not null then
    select row.* into superseded
    from public.pack_recipient_responses row
    where row.organization_id = share_row.organization_id and row.id = p_supersedes_response_id;
    if not found or superseded.share_id <> share_row.id then
      raise exception 'pack_response_supersession_invalid' using errcode = '22023';
    end if;
  end if;

  insert into public.pack_recipient_responses (
    organization_id, intake_session_id, share_id, pack_revision_id, recipient_organization_id,
    response_state, note, ticket_amount, ticket_currency, tenor_months,
    pricing_basis, pricing_min, pricing_max, requested_conditions, term_objections,
    supersedes_response_id, recorded_by
  ) values (
    share_row.organization_id, share_row.intake_session_id, share_row.id, share_row.pack_revision_id,
    share_row.recipient_organization_id, p_response_state, nullif(trim(coalesce(p_note, '')), ''),
    p_ticket_amount, upper(nullif(trim(coalesce(p_ticket_currency, '')), '')), p_tenor_months,
    nullif(trim(coalesce(p_pricing_basis, '')), ''), p_pricing_min, p_pricing_max,
    conditions, objections, p_supersedes_response_id, actor_id
  ) returning id into response_id;

  return response_id;
end;
$$;

create or replace function private.record_pack_distribution_next_step(
  p_share_id uuid,
  p_step_code text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  share_row public.pack_distribution_shares;
  step_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select row.* into share_row
  from public.pack_distribution_shares row
  where row.id = p_share_id;
  if not found then
    raise exception 'pack_distribution_share_not_found' using errcode = 'P0002';
  end if;
  if not (select private.can_access_intake_session(share_row.organization_id, share_row.intake_session_id)) then
    raise exception 'pack_distribution_forbidden' using errcode = '42501';
  end if;
  if p_step_code not in (
    'prepare_information_answer', 'revise_structure', 'schedule_conversation',
    'keep_on_hold', 'close_without_continuation'
  ) then
    raise exception 'pack_next_step_invalid' using errcode = '22023';
  end if;

  insert into public.pack_distribution_next_steps (
    organization_id, intake_session_id, share_id, pack_revision_id, step_code, note, recorded_by
  ) values (
    share_row.organization_id, share_row.intake_session_id, share_row.id, share_row.pack_revision_id,
    p_step_code, nullif(trim(coalesce(p_note, '')), ''), actor_id
  ) returning id into step_id;

  return step_id;
end;
$$;

create or replace function public.record_pack_recipient_response(
  p_share_id uuid,
  p_response_state text,
  p_note text default null,
  p_ticket_amount numeric default null,
  p_ticket_currency text default null,
  p_tenor_months integer default null,
  p_pricing_basis text default null,
  p_pricing_min numeric default null,
  p_pricing_max numeric default null,
  p_requested_conditions jsonb default '[]'::jsonb,
  p_term_objections jsonb default '[]'::jsonb,
  p_supersedes_response_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_pack_recipient_response(
    p_share_id, p_response_state, p_note, p_ticket_amount, p_ticket_currency, p_tenor_months,
    p_pricing_basis, p_pricing_min, p_pricing_max, p_requested_conditions, p_term_objections,
    p_supersedes_response_id
  );
$$;

create or replace function public.record_pack_distribution_next_step(
  p_share_id uuid,
  p_step_code text,
  p_note text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.record_pack_distribution_next_step(p_share_id, p_step_code, p_note);
$$;

revoke all on function private.record_pack_recipient_response(
  uuid, text, text, numeric, text, integer, text, numeric, numeric, jsonb, jsonb, uuid
) from public, anon;
revoke all on function private.record_pack_distribution_next_step(uuid, text, text) from public, anon;
revoke all on function public.record_pack_recipient_response(
  uuid, text, text, numeric, text, integer, text, numeric, numeric, jsonb, jsonb, uuid
) from public, anon;
revoke all on function public.record_pack_distribution_next_step(uuid, text, text) from public, anon;
grant execute on function private.record_pack_recipient_response(
  uuid, text, text, numeric, text, integer, text, numeric, numeric, jsonb, jsonb, uuid
) to authenticated;
grant execute on function private.record_pack_distribution_next_step(uuid, text, text) to authenticated;
grant execute on function public.record_pack_recipient_response(
  uuid, text, text, numeric, text, integer, text, numeric, numeric, jsonb, jsonb, uuid
) to authenticated;
grant execute on function public.record_pack_distribution_next_step(uuid, text, text) to authenticated;

comment on table public.pack_recipient_responses is
  'What a recipient organization answered about an exact pack revision: interest, a request for information, a decline, or nothing yet. Never an approval and never funding.';
comment on table public.pack_distribution_next_steps is
  'The issuer next step for one recipient. It stays on the issuer side and states work, not an outcome.';
