begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
-- Test-only platform composition. It is rolled back and has no production authority.
insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)
select 'synthetic-composition',method_id,version,encode(extensions.digest('Synthetic method fixture','sha256'),'hex'),manifest,
 '[{"id":"synthetic.narrative","kind":"narrative","overridePoints":[{"id":"synthetic.text","target":"narrative","requiresRationale":true,"contract":{"value":{"type":"string"}}}]},{"id":"synthetic.covenant","kind":"rule","authority":"contract","overridePoints":[{"id":"synthetic.text","target":"assumption","requiresRationale":true,"contract":{"value":{"type":"string"}}}]}]',evidence,approval,capability_key
from private.platform_method_releases where id='r01-2026.09.06-v1';
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
set local role authenticated;
do $$ declare scope uuid;begin
 select id into scope from public.vault_scopes;
 perform public.set_resource_policy_grant_v1(scope,'a11b0000-0000-4000-8000-000000000001',null,'work','allow');
 perform public.set_resource_policy_grant_v1(scope,'a11b0000-0000-4000-8000-000000000001',null,'publish','allow');
 perform public.set_method_publication_policy_v1(false);
end $$;
select public.submit_vault_entry_version_v1('a5140000-0000-4000-9000-000000000011','a5140000-0000-4000-9000-000000000012',null,'directive','Synthetic method parameter','Synthetic reviewed method statement.');
do $$ declare o jsonb;fp text;begin
 select content_fingerprint into fp from public.vault_entry_versions where id='a5140000-0000-4000-9000-000000000012';
 o:=jsonb_build_object('componentId','synthetic.narrative','pointId','synthetic.text','version','2026.09.19-v1','scope','organization','scopeId','a11b0000-0000-4000-9000-000000000001','rationale','Synthetic explicit divergence','source',jsonb_build_object('versionId','a5140000-0000-4000-9000-000000000012','fingerprint',fp),'value','Synthetic house text');
 perform set_config('test.method_override',o::text,true);
 begin perform public.submit_method_candidate_v1('a5140000-0000-4000-9000-000000000013','Synthetic house','synthetic-composition',jsonb_build_array(o));raise exception 'unpublished vault source accepted';exception when insufficient_privilege then null;end;
 perform public.propose_vault_publication_v1('a5140000-0000-4000-9000-000000000014','a5140000-0000-4000-9000-000000000012',fp,null,null,'analysis','Synthetic method source review');
 select review_fingerprint into fp from public.vault_publication_requests where id='a5140000-0000-4000-9000-000000000014';
 perform public.publish_vault_entry_v1('a5140000-0000-4000-9000-000000000014','a5140000-0000-4000-9000-000000000015',fp);
 perform public.submit_method_candidate_v1('a5140000-0000-4000-9000-000000000013','Synthetic house','synthetic-composition',jsonb_build_array(o));
 if (select manifest->'parameters'->0->>'value' from public.method_releases where id='a5140000-0000-4000-9000-000000000013')<>'Synthetic house text' then raise exception 'declared override did not win';end if;
 if (select content->>'rationale' from public.method_component_versions limit 1)<>'Synthetic explicit divergence' then raise exception 'override provenance lost';end if;
 begin perform public.submit_method_candidate_v1(gen_random_uuid(),'Synthetic house','synthetic-composition',jsonb_build_array(o||'{"componentId":"synthetic.covenant"}'));raise exception 'covenant overridden';exception when invalid_parameter_value then null;end;
 begin perform public.submit_method_candidate_v1(gen_random_uuid(),'Synthetic house','synthetic-composition',jsonb_build_array(o||'{"pointId":"access_barriers"}'));raise exception 'barrier overridden';exception when invalid_parameter_value then null;end;
 begin perform public.submit_method_candidate_v1(gen_random_uuid(),'Synthetic house','synthetic-composition',jsonb_build_array(o||'{"value":25}'));raise exception 'untyped parameter accepted';exception when invalid_parameter_value then null;end;
 begin perform public.submit_method_candidate_v1(gen_random_uuid(),'Synthetic house','synthetic-composition',jsonb_build_array(o,o));raise exception 'ambiguous precedence accepted';exception when invalid_parameter_value then null;end;
 begin perform public.submit_method_candidate_v1(gen_random_uuid(),'Synthetic house','synthetic-composition',jsonb_build_array(o||'{"scope":null}'));raise exception 'null scope accepted';exception when invalid_parameter_value then null;end;
end $$;
do $$ declare r public.method_releases;begin
 select * into r from public.method_releases where id='a5140000-0000-4000-9000-000000000013';
 perform public.review_method_candidate_v1(r.id,'a5140000-0000-4000-9000-000000000016',r.manifest_fingerprint,r.evidence_fingerprint,'Synthetic full content and typed parameter review.');
 perform public.withdraw_vault_publication_v1('a5140000-0000-4000-9000-000000000015','Synthetic source withdrawal.');
 begin perform public.publish_method_release_v1(r.id,'a5140000-0000-4000-9000-000000000016',r.manifest_fingerprint);raise exception 'withdrawn source published as a method';exception when insufficient_privilege then null;end;
 perform public.set_resource_policy_grant_v1((select id from public.vault_scopes),'a11b0000-0000-4000-8000-000000000001',null,'read','deny');
 if exists(select 1 from public.method_releases) or exists(select 1 from public.method_component_versions) then raise exception 'revoked creator read method';end if;
end $$;
reset role;
select 'method_composition_rights: PASS' result;
rollback;
