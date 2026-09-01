-- First task-specific capital-project vertical: public-information origination thesis.
-- The user supplies only public company identity and a bounded meeting brief. The database
-- persists that brief as project memory, freezes the exact TaskSpec plan and queues one
-- capability-bound worker job. No private-information or distribution authority is implied.

create table public.capital_project_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  request_id uuid not null,
  brief_kind text not null check (brief_kind in ('origination_thesis')),
  brief_version integer not null check (brief_version > 0),
  status text not null default 'active' check (status in ('active', 'superseded', 'invalidated')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  content_fingerprint text not null check (content_fingerprint ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, request_id),
  unique (organization_id, capital_project_id, brief_kind, brief_version),
  unique (organization_id, capital_project_id, content_fingerprint),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade
);

create unique index capital_project_briefs_one_active_idx
  on public.capital_project_briefs (organization_id, capital_project_id, brief_kind)
  where status = 'active';
create index capital_project_briefs_project_created_idx
  on public.capital_project_briefs (organization_id, capital_project_id, created_at desc);
create index capital_project_briefs_created_by_idx
  on public.capital_project_briefs (created_by);

alter table public.capital_project_briefs enable row level security;
alter table public.capital_project_briefs force row level security;

create policy capital_project_briefs_select
  on public.capital_project_briefs for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));

revoke all privileges on public.capital_project_briefs from public, anon, authenticated;
grant select on public.capital_project_briefs to authenticated;

create trigger capital_project_briefs_set_updated_at
  before update on public.capital_project_briefs
  for each row execute function private.set_updated_at();
create trigger capital_project_briefs_audit
  after insert or update or delete on public.capital_project_briefs
  for each row execute function private.capture_audit_event();

alter table public.processing_jobs drop constraint processing_jobs_kind_check;
alter table public.processing_jobs add constraint processing_jobs_kind_check
  check (kind in (
    'document_pipeline', 'preliminary_analysis', 'case_analysis',
    'agent_operation_brief', 'capital_project_analysis'
  ));

create or replace function private.start_public_origination_thesis_v1(
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
  meeting_context text := trim(coalesce(p_brief ->> 'meetingContext', ''));
  thesis_to_test text := nullif(trim(coalesce(p_brief ->> 'thesisToTest', '')), '');
  audience text := nullif(trim(coalesce(p_brief ->> 'audience', '')), '');
  meeting_date text := nullif(trim(coalesce(p_brief ->> 'meetingDate', '')), '');
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select brief.* into existing_brief
  from public.capital_project_briefs brief
  join public.organization_memberships membership
    on membership.organization_id = brief.organization_id
  where brief.request_id = p_request_id
    and membership.user_id = caller_id
    and membership.status = 'active';
  if found then
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
$$;

create or replace function public.start_public_origination_thesis_v1(
  p_request_id uuid,
  p_locale text,
  p_project_name text,
  p_company_name text,
  p_company_website text,
  p_brief jsonb,
  p_plan jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.start_public_origination_thesis_v1(
    p_request_id, p_locale, p_project_name, p_company_name, p_company_website,
    p_brief, p_plan
  );
$$;

revoke all on function private.start_public_origination_thesis_v1(uuid, text, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.start_public_origination_thesis_v1(uuid, text, text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function private.start_public_origination_thesis_v1(uuid, text, text, text, text, jsonb, jsonb)
  to authenticated;
grant execute on function public.start_public_origination_thesis_v1(uuid, text, text, text, text, jsonb, jsonb)
  to authenticated;

-- A correction is an incremental event, not a fresh end-to-end run. Preserve the public
-- research and deterministic task outputs, invalidate only M07, and queue one bounded synthesis
-- against the exact prior artifact, decision and dependency artifacts.
create or replace function private.request_origination_thesis_revision_v1(
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
    raise exception 'origination_revision_invalid' using errcode = '22023';
  end if;

  select decision.* into existing_decision
  from public.capital_project_artifact_decisions decision
  join public.organization_memberships membership
    on membership.organization_id = decision.organization_id
  where decision.artifact_id = p_artifact_id
    and decision.artifact_fingerprint = p_artifact_fingerprint
    and decision.decision = 'request_changes'
    and decision.note = normalized_note
    and membership.user_id = caller_id
    and membership.status = 'active';
  if found then
    select job.id into v_job_id
    from public.processing_jobs job
    where job.organization_id = existing_decision.organization_id
      and job.kind = 'capital_project_analysis'
      and job.payload ->> 'correction_decision_id' = existing_decision.id::text
    order by job.created_at desc limit 1;
    return jsonb_build_object(
      'decision_id', existing_decision.id,
      'job_id', v_job_id,
      'replayed', true
    );
  end if;

  select artifact.* into artifact_row
  from public.capital_project_artifacts artifact
  join public.capital_projects project
    on project.organization_id = artifact.organization_id
    and project.id = artifact.capital_project_id
  join public.organization_memberships membership
    on membership.organization_id = artifact.organization_id
  where artifact.id = p_artifact_id
    and artifact.artifact_fingerprint = p_artifact_fingerprint
    and artifact.artifact_type = 'meeting_brief'
    and artifact.status = 'pending_confirmation'
    and project.entry_job = 'origination_thesis'
    and project.access_basis = 'public_information'
    and membership.user_id = caller_id
    and membership.status = 'active'
  for update of artifact;
  if not found then
    raise exception 'origination_revision_artifact_not_available' using errcode = 'P0002';
  end if;

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
  if not found then
    raise exception 'origination_revision_task_not_invalidateable' using errcode = '55000';
  end if;

  select coalesce(max(run.run_no), 0) + 1 into next_run_no
  from public.processing_runs run
  where run.organization_id = artifact_row.organization_id
    and run.intake_session_id = v_session_id;

  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status,
    pipeline_version, budget, versions, created_by
  ) values (
    v_run_id, artifact_row.organization_id, v_session_id, next_run_no, 'manual', 'queued',
    'origination-thesis-revision-2026.09.01-v1',
    jsonb_build_object('maxCalls', 1, 'maxCostUsd', 0.70, 'externalSearchMaxUsd', 0),
    jsonb_build_object(
      'planId', v_plan_id,
      'revisionOfArtifactId', artifact_row.id,
      'correctionDecisionId', v_decision_id,
      'executor', 'origination-thesis-2026.09.01-v1'
    ),
    caller_id
  );

  insert into public.processing_jobs (
    id, organization_id, processing_run_id, intake_session_id, kind, payload, max_attempts
  ) values (
    v_job_id, artifact_row.organization_id, v_run_id, v_session_id,
    'capital_project_analysis', jsonb_build_object(
      'analysis_scope', 'origination_thesis',
      'locale', (select locale from public.document_intake_sessions where id = v_session_id),
      'capital_project_id', artifact_row.capital_project_id,
      'capital_project_plan_id', v_plan_id,
      'capital_project_brief_id', (
        select brief.id from public.capital_project_briefs brief
        where brief.organization_id = artifact_row.organization_id
          and brief.capital_project_id = artifact_row.capital_project_id
          and brief.status = 'active'
      ),
      'capital_task_ids', jsonb_build_array('M07'),
      'capital_artifact_required', true,
      'revision_of_artifact_id', artifact_row.id,
      'correction_decision_id', v_decision_id,
      'trigger_event', jsonb_build_object(
        'type', 'artifact_correction_requested',
        'artifactId', artifact_row.id,
        'decisionId', v_decision_id
      ),
      'model_budget', jsonb_build_object('max_cost_usd', 0.70, 'max_calls', 1)
    ), 2
  );

  update public.document_intake_sessions session
  set current_run_id = v_run_id,
      status = 'processing',
      processing_started_at = now(),
      processing_completed_at = null,
      pipeline_version = 'origination-thesis-revision-2026.09.01-v1',
      updated_at = now()
  where session.organization_id = artifact_row.organization_id
    and session.id = v_session_id;

  return jsonb_build_object(
    'decision_id', v_decision_id,
    'job_id', v_job_id,
    'replayed', false
  );
end;
$$;

create or replace function public.request_origination_thesis_revision_v1(
  p_artifact_id uuid,
  p_artifact_fingerprint text,
  p_note text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.request_origination_thesis_revision_v1(
    p_artifact_id, p_artifact_fingerprint, p_note
  );
$$;

revoke all on function private.request_origination_thesis_revision_v1(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.request_origination_thesis_revision_v1(uuid, text, text)
  from public, anon;
grant execute on function private.request_origination_thesis_revision_v1(uuid, text, text)
  to authenticated;
grant execute on function public.request_origination_thesis_revision_v1(uuid, text, text)
  to authenticated;

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
begin
  if job_row.kind <> 'capital_project_analysis'
    or job_row.payload ->> 'analysis_scope' <> 'origination_thesis' then
    raise exception 'capital_project_analysis_capability_required' using errcode = '42501';
  end if;

  select project.* into project_row
  from public.capital_projects project
  where project.organization_id = job_row.organization_id
    and project.id::text = job_row.payload ->> 'capital_project_id'
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
    and brief.status = 'active';
  if not found then raise exception 'capital_project_brief_not_available' using errcode = 'P0002'; end if;

  return jsonb_build_object(
    'project', jsonb_build_object(
      'id', project_row.id,
      'organization_id', project_row.organization_id,
      'project_name', project_row.project_name,
      'entry_job', project_row.entry_job,
      'access_basis', project_row.access_basis,
      'current_phase', project_row.current_phase
    ),
    'session', jsonb_build_object(
      'id', session_row.id,
      'locale', session_row.locale,
      'company_profile', session_row.company_profile,
      'privacy_status', session_row.privacy_status,
      'representation_status', session_row.representation_status
    ),
    'brief', jsonb_build_object(
      'id', brief_row.id,
      'kind', brief_row.brief_kind,
      'version', brief_row.brief_version,
      'content', brief_row.content,
      'content_fingerprint', brief_row.content_fingerprint
    ),
    'plan', jsonb_build_object(
      'id', plan_row.id,
      'version', plan_row.plan_version,
      'fingerprint', plan_row.plan_fingerprint,
      'compiler_version', plan_row.compiler_version,
      'registry_version', plan_row.registry_version
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task.task_id,
        'ordinal', task.ordinal,
        'batch', task.batch_no,
        'dependencies', task.dependencies,
        'execution_class', task.execution_class,
        'effect', task.effect
      ) order by task.ordinal)
      from public.capital_project_plan_tasks task
      where task.organization_id = job_row.organization_id
        and task.plan_id = plan_row.id
    ), '[]'::jsonb),
    'revision', case
      when job_row.payload ? 'revision_of_artifact_id' then (
        select jsonb_build_object(
          'of_artifact_id', previous.id,
          'prior_content', previous.content,
          'decision_id', decision.id,
          'correction_note', decision.note
        )
        from public.capital_project_artifacts previous
        join public.capital_project_artifact_decisions decision
          on decision.organization_id = previous.organization_id
          and decision.artifact_id = previous.id
        where previous.organization_id = job_row.organization_id
          and previous.id::text = job_row.payload ->> 'revision_of_artifact_id'
          and decision.id::text = job_row.payload ->> 'correction_decision_id'
          and decision.decision = 'request_changes'
      )
      else null
    end,
    'dependency_artifacts', case
      when job_row.payload ? 'revision_of_artifact_id' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'task_id', dependency_task.task_id,
          'id', artifact.id,
          'artifact_fingerprint', artifact.artifact_fingerprint,
          'content', artifact.content,
          'evidence_refs', artifact.evidence_refs
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
          and dependency_task.task_id = any(array['M06','C02','K04']::text[])
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  );
end;
$$;

create or replace function public.worker_load_capital_project_context(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_capital_project_context(p_job_id, p_capability_token);
$$;

revoke all on function private.worker_load_capital_project_context(uuid, text)
  from public, anon, authenticated;
revoke all on function public.worker_load_capital_project_context(uuid, text)
  from public, anon;
grant execute on function private.worker_load_capital_project_context(uuid, text)
  to authenticated;
grant execute on function public.worker_load_capital_project_context(uuid, text)
  to authenticated;

-- Preserve the established research ledger while allowing the narrow preliminary and
-- capital-project research jobs to write through the same capability-bound command.
create or replace function private.worker_record_public_research(
  p_job_id uuid,
  p_capability_token text,
  p_plan jsonb,
  p_result jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  research_id uuid;
  source_record jsonb;
  query_record jsonb;
  query_text text;
  result_status text := p_result ->> 'status';
begin
  if job_row.kind not in ('case_analysis', 'preliminary_analysis', 'capital_project_analysis') then
    raise exception 'research_capability_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_plan) <> 'array'
    or jsonb_array_length(p_plan) not between 1 and 12
    or jsonb_typeof(p_result) <> 'object'
    or result_status not in ('succeeded', 'partial', 'abstained')
    or jsonb_typeof(coalesce(p_result -> 'sources', 'null'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_result -> 'failures', 'null'::jsonb)) <> 'array' then
    raise exception 'invalid_public_research_contract' using errcode = '22023';
  end if;

  for query_record in select value from jsonb_array_elements(p_plan) loop
    query_text := trim(coalesce(query_record ->> 'query', ''));
    if char_length(query_text) not between 3 and 400
      or query_text ~* '[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
      or query_text ~* '(R[$]|US[$]|BRL|USD)[[:space:]]*[0-9]'
      or query_text ~ '[0-9]{11,14}' then
      raise exception 'unsafe_public_research_query' using errcode = '22023';
    end if;
  end loop;

  insert into public.public_research_runs (
    organization_id, intake_session_id, processing_run_id, status, query_fingerprint,
    provider_chain, plan, failures, created_by
  ) values (
    job_row.organization_id,
    job_row.intake_session_id,
    job_row.processing_run_id,
    result_status,
    encode(extensions.digest(convert_to(p_plan::text, 'utf8'), 'sha256'), 'hex'),
    coalesce(p_result -> 'providerChain', '[]'::jsonb),
    p_plan,
    p_result -> 'failures',
    (select auth.uid())
  ) returning id into research_id;

  for source_record in select value from jsonb_array_elements(p_result -> 'sources') loop
    if source_record ->> 'topic' not in ('identity', 'news', 'sector', 'regulation', 'market')
      or source_record ->> 'provider' not in ('perplexity', 'openai', 'official', 'mcp')
      or coalesce(source_record ->> 'url', '') !~ '^https://'
      or coalesce(source_record ->> 'contentHash', '') !~ '^[0-9a-f]{64}$'
      or char_length(trim(coalesce(source_record ->> 'title', ''))) not between 1 and 500
      or char_length(coalesce(source_record ->> 'snippet', '')) > 8000 then
      raise exception 'invalid_public_research_source' using errcode = '22023';
    end if;
    insert into public.public_research_sources (
      organization_id, intake_session_id, research_run_id, topic, provider, title, url,
      snippet, published_at, retrieved_at, content_hash
    ) values (
      job_row.organization_id,
      job_row.intake_session_id,
      research_id,
      source_record ->> 'topic',
      source_record ->> 'provider',
      trim(source_record ->> 'title'),
      source_record ->> 'url',
      coalesce(source_record ->> 'snippet', ''),
      source_record ->> 'publishedAt',
      (source_record ->> 'retrievedAt')::timestamptz,
      source_record ->> 'contentHash'
    ) on conflict (organization_id, research_run_id, topic, url) do nothing;
  end loop;

  return research_id;
end;
$$;

comment on table public.capital_project_briefs is
  'Versioned user-authored project context. It is project memory, not Company Truth or an output artifact.';
comment on function public.start_public_origination_thesis_v1(uuid, text, text, text, text, jsonb, jsonb) is
  'Atomically starts a public-information origination thesis with an exact TaskSpec plan and bounded worker job. It grants neither representation nor distribution authority.';
comment on function public.request_origination_thesis_revision_v1(uuid, text, text) is
  'Records a correction against an exact meeting-brief fingerprint and queues only the invalidated M07 synthesis, reusing governed research dependencies.';
