-- Draft finite preview run and its two paid boundary recipes. Requires S11's
-- shared base-authority fingerprint and the finite 17-source publication bridge.
-- No raw context/input/output is stored in any row below.
set search_path='';
create function private.capital_preview_workflow_v1(p_composition text)returns jsonb language sql immutable security definer set search_path=''as $$select ('{"prepare_meeting":{"workflow":{"id":"refinance-liability-management.meeting_plan","version":"2026.09.07-v1","fingerprint":"41f394506a226c18c996724d4fe8aaccafb945950d9348ecdbc62fcb66ecebbc"},"steps":[{"taskId":"C05","methodId":"build-debt-ledger","methodVersion":"2026.09.05-v15","executorKey":"integration-preview.build-debt-ledger","artifactType":"preview_debt_ledger","dependencies":[]},{"taskId":"D07","methodId":"reconcile-financial-statements","methodVersion":"2026.09.05-v9","executorKey":"integration-preview.reconcile-financial-statements","artifactType":"preview_financial_statements","dependencies":[]},{"taskId":"C09","methodId":"reconcile-covenant-definitions","methodVersion":"2026.09.05-v14","executorKey":"integration-preview.reconcile-covenant-definitions","artifactType":"preview_covenants","dependencies":["C05","D07"]},{"taskId":"C10","methodId":"diagnose-maturity-wall","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.diagnose-maturity-wall","artifactType":"preview_maturity_wall","dependencies":["C05"]},{"taskId":"C07","methodId":"build-interest-and-indexation-schedule","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.build-interest-and-indexation-schedule","artifactType":"preview_interest_schedule","dependencies":["C05"]},{"taskId":"S07","methodId":"estimate-exit-cost-by-series","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.estimate-exit-cost-by-series","artifactType":"preview_exit_costs","dependencies":["C05","C07"]},{"taskId":"C08","methodId":"declare-scenarios","methodVersion":"2026.09.05-v6","executorKey":"integration-preview.declare-scenarios","artifactType":"preview_scenarios","dependencies":["C05","C10"]},{"taskId":"S10","methodId":"compare-refinancing-before-after","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.compare-refinancing-before-after","artifactType":"preview_alternatives","dependencies":["C05","C09","C10","S07","C08"]},{"taskId":"A01","methodId":"plan-meeting-brief","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.plan-meeting-brief","artifactType":"preview_meeting_brief","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10"]}]},"prepare_material":{"workflow":{"id":"refinance-liability-management.material","version":"2026.09.07-v1","fingerprint":"a0c3ee4ee72690be7ced68b739e2afa65770628f35fda6df3d2d29d407a4f245"},"steps":[{"taskId":"C05","methodId":"build-debt-ledger","methodVersion":"2026.09.05-v15","executorKey":"integration-preview.build-debt-ledger","artifactType":"preview_debt_ledger","dependencies":[]},{"taskId":"D07","methodId":"reconcile-financial-statements","methodVersion":"2026.09.05-v9","executorKey":"integration-preview.reconcile-financial-statements","artifactType":"preview_financial_statements","dependencies":[]},{"taskId":"C09","methodId":"reconcile-covenant-definitions","methodVersion":"2026.09.05-v14","executorKey":"integration-preview.reconcile-covenant-definitions","artifactType":"preview_covenants","dependencies":["C05","D07"]},{"taskId":"C10","methodId":"diagnose-maturity-wall","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.diagnose-maturity-wall","artifactType":"preview_maturity_wall","dependencies":["C05"]},{"taskId":"C07","methodId":"build-interest-and-indexation-schedule","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.build-interest-and-indexation-schedule","artifactType":"preview_interest_schedule","dependencies":["C05"]},{"taskId":"S07","methodId":"estimate-exit-cost-by-series","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.estimate-exit-cost-by-series","artifactType":"preview_exit_costs","dependencies":["C05","C07"]},{"taskId":"C08","methodId":"declare-scenarios","methodVersion":"2026.09.05-v6","executorKey":"integration-preview.declare-scenarios","artifactType":"preview_scenarios","dependencies":["C05","C10"]},{"taskId":"S10","methodId":"compare-refinancing-before-after","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.compare-refinancing-before-after","artifactType":"preview_alternatives","dependencies":["C05","C09","C10","S07","C08"]},{"taskId":"A01","methodId":"plan-meeting-brief","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.plan-meeting-brief","artifactType":"preview_meeting_brief","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10"]},{"taskId":"A02","methodId":"write-meeting-synthesis","methodVersion":"2026.09.05-v1","executorKey":"integration-preview.write-meeting-synthesis","artifactType":"preview_material","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10","A01"]}]},"change_premise":{"workflow":{"id":"refinance-liability-management.meeting_plan","version":"2026.09.07-v1","fingerprint":"41f394506a226c18c996724d4fe8aaccafb945950d9348ecdbc62fcb66ecebbc"},"steps":[{"taskId":"C05","methodId":"build-debt-ledger","methodVersion":"2026.09.05-v15","executorKey":"integration-preview.build-debt-ledger","artifactType":"preview_debt_ledger","dependencies":[]},{"taskId":"D07","methodId":"reconcile-financial-statements","methodVersion":"2026.09.05-v9","executorKey":"integration-preview.reconcile-financial-statements","artifactType":"preview_financial_statements","dependencies":[]},{"taskId":"C09","methodId":"reconcile-covenant-definitions","methodVersion":"2026.09.05-v14","executorKey":"integration-preview.reconcile-covenant-definitions","artifactType":"preview_covenants","dependencies":["C05","D07"]},{"taskId":"C10","methodId":"diagnose-maturity-wall","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.diagnose-maturity-wall","artifactType":"preview_maturity_wall","dependencies":["C05"]},{"taskId":"C07","methodId":"build-interest-and-indexation-schedule","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.build-interest-and-indexation-schedule","artifactType":"preview_interest_schedule","dependencies":["C05"]},{"taskId":"S07","methodId":"estimate-exit-cost-by-series","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.estimate-exit-cost-by-series","artifactType":"preview_exit_costs","dependencies":["C05","C07"]},{"taskId":"C08","methodId":"declare-scenarios","methodVersion":"2026.09.05-v6","executorKey":"integration-preview.declare-scenarios","artifactType":"preview_scenarios","dependencies":["C05","C10"]},{"taskId":"S10","methodId":"compare-refinancing-before-after","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.compare-refinancing-before-after","artifactType":"preview_alternatives","dependencies":["C05","C09","C10","S07","C08"]},{"taskId":"A01","methodId":"plan-meeting-brief","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.plan-meeting-brief","artifactType":"preview_meeting_brief","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10"]}]},"deepen":{"workflow":{"id":"refinance-liability-management.meeting_plan","version":"2026.09.07-v1","fingerprint":"41f394506a226c18c996724d4fe8aaccafb945950d9348ecdbc62fcb66ecebbc"},"steps":[{"taskId":"C05","methodId":"build-debt-ledger","methodVersion":"2026.09.05-v15","executorKey":"integration-preview.build-debt-ledger","artifactType":"preview_debt_ledger","dependencies":[]},{"taskId":"D07","methodId":"reconcile-financial-statements","methodVersion":"2026.09.05-v9","executorKey":"integration-preview.reconcile-financial-statements","artifactType":"preview_financial_statements","dependencies":[]},{"taskId":"C09","methodId":"reconcile-covenant-definitions","methodVersion":"2026.09.05-v14","executorKey":"integration-preview.reconcile-covenant-definitions","artifactType":"preview_covenants","dependencies":["C05","D07"]},{"taskId":"C10","methodId":"diagnose-maturity-wall","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.diagnose-maturity-wall","artifactType":"preview_maturity_wall","dependencies":["C05"]},{"taskId":"C07","methodId":"build-interest-and-indexation-schedule","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.build-interest-and-indexation-schedule","artifactType":"preview_interest_schedule","dependencies":["C05"]},{"taskId":"S07","methodId":"estimate-exit-cost-by-series","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.estimate-exit-cost-by-series","artifactType":"preview_exit_costs","dependencies":["C05","C07"]},{"taskId":"C08","methodId":"declare-scenarios","methodVersion":"2026.09.05-v6","executorKey":"integration-preview.declare-scenarios","artifactType":"preview_scenarios","dependencies":["C05","C10"]},{"taskId":"S10","methodId":"compare-refinancing-before-after","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.compare-refinancing-before-after","artifactType":"preview_alternatives","dependencies":["C05","C09","C10","S07","C08"]},{"taskId":"A01","methodId":"plan-meeting-brief","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.plan-meeting-brief","artifactType":"preview_meeting_brief","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10"]}]},"prepare_decision":{"workflow":{"id":"refinance-liability-management.material","version":"2026.09.07-v1","fingerprint":"a0c3ee4ee72690be7ced68b739e2afa65770628f35fda6df3d2d29d407a4f245"},"steps":[{"taskId":"C05","methodId":"build-debt-ledger","methodVersion":"2026.09.05-v15","executorKey":"integration-preview.build-debt-ledger","artifactType":"preview_debt_ledger","dependencies":[]},{"taskId":"D07","methodId":"reconcile-financial-statements","methodVersion":"2026.09.05-v9","executorKey":"integration-preview.reconcile-financial-statements","artifactType":"preview_financial_statements","dependencies":[]},{"taskId":"C09","methodId":"reconcile-covenant-definitions","methodVersion":"2026.09.05-v14","executorKey":"integration-preview.reconcile-covenant-definitions","artifactType":"preview_covenants","dependencies":["C05","D07"]},{"taskId":"C10","methodId":"diagnose-maturity-wall","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.diagnose-maturity-wall","artifactType":"preview_maturity_wall","dependencies":["C05"]},{"taskId":"C07","methodId":"build-interest-and-indexation-schedule","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.build-interest-and-indexation-schedule","artifactType":"preview_interest_schedule","dependencies":["C05"]},{"taskId":"S07","methodId":"estimate-exit-cost-by-series","methodVersion":"2026.09.05-v8","executorKey":"integration-preview.estimate-exit-cost-by-series","artifactType":"preview_exit_costs","dependencies":["C05","C07"]},{"taskId":"C08","methodId":"declare-scenarios","methodVersion":"2026.09.05-v6","executorKey":"integration-preview.declare-scenarios","artifactType":"preview_scenarios","dependencies":["C05","C10"]},{"taskId":"S10","methodId":"compare-refinancing-before-after","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.compare-refinancing-before-after","artifactType":"preview_alternatives","dependencies":["C05","C09","C10","S07","C08"]},{"taskId":"A01","methodId":"plan-meeting-brief","methodVersion":"2026.09.05-v7","executorKey":"integration-preview.plan-meeting-brief","artifactType":"preview_meeting_brief","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10"]},{"taskId":"A02","methodId":"write-meeting-synthesis","methodVersion":"2026.09.05-v1","executorKey":"integration-preview.write-meeting-synthesis","artifactType":"preview_material","dependencies":["C05","D07","C09","C10","C07","S07","C08","S10","A01"]}]}}'::jsonb)->p_composition;$$;
create table private.capital_preview_runs(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,plan_id uuid not null,brief_id uuid not null,session_id uuid not null,
 human_subject_id uuid not null references auth.users(id),worker_account_id uuid not null references auth.users(id),
 publisher_organization_id uuid not null,basis_id uuid not null,composition text not null check(composition in('prepare_meeting','prepare_material','change_premise','deepen','prepare_decision')),
 plan_fingerprint text not null,context_fingerprint text not null,base_authority_fingerprint text not null,workflow_fingerprint text not null,
 consumed_basis_fingerprint text,retention_policy_id uuid not null references private.capital_public_retention_policies(id),
 effective_budget_micro_usd bigint not null check(effective_budget_micro_usd between 1 and 600000),effective_max_dispatches integer not null check(effective_max_dispatches between 1 and 4),
 captured_at timestamptz not null,expires_at timestamptz not null check(isfinite(expires_at)),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,job_id),unique(organization_id,work_id,plan_id,brief_id),
 foreign key(organization_id,work_id)references public.capital_projects(organization_id,id),
 foreign key(organization_id,job_id)references public.processing_jobs(organization_id,id),
 foreign key(organization_id,plan_id)references public.capital_project_plans(organization_id,id),
 foreign key(publisher_organization_id,basis_id)references private.capital_preview_consumed_bases(organization_id,id));
create index capital_preview_run_work_idx on private.capital_preview_runs(organization_id,work_id);
create index capital_preview_run_plan_idx on private.capital_preview_runs(organization_id,plan_id);
create index capital_preview_run_publisher_idx on private.capital_preview_runs(publisher_organization_id,basis_id);
create index capital_preview_run_human_idx on private.capital_preview_runs(human_subject_id);
create index capital_preview_run_worker_idx on private.capital_preview_runs(worker_account_id);
create index capital_preview_run_policy_idx on private.capital_preview_runs(retention_policy_id);

create table private.capital_preview_recipes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,run_id uuid not null,job_id uuid not null,
 plan_id uuid not null,plan_task_id uuid not null,boundary text not null check(boundary in('questions','synthesis')),
 human_subject_id uuid not null references auth.users(id),worker_account_id uuid not null references auth.users(id),
 renderer_version text not null,retention_policy_id uuid not null references private.capital_public_retention_policies(id),
 expires_at timestamptz not null check(isfinite(expires_at)),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,run_id,boundary),
 foreign key(organization_id,work_id,run_id)references private.capital_preview_runs(organization_id,work_id,id),
 foreign key(organization_id,job_id)references public.processing_jobs(organization_id,id),
 foreign key(organization_id,plan_task_id)references public.capital_project_plan_tasks(organization_id,id),
 check(renderer_version='capital-preview-renderer.'||boundary||'.v1'));
create index capital_preview_recipe_run_idx on private.capital_preview_recipes(organization_id,work_id,run_id);
create index capital_preview_recipe_job_idx on private.capital_preview_recipes(organization_id,job_id);
create index capital_preview_recipe_task_idx on private.capital_preview_recipes(organization_id,plan_task_id);
create index capital_preview_recipe_human_idx on private.capital_preview_recipes(human_subject_id);
create index capital_preview_recipe_worker_idx on private.capital_preview_recipes(worker_account_id);
create index capital_preview_recipe_policy_idx on private.capital_preview_recipes(retention_policy_id);
create table private.capital_preview_body_bases(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,run_id uuid not null,recipe_id uuid,
 kind text not null check(kind in('context','source','actual_input','model_input','accepted_parsed','task_output','decision_contract')),
 file_name text,task_id text,task_run_id uuid,accepted_invocation_id uuid,semantic_fingerprint text,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),
 foreign key(organization_id,work_id,run_id)references private.capital_preview_runs(organization_id,work_id,id),
 foreign key(organization_id,recipe_id)references private.capital_preview_recipes(organization_id,id),
 foreign key(organization_id,task_run_id)references public.capital_project_task_runs(organization_id,id),
 check((kind='source')=(file_name is not null)),check((kind in('actual_input','task_output','decision_contract'))=(task_id is not null)),
 check((kind in('model_input','accepted_parsed'))=(recipe_id is not null)),check((kind='accepted_parsed')=(accepted_invocation_id is not null)));
create unique index capital_preview_body_identity_idx on private.capital_preview_body_bases(organization_id,run_id,kind,coalesce(recipe_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(file_name,''),coalesce(task_id,''),coalesce(task_run_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index capital_preview_basis_run_idx on private.capital_preview_body_bases(organization_id,work_id,run_id);
create index capital_preview_basis_recipe_idx on private.capital_preview_body_bases(organization_id,recipe_id);
create index capital_preview_basis_task_run_idx on private.capital_preview_body_bases(organization_id,task_run_id);
create index capital_preview_basis_accepted_idx on private.capital_preview_body_bases(organization_id,accepted_invocation_id);
alter table private.capital_public_payload_allocations add column preview_body_basis_id uuid,
 add constraint capital_preview_allocation_basis_fk foreign key(organization_id,preview_body_basis_id)references private.capital_preview_body_bases(organization_id,id);
create index capital_preview_allocation_basis_idx on private.capital_public_payload_allocations(organization_id,preview_body_basis_id);
create unique index capital_preview_allocation_request_idx on private.capital_public_payload_allocations(organization_id,job_id,request_id)where content_kind='preview_body';
-- Preserve all installed origin families, including 3S/C11. A separate exclusive
-- check ensures a preview basis cannot be smuggled into any previous family.
do $$declare d text;other_origins text;begin
 select pg_get_constraintdef(oid)into strict d from pg_constraint where conrelid='private.capital_public_payload_allocations'::regclass and conname='capital_public_payload_allocations_content_kind_check';
 execute 'alter table private.capital_public_payload_allocations drop constraint capital_public_payload_allocations_content_kind_check';
 execute 'alter table private.capital_public_payload_allocations add constraint capital_public_payload_allocations_content_kind_check check(('||substring(d from 8 for length(d)-8)||') or content_kind=''preview_body'')';
 select pg_get_constraintdef(oid)into strict d from pg_constraint where conrelid='private.capital_public_payload_allocations'::regclass and conname='capital_allocations_kind_invariant';
 execute 'alter table private.capital_public_payload_allocations drop constraint capital_allocations_kind_invariant';
 select string_agg(quote_ident(attname),','order by attname)into other_origins from pg_attribute where attrelid='private.capital_public_payload_allocations'::regclass and attnum>0 and not attisdropped and attname<>'preview_body_basis_id'and(attname like '%body_basis_id'or attname in('body_basis_id','delivery_id','license_id','licensing_organization_id'));
 if other_origins is null then raise exception 'capital_preview_existing_origins_missing';end if;
 execute 'alter table private.capital_public_payload_allocations add constraint capital_allocations_kind_invariant check((preview_body_basis_id is null and ('||substring(d from 8 for length(d)-8)||')) or(content_kind=''preview_body'' and preview_body_basis_id is not null and num_nonnulls('||other_origins||')=0))';
end$$;
alter table private.capital_public_payload_allocations add constraint capital_preview_exclusive_basis check((content_kind='preview_body')=(preview_body_basis_id is not null));
create table private.capital_preview_recipe_seals(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,recipe_id uuid not null,plan_task_id uuid not null,input_retained_payload_id uuid not null,
 consumed_basis_fingerprint text not null check(consumed_basis_fingerprint ~ '^[a-f0-9]{64}$'),
 reconstruction_fingerprint text not null,prompt_fingerprint text not null,primary_request_fingerprint text not null,fallback_request_fingerprint text not null,
 input_bytes bigint not null check(input_bytes between 1 and 100000),effective_budget_micro_usd bigint not null check(effective_budget_micro_usd between 1 and 600000),
 effective_max_dispatches integer not null check(effective_max_dispatches between 1 and 2),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),
 foreign key(organization_id,recipe_id)references private.capital_preview_recipes(organization_id,id),
 foreign key(organization_id,plan_task_id)references public.capital_project_plan_tasks(organization_id,id),
 foreign key(organization_id,input_retained_payload_id)references private.capital_public_retained_payloads(organization_id,id));
create index capital_preview_seal_recipe_idx on private.capital_preview_recipe_seals(organization_id,recipe_id);
create index capital_preview_seal_task_idx on private.capital_preview_recipe_seals(organization_id,plan_task_id);
create index capital_preview_seal_retained_idx on private.capital_preview_recipe_seals(organization_id,input_retained_payload_id);
create table private.capital_preview_execution_failures(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,recipe_id uuid not null,
 reason text not null check(reason in('model_attempts_exhausted','processing_denied','budget_denied','accepted_body_unavailable')),
 outcome_ids uuid[]not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),foreign key(organization_id,recipe_id)references private.capital_preview_recipes(organization_id,id));
create index capital_preview_failure_recipe_idx on private.capital_preview_execution_failures(organization_id,recipe_id);

create function private.capital_preview_run_deadline_v1(p_org uuid,p_run uuid,p_subject uuid,p_require_captured boolean default true)
returns timestamptz language plpgsql volatile security definer set search_path=''as $$
declare r private.capital_preview_runs;deadline timestamptz;physical_deadline timestamptz;source_row record;
begin
 select * into r from private.capital_preview_runs where organization_id=p_org and id=p_run;
 if r.id is null or not private.capital_body_subject_allowed_v1(p_org,r.work_id,p_subject)
 or not private.capital_body_subject_allowed_v1(p_org,r.work_id,r.human_subject_id)
 or r.base_authority_fingerprint is distinct from private.capital_s11_base_authority_fingerprint_v1(p_org,r.job_id,r.session_id,r.brief_id,r.plan_id,r.human_subject_id,r.captured_at)then return null;end if;
 physical_deadline:=private.capital_preview_consumed_basis_deadline_v1(r.publisher_organization_id,r.basis_id);
 if physical_deadline is null then return null;end if;
 deadline:=least(r.expires_at,physical_deadline);
 if deadline is null or deadline<=clock_timestamp()then return null;end if;
 if p_require_captured then
 if not exists(select 1 from private.capital_preview_body_bases b join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)
 join private.capital_public_retained_payloads physical on(physical.organization_id,physical.allocation_id)=(a.organization_id,a.id)
 where b.organization_id=p_org and b.run_id=r.id and b.kind='context'and a.payload_fingerprint=r.context_fingerprint and private.capital_body_physical_receipt_v1(p_org,physical.id))then return null;end if;
 for source_row in select entry.value from jsonb_array_elements(private.capital_preview_consumed_corpus_registry_v1()->'entries')entry loop
 if not exists(select 1 from private.capital_preview_body_bases b join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)
 join private.capital_public_retained_payloads physical on(physical.organization_id,physical.allocation_id)=(a.organization_id,a.id)
 where b.organization_id=p_org and b.run_id=r.id and b.kind='source'and b.file_name=source_row.value->>'file' and private.capital_body_physical_receipt_v1(p_org,physical.id)
 and least(a.expires_at,a.purge_at)>clock_timestamp())then return null;end if;
 end loop;
 select min(least(a.expires_at,a.purge_at))into physical_deadline from private.capital_preview_body_bases b
 join private.capital_public_payload_allocations a on(a.organization_id,a.preview_body_basis_id)=(b.organization_id,b.id)
 join private.capital_public_retained_payloads physical on(physical.organization_id,physical.allocation_id)=(a.organization_id,a.id)
 where b.organization_id=p_org and b.run_id=r.id and b.kind in('context','source');
 if physical_deadline is null or physical_deadline<=clock_timestamp()then return null;end if;
 deadline:=least(deadline,physical_deadline);
 end if;
 return deadline;
end;$$;
create function private.capital_preview_recipe_deadline_v1(p_org uuid,p_recipe uuid,p_subject uuid)returns timestamptz
language sql volatile security definer set search_path=''as $$select private.capital_preview_run_deadline_v1(p_org,r.run_id,p_subject,true)from private.capital_preview_recipes r where r.organization_id=p_org and r.id=p_recipe;$$;
create function private.require_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_require_captured boolean default true)
returns private.capital_preview_runs language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_runs;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-preview-run:'||j.organization_id::text||':'||p_run_id::text,0))then raise exception 'capital_capture_retry'using errcode='40001';end if;
 select * into r from private.capital_preview_runs where organization_id=j.organization_id and job_id=j.id and id=p_run_id;
 if r.id is null or r.worker_account_id<>auth.uid()or r.human_subject_id<>j.authorization_subject_id or r.work_id<>coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid)
 or r.plan_id::text is distinct from j.payload->>'capital_project_plan_id' or r.brief_id::text is distinct from j.payload->>'capital_project_brief_id'
 or private.capital_preview_run_deadline_v1(r.organization_id,r.id,j.authorization_subject_id,p_require_captured)is null then raise exception 'capital_preview_denied'using errcode='42501';end if;
 return r;
end;$$;
create function private.require_capital_preview_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns private.capital_preview_recipes language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_recipes;run private.capital_preview_runs;dep text;task public.capital_project_plan_tasks;
begin
 select * into r from private.capital_preview_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null then raise exception 'capital_preview_denied'using errcode='42501';end if;
 run:=private.require_capital_preview_run_v1(j.id,p_capability_token,r.run_id,true);
 if r.human_subject_id<>j.authorization_subject_id or r.worker_account_id<>auth.uid()or not exists(select 1 from private.capital_preview_recipe_seals s
 where s.organization_id=r.organization_id and s.recipe_id=r.id and s.plan_task_id=r.plan_task_id
 and private.capital_body_physical_receipt_v1(r.organization_id,s.input_retained_payload_id))then raise exception 'capital_preview_denied'using errcode='42501';end if;
 select *into strict task from public.capital_project_plan_tasks where organization_id=r.organization_id and id=r.plan_task_id;
 foreach dep in array task.dependencies loop
 if private.capital_preview_projection_deadline_v1(r.organization_id,r.run_id,r.human_subject_id,dep)is null then raise exception 'capital_preview_parent_denied'using errcode='42501';end if;
 end loop;
 return r;
end;$$;

create function private.worker_prepare_capital_preview_run_v1(p_job_id uuid,p_capability_token text,p_publisher_org uuid,p_basis_id uuid)
returns jsonb language plpgsql security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_runs;c jsonb;policy private.capital_public_retention_policies;
 stamp timestamptz:=clock_timestamp();deadline timestamptz;budget bigint;calls integer;context_scope jsonb;context_allocation uuid;
begin
 select *into r from private.capital_preview_runs where organization_id=j.organization_id and job_id=j.id;
 if r.id is not null then
  if r.publisher_organization_id is distinct from p_publisher_org or r.basis_id is distinct from p_basis_id then raise exception 'capital_preview_context_conflict'using errcode='23505';end if;
  perform private.require_capital_preview_run_v1(j.id,p_capability_token,r.id,false);
  select a.id into context_allocation from private.capital_preview_body_bases b
   join private.capital_public_payload_allocations a on a.organization_id=b.organization_id and a.preview_body_basis_id=b.id
   join private.capital_public_retained_payloads physical on physical.organization_id=a.organization_id and physical.allocation_id=a.id
   where b.organization_id=r.organization_id and b.run_id=r.id and b.kind='context';
  if context_allocation is not null then
   context_scope:=private.worker_read_capital_preview_allocation_v1(j.id,p_capability_token,context_allocation);
   return jsonb_build_object('schemaVersion','capital-preview-base.v1','runId',r.id,'jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,'planId',r.plan_id,'briefId',r.brief_id,'planFingerprint',r.plan_fingerprint,'composition',r.composition,'workflowFingerprint',r.workflow_fingerprint,'contextFingerprint',r.context_fingerprint,'canonicalContext',null,'contextScope',context_scope,'expiresAt',r.expires_at);
  end if;
 end if;
 c:=private.worker_load_capital_project_context_v6(j.id,p_capability_token);
 if c->>'mode'is distinct from'integration_preview'or c#>>'{preview,caseId}'is distinct from'gc01-analista-ib-camil'
 or c#>'{preview,workflow}'is distinct from private.capital_preview_workflow_v1(c#>>'{preview,composition}')->'workflow'
 or jsonb_array_length(coalesce(c->'prior_artifacts','[]'))<>0 then raise exception 'capital_preview_historical_basis_unavailable'using errcode='42501';end if;
 deadline:=private.capital_preview_consumed_basis_deadline_v1(p_publisher_org,p_basis_id);
 if deadline is null then raise exception 'capital_preview_published_sources_required'using errcode='42501';end if;
 select p.*into policy from private.capital_public_retention_policies p join private.capital_public_retention_controls ctl on ctl.policy_id=p.id where ctl.singleton and ctl.enabled;
 if policy.id is null or not private.capital_public_retention_healthy_v1(j.leased_by,policy.id)then raise exception 'capital_preview_retention_denied'using errcode='42501';end if;
 if jsonb_typeof(j.payload#>'{model_budget,max_cost_usd}')is distinct from'number'or jsonb_typeof(j.payload#>'{model_budget,max_calls}')is distinct from'number'then raise exception 'capital_preview_budget_denied'using errcode='42501';end if;
 budget:=least(600000,floor((j.payload#>>'{model_budget,max_cost_usd}')::numeric*1000000));calls:=least(4,(j.payload#>>'{model_budget,max_calls}')::integer);
 if budget<=0 or calls<=0 then raise exception 'capital_preview_budget_denied'using errcode='42501';end if;
 select *into r from private.capital_preview_runs where organization_id=j.organization_id and job_id=j.id;
 if r.id is null then
 insert into private.capital_preview_runs(organization_id,work_id,job_id,plan_id,brief_id,session_id,human_subject_id,worker_account_id,publisher_organization_id,basis_id,composition,plan_fingerprint,context_fingerprint,base_authority_fingerprint,workflow_fingerprint,retention_policy_id,effective_budget_micro_usd,effective_max_dispatches,captured_at,expires_at)
 values(j.organization_id,(j.payload->>'capital_project_id')::uuid,j.id,(j.payload->>'capital_project_plan_id')::uuid,(j.payload->>'capital_project_brief_id')::uuid,j.intake_session_id,j.authorization_subject_id,auth.uid(),p_publisher_org,p_basis_id,c#>>'{preview,composition}',c#>>'{plan,fingerprint}',encode(extensions.digest(c::text,'sha256'),'hex'),
 private.capital_s11_base_authority_fingerprint_v1(j.organization_id,j.id,j.intake_session_id,(j.payload->>'capital_project_brief_id')::uuid,(j.payload->>'capital_project_plan_id')::uuid,j.authorization_subject_id,stamp),c#>>'{preview,workflow,fingerprint}',policy.id,budget,calls,stamp,least(deadline,stamp+interval'1 hour'))returning *into r;
 elsif r.publisher_organization_id<>p_publisher_org or r.basis_id<>p_basis_id or r.context_fingerprint<>encode(extensions.digest(c::text,'sha256'),'hex')then raise exception 'capital_preview_context_conflict'using errcode='23505';end if;
 perform private.require_capital_preview_run_v1(j.id,p_capability_token,r.id,false);
 return jsonb_build_object('schemaVersion','capital-preview-base.v1','runId',r.id,'jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,'planId',r.plan_id,'briefId',r.brief_id,'planFingerprint',r.plan_fingerprint,'composition',r.composition,'workflowFingerprint',r.workflow_fingerprint,'contextFingerprint',r.context_fingerprint,'canonicalContext',c::text,'expiresAt',r.expires_at);
end;$$;

create function private.capital_preview_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path=''as $$
declare a private.capital_public_payload_allocations;b private.capital_preview_body_bases;deadline timestamptz;
begin
 select *into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='preview_body';
 select *into b from private.capital_preview_body_bases where organization_id=p_org and id=a.preview_body_basis_id;
 if b.id is null then return null;end if;
 deadline:=private.capital_preview_run_deadline_v1(p_org,b.run_id,p_subject,b.kind not in('context','source'));
 if deadline is null or least(a.expires_at,a.purge_at,deadline)<=clock_timestamp()or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending')then return null;end if;
 return least(deadline,a.expires_at);
end;$$;
create function private.capital_preview_body_dto_v1(p_org uuid,p_allocation uuid,p_deadline timestamptz,p_replayed boolean)
returns jsonb language plpgsql security definer set search_path=''as $$
declare a private.capital_public_payload_allocations;r private.capital_public_retained_payloads;margin integer;
begin
 select *into strict a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='preview_body';
 select *into r from private.capital_public_retained_payloads where organization_id=p_org and allocation_id=a.id;
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=a.policy_id;
 return jsonb_build_object('schemaVersion','capital-retained-body.v1','retentionState',case when r.id is null then'allocated'else'retained'end,
 'allocationId',a.id,'retainedPayloadId',r.id,'bodyBasisId',a.preview_body_basis_id,'bucket',a.bucket_id,'path',a.object_path,'payloadFingerprint',a.payload_fingerprint,'byteLength',a.byte_length,
 'storageObjectId',r.storage_object_id,'storageVersion',r.storage_version,'retainedAt',a.retained_at,'uploadExpiresAt',a.upload_expires_at,'expiresAt',least(a.expires_at,p_deadline),
 'purgeAt',least(a.purge_at,p_deadline-make_interval(secs=>margin)),'replayed',p_replayed);
end;$$;
create function private.worker_prepare_capital_preview_body_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_request_id uuid,p_kind text,p_body jsonb,
 p_recipe_id uuid default null,p_file_name text default null,p_task_id text default null,p_task_run_id uuid default null,p_accepted_invocation_id uuid default null,p_semantic_fingerprint text default null)
returns jsonb language plpgsql security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_runs;
 b private.capital_preview_body_bases;a private.capital_public_payload_allocations;policy private.capital_public_retention_policies;body jsonb:=p_body;
 deadline timestamptz;stamp timestamptz:=clock_timestamp();fp text;bytes bigint;entry jsonb;accepted record;recipe private.capital_preview_recipes;
begin
 r:=private.require_capital_preview_run_v1(j.id,p_capability_token,p_run_id,p_kind not in('context','source'));
 if p_request_id is null or p_kind is null or p_kind not in('context','source','actual_input','model_input','accepted_parsed','task_output','decision_contract')or jsonb_typeof(p_body)is distinct from'object'then raise exception 'capital_preview_body_invalid'using errcode='22023';end if;
 if (p_kind in('context','source','actual_input','task_output','decision_contract')and p_recipe_id is not null)
 or(p_kind<>'source'and p_file_name is not null)or(p_kind not in('actual_input','task_output','decision_contract')and p_task_id is not null)
 or(p_kind not in('task_output','decision_contract')and p_task_run_id is not null)or(p_kind<>'accepted_parsed'and p_accepted_invocation_id is not null)
 or(p_kind in('context','source','model_input')and p_semantic_fingerprint is not null)then raise exception 'capital_preview_body_scope_invalid'using errcode='22023';end if;
 -- Exact replay uses the frozen caller body only after current run authority,
 -- natural scope and physical fingerprint are compared. Never re-read a context
 -- polluted by the artifacts produced after its initial capture.
 select allocation.*into a from private.capital_public_payload_allocations allocation join private.capital_preview_body_bases existing on(existing.organization_id,existing.id)=(allocation.organization_id,allocation.preview_body_basis_id)
 where allocation.organization_id=r.organization_id and existing.run_id=r.id and existing.kind=p_kind and existing.recipe_id is not distinct from p_recipe_id and existing.file_name is not distinct from p_file_name and existing.task_id is not distinct from p_task_id and existing.task_run_id is not distinct from p_task_run_id;
 if a.id is not null then
  select*into b from private.capital_preview_body_bases where organization_id=r.organization_id and id=a.preview_body_basis_id;
  if b.accepted_invocation_id is distinct from p_accepted_invocation_id or b.semantic_fingerprint is distinct from p_semantic_fingerprint or a.payload_fingerprint is distinct from encode(extensions.digest(p_body::text,'sha256'),'hex')or a.byte_length is distinct from octet_length(p_body::text)then raise exception 'capital_preview_body_conflict'using errcode='23505';end if;
  deadline:=private.capital_preview_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id);
  if deadline is null then raise exception 'capital_preview_retention_denied'using errcode='42501';end if;
  return private.capital_preview_body_dto_v1(r.organization_id,a.id,deadline,true)||jsonb_build_object('canonicalBody',p_body::text);
 end if;
 if p_kind='context'then
 body:=private.worker_load_capital_project_context_v6(j.id,p_capability_token);
 if encode(extensions.digest(body::text,'sha256'),'hex')<>r.context_fingerprint then raise exception 'capital_preview_context_changed'using errcode='40001';end if;
 elsif p_kind='source'then
 select value into entry from jsonb_array_elements(private.capital_preview_consumed_corpus_registry_v1()->'entries')where value->>'file'=p_file_name;
 if entry is null or p_body-array['schemaVersion','file','bytesBase64']<>'{}'::jsonb or p_body->>'schemaVersion'is distinct from'capital-preview-extraction.v1'
 or p_body->>'file'is distinct from p_file_name or jsonb_typeof(p_body->'bytesBase64')is distinct from'string'or p_body->>'bytesBase64'!~'^[A-Za-z0-9+/]*={0,2}$'
 or encode(extensions.digest(decode(p_body->>'bytesBase64','base64'),'sha256'),'hex')<>entry->>'sha256'or octet_length(decode(p_body->>'bytesBase64','base64'))<>(entry->>'bytes')::bigint then raise exception 'capital_preview_source_bytes_denied'using errcode='42501';end if;
 elsif p_kind in('actual_input','task_output','decision_contract')then
 if p_task_id is null or not exists(select 1 from public.capital_project_plan_tasks pt where pt.organization_id=j.organization_id and pt.plan_id=r.plan_id and pt.task_id=p_task_id)
 or(p_kind<>'actual_input'and not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on(pt.organization_id,pt.id)=(tr.organization_id,tr.plan_task_id)
 where tr.organization_id=j.organization_id and tr.id=p_task_run_id and tr.processing_job_id=j.id and tr.capital_project_id=r.work_id and tr.plan_id=r.plan_id and pt.task_id=p_task_id and tr.status='running'))then raise exception 'capital_preview_task_denied'using errcode='42501';end if;
 if p_semantic_fingerprint is null or p_semantic_fingerprint!~'^[a-f0-9]{64}$'then raise exception 'capital_preview_body_invalid'using errcode='22023';end if;
 elsif p_kind in('model_input','accepted_parsed')then
 select *into recipe from private.capital_preview_recipes where organization_id=r.organization_id and run_id=r.id and id=p_recipe_id;
 if recipe.id is null then raise exception 'capital_preview_boundary_denied'using errcode='42501';end if;
 if p_kind='accepted_parsed'then
 select *into accepted from private.capital_preview_accepted_invocations where organization_id=r.organization_id and recipe_id=recipe.id and id=p_accepted_invocation_id;
 if accepted.id is null or accepted.output_fingerprint is distinct from p_semantic_fingerprint then raise exception 'capital_preview_accepted_denied'using errcode='42501';end if;
 else
 if p_body-array['schemaVersion','boundary','input']<>'{}'::jsonb or p_body->>'schemaVersion'is distinct from'capital-preview-model-input.v1'or p_body->>'boundary'is distinct from recipe.boundary
 or jsonb_typeof(p_body->'input')is distinct from'array'or jsonb_array_length(p_body->'input')=0
 or exists(select 1 from jsonb_array_elements(p_body->'input')part where part-array['type','text']<>'{}'::jsonb or part->>'type'is distinct from'text'or jsonb_typeof(part->'text')is distinct from'string')then raise exception 'capital_preview_input_invalid'using errcode='22023';end if;
 end if;
 end if;
 select *into strict policy from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_preview_run_deadline_v1(r.organization_id,r.id,r.human_subject_id,p_kind not in('context','source'));
 if deadline is null or deadline-make_interval(secs=>policy.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,policy.id)then raise exception 'capital_preview_retention_denied'using errcode='42501';end if;
 fp:=encode(extensions.digest(body::text,'sha256'),'hex');bytes:=octet_length(body::text);if bytes not between 1 and 1048576 then raise exception 'capital_preview_body_invalid'using errcode='22023';end if;
 select allocation.*into a from private.capital_public_payload_allocations allocation join private.capital_preview_body_bases existing on(existing.organization_id,existing.id)=(allocation.organization_id,allocation.preview_body_basis_id)where allocation.organization_id=r.organization_id and allocation.job_id=j.id and allocation.content_kind='preview_body'and(existing.run_id,existing.kind,existing.recipe_id,existing.file_name,existing.task_id,existing.task_run_id)is not distinct from(r.id,p_kind,p_recipe_id,p_file_name,p_task_id,p_task_run_id);
 if a.id is not null then
 select *into b from private.capital_preview_body_bases where organization_id=r.organization_id and id=a.preview_body_basis_id;
 if (b.run_id,b.kind,b.recipe_id,b.file_name,b.task_id,b.task_run_id,b.accepted_invocation_id,b.semantic_fingerprint) is distinct from(r.id,p_kind,p_recipe_id,p_file_name,p_task_id,p_task_run_id,p_accepted_invocation_id,p_semantic_fingerprint)
 or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_preview_body_conflict'using errcode='23505';end if;
 else
 insert into private.capital_preview_body_bases(organization_id,work_id,run_id,recipe_id,kind,file_name,task_id,task_run_id,accepted_invocation_id,semantic_fingerprint)
 values(r.organization_id,r.work_id,r.id,p_recipe_id,p_kind,p_file_name,p_task_id,p_task_run_id,p_accepted_invocation_id,p_semantic_fingerprint)returning *into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,preview_body_basis_id,content_kind)
 values(b.id,r.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,policy.id,fp,bytes,r.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,deadline-make_interval(secs=>policy.purge_margin_seconds),least(stamp+interval'5 minutes',deadline-make_interval(secs=>policy.purge_margin_seconds)),b.id,'preview_body')returning *into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at)values(r.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if private.capital_preview_allocation_deadline_v1(r.organization_id,a.id,r.human_subject_id)is null then raise exception 'capital_preview_retention_denied'using errcode='42501';end if;
 return private.capital_preview_body_dto_v1(r.organization_id,a.id,deadline,true)||jsonb_build_object('canonicalBody',body::text);
end;$$;
create function private.worker_commit_capital_preview_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,
 p_storage_version text,p_verified_sha256 text,p_verified_size bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;basis private.capital_preview_body_bases;receipt private.capital_public_retained_payloads;
 object_row storage.objects;deadline timestamptz;margin integer;replayed boolean:=false;result_dto jsonb;
begin
 select * into allocation from private.capital_public_payload_allocations where organization_id=job.organization_id and job_id=job.id and id=p_allocation_id and content_kind='preview_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 if p_storage_object_id is null or coalesce(length(p_storage_version),0) not between 1 and 1024 or p_verified_sha256 is distinct from allocation.payload_fingerprint or p_verified_size is distinct from allocation.byte_length then
 raise exception 'capital_body_proof_invalid' using errcode='22023';end if;
 deadline:=private.capital_preview_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 if deadline is null or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
 or not private.capital_public_retention_healthy_v1(job.leased_by,allocation.policy_id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 begin
 perform 1 from private.capital_public_payload_purge_queue where organization_id=job.organization_id and allocation_id=allocation.id and status='pending' for share nowait;
 if not found then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 select * into object_row from storage.objects where id=p_storage_object_id and bucket_id=allocation.bucket_id and name=allocation.object_path for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if object_row.id is null or object_row.version is distinct from p_storage_version or object_row.metadata->>'size' is distinct from allocation.byte_length::text
 or object_row.metadata->>'mimetype' is distinct from 'application/json' or (to_jsonb(object_row)->>'is_versioned')::boolean is true
 or (to_jsonb(object_row)->>'is_delete_marker')::boolean is true or to_jsonb(object_row)->>'archived_at' is not null or not private.capital_public_capture_bucket_safe_v1() then
 raise exception 'capital_body_proof_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-request:'||job.organization_id::text||':'||job.id::text||':'||allocation.request_id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into receipt from private.capital_public_retained_payloads where organization_id=job.organization_id and allocation_id=allocation.id;
 if found then
 if receipt.storage_object_id<>p_storage_object_id or receipt.storage_version<>p_storage_version or receipt.verified_sha256<>p_verified_sha256 or receipt.verified_size<>p_verified_size then
 raise exception 'capital_body_proof_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 if allocation.upload_expires_at<=clock_timestamp() then raise exception 'capital_body_upload_expired' using errcode='42501';end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 insert into private.capital_public_retained_payloads(organization_id,allocation_id,storage_object_id,storage_version,verified_sha256,verified_size,verified_by)
 values(job.organization_id,allocation.id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size,auth.uid()) returning * into receipt;
 update private.capital_public_payload_purge_queue set next_check_at=least(allocation.purge_at,deadline-make_interval(secs=>margin)),
 effective_purge_at=least(effective_purge_at,allocation.purge_at,deadline-make_interval(secs=>margin)),updated_at=clock_timestamp()
 where organization_id=job.organization_id and allocation_id=allocation.id;
 end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token)
 then raise exception 'capital_capture_denied' using errcode='42501';end if;
 result_dto:=private.capital_preview_body_dto_v1(job.organization_id,allocation.id,deadline,replayed);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

create function private.worker_read_capital_preview_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;receipt private.capital_public_retained_payloads;
 physical_object storage.objects;deadline timestamptz;checked_deadline timestamptz;margin integer;result_dto jsonb;
begin
 if p_allocation_id is null then raise exception 'capital_body_read_invalid' using errcode='22023';end if;
 select a.* into allocation from private.capital_public_payload_allocations a
 where a.organization_id=job.organization_id and a.job_id=job.id and a.id=p_allocation_id and a.content_kind='preview_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id)
 or not private.capital_public_capture_bucket_safe_v1() then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 deadline:=private.capital_preview_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 if deadline is null or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp() then
 raise exception 'capital_body_read_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 begin
 perform 1 from private.capital_public_payload_purge_queue q
 where q.organization_id=job.organization_id and q.allocation_id=allocation.id and q.status='pending' for share nowait;
 if not found then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 select o.* into physical_object from storage.objects o where o.bucket_id=allocation.bucket_id and o.name=allocation.object_path for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if physical_object.id is null or coalesce(length(physical_object.version),0) not between 1 and 1024
 or physical_object.metadata->>'size' is distinct from allocation.byte_length::text
 or physical_object.metadata->>'mimetype' is distinct from 'application/json'
 or (to_jsonb(physical_object)->>'is_versioned')::boolean is true
 or (to_jsonb(physical_object)->>'is_delete_marker')::boolean is true
 or to_jsonb(physical_object)->>'archived_at' is not null then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 select r.* into receipt from private.capital_public_retained_payloads r
 where r.organization_id=job.organization_id and r.allocation_id=allocation.id;
 if receipt.id is null then
 if allocation.upload_expires_at<=clock_timestamp() then raise exception 'capital_body_upload_expired' using errcode='42501';end if;
 else
 if receipt.storage_object_id is distinct from physical_object.id or receipt.storage_version is distinct from physical_object.version
 or receipt.verified_sha256 is distinct from allocation.payload_fingerprint or receipt.verified_size is distinct from allocation.byte_length
 or not private.capital_body_physical_receipt_v1(job.organization_id,receipt.id) then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 end if;
 result_dto:=private.capital_preview_body_dto_v1(job.organization_id,allocation.id,deadline,true)
 ||jsonb_build_object('storageObjectId',physical_object.id,'storageVersion',physical_object.version);
 -- No caller-supplied path/version/hash or storage header authorizes this scope.
 -- Re-run current rights and clock after constructing it, so an elapsed lease
 -- cannot escape through a slow closure/metadata lookup before either server gate.
 checked_deadline:=private.capital_preview_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 if checked_deadline is null then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 if checked_deadline is distinct from deadline then raise exception 'capital_capture_retry' using errcode='40001';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token)
 or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
 or (receipt.id is null and allocation.upload_expires_at<=clock_timestamp()) then
 raise exception 'capital_body_read_denied' using errcode='42501';end if;
 return result_dto;
end; $$;


create function private.capital_preview_storage_allowed_v1(p_allocation uuid,p_mode text)returns boolean
language plpgsql volatile security definer set search_path=''as $$
declare a private.capital_public_payload_allocations;deadline timestamptz;subject uuid;margin integer;
begin
 if auth.uid()is null or p_mode is distinct from'upload'or not private.capital_body_storage_job_authority_v1(p_allocation)or not private.capital_public_capture_bucket_safe_v1()then return false;end if;
 select *into a from private.capital_public_payload_allocations where id=p_allocation and content_kind='preview_body';
 if a.id is null or not private.capital_public_allocation_job_current_v1(a.id)or not private.capital_public_retention_healthy_v1(a.worker_token_id,a.policy_id)
 or a.upload_expires_at<=clock_timestamp()or exists(select 1 from private.capital_public_retained_payloads where organization_id=a.organization_id and allocation_id=a.id)then return false;end if;
 select authorization_subject_id into subject from public.processing_jobs where organization_id=a.organization_id and id=a.job_id;
 deadline:=private.capital_preview_allocation_deadline_v1(a.organization_id,a.id,subject);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=a.policy_id;
 return deadline is not null and least(a.purge_at,deadline-make_interval(secs=>margin))>clock_timestamp()
 and private.capital_body_retention_healthy_v1(a.policy_id,a.organization_id,a.id);
end;$$;
alter function private.capital_capture_allocation_deadline_v2(uuid,uuid)rename to capital_capture_allocation_deadline_pre_preview_v2;
create function private.capital_capture_allocation_deadline_v2(p_org uuid,p_allocation uuid)returns timestamptz
language plpgsql volatile security definer set search_path=''as $$
declare a private.capital_public_payload_allocations;subject uuid;
begin
 select *into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 if a.content_kind is distinct from'preview_body'then return private.capital_capture_allocation_deadline_pre_preview_v2(p_org,p_allocation);end if;
 select r.human_subject_id into subject from private.capital_preview_body_bases b join private.capital_preview_runs r on(r.organization_id,r.id)=(b.organization_id,b.run_id)where(b.organization_id,b.id)=(p_org,a.preview_body_basis_id);
 return private.capital_preview_allocation_deadline_v1(p_org,p_allocation,subject);
end;$$;
alter function private.worker_can_access_capital_public_payload_v1(text,text,text) rename to worker_can_access_capital_public_payload_pre_preview_v1;
create function private.worker_can_access_capital_public_payload_v1(p_bucket text,p_path text,p_mode text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;
begin
 -- Purge resolves the genuine leased janitor scope before kind dispatch.
 if p_mode in('purge','purge_select') then return private.worker_can_access_capital_public_payload_pre_preview_v1(p_bucket,p_path,p_mode);end if;
 select * into a from private.capital_public_payload_allocations where bucket_id=p_bucket and object_path=p_path;
 if a.content_kind is distinct from 'preview_body' then return private.worker_can_access_capital_public_payload_pre_preview_v1(p_bucket,p_path,p_mode);end if;
 if exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path and((to_jsonb(o)->>'is_versioned')::boolean is true or(to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false;end if;
 return private.capital_preview_storage_allowed_v1(a.id,p_mode);
end$$;
revoke all on function private.worker_can_access_capital_public_payload_v1(text,text,text),private.capital_preview_storage_allowed_v1(uuid,text),private.worker_can_access_capital_public_payload_pre_preview_v1(text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_can_access_capital_public_payload_v1(text,text,text) to authenticated;
-- Policy expressions retain function OIDs across RENAME. Rebind them to the
-- current dispatch rather than granting clients the historical implementation.
do $$declare p record;ddl text;begin
 for p in select * from pg_policies where schemaname='storage' and tablename='objects' and(coalesce(qual,'') like '%worker_can_access_capital_public_payload_pre_preview_v1%' or coalesce(with_check,'') like '%worker_can_access_capital_public_payload_pre_preview_v1%') loop
 ddl:=format('alter policy %I on storage.objects',p.policyname);
 if p.qual is not null then ddl:=ddl||' using ('||replace(p.qual,'worker_can_access_capital_public_payload_pre_preview_v1','worker_can_access_capital_public_payload_v1')||')';end if;
 if p.with_check is not null then ddl:=ddl||' with check ('||replace(p.with_check,'worker_can_access_capital_public_payload_pre_preview_v1','worker_can_access_capital_public_payload_v1')||')';end if;
 execute ddl;
 end loop;
end$$;
-- Catalog-wide exclusive body reference closes coexistence with every installed
-- origin family without replacing its own constraints.
do $$declare fields text;begin
 select string_agg(quote_ident(attname),','order by attnum)into fields from pg_attribute where attrelid='private.capital_public_payload_allocations'::regclass and not attisdropped and(attname='body_basis_id'or attname like '%\_body_basis_id'escape'\');
 execute 'alter table private.capital_public_payload_allocations add constraint capital_preview_one_basis check(content_kind<>''preview_body''or num_nonnulls('||fields||')=1)';
end$$;
do $$declare t text;cmd text;begin
 foreach t in array array['capital_preview_runs','capital_preview_recipes','capital_preview_body_bases','capital_preview_recipe_seals','capital_preview_execution_failures']loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 foreach cmd in array array['select','insert','update','delete']loop execute format('create policy %I on private.%I as restrictive for %s to anon,authenticated %s',t||'_deny_'||cmd,t,cmd,case when cmd='insert'then'with check(false)'when cmd='update'then'using(false)with check(false)'else'using(false)'end);end loop;
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_identity_audit_v1()',t||'_audit',t);
 end loop;
end$$;

create function private.worker_prepare_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_run_id uuid,p_boundary text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare run private.capital_preview_runs:=private.require_capital_preview_run_v1(p_job_id,p_capability_token,p_run_id,true);
 r private.capital_preview_recipes;task public.capital_project_plan_tasks;
begin
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
 and private.capital_preview_allocation_deadline_v1(run.organization_id,a.id,run.human_subject_id)is not null))then raise exception 'capital_preview_parents_required'using errcode='42501';end if;
 select *into r from private.capital_preview_recipes where organization_id=run.organization_id and run_id=run.id and boundary=p_boundary;
 if r.id is null then
 insert into private.capital_preview_recipes(organization_id,work_id,run_id,job_id,plan_id,plan_task_id,boundary,human_subject_id,worker_account_id,renderer_version,retention_policy_id,expires_at)
 values(run.organization_id,run.work_id,run.id,run.job_id,run.plan_id,task.id,p_boundary,run.human_subject_id,run.worker_account_id,'capital-preview-renderer.'||p_boundary||'.v1',run.retention_policy_id,run.expires_at)returning *into r;
 end if;
 return jsonb_build_object('schemaVersion','capital-preview-boundary-base.v1','recipeId',r.id,'boundaryId',r.id,'runId',run.id,'boundary',p_boundary,'planTaskId',r.plan_task_id,'expiresAt',r.expires_at);
end;$$;
create function private.worker_seal_capital_preview_boundary_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_input_retained_payload_id uuid,p_model_input jsonb,p_pins jsonb,p_consumed_basis_fingerprint text)
returns jsonb language plpgsql security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_preview_recipes;run private.capital_preview_runs;s private.capital_preview_recipe_seals;
 a private.capital_public_payload_allocations;b private.capital_preview_body_bases;input_bytes bigint;max_dispatches integer;
 keys text[]:=array['reconstructionFingerprint','promptFingerprint','primaryRequestFingerprint','fallbackRequestFingerprint'];
begin
 select *into r from private.capital_preview_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null then raise exception 'capital_preview_boundary_denied'using errcode='42501';end if;
 run:=private.require_capital_preview_run_v1(j.id,p_capability_token,r.run_id,true);
 if jsonb_typeof(p_pins)is distinct from'object'or p_pins-keys<>'{}'::jsonb or not(p_pins?&keys)
 or exists(select 1 from unnest(keys)k where jsonb_typeof(p_pins->k)is distinct from'string'or p_pins->>k!~'^[a-f0-9]{64}$')
 or p_consumed_basis_fingerprint is null or p_consumed_basis_fingerprint!~'^[a-f0-9]{64}$'then raise exception 'capital_preview_pins_invalid'using errcode='22023';end if;
 select allocation.*into a from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations allocation on(allocation.organization_id,allocation.id)=(retained.organization_id,retained.allocation_id)
 where retained.organization_id=j.organization_id and retained.id=p_input_retained_payload_id;
 select *into b from private.capital_preview_body_bases where organization_id=j.organization_id and id=a.preview_body_basis_id;
 if b.run_id is distinct from run.id or b.recipe_id is distinct from r.id or b.kind is distinct from'model_input'
 or a.payload_fingerprint is distinct from encode(extensions.digest(p_model_input::text,'sha256'),'hex')or a.byte_length is distinct from octet_length(p_model_input::text)
 or not private.capital_body_physical_receipt_v1(j.organization_id,p_input_retained_payload_id)
 or private.capital_preview_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id)is null then raise exception 'capital_preview_input_denied'using errcode='42501';end if;
 select sum(octet_length(part->>'text'))into input_bytes from jsonb_array_elements(p_model_input->'input')part;
 if input_bytes not between 1 and 100000 then raise exception 'capital_preview_input_invalid'using errcode='22023';end if;
 max_dispatches:=least(run.effective_max_dispatches,case when r.boundary='synthesis'then 1 else 2 end);
 select *into s from private.capital_preview_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if s.id is null then
 insert into private.capital_preview_recipe_seals(organization_id,recipe_id,plan_task_id,input_retained_payload_id,consumed_basis_fingerprint,reconstruction_fingerprint,prompt_fingerprint,primary_request_fingerprint,fallback_request_fingerprint,input_bytes,effective_budget_micro_usd,effective_max_dispatches)
 values(j.organization_id,r.id,r.plan_task_id,p_input_retained_payload_id,p_consumed_basis_fingerprint,p_pins->>'reconstructionFingerprint',p_pins->>'promptFingerprint',p_pins->>'primaryRequestFingerprint',p_pins->>'fallbackRequestFingerprint',input_bytes,run.effective_budget_micro_usd,max_dispatches)returning *into s;
 elsif(s.input_retained_payload_id,s.consumed_basis_fingerprint,s.reconstruction_fingerprint,s.prompt_fingerprint,s.primary_request_fingerprint,s.fallback_request_fingerprint,s.input_bytes)is distinct from(p_input_retained_payload_id,p_consumed_basis_fingerprint,p_pins->>'reconstructionFingerprint',p_pins->>'promptFingerprint',p_pins->>'primaryRequestFingerprint',p_pins->>'fallbackRequestFingerprint',input_bytes)then raise exception 'capital_preview_seal_conflict'using errcode='23505';end if;
 perform private.require_capital_preview_recipe_v1(j.id,p_capability_token,r.id);
 return jsonb_build_object('schemaVersion','capital-preview-boundary-receipt.v1','state','ready','recipeId',r.id,'boundaryId',r.id,'boundary',r.boundary,'jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,'planId',r.plan_id,'planTaskId',r.plan_task_id,'rendererVersion',r.renderer_version,
 'reconstructionFingerprint',s.reconstruction_fingerprint,'promptFingerprint',s.prompt_fingerprint,'primaryRequestFingerprint',s.primary_request_fingerprint,'fallbackRequestFingerprint',s.fallback_request_fingerprint,'inputRetainedPayloadId',s.input_retained_payload_id,'consumedBasisFingerprint',s.consumed_basis_fingerprint,
 'operationalBudget',jsonb_build_object('maxExposureMicroUsd',s.effective_budget_micro_usd,'maxDispatches',s.effective_max_dispatches),'expiresAt',r.expires_at);
end;$$;

revoke all on function private.capital_capture_allocation_deadline_v2(uuid,uuid),private.capital_capture_allocation_deadline_pre_preview_v2(uuid,uuid)from public,anon,authenticated,service_role;
