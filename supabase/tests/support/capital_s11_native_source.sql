-- Human publication/licensing source fixture in the same rollback transaction.
-- Generic capture/physical retention primitives; no M07 recipe or task wrappers.
reset role;
select set_config('offroad_test.native_worker_account','a8800000-0000-4000-8000-000000000001',true);
select set_config('offroad_test.native_workspace','a8800000-0000-4000-8000-000000000002',true);
create temp table s11_recipe_fixture(job_id uuid,capability text,base jsonb,retention jsonb);
grant all on s11_recipe_fixture to authenticated;
insert into s11_recipe_fixture select (j.v->>'job_id')::uuid,j.v->>'capability_token',b.v,r.v from s11_native_fixture j,s11_native_fixture b,s11_native_fixture r where j.k='claim' and b.k='base' and r.k='context_retained';
-- Native lifecycle: publication is an actual human command, in rollback fixture.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('10000000-0000-4000-8000-000000000994','authenticated','authenticated','s11-publisher@example.invalid','{}','{}',now(),now(),false,false);
-- The publisher is a separate Offroad organization. Its right never becomes a
-- consumer-tenant source row by virtue of the consumer's membership.
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000994","role":"authenticated"}',true);
insert into public.organizations(id,organization_type,name,created_by) values
('20000000-0000-4000-8000-000000000994','offroad','Synthetic capture publisher','10000000-0000-4000-8000-000000000994');
insert into public.organization_memberships(organization_id,user_id,role,status) values
('20000000-0000-4000-8000-000000000994','10000000-0000-4000-8000-000000000994','owner','active');
insert into public.capital_projects(id,organization_id,project_name,created_by) values
('30000000-0000-4000-8000-000000000994','20000000-0000-4000-8000-000000000994','Synthetic capture source','10000000-0000-4000-8000-000000000994');
select set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000994"}',true);
create temp table capture_public_license_fixture(source_version_id uuid,source_binding_id uuid,rights_version_id uuid,payload jsonb);
grant select on capture_public_license_fixture to authenticated;
do $$ declare v uuid:=gen_random_uuid(); b uuid; r uuid; sample jsonb; begin
 sample:='{"topic":"identity","provider":"official","retrievedAt":"2026-10-02T00:00:00Z","url":"https://example.invalid/capture-licensed","title":"Synthetic licensed source","snippet":"Licensed excerpt only","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'::jsonb;
 insert into public.sources(id,organization_id,origin_resource_id,origin_resource_reference,created_by)
 values(v,'20000000-0000-4000-8000-000000000994','30000000-0000-4000-8000-000000000994','30000000-0000-4000-8000-000000000994','10000000-0000-4000-8000-000000000994');
 insert into public.source_versions(id,organization_id,source_id,version_no,legacy_document_version,bucket_id,object_path,original_name,initial_verification_state,created_by)
 values(v,'20000000-0000-4000-8000-000000000994',v,1,1,'opportunity-documents','20000000-0000-4000-8000-000000000994/synthetic/'||v,'Synthetic excerpt','pending_verification','10000000-0000-4000-8000-000000000994');
 insert into public.source_bindings(organization_id,source_version_id,resource_id,resource_reference,request_id,created_by)
 values('20000000-0000-4000-8000-000000000994',v,'30000000-0000-4000-8000-000000000994','30000000-0000-4000-8000-000000000994',gen_random_uuid(),'10000000-0000-4000-8000-000000000994') returning id into b;
 r:=public.declare_public_source_reuse_v1(v,0,sample->>'url',private.public_source_payload_sha256_v1(sample),now()+interval '60 days',now()+interval '60 days',v,repeat('b',64));
 insert into pg_temp.capture_public_license_fixture values(v,b,r,sample);
end; $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('offroad_test.native_worker_account'),'role','authenticated')::text,true);
select set_config('request.headers',jsonb_build_object('x-offroad-workspace',current_setting('offroad_test.native_workspace'))::text,true);
create temp table s11_source_fixture(source_storage_object_id uuid,delivery_id uuid,source_allocation jsonb,source_retention jsonb,recipe jsonb,decision jsonb,input jsonb,accepted jsonb,parsed jsonb,final jsonb,final_fp text);
grant all on s11_source_fixture to authenticated;
insert into s11_source_fixture(final_fp) values(repeat('f',64));
set local role authenticated;
do $$declare f record;l record;c jsonb;delivery jsonb;a jsonb;begin
 select * into strict f from pg_temp.s11_recipe_fixture;select * into strict l from pg_temp.capture_public_license_fixture;
 c:=public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);
 delivery:=public.worker_capture_capital_project_delivery_v1(f.job_id,f.capability,(c#>>'{capture,id}')::uuid,'s11:published:1',l.payload,jsonb_build_array(jsonb_build_object('kind','published_public_payload')));
 a:=public.worker_prepare_capital_public_payload_v1(f.job_id,f.capability,(delivery->>'deliveryId')::uuid,gen_random_uuid(),l.payload);
 update pg_temp.s11_source_fixture set delivery_id=(delivery->>'deliveryId')::uuid,source_allocation=a;
end;$$;
reset role;
insert into storage.objects(bucket_id,name,metadata,version) select source_allocation->>'bucket',source_allocation->>'path',jsonb_build_object('size',(source_allocation->>'byteLength')::bigint,'mimetype','application/json'),'s11-source-sql-v1' from s11_source_fixture;
update s11_source_fixture t set source_storage_object_id=o.id from storage.objects o where o.bucket_id=t.source_allocation->>'bucket' and o.name=t.source_allocation->>'path';
set local role authenticated;
do $$declare f record;t record;o uuid;begin
 select * into strict f from pg_temp.s11_recipe_fixture;select * into strict t from pg_temp.s11_source_fixture;
 o:=t.source_storage_object_id; if o is null then raise exception 'source_fixture_storage_object_missing';end if;
 update pg_temp.s11_source_fixture set source_retention=public.worker_commit_capital_public_payload_v1(f.job_id,f.capability,(t.source_allocation->>'allocationId')::uuid,o,'s11-source-sql-v1',t.source_allocation->>'payloadFingerprint',(t.source_allocation->>'byteLength')::bigint);
end;$$;
reset role;
insert into agent_fixture select 's11_render_input_2',jsonb_build_object('base',f.base,'context',(f.base->>'canonicalContext')::jsonb,'jobId',f.job_id,'recipeId',f.base->>'recipeId','prelude',(select jsonb_agg(projection order by task_id) from s11_prelude_fixture where task_id in('M01','M02')),'deliveryId',s.delivery_id,'retainedPayloadId',s.source_retention->>'retainedPayloadId','source',(select payload from capture_public_license_fixture)) from s11_recipe_fixture f,s11_source_fixture s;
