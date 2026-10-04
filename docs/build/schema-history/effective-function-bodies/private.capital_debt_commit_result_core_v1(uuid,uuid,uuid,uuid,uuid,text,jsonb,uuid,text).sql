CREATE OR REPLACE FUNCTION private.capital_debt_commit_result_core_v1(p_org uuid, p_recipe uuid, p_accepted uuid, p_parsed uuid, p_final uuid, p_final_fingerprint text, p_quality_results jsonb, p_job uuid, p_capability text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r private.capital_debt_recipes;s private.capital_debt_recipe_seals;b private.capital_debt_native_bindings;ok private.capital_debt_accepted_invocations;
 parsed private.capital_public_payload_allocations;final private.capital_public_payload_allocations;pb private.capital_debt_body_bases;fb private.capital_debt_body_bases;
 tr public.capital_project_task_runs;a public.artifacts;head public.artifact_revisions;manifest jsonb;projection jsonb;fp text;
 rid uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();version integer;deps jsonb;receipt uuid;ref jsonb;stamp timestamptz:=clock_timestamp();deadline timestamptz;final_run uuid;authorized_job public.processing_jobs;
begin
 authorized_job:=private.capital_public_capture_job_v1(p_job,p_capability);
 if authorized_job.organization_id is distinct from p_org then raise exception 'capital_debt_task_denied' using errcode='42501';end if;
 if jsonb_typeof(p_quality_results) is distinct from 'array' or jsonb_array_length(p_quality_results)<>7
 or exists(select 1 from jsonb_array_elements(p_quality_results) q where jsonb_typeof(q) is distinct from 'object' or not(q?&array['id','passed']) or q-array['id','passed']<>'{}' or q->'passed' is distinct from 'true'::jsonb)
 or exists(select 1 from unnest(array['schema','citation_allowlist','business_evidence','capacity_boundary','next_batch','unsupported_material_numbers','scope_boundary']) k where(select count(*) from jsonb_array_elements(p_quality_results) q where q->>'id'=k)<>1) then raise exception 'capital_debt_quality_denied' using errcode='42501';end if;
 select * into strict r from private.capital_debt_recipes where organization_id=p_org and id=p_recipe;
 select * into strict s from private.capital_debt_recipe_seals where organization_id=p_org and recipe_id=r.id;
 if exists(select 1 from private.capital_debt_quality_failures where organization_id=p_org and recipe_id=r.id) or exists(select 1 from private.capital_debt_execution_failures where organization_id=p_org and recipe_id=r.id) then raise exception 'capital_debt_quality_failed_terminal' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-debt-recipe:'||p_org::text||':'||r.id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into ok from private.capital_debt_accepted_invocations where organization_id=p_org and recipe_id=r.id and id=p_accepted;
 select x.* into parsed from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=p_parsed and x.content_kind='debt_body';
 select x.* into final from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=p_final and x.content_kind='debt_body';
 select * into pb from private.capital_debt_body_bases where organization_id=p_org and id=parsed.debt_body_basis_id;
 select * into fb from private.capital_debt_body_bases where organization_id=p_org and id=final.debt_body_basis_id;
 if ok.id is null or pb.kind is distinct from 'parsed' or fb.kind is distinct from 'final' or pb.recipe_id<>r.id or fb.recipe_id<>r.id
 or pb.accepted_invocation_id<>ok.id or fb.accepted_invocation_id<>ok.id or fb.parent_retained_payload_id is distinct from p_parsed
 or pb.semantic_fingerprint<>ok.output_fingerprint or fb.semantic_fingerprint is distinct from p_final_fingerprint
 or not private.capital_body_physical_receipt_v1(p_org,p_parsed) or not private.capital_body_physical_receipt_v1(p_org,p_final) then raise exception 'capital_debt_commit_proof_denied' using errcode='42501';end if;
 deadline:=private.capital_debt_recipe_deadline_v1(p_org,r.id,r.human_subject_id);
 if deadline is null or least(deadline,parsed.purge_at,final.purge_at)<=clock_timestamp() or not private.capital_body_retention_healthy_v1(final.policy_id,p_org,final.id) then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 if r.revision_decision_id is not null then
 if not exists(select 1 from private.capital_debt_revision_inputs proof join private.capital_debt_native_bindings prior on(prior.organization_id,prior.recipe_id)=(proof.organization_id,proof.prior_recipe_id)
 where proof.organization_id=p_org and proof.recipe_id=r.id and private.capital_debt_native_read_allowed_v1(p_org,prior.revision_id,r.human_subject_id)
 and not exists(select 1 from private.capital_debt_task_projections own where own.organization_id=p_org and own.recipe_id=r.id))
 then raise exception 'capital_debt_revision_task_chain_required' using errcode='42501';end if;
 else if(select count(*) from private.capital_debt_task_projections d where d.organization_id=p_org and d.recipe_id=r.id)<>23
 or exists(select 1 from public.capital_project_plan_tasks pt where pt.organization_id=p_org and pt.plan_id=r.plan_id and pt.task_id<>'C11' and not exists(
  select 1 from private.capital_debt_task_projections d join public.capital_project_task_runs rt on(rt.organization_id,rt.id)=(d.organization_id,d.task_run_id)
  join private.capital_public_retained_payloads q on(q.organization_id,q.id)=(d.organization_id,d.derived_retained_payload_id)
  where d.organization_id=p_org and d.recipe_id=r.id and rt.plan_task_id=pt.id and rt.status='succeeded'
  and (case when pt.task_id in('M01','M02','M03','M04','M05','M06') then d.accepted_invocation_id is null and d.parsed_retained_payload_id is null else d.accepted_invocation_id=ok.id and d.parsed_retained_payload_id=p_parsed end)
  and private.capital_body_physical_receipt_v1(p_org,d.derived_retained_payload_id) and private.capital_debt_allocation_deadline_v1(p_org,q.allocation_id,r.human_subject_id) is not null))
 then raise exception 'capital_debt_complete_task_chain_required' using errcode='42501';end if;
 end if; select * into b from private.capital_debt_native_bindings where organization_id=p_org and recipe_id=r.id;
 if b.id is not null then
 if b.accepted_invocation_id<>p_accepted or b.parsed_retained_payload_id<>p_parsed or b.final_retained_payload_id<>p_final or b.final_fingerprint<>p_final_fingerprint then raise exception 'capital_debt_commit_conflict' using errcode='23505';end if;
 return jsonb_build_object('schemaVersion','capital-debt-commit-receipt.v1','recipeId',r.id,'executionPlanTaskRunId',s.execution_plan_task_run_id,'taskRunId',b.task_run_id,'capitalArtifactId',b.capital_artifact_id,'revisionId',b.revision_id,'finalFingerprint',b.final_fingerprint,'artifactFingerprint',(select artifact_fingerprint from public.capital_project_artifacts where organization_id=p_org and id=b.capital_artifact_id),'artifactVersion',(select artifact_version from public.capital_project_artifacts where organization_id=p_org and id=b.capital_artifact_id),'replayed',true);
 end if;
 -- The paid response is separate from the real succeeded M06 execution plan. An exact
 -- physical prelude bridge is required; C11 starts only after C09/C10.
 select * into tr from public.capital_project_task_runs where organization_id=p_org and id=s.execution_plan_task_run_id for update;
 if not private.capital_debt_execution_plan_allowed_v1(p_org,r.id,s.execution_plan_task_run_id) or tr.status<>'succeeded' or tr.plan_id<>r.plan_id
 or not exists(select 1 from private.capital_debt_task_projections d where d.organization_id=p_org and(d.recipe_id=r.id or exists(select 1 from private.capital_debt_revision_inputs proof where proof.organization_id=p_org and proof.recipe_id=r.id and proof.predecessor_recipe_id=d.recipe_id and d.task_id='M06')) and d.task_run_id=s.execution_plan_task_run_id and d.accepted_invocation_id is null and d.parsed_retained_payload_id is null)
 then raise exception 'capital_debt_producer_not_committed' using errcode='42501';end if;
 if (authorized_job.payload->>'capital_project_plan_id',authorized_job.payload->>'capital_project_brief_id') is distinct from (r.plan_id::text,r.brief_id::text) then raise exception 'capital_debt_task_denied' using errcode='42501';end if;
 -- Existing server command checks the exact capability and all plan dependency
 -- statuses. This does not replace or reorder C09/C10 to accommodate the model.
 final_run:=private.worker_start_capital_project_task(p_job,p_capability,'C11','offroad.company_debt_view','2026.09.01-v1',s.reconstruction_fingerprint,
 jsonb_build_object('schemaVersion','capital-debt-final-task-context.v1','recipeId',r.id,'executionPlanTaskRunId',s.execution_plan_task_run_id,'acceptedInvocationId',ok.id));
 select * into tr from public.capital_project_task_runs where organization_id=p_org and id=final_run for update;
 if tr.status<>'running' or tr.processing_job_id<>p_job or tr.plan_id<>r.plan_id then raise exception 'capital_debt_task_denied' using errcode='42501';end if;
 if exists(select 1 from public.capital_project_plan_tasks pt cross join lateral unnest(pt.dependencies) needed(task_id)
 where pt.organization_id=p_org and pt.plan_id=r.plan_id and pt.task_id='C11' and not exists(
 select 1 from public.capital_project_plan_tasks dep join public.capital_project_task_runs rt on rt.organization_id=dep.organization_id and rt.plan_task_id=dep.id and rt.status='succeeded'
 join public.capital_project_artifacts ca on ca.organization_id=rt.organization_id and ca.task_run_id=rt.id and ca.status not in('stale','superseded')
 left join private.capital_debt_task_projections bridge on bridge.organization_id=ca.organization_id and bridge.capital_artifact_id=ca.id
 where dep.organization_id=p_org and dep.plan_id=r.plan_id and dep.task_id=needed.task_id
 and((bridge.recipe_id=r.id and bridge.accepted_invocation_id=ok.id) or exists(select 1 from private.capital_debt_revision_inputs proof where proof.organization_id=p_org and proof.recipe_id=r.id and proof.predecessor_recipe_id=bridge.recipe_id and bridge.task_id=needed.task_id and bridge.task_id in('C09','C10'))) and private.capital_body_physical_receipt_v1(p_org,bridge.derived_retained_payload_id)))
 then raise exception 'capital_debt_final_dependencies_denied' using errcode='42501';end if;
 if exists(select 1 from private.capital_debt_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=p_org and c.recipe_id=r.id and c.slot='execution_plan' and(d.status in ('stale','superseded') or d.artifact_version<>c.version)) then raise exception 'capital_debt_dependency_denied' using errcode='42501';end if;
 -- Both writers serialize the same plan/work identity. A reviewed current product
 -- can only be replaced after the existing explicit invalidation command.
 perform 1 from public.capital_project_plans where organization_id=p_org and id=r.plan_id for update;
 if exists(select 1 from public.capital_project_artifacts where organization_id=p_org and capital_project_id=r.work_id and artifact_type='company_debt_diagnostic' and status in ('confirmed','approved')) then raise exception 'capital_artifact_confirmed_requires_invalidation' using errcode='42501';end if;
 select coalesce(max(artifact_version),0)+1 into version from public.capital_project_artifacts where organization_id=p_org and capital_project_id=r.work_id and artifact_type='company_debt_diagnostic';
 select * into a from public.artifacts where organization_id=p_org and work_id=r.work_id and kind='work_product' and subject='C11 company debt diagnostic' for update;
 if a.id is null then insert into public.artifacts(organization_id,work_id,kind,subject) values(p_org,r.work_id,'work_product','C11 company debt diagnostic') returning * into a;end if;
 select * into head from public.artifact_revisions where organization_id=p_org and id=a.head_revision_id;
 manifest:=jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind','work_product','audience','internal','format','json',
 'bytes',jsonb_build_object('sha256',final.payload_fingerprint,'byteLength',final.byte_length,'storage',jsonb_build_object('bucket',final.bucket_id,'path',final.object_path)),
 'method',null,'execution',null,'inputSnapshot',jsonb_build_object('fingerprint',s.reconstruction_fingerprint),'institutionalResult',null,
 'sources','[]'::jsonb,'claims','[]'::jsonb,'traces',jsonb_build_array('capital-debt-recipe:'||r.id::text,'capital-debt-accepted:'||ok.id::text),
 'template',null,'provenance',jsonb_build_object('producer','capital-debt-native-producer.v1','jobId',r.job_id,'taskRunId',final_run,'messageId',null,'capability',null),'legacy',null);
 perform private.validate_artifact_manifest_v1(manifest);
 projection:=jsonb_build_object('schemaVersion','capital-debt-projection.v1','revisionId',rid,'recipeId',r.id,'finalFingerprint',p_final_fingerprint,'physicalSha256',final.payload_fingerprint,'byteLength',final.byte_length);
 fp:=encode(extensions.digest(projection::text,'sha256'),'hex');
 select coalesce(jsonb_agg(jsonb_build_object('artifactId',dependency_artifact_id,'artifactFingerprint',d.artifact_fingerprint) order by c.component_no),'[]') into deps from private.capital_debt_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=p_org and c.recipe_id=r.id and c.slot='execution_plan';
 -- Deferred exact FKs allow the trigger to see real native authority, never a
 -- caller-controlled schema marker, before inserting CPA and revision.
 insert into private.capital_debt_native_bindings(organization_id,work_id,recipe_id,execution_plan_task_run_id,task_run_id,accepted_invocation_id,parsed_retained_payload_id,final_retained_payload_id,capital_artifact_id,revision_id,final_fingerprint,transformation_version)
 values(p_org,r.work_id,r.id,s.execution_plan_task_run_id,final_run,ok.id,p_parsed,p_final,aid,rid,p_final_fingerprint,'company-debt-diagnostic.transform.v1') returning * into b;
 update public.capital_project_artifacts set status='superseded',superseded_at=stamp where organization_id=p_org and capital_project_id=r.work_id and artifact_type='company_debt_diagnostic' and status in ('draft','pending_confirmation');
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,evidence_refs,dependencies,processing_job_id,created_by_kind)
 values(aid,p_org,r.work_id,r.plan_id,final_run,'company_debt_diagnostic','capital-debt-projection.v1',version,'pending_confirmation',s.reconstruction_fingerprint,fp,projection,'[]',deps,r.job_id,'worker');
 insert into public.artifact_revisions(id,organization_id,artifact_id,revision_no,previous_revision_id,audience,origin,manifest,manifest_fingerprint,content_sha256,byte_length)
 values(rid,p_org,a.id,coalesce(head.revision_no,0)+1,head.id,'internal','worker',manifest,encode(extensions.digest(manifest::text,'sha256'),'hex'),final.payload_fingerprint,final.byte_length);
 insert into public.artifact_blocks(organization_id,revision_id,block_no,block_key,kind,content,claims,content_fingerprint) values(p_org,rid,1,'c11-result','section',projection,'[]',fp);
 update public.artifacts set head_revision_id=rid where organization_id=p_org and id=a.id;
 ref:=jsonb_build_object('artifactRevisionId',rid,'manifestFingerprint',encode(extensions.digest(manifest::text,'sha256'),'hex'));
 insert into private.review_basis_receipts(organization_id,work_id,basis_kind,basis_reference,reference_fingerprint,source_count,producer)
 values(p_org,r.work_id,'artifact_revision',ref,encode(extensions.digest(ref::text,'sha256'),'hex'),(select count(*) from private.capital_debt_recipe_components where organization_id=p_org and recipe_id=r.id and slot='source'),'capital-debt-native-producer.v1') returning id into receipt;
 update public.capital_project_task_runs set status='succeeded',completed_at=stamp,output_reference=jsonb_build_object('type','capital_project_artifact','id',aid,'revisionId',rid),output_fingerprint=fp,
 quality_results=p_quality_results,usage='{}',error=null
 where organization_id=p_org and id=final_run;
 if private.capital_debt_recipe_deadline_v1(p_org,r.id,r.human_subject_id) is null or least(deadline,parsed.purge_at,final.purge_at)<=clock_timestamp() then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-debt-commit-receipt.v1','recipeId',r.id,'executionPlanTaskRunId',s.execution_plan_task_run_id,'taskRunId',final_run,'capitalArtifactId',aid,'revisionId',rid,'finalFingerprint',p_final_fingerprint,'artifactFingerprint',fp,'artifactVersion',version,'replayed',false);
end; $function$
