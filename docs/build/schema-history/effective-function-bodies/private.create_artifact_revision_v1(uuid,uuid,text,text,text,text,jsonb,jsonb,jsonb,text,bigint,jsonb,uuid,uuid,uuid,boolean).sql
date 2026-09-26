CREATE OR REPLACE FUNCTION private.create_artifact_revision_v1(p_org uuid, p_work uuid, p_kind text, p_subject text, p_audience text, p_origin text, p_manifest jsonb, p_blocks jsonb, p_links jsonb, p_content_sha256 text, p_byte_length bigint, p_legacy_ref jsonb, p_actor uuid, p_rights_subject uuid DEFAULT NULL::uuid, p_revision_id uuid DEFAULT NULL::uuid, p_lock_work boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 hex text:='^[a-f0-9]{64}$';uid text:='^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$';
 blocks jsonb:=coalesce(p_blocks,'[]'::jsonb);links jsonb:=coalesce(p_links,'[]'::jsonb);all_links jsonb:='[]'::jsonb;
 a public.artifacts;existing public.artifact_revisions;head public.artifact_revisions;rev_id uuid;fingerprint text;next_no integer;
 blk jsonb;blk_no integer:=0;lnk jsonb;lnk_kind text;lnk_block uuid;sv uuid;rv uuid;set_id uuid;summary jsonb;informational boolean;substance boolean;
begin
 if p_org is null or p_work is null
  or p_kind not in ('answer','material','workbook','model_result','work_product','execution_result','presentation','document')
  or coalesce(char_length(p_subject),0) not between 1 and 300
  or p_audience not in ('internal','advisor','external') or p_origin not in ('worker','person','legacy')
  or jsonb_typeof(blocks)<>'array' or jsonb_array_length(blocks)>1000 or jsonb_typeof(links)<>'array' or jsonb_array_length(links)>2000
  or (p_content_sha256 is null)<>(p_byte_length is null) or (p_content_sha256 is not null and (p_content_sha256 !~ hex or p_byte_length<=0))
  or (p_origin='person' and p_actor is null)
 then raise exception 'artifact_revision_invalid' using errcode='22023'; end if;
 if p_origin='legacy' and p_legacy_ref is null then raise exception 'legacy_origin_without_ref' using errcode='22023'; end if;
 if p_lock_work then
  perform 1 from public.capital_projects p where p.organization_id=p_org and p.id=p_work for no key update;
  if not found then raise exception 'artifact_work_not_found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('work-continuation:'||p_org::text||':'||p_work::text,0));
 elsif not exists(select 1 from public.capital_projects p where p.organization_id=p_org and p.id=p_work) then
  raise exception 'artifact_work_not_found' using errcode='P0002';
 end if;
 perform private.validate_artifact_manifest_v1(p_manifest);
 -- Stored bytes name an object the governed upload stored for this work, with this hash, size and format.
 if jsonb_typeof(p_manifest#>'{bytes,storage}')='object' and not exists(select 1 from private.capital_project_material_upload_grants g
   where g.organization_id=p_org and g.capital_project_id=p_work and g.state='stored' and p_manifest#>>'{bytes,storage,bucket}'='case-artifacts'
    and g.object_path=p_manifest#>>'{bytes,storage,path}' and g.content_sha256=p_manifest#>>'{bytes,sha256}'
    and g.byte_length=(p_manifest#>>'{bytes,byteLength}')::bigint and g.format=p_manifest->>'format'
    and exists(select 1 from storage.objects o where o.bucket_id='case-artifacts' and o.name=g.object_path)) then
  raise exception 'artifact_stored_bytes_not_governed' using errcode='42501';
 end if;
 if p_manifest->>'kind'<>p_kind then raise exception 'kind_mismatch' using errcode='22023'; end if;
 if p_manifest->>'audience'<>p_audience then raise exception 'audience_mismatch' using errcode='22023'; end if;
 if p_content_sha256 is distinct from (p_manifest#>>'{bytes,sha256}') or p_byte_length is distinct from (p_manifest#>>'{bytes,byteLength}')::bigint then
  raise exception 'bytes_mismatch' using errcode='22023';
 end if;
 if p_legacy_ref is distinct from nullif(p_manifest->'legacy','null'::jsonb) then raise exception 'legacy_ref_mismatch' using errcode='22023'; end if;
 -- Blocks: key, kind, content and claims; keys unique inside the revision; claim ids unique across it.
 for blk in select value from jsonb_array_elements(blocks) loop
  if jsonb_typeof(blk)<>'object' or not (blk ?& array['blockKey','kind','content','claims']) or coalesce(blk->>'blockKey','') !~ '^[^[:space:]]{1,160}$'
   or blk->>'kind' not in ('section','paragraph','table','chart','number','cell_region') or jsonb_typeof(blk->'content')<>'object'
   or jsonb_typeof(blk->'claims')<>'array' or blk-array['blockKey','kind','content','claims']<>'{}'::jsonb
  then raise exception 'artifact_block_invalid' using errcode='22023'; end if;
  perform private.validate_artifact_claims_v1(blk->'claims');
 end loop;
 if (select count(distinct value->>'blockKey') from jsonb_array_elements(blocks))<>jsonb_array_length(blocks) then raise exception 'duplicate_block_key' using errcode='22023'; end if;
 if (select count(*)<>count(distinct c->>'claimId') from jsonb_array_elements(blocks) b cross join jsonb_array_elements(b.value->'claims') c) then
  raise exception 'duplicate_claim_id' using errcode='22023'; end if;
 -- The manifest's claims summary is exactly revisionClaimsSummary(blocks): blocks with claims, in
 -- block order, each with its claim ids in claim order.
 select coalesce(jsonb_agg(jsonb_build_object('blockKey',b.value->>'blockKey','claimIds',
   (select jsonb_agg(c->'claimId') from jsonb_array_elements(b.value->'claims') c)) order by b.ordinality),'[]'::jsonb) into summary
  from jsonb_array_elements(blocks) with ordinality b where jsonb_array_length(b.value->'claims')>0;
 if summary<>p_manifest->'claims' then raise exception 'claims_summary_mismatch' using errcode='22023'; end if;
 -- The execution the manifest names: once its receipt exists, the manifest carries the receipt's
 -- result fingerprint (the sha256 of the canonical text), never a fingerprint of its own.
 if jsonb_typeof(p_manifest->'execution')='object' and exists(select 1 from private.execution_result_receipts x
   where x.organization_id=p_org and x.execution_id=(p_manifest#>>'{execution,executionId}')::uuid and x.result_fingerprint<>p_manifest#>>'{execution,resultFingerprint}') then
  raise exception 'execution_result_fingerprint_mismatch' using errcode='22023';
 end if;
 -- Links of the revision from the manifest, then the anchors and derivations of p_links. A source
 -- named without a rights version pins the one the command resolves, or the write is refused.
 for lnk in select value from jsonb_array_elements(p_manifest->'sources') loop
  sv:=(lnk->>'sourceVersionId')::uuid;
  rv:=coalesce(nullif(lnk->>'rightsVersionId','')::uuid,private.artifact_source_rights_pin_v1(p_org,sv,nullif(p_manifest#>>'{execution,executionId}','')::uuid));
  if rv is null then raise exception 'artifact_source_rights_unresolved' using errcode='P0002'; end if;
  all_links:=all_links||jsonb_build_array(jsonb_build_object('kind','source_version','sourceVersionId',sv,'rightsVersionId',rv));
 end loop;
 if jsonb_typeof(p_manifest->'execution')='object' then all_links:=all_links||jsonb_build_array(jsonb_build_object('kind','execution','executionId',p_manifest#>>'{execution,executionId}')); end if;
 if jsonb_typeof(p_manifest->'institutionalResult')='object' then all_links:=all_links||jsonb_build_array(jsonb_build_object('kind','institutional_result','resultId',p_manifest#>>'{institutionalResult,id}')); end if;
 if jsonb_typeof(p_manifest->'method')='object' then all_links:=all_links||jsonb_build_array(jsonb_build_object('kind','method_release','platformReleaseId',p_manifest#>>'{method,platformReleaseId}','houseReleaseId',p_manifest#>'{method,houseReleaseId}')); end if;
 for lnk in select value from jsonb_array_elements(links) loop
  lnk_kind:=lnk->>'kind';
  if jsonb_typeof(lnk)<>'object' or lnk_kind not in ('source_version','execution','institutional_result','method_release','assumption_slot','artifact_revision')
   or (lnk ? 'blockKey' and (jsonb_typeof(lnk->'blockKey')<>'string' or not exists(select 1 from jsonb_array_elements(blocks) b where b.value->>'blockKey'=lnk->>'blockKey')))
   or (lnk_kind='source_version' and (coalesce(lnk->>'sourceVersionId','') !~* uid or jsonb_typeof(lnk->'rightsVersionId') not in ('null','string')
    or (jsonb_typeof(lnk->'rightsVersionId')='string' and lnk->>'rightsVersionId' !~* uid) or lnk-array['kind','blockKey','sourceVersionId','rightsVersionId']<>'{}'::jsonb))
   or (lnk_kind='execution' and (coalesce(lnk->>'executionId','') !~* uid or lnk-array['kind','blockKey','executionId']<>'{}'::jsonb))
   or (lnk_kind='institutional_result' and (coalesce(lnk->>'resultId','') !~* uid or lnk-array['kind','blockKey','resultId']<>'{}'::jsonb))
   or (lnk_kind='method_release' and (length(coalesce(lnk->>'platformReleaseId','')) not between 1 and 200 or jsonb_typeof(lnk->'houseReleaseId') not in ('null','string')
    or (jsonb_typeof(lnk->'houseReleaseId')='string' and lnk->>'houseReleaseId' !~* uid) or lnk-array['kind','blockKey','platformReleaseId','houseReleaseId']<>'{}'::jsonb))
   or (lnk_kind='assumption_slot' and (coalesce(lnk->>'assumptionVersionId','') !~* uid or coalesce(lnk->>'slotKey','') !~ hex
    or lnk-array['kind','blockKey','assumptionVersionId','slotKey']<>'{}'::jsonb))
   or (lnk_kind='artifact_revision' and (coalesce(lnk->>'derivedFromRevisionId','') !~* uid or lnk-array['kind','blockKey','derivedFromRevisionId']<>'{}'::jsonb))
  then raise exception 'artifact_link_invalid' using errcode='22023'; end if;
  -- An edge comes from the producer's manifest, never from the text of a block: a block anchor names
  -- a source the manifest declares and carries the same pin the revision-level link resolved.
  if (lnk_kind='source_version' and not exists(select 1 from jsonb_array_elements(p_manifest->'sources') s
     where s->>'sourceVersionId'=lnk->>'sourceVersionId' and (jsonb_typeof(s->'rightsVersionId')='null' or jsonb_typeof(lnk->'rightsVersionId')='null' or s->>'rightsVersionId'=lnk->>'rightsVersionId')))
   or (lnk_kind='execution' and p_manifest#>>'{execution,executionId}' is distinct from lnk->>'executionId')
   or (lnk_kind='institutional_result' and p_manifest#>>'{institutionalResult,id}' is distinct from lnk->>'resultId')
   or (lnk_kind='method_release' and (p_manifest#>>'{method,platformReleaseId}' is distinct from lnk->>'platformReleaseId' or p_manifest#>>'{method,houseReleaseId}' is distinct from lnk->>'houseReleaseId'))
  then raise exception 'artifact_link_not_in_manifest' using errcode='22023'; end if;
  if lnk_kind='source_version' then
   select l->>'rightsVersionId' into rv from jsonb_array_elements(all_links) l where l->>'kind'='source_version' and l->>'sourceVersionId'=lnk->>'sourceVersionId' limit 1;
   if jsonb_typeof(lnk->'rightsVersionId')='string' and lnk->>'rightsVersionId'<>rv::text then raise exception 'artifact_link_not_in_manifest' using errcode='22023'; end if;
   lnk:=lnk||jsonb_build_object('rightsVersionId',rv);
  end if;
  all_links:=all_links||jsonb_build_array(lnk);
 end loop;
 -- Every target exists in this organization, on this work where the target belongs to a work.
 for lnk in select value from jsonb_array_elements(all_links) loop
  lnk_kind:=lnk->>'kind';
  if lnk_kind='source_version' then
   sv:=(lnk->>'sourceVersionId')::uuid;rv:=nullif(lnk->>'rightsVersionId','')::uuid;
   if not exists(select 1 from public.source_versions v where v.organization_id=p_org and v.id=sv)
    or (rv is not null and not exists(select 1 from private.source_rights_versions r where r.organization_id=p_org and r.source_version_id=sv and r.id=rv)) then
    raise exception 'artifact_link_target_not_found' using errcode='P0002'; end if;
   -- A projection of a legacy store carries no subject; rights are then evaluated at read time only.
   if jsonb_typeof(p_manifest->'legacy')<>'object' and (p_rights_subject is null or not private.source_use_allowed_v1(p_org,sv,p_rights_subject,'derive','analysis')) then
    raise exception 'artifact_source_use_refused' using errcode='42501'; end if;
  elsif lnk_kind='execution' then
   if not exists(select 1 from public.work_executions e where e.organization_id=p_org and e.id=(lnk->>'executionId')::uuid) then raise exception 'artifact_link_target_not_found' using errcode='P0002'; end if;
   if not exists(select 1 from public.work_executions e where e.organization_id=p_org and e.id=(lnk->>'executionId')::uuid and e.work_id=p_work) then raise exception 'artifact_link_work_mismatch' using errcode='22023'; end if;
  elsif lnk_kind='institutional_result' then
   if not exists(select 1 from private.institutional_model_results m where m.organization_id=p_org and m.id=(lnk->>'resultId')::uuid) then raise exception 'artifact_link_target_not_found' using errcode='P0002'; end if;
   if not exists(select 1 from private.institutional_model_results m where m.organization_id=p_org and m.id=(lnk->>'resultId')::uuid and m.capital_project_id=p_work) then raise exception 'artifact_link_work_mismatch' using errcode='22023'; end if;
  elsif lnk_kind='method_release' then
   if not exists(select 1 from private.platform_method_releases r where r.id=lnk->>'platformReleaseId')
    or (jsonb_typeof(lnk->'houseReleaseId')='string' and not exists(select 1 from public.method_releases h where h.organization_id=p_org and h.id=(lnk->>'houseReleaseId')::uuid))
   then raise exception 'artifact_link_target_not_found' using errcode='P0002'; end if;
  elsif lnk_kind='assumption_slot' then
   if not exists(select 1 from private.assumption_version_items i where i.organization_id=p_org and i.version_id=(lnk->>'assumptionVersionId')::uuid and i.slot_key=lnk->>'slotKey')
   then raise exception 'artifact_link_target_not_found' using errcode='P0002'; end if;
  elsif lnk_kind='artifact_revision' then
   if not exists(select 1 from public.artifact_revisions r where r.organization_id=p_org and r.id=(lnk->>'derivedFromRevisionId')::uuid) then raise exception 'artifact_link_target_not_found' using errcode='P0002'; end if;
  end if;
 end loop;
 -- Substance, as revisionSubstance of the contract: material with a block claim, a source, an
 -- execution or an institutional result; informational only for an answer of sections and
 -- paragraphs with no claim and no number; a legacy label carries the row's own evidence.
 substance:=exists(select 1 from jsonb_array_elements(blocks) b where jsonb_array_length(b.value->'claims')>0)
  or jsonb_array_length(p_manifest->'sources')>0 or jsonb_typeof(p_manifest->'execution')='object' or jsonb_typeof(p_manifest->'institutionalResult')='object'
  or jsonb_typeof(p_manifest->'legacy')='object';
 informational:=p_kind='answer' and jsonb_array_length(blocks)>0 and not exists(select 1 from jsonb_array_elements(blocks) b
  where b.value->>'kind' not in ('section','paragraph') or jsonb_array_length(b.value->'claims')>0 or private.artifact_content_carries_number_v1(b.value->'content'));
 if not (substance or informational) then raise exception 'artifact_revision_without_substance' using errcode='23514'; end if;
 -- The artifact: found and locked, or created.
 select * into a from public.artifacts x where x.organization_id=p_org and x.work_id=p_work and x.kind=p_kind and x.subject=p_subject for update;
 if not found then
  insert into public.artifacts(organization_id,work_id,kind,subject,legacy_origin)
  values(p_org,p_work,p_kind,p_subject,case when p_legacy_ref is not null then jsonb_build_object('table',p_legacy_ref->>'table','id',p_legacy_ref->>'id') end)
  on conflict on constraint artifacts_identity_key do nothing;
  select * into strict a from public.artifacts x where x.organization_id=p_org and x.work_id=p_work and x.kind=p_kind and x.subject=p_subject for update;
 end if;
 -- Replay by manifest fingerprint.
 fingerprint:=encode(extensions.digest(convert_to(p_manifest::text,'utf8'),'sha256'),'hex');
 select * into existing from public.artifact_revisions r where r.organization_id=p_org and r.manifest_fingerprint=fingerprint;
 if found then
  if existing.artifact_id<>a.id then raise exception 'artifact_revision_manifest_conflict' using errcode='23505'; end if;
  if existing.content_sha256 is distinct from p_content_sha256 or existing.byte_length is distinct from p_byte_length then
   raise exception 'artifact_revision_replay_mismatch' using errcode='23505'; end if;
  return jsonb_build_object('artifact_id',a.id,'revision_id',existing.id,'revision_no',existing.revision_no,'manifest_fingerprint',existing.manifest_fingerprint,'replayed',true);
 end if;
 select * into head from public.artifact_revisions r where r.organization_id=p_org and r.artifact_id=a.id order by r.revision_no desc limit 1;
 next_no:=coalesce(head.revision_no,0)+1;
 rev_id:=coalesce(p_revision_id,gen_random_uuid());
 insert into public.artifact_revisions(id,organization_id,artifact_id,revision_no,previous_revision_id,audience,origin,manifest,manifest_fingerprint,content_sha256,byte_length,legacy_ref,created_by)
 values(rev_id,p_org,a.id,next_no,head.id,p_audience,p_origin,p_manifest,fingerprint,p_content_sha256,p_byte_length,p_legacy_ref,p_actor);
 for blk in select value from jsonb_array_elements(blocks) loop
  blk_no:=blk_no+1;
  insert into public.artifact_blocks(organization_id,revision_id,block_no,block_key,kind,content,claims,content_fingerprint)
  values(p_org,rev_id,blk_no,blk->>'blockKey',blk->>'kind',blk->'content',blk->'claims',
   encode(extensions.digest(convert_to((blk->'content')::text,'utf8'),'sha256'),'hex'));
 end loop;
 for lnk in select value from jsonb_array_elements(all_links) loop
  lnk_block:=null;set_id:=null;
  if lnk ? 'blockKey' then select b.id into strict lnk_block from public.artifact_blocks b where b.organization_id=p_org and b.revision_id=rev_id and b.block_key=lnk->>'blockKey'; end if;
  if lnk->>'kind'='assumption_slot' then
   select i.set_id into strict set_id from private.assumption_version_items i where i.organization_id=p_org and i.version_id=(lnk->>'assumptionVersionId')::uuid and i.slot_key=lnk->>'slotKey';
  end if;
  insert into private.artifact_dependency_links(organization_id,revision_id,block_id,link_kind,source_version_id,source_rights_version_id,execution_id,institutional_result_id,
   platform_release_id,house_release_id,assumption_set_id,assumption_version_id,slot_key,derived_from_revision_id)
  values(p_org,rev_id,lnk_block,lnk->>'kind',
   case when lnk->>'kind'='source_version' then (lnk->>'sourceVersionId')::uuid end,case when lnk->>'kind'='source_version' then nullif(lnk->>'rightsVersionId','')::uuid end,
   case when lnk->>'kind'='execution' then (lnk->>'executionId')::uuid end,
   case when lnk->>'kind'='institutional_result' then (lnk->>'resultId')::uuid end,
   case when lnk->>'kind'='method_release' then lnk->>'platformReleaseId' end,case when lnk->>'kind'='method_release' and jsonb_typeof(lnk->'houseReleaseId')='string' then (lnk->>'houseReleaseId')::uuid end,
   set_id,case when lnk->>'kind'='assumption_slot' then (lnk->>'assumptionVersionId')::uuid end,case when lnk->>'kind'='assumption_slot' then lnk->>'slotKey' end,
   case when lnk->>'kind'='artifact_revision' then (lnk->>'derivedFromRevisionId')::uuid end)
  on conflict on constraint artifact_dependency_links_target_key do nothing;
 end loop;
 update public.artifacts set head_revision_id=rev_id where organization_id=p_org and id=a.id;
 return jsonb_build_object('artifact_id',a.id,'revision_id',rev_id,'revision_no',next_no,'manifest_fingerprint',fingerprint,'replayed',false);
end $function$
