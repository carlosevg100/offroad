-- Continue receiving documents in the same authorized private work while its first
-- batch is processing or awaiting review. Do not reopen confirmed/cancelled intake,
-- change the session state, alter grants, or replace any immutable source bytes.
do $work_document_upload$
declare
  body text;
  old_text constant text := $old$  if session_row.status not in ('collecting', 'failed') then
    raise exception 'intake_session_not_collecting' using errcode = '55000';
  end if;$old$;
  new_text constant text := $new$  if session_row.status not in ('collecting', 'failed') and not (
    session_row.status in ('processing', 'review_ready')
    and session_row.capital_project_id is not null
    and exists (
      select 1 from public.capital_projects p
      where p.organization_id = p_organization_id
        and p.id = session_row.capital_project_id
        and p.status <> 'archived'
        and p.private_access_granted_at is not null
        and private.can_access_resource_v1(p.organization_id, p.id, 'work')
    )
  ) then
    raise exception 'intake_session_not_collecting' using errcode = '55000';
  end if;$new$;
begin
  select pg_get_functiondef('private.register_source_version_v1(uuid,uuid,uuid,uuid,text,text,text,text,bigint,text,uuid)'::regprocedure) into body;
  if strpos(body,new_text)>0 and strpos(body,old_text)=0 then return; end if;
  if (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1 then
    raise exception 'work_document_upload_contract_changed';
  end if;
  execute replace(body,old_text,new_text);
end $work_document_upload$;
