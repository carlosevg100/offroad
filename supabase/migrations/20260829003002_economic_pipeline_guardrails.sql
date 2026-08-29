-- Economic guardrails for production document processing.
--
-- Three measured defects made a retry of one synthetic company cost like a new case:
-- ready immutable documents were queued again, cancelled document jobs could enqueue case
-- analysis, and the run budget was descriptive rather than executable. This migration makes
-- reuse and cancellation database invariants and sends a bounded budget with every paid job.

-- Failed provider calls may consume tokens without returning usage. Keep the greater of the
-- measured estimate and the gateway's conservative preflight exposure in the money ledger.
-- That makes unknown-cost calls visible instead of silently recording them as free.
create or replace function private.reported_spend_usd(p_result jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_result is null then 0
    else least(greatest(
      case when jsonb_typeof(p_result->'spend'->'costUsd') = 'number'
        then greatest((p_result->'spend'->>'costUsd')::numeric, 0) else 0 end,
      case when jsonb_typeof(p_result->'spend'->'budgetExposureUsd') = 'number'
        then greatest((p_result->'spend'->>'budgetExposureUsd')::numeric, 0) else 0 end
    ), 1000)
  end;
$$;

revoke all on function private.reported_spend_usd(jsonb) from public, anon, authenticated;

create or replace function private.enqueue_primary_case_analysis(
  p_organization_id uuid,
  p_processing_run_id uuid,
  p_intake_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_row public.processing_runs;
  session_locale text;
  execution_id uuid;
  case_job_id uuid;
begin
  select run.* into run_row
  from public.processing_runs run
  where run.organization_id = p_organization_id
    and run.id = p_processing_run_id
    and run.intake_session_id = p_intake_session_id
  for update;

  if not found or run_row.status in ('cancelled', 'failed', 'partial') then return null; end if;

  select session.locale into session_locale
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id
    and session.id = p_intake_session_id
    and session.current_run_id = p_processing_run_id
    and session.status = 'processing';
  if not found then return null; end if;

  -- A case is analysable only when every document job in this run succeeded. Cancelled,
  -- failed and poisoned are not alternative forms of completion.
  if exists (
    select 1 from public.processing_jobs document_job
    where document_job.organization_id = p_organization_id
      and document_job.processing_run_id = p_processing_run_id
      and document_job.kind = 'document_pipeline'
      and document_job.status <> 'succeeded'
  ) then return null; end if;

  -- A reuse-only run is legal only while every immutable source document is still ready.
  if not exists (
    select 1 from public.processing_jobs document_job
    where document_job.organization_id = p_organization_id
      and document_job.processing_run_id = p_processing_run_id
      and document_job.kind = 'document_pipeline'
  ) and exists (
    select 1 from public.source_documents source
    where source.organization_id = p_organization_id
      and source.intake_session_id = p_intake_session_id
      and source.processing_status <> 'ready'
  ) then return null; end if;

  select execution.id into execution_id
  from public.controlled_case_executions execution
  where execution.organization_id = p_organization_id
    and execution.processing_run_id = p_processing_run_id;

  if execution_id is null then
    insert into public.controlled_case_executions (
      organization_id, intake_session_id, processing_run_id, mode, status,
      pipeline_version, model_policy_version, created_by
    ) values (
      p_organization_id, p_intake_session_id, p_processing_run_id, 'primary', 'queued',
      run_row.pipeline_version,
      coalesce((select policy.target_model_policy_version
        from public.organization_rollout_policies policy
        where policy.organization_id = p_organization_id), '2026.08.24-v1'),
      run_row.created_by
    ) returning id into execution_id;
  end if;

  insert into public.processing_jobs (
    organization_id, processing_run_id, intake_session_id, kind, payload,
    controlled_execution_id, max_attempts
  ) values (
    p_organization_id,
    p_processing_run_id,
    p_intake_session_id,
    'case_analysis',
    jsonb_build_object(
      'locale', session_locale,
      'execution_id', execution_id,
      'execution_mode', 'primary',
      'model_budget', jsonb_build_object(
        'max_cost_usd', coalesce((run_row.budget->>'case_max_cost_usd')::numeric, 1),
        'max_calls', coalesce((run_row.budget->>'case_max_calls')::integer, 4)
      )
    ),
    execution_id,
    2
  ) on conflict (organization_id, controlled_execution_id)
    where kind = 'case_analysis' and controlled_execution_id is not null do nothing
  returning id into case_job_id;

  if case_job_id is null then
    select job.id into case_job_id
    from public.processing_jobs job
    where job.organization_id = p_organization_id
      and job.controlled_execution_id = execution_id
      and job.kind = 'case_analysis';
  end if;
  return case_job_id;
end;
$$;

revoke all on function private.enqueue_primary_case_analysis(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.enqueue_case_analysis_after_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only success advances the case. The previous terminal-state trigger treated cancellation
  -- as completion and could spend on analysis after a founder had stopped the run.
  if new.kind = 'document_pipeline' and new.status = 'succeeded' and old.status <> new.status then
    perform private.enqueue_primary_case_analysis(new.organization_id, new.processing_run_id, new.intake_session_id);
  end if;
  return new;
end;
$$;

revoke all on function private.enqueue_case_analysis_after_documents() from public, anon, authenticated;

create or replace function private.begin_processing_run(
  p_organization_id uuid,
  p_session_id uuid,
  p_trigger text,
  p_documents jsonb,
  p_pipeline_version text,
  p_budget jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    'max_cost_usd', 5,
    'max_calls', 160,
    'document_max_cost_usd', 0.75,
    'document_max_calls', 8,
    'case_max_cost_usd', 1,
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

    download_url := document_entry->>'download_url';
    layer_object_path := document_entry->>'layer_object_path';
    layer_upload_url := document_entry->>'layer_upload_url';
    if download_url is null or layer_object_path is null or layer_upload_url is null then
      raise exception 'processing_signed_urls_required' using errcode = '22023';
    end if;
    storage_at := position('/storage/v1/' in download_url);
    if storage_at = 0 or position(document_row.object_path in download_url) <= storage_at then
      raise exception 'processing_url_not_for_document' using errcode = '22023';
    end if;
    if left(layer_object_path, length(layer_prefix)) <> layer_prefix then
      raise exception 'processing_layer_path_outside_session' using errcode = '22023';
    end if;
    storage_at := position('/storage/v1/' in layer_upload_url);
    if storage_at = 0 or position(layer_object_path in layer_upload_url) <= storage_at then
      raise exception 'processing_url_not_for_document' using errcode = '22023';
    end if;

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
        'download_url', download_url,
        'layer_object_path', layer_object_path,
        'layer_upload_url', layer_upload_url,
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
$$;

revoke all on function private.begin_processing_run(uuid, uuid, text, jsonb, text, jsonb) from public, anon;
grant execute on function private.begin_processing_run(uuid, uuid, text, jsonb, text, jsonb) to authenticated;
