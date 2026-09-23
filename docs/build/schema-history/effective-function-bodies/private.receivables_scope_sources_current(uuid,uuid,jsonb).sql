CREATE OR REPLACE FUNCTION private.receivables_scope_sources_current(p_org uuid, p_session uuid, p_sources jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_typeof(p_sources)='array' and jsonb_array_length(p_sources)>0
 and not exists(select 1 from jsonb_array_elements(p_sources) src where not exists(
  select 1 from public.source_documents d
  join lateral (select f.source_sha256,f.content_sha256,f.content_kind,f.schema_version from private.receivables_evidence_fragments f
    where f.organization_id=d.organization_id and f.intake_session_id=d.intake_session_id
      and f.source_document_id=d.id and f.document_version=d.document_version
    order by f.created_at desc,f.processing_run_id desc limit 1) fragment on true
  where d.organization_id=p_org and d.intake_session_id=p_session
    and d.id::text=src->>'sourceDocumentId' and d.document_version::text=src->>'documentVersion'
    and d.sha256=src->>'sourceSha256' and d.processing_status='ready' and d.scan_result->>'verdict'='clean'
    and fragment.source_sha256=src->>'sourceSha256' and fragment.content_sha256=src->>'contentSha256'
    and fragment.content_kind=src->>'contentKind' and fragment.schema_version=src->>'schemaVersion'
  ));
$function$
