CREATE OR REPLACE FUNCTION private.job_authority_is_current_v1(p_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when exists(select 1 from public.processing_jobs j where j.id=p_job_id and j.kind='governed_evaluation')
 then exists(select 1 from public.processing_jobs j
 join private.governed_evaluations e on e.organization_id=j.organization_id and e.id=j.evaluation_id and e.processing_run_id=j.processing_run_id
 join private.platform_evaluation_organizations o on o.organization_id=e.organization_id
 join public.processing_runs r on r.organization_id=e.organization_id and r.id=e.processing_run_id
 where j.id=p_job_id and j.work_id is null and j.intake_session_id is null
 and r.pipeline_version='governed-evaluation-v1' and r.created_by=e.requested_by_user_id
 and private.platform_evaluator_live_v1(e.requested_by_user_id))
 else exists(select 1 from public.processing_jobs j join private.authorization_revisions r
 on r.organization_id=j.organization_id and r.resource_id=j.authorization_resource_id and r.subject_user_id=j.authorization_subject_id
 where j.id=p_job_id and private.job_sources_rights_current_v1(j.id)
 and private.resource_access_as_subject_v1(j.organization_id,(case when j.kind in ('work_conversation','work_execution') then j.work_id else j.intake_session_id end),j.authorization_subject_id,'read')
 and not exists(select 1 from private.access_resources ar where ar.organization_id=j.organization_id and ar.id in(j.authorization_resource_id,(case when j.kind in ('work_conversation','work_execution') then j.work_id else j.intake_session_id end)) and not('analysis'=any(ar.allowed_purposes)))
 and not exists(select 1 from private.principals dp where dp.organization_id=j.organization_id and dp.processing_job_id=j.id and dp.revoked_at is not null)
 and (j.status<>'leased' or j.lease_expires_at<=now() or exists(select 1 from private.principals dp where dp.organization_id=j.organization_id and dp.processing_job_id=j.id and dp.kind='worker' and dp.account_user_id=j.leased_account_user_id and dp.worker_token_id=j.leased_by and dp.resource_id=j.authorization_resource_id and dp.expires_at>now())) and j.authorization_revision=r.revision
 and j.authorization_resource_id=private.resource_root_v1(j.organization_id,(case when j.kind in ('work_conversation','work_execution') then j.work_id else j.intake_session_id end))
 and (private.resource_access_as_subject_v1(j.organization_id,(case when j.kind in ('work_conversation','work_execution') then j.work_id else j.intake_session_id end),j.authorization_subject_id,'work') or (j.kind='agent_operation_brief' and j.review_execution_authorization_id::text=j.payload->>'message_id' and private.review_execution_authority_current_v1(j.review_execution_authorization_id,j.authorization_resource_id,j.authorization_subject_id))))
 end;
$function$
