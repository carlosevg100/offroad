-- The worker's way to say what a document says
--
-- The pipeline could read a document, profile it and store its layer, and had nowhere to put
-- the facts it found: `worker_record_document_result` carries scan/profile/layer, and the only
-- command that writes candidates (`complete_intake_processing`) belongs to the tenant, which
-- the worker deliberately is not. So extraction stopped one step short of the review screen.
--
-- Same authorization model as every other worker command, unchanged: the capability token of
-- the claimed job is the only credential, every scope value (organization, session, run,
-- document) comes from that job, and nothing is accepted from the caller. A `security definer`
-- implementation in `private`, a `security invoker` wrapper of the same signature in `public`.

create or replace function private.worker_record_candidates(
  p_job_id uuid,
  p_capability_token text,
  p_candidates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  written integer;
  replaced integer;
  actor uuid := (select auth.uid());
begin
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'invalid_intake_payload' using errcode = '22023';
  end if;

  -- A re-run supersedes its own previous proposals for this document and nothing else. A
  -- candidate a human already touched keeps its decision: the reviewer's work outranks any
  -- number of re-reads.
  delete from public.intake_field_candidates
  where organization_id = job_row.organization_id
    and intake_session_id = job_row.intake_session_id
    and source_document_id = job_row.source_document_id
    and review_state = 'proposed';
  get diagnostics replaced = row_count;

  insert into public.intake_field_candidates (
    organization_id, intake_session_id, source_document_id, processing_run_id, extractor_key,
    field_path, field_group, label, raw_value, normalized_value, value_type, unit, currency,
    period_start, period_end, information_class, evidence_rank, source_anchor, confidence,
    extraction_method, is_primary, anchor_verified, anchor_precision, entity_name, entity_scope,
    value_scale, verifier_flags, created_by
  )
  select
    job_row.organization_id, job_row.intake_session_id, job_row.source_document_id,
    job_row.processing_run_id, c.extractor_key, c.field_path, c.field_group, c.label,
    c.raw_value, c.normalized_value, c.value_type, c.unit, c.currency,
    nullif(c.period_start, '')::date, nullif(c.period_end, '')::date,
    c.information_class, c.evidence_rank, coalesce(c.source_anchor, '{}'::jsonb),
    c.confidence, coalesce(nullif(c.extraction_method, ''), 'model_extraction'),
    coalesce(c.is_primary, false), coalesce(c.anchor_verified, false), c.anchor_precision,
    c.entity_name, c.entity_scope, c.value_scale, coalesce(c.verifier_flags, '[]'::jsonb), actor
  from jsonb_to_recordset(p_candidates) as c(
    extractor_key text, field_path text, field_group text, label text, raw_value text,
    normalized_value jsonb, value_type text, unit text, currency text, period_start text,
    period_end text, information_class text, evidence_rank smallint, source_anchor jsonb,
    confidence numeric, extraction_method text, is_primary boolean, anchor_verified boolean,
    anchor_precision text, entity_name text, entity_scope text, value_scale numeric,
    verifier_flags jsonb
  )
  -- Idempotent per (document, extractor key): a retried job re-states the same facts.
  on conflict (organization_id, intake_session_id, extractor_key) do update
  set normalized_value = excluded.normalized_value,
      raw_value = excluded.raw_value,
      confidence = excluded.confidence,
      anchor_verified = excluded.anchor_verified,
      anchor_precision = excluded.anchor_precision,
      verifier_flags = excluded.verifier_flags,
      processing_run_id = excluded.processing_run_id
  where public.intake_field_candidates.review_state = 'proposed';
  get diagnostics written = row_count;

  return jsonb_build_object('written', written, 'replaced', replaced);
end;
$$;

create or replace function public.worker_record_candidates(
  p_job_id uuid,
  p_capability_token text,
  p_candidates jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_candidates(p_job_id, p_capability_token, p_candidates);
$$;

revoke all on function private.worker_record_candidates(uuid, text, jsonb) from public;
revoke all on function public.worker_record_candidates(uuid, text, jsonb) from public;
grant execute on function public.worker_record_candidates(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Finishing a run finishes the session
--
-- The review screen reads `document_intake_sessions.status`. Without this the pipeline could
-- complete every job and leave the session sitting in `processing` forever — a journey that
-- ends in a spinner. The session follows the run: everything succeeded → `review_ready`;
-- something failed → `failed`, so the UI can offer a retry instead of pretending.
-- ---------------------------------------------------------------------------------------------

create or replace function private.worker_complete_job(
  p_job_id uuid,
  p_capability_token text,
  p_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  pending integer;
  failed integer;
  candidate_count integer;
begin
  update public.processing_jobs
  set status = 'succeeded',
      result = coalesce(p_result, '{}'::jsonb),
      capability_sha256 = null,
      leased_by = null,
      lease_expires_at = null
  where id = job_row.id;

  update public.source_documents
  set processing_status = 'ready'
  where organization_id = job_row.organization_id
    and id = job_row.source_document_id
    and processing_status = 'processing';

  select
    count(*) filter (where status in ('queued', 'leased')),
    count(*) filter (where status in ('failed', 'poison'))
  into pending, failed
  from public.processing_jobs
  where organization_id = job_row.organization_id and processing_run_id = job_row.processing_run_id;

  if pending = 0 then
    update public.processing_runs
    set status = case when failed > 0 then 'partial' else 'succeeded' end,
        completed_at = now()
    where organization_id = job_row.organization_id and id = job_row.processing_run_id;

    select count(*) into candidate_count
    from public.intake_field_candidates
    where organization_id = job_row.organization_id and intake_session_id = job_row.intake_session_id;

    -- Only the run that the session is currently following may move it, and only from
    -- `processing`: a stale job from a superseded run never reopens a confirmed case.
    update public.document_intake_sessions
    set status = case when failed > 0 and candidate_count = 0 then 'failed' else 'review_ready' end,
        processing_completed_at = now(),
        result_summary = coalesce(result_summary, '{}'::jsonb)
          || jsonb_build_object('candidates', candidate_count, 'failed_documents', failed, 'pipeline', true)
    where organization_id = job_row.organization_id
      and id = job_row.intake_session_id
      and current_run_id = job_row.processing_run_id
      and status = 'processing';
  end if;

  return jsonb_build_object('job_id', job_row.id, 'pending_jobs', pending, 'failed_jobs', failed);
end;
$$;
