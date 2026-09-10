-- Admit the versioned editable workbook while preserving immutable approved snapshots,
-- current source/configuration bindings, exact replay, capability and economic checks.
create or replace function private.worker_record_institutional_model_result_v1(p_job_id uuid,p_capability_token text,p_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);r private.institutional_model_results;context jsonb;v_artifact jsonb;scenario jsonb;c private.institutional_model_configurations;provenance jsonb;expected jsonb;opening jsonb;revenues jsonb;costs jsonb;taxes jsonb;v_tax_field text;
begin
 if j.kind<>'agent_operation_brief' then raise exception 'institutional_result_capability_required' using errcode='42501';end if;
 select * into r from private.institutional_model_results where organization_id=j.organization_id and intake_session_id=j.intake_session_id and id=nullif(j.payload->>'message_id','')::uuid for update;
 if r.id is null then raise exception 'institutional_result_request_missing' using errcode='42501';end if;
 if r.status<>'queued' then
  if p_result->>'status' is distinct from r.status or (r.status='completed' and p_result->'artifact' is distinct from r.artifact) or (r.status='blocked' and p_result->'blockers' is distinct from r.blockers) then raise exception 'institutional_result_replay_mismatch';end if;
  return jsonb_build_object('id',r.id,'status',r.status,'replayed',true);
 end if;
 perform 1 from public.capital_projects where organization_id=r.organization_id and id=r.capital_project_id for update;
 if p_result->>'status'='blocked' then
  if coalesce(jsonb_typeof(p_result->'blockers'),'null')<>'array' or jsonb_array_length(p_result->'blockers') not between 1 and 100 then raise exception 'institutional_result_blockers_required';end if;
  update private.institutional_model_results set status='blocked',blockers=p_result->'blockers' where id=r.id;
  return jsonb_build_object('id',r.id,'status','blocked','replayed',false);
 end if;
 context:=private.institutional_source_context(r.organization_id,r.intake_session_id);v_artifact:=p_result->'artifact';
 if p_result->>'status' is distinct from 'completed' or pg_column_size(v_artifact)>8388608 or v_artifact->>'modelKind' is distinct from 'institutional' or v_artifact#>>'{institutional,exportMode}' is distinct from 'approved_snapshot' or coalesce(v_artifact->>'version','') not in ('institutional-workbook-snapshot.v1','institutional-workbook-editable.v2') or v_artifact->>'fingerprint' is distinct from private.institutional_config_hash(v_artifact-'fingerprint') or v_artifact#>>'{institutional,sourceManifestFingerprint}' is distinct from r.source_manifest_fingerprint or r.source_manifest_fingerprint is distinct from context->>'sourceManifestFingerprint' or v_artifact#>>'{institutional,activeScenarioId}' is distinct from r.configuration_id::text or r.configuration_id is distinct from (select id from private.institutional_model_configurations where organization_id=r.organization_id and capital_project_id=r.capital_project_id and status='approved' order by revision desc limit 1) or coalesce(jsonb_typeof(v_artifact#>'{institutional,scenarios}'),'null')<>'array' or jsonb_array_length(v_artifact#>'{institutional,scenarios}') not between 1 and 12 then raise exception 'institutional_result_stale_or_invalid';end if;
 if (select count(distinct x->>'configurationId') from jsonb_array_elements(v_artifact#>'{institutional,scenarios}') x)<>jsonb_array_length(v_artifact#>'{institutional,scenarios}') or not exists(select 1 from jsonb_array_elements(v_artifact#>'{institutional,scenarios}') x where x->>'configurationId'=r.configuration_id::text and x->>'configurationFingerprint'=r.configuration_fingerprint) then raise exception 'institutional_result_scenario_identity_invalid';end if;
 for scenario in select x from jsonb_array_elements(v_artifact#>'{institutional,scenarios}') x loop
  select * into c from private.institutional_model_configurations where organization_id=r.organization_id and capital_project_id=r.capital_project_id and id=(scenario->>'configurationId')::uuid and status='approved';
  if c.id is null or scenario->>'configurationFingerprint' is distinct from c.configuration_fingerprint or scenario->>'revision' is distinct from c.revision::text or scenario->>'reviewedBy' is distinct from c.reviewed_by::text or (scenario->>'reviewedAt')::timestamptz is distinct from c.reviewed_at then raise exception 'institutional_result_configuration_unbound';end if;
  provenance:=private.institutional_configuration_provenance(r.organization_id,c.id);
  if provenance->>'sourceManifestFingerprint' is distinct from r.source_manifest_fingerprint or scenario->'lineage' is distinct from provenance->'lineage' or scenario->'sourceBindings' is distinct from provenance->'sourceBindings' then raise exception 'institutional_result_lineage_unbound';end if;
  select jsonb_object_agg(substr(l->>'targetPath',21),l->'value') into opening from jsonb_array_elements(provenance->'lineage') l where l->>'targetPath' like 'openingBalanceSheet.%';
  opening:=opening||jsonb_build_object('period',c.configuration#>>'{openingBalanceSheet,period}');
  select jsonb_agg(x||jsonb_build_object('baseRevenue',(select l->'value' from jsonb_array_elements(provenance->'lineage') l where l->>'targetPath'='revenueSegments.'||(x->>'id')||'.baseRevenue')) order by ord) into revenues from jsonb_array_elements(c.configuration->'revenueSegments') with ordinality a(x,ord);
  select jsonb_agg(case when x->>'method'='base_and_growth' then x||jsonb_build_object('baseCost',(select l->'value' from jsonb_array_elements(provenance->'lineage') l where l->>'targetPath'='operatingCosts.'||(x->>'id')||'.baseCost')) else x end order by ord) into costs from jsonb_array_elements(c.configuration->'operatingCosts') with ordinality a(x,ord);
  taxes:=c.configuration->'taxes';
  for v_tax_field in select unnest(array['openingTaxLossCarryforward','openingDisallowedInterestCarryforward']) loop taxes:=jsonb_set(taxes,array[v_tax_field],(select l->'value' from jsonb_array_elements(provenance->'lineage') l where l->>'targetPath'='taxes.'||v_tax_field));end loop;
  expected:=c.configuration||jsonb_build_object('openingBalanceSheet',opening,'revenueSegments',revenues,'operatingCosts',costs,'taxes',taxes);
  if scenario->'input' is distinct from expected then raise exception 'institutional_result_economics_unbound';end if;
 end loop;
 update private.institutional_model_results set status='completed',artifact=v_artifact,blockers='[]' where id=r.id;
 return jsonb_build_object('id',r.id,'status','completed','replayed',false);
end $$;
