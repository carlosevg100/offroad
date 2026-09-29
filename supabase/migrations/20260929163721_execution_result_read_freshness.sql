-- Historical readability and current-input eligibility are independent facts.
-- Only the guarded reader writes these immutable receipts; client grants stay revoked.
-- Keep the telemetry view requiring both current inputs and returned bytes.
alter table private.execution_read_receipts drop constraint execution_read_receipts_bytes_check;
alter table private.execution_read_receipts drop constraint execution_read_receipts_pkey;
alter table private.execution_read_receipts add constraint execution_read_receipts_pkey
 primary key(organization_id,execution_id,subject_user_id,bytes_returned,inputs_current);
comment on table private.execution_read_receipts is 'Immutable first read per execution, subject, bytes-returned and inputs-current state (at most four states). Historical readability is authorized independently of recalculation eligibility. No content and no client or worker grant.';

CREATE OR REPLACE FUNCTION private.read_work_execution_v1(p_execution_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.work_executions;j public.processing_jobs;run public.processing_runs;m private.execution_manifests;o private.execution_operation_receipts;r private.execution_result_receipts;current boolean;readable boolean;answer jsonb;begin
 select * into e from public.work_executions where id=p_execution_id;
 if not found then raise exception 'execution_access_denied' using errcode='42501';end if;
 perform private.execution_read_access_v1(e.organization_id,e.work_id);
 select * into j from public.processing_jobs where organization_id=e.organization_id and execution_id=e.id and kind='work_execution';
 select * into run from public.processing_runs where organization_id=e.organization_id and id=e.processing_run_id;
 select * into m from private.execution_manifests where organization_id=e.organization_id and execution_id=e.id;
 select * into o from private.execution_operation_receipts where organization_id=e.organization_id and execution_id=e.id and operation_id=e.id;
 select * into r from private.execution_result_receipts where organization_id=e.organization_id and execution_id=e.id;
 current:=private.execution_inputs_current_v1(e.organization_id,e.id,auth.uid());
 readable:=case when r.id is not null then private.execution_closure_read_allowed_v1(e.organization_id,private.execution_result_source_closure_v1(e.organization_id,e.id),auth.uid())
  else current end;
 insert into private.execution_read_receipts(organization_id,execution_id,subject_user_id,inputs_current,bytes_returned) values(e.organization_id,e.id,auth.uid(),current,r.id is not null and readable) on conflict do nothing;
 answer:=jsonb_build_object('schemaVersion','work-execution-read.v1','executionId',e.id,'workId',e.work_id,'requestId',e.request_id,'processingRunId',e.processing_run_id,'createdAt',e.created_at,
  'job',case when j.id is null then null else jsonb_build_object('status',j.status,'attempts',j.attempts,'lastErrorCode',j.last_error->>'code','availableAt',j.available_at,'updatedAt',j.updated_at) end,
  'run',case when run.id is null then null else jsonb_build_object('status',run.status,'completedAt',run.completed_at,'usage',run.usage) end,
  'manifest',case when m.id is null then null else jsonb_build_object('contractFingerprint',m.payload_fingerprint,'inputFingerprint',m.snapshot_fingerprint,'purpose',m.payload->>'purpose','method',m.payload->'method','budget',m.payload->'budget','requestedAt',m.payload->>'requestedAt') end,
  'operation',case when o.id is null then null else jsonb_build_object('state',o.state,'settledOutcome',o.settled_outcome,'settledReason',o.settled_reason,'resultFingerprint',o.result_fingerprint) end,
  'result',case when r.id is null then null
   when not readable then jsonb_build_object('withheld','inputs_not_current','outcome',r.outcome,'reason',r.reason,'resultFingerprint',r.result_fingerprint,'committedAt',r.created_at)
   else jsonb_build_object('outcome',r.outcome,'reason',r.reason,'resultFingerprint',r.result_fingerprint,'canonicalResult',r.canonical_result,'committedAt',r.created_at) end,
  'inputsCurrent',current);
 -- Refusal after a wait rolls back the optimistic read receipt as well as the response.
 if readable and r.id is not null and not private.execution_closure_read_allowed_v1(e.organization_id,private.execution_result_source_closure_v1(e.organization_id,e.id),auth.uid()) then
  raise exception 'execution_access_denied' using errcode='42501';
 end if;
 -- Recalculation eligibility can expire while the receipt insertion waits too.
 if current and not private.execution_inputs_current_v1(e.organization_id,e.id,auth.uid()) then
  raise exception 'execution_access_denied' using errcode='42501';
 end if;
 return answer;
end $function$;

