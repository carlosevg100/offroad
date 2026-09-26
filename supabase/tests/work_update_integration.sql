-- Stage 18, increment 5C: adoption of every dependent of an update, a decline that stops what it
-- declines, the end of a follow-up, and the lock order of the approve-and-calculate command. One work
-- (W1, with its document intake session) carries executions of the synthetic method and the results
-- of the institutional model over the same documents, so one change reaches both kinds. Synthetic
-- rows only; everything rolls back.
begin;
\ir support/contextual_adoption_setup.sql
\ir support/execution_method_fixture.sql
\ir support/execution_approval.sql
set local lock_timeout = '5s';
set local statement_timeout = '180s';

-- Organization a11b...9000-1, owner a11b...8000-1, plain member a11b...8000-2 (no access to the work),
-- work W1 a11b...9000-2 with intake session a11b...9000-3. A separate worker account drains the
-- outbox, produces recomputations and leases the institutional jobs.
insert into auth.users(id,email) values('a4183000-0000-4000-8000-000000000009','integration-outbox-worker@example.invalid');
insert into private.worker_tokens(id,label,token_sha256)
values('a4183000-0000-4000-9000-0000000000f0','Synthetic integration outbox worker',extensions.digest('synthetic-dependency-outbox-token','sha256'));
create temporary table dep(name text primary key,id uuid not null);
grant select on dep to authenticated;
create temporary table probe(label text primary key,body jsonb);
grant select on probe to authenticated;

-- auth.uid() prefers request.jwt.claim.sub, which the fixture sets: switch both claims together.
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
end $$;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select id from dep where name=p_name $$;
create function pg_temp.name_id(p_kind text,p_name text) returns uuid language sql immutable as $$
 select extensions.uuid_generate_v5(extensions.uuid_ns_url(),'offroad:test:work-update-integration:'||p_kind||':'||p_name);
$$;
-- The error a statement raises, as the current role, compared by its message.
create function pg_temp.expect_error(p_sql text,p_message text,p_label text) returns void language plpgsql as $$
begin
 begin
  execute p_sql;
 exception when others then
  if sqlerrm=p_message then raise notice 'PASS: %',p_label; return; end if;
  raise exception '% failed with "%" instead of "%"',p_label,sqlerrm,p_message;
 end;
 raise exception '% was accepted',p_label;
end $$;

-- One verified and clean document of the session: an immutable version of a logical source (a null
-- logical id starts a source), read by the executions and listed in the institutional manifest.
create function pg_temp.document(p_name text,p_logical uuid) returns uuid language plpgsql as $$
declare v uuid:=pg_temp.name_id('document',p_name);hash text:=encode(extensions.digest(p_name,'sha256'),'hex');
begin
 insert into public.source_documents(id,organization_id,intake_session_id,logical_source_id,object_path,original_name,mime_type,byte_size,sha256,
  sha256_verified_at,scan_result,created_by,processing_status)
 values(v,'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',p_logical,
  'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/'||p_name||'.txt','Synthetic source '||p_name,'text/plain',1,hash,
  now(),'{"verdict":"clean"}','a11b0000-0000-4000-8000-000000000001','ready');
 insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
 values('a11b0000-0000-4000-9000-000000000001',v,gen_random_uuid(),hash,1,'synthetic-only-'||p_name);
 insert into dep values(p_name,v);
 return v;
end $$;
-- An execution the owner requests over the named source versions and adopted decisions; with
-- objectives, its input snapshot carries them where the capital request writes them.
create function pg_temp.request_execution(p_name text,p_sources text[],p_decisions uuid[],p_version uuid,p_objectives text[] default null) returns uuid language plpgsql as $$
declare x uuid:=pg_temp.name_id('execution',p_name);c jsonb:=pg_temp.execution_contract_fixture(pg_temp.name_id('execution',p_name));p private.execution_method_profiles;snapshot text:='{}';
begin
 select * into strict p from private.execution_method_profiles where id='a4171000-0000-4000-9000-000000000001';
 if p_objectives is not null then
  snapshot:=jsonb_build_object('decision',jsonb_build_object('review',jsonb_build_object('composition',jsonb_build_object('question','Synthetic question','objectives',to_jsonb(p_objectives)))))::text;
  c:=jsonb_set(c,'{inputs,fingerprint}',to_jsonb(encode(extensions.digest(snapshot,'sha256'),'hex')));
 end if;
 c:=jsonb_set(c,'{method}',p.payload->'method');
 c:=jsonb_set(c,'{inputs,sources}',coalesce((select jsonb_agg(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId',v.id,
  'contentHash',v.declared_sha256,'rightsRevision','1') order by v.id) from public.source_versions v join dep d on d.id=v.id where d.name=any(p_sources)),'[]'));
 c:=jsonb_set(c,'{inputs,adoptions}',coalesce((select jsonb_agg(jsonb_build_object('id',d,'assumptionVersionId',v.id,'fingerprint',v.content_fingerprint) order by d)
  from unnest(p_decisions) d cross join public.assumption_versions v where v.id=p_version),'[]'));
 perform private.request_work_execution_v1(p.id,c::text,snapshot);
 insert into dep values(p_name,x);
 return x;
end $$;
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
-- The worker's recompute of an execution candidate, as increment 3B's test produces it.
create temporary table recompute_step(name text primary key,value jsonb);
create function pg_temp.remember(p_name text,p_value jsonb) returns jsonb language sql as $$
 insert into recompute_step values(p_name,p_value) on conflict(name) do update set value=excluded.value returning value;
$$;
create function pg_temp.as_worker(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;begin
 perform pg_temp.act_as('a4183000-0000-4000-8000-000000000009');
 execute p_sql into r;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 return r;
end $$;
create function pg_temp.lease_args(p_claim jsonb) returns text language sql as $$
 select format('%L,%L,%L',p_claim->>'candidateId',p_claim->>'leaseId',p_claim->>'capability');
$$;
create function pg_temp.produce(p_sources text[],p_snapshot text default '{}') returns jsonb language plpgsql as $$
declare c jsonb;b jsonb;k jsonb;begin
 c:=pg_temp.as_worker('select public.worker_claim_dependency_recompute_v1(''synthetic-dependency-outbox-token'',120)');
 if not coalesce((c->>'claimed')::boolean,false) then raise exception 'nothing to claim'; end if;
 b:=pg_temp.as_worker(format('select public.worker_dependency_recompute_basis_v1(''synthetic-dependency-outbox-token'',%s)',pg_temp.lease_args(c)));
 if not coalesce((b->>'available')::boolean,false) then raise exception 'basis unavailable: %',b; end if;
 select jsonb_build_object('schemaVersion','execution-contract.v1','executionId',gen_random_uuid(),'organizationId',x->>'organizationId','workId',x->>'workId',
  'principalId',x->>'principalId','requestId',c->>'candidateId','processingRunId',gen_random_uuid(),'purpose',x->>'purpose','method',x#>'{profile,method}',
  'tools',x#>'{profile,tools}','allowedEffects',x#>'{profile,allowedEffects}',
  'audience',jsonb_build_object('kind','work_participants','workId',x->>'workId','policyFingerprint',x->>'policyFingerprint'),
  'policy',jsonb_build_object('version','execution-authority.v1','authorityRevision',x->>'authorityRevision','fingerprint',x->>'policyFingerprint'),
  'inputs',jsonb_build_object('snapshotId',gen_random_uuid(),'fingerprint',encode(extensions.digest(p_snapshot,'sha256'),'hex'),
   'sources',coalesce((select jsonb_agg(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId',v.id,'contentHash',v.declared_sha256,
     'rightsRevision','1') order by v.id) from public.source_versions v join dep d on d.id=v.id where d.name=any(p_sources)),'[]'::jsonb),
   'adoptions',x->'adoptions','hypotheses',x->'hypotheses'),
  'budget',jsonb_build_object('maxCostMicrousd',0,'maxModelCalls',0,'maxDurationMs',31000,'expiresAt',clock_timestamp()+interval '1 hour'),'requestedAt',clock_timestamp())
 into k from (select b->'basis' as x) f;
 return pg_temp.as_worker(format('select public.worker_submit_dependency_recompute_v1(''synthetic-dependency-outbox-token'',%s,%L,%L,%L)',pg_temp.lease_args(c),k::text,p_snapshot,
  private.execution_gates_canonical_text_v1(jsonb_build_object('schemaVersion','execution-gates.v1','gatesVersion','2026.09.24-v1','blocked',false,
   'companyRegistration',b#>>'{basis,company,registration}','research',b#>>'{basis,company,research}',
   'methodSelection',jsonb_build_object('selectionVersion','2026.09.24-v1','situationIds',jsonb_build_array('refinancing'),
    'methodId',b#>>'{basis,profile,method,methodId}','methodVersion',b#>>'{basis,profile,method,methodVersion}'),
   'conventions','[]'::jsonb,'voice',jsonb_build_object('version','2026.09.24-v1','blockCount',0,'warnCount',0)))));
end $$;
-- The pinned consumer's lease on an execution job, and the commit of its result under that lease.
create function pg_temp.claim_execution(p_execution uuid) returns jsonb language plpgsql as $$
declare job uuid;begin
 select id into strict job from public.processing_jobs where execution_id=p_execution;
 return private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',job,60)||jsonb_build_object('jobId',job);
end $$;
create function pg_temp.commit_claimed(p_execution uuid,p_claim jsonb) returns void language plpgsql as $$
declare job uuid:=(p_claim->>'jobId')::uuid;begin
 perform private.reserve_execution_operation_v1(job,p_claim->>'capability',(p_claim->>'leaseId')::uuid,p_execution,p_claim->>'contractFingerprint','synthetic#calculate','test-v1','read_only',0,0);
 perform private.settle_execution_operation_v2(job,p_claim->>'capability',(p_claim->>'leaseId')::uuid,p_execution,p_claim->>'contractFingerprint',
  '{"calculation":"synthetic integration"}','succeeded','calculated',0,0);
 perform private.commit_work_execution_result_v1(job,p_claim->>'capability',(p_claim->>'leaseId')::uuid,p_claim->>'contractFingerprint',
  (select m.snapshot_fingerprint from private.execution_manifests m where m.execution_id=p_execution),'{"calculation":"synthetic integration"}','succeeded','calculated');
end $$;
create function pg_temp.commit_result(p_execution uuid) returns void language sql as $$
 select pg_temp.commit_claimed(p_execution,pg_temp.claim_execution(p_execution));
$$;
-- The open or moving dependency-update request of W1, its execution candidate of a named base and
-- the result milestones of an execution and of an institutional result.
create function pg_temp.update_request() returns public.work_continuation_requests language plpgsql as $$
declare r public.work_continuation_requests;begin
 select * into strict r from public.work_continuation_requests x where x.work_id='a11b0000-0000-4000-9000-000000000002' and x.kind='dependency_update'
  and x.status in ('open','awaiting_authorization','scheduled','ready');
 return r;
end $$;
create function pg_temp.candidate(p_execution text) returns public.work_recompute_candidates language plpgsql as $$
declare c public.work_recompute_candidates;begin
 select * into strict c from public.work_recompute_candidates x where pg_temp.id(p_execution)=any(x.execution_ids) order by x.created_at desc limit 1;
 return c;
end $$;
create function pg_temp.result_of(p_execution text) returns uuid language sql as $$
 select id from public.work_milestones where kind='execution_result' and subject_kind='work_execution' and subject_id=pg_temp.id(p_execution);
$$;
create function pg_temp.institutional_result_of(p_result uuid) returns uuid language sql as $$
 select id from public.work_milestones where kind='execution_result' and subject_kind='institutional_model_result' and subject_id=p_result;
$$;

-- The institutional model of W1: a candidate configuration awaiting review, approved by the product's
-- own command, and the worker's lease, writer effect and completion of the job of a result (the
-- writer's effect without the economic validation it applies to real artifacts, as 5A's test does).
create function pg_temp.configuration(p_name text,p_revision integer,p_parent text,p_documents text[]) returns uuid language plpgsql as $$
declare v uuid:=pg_temp.name_id('configuration',p_name);submission uuid:=pg_temp.name_id('submission',p_name);
 body jsonb:=jsonb_build_object('modelId','synthetic-integration','scenario',p_name);reviews jsonb;
 manifest text:=private.institutional_source_context('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003')->>'sourceManifestFingerprint';
begin
 if p_documents is not null then
  select coalesce(jsonb_agg(jsonb_build_object('sourceDocument',d.id,'version','1','hash',d.sha256) order by d.id),'[]'::jsonb) into reviews
  from public.source_documents d where d.id in (select pg_temp.id(x) from unnest(p_documents) x);
  insert into public.agent_messages(id,organization_id,conversation_id,intake_session_id,role,status,content,locale,metadata,created_by)
  select submission,c.organization_id,c.id,c.intake_session_id,'user','completed','Revisar a configuração e as fontes do modelo financeiro.','pt-BR',
   jsonb_build_object('kind','institutional_model_setup','institutionalSubmissionId',submission),'a11b0000-0000-4000-8000-000000000001'
  from public.agent_conversations c where c.intake_session_id='a11b0000-0000-4000-9000-000000000003';
 end if;
 insert into private.institutional_model_configurations(id,organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status,answer_evidence)
 values(v,'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002',p_revision,body,private.institutional_config_hash(body),
  (select c.configuration_fingerprint from private.institutional_model_configurations c where c.id=pg_temp.id(p_parent)),'review_required',
  case when p_documents is null then jsonb_build_object('kind','assumption_change','synthetic',true)
  else jsonb_build_object('kind','initial_configuration','submissionId',submission,'sourceManifestFingerprint',manifest,'lineage','[]'::jsonb,'sourceBindings',reviews) end);
 if p_documents is not null then
  insert into private.institutional_model_setup_submissions(id,organization_id,capital_project_id,intake_session_id,source_manifest_fingerprint,configuration,source_reviews,
   status,candidate_id,submitted_by,submitted_at)
  values(submission,'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000003',manifest,body,reviews,
   'review_required',v,'a11b0000-0000-4000-8000-000000000001',now());
 end if;
 insert into dep values(p_name,v);
 return v;
end $$;
create function pg_temp.approve(p_configuration text,p_request uuid) returns jsonb language plpgsql as $$
declare c private.institutional_model_configurations;body jsonb;
begin
 select * into strict c from private.institutional_model_configurations where id=pg_temp.id(p_configuration);
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 set local role authenticated;
 body:=public.review_institutional_configuration_and_calculate_v1('a11b0000-0000-4000-9000-000000000002',c.id,c.parent_fingerprint,'approved',c.configuration_fingerprint,p_request,'pt-BR');
 reset role;
 -- The calculation turn the command may post is answered at once, so the conversation stays free.
 update public.agent_messages set status='completed' where id=p_request and status<>'completed';
 return body;
end $$;
create function pg_temp.job_of(p_result uuid) returns uuid language sql as $$
 select j.id from public.processing_jobs j where j.kind='agent_operation_brief' and j.payload->>'message_id'=p_result::text;
$$;
create function pg_temp.lease(p_job uuid,p_capability text) returns void language sql as $$
 update public.processing_jobs set status='leased',attempts=attempts+1,lease_expires_at=now()+interval '10 minutes',
  capability_sha256=extensions.digest(p_capability,'sha256'),leased_by='a4183000-0000-4000-9000-0000000000f0',leased_account_user_id='a4183000-0000-4000-8000-000000000009'
 where id=p_job;
$$;
create function pg_temp.record(p_result uuid,p_status text) returns void language sql as $$
 update private.institutional_model_results set status=p_status,produced_at=clock_timestamp(),
  artifact=case when p_status='completed' then jsonb_build_object('synthetic',true,'result',p_result) end,
  blockers=case when p_status='blocked' then '["institutional_result_approval_or_sources_changed"]'::jsonb else '[]'::jsonb end
 where id=p_result;
$$;
create function pg_temp.complete_job(p_job uuid,p_capability text) returns void language plpgsql as $$
begin
 perform pg_temp.act_as('a4183000-0000-4000-8000-000000000009');
 set local role authenticated;
 perform public.worker_complete_job(p_job,p_capability,jsonb_build_object('mode','institutional_model_recompute','modelCalls',0));
 reset role;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
end $$;
-- The real result writer and the real completion, as the worker: after a decline both must refuse.
create function pg_temp.worker_writes(p_job uuid,p_capability text) returns text language plpgsql as $$
declare refusals text:='';
begin
 perform pg_temp.act_as('a4183000-0000-4000-8000-000000000009');
 set local role authenticated;
 begin
  perform public.worker_record_institutional_model_result_v1(p_job,p_capability,jsonb_build_object('status','completed','artifact',jsonb_build_object('synthetic',true)));
 exception when others then refusals:=refusals||sqlerrm;
 end;
 begin
  perform public.worker_complete_job(p_job,p_capability,'{}'::jsonb);
 exception when others then refusals:=refusals||','||sqlerrm;
 end;
 reset role;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 return refusals;
end $$;
create function pg_temp.current_result() returns jsonb language plpgsql as $$
declare v jsonb;begin
 set local role authenticated;
 v:=public.read_institutional_model_results_v1('a11b0000-0000-4000-9000-000000000002')->'latest';
 reset role;
 return v;
end $$;
create function pg_temp.stale() returns jsonb language sql as $$
 select private.work_stale_dependents_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002');
$$;
create function pg_temp.view() returns jsonb language plpgsql as $$
declare v jsonb;begin
 set local role authenticated;
 v:=public.work_update_view_v1('a11b0000-0000-4000-9000-000000000002');
 reset role;
 return v;
end $$;
-- A cancelled job and its run, as the authority sweep leaves them, with the person's decline as reason.
create function pg_temp.cancelled_by_decline(p_job uuid) returns boolean language sql as $$
 select exists(select 1 from public.processing_jobs j join public.processing_runs r on r.id=j.processing_run_id
  where j.id=p_job and j.status='cancelled' and j.capability_sha256 is null and j.lease_expires_at is null and j.leased_by is null
  and j.last_error='{"reason":"person_declined"}'::jsonb and r.status='cancelled' and r.error='{"reason":"person_declined"}'::jsonb and r.completed_at is not null);
$$;

-- 0. Setup: the executions of the synthetic method over documents S1 and T1 (X1 committed, X3 not),
-- an accepted execution brief (the approved base BRIEF), and the first institutional calculation R0,
-- requested by the owner through the approval of C1 over the same documents and produced by the worker.
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb);
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb||jsonb_build_object('requestId','a4183000-0000-4000-9000-0000000000a2',
 'expectedVersionId','a9990000-0000-4000-9000-000000000003','observationId',current_setting('test.adoption.budget')));
insert into dep values('V2','a4183000-0000-4000-9000-0000000000a2');
insert into dep select 'dA1',decision_id from private.assumption_version_items where version_id='a9990000-0000-4000-9000-000000000003';
select pg_temp.document('S1',null);
select pg_temp.document('T1',null);
insert into dep select 'S',source_id from public.source_versions where id=pg_temp.id('S1');
select pg_temp.request_execution('X1',array['S1'],array[pg_temp.id('dA1')],pg_temp.id('V2'));
select pg_temp.request_execution('X3',array['T1'],array[]::uuid[],null);
select pg_temp.commit_result(pg_temp.id('X1'));
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values('a5c00000-0000-4000-9000-0000000000d1','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',41,'manual','queued','approval-fixture-v1','a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values('a5c00000-0000-4000-9000-0000000000d2','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a5c00000-0000-4000-9000-0000000000d1','case_analysis','queued','{"analysis_scope":"full_case"}');
select pg_temp.fixture_approve_execution('a5c00000-0000-4000-9000-0000000000d2');
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
update public.processing_jobs set status='cancelled' where id='a5c00000-0000-4000-9000-0000000000d2';
insert into dep select 'BRIEF',id from public.work_milestones where work_id='a11b0000-0000-4000-9000-000000000002' and kind='decision' and subject_kind='execution_brief';
select pg_temp.drain_outbox();
update private.worker_tokens set execution_account_user_id='a4183000-0000-4000-8000-000000000009' where id='a4183000-0000-4000-9000-0000000000f0';
insert into private.platform_principals(user_id,role,label) values('a11b0000-0000-4000-8000-000000000001','founder','Synthetic founder');
select private.grant_execution_producer_v1('a5c00000-0000-4000-9000-0000000000e1','a11b0000-0000-4000-9000-000000000001',true,
 'Synthetic producer grant for the integration proof','a11b0000-0000-4000-8000-000000000001');
select pg_temp.configuration('C1',1,null,array['S1','T1']);
select pg_temp.approve('C1','a5c00000-0000-4000-9000-0000000000a0');
insert into dep values('R0','a5c00000-0000-4000-9000-0000000000a0');
select pg_temp.lease(pg_temp.job_of(pg_temp.id('R0')),repeat('r',64));
select pg_temp.record(pg_temp.id('R0'),'completed');
select pg_temp.complete_job(pg_temp.job_of(pg_temp.id('R0')),repeat('r',64));
select pg_temp.drain_outbox();

-- 1. A completed institutional result has its result milestone, from the single mapping of increment
-- 2, written in the transaction that completes it: an execution_result of subject
-- institutional_model_result, by the person who requested it, at the moment it was produced. The
-- backfill writes nothing more. The first calculation is the person's request and is current.
do $$ declare r private.institutional_model_results;m public.work_milestones;begin
 select * into strict r from private.institutional_model_results where id=pg_temp.id('R0');
 select * into strict m from public.work_milestones where id=pg_temp.institutional_result_of(r.id);
 if m.kind<>'execution_result' or m.subject_kind<>'institutional_model_result' or m.work_id<>r.capital_project_id or m.outcome<>'succeeded'
 or m.created_by<>r.requested_by or m.occurred_at<>r.produced_at or m.label<>'institutional_model_result'
 or m.version_fingerprint<>private.institutional_config_hash(r.artifact) or m.reference_milestone_ids<>'{}' then
  raise exception 'institutional result milestone mismatch: %',to_jsonb(m);
 end if;
 if private.backfill_work_milestones_v1()<>0 then raise exception 'the backfill wrote a milestone that already existed'; end if;
 if pg_temp.current_result()->>'id'<>r.id::text or pg_temp.current_result()->>'status'<>'completed' or not private.institutional_result_established_v1(r.organization_id,r.id) then
  raise exception 'the first calculation is not current: %',pg_temp.current_result();
 end if;
 raise notice 'PASS: a completed institutional result has its execution_result milestone, written by the completion and by the backfill of the same mapping, once';
end $$;
savepoint integration_base;

-- 2. A mixed update. S2 moves X1 (pinned S1) and R0 (its configuration was reviewed over S1): one
-- update, X1's candidate scheduled, R0 held until a configuration is approved over the current
-- documents. The worker recomputes X1; the owner approves C2 over the current documents and the graph
-- queues R1 under the approval's request id; the worker produces R1; the update is ready.
select pg_temp.document('S2',pg_temp.id('S'));
select pg_temp.drain_outbox();
do $$ declare r public.work_continuation_requests:=pg_temp.update_request();begin
 if r.status<>'open' or (pg_temp.candidate('X1')).state<>'scheduled'
 or not exists(select 1 from private.institutional_recompute_holds h where h.request_id=r.id and h.result_id=pg_temp.id('R0') and h.hold_kind='configuration_behind_source' and h.released_at is null) then
  raise exception 'setup: the mixed update is not open with its execution candidate and its institutional hold: %',to_jsonb(r);
 end if;
 insert into dep values('Q',r.id);
end $$;
select pg_temp.remember('x1',pg_temp.produce(array['S2']));
insert into dep select 'X1b',(value->>'executionId')::uuid from recompute_step where name='x1';
select pg_temp.commit_result(pg_temp.id('X1b'));
do $$ begin
 if (pg_temp.update_request()).status<>'open' or (pg_temp.candidate('X1')).state<>'settled' then
  raise exception 'setup: the settled execution candidate did not keep the update open behind its institutional hold';
 end if;
end $$;
select pg_temp.expect_error(format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),pg_temp.id('Q'),(pg_temp.update_request()).revision),
 'work_update_not_ready','an update is not adopted while an institutional dependent is held');
select pg_temp.configuration('C2',2,'C1',array['S2','T1']);
insert into probe select 'approve-c2',pg_temp.approve('C2','a5c00000-0000-4000-9000-0000000000a1');
insert into dep values('R1','a5c00000-0000-4000-9000-0000000000a1');
do $$ declare r public.work_continuation_requests:=pg_temp.update_request();k public.institutional_recompute_candidates;begin
 select * into strict k from public.institutional_recompute_candidates where request_id=r.id;
 if (select body->>'status' from probe where label='approve-c2')<>'dependency_update' or r.id<>pg_temp.id('Q') or r.status<>'scheduled'
 or k.result_id<>pg_temp.id('R1') or k.state<>'scheduled' or k.base_result_id<>pg_temp.id('R0')
 or exists(select 1 from private.institutional_recompute_holds h where h.request_id=r.id and h.released_at is null) then
  raise exception 'setup: the approval did not join the mixed update: % %',to_jsonb(r),to_jsonb(k);
 end if;
 insert into dep values('KI',k.id);
end $$;
select pg_temp.lease(pg_temp.job_of(pg_temp.id('R1')),repeat('s',64));
select pg_temp.record(pg_temp.id('R1'),'completed');
select pg_temp.complete_job(pg_temp.job_of(pg_temp.id('R1')),repeat('s',64));
do $$ declare r public.work_continuation_requests:=pg_temp.update_request();v jsonb;u jsonb;a jsonb;k jsonb;begin
 if r.status<>'ready' then raise exception 'setup: the mixed update is not ready: %',to_jsonb(r); end if;
 -- Before adoption: R1 is stored with its milestone and is not current; R0 stays current (outdated,
 -- since the approval moved its configuration), untouched, and counts as stale.
 if pg_temp.institutional_result_of(pg_temp.id('R1')) is null or private.institutional_result_established_v1('a11b0000-0000-4000-9000-000000000001',pg_temp.id('R1'))
 or pg_temp.current_result()->>'id'<>pg_temp.id('R0')::text or pg_temp.current_result()->>'status'<>'stale'
 or (select superseded_by from private.institutional_model_results where id=pg_temp.id('R0')) is not null
 or pg_temp.stale()<>'{"staleDependents": 2, "staleExecutions": 1, "staleInstitutionalResults": 1}'::jsonb then
  raise exception 'a recomputation not yet adopted is current, or the result it replaces moved: % %',pg_temp.current_result(),pg_temp.stale();
 end if;
 -- The read of the update: the institutional dependent with its kind, candidate, facts and released hold.
 v:=pg_temp.view();
 select x into u from jsonb_array_elements(v->'updates') x where x->>'requestId'=r.id::text;
 select x into a from jsonb_array_elements(u->'affected') x where x->>'executionId'=pg_temp.id('R0')::text;
 select x into k from jsonb_array_elements(u->'institutionalCandidates') x;
 if a->>'dependentKind'<>'institutional_result' or a->>'institutionalCandidateId'<>pg_temp.id('KI')::text
 or a->>'resultMilestoneId'<>pg_temp.institutional_result_of(pg_temp.id('R0'))::text
 or not exists(select 1 from jsonb_array_elements(a->'institutionalChanges') f where f->>'dependencyKind'='source_version' and f#>>'{pinned,versionId}'=pg_temp.id('S1')::text
  and f#>>'{head,versionId}'=pg_temp.id('S2')::text and f->>'name'='Synthetic source S2')
 or not exists(select 1 from jsonb_array_elements(a->'institutionalChanges') f where f->>'dependencyKind'='institutional_configuration' and f#>>'{pinned,revision}'='1' and f#>>'{head,revision}'='2')
 or not exists(select 1 from jsonb_array_elements(a->'institutionalHolds') h where h->>'kind'='configuration_behind_source' and h->>'releasedAt' is not null)
 or a->'changes'<>'[]'::jsonb or a->'holds'<>'[]'::jsonb
 or k->>'candidateId'<>pg_temp.id('KI')::text or k->>'state'<>'settled' or k->>'resultStatus'<>'completed' or (k->>'current')::boolean
 or k->>'resultMilestoneId'<>pg_temp.institutional_result_of(pg_temp.id('R1'))::text
 or (select x->>'dependentKind' from jsonb_array_elements(u->'affected') x where x->>'executionId'=pg_temp.id('X1')::text)<>'work_execution' then
  raise exception 'the read of a mixed update mismatch: %',u;
 end if;
 raise notice 'PASS: a mixed update is ready with a settled execution candidate and a settled institutional candidate; the recomputed institutional result is stored but not current';
end $$;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
select pg_temp.expect_error(format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),pg_temp.id('Q'),(pg_temp.update_request()).revision),
 'work_continuation_access_denied','the adoption of a mixed update by a member without access to the work is refused');
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select pg_temp.remember('adopt',public.adopt_work_update_v1('a5c00000-0000-4000-8000-000000000201',pg_temp.id('Q'),(pg_temp.update_request()).revision));
do $$ declare s jsonb:=(select value from recompute_step where name='adopt');r public.work_continuation_requests;m public.work_milestones;latest jsonb;history jsonb;begin
 select * into strict r from public.work_continuation_requests where id=pg_temp.id('Q');
 select * into strict m from public.work_milestones where kind='update_adopted' and subject_id=r.id;
 -- The new results first (the execution, then the institutional result), then what they replace.
 if r.status<>'adopted' or m.outcome<>'approved' or m.label<>'dependency_update_adopted' or m.revision<>r.revision-1
 or m.reference_milestone_ids<>array[pg_temp.result_of('X1b'),pg_temp.institutional_result_of(pg_temp.id('R1')),pg_temp.result_of('X1'),pg_temp.institutional_result_of(pg_temp.id('R0'))]
 or s->'adoptedResults'<>to_jsonb(array[pg_temp.result_of('X1b'),pg_temp.institutional_result_of(pg_temp.id('R1'))])
 or (s->>'supersededResults')::integer<>1 or substring(m.id::text,15,1)<>'5' then
  raise exception 'adoption of a mixed update mismatch: % %',to_jsonb(m),s;
 end if;
 -- Only now the institutional result the work shows as current is R1; R0 is previous, stored and identifiable.
 latest:=pg_temp.current_result();
 if latest->>'id'<>pg_temp.id('R1')::text or latest->>'status'<>'completed' or latest->'artifact' is null or latest->'artifact'='null'::jsonb
 or (select superseded_by from private.institutional_model_results where id=pg_temp.id('R0'))<>pg_temp.id('R1')
 or (select artifact from private.institutional_model_results where id=pg_temp.id('R0'))<>jsonb_build_object('synthetic',true,'result',pg_temp.id('R0'))
 or pg_temp.stale()->>'staleDependents'<>'0' then
  raise exception 'the adopted result is not current or the replaced one is not previous: % %',latest,pg_temp.stale();
 end if;
 set local role authenticated;
 history:=public.read_project_revision_history_v1('a11b0000-0000-4000-9000-000000000002');
 reset role;
 if not exists(select 1 from jsonb_array_elements(history->'revisions') v cross join jsonb_array_elements(v->'results') x where x->>'id'=pg_temp.id('R1')::text and (x->>'isCurrent')::boolean)
 or exists(select 1 from jsonb_array_elements(history->'revisions') v cross join jsonb_array_elements(v->'results') x where x->>'id'=pg_temp.id('R0')::text and (x->>'isCurrent')::boolean) then
  raise exception 'the revision history does not follow the adoption: %',history;
 end if;
 if not exists(select 1 from jsonb_array_elements(pg_temp.view()->'bases') b where b->>'milestoneId'=m.id::text) then raise exception 'the adoption is not a base'; end if;
 if not ((public.adopt_work_update_v1('a5c00000-0000-4000-8000-000000000201',r.id,r.revision-1))->>'replayed')::boolean then raise exception 'adoption replay not recognised'; end if;
 insert into dep values('U1',m.id);
 raise notice 'PASS: adopting a mixed update references the new execution and institutional results and what they replace; only then the adopted institutional result is current and the previous one is marked as previous';
end $$;

-- 3. An update with institutional dependents only is adopted too. C3 changes an assumption of C2: the
-- graph recomputes R1's lineage (R2); the update holds only an institutional candidate.
select pg_temp.configuration('C3',3,'C2',null);
select pg_temp.approve('C3','a5c00000-0000-4000-9000-0000000000a2');
insert into dep values('R2','a5c00000-0000-4000-9000-0000000000a2');
select pg_temp.lease(pg_temp.job_of(pg_temp.id('R2')),repeat('t',64));
select pg_temp.record(pg_temp.id('R2'),'completed');
select pg_temp.complete_job(pg_temp.job_of(pg_temp.id('R2')),repeat('t',64));
do $$ declare r public.work_continuation_requests:=pg_temp.update_request();s jsonb;m public.work_milestones;begin
 if r.status<>'ready' or exists(select 1 from public.work_recompute_candidates where request_id=r.id) then raise exception 'setup: the institutional update is not ready alone'; end if;
 s:=public.adopt_work_update_v1('a5c00000-0000-4000-8000-000000000202',r.id,r.revision);
 select * into strict m from public.work_milestones where id=(s->>'milestoneId')::uuid;
 if s->>'status'<>'adopted' or m.reference_milestone_ids<>array[pg_temp.institutional_result_of(pg_temp.id('R2')),pg_temp.institutional_result_of(pg_temp.id('R1'))]
 or pg_temp.current_result()->>'id'<>pg_temp.id('R2')::text or (select superseded_by from private.institutional_model_results where id=pg_temp.id('R1'))<>pg_temp.id('R2')
 or exists(select 1 from jsonb_array_elements(pg_temp.view()->'bases') b where b->>'milestoneId'=pg_temp.id('U1')::text) then
  raise exception 'adoption of an institutional-only update mismatch: % %',s,to_jsonb(m);
 end if;
 raise notice 'PASS: an update whose dependents are institutional results only is adopted, and its adoption replaces the earlier adoption as the base';
end $$;

-- 4. Decline stops what it declines. 4a: the whole update, while the worker holds the lease of the
-- institutional recompute and before it writes: the candidate ends declined, its job and run are
-- cancelled as the authority sweep cancels them, and the worker can no longer write or complete.
rollback to savepoint integration_base;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select pg_temp.configuration('C2',2,'C1',null);
select pg_temp.approve('C2','a5c00000-0000-4000-9000-0000000000a1');
insert into dep values('R1','a5c00000-0000-4000-9000-0000000000a1');
select pg_temp.lease(pg_temp.job_of(pg_temp.id('R1')),repeat('s',64));
do $$ declare r public.work_continuation_requests:=pg_temp.update_request();k public.institutional_recompute_candidates;s jsonb;job uuid:=pg_temp.job_of(pg_temp.id('R1'));m public.work_milestones;begin
 select * into strict k from public.institutional_recompute_candidates where request_id=r.id;
 if r.status<>'scheduled' or k.state<>'scheduled' then raise exception 'setup: no scheduled institutional recompute'; end if;
 s:=public.decline_work_update_v1('a5c00000-0000-4000-8000-000000000301',r.id,r.revision,'not_needed');
 select * into strict k from public.institutional_recompute_candidates where id=k.id;
 select * into strict m from public.work_milestones where id=(s->>'milestoneId')::uuid;
 if s->>'updateStatus'<>'declined' or (s->>'cancelledJobs')::integer<>1 or s->'declinedCandidates'<>jsonb_build_array(k.id)
 or k.state<>'declined' or k.reason<>'person_declined:not_needed' or not pg_temp.cancelled_by_decline(job)
 or m.kind<>'decision' or m.outcome<>'rejected' or m.label<>'dependency_update_declined' then
  raise exception 'decline of an update with a leased institutional recompute mismatch: % %',s,to_jsonb(k);
 end if;
 if pg_temp.worker_writes(job,repeat('s',64))<>'job_capability_invalid,job_capability_invalid'
 or (select status from private.institutional_model_results where id=pg_temp.id('R1'))<>'queued'
 or private.institutional_result_is_live_v1('a11b0000-0000-4000-9000-000000000001',pg_temp.id('R1'))
 or (select superseded_by from private.institutional_model_results where id=pg_temp.id('R0')) is not null
 or pg_temp.current_result()->>'id'<>pg_temp.id('R0')::text then
  raise exception 'a declined institutional recompute still wrote, or the current result moved';
 end if;
 raise notice 'PASS: declining an update cancels the leased job of its scheduled institutional recompute (sweep states, person_declined); the worker cannot write or complete it afterwards';
end $$;

-- 4b. The race, worker first: the worker writes R1 before the person declines that one candidate.
-- The decline still wins over the job (cancelled before completion), the candidate ends declined, and
-- R1 stays stored with its milestone, not adopted and never current.
rollback to savepoint integration_base;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select pg_temp.configuration('C2',2,'C1',null);
select pg_temp.approve('C2','a5c00000-0000-4000-9000-0000000000a1');
insert into dep values('R1','a5c00000-0000-4000-9000-0000000000a1');
select pg_temp.lease(pg_temp.job_of(pg_temp.id('R1')),repeat('s',64));
select pg_temp.record(pg_temp.id('R1'),'completed');
do $$ declare r public.work_continuation_requests:=pg_temp.update_request();k public.institutional_recompute_candidates;s jsonb;job uuid:=pg_temp.job_of(pg_temp.id('R1'));m public.work_milestones;u jsonb;begin
 select * into strict k from public.institutional_recompute_candidates where request_id=r.id;
 perform pg_temp.expect_error(format('select public.decline_work_update_v1(%L,%L,%L,%L,%L)',gen_random_uuid(),r.id,k.revision+1,'inputs_disputed',k.id),
  'work_update_changed','a candidate is declined only at the revision the person saw');
 s:=public.decline_work_update_v1('a5c00000-0000-4000-8000-000000000302',r.id,k.revision,'inputs_disputed',k.id);
 select * into strict k from public.institutional_recompute_candidates where id=k.id;
 select * into strict m from public.work_milestones where id=(s->>'milestoneId')::uuid;
 if s->>'candidateState'<>'declined' or (s->>'cancelledJobs')::integer<>1 or k.state<>'declined' or not pg_temp.cancelled_by_decline(job)
 or m.subject_kind<>'institutional_recompute_candidate' or m.subject_id<>k.id or m.outcome<>'rejected' or m.reference_milestone_ids<>'{}'
 or (select status from public.work_continuation_requests where id=r.id)<>'declined' then
  raise exception 'decline of one scheduled institutional candidate mismatch: % %',s,to_jsonb(k);
 end if;
 if pg_temp.worker_writes(job,repeat('s',64))<>'job_capability_invalid,job_capability_invalid'
 or (select status from private.institutional_model_results where id=pg_temp.id('R1'))<>'completed' or pg_temp.institutional_result_of(pg_temp.id('R1')) is null
 or private.institutional_result_established_v1('a11b0000-0000-4000-9000-000000000001',pg_temp.id('R1'))
 or pg_temp.current_result()->>'id'<>pg_temp.id('R0')::text or (select superseded_by from private.institutional_model_results where id=pg_temp.id('R0')) is not null then
  raise exception 'a result written before the decline became current, or the job still completed';
 end if;
 select x into u from jsonb_array_elements(pg_temp.view()->'updates') x where x->>'requestId'=r.id::text;
 if u#>>'{institutionalCandidates,0,state}'<>'declined' or (u#>>'{institutionalCandidates,0,current}')::boolean
 or u#>>'{institutionalCandidates,0,resultStatus}'<>'completed' then
  raise exception 'the read does not show the result as not adopted: %',u;
 end if;
 raise notice 'PASS: worker first: a result written before the decline stays stored and is shown as not adopted, never current; the job is cancelled before it completes';
end $$;

-- 4c. The race, decline first, on an execution candidate: the worker has leased the job of the
-- recomputed execution; the person declines that scheduled candidate; the job is cancelled and the
-- worker's commit under its lease is refused, so no result is written.
rollback to savepoint integration_base;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select pg_temp.document('S2',pg_temp.id('S'));
select pg_temp.drain_outbox();
select pg_temp.remember('x1',pg_temp.produce(array['S2']));
insert into dep select 'X1b',(value->>'executionId')::uuid from recompute_step where name='x1';
select pg_temp.remember('claim',pg_temp.claim_execution(pg_temp.id('X1b')));
do $$ declare r public.work_continuation_requests:=pg_temp.update_request();c public.work_recompute_candidates:=pg_temp.candidate('X1');s jsonb;refused text;
 job uuid:=(select (value->>'jobId')::uuid from recompute_step where name='claim');begin
 if c.state<>'scheduled' or c.execution_id<>pg_temp.id('X1b') or (select status from public.processing_jobs where id=job)<>'leased' then
  raise exception 'setup: the recomputed execution is not leased';
 end if;
 s:=public.decline_work_update_v1('a5c00000-0000-4000-8000-000000000303',r.id,c.revision,'cost_not_justified',c.id);
 c:=pg_temp.candidate('X1');
 if c.state<>'declined' or c.reason<>'person_declined:cost_not_justified' or (s->>'cancelledJobs')::integer<>1 or not pg_temp.cancelled_by_decline(job)
 or (select subject_kind from public.work_milestones where id=(s->>'milestoneId')::uuid)<>'work_recompute_candidate' then
  raise exception 'decline of a scheduled execution candidate mismatch: % %',s,to_jsonb(c);
 end if;
 begin
  perform pg_temp.commit_claimed(pg_temp.id('X1b'),(select value from recompute_step where name='claim'));
  refused:='accepted';
 exception when others then refused:=sqlerrm;
 end;
 if refused<>'execution_lease_denied' or exists(select 1 from private.execution_result_receipts where execution_id=pg_temp.id('X1b'))
 or private.execution_is_live_v1('a11b0000-0000-4000-9000-000000000001',pg_temp.id('X1b')) then
  raise exception 'the worker committed after the decline: %',refused;
 end if;
 raise notice 'PASS: decline first: declining a scheduled execution candidate cancels its leased job and the worker''s commit under that lease is refused; no result is written';
end $$;

-- 4d. The race, worker first, on an execution candidate: the result is committed before the decline;
-- the candidate is settled and cannot be declined alone; declining the whole update leaves the result
-- stored and not adopted, and releases the institutional hold.
rollback to savepoint integration_base;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select pg_temp.document('S2',pg_temp.id('S'));
select pg_temp.drain_outbox();
select pg_temp.remember('x1',pg_temp.produce(array['S2']));
insert into dep select 'X1b',(value->>'executionId')::uuid from recompute_step where name='x1';
select pg_temp.commit_result(pg_temp.id('X1b'));
do $$ declare r public.work_continuation_requests:=pg_temp.update_request();c public.work_recompute_candidates:=pg_temp.candidate('X1');s jsonb;begin
 perform pg_temp.expect_error(format('select public.decline_work_update_v1(%L,%L,%L,%L,%L)',gen_random_uuid(),r.id,c.revision,'not_needed',c.id),
  'work_update_candidate_not_waiting','worker first: a settled candidate is not declined alone');
 s:=public.decline_work_update_v1('a5c00000-0000-4000-8000-000000000304',r.id,r.revision,'other');
 if s->>'updateStatus'<>'declined' or (s->>'cancelledJobs')::integer<>0 or (s->>'releasedHolds')::integer<>1 or (pg_temp.candidate('X1')).state<>'settled'
 or not exists(select 1 from private.execution_result_receipts where execution_id=pg_temp.id('X1b'))
 or exists(select 1 from private.institutional_recompute_holds where request_id=r.id and released_at is null)
 or exists(select 1 from public.work_milestones where kind='update_adopted')
 or pg_temp.stale()->>'staleDependents'<>'0' then
  raise exception 'worker first on an execution: decline mismatch: %',s;
 end if;
 raise notice 'PASS: worker first: a committed execution result stays stored and not adopted when the update is declined; the institutional hold is released';
end $$;

-- 5. A follow-up ends. F1 continues from BRIEF; the next execution the owner requests whose
-- objectives cite F1's text (whatever the spacing or the case) fulfils it and records the base; an
-- execution that does not cite it changes nothing; its committed result makes F1 ready; the owner
-- adopts that result as the new base, which replaces BRIEF.
rollback to savepoint integration_base;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select public.request_work_continuation_v1('a5c00000-0000-4000-8000-000000000101','a11b0000-0000-4000-9000-000000000002','pt-BR','Aprofundar o cenário de refinanciamento',
 m.id,m.subject_id,m.revision) from public.work_milestones m where m.id=pg_temp.id('BRIEF');
insert into dep values('F1','a5c00000-0000-4000-8000-000000000101');
select pg_temp.request_execution('X4',array['T1'],array[]::uuid[],null,array['Medir a liquidez do horizonte']);
do $$ begin
 if (select status from public.work_continuation_requests where id=pg_temp.id('F1'))<>'open' then raise exception 'an execution that does not cite the follow-up fulfilled it'; end if;
end $$;
select pg_temp.request_execution('X5',array['T1'],array[]::uuid[],null,array['Medir a liquidez do horizonte','  aprofundar o  CENÁRIO de refinanciamento ']);
do $$ declare f public.work_continuation_requests;l private.work_followup_executions;b public.work_milestones;v jsonb;x jsonb;begin
 select * into strict f from public.work_continuation_requests where id=pg_temp.id('F1');
 select * into strict l from private.work_followup_executions where request_id=f.id;
 select * into strict b from public.work_milestones where id=pg_temp.id('BRIEF');
 if f.status<>'scheduled' or l.execution_id<>pg_temp.id('X5') or l.base_milestone_id<>b.id or l.base_decision_id<>b.subject_id or l.base_revision<>b.revision
 or l.created_by<>'a11b0000-0000-4000-8000-000000000001' then
  raise exception 'the citing execution did not fulfil the follow-up with its base: % %',to_jsonb(f),to_jsonb(l);
 end if;
 v:=pg_temp.view();
 select y into x from jsonb_array_elements(v->'followups') y where y->>'requestId'=f.id::text;
 if x->>'status'<>'scheduled' or x#>>'{execution,executionId}'<>pg_temp.id('X5')::text or x#>>'{execution,baseMilestoneId}'<>b.id::text
 or x#>>'{execution,jobStatus}'<>'queued' or x#>'{execution,resultMilestoneId}'<>'null'::jsonb or (x->>'revision')::integer<>f.revision then
  raise exception 'the read of a scheduled follow-up mismatch: %',x;
 end if;
 raise notice 'PASS: the next execution a person requests whose objectives cite the follow-up fulfils it and records the base it continues from; one that does not cite it changes nothing';
end $$;
select pg_temp.expect_error(format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),pg_temp.id('F1'),
 (select revision from public.work_continuation_requests where id=pg_temp.id('F1'))),'work_update_not_ready','a follow-up is not adopted before its execution commits');
select pg_temp.commit_result(pg_temp.id('X5'));
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
select pg_temp.expect_error(format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),pg_temp.id('F1'),
 (select revision from public.work_continuation_requests where id=pg_temp.id('F1'))),'work_continuation_access_denied','a member without access cannot adopt a follow-up');
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
do $$ declare f public.work_continuation_requests;s jsonb;m public.work_milestones;bases jsonb;again jsonb;begin
 select * into strict f from public.work_continuation_requests where id=pg_temp.id('F1');
 if f.status<>'ready' then raise exception 'the committed result did not make the follow-up ready: %',f.status; end if;
 s:=public.adopt_work_update_v1('a5c00000-0000-4000-8000-000000000202',f.id,f.revision);
 select * into strict m from public.work_milestones where id=(s->>'milestoneId')::uuid;
 bases:=pg_temp.view()->'bases';
 if s->>'status'<>'adopted' or m.kind<>'update_adopted' or m.subject_id<>f.id or m.outcome<>'approved' or m.revision<>f.revision
 or m.label<>'Aprofundar o cenário de refinanciamento' or m.reference_milestone_ids<>array[pg_temp.result_of('X5'),pg_temp.id('BRIEF')]
 or s->>'continuesFrom'<>pg_temp.id('BRIEF')::text
 or not exists(select 1 from jsonb_array_elements(bases) b where b->>'milestoneId'=m.id::text)
 or exists(select 1 from jsonb_array_elements(bases) b where b->>'milestoneId'=pg_temp.id('BRIEF')::text) then
  raise exception 'adoption of a follow-up mismatch: % % %',s,to_jsonb(m),bases;
 end if;
 again:=public.adopt_work_update_v1('a5c00000-0000-4000-8000-000000000202',f.id,f.revision);
 if not (again->>'replayed')::boolean then raise exception 'follow-up adoption replay not recognised'; end if;
 -- The new base carries the next continuation.
 perform public.request_work_continuation_v1('a5c00000-0000-4000-8000-000000000102','a11b0000-0000-4000-9000-000000000002','pt-BR','Detalhar o cenário adotado',
  m.id,m.subject_id,m.revision);
 raise notice 'PASS: a ready follow-up is adopted as the new base: update_adopted references its execution''s result and the base it continues, which it replaces';
end $$;

-- 5b. A follow-up declined by a person, with a reason; a follow-up whose execution ended without a
-- result is fulfilled by the next execution that cites it; a recomputation the worker submits never
-- fulfils a follow-up; and a follow-up whose base a later decision replaced is not adopted.
rollback to savepoint integration_base;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select public.request_work_continuation_v1(x.id,'a11b0000-0000-4000-9000-000000000002','pt-BR',x.body,m.id,m.subject_id,m.revision)
from public.work_milestones m cross join (values ('a5c00000-0000-4000-8000-000000000111'::uuid,'Revisar o covenant de alavancagem'),
 ('a5c00000-0000-4000-8000-000000000112'::uuid,'Atualizar a estrutura de garantias'),('a5c00000-0000-4000-8000-000000000113'::uuid,'Aprofundar o custo de captação')) x(id,body)
where m.id=pg_temp.id('BRIEF');
insert into dep values('F2','a5c00000-0000-4000-8000-000000000111'),('F3','a5c00000-0000-4000-8000-000000000112'),('F4','a5c00000-0000-4000-8000-000000000113');
do $$ declare f public.work_continuation_requests;s jsonb;m public.work_milestones;begin
 select * into strict f from public.work_continuation_requests where id=pg_temp.id('F2');
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
 perform pg_temp.expect_error(format('select public.decline_work_update_v1(%L,%L,%L,%L)',gen_random_uuid(),f.id,f.revision,'not_needed'),
  'work_continuation_access_denied','a member without access cannot decline a follow-up');
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 s:=public.decline_work_update_v1('a5c00000-0000-4000-8000-000000000305',f.id,f.revision,'other');
 select * into strict f from public.work_continuation_requests where id=f.id;
 select * into strict m from public.work_milestones where id=(s->>'milestoneId')::uuid;
 if f.status<>'declined' or f.decline_reason<>'person_declined:other' or m.kind<>'decision' or m.outcome<>'rejected' or m.label<>'user_followup_declined'
 or m.reference_milestone_ids<>array[(select p.id from public.work_milestones p where p.kind='continuation_proposed' and p.subject_id=f.id)] then
  raise exception 'decline of a follow-up mismatch: % %',to_jsonb(f),to_jsonb(m);
 end if;
 -- A declined follow-up is not fulfilled by an execution that cites it afterwards.
 perform pg_temp.request_execution('X6',array['T1'],array[]::uuid[],null,array['Revisar o covenant de alavancagem']);
 if (select status from public.work_continuation_requests where id=f.id)<>'declined' or exists(select 1 from private.work_followup_executions where request_id=f.id) then
  raise exception 'a declined follow-up was fulfilled';
 end if;
 raise notice 'PASS: a person declines a follow-up with a reason; a rejected decision records it and no execution fulfils it afterwards';
end $$;
select pg_temp.request_execution('X7',array['T1'],array[]::uuid[],null,array['Atualizar a estrutura de garantias']);
update public.processing_jobs set status='cancelled',capability_sha256=null,lease_expires_at=null,leased_by=null where execution_id=pg_temp.id('X7');
select pg_temp.request_execution('X8',array['T1'],array[]::uuid[],null,array['Atualizar a estrutura de garantias']);
do $$ declare f public.work_continuation_requests;begin
 select * into strict f from public.work_continuation_requests where id=pg_temp.id('F3');
 if f.status<>'scheduled' or array(select l.execution_id from private.work_followup_executions l where l.request_id=f.id order by l.sequence)<>array[pg_temp.id('X7'),pg_temp.id('X8')] then
  raise exception 'the next citing execution did not take over from one that ended without a result: %',to_jsonb(f);
 end if;
 perform pg_temp.request_execution('X9',array['T1'],array[]::uuid[],null,array['Atualizar a estrutura de garantias']);
 if (select count(*) from private.work_followup_executions l where l.request_id=f.id)<>2 then raise exception 'a live execution was replaced by a later one'; end if;
 raise notice 'PASS: a follow-up whose execution ended without a result is fulfilled by the next execution that cites it; a live one is not replaced';
end $$;
-- The worker's recomputation of an execution whose snapshot cites F4 is not a person's request.
select pg_temp.document('S2',pg_temp.id('S'));
select pg_temp.drain_outbox();
select pg_temp.remember('x3',pg_temp.produce(array['S2'],'{"decision":{"review":{"composition":{"objectives":["Aprofundar o custo de captação"]}}}}'));
do $$ begin
 if coalesce((select (value->>'produced')::boolean from recompute_step where name='x3'),false) is not true
 or (select status from public.work_continuation_requests where id=pg_temp.id('F4'))<>'open' then
  raise exception 'a recomputation the worker submitted fulfilled a follow-up: %',(select value from recompute_step where name='x3');
 end if;
 raise notice 'PASS: a recomputation the worker submits for the original requester never fulfils a follow-up';
end $$;
-- F4 fulfilled and ready, then a decision replaces BRIEF before the adoption: the adoption is refused.
select pg_temp.request_execution('X10',array['T1'],array[]::uuid[],null,array['Aprofundar o custo de captação']);
select pg_temp.commit_result(pg_temp.id('X10'));
insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids)
values('a5c00000-0000-4000-9000-0000000000f4','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','decision','capital_project_artifact',
 gen_random_uuid(),'Synthetic newer approval',2,'approved','a11b0000-0000-4000-8000-000000000001',clock_timestamp(),array[pg_temp.id('BRIEF')]);
select pg_temp.expect_error(format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),pg_temp.id('F4'),
 (select revision from public.work_continuation_requests where id=pg_temp.id('F4'))),'work_continuation_base_superseded',
 'a follow-up whose base a later decision replaced is not adopted as a base');

-- 6. The approval's lock order. The command takes the project row for no key update; a graph step that
-- does not queue the approval's own result rolls back its effect and its locks, and the command falls
-- through to the calculation it always posted, holding no work lock.
rollback to savepoint integration_base;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
do $$ declare f text;body text;begin
 -- The command and the two review functions it runs in its transaction.
 foreach f in array array['private.review_institutional_configuration_and_calculate_v1(uuid,uuid,text,text,text,uuid,text)',
  'private.review_institutional_configuration_v1(uuid,uuid,text,text,text)','private.review_institutional_configuration_before_sources_v1(uuid,uuid,text,text,text)'] loop
  body:=pg_get_functiondef(f::regprocedure);
  if position('id=p_project_id for no key update;' in body)=0 or position('id=p_project_id for update;' in body)>0 then
   raise exception '% does not take the project row for no key update',f;
  end if;
 end loop;
 raise notice 'PASS: the approve-and-calculate command and the reviews it runs take the project row for no key update, as the continuation commands do';
end $$;
select pg_temp.configuration('C2',2,'C1',null);
-- The recomputation the graph queues is blocked at once by a test trigger, so the step applies its
-- effect without queueing the approval's own result.
-- A sequence counts the queued recomputations the step produced: nextval survives the rollback.
create temporary sequence unproductive_step_hits;
create function private.forced_unproductive_step_v1() returns trigger language plpgsql as $$
begin
 perform nextval('pg_temp.unproductive_step_hits');
 update private.institutional_model_results set status='blocked',produced_at=clock_timestamp(),blockers='["synthetic_unproductive_step"]' where id=new.id;
 return null;
end $$;
create trigger forced_unproductive_step after insert on private.institutional_model_results for each row when (new.recompute_candidate_id is not null)
 execute function private.forced_unproductive_step_v1();
insert into probe select 'approve-unproductive',pg_temp.approve('C2','a5c00000-0000-4000-9000-0000000000a9');
do $$ declare body jsonb:=(select body from probe where label='approve-unproductive');k bigint:=hashtextextended('work-continuation:a11b0000-0000-4000-9000-000000000001:a11b0000-0000-4000-9000-000000000002',0);begin
 if (select last_value from pg_temp.unproductive_step_hits)<>1
 or body->>'status'<>'queued' or (select recompute_candidate_id from private.institutional_model_results where id='a5c00000-0000-4000-9000-0000000000a9') is not null
 or exists(select 1 from public.institutional_recompute_candidates) or exists(select 1 from private.institutional_result_invalidations)
 or not exists(select 1 from private.event_outbox o join private.domain_events e on e.id=o.event_id where e.aggregate_kind='institutional_configuration' and o.status='pending')
 or exists(select 1 from pg_locks l where l.locktype='advisory' and l.pid=pg_backend_pid() and l.objsubid=1 and ((l.classid::bigint<<32)|l.objid::bigint)=k) then
  raise exception 'an unproductive graph step left its effect or its work lock behind: %',body;
 end if;
 raise notice 'PASS: a graph step that does not queue the approval''s result rolls back its effect and releases the work lock before the message-backed calculation';
end $$;
drop trigger forced_unproductive_step on private.institutional_model_results;
drop function private.forced_unproductive_step_v1();

-- 7. No authority, no command: the member without access to the work and a foreign tenant are refused
-- the decline of an institutional candidate and every command on updates and follow-ups, as the API role.
rollback to savepoint integration_base;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select pg_temp.configuration('C2',2,'C1',null);
select pg_temp.approve('C2','a5c00000-0000-4000-9000-0000000000a1');
select public.request_work_continuation_v1('a5c00000-0000-4000-8000-000000000121','a11b0000-0000-4000-9000-000000000002','pt-BR','Aprofundar o plano aprovado',
 m.id,m.subject_id,m.revision) from public.work_milestones m where m.id=pg_temp.id('BRIEF');
select set_config('test.refusals',jsonb_build_array(
 format('select public.decline_work_update_v1(%L,%L,%L,%L,%L)',gen_random_uuid(),r.id,k.revision,'not_needed',k.id),
 format('select public.decline_work_update_v1(%L,%L,%L,%L)',gen_random_uuid(),r.id,r.revision,'not_needed'),
 format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),r.id,r.revision),
 format('select public.decline_work_update_v1(%L,%L,%L,%L)',gen_random_uuid(),'a5c00000-0000-4000-8000-000000000121',1,'not_needed'),
 format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),'a5c00000-0000-4000-8000-000000000121',1),
 'select public.work_update_view_v1(''a11b0000-0000-4000-9000-000000000002'')')::text,true)
from public.work_continuation_requests r join public.institutional_recompute_candidates k on k.request_id=r.id where r.work_id='a11b0000-0000-4000-9000-000000000002';
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
set local role authenticated;
do $$ declare attempt text;refused integer:=0;begin
 for attempt in select jsonb_array_elements_text(current_setting('test.refusals')::jsonb) loop
  begin execute attempt; raise exception 'accepted for a member without access: %',attempt;
  exception when insufficient_privilege then if sqlerrm<>'work_continuation_access_denied' then raise; end if; refused:=refused+1;
  end;
 end loop;
 if refused<>6 then raise exception 'not every command was refused'; end if;
 raise notice 'PASS: a member without access to the work is refused every command on updates, candidates of both kinds and follow-ups, and the read';
end $$;
reset role;
do $$begin
 if (select state from public.institutional_recompute_candidates)<>'scheduled' or (select status from public.work_continuation_requests where id='a5c00000-0000-4000-8000-000000000121')<>'open'
 or exists(select 1 from public.processing_jobs where last_error='{"reason":"person_declined"}'::jsonb) then
  raise exception 'a refused command changed something';
 end if;
end $$;
-- The helpers are closed to every API role.
do $$ declare f record;role_name text;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in ('project_institutional_result_milestone_v1','institutional_result_established_v1','work_followup_citation_v1',
   'fulfil_work_followups_v1','advance_work_followups_v1','work_update_declinable_jobs_v1','lock_new_declinable_jobs_v1','cancel_declined_jobs_v1') loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,f.signature,'execute') then raise exception '% may execute %',role_name,f.signature; end if;
  end loop;
 end loop;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'private.work_followup_executions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'follow-up executions exposed to %',role_name; end if;
 end loop;
 raise notice 'PASS: the helpers and the follow-up execution table of 5C are closed to every API role';
end $$;

rollback;
select 'work_update_integration_passed' as result;
