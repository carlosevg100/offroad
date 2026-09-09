-- One transaction removes the immutable-report / snapshot / completion crash window.
create function private.worker_commit_documentary_execution_v1(p_job_id uuid,p_capability_token text,p_report jsonb,p_manifest jsonb,p_case_state jsonb,p_result jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token); binding jsonb; manifest_id uuid;
begin
 binding:=private.document_work_request_binding_v1(j.id);
 if j.kind<>'case_analysis' or binding->>'executionScope' is distinct from 'documentary_only'
   or binding is distinct from p_case_state#>'{documentWorkProduct,binding}' then
   raise exception 'documentary_commit_scope_invalid' using errcode='42501';
 end if;
 if p_report->>'schemaVersion' is distinct from 'document-work-execution.v1'
   or p_report->>'status' is distinct from 'succeeded'
   or p_case_state->>'schemaVersion' is distinct from 'document-work-case-state.v1'
   or p_report->>'executionScope' is distinct from 'documentary_only'
   or p_case_state->>'executionScope' is distinct from 'documentary_only'
   or p_report->>'financialAnalysisStatus' is distinct from 'not_performed'
   or p_case_state->>'financialAnalysisStatus' is distinct from 'not_performed'
   or p_report->>'jobId' is distinct from j.id::text
   or p_report->>'runId' is distinct from j.processing_run_id::text
   or p_report->>'inputFingerprint' is distinct from p_manifest->>'inputFingerprint'
   or p_case_state->>'fingerprint' is distinct from p_manifest->>'inputFingerprint'
   or p_report->>'productFingerprint' is distinct from p_case_state#>>'{documentWorkProduct,product,fingerprint}'
   or p_case_state->>'manifestFingerprint' is distinct from p_manifest->>'manifestFingerprint' then
   raise exception 'documentary_commit_contract_invalid' using errcode='22023';
 end if;
 perform private.worker_record_controlled_execution(j.id,p_capability_token,p_report,p_manifest,null);
 manifest_id:=private.worker_record_case_snapshot(j.id,p_capability_token,p_manifest,p_case_state);
 perform private.worker_write_stage_result(j.id,p_capability_token,'documentary_Q03','succeeded',jsonb_build_object('attempt',j.attempts),'{}');
 perform private.worker_write_stage_result(j.id,p_capability_token,'document_work_product','succeeded',jsonb_build_object('executionScope','documentary_only'),'{}');
 perform private.worker_write_stage_result(j.id,p_capability_token,'case_analysis','succeeded',jsonb_build_object('executionScope','documentary_only','financialAnalysisStatus','not_performed'),'{}');
 perform private.worker_complete_job(j.id,p_capability_token,jsonb_build_object('manifest_id',manifest_id,'report',p_report,'analysis_scope','documentary_only','model_lineage',coalesce(p_result->'model_lineage','[]'),'spend',coalesce(p_result->'spend','{}')));
 return manifest_id;
end $$;
create function public.worker_commit_documentary_execution_v1(p_job_id uuid,p_capability_token text,p_report jsonb,p_manifest jsonb,p_case_state jsonb,p_result jsonb)
returns uuid language sql security invoker set search_path='' as $$
 select private.worker_commit_documentary_execution_v1(p_job_id,p_capability_token,p_report,p_manifest,p_case_state,p_result);
$$;
revoke all on function private.worker_commit_documentary_execution_v1(uuid,text,jsonb,jsonb,jsonb,jsonb),public.worker_commit_documentary_execution_v1(uuid,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.worker_commit_documentary_execution_v1(uuid,text,jsonb,jsonb,jsonb,jsonb),public.worker_commit_documentary_execution_v1(uuid,text,jsonb,jsonb,jsonb,jsonb) to authenticated;
