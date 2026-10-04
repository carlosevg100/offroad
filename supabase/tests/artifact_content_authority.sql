-- Regression: direct content is never a substitute for the exact authorized reader.
begin;
\ir support/artifact_revision_setup.sql

do $$
declare
 owner_id uuid:='a11b0000-0000-4000-8000-000000000001';
 source_id uuid:=pg_temp.val('source_a','')::uuid;
 root_id uuid; other_root uuid; multi_parent uuid; current_id uuid; at_limit uuid; result jsonb; blocks jsonb; attempt text; denied boolean;
begin
 blocks:=jsonb_build_array(pg_temp.block('fact','number','{"value":"1"}',jsonb_build_array(pg_temp.claim('fact'))));
 result:=pg_temp.person_write('answer','authority-root','internal',
  pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(source_id)),pg_temp.summary(blocks)),blocks);
 root_id:=(result->>'revision_id')::uuid; current_id:=root_id;
 for n in 1..65 loop
  result:=pg_temp.person_write('answer','authority-depth-'||n,'internal',
   jsonb_set(pg_temp.manifest('answer','internal','[]',pg_temp.summary(blocks)), '{provenance,producer}',to_jsonb('synthetic-depth-'||n)),blocks,
   jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',current_id)));
  current_id:=(result->>'revision_id')::uuid;
  if n=64 then at_limit:=current_id; end if;
 end loop;
 result:=pg_temp.read_as(owner_id,at_limit);
 if result->'restriction' is distinct from 'null'::jsonb or jsonb_array_length(result->'blocks')<>1 then
  raise exception 'complete ancestry at depth 64 must remain readable'; end if;
 result:=pg_temp.read_as(owner_id,current_id);
 if result#>>'{restriction,kind}' is distinct from 'source_rights'
  or not (result#>'{restriction,unresolvedRevisionIds}') @> to_jsonb(array[root_id])
  or result#>'{revision,manifest}' is distinct from 'null'::jsonb or result->'blocks'<>'[]'::jsonb
  or result->>'freshness' is distinct from 'unknown' then
  raise exception 'incomplete ancestry must fail closed'; end if;
 if to_regprocedure('private.read_artifact_revision_pre_s11_v1(uuid)') is not null then
  if result is distinct from private.read_artifact_revision_pre_s11_v1(current_id)
   or result is distinct from private.read_artifact_revision_pre_debt_v1(current_id) then
   raise exception 'native wrappers replaced inherited denied ancestry DTO';
  end if;
  raise notice 'PASS artifact_native_wrappers_preserve_complete_denied_frontier_DTO';
 end if;
 raise notice 'PASS artifact_ancestry_frontier_denies_content';
 result:=pg_temp.person_write('answer','authority-second-root','internal',
  pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(pg_temp.val('source_b','')::uuid)),pg_temp.summary(blocks)),blocks);
 other_root:=(result->>'revision_id')::uuid;
 -- No visual citation is present in these blocks; lineage still carries both parents' rights.
 result:=pg_temp.person_write('answer','authority-multiple-parents','internal',
  jsonb_set(pg_temp.manifest('answer','internal','[]',pg_temp.summary(blocks)),'{provenance,producer}','"synthetic-multiple-parents"'),blocks,
  jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',root_id),
   jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',other_root)));
 multi_parent:=(result->>'revision_id')::uuid;
 result:=pg_temp.read_as(owner_id,multi_parent);
 if result->'restriction' is distinct from 'null'::jsonb or jsonb_array_length(result->'blocks')<>1 then
  raise exception 'authorized multiple-parent revision was denied'; end if;

 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 values('a11b0000-0000-4000-9000-000000000001',source_id,2,array['process'],array['analysis'],'authorized_workspace',clock_timestamp(),'human_declaration',gen_random_uuid(),repeat('c',64),owner_id);
 result:=pg_temp.read_as(owner_id,at_limit);
 if result#>>'{restriction,kind}' is distinct from 'source_rights' or result->'blocks'<>'[]'::jsonb then
  raise exception 'source restriction at depth 64 was lost'; end if;
 result:=pg_temp.read_as(owner_id,multi_parent);
 if result#>>'{restriction,kind}' is distinct from 'source_rights' or result->'blocks'<>'[]'::jsonb then
  raise exception 'removing visual citations lost an ancestor restriction'; end if;
 if to_regprocedure('private.read_artifact_revision_pre_s11_v1(uuid)') is not null then
  if result is distinct from private.read_artifact_revision_pre_s11_v1(multi_parent)
   or result is distinct from private.read_artifact_revision_pre_debt_v1(multi_parent) then
   raise exception 'native wrappers replaced inherited restricted source DTO';
  end if;
  raise notice 'PASS artifact_native_wrappers_preserve_inherited_rights_link_IDs';
 end if;
 raise notice 'PASS artifact_multiple_parents_inherit_rights_without_visual_citation';
 result:=pg_temp.read_as(owner_id,root_id);
 if result#>'{revision,manifest}' is distinct from 'null'::jsonb then raise exception 'restricted root leaked'; end if;
 perform pg_temp.act_as(owner_id);
 set local role authenticated;
 foreach attempt in array array['select manifest from public.artifact_revisions','select content,claims from public.artifact_blocks','select subject from public.artifacts'] loop
  denied:=false;
  begin execute attempt; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'direct content read bypassed the reader: %',attempt; end if;
 end loop;
 reset role;
 raise notice 'PASS artifact_direct_reads_denied_for_authorized_owner';
 result:=pg_temp.person_write('answer','authority-external','external',pg_temp.manifest('answer','external','[]',pg_temp.summary(blocks)),blocks);
 result:=pg_temp.read_as(owner_id,(result->>'revision_id')::uuid);
 if result#>>'{restriction,kind}' is distinct from 'release' or result->'blocks'<>'[]'::jsonb then
  raise exception 'unreleased external content leaked'; end if;
 raise notice 'PASS artifact_external_release_still_required';
end $$;
rollback;
