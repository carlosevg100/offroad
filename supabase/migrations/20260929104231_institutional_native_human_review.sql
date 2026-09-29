-- Stage 20: institutional native review only. No historical approval or public publication.
create function private.institutional_native_result_content_v1(p_org uuid,p_result uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare b private.institutional_native_bindings; payload jsonb; expected jsonb;
begin
 select * into b from private.institutional_native_bindings where organization_id=p_org and result_id=p_result;
 if not found then return null;end if;
 if not private.institutional_native_read_allowed_v1(p_org,b.revision_id,auth.uid()) then raise exception 'institutional_native_read_denied' using errcode='42501';end if;
 select content->'workbook' into payload from public.artifact_blocks where organization_id=p_org and revision_id=b.revision_id and block_key='workbook';
 payload:=jsonb_set(payload,'{institutional,scenarios}',(select jsonb_agg(content->'scenario' order by block_no) from public.artifact_blocks where organization_id=p_org and revision_id=b.revision_id and block_key like 'scenario:%'));
 select artifact into expected from private.institutional_model_results where organization_id=p_org and id=p_result;
 if payload is null or payload is distinct from expected then raise exception 'institutional_native_content_mismatch' using errcode='23514';end if;
 if not private.institutional_native_read_allowed_v1(p_org,b.revision_id,auth.uid()) then raise exception 'institutional_native_read_denied' using errcode='42501';end if;
 return jsonb_build_object('revisionId',b.revision_id,'artifact',payload);
end $$;
revoke all on function private.institutional_native_result_content_v1(uuid,uuid) from public,anon,authenticated,service_role;

-- Exact fingerprint lookup for institutional workbooks copied into historical material packages.
-- No binding is a legacy outcome; denied or ambiguous binding never falls back to legacy.
create function private.read_institutional_workbook_binding_v1(p_work uuid,p_fingerprint text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare org uuid; matches uuid[]; payload jsonb;
begin
 perform private.require_resource_access_v1(p_work,'read');
 select organization_id into org from public.capital_projects where id=p_work;
 if org is null then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 select array_agg(b.result_id) into matches from private.institutional_native_bindings b
 join private.institutional_model_results r on (r.organization_id,r.id)=(b.organization_id,b.result_id)
 where b.organization_id=org and b.work_id=p_work and r.artifact->>'fingerprint'=p_fingerprint;
 if coalesce(cardinality(matches),0)=0 then return jsonb_build_object('state','legacy');end if;
 if cardinality(matches)<>1 then raise exception 'institutional_native_binding_ambiguous' using errcode='42501';end if;
 payload:=private.institutional_native_result_content_v1(org,matches[1]);
 return jsonb_build_object('state','native','resultId',matches[1],'revisionId',payload->'revisionId');
end $$;
create function public.read_institutional_workbook_binding_v1(p_work uuid,p_fingerprint text) returns jsonb
language sql security invoker set search_path='' as $$select private.read_institutional_workbook_binding_v1(p_work,p_fingerprint);$$;
revoke all on function private.read_institutional_workbook_binding_v1(uuid,text),public.read_institutional_workbook_binding_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.read_institutional_workbook_binding_v1(uuid,text),public.read_institutional_workbook_binding_v1(uuid,text) to authenticated;


create or replace function private.artifact_revision_release_v1(r public.artifact_revisions)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare fps text[]:=array_remove(array[r.manifest_fingerprint,r.content_sha256,r.legacy_ref->>'fingerprint'],null);approved boolean;
begin
 -- A persisted native binding, including inherited ones, cannot inherit historical approval.
 if exists(with recursive ancestry(id) as (select r.id union select l.derived_from_revision_id from ancestry a
  join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=a.id and l.link_kind='artifact_revision')
  select 1 from ancestry a join private.institutional_native_bindings b on b.organization_id=r.organization_id and b.revision_id=a.id)
 then
  approved:=exists(select 1 from public.artifact_reviews v join public.artifacts a on (a.organization_id,a.id)=(v.organization_id,v.artifact_id)
   where v.organization_id=r.organization_id and v.artifact_id=r.artifact_id and v.revision_id=r.id
    and v.work_id=a.work_id and v.manifest_fingerprint=r.manifest_fingerprint and v.audience=r.audience
    and private.artifact_review_is_active_v1(r.organization_id,v.id));
  return case when approved then 'released' when r.audience='external' then 'blocked' else 'internal' end;
 end if;
 -- The historical counterpart cannot be downloaded as an alternative approved representation.
 if exists(with recursive ancestry(id) as (select r.id union select l.derived_from_revision_id from ancestry a
  join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=a.id and l.link_kind='artifact_revision')
  select 1 from ancestry a join private.institutional_native_bindings b on b.organization_id=r.organization_id and b.ancestor_revision_id=a.id)
 then return 'blocked';end if;
 approved:=exists(select 1 from public.capital_project_artifact_decisions d where d.organization_id=r.organization_id and d.decision='confirm' and d.artifact_fingerprint=any(fps))
  or exists(select 1 from public.deal_state_objects pr cross join unnest(fps) f where pr.organization_id=r.organization_id and pr.object_type='package_review' and pr.status='approved'
   and pr.dependencies @> jsonb_build_array(jsonb_build_object('objectType','material_artifact','objectFingerprint',f)))
  or (jsonb_typeof(r.manifest->'institutionalResult')='object' and exists(select 1 from private.institutional_model_results m
   where m.organization_id=r.organization_id and m.id=(r.manifest#>>'{institutionalResult,id}')::uuid and m.status='completed' and m.superseded_by is null
    and private.institutional_result_established_v1(m.organization_id,m.id)))
  or (jsonb_typeof(r.manifest->'execution')='object' and exists(select 1 from private.execution_result_receipts x
   where x.organization_id=r.organization_id and x.execution_id=(r.manifest#>>'{execution,executionId}')::uuid and x.result_fingerprint=r.manifest#>>'{execution,resultFingerprint}'));
 return case when approved then 'released' when r.audience='external' then 'blocked' else 'internal' end;
end $function$
;

create or replace function private.read_institutional_model_results_v1(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org_id uuid;r private.institutional_model_results;context jsonb;current_id uuid;is_current boolean;job_status text;visible_status text;visible_blockers jsonb;comparison_results jsonb; answer jsonb; native jsonb; item jsonb; safe_comparisons jsonb:='[]'::jsonb;
begin
 perform private.require_resource_access_v1(p_project_id,'read');
 select organization_id into org_id from public.capital_projects where id=p_project_id;
 if org_id is null or not private.can_access_capital_project(org_id,p_project_id) then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 select * into r from private.institutional_model_results x where x.organization_id=org_id and x.capital_project_id=p_project_id and private.institutional_result_established_v1(x.organization_id,x.id) order by x.created_at desc,x.id desc limit 1;
 if r.id is null then return jsonb_build_object('projectId',p_project_id,'latest',null,'comparisonResults','[]'::jsonb);end if;
 context:=private.institutional_source_context(org_id,r.intake_session_id);
 select id into current_id from private.institutional_model_configurations where organization_id=org_id and capital_project_id=p_project_id and status='approved' order by revision desc limit 1;
 is_current:=coalesce(r.configuration_id=current_id and r.source_manifest_fingerprint=context->>'sourceManifestFingerprint',false);
 select j.status into job_status from public.processing_jobs j where j.organization_id=org_id and j.intake_session_id=r.intake_session_id and j.kind='agent_operation_brief' and j.payload->>'message_id'=r.id::text order by j.created_at desc limit 1;
 visible_status:=case when not is_current then 'stale' when r.status='queued' and (job_status is null or job_status in ('failed','cancelled','poison','succeeded')) then 'blocked' else r.status end;
 visible_blockers:=case when visible_status='blocked' and r.status='queued' then jsonb_build_array(case when job_status is null then 'institutional_result_dispatch_missing' when job_status='succeeded' then 'institutional_result_output_missing' else 'institutional_result_job_'||job_status end) else r.blockers end;
 -- Only completed, still-approved configurations from the same current evidence snapshot.
 -- No stale document snapshot, other project, other tenant, or unfinished result is returned.
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'status','completed','configurationId',h.configuration_id,'configurationFingerprint',h.configuration_fingerprint,'sourceManifestFingerprint',h.source_manifest_fingerprint,'artifact',h.artifact,'blockers',h.blockers,'createdAt',h.created_at) order by h.created_at desc,h.id desc),'[]'::jsonb) into comparison_results
 from (select history.* from private.institutional_model_results history
 join private.institutional_model_configurations c on c.organization_id=history.organization_id and c.capital_project_id=history.capital_project_id and c.id=history.configuration_id and c.configuration_fingerprint=history.configuration_fingerprint and c.status='approved'
 where history.organization_id=org_id and history.capital_project_id=p_project_id and private.institutional_result_established_v1(history.organization_id,history.id)
 and history.intake_session_id=r.intake_session_id and history.status='completed'
 and history.source_manifest_fingerprint=context->>'sourceManifestFingerprint'
 order by history.created_at desc,history.id desc limit 12) h;
 answer:=jsonb_build_object('projectId',p_project_id,'comparisonResults',case when is_current and r.status='completed' then comparison_results else '[]'::jsonb end,'latest',jsonb_build_object('id',r.id,'status',visible_status,'configurationId',r.configuration_id,'configurationFingerprint',r.configuration_fingerprint,'sourceManifestFingerprint',r.source_manifest_fingerprint,'artifact',case when is_current and r.status='completed' then r.artifact else null end,'blockers',visible_blockers,'createdAt',r.created_at));
 if is_current and r.status='completed' then
  native:=private.institutional_native_result_content_v1(org_id,r.id);
  if native is not null then answer:=jsonb_set(answer,'{latest}',(answer->'latest')||jsonb_build_object('artifact',native->'artifact','nativeRevisionId',native->'revisionId'));end if;
  for item in select value from jsonb_array_elements(comparison_results) loop
   native:=private.institutional_native_result_content_v1(org_id,(item->>'id')::uuid);
   if native is not null then item:=item||jsonb_build_object('artifact',native->'artifact','nativeRevisionId',native->'revisionId');end if;
   safe_comparisons:=safe_comparisons||jsonb_build_array(item);
  end loop;
  answer:=jsonb_set(answer,'{comparisonResults}',safe_comparisons);
  -- Re-evaluate all pins after every read and potential wait, including comparison-only sources.
  for item in select value from jsonb_array_elements(safe_comparisons||jsonb_build_array(answer->'latest')) loop
   if item->>'nativeRevisionId' is not null and not private.institutional_native_read_allowed_v1(org_id,(item->>'nativeRevisionId')::uuid,auth.uid())
   then raise exception 'institutional_native_read_denied' using errcode='42501';end if;
  end loop;
 end if;
 return answer;
end $function$
;

create or replace function private.review_artifact_revision_v1(
 p_revision_id uuid,p_expected_fingerprint text,p_act text,p_block_id uuid,p_note text,
 p_self_approval_declared boolean,p_command_id uuid,p_basis_review_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.artifact_revisions;a public.artifacts;org uuid;
 policy jsonb;mode text;preparer uuid;block_key_value text;basis public.artifact_reviews;existing public.artifact_reviews;
 change jsonb;review_id uuid;has_substance boolean;
begin
 select * into r from public.artifact_revisions where id=p_revision_id;
 select * into a from public.artifacts where organization_id=r.organization_id and id=r.artifact_id;
 org:=private.lock_review_work_v1(a.work_id);
 if org is distinct from r.organization_id then raise exception 'review_work_access_required' using errcode='42501'; end if;
 if p_expected_fingerprint is distinct from r.manifest_fingerprint then raise exception 'artifact_review_stale' using errcode='22023'; end if;
 if p_act is null or p_act not in ('comment','return','approve','reaffirm','revoke_approval') or p_command_id is null
  or p_self_approval_declared is null or (p_note is not null and length(btrim(p_note)) not between 1 and 5000)
 then raise exception 'artifact_review_invalid' using errcode='22023'; end if;
 -- All content-bearing acts, including comments, require the complete inherited source closure.
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501'; end if;
 if p_block_id is not null then
  select b.block_key into block_key_value from public.artifact_blocks b where b.organization_id=org and b.revision_id=r.id and b.id=p_block_id;
  if not found or p_act not in ('comment','return') then raise exception 'review_block_act_invalid' using errcode='22023'; end if;
 end if;
 policy:=private.review_policy_snapshot_v1(org,a.work_id,actor);
 mode:=case when (policy->>'assignmentRequired')::boolean then 'assigned' when (policy->>'selfApprovalAllowed')::boolean then 'individual' else 'open' end;
 preparer:=private.artifact_review_preparer_v1(r);
 if (policy->>'assignmentRequired')::boolean and p_act<>'comment' and not (
  (p_act in ('approve','reaffirm','revoke_approval') and policy->'roles' ? 'approver')
  or (p_act='return' and (policy->'roles' ? 'reviewer' or policy->'roles' ? 'approver')))
 then raise exception 'review_assignment_required' using errcode='42501'; end if;
 if p_act in ('approve','reaffirm') then
  has_substance:=jsonb_array_length(r.manifest->'sources')>0 or jsonb_typeof(r.manifest->'execution')='object'
   or jsonb_typeof(r.manifest->'institutionalResult')='object'
   or exists(select 1 from public.artifact_blocks b where b.organization_id=org and b.revision_id=r.id and jsonb_array_length(b.claims)>0)
   or (a.kind='answer' and exists(select 1 from public.artifact_blocks b where b.organization_id=org and b.revision_id=r.id)
    and not exists(select 1 from public.artifact_blocks b where b.organization_id=org and b.revision_id=r.id
     and (b.kind not in ('section','paragraph') or jsonb_array_length(b.claims)>0 or private.artifact_content_carries_number_v1(b.content))));
  if not has_substance then raise exception 'review_substance_required' using errcode='23514'; end if;
  if preparer=actor and (not (policy->>'selfApprovalAllowed')::boolean or not p_self_approval_declared)
  then raise exception 'capital_project_self_approval_forbidden' using errcode='42501'; end if;
 end if;
 if p_act in ('reaffirm','revoke_approval') then
  select * into basis from public.artifact_reviews where organization_id=org and id=p_basis_review_id;
  if basis.id is null or basis.artifact_id<>r.artifact_id or basis.work_id<>a.work_id or basis.audience<>r.audience or basis.act not in ('approve','reaffirm')
   or (p_act='revoke_approval' and basis.revision_id<>r.id)
   or (p_act='reaffirm' and (basis.revision_id=r.id or not private.artifact_review_is_active_v1(org,basis.id)))
  then raise exception 'artifact_review_basis_invalid' using errcode='22023'; end if;
  if p_act='reaffirm' then
   if not private.artifact_review_sources_allowed_v1(org,basis.revision_id,actor) then raise exception 'review_source_access_required' using errcode='42501'; end if;
   change:=private.artifact_revision_change_v1(basis.revision_id,r.id);
   if change->>'outcome'<>'cosmetic' then raise exception 'artifact_review_material_change' using errcode='22023'; end if;
  end if;
 elsif p_basis_review_id is not null then raise exception 'artifact_review_basis_invalid' using errcode='22023'; end if;
 select * into existing from public.artifact_reviews where organization_id=org and work_id=a.work_id and command_id=p_command_id;
 if found then
  if existing.revision_id<>r.id or existing.manifest_fingerprint<>p_expected_fingerprint or existing.act<>p_act or existing.reviewer_id<>actor
   or existing.block_id is distinct from p_block_id or existing.note is distinct from p_note
   or existing.self_approval_declared<>p_self_approval_declared or existing.basis_review_id is distinct from p_basis_review_id
  then raise exception 'artifact_review_replay_mismatch' using errcode='23505'; end if;
  if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501';end if;
  return jsonb_build_object('reviewId',existing.id,'revisionId',r.id,'act',existing.act,'replayed',true);
 end if;
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501';end if;
 insert into public.artifact_reviews(organization_id,work_id,artifact_id,revision_id,manifest_fingerprint,audience,act,reviewer_id,prepared_by,
  self_approval_declared,review_mode,policy_snapshot,block_id,block_key,basis_review_id,change_report,command_id,note)
 values(org,a.work_id,a.id,r.id,r.manifest_fingerprint,r.audience,p_act,actor,preparer,p_self_approval_declared,mode,policy,p_block_id,block_key_value,p_basis_review_id,change,p_command_id,p_note)
 returning id into review_id;
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then raise exception 'review_source_access_required' using errcode='42501';end if;
 return jsonb_build_object('reviewId',review_id,'revisionId',r.id,'act',p_act,'replayed',false);
end $$;

create or replace function private.read_artifact_revision_reviews_v1(p_revision_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.artifact_revisions;a public.artifacts;org uuid;actor uuid:=auth.uid();history jsonb;policy jsonb;allowed boolean;answer jsonb;
begin
 select * into r from public.artifact_revisions where id=p_revision_id;
 select * into a from public.artifacts where organization_id=r.organization_id and id=r.artifact_id;
 org:=private.lock_review_work_v1(a.work_id);
 allowed:=private.artifact_review_sources_allowed_v1(org,r.id,actor);
 if not allowed then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'act',act,'createdAt',created_at) order by created_at,id),'[]') into history
   from public.artifact_reviews where organization_id=org and revision_id=r.id;
  return jsonb_build_object('revisionId',r.id,'withheld',true,'reviews',history);
 end if;
 policy:=private.review_policy_snapshot_v1(org,a.work_id,actor);
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'target',jsonb_build_object('organizationId',org,'workId',a.work_id,'artifactId',a.id,
  'revisionId',r.id,'manifestFingerprint',v.manifest_fingerprint,'audience',v.audience),
  'act',v.act,'reviewerId',v.reviewer_id,'preparedBy',v.prepared_by,'selfApprovalDeclared',v.self_approval_declared,
  'reviewMode',v.review_mode,'policySnapshot',v.policy_snapshot,
  'block',case when v.block_id is not null then jsonb_build_object('id',v.block_id,'key',v.block_key) end,
  'basisReviewId',v.basis_review_id,'changeReport',v.change_report,'commandId',v.command_id,'note',v.note,'createdAt',v.created_at) order by v.created_at,v.id),'[]') into history
  from public.artifact_reviews v where v.organization_id=org and v.revision_id=r.id;
 answer:=jsonb_build_object('revisionId',r.id,'withheld',false,'reviews',history,'snapshot',private.artifact_review_snapshot_v1(org,r.id),
  'artifact',jsonb_build_object('id',a.id,'workId',a.work_id,'kind',a.kind,'subject',a.subject,'headRevisionId',a.head_revision_id),
  'isHead',a.head_revision_id=r.id,'policy',policy,'preparedBy',private.artifact_review_preparer_v1(r),'freshness',private.artifact_revision_freshness_v1(r),
  'release',private.artifact_revision_release_v1(r));
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then return jsonb_build_object('revisionId',r.id,'withheld',true,'reviews','[]'::jsonb);end if;
 return answer;
end $$;
