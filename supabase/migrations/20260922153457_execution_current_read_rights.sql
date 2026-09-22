-- Current read permission must survive independently of process/store/derive.
-- Revalidate through the existing source closure for direct and adopted inputs.
set search_path='';
do $$ declare prior text; revised text; target text; needle text; replacement text; begin
 for target,needle,replacement in values
 ('private.execution_inputs_current_v1(uuid,uuid,uuid)',
 'private.source_use_allowed_v1(p_org,b.source_version_id,p_subject,''process'',''analysis'')',
 'private.source_use_allowed_v1(p_org,b.source_version_id,p_subject,''read'',''analysis'') and private.source_use_allowed_v1(p_org,b.source_version_id,p_subject,''process'',''analysis'')'),
 ('private.execution_basis_current_v1(uuid,uuid,uuid)',
 'private.source_use_allowed_v1(p_org,x.id,p_subject,''process'',''analysis'')',
 'private.source_use_allowed_v1(p_org,x.id,p_subject,''read'',''analysis'') and private.source_use_allowed_v1(p_org,x.id,p_subject,''process'',''analysis'')')
 loop
  select pg_get_functiondef(target::regprocedure) into prior;
  revised:=replace(prior,needle,replacement);
  if revised=prior then raise exception 'execution_read_rights_contract_changed: %',target;end if;
  execute revised;
 end loop;
end $$;
