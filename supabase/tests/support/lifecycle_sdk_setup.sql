-- Disposable local CI only; generated credentials arrive as psql variables.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,is_sso_user,is_anonymous,created_at,updated_at)
values('a422c100-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage22-erasure-owner@example.invalid',extensions.crypt(convert_from(decode(:'password_hex','hex'),'UTF8'),extensions.gen_salt('bf')),now(),'','','','','{"provider":"email","providers":["email"]}','{}',false,false,now(),now()),
('a422c100-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stage22-erasure-worker@example.invalid',extensions.crypt(convert_from(decode(:'password_hex','hex'),'UTF8'),extensions.gen_salt('bf')),now(),'','','','','{"provider":"email","providers":["email"]}','{}',false,false,now(),now());
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)select gen_random_uuid(),id,id::text,'email',jsonb_build_object('sub',id::text,'email',email),now(),now()from auth.users where id in('a422c100-0000-4000-8000-000000000001','a422c100-0000-4000-8000-000000000002');
insert into private.worker_tokens(label,token_sha256,execution_account_user_id)values('Stage22 explicit synthetic erasure eval; owner engineering; payload deadline 2026-10-07',extensions.digest(convert_from(decode(:'worker_token_hex','hex'),'UTF8'),'sha256'),'a422c100-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','a422c100-0000-4000-8000-000000000001',true);
insert into public.organizations(id,organization_type,name,created_by)values('a422c100-0000-4000-9000-000000000001','institutional','Stage22 owned lifecycle eval; no customer data; payload expiry 2026-10-07','a422c100-0000-4000-8000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role,status)values('a422c100-0000-4000-9000-000000000001','a422c100-0000-4000-8000-000000000001','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by)values('a422c100-0000-4000-9000-000000000002','a422c100-0000-4000-9000-000000000001','Stage22 synthetic byte and restoration canary','a422c100-0000-4000-8000-000000000001');
select set_config('request.jwt.claims','{"sub":"a422c100-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.headers','{"x-offroad-workspace":"a422c100-0000-4000-9000-000000000001"}',true);
set local role authenticated;
select public.set_capital_project_review_assignment_v1('a422c100-0000-4000-9000-000000000002','a422c100-0000-4000-8000-000000000001','preparer',true);
select public.set_capital_project_review_assignment_v1('a422c100-0000-4000-9000-000000000002','a422c100-0000-4000-8000-000000000001','approver',true);
select public.set_capital_project_review_policy_v1('a422c100-0000-4000-9000-000000000002','allowed');
commit;
select true as stage22_owned_fixture_ready;
