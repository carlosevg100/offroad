-- Close privileged organization-profile writes that bypass table RLS.
-- Client-company edits in originator workspaces keep their existing scope.
do $patch$
declare
  target text;
  definition text;
  anchor text := '  if normalized_name is null or char_length(normalized_name) < 2 then';
  guard text;
begin
  foreach target in array array['private.save_guided_company_profile','private.save_project_company_profile'] loop
    definition := pg_get_functiondef((target||'(uuid,text,text,text,text,bytea,text)')::regprocedure);
    if position(anchor in definition)=0 then raise exception 'Organization profile authority anchor drift: %',target; end if;
    guard := case when target='private.save_project_company_profile' then
      '  if session_row.journey = ''company'' and not private.can_manage_organization(session_row.organization_id) then'
    else '  if not private.can_manage_organization(session_row.organization_id) then' end;
    execute replace(definition,anchor,guard||E'\n    raise exception ''organization_management_required'' using errcode = ''42501'';\n  end if;\n\n'||anchor);
  end loop;
end $patch$;
