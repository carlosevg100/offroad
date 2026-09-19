-- A house method does not disclose the identity of a private work to other method readers.
drop policy method_scope_bindings_select on public.method_scope_bindings;
create policy method_scope_bindings_select on public.method_scope_bindings for select to authenticated
using(private.method_release_readable_v1(organization_id,release_id) and (work_id is null or private.can_access_resource_v1(organization_id,work_id,'read')));
create trigger method_policy_updated before update on private.method_publication_policies for each row execute function private.set_updated_at();

create or replace function private.list_method_releases_v1(p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=private.require_vault_actor_v1();rows jsonb;bases jsonb;bindings jsonb;receipts jsonb;scope uuid;begin
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'method_page_invalid' using errcode='22023';end if;
 select id into strict scope from public.vault_scopes where organization_id=org;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'methodId',b.method_id,'version',b.version,'manifestHash',b.manifest_hash,'components',b.components,'evidence',b.evidence,'approval',b.approval) order by b.id),'[]') into bases
 from private.platform_method_releases b join private.platform_capability_releases c on c.capability_key=b.capability_key where c.released and c.method_id=b.method_id and c.method_version=b.version;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (
  select r.id,r.title,r.status,r.base_release_id,r.manifest,r.manifest_fingerprint,r.evidence_fingerprint,r.created_by,r.published_at,r.retired_at,
  (select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'reviewed_by',v.reviewed_by,'review_text',v.review_text,'created_at',v.created_at) order by v.created_at,v.id),'[]') from public.method_review_records v where v.organization_id=org and v.release_id=r.id) reviews
  from public.method_releases r where r.organization_id=org and private.method_release_readable_v1(org,r.id) order by r.created_at desc,r.id limit 26 offset p_offset
 ) q;
 -- Bounded to the current page: no unbounded organization-wide history payload.
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'releaseId',b.release_id,'unitId',b.unit_id,'workType',b.work_type,'workId',b.work_id)),'[]') into bindings
 from public.method_scope_bindings b where b.organization_id=org and b.retired_at is null
 and b.release_id in (select (x->>'id')::uuid from jsonb_array_elements(rows) x)
 and (b.work_id is null or private.can_access_resource_v1(org,b.work_id,'read'));
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into receipts from (
  select r.id,r.published_at,r.retired_at from public.method_releases r where r.organization_id=org and r.status='published'
  and private.method_scope_allowed_v1(org,'publish') and not private.method_release_readable_v1(org,r.id)
  order by r.published_at desc,r.id limit 26 offset p_offset
 ) q;
 return jsonb_build_object('rows',rows,'bases',bases,'bindings',bindings,'unavailableReceipts',receipts,'scopeId',scope,'canRead',private.method_scope_allowed_v1(org,'read'),
 'canWork',private.method_scope_allowed_v1(org,'work'),'canPublish',private.method_scope_allowed_v1(org,'publish'),'canManage',private.can_manage_organization(org),
 'separateReviewer',coalesce((select separate_reviewer from private.method_publication_policies where organization_id=org),true),'offset',p_offset);
end $$;
