-- Bind direct typed-body Storage operations to the actual request's exact job
-- and capability, not merely the persisted allocation and authenticated account.
-- Supabase Storage forwards request.headers via src/http/plugins/db.ts and sets
-- the transaction-local request.headers GUC via internal/database/postgres/scope.ts.
-- Public-source allocation branches and purger exact-path leases are unchanged.
set search_path='';
create function private.capital_body_storage_job_authority_v1(p_allocation uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;headers jsonb;capability text;
begin
 if auth.uid() is null or p_allocation is null then return false;end if;
 begin
 headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 exception when invalid_text_representation then return false;end;
 if jsonb_typeof(headers) is distinct from 'object'
 or jsonb_typeof(headers->'x-offroad-job-id') is distinct from 'string'
 or jsonb_typeof(headers->'x-offroad-capability') is distinct from 'string' then return false;end if;
 select * into allocation from private.capital_public_payload_allocations a where a.id=p_allocation and a.content_kind='typed_body';
 if not found or headers->>'x-offroad-job-id' is distinct from allocation.job_id::text
 or (headers?'x-offroad-workspace' and headers->>'x-offroad-workspace' is distinct from allocation.organization_id::text) then return false;end if;
 capability:=headers->>'x-offroad-capability';
 if length(capability) not between 1 and 4096 or extensions.digest(capability,'sha256') is distinct from allocation.capability_sha256 then return false;end if;
 return private.capital_public_allocation_job_current_v1(allocation.id)
 and private.capital_public_capture_clock_current_v1(allocation.job_id,capability);
end; $$;
revoke all on function private.capital_body_storage_job_authority_v1(uuid) from public,anon,authenticated,service_role;

create or replace function private.capital_body_storage_allowed_v1(p_allocation uuid,p_mode text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;human uuid;deadline timestamptz;margin integer;
begin
 if auth.uid() is null or p_mode not in ('read','upload') or not private.capital_body_storage_job_authority_v1(p_allocation) or not private.capital_public_capture_bucket_safe_v1() then return false;end if;
 select * into allocation from private.capital_public_payload_allocations where id=p_allocation and content_kind='typed_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id) then return false;end if;
 if exists(select 1 from storage.objects o where o.bucket_id=allocation.bucket_id and o.name=allocation.object_path
 and ((to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false;end if;
 if p_mode='upload' and (allocation.upload_expires_at<=clock_timestamp()
 or exists(select 1 from private.capital_public_retained_payloads where organization_id=allocation.organization_id and allocation_id=allocation.id)) then return false;end if;
 if p_mode='read' and not storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info']) then return false;end if;
 select authorization_subject_id into human from public.processing_jobs where organization_id=allocation.organization_id and id=allocation.job_id;
 if not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=allocation.organization_id and allocation_id=allocation.id and status='pending') then return false;end if;
 deadline:=private.capital_body_allocation_deadline_v1(allocation.organization_id,allocation.id,human);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 return deadline is not null and least(allocation.purge_at,deadline-make_interval(secs=>margin))>clock_timestamp()
 and private.capital_body_retention_healthy_v1(allocation.policy_id,allocation.organization_id,allocation.id)
 and private.capital_body_storage_job_authority_v1(allocation.id);
end; $$;
