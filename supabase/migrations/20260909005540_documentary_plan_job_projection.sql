-- Public display projection only; does not grant execution or expose internal snapshots.
create function private.read_documentary_plan_job_v1(p_project_id uuid,p_execution_brief_id uuid)
returns text language sql stable security definer set search_path='' as $$
 select split_part(b.internal_snapshot->>'planVersion',':',2)
 from public.capital_project_execution_briefs b
 join public.capital_project_plans p on p.organization_id=b.organization_id and p.id=b.plan_id and p.capital_project_id=b.capital_project_id
 join public.capital_project_execution_brief_dispatches d on d.organization_id=b.organization_id and d.execution_brief_id=b.id and d.plan_id=p.id
 where b.id=p_execution_brief_id and b.capital_project_id=p_project_id and auth.uid() is not null
   and private.can_access_capital_project(b.organization_id,b.capital_project_id)
   and private.execution_dispatch_is_current(d.processing_job_id,false)
   and b.internal_snapshot->>'planVersion' like 'document-work-plan.v1:%'
   and split_part(b.internal_snapshot->>'planVersion',':',2) in ('comparison','meeting','review')
   and (select array_agg(t.value order by t.value)
      from jsonb_array_elements(case when jsonb_typeof(b.internal_snapshot->'workstreams')='array' then b.internal_snapshot->'workstreams' else '[]'::jsonb end) w(value)
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(w.value->'sourceTaskIds')='array' then w.value->'sourceTaskIds' else '[]'::jsonb end) t(value))=array['Q01','Q02','Q03']::text[]
   and (select array_agg(t.value->>'id' order by t.value->>'id') from jsonb_array_elements(case when jsonb_typeof(p.snapshot->'taskSpecs')='array' then p.snapshot->'taskSpecs' else '[]'::jsonb end) t(value))=array['Q01','Q02','Q03']::text[]
   and p.target_task_ids=array['Q03']::text[]
   and (select array_agg(t.task_id order by t.task_id) from public.capital_project_plan_tasks t where t.organization_id=p.organization_id and t.capital_project_id=p.capital_project_id and t.plan_id=p.id)=array['Q01','Q02','Q03']::text[];
$$;
create function public.read_documentary_plan_job_v1(p_project_id uuid,p_execution_brief_id uuid)
returns text language sql stable security invoker set search_path='' as $$
 select private.read_documentary_plan_job_v1(p_project_id,p_execution_brief_id);
$$;
revoke all on function private.read_documentary_plan_job_v1(uuid,uuid),public.read_documentary_plan_job_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function private.read_documentary_plan_job_v1(uuid,uuid),public.read_documentary_plan_job_v1(uuid,uuid) to authenticated;
