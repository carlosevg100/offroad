begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('a11a0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','wave1a-'||n||'@example.invalid','{}','{}',now(),now(),false,false from generate_series(1,3) n;
insert into public.organizations(id,organization_type,name,created_by) values('a11a0000-0000-4000-9000-000000000001','company','Synthetic authority test','a11a0000-0000-4000-8000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role,status)
select 'a11a0000-0000-4000-9000-000000000001',('a11a0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n<=2 then 'owner' else 'member' end,case when n=1 then 'suspended' else 'active' end from generate_series(1,3) n;
create temporary table authority_probe(name text,allowed boolean);
grant all on authority_probe to authenticated;
create function pg_temp.attempt(command text) returns boolean language plpgsql security invoker as $$
declare affected integer;
begin
 execute command; get diagnostics affected=row_count; return affected>0;
exception when insufficient_privilege then return false;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a11a0000-0000-4000-8000-000000000001',true);

insert into authority_probe values('suspended_creator_can_manage',private.can_manage_organization('a11a0000-0000-4000-9000-000000000001'));
insert into authority_probe values('suspended_creator_invites',pg_temp.attempt($q$insert into public.organization_invites(organization_id,email_hash,role,expires_at,invited_by) values('a11a0000-0000-4000-9000-000000000001','\x0102','member',now()+interval '1 hour','a11a0000-0000-4000-8000-000000000001')$q$));
insert into authority_probe values('suspended_creator_changes_member_role',pg_temp.attempt($q$update public.organization_memberships set role='admin' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000003'$q$));
insert into authority_probe values('suspended_creator_updates_organization',pg_temp.attempt($q$update public.organizations set name='Synthetic unauthorized rename' where id='a11a0000-0000-4000-9000-000000000001'$q$));
insert into authority_probe values('suspended_creator_reactivates_self',pg_temp.attempt($q$update public.organization_memberships set role='owner',status='active' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000001'$q$));
reset role;
delete from public.organization_memberships where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000001';
set local role authenticated;
insert into authority_probe values('removed_creator_reinserts_owner',pg_temp.attempt($q$insert into public.organization_memberships(organization_id,user_id,role,status) values('a11a0000-0000-4000-9000-000000000001','a11a0000-0000-4000-8000-000000000001','owner','active')$q$));
reset role;
select jsonb_object_agg(name,allowed) as results from authority_probe;
rollback;

