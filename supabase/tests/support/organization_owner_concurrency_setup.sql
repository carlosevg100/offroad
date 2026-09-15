begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
select ('a11c0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','wave1a-concurrency-'||n||'@example.invalid','{}','{}',now(),now(),false,false from generate_series(1,3) n;
insert into public.organizations(id,organization_type,name,created_by) values('a11c0000-0000-4000-9000-000000000001','company','Synthetic owner concurrency','a11c0000-0000-4000-8000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role,status)
select 'a11c0000-0000-4000-9000-000000000001',('a11c0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n=1 then 'owner' else 'member' end,'active' from generate_series(1,3) n;
commit;
