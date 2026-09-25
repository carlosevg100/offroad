-- Stage 18, increment 2: the typed execution dependency projection and the immutable milestones of
-- a work. Synthetic rows only; every row, trigger toggle and assertion below rolls back.
begin;
\ir support/contextual_adoption_setup.sql
\ir support/execution_method_fixture.sql
\ir support/execution_approval.sql

-- Organization a11b...9000-1, owner a11b...8000-1, plain member a11b...8000-2, work (capital project)
-- a11b...9000-2 with intake session a11b...9000-3. The owner adopts one observation into the basis.
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb);
-- Two versions of one logical source (a balancete and its re-upload), both with verified bytes.
insert into public.source_documents(id,organization_id,intake_session_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status)
values('a4181000-0000-4000-9000-000000000010','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',
 'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/balancete-v1.txt','Synthetic balancete','text/plain',1,repeat('e',64),'a11b0000-0000-4000-8000-000000000001','ready');
insert into public.source_documents(id,organization_id,intake_session_id,logical_source_id,object_path,original_name,mime_type,byte_size,sha256,created_by,processing_status)
select 'a4181000-0000-4000-9000-000000000011','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',logical_source_id,
 'a11b0000-0000-4000-9000-000000000001/a11b0000-0000-4000-9000-000000000003/balancete-v2.txt','Synthetic balancete','text/plain',1,repeat('f',64),'a11b0000-0000-4000-8000-000000000001','ready'
from public.source_documents where id='a4181000-0000-4000-9000-000000000010';
insert into private.source_version_verifications(organization_id,source_version_id,job_id,observed_sha256,observed_byte_size,receipt_id)
values('a11b0000-0000-4000-9000-000000000001','a4181000-0000-4000-9000-000000000010','a4181000-0000-4000-9000-000000000098',repeat('e',64),1,'synthetic-only-balancete-v1'),
 ('a11b0000-0000-4000-9000-000000000001','a4181000-0000-4000-9000-000000000011','a4181000-0000-4000-9000-000000000099',repeat('f',64),1,'synthetic-only-balancete-v2');
do $$begin
 if (select array_agg(v.version_no order by v.version_no) from public.source_versions v where v.source_id=(select source_id from public.source_versions where id='a4181000-0000-4000-9000-000000000010')) is distinct from array[1,2] then
  raise exception 'setup: the re-upload is not version 2 of the same logical source';
 end if;
end $$;

-- The execution contract of the method fixture, with both source versions and the adopted slot pinned.
create function pg_temp.continuity_contract(p_execution uuid) returns jsonb language sql as $$
 select jsonb_set(jsonb_set(pg_temp.execution_contract_fixture(p_execution),'{inputs,sources}',jsonb_build_array(
  jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId','a4181000-0000-4000-9000-000000000010','contentHash',repeat('e',64),'rightsRevision','1'),
  jsonb_build_object('resourceId','a11b0000-0000-4000-9000-000000000003','sourceVersionId','a4181000-0000-4000-9000-000000000011','contentHash',repeat('f',64),'rightsRevision','1'))),
  '{inputs,adoptions}',(select jsonb_agg(jsonb_build_object('id',i.decision_id,'assumptionVersionId',v.id,'fingerprint',v.content_fingerprint))
   from public.assumption_versions v join private.assumption_version_items i on i.organization_id=v.organization_id and i.version_id=v.id
   where v.id='a9990000-0000-4000-9000-000000000003'));
$$;

-- The projection of one execution equals, row for row, what its request wrote.
create function pg_temp.assert_dependency_projection(p_execution uuid,p_test text) returns void language plpgsql as $$
declare expected integer;
begin
 select (select count(*) from private.execution_source_bindings where execution_id=p_execution)
  +(select count(*) from private.execution_basis_bindings where execution_id=p_execution)
  +(select count(*) from private.execution_manifests where execution_id=p_execution) into expected;
 if expected<>4 or (select count(*) from private.execution_dependencies where execution_id=p_execution)<>expected then
  raise exception '% projection count differs from the pinned inputs',p_test;
 end if;
 if exists(select 1 from private.execution_source_bindings b join public.source_versions v on v.organization_id=b.organization_id and v.id=b.source_version_id
  where b.execution_id=p_execution and (select count(*) from private.execution_dependencies d where d.organization_id=b.organization_id and d.execution_id=b.execution_id
   and d.dependency_kind='source_version' and d.source_binding_id=b.id and d.source_version_id=b.source_version_id and d.source_id=v.source_id
   and d.source_version_no=v.version_no and d.rights_version_id=b.rights_version_id and d.resource_id=b.resource_id and d.content_hash=b.content_hash
   and d.logical_key=v.source_id::text)<>1) then raise exception '% source version projection differs from its binding',p_test; end if;
 if exists(select 1 from private.execution_basis_bindings b
  join private.assumption_version_items i on i.organization_id=b.organization_id and i.version_id=b.assumption_version_id and i.decision_id=b.decision_id
  join public.assumption_versions v on v.organization_id=i.organization_id and v.id=i.version_id
  where b.execution_id=p_execution and (select count(*) from private.execution_dependencies d where d.organization_id=b.organization_id and d.execution_id=b.execution_id
   and d.dependency_kind='assumption_slot' and d.basis_binding_id=b.id and d.assumption_set_id=v.set_id and d.assumption_version_id=v.id
   and d.assumption_revision=v.revision and d.slot_key=i.slot_key and d.decision_id=b.decision_id and d.content_fingerprint=b.content_fingerprint
   and d.logical_key=v.set_id::text||':'||i.slot_key)<>1) then raise exception '% assumption slot projection differs from its binding',p_test; end if;
 if (select count(*) from private.execution_dependencies d join private.execution_manifests m on m.organization_id=d.organization_id and m.id=d.manifest_id
  join private.platform_method_releases r on r.id=m.platform_release_id
  where d.execution_id=p_execution and m.execution_id=p_execution and d.dependency_kind='method_release' and d.platform_release_id=m.platform_release_id
  and d.house_release_id is not distinct from m.house_release_id and d.method_id=r.method_id and d.method_version=r.version
  and d.method_id=m.payload#>>'{method,methodId}' and d.logical_key=r.method_id)<>1 then raise exception '% method release projection differs from its manifest',p_test; end if;
 -- Two versions of one logical source are two pinned inputs under one logical key.
 if (select array_agg(source_version_no order by source_version_no) from private.execution_dependencies
  where execution_id=p_execution and dependency_kind='source_version'
  and logical_key=(select source_id::text from public.source_versions where id='a4181000-0000-4000-9000-000000000010')) is distinct from array[1,2] then
  raise exception '% two versions of one logical source not both projected',p_test;
 end if;
 raise notice 'PASS: %',p_test;
end $$;

-- auth.uid() prefers request.jwt.claim.sub, which the fixture sets: switch both claims together.
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
end $$;
create temporary table continuity_case(name text primary key,value jsonb);

-- 1. A request writes exactly its projection in its own transaction.
insert into continuity_case values('e1',jsonb_build_object('contract',pg_temp.continuity_contract('a4181000-0000-4000-9000-000000000001')));
update continuity_case set value=value||jsonb_build_object('request',private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',(value->'contract')::text,'{}')) where name='e1';
select pg_temp.assert_dependency_projection('a4181000-0000-4000-9000-000000000001','request writes exactly its typed projection');
do $$begin
 if (select count(distinct x.xmin::text) from (
  select xmin from public.work_executions where id='a4181000-0000-4000-9000-000000000001'
  union all select xmin from private.execution_source_bindings where execution_id='a4181000-0000-4000-9000-000000000001'
  union all select xmin from private.execution_basis_bindings where execution_id='a4181000-0000-4000-9000-000000000001'
  union all select xmin from private.execution_manifests where execution_id='a4181000-0000-4000-9000-000000000001'
  union all select xmin from private.execution_dependencies where execution_id='a4181000-0000-4000-9000-000000000001') x)<>1 then
  raise exception 'projection written outside the request transaction';
 end if;
 -- The manifest and both sources are bound before the slot is refused: all of it rolls back together.
 begin
  perform private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',
   jsonb_set(pg_temp.continuity_contract('a4181000-0000-4000-9000-000000000002'),'{inputs,adoptions,0,id}',to_jsonb(gen_random_uuid()))::text,'{}');
  raise exception 'refused slot pin accepted';
 exception when insufficient_privilege then
  if sqlerrm<>'execution_basis_decision_denied' then raise; end if;
 end;
 if exists(select 1 from public.work_executions where id='a4181000-0000-4000-9000-000000000002')
 or exists(select 1 from private.execution_dependencies where execution_id='a4181000-0000-4000-9000-000000000002') then
  raise exception 'refused request left a projection';
 end if;
 raise notice 'PASS: projection shares the request transaction, including its refusal';
end $$;
-- The same request replayed adds nothing.
do $$ declare r jsonb;begin
 select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',(value->'contract')::text,'{}') into r from continuity_case where name='e1';
 if not (r->>'replayed')::boolean or (select count(*) from private.execution_dependencies where execution_id='a4181000-0000-4000-9000-000000000001')<>4 then
  raise exception 'replayed request changed the projection';
 end if;
 raise notice 'PASS: replayed request adds no projection';
end $$;

-- 2. No client role reads or writes the projection; nobody updates, deletes or truncates it.
do $$ declare role_name text;begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(role_name,'private.execution_dependencies','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  or has_table_privilege(role_name,'private.execution_dependency_sources_v1','SELECT,INSERT,UPDATE,DELETE') then
   raise exception 'projection exposed to %',role_name;
  end if;
 end loop;
 if not exists(select 1 from pg_class where oid='private.execution_dependencies'::regclass and relrowsecurity and relforcerowsecurity)
 or not exists(select 1 from pg_policy where polrelid='private.execution_dependencies'::regclass and polname='execution_dependencies_deny_clients'
  and not polpermissive and polcmd='*' and pg_get_expr(polqual,polrelid)='false' and pg_get_expr(polwithcheck,polrelid)='false') then
  raise exception 'projection deny-all policy missing';
 end if;
 raise notice 'PASS: projection closed to every API role';
end $$;
set local role authenticated;
do $$ declare attempt text;begin
 foreach attempt in array array[
  'select count(*) from private.execution_dependencies',
  'insert into private.execution_dependencies(organization_id,execution_id,dependency_kind,logical_key) values(''a11b0000-0000-4000-9000-000000000001'',''a4181000-0000-4000-9000-000000000001'',''method_release'',''forged'')',
  'update private.execution_dependencies set logical_key=''forged''',
  'delete from private.execution_dependencies'] loop
  begin execute attempt; raise exception 'work owner reached the projection: %',attempt;
  exception when insufficient_privilege then null;
  end;
 end loop;
 raise notice 'PASS: the work owner through the API role neither reads nor writes the projection';
end $$;
reset role;
set local role anon;
do $$begin
 begin perform 1 from private.execution_dependencies; raise exception 'anon read the projection';
 exception when insufficient_privilege then null;
 end;
 raise notice 'PASS: anonymous callers cannot read the projection';
end $$;
reset role;
do $$ declare attempt text;begin
 foreach attempt in array array[
  'update private.execution_dependencies set logical_key=logical_key where execution_id=''a4181000-0000-4000-9000-000000000001''',
  'delete from private.execution_dependencies where execution_id=''a4181000-0000-4000-9000-000000000001''',
  'truncate private.execution_dependencies'] loop
  begin execute attempt; raise exception 'privileged mutation of the projection: %',attempt;
  exception when check_violation then
   if sqlerrm<>'work_continuity_history_immutable' then raise; end if;
  end;
 end loop;
 raise notice 'PASS: nobody updates, deletes or truncates the projection';
end $$;

-- 3. Backfill: an execution recorded before the triggers existed is projected from the same rows.
alter table private.execution_source_bindings disable trigger execution_source_bindings_dependency;
alter table private.execution_basis_bindings disable trigger execution_basis_bindings_dependency;
alter table private.execution_manifests disable trigger execution_manifests_dependency;
insert into continuity_case values('e3',private.request_work_execution_v1('a4171000-0000-4000-9000-000000000001',pg_temp.continuity_contract('a4181000-0000-4000-9000-000000000003')::text,'{}'));
alter table private.execution_source_bindings enable trigger execution_source_bindings_dependency;
alter table private.execution_basis_bindings enable trigger execution_basis_bindings_dependency;
alter table private.execution_manifests enable trigger execution_manifests_dependency;
do $$ declare written bigint;begin
 if exists(select 1 from private.execution_dependencies where execution_id='a4181000-0000-4000-9000-000000000003') then
  raise exception 'setup: the historical execution was projected by a trigger';
 end if;
 written:=private.backfill_execution_dependencies_v1();
 if written<>4 then raise exception 'backfill wrote % rows instead of 4',written; end if;
 perform pg_temp.assert_dependency_projection('a4181000-0000-4000-9000-000000000003','backfill matches the bindings');
 perform pg_temp.assert_dependency_projection('a4181000-0000-4000-9000-000000000001','backfill leaves projected executions unchanged');
 if private.backfill_execution_dependencies_v1()<>0 then raise exception 'backfill is not idempotent'; end if;
 raise notice 'PASS: backfill is idempotent';
end $$;

-- 4. The commit writes one execution_result milestone with the result receipt; a replay writes none.
update continuity_case set value=value||jsonb_build_object('claim',private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(value#>>'{request,jobId}')::uuid,60)) where name='e1';
select private.reserve_execution_operation_v1((value#>>'{request,jobId}')::uuid,value#>>'{claim,capability}',(value#>>'{claim,leaseId}')::uuid,
 'a4181000-0000-4000-9000-000000000001',value#>>'{claim,contractFingerprint}','synthetic#calculate','test-v1','read_only',0,0) from continuity_case where name='e1';
select private.settle_execution_operation_v2((value#>>'{request,jobId}')::uuid,value#>>'{claim,capability}',(value#>>'{claim,leaseId}')::uuid,
 'a4181000-0000-4000-9000-000000000001',value#>>'{claim,contractFingerprint}','{"calculation":"synthetic continuity"}','succeeded','calculated',0,0) from continuity_case where name='e1';
do $$ declare c jsonb;r jsonb;m public.work_milestones;begin
 select value into c from continuity_case where name='e1';
 if exists(select 1 from public.work_milestones where subject_id='a4181000-0000-4000-9000-000000000001') then raise exception 'milestone before commit'; end if;
 r:=private.commit_work_execution_result_v1((c#>>'{request,jobId}')::uuid,c#>>'{claim,capability}',(c#>>'{claim,leaseId}')::uuid,c#>>'{claim,contractFingerprint}',
  encode(extensions.digest('{}','sha256'),'hex'),'{"calculation":"synthetic continuity"}','succeeded','calculated');
 if (r->>'replayed')::boolean then raise exception 'first commit reported a replay'; end if;
 select * into strict m from public.work_milestones where kind='execution_result' and subject_id='a4181000-0000-4000-9000-000000000001';
 if m.organization_id<>'a11b0000-0000-4000-9000-000000000001' or m.work_id<>'a11b0000-0000-4000-9000-000000000002' or m.subject_kind<>'work_execution'
 or m.label<>'Synthetic deterministic execution proof' or m.outcome<>'succeeded' or m.revision is not null
 or m.version_fingerprint<>encode(extensions.digest('{"calculation":"synthetic continuity"}','sha256'),'hex')
 or m.created_by<>'a11b0000-0000-4000-8000-000000000001' or m.resolves_milestone_id is not null or m.supersedes_milestone_id is not null
 or m.occurred_at<>(select created_at from private.execution_result_receipts where execution_id='a4181000-0000-4000-9000-000000000001')
 or m.xmin::text<>(select xmin::text from private.execution_result_receipts where execution_id='a4181000-0000-4000-9000-000000000001') then
  raise exception 'execution_result milestone does not describe its committed result: %',to_jsonb(m);
 end if;
 r:=private.commit_work_execution_result_v1((c#>>'{request,jobId}')::uuid,c#>>'{claim,capability}',(c#>>'{claim,leaseId}')::uuid,c#>>'{claim,contractFingerprint}',
  encode(extensions.digest('{}','sha256'),'hex'),'{"calculation":"synthetic continuity"}','succeeded','calculated');
 if not (r->>'replayed')::boolean or (select count(*) from public.work_milestones where subject_id='a4181000-0000-4000-9000-000000000001')<>1 then
  raise exception 'replayed commit changed the milestones';
 end if;
 if not exists(select 1 from public.audit_events where resource_type='work_milestones' and resource_id=m.id::text and action='insert') then
  raise exception 'milestone insert not audited';
 end if;
 raise notice 'PASS: one execution_result milestone per committed result, none on replay';
end $$;

-- 5. Decisions: an accepted execution brief, through the real approval command, twice.
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values('a4181000-0000-4000-9000-000000000021','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',21,'manual','queued','approval-fixture-v1','a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values('a4181000-0000-4000-9000-000000000031','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a4181000-0000-4000-9000-000000000021','case_analysis','queued','{"analysis_scope":"full_case"}');
select pg_temp.fixture_approve_execution('a4181000-0000-4000-9000-000000000031');
do $$ declare d public.capital_project_execution_brief_dispatches;b public.capital_project_execution_briefs;m public.work_milestones;begin
 select * into strict d from public.capital_project_execution_brief_dispatches where processing_job_id='a4181000-0000-4000-9000-000000000031';
 select * into strict b from public.capital_project_execution_briefs where id=d.execution_brief_id;
 select * into strict m from public.work_milestones where kind='decision' and subject_kind='execution_brief' and subject_id=b.id;
 if d.accepted_at is null or m.work_id<>d.capital_project_id or m.label<>'Validar contrato com dados sintéticos' or m.revision<>b.brief_version
 or m.version_fingerprint<>d.approved_brief_fingerprint or m.created_by<>d.accepted_by or m.occurred_at<>d.accepted_at or m.outcome is not null
 or m.supersedes_milestone_id is not null then
  raise exception 'brief approval milestone does not describe the approval: %',to_jsonb(m);
 end if;
 -- Approving again is a replay of the same act: no second milestone.
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 if public.approve_advisor_execution_brief_v1(d.capital_project_id,b.id,b.brief_fingerprint,gen_random_uuid())->>'status'<>'already_approved'
 or (select count(*) from public.work_milestones where subject_id=b.id)<>1 then
  raise exception 'replayed approval changed the milestones';
 end if;
 perform pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
 raise notice 'PASS: an accepted execution brief writes its decision milestone once';
end $$;
insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,status,pipeline_version,created_by)
values('a4181000-0000-4000-9000-000000000022','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',22,'manual','queued','approval-fixture-v1','a11b0000-0000-4000-8000-000000000001');
insert into public.processing_jobs(id,organization_id,intake_session_id,processing_run_id,kind,status,payload)
values('a4181000-0000-4000-9000-000000000032','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003','a4181000-0000-4000-9000-000000000022','case_analysis','queued','{"analysis_scope":"full_case","synthetic_second_brief":true}');
select pg_temp.fixture_approve_execution('a4181000-0000-4000-9000-000000000032');
do $$ declare first_m public.work_milestones;second_m public.work_milestones;begin
 select m.* into strict first_m from public.work_milestones m join public.capital_project_execution_brief_dispatches d on d.execution_brief_id=m.subject_id
  where d.processing_job_id='a4181000-0000-4000-9000-000000000031';
 select m.* into strict second_m from public.work_milestones m join public.capital_project_execution_brief_dispatches d on d.execution_brief_id=m.subject_id
  where d.processing_job_id='a4181000-0000-4000-9000-000000000032';
 if second_m.revision<>first_m.revision+1 or second_m.supersedes_milestone_id is distinct from first_m.id then
  raise exception 'newer approved brief does not supersede the previous approval';
 end if;
 raise notice 'PASS: the approval of the next brief version supersedes the previous one';
end $$;

-- A confirmed artifact, through the real decision command; a returned artifact is not a milestone.
insert into public.capital_project_task_runs(id,organization_id,capital_project_id,plan_id,plan_task_id,attempt_no,status,trigger_event)
select 'a4181000-0000-4000-9000-000000000041',t.organization_id,t.capital_project_id,t.plan_id,t.id,1,'queued','{"synthetic":true}'
from public.capital_project_plan_tasks t join public.capital_project_plans p on p.organization_id=t.organization_id and p.id=t.plan_id
where p.capital_project_id='a11b0000-0000-4000-9000-000000000002' and p.status='active' order by t.ordinal limit 1;
insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,
 input_fingerprint,artifact_fingerprint,content,processing_job_id,created_by_kind)
select x.id,r.organization_id,r.capital_project_id,r.plan_id,r.id,x.artifact_type,'synthetic.v1',1,'pending_confirmation',repeat('1',64),x.fingerprint,'{"synthetic":true}',
 'a4181000-0000-4000-9000-000000000031','worker'
from public.capital_project_task_runs r cross join (values('a4181000-0000-4000-9000-000000000051'::uuid,'alternative_map',repeat('2',64)),
 ('a4181000-0000-4000-9000-000000000052'::uuid,'company_debt_diagnostic',repeat('3',64))) x(id,artifact_type,fingerprint)
where r.id='a4181000-0000-4000-9000-000000000041';
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
select public.decide_capital_project_artifact('a4181000-0000-4000-9000-000000000051',repeat('2',64),'confirm',null);
select public.decide_capital_project_artifact('a4181000-0000-4000-9000-000000000052',repeat('3',64),'request_changes','Synthetic request for changes');
-- Deciding again is refused; the confirmation and its milestone stay single.
do $$begin
 begin
  perform public.decide_capital_project_artifact('a4181000-0000-4000-9000-000000000051',repeat('2',64),'confirm',null);
  raise exception 'artifact decided twice';
 exception when object_not_in_prerequisite_state then
  if sqlerrm<>'capital_project_artifact_not_pending_confirmation' then raise; end if;
 end;
end $$;
reset role;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
do $$ declare m public.work_milestones;x public.capital_project_artifact_decisions;begin
 select * into strict x from public.capital_project_artifact_decisions where artifact_id='a4181000-0000-4000-9000-000000000051';
 select * into strict m from public.work_milestones where kind='decision' and subject_kind='capital_project_artifact' and subject_id='a4181000-0000-4000-9000-000000000051';
 if m.label<>'alternative_map' or m.revision<>1 or m.version_fingerprint<>repeat('2',64) or m.created_by<>x.decided_by or m.occurred_at<>x.decided_at
 or m.work_id<>'a11b0000-0000-4000-9000-000000000002' then raise exception 'artifact confirmation milestone mismatch: %',to_jsonb(m); end if;
 if exists(select 1 from public.work_milestones where subject_id='a4181000-0000-4000-9000-000000000052') then
  raise exception 'a request for changes became a decision milestone';
 end if;
 raise notice 'PASS: a confirmed artifact writes its decision milestone once; a return writes none';
end $$;

-- An approved institutional configuration, through the real review command. A rejection and a stale
-- approval write nothing.
insert into private.institutional_model_configurations(id,organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status)
values('a4181000-0000-4000-9000-000000000061','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002',1,'{"synthetic":1}',repeat('4',64),null,'review_required');
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
select public.review_institutional_configuration_v1('a11b0000-0000-4000-9000-000000000002','a4181000-0000-4000-9000-000000000061',null,'approved',repeat('4',64));
reset role;
insert into private.institutional_model_configurations(id,organization_id,capital_project_id,revision,configuration,configuration_fingerprint,parent_fingerprint,status)
values('a4181000-0000-4000-9000-000000000062','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002',2,'{"synthetic":2}',repeat('5',64),repeat('4',64),'review_required'),
 ('a4181000-0000-4000-9000-000000000063','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002',3,'{"synthetic":3}',repeat('6',64),repeat('4',64),'review_required');
set local role authenticated;
select public.review_institutional_configuration_v1('a11b0000-0000-4000-9000-000000000002','a4181000-0000-4000-9000-000000000063',repeat('4',64),'rejected',repeat('6',64));
do $$begin
 begin
  perform public.review_institutional_configuration_v1('a11b0000-0000-4000-9000-000000000002','a4181000-0000-4000-9000-000000000062',repeat('0',64),'approved',repeat('5',64));
  raise exception 'stale approval accepted';
 exception when serialization_failure then null;
 end;
end $$;
reset role;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
do $$ declare m public.work_milestones;begin
 select * into strict m from public.work_milestones where kind='decision' and subject_kind='institutional_model_configuration' and subject_id='a4181000-0000-4000-9000-000000000061';
 if m.label<>'institutional_model_configuration' or m.revision<>1 or m.version_fingerprint<>repeat('4',64) or m.created_by<>'a11b0000-0000-4000-8000-000000000001'
 or m.supersedes_milestone_id is not null then raise exception 'configuration approval milestone mismatch: %',to_jsonb(m); end if;
 if exists(select 1 from public.work_milestones where subject_id in ('a4181000-0000-4000-9000-000000000062','a4181000-0000-4000-9000-000000000063')) then
  raise exception 'a rejected or stale review became a decision milestone';
 end if;
 raise notice 'PASS: an approved configuration writes its decision milestone; rejection and stale approval write none';
end $$;

-- 6. Milestone backfill: a result committed and an approval given before the writers existed.
insert into private.execution_result_receipts(organization_id,execution_id,lease_id,contract_fingerprint,input_fingerprint,result_fingerprint,canonical_result,outcome,reason)
select organization_id,execution_id,gen_random_uuid(),payload_fingerprint,snapshot_fingerprint,encode(extensions.digest('{"marker":"budget_exhausted"}','sha256'),'hex'),
 '{"marker":"budget_exhausted"}','partial','budget_exhausted'
from private.execution_manifests where execution_id='a4181000-0000-4000-9000-000000000003';
alter table private.institutional_model_configurations disable trigger work_milestone_decision;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
select public.review_institutional_configuration_v1('a11b0000-0000-4000-9000-000000000002','a4181000-0000-4000-9000-000000000062',repeat('4',64),'approved',repeat('5',64));
reset role;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
alter table private.institutional_model_configurations enable trigger work_milestone_decision;
do $$ declare written bigint;result_m public.work_milestones;config_m public.work_milestones;begin
 if exists(select 1 from public.work_milestones where subject_id in ('a4181000-0000-4000-9000-000000000003','a4181000-0000-4000-9000-000000000062')) then
  raise exception 'setup: historical rows already have milestones';
 end if;
 written:=private.backfill_work_milestones_v1();
 if written<>2 then raise exception 'milestone backfill wrote % rows instead of 2',written; end if;
 select * into strict result_m from public.work_milestones where kind='execution_result' and subject_id='a4181000-0000-4000-9000-000000000003';
 if result_m.outcome<>'partial' or result_m.version_fingerprint<>encode(extensions.digest('{"marker":"budget_exhausted"}','sha256'),'hex')
 or result_m.occurred_at<>(select created_at from private.execution_result_receipts where execution_id='a4181000-0000-4000-9000-000000000003') then
  raise exception 'backfilled result milestone mismatch';
 end if;
 select * into strict config_m from public.work_milestones where kind='decision' and subject_id='a4181000-0000-4000-9000-000000000062';
 if config_m.revision<>2 or config_m.supersedes_milestone_id is distinct from (select id from public.work_milestones where subject_id='a4181000-0000-4000-9000-000000000061') then
  raise exception 'backfilled approval does not supersede the previous approval';
 end if;
 if private.backfill_work_milestones_v1()<>0 then raise exception 'milestone backfill is not idempotent'; end if;
 raise notice 'PASS: milestone backfill writes historical results and approvals once, in series order';
end $$;

-- 7. Read authority is the work's: the owner sees every milestone of the work, a member without
-- access to it sees none and cannot probe for one; nobody writes, updates, deletes or truncates.
do $$begin
 if not exists(select 1 from public.organization_memberships where organization_id='a11b0000-0000-4000-9000-000000000001' and user_id='a11b0000-0000-4000-8000-000000000002' and status='active')
 or (select count(*) from public.work_milestones where work_id='a11b0000-0000-4000-9000-000000000002')<>7 then
  raise exception 'setup: expected an active member and seven milestones';
 end if;
end $$;
select set_config('test.continuity.milestone',(select id::text from public.work_milestones where subject_id='a4181000-0000-4000-9000-000000000001'),true);
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
do $$ declare attempt text;begin
 if (select count(*) from public.work_milestones)<>7 then raise exception 'work owner does not see the milestones of the work'; end if;
 foreach attempt in array array[
  'insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,created_by,occurred_at) values(''a11b0000-0000-4000-9000-000000000001'',''a11b0000-0000-4000-9000-000000000002'',''decision'',''forged_subject'',gen_random_uuid(),''Forged'',auth.uid(),now())',
  'update public.work_milestones set label=''Forged''',
  'delete from public.work_milestones'] loop
  begin execute attempt; raise exception 'work owner wrote a milestone directly: %',attempt;
  exception when insufficient_privilege then null;
  end;
 end loop;
 raise notice 'PASS: the work owner reads the milestones and cannot write them';
end $$;
reset role;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000002');
set local role authenticated;
do $$begin
 if exists(select 1 from public.work_milestones) or exists(select 1 from public.work_milestones where id=current_setting('test.continuity.milestone')::uuid) then
  raise exception 'member without access to the work reads its milestones';
 end if;
 begin
  insert into public.work_milestones(id,organization_id,work_id,kind,subject_kind,subject_id,label,created_by,occurred_at)
  values(current_setting('test.continuity.milestone')::uuid,'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','decision','forged_subject',gen_random_uuid(),'Forged',auth.uid(),now());
  raise exception 'member wrote a milestone';
 exception when insufficient_privilege then null;
 end;
 raise notice 'PASS: a member without access to the work neither sees nor probes its milestones';
end $$;
reset role;
set local role anon;
do $$begin
 begin perform 1 from public.work_milestones; raise exception 'anon read milestones';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
do $$ declare attempt text;role_name text;begin
 foreach attempt in array array[
  'update public.work_milestones set label=label',
  'delete from public.work_milestones',
  'truncate public.work_milestones'] loop
  begin execute attempt; raise exception 'privileged mutation of milestones: %',attempt;
  exception when check_violation then
   if sqlerrm<>'work_continuity_history_immutable' then raise; end if;
  end;
 end loop;
 foreach role_name in array array['anon','service_role'] loop
  if has_table_privilege(role_name,'public.work_milestones','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'milestones exposed to %',role_name; end if;
 end loop;
 if not has_table_privilege('authenticated','public.work_milestones','SELECT')
 or has_table_privilege('authenticated','public.work_milestones','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
  raise exception 'milestone grants are not select-only for authenticated';
 end if;
 if (select count(*) from pg_policy where polrelid='public.work_milestones'::regclass and polname in
  ('work_milestones_select_authorized','work_milestones_deny_insert','work_milestones_deny_update','work_milestones_deny_delete'))<>4
 or exists(select 1 from pg_policy where polrelid='public.work_milestones'::regclass and polcmd in ('*','a','w','d') and polpermissive
  and coalesce(pg_get_expr(polqual,polrelid),'false')<>'false') then
  raise exception 'milestone policies are not one authorized read and explicit denials';
 end if;
 raise notice 'PASS: nobody updates, deletes or truncates a milestone; grants are select-only';
end $$;

-- 8. No function introduced here is callable by an API role.
do $$ declare f record;role_name text;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname in ('reject_work_continuity_mutation_v1','project_execution_dependency_v1','backfill_execution_dependencies_v1',
   'work_milestone_label_v1','write_work_milestone_v1','record_execution_result_milestone_v1','project_decision_milestone_v1','backfill_work_milestones_v1') loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,f.signature,'EXECUTE') then raise exception 'writer exposed: % %',role_name,f.signature; end if;
  end loop;
 end loop;
 raise notice 'PASS: every writer is closed to the API roles';
end $$;

select 'work_dependencies_projection: PASS' result;
rollback;
