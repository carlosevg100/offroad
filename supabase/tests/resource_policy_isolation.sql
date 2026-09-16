begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
insert into public.organizations(id,organization_type,name,created_by) values('a3320000-0000-4000-9000-000000000001','institutional','Synthetic foreign policy tenant','a11b0000-0000-4000-8000-000000000002');
insert into public.organization_memberships(organization_id,user_id,role,status) values('a3320000-0000-4000-9000-000000000001','a11b0000-0000-4000-8000-000000000002','owner','active');
insert into private.access_groups(id,organization_id,name) values('a3320000-0000-4000-9000-000000000002','a3320000-0000-4000-9000-000000000001','Synthetic foreign desk');
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 begin perform public.set_access_group_v1('a3320000-0000-4000-9000-000000000002','Foreign change'); raise exception 'cross tenant group write'; exception when insufficient_privilege then null; end;
 begin perform public.set_access_group_member_v1('a3320000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000001'); raise exception 'cross tenant group join'; exception when insufficient_privilege then null; end;
 begin perform public.set_resource_policy_grant_v1('a11b0000-0000-4000-9000-000000000002',null,'a3320000-0000-4000-9000-000000000002','read','allow'); raise exception 'cross tenant group grant'; exception when insufficient_privilege then null; end;
 begin perform public.set_information_barrier_v1(null,'a11b0000-0000-4000-9000-000000000002','Cross tenant barrier','[{"groupId":"a3320000-0000-4000-9000-000000000002","effect":"allow"}]'); raise exception 'cross tenant barrier'; exception when insufficient_privilege then null; end;
 begin perform public.set_information_barrier_v1(null,'a11b0000-0000-4000-9000-000000000002','Unsafe shape','[{"userId":"a11b0000-0000-4000-8000-000000000001","effect":"allow","organizationId":"a3320000-0000-4000-9000-000000000001"}]'); raise exception 'caller scope accepted'; exception when invalid_parameter_value then null; end;
end $$;
-- The authenticated person remains the same; a forged workspace cannot direct a write.
select set_config('request.headers','{"x-offroad-workspace":"a3320000-0000-4000-9000-000000000001"}',true);
do $$ begin
 begin perform public.set_access_group_v1(null,'Forged active workspace'); raise exception 'forged context wrote group'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from private.information_barriers where organization_id='a11b0000-0000-4000-9000-000000000001') then raise exception 'failed command left partial barrier'; end if;
 if not exists(select 1 from private.access_groups where id='a3320000-0000-4000-9000-000000000002' and name='Synthetic foreign desk') then raise exception 'foreign group mutated'; end if;
end $$;
-- Granting a child must never broaden to its root or sibling resources.
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select public.set_resource_policy_grant_v1('a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002',null,'read','allow');
do $$ begin
 if not private.resource_access_as_subject_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002','read') or private.resource_access_as_subject_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','read') then raise exception 'child grant widened to project root'; end if;
end $$;
select 'resource_policy_isolation: PASS' result;
rollback;
