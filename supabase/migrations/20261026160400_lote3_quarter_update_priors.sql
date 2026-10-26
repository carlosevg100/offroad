-- The quarter close (ficha C54, update-after-quarter-close) executes on one basis, the close. The prior
-- weekly cash and the prior covenant test are completed executions of the same work: the server copies
-- their stored inputs into the standard quarter-update-packet-input.v1 snapshot, the request names them
-- by execution and packet fingerprint, and this migration checks every reference against the stored rows,
-- refuses each failure by name, pins the execution ids it accepted and keeps the priors' sources in the
-- contract, so the closure and the read gate stay as they are. Every other method's path is unchanged.
set local lock_timeout='5s';

-- 1. The prior results an execution was issued over, by execution id: written with the request, never changed.
create table private.execution_prior_results (
 organization_id uuid not null,
 execution_id uuid not null,
 role text not null,
 prior_execution_id uuid not null,
 prior_method_id text not null,
 prior_method_version text not null,
 prior_input_fingerprint text not null,
 prior_result_fingerprint text not null,
 created_at timestamptz not null default now(),
 constraint execution_prior_results_pkey primary key(organization_id,execution_id,role),
 -- Deferred: the v3 producer records the priors before the execution row exists, so the provenance walk can require them.
 constraint execution_prior_results_execution_fkey foreign key(organization_id,execution_id) references public.work_executions(organization_id,id) deferrable initially deferred,
 constraint execution_prior_results_prior_fkey foreign key(organization_id,prior_execution_id) references public.work_executions(organization_id,id),
 constraint execution_prior_results_role_check check(role in ('weekly_cash','covenant')),
 constraint execution_prior_results_method_check check((role='weekly_cash' and prior_method_id='project-weekly-cash') or (role='covenant' and prior_method_id='measure-covenant-headroom')),
 constraint execution_prior_results_fingerprint_check check(prior_input_fingerprint ~ '^[a-f0-9]{64}$' and prior_result_fingerprint ~ '^[a-f0-9]{64}$'),
 constraint execution_prior_results_distinct_check check(prior_execution_id<>execution_id)
);
create index execution_prior_results_prior_idx on private.execution_prior_results(organization_id,prior_execution_id);
alter table private.execution_prior_results enable row level security;
alter table private.execution_prior_results force row level security;
create policy execution_prior_results_deny on private.execution_prior_results as restrictive for all to public using(false) with check(false);
revoke all on private.execution_prior_results from public,anon,authenticated,service_role;
create trigger execution_prior_results_immutable before update or delete on private.execution_prior_results for each row execute function private.guard_contribution_immutable_v1();
create trigger execution_prior_results_truncate_guard before truncate on private.execution_prior_results for each statement execute function private.guard_platform_ledger_truncate_v1();
comment on table private.execution_prior_results is 'The prior completed executions a quarter close execution was issued over, pinned by id with their input and packet fingerprints. Written by the v3 producer in the same transaction; no client or worker grant.';

-- 2. What each role reads: the method, its released version and its packet schema.
create function private.quarter_update_prior_method_v1(p_role text) returns jsonb
language sql immutable set search_path='' as $$
 select case p_role
  when 'weekly_cash' then jsonb_build_object('methodId','project-weekly-cash','methodVersion','2026.10.23-v1','packet','weekly-cash-packet.v1','path','weeklyCash')
  when 'covenant' then jsonb_build_object('methodId','measure-covenant-headroom','methodVersion','2026.10.23-v1','packet','covenant-headroom-packet.v1','path','covenant') end;
$$;
revoke all on function private.quarter_update_prior_method_v1(text) from public,anon,authenticated,service_role;

-- 3. The verdicts, over row data only. Identity first: an execution of another organization or of another
-- work is reported as not found, so a refusal never tells whether it exists outside this work; an execution
-- without a succeeded result is refused by name.
create function private.quarter_update_prior_identity_v1(p_org uuid,p_work uuid,p_found boolean,p_exec_org uuid,p_exec_work uuid,p_outcome text) returns text
language sql immutable set search_path='' as $$
 select case when not coalesce(p_found,false) or p_exec_org is distinct from p_org then 'quarter_update_prior_not_found'
  when p_exec_work is distinct from p_work then 'quarter_update_prior_not_found'
  when p_outcome is distinct from 'succeeded' then 'quarter_update_prior_not_completed' end;
$$;
revoke all on function private.quarter_update_prior_identity_v1(uuid,uuid,boolean,uuid,uuid,text) from public,anon,authenticated,service_role;

-- Content: the method and version the role expects, the packet fingerprint the request names, the stored
-- input equal to the one the snapshot carries, and every source the prior pinned (same version, bytes and resource)
-- pinned again by this contract, under the rights revision this contract pins.
create function private.quarter_update_prior_content_v1(p_role text,p_ref jsonb,p_embedded jsonb,p_contract_sources jsonb,p_prior_contract jsonb,p_prior_snapshot jsonb,p_result jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare expected jsonb:=private.quarter_update_prior_method_v1(p_role);
begin
 if expected is null then return 'quarter_update_priors_invalid';end if;
 if p_prior_contract#>>'{method,methodId}' is distinct from expected->>'methodId' or p_prior_contract#>>'{method,methodVersion}' is distinct from expected->>'methodVersion'
  or p_result->>'schemaVersion' is distinct from expected->>'packet' then return 'quarter_update_prior_method_mismatch';end if;
 if p_result->>'fingerprint' is distinct from p_ref->>'resultFingerprint' then return 'quarter_update_prior_fingerprint_mismatch';end if;
 if p_embedded is null or p_prior_snapshot->'analysis' is null or p_prior_snapshot->'analysis' is distinct from p_embedded then return 'quarter_update_prior_input_mismatch';end if;
 if jsonb_typeof(coalesce(p_prior_contract#>'{inputs,sources}','[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_contract_sources,'[]'::jsonb))<>'array'
  or exists(select 1 from jsonb_array_elements(coalesce(p_prior_contract#>'{inputs,sources}','[]'::jsonb)) x(v)
   where not exists(select 1 from jsonb_array_elements(coalesce(p_contract_sources,'[]'::jsonb)) y(v) where y.v->>'sourceVersionId'=x.v->>'sourceVersionId'
    and y.v->>'contentHash'=x.v->>'contentHash' and y.v->>'resourceId'=x.v->>'resourceId')) then return 'quarter_update_prior_source_unpinned';end if;
 return null;
end $$;
revoke all on function private.quarter_update_prior_content_v1(text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

-- 4. One reference resolved against the stored rows, raising the named refusal. Between identity and
-- content, the prior's own closure must still be readable and derivable by the requester: a prior whose
-- source rights were revoked fails here through the normal rights machinery.
create function private.quarter_update_prior_resolve_v1(p_org uuid,p_work uuid,p_role text,p_ref jsonb,p_embedded jsonb,p_contract_sources jsonb,p_subject uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare e public.work_executions;m private.execution_manifests;s private.execution_input_snapshots;r private.execution_result_receipts;code text;closure jsonb;
begin
 if jsonb_typeof(p_ref) is distinct from 'object' or p_ref - array['role','executionId','resultFingerprint']<>'{}'::jsonb
  or p_ref->>'role' is distinct from p_role or coalesce(p_ref->>'executionId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or coalesce(p_ref->>'resultFingerprint','') !~ '^[a-f0-9]{64}$' then raise exception 'quarter_update_priors_invalid' using errcode='22023';end if;
 select * into e from public.work_executions where id=(p_ref->>'executionId')::uuid;
 if e.id is not null and e.organization_id=p_org then
  select * into m from private.execution_manifests where organization_id=p_org and execution_id=e.id;
  select * into s from private.execution_input_snapshots where organization_id=p_org and execution_id=e.id;
  select * into r from private.execution_result_receipts where organization_id=p_org and execution_id=e.id;
 end if;
 code:=private.quarter_update_prior_identity_v1(p_org,p_work,e.id is not null,e.organization_id,e.work_id,case when m.id is null or s.id is null then null else r.outcome end);
 if code is not null then raise exception '%',code using errcode='42501';end if;
 closure:=private.execution_result_source_closure_v1(p_org,e.id);
 if closure is null or not private.execution_closure_read_allowed_v1(p_org,closure,p_subject,'derive') then raise exception 'quarter_update_prior_rights_denied' using errcode='42501';end if;
 code:=private.quarter_update_prior_content_v1(p_role,p_ref,p_embedded,p_contract_sources,m.payload,s.payload,r.result);
 if code is not null then raise exception '%',code using errcode='42501';end if;
 return jsonb_build_object('role',p_role,'executionId',e.id,'methodId',m.payload#>>'{method,methodId}','methodVersion',m.payload#>>'{method,methodVersion}',
  'inputFingerprint',s.payload_fingerprint,'resultFingerprint',r.result->>'fingerprint');
end $$;
revoke all on function private.quarter_update_prior_resolve_v1(uuid,uuid,text,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated,service_role;

-- 5. The payload check of the quarter close: the execution must carry the priors the v3 producer resolved
-- and recorded for it, and each embedded prior must be exactly the stored input of the recorded execution,
-- of the same work, succeeded, with the recorded input and packet fingerprints. A request through v1 or v2
-- has no recorded priors and is refused by the walk. Used inside the walk, where it only answers true or false.
create function private.quarter_update_priors_recorded_v1(p_contract jsonb,p_payload jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare v_role text;expected jsonb;org uuid;work uuid;ex uuid;
begin
 org:=(p_contract->>'organizationId')::uuid;work:=(p_contract->>'workId')::uuid;ex:=(p_contract->>'executionId')::uuid;
 if org is null or work is null or ex is null or jsonb_typeof(p_payload#>'{analysis,prior}') is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_payload#>'{analysis,prior}'))<>2 then return false;end if;
 foreach v_role in array array['weekly_cash','covenant'] loop
  expected:=private.quarter_update_prior_method_v1(v_role);
  if not exists(select 1 from private.execution_prior_results p
   join public.work_executions e on e.organization_id=p.organization_id and e.id=p.prior_execution_id
   join private.execution_manifests m on m.organization_id=e.organization_id and m.execution_id=e.id
   join private.execution_input_snapshots s on s.organization_id=e.organization_id and s.execution_id=e.id
   join private.execution_result_receipts r on r.organization_id=e.organization_id and r.execution_id=e.id
   where p.organization_id=org and p.execution_id=ex and p.role=v_role and e.work_id=work and r.outcome='succeeded'
    and m.payload#>>'{method,methodId}'=expected->>'methodId' and m.payload#>>'{method,methodVersion}'=expected->>'methodVersion'
    and p.prior_method_id=expected->>'methodId' and p.prior_method_version=expected->>'methodVersion'
    and s.payload_fingerprint=p.prior_input_fingerprint and r.result->>'fingerprint'=p.prior_result_fingerprint
    and s.payload->'analysis'=p_payload#>array['analysis','prior',expected->>'path']) then return false;end if;
 end loop;
 return true;
exception when data_exception then return false;
end $$;
revoke all on function private.quarter_update_priors_recorded_v1(jsonb,jsonb) from public,anon,authenticated,service_role;

-- 6. The provenance walk, unchanged for every other method: the quarter close is bound to its version and
-- packet schema, its priors are checked whole by section 5, and the walk reads the close alone. The lines
-- added carry the trailing comment "quarter close"; removing them and the method from the list gives back
-- the 20261023204746 body byte for byte (packages/execution-request/src/quarter-update-validator-regression.test.ts).
create or replace function private.execution_capital_payload_current_v1(c jsonb, payload jsonb, subject uuid)
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
 if c#>>'{method,methodId}' is null then return false;end if;
 if c#>>'{method,methodId}'='update-after-quarter-close' then -- quarter close
  if c#>>'{method,methodVersion}' is distinct from '2026.10.26-v1' or payload->>'schemaVersion' is distinct from 'quarter-update-packet-input.v1' -- quarter close
   or not private.quarter_update_priors_recorded_v1(c,payload) then return false;end if; -- quarter close
  -- The priors are the stored inputs the v3 producer recorded for this execution, checked whole above; the walk reads the close alone. -- quarter close
  payload:=payload #- '{analysis,prior}';pending:=array[payload]; -- quarter close
 end if; -- quarter close
 if c#>>'{method,methodId}' not in ('prepare-capital-structure-decision','analyze-investment-project','compare-financing-proposals','analyze-relative-debt-cost','assess-debt-capacity','build-company-debt-table','measure-covenant-headroom','project-weekly-cash','update-after-quarter-close') then return true;end if;
 -- Each released method is bound to its exact version, manifest and payload schema.
 if (c#>>'{method,methodId}'='prepare-capital-structure-decision' and (c#>>'{method,methodVersion}' is distinct from '2026.09.21-v4'
   or c#>>'{method,manifestHash}' is distinct from '2c023cf7b7ec7e35b7f59d363a9b287cb245d3196cd431fc0c2bf1fc937f8478'
   or payload->>'schemaVersion' is distinct from 'capital-procedure-packet-input.v2'))
 or (c#>>'{method,methodId}'='analyze-investment-project' and (c#>>'{method,methodVersion}' is distinct from '2026.10.09-v2'
   or c#>>'{method,manifestHash}' is distinct from 'aff463906b33b63104790fe9beb18521511dffbbf4cb63344c015e79496cf9d2'
   or payload->>'schemaVersion' is distinct from 'investment-decision-packet-input.v1'))
 or (c#>>'{method,methodId}'='compare-financing-proposals' and (c#>>'{method,methodVersion}' is distinct from '2026.10.19-v2'
   or c#>>'{method,manifestHash}' is distinct from '99845f7641e498c7fb0aa6f439b0376076d849c523a5a15af8935a113be43726'
   or payload->>'schemaVersion' is distinct from 'financing-comparison-packet-input.v1'))
 or (c#>>'{method,methodId}'='analyze-relative-debt-cost' and (c#>>'{method,methodVersion}' is distinct from '2026.10.19-v2'
   or c#>>'{method,manifestHash}' is distinct from '8ec65ef01d6640001ff7e5049f82d9d0add523cf4013085c05081e0550f57796'
   or payload->>'schemaVersion' is distinct from 'relative-debt-cost-packet-input.v1'))
 or (c#>>'{method,methodId}'='assess-debt-capacity' and (c#>>'{method,methodVersion}' is distinct from '2026.10.19-v2'
   or c#>>'{method,manifestHash}' is distinct from '13574b282016b8122f07ab4164fa4c68e5af4b3eb26078189e9e72fe668484c5'
   or payload->>'schemaVersion' is distinct from 'debt-capacity-packet-input.v1'))
 or (c#>>'{method,methodId}'='build-company-debt-table' and (c#>>'{method,methodVersion}' is distinct from '2026.10.23-v1'
   or c#>>'{method,manifestHash}' is distinct from '3602b80383f4497d73ba67b1f567ab99f088a1b9929d9112874b01a30ea67379'
   or payload->>'schemaVersion' is distinct from 'debt-table-packet-input.v1'))
 or (c#>>'{method,methodId}'='measure-covenant-headroom' and (c#>>'{method,methodVersion}' is distinct from '2026.10.23-v1'
   or c#>>'{method,manifestHash}' is distinct from '729794a4dd27c16f15abae1986b414c966f369f49e3b27b3e24197fe9b68bc67'
   or payload->>'schemaVersion' is distinct from 'covenant-headroom-packet-input.v1'))
 or (c#>>'{method,methodId}'='project-weekly-cash' and (c#>>'{method,methodVersion}' is distinct from '2026.10.23-v1'
   or c#>>'{method,manifestHash}' is distinct from 'b7e135f7e60457bfd79f19817a064f1d69bf7301c1f7efcefed736e771362fb1'
   or payload->>'schemaVersion' is distinct from 'weekly-cash-packet-input.v1'))
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

-- 7. The v3 producer, for the quarter close only: the caller's access to the work first, then every prior
-- reference resolved and refused by name, then the prior execution ids recorded for the contract's execution,
-- then the v2 producer unchanged, whose provenance walk requires those records. A replay names the same
-- execution only with the same priors.
create function private.request_work_execution_producer_v3(p_contract_text text,p_snapshot_text text,p_gates_text text,p_prior_results jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c jsonb;s jsonb;org uuid;work uuid;resolved jsonb:='[]';ref jsonb;v_role text;expected jsonb;r jsonb;ex uuid;item jsonb;
begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 if p_contract_text is null or octet_length(p_contract_text)>1048576 or p_snapshot_text is null or octet_length(p_snapshot_text)>8388608
 then raise exception 'execution_contract_denied' using errcode='42501';end if;
 begin
  c:=private.execution_json_projection_v1(p_contract_text);
  s:=private.execution_json_projection_v1(p_snapshot_text);
  work:=(c->>'workId')::uuid;
 exception when data_exception then raise exception 'execution_contract_denied' using errcode='42501';
 end;
 if c#>>'{method,methodId}' is distinct from 'update-after-quarter-close' then raise exception 'quarter_update_priors_method_denied' using errcode='42501';end if;
 select organization_id into org from public.capital_projects where id=work;
 if org is null or c->>'organizationId' is distinct from org::text then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform private.execution_read_access_v1(org,work);
 if jsonb_typeof(p_prior_results) is distinct from 'array' or jsonb_array_length(p_prior_results)<>2 then raise exception 'quarter_update_priors_invalid' using errcode='22023';end if;
 foreach v_role in array array['weekly_cash','covenant'] loop
  expected:=private.quarter_update_prior_method_v1(v_role);
  select x.v into ref from jsonb_array_elements(p_prior_results) x(v) where x.v->>'role'=v_role;
  if ref is null or (select count(*) from jsonb_array_elements(p_prior_results) x(v) where x.v->>'role'=v_role)<>1 then raise exception 'quarter_update_priors_invalid' using errcode='22023';end if;
  resolved:=resolved||jsonb_build_array(private.quarter_update_prior_resolve_v1(org,work,v_role,ref,s#>array['analysis','prior',expected->>'path'],c#>'{inputs,sources}',auth.uid()));
  ref:=null;
 end loop;
 ex:=(c->>'executionId')::uuid;
 if ex is null then raise exception 'execution_contract_denied' using errcode='42501';end if;
 -- Recorded before the execution exists (the key is deferred), so the provenance walk inside the v2 producer
 -- finds them; a replay of the same contract finds its own rows, and any other priors under it conflict.
 for item in select value from jsonb_array_elements(resolved) loop
  insert into private.execution_prior_results(organization_id,execution_id,role,prior_execution_id,prior_method_id,prior_method_version,prior_input_fingerprint,prior_result_fingerprint)
  values(org,ex,item->>'role',(item->>'executionId')::uuid,item->>'methodId',item->>'methodVersion',item->>'inputFingerprint',item->>'resultFingerprint')
  on conflict on constraint execution_prior_results_pkey do nothing;
 end loop;
 if (select count(*) from private.execution_prior_results p join jsonb_array_elements(resolved) x(v) on x.v->>'role'=p.role
   where p.organization_id=org and p.execution_id=ex and p.prior_execution_id=(x.v->>'executionId')::uuid
    and p.prior_input_fingerprint=x.v->>'inputFingerprint' and p.prior_result_fingerprint=x.v->>'resultFingerprint')<>2
  or (select count(*) from private.execution_prior_results p where p.organization_id=org and p.execution_id=ex)<>2
 then raise exception 'execution_request_conflict' using errcode='23505',detail=ex::text;end if;
 r:=private.request_work_execution_producer_v2(p_contract_text,p_snapshot_text,p_gates_text);
 if r->>'executionId' is distinct from ex::text then raise exception 'execution_request_conflict' using errcode='23505',detail=coalesce(r->>'executionId','');end if;
 return r||jsonb_build_object('priorResults',resolved);
end $$;
revoke all on function private.request_work_execution_producer_v3(text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.request_work_execution_producer_v3(text,text,text,jsonb) to authenticated;
create function public.request_work_execution_v3(p_contract_text text,p_snapshot_text text,p_gates_text text,p_prior_results jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.request_work_execution_producer_v3(p_contract_text,p_snapshot_text,p_gates_text,p_prior_results); $$;
revoke all on function public.request_work_execution_v3(text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.request_work_execution_v3(text,text,text,jsonb) to authenticated;

-- 8. The latest succeeded prior of each role for a work, deterministic (latest result, then execution id),
-- with the stored input the server copies into the close's snapshot and the sources the contract must pin
-- again. A prior whose closure the caller may not read is reported as absent, never replaced by an older one.
create function private.quarter_update_latest_prior_v1(p_org uuid,p_work uuid,p_role text,p_subject uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare expected jsonb:=private.quarter_update_prior_method_v1(p_role);x record;closure jsonb;
begin
 select e.id,s.canonical_payload,s.payload_fingerprint,s.payload snapshot,m.payload contract,r.result,r.created_at into x
 from public.work_executions e
 join private.execution_manifests m on m.organization_id=e.organization_id and m.execution_id=e.id
 join private.execution_input_snapshots s on s.organization_id=e.organization_id and s.execution_id=e.id
 join private.execution_result_receipts r on r.organization_id=e.organization_id and r.execution_id=e.id
 where e.organization_id=p_org and e.work_id=p_work and r.outcome='succeeded'
  and m.payload#>>'{method,methodId}'=expected->>'methodId' and m.payload#>>'{method,methodVersion}'=expected->>'methodVersion'
  and r.result->>'schemaVersion'=expected->>'packet'
 order by r.created_at desc,e.id desc limit 1;
 if x.id is null then return null;end if;
 closure:=private.execution_result_source_closure_v1(p_org,x.id);
 if closure is null or not private.execution_closure_read_allowed_v1(p_org,closure,p_subject,'read') then return null;end if;
 return jsonb_build_object('executionId',x.id,'methodId',expected->>'methodId','methodVersion',expected->>'methodVersion','inputSnapshot',x.canonical_payload,
  'inputFingerprint',x.payload_fingerprint,'resultFingerprint',x.result->>'fingerprint','sources',coalesce(x.contract#>'{inputs,sources}','[]'::jsonb),'committedAt',x.created_at,
  'envelopeFingerprint',x.snapshot#>>'{analysis,envelope,fingerprint}','packet',x.result,
  'streamIds',case when p_role='weekly_cash' then coalesce((select jsonb_agg(st.v->'id' order by st.n) from jsonb_array_elements(coalesce(x.snapshot#>'{analysis,streams}','[]'::jsonb)) with ordinality st(v,n)),'[]'::jsonb) end);
end $$;
revoke all on function private.quarter_update_latest_prior_v1(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

-- For the person confirming the close's premises: what the web composes the request from.
create function private.quarter_update_prior_results_v1(p_work_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare org uuid;w jsonb;cv jsonb;
begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 select organization_id into org from public.capital_projects where id=p_work_id;
 if org is null then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform private.execution_read_access_v1(org,p_work_id);
 w:=private.quarter_update_latest_prior_v1(org,p_work_id,'weekly_cash',auth.uid());
 cv:=private.quarter_update_latest_prior_v1(org,p_work_id,'covenant',auth.uid());
 return jsonb_build_object('weeklyCash',case when w is null then null else w-array['envelopeFingerprint','packet','streamIds'] end,
  'covenant',case when cv is null then null else cv-array['envelopeFingerprint','packet','streamIds'] end);
end $$;
revoke all on function private.quarter_update_prior_results_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function private.quarter_update_prior_results_v1(uuid) to authenticated;
create function public.quarter_update_prior_results_v1(p_work_id uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.quarter_update_prior_results_v1(p_work_id); $$;
revoke all on function public.quarter_update_prior_results_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.quarter_update_prior_results_v1(uuid) to authenticated;

-- For the worker proposing the close's premise card, with the job capability and the job's subject: the
-- prior packets, the fingerprint of each prior basis and the weekly streams, nothing it could request with.
create function private.worker_quarter_update_priors_v1(p_job_id uuid,p_capability_token text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare job_row public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);work uuid;w jsonb;cv jsonb;
begin
 if job_row.kind<>'agent_operation_brief' then raise exception 'agent_operation_brief_capability_required' using errcode='42501';end if;
 select capital_project_id into work from public.document_intake_sessions where organization_id=job_row.organization_id and id=job_row.intake_session_id;
 if work is null or job_row.authorization_subject_id is null then return jsonb_build_object('weeklyCash',null,'covenant',null);end if;
 w:=private.quarter_update_latest_prior_v1(job_row.organization_id,work,'weekly_cash',job_row.authorization_subject_id);
 cv:=private.quarter_update_latest_prior_v1(job_row.organization_id,work,'covenant',job_row.authorization_subject_id);
 return jsonb_build_object(
  'weeklyCash',case when w is null then null else jsonb_build_object('executionId',w->'executionId','resultFingerprint',w->'resultFingerprint','envelopeFingerprint',w->'envelopeFingerprint','packet',w->'packet','streamIds',w->'streamIds') end,
  'covenant',case when cv is null then null else jsonb_build_object('executionId',cv->'executionId','resultFingerprint',cv->'resultFingerprint','envelopeFingerprint',cv->'envelopeFingerprint','packet',cv->'packet') end);
end $$;
revoke all on function private.worker_quarter_update_priors_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_quarter_update_priors_v1(uuid,text) to authenticated;
create function public.worker_quarter_update_priors_v1(p_job_id uuid,p_capability_token text) returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.worker_quarter_update_priors_v1(p_job_id,p_capability_token); $$;
revoke all on function public.worker_quarter_update_priors_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.worker_quarter_update_priors_v1(uuid,text) to authenticated;