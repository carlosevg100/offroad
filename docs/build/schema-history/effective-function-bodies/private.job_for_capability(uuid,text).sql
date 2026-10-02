CREATE OR REPLACE FUNCTION private.job_for_capability(p_job_id uuid, p_capability_token text)
 RETURNS processing_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job_row public.processing_jobs;
begin
  if p_capability_token is null or char_length(p_capability_token)<32 then
    raise exception 'job_capability_invalid' using errcode='42501';
  end if;
  select * into job_row from public.processing_jobs where id=p_job_id and kind not in ('work_execution','governed_evaluation') and status='leased'
    and capability_sha256=extensions.digest(p_capability_token,'sha256') and lease_expires_at>now() for update;
  if not found then raise exception 'job_capability_invalid' using errcode='42501'; end if;
  if auth.uid() is null or job_row.leased_account_user_id is distinct from auth.uid() or not exists(select 1 from private.worker_tokens wt where wt.id=job_row.leased_by and wt.revoked_at is null) or not exists(select 1 from auth.users wu where wu.id=auth.uid() and wu.deleted_at is null and (wu.banned_until is null or wu.banned_until<=now())) then raise exception 'job_capability_invalid' using errcode='42501'; end if; if not private.lock_job_authority_v1(job_row.id) then raise exception 'job_authorization_revoked' using errcode='42501'; end if;
  if private.requires_execution_brief_approval(job_row.id) then
    perform 1 from public.document_intake_sessions where organization_id=job_row.organization_id and id=job_row.intake_session_id for update;
    perform 1 from public.capital_projects p join public.document_intake_sessions s
      on s.organization_id=p.organization_id and s.capital_project_id=p.id
      where s.organization_id=job_row.organization_id and s.id=job_row.intake_session_id for update of p;
    if not private.execution_dispatch_is_current(job_row.id,true) then
      raise exception 'execution_brief_approval_required' using errcode='42501';
    end if;
  end if;
  return job_row;
end;
$function$
