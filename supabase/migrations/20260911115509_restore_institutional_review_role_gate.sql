-- Binding the canonical revision re-emitted this command from its pre-role-gate body and silently
-- dropped the approve/return gate that `20260910230211_project_review_roles.sql` had patched in.
-- `supabase/tests/project_review_roles.sql` caught it on a database built from scratch. The gate is
-- restored here, inline and in the same place, with the canonical revision binding kept.
--
-- The preparer of a candidate is the person whose setup submission produced it, so an analyst who
-- prepared a configuration still cannot approve it alone unless the project allows self-approval.
-- A candidate that came from an imported workbook has no setup submission, and its own approval
-- already ran that check against the person who uploaded the file.
create or replace function private.review_institutional_configuration_and_calculate_v1(p_project_id uuid,p_candidate_id uuid,p_expected_parent_fingerprint text,p_decision text,p_expected_candidate_fingerprint text,p_request_id uuid,p_locale text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.institutional_model_configurations;r private.institutional_model_results;s public.document_intake_sessions;context jsonb;provenance jsonb;queued jsonb;canonical private.project_canonical_revisions;
begin
 select * into c from private.institutional_model_configurations where capital_project_id=p_project_id and id=p_candidate_id;
 if c.id is null or not private.can_access_capital_project(c.organization_id,p_project_id) then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=c.organization_id and id=p_project_id for update;
 perform private.assert_capital_project_review_action(c.organization_id,p_project_id,case when p_decision='approved' then 'approve' else 'return' end,
   (select sub.submitted_by from private.institutional_model_setup_submissions sub where sub.organization_id=c.organization_id and sub.candidate_id=c.id order by sub.submitted_at desc limit 1));
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
