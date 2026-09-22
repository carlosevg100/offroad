-- Stage 17: the published capital payload must describe the authority actually pinned.
-- No modification to a published executor, no producer grant and no execution activation.
set search_path='';

-- Standalone references need the same transitive restrictions as adopted entries.
create function private.execution_capital_reference_current_v1(p_org uuid,p_subject uuid,p_observation uuid,p_definition uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 with obs as (
  select o.* from public.observations o where o.organization_id=p_org and o.id=p_observation
 ), defs as (
  select d.*,m.dossier_id from public.definition_versions d join public.metric_definitions m on m.organization_id=d.organization_id and m.id=d.metric_definition_id
  where d.organization_id=p_org and (d.id=p_definition or d.id in(select definition_version_id from obs))
 ), entities as (
  select e.* from public.entities e where e.id in(select entity_id from obs)
 ), dossiers as (
  select dossier_id id from obs union select dossier_id from defs
  union select origin_dossier_id from entities where organization_id is not null
 ), sources as (
  select source_version_id id,source_rights_version_id rights from obs
  union select contract_source_version_id,contract_rights_version_id from defs where contract_source_version_id is not null
 )
 select (p_observation is not null or p_definition is not null)
 and (p_observation is null or exists(select 1 from obs))
 and (p_definition is null or exists(select 1 from defs where id=p_definition))
 and not exists(select 1 from obs where definition_version_id is not null and not exists(select 1 from defs where id=obs.definition_version_id))
 and not exists(select 1 from entities where organization_id is not null and organization_id<>p_org)
 and not exists(select 1 from dossiers x where x.id is null or not exists(select 1 from public.dossiers d where d.id=x.id and d.organization_id=p_org
   and private.evaluate_resource_policy_v1(p_org,d.resource_id,p_subject,'read','analysis')))
 and not exists(select 1 from sources x where x.id is null or not exists(select 1 from private.source_rights_versions r
   where r.organization_id=p_org and r.source_version_id=x.id and r.id=x.rights
   and r.operations @> array['read','process','store','derive'] and 'analysis'=any(r.purposes) and r.valid_from<=clock_timestamp()
   and (r.expires_at is null or r.expires_at>clock_timestamp()) and (r.store_until is null or r.store_until>clock_timestamp())
   and private.source_use_allowed_v1(p_org,x.id,p_subject,'read','analysis')
   and private.source_use_allowed_v1(p_org,x.id,p_subject,'process','analysis')
   and private.source_use_allowed_v1(p_org,x.id,p_subject,'store','analysis')
   and private.source_use_allowed_v1(p_org,x.id,p_subject,'derive','analysis')));
$$;
revoke all on function private.execution_capital_reference_current_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.execution_capital_payload_current_v1(c jsonb, payload jsonb, subject uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare
 org uuid:=(c->>'organizationId')::uuid; work uuid:=(c->>'workId')::uuid;
 pins jsonb:=coalesce(c#>'{inputs,adoptions}','[]')||coalesce(c#>'{inputs,hypotheses}','[]');
 sources jsonb:=coalesce(c#>'{inputs,sources}','[]');
 pending jsonb[]:=array[payload]; depths integer[]:=array[0]; cursor integer:=1;
 node jsonb; child jsonb; entry jsonb; pair record; ref text; kind text; basis jsonb;
 v public.assumption_versions; definition public.definition_versions; observation public.observations;
 n integer:=0; total_bytes bigint:=pg_column_size(payload); base_count integer:=0; seen_envelopes text[]:='{}';
begin
 if c#>>'{method,methodId}'<>'prepare-capital-structure-decision' then return true;end if;
 if c#>>'{method,methodVersion}' is distinct from '2026.09.21-v4'
 or c#>>'{method,manifestHash}' is distinct from '2c023cf7b7ec7e35b7f59d363a9b287cb245d3196cd431fc0c2bf1fc937f8478'
 or payload->>'schemaVersion' is distinct from 'capital-procedure-packet-input.v2'
 or total_bytes>8388608 then return false;end if;
 -- No authoritative derivation-to-observation publication receipt exists yet. A caller's
 -- fingerprint must never impersonate one, including an otherwise numerically aligned link.
 if exists(select 1 from jsonb_array_elements(payload->'adoptionLinks') x
   where jsonb_array_length(x->'origins')>0) then return false;end if;
 while cursor<=coalesce(array_length(pending,1),0) loop
  node:=pending[cursor];n:=n+1;
  if n>32768 or depths[cursor]>64 then return false;end if;
  if jsonb_typeof(node)='object' then
   if (node ? 'workId' and node->>'workId' is distinct from work::text)
   or (node ? 'purpose' and node->>'purpose' is distinct from c->>'purpose') then return false;end if;
   if node ? 'versionId' and not node ? 'contractAnchor' and not exists(select 1 from jsonb_array_elements(pins) p where p->>'assumptionVersionId'=node->>'versionId') then return false;end if;
   if node->>'entityId' is not null and not exists(select 1 from public.entities e left join public.dossiers ds on ds.organization_id=e.organization_id and ds.id=e.origin_dossier_id
    where e.id=(node->>'entityId')::uuid and (e.organization_id is null or (e.organization_id=org and private.evaluate_resource_policy_v1(org,ds.resource_id,subject,'read','analysis')))) then return false;end if;
   if node ? 'canonical' then
    if jsonb_typeof(node->'canonical')<>'string' or jsonb_typeof(node->'fingerprint')<>'string' then return false;end if;
    total_bytes:=total_bytes+octet_length(node->>'canonical');
    if total_bytes>16777216 then return false;end if;
    basis:=private.execution_json_projection_v1(node->>'canonical');
    if basis->>'schemaVersion' is distinct from 'contextual-adoption.v1'
    or basis->>'workId' is distinct from work::text or basis->>'purpose' is distinct from c->>'purpose' then return false;end if;
    select av.* into v from public.assumption_versions av join public.assumption_sets s on s.organization_id=av.organization_id and s.id=av.set_id
    where av.organization_id=org and av.id=(basis->>'versionId')::uuid and av.classification='working_basis' and s.work_id=work and s.purpose=c->>'purpose';
    if not found or v.canonical_snapshot is distinct from node->>'canonical' or v.content_fingerprint is distinct from node->>'fingerprint'
    then return false;end if;
    if not (v.content_fingerprint=any(seen_envelopes)) then
    for entry in select value from jsonb_array_elements(basis->'entries') loop
     kind:=case entry->>'kind' when 'observation' then 'adoptions' when 'hypothesis' then 'hypotheses' end;
     if kind is null or not exists(select 1 from jsonb_array_elements(c->'inputs'->kind) p
       where p->>'id'=entry->>'decisionId' and p->>'assumptionVersionId'=v.id::text and p->>'fingerprint'=v.content_fingerprint)
     then return false;end if;
    end loop;
    base_count:=base_count+1;
    pending:=array_append(pending,basis);depths:=array_append(depths,depths[cursor]+1);
    seen_envelopes:=array_append(seen_envelopes,v.content_fingerprint);
    end if;
   end if;
   -- A contractual definition has an explicit path-specific meaning for versionId.
   if node ?& array['field','versionId','contractSourceVersionId','contractAnchor','definition'] then
    select d.* into definition from public.definition_versions d join public.metric_definitions m on m.organization_id=d.organization_id and m.id=d.metric_definition_id
    where d.organization_id=org and d.id=(node->>'versionId')::uuid and m.kind='contractual';
    if not found or not private.execution_capital_reference_current_v1(org,subject,null,definition.id)
    or node->>'kind'<>'contractual' or definition.definition is distinct from node->>'definition'
    or definition.contract_source_version_id::text is distinct from node->>'contractSourceVersionId'
    or definition.contract_anchor is distinct from node->'contractAnchor'
    or not exists(select 1 from public.metric_definitions m join public.dossiers ds on ds.organization_id=m.organization_id and ds.id=m.dossier_id
      where m.organization_id=org and m.id=definition.metric_definition_id and private.evaluate_resource_policy_v1(org,ds.resource_id,subject,'read','analysis')) then return false;end if;
   end if;
   -- The source table inside each preparation binds every observation to that source.
   if node ?& array['document','sourceVersionId','observationIds'] then
    for ref in select jsonb_array_elements_text(node->'observationIds') loop
     if not exists(select 1 from public.observations o where o.organization_id=org and o.id=ref::uuid and o.source_version_id::text=node->>'sourceVersionId') then return false;end if;
    end loop;
   end if;
   for pair in select * from jsonb_each(node) loop
    if pair.key in ('sourceVersionId','contractSourceVersionId') and pair.value<>'null'::jsonb then
     if not exists(select 1 from jsonb_array_elements(sources) s where s->>'sourceVersionId'=pair.value#>>'{}') then return false;end if;
    elsif pair.key in ('sourceVersionIds','contractSourceVersionIds') then
     for ref in select jsonb_array_elements_text(pair.value) loop
      if not exists(select 1 from jsonb_array_elements(sources) s where s->>'sourceVersionId'=ref) then return false;end if;
     end loop;
    elsif (pair.key='decisionId' or pair.key like '%DecisionId') and pair.value<>'null'::jsonb then
     if not exists(select 1 from jsonb_array_elements(pins) p where p->>'id'=pair.value#>>'{}') then return false;end if;
    elsif pair.key in ('basisIds','basisDecisionIds','interpretationDecisionIds') then
     for ref in select jsonb_array_elements_text(pair.value) loop
      if not exists(select 1 from jsonb_array_elements(pins) p where p->>'id'=ref) then return false;end if;
     end loop;
    elsif pair.key='definitionVersionId' and pair.value<>'null'::jsonb then
     select d.* into definition from public.definition_versions d join public.metric_definitions m on m.organization_id=d.organization_id and m.id=d.metric_definition_id
     join public.dossiers ds on ds.organization_id=m.organization_id and ds.id=m.dossier_id
     where d.organization_id=org and d.id=(pair.value#>>'{}')::uuid and private.evaluate_resource_policy_v1(org,ds.resource_id,subject,'read','analysis');
     if not found or not private.execution_capital_reference_current_v1(org,subject,null,definition.id) then return false;end if;
     if definition.contract_source_version_id is not null and not exists(select 1 from jsonb_array_elements(sources) s where s->>'sourceVersionId'=definition.contract_source_version_id::text) then return false;end if;
    elsif pair.key in ('observationId','observationIds') and pair.value<>'null'::jsonb then
     for ref in select jsonb_array_elements_text(case when pair.key='observationId' then jsonb_build_array(pair.value) else pair.value end) loop
      select o.* into observation from public.observations o join public.dossiers ds on ds.organization_id=o.organization_id and ds.id=o.dossier_id
      where o.organization_id=org and o.id=ref::uuid and private.evaluate_resource_policy_v1(org,ds.resource_id,subject,'read','analysis');
      if not found or not private.execution_capital_reference_current_v1(org,subject,observation.id,null)
      or not exists(select 1 from jsonb_array_elements(sources) s where s->>'sourceVersionId'=observation.source_version_id::text) then return false;end if;
     end loop;
    end if;
    if jsonb_typeof(pair.value) in ('object','array') then
     if array_length(pending,1)>=32768 then return false;end if;
     pending:=array_append(pending,pair.value);depths:=array_append(depths,depths[cursor]+1);
    end if;
   end loop;
  elsif jsonb_typeof(node)='array' then
   for child in select value from jsonb_array_elements(node) loop
    if array_length(pending,1)>=32768 then return false;end if;
    pending:=array_append(pending,child);depths:=array_append(depths,depths[cursor]+1);
   end loop;
  end if;
  cursor:=cursor+1;
 end loop;
 return base_count>0;
exception when data_exception then return false;
end $$;
revoke all on function private.execution_capital_payload_current_v1(jsonb,jsonb,uuid) from public,anon,authenticated,service_role;

do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.request_work_execution_v1(uuid,text,text)'::regprocedure);
 needle:=' perform private.execution_json_projection_v1(p_snapshot_text);';
 if position(needle in body)=0 then raise exception 'capital_provenance_request_anchor_missing';end if;
 execute replace(body,needle,needle||E'\n if not private.execution_capital_payload_current_v1(c,private.execution_json_projection_v1(p_snapshot_text),auth.uid()) then raise exception ''execution_payload_provenance_denied'' using errcode=''42501'';end if;');
 body:=pg_get_functiondef('private.execution_inputs_current_v1(uuid,uuid,uuid)'::regprocedure);
 needle:=' select not exists(';
 if position(needle in body)=0 then raise exception 'capital_provenance_current_anchor_missing';end if;
 execute replace(body,needle,E' select exists(select 1 from private.execution_manifests m join private.execution_input_snapshots s on s.organization_id=m.organization_id and s.execution_id=m.execution_id where m.organization_id=p_org and m.execution_id=p_execution and private.execution_capital_payload_current_v1(m.payload,s.payload,p_subject))\n and not exists(');
end $patch$;
