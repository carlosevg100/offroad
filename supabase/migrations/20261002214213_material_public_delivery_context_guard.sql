-- Restore exact capture-context validation for every delivery and replay.
create or replace function private.worker_capture_capital_project_delivery_v1(p_job_id uuid,p_capability_token text,p_capture_id uuid,p_delivery_key text,p_payload jsonb,p_origin_refs jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 s private.capital_public_input_snapshots; d private.capital_public_deliveries; l private.capital_public_delivery_licenses;
 fp text; origin_fp text; public_fp text; delivered_at timestamptz:=clock_timestamp(); origin jsonb; proof jsonb; pins jsonb;
 candidate record; reason text; state text:='unresolved'; license_org uuid; license_version uuid; license_right uuid; license_binding uuid;
 explicit_pin boolean; item jsonb; license_url text; current_context jsonb;
begin
 if p_capture_id is null or p_delivery_key is null or length(p_delivery_key) not between 1 and 160 or p_payload is null
  or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>1048576 or p_origin_refs is null
  or jsonb_typeof(p_origin_refs)<>'array' or jsonb_array_length(p_origin_refs) not between 1 and 100 then
  raise exception 'capital_capture_delivery_invalid' using errcode='22023'; end if;
 select * into s from private.capital_public_input_snapshots where organization_id=j.organization_id and id=p_capture_id and job_id=j.id;
 if not found or s.human_subject_id<>j.authorization_subject_id then raise exception 'capital_capture_denied' using errcode='42501';end if;
 if j.kind='case_analysis' then
 if not exists(select 1 from private.material_production_recipes r where(r.organization_id,r.id,r.producer_job_id,r.work_id,r.context_fingerprint)=(j.organization_id,s.material_recipe_id,j.id,s.work_id,s.context_fingerprint)) or s.analysis_scope<>'material_production' then raise exception 'material_public_capture_denied' using errcode='42501';end if;
 else
 if s.material_recipe_id is not null or s.work_id::text is distinct from j.payload->>'capital_project_id' or s.plan_id::text is distinct from j.payload->>'capital_project_plan_id' or s.brief_id::text is distinct from j.payload->>'capital_project_brief_id' then raise exception 'capital_capture_denied' using errcode='42501';end if;
 end if;
 current_context:=private.capital_public_capture_context_v1(p_job_id,p_capability_token);
 if s.context_fingerprint is distinct from (case when j.kind='case_analysis' then current_context->>'contextFingerprint' else encode(extensions.digest(current_context::text,'sha256'),'hex') end) then
  raise exception 'capital_capture_context_changed' using errcode='40001';
 end if;
 fp:=encode(extensions.digest(p_payload::text,'sha256'),'hex');
 origin_fp:=encode(extensions.digest(p_origin_refs::text,'sha256'),'hex');
 select * into d from private.capital_public_deliveries where organization_id=j.organization_id and capture_id=s.id and delivery_key=p_delivery_key;
 if found then
  if d.payload_fingerprint is distinct from fp or d.origin_fingerprint is distinct from origin_fp then raise exception 'capital_capture_delivery_conflict' using errcode='23505'; end if;
  select * into l from private.capital_public_delivery_licenses where organization_id=j.organization_id and delivery_id=d.id;
  if found then
   select * into strict l from private.capital_public_delivery_licenses where organization_id=j.organization_id and delivery_id=d.id;
   select jsonb_agg(jsonb_build_object('sourceVersionId',source_version_id,'rightsVersionId',rights_version_id,'sourceBindingId',source_binding_id,'role',pin_role)
    order by source_version_id,rights_version_id,pin_role) into pins from private.capital_public_delivery_license_pins where organization_id=j.organization_id and license_id=l.id;
   select public_source_url into strict license_url from private.source_rights_versions where organization_id=l.licensing_organization_id and source_version_id=l.source_version_id and id=l.rights_version_id;
   proof:=private.capital_public_license_proof_v1(l.licensing_organization_id,l.source_version_id,l.rights_version_id,l.source_binding_id,license_url,l.public_payload_fingerprint,d.delivered_at,pins,l.dependency_fingerprint);
   if proof is null then raise exception 'capital_capture_license_denied' using errcode='42501'; end if;
  end if;
  if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
  return jsonb_build_object('deliveryId',d.id,'payloadFingerprint',d.payload_fingerprint,'state',d.state,'replayed',true,'unresolvedReasons',to_jsonb(d.unresolved_reasons));
 end if;
 if j.kind='case_analysis' and exists(select 1 from private.material_production_research_seals where(organization_id,recipe_id)=(j.organization_id,s.material_recipe_id)) then raise exception 'material_production_research_closed' using errcode='42501';end if;
 -- This slice resolves one exact public source. Compound/workspace adapters are retained
 -- as unresolved; no absent evidence list can manufacture completeness.
 for origin in select value from jsonb_array_elements(p_origin_refs) loop
  if jsonb_typeof(origin) is distinct from 'object' or origin->>'kind' is null or origin->>'kind' not in ('published_public_payload','governed_workspace_source','authorized_workspace_snapshot') then
   raise exception 'capital_capture_origin_invalid' using errcode='22023'; end if;
 end loop;
 origin:=p_origin_refs->0;
 if jsonb_array_length(p_origin_refs)<>1 or origin->>'kind'<>'published_public_payload' then reason:='origin_adapter_not_resolved';
 else
  if not private.capital_public_payload_valid_v1(p_payload) or exists(select 1 from jsonb_object_keys(origin) k
   where k not in ('kind','licensingOrganizationId','sourceVersionId','rightsVersionId','sourceBindingId')) then raise exception 'capital_capture_public_payload_invalid' using errcode='22023'; end if;
  explicit_pin:=origin?'licensingOrganizationId' or origin?'sourceVersionId' or origin?'rightsVersionId' or origin?'sourceBindingId';
  if explicit_pin and (not(origin?'licensingOrganizationId') or not(origin?'sourceVersionId') or not(origin?'rightsVersionId') or not(origin?'sourceBindingId')
   or origin->>'licensingOrganizationId' is null or origin->>'sourceVersionId' is null or origin->>'rightsVersionId' is null or origin->>'sourceBindingId' is null) then
   raise exception 'capital_capture_origin_invalid' using errcode='22023'; end if;
  public_fp:=private.public_source_payload_sha256_v1(p_payload);
  if explicit_pin then
   license_org:=(origin->>'licensingOrganizationId')::uuid; license_version:=(origin->>'sourceVersionId')::uuid;
   license_right:=(origin->>'rightsVersionId')::uuid; license_binding:=(origin->>'sourceBindingId')::uuid;
   -- A requested pin must be the actual latest root at delivery, not a stale permissive right.
   if not exists(select 1 from private.source_rights_versions r where r.organization_id=license_org and r.source_version_id=license_version and r.id=license_right
    and r.audience='public_raw_reuse' and r.public_source_url=p_payload->>'url' and r.public_payload_sha256=public_fp
    and not exists(select 1 from private.source_rights_versions newer where newer.organization_id=r.organization_id and newer.source_version_id=r.source_version_id and newer.revision>r.revision)) then
    raise exception 'capital_capture_license_denied' using errcode='42501'; end if;
   proof:=private.capital_public_license_proof_v1(license_org,license_version,license_right,license_binding,p_payload->>'url',public_fp,delivered_at);
   if proof is null then raise exception 'capital_capture_license_denied' using errcode='42501'; end if;
  else
   reason:='public_license_missing';
   -- Stable order and try-locks; do not call the blocking boolean cache helper.
   for candidate in select r.organization_id,r.source_version_id,r.id as rights_id,b.id as binding_id
    from private.source_rights_versions r join public.organizations o on o.id=r.organization_id and o.organization_type='offroad'
    join public.source_bindings b on b.organization_id=r.organization_id and b.source_version_id=r.source_version_id and b.revoked_at is null
    where r.audience='public_raw_reuse' and r.public_source_url=p_payload->>'url' and r.public_payload_sha256=public_fp
     and not exists(select 1 from private.source_rights_versions newer where newer.organization_id=r.organization_id and newer.source_version_id=r.source_version_id and newer.revision>r.revision)
    order by r.organization_id,r.source_version_id,b.id loop
    proof:=private.capital_public_license_proof_v1(candidate.organization_id,candidate.source_version_id,candidate.rights_id,candidate.binding_id,p_payload->>'url',public_fp,delivered_at);
    if proof is not null then
     license_org:=candidate.organization_id; license_version:=candidate.source_version_id; license_right:=candidate.rights_id; license_binding:=candidate.binding_id; exit;
    end if;
    reason:='public_source_closure_unresolved';
   end loop;
  end if;
  if proof is not null then reason:='retention_storage_not_resolved'; end if;
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
 insert into private.capital_public_deliveries(organization_id,capture_id,delivery_key,payload_fingerprint,origin_fingerprint,origin_kind,state,unresolved_reasons,delivered_at)
 values(j.organization_id,s.id,p_delivery_key,fp,origin_fp,case when jsonb_array_length(p_origin_refs)=1 then origin->>'kind' else 'compound' end,state,array[reason],delivered_at) returning * into d;
 if proof is not null then
  insert into private.capital_public_delivery_licenses(organization_id,delivery_id,licensing_organization_id,source_version_id,rights_version_id,source_binding_id,public_payload_fingerprint,dependency_fingerprint)
  values(j.organization_id,d.id,license_org,license_version,license_right,license_binding,public_fp,proof->>'dependencyFingerprint') returning * into l;
  for item in select value from jsonb_array_elements(proof->'pins') loop
   insert into private.capital_public_delivery_license_pins(organization_id,license_id,licensing_organization_id,source_version_id,rights_version_id,source_binding_id,pin_role)
   values(j.organization_id,l.id,license_org,(item->>'sourceVersionId')::uuid,(item->>'rightsVersionId')::uuid,(item->>'sourceBindingId')::uuid,item->>'role');
  end loop;
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501'; end if;
 return jsonb_build_object('deliveryId',d.id,'payloadFingerprint',d.payload_fingerprint,'state',d.state,'replayed',false,'unresolvedReasons',to_jsonb(d.unresolved_reasons));
end; $$;
