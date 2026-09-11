-- ---------------------------------------------------------------------------------------------
-- Verified current mandates: what a financier says it wants today, and who confirmed it.
--
-- The directory already holds our research (`public.fund_directory`,
-- `public.fund_mandate_observations`) and the tenant already holds an older, looser record
-- (`public.funds`, `public.mandate_versions`). Neither answers the question this migration
-- exists for: **is this mandate current, and did the organization itself say so?**
--
-- That question has a precise consequence in the product. A candidate built from a public
-- filing, or from deals a fund did two years ago, is a research hypothesis. A candidate built
-- from a mandate the organization registered and confirmed here, inside its validity window, is
-- a verified fit. Collapsing the two is how a desk tells a company "this fund wants your deal"
-- on the strength of a CVM registration nobody ever read to them.
--
-- So the record is split in two on purpose:
--
--   * `public.provider_mandates`: the structured, versioned mandate. Instruments, ticket range
--     and currency, restrictions (sector, geography, credit profile, collateral, tenor), the
--     validity window and the sources it was built from.
--   * `public.provider_mandate_confirmations`: append-only events. Who confirmed, when, and
--     through which channel: the organization declaring it here, an official document reference,
--     or a contact Offroad recorded with its date and record id.
--
-- Two rules are enforced by the database rather than by the interface, because both are the sort
-- of thing an interface eventually forgets:
--
--   1. **A record cannot be confirmed without a confirmation event.** `status` is withheld from
--      the tenant's update grant and a trigger refuses any confirmed row with no event. A public
--      record therefore cannot be promoted by writing a column.
--   2. **Historical activity is never current interest.** Past deals and public filings live in
--      the directory tables and keep their own provenance. Nothing here can be written from them.
--
-- Expiry is derived, never scheduled. `private.provider_mandate_effective_status_v1` reads the
-- validity window against the date the question is asked, so a mandate whose window closed is
-- expired for matching the moment it closes, with no cron and no background write.
-- ---------------------------------------------------------------------------------------------

/**
 * True when a free-form label list is usable: no nulls, no blanks, bounded length and count.
 *
 * Sector and geography are deliberately free text: the market does not agree on a taxonomy, and
 * forcing one would silently drop the restriction a fund actually stated. What cannot be allowed
 * is an empty string, which reads as "no restriction" downstream and is the opposite of true.
 */
create or replace function private.provider_mandate_labels_valid(p_labels text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_labels is not null
    and cardinality(p_labels) <= 40
    and not exists (
      select 1 from unnest(p_labels) as label
      where label is null or char_length(btrim(label)) not between 1 and 200
    );
$$;

-- A check constraint runs as the caller, so the helper it calls must be executable by the
-- caller. It reads nothing and decides nothing but the shape of a text array.
revoke all on function private.provider_mandate_labels_valid(text[]) from public, anon;
grant execute on function private.provider_mandate_labels_valid(text[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The mandate record
-- ---------------------------------------------------------------------------------------------

create table if not exists public.provider_mandates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  fund_id uuid not null,
  version_number integer not null check (version_number > 0),
  /**
   * `draft` was registered and not confirmed. `confirmed` carries an event. `expired` is a
   * closed window recorded explicitly; matching derives expiry from the window regardless.
   * `withdrawn` is the organization taking it back, and is terminal.
   */
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'expired', 'withdrawn')),
  currency text not null check (currency in ('BRL', 'USD', 'EUR')),
  ticket_min numeric(20, 2) not null check (ticket_min > 0),
  ticket_max numeric(20, 2) not null check (ticket_max >= ticket_min),
  instruments text[] not null,
  sectors text[] not null default '{}'::text[],
  geographies text[] not null default '{}'::text[],
  collateral text[] not null default '{}'::text[],
  term_months_min integer check (term_months_min between 1 and 1200),
  term_months_max integer check (term_months_max between 1 and 1200),
  /** Credit profile, in the two numbers a credit committee actually underwrites to. */
  leverage_ceiling numeric(10, 4) check (leverage_ceiling >= 0),
  minimum_dscr numeric(10, 4) check (minimum_dscr >= 0),
  accepting_new_transactions boolean not null default true,
  valid_from date not null,
  valid_until date,
  /** Where the record came from, as typed entries: {kind, reference, note}. Never a public row. */
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 20),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id),
  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users (id),
  note text check (note is null or char_length(note) <= 2000),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, id, version_number),
  unique (organization_id, fund_id, version_number),
  foreign key (organization_id, fund_id) references public.funds (organization_id, id) on delete cascade,
  constraint provider_mandates_instruments_valid check (
    cardinality(instruments) between 1 and 10
    and instruments <@ array['debenture', 'nota_comercial', 'ccb', 'cri', 'cra', 'fidc',
      'direct_loan', 'receivables_purchase', 'project_finance', 'equity_kicker_debt']::text[]),
  constraint provider_mandates_collateral_valid check (
    cardinality(collateral) <= 9
    and collateral <@ array['recebiveis', 'imovel', 'equipamento', 'estoque', 'aval_fianca',
      'cessao_fiduciaria', 'alienacao_fiduciaria_quotas', 'conta_reserva', 'quirografario']::text[]),
  constraint provider_mandates_sectors_valid check (private.provider_mandate_labels_valid(sectors)),
  constraint provider_mandates_geographies_valid check (private.provider_mandate_labels_valid(geographies)),
  constraint provider_mandates_window_ordered check (valid_until is null or valid_until >= valid_from),
  constraint provider_mandates_tenor_paired check ((term_months_min is null) = (term_months_max is null)),
  constraint provider_mandates_tenor_ordered
    check (term_months_min is null or term_months_max is null or term_months_max >= term_months_min),
  constraint provider_mandates_confirmation_dated check ((confirmed_at is null) = (confirmed_by is null)),
  constraint provider_mandates_confirmed_has_date check (status <> 'confirmed' or confirmed_at is not null),
  constraint provider_mandates_draft_never_confirmed check (status <> 'draft' or confirmed_at is null),
  constraint provider_mandates_withdrawal_dated check ((withdrawn_at is null) = (withdrawn_by is null)),
  constraint provider_mandates_withdrawn_has_date check ((status = 'withdrawn') = (withdrawn_at is not null)),
  constraint provider_mandates_expired_has_window check (status <> 'expired' or valid_until is not null)
);

comment on table public.provider_mandates is
  'A capital_provider organization''s own structured mandate: instruments, ticket, currency, restrictions, validity and sources. Confirmed only through an event in provider_mandate_confirmations; a public record can never be promoted by writing a column.';

create index if not exists provider_mandates_fund_idx
  on public.provider_mandates (organization_id, fund_id, version_number desc);
create index if not exists provider_mandates_status_idx
  on public.provider_mandates (organization_id, status, valid_until);
create index if not exists provider_mandates_created_by_idx on public.provider_mandates (created_by);
create index if not exists provider_mandates_confirmed_by_idx on public.provider_mandates (confirmed_by);
create index if not exists provider_mandates_withdrawn_by_idx on public.provider_mandates (withdrawn_by);

-- ---------------------------------------------------------------------------------------------
-- The confirmation event
--
-- Append-only, and separate from the mandate on purpose: the record can be edited while it is a
-- draft, but the moment somebody confirmed it is a fact with a date and an author, and rewriting
-- that is exactly what "verified" has to rule out.
-- ---------------------------------------------------------------------------------------------

create table if not exists public.provider_mandate_confirmations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  mandate_id uuid not null,
  /** The version confirmed. A later version is a new record and needs its own confirmation. */
  mandate_version_number integer not null check (mandate_version_number > 0),
  channel text not null check (channel in ('direct_declaration', 'official_document', 'recorded_contact')),
  /** For `official_document`: the document this confirmation rests on, in checkable words. */
  document_reference text,
  /** For `recorded_contact`: the contact Offroad recorded, with the date it happened. */
  contact_record_id uuid,
  contact_date date,
  valid_from date not null,
  valid_until date,
  note text check (note is null or char_length(note) <= 2000),
  confirmed_by uuid not null references auth.users (id),
  confirmed_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, mandate_id, mandate_version_number)
    references public.provider_mandates (organization_id, id, version_number) on delete cascade,
  constraint provider_mandate_confirmations_window_ordered
    check (valid_until is null or valid_until >= valid_from),
  constraint provider_mandate_confirmations_document_evidence
    check (channel <> 'official_document'
      or (document_reference is not null and char_length(btrim(document_reference)) between 1 and 500)),
  constraint provider_mandate_confirmations_contact_evidence
    check (channel <> 'recorded_contact' or (contact_record_id is not null and contact_date is not null)),
  constraint provider_mandate_confirmations_declaration_is_bare
    check (channel <> 'direct_declaration'
      or (document_reference is null and contact_record_id is null and contact_date is null))
);

comment on table public.provider_mandate_confirmations is
  'Append-only confirmation events for a provider mandate: who confirmed, when, and through which channel (the organization declaring it here, an official document reference, or an Offroad-recorded contact with its date and record id).';

create index if not exists provider_mandate_confirmations_mandate_idx
  on public.provider_mandate_confirmations (organization_id, mandate_id, confirmed_at desc);
create index if not exists provider_mandate_confirmations_confirmed_by_idx
  on public.provider_mandate_confirmations (confirmed_by);

-- ---------------------------------------------------------------------------------------------
-- A confirmed row without an event is refused, whatever wrote it
-- ---------------------------------------------------------------------------------------------

create or replace function private.guard_provider_mandate_confirmation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.provider_mandate_confirmations event
    where event.organization_id = new.organization_id
      and event.mandate_id = new.id
      and event.mandate_version_number = new.version_number
  ) then
    raise exception 'provider_mandate_confirmation_event_required'
      using errcode = '42501', detail = 'mandate=' || new.id::text;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_provider_mandate_confirmation_v1() from public, anon, authenticated;

drop trigger if exists provider_mandates_confirmation_required on public.provider_mandates;
create trigger provider_mandates_confirmation_required
  after insert or update on public.provider_mandates
  for each row when (new.status = 'confirmed')
  execute function private.guard_provider_mandate_confirmation_v1();

drop trigger if exists provider_mandates_set_updated_at on public.provider_mandates;
create trigger provider_mandates_set_updated_at
  before update on public.provider_mandates
  for each row execute function private.set_updated_at();

drop trigger if exists provider_mandates_audit on public.provider_mandates;
create trigger provider_mandates_audit
  after insert or update or delete on public.provider_mandates
  for each row execute function private.capture_audit_event();

drop trigger if exists provider_mandate_confirmations_audit on public.provider_mandate_confirmations;
create trigger provider_mandate_confirmations_audit
  after insert or update or delete on public.provider_mandate_confirmations
  for each row execute function private.capture_audit_event();

-- ---------------------------------------------------------------------------------------------
-- Access: the organization holds the pen on its own mandate, and nobody else reads it
-- ---------------------------------------------------------------------------------------------

alter table public.provider_mandates enable row level security;
alter table public.provider_mandates force row level security;
alter table public.provider_mandate_confirmations enable row level security;
alter table public.provider_mandate_confirmations force row level security;

drop policy if exists provider_mandates_select on public.provider_mandates;
create policy provider_mandates_select on public.provider_mandates
  for select to authenticated
  using ((select private.is_org_type_member(organization_id, array['capital_provider', 'offroad'])));

drop policy if exists provider_mandates_insert on public.provider_mandates;
create policy provider_mandates_insert on public.provider_mandates
  for insert to authenticated
  with check (
    (select private.is_org_type_member(organization_id, array['capital_provider', 'offroad']))
    -- A record enters as a draft. Confirmation is an event, not a value somebody types.
    and status = 'draft'
    and confirmed_at is null
    and withdrawn_at is null
    and created_by = (select auth.uid())
  );

drop policy if exists provider_mandates_update on public.provider_mandates;
create policy provider_mandates_update on public.provider_mandates
  for update to authenticated
  using ((select private.is_org_type_member(organization_id, array['capital_provider', 'offroad'])))
  with check ((select private.is_org_type_member(organization_id, array['capital_provider', 'offroad'])));

drop policy if exists provider_mandate_confirmations_select on public.provider_mandate_confirmations;
create policy provider_mandate_confirmations_select on public.provider_mandate_confirmations
  for select to authenticated
  using ((select private.is_org_type_member(organization_id, array['capital_provider', 'offroad'])));

-- No insert policy for tenants: a confirmation event is written by the command below, which also
-- moves the record, so the two can never disagree. No update and no delete policy at all, and the
-- mandate itself is never deletable either: `delete` is outside both grants below, so a withdrawal
-- is recorded rather than erased.

revoke all on public.provider_mandates from public, anon, authenticated;
revoke all on public.provider_mandate_confirmations from public, anon, authenticated;
-- `status`, `confirmed_*` and `withdrawn_*` are deliberately outside the update grant: the only
-- path to them is the command, which writes the event in the same transaction.
grant select, insert on public.provider_mandates to authenticated;
grant update (
  currency, ticket_min, ticket_max, instruments, sectors, geographies, collateral,
  term_months_min, term_months_max, leverage_ceiling, minimum_dscr,
  accepting_new_transactions, valid_from, valid_until, sources, note
) on public.provider_mandates to authenticated;
grant select on public.provider_mandate_confirmations to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Effective status: expiry is read from the window, never scheduled
-- ---------------------------------------------------------------------------------------------

create or replace function private.provider_mandate_effective_status_v1(
  p_status text,
  p_valid_from date,
  p_valid_until date,
  p_as_of date
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status = 'withdrawn' then 'withdrawn'
    when p_status <> 'confirmed' then p_status
    when p_valid_from > p_as_of then 'draft'
    when p_valid_until is not null and p_valid_until < p_as_of then 'expired'
    else 'confirmed'
  end;
$$;

revoke all on function private.provider_mandate_effective_status_v1(text, date, date, date) from public, anon;
grant execute on function private.provider_mandate_effective_status_v1(text, date, date, date) to authenticated;

comment on function private.provider_mandate_effective_status_v1(text, date, date, date) is
  'The status matching acts on. A confirmed mandate whose validity window has closed is expired from that day, with no scheduled job and no background write.';

/** The organization's own reading of its mandates, with expiry already applied. */
create or replace function public.list_provider_mandates_v1(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_value order by fund_name, version_number desc), '[]'::jsonb)
  from (
    select
      fund.name as fund_name,
      mandate.version_number,
      jsonb_build_object(
        'id', mandate.id,
        'fundId', mandate.fund_id,
        'fundName', fund.name,
        'fundStrategy', fund.strategy,
        'versionNumber', mandate.version_number,
        'status', mandate.status,
        'effectiveStatus', private.provider_mandate_effective_status_v1(
          mandate.status, mandate.valid_from, mandate.valid_until, current_date),
        'currency', mandate.currency,
        'ticketMin', mandate.ticket_min::text,
        'ticketMax', mandate.ticket_max::text,
        'instruments', to_jsonb(mandate.instruments),
        'sectors', to_jsonb(mandate.sectors),
        'geographies', to_jsonb(mandate.geographies),
        'collateral', to_jsonb(mandate.collateral),
        'termMonthsMin', mandate.term_months_min,
        'termMonthsMax', mandate.term_months_max,
        'leverageCeiling', mandate.leverage_ceiling::text,
        'minimumDscr', mandate.minimum_dscr::text,
        'acceptingNewTransactions', mandate.accepting_new_transactions,
        'validFrom', mandate.valid_from,
        'validUntil', mandate.valid_until,
        'sources', mandate.sources,
        'confirmedAt', mandate.confirmed_at,
        'withdrawnAt', mandate.withdrawn_at,
        'note', mandate.note,
        'lastConfirmation', (
          select jsonb_build_object(
            'channel', event.channel, 'confirmedAt', event.confirmed_at,
            'documentReference', event.document_reference,
            'contactRecordId', event.contact_record_id, 'contactDate', event.contact_date,
            'validFrom', event.valid_from, 'validUntil', event.valid_until)
          from public.provider_mandate_confirmations event
          where event.organization_id = mandate.organization_id
            and event.mandate_id = mandate.id
          order by event.confirmed_at desc, event.id desc
          limit 1
        ),
        'confirmationCount', (
          select count(*) from public.provider_mandate_confirmations event
          where event.organization_id = mandate.organization_id and event.mandate_id = mandate.id
        )
      ) as row_value
    from public.provider_mandates mandate
    join public.funds fund
      on fund.organization_id = mandate.organization_id and fund.id = mandate.fund_id
    where mandate.organization_id = p_organization_id
  ) ordered;
$$;

revoke all on function public.list_provider_mandates_v1(uuid) from public, anon, authenticated;
grant execute on function public.list_provider_mandates_v1(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Commands
-- ---------------------------------------------------------------------------------------------

/**
 * Registers a fund (when it does not exist yet) and one new draft mandate version, in one call.
 *
 * The caller never chooses the version number or the status: the version is the next one for
 * that fund, and the status is always `draft`. Everything else is the mandate the organization
 * is describing, validated by the table's own constraints rather than re-implemented here.
 */
create or replace function private.register_provider_mandate_v1(
  p_organization_id uuid,
  p_fund_id uuid,
  p_fund_name text,
  p_fund_strategy text,
  p_mandate jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_type text;
  fund public.funds;
  next_version integer;
  created public.provider_mandates;
  tenor_min integer;
  tenor_max integer;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.is_org_type_member(p_organization_id, array['capital_provider', 'offroad']) then
    raise exception 'provider_mandate_denied' using errcode = '42501';
  end if;
  select organization_record.organization_type into org_type
  from public.organizations organization_record where organization_record.id = p_organization_id;
  perform private.require_workspace_capability(org_type, 'mandate_management');
  if coalesce(jsonb_typeof(p_mandate), 'null') <> 'object' then
    raise exception 'provider_mandate_payload_invalid' using errcode = '22023';
  end if;

  if p_fund_id is null then
    if char_length(btrim(coalesce(p_fund_name, ''))) not between 2 and 200
      or char_length(btrim(coalesce(p_fund_strategy, ''))) not between 2 and 200 then
      raise exception 'provider_fund_identity_invalid' using errcode = '22023';
    end if;
    insert into public.funds (organization_id, name, strategy, created_by)
    values (p_organization_id, btrim(p_fund_name), btrim(p_fund_strategy), (select auth.uid()))
    returning * into fund;
  else
    select * into fund from public.funds
    where funds.organization_id = p_organization_id and funds.id = p_fund_id for update;
    if not found then
      raise exception 'provider_fund_not_found' using errcode = 'P0002';
    end if;
  end if;

  select coalesce(max(mandate.version_number), 0) + 1 into next_version
  from public.provider_mandates mandate
  where mandate.organization_id = p_organization_id and mandate.fund_id = fund.id;

  tenor_min := nullif(p_mandate->>'termMonthsMin', '')::integer;
  tenor_max := nullif(p_mandate->>'termMonthsMax', '')::integer;

  insert into public.provider_mandates (
    organization_id, fund_id, version_number, status, currency, ticket_min, ticket_max,
    instruments, sectors, geographies, collateral, term_months_min, term_months_max,
    leverage_ceiling, minimum_dscr, accepting_new_transactions, valid_from, valid_until,
    sources, note, created_by
  ) values (
    p_organization_id, fund.id, next_version, 'draft',
    p_mandate->>'currency',
    (p_mandate->>'ticketMin')::numeric,
    (p_mandate->>'ticketMax')::numeric,
    coalesce((select array_agg(value#>>'{}') from jsonb_array_elements(p_mandate->'instruments')), '{}'::text[]),
    coalesce((select array_agg(btrim(value#>>'{}')) from jsonb_array_elements(p_mandate->'sectors')), '{}'::text[]),
    coalesce((select array_agg(btrim(value#>>'{}')) from jsonb_array_elements(p_mandate->'geographies')), '{}'::text[]),
    coalesce((select array_agg(value#>>'{}') from jsonb_array_elements(p_mandate->'collateral')), '{}'::text[]),
    tenor_min, tenor_max,
    nullif(p_mandate->>'leverageCeiling', '')::numeric,
    nullif(p_mandate->>'minimumDscr', '')::numeric,
    coalesce((p_mandate->>'acceptingNewTransactions')::boolean, true),
    coalesce(nullif(p_mandate->>'validFrom', '')::date, current_date),
    nullif(p_mandate->>'validUntil', '')::date,
    case when jsonb_typeof(p_mandate->'sources') = 'array' then p_mandate->'sources' else '[]'::jsonb end,
    nullif(btrim(coalesce(p_mandate->>'note', '')), ''),
    (select auth.uid())
  ) returning * into created;

  return jsonb_build_object(
    'fundId', fund.id, 'fundName', fund.name,
    'mandateId', created.id, 'versionNumber', created.version_number, 'status', created.status);
end;
$$;

create or replace function public.register_provider_mandate_v1(
  p_organization_id uuid,
  p_fund_id uuid default null,
  p_fund_name text default null,
  p_fund_strategy text default null,
  p_mandate jsonb default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.register_provider_mandate_v1(p_organization_id, p_fund_id, p_fund_name, p_fund_strategy, p_mandate);
$$;

/**
 * Confirms one mandate version: writes the event first, then moves the record onto it.
 *
 * The order matters. The event carries the proof, the trigger reads it, and a caller that
 * somehow reached the update alone would be refused. Confirming again is a renewal: a second
 * event with a new window, which is exactly what the surface asks for when a mandate ages.
 */
create or replace function private.confirm_provider_mandate_v1(
  p_organization_id uuid,
  p_mandate_id uuid,
  p_channel text,
  p_valid_from date,
  p_valid_until date,
  p_document_reference text,
  p_contact_record_id uuid,
  p_contact_date date,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_type text;
  mandate public.provider_mandates;
  event public.provider_mandate_confirmations;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.is_org_type_member(p_organization_id, array['capital_provider', 'offroad']) then
    raise exception 'provider_mandate_denied' using errcode = '42501';
  end if;
  select organization_record.organization_type into org_type
  from public.organizations organization_record where organization_record.id = p_organization_id;
  perform private.require_workspace_capability(org_type, 'mandate_management');

  select * into mandate from public.provider_mandates
  where provider_mandates.organization_id = p_organization_id
    and provider_mandates.id = p_mandate_id for update;
  if not found then
    raise exception 'provider_mandate_not_found' using errcode = 'P0002';
  end if;
  if mandate.status = 'withdrawn' then
    raise exception 'provider_mandate_withdrawn' using errcode = '40001';
  end if;

  insert into public.provider_mandate_confirmations (
    organization_id, mandate_id, mandate_version_number, channel, document_reference,
    contact_record_id, contact_date, valid_from, valid_until, note, confirmed_by
  ) values (
    p_organization_id, mandate.id, mandate.version_number, p_channel,
    nullif(btrim(coalesce(p_document_reference, '')), ''),
    p_contact_record_id, p_contact_date,
    coalesce(p_valid_from, mandate.valid_from), p_valid_until,
    nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid())
  ) returning * into event;

  update public.provider_mandates set
    status = 'confirmed',
    valid_from = event.valid_from,
    valid_until = event.valid_until,
    confirmed_at = event.confirmed_at,
    confirmed_by = event.confirmed_by
  where provider_mandates.organization_id = p_organization_id and provider_mandates.id = mandate.id
  returning * into mandate;

  return jsonb_build_object(
    'mandateId', mandate.id, 'versionNumber', mandate.version_number, 'status', mandate.status,
    'confirmedAt', mandate.confirmed_at, 'validFrom', mandate.valid_from,
    'validUntil', mandate.valid_until, 'channel', event.channel,
    'effectiveStatus', private.provider_mandate_effective_status_v1(
      mandate.status, mandate.valid_from, mandate.valid_until, current_date));
end;
$$;

create or replace function public.confirm_provider_mandate_v1(
  p_organization_id uuid,
  p_mandate_id uuid,
  p_channel text,
  p_valid_from date default null,
  p_valid_until date default null,
  p_document_reference text default null,
  p_contact_record_id uuid default null,
  p_contact_date date default null,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.confirm_provider_mandate_v1(p_organization_id, p_mandate_id, p_channel, p_valid_from,
    p_valid_until, p_document_reference, p_contact_record_id, p_contact_date, p_note);
$$;

/** Withdraws a mandate. Terminal, and immediately outside matching in the same transaction. */
create or replace function private.withdraw_provider_mandate_v1(
  p_organization_id uuid,
  p_mandate_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_type text;
  mandate public.provider_mandates;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.is_org_type_member(p_organization_id, array['capital_provider', 'offroad']) then
    raise exception 'provider_mandate_denied' using errcode = '42501';
  end if;
  select organization_record.organization_type into org_type
  from public.organizations organization_record where organization_record.id = p_organization_id;
  perform private.require_workspace_capability(org_type, 'mandate_management');

  update public.provider_mandates set
    status = 'withdrawn',
    withdrawn_at = now(),
    withdrawn_by = (select auth.uid()),
    note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), provider_mandates.note)
  where provider_mandates.organization_id = p_organization_id
    and provider_mandates.id = p_mandate_id
    and provider_mandates.status <> 'withdrawn'
  returning * into mandate;
  if not found then
    raise exception 'provider_mandate_not_withdrawable' using errcode = 'P0002';
  end if;

  return jsonb_build_object('mandateId', mandate.id, 'status', mandate.status, 'withdrawnAt', mandate.withdrawn_at);
end;
$$;

create or replace function public.withdraw_provider_mandate_v1(
  p_organization_id uuid,
  p_mandate_id uuid,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.withdraw_provider_mandate_v1(p_organization_id, p_mandate_id, p_note);
$$;

revoke all on function private.register_provider_mandate_v1(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.register_provider_mandate_v1(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.confirm_provider_mandate_v1(uuid, uuid, text, date, date, text, uuid, date, text) from public, anon, authenticated;
revoke all on function public.confirm_provider_mandate_v1(uuid, uuid, text, date, date, text, uuid, date, text) from public, anon, authenticated;
revoke all on function private.withdraw_provider_mandate_v1(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.withdraw_provider_mandate_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.register_provider_mandate_v1(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.register_provider_mandate_v1(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function private.confirm_provider_mandate_v1(uuid, uuid, text, date, date, text, uuid, date, text) to authenticated;
grant execute on function public.confirm_provider_mandate_v1(uuid, uuid, text, date, date, text, uuid, date, text) to authenticated;
grant execute on function private.withdraw_provider_mandate_v1(uuid, uuid, text) to authenticated;
grant execute on function public.withdraw_provider_mandate_v1(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Matching reads the verified record first
--
-- The projection keeps its signature so `private.start_provider_case_fit_project_v1` picks this
-- up with no other change. What changes is which record answers for a fund:
--
--   * A fund with a `provider_mandates` record is answered by that record, and by nothing else.
--     When the record is confirmed and inside its window it becomes `declared` observations
--     dated at the confirmation. When it is a draft, expired or withdrawn it produces no
--     observation at all, so an expired or withdrawn mandate can never match.
--   * A fund with no such record keeps the legacy `mandate_versions` projection, whose
--     provenance still says plainly whether it was declared, published or inferred.
--
-- `mandateRecord` travels with the provider so the fit can say, per candidate, which version it
-- read, what its status is and when it was last confirmed.
-- ---------------------------------------------------------------------------------------------

create or replace function private.provider_case_fit_owned_sources_v1(p_org uuid, p_as_of timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb := '[]';
  r record;
  verified public.provider_mandates;
  event public.provider_mandate_confirmations;
  effective text;
  record_summary jsonb;
  c jsonb;
  fields jsonb;
  k text;
  raw jsonb;
  value jsonb;
  obs jsonb;
  provenance text;
  observed timestamptz;
begin
  for r in
    select f.id, f.name, f.organization_id, m.id mandate_id, m.constraints, m.source_kind, m.valid_from
    from public.funds f
    left join lateral (
      select mv.* from public.mandate_versions mv
      where mv.organization_id = p_org and mv.fund_id = f.id and mv.status = 'active'
        and mv.created_at <= p_as_of and mv.valid_from <= p_as_of::date
        and (mv.valid_until is null or mv.valid_until >= p_as_of::date)
      order by mv.version_number desc limit 1
    ) m on true
    where f.organization_id = p_org and f.status = 'active' and f.created_at <= p_as_of
    order by f.id
  loop
    -- The newest registered version answers, draft included. A fund that started describing new
    -- terms is not still offering the old ones, and saying so is the point of this record.
    select * into verified from public.provider_mandates pm
    where pm.organization_id = p_org and pm.fund_id = r.id and pm.created_at <= p_as_of
    order by pm.version_number desc limit 1;

    fields := '{}';
    record_summary := null;

    if found then
      -- The verified record answers for this fund, whatever the legacy row says.
      effective := private.provider_mandate_effective_status_v1(
        verified.status, verified.valid_from, verified.valid_until, p_as_of::date);
      select * into event from public.provider_mandate_confirmations e
      where e.organization_id = p_org and e.mandate_id = verified.id and e.confirmed_at <= p_as_of
      order by e.confirmed_at desc, e.id desc limit 1;
      record_summary := jsonb_build_object(
        'versionNumber', verified.version_number,
        'status', verified.status,
        'effectiveStatus', effective,
        'validFrom', verified.valid_from,
        'validUntil', verified.valid_until,
        'confirmedAt', verified.confirmed_at,
        'channel', event.channel,
        'confirmationCount', (select count(*) from public.provider_mandate_confirmations e2
          where e2.organization_id = p_org and e2.mandate_id = verified.id and e2.confirmed_at <= p_as_of));

      if effective = 'confirmed' and event.id is not null then
        observed := event.confirmed_at;
        foreach k in array array['ticket','termMonths','sectors','instruments','collateral','geographies','leverageCeiling','minimumDscr','active','currencies'] loop
          value := null;
          if k = 'ticket' then value := jsonb_build_object('min', trim(trailing '.' from trim(trailing '0' from verified.ticket_min::text)), 'max', trim(trailing '.' from trim(trailing '0' from verified.ticket_max::text)));
          elsif k = 'termMonths' and verified.term_months_min is not null and verified.term_months_max is not null then
            value := jsonb_build_object('min', verified.term_months_min, 'max', verified.term_months_max);
          elsif k = 'sectors' and cardinality(verified.sectors) > 0 then value := to_jsonb(verified.sectors);
          elsif k = 'instruments' then value := to_jsonb(verified.instruments);
          elsif k = 'collateral' and cardinality(verified.collateral) > 0 then value := to_jsonb(verified.collateral);
          elsif k = 'geographies' and cardinality(verified.geographies) > 0 then value := to_jsonb(verified.geographies);
          elsif k = 'leverageCeiling' and verified.leverage_ceiling is not null then
            value := to_jsonb(trim(trailing '.' from trim(trailing '0' from verified.leverage_ceiling::text)));
          elsif k = 'minimumDscr' and verified.minimum_dscr is not null then
            value := to_jsonb(trim(trailing '.' from trim(trailing '0' from verified.minimum_dscr::text)));
          elsif k = 'active' then value := to_jsonb(verified.accepting_new_transactions);
          elsif k = 'currencies' then value := jsonb_build_array(verified.currency);
          end if;
          obs := case when value is not null then jsonb_build_array(jsonb_build_object(
            'value', value, 'provenance', 'declared', 'observedAt', observed,
            'note', 'provider_mandates/' || verified.id::text || '; v' || verified.version_number::text || '; ' || event.channel))
            else '[]'::jsonb end;
          fields := fields || jsonb_build_object(k, obs);
        end loop;
      else
        -- Draft, expired or withdrawn: recorded, shown on the surface, never matched.
        foreach k in array array['ticket','termMonths','sectors','instruments','collateral','geographies','leverageCeiling','minimumDscr','active','currencies'] loop
          fields := fields || jsonb_build_object(k, '[]'::jsonb);
        end loop;
      end if;
    else
      c := coalesce(r.constraints, '{}'::jsonb);
      provenance := case r.source_kind when 'declared' then 'declared' when 'public' then 'published' else 'inferred' end;
      foreach k in array array['ticket','termMonths','sectors','instruments','collateral','geographies','leverageCeiling','minimumDscr','active','currencies'] loop
        value := null;
        if k='ticket' and c->>'ticket_min' ~ '^(0|[1-9][0-9]*)([.][0-9]+)?$' and c->>'ticket_max' ~ '^(0|[1-9][0-9]*)([.][0-9]+)?$' then value:=jsonb_build_object('min',c->>'ticket_min','max',c->>'ticket_max');
        elsif k='termMonths' and c->>'term_months_min' ~ '^[0-9]{1,4}$' and c->>'term_months_max' ~ '^[0-9]{1,4}$' then value:=jsonb_build_object('min',(c->>'term_months_min')::integer,'max',(c->>'term_months_max')::integer);
        elsif k in ('leverageCeiling','minimumDscr') then raw:=c->case k when 'leverageCeiling' then 'leverage_ceiling' else 'minimum_dscr' end;
          if raw#>>'{}' ~ '^(0|[1-9][0-9]*)([.][0-9]+)?$' then value:=to_jsonb(raw#>>'{}'); end if;
        elsif k='active' and jsonb_typeof(c->'active')='boolean' then value:=c->'active';
        elsif k in ('sectors','instruments','collateral','geographies','currencies') and jsonb_typeof(c->k)='array' and jsonb_array_length(c->k)>0
          and not exists(select 1 from jsonb_array_elements(c->k)a where jsonb_typeof(a)<>'string') then value:=c->k;
        end if;
        obs := case when value is not null then jsonb_build_array(jsonb_build_object('value',value,'provenance',provenance,'observedAt',(r.valid_from::timestamp at time zone 'UTC'),'note','mandate_versions/'||r.mandate_id::text||'; source='||r.source_kind||'; valid_from')) else '[]'::jsonb end;
        fields := fields || jsonb_build_object(k, obs);
      end loop;
    end if;

    result := result || jsonb_build_array(
      jsonb_build_object('providerId', r.id, 'name', r.name, 'ownerOrganizationId', p_org,
        'sourceClass', 'registered', 'mandate', fields)
      || case when record_summary is null then '{}'::jsonb else jsonb_build_object('mandateRecord', record_summary) end);
  end loop;
  return result;
end;
$$;

revoke all on function private.provider_case_fit_owned_sources_v1(uuid, timestamptz) from public, anon, authenticated;

comment on function private.provider_case_fit_owned_sources_v1(uuid, timestamptz) is
  'Projects a financier''s own funds for case fit. A fund holding a provider_mandates record is answered by that record alone: confirmed and current becomes dated declared evidence, while draft, expired or withdrawn produces no observation and therefore never matches.';
