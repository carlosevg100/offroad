-- Mixed execution/institutional update graph, readiness, and native-command denial.
-- Historical fixture results are not native adoption authority. One work
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


-- Exact prospective errors: these probes invoke the public commands as the API role.
create function pg_temp.expect_state(p_sql text,p_state text,p_message text,p_label text) returns void language plpgsql as $$
begin
 begin execute p_sql;
 exception when others then
  if sqlstate=p_state and sqlerrm=p_message then raise notice 'PASS: %',p_label;return;end if;
  raise exception '% unexpected contract error %',p_label,sqlstate;
 end;
 raise exception '% was accepted',p_label;
end $$;
-- A read-only snapshot of the target work's state; never creates authority or a receipt.
create function pg_temp.update_effects() returns jsonb language sql as $$
 select jsonb_build_object(
  'updates',(select coalesce(jsonb_agg(to_jsonb(x)order by x.id),'[]')from public.work_continuation_requests x where x.organization_id='a11b0000-0000-4000-9000-000000000001'),
  'milestones',(select coalesce(jsonb_agg(to_jsonb(x)order by x.id),'[]')from public.work_milestones x where x.organization_id='a11b0000-0000-4000-9000-000000000001'),
  'jobs',(select coalesce(jsonb_agg(to_jsonb(x)order by x.id),'[]')from public.processing_jobs x where x.organization_id='a11b0000-0000-4000-9000-000000000001'),
  'decisions',(select coalesce(jsonb_agg(to_jsonb(x)order by x.id),'[]')from public.work_decisions x where x.organization_id='a11b0000-0000-4000-9000-000000000001'),
  'captures',(select coalesce(jsonb_agg(to_jsonb(x)order by x.id),'[]')from private.work_update_review_captures x where x.organization_id='a11b0000-0000-4000-9000-000000000001'),
  'executionCandidates',(select coalesce(jsonb_agg(to_jsonb(x)order by x.id),'[]')from public.work_recompute_candidates x where x.organization_id='a11b0000-0000-4000-9000-000000000001'),
  'institutionalCandidates',(select coalesce(jsonb_agg(to_jsonb(x)order by x.id),'[]')from public.institutional_recompute_candidates x where x.organization_id='a11b0000-0000-4000-9000-000000000001'),
  'basisReceipts',(select coalesce(jsonb_agg(to_jsonb(x)order by x.id),'[]')from private.review_basis_receipts x where x.organization_id='a11b0000-0000-4000-9000-000000000001'),
  'projections',(select coalesce(jsonb_agg(to_jsonb(x)order by x.id),'[]')from private.work_update_review_projections x where x.organization_id='a11b0000-0000-4000-9000-000000000001'),
  'institutionalResults',(select coalesce(jsonb_agg(to_jsonb(x)order by x.id),'[]')from private.institutional_model_results x where x.organization_id='a11b0000-0000-4000-9000-000000000001'));
$$;
create temporary table update_effect_before(value jsonb);

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

-- 2. S2 reaches both dependent families: the execution is recomputed and settled by its
-- actual public execution commands, while the historical institutional result remains behind
-- a configuration hold. Neither an old fixture result nor v1 creates native adoption authority.
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

-- Native-regime rows cannot be adopted by the retired v1 command, regardless of readiness.
select set_config('test.native.update',pg_temp.id('Q')::text,true);
select set_config('test.native.revision',(select revision::text from public.work_continuation_requests where id=pg_temp.id('Q')),true);
truncate update_effect_before;
insert into update_effect_before select pg_temp.update_effects();
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.expect_state(format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),current_setting('test.native.update'),current_setting('test.native.revision')),
 '42501','work_update_native_command_required','owner cannot adopt a not-ready native-regime update through v1');
select pg_temp.expect_state(format('select public.read_work_update_adoption_basis_v2(%L)',current_setting('test.native.update')),
 '55000','work_update_not_ready','v2 does not capture a basis before the update is ready');
select pg_temp.expect_state(format('select public.adopt_work_update_v2(%L,%L,%L,%L,false)',gen_random_uuid(),current_setting('test.native.update'),current_setting('test.native.revision'),repeat('0',64)),
 '55000','work_update_not_ready','v2 cannot adopt or approve a not-ready update');
reset role;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.expect_state(format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),current_setting('test.native.update'),current_setting('test.native.revision')),
 '42501','work_update_native_command_required','retired v1 is closed even for a member without work access');
select pg_temp.expect_state(format('select public.read_work_update_adoption_basis_v2(%L)',current_setting('test.native.update')),
 '42501','work_update_review_denied','v2 basis is denied to a member without work access');
select pg_temp.expect_state(format('select public.adopt_work_update_v2(%L,%L,%L,%L,false)',gen_random_uuid(),current_setting('test.native.update'),current_setting('test.native.revision'),repeat('0',64)),
 '42501','work_update_review_denied','v2 adoption is denied to a member without work access');
reset role;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
do $$begin
 if (select value from update_effect_before) is distinct from pg_temp.update_effects() then raise exception 'a refused native adoption changed work state';end if;
 raise notice 'PASS: denied native adoption and basis calls have no effects';
end $$;
insert into auth.users(id,email)values('a5c00000-0000-4000-8000-000000000008','foreign-integration-negative@example.invalid');
insert into public.organizations(id,organization_type,name,created_by)values('a4183000-0000-4000-9000-000000000008','originator','Synthetic foreign integration boundary','a5c00000-0000-4000-8000-000000000008');
insert into public.organization_memberships(organization_id,user_id,role,status)values('a4183000-0000-4000-9000-000000000008','a5c00000-0000-4000-8000-000000000008','owner','active');
truncate update_effect_before;insert into update_effect_before select pg_temp.update_effects();
select pg_temp.act_as('a5c00000-0000-4000-8000-000000000008');
select set_config('request.headers','{"x-offroad-workspace":"a4183000-0000-4000-9000-000000000008"}',true);
set local role authenticated;
select pg_temp.expect_state(format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),current_setting('test.native.update'),current_setting('test.native.revision')),
 '42501','work_update_native_command_required','retired v1 cannot adopt another tenant mixed update');
select pg_temp.expect_state(format('select public.read_work_update_adoption_basis_v2(%L)',current_setting('test.native.update')),
 '42501','work_update_review_denied','v2 denies the foreign tenant mixed-update basis');
reset role;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select set_config('request.headers','{"x-offroad-workspace":"a11b0000-0000-4000-9000-000000000001"}',true);
do $$begin
 if (select value from update_effect_before)is distinct from pg_temp.update_effects()then raise exception 'a foreign denied adoption changed mixed update state';end if;
 raise notice 'PASS: foreign tenant commands have no effects on the mixed update';
end $$;
-- No synthetic institutional recomputation is promoted to native approval. Current v2 positives
-- use real native bindings in the assessment SQL/SDK suites, rather than this historical fixture.

do $$ declare f text;body text;begin
 -- The prospective command and the actual delegated legacy primitives retain the
 -- lock contract. Public v1 wrappers now deny native candidates before delegation.
 foreach f in array array['private.review_institutional_configuration_and_calculate_v2(uuid,uuid,text,text,text,text,uuid,text,boolean)',
  'private.apply_institutional_configuration_calculation_before_projection_v1(uuid,uuid,text,text,text,uuid,text)',
  'private.apply_institutional_configuration_review_before_projection_v1(uuid,uuid,text,text,text)','private.review_institutional_configuration_before_sources_v1(uuid,uuid,text,text,text)'] loop
  body:=pg_get_functiondef(f::regprocedure);
  if body !~ 'id=p_project_id[^;]*for no key update;' or body ~ 'id=p_project_id[^;]*for update;' then
   raise exception '% does not take the project row for no key update',f;
  end if;
 end loop;
 raise notice 'PASS: the approve-and-calculate command and the reviews it runs take the project row for no key update, as the continuation commands do';
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
