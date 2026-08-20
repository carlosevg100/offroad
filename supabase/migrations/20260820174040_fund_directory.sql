-- ---------------------------------------------------------------------------------------------
-- The fund directory: Offroad's map of the market, and the funds' own declarations, in one place.
--
-- `public.funds` and `public.mandate_versions` already exist and are tenant-scoped — they model a
-- fund that has an organization here. The map we are building does not fit that shape: most funds
-- in it will never have registered, and what we know about them comes from CVM filings, announced
-- transactions, offering documents and conversations. That knowledge belongs to no tenant. It is
-- the platform's, and modelling it as somebody's private data would either force a fake tenant or
-- leak our own asset into a customer's workspace.
--
-- Two tables, and the design turns on one thing: **a fund's own declaration and our research are
-- observations of the same criterion, in the same list.** That is what lets `@offroad/fund-mandate`
-- prefer what the fund said while still noticing that its last twelve deals disagree. Split them
-- across two schemas and that comparison stops being possible.
--
-- Who can see what:
--
--   * Companies and advisors: **nothing**. Not one row. The fund map is the asset; what a company
--     receives is a conclusion drawn from it — how many funds fit, what excludes them, what would
--     unlock the rest — never the boxes themselves.
--   * A fund that has registered and claimed its record: its own row and its own observations, and
--     it may add `declared` observations. It cannot write any other provenance, because a fund
--     backdating an "observed" record would be editing our research rather than stating its
--     position.
--   * Offroad: through migrations today, and through a service account on the worker pattern when
--     the research pipeline exists. No new platform-admin role is invented here.
-- ---------------------------------------------------------------------------------------------

create table if not exists public.fund_directory (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  short_name text,
  -- Digits only, no mask, when known. Not unique: a manager may appear before its CNPJ is found.
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  kind text not null check (kind in (
    'fidc', 'credit_fund', 'securitizadora', 'bank', 'family_office',
    'multi_strategy', 'factoring', 'development_agency', 'other'
  )),
  /** Our classification: the bucket that drives what we assume before we know. */
  bucket text,
  website text,
  cvm_code text,
  /**
   * How far along our relationship with this fund is. `registered` means they hold the pen on
   * their own box; everything before that means the record is ours and should read as ours.
   */
  status text not null default 'mapped' check (status in ('mapped', 'researching', 'contacted', 'registered', 'declined', 'inactive')),
  /** Set when the fund signs up and claims the record. Null for everyone we have only mapped. */
  claimed_by_organization_id uuid references public.organizations (id) on delete set null,
  claimed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fund_directory_claim_is_dated check ((claimed_by_organization_id is null) = (claimed_at is null))
);

comment on table public.fund_directory is
  'Offroad''s map of private-credit funds. Platform data, not tenant data: companies and advisors read nothing here, and a registered fund reads only its own row.';

create unique index if not exists fund_directory_claim_idx
  on public.fund_directory (claimed_by_organization_id)
  where claimed_by_organization_id is not null;
create index if not exists fund_directory_kind_idx on public.fund_directory (kind, status);
create index if not exists fund_directory_cnpj_idx on public.fund_directory (cnpj) where cnpj is not null;

-- ---------------------------------------------------------------------------------------------
-- One observation of one criterion, from one source, true as at one date.
--
-- Append-only. A correction is a newer observation, not an edit — which is exactly how the
-- resolver reads it, since at equal provenance the fresher one wins. Letting rows be rewritten
-- would destroy the history that makes "declared in January, behaving differently since June"
-- visible at all.
-- ---------------------------------------------------------------------------------------------

create table if not exists public.fund_mandate_observations (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.fund_directory (id) on delete cascade,
  criterion text not null check (criterion in (
    'ticket', 'term_months', 'sectors', 'instruments', 'collateral',
    'geographies', 'leverage_ceiling', 'minimum_dscr', 'active'
  )),
  /** Shape depends on the criterion; validated by the package that reads it, not by the column. */
  value jsonb not null,
  provenance text not null check (provenance in ('declared', 'conversation', 'observed', 'published', 'inferred')),
  /** The date the value was true. Never the date the row was written. */
  observed_at date not null check (observed_at <= current_date),
  /** Where it came from, in words somebody can check: "escritura da 3ª emissão", "call 12/08". */
  note text,
  source_url text,
  recorded_by uuid references auth.users (id),
  recorded_at timestamptz not null default now()
);

comment on table public.fund_mandate_observations is
  'Append-only observations of a fund''s mandate criteria. A correction is a newer observation, never an edit — the history is what makes a declaration diverging from behaviour visible.';

create index if not exists fund_mandate_observations_fund_idx
  on public.fund_mandate_observations (fund_id, criterion, observed_at desc);
create index if not exists fund_mandate_observations_recorded_by_idx
  on public.fund_mandate_observations (recorded_by);

-- ---------------------------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------------------------

alter table public.fund_directory enable row level security;
alter table public.fund_directory force row level security;
alter table public.fund_mandate_observations enable row level security;
alter table public.fund_mandate_observations force row level security;

/**
 * True when the caller belongs to the organization that has claimed this fund's record.
 *
 * `security definer` because it reads `organization_memberships`, which the caller may not select
 * across rows; `private` and revoked from public per the repository's RPC rules.
 */
create or replace function private.can_manage_fund(p_fund_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.fund_directory directory
      join public.organization_memberships membership
        on membership.organization_id = directory.claimed_by_organization_id
      where directory.id = p_fund_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    );
$$;

revoke all on function private.can_manage_fund(uuid) from public;
grant execute on function private.can_manage_fund(uuid) to authenticated;

drop policy if exists fund_directory_select_own on public.fund_directory;
create policy fund_directory_select_own on public.fund_directory
  for select to authenticated
  using ((select private.can_manage_fund(id)));

drop policy if exists fund_directory_update_own on public.fund_directory;
create policy fund_directory_update_own on public.fund_directory
  for update to authenticated
  using ((select private.can_manage_fund(id)))
  with check ((select private.can_manage_fund(id)));

-- No insert and no delete for tenants. Records are seeded by us; a fund claims one, it does not
-- create one, and nobody deletes the market's history.

drop policy if exists fund_mandate_observations_select_own on public.fund_mandate_observations;
create policy fund_mandate_observations_select_own on public.fund_mandate_observations
  for select to authenticated
  using ((select private.can_manage_fund(fund_id)));

drop policy if exists fund_mandate_observations_declare on public.fund_mandate_observations;
create policy fund_mandate_observations_declare on public.fund_mandate_observations
  for insert to authenticated
  with check (
    (select private.can_manage_fund(fund_id))
    -- A fund states its own position. It does not get to write our research: an "observed" row
    -- inserted by the fund would be the subject editing the evidence about itself.
    and provenance = 'declared'
    and recorded_by = (select auth.uid())
  );

-- Append-only: no update, no delete policy, and the grants below withhold both privileges so a
-- write attempt fails loudly (42501) instead of silently touching zero rows.

revoke all on public.fund_directory from public;
revoke all on public.fund_mandate_observations from public;
grant select, update (short_name, website, notes, status) on public.fund_directory to authenticated;
grant select, insert on public.fund_mandate_observations to authenticated;

drop trigger if exists fund_directory_set_updated_at on public.fund_directory;
create trigger fund_directory_set_updated_at
  before update on public.fund_directory
  for each row execute function private.set_updated_at();
