-- Joint consumer rollout. The SQL-installed clock is immutable; no caller flag
-- or timestamp can select the prospective/historical branch.
set search_path='';
create table private.material_production_cutover(
 singleton boolean primary key default true check(singleton),activated_at timestamptz not null default clock_timestamp() check(isfinite(activated_at)),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
insert into private.material_production_cutover(singleton) values(true);
create table private.material_production_approval_intents(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,precursor_id uuid not null,approved_plan_id uuid not null,actor_id uuid not null references auth.users(id),command_id uuid not null,transaction_id bigint not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(organization_id,id),unique(organization_id,command_id),unique(organization_id,approved_plan_id),foreign key(organization_id,precursor_id) references private.material_production_plan_precursors(organization_id,id),foreign key(organization_id,approved_plan_id) references public.deal_state_objects(organization_id,id)
);
create index material_approval_intent_actor_fk on private.material_production_approval_intents(actor_id);
create index material_approval_intent_precursor_fk on private.material_production_approval_intents(organization_id,precursor_id);
do $$declare n text;begin
 foreach n in array array['material_production_cutover','material_production_approval_intents'] loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 execute format('create policy %I on private.%I as restrictive for select to anon,authenticated using(false)',n||'_no_select',n);execute format('create policy %I on private.%I as restrictive for insert to anon,authenticated with check(false)',n||'_no_insert',n);execute format('create policy %I on private.%I as restrictive for update to anon,authenticated using(false) with check(false)',n||'_no_update',n);execute format('create policy %I on private.%I as restrictive for delete to anon,authenticated using(false)',n||'_no_delete',n);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',n||'_immutable',n);execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',n||'_no_truncate',n);execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',n||'_updated_at',n);execute format('create trigger %I after insert on private.%I for each row execute function private.capture_identity_audit_v1()',n||'_audit',n);
 end loop;
end$$;
alter function private.worker_record_deal_state_object(uuid,text,text,text,text,jsonb,jsonb) rename to worker_record_deal_state_object_pre_material_native_v1;
create function private.worker_record_deal_state_object(p_job_id uuid,p_capability_token text,p_object_type text,p_status text,p_input_fingerprint text,p_payload jsonb,p_dependencies jsonb default '[]')
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;existing uuid;cutoff timestamptz;
begin
 if p_object_type not in('production_plan','material_artifact') then return private.worker_record_deal_state_object_pre_material_native_v1(p_job_id,p_capability_token,p_object_type,p_status,p_input_fingerprint,p_payload,p_dependencies);end if;
 j:=private.material_production_job_v1(p_job_id,p_capability_token);
 select activated_at into strict cutoff from private.material_production_cutover where singleton;
 -- Historical exact replay is a read, never a new writer or a ranked winner.
 select id into existing from public.deal_state_objects where organization_id=j.organization_id and intake_session_id=j.intake_session_id and object_type=p_object_type and status=p_status and input_fingerprint=p_input_fingerprint and payload=p_payload and dependencies=p_dependencies and created_at<cutoff and not exists(select 1 from private.material_production_plan_precursors where organization_id=j.organization_id and plan_id=deal_state_objects.id) and not exists(select 1 from private.material_production_bindings where organization_id=j.organization_id and material_object_id=deal_state_objects.id) order by object_version desc limit 1;
 if existing is not null then return existing;end if;
 raise exception 'material_production_native_writer_required' using errcode='42501';
end$$;
alter function private.record_deal_state_object(uuid,uuid,text,text,text,jsonb,jsonb) rename to record_deal_state_object_pre_material_native_v1;
create function private.record_deal_state_object(p_organization_id uuid,p_session_id uuid,p_object_type text,p_status text,p_input_fingerprint text,p_payload jsonb,p_dependencies jsonb default '[]')
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare work uuid;existing uuid;cutoff timestamptz;
begin
 if p_object_type<>'production_plan' and not(p_object_type in('package_review','release_authorization') and exists(select 1 from private.material_production_bindings b join private.material_production_recipes r on(r.organization_id,r.id)=(b.organization_id,b.recipe_id) where(r.organization_id,r.session_id)=(p_organization_id,p_session_id))) then return private.record_deal_state_object_pre_material_native_v1(p_organization_id,p_session_id,p_object_type,p_status,p_input_fingerprint,p_payload,p_dependencies);end if;
 select capital_project_id into work from public.document_intake_sessions where(organization_id,id)=(p_organization_id,p_session_id);
 if work is null or not private.can_access_resource_v1(p_organization_id,work,'work') then raise exception 'material_production_human_command_denied' using errcode='42501';end if;
 select activated_at into strict cutoff from private.material_production_cutover where singleton;
 select id into existing from public.deal_state_objects where organization_id=p_organization_id and intake_session_id=p_session_id and object_type=p_object_type and status=p_status and input_fingerprint=p_input_fingerprint and payload=p_payload and dependencies=p_dependencies and created_at<cutoff and not exists(select 1 from private.material_production_plan_approvals where organization_id=p_organization_id and approved_plan_id=deal_state_objects.id) order by object_version desc limit 1;
 if existing is not null then return existing;end if;
 raise exception 'material_production_native_human_command_required' using errcode='42501';
end$$;
alter function private.enqueue_incremental_deal_state_analysis(uuid,uuid,text) rename to enqueue_incremental_deal_state_analysis_pre_material_native_v1;
create function private.enqueue_incremental_deal_state_analysis(p_organization_id uuid,p_session_id uuid,p_trigger_source text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare plan public.deal_state_objects;work uuid;cutoff timestamptz;j public.processing_jobs;
begin
 if p_trigger_source<>'production_plan_approved' then return private.enqueue_incremental_deal_state_analysis_pre_material_native_v1(p_organization_id,p_session_id,p_trigger_source);end if;
 select capital_project_id into work from public.document_intake_sessions where(organization_id,id)=(p_organization_id,p_session_id) for update nowait;
 if work is null or not private.can_access_resource_v1(p_organization_id,work,'work') then raise exception 'material_production_enqueue_denied' using errcode='42501';end if;
 select * into plan from public.deal_state_objects where organization_id=p_organization_id and intake_session_id=p_session_id and object_type='production_plan' order by object_version desc limit 1;
 if exists(select 1 from private.material_production_approval_intents i where(i.organization_id,i.approved_plan_id,i.actor_id,i.transaction_id)=(p_organization_id,plan.id,auth.uid(),txid_current()) and private.material_plan_precursor_current_v1(p_organization_id,i.precursor_id,auth.uid())) then return private.enqueue_incremental_deal_state_analysis_pre_material_native_v1(p_organization_id,p_session_id,p_trigger_source);end if;
 select activated_at into strict cutoff from private.material_production_cutover where singleton;
 select * into j from public.processing_jobs where organization_id=p_organization_id and intake_session_id=p_session_id and kind='case_analysis' and payload->>'incremental_trigger'=p_trigger_source and payload->>'trigger_fingerprint'=plan.object_fingerprint and created_at<cutoff order by created_at desc limit 1;
 if j.id is not null then return jsonb_build_object('processing_run_id',j.processing_run_id,'job_id',j.id,'job_status',j.status,'trigger',p_trigger_source,'trigger_fingerprint',plan.object_fingerprint,'deduplicated',true);end if;
 raise exception 'material_production_native_approval_required' using errcode='42501';
end$$;
revoke all on function private.worker_record_deal_state_object_pre_material_native_v1(uuid,text,text,text,text,jsonb,jsonb),private.record_deal_state_object_pre_material_native_v1(uuid,uuid,text,text,text,jsonb,jsonb),private.enqueue_incremental_deal_state_analysis_pre_material_native_v1(uuid,uuid,text),private.worker_record_deal_state_object(uuid,text,text,text,text,jsonb,jsonb),private.record_deal_state_object(uuid,uuid,text,text,text,jsonb,jsonb),private.enqueue_incremental_deal_state_analysis(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_record_deal_state_object(uuid,text,text,text,text,jsonb,jsonb),private.record_deal_state_object(uuid,uuid,text,text,text,jsonb,jsonb),private.enqueue_incremental_deal_state_analysis(uuid,uuid,text) to authenticated;
-- The three permanent raw projections are closed for exact native approval
-- effects, independently of whether the worker creates a recipe first.
alter function private.worker_freeze_case_input(uuid,text,jsonb) rename to worker_freeze_case_input_pre_material_v1;
create function private.worker_freeze_case_input(p_job_id uuid,p_capability_token text,p_live_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.job_for_capability(p_job_id,p_capability_token);
 if exists(select 1 from private.material_production_plan_approvals where effect_job_id=p_job_id) then raise exception 'material_production_native_context_required' using errcode='42501';end if;
 return private.worker_freeze_case_input_pre_material_v1(p_job_id,p_capability_token,p_live_input);
end$$;
create or replace function public.worker_freeze_case_input(p_job_id uuid,p_capability_token text,p_live_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_freeze_case_input(p_job_id,p_capability_token,p_live_input);$$;
alter function private.worker_record_controlled_execution(uuid,text,jsonb,jsonb,jsonb) rename to worker_record_controlled_execution_pre_material_v1;
create function private.worker_record_controlled_execution(p_job_id uuid,p_capability_token text,p_report jsonb,p_manifest jsonb,p_comparison jsonb default null)
returns uuid language plpgsql security definer set search_path='' as $$begin
 perform private.job_for_capability(p_job_id,p_capability_token);
 if exists(select 1 from private.material_production_plan_approvals where effect_job_id=p_job_id) then raise exception 'material_production_native_commit_required' using errcode='42501';end if;
 return private.worker_record_controlled_execution_pre_material_v1(p_job_id,p_capability_token,p_report,p_manifest,p_comparison);
end$$;
create or replace function public.worker_record_controlled_execution(p_job_id uuid,p_capability_token text,p_report jsonb,p_manifest jsonb,p_comparison jsonb default null)
returns uuid language sql security invoker set search_path='' as $$select private.worker_record_controlled_execution(p_job_id,p_capability_token,p_report,p_manifest,p_comparison);$$;
alter function private.worker_record_case_snapshot(uuid,text,jsonb,jsonb) rename to worker_record_case_snapshot_pre_material_v1;
create function private.worker_record_case_snapshot(p_job_id uuid,p_capability_token text,p_manifest jsonb,p_case_state jsonb)
returns uuid language plpgsql security definer set search_path='' as $$begin
 perform private.job_for_capability(p_job_id,p_capability_token);
 if exists(select 1 from private.material_production_plan_approvals where effect_job_id=p_job_id) then raise exception 'material_production_native_commit_required' using errcode='42501';end if;
 return private.worker_record_case_snapshot_pre_material_v1(p_job_id,p_capability_token,p_manifest,p_case_state);
end$$;
create or replace function public.worker_record_case_snapshot(p_job_id uuid,p_capability_token text,p_manifest jsonb,p_case_state jsonb)
returns uuid language sql security invoker set search_path='' as $$select private.worker_record_case_snapshot(p_job_id,p_capability_token,p_manifest,p_case_state);$$;
revoke all on function private.worker_freeze_case_input_pre_material_v1(uuid,text,jsonb),private.worker_record_controlled_execution_pre_material_v1(uuid,text,jsonb,jsonb,jsonb),private.worker_record_case_snapshot_pre_material_v1(uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.worker_freeze_case_input(uuid,text,jsonb),private.worker_record_controlled_execution(uuid,text,jsonb,jsonb,jsonb),private.worker_record_case_snapshot(uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_freeze_case_input(uuid,text,jsonb),private.worker_record_controlled_execution(uuid,text,jsonb,jsonb,jsonb),private.worker_record_case_snapshot(uuid,text,jsonb,jsonb) to authenticated;
