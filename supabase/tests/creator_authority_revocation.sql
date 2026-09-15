begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('a11a0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','wave1a-'||n||'@example.invalid','{}','{}',now(),now(),false,false from generate_series(1,4) n;
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


create function pg_temp.deny(label text,command text) returns void language plpgsql security invoker as $$
begin if pg_temp.attempt(command) then raise exception 'Access unexpectedly allowed: %',label; end if; end $$;

reset role;
update public.organization_memberships set role='owner',status='suspended' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a11a0000-0000-4000-8000-000000000001',true);
do $$ begin if private.can_manage_organization('a11a0000-0000-4000-9000-000000000001') then raise exception 'suspended creator retains management'; end if; end $$;
select pg_temp.deny('suspended_self_promotion',$q$update public.organization_memberships set role='owner',status='active' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000001'$q$);
select pg_temp.deny('suspended_member_promotion',$q$update public.organization_memberships set role='admin' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000003'$q$);
select pg_temp.deny('suspended_organization_update',$q$update public.organizations set name='Unauthorized synthetic rename' where id='a11a0000-0000-4000-9000-000000000001'$q$);
select pg_temp.deny('suspended_invite',$q$insert into public.organization_invites(organization_id,email_hash,role,expires_at,invited_by) values('a11a0000-0000-4000-9000-000000000001','\x0102','member',now()+interval '1 hour','a11a0000-0000-4000-8000-000000000001')$q$);
select pg_temp.deny('suspended_owner_transfer',$q$select public.transfer_organization_owner_v1('a11a0000-0000-4000-9000-000000000001','a11a0000-0000-4000-8000-000000000003')$q$);

reset role;
update public.organization_memberships set role='owner',status='revoked' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a11a0000-0000-4000-8000-000000000001',true);
do $$ begin if private.can_manage_organization('a11a0000-0000-4000-9000-000000000001') then raise exception 'revoked creator retains management'; end if; end $$;
select pg_temp.deny('revoked_self_promotion',$q$update public.organization_memberships set role='owner',status='active' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000001'$q$);
select pg_temp.deny('revoked_member_promotion',$q$update public.organization_memberships set role='admin' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000003'$q$);
select pg_temp.deny('revoked_organization_update',$q$update public.organizations set name='Unauthorized synthetic rename' where id='a11a0000-0000-4000-9000-000000000001'$q$);
select pg_temp.deny('revoked_invite',$q$insert into public.organization_invites(organization_id,email_hash,role,expires_at,invited_by) values('a11a0000-0000-4000-9000-000000000001','\x0102','member',now()+interval '1 hour','a11a0000-0000-4000-8000-000000000001')$q$);
select pg_temp.deny('revoked_owner_transfer',$q$select public.transfer_organization_owner_v1('a11a0000-0000-4000-9000-000000000001','a11a0000-0000-4000-8000-000000000003')$q$);

reset role;
update public.organization_memberships set role='member',status='active' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a11a0000-0000-4000-8000-000000000001',true);
do $$ begin if private.can_manage_organization('a11a0000-0000-4000-9000-000000000001') then raise exception 'demoted creator retains management'; end if; end $$;
select pg_temp.deny('demoted_self_promotion',$q$update public.organization_memberships set role='owner',status='active' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000001'$q$);
select pg_temp.deny('demoted_member_promotion',$q$update public.organization_memberships set role='admin' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000003'$q$);
select pg_temp.deny('demoted_organization_update',$q$update public.organizations set name='Unauthorized synthetic rename' where id='a11a0000-0000-4000-9000-000000000001'$q$);
select pg_temp.deny('demoted_invite',$q$insert into public.organization_invites(organization_id,email_hash,role,expires_at,invited_by) values('a11a0000-0000-4000-9000-000000000001','\x0102','member',now()+interval '1 hour','a11a0000-0000-4000-8000-000000000001')$q$);
select pg_temp.deny('demoted_owner_transfer',$q$select public.transfer_organization_owner_v1('a11a0000-0000-4000-9000-000000000001','a11a0000-0000-4000-8000-000000000003')$q$);

reset role;
delete from public.organization_memberships where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a11a0000-0000-4000-8000-000000000001',true);
do $$ begin if private.can_manage_organization('a11a0000-0000-4000-9000-000000000001') then raise exception 'removed creator retains management'; end if; end $$;
select pg_temp.deny('removed_self_promotion',$q$update public.organization_memberships set role='owner',status='active' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000001'$q$);
select pg_temp.deny('removed_member_promotion',$q$update public.organization_memberships set role='admin' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000003'$q$);
select pg_temp.deny('removed_organization_update',$q$update public.organizations set name='Unauthorized synthetic rename' where id='a11a0000-0000-4000-9000-000000000001'$q$);
select pg_temp.deny('removed_invite',$q$insert into public.organization_invites(organization_id,email_hash,role,expires_at,invited_by) values('a11a0000-0000-4000-9000-000000000001','\x0102','member',now()+interval '1 hour','a11a0000-0000-4000-8000-000000000001')$q$);
select pg_temp.deny('removed_owner_transfer',$q$select public.transfer_organization_owner_v1('a11a0000-0000-4000-9000-000000000001','a11a0000-0000-4000-8000-000000000003')$q$);
select pg_temp.deny('removed_reinsert_owner',$q$insert into public.organization_memberships(organization_id,user_id,role,status) values('a11a0000-0000-4000-9000-000000000001','a11a0000-0000-4000-8000-000000000001','owner','active')$q$);

-- Active B retains administration; owner status is only changed by the transfer RPC.
select set_config('request.jwt.claim.sub','a11a0000-0000-4000-8000-000000000002',true);
do $$ begin
 if not private.can_manage_organization('a11a0000-0000-4000-9000-000000000001') then raise exception 'active owner lost authority'; end if;
 update public.organization_memberships set role='analyst' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000003';
 if not found then raise exception 'active owner cannot administer member'; end if;
end $$;
select pg_temp.deny('direct_owner_promotion',$q$update public.organization_memberships set role='owner' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000003'$q$);
select pg_temp.deny('delete_last_owner',$q$delete from public.organization_memberships where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000002'$q$);
select pg_temp.deny('rewrite_membership_identity',$q$update public.organization_memberships set user_id='a11a0000-0000-4000-8000-000000000001' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000003'$q$);
select public.transfer_organization_owner_v1('a11a0000-0000-4000-9000-000000000001','a11a0000-0000-4000-8000-000000000003');
do $$ begin
 if not exists(select 1 from public.organization_memberships where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000003' and role='owner' and status='active')
 or not exists(select 1 from public.organization_memberships where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000002' and role='admin')
 then raise exception 'ownership transfer did not preserve active ownership'; end if;
end $$;
select pg_temp.deny('former_owner_cannot_transfer_again',$q$select public.transfer_organization_owner_v1('a11a0000-0000-4000-9000-000000000001','a11a0000-0000-4000-8000-000000000002')$q$);
select pg_temp.deny('admin_cannot_self_promote',$q$update public.organization_memberships set role='owner' where organization_id='a11a0000-0000-4000-9000-000000000001' and user_id='a11a0000-0000-4000-8000-000000000002'$q$);

-- The existing signup RPC delegates bootstrap atomically and remains idempotent.
select set_config('request.jwt.claim.sub','a11a0000-0000-4000-8000-000000000004',true);
do $$
declare first_id uuid; second_id uuid;
begin
 first_id:=public.initialize_professional_onboarding('company','Synthetic signup',null,'pt-BR');
 second_id:=public.initialize_professional_onboarding('company','Synthetic signup',null,'pt-BR');
 if first_id<>second_id or not exists(select 1 from public.organization_memberships where organization_id=first_id and user_id=auth.uid() and role='owner' and status='active') then
 raise exception 'signup not atomic/idempotent'; end if;
end $$;
select pg_temp.deny('legacy_direct_organization_insert',$q$insert into public.organizations(organization_type,name,created_by) values('company','Synthetic bypass',auth.uid())$q$);
select pg_temp.deny('bootstrap_cannot_choose_another_owner',$q$insert into public.organization_memberships(organization_id,user_id,role,status) values('a11a0000-0000-4000-9000-000000000001',auth.uid(),'owner','active')$q$);
reset role;
do $$ begin
 if not exists(select 1 from public.audit_events where organization_id='a11a0000-0000-4000-9000-000000000001' and action='organization_owner_transferred' and actor_user_id='a11a0000-0000-4000-8000-000000000002') then raise exception 'transfer audit missing'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.deny('anonymous_bootstrap',$q$select public.create_organization_with_owner_v1('company','Synthetic anonymous')$q$);
reset role;
select 'creator_authority_revocation: PASS' as result;
rollback;

