-- Preserve source semantics at the existing leased-job boundary. No grants change.
do $guard$
begin
 if (select md5(prosrc) from pg_proc where oid='private.worker_load_preliminary_input(uuid,text)'::regprocedure)
    not in ('73d37610fe6c153ba16dc36620f20ccb','387c7c202413290cfba2607385416713') then
  raise exception 'preliminary_loader_definition_changed';
 end if;
end $guard$;

CREATE OR REPLACE FUNCTION private.worker_load_preliminary_input(p_job_id uuid, p_capability_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  candidates jsonb;
  documents jsonb;
begin
  if job_row.kind <> 'preliminary_analysis'
    or job_row.payload ->> 'analysis_scope' <> 'preliminary_understanding' then
    raise exception 'preliminary_analysis_capability_required' using errcode = '42501';
  end if;

  select * into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.current_run_id = job_row.processing_run_id;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', candidate.id,
    'field_path', candidate.field_path,
    'label', candidate.label,
    'raw_value', candidate.raw_value,
    'normalized_value', candidate.normalized_value,
    'value_type', candidate.value_type,
    'unit', candidate.unit,
    'currency', candidate.currency,
    'value_scale', candidate.value_scale,
    'period_start', candidate.period_start,
    'period_end', candidate.period_end,
    'entity_name', candidate.entity_name,
    'entity_scope', candidate.entity_scope,
    'review_state', candidate.review_state,
    'source_document_id', candidate.source_document_id,
    'evidence_rank', candidate.evidence_rank,
    'information_class', candidate.information_class,
    'confidence', candidate.confidence,
    'anchor_verified', candidate.anchor_verified,
    'source_anchor', candidate.source_anchor
  ) order by candidate.evidence_rank, candidate.field_path, candidate.id), '[]'::jsonb)
  into candidates
  from public.intake_field_candidates candidate
  where candidate.organization_id = job_row.organization_id
    and candidate.intake_session_id = job_row.intake_session_id
    and candidate.review_state not in ('rejected','not_applicable','superseded');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', source.id,
    'original_name', source.original_name,
    'document_version', source.document_version,
    'sha256', source.sha256,
    'sha256_verified_at', source.sha256_verified_at,
    'byte_size', source.byte_size,
    'document_kind', profile.document_kind
  ) order by source.created_at, source.id), '[]'::jsonb)
  into documents
  from public.source_documents source
  left join public.document_profiles profile
    on profile.organization_id = source.organization_id
   and profile.source_document_id = source.id
   and profile.document_version = source.document_version
  where source.organization_id = job_row.organization_id
    and source.intake_session_id = job_row.intake_session_id;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', session_row.id,
      'archetype', session_row.archetype,
      'locale', session_row.locale,
      'company_profile', session_row.company_profile,
      'capital_objective', session_row.capital_objective,
      'capital_currency', session_row.capital_currency,
      'capital_urgency', session_row.capital_urgency,
      'capital_consequence', session_row.capital_consequence,
      'requested_amount', session_row.requested_amount,
      'requested_grace_months', session_row.requested_grace_months,
      'requested_term_months', session_row.requested_term_months,
      'sector', session_row.sector,
      'geography', session_row.geography,
      'instruments', session_row.instruments,
      'collateral_kinds', session_row.collateral_kinds
    ),
    'candidates', candidates,
    'documents', documents
  );
end;
$function$

