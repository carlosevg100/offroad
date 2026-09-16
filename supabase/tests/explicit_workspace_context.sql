-- Synthetic identities only; all data and session settings roll back.
begin;
\ir support/workspace_analysis_plan.sql
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('a2200000-0000-4000-8000-000000000001','wave2-owner@example.invalid','{"full_name":"Synthetic workspace owner"}',now()),
 ('a2200000-0000-4000-8000-000000000002','wave2-member@example.invalid','{"full_name":"Synthetic workspace member"}',now()),
 ('a2200000-0000-4000-8000-000000000003','wave2-outsider@example.invalid','{"full_name":"Synthetic outsider"}',now());
create function pg_temp.denied(p_sql text,p_state text) returns void language plpgsql as $$
begin
 begin execute p_sql; exception when others then if sqlstate=p_state then return; end if;raise;end;
 raise exception 'Expected denial %: %',p_state,p_sql;
end $$;
select set_config('request.jwt.claim.sub','a2200000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{}',true);
set local role authenticated;
select set_config('test.personal',public.initialize_workspace_v1('Synthetic workspace owner','pt-BR')::text,true);
do $$ declare context jsonb; begin
 context:=public.get_workspace_context_v1();
 if context->>'workspace_kind'<>'personal' or context#>>'{capabilities,own_analysis}'<>'true'
  or context#>>'{capabilities,mandate_management}'<>'false' or context#>>'{capabilities,origination_representation}'<>'false' then raise exception 'Personal workspace received commercial defaults';end if;
 if public.initialize_workspace_v1('Synthetic workspace owner','pt-BR')::text<>current_setting('test.personal') then raise exception 'Registration retry created a second organization';end if;
 if (public.get_workspace_bootstrap()->>'workspace_ready')::boolean is not true then raise exception 'Personal identity requires a company profile';end if;
end $$;
select public.accept_private_workspace_terms('pt-BR','Synthetic workspace owner','',true,true);
do $$ begin
 if exists(select 1 from public.organization_legal_acceptances where organization_id=current_setting('test.personal')::uuid
   and (authority_declared or signatory_title is not null)) then
  raise exception 'Personal terms invented a professional position or representation';
 end if;
end $$;
select public.start_advisor_project_v1('a2200000-0000-4000-9000-000000000010','pt-BR','Synthetic capital structure decision','capital_planning','Compare capital structure alternatives','public_information',pg_temp.plan_for('capital_planning'));
do $$ begin
 if not exists(select 1 from public.capital_projects where organization_id=current_setting('test.personal')::uuid and project_name='Synthetic capital structure decision') then raise exception 'Personal analysis did not stay in its workspace';end if;
end $$;
select set_config('test.second',public.create_organization_with_owner_v1('institutional','Synthetic institution')::text,true);
select pg_temp.denied($q$select public.get_workspace_context_v1()$q$,'P0001');
select pg_temp.denied($q$select public.initialize_professional_onboarding('company','Synthetic workspace owner',null,'pt-BR')$q$,'P0001');
select set_config('request.headers',jsonb_build_object('x-offroad-workspace',current_setting('test.personal'))::text,true);
select public.remember_workspace_v1(current_setting('test.personal')::uuid);
select pg_temp.denied(format('select public.remember_workspace_v1(%L::uuid)',current_setting('test.second')),'42501');
select set_config('test.invite',public.invite_workspace_member_v1('wave2-outsider@example.invalid','member')::text,true);
select set_config('request.jwt.claim.sub','a2200000-0000-4000-8000-000000000003',true);
select public.accept_workspace_invite_v1(current_setting('test.invite')::uuid);
do $$ begin
 if public.get_workspace_bootstrap()->>'workspace_ready'<>'true' then raise exception 'Invited personal member forced into commercial onboarding';end if;
end $$;
select set_config('request.jwt.claim.sub','a2200000-0000-4000-8000-000000000001',true);
select public.set_workspace_capability_v1('mandate_management',true,0);
select pg_temp.denied($q$select public.set_workspace_capability_v1('mandate_management',false,0)$q$,'40001');
do $$ begin
 if public.get_workspace_context_v1()#>>'{capabilities,mandate_management}'<>'true' then raise exception 'Explicit capability missing';end if;
end $$;
select set_config('request.headers',jsonb_build_object('x-offroad-workspace',current_setting('test.second'))::text,true);
do $$ declare affected integer; begin
 update public.organizations set name='Wrong context mutation' where id=current_setting('test.personal')::uuid;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Organization write crossed the selected context';end if;
end $$;
do $$ begin
 if public.get_workspace_context_v1()->>'organization_id'<>current_setting('test.second')
 or public.get_workspace_context_v1()#>>'{capabilities,mandate_management}'<>'false' then raise exception 'Context or capability crossed organizations';end if;
end $$;
reset role;
select set_config('test.account',(select id::text from private.commercial_accounts where organization_id=current_setting('test.personal')::uuid),true);
select set_config('test.second_account',(select commercial_account_id::text from private.account_organizations where organization_id=current_setting('test.second')::uuid),true);
insert into public.organization_memberships(organization_id,user_id,role,status)
values(current_setting('test.second')::uuid,'a2200000-0000-4000-8000-000000000002','member','active');
set local role authenticated;
select public.link_commercial_account_v1(current_setting('test.account')::uuid,current_setting('test.second_account')::uuid);
select set_config('request.jwt.claim.sub','a2200000-0000-4000-8000-000000000002',true);
select pg_temp.denied($q$select public.set_workspace_capability_v1('mandate_management',true,0)$q$,'42501');
select pg_temp.denied(format('select public.link_commercial_account_v1(%L::uuid,%L::uuid)',current_setting('test.account'),current_setting('test.account')),'42501');
select pg_temp.denied($q$select * from private.commercial_accounts$q$,'42501');
select pg_temp.denied($q$select * from private.account_organizations$q$,'42501');
select pg_temp.denied($q$select * from private.workspace_capability_grants$q$,'42501');
do $$ begin
 if public.get_workspace_context_v1()->>'commercial_account_id' is not null then raise exception 'Billing identifier exposed to member';end if;
 if jsonb_array_length(public.list_my_workspaces_v1())<>1 then raise exception 'Billing relationship granted membership';end if;
 if exists(select 1 from public.user_workspace_preferences) then raise exception 'Another person preference leaked';end if;
end $$;
select set_config('request.headers',jsonb_build_object('x-offroad-workspace',current_setting('test.personal'))::text,true);
select pg_temp.denied($q$select public.get_workspace_context_v1()$q$,'42501');
select set_config('request.headers','{"x-offroad-workspace":"invalid"}',true);
select pg_temp.denied($q$select public.get_workspace_context_v1()$q$,'22023');
reset role;
update public.organization_memberships set status='suspended' where user_id='a2200000-0000-4000-8000-000000000002';
select set_config('request.headers',jsonb_build_object('x-offroad-workspace',current_setting('test.second'))::text,true);
set local role authenticated;
select pg_temp.denied($q$select public.get_workspace_context_v1()$q$,'42501');
select set_config('request.jwt.claim.sub','a2200000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{}',true);
-- A remembered preference cannot silently choose between two active memberships.
select pg_temp.denied($q$select public.get_workspace_context_v1()$q$,'P0001');
select pg_temp.denied($q$insert into public.user_workspace_preferences(organization_id,user_id) values(gen_random_uuid(),auth.uid())$q$,'42501');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.denied($q$select public.initialize_workspace_v1('Synthetic anonymous','pt-BR')$q$,'42501');
reset role;
select 'explicit_workspace_context: PASS' result;
rollback;
