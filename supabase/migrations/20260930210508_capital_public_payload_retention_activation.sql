-- Admission enablement follows verified Storage/purge evaluation during rollout.
-- No heartbeat is seeded: the previous worker cannot open this gate. The new worker
-- must be deployed and poll successfully; bucket/rights/deadline guards still apply.
set search_path='';
do $$ begin
 if exists(select 1 from storage.objects o where o.bucket_id='capital-input-capture'
  and ((to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then raise exception 'capture_bucket_history_unsafe'; end if;
 if not private.capital_public_capture_bucket_safe_v1() then raise exception 'capture_bucket_unsafe'; end if;
 if not(public.worker_runtime_schema_contract_v1()->'capabilities'?'capital-public-retention.v1') then raise exception 'capture_retention_contract_missing'; end if;
 update private.capital_public_retention_controls set enabled=true,updated_at=clock_timestamp() where singleton;
 if not found then raise exception 'capture_retention_control_missing'; end if;
end; $$;
