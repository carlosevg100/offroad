-- Knowledge date is stable across retries of one job, including midnight.
create or replace function private.worker_load_agent_context_v3(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); context jsonb;
begin
  context:=private.worker_load_agent_context_v2(p_job_id,p_capability_token);
  return context||jsonb_build_object('governed_sector_context_inputs',private.governed_sector_context_inputs(j.organization_id,j.intake_session_id)||jsonb_build_object('as_of',(j.created_at at time zone 'UTC')::date));
end;
$$;

create or replace function private.worker_load_execution_brief_proposal_v2(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); context jsonb;
begin
  context:=private.worker_load_execution_brief_proposal_v1(p_job_id,p_capability_token);
  return context||jsonb_build_object('governed_sector_context_inputs',private.governed_sector_context_inputs(j.organization_id,j.intake_session_id)||jsonb_build_object('as_of',(j.created_at at time zone 'UTC')::date));
end;
$$;
