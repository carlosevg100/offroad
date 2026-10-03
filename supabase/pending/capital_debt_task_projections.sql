-- Assemble after company-debt ledger, before native commit. No independent publication.
-- Internal products preserve accepted bytes through bounded Storage; CPA contains only pointers.
set search_path='';
alter table private.capital_debt_body_bases add column accepted_invocation_id uuid,add column parent_retained_payload_id uuid,add column task_id text,add column task_run_id uuid,
 add constraint capital_debt_basis_task_run_fk foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id),
 add constraint capital_debt_basis_accepted_fk foreign key(organization_id,accepted_invocation_id) references private.capital_debt_accepted_invocations(organization_id,id),
 add constraint capital_debt_basis_parent_fk foreign key(organization_id,parent_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 add constraint capital_debt_basis_derivation_check check(
 (kind='context' and accepted_invocation_id is null and parent_retained_payload_id is null and semantic_fingerprint is null and task_id is null and task_run_id is null)
 or(kind='parsed' and accepted_invocation_id is not null and parent_retained_payload_id is null and semantic_fingerprint is not null and task_id is null and task_run_id is null)
 or(kind='final' and accepted_invocation_id is not null and parent_retained_payload_id is not null and semantic_fingerprint is not null and task_id is null and task_run_id is null)
 or(kind='prelude' and accepted_invocation_id is null and parent_retained_payload_id is not null and semantic_fingerprint is not null and task_id in('M01','M02','M03','M04','M05','M06') and task_run_id is not null)
 or(kind='derived' and accepted_invocation_id is not null and parent_retained_payload_id is not null and semantic_fingerprint is not null and task_id~'^[A-Z][0-9]{2}$' and task_run_id is not null));
create index capital_debt_basis_accepted_idx on private.capital_debt_body_bases(organization_id,accepted_invocation_id);
create index capital_debt_basis_task_run_idx on private.capital_debt_body_bases(organization_id,task_run_id);
create index capital_debt_basis_parent_idx on private.capital_debt_body_bases(organization_id,parent_retained_payload_id);

-- Parent scopes are proved separately from JS semantic fingerprints. No
-- final/derived body can outlive its real accepted parsed physical parent.
create or replace function private.capital_debt_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;b private.capital_debt_body_bases;parent private.capital_public_payload_allocations;pb private.capital_debt_body_bases;d timestamptz;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='debt_body';
 select * into b from private.capital_debt_body_bases where organization_id=p_org and id=a.debt_body_basis_id;
 if b.id is null then return null;end if;
 d:=private.capital_debt_recipe_deadline_v1(p_org,b.recipe_id,p_subject);
 if d is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 if b.parent_retained_payload_id is not null then
 select allocation.* into parent from private.capital_public_retained_payloads q join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.id)=(q.organization_id,q.allocation_id) where(q.organization_id,q.id)=(p_org,b.parent_retained_payload_id) and allocation.content_kind='debt_body';
 select * into pb from private.capital_debt_body_bases where(organization_id,id)=(p_org,parent.debt_body_basis_id);
 if parent.id is null or pb.recipe_id is distinct from b.recipe_id or parent.id=a.id or not private.capital_body_physical_receipt_v1(p_org,b.parent_retained_payload_id)
 or not exists(select 1 from private.capital_public_payload_purge_queue q where(q.organization_id,q.allocation_id)=(p_org,parent.id) and q.status='pending')
 or(b.kind='prelude' and pb.kind is distinct from 'context')
 or(b.kind in('derived','final') and(pb.kind is distinct from 'parsed' or pb.accepted_invocation_id is distinct from b.accepted_invocation_id)) then return null;end if;
 d:=least(d,parent.expires_at,parent.purge_at);
 end if;
 return case when least(d,a.expires_at,a.purge_at)>clock_timestamp() then least(d,a.expires_at,a.purge_at) end;
end;$$;

create function private.capital_debt_task_type_v1(p_task text) returns text language sql immutable set search_path='' as $$
 select case p_task
 when 'M01' then 'company_resolution'
 when 'M02' then 'diagnostic_mandate'
 when 'M03' then 'constraint_register'
 when 'M04' then 'diagnostic_lenses'
 when 'M05' then 'diagnostic_definition'
 when 'M06' then 'company_debt_execution_plan'
 when 'D01' then 'document_ingestion_status'
 when 'D02' then 'document_classification_status'
 when 'D03' then 'document_extraction_status'
 when 'D04' then 'document_fact_candidate_status'
 when 'D05' then 'entity_period_unit_resolution'
 when 'D06' then 'evidence_reconciliation_status'
 when 'D07' then 'accounting_identity_status'
 when 'C01' then 'business_model_reconstruction'
 when 'C02' then 'sector_regulatory_research'
 when 'C03' then 'public_financial_spreading'
 when 'C04' then 'earnings_quality_analysis'
 when 'C05' then 'debt_economic_map'
 when 'C06' then 'working_capital_analysis'
 when 'C07' then 'projection_normalization'
 when 'C08' then 'scenario_stress_analysis'
 when 'C09' then 'risk_mitigation_diagnostic'
 when 'C10' then 'capacity_assessment'

 end;
$$;
create table private.capital_debt_task_projections(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 recipe_id uuid not null,task_id text not null,task_run_id uuid not null,capital_artifact_id uuid not null,
 accepted_invocation_id uuid,parsed_retained_payload_id uuid,derived_retained_payload_id uuid not null,
 semantic_fingerprint text not null check(semantic_fingerprint~'^[a-f0-9]{64}$'),artifact_fingerprint text not null check(artifact_fingerprint~'^[a-f0-9]{64}$'),artifact_version integer not null check(artifact_version>0),
 transformation_version text not null default 'company-debt-task.transform.v1' check(transformation_version='company-debt-task.transform.v1'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id,task_id),unique(organization_id,task_run_id),unique(organization_id,capital_artifact_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,capital_artifact_id) references public.capital_project_artifacts(organization_id,id) deferrable initially deferred,
 foreign key(organization_id,accepted_invocation_id) references private.capital_debt_accepted_invocations(organization_id,id),
 foreign key(organization_id,parsed_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,derived_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 check(private.capital_debt_task_type_v1(task_id) is not null),
 check((task_id in('M01','M02','M03','M04','M05','M06') and accepted_invocation_id is null and parsed_retained_payload_id is null) or(task_id not in('M01','M02','M03','M04','M05','M06') and accepted_invocation_id is not null and parsed_retained_payload_id is not null))
);
create index capital_debt_task_projection_work_idx on private.capital_debt_task_projections(organization_id,work_id,recipe_id);
create index capital_debt_task_projection_accepted_idx on private.capital_debt_task_projections(organization_id,accepted_invocation_id);
create index capital_debt_task_projection_parsed_idx on private.capital_debt_task_projections(organization_id,parsed_retained_payload_id);
create index capital_debt_task_projection_retained_idx on private.capital_debt_task_projections(organization_id,derived_retained_payload_id);
alter table private.capital_debt_task_projections enable row level security;
alter table private.capital_debt_task_projections force row level security;
revoke all on private.capital_debt_task_projections from public,anon,authenticated,service_role;
create policy capital_debt_tasks_deny_select on private.capital_debt_task_projections as restrictive for select to anon,authenticated using(false);
create policy capital_debt_tasks_deny_insert on private.capital_debt_task_projections as restrictive for insert to anon,authenticated with check(false);
create policy capital_debt_tasks_deny_update on private.capital_debt_task_projections as restrictive for update to anon,authenticated using(false) with check(false);
create policy capital_debt_tasks_deny_delete on private.capital_debt_task_projections as restrictive for delete to anon,authenticated using(false);
create trigger capital_debt_tasks_immutable before update or delete on private.capital_debt_task_projections for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_debt_tasks_no_truncate before truncate on private.capital_debt_task_projections for each statement execute function private.reject_review_history_mutation_v1();
create trigger capital_debt_tasks_updated_at before update on private.capital_debt_task_projections for each row execute function private.set_updated_at();
create trigger capital_debt_tasks_audit after insert on private.capital_debt_task_projections for each row execute function private.capture_identity_audit_v1();

create function private.require_capital_debt_task_run_v1(p_org uuid,p_recipe uuid,p_task_run uuid,p_authorized_job_id uuid default null)
returns public.capital_project_task_runs language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_debt_recipes;tr public.capital_project_task_runs;pt public.capital_project_plan_tasks;
begin
 select * into r from private.capital_debt_recipes where organization_id=p_org and id=p_recipe;
 select * into tr from public.capital_project_task_runs where organization_id=p_org and id=p_task_run;
 select * into pt from public.capital_project_plan_tasks where organization_id=p_org and id=tr.plan_task_id;
 if r.id is null or tr.id is null or tr.capital_project_id is distinct from r.work_id or(tr.processing_job_id is distinct from r.job_id and tr.processing_job_id is distinct from p_authorized_job_id)
 or(pt.task_id in('M01','M02','M03','M04','M05','M06') and tr.processing_job_id is distinct from r.job_id)
 or pt.plan_id is distinct from r.plan_id or private.capital_debt_task_type_v1(pt.task_id) is null
 or tr.executor_key is distinct from 'offroad.company_debt_view' or tr.executor_version is distinct from '2026.09.01-v1'
 or tr.status not in('running','succeeded') then raise exception 'capital_debt_task_run_denied' using errcode='42501';end if;
 return tr;
end; $$;
create function private.capital_debt_task_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_recovery boolean default false)
returns private.capital_debt_recipes language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_debt_recipes;tr public.capital_project_task_runs;task text;grant_row jsonb;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-debt-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 if p_recovery then
 grant_row:=private.worker_recover_capital_debt_result_v1(p_job_id,p_capability_token,p_recipe_id);
 if grant_row->>'state' is null or grant_row->>'state' not in('transform','commit','committed') then raise exception 'capital_debt_recovered_task_denied' using errcode='42501';end if;
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and id=p_recipe_id;
 perform private.require_capital_debt_task_run_v1(j.organization_id,r.id,p_task_run_id,j.id);
 if r.id is null or private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null then raise exception 'capital_debt_recovered_task_denied' using errcode='42501';end if;
 return r;
 end if;
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 tr:=private.require_capital_debt_task_run_v1(j.organization_id,r.id,p_task_run_id,case when p_recovery then j.id end);
 select task_id into task from public.capital_project_plan_tasks where organization_id=j.organization_id and id=tr.plan_task_id;
 if task not in('M01','M02','M03','M04','M05','M06') or exists(select 1 from private.capital_debt_recipe_seals where organization_id=j.organization_id and recipe_id=r.id) then return private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id);end if;
 if r.id is null or r.worker_account_id is distinct from auth.uid() or r.human_subject_id is distinct from j.authorization_subject_id
 or private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null
 or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_prelude_denied' using errcode='42501';end if;
 return r;
end; $$;

create function private.worker_prepare_capital_debt_task_projection_core_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,
 p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid,p_recovery boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.capital_debt_recipes;grant_row jsonb;
 j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);ok private.capital_debt_accepted_invocations;
 tr public.capital_project_task_runs;task text;b private.capital_debt_body_bases;parent private.capital_debt_body_bases;a private.capital_public_payload_allocations;
 parent_a private.capital_public_payload_allocations;p private.capital_public_retention_policies;deadline timestamptz;fp text;bytes bigint;stamp timestamptz:=clock_timestamp();replayed boolean:=false;
begin
 r:=private.capital_debt_task_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_recovery);
 tr:=private.require_capital_debt_task_run_v1(j.organization_id,r.id,p_task_run_id,case when p_recovery then j.id end);
 select task_id into task from public.capital_project_plan_tasks where organization_id=j.organization_id and id=tr.plan_task_id;
 if exists(select 1 from private.capital_debt_quality_failures where organization_id=j.organization_id and recipe_id=r.id) or exists(select 1 from private.capital_debt_execution_failures where organization_id=j.organization_id and recipe_id=r.id) then raise exception 'capital_debt_quality_failed_terminal' using errcode='42501';end if;
 if p_request_id is null or jsonb_typeof(p_body) is distinct from 'object'
 or p_output_fingerprint is null or p_output_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'capital_debt_output_invalid' using errcode='22023';end if;
 select * into ok from private.capital_debt_accepted_invocations where organization_id=j.organization_id and job_id=r.job_id and recipe_id=r.id and id=p_accepted_invocation_id;
 if task not in('M01','M02','M03','M04','M05','M06') and ok.id is null then raise exception 'capital_debt_accepted_denied' using errcode='42501';end if;
 if p_body->>'schemaVersion' is distinct from 'company-debt-task.v1' or p_body->>'taskId' is distinct from task
 or p_body->>'artifactType' is distinct from private.capital_debt_task_type_v1(task) or jsonb_typeof(p_body->'content') is distinct from 'object'
 or p_body-array['schemaVersion','taskId','artifactType','content']<>'{}'::jsonb then raise exception 'capital_debt_task_body_invalid' using errcode='22023';end if;
 select x.* into parent_a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_parent_retained_payload_id and x.content_kind='debt_body';
 select * into parent from private.capital_debt_body_bases where organization_id=j.organization_id and id=parent_a.debt_body_basis_id;
 if parent.id is null or parent.recipe_id<>r.id or not private.capital_body_physical_receipt_v1(j.organization_id,p_parent_retained_payload_id)
 or(task in('M01','M02','M03','M04','M05','M06') and(parent.kind is distinct from 'context' or p_accepted_invocation_id is not null or parent.accepted_invocation_id is not null or parent_a.payload_fingerprint is distinct from r.context_fingerprint))
 or(task not in('M01','M02','M03','M04','M05','M06') and(parent.kind is distinct from 'parsed' or parent.accepted_invocation_id is distinct from ok.id or parent.semantic_fingerprint is distinct from ok.output_fingerprint)) then raise exception 'capital_debt_parent_denied' using errcode='42501';end if;
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_debt_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 deadline:=least(deadline,parent_a.expires_at,parent_a.purge_at);
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 fp:=encode(extensions.digest(p_body::text,'sha256'),'hex');bytes:=octet_length(p_body::text);
 if bytes not between 1 and 1048576 then raise exception 'capital_debt_body_size_invalid' using errcode='22023';end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and job_id=j.id and request_id=p_request_id and content_kind='debt_body';
 if a.id is not null then
 select * into strict b from private.capital_debt_body_bases where organization_id=j.organization_id and id=a.debt_body_basis_id;
 if b.recipe_id<>r.id or b.kind is distinct from(case when task in('M01','M02','M03','M04','M05','M06') then 'prelude' else 'derived' end) or b.task_id is distinct from task or b.task_run_id is distinct from tr.id or b.accepted_invocation_id is distinct from ok.id or b.parent_retained_payload_id is distinct from p_parent_retained_payload_id or b.semantic_fingerprint<>p_output_fingerprint or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_debt_output_conflict' using errcode='23505';end if;
 replayed:=true;
 if private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_debt_retention_denied' using errcode='42501';end if;
 else
 insert into private.capital_debt_body_bases(organization_id,work_id,recipe_id,kind,task_id,task_run_id,semantic_fingerprint,accepted_invocation_id,parent_retained_payload_id)
 values(j.organization_id,r.work_id,r.id,case when task in('M01','M02','M03','M04','M05','M06') then 'prelude' else 'derived' end,task,tr.id,p_output_fingerprint,ok.id,p_parent_retained_payload_id) returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,
 payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,debt_body_basis_id,content_kind)
 values(b.id,j.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,bytes,j.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'debt_body') returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at) values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_denied' using errcode='42501';end if;
 return private.capital_debt_body_dto_v1(j.organization_id,a.id,deadline,replayed)||jsonb_build_object('canonicalBody',p_body::text);
end; $$;


create function private.capital_debt_task_projection_dto_v1(p_org uuid,p_recipe uuid,p_task_run uuid,p_replayed boolean)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-debt-task-projection-receipt.v1','recipeId',x.recipe_id,'taskId',x.task_id,'taskRunId',x.task_run_id,
 'capitalArtifactId',x.capital_artifact_id,'artifactFingerprint',x.artifact_fingerprint,'artifactVersion',x.artifact_version,
 'retainedPayloadId',x.derived_retained_payload_id,'replayed',p_replayed)
 from private.capital_debt_task_projections x where x.organization_id=p_org and x.recipe_id=p_recipe and x.task_run_id=p_task_run;
$$;
create function private.worker_commit_capital_debt_task_projection_core_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid,p_recovery boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_debt_recipes:=private.capital_debt_task_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_recovery);
 j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 tr public.capital_project_task_runs:=private.require_capital_debt_task_run_v1(j.organization_id,r.id,p_task_run_id,case when p_recovery then j.id end);
 pt public.capital_project_plan_tasks;old private.capital_debt_task_projections;
 a private.capital_public_payload_allocations;b private.capital_debt_body_bases;deps jsonb;dep text;dep_art public.capital_project_artifacts;
 projection jsonb;fp text;aid uuid:=gen_random_uuid();v integer;stamp timestamptz:=clock_timestamp();deadline timestamptz;
begin
 select * into tr from public.capital_project_task_runs where organization_id=j.organization_id and id=p_task_run_id for update;
 select * into strict pt from public.capital_project_plan_tasks where organization_id=j.organization_id and id=tr.plan_task_id;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_retained_payload_id and x.content_kind='debt_body';
 select * into b from private.capital_debt_body_bases where organization_id=j.organization_id and id=a.debt_body_basis_id;
 deadline:=private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if a.id is null or b.kind is distinct from(case when pt.task_id in('M01','M02','M03','M04','M05','M06') then 'prelude' else 'derived' end) or b.recipe_id is distinct from r.id or b.task_id is distinct from pt.task_id or b.task_run_id is distinct from tr.id or deadline is null
 or not private.capital_body_physical_receipt_v1(j.organization_id,p_retained_payload_id)
 or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_debt_task_body_denied' using errcode='42501';end if;
 select * into old from private.capital_debt_task_projections where organization_id=j.organization_id and recipe_id=r.id and task_id=pt.task_id;
 if old.id is not null then
 if old.task_run_id<>tr.id or old.derived_retained_payload_id<>p_retained_payload_id or old.semantic_fingerprint<>b.semantic_fingerprint
 or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=j.organization_id and c.id=old.capital_artifact_id and c.artifact_fingerprint=old.artifact_fingerprint and c.status not in('stale','superseded')) then raise exception 'capital_debt_task_replay_denied' using errcode='42501';end if;
 return private.capital_debt_task_projection_dto_v1(j.organization_id,r.id,tr.id,true);
 end if;
 if tr.status<>'running' then raise exception 'capital_debt_task_run_denied' using errcode='42501';end if;
 deps:='[]';
 foreach dep in array pt.dependencies loop
 select c.* into dep_art from public.capital_project_artifacts c
 join public.capital_project_task_runs dr on dr.organization_id=c.organization_id and dr.id=c.task_run_id
 join public.capital_project_plan_tasks dp on dp.organization_id=dr.organization_id and dp.id=dr.plan_task_id
 where c.organization_id=j.organization_id and c.capital_project_id=r.work_id and c.plan_id=r.plan_id and dp.task_id=dep
 and dr.processing_job_id in(r.job_id,j.id) and dr.status='succeeded' and c.status not in('stale','superseded')
 order by c.artifact_version desc limit 1;
 if dep_art.id is null then raise exception 'capital_debt_task_dependencies_incomplete' using errcode='42501';end if;
 if private.capital_debt_task_type_v1(dep) is not null and not exists(select 1 from private.capital_debt_task_projections x join private.capital_public_retained_payloads q on q.organization_id=x.organization_id and q.id=x.derived_retained_payload_id join private.capital_public_payload_allocations z on z.organization_id=q.organization_id and z.id=q.allocation_id where x.organization_id=j.organization_id and x.recipe_id=r.id and x.capital_artifact_id=dep_art.id and x.artifact_fingerprint=dep_art.artifact_fingerprint and private.capital_debt_allocation_deadline_v1(j.organization_id,z.id,j.authorization_subject_id) is not null and private.capital_body_physical_receipt_v1(j.organization_id,q.id)) then raise exception 'capital_debt_task_dependency_body_denied' using errcode='42501';end if;
 deps:=deps||jsonb_build_array(jsonb_build_object('artifactId',dep_art.id,'artifactFingerprint',dep_art.artifact_fingerprint));
 end loop;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-artifact:'||r.work_id::text||':'||private.capital_debt_task_type_v1(pt.task_id),0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select coalesce(max(artifact_version),0)+1 into v from public.capital_project_artifacts where organization_id=j.organization_id and capital_project_id=r.work_id and artifact_type=private.capital_debt_task_type_v1(pt.task_id);
 projection:=jsonb_build_object('schemaVersion','capital-debt-task-projection.v1','recipeId',r.id,'taskId',pt.task_id,'retainedPayloadId',p_retained_payload_id,
 'semanticFingerprint',b.semantic_fingerprint,'physicalSha256',a.payload_fingerprint,'byteLength',a.byte_length);
 fp:=encode(extensions.digest(projection::text,'sha256'),'hex');
 insert into private.capital_debt_task_projections(organization_id,work_id,recipe_id,task_id,task_run_id,capital_artifact_id,accepted_invocation_id,parsed_retained_payload_id,derived_retained_payload_id,semantic_fingerprint,artifact_fingerprint,artifact_version)
 values(j.organization_id,r.work_id,r.id,pt.task_id,tr.id,aid,b.accepted_invocation_id,case when pt.task_id in('M01','M02','M03','M04','M05','M06') then null else b.parent_retained_payload_id end,p_retained_payload_id,b.semantic_fingerprint,fp,v);
 update public.capital_project_artifacts set status='superseded',superseded_at=stamp where organization_id=j.organization_id and capital_project_id=r.work_id and artifact_type=private.capital_debt_task_type_v1(pt.task_id) and status in('draft','pending_confirmation');
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,evidence_refs,dependencies,processing_job_id,created_by_kind)
 values(aid,j.organization_id,r.work_id,r.plan_id,tr.id,private.capital_debt_task_type_v1(pt.task_id),'capital-debt-task-projection.v1',v,'draft',tr.input_fingerprint,fp,projection,'[]',deps,tr.processing_job_id,'worker');
 update public.capital_project_task_runs set status='succeeded',completed_at=stamp,output_reference=jsonb_build_object('type','capital_project_artifact','id',aid),output_fingerprint=fp,
 quality_results=jsonb_build_array(jsonb_build_object('id','bounded_output','passed',true)),usage='{}',error=null where organization_id=j.organization_id and id=tr.id;
 if private.capital_debt_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_task_denied' using errcode='42501';end if;
 return private.capital_debt_task_projection_dto_v1(j.organization_id,r.id,tr.id,false);
end; $$;

-- Prospective recipes close generic writers for every post-model product, including abstentions.
create function private.guard_capital_debt_task_projection_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare task text;recipe uuid;scope text;
begin
 if tg_table_name='capital_project_artifacts' then
 select pt.task_id,r.id,j.payload->>'analysis_scope' into task,recipe,scope from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id join public.processing_jobs j on j.organization_id=tr.organization_id and j.id=tr.processing_job_id left join private.capital_debt_recipes r on r.organization_id=tr.organization_id and r.job_id=tr.processing_job_id where tr.organization_id=new.organization_id and tr.id=new.task_run_id;
 recipe:=coalesce(recipe,(select x.recipe_id from private.capital_debt_task_projections x where x.organization_id=new.organization_id and x.task_run_id=new.task_run_id and x.capital_artifact_id=new.id));
 if scope='company_debt_view' and private.capital_debt_task_type_v1(task) is not null and not exists(select 1 from private.capital_debt_task_projections x where x.organization_id=new.organization_id and x.recipe_id=recipe and x.task_run_id=new.task_run_id and x.capital_artifact_id=new.id and x.artifact_fingerprint=new.artifact_fingerprint and new.schema_version='capital-debt-task-projection.v1' and new.content=jsonb_build_object('schemaVersion','capital-debt-task-projection.v1','recipeId',x.recipe_id,'taskId',x.task_id,'retainedPayloadId',x.derived_retained_payload_id,'semanticFingerprint',x.semantic_fingerprint,'physicalSha256',(select a.payload_fingerprint from private.capital_public_retained_payloads q join private.capital_public_payload_allocations a on a.organization_id=q.organization_id and a.id=q.allocation_id where q.organization_id=x.organization_id and q.id=x.derived_retained_payload_id),'byteLength',(select a.byte_length from private.capital_public_retained_payloads q join private.capital_public_payload_allocations a on a.organization_id=q.organization_id and a.id=q.allocation_id where q.organization_id=x.organization_id and q.id=x.derived_retained_payload_id))) then raise exception 'capital_debt_native_task_projection_required' using errcode='42501';end if;
 elsif new.status='succeeded' then
 select pt.task_id,r.id,j.payload->>'analysis_scope' into task,recipe,scope from public.capital_project_plan_tasks pt join public.processing_jobs j on j.organization_id=pt.organization_id and j.id=new.processing_job_id left join private.capital_debt_recipes r on r.organization_id=pt.organization_id and r.plan_id=pt.plan_id and r.job_id=new.processing_job_id where pt.organization_id=new.organization_id and pt.id=new.plan_task_id;
 recipe:=coalesce(recipe,(select x.recipe_id from private.capital_debt_task_projections x where x.organization_id=new.organization_id and x.task_run_id=new.id));
 if scope='company_debt_view' and private.capital_debt_task_type_v1(task) is not null and not exists(select 1 from private.capital_debt_task_projections x where x.organization_id=new.organization_id and x.recipe_id=recipe and x.task_run_id=new.id and new.output_reference=jsonb_build_object('type','capital_project_artifact','id',x.capital_artifact_id) and new.output_fingerprint=x.artifact_fingerprint and new.error is null and new.usage='{}'::jsonb and new.quality_results=jsonb_build_array(jsonb_build_object('id','bounded_output','passed',true))) then raise exception 'capital_debt_native_task_projection_required' using errcode='42501';end if;
 end if;
 return new;
end; $$;
create trigger capital_debt_tasks_guard before insert on public.capital_project_artifacts for each row execute function private.guard_capital_debt_task_projection_v1();
create trigger capital_debt_task_completion_guard before update of status,output_reference,output_fingerprint on public.capital_project_task_runs for each row execute function private.guard_capital_debt_task_projection_v1();
alter function private.project_legacy_artifact_revision_v1(text,uuid,uuid) rename to project_legacy_artifact_revision_pre_debt_task_v1;
create function private.project_legacy_artifact_revision_v1(p_table text,p_org uuid,p_row uuid) returns integer language plpgsql security definer set search_path='' as $$
begin
 if p_table='capital_project_artifacts' and exists(select 1 from private.capital_debt_task_projections x where x.organization_id=p_org and x.capital_artifact_id=p_row) then return 0;end if;
 return private.project_legacy_artifact_revision_pre_debt_task_v1(p_table,p_org,p_row);
end; $$;

create function private.worker_read_capital_debt_task_body_core_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_recovery boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_debt_recipes:=private.capital_debt_task_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_recovery);x private.capital_debt_task_projections;a private.capital_public_payload_allocations;d timestamptz;
begin
 select * into x from private.capital_debt_task_projections where organization_id=r.organization_id and recipe_id=r.id and task_run_id=p_task_run_id;
 select z.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations z on z.organization_id=q.organization_id and z.id=q.allocation_id where q.organization_id=r.organization_id and q.id=x.derived_retained_payload_id;
 d:=private.capital_debt_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id);
 if x.id is null or d is null or not private.capital_body_retention_healthy_v1(a.policy_id,r.organization_id,a.id) or not private.capital_body_physical_receipt_v1(r.organization_id,x.derived_retained_payload_id) or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=r.organization_id and c.id=x.capital_artifact_id and c.status not in('stale','superseded') and c.artifact_fingerprint=x.artifact_fingerprint) then raise exception 'capital_debt_task_body_denied' using errcode='42501';end if;
 if not private.capital_public_capture_clock_current_v1(p_job_id,p_capability_token) or private.capital_debt_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id) is null then raise exception 'capital_debt_task_body_denied' using errcode='42501';end if;
 return private.capital_debt_body_dto_v1(r.organization_id,a.id,d,true);
end; $$;

-- A denied physical read is never interpreted as an absent task. This metadata
-- lookup returns absence only after the exact current recovery grant and real
-- published TaskSpec have been checked independently.
create function private.worker_load_capital_debt_recovered_projection_state_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_debt_recipes;
 g jsonb;x private.capital_debt_task_projections;b jsonb;
begin
 g:=private.worker_recover_capital_debt_result_v1(p_job_id,p_capability_token,p_recipe_id);
 if g->>'state' is null or g->>'state' not in('transform','commit','committed') or private.capital_debt_task_type_v1(p_task_id) is null then raise exception 'capital_debt_recovered_task_denied' using errcode='42501';end if;
 select * into r from private.capital_debt_recipes where organization_id=j.organization_id and id=p_recipe_id;
 if r.id is null or not exists(select 1 from public.capital_project_plan_tasks t where t.organization_id=j.organization_id and t.plan_id=r.plan_id and t.task_id=p_task_id) then raise exception 'capital_debt_recovered_task_denied' using errcode='42501';end if;
 select * into x from private.capital_debt_task_projections where organization_id=j.organization_id and recipe_id=r.id and task_id=p_task_id;
 if x.id is null then
  if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_debt_recovered_task_denied' using errcode='42501';end if;
  return jsonb_build_object('schemaVersion','capital-debt-recovered-projection-state.v1','recipeId',r.id,'taskId',p_task_id,'state','absent','projection',null,'body',null);
 end if;
 b:=private.worker_read_capital_debt_task_body_core_v1(j.id,p_capability_token,r.id,x.task_run_id,true);
 return jsonb_build_object('schemaVersion','capital-debt-recovered-projection-state.v1','recipeId',r.id,'taskId',p_task_id,'state','present','projection',private.capital_debt_task_projection_dto_v1(j.organization_id,r.id,x.task_run_id,true),'body',b);
end; $$;
create function public.worker_load_capital_debt_recovered_projection_state_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_id text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_load_capital_debt_recovered_projection_state_v1(p_job_id,p_capability_token,p_recipe_id,p_task_id);$$;
revoke all on function private.worker_load_capital_debt_recovered_projection_state_v1(uuid,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.worker_load_capital_debt_recovered_projection_state_v1(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.worker_load_capital_debt_recovered_projection_state_v1(uuid,text,uuid,text) to authenticated;

create function private.worker_prepare_capital_debt_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_debt_task_projection_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_task_run_id,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,false); $$;
create function private.worker_commit_capital_debt_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_commit_capital_debt_task_projection_core_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_retained_payload_id,false); $$;
create function private.worker_prepare_capital_debt_recovered_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_debt_task_projection_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_task_run_id,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,true); $$;
create function private.worker_commit_capital_debt_recovered_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_commit_capital_debt_task_projection_core_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_retained_payload_id,true); $$;
create function public.worker_prepare_capital_debt_recovered_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_debt_recovered_task_projection_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_task_run_id,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_commit_capital_debt_recovered_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_debt_recovered_task_projection_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_retained_payload_id); $$;
create function private.worker_read_capital_debt_task_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_read_capital_debt_task_body_core_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,false); $$;
create function private.worker_read_capital_debt_recovered_task_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid) returns jsonb language sql security definer set search_path='' as $$ select private.worker_read_capital_debt_task_body_core_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,true); $$;
create function public.worker_read_capital_debt_recovered_task_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_debt_recovered_task_body_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id); $$;
create function public.worker_prepare_capital_debt_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_task_run_id uuid,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_debt_task_projection_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_task_run_id,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_commit_capital_debt_task_projection_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_debt_task_projection_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id,p_retained_payload_id); $$;
create function public.worker_read_capital_debt_task_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_run_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_debt_task_body_v1(p_job_id,p_capability_token,p_recipe_id,p_task_run_id); $$;
do $$declare f record;begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and(p.proname in('capital_debt_task_type_v1','require_capital_debt_task_run_v1','capital_debt_task_recipe_v1','capital_debt_task_projection_dto_v1','guard_capital_debt_task_projection_v1','project_legacy_artifact_revision_pre_debt_task_v1','project_legacy_artifact_revision_v1') or p.proname in('worker_read_capital_debt_task_body_core_v1','worker_read_capital_debt_recovered_task_body_v1','worker_prepare_capital_debt_task_projection_core_v1','worker_commit_capital_debt_task_projection_core_v1','worker_prepare_capital_debt_recovered_task_projection_v1','worker_commit_capital_debt_recovered_task_projection_v1','worker_prepare_capital_debt_task_projection_v1','worker_commit_capital_debt_task_projection_v1','worker_read_capital_debt_task_body_v1')) loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',f.nspname,f.proname,f.args);
 if f.proname in('worker_read_capital_debt_recovered_task_body_v1','worker_prepare_capital_debt_recovered_task_projection_v1','worker_commit_capital_debt_recovered_task_projection_v1','worker_prepare_capital_debt_task_projection_v1','worker_commit_capital_debt_task_projection_v1','worker_read_capital_debt_task_body_v1') then execute format('grant execute on function %I.%I(%s) to authenticated',f.nspname,f.proname,f.args);end if;
 end loop;
end; $$;
