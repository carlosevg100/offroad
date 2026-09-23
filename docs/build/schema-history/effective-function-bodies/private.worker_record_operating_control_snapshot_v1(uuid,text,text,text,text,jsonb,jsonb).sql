CREATE OR REPLACE FUNCTION private.worker_record_operating_control_snapshot_v1(p_job_id uuid, p_capability_token text, p_scope_id text, p_requested_use text, p_input_fingerprint text, p_binding jsonb, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  frozen_input private.case_execution_inputs;
  execution_result private.case_execution_results;
  evaluation jsonb;
  snapshot_fingerprint text;
  snapshot_id uuid;
  existing public.operating_control_snapshots;
  valid_until timestamptz;
  snapshot_at timestamptz;
begin
  if job_row.kind <> 'case_analysis'
    or (p_scope_id is null or p_scope_id not in ('case-analysis:2026.08.29-v15', 'case-analysis:2026.09.09-v16', 'case-analysis:2026.09.10-v17'))
    or p_input_fingerprint !~ '^[a-f0-9]{64}$'
    or p_requested_use <> 'internal_decision'
    or job_row.controlled_execution_id is null then
    raise exception 'operating_control_capability_scope_invalid' using errcode = '42501';
  end if;

  select row.* into frozen_input
  from private.case_execution_inputs row
  where row.organization_id = job_row.organization_id
    and row.execution_id = job_row.controlled_execution_id;
  select row.* into execution_result
  from private.case_execution_results row
  where row.organization_id = job_row.organization_id
    and row.execution_id = job_row.controlled_execution_id;
  if frozen_input.execution_id is null
    or execution_result.execution_id is null
    or frozen_input.input_fingerprint <> p_input_fingerprint
    or coalesce(p_binding ->> 'controlledExecutionFingerprint', '')
      <> coalesce(execution_result.report ->> 'reportFingerprint', '')
    or coalesce(p_binding ->> 'manifestFingerprint', '')
      <> coalesce(execution_result.manifest ->> 'manifestFingerprint', '') then
    raise exception 'operating_control_execution_binding_invalid' using errcode = '42501';
  end if;

  snapshot_at := (p_snapshot ->> 'snapshotAt')::timestamptz;
  if snapshot_at < now() - interval '10 minutes' or snapshot_at > now() + interval '1 minute' then
    raise exception 'operating_control_snapshot_time_invalid' using errcode = '22023';
  end if;

  evaluation := private.evaluate_operating_control_snapshot_v1(
    p_scope_id, p_requested_use, p_snapshot, p_binding
  );
  snapshot_fingerprint := encode(
    extensions.digest(convert_to(p_snapshot::text, 'utf8'), 'sha256'), 'hex'
  );
  valid_until := clock_timestamp() + case
    when p_requested_use in ('external_material', 'external_action') then interval '1 hour'
    else interval '24 hours' end;

  select row.* into existing
  from public.operating_control_snapshots row
  where row.organization_id = job_row.organization_id
    and row.processing_job_id = job_row.id
    and row.requested_use = p_requested_use
    and row.decision_fingerprint = evaluation ->> 'decisionFingerprint';
  if found then
    return jsonb_build_object(
      'id', existing.id, 'allowed', existing.allowed,
      'blockers', to_jsonb(existing.blockers), 'warnings', to_jsonb(existing.warnings),
      'decisionFingerprint', existing.decision_fingerprint, 'replayed', true
    );
  end if;

  insert into public.operating_control_snapshots (
    organization_id, intake_session_id, processing_job_id, requested_use, scope_id,
    schema_version, input_fingerprint, binding, snapshot, snapshot_fingerprint,
    capability_accreditation_id, allowed, blockers, warnings, decision_fingerprint, valid_until
  ) values (
    job_row.organization_id, job_row.intake_session_id, job_row.id, p_requested_use,
    trim(p_scope_id), 'operating-control-snapshot.v1', p_input_fingerprint,
    p_binding, p_snapshot, snapshot_fingerprint,
    nullif(evaluation ->> 'capabilityAccreditationId', '')::uuid,
    (evaluation ->> 'allowed')::boolean,
    array(select value from jsonb_array_elements_text(evaluation -> 'blockers')),
    array(select value from jsonb_array_elements_text(evaluation -> 'warnings')),
    evaluation ->> 'decisionFingerprint', valid_until
  ) returning id into snapshot_id;
  return evaluation || jsonb_build_object('id', snapshot_id, 'replayed', false);
exception
  when invalid_text_representation or datetime_field_overflow then
    raise exception 'invalid_operating_control_snapshot' using errcode = '22023';
end;
$function$
