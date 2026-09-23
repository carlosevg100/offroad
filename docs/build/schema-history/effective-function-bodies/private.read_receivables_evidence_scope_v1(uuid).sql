CREATE OR REPLACE FUNCTION private.read_receivables_evidence_scope_v1(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ctx jsonb;
begin
 ctx:=private.read_receivables_evidence_scope_v2(p_session_id);
 if ctx#>>'{scope,schemaVersion}'='receivables-evidence-scope.v2' then raise exception 'confirmed_receivables_support_sheet_reader_required' using errcode='55000'; end if;
 return ctx-'supportSheetCandidates';
end;
$function$
