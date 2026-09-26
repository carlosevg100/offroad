CREATE OR REPLACE FUNCTION private.plan_dependency_recompute_v1(p_org uuid, p_work uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.work_continuation_requests;institutional jsonb;lineages jsonb;touched uuid[];produced text[];current_holds jsonb:='[]';hold_list jsonb;covered uuid[];covering uuid;
 c record;g record;created uuid;prior_wait uuid;q record;superseded integer:=0;scheduled integer:=0;waiting integer:=0;held integer:=0;released integer:=0;
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('dependency-recompute-holds:'||p_org::text,0));
 perform pg_advisory_xact_lock(hashtextextended('work-continuation:'||p_org::text||':'||p_work::text,0));
 select * into r from public.work_continuation_requests x where x.organization_id=p_org and x.work_id=p_work and x.kind='dependency_update' and x.status='open' for update;
 if r.id is null then return jsonb_build_object('workId',p_work,'planned',false); end if;
 perform private.rebuild_incomplete_execution_dependencies_v1(p_org);
 institutional:=private.plan_institutional_recompute_v1(p_org,p_work,r.id);

 -- Every lineage of the work with a live execution, judged by its representative against the current heads.
 select coalesce(jsonb_agg(jsonb_build_object('root',x.root,'representative',x.representative,'executions',to_jsonb(x.executions),
   'assessment',private.execution_recompute_assessment_v1(p_org,x.representative)) order by x.root),'[]'::jsonb) into lineages
 from (select l.root,private.dependency_lineage_representative_v1(p_org,l.root) as representative,array_agg(l.id order by l.id) as executions
  from (select e.id,coalesce((select y.root_execution_id from private.execution_lineage y where y.organization_id=e.organization_id and y.execution_id=e.id),e.id) as root
   from public.work_executions e where e.organization_id=p_org and e.work_id=p_work and private.execution_is_live_v1(p_org,e.id)) l
  group by l.root) x;
 produced:=array(select x.value#>>'{assessment,key}' from jsonb_array_elements(lineages) x where x.value#>>'{assessment,status}'='affected');

 -- Open candidates the current heads no longer produce are superseded, except one whose execution
 -- already pins the current heads: it is the up-to-date representative of its lineage.
 for c in select x.id from public.work_recompute_candidates x where x.organization_id=p_org and x.work_id=p_work
  and x.state in ('scheduled','awaiting_authorization') and not (x.idempotency_key=any(produced))
  and not exists(select 1 from jsonb_array_elements(lineages) l where l.value->>'representative'=x.execution_id::text and l.value#>>'{assessment,status}'='unaffected')
  order by x.created_at,x.id for update loop
  update public.work_recompute_candidates set state='declined',reason='superseded',revision=revision+1 where organization_id=p_org and id=c.id;
  superseded:=superseded+1;
 end loop;

 -- The open request plans the lineages of its live affected executions: reused when the
 -- representative pins the current heads, held while something named holds it, otherwise one
 -- candidate per key. A key already recorded, in any state and for any request, is not recorded again.
 touched:=array(select distinct coalesce((select y.root_execution_id from private.execution_lineage y where y.organization_id=p_org and y.execution_id=a.id::uuid),a.id::uuid)
  from jsonb_array_elements_text(r.payload->'affectedExecutionIds') a(id) where private.execution_is_live_v1(p_org,a.id::uuid));
 for g in select (x.value->>'root')::uuid as root,(x.value->>'representative')::uuid as representative,x.value->'assessment' as a,x.value->'executions' as executions
  from jsonb_array_elements(lineages) x where (x.value->>'root')::uuid=any(touched) order by x.value->>'root' loop
  hold_list:=case g.a->>'status'
   when 'affected' then g.a->'holds'
   -- An incomplete graph holds too, named by its gap; the projection was rebuilt above.
   when 'graph_incomplete' then (select coalesce(jsonb_agg(jsonb_build_object('kind','graph_incomplete',
     'signal',case when gap.value->>'code'='no_recorded_edges' then 'execution_dependencies:'||g.representative::text
      when gap.value->>'key' like '["source\_version",%' then 'source_version:'||((gap.value->>'key')::jsonb->>1)
      when gap.value->>'key' like '["assumption\_slot",%' then 'assumption_version:'||((gap.value->>'key')::jsonb->>1)
      else 'method_release:'||((gap.value->>'key')::jsonb->>1) end,
     'subject',gap.value) order by gap.ordinality),'[]'::jsonb) from jsonb_array_elements(g.a->'gaps') with ordinality gap)
   else '[]'::jsonb end;
  current_holds:=current_holds||(select coalesce(jsonb_agg(h.value||jsonb_build_object('executionId',g.representative) order by h.ordinality),'[]'::jsonb)
   from jsonb_array_elements(hold_list) with ordinality h);
  if g.a->>'status'<>'affected' or jsonb_array_length(hold_list)>0 then continue; end if;
  if exists(select 1 from public.work_recompute_candidates x where x.organization_id=p_org and x.work_id=p_work and x.idempotency_key=g.a->>'key') then continue; end if;
  covered:=array(select distinct z.id::uuid from (select a.id from jsonb_array_elements_text(r.payload->'affectedExecutionIds') a(id)
    where a.id in (select jsonb_array_elements_text(g.executions)) union select g.representative::text) z order by 1);
  created:=gen_random_uuid();
  insert into public.work_recompute_candidates(id,organization_id,work_id,request_id,idempotency_key,base_execution_id,new_input_fingerprint,head_inputs,
   action,max_cost_microusd,max_model_calls,execution_ids,state)
  values(created,p_org,p_work,r.id,g.a->>'key',g.root,g.a->>'currentFingerprint',g.a->'currentInputs',
   case when (g.a#>>'{spend,maxCostMicrousd}')::bigint>0 or (g.a#>>'{spend,maxModelCalls}')::bigint>0 then 'await_authorization' else 'recompute' end,
   (g.a#>>'{spend,maxCostMicrousd}')::bigint,(g.a#>>'{spend,maxModelCalls}')::bigint,covered,
   case when (g.a#>>'{spend,maxCostMicrousd}')::bigint>0 or (g.a#>>'{spend,maxModelCalls}')::bigint>0 then 'awaiting_authorization' else 'scheduled' end);
  if (g.a#>>'{spend,maxCostMicrousd}')::bigint>0 or (g.a#>>'{spend,maxModelCalls}')::bigint>0 then
   -- A persisted wait: an awaiting_human milestone of the candidate, no job and no lease. It closes
   -- the wait of the same lineage whose candidate newer heads superseded.
   prior_wait:=null;
   select m.id into prior_wait from public.work_recompute_candidates x join public.work_milestones m on m.organization_id=x.organization_id
    and m.kind='awaiting_human' and m.subject_kind='work_recompute_candidate' and m.subject_id=x.id
    where x.organization_id=p_org and x.work_id=p_work and x.base_execution_id=g.root and x.state='declined' and x.reason='superseded'
    and not exists(select 1 from public.work_milestones n where n.organization_id=m.organization_id and n.work_id=m.work_id and n.supersedes_milestone_id=m.id)
    order by m.occurred_at desc,m.created_at desc,m.id desc limit 1;
   insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,supersedes_milestone_id,occurred_at)
   values(p_org,p_work,'awaiting_human','work_recompute_candidate',created,'dependency_recompute_authorization',prior_wait,clock_timestamp());
   waiting:=waiting+1;
  else
   scheduled:=scheduled+1;
  end if;
 end loop;

 -- Holds of the open request: new ones recorded with their signal, the ones no longer found released.
 insert into private.dependency_recompute_holds(organization_id,work_id,request_id,execution_id,hold_kind,signal,subject)
 select distinct on (x.execution_id,x.kind,x.signal) p_org,p_work,r.id,x.execution_id,x.kind,x.signal,x.subject
 from (select (h.value->>'executionId')::uuid as execution_id,h.value->>'kind' as kind,h.value->>'signal' as signal,h.value->'subject' as subject
  from jsonb_array_elements(current_holds) h) x
 where not exists(select 1 from private.dependency_recompute_holds o where o.organization_id=p_org and o.request_id=r.id
  and o.execution_id=x.execution_id and o.hold_kind=x.kind and o.signal=x.signal and o.released_at is null)
 order by x.execution_id,x.kind,x.signal,x.subject::text;
 get diagnostics held=row_count;
 update private.dependency_recompute_holds o set released_at=clock_timestamp()
 where o.organization_id=p_org and o.request_id=r.id and o.released_at is null and not exists(select 1 from jsonb_array_elements(current_holds) h
  where (h.value->>'executionId')::uuid=o.execution_id and h.value->>'kind'=o.hold_kind and h.value->>'signal'=o.signal);
 get diagnostics released=row_count;

 -- An open request that plans nothing of its own and holds nothing only repeats changes earlier
 -- requests already cover: it is superseded by the newest request whose candidate covers the
 -- current key of a lineage it touches, or produced the representative that is already up to date.
 if not exists(select 1 from public.work_recompute_candidates x where x.organization_id=p_org and x.work_id=p_work and x.request_id=r.id)
 and not exists(select 1 from private.dependency_recompute_holds h where h.organization_id=p_org and h.request_id=r.id and h.released_at is null)
 and not exists(select 1 from public.institutional_recompute_candidates x where x.organization_id=p_org and x.work_id=p_work and x.request_id=r.id)
 and not exists(select 1 from private.institutional_recompute_holds h where h.organization_id=p_org and h.request_id=r.id and h.released_at is null) then
  select x.request_id into covering from public.work_recompute_candidates x join jsonb_array_elements(lineages) l on (l.value->>'root')::uuid=any(touched)
   and ((l.value#>>'{assessment,status}'='affected' and x.idempotency_key=l.value#>>'{assessment,key}')
    or (l.value#>>'{assessment,status}'='unaffected' and x.execution_id=(l.value->>'representative')::uuid))
  where x.organization_id=p_org and x.work_id=p_work and x.request_id<>r.id
  order by x.created_at desc,x.id desc limit 1;
  if covering is null then covering:=(institutional->>'coveringRequestId')::uuid;
  elsif institutional->>'coveringRequestId' is not null then
   select newest.id into covering from public.work_continuation_requests newest where newest.organization_id=p_org and newest.id in (covering,(institutional->>'coveringRequestId')::uuid)
   order by newest.created_at desc,newest.id desc limit 1;
  end if;
  if covering is not null then
   update public.work_continuation_requests set status='superseded',superseded_by_request_id=covering,revision=revision+1 where organization_id=p_org and id=r.id;
  end if;
 end if;

 -- Every request of the work that is still moving takes the status its candidates give it.
 for q in select x.id from public.work_continuation_requests x where x.organization_id=p_org and x.work_id=p_work and x.kind='dependency_update'
  and x.status in ('open','awaiting_authorization','scheduled') order by x.created_at,x.id loop
  perform private.advance_dependency_update_request_v1(p_org,q.id,r.id);
 end loop;
 return jsonb_build_object('workId',p_work,'planned',true,'requestId',r.id,'scheduled',scheduled,'awaitingAuthorization',waiting,'superseded',superseded,'held',held,'released',released,'institutional',institutional);
end $function$
