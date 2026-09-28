-- Synthetic only: an idempotency key cannot hide changed content or ancestry.
begin;
\ir support/artifact_revision_setup.sql

do $$
declare
 blocks jsonb; changed jsonb; manifest jsonb; first_write jsonb; replay jsonb;
 parent jsonb; parent_manifest jsonb; links jsonb; reordered jsonb; source_id uuid;
begin
 blocks:=jsonb_build_array(
  pg_temp.block('first','paragraph','{"text":"Synthetic recommendation"}',jsonb_build_array(pg_temp.claim('fact'))),
  pg_temp.block('second','paragraph','{"text":"Synthetic caveat"}'));
 source_id:=pg_temp.val('source_a','')::uuid;
 manifest:=pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(source_id)),pg_temp.summary(blocks));
 parent_manifest:=pg_temp.manifest('answer','internal','[]','[]',null,'json',
  jsonb_build_object('template',jsonb_build_object('templateVersionId','synthetic-parent','fingerprint',repeat('a',64))));
 parent:=pg_temp.person_write('answer','synthetic-replay-parent','internal',parent_manifest,
  jsonb_build_array(pg_temp.block('parent','paragraph','{"text":"Synthetic ancestry"}')));
 links:=jsonb_build_array(
  jsonb_build_object('kind','source_version','blockKey','first','sourceVersionId',source_id,'rightsVersionId',pg_temp.rights_of(source_id)),
  jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',parent->>'revision_id'));
 first_write:=pg_temp.person_write('answer','synthetic-exact-replay','internal',manifest,blocks,links);
 replay:=pg_temp.person_write('answer','synthetic-exact-replay','internal',manifest,blocks,links);
 if replay->>'revision_id' is distinct from first_write->>'revision_id' or replay->>'replayed'<>'true' then
  raise exception 'exact replay must return the same revision'; end if;
 raise notice 'PASS: exact ordered blocks and links replay';
 reordered:=jsonb_build_array(links->1,links->0,links->1);
 replay:=pg_temp.person_write('answer','synthetic-exact-replay','internal',manifest,blocks,reordered);
 if replay->>'revision_id' is distinct from first_write->>'revision_id' or replay->>'replayed'<>'true' then
  raise exception 'equivalent edge sets must replay'; end if;
 raise notice 'PASS: reordered and duplicate links normalize to the same edge set';

 changed:=jsonb_set(blocks,'{0,content,text}','"Synthetic altered recommendation"');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L::jsonb,%L::jsonb,%L::jsonb)',
  'answer','synthetic-exact-replay','internal',manifest,changed,links),
  'artifact_revision_replay_mismatch','changed recommendation cannot replay');
 changed:=jsonb_set(blocks,'{0,claims,0,value}','2');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L::jsonb,%L::jsonb,%L::jsonb)',
  'answer','synthetic-exact-replay','internal',manifest,changed,links),
  'artifact_revision_replay_mismatch','changed claim value cannot replay');
 changed:=jsonb_set(blocks,'{0,claims,0,supportIds}','["synthetic-new-support"]');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L::jsonb,%L::jsonb,%L::jsonb)',
  'answer','synthetic-exact-replay','internal',manifest,changed,links),
  'artifact_revision_replay_mismatch','changed claim support cannot replay');
 changed:=jsonb_build_array(blocks->1,blocks->0);
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L::jsonb,%L::jsonb,%L::jsonb)',
  'answer','synthetic-exact-replay','internal',manifest,changed,links),
  'artifact_revision_replay_mismatch','changed block ordering cannot replay');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L::jsonb,%L::jsonb,%L::jsonb)',
  'answer','synthetic-exact-replay','internal',manifest,blocks,jsonb_build_array(links->0)),
  'artifact_revision_replay_mismatch','removed ancestor cannot replay');
 changed:=jsonb_set(links,'{0,blockKey}','"second"');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L::jsonb,%L::jsonb,%L::jsonb)',
  'answer','synthetic-exact-replay','internal',manifest,blocks,changed),
  'artifact_revision_replay_mismatch','changed block anchor cannot replay');
 -- An additional valid parent must not be silently ignored on replay.
 parent_manifest:=jsonb_set(parent_manifest,'{template,templateVersionId}','"synthetic-second-parent"');
 parent:=pg_temp.person_write('answer','synthetic-replay-second-parent','internal',parent_manifest,
  jsonb_build_array(pg_temp.block('parent','paragraph','{"text":"Synthetic additional ancestry"}')));
 changed:=links||jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',parent->>'revision_id'));
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L::jsonb,%L::jsonb,%L::jsonb)',
  'answer','synthetic-exact-replay','internal',manifest,blocks,changed),
  'artifact_revision_replay_mismatch','additional ancestor cannot replay');
 -- A rights version omitted by the caller is resolved at each call, never silently repinned.
 manifest:=jsonb_set(manifest,'{sources,0,rightsVersionId}','null');
 replay:=pg_temp.person_write('answer','synthetic-unpinned-rights','internal',manifest,blocks);
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 select organization_id,source_version_id,revision+1,operations,purposes,audience,now(),evidence_kind,evidence_reference,evidence_sha256,created_by
 from private.source_rights_versions where id=pg_temp.rights_of(source_id);
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L::jsonb,%L::jsonb)',
  'answer','synthetic-unpinned-rights','internal',manifest,blocks),
  'artifact_revision_replay_mismatch','resolved rights pin changed cannot replay');
 if (select count(*) from public.artifact_revisions where artifact_id=(first_write->>'artifact_id')::uuid)<>1 then
  raise exception 'rejected replay must not create a new revision'; end if;
end $$;
select 'PASS: artifact_revision_exact_replay' as result;
rollback;
