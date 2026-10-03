-- Prospective S11 native consumption. No experimental contribution/1000 grant
-- is widened. Raw context, parsed response and final product live only in
-- finite-lived private Storage allocations; permanent rows contain identity.
set search_path='';

create table private.capital_s11_recipes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,plan_id uuid not null,brief_id uuid not null,session_id uuid not null,
 revision_decision_id uuid,original_attempt integer not null check(original_attempt>0),
 human_subject_id uuid not null references auth.users(id),worker_account_id uuid not null references auth.users(id),
 plan_fingerprint text not null check(plan_fingerprint~'^[a-f0-9]{64}$'),
 context_fingerprint text not null check(context_fingerprint~'^[a-f0-9]{64}$'),
 base_authority_fingerprint text not null check(base_authority_fingerprint~'^[a-f0-9]{64}$'),
 as_of_date date not null,locale text not null check(locale in ('pt-BR','en-US')),
 renderer_version text not null check(renderer_version='capital-public-task-renderer.s11.v1'),
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
create index capital_s11_recipe_work_idx on private.capital_s11_recipes(organization_id,work_id);
create index capital_s11_recipe_plan_idx on private.capital_s11_recipes(organization_id,plan_id);
create index capital_s11_recipe_brief_idx on private.capital_s11_recipes(organization_id,brief_id);
create index capital_s11_recipe_session_idx on private.capital_s11_recipes(organization_id,session_id);
create index capital_s11_recipe_decision_idx on private.capital_s11_recipes(organization_id,revision_decision_id);
create index capital_s11_recipe_subject_idx on private.capital_s11_recipes(human_subject_id);
create index capital_s11_recipe_worker_idx on private.capital_s11_recipes(worker_account_id);
create index capital_s11_recipe_policy_idx on private.capital_s11_recipes(retention_policy_id);

create table private.capital_s11_body_bases (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,recipe_id uuid not null,kind text not null check(kind in ('context','prelude','parsed','final','derived')),
 semantic_fingerprint text check(semantic_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id)
);
create index capital_s11_basis_recipe_idx on private.capital_s11_body_bases(organization_id,work_id,recipe_id);

alter table private.capital_public_payload_allocations add column s11_body_basis_id uuid,
 add constraint capital_s11_allocation_basis_fk foreign key(organization_id,s11_body_basis_id)
 references private.capital_s11_body_bases(organization_id,id);
-- Extend the installed family set instead of replacing another consumer's body gate.
do $$declare expression text;nulls text;begin
 select pg_get_constraintdef(oid)into strict expression from pg_constraint where conrelid='private.capital_public_payload_allocations'::regclass and conname='capital_public_payload_allocations_content_kind_check';
 alter table private.capital_public_payload_allocations drop constraint capital_public_payload_allocations_content_kind_check;
 execute 'alter table private.capital_public_payload_allocations add constraint capital_public_payload_allocations_content_kind_check check ('||substring(expression from 7)||' or content_kind=''s11_body'')';
 select pg_get_constraintdef(oid)into strict expression from pg_constraint where conrelid='private.capital_public_payload_allocations'::regclass and conname='capital_allocations_kind_invariant';
 select string_agg(quote_ident(attname),','order by attname)into nulls from pg_attribute where attrelid='private.capital_public_payload_allocations'::regclass and attnum>0 and not attisdropped and attname<>'s11_body_basis_id'and(attname like '%body_basis_id'or attname in('body_basis_id','delivery_id','license_id','licensing_organization_id'));
 if nulls is null then raise exception 'capital_s11_existing_origins_missing';end if;
 alter table private.capital_public_payload_allocations drop constraint capital_allocations_kind_invariant;
 execute 'alter table private.capital_public_payload_allocations add constraint capital_allocations_kind_invariant check ((s11_body_basis_id is null and '||substring(expression from 7)||') or(content_kind=''s11_body''and s11_body_basis_id is not null and num_nonnulls('||nulls||')=0))';
end$$;
create index capital_s11_allocation_basis_idx on private.capital_public_payload_allocations(organization_id,s11_body_basis_id);
create unique index capital_s11_allocation_request_idx on private.capital_public_payload_allocations(organization_id,job_id,request_id) where content_kind='s11_body';

create table private.capital_s11_recipe_components (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,recipe_id uuid not null,component_no integer not null check(component_no between 1 and 1000),
 slot text not null check(slot in ('company','brief','institution','research','source','revision','dependency')),
 reference_id uuid not null,version integer not null check(version>0),
 body_fingerprint text not null check(body_fingerprint~'^[a-f0-9]{64}$'),
 retained_payload_id uuid,license_id uuid,dependency_artifact_id uuid,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id,component_no),unique(organization_id,recipe_id,slot,reference_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,license_id) references private.capital_public_delivery_licenses(organization_id,id),
 foreign key(organization_id,dependency_artifact_id) references public.capital_project_artifacts(organization_id,id),
 check((slot='source' and num_nonnulls(retained_payload_id,license_id)=2 and dependency_artifact_id is null)
 or(slot='dependency' and dependency_artifact_id is not null and license_id is null)
 or(slot not in ('source','dependency') and num_nonnulls(license_id,dependency_artifact_id)=0))
);
create index capital_s11_components_recipe_idx on private.capital_s11_recipe_components(organization_id,work_id,recipe_id);
create index capital_s11_components_retained_idx on private.capital_s11_recipe_components(organization_id,retained_payload_id);
create index capital_s11_components_license_idx on private.capital_s11_recipe_components(organization_id,license_id);
create index capital_s11_components_dependency_idx on private.capital_s11_recipe_components(organization_id,dependency_artifact_id);

create table private.capital_s11_recipe_seals (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,recipe_id uuid not null,task_run_id uuid not null,context_retained_payload_id uuid not null,
 recipe_fingerprint text not null check(recipe_fingerprint~'^[a-f0-9]{64}$'),
 reconstruction_fingerprint text not null check(reconstruction_fingerprint~'^[a-f0-9]{64}$'),
 prompt_fingerprint text not null check(prompt_fingerprint~'^[a-f0-9]{64}$'),
 primary_request_fingerprint text not null check(primary_request_fingerprint~'^[a-f0-9]{64}$'),
 fallback_request_fingerprint text not null check(fallback_request_fingerprint~'^[a-f0-9]{64}$'),
 research_status text not null check(research_status in ('succeeded','partial','abstained')),
 research_jurisdiction text not null check(research_jurisdiction in ('BR','US')), research_jurisdiction_needs_confirmation boolean not null, research_strategy_fingerprint text not null check(research_strategy_fingerprint~'^[a-f0-9]{64}$'),
 budget_version text not null check(budget_version='capital-s11-operational-budget.v1'),
 research_reservation_version text not null check(research_reservation_version='public-research-reservation.s11.v1'),
 research_reservation_micro_usd bigint not null check(research_reservation_micro_usd in (0,300000)),
 effective_budget_micro_usd bigint not null check(effective_budget_micro_usd between 1 and 3000000),
 effective_max_dispatches integer not null check(effective_max_dispatches between 1 and 2),
 sealed_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,context_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index capital_s11_seal_recipe_idx on private.capital_s11_recipe_seals(organization_id,work_id,recipe_id);
create index capital_s11_seal_retained_idx on private.capital_s11_recipe_seals(organization_id,context_retained_payload_id);


-- Compare only consumed mutable authority, not completed_artifacts or task
-- progress produced by this execution. This proof also works after the old
-- worker lease expires, so human/recovery reads retain the same current barrier.
create function private.capital_s11_base_authority_fingerprint_v1(p_org uuid,p_job uuid,p_session uuid,p_brief uuid,p_plan uuid,p_subject uuid,p_captured_at timestamptz)
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
create function private.capital_s11_recipe_deadline_v1(p_org uuid,p_recipe uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes;c private.capital_s11_recipe_components;
 a private.capital_public_payload_allocations;bound timestamptz;deadline timestamptz;s private.capital_s11_recipe_seals;
begin
 select * into r from private.capital_s11_recipes where organization_id=p_org and id=p_recipe;
 if r.id is null or p_subject is null or not private.capital_body_subject_allowed_v1(p_org,r.work_id,p_subject)
 or not private.capital_body_subject_allowed_v1(p_org,r.work_id,r.human_subject_id) then return null;end if;
 if r.base_authority_fingerprint is distinct from private.capital_s11_base_authority_fingerprint_v1(p_org,r.job_id,r.session_id,r.brief_id,r.plan_id,r.human_subject_id,r.captured_at) then return null;end if;
 deadline:=r.expires_at;
 select * into s from private.capital_s11_recipe_seals where organization_id=p_org and recipe_id=r.id;
 if s.id is not null then
 select x.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations x on x.organization_id=p.organization_id and x.id=p.allocation_id where p.organization_id=p_org and p.id=s.context_retained_payload_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,s.context_retained_payload_id) or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 deadline:=least(deadline,a.expires_at,a.purge_at);
 end if;
 for c in select * from private.capital_s11_recipe_components where organization_id=p_org and recipe_id=r.id order by component_no loop
 if c.slot='source' then
 select x.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations x on x.organization_id=p.organization_id and x.id=p.allocation_id
 where p.organization_id=p_org and p.id=c.retained_payload_id and x.content_kind='public_source' and x.license_id=c.license_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,c.retained_payload_id) then return null;end if;
 bound:=private.capital_public_retention_deadline_v1(c.license_id,p_org,a.retained_at,a.policy_id);
 if bound is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 deadline:=least(deadline,bound,a.expires_at,a.purge_at);
 elsif c.slot='dependency' then
 if not exists(select 1 from public.capital_project_artifacts x where x.organization_id=p_org and x.capital_project_id=r.work_id and x.id=c.dependency_artifact_id and x.artifact_version=c.version and x.status not in ('stale','superseded')) then return null;end if;
 select allocation.* into a from private.capital_s11_task_projections bridge join private.capital_public_retained_payloads physical on physical.organization_id=bridge.organization_id and physical.id=bridge.derived_retained_payload_id
 join private.capital_public_payload_allocations allocation on allocation.organization_id=physical.organization_id and allocation.id=physical.allocation_id
 where bridge.organization_id=p_org and bridge.recipe_id=r.id and bridge.capital_artifact_id=c.dependency_artifact_id;
 if a.id is null or not private.capital_body_physical_receipt_v1(p_org,(select id from private.capital_public_retained_payloads where organization_id=p_org and allocation_id=a.id))
 or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 deadline:=least(deadline,a.expires_at,a.purge_at);
 end if;
 end loop;
 return case when deadline>clock_timestamp() then deadline end;
end; $$;

create function private.worker_prepare_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 c jsonb;r private.capital_s11_recipes;p private.capital_public_retention_policies;stamp timestamptz:=clock_timestamp();fp text;
begin
 if j.payload?'revision_of_artifact_id' and not exists(select 1 from public.capital_project_artifact_decisions d where d.organization_id=j.organization_id and d.id::text=j.payload->>'correction_decision_id' and d.artifact_id::text=j.payload->>'revision_of_artifact_id' and d.capital_project_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid) and d.decision='request_changes' and d.decided_by=j.authorization_subject_id) then raise exception 'capital_s11_correction_denied' using errcode='42501';end if;
 if j.payload->>'analysis_scope' is distinct from 'capital_planning' or not(j.payload->'capital_task_ids'?'S11') then raise exception 'capital_s11_recipe_denied' using errcode='42501';end if;
 c:=private.worker_load_capital_project_context_v6(j.id,p_capability_token);
 fp:=encode(extensions.digest(c::text,'sha256'),'hex');
 select x.* into p from private.capital_public_retention_policies x join private.capital_public_retention_controls ctl on ctl.policy_id=x.id where ctl.singleton and ctl.enabled;
 if p.id is null or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and job_id=j.id;
 if r.id is not null then
 if r.context_fingerprint<>fp or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id then raise exception 'capital_s11_recipe_changed' using errcode='40001';end if;
 else
 if exists(select 1 from private.capital_s11_recipes existing where existing.organization_id=j.organization_id and existing.work_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid) and existing.plan_id=(j.payload->>'capital_project_plan_id')::uuid and existing.brief_id=(j.payload->>'capital_project_brief_id')::uuid and existing.revision_decision_id is not distinct from (j.payload->>'correction_decision_id')::uuid) then raise exception 'capital_s11_recovery_required' using errcode='42501';end if;
 insert into private.capital_s11_recipes(organization_id,work_id,job_id,plan_id,brief_id,session_id,human_subject_id,worker_account_id,revision_decision_id,original_attempt,
 plan_fingerprint,context_fingerprint,base_authority_fingerprint,as_of_date,locale,renderer_version,captured_at,expires_at,retention_policy_id)
 values(j.organization_id,(j.payload->>'capital_project_id')::uuid,j.id,(j.payload->>'capital_project_plan_id')::uuid,(j.payload->>'capital_project_brief_id')::uuid,j.intake_session_id,
 j.authorization_subject_id,auth.uid(),(j.payload->>'correction_decision_id')::uuid,j.attempts,c#>>'{plan,fingerprint}',fp,private.capital_s11_base_authority_fingerprint_v1(j.organization_id,j.id,j.intake_session_id,(j.payload->>'capital_project_brief_id')::uuid,(j.payload->>'capital_project_plan_id')::uuid,j.authorization_subject_id,stamp),(stamp at time zone 'UTC')::date,c#>>'{session,locale}',
 'capital-public-task-renderer.s11.v1',stamp,stamp+make_interval(secs=>p.maximum_retention_seconds),p.id) returning * into r;
 end if;
 if private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recipe_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-s11-base-context.v1','recipeId',r.id,'jobId',j.id,'organizationId',j.organization_id,'workId',r.work_id,
 'planId',r.plan_id,'planFingerprint',r.plan_fingerprint,'asOfDate',r.as_of_date,'locale',r.locale,'contextFingerprint',r.context_fingerprint,
 'canonicalContext',c::text,'expiresAt',r.expires_at);
end; $$;

-- Table/API grants are closed until every concrete command below is installed.
do $$ declare t text;cmd text;begin
 foreach t in array array['capital_s11_recipes','capital_s11_body_bases','capital_s11_recipe_components','capital_s11_recipe_seals'] loop
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
revoke all on function private.capital_s11_recipe_deadline_v1(uuid,uuid,uuid),private.worker_prepare_capital_s11_recipe_v1(uuid,text) from public,anon,authenticated,service_role;

-- S11 retention is a separate origin family. Its DTO preserves the physical
-- protocol, but resolves its own server basis rather than inventing a contribution.
create function private.capital_s11_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;b private.capital_s11_body_bases;d timestamptz;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='s11_body';
 select * into b from private.capital_s11_body_bases where organization_id=p_org and id=a.s11_body_basis_id;
 if b.id is null then return null;end if;
 d:=private.capital_s11_recipe_deadline_v1(p_org,b.recipe_id,p_subject);
 if d is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 return case when least(d,a.expires_at,a.purge_at)>clock_timestamp() then least(d,a.expires_at) end;
end; $$;

alter function private.capital_capture_allocation_deadline_v2(uuid,uuid) rename to capital_capture_allocation_deadline_pre_s11_v2;
create function private.capital_capture_allocation_deadline_v2(p_org uuid,p_allocation uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;subject uuid;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 if a.content_kind is distinct from 's11_body' then return private.capital_capture_allocation_deadline_pre_s11_v2(p_org,p_allocation);end if;
 select human_subject_id into subject from private.capital_s11_body_bases b join private.capital_s11_recipes r on r.organization_id=b.organization_id and r.id=b.recipe_id where b.organization_id=p_org and b.id=a.s11_body_basis_id;
 return private.capital_s11_allocation_deadline_v1(p_org,p_allocation,subject);
end; $$;

create function private.capital_s11_body_dto_v1(p_org uuid,p_allocation uuid,p_deadline timestamptz,p_replayed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;receipt private.capital_public_retained_payloads;margin integer;
begin
 select * into strict allocation from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 select * into receipt from private.capital_public_retained_payloads where organization_id=p_org and allocation_id=allocation.id;
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 return jsonb_build_object('schemaVersion','capital-retained-body.v1','retentionState',case when receipt.id is null then 'allocated' else 'retained' end,
 'allocationId',allocation.id,'retainedPayloadId',receipt.id,'bodyBasisId',allocation.s11_body_basis_id,'bucket',allocation.bucket_id,'path',allocation.object_path,
 'payloadFingerprint',allocation.payload_fingerprint,'byteLength',allocation.byte_length,'storageObjectId',receipt.storage_object_id,'storageVersion',receipt.storage_version,
 'retainedAt',allocation.retained_at,'uploadExpiresAt',allocation.upload_expires_at,'expiresAt',least(allocation.expires_at,p_deadline),
 'purgeAt',least(allocation.purge_at,p_deadline-make_interval(secs=>margin)),'replayed',p_replayed);
end; $$;

create function private.worker_commit_capital_s11_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,
 p_storage_version text,p_verified_sha256 text,p_verified_size bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;basis private.capital_s11_body_bases;receipt private.capital_public_retained_payloads;
 object_row storage.objects;deadline timestamptz;margin integer;replayed boolean:=false;result_dto jsonb;
begin
 select * into allocation from private.capital_public_payload_allocations where organization_id=job.organization_id and job_id=job.id and id=p_allocation_id and content_kind='s11_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id) then raise exception 'capital_body_retention_denied' using errcode='42501';end if;
 if p_storage_object_id is null or coalesce(length(p_storage_version),0) not between 1 and 1024 or p_verified_sha256 is distinct from allocation.payload_fingerprint or p_verified_size is distinct from allocation.byte_length then
 raise exception 'capital_body_proof_invalid' using errcode='22023';end if;
 deadline:=private.capital_s11_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
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
 result_dto:=private.capital_s11_body_dto_v1(job.organization_id,allocation.id,deadline,replayed);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

create function private.worker_read_capital_s11_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 allocation private.capital_public_payload_allocations;receipt private.capital_public_retained_payloads;
 physical_object storage.objects;deadline timestamptz;checked_deadline timestamptz;margin integer;result_dto jsonb;
begin
 if p_allocation_id is null then raise exception 'capital_body_read_invalid' using errcode='22023';end if;
 select a.* into allocation from private.capital_public_payload_allocations a
 where a.organization_id=job.organization_id and a.job_id=job.id and a.id=p_allocation_id and a.content_kind='s11_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id)
 or not private.capital_public_capture_bucket_safe_v1() then raise exception 'capital_body_read_denied' using errcode='42501';end if;
 deadline:=private.capital_s11_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
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
 result_dto:=private.capital_s11_body_dto_v1(job.organization_id,allocation.id,deadline,true)
 ||jsonb_build_object('storageObjectId',physical_object.id,'storageVersion',physical_object.version);
 -- No caller-supplied path/version/hash or storage header authorizes this scope.
 -- Re-run current rights and clock after constructing it, so an elapsed lease
 -- cannot escape through a slow closure/metadata lookup before either server gate.
 checked_deadline:=private.capital_s11_allocation_deadline_v1(job.organization_id,allocation.id,job.authorization_subject_id);
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
 select * into allocation from private.capital_public_payload_allocations a where a.id=p_allocation and a.content_kind in ('typed_body','public_source','m07_body','s11_body');
 if not found or headers->>'x-offroad-job-id' is distinct from allocation.job_id::text
 or (headers?'x-offroad-workspace' and headers->>'x-offroad-workspace' is distinct from allocation.organization_id::text) then return false;end if;
 capability:=headers->>'x-offroad-capability';
 if length(capability) not between 1 and 4096 or extensions.digest(capability,'sha256') is distinct from allocation.capability_sha256 then return false;end if;
 return private.capital_public_allocation_job_current_v1(allocation.id)
 and private.capital_public_capture_clock_current_v1(allocation.job_id,capability);
end; $$;

create function private.capital_s11_storage_allowed_v1(p_allocation uuid,p_mode text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;human uuid;deadline timestamptz;margin integer;
begin
 if auth.uid() is null or p_mode is distinct from 'upload' or not private.capital_body_storage_job_authority_v1(p_allocation) or not private.capital_public_capture_bucket_safe_v1() then return false;end if;
 select * into allocation from private.capital_public_payload_allocations where id=p_allocation and content_kind='s11_body';
 if not found or not private.capital_public_allocation_job_current_v1(allocation.id)
 or not private.capital_public_retention_healthy_v1(allocation.worker_token_id,allocation.policy_id) then return false;end if;
 if exists(select 1 from storage.objects o where o.bucket_id=allocation.bucket_id and o.name=allocation.object_path
 and ((to_jsonb(o)->>'is_versioned')::boolean is true or (to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false;end if;
 if p_mode='upload' and (allocation.upload_expires_at<=clock_timestamp()
 or exists(select 1 from private.capital_public_retained_payloads where organization_id=allocation.organization_id and allocation_id=allocation.id)) then return false;end if;
 select authorization_subject_id into human from public.processing_jobs where organization_id=allocation.organization_id and id=allocation.job_id;
 if not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=allocation.organization_id and allocation_id=allocation.id and status='pending') then return false;end if;
 deadline:=private.capital_s11_allocation_deadline_v1(allocation.organization_id,allocation.id,human);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=allocation.policy_id;
 return deadline is not null and least(allocation.purge_at,deadline-make_interval(secs=>margin))>clock_timestamp()
 and private.capital_body_retention_healthy_v1(allocation.policy_id,allocation.organization_id,allocation.id)
 and private.capital_body_storage_job_authority_v1(allocation.id);
end; $$;

-- Preserve current material/M07/public-source authority; dispatch only S11.
alter function private.worker_can_access_capital_public_payload_v1(text,text,text) rename to worker_can_access_capital_public_payload_pre_s11_v1;
create function private.worker_can_access_capital_public_payload_v1(p_bucket text,p_path text,p_mode text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;
begin
 -- Purge resolves the genuine leased janitor scope before kind dispatch.
 if p_mode in('purge','purge_select') then return private.worker_can_access_capital_public_payload_pre_s11_v1(p_bucket,p_path,p_mode);end if;
 select * into a from private.capital_public_payload_allocations where bucket_id=p_bucket and object_path=p_path;
 if a.content_kind is distinct from 's11_body' then return private.worker_can_access_capital_public_payload_pre_s11_v1(p_bucket,p_path,p_mode);end if;
 if exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path and((to_jsonb(o)->>'is_versioned')::boolean is true or(to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at' is not null)) then return false;end if;
 return private.capital_s11_storage_allowed_v1(a.id,p_mode);
end$$;
revoke all on function private.capital_s11_storage_allowed_v1(uuid,text),private.worker_can_access_capital_public_payload_pre_s11_v1(text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.worker_can_access_capital_public_payload_v1(text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_can_access_capital_public_payload_v1(text,text,text) to authenticated;
-- Policy expressions retain function OIDs across RENAME. Rebind them to the
-- current dispatch rather than granting clients the historical implementation.
do $$declare p record;ddl text;begin
 for p in select * from pg_policies where schemaname='storage' and tablename='objects' and(coalesce(qual,'') like '%worker_can_access_capital_public_payload_pre_s11_v1%' or coalesce(with_check,'') like '%worker_can_access_capital_public_payload_pre_s11_v1%') loop
 ddl:=format('alter policy %I on storage.objects',p.policyname);
 if p.qual is not null then ddl:=ddl||' using ('||replace(p.qual,'worker_can_access_capital_public_payload_pre_s11_v1','worker_can_access_capital_public_payload_v1')||')';end if;
 if p.with_check is not null then ddl:=ddl||' with check ('||replace(p.with_check,'worker_can_access_capital_public_payload_pre_s11_v1','worker_can_access_capital_public_payload_v1')||')';end if;
 execute ddl;
 end loop;
end$$;


-- The base is captured before research. Only SQL supplies its actual body; a
-- caller cannot smuggle a fresh context underneath a prior captured identity.
create function private.worker_prepare_capital_s11_context_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 r private.capital_s11_recipes;a private.capital_public_payload_allocations;b private.capital_s11_body_bases;
 c jsonb;p private.capital_public_retention_policies;fp text;bytes bigint;deadline timestamptz;stamp timestamptz:=clock_timestamp();
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_s11_retry' using errcode='40001';end if;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id or p_request_id is null then raise exception 'capital_s11_denied' using errcode='42501';end if;
 c:=private.worker_load_capital_project_context_v6(j.id,p_capability_token);
 fp:=encode(extensions.digest(c::text,'sha256'),'hex');bytes:=octet_length(c::text);
 if fp<>r.context_fingerprint or bytes not between 1 and 1048576 then raise exception 'capital_s11_context_changed' using errcode='40001';end if;
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and job_id=j.id and request_id=p_request_id and content_kind='s11_body';
 if a.id is not null then
 select * into b from private.capital_s11_body_bases where organization_id=j.organization_id and id=a.s11_body_basis_id;
 if b.recipe_id<>r.id or b.kind<>'context' or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_s11_context_conflict' using errcode='23505';end if;
 if private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 else
 insert into private.capital_s11_body_bases(organization_id,work_id,recipe_id,kind) values(j.organization_id,r.work_id,r.id,'context') returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,
 payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,s11_body_basis_id,content_kind)
 values(b.id,j.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,bytes,j.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'s11_body') returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at) values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_denied' using errcode='42501';end if;
 return private.capital_s11_body_dto_v1(j.organization_id,a.id,deadline,true)||jsonb_build_object('canonicalBody',c::text);
end; $$;

create function private.capital_s11_recipe_dto_v1(p_org uuid,p_recipe uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.capital_s11_recipes;s private.capital_s11_recipe_seals;components jsonb;
begin
 select * into strict r from private.capital_s11_recipes where organization_id=p_org and id=p_recipe;
 select * into strict s from private.capital_s11_recipe_seals where organization_id=p_org and recipe_id=r.id;
 select coalesce(jsonb_agg(jsonb_build_object('slot',slot,'id',reference_id,'version',version,'bodyFingerprint',body_fingerprint) order by component_no),'[]') into components from private.capital_s11_recipe_components where organization_id=p_org and recipe_id=r.id;
 return jsonb_build_object('schemaVersion','capital-s11-recipe-receipt.v1','state','ready','recipeId',r.id,'producerTaskRunId',s.task_run_id,'producerTaskId','M04','finalTaskId','S11',
 'jobId',r.job_id,'organizationId',p_org,'workId',r.work_id,'planId',r.plan_id,'planFingerprint',r.plan_fingerprint,'locale',r.locale,'asOfDate',r.as_of_date,
 'rendererVersion',r.renderer_version,'recipeFingerprint',s.recipe_fingerprint,'reconstructionFingerprint',s.reconstruction_fingerprint,
 'contextRetainedPayloadId',s.context_retained_payload_id,'operationalBudget',jsonb_build_object('schemaVersion',s.budget_version,'researchReservationVersion',s.research_reservation_version,'researchReservationMicroUsd',s.research_reservation_micro_usd,'maxExposureMicroUsd',s.effective_budget_micro_usd,'maxDispatches',s.effective_max_dispatches),'components',components,'expiresAt',r.expires_at);
end; $$;

-- Component hashes here are observed JS reconstruction identities. Physical
-- hashes are separate server-derived allocation hashes and storage proofs.
create function private.worker_finalize_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,
 p_context_retained_payload_id uuid,p_components jsonb,p_reconstruction_fingerprint text,
 p_prompt_fingerprint text,p_primary_request_fingerprint text,p_fallback_request_fingerprint text,
 p_operator_budget_micro_usd bigint,p_operator_max_dispatches integer,p_research_status text,p_jurisdiction text,p_jurisdiction_needs_confirmation boolean,p_strategy_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 r private.capital_s11_recipes;s private.capital_s11_recipe_seals;a private.capital_public_payload_allocations;b private.capital_s11_body_bases;
 component jsonb;ordinal integer:=0;dep public.capital_project_artifacts;lic private.capital_public_delivery_licenses;deadline timestamptz;
 run uuid;fp text;expected uuid;expected_version integer;effective_budget bigint;effective_dispatches integer;research_reserve bigint;job_cost numeric;job_calls numeric;research_sources_wire text;research_fp text;
begin
 if p_jurisdiction is null or p_jurisdiction not in ('BR','US') or p_jurisdiction_needs_confirmation is null or p_strategy_fingerprint is null or p_strategy_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'capital_s11_strategy_pin_invalid' using errcode='22023';end if;
 if p_research_status is null or p_research_status not in ('succeeded','partial','abstained') then raise exception 'capital_s11_research_status_invalid' using errcode='22023';end if;
 if p_operator_budget_micro_usd is null or p_operator_budget_micro_usd not between 1 and 3000000 or p_operator_max_dispatches is null or p_operator_max_dispatches not between 1 and 2
 or jsonb_typeof(j.payload#>'{model_budget,max_cost_usd}') is distinct from 'number' or jsonb_typeof(j.payload#>'{model_budget,max_calls}') is distinct from 'number' then raise exception 'capital_s11_budget_invalid' using errcode='22023';end if;
 job_cost:=(j.payload#>>'{model_budget,max_cost_usd}')::numeric;job_calls:=(j.payload#>>'{model_budget,max_calls}')::numeric;
 if job_cost<=0 or job_calls<1 or job_calls<>trunc(job_calls) then raise exception 'capital_s11_budget_denied' using errcode='42501';end if;
 -- Fixed server reservation: 12*(USD0.005 Perplexity + USD0.020 OpenAI search).
 -- Revisions perform no new search. Keep the conservative initial reservation
 -- for frozen/official research until a durable research-cost ledger exists.
 research_reserve:=case when j.payload?'revision_of_artifact_id' then 0 else 300000 end;
 effective_budget:=least(3000000,case when j.payload?'revision_of_artifact_id' then 800000 else 950000 end,floor(job_cost*1000000)::bigint)-research_reserve;
 effective_budget:=least(effective_budget,p_operator_budget_micro_usd);
 effective_dispatches:=least(2,job_calls::integer,p_operator_max_dispatches);
 if effective_budget<1 or effective_dispatches<1 then raise exception 'capital_s11_budget_denied' using errcode='42501';end if;
 if exists(select 1 from unnest(array[p_reconstruction_fingerprint,p_prompt_fingerprint,p_primary_request_fingerprint,p_fallback_request_fingerprint]) pin where pin is null or pin!~'^[a-f0-9]{64}$') or jsonb_typeof(p_components) is distinct from 'array' or jsonb_array_length(p_components) not between 7 and 1000 or octet_length(p_components::text)>262144 then raise exception 'capital_s11_recipe_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_s11_retry' using errcode='40001';end if;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 if r.id is null or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id or exists(select 1 from private.capital_body_invocation_inputs i where i.organization_id=j.organization_id and i.job_id=j.id) then raise exception 'capital_s11_denied' using errcode='42501';end if;
 select z.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations z on z.organization_id=p.organization_id and z.id=p.allocation_id where p.organization_id=j.organization_id and p.id=p_context_retained_payload_id and z.job_id=j.id and z.content_kind='s11_body';
 select * into b from private.capital_s11_body_bases where organization_id=j.organization_id and id=a.s11_body_basis_id;
 if b.recipe_id is distinct from r.id or b.kind is distinct from 'context' or a.payload_fingerprint<>r.context_fingerprint or not private.capital_body_physical_receipt_v1(j.organization_id,p_context_retained_payload_id) then raise exception 'capital_s11_context_denied' using errcode='42501';end if;
 -- Snapshot rows are immutable. Every required private slot must be present once;
 -- supplied IDs can only identify actual objects in this recipe's native context.
 if exists(select 1 from unnest(array['company','brief','institution','research','revision']) k where(select count(*) from jsonb_array_elements(p_components) x where x->>'slot'=k)<>1)
 or not exists(select 1 from jsonb_array_elements(p_components) x where x->>'slot'='dependency') then raise exception 'capital_s11_recipe_invalid' using errcode='22023';end if;
 if not exists(select 1 from jsonb_array_elements(p_components) x where x->>'slot'='source') then raise exception 'capital_s11_published_source_required' using errcode='42501';end if;
 -- This closed two-field ASCII/UUID object uses the exact historical JS
 -- stable wire. It is deliberately not generic SQL jsonb::text canonicalization.
 select '['||coalesce(string_agg((x.value->'id')::text,',' order by x.ordinality),'')||']' into research_sources_wire from jsonb_array_elements(p_components) with ordinality x(value,ordinality) where x.value->>'slot'='source';
 research_fp:=encode(extensions.digest('{"jurisdiction":'||to_jsonb(p_jurisdiction)::text||',"jurisdictionNeedsConfirmation":'||(case when p_jurisdiction_needs_confirmation then 'true' else 'false' end)||',"sourceIds":'||research_sources_wire||',"status":'||to_jsonb(p_research_status)::text||',"strategyFingerprint":'||to_jsonb(p_strategy_fingerprint)::text||'}','sha256'),'hex');
 if not exists(select 1 from jsonb_array_elements(p_components) x where x->>'slot'='research' and x->>'bodyFingerprint'=research_fp) then raise exception 'capital_s11_research_pin_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(jsonb_build_object('recipe',r.id,'context',r.context_fingerprint,'components',p_components,'reconstruction',p_reconstruction_fingerprint,'renderer',r.renderer_version,'prompt',p_prompt_fingerprint,'primaryRequest',p_primary_request_fingerprint,'fallbackRequest',p_fallback_request_fingerprint,'researchStatus',p_research_status,'researchJurisdiction',p_jurisdiction,'researchJurisdictionNeedsConfirmation',p_jurisdiction_needs_confirmation,'researchStrategyFingerprint',p_strategy_fingerprint,'originalAttempt',r.original_attempt,'budgetVersion','capital-s11-operational-budget.v1','researchReservationVersion','public-research-reservation.s11.v1','researchReservationMicroUsd',research_reserve,'effectiveBudgetMicroUsd',effective_budget,'effectiveMaxDispatches',effective_dispatches)::text,'sha256'),'hex');
 select * into s from private.capital_s11_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if s.id is not null then
 if s.context_retained_payload_id<>p_context_retained_payload_id or s.recipe_fingerprint<>fp or s.reconstruction_fingerprint<>p_reconstruction_fingerprint then raise exception 'capital_s11_recipe_conflict' using errcode='23505';end if;
 else
 for component in select value from jsonb_array_elements(p_components) loop
 ordinal:=ordinal+1;
 if jsonb_typeof(component) is distinct from 'object' or not(component?&array['slot','id','version','bodyFingerprint']) or component-array['slot','id','version','bodyFingerprint']<>'{}' or component->>'bodyFingerprint'!~'^[a-f0-9]{64}$' or jsonb_typeof(component->'version') is distinct from 'number' or(component->>'version')::numeric<>trunc((component->>'version')::numeric) or(component->>'version')::numeric<1 then raise exception 'capital_s11_recipe_invalid' using errcode='22023';end if;
 expected:=null;expected_version:=null;
 case component->>'slot'
 when 'company' then expected:=r.session_id;expected_version:=1;
 when 'brief' then expected:=r.brief_id;select brief_version into expected_version from public.capital_project_briefs where organization_id=j.organization_id and id=r.brief_id;
 when 'institution' then expected:=r.plan_id;select plan_version into expected_version from public.capital_project_plans where organization_id=j.organization_id and id=r.plan_id;
 when 'revision' then expected:=r.job_id;expected_version:=1;
 when 'research' then expected:=r.id;expected_version:=1;
 when 'dependency' then
 select * into dep from public.capital_project_artifacts where organization_id=j.organization_id and capital_project_id=r.work_id and id=(component->>'id')::uuid and status not in ('stale','superseded');
 if dep.id is null or not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id join public.capital_project_plan_tasks m07 on m07.organization_id=pt.organization_id and m07.plan_id=r.plan_id and m07.task_id='M04' where tr.organization_id=j.organization_id and tr.id=dep.task_run_id and tr.status='succeeded' and pt.task_id=any(m07.dependencies)) then raise exception 'capital_s11_dependency_denied' using errcode='42501';end if;
 if component->>'bodyFingerprint' is distinct from encode(extensions.digest('{"artifactFingerprint":'||to_jsonb(dep.artifact_fingerprint)::text||'}','sha256'),'hex') then raise exception 'capital_s11_dependency_pin_invalid' using errcode='22023';end if;
 if not exists(select 1 from private.capital_s11_task_projections bridge join private.capital_public_retained_payloads physical on physical.organization_id=bridge.organization_id and physical.id=bridge.derived_retained_payload_id
 join private.capital_public_payload_allocations allocation on allocation.organization_id=physical.organization_id and allocation.id=physical.allocation_id
 where bridge.organization_id=j.organization_id and bridge.recipe_id=r.id and bridge.capital_artifact_id=dep.id and bridge.artifact_fingerprint=dep.artifact_fingerprint
 and private.capital_body_physical_receipt_v1(j.organization_id,physical.id) and private.capital_s11_allocation_deadline_v1(j.organization_id,allocation.id,j.authorization_subject_id) is not null)
 then raise exception 'capital_s11_dependency_body_denied' using errcode='42501';end if;
 expected:=dep.id;expected_version:=dep.artifact_version;
 when 'source' then
 select l.* into lic from private.capital_public_delivery_licenses l join private.capital_public_deliveries d on d.organization_id=l.organization_id and d.id=l.delivery_id join private.capital_public_input_snapshots snap on snap.organization_id=d.organization_id and snap.id=d.capture_id where l.organization_id=j.organization_id and l.delivery_id=(component->>'id')::uuid and snap.job_id=j.id;
 select z.* into a from private.capital_public_retained_payloads p join private.capital_public_payload_allocations z on z.organization_id=p.organization_id and z.id=p.allocation_id where p.organization_id=j.organization_id and z.job_id=j.id and z.content_kind='public_source' and z.license_id=lic.id order by p.created_at limit 1;
 if lic.id is null or a.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id)) or private.capital_public_retention_deadline_v1(lic.id,j.organization_id,a.retained_at,a.policy_id) is null then raise exception 'capital_s11_source_denied' using errcode='42501';end if;
 expected:=lic.delivery_id;expected_version:=1;
 else raise exception 'capital_s11_recipe_invalid' using errcode='22023';end case;
 if expected is distinct from (component->>'id')::uuid or expected_version is distinct from(component->>'version')::integer or (component->>'slot'<>'source' and(component?'licenseId' or component?'retainedPayloadId')) then raise exception 'capital_s11_component_denied' using errcode='42501';end if;
 insert into private.capital_s11_recipe_components(organization_id,work_id,recipe_id,component_no,slot,reference_id,version,body_fingerprint,retained_payload_id,license_id,dependency_artifact_id)
 values(j.organization_id,r.work_id,r.id,ordinal,component->>'slot',expected,expected_version,component->>'bodyFingerprint',case when component->>'slot'='source' then(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id) end,case when component->>'slot'='source' then lic.id end,case when component->>'slot'='dependency' then dep.id end);
 end loop;
 deadline:=private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if deadline is null then raise exception 'capital_s11_denied' using errcode='42501';end if;
 run:=private.worker_start_capital_project_task(j.id,p_capability_token,'M04','offroad.capital_planning','2026.09.24-v2',p_reconstruction_fingerprint,jsonb_build_object('schemaVersion','capital-s11-task-context.v1','recipeId',r.id,'recipeFingerprint',fp,'contextRetainedPayloadId',p_context_retained_payload_id));
 insert into private.capital_s11_recipe_seals(organization_id,work_id,recipe_id,task_run_id,context_retained_payload_id,recipe_fingerprint,reconstruction_fingerprint,prompt_fingerprint,primary_request_fingerprint,fallback_request_fingerprint,research_status,research_jurisdiction,research_jurisdiction_needs_confirmation,research_strategy_fingerprint,budget_version,research_reservation_version,research_reservation_micro_usd,effective_budget_micro_usd,effective_max_dispatches,sealed_at)
 values(j.organization_id,r.work_id,r.id,run,p_context_retained_payload_id,fp,p_reconstruction_fingerprint,p_prompt_fingerprint,p_primary_request_fingerprint,p_fallback_request_fingerprint,p_research_status,p_jurisdiction,p_jurisdiction_needs_confirmation,p_strategy_fingerprint,'capital-s11-operational-budget.v1','public-research-reservation.s11.v1',research_reserve,effective_budget,effective_dispatches,clock_timestamp()) returning * into s;
 end if;
 if private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_denied' using errcode='42501';end if;
 return private.capital_s11_recipe_dto_v1(j.organization_id,r.id);
end; $$;

create function private.require_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns private.capital_s11_recipes language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_s11_recipes;s private.capital_s11_recipe_seals;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-recipe:'||j.organization_id::text||':'||p_recipe_id::text,0)) then raise exception 'capital_s11_retry' using errcode='40001';end if;
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and job_id=j.id and id=p_recipe_id;
 select * into s from private.capital_s11_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if r.id is null or s.id is null or r.worker_account_id<>auth.uid() or r.human_subject_id<>j.authorization_subject_id
 or private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null
 or not private.capital_body_physical_receipt_v1(j.organization_id,s.context_retained_payload_id)
 or not private.capital_body_retention_healthy_v1(r.retention_policy_id,j.organization_id,(select allocation_id from private.capital_public_retained_payloads where organization_id=j.organization_id and id=s.context_retained_payload_id))
 or not exists(select 1 from public.capital_project_task_runs tr where tr.organization_id=j.organization_id and tr.id=s.task_run_id and tr.processing_job_id=j.id and tr.input_fingerprint=s.reconstruction_fingerprint and (tr.status in ('running','succeeded') or(tr.status='failed' and exists(select 1 from private.capital_s11_quality_failures q where q.organization_id=tr.organization_id and q.recipe_id=r.id and q.task_run_id=tr.id and q.quality_results=tr.quality_results and tr.error=jsonb_build_object('code','capital_s11_quality_failed'))) or(tr.status='failed' and exists(select 1 from private.capital_s11_execution_failures q where q.organization_id=tr.organization_id and q.recipe_id=r.id and q.task_run_id=tr.id and tr.quality_results='[]'::jsonb and tr.error=jsonb_build_object('code','capital_s11_execution_failed','reason',q.reason)))))
 or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recipe_denied' using errcode='42501';end if;
 return r;
end; $$;
