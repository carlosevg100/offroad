CREATE OR REPLACE FUNCTION private.read_capital_project_execution_brief_progress_v1(p_execution_brief_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare base jsonb; d public.capital_project_execution_brief_dispatches; j public.processing_jobs; stages jsonb; progress jsonb;
begin
 base:=private.read_execution_brief_progress_before_documentary(p_execution_brief_id);
 select * into d from public.capital_project_execution_brief_dispatches where execution_brief_id=p_execution_brief_id;
 if not found or not exists (
    select 1 from public.capital_project_plans p join public.capital_project_execution_briefs b
      on b.organization_id=p.organization_id and b.plan_id=p.id
    where p.organization_id=d.organization_id and p.id=d.plan_id and b.id=p_execution_brief_id
      and private.is_released_documentary_plan_v1(p.snapshot,p.entry_job)
      and p.target_task_ids = array(select jsonb_array_elements_text(p.snapshot#>'{job,targetTaskIds}'))
      and (select array_agg(t.task_id order by t.task_id) from public.capital_project_plan_tasks t
        where t.organization_id=p.organization_id and t.plan_id=p.id) = array['Q01','Q02','Q03']::text[]
      and b.internal_snapshot->>'planVersion' like 'document-work-plan.v1:%'
  ) then return base; end if;
 select * into j from public.processing_jobs where organization_id=d.organization_id and id=d.processing_job_id;
 select r.stages into stages from public.processing_runs r where r.organization_id=j.organization_id and r.id=j.processing_run_id;
 with work as (
   select w.value,w.ordinality,task.task_id
   from public.capital_project_execution_briefs b,
   lateral jsonb_array_elements(b.internal_snapshot->'workstreams') with ordinality w(value,ordinality),
   lateral jsonb_array_elements_text(w.value->'sourceTaskIds') task(task_id)
   where b.organization_id=d.organization_id and b.id=p_execution_brief_id
 ), states as (
   select work.*,latest.status,
     latest.status='succeeded' and (work.task_id<>'Q03' or j.status='succeeded') as done
   from work left join lateral (
     select event.value->>'status' as status from jsonb_array_elements(coalesce(stages,'[]'::jsonb)) with ordinality event(value,ordinality)
     where event.value->>'job_id'=j.id::text and event.value->>'stage'='documentary_'||work.task_id
       and event.value#>>'{detail,attempt}'=j.attempts::text
     order by event.ordinality desc limit 1
   ) latest on true
 )
 select jsonb_agg(jsonb_build_object('position',ordinality-1,'label',value->>'label','total',1,
   'completed',case when done then 1 else 0 end,
   'status',case when done then 'completed'
     when j.status in ('failed','poison','cancelled') or status='failed' then 'needs_attention'
     when status in ('started','succeeded') then 'running'
     when j.status='queued' then 'queued' else 'waiting' end) order by ordinality)
 into progress from states;
 return jsonb_set(base,'{workstreams}',coalesce(progress,'[]'::jsonb));
end $function$
