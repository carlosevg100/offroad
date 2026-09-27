-- Shared synthetic artifact fixture; the caller owns the transaction and must roll back.
\ir contextual_adoption_setup.sql
\ir execution_method_fixture.sql
\ir execution_approval.sql
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

