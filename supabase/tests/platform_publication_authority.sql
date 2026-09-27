-- Publication requires a current human identity even after every founder is revoked.
begin;
\ir support/platform_method_fixture.sql
\ir support/platform_publisher_fixture.sql
select private.attest_platform_method_candidate_v1(gen_random_uuid(),id,fingerprint,'technical_review','Synthetic technical reviewer',
 jsonb_build_object('sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-platform-technical.json','sourceHash',repeat('a',64),
 'occurredAt','2026-09-27T00:00:00Z','result','approved','manifestHash',bundle->'manifest'->>'manifestHash','sourceCommit',repeat('c',40),'humanApproval',false)) from platform_method_fixture;
select private.attest_platform_method_candidate_v2(gen_random_uuid(),id,fingerprint,'content_approval','b5141000-0000-4000-8000-000000000001',
 jsonb_build_object('sourcePath','packages/credit-playbook/knowledge/reviews/synthetic-platform-approval.json','sourceHash',repeat('b',64),
 'occurredAt','2026-09-27T00:00:00Z','result','approved','manifestHash',bundle->'manifest'->>'manifestHash','sourceCommit',repeat('c',40),'humanApproval',true)) from platform_method_fixture;
create function pg_temp.publication_must_deny(label text) returns void language plpgsql as $$
declare x record; denied boolean:=false;
begin
 select * into strict x from platform_method_fixture;
 begin perform private.publish_platform_method_v1(gen_random_uuid(),x.id,x.fingerprint,'Synthetic authority regression proof');
 exception when insufficient_privilege then denied:=sqlerrm='platform_founder_identity_required'; end;
 if not denied then raise exception 'publication accepted: %',label; end if;
 if exists(select 1 from private.platform_method_publication_events where candidate_id=x.id) then raise exception 'denied publication wrote an event'; end if;
end $$;
savepoint founder_revocation;
-- Rollback below restores existing staging principals as well; no identity changes persist.
update private.platform_principals set revoked_at=clock_timestamp(),revoked_reason='Synthetic rollback-only authority regression'
 where role='founder' and revoked_at is null;
select pg_temp.publication_must_deny('last founder revoked');
rollback to savepoint founder_revocation;

savepoint founder_ban;
update auth.users set banned_until=clock_timestamp()+interval '1 hour' where id='b5141000-0000-4000-8000-000000000001';
select pg_temp.publication_must_deny('founder account banned');
rollback to savepoint founder_ban;

savepoint founder_deletion;
update auth.users set deleted_at=clock_timestamp() where id='b5141000-0000-4000-8000-000000000001';
select pg_temp.publication_must_deny('founder account deleted');
rollback to savepoint founder_deletion;

select private.publish_platform_method_v1(gen_random_uuid(),id,fingerprint,'Synthetic live founder publication') from platform_method_fixture;
do $$ begin
 if not exists(select 1 from private.platform_method_releases where id='synthetic-platform-method-2026.09.19-v1' and approved_by_user_id='b5141000-0000-4000-8000-000000000001') then
  raise exception 'live founder approval identity missing'; end if;
end $$;
select 'platform_publication_authority_passed' as result;
rollback;
