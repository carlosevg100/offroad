-- Extend the incremental Deal State runtime to the Prepare gate. An approved production
-- plan is the only state that may enqueue material compilation. The browser supplies only
-- a named transition; Postgres resolves and fingerprints the current governed object.

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
  trigger_object_type text;
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
    'structure_confirmed',
    'production_plan_approved'
  ) then
    raise exception 'deal_state_analysis_trigger_invalid' using errcode = '22023';
  end if;

  trigger_object_type := case p_trigger_source
    when 'understanding_confirmed' then 'understanding_snapshot'
    when 'production_plan_approved' then 'production_plan'
    else 'structure_decision'
  end;

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
    and state_object.object_type = trigger_object_type
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
    )
    or (
      p_trigger_source = 'production_plan_approved'
      and trigger_object.status <> 'approved'
    ) then
    raise exception 'current_deal_state_trigger_required' using errcode = '55000';
  end if;

  -- Exact replay is idempotent. A failed job may be retried, but queued, leased and
  -- successful work for the same decision fingerprint is never duplicated.
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

