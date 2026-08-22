-- The market stage persisted: one sounding per intake session, the investors on its list,
-- and an append-only log of what happened with each (teaser, NDA, room, questions,
-- indication, allocation). The log is the audit trail "who saw what, when"; it has no update
-- or delete policy on purpose. Stages and event types mirror @offroad/sounding, and the
-- package's guard test keeps the two lists equal.

create table public.soundings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  target_amount numeric(18, 2) not null check (target_amount > 0),
  currency text not null default 'BRL',
  cdi_pct numeric(8, 4) not null,
  ipca_pct numeric(8, 4),
  method text not null default 'price_priority' check (method in ('price_priority', 'pro_rata')),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, intake_session_id),
  foreign key (organization_id, intake_session_id) references public.document_intake_sessions (organization_id, id) on delete cascade
);

create table public.sounding_investors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  sounding_id uuid not null,
  investor_name text not null check (length(investor_name) between 1 and 200),
  investor_kind text not null check (investor_kind in ('credit_fund', 'bank_treasury', 'family_office', 'fidc_manager', 'venture_debt_fund', 'insurer', 'development_bank')),
  fund_directory_id uuid references public.fund_directory (id),
  stage text not null default 'listed' check (stage in ('listed', 'teaser_sent', 'nda_signed', 'room_opened', 'indicated', 'declined', 'allocated', 'dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, sounding_id) references public.soundings (organization_id, id) on delete cascade,
  foreign key (organization_id, intake_session_id) references public.document_intake_sessions (organization_id, id) on delete cascade
);

create index sounding_investors_by_sounding_idx on public.sounding_investors (organization_id, sounding_id, stage);

create table public.sounding_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  sounding_id uuid not null,
  investor_id uuid not null,
  event_type text not null check (event_type in ('listed', 'teaser_sent', 'nda_signed', 'room_opened', 'question_asked', 'question_answered', 'indication_received', 'declined', 'allocated', 'dropped')),
  actor text not null check (length(actor) between 1 and 200),
  occurred_at timestamptz not null default now(),
  note text,
  question_id text,
  indication jsonb,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, sounding_id) references public.soundings (organization_id, id) on delete cascade,
  foreign key (organization_id, investor_id) references public.sounding_investors (organization_id, id) on delete cascade,
  foreign key (organization_id, intake_session_id) references public.document_intake_sessions (organization_id, id) on delete cascade,
  check ((event_type = 'indication_received') = (indication is not null))
);

create index sounding_events_by_investor_idx on public.sounding_events (organization_id, sounding_id, investor_id, occurred_at);

create trigger soundings_set_updated_at before update on public.soundings
  for each row execute function private.set_updated_at();
create trigger sounding_investors_set_updated_at before update on public.sounding_investors
  for each row execute function private.set_updated_at();

create trigger soundings_audit after insert or update or delete on public.soundings
  for each row execute function private.capture_audit_event();
create trigger sounding_investors_audit after insert or update or delete on public.sounding_investors
  for each row execute function private.capture_audit_event();
create trigger sounding_events_audit after insert or update or delete on public.sounding_events
  for each row execute function private.capture_audit_event();

alter table public.soundings enable row level security;
alter table public.soundings force row level security;
alter table public.sounding_investors enable row level security;
alter table public.sounding_investors force row level security;
alter table public.sounding_events enable row level security;
alter table public.sounding_events force row level security;

create policy soundings_select on public.soundings for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy soundings_insert on public.soundings for insert to authenticated
  with check ((select private.can_access_intake_session(organization_id, intake_session_id)) and created_by = (select auth.uid()));
create policy soundings_update on public.soundings for update to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)))
  with check ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy soundings_delete on public.soundings for delete to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

create policy sounding_investors_select on public.sounding_investors for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy sounding_investors_insert on public.sounding_investors for insert to authenticated
  with check ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy sounding_investors_update on public.sounding_investors for update to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)))
  with check ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy sounding_investors_delete on public.sounding_investors for delete to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

-- Append-only: the trail can be read and extended, never rewritten.
create policy sounding_events_select on public.sounding_events for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));
create policy sounding_events_insert on public.sounding_events for insert to authenticated
  with check ((select private.can_access_intake_session(organization_id, intake_session_id)) and created_by = (select auth.uid()));

grant select, insert, update, delete on public.soundings to authenticated;
grant select, insert, update, delete on public.sounding_investors to authenticated;
grant select, insert on public.sounding_events to authenticated;
