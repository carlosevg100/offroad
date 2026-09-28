-- Stage 20, increment 2: immutable human acts over exact artifact revisions.
-- Full literal writer definition; no edits to historical manifests or revisions.
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
  -- A manifest is not a digest of the blocks or of extra dependency edges. Replay is
  -- valid only for the identical ordered blocks and the identical normalized edge set.
  if blocks is distinct from (select coalesce(jsonb_agg(jsonb_build_object(
    'blockKey',b.block_key,'kind',b.kind,'content',b.content,'claims',b.claims) order by b.block_no),'[]'::jsonb)
    from public.artifact_blocks b where b.organization_id=p_org and b.revision_id=existing.id)
  then raise exception 'artifact_revision_replay_mismatch' using errcode='23505'; end if;
  if exists (
   with requested as (
    select distinct jsonb_strip_nulls(jsonb_build_object(
     'kind',l->>'kind','blockKey',l->>'blockKey',
     'sourceVersionId',nullif(l->>'sourceVersionId','')::uuid,
     'rightsVersionId',nullif(l->>'rightsVersionId','')::uuid,
     'executionId',nullif(l->>'executionId','')::uuid,
     'resultId',nullif(l->>'resultId','')::uuid,
     'platformReleaseId',l->>'platformReleaseId',
     'houseReleaseId',nullif(l->>'houseReleaseId','')::uuid,
     'assumptionVersionId',nullif(l->>'assumptionVersionId','')::uuid,
     'slotKey',l->>'slotKey','derivedFromRevisionId',nullif(l->>'derivedFromRevisionId','')::uuid)) edge
    from jsonb_array_elements(all_links) l
   ), stored as (
    select jsonb_strip_nulls(jsonb_build_object(
     'kind',d.link_kind,'blockKey',b.block_key,
     'sourceVersionId',d.source_version_id,'rightsVersionId',d.source_rights_version_id,
     'executionId',d.execution_id,'resultId',d.institutional_result_id,
     'platformReleaseId',d.platform_release_id,'houseReleaseId',d.house_release_id,
     'assumptionVersionId',d.assumption_version_id,'slotKey',d.slot_key,
     'derivedFromRevisionId',d.derived_from_revision_id)) edge
    from private.artifact_dependency_links d left join public.artifact_blocks b
     on b.organization_id=d.organization_id and b.revision_id=d.revision_id and b.id=d.block_id
    where d.organization_id=p_org and d.revision_id=existing.id
   )
   (select edge from requested except select edge from stored)
   union all
   (select edge from stored except select edge from requested)
  ) then raise exception 'artifact_revision_replay_mismatch' using errcode='23505'; end if;
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
end $function$;

-- Human review history is immutable. No table-level client read: notes and reports inherit
-- the complete source authority of their exact basis, evaluated by the guarded readers.
create table public.artifact_reviews (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 artifact_id uuid not null,
 revision_id uuid not null,
 manifest_fingerprint text not null check(manifest_fingerprint ~ '^[a-f0-9]{64}$'),
 audience text not null check(audience in ('internal','advisor','external')),
 act text not null check(act in ('comment','return','approve','reaffirm','revoke_approval','reassign')),
 reviewer_id uuid not null references auth.users(id) on delete restrict,
 prepared_by uuid references auth.users(id) on delete restrict,
 self_approval_declared boolean not null default false,
 review_mode text not null check(review_mode in ('individual','assigned','open','legacy')),
 policy_snapshot jsonb,
 block_id uuid,
 block_key text,
 basis_review_id uuid,
 change_report jsonb,
 command_id uuid not null,
 note text check(note is null or length(btrim(note)) between 1 and 5000),
 legacy_ref jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,work_id,command_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,artifact_id,revision_id) references public.artifact_revisions(organization_id,artifact_id,id),
 foreign key(organization_id,revision_id,block_id) references public.artifact_blocks(organization_id,revision_id,id),
 foreign key(organization_id,basis_review_id) references public.artifact_reviews(organization_id,id),
 check((block_id is null)=(block_key is null)),
 check(block_id is null or act in ('comment','return')),
 check(act not in ('reaffirm','revoke_approval') or basis_review_id is not null),
 check(basis_review_id is distinct from id),
 check(review_mode='legacy' or (policy_snapshot is not null and jsonb_typeof(policy_snapshot)='object')),
 check(act<>'reaffirm' or (change_report is not null and coalesce(change_report->>'outcome'='cosmetic',false)))
);
create index artifact_reviews_revision_idx on public.artifact_reviews(organization_id,revision_id,created_at,id);
create index artifact_reviews_basis_idx on public.artifact_reviews(organization_id,basis_review_id) where basis_review_id is not null;
create index artifact_reviews_reviewer_idx on public.artifact_reviews(reviewer_id);
create index artifact_reviews_preparer_idx on public.artifact_reviews(prepared_by) where prepared_by is not null;
create index artifact_reviews_block_idx on public.artifact_reviews(organization_id,revision_id,block_id) where block_id is not null;
create index artifact_reviews_artifact_idx on public.artifact_reviews(organization_id,artifact_id,revision_id);

create table public.work_decisions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 decision_key text not null check(length(btrim(decision_key)) between 1 and 2000),
 revision integer not null check(revision>0),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 kind text not null check(kind in ('authorize_execution','approve_material_package','approve_configuration','adopt_update','adopt_import','choose_alternative','confirm_assessment','record_report')),
 outcome text not null check(outcome in ('approved','rejected','recorded')),
 basis jsonb not null check(jsonb_typeof(basis)='object'),
 effects text[] not null check(cardinality(effects) between 1 and 3 and effects <@ array['queue_execution','recompute','freeze_assessment','none']::text[]),
 origin text not null check(origin in ('in_product','reported')),
 report jsonb,
 note text check(note is null or length(btrim(note)) between 1 and 5000),
 decided_by uuid not null references auth.users(id) on delete restrict,
 expected_previous_revision integer check(expected_previous_revision>0),
 supersedes_decision_id uuid,
 contested boolean not null default false,
 command_id uuid not null,
 review_mode text not null check(review_mode in ('individual','assigned','open','legacy')),
 policy_snapshot jsonb,
 legacy_ref jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,work_id,decision_key,revision),
 unique(organization_id,work_id,command_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,supersedes_decision_id) references public.work_decisions(organization_id,id),
 check(expected_previous_revision is null or expected_previous_revision<revision),
 check(supersedes_decision_id is distinct from id),
 check(not contested or supersedes_decision_id is null),
 check(origin<>'reported' or (report is not null and jsonb_typeof(report)='object' and effects=array['none']::text[])),
 check(origin<>'in_product' or report is null),
 check(kind<>'record_report' or origin='reported'),
 check(not ('none'=any(effects)) or effects=array['none']::text[]),
 check(outcome<>'rejected' or effects=array['none']::text[] or (kind='confirm_assessment' and effects=array['freeze_assessment']::text[])),
 check(review_mode='legacy' or (policy_snapshot is not null and jsonb_typeof(policy_snapshot)='object'))
);
create index work_decisions_actor_idx on public.work_decisions(decided_by);
create index work_decisions_supersedes_idx on public.work_decisions(organization_id,supersedes_decision_id) where supersedes_decision_id is not null;

alter table public.artifact_reviews enable row level security;
alter table public.artifact_reviews force row level security;
alter table public.work_decisions enable row level security;
alter table public.work_decisions force row level security;
create policy artifact_reviews_select on public.artifact_reviews for select to authenticated using(false);
create policy artifact_reviews_insert on public.artifact_reviews for insert to authenticated with check(false);
create policy artifact_reviews_update on public.artifact_reviews for update to authenticated using(false) with check(false);
create policy artifact_reviews_delete on public.artifact_reviews for delete to authenticated using(false);
create policy work_decisions_select on public.work_decisions for select to authenticated using(false);
create policy work_decisions_insert on public.work_decisions for insert to authenticated with check(false);
create policy work_decisions_update on public.work_decisions for update to authenticated using(false) with check(false);
create policy work_decisions_delete on public.work_decisions for delete to authenticated using(false);
revoke all on public.artifact_reviews, public.work_decisions from public,anon,authenticated,service_role;
create function private.reject_review_history_mutation_v1() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'review_history_immutable' using errcode='23514'; end $$;
revoke all on function private.reject_review_history_mutation_v1() from public,anon,authenticated,service_role;
create trigger artifact_reviews_immutable before update or delete on public.artifact_reviews for each row execute function private.reject_review_history_mutation_v1();
create trigger work_decisions_immutable before update or delete on public.work_decisions for each row execute function private.reject_review_history_mutation_v1();
create trigger artifact_reviews_no_truncate before truncate on public.artifact_reviews for each statement execute function private.reject_review_history_mutation_v1();
create trigger work_decisions_no_truncate before truncate on public.work_decisions for each statement execute function private.reject_review_history_mutation_v1();
create trigger artifact_reviews_set_updated_at before update on public.artifact_reviews for each row execute function private.set_updated_at();
create trigger work_decisions_set_updated_at before update on public.work_decisions for each row execute function private.set_updated_at();
create trigger artifact_reviews_audit after insert on public.artifact_reviews for each row execute function private.capture_audit_event();
create trigger work_decisions_audit after insert on public.work_decisions for each row execute function private.capture_audit_event();

alter table public.organization_review_policies add column assignment_required boolean not null default false;
alter table public.capital_project_review_policies add column assignment_required text not null default 'inherit'
 check(assignment_required in ('inherit','required','not_required'));

-- Preserve existing assigned projects without granting authority to unassigned members.
-- This only initializes the new regime column; the old self-approval policy is untouched.
insert into public.capital_project_review_policies(organization_id,capital_project_id,assignment_required)
 select distinct organization_id,capital_project_id,'required' from public.capital_project_review_assignments
 on conflict(organization_id,capital_project_id) do update set assignment_required='required';


-- Pure mirror of describeRevisionChange, exercised from the same JSON fixtures as TypeScript.
create function private.artifact_review_change_report_v1(p_previous jsonb,p_next jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare
 before_blocks jsonb:=p_previous->'blocks'; after_blocks jsonb:=p_next->'blocks';
 before_revision jsonb:=p_previous->'revision'; after_revision jsonb:=p_next->'revision';
 before_manifest jsonb:=before_revision->'manifest'; after_manifest jsonb:=after_revision->'manifest';
 reasons text[]:='{}'::text[]; a jsonb; b jsonb; snap jsonb; field text;
begin
 foreach snap in array array[p_previous,p_next] loop
  if (select count(*)<>count(distinct x->>'blockKey') from jsonb_array_elements(snap->'blocks') x)
   or (select count(*)<>count(distinct c->>'claimId') from jsonb_array_elements(snap->'blocks') x cross join jsonb_array_elements(x->'claims') c)
  then return jsonb_build_object('outcome','material','reasons',jsonb_build_array('invalid_snapshot')); end if;
 end loop;
 select coalesce(jsonb_agg(x-array['id','revisionId','blockNo'] order by (x->>'blockNo')::integer),'[]') into a from jsonb_array_elements(before_blocks) x;
 select coalesce(jsonb_agg(x-array['id','revisionId','blockNo'] order by (x->>'blockNo')::integer),'[]') into b from jsonb_array_elements(after_blocks) x;
 if before_manifest=after_manifest and before_revision->'manifestFingerprint' is not distinct from after_revision->'manifestFingerprint'
  and a=b and before_revision->'contentSha256' is not distinct from after_revision->'contentSha256'
  and before_revision->'byteLength' is not distinct from after_revision->'byteLength'
  and before_revision->'audience'=after_revision->'audience'
 then return jsonb_build_object('outcome','identical','reasons','[]'::jsonb); end if;
 select coalesce(jsonb_object_agg(c->>'claimId',c-array['claimId','supportIds']),'{}') into a
  from jsonb_array_elements(before_blocks) x cross join jsonb_array_elements(x->'claims') c;
 select coalesce(jsonb_object_agg(c->>'claimId',c-array['claimId','supportIds']),'{}') into b
  from jsonb_array_elements(after_blocks) x cross join jsonb_array_elements(x->'claims') c;
 if (select array_agg(k order by k) from jsonb_object_keys(a) k) is distinct from (select array_agg(k order by k) from jsonb_object_keys(b) k)
 then reasons:=array_append(reasons,'claim_set'); end if;
 if exists(select 1 from jsonb_each(a) x join jsonb_each(b) y on x.key=y.key where x.value<>y.value)
 then reasons:=array_append(reasons,'claim_value'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('key',x->'blockKey','kind',x->'kind','content',x->'content') order by x->>'blockKey'),'[]') into a from jsonb_array_elements(before_blocks) x;
 select coalesce(jsonb_agg(jsonb_build_object('key',x->'blockKey','kind',x->'kind','content',x->'content') order by x->>'blockKey'),'[]') into b from jsonb_array_elements(after_blocks) x;
 if a<>b then reasons:=array_append(reasons,'block_content'); end if;
 select coalesce(jsonb_agg(jsonb_build_object('key',x->'blockKey','claims',
  (select coalesce(jsonb_agg(jsonb_build_object('id',c->'claimId','supportIds',
   (select coalesce(jsonb_agg(s order by s),'[]') from jsonb_array_elements(c->'supportIds') s)) order by n),'[]')
   from jsonb_array_elements(x->'claims') with ordinality t(c,n))) order by x->>'blockKey'),'[]') into a from jsonb_array_elements(before_blocks) x;
 select coalesce(jsonb_agg(jsonb_build_object('key',x->'blockKey','claims',
  (select coalesce(jsonb_agg(jsonb_build_object('id',c->'claimId','supportIds',
   (select coalesce(jsonb_agg(s order by s),'[]') from jsonb_array_elements(c->'supportIds') s)) order by n),'[]')
   from jsonb_array_elements(x->'claims') with ordinality t(c,n))) order by x->>'blockKey'),'[]') into b from jsonb_array_elements(after_blocks) x;
 if a<>b then reasons:=array_append(reasons,'claim_support'); end if;
 select coalesce(jsonb_agg(x order by x->>'sourceVersionId'),'[]') into a from jsonb_array_elements(before_manifest->'sources') x;
 select coalesce(jsonb_agg(x order by x->>'sourceVersionId'),'[]') into b from jsonb_array_elements(after_manifest->'sources') x;
 if a<>b then reasons:=array_append(reasons,'source_versions'); end if;
 if before_manifest->'method' is distinct from after_manifest->'method' then reasons:=array_append(reasons,'method_release'); end if;
 if before_manifest->'execution' is distinct from after_manifest->'execution' then reasons:=array_append(reasons,'execution'); end if;
 if before_manifest->'institutionalResult' is distinct from after_manifest->'institutionalResult' then reasons:=array_append(reasons,'institutional_result'); end if;
 if before_revision->'audience' is distinct from after_revision->'audience' then reasons:=array_append(reasons,'audience'); end if;
 a:='{}';b:='{}';
 foreach field in array array['kind','format','inputSnapshot','traces','provenance','legacy'] loop
  a:=a||jsonb_build_object(field,before_manifest->field);b:=b||jsonb_build_object(field,after_manifest->field);
 end loop;
 a:=a||jsonb_build_object('claims',(select coalesce(jsonb_agg(x order by x->>'blockKey'),'[]') from jsonb_array_elements(before_manifest->'claims') x));
 b:=b||jsonb_build_object('claims',(select coalesce(jsonb_agg(x order by x->>'blockKey'),'[]') from jsonb_array_elements(after_manifest->'claims') x));
 if a<>b then reasons:=array_append(reasons,'manifest_context'); end if;
 if before_manifest->'bytes' is distinct from after_manifest->'bytes'
  or before_revision->'contentSha256' is distinct from after_revision->'contentSha256'
  or before_revision->'byteLength' is distinct from after_revision->'byteLength'
 then reasons:=array_append(reasons,'unverified_bytes'); end if;
 return jsonb_build_object('outcome',case when cardinality(reasons)>0 then 'material' else 'cosmetic' end,'reasons',to_jsonb(reasons));
end $$;
revoke all on function private.artifact_review_change_report_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

-- Policy writes and review commands share the existing organization policy lock. Readers do
-- not lock policy rows after acquiring this lock, avoiding row/advisory lock inversion.
create function private.serialize_review_policy_change_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||coalesce(new.organization_id,old.organization_id)::text,0));
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.serialize_review_policy_change_v1() from public,anon,authenticated,service_role;
create trigger organization_review_policy_serialization before insert or update or delete on public.organization_review_policies
 for each row execute function private.serialize_review_policy_change_v1();
create trigger project_review_policy_serialization before insert or update or delete on public.capital_project_review_policies
 for each row execute function private.serialize_review_policy_change_v1();

create function private.lock_review_work_v1(p_work uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();org uuid;
begin
 perform 1 from auth.users where id=actor and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'review_work_access_required' using errcode='42501'; end if;
 select organization_id into org from public.capital_projects where id=p_work and status<>'archived' for no key update;
 if not found then raise exception 'review_work_access_required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||org::text,0));
 if not exists(select 1 from public.organization_memberships where organization_id=org and user_id=actor and status='active')
  or not private.can_access_resource_v1(org,p_work,'work')
 then raise exception 'review_work_access_required' using errcode='42501'; end if;
 return org;
end $$;
revoke all on function private.lock_review_work_v1(uuid) from public,anon,authenticated,service_role;

create function private.review_policy_snapshot_v1(p_org uuid,p_work uuid,p_actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('assignmentRequired',coalesce(
  (select case assignment_required when 'required' then true when 'not_required' then false end from public.capital_project_review_policies where organization_id=p_org and capital_project_id=p_work),
  (select assignment_required from public.organization_review_policies where organization_id=p_org),false),
  'selfApprovalAllowed',private.capital_project_self_approval_allowed(p_org,p_work),
  'roles',coalesce((select jsonb_agg(review_role order by review_role) from public.capital_project_review_assignments where organization_id=p_org and capital_project_id=p_work and user_id=p_actor),'[]'::jsonb));
$$;
revoke all on function private.review_policy_snapshot_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Snapshots are built only from immutable rows. The pure classifier cannot authorize a read.
create function private.artifact_review_snapshot_v1(p_org uuid,p_revision uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revision',jsonb_build_object('id',r.id,'artifactId',r.artifact_id,'revisionNo',r.revision_no,
  'previousRevisionId',r.previous_revision_id,'origin',r.origin,'createdAt',r.created_at,'createdBy',r.created_by,'legacyRef',r.legacy_ref,
  'manifest',r.manifest,'manifestFingerprint',r.manifest_fingerprint,
  'contentSha256',r.content_sha256,'byteLength',r.byte_length,'audience',r.audience),
  'blocks',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'revisionId',b.revision_id,'blockKey',b.block_key,'blockNo',b.block_no,'kind',b.kind,
   'content',b.content,'claims',b.claims,'contentFingerprint',b.content_fingerprint) order by b.block_no),'[]')
   from public.artifact_blocks b where b.organization_id=p_org and b.revision_id=r.id))
 from public.artifact_revisions r where r.organization_id=p_org and r.id=p_revision;
$$;
revoke all on function private.artifact_review_snapshot_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function private.artifact_revision_change_v1(p_previous uuid,p_next uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare before_revision public.artifact_revisions; after_revision public.artifact_revisions;report jsonb; a jsonb;b jsonb;
begin
 select * into before_revision from public.artifact_revisions where id=p_previous;
 select * into after_revision from public.artifact_revisions where id=p_next;
 if before_revision.id is null or after_revision.id is null or before_revision.organization_id<>after_revision.organization_id or before_revision.artifact_id<>after_revision.artifact_id
 then raise exception 'artifact_review_basis_invalid' using errcode='22023'; end if;
 report:=private.artifact_review_change_report_v1(private.artifact_review_snapshot_v1(before_revision.organization_id,p_previous),private.artifact_review_snapshot_v1(after_revision.organization_id,p_next));
 -- Extra ancestry, assumption pins and anchors are outside manifest JSON. A different dependency
 -- set is material even when the visible blocks and manifest compare as cosmetic.
 select coalesce(jsonb_agg(edge order by edge),'[]') into a from (
  select (to_jsonb(l)-array['id','organization_id','revision_id','block_id','created_at'])||jsonb_build_object('block_key',b.block_key) edge
  from private.artifact_dependency_links l left join public.artifact_blocks b on b.organization_id=l.organization_id and b.id=l.block_id
  where l.organization_id=before_revision.organization_id and l.revision_id=p_previous) q;
 select coalesce(jsonb_agg(edge order by edge),'[]') into b from (
  select (to_jsonb(l)-array['id','organization_id','revision_id','block_id','created_at'])||jsonb_build_object('block_key',b.block_key) edge
  from private.artifact_dependency_links l left join public.artifact_blocks b on b.organization_id=l.organization_id and b.id=l.block_id
  where l.organization_id=after_revision.organization_id and l.revision_id=p_next) q;
 if a<>b then
  report:=jsonb_set(report,'{outcome}','"material"');
  if not (report->'reasons' ? 'manifest_context') then report:=jsonb_set(report,'{reasons}',report->'reasons'||'"manifest_context"'::jsonb); end if;
 end if;
 return report;
end $$;
revoke all on function private.artifact_revision_change_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function private.artifact_review_is_active_v1(p_org uuid,p_review uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare current_review public.artifact_reviews; target public.artifact_reviews; visited uuid[]:='{}'::uuid[];
begin
 select * into target from public.artifact_reviews where organization_id=p_org and id=p_review;
 current_review:=target;
 loop
  if current_review.id is null or current_review.id=any(visited) or cardinality(visited)>=128
   or current_review.act not in ('approve','reaffirm')
   or exists(select 1 from public.artifact_reviews r where r.organization_id=p_org and r.act='revoke_approval' and r.basis_review_id=current_review.id)
  then return false; end if;
  if current_review.act='approve' then return true; end if;
  visited:=array_append(visited,current_review.id);
  if current_review.change_report->>'outcome' is distinct from 'cosmetic' then return false; end if;
  select * into current_review from public.artifact_reviews where organization_id=p_org and id=current_review.basis_review_id;
  if current_review.artifact_id is distinct from target.artifact_id or current_review.work_id is distinct from target.work_id
   or current_review.audience is distinct from target.audience then return false; end if;
 end loop;
end $$;
revoke all on function private.artifact_review_is_active_v1(uuid,uuid) from public,anon,authenticated,service_role;

create function private.artifact_review_preparer_v1(p_revision public.artifact_revisions) returns uuid
language sql stable security definer set search_path='' as $$
 select coalesce(p_revision.created_by,
  (select j.authorization_subject_id from public.processing_jobs j where j.organization_id=p_revision.organization_id
   and j.id=nullif(p_revision.manifest#>>'{provenance,jobId}','')::uuid),
  (select x.created_by from public.capital_project_artifacts x where x.organization_id=p_revision.organization_id
   and p_revision.legacy_ref->>'table'='capital_project_artifacts' and x.id=(p_revision.legacy_ref->>'id')::uuid));
$$;
revoke all on function private.artifact_review_preparer_v1(public.artifact_revisions) from public,anon,authenticated,service_role;

create function private.review_artifact_revision_v1(
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
  return jsonb_build_object('reviewId',existing.id,'revisionId',r.id,'act',existing.act,'replayed',true);
 end if;
 insert into public.artifact_reviews(organization_id,work_id,artifact_id,revision_id,manifest_fingerprint,audience,act,reviewer_id,prepared_by,
  self_approval_declared,review_mode,policy_snapshot,block_id,block_key,basis_review_id,change_report,command_id,note)
 values(org,a.work_id,a.id,r.id,r.manifest_fingerprint,r.audience,p_act,actor,preparer,p_self_approval_declared,mode,policy,p_block_id,block_key_value,p_basis_review_id,change,p_command_id,p_note)
 returning id into review_id;
 return jsonb_build_object('reviewId',review_id,'revisionId',r.id,'act',p_act,'replayed',false);
end $$;
create function public.review_artifact_revision_v1(
 p_revision_id uuid,p_expected_fingerprint text,p_act text,p_block_id uuid,p_note text,
 p_self_approval_declared boolean,p_command_id uuid,p_basis_review_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$
 select private.review_artifact_revision_v1(p_revision_id,p_expected_fingerprint,p_act,p_block_id,p_note,p_self_approval_declared,p_command_id,p_basis_review_id);
$$;
revoke all on function private.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid),public.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid),public.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid) to authenticated;

-- Dedicated review context, requiring work authority. The ordinary artifact reader continues
-- to enforce release for external consumption; this reader makes an unreleased draft reviewable.
create function private.read_artifact_revision_reviews_v1(p_revision_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.artifact_revisions;a public.artifacts;org uuid;actor uuid:=auth.uid();history jsonb;policy jsonb;allowed boolean;
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
 return jsonb_build_object('revisionId',r.id,'withheld',false,'reviews',history,'snapshot',private.artifact_review_snapshot_v1(org,r.id),
  'artifact',jsonb_build_object('id',a.id,'workId',a.work_id,'kind',a.kind,'subject',a.subject,'headRevisionId',a.head_revision_id),
  'isHead',a.head_revision_id=r.id,'policy',policy,'preparedBy',private.artifact_review_preparer_v1(r),'freshness',private.artifact_revision_freshness_v1(r),
  'release',private.artifact_revision_release_v1(r));
end $$;
create function public.read_artifact_revision_reviews_v1(p_revision_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.read_artifact_revision_reviews_v1(p_revision_id);$$;
revoke all on function private.read_artifact_revision_reviews_v1(uuid),public.read_artifact_revision_reviews_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_artifact_revision_reviews_v1(uuid),public.read_artifact_revision_reviews_v1(uuid) to authenticated;

create function private.validate_work_decision_basis_v1(p_basis jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare item jsonb;key text;uid text:='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';hex text:='^[a-f0-9]{64}$';
begin
 if p_basis is null or jsonb_typeof(p_basis)<>'object'
  or not (p_basis ?& array['artifacts','milestones','assessments','decisions','execution','configuration'])
  or p_basis-array['artifacts','milestones','assessments','decisions','execution','configuration']<>'{}'
 then raise exception 'work_decision_basis_invalid' using errcode='22023'; end if;
 foreach key in array array['artifacts','milestones','assessments','decisions'] loop
  if jsonb_typeof(p_basis->key)<>'array' or jsonb_array_length(p_basis->key)>100 then raise exception 'work_decision_basis_invalid' using errcode='22023'; end if;
 end loop;
 for item in select value from jsonb_array_elements(p_basis->'artifacts') loop
  if jsonb_typeof(item)<>'object' or not (item ?& array['artifactRevisionId','manifestFingerprint'])
   or coalesce(item->>'artifactRevisionId','') !~ uid or coalesce(item->>'manifestFingerprint','') !~ hex
   or item-array['artifactRevisionId','manifestFingerprint']<>'{}' then raise exception 'work_decision_basis_invalid' using errcode='22023'; end if;
 end loop;
 for item in select value from jsonb_array_elements(p_basis->'milestones') loop
  if jsonb_typeof(item)<>'object' or coalesce(item->>'milestoneId','') !~ uid or item-'milestoneId'<>'{}'
  then raise exception 'work_decision_basis_invalid' using errcode='22023'; end if;
 end loop;
 for item in select value from jsonb_array_elements(p_basis->'assessments') loop
  if jsonb_typeof(item)<>'object' or length(btrim(coalesce(item->>'decisionKey',''))) not between 1 and 2000
   or coalesce(item->>'revision','') !~ '^[1-9][0-9]*$' or jsonb_typeof(item->'revision')<>'number'
   or coalesce(item->>'decisionFingerprint','') !~ hex or item-array['decisionKey','revision','decisionFingerprint']<>'{}'
  then raise exception 'work_decision_basis_invalid' using errcode='22023'; end if;
 end loop;
 for item in select value from jsonb_array_elements(p_basis->'decisions') loop
  if jsonb_typeof(item)<>'object' or coalesce(item->>'decisionId','') !~ uid
   or coalesce(item->>'revision','') !~ '^[1-9][0-9]*$' or jsonb_typeof(item->'revision')<>'number'
   or coalesce(item->>'fingerprint','') !~ hex or item-array['decisionId','revision','fingerprint']<>'{}'
  then raise exception 'work_decision_basis_invalid' using errcode='22023'; end if;
 end loop;
 if (select count(*)<>count(distinct x->>'decisionId') from jsonb_array_elements(p_basis->'decisions') x)
 then raise exception 'decision_basis_duplicate' using errcode='22023'; end if;
 item:=p_basis->'execution';
 if jsonb_typeof(item)<>'null' and (jsonb_typeof(item)<>'object'
  or coalesce(item->>'briefFingerprint','') !~ hex or coalesce(item->>'payloadFingerprint','') !~ hex
  or coalesce(item->>'inputFingerprint','') !~ hex or item-array['briefFingerprint','payloadFingerprint','inputFingerprint']<>'{}')
 then raise exception 'work_decision_basis_invalid' using errcode='22023'; end if;
 item:=p_basis->'configuration';
 if jsonb_typeof(item)<>'null' and (jsonb_typeof(item)<>'object'
  or not (item ?& array['configurationFingerprint','structureFingerprint','uploadFingerprint'])
  or coalesce(item->>'configurationFingerprint','') !~ hex
  or (item->>'structureFingerprint' is null)<>(item->>'uploadFingerprint' is null)
  or (item->>'structureFingerprint' is not null and item->>'structureFingerprint' !~ hex)
  or (item->>'uploadFingerprint' is not null and item->>'uploadFingerprint' !~ hex)
  or item-array['configurationFingerprint','structureFingerprint','uploadFingerprint']<>'{}')
 then raise exception 'work_decision_basis_invalid' using errcode='22023'; end if;
end $$;
revoke all on function private.validate_work_decision_basis_v1(jsonb) from public,anon,authenticated,service_role;

-- Precedence is computed from all immutable rows, never from MAX(revision) alone.
create function private.work_decision_precedence_v1(p_org uuid,p_work uuid,p_key text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d public.work_decisions; current_id uuid;preceding_id uuid;tips uuid[]:='{}'::uuid[];n integer:=0;resolves boolean;ref jsonb;
begin
 for d in select * from public.work_decisions where organization_id=p_org and work_id=p_work and decision_key=p_key order by revision loop
  if d.revision<>n+1 or (n=0 and d.contested) then raise exception 'decision_history_invalid' using errcode='23514'; end if;
  for ref in select value from jsonb_array_elements(d.basis->'decisions') loop
   if not exists(select 1 from public.work_decisions x where x.organization_id=p_org and x.work_id=p_work and x.decision_key=p_key
    and x.id=(ref->>'decisionId')::uuid and x.revision=(ref->>'revision')::integer and x.revision<d.revision and x.fingerprint=ref->>'fingerprint')
   then raise exception 'decision_basis_invalid' using errcode='23514'; end if;
  end loop;
  if d.supersedes_decision_id is not null and d.supersedes_decision_id is distinct from current_id
  then raise exception 'decision_supersession_invalid' using errcode='23514'; end if;
  resolves:=cardinality(tips)>1 and not exists(select 1 from unnest(tips) tip where not exists(
   select 1 from jsonb_array_elements(d.basis->'decisions') r where (r->>'decisionId')::uuid=tip));
  if not d.contested and d.expected_previous_revision is not distinct from nullif(n,0) and (cardinality(tips)<2 or resolves) then
   preceding_id:=coalesce(current_id,preceding_id);current_id:=d.id;tips:=array[d.id];
  else
   preceding_id:=coalesce(current_id,preceding_id);current_id:=null;tips:=array_append(tips,d.id);
  end if;
  n:=n+1;
 end loop;
 return jsonb_build_object('state',case when n=0 then 'empty' when current_id is not null then 'current' else 'contested' end,
  'currentId',current_id,'precedingId',preceding_id,'unresolvedIds',case when current_id is null then to_jsonb(tips) else '[]'::jsonb end,'lastRevision',n);
end $$;
revoke all on function private.work_decision_precedence_v1(uuid,uuid,text) from public,anon,authenticated,service_role;

-- Single append core for explicit commands and legacy projections. Callers establish authority;
-- the core never calls a legacy writer, queues work, publishes or sends material.
create function private.append_work_decision_v1(
 p_org uuid,p_work uuid,p_key text,p_kind text,p_basis jsonb,p_effects text[],p_origin text,p_report jsonb,p_note text,
 p_actor uuid,p_expected_previous_revision integer,p_command uuid,p_review_mode text,p_policy jsonb,
 p_legacy_ref jsonb default null,p_created_at timestamptz default null,p_outcome text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.work_decisions;state jsonb;ref jsonb;next_revision integer;is_contested boolean;supersedes uuid;id_value uuid;fp text;tip jsonb;outcome_value text:=coalesce(p_outcome,case when p_origin='reported' then 'recorded' else 'approved' end);
begin
 perform private.validate_work_decision_basis_v1(p_basis);
 if outcome_value not in ('approved','rejected','recorded') or (p_kind='confirm_assessment' and p_outcome is null)
  or (p_origin='reported' and outcome_value<>'recorded') or (p_origin='in_product' and outcome_value='recorded')
 then raise exception 'work_decision_outcome_required' using errcode='22023'; end if;
 if p_actor is null or p_command is null or length(btrim(coalesce(p_key,''))) not between 1 and 2000
  or p_kind is null or p_kind not in ('authorize_execution','approve_material_package','approve_configuration','adopt_update','adopt_import','choose_alternative','confirm_assessment','record_report')
  or p_origin is null or p_origin not in ('in_product','reported')
  or p_effects is null or cardinality(p_effects) not between 1 and 3 or array_position(p_effects,null) is not null
  or not (p_effects <@ array['queue_execution','recompute','freeze_assessment','none']::text[])
  or (select count(*)<>count(distinct x) from unnest(p_effects) x)
  or ('none'=any(p_effects) and p_effects<>array['none']::text[])
  or (p_note is not null and length(btrim(p_note)) not between 1 and 5000)
 then raise exception 'work_decision_invalid' using errcode='22023'; end if;
 if outcome_value='rejected' and p_effects<>array['none']::text[]
  and not (p_kind='confirm_assessment' and p_effects=array['freeze_assessment']::text[])
 then raise exception 'rejected_decision_has_operational_effect' using errcode='22023'; end if;
 if p_origin='reported' then
  if p_effects<>array['none']::text[] or p_report is null or jsonb_typeof(p_report)<>'object'
   or not (p_report ?& array['decidedBy','forum','decidedOn','evidenceSourceVersionId'])
   or length(btrim(coalesce(p_report->>'decidedBy',''))) not between 1 and 2000
   or length(btrim(coalesce(p_report->>'forum',''))) not between 1 and 2000
   or coalesce(p_report->>'decidedOn','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or p_report-array['decidedBy','forum','decidedOn','evidenceSourceVersionId']<>'{}'
  then raise exception 'reported_decision_has_effect' using errcode='22023'; end if;
  perform (p_report->>'decidedOn')::date;
  if p_report->>'evidenceSourceVersionId' is not null then perform (p_report->>'evidenceSourceVersionId')::uuid; end if;
 elsif p_report is not null then raise exception 'decision_report_origin_mismatch' using errcode='22023'; end if;
 if p_kind='record_report' and p_origin<>'reported' then raise exception 'decision_report_required' using errcode='22023'; end if;
 -- All append paths use the project row. This is compatible with the earlier legacy writers'
 -- project lock and with the new command's human/project/policy order.
 perform 1 from public.capital_projects where organization_id=p_org and id=p_work for no key update;
 if not found then raise exception 'work_decision_basis_invalid' using errcode='22023'; end if;
 select * into previous from public.work_decisions where organization_id=p_org and work_id=p_work and command_id=p_command;
 if found then
  if previous.decision_key<>p_key or previous.kind<>p_kind or previous.outcome<>outcome_value or previous.basis<>p_basis or previous.effects<>p_effects
   or previous.origin<>p_origin or previous.report is distinct from p_report or previous.note is distinct from p_note
   or previous.decided_by<>p_actor or previous.expected_previous_revision is distinct from p_expected_previous_revision
  then raise exception 'work_decision_replay_mismatch' using errcode='23505'; end if;
  return jsonb_build_object('decisionId',previous.id,'revision',previous.revision,'fingerprint',previous.fingerprint,'contested',previous.contested,'replayed',true);
 end if;
 state:=private.work_decision_precedence_v1(p_org,p_work,p_key);
 next_revision:=(state->>'lastRevision')::integer+1;
 if (p_expected_previous_revision is not null and (p_expected_previous_revision<1 or p_expected_previous_revision>=next_revision))
 then raise exception 'decision_previous_revision_invalid' using errcode='22023'; end if;
 for ref in select value from jsonb_array_elements(p_basis->'decisions') loop
  if not exists(select 1 from public.work_decisions where organization_id=p_org and work_id=p_work and decision_key=p_key
   and id=(ref->>'decisionId')::uuid and revision=(ref->>'revision')::integer and fingerprint=ref->>'fingerprint')
  then raise exception 'decision_basis_invalid' using errcode='22023'; end if;
 end loop;
 is_contested:=p_expected_previous_revision is distinct from nullif(next_revision-1,0);
 if state->>'state'='contested' then
  for tip in select value from jsonb_array_elements(state->'unresolvedIds') loop
   if not exists(select 1 from jsonb_array_elements(p_basis->'decisions') x where x->'decisionId'=tip) then is_contested:=true; end if;
  end loop;
 end if;
 supersedes:=case when not is_contested then (state->>'currentId')::uuid end;
 fp:=encode(extensions.digest(convert_to(jsonb_build_object('organizationId',p_org,'workId',p_work,'decisionKey',p_key,'revision',next_revision,
  'kind',p_kind,'outcome',outcome_value,'basis',p_basis,'effects',p_effects,'origin',p_origin,'report',p_report,'note',p_note,'decidedBy',p_actor,
  'expectedPreviousRevision',p_expected_previous_revision,'supersedesDecisionId',supersedes,'contested',is_contested,'commandId',p_command)::text,'utf8'),'sha256'),'hex');
 insert into public.work_decisions(organization_id,work_id,decision_key,revision,fingerprint,kind,outcome,basis,effects,origin,report,note,decided_by,
  expected_previous_revision,supersedes_decision_id,contested,command_id,review_mode,policy_snapshot,legacy_ref,created_at,updated_at)
 values(p_org,p_work,p_key,next_revision,fp,p_kind,outcome_value,p_basis,p_effects,p_origin,p_report,p_note,p_actor,p_expected_previous_revision,supersedes,is_contested,p_command,
  p_review_mode,p_policy,p_legacy_ref,coalesce(p_created_at,now()),coalesce(p_created_at,now())) returning id into id_value;
 return jsonb_build_object('decisionId',id_value,'revision',next_revision,'fingerprint',fp,'contested',is_contested,'replayed',false);
end $$;
revoke all on function private.append_work_decision_v1(uuid,uuid,text,text,jsonb,text[],text,jsonb,text,uuid,integer,uuid,text,jsonb,jsonb,timestamptz,text) from public,anon,authenticated,service_role;

-- Legacy hashes identify content but do not enumerate its source closure. Producer receipts
-- record a proved closed basis. Missing receipts are unresolved, never an empty allowed basis.
create table private.review_basis_receipts (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 basis_kind text not null check(basis_kind in ('execution','configuration','assessment','milestone','artifact_revision')),
 basis_reference jsonb not null check(jsonb_typeof(basis_reference)='object'),
 reference_fingerprint text not null check(reference_fingerprint ~ '^[a-f0-9]{64}$'),
 source_count integer not null check(source_count>=0),
 producer text not null check(length(producer) between 1 and 160),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,work_id,basis_kind,reference_fingerprint),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 check(reference_fingerprint=encode(extensions.digest(convert_to(basis_reference::text,'utf8'),'sha256'),'hex'))
);
create table private.review_basis_source_links (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),receipt_id uuid not null,source_version_id uuid not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,receipt_id,source_version_id),
 foreign key(organization_id,receipt_id) references private.review_basis_receipts(organization_id,id),
 foreign key(organization_id,source_version_id) references public.source_versions(organization_id,id)
);
create index review_basis_source_version_idx on private.review_basis_source_links(organization_id,source_version_id);
alter table private.review_basis_receipts enable row level security;
alter table private.review_basis_receipts force row level security;
alter table private.review_basis_source_links enable row level security;
alter table private.review_basis_source_links force row level security;
create policy review_basis_receipts_select on private.review_basis_receipts for select to authenticated using(false);
create policy review_basis_receipts_insert on private.review_basis_receipts for insert to authenticated with check(false);
create policy review_basis_receipts_update on private.review_basis_receipts for update to authenticated using(false) with check(false);
create policy review_basis_receipts_delete on private.review_basis_receipts for delete to authenticated using(false);
create policy review_basis_source_links_select on private.review_basis_source_links for select to authenticated using(false);
create policy review_basis_source_links_insert on private.review_basis_source_links for insert to authenticated with check(false);
create policy review_basis_source_links_update on private.review_basis_source_links for update to authenticated using(false) with check(false);
create policy review_basis_source_links_delete on private.review_basis_source_links for delete to authenticated using(false);
revoke all on private.review_basis_receipts,private.review_basis_source_links from public,anon,authenticated,service_role;
create trigger review_basis_receipts_immutable before update or delete on private.review_basis_receipts for each row execute function private.reject_review_history_mutation_v1();
create trigger review_basis_receipts_no_truncate before truncate on private.review_basis_receipts for each statement execute function private.reject_review_history_mutation_v1();
create trigger review_basis_source_links_immutable before update or delete on private.review_basis_source_links for each row execute function private.reject_review_history_mutation_v1();
create trigger review_basis_source_links_no_truncate before truncate on private.review_basis_source_links for each statement execute function private.reject_review_history_mutation_v1();
create trigger review_basis_receipts_updated before update on private.review_basis_receipts for each row execute function private.set_updated_at();
create trigger review_basis_source_links_updated before update on private.review_basis_source_links for each row execute function private.set_updated_at();
create trigger review_basis_receipts_audit after insert on private.review_basis_receipts for each row execute function private.capture_audit_event();
create trigger review_basis_source_links_audit after insert on private.review_basis_source_links for each row execute function private.capture_audit_event();

create function private.review_basis_receipt_authority_v1(p_org uuid,p_work uuid,p_kind text,p_reference jsonb,p_actor uuid) returns text
language plpgsql volatile security definer set search_path='' as $$
declare receipt private.review_basis_receipts;
begin
 select * into receipt from private.review_basis_receipts where organization_id=p_org and work_id=p_work and basis_kind=p_kind
  and reference_fingerprint=encode(extensions.digest(convert_to(p_reference::text,'utf8'),'sha256'),'hex') and basis_reference=p_reference;
 if receipt.id is null or receipt.source_count<>(select count(*) from private.review_basis_source_links where organization_id=p_org and receipt_id=receipt.id)
 then return 'unresolved'; end if;
 if exists(select 1 from private.review_basis_source_links l where l.organization_id=p_org and l.receipt_id=receipt.id
  and not private.source_use_allowed_v1(p_org,l.source_version_id,p_actor,'read','analysis')) then return 'denied'; end if;
 return 'allowed';
end $$;
revoke all on function private.review_basis_receipt_authority_v1(uuid,uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;

-- Closed inherited-source traversal. This checks content authority independently of release:
-- reviewers must inspect unreleased external revisions before they can approve them.
create function private.artifact_review_sources_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 with recursive ancestry(revision_id,depth) as (
  select p_revision,0
  union
  select l.derived_from_revision_id,c.depth+1 from ancestry c
   join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=c.revision_id
   where l.link_kind='artifact_revision' and c.depth<64
 )
 select p_actor is not null and exists(select 1 from auth.users u where u.id=p_actor
  and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))
 and not exists(select 1 from ancestry c where not exists(select 1 from public.artifact_revisions r where r.organization_id=p_org and r.id=c.revision_id))
 and not exists(select 1 from ancestry c join public.artifact_revisions r on r.organization_id=p_org and r.id=c.revision_id
  join public.artifacts a on a.organization_id=r.organization_id and a.id=r.artifact_id
  where r.legacy_ref is not null and private.review_basis_receipt_authority_v1(p_org,a.work_id,'artifact_revision',
   jsonb_build_object('artifactRevisionId',r.id,'manifestFingerprint',r.manifest_fingerprint),p_actor)<>'allowed')
 and not exists(select 1 from ancestry c join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=c.revision_id
  where (l.link_kind='source_version' and not private.source_use_allowed_v1(p_org,l.source_version_id,p_actor,'read','analysis'))
   or (c.depth=64 and l.link_kind='artifact_revision' and not exists(select 1 from ancestry visited where visited.revision_id=l.derived_from_revision_id)));
$$;
revoke all on function private.artifact_review_sources_allowed_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.work_decision_basis_authority_v1(p_org uuid,p_work uuid,p_basis jsonb,p_report jsonb,p_actor uuid,p_seen uuid[] default '{}') returns text
language plpgsql volatile security definer set search_path='' as $$
declare ref jsonb;r public.artifact_revisions;d public.work_decisions;status text;result text:='allowed';kind text;
begin
 if cardinality(p_seen)>=64 then return 'unresolved'; end if;
 if not private.can_access_capital_project(p_org,p_work) then return 'denied'; end if;
 perform private.validate_work_decision_basis_v1(p_basis);
 for ref in select value from jsonb_array_elements(p_basis->'artifacts') loop
  select x.* into r from public.artifact_revisions x join public.artifacts a on a.organization_id=x.organization_id and a.id=x.artifact_id
   where x.organization_id=p_org and a.work_id=p_work and x.id=(ref->>'artifactRevisionId')::uuid and x.manifest_fingerprint=ref->>'manifestFingerprint';
  if r.id is null then return 'unresolved'; end if;
  if not private.artifact_review_sources_allowed_v1(p_org,r.id,p_actor) then return 'denied'; end if;
 end loop;
 for ref in select value from jsonb_array_elements(p_basis->'decisions') loop
  select * into d from public.work_decisions where organization_id=p_org and work_id=p_work and id=(ref->>'decisionId')::uuid
   and revision=(ref->>'revision')::integer and fingerprint=ref->>'fingerprint';
  if d.id is null or d.id=any(p_seen) then return 'unresolved'; end if;
  status:=private.work_decision_basis_authority_v1(p_org,p_work,d.basis,d.report,p_actor,array_append(p_seen,d.id));
  if status='denied' then return 'denied'; elsif status='unresolved' then result:='unresolved'; end if;
 end loop;
 for ref in select value from jsonb_array_elements(p_basis->'assessments') loop
  if not exists(select 1 from public.capital_project_decisions where organization_id=p_org and capital_project_id=p_work and decision_key=ref->>'decisionKey'
   and revision=(ref->>'revision')::integer and decision_fingerprint=ref->>'decisionFingerprint') then return 'unresolved'; end if;
  status:=private.review_basis_receipt_authority_v1(p_org,p_work,'assessment',ref,p_actor);
  if status='denied' then return 'denied'; elsif status='unresolved' then result:='unresolved'; end if;
 end loop;
 for ref in select value from jsonb_array_elements(p_basis->'milestones') loop
  if not exists(select 1 from public.work_milestones where organization_id=p_org and work_id=p_work and id=(ref->>'milestoneId')::uuid) then return 'unresolved'; end if;
  status:=private.review_basis_receipt_authority_v1(p_org,p_work,'milestone',ref,p_actor);
  if status='denied' then return 'denied'; elsif status='unresolved' then result:='unresolved'; end if;
 end loop;
 foreach kind in array array['execution','configuration'] loop
  ref:=p_basis->kind;
  if jsonb_typeof(ref)<>'null' then
   status:=private.review_basis_receipt_authority_v1(p_org,p_work,kind,ref,p_actor);
   if status='denied' then return 'denied'; elsif status='unresolved' then result:='unresolved'; end if;
  end if;
 end loop;
 if p_report->>'evidenceSourceVersionId' is not null then
  if not exists(select 1 from public.source_versions where organization_id=p_org and id=(p_report->>'evidenceSourceVersionId')::uuid) then return 'unresolved'; end if;
  if not private.source_use_allowed_v1(p_org,(p_report->>'evidenceSourceVersionId')::uuid,p_actor,'read','analysis') then return 'denied'; end if;
 end if;
 return result;
end $$;
revoke all on function private.work_decision_basis_authority_v1(uuid,uuid,jsonb,jsonb,uuid,uuid[]) from public,anon,authenticated,service_role;

create function private.record_work_decision_v1(p_work_id uuid,p_decision_key text,p_kind text,p_basis jsonb,p_effects text[],p_origin text,p_report jsonb,p_note text,p_expected_previous_revision integer,p_command_id uuid,p_outcome text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid;actor uuid:=auth.uid();policy jsonb;mode text;authority text;
begin
 org:=private.lock_review_work_v1(p_work_id);
 perform private.validate_work_decision_basis_v1(p_basis);
 authority:=private.work_decision_basis_authority_v1(org,p_work_id,p_basis,p_report,actor);
 if authority<>'allowed' then raise exception 'work_decision_basis_access_required' using errcode='42501'; end if;
 policy:=private.review_policy_snapshot_v1(org,p_work_id,actor);
 mode:=case when (policy->>'assignmentRequired')::boolean then 'assigned' when (policy->>'selfApprovalAllowed')::boolean then 'individual' else 'open' end;
 if p_origin='in_product' and (policy->>'assignmentRequired')::boolean and not (policy->'roles' ? 'approver')
 then raise exception 'review_assignment_required' using errcode='42501'; end if;
 if p_origin='reported' and p_effects is distinct from array['none']::text[] then raise exception 'reported_decision_has_effect' using errcode='22023'; end if;
 if (p_kind='authorize_execution' and jsonb_typeof(p_basis->'execution')<>'object')
  or (p_kind='approve_configuration' and jsonb_typeof(p_basis->'configuration')<>'object')
  or (p_kind='approve_material_package' and jsonb_array_length(p_basis->'artifacts')=0)
  or (p_kind='confirm_assessment' and jsonb_array_length(p_basis->'assessments')=0)
  or ('queue_execution'=any(p_effects) and p_kind<>'authorize_execution')
  or ('freeze_assessment'=any(p_effects) and p_kind<>'confirm_assessment')
  or ('recompute'=any(p_effects) and p_kind not in ('approve_configuration','adopt_update','adopt_import'))
 then raise exception 'work_decision_effect_basis_invalid' using errcode='22023'; end if;
 return private.append_work_decision_v1(org,p_work_id,p_decision_key,p_kind,p_basis,p_effects,p_origin,p_report,p_note,
  actor,p_expected_previous_revision,p_command_id,mode,policy,p_outcome=>p_outcome);
end $$;
create function public.record_work_decision_v1(p_work_id uuid,p_decision_key text,p_kind text,p_basis jsonb,p_effects text[],p_origin text,p_report jsonb,p_note text,p_expected_previous_revision integer,p_command_id uuid,p_outcome text default null) returns jsonb
language sql security invoker set search_path='' as $$
 select private.record_work_decision_v1(p_work_id,p_decision_key,p_kind,p_basis,p_effects,p_origin,p_report,p_note,p_expected_previous_revision,p_command_id,p_outcome);
$$;
revoke all on function private.record_work_decision_v1(uuid,text,text,jsonb,text[],text,jsonb,text,integer,uuid,text),public.record_work_decision_v1(uuid,text,text,jsonb,text[],text,jsonb,text,integer,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.record_work_decision_v1(uuid,text,text,jsonb,text[],text,jsonb,text,integer,uuid,text),public.record_work_decision_v1(uuid,text,text,jsonb,text[],text,jsonb,text,integer,uuid,text) to authenticated;

create function private.read_work_decision_v1(p_decision_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.work_decisions;org uuid;authority text;state jsonb;
begin
 select * into d from public.work_decisions where id=p_decision_id;
 org:=private.lock_review_work_v1(d.work_id);
 authority:=private.work_decision_basis_authority_v1(org,d.work_id,d.basis,d.report,auth.uid(),array[d.id]);
 if authority<>'allowed' then
  return jsonb_build_object('id',d.id,'kind',d.kind,'createdAt',d.created_at,'withheld',true);
 end if;
 state:=private.work_decision_precedence_v1(org,d.work_id,d.decision_key);
 return jsonb_build_object('withheld',false,'decision',jsonb_build_object('id',d.id,'organizationId',d.organization_id,'workId',d.work_id,
  'decisionKey',d.decision_key,'revision',d.revision,'fingerprint',d.fingerprint,'kind',d.kind,'outcome',d.outcome,'basis',d.basis,'effects',d.effects,
  'origin',d.origin,'report',d.report,'note',d.note,'decidedBy',d.decided_by,'expectedPreviousRevision',d.expected_previous_revision,
  'supersedesDecisionId',d.supersedes_decision_id,'contested',d.contested,'commandId',d.command_id,'createdAt',d.created_at),
  'precedence',state);
end $$;
create function public.read_work_decision_v1(p_decision_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.read_work_decision_v1(p_decision_id);$$;
revoke all on function private.read_work_decision_v1(uuid),public.read_work_decision_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_work_decision_v1(uuid),public.read_work_decision_v1(uuid) to authenticated;

-- Internal producer hook. A public caller cannot assert that a source set is complete.
-- Each adapter passes the exact sources it consumed in the transaction that records the basis.
create function private.record_review_basis_receipt_v1(p_org uuid,p_work uuid,p_kind text,p_reference jsonb,p_source_versions uuid[],p_producer text) returns uuid
language plpgsql security definer set search_path='' as $$
declare reference_hash text;receipt private.review_basis_receipts;versions uuid[];actual uuid[];valid boolean:=false;
begin
 if p_source_versions is null or array_position(p_source_versions,null) is not null or cardinality(p_source_versions)>10000
  or p_producer is distinct from (case p_kind when 'execution' then 'execution_brief_dispatch' when 'configuration' then 'institutional_configuration'
   when 'assessment' then 'agent_assessment' when 'milestone' then 'work_milestone' when 'artifact_revision' then 'legacy_artifact' end)
 then raise exception 'review_basis_receipt_invalid' using errcode='22023'; end if;
 select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into versions from unnest(p_source_versions) x;
 if exists(select 1 from unnest(versions) v where not exists(select 1 from public.source_versions s where s.organization_id=p_org and s.id=v))
 then raise exception 'review_basis_source_not_found' using errcode='22023'; end if;
 if p_kind='execution' then
  select exists(select 1 from public.capital_project_execution_brief_dispatches d where d.organization_id=p_org and d.capital_project_id=p_work
   and d.approved_brief_fingerprint=p_reference->>'briefFingerprint' and d.payload_fingerprint=p_reference->>'payloadFingerprint'
   and d.input_fingerprint=p_reference->>'inputFingerprint') into valid;
 elsif p_kind='configuration' then
  select exists(select 1 from private.institutional_model_configurations c where c.organization_id=p_org and c.capital_project_id=p_work
   and c.configuration_fingerprint=p_reference->>'configurationFingerprint'
   and ((p_reference->>'structureFingerprint' is null and p_reference->>'uploadFingerprint' is null)
    or exists(select 1 from private.institutional_revision_proposals p where p.organization_id=p_org and p.capital_project_id=p_work
     and (p.configuration_id=c.id or p.candidate_configuration_id=c.id)
     and p.structure_fingerprint=p_reference->>'structureFingerprint' and p.upload_fingerprint=p_reference->>'uploadFingerprint'))) into valid;
 elsif p_kind='assessment' then
  select exists(select 1 from public.capital_project_decisions where organization_id=p_org and capital_project_id=p_work
   and decision_key=p_reference->>'decisionKey' and revision=(p_reference->>'revision')::integer and decision_fingerprint=p_reference->>'decisionFingerprint') into valid;
 elsif p_kind='artifact_revision' then
  select exists(select 1 from public.artifact_revisions r join public.artifacts a on a.organization_id=r.organization_id and a.id=r.artifact_id
   where r.organization_id=p_org and a.work_id=p_work and r.id=(p_reference->>'artifactRevisionId')::uuid and r.manifest_fingerprint=p_reference->>'manifestFingerprint') into valid;
 elsif p_kind='milestone' then
  select exists(select 1 from public.work_milestones where organization_id=p_org and work_id=p_work and id=(p_reference->>'milestoneId')::uuid) into valid;
 end if;
 if not valid then raise exception 'review_basis_reference_not_found' using errcode='22023'; end if;
 perform 1 from public.capital_projects where organization_id=p_org and id=p_work for no key update;
 reference_hash:=encode(extensions.digest(convert_to(p_reference::text,'utf8'),'sha256'),'hex');
 select * into receipt from private.review_basis_receipts where organization_id=p_org and work_id=p_work and basis_kind=p_kind and reference_fingerprint=reference_hash;
 if found then
  select coalesce(array_agg(source_version_id order by source_version_id),'{}'::uuid[]) into actual from private.review_basis_source_links where organization_id=p_org and receipt_id=receipt.id;
  if receipt.basis_reference<>p_reference or receipt.source_count<>cardinality(versions) or actual<>versions
  then raise exception 'review_basis_receipt_replay_mismatch' using errcode='23505'; end if;
  return receipt.id;
 end if;
 insert into private.review_basis_receipts(organization_id,work_id,basis_kind,basis_reference,reference_fingerprint,source_count,producer)
 values(p_org,p_work,p_kind,p_reference,reference_hash,cardinality(versions),p_producer) returning * into receipt;
 insert into private.review_basis_source_links(organization_id,receipt_id,source_version_id) select p_org,receipt.id,v from unnest(versions) v;
 return receipt.id;
end $$;
revoke all on function private.record_review_basis_receipt_v1(uuid,uuid,text,jsonb,uuid[],text) from public,anon,authenticated,service_role;

-- Composite foreign keys prevent tenant crossover; this guard binds the copied review fields
-- to that exact revision even for internal projections and backfills.
create function private.enforce_artifact_review_target_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.artifact_revisions r join public.artifacts a on a.organization_id=r.organization_id and a.id=r.artifact_id
  where r.organization_id=new.organization_id and r.id=new.revision_id and r.artifact_id=new.artifact_id
   and a.work_id=new.work_id and r.manifest_fingerprint=new.manifest_fingerprint and r.audience=new.audience)
 then raise exception 'artifact_review_target_mismatch' using errcode='23514'; end if;
 if new.block_id is not null and not exists(select 1 from public.artifact_blocks b where b.organization_id=new.organization_id and b.revision_id=new.revision_id
  and b.id=new.block_id and b.block_key=new.block_key) then raise exception 'artifact_review_block_mismatch' using errcode='23514'; end if;
 if new.basis_review_id is not null and not exists(select 1 from public.artifact_reviews b join public.artifact_revisions r on r.organization_id=b.organization_id and r.id=b.revision_id
  join public.artifact_revisions target on target.organization_id=new.organization_id and target.id=new.revision_id
  where b.organization_id=new.organization_id and b.id=new.basis_review_id and b.work_id=new.work_id and b.artifact_id=new.artifact_id and b.audience=new.audience
   and b.act in ('approve','reaffirm') and ((new.act='revoke_approval' and b.revision_id=new.revision_id) or (new.act='reaffirm' and r.revision_no<target.revision_no)))
 then raise exception 'artifact_review_basis_invalid' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.enforce_artifact_review_target_v1() from public,anon,authenticated,service_role;
create trigger artifact_reviews_exact_target before insert on public.artifact_reviews for each row execute function private.enforce_artifact_review_target_v1();

-- Membership deletion may cascade a project assignment; preserve who held the pending role.
create table private.review_assignment_history (
 id uuid primary key default gen_random_uuid(),sequence bigint generated always as identity,
 organization_id uuid not null references public.organizations(id),work_id uuid not null,user_id uuid not null,
 review_role text not null check(review_role in ('preparer','reviewer','approver')),assigned boolean not null,
 removal_reason text check(removal_reason in ('explicit_unassignment','member_removed')),
 check(assigned=(removal_reason is null)),
 actor_id uuid references auth.users(id),assignment_id uuid not null,
 occurred_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,work_id) references public.capital_projects(organization_id,id)
);
create index review_assignment_history_subject_idx on private.review_assignment_history(organization_id,work_id,user_id,sequence desc);
create index review_assignment_history_actor_idx on private.review_assignment_history(actor_id) where actor_id is not null;
create table private.review_reassignment_commands (
 id uuid primary key,organization_id uuid not null references public.organizations(id),work_id uuid,
 from_user_id uuid not null,to_user_id uuid not null,actor_id uuid not null references auth.users(id),reason text not null,
 result jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 check(from_user_id<>to_user_id),check(length(btrim(reason)) between 1 and 2000)
);
create index review_reassignment_work_idx on private.review_reassignment_commands(organization_id,work_id);
create index review_reassignment_actor_idx on private.review_reassignment_commands(actor_id);
alter table private.review_assignment_history enable row level security;
alter table private.review_assignment_history force row level security;
alter table private.review_reassignment_commands enable row level security;
alter table private.review_reassignment_commands force row level security;
create policy review_assignment_history_select on private.review_assignment_history for select to authenticated using(false);
create policy review_assignment_history_insert on private.review_assignment_history for insert to authenticated with check(false);
create policy review_assignment_history_update on private.review_assignment_history for update to authenticated using(false) with check(false);
create policy review_assignment_history_delete on private.review_assignment_history for delete to authenticated using(false);
create policy review_reassignment_commands_select on private.review_reassignment_commands for select to authenticated using(false);
create policy review_reassignment_commands_insert on private.review_reassignment_commands for insert to authenticated with check(false);
create policy review_reassignment_commands_update on private.review_reassignment_commands for update to authenticated using(false) with check(false);
create policy review_reassignment_commands_delete on private.review_reassignment_commands for delete to authenticated using(false);
revoke all on private.review_assignment_history,private.review_reassignment_commands from public,anon,authenticated,service_role;
create trigger review_assignment_history_immutable before update or delete on private.review_assignment_history for each row execute function private.reject_review_history_mutation_v1();
create trigger review_assignment_history_no_truncate before truncate on private.review_assignment_history for each statement execute function private.reject_review_history_mutation_v1();
create trigger review_assignment_history_updated before update on private.review_assignment_history for each row execute function private.set_updated_at();
create trigger review_assignment_history_audit after insert on private.review_assignment_history for each row execute function private.capture_audit_event();
create trigger review_reassignment_commands_immutable before update or delete on private.review_reassignment_commands for each row execute function private.reject_review_history_mutation_v1();
create trigger review_reassignment_commands_no_truncate before truncate on private.review_reassignment_commands for each statement execute function private.reject_review_history_mutation_v1();
create trigger review_reassignment_commands_updated before update on private.review_reassignment_commands for each row execute function private.set_updated_at();
create trigger review_reassignment_commands_audit after insert on private.review_reassignment_commands for each row execute function private.capture_audit_event();
create function private.capture_review_assignment_history_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare item public.capital_project_review_assignments;
begin
 item:=case when tg_op='DELETE' then old else new end;
 -- An assignment made through the still-current writer establishes the same assigned regime
 -- in the new protocol. Removing the last approver does not silently reopen approvals.
 if tg_op='INSERT' then
  insert into public.capital_project_review_policies(organization_id,capital_project_id,assignment_required,updated_by)
   values(new.organization_id,new.capital_project_id,'required',new.assigned_by)
   on conflict(organization_id,capital_project_id) do update set assignment_required='required',updated_by=excluded.updated_by
   where capital_project_review_policies.assignment_required='inherit';
 end if;

 insert into private.review_assignment_history(organization_id,work_id,user_id,review_role,assigned,removal_reason,actor_id,assignment_id)
 values(item.organization_id,item.capital_project_id,item.user_id,item.review_role,tg_op<>'DELETE',
  case when tg_op='DELETE' then case when exists(select 1 from public.organization_memberships where organization_id=item.organization_id and user_id=item.user_id)
   then 'explicit_unassignment' else 'member_removed' end end,auth.uid(),item.id);
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.capture_review_assignment_history_v1() from public,anon,authenticated,service_role;
create trigger review_assignment_history after insert or delete on public.capital_project_review_assignments for each row execute function private.capture_review_assignment_history_v1();
insert into private.review_assignment_history(organization_id,work_id,user_id,review_role,assigned,actor_id,assignment_id,occurred_at)
 select organization_id,capital_project_id,user_id,review_role,true,assigned_by,id,created_at from public.capital_project_review_assignments;

create function private.reassign_pending_review_v1(p_project_id uuid,p_from_user uuid,p_to_user uuid,p_reason text,p_command_id uuid,p_organization_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();org uuid:=p_organization_id;work uuid;works uuid[];roles text[];r public.artifact_revisions;
 policy jsonb;command private.review_reassignment_commands;result jsonb:='[]'::jsonb;act_id uuid;
begin
 if actor is null or p_from_user is null or p_to_user is null or p_from_user=p_to_user or p_command_id is null or length(btrim(coalesce(p_reason,''))) not between 1 and 2000
 then raise exception 'review_reassignment_invalid' using errcode='22023'; end if;
 if p_project_id is not null then
  select organization_id into org from public.capital_projects where id=p_project_id;
  if p_organization_id is not null and org is distinct from p_organization_id then raise exception 'review_manage_access_required' using errcode='42501'; end if;
 end if;
 if org is null then raise exception 'review_organization_required' using errcode='22023'; end if;
 -- Both humans are locked before projects/policy, so target suspension cannot deadlock with
 -- an organization policy lock held by this command.
 perform 1 from auth.users where id in (actor,p_to_user) and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) order by id for share;
 if not exists(select 1 from auth.users where id=actor and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()))
  or not exists(select 1 from auth.users where id=p_to_user and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()))
 then raise exception 'review_reassignment_no_eligible_member' using errcode='42501'; end if;
 if p_project_id is not null then works:=array[p_project_id];
 else select coalesce(array_agg(distinct h.work_id order by h.work_id),'{}') into works from (
   select distinct on (work_id,review_role) work_id,assigned,removal_reason from private.review_assignment_history
   where organization_id=org and user_id=p_from_user order by work_id,review_role,sequence desc) h
  join public.capital_projects p on p.organization_id=org and p.id=h.work_id
  where (h.assigned or h.removal_reason='member_removed') and p.status<>'archived'; end if;
 perform 1 from public.capital_projects where organization_id=org and id=any(works) order by id for no key update;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||org::text,0));
 if not private.can_manage_organization(org) or exists(select 1 from unnest(works) w where not private.can_access_resource_v1(org,w,'manage'))
 then raise exception 'review_manage_access_required' using errcode='42501'; end if;
 if not exists(select 1 from public.organization_memberships where organization_id=org and user_id=p_to_user and status='active')
 then raise exception 'review_reassignment_no_eligible_member' using errcode='42501'; end if;
 select * into command from private.review_reassignment_commands where id=p_command_id;
 if found then
  if command.organization_id<>org or command.work_id is distinct from p_project_id or command.from_user_id<>p_from_user or command.to_user_id<>p_to_user
   or command.actor_id<>actor or command.reason<>p_reason then raise exception 'review_reassignment_replay_mismatch' using errcode='23505'; end if;
  return jsonb_build_object('replayed',true,'reviews',command.result);
 end if;
 if cardinality(works)=0 then raise exception 'review_reassignment_no_pending_assignment' using errcode='22023'; end if;
 foreach work in array works loop
  select coalesce(array_agg(review_role order by review_role),'{}') into roles from (
   select distinct on (review_role) review_role,assigned,removal_reason from private.review_assignment_history
   where organization_id=org and work_id=work and user_id=p_from_user order by review_role,sequence desc) h
   where assigned or removal_reason='member_removed';
  if cardinality(roles)=0 then raise exception 'review_reassignment_no_pending_assignment' using errcode='22023'; end if;
  -- The target already holds the required project role; membership or administrator status
  -- alone never invents eligibility. The administrator can assign roles through the product.
  if exists(select 1 from unnest(roles) role_value where not exists(select 1 from public.capital_project_review_assignments
   where organization_id=org and capital_project_id=work and user_id=p_to_user and review_role=role_value))
  then raise exception 'review_reassignment_no_eligible_member' using errcode='42501'; end if;
  policy:=private.review_policy_snapshot_v1(org,work,actor)||jsonb_build_object('reassignment',jsonb_build_object('fromUserId',p_from_user,'toUserId',p_to_user));
  for r in select x.* from public.artifact_revisions x join public.artifacts y on y.organization_id=x.organization_id and y.id=x.artifact_id
   where x.organization_id=org and y.work_id=work and y.head_revision_id=x.id
    and not exists(select 1 from public.artifact_reviews v where v.organization_id=org and v.revision_id=x.id and private.artifact_review_is_active_v1(org,v.id)) loop
   if 'approver'=any(roles) and not (policy->>'selfApprovalAllowed')::boolean and private.artifact_review_preparer_v1(r)=p_to_user
   then raise exception 'review_reassignment_no_eligible_member' using errcode='42501'; end if;
   insert into public.artifact_reviews(organization_id,work_id,artifact_id,revision_id,manifest_fingerprint,audience,act,reviewer_id,prepared_by,
    self_approval_declared,review_mode,policy_snapshot,command_id,note)
   values(org,work,r.artifact_id,r.id,r.manifest_fingerprint,r.audience,'reassign',actor,private.artifact_review_preparer_v1(r),false,
    case when (policy->>'assignmentRequired')::boolean then 'assigned' when (policy->>'selfApprovalAllowed')::boolean then 'individual' else 'open' end,
    policy,extensions.uuid_generate_v5(p_command_id,r.id::text),p_reason) returning id into act_id;
   result:=result||jsonb_build_array(jsonb_build_object('reviewId',act_id,'revisionId',r.id));
  end loop;
  delete from public.capital_project_review_assignments where organization_id=org and capital_project_id=work and user_id=p_from_user and review_role=any(roles);
 end loop;
 insert into private.review_reassignment_commands(id,organization_id,work_id,from_user_id,to_user_id,actor_id,reason,result)
 values(p_command_id,org,p_project_id,p_from_user,p_to_user,actor,p_reason,result);
 return jsonb_build_object('replayed',false,'reviews',result);
end $$;
create function public.reassign_pending_review_v1(p_project_id uuid,p_from_user uuid,p_to_user uuid,p_reason text,p_command_id uuid,p_organization_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select private.reassign_pending_review_v1(p_project_id,p_from_user,p_to_user,p_reason,p_command_id,p_organization_id);$$;
revoke all on function private.reassign_pending_review_v1(uuid,uuid,uuid,text,uuid,uuid),public.reassign_pending_review_v1(uuid,uuid,uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.reassign_pending_review_v1(uuid,uuid,uuid,text,uuid,uuid),public.reassign_pending_review_v1(uuid,uuid,uuid,text,uuid,uuid) to authenticated;


-- Additive foundation only. Legacy release, producers and historical approval paths
-- remain unchanged until the integrated cutover with verified source receipts and UI.
