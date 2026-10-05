-- Stage21 corrective: preserve the established read-only ancestry scope classification.
-- The import handler operates only on a configuration proven to belong to the requested work.
-- No authority decision, receipt, source pin or migration history is changed.
set search_path='';
do $$declare definition text;needle text;replacement text;begin
 definition:=pg_get_functiondef('private.institutional_configuration_ancestry_before_review_projection_v(uuid,uuid,uuid)'::regprocedure);
 needle:=E' select*into c from private.institutional_model_configurations where organization_id=p_org and capital_project_id=p_work and id=current_id;\n if c.id is null then return jsonb_build_object(''state'',''unresolved'',''reason'',''artifact_import_configuration_missing'');end if;';
 replacement:=E' select*into c from private.institutional_model_configurations where organization_id=p_org and id=current_id;\n if c.id is null or c.capital_project_id is distinct from p_work then return private.institutional_configuration_ancestry_before_artifact_import_v1(p_org,p_work,current_id);end if;';
 if position(needle in definition)=0 or length(definition)-length(replace(definition,needle,''))<>length(needle)
 then raise exception 'artifact_import_ancestry_scope_definition_drift';end if;
 execute replace(definition,needle,replacement);
end;$$;
revoke all on function private.institutional_configuration_ancestry_before_review_projection_v(uuid,uuid,uuid)from public,anon,authenticated,service_role;
