-- The worker announces every compiled executor it carries. Lote 3 brings the list to 12, above the
-- previous bound of 8, which refused every claim. The bound stays explicit; only its size changes.
set local lock_timeout='5s';

create or replace function private.worker_claim_execution_v1(p_worker_token text,p_manifest_hashes text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare worker uuid;c record;r jsonb;previous_timeout text:=current_setting('lock_timeout');begin
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'worker_account_binding_required' using errcode='42501';end if;
 worker:=private.worker_identity(p_worker_token);
 if not exists(select 1 from private.worker_tokens t join auth.users u on u.id=t.execution_account_user_id
 where t.id=worker and t.execution_account_user_id=auth.uid() and t.status='active' and t.revoked_at is null
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()))
 then raise exception 'worker_account_binding_required' using errcode='42501';end if;
 if p_manifest_hashes is null or cardinality(p_manifest_hashes) not between 1 and 64
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