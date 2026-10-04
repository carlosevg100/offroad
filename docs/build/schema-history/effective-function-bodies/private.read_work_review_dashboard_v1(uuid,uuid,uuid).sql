CREATE OR REPLACE FUNCTION private.read_work_review_dashboard_v1(p_work_id uuid, p_before_id uuid DEFAULT NULL::uuid, p_before_decision_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org uuid:=private.lock_review_work_v1(p_work_id);actor uuid:=auth.uid();r public.artifact_revisions;v jsonb;b public.artifact_reviews;
 d public.work_decisions;x jsonb;revisions jsonb:='[]';decisions jsonb:='[]';assignments jsonb:='[]';change jsonb;policy jsonb;pending boolean;row_count int:=0;more boolean:=false;last_id uuid;decision_count int:=0;decision_more boolean:=false;last_decision_id uuid;h record;eligible jsonb;roles text[];before_revision_at timestamptz;before_decision_at timestamptz;
begin
 if p_before_id is not null then
  select candidate.created_at into before_revision_at from public.artifact_revisions candidate join public.artifacts a on(a.organization_id,a.id)=(candidate.organization_id,candidate.artifact_id)where candidate.organization_id=org and a.work_id=p_work_id and candidate.id=p_before_id;
  if not found then raise exception 'review_cursor_access_required'using errcode='42501';end if;
 end if;
 if p_before_decision_id is not null then
  select created_at into before_decision_at from public.work_decisions where organization_id=org and work_id=p_work_id and id=p_before_decision_id;
  if not found then raise exception 'review_cursor_access_required'using errcode='42501';end if;
 end if;
 policy:=private.review_policy_snapshot_v1(org,p_work_id,actor);
 for r in select candidate.* from public.artifact_revisions candidate join public.artifacts a on(a.organization_id,a.id)=(candidate.organization_id,candidate.artifact_id)
 where candidate.organization_id=org and a.work_id=p_work_id and(p_before_id is null or(candidate.created_at,candidate.id)<(before_revision_at,p_before_id))order by candidate.created_at desc,candidate.id desc limit 101 loop
  row_count:=row_count+1;if row_count>100 then more:=true;exit;end if;last_id:=r.id;
  -- Never return withheld notes, source pins, actors or classification.
  v:=private.read_artifact_revision_review_metadata_v1(r.id);
  if(v->>'withheld')::boolean then
   revisions:=revisions||jsonb_build_array(jsonb_build_object('revisionId',r.id,'withheld',true));continue;
  end if;
  select * into b from public.artifact_reviews q where q.organization_id=org and q.artifact_id=r.artifact_id and q.revision_id<>r.id
   and private.work_review_ancestor_v1(org,r.artifact_id,q.revision_id,r.id)
   and q.act in('approve','reaffirm')and private.artifact_review_is_active_v1(org,q.id)
   and private.artifact_review_sources_allowed_v1(org,q.revision_id,actor)order by q.created_at desc,q.id desc limit 1;
  change:=case when b.id is not null then private.artifact_revision_change_v1(b.revision_id,r.id)else null end;
  pending:=(v->>'isHead')::boolean and not exists(select 1 from public.artifact_reviews q where q.organization_id=org and q.revision_id=r.id and private.artifact_review_is_active_v1(org,q.id));
  revisions:=revisions||jsonb_build_array(jsonb_build_object('revisionId',r.id,'artifactId',r.artifact_id,'kind',v#>>'{artifact,kind}','revisionNo',r.revision_no,
   'manifestFingerprint',r.manifest_fingerprint,'withheld',false,'pending',pending,'preparedBy',v->'preparedBy','reviews',v->'reviews',
   'basisReviewId',b.id,'change',change,'canReaffirm',coalesce(pending and change->>'outcome'='cosmetic'and(not(policy->>'assignmentRequired')::boolean or policy->'roles'?'approver')and(v->>'preparedBy' is distinct from actor::text or(policy->>'selfApprovalAllowed')::boolean),false)));
 end loop;
 for d in select * from public.work_decisions where organization_id=org and work_id=p_work_id and(p_before_decision_id is null or(created_at,id)<(before_decision_at,p_before_decision_id))order by created_at desc,id desc limit 101 loop
  decision_count:=decision_count+1;if decision_count>100 then decision_more:=true;exit;end if;last_decision_id:=d.id;
  x:=private.read_work_decision_v1(d.id);if x->>'withheld'='false'then x:=x||jsonb_build_object('canContest',not(policy->>'assignmentRequired')::boolean or policy->'roles'?'approver');end if;decisions:=decisions||jsonb_build_array(x);
 end loop;
 -- A removed predecessor is discovered from immutable assignment history.
 -- Recipients must already hold every required role and current WORK, not membership alone.
 if jsonb_path_exists(revisions,'$[*] ? (@.pending == true)') and private.can_manage_organization(org)and private.can_access_resource_v1(org,p_work_id,'manage')then
  for h in select distinct user_id from private.review_assignment_history where organization_id=org and work_id=p_work_id order by user_id limit 100 loop
   select array_agg(review_role order by review_role)into roles from(select distinct on(review_role)review_role,assigned,removal_reason from private.review_assignment_history
    where organization_id=org and work_id=p_work_id and user_id=h.user_id order by review_role,sequence desc)t where assigned or removal_reason='member_removed';
   if cardinality(roles)>0 then
    select coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'label',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,'Member'))order by u.id),'[]')into eligible
    from auth.users u join public.organization_memberships m on m.user_id=u.id and m.organization_id=org and m.status='active'
    where u.id<>h.user_id and u.deleted_at is null and(u.banned_until is null or u.banned_until<=clock_timestamp())and private.resource_access_as_subject_v1(org,p_work_id,u.id,'work')
    and not exists(select 1 from unnest(roles)role_name where not exists(select 1 from public.capital_project_review_assignments q where q.organization_id=org and q.capital_project_id=p_work_id and q.user_id=u.id and q.review_role=role_name));
    assignments:=assignments||jsonb_build_array(jsonb_build_object('fromUserId',h.user_id,'eligible',eligible));
   end if;
  end loop;
 end if;
 return jsonb_build_object('schemaVersion','work-review-dashboard.v1','workId',p_work_id,'organizationId',org,'viewerId',actor,'canReport',true,'canManage',private.can_manage_organization(org)and private.can_access_resource_v1(org,p_work_id,'manage'),
 'revisions',revisions,'decisions',decisions,'decisionsTruncated',decision_more,'nextDecisionCursor',case when decision_more then last_decision_id else null end,'assignments',assignments,'nextCursor',case when more then last_id else null end);
end;$function$
