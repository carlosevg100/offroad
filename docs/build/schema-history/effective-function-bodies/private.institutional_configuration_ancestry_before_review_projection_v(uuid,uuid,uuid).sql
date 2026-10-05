CREATE OR REPLACE FUNCTION private.institutional_configuration_ancestry_before_review_projection_v(p_org uuid, p_work uuid, p_configuration uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare current_id uuid:=p_configuration;visited uuid[]:='{}';nodes jsonb:='[]';pins jsonb:='[]';proof jsonb;
 c private.institutional_model_configurations;parent private.institutional_model_configurations;source_config private.institutional_model_configurations;r private.institutional_artifact_import_receipts;
 imp public.artifact_import_candidates;rights private.source_rights_versions;v public.source_versions;config jsonb;change jsonb;pos integer;depth integer;
begin
 for depth in 1..128 loop
 if current_id=any(visited)then return jsonb_build_object('state','unresolved','reason','artifact_import_cycle');end if;visited:=array_append(visited,current_id);
 select*into c from private.institutional_model_configurations where organization_id=p_org and id=current_id;
 if c.id is null or c.capital_project_id is distinct from p_work then return private.institutional_configuration_ancestry_before_artifact_import_v1(p_org,p_work,current_id);end if;
 select*into r from private.institutional_artifact_import_receipts where organization_id=p_org and configuration_id=c.id;
 if r.id is null then
 proof:=private.institutional_configuration_ancestry_before_artifact_import_v1(p_org,p_work,c.id);
 if proof->>'state'is distinct from'captured_lineage'then return proof;end if;
 return jsonb_build_object('state','captured_lineage','authorization','not_evaluated','organizationId',p_org,'workId',p_work,'configurationId',p_configuration,
 'nodes',nodes||(proof->'nodes'),'sources',(select coalesce(jsonb_agg(value order by value->>'sourceVersionId',value->>'rightsVersionId'),'[]')from(select distinct value from jsonb_array_elements(pins||(proof->'sources')))u));end if;
 select*into imp from public.artifact_import_candidates where organization_id=p_org and id=r.import_candidate_id;
 select*into parent from private.institutional_model_configurations where organization_id=p_org and id=r.parent_configuration_id;
 select*into source_config from private.institutional_model_configurations where organization_id=p_org and capital_project_id=p_work and id=r.source_configuration_id;
 if source_config.id is null or source_config.configuration_fingerprint is distinct from private.institutional_config_hash(source_config.configuration)or(source_config.id<>parent.id and not r.rebase_declared)then return jsonb_build_object('state','unresolved','reason','artifact_import_rebase_unproven');end if;
 select*into rights from private.source_rights_versions where organization_id=p_org and id=r.rights_version_id and source_version_id=r.source_version_id;
 select*into v from public.source_versions where organization_id=p_org and id=r.source_version_id;
 if (r.work_id,imp.work_id,imp.source_version_id,imp.submitted_by,r.candidate_fingerprint,r.parent_fingerprint)
 is distinct from(p_work,p_work,r.source_version_id,r.author_id,c.configuration_fingerprint,c.parent_fingerprint)
 or c.configuration_fingerprint is distinct from private.institutional_config_hash(c.configuration)
 or parent.configuration_fingerprint is distinct from r.parent_fingerprint
 or parent.configuration_fingerprint is distinct from private.institutional_config_hash(parent.configuration)
 or c.answer_evidence is distinct from jsonb_build_object('kind','imported_workbook_proposal','importCandidateId',imp.id,'uploadFingerprint',imp.upload_sha256,'changes',r.changes,'sourceConfigurationId',source_config.id,'rebaseDeclared',r.rebase_declared)
 or rights.id is null or not exists(select 1 from private.source_version_verifications where organization_id=p_org and source_version_id=v.id and observed_sha256=v.declared_sha256 and observed_byte_size=v.byte_size)
 then return jsonb_build_object('state','unresolved','reason','artifact_import_receipt_mismatch');end if;
 config:=source_config.configuration;
 if source_config.id<>parent.id then
 proof:=private.institutional_configuration_ancestry_v1(p_org,p_work,source_config.id);
 if proof->>'state'is distinct from'captured_lineage'or not private.institutional_configuration_review_effective_v1(p_org,source_config.id)then return jsonb_build_object('state','unresolved','reason','artifact_import_rebase_source_denied');end if;
 pins:=pins||(proof->'sources');nodes:=nodes||(proof->'nodes');end if;
 for change in select value from jsonb_array_elements(r.changes)loop
 select ord-1 into pos from jsonb_array_elements(config#>'{assumptionBook,assumptions}')with ordinality a(value,ord)where value->>'id'=change->>'assumptionId';
 if pos is null or config#>>array['assumptionBook','assumptions',pos::text,'values',change->>'period']is distinct from change->>'approved'then return jsonb_build_object('state','unresolved','reason','artifact_import_assumption_mismatch');end if;
 config:=jsonb_set(config,array['assumptionBook','assumptions',pos::text],(config#>array['assumptionBook','assumptions',pos::text])||jsonb_build_object('values',(config#>array['assumptionBook','assumptions',pos::text,'values'])||jsonb_build_object(change->>'period',change->>'proposed'),
 'sourceType','offroad_scenario','evidence','[]'::jsonb,'confidence','low','rationale','Human contribution imported from an exported workbook.','methodology','artifact-import:'||imp.id::text));end loop;
 if config is distinct from c.configuration then return jsonb_build_object('state','unresolved','reason','artifact_import_application_mismatch');end if;
 nodes:=nodes||jsonb_build_array(jsonb_build_object('kind','artifact_import','configurationId',c.id,'configurationFingerprint',c.configuration_fingerprint,'importCandidateId',imp.id,'receiptId',r.id));
 pins:=pins||jsonb_build_array(jsonb_build_object('sourceVersionId',v.id,'rightsVersionId',rights.id,'declaredSha256',v.declared_sha256));
 current_id:=parent.id;
 end loop;
 return jsonb_build_object('state','unresolved','reason','artifact_import_ancestry_bound');
end;$function$
