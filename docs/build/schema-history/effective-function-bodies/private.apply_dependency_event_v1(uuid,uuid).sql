CREATE OR REPLACE FUNCTION private.apply_dependency_event_v1(p_org uuid, p_event uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e private.domain_events;institutional_work uuid;institutional_facts bigint:=0;src uuid;target_set uuid;slot text;method text;rebuilt bigint;facts bigint;w record;outcome text;opened integer:=0;merged integer:=0;
begin
 select * into e from private.domain_events where organization_id=p_org and id=p_event;
 if not found then raise exception 'dependency_event_missing' using errcode='P0002'; end if;
 if e.effect<>'propagate_dependencies' then return jsonb_build_object('applied',false); end if;
 if e.aggregate_kind='source_version' then src:=e.aggregate_id;
 elsif e.aggregate_kind='assumption_version' then select v.set_id into target_set from public.assumption_versions v where v.organization_id=p_org and v.id=e.aggregate_id;
 elsif e.aggregate_kind='adoption_decision' then select a.set_id,a.slot_key into target_set,slot from public.adoption_decisions a where a.organization_id=p_org and a.id=e.aggregate_id;
 elsif e.aggregate_kind='method_release' then method:=e.protected_state->>'methodId';
 elsif e.aggregate_kind='institutional_configuration' then institutional_work:=e.aggregate_id;
 end if;
 if src is null and target_set is null and method is null and institutional_work is null then raise exception 'dependency_event_subject_missing' using errcode='P0002'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('dependency-recompute-holds:'||p_org::text,0));
 rebuilt:=private.rebuild_incomplete_execution_dependencies_v1(p_org);
 with written as (
  insert into private.execution_invalidations(organization_id,work_id,execution_id,event_id,dependency_kind,logical_key,reason_class,gap,pinned,head,via_source_version_ids)
  select p_org,i.work_id,i.execution_id,e.id,i.dependency_kind,i.logical_key,i.reason_class,i.gap,i.pinned,i.head,i.via
  from private.dependency_event_impact_v1(p_org,src,target_set,slot,method) i
  order by i.execution_id,i.dependency_kind,i.logical_key
  on conflict on constraint execution_invalidations_event_key do nothing returning 1)
 select count(*) into facts from written;
 perform private.rebuild_incomplete_institutional_dependencies_v1(p_org);
 with written as (
  insert into private.institutional_result_invalidations(organization_id,work_id,result_id,event_id,dependency_kind,logical_key,reason_class,gap,pinned,head,via_source_version_ids)
  select p_org,i.work_id,i.result_id,e.id,i.dependency_kind,i.logical_key,i.reason_class,i.gap,i.pinned,i.head,i.via
  from private.institutional_dependency_impact_v1(p_org,src,institutional_work) i
  order by i.result_id,i.dependency_kind,i.logical_key
  on conflict on constraint institutional_result_invalidations_event_key do nothing returning 1)
 select count(*) into institutional_facts from written;
 for w in select x.work_id,array_agg(distinct x.dependent_id) as executions from (
  select f.work_id,f.execution_id as dependent_id from private.execution_invalidations f where f.organization_id=p_org and f.event_id=e.id
  union all
  select f.work_id,f.result_id from private.institutional_result_invalidations f where f.organization_id=p_org and f.event_id=e.id) x
  group by x.work_id order by x.work_id loop
  outcome:=private.merge_dependency_update_request_v1(p_org,w.work_id,e.id,w.executions);
  if outcome='opened' then opened:=opened+1; elsif outcome='merged' then merged:=merged+1; end if;
 end loop;
 return jsonb_build_object('applied',true,'rebuilt',rebuilt,'facts',facts,'institutionalFacts',institutional_facts,'opened',opened,'merged',merged,'planned',private.plan_open_dependency_requests_v1(p_org));
end $function$
