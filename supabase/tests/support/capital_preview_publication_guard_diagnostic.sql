do $diagnostic$declare target regprocedure:='private.capital_preview_revision_storage_allowed_v1(uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,bigint)'::regprocedure;definition text;parts text[];i integer;begin
 definition:=pg_get_functiondef(target);parts:=string_to_array(definition,'return false;');
 if array_length(parts,1)<>5 then raise exception 'preview_publication_diagnostic_source_drift';end if;
 definition:=parts[1];for i in 1..4 loop definition:=definition||format('raise exception %L using errcode=''42501'';','preview_publication_guard_'||i)||parts[i+1];end loop;
 execute definition;
end;$diagnostic$;
