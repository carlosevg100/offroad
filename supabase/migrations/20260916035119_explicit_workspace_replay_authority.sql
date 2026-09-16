-- Replaying a request requires the same explicit workspace and current work grant.

CREATE OR REPLACE FUNCTION private.start_public_company_debt_view_v1(p_request_id uuid, p_locale text, p_project_name text, p_company_name text, p_company_website text, p_brief jsonb, p_plan jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  existing_brief public.capital_project_briefs;
  v_session_id uuid;
  v_project_id uuid;
  v_plan_id uuid;
  v_brief_id uuid;
  v_run_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
  next_run_no integer;
  brief_fingerprint text;
  task_ids jsonb;
  focus text := nullif(trim(coalesce(p_brief ->> 'focus', '')), '');
  known_context text := nullif(trim(coalesce(p_brief ->> 'knownContext', '')), '');
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  perform private.require_workspace_capability((select organization_id from private.workspace_membership_v1()), 'origination_representation');

  select brief.* into existing_brief
  from public.capital_project_briefs brief
  join public.organization_memberships membership
    on membership.organization_id = brief.organization_id
  where brief.request_id = p_request_id
    and brief.brief_kind = 'company_debt_view'
    and membership.user_id = caller_id
    and membership.status = 'active';
  if found then
    perform private.require_resource_access_v1(existing_brief.capital_project_id,'work');
    select session.id into v_session_id
    from public.document_intake_sessions session
    where session.organization_id = existing_brief.organization_id
      and session.capital_project_id = existing_brief.capital_project_id;
    select job.id into v_job_id
    from public.processing_jobs job
    where job.organization_id = existing_brief.organization_id
      and job.kind = 'capital_project_analysis'
      and job.payload ->> 'capital_project_brief_id' = existing_brief.id::text
    order by job.created_at desc limit 1;
    return jsonb_build_object(
      'capital_project_id', existing_brief.capital_project_id,
      'intake_session_id', v_session_id,
      'brief_id', existing_brief.id,
      'job_id', v_job_id,
      'replayed', true
    );
  end if;

  if p_request_id is null
    or coalesce(jsonb_typeof(p_brief), 'null') <> 'object'
    or coalesce(char_length(focus), 0) > 3000
    or coalesce(char_length(known_context), 0) > 5000
    or p_plan #>> '{job,id}' <> 'company_debt_view'
    or p_plan #>> '{job,firstWorkProduct}' <> 'company_debt_diagnostic' then
    raise exception 'invalid_company_debt_view_setup' using errcode = '22023';
  end if;

  v_session_id := private.start_public_capital_project_v2(
    p_locale, p_project_name, 'company_debt_view', p_company_name, p_company_website, p_plan
  );
  v_project_id := private.capital_project_id_for_session(v_session_id);

  select plan.id into v_plan_id
  from public.capital_project_plans plan
  where plan.capital_project_id = v_project_id and plan.status = 'active';
  if not found then raise exception 'company_debt_view_plan_not_found' using errcode = 'P0002'; end if;

  brief_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'capitalProjectId', v_project_id,
    'briefKind', 'company_debt_view',
    'content', p_brief
  )::text, 'utf8'), 'sha256'), 'hex');

  insert into public.capital_project_briefs (
    organization_id, capital_project_id, request_id, brief_kind, brief_version,
    status, content, content_fingerprint, created_by
  )
  select project.organization_id, project.id, p_request_id, 'company_debt_view', 1,
    'active', p_brief, brief_fingerprint, caller_id
  from public.capital_projects project
  where project.id = v_project_id
  returning id into v_brief_id;

  select coalesce(jsonb_agg(task.task_id order by task.ordinal), '[]'::jsonb)
  into task_ids
  from public.capital_project_plan_tasks task
  where task.plan_id = v_plan_id;

  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.intake_session_id = v_session_id;

  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  )
  select v_run_id, project.organization_id, v_session_id, next_run_no, 'manual', 'queued',
    'company-debt-view-2026.09.01-v1',
    jsonb_build_object('maxCalls', 2, 'maxCostUsd', 0.95, 'externalSearchMaxUsd', 0.04),
    jsonb_build_object(
      'planId', v_plan_id,
      'briefId', v_brief_id,
      'executor', 'company-debt-view-2026.09.01-v1'
    ),
    caller_id
  from public.capital_projects project
  where project.id = v_project_id;

  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload, max_attempts
  )
  select v_job_id, project.organization_id, v_run_id, v_session_id, 'capital_project_analysis',
    jsonb_build_object(
      'analysis_scope', 'company_debt_view',
      'locale', p_locale,
      'capital_project_id', v_project_id,
      'capital_project_plan_id', v_plan_id,
      'capital_project_brief_id', v_brief_id,
      'capital_task_ids', task_ids,
      'capital_artifact_required', true,
      'trigger_event', jsonb_build_object('type', 'project_started', 'requestId', p_request_id),
      'model_budget', jsonb_build_object('max_cost_usd', 0.95, 'max_calls', 2)
    ), 2
  from public.capital_projects project
  where project.id = v_project_id;

  update public.document_intake_sessions session
  set current_run_id = v_run_id,
      status = 'processing',
      processing_started_at = now(),
      processing_completed_at = null,
      pipeline_version = 'company-debt-view-2026.09.01-v1',
      updated_at = now()
  where session.id = v_session_id;

  return jsonb_build_object(
    'capital_project_id', v_project_id,
    'intake_session_id', v_session_id,
    'brief_id', v_brief_id,
    'job_id', v_job_id,
    'replayed', false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.start_public_origination_thesis_v1(p_request_id uuid, p_locale text, p_project_name text, p_company_name text, p_company_website text, p_brief jsonb, p_plan jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  existing_brief public.capital_project_briefs;
  v_session_id uuid;
  v_project_id uuid;
  v_plan_id uuid;
  v_brief_id uuid;
  v_run_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
  next_run_no integer;
  brief_fingerprint text;
  task_ids jsonb;
  meeting_context text := trim(coalesce(p_brief ->> 'meetingContext', ''));
  thesis_to_test text := nullif(trim(coalesce(p_brief ->> 'thesisToTest', '')), '');
  audience text := nullif(trim(coalesce(p_brief ->> 'audience', '')), '');
  meeting_date text := nullif(trim(coalesce(p_brief ->> 'meetingDate', '')), '');
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  perform private.require_workspace_capability((select organization_id from private.workspace_membership_v1()), 'origination_representation');

  select brief.* into existing_brief
  from public.capital_project_briefs brief
  join public.organization_memberships membership
    on membership.organization_id = brief.organization_id
  where brief.request_id = p_request_id
    and brief.brief_kind = 'origination_thesis'
    and membership.user_id = caller_id
    and membership.status = 'active';
  if found then
    perform private.require_resource_access_v1(existing_brief.capital_project_id,'work');
    select session.id into v_session_id
    from public.document_intake_sessions session
    where session.organization_id = existing_brief.organization_id
      and session.capital_project_id = existing_brief.capital_project_id;
    select job.id into v_job_id
    from public.processing_jobs job
    join public.processing_runs run
      on run.organization_id = job.organization_id and run.id = job.processing_run_id
    where job.organization_id = existing_brief.organization_id
      and job.kind = 'capital_project_analysis'
      and job.payload ->> 'capital_project_brief_id' = existing_brief.id::text
    order by job.created_at desc limit 1;
    return jsonb_build_object(
      'capital_project_id', existing_brief.capital_project_id,
      'intake_session_id', v_session_id,
      'brief_id', existing_brief.id,
      'job_id', v_job_id,
      'replayed', true
    );
  end if;

  if p_request_id is null
    or coalesce(jsonb_typeof(p_brief), 'null') <> 'object'
    or char_length(meeting_context) not between 10 and 5000
    or coalesce(char_length(thesis_to_test), 0) > 3000
    or coalesce(char_length(audience), 0) > 240
    or (meeting_date is not null and meeting_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    or p_plan #>> '{job,id}' <> 'origination_thesis'
    or p_plan #>> '{job,firstWorkProduct}' <> 'meeting_brief' then
    raise exception 'invalid_origination_thesis_setup' using errcode = '22023';
  end if;

  v_session_id := private.start_public_capital_project_v2(
    p_locale, p_project_name, 'origination_thesis', p_company_name, p_company_website, p_plan
  );
  v_project_id := private.capital_project_id_for_session(v_session_id);

  select plan.id into v_plan_id
  from public.capital_project_plans plan
  where plan.capital_project_id = v_project_id and plan.status = 'active';
  if not found then
    raise exception 'origination_thesis_plan_not_found' using errcode = 'P0002';
  end if;

  brief_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'capitalProjectId', v_project_id,
    'briefKind', 'origination_thesis',
    'content', p_brief
  )::text, 'utf8'), 'sha256'), 'hex');

  insert into public.capital_project_briefs (
    organization_id, capital_project_id, request_id, brief_kind, brief_version,
    status, content, content_fingerprint, created_by
  )
  select project.organization_id, project.id, p_request_id, 'origination_thesis', 1,
    'active', p_brief, brief_fingerprint, caller_id
  from public.capital_projects project
  where project.id = v_project_id
  returning id into v_brief_id;

  select coalesce(jsonb_agg(task.task_id order by task.ordinal), '[]'::jsonb)
  into task_ids
  from public.capital_project_plan_tasks task
  where task.plan_id = v_plan_id;

  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  join public.document_intake_sessions session
    on session.organization_id = run.organization_id and session.id = run.intake_session_id
  where session.capital_project_id = v_project_id;

  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  )
  select v_run_id, project.organization_id, v_session_id, next_run_no, 'manual', 'queued',
    'origination-thesis-2026.09.01-v1',
    jsonb_build_object('maxCalls', 2, 'maxCostUsd', 0.75, 'externalSearchMaxUsd', 0.04),
    jsonb_build_object(
      'planId', v_plan_id,
      'briefId', v_brief_id,
      'executor', 'origination-thesis-2026.09.01-v1'
    ),
    caller_id
  from public.capital_projects project
  where project.id = v_project_id;

  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload,
    max_attempts
  )
  select v_job_id, project.organization_id, v_run_id, v_session_id, 'capital_project_analysis',
    jsonb_build_object(
      'analysis_scope', 'origination_thesis',
      'locale', p_locale,
      'capital_project_id', v_project_id,
      'capital_project_plan_id', v_plan_id,
      'capital_project_brief_id', v_brief_id,
      'capital_task_ids', task_ids,
      'capital_artifact_required', true,
      'trigger_event', jsonb_build_object('type', 'project_started', 'requestId', p_request_id),
      'model_budget', jsonb_build_object('max_cost_usd', 0.75, 'max_calls', 2)
    ),
    2
  from public.capital_projects project
  where project.id = v_project_id;

  update public.document_intake_sessions session
  set current_run_id = v_run_id,
      status = 'processing',
      processing_started_at = now(),
      processing_completed_at = null,
      pipeline_version = 'origination-thesis-2026.09.01-v1',
      updated_at = now()
  where session.id = v_session_id;

  return jsonb_build_object(
    'capital_project_id', v_project_id,
    'intake_session_id', v_session_id,
    'brief_id', v_brief_id,
    'job_id', v_job_id,
    'replayed', false
  );
end;
$function$
;
