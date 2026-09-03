-- Bridge the conversational project transcript into the established preliminary-case graph.
-- The first user request is declaration context, never reconciled evidence. A correction to the
-- preliminary object is also scoped to the next preliminary revision. Neither field mutates the
-- session projection or widens the worker capability.

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
  initial_request text;
  correction_request text;
begin
  if job_row.kind <> 'preliminary_analysis'
    or job_row.payload ->> 'analysis_scope' <> 'preliminary_understanding' then
    raise exception 'preliminary_analysis_capability_required' using errcode = '42501';
  end if;

  base_input := private.worker_load_preliminary_input(p_job_id, p_capability_token);

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

  return base_input || jsonb_build_object(
    'initial_request', nullif(trim(coalesce(initial_request, '')), ''),
    'correction_request', nullif(trim(coalesce(correction_request, '')), '')
  );
end;
$$;

create or replace function public.worker_load_preliminary_input_v2(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_preliminary_input_v2(p_job_id, p_capability_token);
$$;

revoke all on function private.worker_load_preliminary_input_v2(uuid, text)
  from public, anon;
revoke all on function public.worker_load_preliminary_input_v2(uuid, text)
  from public, anon;
grant execute on function private.worker_load_preliminary_input_v2(uuid, text)
  to authenticated;
grant execute on function public.worker_load_preliminary_input_v2(uuid, text)
  to authenticated;

comment on function public.worker_load_preliminary_input_v2(uuid, text) is
  'Loads the preliminary company and operation evidence plus the project request and latest user correction as declaration-only context.';
