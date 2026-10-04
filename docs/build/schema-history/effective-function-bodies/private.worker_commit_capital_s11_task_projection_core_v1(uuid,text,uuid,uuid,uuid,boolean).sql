CREATE OR REPLACE FUNCTION private.worker_commit_capital_s11_task_projection_core_v1(p_job_id uuid, p_capability_token text, p_recipe_id uuid, p_task_run_id uuid, p_retained_payload_id uuid, p_recovery boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r private.capital_s11_recipes:=private.capital_s11_task_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_recovery);
 j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 tr public.capital_project_task_runs:=private.require_capital_s11_task_run_v1(j.organization_id,r.id,p_task_run_id,case when p_recovery then j.id end);
 pt public.capital_project_plan_tasks;old private.capital_s11_task_projections;
 a private.capital_public_payload_allocations;b private.capital_s11_body_bases;deps jsonb;dep text;dep_art public.capital_project_artifacts;
 projection jsonb;fp text;aid uuid:=gen_random_uuid();v integer;stamp timestamptz:=clock_timestamp();deadline timestamptz;
begin
 select * into tr from public.capital_project_task_runs where organization_id=j.organization_id and id=p_task_run_id for update;
 select * into strict pt from public.capital_project_plan_tasks where organization_id=j.organization_id and id=tr.plan_task_id;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_retained_payload_id and x.content_kind='s11_body';
 select * into b from private.capital_s11_body_bases where organization_id=j.organization_id and id=a.s11_body_basis_id;
 deadline:=private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if a.id is null or b.kind is distinct from(case when pt.task_id in('M01','M02','M03') then 'prelude' else 'derived' end) or b.recipe_id is distinct from r.id or b.task_id is distinct from pt.task_id or b.task_run_id is distinct from tr.id or deadline is null
 or not private.capital_body_physical_receipt_v1(j.organization_id,p_retained_payload_id)
 or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_s11_task_body_denied' using errcode='42501';end if;
 select * into old from private.capital_s11_task_projections where organization_id=j.organization_id and recipe_id=r.id and task_id=pt.task_id;
 if old.id is not null then
 if old.task_run_id<>tr.id or old.derived_retained_payload_id<>p_retained_payload_id or old.semantic_fingerprint<>b.semantic_fingerprint
 or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=j.organization_id and c.id=old.capital_artifact_id and c.artifact_fingerprint=old.artifact_fingerprint and c.status not in('stale','superseded')) then raise exception 'capital_s11_task_replay_denied' using errcode='42501';end if;
 return private.capital_s11_task_projection_dto_v1(j.organization_id,r.id,tr.id,true);
 end if;
 if tr.status<>'running' then raise exception 'capital_s11_task_run_denied' using errcode='42501';end if;
 deps:='[]';
 foreach dep in array pt.dependencies loop
 select c.* into dep_art from public.capital_project_artifacts c
 join public.capital_project_task_runs dr on dr.organization_id=c.organization_id and dr.id=c.task_run_id
 join public.capital_project_plan_tasks dp on dp.organization_id=dr.organization_id and dp.id=dr.plan_task_id
 where c.organization_id=j.organization_id and c.capital_project_id=r.work_id and c.plan_id=r.plan_id and dp.task_id=dep
 and(dr.processing_job_id in(r.job_id,j.id) or(pt.task_id='M04' and dep in('M01','M02') and exists(select 1 from private.capital_s11_revision_inputs lineage join private.capital_s11_task_projections proof on proof.organization_id=lineage.organization_id and proof.recipe_id=lineage.predecessor_recipe_id where lineage.organization_id=j.organization_id and lineage.recipe_id=r.id and proof.task_id=dep and proof.task_run_id=dr.id and proof.capital_artifact_id=c.id and proof.artifact_fingerprint=c.artifact_fingerprint))) and dr.status='succeeded' and c.status not in('stale','superseded')
 order by c.artifact_version desc limit 1;
 if dep_art.id is null then raise exception 'capital_s11_task_dependencies_incomplete' using errcode='42501';end if;
 if private.capital_s11_task_type_v1(dep) is not null and not exists(select 1 from private.capital_s11_task_projections x join private.capital_public_retained_payloads q on q.organization_id=x.organization_id and q.id=x.derived_retained_payload_id join private.capital_public_payload_allocations z on z.organization_id=q.organization_id and z.id=q.allocation_id where x.organization_id=j.organization_id and x.capital_artifact_id=dep_art.id and x.artifact_fingerprint=dep_art.artifact_fingerprint and(x.recipe_id=r.id or(pt.task_id='M04' and dep in('M01','M02') and exists(select 1 from private.capital_s11_revision_inputs lineage where lineage.organization_id=j.organization_id and lineage.recipe_id=r.id and lineage.predecessor_recipe_id=x.recipe_id and x.task_id=dep))) and private.capital_s11_allocation_deadline_v1(j.organization_id,z.id,j.authorization_subject_id) is not null and private.capital_body_physical_receipt_v1(j.organization_id,q.id)) then raise exception 'capital_s11_task_dependency_body_denied' using errcode='42501';end if;
 deps:=deps||jsonb_build_array(jsonb_build_object('artifactId',dep_art.id,'artifactFingerprint',dep_art.artifact_fingerprint));
 end loop;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-artifact:'||r.work_id::text||':'||private.capital_s11_task_type_v1(pt.task_id),0)) then raise exception 'capital_s11_task_retry' using errcode='40001';end if;
 select coalesce(max(artifact_version),0)+1 into v from public.capital_project_artifacts where organization_id=j.organization_id and capital_project_id=r.work_id and artifact_type=private.capital_s11_task_type_v1(pt.task_id);
 projection:=jsonb_build_object('schemaVersion','capital-s11-task-projection.v1','recipeId',r.id,'taskId',pt.task_id,'retainedPayloadId',p_retained_payload_id,
 'semanticFingerprint',b.semantic_fingerprint,'physicalSha256',a.payload_fingerprint,'byteLength',a.byte_length);
 fp:=encode(extensions.digest(projection::text,'sha256'),'hex');
 insert into private.capital_s11_task_projections(organization_id,work_id,recipe_id,task_id,task_run_id,capital_artifact_id,accepted_invocation_id,parsed_retained_payload_id,derived_retained_payload_id,semantic_fingerprint,artifact_fingerprint,artifact_version)
 values(j.organization_id,r.work_id,r.id,pt.task_id,tr.id,aid,b.accepted_invocation_id,case when pt.task_id in('M01','M02','M03') then null else b.parent_retained_payload_id end,p_retained_payload_id,b.semantic_fingerprint,fp,v);
 update public.capital_project_artifacts set status='superseded',superseded_at=stamp where organization_id=j.organization_id and capital_project_id=r.work_id and artifact_type=private.capital_s11_task_type_v1(pt.task_id) and status in('draft','pending_confirmation');
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,evidence_refs,dependencies,processing_job_id,created_by_kind)
 values(aid,j.organization_id,r.work_id,r.plan_id,tr.id,private.capital_s11_task_type_v1(pt.task_id),'capital-s11-task-projection.v1',v,'draft',tr.input_fingerprint,fp,projection,'[]',deps,tr.processing_job_id,'worker');
 update public.capital_project_task_runs set status='succeeded',completed_at=stamp,output_reference=jsonb_build_object('type','capital_project_artifact','id',aid),output_fingerprint=fp,
 quality_results=jsonb_build_array(jsonb_build_object('id','bounded_output','passed',true)),usage='{}',error=null where organization_id=j.organization_id and id=tr.id;
 if private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_task_denied' using errcode='42501';end if;
 return private.capital_s11_task_projection_dto_v1(j.organization_id,r.id,tr.id,false);
end; $function$
