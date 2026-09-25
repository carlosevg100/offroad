-- Stage 18, increment 4: continuation from an explicit base, adoption, authorization and decline of
-- dependency updates, and the read of a work's updates. Synthetic rows only; everything rolls back.
begin;
\ir support/contextual_adoption_setup.sql
\ir support/execution_method_fixture.sql
\ir support/execution_approval.sql

-- Organization a11b...9000-1, owner a11b...8000-1, plain member a11b...8000-2 (no access to the work),
-- work W1 a11b...9000-2 with intake session a11b...9000-3, and a standalone work W2 created below
-- without an intake session. A separate worker account drains the outbox and produces recomputations.
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

-- One immutable version of a logical source, with verified bytes (a null logical id starts a source).
create function pg_temp.source_version(p_name text,p_logical uuid) returns uuid language plpgsql as $$
declare v uuid:=md5('dependency-source:'||p_name)::uuid;hash text:=encode(extensions.digest(p_name,'sha256'),'hex');
begin
 insert into public.source_documents(id,organization_id,intake_session_id,logical_source_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status)
 values(v,'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',p_logical,
  'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/'||p_name||'.txt','Synthetic source '||p_name,'text/plain',1,hash,'a11b0000-0000-4000-8000-000000000001','ready');
 insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
 values('a11b0000-0000-4000-9000-000000000001',v,gen_random_uuid(),hash,1,'synthetic-only-'||p_name);
 insert into dep values(p_name,v);
 return v;
end $$;
-- Derives a named version from another, as the derivation writer records it.
create function pg_temp.derive(p_derived text,p_parent text) returns void language sql as $$
 insert into private.resource_dependencies(organization_id,derived_version_id,source_version_id,source_rights_version_id,created_by)
 select r.organization_id,pg_temp.id(p_derived),r.source_version_id,r.id,'a11b0000-0000-4000-8000-000000000001'
 from private.source_rights_versions r where r.source_version_id=pg_temp.id(p_parent) and r.revision=1;
$$;

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

-- The worker's recompute, as increment 3B's test produces it: claim, the requester's basis, the
-- contract of the synthetic method pinning the named sources, and the submission.
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
create function pg_temp.produce(p_sources text[]) returns jsonb language plpgsql as $$
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
  'inputs',jsonb_build_object('snapshotId',gen_random_uuid(),'fingerprint',encode(extensions.digest('{}','sha256'),'hex'),
   'sources',coalesce((select jsonb_agg(jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId',v.id,'contentHash',v.declared_sha256,
     'rightsRevision','1') order by v.id) from public.source_versions v join dep d on d.id=v.id where d.name=any(p_sources)),'[]'::jsonb),
   'adoptions',x->'adoptions','hypotheses',x->'hypotheses'),
  'budget',jsonb_build_object('maxCostMicrousd',0,'maxModelCalls',0,'maxDurationMs',31000,'expiresAt',clock_timestamp()+interval '1 hour'),'requestedAt',clock_timestamp())
 into k from (select b->'basis' as x) f;
 return pg_temp.as_worker(format('select public.worker_submit_dependency_recompute_v1(''synthetic-dependency-outbox-token'',%s,%L,''{}'',%L)',pg_temp.lease_args(c),k::text,
  private.execution_gates_canonical_text_v1(jsonb_build_object('schemaVersion','execution-gates.v1','gatesVersion','2026.09.24-v1','blocked',false,
   'companyRegistration',b#>>'{basis,company,registration}','research',b#>>'{basis,company,research}',
   'methodSelection',jsonb_build_object('selectionVersion','2026.09.24-v1','situationIds',jsonb_build_array('refinancing'),
    'methodId',b#>>'{basis,profile,method,methodId}','methodVersion',b#>>'{basis,profile,method,methodVersion}'),
   'conventions','[]'::jsonb,'voice',jsonb_build_object('version','2026.09.24-v1','blockCount',0,'warnCount',0)))));
end $$;
-- The worker path commits a produced execution's result.
create function pg_temp.commit_result(p_execution uuid) returns void language plpgsql as $$
declare job uuid;claim jsonb;begin
 select id into strict job from public.processing_jobs where execution_id=p_execution;
 claim:=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',job,60);
 perform private.reserve_execution_operation_v1(job,claim->>'capability',(claim->>'leaseId')::uuid,p_execution,claim->>'contractFingerprint','synthetic#calculate','test-v1','read_only',0,0);
 perform private.settle_execution_operation_v2(job,claim->>'capability',(claim->>'leaseId')::uuid,p_execution,claim->>'contractFingerprint',
  '{"calculation":"synthetic continuation"}','succeeded','calculated',0,0);
 perform private.commit_work_execution_result_v1(job,claim->>'capability',(claim->>'leaseId')::uuid,claim->>'contractFingerprint',
  encode(extensions.digest('{}','sha256'),'hex'),'{"calculation":"synthetic continuation"}','succeeded','calculated');
end $$;
create function pg_temp.candidate(p_execution text,p_state text) returns public.work_recompute_candidates language plpgsql as $$
declare c public.work_recompute_candidates;begin
 select * into strict c from public.work_recompute_candidates x where pg_temp.id(p_execution)=any(x.execution_ids) and x.state=p_state;
 return c;
end $$;
-- The open or moving dependency-update request of W1.
create function pg_temp.update_request() returns public.work_continuation_requests language plpgsql as $$
declare r public.work_continuation_requests;begin
 select * into strict r from public.work_continuation_requests x where x.work_id='a11b0000-0000-4000-9000-000000000002' and x.kind='dependency_update'
  and x.status in ('open','awaiting_authorization','scheduled','ready');
 return r;
end $$;
-- The result milestone of a named execution.
create function pg_temp.result_of(p_execution text) returns uuid language sql as $$
 select id from public.work_milestones where kind='execution_result' and subject_kind='work_execution' and subject_id=pg_temp.id(p_execution);
$$;
-- A continuation from a base milestone, with its decision and revision as recorded (a milestone
-- without a revision is named at revision 1, so that only its kind decides the refusal).
create function pg_temp.continue_from(p_request uuid,p_work uuid,p_text text,p_base uuid) returns jsonb language sql as $$
 select public.request_work_continuation_v1(p_request,p_work,'pt-BR',p_text,m.id,m.subject_id,coalesce(m.revision,1)) from public.work_milestones m where m.id=p_base;
$$;
-- The history that no command may rewrite: every result, decision and adoption milestone and every
-- result receipt, row image and row version.
create temporary table untouched(kind text,id uuid,row_version text,row_image jsonb);
create function pg_temp.remember_history() returns void language sql as $$
 insert into untouched select 'milestone',m.id,m.xmin::text,to_jsonb(m) from public.work_milestones m
  where m.kind in ('execution_result','decision','update_adopted','human_resolved','awaiting_human','continuation_proposed')
  and not exists(select 1 from untouched u where u.id=m.id);
 insert into untouched select 'receipt',r.id,r.xmin::text,to_jsonb(r) from private.execution_result_receipts r where not exists(select 1 from untouched u where u.id=r.id);
$$;
create function pg_temp.history_intact() returns boolean language sql as $$
 select not exists(select 1 from untouched u left join public.work_milestones m on m.id=u.id where u.kind='milestone' and (m.id is null or m.xmin::text<>u.row_version or to_jsonb(m)<>u.row_image))
  and not exists(select 1 from untouched u left join private.execution_result_receipts r on r.id=u.id where u.kind='receipt' and (r.id is null or r.xmin::text<>u.row_version or to_jsonb(r)<>u.row_image));
$$;

-- 0. Setup: the executions of increment 3B's test, an accepted execution brief (a decision milestone of
-- W1), the worker producing recomputations, and a standalone work W2 without an intake session.
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb);
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb||jsonb_build_object('requestId','a4183000-0000-4000-9000-0000000000a2',
 'expectedVersionId','a9990000-0000-4000-9000-000000000003','observationId',current_setting('test.adoption.budget')));
insert into dep values('V1','a9990000-0000-4000-9000-000000000003'),('V2','a4183000-0000-4000-9000-0000000000a2');
insert into dep select 'dA1',decision_id from private.assumption_version_items where version_id=pg_temp.id('V1');
insert into dep select 'dB1',i.decision_id from private.assumption_version_items i where i.version_id=pg_temp.id('V2') and i.decision_id<>pg_temp.id('dA1');
select pg_temp.source_version('S1',null);
select pg_temp.source_version('T1',null);
select pg_temp.source_version('D1',null);
select pg_temp.derive('D1','S1');
insert into dep select 'S',source_id from public.source_versions where id=pg_temp.id('S1');
insert into dep select 'D',source_id from public.source_versions where id=pg_temp.id('D1');
select pg_temp.request_execution('X1','a4171000-0000-4000-9000-000000000001',array['S1'],array[pg_temp.id('dA1')],pg_temp.id('V2'));
select pg_temp.request_execution('X2','a4171000-0000-4000-9000-000000000001',array['D1'],array[pg_temp.id('dB1')],pg_temp.id('V2'));
select pg_temp.request_execution('X3','a4171000-0000-4000-9000-000000000001',array['T1'],array[]::uuid[],null);
select pg_temp.commit_result(pg_temp.id('X1'));
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values('a4183000-0000-4000-9000-0000000000d1','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',31,'manual','queued','approval-fixture-v1','a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values('a4183000-0000-4000-9000-0000000000d2','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a4183000-0000-4000-9000-0000000000d1','case_analysis','queued','{"analysis_scope":"full_case"}');
select pg_temp.fixture_approve_execution('a4183000-0000-4000-9000-0000000000d2');
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
insert into dep select 'BRIEF',id from public.work_milestones where work_id='a11b0000-0000-4000-9000-000000000002' and kind='decision' and subject_kind='execution_brief';
select pg_temp.drain_outbox();
update private.worker_tokens set execution_account_user_id='a4183000-0000-4000-8000-000000000009' where id='a4183000-0000-4000-9000-0000000000f0';
insert into private.platform_principals(user_id,role,label) values('a11b0000-0000-4000-8000-000000000001','founder','Synthetic founder');
select private.grant_execution_producer_v1('a4183100-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001',true,
 'Synthetic producer grant for the continuation proof','a11b0000-0000-4000-8000-000000000001');
-- W2: a standalone work, started without an intake session and without a queued turn.
select set_config('test.w2',(public.start_work_v1('a4190000-0000-4000-8000-000000000020','pt-BR','Synthetic standalone capital decision',
 'Synthetic question about the capital structure','capital_planning','public_information',null,null,false)->>'workId'),true);
insert into dep values('W1','a11b0000-0000-4000-9000-000000000002'),('W2',current_setting('test.w2')::uuid);
-- Approvals recorded in W2, written as the projection of increment 2 writes them (a series of two
-- approved revisions, the second superseding the first) and a rejected decision. They stand for any
-- approval a person made in a work without intake; synthetic rows, labelled as such.
insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,version_fingerprint,created_by,occurred_at)
values('a4190000-0000-4000-9000-0000000000d1','a11b0000-0000-4000-9000-000000000001',pg_temp.id('W2'),'decision','capital_project_artifact','a4190000-0000-4000-9000-0000000000a1',
  'Alongamento com os bancos atuais',1,repeat('1',64),'a11b0000-0000-4000-8000-000000000001',clock_timestamp()-interval '3 hours');
insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,version_fingerprint,supersedes_milestone_id,created_by,occurred_at)
values('a4190000-0000-4000-9000-0000000000d2','a11b0000-0000-4000-9000-000000000001',pg_temp.id('W2'),'decision','capital_project_artifact','a4190000-0000-4000-9000-0000000000a2',
  'Alongamento com os bancos atuais',2,repeat('2',64),'a4190000-0000-4000-9000-0000000000d1','a11b0000-0000-4000-8000-000000000001',clock_timestamp()-interval '2 hours');
insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at)
values('a4190000-0000-4000-9000-0000000000d3','a11b0000-0000-4000-9000-000000000001',pg_temp.id('W2'),'decision','capital_project_artifact','a4190000-0000-4000-9000-0000000000a3',
  'Emissão de debêntures',1,'rejected','a11b0000-0000-4000-8000-000000000001',clock_timestamp()-interval '1 hour');
insert into dep values('W2_D1','a4190000-0000-4000-9000-0000000000d1'),('W2_D2','a4190000-0000-4000-9000-0000000000d2'),('W2_R','a4190000-0000-4000-9000-0000000000d3');
select pg_temp.remember_history();
savepoint stage18_4_ready;

-- 1. The log and the bases the conversation reads: every reference points to an earlier milestone of
-- the same work, the approved decision of W1 is its only base, W2's superseded and rejected
-- decisions are not bases, and a member without access to the work reads nothing.
do $$ declare v jsonb;w2 jsonb;begin
 v:=public.work_update_view_v1(pg_temp.id('W1'));
 if v->>'schemaVersion'<>'work-update-view.v1' or v->>'workId'<>pg_temp.id('W1')::text or v->>'conversationId'<>'a11b0000-0000-4000-9000-000000000006'
 or v->'bases'<>jsonb_build_array((select jsonb_build_object('milestoneId',m.id,'decisionId',m.subject_id,'revision',m.revision,'label',m.label,'kind','decision')
  from public.work_milestones m where m.id=pg_temp.id('BRIEF')))
 or jsonb_array_length(v->'milestones')<>(select count(*) from public.work_milestones where work_id=pg_temp.id('W1'))
 or v->'updates'<>'[]'::jsonb or v->'followups'<>'[]'::jsonb then
  raise exception 'view of W1 mismatch: %',v;
 end if;
 w2:=public.work_update_view_v1(pg_temp.id('W2'));
 if (select jsonb_agg(b->>'milestoneId') from jsonb_array_elements(w2->'bases') b)<>jsonb_build_array(pg_temp.id('W2_D2'))
 or w2->>'conversationId'<>(select id::text from public.agent_conversations where work_id=pg_temp.id('W2') and intake_session_id is null) then
  raise exception 'bases of W2 mismatch: %',w2;
 end if;
 if exists(select 1 from jsonb_array_elements(w2->'milestones') m cross join jsonb_array_elements_text(m->'references') r
  where not exists(select 1 from jsonb_array_elements(w2->'milestones') t where t->>'milestoneId'=r and (t->>'sequence')::integer<(m->>'sequence')::integer)) then
  raise exception 'a reference does not point to an earlier milestone: %',w2->'milestones';
 end if;
 raise notice 'PASS: the log numbers every milestone after what it references; a superseded or rejected decision is not a base';
end $$;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
select pg_temp.expect_error(format('select public.work_update_view_v1(%L)',pg_temp.id('W1')),'work_continuation_access_denied','the read of a work is refused to a member without access to it');
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');

-- 2. A continuation in W1, a work with a document intake session: the user turn goes to the intake
-- conversation (as append_work_turn_v1 routes it), and the request and its continuation_proposed
-- milestone reference the base. Nothing is enqueued.
select set_config('test.jobs',(select count(*) from public.processing_jobs)::text,true),
 set_config('test.conversation.state',(select state from public.agent_conversations where id='a11b0000-0000-4000-9000-000000000006'),true);
select pg_temp.remember('w1',pg_temp.continue_from('a4190000-0000-4000-8000-000000000101',pg_temp.id('W1'),'  Aprofundar o plano aprovado  ',pg_temp.id('BRIEF')));
do $$ declare s jsonb:=(select value from recompute_step where name='w1');r public.work_continuation_requests;m public.agent_messages;p public.work_milestones;base public.work_milestones;expected jsonb;begin
 select * into strict base from public.work_milestones where id=pg_temp.id('BRIEF');
 select * into strict r from public.work_continuation_requests where id='a4190000-0000-4000-8000-000000000101';
 select * into strict m from public.agent_messages where id='a4190000-0000-4000-8000-000000000101';
 select * into strict p from public.work_milestones where kind='continuation_proposed' and subject_id=r.id;
 expected:=jsonb_build_object('schemaVersion','work-followup-request.v1','workId',pg_temp.id('W1'),'conversationId','a11b0000-0000-4000-9000-000000000006',
  'objective',jsonb_build_object('request','Aprofundar o plano aprovado','baseMilestoneId',base.id,'baseDecisionId',base.subject_id,'baseRevision',base.revision));
 if r.kind<>'user_followup' or r.status<>'open' or r.revision<>1 or r.created_by<>'a11b0000-0000-4000-8000-000000000001' or r.payload<>expected
 or r.payload_fingerprint<>private.continuation_fingerprint_v1(expected) or r.affected_executions<>'[]'::jsonb or r.decline_reason is not null then
  raise exception 'follow-up request mismatch: %',to_jsonb(r);
 end if;
 if m.conversation_id<>'a11b0000-0000-4000-9000-000000000006' or m.intake_session_id<>'a11b0000-0000-4000-9000-000000000003' or m.work_id<>pg_temp.id('W1')
 or m.role<>'user' or m.status<>'completed' or m.content<>'Aprofundar o plano aprovado' or m.human_author_id<>'a11b0000-0000-4000-8000-000000000001'
 or m.metadata->>'kind'<>'work_continuation' or m.metadata->>'requestId'<>r.id::text or m.metadata#>>'{base,milestoneId}'<>base.id::text then
  raise exception 'user turn mismatch: %',to_jsonb(m);
 end if;
 if p.work_id<>r.work_id or p.subject_kind<>'work_continuation_request' or p.label<>'Aprofundar o plano aprovado' or p.created_by<>'a11b0000-0000-4000-8000-000000000001'
 or p.reference_milestone_ids<>array[base.id] or p.outcome is not null or p.revision is not null then
  raise exception 'continuation_proposed milestone mismatch: %',to_jsonb(p);
 end if;
 if (s->>'replayed')::boolean or s->>'milestoneId'<>p.id::text or s#>>'{base,milestoneId}'<>base.id::text or s->>'conversationId'<>'a11b0000-0000-4000-9000-000000000006'
 or (select count(*) from public.processing_jobs)<>current_setting('test.jobs')::bigint
 or (select state from public.agent_conversations where id='a11b0000-0000-4000-9000-000000000006')<>current_setting('test.conversation.state') then
  raise exception 'continuation result or queue mismatch: %',s;
 end if;
 insert into dep values('F1',r.id),('F1_P',p.id);
 raise notice 'PASS: a continuation in a work with intake records the user turn in the intake conversation, the user_followup request and its milestone referencing the base; nothing is enqueued';
end $$;
-- Replay and conflicting replay.
do $$ declare again jsonb;begin
 again:=pg_temp.continue_from('a4190000-0000-4000-8000-000000000101',pg_temp.id('W1'),'Aprofundar o plano aprovado',pg_temp.id('BRIEF'));
 if not (again->>'replayed')::boolean or again->>'requestId'<>pg_temp.id('F1')::text or again->>'milestoneId'<>pg_temp.id('F1_P')::text
 or (select count(*) from public.work_continuation_requests where kind='user_followup')<>1
 or (select count(*) from public.work_milestones where kind='continuation_proposed')<>1
 or (select count(*) from public.agent_messages where id='a4190000-0000-4000-8000-000000000101')<>1 then
  raise exception 'replay recorded again: %',again;
 end if;
 raise notice 'PASS: the same continuation again returns what was recorded and records nothing';
end $$;
select pg_temp.expect_error(format('select pg_temp.continue_from(%L,%L,%L,%L)','a4190000-0000-4000-8000-000000000101',pg_temp.id('W1'),'Aprofundar outra coisa',pg_temp.id('BRIEF')),
 'work_continuation_replay_conflict','the same request id with another text is refused');
select pg_temp.expect_error(format('select public.request_work_continuation_v1(%L,%L,%L,%L,%L,%L,%L)','a4190000-0000-4000-8000-000000000101',pg_temp.id('W1'),'pt-BR',
 'Aprofundar o plano aprovado',pg_temp.id('BRIEF'),(select subject_id from public.work_milestones where id=pg_temp.id('BRIEF')),9),
 'work_continuation_replay_conflict','the same request id with another base revision is refused');
select pg_temp.expect_error(format('select pg_temp.continue_from(%L,%L,%L,%L)','a11b0000-0000-4000-9000-000000000007',pg_temp.id('W1'),'Aprofundar o plano aprovado',pg_temp.id('BRIEF')),
 'work_continuation_replay_conflict','a request id already used by another message is refused');
-- The base must be an approved decision or adoption of this work, named exactly.
select pg_temp.expect_error(format('select pg_temp.continue_from(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('W1'),'Aprofundar o resultado',pg_temp.result_of('X1')),
 'work_continuation_base_not_approved','a result is not an approved base');
select pg_temp.expect_error(format('select pg_temp.continue_from(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('W1'),'Aprofundar a continuação',pg_temp.id('F1_P')),
 'work_continuation_base_not_approved','a proposed continuation is not an approved base');
select pg_temp.expect_error(format('select pg_temp.continue_from(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('W1'),'Aprofundar o alongamento',pg_temp.id('W2_D2')),
 'work_continuation_base_not_found','an approved decision of another work is not a base of this one');
select pg_temp.expect_error(format('select public.request_work_continuation_v1(%L,%L,%L,%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('W1'),'pt-BR','Aprofundar o plano',
 pg_temp.id('BRIEF'),gen_random_uuid(),(select revision from public.work_milestones where id=pg_temp.id('BRIEF'))),
 'work_continuation_base_mismatch','a base named with another decision is refused');
select pg_temp.expect_error(format('select public.request_work_continuation_v1(%L,%L,%L,%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('W1'),'pt-BR','Aprofundar o plano',
 pg_temp.id('BRIEF'),(select subject_id from public.work_milestones where id=pg_temp.id('BRIEF')),(select revision+1 from public.work_milestones where id=pg_temp.id('BRIEF'))),
 'work_continuation_base_mismatch','a base named with another revision is refused');
select pg_temp.expect_error(format('select public.request_work_continuation_v1(%L,%L,%L,%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('W1'),'pt-BR','   ',
 pg_temp.id('BRIEF'),(select subject_id from public.work_milestones where id=pg_temp.id('BRIEF')),1),
 'invalid_work_continuation','a blank follow-up is refused');

-- 3. A continuation in W2, a work without any intake session: the turn goes to the work's own
-- conversation. The superseded approval and the rejected decision are refused as bases.
select pg_temp.remember('w2',pg_temp.continue_from('a4190000-0000-4000-8000-000000000102',pg_temp.id('W2'),'Aprofundar o alongamento aprovado',pg_temp.id('W2_D2')));
do $$ declare r public.work_continuation_requests;m public.agent_messages;begin
 select * into strict r from public.work_continuation_requests where id='a4190000-0000-4000-8000-000000000102';
 select * into strict m from public.agent_messages where id=r.id;
 if r.work_id<>pg_temp.id('W2') or r.kind<>'user_followup' or r.payload#>>'{objective,baseMilestoneId}'<>pg_temp.id('W2_D2')::text
 or r.payload#>>'{objective,baseDecisionId}'<>'a4190000-0000-4000-9000-0000000000a2' or r.payload#>>'{objective,baseRevision}'<>'2'
 or m.intake_session_id is not null or m.work_id<>pg_temp.id('W2')
 or m.conversation_id<>(select id from public.agent_conversations where work_id=pg_temp.id('W2') and intake_session_id is null)
 or exists(select 1 from public.document_intake_sessions where capital_project_id=pg_temp.id('W2'))
 or not exists(select 1 from public.work_milestones where kind='continuation_proposed' and subject_id=r.id and reference_milestone_ids=array[pg_temp.id('W2_D2')]) then
  raise exception 'continuation without intake mismatch: % %',to_jsonb(r),to_jsonb(m);
 end if;
 raise notice 'PASS: a continuation in a work without an intake session records the turn in the work''s own conversation, with no intake created';
end $$;
select pg_temp.expect_error(format('select pg_temp.continue_from(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('W2'),'Aprofundar o alongamento',pg_temp.id('W2_D1')),
 'work_continuation_base_superseded','an approval a later approval of the same series replaced is refused');
select pg_temp.expect_error(format('select pg_temp.continue_from(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('W2'),'Aprofundar as debêntures',pg_temp.id('W2_R')),
 'work_continuation_base_not_approved','a rejected decision is refused as a base');
select pg_temp.expect_error(format('select pg_temp.continue_from(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('W2'),'Aprofundar o plano',pg_temp.id('BRIEF')),
 'work_continuation_base_not_found','the approval of another work is refused as a base');
-- A turn still in progress in the conversation holds the continuation, as it holds any turn.
select public.append_work_turn_v1(pg_temp.id('W2'),'a4190000-0000-4000-8000-000000000103','pt-BR','Synthetic ordinary turn');
select pg_temp.expect_error(format('select pg_temp.continue_from(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('W2'),'Aprofundar o alongamento aprovado',pg_temp.id('W2_D2')),
 'advisor_message_in_progress','a continuation waits for the turn in progress');

-- 4. A ready update, then its adoption. S2 moves X1 (bound to S1) and, through D, X2; D is re-derived;
-- the worker produces both candidates; their results settle them and the update becomes ready.
rollback to savepoint stage18_4_ready;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select pg_temp.source_version('S2',pg_temp.id('S'));
select pg_temp.drain_outbox();
insert into dep select 'R1',(pg_temp.update_request()).id;
select pg_temp.remember('x1',pg_temp.produce(array['S2']));
insert into dep select 'X1b',(value->>'executionId')::uuid from recompute_step where name='x1';
select pg_temp.source_version('D2',pg_temp.id('D'));
select pg_temp.derive('D2','S2');
select pg_temp.drain_outbox();
select pg_temp.remember('x2',pg_temp.produce(array['D2']));
insert into dep select 'X2b',(value->>'executionId')::uuid from recompute_step where name='x2';
-- Not ready yet: adoption is refused while the update is scheduled.
select pg_temp.expect_error(format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),pg_temp.id('R1'),(pg_temp.update_request()).revision),
 'work_update_not_ready','adoption is refused before the update is ready');
select pg_temp.commit_result(pg_temp.id('X1b'));
select pg_temp.commit_result(pg_temp.id('X2b'));
select pg_temp.remember_history();
do $$ declare r public.work_continuation_requests;v jsonb;u jsonb;x1 jsonb;x2 jsonb;begin
 r:=pg_temp.update_request();
 if r.id<>pg_temp.id('R1') or r.status<>'ready' then raise exception 'setup: the update is not ready: %',to_jsonb(r); end if;
 -- The read of the update: what changed and why, what was recomputed with its lineage, what stayed valid.
 v:=public.work_update_view_v1(pg_temp.id('W1'));
 select x into u from jsonb_array_elements(v->'updates') x where x->>'requestId'=r.id::text;
 select x into x1 from jsonb_array_elements(u->'affected') x where x->>'executionId'=pg_temp.id('X1')::text;
 select x into x2 from jsonb_array_elements(u->'affected') x where x->>'executionId'=pg_temp.id('X2')::text;
 if u->>'status'<>'ready' or (u->>'revision')::integer<>r.revision or u->>'proposalMilestoneId' is null or u->'decision'<>'null'::jsonb
 or x1->>'resultMilestoneId'<>pg_temp.result_of('X1')::text or x1->>'label'<>'Synthetic deterministic execution proof'
 -- The method is named by its catalogue id, for the web to turn into a display name; no house release here.
 or x1#>>'{method,methodId}' is distinct from (select m.payload#>>'{method,methodId}' from private.execution_manifests m where m.execution_id=pg_temp.id('X1'))
 or x1#>>'{method,methodId}' is null or not (x1->'method' ? 'houseTitle') or x1#>'{method,houseTitle}'<>'null'::jsonb
 or not exists(select 1 from jsonb_array_elements(u->'candidates') k where k->>'baseExecutionId'=pg_temp.id('X1')::text and k->'baseMethod'=x1->'method')
 or not exists(select 1 from jsonb_array_elements(u->'unaffected') x where x#>>'{method,methodId}' is not null)
 or exists(select 1 from jsonb_array_elements(x1->'changes') ch where ch->>'dependencyKind'='source_version' and (ch->'premise'<>'null'::jsonb or ch->'method'<>'null'::jsonb))
 or not exists(select 1 from jsonb_array_elements(x1->'changes') ch where ch->>'dependencyKind'='source_version' and ch->>'reasonClass'='data_change'
  and ch#>>'{pinned,versionNo}'='1' and ch#>>'{head,versionNo}'='2' and ch->>'name'='Synthetic source S2')
 or not exists(select 1 from jsonb_array_elements(x2->'holds') h where h->>'kind'='derived_source_not_rederived' and h->>'signal'='source_version:'||pg_temp.id('D')::text
  and h->>'releasedAt' is not null)
 or (select count(*) from jsonb_array_elements(u->'candidates') k where k->>'state'='settled' and k->>'resultMilestoneId' is not null)<>2
 or not exists(select 1 from jsonb_array_elements(u->'candidates') k where k->>'executionId'=pg_temp.id('X1b')::text and k->>'baseExecutionId'=pg_temp.id('X1')::text
  and k->>'resultMilestoneId'=pg_temp.result_of('X1b')::text)
 or (select jsonb_agg(x->>'executionId') from jsonb_array_elements(u->'unaffected') x)<>jsonb_build_array(pg_temp.id('X3')) then
  raise exception 'view of a ready update mismatch: %',u;
 end if;
 raise notice 'PASS: the read of an update shows each affected execution with the facts that invalidated it, its candidate and holds, the recomputed results with their lineage, and what stayed valid';
end $$;
select pg_temp.expect_error(format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),pg_temp.id('R1'),(pg_temp.update_request()).revision-1),
 'work_update_changed','adoption at another revision is refused');
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
select pg_temp.expect_error(format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),pg_temp.id('R1'),(pg_temp.update_request()).revision),
 'work_continuation_access_denied','adoption by a member without access to the work is refused');
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select pg_temp.remember('adopt',public.adopt_work_update_v1('a4190000-0000-4000-8000-000000000201',pg_temp.id('R1'),(pg_temp.update_request()).revision));
do $$ declare s jsonb:=(select value from recompute_step where name='adopt');r public.work_continuation_requests;m public.work_milestones;begin
 select * into strict r from public.work_continuation_requests where id=pg_temp.id('R1');
 select * into strict m from public.work_milestones where kind='update_adopted' and subject_id=r.id;
 if r.status<>'adopted' or m.id<>private.work_command_milestone_id_v1(r.organization_id,'a4190000-0000-4000-8000-000000000201') or m.outcome<>'approved'
 or m.revision<>r.revision-1 or m.created_by<>'a11b0000-0000-4000-8000-000000000001' or m.subject_kind<>'work_continuation_request' or m.label<>'dependency_update_adopted'
 -- The new results first (in the order of their candidates), then the results they replace.
 or (select array_agg(x order by x) from unnest(m.reference_milestone_ids[1:2]) x)<>(select array_agg(x order by x) from unnest(array[pg_temp.result_of('X1b'),pg_temp.result_of('X2b')]) x)
 or m.reference_milestone_ids[3:]<>array[pg_temp.result_of('X1')] or s->'references'<>to_jsonb(m.reference_milestone_ids)
 or (s->>'replayed')::boolean or s->>'milestoneId'<>m.id::text or s->>'status'<>'adopted' then
  raise exception 'adoption mismatch: % %',to_jsonb(m),s;
 end if;
 if exists(select 1 from public.work_recompute_candidates where request_id=r.id and state<>'settled') or not pg_temp.history_intact() then
  raise exception 'adoption rewrote a candidate, a result or a decision';
 end if;
 insert into dep values('U1',m.id);
 raise notice 'PASS: adoption of a ready update at its revision records update_adopted (approved, on that revision) referencing the new results and the results they replace; nothing earlier changes';
end $$;
do $$ declare again jsonb;begin
 again:=public.adopt_work_update_v1('a4190000-0000-4000-8000-000000000201',pg_temp.id('R1'),(select revision-1 from public.work_continuation_requests where id=pg_temp.id('R1')));
 if not (again->>'replayed')::boolean or again->>'milestoneId'<>pg_temp.id('U1')::text or (select count(*) from public.work_milestones where kind='update_adopted')<>1 then
  raise exception 'adoption replay recorded again: %',again;
 end if;
 raise notice 'PASS: the same adoption again returns what was recorded';
end $$;
select pg_temp.expect_error(format('select public.adopt_work_update_v1(%L,%L,%L)','a4190000-0000-4000-8000-000000000201',pg_temp.id('R1'),
 (select revision from public.work_continuation_requests where id=pg_temp.id('R1'))),'work_update_command_conflict','the same adoption id at another revision is refused');
select pg_temp.expect_error(format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),pg_temp.id('R1'),(select revision from public.work_continuation_requests where id=pg_temp.id('R1'))),
 'work_update_not_ready','an adopted update is not adopted again');
select pg_temp.expect_error(format('select public.decline_work_update_v1(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('R1'),(select revision from public.work_continuation_requests where id=pg_temp.id('R1')),'not_needed'),
 'work_update_not_open','an adopted update cannot be declined');
-- The adoption is now a base, next to the brief approval, and a continuation from it is recorded.
do $$ declare b jsonb;s jsonb;begin
 b:=public.work_update_view_v1(pg_temp.id('W1'))->'bases';
 if (select jsonb_agg(x->>'milestoneId' order by x->>'milestoneId') from jsonb_array_elements(b) x)
  <>(select jsonb_agg(x order by x) from unnest(array[pg_temp.id('BRIEF')::text,pg_temp.id('U1')::text]) x) then
  raise exception 'bases after adoption mismatch: %',b;
 end if;
 s:=pg_temp.continue_from('a4190000-0000-4000-8000-000000000104',pg_temp.id('W1'),'Aprofundar a atualização adotada',pg_temp.id('U1'));
 if s#>>'{base,kind}'<>'update_adopted' or s#>>'{base,decisionId}'<>pg_temp.id('R1')::text then raise exception 'continuation from the adoption mismatch: %',s; end if;
 raise notice 'PASS: an adoption becomes an approved base and a continuation from it is recorded';
end $$;

-- 5. Decline while open: after S2 the update is open, holding X2 on D, with X1's candidate scheduled.
rollback to savepoint stage18_4_ready;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select pg_temp.source_version('S2',pg_temp.id('S'));
select pg_temp.drain_outbox();
do $$ declare r public.work_continuation_requests:=pg_temp.update_request();s jsonb;m public.work_milestones;begin
 if r.status<>'open' or not exists(select 1 from private.dependency_recompute_holds where request_id=r.id and released_at is null) then
  raise exception 'setup: the update is not open with a hold';
 end if;
 perform pg_temp.expect_error(format('select public.decline_work_update_v1(%L,%L,%L,%L)',gen_random_uuid(),r.id,r.revision,'bored'),
  'invalid_work_update_command','a reason outside the codes is refused');
 s:=public.decline_work_update_v1('a4190000-0000-4000-8000-000000000301',r.id,r.revision,'not_needed');
 select * into strict r from public.work_continuation_requests where id=r.id;
 select * into strict m from public.work_milestones where id=(s->>'milestoneId')::uuid;
 if r.status<>'declined' or r.decline_reason<>'person_declined:not_needed' or s->>'updateStatus'<>'declined' or (s->>'releasedHolds')::integer<>1
 or exists(select 1 from public.work_recompute_candidates where request_id=r.id and not (state='declined' and reason='person_declined:not_needed'))
 or exists(select 1 from private.dependency_recompute_holds where request_id=r.id and released_at is null)
 or m.kind<>'decision' or m.outcome<>'rejected' or m.subject_kind<>'work_continuation_request' or m.subject_id<>r.id or m.revision<>r.revision-1
 or m.reference_milestone_ids<>array[(select p.id from public.work_milestones p where p.kind='continuation_proposed' and p.subject_id=r.id)]
 or not pg_temp.history_intact() then
  raise exception 'decline of an open update mismatch: % %',to_jsonb(r),to_jsonb(m);
 end if;
 -- The worker finds nothing to claim.
 if (pg_temp.as_worker('select public.worker_claim_dependency_recompute_v1(''synthetic-dependency-outbox-token'',120)')->>'claimed')::boolean then
  raise exception 'a declined update left a candidate to claim';
 end if;
 raise notice 'PASS: decline of an open update: the update and its scheduled candidate end declined with the reason, its holds are released, a rejected decision records it';
end $$;

-- 6. Decline while scheduled: D is re-derived, both candidates are scheduled.
rollback to savepoint stage18_4_ready;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select pg_temp.source_version('S2',pg_temp.id('S'));
select pg_temp.drain_outbox();
select pg_temp.source_version('D2',pg_temp.id('D'));
select pg_temp.derive('D2','S2');
select pg_temp.drain_outbox();
do $$ declare r public.work_continuation_requests:=pg_temp.update_request();s jsonb;begin
 if r.status<>'scheduled' then raise exception 'setup: the update is not scheduled: %',to_jsonb(r); end if;
 perform pg_temp.expect_error(format('select public.decline_work_update_v1(%L,%L,%L,%L)',gen_random_uuid(),r.id,r.revision+1,'inputs_disputed'),
  'work_update_changed','a decline at another revision is refused');
 s:=public.decline_work_update_v1('a4190000-0000-4000-8000-000000000302',r.id,r.revision,'inputs_disputed');
 if s->>'updateStatus'<>'declined' or jsonb_array_length(s->'declinedCandidates')<>2
 or exists(select 1 from public.work_recompute_candidates where request_id=r.id and state<>'declined')
 or not pg_temp.history_intact() then
  raise exception 'decline of a scheduled update mismatch: %',s;
 end if;
 -- Replay and conflicting replay of the decline.
 if not (public.decline_work_update_v1('a4190000-0000-4000-8000-000000000302',r.id,r.revision,'inputs_disputed')->>'replayed')::boolean then raise exception 'decline replay not recognised'; end if;
 perform pg_temp.expect_error(format('select public.decline_work_update_v1(%L,%L,%L,%L)','a4190000-0000-4000-8000-000000000302',r.id,r.revision,'not_needed'),
  'work_update_command_conflict','the same decline id with another reason is refused');
 raise notice 'PASS: decline of a scheduled update: every scheduled candidate ends declined; the same decline again is a replay, with another reason a conflict';
end $$;

-- 7. Decline while ready: the settled candidates and their results stay; the update ends declined.
rollback to savepoint stage18_4_ready;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
select pg_temp.source_version('S2',pg_temp.id('S'));
select pg_temp.drain_outbox();
select pg_temp.remember('x1',pg_temp.produce(array['S2']));
insert into dep select 'X1b',(value->>'executionId')::uuid from recompute_step where name='x1';
select pg_temp.source_version('D2',pg_temp.id('D'));
select pg_temp.derive('D2','S2');
select pg_temp.drain_outbox();
select pg_temp.remember('x2',pg_temp.produce(array['D2']));
insert into dep select 'X2b',(value->>'executionId')::uuid from recompute_step where name='x2';
select pg_temp.commit_result(pg_temp.id('X1b'));
select pg_temp.commit_result(pg_temp.id('X2b'));
select pg_temp.remember_history();
do $$ declare r public.work_continuation_requests:=pg_temp.update_request();s jsonb;begin
 if r.status<>'ready' then raise exception 'setup: the update is not ready'; end if;
 s:=public.decline_work_update_v1('a4190000-0000-4000-8000-000000000303',r.id,r.revision,'other');
 if s->>'updateStatus'<>'declined' or jsonb_array_length(s->'declinedCandidates')<>0
 or exists(select 1 from public.work_recompute_candidates where request_id=r.id and state<>'settled')
 or exists(select 1 from public.work_milestones where kind='update_adopted') or not pg_temp.history_intact() then
  raise exception 'decline of a ready update mismatch: %',s;
 end if;
 -- The recomputed results are not bases: nothing adopted them.
 if exists(select 1 from jsonb_array_elements(public.work_update_view_v1(pg_temp.id('W1'))->'bases') b where b->>'kind'='update_adopted') then
  raise exception 'a declined update became a base';
 end if;
 raise notice 'PASS: decline of a ready update: the update ends declined, the settled candidates and their results stay untouched';
end $$;

-- 8. A costed recomputation. A newer platform release whose only profile carries a cost (the synthetic
-- profile technique of increment 3B) puts every lineage in wait for a person.
rollback to savepoint stage18_4_ready;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
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
select pg_temp.remember_history();
savepoint stage18_4_paid;
do $$ declare r public.work_continuation_requests:=pg_temp.update_request();c public.work_recompute_candidates;wait public.work_milestones;s jsonb;decision public.work_milestones;resolution public.work_milestones;begin
 if r.status<>'awaiting_authorization' or (select count(*) from public.work_recompute_candidates where request_id=r.id and state='awaiting_authorization')<>3 then
  raise exception 'setup: the paid update does not wait: %',to_jsonb(r);
 end if;
 c:=pg_temp.candidate('X1','awaiting_authorization');
 select * into strict wait from public.work_milestones where kind='awaiting_human' and subject_id=c.id;
 perform pg_temp.expect_error(format('select public.authorize_work_update_v1(%L,%L,%L)',gen_random_uuid(),c.id,c.revision+1),'work_update_changed','authorization at another revision is refused');
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
 perform pg_temp.expect_error(format('select public.authorize_work_update_v1(%L,%L,%L)',gen_random_uuid(),c.id,c.revision),'work_continuation_access_denied','authorization by a member without access is refused');
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 s:=public.authorize_work_update_v1('a4190000-0000-4000-8000-000000000401',c.id,c.revision);
 select * into strict c from public.work_recompute_candidates where id=c.id;
 select * into strict decision from public.work_milestones where id=(s->>'milestoneId')::uuid;
 select * into strict resolution from public.work_milestones where id=(s->>'resolutionMilestoneId')::uuid;
 if c.state<>'scheduled' or c.execution_id is not null or s->>'updateStatus'<>'awaiting_authorization'
 or (select status from public.work_continuation_requests where id=r.id)<>'awaiting_authorization'
 or decision.kind<>'decision' or decision.outcome<>'approved' or decision.subject_kind<>'work_recompute_candidate' or decision.subject_id<>c.id
 or decision.revision<>c.revision-1 or decision.reference_milestone_ids<>array[wait.id] or decision.created_by<>'a11b0000-0000-4000-8000-000000000001'
 or resolution.kind<>'human_resolved' or resolution.resolves_milestone_id<>wait.id or resolution.reference_milestone_ids<>array[wait.id]
 or not pg_temp.history_intact() then
  raise exception 'authorization mismatch: % % %',to_jsonb(c),to_jsonb(decision),to_jsonb(resolution);
 end if;
 -- The authorization is about spending: it is never offered as a base of a continuation.
 if exists(select 1 from jsonb_array_elements(public.work_update_view_v1(pg_temp.id('W1'))->'bases') b where b->>'milestoneId'=decision.id::text) then
  raise exception 'an authorization became a continuation base';
 end if;
 perform pg_temp.expect_error(format('select pg_temp.continue_from(%L,%L,%L,%L)',gen_random_uuid(),pg_temp.id('W1'),'Aprofundar o recálculo autorizado',decision.id),
  'work_continuation_base_not_approved','an authorization is refused as a base');
 if not (public.authorize_work_update_v1('a4190000-0000-4000-8000-000000000401',c.id,c.revision-1)->>'replayed')::boolean then raise exception 'authorization replay not recognised'; end if;
 perform pg_temp.expect_error(format('select public.authorize_work_update_v1(%L,%L,%L)','a4190000-0000-4000-8000-000000000401',(pg_temp.candidate('X2','awaiting_authorization')).id,1),
  'work_update_command_conflict','the same authorization id for another candidate is refused');
 perform pg_temp.expect_error(format('select public.authorize_work_update_v1(%L,%L,%L)',gen_random_uuid(),c.id,c.revision),'work_update_candidate_not_waiting','a scheduled candidate is not authorized again');
 -- The worker can now claim the authorized candidate and only that one.
 if (pg_temp.as_worker('select public.worker_claim_dependency_recompute_v1(''synthetic-dependency-outbox-token'',120)')->>'candidateId')<>c.id::text then
  raise exception 'the authorized candidate is not the one the worker claims';
 end if;
 raise notice 'PASS: authorization of a costed candidate at its revision schedules it for the worker; human_resolved resolves its wait and an approved decision records it; the update keeps waiting for the others';
end $$;
-- One waiting candidate declined, then the whole waiting update.
do $$ declare r public.work_continuation_requests:=pg_temp.update_request();c public.work_recompute_candidates;wait public.work_milestones;s jsonb;decision public.work_milestones;begin
 c:=pg_temp.candidate('X2','awaiting_authorization');
 select * into strict wait from public.work_milestones where kind='awaiting_human' and subject_id=c.id;
 perform pg_temp.expect_error(format('select public.decline_work_update_v1(%L,%L,%L,%L,%L)',gen_random_uuid(),r.id,c.revision,'cost_not_justified',(pg_temp.candidate('X1','scheduled')).id),
  'work_update_candidate_not_waiting','a scheduled candidate is not declined alone');
 s:=public.decline_work_update_v1('a4190000-0000-4000-8000-000000000402',r.id,c.revision,'cost_not_justified',c.id);
 select * into strict c from public.work_recompute_candidates where id=c.id;
 select * into strict decision from public.work_milestones where id=(s->>'milestoneId')::uuid;
 if c.state<>'declined' or c.reason<>'person_declined:cost_not_justified' or s->>'candidateState'<>'declined' or s->>'updateStatus'<>'awaiting_authorization'
 or decision.kind<>'decision' or decision.outcome<>'rejected' or decision.subject_id<>c.id or decision.reference_milestone_ids<>array[wait.id]
 or not exists(select 1 from public.work_milestones where kind='human_resolved' and resolves_milestone_id=wait.id and label='dependency_recompute_declined')
 or not pg_temp.history_intact() then
  raise exception 'decline of one waiting candidate mismatch: % %',to_jsonb(c),s;
 end if;
 s:=public.decline_work_update_v1('a4190000-0000-4000-8000-000000000403',r.id,(pg_temp.update_request()).revision,'cost_not_justified');
 select * into strict r from public.work_continuation_requests where id=r.id;
 if r.status<>'declined' or r.decline_reason<>'person_declined:cost_not_justified'
 or exists(select 1 from public.work_recompute_candidates where request_id=r.id and state<>'declined')
 or exists(select 1 from public.work_milestones w where w.kind='awaiting_human' and w.subject_kind='work_recompute_candidate'
  and w.subject_id in (select id from public.work_recompute_candidates where request_id=r.id)
  and not exists(select 1 from public.work_milestones h where h.kind='human_resolved' and h.resolves_milestone_id=w.id))
 or (select count(*) from public.work_milestones where kind='human_resolved')<>3 or not pg_temp.history_intact() then
  raise exception 'decline of a waiting update mismatch: % %',to_jsonb(r),s;
 end if;
 raise notice 'PASS: decline of one waiting candidate and of a waiting update: each ends declined with the reason, every wait it closes gets its human_resolved, a rejected decision records it';
end $$;

-- 9. No authority, no command. The plain member and the owner once suspended are refused for every
-- command, and the read of the work is refused to them.
rollback to savepoint stage18_4_paid;
select set_config('test.paid.request',(pg_temp.update_request()).id::text,true);
select set_config('test.paid.revision',(pg_temp.update_request()).revision::text,true);
select set_config('test.paid.candidate',(pg_temp.candidate('X1','awaiting_authorization')).id::text,true);
select set_config('test.paid.candidate_revision',(pg_temp.candidate('X1','awaiting_authorization')).revision::text,true);
select set_config('test.base',pg_temp.id('BRIEF')::text,true);
select set_config('test.base.work',m.work_id::text,true),set_config('test.base.decision',m.subject_id::text,true),set_config('test.base.revision',m.revision::text,true)
from public.work_milestones m where m.id=pg_temp.id('BRIEF');
-- Every command and the read, as the API role through the public wrappers, refused with the same
-- error whatever the target.
select set_config('test.refusals',jsonb_build_array(
 format('select public.request_work_continuation_v1(%L,%L,%L,%L,%L,%L,%L)',gen_random_uuid(),current_setting('test.base.work'),'pt-BR','Aprofundar o plano aprovado',
  current_setting('test.base'),current_setting('test.base.decision'),current_setting('test.base.revision')),
 format('select public.adopt_work_update_v1(%L,%L,%L)',gen_random_uuid(),current_setting('test.paid.request'),current_setting('test.paid.revision')),
 format('select public.authorize_work_update_v1(%L,%L,%L)',gen_random_uuid(),current_setting('test.paid.candidate'),current_setting('test.paid.candidate_revision')),
 format('select public.decline_work_update_v1(%L,%L,%L,%L)',gen_random_uuid(),current_setting('test.paid.request'),current_setting('test.paid.revision'),'not_needed'),
 format('select public.decline_work_update_v1(%L,%L,%L,%L,%L)',gen_random_uuid(),current_setting('test.paid.request'),current_setting('test.paid.candidate_revision'),'not_needed',
  current_setting('test.paid.candidate')),
 format('select public.work_update_view_v1(%L)',current_setting('test.base.work')))::text,true);
-- The owner, as the API role, reads and acts through the wrappers and reaches nothing else.
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
do $$ declare v jsonb;begin
 v:=public.work_update_view_v1('a11b0000-0000-4000-9000-000000000002');
 -- The open update first, then the recent closed ones (the requests the same change superseded).
 if (select count(*) from jsonb_array_elements(v->'updates') u where u->>'status' in ('open','awaiting_authorization','scheduled','ready'))<>1
 or v#>>'{updates,0,status}'<>'awaiting_authorization' or exists(select 1 from jsonb_array_elements(v->'updates') u where u->>'status' not in ('awaiting_authorization','superseded')) then
  raise exception 'owner read mismatch: %',v;
 end if;
 perform public.authorize_work_update_v1(gen_random_uuid(),current_setting('test.paid.candidate')::uuid,current_setting('test.paid.candidate_revision')::integer);
 begin perform 1 from private.work_milestone_log_v1('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002'); raise exception 'the log helper is callable';
 exception when insufficient_privilege then null;
 end;
 begin insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,created_by,occurred_at)
  values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','update_adopted','work_continuation_request',gen_random_uuid(),'forged',auth.uid(),now());
  raise exception 'a person wrote a milestone directly';
 exception when insufficient_privilege then null;
 end;
 raise notice 'PASS: the owner reads and authorizes through the public wrappers as the API role, and reaches no helper or table directly';
end $$;
reset role;

select pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
set local role authenticated;
do $$ declare attempt text;refused integer:=0;begin
 for attempt in select jsonb_array_elements_text(current_setting('test.refusals')::jsonb) loop
  begin execute attempt; raise exception 'accepted for a member without access: %',attempt;
  exception when insufficient_privilege then if sqlerrm<>'work_continuation_access_denied' then raise; end if; refused:=refused+1;
  end;
 end loop;
 if refused<>6 then raise exception 'not every command was refused'; end if;
 raise notice 'PASS: a member without access to the work is refused for every command and for the read';
end $$;
reset role;
update public.organization_memberships set status='suspended' where organization_id='a11b0000-0000-4000-9000-000000000001' and user_id='a11b0000-0000-4000-8000-000000000001';
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
do $$ declare attempt text;refused integer:=0;begin
 for attempt in select jsonb_array_elements_text(current_setting('test.refusals')::jsonb) loop
  begin execute attempt; raise exception 'accepted for a suspended owner: %',attempt;
  exception when insufficient_privilege then if sqlerrm<>'work_continuation_access_denied' then raise; end if; refused:=refused+1;
  end;
 end loop;
 if refused<>6 then raise exception 'not every command was refused'; end if;
 raise notice 'PASS: the owner whose membership was suspended is refused for every command and for the read';
end $$;
reset role;
do $$begin
 if (select status from public.work_continuation_requests where id=current_setting('test.paid.request')::uuid)<>'awaiting_authorization'
 or exists(select 1 from public.work_continuation_requests where kind='user_followup') or not pg_temp.history_intact() then
  raise exception 'a refused command changed something';
 end if;
end $$;
-- 10. The milestone contract: references name earlier milestones of the same work, outcomes follow the
-- kind, decisions and adoptions name their revision, and nothing is rewritten.
do $$begin
 perform pg_temp.expect_error(format('insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids) values(%L,%L,%L,%L,%L,%L,1,%L,%L,now(),%L)',
  'a11b0000-0000-4000-9000-000000000001',pg_temp.id('W1'),'decision','synthetic_subject',gen_random_uuid(),'Synthetic','approved','a11b0000-0000-4000-8000-000000000001',array[pg_temp.id('W2_D2')]),
  'work_milestone_reference_invalid','a reference to a milestone of another work is refused');
 perform pg_temp.expect_error(format('insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids) values(%L,%L,%L,%L,%L,%L,1,%L,%L,now(),%L)',
  'a11b0000-0000-4000-9000-000000000001',pg_temp.id('W1'),'decision','synthetic_subject',gen_random_uuid(),'Synthetic','approved','a11b0000-0000-4000-8000-000000000001',array[pg_temp.id('BRIEF'),pg_temp.id('BRIEF')]),
  'work_milestone_reference_invalid','a repeated reference is refused');
 begin
  insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at)
  values('a11b0000-0000-4000-9000-000000000001',pg_temp.id('W1'),'decision','synthetic_subject',gen_random_uuid(),'Synthetic',1,'succeeded','a11b0000-0000-4000-8000-000000000001',now());
  raise exception 'a decision with a result outcome was accepted';
 exception when check_violation then null;
 end;
 begin
  insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,outcome,created_by,occurred_at)
  values('a11b0000-0000-4000-9000-000000000001',pg_temp.id('W1'),'update_adopted','synthetic_subject',gen_random_uuid(),'Synthetic','approved','a11b0000-0000-4000-8000-000000000001',now());
  raise exception 'an adoption without its revision was accepted';
 exception when check_violation then null;
 end;
 begin
  update public.work_continuation_requests set decline_reason='person_declined:other',revision=revision+1 where id=current_setting('test.paid.request')::uuid;
  raise exception 'a decline reason was written without the decline';
 exception when check_violation then null;
 end;
 raise notice 'PASS: milestone references, outcomes and revisions follow the contract; a decline reason is written only by the decline';
end $$;

-- 11. Parity with approvedBases of continuation.ts: the vector of
-- packages/work-plan/src/continuation-sql-parity.test.ts ("approved bases parity with the SQL rule").
-- d0 is an approval about a subject outside the log (no reference); d1 and d2 approve results r1 and
-- r2; x rejects on r2, so d2 is replaced; u adopts r3 replacing r1, so d1 is replaced; a is the
-- authorization of a cost, which takes no part. The bases are d0 and u.
do $$ declare w uuid:=pg_temp.id('W2');o uuid:='a11b0000-0000-4000-9000-000000000001';who uuid:='a11b0000-0000-4000-8000-000000000001';t timestamptz:='2026-09-20 12:00:00+00';bases jsonb;begin
 insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,version_fingerprint,outcome,created_by,occurred_at,reference_milestone_ids) values
  ('b0190000-0000-4000-9000-0000000000d0',o,w,'decision','capital_project_artifact','b0190000-0000-4000-9000-0000000000a0','Mapa de alternativas',1,null,null,who,t,'{}'),
  ('b0190000-0000-4000-9000-0000000000e1',o,w,'execution_result','work_execution','b0190000-0000-4000-9000-0000000000f1','Cenário de alongamento',null,repeat('a',64),'succeeded',who,t+interval '1 minute','{}'),
  ('b0190000-0000-4000-9000-0000000000e2',o,w,'execution_result','work_execution','b0190000-0000-4000-9000-0000000000f2','Refinanciamento por debêntures',null,repeat('b',64),'succeeded',who,t+interval '2 minutes','{}');
 insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids) values
  ('b0190000-0000-4000-9000-0000000000d1',o,w,'decision','synthetic_decision','b0190000-0000-4000-9000-0000000000c1','Alongamento com os bancos atuais',3,'approved',who,t+interval '3 minutes',array['b0190000-0000-4000-9000-0000000000e1'::uuid]),
  ('b0190000-0000-4000-9000-0000000000d2',o,w,'decision','synthetic_decision','b0190000-0000-4000-9000-0000000000c2','Emissão de debêntures',1,'approved',who,t+interval '4 minutes',array['b0190000-0000-4000-9000-0000000000e2'::uuid]),
  ('b0190000-0000-4000-9000-0000000000d3',o,w,'decision','synthetic_decision','b0190000-0000-4000-9000-0000000000c3','Debêntures revistas',2,'rejected',who,t+interval '5 minutes',array['b0190000-0000-4000-9000-0000000000e2'::uuid]);
 insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,version_fingerprint,outcome,created_by,occurred_at,reference_milestone_ids) values
  ('b0190000-0000-4000-9000-0000000000e3',o,w,'execution_result','work_execution','b0190000-0000-4000-9000-0000000000f3','Alongamento com o balancete de agosto',null,repeat('c',64),'succeeded',who,t+interval '6 minutes','{}');
 insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,revision,outcome,created_by,occurred_at,reference_milestone_ids) values
  ('b0190000-0000-4000-9000-0000000000d4',o,w,'update_adopted','work_continuation_request','b0190000-0000-4000-9000-0000000000c4','dependency_update_adopted',1,'approved',who,t+interval '7 minutes',
   array['b0190000-0000-4000-9000-0000000000e3'::uuid,'b0190000-0000-4000-9000-0000000000e1'::uuid]),
  ('b0190000-0000-4000-9000-0000000000d5',o,w,'decision','work_recompute_candidate','b0190000-0000-4000-9000-0000000000c5','dependency_recompute_authorization',1,'approved',who,t+interval '8 minutes',
   array['b0190000-0000-4000-9000-0000000000e3'::uuid]);
 select jsonb_agg(b.milestone_id order by b.sequence) into bases from private.work_continuation_bases_v1(o,w) b
  where b.milestone_id in (select id from public.work_milestones where id::text like 'b0190000-%');
 if bases<>jsonb_build_array('b0190000-0000-4000-9000-0000000000d0','b0190000-0000-4000-9000-0000000000d4') then
  raise exception 'approved bases differ from continuation.ts: %',bases;
 end if;
 raise notice 'PASS: approved bases equal those of continuation.ts for the shared vector';
end $$;

select 'work_continuation_commands: PASS' result;
rollback;
