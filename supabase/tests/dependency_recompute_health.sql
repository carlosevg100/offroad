-- Stage 18, increment 6A: the health of the dependency recompute, counts and ages only, read through
-- the recompute worker binding of the claim. Synthetic candidates in every state of 3B and 5A,
-- including a lease that expired after an attempt and a scheduled institutional candidate. The health
-- counts every organization, so each number is compared with the reading taken before this file adds
-- its candidates. Synthetic rows only; everything rolls back.
begin;
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql

-- Organization a11b...9000-1, owner a11b...8000-1, work a11b...9000-2 with intake session
-- a11b...9000-3 and run a11b...9000-5 (support/legacy_resource_fixture.sql). A separate account is
-- bound to the recompute worker token; a second token stays unbound.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values
 ('a6a60000-0000-4000-8000-000000000009','authenticated','authenticated','recompute-health-worker@example.invalid','{}','{}',now(),now(),false,false);
insert into private.worker_tokens(id,label,token_sha256,execution_account_user_id) values
 ('a6a60000-0000-4000-9000-0000000000f0','Synthetic recompute health worker',extensions.digest('synthetic-recompute-health-worker-token','sha256'),'a6a60000-0000-4000-8000-000000000009'),
 ('a6a60000-0000-4000-9000-0000000000f1','Synthetic unbound worker',extensions.digest('synthetic-recompute-health-unbound-token','sha256'),null);
create temporary table health_case(name text primary key,value jsonb not null);
grant select on health_case to authenticated,anon;
create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_user::text,''),true);
 perform set_config('request.jwt.claims',case when p_user is null then '' else jsonb_build_object('sub',p_user,'role','authenticated','aal','aal1')::text end,true);
end $$;
insert into health_case values('baseline',private.dependency_recompute_health_v1());

-- An execution of the owner on the work, each with its own run.
create function pg_temp.execution(p_n integer) returns uuid language plpgsql as $$
declare x uuid:=('a6a60000-0000-4000-9000-0000000001'||lpad(p_n::text,2,'0'))::uuid;
begin
 insert into public.processing_runs(id,organization_id,intake_session_id,run_no,trigger,pipeline_version,created_by)
 values(x,'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000003',
  (select max(run_no)+1 from public.processing_runs where organization_id='a11b0000-0000-4000-9000-000000000001'),'manual','synthetic-recompute-health','a11b0000-0000-4000-8000-000000000001');
 insert into public.work_executions(id,organization_id,work_id,principal_id,request_id,processing_run_id)
 select x,'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002',p.id,x,x from private.principals p
 where p.organization_id='a11b0000-0000-4000-9000-000000000001' and p.user_id='a11b0000-0000-4000-8000-000000000001' and p.kind='human';
 return x;
end $$;
-- The root execution and the dependency-update request the synthetic candidates serve.
select pg_temp.execution(0);
insert into public.work_continuation_requests(id,organization_id,work_id,kind,payload,payload_fingerprint,affected_executions)
select 'a6a60000-0000-4000-9000-000000000200','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','dependency_update',
 b.body,private.continuation_fingerprint_v1(b.body),jsonb_build_array(jsonb_build_object('executionId','a6a60000-0000-4000-9000-000000000100',
  'rootExecutionId','a6a60000-0000-4000-9000-000000000100','resultMilestoneId',null))
from (select jsonb_build_object('schemaVersion','dependency-update-request.v1','workId','a11b0000-0000-4000-9000-000000000002','status','open',
 'affectedExecutionIds',jsonb_build_array('a6a60000-0000-4000-9000-000000000100'),
 'events',jsonb_build_array(jsonb_build_object('eventId','a6a60000-0000-4000-9000-000000000201','aggregateKind','source_version',
  'aggregateId','a6a60000-0000-4000-9000-000000000202','aggregateVersion',2)),
 'aggregateVersions',jsonb_build_array(jsonb_build_object('aggregateKind','source_version','aggregateId','a6a60000-0000-4000-9000-000000000202','version',2))) body) b;

-- One execution candidate of the root, in a state, last written p_age ago (created a day earlier).
create function pg_temp.candidate(p_name text,p_state text,p_execution uuid,p_age interval) returns uuid language plpgsql as $$
declare head jsonb:=jsonb_build_object('schemaVersion','continuation-input-identity.v1','inputs',jsonb_build_array(jsonb_build_array('synthetic',p_name)));
 fp text:=private.continuation_fingerprint_v1(head);waits boolean:=p_state='awaiting_authorization';c uuid;
begin
 insert into public.work_recompute_candidates(organization_id,work_id,request_id,idempotency_key,base_execution_id,new_input_fingerprint,head_inputs,action,
  max_cost_microusd,max_model_calls,execution_ids,state,reason,execution_id,created_at,updated_at)
 values('a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','a6a60000-0000-4000-9000-000000000200',
  private.dependency_recompute_key_v1('a11b0000-0000-4000-9000-000000000002','a6a60000-0000-4000-9000-000000000100',fp),'a6a60000-0000-4000-9000-000000000100',fp,head,
  case when waits then 'await_authorization' else 'recompute' end,case when waits then 1000 else 0 end,0,array['a6a60000-0000-4000-9000-000000000100'::uuid],
  p_state,case when p_state in ('declined','failed') then 'synthetic_'||p_state end,p_execution,clock_timestamp()-p_age-interval '1 day',clock_timestamp()-p_age)
 returning id into c;
 insert into health_case values(p_name,to_jsonb(c));
 return c;
end $$;
-- The worker's lease on a candidate: p_attempts claims, the last one expiring at p_expiry from now.
create function pg_temp.lease(p_name text,p_attempts integer,p_expiry interval) returns void language sql as $$
 insert into private.work_recompute_leases(organization_id,candidate_id,lease_id,capability_sha256,leased_by,leased_account_user_id,lease_expires_at,attempts)
 select 'a11b0000-0000-4000-9000-000000000001',(value#>>'{}')::uuid,gen_random_uuid(),extensions.digest(p_name,'sha256'),'a6a60000-0000-4000-9000-0000000000f0',
  'a6a60000-0000-4000-8000-000000000009',clock_timestamp()+p_expiry,p_attempts from health_case where name=p_name;
$$;
create function pg_temp.delta(p_key text) returns bigint language sql as $$
 select (private.dependency_recompute_health_v1()->>p_key)::bigint-(select (value->>p_key)::bigint from health_case where name='baseline');
$$;

-- 1. Execution candidates (3B, 4). Scheduled: waiting for a claim (10 min), claimed once with the
-- lease expired 30 s ago (1 h, the oldest), claimed with a live lease (2 min), produced with its
-- execution attached and a lease that has since expired (3 min), and a first claim that stopped
-- before leasing (attempt 0, no lease). Awaiting a person for ten days; settled, declined and failed
-- long ago, the failed one with the lease of its last attempt expired.
select pg_temp.candidate('waiting','scheduled',null,interval '10 minutes');
select pg_temp.candidate('expired','scheduled',null,interval '1 hour');
select pg_temp.lease('expired',1,interval '-30 seconds');
select pg_temp.candidate('leased','scheduled',null,interval '2 minutes');
select pg_temp.lease('leased',1,interval '90 seconds');
select pg_temp.candidate('produced','scheduled',pg_temp.execution(1),interval '3 minutes');
select pg_temp.lease('produced',1,interval '-60 seconds');
select pg_temp.candidate('unleased','scheduled',null,interval '4 minutes');
insert into private.work_recompute_leases(organization_id,candidate_id) select 'a11b0000-0000-4000-9000-000000000001',(value#>>'{}')::uuid from health_case where name='unleased';
select pg_temp.candidate('waiting_person','awaiting_authorization',null,interval '10 days');
select pg_temp.candidate('settled','settled',pg_temp.execution(2),interval '20 days');
select pg_temp.candidate('declined','declined',null,interval '30 days');
select pg_temp.candidate('failed','failed',null,interval '40 days');
select pg_temp.lease('failed',5,interval '-40 days');
do $$ declare h jsonb:=private.dependency_recompute_health_v1();base jsonb:=(select value from health_case where name='baseline');
begin
 if pg_temp.delta('scheduledCount')<>5 or pg_temp.delta('expiredLeaseCount')<>1 or pg_temp.delta('awaitingAuthorizationCount')<>1 then
  raise exception 'execution candidates counted wrong: % over %',h,base;
 end if;
 -- The oldest wait is the expired lease's candidate, one hour; the person's ten days and the terminal
 -- candidates are not a recompute backlog.
 if (h->>'oldestScheduledSeconds')::bigint<3600 or ((base->>'scheduledCount')::bigint=0 and (h->>'oldestScheduledSeconds')::bigint>=3660) then
  raise exception 'oldest scheduled age is not the one-hour candidate: %',h;
 end if;
 raise notice 'PASS: execution candidates: five scheduled, one expired lease without its execution, one awaiting a person, the oldest scheduled wait one hour';
end $$;

-- 2. A lease that keeps expiring never resets the age: a second claim, expired again, leaves the
-- candidate's updated_at and therefore the oldest age where they were.
update private.work_recompute_leases set attempts=2,lease_expires_at=clock_timestamp()-interval '5 seconds'
where candidate_id=(select (value#>>'{}')::uuid from health_case where name='expired');
do $$ declare h jsonb:=private.dependency_recompute_health_v1();base jsonb:=(select value from health_case where name='baseline');
begin
 if pg_temp.delta('expiredLeaseCount')<>1 or (h->>'oldestScheduledSeconds')::bigint<3600
 or ((base->>'scheduledCount')::bigint=0 and (h->>'oldestScheduledSeconds')::bigint>=3660) then
  raise exception 'a new lease changed the age or the count: %',h;
 end if;
 raise notice 'PASS: a lease expiring again keeps the candidate and its one-hour age';
end $$;

-- 3. An institutional candidate (5A) scheduled for an hour and a half is the oldest; a settled one is
-- not counted. The institutional result it recomputes is synthetic, on a configuration under review;
-- a first result takes the id of the message that asked for it (the fixture's question).
insert into private.institutional_model_configurations(id,organization_id,capital_project_id,revision,configuration,configuration_fingerprint,status)
values('a6a60000-0000-4000-9000-000000000300','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002',1,'{"synthetic":true}',repeat('3',64),'review_required');
insert into private.institutional_model_results(id,organization_id,capital_project_id,intake_session_id,configuration_id,configuration_fingerprint,source_manifest_fingerprint,requested_by)
values('a11b0000-0000-4000-9000-000000000007','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000003',
 'a6a60000-0000-4000-9000-000000000300',repeat('3',64),repeat('4',64),'a11b0000-0000-4000-8000-000000000001');
insert into public.institutional_recompute_candidates(organization_id,work_id,request_id,idempotency_key,base_result_id,new_input_fingerprint,head_inputs,result_ids,
 requested_by,state,reason,created_at,updated_at)
select 'a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000002','a6a60000-0000-4000-9000-000000000200',
 private.dependency_recompute_key_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000007',private.continuation_fingerprint_v1(x.head)),
 'a11b0000-0000-4000-9000-000000000007',private.continuation_fingerprint_v1(x.head),x.head,array['a11b0000-0000-4000-9000-000000000007'::uuid],
 'a11b0000-0000-4000-8000-000000000001',x.state,x.reason,clock_timestamp()-x.age-interval '1 day',clock_timestamp()-x.age
from (values('scheduled',null,interval '90 minutes','institutional-scheduled'),('declined','synthetic_declined',interval '50 days','institutional-declined')) x0(state,reason,age,name)
cross join lateral (select x0.*,jsonb_build_object('schemaVersion','continuation-input-identity.v1','inputs',jsonb_build_array(jsonb_build_array('synthetic',x0.name))) head) x;
do $$ declare h jsonb:=private.dependency_recompute_health_v1();base jsonb:=(select value from health_case where name='baseline');
begin
 if pg_temp.delta('scheduledCount')<>6 or pg_temp.delta('expiredLeaseCount')<>1 or pg_temp.delta('awaitingAuthorizationCount')<>1
 or (h->>'oldestScheduledSeconds')::bigint<5400 or ((base->>'scheduledCount')::bigint=0 and (h->>'oldestScheduledSeconds')::bigint>=5460) then
  raise exception 'institutional candidate counted wrong: % over %',h,base;
 end if;
 raise notice 'PASS: a scheduled institutional candidate is counted and, at an hour and a half, is the oldest wait';
end $$;

-- 4. The age runs from the moment a candidate entered its current wait: a person authorizing the
-- candidate that waited ten days schedules it now, so the count moves and the oldest age does not.
update public.work_recompute_candidates set state='scheduled',revision=revision+1
where id=(select (value#>>'{}')::uuid from health_case where name='waiting_person');
do $$ declare h jsonb:=private.dependency_recompute_health_v1();base jsonb:=(select value from health_case where name='baseline');
begin
 if pg_temp.delta('scheduledCount')<>7 or pg_temp.delta('awaitingAuthorizationCount')<>0
 or (h->>'oldestScheduledSeconds')::bigint<5400 or ((base->>'scheduledCount')::bigint=0 and (h->>'oldestScheduledSeconds')::bigint>=5460) then
  raise exception 'authorizing an old candidate moved the age: %',h;
 end if;
 raise notice 'PASS: authorizing a candidate that waited ten days for a person adds a scheduled candidate without a ten-day age';
end $$;
insert into health_case values('full',private.dependency_recompute_health_v1());

-- 5. Counts and ages only: exactly four non-negative integers, nothing that names a tenant.
do $$ declare h jsonb:=(select value from health_case where name='full');
begin
 if array(select jsonb_object_keys(h) order by 1)<>array['awaitingAuthorizationCount','expiredLeaseCount','oldestScheduledSeconds','scheduledCount']
 or exists(select 1 from jsonb_each(h) e where jsonb_typeof(e.value)<>'number' or (e.value#>>'{}')::numeric<0 or (e.value#>>'{}')::numeric<>trunc((e.value#>>'{}')::numeric)) then
  raise exception 'health is not four non-negative integers: %',h;
 end if;
 raise notice 'PASS: the health carries four non-negative integers and no identifier';
end $$;

-- 6. The worker entry point: the bound worker account reads the same numbers; a person, the worker
-- account with an unbound or revoked token and anon are refused.
select pg_temp.act_as('a6a60000-0000-4000-8000-000000000009');
set local role authenticated;
do $$ declare h jsonb;f jsonb:=(select value from health_case where name='full');
begin
 h:=public.worker_dependency_recompute_health_v1('synthetic-recompute-health-worker-token');
 if h-'oldestScheduledSeconds'<>f-'oldestScheduledSeconds' or (h->>'oldestScheduledSeconds')::bigint<(f->>'oldestScheduledSeconds')::bigint then
  raise exception 'worker read differs from the reader: % vs %',h,f;
 end if;
 begin
  perform public.worker_dependency_recompute_health_v1('synthetic-recompute-health-unbound-token');
  raise exception 'an unbound token read the health';
 exception when insufficient_privilege then if sqlerrm<>'worker_account_binding_required' then raise; end if;
 end;
 begin
  perform public.worker_dependency_recompute_health_v1('not-a-worker-token-but-long-enough-000');
  raise exception 'an unknown token read the health';
 exception when insufficient_privilege then if sqlerrm<>'worker_token_invalid' then raise; end if;
 end;
 begin
  perform private.dependency_recompute_health_v1();
  raise exception 'the worker account called the closed reader';
 exception when insufficient_privilege then null;
 end;
 raise notice 'PASS: the bound worker account reads the health; unbound and unknown tokens and the closed reader are refused';
end $$;
reset role;
select pg_temp.act_as('a11b0000-0000-4000-8000-000000000001');
set local role authenticated;
do $$ begin
 begin
  perform public.worker_dependency_recompute_health_v1('synthetic-recompute-health-worker-token');
  raise exception 'a person read the health with the worker token';
 exception when insufficient_privilege then if sqlerrm<>'worker_account_binding_required' then raise; end if;
 end;
 raise notice 'PASS: a person holding the worker token is not the worker account';
end $$;
reset role;
update private.worker_tokens set status='revoked',revoked_at=clock_timestamp() where id='a6a60000-0000-4000-9000-0000000000f0';
select pg_temp.act_as('a6a60000-0000-4000-8000-000000000009');
set local role authenticated;
do $$ begin
 begin
  perform public.worker_dependency_recompute_health_v1('synthetic-recompute-health-worker-token');
  raise exception 'a revoked token read the health';
 exception when insufficient_privilege then null;
 end;
 raise notice 'PASS: a revoked worker token is refused';
end $$;
reset role;
select pg_temp.act_as(null);
set local role anon;
do $$ begin
 begin
  perform public.worker_dependency_recompute_health_v1('synthetic-recompute-health-worker-token');
  raise exception 'anon read the health';
 exception when insufficient_privilege then null;
 end;
 raise notice 'PASS: anon cannot call the worker entry point';
end $$;
reset role;

-- 7. Grants and shape: the reader closed to every API role; the entry point and its core to
-- authenticated only; security invoker over security definer with an empty search path; volatile,
-- because the worker binding writes; and the capability the worker image requires.
do $$ declare role_name text;
begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(role_name,'private.dependency_recompute_health_v1()','EXECUTE') then raise exception 'reader exposed to %',role_name; end if;
 end loop;
 foreach role_name in array array['anon','service_role'] loop
  if has_function_privilege(role_name,'public.worker_dependency_recompute_health_v1(text)','EXECUTE')
  or has_function_privilege(role_name,'private.worker_dependency_recompute_health_v1(text)','EXECUTE') then raise exception 'health entry exposed to %',role_name; end if;
 end loop;
 if not has_function_privilege('authenticated','public.worker_dependency_recompute_health_v1(text)','EXECUTE')
 or (select prosecdef or provolatile<>'v' from pg_proc where oid='public.worker_dependency_recompute_health_v1(text)'::regprocedure)
 or exists(select 1 from pg_proc where oid in ('private.worker_dependency_recompute_health_v1(text)'::regprocedure,'private.dependency_recompute_health_v1()'::regprocedure)
  and not (prosecdef and provolatile='v' and proconfig @> array['search_path=""']))
 or not (public.worker_runtime_schema_contract_v1()->'capabilities') ? 'dependency-recompute-health.v1' then
  raise exception 'health grants, security or capability mismatch';
 end if;
 raise notice 'PASS: reader closed to every API role; entry point authenticated only, invoker over definer; capability dependency-recompute-health.v1 listed';
end $$;

rollback;
