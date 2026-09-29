-- Stage 20 / 3J: fixed execution provenance governs old and new artifact reads.
set search_path='';
set local lock_timeout='5s';

-- Snapshot references are immutable inputs too; they need not occur in an adopted basis.
create function private.execution_snapshot_reference_closure_v1(p_org uuid,p_payload jsonb,p_declared_sources jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare pending jsonb[]:=array[p_payload];depths integer[]:=array[0];cursor integer:=1;node jsonb;pair record;child jsonb;ref text;
 definitions uuid[]:='{}';observations uuid[]:='{}';entities uuid[]:='{}';target uuid;dossier uuid;resource uuid;
 d public.definition_versions;o public.observations;sources jsonb:='[]';resources jsonb:='[]';total_bytes bigint:=pg_column_size(p_payload);
begin
 while cursor<=coalesce(array_length(pending,1),0) loop
  if cursor>32768 or depths[cursor]>64 or total_bytes>16777216 then return null;end if;
  node:=pending[cursor];
  if jsonb_typeof(node)='object' then
   if node ? 'canonical' then
    if jsonb_typeof(node->'canonical') is distinct from 'string' then return null;end if;
    total_bytes:=total_bytes+octet_length(node->>'canonical');
    pending:=array_append(pending,(node->>'canonical')::jsonb);depths:=array_append(depths,depths[cursor]+1);
   end if;
   if node ?& array['field','versionId','contractSourceVersionId','contractAnchor','definition'] then definitions:=array_append(definitions,(node->>'versionId')::uuid);end if;
   for pair in select * from jsonb_each(node) loop
    if pair.value<>'null'::jsonb then
     if pair.key='entityId' then entities:=array_append(entities,(pair.value#>>'{}')::uuid);
     elsif pair.key='definitionVersionId' then definitions:=array_append(definitions,(pair.value#>>'{}')::uuid);
     elsif pair.key in ('observationId','observationIds') then
      for ref in select jsonb_array_elements_text(case when pair.key='observationId' then jsonb_build_array(pair.value) else pair.value end) loop observations:=array_append(observations,ref::uuid);end loop;
     elsif pair.key in ('sourceVersionId','contractSourceVersionId','sourceVersionIds','contractSourceVersionIds') then
      for ref in select jsonb_array_elements_text(case when pair.key in ('sourceVersionId','contractSourceVersionId') then jsonb_build_array(pair.value) else pair.value end) loop
       if not exists(select 1 from jsonb_array_elements(p_declared_sources) s where s->>'sourceVersionId'=ref) then return null;end if;
      end loop;
     end if;
    end if;
    if jsonb_typeof(pair.value) in ('object','array') then pending:=array_append(pending,pair.value);depths:=array_append(depths,depths[cursor]+1);end if;
   end loop;
  elsif jsonb_typeof(node)='array' then
   for child in select value from jsonb_array_elements(node) loop pending:=array_append(pending,child);depths:=array_append(depths,depths[cursor]+1);end loop;
  end if;
  if array_length(pending,1)>32768 then return null;end if;
  cursor:=cursor+1;
 end loop;
 for target in select distinct unnest(observations) loop
  select * into o from public.observations where organization_id=p_org and id=target;
  if o.id is null then return null;end if;
  select resource_id into resource from public.dossiers where organization_id=p_org and id=o.dossier_id;
  if not found then return null;end if;
  resources:=resources||jsonb_build_array(resource);
  if o.source_version_id is not null then sources:=sources||jsonb_build_array(jsonb_build_object('sourceVersionId',o.source_version_id,'rightsVersionId',o.source_rights_version_id));end if;
  if o.definition_version_id is not null then definitions:=array_append(definitions,o.definition_version_id);end if;
  if o.entity_id is not null then entities:=array_append(entities,o.entity_id);end if;
 end loop;
 for target in select distinct unnest(definitions) loop
  select * into d from public.definition_versions where organization_id=p_org and id=target;
  if d.id is null then return null;end if;
  select ds.resource_id into resource from public.metric_definitions md join public.dossiers ds on (ds.organization_id,ds.id)=(md.organization_id,md.dossier_id)
   where md.organization_id=p_org and md.id=d.metric_definition_id;
  if not found then return null;end if;
  resources:=resources||jsonb_build_array(resource);
  if d.contract_source_version_id is not null then sources:=sources||jsonb_build_array(jsonb_build_object('sourceVersionId',d.contract_source_version_id,'rightsVersionId',d.contract_rights_version_id));end if;
 end loop;
 for target in select distinct unnest(entities) loop
  select origin_dossier_id into dossier from public.entities where id=target and (organization_id=p_org or organization_id is null);
  if not found then return null;end if;
  if dossier is not null then
   select resource_id into resource from public.dossiers where organization_id=p_org and id=dossier;
   if not found then return null;end if;
   resources:=resources||jsonb_build_array(resource);
  end if;
 end loop;
 return jsonb_build_object('sources',sources,'resources',resources);
exception when data_exception then return null;
end $$;
revoke all on function private.execution_snapshot_reference_closure_v1(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

-- Historical integrity only. No current method release, principal, lease or basis head.
create function private.execution_result_source_closure_v1(p_org uuid,p_execution uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare e public.work_executions;m private.execution_manifests;s private.execution_input_snapshots;
 r private.execution_result_receipts;binding record;d record;v public.definition_versions;o public.observations;
 sources jsonb:='[]';resources jsonb:='[]';item jsonb;dossier uuid;resource uuid;pair jsonb;extra jsonb;
begin
 select * into e from public.work_executions where organization_id=p_org and id=p_execution;
 select * into m from private.execution_manifests where organization_id=p_org and execution_id=p_execution;
 select * into s from private.execution_input_snapshots where organization_id=p_org and execution_id=p_execution;
 select * into r from private.execution_result_receipts where organization_id=p_org and execution_id=p_execution;
 if e.id is null or m.id is null or s.id is null or r.id is null
  or m.snapshot_id is distinct from s.id or m.snapshot_fingerprint is distinct from s.payload_fingerprint
  or r.contract_fingerprint is distinct from m.payload_fingerprint or r.input_fingerprint is distinct from s.payload_fingerprint
  or m.payload#>>'{inputs,fingerprint}' is distinct from s.payload_fingerprint
  or m.payload->>'executionId' is distinct from e.id::text or m.payload->>'workId' is distinct from e.work_id::text
  or m.payload->>'organizationId' is distinct from p_org::text
 then return null;end if;
 -- Both directions and counts: a missing or extra binding cannot disappear behind an inner join.
 if jsonb_array_length(m.payload#>'{inputs,sources}')<>(select count(*) from private.execution_source_bindings where organization_id=p_org and execution_id=p_execution)
  or exists(select 1 from jsonb_array_elements(m.payload#>'{inputs,sources}') x where not exists(
   select 1 from private.execution_source_bindings b join private.source_rights_versions rr on (rr.organization_id,rr.source_version_id,rr.id)=(b.organization_id,b.source_version_id,b.rights_version_id)
   join public.source_versions sv on (sv.organization_id,sv.id)=(b.organization_id,b.source_version_id)
   where b.organization_id=p_org and b.execution_id=p_execution and b.source_version_id::text=x->>'sourceVersionId'
    and b.resource_id::text=x->>'resourceId' and b.content_hash=x->>'contentHash' and sv.declared_sha256=b.content_hash and rr.revision::text=x->>'rightsRevision'))
  or jsonb_array_length(m.payload#>'{inputs,adoptions}')+jsonb_array_length(m.payload#>'{inputs,hypotheses}')<>
   (select count(*) from private.execution_basis_bindings where organization_id=p_org and execution_id=p_execution)
  or exists(select 1 from (select x,'observation' kind from jsonb_array_elements(m.payload#>'{inputs,adoptions}') x
   union all select x,'hypothesis' from jsonb_array_elements(m.payload#>'{inputs,hypotheses}') x) expected where not exists(
   select 1 from private.execution_basis_bindings b where b.organization_id=p_org and b.execution_id=p_execution
    and b.decision_id::text=expected.x->>'id' and b.assumption_version_id::text=expected.x->>'assumptionVersionId'
    and b.content_fingerprint=expected.x->>'fingerprint' and b.kind=expected.kind)) then return null;end if;
 resources:=jsonb_build_array(e.work_id);
 for binding in select * from private.execution_source_bindings where organization_id=p_org and execution_id=p_execution loop
  sources:=sources||jsonb_build_array(jsonb_build_object('sourceVersionId',binding.source_version_id,'rightsVersionId',binding.rights_version_id,'declaredSha256',binding.content_hash));
  resources:=resources||jsonb_build_array(binding.resource_id);
 end loop;
 for binding in select * from private.execution_basis_bindings where organization_id=p_org and execution_id=p_execution loop
  if not exists(select 1 from public.assumption_versions av join public.assumption_sets aset on (aset.organization_id,aset.id)=(av.organization_id,av.set_id)
   join private.assumption_version_items i on (i.organization_id,i.version_id,i.set_id)=(av.organization_id,av.id,av.set_id)
   join public.adoption_decisions a on (a.organization_id,a.id,a.set_id)=(i.organization_id,i.decision_id,i.set_id)
   where av.organization_id=p_org and av.id=binding.assumption_version_id and av.content_fingerprint=binding.content_fingerprint
    and aset.work_id=e.work_id and a.id=binding.decision_id and a.kind=binding.kind) then return null;end if;
  select * into d from public.adoption_decisions where organization_id=p_org and id=binding.decision_id;
  select * into o from public.observations where organization_id=p_org and id=d.reference_observation_id;
  if d.reference_observation_id is not null and o.id is null then return null;end if;
  for item in select to_jsonb(x.id) from (select d.definition_version_id id union select o.definition_version_id where o.id is not null) x loop
   select * into v from public.definition_versions where organization_id=p_org and id=(item#>>'{}')::uuid;
   if v.id is null then return null;end if;
   select md.dossier_id into dossier from public.metric_definitions md where md.organization_id=p_org and md.id=v.metric_definition_id;
   if not found then return null;end if;
   select resource_id into resource from public.dossiers where organization_id=p_org and id=dossier;
   if not found then return null;end if;
   resources:=resources||jsonb_build_array(resource);
   if v.contract_source_version_id is not null then sources:=sources||jsonb_build_array(jsonb_build_object('sourceVersionId',v.contract_source_version_id,'rightsVersionId',v.contract_rights_version_id));end if;
  end loop;
  if o.id is not null then
   select resource_id into resource from public.dossiers where organization_id=p_org and id=o.dossier_id;
   if not found then return null;end if;
   resources:=resources||jsonb_build_array(resource);
   sources:=sources||jsonb_build_array(jsonb_build_object('sourceVersionId',o.source_version_id,'rightsVersionId',o.source_rights_version_id));
  end if;
  for item in select to_jsonb(x.id) from (select d.entity_id id union select o.entity_id where o.id is not null) x where x.id is not null loop
   select en.origin_dossier_id into dossier from public.entities en where en.id=(item#>>'{}')::uuid and (en.organization_id=p_org or en.organization_id is null);
   if not found then return null;end if;
   if dossier is not null then
    select resource_id into resource from public.dossiers where organization_id=p_org and id=dossier;
    if not found then return null;end if;
    resources:=resources||jsonb_build_array(resource);
   end if;
  end loop;
 end loop;
 extra:=private.execution_snapshot_reference_closure_v1(p_org,s.payload,m.payload#>'{inputs,sources}');
 if extra is null then return null;end if;
 sources:=sources||(extra->'sources');resources:=resources||(extra->'resources');
 -- Preserve every version/license pair, including different licenses for the same version.
 for pair in select value from jsonb_array_elements(sources) loop
  if not exists(select 1 from public.source_versions sv join private.source_rights_versions rr on (rr.organization_id,rr.source_version_id)=(sv.organization_id,sv.id)
   where sv.organization_id=p_org and sv.id=(pair->>'sourceVersionId')::uuid and rr.id=(pair->>'rightsVersionId')::uuid
   and (not(pair ? 'declaredSha256') or pair->>'declaredSha256'=sv.declared_sha256)) then return null;end if;
 end loop;
 select coalesce(jsonb_agg(x.pin order by x.pin->>'sourceVersionId',x.pin->>'rightsVersionId'),'[]') into sources from (
  select distinct src||jsonb_build_object('declaredSha256',sv.declared_sha256) pin from jsonb_array_elements(sources) src
  join public.source_versions sv on sv.organization_id=p_org and sv.id=(src->>'sourceVersionId')::uuid) x;
 select coalesce(jsonb_agg(value order by value),'[]') into resources from(select distinct value from jsonb_array_elements(resources)) x;
 return jsonb_build_object('state','closed','workId',e.work_id,'sources',sources,'resources',resources,'bindings',
  (select coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',source_version_id,'resourceId',resource_id)),'[]') from private.execution_source_bindings where organization_id=p_org and execution_id=p_execution));
end $$;
revoke all on function private.execution_result_source_closure_v1(uuid,uuid) from public,anon,authenticated,service_role;

-- Trusted closure only; private callers assemble resources and immutable rights pins.
create function private.execution_closure_read_allowed_v1(p_org uuid,p_closure jsonb,p_actor uuid,p_operation text default 'read') returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare pin jsonb;r private.source_rights_versions;deadline timestamptz;current_until timestamptz;policy_until timestamptz;
 started_at timestamptz:=clock_timestamp();pins jsonb:=p_closure->'sources';resource jsonb;
begin
 if p_operation not in ('read','derive') or p_closure is null or p_closure->>'state' is distinct from 'closed' then return false;end if;
 perform 1 from auth.users where id=p_actor and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share nowait;
 if not found then return false;end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||p_org::text,0));
 if exists(select 1 from jsonb_array_elements(coalesce(p_closure->'bindings','[]')) b where not exists(
  select 1 from public.source_bindings sb where sb.organization_id=p_org and sb.source_version_id=(b->>'sourceVersionId')::uuid
   and sb.resource_id=(b->>'resourceId')::uuid and sb.revoked_at is null)) then return false;end if;
 for resource in select value from jsonb_array_elements(p_closure->'resources') loop
  if not private.evaluate_resource_policy_v1(p_org,(resource#>>'{}')::uuid,p_actor,'read','analysis') then return false;end if;
 end loop;
  for pin in select value from jsonb_array_elements(pins) loop
   select rr.* into r from private.source_rights_versions rr join public.source_versions v
    on (v.organization_id,v.id)=(rr.organization_id,rr.source_version_id)
    where rr.organization_id=p_org and rr.id=(pin->>'rightsVersionId')::uuid
     and rr.source_version_id=(pin->>'sourceVersionId')::uuid and v.declared_sha256 is not distinct from pin->>'declaredSha256';
   if r.id is null or not (array['read','store',p_operation]::text[] <@ r.operations) or not ('analysis'=any(r.purposes))
    or r.valid_from>clock_timestamp() or r.expires_at<=clock_timestamp() or r.store_until<=clock_timestamp()
    or not private.source_use_allowed_v1(p_org,r.source_version_id,p_actor,'read','analysis')
    or not private.source_use_allowed_v1(p_org,r.source_version_id,p_actor,'store','analysis')
    or not private.source_use_allowed_v1(p_org,r.source_version_id,p_actor,p_operation,'analysis') then return false;end if;
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

revoke all on function private.execution_closure_read_allowed_v1(uuid,jsonb,uuid,text) from public,anon,authenticated,service_role;

-- All ancestors, even pre-correction manifests whose sources array was incomplete.
create function private.execution_artifact_read_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid,p_operation text default 'read') returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare node record;r public.artifact_revisions;e public.work_executions;receipt private.execution_result_receipts;
 closure jsonb;combined jsonb:=jsonb_build_object('state','closed','sources','[]'::jsonb,'resources','[]'::jsonb,'bindings','[]'::jsonb);
 has_execution boolean:=false;ids uuid[];
begin
 with recursive ancestry(id,depth) as(select p_revision,0 union
  select l.derived_from_revision_id,a.depth+1 from ancestry a join private.artifact_dependency_links l
   on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision' where a.depth<64)
 select array_agg(distinct id) into ids from ancestry;
 for node in select unnest(ids) id loop
  select * into r from public.artifact_revisions where organization_id=p_org and id=node.id;
  if r.id is null or exists(select 1 from private.artifact_dependency_links l where l.organization_id=p_org and l.revision_id=node.id
   and l.link_kind='artifact_revision' and not(l.derived_from_revision_id=any(ids))) then return false;end if;
  if jsonb_typeof(r.manifest->'execution')='object' then
   has_execution:=true;
   select * into e from public.work_executions where organization_id=p_org and id=(r.manifest#>>'{execution,executionId}')::uuid;
   select * into receipt from private.execution_result_receipts where organization_id=p_org and execution_id=e.id;
   if e.id is null or receipt.id is null or r.manifest#>>'{execution,resultFingerprint}' is distinct from receipt.result_fingerprint
    or r.manifest#>>'{execution,inputFingerprint}' is distinct from receipt.input_fingerprint
    or not exists(select 1 from public.artifacts a where a.organization_id=p_org and a.id=r.artifact_id and a.work_id=e.work_id)
    then return false;end if;
   closure:=private.execution_result_source_closure_v1(p_org,e.id);
   if closure is null then return false;end if;
   combined:=jsonb_build_object('state','closed','sources',(combined->'sources')||(closure->'sources'),'resources',(combined->'resources')||(closure->'resources'),'bindings',(combined->'bindings')||(closure->'bindings'));
  end if;
 end loop;
 if not has_execution then return true;end if;
 -- Derivatives may add a different work and sources of their own.
 select jsonb_set(combined,'{resources}',combined->'resources'||coalesce(jsonb_agg(a.work_id),'[]')) into combined
 from public.artifact_revisions ar join public.artifacts a on (a.organization_id,a.id)=(ar.organization_id,ar.artifact_id)
 where ar.organization_id=p_org and ar.id=any(ids);
 select jsonb_set(combined,'{sources}',combined->'sources'||coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',l.source_version_id,
  'rightsVersionId',l.source_rights_version_id,'declaredSha256',v.declared_sha256)),'[]')) into combined
 from private.artifact_dependency_links l left join public.source_versions v on (v.organization_id,v.id)=(l.organization_id,l.source_version_id)
 where l.organization_id=p_org and l.revision_id=any(ids) and l.link_kind='source_version';
 return private.execution_closure_read_allowed_v1(p_org,combined,p_actor,p_operation);
exception when invalid_text_representation then return false;
end $$;
revoke all on function private.execution_artifact_read_allowed_v1(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.read_artifact_revision_v1(p_revision uuid)
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
 native_allowed:=private.execution_artifact_read_allowed_v1(r.organization_id,r.id,actor);
 if not private.institutional_native_read_allowed_v1(r.organization_id,r.id,actor) then native_allowed:=false;end if;
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
 if not native_allowed or not private.institutional_native_read_allowed_v1(r.organization_id,r.id,actor)
  or not private.execution_artifact_read_allowed_v1(r.organization_id,r.id,actor) then
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

CREATE OR REPLACE FUNCTION private.artifact_review_sources_allowed_v1(p_org uuid, p_revision uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare allowed boolean;
begin
 if not private.execution_artifact_read_allowed_v1(p_org,p_revision,p_actor) then return false;end if;
 if private.institutional_revision_missing_native_v1(p_org,p_revision) then return false;end if;
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
 if not private.institutional_native_read_allowed_v1(p_org,p_revision,p_actor) then return false;end if;
 return private.execution_artifact_read_allowed_v1(p_org,p_revision,p_actor);
end $function$;

CREATE OR REPLACE FUNCTION private.read_work_execution_v1(p_execution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.work_executions;j public.processing_jobs;run public.processing_runs;m private.execution_manifests;o private.execution_operation_receipts;r private.execution_result_receipts;current boolean;answer jsonb;begin
 select * into e from public.work_executions where id=p_execution_id;
 if not found then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform private.execution_read_access_v1(e.organization_id,e.work_id);
 select * into j from public.processing_jobs where organization_id=e.organization_id and execution_id=e.id and kind='work_execution';
 select * into run from public.processing_runs where organization_id=e.organization_id and id=e.processing_run_id;
 select * into m from private.execution_manifests where organization_id=e.organization_id and execution_id=e.id;
 select * into o from private.execution_operation_receipts where organization_id=e.organization_id and execution_id=e.id and operation_id=e.id;
 select * into r from private.execution_result_receipts where organization_id=e.organization_id and execution_id=e.id;
 current:=case when r.id is not null then private.execution_closure_read_allowed_v1(e.organization_id,private.execution_result_source_closure_v1(e.organization_id,e.id),auth.uid())
  else private.execution_inputs_current_v1(e.organization_id,e.id,auth.uid()) end;
 insert into private.execution_read_receipts(organization_id,execution_id,subject_user_id,inputs_current,bytes_returned) values(e.organization_id,e.id,auth.uid(),current,r.id is not null and current) on conflict do nothing;
 answer:=jsonb_build_object('schemaVersion','work-execution-read.v1','executionId',e.id,'workId',e.work_id,'requestId',e.request_id,'processingRunId',e.processing_run_id,'createdAt',e.created_at,
  'job',case when j.id is null then null else jsonb_build_object('status',j.status,'attempts',j.attempts,'lastErrorCode',j.last_error->>'code','availableAt',j.available_at,'updatedAt',j.updated_at) end,
  'run',case when run.id is null then null else jsonb_build_object('status',run.status,'completedAt',run.completed_at,'usage',run.usage) end,
  'manifest',case when m.id is null then null else jsonb_build_object('contractFingerprint',m.payload_fingerprint,'inputFingerprint',m.snapshot_fingerprint,'purpose',m.payload->>'purpose','method',m.payload->'method','budget',m.payload->'budget','requestedAt',m.payload->>'requestedAt') end,
  'operation',case when o.id is null then null else jsonb_build_object('state',o.state,'settledOutcome',o.settled_outcome,'settledReason',o.settled_reason,'resultFingerprint',o.result_fingerprint) end,
  'result',case when r.id is null then null
   when not current then jsonb_build_object('withheld','inputs_not_current','outcome',r.outcome,'reason',r.reason,'resultFingerprint',r.result_fingerprint,'committedAt',r.created_at)
   else jsonb_build_object('outcome',r.outcome,'reason',r.reason,'resultFingerprint',r.result_fingerprint,'canonicalResult',r.canonical_result,'committedAt',r.created_at) end,
  'inputsCurrent',current);
 -- Refusal after a wait rolls back the optimistic read receipt as well as the response.
 if current and r.id is not null and not private.execution_closure_read_allowed_v1(e.organization_id,private.execution_result_source_closure_v1(e.organization_id,e.id),auth.uid()) then
  raise exception 'execution_access_denied' using errcode='42501';
 end if;
 return answer;
end $function$;

CREATE OR REPLACE FUNCTION private.execution_read_access_v1(p_org uuid, p_work uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share nowait;
 if not found then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||p_org::text,0));
 if not exists(select 1 from private.principals where organization_id=p_org and user_id=auth.uid() and kind='human' and revoked_at is null)
 or not private.evaluate_resource_policy_v1(p_org,p_work,auth.uid(),'read','analysis') then raise exception 'execution_access_denied' using errcode='42501';end if;
end $function$;

CREATE OR REPLACE FUNCTION private.project_execution_result_artifact_v1(p_org uuid, p_execution uuid, p_job uuid, p_rights_subject uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r private.execution_result_receipts;e public.work_executions;j public.processing_jobs;packet jsonb;blocks jsonb;summary jsonb;
 method jsonb;sources jsonb;traces jsonb;links jsonb;snapshot text;gates text;manifest jsonb;rev_id uuid;result jsonb;code text;closure jsonb;historical public.artifact_revisions;
begin
 rev_id:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:artifact-revision:execution_result:'||p_execution::text);
 select * into r from private.execution_result_receipts x where x.organization_id=p_org and x.execution_id=p_execution;
 select * into e from public.work_executions x where x.organization_id=p_org and x.id=p_execution;
 if r.execution_id is null or e.id is null then return jsonb_build_object('recorded',false,'reason','execution_result_receipt_missing'); end if;
 begin
  packet:=r.canonical_result::jsonb;
 exception when others then
  return jsonb_build_object('recorded',false,'reason','execution_result_unmappable');
 end;
 if jsonb_typeof(packet)<>'object' or packet->>'schemaVersion' is distinct from 'capital-procedure-packet.v2' then
  return jsonb_build_object('recorded',false,'reason','execution_result_unmappable');
 end if;
 begin
  select * into j from public.processing_jobs x where x.organization_id=p_org and x.id=p_job and x.execution_id=p_execution;
  if j.id is null or p_rights_subject is null then raise exception 'execution_artifact_origin_missing' using errcode='42501'; end if;
  closure:=private.execution_result_source_closure_v1(p_org,p_execution);
  if closure is null or not private.execution_closure_read_allowed_v1(p_org,closure,p_rights_subject) then raise exception 'execution_artifact_closure_denied' using errcode='42501';end if;
  blocks:=private.execution_result_blocks_v1(packet);
  -- The claims summary exactly as the core recomputes it from the blocks.
  select coalesce(jsonb_agg(jsonb_build_object('blockKey',b.value->>'blockKey','claimIds',(select jsonb_agg(c->'claimId') from jsonb_array_elements(b.value->'claims') c)) order by b.ordinality),'[]'::jsonb)
   into summary from jsonb_array_elements(blocks) with ordinality b where jsonb_array_length(b.value->'claims')>0;
  select jsonb_build_object('procedureId',x.method_id,'platformReleaseId',x.platform_release_id,'houseReleaseId',x.house_release_id,'version',x.method_version) into method
   from private.execution_dependencies x where x.organization_id=p_org and x.execution_id=p_execution and x.dependency_kind='method_release' order by x.created_at,x.id limit 1;
  -- Sources as the adapter merges them: the packet's contract sources first, in its order, then the
  -- other pinned sources by version id; every pinned source keeps the rights version pinned for it.
  with pins as (
   select distinct on (x.source_version_id) x.source_version_id as sv,x.rights_version_id as rv from private.execution_dependencies x
   where x.organization_id=p_org and x.execution_id=p_execution and x.dependency_kind='source_version' order by x.source_version_id,x.created_at,x.id),
  own as (select (c.value#>>'{}')::uuid as sv,c.ordinality as n from jsonb_array_elements(coalesce(packet->'contractSourceVersionIds','[]'::jsonb)) with ordinality c),
  merged as (
   select o.sv,min(o.n) as n from own o group by o.sv
   union all
   select p.sv,1000000+row_number() over (order by p.sv) from pins p where not exists(select 1 from own o where o.sv=p.sv))
  select coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',m.sv,'rightsVersionId',p.rv) order by m.n),'[]'::jsonb) into sources
  from merged m left join pins p on p.sv=m.sv;
  select g.gates_fingerprint into gates from private.execution_gate_receipts g where g.organization_id=p_org and g.execution_id=p_execution;
  select s.payload_fingerprint into snapshot from private.execution_input_snapshots s where s.organization_id=p_org and s.execution_id=p_execution;
  select coalesce(jsonb_agg(to_jsonb(t.trace) order by t.n),'[]'::jsonb) into traces from (
   select v.trace,min(v.n) as n from (
    select 'capital-procedure-packet:'||(packet->>'fingerprint') as trace,1::bigint as n
    union all select 'capital-decision-delivery:'||(packet#>>'{decision,fingerprint}'),2
    union all select 'financial-core:'||(packet#>>'{decision,provenance,financialCoreVersion}'),3
    union all select 'ratio:'||(x.v->>'id')||':'||(x.v->>'fingerprint'),3+x.n from jsonb_array_elements(packet#>'{decision,ratios}') with ordinality x(v,n)
    union all select 'execution-gates:'||gates,1000000 where gates is not null) v
   group by v.trace) t;
  -- The adopted premises the execution pinned anchor the revision too.
  select coalesce(jsonb_agg(jsonb_build_object('kind','assumption_slot','assumptionVersionId',x.assumption_version_id,'slotKey',x.slot_key) order by x.assumption_version_id,x.slot_key),'[]'::jsonb)
   into links from (select distinct y.assumption_version_id,y.slot_key from private.execution_dependencies y
    where y.organization_id=p_org and y.execution_id=p_execution and y.dependency_kind='assumption_slot') x;
  manifest:=jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind','execution_result','audience','internal','format','json','bytes',null,
   'method',method,'execution',jsonb_build_object('executionId',p_execution,'resultFingerprint',r.result_fingerprint,'inputFingerprint',r.input_fingerprint),
   'inputSnapshot',case when snapshot is not null then jsonb_build_object('fingerprint',snapshot) end,'institutionalResult',null,
   'sources',sources,'claims',summary,'traces',traces,'template',null,
   'provenance',jsonb_build_object('producer','work-execution-commit','jobId',j.id,'taskRunId',null,'messageId',null,'capability','pinned-execution-consumer.v1'),
   'legacy',null);
  -- Exact legacy constructor remains replayable only when the stored manifest is identical.
  -- The common writer still verifies every ordered block and normalized dependency edge.
  select * into historical from public.artifact_revisions where organization_id=p_org and id=rev_id;
  if historical.id is null or historical.manifest is distinct from manifest then
   if exists(select 1 from jsonb_array_elements(coalesce(packet->'contractSourceVersionIds','[]')) own
    where not exists(select 1 from jsonb_array_elements(closure->'sources') pin where pin->>'sourceVersionId'=own#>>'{}'))
    then raise exception 'execution_artifact_contract_source_unbound' using errcode='42501';end if;
   select coalesce(jsonb_agg(jsonb_build_object('sourceVersionId',pin->'sourceVersionId','rightsVersionId',pin->'rightsVersionId')
    order by pin->>'sourceVersionId',pin->>'rightsVersionId'),'[]') into sources from jsonb_array_elements(closure->'sources') pin;
   manifest:=jsonb_set(manifest,'{sources}',sources);
  end if;
  -- The commit keeps its own lock order: the revision is new per execution, so only its artifact row is locked.
  result:=private.create_artifact_revision_v1(p_org,e.work_id,'execution_result','execution:'||p_execution::text,'internal','worker',manifest,blocks,links,
   null,null,null,null,p_rights_subject,rev_id,false);
  if result->>'revision_id' is distinct from rev_id::text then raise exception 'execution_artifact_identity_mismatch' using errcode='23505'; end if;
  if not private.execution_closure_read_allowed_v1(p_org,closure,p_rights_subject) then raise exception 'execution_artifact_closure_denied' using errcode='42501';end if;
  return jsonb_build_object('recorded',true,'replayed',(result->>'replayed')::boolean,'revisionId',result->'revision_id');
 exception when others then
  code:=case when sqlerrm ~ '^[a-z][a-z0-9_]{0,80}$' then sqlerrm else 'unclassified' end;
  raise warning 'execution_result_artifact_not_recorded: % (%)',code,sqlstate;
  return jsonb_build_object('recorded',false,'reason','execution_result_artifact_failed','code',code,'sqlstate',sqlstate);
 end;
end $function$;


create or replace function private.execution_artifact_projection_v1(p_org uuid,p_execution uuid,p_subject uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r private.execution_result_receipts;e public.work_executions;a public.artifact_revisions;packet jsonb;rev uuid;
begin
 select * into e from public.work_executions where organization_id=p_org and id=p_execution;
 select * into r from private.execution_result_receipts where organization_id=p_org and execution_id=p_execution;
 if e.id is null or r.id is null then return jsonb_build_object('state','not_committed'); end if;
 if not private.execution_closure_read_allowed_v1(p_org,private.execution_result_source_closure_v1(p_org,p_execution),p_subject) then return jsonb_build_object('state','restricted'); end if;
 begin packet:=r.canonical_result::jsonb;
 exception when data_exception then return jsonb_build_object('state','unsupported'); end;
 if jsonb_typeof(packet) is distinct from 'object' or packet->>'schemaVersion' is distinct from 'capital-procedure-packet.v2'
 then return jsonb_build_object('state','unsupported'); end if;
 rev:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:artifact-revision:execution_result:'||p_execution::text);
 select * into a from public.artifact_revisions where id=rev;
 if not found then return jsonb_build_object('state','missing'); end if;
 if a.organization_id is distinct from p_org or a.manifest#>>'{execution,executionId}' is distinct from p_execution::text
  or a.manifest#>>'{execution,resultFingerprint}' is distinct from r.result_fingerprint
  or a.manifest#>>'{execution,inputFingerprint}' is distinct from r.input_fingerprint
  or not exists(select 1 from public.artifacts x where x.organization_id=p_org and x.id=a.artifact_id and x.work_id=e.work_id
   and x.kind='execution_result' and x.subject='execution:'||p_execution::text)
 then return jsonb_build_object('state','restricted'); end if;
 if not private.artifact_review_sources_allowed_v1(p_org,a.id,p_subject) then return jsonb_build_object('state','restricted'); end if;
 return jsonb_build_object('state','available','revisionId',a.id);
end $$;
revoke all on function private.execution_artifact_projection_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;


create or replace function private.create_artifact_revision_v1(p_org uuid, p_work uuid, p_kind text, p_subject text, p_audience text, p_origin text, p_manifest jsonb, p_blocks jsonb, p_links jsonb, p_content_sha256 text, p_byte_length bigint, p_legacy_ref jsonb, p_actor uuid, p_rights_subject uuid DEFAULT NULL::uuid, p_revision_id uuid DEFAULT NULL::uuid, p_lock_work boolean DEFAULT true)
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
   if lnk->>'rightsVersionId' is null and (select count(distinct l->>'rightsVersionId') from jsonb_array_elements(all_links) l where l->>'kind'='source_version' and l->>'sourceVersionId'=lnk->>'sourceVersionId')<>1 then raise exception 'ambiguous_source_rights' using errcode='22023';end if;
   select l->>'rightsVersionId' into rv from jsonb_array_elements(all_links) l where l->>'kind'='source_version' and l->>'sourceVersionId'=lnk->>'sourceVersionId'
    and (lnk->>'rightsVersionId' is null or l->>'rightsVersionId'=lnk->>'rightsVersionId') limit 1;
   if rv is null then raise exception 'artifact_link_not_in_manifest' using errcode='22023';end if;
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
   if jsonb_typeof(p_manifest->'legacy')<>'object' and (p_rights_subject is null or not private.source_use_allowed_v1(p_org,sv,p_rights_subject,'read','analysis')) then
    raise exception 'artifact_source_use_refused' using errcode='42501'; end if;
  elsif lnk_kind='execution' then
   if not exists(select 1 from public.work_executions e where e.organization_id=p_org and e.id=(lnk->>'executionId')::uuid) then raise exception 'artifact_link_target_not_found' using errcode='P0002'; end if;
   if not exists(select 1 from public.work_executions e where e.organization_id=p_org and e.id=(lnk->>'executionId')::uuid and e.work_id=p_work) then raise exception 'artifact_link_work_mismatch' using errcode='22023'; end if;
   if jsonb_typeof(p_manifest->'legacy') is distinct from 'object' and not private.execution_closure_read_allowed_v1(p_org,private.execution_result_source_closure_v1(p_org,(lnk->>'executionId')::uuid),p_rights_subject,'read')
    then raise exception 'artifact_source_use_refused' using errcode='42501';end if;
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
   if jsonb_typeof(p_manifest->'legacy') is distinct from 'object' and not private.execution_artifact_read_allowed_v1(p_org,(lnk->>'derivedFromRevisionId')::uuid,p_rights_subject,'read')
    then raise exception 'artifact_source_use_refused' using errcode='42501';end if;
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
  for lnk in select value from jsonb_array_elements(all_links) where value->>'kind'='execution' loop
   if jsonb_typeof(p_manifest->'legacy') is distinct from 'object' and not private.execution_closure_read_allowed_v1(p_org,private.execution_result_source_closure_v1(p_org,(lnk->>'executionId')::uuid),p_rights_subject,'read')
    then raise exception 'artifact_source_use_refused' using errcode='42501';end if;
  end loop;
  for lnk in select value from jsonb_array_elements(all_links) where value->>'kind'='artifact_revision' loop
   if jsonb_typeof(p_manifest->'legacy') is distinct from 'object' and not private.execution_artifact_read_allowed_v1(p_org,(lnk->>'derivedFromRevisionId')::uuid,p_rights_subject,'read')
    then raise exception 'artifact_source_use_refused' using errcode='42501';end if;
  end loop;
  return jsonb_build_object('artifact_id',a.id,'revision_id',existing.id,'revision_no',existing.revision_no,'manifest_fingerprint',existing.manifest_fingerprint,'replayed',true);
 end if;
 -- Only a new revision is a new derivation. Identical replay above retains current read/store authority.
 for lnk in select value from jsonb_array_elements(all_links) loop
  if jsonb_typeof(p_manifest->'legacy') is distinct from 'object' then
   if lnk->>'kind'='source_version' and not private.source_use_allowed_v1(p_org,(lnk->>'sourceVersionId')::uuid,p_rights_subject,'derive','analysis') then raise exception 'artifact_source_use_refused' using errcode='42501';end if;
   if lnk->>'kind'='execution' and not private.execution_closure_read_allowed_v1(p_org,private.execution_result_source_closure_v1(p_org,(lnk->>'executionId')::uuid),p_rights_subject,'derive') then raise exception 'artifact_source_use_refused' using errcode='42501';end if;
   if lnk->>'kind'='artifact_revision' and not private.execution_artifact_read_allowed_v1(p_org,(lnk->>'derivedFromRevisionId')::uuid,p_rights_subject,'derive') then raise exception 'artifact_source_use_refused' using errcode='42501';end if;
  end if;
 end loop;
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
  for lnk in select value from jsonb_array_elements(all_links) where value->>'kind'='execution' loop
   if jsonb_typeof(p_manifest->'legacy') is distinct from 'object' and not private.execution_closure_read_allowed_v1(p_org,private.execution_result_source_closure_v1(p_org,(lnk->>'executionId')::uuid),p_rights_subject,'derive')
    then raise exception 'artifact_source_use_refused' using errcode='42501';end if;
  end loop;
  for lnk in select value from jsonb_array_elements(all_links) where value->>'kind'='artifact_revision' loop
   if jsonb_typeof(p_manifest->'legacy') is distinct from 'object' and not private.execution_artifact_read_allowed_v1(p_org,(lnk->>'derivedFromRevisionId')::uuid,p_rights_subject,'derive')
    then raise exception 'artifact_source_use_refused' using errcode='42501';end if;
  end loop;
 return jsonb_build_object('artifact_id',a.id,'revision_id',rev_id,'revision_no',next_no,'manifest_fingerprint',fingerprint,'replayed',false);
end $function$;

