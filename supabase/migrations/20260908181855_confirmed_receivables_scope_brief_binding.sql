-- Bind the visible/internal briefing to the confirmed scope without matching translated labels.
create function private.validate_execution_brief_receivables_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare sess uuid; ctx jsonb; scope jsonb; source jsonb; assumption jsonb; basis jsonb; matched boolean:=false;
begin
 select intake_session_id into sess from private.receivables_evidence_scopes
  where organization_id=new.organization_id and capital_project_id=new.capital_project_id order by confirmed_at desc,id desc limit 1;
 if sess is null then return new; end if;
 ctx:=private.receivables_evidence_scope_context(new.organization_id,sess);
 if ctx->>'state'<>'current' then return new; end if;
 scope:=ctx->'scope';
 select value into source from jsonb_array_elements(scope->'sourceRevisions') where value->>'sourceDocumentId'=scope#>>'{primaryTape,documentId}';
 if new.internal_snapshot->'assumptions' is distinct from new.visible_snapshot->'assumptions' then
  raise exception 'execution_brief_receivables_scope_mismatch' using errcode='22023';
 end if;
 for assumption in select value from jsonb_array_elements(coalesce(new.internal_snapshot->'assumptions','[]')) loop
  begin basis:=(assumption->>'basis')::jsonb; exception when invalid_text_representation then continue; end;
  if jsonb_typeof(basis)='object' and basis->>'scopeFingerprint'=scope->>'fingerprint'
   and basis->>'reportingDate'=scope->>'reportingDate' and basis->>'primaryDocumentId'=scope#>>'{primaryTape,documentId}'
   and basis->'headerRow'=scope#>'{primaryTape,headerRow}' and basis->'documentVersion'=source->'documentVersion'
   and basis->>'sourceSha256'=source->>'sourceSha256' and basis->>'contentSha256'=source->>'contentSha256'
   and basis->'selectedSourceCount'=to_jsonb(jsonb_array_length(scope->'sourceRevisions')) then matched:=true; end if;
 end loop;
 if not matched then raise exception 'execution_brief_receivables_scope_mismatch' using errcode='22023'; end if;
 return new;
end;
$$;
revoke all on function private.validate_execution_brief_receivables_scope() from public,anon,authenticated;
create trigger execution_brief_receivables_scope_check before insert or update of internal_snapshot,visible_snapshot on public.capital_project_execution_briefs
 for each row execute function private.validate_execution_brief_receivables_scope();
