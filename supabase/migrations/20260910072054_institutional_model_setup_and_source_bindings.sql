-- A typed setup form is a proposal, never an approved model. Its worker consumes only
-- current, reviewed, source-bound historical candidates; it does not invent an opportunity.
create table private.institutional_model_setup_submissions (
 id uuid primary key, organization_id uuid not null, capital_project_id uuid not null,intake_session_id uuid not null,
 source_manifest_fingerprint text not null check(source_manifest_fingerprint ~ '^[a-f0-9]{64}$'),
 configuration jsonb not null check(jsonb_typeof(configuration)='object'),source_reviews jsonb not null check(jsonb_typeof(source_reviews)='array'),
 status text not null default 'queued' check(status in ('queued','missing_inputs','calculation_blocked','review_required')),
 candidate_id uuid,assessment jsonb,submitted_by uuid not null references auth.users(id),submitted_at timestamptz not null default now(),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,capital_project_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,intake_session_id) references public.document_intake_sessions(organization_id,id),
 foreign key(organization_id,candidate_id) references private.institutional_model_configurations(organization_id,id),
 foreign key(organization_id,id) references public.agent_messages(organization_id,id)
);
alter table private.institutional_model_setup_submissions enable row level security;
alter table private.institutional_model_setup_submissions force row level security;
create policy institutional_setup_no_select on private.institutional_model_setup_submissions for select to authenticated using(false);
create policy institutional_setup_no_insert on private.institutional_model_setup_submissions for insert to authenticated with check(false);
create policy institutional_setup_no_update on private.institutional_model_setup_submissions for update to authenticated using(false) with check(false);
create policy institutional_setup_no_delete on private.institutional_model_setup_submissions for delete to authenticated using(false);
revoke all on private.institutional_model_setup_submissions from public,anon,authenticated;
create index institutional_setup_project_idx on private.institutional_model_setup_submissions(organization_id,capital_project_id,submitted_at desc);
create index institutional_setup_session_idx on private.institutional_model_setup_submissions(organization_id,intake_session_id);
create index institutional_setup_candidate_idx on private.institutional_model_setup_submissions(organization_id,candidate_id) where candidate_id is not null;
create index institutional_setup_submitter_idx on private.institutional_model_setup_submissions(submitted_by);
create trigger institutional_setup_updated before update on private.institutional_model_setup_submissions for each row execute function private.set_updated_at();
create trigger institutional_setup_audit after insert or update or delete on private.institutional_model_setup_submissions for each row execute function private.capture_audit_event();

create function private.institutional_source_context(p_org uuid,p_session uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sources jsonb;candidates jsonb;body jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('sourceDocument',d.id,'version',d.document_version::text,'hash',d.sha256,'hashVerified',d.sha256_verified_at is not null and d.processing_status='ready' and d.scan_result->>'verdict'='clean','originalName',d.original_name) order by d.id),'[]'::jsonb) into sources from public.source_documents d where d.organization_id=p_org and d.intake_session_id=p_session;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'label',c.label,'field_path',c.field_path,'normalized_value',c.normalized_value#>>'{}','value_type',c.value_type,'source_document_id',c.source_document_id,'evidence_rank',c.evidence_rank,'information_class',c.information_class,'confidence',c.confidence,'period_start',c.period_start,'period_end',c.period_end,'entity_name',c.entity_name,'entity_scope',c.entity_scope,'source_anchor',c.source_anchor,'anchor_verified',c.anchor_verified,'review_state',c.review_state,'reviewed_by',c.reviewed_by,'reviewed_at',c.reviewed_at,'currency',c.currency,'unit',c.unit,'value_scale',c.value_scale,'extraction_document_version',d.document_version,'extraction_source_sha256',d.sha256) order by c.id),'[]'::jsonb) into candidates
 from public.intake_field_candidates c join public.source_documents d on d.organization_id=c.organization_id and d.id=c.source_document_id and d.intake_session_id=c.intake_session_id
 where c.organization_id=p_org and c.intake_session_id=p_session and c.review_state='accepted' and c.anchor_verified and c.value_type='number' and c.field_group in ('historical_financials','interim_financials') and c.entity_name is not null and c.entity_scope in ('consolidated','standalone','segment') and c.period_end is not null and d.sha256_verified_at is not null and d.processing_status='ready' and d.scan_result->>'verdict'='clean'
 and exists(select 1 from public.processing_jobs j where j.organization_id=c.organization_id and j.intake_session_id=c.intake_session_id and j.source_document_id=c.source_document_id and j.processing_run_id=c.processing_run_id and j.kind='document_pipeline' and j.status='succeeded' and j.payload->>'sha256'=d.sha256 and j.payload->>'document_version'=d.document_version::text);
 if jsonb_array_length(sources)>1000 or jsonb_array_length(candidates)>5000 then raise exception 'institutional_source_scope_refinement_required';end if;
 body:=jsonb_build_object('currentSources',sources,'candidates',candidates);
 return body||jsonb_build_object('sourceManifestFingerprint',private.institutional_config_hash(body));
end $$;
revoke all on function private.institutional_source_context(uuid,uuid) from public,anon,authenticated;

create function private.read_institutional_model_setup_v1(p_project_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.capital_projects;s public.document_intake_sessions;result jsonb;
begin
 select * into p from public.capital_projects where id=p_project_id;
 if p.id is null or not private.can_access_capital_project(p.organization_id,p.id) then raise exception 'institutional_setup_forbidden' using errcode='42501';end if;
 select * into s from public.document_intake_sessions where organization_id=p.organization_id and capital_project_id=p.id order by created_at asc limit 1;
 if s.id is null then raise exception 'institutional_session_required';end if;
 result:=private.institutional_source_context(p.organization_id,s.id);
 return result||jsonb_build_object('projectId',p.id,'intakeSessionId',s.id,'configurationReviews',private.read_institutional_configuration_reviews_v1(p.id),'latestSubmission',(select jsonb_build_object('submissionId',id,'status',status,'candidateId',candidate_id,'assessment',assessment) from private.institutional_model_setup_submissions where organization_id=p.organization_id and capital_project_id=p.id order by submitted_at desc limit 1));
end $$;
create function public.read_institutional_model_setup_v1(p_project_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.read_institutional_model_setup_v1(p_project_id);$$;

create function private.submit_institutional_model_setup_v1(p_project_id uuid,p_expected_manifest_fingerprint text,p_configuration jsonb,p_source_reviews jsonb,p_submission_id uuid,p_locale text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 result:=private.submit_advisor_turn_v1(p.id,p_submission_id,p_locale,case when p_locale='pt-BR' then 'Revisar a configuração e as fontes do modelo financeiro.' else 'Review the financial model configuration and sources.' end);
 update public.agent_messages set metadata=metadata||jsonb_build_object('kind','institutional_model_setup','institutionalSubmissionId',p_submission_id) where organization_id=p.organization_id and id=p_submission_id;
 insert into private.institutional_model_setup_submissions(id,organization_id,capital_project_id,intake_session_id,source_manifest_fingerprint,configuration,source_reviews,submitted_by,submitted_at) values(p_submission_id,p.organization_id,p.id,s.id,p_expected_manifest_fingerprint,p_configuration,reviews,auth.uid(),stamp);
 return jsonb_build_object('submissionId',p_submission_id,'status','queued','replayed',false);
end $$;
create function public.submit_institutional_model_setup_v1(p_project_id uuid,p_expected_manifest_fingerprint text,p_configuration jsonb,p_source_reviews jsonb,p_submission_id uuid,p_locale text) returns jsonb language sql security invoker set search_path='' as $$select private.submit_institutional_model_setup_v1(p_project_id,p_expected_manifest_fingerprint,p_configuration,p_source_reviews,p_submission_id,p_locale);$$;

create function private.institutional_configuration_provenance(p_org uuid,p_configuration uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with recursive history as (
  select c.*,0 depth from private.institutional_model_configurations c where c.organization_id=p_org and c.id=p_configuration
  union all select p.*,h.depth+1 from history h join private.institutional_model_configurations p on p.organization_id=h.organization_id and p.capital_project_id=h.capital_project_id and p.configuration_fingerprint=h.parent_fingerprint where h.depth<100
 ) select answer_evidence from history where answer_evidence->>'kind'='initial_configuration' order by depth limit 1;
$$;
revoke all on function private.institutional_configuration_provenance(uuid,uuid) from public,anon,authenticated;
create function private.worker_load_institutional_model_context_v1(p_job_id uuid,p_capability_token text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 return context||jsonb_build_object('projectId',project_id,'approvedConfigurations',configs,'reviewedSources',latest_sources,'pendingSetup',(select jsonb_build_object('submissionId',s.id,'configuration',s.configuration,'sourceReviews',s.source_reviews,'submittedBy',s.submitted_by,'submittedAt',s.submitted_at,'sourceManifestFingerprint',s.source_manifest_fingerprint) from private.institutional_model_setup_submissions s where s.organization_id=j.organization_id and s.capital_project_id=project_id and s.intake_session_id=j.intake_session_id and s.id=nullif(j.payload->>'message_id','')::uuid and j.kind='agent_operation_brief'));
end $$;
create function public.worker_load_institutional_model_context_v1(p_job_id uuid,p_capability_token text) returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_institutional_model_context_v1(p_job_id,p_capability_token);$$;

create function private.worker_record_initial_institutional_candidate_v1(p_job_id uuid,p_capability_token text,p_submission_id uuid,p_candidate jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if not exists(select 1 from jsonb_array_elements(context->'candidates') c where c->>'field_path'=line->>'fieldPath' and c->>'source_document_id'=line->>'sourceDocument' and c->>'period_end'=line->>'periodEnd' and c->>'entity_name'=line->>'entityName' and c->>'entity_scope'=line->>'entityScope' and c->>'extraction_source_sha256'=line->>'sourceHash' and c->>'extraction_document_version'=line->>'sourceVersion' and c->'source_anchor'=line->'anchor' and (c->>'normalized_value')::numeric=(line->>'value')::numeric) then raise exception 'institutional_initial_lineage_unbound';end if;
 end loop;
 select configuration_fingerprint into parent from private.institutional_model_configurations where organization_id=s.organization_id and capital_project_id=s.capital_project_id and status='approved' order by revision desc limit 1;
 select coalesce(max(revision),0)+1 into next_revision from private.institutional_model_configurations where organization_id=s.organization_id and capital_project_id=s.capital_project_id;
 receipt:=jsonb_build_object('kind','initial_configuration','submissionId',s.id,'sourceManifestFingerprint',s.source_manifest_fingerprint,'sourceBindings',s.source_reviews,'lineage',p_candidate->'lineage','inputFingerprint',p_candidate->>'inputFingerprint','resultFingerprint',p_candidate->>'resultFingerprint','review',p_candidate->'review','submittedBy',s.submitted_by,'submittedAt',s.submitted_at);
 insert into private.institutional_model_configurations(organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_message_id,answer_evidence) values(s.organization_id,s.capital_project_id,next_revision,expected,private.institutional_config_hash(expected),parent,'review_required',s.id,receipt) returning id into candidate_id;
 update private.institutional_model_setup_submissions set status='review_required',candidate_id=worker_record_initial_institutional_candidate_v1.candidate_id,assessment=p_candidate where organization_id=s.organization_id and id=s.id;
 return jsonb_build_object('candidateId',candidate_id,'revision',next_revision,'replayed',false);
end $$;
create function public.worker_record_initial_institutional_candidate_v1(p_job_id uuid,p_capability_token text,p_submission_id uuid,p_candidate jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_initial_institutional_candidate_v1(p_job_id,p_capability_token,p_submission_id,p_candidate);$$;

-- Source edits invalidate approval of both an initial model and its later assumption scenarios.
alter function private.review_institutional_configuration_v1(uuid,uuid,text,text,text) rename to review_institutional_configuration_before_sources_v1;
revoke all on function private.review_institutional_configuration_before_sources_v1(uuid,uuid,text,text,text) from public,anon,authenticated;
create function private.review_institutional_configuration_v1(p_project_id uuid,p_candidate_id uuid,p_expected_parent_fingerprint text,p_decision text,p_expected_candidate_fingerprint text) returns jsonb language plpgsql security definer set search_path='' as $$
declare org_id uuid;session_id uuid;provenance jsonb;current_context jsonb;
begin
 select organization_id into org_id from public.capital_projects where id=p_project_id;
 if org_id is null or not private.can_access_capital_project(org_id,p_project_id) then raise exception 'institutional_review_forbidden' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=org_id and id=p_project_id for update;
 provenance:=private.institutional_configuration_provenance(org_id,p_candidate_id);
 if p_decision='approved' and provenance is not null then
  select intake_session_id into session_id from private.institutional_model_setup_submissions where organization_id=org_id and id=(provenance->>'submissionId')::uuid and capital_project_id=p_project_id;
  current_context:=private.institutional_source_context(org_id,session_id);
  if provenance->>'sourceManifestFingerprint' is distinct from current_context->>'sourceManifestFingerprint' then raise exception 'institutional_review_sources_changed' using errcode='40001';end if;
 end if;
 return private.review_institutional_configuration_before_sources_v1(p_project_id,p_candidate_id,p_expected_parent_fingerprint,p_decision,p_expected_candidate_fingerprint);
end $$;
revoke all on function private.read_institutional_model_setup_v1(uuid),public.read_institutional_model_setup_v1(uuid),private.submit_institutional_model_setup_v1(uuid,text,jsonb,jsonb,uuid,text),public.submit_institutional_model_setup_v1(uuid,text,jsonb,jsonb,uuid,text),private.worker_load_institutional_model_context_v1(uuid,text),public.worker_load_institutional_model_context_v1(uuid,text),private.worker_record_initial_institutional_candidate_v1(uuid,text,uuid,jsonb),public.worker_record_initial_institutional_candidate_v1(uuid,text,uuid,jsonb),private.review_institutional_configuration_v1(uuid,uuid,text,text,text) from public,anon;
grant execute on function private.read_institutional_model_setup_v1(uuid),public.read_institutional_model_setup_v1(uuid),private.submit_institutional_model_setup_v1(uuid,text,jsonb,jsonb,uuid,text),public.submit_institutional_model_setup_v1(uuid,text,jsonb,jsonb,uuid,text),private.worker_load_institutional_model_context_v1(uuid,text),public.worker_load_institutional_model_context_v1(uuid,text),private.worker_record_initial_institutional_candidate_v1(uuid,text,uuid,jsonb),public.worker_record_initial_institutional_candidate_v1(uuid,text,uuid,jsonb),private.review_institutional_configuration_v1(uuid,uuid,text,text,text) to authenticated;
