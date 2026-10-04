-- Resolve only the house-version SQL alias colliding with local source-version v.
-- Exact source guard and whole pg_proc metadata parity preserve the installed contract.
set search_path='';
do $repair$
declare target regprocedure:='private.assessment_input_snapshot_before_institutional_v1(uuid,uuid,uuid)'::regprocedure;
 source text;definition text;before_metadata jsonb;after_metadata jsonb;
 needle text:=$old$perform 1 from public.house_playbook_chunks c join public.house_playbook_versions v on v.id=c.playbook_version_id join auth.users u on u.id=v.approved_by
     where c.id=corpus.chunk_id and v.id=corpus.governance_id for share of c,v,u nowait;$old$;
 replacement text:=$new$perform 1 from public.house_playbook_chunks c join public.house_playbook_versions house_version on house_version.id=c.playbook_version_id join auth.users u on u.id=house_version.approved_by
     where c.id=corpus.chunk_id and house_version.id=corpus.governance_id for share of c,house_version,u nowait;$new$;
begin
 select p.prosrc,pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' into strict source,definition,before_metadata from pg_proc p where p.oid=target;
 if md5(source)<>'0655b65808b80a5fbc9e6cc322206d09'
 or length(source)-length(replace(source,needle,''))<>length(needle)
 then raise exception 'assessment_house_alias_source_changed'using errcode='55000';end if;
 execute replace(definition,needle,replacement);
 select to_jsonb(p)-'prosrc' into strict after_metadata from pg_proc p where p.oid=target;
 if after_metadata is distinct from before_metadata
 or md5((select prosrc from pg_proc where oid=target))<>'fed9b0b6026df105c124a660840603b5'
 then raise exception 'assessment_house_alias_contract_changed'using errcode='55000';end if;
end $repair$;
