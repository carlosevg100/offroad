CREATE OR REPLACE FUNCTION private.read_artifact_revision_v1(p_revision uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.artifact_revisions;result jsonb;
begin
 select * into r from public.artifact_revisions where id=p_revision;
 result:=private.read_artifact_revision_pre_debt_v1(p_revision);
 if result->'restriction' is distinct from 'null'::jsonb then return result;end if;
 if not private.capital_debt_native_ancestry_allowed_v1(r.organization_id,r.id,auth.uid()) then
 result:=jsonb_set(jsonb_set(jsonb_set(result,'{blocks}','[]'),'{revision,manifest}', 'null'),'{restriction}',jsonb_build_object('kind','source_rights','linkIds','[]'::jsonb,'unresolvedRevisionIds',jsonb_build_array(r.id)));
 end if;
 return result;
end; $function$
