begin;
\ir support/artifact_roundtrip_setup.sql

do $$declare org uuid:='a11b0000-0000-4000-9000-000000000001';work uuid:='a11b0000-0000-4000-9000-000000000002';h uuid;rule uuid;claim jsonb;
begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 h:=public.place_legal_hold_v1(work,gen_random_uuid());reset role;
 insert into private.retention_rules(organization_id,resource_id,revision,mode,expires_at,basis_reference,created_by)
 values(org,work,1,'expire',clock_timestamp()-interval '1 second',gen_random_uuid(),'a11b0000-0000-4000-8000-000000000001') returning id into rule;
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');set local role authenticated;
 claim:=public.worker_claim_retention_action_v1('synthetic-roundtrip-worker-token');reset role;
 if(claim->>'claimed')::boolean or exists(select 1 from private.retention_actions where rule_id=rule)then raise exception 'held expiry planned destruction';end if;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 perform public.release_legal_hold_v1(h,gen_random_uuid());
 begin perform public.worker_claim_retention_action_v1('synthetic-roundtrip-worker-token');raise exception 'human borrowed retention credential';exception when insufficient_privilege then null;end;reset role;
 raise notice 'PASS retention_hold_blocks_planning_and_human_cannot_borrow_worker';
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');
 perform private.plan_retention_actions_v1('synthetic-roundtrip-worker-token');
 update private.retention_actions set created_at=clock_timestamp()-interval '1 minute' where rule_id=rule and bucket_id='case-artifacts';
 set local role authenticated;
 claim:=public.worker_claim_retention_action_v1('synthetic-roundtrip-worker-token');reset role;
 if(claim->>'claimed')::boolean is distinct from true or claim->>'path'<>pg_temp.val('rt_path','')then raise exception 'wrong physical scope claimed %',claim;end if;
 perform pg_temp.remember('retention_claim',claim);
 set local role authenticated;
 if not public.worker_revalidate_retention_action_v1('synthetic-roundtrip-worker-token',(claim->>'actionId')::uuid,claim->>'capability')then raise exception 'worker lease denied';end if;
 begin perform public.worker_revalidate_retention_action_v1('synthetic-roundtrip-worker-token',(claim->>'actionId')::uuid,'wrong');raise exception 'wrong capability passed';exception when insufficient_privilege then null;end;
 begin perform public.worker_ack_retention_action_v1('synthetic-roundtrip-worker-token',(claim->>'actionId')::uuid,claim->>'capability',true);raise exception 'object present acknowledged absent';exception when insufficient_privilege then null;end;reset role;
 raise notice 'PASS retention_exact_lease_wrong_capability_and_false_absence_denied';
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');set local role authenticated;
 begin perform public.place_legal_hold_v1(work,gen_random_uuid());raise exception 'hold falsely promised after destruction admitted';exception when sqlstate '55000'then null;end;
 begin perform public.set_retention_rule_v1(work,'retain',null,gen_random_uuid());raise exception 'disposed resource revived';exception when sqlstate '55000'then null;end;reset role;
 raise notice 'PASS retention_disposal_cannot_be_revived_or_falsely_held';
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');set local role authenticated;
 perform public.worker_retry_retention_action_v1('synthetic-roundtrip-worker-token',(claim->>'actionId')::uuid,claim->>'capability','storage_delete_failed');reset role;
 if not exists(select 1 from private.retention_actions where id=(claim->>'actionId')::uuid and state='pending' and capability_sha256 is null)then raise exception 'retry kept old capability';end if;
 raise notice 'PASS retention_retry_revokes_old_lease_without_claiming_erasure';
 update private.retention_actions set attempts=4 where id=(claim->>'actionId')::uuid;
 perform pg_temp.act_as('a4210000-0000-4000-8000-000000000001');set local role authenticated;
 claim:=public.worker_claim_retention_action_v1('synthetic-roundtrip-worker-token');reset role;
 if (claim->>'claimed')::boolean is distinct from true then raise exception 'fifth attempt was not leased';end if;
 set local role authenticated;
 perform public.worker_retry_retention_action_v1('synthetic-roundtrip-worker-token',(claim->>'actionId')::uuid,claim->>'capability','storage_absence_unconfirmed');reset role;
 if not exists(select 1 from private.retention_actions where id=(claim->>'actionId')::uuid and state='blocked'and attempts=5 and completed_at is null)then raise exception 'failed purge falsely completed or unbounded retry';end if;
 raise notice 'PASS retention_fifth_failure_deadletters_without_claiming_erasure';
 if(select count(*)from private.retention_plan_receipts where organization_id=org and rule_id=rule)<>1 then raise exception 'planning receipt missing';end if;
 perform private.plan_retention_actions_v1('synthetic-roundtrip-worker-token');
 if(select count(*)from private.retention_plan_receipts where organization_id=org and rule_id=rule)<>1 then raise exception 'rule replanned';end if;
 raise notice 'PASS retention_plan_is_sealed_once_without_starving_next_rules';

end;$$;
rollback;
