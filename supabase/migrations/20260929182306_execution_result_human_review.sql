-- Stage 20 / 3K: exact human approval for execution results and descendants.
create or replace function private.artifact_revision_release_v1(r public.artifact_revisions)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare fps text[]:=array_remove(array[r.manifest_fingerprint,r.content_sha256,r.legacy_ref->>'fingerprint'],null);approved boolean;
begin
 -- Captured but unproved output is never historical fallback, including derivations.
 if private.institutional_revision_missing_native_v1(r.organization_id,r.id) then return 'blocked';end if;
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
 -- Execution receipts attest computation, never human approval. Every derived revision
 -- requires its own act; a legacy package/confirmation cannot bypass this branch.
 if exists(with recursive ancestry(id) as (select r.id union select l.derived_from_revision_id from ancestry a
  join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=a.id and l.link_kind='artifact_revision')
  select 1 from ancestry a join public.artifact_revisions x on x.organization_id=r.organization_id and x.id=a.id
  where jsonb_typeof(x.manifest->'execution')='object'
   or exists(select 1 from private.artifact_dependency_links l where l.organization_id=r.organization_id and l.revision_id=x.id and l.link_kind='execution'))
 then
  approved:=exists(select 1 from public.artifact_reviews v join public.artifacts a on (a.organization_id,a.id)=(v.organization_id,v.artifact_id)
   where v.organization_id=r.organization_id and v.artifact_id=r.artifact_id and v.revision_id=r.id
    and v.work_id=a.work_id and v.manifest_fingerprint=r.manifest_fingerprint and v.audience=r.audience
    and private.artifact_review_is_active_v1(r.organization_id,v.id));
  return case when approved then 'released' when r.audience='external' then 'blocked' else 'internal' end;
 end if;
 approved:=exists(select 1 from public.capital_project_artifact_decisions d where d.organization_id=r.organization_id and d.decision='confirm' and d.artifact_fingerprint=any(fps))
  or exists(select 1 from public.deal_state_objects pr cross join unnest(fps) f where pr.organization_id=r.organization_id and pr.object_type='package_review' and pr.status='approved'
   and pr.dependencies @> jsonb_build_array(jsonb_build_object('objectType','material_artifact','objectFingerprint',f)))
  or (jsonb_typeof(r.manifest->'institutionalResult')='object' and exists(select 1 from private.institutional_model_results m
   where m.organization_id=r.organization_id and m.id=(r.manifest#>>'{institutionalResult,id}')::uuid and m.status='completed' and m.superseded_by is null
    and private.institutional_result_established_v1(m.organization_id,m.id)));
 return case when approved then 'released' when r.audience='external' then 'blocked' else 'internal' end;
end $function$
;

