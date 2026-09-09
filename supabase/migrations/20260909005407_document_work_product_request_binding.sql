-- Read-only bindings: no new work type, authorization, budget or external effect.
-- Internal helper is not granted; callers independently verify worker capability or membership.
create function private.document_work_request_binding_v1(p_job_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('projectId',d.capital_project_id,'jobId',j.id,
   'briefId',b.id,'planId',d.plan_id,'version',b.brief_version,
   'objective',b.objective,'proposedDeliverable',b.proposed_deliverable,
   'inputFingerprint',d.input_fingerprint,'requestFingerprint',b.brief_fingerprint)
 from public.processing_jobs j
 join public.document_intake_sessions s on s.organization_id=j.organization_id and s.id=j.intake_session_id
 join public.capital_project_execution_brief_dispatches d on d.organization_id=j.organization_id and d.processing_job_id=j.id and d.capital_project_id=s.capital_project_id
 join public.capital_project_execution_briefs b on b.organization_id=d.organization_id and b.id=d.execution_brief_id and b.capital_project_id=d.capital_project_id and b.plan_id=d.plan_id
 where j.id=p_job_id and j.kind='case_analysis' and s.current_run_id=j.processing_run_id
   and private.execution_dispatch_is_current(j.id,true);
$$;
revoke all on function private.document_work_request_binding_v1(uuid) from public,anon,authenticated;

create function private.worker_load_document_work_request_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
begin
 if j.kind<>'case_analysis' then raise exception 'document_work_request_capability_required' using errcode='42501'; end if;
 return private.document_work_request_binding_v1(j.id);
end;
$$;
create function public.worker_load_document_work_request_v1(p_job_id uuid,p_capability_token text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.worker_load_document_work_request_v1(p_job_id,p_capability_token);
$$;
revoke all on function private.worker_load_document_work_request_v1(uuid,text), public.worker_load_document_work_request_v1(uuid,text) from public,anon,authenticated;
grant execute on function private.worker_load_document_work_request_v1(uuid,text), public.worker_load_document_work_request_v1(uuid,text) to authenticated;

create function private.read_advisor_document_work_binding_v1(p_project_id uuid,p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists (
  select 1 from public.processing_jobs j
  join public.document_intake_sessions s on s.organization_id=j.organization_id and s.id=j.intake_session_id
  where j.id=p_job_id and j.kind='case_analysis' and j.status='succeeded'
   and s.capital_project_id=p_project_id and s.current_run_id=j.processing_run_id
   and private.can_access_capital_project(j.organization_id,p_project_id)
 ) then return null; end if;
 return private.document_work_request_binding_v1(p_job_id);
end;
$$;
create function public.read_advisor_document_work_binding_v1(p_project_id uuid,p_job_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.read_advisor_document_work_binding_v1(p_project_id,p_job_id);
$$;
revoke all on function private.read_advisor_document_work_binding_v1(uuid,uuid), public.read_advisor_document_work_binding_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function private.read_advisor_document_work_binding_v1(uuid,uuid), public.read_advisor_document_work_binding_v1(uuid,uuid) to authenticated;
