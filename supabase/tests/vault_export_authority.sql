begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
-- Purpose is not an operation: export remains denied without export in operations.
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',0,array['read','store'],array['analysis','publication','export'],null,null,gen_random_uuid(),repeat('a',64));
select public.submit_vault_entry_version_v1('a5120000-0000-4000-9000-000000000101','a5120000-0000-4000-9000-000000000102',null,'source','Synthetic nonexportable reference',null,'a11b0000-0000-4000-9000-000000000004');
do $$ declare scope uuid; fp text;begin
 select id into strict scope from public.vault_scopes;
 perform public.set_resource_policy_grant_v1(scope,'a11b0000-0000-4000-8000-000000000001',null,'publish','allow');
 select content_fingerprint into strict fp from public.vault_entry_versions where id='a5120000-0000-4000-9000-000000000102';
 perform public.propose_vault_publication_v1('a5120000-0000-4000-9000-000000000103','a5120000-0000-4000-9000-000000000102',fp,null,null,'export','Synthetic export review');
 select review_fingerprint into strict fp from public.vault_publication_requests where id='a5120000-0000-4000-9000-000000000103';
 begin
  perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000103','a5120000-0000-4000-9000-000000000104',fp);
  raise exception 'missing export operation admitted publication';
 exception when insufficient_privilege then null;end;
end $$;
-- A broader current license does not rewrite the license pinned in the reviewed version.
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,array['read','store','export'],array['analysis','publication','export'],null,null,gen_random_uuid(),repeat('b',64));
do $$ declare fp text;begin
 select review_fingerprint into strict fp from public.vault_publication_requests where id='a5120000-0000-4000-9000-000000000103';
 begin perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000103','a5120000-0000-4000-9000-000000000104',fp);raise exception 'new license silently expanded reviewed version';exception when insufficient_privilege then null;end;
end $$;
-- A new human-reviewed source reference can pin the new license, without rewriting history.
select public.submit_vault_entry_version_v1('a5120000-0000-4000-9000-000000000101','a5120000-0000-4000-9000-000000000105','a5120000-0000-4000-9000-000000000102','source','Synthetic explicitly exportable reference',null,'a11b0000-0000-4000-9000-000000000004');
do $$ declare fp text;begin
 select content_fingerprint into strict fp from public.vault_entry_versions where id='a5120000-0000-4000-9000-000000000105';
 perform public.propose_vault_publication_v1('a5120000-0000-4000-9000-000000000106','a5120000-0000-4000-9000-000000000105',fp,null,null,'export','Synthetic explicit export review');
 select review_fingerprint into strict fp from public.vault_publication_requests where id='a5120000-0000-4000-9000-000000000106';
 perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000106','a5120000-0000-4000-9000-000000000107',fp);
 if jsonb_array_length(public.list_vault_entries_v1(p_purpose=>'export')->'rows')<>1 then raise exception 'licensed export missing';end if;
end $$;
-- Revocation immediately removes the reference from search, without deleting the human act.
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',2,'{}'::text[],array['analysis','publication','export'],null,null,gen_random_uuid(),repeat('c',64));
do $$ begin
 if jsonb_array_length(public.list_vault_entries_v1(p_purpose=>'export')->'rows')<>0 then raise exception 'revoked export remains in search';end if;
 if public.list_vault_publication_receipts_v1()->'rows'->0->>'title' is not null or (public.list_vault_publication_receipts_v1()->'rows'->0->>'available')::boolean then raise exception 'receipt disclosed revoked source';end if;
 if jsonb_array_length(public.list_vault_publication_receipts_v1()->'rows')<>1 then raise exception 'revoked source prevented withdrawal receipt';end if;
 perform public.withdraw_vault_publication_v1('a5120000-0000-4000-9000-000000000107','Synthetic withdrawal after license revocation');
end $$;
reset role;
select 'vault_export_authority: PASS' result;
rollback;
