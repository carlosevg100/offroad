-- Propagation: an approved change recomputes the dependent results through the deterministic path
-- that already exists, and the outputs of the previous revision stay stored and identifiable.
--
-- Three parts:
--
--   1. The data component of a canonical revision carries the reviewed source manifest and nothing
--      else. Its approval is the configuration approval already recorded under assumptions, so a
--      new approval over the same documents no longer reports the data as changed.
--
--   2. Supersession becomes a database invariant instead of a caller's good intention. When any
--      writer moves a queued result to completed, the completed results of other revisions are
--      marked as previous. The earlier row keeps its artifact; only its superseded_by moves, and
--      the immutability guard already allows that exactly once.
--
--   3. One idempotent command recomputes what an approved change made outdated. It never contains
--      financial mathematics: it records the canonical revision and enqueues the same
--      agent_operation_brief the approve-and-calculate path enqueues, with the same zero budget.
--      Called twice it returns the result already queued or completed for that revision.

create or replace function private.project_canonical_inputs(p_organization_id uuid, p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c private.institutional_model_configurations; scope private.receivables_evidence_scopes;
        d public.capital_project_execution_brief_dispatches; provenance jsonb;
begin
  select * into c from private.institutional_model_configurations
   where organization_id = p_organization_id and capital_project_id = p_project_id and status = 'approved'
   order by revision desc limit 1;
  if c.id is not null then provenance := private.institutional_configuration_provenance(p_organization_id, c.id); end if;
  select * into scope from private.receivables_evidence_scopes
   where organization_id = p_organization_id and capital_project_id = p_project_id
   order by confirmed_at desc, id desc limit 1;
  select * into d from public.capital_project_execution_brief_dispatches
   where organization_id = p_organization_id and capital_project_id = p_project_id and accepted_at is not null and accepted_by is not null
   order by accepted_at desc, id desc limit 1;
  return jsonb_build_object(
    'assumptions', case when c.id is null then null else jsonb_build_object(
      'configurationId', c.id, 'revision', c.revision, 'fingerprint', c.configuration_fingerprint,
      'approvedBy', c.reviewed_by, 'approvedAt', c.reviewed_at) end,
    -- The manifest is resolved through the approved configuration, so it moves only with an
    -- approval. It carries no approver of its own: that approval is the one under assumptions.
    'data', case when c.id is null then null else jsonb_build_object(
      'sourceManifestFingerprint', provenance ->> 'sourceManifestFingerprint') end,
    'receivablesScope', case when scope.id is null then null else jsonb_build_object(
      'scopeId', scope.id, 'fingerprint', scope.fingerprint,
      'approvedBy', scope.confirmed_by, 'approvedAt', scope.confirmed_at) end,
    'documentaryRevision', case when d.id is null then null else jsonb_build_object(
      'executionBriefId', d.execution_brief_id, 'inputFingerprint', d.input_fingerprint, 'payloadFingerprint', d.payload_fingerprint,
      'approvedBy', d.accepted_by, 'approvedAt', d.accepted_at) end);
end $$;

create function private.supersede_previous_institutional_results() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update private.institutional_model_results h set superseded_by = new.id
   where h.organization_id = new.organization_id and h.capital_project_id = new.capital_project_id
     and h.id <> new.id and h.status = 'completed' and h.superseded_by is null
     and h.canonical_revision_id is distinct from new.canonical_revision_id;
  return null;
end $$;
create trigger institutional_result_supersedes after update on private.institutional_model_results
  for each row when (old.status = 'queued' and new.status = 'completed' and new.canonical_revision_id is not null)
  execute function private.supersede_previous_institutional_results();
revoke all on function private.supersede_previous_institutional_results() from public, anon, authenticated;

-- Same body checks as before. Supersession is now the trigger's invariant; the count is read back
-- so the caller still learns how many outputs moved to previous.
create or replace function private.worker_record_institutional_model_result_v1(p_job_id uuid,p_capability_token text,p_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);r private.institutional_model_results;context jsonb;v_artifact jsonb;scenario jsonb;c private.institutional_model_configurations;provenance jsonb;expected jsonb;opening jsonb;revenues jsonb;costs jsonb;taxes jsonb;v_tax_field text;superseded integer:=0;
begin
 if j.kind<>'agent_operation_brief' then raise exception 'institutional_result_capability_required' using errcode='42501';end if;
 select * into r from private.institutional_model_results where organization_id=j.organization_id and intake_session_id=j.intake_session_id and id=nullif(j.payload->>'message_id','')::uuid for update;
 if r.id is null then raise exception 'institutional_result_request_missing' using errcode='42501';end if;
 if r.status<>'queued' then
  if p_result->>'status' is distinct from r.status or (r.status='completed' and p_result->'artifact' is distinct from r.artifact) or (r.status='blocked' and p_result->'blockers' is distinct from r.blockers) then raise exception 'institutional_result_replay_mismatch';end if;
  select count(*) into superseded from private.institutional_model_results where organization_id=r.organization_id and superseded_by=r.id;
  return jsonb_build_object('id',r.id,'status',r.status,'replayed',true,'supersededResults',superseded);
 end if;
 perform 1 from public.capital_projects where organization_id=r.organization_id and id=r.capital_project_id for update;
 if p_result->>'status'='blocked' then
  if coalesce(jsonb_typeof(p_result->'blockers'),'null')<>'array' or jsonb_array_length(p_result->'blockers') not between 1 and 100 then raise exception 'institutional_result_blockers_required';end if;
  update private.institutional_model_results set status='blocked',blockers=p_result->'blockers',produced_at=now() where id=r.id;
  return jsonb_build_object('id',r.id,'status','blocked','replayed',false,'supersededResults',0);
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
 update private.institutional_model_results set status='completed',artifact=v_artifact,blockers='[]',produced_at=now() where id=r.id;
 select count(*) into superseded from private.institutional_model_results where organization_id=r.organization_id and superseded_by=r.id;
 return jsonb_build_object('id',r.id,'status','completed','replayed',false,'supersededResults',superseded);
end $$;

-- Recompute what the approved change made outdated, once. No new calculation engine: the same
-- deterministic agent_operation_brief job, the same zero budget, the same immutable result row.
create function private.propagate_project_canonical_revision_v1(p_project_id uuid, p_request_id uuid, p_locale text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.capital_projects; c private.institutional_model_configurations; s public.document_intake_sessions;
        revision private.project_canonical_revisions; existing private.institutional_model_results;
        context jsonb; provenance jsonb;
begin
  select * into p from public.capital_projects where id = p_project_id;
  if p.id is null or not private.can_access_capital_project(p.organization_id, p.id) then
    raise exception 'project_revision_forbidden' using errcode = '42501';
  end if;
  if p_request_id is null or coalesce(p_locale, '') not in ('pt-BR', 'en-US') then
    raise exception 'project_revision_request_invalid';
  end if;
  -- Recomputing a dependent result is preparation work, not a second approval.
  perform private.assert_capital_project_review_action(p.organization_id, p.id, 'prepare');
  perform 1 from public.capital_projects where organization_id = p.organization_id and id = p.id for update;
  select * into existing from private.institutional_model_results where id = p_request_id;
  if found then
    if existing.organization_id is distinct from p.organization_id or existing.capital_project_id is distinct from p.id
       or existing.requested_by is distinct from auth.uid() then
      raise exception 'project_revision_request_replay_mismatch';
    end if;
    return jsonb_build_object('status', existing.status, 'resultId', existing.id,
      'revisionId', existing.canonical_revision_id, 'replayed', true);
  end if;
  revision := private.record_project_canonical_revision_v1(p.organization_id, p.id);
  -- A repeated propagation of the same revision never produces a second output.
  select * into existing from private.institutional_model_results
   where organization_id = p.organization_id and capital_project_id = p.id
     and canonical_revision_id = revision.id and status in ('queued', 'completed')
   order by created_at desc, id desc limit 1;
  if existing.id is not null then
    return jsonb_build_object('status', existing.status, 'resultId', existing.id,
      'revisionId', revision.id, 'replayed', true);
  end if;
  select * into c from private.institutional_model_configurations
   where organization_id = p.organization_id and capital_project_id = p.id and status = 'approved'
   order by revision desc limit 1;
  if c.id is null then
    return jsonb_build_object('status', 'no_dependent_result', 'resultId', null, 'revisionId', revision.id, 'replayed', false);
  end if;
  select * into s from public.document_intake_sessions
   where organization_id = p.organization_id and capital_project_id = p.id order by created_at asc limit 1;
  if s.id is null then raise exception 'project_revision_session_missing'; end if;
  context := private.institutional_source_context(p.organization_id, s.id);
  provenance := private.institutional_configuration_provenance(p.organization_id, c.id);
  if provenance ->> 'sourceManifestFingerprint' is distinct from context ->> 'sourceManifestFingerprint' then
    raise exception 'institutional_result_sources_changed' using errcode = '40001';
  end if;
  if exists (select 1 from public.agent_messages where id = p_request_id) then
    raise exception 'institutional_result_message_reused';
  end if;
  perform private.submit_advisor_turn_v1(p.id, p_request_id, p_locale,
    case when p_locale = 'pt-BR' then 'Recalcular os resultados desta revisão aprovada e regerar os materiais correspondentes.'
         else 'Recalculate the results of this approved revision and regenerate the matching materials.' end);
  update public.agent_messages set metadata = metadata || jsonb_build_object(
      'kind', 'institutional_model_refresh', 'institutionalResultRequestId', p_request_id,
      'configurationId', c.id, 'configurationFingerprint', c.configuration_fingerprint, 'canonicalRevisionId', revision.id)
   where organization_id = p.organization_id and id = p_request_id;
  update public.processing_runs set budget = jsonb_build_object('maxCalls', 0, 'maxCostUsd', 0)
   where organization_id = p.organization_id and id in (
     select processing_run_id from public.processing_jobs
      where organization_id = p.organization_id and intake_session_id = s.id
        and kind = 'agent_operation_brief' and payload ->> 'message_id' = p_request_id::text);
  insert into private.institutional_model_results(
    id, organization_id, capital_project_id, intake_session_id, configuration_id, configuration_fingerprint,
    source_manifest_fingerprint, requested_by, canonical_revision_id)
  values (p_request_id, p.organization_id, p.id, s.id, c.id, c.configuration_fingerprint,
    context ->> 'sourceManifestFingerprint', auth.uid(), revision.id);
  return jsonb_build_object('status', 'queued', 'resultId', p_request_id, 'revisionId', revision.id, 'replayed', false);
end $$;
create function public.propagate_project_canonical_revision_v1(p_project_id uuid, p_request_id uuid, p_locale text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.propagate_project_canonical_revision_v1(p_project_id, p_request_id, p_locale);
$$;
revoke all on function private.propagate_project_canonical_revision_v1(uuid, uuid, text), public.propagate_project_canonical_revision_v1(uuid, uuid, text) from public, anon;
grant execute on function private.propagate_project_canonical_revision_v1(uuid, uuid, text), public.propagate_project_canonical_revision_v1(uuid, uuid, text) to authenticated;
