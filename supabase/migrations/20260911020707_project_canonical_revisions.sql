-- Canonical revision of the approved assumptions and data of a capital project.
--
-- Until now a result carried the fingerprints of the configuration and of the source manifest it
-- was calculated from, and the reader decided "current" or "stale" by comparing them one at a
-- time. That is enough to refuse a stale download and not enough to answer the question a desk
-- actually asks: which approved set of assumptions and data produced this file, what changed
-- since the previous one, and which output is the previous one.
--
-- A canonical revision is that set, recorded once, immutable, organization scoped:
--   * assumptions          -> the approved institutional configuration and its approver
--   * data                 -> the source manifest the approved configuration is bound to
--   * receivablesScope     -> the last confirmed receivables scope and its fingerprint
--   * documentaryRevision  -> the last accepted execution brief dispatch and its fingerprints
--
-- Every component is an already approved record. The revision never invents an approval: its
-- approver and approval timestamp are copied from the component that changed, which is the
-- approval record enforced by the project review roles (preparer, reviewer, approver). A change
-- that was not approved does not advance the revision; it shows up as pending drift instead.
--
-- Results now declare the revision they were produced from, when they were produced, and which
-- later result superseded them. Nothing is overwritten: the previous artifact stays in place and
-- stays identifiable.

create table private.project_canonical_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  capital_project_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  parent_revision_id uuid,
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object'),
  inputs_fingerprint text not null check (inputs_fingerprint ~ '^[a-f0-9]{64}$'),
  change_summary jsonb not null default '[]'::jsonb check (jsonb_typeof(change_summary) = 'array'),
  approval_kind text not null check (approval_kind in ('initial', 'institutional_configuration', 'receivables_scope', 'documentary_revision')),
  approval_reference uuid,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, capital_project_id, revision_number),
  unique (organization_id, capital_project_id, inputs_fingerprint),
  constraint project_canonical_revision_parent_order check (parent_revision_id is null or revision_number > 1),
  foreign key (organization_id, capital_project_id) references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, parent_revision_id) references private.project_canonical_revisions(organization_id, id)
);
alter table private.project_canonical_revisions enable row level security;
alter table private.project_canonical_revisions force row level security;
create policy project_canonical_revisions_no_select on private.project_canonical_revisions for select to authenticated using (false);
create policy project_canonical_revisions_no_insert on private.project_canonical_revisions for insert to authenticated with check (false);
create policy project_canonical_revisions_no_update on private.project_canonical_revisions for update to authenticated using (false) with check (false);
create policy project_canonical_revisions_no_delete on private.project_canonical_revisions for delete to authenticated using (false);
revoke all on private.project_canonical_revisions from public, anon, authenticated;
create index project_canonical_revisions_project_idx on private.project_canonical_revisions(organization_id, capital_project_id, revision_number desc);
create index project_canonical_revisions_parent_idx on private.project_canonical_revisions(organization_id, parent_revision_id) where parent_revision_id is not null;
create index project_canonical_revisions_approver_idx on private.project_canonical_revisions(approved_by);
create trigger project_canonical_revisions_updated before update on private.project_canonical_revisions for each row execute function private.set_updated_at();
create trigger project_canonical_revisions_audit after insert or update or delete on private.project_canonical_revisions for each row execute function private.capture_audit_event();

create function private.guard_project_canonical_revision() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'project_canonical_revision_immutable';
end $$;
create trigger project_canonical_revision_immutable before update or delete on private.project_canonical_revisions for each row execute function private.guard_project_canonical_revision();
revoke all on function private.guard_project_canonical_revision() from public, anon, authenticated;

-- The approved input set as it stands right now. Only approved records are read: the source
-- manifest is the one the approved configuration is bound to, never the newest upload.
create function private.project_canonical_inputs(p_organization_id uuid, p_project_id uuid)
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
    'data', case when c.id is null then null else jsonb_build_object(
      'sourceManifestFingerprint', provenance ->> 'sourceManifestFingerprint',
      'approvedBy', c.reviewed_by, 'approvedAt', c.reviewed_at) end,
    'receivablesScope', case when scope.id is null then null else jsonb_build_object(
      'scopeId', scope.id, 'fingerprint', scope.fingerprint,
      'approvedBy', scope.confirmed_by, 'approvedAt', scope.confirmed_at) end,
    'documentaryRevision', case when d.id is null then null else jsonb_build_object(
      'executionBriefId', d.execution_brief_id, 'inputFingerprint', d.input_fingerprint, 'payloadFingerprint', d.payload_fingerprint,
      'approvedBy', d.accepted_by, 'approvedAt', d.accepted_at) end);
end $$;
revoke all on function private.project_canonical_inputs(uuid, uuid) from public, anon, authenticated;

-- Idempotent: the same approved input set always resolves to the same revision row.
create function private.record_project_canonical_revision_v1(p_organization_id uuid, p_project_id uuid)
returns private.project_canonical_revisions language plpgsql security definer set search_path = '' as $$
declare inputs jsonb; fingerprint text; latest private.project_canonical_revisions; existing private.project_canonical_revisions;
        created private.project_canonical_revisions; changed text[] := '{}'; component text; kind text; source jsonb;
begin
  inputs := private.project_canonical_inputs(p_organization_id, p_project_id);
  if jsonb_typeof(inputs -> 'assumptions') = 'null' and jsonb_typeof(inputs -> 'receivablesScope') = 'null'
     and jsonb_typeof(inputs -> 'documentaryRevision') = 'null' then
    raise exception 'project_canonical_revision_inputs_missing';
  end if;
  fingerprint := private.institutional_config_hash(inputs);
  select * into existing from private.project_canonical_revisions
   where organization_id = p_organization_id and capital_project_id = p_project_id and inputs_fingerprint = fingerprint;
  if existing.id is not null then return existing; end if;
  select * into latest from private.project_canonical_revisions
   where organization_id = p_organization_id and capital_project_id = p_project_id
   order by revision_number desc limit 1 for update;
  foreach component in array array['assumptions', 'data', 'receivablesScope', 'documentaryRevision'] loop
    if (inputs -> component) is distinct from coalesce(latest.inputs -> component, 'null'::jsonb) then
      changed := changed || component;
    end if;
  end loop;
  component := case when jsonb_typeof(inputs -> 'assumptions') <> 'null' and ('assumptions' = any(changed) or 'data' = any(changed) or latest.id is null)
                      then 'assumptions'
                    when 'receivablesScope' = any(changed) then 'receivablesScope'
                    when 'documentaryRevision' = any(changed) then 'documentaryRevision'
                    when jsonb_typeof(inputs -> 'receivablesScope') <> 'null' then 'receivablesScope'
                    else 'documentaryRevision' end;
  kind := case when latest.id is null then 'initial'
               when component = 'assumptions' then 'institutional_configuration'
               when component = 'receivablesScope' then 'receivables_scope'
               else 'documentary_revision' end;
  source := inputs -> component;
  if source ->> 'approvedBy' is null or source ->> 'approvedAt' is null then
    raise exception 'project_canonical_revision_approval_missing';
  end if;
  insert into private.project_canonical_revisions(
    organization_id, capital_project_id, revision_number, parent_revision_id, inputs, inputs_fingerprint,
    change_summary, approval_kind, approval_reference, approved_by, approved_at)
  values (p_organization_id, p_project_id, coalesce(latest.revision_number, 0) + 1, latest.id, inputs, fingerprint,
    to_jsonb(changed), kind,
    coalesce((source ->> 'configurationId')::uuid, (source ->> 'scopeId')::uuid, (source ->> 'executionBriefId')::uuid),
    (source ->> 'approvedBy')::uuid, (source ->> 'approvedAt')::timestamptz)
  returning * into created;
  return created;
end $$;
revoke all on function private.record_project_canonical_revision_v1(uuid, uuid) from public, anon, authenticated;

-- Results declare their revision, when they were produced and which result replaced them.
alter table private.institutional_model_results
  add column canonical_revision_id uuid,
  add column produced_at timestamptz,
  add column superseded_by uuid;
update private.institutional_model_results set produced_at = updated_at where status <> 'queued';
alter table private.institutional_model_results
  add constraint institutional_results_revision_fk foreign key (organization_id, canonical_revision_id)
    references private.project_canonical_revisions(organization_id, id),
  add constraint institutional_results_superseded_fk foreign key (organization_id, superseded_by)
    references private.institutional_model_results(organization_id, id),
  add constraint institutional_results_produced_when_terminal check ((produced_at is not null) = (status <> 'queued')),
  add constraint institutional_results_superseded_completed check (superseded_by is null or (status = 'completed' and superseded_by <> id));
create index institutional_results_revision_idx on private.institutional_model_results(organization_id, canonical_revision_id) where canonical_revision_id is not null;
create index institutional_results_superseded_idx on private.institutional_model_results(organization_id, superseded_by) where superseded_by is not null;

-- The body of a recorded result stays immutable. Two transitions are allowed and no others:
-- the queued request becomes terminal exactly once, and a completed result is marked as
-- superseded exactly once. Marking a previous result never rewrites its artifact.
create or replace function private.guard_institutional_result_body() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'institutional_result_history_immutable'; end if;
  if old.status = 'queued' then
    if (to_jsonb(new) - array['status', 'artifact', 'blockers', 'produced_at', 'updated_at'])
       is distinct from (to_jsonb(old) - array['status', 'artifact', 'blockers', 'produced_at', 'updated_at'])
       or new.status not in ('completed', 'blocked') or new.produced_at is null then
      raise exception 'institutional_result_immutable';
    end if;
    return new;
  end if;
  if old.status = 'completed' and old.superseded_by is null and new.superseded_by is not null
     and (to_jsonb(new) - array['superseded_by', 'updated_at']) is not distinct from (to_jsonb(old) - array['superseded_by', 'updated_at']) then
    return new;
  end if;
  raise exception 'institutional_result_immutable';
end $$;

-- Same approval path, same stale and replay fences. The queued result now also declares the
-- canonical revision the approval produced.
create or replace function private.review_institutional_configuration_and_calculate_v1(p_project_id uuid,p_candidate_id uuid,p_expected_parent_fingerprint text,p_decision text,p_expected_candidate_fingerprint text,p_request_id uuid,p_locale text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.institutional_model_configurations;r private.institutional_model_results;s public.document_intake_sessions;context jsonb;provenance jsonb;queued jsonb;revision private.project_canonical_revisions;
begin
 select * into c from private.institutional_model_configurations where capital_project_id=p_project_id and id=p_candidate_id;
 if c.id is null or not private.can_access_capital_project(c.organization_id,p_project_id) then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=c.organization_id and id=p_project_id for update;
 if p_request_id is null or coalesce(p_locale,'') not in ('pt-BR','en-US') or coalesce(p_decision,'') not in ('approved','rejected') then raise exception 'institutional_result_request_invalid';end if;
 select * into r from private.institutional_model_results where id=p_request_id;
 if found then
  if r.organization_id is distinct from c.organization_id or r.capital_project_id is distinct from p_project_id or r.configuration_id is distinct from c.id or r.configuration_fingerprint is distinct from p_expected_candidate_fingerprint or r.requested_by is distinct from auth.uid() or c.parent_fingerprint is distinct from p_expected_parent_fingerprint or p_decision<>'approved' then raise exception 'institutional_result_request_replay_mismatch';end if;
  return jsonb_build_object('requestId',r.id,'status',r.status,'replayed',true,'revisionId',r.canonical_revision_id);
 end if;
 if c.status='review_required' then perform private.review_institutional_configuration_v1(p_project_id,p_candidate_id,p_expected_parent_fingerprint,p_decision,p_expected_candidate_fingerprint);
 elsif c.status is distinct from 'approved' or p_decision<>'approved' or c.configuration_fingerprint is distinct from p_expected_candidate_fingerprint or c.parent_fingerprint is distinct from p_expected_parent_fingerprint then raise exception 'institutional_review_stale' using errcode='40001';end if;
 if p_decision='rejected' then return jsonb_build_object('candidateId',c.id,'status','rejected');end if;
 if c.id is distinct from (select id from private.institutional_model_configurations where organization_id=c.organization_id and capital_project_id=p_project_id and status='approved' order by revision desc limit 1) then raise exception 'institutional_result_configuration_stale' using errcode='40001';end if;
 select * into s from public.document_intake_sessions where organization_id=c.organization_id and capital_project_id=p_project_id order by created_at asc limit 1;
 context:=private.institutional_source_context(c.organization_id,s.id);provenance:=private.institutional_configuration_provenance(c.organization_id,c.id);
 if provenance->>'sourceManifestFingerprint' is distinct from context->>'sourceManifestFingerprint' then raise exception 'institutional_result_sources_changed' using errcode='40001';end if;
 if exists(select 1 from public.agent_messages where id=p_request_id) then raise exception 'institutional_result_message_reused';end if;
 revision:=private.record_project_canonical_revision_v1(c.organization_id,p_project_id);
 queued:=private.submit_advisor_turn_v1(p_project_id,p_request_id,p_locale,case when p_locale='pt-BR' then 'Calcular as demonstrações e exportar os resultados desta configuração aprovada.' else 'Calculate the financial statements and export the results of this approved configuration.' end);
 update public.agent_messages set metadata=metadata||jsonb_build_object('kind','institutional_model_refresh','institutionalResultRequestId',p_request_id,'configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint,'canonicalRevisionId',revision.id) where organization_id=c.organization_id and id=p_request_id;
 update public.processing_runs set budget=jsonb_build_object('maxCalls',0,'maxCostUsd',0) where organization_id=c.organization_id and id in (select processing_run_id from public.processing_jobs where organization_id=c.organization_id and intake_session_id=s.id and kind='agent_operation_brief' and payload->>'message_id'=p_request_id::text);
 insert into private.institutional_model_results(id,organization_id,capital_project_id,intake_session_id,configuration_id,configuration_fingerprint,source_manifest_fingerprint,requested_by,canonical_revision_id) values(p_request_id,c.organization_id,p_project_id,s.id,c.id,c.configuration_fingerprint,context->>'sourceManifestFingerprint',auth.uid(),revision.id);
 return jsonb_build_object('requestId',p_request_id,'status','queued','replayed',false,'revisionId',revision.id);
end $$;

-- Recording a completed result stamps when it was produced and marks the completed results of
-- earlier revisions as previous. The earlier artifact and its files are never rewritten.
create or replace function private.worker_record_institutional_model_result_v1(p_job_id uuid,p_capability_token text,p_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);r private.institutional_model_results;context jsonb;v_artifact jsonb;scenario jsonb;c private.institutional_model_configurations;provenance jsonb;expected jsonb;opening jsonb;revenues jsonb;costs jsonb;taxes jsonb;v_tax_field text;superseded integer:=0;
begin
 if j.kind<>'agent_operation_brief' then raise exception 'institutional_result_capability_required' using errcode='42501';end if;
 select * into r from private.institutional_model_results where organization_id=j.organization_id and intake_session_id=j.intake_session_id and id=nullif(j.payload->>'message_id','')::uuid for update;
 if r.id is null then raise exception 'institutional_result_request_missing' using errcode='42501';end if;
 if r.status<>'queued' then
  if p_result->>'status' is distinct from r.status or (r.status='completed' and p_result->'artifact' is distinct from r.artifact) or (r.status='blocked' and p_result->'blockers' is distinct from r.blockers) then raise exception 'institutional_result_replay_mismatch';end if;
  return jsonb_build_object('id',r.id,'status',r.status,'replayed',true,'supersededResults',0);
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
 if r.canonical_revision_id is not null then
  with previous as (
   update private.institutional_model_results h set superseded_by=r.id
    where h.organization_id=r.organization_id and h.capital_project_id=r.capital_project_id and h.id<>r.id
      and h.status='completed' and h.superseded_by is null
      and h.canonical_revision_id is distinct from r.canonical_revision_id
    returning 1)
  select count(*) into superseded from previous;
 end if;
 return jsonb_build_object('id',r.id,'status','completed','replayed',false,'supersededResults',superseded);
end $$;

-- Revision history for the project: every recorded revision, what changed, the results produced
-- from it, and whether the approved input set has drifted since the last revision. Artifacts are
-- returned only for the current and the immediately previous revision, which is what a
-- difference between revisions needs.
create function private.read_project_revision_history_v1(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare org_id uuid; latest private.project_canonical_revisions; live jsonb; live_fingerprint text; revisions jsonb;
begin
  select organization_id into org_id from public.capital_projects where id = p_project_id;
  if org_id is null or not private.can_access_capital_project(org_id, p_project_id) then
    raise exception 'project_revision_forbidden' using errcode = '42501';
  end if;
  select * into latest from private.project_canonical_revisions
   where organization_id = org_id and capital_project_id = p_project_id order by revision_number desc limit 1;
  live := private.project_canonical_inputs(org_id, p_project_id);
  live_fingerprint := case when jsonb_typeof(live -> 'assumptions') = 'null' and jsonb_typeof(live -> 'receivablesScope') = 'null'
                                and jsonb_typeof(live -> 'documentaryRevision') = 'null'
                             then null else private.institutional_config_hash(live) end;
  select coalesce(jsonb_agg(row order by (row ->> 'revisionNumber')::integer desc), '[]'::jsonb) into revisions from (
    select jsonb_build_object(
      'id', v.id, 'revisionNumber', v.revision_number, 'parentRevisionId', v.parent_revision_id,
      'inputs', v.inputs, 'inputsFingerprint', v.inputs_fingerprint, 'changeSummary', v.change_summary,
      'approvalKind', v.approval_kind, 'approvalReference', v.approval_reference,
      'approvedBy', v.approved_by, 'approvedAt', v.approved_at,
      'isCurrent', v.id = latest.id,
      'results', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', h.id, 'status', h.status, 'configurationId', h.configuration_id,
          'configurationFingerprint', h.configuration_fingerprint, 'sourceManifestFingerprint', h.source_manifest_fingerprint,
          'producedAt', h.produced_at, 'createdAt', h.created_at, 'supersededBy', h.superseded_by,
          'isCurrent', v.id = latest.id and h.superseded_by is null and h.status = 'completed',
          'artifact', case when h.status = 'completed' and v.revision_number >= latest.revision_number - 1 then h.artifact else null end)
        order by h.created_at desc, h.id desc), '[]'::jsonb)
        from private.institutional_model_results h
        where h.organization_id = org_id and h.capital_project_id = p_project_id and h.canonical_revision_id = v.id)) as row
    from private.project_canonical_revisions v
    where v.organization_id = org_id and v.capital_project_id = p_project_id
    order by v.revision_number desc limit 12) ordered;
  return jsonb_build_object(
    'projectId', p_project_id,
    'currentRevisionId', latest.id,
    'currentRevisionNumber', latest.revision_number,
    'liveInputs', live,
    'liveInputsFingerprint', live_fingerprint,
    'pendingChange', coalesce(live_fingerprint is distinct from latest.inputs_fingerprint, false),
    'revisions', revisions);
end $$;
create function public.read_project_revision_history_v1(p_project_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$select private.read_project_revision_history_v1(p_project_id);$$;
revoke all on function private.read_project_revision_history_v1(uuid), public.read_project_revision_history_v1(uuid) from public, anon;
grant execute on function private.read_project_revision_history_v1(uuid), public.read_project_revision_history_v1(uuid) to authenticated;
