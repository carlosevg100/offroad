-- Project real worker execution into the user-visible DCM work timeline.
-- The immutable TaskSpec remains the execution boundary; this layer only mirrors verified
-- task-run transitions and stage progress inside the same tenant and project.

create or replace function private.project_capital_task_run_to_agent_work()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_row public.capital_project_plan_tasks;
  agent_plan public.capital_project_agent_plans;
  work_row public.capital_project_agent_work_items;
  projected_status text;
  projected_event text;
  summary_pt text;
  summary_en text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select task.* into task_row
  from public.capital_project_plan_tasks task
  where task.organization_id = new.organization_id
    and task.id = new.plan_task_id;
  if not found then return new; end if;

  select plan.* into agent_plan
  from public.capital_project_agent_plans plan
  where plan.organization_id = new.organization_id
    and plan.capital_project_id = new.capital_project_id
    and plan.base_plan_id = new.plan_id
    and plan.status = 'active'
  order by plan.revision desc
  limit 1;
  if not found then return new; end if;

  select work.* into work_row
  from public.capital_project_agent_work_items work
  where work.organization_id = new.organization_id
    and work.agent_plan_id = agent_plan.id
    and work.task_spec_id = task_row.task_id
  limit 1
  for update;
  if not found then return new; end if;

  projected_status := case new.status
    when 'queued' then 'ready'
    when 'running' then 'running'
    when 'waiting_user' then 'waiting_user'
    when 'blocked' then 'blocked'
    when 'succeeded' then 'succeeded'
    when 'failed' then 'failed'
    when 'cancelled' then 'superseded'
    else work_row.status
  end;

  update public.capital_project_agent_work_items work
  set status = projected_status,
      started_at = case
        when projected_status = 'running' then coalesce(work.started_at, new.started_at, now())
        else work.started_at
      end,
      completed_at = case
        when projected_status in ('succeeded', 'failed', 'superseded') then coalesce(new.completed_at, now())
        else null
      end,
      output_refs = case
        when projected_status = 'succeeded' and new.output_reference is not null
          then jsonb_build_array(new.output_reference)
        else work.output_refs
      end
  where work.organization_id = new.organization_id
    and work.id = work_row.id;

  projected_event := case projected_status
    when 'running' then 'work_started'
    when 'waiting_user' then 'work_waiting_user'
    when 'succeeded' then 'work_completed'
    when 'failed' then 'work_failed'
    when 'blocked' then 'quality_gate_failed'
    else null
  end;
  if projected_event is null then return new; end if;

  summary_pt := case projected_status
    when 'running' then 'Iniciando: ' || work_row.title
    when 'waiting_user' then 'Aguardando uma informação para continuar: ' || work_row.title
    when 'succeeded' then 'Concluído: ' || work_row.title
    when 'failed' then 'Não foi possível concluir: ' || work_row.title
    when 'blocked' then 'A verificação encontrou um ponto que precisa ser resolvido: ' || work_row.title
  end;
  summary_en := case projected_status
    when 'running' then 'Starting: ' || work_row.title
    when 'waiting_user' then 'Waiting for information to continue: ' || work_row.title
    when 'succeeded' then 'Completed: ' || work_row.title
    when 'failed' then 'Could not complete: ' || work_row.title
    when 'blocked' then 'The verification found an issue that must be resolved: ' || work_row.title
  end;

  insert into public.capital_project_agent_events (
    organization_id, capital_project_id, agent_plan_id, work_item_id,
    event_type, summary_pt, summary_en, detail, evidence
  ) values (
    new.organization_id, new.capital_project_id, agent_plan.id, work_row.id,
    projected_event, summary_pt, summary_en,
    jsonb_build_object(
      'task_spec_id', task_row.task_id,
      'task_run_id', new.id,
      'status', new.status,
      'attempt_no', new.attempt_no
    ),
    case
      when new.output_reference is null then '[]'::jsonb
      else jsonb_build_array(new.output_reference)
    end
  );
  return new;
end;
$$;

revoke all on function private.project_capital_task_run_to_agent_work()
  from public, anon, authenticated;

drop trigger if exists capital_project_task_runs_agent_work_projection
  on public.capital_project_task_runs;
create trigger capital_project_task_runs_agent_work_projection
  after insert or update of status on public.capital_project_task_runs
  for each row execute function private.project_capital_task_run_to_agent_work();

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
begin
  if coalesce(trim(p_stage), '') = ''
    or p_status not in ('started', 'succeeded', 'failed', 'skipped')
    or coalesce(jsonb_typeof(p_detail), 'null') <> 'object' then
    raise exception 'agent_stage_event_invalid' using errcode = '22023';
  end if;

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
    else 'Advancing the project analysis'
  end;

  event_id := gen_random_uuid();
  insert into public.capital_project_agent_events (
    id, organization_id, capital_project_id, agent_plan_id, event_type,
    summary_pt, summary_en, detail
  ) values (
    event_id, job_row.organization_id, project_id, active_agent_plan_id, event_kind,
    action_pt || case p_status
      when 'succeeded' then ' concluído.'
      when 'failed' then ' encontrou um erro.'
      when 'skipped' then ' não foi necessário nesta etapa.'
      else '...'
    end,
    action_en || case p_status
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

create or replace function public.worker_record_agent_stage_event_v1(
  p_job_id uuid,
  p_capability_token text,
  p_stage text,
  p_status text,
  p_detail jsonb default '{}'::jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_agent_stage_event_v1(
    p_job_id, p_capability_token, p_stage, p_status, p_detail
  );
$$;

revoke all on function private.worker_record_agent_stage_event_v1(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.worker_record_agent_stage_event_v1(uuid, text, text, text, jsonb)
  from public, anon;
grant execute on function private.worker_record_agent_stage_event_v1(uuid, text, text, text, jsonb)
  to authenticated;
grant execute on function public.worker_record_agent_stage_event_v1(uuid, text, text, text, jsonb)
  to authenticated;

comment on function public.worker_record_agent_stage_event_v1(uuid, text, text, text, jsonb) is
  'Records a capability-bound, bilingual, customer-facing stage event without exposing internal task names.';
