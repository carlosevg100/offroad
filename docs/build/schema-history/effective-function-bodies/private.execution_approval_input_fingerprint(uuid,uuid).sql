CREATE OR REPLACE FUNCTION private.execution_approval_input_fingerprint(p_organization_id uuid, p_session_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous text; research jsonb;
begin
 previous:=private.execution_approval_input_fingerprint_before_public_catalog(p_organization_id,p_session_id);
 select jsonb_agg(jsonb_build_object('briefId',b.id,'storedFingerprint',b.content_fingerprint,
   'computedFingerprint',encode(extensions.digest(convert_to(b.content::text,'utf8'),'sha256'),'hex'),
   'publicCatalog',b.content->'publicCatalog') order by b.id) into research
 from public.document_intake_sessions s
 join public.capital_project_briefs b on b.organization_id=s.organization_id and b.capital_project_id=s.capital_project_id
 where s.organization_id=p_organization_id and s.id=p_session_id and b.brief_kind='provider_research'
   and b.status='active' and b.content->>'schemaVersion'='provider-research-context.v2';
 if research is null then return previous; end if;
 return encode(extensions.digest(convert_to(jsonb_build_object('previous',previous,'providerResearchV2',research)::text,'utf8'),'sha256'),'hex');
end;
$function$
