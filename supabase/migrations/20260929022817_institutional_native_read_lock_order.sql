-- Stage 20 / 3H amendment: protect every derived link before evaluating it.
set search_path='';

create or replace function private.read_artifact_revision_v1(p_revision uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();r public.artifact_revisions;a public.artifacts;rel text;fresh text;restricted uuid[];unresolved uuid[];blocks jsonb;links jsonb;withheld boolean;restriction jsonb;native_allowed boolean;
begin
 select * into r from public.artifact_revisions x where x.id=p_revision;
 if actor is null or r.id is null then raise exception 'artifact_revision_not_found' using errcode='P0002'; end if;
 select * into a from public.artifacts x where x.organization_id=r.organization_id and x.id=r.artifact_id;
 native_allowed:=private.institutional_native_read_allowed_v1(r.organization_id,r.id,actor);
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
 restriction:=case when not native_allowed or cardinality(restricted)>0 or cardinality(unresolved)>0
  then jsonb_build_object('kind','source_rights','linkIds',to_jsonb(restricted),'unresolvedRevisionIds',to_jsonb(unresolved))
  when rel='blocked' then jsonb_build_object('kind','release','release',rel) end;
 withheld:=restriction is not null;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'blockNo',b.block_no,'blockKey',b.block_key,'kind',b.kind,'content',b.content,'claims',b.claims,'contentFingerprint',b.content_fingerprint) order by b.block_no),'[]'::jsonb)
  into blocks from public.artifact_blocks b where b.organization_id=r.organization_id and b.revision_id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'kind',l.link_kind,'blockId',l.block_id) order by l.link_kind,l.id),'[]'::jsonb)
  into links from private.artifact_dependency_links l where l.organization_id=r.organization_id and l.revision_id=r.id;
 -- Account/policy locks cannot stop the wall clock. Recheck every pin and derived link.
 if not native_allowed or not private.institutional_native_read_allowed_v1(r.organization_id,r.id,actor) then
  restriction:=jsonb_build_object('kind','source_rights','linkIds',to_jsonb(restricted),'unresolvedRevisionIds',to_jsonb(unresolved));withheld:=true;
 end if;
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
end $function$;

create or replace function private.artifact_review_sources_allowed_v1(p_org uuid, p_revision uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare allowed boolean;
begin
 -- PL/pgSQL establishes sequencing; a SQL AND does not order authority checks.
 if not private.institutional_native_read_allowed_v1(p_org,p_revision,p_actor) then return false;end if;
 if exists(select 1 from private.institutional_native_ancestry_v1(p_org,p_revision))
  and not exists(select 1 from public.artifact_revisions r join public.artifacts a on (a.organization_id,a.id)=(r.organization_id,r.artifact_id)
   where r.organization_id=p_org and r.id=p_revision and private.evaluate_resource_policy_v1(p_org,a.work_id,p_actor,'read','analysis'))
 then return false;end if;
 allowed := (
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
   or (c.depth=64 and l.link_kind='artifact_revision' and not exists(select 1 from ancestry visited where visited.revision_id=l.derived_from_revision_id)))
 );
 if not allowed then return false;end if;
 return private.institutional_native_read_allowed_v1(p_org,p_revision,p_actor);
end $function$;


create or replace function private.institutional_native_read_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare b private.institutional_native_bindings;pin jsonb;r private.source_rights_versions;deadline timestamptz;current_until timestamptz;policy_until timestamptz;started_at timestamptz:=clock_timestamp();pins jsonb:='[]'::jsonb;
begin
 if not exists(select 1 from private.institutional_native_ancestry_v1(p_org,p_revision)) then return true;end if;
 -- Match authority writers: fresh policy reads occur after their transaction ends.
 -- NOWAIT avoids an account/policy inversion when called inside a review command.
 perform 1 from auth.users where id=p_actor and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share nowait;
 if not found then return false;end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||p_org::text,0));
 if not exists(select 1 from public.artifact_revisions ar join public.artifacts a on (a.organization_id,a.id)=(ar.organization_id,ar.artifact_id)
  where ar.organization_id=p_org and ar.id=p_revision and private.evaluate_resource_policy_v1(p_org,a.work_id,p_actor,'read','analysis')) then return false;end if;
 for b in select * from private.institutional_native_ancestry_v1(p_org,p_revision) loop
  if not private.evaluate_resource_policy_v1(p_org,b.work_id,p_actor,'read','analysis') then return false;end if;
  if b.closure_fingerprint is distinct from encode(extensions.digest(convert_to(b.closure::text,'utf8'),'sha256'),'hex')
   or b.closure->>'state' is distinct from 'closed' or jsonb_typeof(b.closure->'sources') is distinct from 'array' then return false;end if;
  pins:=pins||(b.closure->'sources');
 end loop;
 -- Include sources added by derivatives, not only the institutional calculation's pins.
 with recursive ancestry(id) as (select p_revision union select l.derived_from_revision_id from ancestry a
  join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision')
 select pins||coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',l.source_version_id,'rightsVersionId',l.source_rights_version_id,'declaredSha256',v.declared_sha256)),'[]'::jsonb)
 into pins from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='source_version'
 left join public.source_versions v on (v.organization_id,v.id)=(l.organization_id,l.source_version_id);
  for pin in select value from jsonb_array_elements(pins) loop
   select rr.* into r from private.source_rights_versions rr join public.source_versions v
    on (v.organization_id,v.id)=(rr.organization_id,rr.source_version_id)
    where rr.organization_id=p_org and rr.id=(pin->>'rightsVersionId')::uuid
     and rr.source_version_id=(pin->>'sourceVersionId')::uuid and v.declared_sha256=pin->>'declaredSha256';
   if r.id is null or not (array['read','store']::text[] <@ r.operations) or not ('analysis'=any(r.purposes))
    or r.valid_from>clock_timestamp() or r.expires_at<=clock_timestamp() or r.store_until<=clock_timestamp()
    or not private.source_use_allowed_v1(p_org,r.source_version_id,p_actor,'read','analysis')
    or not private.source_use_allowed_v1(p_org,r.source_version_id,p_actor,'store','analysis') then return false;end if;
   deadline:=least(deadline,r.expires_at,r.store_until);
  end loop;
 with recursive dependencies(id) as (
  select distinct (value->>'sourceVersionId')::uuid from jsonb_array_elements(pins)
  union select d.source_version_id from dependencies g join private.resource_dependencies d
   on d.organization_id=p_org and d.derived_version_id=g.id
 ), all_rights as (
  select latest.expires_at,latest.store_until from dependencies g
   cross join lateral(select rr.expires_at,rr.store_until from private.source_rights_versions rr
    where rr.organization_id=p_org and rr.source_version_id=g.id order by rr.revision desc limit 1) latest
  union all select rr.expires_at,rr.store_until from dependencies g
   join private.resource_dependencies d on d.organization_id=p_org and d.derived_version_id=g.id
   join private.source_rights_versions rr on (rr.organization_id,rr.id)=(d.organization_id,d.source_rights_version_id)
 ) select min(least(expires_at,store_until)) into current_until from all_rights;
 -- No wall-clock transition affecting this principal may occur unnoticed during evaluation.
 -- Include future group memberships/denies. A transition on an unrelated resource can cause
 -- a conservative refusal for this call only; the next call evaluates the new policy state.
 with principal as (select id from private.principals where organization_id=p_org and user_id=p_actor and kind='human'),
 potential_groups as (select m.group_id from private.access_group_memberships m join principal p on p.id=m.principal_id where m.organization_id=p_org and m.revoked_at is null),
 transitions as (
  select g.valid_from,g.expires_at from private.resource_access_grants g where g.organization_id=p_org and g.revoked_at is null
   and (g.subject_user_id=p_actor or g.subject_group_id in(select group_id from potential_groups))
  union all select m.valid_from,m.expires_at from private.barrier_memberships m where m.organization_id=p_org and m.revoked_at is null
   and (m.principal_id in(select id from principal) or m.group_id in(select group_id from potential_groups))
  union all select m.valid_from,m.expires_at from private.access_group_memberships m where m.organization_id=p_org and m.revoked_at is null and m.principal_id in(select id from principal)
 ) select min(t) into policy_until from transitions cross join lateral unnest(array[valid_from,expires_at]) t where t>started_at;

 if least(deadline,current_until,policy_until)<=clock_timestamp() then return false;end if;
 return true;
exception when lock_not_available then return false;
end $$;
revoke all on function private.institutional_native_read_allowed_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
