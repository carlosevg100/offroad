-- Forward-only correction after the frozen native preview deployment.
-- No allocation, job, receipt, role, policy or historical function is rewritten.
create function private.capital_preview_storage_job_authority_v1(p_allocation uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;headers jsonb;capability text;
begin
 if auth.uid() is null or p_allocation is null then return false;end if;
 begin headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 exception when invalid_text_representation then return false;end;
 if jsonb_typeof(headers) is distinct from 'object'
 or jsonb_typeof(headers->'x-offroad-job-id') is distinct from 'string'
 or jsonb_typeof(headers->'x-offroad-capability') is distinct from 'string' then return false;end if;
 select * into allocation from private.capital_public_payload_allocations a where a.id=p_allocation and a.content_kind='preview_body';
 if not found or allocation.worker_account_id is distinct from auth.uid()
 or headers->>'x-offroad-job-id' is distinct from allocation.job_id::text
 or (headers?'x-offroad-workspace' and headers->>'x-offroad-workspace' is distinct from allocation.organization_id::text) then return false;end if;
 capability:=headers->>'x-offroad-capability';
 if length(capability) not between 1 and 4096 or extensions.digest(capability,'sha256') is distinct from allocation.capability_sha256 then return false;end if;
 return private.capital_public_allocation_job_current_v1(allocation.id)
 and private.capital_public_capture_clock_current_v1(allocation.job_id,capability);
end;$$;
revoke all on function private.capital_preview_storage_job_authority_v1(uuid) from public,anon,authenticated,service_role;
do $patch$declare target_oid regprocedure:='private.capital_preview_storage_allowed_v1(uuid,text)'::regprocedure;definition text;begin
 if (select md5(prosrc) from pg_proc where pg_proc.oid=target_oid) is distinct from '73af39811c038c9d323ec8d212273f0e' then raise exception 'capital_preview_storage_authority_source_drift'using errcode='55000';end if;
 definition:=pg_get_functiondef(target_oid);
 if (length(definition)-length(replace(definition,'private.capital_body_storage_job_authority_v1(p_allocation)','')))/length('private.capital_body_storage_job_authority_v1(p_allocation)')<>1 then raise exception 'capital_preview_storage_authority_source_drift'using errcode='55000';end if;
 execute replace(definition,'private.capital_body_storage_job_authority_v1(p_allocation)','private.capital_preview_storage_job_authority_v1(p_allocation)');
end;$patch$;
revoke all on function private.capital_preview_storage_allowed_v1(uuid,text) from public,anon,authenticated,service_role;
