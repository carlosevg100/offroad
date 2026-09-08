-- Bind the visible/internal briefing to the confirmed scope without matching translated labels.
create function private.validate_receivables_scope_brief(p_org uuid,p_session uuid,p_internal jsonb,p_visible jsonb)
returns void language plpgsql security definer set search_path='' as $$
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
   and basis->'selectedSourceCount'=to_jsonb(jsonb_array_length(scope->'sourceRevisions')) then matched:=true; end if;
 end loop;
 if not matched then raise exception 'execution_brief_receivables_scope_mismatch' using errcode='22023'; end if;
 return;
end;
$$;

revoke all on function private.validate_receivables_scope_brief(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
drop trigger execution_brief_receivables_scope_check on public.capital_project_execution_briefs;
drop function private.validate_execution_brief_receivables_scope();
-- The capability supplies the actual session. Project-only metadata cannot identify it.
do $migration$
declare definition text; needle text:=E'begin\n  if job_row.kind';
begin
 definition:=pg_get_functiondef('private.worker_record_capital_project_execution_brief_v1(uuid,text,jsonb,jsonb,uuid,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'execution brief recorder drifted'; end if;
 execute replace(definition,needle,E'begin\n  perform private.validate_receivables_scope_brief(job_row.organization_id,job_row.intake_session_id,p_internal_snapshot,p_visible_snapshot);\n  if job_row.kind');
end;
$migration$;
