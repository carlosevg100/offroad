-- An explicit review-and-calculate action authorizes only this deterministic model result.
-- It neither invents a loan structure nor permits model calls or external distribution.
create table private.institutional_model_results(
 id uuid primary key,organization_id uuid not null,capital_project_id uuid not null,intake_session_id uuid not null,
 configuration_id uuid not null,configuration_fingerprint text not null check(configuration_fingerprint ~ '^[a-f0-9]{64}$'),
 source_manifest_fingerprint text not null check(source_manifest_fingerprint ~ '^[a-f0-9]{64}$'),
 status text not null default 'queued' check(status in ('queued','completed','blocked')),artifact jsonb,blockers jsonb not null default '[]',
 requested_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,capital_project_id) references public.capital_projects(organization_id,id),foreign key(organization_id,intake_session_id) references public.document_intake_sessions(organization_id,id),foreign key(organization_id,configuration_id) references private.institutional_model_configurations(organization_id,id),foreign key(organization_id,id) references public.agent_messages(organization_id,id),
 check((status='completed')=(artifact is not null)),check(jsonb_typeof(blockers)='array')
);
alter table private.institutional_model_results enable row level security;
alter table private.institutional_model_results force row level security;
create policy institutional_results_no_select on private.institutional_model_results for select to authenticated using(false);
create policy institutional_results_no_insert on private.institutional_model_results for insert to authenticated with check(false);
create policy institutional_results_no_update on private.institutional_model_results for update to authenticated using(false) with check(false);
create policy institutional_results_no_delete on private.institutional_model_results for delete to authenticated using(false);
revoke all on private.institutional_model_results from public,anon,authenticated;
create index institutional_results_project_idx on private.institutional_model_results(organization_id,capital_project_id,created_at desc);
create index institutional_results_session_idx on private.institutional_model_results(organization_id,intake_session_id);
create index institutional_results_config_idx on private.institutional_model_results(organization_id,configuration_id);
create index institutional_results_requester_idx on private.institutional_model_results(requested_by);
create trigger institutional_results_updated before update on private.institutional_model_results for each row execute function private.set_updated_at();
create trigger institutional_results_audit after insert or update or delete on private.institutional_model_results for each row execute function private.capture_audit_event();
create function private.guard_institutional_result_body() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'institutional_result_history_immutable';end if;
 if (to_jsonb(new)-array['status','artifact','blockers','updated_at']) is distinct from (to_jsonb(old)-array['status','artifact','blockers','updated_at']) or old.status<>'queued' or new.status not in ('completed','blocked') then raise exception 'institutional_result_immutable';end if;
 return new;end $$;
create trigger institutional_result_body before update or delete on private.institutional_model_results for each row execute function private.guard_institutional_result_body();
revoke all on function private.guard_institutional_result_body() from public,anon,authenticated;

create function private.review_institutional_configuration_and_calculate_v1(p_project_id uuid,p_candidate_id uuid,p_expected_parent_fingerprint text,p_decision text,p_expected_candidate_fingerprint text,p_request_id uuid,p_locale text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.institutional_model_configurations;r private.institutional_model_results;s public.document_intake_sessions;context jsonb;provenance jsonb;queued jsonb;
begin
 select * into c from private.institutional_model_configurations where capital_project_id=p_project_id and id=p_candidate_id;
 if c.id is null or not private.can_access_capital_project(c.organization_id,p_project_id) then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=c.organization_id and id=p_project_id for update;
 if p_request_id is null or coalesce(p_locale,'') not in ('pt-BR','en-US') or coalesce(p_decision,'') not in ('approved','rejected') then raise exception 'institutional_result_request_invalid';end if;
 select * into r from private.institutional_model_results where id=p_request_id;
 if found then
  if r.organization_id is distinct from c.organization_id or r.capital_project_id is distinct from p_project_id or r.configuration_id is distinct from c.id or r.configuration_fingerprint is distinct from p_expected_candidate_fingerprint or r.requested_by is distinct from auth.uid() or c.parent_fingerprint is distinct from p_expected_parent_fingerprint or p_decision<>'approved' then raise exception 'institutional_result_request_replay_mismatch';end if;
  return jsonb_build_object('requestId',r.id,'status',r.status,'replayed',true);
 end if;
 if c.status='review_required' then perform private.review_institutional_configuration_v1(p_project_id,p_candidate_id,p_expected_parent_fingerprint,p_decision,p_expected_candidate_fingerprint);
 elsif c.status is distinct from 'approved' or p_decision<>'approved' or c.configuration_fingerprint is distinct from p_expected_candidate_fingerprint or c.parent_fingerprint is distinct from p_expected_parent_fingerprint then raise exception 'institutional_review_stale' using errcode='40001';end if;
 if p_decision='rejected' then return jsonb_build_object('candidateId',c.id,'status','rejected');end if;
 if c.id is distinct from (select id from private.institutional_model_configurations where organization_id=c.organization_id and capital_project_id=p_project_id and status='approved' order by revision desc limit 1) then raise exception 'institutional_result_configuration_stale' using errcode='40001';end if;
 select * into s from public.document_intake_sessions where organization_id=c.organization_id and capital_project_id=p_project_id order by created_at asc limit 1;
 context:=private.institutional_source_context(c.organization_id,s.id);provenance:=private.institutional_configuration_provenance(c.organization_id,c.id);
 if provenance->>'sourceManifestFingerprint' is distinct from context->>'sourceManifestFingerprint' then raise exception 'institutional_result_sources_changed' using errcode='40001';end if;
 if exists(select 1 from public.agent_messages where id=p_request_id) then raise exception 'institutional_result_message_reused';end if;
 queued:=private.submit_advisor_turn_v1(p_project_id,p_request_id,p_locale,case when p_locale='pt-BR' then 'Calcular as demonstrações e exportar os resultados desta configuração aprovada.' else 'Calculate the financial statements and export the results of this approved configuration.' end);
 update public.agent_messages set metadata=metadata||jsonb_build_object('kind','institutional_model_refresh','institutionalResultRequestId',p_request_id,'configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint) where organization_id=c.organization_id and id=p_request_id;
 update public.processing_runs set budget=jsonb_build_object('maxCalls',0,'maxCostUsd',0) where organization_id=c.organization_id and id in (select processing_run_id from public.processing_jobs where organization_id=c.organization_id and intake_session_id=s.id and kind='agent_operation_brief' and payload->>'message_id'=p_request_id::text);
 insert into private.institutional_model_results(id,organization_id,capital_project_id,intake_session_id,configuration_id,configuration_fingerprint,source_manifest_fingerprint,requested_by) values(p_request_id,c.organization_id,p_project_id,s.id,c.id,c.configuration_fingerprint,context->>'sourceManifestFingerprint',auth.uid());
 return jsonb_build_object('requestId',p_request_id,'status','queued','replayed',false);
end $$;
create function public.review_institutional_configuration_and_calculate_v1(p_project_id uuid,p_candidate_id uuid,p_expected_parent_fingerprint text,p_decision text,p_expected_candidate_fingerprint text,p_request_id uuid,p_locale text) returns jsonb language sql security invoker set search_path='' as $$select private.review_institutional_configuration_and_calculate_v1(p_project_id,p_candidate_id,p_expected_parent_fingerprint,p_decision,p_expected_candidate_fingerprint,p_request_id,p_locale);$$;

create function private.worker_record_institutional_model_result_v1(p_job_id uuid,p_capability_token text,p_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if p_result->>'status' is distinct from 'completed' or pg_column_size(v_artifact)>8388608 or v_artifact->>'modelKind' is distinct from 'institutional' or v_artifact#>>'{institutional,exportMode}' is distinct from 'approved_snapshot' or v_artifact->>'version' is distinct from 'institutional-workbook-snapshot.v1' or v_artifact->>'fingerprint' is distinct from private.institutional_config_hash(v_artifact-'fingerprint') or v_artifact#>>'{institutional,sourceManifestFingerprint}' is distinct from r.source_manifest_fingerprint or r.source_manifest_fingerprint is distinct from context->>'sourceManifestFingerprint' or v_artifact#>>'{institutional,activeScenarioId}' is distinct from r.configuration_id::text or r.configuration_id is distinct from (select id from private.institutional_model_configurations where organization_id=r.organization_id and capital_project_id=r.capital_project_id and status='approved' order by revision desc limit 1) or coalesce(jsonb_typeof(v_artifact#>'{institutional,scenarios}'),'null')<>'array' or jsonb_array_length(v_artifact#>'{institutional,scenarios}') not between 1 and 12 then raise exception 'institutional_result_stale_or_invalid';end if;
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
create function public.worker_record_institutional_model_result_v1(p_job_id uuid,p_capability_token text,p_result jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_institutional_model_result_v1(p_job_id,p_capability_token,p_result);$$;

create function private.read_institutional_model_results_v1(p_project_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare org_id uuid;r private.institutional_model_results;context jsonb;current_id uuid;is_current boolean;
begin
 select organization_id into org_id from public.capital_projects where id=p_project_id;
 if org_id is null or not private.can_access_capital_project(org_id,p_project_id) then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 select * into r from private.institutional_model_results where organization_id=org_id and capital_project_id=p_project_id order by created_at desc,id desc limit 1;
 if r.id is null then return jsonb_build_object('projectId',p_project_id,'latest',null);end if;
 context:=private.institutional_source_context(org_id,r.intake_session_id);
 select id into current_id from private.institutional_model_configurations where organization_id=org_id and capital_project_id=p_project_id and status='approved' order by revision desc limit 1;
 is_current:=coalesce(r.configuration_id=current_id and r.source_manifest_fingerprint=context->>'sourceManifestFingerprint',false);
 return jsonb_build_object('projectId',p_project_id,'latest',jsonb_build_object('id',r.id,'status',case when not is_current then 'stale' else r.status end,'configurationId',r.configuration_id,'configurationFingerprint',r.configuration_fingerprint,'sourceManifestFingerprint',r.source_manifest_fingerprint,'artifact',case when is_current and r.status='completed' then r.artifact else null end,'blockers',r.blockers,'createdAt',r.created_at));
end $$;
create function public.read_institutional_model_results_v1(p_project_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.read_institutional_model_results_v1(p_project_id);$$;
revoke all on function private.review_institutional_configuration_and_calculate_v1(uuid,uuid,text,text,text,uuid,text),public.review_institutional_configuration_and_calculate_v1(uuid,uuid,text,text,text,uuid,text),private.worker_record_institutional_model_result_v1(uuid,text,jsonb),public.worker_record_institutional_model_result_v1(uuid,text,jsonb),private.read_institutional_model_results_v1(uuid),public.read_institutional_model_results_v1(uuid) from public,anon;
grant execute on function private.review_institutional_configuration_and_calculate_v1(uuid,uuid,text,text,text,uuid,text),public.review_institutional_configuration_and_calculate_v1(uuid,uuid,text,text,text,uuid,text),private.worker_record_institutional_model_result_v1(uuid,text,jsonb),public.worker_record_institutional_model_result_v1(uuid,text,jsonb),private.read_institutional_model_results_v1(uuid),public.read_institutional_model_results_v1(uuid) to authenticated;

create or replace function private.worker_load_institutional_model_context_v1(p_job_id uuid,p_capability_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);project_id uuid;context jsonb;configs jsonb;latest_sources jsonb;
begin
 if j.kind not in ('case_analysis','agent_operation_brief') then raise exception 'institutional_capability_required' using errcode='42501';end if;
 select capital_project_id into project_id from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 if project_id is null then raise exception 'institutional_project_required';end if;
 context:=private.institutional_source_context(j.organization_id,j.intake_session_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'revision',c.revision,'fingerprint',c.configuration_fingerprint,'configuration',c.configuration,'reviewedBy',c.reviewed_by,'reviewedAt',c.reviewed_at,'sourceBindings',p.provenance->'sourceBindings') order by c.revision),'[]') into configs
 from (select * from private.institutional_model_configurations where organization_id=j.organization_id and capital_project_id=project_id and status='approved' order by revision desc limit 12) c
 cross join lateral(select private.institutional_configuration_provenance(c.organization_id,c.id) provenance) p
 where p.provenance->>'sourceManifestFingerprint'=context->>'sourceManifestFingerprint';
 latest_sources:=coalesce(configs->(jsonb_array_length(configs)-1)->'sourceBindings','[]'::jsonb);
 return context||jsonb_build_object('modelResultRequest',(select jsonb_build_object('id',r.id,'configurationId',r.configuration_id,'configurationFingerprint',r.configuration_fingerprint,'sourceManifestFingerprint',r.source_manifest_fingerprint,'status',r.status,'artifact',r.artifact,'blockers',r.blockers) from private.institutional_model_results r where r.organization_id=j.organization_id and r.intake_session_id=j.intake_session_id and r.capital_project_id=project_id and j.kind='agent_operation_brief' and r.id=nullif(j.payload->>'message_id','')::uuid),'projectId',project_id,'approvedConfigurations',configs,'reviewedSources',latest_sources,'pendingSetup',(select jsonb_build_object('submissionId',s.id,'configuration',s.configuration,'sourceReviews',s.source_reviews,'submittedBy',s.submitted_by,'submittedAt',s.submitted_at,'sourceManifestFingerprint',s.source_manifest_fingerprint) from private.institutional_model_setup_submissions s where s.organization_id=j.organization_id and s.capital_project_id=project_id and s.intake_session_id=j.intake_session_id and s.id=nullif(j.payload->>'message_id','')::uuid and j.kind='agent_operation_brief'));
end $$;

create or replace function private.submit_institutional_model_setup_v1(p_project_id uuid,p_expected_manifest_fingerprint text,p_configuration jsonb,p_source_reviews jsonb,p_submission_id uuid,p_locale text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.capital_projects;s public.document_intake_sessions;context jsonb;source jsonb;reviews jsonb:='[]';existing private.institutional_model_setup_submissions;stamp timestamptz:=now();result jsonb;
begin
 select * into p from public.capital_projects where id=p_project_id for update;
 if p.id is null or not private.can_access_capital_project(p.organization_id,p.id) then raise exception 'institutional_setup_forbidden' using errcode='42501';end if;
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
end $$;

