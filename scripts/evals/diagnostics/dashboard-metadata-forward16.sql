-- Metadata-only dashboard projection; complete revision readers remain unchanged.
-- Current source authority is checked before construction and again before return.
set search_path='';
do $source_guard$begin
 if md5((select prosrc from pg_proc where oid='private.read_work_review_dashboard_v1(uuid,uuid,uuid)'::regprocedure))<>'b1b7a6604461111e3335f5e15b1a68af'
 or md5((select prosrc from pg_proc where oid='private.read_artifact_revision_reviews_v1(uuid)'::regprocedure))<>'bcb2f0422db072920f3dc328ca07da52'
 or to_regprocedure('private.read_artifact_revision_review_metadata_v1(uuid)')is not null
 then raise exception 'work_review_metadata_source_changed';end if;
end $source_guard$;
create function private.read_artifact_revision_review_metadata_v1(p_revision_id uuid)returns jsonb
language plpgsql security definer set search_path=''as $body$
declare r public.artifact_revisions;a public.artifacts;org uuid;actor uuid:=auth.uid();history jsonb;allowed boolean;answer jsonb;
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
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'target',jsonb_build_object('organizationId',org,'workId',a.work_id,'artifactId',a.id,
  'revisionId',r.id,'manifestFingerprint',v.manifest_fingerprint,'audience',v.audience),
  'act',v.act,'reviewerId',v.reviewer_id,'preparedBy',v.prepared_by,'selfApprovalDeclared',v.self_approval_declared,
  'reviewMode',v.review_mode,'policySnapshot',v.policy_snapshot,
  'block',case when v.block_id is not null then jsonb_build_object('id',v.block_id,'key',v.block_key) end,
  'basisReviewId',v.basis_review_id,'changeReport',v.change_report,'commandId',v.command_id,'note',v.note,'createdAt',v.created_at) order by v.created_at,v.id),'[]') into history
  from public.artifact_reviews v where v.organization_id=org and v.revision_id=r.id;
 answer:=jsonb_build_object('revisionId',r.id,'withheld',false,'reviews',history,
  'artifact',jsonb_build_object('id',a.id,'workId',a.work_id,'kind',a.kind,'subject',a.subject,'headRevisionId',a.head_revision_id),
  'isHead',a.head_revision_id=r.id,'preparedBy',private.artifact_review_preparer_v1(r));
 if not private.artifact_review_sources_allowed_v1(org,r.id,actor) then return jsonb_build_object('revisionId',r.id,'withheld',true,'reviews','[]'::jsonb);end if;
 return answer;
end $body$;
revoke all on function private.read_artifact_revision_review_metadata_v1(uuid)from public,anon,authenticated,service_role;
-- Recreate only the same complete dashboard definition with one internal call changed.
-- CREATE OR REPLACE retains owner/ACL/proconfig/volatility/signature and all DTO logic.
do $replace_dashboard$
declare definition text;needle text:='v:=private.read_artifact_revision_reviews_v1(r.id);';begin
 definition:=pg_get_functiondef('private.read_work_review_dashboard_v1(uuid,uuid,uuid)'::regprocedure);
 if length(definition)-length(replace(definition,needle,''))<>length(needle) then raise exception 'work_review_metadata_call_count_changed';end if;
 execute replace(definition,needle,'v:=private.read_artifact_revision_review_metadata_v1(r.id);');
end $replace_dashboard$;
