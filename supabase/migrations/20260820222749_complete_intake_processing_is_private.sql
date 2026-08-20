-- `complete_intake_processing` moves to `private`, because it writes evidence and evidence is
-- no longer tenant-writable.
--
-- The previous migration narrowed the write surface on the evidence tables to nothing, which
-- was the point: a PATCH from a browser must not be able to edit a candidate, mark a document
-- verified, or call a file clean. But this command runs as its caller, and it writes all three:
-- it replaces the session's candidates and issues, and it sets `processing_status = 'ready'` on
-- every document of the session. So the narrowing broke a live command outright, and the CI
-- database job caught it on the first run rather than a user meeting it.
--
-- Returning the grants would undo the protection. The command belongs where the others already
-- are: `security definer` in `private`, behind a `security invoker` wrapper in `public`.
--
-- What makes that safe is not the schema but the check the body already opens with.
-- `private.intake_session_for_update` refuses a caller with no identity and refuses one who is
-- not a member of the organization, before anything is written. The tenant boundary is proven
-- in the function rather than inherited from the caller's table grants, which is what
-- `security definer` requires and what a definer without such a check would throw away.
--
-- The other two invoker functions that touch these tables were checked rather than assumed:
-- `confirm_document_intake` sets only `opportunity_id`, which is granted per column, and
-- `begin_intake_processing` only deletes, which is still granted. Neither needs to move.

create or replace function private.complete_intake_processing(
  p_organization_id uuid,
  p_session_id uuid,
  p_candidates jsonb,
  p_issues jsonb,
  p_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  candidate_count integer := 0;
  issue_count integer := 0;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status = 'confirmed' then
    raise exception 'intake_session_already_confirmed' using errcode = '55000';
  end if;
  if jsonb_typeof(coalesce(p_candidates, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_issues, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_intake_payload' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_summary, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_intake_summary' using errcode = '22023';
  end if;

  -- Fresh start: previous results are discarded so a reprocess never mixes generations.
  delete from public.intake_issues where organization_id = p_organization_id and intake_session_id = p_session_id;
  delete from public.intake_field_candidates where organization_id = p_organization_id and intake_session_id = p_session_id;

  insert into public.intake_field_candidates (
    organization_id, intake_session_id, source_document_id, extractor_key, field_path, field_group,
    label, raw_value, normalized_value, value_type, unit, currency, period_start, period_end,
    information_class, evidence_rank, source_anchor, confidence, extraction_method, is_primary, created_by
  )
  select
    p_organization_id, p_session_id,
    nullif(c.source_document_id, '')::uuid, c.extractor_key, c.field_path, c.field_group,
    c.label, c.raw_value, coalesce(c.normalized_value, 'null'::jsonb), c.value_type, c.unit, c.currency,
    nullif(c.period_start, '')::date, nullif(c.period_end, '')::date,
    c.information_class, c.evidence_rank, coalesce(c.source_anchor, '{}'::jsonb), c.confidence, c.extraction_method,
    coalesce(c.is_primary, false), actor_id
  from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as c(
    source_document_id text, extractor_key text, field_path text, field_group text, label text, raw_value text,
    normalized_value jsonb, value_type text, unit text, currency text, period_start text, period_end text,
    information_class text, evidence_rank smallint, source_anchor jsonb, confidence numeric, extraction_method text,
    is_primary boolean
  );
  get diagnostics candidate_count = row_count;

  insert into public.intake_issues (
    organization_id, intake_session_id, issue_type, priority, field_group, field_path, candidate_ids, title, description, resolution_hint
  )
  select
    p_organization_id, p_session_id, i.issue_type, i.priority, i.field_group, i.field_path,
    coalesce(
      (select array_agg(fc.id order by fc.extractor_key)
       from public.intake_field_candidates fc
       where fc.organization_id = p_organization_id
         and fc.intake_session_id = p_session_id
         and fc.extractor_key = any (coalesce(i.candidate_keys, array[]::text[]))),
      array[]::uuid[]
    ),
    i.title, i.description, i.resolution_hint
  from jsonb_to_recordset(coalesce(p_issues, '[]'::jsonb)) as i(
    issue_type text, priority text, field_group text, field_path text, candidate_keys text[], title text, description text, resolution_hint text
  );
  get diagnostics issue_count = row_count;

  update public.source_documents
  set processing_status = 'ready'
  where organization_id = p_organization_id and intake_session_id = p_session_id;

  update public.document_intake_sessions
  set status = 'review_ready',
      processing_completed_at = now(),
      result_summary = coalesce(p_summary, '{}'::jsonb) || jsonb_build_object('candidates', candidate_count, 'issues', issue_count)
  where organization_id = p_organization_id and id = p_session_id;

  return jsonb_build_object('candidates', candidate_count, 'issues', issue_count);
end;
$$;

-- The API surface. `security invoker`, so the caller must hold the grant on the private
-- implementation as well: a wrapper granted without its implementation is a trap that fails
-- with "permission denied for function", and this repository has walked into it twice.
drop function if exists public.complete_intake_processing(uuid, uuid, jsonb, jsonb, jsonb);

create function public.complete_intake_processing(
  p_organization_id uuid,
  p_session_id uuid,
  p_candidates jsonb,
  p_issues jsonb,
  p_summary jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.complete_intake_processing(p_organization_id, p_session_id, p_candidates, p_issues, p_summary);
$wrapper$;

revoke all on function private.complete_intake_processing(uuid, uuid, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.complete_intake_processing(uuid, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function private.complete_intake_processing(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.complete_intake_processing(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
