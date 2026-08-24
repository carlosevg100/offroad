-- The document jobs end in one governed case-analysis job.
--
-- The workload sees the complete borrower evidence and the platform mandate directory through
-- a short-lived job capability. Neither dataset is opened to the other tenant. The case snapshot
-- returned to the borrower is written by the same capability, not by a browser session.

create unique index if not exists processing_jobs_case_analysis_run_idx
  on public.processing_jobs (organization_id, processing_run_id)
  where kind = 'case_analysis';

create or replace function private.enqueue_case_analysis_after_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'document_pipeline'
    or new.status not in ('succeeded', 'failed', 'poison', 'cancelled')
    or old.status = new.status then
    return new;
  end if;

  if exists (
    select 1
    from public.processing_jobs pending
    where pending.organization_id = new.organization_id
      and pending.processing_run_id = new.processing_run_id
      and pending.kind = 'document_pipeline'
      and pending.status in ('queued', 'leased')
  ) then
    return new;
  end if;

  insert into public.processing_jobs (
    organization_id, processing_run_id, intake_session_id, kind, payload, max_attempts
  )
  select
    new.organization_id,
    new.processing_run_id,
    new.intake_session_id,
    'case_analysis',
    jsonb_build_object('locale', session.locale),
    2
  from public.document_intake_sessions session
  where session.organization_id = new.organization_id
    and session.id = new.intake_session_id
    and session.current_run_id = new.processing_run_id
    and session.status = 'processing'
  on conflict (organization_id, processing_run_id) where kind = 'case_analysis' do nothing;

  return new;
end;
$$;

revoke all on function private.enqueue_case_analysis_after_documents() from public, anon, authenticated;

drop trigger if exists processing_jobs_enqueue_case_analysis on public.processing_jobs;
create trigger processing_jobs_enqueue_case_analysis
  after update of status on public.processing_jobs
  for each row execute function private.enqueue_case_analysis_after_documents();

create or replace function private.worker_load_case_input(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  run_row public.processing_runs;
  candidates jsonb;
  sources jsonb;
  documents jsonb;
  layers jsonb;
  answers jsonb;
  directory_mandates jsonb;
  registered_mandates jsonb;
  model_lineage jsonb;
  expected_model_calls bigint;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;

  select * into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id;
  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;

  select * into run_row
  from public.processing_runs run
  where run.organization_id = job_row.organization_id
    and run.id = job_row.processing_run_id
    and run.intake_session_id = job_row.intake_session_id;
  if not found then
    raise exception 'processing_run_not_in_session' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', candidate.id,
    'field_path', candidate.field_path,
    'normalized_value', candidate.normalized_value,
    'value_type', candidate.value_type,
    'source_document_id', candidate.source_document_id,
    'evidence_rank', candidate.evidence_rank,
    'information_class', candidate.information_class,
    'confidence', candidate.confidence,
    'anchor_verified', candidate.anchor_verified,
    'anchor_precision', candidate.anchor_precision,
    'verifier_flags', candidate.verifier_flags,
    'period_start', candidate.period_start,
    'period_end', candidate.period_end,
    'entity_name', candidate.entity_name,
    'entity_scope', candidate.entity_scope,
    'source_anchor', candidate.source_anchor,
    'extraction_method', candidate.extraction_method,
    'extractor_key', candidate.extractor_key,
    'field_group', candidate.field_group,
    'is_primary', candidate.is_primary,
    'review_state', candidate.review_state,
    'reviewer_comment', candidate.reviewer_comment,
    'currency', candidate.currency,
    'unit', candidate.unit,
    'value_scale', candidate.value_scale,
    'processing_run_id', candidate.processing_run_id
  ) order by candidate.field_path, candidate.id), '[]'::jsonb)
  into candidates
  from public.intake_field_candidates candidate
  where candidate.organization_id = job_row.organization_id
    and candidate.intake_session_id = job_row.intake_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', source.id,
    'document_version', source.document_version,
    'original_name', source.original_name,
    'sha256', source.sha256,
    'sha256_verified_at', source.sha256_verified_at,
    'byte_size', source.byte_size,
    'mime_type', source.mime_type,
    'processing_status', source.processing_status,
    'classification', source.classification,
    'evidence_rank', source.evidence_rank
  ) order by source.id), '[]'::jsonb)
  into sources
  from public.source_documents source
  where source.organization_id = job_row.organization_id
    and source.intake_session_id = job_row.intake_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', source.id,
    'original_name', source.original_name,
    'document_version', source.document_version,
    'sha256', source.sha256,
    'sha256_verified_at', source.sha256_verified_at,
    'byte_size', source.byte_size,
    'document_kind', profile.document_kind
  ) order by source.id), '[]'::jsonb)
  into documents
  from public.source_documents source
  left join public.document_profiles profile
    on profile.organization_id = source.organization_id
   and profile.source_document_id = source.id
   and profile.document_version = source.document_version
  where source.organization_id = job_row.organization_id
    and source.intake_session_id = job_row.intake_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'source_document_id', layer.source_document_id,
    'document_version', layer.document_version,
    'sha256', layer.sha256,
    'parser_versions', layer.parser_versions,
    'processing_run_id', layer.processing_run_id,
    'status', layer.status
  ) order by layer.source_document_id, layer.document_version), '[]'::jsonb)
  into layers
  from public.document_layers layer
  join public.source_documents source
    on source.organization_id = layer.organization_id
   and source.id = layer.source_document_id
  where layer.organization_id = job_row.organization_id
    and source.intake_session_id = job_row.intake_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', answer.id,
    'requirement_id', answer.requirement_id,
    'response', answer.response,
    'answer', answer.answer,
    'note', answer.note
  ) order by answer.requirement_id, answer.id), '[]'::jsonb)
  into answers
  from public.intake_information_answers answer
  where answer.organization_id = job_row.organization_id
    and answer.intake_session_id = job_row.intake_session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'fund_id', directory.id,
    'fund_name', coalesce(directory.short_name, directory.legal_name),
    'observations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'criterion', observation.criterion,
        'value', observation.value,
        'provenance', observation.provenance,
        'observed_at', observation.observed_at,
        'note', observation.note
      ) order by observation.criterion, observation.observed_at, observation.id)
      from public.fund_mandate_observations observation
      where observation.fund_id = directory.id
    ), '[]'::jsonb)
  ) order by directory.id), '[]'::jsonb)
  into directory_mandates
  from public.fund_directory directory
  where directory.status not in ('declined', 'inactive');

  select coalesce(jsonb_agg(jsonb_build_object(
    'fund_id', registered.fund_id,
    'fund_name', registered.fund_name,
    'provider_organization_id', registered.organization_id,
    'source_kind', registered.source_kind,
    'valid_from', registered.valid_from,
    'constraints', registered.constraints
  ) order by registered.fund_id), '[]'::jsonb)
  into registered_mandates
  from (
    select distinct on (mandate.organization_id, mandate.fund_id)
      mandate.organization_id,
      mandate.fund_id,
      fund.name as fund_name,
      mandate.source_kind,
      mandate.valid_from,
      mandate.constraints
    from public.mandate_versions mandate
    join public.funds fund
      on fund.organization_id = mandate.organization_id and fund.id = mandate.fund_id
    where mandate.status = 'active'
      and fund.status = 'active'
      and mandate.valid_from <= current_date
      and (mandate.valid_until is null or mandate.valid_until >= current_date)
      and not exists (
        select 1 from public.fund_directory directory
        where directory.claimed_by_organization_id = mandate.organization_id
      )
    order by mandate.organization_id, mandate.fund_id, mandate.version_number desc
  ) registered;

  select coalesce(
    jsonb_agg(call.value order by prior_job.created_at, call.ordinality)
      filter (where call.value is not null),
    '[]'::jsonb
  )
  into model_lineage
  from public.processing_jobs prior_job
  left join lateral jsonb_array_elements(
    case
      when jsonb_typeof(prior_job.result -> 'model_lineage') = 'array' then prior_job.result -> 'model_lineage'
      when jsonb_typeof(prior_job.last_error -> 'model_lineage') = 'array' then prior_job.last_error -> 'model_lineage'
      else '[]'::jsonb
    end
  ) with ordinality as call(value, ordinality) on true
  where prior_job.organization_id = job_row.organization_id
    and prior_job.processing_run_id = job_row.processing_run_id
    and prior_job.id <> job_row.id;

  select coalesce(sum(prior_job.model_calls), 0)
  into expected_model_calls
  from public.processing_jobs prior_job
  where prior_job.organization_id = job_row.organization_id
    and prior_job.processing_run_id = job_row.processing_run_id
    and prior_job.id <> job_row.id;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', session_row.id,
      'archetype', session_row.archetype,
      'collateral_kinds', session_row.collateral_kinds,
      'current_run_id', session_row.current_run_id,
      'expected_rate', session_row.expected_rate,
      'extraction_version', session_row.extraction_version,
      'geography', session_row.geography,
      'instruments', session_row.instruments,
      'journey', session_row.journey,
      'locale', session_row.locale,
      'opportunity_id', session_row.opportunity_id,
      'pipeline_version', session_row.pipeline_version,
      'requested_amount', session_row.requested_amount,
      'requested_grace_months', session_row.requested_grace_months,
      'requested_term_months', session_row.requested_term_months,
      'sector', session_row.sector,
      'status', session_row.status
    ),
    'run', jsonb_build_object(
      'id', run_row.id,
      'pipeline_version', run_row.pipeline_version,
      'status', run_row.status,
      'versions', run_row.versions,
      'model_calls', run_row.model_calls
    ),
    'candidates', candidates,
    'sources', sources,
    'documents', documents,
    'layers', layers,
    'answers', answers,
    'directory_mandates', directory_mandates,
    'registered_mandates', registered_mandates,
    'model_lineage', model_lineage,
    'expected_model_calls', expected_model_calls
  );
end;
$$;

create or replace function public.worker_load_case_input(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_case_input(p_job_id, p_capability_token);
$$;

revoke all on function private.worker_load_case_input(uuid, text) from public, anon;
revoke all on function public.worker_load_case_input(uuid, text) from public, anon;
grant execute on function private.worker_load_case_input(uuid, text) to authenticated;
grant execute on function public.worker_load_case_input(uuid, text) to authenticated;

create or replace function private.worker_record_case_snapshot(
  p_job_id uuid,
  p_capability_token text,
  p_manifest jsonb,
  p_case_state jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  manifest_id uuid;
  v_manifest_fingerprint text := p_manifest ->> 'manifestFingerprint';
  v_input_fingerprint text := p_manifest ->> 'inputFingerprint';
  v_schema_version text := p_manifest ->> 'schemaVersion';
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;

  select * into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
  for update;
  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;
  if session_row.status = 'confirmed' then
    raise exception 'intake_session_already_confirmed' using errcode = '55000';
  end if;
  if jsonb_typeof(p_manifest) <> 'object' or jsonb_typeof(p_case_state) <> 'object' then
    raise exception 'case_snapshot_must_be_objects' using errcode = '22023';
  end if;
  if v_manifest_fingerprint !~ '^[0-9a-f]{64}$' or v_input_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'case_snapshot_invalid_fingerprint' using errcode = '22023';
  end if;
  if coalesce(v_schema_version, '') = '' then
    raise exception 'case_snapshot_schema_version_required' using errcode = '22023';
  end if;
  if p_manifest ->> 'caseId' <> job_row.intake_session_id::text
    or p_manifest ->> 'runId' <> job_row.processing_run_id::text
    or p_manifest ->> 'locale' <> session_row.locale then
    raise exception 'case_snapshot_scope_mismatch' using errcode = '22023';
  end if;

  insert into public.case_artifact_manifests (
    organization_id, intake_session_id, processing_run_id, schema_version, locale,
    input_fingerprint, manifest_fingerprint, manifest, created_by
  ) values (
    job_row.organization_id, job_row.intake_session_id, job_row.processing_run_id,
    v_schema_version, session_row.locale, v_input_fingerprint, v_manifest_fingerprint,
    p_manifest, actor_id
  )
  on conflict (organization_id, manifest_fingerprint) do nothing
  returning id into manifest_id;

  if manifest_id is null then
    select stored.id into manifest_id
    from public.case_artifact_manifests stored
    where stored.organization_id = job_row.organization_id
      and stored.manifest_fingerprint = v_manifest_fingerprint;
  end if;

  update public.document_intake_sessions
  set result_summary = result_summary || jsonb_build_object(
    'case_state', p_case_state,
    'case_manifest', jsonb_build_object(
      'id', manifest_id,
      'fingerprint', v_manifest_fingerprint,
      'input_fingerprint', v_input_fingerprint,
      'schema_version', v_schema_version
    )
  )
  where organization_id = job_row.organization_id and id = job_row.intake_session_id;

  return manifest_id;
end;
$$;

create or replace function public.worker_record_case_snapshot(
  p_job_id uuid,
  p_capability_token text,
  p_manifest jsonb,
  p_case_state jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_case_snapshot(p_job_id, p_capability_token, p_manifest, p_case_state);
$$;

revoke all on function private.worker_record_case_snapshot(uuid, text, jsonb, jsonb) from public, anon;
revoke all on function public.worker_record_case_snapshot(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function private.worker_record_case_snapshot(uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.worker_record_case_snapshot(uuid, text, jsonb, jsonb) to authenticated;

-- Browser sessions can read their latest snapshot but cannot attest a new one. The workload
-- capability above is now the only write path.
revoke execute on function private.record_case_snapshot(uuid, uuid, uuid, jsonb, jsonb) from authenticated;
revoke execute on function public.record_case_snapshot(uuid, uuid, uuid, jsonb, jsonb) from authenticated;
