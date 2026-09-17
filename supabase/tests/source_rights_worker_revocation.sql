begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,available_at,leased_by,leased_account_user_id,lease_expires_at,capability_sha256)
values('a7710000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000004','document_pipeline','leased',now(),'a3300000-0000-4000-8000-000000000001','a11b0000-0000-4000-8000-000000000002',now()+interval '10 minutes',extensions.digest(repeat('d',64),'sha256'));
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
select private.job_for_capability('a7710000-0000-4000-9000-000000000001',repeat('d',64));
-- Keep read, remove process/store. The human may still inspect the source but the leased
-- worker must immediately lose its capability at every existing capability consumer.
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,array['read'],array['analysis'],null,null,gen_random_uuid(),repeat('a',64));
do $$ begin
 if not exists(select 1 from public.source_versions where id='a11b0000-0000-4000-9000-000000000004') then raise exception 'processing revocation incorrectly removed human read'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform private.job_for_capability('a7710000-0000-4000-9000-000000000001',repeat('d',64)); raise exception 'revoked processing right left leased capability valid'; exception when insufficient_privilege then null; end;
 if private.job_authority_is_current_v1('a7710000-0000-4000-9000-000000000001') then raise exception 'revoked job revision remained current'; end if;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',2,array['read','process','store','derive','export'],array['analysis','export'],null,null,gen_random_uuid(),repeat('b',64));
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform private.job_for_capability('a7710000-0000-4000-9000-000000000001',repeat('d',64)); raise exception 'regrant resurrected stale leased capability'; exception when insufficient_privilege then null; end;
end $$;
select 'source_rights_worker_revocation' as test,'PASS' as result;
rollback;
