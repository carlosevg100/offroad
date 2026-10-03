-- Disposable transaction authority proof. Storage rows are metadata only;
-- this fixture does not prove HTTP bytes, SDK retention, or calculation quality.
reset role;
do $$declare job uuid;begin
 select(value::jsonb->>'jobId')::uuid into strict job from route_proof where label='native_approval';
 perform pg_temp.fixture_approve_execution(job,false,false);
 update public.processing_jobs set available_at=(select min(available_at)-interval '1 second' from public.processing_jobs) where id=job;
end$$;
insert into route_proof select 'native_execution_brief',jsonb_build_object('project',brief.capital_project_id,'brief',brief.id,'fingerprint',brief.brief_fingerprint)::text from public.capital_project_execution_briefs brief join public.capital_project_execution_brief_dispatches d on d.execution_brief_id=brief.id where d.processing_job_id=(select(value::jsonb->>'jobId')::uuid from route_proof where label='native_approval');
set local role authenticated;select pg_temp.as_owner();
do $$declare b jsonb;begin
 select value::jsonb into strict b from route_proof where label='native_execution_brief';
 perform public.approve_advisor_execution_brief_v1((b->>'project')::uuid,(b->>'brief')::uuid,b->>'fingerprint',gen_random_uuid());
end$$;
reset role;
-- Human approval changes scheduling; prioritize only this fixture after it.
select pg_temp.prioritize_material_fixture_job((select(value::jsonb->>'jobId')::uuid from route_proof where label='native_approval'));
update private.capital_public_retention_controls set enabled=true;
set local role authenticated;select pg_temp.as_worker();
select public.worker_claim_capital_capture_purge_v1(repeat('r',64));
do $$declare claim jsonb;job uuid;a jsonb;begin
 select(value::jsonb->>'jobId')::uuid into strict job from route_proof where label='native_approval';
 claim:=public.worker_claim_job_v4(repeat('r',64),600);
 if claim->>'job_id' is distinct from job::text then raise exception 'material_real_claim_required: %',claim;end if;
 insert into route_proof values('native_claim',claim::text);
 begin perform public.worker_freeze_case_input(job,claim->>'capability_token','{}');raise exception 'material_legacy_freeze_allowed';exception when insufficient_privilege then null;end;
 begin perform public.worker_record_case_snapshot(job,claim->>'capability_token','{}','{}');raise exception 'material_legacy_snapshot_allowed';exception when insufficient_privilege then null;end;
 begin perform public.worker_record_controlled_execution(job,claim->>'capability_token','{}','{}',null);raise exception 'material_legacy_result_allowed';exception when insufficient_privilege then null;end;
 raise notice 'PASS material_three_legacy_raw_writers_denied_before_capture';
 a:=public.worker_capture_material_production_v1(job,claim->>'capability_token',gen_random_uuid());
 insert into route_proof values('native_capture',a::text);
 raise notice 'PASS material_context_server_capture_before_model';
end$$;
-- Actual upload policy under the genuine lease/capability. No direct read grant.
do $$declare c jsonb;s jsonb;job jsonb;begin
 select value::jsonb into strict c from route_proof where label='native_capture';s:=c#>'{receipt,context}';
 select value::jsonb into strict job from route_proof where label='native_claim';
 perform set_config('request.headers',jsonb_build_object('x-offroad-workspace',s->>'organizationId','x-offroad-job-id',job->>'job_id','x-offroad-capability',job->>'capability_token')::text,true);
 perform set_config('storage.operation','object.upload',true);
 insert into storage.objects(bucket_id,name,metadata,version) values(s->>'bucket',s->>'path',jsonb_build_object('size',(s->>'byteLength')::bigint,'mimetype','application/json'),'material-fixture-v1');
end$$;
reset role;
insert into route_proof select 'context_object',o.id::text from storage.objects o,route_proof f where f.label='native_capture' and o.name=f.value::jsonb#>>'{receipt,context,path}';
set local role authenticated;select pg_temp.as_worker();
do $$declare c jsonb;s jsonb;j jsonb;r jsonb;begin
 select value::jsonb into strict c from route_proof where label='native_capture';s:=c#>'{receipt,context}';select value::jsonb into strict j from route_proof where label='native_claim';
 r:=public.worker_commit_material_production_body_v1((j->>'job_id')::uuid,j->>'capability_token',(s->>'allocationId')::uuid,(select value::uuid from route_proof where label='context_object'),'material-fixture-v1',s->>'payloadFingerprint',(s->>'byteLength')::bigint);
 perform public.worker_seal_material_production_context_v1((j->>'job_id')::uuid,j->>'capability_token',(s->>'recipeId')::uuid,(r->>'retainedPayloadId')::uuid);
 begin perform public.worker_prepare_material_production_output_v1((j->>'job_id')::uuid,j->>'capability_token',(s->>'recipeId')::uuid,gen_random_uuid(),'case_state','{}');raise exception 'unsealed_research_output_allowed';exception when insufficient_privilege then null;end;
 perform public.worker_seal_material_production_sources_v1((j->>'job_id')::uuid,j->>'capability_token',(s->>'recipeId')::uuid,'{}'::uuid[],'abstained');
 raise notice 'PASS material_missing_research_seal_denied_and_private_only_abstention_sealed';
end$$;
do $$declare j jsonb;c jsonb;k text;a jsonb;body jsonb;begin
 select value::jsonb into strict j from route_proof where label='native_claim';select value::jsonb into strict c from route_proof where label='native_capture';
 foreach k in array array['calculation_report','case_state'] loop
 body:=jsonb_build_object('privateFixture',k);
 if k='case_state' then body:=body||jsonb_build_object('materialsBlockedBy','[]'::jsonb,'materials',jsonb_build_array(jsonb_build_object('kind','teaser')),'materialTruth',jsonb_build_object('status','partial','consistency',jsonb_build_object('status','pass'),'exceptions','[]'::jsonb));end if;
 if k='material_package' then body:=body||jsonb_build_object('schemaVersion','2026.08.29-v1','materials',jsonb_build_array(jsonb_build_object('kind','teaser'),jsonb_build_object('kind','term_sheet'),jsonb_build_object('kind','financial_model'),jsonb_build_object('kind','data_room_index')),'financialModel','{}'::jsonb,'dataRoom','{}'::jsonb,'materialTruth',jsonb_build_object('status','partial','consistency',jsonb_build_object('status','pass')));end if;
 if k='calculation_report' then body:=body||jsonb_build_object('schemaVersion','2026.08.29-v4','status','succeeded','caseId','d5300000-0000-4000-8000-000000000001','runId',(select value::jsonb->>'runId' from route_proof where label='native_approval'),'inputFingerprint',repeat('a',64),'reportFingerprint',repeat('b',64),'versions',jsonb_build_object('caseEngine','2026.09.10-v17','materialCompiler','2026.10.02-v10'),'stages',to_jsonb(array_fill('{}'::jsonb,array[11])),'taskRuns',to_jsonb(array_fill('{}'::jsonb,array[11])));end if;
 a:=public.worker_prepare_material_production_output_v1((j->>'job_id')::uuid,j->>'capability_token',(c#>>'{receipt,recipeId}')::uuid,gen_random_uuid(),k,body);
 insert into route_proof values('body:'||k,a::text);
 insert into storage.objects(bucket_id,name,metadata,version) values(a#>>'{scope,bucket}',a#>>'{scope,path}',jsonb_build_object('size',(a#>>'{scope,byteLength}')::bigint,'mimetype','application/json'),'material-fixture-v1');
 end loop;
end$$;
reset role;
insert into route_proof select 'object:'||substr(f.label,6),o.id::text from storage.objects o,route_proof f where f.label like 'body:%' and o.name=f.value::jsonb#>>'{scope,path}';
-- Final package follows physically committed state.
set local role authenticated;select pg_temp.as_worker();
do $$declare j jsonb;c jsonb;f record;s jsonb;a jsonb;body jsonb;begin
 select value::jsonb into strict j from route_proof where label='native_claim';select value::jsonb into strict c from route_proof where label='native_capture';
 for f in select * from route_proof where label in('body:calculation_report','body:case_state') loop
 s:=f.value::jsonb->'scope';perform public.worker_commit_material_production_body_v1((j->>'job_id')::uuid,j->>'capability_token',(s->>'allocationId')::uuid,(select value::uuid from route_proof where label='object:'||substr(f.label,6)),'material-fixture-v1',s->>'payloadFingerprint',(s->>'byteLength')::bigint);
 end loop;
 body:=jsonb_build_object('schemaVersion','2026.08.29-v1','materials',jsonb_build_array(jsonb_build_object('kind','teaser'),jsonb_build_object('kind','term_sheet'),jsonb_build_object('kind','financial_model'),jsonb_build_object('kind','data_room_index')),'financialModel','{}'::jsonb,'dataRoom','{}'::jsonb,'materialTruth',jsonb_build_object('status','partial','consistency',jsonb_build_object('status','pass')));
 a:=public.worker_prepare_material_production_output_v1((j->>'job_id')::uuid,j->>'capability_token',(c#>>'{receipt,recipeId}')::uuid,gen_random_uuid(),'material_package',body);
 insert into route_proof values('body:material_package',a::text);
 insert into storage.objects(bucket_id,name,metadata,version) values(a#>>'{scope,bucket}',a#>>'{scope,path}',jsonb_build_object('size',(a#>>'{scope,byteLength}')::bigint,'mimetype','application/json'),'material-fixture-v1');
end$$;
reset role;
insert into route_proof select 'object:material_package',o.id::text from storage.objects o,route_proof f where f.label='body:material_package' and o.name=f.value::jsonb#>>'{scope,path}';
set local role authenticated;select pg_temp.as_worker();
do $$declare j jsonb;f record;s jsonb;r jsonb;c jsonb;receipt jsonb;replay jsonb;recovery jsonb;begin
 select value::jsonb into strict j from route_proof where label='native_claim';select value::jsonb into strict c from route_proof where label='native_capture';
 for f in select * from route_proof where label like 'body:%' loop
 s:=f.value::jsonb->'scope';r:=public.worker_commit_material_production_body_v1((j->>'job_id')::uuid,j->>'capability_token',(s->>'allocationId')::uuid,(select value::uuid from route_proof where label='object:'||substr(f.label,6)),'material-fixture-v1',s->>'payloadFingerprint',(s->>'byteLength')::bigint);
 insert into route_proof values('retained:'||substr(f.label,6),r::text);
 end loop;
 receipt:=public.worker_commit_material_production_v1((j->>'job_id')::uuid,j->>'capability_token',(c#>>'{receipt,recipeId}')::uuid,(select(value::jsonb->>'retainedPayloadId')::uuid from route_proof where label='retained:calculation_report'),(select(value::jsonb->>'retainedPayloadId')::uuid from route_proof where label='retained:case_state'),(select(value::jsonb->>'retainedPayloadId')::uuid from route_proof where label='retained:material_package'));
 replay:=public.worker_commit_material_production_v1((j->>'job_id')::uuid,j->>'capability_token',(c#>>'{receipt,recipeId}')::uuid,(select(value::jsonb->>'retainedPayloadId')::uuid from route_proof where label='retained:calculation_report'),(select(value::jsonb->>'retainedPayloadId')::uuid from route_proof where label='retained:case_state'),(select(value::jsonb->>'retainedPayloadId')::uuid from route_proof where label='retained:material_package'));
 if(receipt-'replayed')<>(replay-'replayed') or not(replay->>'replayed')::boolean then raise exception 'material_replay_changed';end if;
 recovery:=public.worker_recover_material_production_v1((j->>'job_id')::uuid,j->>'capability_token');
 if recovery->>'state'<>'committed' or jsonb_array_length(recovery->'outputs')<>3 then raise exception 'material_recovery_incomplete';end if;
 insert into route_proof values('native_material_commit',receipt::text);
 raise notice 'PASS material_native_atomic_commit_exact_replay_physical_recovery';
end$$;
reset role;
do $$declare r jsonb;recipe uuid;begin
 select value::jsonb into strict r from route_proof where label='native_material_commit';recipe:=(r->>'recipeId')::uuid;
 if exists(select 1 from private.case_execution_inputs i join private.material_production_recipes p on(p.organization_id,p.controlled_execution_id)=(i.organization_id,i.execution_id) where p.id=recipe) then raise exception 'material_raw_context_persisted';end if;
 if exists(select 1 from public.deal_state_objects where id=(r->>'materialObjectId')::uuid and(payload?'privateFixture' or payload->>'schemaVersion'<>'capital-material-projection.v1')) then raise exception 'material_dso_raw_persisted';end if;
 if exists(select 1 from private.case_execution_results e join private.material_production_recipes p on(p.organization_id,p.controlled_execution_id)=(e.organization_id,e.execution_id) where p.id=recipe and(e.report?'privateFixture' or e.report->>'schemaVersion'<>'capital-material-report-projection.v1')) then raise exception 'material_report_raw_persisted';end if;
 if exists(select 1 from public.document_intake_sessions s join private.material_production_recipes p on(p.organization_id,p.session_id)=(s.organization_id,s.id) where p.id=recipe and(s.result_summary#>>'{case_state,schemaVersion}'<>'capital-material-state-projection.v1' or s.result_summary#>>'{case_manifest,schemaVersion}'<>'capital-material-projection.v1' or s.result_summary#>'{case_state}'?'privateFixture')) then raise exception 'material_summary_raw_persisted';end if;
 if not exists(select 1 from public.artifact_revisions where id=(r->>'revisionId')::uuid and audience='internal' and manifest->>'audience'='internal') then raise exception 'material_capture_externalized';end if;
 if exists(select 1 from public.deal_state_objects d join private.material_production_recipes p on(p.organization_id,p.session_id)=(d.organization_id,d.intake_session_id) where p.id=recipe and d.object_type in('package_review','release_authorization')) then raise exception 'material_capture_approved_3t';end if;
 raise notice 'PASS material_three_permanent_projections_metadata_only_internal_no_3t';
end$$;
