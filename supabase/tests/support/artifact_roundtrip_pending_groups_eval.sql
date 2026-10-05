-- Native multi-configuration contribution: pending groups and explicit full-scenario rebase.
-- All configurations enter via captured setup/response and real v2 human approval.
begin;
\ir institutional_closure_setup.sql
\ir institutional_contribution_builder.sql
do $$declare c private.institutional_model_configurations;b private.institutional_model_configurations;aid uuid;v text;art jsonb:=current_setting('test.result_artifact')::jsonb;scenario jsonb;provenance jsonb;result jsonb;command uuid:=gen_random_uuid();job uuid;
begin
 select*into strict c from private.institutional_model_configurations where id=current_setting('test.setup_candidate_id')::uuid;
 select value#>>'{values,2027}'into v from jsonb_array_elements(c.configuration#>'{assumptionBook,assumptions}')where value->>'editable'='true'and value->>'unit'='percent'limit 1;
 aid:=pg_temp.add_ancestry_contribution(c.id,((v::numeric)*100)::text);
 set local role authenticated;
 result:=pg_temp.approve_native_configuration(c.capital_project_id,aid,command,'en-US');reset role;
 select*into strict b from private.institutional_model_configurations where id=aid;
 select id into strict job from public.processing_jobs where kind='agent_operation_brief'and payload->>'message_id'=command::text;
 update public.processing_jobs set status='leased',attempts=1,lease_expires_at=now()+interval '10 minutes',capability_sha256=extensions.digest(repeat('x',64),'sha256')where id=job;
 perform set_config('test.result_job',job::text,true);
 perform set_config('test.roundtrip_second_configuration',b.id::text,true);
 provenance:=private.institutional_configuration_provenance(c.organization_id,b.id);
 scenario:=(art#>'{institutional,scenarios,0}')||jsonb_build_object('configurationId',b.id,'configurationFingerprint',b.configuration_fingerprint,'revision',b.revision,'reviewedBy',b.reviewed_by,'reviewedAt',b.reviewed_at,'assumptionBook',b.configuration->'assumptionBook','lineage',provenance->'lineage','sourceBindings',provenance->'sourceBindings','input',jsonb_set(art#>'{institutional,scenarios,0,input}','{assumptionBook}',b.configuration->'assumptionBook'));
 scenario:=jsonb_set(scenario,'{inputFingerprint}',to_jsonb(pg_temp.fixture_institutional_hash(jsonb_build_object('input',scenario->'input','lineage',scenario->'lineage','sourceBindings',scenario->'sourceBindings'))));
 art:=jsonb_set(jsonb_set(art,'{institutional,scenarios}',(art#>'{institutional,scenarios}')||jsonb_build_array(scenario)),'{institutional,activeScenarioId}',to_jsonb(b.id));
 art:=jsonb_set(art,'{fingerprint}',to_jsonb(pg_temp.fixture_institutional_hash(art-'fingerprint')));
 perform set_config('test.result_artifact',art::text,true);
end;$$;
set local role authenticated;
select set_config('test.roundtrip_native_capture',public.worker_load_institutional_model_context_v2(current_setting('test.result_job')::uuid,repeat('x',64))::text,true);
select set_config('test.roundtrip_native_result',public.worker_record_institutional_model_result_v3(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',current_setting('test.result_artifact')::jsonb,'inputSnapshot',current_setting('test.roundtrip_native_capture')::jsonb->'inputSnapshot'))::text,true);
reset role;
insert into private.worker_tokens(label,token_sha256,execution_account_user_id)
values('synthetic native roundtrip worker',extensions.digest('synthetic-native-roundtrip-token','sha256'),'10000000-0000-4000-8000-000000000881');
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status)values('50000000-0000-4000-8000-000000000921','20000000-0000-4000-8000-000000000881','40000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000881/40000000-0000-4000-8000-000000000881/roundtrip.xlsx','Synthetic roundtrip.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',12,repeat('b',64),'10000000-0000-4000-8000-000000000881','quarantined');
do $$declare revision public.artifact_revisions;artifact public.artifacts;cfg private.institutional_model_configurations;assumption jsonb;
 request jsonb;claim jsonb;map jsonb;receipt jsonb;path text;obj uuid:=gen_random_uuid();source public.source_versions;candidate jsonb;comparison jsonb;contributions jsonb;scan jsonb;adopted jsonb;proof jsonb;target_configuration_id uuid;second_config private.institutional_model_configurations;second_assumption jsonb;pending jsonb;new_head uuid;rebased jsonb;rebased_configuration_id uuid;rebased_configuration jsonb;
begin
 select*into strict artifact from public.artifacts where id=(select artifact_id from public.artifact_revisions where id=(current_setting('test.roundtrip_native_result')::jsonb#>>'{nativeProjection,revisionId}')::uuid);
 select*into strict revision from public.artifact_revisions where id=artifact.head_revision_id;
 select*into strict cfg from private.institutional_model_configurations where id=current_setting('test.setup_candidate_id')::uuid;
 select value into strict assumption from jsonb_array_elements(cfg.configuration#>'{assumptionBook,assumptions}')where value->>'editable'='true'and value->>'unit'='percent'limit 1;
 select*into strict second_config from private.institutional_model_configurations where id=current_setting('test.roundtrip_second_configuration')::uuid;
 select value into strict second_assumption from jsonb_array_elements(second_config.configuration#>'{assumptionBook,assumptions}')where value->>'id'=assumption->>'id';
 select*into strict source from public.source_versions where id='50000000-0000-4000-8000-000000000921';
 set local role authenticated;
 request:=public.request_artifact_export_v1(revision.id,'xlsx','en-US',gen_random_uuid(),'default');
 claim:=public.worker_claim_artifact_roundtrip_v1('synthetic-native-roundtrip-token');reset role;
 map:=jsonb_build_object('schemaVersion','artifact-roundtrip.2026.09.26-v1','artifactId',artifact.id,'revisionId',revision.id,'revisionNo',revision.revision_no,
 'logicalManifestFingerprint',claim#>>'{revision,logicalManifestFingerprint}','format','xlsx','variant','default','exportedAt',claim#>>'{revision,issuedAt}','blocks','[]'::jsonb,
 'inputs',jsonb_build_array(jsonb_build_object('name','premise','blockKey','premise','assumptionId',assumption->>'id','period','2027','configurationId',cfg.id,'approved',assumption#>>'{values,2027}','cellRef','C10'),jsonb_build_object('name','premise-second','blockKey','premise-second','assumptionId',second_assumption->>'id','period','2027','configurationId',second_config.id,'approved',second_assumption#>>'{values,2027}','cellRef','C11')),
 'outputs','[]'::jsonb,'formulas','[]'::jsonb);
 set local role authenticated;
 path:=public.worker_prepare_artifact_export_storage_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',repeat('e',64),12)->>'path';reset role;
 insert into storage.objects(id,bucket_id,name,metadata)values(obj,'case-artifacts',path,'{"size":12}');
 set local role authenticated;
 receipt:=public.worker_commit_artifact_export_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',obj,null,map);
 candidate:=public.request_artifact_import_upload_v1('a4210000-0000-4000-9000-000000000021',artifact.work_id,artifact.id,(receipt->>'receiptId')::uuid,source.id,revision.id,'xlsx','en-US',gen_random_uuid());
 claim:=public.worker_claim_artifact_roundtrip_v1('synthetic-native-roundtrip-token');
 scan:=jsonb_build_object('verdict','clean','organizationId',source.organization_id,'sourceDocumentId',source.id,'documentVersion',source.legacy_document_version,'operationId',claim->>'taskId',
 'expectedSha256',source.declared_sha256,'observedSha256',source.declared_sha256,'expectedByteSize',source.byte_size,'observedByteSize',source.byte_size,'receiptId','sha256:'||repeat('f',64));
 perform public.worker_record_artifact_import_quarantine_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',scan);
 comparison:=jsonb_build_object('status','candidate','baseRevisionId',revision.id,'headRevisionId',revision.id,'baseManifest',map,'manifestIssue',null,'differences',jsonb_build_array(jsonb_build_object('key','in:premise','classification','edited','alreadyPresent',false,
 'base',jsonb_build_object('key','premise','blockKey','premise','role','input','value',assumption#>>'{values,2027}','formula',null,'locator','cell:C10','claimIds','[]'::jsonb),
 'received',jsonb_build_object('key','premise','blockKey','premise','role','input','value','0.09','formula',null,'locator','cell:C10','claimIds','[]'::jsonb),
 'current',jsonb_build_object('key','premise','blockKey','premise','role','input','value',assumption#>>'{values,2027}','formula',null,'locator','cell:C10','claimIds','[]'::jsonb)),jsonb_build_object('key','in:premise-second','classification','edited','alreadyPresent',false,'base',jsonb_build_object('key','premise-second','blockKey','premise-second','role','input','value',second_assumption#>>'{values,2027}','formula',null,'locator','cell:C11','claimIds','[]'::jsonb),'received',jsonb_build_object('key','premise-second','blockKey','premise-second','role','input','value','0.10','formula',null,'locator','cell:C11','claimIds','[]'::jsonb),'current',jsonb_build_object('key','premise-second','blockKey','premise-second','role','input','value',second_assumption#>>'{values,2027}','formula',null,'locator','cell:C11','claimIds','[]'::jsonb))));
 contributions:=jsonb_build_object('assumptionChanges',jsonb_build_array(jsonb_build_object('assumptionId',assumption->>'id','period','2027','configurationId',cfg.id,'approved',assumption#>>'{values,2027}','proposed','0.09'),jsonb_build_object('assumptionId',second_assumption->>'id','period','2027','configurationId',second_config.id,'approved',second_assumption#>>'{values,2027}','proposed','0.10')),'blockProposals','[]'::jsonb,'observations','[]'::jsonb,'conflicts','[]'::jsonb);
 perform public.worker_commit_artifact_import_comparison_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',comparison,contributions);
 candidate:=public.read_artifact_import_candidate_v1('a4210000-0000-4000-9000-000000000021');reset role;
 -- Missing self-declaration or a forged configuration scope creates neither revision nor job.
 begin
 set local role authenticated;
 perform public.adopt_artifact_import_group_v1('a4210000-0000-4000-9000-000000000021',revision.id,candidate->>'comparisonFingerprint','[]',gen_random_uuid(),'en-US',false,null,null,null,second_config.id,false);
 raise exception 'native import self-approval silently accepted';exception when insufficient_privilege then reset role;end;
 begin
 set local role authenticated;
 perform public.adopt_artifact_import_group_v1('a4210000-0000-4000-9000-000000000021',revision.id,candidate->>'comparisonFingerprint','[]',gen_random_uuid(),'en-US',true,null,null,null,gen_random_uuid(),false);
 raise exception 'native scope forgery accepted';exception when invalid_parameter_value then reset role;end;
 set local role authenticated;
 adopted:=public.adopt_artifact_import_group_v1('a4210000-0000-4000-9000-000000000021',revision.id,candidate->>'comparisonFingerprint','[]',gen_random_uuid(),'en-US',true,null,null,null,second_config.id,false);reset role;
 target_configuration_id:=(adopted#>>'{institutional,configurationId}')::uuid;
 proof:=private.institutional_configuration_ancestry_v1(source.organization_id,artifact.work_id,target_configuration_id);
 if adopted->>'status'<>'stale'or adopted->'pendingConfigurationIds'<>jsonb_build_array(cfg.id)or proof->>'state'<>'captured_lineage'or not exists(select 1 from private.institutional_configuration_review_projections where configuration_id=target_configuration_id)
 or not exists(select 1 from private.institutional_model_results where id=(adopted#>>'{institutional,resultId}')::uuid and status='queued')
 or not exists(select 1 from private.institutional_artifact_import_receipts where configuration_id=target_configuration_id and source_configuration_id=second_config.id and not rebase_declared)
 then raise exception 'native import did not capture lineage, review and deterministic request';end if;
 raise notice 'PASS native_import_pending_group_preserves_unadopted_configuration';
 -- Rebase denial tests the real bounded bridge after the first group's approval.
 -- No comparison bypass: recompare keeps the same original receipt and records a new exact head.
 new_head:=(adopted->>'appliedRevisionId')::uuid;
 begin
 set local role authenticated;
 perform public.adopt_artifact_import_group_v1('a4210000-0000-4000-9000-000000000021',revision.id,candidate->>'comparisonFingerprint','[]',gen_random_uuid(),'en-US',true,null,null,null,cfg.id,false);
 raise exception 'pending group reused old head';exception when serialization_failure then reset role;end;
 -- Bridge scope enforcement is checked independently while the next deterministic job is pending.
 begin
 perform private.apply_institutional_artifact_import_v1('a4210000-0000-4000-9000-000000000021',jsonb_build_array(jsonb_build_object('assumptionId',assumption->>'id','period','2027','configurationId',cfg.id,'approved',assumption#>>'{values,2027}','proposed','0.09')),gen_random_uuid(),'en-US',true,cfg.id,false);
 raise exception 'different configuration accepted without explicit rebase';exception when serialization_failure then null;end;
 raise notice 'PASS native_import_pending_group_old_head_and_implicit_rebase_denied';
 -- The same closed bridge must accept explicit rebase and preserve both immutable bases.
 -- This owner-only kernel eval complements the public pending-group/CAS checks above;
 -- public adoption still requires a freshly compared head after deterministic completion.
 rebased:=private.apply_institutional_artifact_import_v1('a4210000-0000-4000-9000-000000000021',jsonb_build_array(jsonb_build_object('assumptionId',assumption->>'id','period','2027','configurationId',cfg.id,'approved',assumption#>>'{values,2027}','proposed','0.09')),gen_random_uuid(),'en-US',true,cfg.id,true);
 rebased_configuration_id:=(rebased->>'configurationId')::uuid;
 select configuration into strict rebased_configuration from private.institutional_model_configurations where id=rebased_configuration_id;
 proof:=private.institutional_configuration_ancestry_v1(source.organization_id,artifact.work_id,rebased_configuration_id);
 if proof->>'state'<>'captured_lineage'
 or rebased_configuration#>>'{assumptionBook,scenarioId}'is distinct from cfg.configuration#>>'{assumptionBook,scenarioId}'
 or rebased_configuration#>>'{assumptionBook,scenarioId}'is not distinct from second_config.configuration#>>'{assumptionBook,scenarioId}'
 or not exists(select 1 from private.institutional_artifact_import_receipts where configuration_id=rebased_configuration_id and source_configuration_id=cfg.id and parent_configuration_id=target_configuration_id and rebase_declared)
 or not exists(select 1 from private.institutional_configuration_review_projections where configuration_id=rebased_configuration_id)
 or not exists(select 1 from private.institutional_model_results where id=(rebased->>'resultId')::uuid and configuration_id=rebased_configuration_id and status='queued')
 or (select count(*)from private.institutional_artifact_import_receipts where import_candidate_id='a4210000-0000-4000-9000-000000000021')<>2
 or not exists(select 1 from jsonb_array_elements(proof->'nodes')n where n->>'configurationId'=cfg.id::text)
 or not exists(select 1 from jsonb_array_elements(proof->'nodes')n where n->>'configurationId'=target_configuration_id::text)
 then raise exception 'explicit rebase lost source scenario or parent lineage';end if;
 raise notice 'PASS native_import_explicit_rebase_entire_source_and_two_lineages';
end;$$;
rollback;
