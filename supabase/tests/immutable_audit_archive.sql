begin;
\ir support/artifact_roundtrip_setup.sql

do $$declare org uuid:='a11b0000-0000-4000-9000-000000000001';claim jsonb;batch uuid;payload jsonb;ack jsonb;rows integer;
begin
 -- No other tenant or historical operational batch is modified outside this rollback.
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 begin perform public.worker_claim_audit_batch_v1('synthetic-roundtrip-worker-token');raise exception 'human borrowed archive worker';exception when insufficient_privilege then null;end;reset role;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(org,'a11b0000-0000-4000-8000-000000000001','read.allowed','work','a11b0000-0000-4000-9000-000000000002','{"privateText":"must not leave the database","financialAmount":999999}');
 -- Select only our synthetic wake, preventing fixture dependence on an empty staging database.
 update private.audit_archive_wakes set archived_through_id=last_event_id where organization_id<>org;
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');set local role authenticated;
 claim:=public.worker_claim_audit_batch_v1('synthetic-roundtrip-worker-token');reset role;
 if claim->>'organizationId'<>org::text or not(claim->>'claimed')::boolean then raise exception 'wrong tenant batch claimed';end if;
 batch:=(claim->>'batchId')::uuid;payload:=(claim->>'canonicalPayload')::jsonb;
 if payload::text like '%must not leave%' or payload::text like '%999999%' or payload::text like '%privateText%'then raise exception 'financial metadata leaked';end if;
 if claim->>'sha256'<>encode(extensions.digest(convert_to(claim->>'canonicalPayload','utf8'),'sha256'),'hex')then raise exception 'sealed bytes fingerprint mismatch';end if;
 raise notice 'PASS audit_sealed_bytes_allowlist_and_human_worker_denied';
 begin update private.audit_export_batches set canonical_payload='{}'where id=batch;raise exception 'sealed batch rewritten';exception when insufficient_privilege then null;end;
 begin delete from private.audit_export_batches where id=batch;raise exception 'sealed batch deleted';exception when insufficient_privilege then null;end;
 set local role authenticated;
 begin perform public.worker_ack_audit_batch_v1('synthetic-roundtrip-worker-token',batch,'wrong',claim->>'sha256','real-test-version');raise exception 'wrong capability accepted';exception when insufficient_privilege then null;end;
 begin perform public.worker_ack_audit_batch_v1('synthetic-roundtrip-worker-token',batch,claim->>'capability',repeat('f',64),'real-test-version');raise exception 'wrong fingerprint accepted';exception when insufficient_privilege then null;end;
 ack:=public.worker_ack_audit_batch_v1('synthetic-roundtrip-worker-token',batch,claim->>'capability',claim->>'sha256','test-opaque-s3-version');
 if ack<> '{"completed":true,"replayed":false}'::jsonb then raise exception 'ack missing';end if;
 ack:=public.worker_ack_audit_batch_v1('synthetic-roundtrip-worker-token',batch,claim->>'capability',claim->>'sha256','test-opaque-s3-version');
 if not(ack->>'replayed')::boolean then raise exception 'ack retry not idempotent';end if;
 begin perform public.worker_ack_audit_batch_v1('synthetic-roundtrip-worker-token',batch,claim->>'capability',claim->>'sha256','different-version');raise exception 'version substitution accepted';exception when invalid_parameter_value then null;end;reset role;
 raise notice 'PASS audit_immutable_scope_fingerprint_and_version_bound_ack';
 if not exists(select 1 from private.audit_archive_wakes where organization_id=org and archived_through_id=(payload->>'lastEventId')::bigint)then raise exception 'archive cursor did not advance';end if;
end;$$;
rollback;
