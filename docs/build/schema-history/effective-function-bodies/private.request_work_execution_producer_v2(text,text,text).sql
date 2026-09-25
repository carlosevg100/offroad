CREATE OR REPLACE FUNCTION private.request_work_execution_producer_v2(p_contract_text text, p_snapshot_text text, p_gates_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g jsonb;c jsonb;target_work uuid;target_version uuid;versions text[];basis jsonb;r jsonb;ex uuid;org uuid;fp text;prior private.execution_gate_receipts;begin
 if auth.uid() is null then raise exception 'execution_subject_required' using errcode='42501';end if;
 g:=private.execution_gates_projection_v1(p_gates_text);
 if (g->>'blocked')::boolean then raise exception 'execution_gates_blocked' using errcode='42501';end if;
 if p_contract_text is null or octet_length(p_contract_text)>1048576 or p_snapshot_text is null or octet_length(p_snapshot_text)>8388608
 then raise exception 'execution_contract_denied' using errcode='42501';end if;
 begin
  c:=private.execution_json_projection_v1(p_contract_text);
  if jsonb_typeof(c#>'{inputs,adoptions}') is distinct from 'array' or jsonb_typeof(c#>'{inputs,hypotheses}') is distinct from 'array'
  then raise exception 'execution_contract_denied' using errcode='42501';end if;
  target_work:=(c->>'workId')::uuid;
  select array_agg(distinct x.value->>'assumptionVersionId') into versions
   from jsonb_array_elements((c#>'{inputs,adoptions}')||(c#>'{inputs,hypotheses}')) x;
  -- Gates are evaluated over one basis version: the contract must pin exactly one.
  if coalesce(cardinality(versions),0)=1 and versions[1] is not null then target_version:=versions[1]::uuid;end if;
 exception when data_exception then raise exception 'execution_contract_denied' using errcode='42501';
 end;
 if c#>>'{method,methodId}' is distinct from g#>>'{methodSelection,methodId}'
 or c#>>'{method,methodVersion}' is distinct from g#>>'{methodSelection,methodVersion}'
 or target_version is null then raise exception 'execution_gates_mismatch' using errcode='42501';end if;
 basis:=private.execution_contract_basis_v2(target_work,target_version,c#>>'{method,methodId}');
 if basis#>>'{company,registration}' is distinct from g->>'companyRegistration' then raise exception 'execution_gates_mismatch' using errcode='42501';end if;
 r:=private.request_work_execution_producer_v1(p_contract_text,p_snapshot_text);
 ex:=(r->>'executionId')::uuid;
 select organization_id into strict org from public.capital_projects where id=target_work;
 fp:=encode(extensions.digest(convert_to(p_gates_text,'UTF8'),'sha256'),'hex');
 if coalesce((r->>'replayed')::boolean,false) then
  -- A replay names the same execution only with the same gates. Other gates under the same
  -- request, or gates for an execution requested without them, are the conflicting retry v1
  -- reports, and no receipt is written.
  select * into prior from private.execution_gate_receipts where organization_id=org and execution_id=ex;
  if not found or prior.gates_fingerprint<>fp then raise exception 'execution_request_conflict' using errcode='23505',detail=ex::text;end if;
 else
  insert into private.execution_gate_receipts(organization_id,execution_id,gates_version,canonical_gates,gates_fingerprint,blocked)
  values(org,ex,g->>'gatesVersion',p_gates_text,fp,(g->>'blocked')::boolean);
 end if;
 return r||jsonb_build_object('gatesFingerprint',fp);
end $function$
