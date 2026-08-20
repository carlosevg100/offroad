-- ---------------------------------------------------------------------------------------------
-- The evidence chain stops being writable by the company whose evidence it is.
--
-- Offroad's entire promise to an investor is that a number in a memo links back to the document,
-- the page and the cell it came from. That promise is worth exactly as much as the narrowest
-- thing a tenant can write, and the grants were whole-table: through the same PostgREST channel
-- the app uses, a borrowing company could set `normalized_value` to any figure, mark
-- `anchor_verified` true, set `evidence_rank` to 1 so its management spreadsheet outranked the
-- audited statements, clear `verifier_flags`, and stamp `sha256_verified_at` on a document the
-- server never checked. The material would then tell a fund that the figure was extracted with a
-- confirmed citation.
--
-- Nine determinism mechanisms sit above this and every one of them is bypassed by a PATCH.
--
-- The fix is that mutation goes through code that enforces the invariants, and nowhere else.
-- Three `security definer` implementations in `private`, each behind an invoker wrapper in
-- `public`, exactly as AGENTS.md §6 requires. Authorisation does not depend on RLS inside them:
-- `private.intake_session_for_update` already checks `auth.uid()` and organization membership and
-- raises 42501 itself, so a definer body is safe by construction rather than by convention.
-- ---------------------------------------------------------------------------------------------

create or replace function private.review_intake_candidate(
  p_organization_id uuid,
  p_session_id uuid,
  p_candidate_id uuid,
  p_decision text,
  p_normalized_value jsonb default null,
  p_comment text default null
)
returns void
language plpgsql
security definer
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

  -- The classified kind lives on the profile, not on the document row.
  select profile.document_kind into kind
  from public.document_profiles profile
  where profile.organization_id = p_organization_id
    and profile.source_document_id = candidate_row.source_document_id
  order by profile.document_version desc
  limit 1;

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

create or replace function public.review_intake_candidate(
  p_organization_id uuid,
  p_session_id uuid,
  p_candidate_id uuid,
  p_decision text,
  p_normalized_value jsonb default null,
  p_comment text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.review_intake_candidate(
    p_organization_id, p_session_id, p_candidate_id, p_decision, p_normalized_value, p_comment
  );
$$;

-- Bulk acceptance. The policy that decides *which* candidates qualify lives in TypeScript because
-- it reads the measured accuracy ledger, so the ids arrive as a parameter and this function's job
-- is to apply them under an authorisation check.
create or replace function private.accept_intake_candidates(
  p_organization_id uuid,
  p_session_id uuid,
  p_candidate_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  affected integer;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status <> 'review_ready' then
    raise exception 'intake_session_not_ready' using errcode = '55000';
  end if;

  update public.intake_field_candidates
  set review_state = 'accepted', reviewed_by = actor_id, reviewed_at = now()
  where organization_id = p_organization_id
    and intake_session_id = p_session_id
    and id = any(coalesce(p_candidate_ids, '{}'::uuid[]))
    -- Never revives a decision somebody already made, and never touches a demoted sibling.
    and review_state = 'proposed'
    and is_primary;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.accept_intake_candidates(
  p_organization_id uuid,
  p_session_id uuid,
  p_candidate_ids uuid[]
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.accept_intake_candidates(p_organization_id, p_session_id, p_candidate_ids);
$$;

-- "The server downloaded this object and the digest matched" is a statement only the server can
-- make. It was a column the browser could write.
create or replace function private.record_document_verification(
  p_organization_id uuid,
  p_document_id uuid,
  p_sha256 text,
  p_processing_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'offroad'])) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_digest' using errcode = '22023';
  end if;
  if p_processing_status not in ('quarantined', 'clean', 'rejected') then
    raise exception 'invalid_processing_status' using errcode = '22023';
  end if;

  update public.source_documents
  set sha256 = p_sha256,
      sha256_verified_at = now(),
      processing_status = p_processing_status
  where organization_id = p_organization_id and id = p_document_id;
end;
$$;

create or replace function public.record_document_verification(
  p_organization_id uuid,
  p_document_id uuid,
  p_sha256 text,
  p_processing_status text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.record_document_verification(p_organization_id, p_document_id, p_sha256, p_processing_status);
$$;

revoke all on function private.review_intake_candidate(uuid, uuid, uuid, text, jsonb, text) from public;
revoke all on function private.accept_intake_candidates(uuid, uuid, uuid[]) from public;
revoke all on function private.record_document_verification(uuid, uuid, text, text) from public;

revoke all on function public.review_intake_candidate(uuid, uuid, uuid, text, jsonb, text) from public;
revoke all on function public.accept_intake_candidates(uuid, uuid, uuid[]) from public;
revoke all on function public.record_document_verification(uuid, uuid, text, text) from public;

-- Every public wrapper is `security invoker`, so the caller needs execute on both halves. A
-- wrapper granted without its implementation is a trap, which is exactly what happened to
-- `worker_record_candidates`.
grant execute on function private.review_intake_candidate(uuid, uuid, uuid, text, jsonb, text) to authenticated;
grant execute on function private.accept_intake_candidates(uuid, uuid, uuid[]) to authenticated;
grant execute on function private.record_document_verification(uuid, uuid, text, text) to authenticated;

grant execute on function public.review_intake_candidate(uuid, uuid, uuid, text, jsonb, text) to authenticated;
grant execute on function public.accept_intake_candidates(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.record_document_verification(uuid, uuid, text, text) to authenticated;

-- ---- close the direct write surface --------------------------------------------------------

-- Nothing in the application updates these two tables outside the functions above.
revoke update on public.intake_field_candidates from authenticated;
revoke update on public.document_profiles from authenticated;

-- The one legitimate direct update on a document is attaching it to the opportunity at
-- confirmation. Everything else about a document is the system's judgement, not the tenant's.
revoke update on public.source_documents from authenticated;
grant update (opportunity_id) on public.source_documents to authenticated;

-- The browser creates the row when it uploads, and may state only what it actually knows: where
-- the object is, what the file is called, how big it is and what it hashed to. Status, class,
-- evidence rank and document kind carry defaults or are set later by something that verified them.
revoke insert on public.source_documents from authenticated;
grant insert (
  organization_id, opportunity_id, intake_session_id, bucket_id, object_path,
  original_name, mime_type, byte_size, sha256, created_by
) on public.source_documents to authenticated;
