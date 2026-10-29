-- Rollback-only synthetic regression for adding the missing sibling after a partial upload.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);

-- The work and its intake retain their identity and state as new source events arrive.
update public.document_intake_sessions set status='processing'
where id='a11b0000-0000-4000-9000-000000000003';
set local role authenticated;
select public.register_intake_document_command(
 'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',
 'a9690000-0000-4000-9000-000000000001','a9690000-0000-4000-9000-000000000002',
 'opportunity-documents','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/missing.csv',
 'synthetic-missing.csv','text/csv',10,repeat('a',64));
do $$ declare r jsonb; begin
 if (select status from public.document_intake_sessions where id='a11b0000-0000-4000-9000-000000000003')<>'processing'
 then raise exception 'upload reopened processing intake';end if;
 r:=public.register_intake_document_command(
 'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',
 'a9690000-0000-4000-9000-000000000003','a9690000-0000-4000-9000-000000000004',
 'opportunity-documents','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/duplicate.csv',
 'synthetic-duplicate.csv','text/csv',10,repeat('a',64));
 if r->>'duplicate'<>'true' or r->>'id'<>'a9690000-0000-4000-9000-000000000002' then raise exception 'retry duplicated source';end if;
 if (select count(*) from public.intake_domain_events where event_type='document_received' and intake_session_id='a11b0000-0000-4000-9000-000000000003')<>1 then raise exception 'retry duplicated source event';end if;
end $$;
reset role;

update public.document_intake_sessions set status='review_ready'
where id='a11b0000-0000-4000-9000-000000000003';
set local role authenticated;
select public.register_intake_document_command(
 'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',
 'a9690000-0000-4000-9000-000000000005','a9690000-0000-4000-9000-000000000006',
 'opportunity-documents','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/next.csv',
 'synthetic-next.csv','text/csv',11,repeat('b',64));
reset role;

-- A membership alone, an archived work and final intake states still refuse the same command.
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 begin
  perform public.register_intake_document_command(
   'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',
   gen_random_uuid(),gen_random_uuid(),'opportunity-documents',
   'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/forbidden.csv',
   'forbidden.csv','text/csv',12,repeat('c',64));
  raise exception 'ungranted member uploaded';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
do $$ declare state text; begin
 foreach state in array array['confirmed','cancelled'] loop
  update public.document_intake_sessions set status=state where id='a11b0000-0000-4000-9000-000000000003';
  begin
   perform public.register_intake_document_command(
    'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',
    gen_random_uuid(),gen_random_uuid(),'opportunity-documents',
    'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/final.csv',
    'final.csv','text/csv',12,repeat('c',64));
   raise exception 'final intake accepted upload: %',state;
  exception when object_not_in_prerequisite_state then null;end;
 end loop;
 update public.document_intake_sessions set status='review_ready' where id='a11b0000-0000-4000-9000-000000000003';
 update public.capital_projects set status='archived' where id='a11b0000-0000-4000-9000-000000000002';
 begin
  perform public.register_intake_document_command(
   'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',
   gen_random_uuid(),gen_random_uuid(),'opportunity-documents',
   'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/archived.csv',
   'archived.csv','text/csv',12,repeat('c',64));
  raise exception 'archived work accepted upload';
 exception when object_not_in_prerequisite_state or insufficient_privilege then null;end;
end $$;
select 'work_document_upload_continuity: PASS' as result;
rollback;
