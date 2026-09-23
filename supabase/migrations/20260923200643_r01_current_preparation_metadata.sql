-- Stage 17: current metadata is necessary authority, never execution permission.
set search_path='';
create function private.r01_preparation_metadata_v2(p_org uuid,p_work uuid,p_session uuid,p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare ctx jsonb; ds text; src jsonb; f record; scope_row record; node record;
 nodes jsonb; edges jsonb; source_pins jsonb:='[]'; history_pins jsonb:='[]';
 n integer:=0; history_valid boolean; binding uuid;
begin
 if current_setting('transaction_isolation')<>'read committed' then
 raise exception 'r01_metadata_isolation_unsupported' using errcode='25000';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||p_org::text,0));
 if p_subject is null or private.evaluate_resource_policy_v1(p_org,p_work,p_subject,'read','analysis') is not true
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
 select id,fingerprint,confirmed_at,capital_project_id into scope_row from private.receivables_evidence_scopes
 where organization_id=p_org and intake_session_id=p_session order by confirmed_at desc,id desc limit 1;
 if not found or scope_row.capital_project_id is distinct from p_work or ctx->>'state' is distinct from 'current'
 or ctx#>>'{scope,id}' is distinct from scope_row.id::text or ctx#>>'{scope,fingerprint}' is distinct from scope_row.fingerprint
 then raise exception 'r01_preparation_scope_stale' using errcode='42501';end if;
 ds:=private.r01_scope_dataset_hash_v1(ctx->'scope');
 for src in select x from jsonb_array_elements(ctx#>'{sourceManifest,sources}') x order by x->>'sourceDocumentId' collate "C" loop
  select f0.organization_id,f0.intake_session_id,f0.source_document_id,f0.document_version,f0.processing_run_id,
   f0.created_at,f0.content_kind,f0.schema_version,f0.codec,f0.uncompressed_bytes,f0.source_sha256,f0.content_sha256,f0.payload_sha256
   into f from private.receivables_evidence_fragments f0 join public.source_versions v
   on v.organization_id=f0.organization_id and v.id=f0.source_document_id and v.legacy_document_version=f0.document_version
   where f0.organization_id=p_org and f0.intake_session_id=p_session and v.id=(src->>'sourceDocumentId')::uuid
   and v.legacy_document_version=(src->>'documentVersion')::integer and v.declared_sha256=src->>'sourceSha256'
   order by f0.created_at desc,f0.processing_run_id desc limit 1;
  if not found or f.source_sha256 is distinct from src->>'sourceSha256' or f.content_sha256 is distinct from src->>'contentSha256'
  or f.content_kind is distinct from src->>'contentKind' or f.schema_version is distinct from src->>'schemaVersion'
  or f.codec is distinct from 'gzip-json-v1'
  or private.execution_source_bytes_verified_v1(p_org,f.source_document_id,f.source_sha256) is not true
  or private.source_use_allowed_v1(p_org,f.source_document_id,p_subject,'read','analysis') is not true
  or private.source_use_allowed_v1(p_org,f.source_document_id,p_subject,'process','analysis') is not true
  or private.source_use_allowed_v1(p_org,f.source_document_id,p_subject,'store','analysis') is not true
  or private.source_use_allowed_v1(p_org,f.source_document_id,p_subject,'derive','analysis') is not true
  then raise exception 'r01_preparation_source_denied' using errcode='42501';end if;
  select id into binding from public.source_bindings where organization_id=p_org and source_version_id=f.source_document_id
   and resource_id=p_session and revoked_at is null;
  if not found then raise exception 'r01_preparation_source_denied' using errcode='42501';end if;
  nodes:='[]';
  for node in with recursive dependencies(id) as (
   select f.source_document_id union select dep.source_version_id from dependencies g join private.resource_dependencies dep
    on dep.organization_id=p_org and dep.derived_version_id=g.id
  ) select g.id,v.id existing_version,s.origin_resource_id,r.id rights_id,r.revision,b.id binding_id,b.resource_id
   from dependencies g left join public.source_versions v on v.organization_id=p_org and v.id=g.id
   left join public.sources s on s.organization_id=p_org and s.id=v.source_id
   left join lateral(select rv.id,rv.revision from private.source_rights_versions rv where rv.organization_id=p_org and rv.source_version_id=g.id order by rv.revision desc limit 1) r on true
   left join lateral(select sb.id,sb.resource_id from public.source_bindings sb where sb.organization_id=p_org and sb.source_version_id=g.id and sb.revoked_at is null
    and private.evaluate_resource_policy_v1(p_org,sb.resource_id,p_subject,'read','analysis') order by sb.id limit 1) b on true order by g.id
  loop
   if node.existing_version is null or node.origin_resource_id is null or node.rights_id is null or node.binding_id is null
   then raise exception 'r01_metadata_dependency_denied' using errcode='42501';end if;
   nodes:=nodes||jsonb_build_array(jsonb_build_object('sourceVersionId',node.id,'originResourceId',node.origin_resource_id,
    'rightsVersionId',node.rights_id,'rightsRevision',node.revision,'bindingId',node.binding_id,'resourceId',node.resource_id));
  end loop;
  with recursive dependencies(id) as (
   select f.source_document_id union select dep.source_version_id from dependencies g join private.resource_dependencies dep on dep.organization_id=p_org and dep.derived_version_id=g.id
  ) select coalesce(jsonb_agg(jsonb_build_object('derivedVersionId',dep.derived_version_id,'sourceVersionId',dep.source_version_id,
   'sourceRightsVersionId',dep.source_rights_version_id) order by dep.derived_version_id,dep.source_version_id),'[]') into edges
   from dependencies g join private.resource_dependencies dep on dep.organization_id=p_org and dep.derived_version_id=g.id;
  source_pins:=source_pins||jsonb_build_array(jsonb_build_object('organizationId',p_org,'sessionId',p_session,
   'sourceVersionId',f.source_document_id,'documentVersion',f.document_version,'processingRunId',f.processing_run_id,'createdAt',to_char(f.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'contentKind',f.content_kind,'schemaVersion',f.schema_version,'codec',f.codec,'uncompressedBytes',f.uncompressed_bytes,
   'sourceHash',f.source_sha256,'contentHash',f.content_sha256,'payloadHash',f.payload_sha256,
   'bindingId',binding,'resourceId',p_session,'rightsClosure',nodes,'dependencyEdges',edges));
 end loop;
 if jsonb_array_length(source_pins)=0 then raise exception 'r01_preparation_source_denied' using errcode='42501';end if;
 with history as (
  select a.id draft_id,a.capital_project_id,a.source_dataset_hash,a.revision,a.draft_fingerprint,a.caused_by_patch_id,
   b.id patch_row_id,b.capital_project_id patch_work,b.intake_session_id patch_session,b.source_dataset_hash patch_dataset,
   b.patch_id,b.patch_fingerprint,b.processing_run_id,b.processing_job_id,
   row_number() over(order by a.revision) expected_revision
   from private.receivables_method_supplement_drafts a left join private.receivables_method_supplement_patches b
   on b.organization_id=a.organization_id and b.id=a.caused_by_patch_id
   where a.organization_id=p_org and a.intake_session_id=p_session and a.source_dataset_hash=ds
 ) select count(*),coalesce(bool_and(revision=expected_revision and capital_project_id=p_work and patch_work=p_work
  and patch_session=p_session and patch_dataset=ds and patch_row_id is not null),false)
  and count(distinct patch_id)=count(*),
  coalesce(jsonb_agg(jsonb_build_object('organizationId',p_org,'workId',p_work,'sessionId',p_session,
   'datasetHash',ds,'draftId',draft_id,'patchRowId',patch_row_id,'causedByPatchId',caused_by_patch_id,
   'revision',revision,'patchId',patch_id,'patchHash',patch_fingerprint,'draftHash',draft_fingerprint,
   'processingRunId',processing_run_id,'processingJobId',processing_job_id) order by revision),'[]')
  into n,history_valid,history_pins from history;
 if n=0 then raise exception 'r01_preparation_history_missing' using errcode='42501';end if;
 if n>10000 or history_valid is not true then raise exception 'r01_preparation_history_invalid' using errcode='42501';end if;

 return jsonb_build_object('schemaVersion','r01-preparation-authority.v2','organizationId',p_org,'workId',p_work,'sessionId',p_session,
  'subjectId',p_subject,'datasetHash',ds,'scopeId',scope_row.id,'scopeFingerprint',scope_row.fingerprint,'scopeConfirmedAt',to_char(scope_row.confirmed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'contextHash',encode(extensions.digest(convert_to(ctx::text,'UTF8'),'sha256'),'hex'),
  'sourcePins',source_pins,'historyPins',history_pins,'adoptionPins','[]'::jsonb);
end $$;
revoke all on function private.r01_preparation_metadata_v2(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.r01_preparation_receipt_current_v1(p_org uuid,p_receipt uuid,p_subject uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare r record; state jsonb; answer jsonb; pin jsonb; seen text[]:='{}';
begin
 -- Explicit projection: canonical_input is deliberately not read at this boundary.
 select id,organization_id,work_id,intake_session_id,subject_user_id,platform_release_id,execution_profile_id,
  profile_fingerprint,authority_pins,history_pins,response_pins,requires_consumer_replay,grants_execution
  into r from private.r01_preparation_receipts where organization_id=p_org and id=p_receipt;
 if not found or p_subject is null or r.subject_user_id is distinct from p_subject
 or r.authority_pins->>'schemaVersion' is distinct from 'r01-preparation-authority.v2'
 or r.authority_pins->'adoptionPins' is distinct from '[]'::jsonb
 or r.requires_consumer_replay is not true or r.grants_execution is not false
 then return false;end if;
 state:=private.r01_preparation_metadata_v2(p_org,r.work_id,r.intake_session_id,p_subject);
 if state is distinct from r.authority_pins or state->'historyPins' is distinct from r.history_pins then return false;end if;
 if not exists(select 1 from private.execution_method_profiles p join private.platform_method_releases m on m.id=p.platform_release_id
  where p.id=r.execution_profile_id and p.payload_fingerprint=r.profile_fingerprint
  and p.platform_release_id=r.platform_release_id and m.id='r01-2026.09.06-v1'
  and m.manifest_hash='17ee80ac7cd3ac22b8c0d5d90893cf89ad67eb129ad1fe1b6f26aa3b73d6d090'
  and p.payload->>'fingerprint'='7fc3be6e6169c027b1ba2f11f61abefdeccd5f0e087bd980a35c85e6575297b9')
 or private.platform_method_reference_available_v1(r.platform_release_id) is not true then return false;end if;
 for pin in select x from jsonb_array_elements(r.response_pins) x loop
  if pin->>'messageId' is null or pin->>'requestId' is null or pin->>'authorityHash' is null
  or pin->>'messageId'=any(seen) then return false;end if;
  seen:=array_append(seen,pin->>'messageId');
  answer:=private.r01_response_authority_v1(p_org,r.work_id,r.intake_session_id,state->>'datasetHash',
   (pin->>'messageId')::uuid,(pin->>'requestId')::uuid,p_subject);
  if encode(extensions.digest(convert_to(answer::text,'UTF8'),'sha256'),'hex') is distinct from pin->>'authorityHash' then return false;end if;
 end loop;
 return true;
exception when insufficient_privilege or data_exception then return false;
end $$;
revoke all on function private.r01_preparation_receipt_current_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Upgrade the heavy loader without bypassing its semantic/evidence validation.
do $$declare old text;body text;start_at integer;end_at integer;begin
 select pg_get_functiondef('private.r01_preparation_authority_v1(uuid,uuid,uuid,uuid)'::regprocedure) into old;
 body:=replace(old,'declare ctx jsonb;','declare metadata jsonb; ctx jsonb;');
 body:=replace(body,E'begin\n if p_subject is null',E'begin\n metadata:=private.r01_preparation_metadata_v2(p_org,p_work,p_session,p_subject);\n if p_subject is null');
 body:=replace(body,E'  order by f0.created_at desc,f0.processing_run_id desc limit 1;',
 E'  and exists(select 1 from jsonb_array_elements(metadata->''sourcePins'') pin where pin->>''sourceVersionId''=f0.source_document_id::text\n   and pin->>''processingRunId''=f0.processing_run_id::text and pin->>''documentVersion''=f0.document_version::text)\n  order by f0.created_at desc,f0.processing_run_id desc limit 1;');
 body:=replace(body,'where drafts.organization_id=p_org and drafts.intake_session_id=p_session and drafts.source_dataset_hash=ds order by drafts.revision loop',
 'where drafts.organization_id=p_org and drafts.intake_session_id=p_session and drafts.source_dataset_hash=ds
  and exists(select 1 from jsonb_array_elements(metadata->''historyPins'') pin where pin->>''draftId''=drafts.id::text and pin->>''patchRowId''=patches.id::text)
  order by drafts.revision loop');
 -- Metadata is projected once; remove the superseded compact-pin builder only.
 start_at:=strpos(body,'  select * into strict rights from private.source_rights_versions');
 end_at:=strpos(body,'  evidence:=evidence||');
 if start_at=0 or end_at<=start_at then raise exception 'r01_metadata_rights_builder_changed';end if;
 body:=substring(body from 1 for start_at-1)||substring(body from end_at);
 start_at:=strpos(body,'  pins:=pins||jsonb_build_array');
 end_at:=strpos(substring(body from start_at),E'
 end loop;');
 if start_at=0 or end_at=0 then raise exception 'r01_metadata_pins_builder_changed';end if;
 body:=substring(body from 1 for start_at-1)||substring(body from start_at+end_at-1);
 body:=replace(body,
 $from$'authority',jsonb_build_object('schemaVersion','r01-preparation-authority.v1','organizationId',p_org,'workId',p_work,'sessionId',p_session,
   'subjectId',p_subject,'datasetHash',ds,'scopeId',ctx#>'{scope,id}','scopeFingerprint',ctx#>'{scope,fingerprint}','sourcePins',pins,'adoptionPins',adoption_pins)$from$,
 $to$'authority',metadata||jsonb_build_object('adoptionPins',adoption_pins)$to$);
 if body=old or body not like '%metadata:=private.r01_preparation_metadata_v2%'
 or body like '%r01-preparation-authority.v1%' or body not like '%pin->>''draftId''%'
 or body not like '%pin->>''processingRunId''%'
 then raise exception 'r01_metadata_loader_contract_changed';end if;
 execute body;
 select pg_get_functiondef('private.record_r01_preparation_receipt_v1(uuid,uuid,text,uuid,text,text)'::regprocedure) into old;
 body:=replace(old,
 $from$select coalesce(jsonb_agg(jsonb_build_object('revision',h#>'{resultingDraft,revision}',
 'patchId',h#>'{patch,patchId}',
 'patchHash',encode(extensions.digest(convert_to((h->'patch')::text,'UTF8'),'sha256'),'hex'),
 'draftHash',encode(extensions.digest(convert_to((h->'resultingDraft')::text,'UTF8'),'sha256'),'hex')) order by ord),'[]') into hp
 from jsonb_array_elements(state#>'{input,history}') with ordinality x(h,ord);$from$,
 $to$hp:=state#>'{authority,historyPins}';$to$);
 if body=old then raise exception 'r01_metadata_receipt_contract_changed';end if;execute body;
 select pg_get_functiondef('private.receivables_scope_sources_current(uuid,uuid,jsonb)'::regprocedure) into old;
 body:=replace(old,'select f.* from private.receivables_evidence_fragments f',
 'select f.source_sha256,f.content_sha256,f.content_kind,f.schema_version from private.receivables_evidence_fragments f');
 if body=old then raise exception 'r01_metadata_scope_contract_changed';end if;execute body;
end $$;
