-- Synthetic result through captured setup and real approval. No production data.
\ir institutional_setup_pending.sql
set local role authenticated;
select set_config('test.closure_setup_capture',public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64))::text,true);
set local role authenticated;
do $$declare result jsonb;candidate jsonb:=current_setting('test.setup_candidate')::jsonb;accepted boolean:=false;begin
 result:=public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64));
 if jsonb_array_length(result->'approvedConfigurations')<>0 or result#>>'{pendingSetup,submissionId}'<>'90000000-0000-4000-8000-000000000881' then raise exception 'Pending setup incorrectly approved or unavailable';end if;
 begin perform public.worker_record_initial_institutional_candidate_v2(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',candidate-'willExecute',current_setting('test.closure_setup_capture')::jsonb->'setupInputSnapshot');accepted:=true;exception when others then null;end;
 if accepted then raise exception 'Missing execution flag accepted';end if;
 begin perform public.worker_record_initial_institutional_candidate_v2(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',jsonb_set(candidate,'{lineage,0,periodStart}','"2026-02-01"'),current_setting('test.closure_setup_capture')::jsonb->'setupInputSnapshot');accepted:=true;exception when others then null;end;
 if accepted then raise exception 'Wrong historical period accepted';end if;
 result:=public.worker_record_initial_institutional_candidate_v2(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',candidate,current_setting('test.closure_setup_capture')::jsonb->'setupInputSnapshot');
 perform set_config('test.setup_candidate_id',result->>'candidateId',true);
 if result->>'revision'<>'1' then raise exception 'Initial proposal missing';end if;
 result:=public.worker_record_initial_institutional_candidate_v2(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',candidate,current_setting('test.closure_setup_capture')::jsonb->'setupInputSnapshot');
 if result->>'replayed'<>'true' then raise exception 'Candidate replay duplicated';end if;
 begin perform public.worker_record_initial_institutional_candidate_v2(current_setting('test.setup_job')::uuid,repeat('w',64),'90000000-0000-4000-8000-000000000881',jsonb_set(candidate,'{resultFingerprint}',to_jsonb(repeat('b',64))),current_setting('test.closure_setup_capture')::jsonb->'setupInputSnapshot');accepted:=true;exception when others then null;end;
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
 result:=public.worker_load_institutional_model_context_v3(current_setting('test.setup_job')::uuid,repeat('w',64));
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
