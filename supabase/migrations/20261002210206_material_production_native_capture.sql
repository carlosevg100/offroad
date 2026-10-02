-- Stage 20 / 3S. Assemble with the complete producer, finite body service and
-- human readers. Never publish this catalogue alone; no history backfill.
set search_path='';
create table private.material_production_recipes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 session_id uuid not null,producer_job_id uuid not null,controlled_execution_id uuid not null,
 production_plan_id uuid not null,production_plan_version integer not null check(production_plan_version>0),production_plan_fingerprint text not null check(production_plan_fingerprint~'^[a-f0-9]{64}$'),
 human_subject_id uuid not null references auth.users(id),worker_account_id uuid not null references auth.users(id),
 prior_execution_id uuid,input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),context_fingerprint text not null check(context_fingerprint~'^[a-f0-9]{64}$'),source_closure_fingerprint text not null check(source_closure_fingerprint~'^[a-f0-9]{64}$'),
 calculation_version text not null check(calculation_version='2026.09.10-v17'),renderer_version text not null check(renderer_version='capital-material-package.v1'),
 retention_policy_id uuid not null references private.capital_public_retention_policies(id),captured_at timestamptz not null,expires_at timestamptz not null check(isfinite(expires_at)),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,producer_job_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,session_id) references public.document_intake_sessions(organization_id,id),
 foreign key(organization_id,producer_job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,controlled_execution_id) references public.controlled_case_executions(organization_id,id),
 foreign key(organization_id,prior_execution_id) references public.controlled_case_executions(organization_id,id),
 foreign key(organization_id,production_plan_id) references public.deal_state_objects(organization_id,id)
);
create index material_recipe_work_fk on private.material_production_recipes(organization_id,work_id);
create index material_recipe_session_fk on private.material_production_recipes(organization_id,session_id);
create index material_recipe_execution_fk on private.material_production_recipes(organization_id,controlled_execution_id);
create index material_recipe_prior_fk on private.material_production_recipes(organization_id,prior_execution_id);
create index material_recipe_plan_fk on private.material_production_recipes(organization_id,production_plan_id);
create index material_recipe_subject_fk on private.material_production_recipes(human_subject_id);
create index material_recipe_worker_fk on private.material_production_recipes(worker_account_id);
create index material_recipe_policy_fk on private.material_production_recipes(retention_policy_id);
create table private.material_production_source_pins(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,recipe_id uuid not null,source_version_id uuid not null,rights_version_id uuid not null,
 document_version integer not null check(document_version>0),declared_sha256 text not null check(declared_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(organization_id,id),unique(organization_id,recipe_id,source_version_id),
 foreign key(organization_id,recipe_id) references private.material_production_recipes(organization_id,id),
 foreign key(organization_id,source_version_id) references public.source_versions(organization_id,id),
 foreign key(organization_id,rights_version_id) references private.source_rights_versions(organization_id,id)
);
create index material_source_version_fk on private.material_production_source_pins(organization_id,source_version_id);
create index material_source_rights_fk on private.material_production_source_pins(organization_id,rights_version_id);
-- Exact canonical external gate IDs are derived from the retained typed state.
-- No worker-supplied prefix or free-form exception classification is authority.
create function private.material_allowed_external_critical_ids_v1(p_state jsonb)
returns text[] language plpgsql immutable security definer set search_path='' as $$
declare flags jsonb:=p_state#>'{materialProductionGovernance,redFlags}';finding jsonb;ids text[]:='{}';blockers text[];
begin
 if flags is null then return ids;end if;
 if flags->>'version' is distinct from '2026.08.26-v1' or jsonb_typeof(flags->'findings') is distinct from 'array' or jsonb_array_length(flags->'findings')<>20 or(select count(distinct x->>'flagId') from jsonb_array_elements(flags->'findings') x)<>20 or coalesce(flags#>>'{mandate,recommendation}','') not in('continue','continue_with_conditions','decline_review_required') or jsonb_typeof(flags#>'{mandate,externalOutputsAllowed}') is distinct from 'boolean' then raise exception 'material_external_gate_state_invalid' using errcode='22023';end if;
 for finding in select value from jsonb_array_elements(flags->'findings') loop
 if coalesce(finding->>'flagId','')!~'^RF-(0[1-9]|1[0-9]|20)$' or coalesce(finding->>'status','') not in('clear','candidate','confirmed','false_positive','treated','accepted_risk','not_computable','not_applicable') or jsonb_typeof(finding->'blocksExternalOutputs') is distinct from 'boolean' then raise exception 'material_external_gate_state_invalid' using errcode='22023';end if;
 if(finding->>'blocksExternalOutputs')::boolean then ids:=array_append(ids,'external-governance:red_flag:'||(finding->>'flagId')||':'||(finding->>'status'));end if;
 end loop;
 if flags#>>'{mandate,recommendation}'='decline_review_required' and flags#>'{mandate,decision}'='null'::jsonb then ids:=array_append(ids,'external-governance:mandate_decision:required');end if;
 if flags#>>'{mandate,decision,decision}'='decline' then ids:=array_append(ids,'external-governance:mandate_decision:declined');end if;
 select coalesce(array_agg(substr(x,length('external-governance:')+1) order by x),'{}') into blockers from unnest(ids) x;
 if blockers is distinct from(select coalesce(array_agg(x order by x),'{}') from jsonb_array_elements_text(flags->'blockers') x) then raise exception 'material_external_gate_state_invalid' using errcode='22023';end if;
 if(flags#>>'{mandate,externalOutputsAllowed}')::boolean then return '{}';end if;
 return ids;
end$$;
revoke all on function private.material_allowed_external_critical_ids_v1(jsonb) from public,anon,authenticated,service_role;
create table private.material_production_body_bases(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,recipe_id uuid not null,
 kind text not null check(kind in('context','calculation_report','case_state','material_package')),
 allowed_external_critical_ids text[],check((kind='case_state')=(allowed_external_critical_ids is not null)),
 material_ready boolean,check((kind='case_state')=(material_ready is not null)),
 report_status text check(report_status is null or report_status in('succeeded','blocked','failed')),
 check((kind='calculation_report')=(report_status is not null)),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,recipe_id,kind),
 foreign key(organization_id,work_id,recipe_id) references private.material_production_recipes(organization_id,work_id,id)
);
create table private.material_production_seals(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,recipe_id uuid not null,context_retained_payload_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(organization_id,id),unique(organization_id,recipe_id),
 foreign key(organization_id,recipe_id) references private.material_production_recipes(organization_id,id),
 foreign key(organization_id,context_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index material_seal_retained_fk on private.material_production_seals(organization_id,context_retained_payload_id);
create table private.material_production_bindings(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,recipe_id uuid not null,material_object_id uuid not null,revision_id uuid not null,
 report_retained_payload_id uuid not null,state_retained_payload_id uuid not null,package_retained_payload_id uuid not null,bundle_fingerprint text not null check(bundle_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,material_object_id),unique(organization_id,revision_id),
 foreign key(organization_id,work_id,recipe_id) references private.material_production_recipes(organization_id,work_id,id),
 foreign key(organization_id,material_object_id) references public.deal_state_objects(organization_id,id) deferrable initially deferred,
 foreign key(organization_id,revision_id) references public.artifact_revisions(organization_id,id) deferrable initially deferred,
 foreign key(organization_id,report_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,state_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,package_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index material_binding_report_fk on private.material_production_bindings(organization_id,report_retained_payload_id);
create index material_binding_state_fk on private.material_production_bindings(organization_id,state_retained_payload_id);
create index material_binding_package_fk on private.material_production_bindings(organization_id,package_retained_payload_id);
do $$declare n text;begin
 foreach n in array array['material_production_recipes','material_production_source_pins','material_production_body_bases','material_production_seals','material_production_bindings'] loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 execute format('create policy %I on private.%I as restrictive for select to anon,authenticated using(false)',n||'_no_select',n);
 execute format('create policy %I on private.%I as restrictive for insert to anon,authenticated with check(false)',n||'_no_insert',n);
 execute format('create policy %I on private.%I as restrictive for update to anon,authenticated using(false) with check(false)',n||'_no_update',n);
 execute format('create policy %I on private.%I as restrictive for delete to anon,authenticated using(false)',n||'_no_delete',n);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',n||'_immutable',n);
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',n||'_no_truncate',n);
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',n||'_updated_at',n);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_identity_audit_v1()',n||'_audit',n);
 end loop;
end$$;

create function private.material_production_source_closure_fingerprint_v1(p_org uuid,p_recipe uuid)
returns text language sql stable security definer set search_path='' as $$
 select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_array(source_version_id,rights_version_id,document_version,declared_sha256) order by source_version_id),'[]'::jsonb)::text,'sha256'),'hex') from private.material_production_source_pins where organization_id=p_org and recipe_id=p_recipe;
$$;
revoke all on function private.material_production_source_closure_fingerprint_v1(uuid,uuid) from public,anon,authenticated,service_role;

-- A current capability is not a source licence. The full input producer must
-- pin every source and call this closure at capture, seal, read, commit/recovery.
create function private.material_production_sources_current_v1(p_org uuid,p_recipe uuid,p_subject uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare r private.material_production_recipes;pin private.material_production_source_pins;right_row private.source_rights_versions;op text;
begin
 select * into r from private.material_production_recipes where organization_id=p_org and id=p_recipe;
 if r.id is null or r.source_closure_fingerprint is distinct from private.material_production_source_closure_fingerprint_v1(p_org,p_recipe) or p_subject is null or r.expires_at<=clock_timestamp() or not private.capital_body_subject_allowed_v1(p_org,r.work_id,p_subject) or not private.capital_body_subject_allowed_v1(p_org,r.work_id,r.human_subject_id) then return false;end if;
 if r.input_fingerprint is distinct from private.material_production_input_fingerprint_v1(p_org,r.session_id,r.production_plan_id) then return false;end if;
 if not exists(select 1 from private.material_production_plan_approvals a where(a.organization_id,a.approved_plan_id,a.effect_job_id,a.actor_id)=(p_org,r.production_plan_id,r.producer_job_id,r.human_subject_id) and private.material_plan_precursor_current_v1(p_org,a.precursor_id,p_subject)) then return false;end if;
 if not exists(select 1 from public.deal_state_objects p where p.organization_id=p_org and p.id=r.production_plan_id and p.intake_session_id=r.session_id and p.object_type='production_plan' and p.object_version=r.production_plan_version and p.object_fingerprint=r.production_plan_fingerprint and p.status='approved') then return false;end if;
 for pin in select * from private.material_production_source_pins where organization_id=p_org and recipe_id=p_recipe order by source_version_id loop
 select * into right_row from private.source_rights_versions where organization_id=p_org and source_version_id=pin.source_version_id order by revision desc limit 1 for share nowait;
 if right_row.id is distinct from pin.rights_version_id or not exists(select 1 from public.source_versions v join public.source_documents d on(d.organization_id,d.id)=(v.organization_id,v.id) where(v.organization_id,v.id)=(p_org,pin.source_version_id) and v.declared_sha256=pin.declared_sha256 and d.sha256=pin.declared_sha256 and d.document_version=pin.document_version) then return false;end if;
 foreach op in array array['read','process','store','derive'] loop
 if not private.source_use_allowed_v1(p_org,pin.source_version_id,p_subject,op,'analysis') or not private.source_use_allowed_v1(p_org,pin.source_version_id,r.human_subject_id,op,'analysis') then return false;end if;
 end loop;
 end loop;
 return true;
end;$$;
revoke all on function private.material_production_sources_current_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- This consumer is a case-analysis job, never a synthetic capital-project job
-- created solely to obtain a differently scoped Storage or gateway capability.
create function private.material_production_job_v1(p_job uuid,p_capability text)
returns public.processing_jobs language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;w uuid;
begin
 j:=private.job_for_capability(p_job,p_capability);
 if j.kind<>'case_analysis' or j.status<>'leased' or j.leased_account_user_id is distinct from auth.uid() or j.lease_expires_at<=clock_timestamp() or not private.job_authority_is_current_v1(j.id) then raise exception 'material_production_job_denied' using errcode='42501';end if;
 select capital_project_id into w from public.document_intake_sessions where(organization_id,id)=(j.organization_id,j.intake_session_id);
 if w is null or not private.capital_body_subject_allowed_v1(j.organization_id,w,j.authorization_subject_id) then raise exception 'material_production_job_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended('resource-policy:'||j.organization_id::text,0)) then raise exception 'material_production_retry' using errcode='40001';end if;
 perform 1 from private.worker_tokens where id=j.leased_by and status='active' and revoked_at is null and execution_account_user_id=auth.uid() for share nowait;
 if not found then raise exception 'material_production_job_denied' using errcode='42501';end if;
 perform 1 from auth.users where id=j.authorization_subject_id and deleted_at is null and(banned_until is null or banned_until<=clock_timestamp()) for share nowait;
 if not found then raise exception 'material_production_job_denied' using errcode='42501';end if;
 perform 1 from public.organization_memberships where organization_id=j.organization_id and user_id=j.authorization_subject_id and status='active' for share nowait;
 if not found then raise exception 'material_production_job_denied' using errcode='42501';end if;
 return j;
end$$;
revoke all on function private.material_production_job_v1(uuid,text) from public,anon,authenticated,service_role;

-- Server joins the three actual loader components. A worker-supplied JSON freeze
-- is not an input authority. This command does not copy input_json into the old
-- private.case_execution_inputs table.
create function private.material_production_live_inputs_v1(p_job uuid,p_capability text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.material_production_job_v1(p_job,p_capability);c jsonb;query text;institution jsonb;retrieval jsonb;
begin
 c:=private.worker_load_case_input_v3(j.id,p_capability);
 if jsonb_typeof(c) is distinct from 'object' then raise exception 'material_production_inputs_denied' using errcode='42501';end if;
 query:=case c#>>'{session,archetype}' when 'working_capital' then 'capital de giro OR recebíveis OR liquidez' when 'growth_expansion' then 'expansão OR crescimento OR capex OR ramp-up' when 'acquisition' then 'aquisição OR M&A OR pró-forma OR integração' when 'refinance' then 'refinanciamento OR vencimentos OR alongamento' when 'equipment_finance' then 'equipamento OR capex OR garantia' when 'venture_debt' then 'venture debt OR runway OR sponsor' else 'capacidade OR estrutura OR evidência' end||' OR capacidade OR estrutura OR evidência OR mandato';
 retrieval:=private.worker_load_retrieval_context(j.id,p_capability,query,'{}'::uuid[],null,24);
 institution:=private.worker_load_institutional_model_context_v3(j.id,p_capability);
 return c||jsonb_build_object('primary_retrieval',retrieval,'institutional_model_context',institution,'claim_decisions',private.worker_load_claim_decisions(j.id,p_capability),'document_work_request',private.worker_load_document_work_request_v1(j.id,p_capability));
end$$;
revoke all on function private.material_production_live_inputs_v1(uuid,text) from public,anon,authenticated,service_role;

-- Projection excludes only outputs/progress produced by this execution. The
-- economic, source, reviewed-fact, choice and institutional inputs stay bound.
create function private.material_production_input_fingerprint_v1(p_org uuid,p_session uuid,p_plan uuid)
returns text language sql stable security definer set search_path='' as $$
 select encode(extensions.digest(jsonb_build_object(
 'schemaVersion','material-production-inputs.v1',
 'executionInput',private.execution_approval_input_fingerprint(p_org,p_session),
 'plan',(select jsonb_build_array(id,object_version,object_fingerprint,payload,dependencies,status) from public.deal_state_objects where(organization_id,id,intake_session_id)=(p_org,p_plan,p_session)),
 'decisions',coalesce((select jsonb_agg(jsonb_build_array(id,object_type,object_version,object_fingerprint,payload,dependencies) order by id) from public.deal_state_objects where organization_id=p_org and intake_session_id=p_session and object_type in('structure_decision','production_plan') and status in('confirmed','approved')),'[]'::jsonb),
 'caseRetrievalChunks',coalesce((select jsonb_agg(to_jsonb(chunk) order by chunk.id) from public.case_retrieval_chunks chunk where(chunk.organization_id,chunk.intake_session_id)=(p_org,p_session)),'[]'::jsonb),
 'institutionalConfigurations',coalesce((select jsonb_agg(jsonb_build_array(cfg.id,cfg.revision,cfg.configuration_fingerprint,cfg.status,private.institutional_configuration_provenance(cfg.organization_id,cfg.id)) order by cfg.id) from private.institutional_model_configurations cfg join public.document_intake_sessions session on(session.organization_id,session.capital_project_id)=(cfg.organization_id,cfg.capital_project_id) where(session.organization_id,session.id)=(p_org,p_session) and cfg.status='approved'),'[]'::jsonb),
 'playbook',(select jsonb_build_array(house.id,house.semantic_version,house.status,house.usage_license,house.usage_expires_at,(select jsonb_agg(to_jsonb(chunk) order by chunk.id) from public.house_playbook_chunks chunk where chunk.playbook_version_id=house.id)) from public.house_playbook_versions house where house.status='approved' and private.house_usage_allowed_v1(house.id) order by house.created_at desc limit 1),
 'calculationVersion','2026.09.10-v17','materialCompilerVersion','2026.10.02-v10'
 )::text,'sha256'),'hex');
$$;
revoke all on function private.material_production_input_fingerprint_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

alter table private.capital_public_payload_allocations add column material_body_basis_id uuid,
 add constraint material_allocation_basis_fk foreign key(organization_id,material_body_basis_id) references private.material_production_body_bases(organization_id,id);
create index material_allocation_basis_fk_idx on private.capital_public_payload_allocations(organization_id,material_body_basis_id);
create unique index material_allocation_request_idx on private.capital_public_payload_allocations(organization_id,job_id,request_id) where content_kind='material_body';
-- Preserve every existing discriminant including S11 when installed. Only this
-- new branch can reference the material basis; older allocations require NULL.
do $$declare expression text;nulls text:='body_basis_id,m07_body_basis_id,delivery_id,license_id,licensing_organization_id';begin
 select pg_get_constraintdef(oid) into expression from pg_constraint where conrelid='private.capital_public_payload_allocations'::regclass and conname='capital_public_payload_allocations_content_kind_check';
 expression:=substring(expression from 7);
 alter table private.capital_public_payload_allocations drop constraint capital_public_payload_allocations_content_kind_check;
 execute 'alter table private.capital_public_payload_allocations add constraint capital_public_payload_allocations_content_kind_check check ('||expression||' or content_kind=''material_body'')';
 select pg_get_constraintdef(oid) into expression from pg_constraint where conrelid='private.capital_public_payload_allocations'::regclass and conname='capital_allocations_kind_invariant';
 expression:=substring(expression from 7);
 if exists(select 1 from pg_attribute where attrelid='private.capital_public_payload_allocations'::regclass and attname='s11_body_basis_id' and not attisdropped) then nulls:=nulls||',s11_body_basis_id';end if;
 alter table private.capital_public_payload_allocations drop constraint capital_allocations_kind_invariant;
 execute 'alter table private.capital_public_payload_allocations add constraint capital_allocations_kind_invariant check((material_body_basis_id is null and '||expression||') or(content_kind=''material_body'' and material_body_basis_id is not null and num_nonnulls('||nulls||')=0))';
end$$;

create function private.material_production_deadline_v1(p_org uuid,p_recipe uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare r private.material_production_recipes;deadline timestamptz;pin private.material_production_source_pins;rights private.source_rights_versions;s private.material_production_seals;a private.capital_public_payload_allocations;
begin
 select * into r from private.material_production_recipes where organization_id=p_org and id=p_recipe;
 if not private.material_production_sources_current_v1(p_org,p_recipe,p_subject) then return null;end if;
 deadline:=least(r.expires_at,private.material_production_public_deadline_v1(p_org,r.id),(select usage_expires_at from public.house_playbook_versions where status='approved' and private.house_usage_allowed_v1(id) order by created_at desc limit 1));
 for pin in select * from private.material_production_source_pins where organization_id=p_org and recipe_id=p_recipe order by source_version_id loop
 select * into strict rights from private.source_rights_versions where organization_id=p_org and id=pin.rights_version_id;
 deadline:=least(deadline,rights.expires_at,rights.store_until);
 end loop;
 select * into s from private.material_production_seals where organization_id=p_org and recipe_id=p_recipe;
 if s.id is not null then
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on(x.organization_id,x.id)=(q.organization_id,q.allocation_id) where(q.organization_id,q.id)=(p_org,s.context_retained_payload_id);
 if a.id is null or a.purge_at<=clock_timestamp() or not private.capital_body_physical_receipt_v1(p_org,s.context_retained_payload_id) then return null;end if;
 deadline:=least(deadline,a.expires_at);
 end if;
 if deadline<=clock_timestamp() then return null;end if;
 return deadline;
end$$;
create function private.material_production_scope_v1(p_org uuid,p_allocation uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;b private.material_production_body_bases;q private.capital_public_retained_payloads;r private.material_production_recipes;deadline timestamptz;margin integer;
begin
 select * into strict a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='material_body';
 select * into strict b from private.material_production_body_bases where organization_id=p_org and id=a.material_body_basis_id;
 select * into strict r from private.material_production_recipes where organization_id=p_org and id=b.recipe_id;
 select * into q from private.capital_public_retained_payloads where organization_id=p_org and allocation_id=a.id;
 deadline:=private.material_production_deadline_v1(p_org,r.id,r.human_subject_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=a.policy_id;
 if deadline is null then raise exception 'material_production_retention_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-material-body-scope.v1','organizationId',p_org,'workId',b.work_id,'recipeId',b.recipe_id,'allocationId',a.id,'retainedPayloadId',q.id,'kind',b.kind,'payloadFingerprint',a.payload_fingerprint,'byteLength',a.byte_length,'bucket',a.bucket_id,'path',a.object_path,'storageObjectId',q.storage_object_id,'storageVersion',q.storage_version,'expiresAt',least(deadline,a.expires_at),'purgeAt',least(deadline-make_interval(secs=>margin),a.purge_at));
end$$;
create function private.material_production_allocate_v1(p_job uuid,p_capability text,p_recipe uuid,p_request uuid,p_kind text,p_body jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.material_production_job_v1(p_job,p_capability);r private.material_production_recipes;b private.material_production_body_bases;a private.capital_public_payload_allocations;p private.capital_public_retention_policies;deadline timestamptz;stamp timestamptz:=clock_timestamp();fp text;bytes bigint;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('material-production:'||j.organization_id::text||':'||p_recipe::text,0)) then raise exception 'material_production_retry' using errcode='40001';end if;
 select * into r from private.material_production_recipes where(organization_id,id,producer_job_id)=(j.organization_id,p_recipe,j.id);
 if r.id is null or r.worker_account_id is distinct from auth.uid() or r.human_subject_id is distinct from j.authorization_subject_id or p_request is null or p_kind not in('context','calculation_report','case_state','material_package') or jsonb_typeof(p_body) is distinct from 'object' then raise exception 'material_production_body_denied' using errcode='42501';end if;
 if p_kind<>'context' and exists(select 1 from private.material_production_terminals where(organization_id,recipe_id)=(j.organization_id,r.id)) then raise exception 'material_production_terminal_closed' using errcode='42501';end if;
 fp:=encode(extensions.digest(p_body::text,'sha256'),'hex');bytes:=octet_length(p_body::text);
 if bytes not between 1 and 1048576 then raise exception 'material_production_body_size_denied' using errcode='22023';end if;
 if p_kind='material_package' and(not exists(select 1 from private.material_production_body_bases state_basis join private.capital_public_payload_allocations state_a on(state_a.organization_id,state_a.material_body_basis_id)=(state_basis.organization_id,state_basis.id) join private.capital_public_retained_payloads state_q on(state_q.organization_id,state_q.allocation_id)=(state_a.organization_id,state_a.id) where(state_basis.organization_id,state_basis.recipe_id,state_basis.kind)=(j.organization_id,r.id,'case_state') and state_basis.material_ready and private.capital_body_physical_receipt_v1(j.organization_id,state_q.id)) or exists(select 1 from jsonb_array_elements(coalesce(p_body#>'{materialTruth,exceptions}','[]')) critical where critical->>'severity'='critical' and not exists(select 1 from private.material_production_body_bases state_basis where(state_basis.organization_id,state_basis.recipe_id,state_basis.kind)=(j.organization_id,r.id,'case_state') and critical->>'id'=any(state_basis.allowed_external_critical_ids)))) then raise exception 'material_production_package_not_ready' using errcode='42501';end if;
 if p_kind='material_package' and(p_body->>'schemaVersion' is distinct from '2026.08.29-v1' or jsonb_typeof(p_body->'materials') is distinct from 'array' or coalesce(jsonb_array_length(p_body->'materials'),0)=0 or coalesce(p_body#>>'{materialTruth,status}','') not in('complete','partial','blocked') or p_body#>>'{materialTruth,consistency,status}' is distinct from 'pass' or jsonb_typeof(p_body->'financialModel') is distinct from 'object' or jsonb_typeof(p_body->'dataRoom') is distinct from 'object' or exists(select 1 from public.deal_state_objects plan cross join lateral jsonb_array_elements_text(plan.payload->'artifacts') planned(kind) where(plan.organization_id,plan.id)=(j.organization_id,r.production_plan_id) and not exists(select 1 from jsonb_array_elements(p_body->'materials') material where material->>'kind'=case planned.kind when 'indicative_term_sheet' then 'term_sheet' else planned.kind end))) then raise exception 'material_production_package_not_ready' using errcode='42501';end if;
 if p_kind='calculation_report' and(p_body->>'schemaVersion' is distinct from '2026.08.29-v4' or coalesce(p_body->>'status','') not in('succeeded','blocked','failed') or p_body->>'caseId' is distinct from r.session_id::text or p_body->>'runId' is distinct from(select processing_run_id::text from public.processing_jobs where id=j.id) or p_body#>>'{versions,caseEngine}' is distinct from r.calculation_version or p_body#>>'{versions,materialCompiler}' is distinct from '2026.10.02-v10' or coalesce(jsonb_array_length(p_body->'stages'),0)<>11 or coalesce(jsonb_array_length(p_body->'taskRuns'),0)<>11 or coalesce(p_body->>'inputFingerprint','')!~'^[a-f0-9]{64}$' or coalesce(p_body->>'reportFingerprint','')!~'^[a-f0-9]{64}$') then raise exception 'material_production_report_invalid' using errcode='22023';end if;
 if p_kind='context' and fp is distinct from r.context_fingerprint then raise exception 'material_production_context_changed' using errcode='40001';end if;
 if p_kind<>'context' and(not exists(select 1 from private.material_production_seals where organization_id=j.organization_id and recipe_id=r.id) or not exists(select 1 from private.material_production_research_seals where organization_id=j.organization_id and recipe_id=r.id)) then raise exception 'material_production_inputs_not_sealed' using errcode='42501';end if;
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.material_production_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'material_production_retention_denied' using errcode='42501';end if;
 select x.* into a from private.material_production_body_bases v join private.capital_public_payload_allocations x on(x.organization_id,x.material_body_basis_id)=(v.organization_id,v.id) where(v.organization_id,v.recipe_id,v.kind)=(j.organization_id,r.id,p_kind);
 if a.id is not null then
 if a.payload_fingerprint<>fp or a.byte_length<>bytes or a.job_id<>j.id or a.request_id<>p_request then raise exception 'material_production_body_conflict' using errcode='23505';end if;
 else
 insert into private.material_production_body_bases(organization_id,work_id,recipe_id,kind,report_status,allowed_external_critical_ids,material_ready) values(j.organization_id,r.work_id,r.id,p_kind,case when p_kind='calculation_report' then p_body->>'status' else null end,case when p_kind='case_state' then private.material_allowed_external_critical_ids_v1(p_body) else null end,case when p_kind='case_state' then coalesce(jsonb_typeof(p_body->'materialsBlockedBy')='array' and jsonb_array_length(p_body->'materialsBlockedBy')=0 and jsonb_typeof(p_body->'materials')='array' and jsonb_array_length(p_body->'materials')>0 and coalesce(p_body#>>'{materialTruth,status}','') in('complete','partial','blocked') and p_body#>>'{materialTruth,consistency,status}'='pass' and not exists(select 1 from jsonb_array_elements(coalesce(p_body#>'{materialTruth,exceptions}','[]')) critical where critical->>'severity'='critical' and not(critical->>'id'=any(private.material_allowed_external_critical_ids_v1(p_body)))),false) else null end) returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,material_body_basis_id,content_kind)
 values(b.id,j.organization_id,p_request,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,bytes,j.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'material_body') returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at) values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 return jsonb_build_object('scope',private.material_production_scope_v1(j.organization_id,a.id),'canonicalBody',p_body::text);
end$$;
revoke all on function private.material_production_deadline_v1(uuid,uuid,uuid),private.material_production_scope_v1(uuid,uuid),private.material_production_allocate_v1(uuid,text,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

-- A separate case-analysis clock preserves its real job kind and authority.
create function private.material_production_clock_current_v1(p_job uuid,p_capability text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs;begin j:=private.material_production_job_v1(p_job,p_capability);return j.id is not null;exception when insufficient_privilege then return false;end$$;
create function private.material_production_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;b private.material_production_body_bases;d timestamptz;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='material_body';
 select * into b from private.material_production_body_bases where organization_id=p_org and id=a.material_body_basis_id;
 if b.id is null then return null;end if;
 d:=private.material_production_deadline_v1(p_org,b.recipe_id,p_subject);
 if d is null or not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=p_org and allocation_id=a.id and status='pending') or least(d,a.expires_at,a.purge_at)<=clock_timestamp() then return null;end if;
 return least(d,a.expires_at);
end$$;
-- Delegate every older allocation, including M07/S11, through its unchanged
-- current chain. Janitor sees current material rights and finite deadlines too.
alter function private.capital_capture_allocation_deadline_v2(uuid,uuid) rename to capital_capture_allocation_deadline_pre_material_v2;
create function private.capital_capture_allocation_deadline_v2(p_org uuid,p_allocation uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;human uuid;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 if a.content_kind is distinct from 'material_body' then return private.capital_capture_allocation_deadline_pre_material_v2(p_org,p_allocation);end if;
 select r.human_subject_id into human from private.material_production_body_bases b join private.material_production_recipes r on(r.organization_id,r.id)=(b.organization_id,b.recipe_id) where(b.organization_id,b.id)=(p_org,a.material_body_basis_id);
 return private.material_production_allocation_deadline_v1(p_org,p_allocation,human);
end$$;
create function private.worker_commit_material_production_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,
 p_storage_version text,p_verified_sha256 text,p_verified_size bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.material_production_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;basis private.material_production_body_bases;receipt private.capital_public_retained_payloads;
 object_row storage.objects;deadline timestamptz;margin integer;replayed boolean:=false;result_dto jsonb;
begin
 select * into allocation from private.capital_public_payload_allocations where organization_id=job.organization_id and job_id=job.id and id=p_allocation_id and content_kind='material_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 if p_storage_object_id is null or coalesce(length(p_storage_version),0) not between 1 and 1024 or p_verified_sha256 is distinct from allocation.payload_fingerprint or p_verified_size is distinct from allocation.byte_length then
 raise exception 'capital_body_proof_invalid' using errcode='22023';end if;
 deadline:=private.material_production_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
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
 if not private.material_production_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 insert into private.capital_public_retained_payloads(organization_id,allocation_id,storage_object_id,storage_version,verified_sha256,verified_size,verified_by)
 values(job.organization_id,allocation.id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size,auth.uid()) returning * into receipt;
 update private.capital_public_payload_purge_queue set next_check_at=least(allocation.purge_at,deadline-make_interval(secs=>margin)),
 effective_purge_at=least(effective_purge_at,allocation.purge_at,deadline-make_interval(secs=>margin)),updated_at=clock_timestamp()
 where organization_id=job.organization_id and allocation_id=allocation.id;
 end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 if not private.material_production_clock_current_v1(job.id,p_capability_token)
 then raise exception 'capital_capture_denied' using errcode='42501';end if;
 result_dto:=private.material_production_scope_v1(job.organization_id,allocation.id);
 if not private.material_production_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;


revoke all on function private.material_production_clock_current_v1(uuid,text),private.material_production_allocation_deadline_v1(uuid,uuid,uuid),private.worker_commit_material_production_body_v1(uuid,text,uuid,uuid,text,text,bigint),private.capital_capture_allocation_deadline_pre_material_v2(uuid,uuid) from public,anon,authenticated,service_role;

create function private.material_production_capture_dto_v1(p_org uuid,p_recipe uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.material_production_recipes;a private.capital_public_payload_allocations;
begin
 select * into strict r from private.material_production_recipes where organization_id=p_org and id=p_recipe;
 select x.* into a from private.material_production_body_bases b join private.capital_public_payload_allocations x on(x.organization_id,x.material_body_basis_id)=(b.organization_id,b.id) where(b.organization_id,b.recipe_id,b.kind)=(p_org,r.id,'context');
 if a.id is null then raise exception 'material_production_context_unprepared' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-material-capture.v1','state','ready','recipeId',r.id,'jobId',r.producer_job_id,'organizationId',r.organization_id,'workId',r.work_id,'productionPlanId',r.production_plan_id,'productionPlanVersion',r.production_plan_version,'productionPlanFingerprint',r.production_plan_fingerprint,'inputFingerprint',r.input_fingerprint,'contextFingerprint',r.context_fingerprint,'sourceClosureFingerprint',r.source_closure_fingerprint,'calculationVersion',r.calculation_version,'rendererVersion',r.renderer_version,'context',private.material_production_scope_v1(p_org,a.id));
end$$;
-- No caller can assert that the context exists. The real retained receipt and
-- allocation bind the server-derived input hash to this exact recipe/job.
create function private.worker_seal_material_production_context_v1(p_job uuid,p_capability text,p_recipe uuid,p_context_retained_payload uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.material_production_job_v1(p_job,p_capability);r private.material_production_recipes;s private.material_production_seals;q private.capital_public_retained_payloads;a private.capital_public_payload_allocations;b private.material_production_body_bases;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('material-production:'||j.organization_id::text||':'||p_recipe::text,0)) then raise exception 'material_production_retry' using errcode='40001';end if;
 select * into r from private.material_production_recipes where(organization_id,id,producer_job_id)=(j.organization_id,p_recipe,j.id);
 select * into q from private.capital_public_retained_payloads where(organization_id,id)=(j.organization_id,p_context_retained_payload);
 select * into a from private.capital_public_payload_allocations where(organization_id,id,job_id,content_kind)=(j.organization_id,q.allocation_id,j.id,'material_body');
 select * into b from private.material_production_body_bases where(organization_id,id,recipe_id,kind)=(j.organization_id,a.material_body_basis_id,r.id,'context');
 if r.id is null or b.id is null or a.payload_fingerprint is distinct from r.context_fingerprint or not private.capital_body_physical_receipt_v1(j.organization_id,q.id) or private.material_production_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'material_production_context_denied' using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(a.policy_id,j.organization_id,a.id);
 select * into s from private.material_production_seals where(organization_id,recipe_id)=(j.organization_id,r.id);
 if s.id is not null then
 if s.context_retained_payload_id is distinct from q.id then raise exception 'material_production_context_conflict' using errcode='23505';end if;
 else
 insert into private.material_production_seals(organization_id,recipe_id,context_retained_payload_id) values(j.organization_id,r.id,q.id);
 end if;
 if not private.material_production_clock_current_v1(j.id,p_capability) or private.material_production_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'material_production_context_denied' using errcode='42501';end if;
 return private.material_production_capture_dto_v1(j.organization_id,r.id);
end$$;
revoke all on function private.material_production_capture_dto_v1(uuid,uuid),private.worker_seal_material_production_context_v1(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
