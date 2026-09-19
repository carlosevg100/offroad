-- Validate the published pin again at result commit, under the same authority lock.
alter function private.worker_record_receivables_released_result_v1(uuid,text,uuid,jsonb) rename to worker_record_receivables_before_method_pin_v1;
revoke all on function private.worker_record_receivables_before_method_pin_v1(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
create function private.worker_record_receivables_released_result_v1(p_job_id uuid,p_capability_token text,p_input_assembly_id uuid,p_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);pin jsonb;existing private.receivables_released_results;begin
 pin:=private.pin_worker_method_release_v1(p_job_id,p_capability_token,'underwrite-receivables-pool','receivables_underwriting');
 if p_result->>'executorVersion' is distinct from pin->>'methodVersion' or p_result#>>'{release,procedure,id}' is distinct from pin->>'methodId'
 or p_result#>>'{release,procedure,version}' is distinct from pin->>'methodVersion' then raise exception 'method_release_executor_mismatch' using errcode='22023';end if;
 if p_result->'release' ? 'methodBinding' and p_result#>'{release,methodBinding}' is distinct from pin then raise exception 'method_release_pin_mismatch' using errcode='22023';end if;
 -- Compatibility for pre-stage-14 images during rollout, limited to this already-approved
 -- executor. The server binds the exact publication; clients cannot select or mint a release.
 -- Stage 17 removes this wire adapter when the execution contract replaces the old callback.
 select * into existing from private.receivables_released_results where organization_id=j.organization_id and processing_job_id=j.id and task_id='R01' and input_fingerprint=p_result#>>'{artifact,inputFingerprint}';
 if existing.id is not null and not existing.release ? 'methodBinding' and not p_result->'release' ? 'methodBinding' then
  return private.worker_record_receivables_before_method_pin_v1(p_job_id,p_capability_token,p_input_assembly_id,p_result);
 end if;
 return private.worker_record_receivables_before_method_pin_v1(p_job_id,p_capability_token,p_input_assembly_id,jsonb_set(p_result,'{release,methodBinding}',pin));
end $$;
revoke all on function private.worker_record_receivables_released_result_v1(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_record_receivables_released_result_v1(uuid,text,uuid,jsonb) to authenticated;
