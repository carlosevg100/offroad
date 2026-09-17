-- An adopted derivative remains eligible only while pinned and current rights permit use.
set search_path='';
create function private.adoption_dependency_allowed_v1(p_org uuid,p_source uuid,p_rights uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 select private.source_use_allowed_v1(p_org,p_source,auth.uid(),'read','analysis')
 and private.source_use_allowed_v1(p_org,p_source,auth.uid(),'derive','analysis')
 and private.source_use_allowed_v1(p_org,p_source,auth.uid(),'store','analysis')
 and exists(select 1 from private.source_rights_versions r where r.organization_id=p_org and r.source_version_id=p_source and r.id=p_rights
 and r.operations @> array['read','derive','store'] and 'analysis'=any(r.purposes) and r.valid_from<=clock_timestamp()
 and (r.expires_at is null or r.expires_at>clock_timestamp()) and (r.store_until is null or r.store_until>clock_timestamp()));
$$;
revoke all on function private.adoption_dependency_allowed_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create or replace function private.can_read_adoption_v1(p_org uuid,p_id uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.adoption_decisions a
 join public.assumption_sets s on s.organization_id=a.organization_id and s.id=a.set_id
 join public.definition_versions d on d.organization_id=a.organization_id and d.id=a.definition_version_id
 left join public.observations o on o.organization_id=a.organization_id and o.id=a.reference_observation_id
 where a.organization_id=p_org and a.id=p_id and private.can_access_resource_v1(p_org,s.work_id,'read')
 and private.can_read_entity_v1(a.entity_id) and private.can_read_definition_version_v1(p_org,a.definition_version_id)
 and (a.reference_observation_id is null or private.can_read_observation_v1(p_org,a.reference_observation_id))
 and (o.source_version_id is null or private.adoption_dependency_allowed_v1(p_org,o.source_version_id,o.source_rights_version_id))
 and (d.contract_source_version_id is null or private.adoption_dependency_allowed_v1(p_org,d.contract_source_version_id,d.contract_rights_version_id)));
$$;
