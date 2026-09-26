-- Stage 19, increment 2: the artifact revision protocol (migration A). The done criteria of the plan
-- on synthetic rows: derivation from sources A and B requires both at read time; a new source
-- version leaves the old revision byte-identical and stale while a revision on the new head is
-- current; a revision without claim, source or calculation is refused and an informational answer
-- accepted; rendered bytes record the sha256 the reader returns; the head reader and the exact
-- reader decide the same release; an external revision is blocked until a confirm decision names its
-- exact fingerprint; replay by fingerprint; immutability; the worker and person commands refused
-- outside their authority; the projection of the four legacy stores with the legacy fingerprint
-- verbatim and no fabricated link; an idempotent backfill. Everything rolls back.
begin;
\ir support/contextual_adoption_setup.sql
\ir support/execution_method_fixture.sql
\ir support/execution_approval.sql
set local lock_timeout='5s';
set local statement_timeout='120s';

-- Organization a11b...9000-1, owner a11b...8000-1, plain member a11b...8000-2 (no access to the work),
-- work a11b...9000-2 with intake session a11b...9000-3 and message a11b...9000-7. A foreign tenant
-- with its own work, session and leased job proves the cross-tenant refusals.
insert into auth.users(id,email) values('a4192000-0000-4000-8000-000000000001','artifact-foreign@example.invalid');
insert into public.organizations(id,organization_type,name,created_by) values('a4192000-0000-4000-9000-000000000001','company','Synthetic foreign artifact tenant','a4192000-0000-4000-8000-000000000001');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('a4192000-0000-4000-9000-000000000001','a4192000-0000-4000-8000-000000000001','owner','active',now());
insert into public.capital_projects(id,organization_id,project_name,created_by) values('a4192000-0000-4000-9000-000000000002','a4192000-0000-4000-9000-000000000001','Synthetic foreign work','a4192000-0000-4000-8000-000000000001');
insert into public.document_intake_sessions(id,organization_id,capital_project_id,started_by,journey) values('a4192000-0000-4000-9000-000000000003','a4192000-0000-4000-9000-000000000001','a4192000-0000-4000-9000-000000000002','a4192000-0000-4000-8000-000000000001','company');
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by)
values('a4192000-0000-4000-9000-000000000004','a4192000-0000-4000-9000-000000000001','a4192000-0000-4000-9000-000000000003',1,'manual','synthetic-artifact','a4192000-0000-4000-8000-000000000001'),
 ('a4192000-0000-4000-9000-000000000014','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',91,'manual','synthetic-artifact','a11b0000-0000-4000-8000-000000000001');
create temporary table arp(name text primary key,value jsonb not null);
grant select on arp to authenticated,anon;
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_user::text,''),true);
 perform set_config('request.jwt.claims',case when p_user is null then '' else jsonb_build_object('sub',p_user,'role','authenticated','aal','aal1')::text end,true);
end $$;
-- The job authority binding takes the signed-in subject: each job is inserted as its own tenant's owner.
select pg_temp.act_as('a4192000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values('a4192000-0000-4000-9000-000000000005','a4192000-0000-4000-9000-000000000001','a4192000-0000-4000-9000-000000000003','a4192000-0000-4000-9000-000000000004','agent_operation_brief','queued','{}');
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values('a4192000-0000-4000-9000-000000000015','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a4192000-0000-4000-9000-000000000014','agent_operation_brief','queued','{}');
update public.processing_jobs set status='leased',capability_sha256=extensions.digest('synthetic-artifact-foreign-token','sha256'),lease_expires_at=now()+interval '10 minutes' where id='a4192000-0000-4000-9000-000000000005';
update public.processing_jobs set status='leased',capability_sha256=extensions.digest('synthetic-artifact-worker-token-v1','sha256'),lease_expires_at=now()+interval '10 minutes' where id='a4192000-0000-4000-9000-000000000015';
create function pg_temp.val(p_name text,p_path text) returns text language sql as $$ select value#>>string_to_array(p_path,'.') from arp where name=p_name $$;
create function pg_temp.remember(p_name text,p_value jsonb) returns void language sql as $$
 insert into arp values(p_name,p_value) on conflict(name) do update set value=excluded.value $$;

-- One immutable version of a logical source with verified bytes (a null logical id starts a source);
-- the stage 7 factory of contextual_adoption_setup declares full rights on every version.
create function pg_temp.source_version(p_name text,p_logical uuid) returns uuid language plpgsql as $$
declare v uuid:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:test:artifact-source:'||p_name);hash text:=encode(extensions.digest(p_name,'sha256'),'hex');
begin
 insert into public.source_documents(id,organization_id,intake_session_id,logical_source_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status)
 values(v,'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',p_logical,
  'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/'||p_name||'.txt','Synthetic source','text/plain',1,hash,'a11b0000-0000-4000-8000-000000000001','ready');
 insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
 values('a11b0000-0000-4000-9000-000000000001',v,gen_random_uuid(),hash,1,'synthetic-only-'||p_name);
 return v;
end $$;
create function pg_temp.rights_of(p_version uuid) returns uuid language sql as $$
 select r.id from private.source_rights_versions r where r.source_version_id=p_version order by r.revision desc limit 1 $$;
create function pg_temp.source_ref(p_version uuid) returns jsonb language sql as $$
 select jsonb_build_object('sourceVersionId',p_version,'rightsVersionId',pg_temp.rights_of(p_version)) $$;

-- The manifest of the contract, every key present.
create function pg_temp.manifest(p_kind text,p_audience text,p_sources jsonb,p_claims jsonb,p_bytes jsonb default null,p_format text default 'json',p_extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
 select jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind',p_kind,'audience',p_audience,'format',p_format,'bytes',p_bytes,
  'method',null,'execution',null,'inputSnapshot',null,'institutionalResult',null,'sources',p_sources,'claims',p_claims,'traces','[]'::jsonb,'template',null,
  'provenance',jsonb_build_object('producer','synthetic-test','jobId',null,'taskRunId',null,'messageId',null,'capability',null),'legacy',null)||p_extra;
$$;
create function pg_temp.claim(p_id text,p_value jsonb default '1'::jsonb) returns jsonb language sql as $$
 select jsonb_build_object('claimId',p_id,'kind','fact','value',p_value,'unit',null,'period',null,'supportIds','[]'::jsonb) $$;
create function pg_temp.block(p_key text,p_kind text,p_content jsonb,p_claims jsonb default '[]'::jsonb) returns jsonb language sql as $$
 select jsonb_build_object('blockKey',p_key,'kind',p_kind,'content',p_content,'claims',p_claims) $$;
-- The claims summary the manifest must carry for these blocks.
create function pg_temp.summary(p_blocks jsonb) returns jsonb language sql as $$
 select coalesce(jsonb_agg(jsonb_build_object('blockKey',b.value->>'blockKey','claimIds',(select jsonb_agg(c->'claimId') from jsonb_array_elements(b.value->'claims') c)) order by b.ordinality),'[]'::jsonb)
 from jsonb_array_elements(p_blocks) with ordinality b where jsonb_array_length(b.value->'claims')>0 $$;
-- A person's write, as the owner, through the public entry point.
create function pg_temp.person_write(p_kind text,p_subject text,p_audience text,p_manifest jsonb,p_blocks jsonb,p_links jsonb default '[]'::jsonb,p_sha text default null,p_len bigint default null) returns jsonb language plpgsql as $$
declare r jsonb;
begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 set local role authenticated;
 r:=public.create_artifact_revision_v1('a11b0000-0000-4000-9000-000000000002',p_kind,p_subject,p_audience,p_manifest,p_blocks,p_links,p_sha,p_len);
 reset role;
 return r;
end $$;
create function pg_temp.read_as(p_user uuid,p_revision uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
 perform pg_temp.act_as(p_user);
 set local role authenticated;
 r:=public.read_artifact_revision_v1(p_revision);
 reset role;
 return r;
end $$;
create function pg_temp.head_as(p_user uuid,p_kind text,p_subject text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
 perform pg_temp.act_as(p_user);
 set local role authenticated;
 r:=public.read_artifact_head_v1('a11b0000-0000-4000-9000-000000000002',p_kind,p_subject);
 reset role;
 return r;
end $$;
-- The named refusal of a statement, or a failure when it is accepted or refused otherwise.
create function pg_temp.refused(p_sql text,p_error text,p_test text) returns void language plpgsql as $$
declare msg text;
begin
 begin
  execute p_sql;
 exception when others then
  get stacked diagnostics msg=message_text;
  if msg like p_error||'%' then reset role; raise notice 'PASS: % (%)',p_test,p_error; return; end if;
  reset role;
  raise exception '% refused with % instead of %',p_test,msg,p_error;
 end;
 reset role;
 raise exception '% was accepted',p_test;
end $$;

select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select pg_temp.remember('source_a',to_jsonb(pg_temp.source_version('balancete-v1',null)));
select pg_temp.remember('source_b',to_jsonb(pg_temp.source_version('contrato-v1',null)));

-- 1. A person writes an answer derived from sources A and B, with a claim; the reader returns it
-- whole: internal release, current freshness, no restriction, the blocks and the links.
do $$ declare m jsonb;b jsonb;r jsonb;x jsonb;a uuid:=pg_temp.val('source_a','')::uuid;bb uuid:=pg_temp.val('source_b','')::uuid;
begin
 b:=jsonb_build_array(pg_temp.block('lead','paragraph','{"text":"Alavancagem dentro do limite do covenant."}'),
  pg_temp.block('leverage','number','{"label":"Dívida líquida / EBITDA","value":"2,1x"}',jsonb_build_array(pg_temp.claim('leverage-2026','2.1'))));
 m:=pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(a),pg_temp.source_ref(bb)),pg_temp.summary(b));
 r:=pg_temp.person_write('answer','q1','internal',m,b,jsonb_build_array(jsonb_build_object('kind','source_version','blockKey','leverage','sourceVersionId',a,'rightsVersionId',pg_temp.rights_of(a))));
 if (r->>'replayed')::boolean or (r->>'revision_no')::integer<>1 then raise exception 'first write not revision 1: %',r; end if;
 perform pg_temp.remember('r1',r);perform pg_temp.remember('m1',m);
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',(r->>'revision_id')::uuid);
 if x->>'release'<>'internal' or x->>'freshness'<>'current' or jsonb_typeof(x->'restriction')<>'null' or not (x->>'isHead')::boolean
  or x#>>'{revision,origin}'<>'person' or x#>>'{revision,createdBy}'<>'a11b0000-0000-4000-8000-000000000001'
  or x#>'{revision,manifest}'<>m or x#>>'{revision,manifestFingerprint}'<>encode(extensions.digest(convert_to(m::text,'utf8'),'sha256'),'hex')
  or jsonb_array_length(x->'blocks')<>2 or x#>>'{blocks,1,blockKey}'<>'leverage' or x#>>'{blocks,1,contentFingerprint}'<>encode(extensions.digest(convert_to((b->1->'content')::text,'utf8'),'sha256'),'hex')
  or (select count(*) from jsonb_array_elements(x->'links') l where l->>'kind'='source_version' and jsonb_typeof(l->'blockId')='null')<>2
  or (select count(*) from jsonb_array_elements(x->'links') l where l->>'kind'='source_version' and jsonb_typeof(l->'blockId')='string')<>1
 then raise exception 'reader did not return the written revision: %',x; end if;
 if (select count(*) from private.artifact_dependency_links where revision_id=(r->>'revision_id')::uuid)<>3 then raise exception 'links written: %',(select count(*) from private.artifact_dependency_links where revision_id=(r->>'revision_id')::uuid); end if;
 raise notice 'PASS: person write of an answer derived from A and B, read whole with release, freshness, blocks and links';
end $$;

-- 2. Replay by manifest fingerprint: the same manifest returns the existing revision and adds nothing.
do $$ declare r jsonb;before bigint:=(select count(*) from public.artifact_revisions);b jsonb;
begin
 b:=jsonb_build_array(pg_temp.block('lead','paragraph','{"text":"Alavancagem dentro do limite do covenant."}'),
  pg_temp.block('leverage','number','{"label":"Dívida líquida / EBITDA","value":"2,1x"}',jsonb_build_array(pg_temp.claim('leverage-2026','2.1'))));
 r:=pg_temp.person_write('answer','q1','internal',(select value from arp where name='m1'),b);
 if not (r->>'replayed')::boolean or r->>'revision_id'<>pg_temp.val('r1','revision_id') or (select count(*) from public.artifact_revisions)<>before then
  raise exception 'replay wrote or returned another revision: %',r; end if;
 raise notice 'PASS: the same manifest replays the existing revision';
end $$;

-- 3. Immutability of revisions, blocks and links, by any role.
do $$ declare rev uuid:=pg_temp.val('r1','revision_id')::uuid;attempt text;refused boolean;
begin
 foreach attempt in array array[
  format('update public.artifact_revisions set audience=%L where id=%L','external',rev),
  format('delete from public.artifact_revisions where id=%L',rev),
  format('update public.artifact_blocks set content=%L where revision_id=%L','{"forged":true}',rev),
  format('delete from public.artifact_blocks where revision_id=%L',rev),
  format('update private.artifact_dependency_links set block_id=null where revision_id=%L',rev),
  format('delete from private.artifact_dependency_links where revision_id=%L',rev),
  format('update public.artifacts set subject=%L where head_revision_id=%L','forged',rev),
  format('delete from public.artifacts where head_revision_id=%L',rev)] loop
  refused:=false;
  begin execute attempt; exception when others then refused:=sqlerrm in ('artifact_revision_immutable','artifact_identity_immutable'); end;
  if not refused then raise exception 'history changed: %',attempt; end if;
 end loop;
 raise notice 'PASS: revisions, blocks, links and the artifact identity are immutable';
end $$;

-- 4. The validator, with the names of the contract.
do $$ declare b jsonb:=jsonb_build_array(pg_temp.block('t','paragraph','{"text":"x"}',jsonb_build_array(pg_temp.claim('c1'))));a uuid:=pg_temp.val('source_a','')::uuid;
begin
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','answer','v1','internal',pg_temp.manifest('answer','internal','[]',pg_temp.summary(b),jsonb_build_object('sha256',repeat('a',64),'byteLength',10,'storage',jsonb_build_object('bucket','case-artifacts','path','x')),null),b),'bytes_without_format','bytes without a format');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','answer','v1','internal',pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(a),pg_temp.source_ref(a)),pg_temp.summary(b)),b),'duplicate_source','a duplicate source');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','answer','v1','internal',pg_temp.manifest('answer','internal','[]','[]'),b),'claims_summary_mismatch','a claims summary that does not name the block claims');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','answer','v1','internal',pg_temp.manifest('answer','internal','[]',pg_temp.summary(b),null,'json',jsonb_build_object('extra',1)),b),'artifact_manifest_schema_invalid','an unknown manifest key');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','answer','v1','external',pg_temp.manifest('answer','internal','[]',pg_temp.summary(b)),b),'audience_mismatch','an audience that differs from the manifest');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','execution_result','v1','internal',pg_temp.manifest('execution_result','internal','[]',pg_temp.summary(b)),b),'execution_result_without_execution','an execution result without its execution');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','answer','v1','internal',pg_temp.manifest('answer','internal','[]',pg_temp.summary(b),null,'json',jsonb_build_object('legacy',jsonb_build_object('table','deal_state_objects','id','a11b0000-0000-4000-9000-000000000003','fingerprint',repeat('b',64),'evidence','[]'::jsonb))),b),'artifact_manifest_legacy_reserved','a person writing a legacy label');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L,%L)','answer','v1','internal',pg_temp.manifest('answer','internal','[]',pg_temp.summary(b)),b,jsonb_build_array(jsonb_build_object('kind','source_version','sourceVersionId',a,'rightsVersionId',null))),'artifact_link_not_in_manifest','a source link the manifest does not declare');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L,%L)','answer','v1','internal',pg_temp.manifest('answer','internal','[]',pg_temp.summary(b)),b,jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',gen_random_uuid()))),'artifact_link_target_not_found','a derivation from a revision that does not exist in this organization');
 -- The ids zod's z.uuid() refuses (version 0, variant 0) are refused here too.
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','answer','v1','internal',pg_temp.manifest('answer','internal',jsonb_build_array(jsonb_build_object('sourceVersionId','a4192000-0000-0000-0000-000000000001','rightsVersionId',null)),pg_temp.summary(b)),b),'artifact_manifest_source_invalid','a source version id that is not an RFC 9562 uuid');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','answer','v1','internal',pg_temp.manifest('answer','internal','[]',pg_temp.summary(b),null,'json',jsonb_build_object('provenance',jsonb_build_object('producer','synthetic-test','jobId','a4192000-0000-4000-0000-000000000001','taskRunId',null,'messageId',null,'capability',null))),b),'artifact_manifest_provenance_invalid','a job id with an RFC variant nibble of 0');
 -- The contract's subject is any text of 1 to 300 characters, spaces included.
 if (pg_temp.person_write('answer','Memo de estrutura 2026','internal',pg_temp.manifest('answer','internal','[]',pg_temp.summary(b)),b)->>'revision_no')::integer<>1 then
  raise exception 'subject with spaces refused'; end if;
 raise notice 'PASS: the validator refuses the contract''s violations with its names, non-RFC ids included; a subject with spaces is accepted';
end $$;

-- 5. Substance: an informational answer of sections and paragraphs is accepted; a number without a
-- claim, a paragraph carrying a number, and a work product with nothing are refused.
do $$ declare r jsonb;b jsonb;
begin
 b:=jsonb_build_array(pg_temp.block('intro','section','{"title":"Esclarecimento"}'),pg_temp.block('p1','paragraph','{"text":"O prazo segue o cronograma acordado em 2026-03-01, sem alteração."}'));
 r:=pg_temp.person_write('answer','clarification','internal',pg_temp.manifest('answer','internal','[]','[]'),b);
 if (r->>'replayed')::boolean then raise exception 'informational answer replayed'; end if;
 perform pg_temp.remember('informational',r);
 b:=jsonb_build_array(pg_temp.block('n','number','{"label":"Dívida","value":"3,4x"}'));
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','answer','v2','internal',pg_temp.manifest('answer','internal','[]','[]'),b),'artifact_revision_without_substance','a number without a claim');
 b:=jsonb_build_array(pg_temp.block('p','paragraph','{"text":"A margem ficou em 14% no trimestre."}'));
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','answer','v2','internal',pg_temp.manifest('answer','internal','[]','[]'),b),'artifact_revision_without_substance','a paragraph carrying a number without a claim');
 b:=jsonb_build_array(pg_temp.block('p','paragraph','{"text":"Sem afirmação."}'));
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','work_product','v2','internal',pg_temp.manifest('work_product','internal','[]','[]'),b),'artifact_revision_without_substance','a work product without claim, source or calculation');
 raise notice 'PASS: informational answer accepted; number, paragraph with number and empty work product refused';
end $$;

-- 6. Rights: a source the reader cannot use withholds the content and names the link; the same on
-- a revision that derives from the restricted one; the rights restored, the content returns.
do $$ declare x jsonb;bb uuid:=pg_temp.val('source_b','')::uuid;rev uuid:=pg_temp.val('r1','revision_id')::uuid;r jsonb;b jsonb;link uuid;
begin
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 values('a11b0000-0000-4000-9000-000000000001',bb,2,array['process'],array['analysis'],'authorized_workspace',clock_timestamp(),'human_declaration',gen_random_uuid(),repeat('c',64),'a11b0000-0000-4000-8000-000000000001');
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',rev);
 select l.id into link from private.artifact_dependency_links l where l.revision_id=rev and l.link_kind='source_version' and l.source_version_id=bb and l.block_id is null;
 if x#>>'{restriction,kind}'<>'source_rights' or not (x#>'{restriction,linkIds}') @> to_jsonb(array[link]) or (x#>'{restriction,linkIds}') @> to_jsonb((select array_agg(l.id) from private.artifact_dependency_links l where l.revision_id=rev and l.source_version_id<>bb))
  or jsonb_typeof(x#>'{revision,manifest}')<>'null' or jsonb_array_length(x->'blocks')<>0 or x#>>'{revision,manifestFingerprint}'<>pg_temp.val('r1','manifest_fingerprint')
 then raise exception 'restricted source did not withhold the content or name the link: %',x; end if;
 -- A document derived from that answer requires the same sources.
 b:=jsonb_build_array(pg_temp.block('summary','paragraph','{"text":"Resumo derivado."}',jsonb_build_array(pg_temp.claim('leverage-2026','2.1'))));
 r:=pg_temp.person_write('document','memo','internal',pg_temp.manifest('document','internal','[]',pg_temp.summary(b)),b,jsonb_build_array(jsonb_build_object('kind','artifact_revision','derivedFromRevisionId',rev)));
 perform pg_temp.remember('derived',r);
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',(r->>'revision_id')::uuid);
 if x#>>'{restriction,kind}'<>'source_rights' or not (x#>'{restriction,linkIds}') @> to_jsonb(array[link]) or jsonb_array_length(x->'blocks')<>0 then
  raise exception 'derived revision did not inherit the restriction of its ancestor: %',x; end if;
 insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
 values('a11b0000-0000-4000-9000-000000000001',bb,3,array['read','process','store','derive','export'],array['analysis','retrieval','export'],'authorized_workspace',clock_timestamp(),'human_declaration',gen_random_uuid(),repeat('d',64),'a11b0000-0000-4000-8000-000000000001');
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',rev);
 if jsonb_typeof(x->'restriction')<>'null' or jsonb_array_length(x->'blocks')<>2 then raise exception 'restored rights did not return the content: %',x; end if;
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',(r->>'revision_id')::uuid);
 if jsonb_typeof(x->'restriction')<>'null' or jsonb_array_length(x->'blocks')<>1 then raise exception 'restored rights did not return the derived content: %',x; end if;
 raise notice 'PASS: derived from A and B requires both at read time, on the revision and on what derives from it';
end $$;

-- 7. A new version of source A: the old revision stays byte-identical and turns stale; a revision on
-- the new head is current and becomes the head, numbered 2 after 1.
do $$ declare a uuid:=pg_temp.val('source_a','')::uuid;a2 uuid;bb uuid:=pg_temp.val('source_b','')::uuid;rev uuid:=pg_temp.val('r1','revision_id')::uuid;
 before jsonb;after jsonb;x jsonb;r jsonb;b jsonb;m jsonb;
begin
 select to_jsonb(r0)||jsonb_build_object('blocks',(select jsonb_agg(to_jsonb(k) order by k.block_no) from public.artifact_blocks k where k.revision_id=r0.id)) into before from public.artifact_revisions r0 where r0.id=rev;
 a2:=pg_temp.source_version('balancete-v2',(select source_id from public.source_versions where id=a));
 if (select version_no from public.source_versions where id=a2)<>2 then raise exception 'setup: the re-upload is not version 2 of the same logical source'; end if;
 select to_jsonb(r0)||jsonb_build_object('blocks',(select jsonb_agg(to_jsonb(k) order by k.block_no) from public.artifact_blocks k where k.revision_id=r0.id)) into after from public.artifact_revisions r0 where r0.id=rev;
 if before<>after then raise exception 'a new source version changed the old revision'; end if;
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',rev);
 if x->>'freshness'<>'stale' or x->>'release'<>'internal' or jsonb_array_length(x->'blocks')<>2 then raise exception 'old revision is not stale and readable: %',x; end if;
 b:=jsonb_build_array(pg_temp.block('lead','paragraph','{"text":"Alavancagem dentro do limite do covenant, balancete atualizado."}'),
  pg_temp.block('leverage','number','{"label":"Dívida líquida / EBITDA","value":"2,0x"}',jsonb_build_array(pg_temp.claim('leverage-2026','2.0'))));
 m:=pg_temp.manifest('answer','internal',jsonb_build_array(pg_temp.source_ref(a2),pg_temp.source_ref(bb)),pg_temp.summary(b));
 r:=pg_temp.person_write('answer','q1','internal',m,b);
 perform pg_temp.remember('r2',r);
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',(r->>'revision_id')::uuid);
 if (r->>'revision_no')::integer<>2 or x#>>'{revision,previousRevisionId}'<>rev::text or x->>'freshness'<>'current' or not (x->>'isHead')::boolean
  or (select head_revision_id from public.artifacts where id=(r->>'artifact_id')::uuid)<>(r->>'revision_id')::uuid then raise exception 'revision on the new head is not current or not the head: %',x; end if;
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',rev);
 if (x->>'isHead')::boolean or x->>'freshness'<>'stale' then raise exception 'old revision became the head: %',x; end if;
 raise notice 'PASS: a new source version leaves the old revision byte-identical and stale; the revision on the new head is current';
end $$;

-- 8. Rendered bytes: the manifest fixes the sha256, the row records it, the reader returns it; a
-- disagreement between the column and the manifest is refused.
do $$ declare m jsonb;b jsonb;r jsonb;x jsonb;sha text:=encode(extensions.digest('synthetic workbook bytes','sha256'),'hex');
begin
 b:=jsonb_build_array(pg_temp.block('sheet','table','{"rows":[["Dívida líquida","1200"]]}',jsonb_build_array(pg_temp.claim('net-debt-2025','1200'))));
 m:=pg_temp.manifest('workbook','internal','[]',pg_temp.summary(b),jsonb_build_object('sha256',sha,'byteLength',2048,'rendered',jsonb_build_object('renderer','offroad-decision-workbook','rendererVersion','test-v1','deterministicInputs',jsonb_build_object('locale','pt-BR','contract',repeat('e',64)))),'xlsx');
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L,%L,%L,%L)','workbook','wb','internal',m,b,'[]',repeat('f',64),2048),'bytes_mismatch','a content sha256 that differs from the manifest');
 r:=pg_temp.person_write('workbook','wb','internal',m,b,'[]',sha,2048);
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',(r->>'revision_id')::uuid);
 if x#>>'{revision,contentSha256}'<>sha or (x#>>'{revision,byteLength}')::bigint<>2048 or x#>>'{revision,manifest,bytes,sha256}'<>sha then raise exception 'rendered bytes not recorded: %',x; end if;
 raise notice 'PASS: rendered bytes record the sha256 the reader must verify';
end $$;

-- 9. Release: an external revision is blocked for the head reader and the exact reader alike until a
-- confirm decision names its exact fingerprint; then both say released. Internal stays internal.
do $$ declare m jsonb;b jsonb;r jsonb;x jsonb;h jsonb;plan uuid;run uuid;art uuid;
begin
 b:=jsonb_build_array(pg_temp.block('teaser','section','{"title":"Teaser"}',jsonb_build_array(pg_temp.claim('revenue-2025','980'))));
 m:=pg_temp.manifest('material','external','[]',pg_temp.summary(b));
 r:=pg_temp.person_write('material','teaser','external',m,b);
 perform pg_temp.remember('external',r);
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',(r->>'revision_id')::uuid);
 h:=pg_temp.head_as('a11b0000-0000-4000-8000-000000000001','material','teaser');
 if x->>'release'<>'blocked' or h->>'release'<>'blocked' or x#>>'{restriction,kind}'<>'release' or jsonb_array_length(x->'blocks')<>0 or jsonb_typeof(x#>'{revision,manifest}')<>'null'
  or h#>>'{revision,id}'<>r->>'revision_id' or h->>'freshness'<>x->>'freshness' then raise exception 'external revision without approval is not blocked alike: % %',x,h; end if;
 -- The approval fact that exists today: a confirm decision on the exact fingerprint (a synthetic
 -- decision row bound to a synthetic legacy artifact row; stage 20 binds approvals to revisions).
 plan:=pg_temp.fixture_execution_plan('a11b0000-0000-4000-9000-000000000003');
 insert into public.capital_project_task_runs(id,organization_id,capital_project_id,plan_id,plan_task_id,attempt_no,status,trigger_event)
 select 'a4192000-0000-4000-9000-000000000041',t.organization_id,t.capital_project_id,t.plan_id,t.id,1,'queued','{"synthetic":true}'
 from public.capital_project_plan_tasks t where t.plan_id=plan order by t.ordinal limit 1;
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,processing_job_id,created_by_kind)
 values('a4192000-0000-4000-9000-000000000051','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002',plan,'a4192000-0000-4000-9000-000000000041','alternative_map','synthetic.v1',1,'pending_confirmation',repeat('1',64),repeat('2',64),'{"synthetic":true}','a4192000-0000-4000-9000-000000000015','worker');
 insert into public.capital_project_artifact_decisions(organization_id,capital_project_id,artifact_id,artifact_fingerprint,decision,decided_by)
 values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','a4192000-0000-4000-9000-000000000051',r->>'manifest_fingerprint','confirm','a11b0000-0000-4000-8000-000000000001');
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',(r->>'revision_id')::uuid);
 h:=pg_temp.head_as('a11b0000-0000-4000-8000-000000000001','material','teaser');
 if x->>'release'<>'released' or h->>'release'<>'released' or jsonb_typeof(x->'restriction')<>'null' or jsonb_array_length(x->'blocks')<>1 or h#>'{blocks}'<>x#>'{blocks}' then
  raise exception 'confirm on the exact fingerprint did not release for both readers: % %',x,h; end if;
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',pg_temp.val('r2','revision_id')::uuid);
 h:=pg_temp.head_as('a11b0000-0000-4000-8000-000000000001','answer','q1');
 if x->>'release'<>'internal' or h->>'release'<>'internal' or h#>>'{revision,id}'<>pg_temp.val('r2','revision_id') then raise exception 'internal revision not internal alike: % %',x,h; end if;
 raise notice 'PASS: external is blocked for preview and download alike, released after a confirm on its exact fingerprint; head and exact readers decide equal';
end $$;

-- 10. The worker command: refused with a capability that is not artifact-revision.v1, refused with
-- the job token of another organization, accepted through the job of the work with origin worker and
-- the provenance filled with the job.
do $$ declare m jsonb;b jsonb;r jsonb;x jsonb;a uuid:=pg_temp.val('source_b','')::uuid;
begin
 b:=jsonb_build_array(pg_temp.block('result','table','{"rows":[["DSCR","1,4x"]]}',jsonb_build_array(pg_temp.claim('dscr-2026','1.4'))));
 m:=pg_temp.manifest('work_product','advisor',jsonb_build_array(pg_temp.source_ref(a)),pg_temp.summary(b));
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 set local role authenticated;
 perform pg_temp.refused(format('select public.worker_create_artifact_revision_v1(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,null,null)',
  'a4192000-0000-4000-9000-000000000015','synthetic-artifact-worker-token-v1','dependency-recompute.v1','a11b0000-0000-4000-9000-000000000002','work_product','desk-note','advisor',m,b,'[]'),
  'artifact_revision_capability_required','the worker command under another capability');
 set local role authenticated;
 perform pg_temp.refused(format('select public.worker_create_artifact_revision_v1(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,null,null)',
  'a4192000-0000-4000-9000-000000000005','synthetic-artifact-foreign-token','artifact-revision.v1','a11b0000-0000-4000-9000-000000000002','work_product','desk-note','advisor',m,b,'[]'),
  'artifact_work_mismatch','the worker command with the job token of another organization');
 set local role authenticated;
 perform pg_temp.refused(format('select public.worker_create_artifact_revision_v1(%L,%L,%L,%L,%L,%L,%L,%L,%L,%L,null,null)',
  'a4192000-0000-4000-9000-000000000015','wrong-token-wrong-token-wrong-token','artifact-revision.v1','a11b0000-0000-4000-9000-000000000002','work_product','desk-note','advisor',m,b,'[]'),
  'job_capability_invalid','the worker command with a wrong token');
 set local role authenticated;
 r:=public.worker_create_artifact_revision_v1('a4192000-0000-4000-9000-000000000015','synthetic-artifact-worker-token-v1','artifact-revision.v1','a11b0000-0000-4000-9000-000000000002','work_product','desk-note','advisor',m,b,'[]',null,null);
 reset role;
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',(r->>'revision_id')::uuid);
 if x#>>'{revision,origin}'<>'worker' or jsonb_typeof(x#>'{revision,createdBy}')<>'null' or x#>>'{revision,manifest,provenance,jobId}'<>'a4192000-0000-4000-9000-000000000015'
  or x#>>'{revision,manifest,provenance,capability}'<>'artifact-revision.v1' or x#>>'{revision,manifest,provenance,producer}'<>'synthetic-test' or x->>'release'<>'internal'
 then raise exception 'worker revision not as written: %',x; end if;
 raise notice 'PASS: worker command refused under another capability, another organization and a wrong token; accepted with origin worker and the job in the provenance';
end $$;

-- 11. Authority: a member without work access can neither write nor read; anonymous reads nothing;
-- the tables read through the work's access and never take a client write.
do $$ declare b jsonb:=jsonb_build_array(pg_temp.block('t','paragraph','{"text":"x"}',jsonb_build_array(pg_temp.claim('c1'))));rev uuid:=pg_temp.val('r2','revision_id')::uuid;attempt text;refused boolean;
begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
 set local role authenticated;
 perform pg_temp.refused(format('select public.create_artifact_revision_v1(%L,%L,%L,%L,%L,%L,%L,null,null)','a11b0000-0000-4000-9000-000000000002','answer','other','internal',pg_temp.manifest('answer','internal','[]',pg_temp.summary(b)),b,'[]'),
  'artifact_revision_forbidden','the person command without work access');
 set local role authenticated;
 perform pg_temp.refused(format('select public.read_artifact_revision_v1(%L)',rev),'artifact_revision_not_found','the reader without work access');
 set local role authenticated;
 perform pg_temp.refused(format('select public.read_artifact_head_v1(%L,%L,%L)','a11b0000-0000-4000-9000-000000000002','answer','q1'),'artifact_revision_not_found','the head reader without work access');
 set local role authenticated;
 if exists(select 1 from public.artifacts) or exists(select 1 from public.artifact_revisions) or exists(select 1 from public.artifact_blocks) then raise exception 'member without access reads artifact rows'; end if;
 reset role;
 perform pg_temp.act_as(null);
 set local role anon;
 refused:=false;
 begin perform public.read_artifact_revision_v1(rev); exception when insufficient_privilege then refused:=true; end;
 if not refused then raise exception 'anonymous called the reader'; end if;
 reset role;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 set local role authenticated;
 if (select count(*) from public.artifact_revisions where id=rev)<>1 or (select count(*) from public.artifact_blocks where revision_id=rev)<>2 then raise exception 'owner cannot read through the tables'; end if;
 foreach attempt in array array[
  format('update public.artifact_revisions set audience=%L where id=%L','external',rev),
  format('delete from public.artifact_blocks where revision_id=%L',rev),
  format('insert into public.artifacts(organization_id,work_id,kind,subject) values(%L,%L,%L,%L)','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','answer','forged'),
  format('select * from private.artifact_dependency_links where revision_id=%L',rev)] loop
  refused:=false;
  begin execute attempt; exception when insufficient_privilege then refused:=true; end;
  if not refused then raise exception 'tenant touched the tables directly: %',attempt; end if;
 end loop;
 reset role;
 raise notice 'PASS: person command and readers refused without work access; tables read only through the work and never written by a client';
end $$;

-- 12. Projection of the four legacy stores on synthetic rows: the legacy fingerprint verbatim, the
-- evidence the row carries, no method, execution, input snapshot, source or bytes; an institutional
-- result names itself and is released once established. Outside the backfill the origin is the
-- writer's kind.
do $$ declare x jsonb;rev uuid;l record;
begin
 -- (a) capital_project_artifacts: the row of proof 9 was projected on insert.
 select r.id into rev from public.artifact_revisions r where r.legacy_ref->>'table'='capital_project_artifacts' and r.legacy_ref->>'id'='a4192000-0000-4000-9000-000000000051';
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',rev);
 if x#>>'{artifact,kind}'<>'work_product' or x#>>'{artifact,subject}'<>'alternative_map' or x#>>'{artifact,legacyOrigin,table}'<>'capital_project_artifacts'
  or x#>>'{revision,origin}'<>'worker' or x#>>'{revision,legacyRef,fingerprint}'<>repeat('2',64) or x#>'{revision,legacyRef}'<>x#>'{revision,manifest,legacy}'
  or x#>>'{revision,manifest,format}'<>'json' or jsonb_typeof(x#>'{revision,manifest,bytes}')<>'null' or jsonb_typeof(x#>'{revision,contentSha256}')<>'null'
  or x#>>'{revision,manifest,provenance,producer}'<>'legacy:capital_project_artifacts' or x#>>'{revision,manifest,provenance,jobId}'<>'a4192000-0000-4000-9000-000000000015'
  or x#>>'{revision,manifest,provenance,taskRunId}'<>'a4192000-0000-4000-9000-000000000041'
  or not (x#>'{revision,legacyRef,evidence}') @> '[{"key":"artifact_type","value":"alternative_map"},{"key":"input_fingerprint","value":"1111111111111111111111111111111111111111111111111111111111111111"},{"key":"evidence_ref_count","value":"0"}]'::jsonb
  or jsonb_array_length(x->'links')<>0 or jsonb_array_length(x->'blocks')<>0 or x->>'freshness'<>'current'
 then raise exception 'capital project artifact projection: %',x; end if;
 -- The decision of proof 9 sits on this row but names another fingerprint: this revision stays internal.
 if x->>'release'<>'internal' then raise exception 'legacy work product released without a decision on its fingerprint: %',x; end if;
 -- The real confirm command on a second pending row releases its revision, through the legacy fingerprint.
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,processing_job_id,created_by_kind)
 select 'a4192000-0000-4000-9000-000000000052',organization_id,capital_project_id,plan_id,task_run_id,'company_debt_diagnostic','synthetic.v1',1,'pending_confirmation',repeat('1',64),repeat('3',64),'{"synthetic":true}',processing_job_id,'worker'
 from public.capital_project_artifacts where id='a4192000-0000-4000-9000-000000000051';
 select r.id into rev from public.artifact_revisions r where r.legacy_ref->>'table'='capital_project_artifacts' and r.legacy_ref->>'id'='a4192000-0000-4000-9000-000000000052';
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 set local role authenticated;
 perform public.decide_capital_project_artifact('a4192000-0000-4000-9000-000000000052',repeat('3',64),'confirm');
 reset role;
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',rev);
 if x->>'release'<>'released' or x#>>'{revision,legacyRef,fingerprint}'<>repeat('3',64) then raise exception 'confirmed legacy row not released: %',x; end if;
 raise notice 'PASS: capital_project_artifacts projected with the legacy fingerprint verbatim, evidence and no link; the real confirm releases it';
end $$;

do $$ declare x jsonb;rev uuid;a uuid:=pg_temp.val('source_a','')::uuid;
begin
 -- (b) case_artifact_manifests: a source the manifest names stays evidence, never a link. The row is
 -- written by the plain member (the method fixture binds the owner as a worker execution account, so
 -- a row of the owner would project as origin worker).
 insert into public.case_artifact_manifests(id,organization_id,intake_session_id,processing_run_id,schema_version,locale,input_fingerprint,manifest_fingerprint,manifest,created_by)
 values('a4192000-0000-4000-9000-000000000061','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a4192000-0000-4000-9000-000000000014','2026.08.25-v4','pt-BR',repeat('4',64),repeat('5',64),
  jsonb_build_object('runId','a4192000-0000-4000-9000-000000000014','sources',jsonb_build_array(jsonb_build_object('documentId',a,'versionId','1','sha256',repeat('6',64))),
   'outputs',jsonb_build_array(jsonb_build_object('artifactId','case-state','kind','case_state','sha256',repeat('7',64)))),'a11b0000-0000-4000-8000-000000000002');
 select r.id into rev from public.artifact_revisions r where r.legacy_ref->>'table'='case_artifact_manifests' and r.legacy_ref->>'id'='a4192000-0000-4000-9000-000000000061';
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',rev);
 if x#>>'{artifact,kind}'<>'work_product' or x#>>'{artifact,subject}'<>'case-snapshot:a11b0000-0000-4000-9000-000000000003' or x#>>'{revision,origin}'<>'person'
  or x#>>'{revision,legacyRef,fingerprint}'<>repeat('5',64) or jsonb_array_length(x#>'{revision,manifest,sources}')<>0 or jsonb_array_length(x->'links')<>0
  or not (x#>'{revision,legacyRef,evidence}') @> jsonb_build_array(jsonb_build_object('key','source_document','value',a::text||':1:'||repeat('6',64)),jsonb_build_object('key','output','value','case_state:case-state:'||repeat('7',64)),jsonb_build_object('key','locale','value','pt-BR'))
  or x#>>'{revision,manifest,provenance,producer}'<>'legacy:case_artifact_manifests'
 then raise exception 'case manifest projection: %',x; end if;
 raise notice 'PASS: case_artifact_manifests projected as evidence only, with the legacy fingerprint verbatim';
end $$;

do $$ declare x jsonb;rev uuid;art jsonb;
begin
 -- (c) institutional_model_results: projected when it completes; names itself as the institutional
 -- result, links to it, and is released while established.
 insert into private.institutional_model_configurations(id,organization_id,capital_project_id,revision,configuration,configuration_fingerprint,status)
 values('a4192000-0000-4000-9000-000000000071','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002',1,'{"synthetic":true}',repeat('8',64),'review_required');
 insert into private.institutional_model_results(id,organization_id,capital_project_id,intake_session_id,configuration_id,configuration_fingerprint,source_manifest_fingerprint,requested_by)
 values('a11b0000-0000-4000-9000-000000000007','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000003',
  'a4192000-0000-4000-9000-000000000071',repeat('8',64),repeat('9',64),'a11b0000-0000-4000-8000-000000000001');
 if exists(select 1 from public.artifact_revisions r where r.legacy_ref->>'id'='a11b0000-0000-4000-9000-000000000007') then raise exception 'queued result projected'; end if;
 art:=jsonb_build_object('modelKind','institutional','version','institutional-workbook-snapshot.v1','fingerprint',repeat('a',64),
  'workbooks',jsonb_build_object('pt',jsonb_build_object('sha256',repeat('b',64),'byteSize',4096),'en',jsonb_build_object('sha256',repeat('c',64),'byteSize',4100)),
  'institutional',jsonb_build_object('activeScenarioId','a4192000-0000-4000-9000-000000000071','scenarios',jsonb_build_array(jsonb_build_object('configurationId','a4192000-0000-4000-9000-000000000071','configurationFingerprint',repeat('8',64),'outputFingerprint',repeat('d',64),'sourceBindings','[]'::jsonb))));
 update private.institutional_model_results set status='completed',artifact=art,produced_at=now() where id='a11b0000-0000-4000-9000-000000000007';
 select r.id into rev from public.artifact_revisions r where r.legacy_ref->>'table'='institutional_model_results' and r.legacy_ref->>'id'='a11b0000-0000-4000-9000-000000000007';
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',rev);
 if x#>>'{artifact,kind}'<>'model_result' or x#>>'{revision,legacyRef,fingerprint}'<>repeat('a',64) or x#>>'{revision,manifest,format}'<>'xlsx' or jsonb_typeof(x#>'{revision,contentSha256}')<>'null'
  or x#>>'{revision,manifest,institutionalResult,id}'<>'a11b0000-0000-4000-9000-000000000007' or x#>>'{revision,manifest,institutionalResult,configurationFingerprint}'<>repeat('8',64)
  or x#>>'{revision,manifest,provenance,messageId}'<>'a11b0000-0000-4000-9000-000000000007' or x#>>'{revision,origin}'<>'worker'
  or jsonb_array_length(x->'links')<>1 or x#>>'{links,0,kind}'<>'institutional_result' or jsonb_typeof(x#>'{revision,manifest,method}')<>'null' or jsonb_typeof(x#>'{revision,manifest,execution}')<>'null'
  or not (x#>'{revision,legacyRef,evidence}') @> jsonb_build_array(jsonb_build_object('key','workbook_sha256_pt','value',repeat('b',64)),jsonb_build_object('key','output_fingerprint','value',repeat('d',64)),jsonb_build_object('key','active_scenario_id','value','a4192000-0000-4000-9000-000000000071'))
  or x->>'release'<>'released' or x->>'freshness'<>'current'
 then raise exception 'institutional result projection: %',x; end if;
 raise notice 'PASS: institutional_model_results projected on completion, naming itself, released while established';
end $$;

do $$ declare x jsonb;rev uuid;
begin
 -- (d) deal_state_objects material_artifact: one revision per row, the materials as evidence.
 insert into public.deal_state_objects(id,organization_id,intake_session_id,object_type,object_version,status,input_fingerprint,object_fingerprint,payload,dependencies,created_by_kind)
 values('a4192000-0000-4000-9000-000000000081','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','material_artifact',1,'pending_confirmation',repeat('1',64),repeat('e',64),
  jsonb_build_object('schemaVersion','2026.08.29-v1','materials',jsonb_build_array(jsonb_build_object('kind','teaser','artifactFingerprint',repeat('f',64)),jsonb_build_object('kind','credit_profile')),
   'financialModel',jsonb_build_object('fingerprint',repeat('a',64),'workbooks',jsonb_build_object('pt',jsonb_build_object('sha256',repeat('b',64),'byteSize',10),'en',jsonb_build_object('sha256',repeat('c',64),'byteSize',11))),
   'materialTruth','{}'::jsonb,'dataRoom','{}'::jsonb),
  jsonb_build_array(jsonb_build_object('objectType','production_plan','objectFingerprint',repeat('d',64))),'worker');
 insert into public.deal_state_objects(organization_id,intake_session_id,object_type,object_version,status,input_fingerprint,object_fingerprint,payload,created_by_kind)
 values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','understanding_snapshot',1,'draft',repeat('1',64),repeat('2',64),'{"readiness":{"state":"ready"}}','worker');
 select r.id into rev from public.artifact_revisions r where r.legacy_ref->>'table'='deal_state_objects' and r.legacy_ref->>'id'='a4192000-0000-4000-9000-000000000081';
 if (select count(*) from public.artifact_revisions r where r.legacy_ref->>'table'='deal_state_objects')<>1 then raise exception 'deal state projection count'; end if;
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',rev);
 if x#>>'{artifact,kind}'<>'material' or x#>>'{artifact,subject}'<>'materials:a11b0000-0000-4000-9000-000000000003' or x#>>'{revision,legacyRef,fingerprint}'<>repeat('e',64) or x#>>'{revision,origin}'<>'worker'
  or jsonb_array_length(x->'links')<>0 or jsonb_typeof(x#>'{revision,manifest,bytes}')<>'null'
  or not (x#>'{revision,legacyRef,evidence}') @> jsonb_build_array(jsonb_build_object('key','material','value','teaser:'||repeat('f',64)),jsonb_build_object('key','material','value','credit_profile:unpinned'),jsonb_build_object('key','depends_on','value','production_plan:'||repeat('d',64)),jsonb_build_object('key','workbook_byte_size_en','value','11'))
  or x->>'release'<>'internal'
 then raise exception 'deal state material projection: %',x; end if;
 -- An approved package review naming the material fingerprint releases it.
 insert into public.deal_state_objects(organization_id,intake_session_id,object_type,object_version,status,input_fingerprint,object_fingerprint,payload,dependencies,created_by,created_by_kind)
 values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','package_review',1,'approved',repeat('1',64),repeat('3',64),
  jsonb_build_object('schemaVersion','2026.08.29-v1','approval',jsonb_build_object('scope','internal_material_package','artifactFingerprint',repeat('e',64))),
  jsonb_build_array(jsonb_build_object('objectType','material_artifact','objectFingerprint',repeat('e',64))),'a11b0000-0000-4000-8000-000000000001','user');
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',rev);
 if x->>'release'<>'released' then raise exception 'approved package review did not release the material: %',x; end if;
 raise notice 'PASS: deal_state_objects material projected as evidence only; an approved package review on its fingerprint releases it';
end $$;

-- 13. The backfill: a row inserted with the projection trigger off is projected by the backfill as
-- origin legacy; running the backfill again adds nothing.
do $$ declare counts jsonb;again jsonb;before bigint;x jsonb;rev uuid;
begin
 alter table public.capital_project_artifacts disable trigger artifact_revision_projection;
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,processing_job_id,created_by_kind)
 select 'a4192000-0000-4000-9000-000000000053',organization_id,capital_project_id,plan_id,task_run_id,'meeting_brief','synthetic.v1',1,'draft',repeat('1',64),repeat('4',64),'{"synthetic":true}',processing_job_id,'worker'
 from public.capital_project_artifacts where id='a4192000-0000-4000-9000-000000000051';
 alter table public.capital_project_artifacts enable trigger artifact_revision_projection;
 before:=(select count(*) from public.artifact_revisions);
 counts:=private.backfill_artifact_revisions_v1();
 if (counts->>'capitalProjectArtifacts')::integer<>1 or (counts->>'caseArtifactManifests')::integer<>0 or (counts->>'institutionalModelResults')::integer<>0 or (counts->>'dealStateMaterials')::integer<>0
  or (select count(*) from public.artifact_revisions)<>before+1 then raise exception 'backfill wrote other than the unprojected row: %',counts; end if;
 select r.id into rev from public.artifact_revisions r where r.legacy_ref->>'id'='a4192000-0000-4000-9000-000000000053';
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',rev);
 if x#>>'{revision,origin}'<>'legacy' or x#>>'{revision,legacyRef,fingerprint}'<>repeat('4',64) or x#>>'{revision,manifest,provenance,producer}'<>'legacy:capital_project_artifacts' then raise exception 'backfilled revision: %',x; end if;
 again:=private.backfill_artifact_revisions_v1();
 if again<>'{"capitalProjectArtifacts":0,"caseArtifactManifests":0,"institutionalModelResults":0,"dealStateMaterials":0}'::jsonb or (select count(*) from public.artifact_revisions)<>before+1 then
  raise exception 'second backfill added rows: %',again; end if;
 if current_setting('offroad.artifact_backfill',true)<>'off' then raise exception 'backfill flag left on'; end if;
 raise notice 'PASS: the backfill projects an unprojected row as legacy and adds nothing when run again';
end $$;

-- 14. Rights pins and the receipt's fingerprint. A source named without a rights version pins the
-- rights version the work uses today; with a committed execution in the manifest, the pin of that
-- execution for the source; a source with no rights version at all refuses the write. The result
-- fingerprint of an execution whose receipt exists is the receipt's, never one of the packet's own,
-- and the committed receipt is the approval fact that releases the execution result.
do $$ declare a2 uuid;orphan uuid;c jsonb;req jsonb;claim jsonb;r jsonb;x jsonb;m jsonb;b jsonb;pinned uuid;receipt text;exec uuid:='a4192000-0000-4000-9000-000000000091';
begin
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 a2:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:test:artifact-source:balancete-v2');
 -- (a) Without an execution: the pin is the rights version in force today.
 b:=jsonb_build_array(pg_temp.block('lead','paragraph','{"text":"Leitura do balancete atualizado."}',jsonb_build_array(pg_temp.claim('cash-2026','310'))));
 m:=pg_temp.manifest('answer','internal',jsonb_build_array(jsonb_build_object('sourceVersionId',a2,'rightsVersionId',null)),pg_temp.summary(b));
 r:=pg_temp.person_write('answer','q2','internal',m,b);
 select l.source_rights_version_id into pinned from private.artifact_dependency_links l where l.revision_id=(r->>'revision_id')::uuid and l.link_kind='source_version';
 if pinned is distinct from pg_temp.rights_of(a2) then raise exception 'unpinned source did not take the rights version in force: % vs %',pinned,pg_temp.rights_of(a2); end if;
 -- (b) A source version with no rights version at all: the write is refused, never stored unpinned.
 alter table public.source_versions disable trigger zzz_fixture_source_rights;
 orphan:=pg_temp.source_version('orphan-v1',null);
 alter table public.source_versions enable trigger zzz_fixture_source_rights;
 if exists(select 1 from private.source_rights_versions where source_version_id=orphan) then raise exception 'setup: orphan source has rights'; end if;
 m:=pg_temp.manifest('answer','internal',jsonb_build_array(jsonb_build_object('sourceVersionId',orphan,'rightsVersionId',null)),pg_temp.summary(b));
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','answer','q3','internal',m,b),'artifact_source_rights_unresolved','a source with no rights version to pin');
 if exists(select 1 from private.artifact_dependency_links where source_version_id=orphan) then raise exception 'unpinned link stored'; end if;
 -- (c) A committed execution pinning source A2: the request, the claim, the operation and the commit
 -- of the method fixture, exactly as the stage 18 projection test drives them.
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 c:=jsonb_set(pg_temp.execution_contract_fixture(exec),'{inputs,sources}',jsonb_build_array(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId',a2,'contentHash',(select declared_sha256 from public.source_versions where id=a2),'rightsRevision','1')));
 req:=private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',c::text,'{}');
 claim:=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(req->>'jobId')::uuid,60);
 perform private.reserve_execution_operation_v1((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,exec,claim->>'contractFingerprint','synthetic#calculate','test-v1','read_only',0,0);
 perform private.settle_execution_operation_v2((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,exec,claim->>'contractFingerprint','{"calculation":"synthetic artifact"}','succeeded','calculated',0,0);
 perform private.commit_work_execution_result_v1((req->>'jobId')::uuid,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',encode(extensions.digest('{}','sha256'),'hex'),'{"calculation":"synthetic artifact"}','succeeded','calculated');
 select x0.result_fingerprint into strict receipt from private.execution_result_receipts x0 where x0.execution_id=exec;
 b:=jsonb_build_array(pg_temp.block('alternatives','table','{"rows":[["A","2,1x"],["B","2,4x"]]}',jsonb_build_array(pg_temp.claim('alt-a','2.1'),pg_temp.claim('alt-b','2.4'))));
 m:=pg_temp.manifest('execution_result','internal',jsonb_build_array(jsonb_build_object('sourceVersionId',a2,'rightsVersionId',null)),pg_temp.summary(b),null,'json',
  jsonb_build_object('execution',jsonb_build_object('executionId',exec,'resultFingerprint',repeat('9',64),'inputFingerprint',encode(extensions.digest('{}','sha256'),'hex'))));
 perform pg_temp.refused(format('select pg_temp.person_write(%L,%L,%L,%L,%L)','execution_result','packet','internal',m,b),'execution_result_fingerprint_mismatch','a result fingerprint that is not the receipt''s');
 m:=jsonb_set(m,'{execution,resultFingerprint}',to_jsonb(receipt));
 r:=pg_temp.person_write('execution_result','packet','internal',m,b);
 select l.source_rights_version_id into pinned from private.artifact_dependency_links l where l.revision_id=(r->>'revision_id')::uuid and l.link_kind='source_version';
 if pinned is distinct from (select d.rights_version_id from private.execution_dependencies d where d.execution_id=exec and d.source_version_id=a2) or pinned is null then
  raise exception 'execution result did not take the pin of its execution: %',pinned; end if;
 x:=pg_temp.read_as('a11b0000-0000-4000-8000-000000000001',(r->>'revision_id')::uuid);
 if x->>'release'<>'released' or x->>'freshness'<>'current' or (select count(*) from jsonb_array_elements(x->'links') l where l->>'kind'='execution')<>1
  or x#>>'{revision,manifest,execution,resultFingerprint}'<>receipt then raise exception 'execution result revision: %',x; end if;
 raise notice 'PASS: a source without a rights version pins the one in force or the execution''s, or is refused; the receipt fixes the result fingerprint and releases the execution result';
end $$;

-- 15. The worker capability sits in the runtime contract; the entry points and predicates are
-- granted as designed.
do $$ declare f text;
begin
 if not (public.worker_runtime_schema_contract_v1()->'capabilities') ? 'artifact-revision.v1' then raise exception 'capability missing from the runtime contract'; end if;
 foreach f in array array['public.create_artifact_revision_v1(uuid,text,text,text,jsonb,jsonb,jsonb,text,bigint)','public.worker_create_artifact_revision_v1(uuid,text,text,uuid,text,text,text,jsonb,jsonb,jsonb,text,bigint)','public.read_artifact_revision_v1(uuid)','public.read_artifact_head_v1(uuid,text,text)'] loop
  if not has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE')
   or (select prosecdef from pg_proc where oid=f::regprocedure) then raise exception 'entry point grant or security mismatch: %',f; end if;
 end loop;
 foreach f in array array['private.create_artifact_revision_v1(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb,text,bigint,jsonb,uuid,uuid,uuid,boolean)','private.validate_artifact_manifest_v1(jsonb)','private.project_legacy_artifact_revision_v1(text,uuid,uuid)','private.backfill_artifact_revisions_v1()','private.artifact_revision_release_v1(public.artifact_revisions)','private.artifact_revision_freshness_v1(public.artifact_revisions)'] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') or has_function_privilege('service_role',f,'EXECUTE') then raise exception 'core exposed: %',f; end if;
 end loop;
 raise notice 'PASS: capability in the runtime contract; entry points authenticated only, invoker over definer; core closed';
end $$;

select 'artifact_revision_protocol_passed' as result;
rollback;
