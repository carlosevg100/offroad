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


reset role;
update public.organization_memberships set role='member',status='active' where user_id='a11a0000-0000-4000-8000-000000000001';
insert into public.onboarding_progress(organization_id,user_id,journey,current_step) values('a11a0000-0000-4000-9000-000000000001','a11a0000-0000-4000-8000-000000000001','company','organization');
insert into public.document_intake_sessions(id,organization_id,started_by,journey,locale,project_name) values('a11a0000-0000-4000-a000-000000000001','a11a0000-0000-4000-9000-000000000001','a11a0000-0000-4000-8000-000000000001','company','pt-BR','Synthetic authority profile');
set local role authenticated;
select public.save_guided_company_profile('a11a0000-0000-4000-a000-000000000001','Synthetic guided bypass',null,null,'Synthetic company context',null,null);
insert into authority_probe values('guided_non_admin_organization_write',(select name='Synthetic guided bypass' from public.organizations where id='a11a0000-0000-4000-9000-000000000001'));
select public.save_project_company_profile('a11a0000-0000-4000-a000-000000000001','Synthetic project bypass',null,null,'Synthetic company context',null,null);
insert into authority_probe values('project_non_admin_organization_write',(select name='Synthetic project bypass' from public.organizations where id='a11a0000-0000-4000-9000-000000000001'));
select jsonb_object_agg(name,allowed) as results from authority_probe; rollback;
