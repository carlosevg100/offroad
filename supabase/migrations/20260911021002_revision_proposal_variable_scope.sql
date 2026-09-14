-- The approval path declared a local named `revision`, which shadows the configuration column of
-- the same name when the candidate is inserted. Same behaviour, unambiguous names.
create or replace function private.review_institutional_revision_proposal_v1(
  p_proposal_id uuid, p_decision text, p_expected_structure_fingerprint text, p_request_id uuid, p_locale text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pr private.institutional_revision_proposals; c private.institutional_model_configurations;
        canonical private.project_canonical_revisions; candidate_id uuid := gen_random_uuid();
        next_revision integer; config jsonb; entry jsonb; index integer; fingerprint text; calculated jsonb;
begin
  select * into pr from private.institutional_revision_proposals where id = p_proposal_id;
  if pr.id is null or not private.can_access_capital_project(pr.organization_id, pr.capital_project_id) then
    raise exception 'institutional_revision_proposal_forbidden' using errcode = '42501';
  end if;
  if coalesce(p_decision, '') not in ('approved', 'rejected') then raise exception 'institutional_revision_proposal_invalid'; end if;
  perform private.assert_capital_project_review_action(pr.organization_id, pr.capital_project_id,
    case when p_decision = 'approved' then 'approve' else 'return' end, pr.prepared_by);
  perform 1 from public.capital_projects where organization_id = pr.organization_id and id = pr.capital_project_id for update;
  select * into pr from private.institutional_revision_proposals where id = p_proposal_id for update;
  if pr.status <> 'proposed' or pr.structure_fingerprint is distinct from p_expected_structure_fingerprint then
    raise exception 'institutional_revision_proposal_stale' using errcode = '40001';
  end if;
  if p_decision = 'rejected' then
    update private.institutional_revision_proposals set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
     where id = pr.id;
    return jsonb_build_object('proposalId', pr.id, 'status', 'rejected');
  end if;
  if p_request_id is null or coalesce(p_locale, '') not in ('pt-BR', 'en-US') then
    raise exception 'institutional_revision_proposal_invalid';
  end if;
  select * into canonical from private.project_canonical_revisions
   where organization_id = pr.organization_id and capital_project_id = pr.capital_project_id
   order by revision_number desc limit 1;
  select * into c from private.institutional_model_configurations
   where organization_id = pr.organization_id and capital_project_id = pr.capital_project_id and status = 'approved'
   order by revision desc limit 1;
  if canonical.id is distinct from pr.canonical_revision_id or c.id is distinct from pr.configuration_id
     or c.configuration_fingerprint is distinct from pr.configuration_fingerprint then
    raise exception 'institutional_revision_proposal_stale' using errcode = '40001';
  end if;
  config := c.configuration;
  for entry in select value from jsonb_array_elements(pr.changes) loop
    select ord - 1 into index from jsonb_array_elements(config #> '{assumptionBook,assumptions}') with ordinality a(value, ord)
     where value ->> 'id' = entry ->> 'assumptionId';
    if index is null
       or config #>> array['assumptionBook', 'assumptions', index::text, 'values', entry ->> 'period'] is distinct from entry ->> 'approved' then
      raise exception 'institutional_revision_proposal_stale' using errcode = '40001';
    end if;
    -- The value moves and its provenance moves with it: this is a reviewed scenario premise, not
    -- something the company's documents said.
    config := jsonb_set(config, array['assumptionBook', 'assumptions', index::text],
      (config #> array['assumptionBook', 'assumptions', index::text]) || jsonb_build_object(
        'values', (config #> array['assumptionBook', 'assumptions', index::text, 'values'])
                  || jsonb_build_object(entry ->> 'period', entry ->> 'proposed'),
        'sourceType', 'offroad_scenario', 'evidence', '[]'::jsonb, 'confidence', 'low',
        'rationale', 'Value proposed in the exported workbook and approved in review; an assumption, not a company statement.',
        'methodology', 'Imported from the approved editable workbook; proposal ' || pr.id::text || '.'));
  end loop;
  fingerprint := private.institutional_config_hash(config);
  if exists (select 1 from private.institutional_model_configurations
              where organization_id = pr.organization_id and capital_project_id = pr.capital_project_id
                and configuration_fingerprint = fingerprint) then
    raise exception 'institutional_revision_proposal_duplicate' using errcode = '40001';
  end if;
  select coalesce(max(existing.revision), 0) + 1 into next_revision
    from private.institutional_model_configurations existing
   where existing.organization_id = pr.organization_id and existing.capital_project_id = pr.capital_project_id;
  insert into private.institutional_model_configurations(
    id, organization_id, capital_project_id, revision, configuration, configuration_fingerprint, parent_fingerprint, status, answer_evidence)
  values (candidate_id, pr.organization_id, pr.capital_project_id, next_revision,
    config, fingerprint, c.configuration_fingerprint, 'review_required',
    jsonb_build_object('kind', 'imported_workbook_proposal', 'proposalId', pr.id,
      'uploadFingerprint', pr.upload_fingerprint, 'structureFingerprint', pr.structure_fingerprint,
      'artifactFingerprint', pr.artifact_fingerprint, 'changes', pr.changes));
  update private.institutional_revision_proposals
     set status = 'approved', candidate_configuration_id = candidate_id, reviewed_by = auth.uid(), reviewed_at = now()
   where id = pr.id;
  -- The approved proposal now walks the ordinary path: review the candidate, record the canonical
  -- revision, queue the deterministic recompute.
  calculated := private.review_institutional_configuration_and_calculate_v1(
    pr.capital_project_id, candidate_id, c.configuration_fingerprint, 'approved', fingerprint, p_request_id, p_locale);
  return jsonb_build_object('proposalId', pr.id, 'status', 'approved', 'candidateConfigurationId', candidate_id,
    'configurationFingerprint', fingerprint, 'calculation', calculated);
end $$;
