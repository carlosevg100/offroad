-- A terminal stale/superseded version must close the object type. Filtering those
-- rows before choosing the newest version can resurrect an older confirmation.

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
  ) filter (where latest.status not in ('stale', 'superseded')), '{}'::jsonb)
  into context
  from latest;

  return context;
end;
$$;

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
  structure_fingerprint text;
  production_fingerprint text;
  package_fingerprint text;
  release_fingerprint text;
  understanding_confirmed boolean := false;
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

  structure_fingerprint := objects #>> '{structure_decision,fingerprint}';
  structure_confirmed := understanding_confirmed
    and coalesce(objects #>> '{structure_decision,status}', '') in ('confirmed', 'approved')
    and coalesce(objects #> '{structure_decision,dependencies}', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'objectType', 'understanding_snapshot', 'objectFingerprint', understanding_fingerprint
    ));

  production_fingerprint := objects #>> '{production_plan,fingerprint}';
  production_approved := structure_confirmed
    and coalesce(objects #>> '{production_plan,status}', '') = 'approved'
    and coalesce(objects #> '{production_plan,dependencies}', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'objectType', 'structure_decision', 'objectFingerprint', structure_fingerprint
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
  if understanding_confirmed and structure_confirmed and production_approved then workflow_stage := 'prepare'; end if;
  if package_approved then workflow_stage := 'match'; end if;
  if release_authorized then workflow_stage := 'introduce'; end if;

  return jsonb_build_object(
    'stage', workflow_stage,
    'gates', jsonb_build_object(
      'understandingConfirmed', understanding_confirmed,
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

revoke all on function private.worker_load_deal_state_context(uuid, text)
  from public, anon;
revoke all on function private.worker_load_deal_workflow_state(uuid, text)
  from public, anon;
grant execute on function private.worker_load_deal_state_context(uuid, text)
  to authenticated;
grant execute on function private.worker_load_deal_workflow_state(uuid, text)
  to authenticated;
