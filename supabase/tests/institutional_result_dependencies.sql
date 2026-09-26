-- Stage 18, increment 5A: institutional model results on the common dependency graph, through the
-- real approval command and the real outbox (claim and complete as a worker account). Synthetic rows
-- only; everything rolls back.
begin;
-- Documents are customer inputs with declared rights (the stage 7 factory of the other suites).
\ir support/source_rights_fixture.sql
\ir support/execution_approval.sql
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Owner (the requester of the first calculation), approver, a member without access, a foreign owner
-- and the worker account that drains the outbox and leases jobs.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
 ('c5a10000-0000-4000-8000-000000000001','authenticated','authenticated','inst-owner@example.invalid','{}','{}',now(),now(),false,false),
 ('c5a10000-0000-4000-8000-000000000002','authenticated','authenticated','inst-approver@example.invalid','{}','{}',now(),now(),false,false),
 ('c5a10000-0000-4000-8000-000000000003','authenticated','authenticated','inst-member@example.invalid','{}','{}',now(),now(),false,false),
 ('c5a10000-0000-4000-8000-000000000004','authenticated','authenticated','inst-foreign@example.invalid','{}','{}',now(),now(),false,false),
 ('c5a10000-0000-4000-8000-000000000009','authenticated','authenticated','inst-worker@example.invalid','{}','{}',now(),now(),false,false);
insert into private.worker_tokens(id,label,token_sha256)
values('c5a10000-0000-4000-9000-0000000000f0','Synthetic institutional recompute worker',extensions.digest('synthetic-institutional-recompute-token','sha256'));
insert into public.organizations(id,organization_type,name,created_by) values
 ('c5a10000-0000-4000-9000-000000000001','company','Synthetic institutional tenant','c5a10000-0000-4000-8000-000000000001'),
 ('c5a10000-0000-4000-9000-000000000002','company','Synthetic foreign tenant','c5a10000-0000-4000-8000-000000000004');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
 ('c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-8000-000000000001','owner','active',now()),
 ('c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-8000-000000000002','member','active',now()),
 ('c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-8000-000000000003','member','active',now()),
 ('c5a10000-0000-4000-9000-000000000002','c5a10000-0000-4000-8000-000000000004','owner','active',now());
-- Work P (session S) carries the lineage under test; work Q (session T) is the fallback of a
-- requester without authority; work R has a session without results.
insert into public.capital_projects(id,organization_id,project_name,created_by) values
 ('c5a10000-0000-4000-9000-000000000010','c5a10000-0000-4000-9000-000000000001','Synthetic institutional work P','c5a10000-0000-4000-8000-000000000001'),
 ('c5a10000-0000-4000-9000-000000000020','c5a10000-0000-4000-9000-000000000001','Synthetic institutional work Q','c5a10000-0000-4000-8000-000000000001');
insert into public.document_intake_sessions(id,organization_id,capital_project_id,started_by,journey,locale) values
 ('c5a10000-0000-4000-9000-000000000011','c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-9000-000000000010','c5a10000-0000-4000-8000-000000000001','company','pt-BR'),
 ('c5a10000-0000-4000-9000-000000000021','c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-9000-000000000020','c5a10000-0000-4000-8000-000000000001','company','pt-BR');
insert into public.agent_conversations(organization_id,intake_session_id,state,created_by) values
 ('c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-9000-000000000011','idle','c5a10000-0000-4000-8000-000000000001'),
 ('c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-9000-000000000021','idle','c5a10000-0000-4000-8000-000000000001');
create temporary table inst(name text primary key,id uuid not null);
-- Read inside blocks that act as a person or the worker.
grant select on inst to authenticated,anon;

-- auth.uid() prefers request.jwt.claim.sub: switch both claims together.
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_user::text,''),true);
 perform set_config('request.jwt.claims',case when p_user is null then '' else jsonb_build_object('sub',p_user,'role','authenticated','aal','aal1')::text end,true);
end $$;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from inst where name=p_name $$;
create function pg_temp.manifest(p_session uuid) returns text language sql as $$
 select private.institutional_source_context('c5a10000-0000-4000-9000-000000000001',p_session)->>'sourceManifestFingerprint';
$$;
-- One verified, clean document of a session: a version of a logical source (a null logical id starts one).
create function pg_temp.document(p_name text,p_session uuid,p_logical uuid) returns uuid language plpgsql as $$
declare v uuid:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:test:institutional-document:'||p_name);hash text:=encode(extensions.digest(p_name,'sha256'),'hex');
begin
 insert into public.source_documents(id,organization_id,intake_session_id,logical_source_id,object_path,original_name,mime_type,byte_size,sha256,
  sha256_verified_at,scan_result,processing_status,created_by)
 values(v,'c5a10000-0000-4000-9000-000000000001',p_session,p_logical,'c5a10000-0000-4000-9000-000000000001/'||p_session::text||'/'||p_name||'.xlsx',
  'Synthetic '||p_name,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',1,hash,now(),'{"verdict":"clean"}','ready','c5a10000-0000-4000-8000-000000000001');
 insert into inst values(p_name,v);
 return v;
end $$;
-- A candidate configuration awaiting review. With documents it is an initial configuration produced
-- by a setup submission over the session's documents as they are now (the submission names the
-- session the approval checks); without, it changes an assumption of its parent and inherits the
-- parent's provenance through the chain.
create function pg_temp.configuration(p_name text,p_work uuid,p_session uuid,p_revision integer,p_parent text,p_documents text[]) returns uuid language plpgsql as $$
declare v uuid:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:test:institutional-configuration:'||p_name);submission uuid:=extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:test:institutional-submission:'||p_name);
 body jsonb:=jsonb_build_object('modelId','synthetic-institutional','scenario',p_name);reviews jsonb;manifest text:=pg_temp.manifest(p_session);
begin
 if p_documents is not null then
  select coalesce(jsonb_agg(jsonb_build_object('sourceDocument',d.id,'version','1','hash',d.sha256) order by d.id),'[]'::jsonb) into reviews
  from public.source_documents d where d.id in (select pg_temp.id(x) from unnest(p_documents) x);
  insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,metadata,created_by)
  select submission,c.organization_id,c.id,c.intake_session_id,'user','completed','Revisar a configuração e as fontes do modelo financeiro.','pt-BR',
   jsonb_build_object('kind','institutional_model_setup','institutionalSubmissionId',submission),'c5a10000-0000-4000-8000-000000000001'
  from public.agent_conversations c where c.intake_session_id=p_session;
 end if;
 insert into private.institutional_model_configurations(id,organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_evidence)
 values(v,'c5a10000-0000-4000-9000-000000000001',p_work,p_revision,body,private.institutional_config_hash(body),
  (select c.configuration_fingerprint from private.institutional_model_configurations c where c.id=pg_temp.id(p_parent)),'review_required',
  case when p_documents is null then jsonb_build_object('kind','assumption_change','synthetic',true)
  else jsonb_build_object('kind','initial_configuration','submissionId',submission,'sourceManifestFingerprint',manifest,'lineage','[]'::jsonb,'sourceBindings',reviews) end);
 if p_documents is not null then
  insert into private.institutional_model_setup_submissions(id,organization_id,capital_project_id,intake_session_id,source_manifest_fingerprint,configuration,source_reviews,
   status,candidate_id,submitted_by,submitted_at)
  values(submission,'c5a10000-0000-4000-9000-000000000001',p_work,p_session,manifest,body,reviews,'review_required',v,'c5a10000-0000-4000-8000-000000000001',now());
 end if;
 insert into inst values(p_name,v);
 return v;
end $$;
-- The approval command of the product, as a person with a session.
create function pg_temp.approve(p_user uuid,p_work uuid,p_configuration text,p_request uuid) returns jsonb language plpgsql as $$
declare c private.institutional_model_configurations;body jsonb;
begin
 select * into strict c from private.institutional_model_configurations where id=pg_temp.id(p_configuration);
 perform pg_temp.act_as(p_user);
 set local role authenticated;
 body:=public.review_institutional_configuration_and_calculate_v1(p_work,c.id,c.parent_fingerprint,'approved',c.configuration_fingerprint,p_request,'pt-BR');
 reset role;
 perform pg_temp.act_as(null);
 return body;
end $$;
-- Claims and completes every deliverable event as the worker account.
create function pg_temp.drain_outbox() returns integer language plpgsql as $$
declare claim jsonb;result jsonb;done integer:=0;
begin
 perform pg_temp.act_as('c5a10000-0000-4000-8000-000000000009');
 for attempt in 1..200 loop
  claim:=public.claim_event_outbox_v1('synthetic-institutional-recompute-token');
  exit when not (claim->>'claimed')::boolean;
  result:=public.complete_event_outbox_v1('synthetic-institutional-recompute-token',(claim->>'outboxId')::uuid,claim->>'capability');
  if (result->>'completed')::boolean then done:=done+1; end if;
 end loop;
 perform pg_temp.act_as(null);
 if exists(select 1 from private.event_outbox where status<>'completed') then raise exception 'outbox not drained'; end if;
 return done;
end $$;
-- The worker's lease on a job, bound to the worker account and token; the capability is the name.
create function pg_temp.lease(p_job uuid,p_capability text) returns void language sql as $$
 update public.processing_jobs set status='leased',attempts=attempts+1,lease_expires_at=now()+interval '10 minutes',
  capability_sha256=extensions.digest(p_capability,'sha256'),leased_by='c5a10000-0000-4000-9000-0000000000f0',leased_account_user_id='c5a10000-0000-4000-8000-000000000009'
 where id=p_job;
$$;
-- The job of a result: the calculation request of a message or of a candidate names the result.
create function pg_temp.job_of(p_result uuid) returns uuid language sql as $$
 select j.id from public.processing_jobs j where j.kind='agent_operation_brief' and j.payload->>'message_id'=p_result::text;
$$;
-- The result writer's effect, without the economic validation it applies to real artifacts: the
-- guard admits only queued to terminal with the moment of production.
create function pg_temp.record(p_result uuid,p_status text) returns void language sql as $$
 update private.institutional_model_results set status=p_status,produced_at=clock_timestamp(),
  artifact=case when p_status='completed' then jsonb_build_object('synthetic',true,'result',p_result) end,
  blockers=case when p_status='blocked' then '["institutional_result_approval_or_sources_changed"]'::jsonb else '[]'::jsonb end
 where id=p_result;
$$;
create function pg_temp.complete_job(p_job uuid,p_capability text) returns void language plpgsql as $$
begin
 perform pg_temp.act_as('c5a10000-0000-4000-8000-000000000009');
 set local role authenticated;
 perform public.worker_complete_job(p_job,p_capability,jsonb_build_object('mode','institutional_model_recompute','modelCalls',0));
 reset role;
 perform pg_temp.act_as(null);
end $$;
create function pg_temp.stale(p_work uuid) returns jsonb language sql as $$
 select private.work_stale_dependents_v1('c5a10000-0000-4000-9000-000000000001',p_work);
$$;

-- 0. Setup. Documents D (a balancete) and E in session S; the owner holds work access on P and Q
-- (creator); the approver gets work access on Q only.
select pg_temp.document('D1','c5a10000-0000-4000-9000-000000000011',null);
select pg_temp.document('E1','c5a10000-0000-4000-9000-000000000011',null);
select pg_temp.document('F1','c5a10000-0000-4000-9000-000000000021',null);
insert into inst select 'D',source_id from public.source_versions where id=pg_temp.id('D1');
select pg_temp.act_as('c5a10000-0000-4000-8000-000000000001');
select public.grant_resource_access_v1('c5a10000-0000-4000-9000-000000000020','c5a10000-0000-4000-8000-000000000002','work');
select pg_temp.act_as(null);

-- 1. The first approval of a work emits nothing and is the person's request: the approval command
-- posts the calculation request, queues the zero-budget job and the result, as before. The result
-- records its edges in the same transaction: the configuration and the documents it was reviewed over.
select pg_temp.configuration('C1','c5a10000-0000-4000-9000-000000000010','c5a10000-0000-4000-9000-000000000011',1,null,array['D1','E1']);
select pg_temp.approve('c5a10000-0000-4000-8000-000000000001','c5a10000-0000-4000-9000-000000000010','C1','c5a10000-0000-4000-9000-0000000000a1');
insert into inst values('R0','c5a10000-0000-4000-9000-0000000000a1');
do $$ declare r private.institutional_model_results;j public.processing_jobs;begin
 if exists(select 1 from private.domain_events where aggregate_kind='institutional_configuration') then
  raise exception 'the first approval of a work emitted a dependency event';
 end if;
 select * into strict r from private.institutional_model_results where id=pg_temp.id('R0');
 select * into strict j from public.processing_jobs where id=pg_temp.job_of(r.id);
 if r.status<>'queued' or r.recompute_candidate_id is not null or r.origin_message_id<>r.id or r.requested_by<>'c5a10000-0000-4000-8000-000000000001'
 or not exists(select 1 from public.agent_messages m where m.id=r.id and m.metadata->>'kind'='institutional_model_refresh')
 or (select budget from public.processing_runs where id=j.processing_run_id)<>'{"maxCalls": 0, "maxCostUsd": 0}'::jsonb then
  raise exception 'the first calculation did not keep its request path: %',to_jsonb(r);
 end if;
 if array(select d.dependency_kind||':'||coalesce(d.source_version_id::text,d.configuration_id::text) from private.institutional_result_dependencies d where d.result_id=r.id order by 1)
  <>array['institutional_configuration:'||pg_temp.id('C1'),'source_version:'||least(pg_temp.id('D1'),pg_temp.id('E1')),'source_version:'||greatest(pg_temp.id('D1'),pg_temp.id('E1'))] then
  raise exception 'the result did not record its edges: %',(select jsonb_agg(to_jsonb(d)) from private.institutional_result_dependencies d where d.result_id=r.id);
 end if;
 raise notice 'PASS: the first approval of a work is its person''s calculation request, and the result records its configuration and documents as edges';
end $$;
-- The worker produces R0 (lease, context, record, complete); the person's message is answered.
select pg_temp.lease(pg_temp.job_of(pg_temp.id('R0')),repeat('r',64));
do $$ declare context jsonb;job uuid:=pg_temp.job_of(pg_temp.id('R0'));begin
 perform pg_temp.act_as('c5a10000-0000-4000-8000-000000000009');
 set local role authenticated;
 context:=public.worker_load_institutional_model_context_v1(job,repeat('r',64));
 reset role;
 if context#>>'{modelResultRequest,id}'<>pg_temp.id('R0')::text or jsonb_array_length(context->'approvedConfigurations')<>1 then
  raise exception 'the worker does not see the request of the first calculation: %',context->'modelResultRequest';
 end if;
end $$;
select pg_temp.record(pg_temp.id('R0'),'completed');
select pg_temp.complete_job(pg_temp.job_of(pg_temp.id('R0')),repeat('r',64));
update public.agent_messages set status='completed' where id=pg_temp.id('R0');

-- 2. A newer approved configuration of the work: the approval command hands the update to the graph.
-- It emits one institutional_configuration event and applies it in its own transaction; the graph
-- queues the recomputation of the live lineage in the approving person's name under the command's
-- request id (authorization and result), and no message is posted.
select pg_temp.configuration('C2','c5a10000-0000-4000-9000-000000000010','c5a10000-0000-4000-9000-000000000011',2,'C1',null);
create temporary table probe(label text primary key,body jsonb);
grant select on probe to authenticated;
insert into probe select 'approve-c2',pg_temp.approve('c5a10000-0000-4000-8000-000000000001','c5a10000-0000-4000-9000-000000000010','C2','c5a10000-0000-4000-9000-0000000000a2');
insert into inst select 'E_C2',id from private.domain_events where aggregate_kind='institutional_configuration' and aggregate_id='c5a10000-0000-4000-9000-000000000010';
do $$ declare body jsonb:=(select body from probe where label='approve-c2');e private.domain_events;r private.institutional_model_results;a private.review_execution_authorizations;begin
 select * into strict e from private.domain_events where id=pg_temp.id('E_C2');
 select * into r from private.institutional_model_results where id='c5a10000-0000-4000-9000-0000000000a2';
 select * into a from private.review_execution_authorizations where id='c5a10000-0000-4000-9000-0000000000a2';
 if body->>'status'<>'dependency_update' or (body->>'replayed')::boolean or body->>'revisionId' is null
 or exists(select 1 from public.agent_messages where id='c5a10000-0000-4000-9000-0000000000a2') then
  raise exception 'the approval posted a message of its own: %',body;
 end if;
 if r.id is null or r.recompute_candidate_id is null or r.origin_message_id is not null or r.status<>'queued' or r.configuration_id<>pg_temp.id('C2')
 or r.requested_by<>'c5a10000-0000-4000-8000-000000000001' or r.canonical_revision_id<>(body->>'revisionId')::uuid
 or a.subject_user_id<>'c5a10000-0000-4000-8000-000000000001' or a.configuration_id<>pg_temp.id('C2') or a.resource_id<>'c5a10000-0000-4000-9000-000000000010'
 or (select payload->>'institutional_recompute_candidate_id' from public.processing_jobs where id=pg_temp.job_of(r.id))<>r.recompute_candidate_id::text then
  raise exception 'the request id does not name the recomputation the graph queued: % %',to_jsonb(r),to_jsonb(a);
 end if;
 if e.id<>pg_temp.id('C2') or e.effect<>'propagate_dependencies' or e.reason<>'changed' or e.actor_user_id<>'c5a10000-0000-4000-8000-000000000001'
 or e.protected_state->>'revision'<>'2' or not exists(select 1 from private.event_outbox where event_id=e.id and status='pending') then
  raise exception 'the approval did not emit its dependency event: %',to_jsonb(e);
 end if;
 -- The effect ran in the approving transaction: the result view reads a queued result at commit,
 -- before the outbox delivers the event (its delivery below writes nothing new); the setting that
 -- named the request is cleared.
 if (select count(*) from public.institutional_recompute_candidates c join private.institutional_model_results x on x.id=c.result_id
  where c.work_id='c5a10000-0000-4000-9000-000000000010' and c.state='scheduled' and x.status='queued'
  and exists(select 1 from public.processing_jobs j where j.payload->>'message_id'=x.id::text and j.status='queued'))<>1
 or not exists(select 1 from private.institutional_result_invalidations where event_id=e.id)
 or coalesce(current_setting('offroad.institutional_approval_request',true),'')<>'' then
  raise exception 'the approval did not apply its dependency effect in its transaction';
 end if;
 raise notice 'PASS: a newer approval with a live result emits one dependency event, applies it in its transaction and queues the recomputation under its request id, with no message';
end $$;
-- The request id names the recomputation, so the replay check of the command finds it: the same
-- request replays and writes nothing, and the same id for another candidate is refused.
do $$ declare before jsonb;body jsonb;refused boolean:=false;begin
 select jsonb_build_object('results',(select count(*) from private.institutional_model_results),'candidates',(select count(*) from public.institutional_recompute_candidates),
  'jobs',(select count(*) from public.processing_jobs),'messages',(select count(*) from public.agent_messages),'events',(select count(*) from private.domain_events),
  'authorizations',(select count(*) from private.review_execution_authorizations),'revisions',(select count(*) from private.project_canonical_revisions)) into before;
 body:=pg_temp.approve('c5a10000-0000-4000-8000-000000000001','c5a10000-0000-4000-9000-000000000010','C2','c5a10000-0000-4000-9000-0000000000a2');
 if body<>jsonb_build_object('requestId','c5a10000-0000-4000-9000-0000000000a2','status','queued','replayed',true,
  'revisionId',(select p.body->>'revisionId' from probe p where p.label='approve-c2')) then
  raise exception 'the same request did not replay: %',body;
 end if;
 begin
  perform pg_temp.approve('c5a10000-0000-4000-8000-000000000001','c5a10000-0000-4000-9000-000000000010','C1','c5a10000-0000-4000-9000-0000000000a2');
 exception when others then
  if sqlerrm<>'institutional_result_request_replay_mismatch' then raise; end if;
  refused:=true;
 end;
 if not refused then raise exception 'a request id reused for another candidate was accepted'; end if;
 if jsonb_build_object('results',(select count(*) from private.institutional_model_results),'candidates',(select count(*) from public.institutional_recompute_candidates),
  'jobs',(select count(*) from public.processing_jobs),'messages',(select count(*) from public.agent_messages),'events',(select count(*) from private.domain_events),
  'authorizations',(select count(*) from private.review_execution_authorizations),'revisions',(select count(*) from private.project_canonical_revisions))<>before then
  raise exception 'a replay or a refused reuse wrote something';
 end if;
 raise notice 'PASS: the same request id replays with replayed true, and the same id for another candidate is refused';
end $$;
select pg_temp.drain_outbox();
do $$ declare f private.institutional_result_invalidations;q public.work_continuation_requests;c public.institutional_recompute_candidates;
 r private.institutional_model_results;j public.processing_jobs;identity jsonb;expected jsonb;begin
 -- Facts: the one live result of the work, configuration moved; nothing else.
 select * into strict f from private.institutional_result_invalidations where event_id=pg_temp.id('E_C2');
 if f.result_id<>pg_temp.id('R0') or f.dependency_kind<>'institutional_configuration' or f.reason_class<>'data_change' or f.gap is not null
 or f.logical_key<>'c5a10000-0000-4000-9000-000000000010' or f.pinned->>'configurationId'<>pg_temp.id('C1')::text or f.head->>'configurationId'<>pg_temp.id('C2')::text
 or f.pinned->>'revision'<>'1' or f.head->>'revision'<>'2' or exists(select 1 from private.execution_invalidations where event_id=pg_temp.id('E_C2')) then
  raise exception 'configuration impact mismatch: %',to_jsonb(f);
 end if;
 -- One request for the work, in the canonical form, naming the result as an institutional dependent.
 select * into strict q from public.work_continuation_requests where work_id='c5a10000-0000-4000-9000-000000000010';
 expected:=jsonb_build_object('schemaVersion','dependency-update-request.v1','workId','c5a10000-0000-4000-9000-000000000010','status','open',
  'affectedExecutionIds',jsonb_build_array(pg_temp.id('R0')),
  'events',jsonb_build_array(jsonb_build_object('eventId',pg_temp.id('E_C2'),'aggregateKind','institutional_configuration','aggregateId','c5a10000-0000-4000-9000-000000000010','aggregateVersion',1)),
  'aggregateVersions',jsonb_build_array(jsonb_build_object('aggregateKind','institutional_configuration','aggregateId','c5a10000-0000-4000-9000-000000000010','version',1)));
 if q.payload<>expected or q.payload_fingerprint<>private.continuation_fingerprint_v1(expected)
 or q.affected_executions<>jsonb_build_array(jsonb_build_object('executionId',pg_temp.id('R0'),'rootExecutionId',pg_temp.id('R0'),'resultMilestoneId',null,'dependentKind','institutional_result')) then
  raise exception 'request mismatch: % %',q.payload,q.affected_executions;
 end if;
 -- One candidate, keyed like 3B over the root and the head identity, with a queued result and its job.
 select * into strict c from public.institutional_recompute_candidates where request_id=q.id;
 identity:=private.continuation_input_identity_v1(jsonb_build_array(
  jsonb_build_array(private.continuation_logical_key_v1('institutional_configuration','c5a10000-0000-4000-9000-000000000010'),jsonb_build_object('configurationId',pg_temp.id('C2'),'revision',2)),
  jsonb_build_array(private.continuation_logical_key_v1('source_version',pg_temp.id('D')::text),(select jsonb_build_object('versionNo',1,'versionId',pg_temp.id('D1')))),
  jsonb_build_array(private.continuation_logical_key_v1('source_version',(select source_id from public.source_versions where id=pg_temp.id('E1'))::text),jsonb_build_object('versionNo',1,'versionId',pg_temp.id('E1')))));
 if c.state<>'scheduled' or c.base_result_id<>pg_temp.id('R0') or c.head_inputs<>identity or c.new_input_fingerprint<>private.continuation_fingerprint_v1(identity)
 or c.idempotency_key<>private.dependency_recompute_key_v1('c5a10000-0000-4000-9000-000000000010',pg_temp.id('R0'),private.continuation_fingerprint_v1(identity))
 or c.result_ids<>array[pg_temp.id('R0')] or c.requested_by<>'c5a10000-0000-4000-8000-000000000001' or c.result_id is null then
  raise exception 'candidate mismatch: %',to_jsonb(c);
 end if;
 insert into inst values('K1',c.id),('R1',c.result_id);
 select * into strict r from private.institutional_model_results where id=c.result_id;
 if r.status<>'queued' or r.recompute_candidate_id<>c.id or r.origin_message_id is not null or r.configuration_id<>pg_temp.id('C2')
 or r.requested_by<>'c5a10000-0000-4000-8000-000000000001' or r.intake_session_id<>'c5a10000-0000-4000-9000-000000000011'
 or r.source_manifest_fingerprint<>pg_temp.manifest('c5a10000-0000-4000-9000-000000000011')
 or r.canonical_revision_id<>((select body from probe where label='approve-c2')->>'revisionId')::uuid
 or exists(select 1 from public.agent_messages where id=r.id) then
  raise exception 'recomputed result mismatch: %',to_jsonb(r);
 end if;
 select * into strict j from public.processing_jobs where id=pg_temp.job_of(r.id);
 if j.status<>'queued' or j.payload<>jsonb_build_object('message_id',r.id,'locale','pt-BR','surface','dependency_recompute','institutional_recompute_candidate_id',c.id)
 or j.intake_session_id<>r.intake_session_id or j.authorization_subject_id<>'c5a10000-0000-4000-8000-000000000001' or j.review_execution_authorization_id<>r.id
 or (select budget from public.processing_runs where id=j.processing_run_id)<>'{"maxCalls": 0, "maxCostUsd": 0}'::jsonb
 or (select pipeline_version from public.processing_runs where id=j.processing_run_id)<>'institutional-dependency-recompute-v1'
 or not private.job_authority_is_current_v1(j.id) then
  raise exception 'recompute job mismatch: %',to_jsonb(j);
 end if;
 if q.status<>'scheduled' or (select count(*) from public.institutional_recompute_candidates)<>1
 or (select count(*) from public.work_milestones where kind='continuation_proposed' and subject_id=q.id)<>1 then
  raise exception 'the request did not take the status of its candidate: %',q.status;
 end if;
 raise notice 'PASS: the approval records a fact only for the dependent result and one update request for the work';
 raise notice 'PASS: one zero-budget candidate per lineage and heads enqueues the existing job for the original requester, with no message';
end $$;
do $$ begin
 if pg_temp.stale('c5a10000-0000-4000-9000-000000000010')<>'{"staleDependents": 1, "staleExecutions": 0, "staleInstitutionalResults": 1}'::jsonb
 or pg_temp.stale('c5a10000-0000-4000-9000-000000000020')<>'{"staleDependents": 0, "staleExecutions": 0, "staleInstitutionalResults": 0}'::jsonb then
  raise exception 'stale count mismatch: %',pg_temp.stale('c5a10000-0000-4000-9000-000000000010');
 end if;
 raise notice 'PASS: the stale count is read from the facts and the update requests that are not adopted or declined';
end $$;

-- 3. Duplicate delivery: the same event applied again, directly and redelivered by the outbox,
-- changes nothing.
do $$ declare before jsonb;result jsonb;begin
 select jsonb_build_object('facts',(select count(*) from private.institutional_result_invalidations),'candidates',(select jsonb_agg(to_jsonb(c) order by c.id) from public.institutional_recompute_candidates c),
  'results',(select count(*) from private.institutional_model_results),'jobs',(select count(*) from public.processing_jobs),'request',(select to_jsonb(q) from public.work_continuation_requests q)) into before;
 result:=private.apply_dependency_event_v1('c5a10000-0000-4000-9000-000000000001',pg_temp.id('E_C2'));
 if (result->>'institutionalFacts')::integer<>0 or (result->>'opened')::integer<>0 or (result->>'merged')::integer<>0 then raise exception 'second application changed state: %',result; end if;
 update private.event_outbox set status='pending',completed_at=null,lease_expires_at=null,capability_sha256=null,worker_token_id=null,leased_account_user_id=null
 where event_id=pg_temp.id('E_C2');
 if pg_temp.drain_outbox()<>1 then raise exception 'redelivered event not completed'; end if;
 if jsonb_build_object('facts',(select count(*) from private.institutional_result_invalidations),'candidates',(select jsonb_agg(to_jsonb(c) order by c.id) from public.institutional_recompute_candidates c),
  'results',(select count(*) from private.institutional_model_results),'jobs',(select count(*) from public.processing_jobs),'request',(select to_jsonb(q) from public.work_continuation_requests q))<>before then
  raise exception 'duplicate delivery changed facts, candidates, results, jobs or the request';
 end if;
 raise notice 'PASS: duplicate delivery writes no second fact, candidate, result or job';
end $$;

-- 4. The worker produces the recomputation through the existing job: the result completes, the
-- candidate settles, the request is ready. Since 5C the previous result stays current (stored and
-- untouched) until a person adopts the update; the adoption marks it as previous.
select pg_temp.lease(pg_temp.job_of(pg_temp.id('R1')),repeat('s',64));
do $$ declare context jsonb;job uuid:=pg_temp.job_of(pg_temp.id('R1'));r1 text:=pg_temp.id('R1')::text;c2 text:=pg_temp.id('C2')::text;begin
 perform pg_temp.act_as('c5a10000-0000-4000-8000-000000000009');
 set local role authenticated;
 context:=public.worker_load_institutional_model_context_v1(job,repeat('s',64));
 reset role;
 perform pg_temp.act_as(null);
 if context#>>'{modelResultRequest,id}'<>pg_temp.id('R1')::text or context#>>'{modelResultRequest,configurationId}'<>pg_temp.id('C2')::text
 or context#>>'{modelResultRequest,status}'<>'queued' then
  raise exception 'the recompute job does not load its request: %',context->'modelResultRequest';
 end if;
 raise notice 'PASS: the recompute job loads its queued result through the capability of the existing job';
end $$;
create temporary table r0_before as select * from private.institutional_model_results where id=pg_temp.id('R0');
select pg_temp.record(pg_temp.id('R1'),'completed');
select pg_temp.complete_job(pg_temp.job_of(pg_temp.id('R1')),repeat('s',64));
do $$ declare before private.institutional_model_results;after private.institutional_model_results;view jsonb;begin
 select * into strict before from r0_before;
 select * into strict after from private.institutional_model_results where id=pg_temp.id('R0');
 if after.superseded_by is not null or after.artifact<>before.artifact or after.produced_at<>before.produced_at or after.configuration_id<>before.configuration_id
 or after.canonical_revision_id<>before.canonical_revision_id then
  raise exception 'the previous result changed before any adoption: %',to_jsonb(after);
 end if;
 if (select state from public.institutional_recompute_candidates where id=pg_temp.id('K1'))<>'settled'
 or (select status from public.work_continuation_requests where work_id='c5a10000-0000-4000-9000-000000000010')<>'ready' then
  raise exception 'the candidate did not settle or the request is not ready';
 end if;
 if private.institutional_lineage_root_v1('c5a10000-0000-4000-9000-000000000001',pg_temp.id('R1'))<>pg_temp.id('R0') then raise exception 'lineage root mismatch'; end if;
 -- Not adopted yet: the view keeps the previous result (outdated, since its configuration moved) and
 -- R0 still counts as stale.
 perform pg_temp.act_as('c5a10000-0000-4000-8000-000000000001');
 set local role authenticated;
 view:=public.read_institutional_model_results_v1('c5a10000-0000-4000-9000-000000000010');
 reset role;
 perform pg_temp.act_as(null);
 if view#>>'{latest,id}'<>pg_temp.id('R0')::text or view#>>'{latest,status}'<>'stale' or view#>'{latest,artifact}'<>'null'::jsonb then
  raise exception 'a recomputation not adopted is shown as current: %',view->'latest';
 end if;
 if pg_temp.stale('c5a10000-0000-4000-9000-000000000010')->>'staleDependents'<>'1' then raise exception 'the result not yet replaced does not count as stale'; end if;
 raise notice 'PASS: a completed recomputation is stored but not current before adoption; the previous result stays current and untouched';
end $$;
-- The owner adopts the update: the recomputation becomes current and the previous result previous.
select pg_temp.act_as('c5a10000-0000-4000-8000-000000000001');
select public.adopt_work_update_v1('c5a10000-0000-4000-9000-0000000000e1',(select id from public.work_continuation_requests where work_id='c5a10000-0000-4000-9000-000000000010'),
 (select revision from public.work_continuation_requests where work_id='c5a10000-0000-4000-9000-000000000010'));
select pg_temp.act_as(null);
do $$ declare before private.institutional_model_results;after private.institutional_model_results;history jsonb;begin
 select * into strict before from r0_before;
 select * into strict after from private.institutional_model_results where id=pg_temp.id('R0');
 if after.superseded_by<>pg_temp.id('R1') or after.artifact<>before.artifact or after.produced_at<>before.produced_at or after.configuration_id<>before.configuration_id
 or after.canonical_revision_id<>before.canonical_revision_id then
  raise exception 'the previous result was not kept as previous: %',to_jsonb(after);
 end if;
 perform pg_temp.act_as('c5a10000-0000-4000-8000-000000000001');
 set local role authenticated;
 history:=public.read_project_revision_history_v1('c5a10000-0000-4000-9000-000000000010');
 if public.read_institutional_model_results_v1('c5a10000-0000-4000-9000-000000000010')#>>'{latest,id}'<>pg_temp.id('R1')::text
 or not exists(select 1 from jsonb_array_elements(history->'revisions') v cross join jsonb_array_elements(v->'results') x
  where x->>'id'=pg_temp.id('R0')::text and x->>'supersededBy'=pg_temp.id('R1')::text and not (x->>'isCurrent')::boolean) then
  raise exception 'the previous result is not readable as previous: %',history;
 end if;
 reset role;
 perform pg_temp.act_as(null);
 if pg_temp.stale('c5a10000-0000-4000-9000-000000000010')->>'staleDependents'<>'0' then raise exception 'a superseded result still counts as stale'; end if;
 raise notice 'PASS: once adopted, the recomputed result supersedes the previous one, which stays stored, readable and unchanged; lineage names the root';
end $$;

-- 5. Two more approvals before the second recomputation completes: the scheduled candidate whose heads
-- moved is superseded, the lineage gets one candidate for the new heads, still keyed on the root.
select pg_temp.configuration('C3','c5a10000-0000-4000-9000-000000000010','c5a10000-0000-4000-9000-000000000011',3,'C2',null);
select pg_temp.approve('c5a10000-0000-4000-8000-000000000001','c5a10000-0000-4000-9000-000000000010','C3','c5a10000-0000-4000-9000-0000000000a3');
select pg_temp.drain_outbox();
insert into inst select 'R2',result_id from public.institutional_recompute_candidates where state='scheduled';
insert into inst select 'K2',id from public.institutional_recompute_candidates where state='scheduled';
select pg_temp.configuration('C4','c5a10000-0000-4000-9000-000000000010','c5a10000-0000-4000-9000-000000000011',4,'C3',null);
select pg_temp.approve('c5a10000-0000-4000-8000-000000000001','c5a10000-0000-4000-9000-000000000010','C4','c5a10000-0000-4000-9000-0000000000a4');
select pg_temp.drain_outbox();
insert into inst select 'K3',id from public.institutional_recompute_candidates where state='scheduled';
insert into inst select 'R3',result_id from public.institutional_recompute_candidates where state='scheduled';
do $$ declare k2 public.institutional_recompute_candidates;k3 public.institutional_recompute_candidates;begin
 select * into strict k2 from public.institutional_recompute_candidates where id=pg_temp.id('K2');
 select * into strict k3 from public.institutional_recompute_candidates where id=pg_temp.id('K3');
 if k2.base_result_id<>pg_temp.id('R0') or k3.base_result_id<>pg_temp.id('R0') or k2.state<>'declined' or k2.reason<>'superseded'
 or (select configuration_id from private.institutional_model_results where id=k3.result_id)<>pg_temp.id('C4')
 or (select count(*) from public.institutional_recompute_candidates)<>3
 or (select status from public.work_continuation_requests where id=k2.request_id)<>'superseded'
 or (select superseded_by_request_id from public.work_continuation_requests where id=k2.request_id)<>k3.request_id then
  raise exception 'supersession mismatch: % %',to_jsonb(k2),to_jsonb(k3);
 end if;
 -- The stale queued result of the superseded candidate is refused by the writer (blocked) and its job
 -- ends; the superseded candidate does not move.
 perform pg_temp.lease(pg_temp.job_of(pg_temp.id('R2')),repeat('t',64));
 perform pg_temp.record(pg_temp.id('R2'),'blocked');
 perform pg_temp.complete_job(pg_temp.job_of(pg_temp.id('R2')),repeat('t',64));
 if (select state from public.institutional_recompute_candidates where id=k2.id)<>'declined' then raise exception 'a superseded candidate moved'; end if;
 perform pg_temp.lease(pg_temp.job_of(pg_temp.id('R3')),repeat('u',64));
 perform pg_temp.record(pg_temp.id('R3'),'completed');
 perform pg_temp.complete_job(pg_temp.job_of(pg_temp.id('R3')),repeat('u',64));
 if (select state from public.institutional_recompute_candidates where id=k3.id)<>'settled'
 or (select superseded_by from private.institutional_model_results where id=pg_temp.id('R1')) is not null then
  raise exception 'the newest recomputation did not settle, or replaced the current result before adoption';
 end if;
 -- The adoption of the update makes it current: the result it replaces (R1) becomes previous; the
 -- blocked result of the superseded candidate is not a result and stays as it is.
 perform pg_temp.act_as('c5a10000-0000-4000-8000-000000000001');
 perform public.adopt_work_update_v1('c5a10000-0000-4000-9000-0000000000e2',k3.request_id,(select revision from public.work_continuation_requests where id=k3.request_id));
 perform pg_temp.act_as(null);
 if (select superseded_by from private.institutional_model_results where id=pg_temp.id('R1'))<>pg_temp.id('R3')
 or (select superseded_by from private.institutional_model_results where id=pg_temp.id('R2')) is not null then
  raise exception 'the adopted recomputation did not supersede the result it replaces';
 end if;
 raise notice 'PASS: newer heads supersede a scheduled candidate; a lineage is recomputed once per heads, always keyed on its root';
end $$;

-- 6. A newer version of a document the result read: facts for the dependent result, and a hold while
-- the configuration was not approved over the current documents. A configuration approved over them
-- releases the hold and the lineage gets its candidate, pinning the new version.
select pg_temp.document('D2','c5a10000-0000-4000-9000-000000000011',pg_temp.id('D'));
delete from public.source_documents where id=pg_temp.id('D1');
insert into inst select 'E_D2',id from private.domain_events where aggregate_kind='source_version' and aggregate_id=pg_temp.id('D');
select pg_temp.drain_outbox();
do $$ declare f private.institutional_result_invalidations;h private.institutional_recompute_holds;q public.work_continuation_requests;begin
 select * into strict f from private.institutional_result_invalidations where event_id=pg_temp.id('E_D2');
 if f.result_id<>pg_temp.id('R3') or f.dependency_kind<>'source_version' or f.reason_class<>'data_change' or f.pinned->>'versionId'<>pg_temp.id('D1')::text
 or f.head->>'versionId'<>pg_temp.id('D2')::text or f.via_source_version_ids<>'{}' then
  raise exception 'source impact mismatch: %',to_jsonb(f);
 end if;
 select * into strict q from public.work_continuation_requests where status='open';
 select * into strict h from private.institutional_recompute_holds where request_id=q.id;
 if h.hold_kind<>'configuration_behind_source' or h.signal<>'institutional_configuration:c5a10000-0000-4000-9000-000000000010' or h.result_id<>pg_temp.id('R3')
 or h.released_at is not null or exists(select 1 from public.institutional_recompute_candidates where request_id=q.id) then
  raise exception 'hold mismatch: %',to_jsonb(h);
 end if;
 if pg_temp.stale('c5a10000-0000-4000-9000-000000000010')->>'staleInstitutionalResults'<>'1' then raise exception 'the held result is not counted as stale'; end if;
 raise notice 'PASS: a newer version of a document it read makes the result stale, held until a configuration is approved over the current documents';
end $$;
select pg_temp.configuration('C5','c5a10000-0000-4000-9000-000000000010','c5a10000-0000-4000-9000-000000000011',5,'C4',array['D2','E1']);
insert into probe select 'approve-c5',pg_temp.approve('c5a10000-0000-4000-8000-000000000001','c5a10000-0000-4000-9000-000000000010','C5','c5a10000-0000-4000-9000-0000000000a5');
select pg_temp.drain_outbox();
do $$ declare q public.work_continuation_requests;c public.institutional_recompute_candidates;begin
 if (select body->>'status' from probe where label='approve-c5')<>'dependency_update' then raise exception 'the approval over the current documents was not handed to the graph'; end if;
 select * into strict q from public.work_continuation_requests where id=(select request_id from private.institutional_recompute_holds where hold_kind='configuration_behind_source');
 select * into strict c from public.institutional_recompute_candidates where request_id=q.id;
 if (select released_at from private.institutional_recompute_holds where request_id=q.id) is null or c.state<>'scheduled' or c.base_result_id<>pg_temp.id('R0')
 or q.status<>'scheduled' or jsonb_array_length(q.payload->'events')<>2
 or not exists(select 1 from private.institutional_result_dependencies d where d.result_id=c.result_id and d.source_version_id=pg_temp.id('D2'))
 or exists(select 1 from private.institutional_result_dependencies d where d.result_id=c.result_id and d.source_version_id=pg_temp.id('D1')) then
  raise exception 'the release did not plan the candidate over the new version: % %',to_jsonb(q),to_jsonb(c);
 end if;
 insert into inst values('K4',c.id),('R4',c.result_id);
 raise notice 'PASS: the configuration approved over the current documents releases the hold and plans one candidate that pins the new version';
end $$;

-- 7. A requester without authority, and a failed graph step. On work Q the approver requested the
-- first calculation and then lost access.
select pg_temp.configuration('Q1','c5a10000-0000-4000-9000-000000000020','c5a10000-0000-4000-9000-000000000021',1,null,array['F1']);
select pg_temp.approve('c5a10000-0000-4000-8000-000000000002','c5a10000-0000-4000-9000-000000000020','Q1','c5a10000-0000-4000-9000-0000000000b1');
select pg_temp.lease(pg_temp.job_of('c5a10000-0000-4000-9000-0000000000b1'),repeat('v',64));
select pg_temp.record('c5a10000-0000-4000-9000-0000000000b1','completed');
select pg_temp.complete_job(pg_temp.job_of('c5a10000-0000-4000-9000-0000000000b1'),repeat('v',64));
update public.agent_messages set status='completed' where id='c5a10000-0000-4000-9000-0000000000b1';
select pg_temp.act_as('c5a10000-0000-4000-8000-000000000001');
select public.revoke_resource_access_v1('c5a10000-0000-4000-9000-000000000020','c5a10000-0000-4000-8000-000000000002');
select pg_temp.act_as(null);
select pg_temp.drain_outbox();
-- 7a. The owner approves Q2: the lineage the approver started is recomputed through the graph in the
-- owner's name, under the owner's request id; nothing runs in the name of the approver who lost access.
select pg_temp.configuration('Q2','c5a10000-0000-4000-9000-000000000020','c5a10000-0000-4000-9000-000000000021',2,'Q1',null);
insert into probe select 'approve-q2',pg_temp.approve('c5a10000-0000-4000-8000-000000000001','c5a10000-0000-4000-9000-000000000020','Q2','c5a10000-0000-4000-9000-0000000000b2');
do $$ declare c public.institutional_recompute_candidates;r private.institutional_model_results;begin
 select * into strict r from private.institutional_model_results where id='c5a10000-0000-4000-9000-0000000000b2';
 select * into strict c from public.institutional_recompute_candidates where id=r.recompute_candidate_id;
 if (select body->>'status' from probe where label='approve-q2')<>'dependency_update' or r.requested_by<>'c5a10000-0000-4000-8000-000000000001'
 or r.configuration_id<>pg_temp.id('Q2') or c.requested_by<>'c5a10000-0000-4000-8000-000000000001' or c.base_result_id<>'c5a10000-0000-4000-9000-0000000000b1'
 or c.state<>'scheduled' or exists(select 1 from public.agent_messages where id=r.id)
 or (select created_by from public.processing_runs where id=(select processing_run_id from public.processing_jobs where id=pg_temp.job_of(r.id)))<>'c5a10000-0000-4000-8000-000000000001' then
  raise exception 'the approval did not recompute the lineage in the approving person''s name: % %',to_jsonb(r),to_jsonb(c);
 end if;
 raise notice 'PASS: the approval recomputes a lineage whose requester lost access in the approving person''s name, never in theirs';
end $$;
select pg_temp.lease(pg_temp.job_of('c5a10000-0000-4000-9000-0000000000b2'),repeat('w',64));
select pg_temp.record('c5a10000-0000-4000-9000-0000000000b2','completed');
select pg_temp.complete_job(pg_temp.job_of('c5a10000-0000-4000-9000-0000000000b2'),repeat('w',64));
select pg_temp.drain_outbox();
-- 7b. The owner approves Q3 while the dependency step fails (a statement of the effect raises): the
-- command falls through to the calculation it always posted, under its request id, and replays it.
select pg_temp.configuration('Q3','c5a10000-0000-4000-9000-000000000020','c5a10000-0000-4000-9000-000000000021',3,'Q2',null);
create function private.forced_dependency_step_failure_v1() returns trigger language plpgsql as $$ begin raise exception 'forced_dependency_step_failure'; end $$;
create trigger forced_dependency_step_failure before insert on private.institutional_result_invalidations
 for each row execute function private.forced_dependency_step_failure_v1();
insert into probe select 'approve-q3',pg_temp.approve('c5a10000-0000-4000-8000-000000000001','c5a10000-0000-4000-9000-000000000020','Q3','c5a10000-0000-4000-9000-0000000000b3');
drop trigger forced_dependency_step_failure on private.institutional_result_invalidations;
drop function private.forced_dependency_step_failure_v1();
do $$ declare body jsonb:=(select body from probe where label='approve-q3');r private.institutional_model_results;e private.domain_events;replay jsonb;begin
 select * into strict r from private.institutional_model_results where id='c5a10000-0000-4000-9000-0000000000b3';
 select * into strict e from private.domain_events where id=pg_temp.id('Q3');
 if body->>'status'<>'queued' or (body->>'replayed')::boolean or r.recompute_candidate_id is not null or r.origin_message_id<>r.id
 or r.requested_by<>'c5a10000-0000-4000-8000-000000000001' or r.configuration_id<>pg_temp.id('Q3') or r.canonical_revision_id<>(body->>'revisionId')::uuid
 or not exists(select 1 from public.agent_messages m where m.id=r.id and m.role='user' and m.metadata->>'kind'='institutional_model_refresh')
 or exists(select 1 from public.processing_jobs where id=pg_temp.job_of(r.id) and payload ? 'institutional_recompute_candidate_id')
 or exists(select 1 from private.institutional_result_invalidations where event_id=e.id)
 or exists(select 1 from public.institutional_recompute_candidates x join private.institutional_model_results y on y.recompute_candidate_id=x.id
  where x.work_id='c5a10000-0000-4000-9000-000000000020' and y.configuration_id=pg_temp.id('Q3'))
 or not exists(select 1 from private.event_outbox where event_id=e.id and status='pending')
 or coalesce(current_setting('offroad.institutional_approval_request',true),'')<>'' then
  raise exception 'a failed dependency step did not fall through to the calculation: % %',body,to_jsonb(r);
 end if;
 replay:=pg_temp.approve('c5a10000-0000-4000-8000-000000000001','c5a10000-0000-4000-9000-000000000020','Q3','c5a10000-0000-4000-9000-0000000000b3');
 if replay->>'status'<>'queued' or not (replay->>'replayed')::boolean or replay->>'requestId'<>r.id::text then
  raise exception 'the calculation after a failed dependency step does not replay: %',replay;
 end if;
 raise notice 'PASS: when the dependency step fails, the command still queues the calculation it always posted, under its request id, and replays it';
end $$;
-- 7c. The outbox applies the event of Q3 later. The lineage's recomputation without an approval runs
-- under its root's requester, who lost access: its candidate is declined and nothing runs in their name.
select pg_temp.drain_outbox();
do $$ declare c public.institutional_recompute_candidates;begin
 select * into strict c from public.institutional_recompute_candidates where work_id='c5a10000-0000-4000-9000-000000000020' and state<>'settled';
 if c.state<>'declined' or c.reason<>'requester_not_authorized' or c.base_result_id<>'c5a10000-0000-4000-9000-0000000000b1' or c.result_id is not null
 or c.requested_by<>'c5a10000-0000-4000-8000-000000000002' or exists(select 1 from private.institutional_model_results where recompute_candidate_id=c.id)
 or (select status from public.work_continuation_requests where id=c.request_id)<>'declined' then
  raise exception 'the candidate of a requester without authority was not declined: %',to_jsonb(c);
 end if;
 raise notice 'PASS: without an approval, a lineage whose requester lost access gets no recomputation: its candidate is declined';
end $$;

-- 8. Backfill: a result recorded before its projection existed (the projection trigger off) has no
-- edge; the backfill writes exactly the edges the trigger would have written, once. A result whose
-- configuration names a document that is not a version of a source is refused.
insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,created_by)
select m.id,'c5a10000-0000-4000-9000-000000000001',c.id,'c5a10000-0000-4000-9000-000000000011','user','completed','Calcular','pt-BR','c5a10000-0000-4000-8000-000000000001'
from public.agent_conversations c cross join (values ('c5a10000-0000-4000-9000-0000000000c1'::uuid),('c5a10000-0000-4000-9000-0000000000c2'::uuid)) m(id)
where c.intake_session_id='c5a10000-0000-4000-9000-000000000011';
alter table private.institutional_model_results disable trigger institutional_results_dependencies;
insert into private.institutional_model_results(id,organization_id,capital_project_id,intake_session_id,configuration_id,configuration_fingerprint,source_manifest_fingerprint,requested_by)
select 'c5a10000-0000-4000-9000-0000000000c1','c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-9000-000000000010','c5a10000-0000-4000-9000-000000000011',
 c.id,c.configuration_fingerprint,pg_temp.manifest('c5a10000-0000-4000-9000-000000000011'),'c5a10000-0000-4000-8000-000000000001'
from private.institutional_model_configurations c where c.id=pg_temp.id('C5');
alter table private.institutional_model_results enable trigger institutional_results_dependencies;
do $$ declare written bigint;expected text[];rejected boolean:=false;begin
 if exists(select 1 from private.institutional_result_dependencies where result_id='c5a10000-0000-4000-9000-0000000000c1') then raise exception 'the trigger was not off'; end if;
 if private.rebuild_incomplete_institutional_dependencies_v1('c5a10000-0000-4000-9000-000000000001')<>3 then raise exception 'the rebuild did not backfill the missing projection'; end if;
 expected:=array['institutional_configuration:'||pg_temp.id('C5'),'source_version:'||least(pg_temp.id('D2'),pg_temp.id('E1')),'source_version:'||greatest(pg_temp.id('D2'),pg_temp.id('E1'))];
 if array(select d.dependency_kind||':'||coalesce(d.source_version_id::text,d.configuration_id::text) from private.institutional_result_dependencies d
   where d.result_id='c5a10000-0000-4000-9000-0000000000c1' order by 1)<>expected
 or array(select d.dependency_kind||':'||coalesce(d.source_version_id::text,d.configuration_id::text) from private.institutional_result_dependencies d
   where d.result_id=pg_temp.id('R4') order by 1)<>expected then
  raise exception 'the backfill differs from the live projection';
 end if;
 written:=private.backfill_institutional_result_dependencies_v1();
 if written<>0 or private.rebuild_incomplete_institutional_dependencies_v1('c5a10000-0000-4000-9000-000000000001')<>0 then raise exception 'the backfill is not idempotent: %',written; end if;
 -- A configuration naming a document that is no version of any source.
 insert into private.institutional_model_configurations(id,organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_evidence)
 values('c5a10000-0000-4000-9000-0000000000c9','c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-9000-000000000010',9,'{"modelId":"unbound"}',
  private.institutional_config_hash('{"modelId":"unbound"}'),null,'review_required',
  jsonb_build_object('kind','initial_configuration','sourceManifestFingerprint',repeat('0',64),'lineage','[]'::jsonb,
   'sourceBindings',jsonb_build_array(jsonb_build_object('sourceDocument','c5a10000-0000-4000-9000-0000000000cf','version','1','hash',repeat('0',64)))));
 begin
  insert into private.institutional_model_results(id,organization_id,capital_project_id,intake_session_id,configuration_id,configuration_fingerprint,source_manifest_fingerprint,requested_by)
  values('c5a10000-0000-4000-9000-0000000000c2','c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-9000-000000000010','c5a10000-0000-4000-9000-000000000011',
   'c5a10000-0000-4000-9000-0000000000c9',private.institutional_config_hash('{"modelId":"unbound"}'),repeat('0',64),'c5a10000-0000-4000-8000-000000000001');
 exception when check_violation then
  if sqlerrm<>'institutional_result_dependency_projection_incomplete' then raise; end if; rejected:=true;
 end;
 if not rejected then raise exception 'a result with an unbound document was recorded with an incomplete graph'; end if;
 raise notice 'PASS: existing results are backfilled from the same mapping, once; an incomplete graph is never recorded as complete';
end $$;

-- 9. The contract of the new storage: edges, facts and holds are immutable; a candidate keeps its
-- identity and only moves forward; nothing is deleted or truncated.
do $$ declare attempt text;rejected boolean;begin
 foreach attempt in array array[
  format('update private.institutional_result_dependencies set logical_key=%L where result_id=%L','x',pg_temp.id('R0')),
  format('delete from private.institutional_result_dependencies where result_id=%L',pg_temp.id('R0')),
  'truncate private.institutional_result_dependencies',
  format('update private.institutional_result_invalidations set reason_class=%L where result_id=%L','graph_incomplete',pg_temp.id('R0')),
  format('delete from private.institutional_result_invalidations where result_id=%L',pg_temp.id('R0')),
  'truncate private.institutional_result_invalidations',
  'truncate private.institutional_recompute_holds',
  'delete from private.institutional_recompute_holds',
  format('update public.institutional_recompute_candidates set base_result_id=%L,revision=revision+1 where id=%L',pg_temp.id('R1'),pg_temp.id('K1')),
  format('update public.institutional_recompute_candidates set state=%L,reason=null,revision=revision+1 where id=%L','scheduled',pg_temp.id('K1')),
  format('update public.institutional_recompute_candidates set result_id=%L,revision=revision+1 where id=%L',pg_temp.id('R2'),pg_temp.id('K1')),
  format('delete from public.institutional_recompute_candidates where id=%L',pg_temp.id('K1')),
  'truncate public.institutional_recompute_candidates'] loop
  rejected:=false;
  begin
   execute attempt;
  exception
   when check_violation then
    if sqlerrm not in ('work_continuity_history_immutable','institutional_recompute_candidate_transition_invalid') then raise; end if;
    rejected:=true;
   -- The candidates are referenced by the results they produced: truncation stops there first.
   when feature_not_supported then
    if sqlerrm<>'cannot truncate a table referenced in a foreign key constraint' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'history was rewritten: %',attempt; end if;
 end loop;
 rejected:=false;
 begin
  update private.institutional_recompute_holds set released_at=clock_timestamp() where released_at is not null;
  if not found then raise exception 'no released hold to probe'; end if;
 exception when check_violation then
  if sqlerrm<>'institutional_recompute_hold_transition_invalid' then raise; end if; rejected:=true;
 end;
 if not rejected then raise exception 'a released hold was released again'; end if;
 raise notice 'PASS: edges, facts, holds and candidates are immutable history; candidate state only moves forward';
end $$;

-- 10. Read authority is the work's: the owner reads the candidates of P, a member without access and
-- anon read nothing, nobody writes through the API, and the private storage is closed.
do $$ declare attempt text;rejected boolean;visible bigint;
 expected bigint:=(select count(*) from public.institutional_recompute_candidates where work_id='c5a10000-0000-4000-9000-000000000010');begin
 perform pg_temp.act_as('c5a10000-0000-4000-8000-000000000001');
 set local role authenticated;
 select count(*) into visible from public.institutional_recompute_candidates where work_id='c5a10000-0000-4000-9000-000000000010';
 if expected=0 or visible<>expected then raise exception 'the owner does not read the candidates of the work: % of %',visible,expected; end if;
 foreach attempt in array array[
  format('update public.institutional_recompute_candidates set state=%L,reason=%L,revision=revision+1 where id=%L','declined','manual',pg_temp.id('K4')),
  format('delete from public.institutional_recompute_candidates where id=%L',pg_temp.id('K4')),
  format('insert into public.institutional_recompute_candidates(organization_id,work_id,request_id,idempotency_key,base_result_id,new_input_fingerprint,head_inputs,result_ids,requested_by,state) select organization_id,work_id,request_id,repeat(%L,64),base_result_id,new_input_fingerprint,head_inputs,result_ids,requested_by,%L from public.institutional_recompute_candidates where id=%L','0','scheduled',pg_temp.id('K4')),
  'select count(*) from private.institutional_result_dependencies',
  'select count(*) from private.institutional_result_invalidations',
  'select count(*) from private.institutional_recompute_holds',
  'select count(*) from private.institutional_result_dependency_sources_v1',
  format('select private.work_stale_dependents_v1(%L,%L)','c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-9000-000000000010'),
  format('select private.plan_institutional_recompute_v1(%L,%L,%L)','c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-9000-000000000010',gen_random_uuid()),
  format('select private.enqueue_institutional_recompute_v1(%L,%L)','c5a10000-0000-4000-9000-000000000001',pg_temp.id('K4')),
  format('select public.propagate_project_canonical_revision_v1(%L,%L,%L)','c5a10000-0000-4000-9000-000000000010',gen_random_uuid(),'pt-BR')] loop
  rejected:=false;
  begin
   execute attempt;
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'a tenant reached institutional recompute storage directly: %',attempt; end if;
 end loop;
 perform pg_temp.act_as('c5a10000-0000-4000-8000-000000000003');
 if exists(select 1 from public.institutional_recompute_candidates) then raise exception 'a member without access reads the candidates'; end if;
 perform pg_temp.act_as('c5a10000-0000-4000-8000-000000000004');
 if exists(select 1 from public.institutional_recompute_candidates) then raise exception 'a foreign tenant reads the candidates'; end if;
 reset role;
 set local role anon;
 begin
  perform 1 from public.institutional_recompute_candidates;
  raise exception 'anon reads the candidates';
 exception when insufficient_privilege then null;
 end;
 reset role;
 perform pg_temp.act_as(null);
 raise notice 'PASS: candidates are read through the work''s authority only; no API role writes them or reaches the private storage';
end $$;

-- 11. The worker reads freshness for the case analysis it holds, through that job's capability, and
-- only for that kind: the stale dependents of the job's work (R3, whose document moved, until its
-- recomputation R4 completes).
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values('c5a10000-0000-4000-9000-000000000032','c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-9000-000000000011',
 (select coalesce(max(run_no),0)+1 from public.processing_runs where intake_session_id='c5a10000-0000-4000-9000-000000000011'),
 'manual','running','freshness-test-v1','c5a10000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,kind,status,payload)
values('c5a10000-0000-4000-9000-000000000033','c5a10000-0000-4000-9000-000000000001','c5a10000-0000-4000-9000-000000000032','c5a10000-0000-4000-9000-000000000011',
 'case_analysis','queued','{"analysis_scope":"full_case","execution_mode":"primary"}');
select pg_temp.fixture_approve_execution('c5a10000-0000-4000-9000-000000000033');
select pg_temp.act_as(null);
select pg_temp.lease('c5a10000-0000-4000-9000-000000000033',repeat('w',64));
select pg_temp.lease(pg_temp.job_of('c5a10000-0000-4000-9000-0000000000b2'),repeat('x',64));
do $$ declare body jsonb;rejected boolean:=false;other uuid:=pg_temp.job_of('c5a10000-0000-4000-9000-0000000000b2');begin
 perform pg_temp.act_as('c5a10000-0000-4000-8000-000000000009');
 set local role authenticated;
 body:=public.worker_load_work_freshness_v1('c5a10000-0000-4000-9000-000000000033',repeat('w',64));
 if body<>'{"workId": "c5a10000-0000-4000-9000-000000000010", "schemaVersion": "work-freshness.v1", "staleExecutions": 0, "staleDependents": 1, "staleInstitutionalResults": 1}'::jsonb then
  raise exception 'freshness of the case work mismatch: %',body;
 end if;
 begin
  perform public.worker_load_work_freshness_v1(other,repeat('x',64));
 exception when insufficient_privilege then
  if sqlerrm<>'work_freshness_capability_required' then raise; end if; rejected:=true;
 end;
 if not rejected then raise exception 'freshness was read through another job kind'; end if;
 rejected:=false;
 begin
  perform public.worker_load_work_freshness_v1('c5a10000-0000-4000-9000-000000000033',repeat('y',64));
 exception when insufficient_privilege then rejected:=true;
 end;
 if not rejected then raise exception 'freshness was read without the capability'; end if;
 reset role;
 perform pg_temp.act_as(null);
 raise notice 'PASS: the case analysis reads the stale dependents of its work through a closed worker RPC bound to its job capability';
end $$;

-- 12. The retired propagation refuses by name, and no API role may execute it.
do $$ declare rejected boolean:=false;begin
 begin
  perform private.propagate_project_canonical_revision_v1('c5a10000-0000-4000-9000-000000000010','c5a10000-0000-4000-9000-0000000000d1','pt-BR');
 exception when insufficient_privilege then
  if sqlerrm<>'project_revision_propagation_retired' then raise; end if; rejected:=true;
 end;
 if not rejected or has_function_privilege('authenticated','public.propagate_project_canonical_revision_v1(uuid,uuid,text)','execute')
 or has_function_privilege('authenticated','private.propagate_project_canonical_revision_v1(uuid,uuid,text)','execute') then
  raise exception 'the retired propagation is still reachable';
 end if;
 raise notice 'PASS: the retired canonical revision propagation refuses with project_revision_propagation_retired';
end $$;

-- 13. The authority sweep is unchanged: the requester is suspended while the recompute job waits, the
-- sweep cancels the job, the candidate fails and the request is declined.
update public.organization_memberships set status='suspended' where organization_id='c5a10000-0000-4000-9000-000000000001' and user_id='c5a10000-0000-4000-8000-000000000001';
select pg_temp.drain_outbox();
do $$ begin
 if (select status from public.processing_jobs where id=pg_temp.job_of(pg_temp.id('R4')))<>'cancelled'
 or (select state||':'||reason from public.institutional_recompute_candidates where id=pg_temp.id('K4'))<>'failed:job_cancelled'
 or (select status from public.work_continuation_requests where id=(select request_id from public.institutional_recompute_candidates where id=pg_temp.id('K4')))<>'declined' then
  raise exception 'the sweep did not cancel the recompute of a suspended requester';
 end if;
 raise notice 'PASS: the authority sweep cancels the recompute job of a requester who lost authority; the candidate fails and the request is declined';
end $$;

rollback;
select 'institutional_result_dependencies_passed' as result;
