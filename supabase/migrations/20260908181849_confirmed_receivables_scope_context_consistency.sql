create or replace function private.receivables_evidence_scope_context(p_org uuid,p_session uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare report jsonb; manifest jsonb; candidates jsonb; latest private.receivables_evidence_scopes; fresh boolean; state text;
begin
 select result_summary#>'{case_state,receivablesVertical}' into report from public.document_intake_sessions where organization_id=p_org and id=p_session;
 manifest:=report->'sourceManifest'; candidates:=report->'candidates';
 if candidates is null then candidates:=report#>'{scopeIssue,candidates}'; end if;
 select * into latest from private.receivables_evidence_scopes where organization_id=p_org and intake_session_id=p_session order by confirmed_at desc,id desc limit 1;
 fresh:=coalesce(private.receivables_scope_sources_current(p_org,p_session,manifest->'sources'),false);
 state:=case when latest.id is not null then case when latest.scope->>'sourceManifestFingerprint'=manifest->>'fingerprint' and fresh and private.receivables_scope_sources_current(p_org,p_session,latest.scope->'sourceRevisions') and exists(select 1 from jsonb_array_elements(coalesce(candidates,'[]')) c
      where jsonb_build_object('documentId',c->'documentId','sheet',c->'sheet','headerRow',c->'headerRow')=latest.scope->'primaryTape')
    and not exists(select 1 from jsonb_array_elements(coalesce(candidates,'[]')) c
      where latest.scope->'complementDocumentIds' ? (c->>'documentId'))
    then 'current' else 'stale' end
   when manifest is null or jsonb_typeof(candidates) is distinct from 'array' then 'unavailable'
   when not fresh then 'stale' else 'unconfirmed' end;
 return jsonb_build_object('sourceManifest',manifest,'candidates',coalesce(candidates,'[]'::jsonb),'scope',latest.scope,'state',state);
end;
$$;

