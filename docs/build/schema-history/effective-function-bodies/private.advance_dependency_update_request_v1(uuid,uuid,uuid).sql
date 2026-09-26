CREATE OR REPLACE FUNCTION private.advance_dependency_update_request_v1(p_org uuid, p_request uuid, p_newer uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.work_continuation_requests;n record;target text;begin
 select * into r from public.work_continuation_requests where organization_id=p_org and id=p_request for update;
 if r.id is null or r.status not in ('open','awaiting_authorization','scheduled') then return r.status; end if;
 select count(*) as total,count(*) filter(where state='awaiting_authorization') as awaiting,count(*) filter(where state='scheduled') as scheduled,
  count(*) filter(where state='settled') as settled,count(*) filter(where state='declined' and reason<>'superseded') as declined,
  count(*) filter(where state='failed') as failed,count(*) filter(where state='declined' and reason='superseded') as superseded
 into n from (select state,reason from public.work_recompute_candidates where organization_id=p_org and work_id=r.work_id and request_id=r.id
  union all select state,reason from public.institutional_recompute_candidates where organization_id=p_org and work_id=r.work_id and request_id=r.id) candidates;
 if n.total=0 then return r.status; end if;
 if r.status='open' and exists(select 1 from private.dependency_recompute_holds h where h.organization_id=p_org and h.request_id=r.id and h.released_at is null)
 or r.status='open' and exists(select 1 from private.institutional_recompute_holds i where i.organization_id=p_org and i.request_id=r.id and i.released_at is null) then return r.status; end if;
 target:=case when n.awaiting>0 then 'awaiting_authorization' when n.scheduled>0 then 'scheduled' when n.superseded=n.total then 'superseded'
  when n.settled>0 then 'ready' else 'declined' end;
 if target='superseded' then
  if p_newer is null or p_newer=r.id or not exists(select 1 from public.work_continuation_requests x where x.organization_id=p_org and x.work_id=r.work_id and x.id=p_newer) then
   return r.status;
  end if;
 end if;
 if target=r.status then return r.status; end if;
 if r.status='awaiting_authorization' and target='ready' then
  update public.work_continuation_requests set status='scheduled',revision=revision+1 where organization_id=p_org and id=r.id returning * into r;
 end if;
 if not private.work_continuation_transition_allowed_v1(r.status,target) then return r.status; end if;
 update public.work_continuation_requests set status=target,superseded_by_request_id=case when target='superseded' then p_newer end,revision=revision+1
 where organization_id=p_org and id=r.id;
 return target;
end $function$
