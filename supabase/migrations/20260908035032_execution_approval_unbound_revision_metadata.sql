-- Complete revision provenance before an immutable approval binding exists.
create or replace function private.guard_execution_approval_queue()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and private.requires_execution_brief_approval(old.id) then
    if (new.organization_id,new.intake_session_id,new.processing_run_id,new.kind)
      is distinct from (old.organization_id,old.intake_session_id,old.processing_run_id,old.kind) then
      raise exception 'approved_dispatch_identity_immutable' using errcode='42501';
    end if;
    if new.payload is distinct from old.payload then
      -- The existing revision command fills these two provenance fields after enqueue,
      -- in the same transaction. Routing, inputs and all bound payloads remain immutable.
      if old.status<>'awaiting_approval' or new.status<>'awaiting_approval'
        or exists(select 1 from public.capital_project_execution_brief_dispatches d where d.processing_job_id=old.id)
        or (new.payload-array['message_id','trigger_event']) is distinct from (old.payload-array['message_id','trigger_event']) then
        raise exception 'approved_dispatch_identity_immutable' using errcode='42501';
      end if;
    end if;
  end if;
  if new.kind not in ('capital_project_analysis','case_analysis') then return new; end if;
  if not exists(select 1 from public.document_intake_sessions s where s.organization_id=new.organization_id and s.id=new.intake_session_id and s.capital_project_id is not null) then return new; end if;
  if tg_op='INSERT' then
    if new.status in ('queued','leased') then new.status:='awaiting_approval'; end if;
  elsif new.status in ('queued','leased','succeeded') then
    if not private.execution_dispatch_is_current(new.id,true) then
      raise exception 'execution_brief_approval_required' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_execution_approval_queue() from public,anon,authenticated;
