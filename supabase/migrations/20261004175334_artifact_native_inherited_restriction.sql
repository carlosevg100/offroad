-- Corrective increment after the immutable S11/debt native commits.
-- An inherited restriction is already a closed content decision. Preserve its causal
-- link IDs, unresolved frontier, release and freshness instead of replacing them with
-- the currently requested revision when another native ancestry guard also denies.
create or replace function private.read_artifact_revision_pre_debt_v1(p_revision uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r public.artifact_revisions;result jsonb;
begin
 select * into r from public.artifact_revisions where id=p_revision;
 result:=private.read_artifact_revision_pre_s11_v1(p_revision);
 if result->'restriction' is distinct from 'null'::jsonb then return result;end if;
 if not private.capital_s11_native_ancestry_allowed_v1(r.organization_id,r.id,auth.uid()) then
 result:=jsonb_set(jsonb_set(jsonb_set(result,'{blocks}','[]'),'{revision,manifest}', 'null'),'{restriction}',jsonb_build_object('kind','source_rights','linkIds','[]'::jsonb,'unresolvedRevisionIds',jsonb_build_array(r.id)));
 end if;
 return result;
end; $$;

create or replace function private.read_artifact_revision_v1(p_revision uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r public.artifact_revisions;result jsonb;
begin
 select * into r from public.artifact_revisions where id=p_revision;
 result:=private.read_artifact_revision_pre_debt_v1(p_revision);
 if result->'restriction' is distinct from 'null'::jsonb then return result;end if;
 if not private.capital_debt_native_ancestry_allowed_v1(r.organization_id,r.id,auth.uid()) then
 result:=jsonb_set(jsonb_set(jsonb_set(result,'{blocks}','[]'),'{revision,manifest}', 'null'),'{restriction}',jsonb_build_object('kind','source_rights','linkIds','[]'::jsonb,'unresolvedRevisionIds',jsonb_build_array(r.id)));
 end if;
 return result;
end; $$;

