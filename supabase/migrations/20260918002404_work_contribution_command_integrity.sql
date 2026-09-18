-- Retry is one human disclosure, including after a browser reload supplies a new request UUID.
set search_path='';
create unique index contribution_single_promotion_idx on public.contribution_revisions(organization_id,promoted_from_revision_id) where promoted_from_revision_id is not null;
do $$ declare body text; begin
 select pg_get_functiondef('private.promote_contribution_to_work_v1(uuid,uuid,uuid)'::regprocedure) into body;
 if position('select * into existing from public.contribution_revisions where id=p_promotion_id;' in body)=0 then raise exception 'contribution_promotion_contract_changed';end if;
 body:=replace(body,'select * into existing from public.contribution_revisions where id=p_promotion_id;',
 'select * into existing from public.contribution_revisions where id=p_promotion_id or (organization_id=r.organization_id and promoted_from_revision_id=r.id) order by (id=p_promotion_id) desc limit 1;');
 body:=replace(body,'perform private.require_resource_access_v1(r.work_id,''work'');',
 E'perform private.require_resource_access_v1(r.work_id,''work'');\n if not exists(select 1 from public.capital_projects where organization_id=r.organization_id and id=r.work_id and status<>''archived'') then raise exception ''work_archived'' using errcode=''55000'';end if;');
 execute body;
 select pg_get_functiondef('private.pin_contribution_sources_v1(uuid,uuid,uuid[],uuid,uuid)'::regprocedure) into body;
 if position('if not private.contribution_sources_allowed_v1' in body)=0 then raise exception 'contribution_lineage_contract_changed';end if;
 body:=replace(body,'if not private.contribution_sources_allowed_v1',E'if (select count(*) from private.contribution_source_dependencies where organization_id=p_org and revision_id=p_revision)>1000 then raise exception ''contribution_lineage_limit'' using errcode=''22023'';end if;\n if not private.contribution_sources_allowed_v1');
 execute body;
end $$;
