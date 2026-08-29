-- Exact retries return the same object. A worker replay with the same governed input never
-- supersedes a user-confirmed or approved object.

create or replace function private.record_deal_state_object(
  p_organization_id uuid,
  p_session_id uuid,
  p_object_type text,
  p_status text,
  p_input_fingerprint text,
  p_payload jsonb,
  p_dependencies jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  existing_id uuid;
begin
  if actor_id is null
    or not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'deal_state_access_denied' using errcode = '42501';
  end if;

  if not (
    (p_object_type = 'understanding_snapshot' and p_status in ('confirmed', 'approved'))
    or (p_object_type = 'structure_decision' and p_status in ('confirmed', 'approved'))
    or (p_object_type = 'production_plan' and p_status = 'approved')
    or (p_object_type = 'package_review' and p_status = 'approved')
    or (p_object_type = 'release_authorization' and p_status = 'approved')
  ) then
    raise exception 'user_deal_state_transition_denied' using errcode = '42501';
  end if;

  select state_object.id into existing_id
  from public.deal_state_objects state_object
  where state_object.organization_id = p_organization_id
    and state_object.intake_session_id = p_session_id
    and state_object.object_type = p_object_type
    and state_object.status = p_status
    and state_object.input_fingerprint = p_input_fingerprint
    and state_object.payload = p_payload
    and state_object.dependencies = p_dependencies
  order by state_object.object_version desc
  limit 1;
  if existing_id is not null then return existing_id; end if;

  return private.append_deal_state_object(
    p_organization_id, p_session_id, p_object_type, p_status,
    p_input_fingerprint, p_payload, p_dependencies, actor_id, 'user'
  );
end;
$$;

revoke all on function private.record_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function private.record_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb)
  to authenticated;

create or replace function private.worker_record_deal_state_object(
  p_job_id uuid,
  p_capability_token text,
  p_object_type text,
  p_status text,
  p_input_fingerprint text,
  p_payload jsonb,
  p_dependencies jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  existing_id uuid;
begin
  if job_row.kind <> 'case_analysis'
    or not (
      p_object_type in (
        'understanding_snapshot', 'finding_register', 'clarification_batch',
        'structure_option', 'production_plan', 'material_artifact', 'match_screen'
      ) and p_status in ('draft', 'pending_confirmation')
    ) then
    raise exception 'worker_deal_state_transition_denied' using errcode = '42501';
  end if;

  select state_object.id into existing_id
  from public.deal_state_objects state_object
  where state_object.organization_id = job_row.organization_id
    and state_object.intake_session_id = job_row.intake_session_id
    and state_object.object_type = p_object_type
    and state_object.status not in ('stale', 'superseded')
    and state_object.input_fingerprint = p_input_fingerprint
    and (
      state_object.status in ('confirmed', 'approved')
      or (
        state_object.status = p_status
        and state_object.payload = p_payload
        and state_object.dependencies = p_dependencies
      )
    )
  order by state_object.object_version desc
  limit 1;
  if existing_id is not null then return existing_id; end if;

  return private.append_deal_state_object(
    job_row.organization_id, job_row.intake_session_id, p_object_type, p_status,
    p_input_fingerprint, p_payload, p_dependencies, null, 'worker'
  );
end;
$$;

revoke all on function private.worker_record_deal_state_object(uuid, text, text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function private.worker_record_deal_state_object(uuid, text, text, text, text, jsonb, jsonb)
  to authenticated;
