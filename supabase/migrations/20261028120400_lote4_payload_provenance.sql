-- Lote 4 (C09 organize-document-folder, C01 evaluate-received-proposal, the 2027 plan evaluate-financing-paths, C47
-- prepare-board-capital-discussion) payloads are held to the same provenance as capital, investment and lotes 1 to 3:
-- every adopted envelope must be the stored working basis of this work and purpose, every decision pinned by the
-- contract, every entity, definition and source readable by the requester. Each method is bound to its version, the
-- published manifest and its payload schema. The board discussion and a folder update read prior results: their
-- branch requires the priors the v4 producer recorded for this very execution (a request through v1 or v2 records none
-- and is refused), and the board discussion's envelope must be a basis version the contract pins. The lines added
-- carry the trailing comment "lote 4"; removing them and the four methods from the list gives back the 20261027010426
-- body byte for byte (packages/execution-request/src/lote4-payload-provenance-regression.test.ts). Other methods unchanged.
-- The C09, C01 and 2027 plan pins are the manifestHash of their publication records (published 28 October 2026 from main
-- ee5ca744, capability off). C47 is not published: its branch pins a value no manifest hash can take, so every C47
-- payload is refused by name until the C47 publication replaces it with the published manifestHash.
set local lock_timeout='5s';

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
 if c#>>'{method,methodId}'='prepare-board-capital-discussion' then -- lote 4
  -- The reviewed results are the stored results the v4 producer recorded for this execution, checked whole; the discussion's -- lote 4
  -- envelope is a basis version the contract pins; the walk reads the discussion alone. -- lote 4
  if c#>>'{method,methodVersion}' is distinct from '2026.10.27-v1' or payload->>'schemaVersion' is distinct from 'board-capital-discussion-packet-input.v1' -- lote 4
   or jsonb_typeof(payload#>'{analysis,discussion,envelope,canonical}') is distinct from 'string' -- lote 4
   or not exists(select 1 from jsonb_array_elements(pins) p where p->>'assumptionVersionId'=private.execution_json_projection_v1(payload#>>'{analysis,discussion,envelope,canonical}')->>'versionId') -- lote 4
   or not private.board_material_priors_recorded_v1(c,payload) then return false;end if; -- lote 4
  payload:=payload #- '{analysis,sources}';pending:=array[payload]; -- lote 4
 end if; -- lote 4
 if c#>>'{method,methodId}'='organize-document-folder' then -- lote 4
  -- A first inventory reads no prior and has none recorded; an update reads exactly the recorded prior inventory, its base -- lote 4
  -- the prior's stored base byte for byte, and the walk reads the update alone. -- lote 4
  if c#>>'{method,methodVersion}' is distinct from '2026.10.27-v1' or payload->>'schemaVersion' is distinct from 'document-folder-inventory-packet-input.v1' -- lote 4
   or not private.document_folder_prior_recorded_v1(c,payload) then return false;end if; -- lote 4
  if coalesce(payload#>'{analysis,update}','null'::jsonb)<>'null'::jsonb then payload:=payload #- '{analysis,base}';pending:=array[payload];end if; -- lote 4
 end if; -- lote 4
 if c#>>'{method,methodId}' not in ('prepare-capital-structure-decision','analyze-investment-project','compare-financing-proposals','analyze-relative-debt-cost','assess-debt-capacity','build-company-debt-table','measure-covenant-headroom','project-weekly-cash','build-operating-projection','challenge-financial-projection','monetize-receivables-for-working-capital','update-after-quarter-close','organize-document-folder','evaluate-received-proposal','evaluate-financing-paths','prepare-board-capital-discussion') then return true;end if;
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
 or (c#>>'{method,methodId}'='build-operating-projection' and (c#>>'{method,methodVersion}' is distinct from '2026.10.26-v1'
   or c#>>'{method,manifestHash}' is distinct from '4caf3653c36d13d238967cc35b0f34f3a4f641fe55cb5f42b60f471127a5614a'
   or payload->>'schemaVersion' is distinct from 'operating-projection-packet-input.v1'))
 or (c#>>'{method,methodId}'='challenge-financial-projection' and (c#>>'{method,methodVersion}' is distinct from '2026.10.26-v1'
   or c#>>'{method,manifestHash}' is distinct from '1180b9a1e88f3e9bf0857f0f98232fac2cdd34c7496388c9d61f2a2580c2ff64'
   or payload->>'schemaVersion' is distinct from 'projection-challenge-packet-input.v1'))
 or (c#>>'{method,methodId}'='monetize-receivables-for-working-capital' and (c#>>'{method,methodVersion}' is distinct from '2026.10.26-v1'
   or c#>>'{method,manifestHash}' is distinct from '40acfbd4ff347ee89baad9310dacefc9c73c9d501a13241c0a4d0b3ebd23b3e5'
   or payload->>'schemaVersion' is distinct from 'receivables-funding-packet-input.v1'))
 or (c#>>'{method,methodId}'='update-after-quarter-close' and (c#>>'{method,methodVersion}' is distinct from '2026.10.26-v1'
   or c#>>'{method,manifestHash}' is distinct from 'f09b5f5227bf74f31e6c4f65a132f990ea2fadfca86e9be0fedf9723fa8c5729'
   or payload->>'schemaVersion' is distinct from 'quarter-update-packet-input.v1'))
 or (c#>>'{method,methodId}'='organize-document-folder' and (c#>>'{method,methodVersion}' is distinct from '2026.10.27-v1' -- lote 4
   or c#>>'{method,manifestHash}' is distinct from '4378d63bf0b7465838fefe7e3463dbc755cd6c022803a60ac7fe32d368f75248' -- lote 4
   or payload->>'schemaVersion' is distinct from 'document-folder-inventory-packet-input.v1')) -- lote 4
 or (c#>>'{method,methodId}'='evaluate-received-proposal' and (c#>>'{method,methodVersion}' is distinct from '2026.10.27-v1' -- lote 4
   or c#>>'{method,manifestHash}' is distinct from '4e092f29299e5cefcf650532b470794a387c077474503ace43909a93c1d040e0' -- lote 4
   or payload->>'schemaVersion' is distinct from 'received-proposal-packet-input.v1')) -- lote 4
 or (c#>>'{method,methodId}'='evaluate-financing-paths' and (c#>>'{method,methodVersion}' is distinct from '2026.10.27-v1' -- lote 4
   or c#>>'{method,manifestHash}' is distinct from 'e306d411ea0e88bcbabe3bb3a62e80bfd43d1e65055477cfcda042d549606af4' -- lote 4
   or payload->>'schemaVersion' is distinct from 'capital-structure-paths-packet-input.v1')) -- lote 4
 or (c#>>'{method,methodId}'='prepare-board-capital-discussion' and (c#>>'{method,methodVersion}' is distinct from '2026.10.27-v1' -- lote 4
   or c#>>'{method,manifestHash}' is distinct from 'c47-awaits-publication' -- lote 4
   or payload->>'schemaVersion' is distinct from 'board-capital-discussion-packet-input.v1')) -- lote 4
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