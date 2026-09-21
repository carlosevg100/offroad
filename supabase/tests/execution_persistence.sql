-- Synthetic rollback-only storage proof, not execution/claim authority.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
create function pg_temp.expect_execution_error(command text,expected text,test_name text,expected_constraint text default null) returns void language plpgsql as $$
declare actual_constraint text;begin
 begin execute command; exception when others then
  if sqlstate=expected then
   get stacked diagnostics actual_constraint=CONSTRAINT_NAME;
   if expected_constraint is not null and actual_constraint<>expected_constraint then raise exception 'Wrong constraint for %: %',test_name,actual_constraint;end if;
   raise notice 'PASS: %',test_name;return;end if;
  raise;
 end;
 raise exception 'Expected %: %',expected,test_name;
end $$;
create function pg_temp.create_execution_fixture(execution_id uuid,snapshot_text text) returns uuid language plpgsql as $$
declare org uuid:='a11b0000-0000-4000-9000-000000000001'; owner_id uuid:='a11b0000-0000-4000-8000-000000000001';
 work uuid:='a11b0000-0000-4000-9000-000000000002';principal uuid;snapshot uuid:=gen_random_uuid();base private.platform_method_releases;contract jsonb;
begin
 select id into strict principal from private.principals where organization_id=org and user_id=owner_id and kind='human';
 select * into strict base from private.platform_method_releases order by id limit 1;
 -- Existing intake-backed run tests storage without pretending the new consumer exists.
 insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by)
 values(execution_id,org,'a11b0000-0000-4000-9000-000000000003',(select max(run_no)+1 from public.processing_runs where organization_id=org),'manual','synthetic-storage-proof',owner_id);
 insert into public.work_executions(id,organization_id,work_id,principal_id,request_id,processing_run_id)
 values(execution_id,org,work,principal,execution_id,execution_id);
 insert into private.execution_input_snapshots(id,organization_id,execution_id,serialization_version,canonical_payload,payload_fingerprint)
 values(snapshot,org,execution_id,'offroad-execution-json-utf16-v1',snapshot_text,encode(extensions.digest(convert_to(snapshot_text,'UTF8'),'sha256'),'hex'));
 contract:=jsonb_build_object('schemaVersion','execution-contract.v1','executionId',execution_id,'organizationId',org,'workId',work,'principalId',principal,'requestId',execution_id,'processingRunId',execution_id,
 'audience',jsonb_build_object('kind','work_participants','workId',work),
 'inputs',jsonb_build_object('snapshotId',snapshot,'fingerprint',encode(extensions.digest(convert_to(snapshot_text,'UTF8'),'sha256'),'hex')),
 'method',jsonb_build_object('platformReleaseId',base.id,'methodId',base.method_id,'methodVersion',base.version,'baseManifestHash',base.manifest_hash,'manifestHash',base.manifest_hash,'houseReleaseId',null));
 -- SQL storage validates identity; only the TS loader asserts full contract/canonical bytes.
 insert into private.execution_manifests(id,organization_id,execution_id,snapshot_id,snapshot_fingerprint,platform_release_id,serialization_version,canonical_payload,payload_fingerprint)
 values(gen_random_uuid(),org,execution_id,snapshot,contract#>>'{inputs,fingerprint}',base.id,'offroad-execution-json-utf16-v1',contract::text,encode(extensions.digest(convert_to(contract::text,'UTF8'),'sha256'),'hex'));
 return snapshot;
end $$;
select pg_temp.create_execution_fixture('a4170000-0000-4000-9000-000000000001',coalesce(nullif(current_setting('offroad.test_execution_bytes',true),''),'{"amount":"12345678901234567890.123","label":"Ação 😀","values":[null,true,1e-7]}'));
select pg_temp.create_execution_fixture('a4170000-0000-4000-9000-000000000002','{"other":true}');
set constraints public.work_executions_complete immediate;
set constraints public.work_executions_complete deferred;
select pg_temp.expect_execution_error($q$update private.execution_input_snapshots set canonical_payload='{}'$q$,'23514','immutable snapshot');
select pg_temp.expect_execution_error($q$delete from private.execution_manifests$q$,'23514','immutable manifest');
select pg_temp.expect_execution_error($q$update public.work_executions set request_id=gen_random_uuid()$q$,'23514','immutable execution identity');
select pg_temp.expect_execution_error($q$select pg_temp.create_execution_fixture('a4170000-0000-4000-9000-000000000003','{"nested":{"x":1,"x":2}}')$q$,'22023','nested duplicate keys');
select pg_temp.expect_execution_error($q$select pg_temp.create_execution_fixture('a4170000-0000-4000-9000-000000000003','[{"__proto__":1}]')$q$,'22023','reserved key in array');
select pg_temp.expect_execution_error($q$insert into private.execution_input_snapshots(id,organization_id,execution_id,serialization_version,canonical_payload,payload_fingerprint) select gen_random_uuid(),organization_id,execution_id,serialization_version,canonical_payload,repeat('0',64) from private.execution_input_snapshots limit 1$q$,'23514','altered payload hash');
select pg_temp.expect_execution_error($q$insert into public.work_executions(id,organization_id,work_id,principal_id,request_id,processing_run_id) select gen_random_uuid(),organization_id,work_id,'a11b0000-0000-4000-8000-000000000001',gen_random_uuid(),processing_run_id from public.work_executions limit 1$q$,'23514','user UUID is not principal UUID');
select pg_temp.expect_execution_error($q$insert into public.work_executions(id,organization_id,work_id,principal_id,request_id,processing_run_id) select gen_random_uuid(),organization_id,gen_random_uuid(),principal_id,gen_random_uuid(),processing_run_id from public.work_executions limit 1$q$,'23514','run belongs to a different work');
select pg_temp.expect_execution_error($q$insert into public.work_executions(id,organization_id,work_id,principal_id,request_id,processing_run_id) select gen_random_uuid(),organization_id,work_id,principal_id,request_id,processing_run_id from public.work_executions limit 1$q$,'23505','request uniqueness','work_executions_organization_id_principal_id_request_id_key');
select pg_temp.expect_execution_error($q$select private.execution_json_projection_v1(repeat('[',130)||'0'||repeat(']',130))$q$,'22023','depth limit');
select pg_temp.expect_execution_error($q$select private.execution_json_projection_v1(null)$q$,'22023','missing payload');
select pg_temp.expect_execution_error($q$select private.execution_json_projection_v1(repeat(' ',8388609))$q$,'22023','payload size limit');
-- Rewrite a candidate only inside a subtransaction; immutable stored rows are never changed.
do $$ declare m private.execution_manifests;s private.execution_input_snapshots;p jsonb;begin
 select * into m from private.execution_manifests where execution_id='a4170000-0000-4000-9000-000000000001';
 select * into s from private.execution_input_snapshots where execution_id='a4170000-0000-4000-9000-000000000002';
 p:=jsonb_set(jsonb_set(m.payload,'{inputs,snapshotId}',to_jsonb(s.id)),'{inputs,fingerprint}',to_jsonb(s.payload_fingerprint));
 -- Use a fresh root so uniqueness cannot mask the cross-execution FK check.
 begin
  insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by)
  values('a4170000-0000-4000-9000-000000000003',m.organization_id,'a11b0000-0000-4000-9000-000000000003',100,'manual','synthetic-storage-proof','a11b0000-0000-4000-8000-000000000001');
  insert into public.work_executions select 'a4170000-0000-4000-9000-000000000003',organization_id,work_id,principal_id,'a4170000-0000-4000-9000-000000000003','a4170000-0000-4000-9000-000000000003',now(),now() from public.work_executions where id=m.execution_id;
  p:=p||jsonb_build_object('executionId','a4170000-0000-4000-9000-000000000003','requestId','a4170000-0000-4000-9000-000000000003','processingRunId','a4170000-0000-4000-9000-000000000003');
  insert into private.execution_manifests(id,organization_id,execution_id,snapshot_id,snapshot_fingerprint,platform_release_id,serialization_version,canonical_payload,payload_fingerprint)
  values(gen_random_uuid(),m.organization_id,'a4170000-0000-4000-9000-000000000003',s.id,s.payload_fingerprint,m.platform_release_id,m.serialization_version,p::text,encode(extensions.digest(p::text,'sha256'),'hex'));
  raise exception 'cross-execution snapshot accepted';
 exception when foreign_key_violation then raise notice 'PASS: snapshot cannot cross executions';end;
 begin
  insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by)
  values('a4170000-0000-4000-9000-000000000003',m.organization_id,'a11b0000-0000-4000-9000-000000000003',100,'manual','synthetic-storage-proof','a11b0000-0000-4000-8000-000000000001');
  insert into public.work_executions select 'a4170000-0000-4000-9000-000000000003',organization_id,work_id,principal_id,'a4170000-0000-4000-9000-000000000003','a4170000-0000-4000-9000-000000000003',now(),now() from public.work_executions where id=m.execution_id;
  set constraints public.work_executions_complete immediate;
  raise exception 'incomplete execution accepted';
 exception when check_violation then if sqlerrm<>'execution_storage_incomplete' then raise;end if;raise notice 'PASS: incomplete transaction denied';end;
end $$;
-- No grant to bypass with an alternate role, and RLS remains forced even if a future
-- grant is introduced deliberately. No policy is relaxed to test these boundaries.
do $$ declare t regclass;r text;cmd text;begin
 foreach t in array array['public.work_executions'::regclass,'private.execution_input_snapshots'::regclass,'private.execution_manifests'::regclass] loop
  if not exists(select 1 from pg_class where oid=t and relrowsecurity and relforcerowsecurity) then raise exception 'RLS not forced: %',t;end if;
  foreach r in array array['anon','authenticated','service_role'] loop
   foreach cmd in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    if has_table_privilege(r,t,cmd) then raise exception 'Unexpected grant: % % %',r,t,cmd;end if;
   end loop;
  end loop;
 end loop;
 if exists(select 1 from public.audit_events where resource_type in ('work_executions','execution_input_snapshots','execution_manifests') and metadata ?| array['payload','canonical_payload']) then raise exception 'payload copied to audit';end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform * from public.work_executions;raise exception 'direct read allowed';exception when insufficient_privilege then null;end;
 begin insert into public.work_executions default values;raise exception 'direct insert allowed';exception when insufficient_privilege then null;end;
 begin update public.work_executions set request_id=gen_random_uuid();raise exception 'direct update allowed';exception when insufficient_privilege then null;end;
 begin delete from public.work_executions;raise exception 'direct delete allowed';exception when insufficient_privilege then null;end;
 begin perform * from private.execution_input_snapshots;raise exception 'snapshot read allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'EXECUTION_ROUNDTRIP:'||jsonb_build_object('text',canonical_payload,'fingerprint',payload_fingerprint,'projection',payload,'version',serialization_version)::text from private.execution_input_snapshots where execution_id='a4170000-0000-4000-9000-000000000001';
select 'execution_persistence: PASS' result;
rollback;
