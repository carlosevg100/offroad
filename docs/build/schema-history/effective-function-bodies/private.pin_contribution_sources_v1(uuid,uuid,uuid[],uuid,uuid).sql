CREATE OR REPLACE FUNCTION private.pin_contribution_sources_v1(p_org uuid, p_revision uuid, p_sources uuid[], p_parent uuid, p_base uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare source_id uuid; right_id uuid; begin
 insert into private.contribution_source_dependencies(organization_id,revision_id,source_version_id,rights_version_id) select p_org,p_revision,source_version_id,rights_version_id from private.contribution_source_dependencies
 where organization_id=p_org and revision_id in (p_parent,p_base) on conflict do nothing;
 foreach source_id in array p_sources loop
  select id into right_id from private.source_rights_versions where organization_id=p_org and source_version_id=source_id order by revision desc limit 1;
  if right_id is null then raise exception 'contribution_source_denied' using errcode='42501'; end if;
  insert into private.contribution_source_dependencies(organization_id,revision_id,source_version_id,rights_version_id) values(p_org,p_revision,source_id,right_id) on conflict do nothing;
 end loop;
 if (select count(*) from private.contribution_source_dependencies where organization_id=p_org and revision_id=p_revision)>1000 then raise exception 'contribution_lineage_limit' using errcode='22023';end if;
 if not private.contribution_sources_allowed_v1(p_org,p_revision,auth.uid()) then raise exception 'contribution_source_denied' using errcode='42501'; end if;
end $function$
