-- The shortlist decision and the authorization to contact named recipients are distinct acts.
-- Approving a match screen confirms only which current mandates should move to introduction
-- planning. It never authorizes a contact or releases materials.

create or replace function private.approve_match_shortlist(
  p_organization_id uuid,
  p_session_id uuid,
  p_match_screen_fingerprint text,
  p_selected_provider_ids text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_screen public.deal_state_objects;
  selected_count integer;
  eligible_selected_count integer;
  approved_payload jsonb;
begin
  if actor_id is null
    or not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'match_shortlist_access_denied' using errcode = '42501';
  end if;
  if p_match_screen_fingerprint !~ '^[0-9a-f]{64}$'
    or coalesce(cardinality(p_selected_provider_ids), 0) not between 1 and 20 then
    raise exception 'match_shortlist_selection_invalid' using errcode = '22023';
  end if;

  select count(distinct provider_id)
  into selected_count
  from unnest(p_selected_provider_ids) provider_id
  where nullif(trim(provider_id), '') is not null;
  if selected_count <> cardinality(p_selected_provider_ids) then
    raise exception 'match_shortlist_selection_invalid' using errcode = '22023';
  end if;

  select * into current_screen
  from public.deal_state_objects state_object
  where state_object.organization_id = p_organization_id
    and state_object.intake_session_id = p_session_id
    and state_object.object_type = 'match_screen'
  order by state_object.object_version desc
  limit 1
  for update;

  if not found
    or current_screen.status <> 'pending_confirmation'
    or current_screen.object_fingerprint <> p_match_screen_fingerprint then
    raise exception 'current_match_screen_required' using errcode = '55000';
  end if;

  select count(*) into eligible_selected_count
  from jsonb_array_elements(coalesce(current_screen.payload -> 'candidates', '[]'::jsonb)) candidate
  where candidate ->> 'providerId' = any(p_selected_provider_ids)
    and coalesce((candidate ->> 'eligibleForShortlist')::boolean, false);
  if eligible_selected_count <> selected_count then
    raise exception 'eligible_match_candidate_required' using errcode = '55000';
  end if;

  approved_payload := jsonb_set(
    current_screen.payload,
    '{approval}',
    jsonb_build_object(
      'selectedProviderIds', to_jsonb(p_selected_provider_ids),
      'actorId', actor_id::text,
      'approvedAt', clock_timestamp(),
      'scope', 'match_shortlist_only'
    ),
    true
  );

  return private.append_deal_state_object(
    p_organization_id,
    p_session_id,
    'match_screen',
    'approved',
    current_screen.input_fingerprint,
    approved_payload,
    current_screen.dependencies,
    actor_id,
    'user'
  );
end;
$$;

revoke all on function private.approve_match_shortlist(uuid, uuid, text, text[])
  from public, anon;
grant execute on function private.approve_match_shortlist(uuid, uuid, text, text[])
  to authenticated;

create or replace function public.approve_match_shortlist(
  p_organization_id uuid,
  p_session_id uuid,
  p_match_screen_fingerprint text,
  p_selected_provider_ids text[]
)
returns uuid
language sql
set search_path = ''
as $$
  select private.approve_match_shortlist(
    p_organization_id,
    p_session_id,
    p_match_screen_fingerprint,
    p_selected_provider_ids
  );
$$;

revoke all on function public.approve_match_shortlist(uuid, uuid, text, text[])
  from public, anon;
grant execute on function public.approve_match_shortlist(uuid, uuid, text, text[])
  to authenticated;

create or replace function private.enforce_release_after_match_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_match public.deal_state_objects;
begin
  if new.object_type <> 'release_authorization' or new.status <> 'approved' then
    return new;
  end if;

  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = new.organization_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then
    raise exception 'release_authorizer_role_required' using errcode = '42501';
  end if;

  select * into current_match
  from public.deal_state_objects state_object
  where state_object.organization_id = new.organization_id
    and state_object.intake_session_id = new.intake_session_id
    and state_object.object_type = 'match_screen'
  order by state_object.object_version desc
  limit 1;

  if not found
    or current_match.status <> 'approved'
    or not new.dependencies @> jsonb_build_array(jsonb_build_object(
      'objectType', 'match_screen',
      'objectFingerprint', current_match.object_fingerprint
    )) then
    raise exception 'approved_current_match_screen_required' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_release_after_match_approval
  on public.deal_state_objects;
create trigger enforce_release_after_match_approval
before insert on public.deal_state_objects
for each row execute function private.enforce_release_after_match_approval();

revoke all on function private.enforce_release_after_match_approval()
  from public, anon, authenticated;

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
  material_fingerprint text;
  package_fingerprint text;
  match_fingerprint text;
  understanding_confirmed boolean := false;
  structure_option_current boolean := false;
  structure_confirmed boolean := false;
  production_approved boolean := false;
  material_current boolean := false;
  package_approved boolean := false;
  match_approved boolean := false;
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

  material_fingerprint := objects #>> '{material_artifact,fingerprint}';
  material_current := production_approved
    and coalesce(objects #>> '{material_artifact,status}', '') = 'pending_confirmation'
    and coalesce(objects #> '{material_artifact,dependencies}', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'objectType', 'production_plan', 'objectFingerprint', production_fingerprint
    ));

  package_fingerprint := objects #>> '{package_review,fingerprint}';
  package_approved := material_current
    and coalesce(objects #>> '{package_review,status}', '') = 'approved'
    and coalesce(objects #> '{package_review,dependencies}', '[]'::jsonb) @> jsonb_build_array(
      jsonb_build_object('objectType', 'production_plan', 'objectFingerprint', production_fingerprint),
      jsonb_build_object('objectType', 'material_artifact', 'objectFingerprint', material_fingerprint)
    );

  match_fingerprint := objects #>> '{match_screen,fingerprint}';
  match_approved := package_approved
    and coalesce(objects #>> '{match_screen,status}', '') = 'approved'
    and coalesce(objects #> '{match_screen,dependencies}', '[]'::jsonb) @> jsonb_build_array(
      jsonb_build_object('objectType', 'package_review', 'objectFingerprint', package_fingerprint),
      jsonb_build_object('objectType', 'material_artifact', 'objectFingerprint', material_fingerprint)
    );

  release_authorized := match_approved
    and coalesce(objects #>> '{release_authorization,status}', '') = 'approved'
    and coalesce(objects #> '{release_authorization,dependencies}', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'objectType', 'match_screen', 'objectFingerprint', match_fingerprint
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
      'matchApproved', match_approved,
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
