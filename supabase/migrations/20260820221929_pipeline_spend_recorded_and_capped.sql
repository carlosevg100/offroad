-- What a case costs is now a number in the database, and a month has a ceiling.
--
-- Until now the worker computed the cost of every model call and wrote it to stdout. Nothing
-- reached Postgres, so the honest answer to "what does a case cost us" was "read the logs", and
-- the honest answer to "what stops a runaway" was "nothing". That is a poor position for a
-- product whose unit economics are the business.
--
-- The shape follows the constraint that matters: never stop an operation halfway over
-- something silly, and never sit exposed to a cost that is producing nothing. Those pull in
-- opposite directions only if the ceiling is enforced in the wrong place.
--
--   * Per document, in the worker: the gateway refuses calls past its own ceiling, so a file
--     that keeps re-chunking stops at five dollars instead of at the invoice. It fails one
--     document, loudly, on the timeline the reviewer is already watching.
--   * Per month, here, at the door: `begin_processing_run` refuses to *start* a run once the
--     organization's recorded spend for the calendar month is at its ceiling. A run already in
--     flight is never touched, and neither is a job. The company that is mid-case finishes its
--     case; the next one is told, in the open, that the month is closed.
--
-- The ceiling is per organization and not writable through the Data API: the update grant on
-- `organizations` is stated column by column, so a column added here is excluded by default and
-- a tenant cannot raise its own limit.

alter table public.processing_jobs
  add column if not exists model_cost_usd numeric(12, 4) not null default 0,
  add column if not exists model_calls integer not null default 0;

alter table public.processing_runs
  add column if not exists model_cost_usd numeric(12, 4) not null default 0,
  add column if not exists model_calls integer not null default 0;

alter table public.organizations
  add column if not exists model_monthly_ceiling_usd numeric(12, 2) not null default 500;

comment on column public.organizations.model_monthly_ceiling_usd is
  'What this organization may spend on model calls in a calendar month before new runs are refused. Enforced at the start of a run only: a run in flight is never interrupted, because stopping a case halfway is worse than the last few dollars of it. Not writable through the Data API, the update grant on this table being stated column by column.';

comment on column public.processing_runs.model_cost_usd is
  'What this run has actually cost in model calls, accumulated from its jobs as they report. Counts failed jobs too: a document that burns four dollars and then fails is precisely the one worth seeing.';

-- Spend recorded per month, so the ceiling check is one index lookup rather than a scan.
create index if not exists processing_runs_spend_idx
  on public.processing_runs (organization_id, created_at);

-- Reading a reported figure without trusting it.
--
-- The worker is a service account we run, but this lands in a money column, so the value is
-- taken only when it is a number, non-negative and inside a bound no honest document reaches.
-- Anything else records zero, which understates rather than invents, and the gateway's own
-- per-job ceiling is what actually stops the spending.
create or replace function private.reported_spend_usd(p_result jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_result is null then 0
    when jsonb_typeof(p_result->'spend'->'costUsd') <> 'number' then 0
    else least(greatest((p_result->'spend'->>'costUsd')::numeric, 0), 1000)
  end;
$$;

create or replace function private.reported_spend_calls(p_result jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_result is null then 0
    when jsonb_typeof(p_result->'spend'->'calls') <> 'number' then 0
    else least(greatest((p_result->'spend'->>'calls')::numeric, 0), 100000)::integer
  end;
$$;

revoke all on function private.reported_spend_usd(jsonb) from public, anon, authenticated;
revoke all on function private.reported_spend_calls(jsonb) from public, anon, authenticated;

-- The completing worker reports what the job spent, and the run accumulates it.
--
-- The number travels inside `p_result`, which the worker already sends, so no signature moves
-- and no capability changes hands. It is clamped rather than trusted: a worker is a service
-- account we run, but the column is money and a negative or absurd value is a bug we would
-- rather see as a refusal than as a credit.
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
  spent_usd numeric(12, 4) := private.reported_spend_usd(p_result);
  spent_calls integer := private.reported_spend_calls(p_result);
begin
  update public.processing_jobs
  set status = 'succeeded',
      result = coalesce(p_result, '{}'::jsonb),
      -- Accumulated, like the failure path, because each attempt gets a fresh gateway and
      -- reports only its own spend. A document that failed twice and then succeeded cost us
      -- three attempts, and replacing here would quietly discard the two expensive ones.
      model_cost_usd = model_cost_usd + spent_usd,
      model_calls = model_calls + spent_calls,
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

  -- The run is recomputed from its jobs rather than incremented, so it cannot drift from them.
  update public.processing_runs
  set model_cost_usd = (
        select coalesce(sum(model_cost_usd), 0) from public.processing_jobs
        where organization_id = job_row.organization_id and processing_run_id = job_row.processing_run_id
      ),
      model_calls = (
        select coalesce(sum(model_calls), 0) from public.processing_jobs
        where organization_id = job_row.organization_id and processing_run_id = job_row.processing_run_id
      ),
      status = case when pending = 0 then (case when failed > 0 then 'partial' else 'succeeded' end) else status end,
      completed_at = case when pending = 0 then now() else completed_at end
  where organization_id = job_row.organization_id and id = job_row.processing_run_id;

  return jsonb_build_object('job_id', job_row.id, 'pending_jobs', pending, 'failed_jobs', failed);
end;
$$;

-- A failed job spent money too, and the ledger counts it.
--
-- The same reported figure, read from `p_error` instead of `p_result`, because the worker
-- reports its spend on both paths. A ledger that only counted successes would show the
-- cheapest possible version of the truth, and the runaway this ceiling exists to catch is
-- exactly a document that spends and then fails, over and over.
create or replace function private.worker_fail_job(
  p_job_id uuid,
  p_capability_token text,
  p_error jsonb,
  p_retryable boolean default true,
  p_retry_in_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  retry_seconds integer := least(greatest(coalesce(p_retry_in_seconds, 60), 5), 3600);
  will_retry boolean;
  pending integer;
  failed integer;
  spent_usd numeric(12, 4) := private.reported_spend_usd(p_error);
  spent_calls integer := private.reported_spend_calls(p_error);
begin
  will_retry := coalesce(p_retryable, true) and job_row.attempts < job_row.max_attempts;

  update public.processing_jobs
  set status = case when will_retry then 'queued' else 'failed' end,
      available_at = case when will_retry then now() + make_interval(secs => retry_seconds) else available_at end,
      capability_sha256 = null,
      leased_by = null,
      lease_expires_at = null,
      -- Accumulated across attempts, not replaced: a document that fails three times cost us
      -- three times, and this is the number that has to say so.
      model_cost_usd = model_cost_usd + spent_usd,
      model_calls = model_calls + spent_calls,
      last_error = coalesce(p_error, '{}'::jsonb)
  where id = job_row.id;

  if not will_retry then
    update public.source_documents
    set processing_status = 'failed'
    where organization_id = job_row.organization_id
      and id = job_row.source_document_id
      and processing_status in ('processing', 'quarantined', 'scanning');
  end if;

  select
    count(*) filter (where status in ('queued', 'leased')),
    count(*) filter (where status in ('failed', 'poison'))
  into pending, failed
  from public.processing_jobs
  where organization_id = job_row.organization_id and processing_run_id = job_row.processing_run_id;

  update public.processing_runs
  set model_cost_usd = (
        select coalesce(sum(model_cost_usd), 0) from public.processing_jobs
        where organization_id = job_row.organization_id and processing_run_id = job_row.processing_run_id
      ),
      model_calls = (
        select coalesce(sum(model_calls), 0) from public.processing_jobs
        where organization_id = job_row.organization_id and processing_run_id = job_row.processing_run_id
      ),
      status = case when pending = 0 then (case when failed > 0 then 'failed' else 'succeeded' end) else status end,
      error = case when pending = 0 and failed > 0 then coalesce(p_error, '{}'::jsonb) else error end,
      completed_at = case when pending = 0 then now() else completed_at end
  where organization_id = job_row.organization_id and id = job_row.processing_run_id;

  if pending = 0 and failed > 0 then
    update public.document_intake_sessions
    set status = 'failed'
    where organization_id = job_row.organization_id
      and id = job_row.intake_session_id
      and status = 'processing';
  end if;

  return jsonb_build_object('job_id', job_row.id, 'retrying', will_retry, 'pending_jobs', pending, 'failed_jobs', failed);
end;
$$;

-- The month's ceiling, checked at the door and nowhere else.
create or replace function private.month_spend_usd(p_organization_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(model_cost_usd), 0)
  from public.processing_runs
  where organization_id = p_organization_id
    and created_at >= date_trunc('month', now());
$$;

revoke all on function private.month_spend_usd(uuid) from public, anon;
grant execute on function private.month_spend_usd(uuid) to authenticated;

-- And the ceiling itself, in the one place where refusing costs nobody a case in progress.
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
  job_id uuid;
  download_url text;
  layer_object_path text;
  layer_upload_url text;
  layer_prefix text;
  storage_at integer;
  monthly_ceiling numeric;
begin
  if p_trigger not in ('upload', 'manual', 'answer', 'reprocess', 'document_removed') then
    raise exception 'processing_trigger_invalid' using errcode = '22023';
  end if;
  if p_documents is null or jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) = 0 then
    raise exception 'processing_documents_required' using errcode = '22023';
  end if;
  if coalesce(trim(p_pipeline_version), '') = '' then
    raise exception 'pipeline_version_required' using errcode = '22023';
  end if;

  session_row := private.intake_session_for_update(p_organization_id, p_session_id);

  if session_row.status not in ('collecting', 'processing', 'review_ready', 'failed') then
    raise exception 'intake_session_not_processable' using errcode = '22023';
  end if;

  -- The month's ceiling, checked here and nowhere else. A run already in flight is never
  -- touched by this: stopping a case halfway is worse than the last few dollars of it, and the
  -- company that is mid-case is the one least able to do anything about a limit. The next run
  -- is refused in the open instead, with a code the app turns into a sentence.
  select model_monthly_ceiling_usd into monthly_ceiling
  from public.organizations where id = p_organization_id;

  if monthly_ceiling is not null and private.month_spend_usd(p_organization_id) >= monthly_ceiling then
    raise exception 'model_month_ceiling_reached' using errcode = '53400';
  end if;

  layer_prefix := p_organization_id::text || '/' || p_session_id::text || '/';

  select coalesce(max(run_no), 0) + 1 into next_run_no
  from public.processing_runs
  where organization_id = p_organization_id and intake_session_id = p_session_id;

  insert into public.processing_runs (
    organization_id, intake_session_id, run_no, trigger, status, pipeline_version, budget, created_by
  )
  values (
    p_organization_id, p_session_id, next_run_no, p_trigger, 'queued', trim(p_pipeline_version),
    coalesce(p_budget, '{}'::jsonb), (select auth.uid())
  )
  returning * into run_row;

  for document_entry in select * from jsonb_array_elements(p_documents)
  loop
    select * into document_row
    from public.source_documents
    where organization_id = p_organization_id
      and id = (document_entry->>'source_document_id')::uuid
      and intake_session_id = p_session_id;

    if not found then
      raise exception 'source_document_not_in_session' using errcode = 'P0002';
    end if;

    download_url := document_entry->>'download_url';
    layer_object_path := document_entry->>'layer_object_path';
    layer_upload_url := document_entry->>'layer_upload_url';

    -- A download link is only acceptable for the object this row already resolved to. The
    -- object path has to appear inside the Storage part of the URL rather than anywhere in
    -- it, so a query string cannot be used to smuggle the expected text past the check.
    if download_url is not null then
      storage_at := position('/storage/v1/' in download_url);
      if storage_at = 0 or position(document_row.object_path in download_url) <= storage_at then
        raise exception 'processing_url_not_for_document' using errcode = '22023';
      end if;
    end if;

    -- The layer is written under `<organization>/<session>/`, which is the prefix the Storage
    -- policies read (`private.storage_organization_id` and `private.storage_opportunity_id`
    -- take folders 1 and 2). A path outside it is either another tenant's or unpoliced.
    if layer_object_path is not null and left(layer_object_path, length(layer_prefix)) <> layer_prefix then
      raise exception 'processing_layer_path_outside_session' using errcode = '22023';
    end if;

    if layer_upload_url is not null then
      if layer_object_path is null then
        raise exception 'processing_layer_path_required' using errcode = '22023';
      end if;
      storage_at := position('/storage/v1/' in layer_upload_url);
      if storage_at = 0 or position(layer_object_path in layer_upload_url) <= storage_at then
        raise exception 'processing_url_not_for_document' using errcode = '22023';
      end if;
    end if;

    insert into public.processing_jobs (
      organization_id, processing_run_id, intake_session_id, source_document_id, kind, payload
    )
    values (
      p_organization_id, run_row.id, p_session_id, document_row.id, 'document_pipeline',
      jsonb_strip_nulls(jsonb_build_object(
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
        'locale', session_row.locale
      ))
    )
    returning id into job_id;

    created_jobs := created_jobs || job_id;
  end loop;

  update public.document_intake_sessions
  set status = 'processing',
      current_run_id = run_row.id,
      pipeline_version = trim(p_pipeline_version),
      processing_started_at = now(),
      processing_completed_at = null
  where organization_id = p_organization_id and id = p_session_id;

  return jsonb_build_object(
    'processing_run_id', run_row.id,
    'run_no', run_row.run_no,
    'job_ids', to_jsonb(created_jobs),
    'job_count', coalesce(array_length(created_jobs, 1), 0)
  );
end;
$$;
