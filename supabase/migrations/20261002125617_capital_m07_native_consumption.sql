-- Prospective M07 native consumption. No experimental contribution/1000 grant
-- is widened. Raw context, parsed response and final product live only in
-- finite-lived private Storage allocations; permanent rows contain identity.
set search_path='';

create table private.capital_m07_recipes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,plan_id uuid not null,brief_id uuid not null,session_id uuid not null,
 revision_decision_id uuid,original_attempt integer not null check(original_attempt>0),
 human_subject_id uuid not null references auth.users(id),worker_account_id uuid not null references auth.users(id),
 plan_fingerprint text not null check(plan_fingerprint~'^[a-f0-9]{64}$'),
 context_fingerprint text not null check(context_fingerprint~'^[a-f0-9]{64}$'),
 base_authority_fingerprint text not null check(base_authority_fingerprint~'^[a-f0-9]{64}$'),
 as_of_date date not null,locale text not null check(locale in ('pt-BR','en-US')),
 renderer_version text not null check(renderer_version='capital-public-task-renderer.m07.v1'),
 captured_at timestamptz not null,expires_at timestamptz not null check(isfinite(expires_at)),
 retention_policy_id uuid not null references private.capital_public_retention_policies(id),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,job_id),unique nulls not distinct(organization_id,work_id,plan_id,brief_id,revision_decision_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,plan_id) references public.capital_project_plans(organization_id,id),
 foreign key(organization_id,brief_id) references public.capital_project_briefs(organization_id,id),
 foreign key(organization_id,session_id) references public.document_intake_sessions(organization_id,id),
 foreign key(organization_id,revision_decision_id) references public.capital_project_artifact_decisions(organization_id,id)
);
create index capital_m07_recipe_work_idx on private.capital_m07_recipes(organization_id,work_id);
create index capital_m07_recipe_plan_idx on private.capital_m07_recipes(organization_id,plan_id);
create index capital_m07_recipe_brief_idx on private.capital_m07_recipes(organization_id,brief_id);
create index capital_m07_recipe_session_idx on private.capital_m07_recipes(organization_id,session_id);
create index capital_m07_recipe_decision_idx on private.capital_m07_recipes(organization_id,revision_decision_id);
create index capital_m07_recipe_subject_idx on private.capital_m07_recipes(human_subject_id);
create index capital_m07_recipe_worker_idx on private.capital_m07_recipes(worker_account_id);
create index capital_m07_recipe_policy_idx on private.capital_m07_recipes(retention_policy_id);

create table private.capital_m07_body_bases (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,recipe_id uuid not null,kind text not null check(kind in ('context','parsed','final')),
 semantic_fingerprint text check(semantic_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_m07_recipes(organization_id,work_id,id)
);
create index capital_m07_basis_recipe_idx on private.capital_m07_body_bases(organization_id,work_id,recipe_id);

alter table private.capital_public_payload_allocations add column m07_body_basis_id uuid,
 add constraint capital_m07_allocation_basis_fk foreign key(organization_id,m07_body_basis_id)
 references private.capital_m07_body_bases(organization_id,id);
alter table private.capital_public_payload_allocations drop constraint capital_public_payload_allocations_content_kind_check;
alter table private.capital_public_payload_allocations add constraint capital_public_payload_allocations_content_kind_check
 check(content_kind in ('public_source','typed_body','m07_body'));
alter table private.capital_public_payload_allocations drop constraint capital_allocations_kind_invariant;
alter table private.capital_public_payload_allocations add constraint capital_allocations_kind_invariant check(
 (content_kind='public_source' and body_basis_id is null and m07_body_basis_id is null and num_nonnulls(delivery_id,license_id,licensing_organization_id)=3)
 or(content_kind='typed_body' and body_basis_id is not null and m07_body_basis_id is null and num_nonnulls(delivery_id,license_id,licensing_organization_id)=0)
 or(content_kind='m07_body' and body_basis_id is null and m07_body_basis_id is not null and num_nonnulls(delivery_id,license_id,licensing_organization_id)=0));
create index capital_m07_allocation_basis_idx on private.capital_public_payload_allocations(organization_id,m07_body_basis_id);
create unique index capital_m07_allocation_request_idx on private.capital_public_payload_allocations(organization_id,job_id,request_id) where content_kind='m07_body';

create table private.capital_m07_recipe_components (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,recipe_id uuid not null,component_no integer not null check(component_no between 1 and 1000),
 slot text not null check(slot in ('company','brief','institution','research','source','revision','quality_retry','dependency')),
 reference_id uuid not null,version integer not null check(version>0),
 body_fingerprint text not null check(body_fingerprint~'^[a-f0-9]{64}$'),
 retained_payload_id uuid,license_id uuid,dependency_artifact_id uuid,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id,component_no),unique(organization_id,recipe_id,slot,reference_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_m07_recipes(organization_id,work_id,id),
 foreign key(organization_id,retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,license_id) references private.capital_public_delivery_licenses(organization_id,id),
 foreign key(organization_id,dependency_artifact_id) references public.capital_project_artifacts(organization_id,id),
 check((slot='source' and num_nonnulls(retained_payload_id,license_id)=2 and dependency_artifact_id is null)
 or(slot='dependency' and dependency_artifact_id is not null and license_id is null)
 or(slot not in ('source','dependency') and num_nonnulls(license_id,dependency_artifact_id)=0))
);
create index capital_m07_components_recipe_idx on private.capital_m07_recipe_components(organization_id,work_id,recipe_id);
create index capital_m07_components_retained_idx on private.capital_m07_recipe_components(organization_id,retained_payload_id);
create index capital_m07_components_license_idx on private.capital_m07_recipe_components(organization_id,license_id);
create index capital_m07_components_dependency_idx on private.capital_m07_recipe_components(organization_id,dependency_artifact_id);

create table private.capital_m07_recipe_seals (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,recipe_id uuid not null,task_run_id uuid not null,context_retained_payload_id uuid not null,
 recipe_fingerprint text not null check(recipe_fingerprint~'^[a-f0-9]{64}$'),
 reconstruction_fingerprint text not null check(reconstruction_fingerprint~'^[a-f0-9]{64}$'),
 prompt_fingerprint text not null check(prompt_fingerprint~'^[a-f0-9]{64}$'),
 primary_request_fingerprint text not null check(primary_request_fingerprint~'^[a-f0-9]{64}$'),
 fallback_request_fingerprint text not null check(fallback_request_fingerprint~'^[a-f0-9]{64}$'),
 research_status text not null check(research_status in ('succeeded','partial','abstained')),
 budget_version text not null check(budget_version='capital-m07-operational-budget.v1'),
 research_reservation_version text not null check(research_reservation_version='public-research-reservation.m07.v1'),
 research_reservation_micro_usd bigint not null check(research_reservation_micro_usd in (0,300000)),
 effective_budget_micro_usd bigint not null check(effective_budget_micro_usd between 1 and 3000000),
 effective_max_dispatches integer not null check(effective_max_dispatches between 1 and 2),
 sealed_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_m07_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,context_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index capital_m07_seal_recipe_idx on private.capital_m07_recipe_seals(organization_id,work_id,recipe_id);
create index capital_m07_seal_retained_idx on private.capital_m07_recipe_seals(organization_id,context_retained_payload_id);


-- Compare only consumed mutable authority, not completed_artifacts or task
-- progress produced by this execution. This proof also works after the old
-- worker lease expires, so human/recovery reads retain the same current barrier.
create function private.capital_m07_base_authority_fingerprint_v1(p_org uuid,p_job uuid,p_session uuid,p_brief uuid,p_plan uuid,p_subject uuid,p_captured_at timestamptz)
returns text language sql volatile security definer set search_path='' as $$
 select encode(extensions.digest(jsonb_build_object(
 'session',(select jsonb_build_object('company',s.company_profile,'locale',s.locale,'privacy',s.privacy_status,'representation',s.representation_status) from public.document_intake_sessions s where s.organization_id=p_org and s.id=p_session),
 'brief',(select jsonb_build_object('id',b.id,'version',b.brief_version,'fingerprint',b.content_fingerprint,'status',b.status) from public.capital_project_briefs b where b.organization_id=p_org and b.id=p_brief),
 'plan',(select jsonb_build_object('id',p.id,'fingerprint',p.plan_fingerprint,'status',p.status) from public.capital_project_plans p where p.organization_id=p_org and p.id=p_plan),
 'professional',(select coalesce(jsonb_agg(to_jsonb(c) order by c.user_id),'[]') from public.professional_context_profiles c where c.organization_id=p_org and c.user_id in(p_subject,(select pr.created_by from public.processing_jobs j join public.processing_runs pr on pr.organization_id=j.organization_id and pr.id=j.processing_run_id where j.organization_id=p_org and j.id=p_job))),
 'institution',(select to_jsonb(c) from public.institution_capability_profiles c where c.organization_id=p_org),
 'methodology',(select jsonb_build_object('id',m.id,'version',m.version_number,'fingerprint',encode(extensions.digest(m.content::text,'sha256'),'hex')) from public.organization_methodologies m where m.organization_id=p_org and m.status='active'),
 'revision',(select jsonb_build_object('correction',j.payload->'revision_correction_note','artifact',j.payload->'revision_of_artifact_id','priorFingerprint',(select x.artifact_fingerprint from public.capital_project_artifacts x where x.organization_id=p_org and x.id::text=j.payload->>'revision_of_artifact_id')) from public.processing_jobs j where j.organization_id=p_org and j.id=p_job),
 'feedback',(select coalesce(jsonb_agg(to_jsonb(f) order by f.task_id),'[]') from(select distinct on(t.task_id) t.task_id,tr.id,tr.attempt_no,tr.quality_results,tr.error from public.capital_project_task_runs tr join public.capital_project_plan_tasks t on t.organization_id=tr.organization_id and t.id=tr.plan_task_id join public.processing_jobs j on j.organization_id=tr.organization_id and j.id=p_job where tr.organization_id=p_org and tr.capital_project_id=(j.payload->>'capital_project_id')::uuid and tr.processing_job_id in(p_job,coalesce(nullif(j.payload#>>'{trigger_event,priorJobId}','')::uuid,p_job)) and tr.status='failed' and jsonb_array_length(tr.quality_results)>0 and tr.completed_at<=p_captured_at order by t.task_id,tr.completed_at desc nulls last,tr.id desc) f)
 )::text,'sha256'),'hex');
$$;

-- Source bridges retain the consumer's license identity; publisher UUIDs are
-- NEVER inserted in artifact_dependency_links with consumer tenancy.
create function private.capital_m07_recipe_deadline_v1(p_org uuid,p_recipe uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_m07_recipes;c private.capital_m07_recipe_components;
 a private.capital_public_payload_allocations;bound timestamptz;deadline timestamptz;s private.capital_m07_recipe_seals;
begin
 select * into r from private.capital_m07_recipes where organization_id=p_org and id=p_recipe;
 if r.id is null or p_subject is null or not private.capital_body_subject_allowed_v1(p_org,r.work_id,p_subject)
 or not private.capital_body_subject_allowed_v1(p_org,r.work_id,r.human_subject_id) then return null;end if;
 if r.base_authority_fingerprint is distinct from private.capital_m07_base_authority_fingerprint_v1(p_org,r.job_id,r.session_id,r.brief_id,r.plan_id,r.human_subject_id,r.captured_at) then return null;end if;
 deadline:=r.expires_at;
 select * into s from private.capital_m07_recipe_seals where organization_id=p_org and recipe_id=r.id;
 if s.id is not null then
 select x.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations x on x.organization_id=p.organization_id and x.id=p.allocation_id where p.organization_id=p_org and p.id=s.context_retained_payload_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,s.context_retained_payload_id) or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 deadline:=least(deadline,a.expires_at,a.purge_at);
 end if;
 for c in select * from private.capital_m07_recipe_components where organization_id=p_org and recipe_id=r.id order by component_no loop
 if c.slot='source' then
 select x.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations x on x.organization_id=p.organization_id and x.id=p.allocation_id
 where p.organization_id=p_org and p.id=c.retained_payload_id and x.content_kind='public_source' and x.license_id=c.license_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,c.retained_payload_id) then return null;end if;
 bound:=private.capital_public_retention_deadline_v1(c.license_id,p_org,a.retained_at,a.policy_id);
 if bound is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 deadline:=least(deadline,bound,a.expires_at,a.purge_at);
 elsif c.slot='dependency' then
 if not exists(select 1 from public.capital_project_artifacts x where x.organization_id=p_org and x.capital_project_id=r.work_id and x.id=c.dependency_artifact_id and x.artifact_version=c.version and x.status not in ('stale','superseded')) then return null;end if;
 end if;
 end loop;
 return case when deadline>clock_timestamp() then deadline end;
end; $$;

create function private.worker_prepare_capital_m07_recipe_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 c jsonb;r private.capital_m07_recipes;p private.capital_public_retention_policies;stamp timestamptz:=clock_timestamp();fp text;
begin
 if j.payload?'revision_of_artifact_id' and not exists(select 1 from public.capital_project_artifact_decisions d where d.organization_id=j.organization_id and d.id::text=j.payload->>'correction_decision_id' and d.artifact_id::text=j.payload->>'revision_of_artifact_id' and d.capital_project_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid) and d.decision='request_changes' and d.decided_by=j.authorization_subject_id) then raise exception 'capital_m07_correction_denied' using errcode='42501';end if;
 if j.payload->>'analysis_scope' is distinct from 'origination_thesis' or not(j.payload->'capital_task_ids'?'M07') then raise exception 'capital_m07_recipe_denied' using errcode='42501';end if;
 c:=private.worker_load_capital_project_context_v6(j.id,p_capability_token);
 fp:=encode(extensions.digest(c::text,'sha256'),'hex');
 select x.* into p from private.capital_public_retention_policies x join private.capital_public_retention_controls ctl on ctl.policy_id=x.id where ctl.singleton and ctl.enabled;
 if p.id is null or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_m07_retention_denied' using errcode='42501';end if;
 select * into r from private.capital_m07_recipes where organization_id=j.organization_id and job_id=j.id;
 if r.id is not null then
 if r.context_fingerprint<>fp or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id then raise exception 'capital_m07_recipe_changed' using errcode='40001';end if;
 else
 if exists(select 1 from private.capital_m07_recipes existing where existing.organization_id=j.organization_id and existing.work_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid) and existing.plan_id=(j.payload->>'capital_project_plan_id')::uuid and existing.brief_id=(j.payload->>'capital_project_brief_id')::uuid and existing.revision_decision_id is not distinct from (j.payload->>'correction_decision_id')::uuid) then raise exception 'capital_m07_recovery_required' using errcode='42501';end if;
 insert into private.capital_m07_recipes(organization_id,work_id,job_id,plan_id,brief_id,session_id,human_subject_id,worker_account_id,revision_decision_id,original_attempt,
 plan_fingerprint,context_fingerprint,base_authority_fingerprint,as_of_date,locale,renderer_version,captured_at,expires_at,retention_policy_id)
 values(j.organization_id,(j.payload->>'capital_project_id')::uuid,j.id,(j.payload->>'capital_project_plan_id')::uuid,(j.payload->>'capital_project_brief_id')::uuid,j.intake_session_id,
 j.authorization_subject_id,auth.uid(),(j.payload->>'correction_decision_id')::uuid,j.attempts,c#>>'{plan,fingerprint}',fp,private.capital_m07_base_authority_fingerprint_v1(j.organization_id,j.id,j.intake_session_id,(j.payload->>'capital_project_brief_id')::uuid,(j.payload->>'capital_project_plan_id')::uuid,j.authorization_subject_id,stamp),(stamp at time zone 'UTC')::date,c#>>'{session,locale}',
 'capital-public-task-renderer.m07.v1',stamp,stamp+make_interval(secs=>p.maximum_retention_seconds),p.id) returning * into r;
 end if;
 if private.capital_m07_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_m07_recipe_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-m07-base-context.v1','recipeId',r.id,'jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,
 'planId',r.plan_id,'planFingerprint',r.plan_fingerprint,'asOfDate',r.as_of_date,'locale',r.locale,'contextFingerprint',r.context_fingerprint,
 'canonicalContext',c::text,'expiresAt',r.expires_at);
end; $$;

-- Table/API grants are closed until every concrete command below is installed.
do $$ declare t text;cmd text;begin
 foreach t in array array['capital_m07_recipes','capital_m07_body_bases','capital_m07_recipe_components','capital_m07_recipe_seals'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 foreach cmd in array array['select','insert','update','delete'] loop
 execute format('create policy %I on private.%I as restrictive for %s to anon,authenticated %s',t||'_deny_'||cmd,t,cmd,
 case when cmd='insert' then 'with check(false)' when cmd='update' then 'using(false) with check(false)' else 'using(false)' end);
 end loop;
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end; $$;
revoke all on function private.capital_m07_recipe_deadline_v1(uuid,uuid,uuid),private.worker_prepare_capital_m07_recipe_v1(uuid,text) from public,anon,authenticated,service_role;

-- M07 retention is a separate origin family. Its DTO preserves the physical
-- protocol, but resolves its own server basis rather than inventing a contribution.
create function private.capital_m07_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;b private.capital_m07_body_bases;d timestamptz;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='m07_body';
 select * into b from private.capital_m07_body_bases where organization_id=p_org and id=a.m07_body_basis_id;
 if b.id is null then return null;end if;
 d:=private.capital_m07_recipe_deadline_v1(p_org,b.recipe_id,p_subject);
 if d is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 return case when least(d,a.expires_at,a.purge_at)>clock_timestamp() then least(d,a.expires_at) end;
end; $$;

alter function private.capital_capture_allocation_deadline_v2(uuid,uuid) rename to capital_capture_allocation_deadline_pre_m07_v2;
create function private.capital_capture_allocation_deadline_v2(p_org uuid,p_allocation uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;subject uuid;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 if a.content_kind is distinct from 'm07_body' then return private.capital_capture_allocation_deadline_pre_m07_v2(p_org,p_allocation);end if;
 select human_subject_id into subject from private.capital_m07_body_bases b join private.capital_m07_recipes r on r.organization_id=b.organization_id and r.id=b.recipe_id where b.organization_id=p_org and b.id=a.m07_body_basis_id;
 return private.capital_m07_allocation_deadline_v1(p_org,p_allocation,subject);
end; $$;

create function private.capital_m07_body_dto_v1(p_org uuid,p_allocation uuid,p_deadline timestamptz,p_replayed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;receipt private.capital_public_retained_payloads;margin integer;
begin
 select * into strict allocation from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 select * into receipt from private.capital_public_retained_payloads where organization_id=p_org and allocation_id=allocation.id;
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 return jsonb_build_object('schemaVersion','capital-retained-body.v1','retentionState',case when receipt.id is null then 'allocated' else 'retained' end,
 'allocationId',allocation.id,'retainedPayloadId',receipt.id,'bodyBasisId',allocation.m07_body_basis_id,'bucket',allocation.bucket_id,'path',allocation.object_path,
 'payloadFingerprint',allocation.payload_fingerprint,'byteLength',allocation.byte_length,'storageObjectId',receipt.storage_object_id,'storageVersion',receipt.storage_version,
 'retainedAt',allocation.retained_at,'uploadExpiresAt',allocation.upload_expires_at,'expiresAt',least(allocation.expires_at,p_deadline),
 'purgeAt',least(allocation.purge_at,p_deadline-make_interval(secs=>margin)),'replayed',p_replayed);
end; $$;

create function private.worker_commit_capital_m07_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,
 p_storage_version text,p_verified_sha256 text,p_verified_size bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;basis private.capital_m07_body_bases;receipt private.capital_public_retained_payloads;
 object_row storage.objects;deadline timestamptz;margin integer;replayed boolean:=false;result_dto jsonb;
begin
 select * into allocation from private.capital_public_payload_allocations where organization_id=job.organization_id and job_id=job.id and id=p_allocation_id and content_kind='m07_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 if p_storage_object_id is null or coalesce(length(p_storage_version),0) not between 1 and 1024 or p_verified_sha256 is distinct from allocation.payload_fingerprint or p_verified_size is distinct from allocation.byte_length then
 raise exception 'capital_body_proof_invalid' using errcode='22023';end if;
 deadline:=private.capital_m07_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
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
 result_dto:=private.capital_m07_body_dto_v1(job.organization_id,allocation.id,deadline,replayed);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

create function private.worker_read_capital_m07_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;receipt private.capital_public_retained_payloads;
 physical_object storage.objects;deadline timestamptz;checked_deadline timestamptz;margin integer;result_dto jsonb;
begin
 if p_allocation_id is null then raise exception 'capital_body_read_invalid' using errcode='22023';end if;
 select a.* into allocation from private.capital_public_payload_allocations a
 where a.organization_id=job.organization_id and a.job_id=job.id and a.id=p_allocation_id and a.content_kind='m07_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id)
 or not private.capital_public_capture_bucket_safe_v1() then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 deadline:=private.capital_m07_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
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
 result_dto:=private.capital_m07_body_dto_v1(job.organization_id,allocation.id,deadline,true)
 ||jsonb_build_object('storageObjectId',physical_object.id,'storageVersion',physical_object.version);
 -- No caller-supplied path/version/hash or storage header authorizes this scope.
 -- Re-run current rights and clock after constructing it, so an elapsed lease
 -- cannot escape through a slow closure/metadata lookup before either server gate.
 checked_deadline:=private.capital_m07_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
 if checked_deadline is null then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 if checked_deadline is distinct from deadline then raise exception 'capital_capture_retry' using errcode='40001';end if;
 perform private.require_capital_body_retention_ready_v1(allocation.policy_id,job.organization_id,allocation.id);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token)
 or least(allocation.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp()
 or (receipt.id is null and allocation.upload_expires_at<=clock_timestamp()) then
 raise exception 'capital_body_read_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

create or replace function private.capital_body_storage_job_authority_v1(p_allocation uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;headers jsonb;capability text;
begin
 if auth.uid() is null or p_allocation is null then return false;end if;
 begin
 headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 exception when invalid_text_representation then return false;end;
 if jsonb_typeof(headers) is distinct from 'object'
 or jsonb_typeof(headers->'x-offroad-job-id') is distinct from 'string'
 or jsonb_typeof(headers->'x-offroad-capability') is distinct from 'string' then return false;end if;
 select * into allocation from private.capital_public_payload_allocations a where a.id=p_allocation and a.content_kind in ('typed_body','public_source','m07_body');
 if not found or headers->>'x-offroad-job-id' is distinct from allocation.job_id::text
 or (headers?'x-offroad-workspace' and headers->>'x-offroad-workspace' is distinct from allocation.organization_id::text) then return false;end if;
 capability:=headers->>'x-offroad-capability';
 if length(capability) not between 1 and 4096 or extensions.digest(capability,'sha256') is distinct from allocation.capability_sha256 then return false;end if;
 return private.capital_public_allocation_job_current_v1(allocation.id)
 and private.capital_public_capture_clock_current_v1(allocation.job_id,capability);
end; $$;

create function private.capital_m07_storage_allowed_v1(p_allocation uuid,p_mode text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;human uuid;deadline timestamptz;margin integer;
begin
 if auth.uid() is null or p_mode is distinct from 'upload' or not private.capital_body_storage_job_authority_v1(p_allocation) or not private.capital_public_capture_bucket_safe_v1() then return false;end if;
 select * into allocation from private.capital_public_payload_allocations where id=p_allocation and content_kind='m07_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id) then return false;end if;
 if exists(select 1 from storage.objects o where o.bucket_id=allocation.bucket_id and o.name=allocation.object_path
 and ((to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false;end if;
 if p_mode='upload' and (allocation.upload_expires_at<=clock_timestamp()
 or exists(select 1 from private.capital_public_retained_payloads where organization_id=allocation.organization_id and allocation_id=allocation.id)) then return false;end if;
 select authorization_subject_id into human from public.processing_jobs where organization_id=allocation.organization_id and id=allocation.job_id;
 if not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=allocation.organization_id and allocation_id=allocation.id and status='pending') then return false;end if;
 deadline:=private.capital_m07_allocation_deadline_v1(allocation.organization_id,allocation.id,human);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 return deadline is not null and least(allocation.purge_at,deadline-make_interval(secs=>margin))>clock_timestamp()
 and private.capital_body_retention_healthy_v1(allocation.policy_id,allocation.organization_id,allocation.id)
 and private.capital_body_storage_job_authority_v1(allocation.id);
end; $$;

create or replace function private.worker_can_access_capital_public_payload_v1(p_bucket text,p_path text,p_mode text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations; deadline timestamptz; margin integer;
begin
 if p_mode='read' then return false;end if;
 if auth.uid() is null or p_bucket<>'capital-input-capture' or not private.capital_public_capture_bucket_safe_v1() then return false; end if;
 select * into a from private.capital_public_payload_allocations where bucket_id=p_bucket and object_path=p_path;
 if not found then return false; end if;
 if exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path
  and ((to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false; end if;
 if p_mode in ('purge','purge_select') then
  if p_mode='purge_select' and not storage.allow_any_operation(array['object.delete','object.delete_many','object.get_authenticated_info','object.head_authenticated_info']) then return false; end if;
  return exists(select 1 from private.capital_public_payload_purge_queue q join private.worker_tokens w on w.id=q.worker_token_id
   join auth.users u on u.id=q.leased_account_id where q.organization_id=a.organization_id and q.allocation_id=a.id and q.status='leased'
   and q.leased_account_id=auth.uid() and q.lease_expires_at>clock_timestamp() and w.status='active' and w.revoked_at is null
   and w.execution_account_user_id=auth.uid() and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()));
 end if;
 if a.content_kind='m07_body' then return private.capital_m07_storage_allowed_v1(a.id,p_mode);end if;
 if a.content_kind='typed_body' and p_mode in ('read','upload') then
  return private.capital_body_storage_allowed_v1(a.id,p_mode);
 end if;
 if p_mode='upload' and not private.capital_body_storage_job_authority_v1(a.id) then return false;end if;
 if p_mode not in ('read','upload') or not private.capital_public_allocation_job_current_v1(a.id)
  or not private.capital_public_retention_healthy_v1(a.worker_token_id,a.policy_id) then return false; end if;
 if p_mode='upload' and (a.upload_expires_at<=clock_timestamp() or exists(select 1 from private.capital_public_retained_payloads where organization_id=a.organization_id and allocation_id=a.id)) then return false; end if;
 if p_mode='read' and not storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info']) then return false; end if;
 if not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=a.organization_id and allocation_id=a.id and status='pending') then return false; end if;
 deadline:=private.capital_public_retention_deadline_v1(a.license_id,a.organization_id,a.retained_at,a.policy_id);
 select purge_margin_seconds into margin from private.capital_public_retention_policies where id=a.policy_id;
 if deadline is null or least(a.purge_at,deadline-make_interval(secs=>margin))<=clock_timestamp() then return false; end if;
 return true;
end; $$;

-- The base is captured before research. Only SQL supplies its actual body; a
-- caller cannot smuggle a fresh context underneath a prior captured identity.
create function private.worker_prepare_capital_m07_context_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 r private.capital_m07_recipes;a private.capital_public_payload_allocations;b private.capital_m07_body_bases;
 c jsonb;p private.capital_public_retention_policies;fp text;bytes bigint;deadline timestamptz;stamp timestamptz:=clock_timestamp();
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-m07-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_m07_retry' using errcode='40001';end if;
 select * into r from private.capital_m07_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id or p_request_id is null then raise exception 'capital_m07_denied' using errcode='42501';end if;
 c:=private.worker_load_capital_project_context_v6(j.id,p_capability_token);
 fp:=encode(extensions.digest(c::text,'sha256'),'hex');bytes:=octet_length(c::text);
 if fp<>r.context_fingerprint or bytes not between 1 and 1048576 then raise exception 'capital_m07_context_changed' using errcode='40001';end if;
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_m07_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_m07_retention_denied' using errcode='42501';end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and job_id=j.id and request_id=p_request_id and content_kind='m07_body';
 if a.id is not null then
 select * into b from private.capital_m07_body_bases where organization_id=j.organization_id and id=a.m07_body_basis_id;
 if b.recipe_id<>r.id or b.kind<>'context' or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_m07_context_conflict' using errcode='23505';end if;
 if private.capital_m07_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_m07_retention_denied' using errcode='42501';end if;
 else
 insert into private.capital_m07_body_bases(organization_id,work_id,recipe_id,kind) values(j.organization_id,r.work_id,r.id,'context') returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,
 payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,m07_body_basis_id,content_kind)
 values(b.id,j.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,bytes,j.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'m07_body') returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at) values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_m07_denied' using errcode='42501';end if;
 return private.capital_m07_body_dto_v1(j.organization_id,a.id,deadline,true)||jsonb_build_object('canonicalBody',c::text);
end; $$;

create function private.capital_m07_recipe_dto_v1(p_org uuid,p_recipe uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.capital_m07_recipes;s private.capital_m07_recipe_seals;components jsonb;
begin
 select * into strict r from private.capital_m07_recipes where organization_id=p_org and id=p_recipe;
 select * into strict s from private.capital_m07_recipe_seals where organization_id=p_org and recipe_id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('slot',slot,'id',reference_id,'version',version,'bodyFingerprint',body_fingerprint) order by component_no),'[]') into components from private.capital_m07_recipe_components where organization_id=p_org and recipe_id=r.id;
 return jsonb_build_object('schemaVersion','capital-m07-recipe-receipt.v1','state','ready','recipeId',r.id,'taskRunId',s.task_run_id,
 'jobId',r.job_id,'organizationId',p_org,'workId',r.work_id,'planId',r.plan_id,'planFingerprint',r.plan_fingerprint,'locale',r.locale,'asOfDate',r.as_of_date,
 'rendererVersion',r.renderer_version,'recipeFingerprint',s.recipe_fingerprint,'reconstructionFingerprint',s.reconstruction_fingerprint,
 'contextRetainedPayloadId',s.context_retained_payload_id,'operationalBudget',jsonb_build_object('schemaVersion',s.budget_version,'researchReservationVersion',s.research_reservation_version,'researchReservationMicroUsd',s.research_reservation_micro_usd,'maxExposureMicroUsd',s.effective_budget_micro_usd,'maxDispatches',s.effective_max_dispatches),'components',components,'expiresAt',r.expires_at);
end; $$;

-- Component hashes here are observed JS reconstruction identities. Physical
-- hashes are separate server-derived allocation hashes and storage proofs.
create function private.worker_finalize_capital_m07_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,
 p_context_retained_payload_id uuid,p_components jsonb,p_reconstruction_fingerprint text,
 p_prompt_fingerprint text,p_primary_request_fingerprint text,p_fallback_request_fingerprint text,
 p_operator_budget_micro_usd bigint,p_operator_max_dispatches integer,p_research_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 r private.capital_m07_recipes;s private.capital_m07_recipe_seals;a private.capital_public_payload_allocations;b private.capital_m07_body_bases;
 component jsonb;ordinal integer:=0;dep public.capital_project_artifacts;lic private.capital_public_delivery_licenses;deadline timestamptz;
 run uuid;fp text;expected uuid;expected_version integer;effective_budget bigint;effective_dispatches integer;research_reserve bigint;job_cost numeric;job_calls numeric;research_sources_wire text;research_fp text;
begin
 if p_research_status is null or p_research_status not in ('succeeded','partial','abstained') then raise exception 'capital_m07_research_status_invalid' using errcode='22023';end if;
 if p_operator_budget_micro_usd is null or p_operator_budget_micro_usd not between 1 and 3000000 or p_operator_max_dispatches is null or p_operator_max_dispatches not between 1 and 2
 or jsonb_typeof(j.payload#>'{model_budget,max_cost_usd}') is distinct from 'number' or jsonb_typeof(j.payload#>'{model_budget,max_calls}') is distinct from 'number' then raise exception 'capital_m07_budget_invalid' using errcode='22023';end if;
 job_cost:=(j.payload#>>'{model_budget,max_cost_usd}')::numeric;job_calls:=(j.payload#>>'{model_budget,max_calls}')::numeric;
 if job_cost<=0 or job_calls<1 or job_calls<>trunc(job_calls) then raise exception 'capital_m07_budget_denied' using errcode='42501';end if;
 -- Fixed server reservation: 12*(USD0.005 Perplexity + USD0.020 OpenAI search).
 -- Revisions perform no new search. Keep the conservative initial reservation
 -- for frozen/official research until a durable research-cost ledger exists.
 research_reserve:=case when j.payload?'revision_of_artifact_id' then 0 else 300000 end;
 effective_budget:=least(3000000,1550000,floor(job_cost*1000000)::bigint)-research_reserve;
 effective_budget:=least(effective_budget,p_operator_budget_micro_usd);
 effective_dispatches:=least(2,job_calls::integer,p_operator_max_dispatches);
 if effective_budget<1 or effective_dispatches<1 then raise exception 'capital_m07_budget_denied' using errcode='42501';end if;
 if exists(select 1 from unnest(array[p_reconstruction_fingerprint,p_prompt_fingerprint,p_primary_request_fingerprint,p_fallback_request_fingerprint]) pin where pin is null or pin!~'^[a-f0-9]{64}$') or jsonb_typeof(p_components) is distinct from 'array' or jsonb_array_length(p_components) not between 7 and 1000 or octet_length(p_components::text)>262144 then raise exception 'capital_m07_recipe_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-m07-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_m07_retry' using errcode='40001';end if;
 select * into r from private.capital_m07_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id or exists(select 1 from private.capital_body_invocation_inputs i where i.organization_id=j.organization_id and i.job_id=j.id) then raise exception 'capital_m07_denied' using errcode='42501';end if;
 select z.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations z on z.organization_id=p.organization_id and z.id=p.allocation_id where p.organization_id=j.organization_id and p.id=p_context_retained_payload_id and z.job_id=j.id and z.content_kind='m07_body';
 select * into b from private.capital_m07_body_bases where organization_id=j.organization_id and id=a.m07_body_basis_id;
 if b.recipe_id is distinct from r.id or b.kind is distinct from 'context' or a.payload_fingerprint<>r.context_fingerprint or not private.capital_body_physical_receipt_v1(j.organization_id,p_context_retained_payload_id) then raise exception 'capital_m07_context_denied' using errcode='42501';end if;
 -- Snapshot rows are immutable. Every required private slot must be present once;
 -- supplied IDs can only identify actual objects in this recipe's native context.
 if exists(select 1 from unnest(array['company','brief','institution','research','revision','quality_retry']) k where(select count(*) from jsonb_array_elements(p_components) x where x->>'slot'=k)<>1)
 or not exists(select 1 from jsonb_array_elements(p_components) x where x->>'slot'='dependency') then raise exception 'capital_m07_recipe_invalid' using errcode='22023';end if;
 if not exists(select 1 from jsonb_array_elements(p_components) x where x->>'slot'='source') then raise exception 'capital_m07_published_source_required' using errcode='42501';end if;
 -- This closed two-field ASCII/UUID object uses the exact historical JS
 -- stable wire. It is deliberately not generic SQL jsonb::text canonicalization.
 select '['||coalesce(string_agg((x.value->'id')::text,',' order by x.ordinality),'')||']' into research_sources_wire from jsonb_array_elements(p_components) with ordinality x(value,ordinality) where x.value->>'slot'='source';
 research_fp:=encode(extensions.digest('{"sourceIds":'||research_sources_wire||',"status":'||to_jsonb(p_research_status)::text||'}','sha256'),'hex');
 if not exists(select 1 from jsonb_array_elements(p_components) x where x->>'slot'='research' and x->>'bodyFingerprint'=research_fp) then raise exception 'capital_m07_research_pin_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(jsonb_build_object('recipe',r.id,'context',r.context_fingerprint,'components',p_components,'reconstruction',p_reconstruction_fingerprint,'renderer',r.renderer_version,'prompt',p_prompt_fingerprint,'primaryRequest',p_primary_request_fingerprint,'fallbackRequest',p_fallback_request_fingerprint,'researchStatus',p_research_status,'originalAttempt',r.original_attempt,'budgetVersion','capital-m07-operational-budget.v1','researchReservationVersion','public-research-reservation.m07.v1','researchReservationMicroUsd',research_reserve,'effectiveBudgetMicroUsd',effective_budget,'effectiveMaxDispatches',effective_dispatches)::text,'sha256'),'hex');
 select * into s from private.capital_m07_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if s.id is not null then
 if s.context_retained_payload_id<>p_context_retained_payload_id or s.recipe_fingerprint<>fp or s.reconstruction_fingerprint<>p_reconstruction_fingerprint then raise exception 'capital_m07_recipe_conflict' using errcode='23505';end if;
 else
 for component in select value from jsonb_array_elements(p_components) loop
 ordinal:=ordinal+1;
 if jsonb_typeof(component) is distinct from 'object' or not(component?&array['slot','id','version','bodyFingerprint']) or component-array['slot','id','version','bodyFingerprint']<>'{}' or component->>'bodyFingerprint'!~'^[a-f0-9]{64}$' or jsonb_typeof(component->'version') is distinct from 'number' or(component->>'version')::numeric<>trunc((component->>'version')::numeric) or(component->>'version')::numeric<1 then raise exception 'capital_m07_recipe_invalid' using errcode='22023';end if;
 expected:=null;expected_version:=null;
 case component->>'slot'
 when 'company' then expected:=r.session_id;expected_version:=1;
 when 'brief' then expected:=r.brief_id;select brief_version into expected_version from public.capital_project_briefs where organization_id=j.organization_id and id=r.brief_id;
 when 'institution' then expected:=r.plan_id;select plan_version into expected_version from public.capital_project_plans where organization_id=j.organization_id and id=r.plan_id;
 when 'revision' then expected:=r.job_id;expected_version:=1;
 when 'quality_retry' then expected:=r.job_id;expected_version:=1;
 when 'research' then expected:=r.id;expected_version:=1;
 when 'dependency' then
 select * into dep from public.capital_project_artifacts where organization_id=j.organization_id and capital_project_id=r.work_id and id=(component->>'id')::uuid and status not in ('stale','superseded');
 if dep.id is null or not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id join public.capital_project_plan_tasks m07 on m07.organization_id=pt.organization_id and m07.plan_id=r.plan_id and m07.task_id='M07' where tr.organization_id=j.organization_id and tr.id=dep.task_run_id and tr.status='succeeded' and pt.task_id=any(m07.dependencies)) then raise exception 'capital_m07_dependency_denied' using errcode='42501';end if;
 if component->>'bodyFingerprint' is distinct from encode(extensions.digest('{"artifactFingerprint":'||to_jsonb(dep.artifact_fingerprint)::text||'}','sha256'),'hex') then raise exception 'capital_m07_dependency_pin_invalid' using errcode='22023';end if;
 expected:=dep.id;expected_version:=dep.artifact_version;
 when 'source' then
 select l.* into lic from private.capital_public_delivery_licenses l join private.capital_public_deliveries d on d.organization_id=l.organization_id and d.id=l.delivery_id join private.capital_public_input_snapshots snap on snap.organization_id=d.organization_id and snap.id=d.capture_id where l.organization_id=j.organization_id and l.delivery_id=(component->>'id')::uuid and snap.job_id=j.id;
 select z.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations z on z.organization_id=p.organization_id and z.id=p.allocation_id where p.organization_id=j.organization_id and z.job_id=j.id and z.content_kind='public_source' and z.license_id=lic.id order by p.created_at limit 1;
 if lic.id is null or a.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id)) or private.capital_public_retention_deadline_v1(lic.id,j.organization_id,a.retained_at,a.policy_id) is null then raise exception 'capital_m07_source_denied' using errcode='42501';end if;
 expected:=lic.delivery_id;expected_version:=1;
 else raise exception 'capital_m07_recipe_invalid' using errcode='22023';end case;
 if expected is distinct from (component->>'id')::uuid or expected_version is distinct from(component->>'version')::integer or (component->>'slot'<>'source' and(component?'licenseId' or component?'retainedPayloadId')) then raise exception 'capital_m07_component_denied' using errcode='42501';end if;
 insert into private.capital_m07_recipe_components(organization_id,work_id,recipe_id,component_no,slot,reference_id,version,body_fingerprint,retained_payload_id,license_id,dependency_artifact_id)
 values(j.organization_id,r.work_id,r.id,ordinal,component->>'slot',expected,expected_version,component->>'bodyFingerprint',case when component->>'slot'='source' then(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id) end,case when component->>'slot'='source' then lic.id end,case when component->>'slot'='dependency' then dep.id end);
 end loop;
 deadline:=private.capital_m07_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if deadline is null then raise exception 'capital_m07_denied' using errcode='42501';end if;
 run:=private.worker_start_capital_project_task(j.id,p_capability_token,'M07','offroad.origination_thesis','2026.09.03-v6',p_reconstruction_fingerprint,jsonb_build_object('schemaVersion','capital-m07-task-context.v1','recipeId',r.id,'recipeFingerprint',fp,'contextRetainedPayloadId',p_context_retained_payload_id));
 insert into private.capital_m07_recipe_seals(organization_id,work_id,recipe_id,task_run_id,context_retained_payload_id,recipe_fingerprint,reconstruction_fingerprint,prompt_fingerprint,primary_request_fingerprint,fallback_request_fingerprint,research_status,budget_version,research_reservation_version,research_reservation_micro_usd,effective_budget_micro_usd,effective_max_dispatches,sealed_at)
 values(j.organization_id,r.work_id,r.id,run,p_context_retained_payload_id,fp,p_reconstruction_fingerprint,p_prompt_fingerprint,p_primary_request_fingerprint,p_fallback_request_fingerprint,p_research_status,'capital-m07-operational-budget.v1','public-research-reservation.m07.v1',research_reserve,effective_budget,effective_dispatches,clock_timestamp()) returning * into s;
 end if;
 if private.capital_m07_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_m07_denied' using errcode='42501';end if;
 return private.capital_m07_recipe_dto_v1(j.organization_id,r.id);
end; $$;

create function private.require_capital_m07_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns private.capital_m07_recipes language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_m07_recipes;s private.capital_m07_recipe_seals;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-m07-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_m07_retry' using errcode='40001';end if;
 select * into r from private.capital_m07_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 select * into s from private.capital_m07_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if r.id is null or s.id is null or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id
 or private.capital_m07_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null
 or not private.capital_body_physical_receipt_v1(j.organization_id,s.context_retained_payload_id)
 or not private.capital_body_retention_healthy_v1(r.retention_policy_id,j.organization_id,(select allocation_id from private.capital_public_retained_payloads where organization_id=j.organization_id and id=s.context_retained_payload_id))
 or not exists(select 1 from public.capital_project_task_runs tr where tr.organization_id=j.organization_id and tr.id=s.task_run_id and tr.processing_job_id=j.id and tr.input_fingerprint=s.reconstruction_fingerprint and (tr.status in ('running','succeeded') or(tr.status='failed' and exists(select 1 from private.capital_m07_quality_failures q where q.organization_id=tr.organization_id and q.recipe_id=r.id and q.task_run_id=tr.id and q.quality_results=tr.quality_results and tr.error=jsonb_build_object('code','capital_m07_quality_failed'))) or(tr.status='failed' and exists(select 1 from private.capital_m07_execution_failures q where q.organization_id=tr.organization_id and q.recipe_id=r.id and q.task_run_id=tr.id and tr.quality_results='[]'::jsonb and tr.error=jsonb_build_object('code','capital_m07_execution_failed','reason',q.reason)))))
 or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_m07_recipe_denied' using errcode='42501';end if;
 return r;
end; $$;

-- DRAFT, not applied. Root integrates after recipe tables and helpers, before
-- parsed-body/native writers. M07 has its own origin, pins and 24k budget.
set search_path='';
create table private.capital_m07_operations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,recipe_id uuid not null,task_run_id uuid not null,
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 root_attempt_id uuid not null,renderer_version text not null check(renderer_version='capital-public-task-renderer.m07.v1'),
 max_dispatches integer not null default 2 check(max_dispatches between 1 and 2),max_exposure_micro_usd bigint not null default 3000000 check(max_exposure_micro_usd between 1 and 3000000),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),unique(organization_id,work_id,job_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_m07_recipes(organization_id,work_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id)
);
create table private.capital_m07_gateway_attempts (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,recipe_id uuid not null,invocation_id uuid not null,worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 previous_attempt_id uuid,root_attempt_id uuid not null,used_provider_fallback boolean not null,
 request_fingerprint text not null check(request_fingerprint~'^[a-f0-9]{64}$'),input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),prompt_fingerprint text not null check(prompt_fingerprint~'^[a-f0-9]{64}$'),
 attempt_metadata jsonb not null,route jsonb not null,resources text[] not null check(resources=array['inference','prompt_cache','schema_cache']::text[]),
 purpose text not null check(purpose='case_analysis'),model text not null check(model in ('gpt-5.6-sol','gpt-5.6-terra')),
 processing_decision_id uuid not null,allowed boolean not null,renderer_policy_fingerprint text not null check(renderer_policy_fingerprint~'^[a-f0-9]{64}$'),
 reservation_micro_usd bigint not null check(reservation_micro_usd between 0 and 3000000),server_reservation_micro_usd bigint not null check(server_reservation_micro_usd between reservation_micro_usd and 3000000),
 captured_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,invocation_id),unique(organization_id,operation_id,used_provider_fallback),unique(organization_id,work_id,job_id,operation_id,id),
 foreign key(organization_id,work_id,job_id,operation_id) references private.capital_m07_operations(organization_id,work_id,job_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_m07_recipes(organization_id,work_id,id),
 foreign key(organization_id,processing_decision_id) references private.processing_eligibility_decisions(organization_id,id),
 foreign key(organization_id,previous_attempt_id) references private.capital_m07_gateway_attempts(organization_id,id),
 foreign key(organization_id,root_attempt_id) references private.capital_m07_gateway_attempts(organization_id,id) deferrable initially deferred,
 check((not used_provider_fallback and previous_attempt_id is null and root_attempt_id=id and model='gpt-5.6-sol')
 or(used_provider_fallback and previous_attempt_id is not null and root_attempt_id<>id and model='gpt-5.6-terra'))
);
alter table private.capital_m07_operations add constraint capital_m07_operation_root_fk
 foreign key(organization_id,work_id,job_id,id,root_attempt_id) references private.capital_m07_gateway_attempts(organization_id,work_id,job_id,operation_id,id) deferrable initially deferred;
create table private.capital_m07_input_dispatches (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,attempt_id uuid not null,invocation_id uuid not null,dispatch_claim_id uuid not null default gen_random_uuid(),
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 request_fingerprint text not null check(request_fingerprint~'^[a-f0-9]{64}$'),reservation_micro_usd bigint not null,server_reservation_micro_usd bigint not null,
 claimed_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,attempt_id),unique(organization_id,invocation_id),unique(organization_id,dispatch_claim_id),
 unique(organization_id,work_id,job_id,operation_id,attempt_id,id),
 foreign key(organization_id,work_id,job_id,operation_id,attempt_id) references private.capital_m07_gateway_attempts(organization_id,work_id,job_id,operation_id,id),
 check(reservation_micro_usd between 0 and 3000000 and server_reservation_micro_usd between reservation_micro_usd and 3000000)
);
create table private.capital_m07_attempt_outcomes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,attempt_id uuid not null,input_receipt_id uuid not null,invocation_id uuid not null,
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 observation jsonb not null,outcome text not null check(outcome in ('accepted','invalid_output','provider_error','timeout','refusal')),
 outcome_fingerprint text not null check(outcome_fingerprint~'^[a-f0-9]{64}$'),cost_micro_usd bigint,server_exposure_micro_usd bigint not null,
 recorded_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,attempt_id),unique(organization_id,input_receipt_id),unique(organization_id,invocation_id),
 foreign key(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id) references private.capital_m07_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id,id),
 check(cost_micro_usd is null or cost_micro_usd between 0 and 9007199254740991),check(server_exposure_micro_usd between 0 and 9007199254740991)
);
create unique index capital_m07_outcomes_one_accepted on private.capital_m07_attempt_outcomes(organization_id,operation_id) where outcome='accepted';
create table private.capital_m07_accepted_invocations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,recipe_id uuid not null,
 input_receipt_id uuid not null,invocation_id uuid not null,output_fingerprint text not null check(output_fingerprint~'^[a-f0-9]{64}$'),accepted_identity jsonb not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,input_receipt_id),unique(organization_id,recipe_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_m07_recipes(organization_id,work_id,id),
 foreign key(organization_id,input_receipt_id) references private.capital_m07_input_dispatches(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id)
);
-- Cover every composite FK and principal lookup; append-only audit has no raw bodies.
create index capital_m07_operation_recipe_idx on private.capital_m07_operations(organization_id,work_id,recipe_id);
create index capital_m07_operation_job_idx on private.capital_m07_operations(organization_id,job_id);
create index capital_m07_operation_root_idx on private.capital_m07_operations(organization_id,work_id,job_id,id,root_attempt_id);
create index capital_m07_attempt_op_idx on private.capital_m07_gateway_attempts(organization_id,work_id,job_id,operation_id);
create index capital_m07_attempt_recipe_idx on private.capital_m07_gateway_attempts(organization_id,work_id,recipe_id);
create index capital_m07_attempt_decision_idx on private.capital_m07_gateway_attempts(organization_id,processing_decision_id);
create index capital_m07_attempt_previous_idx on private.capital_m07_gateway_attempts(organization_id,previous_attempt_id);
create index capital_m07_attempt_root_idx on private.capital_m07_gateway_attempts(organization_id,root_attempt_id);
create index capital_m07_dispatch_attempt_idx on private.capital_m07_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id);
create index capital_m07_outcome_input_idx on private.capital_m07_attempt_outcomes(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id);
create index capital_m07_accepted_recipe_idx on private.capital_m07_accepted_invocations(organization_id,work_id,recipe_id);
create index capital_m07_accepted_job_idx on private.capital_m07_accepted_invocations(organization_id,job_id);
do $$declare t text;begin
 foreach t in array array['capital_m07_operations','capital_m07_gateway_attempts','capital_m07_input_dispatches','capital_m07_attempt_outcomes','capital_m07_accepted_invocations'] loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy deny_clients_select on private.%I as restrictive for select to anon,authenticated using(false)',t);
 execute format('create policy deny_clients_insert on private.%I as restrictive for insert to anon,authenticated with check(false)',t);
 execute format('create policy deny_clients_update on private.%I as restrictive for update to anon,authenticated using(false) with check(false)',t);
 execute format('create policy deny_clients_delete on private.%I as restrictive for delete to anon,authenticated using(false)',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 if t<>'capital_m07_accepted_invocations' then
 execute format('create index %I on private.%I(worker_account_id)',t||'_worker_idx',t);execute format('create index %I on private.%I(human_subject_id)',t||'_subject_idx',t);
 end if;
 end loop;
end;$$;

-- Separate closed registry; existing contribution fingerprint function is unchanged.
create function private.capital_m07_attempt_outcome_fingerprint_v1(p_outcome jsonb)
returns text language plpgsql immutable security definer set search_path='' as $$
declare keys text[]:=array['schemaVersion','fingerprintVersion','outcomeFingerprint','invocationId','task','provider','configuredModel','schemaName',
 'adapterInputVersion','requestFingerprint','inputFingerprint','promptFingerprint','previousInvocationId','retryOrdinal','isSameModelRepair',
 'usedProviderFallback','processingDecisionId','inputAttestationReceiptId','fromCassette','outcome','failureCode','outputFingerprintVersion',
 'outputFingerprint','reportedModel','validationIssueCodeFingerprint','reservationMicroUsd','costMicroUsd','exposureMicroUsd','costStatus',
 'inputTokens','outputTokens','cachedInputTokens','latencyMillis'];
 key text;number_value numeric;wire text;tuple jsonb;kind text;status text;
begin
 if jsonb_typeof(p_outcome) is distinct from 'object' or octet_length(p_outcome::text)>8192
 or not(p_outcome?&keys) or p_outcome-keys<>'{}'::jsonb
 or p_outcome->>'schemaVersion' is distinct from 'gateway-attempt-outcome.v1'
 or p_outcome->>'fingerprintVersion' is distinct from 'gateway-attempt-outcome-fingerprint.v1'
 or p_outcome->>'task' is distinct from 'origination_thesis'
 or p_outcome->>'provider' is distinct from 'openai'
 or p_outcome->>'configuredModel' is null or p_outcome->>'configuredModel' not in ('gpt-5.6-sol','gpt-5.6-terra')
 or p_outcome->>'schemaName' is distinct from 'origination_senior_readout_v2'
 or p_outcome->>'adapterInputVersion' is distinct from 'gateway-adapter-input.v1' then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['outcomeFingerprint','requestFingerprint','inputFingerprint','promptFingerprint'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'string' or p_outcome->>key !~ '^[a-f0-9]{64}$' then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;end loop;
 foreach key in array array['invocationId','processingDecisionId','inputAttestationReceiptId'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'string' or p_outcome->>key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;end loop;
 if p_outcome->'previousInvocationId'<>'null'::jsonb and(jsonb_typeof(p_outcome->'previousInvocationId') is distinct from 'string'
 or p_outcome->>'previousInvocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['isSameModelRepair','usedProviderFallback','fromCassette'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'boolean' then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;end loop;
 if p_outcome->>'isSameModelRepair'<>'false' or p_outcome->>'fromCassette'<>'false' or p_outcome->>'retryOrdinal'<>'0'
 or((p_outcome->>'usedProviderFallback')::boolean and p_outcome->'previousInvocationId'='null'::jsonb)
 or(not(p_outcome->>'usedProviderFallback')::boolean and p_outcome->'previousInvocationId'<>'null'::jsonb) then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['retryOrdinal','reservationMicroUsd','costMicroUsd','exposureMicroUsd','inputTokens','outputTokens','cachedInputTokens','latencyMillis'] loop
 if p_outcome->key='null'::jsonb and key in ('costMicroUsd','inputTokens','outputTokens','cachedInputTokens') then continue;end if;
 if jsonb_typeof(p_outcome->key) is distinct from 'number' then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 number_value:=(p_outcome->>key)::numeric;
 if number_value<0 or number_value>9007199254740991 or trunc(number_value)<>number_value or scale(number_value)<>0 then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 end loop;
 kind:=p_outcome->>'outcome';status:=p_outcome->>'costStatus';
 if kind is null or kind not in ('accepted','invalid_output','provider_error','timeout','refusal') or status is null or status not in ('measured','unknown') then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 if(status='unknown' and exists(select 1 from unnest(array['costMicroUsd','inputTokens','outputTokens','cachedInputTokens']) k where p_outcome->k<>'null'::jsonb))
 or(status='measured' and exists(select 1 from unnest(array['costMicroUsd','inputTokens','outputTokens','cachedInputTokens']) k where p_outcome->k='null'::jsonb))
 or(kind in ('provider_error','timeout') and status<>'unknown')
 or(p_outcome->>'exposureMicroUsd')::numeric<>greatest((p_outcome->>'reservationMicroUsd')::numeric,coalesce((p_outcome->>'costMicroUsd')::numeric,(p_outcome->>'reservationMicroUsd')::numeric)) then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 if kind='accepted' then
 if p_outcome->'failureCode'<>'null'::jsonb or p_outcome->>'outputFingerprintVersion' is distinct from 'gateway-parsed-output.v1'
 or jsonb_typeof(p_outcome->'outputFingerprint') is distinct from 'string' or p_outcome->>'outputFingerprint'!~'^[a-f0-9]{64}$'
 or p_outcome->>'reportedModel' is distinct from p_outcome->>'configuredModel' or p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 else
 if p_outcome->'outputFingerprintVersion'<>'null'::jsonb or p_outcome->'outputFingerprint'<>'null'::jsonb or p_outcome->'reportedModel'<>'null'::jsonb
 or jsonb_typeof(p_outcome->'failureCode') is distinct from 'string'
 or(kind='invalid_output' and p_outcome->>'failureCode' not in ('schema_invalid','deterministic_invalid','output_truncated'))
 or(kind='provider_error' and p_outcome->>'failureCode'<>'provider_failure')
 or(kind='timeout' and p_outcome->>'failureCode'<>'provider_timeout')
 or(kind='refusal' and p_outcome->>'failureCode'<>'provider_refusal') then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 if kind='invalid_output' then
 if p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb and(jsonb_typeof(p_outcome->'validationIssueCodeFingerprint') is distinct from 'string'
 or p_outcome->>'validationIssueCodeFingerprint'!~'^[a-f0-9]{64}$') then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 if p_outcome->>'failureCode' in ('schema_invalid','deterministic_invalid') and p_outcome->'validationIssueCodeFingerprint'='null'::jsonb then
 raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 elsif p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 end if;
 tuple:=jsonb_build_array(p_outcome->'fingerprintVersion',p_outcome->'invocationId',p_outcome->'task',p_outcome->'provider',p_outcome->'configuredModel',
 p_outcome->'schemaName',p_outcome->'adapterInputVersion',p_outcome->'requestFingerprint',p_outcome->'inputFingerprint',p_outcome->'promptFingerprint',
 p_outcome->'previousInvocationId',p_outcome->'retryOrdinal',p_outcome->'isSameModelRepair',p_outcome->'usedProviderFallback',p_outcome->'processingDecisionId',
 p_outcome->'inputAttestationReceiptId',p_outcome->'fromCassette',p_outcome->'outcome',p_outcome->'failureCode',p_outcome->'outputFingerprintVersion',
 p_outcome->'outputFingerprint',p_outcome->'reportedModel',p_outcome->'validationIssueCodeFingerprint',p_outcome->'reservationMicroUsd',p_outcome->'costMicroUsd',
 p_outcome->'exposureMicroUsd',p_outcome->'costStatus',p_outcome->'inputTokens',p_outcome->'outputTokens',p_outcome->'cachedInputTokens',p_outcome->'latencyMillis');
 select '['||string_agg(case when jsonb_typeof(x.value)='number' then ((x.value::text)::numeric)::bigint::text else x.value::text end,',' order by x.ordinality)||']'
 into wire from jsonb_array_elements(tuple) with ordinality x(value,ordinality);
 return encode(extensions.digest(wire,'sha256'),'hex');
end; $$;

create function private.capital_m07_dispatch_policy_v1(p_model text,p_input_bytes bigint)
returns jsonb language plpgsql immutable security definer set search_path='' as $$
declare input_rate bigint;write_rate bigint;output_rate bigint;tuple jsonb;wire text;tokens bigint;bound bigint;
begin
 if p_input_bytes is null or p_input_bytes not between 1 and 100000 or p_model is null or p_model not in ('gpt-5.6-sol','gpt-5.6-terra') then
 raise exception 'capital_m07_policy_invalid' using errcode='22023';end if;
 input_rate:=case p_model when 'gpt-5.6-sol' then 4000000 else 2000000 end;
 write_rate:=case p_model when 'gpt-5.6-sol' then 5000000 else 2500000 end;
 output_rate:=case p_model when 'gpt-5.6-sol' then 20000000 else 12000000 end;
 tuple:=jsonb_build_array('capital-m07-dispatch-policy.v1','capital-public-task-renderer.m07.v1','openai',p_model,'high',
 '9cb22a6f263d825c293daf948e348a5956a794e876cb78bb64ed8c00488af30d',6496,
 '2e71ff14ecbc6727c8cd56fbd96009850d368bfddf8e36472d9b67eb2785d29d',5630,1024,100000,24000,input_rate,write_rate,output_rate,11,10,272000,2,1,3,2,'origination-senior-readout-v6');
 select '['||string_agg(x.value::text,',' order by x.ordinality)||']' into wire from jsonb_array_elements(tuple) with ordinality x(value,ordinality);
 -- Server uses maximum admitted text size, never an observed caller byte count
 -- as authority for a cheaper grant. The registry cap cannot cross long tariff.
 tokens:=100000+6496+5630+1024;
 bound:=ceil((tokens::numeric*greatest(input_rate,write_rate)+24000::numeric*output_rate)*11/10000000)::bigint;
 return jsonb_build_object('fingerprint',encode(extensions.digest(wire,'sha256'),'hex'),'serverBoundMicroUsd',bound);
end;$$;

create function private.lock_capital_m07_operation_v1(p_org uuid,p_recipe uuid)
returns void language plpgsql security definer set search_path='' as $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-m07-operation:'||p_org::text||':'||p_recipe::text,0)) then
 raise exception 'capital_m07_processing_retry' using errcode='40001';end if;
end;$$;
create function private.capital_m07_attempt_assurances_current_v1(p_job public.processing_jobs,p_attempt private.capital_m07_gateway_attempts)
returns void language plpgsql security definer set search_path='' as $$
declare decision_row private.processing_eligibility_decisions;assurance_row private.provider_processing_assurances;
 assurance_uuid uuid;seen text[]:='{}';matches integer;
begin
 if p_attempt.organization_id<>p_job.organization_id or p_attempt.job_id<>p_job.id or not p_attempt.allowed
 or p_attempt.worker_account_id<>auth.uid() or p_attempt.human_subject_id<>p_job.authorization_subject_id then raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended('provider-processing-assurances',0)) then raise exception 'capital_m07_processing_retry' using errcode='40001';end if;
 select * into decision_row from private.processing_eligibility_decisions where organization_id=p_job.organization_id and job_id=p_job.id and id=p_attempt.processing_decision_id;
 if decision_row.id is null or not decision_row.allowed or decision_row.route is distinct from p_attempt.route
 or decision_row.classification is distinct from 'restricted' or decision_row.purpose is distinct from 'case_analysis'
 or decision_row.policy_version is distinct from 'offroad-provider-retention-v2' or decision_row.resources is distinct from p_attempt.resources
 or cardinality(decision_row.assurance_ids)<>3 or(select count(distinct x) from unnest(decision_row.assurance_ids)x)<>3 then
 raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 for assurance_uuid in select x from unnest(decision_row.assurance_ids)x order by x loop
 begin select * into assurance_row from private.provider_processing_assurances where id=assurance_uuid for share nowait;
 exception when lock_not_available then raise exception 'capital_m07_processing_retry' using errcode='40001';end;
 if assurance_row.id is null or assurance_row.revoked_at is not null or assurance_row.reviewed_at>clock_timestamp()
 or assurance_row.valid_through<=clock_timestamp() or assurance_row.provider is distinct from 'openai'
 or assurance_row.account_ref is distinct from p_attempt.route->>'accountRef' or assurance_row.project_ref is distinct from p_attempt.route->>'projectRef'
 or assurance_row.credential_binding is distinct from p_attempt.route->>'credentialBinding' or assurance_row.endpoint is distinct from p_attempt.route->>'endpoint'
 or assurance_row.region is distinct from p_attempt.route->>'region' or(assurance_row.document->'models' ? p_attempt.model)is distinct from true
 or assurance_row.resource not in ('inference','prompt_cache','schema_cache') or assurance_row.resource=any(seen)
 or assurance_row.document->>'eligibility' is distinct from 'supported' or assurance_row.document->>'trainingUse' is distinct from 'prohibited'
 or(assurance_row.document->'purposes' ? 'case_analysis')is distinct from true or(assurance_row.document->'classifications' ? 'restricted')is distinct from true
 or(assurance_row.document->'rights' ? 'process')is distinct from true then raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 select count(*) into matches from private.provider_processing_assurances a where a.revoked_at is null
 and(a.provider,a.account_ref,a.project_ref,a.credential_binding,a.endpoint,a.region,a.resource)
 is not distinct from(assurance_row.provider,assurance_row.account_ref,assurance_row.project_ref,assurance_row.credential_binding,assurance_row.endpoint,assurance_row.region,assurance_row.resource)
 and a.document->'models' ? p_attempt.model;
 if matches<>1 then raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 seen:=array_append(seen,assurance_row.resource);
 end loop;
end;$$;
create function private.capital_m07_attempt_current_v1(p_job_id uuid,p_capability_token text,p_attempt private.capital_m07_gateway_attempts)
returns private.capital_m07_recipes language plpgsql security definer set search_path='' as $$
declare recipe private.capital_m07_recipes;job public.processing_jobs;op private.capital_m07_operations;seal private.capital_m07_recipe_seals;prior private.capital_m07_gateway_attempts;
begin
 recipe:=private.require_capital_m07_recipe_v1(p_job_id,p_capability_token,p_attempt.recipe_id);
 if exists(select 1 from private.capital_m07_quality_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) or exists(select 1 from private.capital_m07_execution_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) then raise exception 'capital_m07_execution_failed_terminal' using errcode='42501';end if;
 job:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 perform private.lock_capital_m07_operation_v1(recipe.organization_id,recipe.id);
 select * into op from private.capital_m07_operations where organization_id=recipe.organization_id and id=p_attempt.operation_id;
 select * into seal from private.capital_m07_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id;
 if op.id is null or seal.id is null or p_attempt.job_id<>recipe.job_id or p_attempt.work_id<>recipe.work_id
 or p_attempt.worker_account_id<>auth.uid() or p_attempt.human_subject_id<>job.authorization_subject_id
 or op.recipe_id<>recipe.id or op.job_id<>job.id or op.worker_account_id<>auth.uid() or op.human_subject_id<>job.authorization_subject_id
 or op.task_run_id<>seal.task_run_id or op.root_attempt_id<>p_attempt.root_attempt_id
 or p_attempt.input_fingerprint<>seal.reconstruction_fingerprint or p_attempt.prompt_fingerprint<>seal.prompt_fingerprint
 or p_attempt.request_fingerprint<>(case when p_attempt.used_provider_fallback then seal.fallback_request_fingerprint else seal.primary_request_fingerprint end) then
 raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 if p_attempt.previous_attempt_id is not null then
 select * into prior from private.capital_m07_gateway_attempts where organization_id=recipe.organization_id and id=p_attempt.previous_attempt_id;
 if prior.id is null or prior.operation_id<>op.id or prior.used_provider_fallback or prior.root_attempt_id<>p_attempt.root_attempt_id
 or prior.worker_account_id<>auth.uid() or prior.human_subject_id<>job.authorization_subject_id then raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 if prior.allowed then
 perform private.capital_m07_attempt_assurances_current_v1(job,prior);
 if not exists(select 1 from private.capital_m07_attempt_outcomes o where o.organization_id=recipe.organization_id and o.attempt_id=prior.id and o.outcome<>'accepted') then
 raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 end if;
 end if;
 if p_attempt.allowed then perform private.capital_m07_attempt_assurances_current_v1(job,p_attempt);end if;
 return recipe;
end;$$;

create function private.capital_m07_attempt_dto_v1(p_attempt private.capital_m07_gateway_attempts,p_replayed boolean)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-body-processing-decision.v2','allowed',p_attempt.allowed,'policyVersion',d.policy_version,
 'assuranceId',null,'assuranceIds',to_jsonb(d.assurance_ids),'decisionId',d.id,'classification',d.classification,'reasons',to_jsonb(d.reasons),
 'attemptReceiptId',p_attempt.id,'invocationId',p_attempt.invocation_id,'requestFingerprint',p_attempt.request_fingerprint,
 'eligibilityFingerprint',encode(extensions.digest(jsonb_build_object('decision',d.id,'recipe',p_attempt.recipe_id,'policy',p_attempt.renderer_policy_fingerprint)::text,'sha256'),'hex'),
 'replayed',p_replayed,'operationId',p_attempt.operation_id,'rootAttemptReceiptId',p_attempt.root_attempt_id)
 from private.processing_eligibility_decisions d where d.organization_id=p_attempt.organization_id and d.id=p_attempt.processing_decision_id;
$$;
create function private.worker_authorize_capital_m07_processing_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare recipe private.capital_m07_recipes:=private.require_capital_m07_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);seal private.capital_m07_recipe_seals;
 op private.capital_m07_operations;a private.capital_m07_gateway_attempts;prior private.capital_m07_gateway_attempts;
 fallback boolean;invocation uuid;prior_invocation uuid;new_attempt_id uuid:=gen_random_uuid();model text;policy jsonb;decision jsonb;
 observed bigint;server_reserve bigint;stamp timestamptz:=clock_timestamp();deadline timestamptz;replayed boolean:=false;
begin
 perform private.lock_capital_m07_operation_v1(recipe.organization_id,recipe.id);
 if exists(select 1 from private.capital_m07_quality_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) or exists(select 1 from private.capital_m07_execution_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) then raise exception 'capital_m07_quality_failed_terminal' using errcode='42501';end if;
 select * into strict seal from private.capital_m07_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id;
 if jsonb_typeof(p_attempt)is distinct from 'object' or octet_length(p_attempt::text)>4096
 or not(p_attempt?&array['adapterInputVersion','task','schemaName','requestFingerprint','inputFingerprint','promptFingerprint','invocationId','retryOrdinal','isSameModelRepair','usedProviderFallback','reservationUsd'])
 or p_attempt-array['adapterInputVersion','task','schemaName','requestFingerprint','inputFingerprint','promptFingerprint','invocationId','retryOrdinal','isSameModelRepair','usedProviderFallback','reservationUsd','previousInvocationId']<>'{}'::jsonb
 or p_attempt->>'adapterInputVersion'is distinct from 'gateway-adapter-input.v1' or p_attempt->>'task'is distinct from 'origination_thesis'
 or p_attempt->>'schemaName'is distinct from 'origination_senior_readout_v2'
 or exists(select 1 from unnest(array['requestFingerprint','inputFingerprint','promptFingerprint'])k where jsonb_typeof(p_attempt->k)is distinct from 'string' or p_attempt->>k !~'^[a-f0-9]{64}$')
 or jsonb_typeof(p_attempt->'invocationId')is distinct from 'string' or p_attempt->>'invocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 or jsonb_typeof(p_attempt->'retryOrdinal')is distinct from 'number' or p_attempt->>'retryOrdinal'is distinct from '0'
 or jsonb_typeof(p_attempt->'isSameModelRepair')is distinct from 'boolean' or p_attempt->>'isSameModelRepair'is distinct from 'false'
 or jsonb_typeof(p_attempt->'usedProviderFallback')is distinct from 'boolean' or jsonb_typeof(p_attempt->'reservationUsd')is distinct from 'number'
 or(p_attempt->>'reservationUsd')::numeric not between 0 and 3
 or p_resources is null or cardinality(p_resources)<>3 or not(p_resources@>array['inference','prompt_cache','schema_cache']::text[]) or p_purpose is distinct from 'case_analysis' then
 raise exception 'capital_m07_processing_invalid' using errcode='22023';end if;
 invocation:=(p_attempt->>'invocationId')::uuid;fallback:=(p_attempt->>'usedProviderFallback')::boolean;
 if(fallback and(jsonb_typeof(p_attempt->'previousInvocationId')is distinct from 'string' or p_attempt->>'previousInvocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'))
 or(not fallback and p_attempt?'previousInvocationId')then raise exception 'capital_m07_processing_invalid' using errcode='22023';end if;
 if fallback then prior_invocation:=(p_attempt->>'previousInvocationId')::uuid;end if;
 model:=case when fallback then 'gpt-5.6-terra' else 'gpt-5.6-sol' end;
 if jsonb_typeof(p_route)is distinct from 'object' or p_route->>'provider'is distinct from 'openai' or p_route->>'model'is distinct from model
 or p_route->>'endpoint'is distinct from 'https://api.openai.com/v1/responses' then raise exception 'capital_m07_processing_invalid' using errcode='22023';end if;
 if p_attempt->>'inputFingerprint'is distinct from seal.reconstruction_fingerprint or p_attempt->>'promptFingerprint'is distinct from seal.prompt_fingerprint
 or p_attempt->>'requestFingerprint'is distinct from (case when fallback then seal.fallback_request_fingerprint else seal.primary_request_fingerprint end) then
 raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 if exists(select 1 from private.capital_body_invocation_inputs x where x.organization_id=recipe.organization_id and x.invocation_id=invocation)
 or exists(select 1 from private.capital_body_gateway_attempts x where x.organization_id=recipe.organization_id and x.invocation_id=invocation) then
 raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 policy:=private.capital_m07_dispatch_policy_v1(model,100000);observed:=ceil((p_attempt->>'reservationUsd')::numeric*1000000)::bigint;
 server_reserve:=greatest(observed,(policy->>'serverBoundMicroUsd')::bigint);
 select * into op from private.capital_m07_operations where organization_id=recipe.organization_id and recipe_id=recipe.id;
 select * into a from private.capital_m07_gateway_attempts where organization_id=recipe.organization_id and invocation_id=invocation;
 if a.id is not null then
 if op.id is null or a.operation_id<>op.id or a.recipe_id<>recipe.id or a.attempt_metadata is distinct from p_attempt or a.route is distinct from p_route
 or a.reservation_micro_usd<>observed or a.server_reservation_micro_usd<>server_reserve or a.renderer_policy_fingerprint<>policy->>'fingerprint' then
 raise exception 'capital_m07_processing_conflict' using errcode='23505';end if;
 perform private.capital_m07_attempt_current_v1(p_job_id,p_capability_token,a);replayed:=true;
 else
 if op.id is null then
 if fallback then raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 insert into private.capital_m07_operations(organization_id,work_id,job_id,recipe_id,task_run_id,worker_account_id,human_subject_id,root_attempt_id,renderer_version,max_dispatches,max_exposure_micro_usd)
 values(recipe.organization_id,recipe.work_id,job.id,recipe.id,seal.task_run_id,auth.uid(),job.authorization_subject_id,new_attempt_id,recipe.renderer_version,seal.effective_max_dispatches,seal.effective_budget_micro_usd) returning * into op;
 elsif not fallback then raise exception 'capital_m07_processing_denied' using errcode='42501';
 end if;
 if op.job_id<>job.id or op.worker_account_id<>auth.uid() or op.human_subject_id<>job.authorization_subject_id or op.task_run_id<>seal.task_run_id then raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 if fallback then
 select * into prior from private.capital_m07_gateway_attempts where organization_id=recipe.organization_id and invocation_id=prior_invocation;
 if prior.id is null or prior.operation_id<>op.id or prior.used_provider_fallback or prior.id<>op.root_attempt_id
 or exists(select 1 from private.capital_m07_attempt_outcomes o where o.organization_id=recipe.organization_id and o.operation_id=op.id and o.outcome='accepted') then raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 perform private.capital_m07_attempt_current_v1(p_job_id,p_capability_token,prior);
 if prior.allowed and not exists(select 1 from private.capital_m07_attempt_outcomes o where o.organization_id=recipe.organization_id and o.attempt_id=prior.id and o.outcome<>'accepted') then
 raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 end if;
 deadline:=private.capital_m07_recipe_deadline_v1(recipe.organization_id,recipe.id,job.authorization_subject_id);
 if deadline is null or deadline<=clock_timestamp() then raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 decision:=private.provider_processing_decision_with_body_limit_v1(job,p_route,array['inference','prompt_cache','schema_cache'],p_purpose,least(deadline,recipe.expires_at));
 insert into private.capital_m07_gateway_attempts(id,organization_id,work_id,job_id,operation_id,recipe_id,invocation_id,worker_account_id,human_subject_id,
 previous_attempt_id,root_attempt_id,used_provider_fallback,request_fingerprint,input_fingerprint,prompt_fingerprint,attempt_metadata,route,resources,purpose,model,
 processing_decision_id,allowed,renderer_policy_fingerprint,reservation_micro_usd,server_reservation_micro_usd,captured_at)
 values(new_attempt_id,recipe.organization_id,recipe.work_id,job.id,op.id,recipe.id,invocation,auth.uid(),job.authorization_subject_id,
 case when fallback then prior.id else null end,op.root_attempt_id,fallback,p_attempt->>'requestFingerprint',p_attempt->>'inputFingerprint',p_attempt->>'promptFingerprint',p_attempt,p_route,
 array['inference','prompt_cache','schema_cache'],'case_analysis',model,(decision->>'decisionId')::uuid,(decision->>'allowed')::boolean,policy->>'fingerprint',observed,server_reserve,stamp) returning * into a;
 end if;
 perform private.require_capital_m07_recipe_v1(p_job_id,p_capability_token,recipe.id);
 return private.capital_m07_attempt_dto_v1(a,replayed);
end;$$;

create function private.worker_record_capital_m07_input_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_m07_gateway_attempts;
 recipe private.capital_m07_recipes;op private.capital_m07_operations;claim private.capital_m07_input_dispatches;exposure numeric;sends integer;fresh boolean:=false;
 policy jsonb;eligibility jsonb;deadline timestamptz;
begin
 select * into a from private.capital_m07_gateway_attempts where organization_id=job.organization_id and job_id=job.id and id=p_attempt_receipt_id;
 if a.id is null or not a.allowed then raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 recipe:=private.capital_m07_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into strict op from private.capital_m07_operations where organization_id=job.organization_id and id=a.operation_id;
 policy:=private.capital_m07_dispatch_policy_v1(a.model,100000);
 if a.renderer_policy_fingerprint<>policy->>'fingerprint' or a.server_reservation_micro_usd<>greatest(a.reservation_micro_usd,(policy->>'serverBoundMicroUsd')::bigint)then raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 select * into claim from private.capital_m07_input_dispatches where organization_id=job.organization_id and attempt_id=a.id;
 if claim.id is null then
 if exists(select 1 from private.capital_m07_attempt_outcomes where organization_id=job.organization_id and operation_id=op.id and outcome='accepted')then raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 select count(*),coalesce(sum(greatest(d.server_reservation_micro_usd,coalesce(o.cost_micro_usd,d.server_reservation_micro_usd))),0) into sends,exposure
 from private.capital_m07_input_dispatches d left join private.capital_m07_attempt_outcomes o on o.organization_id=d.organization_id and o.input_receipt_id=d.id
 where d.organization_id=job.organization_id and d.operation_id=op.id;
 if sends>=op.max_dispatches or exposure+a.server_reservation_micro_usd>op.max_exposure_micro_usd then raise exception 'capital_m07_budget_denied' using errcode='42501';end if;
 -- Re-evaluate provider TTL at the one actual send grant. Replay does not reset it.
 deadline:=private.capital_m07_recipe_deadline_v1(recipe.organization_id,recipe.id,job.authorization_subject_id);
 eligibility:=private.resolve_capital_body_processing_v1(job,a.route,a.resources,a.purpose,least(deadline,recipe.expires_at));
 if eligibility->>'allowed'is distinct from 'true' then raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 insert into private.capital_m07_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id,invocation_id,worker_account_id,human_subject_id,
 request_fingerprint,reservation_micro_usd,server_reservation_micro_usd,claimed_at)
 values(job.organization_id,a.work_id,job.id,op.id,a.id,a.invocation_id,auth.uid(),job.authorization_subject_id,a.request_fingerprint,a.reservation_micro_usd,a.server_reservation_micro_usd,clock_timestamp())returning * into claim;fresh:=true;
 end if;
 if claim.operation_id<>op.id or claim.invocation_id<>a.invocation_id or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id
 or claim.request_fingerprint<>a.request_fingerprint then raise exception 'capital_m07_processing_conflict' using errcode='23505';end if;
 perform private.capital_m07_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('schemaVersion','capital-body-input-dispatch.v3','receiptId',claim.id,'invocationId',a.invocation_id,'requestFingerprint',a.request_fingerprint,
 'operationId',op.id,'attemptReceiptId',a.id,'rootAttemptReceiptId',op.root_attempt_id,'dispatchClaimId',claim.dispatch_claim_id,
 'rendererPolicyFingerprint',a.renderer_policy_fingerprint,'reservationMicroUsd',a.reservation_micro_usd,'serverReservationMicroUsd',claim.server_reservation_micro_usd,
 'dispatchAllowed',fresh,'replayed',not fresh);
end;$$;

create function private.worker_record_capital_m07_attempt_outcome_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid,p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_m07_gateway_attempts;prior private.capital_m07_gateway_attempts;
 recipe private.capital_m07_recipes;op private.capital_m07_operations;claim private.capital_m07_input_dispatches;recorded private.capital_m07_attempt_outcomes;
 common_fp text;replayed boolean:=false;
begin
 common_fp:=private.capital_m07_attempt_outcome_fingerprint_v1(p_outcome);
 if common_fp is distinct from p_outcome->>'outcomeFingerprint'then raise exception 'capital_m07_outcome_invalid' using errcode='22023';end if;
 select * into a from private.capital_m07_gateway_attempts where organization_id=job.organization_id and job_id=job.id and id=p_attempt_receipt_id;
 if a.id is null or not a.allowed then raise exception 'capital_m07_processing_denied' using errcode='42501';end if;
 recipe:=private.capital_m07_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into strict op from private.capital_m07_operations where organization_id=job.organization_id and id=a.operation_id;
 select * into claim from private.capital_m07_input_dispatches where organization_id=job.organization_id and attempt_id=a.id;
 select * into prior from private.capital_m07_gateway_attempts where organization_id=job.organization_id and id=a.previous_attempt_id;
 if claim.id is null or claim.operation_id<>op.id or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id
 or(p_outcome->>'invocationId',p_outcome->>'task',p_outcome->>'provider',p_outcome->>'configuredModel',p_outcome->>'schemaName',p_outcome->>'adapterInputVersion',
 p_outcome->>'requestFingerprint',p_outcome->>'inputFingerprint',p_outcome->>'promptFingerprint',p_outcome->>'previousInvocationId',p_outcome->>'retryOrdinal',
 p_outcome->>'isSameModelRepair',p_outcome->>'usedProviderFallback',p_outcome->>'processingDecisionId',p_outcome->>'inputAttestationReceiptId')
 is distinct from(a.invocation_id::text,'origination_thesis'::text,'openai'::text,a.model,'origination_senior_readout_v2'::text,'gateway-adapter-input.v1'::text,
 a.request_fingerprint,a.input_fingerprint,a.prompt_fingerprint,prior.invocation_id::text,'0'::text,'false'::text,a.used_provider_fallback::text,a.processing_decision_id::text,claim.id::text)
 or(p_outcome->>'reservationMicroUsd')::bigint<>a.reservation_micro_usd then raise exception 'capital_m07_outcome_denied' using errcode='42501';end if;
 select * into recorded from private.capital_m07_attempt_outcomes where organization_id=job.organization_id and attempt_id=a.id;
 if recorded.id is not null then
 if recorded.observation is distinct from p_outcome or recorded.outcome_fingerprint<>common_fp or recorded.input_receipt_id<>claim.id then raise exception 'capital_m07_outcome_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 insert into private.capital_m07_attempt_outcomes(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id,invocation_id,worker_account_id,human_subject_id,
 observation,outcome,outcome_fingerprint,cost_micro_usd,server_exposure_micro_usd,recorded_at)
 values(job.organization_id,a.work_id,job.id,op.id,a.id,claim.id,a.invocation_id,auth.uid(),job.authorization_subject_id,p_outcome,p_outcome->>'outcome',common_fp,
 (p_outcome->>'costMicroUsd')::bigint,greatest(claim.server_reservation_micro_usd,coalesce((p_outcome->>'costMicroUsd')::bigint,claim.server_reservation_micro_usd)),clock_timestamp())returning * into recorded;
 end if;
 perform private.capital_m07_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('schemaVersion','capital-body-attempt-outcome-receipt.v1','receiptId',recorded.id,'operationId',op.id,'attemptReceiptId',a.id,'inputReceiptId',claim.id,
 'rootAttemptReceiptId',op.root_attempt_id,'invocationId',a.invocation_id,'requestFingerprint',a.request_fingerprint,'fingerprintVersion','gateway-attempt-outcome-fingerprint.v1',
 'outcomeFingerprint',recorded.outcome_fingerprint,'outcome',recorded.outcome,'failureCode',recorded.observation->'failureCode','replayed',replayed);
end;$$;
create function private.worker_record_capital_m07_accepted_v1(p_job_id uuid,p_capability_token text,p_input_receipt_id uuid,p_accepted jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_m07_gateway_attempts;
 recipe private.capital_m07_recipes;claim private.capital_m07_input_dispatches;outcome_row private.capital_m07_attempt_outcomes;accepted private.capital_m07_accepted_invocations;
 keys text[]:=array['schemaVersion','invocationId','adapterInputVersion','adapterRequestFingerprint','outputFingerprintVersion','outputFingerprint','inputFingerprint','promptFingerprint',
 'provider','configuredModel','reportedModel','schemaName','retryOrdinal','isSameModelRepair','usedProviderFallback','fromCassette','inputAttestationReceiptId'];
begin
 select * into claim from private.capital_m07_input_dispatches where organization_id=job.organization_id and job_id=job.id and id=p_input_receipt_id;
 if claim.id is null or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id then raise exception 'capital_m07_accepted_denied' using errcode='42501';end if;
 select * into strict a from private.capital_m07_gateway_attempts where organization_id=job.organization_id and id=claim.attempt_id;
 recipe:=private.capital_m07_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into outcome_row from private.capital_m07_attempt_outcomes where organization_id=job.organization_id and input_receipt_id=claim.id;
 if outcome_row.id is null or outcome_row.outcome<>'accepted' then raise exception 'capital_m07_accepted_denied' using errcode='42501';end if;
 if jsonb_typeof(p_accepted)is distinct from 'object' or not(p_accepted?&keys) or p_accepted-keys<>'{}'::jsonb or octet_length(p_accepted::text)>4096
 or p_accepted->>'schemaVersion'is distinct from 'gateway-accepted-invocation.v1'
 or p_accepted->>'adapterInputVersion'is distinct from 'gateway-adapter-input.v1' or p_accepted->>'outputFingerprintVersion'is distinct from 'gateway-parsed-output.v1'
 or p_accepted->>'provider'is distinct from 'openai' or p_accepted->>'configuredModel'is distinct from a.model or p_accepted->>'reportedModel'is distinct from a.model
 or p_accepted->>'schemaName'is distinct from 'origination_senior_readout_v2' or p_accepted->>'invocationId'is distinct from a.invocation_id::text
 or p_accepted->>'inputAttestationReceiptId'is distinct from claim.id::text or p_accepted->>'adapterRequestFingerprint'is distinct from a.request_fingerprint
 or p_accepted->>'inputFingerprint'is distinct from a.input_fingerprint or p_accepted->>'promptFingerprint'is distinct from a.prompt_fingerprint
 or p_accepted->>'outputFingerprint'is distinct from outcome_row.observation->>'outputFingerprint'
 or jsonb_typeof(p_accepted->'retryOrdinal')is distinct from 'number' or p_accepted->>'retryOrdinal'is distinct from '0'
 or jsonb_typeof(p_accepted->'isSameModelRepair')is distinct from 'boolean' or p_accepted->>'isSameModelRepair'is distinct from 'false'
 or jsonb_typeof(p_accepted->'fromCassette')is distinct from 'boolean' or p_accepted->>'fromCassette'is distinct from 'false'
 or jsonb_typeof(p_accepted->'usedProviderFallback')is distinct from 'boolean' or p_accepted->>'usedProviderFallback'is distinct from a.used_provider_fallback::text
 then raise exception 'capital_m07_accepted_invalid' using errcode='22023';end if;
 select * into accepted from private.capital_m07_accepted_invocations where organization_id=job.organization_id and recipe_id=recipe.id;
 if accepted.id is not null then
 if accepted.input_receipt_id<>claim.id or accepted.accepted_identity is distinct from p_accepted then raise exception 'capital_m07_accepted_conflict' using errcode='23505';end if;
 else
 insert into private.capital_m07_accepted_invocations(organization_id,work_id,job_id,recipe_id,input_receipt_id,invocation_id,output_fingerprint,accepted_identity)
 values(job.organization_id,a.work_id,job.id,recipe.id,claim.id,a.invocation_id,p_accepted->>'outputFingerprint',p_accepted)returning * into accepted;
 end if;
 perform private.capital_m07_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('acceptedInvocationId',accepted.id,'inputReceiptId',claim.id,'invocationId',accepted.invocation_id,'outputFingerprint',accepted.output_fingerprint);
end;$$;

-- Both orders forbid the old body-input endpoint from supplying a receipt for a
-- native invocation. The trigger also closes the same-job legacy path after seal.
create function private.guard_capital_m07_legacy_input_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipe private.capital_m07_recipes;
begin
 select * into recipe from private.capital_m07_recipes where organization_id=new.organization_id and job_id=new.job_id;
 if recipe.id is not null then
 if not pg_try_advisory_xact_lock(hashtextextended('capital-m07-recipe:'||recipe.organization_id::text||':'||recipe.id::text,0)) then raise exception 'capital_m07_processing_retry' using errcode='40001';end if;
 if exists(select 1 from private.capital_m07_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id)then raise exception 'capital_m07_legacy_input_denied' using errcode='42501';end if;
 end if;
 if exists(select 1 from private.capital_m07_gateway_attempts where organization_id=new.organization_id and invocation_id=new.invocation_id)then raise exception 'capital_m07_legacy_input_denied' using errcode='42501';end if;
 return new;
end;$$;
create trigger capital_m07_legacy_input_guard before insert on private.capital_body_invocation_inputs for each row execute function private.guard_capital_m07_legacy_input_v1();

create function public.worker_authorize_capital_m07_processing_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_authorize_capital_m07_processing_v1(p_job_id,p_capability_token,p_recipe_id,p_attempt,p_route,p_resources,p_purpose);$$;
create function public.worker_record_capital_m07_input_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_m07_input_v1(p_job_id,p_capability_token,p_attempt_receipt_id);$$;
create function public.worker_record_capital_m07_attempt_outcome_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid,p_outcome jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_m07_attempt_outcome_v1(p_job_id,p_capability_token,p_attempt_receipt_id,p_outcome);$$;
create function public.worker_record_capital_m07_accepted_v1(p_job_id uuid,p_capability_token text,p_input_receipt_id uuid,p_accepted jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_m07_accepted_v1(p_job_id,p_capability_token,p_input_receipt_id,p_accepted);$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
 and p.proname in ('capital_m07_attempt_outcome_fingerprint_v1','capital_m07_dispatch_policy_v1','lock_capital_m07_operation_v1','capital_m07_attempt_assurances_current_v1',
 'capital_m07_attempt_current_v1','capital_m07_attempt_dto_v1','guard_capital_m07_legacy_input_v1') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public')
 and p.proname in ('worker_authorize_capital_m07_processing_v1','worker_record_capital_m07_input_v1','worker_record_capital_m07_attempt_outcome_v1','worker_record_capital_m07_accepted_v1')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;
end;$$;

-- Concatenate AFTER capital_m07_execution_ledger.sql. This is not independently deployable.
set search_path='';
alter table private.capital_m07_body_bases add column accepted_invocation_id uuid,add column parent_retained_payload_id uuid,
 add constraint capital_m07_basis_accepted_fk foreign key(organization_id,accepted_invocation_id) references private.capital_m07_accepted_invocations(organization_id,id),
 add constraint capital_m07_basis_parent_fk foreign key(organization_id,parent_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 add constraint capital_m07_basis_derivation_check check((kind='context' and accepted_invocation_id is null and parent_retained_payload_id is null and semantic_fingerprint is null)
 or(kind='parsed' and accepted_invocation_id is not null and parent_retained_payload_id is null and semantic_fingerprint is not null)
 or(kind='final' and accepted_invocation_id is not null and parent_retained_payload_id is not null and semantic_fingerprint is not null));
create index capital_m07_basis_accepted_idx on private.capital_m07_body_bases(organization_id,accepted_invocation_id);
create index capital_m07_basis_parent_idx on private.capital_m07_body_bases(organization_id,parent_retained_payload_id);

create table private.capital_m07_native_bindings (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 recipe_id uuid not null,task_run_id uuid not null,accepted_invocation_id uuid not null,parsed_retained_payload_id uuid not null,final_retained_payload_id uuid not null,
 capital_artifact_id uuid not null,revision_id uuid not null,final_fingerprint text not null check(final_fingerprint~'^[a-f0-9]{64}$'),
 transformation_version text not null check(transformation_version='origination-senior-readout.transform.v1'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),unique(organization_id,revision_id),unique(organization_id,capital_artifact_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_m07_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references private.capital_m07_recipe_seals(organization_id,task_run_id),
 foreign key(organization_id,accepted_invocation_id) references private.capital_m07_accepted_invocations(organization_id,id),
 foreign key(organization_id,parsed_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,final_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,capital_artifact_id) references public.capital_project_artifacts(organization_id,id) deferrable initially deferred,
 foreign key(organization_id,revision_id) references public.artifact_revisions(organization_id,id) deferrable initially deferred
);
create index capital_m07_native_recipe_idx on private.capital_m07_native_bindings(organization_id,work_id,recipe_id);
create index capital_m07_native_accepted_idx on private.capital_m07_native_bindings(organization_id,accepted_invocation_id);
create index capital_m07_native_parsed_idx on private.capital_m07_native_bindings(organization_id,parsed_retained_payload_id);
create index capital_m07_native_final_idx on private.capital_m07_native_bindings(organization_id,final_retained_payload_id);
alter table private.capital_m07_native_bindings enable row level security;
alter table private.capital_m07_native_bindings force row level security;
revoke all on private.capital_m07_native_bindings from public,anon,authenticated,service_role;
create policy capital_m07_native_deny_select on private.capital_m07_native_bindings as restrictive for select to anon,authenticated using(false);
create policy capital_m07_native_deny_insert on private.capital_m07_native_bindings as restrictive for insert to anon,authenticated with check(false);
create policy capital_m07_native_deny_update on private.capital_m07_native_bindings as restrictive for update to anon,authenticated using(false) with check(false);
create policy capital_m07_native_deny_delete on private.capital_m07_native_bindings as restrictive for delete to anon,authenticated using(false);
create trigger capital_m07_native_immutable before update or delete on private.capital_m07_native_bindings for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_m07_native_no_truncate before truncate on private.capital_m07_native_bindings for each statement execute function private.reject_review_history_mutation_v1();
create trigger capital_m07_native_updated_at before update on private.capital_m07_native_bindings for each row execute function private.set_updated_at();
create trigger capital_m07_native_audit after insert on private.capital_m07_native_bindings for each row execute function private.capture_identity_audit_v1();



-- Every native read, review and derived read resolves this actual binding,
-- current private work authority, full licensed source bridge and physical body.
create function private.capital_m07_native_read_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_m07_native_bindings;a private.capital_public_payload_allocations;d timestamptz;r public.artifact_revisions;
begin
 select * into b from private.capital_m07_native_bindings where organization_id=p_org and revision_id=p_revision;
 if b.id is null then return true;end if;
 if not private.capital_body_subject_allowed_v1(p_org,b.work_id,p_actor) then return false;end if;
 select * into r from public.artifact_revisions where organization_id=p_org and id=p_revision;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=b.final_retained_payload_id;
 d:=private.capital_m07_allocation_deadline_v1(p_org,a.id,p_actor);
 if r.id is null or a.id is null or d is null or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=p_org and c.id=b.capital_artifact_id and c.status not in ('stale','superseded'))
 or r.content_sha256 is distinct from a.payload_fingerprint or r.byte_length is distinct from a.byte_length
 or not private.capital_body_physical_receipt_v1(p_org,b.final_retained_payload_id)
 or not private.capital_body_physical_receipt_v1(p_org,b.parsed_retained_payload_id)
 or not private.capital_body_retention_healthy_v1(a.policy_id,p_org,a.id) then return false;end if;
 return least(d,a.purge_at)>clock_timestamp();
end; $$;

create function private.read_capital_m07_result_v1(p_revision_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_m07_native_bindings;a private.capital_public_payload_allocations;d timestamptz;result jsonb;r public.artifact_revisions;
begin
 select * into b from private.capital_m07_native_bindings where revision_id=p_revision_id;
 select * into r from public.artifact_revisions where id=p_revision_id;
 if b.id is null or r.id is null or private.artifact_revision_release_v1(r)='blocked' or not private.capital_m07_native_read_allowed_v1(b.organization_id,b.revision_id,auth.uid()) then raise exception 'capital_m07_read_denied' using errcode='42501';end if;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=b.organization_id and q.id=b.final_retained_payload_id;
 d:=private.capital_m07_allocation_deadline_v1(b.organization_id,a.id,auth.uid());
 result:=jsonb_build_object('schemaVersion','capital-m07-read-scope.v1','revisionId',b.revision_id,'recipeId',b.recipe_id,'finalFingerprint',b.final_fingerprint,'retention',private.capital_m07_body_dto_v1(b.organization_id,a.id,d,true));
 if private.artifact_revision_release_v1(r)='blocked' or not private.capital_m07_native_read_allowed_v1(b.organization_id,b.revision_id,auth.uid()) then raise exception 'capital_m07_read_denied' using errcode='42501';end if;
 return result;
end; $$;

-- Close the historical M07 writer by actual TaskSpec, not a caller-selected
-- content schema. Its other task families keep the original function unchanged.
alter function private.worker_record_capital_project_artifact(uuid,text,uuid,text,text,text,text,jsonb,jsonb,jsonb) rename to worker_record_capital_project_artifact_pre_m07;
create function private.worker_record_capital_project_artifact(p_job_id uuid,p_capability_token text,p_task_run_id uuid,p_artifact_type text,
 p_schema_version text,p_status text,p_input_fingerprint text,p_content jsonb,p_evidence_refs jsonb default '[]',p_dependencies jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
begin
 if (p_artifact_type='meeting_brief' and j.payload->>'analysis_scope'='origination_thesis') or exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=j.organization_id and tr.id=p_task_run_id and pt.task_id='M07') then raise exception 'capital_m07_native_commit_required' using errcode='42501';end if;
 return private.worker_record_capital_project_artifact_pre_m07(p_job_id,p_capability_token,p_task_run_id,p_artifact_type,p_schema_version,p_status,p_input_fingerprint,p_content,p_evidence_refs,p_dependencies);
end; $$;
revoke all on function private.worker_record_capital_project_artifact_pre_m07(uuid,text,uuid,text,text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

alter function private.worker_finish_capital_project_task(uuid,text,uuid,text,jsonb,text,jsonb,jsonb,jsonb) rename to worker_finish_capital_project_task_pre_m07;
create function private.worker_finish_capital_project_task(p_job_id uuid,p_capability_token text,p_task_run_id uuid,p_status text,
 p_output_reference jsonb default null,p_output_fingerprint text default null,p_quality_results jsonb default '[]',p_usage jsonb default '{}',p_error jsonb default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
begin
 if p_status='failed' and exists(select 1 from private.capital_m07_recipe_seals z where z.organization_id=j.organization_id and z.task_run_id=p_task_run_id) then raise exception 'capital_m07_native_quality_required' using errcode='42501';end if;
 if p_status='succeeded' and exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=j.organization_id and tr.id=p_task_run_id and pt.task_id='M07') then raise exception 'capital_m07_native_commit_required' using errcode='42501';end if;
 return private.worker_finish_capital_project_task_pre_m07(p_job_id,p_capability_token,p_task_run_id,p_status,p_output_reference,p_output_fingerprint,p_quality_results,p_usage,p_error);
end; $$;
revoke all on function private.worker_finish_capital_project_task_pre_m07(uuid,text,uuid,text,jsonb,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

alter function private.project_legacy_artifact_revision_v1(text,uuid,uuid) rename to project_legacy_artifact_revision_pre_m07_v1;
create function private.project_legacy_artifact_revision_v1(p_table text,p_org uuid,p_row uuid)
returns integer language plpgsql security definer set search_path='' as $$
begin
 if p_table='capital_project_artifacts' and exists(select 1 from private.capital_m07_native_bindings b where b.organization_id=p_org and b.capital_artifact_id=p_row) then return 0;end if;
 return private.project_legacy_artifact_revision_pre_m07_v1(p_table,p_org,p_row);
end; $$;
revoke all on function private.project_legacy_artifact_revision_pre_m07_v1(text,uuid,uuid) from public,anon,authenticated,service_role;

-- Pre-accepted terminal execution failures cite only real server ledger rows.
create table private.capital_m07_execution_failures (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,
 recipe_id uuid not null,task_run_id uuid not null,reason text not null check(reason in ('model_attempts_exhausted','processing_denied','budget_denied','accepted_body_unavailable')),
 outcome_ids uuid[] not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_m07_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references private.capital_m07_recipe_seals(organization_id,task_run_id)
);
create index capital_m07_execution_failure_work_idx on private.capital_m07_execution_failures(organization_id,work_id,recipe_id);
alter table private.capital_m07_execution_failures enable row level security;
alter table private.capital_m07_execution_failures force row level security;
revoke all on private.capital_m07_execution_failures from public,anon,authenticated,service_role;
create trigger capital_m07_execution_failure_immutable before update or delete on private.capital_m07_execution_failures for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_m07_execution_failure_no_truncate before truncate on private.capital_m07_execution_failures for each statement execute function private.reject_review_history_mutation_v1();
create function private.worker_record_capital_m07_execution_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_reason text,p_outcome_ids uuid[] default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_m07_recipes:=private.require_capital_m07_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 seal private.capital_m07_recipe_seals;old private.capital_m07_execution_failures;actual uuid[];supplied uuid[];tr public.capital_project_task_runs;replayed boolean:=false;op private.capital_m07_operations;exposure numeric;dispatches integer;server_bound bigint;
begin
 if p_reason is null or p_reason not in ('model_attempts_exhausted','processing_denied','budget_denied','accepted_body_unavailable') or array_position(p_outcome_ids,null) is not null then raise exception 'capital_m07_execution_failure_invalid' using errcode='22023';end if;
 if (p_reason<>'accepted_body_unavailable' and(exists(select 1 from private.capital_m07_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id)
 or exists(select 1 from private.capital_m07_attempt_outcomes o join private.capital_m07_gateway_attempts a on a.organization_id=o.organization_id and a.id=o.attempt_id where a.organization_id=r.organization_id and a.recipe_id=r.id and o.outcome='accepted')))
 or exists(select 1 from private.capital_m07_native_bindings where organization_id=r.organization_id and recipe_id=r.id)
 or exists(select 1 from private.capital_m07_quality_failures where organization_id=r.organization_id and recipe_id=r.id) then raise exception 'capital_m07_execution_failure_proof_denied' using errcode='42501';end if;
 select coalesce(array_agg(o.id order by o.id),'{}'::uuid[]) into actual from private.capital_m07_attempt_outcomes o join private.capital_m07_gateway_attempts a on a.organization_id=o.organization_id and a.id=o.attempt_id where a.organization_id=r.organization_id and a.recipe_id=r.id;
 if p_outcome_ids is null then supplied:=actual;else select coalesce(array_agg(v order by v),'{}'::uuid[]) into supplied from unnest(p_outcome_ids) v;end if;
 if actual is distinct from supplied or(p_reason='model_attempts_exhausted' and(cardinality(actual)=0 or not exists(select 1 from private.capital_m07_gateway_attempts a join private.capital_m07_attempt_outcomes o on o.organization_id=a.organization_id and o.attempt_id=a.id where a.organization_id=r.organization_id and a.recipe_id=r.id and a.used_provider_fallback and o.outcome<>'accepted')))
 or(p_reason='processing_denied' and(cardinality(actual)<>0 or not exists(select 1 from private.capital_m07_gateway_attempts a where a.organization_id=r.organization_id and a.recipe_id=r.id and not a.allowed and not a.used_provider_fallback) or not exists(select 1 from private.capital_m07_gateway_attempts a where a.organization_id=r.organization_id and a.recipe_id=r.id and not a.allowed and a.used_provider_fallback))) then raise exception 'capital_m07_execution_failure_proof_denied' using errcode='42501';end if;
 if p_reason='accepted_body_unavailable' and(not exists(select 1 from private.capital_m07_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id)
 or exists(select 1 from private.capital_m07_body_bases b join private.capital_public_payload_allocations a on a.organization_id=b.organization_id and a.m07_body_basis_id=b.id join private.capital_public_retained_payloads q on q.organization_id=a.organization_id and q.allocation_id=a.id where b.organization_id=r.organization_id and b.recipe_id=r.id and b.kind='parsed' and private.capital_body_physical_receipt_v1(q.organization_id,q.id))) then raise exception 'capital_m07_execution_failure_proof_denied' using errcode='42501';end if;
 if p_reason='budget_denied' then
 select * into op from private.capital_m07_operations where organization_id=r.organization_id and recipe_id=r.id;
 select count(*),coalesce(sum(greatest(d.server_reservation_micro_usd,coalesce(o.cost_micro_usd,d.server_reservation_micro_usd))),0) into dispatches,exposure from private.capital_m07_input_dispatches d left join private.capital_m07_attempt_outcomes o on o.organization_id=d.organization_id and o.input_receipt_id=d.id where d.organization_id=r.organization_id and d.operation_id=op.id;
 select case when dispatches=0 then least((private.capital_m07_dispatch_policy_v1('gpt-5.6-sol',100000)->>'serverBoundMicroUsd')::bigint,(private.capital_m07_dispatch_policy_v1('gpt-5.6-terra',100000)->>'serverBoundMicroUsd')::bigint) else(private.capital_m07_dispatch_policy_v1('gpt-5.6-terra',100000)->>'serverBoundMicroUsd')::bigint end into server_bound;
 if not exists(select 1 from private.capital_m07_recipe_seals z where z.organization_id=r.organization_id and z.recipe_id=r.id and(dispatches>=z.effective_max_dispatches or exposure+server_bound>z.effective_budget_micro_usd)) then raise exception 'capital_m07_execution_failure_proof_denied' using errcode='42501';end if;
 end if;
 select * into strict seal from private.capital_m07_recipe_seals where organization_id=r.organization_id and recipe_id=r.id;
 select * into old from private.capital_m07_execution_failures where organization_id=r.organization_id and recipe_id=r.id;
 if old.id is not null then
 if (old.reason,old.outcome_ids) is distinct from(p_reason,supplied) then raise exception 'capital_m07_execution_failure_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 select * into tr from public.capital_project_task_runs where organization_id=r.organization_id and id=seal.task_run_id for update;
 if tr.status is distinct from 'running' then raise exception 'capital_m07_execution_failure_task_denied' using errcode='42501';end if;
 insert into private.capital_m07_execution_failures(organization_id,work_id,recipe_id,task_run_id,reason,outcome_ids) values(r.organization_id,r.work_id,r.id,seal.task_run_id,p_reason,supplied) returning * into old;
 update public.capital_project_task_runs set status='failed',completed_at=clock_timestamp(),quality_results='[]',error=jsonb_build_object('code','capital_m07_execution_failed','reason',p_reason),usage='{}',output_reference=null,output_fingerprint=null where organization_id=r.organization_id and id=tr.id;
 end if;
 perform private.require_capital_m07_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 return jsonb_build_object('schemaVersion','capital-m07-execution-failure-receipt.v1','recipeId',r.id,'taskRunId',seal.task_run_id,'reason',old.reason,'outcomeIds',to_jsonb(old.outcome_ids),'replayed',replayed);
end; $$;

-- Terminal quality failures are native history, never a reusable execution grant.
create table private.capital_m07_quality_failures (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,
 recipe_id uuid not null,task_run_id uuid not null,accepted_invocation_id uuid not null,
 parsed_retained_payload_id uuid not null,final_retained_payload_id uuid not null,
 final_fingerprint text not null check(final_fingerprint~'^[a-f0-9]{64}$'),quality_results jsonb not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_m07_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references private.capital_m07_recipe_seals(organization_id,task_run_id),
 foreign key(organization_id,accepted_invocation_id) references private.capital_m07_accepted_invocations(organization_id,id),
 foreign key(organization_id,parsed_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,final_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index capital_m07_quality_work_recipe_idx on private.capital_m07_quality_failures(organization_id,work_id,recipe_id);
create index capital_m07_quality_accepted_idx on private.capital_m07_quality_failures(organization_id,accepted_invocation_id);
create index capital_m07_quality_parsed_idx on private.capital_m07_quality_failures(organization_id,parsed_retained_payload_id);
create index capital_m07_quality_final_idx on private.capital_m07_quality_failures(organization_id,final_retained_payload_id);
alter table private.capital_m07_quality_failures enable row level security;
alter table private.capital_m07_quality_failures force row level security;
revoke all on private.capital_m07_quality_failures from public,anon,authenticated,service_role;
create trigger capital_m07_quality_immutable before update or delete on private.capital_m07_quality_failures for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_m07_quality_no_truncate before truncate on private.capital_m07_quality_failures for each statement execute function private.reject_review_history_mutation_v1();

create function private.capital_m07_quality_failure_dto_v1(p_org uuid,p_recipe uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-m07-quality-failure.v1','acceptedInvocationId',q.accepted_invocation_id,
 'parsedRetainedPayloadId',q.parsed_retained_payload_id,'finalRetainedPayloadId',q.final_retained_payload_id,'finalFingerprint',q.final_fingerprint,'qualityResults',q.quality_results)
 from private.capital_m07_quality_failures q where q.organization_id=p_org and q.recipe_id=p_recipe;
$$;

create function private.worker_record_capital_m07_quality_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,
 p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_m07_recipes:=private.require_capital_m07_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 seal private.capital_m07_recipe_seals;old private.capital_m07_quality_failures;ok private.capital_m07_accepted_invocations;
 pb private.capital_m07_body_bases;fb private.capital_m07_body_bases;pa private.capital_public_payload_allocations;fa private.capital_public_payload_allocations;tr public.capital_project_task_runs;
begin
 if jsonb_typeof(p_quality_results) is distinct from 'array' or jsonb_array_length(p_quality_results)<>9
 or exists(select 1 from jsonb_array_elements(p_quality_results) q where jsonb_typeof(q) is distinct from 'object' or not(q?&array['id','passed']) or q-array['id','passed']<>'{}' or jsonb_typeof(q->'passed') is distinct from 'boolean')
 or not exists(select 1 from jsonb_array_elements(p_quality_results) q where q->'passed'='false'::jsonb)
 or exists(select 1 from unnest(array['schema','citation_allowlist','citation_coverage','uncertainty','forward_case_governance','unsupported_material_numbers','official_financial_coverage','debt_amount_units','scope_boundary']) k where(select count(*) from jsonb_array_elements(p_quality_results) q where q->>'id'=k)<>1)
 then raise exception 'capital_m07_quality_failure_invalid' using errcode='22023';end if;
 select * into strict seal from private.capital_m07_recipe_seals where organization_id=r.organization_id and recipe_id=r.id;
 select * into ok from private.capital_m07_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id and id=p_accepted_invocation_id;
 select x.* into pa from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=r.organization_id and q.id=p_parsed_retained_payload_id and x.content_kind='m07_body';
 select x.* into fa from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=r.organization_id and q.id=p_final_retained_payload_id and x.content_kind='m07_body';
 select * into pb from private.capital_m07_body_bases where organization_id=r.organization_id and id=pa.m07_body_basis_id;
 select * into fb from private.capital_m07_body_bases where organization_id=r.organization_id and id=fa.m07_body_basis_id;
 if ok.id is null or pb.kind is distinct from 'parsed' or fb.kind is distinct from 'final' or pb.recipe_id is distinct from r.id or fb.recipe_id is distinct from r.id
 or pb.accepted_invocation_id is distinct from ok.id or fb.accepted_invocation_id is distinct from ok.id or fb.parent_retained_payload_id is distinct from p_parsed_retained_payload_id
 or pb.semantic_fingerprint is distinct from ok.output_fingerprint or fb.semantic_fingerprint is distinct from p_final_fingerprint
 or not private.capital_body_physical_receipt_v1(r.organization_id,p_parsed_retained_payload_id) or not private.capital_body_physical_receipt_v1(r.organization_id,p_final_retained_payload_id)
 or private.capital_m07_allocation_deadline_v1(r.organization_id,pa.id,r.human_subject_id) is null or private.capital_m07_allocation_deadline_v1(r.organization_id,fa.id,r.human_subject_id) is null
 then raise exception 'capital_m07_quality_failure_proof_denied' using errcode='42501';end if;
 select * into old from private.capital_m07_quality_failures where organization_id=r.organization_id and recipe_id=r.id;
 if old.id is not null then
 if (old.accepted_invocation_id,old.parsed_retained_payload_id,old.final_retained_payload_id,old.final_fingerprint,old.quality_results) is distinct from(p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results) then raise exception 'capital_m07_quality_failure_conflict' using errcode='23505';end if;
 return jsonb_build_object('schemaVersion','capital-m07-quality-failure-receipt.v1','recipeId',r.id,'taskRunId',seal.task_run_id,'qualityFailure',private.capital_m07_quality_failure_dto_v1(r.organization_id,r.id),'replayed',true);
 end if;
 select * into tr from public.capital_project_task_runs where organization_id=r.organization_id and id=seal.task_run_id for update;
 if tr.status is distinct from 'running' or exists(select 1 from private.capital_m07_native_bindings where organization_id=r.organization_id and recipe_id=r.id) then raise exception 'capital_m07_quality_failure_task_denied' using errcode='42501';end if;
 insert into private.capital_m07_quality_failures(organization_id,work_id,recipe_id,task_run_id,accepted_invocation_id,parsed_retained_payload_id,final_retained_payload_id,final_fingerprint,quality_results)
 values(r.organization_id,r.work_id,r.id,seal.task_run_id,ok.id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results);
 update public.capital_project_task_runs set status='failed',completed_at=clock_timestamp(),quality_results=p_quality_results,error=jsonb_build_object('code','capital_m07_quality_failed'),usage='{}',output_reference=null,output_fingerprint=null where organization_id=r.organization_id and id=tr.id;
 perform private.require_capital_m07_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 return jsonb_build_object('schemaVersion','capital-m07-quality-failure-receipt.v1','recipeId',r.id,'taskRunId',seal.task_run_id,'qualityFailure',private.capital_m07_quality_failure_dto_v1(r.organization_id,r.id),'replayed',false);
end; $$;

-- Explicit API denial policies and metadata-only audit match the stage contract.
do $$declare t text;op text;begin
 foreach t in array array['capital_m07_quality_failures','capital_m07_execution_failures'] loop
 foreach op in array array['select','insert','update','delete'] loop
 execute format('create policy %I on private.%I as restrictive for %s to anon,authenticated %s',t||'_deny_'||op,t,op,case when op='insert' then 'with check(false)' when op='update' then 'using(false) with check(false)' else 'using(false)' end);
 end loop;
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end;$$;

create function private.capital_m07_commit_result_core_v1(p_org uuid,p_recipe uuid,p_accepted uuid,p_parsed uuid,p_final uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_m07_recipes;s private.capital_m07_recipe_seals;b private.capital_m07_native_bindings;ok private.capital_m07_accepted_invocations;
 parsed private.capital_public_payload_allocations;final private.capital_public_payload_allocations;pb private.capital_m07_body_bases;fb private.capital_m07_body_bases;
 tr public.capital_project_task_runs;a public.artifacts;head public.artifact_revisions;manifest jsonb;projection jsonb;fp text;
 rid uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();version integer;deps jsonb;receipt uuid;ref jsonb;stamp timestamptz:=clock_timestamp();deadline timestamptz;
begin
 if jsonb_typeof(p_quality_results) is distinct from 'array' or jsonb_array_length(p_quality_results)<>9
 or exists(select 1 from jsonb_array_elements(p_quality_results) q where jsonb_typeof(q) is distinct from 'object' or not(q?&array['id','passed']) or q-array['id','passed']<>'{}' or q->'passed' is distinct from 'true'::jsonb)
 or exists(select 1 from unnest(array['schema','citation_allowlist','citation_coverage','uncertainty','forward_case_governance','unsupported_material_numbers','official_financial_coverage','debt_amount_units','scope_boundary']) k where(select count(*) from jsonb_array_elements(p_quality_results) q where q->>'id'=k)<>1) then raise exception 'capital_m07_quality_denied' using errcode='42501';end if;
 select * into strict r from private.capital_m07_recipes where organization_id=p_org and id=p_recipe;
 select * into strict s from private.capital_m07_recipe_seals where organization_id=p_org and recipe_id=r.id;
 if exists(select 1 from private.capital_m07_quality_failures where organization_id=p_org and recipe_id=r.id) or exists(select 1 from private.capital_m07_execution_failures where organization_id=p_org and recipe_id=r.id) then raise exception 'capital_m07_quality_failed_terminal' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-m07-recipe:'||p_org::text||':'||r.id::text,0)) then raise exception 'capital_m07_retry' using errcode='40001';end if;
 select * into ok from private.capital_m07_accepted_invocations where organization_id=p_org and recipe_id=r.id and id=p_accepted;
 select x.* into parsed from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=p_parsed and x.content_kind='m07_body';
 select x.* into final from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=p_final and x.content_kind='m07_body';
 select * into pb from private.capital_m07_body_bases where organization_id=p_org and id=parsed.m07_body_basis_id;
 select * into fb from private.capital_m07_body_bases where organization_id=p_org and id=final.m07_body_basis_id;
 if ok.id is null or pb.kind is distinct from 'parsed' or fb.kind is distinct from 'final' or pb.recipe_id<>r.id or fb.recipe_id<>r.id
 or pb.accepted_invocation_id<>ok.id or fb.accepted_invocation_id<>ok.id or fb.parent_retained_payload_id is distinct from p_parsed
 or pb.semantic_fingerprint<>ok.output_fingerprint or fb.semantic_fingerprint is distinct from p_final_fingerprint
 or not private.capital_body_physical_receipt_v1(p_org,p_parsed) or not private.capital_body_physical_receipt_v1(p_org,p_final) then raise exception 'capital_m07_commit_proof_denied' using errcode='42501';end if;
 deadline:=private.capital_m07_recipe_deadline_v1(p_org,r.id,r.human_subject_id);
 if deadline is null or least(deadline,parsed.purge_at,final.purge_at)<=clock_timestamp() or not private.capital_body_retention_healthy_v1(final.policy_id,p_org,final.id) then raise exception 'capital_m07_retention_denied' using errcode='42501';end if;
 select * into b from private.capital_m07_native_bindings where organization_id=p_org and recipe_id=r.id;
 if b.id is not null then
 if b.accepted_invocation_id<>p_accepted or b.parsed_retained_payload_id<>p_parsed or b.final_retained_payload_id<>p_final or b.final_fingerprint<>p_final_fingerprint then raise exception 'capital_m07_commit_conflict' using errcode='23505';end if;
 return jsonb_build_object('schemaVersion','capital-m07-commit-receipt.v1','recipeId',r.id,'taskRunId',s.task_run_id,'capitalArtifactId',b.capital_artifact_id,'revisionId',b.revision_id,'finalFingerprint',b.final_fingerprint,'artifactFingerprint',(select artifact_fingerprint from public.capital_project_artifacts where organization_id=p_org and id=b.capital_artifact_id),'artifactVersion',(select artifact_version from public.capital_project_artifacts where organization_id=p_org and id=b.capital_artifact_id),'replayed',true);
 end if;
 select * into tr from public.capital_project_task_runs where organization_id=p_org and id=s.task_run_id for update;
 if tr.status<>'running' or tr.processing_job_id<>r.job_id or tr.input_fingerprint<>s.reconstruction_fingerprint or tr.plan_id<>r.plan_id then raise exception 'capital_m07_task_denied' using errcode='42501';end if;
 if exists(select 1 from private.capital_m07_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=p_org and c.recipe_id=r.id and c.slot='dependency' and(d.status in ('stale','superseded') or d.artifact_version<>c.version)) then raise exception 'capital_m07_dependency_denied' using errcode='42501';end if;
 -- Both writers serialize the same plan/work identity. A reviewed current product
 -- can only be replaced after the existing explicit invalidation command.
 perform 1 from public.capital_project_plans where organization_id=p_org and id=r.plan_id for update;
 if exists(select 1 from public.capital_project_artifacts where organization_id=p_org and capital_project_id=r.work_id and artifact_type='meeting_brief' and status in ('confirmed','approved')) then raise exception 'capital_artifact_confirmed_requires_invalidation' using errcode='42501';end if;
 select coalesce(max(artifact_version),0)+1 into version from public.capital_project_artifacts where organization_id=p_org and capital_project_id=r.work_id and artifact_type='meeting_brief';
 select * into a from public.artifacts where organization_id=p_org and work_id=r.work_id and kind='work_product' and subject='M07 meeting brief' for update;
 if a.id is null then insert into public.artifacts(organization_id,work_id,kind,subject) values(p_org,r.work_id,'work_product','M07 meeting brief') returning * into a;end if;
 select * into head from public.artifact_revisions where organization_id=p_org and id=a.head_revision_id;
 manifest:=jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind','work_product','audience','internal','format','json',
 'bytes',jsonb_build_object('sha256',final.payload_fingerprint,'byteLength',final.byte_length,'storage',jsonb_build_object('bucket',final.bucket_id,'path',final.object_path)),
 'method',null,'execution',null,'inputSnapshot',jsonb_build_object('fingerprint',s.reconstruction_fingerprint),'institutionalResult',null,
 'sources','[]'::jsonb,'claims','[]'::jsonb,'traces',jsonb_build_array('capital-m07-recipe:'||r.id::text,'capital-m07-accepted:'||ok.id::text),
 'template',null,'provenance',jsonb_build_object('producer','capital-m07-native-producer.v1','jobId',r.job_id,'taskRunId',s.task_run_id,'messageId',null,'capability',null),'legacy',null);
 perform private.validate_artifact_manifest_v1(manifest);
 projection:=jsonb_build_object('schemaVersion','capital-m07-projection.v1','revisionId',rid,'recipeId',r.id,'finalFingerprint',p_final_fingerprint,'physicalSha256',final.payload_fingerprint,'byteLength',final.byte_length);
 fp:=encode(extensions.digest(projection::text,'sha256'),'hex');
 select coalesce(jsonb_agg(jsonb_build_object('artifactId',dependency_artifact_id,'artifactFingerprint',d.artifact_fingerprint) order by c.component_no),'[]') into deps from private.capital_m07_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=p_org and c.recipe_id=r.id and c.slot='dependency';
 -- Deferred exact FKs allow the trigger to see real native authority, never a
 -- caller-controlled schema marker, before inserting CPA and revision.
 insert into private.capital_m07_native_bindings(organization_id,work_id,recipe_id,task_run_id,accepted_invocation_id,parsed_retained_payload_id,final_retained_payload_id,capital_artifact_id,revision_id,final_fingerprint,transformation_version)
 values(p_org,r.work_id,r.id,s.task_run_id,ok.id,p_parsed,p_final,aid,rid,p_final_fingerprint,'origination-senior-readout.transform.v1') returning * into b;
 update public.capital_project_artifacts set status='superseded',superseded_at=stamp where organization_id=p_org and capital_project_id=r.work_id and artifact_type='meeting_brief' and status in ('draft','pending_confirmation');
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,evidence_refs,dependencies,processing_job_id,created_by_kind)
 values(aid,p_org,r.work_id,r.plan_id,s.task_run_id,'meeting_brief','capital-m07-projection.v1',version,'pending_confirmation',s.reconstruction_fingerprint,fp,projection,'[]',deps,r.job_id,'worker');
 insert into public.artifact_revisions(id,organization_id,artifact_id,revision_no,previous_revision_id,audience,origin,manifest,manifest_fingerprint,content_sha256,byte_length)
 values(rid,p_org,a.id,coalesce(head.revision_no,0)+1,head.id,'internal','worker',manifest,encode(extensions.digest(manifest::text,'sha256'),'hex'),final.payload_fingerprint,final.byte_length);
 insert into public.artifact_blocks(organization_id,revision_id,block_no,block_key,kind,content,claims,content_fingerprint) values(p_org,rid,1,'m07-result','section',projection,'[]',fp);
 update public.artifacts set head_revision_id=rid where organization_id=p_org and id=a.id;
 ref:=jsonb_build_object('artifactRevisionId',rid,'manifestFingerprint',encode(extensions.digest(manifest::text,'sha256'),'hex'));
 insert into private.review_basis_receipts(organization_id,work_id,basis_kind,basis_reference,reference_fingerprint,source_count,producer)
 values(p_org,r.work_id,'artifact_revision',ref,encode(extensions.digest(ref::text,'sha256'),'hex'),(select count(*) from private.capital_m07_recipe_components where organization_id=p_org and recipe_id=r.id and slot='source'),'capital-m07-native-producer.v1') returning id into receipt;
 update public.capital_project_task_runs set status='succeeded',completed_at=stamp,output_reference=jsonb_build_object('type','capital_project_artifact','id',aid,'revisionId',rid),output_fingerprint=fp,
 quality_results=p_quality_results,usage='{}',error=null
 where organization_id=p_org and id=s.task_run_id;
 if private.capital_m07_recipe_deadline_v1(p_org,r.id,r.human_subject_id) is null or least(deadline,parsed.purge_at,final.purge_at)<=clock_timestamp() then raise exception 'capital_m07_retention_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-m07-commit-receipt.v1','recipeId',r.id,'taskRunId',s.task_run_id,'capitalArtifactId',aid,'revisionId',rid,'finalFingerprint',p_final_fingerprint,'artifactFingerprint',fp,'artifactVersion',version,'replayed',false);
end; $$;

create function private.worker_commit_capital_m07_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,
 p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_m07_recipes:=private.require_capital_m07_recipe_v1(p_job_id,p_capability_token,p_recipe_id);result jsonb;
begin
 result:=private.capital_m07_commit_result_core_v1(r.organization_id,r.id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results);
 if not private.capital_public_capture_clock_current_v1(p_job_id,p_capability_token) then raise exception 'capital_m07_denied' using errcode='42501';end if;
 return result;
end; $$;

-- MIN inheritance includes the parsed object itself, not just its recipe's
-- licensed sources. Purged/changed parent bytes deny the derivative immediately.
create or replace function private.capital_m07_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;b private.capital_m07_body_bases;d timestamptz;parent private.capital_public_payload_allocations;pb private.capital_m07_body_bases;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='m07_body';
 select * into b from private.capital_m07_body_bases where organization_id=p_org and id=a.m07_body_basis_id;
 if b.id is null then return null;end if;
 d:=private.capital_m07_recipe_deadline_v1(p_org,b.recipe_id,p_subject);
 if d is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 if b.kind='final' then
 select x.* into parent from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=b.parent_retained_payload_id and x.content_kind='m07_body';
 select * into pb from private.capital_m07_body_bases where organization_id=p_org and id=parent.m07_body_basis_id;
 if pb.kind is distinct from 'parsed' or pb.recipe_id is distinct from b.recipe_id or pb.accepted_invocation_id is distinct from b.accepted_invocation_id
 or not private.capital_body_physical_receipt_v1(p_org,b.parent_retained_payload_id)
 or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=parent.id and q.status='pending') then return null;end if;
 d:=least(d,parent.expires_at,parent.purge_at);
 end if;
 return case when least(d,a.expires_at,a.purge_at)>clock_timestamp() then least(d,a.expires_at) end;
end; $$;

-- A successor may read immutable retained bytes, but its grant never authorizes
-- model dispatch and never re-labels the recipe's original job or time.
create function private.worker_recover_capital_m07_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_m07_recipes;s private.capital_m07_recipe_seals;
 b private.capital_m07_native_bindings;ok private.capital_m07_accepted_invocations;parsed jsonb;final jsonb;a private.capital_public_payload_allocations;state text;d timestamptz;
begin
 select * into r from private.capital_m07_recipes where organization_id=j.organization_id and id=p_recipe_id and work_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid);
 if r.id is null or (r.plan_id,r.brief_id,r.revision_decision_id) is distinct from ((j.payload->>'capital_project_plan_id')::uuid,(j.payload->>'capital_project_brief_id')::uuid,(j.payload->>'correction_decision_id')::uuid) or not private.capital_body_subject_allowed_v1(j.organization_id,r.work_id,j.authorization_subject_id) then raise exception 'capital_m07_recovery_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-m07-recipe:'||j.organization_id::text||':'||r.id::text,0)) then raise exception 'capital_m07_retry' using errcode='40001';end if;
 d:=private.capital_m07_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 select * into s from private.capital_m07_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if d is null or s.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,s.context_retained_payload_id) then raise exception 'capital_m07_recovery_denied' using errcode='42501';end if;
 select * into ok from private.capital_m07_accepted_invocations where organization_id=j.organization_id and recipe_id=r.id;
 select * into b from private.capital_m07_native_bindings where organization_id=j.organization_id and recipe_id=r.id;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id join private.capital_m07_body_bases z on z.organization_id=x.organization_id and z.id=x.m07_body_basis_id where q.organization_id=j.organization_id and z.recipe_id=r.id and z.accepted_invocation_id=ok.id and z.kind='parsed' and q.id=coalesce((select f.parsed_retained_payload_id from private.capital_m07_quality_failures f where f.organization_id=j.organization_id and f.recipe_id=r.id),q.id) order by q.created_at limit 1;
 if a.id is not null and private.capital_body_physical_receipt_v1(j.organization_id,(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id)) and private.capital_m07_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is not null then parsed:=private.capital_m07_body_dto_v1(j.organization_id,a.id,d,true);end if;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id join private.capital_m07_body_bases z on z.organization_id=x.organization_id and z.id=x.m07_body_basis_id where q.organization_id=j.organization_id and z.recipe_id=r.id and z.accepted_invocation_id=ok.id and z.kind='final' and q.id=coalesce((select f.final_retained_payload_id from private.capital_m07_quality_failures f where f.organization_id=j.organization_id and f.recipe_id=r.id),q.id) order by q.created_at limit 1;
 if a.id is not null and private.capital_body_physical_receipt_v1(j.organization_id,(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id)) and private.capital_m07_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is not null then final:=private.capital_m07_body_dto_v1(j.organization_id,a.id,d,true);end if;
 state:=case when exists(select 1 from private.capital_m07_execution_failures q where q.organization_id=j.organization_id and q.recipe_id=r.id) then 'unresolved' when exists(select 1 from private.capital_m07_quality_failures q where q.organization_id=j.organization_id and q.recipe_id=r.id) then 'quality_failed' when b.id is not null then 'committed' when final is not null then 'commit' when parsed is not null then 'transform' else 'unresolved' end;
 if state='quality_failed' and(parsed is null or final is null or not exists(select 1 from public.capital_project_task_runs tr join private.capital_m07_quality_failures q on q.organization_id=tr.organization_id and q.task_run_id=tr.id where q.organization_id=j.organization_id and q.recipe_id=r.id and tr.status='failed' and tr.quality_results=q.quality_results and tr.error=jsonb_build_object('code','capital_m07_quality_failed'))) then raise exception 'capital_m07_recovery_denied' using errcode='42501';end if;
 if b.id is not null and not private.capital_m07_native_read_allowed_v1(j.organization_id,b.revision_id,j.authorization_subject_id) then raise exception 'capital_m07_recovery_denied' using errcode='42501';end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_m07_recovery_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-m07-recovery-grant.v1','mode','recovery','state',state,'recipeId',r.id,'originalJobId',r.job_id,'authorizedJobId',j.id,
 'organizationId',j.organization_id,'workId',r.work_id,'taskRunId',s.task_run_id,'recipe',private.capital_m07_recipe_dto_v1(j.organization_id,r.id),
 'requestPins',jsonb_build_object('schemaVersion','capital-m07-reconstruction-pins.v1','promptFingerprint',s.prompt_fingerprint,'primaryRequestFingerprint',s.primary_request_fingerprint,'fallbackRequestFingerprint',s.fallback_request_fingerprint),
 'qualityFailure',private.capital_m07_quality_failure_dto_v1(j.organization_id,r.id),
 'reconstructionMetadata',jsonb_build_object('schemaVersion','capital-m07-reconstruction-metadata.v1','originalAttempt',r.original_attempt,'researchStatus',s.research_status,'dependencies',(select coalesce(jsonb_agg(jsonb_build_object('id',c.reference_id,'artifactFingerprint',d.artifact_fingerprint) order by c.component_no),'[]') from private.capital_m07_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=j.organization_id and c.recipe_id=r.id and c.slot='dependency')),
 'accepted',case when ok.id is null then null else jsonb_build_object('acceptedInvocationId',ok.id,'inputReceiptId',ok.input_receipt_id,'invocationId',ok.invocation_id,'outputFingerprint',ok.output_fingerprint,'provider',ok.accepted_identity->>'provider','reportedModel',ok.accepted_identity->>'reportedModel') end,
 'context',(select private.capital_m07_body_dto_v1(j.organization_id,x.id,d,true) from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=s.context_retained_payload_id),'sources',(select coalesce(jsonb_agg(jsonb_build_object('deliveryId',reference_id,'retainedPayloadId',retained_payload_id) order by component_no),'[]') from private.capital_m07_recipe_components where organization_id=j.organization_id and recipe_id=r.id and slot='source'),
 'parsed',parsed,'final',final,'revisionId',b.revision_id,'capitalArtifactId',b.capital_artifact_id,'expiresAt',d,'dispatchAllowed',false);
end; $$;

create function private.capital_m07_native_ancestry_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare rev uuid;
begin
 for rev in with recursive ancestry(id,path,depth) as(select p_revision,array[p_revision],0 union all select l.derived_from_revision_id,a.path||l.derived_from_revision_id,a.depth+1 from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision' where a.depth<64 and not l.derived_from_revision_id=any(a.path)) select distinct id from ancestry loop
 if not private.capital_m07_native_read_allowed_v1(p_org,rev,p_actor) then return false;end if;
 end loop;
 -- Refuse when depth bound cannot prove the full ancestry; no silent truncation.
 if exists(with recursive ancestry(id,path,depth) as(select p_revision,array[p_revision],0 union all select l.derived_from_revision_id,a.path||l.derived_from_revision_id,a.depth+1 from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision' where a.depth<64 and not l.derived_from_revision_id=any(a.path)) select 1 from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision' where a.depth=64 and not l.derived_from_revision_id=any(a.path)) then return false;end if;
 return true;
end; $$;

alter function private.artifact_review_sources_allowed_v1(uuid,uuid,uuid) rename to artifact_review_sources_allowed_pre_m07_v1;
create function private.artifact_review_sources_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if not private.capital_m07_native_ancestry_allowed_v1(p_org,p_revision,p_actor) then return false;end if;
 if not private.artifact_review_sources_allowed_pre_m07_v1(p_org,p_revision,p_actor) then return false;end if;
 return private.capital_m07_native_ancestry_allowed_v1(p_org,p_revision,p_actor);
end; $$;

alter function private.review_basis_receipt_authority_v1(uuid,uuid,text,jsonb,uuid) rename to review_basis_receipt_authority_pre_m07_v1;
create function private.review_basis_receipt_authority_v1(p_org uuid,p_work uuid,p_kind text,p_reference jsonb,p_actor uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare receipt private.review_basis_receipts;b private.capital_m07_native_bindings;
begin
 select * into receipt from private.review_basis_receipts where organization_id=p_org and work_id=p_work and basis_kind=p_kind and basis_reference=p_reference and reference_fingerprint=encode(extensions.digest(p_reference::text,'sha256'),'hex');
 if receipt.producer is distinct from 'capital-m07-native-producer.v1' then return private.review_basis_receipt_authority_pre_m07_v1(p_org,p_work,p_kind,p_reference,p_actor);end if;
 select * into b from private.capital_m07_native_bindings where organization_id=p_org and work_id=p_work and revision_id=(p_reference->>'artifactRevisionId')::uuid;
 if b.id is null or p_kind<>'artifact_revision' or receipt.source_count<>(select count(*) from private.capital_m07_recipe_components where organization_id=p_org and recipe_id=b.recipe_id and slot='source') then return 'unresolved';end if;
 if not private.capital_m07_native_ancestry_allowed_v1(p_org,b.revision_id,p_actor) then return 'denied';end if;
 return 'allowed';
end; $$;

alter function private.read_artifact_revision_v1(uuid) rename to read_artifact_revision_pre_m07_v1;
create function private.read_artifact_revision_v1(p_revision uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r public.artifact_revisions;result jsonb;
begin
 select * into r from public.artifact_revisions where id=p_revision;
 result:=private.read_artifact_revision_pre_m07_v1(p_revision);
 if not private.capital_m07_native_ancestry_allowed_v1(r.organization_id,r.id,auth.uid()) then
 result:=jsonb_set(jsonb_set(jsonb_set(result,'{blocks}','[]'),'{revision,manifest}', 'null'),'{restriction}',jsonb_build_object('kind','source_rights','linkIds','[]'::jsonb,'unresolvedRevisionIds',jsonb_build_array(r.id)));
 end if;
 return result;
end; $$;

create function private.wake_capital_m07_retention_v1() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;org uuid:=(row_data->>'organization_id')::uuid;allocation uuid;
begin
 if tg_table_name='capital_project_artifacts' then
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_m07_body_bases b on b.organization_id=a.organization_id and b.id=a.m07_body_basis_id
 where a.organization_id=org and b.recipe_id in(select recipe_id from private.capital_m07_recipe_components where organization_id=org and dependency_artifact_id=(row_data->>'id')::uuid union select recipe_id from private.capital_m07_native_bindings where organization_id=org and capital_artifact_id=(row_data->>'id')::uuid);
 elsif tg_table_name='capital_public_payload_purge_queue' then
 allocation:=(row_data->>'allocation_id')::uuid;
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_m07_body_bases b on b.organization_id=a.organization_id and b.id=a.m07_body_basis_id
 where a.organization_id=org and b.recipe_id in(
 select c.recipe_id from private.capital_m07_recipe_components c join private.capital_public_retained_payloads p on p.organization_id=c.organization_id and p.id=c.retained_payload_id where c.organization_id=org and p.allocation_id=allocation
 union select b0.recipe_id from private.capital_public_payload_allocations a0 join private.capital_m07_body_bases b0 on b0.organization_id=a0.organization_id and b0.id=a0.m07_body_basis_id where a0.organization_id=org and a0.id=allocation);
 else
 -- Authority writes only append wake identities. They never wait for purge
 -- leases while holding resource-policy locks; common drain owns q frontier.
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_m07_body_bases b on b.organization_id=a.organization_id and b.id=a.m07_body_basis_id
 where a.organization_id=org or b.recipe_id in(select c.recipe_id from private.capital_m07_recipe_components c join private.capital_public_delivery_licenses l on l.organization_id=c.organization_id and l.id=c.license_id where l.licensing_organization_id=org);
 end if;
 return case when tg_op='DELETE' then old else new end;
end; $$;
do $$declare t text;begin
 foreach t in array array['source_rights_versions','resource_access_grants','barrier_memberships','access_group_memberships'] loop
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.wake_capital_m07_retention_v1()',t||'_wake_m07',t);
 end loop;
 foreach t in array array['source_bindings','organization_memberships','capital_projects'] loop
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.wake_capital_m07_retention_v1()',t||'_wake_m07',t);
 end loop;
end; $$;
create trigger capital_artifact_wake_m07 after update of status on public.capital_project_artifacts for each row when(new.status is distinct from old.status and new.status in ('stale','superseded')) execute function private.wake_capital_m07_retention_v1();
create trigger capital_purge_wake_m07 after update of status on private.capital_public_payload_purge_queue for each row when(new.status is distinct from old.status) execute function private.wake_capital_m07_retention_v1();

create function private.worker_read_capital_m07_recovery_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_recover_capital_m07_result_v1(p_job_id,p_capability_token,p_recipe_id);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 a private.capital_public_payload_allocations;b private.capital_m07_body_bases;s private.capital_m07_recipe_seals;d timestamptz;result jsonb;
begin
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_retained_payload_id and x.content_kind='m07_body';
 select * into b from private.capital_m07_body_bases where organization_id=j.organization_id and id=a.m07_body_basis_id;
 select * into s from private.capital_m07_recipe_seals where organization_id=j.organization_id and recipe_id=p_recipe_id;
 if b.recipe_id is distinct from p_recipe_id or not private.capital_body_physical_receipt_v1(j.organization_id,p_retained_payload_id)
 or not((b.kind='context' and s.context_retained_payload_id=p_retained_payload_id)
 or(b.kind='parsed' and grant_row#>>'{parsed,retainedPayloadId}'=p_retained_payload_id::text)
 or(b.kind='final' and grant_row#>>'{final,retainedPayloadId}'=p_retained_payload_id::text)) then raise exception 'capital_m07_recovery_body_denied' using errcode='42501';end if;
 d:=private.capital_m07_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if d is null or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_m07_recovery_body_denied' using errcode='42501';end if;
 result:=private.capital_m07_body_dto_v1(j.organization_id,a.id,d,true);
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) or private.capital_m07_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_m07_recovery_body_denied' using errcode='42501';end if;
 return result;
end; $$;

-- The shared bounded body allocator accepts a recovery principal only through
-- this private discriminant; the ordinary command still requires the original job.


create function private.worker_prepare_capital_m07_output_core_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,
 p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid,p_recovery boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.capital_m07_recipes;grant_row jsonb;
 j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);ok private.capital_m07_accepted_invocations;
 b private.capital_m07_body_bases;parent private.capital_m07_body_bases;a private.capital_public_payload_allocations;
 parent_a private.capital_public_payload_allocations;p private.capital_public_retention_policies;deadline timestamptz;fp text;bytes bigint;stamp timestamptz:=clock_timestamp();replayed boolean:=false;
begin
 if p_recovery then
 grant_row:=private.worker_recover_capital_m07_result_v1(p_job_id,p_capability_token,p_recipe_id);
 if p_kind is distinct from 'final' or grant_row->>'state' not in ('transform','commit') or grant_row#>>'{accepted,acceptedInvocationId}' is distinct from p_accepted_invocation_id::text or grant_row#>>'{parsed,retainedPayloadId}' is distinct from p_parent_retained_payload_id::text then raise exception 'capital_m07_recovery_denied' using errcode='42501';end if;
 select * into strict r from private.capital_m07_recipes where organization_id=j.organization_id and id=p_recipe_id;
 else r:=private.require_capital_m07_recipe_v1(p_job_id,p_capability_token,p_recipe_id);end if;
 if exists(select 1 from private.capital_m07_quality_failures where organization_id=j.organization_id and recipe_id=r.id) or exists(select 1 from private.capital_m07_execution_failures where organization_id=j.organization_id and recipe_id=r.id) then raise exception 'capital_m07_quality_failed_terminal' using errcode='42501';end if;
 if p_request_id is null or p_kind not in ('parsed','final') or p_kind is null or jsonb_typeof(p_body) is distinct from 'object'
 or p_output_fingerprint is null or p_output_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'capital_m07_output_invalid' using errcode='22023';end if;
 select * into ok from private.capital_m07_accepted_invocations where organization_id=j.organization_id and job_id=r.job_id and recipe_id=r.id and id=p_accepted_invocation_id;
 if ok.id is null then raise exception 'capital_m07_accepted_denied' using errcode='42501';end if;
 if p_kind='parsed' then
 if p_output_fingerprint<>ok.output_fingerprint or p_parent_retained_payload_id is not null then raise exception 'capital_m07_output_invalid' using errcode='22023';end if;
 else
 if p_body->>'schemaVersion' is distinct from 'origination-senior-readout.v3' then raise exception 'capital_m07_final_invalid' using errcode='22023';end if;
 select x.* into parent_a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_parent_retained_payload_id and x.content_kind='m07_body';
 select * into parent from private.capital_m07_body_bases where organization_id=j.organization_id and id=parent_a.m07_body_basis_id;
 if parent.id is null or parent.kind<>'parsed' or parent.recipe_id<>r.id or parent.accepted_invocation_id<>ok.id or parent.semantic_fingerprint<>ok.output_fingerprint
 or not private.capital_body_physical_receipt_v1(j.organization_id,p_parent_retained_payload_id) then raise exception 'capital_m07_parent_denied' using errcode='42501';end if;
 end if;
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_m07_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if p_kind='final' then deadline:=least(deadline,parent_a.expires_at,parent_a.purge_at);end if;
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_m07_retention_denied' using errcode='42501';end if;
 fp:=encode(extensions.digest(p_body::text,'sha256'),'hex');bytes:=octet_length(p_body::text);
 if bytes not between 1 and 1048576 then raise exception 'capital_m07_body_size_invalid' using errcode='22023';end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and job_id=j.id and request_id=p_request_id and content_kind='m07_body';
 if a.id is not null then
 select * into strict b from private.capital_m07_body_bases where organization_id=j.organization_id and id=a.m07_body_basis_id;
 if b.recipe_id<>r.id or b.kind<>p_kind or b.accepted_invocation_id<>ok.id or b.parent_retained_payload_id is distinct from p_parent_retained_payload_id or b.semantic_fingerprint<>p_output_fingerprint or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_m07_output_conflict' using errcode='23505';end if;
 replayed:=true;
 if private.capital_m07_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_m07_retention_denied' using errcode='42501';end if;
 else
 insert into private.capital_m07_body_bases(organization_id,work_id,recipe_id,kind,semantic_fingerprint,accepted_invocation_id,parent_retained_payload_id)
 values(j.organization_id,r.work_id,r.id,p_kind,p_output_fingerprint,ok.id,p_parent_retained_payload_id) returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,
 payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,m07_body_basis_id,content_kind)
 values(b.id,j.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,bytes,j.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'m07_body') returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at) values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_m07_denied' using errcode='42501';end if;
 return private.capital_m07_body_dto_v1(j.organization_id,a.id,deadline,replayed)||jsonb_build_object('canonicalBody',p_body::text);
end; $$;

create function private.worker_prepare_capital_m07_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null)
returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_m07_output_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,false); $$;

create function private.worker_prepare_capital_m07_recovered_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null)
returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_m07_output_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,true); $$;

create function private.worker_commit_capital_m07_recovered_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,
 p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_recover_capital_m07_result_v1(p_job_id,p_capability_token,p_recipe_id);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);result jsonb;
begin
 if grant_row->>'state' not in ('commit','committed') or grant_row#>>'{accepted,acceptedInvocationId}' is distinct from p_accepted_invocation_id::text
 or grant_row#>>'{parsed,retainedPayloadId}' is distinct from p_parsed_retained_payload_id::text or grant_row#>>'{final,retainedPayloadId}' is distinct from p_final_retained_payload_id::text then raise exception 'capital_m07_recovery_denied' using errcode='42501';end if;
 result:=private.capital_m07_commit_result_core_v1(j.organization_id,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results);
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_m07_recovery_denied' using errcode='42501';end if;
 return result;
end; $$;

alter function private.decide_capital_project_artifact(uuid,text,text,text) rename to decide_capital_project_artifact_pre_m07;
create function private.decide_capital_project_artifact(p_artifact_id uuid,p_artifact_fingerprint text,p_decision text,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.capital_m07_native_bindings where capital_artifact_id=p_artifact_id) then raise exception 'capital_m07_revision_review_required' using errcode='42501';end if;
 return private.decide_capital_project_artifact_pre_m07(p_artifact_id,p_artifact_fingerprint,p_decision,p_note);
end; $$;
revoke all on function private.decide_capital_project_artifact_pre_m07(uuid,text,text,text) from public,anon,authenticated,service_role;

-- Fixed concrete API surface only; internal cores and legacy aliases remain
-- inaccessible even when a caller can execute another RPC in private schema.
create function public.worker_prepare_capital_m07_recipe_v1(p_job_id uuid,p_capability_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_m07_recipe_v1(p_job_id,p_capability_token); $$;
create function public.worker_prepare_capital_m07_context_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_m07_context_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id); $$;
create function public.worker_finalize_capital_m07_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_context_retained_payload_id uuid,p_components jsonb,p_reconstruction_fingerprint text,p_prompt_fingerprint text,p_primary_request_fingerprint text,p_fallback_request_fingerprint text,p_operator_budget_micro_usd bigint,p_operator_max_dispatches integer,p_research_status text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_finalize_capital_m07_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_context_retained_payload_id,p_components,p_reconstruction_fingerprint,p_prompt_fingerprint,p_primary_request_fingerprint,p_fallback_request_fingerprint,p_operator_budget_micro_usd,p_operator_max_dispatches,p_research_status); $$;
create function public.worker_commit_capital_m07_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,p_storage_version text,p_verified_sha256 text,p_verified_size bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_m07_body_v1(p_job_id,p_capability_token,p_allocation_id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size); $$;
create function public.worker_read_capital_m07_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_m07_allocation_v1(p_job_id,p_capability_token,p_allocation_id); $$;
create function public.worker_prepare_capital_m07_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_m07_output_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_prepare_capital_m07_recovered_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_m07_recovered_output_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_commit_capital_m07_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_m07_result_v1(p_job_id,p_capability_token,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results); $$;
create function public.worker_commit_capital_m07_recovered_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_m07_recovered_result_v1(p_job_id,p_capability_token,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results); $$;
create function public.worker_recover_capital_m07_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_recover_capital_m07_result_v1(p_job_id,p_capability_token,p_recipe_id); $$;
create function public.worker_read_capital_m07_recovery_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_m07_recovery_body_v1(p_job_id,p_capability_token,p_recipe_id,p_retained_payload_id); $$;
create function public.read_capital_m07_result_v1(p_revision_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.read_capital_m07_result_v1(p_revision_id); $$;

create function public.worker_record_capital_m07_execution_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_reason text,p_outcome_ids uuid[] default null) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_record_capital_m07_execution_failure_v1(p_job_id,p_capability_token,p_recipe_id,p_reason,p_outcome_ids); $$;
create function public.worker_record_capital_m07_quality_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.worker_record_capital_m07_quality_failure_v1(p_job_id,p_capability_token,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results); $$;
do $$declare p record;begin
 for p in select n.nspname,p0.proname,pg_get_function_identity_arguments(p0.oid) args from pg_proc p0 join pg_namespace n on n.oid=p0.pronamespace where n.nspname in ('private','public') and(p0.proname like '%capital_m07%' or p0.proname like '%pre_m07%' or p0.proname in('capital_capture_allocation_deadline_v2','capital_body_storage_job_authority_v1','worker_record_capital_project_artifact','worker_finish_capital_project_task','project_legacy_artifact_revision_v1','artifact_review_sources_allowed_v1','review_basis_receipt_authority_v1','read_artifact_revision_v1','decide_capital_project_artifact')) loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',p.nspname,p.proname,p.args);
 if p.proname=any(array['worker_record_capital_m07_execution_failure_v1','worker_record_capital_m07_quality_failure_v1','worker_prepare_capital_m07_recipe_v1','worker_prepare_capital_m07_context_v1','worker_finalize_capital_m07_recipe_v1','worker_commit_capital_m07_body_v1','worker_read_capital_m07_allocation_v1','worker_prepare_capital_m07_output_v1','worker_prepare_capital_m07_recovered_output_v1','worker_commit_capital_m07_result_v1','worker_commit_capital_m07_recovered_result_v1','worker_recover_capital_m07_result_v1','worker_read_capital_m07_recovery_body_v1','read_capital_m07_result_v1','worker_authorize_capital_m07_processing_v1','worker_record_capital_m07_input_v1','worker_record_capital_m07_attempt_outcome_v1','worker_record_capital_m07_accepted_v1','worker_record_capital_project_artifact','worker_finish_capital_project_task','read_artifact_revision_v1','decide_capital_project_artifact']) then execute format('grant execute on function %I.%I(%s) to authenticated',p.nspname,p.proname,p.args);end if;
 end loop;
end; $$;

-- Row guards close calls already compiled against the old private OID as well
-- as the public wrapper. Genuine native authority exists before these inserts.
create function private.guard_capital_m07_native_write_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='capital_project_artifacts' then
 if exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=new.organization_id and tr.id=new.task_run_id and(pt.task_id='M07' or(new.artifact_type='meeting_brief' and exists(select 1 from public.processing_jobs j where j.organization_id=tr.organization_id and j.id=tr.processing_job_id and j.payload->>'analysis_scope'='origination_thesis'))))
 and not exists(select 1 from private.capital_m07_native_bindings b where b.organization_id=new.organization_id and b.task_run_id=new.task_run_id and b.capital_artifact_id=new.id and new.content->>'schemaVersion'='capital-m07-projection.v1' and new.content->>'revisionId'=b.revision_id::text) then raise exception 'capital_m07_native_commit_required' using errcode='42501';end if;
 elsif new.status='failed' and exists(select 1 from private.capital_m07_recipe_seals z where z.organization_id=new.organization_id and z.task_run_id=new.id) then
 if not exists(select 1 from private.capital_m07_quality_failures q where q.organization_id=new.organization_id and q.task_run_id=new.id and q.quality_results=new.quality_results and new.error=jsonb_build_object('code','capital_m07_quality_failed') and new.output_reference is null and new.output_fingerprint is null) and not exists(select 1 from private.capital_m07_execution_failures q where q.organization_id=new.organization_id and q.task_run_id=new.id and new.quality_results='[]'::jsonb and new.error=jsonb_build_object('code','capital_m07_execution_failed','reason',q.reason) and new.output_reference is null and new.output_fingerprint is null) then raise exception 'capital_m07_native_quality_required' using errcode='42501';end if;
 elsif new.status='succeeded' and exists(select 1 from public.capital_project_plan_tasks pt where pt.organization_id=new.organization_id and pt.id=new.plan_task_id and pt.task_id='M07')
 and not exists(select 1 from private.capital_m07_native_bindings b join public.capital_project_artifacts c on c.organization_id=b.organization_id and c.id=b.capital_artifact_id where b.organization_id=new.organization_id and b.task_run_id=new.id and new.output_reference->>'id'=c.id::text and new.output_fingerprint=c.artifact_fingerprint) then raise exception 'capital_m07_native_commit_required' using errcode='42501';end if;
 return new;
end; $$;
create trigger capital_artifact_native_m07_guard before insert on public.capital_project_artifacts for each row execute function private.guard_capital_m07_native_write_v1();
create trigger capital_task_native_m07_guard before update of status,output_reference,output_fingerprint,quality_results,error on public.capital_project_task_runs for each row execute function private.guard_capital_m07_native_write_v1();
revoke all on function private.guard_capital_m07_native_write_v1() from public,anon,authenticated,service_role;

create function private.worker_read_capital_m07_recovery_source_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_recover_capital_m07_result_v1(p_job_id,p_capability_token,p_recipe_id);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 c private.capital_m07_recipe_components;a private.capital_public_payload_allocations;q private.capital_public_retained_payloads;d timestamptz;margin integer;result jsonb;
begin
 select * into c from private.capital_m07_recipe_components where organization_id=j.organization_id and recipe_id=p_recipe_id and slot='source' and retained_payload_id=p_retained_payload_id;
 select * into q from private.capital_public_retained_payloads where organization_id=j.organization_id and id=c.retained_payload_id;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and id=q.allocation_id and content_kind='public_source' and license_id=c.license_id and delivery_id=c.reference_id;
 if c.id is null or a.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,q.id) then raise exception 'capital_m07_recovery_source_denied' using errcode='42501';end if;
 d:=private.capital_public_retention_deadline_v1(a.license_id,j.organization_id,a.retained_at,a.policy_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=a.policy_id;
 if d is null or least(a.purge_at,d-make_interval(secs=>margin))<=clock_timestamp() or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_m07_recovery_source_denied' using errcode='42501';end if;
 result:=jsonb_build_object('schemaVersion','capital-public-storage-scope.v1','state','complete','allocationId',a.id,'retainedPayloadId',q.id,'deliveryId',a.delivery_id,
 'bucket',a.bucket_id,'path',a.object_path,'payloadFingerprint',a.payload_fingerprint,'byteLength',a.byte_length,'storageObjectId',q.storage_object_id,'storageVersion',q.storage_version,
 'retainedAt',a.retained_at,'uploadExpiresAt',a.upload_expires_at,'expiresAt',least(a.expires_at,d),'purgeAt',least(a.purge_at,d-make_interval(secs=>margin)));
 if private.capital_m07_recipe_deadline_v1(j.organization_id,p_recipe_id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_m07_recovery_source_denied' using errcode='42501';end if;
 return result;
end; $$;
create function public.worker_read_capital_m07_recovery_source_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_m07_recovery_source_v1(p_job_id,p_capability_token,p_recipe_id,p_retained_payload_id); $$;
revoke all on function private.worker_read_capital_m07_recovery_source_v1(uuid,text,uuid,uuid),public.worker_read_capital_m07_recovery_source_v1(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_read_capital_m07_recovery_source_v1(uuid,text,uuid,uuid),public.worker_read_capital_m07_recovery_source_v1(uuid,text,uuid,uuid) to authenticated;

create function private.worker_revalidate_capital_m07_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_m07_recipes:=private.require_capital_m07_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
begin
 return private.capital_m07_recipe_dto_v1(r.organization_id,r.id);
end; $$;
create function public.worker_revalidate_capital_m07_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_revalidate_capital_m07_recipe_v1(p_job_id,p_capability_token,p_recipe_id); $$;
revoke all on function private.worker_revalidate_capital_m07_recipe_v1(uuid,text,uuid),public.worker_revalidate_capital_m07_recipe_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_revalidate_capital_m07_recipe_v1(uuid,text,uuid),public.worker_revalidate_capital_m07_recipe_v1(uuid,text,uuid) to authenticated;

do $$declare t text;begin
 foreach t in array array['professional_context_profiles','institution_capability_profiles','organization_methodologies','capital_project_briefs','capital_project_plans'] loop
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.wake_capital_m07_retention_v1()',t||'_wake_m07',t);
 end loop;
end; $$;
create trigger capital_session_wake_m07 after update of company_profile,locale,privacy_status,representation_status on public.document_intake_sessions for each row execute function private.wake_capital_m07_retention_v1();

create function private.worker_find_capital_m07_recovery_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_m07_recipes;state text;
begin
 select * into r from private.capital_m07_recipes where organization_id=j.organization_id and work_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid)
 and plan_id=(j.payload->>'capital_project_plan_id')::uuid and brief_id=(j.payload->>'capital_project_brief_id')::uuid
 and revision_decision_id is not distinct from(j.payload->>'correction_decision_id')::uuid;
 state:=case when r.id is null then 'none' when exists(select 1 from private.capital_m07_accepted_invocations a where a.organization_id=j.organization_id and a.recipe_id=r.id)
 and exists(select 1 from private.capital_m07_recipe_seals s where s.organization_id=j.organization_id and s.recipe_id=r.id)
 and private.capital_m07_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is not null then 'recovery' else 'unresolved' end;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_m07_recovery_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-m07-recovery-discovery.v1','state',state,'recipeId',r.id);
end; $$;
create function public.worker_find_capital_m07_recovery_v1(p_job_id uuid,p_capability_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_find_capital_m07_recovery_v1(p_job_id,p_capability_token); $$;
revoke all on function private.worker_find_capital_m07_recovery_v1(uuid,text),public.worker_find_capital_m07_recovery_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_find_capital_m07_recovery_v1(uuid,text),public.worker_find_capital_m07_recovery_v1(uuid,text) to authenticated;

-- Native capture inherits no historical package/legacy confirmation. Every
-- derived revision needs its own exact current human review before external use.
alter function private.artifact_revision_release_v1(public.artifact_revisions) rename to artifact_revision_release_pre_m07_v1;
create function private.artifact_revision_release_v1(r public.artifact_revisions)
returns text language plpgsql stable security definer set search_path='' as $$
declare approved boolean;
begin
 if exists(with recursive ancestry(id) as(select r.id union select l.derived_from_revision_id from ancestry a join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=a.id and l.link_kind='artifact_revision') select 1 from ancestry a join private.capital_m07_native_bindings b on b.organization_id=r.organization_id and b.revision_id=a.id) then
 approved:=exists(select 1 from public.artifact_reviews v join public.artifacts a on a.organization_id=v.organization_id and a.id=v.artifact_id where v.organization_id=r.organization_id and v.artifact_id=r.artifact_id and v.revision_id=r.id and v.work_id=a.work_id and v.manifest_fingerprint=r.manifest_fingerprint and v.audience=r.audience and private.artifact_review_is_active_v1(r.organization_id,v.id));
 return case when approved then 'released' when r.audience='external' then 'blocked' else 'internal' end;
 end if;
 return private.artifact_revision_release_pre_m07_v1(r);
end; $$;
revoke all on function private.artifact_revision_release_pre_m07_v1(public.artifact_revisions),private.artifact_revision_release_v1(public.artifact_revisions) from public,anon,authenticated,service_role;

-- A native M07 uses licensed cross-tenant bridges, never publisher source UUIDs
-- in a consumer manifest. Its real, current recipe/source/body proof supplies
-- review substance without manufacturing financial claims or weakening history.
do $m07_review_substance$
declare definition text;needle text:='has_substance:=jsonb_array_length(r.manifest->''sources'')>0';replacement text;
begin
 definition:=pg_get_functiondef('private.review_artifact_revision_v1(uuid,text,text,uuid,text,boolean,uuid,uuid)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'm07_review_substance_definition_drift';end if;
 replacement:='has_substance:=(exists(select 1 from private.capital_m07_native_bindings nb where nb.organization_id=org and nb.revision_id=r.id and exists(select 1 from private.capital_m07_recipe_components src where src.organization_id=nb.organization_id and src.recipe_id=nb.recipe_id and src.slot=''source'') and private.capital_m07_native_read_allowed_v1(org,r.id,actor))) or jsonb_array_length(r.manifest->''sources'')>0';
 execute replace(definition,needle,replacement);
end $m07_review_substance$;
