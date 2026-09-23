-- Disposable synthetic proof: platform authority is bound to registered identities and ledgered.
begin;
\ir support/execution_commands_fixture.sql
\ir support/platform_method_fixture.sql
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('a11b0000-0000-4000-8000-000000000003','authenticated','authenticated','a11b-c@example.invalid','{}','{}',now(),now(),false,false);
insert into private.platform_principals(user_id,role,label) values
 ('a11b0000-0000-4000-8000-000000000001','founder','Synthetic founder'),
 ('a11b0000-0000-4000-8000-000000000002','operator','Synthetic operator');
create function pg_temp.expect_identity_error(command text,expected text,test_name text) returns void language plpgsql as $$
begin
 begin execute command;exception when others then
  if sqlerrm=expected then raise notice 'PASS: %',test_name;return;end if;raise;
 end;raise exception 'Missing expected rejection: %',test_name;
end $$;
-- 1. Principals: only revocation changes a row; nothing is deleted or reactivated.
select pg_temp.expect_identity_error($q$update private.platform_principals set role='founder' where user_id='a11b0000-0000-4000-8000-000000000002'$q$,'platform_principal_immutable','principal role is immutable');
select pg_temp.expect_identity_error($q$delete from private.platform_principals where user_id='a11b0000-0000-4000-8000-000000000002'$q$,'platform_principal_immutable','principal is never deleted');
update private.platform_principals set revoked_at=now() where user_id='a11b0000-0000-4000-8000-000000000002';
select pg_temp.expect_identity_error($q$update private.platform_principals set revoked_at=null where user_id='a11b0000-0000-4000-8000-000000000002'$q$,'platform_principal_immutable','revocation is final');
insert into private.platform_principals(user_id,role,label) values('a11b0000-0000-4000-8000-000000000002','operator','Synthetic operator again') on conflict(user_id) do nothing;
select pg_temp.expect_identity_error($q$select private.pause_receivables_release_v1(gen_random_uuid(),'a11b0000-0000-4000-9000-000000000001',false,null,'a11b0000-0000-4000-8000-000000000002')$q$,'platform_principal_required','revoked principal cannot act');
-- A fresh operator for the rest of the proof.
insert into private.platform_principals(user_id,role,label) values('a11b0000-0000-4000-8000-000000000003','operator','Synthetic operator two');
-- 2. Method profiles: the fixture's direct insert is ledgered without identity; the command binds one.
do $$begin
 if not exists(select 1 from private.execution_profile_registrations where profile_id='a4171000-0000-4000-9000-000000000001' and actor_user_id is null and command_id is null and recorded_by='postgres')
 then raise exception 'direct profile insert not ledgered';end if;
end $$;
create temporary table profile_payload as select jsonb_set(payload,'{method,executor,version}','"test-v2"') payload from private.execution_method_profiles where id='a4171000-0000-4000-9000-000000000001';
select pg_temp.expect_identity_error($q$select private.register_execution_method_profile_v1('c4171000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000003','synthetic-execution-test-v1',payload::text,repeat('c',40),jsonb_build_object('result','approved','subjectCommit',repeat('c',40),'reviewer','Synthetic independent reviewer','sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-profile-review.json','sourceHash',repeat('d',64)),'a11b0000-0000-4000-8000-000000000099','Synthetic registration by an unknown identity') from profile_payload$q$,'platform_principal_required','unknown identity cannot register a profile');
select pg_temp.expect_identity_error($q$select private.register_execution_method_profile_v1('c4171000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000003','synthetic-execution-test-v1',payload::text,repeat('c',40),jsonb_build_object('result','approved','subjectCommit',repeat('c',40),'reviewer','Synthetic independent reviewer','sourceHash',repeat('d',64)),'a11b0000-0000-4000-8000-000000000001','Synthetic registration without review path') from profile_payload$q$,'execution_profile_registration_invalid','review without a pinned path is refused');
select private.register_execution_method_profile_v1('c4171000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000003','synthetic-execution-test-v1',payload::text,repeat('c',40),jsonb_build_object('result','approved','subjectCommit',repeat('c',40),'reviewer','Synthetic independent reviewer','sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-profile-review.json','sourceHash',repeat('d',64)),'a11b0000-0000-4000-8000-000000000001','Synthetic registration by the founder') from profile_payload;
select private.register_execution_method_profile_v1('c4171000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000003','synthetic-execution-test-v1',payload::text,repeat('c',40),jsonb_build_object('result','approved','subjectCommit',repeat('c',40),'reviewer','Synthetic independent reviewer','sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-profile-review.json','sourceHash',repeat('d',64)),'a11b0000-0000-4000-8000-000000000001','Synthetic registration by the founder') from profile_payload;
do $$begin
 if (select count(*) from private.execution_method_profiles where id='a4171000-0000-4000-9000-000000000003')<>1 then raise exception 'command replay duplicated the profile';end if;
 if not exists(select 1 from private.execution_profile_registrations where profile_id='a4171000-0000-4000-9000-000000000003' and actor_user_id='a11b0000-0000-4000-8000-000000000001' and command_id='c4171000-0000-4000-9000-000000000001' and reason='Synthetic registration by the founder')
 then raise exception 'registration ledger missing the acting principal';end if;
 if (select current_setting('offroad.actor_user_id',true))<>'' then raise exception 'actor setting leaked past the command';end if;
end $$;
select pg_temp.expect_identity_error($q$select private.register_execution_method_profile_v1('c4171000-0000-4000-9000-000000000001','a4171000-0000-4000-9000-000000000004','synthetic-execution-test-v1',payload::text,repeat('c',40),jsonb_build_object('result','approved','subjectCommit',repeat('c',40),'reviewer','Synthetic independent reviewer','sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-profile-review.json','sourceHash',repeat('d',64)),'a11b0000-0000-4000-8000-000000000001','Synthetic registration by the founder') from profile_payload$q$,'platform_method_request_reused','command id cannot be reused for another profile');
select pg_temp.expect_identity_error($q$update private.execution_method_profiles set adapter_source_commit=repeat('e',40) where id='a4171000-0000-4000-9000-000000000003'$q$,'contribution_revision_immutable','profile is immutable');
select pg_temp.expect_identity_error($q$delete from private.execution_method_profiles where id='a4171000-0000-4000-9000-000000000003'$q$,'contribution_revision_immutable','profile is never deleted');
select pg_temp.expect_identity_error($q$delete from private.execution_profile_registrations where profile_id='a4171000-0000-4000-9000-000000000003'$q$,'contribution_revision_immutable','registration ledger is immutable');
-- 3. Release pauses: the command binds the principal and every write is ledgered.
select private.pause_receivables_release_v1('c4171000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000001',false,'Synthetic pause','a11b0000-0000-4000-8000-000000000003');
select private.pause_receivables_release_v1('c4171000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000001',false,'Synthetic pause','a11b0000-0000-4000-8000-000000000003');
do $$begin
 if not exists(select 1 from private.receivables_analytical_release_grants where organization_id='a11b0000-0000-4000-9000-000000000001' and enabled=false and granted_by='Synthetic operator two' and granted_by_user_id='a11b0000-0000-4000-8000-000000000003')
 then raise exception 'pause not bound to the acting principal';end if;
 if (select count(*) from private.receivables_release_pause_events where organization_id='a11b0000-0000-4000-9000-000000000001' and command_id='c4171000-0000-4000-9000-000000000002')<>1 then raise exception 'pause replay duplicated the ledger';end if;
 if private.receivables_analytical_release_enabled('a11b0000-0000-4000-9000-000000000001') then raise exception 'pause ineffective';end if;
end $$;
select pg_temp.expect_identity_error($q$select private.pause_receivables_release_v1('c4171000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000001',true,'Synthetic pause','a11b0000-0000-4000-8000-000000000003')$q$,'platform_method_request_reused','pause command id cannot change its effect');
select private.pause_receivables_release_v1('c4171000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000001',true,'Synthetic release','a11b0000-0000-4000-8000-000000000001');
update private.receivables_analytical_release_grants set note='Direct operator edit' where organization_id='a11b0000-0000-4000-9000-000000000001';
do $$begin
 if (select array_agg(operation order by sequence) from private.receivables_release_pause_events where organization_id='a11b0000-0000-4000-9000-000000000001')<>array['INSERT','UPDATE','UPDATE'] then raise exception 'pause ledger incomplete';end if;
 if not exists(select 1 from private.receivables_release_pause_events where organization_id='a11b0000-0000-4000-9000-000000000001' and operation='UPDATE' and command_id is null and note='Direct operator edit') then raise exception 'direct pause edit not ledgered';end if;
end $$;
-- 4. Content approval publishes only with the founder's identity once a founder is registered.
do $$declare x record;e jsonb;approval_evidence jsonb;begin
 select * into x from platform_method_fixture;
 e:=jsonb_build_object('sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-platform-technical.json','sourceHash',repeat('a',64),'occurredAt','2026-09-23T00:00:00Z','result','approved','manifestHash',x.bundle->'manifest'->>'manifestHash','sourceCommit',repeat('c',40),'humanApproval',false);
 perform private.attest_platform_method_candidate_v1('b5141000-0000-4000-9000-000000000012',x.id,x.fingerprint,'technical_review','Synthetic technical reviewer',e);
 approval_evidence:=e||jsonb_build_object('sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-platform-approval.json','sourceHash',repeat('b',64),'humanApproval',true);
 begin perform private.attest_platform_method_candidate_v2('b5141000-0000-4000-9000-000000000013',x.id,x.fingerprint,'content_approval','a11b0000-0000-4000-8000-000000000003',approval_evidence);raise exception 'operator approved content';exception when insufficient_privilege then if sqlerrm<>'platform_principal_required' then raise;end if;end;
 begin perform private.attest_platform_method_candidate_v2('b5141000-0000-4000-9000-000000000013',x.id,x.fingerprint,'content_approval','a11b0000-0000-4000-8000-000000000099',approval_evidence);raise exception 'unknown identity approved content';exception when insufficient_privilege then if sqlerrm<>'platform_principal_required' then raise;end if;end;
 perform private.attest_platform_method_candidate_v1('b5141000-0000-4000-9000-000000000013',x.id,x.fingerprint,'content_approval','Synthetic human approver',approval_evidence);
 begin perform private.publish_platform_method_v1('b5141000-0000-4000-9000-000000000014',x.id,x.fingerprint,'Synthetic publication without founder identity');raise exception 'label-only approval published';exception when insufficient_privilege then if sqlerrm<>'platform_founder_identity_required' then raise;end if;end;
end $$;
-- A second candidate, approved through the identity-bound command, publishes with the founder's id.
create temporary table platform_method_two as
select 'b5141000-0000-4000-9000-000000000021'::uuid id,'synthetic-platform-method-two-2026.09.23-v1'::text release_id,
 (select jsonb_set(manifest,'{procedure,id}','"synthetic-platform-method-two"') from platform_method_fixture) manifest;
alter table platform_method_two add column bundle jsonb;
alter table platform_method_two add column fingerprint text;
update platform_method_two set bundle=jsonb_build_object('manifest',manifest||jsonb_build_object('manifestHash',encode(extensions.digest(manifest::text,'sha256'),'hex')),
 'manifestText',manifest::text,'components',jsonb_build_array(manifest->'components'->0->'component'),
 'evidence',jsonb_build_array(jsonb_build_object('path','packages/credit-playbook/knowledge/reviews/synthetic-platform-technical.json','hash',repeat('a',64)),jsonb_build_object('path','packages/credit-playbook/knowledge/reviews/synthetic-platform-approval.json','hash',repeat('b',64))),
 'sourceCommit',repeat('c',40));
update platform_method_two set fingerprint=private.submit_platform_method_candidate_v1(id,release_id,bundle,'Synthetic author');
do $$declare x record;e jsonb;approval_evidence jsonb;begin
 select * into x from platform_method_two;
 e:=jsonb_build_object('sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-platform-technical.json','sourceHash',repeat('a',64),'occurredAt','2026-09-23T00:00:00Z','result','approved','manifestHash',x.bundle->'manifest'->>'manifestHash','sourceCommit',repeat('c',40),'humanApproval',false);
 perform private.attest_platform_method_candidate_v2('b5141000-0000-4000-9000-000000000022',x.id,x.fingerprint,'technical_review','a11b0000-0000-4000-8000-000000000003',e);
 approval_evidence:=e||jsonb_build_object('sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-platform-approval.json','sourceHash',repeat('b',64),'humanApproval',true);
 perform private.attest_platform_method_candidate_v2('b5141000-0000-4000-9000-000000000023',x.id,x.fingerprint,'content_approval','a11b0000-0000-4000-8000-000000000001',approval_evidence);
 perform private.attest_platform_method_candidate_v2('b5141000-0000-4000-9000-000000000023',x.id,x.fingerprint,'content_approval','a11b0000-0000-4000-8000-000000000001',approval_evidence);
 if not exists(select 1 from private.platform_method_attestations where id='b5141000-0000-4000-9000-000000000023' and actor='Synthetic founder' and actor_user_id='a11b0000-0000-4000-8000-000000000001') then raise exception 'approval not bound to the founder identity';end if;
 perform private.publish_platform_method_v1('b5141000-0000-4000-9000-000000000024',x.id,x.fingerprint,'Synthetic reviewed corpus publication with identity');
 if not exists(select 1 from private.platform_method_releases rel where rel.id=x.release_id and rel.approval->>'approvedByUserId'='a11b0000-0000-4000-8000-000000000001' and rel.approval->>'approvedBy'='Synthetic founder' and (rel.approval->>'executionEnabled')::boolean is false) then raise exception 'release approval lacks the founder identity';end if;
 begin update private.platform_method_attestations set actor_user_id='a11b0000-0000-4000-8000-000000000003' where id='b5141000-0000-4000-9000-000000000023';raise exception 'attestation mutable';exception when check_violation then if sqlerrm<>'contribution_revision_immutable' then raise;end if;end;
end $$;
-- 5. Commands are operator only; the explicit-subject request has no API grant and no caller.
set local role authenticated;
do $$begin
 begin perform private.register_execution_method_profile_v1(gen_random_uuid(),gen_random_uuid(),'synthetic-execution-test-v1','{}',repeat('c',40),'{}','a11b0000-0000-4000-8000-000000000001','Tenant registration attempt');raise exception 'tenant registered a profile';exception when insufficient_privilege then null;end;
 begin perform private.pause_receivables_release_v1(gen_random_uuid(),'a11b0000-0000-4000-9000-000000000001',false,null,'a11b0000-0000-4000-8000-000000000001');raise exception 'tenant paused a release';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$declare role_name text;sig text;begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  foreach sig in array array['private.register_execution_method_profile_v1(uuid,uuid,text,text,text,jsonb,uuid,text)','private.pause_receivables_release_v1(uuid,uuid,boolean,text,uuid)','private.attest_platform_method_candidate_v2(uuid,uuid,text,text,uuid,jsonb)','private.require_platform_principal_v1(uuid,boolean)','private.request_work_execution_as_subject_v1(uuid,uuid,text,text)'] loop
   if has_function_privilege(role_name,sig,'EXECUTE') then raise exception 'command exposed to %: %',role_name,sig;end if;
  end loop;
  if has_table_privilege(role_name,'private.platform_principals','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege(role_name,'private.execution_profile_registrations','SELECT,INSERT,UPDATE,DELETE') or has_table_privilege(role_name,'private.receivables_release_pause_events','SELECT,INSERT,UPDATE,DELETE') then raise exception 'ledger exposed to %',role_name;end if;
 end loop;
 -- The explicit-subject request has exactly one caller: the human wrapper that derives the subject from the session.
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
  and p.proname not in ('request_work_execution_as_subject_v1','request_work_execution_v1') and p.prosrc like '%request_work_execution_as_subject_v1%')
 or not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='request_work_execution_v1' and p.prosrc like '%request_work_execution_as_subject_v1%')
 then raise exception 'unexpected caller of the explicit-subject request';end if;
end $$;
select 'platform_operator_identity: PASS' result;
rollback;
