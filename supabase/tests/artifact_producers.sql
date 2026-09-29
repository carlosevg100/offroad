-- Stage 19, increment 4: the producers on the common command (migration B), on synthetic rows.
-- A committed execution has exactly one execution_result revision, written by the commit itself:
-- its manifest names the receipt's result fingerprint, the release the execution ran, the input
-- snapshot, the pinned source with its pinned rights version and the job; its blocks are exactly the
-- ones the contract maps from the same packet (the shared fixture below), every number block with its
-- claim and supportIds. A replayed commit adds nothing; a result the producer cannot map still
-- commits and records no revision; a preview material revision carries the stored object's sha256 and
-- size and is refused for bytes the governed upload did not store for the work; another tenant can
-- neither write on the work nor read the revision. Everything rolls back.
begin;
\ir support/execution_artifact_setup.sql

-- 1. The SQL mapping is the contract's mapping: the blocks of the shared packet are exactly the blocks
-- capitalProcedurePacketBlocks returns for it.
do $$
begin
 if private.execution_result_blocks_v1(current_setting('test.producers.packet')::jsonb)<>current_setting('test.producers.blocks')::jsonb then
  raise exception 'SQL blocks differ from the contract blocks: %',private.execution_result_blocks_v1(current_setting('test.producers.packet')::jsonb);
 end if;
 raise notice 'PASS: the SQL mapping of the shared packet equals the contract mapping';
end $$;

-- 2. A committed execution pinning one source has exactly one execution_result revision, written by
-- the commit: origin worker, audience internal, no bytes, the derived id; its manifest names the
-- receipt's result and input fingerprints, the input snapshot, the release the execution ran, the
-- pinned source with the pinned rights version (the packet's contract source merged into the same
-- entry), the gate-free traces and the job; its blocks are the contract's; the reader keeps it internal despite
-- the receipt and finds it current.
do $$ declare exec uuid:='a4194000-0000-4000-9000-000000000101';src uuid;packet text;run jsonb;rev public.artifact_revisions;art public.artifacts;
 receipt private.execution_result_receipts;blocks jsonb;x jsonb;pinned uuid;n integer;
begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 src:=pg_temp.source_version('producers-balancete-v1');
 packet:=jsonb_set(current_setting('test.producers.packet')::jsonb,'{contractSourceVersionIds}',jsonb_build_array(src))::text;
 run:=pg_temp.commit_execution(exec,packet,src);
 if run#>>'{commit,committed}'<>'true' or run#>>'{commit,replayed}'<>'false' then raise exception 'commit: %',run; end if;
 insert into producers_state values('run',run),('source',to_jsonb(src)),('revisions_before_replay',to_jsonb((select count(*) from public.artifact_revisions)));
 select count(*) into n from public.artifact_revisions r where r.manifest#>>'{execution,executionId}'=exec::text;
 if n<>1 then raise exception 'expected exactly one execution_result revision, found %',n; end if;
 select * into strict rev from public.artifact_revisions r where r.id=pg_temp.revision_of(exec);
 select * into strict art from public.artifacts a where a.id=rev.artifact_id;
 select * into strict receipt from private.execution_result_receipts r where r.execution_id=exec;
 select d.rights_version_id into strict pinned from private.execution_dependencies d where d.execution_id=exec and d.dependency_kind='source_version' and d.source_version_id=src;
 if art.kind<>'execution_result' or art.subject<>'execution:'||exec or art.work_id<>'a11b0000-0000-4000-9000-000000000002' or art.head_revision_id<>rev.id
  or rev.origin<>'worker' or rev.audience<>'internal' or rev.revision_no<>1 or rev.created_by is not null or rev.content_sha256 is not null or rev.byte_length is not null
 then raise exception 'revision identity: % %',to_jsonb(art),to_jsonb(rev); end if;
 if rev.manifest->'execution'<>jsonb_build_object('executionId',exec,'resultFingerprint',receipt.result_fingerprint,'inputFingerprint',receipt.input_fingerprint)
  or rev.manifest#>>'{inputSnapshot,fingerprint}' is distinct from (select s.payload_fingerprint from private.execution_input_snapshots s where s.execution_id=exec)
  or rev.manifest->'method'<>'{"procedureId":"synthetic-execution","platformReleaseId":"synthetic-execution-test-v1","houseReleaseId":null,"version":"test-v1"}'::jsonb
  or rev.manifest->'sources'<>jsonb_build_array(jsonb_build_object('sourceVersionId',src,'rightsVersionId',pinned))
  or rev.manifest->'provenance'<>jsonb_build_object('producer','work-execution-commit','jobId',run->'jobId','taskRunId',null,'messageId',null,'capability','pinned-execution-consumer.v1')
  or rev.manifest->'traces'<>jsonb_build_array('capital-procedure-packet:'||repeat('a',64),'capital-decision-delivery:'||repeat('7',64),'financial-core:financial-core.2026.09.18',
   'ratio:ratio-leverage:'||repeat('8',64),'ratio:ratio-coverage:'||repeat('9',64))
  or rev.manifest->'bytes'<>'null'::jsonb or rev.manifest->>'format'<>'json'
 then raise exception 'manifest: %',rev.manifest; end if;
 select jsonb_agg(jsonb_build_object('blockKey',b.block_key,'kind',b.kind,'content',b.content,'claims',b.claims) order by b.block_no) into blocks
 from public.artifact_blocks b where b.revision_id=rev.id;
 if blocks<>current_setting('test.producers.blocks')::jsonb then raise exception 'stored blocks differ from the contract blocks: %',blocks; end if;
 if exists(select 1 from public.artifact_blocks b where b.revision_id=rev.id and b.kind='number'
   and (jsonb_array_length(b.claims)<>1 or b.claims#>>'{0,value}'<>b.content->>'value' or jsonb_array_length(b.claims#>'{0,supportIds}')=0))
  or (select count(*) from public.artifact_blocks b where b.revision_id=rev.id and b.kind='number')<>4
 then raise exception 'number blocks without their claim and support'; end if;
 if (select count(*) from private.artifact_dependency_links l where l.revision_id=rev.id and l.link_kind='execution' and l.execution_id=exec)<>1
  or (select count(*) from private.artifact_dependency_links l where l.revision_id=rev.id and l.link_kind='method_release' and l.platform_release_id='synthetic-execution-test-v1')<>1
  or (select count(*) from private.artifact_dependency_links l where l.revision_id=rev.id and l.link_kind='source_version' and l.source_version_id=src and l.source_rights_version_id=pinned)<>1
 then raise exception 'links of the execution result'; end if;
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',rev.id);
 if x->>'release'<>'internal' or x->>'freshness'<>'current' or jsonb_typeof(x->'restriction')<>'null' or jsonb_array_length(x->'blocks')<>jsonb_array_length(blocks)
  or not (x->>'isHead')::boolean then raise exception 'reader: %',x; end if;
 raise notice 'PASS: the commit writes exactly one execution_result revision with the receipt fingerprint, the pinned source and the contract blocks, internal until exact human approval';
end $$;

-- 3. A replayed commit replays: the same receipt, no second revision, no new row anywhere in the protocol.
do $$ declare run jsonb:=(select value from producers_state where name='run');r jsonb;
begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 r:=private.commit_work_execution_result_v1((run->>'jobId')::uuid,run->>'capability',(run->>'leaseId')::uuid,run->>'contractFingerprint',
  encode(extensions.digest('{}','sha256'),'hex'),jsonb_set(current_setting('test.producers.packet')::jsonb,'{contractSourceVersionIds}',jsonb_build_array(
   (select value from producers_state where name='source')))::text,'succeeded','calculated');
 if r->>'replayed'<>'true' then raise exception 'second commit was not a replay: %',r; end if;
 if (select count(*) from public.artifact_revisions)<>(select (value#>>'{}')::bigint from producers_state where name='revisions_before_replay') then
  raise exception 'a replayed commit added a revision'; end if;
 if private.record_execution_result_artifact_v1('a11b0000-0000-4000-9000-000000000001','a4194000-0000-4000-9000-000000000101',(run->>'jobId')::uuid)
  <>jsonb_build_object('recorded',true,'replayed',true,'revisionId',pg_temp.revision_of('a4194000-0000-4000-9000-000000000101')) then
  raise exception 'the producer is not idempotent'; end if;
 raise notice 'PASS: a replayed commit adds nothing and the producer replays its own revision';
end $$;

-- 4. A result the producer cannot map still commits: a partial marker (not a packet) and a packet whose
-- decisive value is not a decimal text. Both receipts exist; neither execution has a revision.
do $$ declare marker uuid:='a4194000-0000-4000-9000-000000000102';broken uuid:='a4194000-0000-4000-9000-000000000103';run jsonb;packet jsonb;
begin
 run:=pg_temp.commit_execution(marker,'{"status":"partial","reason":"budget_exhausted"}',null);
 if run#>>'{commit,committed}'<>'true' then raise exception 'marker commit: %',run; end if;
 packet:=jsonb_set(current_setting('test.producers.packet')::jsonb,'{decision,alternatives,0,projection,rows,0,closingAvailable}','"1e3"');
 run:=pg_temp.commit_execution(broken,packet::text,null);
 if run#>>'{commit,committed}'<>'true' then raise exception 'unmappable packet commit: %',run; end if;
 if (select count(*) from private.execution_result_receipts r where r.execution_id in (marker,broken))<>2 then raise exception 'receipts missing'; end if;
 if exists(select 1 from public.artifact_revisions r where r.id in (pg_temp.revision_of(marker),pg_temp.revision_of(broken)))
  or exists(select 1 from public.artifacts a where a.subject in ('execution:'||marker,'execution:'||broken)) then
  raise exception 'an unmappable result left an artifact'; end if;
 if private.record_execution_result_artifact_v1('a11b0000-0000-4000-9000-000000000001',marker,(run->>'jobId')::uuid)->>'reason'<>'execution_result_unmappable'
  or private.record_execution_result_artifact_v1('a11b0000-0000-4000-9000-000000000001',broken,(run->>'jobId')::uuid)->>'code'<>'artifact_adapter_decimal_invalid' then
  raise exception 'producer outcome for unmappable results'; end if;
 raise notice 'PASS: a result the producer cannot map commits and records no revision';
end $$;

-- 5. The backfill finds nothing to add: every committed packet already has its revision.
do $$ declare counts jsonb;before bigint:=(select count(*) from public.artifact_revisions);
begin
 counts:=private.backfill_execution_result_artifacts_v1();
 if (counts->>'recorded')::integer<>0 or (counts->>'alreadyRecorded')::integer<1 or (counts->>'unmappable')::integer<1 or (counts->>'failed')::integer<1
  or (select count(*) from public.artifact_revisions)<>before then raise exception 'backfill: %',counts; end if;
 raise notice 'PASS: the backfill is idempotent over committed results';
end $$;

-- 6. A preview material: a leased worker job on the work's session, the governed upload's stored grant
-- and the object in the bucket. The worker command writes the revision with the stored object's sha256
-- and size; a size, a path, a grant not yet stored or an object missing from the bucket is refused.
-- A foreign tenant with its own work, session and leased job.
insert into auth.users(id,email) values('a4194000-0000-4000-8000-000000000001','producers-foreign@example.invalid');
insert into public.organizations(id,organization_type,name,created_by) values('a4194000-0000-4000-9000-000000000001','company','Synthetic foreign producers tenant','a4194000-0000-4000-8000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('a4194000-0000-4000-9000-000000000001','a4194000-0000-4000-8000-000000000001','owner','active',now());
insert into public.capital_projects(id,organization_id,project_name,created_by) values('a4194000-0000-4000-9000-000000000002','a4194000-0000-4000-9000-000000000001','Synthetic foreign work','a4194000-0000-4000-8000-000000000001');
insert into public.document_intake_sessions(id,organization_id,capital_project_id,started_by,journey) values('a4194000-0000-4000-9000-000000000003','a4194000-0000-4000-9000-000000000001','a4194000-0000-4000-9000-000000000002','a4194000-0000-4000-8000-000000000001','company');
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by)
values('a4194000-0000-4000-9000-000000000004','a4194000-0000-4000-9000-000000000001','a4194000-0000-4000-9000-000000000003',1,'manual','synthetic-producers','a4194000-0000-4000-8000-000000000001');
-- The job authority binding takes the signed-in subject: each job is inserted as its own tenant's owner,
-- and both leases are taken by the fixture's worker account, as the stage 19 protocol test does.
select pg_temp.act_as('a4194000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values('a4194000-0000-4000-9000-000000000005','a4194000-0000-4000-9000-000000000001','a4194000-0000-4000-9000-000000000003','a4194000-0000-4000-9000-000000000004','agent_operation_brief','queued','{}');
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by)
values('a4194000-0000-4000-9000-000000000014','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',94,'manual','synthetic-producers','a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values('a4194000-0000-4000-9000-000000000015','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a4194000-0000-4000-9000-000000000014','agent_operation_brief','queued','{}');
update public.processing_jobs set status='leased',capability_sha256=extensions.digest('synthetic-producers-foreign-token','sha256'),lease_expires_at=now()+interval '10 minutes'
where id='a4194000-0000-4000-9000-000000000005';
update public.processing_jobs set status='leased',capability_sha256=extensions.digest('synthetic-producers-worker-token-v1','sha256'),lease_expires_at=now()+interval '10 minutes'
where id='a4194000-0000-4000-9000-000000000015';
-- Stored grants as the governed upload leaves them (proved end to end by governed_capital_material_storage.sql).
insert into private.capital_project_material_upload_grants(worker_account_id,organization_id,capital_project_id,processing_job_id,object_path,content_sha256,byte_length,format,mime_type,state,storage_etag,expires_at,stored_at)
select 'a11b0000-0000-4000-8000-000000000001','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','a4194000-0000-4000-9000-000000000015',
 'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000002/materials/'||v.sha||'.'||v.fmt,v.sha,v.len,v.fmt,v.mime,v.state,
 case when v.state='stored' then 'etag-synthetic' end,now()+interval '1 hour',case when v.state='stored' then now() end
from (values(repeat('d',64),4096::bigint,'pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation','stored'),
 (repeat('e',64),2048::bigint,'xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','authorized'),
 (repeat('f',64),1024::bigint,'xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','stored')) v(sha,len,fmt,mime,state);
insert into storage.objects(bucket_id,name) values
 ('case-artifacts','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000002/materials/'||repeat('d',64)||'.pptx'),
 ('case-artifacts','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000002/materials/'||repeat('e',64)||'.xlsx');
create function pg_temp.material(p_sha text,p_len bigint,p_fmt text) returns jsonb language sql as $$
 select jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind',case when p_fmt='pptx' then 'presentation' else 'workbook' end,'audience','internal','format',p_fmt,
  'bytes',jsonb_build_object('sha256',p_sha,'byteLength',p_len,'storage',jsonb_build_object('bucket','case-artifacts',
   'path','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000002/materials/'||p_sha||'.'||p_fmt)),
  'method',null,'execution',null,'inputSnapshot',jsonb_build_object('fingerprint',repeat('4',64)),'institutionalResult',null,'sources','[]'::jsonb,
  'claims',jsonb_build_array(jsonb_build_object('blockKey',case when p_fmt='pptx' then 'presentation' else 'workbook' end,'claimIds',jsonb_build_array('claim-debt'))),
  'traces',jsonb_build_array('rendered-material:'||repeat('5',64)),'template',jsonb_build_object('templateVersionId','offroad-house@1','fingerprint',repeat('6',64)),
  'provenance',jsonb_build_object('producer','document-worker:integration-preview','jobId',null,'taskRunId',null,'messageId',null,'capability',null),'legacy',null) $$;
create function pg_temp.material_blocks(p_fmt text) returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('blockKey',case when p_fmt='pptx' then 'presentation' else 'workbook' end,'kind','section',
  'content',jsonb_build_object('surface',case when p_fmt='pptx' then 'presentation' else 'workbook' end,'format',p_fmt,'renderer','synthetic-renderer@1'),
  'claims',jsonb_build_array(jsonb_build_object('claimId','claim-debt','kind','fact','value',4200.5,'unit','BRL mn','period',null,'supportIds',jsonb_build_array('src-dfp'))))) $$;
create function pg_temp.worker_write(p_job uuid,p_token text,p_work uuid,p_manifest jsonb,p_blocks jsonb,p_sha text,p_len bigint) returns jsonb language plpgsql as $$
declare r jsonb;
begin
 set local role authenticated;
 r:=public.worker_create_artifact_revision_v1(p_job,p_token,'artifact-revision.v1',p_work,p_manifest->>'kind','integration-preview:'||(p_manifest#>>'{claims,0,blockKey}'),'internal',
  p_manifest,p_blocks,'[]'::jsonb,p_sha,p_len);
 reset role;
 return r;
end $$;

do $$ declare r jsonb;rev public.artifact_revisions;
 job uuid:='a4194000-0000-4000-9000-000000000015';token text:='synthetic-producers-worker-token-v1';work uuid:='a11b0000-0000-4000-9000-000000000002';
begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 r:=pg_temp.worker_write(job,token,work,pg_temp.material(repeat('d',64),4096,'pptx'),pg_temp.material_blocks('pptx'),repeat('d',64),4096);
 select * into strict rev from public.artifact_revisions x where x.id=(r->>'revision_id')::uuid;
 if rev.content_sha256<>repeat('d',64) or rev.byte_length<>4096 or rev.origin<>'worker' or rev.audience<>'internal'
  or rev.manifest#>>'{bytes,storage,path}'<>'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000002/materials/'||repeat('d',64)||'.pptx'
  or rev.manifest#>>'{provenance,jobId}'<>job::text or rev.manifest#>>'{provenance,capability}'<>'artifact-revision.v1'
  or (select kind from public.artifacts a where a.id=rev.artifact_id)<>'presentation'
 then raise exception 'material revision: %',to_jsonb(rev); end if;
 perform pg_temp.refused(format('select pg_temp.worker_write(%L,%L,%L,%L,%L,%L,%s)',job,token,work,pg_temp.material(repeat('d',64),4097,'pptx'),pg_temp.material_blocks('pptx'),repeat('d',64),4097),
  'artifact_stored_bytes_not_governed','a size other than the stored object''s');
 perform pg_temp.refused(format('select pg_temp.worker_write(%L,%L,%L,%L,%L,%L,%s)',job,token,work,pg_temp.material(repeat('e',64),2048,'xlsx'),pg_temp.material_blocks('xlsx'),repeat('e',64),2048),
  'artifact_stored_bytes_not_governed','an object whose upload grant is not stored');
 perform pg_temp.refused(format('select pg_temp.worker_write(%L,%L,%L,%L,%L,%L,%s)',job,token,work,pg_temp.material(repeat('f',64),1024,'xlsx'),pg_temp.material_blocks('xlsx'),repeat('f',64),1024),
  'artifact_stored_bytes_not_governed','a stored grant whose object is not in the bucket');
 perform pg_temp.refused(format('select pg_temp.worker_write(%L,%L,%L,%L,%L,%L,%s)',job,token,work,pg_temp.material(repeat('c',64),4096,'pptx'),pg_temp.material_blocks('pptx'),repeat('c',64),4096),
  'artifact_stored_bytes_not_governed','a path no upload grant names');
 raise notice 'PASS: the material revision carries the stored object''s sha256 and size and only a governed stored object';
end $$;

-- 7. Another tenant: its job cannot write on the work even naming the stored object, it cannot read the
-- execution result, and a plain member of the work's organization without access reads nothing either.
do $$ declare rev uuid:=pg_temp.revision_of('a4194000-0000-4000-9000-000000000101');
begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 perform pg_temp.refused(format('select pg_temp.worker_write(%L,%L,%L,%L,%L,%L,%s)','a4194000-0000-4000-9000-000000000005','synthetic-producers-foreign-token','a11b0000-0000-4000-9000-000000000002',
  pg_temp.material(repeat('d',64),4096,'pptx'),pg_temp.material_blocks('pptx'),repeat('d',64),4096),'artifact_work_mismatch','another tenant''s job on the work');
 perform pg_temp.refused(format('select pg_temp.read_as(%L,%L)','a4194000-0000-4000-8000-000000000001',rev),'artifact_revision_not_found','another tenant reading the execution result');
 perform pg_temp.refused(format('select pg_temp.read_as(%L,%L)','a11b0000-0000-4000-8000-000000000002',rev),'artifact_revision_not_found','a member without access to the work');
 raise notice 'PASS: another tenant neither writes on the work nor reads its execution result';
end $$;

-- 8. The three functions of the migration are closed to every API role.
do $$ declare f text;
begin
 foreach f in array array['private.execution_result_blocks_v1(jsonb)','private.record_execution_result_artifact_v1(uuid,uuid,uuid)','private.backfill_execution_result_artifacts_v1()'] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then
   raise exception 'function exposed: %',f; end if;
 end loop;
 raise notice 'PASS: producer functions closed to API roles';
end $$;

select 'artifact_producers_passed' as result;
rollback;
