CREATE OR REPLACE FUNCTION private.begin_processing_run(p_organization_id uuid, p_session_id uuid, p_trigger text, p_documents jsonb, p_pipeline_version text, p_budget jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  session_row public.document_intake_sessions;
  run_row public.processing_runs;
  next_run_no integer;
  document_entry jsonb;
  document_row public.source_documents;
  created_jobs uuid[] := array[]::uuid[];
  reused_documents uuid[] := array[]::uuid[];
  job_id uuid;
  case_job_id uuid;
  download_url text;
  layer_object_path text;
  layer_upload_url text;
  layer_prefix text;
  storage_at integer;
  monthly_ceiling numeric;
  effective_budget jsonb;
  paid_document_count integer;
  document_job_budget numeric;
  document_job_calls integer;
begin
  if p_trigger not in ('upload', 'manual', 'answer', 'reprocess', 'document_removed') then
    raise exception 'processing_trigger_invalid' using errcode = '22023';
  end if;
  if p_documents is null or jsonb_typeof(p_documents) <> 'array' then
    raise exception 'processing_documents_invalid' using errcode = '22023';
  end if;
  if coalesce(trim(p_pipeline_version), '') = '' then
    raise exception 'pipeline_version_required' using errcode = '22023';
  end if;

  effective_budget := jsonb_build_object(
    'max_cost_usd', 16,
    'max_calls', 160,
    'document_max_cost_usd', 1.60,
    'document_max_calls', 8,
    'case_max_cost_usd', 3.10,
    'case_max_calls', 4
  ) || coalesce(p_budget, '{}'::jsonb);

  if (effective_budget->>'max_cost_usd')::numeric <= 0
    or (effective_budget->>'max_cost_usd')::numeric > 25
    or (effective_budget->>'max_calls')::integer not between 1 and 500
    or (effective_budget->>'document_max_cost_usd')::numeric <= 0
    or (effective_budget->>'document_max_cost_usd')::numeric > (effective_budget->>'max_cost_usd')::numeric
    or (effective_budget->>'document_max_calls')::integer not between 1 and 50
    or (effective_budget->>'case_max_cost_usd')::numeric <= 0
    or (effective_budget->>'case_max_cost_usd')::numeric >= (effective_budget->>'max_cost_usd')::numeric
    or (effective_budget->>'case_max_calls')::integer not between 1 and 20
    or (effective_budget->>'case_max_calls')::integer >= (effective_budget->>'max_calls')::integer then
    raise exception 'processing_budget_invalid' using errcode = '22023';
  end if;

  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status not in ('collecting', 'processing', 'review_ready', 'failed') then
    raise exception 'intake_session_not_processable' using errcode = '22023';
  end if;

  select model_monthly_ceiling_usd into monthly_ceiling
  from public.organizations where id = p_organization_id;
  if monthly_ceiling is not null and private.month_spend_usd(p_organization_id) >= monthly_ceiling then
    raise exception 'model_month_ceiling_reached' using errcode = '53400';
  end if;

  -- Every signed entry is unique and belongs to this session, even if the source set later
  -- decides it can reuse other documents.
  if exists (
    select 1 from jsonb_array_elements(p_documents) as entries(value)
    group by value->>'source_document_id' having count(*) > 1
  ) then raise exception 'processing_document_duplicated' using errcode = '22023'; end if;

  for document_entry in select value from jsonb_array_elements(p_documents) as entries(value)
  loop
    if not exists (
      select 1 from public.source_documents source
      where source.organization_id = p_organization_id
        and source.intake_session_id = p_session_id
        and source.id = (document_entry->>'source_document_id')::uuid
    ) then raise exception 'source_document_not_in_session' using errcode = 'P0002'; end if;
  end loop;

  layer_prefix := p_organization_id::text || '/' || p_session_id::text || '/';
  paid_document_count := jsonb_array_length(p_documents);
  document_job_budget := case when paid_document_count = 0 then 0 else least(
    (effective_budget->>'document_max_cost_usd')::numeric,
    ((effective_budget->>'max_cost_usd')::numeric - (effective_budget->>'case_max_cost_usd')::numeric) / paid_document_count
  ) end;
  document_job_calls := case when paid_document_count = 0 then 0 else least(
    (effective_budget->>'document_max_calls')::integer,
    floor(((effective_budget->>'max_calls')::integer - (effective_budget->>'case_max_calls')::integer)::numeric / paid_document_count)::integer
  ) end;
  if paid_document_count > 0 and document_job_calls < 1 then
    raise exception 'processing_call_budget_too_small_for_documents' using errcode = '22023';
  end if;
  select coalesce(max(run_no), 0) + 1 into next_run_no
  from public.processing_runs
  where organization_id = p_organization_id and intake_session_id = p_session_id;

  insert into public.processing_runs (
    organization_id, intake_session_id, run_no, trigger, status, pipeline_version, budget, versions, created_by
  ) values (
    p_organization_id, p_session_id, next_run_no, p_trigger, 'queued', trim(p_pipeline_version),
    effective_budget, '{}'::jsonb, (select auth.uid())
  ) returning * into run_row;

  for document_row in
    select * from public.source_documents source
    where source.organization_id = p_organization_id and source.intake_session_id = p_session_id
    order by source.created_at, source.id
  loop
    select value into document_entry
    from jsonb_array_elements(p_documents) as entries(value)
    where value->>'source_document_id' = document_row.id::text
    limit 1;

    if document_entry is null then
      if document_row.processing_status = 'ready' and session_row.pipeline_version = trim(p_pipeline_version) then
        reused_documents := reused_documents || document_row.id;
        continue;
      end if;
      raise exception 'processing_document_requires_signed_job' using errcode = '22023';
    end if;

    layer_object_path := p_organization_id::text||'/'||p_session_id::text||'/'||document_row.id::text||'/'||run_row.id::text||'.json';
    insert into public.processing_jobs (
      organization_id, processing_run_id, intake_session_id, source_document_id, kind, payload
    ) values (
      p_organization_id, run_row.id, p_session_id, document_row.id, 'document_pipeline',
      jsonb_build_object(
        'source_document_id', document_row.id,
        'document_version', document_row.document_version,
        'original_name', document_row.original_name,
        'mime_type', document_row.mime_type,
        'byte_size', document_row.byte_size,
        'sha256', document_row.sha256,
        'object_path', document_row.object_path,
        'layer_object_path', layer_object_path,
        'locale', session_row.locale,
        'model_budget', jsonb_build_object(
          -- Static allocation makes the sum of every possible document job plus the case job
          -- no greater than max_cost_usd. No scheduler race can cross the run ceiling.
          'max_cost_usd', document_job_budget,
          'max_calls', document_job_calls
        )
      )
    ) returning id into job_id;
    created_jobs := created_jobs || job_id;

    update public.source_documents set processing_status = 'processing'
    where organization_id = p_organization_id and id = document_row.id;
  end loop;

  update public.processing_runs
  set versions = versions || jsonb_build_object(
    'reused_source_document_ids', to_jsonb(reused_documents),
    'reused_document_count', coalesce(array_length(reused_documents, 1), 0)
  )
  where organization_id = p_organization_id and id = run_row.id;

  update public.document_intake_sessions
  set status = 'processing', current_run_id = run_row.id,
      pipeline_version = trim(p_pipeline_version), processing_started_at = now(),
      processing_completed_at = null
  where organization_id = p_organization_id and id = p_session_id;

  if coalesce(array_length(created_jobs, 1), 0) = 0 then
    case_job_id := private.enqueue_primary_case_analysis(p_organization_id, run_row.id, p_session_id);
    if case_job_id is null then raise exception 'reused_case_analysis_not_enqueued'; end if;
    created_jobs := created_jobs || case_job_id;
  end if;

  return jsonb_build_object(
    'processing_run_id', run_row.id,
    'run_no', run_row.run_no,
    'job_ids', to_jsonb(created_jobs),
    'job_count', coalesce(array_length(created_jobs, 1), 0),
    'reused_document_count', coalesce(array_length(reused_documents, 1), 0)
  );
end;
$function$
