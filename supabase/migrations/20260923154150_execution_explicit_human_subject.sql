-- Stage 17: explicit human subject inside the closed execution core.
-- No new caller, grant, R01 execution enablement or JWT impersonation.
set search_path='';

-- Preserve the already-reviewed common request, with the subject made explicit.
-- The human entry point continues to derive that subject from its authenticated session.
do $patch$
declare original text; revised text; needle text;
begin
 original:=pg_get_functiondef('private.request_work_execution_v1(uuid,text,text)'::regprocedure);
 needle:='private.request_work_execution_v1(p_profile_id uuid, p_contract_text text, p_snapshot_text text)';
 if position(needle in original)=0 or position('auth.uid()' in original)=0 then
  raise exception 'execution_subject_request_contract_changed';
 end if;
 revised:=replace(original,needle,'private.request_work_execution_as_subject_v1(p_subject uuid, p_profile_id uuid, p_contract_text text, p_snapshot_text text)');
 revised:=replace(revised,'auth.uid()','p_subject');
 needle:=' if p_subject is null then raise exception ''execution_subject_required'' using errcode=''42501'';end if;';
 if position(needle in revised)=0 then raise exception 'execution_subject_guard_contract_changed';end if;
 revised:=replace(revised,needle,needle||E'\n perform 1 from auth.users where id=p_subject and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;\n if not found then raise exception ''execution_access_denied'' using errcode=''42501'';end if;');
 execute revised;
end $patch$;
revoke all on function private.request_work_execution_as_subject_v1(uuid,uuid,text,text) from public,anon,authenticated,service_role;

create or replace function private.request_work_execution_v1(p_profile_id uuid,p_contract_text text,p_snapshot_text text)
returns jsonb language sql volatile security definer set search_path='' as $$
 select private.request_work_execution_as_subject_v1(auth.uid(),p_profile_id,p_contract_text,p_snapshot_text);
$$;
revoke all on function private.request_work_execution_v1(uuid,text,text) from public,anon,authenticated,service_role;

-- A new execution's principal is the already-persisted human of its manifest/run.
-- The worker's authenticated account is not silently substituted for that human.
-- This branch is limited to the closed work_execution kind; legacy derivation is retained.
do $patch$
declare original text; revised text; needle text;
begin
 original:=pg_get_functiondef('private.bind_job_authority_v1()'::regprocedure);
 needle:=' if new.kind=''agent_operation_brief'' and';
 if position(needle in original)=0 then raise exception 'execution_subject_binding_contract_changed';end if;
 revised:=replace(original,needle,$body$
 if new.kind='work_execution' then
  select p.user_id into subject_id from public.work_executions e
  join private.principals p on p.organization_id=e.organization_id and p.id=e.principal_id and p.kind='human' and p.revoked_at is null
  join public.processing_runs r on r.organization_id=e.organization_id and r.id=e.processing_run_id and r.created_by=p.user_id
  join private.execution_manifests m on m.organization_id=e.organization_id and m.execution_id=e.id
  where e.organization_id=new.organization_id and e.id=new.execution_id and e.work_id=new.work_id and e.processing_run_id=new.processing_run_id
  and r.work_id=e.work_id and r.pipeline_version='pinned-work-execution-v1'
  and m.payload->>'principalId'=p.id::text and m.payload->>'workId'=e.work_id::text;
  if subject_id is null then raise exception 'job_authorization_denied' using errcode='42501';end if;
 elsif new.kind='agent_operation_brief' and$body$);
 execute revised;
end $patch$;
