-- Consumer authority: operational identity, one logical kernel receipt, terminal integrity.
-- Global service credential metadata, not tenant content. No account is inferred/backfilled.
alter table private.worker_tokens add column execution_account_user_id uuid references auth.users(id) on delete restrict;
create index worker_tokens_execution_account_idx on private.worker_tokens(execution_account_user_id);
comment on column private.worker_tokens.execution_account_user_id is 'Operator-verified Auth account for pinned execution only. Null denies this consumer; legacy consumers unchanged.';
create unique index execution_single_kernel_receipt on private.execution_operation_receipts(organization_id,execution_id);
create or replace function private.execution_for_lease_v1(p_job uuid,p_capability text,p_lease uuid,p_allow_completed boolean default false)
returns public.processing_jobs language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;begin
 -- Same ordering as claim: account, credential, policy, release, revision, job.
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'execution_lease_denied' using errcode='42501';end if;
 select * into j from public.processing_jobs where id=p_job and kind='work_execution';
 perform 1 from private.worker_tokens where id=j.leased_by and execution_account_user_id=auth.uid() and status='active' and revoked_at is null for share;
 if not found then raise exception 'execution_lease_denied' using errcode='42501';end if;
 j:=private.lock_execution_authority_v1(p_job);
 if p_lease is null or p_capability is null or length(p_capability)<32 or auth.uid() is null
 or j.lease_id is distinct from p_lease or j.capability_sha256 is distinct from extensions.digest(p_capability,'sha256')
 or j.leased_account_user_id is distinct from auth.uid()
 or not exists(select 1 from private.worker_tokens where id=j.leased_by and revoked_at is null and status='active' and execution_account_user_id=auth.uid())
 or not exists(select 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()))
 or not (j.status='leased' or (p_allow_completed and j.status='succeeded'))
 or j.lease_expires_at is null or j.lease_expires_at<=clock_timestamp()
 then raise exception 'execution_lease_denied' using errcode='42501';end if;
 return j;
end $$;

create or replace function private.claim_work_execution_v1(p_worker_token text,p_job_id uuid,p_lease_seconds integer default 60) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;worker uuid;cap text;lease uuid:=gen_random_uuid();m private.execution_manifests;b private.execution_budget_accounts;t timestamptz;begin
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'worker_account_required' using errcode='42501';end if;
 worker:=private.worker_identity(p_worker_token);
 if not exists(select 1 from private.worker_tokens where id=worker and revoked_at is null and execution_account_user_id=auth.uid()) then raise exception 'worker_token_invalid' using errcode='42501';end if;
 j:=private.lock_execution_authority_v1(p_job_id);
 t:=clock_timestamp();
 if not ((j.status='queued' and j.available_at<=t) or (j.status='leased' and j.lease_expires_at<=t)) then return jsonb_build_object('claimed',false);end if;
 b:=private.account_execution_duration_v1(j);
 select * into strict m from private.execution_manifests where organization_id=j.organization_id and execution_id=j.execution_id;
 if j.attempts>=j.max_attempts then raise exception 'execution_attempts_exhausted' using errcode='55000';end if;
 -- Do not release unconfirmed spend when a worker disappeared after transmission.
 update private.execution_operation_receipts set state='uncertain' where organization_id=j.organization_id and execution_id=j.execution_id and state='reserved';
 cap:=encode(extensions.gen_random_bytes(32),'hex');
 update public.processing_jobs set status='leased',attempts=attempts+1,leased_by=worker,leased_account_user_id=auth.uid(),
 lease_id=lease,lease_expires_at=t+make_interval(secs=>least(greatest(coalesce(p_lease_seconds,60),1),3600)),capability_sha256=extensions.digest(cap,'sha256')
 where id=j.id returning * into j;
 update private.execution_budget_accounts set lease_id=lease,accounted_at=t where id=b.id;
 update public.processing_runs set status='running',started_at=coalesce(started_at,t) where organization_id=j.organization_id and id=j.processing_run_id;
 return jsonb_build_object('claimed',true,'jobId',j.id,'leaseId',lease,'capability',cap,'attempt',j.attempts,
 'executionId',j.execution_id,'contractText',m.canonical_payload,'contractFingerprint',m.payload_fingerprint,
 'snapshotText',(select canonical_payload from private.execution_input_snapshots where organization_id=j.organization_id and execution_id=j.execution_id),
 'elapsedDurationMs',b.active_duration_ms,'leaseExpiresAt',j.lease_expires_at,
 'budgetExpired',(m.payload#>>'{budget,expiresAt}')::timestamptz<=clock_timestamp() or b.active_duration_ms>=(m.payload#>>'{budget,maxDurationMs}')::bigint);
end $$;


create or replace function private.reserve_execution_operation_v1(p_job uuid,p_capability text,p_lease uuid,p_operation uuid,p_fingerprint text,p_tool text,p_version text,p_effect text,p_cost bigint,p_calls bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;m private.execution_manifests;b private.execution_budget_accounts;r private.execution_operation_receipts;begin
 j:=private.execution_for_lease_v1(p_job,p_capability,p_lease);
 b:=private.account_execution_duration_v1(j);
 select * into strict m from private.execution_manifests where organization_id=j.organization_id and execution_id=j.execution_id;
 if p_operation is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
 or p_cost is null or p_cost not between 0 and 9007199254740991 or p_calls is null or p_calls not between 0 and 9007199254740991
 then raise exception 'execution_operation_invalid' using errcode='22023';end if;
 -- Only the pinned deterministic kernel is available in this closed increment.
 -- External tools, providers, research and fallback have no transmission receipt here.
 if p_tool is distinct from m.payload#>>'{method,executor,key}' or p_version is distinct from m.payload#>>'{method,executor,version}'
 or p_effect is distinct from 'read_only' or p_cost<>0 or p_calls<>0
 then raise exception 'execution_operation_denied' using errcode='42501';end if;
 select * into r from private.execution_operation_receipts where organization_id=j.organization_id and execution_id=j.execution_id for update;
 if found then
  if r.operation_id<>p_operation or r.request_fingerprint<>p_fingerprint or r.tool_id<>p_tool or r.tool_version<>p_version or r.effect<>p_effect or r.reserved_microusd<>p_cost or r.reserved_calls<>p_calls
  then raise exception 'execution_operation_conflict' using errcode='23505';end if;
  return jsonb_build_object('operationId',r.operation_id,'state',r.state,'replayed',true,'mayExecute',false);
 end if;
 if b.active_duration_ms>=(m.payload#>>'{budget,maxDurationMs}')::bigint or clock_timestamp()>=(m.payload#>>'{budget,expiresAt}')::timestamptz
 or b.spent_microusd+b.reserved_microusd>(m.payload#>>'{budget,maxCostMicrousd}')::bigint-p_cost
 or b.spent_calls+b.reserved_calls>(m.payload#>>'{budget,maxModelCalls}')::bigint-p_calls
 then return jsonb_build_object('state','partial_budget_exhausted','mayExecute',false);end if;
 insert into private.execution_operation_receipts(organization_id,execution_id,operation_id,lease_id,request_fingerprint,tool_id,tool_version,effect,reserved_microusd,reserved_calls,state)
 values(j.organization_id,j.execution_id,p_operation,p_lease,p_fingerprint,p_tool,p_version,p_effect,p_cost,p_calls,'reserved');
 update private.execution_budget_accounts set reserved_microusd=reserved_microusd+p_cost,reserved_calls=reserved_calls+p_calls where id=b.id;
 return jsonb_build_object('operationId',p_operation,'state','reserved','replayed',false,'mayExecute',true);
end $$;

create or replace function private.commit_work_execution_result_v1(p_job uuid,p_capability text,p_lease uuid,p_contract_hash text,p_input_hash text,p_result_text text,p_outcome text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;b private.execution_budget_accounts;m private.execution_manifests;r private.execution_result_receipts;
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
 -- A terminal success must be the exact settled output of the one pinned kernel.
 if p_outcome='succeeded' and not exists(select 1 from private.execution_operation_receipts o
 where o.organization_id=j.organization_id and o.execution_id=j.execution_id and o.lease_id=p_lease
 and o.state='settled' and o.result_fingerprint=result_hash
 and o.tool_id=m.payload#>>'{method,executor,key}' and o.tool_version=m.payload#>>'{method,executor,version}')
 then raise exception 'execution_calculation_receipt_required' using errcode='55000';end if;
 -- Recheck current clocks after all lock waits and immediately before publication.
 if j.lease_expires_at<=clock_timestamp() or not private.execution_inputs_current_v1(j.organization_id,j.execution_id,j.authorization_subject_id)
 then raise exception 'execution_authority_denied' using errcode='42501';end if;
 insert into private.execution_result_receipts(organization_id,execution_id,lease_id,contract_fingerprint,input_fingerprint,result_fingerprint,canonical_result,outcome,reason)
 values(j.organization_id,j.execution_id,p_lease,p_contract_hash,p_input_hash,result_hash,p_result_text,p_outcome,p_reason);
 update public.processing_jobs set status='succeeded',result=jsonb_build_object('executionId',j.execution_id,'outcome',p_outcome,'resultFingerprint',result_hash) where id=j.id;
 update public.processing_runs set status=p_outcome,completed_at=clock_timestamp(),usage=jsonb_build_object('costMicrousd',b.spent_microusd,'modelCalls',b.spent_calls,'activeDurationMs',b.active_duration_ms)
 where organization_id=j.organization_id and id=j.processing_run_id;
 update private.execution_budget_accounts set accounted_at=null where id=b.id;
 return jsonb_build_object('committed',true,'replayed',false,'outcome',p_outcome);
end $$;


-- Technical terminalization cannot produce/read a result or revive authority.
-- Caller is the authenticated, bound queue poll; the helper itself has no API grant.
create function private.close_exhausted_executions_v1() returns void
language plpgsql security definer set search_path='' as $$
declare c record;j public.processing_jobs;b private.execution_budget_accounts;begin
 for c in select id,organization_id from public.processing_jobs
 where kind='work_execution' and attempts>=max_attempts
 and (status='queued' or (status='leased' and lease_expires_at<=clock_timestamp())) order by available_at,id limit 16
 loop
  if not pg_try_advisory_xact_lock_shared(hashtextextended('resource-policy:'||c.organization_id::text,0)) then continue;end if;
  select * into j from public.processing_jobs where id=c.id for update skip locked;
  if not found then continue;end if;
  if j.attempts<j.max_attempts or not(j.status='queued' or (j.status='leased' and j.lease_expires_at<=clock_timestamp())) then continue;end if;
  b:=private.account_execution_duration_v1(j);
  update private.execution_operation_receipts set state='uncertain' where organization_id=j.organization_id and execution_id=j.execution_id and state='reserved';
  update public.processing_jobs set status='failed',capability_sha256=null,lease_expires_at=null,
   last_error=jsonb_build_object('code','execution_attempts_exhausted','retryable',false) where id=j.id;
  update public.processing_runs set status='failed',completed_at=clock_timestamp(),error=jsonb_build_object('code','execution_attempts_exhausted'),
   usage=jsonb_build_object('costMicrousd',b.spent_microusd,'modelCalls',b.spent_calls,'activeDurationMs',b.active_duration_ms)
   where id=j.processing_run_id and organization_id=j.organization_id;
  update private.execution_budget_accounts set accounted_at=null where id=b.id;
 end loop;
end $$;
revoke all on function private.close_exhausted_executions_v1() from public,anon,authenticated,service_role;

create function private.worker_claim_execution_v1(p_worker_token text,p_manifest_hashes text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare worker uuid;c record;r jsonb;previous_timeout text:=current_setting('lock_timeout');begin
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'worker_account_binding_required' using errcode='42501';end if;
 worker:=private.worker_identity(p_worker_token);
 if not exists(select 1 from private.worker_tokens t join auth.users u on u.id=t.execution_account_user_id
 where t.id=worker and t.execution_account_user_id=auth.uid() and t.status='active' and t.revoked_at is null
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()))
 then raise exception 'worker_account_binding_required' using errcode='42501';end if;
 if p_manifest_hashes is null or cardinality(p_manifest_hashes) not between 1 and 8
 or exists(select 1 from unnest(p_manifest_hashes) h where h is null or h !~ '^[a-f0-9]{64}$')
 then raise exception 'execution_executor_list_invalid' using errcode='22023';end if;
 perform private.close_exhausted_executions_v1();
 -- Candidate discovery holds no job-row lock. Claim preserves policy/release/revision/job order.
 for c in select j.id from public.processing_jobs j
 join private.execution_control_bindings b on b.organization_id=j.organization_id and b.execution_id=j.execution_id
 join private.execution_method_profiles p on p.id=b.profile_id
 join private.platform_method_releases r on r.id=p.platform_release_id
 join private.platform_capability_releases cap on cap.capability_key=r.capability_key
 where j.kind='work_execution' and j.attempts<j.max_attempts
 and ((j.status='queued' and j.available_at<=clock_timestamp()) or (j.status='leased' and j.lease_expires_at<=clock_timestamp()))
 and p.payload#>>'{method,manifestHash}'=any(p_manifest_hashes) and cap.released
 and private.job_authority_is_current_v1(j.id)
 order by j.available_at,j.created_at,j.id limit 16
 loop
  begin
   perform set_config('lock_timeout','100ms',true);
   r:=private.claim_work_execution_v1(p_worker_token,c.id,60);
   perform set_config('lock_timeout',previous_timeout,true);
   if (r->>'claimed')::boolean then return r;end if;
  exception when lock_not_available or insufficient_privilege then
   perform set_config('lock_timeout',previous_timeout,true);
  end;
 end loop;
 return jsonb_build_object('claimed',false);
end $$;

create function private.worker_renew_execution_v1(p_job uuid,p_capability text,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;b private.execution_budget_accounts;m private.execution_manifests;t timestamptz;remaining bigint;begin
 j:=private.execution_for_lease_v1(p_job,p_capability,p_lease);
 b:=private.account_execution_duration_v1(j);
 select * into strict m from private.execution_manifests where organization_id=j.organization_id and execution_id=j.execution_id;
 t:=clock_timestamp();
 if j.lease_expires_at<=t then raise exception 'execution_lease_denied' using errcode='42501';end if;
 update public.processing_jobs set lease_expires_at=t+interval '60 seconds' where id=j.id returning * into j;
 remaining:=greatest(0,least((m.payload#>>'{budget,maxDurationMs}')::bigint-b.active_duration_ms,
 floor(extract(epoch from ((m.payload#>>'{budget,expiresAt}')::timestamptz-t))*1000)::bigint));
 return jsonb_build_object('allowed',true,'jobId',j.id,'leaseId',j.lease_id,'executionId',j.execution_id,
 'organizationId',j.organization_id,'workId',j.work_id,'principalId',m.payload->>'principalId','processingRunId',j.processing_run_id,
 'contractFingerprint',m.payload_fingerprint,'leaseExpiresAt',j.lease_expires_at,
 'elapsedDurationMs',b.active_duration_ms,'remainingDurationMs',remaining);
end $$;

-- The API owns the single logical operation identity and request fingerprint.
create function private.worker_reserve_execution_v1(p_job uuid,p_capability text,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;m private.execution_manifests;begin
 j:=private.execution_for_lease_v1(p_job,p_capability,p_lease);
 select * into strict m from private.execution_manifests where organization_id=j.organization_id and execution_id=j.execution_id;
 return private.reserve_execution_operation_v1(p_job,p_capability,p_lease,j.execution_id,m.payload_fingerprint,
 m.payload#>>'{method,executor,key}',m.payload#>>'{method,executor,version}','read_only',0,0);
end $$;
create function private.worker_settle_execution_v1(p_job uuid,p_capability text,p_lease uuid,p_result_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs;m private.execution_manifests;begin
 j:=private.execution_for_lease_v1(p_job,p_capability,p_lease);
 select * into strict m from private.execution_manifests where organization_id=j.organization_id and execution_id=j.execution_id;
 return private.settle_execution_operation_v1(p_job,p_capability,p_lease,j.execution_id,m.payload_fingerprint,p_result_hash,0,0);
end $$;
create function private.worker_commit_execution_v1(p_job uuid,p_capability text,p_lease uuid,p_contract_hash text,p_input_hash text,p_result_text text,p_outcome text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_reason not in ('calculated','invalid_input','budget_exhausted','operation_uncertain','calculation_failed')
 or p_reason is null or (p_outcome='succeeded' and p_reason<>'calculated')
 then raise exception 'execution_result_invalid' using errcode='22023';end if;
 return private.commit_work_execution_result_v1(p_job,p_capability,p_lease,p_contract_hash,p_input_hash,p_result_text,p_outcome,p_reason);
end $$;

create function public.worker_claim_execution_v1(p_worker_token text,p_manifest_hashes text[]) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_claim_execution_v1(p_worker_token,p_manifest_hashes);$$;
create function public.worker_renew_execution_v1(p_job uuid,p_capability text,p_lease uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_renew_execution_v1(p_job,p_capability,p_lease);$$;
create function public.worker_reserve_execution_v1(p_job uuid,p_capability text,p_lease uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_reserve_execution_v1(p_job,p_capability,p_lease);$$;
create function public.worker_settle_execution_v1(p_job uuid,p_capability text,p_lease uuid,p_result_hash text) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_settle_execution_v1(p_job,p_capability,p_lease,p_result_hash);$$;
create function public.worker_commit_execution_v1(p_job uuid,p_capability text,p_lease uuid,p_contract_hash text,p_input_hash text,p_result_text text,p_outcome text,p_reason text) returns jsonb
language sql security invoker set search_path='' as $$select private.worker_commit_execution_v1(p_job,p_capability,p_lease,p_contract_hash,p_input_hash,p_result_text,p_outcome,p_reason);$$;

do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.proname in ('worker_claim_execution_v1','worker_renew_execution_v1','worker_reserve_execution_v1','worker_settle_execution_v1','worker_commit_execution_v1')
 loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;

do $$declare body text;begin
 select pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure) into body;
 if position('pinned-execution-consumer.v1' in body)>0 then raise exception 'execution_capability_already_registered';end if;
 if position('domain-event-outbox.v1' in body)=0 then raise exception 'runtime_capability_anchor_missing';end if;
 body:=replace(body,'domain-event-outbox.v1','domain-event-outbox.v1","pinned-execution-consumer.v1');
 execute body;
end $$;
