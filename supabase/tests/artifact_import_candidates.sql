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

do $$declare heads jsonb;begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 heads:=public.list_work_artifact_heads_v1('a11b0000-0000-4000-9000-000000000002');reset role;
 if not exists(select 1 from jsonb_array_elements(heads->'artifacts')item where item->>'id'=pg_temp.val('rt_revision','artifact_id')and item->>'headRevisionId'=pg_temp.val('rt_revision','revision_id'))
 or exists(select 1 from jsonb_array_elements(heads->'artifacts')item where item-array['id','headRevisionId']<>'{}')then raise exception 'artifact discovery leaked content or omitted authorized head';end if;
 raise notice 'PASS import_work_artifact_discovery_exact_authorized_identity';
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');set local role authenticated;
 begin perform public.list_work_artifact_heads_v1('a11b0000-0000-4000-9000-000000000002');raise exception 'membership discovered work artifact heads';exception when insufficient_privilege then null;end;

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
 if not exists(select 1 from pg_constraint c where c.conrelid='public.artifact_import_candidates'::regclass and c.contype='c' and pg_get_constraintdef(c.oid)like '%octet_length((comparison)::text)%8388608%')then raise exception 'comparison storage rejects legitimate multi-scenario payload before processor bound';end if;
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
do $$declare milestone public.work_milestones;candidate jsonb;adopted jsonb;replayed jsonb;revision public.artifact_revisions;clean_head jsonb;clean_blocks jsonb;clean_manifest jsonb;comparison jsonb;claim jsonb;output jsonb;
begin
 begin
 insert into public.organization_review_policies(organization_id,assignment_required,self_approval_allowed,updated_by)
 values('a11b0000-0000-4000-9000-000000000001',false,true,'a11b0000-0000-4000-8000-000000000001')on conflict(organization_id)do update set assignment_required=false,self_approval_allowed=true;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 update public.agent_messages set status='completed'where organization_id='a11b0000-0000-4000-9000-000000000001'and status in('queued','processing');
 insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
 values('a4210000-0000-4000-9000-000000000081','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',121,'manual','queued','approval-fixture-v1','a11b0000-0000-4000-8000-000000000001');
 insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
 values('a4210000-0000-4000-9000-000000000082','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a4210000-0000-4000-9000-000000000081','case_analysis','queued','{"analysis_scope":"full_case"}');
 perform pg_temp.fixture_approve_execution('a4210000-0000-4000-9000-000000000082');
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 -- Current head intentionally has a different source and no dependency on the exported base.
 clean_blocks:=jsonb_build_array(pg_temp.block('lead','paragraph','{"text":"Original prose"}'));
 clean_manifest:=pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(pg_temp.val('source_b','')::uuid)),pg_temp.summary(clean_blocks));
 clean_manifest:=clean_manifest||jsonb_build_object('provenance',jsonb_build_object('producer','positive-clean-head','jobId',null,'taskRunId',null,'messageId',null,'capability',null));
 clean_head:=pg_temp.person_write('answer','roundtrip-test','internal',clean_manifest,clean_blocks);
 set local role authenticated;
 perform public.recompare_artifact_import_v1('a4210000-0000-4000-9000-000000000002',(clean_head->>'revision_id')::uuid,gen_random_uuid());reset role;
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');set local role authenticated;
 claim:=public.worker_claim_artifact_roundtrip_v1('synthetic-roundtrip-worker-token');
 comparison:=jsonb_set((select value from arp where name='rt_comparison'),'{headRevisionId}',to_jsonb(clean_head->>'revision_id'));
 perform public.worker_commit_artifact_import_comparison_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',comparison,(select value from arp where name='rt_contributions'));reset role;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 set local role authenticated;
 candidate:=public.read_artifact_import_candidate_v1('a4210000-0000-4000-9000-000000000002');reset role;
 select*into strict milestone from public.work_milestones where work_id='a11b0000-0000-4000-9000-000000000002'and subject_kind='execution_brief'and kind='decision';
 set local role authenticated;
 begin perform public.adopt_artifact_import_v1('a4210000-0000-4000-9000-000000000002',(clean_head->>'revision_id')::uuid,candidate->>'comparisonFingerprint','[]',gen_random_uuid(),'pt-BR',false,milestone.id,milestone.subject_id,milestone.revision);raise exception 'self approval silently accepted';exception when insufficient_privilege then null;end;
 adopted:=public.adopt_artifact_import_v1('a4210000-0000-4000-9000-000000000002',(clean_head->>'revision_id')::uuid,candidate->>'comparisonFingerprint','[]','a4210000-0000-4000-9000-000000000007','pt-BR',true,milestone.id,milestone.subject_id,milestone.revision);
 replayed:=public.adopt_artifact_import_v1('a4210000-0000-4000-9000-000000000002',(clean_head->>'revision_id')::uuid,candidate->>'comparisonFingerprint','[]','a4210000-0000-4000-9000-000000000007','pt-BR',true,milestone.id,milestone.subject_id,milestone.revision);reset role;
 select*into strict revision from public.artifact_revisions where id=(adopted->>'appliedRevisionId')::uuid;
 if adopted->>'status'<>'applied'or adopted->>'continuationRequestId'is null or replayed->>'replayed'<>'true'or revision.origin<>'person'
 or not exists(select 1 from public.artifact_blocks where revision_id=revision.id and block_key='lead'and content->>'text'='Human prose'and claims='[]')
 or not exists(select 1 from private.artifact_dependency_links where revision_id=revision.id and derived_from_revision_id=pg_temp.val('rt_revision','revision_id')::uuid)
 or not exists(select 1 from private.artifact_dependency_links where revision_id=revision.id and derived_from_revision_id=(clean_head->>'revision_id')::uuid)
 or (select count(distinct source_version_id)from private.artifact_dependency_links where revision_id=revision.id and link_kind='source_version'and source_version_id in(pg_temp.val('source_a','')::uuid,pg_temp.val('source_b','')::uuid,pg_temp.val('rt_upload','')::uuid))<>3
 then raise exception 'adoption did not preserve contribution and continuation';end if;
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 values('a11b0000-0000-4000-9000-000000000001',pg_temp.val('source_a','')::uuid,(select max(sr.revision)+1 from private.source_rights_versions sr where sr.source_version_id=pg_temp.val('source_a','')::uuid),array['process'],array['analysis'],'authorized_workspace',clock_timestamp(),'human_declaration',gen_random_uuid(),repeat('e',64),'a11b0000-0000-4000-8000-000000000001');
 if private.artifact_roundtrip_revision_allowed_v1(revision.organization_id,revision.id,'a11b0000-0000-4000-8000-000000000001',false)then raise exception 'adopted contribution lost exported-base restriction';end if;
 set local role authenticated;output:=public.read_artifact_import_candidate_v1('a4210000-0000-4000-9000-000000000002');reset role;
 if output->>'withheld'<>'true'or output?'comparison'or output?'events'then raise exception 'adopted base revocation leaked candidate';end if;
 set local role authenticated;output:=public.list_work_artifact_heads_v1('a11b0000-0000-4000-9000-000000000002');reset role;
 if exists(select 1 from jsonb_array_elements(output->'artifacts')item where item->>'id'=revision.artifact_id::text)then raise exception 'revoked derived artifact leaked through discovery';end if;
 raise notice 'PASS import_adoption_retains_distinct_base_head_upload_and_base_revocation';
 raise notice 'PASS import_human_adoption_replay_person_revision_and_continuation';
 raise exception 'rollback_positive_adoption'using errcode='ZX021';
 exception when sqlstate 'ZX021'then null;end;
end;$$;

do $$declare b jsonb;m jsonb;r jsonb;out jsonb;claim jsonb;
begin
 b:=jsonb_build_array(pg_temp.block('lead','paragraph','{"text":"Concurrent current prose"}'));
 m:=pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(pg_temp.val('source_a','')::uuid)),pg_temp.summary(b));
 m:=m||jsonb_build_object('provenance',jsonb_build_object('producer','head-cas-current','jobId',null,'taskRunId',null,'messageId',null,'capability',null));
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
-- Exact stage20 approval releases only a person's informational answer.
do $$declare b jsonb;m jsonb;written jsonb;r public.artifact_revisions;reviewed jsonb;request jsonb;financial jsonb;financial_revision public.artifact_revisions;before_state text;legacy_id uuid:=gen_random_uuid();legacy_revision public.artifact_revisions;legacy_manifest jsonb;legacy_blocks jsonb;legacy_external jsonb;begin
 insert into public.organization_review_policies(organization_id,assignment_required,self_approval_allowed,updated_by)
 values('a11b0000-0000-4000-9000-000000000001',false,true,'a11b0000-0000-4000-8000-000000000001')on conflict(organization_id)do update set assignment_required=false,self_approval_allowed=true;
 b:=jsonb_build_array(pg_temp.block('prose','paragraph','{"text":"Human informational contribution dated 2026"}'));
 m:=pg_temp.manifest('answer','external',jsonb_build_array(pg_temp.source_ref(pg_temp.val('source_a','')::uuid)),pg_temp.summary(b));
 written:=pg_temp.person_write('answer','stage21 informational release','external',m,b);
 select*into strict r from public.artifact_revisions where id=(written->>'revision_id')::uuid;
 if private.artifact_revision_release_v1(r)<>'blocked'then raise exception 'unreviewed informational answer released';end if;
 set local role authenticated;
 begin perform public.request_artifact_export_v1(r.id,'docx','pt-BR',gen_random_uuid(),'default');raise exception 'unreviewed external answer exported';exception when insufficient_privilege then null;end;
 reviewed:=public.review_artifact_revision_v1(r.id,r.manifest_fingerprint,'approve',null,'Explicit human approval',true,gen_random_uuid());reset role;
 if private.artifact_revision_release_v1(r)<>'released'then raise exception 'exact informational review did not release';end if;
 set local role authenticated;
 request:=public.request_artifact_export_v1(r.id,'docx','pt-BR',gen_random_uuid(),'default');reset role;
 if request->>'status'<>'queued'then raise exception 'reviewed informational export not queued';end if;
 raise notice 'PASS import_informational_external_exact_review_releases_and_export_queues';
 begin
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 values(r.organization_id,pg_temp.val('source_a','')::uuid,(select max(revision)+1 from private.source_rights_versions where source_version_id=pg_temp.val('source_a','')::uuid),array['process'],array['analysis'],'authorized_workspace',clock_timestamp(),'human_declaration',gen_random_uuid(),repeat('d',64),'a11b0000-0000-4000-8000-000000000001');
 if private.artifact_revision_release_v1(r)<>'blocked'then raise exception 'revoked source retained informational release';end if;
 set local role authenticated;
 begin perform public.request_artifact_export_v1(r.id,'docx','pt-BR',gen_random_uuid(),'default');raise exception 'revoked informational source exported';exception when insufficient_privilege then null;end;reset role;
 raise notice 'PASS import_informational_approved_source_revocation_blocks_release';
 raise exception 'rollback_source_release_eval'using errcode='ZX021';exception when sqlstate 'ZX021'then null;end;
 begin
 update public.organization_memberships set status='revoked'where organization_id=r.organization_id and user_id='a11b0000-0000-4000-8000-000000000001';
 if private.artifact_revision_release_v1(r)<>'blocked'then raise exception 'revoked reviewer retained informational release';end if;
 set local role authenticated;
 begin perform public.request_artifact_export_v1(r.id,'docx','pt-BR',gen_random_uuid(),'default');raise exception 'revoked informational reviewer exported';exception when insufficient_privilege then null;end;reset role;
 raise notice 'PASS import_informational_reviewer_access_revocation_blocks_release';
 raise exception 'rollback_reviewer_release_eval'using errcode='ZX021';exception when sqlstate 'ZX021'then null;end;
 set local role authenticated;
 perform public.review_artifact_revision_v1(r.id,r.manifest_fingerprint,'revoke_approval',null,'Approval revoked',false,gen_random_uuid(),(reviewed->>'reviewId')::uuid);reset role;
 if private.artifact_revision_release_v1(r)<>'blocked'then raise exception 'revoked informational approval retained release';end if;
 set local role authenticated;
 begin perform public.request_artifact_export_v1(r.id,'docx','pt-BR',gen_random_uuid(),'default');raise exception 'revoked informational answer exported';exception when insufficient_privilege then null;end;reset role;
 raise notice 'PASS import_informational_revoked_review_blocks_export';
 -- An actual person-authored financial answer still requires the existing financial authority.
 b:=jsonb_build_array(pg_temp.block('financial','paragraph','{"text":"Financial amount 100"}',jsonb_build_array(pg_temp.claim('amount','100'::jsonb))));
 m:=pg_temp.manifest('answer','external',jsonb_build_array(pg_temp.source_ref(pg_temp.val('source_a','')::uuid)),pg_temp.summary(b));
 financial:=pg_temp.person_write('answer','stage21 financial negative','external',m,b);
 select*into strict financial_revision from public.artifact_revisions where id=(financial->>'revision_id')::uuid;
 before_state:=private.artifact_revision_release_v1(financial_revision);
 set local role authenticated;
 perform public.review_artifact_revision_v1(financial_revision.id,financial_revision.manifest_fingerprint,'approve',null,'Human review does not replace financial authority',true,gen_random_uuid());reset role;
 if before_state<>'blocked'or private.artifact_revision_release_v1(financial_revision)<>'blocked'
 or private.artifact_person_informational_release_v1(financial_revision)is not null then raise exception 'financial release gate bypassed';end if;
 raise notice 'PASS import_financial_release_gate_unchanged_by_informational_review';
 -- Real legacy material projection remains outside the informational release lane.
 insert into public.deal_state_objects(id,organization_id,intake_session_id,object_type,object_version,status,input_fingerprint,object_fingerprint,payload,dependencies,created_by_kind)
 values(legacy_id,'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','material_artifact',99,'pending_confirmation',repeat('1',64),repeat('7',64),
 jsonb_build_object('schemaVersion','2026.08.29-v1','materials',jsonb_build_array(jsonb_build_object('kind','teaser','artifactFingerprint',repeat('8',64))),
 'financialModel',jsonb_build_object('fingerprint',repeat('9',64),'workbooks',jsonb_build_object('pt',jsonb_build_object('sha256',repeat('b',64),'byteSize',10),'en',jsonb_build_object('sha256',repeat('c',64),'byteSize',11))),'materialTruth','{}'::jsonb,'dataRoom','{}'::jsonb),'[]','worker');
 select*into strict legacy_revision from public.artifact_revisions where legacy_ref->>'table'='deal_state_objects'and legacy_ref->>'id'=legacy_id::text;
 select jsonb_agg(jsonb_build_object('blockKey',block_key,'kind',kind,'content',content,'claims',claims)order by block_no)into legacy_blocks from public.artifact_blocks where revision_id=legacy_revision.id;
 legacy_manifest:=legacy_revision.manifest||jsonb_build_object('audience','external');
 legacy_external:=private.create_artifact_revision_v1(legacy_revision.organization_id,'a11b0000-0000-4000-9000-000000000002','material','stage21 legacy financial negative','external',legacy_revision.origin,legacy_manifest,legacy_blocks,'[]',null,null,legacy_revision.legacy_ref,legacy_revision.created_by);
 select*into strict legacy_revision from public.artifact_revisions where id=(legacy_external->>'revision_id')::uuid;
 if private.artifact_person_informational_release_v1(legacy_revision)is not null or private.artifact_revision_release_v1(legacy_revision)<>'blocked'then raise exception 'legacy financial release bypassed';end if;
 raise notice 'PASS import_legacy_financial_release_remains_blocked';
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
 request jsonb;claim jsonb;map jsonb;receipt jsonb;path text;obj uuid:=gen_random_uuid();source public.source_versions;candidate jsonb;comparison jsonb;contributions jsonb;scan jsonb;adopted jsonb;proof jsonb;target_configuration_id uuid;recalculation_job_id uuid;recalculation_context jsonb;
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
 if private.institutional_source_context(source.organization_id,'40000000-0000-4000-8000-000000000881'::uuid)->>'sourceManifestFingerprint'
 is distinct from private.institutional_configuration_provenance(source.organization_id,cfg.id)->>'sourceManifestFingerprint'
 then raise exception 'technical Office upload changed institutional model source context';end if;
 raise notice 'PASS native_import_technical_upload_preserves_model_source_context';
 begin
  update public.intake_field_candidates accepted set normalized_value='999'::jsonb where accepted.organization_id=source.organization_id and accepted.intake_session_id='40000000-0000-4000-8000-000000000881'::uuid and accepted.review_state='accepted'and accepted.value_type='number'and accepted.field_group in('historical_financials','interim_financials');
  if not found then raise exception 'financial source mutation fixture missing';end if;
  begin
   perform private.apply_institutional_configuration_review_before_projection_v1(artifact.work_id,cfg.id,cfg.parent_fingerprint,'approved',cfg.configuration_fingerprint);
   raise exception 'changed financial model source accepted';
  exception when serialization_failure then
   if sqlerrm<>'institutional_review_sources_changed'then raise;end if;
  end;
  raise exception 'rollback_financial_source_mutation'using errcode='ZX021';
 exception when sqlstate 'ZX021'then null;end;
 raise notice 'PASS native_import_genuine_financial_source_mutation_still_denied';
 begin
  insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
  values(source.organization_id,source.id,(select max(sr.revision)+1 from private.source_rights_versions sr where sr.source_version_id=source.id),array['process'],array['analysis'],'authorized_workspace',clock_timestamp(),'human_declaration',gen_random_uuid(),repeat('d',64),'10000000-0000-4000-8000-000000000881');
  set local role authenticated;
  begin
   perform public.adopt_artifact_import_group_v1('a4210000-0000-4000-9000-000000000021',revision.id,candidate->>'comparisonFingerprint','[]',gen_random_uuid(),'en-US',true,null,null,null,cfg.id,false);
   raise exception 'revoked Office contribution adopted';
  exception when insufficient_privilege then reset role;end;
  raise exception 'rollback_office_source_revocation'using errcode='ZX021';
 exception when sqlstate 'ZX021'then null;end;
 raise notice 'PASS native_import_revoked_office_source_blocks_adoption';
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
 or not exists(select 1 from jsonb_array_elements(proof->'sources')pin where pin->>'sourceVersionId'=source.id::text)
 then raise exception 'native import did not capture lineage, review and deterministic request';end if;
 raise notice 'PASS native_import_capture_v2_review_and_real_deterministic_request';
 -- The import extension preserves the established classifier's scope denial reasons.
 proof:=private.institutional_configuration_ancestry_v1(source.organization_id,gen_random_uuid(),target_configuration_id);
 if proof->>'state'<>'unresolved'or proof->>'reason'<>'work_mismatch'or proof?'nodes'or proof?'sources'then raise exception 'import ancestry foreign work classification changed: %',proof;end if;
 proof:=private.institutional_configuration_ancestry_v1(source.organization_id,artifact.work_id,gen_random_uuid());
 if proof->>'state'<>'unresolved'or proof->>'reason'<>'configuration_missing'or proof?'nodes'or proof?'sources'then raise exception 'import ancestry missing configuration classification changed: %',proof;end if;
 proof:=private.institutional_configuration_ancestry_v1(gen_random_uuid(),artifact.work_id,target_configuration_id);
 if proof->>'state'<>'unresolved'or proof->>'reason'<>'configuration_missing'or proof?'nodes'or proof?'sources'then raise exception 'import ancestry foreign tenant classification changed: %',proof;end if;
 raise notice 'PASS native_import_ancestry_scope_classification_preserves_denial';
 select j.id into strict recalculation_job_id from public.processing_jobs j where j.kind='agent_operation_brief'and j.payload->>'message_id'=adopted#>>'{institutional,resultId}';
 update public.processing_jobs j set status='leased',attempts=1,lease_expires_at=now()+interval '10 minutes',capability_sha256=extensions.digest(repeat('x',64),'sha256')where j.id=recalculation_job_id;
 set local role authenticated;
 recalculation_context:=public.worker_load_institutional_model_context_v2(recalculation_job_id,repeat('x',64));reset role;
 if jsonb_typeof(recalculation_context->'inputSnapshot')is distinct from'object'then raise exception 'native import recalculation capture missing';end if;
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 values(source.organization_id,source.id,(select max(sr.revision)+1 from private.source_rights_versions sr where sr.source_version_id=source.id),array['process'],array['analysis'],'authorized_workspace',clock_timestamp(),'human_declaration',gen_random_uuid(),repeat('c',64),'10000000-0000-4000-8000-000000000881');
 set local role authenticated;
 begin perform public.worker_load_institutional_model_context_v2(recalculation_job_id,repeat('x',64));raise exception 'revoked Office source allowed native recalculation';exception when insufficient_privilege then reset role;end;
 if private.artifact_roundtrip_revision_allowed_v1(source.organization_id,(adopted->>'appliedRevisionId')::uuid,'10000000-0000-4000-8000-000000000881',false)then raise exception 'revoked Office source allowed derived import revision';end if;
 raise notice 'PASS native_import_office_revocation_reaches_recalculation_capture_and_derived_revision';
end;$$;
rollback;
