-- Synthetic transaction only: no remote accounts, receipts, or storage bytes.
\ir artifact_revision_setup.sql
insert into auth.users(id,email)values('a4210000-0000-4000-8000-000000000001','roundtrip-worker@example.invalid');
insert into private.worker_tokens(label,token_sha256,execution_account_user_id)
values('synthetic roundtrip worker',extensions.digest('synthetic-roundtrip-worker-token','sha256'),'a4210000-0000-4000-8000-000000000001');
do $$declare b jsonb;m jsonb;r jsonb;task jsonb;claim jsonb;manifest jsonb;out_path text;receipt jsonb;obj uuid:=gen_random_uuid();
begin
 b:=jsonb_build_array(pg_temp.block('lead','paragraph','{"text":"Original prose"}'));
 m:=pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(pg_temp.val('source_a','')::uuid)),pg_temp.summary(b));
 r:=pg_temp.person_write('answer','roundtrip-test','internal',m,b);
 perform pg_temp.remember('rt_revision',r);
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 task:=public.request_artifact_export_v1((r->>'revision_id')::uuid,'docx','pt-BR','a4210000-0000-4000-9000-000000000001','default');reset role;
 perform pg_temp.remember('rt_request',task);
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');set local role authenticated;
 claim:=public.worker_claim_artifact_roundtrip_v1('synthetic-roundtrip-worker-token');reset role;
 if claim->>'taskId'<>task->>'taskId'or claim#>>'{producer,kind}'<>'blocks'then raise exception 'claim did not bind exact revision %',claim;end if;
 perform pg_temp.remember('rt_claim',claim);
 manifest:=jsonb_build_object('schemaVersion','artifact-roundtrip.2026.09.26-v1','artifactId',claim#>>'{revision,artifactId}','revisionId',r->>'revision_id','revisionNo',claim#>'{revision,revisionNo}',
 'logicalManifestFingerprint',claim#>>'{revision,logicalManifestFingerprint}','format','docx','variant','default','exportedAt',claim#>>'{revision,issuedAt}',
 'blocks',jsonb_build_array(jsonb_build_object('blockKey','lead','kind','paragraph','region',jsonb_build_object('kind','word','tag','offroad-lead','bookmark','offroad-lead'),'recorded',false,'claimIds','[]'::jsonb)),
 'inputs','[]'::jsonb,'outputs','[]'::jsonb,'formulas','[]'::jsonb);
 perform pg_temp.remember('rt_map',manifest);
 set local role authenticated;
 out_path:=public.worker_prepare_artifact_export_storage_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',repeat('a',64),12)->>'path';reset role;
 insert into storage.objects(id,bucket_id,name,metadata)values(obj,'case-artifacts',out_path,'{"size":12}');
 set local role authenticated;
 receipt:=public.worker_commit_artifact_export_v1((claim->>'taskId')::uuid,claim->>'capabilityToken',obj,null,manifest);reset role;
 perform pg_temp.remember('rt_receipt',receipt);perform pg_temp.remember('rt_path',to_jsonb(out_path));
end;$$;
