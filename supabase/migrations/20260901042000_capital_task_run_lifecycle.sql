-- Turn an immutable capital-project plan into an auditable execution rail. A TaskSpec is not
-- "running" because the UI says so: a leased worker must hold a capability for a processing job
-- whose payload names the exact active plan and the exact tasks it may execute. Successful runs
-- require a versioned executor, an input fingerprint, an output reference and passing graders.

alter table public.capital_project_task_runs
  add column processing_job_id uuid,
  add column executor_key text,
  add column executor_version text,
  add column output_fingerprint text,
  add constraint capital_project_task_runs_processing_job_fkey
    foreign key (organization_id, processing_job_id)
    references public.processing_jobs(organization_id, id) on delete restrict,
  add constraint capital_project_task_runs_executor_check check (
    (status = 'queued' and executor_key is null and executor_version is null)
    or (
      status <> 'queued'
      and executor_key is not null
      and executor_version is not null
      and executor_key ~ '^[a-z0-9][a-z0-9._-]{2,99}$'
      and char_length(trim(executor_version)) between 3 and 80
    )
  ),
  add constraint capital_project_task_runs_output_fingerprint_check check (
    output_fingerprint is null or output_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add constraint capital_project_task_runs_processing_job_required check (
    status = 'queued' or processing_job_id is not null
  ),
  add constraint capital_project_task_runs_completion_state_check check (
    (status in ('queued', 'running') and completed_at is null)
    or (status not in ('queued', 'running') and completed_at is not null)
  ),
  add constraint capital_project_task_runs_success_proof_check check (
    status <> 'succeeded'
    or (
      output_reference is not null
      and output_fingerprint is not null
      and jsonb_array_length(quality_results) > 0
    )
  ),
  add constraint capital_project_task_runs_failure_detail_check check (
    status not in ('failed', 'blocked') or error is not null
  );

create index capital_project_task_runs_processing_job_idx
  on public.capital_project_task_runs (organization_id, processing_job_id)
  where processing_job_id is not null;

create or replace function private.worker_start_capital_project_task(
  p_job_id uuid,
  p_capability_token text,
  p_task_id text,
  p_executor_key text,
  p_executor_version text,
  p_input_fingerprint text,
  p_context_manifest jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  plan_row public.capital_project_plans;
  plan_task public.capital_project_plan_tasks;
  latest_run public.capital_project_task_runs;
  next_attempt integer;
  run_id uuid;
  missing_dependencies text[];
  trigger_event jsonb := coalesce(job_row.payload -> 'trigger_event', '{}'::jsonb);
begin
  if p_task_id !~ '^[A-Z][0-9]{2}$'
    or coalesce(p_executor_key, '') !~ '^[a-z0-9][a-z0-9._-]{2,99}$'
    or char_length(trim(coalesce(p_executor_version, ''))) not between 3 and 80
    or coalesce(p_input_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or coalesce(jsonb_typeof(p_context_manifest), 'null') <> 'object'
    or coalesce(jsonb_typeof(trigger_event), 'null') <> 'object'
    or coalesce(jsonb_typeof(job_row.payload -> 'capital_task_ids'), 'null') <> 'array'
    or not ((job_row.payload -> 'capital_task_ids') @> jsonb_build_array(p_task_id)) then
    raise exception 'capital_task_capability_invalid' using errcode = '42501';
  end if;

  select plan.* into plan_row
  from public.document_intake_sessions session
  join public.capital_project_plans plan
    on plan.organization_id = session.organization_id
    and plan.capital_project_id = session.capital_project_id
    and plan.status = 'active'
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and plan.id::text = job_row.payload ->> 'capital_project_plan_id'
  for update of plan;
  if not found then
    raise exception 'capital_task_plan_not_available' using errcode = 'P0002';
  end if;

  select task.* into plan_task
  from public.capital_project_plan_tasks task
  where task.organization_id = plan_row.organization_id
    and task.plan_id = plan_row.id
    and task.task_id = p_task_id;
  if not found then
    raise exception 'capital_task_not_in_plan' using errcode = '22023';
  end if;

  select array_agg(dependency_id order by dependency_id)
  into missing_dependencies
  from unnest(plan_task.dependencies) dependency_id
  where not exists (
    select 1
    from public.capital_project_plan_tasks dependency_task
    join public.capital_project_task_runs dependency_run
      on dependency_run.organization_id = dependency_task.organization_id
      and dependency_run.plan_task_id = dependency_task.id
      and dependency_run.status = 'succeeded'
    where dependency_task.organization_id = plan_row.organization_id
      and dependency_task.plan_id = plan_row.id
      and dependency_task.task_id = dependency_id
  );
  if cardinality(missing_dependencies) > 0 then
    raise exception 'capital_task_dependencies_incomplete:%', array_to_string(missing_dependencies, ',')
      using errcode = '55000';
  end if;

  select run.* into latest_run
  from public.capital_project_task_runs run
  where run.organization_id = plan_row.organization_id
    and run.plan_task_id = plan_task.id
  order by run.attempt_no desc
  limit 1
  for update;

  if found then
    if latest_run.status in ('running', 'queued') then
      if latest_run.processing_job_id = job_row.id
        and latest_run.executor_key = p_executor_key
        and latest_run.executor_version = p_executor_version
        and latest_run.input_fingerprint = p_input_fingerprint then
        return latest_run.id;
      end if;
      raise exception 'capital_task_already_active' using errcode = '55000';
    end if;
    if latest_run.status = 'succeeded' then
      if latest_run.executor_key = p_executor_key
        and latest_run.executor_version = p_executor_version
        and latest_run.input_fingerprint = p_input_fingerprint then
        return latest_run.id;
      end if;
      raise exception 'capital_task_input_changed_requires_invalidation' using errcode = '55000';
    end if;
  end if;

  next_attempt := coalesce(latest_run.attempt_no, 0) + 1;
  if next_attempt > 10 then
    raise exception 'capital_task_attempt_limit' using errcode = '54000';
  end if;

  insert into public.capital_project_task_runs (
    organization_id, capital_project_id, plan_id, plan_task_id, processing_job_id,
    attempt_no, status, trigger_event, context_manifest, input_fingerprint,
    executor_key, executor_version, started_at
  ) values (
    plan_row.organization_id, plan_row.capital_project_id, plan_row.id, plan_task.id,
    job_row.id, next_attempt, 'running', trigger_event, p_context_manifest,
    p_input_fingerprint, p_executor_key, p_executor_version, now()
  ) returning id into run_id;
  return run_id;
end;
$$;

create or replace function public.worker_start_capital_project_task(
  p_job_id uuid,
  p_capability_token text,
  p_task_id text,
  p_executor_key text,
  p_executor_version text,
  p_input_fingerprint text,
  p_context_manifest jsonb default '{}'::jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.worker_start_capital_project_task(
    p_job_id, p_capability_token, p_task_id, p_executor_key, p_executor_version,
    p_input_fingerprint, p_context_manifest
  );
$$;

create or replace function private.worker_finish_capital_project_task(
  p_job_id uuid,
  p_capability_token text,
  p_task_run_id uuid,
  p_status text,
  p_output_reference jsonb default null,
  p_output_fingerprint text default null,
  p_quality_results jsonb default '[]'::jsonb,
  p_usage jsonb default '{}'::jsonb,
  p_error jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  run_row public.capital_project_task_runs;
begin
  select run.* into run_row
  from public.capital_project_task_runs run
  where run.organization_id = job_row.organization_id
    and run.id = p_task_run_id
    and run.processing_job_id = job_row.id
  for update;
  if not found then
    raise exception 'capital_task_run_not_available' using errcode = 'P0002';
  end if;

  if run_row.status <> 'running' then
    if run_row.status = p_status then return run_row.id; end if;
    raise exception 'capital_task_run_not_running' using errcode = '55000';
  end if;
  if p_status not in ('waiting_user', 'blocked', 'succeeded', 'failed', 'cancelled')
    or coalesce(jsonb_typeof(p_quality_results), 'null') <> 'array'
    or coalesce(jsonb_typeof(p_usage), 'null') <> 'object'
    or (p_output_reference is not null and jsonb_typeof(p_output_reference) <> 'object')
    or (p_error is not null and jsonb_typeof(p_error) <> 'object')
    or (p_output_fingerprint is not null and p_output_fingerprint !~ '^[0-9a-f]{64}$') then
    raise exception 'capital_task_result_invalid' using errcode = '22023';
  end if;

  if p_status = 'succeeded' and (
    p_output_reference is null
    or coalesce(p_output_reference ->> 'type', '') !~ '^[a-z0-9_]{3,80}$'
    or coalesce(p_output_reference ->> 'id', '') = ''
    or coalesce(p_output_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or jsonb_array_length(p_quality_results) = 0
    or exists (
      select 1 from jsonb_array_elements(p_quality_results) quality(result)
      where jsonb_typeof(result) <> 'object'
        or (result -> 'passed') is distinct from 'true'::jsonb
    )
  ) then
    raise exception 'capital_task_success_not_proven' using errcode = '22023';
  end if;
  if p_status in ('failed', 'blocked') and p_error is null then
    raise exception 'capital_task_error_required' using errcode = '22023';
  end if;
  if p_status = 'waiting_user' and p_output_reference is null then
    raise exception 'capital_task_user_input_reference_required' using errcode = '22023';
  end if;

  update public.capital_project_task_runs run
  set status = p_status,
      output_reference = p_output_reference,
      output_fingerprint = p_output_fingerprint,
      quality_results = p_quality_results,
      usage = p_usage,
      error = p_error,
      completed_at = now()
  where run.organization_id = job_row.organization_id
    and run.id = run_row.id;
  return run_row.id;
end;
$$;

create or replace function public.worker_finish_capital_project_task(
  p_job_id uuid,
  p_capability_token text,
  p_task_run_id uuid,
  p_status text,
  p_output_reference jsonb default null,
  p_output_fingerprint text default null,
  p_quality_results jsonb default '[]'::jsonb,
  p_usage jsonb default '{}'::jsonb,
  p_error jsonb default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.worker_finish_capital_project_task(
    p_job_id, p_capability_token, p_task_run_id, p_status, p_output_reference,
    p_output_fingerprint, p_quality_results, p_usage, p_error
  );
$$;

revoke all on function private.worker_start_capital_project_task(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.worker_start_capital_project_task(uuid, text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function private.worker_start_capital_project_task(uuid, text, text, text, text, text, jsonb)
  to authenticated;
grant execute on function public.worker_start_capital_project_task(uuid, text, text, text, text, text, jsonb)
  to authenticated;

revoke all on function private.worker_finish_capital_project_task(uuid, text, uuid, text, jsonb, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.worker_finish_capital_project_task(uuid, text, uuid, text, jsonb, text, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function private.worker_finish_capital_project_task(uuid, text, uuid, text, jsonb, text, jsonb, jsonb, jsonb)
  to authenticated;
grant execute on function public.worker_finish_capital_project_task(uuid, text, uuid, text, jsonb, text, jsonb, jsonb, jsonb)
  to authenticated;

comment on function public.worker_start_capital_project_task(uuid, text, text, text, text, text, jsonb) is
  'Starts only a TaskSpec explicitly scoped into the claimed job and the project active plan.';
comment on function public.worker_finish_capital_project_task(uuid, text, uuid, text, jsonb, text, jsonb, jsonb, jsonb) is
  'Finishes a capability-bound TaskRun; success requires a referenced output and passing graders.';
