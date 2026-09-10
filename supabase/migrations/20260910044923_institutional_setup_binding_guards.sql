-- Preserve initial configuration proposals and bind source periods before review.
create or replace function private.submit_institutional_model_setup_v1(p_project_id uuid,p_expected_manifest_fingerprint text,p_configuration jsonb,p_source_reviews jsonb,p_submission_id uuid,p_locale text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.capital_projects;s public.document_intake_sessions;context jsonb;source jsonb;reviews jsonb:='[]';existing private.institutional_model_setup_submissions;stamp timestamptz:=now();result jsonb;
begin
 select * into p from public.capital_projects where id=p_project_id for update;
 if p.id is null or not private.can_access_capital_project(p.organization_id,p.id) then raise exception 'institutional_setup_forbidden' using errcode='42501';end if;
 select * into existing from private.institutional_model_setup_submissions where organization_id=p.organization_id and id=p_submission_id;
 if found then
  if existing.capital_project_id<>p.id or existing.configuration is distinct from p_configuration or existing.source_manifest_fingerprint is distinct from p_expected_manifest_fingerprint or existing.submitted_by is distinct from auth.uid() or (select jsonb_agg(value-array['reviewedBy','reviewedAt'] order by value->>'sourceDocument') from jsonb_array_elements(existing.source_reviews)) is distinct from (select jsonb_agg(value-array['reviewedBy','reviewedAt'] order by value->>'sourceDocument') from jsonb_array_elements(p_source_reviews)) then raise exception 'institutional_setup_replay_mismatch';end if;
  return jsonb_build_object('submissionId',existing.id,'status',existing.status,'replayed',true);
 end if;
 if p_submission_id is null or coalesce(p_locale,'') not in ('pt-BR','en-US') or coalesce(jsonb_typeof(p_configuration),'null')<>'object' or pg_column_size(p_configuration)>524288 or coalesce(jsonb_typeof(p_source_reviews),'null')<>'array' or jsonb_array_length(p_source_reviews) not between 1 and 1000 then raise exception 'institutional_setup_invalid';end if;
 select * into s from public.document_intake_sessions where organization_id=p.organization_id and capital_project_id=p.id order by created_at asc limit 1;
 context:=private.institutional_source_context(p.organization_id,s.id);
 if context->>'sourceManifestFingerprint' is distinct from p_expected_manifest_fingerprint then raise exception 'institutional_sources_changed' using errcode='40001';end if;
 for source in select value from jsonb_array_elements(p_source_reviews) loop
  if coalesce(jsonb_typeof(source),'null')<>'object' or source->>'amountScale' is distinct from 'units' or coalesce(source->>'currency','')!~'^[A-Z]{3}$' or coalesce(source->>'asOfDate','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or length(trim(coalesce(source#>>'{metadataEvidence,locator}',''))) not between 1 and 500 or length(trim(coalesce(source#>>'{metadataEvidence,rationale}',''))) not between 1 and 500
   or not exists(select 1 from jsonb_array_elements(context->'currentSources') actual where actual->>'sourceDocument'=source->>'sourceDocument' and actual->>'version'=source->>'version' and actual->>'hash'=source->>'hash' and actual->>'hashVerified'='true') then raise exception 'institutional_source_review_invalid';end if;
  perform (source->>'asOfDate')::date;
  reviews:=reviews||jsonb_build_array((source-array['reviewedBy','reviewedAt'])||jsonb_build_object('reviewedBy',auth.uid(),'reviewedAt',stamp));
 end loop;
 if (select count(distinct value->>'sourceDocument') from jsonb_array_elements(reviews))<>jsonb_array_length(reviews) then raise exception 'institutional_source_review_duplicate';end if;
 if exists(select 1 from public.agent_messages where id=p_submission_id) then raise exception 'institutional_submission_message_reused';end if;
 result:=private.submit_advisor_turn_v1(p.id,p_submission_id,p_locale,case when p_locale='pt-BR' then 'Revisar a configuração e as fontes do modelo financeiro.' else 'Review the financial model configuration and sources.' end);
 update public.agent_messages set metadata=metadata||jsonb_build_object('kind','institutional_model_setup','institutionalSubmissionId',p_submission_id) where organization_id=p.organization_id and id=p_submission_id;
 insert into private.institutional_model_setup_submissions(id,organization_id,capital_project_id,intake_session_id,source_manifest_fingerprint,configuration,source_reviews,submitted_by,submitted_at) values(p_submission_id,p.organization_id,p.id,s.id,p_expected_manifest_fingerprint,p_configuration,reviews,auth.uid(),stamp);
 return jsonb_build_object('submissionId',p_submission_id,'status','queued','replayed',false);
end $$;

create or replace function private.worker_record_initial_institutional_candidate_v1(p_job_id uuid,p_capability_token text,p_submission_id uuid,p_candidate jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);s private.institutional_model_setup_submissions;context jsonb;expected jsonb;assumptions jsonb;overrides jsonb;candidate_id uuid;next_revision integer;parent text;receipt jsonb;line jsonb;
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
 insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_message_id,answer_evidence) values(s.organization_id,s.capital_project_id,next_revision,expected,private.institutional_config_hash(expected),parent,'review_required',s.id,receipt) returning id into candidate_id;
 update private.institutional_model_setup_submissions set status='review_required',candidate_id=worker_record_initial_institutional_candidate_v1.candidate_id,assessment=p_candidate where organization_id=s.organization_id and id=s.id;
 return jsonb_build_object('candidateId',candidate_id,'revision',next_revision,'replayed',false);
end $$;

create function private.guard_institutional_setup_body() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.id,new.organization_id,new.capital_project_id,new.intake_session_id,new.source_manifest_fingerprint,new.configuration,new.source_reviews,new.submitted_by,new.submitted_at,new.created_at)
 is distinct from row(old.id,old.organization_id,old.capital_project_id,old.intake_session_id,old.source_manifest_fingerprint,old.configuration,old.source_reviews,old.submitted_by,old.submitted_at,old.created_at) then raise exception 'institutional_setup_body_immutable';end if;
 if old.assessment is not null and row(new.assessment,new.candidate_id,new.status) is distinct from row(old.assessment,old.candidate_id,old.status) then raise exception 'institutional_setup_assessment_immutable';end if;
 return new;
end $$;
revoke all on function private.guard_institutional_setup_body() from public,anon,authenticated;
create trigger institutional_setup_body_immutable before update on private.institutional_model_setup_submissions for each row execute function private.guard_institutional_setup_body();
