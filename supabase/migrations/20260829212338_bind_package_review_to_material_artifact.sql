-- A package approval must bind both to the approved production plan and to the exact material
-- artifact reviewed by the company. This closes the Prepare gate without authorising release.

create or replace function private.enforce_package_review_material_dependency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_artifact public.deal_state_objects;
begin
  if new.object_type <> 'package_review' or new.status <> 'approved' then
    return new;
  end if;

  select * into current_artifact
  from public.deal_state_objects state_object
  where state_object.organization_id = new.organization_id
    and state_object.intake_session_id = new.intake_session_id
    and state_object.object_type = 'material_artifact'
  order by state_object.object_version desc
  limit 1;

  if not found
    or current_artifact.status not in ('pending_confirmation', 'approved')
    or not new.dependencies @> jsonb_build_array(jsonb_build_object(
      'objectType', 'material_artifact',
      'objectFingerprint', current_artifact.object_fingerprint
    )) then
    raise exception 'current_material_artifact_required' using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_package_review_material_dependency
  on public.deal_state_objects;
create trigger enforce_package_review_material_dependency
before insert on public.deal_state_objects
for each row execute function private.enforce_package_review_material_dependency();

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
  release_fingerprint text;
  understanding_confirmed boolean := false;
  structure_option_current boolean := false;
  structure_confirmed boolean := false;
  production_approved boolean := false;
  material_current boolean := false;
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

