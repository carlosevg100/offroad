-- Disposable synthetic proof that the outbox sweep spares a governed evaluation while its evaluator is live
-- and cancels it once the evaluator is not. Every row rolls back; never production.
-- Tenant jobs keep the previous authority expression byte for byte, and domain_event_outbox.sql and
-- domain_event_outbox_revocation.sql already cover them (queued and leased cancellation, audit atomicity,
-- replay), so one tenant control in another organization is enough here.
begin;
\ir support/governed_evaluation_fixture.sql
\ir support/source_rights_fixture.sql
\ir support/legacy_workspace_capabilities.sql
\ir support/legacy_resource_fixture.sql
create temporary table sweep_proof(n serial primary key,line text not null);
create temporary table sweep_fixture(name text primary key,request jsonb,claim jsonb);
create function pg_temp.sweep_pass(p_line text) returns void language plpgsql as $$
begin insert into pg_temp.sweep_proof(line) values('PASS: '||p_line);raise notice 'PASS: %',p_line;end $$;

-- The worker consumes the outbox the way the deployed consumer does: claim, then complete.
create function pg_temp.sweep_drain() returns void language plpgsql as $$
declare item jsonb;begin
 perform pg_temp.as_worker();
 for counter in 1..1000 loop
  item:=public.claim_event_outbox_v1('synthetic-evaluation-worker-token-e5a10000');
  exit when item->>'claimed'='false';
  perform public.complete_event_outbox_v1('synthetic-evaluation-worker-token-e5a10000',(item->>'outboxId')::uuid,item->>'capability');
 end loop;
 if exists(select 1 from private.event_outbox where status<>'completed' and organization_id in
  ('e5a10000-0000-4000-9000-000000000001','e5a10000-0000-4000-9000-000000000002','a11b0000-0000-4000-9000-000000000001'))
 then raise exception 'the outbox of this proof was not drained';end if;
end $$;
-- Claims and completes until the row of one event completes, and returns that completion.
create function pg_temp.sweep_deliver(p_event uuid) returns jsonb language plpgsql as $$
declare item jsonb;result jsonb;begin
 perform pg_temp.as_worker();
 for counter in 1..1000 loop
  item:=public.claim_event_outbox_v1('synthetic-evaluation-worker-token-e5a10000');
  if item->>'claimed'<>'true' then exit;end if;
  result:=public.complete_event_outbox_v1('synthetic-evaluation-worker-token-e5a10000',(item->>'outboxId')::uuid,item->>'capability');
  if item#>>'{event,id}'=p_event::text then return result;end if;
 end loop;
 raise exception 'event % was never claimed',p_event;
end $$;
-- The latest membership event of the synthetic member, which must be the only undelivered event of the
-- evaluation organization: the event a step produces is then the next one the sweep completes there.
create function pg_temp.sweep_member_event() returns uuid language plpgsql as $$
declare event uuid;begin
 select id into event from private.domain_events where organization_id='e5a10000-0000-4000-9000-000000000001'
 and aggregate_kind='membership' and aggregate_id='e5b10000-0000-4000-8000-000000000001' order by aggregate_version desc limit 1;
 if (select count(*) from private.event_outbox where organization_id='e5a10000-0000-4000-9000-000000000001' and status<>'completed')<>1
 or not exists(select 1 from private.event_outbox where organization_id='e5a10000-0000-4000-9000-000000000001' and event_id=event and status='pending')
 then raise exception 'the membership change did not queue exactly one event in the evaluation organization';end if;
 return event;
end $$;

-- A synthetic member of the evaluation organization. Joining also creates its principal; each later
-- change of role or status is exactly one domain event of the evaluation organization.
select set_config('request.jwt.claim.sub','',true);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values('e5b10000-0000-4000-8000-000000000001','authenticated','authenticated','e5b10000-1@example.invalid','{}','{}',now(),now(),false,false);
insert into public.organization_memberships(organization_id,user_id,role,status)
values('e5a10000-0000-4000-9000-000000000001','e5b10000-0000-4000-8000-000000000001','member','active');

-- Tenant control: a queued job of the synthetic 1B organization, bound to its owner.
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
insert into public.processing_jobs(id,organization_id,processing_run_id,intake_session_id,source_document_id,kind,status)
values('e5b10000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000001','a11b0000-0000-4000-9000-000000000005',
 'a11b0000-0000-4000-9000-000000000003','a11b0000-0000-4000-9000-000000000004','document_pipeline','queued');
do $$begin
 if private.job_authority_is_current_v1('e5b10000-0000-4000-9000-000000000001') is not true then raise exception 'the tenant control job is not current';end if;
end $$;

-- Start from an empty outbox: the fixtures' own membership and grant events are delivered first.
select pg_temp.sweep_drain();
do $$begin
 if not exists(select 1 from public.processing_jobs where id='e5b10000-0000-4000-9000-000000000001' and status='queued')
 then raise exception 'a current tenant job did not survive the sweep of its organization';end if;
end $$;

-- An operator opens the transport so the consumer can lease; two evaluators request one evaluation each.
select private.release_governed_evaluation_transport_v1('e5b10000-0000-4000-a000-000000000001',true,'e5a10000-0000-4000-8000-000000000002','Synthetic release for the outbox sweep proof');
insert into sweep_fixture(name,request) values
 ('a',pg_temp.request_evaluation(pg_temp.evaluation_contract('e5b10000-0000-4000-c000-000000000001'))),
 ('b',pg_temp.request_evaluation(pg_temp.evaluation_contract('e5b10000-0000-4000-c000-000000000002'),'e5a10000-0000-4000-8000-000000000004'));

-- 1. A domain event in the evaluation organization leaves queued evaluations queued.
select set_config('request.jwt.claim.sub','',true);
update public.organization_memberships set role='analyst'
where organization_id='e5a10000-0000-4000-9000-000000000001' and user_id='e5b10000-0000-4000-8000-000000000001';
do $$declare event uuid:=pg_temp.sweep_member_event();r jsonb;begin
 if (select count(*) from public.processing_jobs j join sweep_fixture f on j.id=(f.request->>'jobId')::uuid
  where j.kind='governed_evaluation' and j.status='queued' and private.job_authority_is_current_v1(j.id))<>2
 then raise exception 'a queued evaluation of a live evaluator is not current';end if;
 r:=pg_temp.sweep_deliver(event);
 if r->>'completed'<>'true' or r->>'replayed'<>'false' or (r->>'appliedCount')::integer<>0
 or not exists(select 1 from private.event_outbox where event_id=event and status='completed' and completed_at is not null and applied_count=0)
 then raise exception 'the event did not complete without effect: %',r;end if;
 if (select count(*) from public.processing_jobs j join sweep_fixture f on j.id=(f.request->>'jobId')::uuid where j.status='queued')<>2
 then raise exception 'the sweep touched a queued evaluation';end if;
 if exists(select 1 from private.access_decision_events a join sweep_fixture f on a.processing_job_id=(f.request->>'jobId')::uuid)
 then raise exception 'an access decision was recorded for an evaluation';end if;
 perform pg_temp.sweep_pass('a domain event in the evaluation organization completes; both queued evaluations stay queued, with no access decision');
end $$;

-- 2. The same holds for an evaluation the consumer has leased. The legacy failure command refuses its lease.
update sweep_fixture set claim=pg_temp.claim_evaluation((request->>'jobId')::uuid) where name='a';
do $$declare f record;begin
 select * into f from sweep_fixture where name='a';
 if not (f.claim->>'claimed')::boolean
 or not exists(select 1 from public.processing_jobs where id=(f.claim->>'jobId')::uuid and status='leased' and lease_id=(f.claim->>'leaseId')::uuid)
 then raise exception 'the consumer did not lease the evaluation: %',f.claim;end if;
 perform pg_temp.as_worker();
 begin
  perform public.worker_fail_job((f.claim->>'jobId')::uuid,f.claim->>'capability',
   '{"code":"synthetic_failure","stage":"evaluation","retryable":true,"cause":{"name":"SyntheticError","class":"worker_error","message":"Synthetic failure"}}'::jsonb,true,60);
  raise exception 'the legacy failure command accepted an evaluation lease';
 exception when insufficient_privilege then
  if sqlerrm<>'job_capability_invalid' then raise;end if;
 end;
 if not exists(select 1 from public.processing_jobs where id=(f.claim->>'jobId')::uuid and status='leased' and lease_id=(f.claim->>'leaseId')::uuid
  and capability_sha256=extensions.digest(f.claim->>'capability','sha256'))
 then raise exception 'the refused failure changed the evaluation lease';end if;
 perform pg_temp.sweep_pass('the legacy failure command refuses the lease of a live evaluation with job_capability_invalid and leaves it leased');
end $$;
select set_config('request.jwt.claim.sub','',true);
update public.organization_memberships set role='member'
where organization_id='e5a10000-0000-4000-9000-000000000001' and user_id='e5b10000-0000-4000-8000-000000000001';
do $$declare event uuid:=pg_temp.sweep_member_event();f record;r jsonb;renewal jsonb;begin
 select * into f from sweep_fixture where name='a';
 if private.job_authority_is_current_v1((f.claim->>'jobId')::uuid) is not true then raise exception 'a leased evaluation of a live evaluator is not current';end if;
 r:=pg_temp.sweep_deliver(event);
 if r->>'completed'<>'true' or (r->>'appliedCount')::integer<>0
 or not exists(select 1 from private.event_outbox where event_id=event and status='completed' and applied_count=0)
 then raise exception 'the event did not complete without effect: %',r;end if;
 if not exists(select 1 from public.processing_jobs where id=(f.claim->>'jobId')::uuid and status='leased' and lease_id=(f.claim->>'leaseId')::uuid
  and capability_sha256=extensions.digest(f.claim->>'capability','sha256') and leased_by='e5a10000-0000-4000-8000-000000000011'
  and lease_expires_at>clock_timestamp())
 or not exists(select 1 from public.processing_jobs j join sweep_fixture b on b.name='b' and j.id=(b.request->>'jobId')::uuid where j.status='queued')
 then raise exception 'the sweep touched a live evaluation';end if;
 if exists(select 1 from private.access_decision_events a join sweep_fixture x on a.processing_job_id=(x.request->>'jobId')::uuid)
 then raise exception 'an access decision was recorded for an evaluation';end if;
 perform pg_temp.as_worker();
 renewal:=private.worker_renew_evaluation_v1((f.claim->>'jobId')::uuid,f.claim->>'capability',(f.claim->>'leaseId')::uuid);
 if not (renewal->>'allowed')::boolean then raise exception 'the lease no longer renews after the sweep';end if;
 perform pg_temp.sweep_pass('a domain event completes; the leased evaluation keeps its lease, capability and worker, with no access decision, and still renews');
end $$;

-- 3. Once the evaluator is no longer live, the next completed event cancels its evaluation.
update private.platform_principals set revoked_at=now(),revoked_reason='Synthetic evaluator revocation' where user_id='e5a10000-0000-4000-8000-000000000003';
select set_config('request.jwt.claim.sub','',true);
update public.organization_memberships set status='suspended'
where organization_id='e5a10000-0000-4000-9000-000000000001' and user_id='e5b10000-0000-4000-8000-000000000001';
do $$declare event uuid:=pg_temp.sweep_member_event();a record;b record;r jsonb;begin
 select * into a from sweep_fixture where name='a';
 select * into b from sweep_fixture where name='b';
 if private.job_authority_is_current_v1((a.claim->>'jobId')::uuid) is not false or private.job_authority_is_current_v1((b.request->>'jobId')::uuid) is not true
 then raise exception 'evaluation authority does not follow the evaluator';end if;
 r:=pg_temp.sweep_deliver(event);
 if r->>'completed'<>'true' or (r->>'appliedCount')::integer<>1
 or not exists(select 1 from private.event_outbox where event_id=event and status='completed' and applied_count=1)
 then raise exception 'the event did not cancel exactly one evaluation: %',r;end if;
 if not exists(select 1 from public.processing_jobs where id=(a.claim->>'jobId')::uuid and status='cancelled' and capability_sha256 is null
  and lease_expires_at is null and leased_by is null and last_error=jsonb_build_object('reason','authorization_revoked'))
 then raise exception 'the evaluation of the revoked evaluator was not cancelled as authorization_revoked';end if;
 if (select count(*) from private.access_decision_events where processing_job_id=(a.claim->>'jobId')::uuid)<>1
 or not exists(select 1 from private.access_decision_events where processing_job_id=(a.claim->>'jobId')::uuid and domain_event_id=event
  and organization_id='e5a10000-0000-4000-9000-000000000001' and decision='deny' and reason='authorization_revoked')
 then raise exception 'the cancellation was not recorded once against this event';end if;
 if not exists(select 1 from public.processing_runs where id=(a.request->>'processingRunId')::uuid and status='cancelled' and error->>'reason'='authorization_revoked')
 then raise exception 'the run of the cancelled evaluation stayed active';end if;
 perform pg_temp.sweep_pass('once its evaluator is revoked, the next completed event cancels the leased evaluation as authorization_revoked, records one access decision against that event and cancels its run');
 if not exists(select 1 from public.processing_jobs where id=(b.request->>'jobId')::uuid and status='queued')
 or exists(select 1 from private.access_decision_events where processing_job_id=(b.request->>'jobId')::uuid)
 then raise exception 'the evaluation of a live evaluator was cancelled';end if;
 perform pg_temp.sweep_pass('the same event leaves the evaluation of a live evaluator queued, with no access decision');
 perform pg_temp.as_worker();
 begin
  perform private.worker_renew_evaluation_v1((a.claim->>'jobId')::uuid,a.claim->>'capability',(a.claim->>'leaseId')::uuid);
  raise exception 'a cancelled evaluation lease renewed';
 exception when insufficient_privilege then
  if sqlerrm<>'evaluation_lease_denied' then raise;end if;
 end;
 perform pg_temp.sweep_pass('the cancelled lease no longer renews');
end $$;

-- 4. Tenant control in another organization: the owner's suspension still cancels the owner's job.
select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);
update public.organization_memberships set status='suspended'
where organization_id='a11b0000-0000-4000-9000-000000000001' and user_id='a11b0000-0000-4000-8000-000000000001';
do $$begin
 if private.job_authority_is_current_v1('e5b10000-0000-4000-9000-000000000001') is not false then raise exception 'the job of a suspended owner is still current';end if;
end $$;
select pg_temp.sweep_drain();
do $$declare b record;begin
 select * into b from sweep_fixture where name='b';
 if not exists(select 1 from public.processing_jobs where id='e5b10000-0000-4000-9000-000000000001' and status='cancelled' and capability_sha256 is null
  and last_error=jsonb_build_object('reason','authorization_revoked'))
 or (select count(*) from private.access_decision_events a join private.domain_events e on e.organization_id=a.organization_id and e.id=a.domain_event_id
  where a.processing_job_id='e5b10000-0000-4000-9000-000000000001' and a.organization_id='a11b0000-0000-4000-9000-000000000001'
  and a.decision='deny' and a.reason='authorization_revoked')<>1
 then raise exception 'the tenant job lost its authority and was not cancelled as before';end if;
 if not exists(select 1 from public.processing_jobs where id=(b.request->>'jobId')::uuid and status='queued')
 or (select count(*) from private.access_decision_events where organization_id='e5a10000-0000-4000-9000-000000000001')<>1
 then raise exception 'a tenant event reached the evaluation organization';end if;
 perform pg_temp.sweep_pass('a tenant job in another organization stays queued while current and is cancelled as authorization_revoked once its owner is suspended, as before');
end $$;

-- 5. Both restated functions keep security definer, an empty search_path, their volatility and language,
-- and an execute grant held by their owner alone.
do $$declare f record;begin
 for f in select p.oid::regprocedure::text signature,p.prosecdef,p.provolatile,p.proconfig,l.lanname,p.proacl,p.proowner
  from pg_proc p join pg_language l on l.oid=p.prolang
  where p.oid in ('private.job_authority_is_current_v1(uuid)'::regprocedure,'private.job_for_failure_capability(uuid,text)'::regprocedure)
 loop
  if not f.prosecdef or f.proconfig is distinct from array['search_path=""'] or f.proacl is null
  or exists(select 1 from aclexplode(f.proacl) x where x.grantee<>f.proowner)
  or (f.signature='private.job_authority_is_current_v1(uuid)' and (f.provolatile<>'s' or f.lanname<>'sql'))
  or (f.signature='private.job_for_failure_capability(uuid,text)' and (f.provolatile<>'v' or f.lanname<>'plpgsql'))
  then raise exception 'restated function attributes or grants changed: %',f.signature;end if;
 end loop;
 perform pg_temp.sweep_pass('both restated functions keep security definer, an empty search_path, volatility, language and an owner-only execute grant');
end $$;
select 'governed_evaluation_outbox_sweep: PASS' result;
rollback;
