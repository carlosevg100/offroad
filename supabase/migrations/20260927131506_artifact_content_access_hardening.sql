-- Exact readers enforce inherited source rights and external release. Table reads cannot.
revoke select on public.artifacts, public.artifact_revisions, public.artifact_blocks from authenticated, anon, service_role;

create or replace function private.read_artifact_revision_v1(p_revision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.artifact_revisions;a public.artifacts;rel text;fresh text;restricted uuid[];unresolved uuid[];blocks jsonb;links jsonb;withheld boolean;restriction jsonb;
begin
 select * into r from public.artifact_revisions x where x.id=p_revision;
 if actor is null or r.id is null then raise exception 'artifact_revision_not_found' using errcode='P0002'; end if;
 select * into a from public.artifacts x where x.organization_id=r.organization_id and x.id=r.artifact_id;
 if not private.can_access_capital_project(a.organization_id,a.work_id) then raise exception 'artifact_revision_not_found' using errcode='P0002'; end if;
 with recursive ancestry(revision_id,depth) as (
  select r.id,0
  union
  select l.derived_from_revision_id,c.depth+1 from ancestry c join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=c.revision_id
  where l.link_kind='artifact_revision' and c.depth<64),
 sources as (
  select l.id,l.source_version_id from ancestry c join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=c.revision_id
  where l.link_kind='source_version'),
 missing as (
  select c.revision_id from ancestry c where not exists(select 1 from public.artifact_revisions x where x.organization_id=r.organization_id and x.id=c.revision_id)
  union
  -- A bounded traversal must deny when it cannot establish the complete source closure.
  select l.derived_from_revision_id from ancestry c
   join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=c.revision_id
   where c.depth=64 and l.link_kind='artifact_revision'
    and not exists(select 1 from ancestry visited where visited.revision_id=l.derived_from_revision_id))
 select coalesce((select array_agg(s.id order by s.id) from sources s where not private.source_use_allowed_v1(r.organization_id,s.source_version_id,actor,'read','analysis')),'{}'::uuid[]),
  coalesce((select array_agg(m.revision_id order by m.revision_id) from missing m),'{}'::uuid[]) into restricted,unresolved;
 rel:=private.artifact_revision_release_v1(r);
 fresh:=case when cardinality(unresolved)>0 then 'unknown' else private.artifact_revision_freshness_v1(r) end;
 restriction:=case when cardinality(restricted)>0 or cardinality(unresolved)>0
  then jsonb_build_object('kind','source_rights','linkIds',to_jsonb(restricted),'unresolvedRevisionIds',to_jsonb(unresolved))
  when rel='blocked' then jsonb_build_object('kind','release','release',rel) end;
 withheld:=restriction is not null;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'blockNo',b.block_no,'blockKey',b.block_key,'kind',b.kind,'content',b.content,'claims',b.claims,'contentFingerprint',b.content_fingerprint) order by b.block_no),'[]'::jsonb)
  into blocks from public.artifact_blocks b where b.organization_id=r.organization_id and b.revision_id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'kind',l.link_kind,'blockId',l.block_id) order by l.link_kind,l.id),'[]'::jsonb)
  into links from private.artifact_dependency_links l where l.organization_id=r.organization_id and l.revision_id=r.id;
 return jsonb_build_object('schemaVersion','artifact-read.2026.09.26-v1',
  'artifact',jsonb_build_object('id',a.id,'workId',a.work_id,'kind',a.kind,'subject',a.subject,'headRevisionId',a.head_revision_id,'legacyOrigin',a.legacy_origin,'createdAt',a.created_at),
  'revision',jsonb_build_object('id',r.id,'revisionNo',r.revision_no,'previousRevisionId',r.previous_revision_id,'audience',r.audience,'origin',r.origin,
   'manifest',case when withheld then null else r.manifest end,'manifestFingerprint',r.manifest_fingerprint,'contentSha256',r.content_sha256,'byteLength',r.byte_length,
   'legacyRef',r.legacy_ref,'createdBy',r.created_by,'createdAt',r.created_at),
  'isHead',a.head_revision_id=r.id,
  'blocks',case when withheld then '[]'::jsonb else blocks end,
  'links',links,
  'release',rel,'freshness',fresh,
  'restriction',restriction);
end $$;
