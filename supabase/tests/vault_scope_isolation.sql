begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.submit_vault_entry_version_v1('a5120000-0000-4000-9000-000000000201','a5120000-0000-4000-9000-000000000202',null,'directive','Synthetic scoped direction','Synthetic confidential scoped content.');
do $$ declare scope uuid; fp text;begin
 select id into strict scope from public.vault_scopes;
 perform public.set_resource_policy_grant_v1(scope,'a11b0000-0000-4000-8000-000000000001',null,'publish','allow');
 perform public.set_resource_policy_grant_v1(scope,'a11b0000-0000-4000-8000-000000000002',null,'read','allow');
 select content_fingerprint into strict fp from public.vault_entry_versions where id='a5120000-0000-4000-9000-000000000202';
 perform public.propose_vault_publication_v1('a5120000-0000-4000-9000-000000000203','a5120000-0000-4000-9000-000000000202',fp,null,'a11b0000-0000-4000-9000-000000000002','analysis','Synthetic restricted work scope');
 select review_fingerprint into strict fp from public.vault_publication_requests where id='a5120000-0000-4000-9000-000000000203';
 perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000203','a5120000-0000-4000-9000-000000000204',fp);
 perform public.set_resource_policy_grant_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002',null,'read','deny');
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.vault_entry_versions) or exists(select 1 from public.vault_publication_requests) then raise exception 'vault read overrode restricted work';end if;
 if jsonb_array_length(public.list_vault_entries_v1()->'rows')<>0 then raise exception 'scoped reference leaked through organization search';end if;
 if jsonb_array_length(public.list_vault_entries_v1(p_mode=>'candidates')->'rows')<>0 then raise exception 'reader received candidate';end if;
 begin perform public.search_vault_for_work_v1('a11b0000-0000-4000-9000-000000000002');raise exception 'denied work retrieval succeeded';exception when insufficient_privilege then null;end;
 begin perform public.list_vault_people_v1((select id from public.vault_scopes));raise exception 'reader administered publishers';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000099"}',true);
do $$ begin
 if exists(select 1 from public.vault_entry_versions) then raise exception 'wrong workspace exposed version';end if;
 begin perform public.list_vault_entries_v1();raise exception 'wrong workspace searched vault';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'vault_scope_isolation: PASS' result;
rollback;
