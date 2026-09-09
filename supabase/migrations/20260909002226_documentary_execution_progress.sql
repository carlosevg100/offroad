-- Preserve the original membership and plan-shape checks for every reader.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.read_capital_project_execution_brief_progress_v1(uuid)'::regprocedure);
 execute replace(definition,'FUNCTION private.read_capital_project_execution_brief_progress_v1(', 'FUNCTION private.read_execution_brief_progress_before_documentary(');
end $$;
revoke all on function private.read_execution_brief_progress_before_documentary(uuid) from public,anon,authenticated;

create or replace function private.read_capital_project_execution_brief_progress_v1(p_execution_brief_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare base jsonb; d public.capital_project_execution_brief_dispatches; j public.processing_jobs; stages jsonb; progress jsonb;
begin
 base:=private.read_execution_brief_progress_before_documentary(p_execution_brief_id);
 select * into d from public.capital_project_execution_brief_dispatches where execution_brief_id=p_execution_brief_id;
 if not found or private.document_work_request_binding_v1(d.processing_job_id)->>'executionScope' is distinct from 'documentary_only' then return base; end if;
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
end $$;
revoke all on function private.read_capital_project_execution_brief_progress_v1(uuid) from public,anon,authenticated;
grant execute on function private.read_capital_project_execution_brief_progress_v1(uuid) to authenticated;
