CREATE OR REPLACE FUNCTION private.worker_load_institutional_model_context_v1(p_job_id uuid, p_capability_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);project_id uuid;context jsonb;configs jsonb;latest_sources jsonb;
begin
 if exists(select 1 from private.institutional_input_snapshots where organization_id=j.organization_id and (job_id=j.id or result_id::text=j.payload->>'message_id')) then raise exception 'institutional_snapshot_requires_v2' using errcode='42501';end if;
 if j.kind not in ('case_analysis','agent_operation_brief') then raise exception 'institutional_capability_required' using errcode='42501';end if;
 select capital_project_id into project_id from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 if project_id is null then raise exception 'institutional_project_required';end if;
 context:=private.institutional_source_context(j.organization_id,j.intake_session_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'revision',c.revision,'fingerprint',c.configuration_fingerprint,'configuration',c.configuration,'reviewedBy',c.reviewed_by,'reviewedAt',c.reviewed_at,'sourceBindings',p.provenance->'sourceBindings') order by c.revision),'[]') into configs
 from (select * from private.institutional_model_configurations where organization_id=j.organization_id and capital_project_id=project_id and status='approved' order by revision desc limit 12) c
 cross join lateral(select private.institutional_configuration_provenance(c.organization_id,c.id) provenance) p
 where p.provenance->>'sourceManifestFingerprint'=context->>'sourceManifestFingerprint';
 latest_sources:=coalesce(configs->(jsonb_array_length(configs)-1)->'sourceBindings','[]'::jsonb);
 return context||jsonb_build_object('modelResultRequest',(select jsonb_build_object('id',r.id,'configurationId',r.configuration_id,'configurationFingerprint',r.configuration_fingerprint,'sourceManifestFingerprint',r.source_manifest_fingerprint,'status',r.status,'artifact',r.artifact,'blockers',r.blockers) from private.institutional_model_results r where r.organization_id=j.organization_id and r.intake_session_id=j.intake_session_id and r.capital_project_id=project_id and j.kind='agent_operation_brief' and r.id=nullif(j.payload->>'message_id','')::uuid),'projectId',project_id,'approvedConfigurations',configs,'reviewedSources',latest_sources,'pendingSetup',(select jsonb_build_object('submissionId',s.id,'configuration',s.configuration,'sourceReviews',s.source_reviews,'submittedBy',s.submitted_by,'submittedAt',s.submitted_at,'sourceManifestFingerprint',s.source_manifest_fingerprint) from private.institutional_model_setup_submissions s where s.organization_id=j.organization_id and s.capital_project_id=project_id and s.intake_session_id=j.intake_session_id and s.id=nullif(j.payload->>'message_id','')::uuid and j.kind='agent_operation_brief'));
end $function$
