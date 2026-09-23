CREATE OR REPLACE FUNCTION private.promote_contribution_to_work_v1(p_revision_id uuid, p_promotion_id uuid, p_expected_shared_revision_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.contribution_revisions; c public.work_contributions; shared public.work_contributions; existing public.contribution_revisions; base public.contribution_revisions; channel uuid; next_revision integer; reader uuid; fingerprint text; begin
 select * into r from public.contribution_revisions where id=p_revision_id;
 if not found or r.author_user_id is distinct from auth.uid() then raise exception 'contribution_promotion_denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||r.organization_id::text,0));
 perform private.require_resource_access_v1(r.work_id,'work');
 if not exists(select 1 from public.capital_projects where organization_id=r.organization_id and id=r.work_id and status<>'archived') then raise exception 'work_archived' using errcode='55000';end if;
 if not private.can_read_contribution_revision_v1(r.organization_id,r.id) then raise exception 'contribution_promotion_denied' using errcode='42501'; end if;
 select * into strict c from public.work_contributions where organization_id=r.organization_id and id=r.contribution_id;
 if not exists(select 1 from public.work_channels where id=c.channel_id and kind='personal' and owner_user_id=auth.uid()) then raise exception 'contribution_promotion_denied' using errcode='42501'; end if;
 if p_promotion_id is null then raise exception 'invalid_contribution_promotion' using errcode='22023'; end if;
 fingerprint:=encode(extensions.digest(jsonb_build_array(r.id,p_expected_shared_revision_id)::text,'sha256'),'hex');
 select * into existing from public.contribution_revisions where id=p_promotion_id or (organization_id=r.organization_id and promoted_from_revision_id=r.id) order by (id=p_promotion_id) desc limit 1;
 if found then
  if existing.organization_id<>r.organization_id or existing.promoted_from_revision_id is distinct from r.id or existing.recorded_by<>auth.uid()
  or not private.can_read_contribution_revision_v1(r.organization_id,existing.id) then raise exception 'contribution_promotion_denied' using errcode='42501'; end if;
  if existing.request_fingerprint<>fingerprint then raise exception 'contribution_replay_conflict' using errcode='22023'; end if;
  return jsonb_build_object('contributionId',existing.contribution_id,'revisionId',existing.id,'status','shared','replayed',true);
 end if;
 -- Publication is bounded by the actual current audience, including group grants.
 for reader in select m.user_id from public.organization_memberships m where m.organization_id=r.organization_id and m.status='active'
 and private.resource_access_as_subject_v1(r.organization_id,r.work_id,m.user_id,'read') loop
  if not private.contribution_sources_allowed_v1(r.organization_id,r.id,reader) then raise exception 'contribution_audience_denied' using errcode='42501'; end if;
 end loop;
 if p_expected_shared_revision_id is not null then
  select * into base from public.contribution_revisions where id=p_expected_shared_revision_id and organization_id=r.organization_id and work_id=r.work_id;
  if not found or not private.can_read_contribution_revision_v1(r.organization_id,base.id) then raise exception 'contribution_base_denied' using errcode='42501'; end if;
  select * into shared from public.work_contributions where id=base.contribution_id and organization_id=r.organization_id for update;
  if not exists(select 1 from public.work_channels where id=shared.channel_id and kind='shared') then raise exception 'contribution_base_denied' using errcode='42501'; end if;
  if r.base_revision_id is distinct from base.id then raise exception 'contribution_base_mismatch' using errcode='22023'; end if;
  if shared.head_revision_id<>base.id then
   if not private.can_read_contribution_revision_v1(r.organization_id,shared.head_revision_id) then raise exception 'contribution_base_denied' using errcode='42501'; end if;
   return jsonb_build_object('status','conflict','base',jsonb_build_object('revisionId',base.id,'content',base.content),
    'current',(select jsonb_build_object('revisionId',id,'content',content) from public.contribution_revisions where id=shared.head_revision_id),
    'candidate',jsonb_build_object('revisionId',r.id,'content',r.content));
  end if;
 else
  -- A revision based on a shared contribution must use CAS, not silently create a competing official head.
  if exists(select 1 from public.contribution_revisions b join public.work_contributions bc on bc.organization_id=b.organization_id and bc.id=b.contribution_id
   join public.work_channels ch on ch.id=bc.channel_id where b.id=r.base_revision_id and ch.kind='shared') then raise exception 'contribution_expected_base_required' using errcode='22023'; end if;
  insert into public.work_channels(organization_id,work_id,kind) values(r.organization_id,r.work_id,'shared') on conflict(organization_id,work_id,kind,owner_user_id) do update set work_id=excluded.work_id returning id into channel;
  insert into public.work_contributions(id,organization_id,work_id,channel_id,author_user_id) values(p_promotion_id,r.organization_id,r.work_id,channel,r.author_user_id) returning * into shared;
 end if;
 select coalesce(max(revision),0)+1 into next_revision from public.contribution_revisions where organization_id=r.organization_id and contribution_id=shared.id;
 insert into public.contribution_revisions(id,organization_id,work_id,contribution_id,revision,previous_revision_id,base_revision_id,promoted_from_revision_id,author_user_id,recorded_by,content,request_fingerprint)
 values(p_promotion_id,r.organization_id,r.work_id,shared.id,next_revision,shared.head_revision_id,r.base_revision_id,r.id,r.author_user_id,auth.uid(),r.content,fingerprint);
 perform private.pin_contribution_sources_v1(r.organization_id,p_promotion_id,'{}',r.id,shared.head_revision_id);
 update public.work_contributions set head_revision_id=p_promotion_id where id=shared.id;
 return jsonb_build_object('contributionId',shared.id,'revisionId',p_promotion_id,'status','shared','replayed',false);
end $function$
