-- Stage 18, increment 3A: change events, invalidation facts and dependency-update requests, through
-- the real outbox (claim and complete as a worker account). Synthetic rows only; everything rolls back.
begin;
\ir support/contextual_adoption_setup.sql
\ir support/execution_method_fixture.sql
\ir support/execution_approval.sql

-- Organization a11b...9000-1, owner a11b...8000-1, plain member a11b...8000-2 (no access to the work),
-- work a11b...9000-2 with intake session a11b...9000-3. A separate worker account drains the outbox.
insert into auth.users(id,email) values('a4183000-0000-4000-8000-000000000009','dependency-outbox-worker@example.invalid');
insert into private.worker_tokens(id,label,token_sha256)
values('a4183000-0000-4000-9000-0000000000f0','Synthetic dependency outbox worker',extensions.digest('synthetic-dependency-outbox-token','sha256'));
create temporary table dep(name text primary key,id uuid not null);

-- auth.uid() prefers request.jwt.claim.sub, which the fixture sets: switch both claims together.
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
end $$;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from dep where name=p_name $$;

-- One immutable version of a logical source, with verified bytes (a null logical id starts a source).
create function pg_temp.source_version(p_name text,p_logical uuid) returns uuid language plpgsql as $$
declare v uuid:=md5('dependency-source:'||p_name)::uuid;hash text:=encode(extensions.digest(p_name,'sha256'),'hex');
begin
 insert into public.source_documents(id,organization_id,intake_session_id,logical_source_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status)
 values(v,'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',p_logical,
  'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/'||p_name||'.txt','Synthetic source','text/plain',1,hash,'a11b0000-0000-4000-8000-000000000001','ready');
 insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
 values('a11b0000-0000-4000-9000-000000000001',v,gen_random_uuid(),hash,1,'synthetic-only-'||p_name);
 insert into dep values(p_name,v);
 return v;
end $$;

-- An execution of a profile pinning the named source versions and adopted decisions of one version.
create function pg_temp.request_execution(p_name text,p_profile uuid,p_sources text[],p_decisions uuid[],p_version uuid) returns uuid language plpgsql as $$
declare x uuid:=md5('dependency-execution:'||p_name)::uuid;c jsonb:=pg_temp.execution_contract_fixture(md5('dependency-execution:'||p_name)::uuid);p private.execution_method_profiles;
begin
 select * into strict p from private.execution_method_profiles where id=p_profile;
 c:=jsonb_set(c,'{method}',p.payload->'method');
 c:=jsonb_set(c,'{inputs,sources}',coalesce((select jsonb_agg(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId',v.id,
  'contentHash',v.declared_sha256,'rightsRevision','1') order by v.id) from public.source_versions v join dep d on d.id=v.id where d.name=any(p_sources)),'[]'));
 c:=jsonb_set(c,'{inputs,adoptions}',coalesce((select jsonb_agg(jsonb_build_object('id',d,'assumptionVersionId',v.id,'fingerprint',v.content_fingerprint) order by d)
  from unnest(p_decisions) d cross join public.assumption_versions v where v.id=p_version),'[]'));
 perform private.request_work_execution_v1(p_profile,c::text,'{}');
 insert into dep values(p_name,x);
 return x;
end $$;

-- The canonical event reference of dependency-update-request.v1.
create function pg_temp.event_ref(p_event uuid) returns jsonb language sql as $$
 select jsonb_build_object('eventId',e.id,'aggregateKind',e.aggregate_kind,'aggregateId',e.aggregate_id,'aggregateVersion',e.aggregate_version)
 from private.domain_events e where e.id=p_event;
$$;
-- The dependency event of a change: a source version names its own event, other kinds are looked up.
create function pg_temp.event_of(p_kind text,p_aggregate uuid) returns uuid language sql as $$
 select id from private.domain_events where aggregate_kind=p_kind and aggregate_id=p_aggregate order by aggregate_version desc limit 1;
$$;

-- Claims and completes every deliverable event as the worker account, then acts as the owner again.
create function pg_temp.drain_outbox() returns integer language plpgsql as $$
declare claim jsonb;result jsonb;done integer:=0;
begin
 perform pg_temp.act_as('a4183000-0000-4000-8000-000000000009');
 for attempt in 1..500 loop
  claim:=public.claim_event_outbox_v1('synthetic-dependency-outbox-token');
  exit when not (claim->>'claimed')::boolean;
  result:=public.complete_event_outbox_v1('synthetic-dependency-outbox-token',(claim->>'outboxId')::uuid,claim->>'capability');
  if (result->>'completed')::boolean then done:=done+1; end if;
 end loop;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 if exists(select 1 from private.event_outbox where status<>'completed') then raise exception 'outbox not drained'; end if;
 return done;
end $$;

-- The facts one event wrote, in a stable comparable form.
create function pg_temp.facts_of(p_event uuid) returns table(execution text,dependency_kind text,reason_class text,gap text,pinned jsonb,head jsonb,via text[]) language sql as $$
 select d.name,f.dependency_kind,f.reason_class,f.gap,f.pinned,f.head,
  array(select v.name from unnest(f.via_source_version_ids) u join dep v on v.id=u order by v.name)
 from private.execution_invalidations f join dep d on d.id=f.execution_id where f.event_id=p_event order by d.name,f.dependency_kind,f.logical_key;
$$;
create function pg_temp.source_ref(p_name text) returns jsonb language sql as $$
 select jsonb_build_object('sourceId',v.source_id,'versionNo',v.version_no,'versionId',v.id) from public.source_versions v where v.id=pg_temp.id(p_name);
$$;

-- 0. Setup. Assumption set revisions 1 (slot A) and 2 (slots A and B), both adopted by the owner.
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb);
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb||jsonb_build_object('requestId','a4183000-0000-4000-9000-0000000000a2',
 'expectedVersionId','a9990000-0000-4000-9000-000000000003','observationId',current_setting('test.adoption.budget')));
insert into dep values('V1','a9990000-0000-4000-9000-000000000003'),('V2','a4183000-0000-4000-9000-0000000000a2');
insert into dep select 'dA1',decision_id from private.assumption_version_items where version_id=pg_temp.id('V1');
insert into dep select 'dB1',i.decision_id from private.assumption_version_items i where i.version_id=pg_temp.id('V2') and i.decision_id<>pg_temp.id('dA1');
-- Sources: S (balancete), T (another source) and D, derived from S v1.
select pg_temp.source_version('S1',null);
select pg_temp.source_version('T1',null);
select pg_temp.source_version('D1',null);
insert into private.resource_dependencies(organization_id,derived_version_id,source_version_id,source_rights_version_id,created_by)
select r.organization_id,pg_temp.id('D1'),r.source_version_id,r.id,'a11b0000-0000-4000-8000-000000000001'
from private.source_rights_versions r where r.source_version_id=pg_temp.id('S1') and r.revision=1;
insert into dep select 'S',source_id from public.source_versions where id=pg_temp.id('S1');
insert into dep select 'T',source_id from public.source_versions where id=pg_temp.id('T1');

-- 1. The event contract.
do $$ declare e private.domain_events;begin
 if exists(select 1 from private.domain_events where aggregate_kind='source_version') then
  raise exception 'a first version of a source emitted a dependency event';
 end if;
 if exists(select 1 from private.domain_events where aggregate_kind in ('adoption_decision','assumption_version') and effect<>'propagate_dependencies')
 or not exists(select 1 from private.domain_events where aggregate_kind='assumption_version' and aggregate_id=pg_temp.id('V2'))
 or exists(select 1 from private.domain_events where aggregate_kind not in ('adoption_decision','assumption_version','source_version','method_release') and effect<>'revalidate_authority') then
  raise exception 'effect does not follow the aggregate kind';
 end if;
 begin
  perform private.append_domain_event_v1(gen_random_uuid(),'a11b0000-0000-4000-9000-000000000001','source_version',pg_temp.id('S'),'created','{"versionNo":0}');
  raise exception 'a source event without a newer version number was accepted';
 exception when invalid_parameter_value then
  if sqlerrm<>'domain_event_version_regression' then raise; end if;
 end;
 raise notice 'PASS: first versions emit nothing; adoption and assumption events propagate; authority events only revalidate';
end $$;

-- 2. Executions, all on the fixture's platform release, and the decisions that must stay untouched.
select pg_temp.request_execution('X1','a4171000-0000-4000-9000-000000000001',array['S1'],array[pg_temp.id('dA1')],pg_temp.id('V2'));
select pg_temp.request_execution('X2','a4171000-0000-4000-9000-000000000001',array['D1'],array[pg_temp.id('dB1')],pg_temp.id('V2'));
select pg_temp.request_execution('X3','a4171000-0000-4000-9000-000000000001',array['T1'],array[]::uuid[],null);
-- X1 commits a result: its execution_result milestone is what the request must refer to.
do $$ declare job uuid;claim jsonb;begin
 select id into strict job from public.processing_jobs where execution_id=pg_temp.id('X1');
 claim:=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',job,60);
 perform private.reserve_execution_operation_v1(job,claim->>'capability',(claim->>'leaseId')::uuid,pg_temp.id('X1'),
  claim->>'contractFingerprint','synthetic#calculate','test-v1','read_only',0,0);
 perform private.settle_execution_operation_v2(job,claim->>'capability',(claim->>'leaseId')::uuid,pg_temp.id('X1'),
  claim->>'contractFingerprint','{"calculation":"synthetic dependency"}','succeeded','calculated',0,0);
 perform private.commit_work_execution_result_v1(job,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',
  encode(extensions.digest('{}','sha256'),'hex'),'{"calculation":"synthetic dependency"}','succeeded','calculated');
end $$;
-- An accepted execution brief writes a decision milestone.
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values('a4183000-0000-4000-9000-0000000000d1','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',31,'manual','queued','approval-fixture-v1','a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values('a4183000-0000-4000-9000-0000000000d2','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a4183000-0000-4000-9000-0000000000d1','case_analysis','queued','{"analysis_scope":"full_case"}');
select pg_temp.fixture_approve_execution('a4183000-0000-4000-9000-0000000000d2');
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
create temporary table untouched as
select m.id,m.xmin::text as row_version,to_jsonb(m) as row_image from public.work_milestones m
where m.work_id='a11b0000-0000-4000-9000-000000000002' and m.kind in ('execution_result','decision');
create temporary table untouched_results as select r.id,r.xmin::text as row_version,to_jsonb(r) as row_image from private.execution_result_receipts r;
do $$begin
 if (select count(*) from untouched where row_image->>'kind'='execution_result')<>1 or (select count(*) from untouched where row_image->>'kind'='decision')<1 then
  raise exception 'setup: expected a result milestone and a decision milestone';
 end if;
end $$;

-- Every setup event is delivered: nothing has moved yet, so no fact and no request.
select pg_temp.drain_outbox();
do $$begin
 if exists(select 1 from private.execution_invalidations) or exists(select 1 from public.work_continuation_requests) then
  raise exception 'setup events recorded an impact';
 end if;
 raise notice 'PASS: events of unchanged inputs record no impact';
end $$;
-- Increment 3B starts again from here after the sections of 3A (section 13 onwards).
savepoint stage18_3b_base;

-- 3. Two changes to the same work before the consumer runs: a new version of S, and a new revision
-- of the assumption set whose slot B changed (slot A kept its decision).
select pg_temp.source_version('S2',pg_temp.id('S'));
select public.propose_assumption_revision_v1(jsonb_build_object('requestId','a4183000-0000-4000-9000-0000000000a3','workId','a11b0000-0000-4000-9000-000000000002',
 'purpose','capital structure decision','contextKey','actual-2025','expectedVersionId',pg_temp.id('V2'),'reason','Synthetic revised budget assumption',
 'fieldPath','financials.net_debt','dimensions',current_setting('test.adoption.dimensions')::jsonb||'{"scenario":"budget"}',
 'value',jsonb_build_object('type','number','value','520'),'referenceObservationId',null));
insert into dep values('V3','a4183000-0000-4000-9000-0000000000a3');
insert into dep select 'dB2',i.decision_id from private.assumption_version_items i where i.version_id=pg_temp.id('V3') and i.decision_id<>pg_temp.id('dA1');
insert into dep values('E_S2',pg_temp.event_of('source_version',pg_temp.id('S'))),('E_V3',pg_temp.event_of('assumption_version',pg_temp.id('V3'))),
 ('E_dB2',pg_temp.event_of('adoption_decision',pg_temp.id('dB2')));
do $$ declare e private.domain_events;begin
 select * into strict e from private.domain_events where id=pg_temp.id('E_S2');
 if e.id<>pg_temp.id('S2') or e.aggregate_id<>pg_temp.id('S') or e.aggregate_version<>2 or e.effect<>'propagate_dependencies' or e.reason<>'created'
 or e.protected_state->>'versionNo'<>'2' or not exists(select 1 from private.event_outbox where event_id=e.id and status='pending') then
  raise exception 'new source version event mismatch: %',to_jsonb(e);
 end if;
 raise notice 'PASS: a new version of a source emits one event per logical source, ordered by its version number';
end $$;
select pg_temp.drain_outbox();
do $$ declare r public.work_continuation_requests;expected jsonb;m public.work_milestones;begin
 -- Source: only executions bound to S, directly (X1) or through the derived source D (X2).
 if array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_S2')) f) is distinct from array[
  jsonb_build_object('execution','X1','dependency_kind','source_version','reason_class','data_change','gap',null,'pinned',pg_temp.source_ref('S1'),'head',pg_temp.source_ref('S2'),'via','{}'::text[]),
  jsonb_build_object('execution','X2','dependency_kind','source_version','reason_class','data_change','gap',null,'pinned',pg_temp.source_ref('S1'),'head',pg_temp.source_ref('S2'),'via',array['D1'])] then
  raise exception 'source impact mismatch: %',array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_S2')) f);
 end if;
 raise notice 'PASS: a new source version affects only executions bound to it, directly or through a derived source';
 -- Slot granularity: X2 used slot B (changed); X1 used slot A (unchanged) and is not affected by it.
 expected:=jsonb_build_object('execution','X2','dependency_kind','assumption_slot','reason_class','data_change','gap',null,
  'pinned',(select jsonb_build_object('revision',2,'versionId',v.id,'decisionId',pg_temp.id('dB1'),'contentFingerprint',v.content_fingerprint) from public.assumption_versions v where v.id=pg_temp.id('V2')),
  'head',jsonb_build_object('revision',3,'versionId',pg_temp.id('V3'),'decisionId',pg_temp.id('dB2')),'via','{}'::text[]);
 if array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_V3')) f) is distinct from array[expected]
 or array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_dB2')) f) is distinct from array[expected] then
  raise exception 'slot impact mismatch: % %',array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_V3')) f),array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_dB2')) f);
 end if;
 raise notice 'PASS: a change of one assumption slot affects only executions that used that slot';
 -- One open request for the work holds both changes, in the canonical form of continuation.ts.
 select * into strict r from public.work_continuation_requests where work_id='a11b0000-0000-4000-9000-000000000002';
 expected:=jsonb_build_object('schemaVersion','dependency-update-request.v1','workId','a11b0000-0000-4000-9000-000000000002','status','open',
  'affectedExecutionIds',(select jsonb_agg(to_jsonb(x) order by x collate "C") from unnest(array[pg_temp.id('X1')::text,pg_temp.id('X2')::text]) x),
  'events',jsonb_build_array(pg_temp.event_ref(pg_temp.id('E_dB2')),pg_temp.event_ref(pg_temp.id('E_V3')),pg_temp.event_ref(pg_temp.id('E_S2'))),
  'aggregateVersions',jsonb_build_array(
   jsonb_build_object('aggregateKind','adoption_decision','aggregateId',pg_temp.id('dB2'),'version',1),
   jsonb_build_object('aggregateKind','assumption_version','aggregateId',pg_temp.id('V3'),'version',1),
   jsonb_build_object('aggregateKind','source_version','aggregateId',pg_temp.id('S'),'version',2)));
 if r.kind<>'dependency_update' or r.status<>'open' or r.revision<>3 or r.payload<>expected or r.created_by is not null
 or r.payload_fingerprint<>private.continuation_fingerprint_v1(expected) then
  raise exception 'request is not the merged canonical request: %',to_jsonb(r);
 end if;
 if r.affected_executions<>(select jsonb_agg(jsonb_build_object('executionId',x.id,'rootExecutionId',x.id,'resultMilestoneId',
   (select wm.id from public.work_milestones wm where wm.kind='execution_result' and wm.subject_id=x.id)) order by x.id::text collate "C")
   from (select pg_temp.id('X1') as id union all select pg_temp.id('X2')) x) then
  raise exception 'request does not name the roots and result milestones: %',r.affected_executions;
 end if;
 select * into strict m from public.work_milestones where kind='continuation_proposed' and subject_id=r.id;
 if m.work_id<>r.work_id or m.subject_kind<>'work_continuation_request' or m.label<>'dependency_update' or m.created_by is not null or m.occurred_at<>r.created_at
 or (select count(*) from public.work_milestones where kind='continuation_proposed')<>1 then
  raise exception 'continuation_proposed milestone mismatch: %',to_jsonb(m);
 end if;
 raise notice 'PASS: two changes to one work end in one open request containing both, with one continuation_proposed milestone';
end $$;

-- 4. Duplicate delivery: the same event applied again, directly and redelivered by the outbox.
do $$ declare before public.work_continuation_requests;facts bigint;result jsonb;begin
 select * into strict before from public.work_continuation_requests;
 select count(*) into facts from private.execution_invalidations;
 result:=private.apply_dependency_event_v1('a11b0000-0000-4000-9000-000000000001',pg_temp.id('E_S2'));
 if (result->>'facts')::integer<>0 or (result->>'opened')::integer<>0 or (result->>'merged')::integer<>0 then raise exception 'second application changed state: %',result; end if;
 update private.event_outbox set status='pending',completed_at=null,lease_expires_at=null,capability_sha256=null,worker_token_id=null,leased_account_user_id=null
 where event_id in (pg_temp.id('E_S2'),pg_temp.id('E_V3'));
 if pg_temp.drain_outbox()<>2 then raise exception 'redelivered events not completed'; end if;
 if (select count(*) from private.execution_invalidations)<>facts or (select to_jsonb(r) from public.work_continuation_requests r)<>to_jsonb(before) then
  raise exception 'duplicate delivery changed facts or the request';
 end if;
 raise notice 'PASS: the same event applied twice changes nothing the second time';
end $$;

-- 5. Graph incomplete: an execution recorded without its projection is rebuilt before it is judged.
alter table private.execution_source_bindings disable trigger execution_source_bindings_dependency;
alter table private.execution_basis_bindings disable trigger execution_basis_bindings_dependency;
alter table private.execution_manifests disable trigger execution_manifests_dependency;
select pg_temp.request_execution('X4','a4171000-0000-4000-9000-000000000001',array['S2'],array[]::uuid[],null);
alter table private.execution_source_bindings enable trigger execution_source_bindings_dependency;
alter table private.execution_basis_bindings enable trigger execution_basis_bindings_dependency;
alter table private.execution_manifests enable trigger execution_manifests_dependency;
do $$begin
 if exists(select 1 from private.execution_dependencies where execution_id=pg_temp.id('X4')) then raise exception 'setup: X4 was projected'; end if;
end $$;
select pg_temp.source_version('S3',pg_temp.id('S'));
insert into dep values('E_S3',pg_temp.id('S3'));
select pg_temp.drain_outbox();
do $$begin
 if (select count(*) from private.execution_dependencies where execution_id=pg_temp.id('X4'))<>2 then raise exception 'incomplete projection not rebuilt'; end if;
 if array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_S3')) f) is distinct from array[
  jsonb_build_object('execution','X1','dependency_kind','source_version','reason_class','data_change','gap',null,'pinned',pg_temp.source_ref('S1'),'head',pg_temp.source_ref('S3'),'via','{}'::text[]),
  jsonb_build_object('execution','X2','dependency_kind','source_version','reason_class','data_change','gap',null,'pinned',pg_temp.source_ref('S1'),'head',pg_temp.source_ref('S3'),'via',array['D1']),
  jsonb_build_object('execution','X4','dependency_kind','source_version','reason_class','data_change','gap',null,'pinned',pg_temp.source_ref('S2'),'head',pg_temp.source_ref('S3'),'via','{}'::text[])] then
  raise exception 'rebuilt execution not judged: %',array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_S3')) f);
 end if;
 if (select jsonb_array_length(payload->'affectedExecutionIds') from public.work_continuation_requests)<>3 then raise exception 'rebuilt execution not merged'; end if;
 raise notice 'PASS: graph incomplete: the projection is rebuilt before the execution is judged';
end $$;

-- 6. Out of order: version 5 is delivered before version 4. Facts read the current head either way.
select pg_temp.source_version('S4',pg_temp.id('S'));
select pg_temp.source_version('S5',pg_temp.id('S'));
insert into dep values('E_S4',pg_temp.id('S4')),('E_S5',pg_temp.id('S5'));
update private.event_outbox set created_at=created_at+interval '1 hour' where event_id=pg_temp.id('E_S4');
do $$ declare claim jsonb;order_seen uuid[]:='{}';r public.work_continuation_requests;begin
 perform pg_temp.act_as('a4183000-0000-4000-8000-000000000009');
 loop
  claim:=public.claim_event_outbox_v1('synthetic-dependency-outbox-token');
  exit when not (claim->>'claimed')::boolean;
  order_seen:=order_seen||(claim#>>'{event,id}')::uuid;
  perform public.complete_event_outbox_v1('synthetic-dependency-outbox-token',(claim->>'outboxId')::uuid,claim->>'capability');
 end loop;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 if array_position(order_seen,pg_temp.id('E_S5')) is null or array_position(order_seen,pg_temp.id('E_S4'))<>cardinality(order_seen) then
  raise exception 'setup: delivery order %',order_seen;
 end if;
 if exists(select 1 from pg_temp.facts_of(pg_temp.id('E_S4')) f where f.head<>pg_temp.source_ref('S5'))
 or (select count(*) from pg_temp.facts_of(pg_temp.id('E_S4')))<>3
 or array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_S4')) f) is distinct from array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_S5')) f) then
  raise exception 'older event regressed the head';
 end if;
 select * into strict r from public.work_continuation_requests;
 if (select x->>'version' from jsonb_array_elements(r.payload->'aggregateVersions') x where x->>'aggregateKind'='source_version')<>'5'
 or array(select (x->>'aggregateVersion')::integer from jsonb_array_elements(r.payload->'events') x where x->>'aggregateKind'='source_version')<>array[2,3,4,5] then
  raise exception 'request lost the order of versions: %',r.payload;
 end if;
 raise notice 'PASS: an older event arriving after a newer one never regresses';
end $$;

-- A head revision that no longer holds a pinned slot: a data change with a null decision, never an
-- incomplete graph. The adoption command never drops a slot, so this revision is written directly.
insert into public.assumption_versions(id,organization_id,set_id,revision,previous_version_id,classification,canonical_snapshot,content_fingerprint,request_fingerprint,created_by)
select 'a4183000-0000-4000-9000-0000000000a4',v.organization_id,v.set_id,4,v.id,'working_basis','{"synthetic":"slot B withdrawn"}',
 encode(extensions.digest('{"synthetic":"slot B withdrawn"}','sha256'),'hex'),repeat('e',64),'a11b0000-0000-4000-8000-000000000001'
from public.assumption_versions v where v.id=pg_temp.id('V3');
insert into private.assumption_version_items(organization_id,set_id,version_id,slot_key,decision_id)
select organization_id,set_id,'a4183000-0000-4000-9000-0000000000a4',slot_key,decision_id from private.assumption_version_items where version_id=pg_temp.id('V3') and decision_id=pg_temp.id('dA1');
insert into dep values('V4','a4183000-0000-4000-9000-0000000000a4'),('E_V4',pg_temp.event_of('assumption_version','a4183000-0000-4000-9000-0000000000a4'));
select pg_temp.drain_outbox();
do $$begin
 if array(select f.execution||':'||f.reason_class||':'||(f.head->>'revision')||':'||coalesce(f.head->>'decisionId','null') from pg_temp.facts_of(pg_temp.id('E_V4')) f)
  is distinct from array['X2:data_change:4:null'] then
  raise exception 'dropped slot not recorded as a data change: %',array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_V4')) f);
 end if;
 if (select to_jsonb(h) from private.assumption_slot_head_v1('a11b0000-0000-4000-9000-000000000001',
   (select set_id from public.assumption_versions where id=pg_temp.id('V4')),(select slot_key from public.adoption_decisions where id=pg_temp.id('dB1'))) h)
  is distinct from jsonb_build_object('version_id',pg_temp.id('V4'),'revision',4,'decision_id',null) then
  raise exception 'slot head does not return the head revision with a null decision';
 end if;
 raise notice 'PASS: a head revision without a pinned slot is a data change with a null decision, not an incomplete graph';
end $$;

-- 7. A newer platform release of the procedure: only executions on the older release, method_update.
insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source)
values('synthetic-execution-v2',true,'universal','synthetic-execution','test-v2','tested','Synthetic approver',current_date,'Synthetic rollback-only fixture');
insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)
select 'synthetic-execution-test-v2','synthetic-execution','test-v2',repeat('9',64),manifest,components,evidence,approval,'synthetic-execution-v2'
from private.platform_method_releases where id='synthetic-execution-test-v1';
insert into private.execution_method_profiles(id,platform_release_id,serialization_version,canonical_payload,payload_fingerprint,adapter_source_commit,review_evidence)
select 'a4183000-0000-4000-9000-0000000000b2','synthetic-execution-test-v2','offroad-execution-json-utf16-v1',payload::text,
 encode(extensions.digest(payload::text,'sha256'),'hex'),repeat('c',40),jsonb_build_object('result','approved','subjectCommit',repeat('c',40),'reviewer','Synthetic independent reviewer','sourceHash',repeat('d',64))
from (select jsonb_set(jsonb_set(jsonb_set(jsonb_set(p.payload,'{method,platformReleaseId}','"synthetic-execution-test-v2"'),'{method,methodVersion}','"test-v2"'),
 '{method,manifestHash}',to_jsonb(repeat('9',64))),'{method,baseManifestHash}',to_jsonb(repeat('9',64))) payload
 from private.execution_method_profiles p where p.id='a4171000-0000-4000-9000-000000000001') f;
insert into dep values('E_M',md5('platform_method_release:synthetic-execution-test-v2:a11b0000-0000-4000-9000-000000000001')::uuid);
select pg_temp.request_execution('X5','a4183000-0000-4000-9000-0000000000b2',array[]::text[],array[]::uuid[],null);
select pg_temp.drain_outbox();
do $$ declare e private.domain_events;head record;begin
 select * into strict e from private.domain_events where id=pg_temp.id('E_M');
 if e.aggregate_kind<>'method_release' or e.aggregate_id<>private.method_procedure_aggregate_v1('synthetic-execution') or e.effect<>'propagate_dependencies'
 or e.protected_state->>'methodId'<>'synthetic-execution' then raise exception 'method release event mismatch: %',to_jsonb(e); end if;
 if array(select f.execution||':'||f.reason_class||':'||(f.pinned->>'platformReleaseId')||'>'||(f.head->>'platformReleaseId') from pg_temp.facts_of(pg_temp.id('E_M')) f)
  is distinct from array['X1:method_update:synthetic-execution-test-v1>synthetic-execution-test-v2','X2:method_update:synthetic-execution-test-v1>synthetic-execution-test-v2',
   'X3:method_update:synthetic-execution-test-v1>synthetic-execution-test-v2','X4:method_update:synthetic-execution-test-v1>synthetic-execution-test-v2'] then
  raise exception 'method impact mismatch: %',array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_M')) f);
 end if;
 select * into strict head from private.method_release_head_v1('a11b0000-0000-4000-9000-000000000001','synthetic-execution',false);
 if head.platform_release_id<>'synthetic-execution-test-v2' or head.house_release_id is not null or head.profile_id<>'a4183000-0000-4000-9000-0000000000b2'
 or head.max_cost_microusd<>0 or head.max_model_calls<>0 then raise exception 'method head mismatch: %',to_jsonb(head); end if;
 if (select jsonb_array_length(payload->'affectedExecutionIds') from public.work_continuation_requests)<>4 then raise exception 'method impact not merged'; end if;
 raise notice 'PASS: a newer method release affects only executions on the older release, as method_update';
end $$;

-- 8. Worker restart: claim, lease expiry, reclaim, complete. One set of facts, the stale lease is refused.
select pg_temp.source_version('T2',pg_temp.id('T'));
insert into dep values('E_T2',pg_temp.id('T2'));
update private.event_outbox set created_at=created_at+interval '1 hour' where status='pending' and event_id<>pg_temp.id('E_T2');
do $$ declare first_claim jsonb;second_claim jsonb;result jsonb;begin
 perform pg_temp.act_as('a4183000-0000-4000-8000-000000000009');
 first_claim:=public.claim_event_outbox_v1('synthetic-dependency-outbox-token');
 if (first_claim#>>'{event,id}')::uuid<>pg_temp.id('E_T2') or first_claim#>>'{event,effect}'<>'propagate_dependencies' then raise exception 'setup: claimed %',first_claim; end if;
 update private.event_outbox set lease_expires_at=clock_timestamp()-interval '1 minute' where id=(first_claim->>'outboxId')::uuid;
 second_claim:=public.claim_event_outbox_v1('synthetic-dependency-outbox-token');
 if second_claim->>'outboxId'<>first_claim->>'outboxId' or second_claim->>'capability'=first_claim->>'capability' then raise exception 'interrupted lease not reclaimed'; end if;
 begin
  perform public.complete_event_outbox_v1('synthetic-dependency-outbox-token',(first_claim->>'outboxId')::uuid,first_claim->>'capability');
  raise exception 'stale lease completed';
 exception when insufficient_privilege then null;
 end;
 result:=public.complete_event_outbox_v1('synthetic-dependency-outbox-token',(second_claim->>'outboxId')::uuid,second_claim->>'capability');
 if not (result->>'completed')::boolean or (result->>'replayed')::boolean then raise exception 'reclaimed event not completed: %',result; end if;
 result:=public.complete_event_outbox_v1('synthetic-dependency-outbox-token',(second_claim->>'outboxId')::uuid,second_claim->>'capability');
 if not (result->>'replayed')::boolean then raise exception 'completion retry not replayed'; end if;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 if array(select f.execution||':'||(f.head->>'versionNo') from pg_temp.facts_of(pg_temp.id('E_T2')) f) is distinct from array['X3:2'] then
  raise exception 'worker restart facts: %',array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_T2')) f);
 end if;
 raise notice 'PASS: worker restart (claim, lease expiry, reclaim, complete) records one set of facts';
end $$;
select pg_temp.drain_outbox();

-- 9. The request contract: one open update per work, forward-only status, immutable identity and
-- history, a fingerprint that matches continuation.ts.
do $$ declare r public.work_continuation_requests;begin
 select * into strict r from public.work_continuation_requests;
 begin
  insert into public.work_continuation_requests(organization_id,work_id,kind,payload,payload_fingerprint,affected_executions)
  values(r.organization_id,r.work_id,'dependency_update',r.payload,r.payload_fingerprint,r.affected_executions);
  raise exception 'second open dependency update accepted';
 exception when unique_violation then null;
 end;
 begin
  update public.work_continuation_requests set status='adopted',revision=revision+1 where id=r.id;
  raise exception 'open request adopted without being ready';
 exception when check_violation then if sqlerrm<>'work_continuation_request_transition_invalid' then raise; end if;
 end;
 begin
  update public.work_continuation_requests set status='scheduled' where id=r.id;
  raise exception 'write without a new revision accepted';
 exception when check_violation then if sqlerrm<>'work_continuation_request_transition_invalid' then raise; end if;
 end;
 begin
  update public.work_continuation_requests set status='scheduled',revision=revision+1 where id=r.id;
  update public.work_continuation_requests set affected_executions='[]',revision=revision+1 where id=r.id;
  raise exception 'payload changed after the request left open';
 exception when check_violation then if sqlerrm<>'work_continuation_request_transition_invalid' then raise; end if;
 end;
 begin
  update public.work_continuation_requests set payload_fingerprint=repeat('0',64),revision=revision+1 where id=r.id;
  raise exception 'forged fingerprint accepted';
 exception when check_violation then null;
 end;
 begin delete from public.work_continuation_requests where id=r.id; raise exception 'request deleted';
 exception when check_violation then if sqlerrm<>'work_continuity_history_immutable' then raise; end if;
 end;
 -- Candidates and holds (3B) reference the requests, so the truncation cascades to them and every guard refuses it.
 begin truncate public.work_continuation_requests cascade; raise exception 'requests truncated';
 exception when check_violation then if sqlerrm<>'work_continuity_history_immutable' then raise; end if;
 end;
 if not private.work_continuation_transition_allowed_v1('ready','adopted') or private.work_continuation_transition_allowed_v1('adopted','open')
 or private.work_continuation_transition_allowed_v1('superseded','open') or private.work_continuation_transition_allowed_v1('scheduled','open') then
  raise exception 'status machine is not forward only';
 end if;
 -- The same vector as packages/work-plan/src/continuation-sql-parity.test.ts.
 if private.continuation_fingerprint_v1(jsonb_build_object('schemaVersion','dependency-update-request.v1','workId','b0183000-0000-4000-9000-000000000002','status','open',
  'affectedExecutionIds',jsonb_build_array('b0183000-0000-4000-9000-000000000101'),
  'events',jsonb_build_array(
   jsonb_build_object('eventId','b0183000-0000-4000-9000-000000000302','aggregateKind','assumption_version','aggregateId','b0183000-0000-4000-9000-000000000401','aggregateVersion',1),
   jsonb_build_object('eventId','b0183000-0000-4000-9000-000000000301','aggregateKind','source_version','aggregateId','b0183000-0000-4000-9000-000000000201','aggregateVersion',2)),
  'aggregateVersions',jsonb_build_array(
   jsonb_build_object('aggregateKind','assumption_version','aggregateId','b0183000-0000-4000-9000-000000000401','version',1),
   jsonb_build_object('aggregateKind','source_version','aggregateId','b0183000-0000-4000-9000-000000000201','version',2))))
  <>'3ab2acb831c999cbb49da0e78093e555d2ee432d885cdb0a6cabcf1d558b2b0b' then
  raise exception 'request fingerprint differs from continuation.ts';
 end if;
 -- Facts are immutable too.
 begin update private.execution_invalidations set reason_class=reason_class; raise exception 'fact rewritten';
 exception when check_violation then if sqlerrm<>'work_continuity_history_immutable' then raise; end if;
 end;
 begin delete from private.execution_invalidations; raise exception 'fact deleted';
 exception when check_violation then if sqlerrm<>'work_continuity_history_immutable' then raise; end if;
 end;
 begin truncate private.execution_invalidations; raise exception 'facts truncated';
 exception when check_violation then if sqlerrm<>'work_continuity_history_immutable' then raise; end if;
 end;
 raise notice 'PASS: one open update per work, forward-only status, immutable history, fingerprint equal to continuation.ts';
end $$;

-- 10. Read authority is the work's; nobody writes through the API; facts and writers are closed.
select set_config('test.dependency.request',(select id::text from public.work_continuation_requests),true);
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
do $$ declare attempt text;begin
 if (select count(*) from public.work_continuation_requests)<>1 or not exists(select 1 from public.work_milestones where kind='continuation_proposed') then
  raise exception 'work owner does not read the request of the work';
 end if;
 foreach attempt in array array[
  'insert into public.work_continuation_requests(organization_id,work_id,kind,payload,payload_fingerprint) values(''a11b0000-0000-4000-9000-000000000001'',''a11b0000-0000-4000-9000-000000000002'',''user_followup'',''{}'',repeat(''0'',64))',
  'update public.work_continuation_requests set status=''declined''',
  'delete from public.work_continuation_requests',
  'select count(*) from private.execution_invalidations',
  'select private.apply_dependency_event_v1(''a11b0000-0000-4000-9000-000000000001'',gen_random_uuid())'] loop
  begin execute attempt; raise exception 'work owner reached a writer or the facts: %',attempt;
  exception when insufficient_privilege then null;
  end;
 end loop;
 raise notice 'PASS: the work owner reads the request and cannot write it, read the facts or call a writer';
end $$;
reset role;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
set local role authenticated;
do $$begin
 if exists(select 1 from public.work_continuation_requests) or exists(select 1 from public.work_continuation_requests where id=current_setting('test.dependency.request')::uuid) then
  raise exception 'member without access to the work reads its request';
 end if;
 raise notice 'PASS: a member without access to the work neither sees nor probes its request';
end $$;
reset role;
set local role anon;
do $$begin
 begin perform 1 from public.work_continuation_requests; raise exception 'anon read requests';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
do $$ declare role_name text;f record;begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'private.execution_invalidations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'facts exposed to %',role_name; end if;
 end loop;
 if not has_table_privilege('authenticated','public.work_continuation_requests','SELECT')
 or has_table_privilege('authenticated','public.work_continuation_requests','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 or has_table_privilege('anon','public.work_continuation_requests','SELECT,INSERT,UPDATE,DELETE')
 or has_table_privilege('service_role','public.work_continuation_requests','SELECT,INSERT,UPDATE,DELETE') then
  raise exception 'request grants are not select-only for authenticated';
 end if;
 if (select count(*) from pg_policy where polrelid='public.work_continuation_requests'::regclass and polname in
  ('work_continuation_requests_select_authorized','work_continuation_requests_deny_insert','work_continuation_requests_deny_update','work_continuation_requests_deny_delete'))<>4
 or exists(select 1 from pg_policy where polrelid='public.work_continuation_requests'::regclass and polcmd in ('*','a','w','d') and polpermissive
  and coalesce(pg_get_expr(polqual,polrelid),'false')<>'false')
 or not exists(select 1 from pg_policy where polrelid='private.execution_invalidations'::regclass and polname='execution_invalidations_deny_clients'
  and not polpermissive and polcmd='*' and pg_get_expr(polqual,polrelid)='false' and pg_get_expr(polwithcheck,polrelid)='false')
 or not exists(select 1 from pg_class where oid='private.execution_invalidations'::regclass and relrowsecurity and relforcerowsecurity)
 or not exists(select 1 from pg_class where oid='public.work_continuation_requests'::regclass and relrowsecurity and relforcerowsecurity) then
  raise exception 'stage 18 3A policies missing';
 end if;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in ('domain_event_effect_v1','method_procedure_aggregate_v1','capture_source_version_event_v1','capture_method_release_event_v1',
   'source_head_v1','assumption_slot_head_v1','platform_method_release_published_v1','method_release_head_v1','dependency_event_impact_v1',
   'rebuild_incomplete_execution_dependencies_v1','continuation_stable_json_v1','continuation_fingerprint_v1','work_continuation_transition_allowed_v1',
   'guard_work_continuation_request_v1','merge_dependency_update_request_v1','apply_dependency_event_v1','apply_outbox_dependency_effect_v1') loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,f.signature,'EXECUTE') then raise exception 'writer exposed: % %',role_name,f.signature; end if;
  end loop;
 end loop;
 raise notice 'PASS: facts and every new function are closed to the API roles; requests are select-only';
end $$;

-- 11. The authority sweep stays first and exactly as before. The owner is suspended while a change
-- of S is pending; the dependency effect of that change fails: the sweep still cancels every job
-- whose authority ended, and the event is not acknowledged. Nobody retries (a lost delivery): once
-- the lease expires the next claim applies it. A failure that persists blocks the row after five
-- attempts under the existing alarm, and the operator recovery applies it once repaired.
update public.organization_memberships set status='suspended' where organization_id='a11b0000-0000-4000-9000-000000000001' and user_id='a11b0000-0000-4000-8000-000000000001';
select pg_temp.source_version('S6',pg_temp.id('S'));
insert into dep values('E_S6',pg_temp.id('S6'));
update private.event_outbox set created_at=created_at+interval '1 second' where status='pending' and event_id<>pg_temp.id('E_S6');
create function pg_temp.fail_dependency_effect() returns trigger language plpgsql as $$ begin raise exception 'synthetic_dependency_failure'; end $$;
create trigger synthetic_dependency_failure before insert on private.execution_invalidations for each row execute function pg_temp.fail_dependency_effect();
do $$ declare claim jsonb;result jsonb;item private.event_outbox;begin
 if (select count(*) from public.processing_jobs where execution_id in (pg_temp.id('X2'),pg_temp.id('X3'),pg_temp.id('X4'),pg_temp.id('X5')) and status='queued')<>4 then
  raise exception 'setup: expected four queued execution jobs';
 end if;
 perform pg_temp.act_as('a4183000-0000-4000-8000-000000000009');
 claim:=public.claim_event_outbox_v1('synthetic-dependency-outbox-token');
 if (claim#>>'{event,id}')::uuid<>pg_temp.id('E_S6') then raise exception 'setup: claimed %',claim#>>'{event,id}'; end if;
 result:=public.complete_event_outbox_v1('synthetic-dependency-outbox-token',(claim->>'outboxId')::uuid,claim->>'capability');
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 if (result->>'completed')::boolean or (result->>'replayed')::boolean
 or (result->>'appliedCount')::integer<>(select count(*) from private.access_decision_events where domain_event_id=pg_temp.id('E_S6')) then
  raise exception 'failed dependency effect acknowledged or sweep miscounted: %',result;
 end if;
 if exists(select 1 from public.processing_jobs where execution_id in (pg_temp.id('X2'),pg_temp.id('X3'),pg_temp.id('X4'),pg_temp.id('X5'))
  and (status<>'cancelled' or capability_sha256 is not null or last_error<>'{"reason":"authorization_revoked"}'::jsonb))
 or (select count(*) from private.access_decision_events a join public.processing_jobs j on j.id=a.processing_job_id
  where a.domain_event_id=pg_temp.id('E_S6') and j.execution_id in (pg_temp.id('X2'),pg_temp.id('X3'),pg_temp.id('X4'),pg_temp.id('X5')) and a.decision='deny' and a.reason='authorization_revoked')<>4 then
  raise exception 'the dependency failure undid or skipped the authority sweep';
 end if;
 select * into strict item from private.event_outbox where event_id=pg_temp.id('E_S6');
 if item.status<>'leased' or item.completed_at is not null or exists(select 1 from private.execution_invalidations where event_id=pg_temp.id('E_S6')) then
  raise exception 'failed dependency effect was acknowledged or partly written';
 end if;
 raise notice 'PASS: the authority sweep runs first and survives a dependency failure, which is not acknowledged';
end $$;
drop trigger synthetic_dependency_failure on private.execution_invalidations;
update private.event_outbox set lease_expires_at=clock_timestamp()-interval '1 minute' where event_id=pg_temp.id('E_S6');
do $$ declare claim jsonb;result jsonb;begin
 perform pg_temp.act_as('a4183000-0000-4000-8000-000000000009');
 claim:=public.claim_event_outbox_v1('synthetic-dependency-outbox-token');
 if (claim#>>'{event,id}')::uuid<>pg_temp.id('E_S6') then raise exception 'lost event not reclaimed first: %',claim#>>'{event,id}'; end if;
 result:=public.complete_event_outbox_v1('synthetic-dependency-outbox-token',(claim->>'outboxId')::uuid,claim->>'capability');
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 if not (result->>'completed')::boolean or (select attempts from private.event_outbox where event_id=pg_temp.id('E_S6'))<>2 then raise exception 'lost event not applied: %',result; end if;
 -- The jobs cancelled by the sweep ended without a result: only X1, which committed one, is judged.
 if array(select f.execution||':'||(f.head->>'versionNo') from pg_temp.facts_of(pg_temp.id('E_S6')) f) is distinct from array['X1:6'] then
  raise exception 'recovered event facts: %',array(select to_jsonb(f) from pg_temp.facts_of(pg_temp.id('E_S6')) f);
 end if;
 if not (select payload->'events' @> jsonb_build_array(jsonb_build_object('eventId',pg_temp.id('E_S6'))) from public.work_continuation_requests) then
  raise exception 'recovered event not merged';
 end if;
 raise notice 'PASS: a lost event is recovered by the outbox: the next claim after the lease expires applies it';
end $$;
select pg_temp.drain_outbox();
select pg_temp.source_version('S7',pg_temp.id('S'));
insert into dep values('E_S7',pg_temp.id('S7'));
create trigger synthetic_dependency_failure before insert on private.execution_invalidations for each row execute function pg_temp.fail_dependency_effect();
do $$ declare claim jsonb;result jsonb;item private.event_outbox;attempts integer:=0;begin
 perform pg_temp.act_as('a4183000-0000-4000-8000-000000000009');
 -- Other pending events (the rights version of S7) complete normally; every delivery of E_S7 fails.
 loop
  claim:=public.claim_event_outbox_v1('synthetic-dependency-outbox-token');
  exit when not (claim->>'claimed')::boolean or attempts>5;
  result:=public.complete_event_outbox_v1('synthetic-dependency-outbox-token',(claim->>'outboxId')::uuid,claim->>'capability');
  if (claim#>>'{event,id}')::uuid=pg_temp.id('E_S7') then
   attempts:=attempts+1;
   if (result->>'completed')::boolean then raise exception 'failing dependency effect acknowledged'; end if;
   update private.event_outbox set lease_expires_at=clock_timestamp()-interval '1 minute' where event_id=pg_temp.id('E_S7');
  end if;
 end loop;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 if attempts<>5 then raise exception 'E_S7 delivered % times before blocking',attempts; end if;
 select * into strict item from private.event_outbox where event_id=pg_temp.id('E_S7');
 if (claim->>'claimed')::boolean or (claim->>'blockedCount')::integer<1 or item.status<>'blocked' or item.attempts<>5
 or exists(select 1 from private.execution_invalidations where event_id=pg_temp.id('E_S7')) then
  raise exception 'persistent dependency failure not blocked under the alarm: % %',claim,to_jsonb(item);
 end if;
end $$;
drop trigger synthetic_dependency_failure on private.execution_invalidations;
do $$begin
 if not private.retry_blocked_event_outbox_v1('a11b0000-0000-4000-9000-000000000001',(select id from private.event_outbox where event_id=pg_temp.id('E_S7'))) then
  raise exception 'blocked event not requeued';
 end if;
 perform pg_temp.drain_outbox();
 if array(select f.execution||':'||(f.head->>'versionNo') from pg_temp.facts_of(pg_temp.id('E_S7')) f) is distinct from array['X1:7'] then
  raise exception 'repaired event not applied';
 end if;
 raise notice 'PASS: a persistent dependency failure blocks the row after five attempts; the operator recovery applies it once';
end $$;

-- A dependency effect cut by the statement timeout is a failure like any other: the completion
-- still returns inside its statement, unacknowledged, and the next delivery applies the effect.
select pg_temp.source_version('S8',pg_temp.id('S'));
insert into dep values('E_S8',pg_temp.id('S8'));
update private.event_outbox set created_at=created_at+interval '1 hour' where status='pending' and event_id<>pg_temp.id('E_S8');
create function pg_temp.slow_dependency_effect() returns trigger language plpgsql as $$ begin perform pg_sleep(5); return new; end $$;
create trigger synthetic_slow_dependency before insert on private.execution_invalidations for each row execute function pg_temp.slow_dependency_effect();
select pg_temp.act_as('a4183000-0000-4000-8000-000000000009');
create temporary table slow_claim as select public.claim_event_outbox_v1('synthetic-dependency-outbox-token') as claim;
set local statement_timeout='1s';
create temporary table slow_result as
select public.complete_event_outbox_v1('synthetic-dependency-outbox-token',(claim->>'outboxId')::uuid,claim->>'capability') as result from slow_claim;
set local statement_timeout=0;
drop trigger synthetic_slow_dependency on private.execution_invalidations;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
do $$begin
 if (select (claim#>>'{event,id}')::uuid from slow_claim)<>pg_temp.id('E_S8') then raise exception 'setup: claimed %',(select claim from slow_claim); end if;
 if (select (result->>'completed')::boolean from slow_result) or (select status from private.event_outbox where event_id=pg_temp.id('E_S8'))<>'leased'
 or exists(select 1 from private.execution_invalidations where event_id=pg_temp.id('E_S8')) then
  raise exception 'a timed-out dependency effect was acknowledged or partly written: %',(select result from slow_result);
 end if;
end $$;
update private.event_outbox set lease_expires_at=clock_timestamp()-interval '1 minute' where event_id=pg_temp.id('E_S8');
select pg_temp.drain_outbox();
do $$begin
 if array(select f.execution||':'||(f.head->>'versionNo') from pg_temp.facts_of(pg_temp.id('E_S8')) f) is distinct from array['X1:8'] then
  raise exception 'timed-out event not applied on the next delivery';
 end if;
 raise notice 'PASS: a dependency effect cut by the statement timeout returns unacknowledged and is applied on the next delivery';
end $$;

-- 12. No result or decision was rewritten: the milestones and receipts are byte-identical, and the
-- request refers to the result milestone of X1.
do $$begin
 if exists(select 1 from untouched u left join public.work_milestones m on m.id=u.id where m.id is null or m.xmin::text<>u.row_version or to_jsonb(m)<>u.row_image)
 or (select count(*) from public.work_milestones where work_id='a11b0000-0000-4000-9000-000000000002' and kind in ('execution_result','decision'))<>(select count(*) from untouched)
 or exists(select 1 from untouched_results u left join private.execution_result_receipts r on r.id=u.id where r.id is null or r.xmin::text<>u.row_version or to_jsonb(r)<>u.row_image)
 or (select count(*) from private.execution_result_receipts)<>(select count(*) from untouched_results) then
  raise exception 'a result or a decision was rewritten';
 end if;
 if not exists(select 1 from public.work_continuation_requests r,jsonb_array_elements(r.affected_executions) x
  where x->>'executionId'=pg_temp.id('X1')::text and x->>'resultMilestoneId'=(select u.id::text from untouched u where u.row_image->>'kind'='execution_result')) then
  raise exception 'the request does not refer to the result milestone';
 end if;
 -- Since increment 3B plans in every dependency effect, a request whose candidates are scheduled leaves
 -- open and the next change opens a newer one, which supersedes it: one request is not superseded, every
 -- superseded one points at a newer request of the work, and each request has one proposal.
 if (select count(*) from public.work_continuation_requests where status<>'superseded')<>1
 or exists(select 1 from public.work_continuation_requests r where r.status='superseded' and not exists(select 1 from public.work_continuation_requests n
  where n.id=r.superseded_by_request_id and n.work_id=r.work_id and n.id<>r.id))
 or exists(select 1 from public.work_continuation_requests r where (select count(*) from public.work_milestones m where m.kind='continuation_proposed' and m.subject_id=r.id)<>1)
 or (select count(*) from public.work_milestones where kind='continuation_proposed')<>(select count(*) from public.work_continuation_requests) then
  raise exception 'more than one live request or proposal for one work';
 end if;
 raise notice 'PASS: results and decisions untouched; the request refers to them';
end $$;

-- ===== Stage 18, increment 3B: bounded recomputation of the affected executions. =====
-- Every group below starts again from the state after the setup drain (savepoint
-- stage18_3b_base, before section 3): X1 committed a result, X2 and X3 are queued, nothing moved.
rollback to savepoint stage18_3b_base;

-- 13. Production setup: the outbox worker account also produces recomputations, the organization's
-- producer is granted by the founder, and the helpers claim, assemble, compose and submit as the
-- worker would, for the synthetic method (whose contract is composed here, not by the capital packet).
update private.worker_tokens set execution_account_user_id='a4183000-0000-4000-8000-000000000009' where id='a4183000-0000-4000-9000-0000000000f0';
insert into dep select 'D',source_id from public.source_versions where id=pg_temp.id('D1');
insert into private.platform_principals(user_id,role,label) values('a11b0000-0000-4000-8000-000000000001','founder','Synthetic founder');
select private.grant_execution_producer_v1('a4183100-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001',true,
 'Synthetic producer grant for the recomputation proof','a11b0000-0000-4000-8000-000000000001');
create temporary table recompute_step(name text primary key,value jsonb);
create function pg_temp.remember(p_name text,p_value jsonb) returns jsonb language sql as $$
 insert into recompute_step values(p_name,p_value) on conflict(name) do update set value=excluded.value returning value;
$$;
create function pg_temp.step(p_name text) returns jsonb language sql as $$ select value from recompute_step where name=p_name $$;
-- One worker RPC as the worker account; the owner acts again afterwards.
create function pg_temp.as_worker(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;begin
 perform pg_temp.act_as('a4183000-0000-4000-8000-000000000009');
 execute p_sql into r;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 return r;
end $$;
create function pg_temp.claim() returns jsonb language sql as $$
 select pg_temp.as_worker('select public.worker_claim_dependency_recompute_v1(''synthetic-dependency-outbox-token'',120)');
$$;
create function pg_temp.lease_args(p_claim jsonb) returns text language sql as $$
 select format('%L,%L,%L',p_claim->>'candidateId',p_claim->>'leaseId',p_claim->>'capability');
$$;
create function pg_temp.basis(p_claim jsonb) returns jsonb language sql as $$
 select pg_temp.as_worker(format('select public.worker_dependency_recompute_basis_v1(''synthetic-dependency-outbox-token'',%s)',pg_temp.lease_args(p_claim)));
$$;
-- The contract the worker composes from the requester's basis: the candidate is the request id and
-- the named source versions are pinned with their verified bytes.
create function pg_temp.recompute_contract(p_claim jsonb,p_basis jsonb,p_sources text[]) returns jsonb language sql as $$
 select jsonb_build_object('schemaVersion','execution-contract.v1','executionId',gen_random_uuid(),'organizationId',b->>'organizationId','workId',b->>'workId',
  'principalId',b->>'principalId','requestId',p_claim->>'candidateId','processingRunId',gen_random_uuid(),'purpose',b->>'purpose','method',b#>'{profile,method}',
  'tools',b#>'{profile,tools}','allowedEffects',b#>'{profile,allowedEffects}',
  'audience',jsonb_build_object('kind','work_participants','workId',b->>'workId','policyFingerprint',b->>'policyFingerprint'),
  'policy',jsonb_build_object('version','execution-authority.v1','authorityRevision',b->>'authorityRevision','fingerprint',b->>'policyFingerprint'),
  'inputs',jsonb_build_object('snapshotId',gen_random_uuid(),'fingerprint',encode(extensions.digest('{}','sha256'),'hex'),
   'sources',coalesce((select jsonb_agg(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId',v.id,'contentHash',v.declared_sha256,
     'rightsRevision','1') order by v.id) from public.source_versions v join dep d on d.id=v.id where d.name=any(p_sources)),'[]'::jsonb),
   'adoptions',b->'adoptions','hypotheses',b->'hypotheses'),
  'budget',jsonb_build_object('maxCostMicrousd',0,'maxModelCalls',0,'maxDurationMs',31000,'expiresAt',clock_timestamp()+interval '1 hour'),'requestedAt',clock_timestamp())
 from (select p_basis->'basis' as b) x;
$$;
-- The canonical gates of the synthetic method, with the registration and research the basis reports.
create function pg_temp.recompute_gates(p_basis jsonb,p_blocked boolean default false) returns text language sql as $$
 select private.execution_gates_canonical_text_v1(jsonb_build_object('schemaVersion','execution-gates.v1','gatesVersion','2026.09.24-v1','blocked',p_blocked,
  'companyRegistration',p_basis#>>'{basis,company,registration}','research',p_basis#>>'{basis,company,research}',
  'methodSelection',jsonb_build_object('selectionVersion','2026.09.24-v1','situationIds',jsonb_build_array('refinancing'),
   'methodId',p_basis#>>'{basis,profile,method,methodId}','methodVersion',p_basis#>>'{basis,profile,method,methodVersion}'),
  'conventions','[]'::jsonb,'voice',jsonb_build_object('version','2026.09.24-v1','blockCount',case when p_blocked then 1 else 0 end,'warnCount',0)));
$$;
create function pg_temp.submit(p_claim jsonb,p_contract jsonb,p_gates text) returns jsonb language sql as $$
 select pg_temp.as_worker(format('select public.worker_submit_dependency_recompute_v1(''synthetic-dependency-outbox-token'',%s,%L,''{}'',%L)',
  pg_temp.lease_args(p_claim),p_contract::text,p_gates));
$$;
-- Claims the next candidate, assembles the requester's basis and submits the contract pinning the named sources.
create function pg_temp.produce(p_sources text[]) returns jsonb language plpgsql as $$
declare c jsonb;b jsonb;k jsonb;begin
 c:=pg_temp.remember('claim',pg_temp.claim());
 if not coalesce((c->>'claimed')::boolean,false) then raise exception 'nothing to claim'; end if;
 b:=pg_temp.remember('basis',pg_temp.basis(c));
 if not coalesce((b->>'available')::boolean,false) then raise exception 'basis unavailable: %',b; end if;
 k:=pg_temp.remember('contract',pg_temp.recompute_contract(c,b,p_sources));
 return pg_temp.submit(c,k,pg_temp.recompute_gates(b));
end $$;
-- The one candidate of a named execution in a state.
create function pg_temp.candidate(p_execution text,p_state text) returns public.work_recompute_candidates language plpgsql as $$
declare c public.work_recompute_candidates;begin
 select * into strict c from public.work_recompute_candidates x where pg_temp.id(p_execution)=any(x.execution_ids) and x.state=p_state;
 return c;
end $$;
-- The head input identity the database builds, from named source versions, slot decisions and the release.
create function pg_temp.identity(p_sources text[],p_decisions uuid[],p_release text) returns jsonb language sql as $$
 select private.continuation_input_identity_v1(
  coalesce((select jsonb_agg(jsonb_build_array(private.continuation_logical_key_v1('source_version',v.source_id::text),jsonb_build_object('versionNo',v.version_no,'versionId',v.id)))
   from public.source_versions v join dep d on d.id=v.id where d.name=any(p_sources)),'[]'::jsonb)
  ||coalesce((select jsonb_agg(jsonb_build_array(private.continuation_logical_key_v1('assumption_slot',a.set_id::text,a.slot_key),jsonb_build_object('decisionId',a.id)))
   from public.adoption_decisions a where a.id=any(p_decisions)),'[]'::jsonb)
  ||jsonb_build_array(jsonb_build_array(private.continuation_logical_key_v1('method_release','synthetic-execution'),
   jsonb_build_object('platformReleaseId',p_release,'houseReleaseId',null))));
$$;
-- The worker path commits a produced execution's result, as section 2 did for X1.
create function pg_temp.commit_result(p_execution uuid) returns void language plpgsql as $$
declare job uuid;claim jsonb;begin
 select id into strict job from public.processing_jobs where execution_id=p_execution;
 claim:=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',job,60);
 perform private.reserve_execution_operation_v1(job,claim->>'capability',(claim->>'leaseId')::uuid,p_execution,claim->>'contractFingerprint','synthetic#calculate','test-v1','read_only',0,0);
 perform private.settle_execution_operation_v2(job,claim->>'capability',(claim->>'leaseId')::uuid,p_execution,claim->>'contractFingerprint',
  '{"calculation":"synthetic recompute"}','succeeded','calculated',0,0);
 perform private.commit_work_execution_result_v1(job,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',
  encode(extensions.digest('{}','sha256'),'hex'),'{"calculation":"synthetic recompute"}','succeeded','calculated');
end $$;
-- A source version whose bytes the worker has not verified yet.
create function pg_temp.unverified_source_version(p_name text,p_logical uuid) returns uuid language plpgsql as $$
declare v uuid:=md5('dependency-source:'||p_name)::uuid;hash text:=encode(extensions.digest(p_name,'sha256'),'hex');
begin
 insert into public.source_documents(id,organization_id,intake_session_id,logical_source_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status)
 values(v,'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',p_logical,
  'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/'||p_name||'.txt','Synthetic source','text/plain',1,hash,'a11b0000-0000-4000-8000-000000000001','ready');
 insert into dep values(p_name,v);
 return v;
end $$;
create function pg_temp.verify(p_name text) returns void language sql as $$
 insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
 values('a11b0000-0000-4000-9000-000000000001',pg_temp.id(p_name),gen_random_uuid(),encode(extensions.digest(p_name,'sha256'),'hex'),1,'synthetic-only-'||p_name);
$$;
-- Derives a named version from another, as the derivation writer records it.
create function pg_temp.derive(p_derived text,p_parent text) returns void language sql as $$
 insert into private.resource_dependencies(organization_id,derived_version_id,source_version_id,source_rights_version_id,created_by)
 select r.organization_id,pg_temp.id(p_derived),r.source_version_id,r.id,'a11b0000-0000-4000-8000-000000000001'
 from private.source_rights_versions r where r.source_version_id=pg_temp.id(p_parent) and r.revision=1;
$$;
savepoint stage18_3b_ready;

-- 14. The recompute key is computed in SQL as continuation.ts computes it: the same vector as
-- packages/work-plan/src/continuation-sql-parity.test.ts ("recompute key parity with the SQL planner").
do $$begin
 if private.continuation_fingerprint_v1(private.continuation_input_identity_v1(jsonb_build_array(
   jsonb_build_array(private.continuation_logical_key_v1('source_version','b0183000-0000-4000-9000-000000000201'),jsonb_build_object('versionNo',2,'versionId','b0183000-0000-4000-9000-000000000212')),
   jsonb_build_array(private.continuation_logical_key_v1('method_release','synthetic-execution'),jsonb_build_object('platformReleaseId','synthetic-execution-test-v1','houseReleaseId',null)),
   jsonb_build_array(private.continuation_logical_key_v1('assumption_slot','b0183000-0000-4000-9000-000000000401',repeat('a',64)),jsonb_build_object('decisionId','b0183000-0000-4000-9000-000000000502')))))
  <>'7c3b50c503fa60ca14a58c70f3c270d868c19cd9cb73f360991f51d28d86b6b8'
 or private.dependency_recompute_key_v1('b0183000-0000-4000-9000-000000000002','b0183000-0000-4000-9000-000000000101','7c3b50c503fa60ca14a58c70f3c270d868c19cd9cb73f360991f51d28d86b6b8')
  <>'c9507ed0c443e54b42939187408b6810685a36e531fae4c117d86a28e5a1e620' then
  raise exception 'recompute identity or key differs from continuation.ts';
 end if;
 raise notice 'PASS: the input identity, its fingerprint and the recompute key equal those of continuation.ts';
end $$;

-- 15. A new version of S: X1 (bound to S1) gets one zero-budget candidate; X2 relied on S only
-- through D1, which has no newer version, so it is held until D is re-derived; X3 is reused.
select pg_temp.source_version('S2',pg_temp.id('S'));
insert into dep values('E_S2',pg_temp.id('S2'));
select pg_temp.drain_outbox();
do $$ declare r public.work_continuation_requests;c public.work_recompute_candidates;h private.dependency_recompute_holds;expected jsonb;begin
 select * into strict r from public.work_continuation_requests;
 insert into dep values('R1',r.id);
 select * into strict c from public.work_recompute_candidates;
 expected:=pg_temp.identity(array['S2'],array[pg_temp.id('dA1')],'synthetic-execution-test-v1');
 if c.request_id<>r.id or c.base_execution_id<>pg_temp.id('X1') or c.execution_ids<>array[pg_temp.id('X1')] or c.action<>'recompute' or c.state<>'scheduled'
 or c.max_cost_microusd<>0 or c.max_model_calls<>0 or c.execution_id is not null or c.reason is not null or c.revision<>1 or c.head_inputs<>expected
 or c.new_input_fingerprint<>private.continuation_fingerprint_v1(expected)
 or c.idempotency_key<>private.dependency_recompute_key_v1(r.work_id,pg_temp.id('X1'),private.continuation_fingerprint_v1(expected)) then
  raise exception 'zero-budget candidate mismatch: %',to_jsonb(c);
 end if;
 select * into strict h from private.dependency_recompute_holds;
 if h.request_id<>r.id or h.execution_id<>pg_temp.id('X2') or h.hold_kind<>'derived_source_not_rederived' or h.signal<>'source_version:'||pg_temp.id('D')::text
 or h.released_at is not null or h.subject->>'ancestorVersionId'<>pg_temp.id('S2')::text then
  raise exception 'derived source hold mismatch: %',to_jsonb(h);
 end if;
 if r.status<>'open' or exists(select 1 from private.work_recompute_leases) or (select count(*) from public.work_executions)<>3
 or exists(select 1 from public.work_milestones where kind='awaiting_human') then
  raise exception 'planning enqueued, leased or waited: %',to_jsonb(r);
 end if;
 insert into dep values('C1',c.id);
 raise notice 'PASS: a zero-budget candidate is scheduled only for the affected lineage, keyed as continuation.ts keys it; the unaffected execution is reused';
 raise notice 'PASS: hold: a derived source that carries a moved ancestor holds its execution until it is re-derived (signal source_version of the derived source)';
end $$;

-- 16. The worker produces it once, for the original requester, with lineage in the same transaction.
select pg_temp.remember('first',pg_temp.produce(array['S2']));
do $$ declare s jsonb:=pg_temp.step('first');c public.work_recompute_candidates;l private.execution_lineage;again jsonb;begin
 select * into strict c from public.work_recompute_candidates where id=pg_temp.id('C1');
 select * into strict l from private.execution_lineage;
 if not (s->>'produced')::boolean or (s->>'replayed')::boolean or s->>'requestStatus'<>'open' or c.execution_id<>(s->>'executionId')::uuid or c.state<>'scheduled' or c.revision<>2
 or l.execution_id<>c.execution_id or l.root_execution_id<>pg_temp.id('X1') or l.candidate_id<>c.id or l.work_id<>c.work_id
 or not exists(select 1 from public.processing_jobs j where j.execution_id=c.execution_id and j.kind='work_execution' and j.status='queued')
 or not exists(select 1 from private.execution_gate_receipts g where g.execution_id=c.execution_id and g.gates_fingerprint=s->>'gatesFingerprint' and not g.blocked)
 or (select w.request_id from public.work_executions w where w.id=c.execution_id)<>c.id
 or (select p.user_id from public.work_executions w join private.principals p on p.id=w.principal_id where w.id=c.execution_id)<>'a11b0000-0000-4000-8000-000000000001'
 or not exists(select 1 from private.execution_dependencies d where d.execution_id=c.execution_id and d.source_version_id=pg_temp.id('S2'))
 or (select count(*) from public.work_executions)<>4 then
  raise exception 'produced candidate mismatch: % %',s,to_jsonb(c);
 end if;
 insert into dep values('X1b',c.execution_id);
 -- The same submission again only names the execution, and nothing is left to claim.
 again:=pg_temp.submit(pg_temp.step('claim'),pg_temp.step('contract'),pg_temp.recompute_gates(pg_temp.step('basis')));
 if not (again->>'produced')::boolean or not (again->>'replayed')::boolean or again->>'executionId'<>c.execution_id::text
 or (pg_temp.claim()->>'claimed')::boolean or (select count(*) from public.work_executions)<>4 then
  raise exception 'candidate produced twice: %',again;
 end if;
 raise notice 'PASS: zero-budget candidate produced once by the worker for the original requester, with lineage, gates receipt and job in one transaction';
end $$;

-- 17. Duplicate delivery of the change changes nothing: no second candidate, no second execution.
do $$ declare before jsonb;begin
 select jsonb_build_object('requests',(select jsonb_agg(to_jsonb(r) order by r.id) from public.work_continuation_requests r),
  'candidates',(select jsonb_agg(to_jsonb(c) order by c.id) from public.work_recompute_candidates c),
  'holds',(select jsonb_agg(to_jsonb(h) order by h.id) from private.dependency_recompute_holds h)) into before;
 perform set_config('test.recompute.before',before::text,true);
end $$;
update private.event_outbox set status='pending',completed_at=null,lease_expires_at=null,capability_sha256=null,worker_token_id=null,leased_account_user_id=null
where event_id=pg_temp.id('E_S2');
select pg_temp.drain_outbox();
do $$begin
 if jsonb_build_object('requests',(select jsonb_agg(to_jsonb(r) order by r.id) from public.work_continuation_requests r),
  'candidates',(select jsonb_agg(to_jsonb(c) order by c.id) from public.work_recompute_candidates c),
  'holds',(select jsonb_agg(to_jsonb(h) order by h.id) from private.dependency_recompute_holds h))<>current_setting('test.recompute.before')::jsonb
 or (select count(*) from public.work_executions)<>4 then
  raise exception 'duplicate delivery changed the plan';
 end if;
 raise notice 'PASS: duplicate delivery plans nothing new: same request, candidates and holds, one execution';
end $$;

-- 18. D is re-derived from S2: its source_version event releases the hold and X2 gets its candidate.
select pg_temp.source_version('D2',pg_temp.id('D'));
select pg_temp.derive('D2','S2');
select pg_temp.drain_outbox();
do $$ declare c public.work_recompute_candidates;r public.work_continuation_requests;begin
 c:=pg_temp.candidate('X2','scheduled');
 select * into strict r from public.work_continuation_requests where id=pg_temp.id('R1');
 if c.base_execution_id<>pg_temp.id('X2') or c.head_inputs<>pg_temp.identity(array['D2','S2'],array[pg_temp.id('dB1')],'synthetic-execution-test-v1')
 or exists(select 1 from private.dependency_recompute_holds where released_at is null)
 or not exists(select 1 from private.dependency_recompute_holds where execution_id=pg_temp.id('X2') and released_at is not null)
 or r.status<>'scheduled' then
  raise exception 'derived source release mismatch: % %',to_jsonb(c),to_jsonb(r);
 end if;
 insert into dep values('C2',c.id);
 raise notice 'PASS: release: the new version of the derived source releases the hold and plans its candidate; the request leaves open';
end $$;

-- 19. Worker restart: a claim, its lease expires, a second claim takes the candidate again; the
-- stale lease can neither assemble nor submit, and one execution is produced.
do $$ declare first_claim jsonb;second_claim jsonb;b jsonb;result jsonb;begin
 first_claim:=pg_temp.claim();
 if first_claim->>'candidateId'<>pg_temp.id('C2')::text or (first_claim->>'attempt')::integer<>1 then raise exception 'setup: first claim %',first_claim; end if;
 update private.work_recompute_leases set lease_expires_at=clock_timestamp()-interval '1 minute' where candidate_id=pg_temp.id('C2');
 second_claim:=pg_temp.claim();
 if second_claim->>'candidateId'<>pg_temp.id('C2')::text or (second_claim->>'attempt')::integer<>2 or second_claim->>'leaseId'=first_claim->>'leaseId' then
  raise exception 'expired lease not reclaimed: %',second_claim;
 end if;
 b:=pg_temp.basis(second_claim);
 begin perform pg_temp.basis(first_claim); raise exception 'stale lease assembled a basis';
 exception when insufficient_privilege then if sqlerrm<>'recompute_lease_denied' then raise; end if;
 end;
 begin perform pg_temp.submit(first_claim,pg_temp.recompute_contract(first_claim,b,array['D2']),pg_temp.recompute_gates(b)); raise exception 'stale lease submitted';
 exception when insufficient_privilege then if sqlerrm<>'recompute_lease_denied' then raise; end if;
 end;
 result:=pg_temp.submit(second_claim,pg_temp.recompute_contract(second_claim,b,array['D2']),pg_temp.recompute_gates(b));
 if not (result->>'produced')::boolean or (select count(*) from public.work_executions where request_id=pg_temp.id('C2'))<>1
 or (select execution_id from public.work_recompute_candidates where id=pg_temp.id('C2'))<>(result->>'executionId')::uuid then
  raise exception 'worker restart produced twice or nothing: %',result;
 end if;
 insert into dep values('X2b',(result->>'executionId')::uuid);
 raise notice 'PASS: worker restart (claim, lease expiry, reclaim) produces one execution; the stale lease is refused';
end $$;

-- 20. Settlement: each produced execution commits its result and settles its candidate; when every
-- candidate of the request is settled the request is ready. No decision is written.
select pg_temp.commit_result(pg_temp.id('X1b'));
do $$begin
 if (select state from public.work_recompute_candidates where id=pg_temp.id('C1'))<>'settled'
 or (select status from public.work_continuation_requests where id=pg_temp.id('R1'))<>'scheduled' then
  raise exception 'first settlement mismatch';
 end if;
end $$;
select pg_temp.commit_result(pg_temp.id('X2b'));
do $$begin
 if exists(select 1 from public.work_recompute_candidates where state<>'settled')
 or (select status from public.work_continuation_requests where id=pg_temp.id('R1'))<>'ready'
 or (select count(*) from public.work_milestones where kind='decision')<>(select count(*) from untouched where row_image->>'kind'='decision')
 or (select count(*) from public.work_milestones where kind='execution_result' and subject_id in (pg_temp.id('X1b'),pg_temp.id('X2b')))<>2
 or exists(select 1 from untouched u left join public.work_milestones m on m.id=u.id where m.id is null or m.xmin::text<>u.row_version or to_jsonb(m)<>u.row_image)
 or exists(select 1 from untouched_results u left join private.execution_result_receipts r on r.id=u.id where r.id is null or r.xmin::text<>u.row_version or to_jsonb(r)<>u.row_image) then
  raise exception 'settlement to ready mismatch';
 end if;
 raise notice 'PASS: settlement: committed results settle their candidates and the request becomes ready; no decision written, earlier results and decisions untouched';
end $$;

-- 21. Lineage across two consecutive updates: S3 affects X1 and its recomputation X1b; both are one
-- lineage with root X1, planned once from its newest execution, and the new request names X1 as
-- the root of X1b. X2b, re-derived only from S2, is held again.
select pg_temp.source_version('S3',pg_temp.id('S'));
select pg_temp.drain_outbox();
do $$ declare r public.work_continuation_requests;c public.work_recompute_candidates;begin
 select * into strict r from public.work_continuation_requests where status='open';
 insert into dep values('R2',r.id);
 c:=pg_temp.candidate('X1b','scheduled');
 if c.request_id<>r.id or c.base_execution_id<>pg_temp.id('X1') or c.execution_ids<>(select array_agg(x order by x) from unnest(array[pg_temp.id('X1'),pg_temp.id('X1b')]) x)
 or c.head_inputs<>pg_temp.identity(array['S3'],(select array_agg(decision_id) from private.assumption_version_items where version_id=pg_temp.id('V2')),'synthetic-execution-test-v1') then
  raise exception 'lineage candidate mismatch: %',to_jsonb(c);
 end if;
 if (select x->>'rootExecutionId' from jsonb_array_elements(r.affected_executions) x where x->>'executionId'=pg_temp.id('X1b')::text)<>pg_temp.id('X1')::text
 or (select x->>'rootExecutionId' from jsonb_array_elements(r.affected_executions) x where x->>'executionId'=pg_temp.id('X2b')::text)<>pg_temp.id('X2')::text then
  raise exception 'request does not name the lineage root: %',r.affected_executions;
 end if;
 if not exists(select 1 from private.dependency_recompute_holds where execution_id=pg_temp.id('X2b') and hold_kind='derived_source_not_rederived' and released_at is null) then
  raise exception 'the recomputation of X2 is not held on its derived source';
 end if;
 insert into dep values('C3',c.id);
end $$;
select pg_temp.remember('third',pg_temp.produce(array['S3']));
do $$begin
 if (select root_execution_id from private.execution_lineage where candidate_id=pg_temp.id('C3'))<>pg_temp.id('X1') then
  raise exception 'a recomputation of a recomputation does not name the root';
 end if;
 insert into dep values('X1c',(pg_temp.step('third')->>'executionId')::uuid);
 raise notice 'PASS: lineage root kept across two consecutive updates: one candidate per lineage, the request and the lineage name X1';
end $$;

-- 22. Supersession. S4 arrives before X1c commits: the scheduled candidate of S3 is superseded and a
-- new one covers the lineage. D is re-derived from S4, so the open request leaves open with two
-- scheduled candidates; S5 then supersedes both, and the request, whose candidates were all
-- superseded, becomes superseded, pointing at the newer request.
select pg_temp.source_version('S4',pg_temp.id('S'));
select pg_temp.drain_outbox();
do $$ declare c public.work_recompute_candidates;begin
 select * into strict c from public.work_recompute_candidates where id=pg_temp.id('C3');
 if c.state<>'declined' or c.reason<>'superseded' or c.execution_id<>pg_temp.id('X1c') then raise exception 'produced candidate of old heads not superseded: %',to_jsonb(c); end if;
 c:=pg_temp.candidate('X1c','scheduled');
 if c.request_id<>pg_temp.id('R2') or c.base_execution_id<>pg_temp.id('X1') then raise exception 'lineage not planned again: %',to_jsonb(c); end if;
 insert into dep values('C4',c.id);
end $$;
select pg_temp.source_version('D3',pg_temp.id('D'));
select pg_temp.derive('D3','S4');
select pg_temp.drain_outbox();
do $$begin
 if (select status from public.work_continuation_requests where id=pg_temp.id('R2'))<>'scheduled'
 or (select count(*) from public.work_recompute_candidates where request_id=pg_temp.id('R2') and state='scheduled')<>2 then
  raise exception 'setup: the request did not leave open with two scheduled candidates';
 end if;
end $$;
select pg_temp.source_version('S5',pg_temp.id('S'));
select pg_temp.drain_outbox();
do $$ declare r public.work_continuation_requests;newer public.work_continuation_requests;begin
 select * into strict r from public.work_continuation_requests where id=pg_temp.id('R2');
 select * into strict newer from public.work_continuation_requests where status='open';
 if r.status<>'superseded' or r.superseded_by_request_id<>newer.id
 or exists(select 1 from public.work_recompute_candidates where request_id=r.id and not (state='declined' and reason='superseded'))
 or not exists(select 1 from public.work_recompute_candidates where request_id=newer.id and base_execution_id=pg_temp.id('X1') and state='scheduled')
 or (select status from public.work_continuation_requests where id=pg_temp.id('R1'))<>'ready' then
  raise exception 'request supersession mismatch: % %',to_jsonb(r),to_jsonb(newer);
 end if;
 raise notice 'PASS: supersession by a newer change: open candidates of old heads are superseded and a request whose candidates were all superseded points at the newer one; a ready request stays ready';
end $$;

-- 23. The contract of the new storage: candidate identity and states, lineage, holds and leases.
do $$ declare c public.work_recompute_candidates;begin
 select * into strict c from public.work_recompute_candidates where id=pg_temp.id('C1');
 begin update public.work_recompute_candidates set idempotency_key=repeat('0',64),revision=revision+1 where id=c.id; raise exception 'candidate identity rewritten';
 exception when check_violation then if sqlerrm not in ('work_recompute_candidate_transition_invalid','new row for relation "work_recompute_candidates" violates check constraint "work_recompute_candidates_identity"') then raise; end if;
 end;
 begin update public.work_recompute_candidates set state='failed',reason='synthetic',revision=revision+1 where id=c.id; raise exception 'settled candidate reopened';
 exception when check_violation then if sqlerrm<>'work_recompute_candidate_transition_invalid' then raise; end if;
 end;
 begin update public.work_recompute_candidates set state='scheduled',revision=revision+1 where id=pg_temp.id('C4'); raise exception 'superseded candidate rescheduled';
 exception when check_violation then if sqlerrm<>'work_recompute_candidate_transition_invalid' then raise; end if;
 end;
 begin update public.work_recompute_candidates set reason='requester_not_authorized:forged',revision=revision+1 where id=pg_temp.id('C4'); raise exception 'reason rewritten';
 exception when check_violation then if sqlerrm<>'work_recompute_candidate_transition_invalid' then raise; end if;
 end;
 begin update public.work_recompute_candidates set state='settled' where state='scheduled'; raise exception 'write without a new revision accepted';
 exception when check_violation then if sqlerrm<>'work_recompute_candidate_transition_invalid' then raise; end if;
 end;
 begin update public.work_recompute_candidates set execution_id=pg_temp.id('X2b'),revision=revision+1 where id=c.id; raise exception 'execution reattached';
 exception when check_violation then if sqlerrm<>'work_recompute_candidate_transition_invalid' then raise; end if;
 end;
 begin delete from public.work_recompute_candidates where id=c.id; raise exception 'candidate deleted';
 exception when check_violation then if sqlerrm<>'work_continuity_history_immutable' then raise; end if;
 end;
 begin truncate public.work_recompute_candidates cascade; raise exception 'candidates truncated';
 exception when check_violation then if sqlerrm<>'work_continuity_history_immutable' then raise; end if;
 end;
 begin update private.execution_lineage set root_execution_id=pg_temp.id('X1b'); raise exception 'lineage rewritten';
 exception when check_violation then if sqlerrm<>'work_continuity_history_immutable' then raise; end if;
 end;
 begin
  insert into private.execution_lineage(organization_id,work_id,execution_id,root_execution_id,candidate_id)
  values(c.organization_id,c.work_id,pg_temp.id('X3'),pg_temp.id('X1b'),pg_temp.id('C4'));
  raise exception 'lineage rooted in a recomputation';
 exception when check_violation then if sqlerrm<>'execution_lineage_invalid' then raise; end if;
 end;
 begin update private.dependency_recompute_holds set released_at=null where released_at is not null; raise exception 'released hold reopened';
 exception when check_violation then if sqlerrm<>'dependency_recompute_hold_transition_invalid' then raise; end if;
 end;
 begin delete from private.work_recompute_leases; raise exception 'lease deleted';
 exception when check_violation then if sqlerrm<>'work_continuity_history_immutable' then raise; end if;
 end;
 if not private.work_recompute_transition_allowed_v1('awaiting_authorization','scheduled') or private.work_recompute_transition_allowed_v1('settled','scheduled')
 or private.work_recompute_transition_allowed_v1('declined','scheduled') or private.work_recompute_transition_allowed_v1('scheduled','awaiting_authorization') then
  raise exception 'candidate state machine is not forward only';
 end if;
 raise notice 'PASS: candidates keep their identity and move forward only; lineage and holds are immutable history; nothing is deleted';
end $$;

-- 24. Read authority is the work's; nobody writes through the API; the private storage is closed;
-- the worker RPCs refuse a caller that is not the bound worker account.
select set_config('test.recompute.candidates',(select count(*) from public.work_recompute_candidates)::text,true);
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
do $$ declare attempt text;begin
 if (select count(*) from public.work_recompute_candidates)<>current_setting('test.recompute.candidates')::bigint or current_setting('test.recompute.candidates')::bigint<5 then
  raise exception 'work owner does not read the candidates of the work';
 end if;
 foreach attempt in array array[
  'update public.work_recompute_candidates set state=''declined'',reason=''forged'',revision=revision+1',
  'delete from public.work_recompute_candidates',
  'insert into public.work_recompute_candidates(organization_id,work_id,request_id,idempotency_key,base_execution_id,new_input_fingerprint,head_inputs,action,max_cost_microusd,max_model_calls,execution_ids,state) select organization_id,work_id,request_id,repeat(''1'',64),base_execution_id,new_input_fingerprint,head_inputs,action,0,0,execution_ids,''scheduled'' from public.work_recompute_candidates limit 1',
  'select count(*) from private.execution_lineage','select count(*) from private.dependency_recompute_holds','select count(*) from private.work_recompute_leases',
  'select private.plan_dependency_recompute_v1(''a11b0000-0000-4000-9000-000000000001'',''a11b0000-0000-4000-9000-000000000002'')'] loop
  begin execute attempt; raise exception 'work owner reached a writer or the private storage: %',attempt;
  exception when insufficient_privilege then null;
  end;
 end loop;
 begin perform public.worker_claim_dependency_recompute_v1('synthetic-dependency-outbox-token',120); raise exception 'a person claimed as the worker';
 exception when insufficient_privilege then if sqlerrm<>'worker_account_binding_required' then raise; end if;
 end;
 raise notice 'PASS: the work owner reads the candidates and cannot write them, read the private storage, plan or claim';
end $$;
reset role;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
set local role authenticated;
do $$begin
 if exists(select 1 from public.work_recompute_candidates) then raise exception 'member without access to the work reads its candidates'; end if;
 raise notice 'PASS: a member without access to the work sees none of its candidates';
end $$;
reset role;
set local role anon;
do $$begin
 begin perform 1 from public.work_recompute_candidates; raise exception 'anon read candidates';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
do $$ declare role_name text;f record;begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'private.execution_lineage','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  or has_table_privilege(role_name,'private.dependency_recompute_holds','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  or has_table_privilege(role_name,'private.work_recompute_leases','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
   raise exception 'private recompute storage exposed to %',role_name;
  end if;
 end loop;
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in ('assumption_version_readable_as_subject_v1','execution_contract_basis_as_subject_v1','execution_contract_basis_as_subject_v2',
   'request_work_execution_producer_as_subject_v1','request_work_execution_producer_as_subject_v2','execution_recompute_assessment_v1','plan_dependency_recompute_v1',
   'plan_open_dependency_requests_v1','advance_dependency_update_request_v1','close_recompute_candidate_v1','lock_recompute_lease_v1','signal_source_bindable_v1',
   'capture_method_executable_event_v1','settle_recompute_candidate_v1','dependency_lineage_representative_v1','execution_realizes_inputs_v1') loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,f.signature,'EXECUTE') then raise exception 'closed function exposed: % %',role_name,f.signature; end if;
  end loop;
 end loop;
 if not has_function_privilege('authenticated','public.worker_claim_dependency_recompute_v1(text,integer)','EXECUTE')
 or has_function_privilege('anon','public.worker_claim_dependency_recompute_v1(text,integer)','EXECUTE')
 or has_function_privilege('service_role','public.worker_submit_dependency_recompute_v1(text,uuid,uuid,text,text,text,text)','EXECUTE')
 or not (public.worker_runtime_schema_contract_v1()->'capabilities') ? 'dependency-recompute.v1' then
  raise exception 'worker recompute RPC grants or capability mismatch';
 end if;
 raise notice 'PASS: private recompute storage and every new internal function are closed to the API roles; the worker RPCs are behind the worker binding';
end $$;

-- 25. A new head version whose bytes are not verified holds the execution that pinned the source; the
-- verification the worker records is the signal: the hold is released and the candidate planned in
-- that transaction. A later version without current rights is held the same way until its rights are
-- recorded.
rollback to savepoint stage18_3b_ready;
select pg_temp.unverified_source_version('T2',pg_temp.id('T'));
select pg_temp.drain_outbox();
do $$begin
 if exists(select 1 from public.work_recompute_candidates)
 or not exists(select 1 from private.dependency_recompute_holds where execution_id=pg_temp.id('X3') and hold_kind='source_not_bindable'
  and signal='source_bindable:'||pg_temp.id('T2')::text and released_at is null) then
  raise exception 'unverified head not held';
 end if;
end $$;
select pg_temp.verify('T2');
do $$begin
 if exists(select 1 from private.dependency_recompute_holds where released_at is null)
 or (pg_temp.candidate('X3','scheduled')).head_inputs<>pg_temp.identity(array['T2'],array[]::uuid[],'synthetic-execution-test-v1') then
  raise exception 'verification did not release the hold';
 end if;
 raise notice 'PASS: hold and release: an unverified head version holds its execution; the verification (signal source_bindable) plans it';
end $$;
alter table public.source_versions disable trigger zzz_fixture_source_rights;
select pg_temp.source_version('T3',pg_temp.id('T'));
alter table public.source_versions enable trigger zzz_fixture_source_rights;
select pg_temp.drain_outbox();
do $$begin
 if (select state||':'||reason from public.work_recompute_candidates where head_inputs=pg_temp.identity(array['T2'],array[]::uuid[],'synthetic-execution-test-v1'))<>'declined:superseded'
 or not exists(select 1 from private.dependency_recompute_holds where execution_id=pg_temp.id('X3') and hold_kind='source_not_bindable'
  and signal='source_bindable:'||pg_temp.id('T3')::text and released_at is null) then
  raise exception 'a head without rights not held';
 end if;
end $$;
insert into private.source_rights_versions(organization_id,source_version_id,revision,operations,purposes,audience,valid_from,evidence_kind,evidence_reference,evidence_sha256,created_by)
select organization_id,id,1,array['read','process','store','derive'],array['analysis'],'authorized_workspace',clock_timestamp()-interval '1 minute','human_declaration',id,
 encode(extensions.digest('SYNTHETIC DECLARATION: '||id::text,'sha256'),'hex'),created_by from public.source_versions where id=pg_temp.id('T3');
do $$begin
 if exists(select 1 from private.dependency_recompute_holds where released_at is null)
 or (pg_temp.candidate('X3','scheduled')).head_inputs<>pg_temp.identity(array['T3'],array[]::uuid[],'synthetic-execution-test-v1') then
  raise exception 'rights did not release the hold';
 end if;
 raise notice 'PASS: hold and release: a head version without current rights is held until its rights are recorded (signal source_bindable)';
end $$;

-- 26. A newer platform release of the procedure, with its profile, whose capability is not released:
-- every affected lineage is held; releasing the capability (universal) is a method_release event for
-- the organization, which releases the holds and plans each lineage under the new release.
rollback to savepoint stage18_3b_ready;
insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source)
values('synthetic-execution-v2',false,'internal','synthetic-execution','test-v2','tested','Synthetic approver',current_date,'Synthetic rollback-only fixture');
insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)
select 'synthetic-execution-test-v2','synthetic-execution','test-v2',repeat('9',64),manifest,components,evidence,approval,'synthetic-execution-v2'
from private.platform_method_releases where id='synthetic-execution-test-v1';
insert into private.execution_method_profiles(id,platform_release_id,serialization_version,canonical_payload,payload_fingerprint,adapter_source_commit,review_evidence)
select 'a4183100-0000-4000-9000-0000000000b2','synthetic-execution-test-v2','offroad-execution-json-utf16-v1',payload::text,
 encode(extensions.digest(payload::text,'sha256'),'hex'),repeat('c',40),jsonb_build_object('result','approved','subjectCommit',repeat('c',40),'reviewer','Synthetic independent reviewer','sourceHash',repeat('d',64))
from (select jsonb_set(jsonb_set(jsonb_set(jsonb_set(p.payload,'{method,platformReleaseId}','"synthetic-execution-test-v2"'),'{method,methodVersion}','"test-v2"'),
 '{method,manifestHash}',to_jsonb(repeat('9',64))),'{method,baseManifestHash}',to_jsonb(repeat('9',64))) payload
 from private.execution_method_profiles p where p.id='a4171000-0000-4000-9000-000000000001') f;
select pg_temp.drain_outbox();
do $$begin
 if exists(select 1 from public.work_recompute_candidates)
 or (select count(distinct execution_id) from private.dependency_recompute_holds where hold_kind='method_not_executable' and signal='method_release:synthetic-execution' and released_at is null)<>3
 or not exists(select 1 from private.domain_events where aggregate_kind='method_release' and protected_state->>'source'='execution_method_profiles') then
  raise exception 'a head release without an executable profile did not hold';
 end if;
end $$;
update private.platform_capability_releases set released=false where capability_key='synthetic-execution';
update private.platform_capability_releases set released=true,exposure='universal' where capability_key='synthetic-execution-v2';
do $$begin
 if not exists(select 1 from private.domain_events e join private.event_outbox o on o.event_id=e.id where e.organization_id='a11b0000-0000-4000-9000-000000000001'
  and e.aggregate_kind='method_release' and e.aggregate_id=private.method_procedure_aggregate_v1('synthetic-execution') and e.effect='propagate_dependencies'
  and e.protected_state->>'source'='platform_capability_releases' and e.protected_state->>'record_key'='synthetic-execution-v2' and o.status='pending') then
  raise exception 'released capability emitted no method_release event';
 end if;
end $$;
select pg_temp.drain_outbox();
do $$begin
 if exists(select 1 from private.dependency_recompute_holds where released_at is null)
 or (select count(*) from public.work_recompute_candidates where state='scheduled' and head_inputs->'inputs' @> jsonb_build_array(jsonb_build_array(
   private.continuation_logical_key_v1('method_release','synthetic-execution'),jsonb_build_object('platformReleaseId','synthetic-execution-test-v2','houseReleaseId',null))))<>3 then
  raise exception 'capability release did not release the holds';
 end if;
 raise notice 'PASS: hold and release: a head release without an executable profile holds; the capability released and universal emits method_release and plans every lineage';
end $$;

-- 27. A source that reached the work through its working basis: X4 pins L1, the source of an
-- adopted observation. L2 is held until a new revision of the basis refers to it; that
-- assumption_version event releases the hold.
rollback to savepoint stage18_3b_ready;
select pg_temp.source_version('L1',null);
insert into dep select 'L',source_id from public.source_versions where id=pg_temp.id('L1');
select set_config('test.recompute.l1',pg_temp.id('L1')::text,true),set_config('test.recompute.v2',pg_temp.id('V2')::text,true);
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('test.recompute.l1_observation',public.record_observation_v1(jsonb_build_object('requestId','a4183100-0000-4000-9000-000000000101',
 'dossierId',current_setting('test.adoption.dossier')::uuid,'fieldPath','financials.net_debt','dimensions',current_setting('test.adoption.dimensions')::jsonb,
 'value',jsonb_build_object('type','number','value','310'),'sourceVersionId',current_setting('test.recompute.l1')::uuid,'anchor',jsonb_build_object('page',1,'row','net debt'),
 'supersedesId',current_setting('test.adoption.observation')::uuid))::text,true);
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb||jsonb_build_object('requestId','a4183100-0000-4000-9000-000000000102',
 'expectedVersionId',current_setting('test.recompute.v2')::uuid,'observationId',current_setting('test.recompute.l1_observation')));
reset role;
insert into dep values('VL1','a4183100-0000-4000-9000-000000000102');
select pg_temp.request_execution('X4','a4171000-0000-4000-9000-000000000001',array['L1'],
 (select array_agg(decision_id) from private.assumption_version_items where version_id=pg_temp.id('VL1')),pg_temp.id('VL1'));
select pg_temp.drain_outbox();
select pg_temp.source_version('L2',pg_temp.id('L'));
select pg_temp.drain_outbox();
do $$begin
 if exists(select 1 from public.work_recompute_candidates where pg_temp.id('X4')=any(execution_ids))
 or not exists(select 1 from private.dependency_recompute_holds where execution_id=pg_temp.id('X4') and hold_kind='basis_behind_source'
  and signal='assumption_version:'||(select set_id from public.assumption_versions where id=pg_temp.id('VL1'))::text and released_at is null) then
  raise exception 'a source ahead of its working basis did not hold';
 end if;
end $$;
select set_config('test.recompute.l2',pg_temp.id('L2')::text,true),set_config('test.recompute.vl1',pg_temp.id('VL1')::text,true);
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('test.recompute.l2_observation',public.record_observation_v1(jsonb_build_object('requestId','a4183100-0000-4000-9000-000000000103',
 'dossierId',current_setting('test.adoption.dossier')::uuid,'fieldPath','financials.net_debt','dimensions',current_setting('test.adoption.dimensions')::jsonb,
 'value',jsonb_build_object('type','number','value','320'),'sourceVersionId',current_setting('test.recompute.l2')::uuid,'anchor',jsonb_build_object('page',1,'row','net debt'),
 'supersedesId',current_setting('test.recompute.l1_observation')::uuid))::text,true);
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb||jsonb_build_object('requestId','a4183100-0000-4000-9000-000000000104',
 'expectedVersionId',current_setting('test.recompute.vl1')::uuid,'observationId',current_setting('test.recompute.l2_observation')));
reset role;
select pg_temp.drain_outbox();
do $$begin
 if exists(select 1 from private.dependency_recompute_holds where execution_id=pg_temp.id('X4') and released_at is null)
 or (pg_temp.candidate('X4','scheduled')).head_inputs<>pg_temp.identity(array['L2'],
  (select array_agg(decision_id) from private.assumption_version_items where version_id='a4183100-0000-4000-9000-000000000104'
   and slot_key in (select slot_key from private.assumption_version_items where version_id=pg_temp.id('VL1'))),'synthetic-execution-test-v1') then
  raise exception 'the new basis revision did not release the hold';
 end if;
 raise notice 'PASS: hold and release: a source reached through the working basis is held until a basis revision refers to its new version (signal assumption_version)';
end $$;

-- 28. A positive budget waits for a person: the candidate awaits authorization with a persisted
-- awaiting_human milestone, no lease, no job, nothing to claim. A newer change supersedes it, and
-- the new wait closes the old one.
rollback to savepoint stage18_3b_ready;
insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source)
values('synthetic-execution-paid',true,'universal','synthetic-execution','test-v3','tested','Synthetic approver',current_date,'Synthetic rollback-only fixture');
update private.platform_capability_releases set released=false where capability_key='synthetic-execution';
insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)
select 'synthetic-execution-test-v3','synthetic-execution','test-v3',repeat('8',64),manifest,components,evidence,approval,'synthetic-execution-paid'
from private.platform_method_releases where id='synthetic-execution-test-v1';
-- Every stored profile is held at zero by its storage check; a paid ceiling exists only for this proof.
alter table private.execution_method_profiles disable trigger execution_method_profiles_validate;
insert into private.execution_method_profiles(id,platform_release_id,serialization_version,canonical_payload,payload_fingerprint,adapter_source_commit,review_evidence)
select 'a4183100-0000-4000-9000-0000000000b3','synthetic-execution-test-v3','offroad-execution-json-utf16-v1',payload::text,
 encode(extensions.digest(payload::text,'sha256'),'hex'),repeat('c',40),jsonb_build_object('result','approved','subjectCommit',repeat('c',40),'reviewer','Synthetic independent reviewer','sourceHash',repeat('d',64))
from (select jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(p.payload,'{method,platformReleaseId}','"synthetic-execution-test-v3"'),'{method,methodVersion}','"test-v3"'),
 '{method,manifestHash}',to_jsonb(repeat('8',64))),'{method,baseManifestHash}',to_jsonb(repeat('8',64))),'{limits}','{"maxCostMicrousd":250000,"maxModelCalls":3,"maxDurationMs":31000}') payload
 from private.execution_method_profiles p where p.id='a4171000-0000-4000-9000-000000000001') f;
alter table private.execution_method_profiles enable trigger execution_method_profiles_validate;
select pg_temp.drain_outbox();
do $$ declare c public.work_recompute_candidates;m public.work_milestones;jobs bigint;begin
 if (select count(*) from public.work_recompute_candidates)<>3 then raise exception 'paid head not planned for every lineage'; end if;
 for c in select * from public.work_recompute_candidates loop
  select * into strict m from public.work_milestones where kind='awaiting_human' and subject_kind='work_recompute_candidate' and subject_id=c.id;
  if c.state<>'awaiting_authorization' or c.action<>'await_authorization' or c.max_cost_microusd<>250000 or c.max_model_calls<>3 or c.execution_id is not null
  or m.work_id<>c.work_id or m.label<>'dependency_recompute_authorization' or m.created_by is not null or m.supersedes_milestone_id is not null then
   raise exception 'paid candidate does not wait for a person: % %',to_jsonb(c),to_jsonb(m);
  end if;
 end loop;
 select count(*) into jobs from public.processing_jobs where kind='work_execution';
 if exists(select 1 from private.work_recompute_leases) or (pg_temp.claim()->>'claimed')::boolean or jobs<>3
 or (select count(distinct request_id) from public.work_recompute_candidates)<>1
 or (select r.status from public.work_continuation_requests r where r.id=(select min(request_id::text)::uuid from public.work_recompute_candidates))<>'awaiting_authorization' then
  raise exception 'a paid candidate was enqueued, leased or claimed';
 end if;
 -- The release, its profile and its capability are three events of one change: the requests they
 -- opened after the first are covered by its candidates and point at it.
 if exists(select 1 from public.work_continuation_requests r where r.id<>(select min(request_id::text)::uuid from public.work_recompute_candidates)
  and (r.status<>'superseded' or r.superseded_by_request_id<>(select min(request_id::text)::uuid from public.work_recompute_candidates))) then
  raise exception 'a request that only repeats covered changes was left open';
 end if;
 raise notice 'PASS: positive budget waits with its awaiting_human milestone: no job, no lease, nothing to claim; the request awaits authorization';
end $$;
select pg_temp.source_version('S2',pg_temp.id('S'));
select pg_temp.drain_outbox();
do $$ declare old_wait uuid;new_wait public.work_milestones;begin
 select m.id into strict old_wait from public.work_recompute_candidates c join public.work_milestones m on m.subject_id=c.id
  where pg_temp.id('X1')=any(c.execution_ids) and c.state='declined' and c.reason='superseded';
 select m.* into strict new_wait from public.work_recompute_candidates c join public.work_milestones m on m.subject_id=c.id
  where pg_temp.id('X1')=any(c.execution_ids) and c.state='awaiting_authorization';
 if new_wait.supersedes_milestone_id is distinct from old_wait then raise exception 'new wait does not close the superseded one: %',to_jsonb(new_wait); end if;
 raise notice 'PASS: a newer change supersedes a waiting candidate and its new wait closes the old one';
end $$;

-- 29. Requester without authority, and the authority sweep unchanged. X1's candidate is claimed and
-- its basis assembled; X2's candidate (after D is re-derived) is produced; then the owner is
-- suspended. The sweep cancels the owner's queued jobs exactly as before, which fails the candidate
-- whose execution was cancelled; the submission of X1's candidate is declined for the requester, and
-- a later candidate is declined when its basis is assembled.
rollback to savepoint stage18_3b_ready;
select pg_temp.source_version('S2',pg_temp.id('S'));
select pg_temp.drain_outbox();
select pg_temp.remember('x1claim',pg_temp.claim());
select pg_temp.remember('x1basis',pg_temp.basis(pg_temp.step('x1claim')));
select pg_temp.source_version('D2',pg_temp.id('D'));
select pg_temp.derive('D2','S2');
select pg_temp.drain_outbox();
-- X1's candidate is under its lease: the next claim takes X2's.
select pg_temp.remember('x2',pg_temp.produce(array['D2']));
insert into dep select 'X2b',(pg_temp.step('x2')->>'executionId')::uuid;
insert into dep select 'C2',id from public.work_recompute_candidates where execution_id=pg_temp.id('X2b');
update public.organization_memberships set status='suspended' where organization_id='a11b0000-0000-4000-9000-000000000001' and user_id='a11b0000-0000-4000-8000-000000000001';
select pg_temp.drain_outbox();
do $$ declare result jsonb;begin
 if pg_temp.step('x1claim')->>'candidateId'=pg_temp.id('C2')::text then raise exception 'setup: X2 was claimed first'; end if;
 if exists(select 1 from public.processing_jobs where execution_id in (pg_temp.id('X2'),pg_temp.id('X3'),pg_temp.id('X2b'))
  and (status<>'cancelled' or capability_sha256 is not null or last_error<>'{"reason":"authorization_revoked"}'::jsonb))
 or (select count(*) from private.access_decision_events a join public.processing_jobs j on j.id=a.processing_job_id
  where j.execution_id in (pg_temp.id('X2'),pg_temp.id('X3'),pg_temp.id('X2b')) and a.decision='deny' and a.reason='authorization_revoked')<>3
 or exists(select 1 from private.access_decision_events a join public.processing_jobs j on j.id=a.processing_job_id where j.execution_id=pg_temp.id('X1')) then
  raise exception 'the authority sweep changed';
 end if;
 if (select state||':'||reason from public.work_recompute_candidates where id=pg_temp.id('C2'))<>'failed:execution_cancelled' then
  raise exception 'cancelled candidate execution did not fail its candidate';
 end if;
 result:=pg_temp.submit(pg_temp.step('x1claim'),pg_temp.recompute_contract(pg_temp.step('x1claim'),pg_temp.step('x1basis'),array['S2']),pg_temp.recompute_gates(pg_temp.step('x1basis')));
 if (result->>'produced')::boolean or result->>'state'<>'declined' or result->>'reason'<>'requester_not_authorized:execution_access_denied'
 or exists(select 1 from public.work_executions where request_id=(pg_temp.step('x1claim')->>'candidateId')::uuid) then
  raise exception 'submission for a requester without authority not declined: %',result;
 end if;
 raise notice 'PASS: the authority sweep is unchanged and a cancelled candidate execution fails its candidate';
 raise notice 'PASS: requester without current authority: the submission is declined with the reason, no execution';
end $$;
select pg_temp.source_version('S3',pg_temp.id('S'));
select pg_temp.drain_outbox();
do $$ declare c jsonb;b jsonb;begin
 c:=pg_temp.claim();
 b:=pg_temp.basis(c);
 if (b->>'available')::boolean or b->>'state'<>'declined' or b->>'reason'<>'requester_not_authorized:execution_access_denied'
 or (select state from public.work_recompute_candidates where id=(c->>'candidateId')::uuid)<>'declined' then
  raise exception 'basis for a requester without authority not declined: %',b;
 end if;
 raise notice 'PASS: requester without current authority: assembling the basis declines the candidate with the reason';
end $$;

-- 30. Gate refusal: blocked gates fail the candidate with the gate code at submission, and a refusal
-- the worker found before submitting fails it through the named code; free text is refused.
rollback to savepoint stage18_3b_ready;
select pg_temp.source_version('S2',pg_temp.id('S'));
select pg_temp.source_version('D2',pg_temp.id('D'));
select pg_temp.derive('D2','S2');
select pg_temp.drain_outbox();
do $$ declare c jsonb;b jsonb;result jsonb;executions bigint:=(select count(*) from public.work_executions);begin
 c:=pg_temp.claim();b:=pg_temp.basis(c);
 result:=pg_temp.submit(c,pg_temp.recompute_contract(c,b,array['S2','D2']),pg_temp.recompute_gates(b,true));
 if (result->>'produced')::boolean or result->>'state'<>'failed' or result->>'reason'<>'execution_gates_blocked' then raise exception 'blocked gates not failed: %',result; end if;
 c:=pg_temp.claim();
 begin perform pg_temp.as_worker(format('select public.worker_fail_dependency_recompute_v1(''synthetic-dependency-outbox-token'',%s,%L)',pg_temp.lease_args(c),'Synthetic free text'));
  raise exception 'free text failure code accepted';
 exception when invalid_parameter_value then if sqlerrm<>'recompute_failure_code_invalid' then raise; end if;
 end;
 result:=pg_temp.as_worker(format('select public.worker_fail_dependency_recompute_v1(''synthetic-dependency-outbox-token'',%s,%L)',pg_temp.lease_args(c),'voice_blocked'));
 if not (result->>'failed')::boolean or (select state||':'||reason from public.work_recompute_candidates where id=(c->>'candidateId')::uuid)<>'failed:voice_blocked'
 or (select count(*) from public.work_executions)<>executions then
  raise exception 'gate refusal of the worker not recorded: %',result;
 end if;
 raise notice 'PASS: gate refusal: blocked gates fail the candidate with the gate code at submission; the worker records its own gate refusal by code; no execution';
end $$;

select 'work_continuity_dependencies: PASS' result;
rollback;
