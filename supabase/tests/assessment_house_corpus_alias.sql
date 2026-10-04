-- Installed alias-resolution regression and private access contract, all rolled back.
begin;
do $assert_repro$declare reproduced boolean:=false;begin
 begin
 execute $old_query$do $reproduce$declare v public.source_versions;corpus record;begin
 select '00000000-0000-0000-0000-000000000000'::uuid chunk_id,'00000000-0000-0000-0000-000000000000'::uuid governance_id into corpus;
 perform 1 from public.house_playbook_chunks c join public.house_playbook_versions v on v.id=c.playbook_version_id join auth.users u on u.id=v.approved_by
     where c.id=corpus.chunk_id and v.id=corpus.governance_id for share of c,v,u nowait;
end $reproduce$;$old_query$;
 exception when ambiguous_column then reproduced:=true;end;
 if not reproduced then raise exception 'assessment_house_alias_reproduction_missing';end if;
end $assert_repro$;
do $reproduce$declare v public.source_versions;corpus record;begin
 select '00000000-0000-0000-0000-000000000000'::uuid chunk_id,'00000000-0000-0000-0000-000000000000'::uuid governance_id into corpus;
 perform 1 from public.house_playbook_chunks c join public.house_playbook_versions house_version on house_version.id=c.playbook_version_id join auth.users u on u.id=house_version.approved_by
     where c.id=corpus.chunk_id and house_version.id=corpus.governance_id for share of c,house_version,u nowait;
end $reproduce$;
do $contract$declare role_name text;begin
 if md5((select prosrc from pg_proc where oid='private.assessment_input_snapshot_before_institutional_v1(uuid,uuid,uuid)'::regprocedure))<>'fed9b0b6026df105c124a660840603b5' then raise exception 'assessment_house_alias_not_installed';end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(role_name,'private.assessment_input_snapshot_before_institutional_v1(uuid,uuid,uuid)','EXECUTE')then raise exception 'assessment_house_alias_private_execute_granted';end if;
 end loop;
end $contract$;
set local role anon;
do $negative$begin
 begin
  perform private.assessment_input_snapshot_before_institutional_v1(null,null,null);
  raise exception 'assessment_house_alias_private_call_accepted';
 exception when insufficient_privilege then
  if sqlerrm not in('permission denied for schema private','permission denied for function assessment_input_snapshot_before_institutional_v1')then raise;end if;
 end;
end $negative$;
reset role;
set local role authenticated;
do $negative$begin
 begin
  perform private.assessment_input_snapshot_before_institutional_v1(null,null,null);
  raise exception 'assessment_house_alias_private_call_accepted';
 exception when insufficient_privilege then
  if sqlerrm not in('permission denied for schema private','permission denied for function assessment_input_snapshot_before_institutional_v1')then raise;end if;
 end;
end $negative$;
reset role;
set local role service_role;
do $negative$begin
 begin
  perform private.assessment_input_snapshot_before_institutional_v1(null,null,null);
  raise exception 'assessment_house_alias_private_call_accepted';
 exception when insufficient_privilege then
  if sqlerrm not in('permission denied for schema private','permission denied for function assessment_input_snapshot_before_institutional_v1')then raise;end if;
 end;
end $negative$;
reset role;
select 'assessment_house_corpus_alias_query_resolution' as test,'PASS' as result;
rollback;
