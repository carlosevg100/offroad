begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_resource_fixture.sql
insert into public.organizations(id,organization_type,name,created_by)
values('a11b0000-0000-4000-9000-000000000020','originator','Synthetic second workspace','a11b0000-0000-4000-8000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role,status)
values('a11b0000-0000-4000-9000-000000000020','a11b0000-0000-4000-8000-000000000001','owner','active');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{}',true);
do $$ begin
 begin perform private.workspace_membership_v1(); raise exception 'ambiguous context was accepted';
 exception when sqlstate 'P0001' then if sqlerrm<>'workspace_context_required' then raise; end if; end;
end $$;
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
do $$ begin
 if (select organization_id from private.workspace_membership_v1())<>'a11b0000-0000-4000-9000-000000000001'::uuid then raise exception 'first tab context changed'; end if;
end $$;
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000020"}',true);
do $$ begin
 if (select organization_id from private.workspace_membership_v1())<>'a11b0000-0000-4000-9000-000000000020'::uuid then raise exception 'second tab context changed'; end if;
end $$;
update public.organization_memberships set status='suspended' where organization_id='a11b0000-0000-4000-9000-000000000020';
do $$ begin
 begin perform private.workspace_membership_v1(); raise exception 'revoked context was accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000099"}',true);
do $$ begin
 begin perform private.workspace_membership_v1(); raise exception 'unrelated context was accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.headers','{"x-offroad-workspace":"invalid"}',true);
do $$ begin
 begin perform private.workspace_membership_v1(); raise exception 'malformed context was accepted';
 exception when invalid_parameter_value then null; end;
end $$;
rollback;
