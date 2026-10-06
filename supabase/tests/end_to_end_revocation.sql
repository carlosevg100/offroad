-- Lifecycle contract tests: transaction-only synthetic identities. No byte purge claimed by SQL.
begin;
\ir support/artifact_roundtrip_setup.sql

do $$declare r jsonb;h uuid;batch jsonb;org uuid:='a11b0000-0000-4000-9000-000000000001';work uuid:='a11b0000-0000-4000-9000-000000000002';
begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 r:=public.set_retention_rule_v1(work,'retain',null,gen_random_uuid());
 h:=public.place_legal_hold_v1(work,gen_random_uuid());reset role;
 if not private.resource_legal_hold_v1(org,work) or not private.storage_has_legal_hold_v1('case-artifacts',pg_temp.val('rt_path','')) then raise exception 'hold did not propagate';end if;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');set local role authenticated;
 begin perform public.release_legal_hold_v1(h,gen_random_uuid());raise exception 'member released hold';exception when insufficient_privilege then null;end;
 begin perform public.set_retention_rule_v1(work,'expire',now()+interval '1 day',gen_random_uuid());raise exception 'member set retention';exception when insufficient_privilege then null;end;
 begin perform public.export_authorized_audit_v1();raise exception 'member read audit';exception when insufficient_privilege then null;end;
 begin perform public.read_artifact_export_receipt_v1(pg_temp.val('rt_receipt','receiptId')::uuid);raise exception 'hold granted content';exception when insufficient_privilege then null;end;reset role;
 raise notice 'PASS lifecycle_hold_reaches_storage_without_granting_access';
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 if not public.release_legal_hold_v1(h,gen_random_uuid()) or public.release_legal_hold_v1(h,gen_random_uuid()) then raise exception 'hold release not idempotent';end if;
 batch:=public.export_authorized_audit_v1(0,500);reset role;
 if batch->>'organizationId'<>org::text or batch->>'fingerprint'!~'^[a-f0-9]{64}$' or jsonb_array_length(batch->'events')=0
 or exists(select 1 from jsonb_array_elements(batch->'events') e where e ? 'metadata') then raise exception 'audit export scope/allowlist failed';end if;
 if private.resource_legal_hold_v1(org,work) then raise exception 'hold remained after release';end if;
 raise notice 'PASS lifecycle_admin_rule_hold_release_and_bounded_audit';
 begin update public.audit_events set action='tampered' where organization_id=org;raise exception 'audit mutable';exception when insufficient_privilege then null;end;
 begin truncate public.audit_events cascade;raise exception 'audit truncate allowed';exception when insufficient_privilege then null;end;
 raise notice 'PASS lifecycle_audit_append_only_update_and_truncate';
end;$$;

do $$declare org uuid:='a11b0000-0000-4000-9000-000000000001';work uuid:='a11b0000-0000-4000-9000-000000000002';obj uuid;
begin
 select storage_object_id into obj from public.artifact_export_receipts where id=pg_temp.val('rt_receipt','receiptId')::uuid;
 if not exists(select 1 from private.artifact_export_object_identities i where i.id=obj and i.organization_id=org and i.content_sha256=repeat('a',64))then raise exception 'export identity missing';end if;
 -- Catalogue proof of durable FK, never delete Storage metadata through SQL.
 if not exists(select 1 from pg_constraint where conrelid='public.artifact_export_receipts'::regclass
 and conname='artifact_export_receipts_object_identity_fk' and confrelid='private.artifact_export_object_identities'::regclass)
 then raise exception 'receipt still depends on erasable Storage metadata';end if;
 if not exists(select 1 from public.artifact_export_receipts where storage_object_id=obj) or not exists(select 1 from private.artifact_export_object_identities where id=obj)then raise exception 'historical evidence erased';end if;
 begin update private.artifact_export_object_identities set content_sha256=repeat('b',64) where id=obj;raise exception 'identity mutable';exception when insufficient_privilege then null;end;
 raise notice 'PASS lifecycle_receipt_fk_targets_immutable_identity';
 insert into private.retention_rules(organization_id,resource_id,revision,mode,expires_at,basis_reference,created_by)
 values(org,work,2,'expire',clock_timestamp()-interval '1 second',gen_random_uuid(),'a11b0000-0000-4000-8000-000000000001');
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 if private.evaluate_resource_policy_v1(org,work,auth.uid(),'read','analysis') or private.evaluate_resource_policy_v1(org,work,auth.uid(),'work','analysis')then raise exception 'expired data still accessible';end if;
 set local role authenticated;
 begin perform public.read_artifact_export_receipt_v1(pg_temp.val('rt_receipt','receiptId')::uuid);raise exception 'expired export accessible';exception when insufficient_privilege then null;end;reset role;
 raise notice 'PASS lifecycle_expiry_denies_use_before_async_cleanup';
end;$$;

do $$declare run uuid;status jsonb;
begin
 select id into run from private.revocation_runs where organization_id='a11b0000-0000-4000-9000-000000000001' order by created_at desc limit 1;
 if run is null or(select count(*) from private.revocation_targets where run_id=run)<>6 then raise exception 'destinations missing';end if;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 status:=public.read_revocation_status_v1(run);reset role;
 if(status->>'completed')::boolean then raise exception 'unacknowledged run reported complete';end if;
 perform pg_temp.act_as('a4192000-0000-4000-8000-000000000001');set local role authenticated;
 begin perform public.read_revocation_status_v1(run);raise exception 'foreign status read';exception when insufficient_privilege then null;end;reset role;
 raise notice 'PASS lifecycle_revocation_waits_for_every_destination_and_denies_foreign_status';
end;$$;
rollback;
