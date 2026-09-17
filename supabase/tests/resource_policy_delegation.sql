begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,source_document_id,kind,status,available_at,leased_by,leased_account_user_id,lease_expires_at,capability_sha256)
values('a3310000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000004','document_pipeline','leased',now(),'a3300000-0000-4000-8000-000000000001','a11b0000-0000-4000-8000-000000000002',now()+interval '10 minutes',extensions.digest(repeat('d',64),'sha256'));
create temp table delegation_ids as select id from private.principals where processing_job_id='a3310000-0000-4000-9000-000000000001';
-- The principal cannot be attached to groups, even by direct privileged test setup.
do $$ declare group_id uuid; begin
 group_id:=public.set_access_group_v1(null,'Synthetic delegation boundary');
 begin insert into private.access_group_memberships(organization_id,group_id,principal_id) values('a11b0000-0000-4000-9000-000000000001',group_id,(select id from delegation_ids)); raise exception 'delegated group membership accepted'; exception when check_violation then null; end;
 -- Correct capability under the wrong authenticated account is denied.
 begin perform private.job_for_capability('a3310000-0000-4000-9000-000000000001',repeat('d',64)); raise exception 'bearer capability crossed account'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 perform private.job_for_capability('a3310000-0000-4000-9000-000000000001',repeat('d',64));
 if not private.delegated_policy_access_v1((select id from delegation_ids),'a11b0000-0000-4000-9000-000000000003','read') then raise exception 'scoped delegation denied'; end if;
 if private.delegated_policy_access_v1((select id from delegation_ids),'a11b0000-0000-4000-9000-000000000099','read') or private.delegated_policy_access_v1((select id from delegation_ids),'a11b0000-0000-4000-9000-000000000003','manage') then raise exception 'delegation expanded resource or action'; end if;
end $$;
update private.principals set expires_at=now()-interval '1 second' where id=(select id from delegation_ids);
do $$ begin
 if private.delegated_policy_access_v1((select id from delegation_ids),'a11b0000-0000-4000-9000-000000000003','read') then raise exception 'expired delegation accepted'; end if;
 begin perform private.job_for_capability('a3310000-0000-4000-9000-000000000001',repeat('d',64)); raise exception 'expired delegation reached worker loader'; exception when insufficient_privilege then null; end;
end $$;
update private.principals set expires_at=now()+interval '10 minutes' where id=(select id from delegation_ids);
update private.worker_tokens set revoked_at=now() where id='a3300000-0000-4000-8000-000000000001';
do $$ begin
 begin perform private.job_for_capability('a3310000-0000-4000-9000-000000000001',repeat('d',64)); raise exception 'revoked credential reached worker loader'; exception when insufficient_privilege then null; end;
end $$;
update private.worker_tokens set revoked_at=null where id='a3300000-0000-4000-8000-000000000001';
-- A child barrier must also close the root-authorized worker path and leave no valid stale revision.
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
create temp table delegation_barrier as select public.set_information_barrier_v1(null,'a11b0000-0000-4000-9000-000000000003','Synthetic child barrier','[]'::jsonb) id;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform private.job_for_capability('a3310000-0000-4000-9000-000000000001',repeat('d',64)); raise exception 'child barrier bypassed by root job'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select public.set_information_barrier_v1((select id from delegation_barrier),'a11b0000-0000-4000-9000-000000000003','Synthetic child barrier','[]'::jsonb,false);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 if private.job_authority_is_current_v1('a3310000-0000-4000-9000-000000000001') then raise exception 'regrant resurrected old execution'; end if;
end $$;
-- Policy mutation and its event are atomic: audit failure rolls the mutation back.
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
create function pg_temp.reject_policy_audit() returns trigger language plpgsql as $$ begin if new.aggregate_kind='access_policy' then raise exception 'synthetic_policy_audit_failure'; end if;return new;end $$;
create trigger synthetic_policy_audit_failure before insert on private.domain_events for each row execute function pg_temp.reject_policy_audit();
do $$ begin
 begin perform public.set_access_group_v1(null,'Synthetic rejected group'); raise exception 'audit failure ignored'; exception when raise_exception then if sqlerrm<>'synthetic_policy_audit_failure' then raise; end if;end;
 if exists(select 1 from private.access_groups where name='Synthetic rejected group') then raise exception 'failed policy mutation survived'; end if;
end $$;
select 'resource_policy_delegation: PASS' result;
rollback;
