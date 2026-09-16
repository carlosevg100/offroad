begin;
-- Local/staging fixture teardown only. The legacy organization DELETE audit
-- references the deleted row; remove all fixture dependencies explicitly.
set local session_replication_role=replica;
delete from private.principals where organization_id='a11c0000-0000-4000-9000-000000000001';
delete from public.organization_memberships where organization_id='a11c0000-0000-4000-9000-000000000001';
delete from public.audit_events where organization_id='a11c0000-0000-4000-9000-000000000001';
delete from public.organizations where id='a11c0000-0000-4000-9000-000000000001';
delete from public.profiles where id in ('a11c0000-0000-4000-8000-000000000001','a11c0000-0000-4000-8000-000000000002','a11c0000-0000-4000-8000-000000000003');
delete from auth.users where id in ('a11c0000-0000-4000-8000-000000000001','a11c0000-0000-4000-8000-000000000002','a11c0000-0000-4000-8000-000000000003');
commit;
