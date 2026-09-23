-- Closed execution core: explicit human authority, rollback-only synthetic data.
begin;
\ir support/execution_commands_fixture.sql

-- The existing second member has no access to the first member's private work.
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',contract::text,'{}') from execution_fixture$q$,'execution_access_denied','human wrapper cannot select another subject');
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_as_subject_v1(null,'a4171000-0000-4000-9000-000000000001',contract::text,'{}') from execution_fixture$q$,'execution_subject_required','explicit subject required');
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_as_subject_v1('a11b0000-0000-4000-8000-000000000002','a4171000-0000-4000-9000-000000000001',contract::text,'{}') from execution_fixture$q$,'execution_access_denied','explicit inaccessible subject denied');

-- Trusted internal core only: caller identity remains unchanged; no impersonation.
update execution_fixture set request=private.request_work_execution_as_subject_v1('a11b0000-0000-4000-8000-000000000001','a4171000-0000-4000-9000-000000000001',contract::text,'{}');
do $$declare j public.processing_jobs;r public.processing_runs;begin
 select x.* into strict j from public.processing_jobs x join execution_fixture f on x.id=(f.request->>'jobId')::uuid;
 select * into strict r from public.processing_runs where id=j.processing_run_id;
 if auth.uid() is distinct from 'a11b0000-0000-4000-8000-000000000002'::uuid
 or j.authorization_subject_id is distinct from 'a11b0000-0000-4000-8000-000000000001'::uuid
 or r.created_by is distinct from j.authorization_subject_id
 or private.job_authority_is_current_v1(j.id) is not true then raise exception 'explicit human authority not retained';end if;
 if private.resource_access_as_subject_v1(j.organization_id,j.work_id,auth.uid(),'work') then raise exception 'technical caller gained work authority';end if;
 raise notice 'PASS: internal request preserves human principal without changing caller or granting access';
end $$;
-- Exercise real storage/queue guards. Each rejected attempt rolls back its mutation
-- through expect_execution_command_error; no immutable trigger is disabled.
create function pg_temp.invalid_execution_binding(test_case text) returns void language plpgsql as $$
declare e public.work_executions;j public.processing_jobs;m private.execution_manifests;
 bad_run uuid:=gen_random_uuid();bad_execution uuid:=gen_random_uuid();bad_payload text;
begin
 select x.* into strict j from public.processing_jobs x join execution_fixture f on x.id=(f.request->>'jobId')::uuid;
 select * into strict e from public.work_executions where id=j.execution_id;
 if test_case='run_author' then
  update public.processing_runs set created_by='a11b0000-0000-4000-8000-000000000002' where id=j.processing_run_id;
 elsif test_case='run_pipeline' then
  update public.processing_runs set pipeline_version='work-conversation-v1' where id=j.processing_run_id;
 elsif test_case='revoked_principal' then
  update private.principals set revoked_at=clock_timestamp() where organization_id=e.organization_id and id=e.principal_id;
 elsif test_case='missing_execution' then
  j.execution_id:=bad_execution;
 elsif test_case='missing_manifest' then
  insert into public.processing_runs(id,organization_id,work_id,run_no,trigger,pipeline_version,created_by)
  select bad_run,r.organization_id,r.work_id,r.run_no+1000,'manual',r.pipeline_version,r.created_by from public.processing_runs r where r.id=j.processing_run_id;
  insert into public.work_executions(id,organization_id,work_id,principal_id,request_id,processing_run_id)
  values(bad_execution,e.organization_id,e.work_id,e.principal_id,bad_execution,bad_run);
  j.execution_id:=bad_execution;j.processing_run_id:=bad_run;
 elsif test_case='manifest_principal' then
  select * into strict m from private.execution_manifests where organization_id=e.organization_id and execution_id=e.id;
  bad_payload:=jsonb_set(m.payload,'{principalId}',to_jsonb(gen_random_uuid()::text))::text;
  insert into private.execution_manifests(id,organization_id,execution_id,snapshot_id,snapshot_fingerprint,platform_release_id,serialization_version,canonical_payload,payload_fingerprint)
  values(gen_random_uuid(),m.organization_id,m.execution_id,m.snapshot_id,m.snapshot_fingerprint,m.platform_release_id,m.serialization_version,bad_payload,
   encode(extensions.digest(convert_to(bad_payload,'UTF8'),'sha256'),'hex'));
  raise exception 'invalid manifest accepted';
 elsif test_case='execution_work' then
  insert into public.work_executions(id,organization_id,work_id,principal_id,request_id,processing_run_id)
  values(bad_execution,e.organization_id,gen_random_uuid(),e.principal_id,bad_execution,e.processing_run_id);
  raise exception 'invalid work accepted';
 else raise exception 'unknown binding test';end if;
 insert into public.processing_jobs(id,organization_id,work_id,processing_run_id,kind,execution_id,payload)
 values(gen_random_uuid(),j.organization_id,j.work_id,j.processing_run_id,'work_execution',j.execution_id,jsonb_build_object('executionId',j.execution_id));
end $$;
select pg_temp.expect_execution_command_error($q$select pg_temp.invalid_execution_binding('run_author')$q$,'job_authorization_denied','job denies run with different human author');
select pg_temp.expect_execution_command_error($q$select pg_temp.invalid_execution_binding('run_pipeline')$q$,'job_authorization_denied','job denies incompatible run pipeline');
select pg_temp.expect_execution_command_error($q$select pg_temp.invalid_execution_binding('revoked_principal')$q$,'job_authorization_denied','job denies revoked human principal');
select pg_temp.expect_execution_command_error($q$select pg_temp.invalid_execution_binding('missing_execution')$q$,'job_authorization_denied','job denies missing execution');
select pg_temp.expect_execution_command_error($q$select pg_temp.invalid_execution_binding('missing_manifest')$q$,'job_authorization_denied','job denies missing manifest');
select pg_temp.expect_execution_command_error($q$select pg_temp.invalid_execution_binding('manifest_principal')$q$,'execution_manifest_identity_mismatch','storage denies manifest with different principal');
select pg_temp.expect_execution_command_error($q$select pg_temp.invalid_execution_binding('execution_work')$q$,'execution_principal_run_mismatch','storage denies execution and run work mismatch');
do $$declare r jsonb;begin
 select private.request_work_execution_as_subject_v1('a11b0000-0000-4000-8000-000000000001','a4171000-0000-4000-9000-000000000001',contract::text,'{}') into r from execution_fixture;
 if r->>'replayed' is distinct from 'true' then raise exception 'explicit request not idempotent';end if;
 raise notice 'PASS: explicit request replay is idempotent';
end $$;
update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='a11b0000-0000-4000-8000-000000000001';
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_as_subject_v1('a11b0000-0000-4000-8000-000000000001','a4171000-0000-4000-9000-000000000001',contract::text,'{}') from execution_fixture$q$,'execution_access_denied','banned subject cannot replay');
update auth.users set banned_until=null where id='a11b0000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select private.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
select pg_temp.expect_execution_command_error($q$select private.request_work_execution_as_subject_v1('a11b0000-0000-4000-8000-000000000001','a4171000-0000-4000-9000-000000000001',contract::text,'{}') from execution_fixture$q$,'execution_access_denied','revocation denies explicit replay');
do $$declare r text;f text;begin
 foreach r in array array['anon','authenticated','service_role'] loop
  foreach f in array array['private.request_work_execution_as_subject_v1(uuid,uuid,text,text)','private.request_work_execution_v1(uuid,text,text)'] loop
   if has_function_privilege(r,f,'EXECUTE') then raise exception 'explicit subject core exposed: % %',r,f;end if;
  end loop;
 end loop;
 raise notice 'PASS: API roles cannot choose an execution subject';
end $$;
select 'execution_explicit_subject: PASS' result;
rollback;
