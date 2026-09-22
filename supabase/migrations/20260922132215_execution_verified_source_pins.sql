-- A caller's declared upload hash is not verification of retained bytes.
-- This guard is closed with the execution commands; no client release accompanies it.
set search_path='';
create function private.execution_source_bytes_verified_v1(p_org uuid,p_version uuid,p_hash text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_hash ~ '^[a-f0-9]{64}$'
 and exists(select 1 from private.source_version_verifications r where r.organization_id=p_org and r.source_version_id=p_version and r.observed_sha256=p_hash)
 and not exists(select 1 from private.source_version_verifications r where r.organization_id=p_org and r.source_version_id=p_version and r.observed_sha256<>p_hash);
$$;
revoke all on function private.execution_source_bytes_verified_v1(uuid,uuid,text) from public,anon,authenticated,service_role;
do $$ declare old text;body text;begin
 select pg_get_functiondef('private.request_work_execution_v1(uuid,text,text)'::regprocedure) into old;
 body:=replace(old,'and v.declared_sha256=item->>''contentHash''','and private.execution_source_bytes_verified_v1(w.organization_id,v.id,item->>''contentHash'')');
 if body=old then raise exception 'execution_source_pin_contract_changed';end if;execute body;
 select pg_get_functiondef('private.execution_inputs_current_v1(uuid,uuid,uuid)'::regprocedure) into old;
 body:=replace(old,'r.operations @> array[''read'',''process'',''store'',''derive'']',
 'private.execution_source_bytes_verified_v1(p_org,b.source_version_id,b.content_hash) and r.operations @> array[''read'',''process'',''store'',''derive'']');
 if body=old then raise exception 'execution_source_revalidation_contract_changed';end if;execute body;
end $$;
