-- A model proposal can be anchored to a real source while its numeric value remains
-- unparseable. JavaScript serializes non-finite numbers as JSON null, and
-- jsonb_to_recordset exposes JSON null as SQL NULL. Preserve that proposal as the JSON value
-- `null` so it remains visible for review; never let one imperfect proposal abort the complete
-- document after the model work has already succeeded.

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
    c.raw_value, coalesce(c.normalized_value, 'null'::jsonb), c.value_type, c.unit, c.currency,
    nullif(c.period_start, '')::date, nullif(c.period_end, '')::date,
    c.information_class, c.evidence_rank, coalesce(c.source_anchor, '{}'::jsonb),
    c.confidence,
    case
      when nullif(c.extraction_method, '') is null or c.extraction_method = 'model_extraction'
        then 'llm_anchored'
      else c.extraction_method
    end,
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

comment on function private.worker_record_candidates(uuid, text, jsonb) is
  'Capability-bound worker write. Preserves unparseable proposals as JSON null and normalizes legacy extraction labels.';
