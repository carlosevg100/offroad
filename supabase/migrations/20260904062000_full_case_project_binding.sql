-- Full-case analysis persists its coverage, information requests and decisions against the
-- durable capital project. Keep that project reference inside the same capability-scoped input
-- boundary as the rest of the session instead of making the worker rediscover it later.

create or replace function private.worker_load_case_project_binding(
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
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;

  select session.capital_project_id
  into project_id
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id;

  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;
  if project_id is null then
    raise exception 'case_project_binding_required' using errcode = '55000';
  end if;

  return jsonb_build_object('capital_project_id', project_id);
end;
$$;

revoke all on function private.worker_load_case_project_binding(uuid, text)
  from public, anon;
grant execute on function private.worker_load_case_project_binding(uuid, text)
  to authenticated;

create or replace function public.worker_load_case_input(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  with base as (
    select private.worker_load_case_input(p_job_id, p_capability_token) as input
  )
  select base.input
    || jsonb_build_object(
      'session',
      (base.input -> 'session') || private.worker_load_case_project_binding(p_job_id, p_capability_token)
    )
    || jsonb_build_object('pricing_context', private.worker_load_pricing_context(p_job_id, p_capability_token))
    || jsonb_build_object('market_distribution_context', private.worker_load_market_distribution_context(p_job_id, p_capability_token))
    || jsonb_build_object('red_flag_context', private.worker_load_red_flag_context(p_job_id, p_capability_token))
    || jsonb_build_object('conduct_context', private.worker_load_conduct_context(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_evidence', private.worker_load_receivables_evidence(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_provider_context', private.worker_load_receivables_provider_context(p_job_id, p_capability_token))
    || jsonb_build_object('deal_workflow', private.worker_load_deal_workflow_state(p_job_id, p_capability_token))
    || jsonb_build_object('deal_state_context', private.worker_load_deal_state_context(p_job_id, p_capability_token))
    || jsonb_build_object('match_provider_context', private.worker_load_match_provider_context(p_job_id, p_capability_token))
  from base;
$$;

revoke all on function public.worker_load_case_input(uuid, text)
  from public, anon;
grant execute on function public.worker_load_case_input(uuid, text)
  to authenticated;
