begin;
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',0,array['read','store'],array['analysis'],null,null,gen_random_uuid(),repeat('a',64));
do $$ begin
 begin perform public.submit_vault_entry_version_v1('a5120000-0000-4000-9000-000000000401','a5120000-0000-4000-9000-000000000402',null,'directive','Synthetic derived directive','Synthetic derived content',null,array['a11b0000-0000-4000-9000-000000000004'::uuid]);raise exception 'derivation without derive operation accepted';exception when insufficient_privilege then null;end;
end $$;
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,array['read','store','derive'],array['analysis'],null,null,gen_random_uuid(),repeat('b',64));
select public.submit_vault_entry_version_v1('a5120000-0000-4000-9000-000000000401','a5120000-0000-4000-9000-000000000402',null,'directive','Synthetic derived directive','Synthetic derived content',null,array['a11b0000-0000-4000-9000-000000000004'::uuid]);
select public.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',2,array['read','store','derive'],array['analysis','publication'],null,null,gen_random_uuid(),repeat('c',64));
-- Omitting dependencies when revising cannot shed the pinned publication restriction.
select public.submit_vault_entry_version_v1('a5120000-0000-4000-9000-000000000401','a5120000-0000-4000-9000-000000000403','a5120000-0000-4000-9000-000000000402','directive','Synthetic derived revision','Synthetic edited content');
do $$ declare fp text;begin
 if (select jsonb_array_length(dependency_manifest) from public.vault_entry_versions where id='a5120000-0000-4000-9000-000000000403')<>1 then raise exception 'dependency omission laundered derived content';end if;
 perform public.set_resource_policy_grant_v1((select id from public.vault_scopes),'a11b0000-0000-4000-8000-000000000001',null,'publish','allow');
 select content_fingerprint into strict fp from public.vault_entry_versions where id='a5120000-0000-4000-9000-000000000403';
 perform public.propose_vault_publication_v1('a5120000-0000-4000-9000-000000000404','a5120000-0000-4000-9000-000000000403',fp,null,null,'analysis','Synthetic derived review');
 select review_fingerprint into strict fp from public.vault_publication_requests where id='a5120000-0000-4000-9000-000000000404';
 begin perform public.publish_vault_entry_v1('a5120000-0000-4000-9000-000000000404','a5120000-0000-4000-9000-000000000405',fp);raise exception 'broader new license laundered pinned restriction';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'vault_derived_rights: PASS' result;
rollback;
