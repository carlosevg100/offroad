-- Native physical context is the input; deterministic outputs do not replace it.
-- SQL Storage metadata fixtures only; the separate SDK gate proves physical HTTP.
begin;
\ir support/capital_m07_context_stability_setup.sql
set local role authenticated;
do $$declare f record;capsule jsonb;again jsonb;ctx jsonb;task uuid;artifact jsonb;fp text;begin
 select * into strict f from pg_temp.m07_recipe_fixture;
 capsule:=public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);
 if capsule->'context' is distinct from 'null'::jsonb or capsule#>>'{capture,state}'<>'unresolved' then raise exception 'm07_capsule_leaked_body';end if;
 perform set_config('test.m07_stable_capsule',capsule::text,true);
 ctx:=(f.base->>'canonicalContext')::jsonb;
 -- Exact stable-JSON input used by the deterministic M01 executor.
 fp:=encode(extensions.digest('{"briefFingerprint":'||to_jsonb(ctx#>>'{brief,content_fingerprint}')::text||',"dependencies":[],"executorVersion":"2026.09.03-v6","planFingerprint":'||to_jsonb(ctx#>>'{plan,fingerprint}')::text||',"taskId":"M01"}','sha256'),'hex');
 task:=public.worker_start_capital_project_task(f.job_id,f.capability,'M01','offroad.origination_thesis','2026.09.03-v6',fp,
 jsonb_build_object('schemaVersion','capital-context-manifest.v1','planId',ctx#>>'{plan,id}','projectId',ctx#>>'{project,id}','briefId',ctx#>>'{brief,id}',
 'sourceClasses',jsonb_build_array('user_public_context','public_research'),'excludedContext',jsonb_build_array('private_documents','company_truth','lender_graph','pricing')));
 artifact:=public.worker_record_capital_project_artifact(f.job_id,f.capability,task,'company_resolution','capital-artifact.v1','draft',fp,
 jsonb_build_object('companyName',ctx#>>'{session,company_profile,name}','website',ctx#>'{session,company_profile,website}',
 'resolutionStatus','user_identified_public_subject','accessBasis','public_information','representationStatus','not_claimed',
 'limitations',jsonb_build_array('Legal-entity and group perimeter remain unconfirmed until supported by public sources or later private evidence.')),
 jsonb_build_array(jsonb_build_object('sourceType','capital_project','sourceId',ctx#>>'{project,id}')),'[]');
 perform public.worker_finish_capital_project_task(f.job_id,f.capability,task,'succeeded',jsonb_build_object('type','capital_project_artifact','id',artifact->>'id'),artifact->>'artifact_fingerprint',
 jsonb_build_array(jsonb_build_object('id','structured_output','passed',true,'detail','Artifact contract produced deterministically.')),'{}',null);
 if public.worker_load_capital_project_context_v6(f.job_id,f.capability)->'completed_artifacts'=ctx->'completed_artifacts' then raise exception 'm07_producer_did_not_change_outputs';end if;
 again:=public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);
 if capsule is distinct from again then raise exception 'm07_native_input_replaced_by_outputs';end if;
end $$;
reset role;
-- Integrity/TTL/rights failures each roll back their mutation, preserving the
-- original receipt. Only outputs are excluded from input identity, never authority.
do $$declare f record;denied boolean;old_fp text;begin
 select * into strict f from pg_temp.m07_recipe_fixture;
 select context_fingerprint into strict old_fp from private.capital_public_input_snapshots where job_id=f.job_id;
 begin
  update public.capital_project_briefs set content_fingerprint=repeat('8',64) where id=((f.base->>'canonicalContext')::jsonb#>>'{brief,id}')::uuid;
  denied:=false;begin perform public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'm07_changed_brief_allowed';end if;
  raise exception 'rollback_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 begin
  update storage.objects set version='replaced-context-version' where id=f.object_id;
  denied:=false;begin perform public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'm07_changed_physical_context_allowed';end if;
  raise exception 'rollback_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 begin
  update private.capital_public_payload_purge_queue set effective_purge_at=clock_timestamp()-interval '1 second',next_check_at=clock_timestamp()-interval '1 second' where allocation_id=(f.allocation->>'allocationId')::uuid;
  perform public.worker_claim_capital_capture_purge_v1(repeat('w',64),100);
  if not exists(select 1 from private.capital_public_payload_purge_queue where allocation_id=(f.allocation->>'allocationId')::uuid and status='leased') then raise exception 'm07_purger_did_not_claim_due_context';end if;
  denied:=false;begin perform public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'm07_expired_context_allowed';end if;
  raise exception 'rollback_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 begin
  perform public.revoke_resource_access_v1((f.base->>'workId')::uuid,'10000000-0000-4000-8000-000000000201');
  denied:=false;begin perform public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'm07_revoked_human_work_allowed';end if;
  raise exception 'rollback_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 begin
  update private.capital_public_retention_controls set enabled=false;
  denied:=false;begin perform public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'm07_disabled_retention_allowed';end if;
  raise exception 'rollback_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 begin
  update private.worker_tokens set status='revoked',revoked_at=clock_timestamp() where token_sha256=extensions.digest(repeat('w',64),'sha256');
  denied:=false;begin perform public.worker_load_capital_project_capture_context_v1(f.job_id,f.capability);exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'm07_revoked_worker_allowed';end if;
  raise exception 'rollback_probe' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 if (select context_fingerprint from private.capital_public_input_snapshots where job_id=f.job_id)<>old_fp then raise exception 'm07_original_capsule_rewritten';end if;
end $$;
select name,'PASS' as result from unnest(array['m07_capture_before_physical_commit_denied','m07_native_capsule_has_no_context_body','m07_real_producer_preserves_input_capsule','m07_changed_brief_denied','m07_changed_physical_context_denied','m07_real_purge_lease_denied','m07_human_work_revocation_denied','m07_disabled_retention_denied','m07_worker_revocation_denied','m07_original_capsule_not_rewritten']) as t(name);
rollback;
