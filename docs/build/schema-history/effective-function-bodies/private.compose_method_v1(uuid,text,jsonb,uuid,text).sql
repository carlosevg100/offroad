CREATE OR REPLACE FUNCTION private.compose_method_v1(p_org uuid, p_base text, p_overrides jsonb, p_unit uuid, p_work_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b private.platform_method_releases;o jsonb;c jsonb;point jsonb;v public.vault_entry_versions;seen text[]:='{}';key text;ordered jsonb;parameters jsonb;begin
 select * into b from private.platform_method_releases where id=p_base;
 if b.id is null or not private.platform_method_reference_available_v1(b.id) then raise exception 'method_base_unavailable' using errcode='22023';end if;
 if p_overrides is null or jsonb_typeof(p_overrides)<>'array' or jsonb_array_length(p_overrides)>100 or octet_length(p_overrides::text)>100000
 or p_work_type is null or length(btrim(p_work_type)) not between 3 and 120 then raise exception 'method_candidate_invalid' using errcode='22023';end if;
 if p_unit is not null and not exists(select 1 from private.organization_units where organization_id=p_org and id=p_unit and enabled) then raise exception 'method_scope_denied' using errcode='42501';end if;
 for o in select * from jsonb_array_elements(p_overrides) loop
  if exists(select 1 from unnest(array['componentId','pointId','version','scope','scopeId','rationale']) k where jsonb_typeof(o->k) is distinct from 'string') then raise exception 'method_override_invalid' using errcode='22023';end if;
  if jsonb_typeof(o)<>'object' or not o ?& array['componentId','pointId','version','scope','scopeId','rationale','source','value']
  or (select count(*) from jsonb_object_keys(o))<>8 or jsonb_typeof(o->'source')<>'object'
  or not o->'source' ?& array['versionId','fingerprint'] or (select count(*) from jsonb_object_keys(o->'source'))<>2
  or o->>'version' !~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-v[0-9]+$' or length(btrim(o->>'rationale')) not between 5 and 2000
  or o->>'scope' not in ('organization','unit','work_type') then raise exception 'method_override_invalid' using errcode='22023';end if;
  if o->>'scopeId' is distinct from (case o->>'scope' when 'organization' then p_org::text when 'unit' then p_unit::text else p_work_type end) then raise exception 'method_override_scope_conflict' using errcode='22023';end if;
  select x into c from jsonb_array_elements(b.components) x where x->>'id'=o->>'componentId';
  select x into point from jsonb_array_elements(coalesce(c->'overridePoints','[]')) x where x->>'id'=o->>'pointId';
  if c is null or point is null or c->>'kind' in ('formula','quality_gate') or (c->>'kind'='rule' and c->>'authority' in ('law','contract'))
  or point->>'target' not in ('narrative','template','assumption') or point->>'requiresRationale' is distinct from 'true' then raise exception 'method_protected_override' using errcode='22023';end if;
  if not private.method_value_matches_v1(point->'contract'->'value',o->'value') then raise exception 'method_override_contract_conflict' using errcode='22023';end if;
  key:=(o->>'componentId')||':'||(o->>'pointId')||':'||(o->>'scope');
  if key=any(seen) then raise exception 'method_override_ambiguous' using errcode='22023';end if;seen:=array_append(seen,key);
  select * into v from public.vault_entry_versions where organization_id=p_org and id=(o->'source'->>'versionId')::uuid;
  if v.id is null or v.content_fingerprint is distinct from o->'source'->>'fingerprint' or not private.can_read_vault_version_v1(p_org,v.id)
  or not private.vault_reference_allowed_v1(p_org,v.id,'publication') or not exists(select 1 from public.vault_publications pub join public.vault_publication_requests req on req.organization_id=pub.organization_id and req.id=pub.request_id
    where pub.organization_id=p_org and pub.withdrawn_at is null and req.version_id=v.id and req.work_scope_id is null and req.purpose in ('analysis','retrieval')) then raise exception 'method_source_not_published' using errcode='42501';end if;
 end loop;
 select coalesce(jsonb_agg(x order by case x->>'scope' when 'organization' then 0 when 'unit' then 1 else 2 end,x->>'componentId' collate "C",x->>'pointId' collate "C"),'[]') into ordered from jsonb_array_elements(p_overrides) x;
 select coalesce(jsonb_agg(x order by x->>'componentId' collate "C",x->>'pointId' collate "C"),'[]') into parameters from (
  select distinct on(x->>'componentId',x->>'pointId') x from jsonb_array_elements(ordered) x
  order by x->>'componentId',x->>'pointId',case x->>'scope' when 'organization' then 0 when 'unit' then 1 else 2 end desc
 ) chosen;
 return jsonb_build_object('schemaVersion','method-composition.v1','baseReleaseId',b.id,'baseManifestHash',b.manifest_hash,
 'context',jsonb_build_object('organizationId',p_org,'unitId',p_unit,'workType',p_work_type),'components',b.components,'overrides',ordered,'parameters',parameters,'grantsExecution',false);
end $function$
