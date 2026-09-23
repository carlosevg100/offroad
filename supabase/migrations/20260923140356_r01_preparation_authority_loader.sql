-- Stage 17: private read boundary for the separately pinned R01 preparer.
-- No grants, producer, execution receipt, or queue activation in this migration.
set search_path='';

-- Exact JSON.stringify layout after the published Zod scope projection. This is
-- deliberately separate from JSONB::text and from execution canonical UTF-16 bytes.
create function private.r01_scope_dataset_hash_v1(s jsonb) returns text
language plpgsql immutable security invoker set search_path='' as $$
declare body text; sources text; sheets text;
begin
 if coalesce(s->>'schemaVersion','') not in ('receivables-evidence-scope.v1','receivables-evidence-scope.v2')
 or coalesce(s->>'fingerprint','') !~ '^[a-f0-9]{64}$'
 or coalesce(s->>'sourceManifestFingerprint','') !~ '^[a-f0-9]{64}$'
 or jsonb_typeof(s->'sourceRevisions') is distinct from 'array'
 or jsonb_array_length(s->'sourceRevisions')=0
 then raise exception 'r01_scope_contract_invalid' using errcode='22023';end if;
 select string_agg('{"sourceDocumentId":'||(x->'sourceDocumentId')::text
 ||',"documentVersion":'||(x->'documentVersion')::text||',"contentKind":'||(x->'contentKind')::text
 ||',"sourceSha256":'||(x->'sourceSha256')::text||',"contentSha256":'||(x->'contentSha256')::text
 ||',"schemaVersion":'||(x->'schemaVersion')::text||',"fileName":'||coalesce((x->'fileName')::text,'null')||'}',',' order by x->>'sourceDocumentId' collate "C")
 into sources from jsonb_array_elements(s->'sourceRevisions') x;
 body:='{"schemaVersion":"receivables-analysis-scope.v1","scopeFingerprint":'||(s->'fingerprint')::text
 ||',"sourceManifestFingerprint":'||(s->'sourceManifestFingerprint')::text||',"reportingDate":'||(s->'reportingDate')::text
 ||',"primaryTape":{"documentId":'||(s#>'{primaryTape,documentId}')::text||',"sheet":'||(s#>'{primaryTape,sheet}')::text
 ||',"headerRow":'||(s#>'{primaryTape,headerRow}')::text||'}';
 if s->>'schemaVersion'='receivables-evidence-scope.v2' then
  if jsonb_typeof(s->'primarySupportSheets') is distinct from 'array' then raise exception 'r01_scope_contract_invalid' using errcode='22023';end if;
  select coalesce(string_agg(x::text,',' order by ord),'') into sheets from jsonb_array_elements(s->'primarySupportSheets') with ordinality a(x,ord);
  body:=body||',"primarySupportSheets":['||sheets||']';
 end if;
 body:=body||',"sourceRevisions":['||sources||']}';
 if body is null then raise exception 'r01_scope_contract_invalid' using errcode='22023';end if;
 return encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex');
end $$;
revoke all on function private.r01_scope_dataset_hash_v1(jsonb) from public,anon,authenticated,service_role;

-- A typed adoption, not a prose contribution or a worker-supplied value. Context
-- explicitly identifies this R01 dataset; a value from another decision cannot leak in.
create function private.r01_adopted_value_v1(p_org uuid,p_work uuid,p_dataset text,p_version uuid,p_decision uuid,p_path text,p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a public.adoption_decisions; v public.assumption_versions; entry jsonb;
begin
 select av.* into v from public.assumption_versions av join public.assumption_sets s on s.organization_id=av.organization_id and s.id=av.set_id
 where av.organization_id=p_org and av.id=p_version and av.classification='working_basis'
 and s.work_id=p_work and s.purpose='receivables underwriting' and s.context_key='r01:'||p_dataset;
 select d.* into a from public.adoption_decisions d join private.assumption_version_items i
 on i.organization_id=d.organization_id and i.set_id=d.set_id and i.decision_id=d.id
 where d.organization_id=p_org and d.id=p_decision and i.version_id=p_version and d.set_id=v.set_id and d.field_path=p_path;
 if v.id is null or a.id is null or p_subject is null
 or private.evaluate_resource_policy_v1(p_org,p_work,p_subject,'read','analysis') is not true
 or private.evaluate_resource_policy_v1(p_org,p_work,p_subject,'work','analysis') is not true
 or private.execution_basis_current_v1(p_org,a.id,p_subject) is not true
 then raise exception 'r01_adoption_authority_denied' using errcode='42501';end if;
 select x into entry from jsonb_array_elements(v.canonical_snapshot::jsonb->'entries') x where x->>'decisionId'=a.id::text;
 if entry->>'kind' is distinct from a.kind or entry->>'fieldPath' is distinct from p_path
 or entry->'dimensions' is distinct from a.dimensions
 or entry#>>'{value,type}' is distinct from a.value_type or entry#>'{value,value}' is distinct from a.asserted_value
 then raise exception 'r01_adoption_snapshot_mismatch' using errcode='42501';end if;
 return jsonb_build_object('sourceClass','project_context','sourceId',a.id,'anchor','assumption_version:'||v.id::text,'path',p_path,'value',a.asserted_value);
end $$;
revoke all on function private.r01_adopted_value_v1(uuid,uuid,text,uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

create function private.r01_response_authority_v1(
 p_org uuid,p_work uuid,p_session uuid,p_dataset text,
 p_message_id uuid,p_request_id uuid,p_subject uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 r public.capital_project_information_requests;
 m public.agent_messages;
 b private.receivables_information_request_bindings;
 body jsonb; field text; expected_kind text; expected_unit text; answered_at timestamptz;
begin
 if p_org is null or p_work is null or p_session is null or p_subject is null
 or p_message_id is null or p_request_id is null or p_dataset is null
 or p_dataset !~ '^[a-f0-9]{64}$' then
  raise exception 'r01_response_authority_denied' using errcode='42501';
 end if;
 if not coalesce(private.evaluate_resource_policy_v1(p_org,p_work,p_subject,'read','analysis'),false)
 or not coalesce(private.evaluate_resource_policy_v1(p_org,p_work,p_subject,'work','analysis'),false)
 or not coalesce(private.evaluate_resource_policy_v1(p_org,p_session,p_subject,'read','analysis'),false)
 or not coalesce(private.evaluate_resource_policy_v1(p_org,p_session,p_subject,'work','analysis'),false)
 or not exists(select 1 from public.capital_projects where organization_id=p_org and id=p_work and status<>'archived')
 or not exists(select 1 from public.document_intake_sessions where organization_id=p_org and id=p_session and capital_project_id=p_work)
 then raise exception 'r01_response_authority_denied' using errcode='42501';end if;
 select * into r from public.capital_project_information_requests
 where organization_id=p_org and capital_project_id=p_work and id=p_request_id;
 if not found or r.status is distinct from 'answered'
 or r.source_namespace is distinct from 'receivables_method_r01_fields'
 or jsonb_typeof(r.answer_ref) is distinct from 'object'
 or r.answer_ref->>'messageId' is distinct from p_message_id::text
 or coalesce(r.answer_ref->>'answerSource','') not in ('choice','custom')
 then raise exception 'r01_response_authority_denied' using errcode='42501';end if;
 select * into m from public.agent_messages where organization_id=p_org and id=p_message_id;
 if not found or m.intake_session_id is distinct from p_session or m.role is distinct from 'user' or m.created_by is null
 or m.created_by::text is distinct from r.answer_ref->>'answeredBy'
 or m.metadata->>'kind' is distinct from 'information_request_response'
 or m.metadata->>'informationRequestId' is distinct from r.id::text
 or m.metadata->>'answerSource' is distinct from r.answer_ref->>'answerSource'
 or m.metadata->>'requirementKey' is distinct from r.requirement_key
 or r.answer_ref->>'responseFingerprint' is distinct from encode(extensions.digest(convert_to(m.content,'UTF8'),'sha256'),'hex')
 or not exists(select 1 from public.agent_conversations c where c.organization_id=p_org and c.id=m.conversation_id and c.intake_session_id=p_session)
 then raise exception 'r01_response_authority_denied' using errcode='42501';end if;
 -- Message status is deliberately not an authority: its own job may still be processing.
 -- The author is historical provenance, not necessarily the current execution subject.
 answered_at := (r.answer_ref->>'answeredAt')::timestamptz;
 if answered_at is null or not isfinite(answered_at) or answered_at>clock_timestamp()
 then raise exception 'r01_response_authority_denied' using errcode='42501';end if;
 select * into b from private.receivables_information_request_bindings
 where organization_id=p_org and capital_project_id=p_work and information_request_id=p_request_id;
 if not found or b.source_namespace is distinct from 'receivables_method_r01_fields'
 or b.binding_fingerprint is distinct from encode(extensions.digest(convert_to(b.binding::text,'UTF8'),'sha256'),'hex')
 then raise exception 'r01_response_authority_denied' using errcode='42501';end if;
 body:=b.binding;field:=body->>'fieldPath';
 if jsonb_typeof(body) is distinct from 'object'
 or body->>'schemaVersion' is distinct from 'receivables-information-request-binding.v1'
 or body->>'methodId' is distinct from 'R01' or body->>'sourceDatasetHash' is distinct from p_dataset
 or (body-array['schemaVersion','methodId','sourceDatasetHash','fieldPath','valueKind','unit','minimum','maximum','options'])<>'{}'::jsonb
 or not (body ?& array['schemaVersion','methodId','sourceDatasetHash','fieldPath','valueKind','unit','minimum','maximum','options'])
 then raise exception 'r01_response_authority_denied' using errcode='42501';end if;
 expected_kind:=case
 when field=any(array['/policy/maxDaysPastDue','/policy/maxRemainingTermDays','/policy/minSeasoningDays']) then 'integer'
 when field=any(array['/policy/requireAssignable','/policy/requireEvidenceVerified','/policy/excludeDisputed','/policy/excludeRelatedParties','/policy/excludeEncumbered']) then 'boolean'
 when field='/policy/registrationRule' then 'enum'
 when field='/policy/allowedDebtorSectors' then 'string_list'
 when field='/structure/requiredOvercollateralization' then 'multiple'
 when field=any(array['/structure/requestedFacility','/structure/actualSeniorAmount','/structure/actualMezzanineAmount','/structure/actualSubordinatedAmount','/structure/waterfall/availableCash','/structure/waterfall/servicingFeeDue','/structure/waterfall/seniorInterestDue','/structure/waterfall/seniorPrincipalDue','/structure/waterfall/reserveOpening','/structure/waterfall/mezzanineDue']) then 'money'
 when field=any(array['/policy/maxSingleDebtorShare','/policy/maxDebtorGroupShare','/policy/minimumEligibleShare','/policy/minimumEvidenceCoverage','/policy/minimumRegistrationCoverage','/policy/maximumDelinquency30Share','/policy/maximumDilutionShare','/policy/maximumRepurchaseShare','/policy/minimumRecoveryRate','/policy/maximumAccountingMismatchShare','/policy/maximumCashMismatchShare','/policy/minimumMappedCashShare','/policy/minimumLinkedAccountCashShare','/structure/advanceRate','/structure/requiredSubordinationRate','/structure/reserveRate']) then 'percentage'
 else null end;
 expected_unit:=case expected_kind when 'integer' then 'days' when 'percentage' then 'percent_0_100' when 'money' then 'currency_major' when 'string_list' then 'text_list' else expected_kind end;
 if expected_kind is null or body->>'valueKind' is distinct from expected_kind or body->>'unit' is distinct from expected_unit
 or jsonb_typeof(body->'minimum') not in ('number','null') or jsonb_typeof(body->'maximum') not in ('number','null')
 or jsonb_typeof(body->'options') is distinct from 'array'
 then raise exception 'r01_response_authority_denied' using errcode='42501';end if;
 if jsonb_array_length(body->'options')>12
 or exists(select 1 from jsonb_array_elements(body->'options') o
 where jsonb_typeof(o) is distinct from 'object' or (o-array['label','value'])<>'{}'::jsonb
 or not(o ?& array['label','value']) or jsonb_typeof(o->'label') is distinct from 'string'
 or coalesce(length(o->>'label'),0)=0 or jsonb_typeof(o->'value') not in ('string','boolean'))
 or exists(select 1 from jsonb_array_elements(body->'options') o group by o->>'label' having count(*)>1)
 or (expected_kind not in ('boolean','enum') and jsonb_array_length(body->'options')<>0)
 or (expected_kind='boolean' and exists(select 1 from jsonb_array_elements(body->'options') o where jsonb_typeof(o->'value') is distinct from 'boolean'))
 or (expected_kind='enum' and exists(select 1 from jsonb_array_elements(body->'options') o where coalesce(o->>'value','') not in ('required','required_when_applicable','not_required')))
 then raise exception 'r01_response_authority_denied' using errcode='42501';end if;
 return jsonb_build_object('messageId',m.id,'content',m.content,'answeredRequest',jsonb_build_object(
  'id',r.id,'requirementKey',r.requirement_key,'question',r.question,'answerKind',r.answer_kind,
  'answerSource',r.answer_ref->>'answerSource','sourceNamespace',r.source_namespace,
  'answeredAt',r.answer_ref->>'answeredAt',
  'answeredBy',r.answer_ref->>'answeredBy','producerBinding',body));
exception when data_exception then
 raise exception 'r01_response_authority_denied' using errcode='42501';
end $$;
revoke all on function private.r01_response_authority_v1(uuid,uuid,uuid,text,uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Called only by capability-bound commands. These parameters are not a public RPC.
-- A later execution receipt must load again and compare this entire authority snapshot.
create function private.r01_preparation_authority_v1(p_org uuid,p_work uuid,p_session uuid,p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare ctx jsonb; ds text; src jsonb; f private.receivables_evidence_fragments; rights private.source_rights_versions; source_binding uuid; rights_closure jsonb;
 evidence jsonb:='[]'; pins jsonb:='[]'; history jsonb:='[]'; responses jsonb:='[]'; resolved jsonb:='[]';
 current_draft jsonb; d record; n integer:=0; patch_ids text[]:='{}'; ref jsonb; target record; answer jsonb; adoption_pins jsonb:='[]';
 seen_messages text[]:='{}'; total_bytes bigint:=0;
begin
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
  select * into strict rights from private.source_rights_versions where organization_id=p_org and source_version_id=f.source_document_id order by revision desc limit 1;
  select id into strict source_binding from public.source_bindings where organization_id=p_org and source_version_id=f.source_document_id and resource_id=p_session and revoked_at is null;
  with recursive dependencies(id) as (
   select f.source_document_id union select dep.source_version_id from dependencies g join private.resource_dependencies dep on dep.organization_id=p_org and dep.derived_version_id=g.id
  ) select jsonb_agg(jsonb_build_object('sourceVersionId',v.id,'originResourceId',s.origin_resource_id,'rightsVersionId',r.id,'rightsRevision',r.revision,
   'bindingId',b.id,'resourceId',b.resource_id) order by v.id) into rights_closure
  from dependencies g join public.source_versions v on v.organization_id=p_org and v.id=g.id
  join public.sources s on s.organization_id=v.organization_id and s.id=v.source_id
  join lateral(select rv.* from private.source_rights_versions rv where rv.organization_id=p_org and rv.source_version_id=v.id order by rv.revision desc limit 1) r on true
  join lateral(select sb.id,sb.resource_id from public.source_bindings sb where sb.organization_id=p_org and sb.source_version_id=v.id and sb.revoked_at is null
   and private.evaluate_resource_policy_v1(p_org,sb.resource_id,p_subject,'read','analysis') order by sb.id limit 1) b on true;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('source_document_id',f.source_document_id,'document_version',f.document_version,
   'content_kind',f.content_kind,'schema_version',f.schema_version,'source_sha256',f.source_sha256,'content_sha256',f.content_sha256,
   'payload_sha256',f.payload_sha256,'codec',f.codec,'uncompressed_bytes',f.uncompressed_bytes,'payload_base64',replace(encode(f.compressed_payload,'base64'),E'\n','')));
  pins:=pins||jsonb_build_array(jsonb_build_object('sourceVersionId',f.source_document_id,'processingRunId',f.processing_run_id,'documentVersion',f.document_version,
   'sourceHash',f.source_sha256,'contentHash',f.content_sha256,'payloadHash',f.payload_sha256,'rightsVersionId',rights.id,'rightsRevision',rights.revision,
   'bindingId',source_binding,'resourceId',p_session,'rightsClosure',rights_closure));
 end loop;
 if jsonb_array_length(evidence)=0 then raise exception 'r01_preparation_source_denied' using errcode='42501';end if;
 for d in select drafts.*,patches.patch,patches.patch_id,patches.patch_fingerprint,
  patches.capital_project_id as patch_work,patches.intake_session_id as patch_session,patches.source_dataset_hash as patch_dataset
  from private.receivables_method_supplement_drafts drafts left join private.receivables_method_supplement_patches patches
  on patches.organization_id=drafts.organization_id and patches.id=drafts.caused_by_patch_id
  where drafts.organization_id=p_org and drafts.intake_session_id=p_session and drafts.source_dataset_hash=ds order by drafts.revision loop
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
  'authority',jsonb_build_object('schemaVersion','r01-preparation-authority.v1','organizationId',p_org,'workId',p_work,'sessionId',p_session,
   'subjectId',p_subject,'datasetHash',ds,'scopeId',ctx#>'{scope,id}','scopeFingerprint',ctx#>'{scope,fingerprint}','sourcePins',pins,'adoptionPins',adoption_pins));
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'r01_preparation_reference_invalid' using errcode='42501';
end $$;
revoke all on function private.r01_preparation_authority_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.worker_load_receivables_preparation_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs; work uuid; result jsonb;
begin
 select * into j from public.processing_jobs where id=p_job_id;
 if not found then raise exception 'r01_preparation_capability_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0));
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if j.kind not in ('case_analysis','agent_operation_brief') or j.lease_expires_at<=clock_timestamp()
 or not exists(select 1 from private.worker_tokens t where t.id=j.leased_by and t.status='active' and t.revoked_at is null and t.execution_account_user_id=auth.uid())
 then raise exception 'r01_preparation_capability_denied' using errcode='42501';end if;
 select capital_project_id into work from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 result:=private.r01_preparation_authority_v1(j.organization_id,work,j.intake_session_id,j.authorization_subject_id);
 if j.lease_expires_at<=clock_timestamp() or private.job_authority_is_current_v1(j.id) is not true then raise exception 'r01_preparation_capability_denied' using errcode='42501';end if;
 return result;
end $$;
revoke all on function private.worker_load_receivables_preparation_v1(uuid,text) from public,anon,authenticated,service_role;
