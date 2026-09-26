-- Stage 18, increment 6A: the health of the dependency recompute, read by the worker for its alarms.
--
-- A recompute candidate can stay scheduled without any error line: the worker loop stops polling, a
-- lease keeps expiring because the worker dies mid-flight, the execution the candidate produced never
-- settles, or an institutional recompute job never finishes. The worker reads these numbers at most
-- every 30 seconds and logs them for the CloudWatch filters of
-- apps/document-worker/monitoring/dependency-recompute-alarms.json. Only counts and ages leave the
-- database, across all organizations: never an identifier or a tenant value.
--
--   scheduledCount              execution (3B) and institutional (5A) candidates in scheduled.
--   oldestScheduledSeconds      now minus the smallest updated_at among them; 0 when there is none.
--   expiredLeaseCount           execution candidates in scheduled without their execution whose lease
--                               expired after at least one attempt: claimed, and not produced, failed
--                               or claimed again before the lease ran out.
--   awaitingAuthorizationCount  execution candidates waiting for a person (increment 4); information
--                               only, since that wait belongs to a person and not to the worker.
--
-- The age of a scheduled candidate is measured from updated_at. Both state machines move forward
-- only, every write bumps the revision and passes the set_updated_at trigger, and a scheduled
-- candidate is written only when it enters scheduled (inserted with a zero budget by the 3B or 5A
-- planner, or authorized from awaiting_authorization by increment 4) and once more when what it
-- produced is attached (3B: its execution, by the worker's submission; 5A: its queued result, in the
-- transaction that inserts it, so there updated_at equals created_at). updated_at is therefore the
-- moment the candidate entered the wait it is in now: a claim and production by the recompute loop,
-- or the settlement of the execution or job it produced. created_at would also count the time a 3B
-- candidate waited for a person in awaiting_authorization, which is not a recompute backlog, and would
-- raise the backlog alarm the moment a person authorizes an old candidate. The lease lives in its own
-- table and never touches the candidate, so a lease that keeps expiring does not reset the age.
--
-- The functions stay volatile: the worker binding updates the token's last use and locks the worker
-- account row, which a read-only transaction refuses.
set search_path='';

-- 1. The reader, closed to every API role.
create function private.dependency_recompute_health_v1() returns jsonb
language sql security definer set search_path='' as $$
 with scheduled as (
  select c.updated_at from public.work_recompute_candidates c where c.state='scheduled'
  union all
  select c.updated_at from public.institutional_recompute_candidates c where c.state='scheduled'
 )
 select jsonb_build_object(
  'scheduledCount',(select count(*) from scheduled),
  'oldestScheduledSeconds',(select greatest(floor(extract(epoch from clock_timestamp()-min(s.updated_at))),0)::bigint from scheduled s),
  'expiredLeaseCount',(select count(*) from public.work_recompute_candidates c
   join private.work_recompute_leases l on l.organization_id=c.organization_id and l.candidate_id=c.id
   where c.state='scheduled' and c.execution_id is null and l.attempts>=1 and l.lease_expires_at<=clock_timestamp()),
  'awaitingAuthorizationCount',(select count(*) from public.work_recompute_candidates c where c.state='awaiting_authorization'));
$$;

-- 2. The worker entry point: the recompute worker exactly as the claim requires it (an active token
-- bound to the signed-in worker account), then the reader.
create function private.worker_dependency_recompute_health_v1(p_worker_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_recompute_worker_v1(p_worker_token);
 return private.dependency_recompute_health_v1();
end $$;

create function public.worker_dependency_recompute_health_v1(p_worker_token text) returns jsonb
language sql security invoker set search_path='' as $$ select private.worker_dependency_recompute_health_v1(p_worker_token); $$;

-- 3. A worker image that reads the health requires this capability, so it never boots against a
-- database without these functions.
do $patch$
declare body text;needle text:='"dependency-recompute.v1"]''::jsonb';
begin
 body:=pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure);
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 or position('dependency-recompute-health.v1' in body)>0 then
  raise exception 'dependency_recompute_health_capability_contract_changed';
 end if;
 execute replace(body,needle,'"dependency-recompute.v1","dependency-recompute-health.v1"]''::jsonb');
end $patch$;

-- 4. Grants: the worker entry point and its private core to authenticated only, behind the worker
-- binding; the reader to nobody.
revoke all on function private.dependency_recompute_health_v1() from public,anon,authenticated,service_role;
revoke all on function private.worker_dependency_recompute_health_v1(text) from public,anon,authenticated,service_role;
revoke all on function public.worker_dependency_recompute_health_v1(text) from public,anon,authenticated,service_role;
grant execute on function private.worker_dependency_recompute_health_v1(text) to authenticated;
grant execute on function public.worker_dependency_recompute_health_v1(text) to authenticated;

comment on function private.dependency_recompute_health_v1() is 'Health of the dependency recompute of stage 18, across all organizations and as counts and ages only: scheduledCount and oldestScheduledSeconds (from updated_at, the moment a candidate entered its current wait) over execution and institutional candidates in scheduled; expiredLeaseCount, execution candidates in scheduled without their execution whose lease expired after at least one attempt; awaitingAuthorizationCount, for information. Closed to every API role.';
comment on function public.worker_dependency_recompute_health_v1(text) is 'Worker entry point of the recompute health (stage 18, increment 6A): the recompute worker binding of the claim, then private.dependency_recompute_health_v1(). Numbers only; the worker logs them as recompute.health for the reviewed CloudWatch alarms.';
