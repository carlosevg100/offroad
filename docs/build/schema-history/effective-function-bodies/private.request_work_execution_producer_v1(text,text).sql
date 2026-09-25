CREATE OR REPLACE FUNCTION private.request_work_execution_producer_v1(p_contract_text text, p_snapshot_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb;w public.capital_projects;p private.execution_method_profiles;ex uuid;begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 if p_contract_text is null or octet_length(p_contract_text)>1048576 or p_snapshot_text is null or octet_length(p_snapshot_text)>8388608
 then raise exception 'execution_contract_denied' using errcode='42501';end if;
 c:=private.execution_json_projection_v1(p_contract_text);
 select * into w from public.capital_projects where id=(c->>'workId')::uuid;
 if not found then raise exception 'execution_access_denied' using errcode='42501';end if;
 if not exists(select 1 from private.principals where organization_id=w.organization_id and user_id=auth.uid() and kind='human' and revoked_at is null)
 then raise exception 'execution_access_denied' using errcode='42501';end if;
 if not private.execution_producer_enabled_v1(w.organization_id) then raise exception 'execution_producer_denied' using errcode='42501';end if;
 p:=private.execution_released_profile_v1(c#>>'{method,methodId}');
 if c->'method' is distinct from p.payload->'method' then raise exception 'execution_contract_denied' using errcode='42501';end if;
 begin
  return private.request_work_execution_v1(p.id,p_contract_text,p_snapshot_text);
 exception when unique_violation then
  if sqlerrm<>'execution_request_conflict' then raise;end if;
  -- The same request id already produced an execution of this human: name it, so the caller follows it instead of duplicating.
  select e.id into ex from public.work_executions e join private.principals h on h.organization_id=e.organization_id and h.id=e.principal_id
   where e.organization_id=w.organization_id and h.user_id=auth.uid() and e.request_id=(c->>'requestId')::uuid;
  raise exception 'execution_request_conflict' using errcode='23505',detail=coalesce(ex::text,'');
 end;
exception when data_exception then raise exception 'execution_contract_denied' using errcode='42501';
end $function$
