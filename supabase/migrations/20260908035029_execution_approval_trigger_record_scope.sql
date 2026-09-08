-- Trigger records differ by relation; enter the relation branch before resolving its fields.
create or replace function private.lock_execution_approval_context()
returns trigger language plpgsql security definer set search_path='' as $$
declare project_id uuid; session_id uuid;
begin
  if tg_op='DELETE' then
    if tg_table_name='agent_messages' then
      if old.role<>'user' then return old; end if;
    end if;
    session_id:=old.intake_session_id;
    select capital_project_id into project_id from public.document_intake_sessions where organization_id=old.organization_id and id=session_id;
    perform 1 from public.document_intake_sessions where organization_id=old.organization_id and id=session_id for update;
    perform 1 from public.capital_projects where organization_id=old.organization_id and id=project_id for update;
    return old;
  end if;
  if tg_table_name='agent_messages' then
    if new.role<>'user' then return new; end if;
  end if;
  if tg_table_name in ('capital_project_execution_briefs','capital_project_execution_brief_events') then
    project_id:=new.capital_project_id;
    select id into session_id from public.document_intake_sessions
      where organization_id=new.organization_id and capital_project_id=project_id order by created_at limit 1;
  elsif tg_table_name='document_intake_sessions' then
    if old.capital_project_id is not null and new.capital_project_id is distinct from old.capital_project_id then
      raise exception 'advisor_session_project_immutable' using errcode='42501';
    end if;
    session_id:=new.id; project_id:=new.capital_project_id;
  else
    session_id:=new.intake_session_id;
    select capital_project_id into project_id from public.document_intake_sessions where organization_id=new.organization_id and id=session_id;
  end if;
  if project_id is not null then
    perform 1 from public.document_intake_sessions where organization_id=new.organization_id and id=session_id for update;
    perform 1 from public.capital_projects where organization_id=new.organization_id and id=project_id for update;
  end if;
  if tg_table_name='capital_project_execution_briefs' then
    new.approval_input_fingerprint:=private.execution_approval_input_fingerprint(new.organization_id,session_id);
  end if;
  return new;
end;
$$;
revoke all on function private.lock_execution_approval_context() from public,anon,authenticated;
