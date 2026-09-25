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
 begin truncate public.work_continuation_requests; raise exception 'requests truncated';
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
 if (select count(*) from public.work_continuation_requests)<>1 or (select count(*) from public.work_milestones where kind='continuation_proposed')<>1 then
  raise exception 'more than one request or proposal for one work';
 end if;
 raise notice 'PASS: results and decisions untouched; the request refers to them';
end $$;

select 'work_continuity_dependencies: PASS' result;
rollback;
