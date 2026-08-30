-- Return the current governed payloads with the workflow gate summary. The worker
-- needs the exact proposal a company reviewed; regenerating it on every run would
-- spend model budget and could make a confirmation point at a different structure.

create or replace function private.worker_load_deal_state_context(
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
  context jsonb;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;

  with latest as (
    select distinct on (state_object.object_type)
      state_object.object_type,
      state_object.status,
      state_object.input_fingerprint,
      state_object.object_fingerprint,
      state_object.payload,
      state_object.dependencies
    from public.deal_state_objects state_object
    where state_object.organization_id = job_row.organization_id
      and state_object.intake_session_id = job_row.intake_session_id
      and state_object.status not in ('stale', 'superseded')
    order by state_object.object_type, state_object.object_version desc
  )
  select coalesce(jsonb_object_agg(
    latest.object_type,
    jsonb_build_object(
      'status', latest.status,
      'inputFingerprint', latest.input_fingerprint,
      'fingerprint', latest.object_fingerprint,
      'payload', latest.payload,
      'dependencies', latest.dependencies
    )
  ), '{}'::jsonb)
  into context
  from latest;

  return context;
end;
$$;

revoke all on function private.worker_load_deal_state_context(uuid, text)
  from public, anon;
grant execute on function private.worker_load_deal_state_context(uuid, text)
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
  select private.worker_load_case_input(p_job_id, p_capability_token)
    || jsonb_build_object('pricing_context', private.worker_load_pricing_context(p_job_id, p_capability_token))
    || jsonb_build_object('market_distribution_context', private.worker_load_market_distribution_context(p_job_id, p_capability_token))
    || jsonb_build_object('red_flag_context', private.worker_load_red_flag_context(p_job_id, p_capability_token))
    || jsonb_build_object('conduct_context', private.worker_load_conduct_context(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_evidence', private.worker_load_receivables_evidence(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_provider_context', private.worker_load_receivables_provider_context(p_job_id, p_capability_token))
    || jsonb_build_object('deal_workflow', private.worker_load_deal_workflow_state(p_job_id, p_capability_token))
    || jsonb_build_object('deal_state_context', private.worker_load_deal_state_context(p_job_id, p_capability_token));
$$;

revoke all on function public.worker_load_case_input(uuid, text)
  from public, anon;
grant execute on function public.worker_load_case_input(uuid, text)
  to authenticated;
