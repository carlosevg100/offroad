CREATE OR REPLACE FUNCTION private.worker_load_receivables_analytical_release_v1(p_job_id uuid, p_capability_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  v_open boolean;
  v_note text;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;
  v_open := private.receivables_analytical_release_enabled(job_row.organization_id);
  -- The reason travels with the answer: an explicit pause for this organization first, otherwise
  -- what the platform release record says about the capability.
  select paused.note into v_note
  from private.receivables_analytical_release_grants paused
  where paused.organization_id = job_row.organization_id
    and not paused.enabled;
  if v_note is null then
    select release_row.note into v_note
    from private.platform_capability_releases release_row
    where release_row.capability_key = 'finance.receivables-released-analysis';
  end if;
  -- `granted` is the stable wire name of "the release is open for this organization"; a worker
  -- built before the universal release reads it unchanged.
  return jsonb_build_object(
    'methodBinding', case when v_open then private.pin_worker_method_release_v1(p_job_id,p_capability_token,'underwrite-receivables-pool','receivables_underwriting') else null end,
    'granted', v_open,
    'organizationId', job_row.organization_id,
    'note', v_note
  );
end;
$function$
