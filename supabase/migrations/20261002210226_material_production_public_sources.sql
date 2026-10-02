-- 3S real case-analysis public deliveries. The existing publisher proof is
-- reused without creating a different job, fictitious plan or worker licence.
set search_path='';
alter table private.capital_public_input_snapshots add column material_recipe_id uuid,
 add constraint material_public_snapshot_recipe_fk foreign key(organization_id,material_recipe_id) references private.material_production_recipes(organization_id,id);
alter table private.capital_public_input_snapshots alter column plan_id drop not null,alter column brief_id drop not null;
alter table private.capital_public_input_snapshots add constraint material_public_snapshot_discriminant check(
 (material_recipe_id is null and plan_id is not null and brief_id is not null and analysis_scope<>'material_production') or
 (material_recipe_id is not null and plan_id is null and brief_id is null and analysis_scope='material_production'));
create index material_public_snapshot_recipe_fk_idx on private.capital_public_input_snapshots(organization_id,material_recipe_id);
create table private.material_production_research_seals(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,recipe_id uuid not null,research_status text not null check(research_status in('succeeded','partial','abstained')),source_fingerprint text not null check(source_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(organization_id,id),unique(organization_id,recipe_id),foreign key(organization_id,recipe_id) references private.material_production_recipes(organization_id,id)
);
create table private.material_production_public_source_pins(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,recipe_id uuid not null,delivery_id uuid not null,license_id uuid not null,retained_payload_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(organization_id,id),unique(organization_id,recipe_id,delivery_id),
 foreign key(organization_id,recipe_id) references private.material_production_recipes(organization_id,id),foreign key(organization_id,delivery_id) references private.capital_public_deliveries(organization_id,id),foreign key(organization_id,license_id) references private.capital_public_delivery_licenses(organization_id,id),foreign key(organization_id,retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index material_public_source_license_fk on private.material_production_public_source_pins(organization_id,license_id);
create index material_public_source_retained_fk on private.material_production_public_source_pins(organization_id,retained_payload_id);
do $$declare n text;begin
 foreach n in array array['material_production_research_seals','material_production_public_source_pins'] loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 execute format('create policy %I on private.%I as restrictive for select to anon,authenticated using(false)',n||'_no_select',n);execute format('create policy %I on private.%I as restrictive for insert to anon,authenticated with check(false)',n||'_no_insert',n);execute format('create policy %I on private.%I as restrictive for update to anon,authenticated using(false) with check(false)',n||'_no_update',n);execute format('create policy %I on private.%I as restrictive for delete to anon,authenticated using(false)',n||'_no_delete',n);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',n||'_immutable',n);execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',n||'_no_truncate',n);execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',n||'_updated_at',n);execute format('create trigger %I after insert on private.%I for each row execute function private.capture_identity_audit_v1()',n||'_audit',n);
 end loop;
end$$;
alter function private.capital_public_capture_job_v1(uuid,text) rename to capital_public_capture_job_pre_material_v1;
create function private.capital_public_capture_job_v1(p_job_id uuid,p_capability_token text)
returns public.processing_jobs language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;r private.material_production_recipes;
begin
 select * into j from public.processing_jobs where id=p_job_id;
 if j.kind is distinct from 'case_analysis' then return private.capital_public_capture_job_pre_material_v1(p_job_id,p_capability_token);end if;
 j:=private.material_production_job_v1(p_job_id,p_capability_token);
 select * into r from private.material_production_recipes where(organization_id,producer_job_id)=(j.organization_id,j.id);
 if r.id is null or not exists(select 1 from private.material_production_seals where(organization_id,recipe_id)=(j.organization_id,r.id)) or not private.material_production_sources_current_v1(j.organization_id,r.id,j.authorization_subject_id) then raise exception 'material_public_capture_denied' using errcode='42501';end if;
 return j;
end$$;
alter function private.capital_public_capture_clock_current_v1(uuid,text) rename to capital_public_capture_clock_pre_material_v1;
create function private.capital_public_capture_clock_current_v1(p_job_id uuid,p_capability_token text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;
begin
 select * into j from public.processing_jobs where id=p_job_id;
 if j.kind is distinct from 'case_analysis' then return private.capital_public_capture_clock_pre_material_v1(p_job_id,p_capability_token);end if;
 return private.material_production_clock_current_v1(p_job_id,p_capability_token) and exists(select 1 from private.material_production_recipes r where(r.organization_id,r.producer_job_id)=(j.organization_id,j.id) and private.material_production_sources_current_v1(j.organization_id,r.id,j.authorization_subject_id));
end$$;
alter function private.capital_public_capture_context_v1(uuid,text) rename to capital_public_capture_context_pre_material_v1;
create function private.capital_public_capture_context_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;r private.material_production_recipes;
begin
 j:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 if j.kind<>'case_analysis' then return private.capital_public_capture_context_pre_material_v1(p_job_id,p_capability_token);end if;
 select * into strict r from private.material_production_recipes where(organization_id,producer_job_id)=(j.organization_id,j.id);
 return jsonb_build_object('schemaVersion','material-public-capture-context.v1','recipeId',r.id,'workId',r.work_id,'contextFingerprint',r.context_fingerprint,'inputFingerprint',r.input_fingerprint);
end$$;
alter function private.worker_load_capital_project_capture_context_v1(uuid,text) rename to worker_load_capital_project_capture_context_pre_material_v1;
create function private.worker_load_capital_project_capture_context_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;r private.material_production_recipes;s private.capital_public_input_snapshots;
begin
 j:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 if j.kind<>'case_analysis' then return private.worker_load_capital_project_capture_context_pre_material_v1(p_job_id,p_capability_token);end if;
 select * into strict r from private.material_production_recipes where(organization_id,producer_job_id)=(j.organization_id,j.id);
 select * into s from private.capital_public_input_snapshots where(organization_id,job_id)=(j.organization_id,j.id);
 if s.id is null then
 insert into private.capital_public_input_snapshots(organization_id,work_id,job_id,session_id,plan_id,brief_id,human_subject_id,analysis_scope,context_fingerprint,material_recipe_id) values(j.organization_id,r.work_id,j.id,r.session_id,null,null,j.authorization_subject_id,'material_production',r.context_fingerprint,r.id) returning * into s;
 end if;
 if(s.material_recipe_id,s.context_fingerprint,s.work_id,s.human_subject_id) is distinct from(r.id,r.context_fingerprint,r.work_id,j.authorization_subject_id) then raise exception 'material_public_capture_denied' using errcode='42501';end if;
 return jsonb_build_object('context',null,'capture',jsonb_build_object('id',s.id,'fingerprint',s.context_fingerprint,'state','unresolved','schemaVersion','capital-public-capture.v1'));
end$$;
create or replace function private.worker_capture_capital_project_delivery_v1(p_job_id uuid,p_capability_token text,p_capture_id uuid,p_delivery_key text,p_payload jsonb,p_origin_refs jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 s private.capital_public_input_snapshots; d private.capital_public_deliveries; l private.capital_public_delivery_licenses;
 fp text; origin_fp text; public_fp text; delivered_at timestamptz:=clock_timestamp(); origin jsonb; proof jsonb; pins jsonb;
 candidate record; reason text; state text:='unresolved'; license_org uuid; license_version uuid; license_right uuid; license_binding uuid;
 explicit_pin boolean; item jsonb; license_url text;
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
 perform private.capital_public_capture_context_v1(p_job_id,p_capability_token);
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
create function private.material_production_public_deadline_v1(p_org uuid,p_recipe uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare r private.material_production_recipes;pin private.material_production_public_source_pins;l private.capital_public_delivery_licenses;a private.capital_public_payload_allocations;d timestamptz;current_deadline timestamptz;
begin
 select * into r from private.material_production_recipes where(organization_id,id)=(p_org,p_recipe);
 if r.id is null then return null;end if;d:=r.expires_at;
 for pin in select * from private.material_production_public_source_pins where(organization_id,recipe_id)=(p_org,r.id) order by delivery_id loop
 select * into l from private.capital_public_delivery_licenses where(organization_id,id,delivery_id)=(p_org,pin.license_id,pin.delivery_id);
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on(x.organization_id,x.id)=(q.organization_id,q.allocation_id) where(q.organization_id,q.id)=(p_org,pin.retained_payload_id);
 if l.id is null or a.id is null or a.delivery_id is distinct from pin.delivery_id or a.license_id is distinct from l.id or a.content_kind<>'public_source' or not private.capital_body_physical_receipt_v1(p_org,pin.retained_payload_id) then return null;end if;
 current_deadline:=private.capital_public_retention_deadline_v1(l.id,p_org,a.retained_at,a.policy_id);
 if current_deadline is null or least(current_deadline,a.expires_at,a.purge_at)<=clock_timestamp() then return null;end if;
 perform private.require_capital_body_retention_ready_v1(a.policy_id,p_org,a.id);
 d:=least(d,current_deadline,a.expires_at,a.purge_at);
 end loop;
 if d<=clock_timestamp() then return null;end if;
 return d;
end$$;
create function private.worker_seal_material_production_sources_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_delivery_ids uuid[],p_research_status text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.material_production_job_v1(p_job_id,p_capability_token);r private.material_production_recipes;s private.material_production_research_seals;delivery uuid;l private.capital_public_delivery_licenses;a private.capital_public_payload_allocations;q private.capital_public_retained_payloads;closure jsonb:='[]'::jsonb;fp text;fixed_ids uuid[];
begin
 if p_delivery_ids is null or cardinality(p_delivery_ids)>1000 or cardinality(p_delivery_ids)<>(select count(distinct x) from unnest(p_delivery_ids) x) or p_research_status not in('succeeded','partial','abstained') or(p_research_status='abstained')<>(cardinality(p_delivery_ids)=0) then raise exception 'material_production_sources_invalid' using errcode='22023';end if;
 select * into r from private.material_production_recipes where(organization_id,id,producer_job_id)=(j.organization_id,p_recipe_id,j.id);
 if r.id is null or not exists(select 1 from private.material_production_seals where(organization_id,recipe_id)=(j.organization_id,r.id)) or not private.material_production_sources_current_v1(j.organization_id,r.id,j.authorization_subject_id) then raise exception 'material_production_sources_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('material-production:'||j.organization_id::text||':'||r.id::text,0)) then raise exception 'material_production_retry' using errcode='40001';end if;
 select array_agg(x order by x) into fixed_ids from unnest(p_delivery_ids) x;fixed_ids:=coalesce(fixed_ids,'{}'::uuid[]);
 foreach delivery in array fixed_ids loop
 select lic.* into l from private.capital_public_delivery_licenses lic join private.capital_public_deliveries d on(d.organization_id,d.id)=(lic.organization_id,lic.delivery_id) join private.capital_public_input_snapshots snap on(snap.organization_id,snap.id)=(d.organization_id,d.capture_id) where(lic.organization_id,lic.delivery_id,snap.job_id,snap.material_recipe_id)=(j.organization_id,delivery,j.id,r.id);
 select x.* into a from private.capital_public_payload_allocations x where(x.organization_id,x.delivery_id,x.license_id,x.job_id,x.content_kind)=(j.organization_id,delivery,l.id,j.id,'public_source');
 select * into q from private.capital_public_retained_payloads where(organization_id,allocation_id)=(j.organization_id,a.id);
 if l.id is null or q.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,q.id) or private.capital_public_retention_deadline_v1(l.id,j.organization_id,a.retained_at,a.policy_id) is null then raise exception 'material_production_public_license_required' using errcode='42501';end if;
 closure:=closure||jsonb_build_array(jsonb_build_array(delivery,l.id,q.id,a.payload_fingerprint,a.byte_length));
 end loop;
 fp:=encode(extensions.digest(jsonb_build_array('material-production-public-sources.v1',r.id,p_research_status,closure)::text,'sha256'),'hex');
 select * into s from private.material_production_research_seals where(organization_id,recipe_id)=(j.organization_id,r.id);
 if s.id is not null then
 if(s.research_status,s.source_fingerprint) is distinct from(p_research_status,fp) then raise exception 'material_production_sources_conflict' using errcode='23505';end if;
 else
 for l in select lic.* from private.capital_public_delivery_licenses lic where lic.organization_id=j.organization_id and lic.delivery_id=any(fixed_ids) order by lic.delivery_id loop
 select retained.* into strict q from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.id)=(retained.organization_id,retained.allocation_id) where(allocation.organization_id,allocation.delivery_id,allocation.job_id)=(j.organization_id,l.delivery_id,j.id);
 insert into private.material_production_public_source_pins(organization_id,recipe_id,delivery_id,license_id,retained_payload_id) values(j.organization_id,r.id,l.delivery_id,l.id,q.id);
 end loop;
 insert into private.material_production_research_seals(organization_id,recipe_id,research_status,source_fingerprint) values(j.organization_id,r.id,p_research_status,fp) returning * into s;
 end if;
 if private.material_production_public_deadline_v1(j.organization_id,r.id) is null or not private.material_production_clock_current_v1(j.id,p_capability_token) then raise exception 'material_production_sources_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-material-source-seal.v1','recipeId',r.id,'sourceFingerprint',fp,'deliveryIds',to_jsonb(fixed_ids),'researchStatus',p_research_status);
end$$;
create function public.worker_seal_material_production_sources_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_delivery_ids uuid[],p_research_status text) returns jsonb language sql security invoker set search_path='' as $$select private.worker_seal_material_production_sources_v1(p_job_id,p_capability_token,p_recipe_id,p_delivery_ids,p_research_status);$$;
revoke all on function private.capital_public_capture_job_pre_material_v1(uuid,text),private.capital_public_capture_clock_pre_material_v1(uuid,text),private.capital_public_capture_context_pre_material_v1(uuid,text),private.worker_load_capital_project_capture_context_pre_material_v1(uuid,text),private.capital_public_capture_job_v1(uuid,text),private.capital_public_capture_clock_current_v1(uuid,text),private.capital_public_capture_context_v1(uuid,text),private.material_production_public_deadline_v1(uuid,uuid),private.worker_seal_material_production_sources_v1(uuid,text,uuid,uuid[],text),public.worker_seal_material_production_sources_v1(uuid,text,uuid,uuid[],text) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_capital_project_capture_context_v1(uuid,text),private.worker_seal_material_production_sources_v1(uuid,text,uuid,uuid[],text),public.worker_seal_material_production_sources_v1(uuid,text,uuid,uuid[],text) to authenticated;
-- Native material inference cannot slip through a public_research label. Its
-- private context keeps the restricted floor and exact finite source deadline.
alter function private.worker_authorize_provider_processing_v1(uuid,text,jsonb,text[],text) rename to worker_authorize_provider_processing_pre_material_v1;
create function private.worker_authorize_provider_processing_v1(p_job_id uuid,p_capability_token text,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;r private.material_production_recipes;deadline timestamptz;retention_limit integer;resource text;assurance uuid;ids uuid[]:='{}';reasons text[]:='{}';decision uuid;
begin
 select * into r from private.material_production_recipes where producer_job_id=p_job_id;
 if r.id is null then
 if exists(select 1 from private.material_production_plan_approvals where effect_job_id=p_job_id) then raise exception 'material_processing_context_capture_required' using errcode='42501';end if;
 return private.worker_authorize_provider_processing_pre_material_v1(p_job_id,p_capability_token,p_route,p_resources,p_purpose);end if;
 j:=private.material_production_job_v1(p_job_id,p_capability_token);
 if p_route is null or jsonb_typeof(p_route)<>'object' or p_route-array['provider','model','accountRef','projectRef','credentialBinding','endpoint','region']<>'{}'::jsonb or not(p_route?&array['provider','model','accountRef','projectRef','credentialBinding','endpoint','region']) or octet_length(p_route::text)>2000 or p_resources is null or cardinality(p_resources) not between 1 and 4 then raise exception 'material_processing_route_invalid' using errcode='22023';end if;
 if exists(select 1 from private.material_production_terminals where(organization_id,recipe_id)=(j.organization_id,r.id)) then raise exception 'material_production_terminal_closed' using errcode='42501';end if;
 if p_purpose='public_research' then
 if not('external_search'=any(p_resources)) or not(p_resources<@array['external_search','inference','prompt_cache','schema_cache']) or exists(select 1 from private.material_production_research_seals where(organization_id,recipe_id)=(j.organization_id,r.id)) then raise exception 'material_processing_research_phase_denied' using errcode='42501';end if;
 else
 if p_purpose not in('case_analysis','artifact_generation','localization','evaluation') or not(p_resources<@array['inference','prompt_cache','schema_cache']) or not exists(select 1 from private.material_production_research_seals where(organization_id,recipe_id)=(j.organization_id,r.id)) then raise exception 'material_processing_source_seal_required' using errcode='42501';end if;
 end if;
 deadline:=private.material_production_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if deadline is null then raise exception 'material_processing_source_denied' using errcode='42501';end if;
 retention_limit:=greatest(0,least(2592000,floor(extract(epoch from deadline-clock_timestamp()))::integer));
 perform pg_advisory_xact_lock_shared(hashtextextended('provider-processing-assurances',0));
 foreach resource in array p_resources loop
 assurance:=private.provider_resource_allowed_v1(p_route,resource,p_purpose,'restricted',retention_limit);
 if assurance is null then reasons:=array_append(reasons,'processing_resource_ineligible:'||resource);else ids:=array_append(ids,assurance);end if;
 end loop;
 insert into private.processing_eligibility_decisions(organization_id,job_id,route,resources,purpose,classification,allowed,assurance_ids,reasons,policy_version) values(j.organization_id,j.id,p_route,p_resources,p_purpose,'restricted',cardinality(reasons)=0,ids,reasons,'offroad-provider-retention-v2') returning id into decision;
 if not private.material_production_clock_current_v1(j.id,p_capability_token) or private.material_production_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null then raise exception 'material_processing_source_denied' using errcode='42501';end if;
 return jsonb_build_object('allowed',cardinality(reasons)=0,'policyVersion','offroad-provider-retention-v2','assuranceId',case when cardinality(ids)=1 then ids[1] else null end,'assuranceIds',ids,'decisionId',decision,'classification','restricted','reasons',to_jsonb(reasons));
end$$;
revoke all on function private.worker_authorize_provider_processing_pre_material_v1(uuid,text,jsonb,text[],text),private.worker_authorize_provider_processing_v1(uuid,text,jsonb,text[],text) from public,anon,authenticated,service_role;
grant execute on function private.worker_authorize_provider_processing_v1(uuid,text,jsonb,text[],text) to authenticated;
