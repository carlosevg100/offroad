-- Disposable synthetic proof of the evaluator session entry point. All rows roll back; never production.
begin;
\ir support/governed_evaluation_fixture.sql
create temporary table session_proof(n serial primary key,line text not null);
create temporary table session_fixture(name text primary key,contract jsonb not null,response jsonb);
create function pg_temp.session_pass(p_line text) returns void language plpgsql security definer set search_path='' as $$
begin insert into pg_temp.session_proof(line) values('PASS: '||p_line);raise notice 'PASS: %',p_line;end $$;
-- A signed session of one user as PostgREST presents it; null is an anonymous request.
create function pg_temp.sign_in(p_user uuid) returns text language sql as $$
 select set_config('request.jwt.claim.sub',coalesce(p_user::text,''),true);
 select set_config('request.jwt.claims',case when p_user is null then '{"role":"anon"}' else jsonb_build_object('sub',p_user,'role','authenticated')::text end,true);
$$;
-- Fixture bytes are read through the owner, so a session never touches a temporary table directly.
create function pg_temp.contract_text(p_name text) returns text language sql security definer set search_path='' as $$
 select f.contract::text from pg_temp.session_fixture f where f.name=p_name;
$$;
create function pg_temp.keep_response(p_name text,p_response jsonb) returns void language sql security definer set search_path='' as $$
 update pg_temp.session_fixture set response=p_response where name=p_name;
$$;
create function pg_temp.expect_session_error(command text,expected text,test_name text) returns void language plpgsql as $$
begin
 begin execute command;exception when others then
  if sqlerrm=expected or (expected='permission_denied' and sqlstate='42501' and sqlerrm like 'permission denied%') then perform pg_temp.session_pass(test_name);return;end if;raise;
 end;raise exception 'Missing expected rejection: %',test_name;
end $$;
insert into session_fixture(name,contract) values
 ('a',pg_temp.evaluation_contract('e5a10000-0000-4000-c000-0000000000a1')),
 ('b',pg_temp.evaluation_contract('e5a10000-0000-4000-c000-0000000000b1')),
 ('actor',pg_temp.evaluation_contract('e5a10000-0000-4000-c000-0000000000c1')||'{"requestedBy":"e5a10000-0000-4000-8000-000000000004"}'::jsonb);

-- 1. Shape: security definer implementations in private, invoker wrappers in public, an empty search
-- path everywhere, and no argument that could name an actor.
do $$declare f record;seen integer:=0;begin
 for f in select p.oid,s.nspname,p.proname,p.prosecdef,p.proconfig,pg_get_function_identity_arguments(p.oid) args,l.lanname
 from pg_proc p join pg_namespace s on s.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 where s.nspname in ('public','private') and p.proname in ('request_governed_evaluation_session_v1','read_governed_evaluation_session_v1')
 loop
  seen:=seen+1;
  if f.prosecdef<>(f.nspname='private') or (f.nspname='public' and f.lanname<>'sql') or f.proconfig is distinct from array['search_path=""']
  then raise exception 'session command shape differs: %.%',f.nspname,f.proname;end if;
  if f.args<>(case f.proname when 'request_governed_evaluation_session_v1' then 'p_contract_text text, p_snapshot_text text' else 'p_execution_id uuid' end)
  then raise exception 'session command takes other arguments: %.%(%)',f.nspname,f.proname,f.args;end if;
 end loop;
 if seen<>4 then raise exception 'expected four session commands, found %',seen;end if;
 perform pg_temp.session_pass('definer implementations in private, invoker wrappers in public, empty search path, and no actor argument');
end $$;

-- 2. Grants: signed-in sessions reach the wrappers and their implementations; nobody else does, and
-- the operator commands they delegate to stay closed to every API role.
do $$declare f regprocedure;r text;begin
 foreach f in array array['public.request_governed_evaluation_session_v1(text,text)','public.read_governed_evaluation_session_v1(uuid)',
  'private.request_governed_evaluation_session_v1(text,text)','private.read_governed_evaluation_session_v1(uuid)']::regprocedure[] loop
  if not has_function_privilege('authenticated',f,'EXECUTE') then raise exception 'authenticated cannot execute %',f;end if;
  foreach r in array array['anon','service_role'] loop
   if has_function_privilege(r,f,'EXECUTE') then raise exception '% can execute %',r,f;end if;
  end loop;
  if exists(select 1 from pg_proc p,aclexplode(p.proacl) a where p.oid=f and a.grantee=0) then raise exception 'PUBLIC can execute %',f;end if;
 end loop;
 foreach f in array array['private.request_governed_evaluation_v1(text,text,uuid)','private.read_governed_evaluation_v1(uuid,uuid)',
  'private.platform_evaluator_live_v1(uuid)','private.require_platform_evaluator_v1(uuid)']::regprocedure[] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(r,f,'EXECUTE') then raise exception '% can execute the operator command %',r,f;end if;
  end loop;
 end loop;
 perform pg_temp.session_pass('only signed-in sessions reach the session commands; the operator commands stay closed to every API role');
end $$;

-- 3. Anonymous requests never reach the commands.
set local role anon;
select pg_temp.sign_in(null);
select pg_temp.expect_session_error($q$select public.request_governed_evaluation_session_v1(pg_temp.contract_text('a'),pg_temp.evaluation_snapshot())$q$,'permission_denied','an anonymous request cannot request an evaluation');
select pg_temp.expect_session_error($q$select public.read_governed_evaluation_session_v1('e5a10000-0000-4000-c000-0000000000a1')$q$,'permission_denied','an anonymous request cannot read an evaluation');
reset role;

-- 4. A signed-in session that is not a live evaluator is refused before anything is stored: a tenant
-- human, the worker account, an operator and the founder.
set local role authenticated;
select pg_temp.sign_in('e5a10000-0000-4000-8000-000000000005');
select pg_temp.expect_session_error($q$select public.request_governed_evaluation_session_v1(pg_temp.contract_text('a'),pg_temp.evaluation_snapshot())$q$,'evaluator_session_required','a tenant human cannot request an evaluation');
select pg_temp.expect_session_error($q$select public.read_governed_evaluation_session_v1('e5a10000-0000-4000-c000-0000000000a1')$q$,'evaluator_session_required','a tenant human cannot read an evaluation');
select pg_temp.expect_session_error($q$select private.request_governed_evaluation_session_v1(pg_temp.contract_text('a'),pg_temp.evaluation_snapshot())$q$,'evaluator_session_required','the implementation refuses a tenant human called directly');
select pg_temp.expect_session_error($q$select private.request_governed_evaluation_v1(pg_temp.contract_text('a'),pg_temp.evaluation_snapshot(),'e5a10000-0000-4000-8000-000000000003')$q$,'permission_denied','a session cannot reach the operator request that names its actor');
select pg_temp.expect_session_error($q$select private.read_governed_evaluation_v1('e5a10000-0000-4000-c000-0000000000a1','e5a10000-0000-4000-8000-000000000003')$q$,'permission_denied','a session cannot reach the operator read that names its actor');
select pg_temp.sign_in('e5a10000-0000-4000-8000-000000000006');
select pg_temp.expect_session_error($q$select public.request_governed_evaluation_session_v1(pg_temp.contract_text('a'),pg_temp.evaluation_snapshot())$q$,'evaluator_session_required','the worker account cannot request an evaluation');
select pg_temp.sign_in('e5a10000-0000-4000-8000-000000000002');
select pg_temp.expect_session_error($q$select public.request_governed_evaluation_session_v1(pg_temp.contract_text('a'),pg_temp.evaluation_snapshot())$q$,'evaluator_session_required','an operator session is not an evaluator session');
select pg_temp.expect_session_error($q$select public.read_governed_evaluation_session_v1('e5a10000-0000-4000-c000-0000000000a1')$q$,'evaluator_session_required','an operator session cannot read an evaluation');
select pg_temp.sign_in('e5a10000-0000-4000-8000-000000000001');
select pg_temp.expect_session_error($q$select public.request_governed_evaluation_session_v1(pg_temp.contract_text('a'),pg_temp.evaluation_snapshot())$q$,'evaluator_session_required','the founder session is not an evaluator session');
select pg_temp.expect_session_error($q$select public.read_governed_evaluation_session_v1('e5a10000-0000-4000-c000-0000000000a1')$q$,'evaluator_session_required','the founder session cannot read an evaluation');
reset role;
do $$begin
 if exists(select 1 from private.governed_evaluations where organization_id='e5a10000-0000-4000-9000-000000000001')
 or exists(select 1 from public.processing_jobs where kind='governed_evaluation' and organization_id='e5a10000-0000-4000-9000-000000000001')
 then raise exception 'a refused session left rows behind';end if;
 perform pg_temp.session_pass('refused sessions store nothing');
end $$;

-- 5. A live evaluator requests through the wrapper under its own session. The actor is the session:
-- a declared ledger identity naming another evaluator changes nothing, and a contract field naming
-- one is refused as an extra field.
set local role authenticated;
select pg_temp.sign_in('e5a10000-0000-4000-8000-000000000003');
select set_config('offroad.actor_user_id','e5a10000-0000-4000-8000-000000000004',true);
select pg_temp.keep_response('a',public.request_governed_evaluation_session_v1(pg_temp.contract_text('a'),pg_temp.evaluation_snapshot()));
select set_config('offroad.actor_user_id','',true);
select pg_temp.expect_session_error($q$select public.request_governed_evaluation_session_v1(pg_temp.contract_text('actor'),pg_temp.evaluation_snapshot())$q$,'evaluation_contract_denied','a contract field naming another actor is refused');
reset role;
do $$declare f record;ex uuid:='e5a10000-0000-4000-c000-0000000000a1';begin
 select * into f from session_fixture where name='a';
 if f.response->>'executionId'<>ex::text or f.response->>'processingRunId'<>ex::text or (f.response->>'replayed')::boolean or f.response->>'jobId' is null
 then raise exception 'the session request did not return its identities: %',f.response;end if;
 if not exists(select 1 from private.governed_evaluations e where e.id=ex and e.requested_by_user_id='e5a10000-0000-4000-8000-000000000003'
  and e.contract_text=f.contract::text and e.snapshot_text=pg_temp.evaluation_snapshot())
 or (select count(*) from private.governed_evaluation_request_events x where x.evaluation_id=ex and x.actor_user_id='e5a10000-0000-4000-8000-000000000003')<>1
 or not exists(select 1 from public.processing_runs r where r.id=ex and r.created_by='e5a10000-0000-4000-8000-000000000003' and r.pipeline_version='governed-evaluation-v1')
 or not exists(select 1 from public.processing_jobs j where j.id=(f.response->>'jobId')::uuid and j.kind='governed_evaluation' and j.status='queued' and j.evaluation_id=ex)
 then raise exception 'the session request was not stored under the session''s evaluator';end if;
 if exists(select 1 from private.governed_evaluations where requested_by_user_id='e5a10000-0000-4000-8000-000000000004')
 or exists(select 1 from private.governed_evaluation_request_events where actor_user_id='e5a10000-0000-4000-8000-000000000004')
 or exists(select 1 from private.governed_evaluations where id='e5a10000-0000-4000-c000-0000000000c1')
 then raise exception 'another evaluator was recorded as the actor';end if;
 perform pg_temp.session_pass('a live evaluator requests under its own session; the stored actor is the session, whatever else names one');
end $$;
set local role authenticated;
select pg_temp.sign_in('e5a10000-0000-4000-8000-000000000003');
select pg_temp.keep_response('b',public.request_governed_evaluation_session_v1(pg_temp.contract_text('a'),pg_temp.evaluation_snapshot()));
reset role;
do $$declare r jsonb:=(select response from session_fixture where name='b');a jsonb:=(select response from session_fixture where name='a');begin
 if not (r->>'replayed')::boolean or r->>'executionId'<>a->>'executionId' or r->>'jobId'<>a->>'jobId'
 or (select count(*) from private.governed_evaluations where requested_by_user_id='e5a10000-0000-4000-8000-000000000003')<>1
 then raise exception 'a replayed session request was not idempotent: %',r;end if;
 perform pg_temp.session_pass('a replayed session request returns the same evaluation and stores nothing new');
end $$;

-- 6. The evaluator reads through the wrapper under its own session.
set local role authenticated;
select pg_temp.sign_in('e5a10000-0000-4000-8000-000000000003');
select pg_temp.keep_response('b',public.read_governed_evaluation_session_v1('e5a10000-0000-4000-c000-0000000000a1'));
select pg_temp.expect_session_error($q$select public.read_governed_evaluation_session_v1('e5a10000-0000-4000-c000-00000000ffff')$q$,'evaluation_access_denied','an unknown evaluation reads as access denied');
reset role;
do $$declare r jsonb:=(select response from session_fixture where name='b');f record;begin
 select * into f from session_fixture where name='a';
 if r->>'schemaVersion'<>'governed-evaluation-read.v1' or r->>'executionId'<>'e5a10000-0000-4000-c000-0000000000a1'
 or r->>'requestedBy'<>'e5a10000-0000-4000-8000-000000000003' or r#>>'{state,job}'<>'queued' or r->'outcome'<>'null'::jsonb or r->'result'<>'null'::jsonb
 or r->>'contractFingerprint'<>encode(extensions.digest(convert_to(f.contract::text,'UTF8'),'sha256'),'hex')
 or r->>'inputFingerprint'<>encode(extensions.digest(convert_to(pg_temp.evaluation_snapshot(),'UTF8'),'sha256'),'hex')
 or jsonb_array_length(r->'receipts')<>0 or (r->>'totalCostMicrousd')::bigint<>0 or r#>>'{audience,scriptId}'<>'run-gold-baseline'
 then raise exception 'the session read is incomplete: %',r;end if;
 perform pg_temp.session_pass('a live evaluator reads identity, fingerprints, state, receipts and cost under its own session');
end $$;

-- 7. A revoked, banned or deleted evaluator is refused on both commands.
update private.platform_principals set revoked_at=now(),revoked_reason='Synthetic evaluator revocation' where user_id='e5a10000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.sign_in('e5a10000-0000-4000-8000-000000000004');
select pg_temp.expect_session_error($q$select public.request_governed_evaluation_session_v1(pg_temp.contract_text('b'),pg_temp.evaluation_snapshot())$q$,'evaluator_session_required','a revoked evaluator cannot request');
select pg_temp.expect_session_error($q$select public.read_governed_evaluation_session_v1('e5a10000-0000-4000-c000-0000000000a1')$q$,'evaluator_session_required','a revoked evaluator cannot read');
reset role;
update auth.users set banned_until=now()+interval '1 day' where id='e5a10000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.sign_in('e5a10000-0000-4000-8000-000000000003');
select pg_temp.expect_session_error($q$select public.request_governed_evaluation_session_v1(pg_temp.contract_text('b'),pg_temp.evaluation_snapshot())$q$,'evaluator_session_required','a banned evaluator cannot request');
select pg_temp.expect_session_error($q$select public.read_governed_evaluation_session_v1('e5a10000-0000-4000-c000-0000000000a1')$q$,'evaluator_session_required','a banned evaluator cannot read');
reset role;
update auth.users set banned_until=null where id='e5a10000-0000-4000-8000-000000000003';
update auth.users set deleted_at=now() where id='e5a10000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.sign_in('e5a10000-0000-4000-8000-000000000003');
select pg_temp.expect_session_error($q$select public.read_governed_evaluation_session_v1('e5a10000-0000-4000-c000-0000000000a1')$q$,'evaluator_session_required','a deleted evaluator cannot read');
reset role;
update auth.users set deleted_at=null where id='e5a10000-0000-4000-8000-000000000003';
select pg_temp.keep_response('b',null);
set local role authenticated;
select pg_temp.sign_in('e5a10000-0000-4000-8000-000000000003');
select pg_temp.keep_response('b',public.read_governed_evaluation_session_v1('e5a10000-0000-4000-c000-0000000000a1'));
reset role;
do $$begin
 if exists(select 1 from private.governed_evaluations where id='e5a10000-0000-4000-c000-0000000000b1')
 then raise exception 'a refused evaluator stored an evaluation';end if;
 if (select response->>'executionId' from session_fixture where name='b') is distinct from 'e5a10000-0000-4000-c000-0000000000a1'
 then raise exception 'the evaluator could not read again once live';end if;
 perform pg_temp.session_pass('refused evaluators store nothing, and the same evaluator reads again once live');
end $$;

select 'governed_evaluation_session_access: PASS' result,(select string_agg(line,E'\n' order by n) from session_proof) lines;
rollback;
