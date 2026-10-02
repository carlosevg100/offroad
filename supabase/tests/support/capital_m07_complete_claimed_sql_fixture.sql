-- Native completion for an ALREADY CLAIMED synthetic M07 SQL regression job.
-- Calls real recipe/capture/publication/license/dispatch/outcome/accepted/commit commands.
-- storage.objects rows below are SQL transaction fixtures, not HTTP byte-erasure evidence;
-- the separate native SDK gate proves actual Storage upload/read/delete/HEAD/ACK.
-- Caller defines transaction-local offroad_test.capital_job_id/capability/worker_token.
reset role;
select set_config('offroad_test.native_worker_account',auth.uid()::text,true);
select set_config('offroad_test.native_workspace',(select organization_id::text from public.processing_jobs where id=current_setting('offroad_test.capital_job_id')::uuid),true);
create temp table m07_recipe_fixture(job_id uuid,capability text,base jsonb,allocation jsonb,retention jsonb,object_id uuid);
grant all on m07_recipe_fixture to authenticated;
insert into m07_recipe_fixture(job_id,capability) values(current_setting('offroad_test.capital_job_id')::uuid,current_setting('offroad_test.capability'));
update private.capital_public_retention_controls set enabled=true;
-- Purger health comes from the actual authorized claim, not an invented timestamp.
set local role authenticated;
select public.worker_claim_capital_capture_purge_v1(current_setting('offroad_test.worker_token'));
do $$declare f record;base_receipt jsonb;a jsonb;replay jsonb;begin
 select * into strict f from pg_temp.m07_recipe_fixture;
 begin perform public.worker_prepare_capital_m07_recipe_v1(f.job_id,repeat('x',64));raise exception 'm07_wrong_capability_admitted';exception when insufficient_privilege then null;end;
 base_receipt:=public.worker_prepare_capital_m07_recipe_v1(f.job_id,f.capability);
 if base_receipt->>'schemaVersion'<>'capital-m07-base-context.v1' or base_receipt->>'contextFingerprint'<>encode(extensions.digest(base_receipt->>'canonicalContext','sha256'),'hex') then raise exception 'm07_base_physical_identity_invalid';end if;
 replay:=public.worker_prepare_capital_m07_recipe_v1(f.job_id,f.capability);
 if replay<>base_receipt then raise exception 'm07_base_replay_changed';end if;
 a:=public.worker_prepare_capital_m07_context_v1(f.job_id,f.capability,(base_receipt->>'recipeId')::uuid,'ba770000-0000-4000-9000-000000000001');
 if a->>'canonicalBody'<>base_receipt->>'canonicalContext' or a->>'payloadFingerprint'<>base_receipt->>'contextFingerprint'
 or(a->>'byteLength')::bigint<>octet_length(a->>'canonicalBody') or split_part(a->>'path','/',2)<>a->>'allocationId' then raise exception 'm07_context_allocation_identity_invalid';end if;
 if(a->>'expiresAt')::timestamptz<=(a->>'purgeAt')::timestamptz or(a->>'purgeAt')::timestamptz<=clock_timestamp() then raise exception 'm07_context_ttl_invalid';end if;
 update pg_temp.m07_recipe_fixture set base=base_receipt,allocation=a;
 begin perform public.worker_finalize_capital_m07_recipe_v1(f.job_id,f.capability,(base_receipt->>'recipeId')::uuid,gen_random_uuid(),'[]',repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),1000000,2,'abstained');raise exception 'm07_recipe_empty_unretained_admitted';exception when invalid_parameter_value or insufficient_privilege then null;end;
 begin perform public.worker_authorize_capital_m07_processing_v1(f.job_id,f.capability,(base_receipt->>'recipeId')::uuid,'{}','{}',array['inference','prompt_cache','schema_cache'],'case_analysis');raise exception 'm07_unsealed_dispatch_admitted';exception when invalid_parameter_value or insufficient_privilege then null;end;
end; $$;
reset role;
do $$declare f record;o uuid:=gen_random_uuid();begin
 select * into strict f from pg_temp.m07_recipe_fixture;
 insert into storage.objects(id,bucket_id,name,version,metadata) values(o,f.allocation->>'bucket',f.allocation->>'path','m07-synthetic-storage-version',jsonb_build_object('size',(f.allocation->>'byteLength')::bigint,'mimetype','application/json'));
 update pg_temp.m07_recipe_fixture set object_id=o;
end; $$;
set local role authenticated;
do $$declare f record;r jsonb;begin
 select * into strict f from pg_temp.m07_recipe_fixture;
 begin perform public.worker_commit_capital_m07_body_v1(f.job_id,f.capability,(f.allocation->>'allocationId')::uuid,f.object_id,'wrong-version',f.allocation->>'payloadFingerprint',(f.allocation->>'byteLength')::bigint);raise exception 'm07_wrong_physical_version_admitted';exception when invalid_parameter_value then null;end;
 r:=public.worker_commit_capital_m07_body_v1(f.job_id,f.capability,(f.allocation->>'allocationId')::uuid,f.object_id,'m07-synthetic-storage-version',f.allocation->>'payloadFingerprint',(f.allocation->>'byteLength')::bigint);
 if r->>'retentionState'<>'retained' or r->>'bodyBasisId'<>f.allocation->>'bodyBasisId' then raise exception 'm07_context_physical_commit_invalid';end if;
 if(public.worker_read_capital_m07_allocation_v1(f.job_id,f.capability,(f.allocation->>'allocationId')::uuid))->>'retainedPayloadId'<>r->>'retainedPayloadId' then raise exception 'm07_context_scope_drift';end if;
 update pg_temp.m07_recipe_fixture set retention=r;
end; $$;
reset role;

-- Native lifecycle: publication is an actual human command, in rollback fixture.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('10000000-0000-4000-8000-000000000993','authenticated','authenticated','m07-publisher@example.invalid','{}','{}',now(),now(),false,false);
-- The publisher is a separate Offroad organization. Its right never becomes a
-- consumer-tenant source row by virtue of the consumer's membership.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000993","role":"authenticated"}',true);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000993','offroad','Synthetic capture publisher','10000000-0000-4000-8000-000000000993');
insert into public.organization_memberships(organization_id,user_id,role,status) values
('20000000-0000-4000-8000-000000000993','10000000-0000-4000-8000-000000000993','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by) values
('30000000-0000-4000-8000-000000000993','20000000-0000-4000-8000-000000000993','Synthetic capture source','10000000-0000-4000-8000-000000000993');
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000993"}',true);
create temp table capture_public_license_fixture(source_version_id uuid,source_binding_id uuid,rights_version_id uuid,payload jsonb);
grant select on capture_public_license_fixture to authenticated;
do $$ declare v uuid:=gen_random_uuid(); b uuid; r uuid; sample jsonb; begin
 sample:='{"url":"https://example.invalid/capture-licensed","title":"Synthetic licensed source","snippet":"Licensed excerpt only","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'::jsonb;
 insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by)
 values(v,'20000000-0000-4000-8000-000000000993','30000000-0000-4000-8000-000000000993','30000000-0000-4000-8000-000000000993','10000000-0000-4000-8000-000000000993');
 insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,initial_verification_state,created_by)
 values(v,'20000000-0000-4000-8000-000000000993',v,1,1,'opportunity-documents','20000000-0000-4000-8000-000000000993/synthetic/'||v,'Synthetic excerpt','pending_verification','10000000-0000-4000-8000-000000000993');
 insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
 values('20000000-0000-4000-8000-000000000993',v,'30000000-0000-4000-8000-000000000993','30000000-0000-4000-8000-000000000993',gen_random_uuid(),'10000000-0000-4000-8000-000000000993') returning id into b;
 r:=public.declare_public_source_reuse_v1(v,0,sample->>'url',private.public_source_payload_sha256_v1(sample),now()+interval '60 days',now()+interval '60 days',v,repeat('b',64));
 insert into pg_temp.capture_public_license_fixture values(v,b,r,sample);
end; $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('offroad_test.native_worker_account'),'role','authenticated')::text,true);
select set_config('request.headers',jsonb_build_object('x-offroad-workspace',current_setting('offroad_test.native_workspace'))::text,true);
create temp table m07_lifecycle(source_storage_object_id uuid,delivery_id uuid,source_allocation jsonb,source_retention jsonb,recipe jsonb,decision jsonb,input jsonb,accepted jsonb,parsed jsonb,final jsonb,final_fp text);
grant all on m07_lifecycle to authenticated;
insert into m07_lifecycle(final_fp) values(repeat('f',64));
set local role authenticated;
do $$declare f record;l record;c jsonb;delivery jsonb;a jsonb;begin
 select * into strict f from pg_temp.m07_recipe_fixture;select * into strict l from pg_temp.capture_public_license_fixture;
 c:=public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);
 delivery:=public.worker_capture_capital_project_delivery_v1(f.job_id,f.capability,(c#>>'{capture,id}')::uuid,'m07:published:1',l.payload,jsonb_build_array(jsonb_build_object('kind','published_public_payload')));
 a:=public.worker_prepare_capital_public_payload_v1(f.job_id,f.capability,(delivery->>'deliveryId')::uuid,gen_random_uuid(),l.payload);
 update pg_temp.m07_lifecycle set delivery_id=(delivery->>'deliveryId')::uuid,source_allocation=a;
end;$$;
reset role;
insert into storage.objects(bucket_id,name,metadata,version) select source_allocation->>'bucket',source_allocation->>'path',jsonb_build_object('size',(source_allocation->>'byteLength')::bigint,'mimetype','application/json'),'m07-source-sql-v1' from m07_lifecycle;
update m07_lifecycle t set source_storage_object_id=o.id from storage.objects o where o.bucket_id=t.source_allocation->>'bucket' and o.name=t.source_allocation->>'path';
set local role authenticated;
do $$declare f record;t record;o uuid;begin
 select * into strict f from pg_temp.m07_recipe_fixture;select * into strict t from pg_temp.m07_lifecycle;
 o:=t.source_storage_object_id; if o is null then raise exception 'source_fixture_storage_object_missing';end if;
 update pg_temp.m07_lifecycle set source_retention=public.worker_commit_capital_public_payload_v1(f.job_id,f.capability,(t.source_allocation->>'allocationId')::uuid,o,'m07-source-sql-v1',t.source_allocation->>'payloadFingerprint',(t.source_allocation->>'byteLength')::bigint);
end;$$;
do $$declare f record;claim jsonb;context jsonb;v_task_id text;v_task_run_id uuid;v_input_fingerprint text;v_dependencies jsonb;v_artifact_content jsonb;v_artifact jsonb;
begin
 select * into strict f from pg_temp.m07_recipe_fixture;claim:=jsonb_build_object('job_id',f.job_id,'capability_token',f.capability,'organization_id',f.base->>'organizationId');context:=(f.base->>'canonicalContext')::jsonb;
  foreach v_task_id in array array['M01','M02','M03','M04','M05','M06','C02','K04']::text[]
  loop
    v_input_fingerprint := encode(
      extensions.digest(convert_to('origination-test:' || v_task_id, 'utf8'), 'sha256'), 'hex'
    );
    v_task_run_id := public.worker_start_capital_project_task(
      (claim ->> 'job_id')::uuid, claim ->> 'capability_token', v_task_id,
      'offroad.origination_thesis', '2026.09.01-v1', v_input_fingerprint,
      jsonb_build_object('schemaVersion', 'capital-context-manifest.v1')
    );
    select coalesce(jsonb_agg(jsonb_build_object(
      'artifactId', dependency_artifact.id,
      'artifactFingerprint', dependency_artifact.artifact_fingerprint
    ) order by dependency_task.task_id), '[]'::jsonb)
    into v_dependencies
    from public.capital_project_plan_tasks current_task
    cross join lateral unnest(current_task.dependencies) dependency_id
    join public.capital_project_plan_tasks dependency_task
      on dependency_task.organization_id = current_task.organization_id
      and dependency_task.plan_id = current_task.plan_id
      and dependency_task.task_id = dependency_id
    join public.capital_project_task_runs dependency_run
      on dependency_run.organization_id = dependency_task.organization_id
      and dependency_run.plan_task_id = dependency_task.id
      and dependency_run.status = 'succeeded'
    join public.capital_project_artifacts dependency_artifact
      on dependency_artifact.organization_id = dependency_run.organization_id
      and dependency_artifact.task_run_id = dependency_run.id
      and dependency_artifact.status not in ('stale', 'superseded')
    where current_task.organization_id = (claim ->> 'organization_id')::uuid
      and current_task.plan_id = (context #>> '{plan,id}')::uuid
      and current_task.task_id = v_task_id;

    v_artifact_content := case v_task_id
      when 'C02' then jsonb_build_object(
        'status', 'succeeded',
        'researchRunId', '80000000-0000-4000-8000-000000000231',
        'sources', jsonb_build_array(jsonb_build_object(
          'provider', 'perplexity', 'topic', 'sector', 'title', 'Fonte setorial pública',
          'url', 'https://farol.example/setor', 'snippet', 'Sinal público preservado.',
          'publishedAt', null, 'retrievedAt', '2026-09-01T12:00:00.000Z',
          'contentHash', repeat('d', 64)
        )),
        'failures', jsonb_build_array()
      )
      when 'K04' then jsonb_build_object(
        'status', 'succeeded',
        'researchRunId', '80000000-0000-4000-8000-000000000231',
        'sources', jsonb_build_array(), 'failures', jsonb_build_array()
      )
      else jsonb_build_object('taskId', v_task_id, 'fixture', true)
    end;
    v_artifact := public.worker_record_capital_project_artifact(
      (claim ->> 'job_id')::uuid, claim ->> 'capability_token', v_task_run_id,
      case when v_task_id = 'M07' then 'meeting_brief' else 'origination_' || lower(v_task_id) end,
      'capital-artifact.v1',
      case when v_task_id = 'M07' then 'pending_confirmation' else 'draft' end,
      v_input_fingerprint, v_artifact_content, jsonb_build_array(), v_dependencies
    );
    perform public.worker_finish_capital_project_task(
      (claim ->> 'job_id')::uuid, claim ->> 'capability_token', v_task_run_id,
      'succeeded', jsonb_build_object('type', 'capital_project_artifact', 'id', v_artifact ->> 'id'),
      v_artifact ->> 'artifact_fingerprint',
      jsonb_build_array(jsonb_build_object('id', 'test_contract', 'passed', true)),
      jsonb_build_object(), null
    );
  end loop;
end;$$;
reset role;
set local role authenticated;
do $$declare f record;tr uuid;begin
 select * into strict f from pg_temp.m07_recipe_fixture;
 select r.id into strict tr from public.capital_project_task_runs r join public.capital_project_plan_tasks t on t.organization_id=r.organization_id and t.id=r.plan_task_id where r.processing_job_id=f.job_id and t.task_id='M06';
 begin perform public.worker_record_capital_project_artifact(f.job_id,f.capability,tr,'meeting_brief','capital-artifact.v1','pending_confirmation',repeat('a',64),'{}');raise exception 'm06_meeting_brief_legacy_shortcut';exception when insufficient_privilege then null;end;
 raise notice 'PASS m07_m06_meeting_brief_shortcut_denied';
end;$$;
reset role;
-- Server resolves actual version/license identities, never caller invented grants.
do $$declare f record;r private.capital_m07_recipes;refs jsonb;researchfp text;begin
 select * into strict f from pg_temp.m07_recipe_fixture;select * into strict r from private.capital_m07_recipes where id=(f.base->>'recipeId')::uuid;
 select encode(extensions.digest('{"sourceIds":['||to_jsonb(delivery_id)::text||'],"status":"succeeded"}','sha256'),'hex') into researchfp from pg_temp.m07_lifecycle;
 refs:=jsonb_build_array(jsonb_build_object('slot','company','id',r.session_id,'version',1,'bodyFingerprint',repeat('a',64)),
 jsonb_build_object('slot','brief','id',r.brief_id,'version',(select brief_version from public.capital_project_briefs where id=r.brief_id),'bodyFingerprint',repeat('b',64)),
 jsonb_build_object('slot','institution','id',r.plan_id,'version',(select plan_version from public.capital_project_plans where id=r.plan_id),'bodyFingerprint',repeat('c',64)),
 jsonb_build_object('slot','revision','id',r.job_id,'version',1,'bodyFingerprint',repeat('d',64)),jsonb_build_object('slot','quality_retry','id',r.job_id,'version',1,'bodyFingerprint',repeat('e',64)),
 jsonb_build_object('slot','research','id',r.id,'version',1,'bodyFingerprint',researchfp),jsonb_build_object('slot','source','id',(select delivery_id from pg_temp.m07_lifecycle),'version',1,'bodyFingerprint',repeat('1',64)));
 select refs||coalesce(jsonb_agg(jsonb_build_object('slot','dependency','id',a.id,'version',a.artifact_version,'bodyFingerprint',encode(extensions.digest('{"artifactFingerprint":'||to_jsonb(a.artifact_fingerprint)::text||'}','sha256'),'hex')) order by a.id),'[]') into refs from public.capital_project_artifacts a join public.capital_project_task_runs tr on tr.organization_id=a.organization_id and tr.id=a.task_run_id join public.capital_project_plan_tasks t on t.organization_id=tr.organization_id and t.id=tr.plan_task_id where a.organization_id=r.organization_id and a.capital_project_id=r.work_id and t.task_id in('M06','C02','K04');
 update pg_temp.m07_lifecycle set recipe=public.worker_finalize_capital_m07_recipe_v1(f.job_id,f.capability,r.id,(f.retention->>'retainedPayloadId')::uuid,refs,repeat('2',64),repeat('3',64),repeat('4',64),repeat('5',64),1250000,2,'succeeded');
end;$$;
create function pg_temp.m07_route() returns jsonb language sql as $$ select jsonb_build_object('provider','openai','model','gpt-5.6-sol','accountRef','m07-sql-account','projectRef','m07-sql-project','credentialBinding','m07-sql-key','endpoint','https://api.openai.com/v1/responses','region','global'); $$;
do $$declare resource text;d jsonb;begin
 foreach resource in array array['inference','prompt_cache','schema_cache'] loop
 d:=pg_temp.m07_route()-'model'||jsonb_build_object('id',gen_random_uuid(),'policyVersion','offroad-provider-retention-v2','resource',resource,'models',jsonb_build_array('gpt-5.6-sol','gpt-5.6-terra'),'purposes',jsonb_build_array('case_analysis'),'classifications',jsonb_build_array('restricted'),'rights',jsonb_build_array('process'),'trainingUse','prohibited','eligibility','supported','zeroRetention','not_contracted','revokedAt',null,'reviewedBy','SQL-fixture','reviewedAt',clock_timestamp()-interval '1 minute','validThrough',clock_timestamp()+interval '2 days','retention',jsonb_build_object('requestContentSeconds',0,'abuseMonitoringSeconds',0,'applicationStateSeconds',0,'cacheSeconds',0,'metadataSeconds',0,'exceptions','[]'::jsonb),'evidence',jsonb_build_array(jsonb_build_object('kind','provider_terms','reference','synthetic-rollback-only','sha256',repeat('1',64)),jsonb_build_object('kind','account_configuration','reference','synthetic-rollback-only','sha256',repeat('2',64)),jsonb_build_object('kind','credential_binding','reference','synthetic-rollback-only','sha256',repeat('3',64))));
 perform private.record_provider_processing_assurance_v1(d,'SQL rollback fixture, no commercial assertion');
 end loop;
end;$$;
set local role authenticated;
do $$declare f record;t record;a jsonb;begin
 select * into strict f from pg_temp.m07_recipe_fixture;select * into strict t from pg_temp.m07_lifecycle;
 a:=jsonb_build_object('adapterInputVersion','gateway-adapter-input.v1','task','origination_thesis','schemaName','origination_senior_readout_v2','requestFingerprint',repeat('4',64),'inputFingerprint',repeat('2',64),'promptFingerprint',repeat('3',64),'invocationId',gen_random_uuid(),'retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',false,'reservationUsd',0.1);
 update pg_temp.m07_lifecycle set decision=public.worker_authorize_capital_m07_processing_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,a,pg_temp.m07_route(),array['inference','prompt_cache','schema_cache'],'case_analysis');
 select * into strict t from pg_temp.m07_lifecycle;
 update pg_temp.m07_lifecycle set input=public.worker_record_capital_m07_input_v1(f.job_id,f.capability,(t.decision->>'attemptReceiptId')::uuid);
end;$$;
reset role;
create function pg_temp.outcome_observation_v1(p_decision jsonb,p_input jsonb,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.capital_m07_gateway_attempts;prior uuid;dto jsonb;
begin
 select * into strict a from private.capital_m07_gateway_attempts x where x.id=(p_decision->>'attemptReceiptId')::uuid;
 select invocation_id into prior from private.capital_m07_gateway_attempts x where x.organization_id=a.organization_id and x.id=a.previous_attempt_id;
 dto:=jsonb_build_object('schemaVersion','gateway-attempt-outcome.v1','fingerprintVersion','gateway-attempt-outcome-fingerprint.v1',
 'outcomeFingerprint',repeat('0',64),'invocationId',a.invocation_id,'task','origination_thesis','provider','openai','configuredModel',a.model,
 'schemaName','origination_senior_readout_v2','adapterInputVersion','gateway-adapter-input.v1','requestFingerprint',a.request_fingerprint,
 'inputFingerprint',a.input_fingerprint,'promptFingerprint',a.prompt_fingerprint,'previousInvocationId',prior,
 'retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',a.used_provider_fallback,'processingDecisionId',a.processing_decision_id,
 'inputAttestationReceiptId',p_input->>'receiptId','fromCassette',false,'outcome',p_kind,
 'failureCode',case p_kind when 'accepted' then null when 'invalid_output' then 'schema_invalid' when 'provider_error' then 'provider_failure' when 'timeout' then 'provider_timeout' else 'provider_refusal' end,
 'outputFingerprintVersion',case when p_kind='accepted' then 'gateway-parsed-output.v1' else null end,
 'outputFingerprint',case when p_kind='accepted' then repeat('e',64) else null end,
 'reportedModel',case when p_kind='accepted' then a.model else null end,
 'validationIssueCodeFingerprint',case when p_kind='invalid_output' then repeat('f',64) else null end,
 'reservationMicroUsd',a.reservation_micro_usd,'costMicroUsd',null,'exposureMicroUsd',a.reservation_micro_usd,'costStatus','unknown',
 'inputTokens',null,'outputTokens',null,'cachedInputTokens',null,'latencyMillis',11);
 return dto||jsonb_build_object('outcomeFingerprint',private.capital_m07_attempt_outcome_fingerprint_v1(dto));
end; $$;

-- Only SQL catalog/transaction contracts are asserted here. Physical HTTP and
-- full OriginationSeniorReadout schema eval are independent required gates.
create function pg_temp.m07_materialize(p_job uuid,p_cap text,p_allocation jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare o uuid;begin
 insert into storage.objects(bucket_id,name,metadata,version) values(p_allocation->>'bucket',p_allocation->>'path',jsonb_build_object('size',(p_allocation->>'byteLength')::bigint,'mimetype','application/json'),'m07-output-sql-v1') returning id into o;
 return public.worker_commit_capital_m07_body_v1(p_job,p_cap,(p_allocation->>'allocationId')::uuid,o,'m07-output-sql-v1',p_allocation->>'payloadFingerprint',(p_allocation->>'byteLength')::bigint);
end;$$;
create function pg_temp.m07_graders(p_pass boolean) returns jsonb language sql as $$select jsonb_agg(jsonb_build_object('id',id,'passed',case when id='schema' then p_pass else true end) order by ordinal) from unnest(array['schema','citation_allowlist','citation_coverage','uncertainty','forward_case_governance','unsupported_material_numbers','official_financial_coverage','debt_amount_units','scope_boundary']) with ordinality x(id,ordinal);$$;
set local role authenticated;
do $$declare f record;t record;o jsonb;a jsonb;allocation jsonb;begin
 select * into strict f from pg_temp.m07_recipe_fixture;select * into strict t from pg_temp.m07_lifecycle;
 begin
 o:=pg_temp.outcome_observation_v1(t.decision,t.input,'timeout');perform public.worker_record_capital_m07_attempt_outcome_v1(f.job_id,f.capability,(t.decision->>'attemptReceiptId')::uuid,o);
 begin perform public.worker_record_capital_m07_execution_failure_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,'model_attempts_exhausted');raise exception 'premature_exhaustion_admitted';exception when insufficient_privilege then null;end;
 a:=public.worker_record_capital_m07_execution_failure_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,'budget_denied');
 if a->>'reason'<>'budget_denied' then raise exception 'timeout_terminal_missing';end if;
 if(public.worker_record_capital_m07_execution_failure_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,'budget_denied'))->>'replayed'<>'true' then raise exception 'timeout_terminal_replay_failed';end if;
 begin perform public.worker_record_capital_m07_input_v1(f.job_id,f.capability,(t.decision->>'attemptReceiptId')::uuid);raise exception 'terminal_timeout_new_dispatch';exception when insufficient_privilege then null;end;
 raise notice 'PASS m07_timeout_terminal_replay_no_dispatch';
 raise exception 'fixture_rollback_timeout' using errcode='ZX001';exception when sqlstate 'ZX001' then null;end;
 o:=pg_temp.outcome_observation_v1(t.decision,t.input,'accepted');perform public.worker_record_capital_m07_attempt_outcome_v1(f.job_id,f.capability,(t.decision->>'attemptReceiptId')::uuid,o);
 a:=jsonb_build_object('schemaVersion','gateway-accepted-invocation.v1','invocationId',t.input->>'invocationId','adapterInputVersion','gateway-adapter-input.v1','adapterRequestFingerprint',repeat('4',64),'outputFingerprintVersion','gateway-parsed-output.v1','outputFingerprint',repeat('e',64),'inputFingerprint',repeat('2',64),'promptFingerprint',repeat('3',64),'provider','openai','configuredModel','gpt-5.6-sol','reportedModel','gpt-5.6-sol','schemaName','origination_senior_readout_v2','retryOrdinal',0,'isSameModelRepair',false,'usedProviderFallback',false,'fromCassette',false,'inputAttestationReceiptId',t.input->>'receiptId');
 a:=public.worker_record_capital_m07_accepted_v1(f.job_id,f.capability,(t.input->>'receiptId')::uuid,a);update pg_temp.m07_lifecycle set accepted=a;
 begin
 perform public.worker_record_capital_m07_execution_failure_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,'accepted_body_unavailable');
 if(public.worker_recover_capital_m07_result_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid))->>'state'<>'unresolved' then raise exception 'unavailable_body_regenerated';end if;
 raise notice 'PASS m07_accepted_body_unavailable_terminal';
 raise exception 'fixture_rollback_body_unavailable' using errcode='ZX001';exception when sqlstate 'ZX001' then null;end;
 allocation:=public.worker_prepare_capital_m07_output_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,gen_random_uuid(),'parsed',(a->>'acceptedInvocationId')::uuid,'{"schemaVersion":"SQL-parsed-fixture.v1"}',repeat('e',64));
 update pg_temp.m07_lifecycle set parsed=pg_temp.m07_materialize(f.job_id,f.capability,allocation);
 select * into strict t from pg_temp.m07_lifecycle;
 allocation:=public.worker_prepare_capital_m07_output_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,gen_random_uuid(),'final',(a->>'acceptedInvocationId')::uuid,'{"schemaVersion":"origination-senior-readout.v3"}',t.final_fp,(t.parsed->>'retainedPayloadId')::uuid);
 update pg_temp.m07_lifecycle set final=pg_temp.m07_materialize(f.job_id,f.capability,allocation);
end;$$;

-- No INSERT of final TaskRun, CPA, accepted invocation or native binding: the
-- installed commit publishes their exact identities and completes the real M07.
do $$declare f record;t record;result jsonb;begin
 select * into strict f from pg_temp.m07_recipe_fixture;select * into strict t from pg_temp.m07_lifecycle;
 result:=public.worker_commit_capital_m07_result_v1(f.job_id,f.capability,(t.recipe->>'recipeId')::uuid,(t.accepted->>'acceptedInvocationId')::uuid,(t.parsed->>'retainedPayloadId')::uuid,(t.final->>'retainedPayloadId')::uuid,t.final_fp,pg_temp.m07_graders(true));
 if result->>'schemaVersion'<>'capital-m07-commit-receipt.v1' then raise exception 'claimed_m07_native_commit_missing';end if;
 perform set_config('offroad_test.native_artifact_id',result->>'capitalArtifactId',true);
 perform set_config('offroad_test.native_artifact_fingerprint',result->>'artifactFingerprint',true);
 raise notice 'PASS claimed_m07_native_recipe_licensed_source_outcome_accepted_commit';
end;$$;
reset role;
