-- The worker records a governed assessment immediately after persisting the preliminary
-- understanding. Bind that assessment to the durable capital project already owned by the
-- intake session. The v2 loader previously omitted this identifier, so the customer-facing
-- understanding was inserted but the job then failed while validating an undefined project id.

create or replace function private.worker_load_preliminary_input_v2(
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
  base_input jsonb;
  project_id uuid;
  initial_request text;
  correction_request text;
begin
  if job_row.kind <> 'preliminary_analysis'
    or job_row.payload ->> 'analysis_scope' <> 'preliminary_understanding' then
    raise exception 'preliminary_analysis_capability_required' using errcode = '42501';
  end if;

  base_input := private.worker_load_preliminary_input(p_job_id, p_capability_token);

  select session.capital_project_id into project_id
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.current_run_id = job_row.processing_run_id;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;

  select message.content into initial_request
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.intake_session_id = job_row.intake_session_id
    and message.role = 'user'
    and message.metadata ->> 'kind' = 'request'
    and message.status in ('completed', 'processing')
  order by message.created_at asc, message.id asc
  limit 1;

  select understanding.correction into correction_request
  from public.preliminary_understandings understanding
  where understanding.organization_id = job_row.organization_id
    and understanding.intake_session_id = job_row.intake_session_id
    and understanding.status = 'changes_requested'
  order by understanding.object_version desc
  limit 1;

  return jsonb_set(
    base_input,
    '{session,capital_project_id}',
    coalesce(to_jsonb(project_id), 'null'::jsonb),
    true
  ) || jsonb_build_object(
    'initial_request', nullif(trim(coalesce(initial_request, '')), ''),
    'correction_request', nullif(trim(coalesce(correction_request, '')), '')
  );
end;
$$;

revoke all on function private.worker_load_preliminary_input_v2(uuid, text)
  from public, anon;
grant execute on function private.worker_load_preliminary_input_v2(uuid, text)
  to authenticated;

comment on function public.worker_load_preliminary_input_v2(uuid, text) is
  'Loads preliminary evidence and declarations with the durable capital-project binding required for governed assessments.';
