-- SQL metadata-only licence positive and current-rights negative. The launcher
-- supplies the real checked-in catalogue bytes and synthetic local licence graph.
-- This is never described as an HTTP Storage or legal source-rights proof.
create function pg_temp.assert_native_catalog_contract(p_job uuid,p_cap text,p_recipe uuid,p_context_retained uuid,p_context_allocation uuid,p_catalog_fp text)returns void language plpgsql as $$
declare published jsonb;delivery jsonb;public_alloc jsonb;public_retained jsonb;closed jsonb;catalog_object uuid;catalog_scope jsonb;
begin
 select publication into strict published from pg_temp.native_provider_catalog_fixture;
 delivery:=public.worker_capture_capital_project_delivery_v1(p_job,p_cap,(select id from private.capital_public_input_snapshots where job_id=p_job),published->>'deliveryKey',published->'payload',jsonb_build_array(jsonb_build_object('kind','published_public_payload')||(published->'origin')));
 if delivery->'unresolvedReasons' is distinct from '["retention_storage_not_resolved"]'::jsonb then raise exception 'real licence graph delivery unresolved';end if;
 public_alloc:=public.worker_prepare_capital_public_payload_v1(p_job,p_cap,(delivery->>'deliveryId')::uuid,(published->>'requestId')::uuid,published->'payload');
 insert into storage.objects(bucket_id,name,metadata,version)values('capital-input-capture',public_alloc->>'path',jsonb_build_object('size',(public_alloc->>'byteLength')::bigint,'mimetype','application/json'),'native-provider-catalog-sql-v1')returning id into catalog_object;
 public_retained:=public.worker_commit_capital_public_payload_v1(p_job,p_cap,(public_alloc->>'allocationId')::uuid,catalog_object,'native-provider-catalog-sql-v1',public_alloc->>'payloadFingerprint',(public_alloc->>'byteLength')::bigint);
 closed:=private.worker_finalize_capital_native_recipe_v1(p_job,p_cap,p_recipe,(p_context_retained::text)::uuid,(public_retained->>'retainedPayloadId')::uuid,published->'payload');
 if closed->>'closed'<>'true' or closed->>'catalogFingerprint' is distinct from p_catalog_fp then raise exception 'actual catalogue closed fingerprint wrong';end if;
 catalog_scope:=public.worker_read_capital_native_recipe_v1(p_job,p_cap,p_recipe,(public_retained->>'retainedPayloadId')::uuid,'catalog');
 if catalog_scope->>'retentionState'<>'retained' or catalog_scope->>'bodyBasisId' is not null or catalog_scope->>'storageObjectId'<>catalog_object::text then raise exception 'catalogue reader physical scope wrong';end if;
 raise notice 'NATIVE ACTUAL CATALOGUE FINALIZE/READER LICENSE GRAPH PASS (SQL metadata fixture, no HTTP)';



 begin
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000983","role":"authenticated"}',true);
 perform set_config('request.headers','{"x-offroad-workspace":"20000000-0000-4000-8000-000000000983"}',true);
 perform public.set_source_rights_v1((published#>>'{origin,sourceVersionId}')::uuid,1,array['read'],array['analysis'],null,null,(published#>>'{origin,sourceVersionId}')::uuid,repeat('e',64));
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000981","role":"authenticated"}',true);
 if private.capital_native_recipe_deadline_v1('20000000-0000-4000-8000-000000000981',p_recipe,'10000000-0000-4000-8000-000000000981')is not null then raise exception 'native licence revocation did not deny';end if;
 begin perform public.worker_read_capital_native_recipe_v1(p_job,p_cap,p_recipe,(public_retained->>'retainedPayloadId')::uuid,'catalog');raise exception 'revoked licence reader accepted';exception when insufficient_privilege then null;end;
 if not exists(select 1 from private.capital_body_retention_wakes where allocation_id=p_context_allocation)then raise exception 'rights revocation did not wake native body';end if;
 raise exception 'rights_fixture_rollback'using errcode='P3092';exception when sqlstate'P3092'then null;end;

end$$;
