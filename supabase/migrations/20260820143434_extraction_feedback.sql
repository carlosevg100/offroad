-- ---------------------------------------------------------------------------------------------
-- extraction_feedback — the ledger the extractor learns from
--
-- `review_intake_candidate` overwrote `normalized_value` in place on an edit, which destroyed
-- the single most valuable signal the product generates: what the model proposed against what a
-- human corrected it to. Without that pair there is no measured accuracy per field, no way to
-- tell a field the extractor is reliably right about from one it is reliably wrong about, and
-- nothing to build the next generation of gold cases from.
--
-- Append-only on purpose. There are no update or delete policies, and none should be added: a
-- learning ledger that can be rewritten teaches whatever the last writer wanted it to. Rows are
-- removed only when their organization or session is deleted, by cascade.
-- ---------------------------------------------------------------------------------------------

create table if not exists public.extraction_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  intake_session_id uuid not null,
  candidate_id uuid not null,

  -- What was being extracted, and by what.
  field_path text not null,
  field_group text not null,
  value_type text not null,
  extractor_key text not null,
  extraction_method text not null,
  source_document_id uuid,
  document_kind text,

  -- What the extractor believed at the time. Frozen: these are the inputs a later analysis
  -- correlates against outcomes, so they must not follow the candidate if it changes.
  proposed_value jsonb not null,
  confidence numeric not null,
  evidence_rank smallint not null,
  anchor_verified boolean not null,

  -- What the human decided.
  decision text not null check (decision in ('accept', 'edit', 'reject', 'not_applicable')),
  corrected_value jsonb,
  reviewer_comment text,

  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users (id),

  unique (organization_id, id),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions (organization_id, id) on delete cascade,
  foreign key (organization_id, candidate_id)
    references public.intake_field_candidates (organization_id, id) on delete cascade,
  -- A correction without a corrected value is not a correction; a non-edit carrying one is a
  -- write nobody meant to make.
  constraint extraction_feedback_corrected_only_on_edit
    check ((decision = 'edit') = (corrected_value is not null))
);

comment on table public.extraction_feedback is
  'Append-only record of every human decision on an extracted field, with the model''s original proposal preserved. Never add update or delete policies.';

create index if not exists extraction_feedback_field_idx
  on public.extraction_feedback (organization_id, field_path, decision);
create index if not exists extraction_feedback_session_idx
  on public.extraction_feedback (organization_id, intake_session_id);
-- The accuracy query groups by extractor and document kind across the whole tenant.
create index if not exists extraction_feedback_extractor_idx
  on public.extraction_feedback (organization_id, extractor_key, document_kind);

alter table public.extraction_feedback enable row level security;
alter table public.extraction_feedback force row level security;

drop policy if exists extraction_feedback_select on public.extraction_feedback;
create policy extraction_feedback_select on public.extraction_feedback
  for select to authenticated
  -- Same boundary as the candidates the ledger describes: scoped by session, not just tenant.
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

drop policy if exists extraction_feedback_insert on public.extraction_feedback;
create policy extraction_feedback_insert on public.extraction_feedback
  for insert to authenticated
  with check ((select private.can_access_intake_session(organization_id, intake_session_id)) and created_by = (select auth.uid()));

-- No update policy and no delete policy. The ledger is append-only.

revoke all on public.extraction_feedback from public;
grant select, insert on public.extraction_feedback to authenticated;

-- ---------------------------------------------------------------------------------------------
-- review_intake_candidate — record the decision before applying it
--
-- The insert happens inside the same transaction and before the update, so a candidate can
-- never be mutated without its prior state being written down first.
-- ---------------------------------------------------------------------------------------------

create or replace function public.review_intake_candidate(
  p_organization_id uuid,
  p_session_id uuid,
  p_candidate_id uuid,
  p_decision text,
  p_normalized_value jsonb default null,
  p_comment text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  candidate_row public.intake_field_candidates;
  kind text;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status <> 'review_ready' then
    raise exception 'intake_session_not_ready' using errcode = '55000';
  end if;
  if p_decision not in ('accept', 'edit', 'reject', 'not_applicable') then
    raise exception 'invalid_review_decision' using errcode = '22023';
  end if;

  select * into candidate_row
  from public.intake_field_candidates
  where organization_id = p_organization_id and intake_session_id = p_session_id and id = p_candidate_id
  for update;
  if not found then
    raise exception 'intake_candidate_not_found' using errcode = 'P0002';
  end if;
  if p_decision = 'edit' and p_normalized_value is null then
    raise exception 'edit_requires_value' using errcode = '22023';
  end if;

  select document_kind into kind
  from public.source_documents
  where organization_id = p_organization_id and id = candidate_row.source_document_id;

  insert into public.extraction_feedback (
    organization_id, intake_session_id, candidate_id,
    field_path, field_group, value_type, extractor_key, extraction_method,
    source_document_id, document_kind,
    proposed_value, confidence, evidence_rank, anchor_verified,
    decision, corrected_value, reviewer_comment, created_by
  ) values (
    p_organization_id, p_session_id, candidate_row.id,
    candidate_row.field_path, candidate_row.field_group, candidate_row.value_type,
    candidate_row.extractor_key, candidate_row.extraction_method,
    candidate_row.source_document_id, kind,
    candidate_row.normalized_value, candidate_row.confidence, candidate_row.evidence_rank,
    candidate_row.anchor_verified,
    p_decision,
    case when p_decision = 'edit' then p_normalized_value else null end,
    nullif(trim(coalesce(p_comment, '')), ''),
    actor_id
  );

  if p_decision in ('accept', 'edit') then
    update public.intake_field_candidates
    set is_primary = false
    where organization_id = p_organization_id
      and intake_session_id = p_session_id
      and field_path = candidate_row.field_path
      and id <> candidate_row.id;
  end if;

  update public.intake_field_candidates
  set normalized_value = case when p_decision = 'edit' then p_normalized_value else normalized_value end,
      extraction_method = case when p_decision = 'edit' then 'user_entry' else extraction_method end,
      review_state = case p_decision when 'accept' then 'accepted' when 'edit' then 'edited' else p_decision end,
      is_primary = p_decision in ('accept', 'edit'),
      reviewer_comment = nullif(trim(coalesce(p_comment, '')), ''),
      reviewed_by = actor_id,
      reviewed_at = now()
  where organization_id = p_organization_id and intake_session_id = p_session_id and id = candidate_row.id;
end;
$$;

revoke all on function public.review_intake_candidate(uuid, uuid, uuid, text, jsonb, text) from public;
grant execute on function public.review_intake_candidate(uuid, uuid, uuid, text, jsonb, text) to authenticated;
