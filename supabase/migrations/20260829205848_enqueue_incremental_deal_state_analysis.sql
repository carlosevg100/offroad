-- Continue a governed case after document intake has been confirmed without reopening the
-- document pipeline. User decisions create one bounded case-analysis job over the persisted
-- evidence and Deal State. The trigger is derived from the latest state object in Postgres,
-- never accepted from the browser as a fingerprint.

create or replace function private.enqueue_incremental_deal_state_analysis(
  p_organization_id uuid,
  p_session_id uuid,
  p_trigger_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  trigger_object public.deal_state_objects;
  rollout public.organization_rollout_policies;
  existing_job public.processing_jobs;
  active_job public.processing_jobs;
  next_run_no integer;
  run_id uuid;
  execution_id uuid;
  job_id uuid;
  pipeline_version text;
  model_policy_version text;
  effective_budget jsonb := jsonb_build_object(
    'max_cost_usd', 1,
    'max_calls', 4,
    'case_max_cost_usd', 1,
    'case_max_calls', 4,
    'document_max_cost_usd', 0,
    'document_max_calls', 0
  );
begin
  if actor_id is null
    or not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'deal_state_analysis_access_denied' using errcode = '42501';
  end if;

  if p_trigger_source not in (
    'understanding_confirmed',
    'structure_changes_requested',
    'structure_confirmed'
  ) then
    raise exception 'deal_state_analysis_trigger_invalid' using errcode = '22023';
  end if;

  select * into session_row
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id
    and session.id = p_session_id
  for update;

  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;
  if session_row.status <> 'confirmed' or session_row.opportunity_id is null then
    raise exception 'confirmed_case_required' using errcode = '55000';
  end if;

  select * into trigger_object
  from public.deal_state_objects state_object
  where state_object.organization_id = p_organization_id
    and state_object.intake_session_id = p_session_id
    and state_object.object_type = case p_trigger_source
      when 'understanding_confirmed' then 'understanding_snapshot'
      else 'structure_decision'
    end
  order by state_object.object_version desc
  limit 1;

  if not found
    or (
      p_trigger_source = 'understanding_confirmed'
      and trigger_object.status not in ('confirmed', 'approved')
    )
    or (
      p_trigger_source = 'structure_changes_requested'
      and trigger_object.status <> 'changes_requested'
    )
    or (
      p_trigger_source = 'structure_confirmed'
      and trigger_object.status not in ('confirmed', 'approved')
    ) then
    raise exception 'current_deal_state_trigger_required' using errcode = '55000';
  end if;

  -- Repeated form submissions for the exact same governed decision are idempotent. A failed
  -- job may be retried with a new run, but queued, leased and successful work is never duplicated.
  select job.* into existing_job
  from public.processing_jobs job
  where job.organization_id = p_organization_id
    and job.intake_session_id = p_session_id
    and job.kind = 'case_analysis'
    and job.payload ->> 'incremental_trigger' = p_trigger_source
    and job.payload ->> 'trigger_fingerprint' = trigger_object.object_fingerprint
    and job.status in ('queued', 'leased', 'succeeded')
  order by job.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'processing_run_id', existing_job.processing_run_id,
      'job_id', existing_job.id,
      'job_status', existing_job.status,
      'trigger', p_trigger_source,
      'trigger_fingerprint', trigger_object.object_fingerprint,
      'deduplicated', true
    );
  end if;

  select job.* into active_job
  from public.processing_jobs job
  where job.organization_id = p_organization_id
    and job.intake_session_id = p_session_id
    and job.kind = 'case_analysis'
    and job.status in ('queued', 'leased')
  order by job.created_at desc
  limit 1;

  if found then
    raise exception 'deal_state_analysis_already_running' using errcode = '55000';
  end if;

  select * into rollout
  from public.organization_rollout_policies policy
  where policy.organization_id = p_organization_id;

  pipeline_version := coalesce(
    nullif(trim(rollout.target_pipeline_version), ''),
    nullif(trim(session_row.pipeline_version), ''),
    '2026.08.29-v1'
  );
  model_policy_version := coalesce(
    nullif(trim(rollout.target_model_policy_version), ''),
    '2026.08.24-v1'
  );

  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.organization_id = p_organization_id
    and run.intake_session_id = p_session_id;

  insert into public.processing_runs (
    organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    p_organization_id, p_session_id, next_run_no, 'answer', 'queued',
    pipeline_version,
    effective_budget,
    jsonb_build_object('incremental_deal_state', jsonb_build_object(
      'trigger', p_trigger_source,
      'trigger_fingerprint', trigger_object.object_fingerprint
    )),
    actor_id
  ) returning id into run_id;

  insert into public.controlled_case_executions (
    organization_id, intake_session_id, processing_run_id, mode, status,
    pipeline_version, model_policy_version, created_by
  ) values (
    p_organization_id, p_session_id, run_id, 'primary', 'queued',
    pipeline_version, model_policy_version, actor_id
  ) returning id into execution_id;

  insert into public.processing_jobs (
    organization_id, processing_run_id, intake_session_id, kind, payload,
    controlled_execution_id, max_attempts
  ) values (
    p_organization_id, run_id, p_session_id, 'case_analysis',
    jsonb_build_object(
      'locale', session_row.locale,
      'execution_id', execution_id,
      'execution_mode', 'primary',
      'incremental_trigger', p_trigger_source,
      'trigger_fingerprint', trigger_object.object_fingerprint,
      'model_budget', jsonb_build_object('max_cost_usd', 1, 'max_calls', 4)
    ),
    execution_id,
    2
  ) returning id into job_id;

  return jsonb_build_object(
    'processing_run_id', run_id,
    'job_id', job_id,
    'job_status', 'queued',
    'trigger', p_trigger_source,
    'trigger_fingerprint', trigger_object.object_fingerprint,
    'deduplicated', false
  );
end;
$$;

revoke all on function private.enqueue_incremental_deal_state_analysis(uuid, uuid, text)
  from public, anon;
grant execute on function private.enqueue_incremental_deal_state_analysis(uuid, uuid, text)
  to authenticated;

create or replace function public.enqueue_deal_state_analysis(
  p_organization_id uuid,
  p_session_id uuid,
  p_trigger_source text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.enqueue_incremental_deal_state_analysis(
    p_organization_id, p_session_id, p_trigger_source
  );
$$;

revoke all on function public.enqueue_deal_state_analysis(uuid, uuid, text)
  from public, anon;
grant execute on function public.enqueue_deal_state_analysis(uuid, uuid, text)
  to authenticated;

-- Intake confirmation freezes the submitted source data, not the case. Incremental analysis
-- must be allowed to persist a new immutable snapshot while the intake session stays confirmed.
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
      and stored.manifest_fingerprint = v_manifest_fingerprint
      and stored.intake_session_id = job_row.intake_session_id
      and stored.processing_run_id is not distinct from job_row.processing_run_id
      and stored.manifest = p_manifest;

    if manifest_id is null then
      raise exception 'case_manifest_fingerprint_collision' using errcode = '23505';
    end if;
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

revoke all on function private.worker_record_case_snapshot(uuid, text, jsonb, jsonb)
  from public, anon;
grant execute on function private.worker_record_case_snapshot(uuid, text, jsonb, jsonb)
  to authenticated;
