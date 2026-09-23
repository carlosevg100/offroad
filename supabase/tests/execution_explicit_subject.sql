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
