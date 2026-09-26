CREATE OR REPLACE FUNCTION private.merge_dependency_update_request_v1(p_org uuid, p_work uuid, p_event uuid, p_executions uuid[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e private.domain_events;r public.work_continuation_requests;events jsonb;versions jsonb;affected jsonb;details jsonb;body jsonb;created uuid;
begin
 select * into strict e from private.domain_events where organization_id=p_org and id=p_event;
 if coalesce(cardinality(p_executions),0)=0 then return 'unaffected'; end if;
 if exists(select 1 from unnest(p_executions) x where not exists(select 1 from public.work_executions w where w.organization_id=p_org and w.id=x and w.work_id=p_work) and not exists(select 1 from private.institutional_model_results ir where ir.organization_id=p_org and ir.id=x and ir.capital_project_id=p_work)) then
  raise exception 'dependency_update_work_mismatch' using errcode='23514';
 end if;
 -- Two changes to the same work serialize here and end in one open request.
 perform pg_advisory_xact_lock(hashtextextended('work-continuation:'||p_org::text||':'||p_work::text,0));
 if exists(select 1 from public.work_continuation_requests x where x.organization_id=p_org and x.work_id=p_work and x.kind='dependency_update'
  and x.payload->'events' @> jsonb_build_array(jsonb_build_object('eventId',e.id))) then return 'duplicate'; end if;
 select * into r from public.work_continuation_requests x where x.organization_id=p_org and x.work_id=p_work and x.kind='dependency_update' and x.status='open' for update;
 select jsonb_agg(x.value order by x.value->>'aggregateKind' collate "C",x.value->>'aggregateId' collate "C",(x.value->>'aggregateVersion')::bigint,x.value->>'eventId' collate "C")
 into events from jsonb_array_elements(coalesce(r.payload->'events','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
  'eventId',e.id,'aggregateKind',e.aggregate_kind,'aggregateId',e.aggregate_id,'aggregateVersion',e.aggregate_version))) x;
 select jsonb_agg(jsonb_build_object('aggregateKind',v.kind,'aggregateId',v.aggregate,'version',v.version) order by v.kind collate "C",v.aggregate collate "C") into versions
 from (select x.value->>'aggregateKind' as kind,x.value->>'aggregateId' as aggregate,max((x.value->>'aggregateVersion')::bigint) as version
  from jsonb_array_elements(events) x group by 1,2) v;
 select jsonb_agg(to_jsonb(q.id) order by q.id collate "C") into affected from (
  select a.value#>>'{}' as id from jsonb_array_elements(coalesce(r.payload->'affectedExecutionIds','[]'::jsonb)) a
  union select x::text from unnest(p_executions) x) q;
 body:=jsonb_build_object('schemaVersion','dependency-update-request.v1','workId',p_work,'status','open',
  'affectedExecutionIds',affected,'events',events,'aggregateVersions',versions);
 select jsonb_agg(jsonb_build_object('executionId',q.id,'rootExecutionId',coalesce((select l.root_execution_id::text from private.execution_lineage l where l.organization_id=p_org and l.execution_id=q.id::uuid),q.id),'resultMilestoneId',(
  select m.id from public.work_milestones m where m.organization_id=p_org and m.kind='execution_result' and m.subject_kind='work_execution' and m.subject_id=q.id::uuid))||private.institutional_dependent_detail_v1(p_org,q.id::uuid)
  order by q.id collate "C") into details
 from (select a.value#>>'{}' as id from jsonb_array_elements(affected) a) q;
 if r.id is null then
  insert into public.work_continuation_requests(organization_id,work_id,kind,status,payload,payload_fingerprint,affected_executions)
  values(p_org,p_work,'dependency_update','open',body,private.continuation_fingerprint_v1(body),details) returning id into created;
  insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,occurred_at)
  select x.organization_id,x.work_id,'continuation_proposed','work_continuation_request',x.id,'dependency_update',x.created_at
  from public.work_continuation_requests x where x.organization_id=p_org and x.id=created
  on conflict on constraint work_milestones_subject_key do nothing;
  return 'opened';
 end if;
 update public.work_continuation_requests set payload=body,payload_fingerprint=private.continuation_fingerprint_v1(body),affected_executions=details,revision=revision+1
 where organization_id=p_org and id=r.id;
 return 'merged';
end $function$
