-- Shared synthetic producer fixture; caller owns transaction. No production execution.
\ir contextual_adoption_setup.sql
\ir execution_method_fixture.sql
set local lock_timeout='5s';
set local statement_timeout='120s';

-- The fixture the contract test maps (packages/domain-contracts/src/artifact-protocol.test.ts): the
-- packet and the blocks capitalProcedurePacketBlocks returns for it. psql runs from the repository root.
\set packet_text `cat packages/domain-contracts/src/fixtures/execution-result-packet.json`
\set blocks_text `cat packages/domain-contracts/src/fixtures/execution-result-blocks.json`
select set_config('test.producers.packet',:'packet_text',true) is not null as packet_loaded,
 set_config('test.producers.blocks',:'blocks_text',true) is not null as blocks_loaded;

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_user::text,''),true);
 perform set_config('request.jwt.claims',case when p_user is null then '' else jsonb_build_object('sub',p_user,'role','authenticated','aal','aal1')::text end,true);
end $$;
create function pg_temp.refused(p_sql text,p_error text,p_test text) returns void language plpgsql as $$
declare msg text;
begin
 begin
  execute p_sql;
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg like p_error||'%' then reset role; raise notice 'PASS: % (%)',p_test,p_error; return; end if;
  reset role;
  raise exception '% refused with % instead of %',p_test,msg,p_error;
 end;
 reset role;
 raise exception '% was accepted',p_test;
end $$;
create function pg_temp.read_as(p_user uuid,p_revision uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
 perform pg_temp.act_as(p_user);
 set local role authenticated;
 r:=public.read_artifact_revision_v1(p_revision);
 reset role;
 return r;
end $$;
-- One verified version of a new logical source; the stage 7 factory of the setup declares its rights.
create function pg_temp.source_version(p_name text) returns uuid language plpgsql as $$
declare v uuid:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:test:artifact-producers-source:'||p_name);hash text:=encode(extensions.digest(p_name,'sha256'),'hex');
begin
 insert into public.source_documents(id,organization_id,intake_session_id,logical_source_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status)
 values(v,'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',null,
  'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/'||p_name||'.txt','Synthetic source','text/plain',1,hash,'a11b0000-0000-4000-8000-000000000001','ready');
 insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
 values('a11b0000-0000-4000-9000-000000000001',v,gen_random_uuid(),hash,1,'synthetic-only-'||p_name);
 return v;
end $$;
-- Request, claim, operation, settlement and commit of one execution of the method fixture, exactly as
-- the stage 18 projection test drives them; the result text is what the worker would commit.
create function pg_temp.commit_execution(p_exec uuid,p_result text,p_source uuid) returns jsonb language plpgsql as $$
declare c jsonb;req jsonb;claim jsonb;r jsonb;
begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 c:=pg_temp.execution_contract_fixture(p_exec);
 if p_source is not null then
  c:=jsonb_set(c,'{inputs,sources}',jsonb_build_array(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId',p_source,
   'contentHash',(select declared_sha256 from public.source_versions where id=p_source),'rightsRevision','1')));
 end if;
 req:=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',c::text,'{}');
 claim:=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(req->>'jobId')::uuid,60);
 perform private.reserve_execution_operation_v1((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,p_exec,claim->>'contractFingerprint','synthetic#calculate','test-v1','read_only',0,0);
 perform private.settle_execution_operation_v2((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,p_exec,claim->>'contractFingerprint',p_result,'succeeded','calculated',0,0);
 r:=private.commit_work_execution_result_v1((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',
  encode(extensions.digest('{}','sha256'),'hex'),p_result,'succeeded','calculated');
 return jsonb_build_object('jobId',req->'jobId','capability',claim->'capability','leaseId',claim->'leaseId','contractFingerprint',claim->'contractFingerprint','commit',r);
end $$;
create function pg_temp.revision_of(p_exec uuid) returns uuid language sql as $$
 select extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:artifact-revision:execution_result:'||p_exec::text) $$;
create temporary table producers_state(name text primary key,value jsonb not null);

