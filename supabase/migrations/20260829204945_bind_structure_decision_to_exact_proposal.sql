-- Bind a user decision to the exact structure proposal that was displayed.
-- The governed chain is now:
-- understanding_snapshot -> structure_option -> structure_decision -> production_plan.
-- A request for changes or a decline is a valid recorded decision, but never opens
-- the materials-production gate.

alter table public.deal_state_objects
  drop constraint deal_state_objects_status_check;

alter table public.deal_state_objects
  add constraint deal_state_objects_status_check check (status in (
    'draft', 'pending_confirmation', 'confirmed', 'approved',
    'changes_requested', 'declined', 'stale', 'superseded'
  ));

create or replace function private.append_deal_state_object(
  p_organization_id uuid,
  p_session_id uuid,
  p_object_type text,
  p_status text,
  p_input_fingerprint text,
  p_payload jsonb,
  p_dependencies jsonb,
  p_created_by uuid,
  p_created_by_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
  object_id uuid;
  object_fingerprint text;
  required_type text;
  required_fingerprint text;
  required_status text;
  required_payload jsonb;
  allowed_required_statuses text[];
  proposal_fingerprint text;
  decision_proposal_fingerprint text;
begin
  if p_object_type not in (
    'understanding_snapshot', 'finding_register', 'clarification_batch',
    'structure_option', 'structure_decision', 'production_plan',
    'material_artifact', 'package_review', 'match_screen', 'release_authorization'
  ) or p_status not in (
    'draft', 'pending_confirmation', 'confirmed', 'approved',
    'changes_requested', 'declined', 'stale', 'superseded'
  ) or p_input_fingerprint !~ '^[0-9a-f]{64}$'
    or coalesce(jsonb_typeof(p_payload), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_dependencies), 'null') <> 'array'
    or jsonb_array_length(p_dependencies) > 100
    or p_created_by_kind not in ('user', 'worker')
    or (p_created_by_kind = 'user' and p_created_by is null)
    or (p_created_by_kind = 'worker' and p_created_by is not null) then
    raise exception 'invalid_deal_state_object' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_dependencies) as dependency(value)
    where jsonb_typeof(dependency.value) <> 'object'
      or dependency.value ->> 'objectType' not in (
        'understanding_snapshot', 'finding_register', 'clarification_batch',
        'structure_option', 'structure_decision', 'production_plan',
        'material_artifact', 'package_review', 'match_screen', 'release_authorization'
      )
      or coalesce(dependency.value ->> 'objectFingerprint', '') !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'invalid_deal_state_dependencies' using errcode = '22023';
  end if;

  perform 1
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id
    and session.id = p_session_id
  for update;
  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;

  required_type := case p_object_type
    when 'structure_option' then 'understanding_snapshot'
    when 'structure_decision' then 'structure_option'
    when 'production_plan' then 'structure_decision'
    when 'material_artifact' then 'production_plan'
    when 'package_review' then 'production_plan'
    when 'match_screen' then 'package_review'
    when 'release_authorization' then 'package_review'
    else null
  end;
  allowed_required_statuses := case p_object_type
    when 'structure_option' then array['confirmed', 'approved']
    when 'structure_decision' then array['pending_confirmation']
    else array['confirmed', 'approved']
  end;

  if required_type is not null then
    -- Select the newest version first. A terminal latest version must never allow an
    -- older version of the same object type to reappear as a valid dependency.
    select state_object.object_fingerprint, state_object.status, state_object.payload
    into required_fingerprint, required_status, required_payload
    from public.deal_state_objects state_object
    where state_object.organization_id = p_organization_id
      and state_object.intake_session_id = p_session_id
      and state_object.object_type = required_type
    order by state_object.object_version desc
    limit 1;

    if required_fingerprint is null
      or not (required_status = any(allowed_required_statuses))
      or not p_dependencies @> jsonb_build_array(jsonb_build_object(
        'objectType', required_type,
        'objectFingerprint', required_fingerprint
      )) then
      raise exception 'current_upstream_object_required' using errcode = '55000';
    end if;
  end if;

  if p_object_type = 'structure_decision' then
    proposal_fingerprint := coalesce(
      required_payload #>> '{compiled,proposalFingerprint}',
      required_payload #>> '{proposal,proposalFingerprint}',
      required_payload ->> 'proposalFingerprint'
    );
    decision_proposal_fingerprint := coalesce(
      p_payload #>> '{confirmation,proposalFingerprint}',
      p_payload ->> 'proposalFingerprint'
    );
    if proposal_fingerprint is null
      or decision_proposal_fingerprint is distinct from proposal_fingerprint then
      raise exception 'exact_structure_proposal_required' using errcode = '55000';
    end if;
  end if;

  select coalesce(max(state_object.object_version), 0) + 1
  into next_version
  from public.deal_state_objects state_object
  where state_object.organization_id = p_organization_id
    and state_object.intake_session_id = p_session_id
    and state_object.object_type = p_object_type;

  object_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'organizationId', p_organization_id,
    'intakeSessionId', p_session_id,
    'objectType', p_object_type,
    'objectVersion', next_version,
    'status', p_status,
    'inputFingerprint', p_input_fingerprint,
    'payload', p_payload,
    'dependencies', p_dependencies
  )::text, 'utf8'), 'sha256'), 'hex');

  update public.deal_state_objects state_object
  set status = 'superseded', superseded_at = now()
  where state_object.organization_id = p_organization_id
    and state_object.intake_session_id = p_session_id
    and state_object.object_type = p_object_type
    and state_object.status not in ('stale', 'superseded');

  insert into public.deal_state_objects (
    organization_id, intake_session_id, object_type, object_version, status,
    input_fingerprint, object_fingerprint, payload, dependencies,
    created_by, created_by_kind
  ) values (
    p_organization_id, p_session_id, p_object_type, next_version, p_status,
    p_input_fingerprint, object_fingerprint, p_payload, p_dependencies,
    p_created_by, p_created_by_kind
  ) returning id into object_id;

  return object_id;
end;
$$;

revoke all on function private.append_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb, uuid, text)
  from public, anon;

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
    or (p_object_type = 'structure_decision' and p_status in ('confirmed', 'changes_requested', 'declined'))
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

create or replace function private.worker_load_deal_workflow_state(
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
  objects jsonb := '{}'::jsonb;
  understanding_fingerprint text;
  structure_option_fingerprint text;
  structure_decision_fingerprint text;
  production_fingerprint text;
  package_fingerprint text;
  release_fingerprint text;
  understanding_confirmed boolean := false;
  structure_option_current boolean := false;
  structure_confirmed boolean := false;
  production_approved boolean := false;
  package_approved boolean := false;
  release_authorized boolean := false;
  workflow_stage text := 'diagnose';
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;

  with latest as (
    select distinct on (state_object.object_type)
      state_object.object_type,
      state_object.status,
      state_object.object_fingerprint,
      state_object.dependencies
    from public.deal_state_objects state_object
    where state_object.organization_id = job_row.organization_id
      and state_object.intake_session_id = job_row.intake_session_id
    order by state_object.object_type, state_object.object_version desc
  )
  select coalesce(jsonb_object_agg(
    latest.object_type,
    jsonb_build_object(
      'status', latest.status,
      'fingerprint', latest.object_fingerprint,
      'dependencies', latest.dependencies
    )
  ) filter (where latest.status not in ('stale', 'superseded')), '{}'::jsonb)
  into objects
  from latest;

  understanding_fingerprint := objects #>> '{understanding_snapshot,fingerprint}';
  understanding_confirmed := coalesce(objects #>> '{understanding_snapshot,status}', '') in ('confirmed', 'approved');

  structure_option_fingerprint := objects #>> '{structure_option,fingerprint}';
  structure_option_current := understanding_confirmed
    and coalesce(objects #>> '{structure_option,status}', '') = 'pending_confirmation'
    and coalesce(objects #> '{structure_option,dependencies}', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'objectType', 'understanding_snapshot', 'objectFingerprint', understanding_fingerprint
    ));

  structure_decision_fingerprint := objects #>> '{structure_decision,fingerprint}';
  structure_confirmed := structure_option_current
    and coalesce(objects #>> '{structure_decision,status}', '') = 'confirmed'
    and coalesce(objects #> '{structure_decision,dependencies}', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'objectType', 'structure_option', 'objectFingerprint', structure_option_fingerprint
    ));

  production_fingerprint := objects #>> '{production_plan,fingerprint}';
  production_approved := structure_confirmed
    and coalesce(objects #>> '{production_plan,status}', '') = 'approved'
    and coalesce(objects #> '{production_plan,dependencies}', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'objectType', 'structure_decision', 'objectFingerprint', structure_decision_fingerprint
    ));

  package_fingerprint := objects #>> '{package_review,fingerprint}';
  package_approved := production_approved
    and coalesce(objects #>> '{package_review,status}', '') = 'approved'
    and coalesce(objects #> '{package_review,dependencies}', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'objectType', 'production_plan', 'objectFingerprint', production_fingerprint
    ));

  release_fingerprint := objects #>> '{release_authorization,fingerprint}';
  release_authorized := package_approved
    and coalesce(objects #>> '{release_authorization,status}', '') = 'approved'
    and coalesce(objects #> '{release_authorization,dependencies}', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'objectType', 'package_review', 'objectFingerprint', package_fingerprint
    ));

  if understanding_confirmed then workflow_stage := 'structure'; end if;
  if structure_confirmed then workflow_stage := 'prepare'; end if;
  if package_approved then workflow_stage := 'match'; end if;
  if release_authorized then workflow_stage := 'introduce'; end if;

  return jsonb_build_object(
    'stage', workflow_stage,
    'gates', jsonb_build_object(
      'understandingConfirmed', understanding_confirmed,
      'structureOptionCurrent', structure_option_current,
      'structureConfirmed', structure_confirmed,
      'productionPlanApproved', production_approved,
      'packageApproved', package_approved,
      'releaseAuthorized', release_authorized
    ),
    'objectFingerprints', (
      select coalesce(jsonb_object_agg(key, value -> 'fingerprint'), '{}'::jsonb)
      from jsonb_each(objects)
    )
  );
end;
$$;

revoke all on function private.worker_load_deal_workflow_state(uuid, text)
  from public, anon;
grant execute on function private.worker_load_deal_workflow_state(uuid, text)
  to authenticated;
