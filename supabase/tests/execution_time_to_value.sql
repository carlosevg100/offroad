-- Disposable synthetic proof: time to the first useful response and to the verified result, without content. The reader leaves one receipt per reader for the first read without the result bytes and one for the first read with them, and nothing after; another participant's read is recorded and never verifies; a partial marker is not a useful response; a free-text reason never reaches the view; a blocked gate receipt or stale inputs leave a result unverified; the view carries only ids, stamps, intervals, booleans, a bigint and codes, and nothing reaches anon, authenticated or service_role.
begin;
\ir support/contextual_adoption_setup.sql
\ir support/execution_method_fixture.sql
insert into private.platform_principals(user_id,role,label) values('a11b0000-0000-4000-8000-000000000001','founder','Synthetic founder');
create function pg_temp.expect_ttv_error(command text,expected text,test_name text) returns void language plpgsql as $$
begin
 begin execute command;exception when others then
  if sqlerrm=expected then raise notice 'PASS: %',test_name;return;end if;raise;
 end;raise exception 'Missing expected rejection: %',test_name;
end $$;
select public.adopt_observation_for_work_v1(current_setting('test.adoption.payload')::jsonb);
-- The fixture organization has no founder member, so enabling its producer is the founder's act; the operator's pause path is proven in execution_producer_authority.sql.
select private.grant_execution_producer_v1('c4173000-0000-4000-9000-000000000031','a11b0000-0000-4000-9000-000000000001',true,'Synthetic producer grant by the founder','a11b0000-0000-4000-8000-000000000001');
-- Four executions of the fixture work: x1 through the v2 producer with the gates text execution_gates.sql uses (pinned byte for byte by execution-gates.test.ts), x2 to x4 through v1.
create temporary table ttv_fixture(basis jsonb,gates text);
create temporary table ttv_runs(label text primary key,execution_id uuid not null unique,request jsonb,claim jsonb);
create temporary table ttv_reads(step integer primary key,label text not null,reader uuid not null,version integer not null,response jsonb not null);
grant select,insert,update on ttv_fixture,ttv_runs,ttv_reads to authenticated;
insert into ttv_fixture(gates) values('{"blocked":false,"companyRegistration":"registered","conventions":[{"effective":"approved","key":"iof.rate","status":"approved","version":"2026.09.05-v9"},{"effective":"gap","key":"anbima.curve","status":null,"version":null}],"gatesVersion":"2026.09.24-v1","methodSelection":{"methodId":"synthetic-execution","methodVersion":"test-v1","selectionVersion":"2026.09.24-v1","situationIds":["refinancing","near-covenant"]},"research":"recorded","schemaVersion":"execution-gates.v1","voice":{"blockCount":0,"version":"2026.09.24-v1","warnCount":2}}');
insert into ttv_runs(label,execution_id) values('x1','a417d000-0000-4000-9000-000000000001'),('x2','a417d000-0000-4000-9000-000000000002'),('x3','a417d000-0000-4000-9000-000000000003'),('x4','a417d000-0000-4000-9000-000000000004');
-- The contract comes from the server-assembled basis exactly as in 4A, one per execution id.
create function pg_temp.ttv_contract(p_execution uuid) returns text language sql as $$
 select jsonb_build_object('schemaVersion','execution-contract.v1','executionId',p_execution,'organizationId',basis->>'organizationId','workId',basis->>'workId','principalId',basis->>'principalId',
  'requestId',p_execution,'processingRunId',p_execution,'purpose',basis->>'purpose','method',basis#>'{profile,method}','tools',basis#>'{profile,tools}','allowedEffects',basis#>'{profile,allowedEffects}',
  'audience',jsonb_build_object('kind','work_participants','workId',basis->>'workId','policyFingerprint',basis->>'policyFingerprint'),
  'policy',jsonb_build_object('version','execution-authority.v1','authorityRevision',basis->>'authorityRevision','fingerprint',basis->>'policyFingerprint'),
  'inputs',jsonb_build_object('snapshotId',p_execution,'fingerprint',encode(extensions.digest('{}','sha256'),'hex'),'sources',basis->'sources','adoptions',basis->'adoptions','hypotheses',basis->'hypotheses'),
  'budget',jsonb_build_object('maxCostMicrousd',0,'maxModelCalls',0,'maxDurationMs',31000,'expiresAt',clock_timestamp()+interval '1 hour'),'requestedAt',clock_timestamp())::text
 from ttv_fixture;
$$;
-- A read through the public v1 or v2 wrapper as the current subject, kept for the comparison with the receipts.
create function pg_temp.ttv_read(p_step integer,p_label text,p_version integer default 1) returns jsonb language plpgsql as $$
declare x uuid;r jsonb;begin
 select execution_id into strict x from ttv_runs where label=p_label;
 if p_version=2 then r:=public.read_work_execution_v2(x);else r:=public.read_work_execution_v1(x);end if;
 insert into ttv_reads(step,label,reader,version,response) values(p_step,p_label,auth.uid(),p_version,r);
 return r;
end $$;
-- The worker's commit: the pinned kernel is reserved and settled first when the outcome is a success.
create function pg_temp.ttv_commit(p_label text,p_result text,p_outcome text,p_reason text) returns jsonb language plpgsql as $$
declare x ttv_runs;job uuid;cap text;lease uuid;begin
 select * into strict x from ttv_runs where label=p_label;
 job:=(x.request->>'jobId')::uuid;cap:=x.claim->>'capability';lease:=(x.claim->>'leaseId')::uuid;
 if p_outcome='succeeded' then
  perform private.reserve_execution_operation_v1(job,cap,lease,x.execution_id,repeat('a',64),'synthetic#calculate','test-v1','read_only',0,0);
  perform private.settle_execution_operation_v2(job,cap,lease,x.execution_id,repeat('a',64),p_result,'succeeded','calculated',0,0);
 end if;
 return private.commit_work_execution_result_v1(job,cap,lease,x.claim->>'contractFingerprint',encode(extensions.digest('{}','sha256'),'hex'),p_result,p_outcome,p_reason);
end $$;
set local role authenticated;
update ttv_fixture set basis=public.execution_contract_basis_v1('a11b0000-0000-4000-9000-000000000002','a9990000-0000-4000-9000-000000000003','synthetic-execution');
update ttv_runs set request=public.request_work_execution_v2(pg_temp.ttv_contract(execution_id),'{}',(select gates from ttv_fixture)) where label='x1';
update ttv_runs set request=public.request_work_execution_v1(pg_temp.ttv_contract(execution_id),'{}') where label<>'x1';

-- 1. A read before the result exists records bytes_returned=false, and the view has only the request.
select pg_temp.ttv_read(1,'x1');
reset role;
do $$declare x uuid;rr private.execution_read_receipts;v private.execution_time_to_value;begin
 select execution_id into strict x from ttv_runs where label='x1';
 if (select count(*) from ttv_runs where request->>'executionId'=execution_id::text)<>4 then raise exception 'fixture requests wrong';end if;
 if (select response->'result' from ttv_reads where step=1)<>'null'::jsonb or not (select (response->>'inputsCurrent')::boolean from ttv_reads where step=1) then raise exception 'x1 read before the result wrong';end if;
 select * into strict rr from private.execution_read_receipts where execution_id=x;
 if rr.organization_id<>'a11b0000-0000-4000-9000-000000000001' or rr.subject_user_id<>'a11b0000-0000-4000-8000-000000000001' or rr.bytes_returned or not rr.inputs_current
 then raise exception 'receipt of the read before the result wrong: %',to_jsonb(rr);end if;
 select * into strict v from private.execution_time_to_value where execution_id=x;
 if v.requested_at is distinct from (select created_at from public.work_executions where id=x) or v.work_id<>'a11b0000-0000-4000-9000-000000000002'
 or v.claimed_at is not null or v.committed_at is not null or v.first_useful_at is not null or v.verified_at is not null
 or v.time_in_queue is not null or v.time_to_first_useful is not null or v.time_to_verified is not null or v.active_duration_ms is not null
 or v.outcome is not null or v.reason is not null or v.gates_blocked is distinct from false then raise exception 'view before the claim wrong: %',to_jsonb(v);end if;
 raise notice 'PASS: a read before the result exists records bytes_returned=false and the view shows only the request';
end $$;

-- 2. The claim stamps the queue time; the commits give a success (x1, x4), a partial marker (x2) and a partial with a free-text reason through the private command, which the worker wrapper would refuse (x3).
update ttv_runs set claim=private.claim_work_execution_v1('synthetic-policy-worker-fixture-token-v1',(request->>'jobId')::uuid,60);
do $$declare v private.execution_time_to_value;begin
 if exists(select 1 from ttv_runs where not coalesce((claim->>'claimed')::boolean,false)) then raise exception 'a fixture execution was not claimed';end if;
 select * into strict v from private.execution_time_to_value where execution_id='a417d000-0000-4000-9000-000000000001';
 if v.claimed_at is null or v.claimed_at is distinct from (select started_at from public.processing_runs where id='a417d000-0000-4000-9000-000000000001')
 or v.time_in_queue is distinct from v.claimed_at-v.requested_at or v.time_in_queue<interval '0' or v.committed_at is not null then raise exception 'view after the claim wrong: %',to_jsonb(v);end if;
 raise notice 'PASS: the claim stamps claimed_at and the time in queue';
end $$;
select pg_temp.ttv_commit('x1','{"calculation":"synthetic"}','succeeded','calculated');
select pg_temp.ttv_commit('x2','{"calculation":"failed"}','partial','calculation_failed');
select pg_temp.ttv_commit('x3','{"calculation":"partial"}','partial','Synthetic free text reason that must never reach telemetry');
select pg_temp.ttv_commit('x4','{"calculation":"synthetic"}','succeeded','calculated');
-- The v2 producer refuses blocked gates, so a blocked receipt is written here directly, on x3 (requested without gates), only to prove the view's rule.
insert into private.execution_gate_receipts(organization_id,execution_id,gates_version,canonical_gates,gates_fingerprint,blocked)
select 'a11b0000-0000-4000-9000-000000000001',t.execution_id,'2026.09.24-v1',g.canonical,encode(extensions.digest(convert_to(g.canonical,'UTF8'),'sha256'),'hex'),true
from ttv_runs t cross join (select replace(gates,'"blocked":false','"blocked":true') canonical from ttv_fixture) g where t.label='x3';

-- 3. Another participant reads the result first, then the requester reads it through v2.
set local role authenticated;
select public.grant_resource_access_v1('a11b0000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002','read');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
select pg_temp.ttv_read(2,'x1');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select pg_temp.ttv_read(3,'x1',2);
reset role;
create temporary table ttv_x1_receipts as select * from private.execution_read_receipts where execution_id='a417d000-0000-4000-9000-000000000001';
do $$declare requester_bytes private.execution_read_receipts;other private.execution_read_receipts;v private.execution_time_to_value;begin
 if not coalesce((select (response->'result') ? 'canonicalResult' from ttv_reads where step=3),false) or (select response->'gates' from ttv_reads where step=3)='null'::jsonb then raise exception 'v2 read after the commit did not return the bytes and the gates';end if;
 select * into strict requester_bytes from private.execution_read_receipts where execution_id='a417d000-0000-4000-9000-000000000001' and subject_user_id='a11b0000-0000-4000-8000-000000000001' and bytes_returned;
 if not requester_bytes.inputs_current then raise exception 'bytes returned on stale inputs';end if;
 select * into strict other from private.execution_read_receipts where execution_id='a417d000-0000-4000-9000-000000000001' and subject_user_id='a11b0000-0000-4000-8000-000000000002';
 if other.bytes_returned is distinct from coalesce((select (response->'result') ? 'canonicalResult' from ttv_reads where step=2),false) or other.first_read_at>=requester_bytes.first_read_at
 then raise exception 'participant receipt wrong: %',to_jsonb(other);end if;
 select * into strict v from private.execution_time_to_value where execution_id='a417d000-0000-4000-9000-000000000001';
 if v.verified_at is distinct from requester_bytes.first_read_at or v.verified_at=other.first_read_at then raise exception 'verified_at is not the requester''s first read of the bytes: %',to_jsonb(v);end if;
 raise notice 'PASS: the requester''s first read after a succeeded commit records bytes_returned=true and verifies the result';
 raise notice 'PASS: a second participant''s read (bytes_returned=%) is recorded under that subject and never counts as verified, even read first',other.bytes_returned;
end $$;

-- 4. Later reads through either reader and by either subject add no rows and move no stamp.
set local role authenticated;
select pg_temp.ttv_read(4,'x1');
select pg_temp.ttv_read(5,'x1',2);
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000002',true);
select pg_temp.ttv_read(6,'x1');
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
select pg_temp.ttv_read(7,'x2');
select pg_temp.ttv_read(8,'x3');
reset role;
do $$begin
 if (select count(*) from ttv_x1_receipts)<>3 or exists((select * from private.execution_read_receipts where execution_id='a417d000-0000-4000-9000-000000000001' except select * from ttv_x1_receipts)
  union all (select * from ttv_x1_receipts except select * from private.execution_read_receipts where execution_id='a417d000-0000-4000-9000-000000000001'))
 then raise exception 'later reads changed the receipts';end if;
 raise notice 'PASS: later reads add no rows and keep the first read';
end $$;

-- 5. Stale inputs: once the source rights no longer allow processing, the requester's first read of x4 is withheld and x1 is read again without bytes.
select private.set_source_rights_v1('a11b0000-0000-4000-9000-000000000004',1,array['read','store'],array['analysis','retrieval'],null,null,gen_random_uuid(),repeat('c',64));
set local role authenticated;
select pg_temp.ttv_read(9,'x4');
select pg_temp.ttv_read(10,'x1');
reset role;

-- 6. Every receipt is the first read per reader, execution and bytes state, with the inputs state of that read, and nothing else.
do $$declare diff integer;begin
 if (select response#>>'{result,withheld}' from ttv_reads where step=9)<>'inputs_not_current' then raise exception 'x4 read was not withheld';end if;
 with first_reads as (
  select distinct on (r.label,r.reader,coalesce((r.response->'result') ? 'canonicalResult',false))
   t.execution_id,r.reader,coalesce((r.response->'result') ? 'canonicalResult',false) bytes,(r.response->>'inputsCurrent')::boolean inputs_current
  from ttv_reads r join ttv_runs t on t.label=r.label
  order by r.label,r.reader,coalesce((r.response->'result') ? 'canonicalResult',false),r.step),
 receipts as (
  select x.execution_id,x.subject_user_id,x.bytes_returned,x.inputs_current from private.execution_read_receipts x join ttv_runs t on t.execution_id=x.execution_id)
 select count(*) into diff from ((select * from first_reads except select * from receipts) union all (select * from receipts except select * from first_reads)) d;
 if diff<>0 or (select count(*) from private.execution_read_receipts x join ttv_runs t on t.execution_id=x.execution_id)<>6 then raise exception 'receipts are not exactly the first reads';end if;
 raise notice 'PASS: bytes_returned is true exactly when the read carried canonicalResult, and only the first read per reader and bytes state is kept';
end $$;

-- 7. The view per execution: the intervals, the partial marker, the blocked gate and the stale read.
do $$declare v private.execution_time_to_value;e public.work_executions;run public.processing_runs;rr private.execution_result_receipts;verified timestamptz;begin
 select * into strict v from private.execution_time_to_value where execution_id='a417d000-0000-4000-9000-000000000001';
 select * into strict e from public.work_executions where id=v.execution_id;
 select * into strict run from public.processing_runs where id=e.processing_run_id;
 select * into strict rr from private.execution_result_receipts where execution_id=v.execution_id;
 select first_read_at into strict verified from private.execution_read_receipts where execution_id=v.execution_id and subject_user_id='a11b0000-0000-4000-8000-000000000001' and bytes_returned;
 if v.organization_id<>e.organization_id or v.work_id<>e.work_id or v.outcome<>'succeeded' or v.reason<>'calculated' or v.gates_blocked
 or v.requested_at<>e.created_at or v.claimed_at<>run.started_at or v.committed_at<>rr.created_at or v.first_useful_at<>rr.created_at or v.verified_at<>verified
 or v.time_in_queue<>run.started_at-e.created_at or v.time_to_first_useful<>rr.created_at-e.created_at or v.time_to_verified<>verified-e.created_at
 or v.time_in_queue<interval '0' or v.time_to_first_useful<interval '0' or v.time_to_verified<=interval '0'
 or v.active_duration_ms<>(run.usage->>'activeDurationMs')::bigint
 or v.active_duration_ms<>(select active_duration_ms from private.execution_budget_accounts where execution_id=v.execution_id) or v.active_duration_ms<0
 then raise exception 'x1 intervals wrong: %',to_jsonb(v);end if;
 raise notice 'PASS: the view returns the request, claim, commit, first useful and verified stamps, their intervals and the active duration';
 select * into strict v from private.execution_time_to_value where execution_id='a417d000-0000-4000-9000-000000000002';
 if v.outcome<>'partial' or v.reason<>'calculation_failed' or v.committed_at is null or v.first_useful_at is not null or v.time_to_first_useful is not null
 or v.gates_blocked is not null or v.verified_at is null then raise exception 'x2 partial marker wrong: %',to_jsonb(v);end if;
 raise notice 'PASS: a partial marker leaves first_useful_at null; read by its requester it is a verified result that is not a useful response';
 select * into strict v from private.execution_time_to_value where execution_id='a417d000-0000-4000-9000-000000000003';
 if v.outcome<>'partial' or v.reason is not null or not v.gates_blocked or v.verified_at is not null or v.time_to_verified is not null
 or not exists(select 1 from private.execution_read_receipts where execution_id=v.execution_id and subject_user_id='a11b0000-0000-4000-8000-000000000001' and bytes_returned)
 then raise exception 'x3 blocked gate or free-text reason wrong: %',to_jsonb(v);end if;
 raise notice 'PASS: a blocked gate receipt keeps a read result unverified, and a free-text reason shows as null';
 select * into strict v from private.execution_time_to_value where execution_id='a417d000-0000-4000-9000-000000000004';
 if v.outcome<>'succeeded' or v.first_useful_at is null or v.verified_at is not null
 or not exists(select 1 from private.execution_read_receipts where execution_id=v.execution_id and subject_user_id='a11b0000-0000-4000-8000-000000000001' and not bytes_returned and not inputs_current)
 then raise exception 'x4 stale read wrong: %',to_jsonb(v);end if;
 raise notice 'PASS: a useful response read only on stale inputs is not verified';
end $$;

-- 8. The view and the receipts carry ids, stamps, intervals, booleans, a bigint and codes only; each text column takes only values its source constrains.
do $$declare cols text;outcomes text[];reasons text[];allowed text[];begin
 select string_agg(attname||' '||format_type(atttypid,atttypmod),', ' order by attnum) into cols from pg_attribute where attrelid='private.execution_time_to_value'::regclass and attnum>0 and not attisdropped;
 if cols<>'organization_id uuid, execution_id uuid, work_id uuid, method_id text, method_version text, outcome text, reason text, gates_blocked boolean, requested_at timestamp with time zone, claimed_at timestamp with time zone, committed_at timestamp with time zone, first_useful_at timestamp with time zone, verified_at timestamp with time zone, time_in_queue interval, time_to_first_useful interval, time_to_verified interval, active_duration_ms bigint'
 then raise exception 'view columns are not the telemetry contract: %',cols;end if;
 select string_agg(attname||' '||format_type(atttypid,atttypmod),', ' order by attnum) into cols from pg_attribute where attrelid='private.execution_read_receipts'::regclass and attnum>0 and not attisdropped;
 if cols<>'organization_id uuid, execution_id uuid, subject_user_id uuid, inputs_current boolean, bytes_returned boolean, first_read_at timestamp with time zone'
 then raise exception 'receipt columns are not the telemetry contract: %',cols;end if;
 if exists(select 1 from pg_attribute where attrelid in ('private.execution_time_to_value'::regclass,'private.execution_read_receipts'::regclass) and attnum>0 and not attisdropped
  and format_type(atttypid,atttypmod) not in ('uuid','text','boolean','timestamp with time zone','interval','bigint')) then raise exception 'a column outside uuid, text code, boolean, timestamptz, interval and bigint';end if;
 select array_agg(m[1] order by m[1]) into outcomes from pg_constraint c cross join lateral regexp_matches(pg_get_constraintdef(c.oid),'''([a-z_]+)''::text','g') m
  where c.conrelid='private.execution_result_receipts'::regclass and c.conname='execution_result_receipts_outcome_check';
 select array_agg(m[1] order by m[1]) into reasons from pg_constraint c cross join lateral regexp_matches(pg_get_constraintdef(c.oid),'''([a-z_]+)''::text','g') m
  where c.conrelid='private.execution_operation_receipts'::regclass and c.conname='execution_operation_receipts_settled_reason_check';
 select array_agg(m[1] order by m[1]) into allowed from regexp_matches(substring(pg_get_viewdef('private.execution_time_to_value'::regclass) from 'result\.reason = ANY \(ARRAY\[([^]]*)\]'),'''([a-z_]+)''::text','g') m;
 if coalesce(cardinality(outcomes),0)<>2 or coalesce(cardinality(reasons),0)<>5 or allowed is distinct from reasons then raise exception 'the view''s reason codes are not the constrained codes: % % %',outcomes,reasons,allowed;end if;
 if exists(select 1 from private.execution_time_to_value v join ttv_runs t on t.execution_id=v.execution_id
  where not v.outcome=any(outcomes) or (v.reason is not null and not v.reason=any(reasons))
  or not exists(select 1 from private.platform_method_releases r where r.id='synthetic-execution-test-v1' and r.method_id=v.method_id and r.version=v.method_version))
 then raise exception 'a text column carries a value outside its codes';end if;
 if exists(select 1 from private.execution_time_to_value v join ttv_runs t on t.execution_id=v.execution_id where to_jsonb(v)::text like '%free text%')
 or exists(select 1 from private.execution_read_receipts x join ttv_runs t on t.execution_id=x.execution_id where to_jsonb(x)::text like '%free text%') then raise exception 'free text reached the telemetry';end if;
 raise notice 'PASS: every column is a uuid, a text code, a boolean, a timestamptz, an interval or a bigint, and the text columns take only constrained codes and catalogue identifiers';
end $$;

-- 9. Neither the table nor the view is reachable by anon, authenticated or service_role.
do $$declare role_name text;rel text;begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  foreach rel in array array['private.execution_read_receipts','private.execution_time_to_value'] loop
   if has_table_privilege(role_name,rel,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception '% reaches %',role_name,rel;end if;
  end loop;
 end loop;
 if not exists(select 1 from pg_class where oid='private.execution_read_receipts'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'receipts without forced RLS';end if;
 if not exists(select 1 from pg_class where oid='private.execution_time_to_value'::regclass and 'security_invoker=true'=any(reloptions)) then raise exception 'view is not security invoker';end if;
end $$;
set local role authenticated;
do $$begin
 begin perform count(*) from private.execution_read_receipts;raise exception 'authenticated read receipts directly';exception when insufficient_privilege then null;end;
 begin perform count(*) from private.execution_time_to_value;raise exception 'authenticated read the telemetry';exception when insufficient_privilege then null;end;
 begin insert into private.execution_read_receipts(organization_id,execution_id,subject_user_id,inputs_current,bytes_returned) values('a11b0000-0000-4000-9000-000000000001','a417d000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000001',true,false);raise exception 'authenticated wrote a receipt directly';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin
 begin perform count(*) from private.execution_read_receipts;raise exception 'anon read receipts';exception when insufficient_privilege then null;end;
 begin perform count(*) from private.execution_time_to_value;raise exception 'anon read the telemetry';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$begin
 begin perform count(*) from private.execution_read_receipts;raise exception 'service_role read receipts';exception when insufficient_privilege then null;end;
 begin perform count(*) from private.execution_time_to_value;raise exception 'service_role read the telemetry';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin raise notice 'PASS: neither the receipts nor the view is reachable by anon, authenticated or service_role';end $$;

-- 10. A receipt is never updated, deleted or truncated, and bytes on stale inputs are refused.
select pg_temp.expect_ttv_error($q$update private.execution_read_receipts set inputs_current=false$q$,'contribution_revision_immutable','a read receipt cannot be updated');
select pg_temp.expect_ttv_error($q$delete from private.execution_read_receipts$q$,'contribution_revision_immutable','a read receipt cannot be deleted');
select pg_temp.expect_ttv_error($q$truncate private.execution_read_receipts$q$,'platform_ledger_immutable','read receipts cannot be truncated');
do $$declare c text;begin
 begin
  insert into private.execution_read_receipts(organization_id,execution_id,subject_user_id,inputs_current,bytes_returned)
  values('a11b0000-0000-4000-9000-000000000001','a417d000-0000-4000-9000-000000000002','a11b0000-0000-4000-8000-000000000002',false,true);
  raise exception 'bytes on stale inputs accepted';
 exception when check_violation then get stacked diagnostics c=constraint_name;if c<>'execution_read_receipts_bytes_check' then raise;end if;end;
 raise notice 'PASS: a receipt cannot claim bytes returned on stale inputs';
end $$;

-- 11. The readers keep their grants and security model, and the wrapper parity of rls_non_interference.sql still holds.
do $$declare role_name text;sig text;begin
 foreach sig in array array['public.read_work_execution_v1(uuid)','public.read_work_execution_v2(uuid)','private.read_work_execution_v1(uuid)','private.read_work_execution_v2(uuid)'] loop
  if not has_function_privilege('authenticated',sig,'EXECUTE') then raise exception 'reader lost its tenant grant: %',sig;end if;
  foreach role_name in array array['anon','service_role'] loop
   if has_function_privilege(role_name,sig,'EXECUTE') then raise exception 'reader exposed to %: %',role_name,sig;end if;
  end loop;
 end loop;
 if not exists(select 1 from pg_proc where oid='private.read_work_execution_v1(uuid)'::regprocedure and prosecdef and provolatile='v' and proconfig=array['search_path=""']) then raise exception 'v1 reader security model changed';end if;
end $$;
do $$
declare
  offending text;
begin
  select string_agg(w.proname, ', ' order by w.proname) into offending
  from (
    select wrapper.proname,
      coalesce(
        (select m[1] from regexp_matches(pg_get_functiondef(wrapper.oid), 'private\.([a-z0-9_]+)\s*\(', 'g') m limit 1),
        wrapper.proname
      ) as impl_name
    from pg_proc wrapper
    join pg_namespace wrapper_ns on wrapper_ns.oid = wrapper.pronamespace
    where wrapper_ns.nspname = 'public'
      and has_function_privilege('authenticated', wrapper.oid, 'execute')
  ) w
  where exists (
    select 1
    from pg_proc impl
    join pg_namespace impl_ns on impl_ns.oid = impl.pronamespace
    where impl_ns.nspname = 'private'
      and impl.proname = w.impl_name
      and not has_function_privilege('authenticated', impl.oid, 'execute')
  );

  if offending is not null then
    raise exception 'a public wrapper is granted while its private implementation is not: %', offending;
  end if;
  raise notice 'PASS: the readers keep their grants and every granted public wrapper still has its private implementation';
end;
$$;
select 'execution_time_to_value: PASS' result;
rollback;
