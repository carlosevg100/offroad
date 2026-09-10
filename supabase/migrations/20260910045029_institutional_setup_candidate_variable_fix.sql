-- Distinguish the returned candidate variable from the persisted candidate_id column.
create or replace function private.worker_record_initial_institutional_candidate_v1(p_job_id uuid,p_capability_token text,p_submission_id uuid,p_candidate jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);s private.institutional_model_setup_submissions;context jsonb;expected jsonb;assumptions jsonb;overrides jsonb;v_candidate_id uuid;next_revision integer;parent text;receipt jsonb;line jsonb;
begin
 if j.kind<>'agent_operation_brief' or j.payload->>'message_id' is distinct from p_submission_id::text then raise exception 'institutional_setup_job_mismatch' using errcode='42501';end if;
 select * into s from private.institutional_model_setup_submissions where organization_id=j.organization_id and intake_session_id=j.intake_session_id and id=p_submission_id for update;
 if s.id is null then raise exception 'institutional_setup_not_found';end if;
 perform 1 from public.capital_projects where organization_id=s.organization_id and id=s.capital_project_id for update;
 if s.assessment is not null then
  if s.assessment is distinct from p_candidate then raise exception 'institutional_setup_assessment_replay_mismatch';end if;
  return jsonb_build_object('candidateId',s.candidate_id,'revision',(select revision from private.institutional_model_configurations where organization_id=s.organization_id and id=s.candidate_id),'replayed',true);
 end if;
 context:=private.institutional_source_context(s.organization_id,s.intake_session_id);
 if s.source_manifest_fingerprint is distinct from context->>'sourceManifestFingerprint' then raise exception 'institutional_setup_sources_changed' using errcode='40001';end if;
 if p_candidate->>'willExecute' is distinct from 'false' or coalesce(p_candidate->>'status','') not in ('review_required','missing_inputs','calculation_blocked') then raise exception 'institutional_setup_assessment_invalid';end if;
 if p_candidate->>'status'<>'review_required' then
  update private.institutional_model_setup_submissions set status=p_candidate->>'status',assessment=p_candidate where organization_id=s.organization_id and id=s.id;
  return jsonb_build_object('candidateId',null,'revision',null,'replayed',false);
 end if;
 select jsonb_agg(value||jsonb_build_object('sourceType','offroad_scenario','confidence','low','evidence','[]'::jsonb) order by ord),jsonb_agg(jsonb_build_object('assumptionId',value->>'id','values',value->'values','rationale',value->>'rationale','requestedBy',s.submitted_by,'createdAt',s.submitted_at) order by ord) into assumptions,overrides from jsonb_array_elements(s.configuration#>'{assumptionBook,assumptions}') with ordinality a(value,ord);
 expected:=jsonb_set(jsonb_set(s.configuration,'{assumptionBook,assumptions}',assumptions),'{assumptionBook,overrides}',overrides,true);
 if p_candidate->'configuration' is distinct from expected or p_candidate->>'configurationFingerprint' is distinct from private.institutional_config_hash(expected)
  or p_candidate->'sourceBindings' is distinct from s.source_reviews or p_candidate#>>'{submission,id}' is distinct from s.id::text or p_candidate#>>'{submission,actorId}' is distinct from s.submitted_by::text or (p_candidate#>>'{submission,submittedAt}')::timestamptz is distinct from s.submitted_at
  or coalesce(p_candidate->>'inputFingerprint','')!~'^[a-f0-9]{64}$' or coalesce(p_candidate->>'resultFingerprint','')!~'^[a-f0-9]{64}$' or coalesce(p_candidate#>>'{review,status}','') not in ('review_required','ready_for_human_review')
  or coalesce(jsonb_typeof(p_candidate->'lineage'),'null')<>'array' or jsonb_array_length(p_candidate->'lineage')<1 then raise exception 'institutional_initial_candidate_invalid';end if;
 for line in select value from jsonb_array_elements(p_candidate->'lineage') loop
  if not exists(select 1 from jsonb_array_elements(context->'candidates') c where c->>'field_path'=line->>'fieldPath' and c->>'source_document_id'=line->>'sourceDocument' and c->>'period_end'=line->>'periodEnd' and (c->>'period_start') is not distinct from (line->>'periodStart') and c->>'entity_name'=line->>'entityName' and c->>'entity_scope'=line->>'entityScope' and c->>'extraction_source_sha256'=line->>'sourceHash' and c->>'extraction_document_version'=line->>'sourceVersion' and c->'source_anchor'=line->'anchor' and (c->>'normalized_value')::numeric=(line->>'value')::numeric and exists(select 1 from jsonb_array_elements(s.source_reviews) sr where sr->>'sourceDocument'=line->>'sourceDocument' and sr->>'asOfDate'=line->>'sourceAsOfDate' and (nullif(c->>'currency','') is null or c->>'currency'=sr->>'currency'))) then raise exception 'institutional_initial_lineage_unbound';end if;
 end loop;
 select configuration_fingerprint into parent from private.institutional_model_configurations where organization_id=s.organization_id and capital_project_id=s.capital_project_id and status='approved' order by revision desc limit 1;
 select coalesce(max(revision),0)+1 into next_revision from private.institutional_model_configurations where organization_id=s.organization_id and capital_project_id=s.capital_project_id;
 receipt:=jsonb_build_object('kind','initial_configuration','submissionId',s.id,'sourceManifestFingerprint',s.source_manifest_fingerprint,'sourceBindings',s.source_reviews,'lineage',p_candidate->'lineage','inputFingerprint',p_candidate->>'inputFingerprint','resultFingerprint',p_candidate->>'resultFingerprint','review',p_candidate->'review','submittedBy',s.submitted_by,'submittedAt',s.submitted_at);
 insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_message_id,answer_evidence) values(s.organization_id,s.capital_project_id,next_revision,expected,private.institutional_config_hash(expected),parent,'review_required',s.id,receipt) returning id into v_candidate_id;
 update private.institutional_model_setup_submissions set status='review_required',candidate_id=v_candidate_id,assessment=p_candidate where organization_id=s.organization_id and id=s.id;
 return jsonb_build_object('candidateId',v_candidate_id,'revision',next_revision,'replayed',false);
end $$;

