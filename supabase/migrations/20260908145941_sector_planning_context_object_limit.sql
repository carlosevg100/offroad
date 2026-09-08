-- Match the bounded visible planning-context contract.
create or replace function private.validate_execution_brief_planning_context()
returns trigger language plpgsql set search_path='' as $$
declare planning jsonb;
begin
  if not (new.internal_snapshot ? 'planningContext' or new.visible_snapshot ? 'planningContext') then return new; end if;
  planning:=new.internal_snapshot->'planningContext';
  if planning is distinct from new.visible_snapshot->'planningContext'
    or coalesce(jsonb_typeof(planning),'null')<>'object'
    or planning->>'schemaVersion' is distinct from 'sector-planning-context.v1'
    or planning->>'mode' is distinct from 'planning_only'
    or coalesce(planning->>'contextFingerprint','') !~ '^[a-f0-9]{64}$'
    or coalesce(planning->>'planFingerprint','') !~ '^[a-f0-9]{64}$'
    or coalesce(jsonb_typeof(planning->'objects'),'null')<>'array' then
    raise exception 'execution_brief_planning_context_invalid' using errcode='22023';
  end if;
  if jsonb_array_length(planning->'objects')>50 then raise exception 'execution_brief_planning_context_invalid' using errcode='22023'; end if;
  return new;
end;
$$;
revoke all on function private.validate_execution_brief_planning_context() from public,anon,authenticated;
