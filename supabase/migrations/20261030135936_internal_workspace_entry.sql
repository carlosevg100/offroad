-- Internal Offroad workspaces do not have a commercial onboarding journey. Readiness is
-- navigation only: workspace_membership_v1 and the resource policy retain authorization;
-- document rights, terms acceptance and released execution gates are not changed.
-- Preserve the installed policy-aware body and all grants rather than replacing its guards.
do $migration$
declare body text;
begin
 select pg_get_functiondef('private.get_workspace_bootstrap()'::regprocedure) into body;
 if position($old$'workspace_ready', organization_record.organization_type in ('personal','institutional') or progress_record.completed_at is not null$old$ in body)=0 then
  if position($new$'workspace_ready', organization_record.organization_type in ('personal','institutional','offroad') or progress_record.completed_at is not null$new$ in body)>0 then return; end if;
  raise exception 'workspace_readiness_contract_changed';
 end if;
 body:=replace(body,
  $old$'workspace_ready', organization_record.organization_type in ('personal','institutional') or progress_record.completed_at is not null$old$,
  $new$'workspace_ready', organization_record.organization_type in ('personal','institutional','offroad') or progress_record.completed_at is not null$new$);
 execute body;
end;
$migration$;
