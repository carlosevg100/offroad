-- Stage 17, increment 4D: time to the first useful response and to the verified result, recorded
-- without content. Every stamp already exists except one: nothing recorded that the requester read
-- the result. The v1 reader now leaves a read receipt (who read, whether that reader's inputs were
-- current, whether the result bytes were returned, and when), and an operator view derives the
-- intervals from ids, stamps, booleans, a bigint and codes only. Nothing here grants anything to a
-- tenant, a worker or the Data API; the readers keep their signatures, security model and grants.
-- A read now writes, so the readers stay volatile and are called in a read-write transaction (a
-- POST through the Data API, which is how the client already calls them).
--
-- Operational definitions, fixed for this increment:
-- - Start: public.work_executions.created_at, the request's commit.
-- - Claimed: public.processing_runs.started_at, written at the first claim.
-- - Committed: private.execution_result_receipts.created_at.
-- - First useful response: that created_at when outcome = 'succeeded'. The kernel computed the
--   packet; a packet with named gaps still advances the decision. Partial markers
--   (budget_exhausted, operation_uncertain, calculation_failed, invalid_input) are not useful
--   responses and leave the column null.
-- - Verified result: the first read of the result bytes by the execution's own requester (the
--   human principal of the execution) while the reader's inputs are current and the gate receipt,
--   when present, is not blocked. A partial marker read by its requester is a verified result that
--   is not a useful response; outcome tells the two apart.
-- - Active duration: processing_runs.usage.activeDurationMs, written at commit.
set search_path='';

-- 0. The v1 reader is restated below from its current text (20260923233409, lines 141 to 162) with
-- one added statement. The v2 reader (20260924000400, lines 237 to 245) is relied on as it stands:
-- its first statement is the v1 read, so v1 records every v2 read, and v2 returns the v1 result
-- object unchanged, so canonicalResult is present in both or in neither. The guard refuses any
-- other base for either function. It resolves them with to_regprocedure because v1 is restated in
-- full here, not rewritten by text, so neither function joins the snapshot of text-rewritten bodies
-- that scripts/ci/verify-effective-function-bodies.py derives from literal signatures.
do $guard$
declare target record;
begin
 for target in select * from (values
  ('private.read_work_execution_v1(uuid)','f1ef89cb320d0a9fa761b73c00e52217'),
  ('private.read_work_execution_v2(uuid)','3e269694917edd6573cf04e9ba62757e')) expected(signature,definition_md5)
 loop
  if md5(pg_get_functiondef(to_regprocedure(target.signature))) is distinct from target.definition_md5 then
   raise exception 'execution_time_to_value_base_drift: % differs from the definition this migration was written against',target.signature;
  end if;
 end loop;
end;
$guard$;

-- 1. Read receipts. At most two rows per reader and execution: the first read without the result
-- bytes and the first read with them; later reads add nothing. Keeping only the first read of any
-- kind would lose the verified read whenever the requester looked before the result existed, which
-- is what a client waiting for its result does. Bytes are returned only on current inputs, and the
-- check keeps it so. No content, no value, no free text; written only by the reader, in the
-- reader's transaction; never changed, deleted or truncated; no client or worker grant.
create table private.execution_read_receipts (
 organization_id uuid not null,
 execution_id uuid not null,
 subject_user_id uuid not null references auth.users(id),
 inputs_current boolean not null,
 bytes_returned boolean not null,
 first_read_at timestamptz not null default clock_timestamp(),
 constraint execution_read_receipts_pkey primary key(organization_id,execution_id,subject_user_id,bytes_returned),
 constraint execution_read_receipts_execution_fkey foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 constraint execution_read_receipts_bytes_check check(inputs_current or not bytes_returned)
);
alter table private.execution_read_receipts enable row level security;
alter table private.execution_read_receipts force row level security;
create policy execution_read_receipts_deny on private.execution_read_receipts as restrictive for all to public using(false) with check(false);
revoke all on private.execution_read_receipts from public,anon,authenticated,service_role;
create trigger execution_read_receipts_immutable before update or delete on private.execution_read_receipts for each row execute function private.guard_contribution_immutable_v1();
create trigger execution_read_receipts_truncate_guard before truncate on private.execution_read_receipts for each statement execute function private.guard_platform_ledger_truncate_v1();
comment on table private.execution_read_receipts is 'Immutable receipt of the first read of an execution by each reader without the result bytes and of the first read with them: reader, whether the reader''s inputs were current, whether canonicalResult was returned, and when. Ids, booleans and a stamp only. Written by the v1 reader in the reader''s transaction; no client or worker grant.';

-- 2. The v1 reader, byte for byte as before except the receipt, written after the access check and
-- the inputs computation. bytes_returned is true exactly when the result branch below carries
-- canonicalResult: a result exists and the reader's inputs are current (never null: the inputs
-- function is a conjunction of exists tests).
create or replace function private.read_work_execution_v1(p_execution_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare e public.work_executions;j public.processing_jobs;run public.processing_runs;m private.execution_manifests;o private.execution_operation_receipts;r private.execution_result_receipts;current boolean;begin
 select * into e from public.work_executions where id=p_execution_id;
 if not found then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform private.execution_read_access_v1(e.organization_id,e.work_id);
 select * into j from public.processing_jobs where organization_id=e.organization_id and execution_id=e.id and kind='work_execution';
 select * into run from public.processing_runs where organization_id=e.organization_id and id=e.processing_run_id;
 select * into m from private.execution_manifests where organization_id=e.organization_id and execution_id=e.id;
 select * into o from private.execution_operation_receipts where organization_id=e.organization_id and execution_id=e.id and operation_id=e.id;
 select * into r from private.execution_result_receipts where organization_id=e.organization_id and execution_id=e.id;
 current:=private.execution_inputs_current_v1(e.organization_id,e.id,auth.uid());
 insert into private.execution_read_receipts(organization_id,execution_id,subject_user_id,inputs_current,bytes_returned) values(e.organization_id,e.id,auth.uid(),current,r.id is not null and current) on conflict do nothing;
 return jsonb_build_object('schemaVersion','work-execution-read.v1','executionId',e.id,'workId',e.work_id,'requestId',e.request_id,'processingRunId',e.processing_run_id,'createdAt',e.created_at,
  'job',case when j.id is null then null else jsonb_build_object('status',j.status,'attempts',j.attempts,'lastErrorCode',j.last_error->>'code','availableAt',j.available_at,'updatedAt',j.updated_at) end,
  'run',case when run.id is null then null else jsonb_build_object('status',run.status,'completedAt',run.completed_at,'usage',run.usage) end,
  'manifest',case when m.id is null then null else jsonb_build_object('contractFingerprint',m.payload_fingerprint,'inputFingerprint',m.snapshot_fingerprint,'purpose',m.payload->>'purpose','method',m.payload->'method','budget',m.payload->'budget','requestedAt',m.payload->>'requestedAt') end,
  'operation',case when o.id is null then null else jsonb_build_object('state',o.state,'settledOutcome',o.settled_outcome,'settledReason',o.settled_reason,'resultFingerprint',o.result_fingerprint) end,
  'result',case when r.id is null then null
   when not current then jsonb_build_object('withheld','inputs_not_current','outcome',r.outcome,'reason',r.reason,'resultFingerprint',r.result_fingerprint,'committedAt',r.created_at)
   else jsonb_build_object('outcome',r.outcome,'reason',r.reason,'resultFingerprint',r.result_fingerprint,'canonicalResult',r.canonical_result,'committedAt',r.created_at) end,
  'inputsCurrent',current);
end $$;

-- 3. The operator view, one row per execution, mirroring private.project_time_to_value
-- (20260904201650): security invoker and no API role. Only ids, stamps, intervals, booleans, a
-- bigint and codes. method_id and method_version are the platform catalogue identifiers of the
-- release the manifest pins, never tenant content. outcome is check-constrained on the result
-- receipt. The receipt's reason is bounded only by length, so it passes only when it is one of the
-- five codes that execution_operation_receipts_settled_reason_check enumerates and
-- worker_commit_execution_v1 accepts; any other text becomes null and never reaches telemetry.
-- active_duration_ms is null unless the run's usage carries a non-negative integer.
create view private.execution_time_to_value with (security_invoker = true) as
 select
  e.organization_id,
  e.id as execution_id,
  e.work_id,
  release.method_id,
  release.version as method_version,
  result.outcome,
  case when result.reason in ('calculated','invalid_input','calculation_failed','budget_exhausted','operation_uncertain') then result.reason end as reason,
  gate.blocked as gates_blocked,
  e.created_at as requested_at,
  run.started_at as claimed_at,
  result.created_at as committed_at,
  useful.first_useful_at,
  verified.verified_at,
  run.started_at - e.created_at as time_in_queue,
  useful.first_useful_at - e.created_at as time_to_first_useful,
  verified.verified_at - e.created_at as time_to_verified,
  case when jsonb_typeof(run.usage->'activeDurationMs')='number' and run.usage->>'activeDurationMs' ~ '^[0-9]{1,16}$'
   then (run.usage->>'activeDurationMs')::bigint end as active_duration_ms
 from public.work_executions e
 join private.principals requester on requester.organization_id=e.organization_id and requester.id=e.principal_id
 left join public.processing_runs run on run.organization_id=e.organization_id and run.id=e.processing_run_id
 left join private.execution_manifests manifest on manifest.organization_id=e.organization_id and manifest.execution_id=e.id
 left join private.platform_method_releases release on release.id=manifest.platform_release_id
 left join private.execution_result_receipts result on result.organization_id=e.organization_id and result.execution_id=e.id
 left join private.execution_gate_receipts gate on gate.organization_id=e.organization_id and gate.execution_id=e.id
 cross join lateral (select case when result.outcome='succeeded' then result.created_at end as first_useful_at) useful
 cross join lateral (
  select min(x.first_read_at) as verified_at from private.execution_read_receipts x
  where x.organization_id=e.organization_id and x.execution_id=e.id and x.subject_user_id=requester.user_id
  and x.bytes_returned and x.inputs_current and gate.blocked is not true) verified;
revoke all on private.execution_time_to_value from public,anon,authenticated,service_role;
comment on view private.execution_time_to_value is 'Time to value per execution, without content: requested (work_executions.created_at), claimed (processing_runs.started_at), committed (result receipt), first useful response (committed and succeeded; partial markers leave it null), verified result (first read of the result bytes by the requester on current inputs, unless the gate receipt is blocked), the intervals from the request, and the active duration at commit. Operators only.';
