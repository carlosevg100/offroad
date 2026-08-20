-- Half of a data room never arrives as a file.
--
-- Why now, who the customers are, what the last store's ramp actually looked like, whether the
-- receivables are already assigned — nobody uploads a document that says these, and they decide
-- how the case reads. The information request asks for them; this is where the answers live.
--
-- An answer is evidence like any other, and it is the weakest kind: the company saying so,
-- evidence rank 7, revisable. It is recorded as such rather than promoted to a fact, so a
-- number typed into a form can never outrank the same number in an audited statement.
create table if not exists public.intake_information_answers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_session_id uuid not null,
  -- Requirement id from packages/credit-playbook.
  requirement_id text not null check (char_length(trim(requirement_id)) between 1 and 100),
  answer text not null check (char_length(trim(answer)) between 1 and 4000),
  answered_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, intake_session_id, requirement_id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade
);

create index if not exists intake_information_answers_session_idx
  on public.intake_information_answers (organization_id, intake_session_id);

alter table public.intake_information_answers enable row level security;
alter table public.intake_information_answers force row level security;

create policy intake_information_answers_select on public.intake_information_answers
  for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

create policy intake_information_answers_insert on public.intake_information_answers
  for insert to authenticated
  with check (
    (select private.can_access_intake_session(organization_id, intake_session_id))
    and answered_by = (select auth.uid())
  );

create policy intake_information_answers_update on public.intake_information_answers
  for update to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)))
  with check ((select private.can_access_intake_session(organization_id, intake_session_id)));

create policy intake_information_answers_delete on public.intake_information_answers
  for delete to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

revoke all on table public.intake_information_answers from anon, authenticated;
grant select, insert, update, delete on table public.intake_information_answers to authenticated;

create trigger intake_information_answers_set_updated_at
  before update on public.intake_information_answers
  for each row execute function private.set_updated_at();
