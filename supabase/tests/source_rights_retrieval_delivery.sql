begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
\ir support/execution_approval.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,status,available_at,leased_by,leased_account_user_id,lease_expires_at,capability_sha256)
values('a7720000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003','case_analysis','leased',now(),'a3300000-0000-4000-8000-000000000001','a11b0000-0000-4000-8000-000000000002',now()+interval '10 minutes',extensions.digest(repeat('d',64),'sha256'));
select pg_temp.fixture_approve_execution('a7720000-0000-4000-9000-000000000001',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ declare response jsonb; begin
 response:=public.worker_load_retrieval_context('a7720000-0000-4000-9000-000000000001',repeat('d',64),'confidential');
 if not exists(select 1 from jsonb_array_elements(response->'results') r where r->>'source'='case') then raise exception 'licensed case missing before delivery race'; end if;
end $$;
reset role;
-- Inject a real rights mutation after selection and before delivery. Keeping process/store
-- proves that a generic job check alone is insufficient: derive must be revalidated too.
create function pg_temp.revoke_derivation_during_retrieval() returns trigger language plpgsql security definer set search_path='' as $$
declare previous_subject text:=current_setting('request.jwt.claim.sub',true);
begin
 perform set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
 perform public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,array['read','process','store'],array['analysis'],null,null,gen_random_uuid(),repeat('b',64));
 perform set_config('request.jwt.claim.sub',previous_subject,true);
 return new;
end $$;
revoke all on function pg_temp.revoke_derivation_during_retrieval() from public,anon,authenticated,service_role;
create trigger synthetic_retrieval_revocation before insert on private.retrieval_audit_events for each row execute function pg_temp.revoke_derivation_during_retrieval();
set local role authenticated;
do $$ begin
 begin
  perform public.worker_load_retrieval_context('a7720000-0000-4000-9000-000000000001',repeat('d',64),'confidential');
  raise exception 'retrieval returned selected content after derivation revocation';
 exception when insufficient_privilege then
  if sqlerrm<>'retrieval_rights_changed' then raise; end if;
 end;
end $$;
reset role;
select 'source_rights_retrieval_delivery' as test,'PASS' as result;
rollback;
