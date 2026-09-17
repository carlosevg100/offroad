begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values('a11b0000-0000-4000-9000-000000000040','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000005','capital_project_analysis','succeeded','{}');
update public.processing_jobs set authorization_revision=authorization_revision+1,updated_at=clock_timestamp() where id='a11b0000-0000-4000-9000-000000000040';
do $$ begin
 begin
  update public.processing_jobs set status='queued' where id='a11b0000-0000-4000-9000-000000000040';
  raise exception 'historical job requeued without current approval';
 exception when insufficient_privilege then null; end;
 begin
  update public.processing_jobs set payload='{"unapproved":true}' where id='a11b0000-0000-4000-9000-000000000040';
  raise exception 'historical job payload became mutable';
 exception when insufficient_privilege then null; end;
end $$;
select 'PASS: terminal metadata only; requeue and payload denied' as result;

rollback;
