begin;
\ir support/artifact_roundtrip_setup.sql

do $$declare org uuid:='a11b0000-0000-4000-9000-000000000001';work uuid:='a11b0000-0000-4000-9000-000000000002';revision uuid:=pg_temp.val('rt_revision','revision_id')::uuid;fp text;h uuid;count_erased integer;
begin
 select manifest_fingerprint into fp from public.artifact_revisions where id=revision;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 h:=public.place_legal_hold_v1(work,gen_random_uuid());reset role;
 insert into private.retention_rules(organization_id,resource_id,revision,mode,expires_at,basis_reference,created_by)
 values(org,work,1,'expire',clock_timestamp()-interval '1 second',gen_random_uuid(),'a11b0000-0000-4000-8000-000000000001');
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');
 perform private.plan_retention_actions_v1('synthetic-roundtrip-worker-token');
 count_erased:=private.dispose_typed_retention_payloads_v1('synthetic-roundtrip-worker-token');
 if count_erased<>0 or exists(select 1 from public.artifact_revisions where id=revision and payload_disposal_id is not null)then raise exception 'hold erased typed payload';end if;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 perform public.release_legal_hold_v1(h,gen_random_uuid());
 begin perform private.dispose_typed_retention_payloads_v1('synthetic-roundtrip-worker-token');raise exception 'human borrowed typed disposal';exception when insufficient_privilege then null;end;reset role;
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');
 perform private.plan_retention_actions_v1('synthetic-roundtrip-worker-token');
 count_erased:=private.dispose_typed_retention_payloads_v1('synthetic-roundtrip-worker-token');
 if count_erased<>1 or not exists(select 1 from public.artifact_revisions where id=revision and manifest_fingerprint=fp and manifest='{"retention":"erased"}'::jsonb and payload_disposal_id is not null)then raise exception 'identity lost or manifest payload retained';end if;
 if exists(select 1 from public.artifact_blocks where revision_id=revision and(content<>'{"retention":"erased"}'::jsonb or claims<>'[]'::jsonb or payload_disposal_id is null))then raise exception 'derivative text or claims retained';end if;
 if private.dispose_typed_retention_payloads_v1('synthetic-roundtrip-worker-token')<>0 then raise exception 'disposal not idempotent';end if;
 if not exists(select 1 from public.artifact_export_receipts where revision_id=revision and revision_manifest_fingerprint=fp)then raise exception 'Office identity erased';end if;
 raise notice 'PASS typed_disposal_erases_payload_preserves_fingerprints_receipts_and_holds';
 begin update public.artifact_blocks set content='{"text":"resurrected"}'where revision_id=revision;raise exception 'purged block resurrected';exception when check_violation then null;end;
 begin update public.artifact_revisions set manifest='{"retention":"resurrected"}',payload_disposal_id=null where id=revision;raise exception 'purged manifest resurrected';exception when check_violation then null;end;
 raise notice 'PASS typed_disposal_is_final_and_humans_cannot_borrow_erasure';
end;$$;
rollback;
