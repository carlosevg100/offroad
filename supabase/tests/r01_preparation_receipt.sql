-- A receipt is an immutable worker assertion, not an execution grant.
begin;
\ir support/r01_preparation_setup.sql
\ir support/r01_execution_profile.sql
update private.worker_tokens set execution_account_user_id='10000000-0000-4000-8000-000000000732' where id='a3300000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000732","role":"authenticated","aal":"aal1"}',true);
create temporary table r01_receipt_fixture as select gen_random_uuid() id,pg_temp.insert_r01_profile(payload) profile_id from r01_profile_test;
create function pg_temp.receipt_state() returns jsonb language sql as $$
 select private.load_r01_preparation_for_receipt_v1('80000000-0000-4000-8000-000000000731',repeat('u',64));
$$;
create temporary table r01_receipt_loaded as select pg_temp.receipt_state() state;
create function pg_temp.record_receipt(input_text text default '{}',expected text default null) returns uuid language sql as $$
 select private.record_r01_preparation_receipt_v1(f.id,'80000000-0000-4000-8000-000000000731',repeat('u',64),f.profile_id,
 coalesce(expected,s.state->>'authoritySnapshotHash'),input_text) from r01_receipt_fixture f cross join r01_receipt_loaded s;
$$;
create function pg_temp.receipt_denied(label text,command text,expected text default null) returns void language plpgsql as $$begin
 begin execute command;exception when others then
 if expected is not null and sqlerrm<>expected then raise;end if;
 if sqlstate not in ('42501','23505','22023') then raise;end if;
 raise notice 'PASS: %',label;return;end;
 raise exception 'Expected receipt denial: %',label;
end $$;
select pg_temp.record_receipt();
do $$declare r private.r01_preparation_receipts;begin
 select * into strict r from private.r01_preparation_receipts where id=(select id from r01_receipt_fixture);
 if r.grants_execution or not r.requires_consumer_replay or r.subject_user_id<>'10000000-0000-4000-8000-000000000731'
 or r.worker_account_user_id<>'10000000-0000-4000-8000-000000000732' or r.canonical_input<>'{}' then raise exception 'receipt identity or boundary lost';end if;
 if not exists(select 1 from public.audit_events where organization_id=r.organization_id and resource_type='r01_preparation_receipts' and resource_id=r.id::text) then raise exception 'receipt audit missing';end if;
 if pg_temp.record_receipt()<>r.id then raise exception 'replay changed receipt identity';end if;
 raise notice 'PASS: exact authority records immutable assertion with derived identities and idempotent replay';
end $$;
select pg_temp.receipt_denied('changed input cannot replace the receipt',$q$select pg_temp.record_receipt('{"changed":true}')$q$,'r01_receipt_replay_conflict');
select pg_temp.receipt_denied('changed loader snapshot rejected',$q$select pg_temp.record_receipt('{}',repeat('0',64))$q$,'r01_receipt_authority_changed');
select pg_temp.receipt_denied('receipt does not authorize R01 execution',$q$select private.require_execution_release_v1(profile_id) from r01_receipt_fixture$q$,'execution_r01_provenance_unavailable');
savepoint foreign_worker;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000731","role":"authenticated"}',true);
select pg_temp.receipt_denied('human account cannot borrow worker capability',$q$select pg_temp.record_receipt()$q$,'r01_receipt_denied');
rollback to foreign_worker;
savepoint revoked_token;
update private.worker_tokens set revoked_at=clock_timestamp() where id='a3300000-0000-4000-8000-000000000001';
select pg_temp.receipt_denied('revoked worker denies receipt replay',$q$select pg_temp.record_receipt()$q$,'r01_receipt_denied');
rollback to revoked_token;
savepoint expired_lease;
update public.processing_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id='80000000-0000-4000-8000-000000000731';
select pg_temp.receipt_denied('expired lease denies receipt replay',$q$select pg_temp.record_receipt()$q$);
rollback to expired_lease;
savepoint withdrawn_source;
update public.source_bindings set revoked_at=clock_timestamp(),revoked_by='10000000-0000-4000-8000-000000000731'
where source_version_id='10000000-0000-4000-8000-000000000001';
select pg_temp.receipt_denied('source revocation defeats a stored receipt',$q$select pg_temp.record_receipt()$q$);
rollback to withdrawn_source;
savepoint revoked_human;
update private.principals set revoked_at=clock_timestamp() where organization_id='20000000-0000-4000-8000-000000000731' and user_id='10000000-0000-4000-8000-000000000731';
select pg_temp.receipt_denied('human revocation defeats worker receipt replay',$q$select pg_temp.record_receipt()$q$);
rollback to revoked_human;
savepoint paused;
insert into private.receivables_analytical_release_grants(organization_id,enabled,note,granted_by)
values('20000000-0000-4000-8000-000000000731',false,'Synthetic test','synthetic-test');
select pg_temp.receipt_denied('pause denies receipt replay',$q$select pg_temp.record_receipt()$q$,'r01_preparation_release_denied');
rollback to paused;
do $$begin
 begin update private.r01_preparation_receipts set canonical_input=canonical_input;raise exception 'mutable receipt';exception when others then if sqlerrm<>'contribution_revision_immutable' then raise;end if;end;
 begin delete from private.r01_preparation_receipts;raise exception 'deletable receipt';exception when others then if sqlerrm<>'contribution_revision_immutable' then raise;end if;end;
 raise notice 'PASS: receipt cannot be overwritten or removed';
end $$;
do $$declare role_name text;begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
 if has_table_privilege(role_name,'private.r01_preparation_receipts','SELECT,INSERT,UPDATE,DELETE')
 or has_function_privilege(role_name,'private.record_r01_preparation_receipt_v1(uuid,uuid,text,uuid,text,text)','EXECUTE')
 or has_function_privilege(role_name,'private.load_r01_preparation_for_receipt_v1(uuid,text)','EXECUTE') then raise exception 'receipt exposed';end if;
 end loop;
 raise notice 'PASS: API roles cannot read or create a receipt';
end $$;
select 'r01_preparation_receipt: PASS' result;
rollback;
