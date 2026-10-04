-- EXTERNAL CANDIDATE ONLY: no execution or migration identity is claimed.
set search_path='';
do $$begin
 if md5((select prosrc from pg_proc where oid='private.worker_prepare_capital_preview_boundary_v1(uuid,text,uuid,text)'::regprocedure))<>'12743ebd3269adb3fd80294a171b0608'
 or md5((select prosrc from pg_proc where oid='private.require_capital_preview_run_v1(uuid,text,uuid,boolean)'::regprocedure))<>'7217a1b2f653169dfcb14d2dafe2a340'
 or md5((select prosrc from pg_proc where oid='private.capital_preview_allocation_deadline_v1(uuid,uuid,uuid)'::regprocedure))<>'d5030fe4eb4156b37e292cdd65243f92'
 or md5((select prosrc from pg_proc where oid='private.capital_preview_run_deadline_v1(uuid,uuid,uuid,boolean)'::regprocedure))<>'77f1ee5f670fb458d16c1394b0d63010' or md5((select prosrc from pg_proc where oid='private.require_capital_preview_recipe_v1(uuid,text,uuid)'::regprocedure))<>'8a40dd7c919a920fd5ed42b8ddc49802'
 or md5((select prosrc from pg_proc where oid='private.capital_preview_projection_deadline_v1(uuid,uuid,uuid,text)'::regprocedure))<>'c8cf61dd6455725dd32c762b74db9c09' then raise exception 'capital_preview_boundary_performance_source_changed';end if;
end$$;
create function private.require_capital_preview_run_proof_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_require_captured boolean default true)
returns table(run_row private.capital_preview_runs,run_deadline timestamptz) language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_runs;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-preview-run:'||j.organization_id::text||':'||p_run_id::text,0))then raise exception 'capital_capture_retry'using errcode='40001';end if;
 select * into r from private.capital_preview_runs where organization_id=j.organization_id and job_id=j.id and id=p_run_id;
 if r.id is null or r.worker_account_id<>auth.uid()or r.human_subject_id<>j.authorization_subject_id or r.work_id<>coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid)
 or r.plan_id::text is distinct from j.payload->>'capital_project_plan_id' or r.brief_id::text is distinct from j.payload->>'capital_project_brief_id'
  then raise exception 'capital_preview_denied'using errcode='42501';end if;
 run_deadline:=private.capital_preview_run_deadline_v1(r.organization_id,r.id,j.authorization_subject_id,p_require_captured);
 if run_deadline is null then raise exception 'capital_preview_denied'using errcode='42501';end if;
 run_row:=r;return next;
end;$$;
revoke all on function private.require_capital_preview_run_proof_v1(uuid,text,uuid,boolean)from public,anon,authenticated,service_role;
create or replace function private.require_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_require_captured boolean default true)
returns private.capital_preview_runs language plpgsql volatile security definer set search_path=''as $$
declare proof record;
begin
 select * into strict proof from private.require_capital_preview_run_proof_v1(p_job_id,p_capability_token,p_run_id,p_require_captured);
 return proof.run_row;
end;$$;
create or replace function private.worker_prepare_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_boundary text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare run private.capital_preview_runs;run_deadline timestamptz;proof record;
 r private.capital_preview_recipes;task public.capital_project_plan_tasks;
begin
 select * into strict proof from private.require_capital_preview_run_proof_v1(p_job_id,p_capability_token,p_run_id,true);
 run:=proof.run_row;run_deadline:=proof.run_deadline;
 if p_boundary is null or p_boundary not in('questions','synthesis')then raise exception 'capital_preview_boundary_invalid'using errcode='22023';end if;
 select *into task from public.capital_project_plan_tasks where organization_id=run.organization_id and plan_id=run.plan_id and task_id=case when p_boundary='questions'then'A01'else'A02'end;
 if task.id is null then raise exception 'capital_preview_boundary_denied'using errcode='42501';end if;
 -- Before either paid boundary, every declared parent is a real succeeded run
 -- with an observed physical native task output in this same run and plan.
 if exists(select 1 from unnest(task.dependencies)parent where not exists(select 1 from public.capital_project_task_runs tr
 join public.capital_project_plan_tasks pt on(pt.organization_id,pt.id)=(tr.organization_id,tr.plan_task_id)
 join private.capital_preview_body_bases b on(b.organization_id,b.task_run_id)=(tr.organization_id,tr.id)
 join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)
 join private.capital_public_retained_payloads physical on(physical.organization_id,physical.allocation_id)=(a.organization_id,a.id)
 where tr.organization_id=run.organization_id and tr.processing_job_id=run.job_id and tr.plan_id=run.plan_id and pt.task_id=parent
 and tr.status='succeeded'and b.run_id=run.id and b.kind='task_output'and private.capital_body_physical_receipt_v1(run.organization_id,physical.id)
 and a.content_kind='preview_body' and b.id=a.preview_body_basis_id
 and least(a.expires_at,a.purge_at,run_deadline)>clock_timestamp()
 and exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=a.organization_id and q.allocation_id=a.id and q.status='pending')))then raise exception 'capital_preview_parents_required'using errcode='42501';end if;
 -- Recheck the full current closure at the end of this operation. No proof survives RPC or transaction.
 select * into strict proof from private.require_capital_preview_run_proof_v1(p_job_id,p_capability_token,p_run_id,true);
 run:=proof.run_row;run_deadline:=proof.run_deadline;
 -- Cheap leaf check again after the wall-clock/current closure pass.
 if exists(select 1 from unnest(task.dependencies)parent where not exists(select 1 from public.capital_project_task_runs tr
 join public.capital_project_plan_tasks pt on(pt.organization_id,pt.id)=(tr.organization_id,tr.plan_task_id)
 join private.capital_preview_body_bases b on(b.organization_id,b.task_run_id)=(tr.organization_id,tr.id)
 join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)
 join private.capital_public_retained_payloads physical on(physical.organization_id,physical.allocation_id)=(a.organization_id,a.id)
 where tr.organization_id=run.organization_id and tr.processing_job_id=run.job_id and tr.plan_id=run.plan_id and pt.task_id=parent
 and tr.status='succeeded'and b.run_id=run.id and b.kind='task_output'and private.capital_body_physical_receipt_v1(run.organization_id,physical.id)
 and a.content_kind='preview_body' and b.id=a.preview_body_basis_id
 and least(a.expires_at,a.purge_at,run_deadline)>clock_timestamp()
 and exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=a.organization_id and q.allocation_id=a.id and q.status='pending')))then raise exception 'capital_preview_parents_required'using errcode='42501';end if;
 select *into r from private.capital_preview_recipes where organization_id=run.organization_id and run_id=run.id and boundary=p_boundary;
 if r.id is null then
 insert into private.capital_preview_recipes(organization_id,work_id,run_id,job_id,plan_id,plan_task_id,boundary,human_subject_id,worker_account_id,renderer_version,retention_policy_id,expires_at)
 values(run.organization_id,run.work_id,run.id,run.job_id,run.plan_id,task.id,p_boundary,run.human_subject_id,run.worker_account_id,'capital-preview-renderer.'||p_boundary||'.v1',run.retention_policy_id,run.expires_at)returning *into r;
 end if;
 return jsonb_build_object('schemaVersion','capital-preview-boundary-base.v1','recipeId',r.id,'boundaryId',r.id,'runId',run.id,'boundary',p_boundary,'planTaskId',r.plan_task_id,'expiresAt',r.expires_at);
end;$$;

create function private.capital_preview_projection_leaf_deadline_v1(p_org uuid,p_run uuid,p_task text,p_run_deadline timestamptz)
returns timestamptz language plpgsql volatile security definer set search_path=''as $$
declare x private.capital_preview_task_projections;a private.capital_public_payload_allocations;deadline timestamptz;
begin
 select *into x from private.capital_preview_task_projections where organization_id=p_org and run_id=p_run and task_id=p_task and role='task_output';
 if x.id is null or not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_artifacts c on(c.organization_id,c.id)=(tr.organization_id,x.capital_artifact_id)
 where tr.organization_id=p_org and tr.id=x.task_run_id and tr.status='succeeded'and tr.output_fingerprint=x.artifact_fingerprint and c.artifact_fingerprint=x.artifact_fingerprint and c.status not in('stale','superseded'))then return null;end if;
 select allocation.*into a from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.id)=(retained.organization_id,retained.allocation_id)where retained.organization_id=p_org and retained.id=x.retained_payload_id;
 deadline:=p_run_deadline;
 if deadline is null or not private.capital_body_physical_receipt_v1(p_org,x.retained_payload_id)or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending')then return null;end if;
 deadline:=least(deadline,a.expires_at,a.purge_at);if deadline<=clock_timestamp()then return null;end if;return deadline;
end;$$;
revoke all on function private.capital_preview_projection_leaf_deadline_v1(uuid,uuid,text,timestamptz)from public,anon,authenticated,service_role;
create or replace function private.require_capital_preview_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns private.capital_preview_recipes language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_recipes;run private.capital_preview_runs;dep text;task public.capital_project_plan_tasks;proof record;run_deadline timestamptz;
begin
 select * into r from private.capital_preview_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null then raise exception 'capital_preview_denied'using errcode='42501';end if;
 select * into strict proof from private.require_capital_preview_run_proof_v1(j.id,p_capability_token,r.run_id,true);
 run:=proof.run_row;run_deadline:=proof.run_deadline;
 if r.human_subject_id<>j.authorization_subject_id or r.worker_account_id<>auth.uid()or not exists(select 1 from private.capital_preview_recipe_seals s
 where s.organization_id=r.organization_id and s.recipe_id=r.id and s.plan_task_id=r.plan_task_id
 and private.capital_body_physical_receipt_v1(r.organization_id,s.input_retained_payload_id))then raise exception 'capital_preview_denied'using errcode='42501';end if;
 select *into strict task from public.capital_project_plan_tasks where organization_id=r.organization_id and id=r.plan_task_id;
 foreach dep in array task.dependencies loop
 if private.capital_preview_projection_leaf_deadline_v1(r.organization_id,r.run_id,dep,run_deadline)is null then raise exception 'capital_preview_parent_denied'using errcode='42501';end if;
 end loop;
 -- Revalidate the complete run at the end, then cheap sealed-input and parent leaves.
 select * into strict proof from private.require_capital_preview_run_proof_v1(j.id,p_capability_token,r.run_id,true);
 run:=proof.run_row;run_deadline:=proof.run_deadline;
 if r.human_subject_id<>j.authorization_subject_id or r.worker_account_id<>auth.uid()or not exists(select 1 from private.capital_preview_recipe_seals s
 where s.organization_id=r.organization_id and s.recipe_id=r.id and s.plan_task_id=r.plan_task_id
 and private.capital_body_physical_receipt_v1(r.organization_id,s.input_retained_payload_id))then raise exception 'capital_preview_denied'using errcode='42501';end if;
 foreach dep in array task.dependencies loop
 if private.capital_preview_projection_leaf_deadline_v1(r.organization_id,r.run_id,dep,run_deadline)is null then raise exception 'capital_preview_parent_denied'using errcode='42501';end if;
 end loop;
 return r;
end;$$;
