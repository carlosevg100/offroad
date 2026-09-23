-- Stage 17, correction 3N, second part: a settled receipt records the outcome and reason of the
-- kernel run, so the bytes of a partial marker can never be published as success by a later lease.
-- Authorization runs before any byte validation. Nothing here grants execution or touches the producer.
set search_path='';

alter table private.execution_operation_receipts add column settled_outcome text check(settled_outcome in ('succeeded','partial'));
alter table private.execution_operation_receipts add column settled_reason text
 check(settled_reason is null or settled_reason in ('calculated','invalid_input','calculation_failed','budget_exhausted','operation_uncertain'));
alter table private.execution_operation_receipts drop constraint execution_operation_receipts_settled_bytes_check;
alter table private.execution_operation_receipts add constraint execution_operation_receipts_settled_bytes_check
 check (canonical_result is null or (state='settled' and settled_outcome is not null and settled_reason is not null
  and (settled_outcome='partial' or settled_reason='calculated')
  and octet_length(canonical_result)<=8388608
  and private.execution_json_projection_v1(canonical_result) is not null
  and result_fingerprint=encode(extensions.digest(convert_to(canonical_result,'UTF8'),'sha256'),'hex')));

drop function public.worker_settle_execution_v2(uuid,text,uuid,text);
drop function private.worker_settle_execution_v2(uuid,text,uuid,text);
drop function private.settle_execution_operation_v2(uuid,text,uuid,uuid,text,text,bigint,bigint);

create function private.settle_execution_operation_v2(p_job uuid,p_capability text,p_lease uuid,p_operation uuid,p_fingerprint text,p_result_text text,p_outcome text,p_reason text,p_spent bigint,p_calls bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;b private.execution_budget_accounts;r private.execution_operation_receipts;result_hash text;begin
 j:=private.execution_for_lease_v1(p_job,p_capability,p_lease);
 b:=private.account_execution_duration_v1(j);
 if p_result_text is null or octet_length(p_result_text)>8388608
 or p_outcome is null or p_outcome not in ('succeeded','partial')
 or p_reason is null or p_reason not in ('calculated','invalid_input','calculation_failed','budget_exhausted','operation_uncertain')
 or (p_outcome='succeeded' and p_reason<>'calculated') or (p_outcome='partial' and p_reason='calculated')
 then raise exception 'execution_settlement_invalid' using errcode='22023';end if;
 perform private.execution_json_projection_v1(p_result_text);
 result_hash:=encode(extensions.digest(convert_to(p_result_text,'UTF8'),'sha256'),'hex');
 select * into r from private.execution_operation_receipts where organization_id=j.organization_id and execution_id=j.execution_id and operation_id=p_operation for update;
 if not found or r.lease_id is distinct from p_lease then raise exception 'execution_operation_lease_denied' using errcode='42501';end if;
 if r.request_fingerprint is distinct from p_fingerprint
 or p_spent is null or p_spent not between 0 and r.reserved_microusd or p_calls is null or p_calls not between 0 and r.reserved_calls
 then raise exception 'execution_settlement_invalid' using errcode='22023';end if;
 if r.state='settled' then
  if r.result_fingerprint<>result_hash or r.spent_microusd<>p_spent or r.spent_calls<>p_calls
  or (r.settled_outcome is not null and r.settled_outcome<>p_outcome) or (r.settled_reason is not null and r.settled_reason<>p_reason)
  then raise exception 'execution_settlement_conflict' using errcode='23505';end if;
  if r.canonical_result is null then update private.execution_operation_receipts set canonical_result=p_result_text,settled_outcome=p_outcome,settled_reason=p_reason where id=r.id;end if;
  return jsonb_build_object('settled',true,'replayed',true);
 end if;
 if r.state<>'reserved' then raise exception 'execution_operation_uncertain' using errcode='55000';end if;
 update private.execution_operation_receipts set state='settled',spent_microusd=p_spent,spent_calls=p_calls,result_fingerprint=result_hash,
  canonical_result=p_result_text,settled_outcome=p_outcome,settled_reason=p_reason where id=r.id;
 update private.execution_budget_accounts set reserved_microusd=reserved_microusd-r.reserved_microusd,reserved_calls=reserved_calls-r.reserved_calls,
 spent_microusd=spent_microusd+p_spent,spent_calls=spent_calls+p_calls where id=b.id;
 return jsonb_build_object('settled',true,'replayed',false);
end $$;
revoke all on function private.settle_execution_operation_v2(uuid,text,uuid,uuid,text,text,text,text,bigint,bigint) from public,anon,authenticated,service_role;

create or replace function private.execution_settled_result_v1(p_job uuid,p_capability text,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;m private.execution_manifests;r private.execution_operation_receipts;begin
 j:=private.execution_for_lease_v1(p_job,p_capability,p_lease);
 select * into strict m from private.execution_manifests where organization_id=j.organization_id and execution_id=j.execution_id;
 select * into r from private.execution_operation_receipts where organization_id=j.organization_id and execution_id=j.execution_id and operation_id=j.execution_id
  and state='settled' and canonical_result is not null and settled_outcome is not null and settled_reason is not null
  and tool_id=m.payload#>>'{method,executor,key}' and tool_version=m.payload#>>'{method,executor,version}';
 if not found then return jsonb_build_object('available',false);end if;
 return jsonb_build_object('available',true,'resultText',r.canonical_result,'resultHash',r.result_fingerprint,'outcome',r.settled_outcome,'reason',r.settled_reason,'settledByLease',r.lease_id);
end $$;

create or replace function private.commit_work_execution_result_v1(p_job uuid,p_capability text,p_lease uuid,p_contract_hash text,p_input_hash text,p_result_text text,p_outcome text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;b private.execution_budget_accounts;m private.execution_manifests;r private.execution_result_receipts;o private.execution_operation_receipts;
 result_hash text:=encode(extensions.digest(convert_to(p_result_text,'UTF8'),'sha256'),'hex');expired boolean;begin
 j:=private.execution_for_lease_v1(p_job,p_capability,p_lease,true);
 select * into strict m from private.execution_manifests where organization_id=j.organization_id and execution_id=j.execution_id;
 if m.payload_fingerprint is distinct from p_contract_hash or m.snapshot_fingerprint is distinct from p_input_hash then raise exception 'execution_result_input_mismatch' using errcode='42501';end if;
 perform private.execution_json_projection_v1(p_result_text);
 if p_outcome is null or p_outcome not in ('succeeded','partial') or p_reason is null or length(p_reason) not between 1 and 120 then raise exception 'execution_result_invalid' using errcode='22023';end if;
 select * into r from private.execution_result_receipts where organization_id=j.organization_id and execution_id=j.execution_id;
 if found then
  if r.lease_id<>p_lease or r.result_fingerprint<>result_hash or r.outcome<>p_outcome or r.reason<>p_reason then raise exception 'execution_result_conflict' using errcode='23505';end if;
  return jsonb_build_object('committed',true,'replayed',true,'outcome',r.outcome);
 end if;
 b:=private.account_execution_duration_v1(j);
 expired:=clock_timestamp()>=(m.payload#>>'{budget,expiresAt}')::timestamptz or b.active_duration_ms>=(m.payload#>>'{budget,maxDurationMs}')::bigint;
 if (expired and (p_outcome<>'partial' or p_reason<>'budget_exhausted'))
 or (exists(select 1 from private.execution_operation_receipts where organization_id=j.organization_id and execution_id=j.execution_id and state<>'settled') and (p_outcome<>'partial' or (not expired and p_reason<>'operation_uncertain')))
 then raise exception 'execution_partial_result_required' using errcode='55000';end if;
 -- A terminal success must be the exact settled success of the one pinned kernel: settled by this
 -- lease, or settled with its bytes and a succeeded outcome by an earlier lease of the same execution.
 if p_outcome='succeeded' then
  select * into o from private.execution_operation_receipts x
  where x.organization_id=j.organization_id and x.execution_id=j.execution_id and x.operation_id=j.execution_id
  and x.state='settled' and x.result_fingerprint=result_hash
  and (x.lease_id=p_lease or (x.canonical_result is not null and x.settled_outcome='succeeded'))
  and (x.settled_outcome is null or x.settled_outcome='succeeded')
  and x.tool_id=m.payload#>>'{method,executor,key}' and x.tool_version=m.payload#>>'{method,executor,version}';
  if not found then raise exception 'execution_calculation_receipt_required' using errcode='55000';end if;
 end if;
 -- Recheck current clocks after all lock waits and immediately before publication.
 if j.lease_expires_at<=clock_timestamp() or not private.execution_inputs_current_v1(j.organization_id,j.execution_id,j.authorization_subject_id)
 then raise exception 'execution_authority_denied' using errcode='42501';end if;
 insert into private.execution_result_receipts(organization_id,execution_id,lease_id,settlement_lease_id,contract_fingerprint,input_fingerprint,result_fingerprint,canonical_result,outcome,reason)
 values(j.organization_id,j.execution_id,p_lease,o.lease_id,p_contract_hash,p_input_hash,result_hash,p_result_text,p_outcome,p_reason);
 update public.processing_jobs set status='succeeded',result=jsonb_build_object('executionId',j.execution_id,'outcome',p_outcome,'resultFingerprint',result_hash) where id=j.id;
 update public.processing_runs set status=p_outcome,completed_at=clock_timestamp(),usage=jsonb_build_object('costMicrousd',b.spent_microusd,'modelCalls',b.spent_calls,'activeDurationMs',b.active_duration_ms)
 where organization_id=j.organization_id and id=j.processing_run_id;
 update private.execution_budget_accounts set accounted_at=null where id=b.id;
 return jsonb_build_object('committed',true,'replayed',false,'outcome',p_outcome);
end $$;

create function private.worker_settle_execution_v2(p_job uuid,p_capability text,p_lease uuid,p_result_text text,p_outcome text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;m private.execution_manifests;begin
 j:=private.execution_for_lease_v1(p_job,p_capability,p_lease);
 select * into strict m from private.execution_manifests where organization_id=j.organization_id and execution_id=j.execution_id;
 return private.settle_execution_operation_v2(p_job,p_capability,p_lease,j.execution_id,m.payload_fingerprint,p_result_text,p_outcome,p_reason,0,0);
end $$;
create function public.worker_settle_execution_v2(p_job uuid,p_capability text,p_lease uuid,p_result_text text,p_outcome text,p_reason text) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_settle_execution_v2(p_job,p_capability,p_lease,p_result_text,p_outcome,p_reason);$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.proname in ('worker_settle_execution_v2')
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
