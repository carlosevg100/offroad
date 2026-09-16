begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
\ir support/resource_policy_vectors.sql
create temp table policy_test_ids(k text primary key,id uuid);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
insert into policy_test_ids values('desk_a',public.set_access_group_v1(null,'Synthetic desk A'));
insert into policy_test_ids values('desk_b',public.set_access_group_v1(null,'Synthetic desk B'));
select public.set_access_group_member_v1((select id from policy_test_ids where k='desk_a'),'a11b0000-0000-4000-8000-000000000002');
select public.set_resource_policy_grant_v1('a11b0000-0000-4000-9000-000000000002',null,(select id from policy_test_ids where k='desk_a'),'work','allow');
insert into policy_results select id,private.evaluate_resource_policy_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002',action,purpose) from policy_vectors where id='group_descendant';
set local role authenticated;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 if not private.can_access_resource_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','read') then raise exception 'group grant did not reach descendant'; end if;
 begin perform public.set_access_group_v1(null,'Unauthorized'); raise exception 'member administered group'; exception when insufficient_privilege then null; end;
 if public.explain_my_access_v1('a11b0000-0000-4000-9000-000000000099')<>jsonb_build_object('allowed',false,'capabilities','[]'::jsonb) then raise exception 'explain leaks nonexistent object'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
-- The pre-existing resource revocation RPC closes group-derived paths too.
select public.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002');
do $$ begin
 if private.resource_access_as_subject_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002','read') then raise exception 'legacy revocation left group access'; end if;
end $$;
select public.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','read');
-- A mandatory deny remains authoritative even through the old grant endpoint.
select public.set_resource_policy_grant_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002',null,'read','deny');
do $$ begin
 begin perform public.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','read'); raise exception 'legacy grant removed mandatory deny'; exception when insufficient_privilege then null; end;
end $$;
select public.set_resource_policy_grant_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002',null,'read','deny',false);
-- An explicit policy deny replacing a legacy tombstone cannot be cleared by legacy regrant.
select public.revoke_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002');
select public.set_resource_policy_grant_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002',null,'manage','deny');
do $$ begin
 begin perform public.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','manage'); raise exception 'policy deny retained removable legacy basis'; exception when insufficient_privilege then null; end;
end $$;
select public.set_resource_policy_grant_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002',null,'manage','deny',false);
-- Keep the remaining vector cases group-only.
update private.resource_access_grants set revoked_at=now() where organization_id='a11b0000-0000-4000-9000-000000000001' and subject_user_id='a11b0000-0000-4000-8000-000000000002' and effect='allow';
insert into policy_test_ids values('barrier',public.set_information_barrier_v1(null,'a11b0000-0000-4000-9000-000000000002','Synthetic restricted desk',jsonb_build_array(jsonb_build_object('groupId',(select id from policy_test_ids where k='desk_b'),'effect','allow'))));
insert into policy_results select id,private.evaluate_resource_policy_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002',action,purpose) from policy_vectors where id='barrier_blocks';
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.source_documents where id='a11b0000-0000-4000-9000-000000000004') or exists(select 1 from public.case_retrieval_chunks where intake_session_id='a11b0000-0000-4000-9000-000000000003') then raise exception 'barrier bypassed in legacy route'; end if;
 if public.explain_my_access_v1('a11b0000-0000-4000-9000-000000000002')<>public.explain_my_access_v1('a11b0000-0000-4000-9000-000000000099') then raise exception 'hidden object distinguishable'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select public.set_access_group_member_v1((select id from policy_test_ids where k='desk_b'),'a11b0000-0000-4000-8000-000000000002');
insert into policy_results select id,private.evaluate_resource_policy_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002',action,purpose) from policy_vectors where id='group_intersection';
do $$ begin
 if not private.resource_access_as_subject_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002','work') then raise exception 'multiple group intersection failed'; end if;
 begin perform public.set_access_group_v1(null,'Nested',true,null,(select id from policy_test_ids where k='desk_a')); raise exception 'nested group accepted'; exception when invalid_parameter_value then null; end;
end $$;
-- Matching an allowed desk cannot override an explicitly denied desk.
select public.set_information_barrier_v1((select id from policy_test_ids where k='barrier'),'a11b0000-0000-4000-9000-000000000002','Synthetic restricted desk',jsonb_build_array(jsonb_build_object('groupId',(select id from policy_test_ids where k='desk_b'),'effect','allow'),jsonb_build_object('groupId',(select id from policy_test_ids where k='desk_a'),'effect','deny')));
do $$ begin
 if private.resource_access_as_subject_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002','read') then raise exception 'barrier deny did not dominate membership allow'; end if;
end $$;
select public.set_information_barrier_v1((select id from policy_test_ids where k='barrier'),'a11b0000-0000-4000-9000-000000000002','Synthetic restricted desk',jsonb_build_array(jsonb_build_object('groupId',(select id from policy_test_ids where k='desk_b'),'effect','allow')));
select public.set_resource_policy_grant_v1('a11b0000-0000-4000-9000-000000000002',null,(select id from policy_test_ids where k='desk_b'),'work','deny');
insert into policy_results select id,private.evaluate_resource_policy_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002',action,purpose) from policy_vectors where id='deny_over_allow';
do $$ begin
 if private.resource_access_as_subject_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002','read') then raise exception 'deny did not override group allow'; end if;
end $$;
select public.set_resource_policy_grant_v1('a11b0000-0000-4000-9000-000000000002',null,(select id from policy_test_ids where k='desk_b'),'work','deny',false);
select public.set_resource_purposes_v1('a11b0000-0000-4000-9000-000000000003',array['retrieval']);
insert into policy_results select id,private.evaluate_resource_policy_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002',action,purpose) from policy_vectors where id='purpose_denied';
do $$ begin
 if private.resource_access_as_subject_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002','work') then raise exception 'child purpose restriction bypassed'; end if;
 if not private.resource_access_as_subject_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002','read') then raise exception 'permitted purpose incorrectly denied'; end if;
end $$;
insert into policy_results select id,private.evaluate_resource_policy_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002',action,purpose) from policy_vectors where id='purpose_permitted';
insert into storage.objects(bucket_id,name) values('opportunity-documents','a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/synthetic.txt');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
select set_config('storage.operation','object.get_authenticated',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from storage.objects where name='a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/synthetic.txt') then raise exception 'direct storage bypassed export purpose'; end if;
 if (public.explain_my_access_v1('a11b0000-0000-4000-9000-000000000003','read','export')->>'allowed')::boolean then raise exception 'export purpose bypassed'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select public.set_resource_purposes_v1('a11b0000-0000-4000-9000-000000000003',array['retrieval','export']);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from storage.objects where name='a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/synthetic.txt') then raise exception 'permitted export denied'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);

update private.access_group_memberships set valid_from=now()-interval '2 days',expires_at=now()-interval '1 day' where group_id=(select id from policy_test_ids where k='desk_a');
do $$ begin
 if private.resource_access_as_subject_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002','read') then raise exception 'expired group membership accepted'; end if;
end $$;
insert into policy_results select id,private.evaluate_resource_policy_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002',action,purpose) from policy_vectors where id='expired_membership';
-- An administrative role manages configuration but cannot read content without its own grant.
update public.organization_memberships set role='admin' where user_id='a11b0000-0000-4000-8000-000000000002';
insert into policy_results select id,private.evaluate_resource_policy_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-8000-000000000002',action,purpose) from policy_vectors where id='admin_no_read';
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.capital_projects where id='a11b0000-0000-4000-9000-000000000002') then raise exception 'admin inherited content'; end if;
 perform public.set_access_group_v1(null,'Synthetic admin without read');
end $$;
reset role;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select public.revoke_principal_access_v1((select id from private.principals where organization_id='a11b0000-0000-4000-9000-000000000001' and user_id='a11b0000-0000-4000-8000-000000000002'));
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$ begin
 begin perform public.set_access_group_v1(null,'Revoked admin'); raise exception 'revoked principal administered policy'; exception when insufficient_privilege then null; end;
 begin perform public.set_access_group_member_v1('a11b0000-0000-4000-9000-000000000099','a11b0000-0000-4000-8000-000000000002'); raise exception 'revoked principal managed members'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare t text; begin
 foreach t in array array['principals','organization_units','access_groups','access_group_memberships','information_barriers','barrier_memberships'] loop
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname=t and not(c.relrowsecurity and c.relforcerowsecurity)) or has_table_privilege('authenticated','private.'||t,'select,insert,update,delete') then raise exception 'private policy table exposed: %',t; end if;
 end loop;
 if not exists(select 1 from private.domain_events where organization_id='a11b0000-0000-4000-9000-000000000001' and aggregate_kind='access_policy') then raise exception 'policy mutation lacks outbox'; end if;
end $$;
do $$ begin if exists(select 1 from policy_vectors v left join policy_results r using(id) where r.actual is distinct from v.expected) then raise exception 'policy conformance vector mismatch'; end if; end $$;
select 'resource_policy_barriers: PASS' result;
rollback;
