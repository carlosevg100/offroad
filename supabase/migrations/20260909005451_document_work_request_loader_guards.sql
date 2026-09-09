-- Scope is derived only from the exact accepted documentary task plan, never request wording.
create or replace function private.document_work_request_binding_v1(p_job_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('projectId',d.capital_project_id,'jobId',j.id,
   'briefId',b.id,'planId',d.plan_id,'version',b.brief_version,
   'objective',b.objective,'proposedDeliverable',b.proposed_deliverable,
   'inputFingerprint',d.input_fingerprint,'requestFingerprint',b.brief_fingerprint)
 || case when b.internal_snapshot->>'planVersion' like 'document-work-plan.v1:%'
   and (select array_agg(t.value order by t.value)
        from jsonb_array_elements(case when jsonb_typeof(b.internal_snapshot->'workstreams')='array' then b.internal_snapshot->'workstreams' else '[]'::jsonb end) w(value)
        cross join lateral jsonb_array_elements_text(case when jsonb_typeof(w.value->'sourceTaskIds')='array' then w.value->'sourceTaskIds' else '[]'::jsonb end) t(value)) = array['Q01','Q02','Q03']::text[]
   and (select array_agg(t.value->>'id' order by t.value->>'id') from jsonb_array_elements(case when jsonb_typeof(p.snapshot->'taskSpecs')='array' then p.snapshot->'taskSpecs' else '[]'::jsonb end) t(value)) = array['Q01','Q02','Q03']::text[]
   and p.target_task_ids = array['Q03']::text[]
   and (select array_agg(task.task_id order by task.task_id) from public.capital_project_plan_tasks task
        where task.organization_id=p.organization_id and task.capital_project_id=p.capital_project_id and task.plan_id=p.id) = array['Q01','Q02','Q03']::text[]
   then jsonb_build_object('executionScope','documentary_only') else '{}'::jsonb end
 from public.processing_jobs j
 join public.document_intake_sessions s on s.organization_id=j.organization_id and s.id=j.intake_session_id
 join public.capital_project_execution_brief_dispatches d on d.organization_id=j.organization_id and d.processing_job_id=j.id and d.capital_project_id=s.capital_project_id
 join public.capital_project_execution_briefs b on b.organization_id=d.organization_id and b.id=d.execution_brief_id and b.capital_project_id=d.capital_project_id and b.plan_id=d.plan_id
 join public.capital_project_plans p on p.organization_id=d.organization_id and p.id=d.plan_id and p.capital_project_id=d.capital_project_id
 where j.id=p_job_id and j.kind='case_analysis' and s.current_run_id=j.processing_run_id
   and private.execution_dispatch_is_current(j.id,true);
$$;

-- PostgREST must not put this capability reader in a read-only transaction:
-- job_for_capability intentionally locks the current accepted job and session.
alter function public.worker_load_document_work_request_v1(uuid,text) volatile;
alter function private.worker_load_document_work_request_v1(uuid,text) volatile;
