-- 3S deterministic production plan: no historical authorship conversion.
-- Assemble after material_production_native_capture.sql and before consumers.
set search_path='';
create table private.material_production_plan_precursors(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,session_id uuid not null,producer_job_id uuid not null,request_id uuid not null,
 structure_decision_id uuid not null,structure_fingerprint text not null check(structure_fingerprint~'^[a-f0-9]{64}$'),input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),source_closure_fingerprint text not null check(source_closure_fingerprint~'^[a-f0-9]{64}$'),
 plan_id uuid not null,plan_fingerprint text not null check(plan_fingerprint~'^[a-f0-9]{64}$'),human_subject_id uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,plan_id),unique(organization_id,producer_job_id),unique(organization_id,producer_job_id,request_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),foreign key(organization_id,session_id) references public.document_intake_sessions(organization_id,id),foreign key(organization_id,producer_job_id) references public.processing_jobs(organization_id,id),foreign key(organization_id,structure_decision_id) references public.deal_state_objects(organization_id,id),foreign key(organization_id,plan_id) references public.deal_state_objects(organization_id,id)
);
create table private.material_production_plan_approvals(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,precursor_id uuid not null,command_id uuid not null,approved_plan_id uuid not null,approved_plan_fingerprint text not null check(approved_plan_fingerprint~'^[a-f0-9]{64}$'),actor_id uuid not null references auth.users(id),effect_job_id uuid not null,effect_run_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(organization_id,id),unique(organization_id,precursor_id),unique(organization_id,command_id),unique(organization_id,approved_plan_id),
 foreign key(organization_id,precursor_id) references private.material_production_plan_precursors(organization_id,id),foreign key(organization_id,approved_plan_id) references public.deal_state_objects(organization_id,id),foreign key(organization_id,effect_job_id) references public.processing_jobs(organization_id,id),foreign key(organization_id,effect_run_id) references public.processing_runs(organization_id,id)
);
create index material_plan_work_fk on private.material_production_plan_precursors(organization_id,work_id);
create index material_plan_session_fk on private.material_production_plan_precursors(organization_id,session_id);
create index material_plan_structure_fk on private.material_production_plan_precursors(organization_id,structure_decision_id);
create index material_plan_subject_fk on private.material_production_plan_precursors(human_subject_id);
create index material_plan_approval_actor_fk on private.material_production_plan_approvals(actor_id);
create index material_plan_approval_job_fk on private.material_production_plan_approvals(organization_id,effect_job_id);
create index material_plan_approval_run_fk on private.material_production_plan_approvals(organization_id,effect_run_id);
do $$declare n text;begin
 foreach n in array array['material_production_plan_precursors','material_production_plan_approvals'] loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 execute format('create policy %I on private.%I as restrictive for select to anon,authenticated using(false)',n||'_no_select',n);execute format('create policy %I on private.%I as restrictive for insert to anon,authenticated with check(false)',n||'_no_insert',n);execute format('create policy %I on private.%I as restrictive for update to anon,authenticated using(false) with check(false)',n||'_no_update',n);execute format('create policy %I on private.%I as restrictive for delete to anon,authenticated using(false)',n||'_no_delete',n);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',n||'_immutable',n);execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',n||'_no_truncate',n);execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',n||'_updated_at',n);execute format('create trigger %I after insert on private.%I for each row execute function private.capture_identity_audit_v1()',n||'_audit',n);
 end loop;
end$$;
create function private.material_plan_sources_fingerprint_v1(p_org uuid,p_session uuid,p_subject uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare d public.source_documents;v public.source_versions;r private.source_rights_versions;op text;items jsonb:='[]'::jsonb;
begin
 for d in select * from public.source_documents where organization_id=p_org and intake_session_id=p_session order by id for share nowait loop
 select * into v from public.source_versions where(organization_id,id)=(p_org,d.id) for share nowait;
 select * into r from private.source_rights_versions where organization_id=p_org and source_version_id=d.id order by revision desc limit 1 for share nowait;
 if v.id is null or r.id is null or v.declared_sha256 is distinct from d.sha256 then raise exception 'material_plan_source_unproven' using errcode='42501';end if;
 foreach op in array array['read','process','store','derive'] loop if not private.source_use_allowed_v1(p_org,d.id,p_subject,op,'analysis') then raise exception 'material_plan_source_denied' using errcode='42501';end if;end loop;
 items:=items||jsonb_build_array(jsonb_build_array(d.id,d.document_version,d.sha256,r.id));
 end loop;
 return encode(extensions.digest(items::text,'sha256'),'hex');
end$$;
create function private.material_plan_precursor_current_v1(p_org uuid,p_precursor uuid,p_subject uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare c private.material_production_plan_precursors;s public.deal_state_objects;
begin
 select * into c from private.material_production_plan_precursors where(organization_id,id)=(p_org,p_precursor);
 if c.id is null or not private.capital_body_subject_allowed_v1(p_org,c.work_id,p_subject) or not private.capital_body_subject_allowed_v1(p_org,c.work_id,c.human_subject_id) or c.input_fingerprint is distinct from private.execution_approval_input_fingerprint(p_org,c.session_id) then return false;end if;
 select * into s from public.deal_state_objects where organization_id=p_org and intake_session_id=c.session_id and object_type='structure_decision' order by object_version desc limit 1;
 if (s.id,s.object_fingerprint) is distinct from(c.structure_decision_id,c.structure_fingerprint) or s.status not in('confirmed','approved') then return false;end if;
 return c.source_closure_fingerprint=private.material_plan_sources_fingerprint_v1(p_org,c.session_id,p_subject) and c.source_closure_fingerprint=private.material_plan_sources_fingerprint_v1(p_org,c.session_id,c.human_subject_id);
end$$;
create function private.material_plan_dto_v1(p_org uuid,p_plan uuid,p_replayed boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c private.material_production_plan_precursors;p public.deal_state_objects;
begin
 select * into strict c from private.material_production_plan_precursors where(organization_id,plan_id)=(p_org,p_plan);select * into strict p from public.deal_state_objects where(organization_id,id)=(p_org,p_plan);
 return jsonb_build_object('schemaVersion','capital-material-production-plan.v1','precursorId',c.id,'workId',c.work_id,'planId',p.id,'planVersion',p.object_version,'planFingerprint',p.object_fingerprint,'inputFingerprint',c.input_fingerprint,'structureDecisionId',c.structure_decision_id,'structureFingerprint',c.structure_fingerprint,'plan',p.payload,'replayed',p_replayed);
end$$;
create function private.worker_prepare_material_production_plan_v1(p_job_id uuid,p_capability_token text,p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.material_production_job_v1(p_job_id,p_capability_token);w uuid;s public.deal_state_objects;c private.material_production_plan_precursors;p public.deal_state_objects;v_plan_id uuid;fp text;closure text;v_payload jsonb;deps jsonb;
begin
 if p_request_id is null then raise exception 'material_plan_request_required' using errcode='22023';end if;
 select capital_project_id into strict w from public.document_intake_sessions where(organization_id,id)=(j.organization_id,j.intake_session_id) for share nowait;
 if not pg_try_advisory_xact_lock(hashtextextended('material-plan:'||j.organization_id::text||':'||w::text,0)) then raise exception 'material_plan_retry' using errcode='40001';end if;
 select * into c from private.material_production_plan_precursors where(organization_id,producer_job_id)=(j.organization_id,j.id);
 if c.id is not null then
 if c.request_id<>p_request_id or not private.material_plan_precursor_current_v1(j.organization_id,c.id,j.authorization_subject_id) then raise exception 'material_plan_replay_changed' using errcode='42501';end if;
 return private.material_plan_dto_v1(j.organization_id,c.plan_id,true);
 end if;
 select * into s from public.deal_state_objects where organization_id=j.organization_id and intake_session_id=j.intake_session_id and object_type='structure_decision' order by object_version desc limit 1 for share nowait;
 if s.id is null or s.status not in('confirmed','approved') then raise exception 'material_plan_structure_required' using errcode='42501';end if;
 fp:=private.execution_approval_input_fingerprint(j.organization_id,j.intake_session_id);closure:=private.material_plan_sources_fingerprint_v1(j.organization_id,j.intake_session_id,j.authorization_subject_id);
 v_payload:=jsonb_build_object('schemaVersion','2026.08.29-v1','artifacts',jsonb_build_array('teaser','financial_model','indicative_term_sheet','data_room_index'),'sourceCaseFingerprint',fp);
 deps:=jsonb_build_array(jsonb_build_object('objectType','structure_decision','objectFingerprint',s.object_fingerprint));
 v_plan_id:=private.append_deal_state_object(j.organization_id,j.intake_session_id,'production_plan','pending_confirmation',fp,v_payload,deps,null,'worker');
 select * into strict p from public.deal_state_objects where(organization_id,id)=(j.organization_id,v_plan_id);
 insert into private.material_production_plan_precursors(organization_id,work_id,session_id,producer_job_id,request_id,structure_decision_id,structure_fingerprint,input_fingerprint,source_closure_fingerprint,plan_id,plan_fingerprint,human_subject_id) values(j.organization_id,w,j.intake_session_id,j.id,p_request_id,s.id,s.object_fingerprint,fp,closure,p.id,p.object_fingerprint,j.authorization_subject_id) returning * into c;
 if not private.material_plan_precursor_current_v1(j.organization_id,c.id,j.authorization_subject_id) or not private.material_production_clock_current_v1(j.id,p_capability_token) then raise exception 'material_plan_changed' using errcode='42501';end if;
 return private.material_plan_dto_v1(j.organization_id,p.id,false);
end$$;
revoke all on function private.material_plan_sources_fingerprint_v1(uuid,uuid,uuid),private.material_plan_precursor_current_v1(uuid,uuid,uuid),private.material_plan_dto_v1(uuid,uuid,boolean),private.worker_prepare_material_production_plan_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
create function private.approve_material_production_plan_v1(p_work_id uuid,p_plan_id uuid,p_plan_fingerprint text,p_command_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();org uuid;c private.material_production_plan_precursors;a private.material_production_plan_approvals;p public.deal_state_objects;approved public.deal_state_objects;v_approved_id uuid;effect jsonb;
begin
 select organization_id into org from public.capital_projects where id=p_work_id;
 if actor is null or org is null or p_command_id is null or p_plan_fingerprint is null or not private.can_access_resource_v1(org,p_work_id,'work') then raise exception 'material_plan_approval_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended('resource-policy:'||org::text,0)) or not pg_try_advisory_xact_lock(hashtextextended('material-plan:'||org::text||':'||p_work_id::text,0)) then raise exception 'material_plan_retry' using errcode='40001';end if;
 perform 1 from public.document_intake_sessions where organization_id=org and capital_project_id=p_work_id for update nowait;
 select * into c from private.material_production_plan_precursors where(organization_id,work_id,plan_id)=(org,p_work_id,p_plan_id);
 select * into a from private.material_production_plan_approvals where organization_id=org and(command_id=p_command_id or precursor_id=c.id);
 if c.id is null or c.plan_fingerprint is distinct from p_plan_fingerprint or not private.material_plan_precursor_current_v1(org,c.id,actor) then raise exception 'material_plan_approval_basis_changed' using errcode='42501';end if;
 if a.id is not null then
 if(a.command_id,a.precursor_id,a.actor_id) is distinct from(p_command_id,c.id,actor) then raise exception 'material_plan_approval_conflict' using errcode='23505';end if;
 if not exists(select 1 from public.deal_state_objects where(organization_id,id,object_fingerprint,status)=(org,a.approved_plan_id,a.approved_plan_fingerprint,'approved')) then raise exception 'material_plan_approval_basis_changed' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-material-plan-approval.v1','workId',p_work_id,'precursorId',c.id,'proposedPlanId',p_plan_id,'approvedPlanId',a.approved_plan_id,'approvedPlanFingerprint',a.approved_plan_fingerprint,'jobId',a.effect_job_id,'runId',a.effect_run_id,'replayed',true);
 end if;
 select * into p from public.deal_state_objects where organization_id=org and intake_session_id=c.session_id and object_type='production_plan' order by object_version desc limit 1 for share nowait;
 if(p.id,p.object_fingerprint,p.status) is distinct from(c.plan_id,c.plan_fingerprint,'pending_confirmation') then raise exception 'material_plan_current_proposal_required' using errcode='42501';end if;
 v_approved_id:=private.append_deal_state_object(org,c.session_id,'production_plan','approved',c.input_fingerprint,p.payload,p.dependencies,actor,'user');
 select * into strict approved from public.deal_state_objects where(organization_id,id)=(org,v_approved_id);
 insert into private.material_production_approval_intents(organization_id,precursor_id,approved_plan_id,actor_id,command_id,transaction_id) values(org,c.id,approved.id,actor,p_command_id,txid_current());
 effect:=private.enqueue_incremental_deal_state_analysis(org,c.session_id,'production_plan_approved');
 if not exists(select 1 from public.processing_jobs where(organization_id,id,intake_session_id,kind)=(org,(effect->>'job_id')::uuid,c.session_id,'case_analysis') and payload->>'trigger_fingerprint'=approved.object_fingerprint and authorization_subject_id=actor) then raise exception 'material_plan_approval_effect_unproven' using errcode='42501';end if;
 insert into private.material_production_plan_approvals(organization_id,precursor_id,command_id,approved_plan_id,approved_plan_fingerprint,actor_id,effect_job_id,effect_run_id) values(org,c.id,p_command_id,approved.id,approved.object_fingerprint,actor,(effect->>'job_id')::uuid,(effect->>'processing_run_id')::uuid) returning * into a;
 if not private.material_plan_precursor_current_v1(org,c.id,actor) or not private.can_access_resource_v1(org,p_work_id,'work') then raise exception 'material_plan_approval_basis_changed' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-material-plan-approval.v1','workId',p_work_id,'precursorId',c.id,'proposedPlanId',p_plan_id,'approvedPlanId',a.approved_plan_id,'approvedPlanFingerprint',a.approved_plan_fingerprint,'jobId',a.effect_job_id,'runId',a.effect_run_id,'replayed',false);
end$$;
create function private.read_material_production_plan_v1(p_work_id uuid,p_plan_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare org uuid;c private.material_production_plan_precursors;
begin
 select organization_id into org from public.capital_projects where id=p_work_id;
 if org is null or not private.can_access_resource_v1(org,p_work_id,'read') then raise exception 'material_plan_read_denied' using errcode='42501';end if;
 select * into c from private.material_production_plan_precursors where(organization_id,work_id,plan_id)=(org,p_work_id,p_plan_id);
 if c.id is null or not private.material_plan_precursor_current_v1(org,c.id,auth.uid()) then raise exception 'material_plan_read_denied' using errcode='42501';end if;
 return private.material_plan_dto_v1(org,p_plan_id,false);
end$$;
revoke all on function private.approve_material_production_plan_v1(uuid,uuid,text,uuid),private.read_material_production_plan_v1(uuid,uuid) from public,anon,authenticated,service_role;
create function public.worker_prepare_material_production_plan_v1(p_job_id uuid,p_capability_token text,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.worker_prepare_material_production_plan_v1(p_job_id,p_capability_token,p_request_id);$$;
create function public.approve_material_production_plan_v1(p_work_id uuid,p_plan_id uuid,p_plan_fingerprint text,p_command_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.approve_material_production_plan_v1(p_work_id,p_plan_id,p_plan_fingerprint,p_command_id);$$;
create function public.read_material_production_plan_v1(p_work_id uuid,p_plan_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.read_material_production_plan_v1(p_work_id,p_plan_id);$$;
revoke all on function public.worker_prepare_material_production_plan_v1(uuid,text,uuid),public.approve_material_production_plan_v1(uuid,uuid,text,uuid),public.read_material_production_plan_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.worker_prepare_material_production_plan_v1(uuid,text,uuid),private.worker_prepare_material_production_plan_v1(uuid,text,uuid),public.approve_material_production_plan_v1(uuid,uuid,text,uuid),private.approve_material_production_plan_v1(uuid,uuid,text,uuid),public.read_material_production_plan_v1(uuid,uuid),private.read_material_production_plan_v1(uuid,uuid) to authenticated;
