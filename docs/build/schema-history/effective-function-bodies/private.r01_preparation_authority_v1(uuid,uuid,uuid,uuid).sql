CREATE OR REPLACE FUNCTION private.r01_preparation_authority_v1(p_org uuid, p_work uuid, p_session uuid, p_subject uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare metadata jsonb; ctx jsonb; ds text; src jsonb; f private.receivables_evidence_fragments; rights private.source_rights_versions; source_binding uuid; rights_closure jsonb;
 evidence jsonb:='[]'::jsonb; pins jsonb:='[]'::jsonb; history jsonb:='[]'::jsonb; responses jsonb:='[]'::jsonb; resolved jsonb:='[]'::jsonb;
 current_draft jsonb; d record; n integer:=0; patch_ids text[]:='{}'; ref jsonb; target record; answer jsonb; adoption_pins jsonb:='[]'::jsonb;
 seen_messages text[]:='{}'; total_bytes bigint:=0;
begin
 metadata:=private.r01_preparation_metadata_v2(p_org,p_work,p_session,p_subject);
 if p_subject is null or not exists(select 1 from private.principals where organization_id=p_org and user_id=p_subject and kind='human' and revoked_at is null)
 or private.evaluate_resource_policy_v1(p_org,p_work,p_subject,'read','analysis') is not true
 or private.evaluate_resource_policy_v1(p_org,p_work,p_subject,'work','analysis') is not true
 or private.evaluate_resource_policy_v1(p_org,p_session,p_subject,'read','analysis') is not true
 or private.evaluate_resource_policy_v1(p_org,p_session,p_subject,'work','analysis') is not true
 then raise exception 'r01_preparation_access_denied' using errcode='42501';end if;
 perform 1 from public.document_intake_sessions where organization_id=p_org and id=p_session and capital_project_id=p_work for share;
 if not found then raise exception 'r01_preparation_access_denied' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=p_org and id=p_work and status<>'archived' for share;
 if not found then raise exception 'r01_preparation_access_denied' using errcode='42501';end if;
 if private.receivables_analytical_release_enabled(p_org) is not true then raise exception 'r01_preparation_release_denied' using errcode='42501';end if;
 ctx:=private.receivables_evidence_scope_context(p_org,p_session);
 if ctx->>'state' is distinct from 'current' then raise exception 'r01_preparation_scope_stale' using errcode='42501';end if;
 ds:=private.r01_scope_dataset_hash_v1(ctx->'scope');
 -- Discovery verifies the whole manifest before restricting the selected tape/sheets.
 -- Therefore every fragment loaded here requires the same subject's current rights.
 for src in select x from jsonb_array_elements(ctx#>'{sourceManifest,sources}') x order by x->>'sourceDocumentId' collate "C" loop
  select f0.* into f from private.receivables_evidence_fragments f0 join public.source_versions v
  on v.organization_id=f0.organization_id and v.id=f0.source_document_id and v.legacy_document_version=f0.document_version
  where f0.organization_id=p_org and f0.intake_session_id=p_session and v.id=(src->>'sourceDocumentId')::uuid
  and v.legacy_document_version=(src->>'documentVersion')::integer and v.declared_sha256=src->>'sourceSha256'
  and exists(select 1 from jsonb_array_elements(metadata->'sourcePins') pin where pin->>'sourceVersionId'=f0.source_document_id::text
   and pin->>'processingRunId'=f0.processing_run_id::text and pin->>'documentVersion'=f0.document_version::text)
  order by f0.created_at desc,f0.processing_run_id desc limit 1;
  if f.source_document_id is null or f.content_sha256 is distinct from src->>'contentSha256'
  or f.source_sha256 is distinct from src->>'sourceSha256' or f.content_kind is distinct from src->>'contentKind'
  or f.schema_version is distinct from src->>'schemaVersion' or f.codec<>'gzip-json-v1'
  or encode(extensions.digest(f.compressed_payload,'sha256'),'hex')<>f.payload_sha256
  or private.execution_source_bytes_verified_v1(p_org,f.source_document_id,f.source_sha256) is not true
  or not exists(select 1 from public.source_bindings b where b.organization_id=p_org and b.source_version_id=f.source_document_id and b.resource_id=p_session and b.revoked_at is null)
  or private.source_use_allowed_v1(p_org,f.source_document_id,p_subject,'read','analysis') is not true
  or private.source_use_allowed_v1(p_org,f.source_document_id,p_subject,'process','analysis') is not true
  or private.source_use_allowed_v1(p_org,f.source_document_id,p_subject,'store','analysis') is not true
  or private.source_use_allowed_v1(p_org,f.source_document_id,p_subject,'derive','analysis') is not true
  then raise exception 'r01_preparation_source_denied' using errcode='42501';end if;
  total_bytes:=total_bytes+octet_length(f.compressed_payload);
  if total_bytes>67108864 then raise exception 'r01_preparation_size_limit' using errcode='22023';end if;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('source_document_id',f.source_document_id,'document_version',f.document_version,
   'content_kind',f.content_kind,'schema_version',f.schema_version,'source_sha256',f.source_sha256,'content_sha256',f.content_sha256,
   'payload_sha256',f.payload_sha256,'codec',f.codec,'uncompressed_bytes',f.uncompressed_bytes,'payload_base64',replace(encode(f.compressed_payload,'base64'),E'\n','')));

 end loop;
 if jsonb_array_length(evidence)=0 then raise exception 'r01_preparation_source_denied' using errcode='42501';end if;
 for d in select drafts.*,patches.patch,patches.patch_id,patches.patch_fingerprint,
  patches.capital_project_id as patch_work,patches.intake_session_id as patch_session,patches.source_dataset_hash as patch_dataset
  from private.receivables_method_supplement_drafts drafts left join private.receivables_method_supplement_patches patches
  on patches.organization_id=drafts.organization_id and patches.id=drafts.caused_by_patch_id
  where drafts.organization_id=p_org and drafts.intake_session_id=p_session and drafts.source_dataset_hash=ds
  and exists(select 1 from jsonb_array_elements(metadata->'historyPins') pin where pin->>'draftId'=drafts.id::text and pin->>'patchRowId'=patches.id::text)
  order by drafts.revision loop
  n:=n+1;
  if d.revision<>n or d.capital_project_id<>p_work or d.patch_work is distinct from p_work or d.patch_session is distinct from p_session
  or d.patch_dataset is distinct from ds or d.patch_id is null or d.patch_id=any(patch_ids)
  or d.patch->>'sourceDatasetHash' is distinct from ds or d.draft->>'sourceDatasetHash' is distinct from ds
  or d.patch->>'patchId' is distinct from d.patch_id or d.draft->>'revision' is distinct from d.revision::text
  or d.patch_fingerprint is distinct from encode(extensions.digest(convert_to(d.patch::text,'UTF8'),'sha256'),'hex')
  or d.draft_fingerprint is distinct from encode(extensions.digest(convert_to(d.draft::text,'UTF8'),'sha256'),'hex')
  then raise exception 'r01_preparation_history_invalid' using errcode='42501';end if;
  if d.patch->>'schemaVersion' is distinct from '2026.09.07-v1'
  or jsonb_typeof(d.patch->'sections') is distinct from 'object' or jsonb_typeof(d.patch->'fields') is distinct from 'array'
  or jsonb_typeof(d.patch->'evidence') is distinct from 'object' or jsonb_typeof(d.patch#>'{suppliedBy,evidence}') is distinct from 'array'
  then raise exception 'r01_preparation_history_invalid' using errcode='42501';end if;
  if jsonb_array_length(d.patch#>'{suppliedBy,evidence}')=0 then raise exception 'r01_preparation_history_invalid' using errcode='42501';end if;
  patch_ids:=array_append(patch_ids,d.patch_id);
  history:=history||jsonb_build_array(jsonb_build_object('patch',d.patch,'resultingDraft',d.draft));current_draft:=d.draft;
  total_bytes:=total_bytes+octet_length(d.patch::text)+octet_length(d.draft::text);
  if n>10000 or total_bytes>134217728 then raise exception 'r01_preparation_size_limit' using errcode='22023';end if;
  if d.patch_id like 'document-adapter:%' then
   -- Exact value/anchor correspondence is proved by replaying the pinned parser.
   if exists(select 1 from jsonb_array_elements(d.patch#>'{suppliedBy,evidence}') x where x->>'sourceClass' is distinct from 'provided_document'
    or not exists(select 1 from jsonb_array_elements(ctx#>'{scope,sourceRevisions}') s where s->>'sourceDocumentId'=x->>'sourceId'))
   then raise exception 'r01_preparation_document_reference_denied' using errcode='42501';end if;
  elsif d.patch_id like 'information-response:%' then
   if jsonb_array_length(d.patch#>'{suppliedBy,evidence}') is distinct from 1 then raise exception 'r01_preparation_answer_denied' using errcode='42501';end if;
   ref:=d.patch#>'{suppliedBy,evidence,0}';
   if ref->>'sourceClass' is distinct from 'user_confirmation' or d.patch_id is distinct from 'information-response:'||(ref->>'sourceId')
   or ref->>'anchor' !~ '^information_request:[a-f0-9-]{36}$' then raise exception 'r01_preparation_answer_denied' using errcode='42501';end if;
   answer:=private.r01_response_authority_v1(p_org,p_work,p_session,ds,(ref->>'sourceId')::uuid,substring(ref->>'anchor' from 21)::uuid,p_subject);
   if not ((ref->>'sourceId')=any(seen_messages)) then responses:=responses||jsonb_build_array(answer);seen_messages:=array_append(seen_messages,ref->>'sourceId');end if;
  else
   if (select count(*) from jsonb_each(d.patch->'sections'))+jsonb_array_length(d.patch->'fields')<>1 then raise exception 'r01_preparation_target_ambiguous' using errcode='42501';end if;
   for target in select '/'||key as path,value->'value' as value from jsonb_each(d.patch->'sections')
    union all select x->>'path',x->'value' from jsonb_array_elements(d.patch->'fields') x loop
    for ref in select x from jsonb_array_elements(d.patch#>'{suppliedBy,evidence}') x loop
     if ref->>'sourceClass'='project_context' and ref->>'anchor' ~ '^assumption_version:[a-f0-9-]{36}$' then
      answer:=private.r01_adopted_value_v1(p_org,p_work,ds,substring(ref->>'anchor' from 20)::uuid,(ref->>'sourceId')::uuid,target.path,p_subject);
      if answer->'value' is distinct from target.value then raise exception 'r01_preparation_adopted_value_changed' using errcode='42501';end if;
      resolved:=resolved||jsonb_build_array(answer);
      select adoption_pins||jsonb_build_array(jsonb_build_object('decisionId',a.id,'assumptionVersionId',v.id,'fingerprint',v.content_fingerprint,
       'kind',a.kind,'valueType',a.value_type,'dimensions',a.dimensions,'fieldPath',a.field_path)) into adoption_pins
      from public.adoption_decisions a join public.assumption_versions v on v.organization_id=a.organization_id and v.set_id=a.set_id
      where a.organization_id=p_org and a.id=(ref->>'sourceId')::uuid and v.id=substring(ref->>'anchor' from 20)::uuid;
     else
      -- Published R01 declares no override points. A title, draft component or
      -- published prose cannot silently authorize an arbitrary house default.
      raise exception 'r01_preparation_unpublished_typed_parameter' using errcode='42501';
     end if;
    end loop;
   end loop;
  end if;
 end loop;
 if n=0 then raise exception 'r01_preparation_history_missing' using errcode='42501';end if;
 return jsonb_build_object('input',jsonb_build_object('sessionId',p_session,'evidence',evidence,'confirmedScope',ctx,'history',history,
  'currentDraft',current_draft,'responses',responses,'resolvedValues',resolved),
  'authority',metadata||jsonb_build_object('adoptionPins',adoption_pins));
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'r01_preparation_reference_invalid' using errcode='42501';
end $function$
