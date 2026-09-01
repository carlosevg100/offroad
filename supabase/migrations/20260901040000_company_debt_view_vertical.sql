-- Second executable capital-project vertical: a public-information company debt view. The
-- worker may identify signals, risks and missing evidence, but public snippets can never become
-- reconciled financials or calculated debt capacity. Private-document promotion remains a
-- separate, authorization-gated execution on the same durable company/project memory.

alter table public.capital_project_briefs
  drop constraint capital_project_briefs_brief_kind_check;
alter table public.capital_project_briefs
  add constraint capital_project_briefs_brief_kind_check
  check (brief_kind in ('origination_thesis', 'company_debt_view'));

create or replace function private.start_public_company_debt_view_v1(
  p_request_id uuid,
  p_locale text,
  p_project_name text,
  p_company_name text,
  p_company_website text,
  p_brief jsonb,
  p_plan jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  select brief.* into existing_brief
  from public.capital_project_briefs brief
  join public.organization_memberships membership
    on membership.organization_id = brief.organization_id
  where brief.request_id = p_request_id
    and brief.brief_kind = 'company_debt_view'
    and membership.user_id = caller_id
    and membership.status = 'active';
  if found then
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
$$;

create or replace function public.start_public_company_debt_view_v1(
  p_request_id uuid, p_locale text, p_project_name text, p_company_name text,
  p_company_website text, p_brief jsonb, p_plan jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.start_public_company_debt_view_v1(
    p_request_id, p_locale, p_project_name, p_company_name, p_company_website, p_brief, p_plan
  );
$$;

revoke all on function private.start_public_company_debt_view_v1(uuid, text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.start_public_company_debt_view_v1(uuid, text, text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function private.start_public_company_debt_view_v1(uuid, text, text, text, text, jsonb, jsonb)
  to authenticated;
grant execute on function public.start_public_company_debt_view_v1(uuid, text, text, text, text, jsonb, jsonb)
  to authenticated;

create or replace function private.request_company_debt_view_revision_v1(
  p_artifact_id uuid,
  p_artifact_fingerprint text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_note text := nullif(trim(coalesce(p_note, '')), '');
  artifact_row public.capital_project_artifacts;
  existing_decision public.capital_project_artifact_decisions;
  v_decision_id uuid;
  v_session_id uuid;
  v_plan_id uuid;
  v_run_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
  next_run_no integer;
begin
  if caller_id is null
    or coalesce(p_artifact_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(normalized_note, '')) not between 2 and 5000 then
    raise exception 'company_debt_revision_invalid' using errcode = '22023';
  end if;

  select decision.* into existing_decision
  from public.capital_project_artifact_decisions decision
  join public.organization_memberships membership
    on membership.organization_id = decision.organization_id
  join public.capital_projects project
    on project.organization_id = decision.organization_id
    and project.id = decision.capital_project_id
  where decision.artifact_id = p_artifact_id
    and decision.artifact_fingerprint = p_artifact_fingerprint
    and decision.decision = 'request_changes'
    and decision.note = normalized_note
    and project.entry_job = 'company_debt_view'
    and membership.user_id = caller_id
    and membership.status = 'active';
  if found then
    select job.id into v_job_id
    from public.processing_jobs job
    where job.organization_id = existing_decision.organization_id
      and job.kind = 'capital_project_analysis'
      and job.payload ->> 'correction_decision_id' = existing_decision.id::text
    order by job.created_at desc limit 1;
    return jsonb_build_object('decision_id', existing_decision.id, 'job_id', v_job_id, 'replayed', true);
  end if;

  select artifact.* into artifact_row
  from public.capital_project_artifacts artifact
  join public.capital_projects project
    on project.organization_id = artifact.organization_id and project.id = artifact.capital_project_id
  join public.organization_memberships membership
    on membership.organization_id = artifact.organization_id
  where artifact.id = p_artifact_id
    and artifact.artifact_fingerprint = p_artifact_fingerprint
    and artifact.artifact_type = 'company_debt_diagnostic'
    and artifact.status = 'pending_confirmation'
    and project.entry_job = 'company_debt_view'
    and project.access_basis = 'public_information'
    and membership.user_id = caller_id
    and membership.status = 'active'
  for update of artifact;
  if not found then raise exception 'company_debt_revision_artifact_not_available' using errcode = 'P0002'; end if;

  select session.id into v_session_id
  from public.document_intake_sessions session
  where session.organization_id = artifact_row.organization_id
    and session.capital_project_id = artifact_row.capital_project_id;
  v_plan_id := artifact_row.plan_id;

  v_decision_id := private.decide_capital_project_artifact(
    p_artifact_id, p_artifact_fingerprint, 'request_changes', normalized_note
  );

  update public.capital_project_task_runs task_run
  set status = 'invalidated', completed_at = now()
  where task_run.organization_id = artifact_row.organization_id
    and task_run.id = artifact_row.task_run_id
    and task_run.status = 'succeeded';
  if not found then raise exception 'company_debt_revision_task_not_invalidateable' using errcode = '55000'; end if;

  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.organization_id = artifact_row.organization_id
    and run.intake_session_id = v_session_id;

  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    v_run_id, artifact_row.organization_id, v_session_id, next_run_no, 'manual', 'queued',
    'company-debt-view-revision-2026.09.01-v1',
    jsonb_build_object('maxCalls', 1, 'maxCostUsd', 0.85, 'externalSearchMaxUsd', 0),
    jsonb_build_object(
      'planId', v_plan_id,
      'revisionOfArtifactId', artifact_row.id,
      'correctionDecisionId', v_decision_id,
      'executor', 'company-debt-view-2026.09.01-v1'
    ), caller_id
  );

  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload, max_attempts
  ) values (
    v_job_id, artifact_row.organization_id, v_run_id, v_session_id,
    'capital_project_analysis', jsonb_build_object(
      'analysis_scope', 'company_debt_view',
      'locale', (select locale from public.document_intake_sessions where id = v_session_id),
      'capital_project_id', artifact_row.capital_project_id,
      'capital_project_plan_id', v_plan_id,
      'capital_project_brief_id', (
        select brief.id from public.capital_project_briefs brief
        where brief.organization_id = artifact_row.organization_id
          and brief.capital_project_id = artifact_row.capital_project_id
          and brief.brief_kind = 'company_debt_view'
          and brief.status = 'active'
      ),
      'capital_task_ids', jsonb_build_array('C11'),
      'capital_artifact_required', true,
      'revision_of_artifact_id', artifact_row.id,
      'correction_decision_id', v_decision_id,
      'trigger_event', jsonb_build_object('type', 'artifact_correction_requested', 'artifactId', artifact_row.id, 'decisionId', v_decision_id),
      'model_budget', jsonb_build_object('max_cost_usd', 0.85, 'max_calls', 1)
    ), 2
  );

  update public.document_intake_sessions session
  set current_run_id = v_run_id,
      status = 'processing',
      processing_started_at = now(),
      processing_completed_at = null,
      pipeline_version = 'company-debt-view-revision-2026.09.01-v1',
      updated_at = now()
  where session.organization_id = artifact_row.organization_id and session.id = v_session_id;

  return jsonb_build_object('decision_id', v_decision_id, 'job_id', v_job_id, 'replayed', false);
end;
$$;

create or replace function public.request_company_debt_view_revision_v1(
  p_artifact_id uuid, p_artifact_fingerprint text, p_note text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.request_company_debt_view_revision_v1(p_artifact_id, p_artifact_fingerprint, p_note);
$$;

revoke all on function private.request_company_debt_view_revision_v1(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.request_company_debt_view_revision_v1(uuid, text, text)
  from public, anon;
grant execute on function private.request_company_debt_view_revision_v1(uuid, text, text)
  to authenticated;
grant execute on function public.request_company_debt_view_revision_v1(uuid, text, text)
  to authenticated;

-- Generalize the capability-bound loader across the two implemented public verticals. The
-- project, brief and job scope must agree; revision dependency access remains an explicit list.
create or replace function private.worker_load_capital_project_context(
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
  project_row public.capital_projects;
  session_row public.document_intake_sessions;
  plan_row public.capital_project_plans;
  brief_row public.capital_project_briefs;
  analysis_scope text := job_row.payload ->> 'analysis_scope';
  revision_dependencies text[];
begin
  if job_row.kind <> 'capital_project_analysis'
    or analysis_scope not in ('origination_thesis', 'company_debt_view') then
    raise exception 'capital_project_analysis_capability_required' using errcode = '42501';
  end if;
  revision_dependencies := case analysis_scope
    when 'origination_thesis' then array['M06','C02','K04']::text[]
    when 'company_debt_view' then array['C09','C10']::text[]
  end;

  select project.* into project_row
  from public.capital_projects project
  where project.organization_id = job_row.organization_id
    and project.id::text = job_row.payload ->> 'capital_project_id'
    and project.entry_job = analysis_scope
    and project.access_basis = 'public_information';
  if not found then raise exception 'capital_project_not_available' using errcode = 'P0002'; end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.capital_project_id = project_row.id;
  if not found then raise exception 'capital_project_session_not_available' using errcode = 'P0002'; end if;

  select plan.* into plan_row
  from public.capital_project_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.id::text = job_row.payload ->> 'capital_project_plan_id'
    and plan.capital_project_id = project_row.id
    and plan.status = 'active';
  if not found then raise exception 'capital_project_plan_not_available' using errcode = 'P0002'; end if;

  select brief.* into brief_row
  from public.capital_project_briefs brief
  where brief.organization_id = job_row.organization_id
    and brief.id::text = job_row.payload ->> 'capital_project_brief_id'
    and brief.capital_project_id = project_row.id
    and brief.brief_kind = analysis_scope
    and brief.status = 'active';
  if not found then raise exception 'capital_project_brief_not_available' using errcode = 'P0002'; end if;

  return jsonb_build_object(
    'project', jsonb_build_object(
      'id', project_row.id, 'organization_id', project_row.organization_id,
      'project_name', project_row.project_name, 'entry_job', project_row.entry_job,
      'access_basis', project_row.access_basis, 'current_phase', project_row.current_phase
    ),
    'session', jsonb_build_object(
      'id', session_row.id, 'locale', session_row.locale,
      'company_profile', session_row.company_profile,
      'privacy_status', session_row.privacy_status,
      'representation_status', session_row.representation_status
    ),
    'brief', jsonb_build_object(
      'id', brief_row.id, 'kind', brief_row.brief_kind,
      'version', brief_row.brief_version, 'content', brief_row.content,
      'content_fingerprint', brief_row.content_fingerprint
    ),
    'plan', jsonb_build_object(
      'id', plan_row.id, 'version', plan_row.plan_version,
      'fingerprint', plan_row.plan_fingerprint,
      'compiler_version', plan_row.compiler_version,
      'registry_version', plan_row.registry_version
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task.task_id, 'ordinal', task.ordinal, 'batch', task.batch_no,
        'dependencies', task.dependencies, 'execution_class', task.execution_class,
        'effect', task.effect
      ) order by task.ordinal)
      from public.capital_project_plan_tasks task
      where task.organization_id = job_row.organization_id and task.plan_id = plan_row.id
    ), '[]'::jsonb),
    'revision', case
      when job_row.payload ? 'revision_of_artifact_id' then (
        select jsonb_build_object(
          'of_artifact_id', previous.id, 'prior_content', previous.content,
          'decision_id', decision.id, 'correction_note', decision.note
        )
        from public.capital_project_artifacts previous
        join public.capital_project_artifact_decisions decision
          on decision.organization_id = previous.organization_id and decision.artifact_id = previous.id
        where previous.organization_id = job_row.organization_id
          and previous.id::text = job_row.payload ->> 'revision_of_artifact_id'
          and previous.capital_project_id = project_row.id
          and decision.id::text = job_row.payload ->> 'correction_decision_id'
          and decision.decision = 'request_changes'
      )
      else null
    end,
    'dependency_artifacts', case
      when job_row.payload ? 'revision_of_artifact_id' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'task_id', dependency_task.task_id, 'id', artifact.id,
          'artifact_fingerprint', artifact.artifact_fingerprint,
          'content', artifact.content, 'evidence_refs', artifact.evidence_refs
        ) order by dependency_task.task_id)
        from public.capital_project_artifacts artifact
        join public.capital_project_task_runs dependency_run
          on dependency_run.organization_id = artifact.organization_id
          and dependency_run.id = artifact.task_run_id
          and dependency_run.status = 'succeeded'
        join public.capital_project_plan_tasks dependency_task
          on dependency_task.organization_id = dependency_run.organization_id
          and dependency_task.id = dependency_run.plan_task_id
        where artifact.organization_id = job_row.organization_id
          and artifact.capital_project_id = project_row.id
          and artifact.plan_id = plan_row.id
          and artifact.status not in ('stale', 'superseded')
          and dependency_task.task_id = any(revision_dependencies)
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  );
end;
$$;

comment on function public.start_public_company_debt_view_v1(uuid, text, text, text, text, jsonb, jsonb) is
  'Atomically starts a public-information company debt view. Public research remains external context and cannot create calculated capacity.';
comment on function public.request_company_debt_view_revision_v1(uuid, text, text) is
  'Records a correction against an exact company-debt diagnostic and queues only C11, reusing governed C09 and C10 dependencies.';
