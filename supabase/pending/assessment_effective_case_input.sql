-- Applied after assessment_review_projection.sql. The use of an earlier report
-- follows the typed controlled execution, never a prose classifier or UI flag.
set search_path='';
create function private.assessment_case_report_basis_v1(p_org uuid,p_execution uuid,p_intake uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare e public.controlled_case_executions;report jsonb;job uuid;receipts uuid[];snapshots uuid[];receipt uuid;
begin
 select * into e from public.controlled_case_executions where organization_id=p_org and id=p_execution and intake_session_id=p_intake
  and mode='primary' and status='succeeded' for share nowait;
 select r.report into report from private.case_execution_results r where r.organization_id=p_org and r.execution_id=p_execution for share nowait;
 if e.id is null or report is null or report->>'schemaVersion'='document-work-execution.v1' then return jsonb_build_object('state','unproven');end if;
 select x.id into job from public.processing_jobs x where x.organization_id=p_org and x.controlled_execution_id=p_execution and x.kind='case_analysis'
  order by x.created_at desc,x.id desc limit 1;
 select array_agg(p.id order by p.id) into receipts from private.assessment_proposal_receipts p where p.organization_id=p_org and p.job_id=job;
 if cardinality(receipts) is null then return jsonb_build_object('state','unproven','jobId',job);end if;
 foreach receipt in array receipts loop
  if private.assessment_proposal_authority_v1(p_org,receipt,p_actor)<>'allowed' then return jsonb_build_object('state','denied');end if;
 end loop;
 select array_agg(distinct x.id order by x.id) into snapshots from private.assessment_proposal_receipts p cross join lateral unnest(p.snapshot_ids)x(id)
  where p.organization_id=p_org and p.id=any(receipts);
 -- Until a prior report has a physical replay port for public bodies, never
 -- consume it with the public source closure silently omitted.
 if exists(select 1 from private.assessment_input_public_links where organization_id=p_org and snapshot_id=any(snapshots))
  or exists(select 1 from private.assessment_research_source_links where organization_id=p_org and snapshot_id=any(snapshots)) then
  return jsonb_build_object('state','unproven');end if;
 return jsonb_build_object('state','captured','jobId',job,'snapshotIds',to_jsonb(snapshots),
  'reportFingerprint',encode(extensions.digest(report::text,'sha256'),'hex'));
end $$;
revoke all on function private.assessment_case_report_basis_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.worker_load_case_assessment_input_v5(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;answer jsonb;prior jsonb;prior_execution uuid;basis jsonb;use_kind text;mode text;
 prior_snapshots uuid[]:='{}';versions uuid[];snapshot uuid;corpus_count integer:=0;gaps jsonb:='[]';report_fp text;
begin
 j:=private.job_for_capability(p_job_id,p_capability_token);
 if j.kind<>'case_analysis' then raise exception 'case_analysis_capability_required' using errcode='42501';end if;
 answer:=private.worker_load_case_input_v3(j.id,p_capability_token);
 answer:=answer||jsonb_build_object('claim_decisions',private.worker_load_claim_decisions(j.id,p_capability_token),
  'document_work_request',private.worker_load_document_work_request_v1(j.id,p_capability_token));
 answer:=private.worker_freeze_case_input(j.id,p_capability_token,answer);
 mode:=answer#>>'{_execution,mode}';
 if mode not in('primary','shadow','replay') or mode is null then raise exception 'assessment_prior_contract_unresolved' using errcode='42501';end if;
 if mode<>'primary' then
  -- case-analysis.ts compareCaseExecutions consumes this report as a required input.
  use_kind:='required_comparison';prior_execution:=(answer#>>'{_execution,baseline_execution_id}')::uuid;
  prior:=answer#>'{_execution,baseline_report}';
  if prior_execution is null or prior is null or jsonb_typeof(prior)='null' then
   raise exception 'assessment_baseline_basis_unproven' using errcode='42501';end if;
  basis:=private.assessment_case_report_basis_v1(j.organization_id,prior_execution,j.intake_session_id,j.authorization_subject_id);
  report_fp:=encode(extensions.digest(prior::text,'sha256'),'hex');
  if basis->>'state' is distinct from 'captured' or basis->>'reportFingerprint' is distinct from report_fp then
   raise exception 'assessment_baseline_basis_unproven' using errcode='42501';end if;
 elsif answer#>>'{document_work_request,executionScope}'='documentary_only' then
  -- Comparison of document passages uses the delivered sources, not a prior case report.
  use_kind:='not_consumed';prior:=null;basis:=jsonb_build_object('state','absent');
 else
  -- case-analysis.ts taskCacheFromReport is only an optimization; missing entries rerun.
  use_kind:='optional_task_cache';
  select e.id,r.report into prior_execution,prior from public.controlled_case_executions e
  join private.case_execution_results r on(r.organization_id,r.execution_id)=(e.organization_id,e.id)
  where e.organization_id=j.organization_id and e.intake_session_id=j.intake_session_id and e.mode='primary' and e.status='succeeded'
   and e.id::text is distinct from answer#>>'{_execution,id}' order by e.completed_at desc nulls last,e.created_at desc limit 1;
  if prior is null or prior->>'schemaVersion'='document-work-execution.v1' then
   prior:=null;basis:=jsonb_build_object('state','absent');
  else
   basis:=private.assessment_case_report_basis_v1(j.organization_id,prior_execution,j.intake_session_id,j.authorization_subject_id);
   if basis->>'state' is distinct from 'captured' then
    gaps:=jsonb_build_array(jsonb_build_object('code','prior_basis_unproven','controlledExecutionId',prior_execution,'jobId',basis->'jobId'));
    prior:=null;basis:=jsonb_build_object('state','unproven');
   else report_fp:=encode(extensions.digest(prior::text,'sha256'),'hex');
    if report_fp is distinct from basis->>'reportFingerprint' then raise exception 'assessment_prior_basis_changed' using errcode='40001';end if;
   end if;
  end if;
 end if;
 if basis->>'state'='captured' then
  prior_snapshots:=array(select(value#>>'{}')::uuid from jsonb_array_elements(basis->'snapshotIds'));
  select count(distinct chunk_id) into corpus_count from private.assessment_input_corpus_links where organization_id=j.organization_id
   and snapshot_id=any(prior_snapshots) and corpus_kind='house_playbook';
 end if;
 answer:=answer||jsonb_build_object('prior_case_report',case when use_kind='optional_task_cache' then prior else null end,'assessmentInputGaps',gaps,
  'priorBasis',jsonb_build_object('use',use_kind,'state',basis->'state','controlledExecutionId',prior_execution,
   'reportFingerprint',case when basis->>'state'='captured' then report_fp else null end));
 versions:=private.assessment_delivered_document_versions_v1(j.organization_id,answer);
 select coalesce(array_agg(distinct x.id order by x.id),'{}'::uuid[]) into versions from(
  select unnest(versions)id union select source_version_id from private.assessment_input_source_links
  where organization_id=j.organization_id and snapshot_id=any(prior_snapshots))x;
 snapshot:=private.capture_assessment_document_input_v1(j.id,p_capability_token,'case_effective_input',answer,versions,corpus_count);
 insert into private.assessment_input_corpus_links(organization_id,snapshot_id,corpus_kind,chunk_id,governance_id,purpose,content_hash)
 select distinct on(corpus_kind,chunk_id)j.organization_id,snapshot,corpus_kind,chunk_id,governance_id,purpose,content_hash
 from private.assessment_input_corpus_links where organization_id=j.organization_id and snapshot_id=any(prior_snapshots)
 order by corpus_kind,chunk_id,created_at desc,id desc on conflict(organization_id,snapshot_id,corpus_kind,chunk_id) do nothing;
 if private.assessment_input_snapshot_authority_v1(j.organization_id,snapshot,j.authorization_subject_id)<>'allowed' then
  raise exception 'assessment_input_authority_denied' using errcode='42501';end if;
 perform private.job_for_capability(j.id,p_capability_token);
 return answer||jsonb_build_object('assessmentInputSnapshotId',snapshot);
end $$;
create function public.worker_load_case_assessment_input_v5(p_job_id uuid,p_capability_token text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_case_assessment_input_v5(p_job_id,p_capability_token);$$;
revoke all on function private.worker_load_case_assessment_input_v5(uuid,text),public.worker_load_case_assessment_input_v5(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_case_assessment_input_v5(uuid,text),public.worker_load_case_assessment_input_v5(uuid,text) to authenticated;
