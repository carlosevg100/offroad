begin;
\ir support/execution_approval.sql
-- Rollback-only privileged fixture helper; production hash function grants stay private.
create function pg_temp.fixture_institutional_hash(value jsonb) returns text language sql security definer set search_path='' as $$select private.institutional_config_hash(value);$$;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values
  ('10000000-0000-4000-8000-000000000881', 'authenticated', 'authenticated',
   'setup-owner@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false),
  ('10000000-0000-4000-8000-000000000882', 'authenticated', 'authenticated',
   'setup-worker@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), false, false);

insert into public.organizations (id, organization_type, name, created_by) values (
  '20000000-0000-4000-8000-000000000881', 'originator', 'Binding Tenant',
  '10000000-0000-4000-8000-000000000881'
);
insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values (
  '20000000-0000-4000-8000-000000000881', '10000000-0000-4000-8000-000000000881',
  'owner', 'active', now()
);
insert into public.capital_projects (id, organization_id, project_name, entry_job, created_by) values (
  '30000000-0000-4000-8000-000000000881', '20000000-0000-4000-8000-000000000881',
  'Institutional Configuration Test', 'capital_planning', '10000000-0000-4000-8000-000000000881'
);
insert into public.document_intake_sessions (
  id, organization_id, capital_project_id, started_by, journey, locale
) values (
  '40000000-0000-4000-8000-000000000881', '20000000-0000-4000-8000-000000000881',
  '30000000-0000-4000-8000-000000000881', '10000000-0000-4000-8000-000000000881',
  'company', 'pt-BR'
);
insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '70000000-0000-4000-8000-000000000881', '20000000-0000-4000-8000-000000000881',
  '40000000-0000-4000-8000-000000000881', 1, 'manual', 'running', 'binding-test-v1',
  '10000000-0000-4000-8000-000000000881'
);
\ir support/institutional_setup_fixture.sql
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,sha256,sha256_verified_at,scan_result,processing_status,created_by)
values('50000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000881','40000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000881/40000000-0000-4000-8000-000000000881/accounts.xlsx','Synthetic accounts.xlsx',repeat('a',64),now(),' {"verdict":"clean"}','ready','10000000-0000-4000-8000-000000000881');
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,payload)
values('80000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000881','70000000-0000-4000-8000-000000000881','40000000-0000-4000-8000-000000000881','50000000-0000-4000-8000-000000000881','document_pipeline','succeeded',jsonb_build_object('sha256',repeat('a',64),'document_version',1));
insert into public.intake_field_candidates(organization_id,intake_session_id,source_document_id,processing_run_id,extractor_key,field_path,field_group,label,normalized_value,value_type,information_class,evidence_rank,source_anchor,confidence,anchor_verified,period_start,period_end,entity_name,entity_scope,review_state,reviewed_by,reviewed_at,currency,unit,value_scale,extraction_method,created_by)
select '20000000-0000-4000-8000-000000000881','40000000-0000-4000-8000-000000000881','50000000-0000-4000-8000-000000000881','70000000-0000-4000-8000-000000000881',f#>>'{key,fieldPath}',f#>>'{key,fieldPath}','historical_financials',f#>>'{key,fieldPath}',(f->>'value')::jsonb,'number','audited',1,f#>'{accepted,anchor}',1,true,(f#>>'{accepted,periodStart}')::date,(f#>>'{accepted,periodEnd}')::date,f#>>'{accepted,entityName}',f#>>'{accepted,entityScope}','accepted','10000000-0000-4000-8000-000000000881',now(),'BRL','currency',1,'user_entry','10000000-0000-4000-8000-000000000881'
from jsonb_array_elements(current_setting('test.setup_facts')::jsonb) f;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000881","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.setup_context',public.read_institutional_model_setup_v1('30000000-0000-4000-8000-000000000881')::text,true);
do $$declare result jsonb;accepted boolean:=false;begin
 if jsonb_array_length(current_setting('test.setup_context')::jsonb->'candidates')<>15 then raise exception 'Current anchored facts unavailable';end if;
 begin perform public.submit_institutional_model_setup_v1('30000000-0000-4000-8000-000000000881',repeat('f',64),current_setting('test.setup_configuration')::jsonb,current_setting('test.setup_sources')::jsonb,'90000000-0000-4000-8000-000000000881','en-US');accepted:=true;exception when serialization_failure then null;end;
 if accepted then raise exception 'Stale source manifest accepted';end if;
 result:=public.submit_institutional_model_setup_v1('30000000-0000-4000-8000-000000000881',current_setting('test.setup_context')::jsonb->>'sourceManifestFingerprint',current_setting('test.setup_configuration')::jsonb,current_setting('test.setup_sources')::jsonb,'90000000-0000-4000-8000-000000000881','en-US');
 if result->>'status'<>'queued' then raise exception 'Setup not queued';end if;
 result:=public.submit_institutional_model_setup_v1('30000000-0000-4000-8000-000000000881',current_setting('test.setup_context')::jsonb->>'sourceManifestFingerprint',current_setting('test.setup_configuration')::jsonb,current_setting('test.setup_sources')::jsonb,'90000000-0000-4000-8000-000000000881','en-US');
 if result->>'replayed'<>'true' then raise exception 'Setup replay duplicated';end if;
end $$;
reset role;
-- Lease the real queued deterministic job; no approval guard or financial validator is disabled.
update public.processing_jobs set status='leased',attempts=1,lease_expires_at=now()+interval '10 minutes',capability_sha256=extensions.digest(repeat('w',64),'sha256') where kind='agent_operation_brief' and payload->>'message_id'='90000000-0000-4000-8000-000000000881';
select set_config('test.setup_job',(select id::text from public.processing_jobs where kind='agent_operation_brief' and payload->>'message_id'='90000000-0000-4000-8000-000000000881'),true);
-- Match server-attested submission timestamps without changing fixture economics or source lineage.
do $$declare s private.institutional_model_setup_submissions;c jsonb;conf jsonb;assumptions jsonb;overrides jsonb;begin
 select * into strict s from private.institutional_model_setup_submissions where id='90000000-0000-4000-8000-000000000881';
 select jsonb_agg(value||jsonb_build_object('sourceType','offroad_scenario','confidence','low','evidence','[]'::jsonb) order by ord),jsonb_agg(jsonb_build_object('assumptionId',value->>'id','values',value->'values','rationale',value->>'rationale','requestedBy',s.submitted_by,'createdAt',s.submitted_at) order by ord) into assumptions,overrides from jsonb_array_elements(s.configuration#>'{assumptionBook,assumptions}') with ordinality a(value,ord);
 conf:=jsonb_set(jsonb_set(s.configuration,'{assumptionBook,assumptions}',assumptions),'{assumptionBook,overrides}',overrides,true);
 c:=current_setting('test.setup_candidate')::jsonb||jsonb_build_object('configuration',conf,'configurationFingerprint',pg_temp.fixture_institutional_hash(conf),'sourceBindings',s.source_reviews,'submission',jsonb_build_object('id',s.id,'actorId',s.submitted_by,'submittedAt',s.submitted_at));
 perform set_config('test.setup_candidate',c::text,true);
end $$;
set local role authenticated;
do $$declare result jsonb;candidate jsonb:=current_setting('test.setup_candidate')::jsonb;accepted boolean:=false;begin
 result:=public.worker_load_institutional_model_context_v1(current_setting('test.setup_job')::uuid,repeat('w',64));
 if jsonb_array_length(result->'approvedConfigurations')<>0 or result#>>'{pendingSetup,submissionId}'<>'90000000-0000-4000-8000-000000000881' then raise exception 'Pending setup incorrectly approved or unavailable';end if;
 begin perform public.worker_record_initial_institutional_candidate_v1(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',candidate-'willExecute');accepted:=true;exception when others then null;end;
 if accepted then raise exception 'Missing execution flag accepted';end if;
 begin perform public.worker_record_initial_institutional_candidate_v1(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',jsonb_set(candidate,'{lineage,0,periodStart}','"2026-02-01"'));accepted:=true;exception when others then null;end;
 if accepted then raise exception 'Wrong historical period accepted';end if;
 result:=public.worker_record_initial_institutional_candidate_v1(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',candidate);
 perform set_config('test.setup_candidate_id',result->>'candidateId',true);
 if result->>'revision'<>'1' then raise exception 'Initial proposal missing';end if;
 result:=public.worker_record_initial_institutional_candidate_v1(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',candidate);
 if result->>'replayed'<>'true' then raise exception 'Candidate replay duplicated';end if;
 begin perform public.worker_record_initial_institutional_candidate_v1(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',jsonb_set(candidate,'{resultFingerprint}',to_jsonb(repeat('b',64))));accepted:=true;exception when others then null;end;
 if accepted then raise exception 'Modified receipt replay accepted';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000882","role":"authenticated"}',true);
do $$declare accepted boolean:=false;begin
 begin perform public.review_institutional_configuration_v1('30000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate_id')::uuid,null,'approved',current_setting('test.setup_candidate')::jsonb->>'configurationFingerprint');accepted:=true;exception when insufficient_privilege then null;end;
 if accepted then raise exception 'Foreign user approved setup';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000881","role":"authenticated"}',true);
reset role;
update public.agent_messages set status='completed' where id='90000000-0000-4000-8000-000000000881';
set local role authenticated;
select public.review_institutional_configuration_and_calculate_v1('30000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate_id')::uuid,null,'approved',current_setting('test.setup_candidate')::jsonb->>'configurationFingerprint','90000000-0000-4000-8000-000000000883','en-US');
select public.review_institutional_configuration_and_calculate_v1('30000000-0000-4000-8000-000000000881',current_setting('test.setup_candidate_id')::uuid,null,'approved',current_setting('test.setup_candidate')::jsonb->>'configurationFingerprint','90000000-0000-4000-8000-000000000883','en-US');
do $$declare result jsonb;begin
 result:=public.worker_load_institutional_model_context_v1(current_setting('test.setup_job')::uuid,repeat('w',64));
 if jsonb_array_length(result->'approvedConfigurations')<>1 then raise exception 'Approved configuration not consumable';end if;
 if has_table_privilege('authenticated','private.institutional_model_setup_submissions','UPDATE') then raise exception 'Setup table grants exposed';end if;
end $$;
reset role;
update public.processing_jobs set status='leased',attempts=1,lease_expires_at=now()+interval '10 minutes',capability_sha256=extensions.digest(repeat('x',64),'sha256') where kind='agent_operation_brief' and payload->>'message_id'='90000000-0000-4000-8000-000000000883';
select set_config('test.result_job',(select id::text from public.processing_jobs where kind='agent_operation_brief' and payload->>'message_id'='90000000-0000-4000-8000-000000000883'),true);
-- A failed dispatch must terminate UI polling even if parsing failed before result persistence.
do $$declare state text;result jsonb;begin
 foreach state in array array['failed','cancelled','poison','succeeded'] loop
  update public.processing_jobs set status=state where id=current_setting('test.result_job')::uuid;
  result:=public.read_institutional_model_results_v1('30000000-0000-4000-8000-000000000881');
  if result#>>'{latest,status}'<>'blocked' or result#>'{latest,artifact}'<>'null'::jsonb or jsonb_array_length(result#>'{latest,blockers}')<>1 then raise exception 'Terminal dispatch still polls or exposes an artifact: %',state;end if;
  if (select status from private.institutional_model_results where id='90000000-0000-4000-8000-000000000883')<>'queued' then raise exception 'Reader rewrote immutable result history';end if;
 end loop;
 update public.processing_jobs set status='leased' where id=current_setting('test.result_job')::uuid;
end $$;
-- Persistence checks use the generated renderer fixture and adapt server attestations only.
-- Exact XLSX replay is separately exercised against unchanged real renderer bytes in Vitest.
do $$declare c private.institutional_model_configurations;a jsonb:=current_setting('test.setup_artifact')::jsonb;scenario jsonb;begin
 select * into strict c from private.institutional_model_configurations where id=current_setting('test.setup_candidate_id')::uuid;
 scenario:=(a#>'{institutional,scenarios,0}')||jsonb_build_object('configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint,'reviewedAt',c.reviewed_at,'reviewedBy',c.reviewed_by,'sourceBindings',c.answer_evidence->'sourceBindings');
 scenario:=jsonb_set(scenario,'{input,assumptionBook}',c.configuration->'assumptionBook');
 scenario:=jsonb_set(scenario,'{inputFingerprint}',to_jsonb(pg_temp.fixture_institutional_hash(jsonb_build_object('input',scenario->'input','lineage',scenario->'lineage','sourceBindings',scenario->'sourceBindings'))));
 a:=jsonb_set(jsonb_set(jsonb_set(a,'{institutional,scenarios}',jsonb_build_array(scenario)),'{institutional,activeScenarioId}',to_jsonb(c.id)),'{institutional,sourceManifestFingerprint}',c.answer_evidence->'sourceManifestFingerprint');
 a:=jsonb_set(a,'{fingerprint}',to_jsonb(pg_temp.fixture_institutional_hash(a-'fingerprint')));
 perform set_config('test.result_artifact',a::text,true);
end $$;
set local role authenticated;
do $$declare a jsonb:=current_setting('test.result_artifact')::jsonb;changed jsonb;result jsonb;accepted boolean:=false;begin
 result:=public.read_institutional_model_results_v1('30000000-0000-4000-8000-000000000881');
 if result#>>'{latest,status}'<>'queued' or result#>'{latest,artifact}'<>'null'::jsonb then raise exception 'Uncalculated artifact exposed';end if;
 if jsonb_array_length(result->'comparisonResults')<>0 then raise exception 'Uncalculated comparison exposed';end if;
 changed:=jsonb_set(a,'{institutional,scenarios,0,input,openingBalanceSheet,unrestrictedCash}','"777"');
 changed:=jsonb_set(changed,'{fingerprint}',to_jsonb(pg_temp.fixture_institutional_hash(changed-'fingerprint')));
 begin perform public.worker_record_institutional_model_result_v1(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',changed));accepted:=true;exception when others then null;end;
 if accepted then raise exception 'Forged historical economics accepted';end if;
 -- Probe editable v2 in a subtransaction, then roll back to exercise original v1 persistence too.
 changed:=jsonb_set(a,'{version}','"institutional-workbook-editable.v2"');
 changed:=jsonb_set(changed,'{fingerprint}',to_jsonb(pg_temp.fixture_institutional_hash(changed-'fingerprint')));
 begin
  result:=public.worker_record_institutional_model_result_v1(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',changed));
  if result->>'status'<>'completed' then raise exception 'Editable v2 result not accepted';end if;
  raise exception 'rollback_v2_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 changed:=jsonb_set(a,'{version}','"institutional-workbook-unknown.v3"');
 changed:=jsonb_set(changed,'{fingerprint}',to_jsonb(pg_temp.fixture_institutional_hash(changed-'fingerprint')));
 accepted:=false;
 begin perform public.worker_record_institutional_model_result_v1(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',changed));accepted:=true;exception when others then null;end;
 if accepted then raise exception 'Unrecognized workbook contract accepted';end if;

 result:=public.worker_record_institutional_model_result_v1(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',a));
 if result->>'status'<>'completed' then raise exception 'Approved result not stored';end if;
 result:=public.worker_record_institutional_model_result_v1(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',a));
 if result->>'replayed'<>'true' then raise exception 'Result replay duplicated';end if;
 result:=public.read_institutional_model_results_v1('30000000-0000-4000-8000-000000000881');
 if result#>'{latest,artifact}' is distinct from a then raise exception 'Result download binding unavailable';end if;
 if jsonb_array_length(result->'comparisonResults')<>1 or result#>'{comparisonResults,0,artifact}' is distinct from a then raise exception 'Reviewed comparison not bound to completed artifact';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000882","role":"authenticated"}',true);
set local role authenticated;
do $$declare accepted boolean:=false;begin
 begin perform public.read_institutional_model_results_v1('30000000-0000-4000-8000-000000000881');accepted:=true;exception when insufficient_privilege then null;end;
 if accepted then raise exception 'Other tenant read reviewed comparisons';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000881","role":"authenticated"}',true);
update public.source_documents set document_version=document_version+1 where id='50000000-0000-4000-8000-000000000881';
set local role authenticated;
do $$declare result jsonb;begin
 result:=public.worker_load_institutional_model_context_v1(current_setting('test.setup_job')::uuid,repeat('w',64));
 if jsonb_array_length(result->'approvedConfigurations')<>0 or jsonb_array_length(result->'candidates')<>0 then raise exception 'Stale source extraction/configuration survived';end if;
 result:=public.read_institutional_model_results_v1('30000000-0000-4000-8000-000000000881');
 if result#>>'{latest,status}'<>'stale' or result#>'{latest,artifact}'<>'null'::jsonb then raise exception 'Stale artifact exposed';end if;
 if jsonb_array_length(result->'comparisonResults')<>0 then raise exception 'Stale source comparison exposed';end if;
end $$;
rollback;
