-- integration_preview: prior artifacts are read across the project's preview plans.
--
-- Each preview turn compiles its own plan (the plan snapshot now carries the turn), so a plan
-- that already holds task runs is never reactivated: reactivating one made the task-run start
-- replay a succeeded run while the artifact record required a running one
-- (capital_task_run_not_available on the first step of a premise change). With one plan per
-- turn, replay lives where it belongs: the worker compares input fingerprints against the latest
-- succeeded artifact of each task in any preview plan of the project, and replays the object
-- instead of running the method again. Only the prior_artifacts scope of the v6 loader changes;
-- signature, grants and the public wrapper stay as they are.

create or replace function private.worker_load_capital_project_context_v6(
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
  message_actor uuid;
begin
  if job_row.kind <> 'capital_project_analysis' then
    raise exception 'capital_project_analysis_capability_required' using errcode = '42501';
  end if;
  if job_row.payload ->> 'analysis_scope' <> 'integration_preview' then
    return private.worker_load_capital_project_context_v5(p_job_id, p_capability_token);
  end if;
  if not private.integration_preview_enabled(job_row.organization_id) then
    raise exception 'integration_preview_not_granted' using errcode = '42501';
  end if;

  select project.* into project_row
  from public.capital_projects project
  where project.organization_id = job_row.organization_id
    and project.id::text = job_row.payload ->> 'capital_project_id'
    and project.status <> 'archived';
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
    and brief.brief_kind = 'integration_preview';
  if not found then raise exception 'capital_project_brief_not_available' using errcode = 'P0002'; end if;

  select run.created_by into message_actor
  from public.processing_runs run
  where run.organization_id = job_row.organization_id
    and run.id = job_row.processing_run_id;

  return jsonb_build_object(
    'mode', 'integration_preview',
    'preview', coalesce(job_row.payload -> 'preview', '{}'::jsonb),
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
      'registry_version', plan_row.registry_version,
      'snapshot', plan_row.snapshot
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task.task_id, 'ordinal', task.ordinal, 'batch', task.batch_no, 'label', task.label,
        'dependencies', task.dependencies, 'execution_class', task.execution_class,
        'effect', task.effect, 'maturity_at_compile', task.maturity_at_compile
      ) order by task.ordinal)
      from public.capital_project_plan_tasks task
      where task.organization_id = job_row.organization_id and task.plan_id = plan_row.id
    ), '[]'::jsonb),
    -- The latest succeeded artifact of every task across the project's preview plans: what a
    -- later turn may replay unchanged, and what the material compilers cite by fingerprint.
    'prior_artifacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'task_id', latest.task_id, 'id', latest.id, 'artifact_type', latest.artifact_type,
        'artifact_version', latest.artifact_version, 'artifact_fingerprint', latest.artifact_fingerprint,
        'input_fingerprint', latest.input_fingerprint, 'status', latest.status,
        'content', latest.content, 'created_at', latest.created_at
      ) order by latest.task_id)
      from (
        select distinct on (plan_task.task_id)
          plan_task.task_id, artifact.id, artifact.artifact_type, artifact.artifact_version,
          artifact.artifact_fingerprint, artifact.input_fingerprint, artifact.status,
          artifact.content, artifact.created_at
        from public.capital_project_artifacts artifact
        join public.capital_project_task_runs run
          on run.organization_id = artifact.organization_id and run.id = artifact.task_run_id
          and run.status = 'succeeded'
        join public.capital_project_plan_tasks plan_task
          on plan_task.organization_id = run.organization_id and plan_task.id = run.plan_task_id
        -- Every preview plan of the project, not only the active one: each turn compiles its own
        -- plan, and a step whose input fingerprint did not change replays the artifact of an
        -- earlier plan instead of running again. Plans of other compilers (the production
        -- origination compiler, for one) never feed a preview replay.
        join public.capital_project_plans artifact_plan
          on artifact_plan.organization_id = artifact.organization_id and artifact_plan.id = artifact.plan_id
          and artifact_plan.capital_project_id = project_row.id
          and artifact_plan.compiler_version = plan_row.compiler_version
        where artifact.organization_id = job_row.organization_id
          and artifact.capital_project_id = project_row.id
          and artifact.status not in ('stale', 'superseded')
        order by plan_task.task_id, artifact.created_at desc, artifact.id desc
      ) latest
    ), '[]'::jsonb),
    'professional_context', (
      select jsonb_build_object(
        'useForms', to_jsonb(profile.use_forms),
        'professionalRoles', to_jsonb(profile.professional_roles),
        'practiceAreas', to_jsonb(profile.practice_areas),
        'primaryObjectives', to_jsonb(profile.primary_objectives),
        'institutionName', profile.institution_name,
        'disclosureStatus', profile.disclosure_status,
        'lastConfirmedAt', profile.last_confirmed_at
      )
      from public.professional_context_profiles profile
      where profile.organization_id = job_row.organization_id
        and profile.user_id = message_actor
    ),
    'recent_messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id, 'role', recent.role, 'content', recent.content, 'created_at', recent.created_at
      ) order by recent.created_at)
      from (
        select message.id, message.role, message.content, message.created_at
        from public.agent_messages message
        join public.agent_conversations conversation
          on conversation.organization_id = message.organization_id and conversation.id = message.conversation_id
        where message.organization_id = job_row.organization_id
          and conversation.intake_session_id = session_row.id
          and message.status = 'completed'
        order by message.created_at desc
        limit 12
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

