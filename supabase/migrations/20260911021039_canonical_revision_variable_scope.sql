-- Binding the canonical revision introduced a local named `revision` into two commands that also
-- order configurations by their `revision` column, which makes that reference ambiguous and breaks
-- the approve-and-calculate path at run time. Same behaviour, unambiguous names.
create or replace function private.review_institutional_configuration_and_calculate_v1(p_project_id uuid,p_candidate_id uuid,p_expected_parent_fingerprint text,p_decision text,p_expected_candidate_fingerprint text,p_request_id uuid,p_locale text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.institutional_model_configurations;r private.institutional_model_results;s public.document_intake_sessions;context jsonb;provenance jsonb;queued jsonb;canonical private.project_canonical_revisions;
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
 if c.id is distinct from (select approved.id from private.institutional_model_configurations approved where approved.organization_id=c.organization_id and approved.capital_project_id=p_project_id and approved.status='approved' order by approved.revision desc limit 1) then raise exception 'institutional_result_configuration_stale' using errcode='40001';end if;
 select * into s from public.document_intake_sessions where organization_id=c.organization_id and capital_project_id=p_project_id order by created_at asc limit 1;
 context:=private.institutional_source_context(c.organization_id,s.id);provenance:=private.institutional_configuration_provenance(c.organization_id,c.id);
 if provenance->>'sourceManifestFingerprint' is distinct from context->>'sourceManifestFingerprint' then raise exception 'institutional_result_sources_changed' using errcode='40001';end if;
 if exists(select 1 from public.agent_messages where id=p_request_id) then raise exception 'institutional_result_message_reused';end if;
 canonical:=private.record_project_canonical_revision_v1(c.organization_id,p_project_id);
 queued:=private.submit_advisor_turn_v1(p_project_id,p_request_id,p_locale,case when p_locale='pt-BR' then 'Calcular as demonstrações e exportar os resultados desta configuração aprovada.' else 'Calculate the financial statements and export the results of this approved configuration.' end);
 update public.agent_messages set metadata=metadata||jsonb_build_object('kind','institutional_model_refresh','institutionalResultRequestId',p_request_id,'configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint,'canonicalRevisionId',canonical.id) where organization_id=c.organization_id and id=p_request_id;
 update public.processing_runs set budget=jsonb_build_object('maxCalls',0,'maxCostUsd',0) where organization_id=c.organization_id and id in (select processing_run_id from public.processing_jobs where organization_id=c.organization_id and intake_session_id=s.id and kind='agent_operation_brief' and payload->>'message_id'=p_request_id::text);
 insert into private.institutional_model_results(id,organization_id,capital_project_id,intake_session_id,configuration_id,configuration_fingerprint,source_manifest_fingerprint,requested_by,canonical_revision_id) values(p_request_id,c.organization_id,p_project_id,s.id,c.id,c.configuration_fingerprint,context->>'sourceManifestFingerprint',auth.uid(),canonical.id);
 return jsonb_build_object('requestId',p_request_id,'status','queued','replayed',false,'revisionId',canonical.id);
end $$;

create or replace function private.propagate_project_canonical_revision_v1(p_project_id uuid, p_request_id uuid, p_locale text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.capital_projects; c private.institutional_model_configurations; s public.document_intake_sessions;
        canonical private.project_canonical_revisions; existing private.institutional_model_results;
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
  canonical := private.record_project_canonical_revision_v1(p.organization_id, p.id);
  -- A repeated propagation of the same revision never produces a second output.
  select * into existing from private.institutional_model_results
   where organization_id = p.organization_id and capital_project_id = p.id
     and canonical_revision_id = canonical.id and status in ('queued', 'completed')
   order by created_at desc, id desc limit 1;
  if existing.id is not null then
    return jsonb_build_object('status', existing.status, 'resultId', existing.id,
      'revisionId', canonical.id, 'replayed', true);
  end if;
  select * into c from private.institutional_model_configurations approved
   where approved.organization_id = p.organization_id and approved.capital_project_id = p.id and approved.status = 'approved'
   order by approved.revision desc limit 1;
  if c.id is null then
    return jsonb_build_object('status', 'no_dependent_result', 'resultId', null, 'revisionId', canonical.id, 'replayed', false);
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
      'configurationId', c.id, 'configurationFingerprint', c.configuration_fingerprint, 'canonicalRevisionId', canonical.id)
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
    context ->> 'sourceManifestFingerprint', auth.uid(), canonical.id);
  return jsonb_build_object('status', 'queued', 'resultId', p_request_id, 'revisionId', canonical.id, 'replayed', false);
end $$;
