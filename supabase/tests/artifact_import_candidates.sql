-- Source/lease/comparison access tests; actual OOXML and scanner evals run in worker suites.
begin;
\ir support/artifact_roundtrip_setup.sql

do $$declare request jsonb;claim jsonb;receipt jsonb;comparison jsonb;contributions jsonb;v public.source_versions;output jsonb;
begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 perform pg_temp.remember('rt_upload',to_jsonb(pg_temp.source_version('roundtrip-upload',null)));
 set local role authenticated;
 begin
 perform public.request_artifact_import_upload_v1(gen_random_uuid(),'a11b0000-0000-4000-9000-000000000002',pg_temp.val('rt_revision','artifact_id')::uuid,pg_temp.val('rt_receipt','receiptId')::uuid,pg_temp.val('rt_upload','')::uuid,pg_temp.val('rt_revision','revision_id')::uuid,'docx','en-US',gen_random_uuid());
 raise exception 'import locale mismatch accepted';exception when insufficient_privilege then null;end;
 request:=public.request_artifact_import_upload_v1('a4210000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000002',pg_temp.val('rt_revision','artifact_id')::uuid,
 pg_temp.val('rt_receipt','receiptId')::uuid,pg_temp.val('rt_upload','')::uuid,pg_temp.val('rt_revision','revision_id')::uuid,'docx','pt-BR','a4210000-0000-4000-9000-000000000003');reset role;
 perform pg_temp.remember('rt_import_request',request);
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');set local role authenticated;
 claim:=public.worker_claim_artifact_roundtrip_v1('synthetic-roundtrip-worker-token');reset role;
 if claim->>'operation'<>'import_scan'or jsonb_typeof(claim->'revision')<>'null'or claim#>'{importCandidate,headRevision}'is not null then raise exception 'scan disclosed base before gate %',claim;end if;
 perform pg_temp.remember('rt_import_claim',claim);
 select*into strict v from public.source_versions where id=pg_temp.val('rt_upload','')::uuid;
 receipt:=jsonb_build_object('verdict','clean','organizationId',v.organization_id,'sourceDocumentId',v.id,'operationId',claim->>'taskId','documentVersion',v.legacy_document_version,
 'observedSha256',v.declared_sha256,'expectedSha256',v.declared_sha256,'observedByteSize',v.byte_size,'expectedByteSize',v.byte_size,'receiptId','sha256:'||repeat('c',64));
 set local role authenticated;
 begin perform public.worker_record_artifact_import_quarantine_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',receipt||jsonb_build_object('operationId',gen_random_uuid()));raise exception 'mismatched scan accepted';exception when invalid_parameter_value then null;end;
 output:=public.worker_record_artifact_import_quarantine_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',receipt);
 if output->>'operation'<>'import'or output#>>'{importCandidate,baseReceipt,id}'<>pg_temp.val('rt_receipt','receiptId')then raise exception 'clean transition lost base';end if;
 comparison:=jsonb_build_object('status','candidate','baseRevisionId',pg_temp.val('rt_revision','revision_id'),'headRevisionId',pg_temp.val('rt_revision','revision_id'),'baseManifest',(select value from arp where name='rt_map'),'manifestIssue',null,
 'differences',jsonb_build_array(jsonb_build_object('key','lead','classification','edited','alreadyPresent',false,'base',jsonb_build_object('key','lead','blockKey','lead','role','text','value','Original prose','formula',null,'locator','word:lead','claimIds','[]'::jsonb),
 'received',jsonb_build_object('key','lead','blockKey','lead','role','text','value','Human prose','formula',null,'locator','word:lead','claimIds','[]'::jsonb),
 'current',jsonb_build_object('key','lead','blockKey','lead','role','text','value','Original prose','formula',null,'locator','word:lead','claimIds','[]'::jsonb))));
 contributions:=jsonb_build_object('assumptionChanges','[]'::jsonb,'blockProposals',jsonb_build_array(jsonb_build_object('blockKey','lead','content',jsonb_build_object('text','Human prose'),'claims','[]'::jsonb,'supportIds','[]'::jsonb,'detachedClaimIds','[]'::jsonb)),'observations','[]'::jsonb,'conflicts','[]'::jsonb);
 begin perform public.worker_commit_artifact_import_comparison_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',jsonb_set(comparison,'{baseManifest,variant}','"forged"'),contributions);raise exception 'forged captured map accepted';exception when invalid_parameter_value then null;end;
 output:=public.worker_commit_artifact_import_comparison_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',comparison,contributions);reset role;
 if output->>'status'<>'candidate'then raise exception 'comparison not candidate';end if;
 perform pg_temp.remember('rt_comparison',comparison);perform pg_temp.remember('rt_contributions',contributions);
 raise notice 'PASS import_scan_binding_and_exact_export_comparison';
end;$$;

do $$begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');set local role authenticated;
 begin perform public.read_artifact_import_candidate_v1('a4210000-0000-4000-9000-000000000002');raise exception 'membership read import';exception when insufficient_privilege then null;end;reset role;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 begin perform public.worker_commit_artifact_import_comparison_v1(pg_temp.val('rt_import_claim','taskId')::uuid,pg_temp.val('rt_import_claim','capabilityToken'),(select value from arp where name='rt_comparison'),(select value from arp where name='rt_contributions'));raise exception 'human comparison writer';exception when insufficient_privilege then null;end;
 begin perform public.adopt_artifact_import_v1('a4210000-0000-4000-9000-000000000002',gen_random_uuid(),repeat('a',64),'[]',gen_random_uuid(),'pt-BR',false,null,null,null);raise exception 'stale adoption';exception when serialization_failure then null;end;
 reset role;
 raise notice 'PASS import_membership_writer_and_stale_adoption_denied';
end;$$;

-- Comparison bounds cover legitimate multi-scenario workbooks and retain strict byte limits.
do $$declare comparison jsonb;contributions jsonb;begin
 comparison:=jsonb_build_object('status','candidate','differences',(select jsonb_agg(jsonb_build_object('key','recorded:'||i,'classification','unchanged','alreadyPresent',false))from generate_series(1,1500)i));
 contributions:=jsonb_build_object('assumptionChanges','[]'::jsonb,'blockProposals','[]'::jsonb,'observations','[]'::jsonb,'conflicts','[]'::jsonb);
 perform private.validate_artifact_import_comparison_v1(comparison,contributions);
 begin perform private.validate_artifact_import_comparison_v1(comparison||jsonb_build_object('oversized',repeat('x',8388609)),contributions);raise exception 'oversized comparison accepted';exception when invalid_parameter_value then null;end;
 raise notice 'PASS import_multiscenario_comparison_bounds';
end;$$;

-- A clean later head cannot expose revoked sources through immutable comparison history.
do $$declare source uuid;head jsonb;manifest jsonb;blocks jsonb;comparison jsonb;claim jsonb;output jsonb;begin
 begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 source:=pg_temp.source_version('roundtrip-history-restricted',null);
 blocks:=jsonb_build_array(pg_temp.block('lead','paragraph','{"text":"Restricted current prose"}'));
 manifest:=pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(source)),pg_temp.summary(blocks));
 manifest:=manifest||jsonb_build_object('provenance',jsonb_build_object('producer','history-restricted-head','jobId',null,'taskRunId',null,'messageId',null,'capability',null));
 head:=pg_temp.person_write('answer','roundtrip-test','internal',manifest,blocks);
 set local role authenticated;
 perform public.recompare_artifact_import_v1('a4210000-0000-4000-9000-000000000002',(head->>'revision_id')::uuid,gen_random_uuid());reset role;
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');set local role authenticated;
 claim:=public.worker_claim_artifact_roundtrip_v1('synthetic-roundtrip-worker-token');
 comparison:=jsonb_set((select value from arp where name='rt_comparison'),'{headRevisionId}',to_jsonb(head->>'revision_id'));
 perform public.worker_commit_artifact_import_comparison_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',comparison,(select value from arp where name='rt_contributions'));reset role;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 blocks:=jsonb_build_array(pg_temp.block('lead','paragraph','{"text":"Clean latest prose"}'));
 manifest:=pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(pg_temp.val('source_a','')::uuid)),pg_temp.summary(blocks));
 manifest:=manifest||jsonb_build_object('provenance',jsonb_build_object('producer','history-clean-head','jobId',null,'taskRunId',null,'messageId',null,'capability',null));
 head:=pg_temp.person_write('answer','roundtrip-test','internal',manifest,blocks);
 set local role authenticated;
 perform public.recompare_artifact_import_v1('a4210000-0000-4000-9000-000000000002',(head->>'revision_id')::uuid,gen_random_uuid());reset role;
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');set local role authenticated;
 claim:=public.worker_claim_artifact_roundtrip_v1('synthetic-roundtrip-worker-token');
 comparison:=jsonb_set(comparison,'{headRevisionId}',to_jsonb(head->>'revision_id'));
 perform public.worker_commit_artifact_import_comparison_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',comparison,(select value from arp where name='rt_contributions'));reset role;
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 values('a11b0000-0000-4000-9000-000000000001',source,(select max(revision)+1 from private.source_rights_versions where source_version_id=source),array['process'],array['analysis'],'authorized_workspace',clock_timestamp(),'human_declaration',gen_random_uuid(),repeat('d',64),'a11b0000-0000-4000-8000-000000000001');
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 output:=public.read_artifact_import_candidate_v1('a4210000-0000-4000-9000-000000000002');reset role;
 if output->>'withheld'<>'true'or output?'comparison'or output?'events'then raise exception 'revoked comparison history leaked';end if;
 raise notice 'PASS import_revocation_reaches_comparison_history';
 raise exception 'rollback_history_eval'using errcode='ZX021';exception when sqlstate 'ZX021'then null;end;
end;$$;

-- Adoption uses an actual approved decision base, the real human policy and continuation18.
do $$declare basis jsonb;decision jsonb;milestone public.work_milestones;candidate jsonb;adopted jsonb;replayed jsonb;revision public.artifact_revisions;
begin
 begin
 insert into public.organization_review_policies(organization_id,assignment_required,self_approval_allowed,updated_by)
 values('a11b0000-0000-4000-9000-000000000001',false,true,'a11b0000-0000-4000-8000-000000000001')on conflict(organization_id)do update set assignment_required=false,self_approval_allowed=true;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 update public.agent_messages set status='completed'where organization_id='a11b0000-0000-4000-9000-000000000001'and status in('queued','processing');
 basis:=jsonb_build_object('artifacts',jsonb_build_array(jsonb_build_object('artifactRevisionId',pg_temp.val('rt_revision','revision_id'),'manifestFingerprint',(select manifest_fingerprint from public.artifact_revisions where id=pg_temp.val('rt_revision','revision_id')::uuid))),'milestones','[]'::jsonb,'assessments','[]'::jsonb,'decisions','[]'::jsonb,'execution',null,'configuration',null);
 set local role authenticated;
 decision:=public.record_work_decision_v1('a11b0000-0000-4000-9000-000000000002','roundtrip-continuation-base','choose_alternative',basis,array['none'],'in_product',null,'Synthetic capital alternative',null,gen_random_uuid());
 candidate:=public.read_artifact_import_candidate_v1('a4210000-0000-4000-9000-000000000002');reset role;
 select*into strict milestone from public.work_milestones where work_id='a11b0000-0000-4000-9000-000000000002'and subject_id=(decision->>'decisionId')::uuid and kind='decision';
 set local role authenticated;
 begin perform public.adopt_artifact_import_v1('a4210000-0000-4000-9000-000000000002',pg_temp.val('rt_revision','revision_id')::uuid,candidate->>'comparisonFingerprint','[]',gen_random_uuid(),'pt-BR',false,milestone.id,milestone.subject_id,milestone.revision);raise exception 'self approval silently accepted';exception when insufficient_privilege then null;end;
 adopted:=public.adopt_artifact_import_v1('a4210000-0000-4000-9000-000000000002',pg_temp.val('rt_revision','revision_id')::uuid,candidate->>'comparisonFingerprint','[]','a4210000-0000-4000-9000-000000000007','pt-BR',true,milestone.id,milestone.subject_id,milestone.revision);
 replayed:=public.adopt_artifact_import_v1('a4210000-0000-4000-9000-000000000002',pg_temp.val('rt_revision','revision_id')::uuid,candidate->>'comparisonFingerprint','[]','a4210000-0000-4000-9000-000000000007','pt-BR',true,milestone.id,milestone.subject_id,milestone.revision);reset role;
 select*into strict revision from public.artifact_revisions where id=(adopted->>'appliedRevisionId')::uuid;
 if adopted->>'status'<>'applied'or adopted->>'continuationRequestId'is null or replayed->>'replayed'<>'true'or revision.origin<>'person'
 or not exists(select 1 from public.artifact_blocks where revision_id=revision.id and block_key='lead'and content->>'text'='Human prose'and claims='[]')
 or not exists(select 1 from private.artifact_dependency_links where revision_id=revision.id and derived_from_revision_id=pg_temp.val('rt_revision','revision_id')::uuid)
 then raise exception 'adoption did not preserve contribution and continuation';end if;
 raise notice 'PASS import_human_adoption_replay_person_revision_and_continuation';
 raise exception 'rollback_positive_adoption'using errcode='ZX021';
 exception when sqlstate 'ZX021'then null;end;
end;$$;

do $$declare b jsonb;m jsonb;r jsonb;out jsonb;claim jsonb;
begin
 b:=jsonb_build_array(pg_temp.block('lead','paragraph','{"text":"Concurrent current prose"}'));
 m:=pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(pg_temp.val('source_a','')::uuid)),pg_temp.summary(b));
 r:=pg_temp.person_write('answer','roundtrip-test','internal',m,b);
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 out:=public.recompare_artifact_import_v1('a4210000-0000-4000-9000-000000000002',(r->>'revision_id')::uuid,'a4210000-0000-4000-9000-000000000004');reset role;
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');set local role authenticated;
 claim:=public.worker_claim_artifact_roundtrip_v1('synthetic-roundtrip-worker-token');reset role;
 -- An intervening head after claim must invalidate commit, not overwrite the newer revision.
 b:=jsonb_build_array(pg_temp.block('lead','paragraph','{"text":"Second concurrent prose"}'));
 r:=pg_temp.person_write('answer','roundtrip-test','internal',m||jsonb_build_object('provenance',jsonb_build_object('producer','second-concurrent','jobId',null,'taskRunId',null,'messageId',null,'capability',null)),b);
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');set local role authenticated;
 out:=public.worker_commit_artifact_import_comparison_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',(select value from arp where name='rt_comparison'),(select value from arp where name='rt_contributions'));reset role;
 if out->>'status'<>'stale'or out->>'reason'<>'head_changed'or(select head_revision_id from public.artifacts where id=(r->>'artifact_id')::uuid)<>(r->>'revision_id')::uuid then raise exception 'head lost update';end if;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 out:=public.discard_artifact_import_v1('a4210000-0000-4000-9000-000000000002',gen_random_uuid(),'Human chose to retain current revision');reset role;
 if out->>'status'<>'discarded'then raise exception 'discard failed';end if;
 if(select count(*)from private.artifact_import_events where candidate_id='a4210000-0000-4000-9000-000000000002')<4 then raise exception 'comparison history erased';end if;
 raise notice 'PASS import_compare_head_cas_no_lost_update_and_append_history';
end;$$;
rollback;

-- Native institutional route: capture/setup/approval/result are the existing real producers.
begin;
\ir support/institutional_closure_setup.sql
\ir support/institutional_contribution_builder.sql
set local role authenticated;
select set_config('test.roundtrip_native_capture',public.worker_load_institutional_model_context_v2(current_setting('test.result_job')::uuid,repeat('x',64))::text,true);
select set_config('test.roundtrip_native_result',public.worker_record_institutional_model_result_v3(current_setting('test.result_job')::uuid,repeat('x',64),jsonb_build_object('status','completed','artifact',current_setting('test.result_artifact')::jsonb,'inputSnapshot',current_setting('test.roundtrip_native_capture')::jsonb->'inputSnapshot'))::text,true);
reset role;
insert into private.worker_tokens(label,token_sha256,execution_account_user_id)
values('synthetic native roundtrip worker',extensions.digest('synthetic-native-roundtrip-token','sha256'),'10000000-0000-4000-8000-000000000881');
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status)values('50000000-0000-4000-8000-000000000921','20000000-0000-4000-8000-000000000881','40000000-0000-4000-8000-000000000881','20000000-0000-4000-8000-000000000881/40000000-0000-4000-8000-000000000881/roundtrip.xlsx','Synthetic roundtrip.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',12,repeat('b',64),'10000000-0000-4000-8000-000000000881','quarantined');
do $$declare revision public.artifact_revisions;artifact public.artifacts;cfg private.institutional_model_configurations;assumption jsonb;
 request jsonb;claim jsonb;map jsonb;receipt jsonb;path text;obj uuid:=gen_random_uuid();source public.source_versions;candidate jsonb;comparison jsonb;contributions jsonb;scan jsonb;adopted jsonb;proof jsonb;target_configuration_id uuid;
begin
 select*into strict artifact from public.artifacts where id=(select artifact_id from public.artifact_revisions where id=(current_setting('test.roundtrip_native_result')::jsonb#>>'{nativeProjection,revisionId}')::uuid);
 select*into strict revision from public.artifact_revisions where id=artifact.head_revision_id;
 select*into strict cfg from private.institutional_model_configurations where id=current_setting('test.setup_candidate_id')::uuid;
 select value into strict assumption from jsonb_array_elements(cfg.configuration#>'{assumptionBook,assumptions}')where value->>'editable'='true'and value->>'unit'='percent'limit 1;
 select*into strict source from public.source_versions where id='50000000-0000-4000-8000-000000000921';
 set local role authenticated;
 request:=public.request_artifact_export_v1(revision.id,'xlsx','en-US',gen_random_uuid(),'default');
 claim:=public.worker_claim_artifact_roundtrip_v1('synthetic-native-roundtrip-token');reset role;
 map:=jsonb_build_object('schemaVersion','artifact-roundtrip.2026.09.26-v1','artifactId',artifact.id,'revisionId',revision.id,'revisionNo',revision.revision_no,
 'logicalManifestFingerprint',claim#>>'{revision,logicalManifestFingerprint}','format','xlsx','variant','default','exportedAt',claim#>>'{revision,issuedAt}','blocks','[]'::jsonb,
 'inputs',jsonb_build_array(jsonb_build_object('name','premise','blockKey','premise','assumptionId',assumption->>'id','period','2027','configurationId',cfg.id,'approved',assumption#>>'{values,2027}','cellRef','C10')),
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
 'current',jsonb_build_object('key','premise','blockKey','premise','role','input','value',assumption#>>'{values,2027}','formula',null,'locator','cell:C10','claimIds','[]'::jsonb))));
 contributions:=jsonb_build_object('assumptionChanges',jsonb_build_array(jsonb_build_object('assumptionId',assumption->>'id','period','2027','configurationId',cfg.id,'approved',assumption#>>'{values,2027}','proposed','0.09')),'blockProposals','[]'::jsonb,'observations','[]'::jsonb,'conflicts','[]'::jsonb);
 perform public.worker_commit_artifact_import_comparison_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',comparison,contributions);
 candidate:=public.read_artifact_import_candidate_v1('a4210000-0000-4000-9000-000000000021');reset role;
 -- Missing self-declaration or a forged configuration scope creates neither revision nor job.
 begin
 set local role authenticated;
 perform public.adopt_artifact_import_group_v1('a4210000-0000-4000-9000-000000000021',revision.id,candidate->>'comparisonFingerprint','[]',gen_random_uuid(),'en-US',false,null,null,null,cfg.id,false);
 raise exception 'native import self-approval silently accepted';exception when insufficient_privilege then reset role;end;
 begin
 set local role authenticated;
 perform public.adopt_artifact_import_group_v1('a4210000-0000-4000-9000-000000000021',revision.id,candidate->>'comparisonFingerprint','[]',gen_random_uuid(),'en-US',true,null,null,null,gen_random_uuid(),false);
 raise exception 'native scope forgery accepted';exception when invalid_parameter_value then reset role;end;
 set local role authenticated;
 adopted:=public.adopt_artifact_import_group_v1('a4210000-0000-4000-9000-000000000021',revision.id,candidate->>'comparisonFingerprint','[]',gen_random_uuid(),'en-US',true,null,null,null,cfg.id,false);reset role;
 target_configuration_id:=(adopted#>>'{institutional,configurationId}')::uuid;
 proof:=private.institutional_configuration_ancestry_v1(source.organization_id,artifact.work_id,target_configuration_id);
 if adopted->>'status'<>'applied'or proof->>'state'<>'captured_lineage'or not exists(select 1 from private.institutional_configuration_review_projections where configuration_id=target_configuration_id)
 or not exists(select 1 from private.institutional_model_results where id=(adopted#>>'{institutional,resultId}')::uuid and status='queued')
 or not exists(select 1 from private.institutional_artifact_import_receipts where configuration_id=target_configuration_id and source_configuration_id=cfg.id and not rebase_declared)
 then raise exception 'native import did not capture lineage, review and deterministic request';end if;
 raise notice 'PASS native_import_capture_v2_review_and_real_deterministic_request';
end;$$;
rollback;
