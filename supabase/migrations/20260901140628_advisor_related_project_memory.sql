-- Give the advisor the minimum same-organization history that is already relevant to the company
-- named in the current request. This is project memory, not a global discovery surface: the
-- capability fixes the organization, the current project is excluded, and no cross-tenant or
-- public-corpus data is introduced here.

create or replace function private.worker_load_agent_context(
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
  session_row public.document_intake_sessions;
  project_row public.capital_projects;
  message_row public.agent_messages;
  manifest_id uuid;
begin
  if job_row.kind <> 'agent_operation_brief' then
    raise exception 'agent_operation_brief_capability_required' using errcode = '42501';
  end if;
  select * into session_row from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id and session.id = job_row.intake_session_id;
  if session_row.capital_project_id is not null then
    select * into project_row from public.capital_projects project
    where project.organization_id = job_row.organization_id
      and project.id = session_row.capital_project_id;
  end if;
  select * into message_row from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = (job_row.payload ->> 'message_id')::uuid
    and message.role = 'user'
  for update;
  if not found then raise exception 'agent_source_message_not_found' using errcode = 'P0002'; end if;

  update public.agent_messages set status = 'processing'
  where organization_id = job_row.organization_id and id = message_row.id and status = 'queued';
  begin
    manifest_id := nullif(session_row.result_summary #>> '{case_manifest,id}', '')::uuid;
  exception when invalid_text_representation then manifest_id := null;
  end;

  return jsonb_build_object(
    'session_id', session_row.id,
    'message_id', message_row.id,
    'locale', message_row.locale,
    'message', message_row.content,
    'brief', private.agent_operation_brief_snapshot(session_row),
    'snapshot_fingerprint', private.agent_snapshot_fingerprint(session_row),
    'projection_updated_at', session_row.updated_at,
    'manifest_id', manifest_id,
    'project', case when project_row.id is null then null else jsonb_build_object(
      'id', project_row.id,
      'name', project_row.project_name,
      'entryJob', project_row.entry_job,
      'accessBasis', project_row.access_basis,
      'phase', project_row.current_phase,
      'status', project_row.status
    ) end,
    'company_profile', coalesce(session_row.company_profile, '{}'::jsonb),
    'related_project_memory', coalesce((
      select jsonb_agg(memory.item order by memory.updated_at desc)
      from (
        select
          jsonb_build_object(
            'projectId', prior.id,
            'projectName', prior.project_name,
            'companyName', identity.company_name,
            'entryJob', prior.entry_job,
            'currentPhase', prior.current_phase,
            'status', prior.status,
            'updatedAt', prior.updated_at,
            'brief', case when active_brief.id is null then null else jsonb_build_object(
              'kind', active_brief.brief_kind,
              'content', active_brief.content
            ) end,
            'artifactTypes', coalesce(artifacts.types, '[]'::jsonb)
          ) as item,
          prior.updated_at
        from public.capital_projects prior
        left join public.companies company
          on company.organization_id = prior.organization_id
          and company.id = prior.company_id
        left join lateral (
          select prior_session.company_profile
          from public.document_intake_sessions prior_session
          where prior_session.organization_id = prior.organization_id
            and prior_session.capital_project_id = prior.id
          order by prior_session.updated_at desc
          limit 1
        ) prior_session on true
        cross join lateral (
          select nullif(trim(coalesce(
            company.display_name,
            company.legal_name,
            prior_session.company_profile ->> 'name'
          )), '') as company_name
        ) identity
        left join lateral (
          select brief.id, brief.brief_kind, brief.content
          from public.capital_project_briefs brief
          where brief.organization_id = prior.organization_id
            and brief.capital_project_id = prior.id
            and brief.status = 'active'
          order by brief.created_at desc
          limit 1
        ) active_brief on true
        left join lateral (
          select jsonb_agg(distinct artifact.artifact_type) as types
          from public.capital_project_artifacts artifact
          where artifact.organization_id = prior.organization_id
            and artifact.capital_project_id = prior.id
            and artifact.status <> 'superseded'
        ) artifacts on true
        where prior.organization_id = job_row.organization_id
          and prior.id is distinct from project_row.id
          and identity.company_name is not null
          and (
            position(lower(identity.company_name) in lower(message_row.content)) > 0
            or (
              char_length(split_part(identity.company_name, ' ', 1)) >= 4
              and lower(split_part(identity.company_name, ' ', 1)) not in (
                'banco', 'bank', 'companhia', 'company', 'grupo', 'group', 'holding',
                'indústria', 'industria', 'serviços', 'servicos', 'comercial'
              )
              and position(lower(split_part(identity.company_name, ' ', 1)) in lower(message_row.content)) > 0
            )
          )
        order by prior.updated_at desc
        limit 8
      ) memory
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', document.id,
        'name', document.original_name,
        'kind', profile.document_kind,
        'status', document.processing_status
      ) order by document.created_at)
      from public.source_documents document
      left join lateral (
        select document_profile.document_kind
        from public.document_profiles document_profile
        where document_profile.organization_id = document.organization_id
          and document_profile.source_document_id = document.id
        order by document_profile.document_version desc
        limit 1
      ) profile on true
      where document.organization_id = job_row.organization_id
        and document.intake_session_id = session_row.id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'taskId', task.task_id,
        'label', task.label,
        'ordinal', task.ordinal,
        'status', coalesce(run.status, 'waiting')
      ) order by task.ordinal)
      from public.capital_project_plans plan
      join public.capital_project_plan_tasks task
        on task.organization_id = plan.organization_id and task.plan_id = plan.id
      left join lateral (
        select task_run.status
        from public.capital_project_task_runs task_run
        where task_run.organization_id = task.organization_id
          and task_run.plan_id = task.plan_id
          and task_run.plan_task_id = task.id
        order by task_run.attempt_no desc limit 1
      ) run on true
      where plan.organization_id = job_row.organization_id
        and plan.capital_project_id = session_row.capital_project_id
        and plan.status = 'active'
    ), '[]'::jsonb),
    'artifacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', artifact.id,
        'type', artifact.artifact_type,
        'version', artifact.artifact_version,
        'status', artifact.status
      ) order by artifact.created_at desc)
      from public.capital_project_artifacts artifact
      where artifact.organization_id = job_row.organization_id
        and artifact.capital_project_id = session_row.capital_project_id
    ), '[]'::jsonb),
    'recent_messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'role', recent.role,
        'content', recent.content,
        'created_at', recent.created_at
      ) order by recent.created_at)
      from (
        select message.id, message.role, message.content, message.created_at
        from public.agent_messages message
        where message.organization_id = job_row.organization_id
          and message.conversation_id = message_row.conversation_id
          and message.id <> message_row.id
          and message.status = 'completed'
        order by message.created_at desc limit 12
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.worker_load_agent_context(uuid, text) is
  'Loads one capability-scoped advisor turn with current project state and only same-organization prior projects whose company name appears in the current request.';
