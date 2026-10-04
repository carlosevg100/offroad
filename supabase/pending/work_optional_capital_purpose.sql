-- Forward only: genuine unclassified work may declare an objective without inventing use of proceeds.
-- Exact live staging source observed 2026-10-03. No new session, company, authority or classification.
do $repair$
declare target regprocedure := 'private.record_intake_capital_need_command(uuid,uuid,uuid,text,text,numeric,text,text,integer,integer,text,text,text,text[],text[],text)'::regprocedure;
  definition text; source text;
begin
  select pg_get_functiondef(target),prosrc into definition,source from pg_proc where oid=target;
  if md5(source)<>'134f7a72da756610d3ab11cdc30ce15d' then
    raise exception 'work_optional_capital_purpose_source_changed' using errcode='55000';
  end if;
  if position($old$if p_use_of_proceeds is null or p_use_of_proceeds not in ($old$ in definition)=0 then
    raise exception 'work_optional_capital_purpose_contract_changed' using errcode='55000';
  end if;
  definition:=replace(definition,$old$if p_use_of_proceeds is null or p_use_of_proceeds not in ($old$,$new$if (p_use_of_proceeds is null and not (
    session_row.archetype is null
    and session_row.capital_project_id is not null
    and exists (
      select 1 from public.capital_projects project
      join public.work_contexts context
        on context.organization_id=project.organization_id and context.work_id=project.id
      where project.organization_id=p_organization_id
        and project.id=session_row.capital_project_id and project.status<>'archived'
        and private.can_access_resource_v1(project.organization_id,project.id,'work')
    )
  )) or (p_use_of_proceeds is not null and p_use_of_proceeds not in ($new$);
  definition:=replace(definition,$old$    'equipment_finance', 'venture_debt', 'other'
  ) or p_requested_amount$old$,$new$    'equipment_finance', 'venture_debt', 'other'
  )) or p_requested_amount$new$);
  -- CREATE OR REPLACE retains the exact existing owner, ACL, SECURITY DEFINER and empty search_path.
  execute definition;
end
$repair$;
