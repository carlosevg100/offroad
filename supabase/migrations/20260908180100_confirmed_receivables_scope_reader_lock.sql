-- Fence checks and legacy reads share the confirmation lock, including planning jobs.
create or replace function private.require_receivables_scope_aware_reader(p_job_id uuid,p_capability_token text)
returns void language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
begin
 perform 1 from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id for update;
 if exists(select 1 from private.receivables_evidence_scopes where organization_id=j.organization_id and intake_session_id=j.intake_session_id) then
  raise exception 'confirmed_receivables_scope_reader_required' using errcode='55000';
 end if;
end;
$$;
