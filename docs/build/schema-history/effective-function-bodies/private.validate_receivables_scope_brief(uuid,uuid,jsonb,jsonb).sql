CREATE OR REPLACE FUNCTION private.validate_receivables_scope_brief(p_org uuid, p_session uuid, p_internal jsonb, p_visible jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ctx jsonb; scope jsonb; source jsonb; assumption jsonb; basis jsonb; matched boolean:=false;
begin
 ctx:=private.receivables_evidence_scope_context(p_org,p_session);
 if ctx->>'state'<>'current' then return; end if;
 scope:=ctx->'scope';
 select value into source from jsonb_array_elements(scope->'sourceRevisions') where value->>'sourceDocumentId'=scope#>>'{primaryTape,documentId}';
 if p_internal->'assumptions' is distinct from p_visible->'assumptions' then
  raise exception 'execution_brief_receivables_scope_mismatch' using errcode='22023';
 end if;
 for assumption in select value from jsonb_array_elements(coalesce(p_internal->'assumptions','[]')) loop
  begin basis:=(assumption->>'basis')::jsonb; exception when invalid_text_representation then continue; end;
  if jsonb_typeof(basis)='object' and basis->>'scopeFingerprint'=scope->>'fingerprint'
   and basis->>'reportingDate'=scope->>'reportingDate' and basis->>'primaryDocumentId'=scope#>>'{primaryTape,documentId}'
   and basis->'headerRow'=scope#>'{primaryTape,headerRow}' and basis->'documentVersion'=source->'documentVersion'
   and basis->>'sourceSha256'=source->>'sourceSha256' and basis->>'contentSha256'=source->>'contentSha256'
   and basis->'selectedSourceCount'=to_jsonb(jsonb_array_length(scope->'sourceRevisions'))
   and (scope->>'schemaVersion'<>'receivables-evidence-scope.v2' or basis->'primarySupportSheetCount'=to_jsonb(jsonb_array_length(scope->'primarySupportSheets'))) then matched:=true; end if;
 end loop;
 if not matched then raise exception 'execution_brief_receivables_scope_mismatch' using errcode='22023'; end if;
 return;
end;
$function$
