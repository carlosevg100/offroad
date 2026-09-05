-- integration_preview runtime: two small additions the preview run needs.
--
-- 1. A stage event may carry its own summary. The generic stage names of the released DAGs map
--    to fixed sentences; a preview step names the method it ran and the state it reached, so the
--    timeline reads as work, not as mechanism. The detail keys summary_pt / summary_en, when
--    present, become the event summaries; everything else is unchanged.
-- 2. A conversational turn in preview may answer from the signed objects: the latest preview
--    artifacts of the project are readable by the brief job, only for a granted organization.

create or replace function private.worker_record_agent_stage_event_v1(
  p_job_id uuid,
  p_capability_token text,
  p_stage text,
  p_status text,
  p_detail jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  project_id uuid;
  active_agent_plan_id uuid;
  event_id uuid;
  event_kind text;
  action_pt text;
  action_en text;
  custom_pt text := nullif(trim(coalesce(p_detail ->> 'summary_pt', '')), '');
  custom_en text := nullif(trim(coalesce(p_detail ->> 'summary_en', '')), '');
begin
  if coalesce(trim(p_stage), '') = ''
    or p_status not in ('started', 'succeeded', 'failed', 'skipped')
    or coalesce(jsonb_typeof(p_detail), 'null') <> 'object' then
    raise exception 'agent_stage_event_invalid' using errcode = '22023';
  end if;
  if custom_pt is not null and char_length(custom_pt) > 400 then custom_pt := left(custom_pt, 400); end if;
  if custom_en is not null and char_length(custom_en) > 400 then custom_en := left(custom_en, 400); end if;

  select session.capital_project_id into project_id
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id;
  if project_id is null then
    raise exception 'agent_stage_project_not_available' using errcode = 'P0002';
  end if;

  select plan.id into active_agent_plan_id
  from public.capital_project_agent_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.capital_project_id = project_id
    and plan.status = 'active'
  order by plan.revision desc
  limit 1;
  if active_agent_plan_id is null then
    raise exception 'agent_stage_plan_not_available' using errcode = 'P0002';
  end if;

  select event.id into event_id
  from public.capital_project_agent_events event
  where event.organization_id = job_row.organization_id
    and event.capital_project_id = project_id
    and event.agent_plan_id = active_agent_plan_id
    and event.detail ->> 'job_id' = job_row.id::text
    and event.detail ->> 'stage' = trim(p_stage)
    and event.detail ->> 'status' = p_status
  limit 1;
  if event_id is not null then return event_id; end if;

  event_kind := case p_status
    when 'started' then 'work_started'
    when 'failed' then 'work_failed'
    else 'work_progress'
  end;

  action_pt := case
    when p_stage = 'public_research' then 'Pesquisando a companhia, o setor e o mercado de crédito'
    when p_stage = 'preliminary_understanding' then 'Consolidando o entendimento preliminar da companhia e da necessidade de capital'
    when p_stage = 'case_analysis' then 'Analisando as informações financeiras e a operação'
    when p_stage = 'extract' then 'Lendo e estruturando os documentos recebidos'
    when p_stage = 'company_debt_view' then 'Construindo a leitura de dívida e estrutura de capital'
    when p_stage = 'capital_planning' then 'Comparando alternativas de financiamento'
    when p_stage = 'origination_thesis' then 'Desenvolvendo a tese e o material para a reunião'
    when p_stage = 'agent_operation_brief' then 'Atualizando o entendimento do projeto'
    when p_stage like 'case:%' then 'Aprofundando a análise financeira do caso'
    when p_stage like 'integration_preview%' then 'Validação interna: executando o método sobre a evidência congelada'
    else 'Avançando a análise do projeto'
  end;
  action_en := case
    when p_stage = 'public_research' then 'Researching the company, sector, and credit market'
    when p_stage = 'preliminary_understanding' then 'Consolidating the preliminary understanding of the company and capital need'
    when p_stage = 'case_analysis' then 'Analyzing the financial information and transaction'
    when p_stage = 'extract' then 'Reading and structuring the received documents'
    when p_stage = 'company_debt_view' then 'Building the debt and capital structure view'
    when p_stage = 'capital_planning' then 'Comparing financing alternatives'
    when p_stage = 'origination_thesis' then 'Developing the thesis and meeting material'
    when p_stage = 'agent_operation_brief' then 'Updating the project understanding'
    when p_stage like 'case:%' then 'Deepening the financial analysis of the case'
    when p_stage like 'integration_preview%' then 'Internal validation: running the method on the frozen evidence'
    else 'Advancing the project analysis'
  end;

  event_id := gen_random_uuid();
  insert into public.capital_project_agent_events (
    id, organization_id, capital_project_id, agent_plan_id, event_type,
    summary_pt, summary_en, detail
  ) values (
    event_id, job_row.organization_id, project_id, active_agent_plan_id, event_kind,
    coalesce(custom_pt, action_pt) || case p_status
      when 'succeeded' then ' concluído.'
      when 'failed' then ' encontrou um erro.'
      when 'skipped' then ' não foi necessário nesta etapa.'
      else '...'
    end,
    coalesce(custom_en, action_en) || case p_status
      when 'succeeded' then ' completed.'
      when 'failed' then ' encountered an error.'
      when 'skipped' then ' was not required at this stage.'
      else '...'
    end,
    coalesce(p_detail, '{}'::jsonb) || jsonb_build_object(
      'job_id', job_row.id,
      'stage', trim(p_stage),
      'status', p_status
    )
  );
  return event_id;
end;
$$;

create or replace function private.worker_load_integration_preview_artifacts_v1(
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
  project_id uuid;
begin
  if job_row.kind <> 'agent_operation_brief' then
    raise exception 'agent_operation_brief_capability_required' using errcode = '42501';
  end if;
  if not private.integration_preview_enabled(job_row.organization_id) then
    raise exception 'integration_preview_not_granted' using errcode = '42501';
  end if;
  select session.capital_project_id into project_id
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id;
  if project_id is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'task_id', latest.task_id, 'id', latest.id, 'artifact_type', latest.artifact_type,
      'artifact_fingerprint', latest.artifact_fingerprint, 'content', latest.content
    ) order by latest.task_id)
    from (
      select distinct on (plan_task.task_id)
        plan_task.task_id, artifact.id, artifact.artifact_type, artifact.artifact_fingerprint, artifact.content
      from public.capital_project_artifacts artifact
      join public.capital_project_task_runs run
        on run.organization_id = artifact.organization_id and run.id = artifact.task_run_id and run.status = 'succeeded'
      join public.capital_project_plan_tasks plan_task
        on plan_task.organization_id = run.organization_id and plan_task.id = run.plan_task_id
      join public.capital_project_plans plan
        on plan.organization_id = plan_task.organization_id and plan.id = plan_task.plan_id and plan.status = 'active'
      where artifact.organization_id = job_row.organization_id
        and artifact.capital_project_id = project_id
        and artifact.artifact_type like 'preview\_%'
        and artifact.status not in ('stale', 'superseded')
      order by plan_task.task_id, artifact.created_at desc, artifact.id desc
    ) latest
  ), '[]'::jsonb);
end;
$$;

create or replace function public.worker_load_integration_preview_artifacts_v1(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_integration_preview_artifacts_v1(p_job_id, p_capability_token);
$$;

revoke all on function private.worker_load_integration_preview_artifacts_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.worker_load_integration_preview_artifacts_v1(uuid, text) from public, anon;
grant execute on function private.worker_load_integration_preview_artifacts_v1(uuid, text) to authenticated;
grant execute on function public.worker_load_integration_preview_artifacts_v1(uuid, text) to authenticated;

comment on function public.worker_load_integration_preview_artifacts_v1(uuid, text) is
  'The latest preview artifacts of the project of a conversational job, for a granted organization only; lets a turn answer from the signed objects.';
