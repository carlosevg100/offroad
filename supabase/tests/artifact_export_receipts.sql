-- Stage21 SQL lifecycle and access tests. Storage SDK byte proof is a separate worker integration eval.
begin;
\ir support/artifact_roundtrip_setup.sql

do $$declare receipt jsonb;replay jsonb;t jsonb;
begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 receipt:=public.read_artifact_export_receipt_v1(pg_temp.val('rt_receipt','receiptId')::uuid);
 replay:=public.request_artifact_export_v1(pg_temp.val('rt_revision','revision_id')::uuid,'docx','pt-BR','a4210000-0000-4000-9000-000000000001','default');
 t:=public.read_artifact_roundtrip_task_v1(pg_temp.val('rt_request','taskId')::uuid);reset role;
 if receipt->'roundtripManifest'is distinct from(select value from arp where name='rt_map')or receipt->>'sha256'<>repeat('a',64)
 or replay->>'receiptId'<>receipt->>'id'or replay->>'status'<>'completed'or t->>'artifactId'<>receipt->>'artifactId'then raise exception 'receipt binding/replay failed';end if;
 if not private.artifact_roundtrip_storage_allowed_v1('case-artifacts',pg_temp.val('rt_path',''),false)or private.artifact_roundtrip_storage_allowed_v1('case-artifacts',pg_temp.val('rt_path',''),true)then raise exception 'human storage lease was too broad';end if;
 raise notice 'PASS export_receipt_exact_bytes_and_manifest_replay';
end;$$;

do $$begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');set local role authenticated;
 begin perform public.read_artifact_export_receipt_v1(pg_temp.val('rt_receipt','receiptId')::uuid);raise exception 'member obtained receipt';exception when insufficient_privilege then null;end;reset role;
 perform pg_temp.act_as('a4192000-0000-4000-8000-000000000001');set local role authenticated;
 begin perform public.request_artifact_export_v1(pg_temp.val('rt_revision','revision_id')::uuid,'docx','pt-BR',gen_random_uuid(),'default');raise exception 'cross tenant export';exception when insufficient_privilege then null;end;reset role;
 raise notice 'PASS export_member_and_cross_tenant_denied';
end;$$;

do $$begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 begin perform public.worker_prepare_artifact_export_storage_v1(pg_temp.val('rt_request','taskId')::uuid,pg_temp.val('rt_claim','capabilityToken'),repeat('b',64),12);raise exception 'human committed hash';exception when insufficient_privilege then null;end;
 begin perform private.validate_artifact_export_manifest_v1(null,null,null);raise exception 'public called capture validator';exception when insufficient_privilege then null;end;reset role;
 begin update public.artifact_export_receipts set content_sha256=repeat('b',64)where id=pg_temp.val('rt_receipt','receiptId')::uuid;raise exception 'receipt mutable';exception when check_violation or insufficient_privilege or sqlstate '55000'then if sqlerrm='receipt mutable'then raise;end if;end;
 raise notice 'PASS export_human_hash_writer_and_receipt_mutation_denied';
end;$$;

do $$declare m jsonb:=(select value from arp where name='rt_map');r public.artifact_revisions;t private.artifact_roundtrip_tasks;
begin
 select*into r from public.artifact_revisions where id=pg_temp.val('rt_revision','revision_id')::uuid;
 select*into t from private.artifact_roundtrip_tasks where id=pg_temp.val('rt_request','taskId')::uuid;
 begin perform private.validate_artifact_export_manifest_v1(m||jsonb_build_object('logicalManifestFingerprint',repeat('b',64)),r,t);raise exception 'forged identity accepted';exception when invalid_parameter_value then null;end;
 begin perform private.validate_artifact_export_manifest_v1(jsonb_set(m,'{blocks}',(m->'blocks')||(m->'blocks')),r,t);raise exception 'duplicate map accepted';exception when invalid_parameter_value then null;end;
 raise notice 'PASS export_captured_manifest_identity_and_duplicate_denied';
end;$$;
do $$declare request jsonb;claim jsonb;v uuid:=pg_temp.val('source_a','')::uuid;
begin
 begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 request:=public.request_artifact_export_v1(pg_temp.val('rt_revision','revision_id')::uuid,'pdf','pt-BR',gen_random_uuid(),'default');reset role;
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');set local role authenticated;
 claim:=public.worker_claim_artifact_roundtrip_v1('synthetic-roundtrip-worker-token');
 begin perform public.worker_revalidate_artifact_roundtrip_v1((claim->>'taskId')::uuid,'wrong-capability');raise exception 'wrong lease accepted';exception when insufficient_privilege then null;end;reset role;
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 values('a11b0000-0000-4000-9000-000000000001',v,(select max(revision)+1from private.source_rights_versions where source_version_id=v),array['process'],array['analysis'],'authorized_workspace',clock_timestamp(),'human_declaration',gen_random_uuid(),repeat('d',64),'a11b0000-0000-4000-8000-000000000001');
 set local role authenticated;
 begin perform public.worker_revalidate_artifact_roundtrip_v1((claim->>'taskId')::uuid,claim->>'capabilityToken');raise exception 'revoked leased worker retained source';exception when insufficient_privilege then null;end;reset role;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 begin perform public.read_artifact_export_receipt_v1(pg_temp.val('rt_receipt','receiptId')::uuid);raise exception 'revoked receipt retained access';exception when insufficient_privilege then null;end;
 if private.artifact_roundtrip_storage_allowed_v1('case-artifacts',pg_temp.val('rt_path',''),false)then raise exception 'revoked receipt storage still readable';end if;reset role;
 raise notice 'PASS export_revocation_reaches_receipt_storage_and_leased_worker';
 raise exception 'rollback_revocation'using errcode='ZX021';exception when sqlstate 'ZX021'then null;end;
end;$$;
rollback;
