CREATE OR REPLACE FUNCTION private.submit_institutional_model_setup_v1(p_project_id uuid, p_expected_manifest_fingerprint text, p_configuration jsonb, p_source_reviews jsonb, p_submission_id uuid, p_locale text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.capital_projects;s public.document_intake_sessions;context jsonb;source jsonb;reviews jsonb:='[]';existing private.institutional_model_setup_submissions;stamp timestamptz:=now();result jsonb;
begin
 select * into p from public.capital_projects where id=p_project_id for update;
 if p.id is null or not private.can_access_capital_project(p.organization_id,p.id) then raise exception 'institutional_setup_forbidden' using errcode='42501';end if;
 perform private.assert_capital_project_review_action(p.organization_id,p.id,'prepare');
 select * into existing from private.institutional_model_setup_submissions where organization_id=p.organization_id and id=p_submission_id;
 if found then
  -- Retrying a server-compiled form may regenerate only these confirmation timestamps.
  -- Keep the original attestations while comparing every economic and author field exactly.
  if p_configuration#>'{absenceConfirmations,capex,confirmedAt}' is not null and existing.configuration#>'{absenceConfirmations,capex,confirmedAt}' is not null then p_configuration:=jsonb_set(p_configuration,'{absenceConfirmations,capex,confirmedAt}',existing.configuration#>'{absenceConfirmations,capex,confirmedAt}');end if;
  if p_configuration#>'{absenceConfirmations,debtInstruments,confirmedAt}' is not null and existing.configuration#>'{absenceConfirmations,debtInstruments,confirmedAt}' is not null then p_configuration:=jsonb_set(p_configuration,'{absenceConfirmations,debtInstruments,confirmedAt}',existing.configuration#>'{absenceConfirmations,debtInstruments,confirmedAt}');end if;
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
end $function$
