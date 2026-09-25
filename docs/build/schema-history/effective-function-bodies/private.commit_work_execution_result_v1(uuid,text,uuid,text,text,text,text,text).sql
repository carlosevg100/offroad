CREATE OR REPLACE FUNCTION private.commit_work_execution_result_v1(p_job uuid, p_capability text, p_lease uuid, p_contract_hash text, p_input_hash text, p_result_text text, p_outcome text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 perform private.record_execution_result_milestone_v1(j.organization_id,j.execution_id);
 update public.processing_jobs set status='succeeded',result=jsonb_build_object('executionId',j.execution_id,'outcome',p_outcome,'resultFingerprint',result_hash) where id=j.id;
 update public.processing_runs set status=p_outcome,completed_at=clock_timestamp(),usage=jsonb_build_object('costMicrousd',b.spent_microusd,'modelCalls',b.spent_calls,'activeDurationMs',b.active_duration_ms)
 where organization_id=j.organization_id and id=j.processing_run_id;
 update private.execution_budget_accounts set accounted_at=null where id=b.id;
 return jsonb_build_object('committed',true,'replayed',false,'outcome',p_outcome);
end $function$
