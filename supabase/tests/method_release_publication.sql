-- Synthetic transactional contract. Never execute against production.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
do $$ declare scope uuid;begin
 select id into scope from public.vault_scopes;
 perform public.set_resource_policy_grant_v1(scope,'a11b0000-0000-4000-8000-000000000001',null,'work','allow');
 perform public.set_resource_policy_grant_v1(scope,'a11b0000-0000-4000-8000-000000000002',null,'read','allow');
 perform public.submit_method_candidate_v1('a5140000-0000-4000-9000-000000000001','Synthetic candidate','r01-2026.09.06-v1','[]');
 begin perform public.publish_method_release_v1('a5140000-0000-4000-9000-000000000001','a5140000-0000-4000-9000-000000000002','x');raise exception 'creator published without designation';exception when insufficient_privilege then null;end;
 perform public.set_resource_policy_grant_v1(scope,'a11b0000-0000-4000-8000-000000000001',null,'publish','allow');
 perform public.set_resource_policy_grant_v1(scope,'a11b0000-0000-4000-8000-000000000002',null,'publish','allow');
end $$;
do $$ declare r public.method_releases;begin
 select * into strict r from public.method_releases where id='a5140000-0000-4000-9000-000000000001';
 begin perform public.review_method_candidate_v1(r.id,'a5140000-0000-4000-9000-000000000002',r.manifest_fingerprint,r.evidence_fingerprint,'Synthetic technical content review.');raise exception 'author reviewed own candidate';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ declare r public.method_releases;begin
 select * into strict r from public.method_releases where id='a5140000-0000-4000-9000-000000000001';
 begin perform public.review_method_candidate_v1(r.id,'a5140000-0000-4000-9000-000000000002',r.manifest_fingerprint,repeat('0',64),'Synthetic technical content review.');raise exception 'stale evidence accepted';exception when serialization_failure then null;end;
 perform public.review_method_candidate_v1(r.id,'a5140000-0000-4000-9000-000000000002',r.manifest_fingerprint,r.evidence_fingerprint,'Synthetic technical content review.');
 begin perform public.publish_method_release_v1(r.id,'a5140000-0000-4000-9000-000000000002',r.manifest_fingerprint);raise exception 'reviewer published own review';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
do $$ declare r public.method_releases;begin
 select * into strict r from public.method_releases where id='a5140000-0000-4000-9000-000000000001';
 begin perform public.publish_method_release_v1(r.id,'a5140000-0000-4000-9000-000000000002',repeat('0',64));raise exception 'stale reviewed manifest published';exception when serialization_failure then null;end;
 perform public.set_resource_policy_grant_v1((select id from public.vault_scopes),'a11b0000-0000-4000-8000-000000000002',null,'publish','deny');
 begin perform public.publish_method_release_v1(r.id,'a5140000-0000-4000-9000-000000000002',r.manifest_fingerprint);raise exception 'revoked reviewer lent residual authority';exception when insufficient_privilege then null;end;
 perform public.set_resource_policy_grant_v1((select id from public.vault_scopes),'a11b0000-0000-4000-8000-000000000002',null,'publish','allow');
 perform public.publish_method_release_v1(r.id,'a5140000-0000-4000-9000-000000000002',r.manifest_fingerprint);
 perform public.publish_method_release_v1(r.id,'a5140000-0000-4000-9000-000000000002',r.manifest_fingerprint);
 perform public.bind_method_release_v1('a5140000-0000-4000-9000-000000000003',r.id,null,null,'analysis');
 begin perform public.bind_method_release_v1('a5140000-0000-4000-9000-000000000004',r.id,null,null,'analysis');raise exception 'concurrent binding overwrote prior version';exception when serialization_failure then null;end;
 perform public.submit_method_candidate_v1('a5140000-0000-4000-9000-000000000005','Synthetic next candidate','r01-2026.09.06-v1','[]');
 if (select release_id from public.method_scope_bindings where id='a5140000-0000-4000-9000-000000000003')<>r.id then raise exception 'candidate changed published binding';end if;
 for n in 1..26 loop
  perform public.submit_method_candidate_v1(gen_random_uuid(),'Synthetic pagination candidate '||n,'r01-2026.09.06-v1','[]');
 end loop;
 if not exists(select 1 from jsonb_array_elements(public.list_method_releases_v1(0)->'bindings') x where x->>'id'='a5140000-0000-4000-9000-000000000003') then raise exception 'current binding missing across pagination';end if;
 perform public.retire_method_release_v1(r.id,'Synthetic explicit withdrawal.');
 if not exists(select 1 from public.method_scope_bindings where release_id=r.id and retired_at is null) then raise exception 'retirement silently enabled default fallback';end if;
 begin perform public.publish_method_release_v1(r.id,'a5140000-0000-4000-9000-000000000002',r.manifest_fingerprint);raise exception 'retired method resurrected';exception when invalid_parameter_value then null;end;
end $$;
set local role service_role;
do $$ begin
 begin perform public.submit_method_candidate_v1(gen_random_uuid(),'Worker candidate','r01-2026.09.06-v1','[]');raise exception 'worker authored method';exception when insufficient_privilege then null;end;
 begin perform public.publish_method_release_v1('a5140000-0000-4000-9000-000000000001','a5140000-0000-4000-9000-000000000002','x');raise exception 'worker published';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 begin update public.method_releases set manifest='{}' where id='a5140000-0000-4000-9000-000000000001';raise exception 'release bytes overwritten';exception when check_violation then null;end;
 begin delete from public.method_review_records where id='a5140000-0000-4000-9000-000000000002';raise exception 'review evidence erased';exception when check_violation then null;end;
 if not exists(select 1 from public.audit_events where resource_type='method_releases' and action='update' and resource_id='a5140000-0000-4000-9000-000000000001') then raise exception 'publication audit absent';end if;
end $$;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('a11b0000-0000-4000-8000-000000000003','authenticated','authenticated','synthetic-method-other@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organizations(id,organization_type,name,created_by) values('a5140000-0000-4000-9000-000000000099','originator','Synthetic other method tenant','a11b0000-0000-4000-8000-000000000003');
insert into public.organization_memberships(organization_id,user_id,role,status) values('a5140000-0000-4000-9000-000000000099','a11b0000-0000-4000-8000-000000000003','owner','active');
set local role authenticated;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000003',true);
select set_config('request.headers','{"x-offroad-workspace":"a5140000-0000-4000-9000-000000000099"}',true);
do $$ begin
 if exists(select 1 from public.method_releases where organization_id='a11b0000-0000-4000-9000-000000000001') then raise exception 'cross tenant method read';end if;
end $$;
reset role;
select 'method_release_publication: PASS' result;
rollback;
