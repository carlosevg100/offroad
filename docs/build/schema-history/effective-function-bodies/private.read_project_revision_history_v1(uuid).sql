CREATE OR REPLACE FUNCTION private.read_project_revision_history_v1(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org_id uuid; latest private.project_canonical_revisions; live jsonb; live_fingerprint text; revisions jsonb;
begin
 perform private.require_resource_access_v1(p_project_id,'read');
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
          'isCurrent', v.id = latest.id and h.superseded_by is null and h.status = 'completed' and private.institutional_result_established_v1(h.organization_id, h.id),
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
end $function$
