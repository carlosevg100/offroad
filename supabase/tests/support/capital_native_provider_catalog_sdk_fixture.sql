-- LOCAL disposable license graph fixture. Actual catalogue snapshot bytes come
-- from the checked-in immutable public-research source. Licence declarations and
-- leaf payloads are synthetic test rights, never a commercial/legal assertion.
-- No native capture/body/Storage receipt or accepted/model row is fabricated.
begin;
select set_config('request.jwt.claim.sub','',true);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)values
('10000000-0000-4000-8000-000000000983','authenticated','authenticated','native-provider-publisher@example.invalid','{"provider":"email","providers":["email"]}','{}',now(),now(),false,false);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000983","role":"authenticated"}',true);
insert into public.organizations(id,organization_type,name,created_by)values('20000000-0000-4000-8000-000000000983','offroad','Synthetic native provider publisher','10000000-0000-4000-8000-000000000983');
insert into public.organization_memberships(organization_id,user_id,role,status)values('20000000-0000-4000-8000-000000000983','10000000-0000-4000-8000-000000000983','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by)values('30000000-0000-4000-8000-000000000983','20000000-0000-4000-8000-000000000983','Synthetic native provider publication','10000000-0000-4000-8000-000000000983');
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000983"}',true);
create function pg_temp.publish_native_provider_source(payload jsonb)returns jsonb language plpgsql as $$declare v uuid:=gen_random_uuid();b uuid;r uuid;begin
 insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by)values(v,'20000000-0000-4000-8000-000000000983','30000000-0000-4000-8000-000000000983','30000000-0000-4000-8000-000000000983','10000000-0000-4000-8000-000000000983');
 insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,initial_verification_state,created_by)
 values(v,'20000000-0000-4000-8000-000000000983',v,1,1,'opportunity-documents','20000000-0000-4000-8000-000000000983/native-catalog/'||v,'Synthetic native provider source','pending_verification','10000000-0000-4000-8000-000000000983');
 insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
 values('20000000-0000-4000-8000-000000000983',v,'30000000-0000-4000-8000-000000000983','30000000-0000-4000-8000-000000000983',gen_random_uuid(),'10000000-0000-4000-8000-000000000983')returning id into b;
 r:=public.declare_public_source_reuse_v1(v,0,payload->>'url',private.public_source_payload_sha256_v1(payload),clock_timestamp()+interval'2 days',clock_timestamp()+interval'2 days',v,payload->>'contentHash');
 return jsonb_build_object('licensingOrganizationId','20000000-0000-4000-8000-000000000983','sourceVersionId',v,'rightsVersionId',r,'sourceBindingId',b);
end$$;
create temp table native_provider_catalog_fixture(publication jsonb);
do $$declare payload jsonb:= --NATIVE_CATALOG_PAYLOAD
;catalog jsonb:=(payload->>'snippet')::jsonb;root jsonb;source jsonb;leaf jsonb;begin
 root:=pg_temp.publish_native_provider_source(payload);
 for source in select value from jsonb_array_elements(catalog->'sources')loop
 leaf:=pg_temp.publish_native_provider_source(jsonb_build_object('url',source->>'url','title','Synthetic local leaf for licence graph','snippet','Synthetic isolated licence payload, not downloaded website content.','contentHash',repeat('b',64)));
 perform public.add_source_dependency_v1((root->>'sourceVersionId')::uuid,(leaf->>'sourceVersionId')::uuid);
 end loop;
 insert into pg_temp.native_provider_catalog_fixture values(jsonb_build_object('deliveryKey','native-provider-catalog:2026.09.10-v1','requestId',gen_random_uuid(),'payload',payload,'origin',root));
end$$;
update auth.users set instance_id='00000000-0000-0000-0000-000000000000',encrypted_password=extensions.crypt('native-provider-publisher-local-password',extensions.gen_salt('bf')),
 email_confirmed_at=clock_timestamp(),confirmation_token='',recovery_token='',email_change_token_new='',email_change=''where id='10000000-0000-4000-8000-000000000983';
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at)
select gen_random_uuid(),id,id::text,'email',jsonb_build_object('sub',id,'email',email),clock_timestamp(),clock_timestamp()from auth.users where id='10000000-0000-4000-8000-000000000983';
select publication::text from pg_temp.native_provider_catalog_fixture;
commit;
