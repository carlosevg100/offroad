-- 3W: bounded metadata enumeration; current source/WORK authority remains in
-- the installed native readers and commands. No body, effect selector or backfill.
-- Owner-only, exact lineage; a malformed or overlong chain cannot authorize a basis.
create function private.work_review_ancestor_v1(p_org uuid,p_artifact uuid,p_ancestor uuid,p_revision uuid)returns boolean
language plpgsql stable security definer set search_path=''as $$
declare cursor_id uuid:=p_revision;previous_id uuid;visited uuid[]:='{}';depth integer:=0;matched boolean:=false;
begin
 loop
  if cursor_id is null then return matched;end if;
  if depth>=64 or cursor_id=any(visited)then return false;end if;
  select previous_revision_id into previous_id from public.artifact_revisions where organization_id=p_org and artifact_id=p_artifact and id=cursor_id;
  if not found then return false;end if;
  if depth>0 and cursor_id=p_ancestor then matched:=true;end if;
  visited:=array_append(visited,cursor_id);depth:=depth+1;cursor_id:=previous_id;
 end loop;
end;$$;
revoke all on function private.work_review_ancestor_v1(uuid,uuid,uuid,uuid)from public,anon,authenticated,service_role;
create function private.read_work_review_dashboard_v1(p_work_id uuid,p_before_id uuid default null,p_before_decision_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare org uuid:=private.lock_review_work_v1(p_work_id);actor uuid:=auth.uid();r public.artifact_revisions;v jsonb;b public.artifact_reviews;
 d public.work_decisions;x jsonb;revisions jsonb:='[]';decisions jsonb:='[]';assignments jsonb:='[]';change jsonb;policy jsonb;pending boolean;row_count int:=0;more boolean:=false;last_id uuid;decision_count int:=0;decision_more boolean:=false;last_decision_id uuid;h record;eligible jsonb;roles text[];before_revision_at timestamptz;before_decision_at timestamptz;
begin
 if p_before_id is not null then
  select r.created_at into before_revision_at from public.artifact_revisions r join public.artifacts a on(a.organization_id,a.id)=(r.organization_id,r.artifact_id)where r.organization_id=org and a.work_id=p_work_id and r.id=p_before_id;
  if not found then raise exception 'review_cursor_access_required'using errcode='42501';end if;
 end if;
 if p_before_decision_id is not null then
  select created_at into before_decision_at from public.work_decisions where organization_id=org and work_id=p_work_id and id=p_before_decision_id;
  if not found then raise exception 'review_cursor_access_required'using errcode='42501';end if;
 end if;
 policy:=private.review_policy_snapshot_v1(org,p_work_id,actor);
 for r in select r.* from public.artifact_revisions r join public.artifacts a on(a.organization_id,a.id)=(r.organization_id,r.artifact_id)
 where r.organization_id=org and a.work_id=p_work_id and(p_before_id is null or(r.created_at,r.id)<(before_revision_at,p_before_id))order by r.created_at desc,r.id desc limit 101 loop
  row_count:=row_count+1;if row_count>100 then more:=true;exit;end if;last_id:=r.id;
  -- Never return withheld notes, source pins, actors or classification.
  v:=private.read_artifact_revision_reviews_v1(r.id);
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
end;$$;
create function public.read_work_review_dashboard_v1(p_work_id uuid,p_before_id uuid default null,p_before_decision_id uuid default null)returns jsonb language sql security invoker set search_path=''as $$select private.read_work_review_dashboard_v1(p_work_id,p_before_id,p_before_decision_id);$$;
revoke all on function private.read_work_review_dashboard_v1(uuid,uuid,uuid),public.read_work_review_dashboard_v1(uuid,uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function public.read_work_review_dashboard_v1(uuid,uuid,uuid)to authenticated;
-- Owner-mediated wrappers: re-check exact work, base and classification at commit.
create function private.reaffirm_work_revision_v1(p_work_id uuid,p_revision_id uuid,p_expected_fingerprint text,p_basis_review_id uuid,p_note text,p_declared boolean,p_command_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare org uuid:=private.lock_review_work_v1(p_work_id);r public.artifact_revisions;b public.artifact_reviews;
begin
 select *into r from public.artifact_revisions where organization_id=org and id=p_revision_id;
 if not exists(select 1 from public.artifacts where organization_id=org and id=r.artifact_id and work_id=p_work_id and head_revision_id=r.id)then raise exception 'review_work_access_required'using errcode='42501';end if;
 select*into b from public.artifact_reviews where organization_id=org and id=p_basis_review_id and artifact_id=r.artifact_id;
 if b.id is null or not private.work_review_ancestor_v1(org,r.artifact_id,b.revision_id,r.id)or not private.artifact_review_sources_allowed_v1(org,r.id,auth.uid())or not private.artifact_review_sources_allowed_v1(org,b.revision_id,auth.uid())then raise exception 'review_source_access_required'using errcode='42501';end if;
 if length(btrim(coalesce(p_note,'')))not between 1 and 5000 then raise exception 'artifact_review_invalid'using errcode='22023';end if;
 return private.review_artifact_revision_v1(r.id,p_expected_fingerprint,'reaffirm',null,p_note,p_declared,p_command_id,b.id);
end;$$;
create function public.reaffirm_work_revision_v1(p_work_id uuid,p_revision_id uuid,p_expected_fingerprint text,p_basis_review_id uuid,p_note text,p_declared boolean,p_command_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.reaffirm_work_revision_v1(p_work_id,p_revision_id,p_expected_fingerprint,p_basis_review_id,p_note,p_declared,p_command_id);$$;
create function private.record_work_report_v1(p_work_id uuid,p_key text,p_report jsonb,p_note text,p_command_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
begin
 return private.record_work_decision_v1(p_work_id,p_key,'record_report',jsonb_build_object('artifacts','[]'::jsonb,'milestones','[]'::jsonb,'assessments','[]'::jsonb,'decisions','[]'::jsonb,'execution',null,'configuration',null),array['none'],'reported',p_report,p_note,null,p_command_id,'recorded');
end;$$;
create function public.record_work_report_v1(p_work_id uuid,p_key text,p_report jsonb,p_note text,p_command_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.record_work_report_v1(p_work_id,p_key,p_report,p_note,p_command_id);$$;
create function private.contest_work_decision_v1(p_work_id uuid,p_decision_id uuid,p_expected_fingerprint text,p_note text,p_command_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare org uuid:=private.lock_review_work_v1(p_work_id);d public.work_decisions;basis jsonb;receipt jsonb;
begin
 select*into d from public.work_decisions where organization_id=org and work_id=p_work_id and id=p_decision_id;
 if d.id is null or d.fingerprint is distinct from p_expected_fingerprint or length(btrim(coalesce(p_note,'')))not between 1 and 5000 then raise exception 'work_decision_basis_invalid'using errcode='22023';end if;
 if private.read_work_decision_v1(d.id)->>'withheld'<>'false'then raise exception 'work_decision_basis_access_required'using errcode='42501';end if;
 basis:=jsonb_set(d.basis,'{decisions}',jsonb_build_array(jsonb_build_object('decisionId',d.id,'revision',d.revision,'fingerprint',d.fingerprint)));
 -- NULL expected previous is the existing precedence contract for an unresolved
 -- competing choice. It cannot supersede the earlier decision. 'approved' is
 -- the choice outcome enum, not an approval of the reported decision.
 receipt:=private.record_work_decision_v1(p_work_id,d.decision_key,'choose_alternative',basis,array['none'],'in_product',null,p_note,null,p_command_id,'approved');
 if(receipt->>'contested')::boolean is distinct from true then raise exception 'work_decision_contestation_required'using errcode='23505';end if;
 return receipt;
end;$$;
create function public.contest_work_decision_v1(p_work_id uuid,p_decision_id uuid,p_expected_fingerprint text,p_note text,p_command_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.contest_work_decision_v1(p_work_id,p_decision_id,p_expected_fingerprint,p_note,p_command_id);$$;
revoke all on function private.reaffirm_work_revision_v1(uuid,uuid,text,uuid,text,boolean,uuid),private.record_work_report_v1(uuid,text,jsonb,text,uuid),private.contest_work_decision_v1(uuid,uuid,text,text,uuid),public.reaffirm_work_revision_v1(uuid,uuid,text,uuid,text,boolean,uuid),public.record_work_report_v1(uuid,text,jsonb,text,uuid),public.contest_work_decision_v1(uuid,uuid,text,text,uuid)from public,anon,authenticated,service_role;
grant execute on function public.reaffirm_work_revision_v1(uuid,uuid,text,uuid,text,boolean,uuid),public.record_work_report_v1(uuid,text,jsonb,text,uuid),public.contest_work_decision_v1(uuid,uuid,text,text,uuid)to authenticated;

-- Invoker wrappers require execution of these scoped private entrypoints.
-- Each establishes current human/WORK authority; no internal append core is granted.
grant execute on function private.read_work_review_dashboard_v1(uuid,uuid,uuid),private.reaffirm_work_revision_v1(uuid,uuid,text,uuid,text,boolean,uuid),private.record_work_report_v1(uuid,text,jsonb,text,uuid),private.contest_work_decision_v1(uuid,uuid,text,text,uuid)to authenticated;
