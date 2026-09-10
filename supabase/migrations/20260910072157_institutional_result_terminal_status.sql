-- Report terminal dispatch failure without manufacturing a completed artifact or mutating history.
create or replace function private.read_institutional_model_results_v1(p_project_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org_id uuid;r private.institutional_model_results;context jsonb;current_id uuid;is_current boolean;job_status text;visible_status text;visible_blockers jsonb;
begin
 select organization_id into org_id from public.capital_projects where id=p_project_id;
 if org_id is null or not private.can_access_capital_project(org_id,p_project_id) then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 select * into r from private.institutional_model_results where organization_id=org_id and capital_project_id=p_project_id order by created_at desc,id desc limit 1;
 if r.id is null then select j.status into job_status from public.processing_jobs j where j.organization_id=org_id and j.intake_session_id=r.intake_session_id and j.kind='agent_operation_brief' and j.payload->>'message_id'=r.id::text order by j.created_at desc limit 1;
 visible_status:=case when not is_current then 'stale' when r.status='queued' and (job_status is null or job_status in ('failed','cancelled','poison','succeeded')) then 'blocked' else r.status end;
 visible_blockers:=case when visible_status='blocked' and r.status='queued' then jsonb_build_array(case when job_status is null then 'institutional_result_dispatch_missing' when job_status='succeeded' then 'institutional_result_output_missing' else 'institutional_result_job_'||job_status end) else r.blockers end;
 return jsonb_build_object('projectId',p_project_id,'latest',null);end if;
 context:=private.institutional_source_context(org_id,r.intake_session_id);
 select id into current_id from private.institutional_model_configurations where organization_id=org_id and capital_project_id=p_project_id and status='approved' order by revision desc limit 1;
 is_current:=coalesce(r.configuration_id=current_id and r.source_manifest_fingerprint=context->>'sourceManifestFingerprint',false);
 select j.status into job_status from public.processing_jobs j where j.organization_id=org_id and j.intake_session_id=r.intake_session_id and j.kind='agent_operation_brief' and j.payload->>'message_id'=r.id::text order by j.created_at desc limit 1;
 visible_status:=case when not is_current then 'stale' when r.status='queued' and (job_status is null or job_status in ('failed','cancelled','poison','succeeded')) then 'blocked' else r.status end;
 visible_blockers:=case when visible_status='blocked' and r.status='queued' then jsonb_build_array(case when job_status is null then 'institutional_result_dispatch_missing' when job_status='succeeded' then 'institutional_result_output_missing' else 'institutional_result_job_'||job_status end) else r.blockers end;
 return jsonb_build_object('projectId',p_project_id,'latest',jsonb_build_object('id',r.id,'status',visible_status,'configurationId',r.configuration_id,'configurationFingerprint',r.configuration_fingerprint,'sourceManifestFingerprint',r.source_manifest_fingerprint,'artifact',case when is_current and r.status='completed' then r.artifact else null end,'blockers',visible_blockers,'createdAt',r.created_at));
end $$;
