-- Prospective shared native recipe boundary. Initially admits only two closed
-- deterministic provider families. No source/license, model outcome or approval
-- is manufactured. Physical bytes reuse the typed-body retention/purge service.
set search_path='';
create table private.capital_native_recipes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 job_id uuid not null,plan_id uuid not null,brief_id uuid not null,session_id uuid not null,
 family text not null check(family in('provider_research','provider_case_fit')),
 human_subject_id uuid not null references auth.users(id),worker_account_id uuid not null references auth.users(id),
 context_fingerprint text not null check(context_fingerprint~'^[a-f0-9]{64}$'),brief_fingerprint text not null check(brief_fingerprint~'^[a-f0-9]{64}$'),
 plan_fingerprint text not null check(plan_fingerprint~'^[a-f0-9]{64}$'),catalog_fingerprint text check(catalog_fingerprint~'^[a-f0-9]{64}$'),
 executor_version text not null check(executor_version in('2026.09.10-v1','2026.09.10-v2')),
 context_byte_length bigint not null check(context_byte_length between 1 and 1048576),as_of timestamptz not null,locale text not null check(locale in('pt-BR','en-US')),objective_fingerprint text not null check(objective_fingerprint~'^[a-f0-9]{64}$'),
 captured_at timestamptz not null,expires_at timestamptz not null check(isfinite(expires_at)),retention_policy_id uuid not null references private.capital_public_retention_policies(id),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,job_id),unique(organization_id,work_id,plan_id,brief_id,family),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,plan_id) references public.capital_project_plans(organization_id,id),
 foreign key(organization_id,brief_id) references public.capital_project_briefs(organization_id,id),
 foreign key(organization_id,session_id) references public.document_intake_sessions(organization_id,id)
);
create index capital_native_recipe_plan_fk on private.capital_native_recipes(organization_id,plan_id);
create index capital_native_recipe_brief_fk on private.capital_native_recipes(organization_id,brief_id);
create index capital_native_recipe_session_fk on private.capital_native_recipes(organization_id,session_id);
create index capital_native_recipe_human_fk on private.capital_native_recipes(human_subject_id);
create index capital_native_recipe_worker_fk on private.capital_native_recipes(worker_account_id);
create index capital_native_recipe_policy_fk on private.capital_native_recipes(retention_policy_id);
create table private.capital_native_provider_resource_pins (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),recipe_id uuid not null,
 source_class text not null check(source_class in('registered','directory')),fund_id uuid,directory_id uuid,
 observation_fingerprint text not null check(observation_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(organization_id,id),
 foreign key(organization_id,recipe_id) references private.capital_native_recipes(organization_id,id),
 foreign key(organization_id,fund_id) references public.funds(organization_id,id),foreign key(directory_id) references public.fund_directory(id),
 check((source_class='registered' and fund_id is not null and directory_id is null)or(source_class='directory' and directory_id is not null and fund_id is null)),
 unique nulls not distinct(organization_id,recipe_id,source_class,fund_id,directory_id)
);
create index capital_native_provider_pin_fund_fk on private.capital_native_provider_resource_pins(organization_id,fund_id);
create index capital_native_provider_pin_directory_fk on private.capital_native_provider_resource_pins(directory_id);
create table private.capital_native_recipe_closures (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,recipe_id uuid not null,
 context_retained_payload_id uuid not null,catalog_retained_payload_id uuid,catalog_delivery_id uuid,
 closure_fingerprint text not null check(closure_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(organization_id,id),unique(organization_id,recipe_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_native_recipes(organization_id,work_id,id),
 foreign key(organization_id,context_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,catalog_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,catalog_delivery_id) references private.capital_public_deliveries(organization_id,id),
 check((catalog_retained_payload_id is null)=(catalog_delivery_id is null))
);
create index capital_native_closure_context_fk on private.capital_native_recipe_closures(organization_id,context_retained_payload_id);
create index capital_native_closure_catalog_fk on private.capital_native_recipe_closures(organization_id,catalog_retained_payload_id);
create index capital_native_closure_delivery_fk on private.capital_native_recipe_closures(organization_id,catalog_delivery_id);
-- Extend the common typed bases by a disjoint legitimate server origin. Existing
-- contribution/accepted rows retain their exact invariants and origin foreign keys.
alter table private.capital_body_bases add column native_recipe_id uuid,add column native_task_id text,add column native_artifact_type text,
 add foreign key(organization_id,work_id,native_recipe_id) references private.capital_native_recipes(organization_id,work_id,id);
create index capital_native_body_recipe_fk on private.capital_body_bases(organization_id,work_id,native_recipe_id);
alter table private.capital_body_bases drop constraint capital_body_bases_kind_check,drop constraint capital_body_bases_body_schema_version_check,drop constraint capital_body_bases_check;
alter table private.capital_body_bases add constraint capital_body_bases_kind_check check(kind in('contribution_input','gateway_accepted_output','native_recipe_context','native_deterministic_result')),
 add constraint capital_body_bases_body_schema_version_check check(body_schema_version in('capital-body.contribution.v1','origination_senior_readout_v2','capital-native-provider-context.v1','capital-native-provider-result.v1')),
 add constraint capital_body_bases_check check(
 (kind='contribution_input' and origin_id is not null and accepted_invocation_id is null and body_schema_version='capital-body.contribution.v1' and native_recipe_id is null and native_task_id is null and native_artifact_type is null)
 or(kind='gateway_accepted_output' and origin_id is null and accepted_invocation_id is not null and body_schema_version='origination_senior_readout_v2' and native_recipe_id is null and native_task_id is null and native_artifact_type is null)
 or(kind='native_recipe_context' and origin_id is null and accepted_invocation_id is null and native_recipe_id is not null and body_schema_version='capital-native-provider-context.v1' and native_task_id is null and native_artifact_type is null)
 or(kind='native_deterministic_result' and origin_id is null and accepted_invocation_id is null and native_recipe_id is not null and body_schema_version='capital-native-provider-result.v1' and native_task_id in('M01','K01','K02') and native_artifact_type is not null));
create unique index capital_native_context_basis_key on private.capital_body_bases(organization_id,native_recipe_id) where kind='native_recipe_context';
create unique index capital_native_result_basis_key on private.capital_body_bases(organization_id,native_recipe_id,native_task_id,native_artifact_type) where kind='native_deterministic_result';
do $security$ declare t text;begin
 foreach t in array array['capital_native_recipes','capital_native_provider_resource_pins','capital_native_recipe_closures']loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy %I on private.%I for select to anon,authenticated using(false)',t||'_deny_select',t);
 execute format('create policy %I on private.%I for insert to anon,authenticated with check(false)',t||'_deny_insert',t);
 execute format('create policy %I on private.%I for update to anon,authenticated using(false)with check(false)',t||'_deny_update',t);
 execute format('create policy %I on private.%I for delete to anon,authenticated using(false)',t||'_deny_delete',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end $security$;
create function private.capital_native_recipe_deadline_v1(p_org uuid,p_recipe uuid,p_subject uuid)returns timestamptz
language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_native_recipes;c private.capital_native_recipe_closures;deadline timestamptz;parent private.capital_public_payload_allocations;bound timestamptz;
begin
 select * into r from private.capital_native_recipes where organization_id=p_org and id=p_recipe;
 if not found then return null;end if;
 begin
 perform 1 from public.capital_project_briefs where organization_id=p_org and id=r.brief_id for share nowait;
 perform 1 from public.capital_project_plans where organization_id=p_org and id=r.plan_id for share nowait;
 perform 1 from public.funds f join private.capital_native_provider_resource_pins pin on pin.organization_id=f.organization_id and pin.fund_id=f.id
 where pin.organization_id=p_org and pin.recipe_id=r.id order by f.id for share of f nowait;
 perform 1 from public.fund_directory d join private.capital_native_provider_resource_pins pin on pin.directory_id=d.id
 where pin.organization_id=p_org and pin.recipe_id=r.id order by d.id for share of d nowait;
 perform 1 from private.capital_public_retention_controls where singleton for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry'using errcode='40001';end;
 if not exists(select 1 from private.capital_public_retention_controls where singleton and enabled)then return null;end if;
 if p_subject is null or not private.capital_body_subject_allowed_v1(p_org,r.work_id,p_subject)
 or not private.capital_body_subject_allowed_v1(p_org,r.work_id,r.human_subject_id)
 or not exists(select 1 from public.capital_project_briefs where organization_id=p_org and id=r.brief_id and capital_project_id=r.work_id and status='active' and content_fingerprint=r.brief_fingerprint)
 or not exists(select 1 from public.capital_project_plans where organization_id=p_org and id=r.plan_id and capital_project_id=r.work_id and status='active' and plan_fingerprint=r.plan_fingerprint)
 or exists(select 1 from private.capital_native_provider_resource_pins pin where pin.organization_id=p_org and pin.recipe_id=r.id and
 ((pin.source_class='registered' and not exists(select 1 from public.funds f where f.organization_id=p_org and f.id=pin.fund_id))
 or(pin.source_class='directory' and not exists(select 1 from public.fund_directory d where d.id=pin.directory_id and d.claimed_by_organization_id=p_org))))then return null;end if;
 deadline:=r.expires_at;
 select * into c from private.capital_native_recipe_closures where organization_id=p_org and recipe_id=r.id;
 if c.id is not null then
 select a.* into parent from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations a on a.organization_id=retained.organization_id and a.id=retained.allocation_id
 join private.capital_body_bases basis on basis.organization_id=a.organization_id and basis.id=a.body_basis_id
 where retained.organization_id=p_org and retained.id=c.context_retained_payload_id and basis.native_recipe_id=r.id and basis.kind='native_recipe_context'
 and a.payload_fingerprint=r.context_fingerprint and a.byte_length=r.context_byte_length;
 if not found or not private.capital_body_physical_receipt_v1(p_org,c.context_retained_payload_id)then return null;end if;
 deadline:=least(deadline,parent.expires_at,parent.purge_at);
 end if;
 if c.catalog_retained_payload_id is not null then
 select a.* into parent from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations a on a.organization_id=retained.organization_id and a.id=retained.allocation_id
 where retained.organization_id=p_org and retained.id=c.catalog_retained_payload_id and a.content_kind='public_source' and a.delivery_id=c.catalog_delivery_id;
 if not found or not private.capital_body_physical_receipt_v1(p_org,c.catalog_retained_payload_id)then return null;end if;
 bound:=private.capital_public_retention_deadline_v1(parent.license_id,p_org,parent.retained_at,parent.policy_id);
 if bound is null then return null;end if;deadline:=least(deadline,bound,parent.expires_at,parent.purge_at);
 end if;
 return case when deadline>clock_timestamp()then deadline end;
end$$;
alter function private.capital_body_allocation_deadline_v1(uuid,uuid,uuid,integer)rename to capital_body_allocation_deadline_pre_native_v1;
create function private.capital_body_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid,p_depth integer default 0)returns timestamptz
language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;b private.capital_body_bases;deadline timestamptz;margin integer;previous_allocation uuid;previous_deadline timestamptz;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 select * into b from private.capital_body_bases where organization_id=p_org and id=a.body_basis_id;
 if b.native_recipe_id is null then return private.capital_body_allocation_deadline_pre_native_v1(p_org,p_allocation,p_subject,p_depth);end if;
 if p_depth>127 or not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=p_org and allocation_id=a.id and status='pending')then return null;end if;
 if b.kind='native_deterministic_result' and not exists(select 1 from private.capital_native_recipe_closures where organization_id=p_org and recipe_id=b.native_recipe_id)then return null;end if;
 deadline:=private.capital_native_recipe_deadline_v1(p_org,b.native_recipe_id,p_subject);
 if b.kind='native_deterministic_result' then
 select allocation.id into previous_allocation from private.capital_native_result_seals seal
 join private.capital_native_result_bindings binding on binding.organization_id=seal.organization_id and binding.id=seal.predecessor_result_id
 join private.capital_public_retained_payloads retained on retained.organization_id=binding.organization_id and retained.id=binding.retained_payload_id
 join private.capital_public_payload_allocations allocation on allocation.organization_id=retained.organization_id and allocation.id=retained.allocation_id
 where seal.organization_id=p_org and seal.recipe_id=b.native_recipe_id and seal.task_id=b.native_task_id;
 if found then
 previous_deadline:=private.capital_body_allocation_deadline_v1(p_org,previous_allocation,p_subject,p_depth+1);
 if previous_deadline is null then return null;end if;deadline:=least(deadline,previous_deadline);
 end if;
 end if;
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=a.policy_id;
 return case when deadline is not null and least(deadline,a.purge_at)>clock_timestamp()then least(deadline,a.expires_at,
 (select effective_purge_at+make_interval(secs=>margin)from private.capital_public_payload_purge_queue where organization_id=p_org and allocation_id=a.id and status='pending'))end;
end$$;
create function private.capital_native_allocate_body_v1(p_job uuid,p_cap text,p_recipe uuid,p_kind text,p_task text,p_type text,p_body jsonb)returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job,p_cap);r private.capital_native_recipes;b private.capital_body_bases;a private.capital_public_payload_allocations;
 stamp timestamptz:=clock_timestamp();deadline timestamptz;p private.capital_public_retention_policies;fp text;size bigint;request uuid;allocation uuid:=gen_random_uuid();
begin
 select * into r from private.capital_native_recipes where organization_id=j.organization_id and id=p_recipe and job_id=j.id;
 if not found or p_body is null or jsonb_typeof(p_body)<>'object' or p_kind not in('native_recipe_context','native_deterministic_result')then raise exception 'capital_native_body_denied' using errcode='42501';end if;
 if(p_kind='native_recipe_context' and(p_task is not null or p_type is not null))or(p_kind='native_deterministic_result' and(p_task is null or p_type is null or p_task not in('M01','K01','K02')))then raise exception 'capital_native_body_invalid' using errcode='22023';end if;
 fp:=encode(extensions.digest(p_body::text,'sha256'),'hex');size:=octet_length(p_body::text);
 if size not between 1 and 1048576 or(p_kind='native_recipe_context' and(fp<>r.context_fingerprint or size<>r.context_byte_length))then raise exception 'capital_native_context_conflict' using errcode='23505';end if;
 deadline:=private.capital_native_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id)then raise exception 'capital_native_retention_denied' using errcode='42501';end if;
 request:=md5(r.id::text||':'||p_kind||':'||coalesce(p_task,'')||':'||coalesce(p_type,''))::uuid;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-native-body:'||j.organization_id::text||':'||request::text,0))then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and job_id=j.id and request_id=request and content_kind='typed_body';
 if found then
 select * into strict b from private.capital_body_bases where organization_id=j.organization_id and id=a.body_basis_id;
 if a.payload_fingerprint<>fp or a.byte_length<>size or b.native_recipe_id is distinct from r.id or b.kind<>p_kind or b.native_task_id is distinct from p_task or b.native_artifact_type is distinct from p_type then raise exception 'capital_native_body_conflict' using errcode='23505';end if;
 deadline:=private.capital_body_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if deadline is null then raise exception 'capital_native_retention_denied' using errcode='42501';end if;
 return private.capital_body_dto_v1(j.organization_id,a.id,deadline,true)||case when exists(select 1 from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id)then '{}'::jsonb else jsonb_build_object('canonicalBody',p_body::text)end;
 end if;
 insert into private.capital_body_bases(organization_id,work_id,kind,body_schema_version,native_recipe_id,native_task_id,native_artifact_type)
 values(j.organization_id,r.work_id,p_kind,case p_kind when 'native_recipe_context'then 'capital-native-provider-context.v1'else 'capital-native-provider-result.v1'end,r.id,p_task,p_type)returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,payload_fingerprint,byte_length,object_path,
 retained_at,expires_at,purge_at,upload_expires_at,body_basis_id,content_kind)
 values(allocation,j.organization_id,request,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,size,j.organization_id::text||'/'||allocation::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'typed_body')returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at)values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 perform private.require_capital_body_retention_ready_v1(p.id,j.organization_id,a.id);
 if not private.capital_public_capture_clock_current_v1(j.id,p_cap)or private.capital_native_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id)is null then raise exception 'capital_native_capability_expired' using errcode='42501';end if;
 return private.capital_body_dto_v1(j.organization_id,a.id,deadline,false)||jsonb_build_object('canonicalBody',p_body::text);
end$$;
create function private.worker_prepare_capital_native_recipe_v1(p_job_id uuid,p_capability_token text)returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_native_recipes;c jsonb;pin jsonb;p private.capital_public_retention_policies;stamp timestamptz:=clock_timestamp();b public.capital_project_briefs;
begin
 if j.payload->>'analysis_scope'not in('provider_research','provider_case_fit')or j.payload->'capital_task_ids'is distinct from '["M01","K01","K02"]'::jsonb
 or j.payload->'model_budget'is distinct from '{"max_cost_usd":0,"max_calls":0}'::jsonb or j.payload?'revision_of_artifact_id'then raise exception 'capital_native_provider_job_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-native-recipe:'||j.organization_id::text||':'||j.id::text,0))then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into r from private.capital_native_recipes where organization_id=j.organization_id and job_id=j.id;
 if found then
 if exists(select 1 from private.capital_native_recipe_closures where organization_id=j.organization_id and recipe_id=r.id)then raise exception 'capital_native_recovery_required'using errcode='42501';end if;
 if private.capital_native_recipe_deadline_v1(r.organization_id,r.id,j.authorization_subject_id)is null then raise exception 'capital_native_pending_capture_denied'using errcode='42501';end if;
 c:=private.capital_public_capture_context_v1(j.id,p_capability_token);
 if encode(extensions.digest(c::text,'sha256'),'hex')<>r.context_fingerprint or octet_length(c::text)<>r.context_byte_length then raise exception 'capital_native_original_capture_changed'using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-native-recipe-preparation.v1','recipeId',r.id,'family',r.family,'jobId',r.job_id,'organizationId',r.organization_id,'workId',r.work_id,
 'planId',r.plan_id,'briefId',r.brief_id,'contextFingerprint',r.context_fingerprint,'contextByteLength',r.context_byte_length,'catalogFingerprint',r.catalog_fingerprint,'expiresAt',r.expires_at,
 'body',private.capital_native_allocate_body_v1(j.id,p_capability_token,r.id,'native_recipe_context',null,null,c));
 end if;
 c:=private.capital_public_capture_context_v1(j.id,p_capability_token);
 if jsonb_array_length(coalesce(c->'priorArtifacts','[]'::jsonb))>0 then raise exception 'capital_native_legacy_prior_denied' using errcode='42501';end if;
 perform private.worker_load_capital_project_capture_context_v1(j.id,p_capability_token);
 select * into strict b from public.capital_project_briefs where organization_id=j.organization_id and id=(j.payload->>'capital_project_brief_id')::uuid;
 select policy.* into p from private.capital_public_retention_policies policy join private.capital_public_retention_controls controls on controls.policy_id=policy.id where controls.singleton and controls.enabled;
 if not found or not private.capital_public_retention_healthy_v1(j.leased_by,p.id)then raise exception 'capital_native_retention_denied' using errcode='42501';end if;
 insert into private.capital_native_recipes(organization_id,work_id,job_id,plan_id,brief_id,session_id,family,human_subject_id,worker_account_id,context_fingerprint,brief_fingerprint,
 plan_fingerprint,catalog_fingerprint,executor_version,context_byte_length,as_of,locale,objective_fingerprint,captured_at,expires_at,retention_policy_id)
 values(j.organization_id,(j.payload->>'capital_project_id')::uuid,j.id,(j.payload->>'capital_project_plan_id')::uuid,b.id,j.intake_session_id,j.payload->>'analysis_scope',j.authorization_subject_id,auth.uid(),
 encode(extensions.digest(c::text,'sha256'),'hex'),b.content_fingerprint,c->>'planFingerprint',c#>>'{publicCatalog,sourceFingerprint}',case when c->>'schemaVersion'='provider-research-context.v2' then '2026.09.10-v2'else '2026.09.10-v1'end,octet_length(c::text),(c->>'asOf')::timestamptz,c->>'locale',encode(extensions.digest(c->>'objective','sha256'),'hex'),stamp,stamp+make_interval(secs=>p.maximum_retention_seconds),p.id)returning * into r;
 for pin in select value from jsonb_array_elements(c->'providers')loop
 insert into private.capital_native_provider_resource_pins(organization_id,recipe_id,source_class,fund_id,directory_id,observation_fingerprint)
 values(j.organization_id,r.id,pin->>'sourceClass',case when pin->>'sourceClass'='registered'then(pin->>'providerId')::uuid end,
 case when pin->>'sourceClass'='directory'then(pin->>'providerId')::uuid end,encode(extensions.digest(pin::text,'sha256'),'hex'));
 end loop;
 return jsonb_build_object('schemaVersion','capital-native-recipe-preparation.v1','recipeId',r.id,'family',r.family,'jobId',r.job_id,'organizationId',r.organization_id,'workId',r.work_id,
 'planId',r.plan_id,'briefId',r.brief_id,'contextFingerprint',r.context_fingerprint,'contextByteLength',r.context_byte_length,'catalogFingerprint',r.catalog_fingerprint,'expiresAt',r.expires_at,
 'body',private.capital_native_allocate_body_v1(j.id,p_capability_token,r.id,'native_recipe_context',null,null,c));
end$$;

-- Finalization admits only a verified physical context and, for v2, a real
-- published/licensed catalogue delivery whose bytes close all consumed sources.
create function private.capital_native_recipe_dto_v1(p_org uuid,p_recipe uuid)returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-native-recipe-receipt.v1','recipeId',r.id,'family',r.family,'jobId',r.job_id,
 'organizationId',r.organization_id,'workId',r.work_id,'planId',r.plan_id,'briefId',r.brief_id,'contextFingerprint',r.context_fingerprint,
 'retainedPayloadId',c.context_retained_payload_id,'contextByteLength',r.context_byte_length,'expiresAt',r.expires_at,'closed',true,
 'catalogRetainedPayloadId',c.catalog_retained_payload_id,'catalogFingerprint',r.catalog_fingerprint)
 from private.capital_native_recipes r join private.capital_native_recipe_closures c on c.organization_id=r.organization_id and c.recipe_id=r.id
 where r.organization_id=p_org and r.id=p_recipe;
$$;
create function private.worker_finalize_capital_native_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,
 p_context_retained_payload_id uuid,p_catalog_retained_payload_id uuid default null,p_catalog_payload jsonb default null)returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_native_recipes;
 c private.capital_native_recipe_closures;a private.capital_public_payload_allocations;ca private.capital_public_payload_allocations;
 catalog jsonb;deadline timestamptz;closure_fp text;
begin
 select * into r from private.capital_native_recipes where organization_id=j.organization_id and id=p_recipe_id and job_id=j.id for share;
 if not found then raise exception 'capital_native_recipe_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-native-close:'||r.organization_id::text||':'||r.id::text,0))then raise exception 'capital_capture_retry' using errcode='40001';end if;
 deadline:=private.capital_native_recipe_deadline_v1(r.organization_id,r.id,j.authorization_subject_id);
 select allocation.* into a from private.capital_public_retained_payloads retained
 join private.capital_public_payload_allocations allocation on allocation.organization_id=retained.organization_id and allocation.id=retained.allocation_id
 join private.capital_body_bases basis on basis.organization_id=allocation.organization_id and basis.id=allocation.body_basis_id
 where retained.organization_id=r.organization_id and retained.id=p_context_retained_payload_id and allocation.job_id=j.id
 and basis.native_recipe_id=r.id and basis.kind='native_recipe_context' and allocation.payload_fingerprint=r.context_fingerprint and allocation.byte_length=r.context_byte_length;
 if not found or deadline is null or not private.capital_body_physical_receipt_v1(r.organization_id,p_context_retained_payload_id)
 or private.capital_body_allocation_deadline_v1(r.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_native_context_retention_denied' using errcode='42501';end if;
 if r.catalog_fingerprint is null then
 if p_catalog_retained_payload_id is not null or p_catalog_payload is not null then raise exception 'capital_native_unexpected_catalog' using errcode='22023';end if;
 else
 if p_catalog_retained_payload_id is null or jsonb_typeof(p_catalog_payload)<>'object' or p_catalog_payload->>'snippet' is null then raise exception 'capital_native_catalog_publication_required' using errcode='42501';end if;
 select allocation.* into ca from private.capital_public_retained_payloads retained
 join private.capital_public_payload_allocations allocation on allocation.organization_id=retained.organization_id and allocation.id=retained.allocation_id
 join private.capital_public_deliveries delivery on delivery.organization_id=allocation.organization_id and delivery.id=allocation.delivery_id
 join private.capital_public_input_snapshots capsule on capsule.organization_id=delivery.organization_id and capsule.id=delivery.capture_id
 where retained.organization_id=r.organization_id and retained.id=p_catalog_retained_payload_id and allocation.job_id=j.id and allocation.content_kind='public_source'
 and capsule.job_id=j.id and capsule.context_fingerprint=r.context_fingerprint
 and allocation.payload_fingerprint=encode(extensions.digest(p_catalog_payload::text,'sha256'),'hex') and allocation.byte_length=octet_length(p_catalog_payload::text);
 if not found or not private.capital_body_physical_receipt_v1(r.organization_id,p_catalog_retained_payload_id)
 or private.capital_public_retention_deadline_v1(ca.license_id,r.organization_id,ca.retained_at,ca.policy_id) is null then raise exception 'capital_native_catalog_license_denied' using errcode='42501';end if;
 begin catalog:=(p_catalog_payload->>'snippet')::jsonb;exception when others then raise exception 'capital_native_catalog_bytes_invalid' using errcode='22023';end;
 if jsonb_typeof(catalog)<>'object' or catalog->>'schemaVersion'<>'offroad.public-capital-research.v1'
 or jsonb_typeof(catalog->'sources')<>'array' or jsonb_array_length(catalog->'sources')=0
 or private.institutional_config_hash(catalog)<>r.catalog_fingerprint then raise exception 'capital_native_catalog_fingerprint_invalid' using errcode='22023';end if;
 -- The exact catalogue consumes the full source collection; an uncited source
 -- cannot evade the real transitive licence closure.
 if exists(select 1 from jsonb_array_elements(catalog->'sources') source where coalesce(source->>'url','')='' or not exists(
 select 1 from private.capital_public_delivery_license_pins pin join private.source_rights_versions rights
 on rights.organization_id=pin.licensing_organization_id and rights.source_version_id=pin.source_version_id and rights.id=pin.rights_version_id
 where pin.organization_id=r.organization_id and pin.license_id=ca.license_id and rights.public_source_url=source->>'url'))then
 raise exception 'capital_native_catalog_source_closure_denied' using errcode='42501';end if;
 end if;
 closure_fp:=encode(extensions.digest(jsonb_build_object('recipeId',r.id,'contextRetainedPayloadId',p_context_retained_payload_id,'catalogRetainedPayloadId',p_catalog_retained_payload_id,
 'catalogDeliveryId',ca.delivery_id,'contextFingerprint',r.context_fingerprint,'catalogFingerprint',r.catalog_fingerprint)::text,'sha256'),'hex');
 select * into c from private.capital_native_recipe_closures where organization_id=r.organization_id and recipe_id=r.id;
 if found then
 if c.context_retained_payload_id<>p_context_retained_payload_id or c.catalog_retained_payload_id is distinct from p_catalog_retained_payload_id or c.closure_fingerprint<>closure_fp then
 raise exception 'capital_native_closure_conflict' using errcode='23505';end if;
 else
 insert into private.capital_native_recipe_closures(organization_id,work_id,recipe_id,context_retained_payload_id,catalog_retained_payload_id,catalog_delivery_id,closure_fingerprint)
 values(r.organization_id,r.work_id,r.id,p_context_retained_payload_id,p_catalog_retained_payload_id,ca.delivery_id,closure_fp);
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token)or private.capital_native_recipe_deadline_v1(r.organization_id,r.id,j.authorization_subject_id) is null
 or not private.capital_body_physical_receipt_v1(r.organization_id,p_context_retained_payload_id)
 or(p_catalog_retained_payload_id is not null and not private.capital_body_physical_receipt_v1(r.organization_id,p_catalog_retained_payload_id))then
 raise exception 'capital_native_finalize_authority_changed' using errcode='42501';end if;
 return private.capital_native_recipe_dto_v1(r.organization_id,r.id);
end$$;
-- A closed native reader accepts identities only. It cannot turn a caller path,
-- arbitrary retained object or boolean into a grant. New lease authority comes
-- from the same original job; the original receipt/capability is never rewritten.
create function private.worker_read_capital_native_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid,p_scope text)returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_native_recipes;c private.capital_native_recipe_closures;
 a private.capital_public_payload_allocations;deadline timestamptz;answer jsonb;
begin
 select * into r from private.capital_native_recipes where organization_id=j.organization_id and id=p_recipe_id and job_id=j.id;
 select * into c from private.capital_native_recipe_closures where organization_id=j.organization_id and recipe_id=r.id;
 if r.id is null or p_scope not in('context','catalog')or
 (p_scope='context' and c.id is not null and c.context_retained_payload_id<>p_retained_payload_id)or
 (p_scope='catalog'and c.id is null)or
 (p_scope='catalog' and c.catalog_retained_payload_id is distinct from p_retained_payload_id)then raise exception 'capital_native_reader_scope_denied' using errcode='42501';end if;
 deadline:=private.capital_native_recipe_deadline_v1(r.organization_id,r.id,j.authorization_subject_id);
 select allocation.* into a from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations allocation
 on allocation.organization_id=retained.organization_id and allocation.id=retained.allocation_id where retained.organization_id=r.organization_id and retained.id=p_retained_payload_id and allocation.job_id=j.id;
 if not found or(p_scope='context'and not exists(select 1 from private.capital_body_bases basis where basis.organization_id=r.organization_id and basis.id=a.body_basis_id and basis.native_recipe_id=r.id and basis.kind='native_recipe_context'and a.payload_fingerprint=r.context_fingerprint and a.byte_length=r.context_byte_length))
 or deadline is null or least(deadline,a.purge_at)<=clock_timestamp()or not private.capital_body_physical_receipt_v1(r.organization_id,p_retained_payload_id)then raise exception 'capital_native_reader_authority_denied' using errcode='42501';end if;
 answer:=private.capital_body_dto_v1(r.organization_id,a.id,deadline,true)||jsonb_build_object('recipeId',r.id,'retainedPayloadId',p_retained_payload_id,'scope',p_scope);
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token)or private.capital_native_recipe_deadline_v1(r.organization_id,r.id,j.authorization_subject_id) is null
 or not private.capital_body_physical_receipt_v1(r.organization_id,p_retained_payload_id)then raise exception 'capital_native_reader_authority_changed' using errcode='42501';end if;
 return answer;
end$$;

create table private.capital_native_result_seals(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,recipe_id uuid not null,
 task_id text not null check(task_id in('M01','K01','K02')),artifact_type text not null,task_run_id uuid not null,input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),
 body_fingerprint text not null check(body_fingerprint~'^[a-f0-9]{64}$'),body_byte_length bigint not null check(body_byte_length between 1 and 1048576),
 predecessor_result_id uuid,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id,task_id),unique(organization_id,task_run_id),
 foreign key(organization_id,work_id,recipe_id)references private.capital_native_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id)references public.capital_project_task_runs(organization_id,id)
);
create table private.capital_native_result_bindings(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,recipe_id uuid not null,seal_id uuid not null,
 capital_artifact_id uuid not null,artifact_id uuid not null,revision_id uuid not null,retained_payload_id uuid not null,
 artifact_fingerprint text not null check(artifact_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(organization_id,id),unique(organization_id,seal_id),unique(organization_id,revision_id),
 unique(organization_id,capital_artifact_id),
 foreign key(organization_id,work_id,recipe_id)references private.capital_native_recipes(organization_id,work_id,id),
 foreign key(organization_id,seal_id)references private.capital_native_result_seals(organization_id,id),
 foreign key(organization_id,capital_artifact_id)references public.capital_project_artifacts(organization_id,id)deferrable initially deferred,
 foreign key(organization_id,artifact_id,revision_id)references public.artifact_revisions(organization_id,artifact_id,id)deferrable initially deferred,
 foreign key(organization_id,retained_payload_id)references private.capital_public_retained_payloads(organization_id,id)
);
alter table private.capital_native_result_seals add foreign key(organization_id,predecessor_result_id)references private.capital_native_result_bindings(organization_id,id);
create index capital_native_seal_recipe_fk on private.capital_native_result_seals(organization_id,work_id,recipe_id);
create index capital_native_seal_predecessor_fk on private.capital_native_result_seals(organization_id,predecessor_result_id);
create index capital_native_binding_recipe_fk on private.capital_native_result_bindings(organization_id,work_id,recipe_id);
create index capital_native_binding_revision_fk on private.capital_native_result_bindings(organization_id,artifact_id,revision_id);
create index capital_native_binding_retained_fk on private.capital_native_result_bindings(organization_id,retained_payload_id);
do $security$declare t text;begin foreach t in array array['capital_native_result_seals','capital_native_result_bindings']loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy %I on private.%I for select to anon,authenticated using(false)',t||'_deny_select',t);
 execute format('create policy %I on private.%I for insert to anon,authenticated with check(false)',t||'_deny_insert',t);
 execute format('create policy %I on private.%I for update to anon,authenticated using(false)with check(false)',t||'_deny_update',t);
 execute format('create policy %I on private.%I for delete to anon,authenticated using(false)',t||'_deny_delete',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;end $security$;
create function private.capital_native_result_dto_v1(p_org uuid,p_binding uuid)returns jsonb
language sql stable security definer set search_path=''as $$
 select jsonb_build_object('schemaVersion','capital-native-result-receipt.v1','recipeId',r.id,'family',r.family,'taskId',s.task_id,'artifactType',s.artifact_type,
 'artifactId',b.capital_artifact_id,'revisionId',b.revision_id,'retainedPayloadId',b.retained_payload_id,'bodyFingerprint',s.body_fingerprint,'inputFingerprint',s.input_fingerprint,
 'artifactFingerprint',b.artifact_fingerprint,'contextFingerprint',r.context_fingerprint,'executorVersion',r.executor_version,'modelCalls',0,'grantsApproval',false,'grantsExternalEffect',false)
 from private.capital_native_result_bindings b join private.capital_native_result_seals s on s.organization_id=b.organization_id and s.id=b.seal_id
 join private.capital_native_recipes r on r.organization_id=b.organization_id and r.id=b.recipe_id where b.organization_id=p_org and b.id=p_binding;
$$;
create function private.worker_prepare_capital_native_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_id text,p_artifact_type text,p_content jsonb,p_predecessor_revision_id uuid default null)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_native_recipes;s private.capital_native_result_seals;
 previous private.capital_native_result_bindings;ps private.capital_native_result_seals;typ text;schema_name text;run uuid;input_fp text;body_fp text;expected_previous text;
begin
 select * into r from private.capital_native_recipes where organization_id=j.organization_id and id=p_recipe_id and job_id=j.id;
 if not found or private.capital_native_recipe_deadline_v1(r.organization_id,r.id,j.authorization_subject_id)is null
 or not exists(select 1 from private.capital_native_recipe_closures where organization_id=r.organization_id and recipe_id=r.id)then raise exception 'capital_native_result_recipe_denied'using errcode='42501';end if;
 typ:=r.family||case p_task_id when'M01'then'_scope'when'K01'then'_sources'when'K02'then''else'!denied'end;
 schema_name:=replace(r.family,'_','-')||case p_task_id when'M01'then'-scope.v1'when'K01'then'-sources.v1'when'K02'then case when r.executor_version='2026.09.10-v2' then'.v2'else'.v1'end end;
 if p_task_id not in('M01','K01','K02')or p_artifact_type is distinct from typ or jsonb_typeof(p_content)<>'object'
 or p_content->>'schemaVersion'is distinct from schema_name or p_content->>'projectId'is distinct from r.work_id::text or p_content->>'planId'is distinct from r.plan_id::text
 or (p_content->>'asOf')::timestamptz is distinct from r.as_of or(p_task_id in('M01','K02')and encode(extensions.digest(p_content->>'objective','sha256'),'hex')is distinct from r.objective_fingerprint)
 or(p_task_id='K02'and(p_content->'shortlistAuthorized'is distinct from'false'::jsonb or p_content->'externalEffectAllowed'is distinct from'false'::jsonb))
 or(p_content?'grantsApproval')or(p_content?'grantsExternalEffect')then raise exception 'capital_native_result_content_denied'using errcode='22023';end if;
 if r.catalog_fingerprint is not null and p_content#>>'{publicCatalog,sourceFingerprint}'is distinct from r.catalog_fingerprint then raise exception 'capital_native_result_catalog_denied'using errcode='22023';end if;
 expected_previous:=case p_task_id when'K01'then'M01'when'K02'then'K01'end;
 if expected_previous is null then
 if p_predecessor_revision_id is not null then raise exception 'capital_native_result_dependencies_denied'using errcode='22023';end if;
 else
 select b.* into previous from private.capital_native_result_bindings b join private.capital_native_result_seals seal on seal.organization_id=b.organization_id and seal.id=b.seal_id
 where b.organization_id=r.organization_id and b.revision_id=p_predecessor_revision_id and b.recipe_id=r.id and seal.task_id=expected_previous;
 if not found or not private.capital_body_physical_receipt_v1(r.organization_id,previous.retained_payload_id)then raise exception 'capital_native_result_dependencies_denied'using errcode='42501';end if;
 end if;
 input_fp:=encode(extensions.digest(jsonb_build_object('schemaVersion','capital-native-provider-input.v1','recipeId',r.id,'contextFingerprint',r.context_fingerprint,'taskId',p_task_id,
 'artifactType',typ,'executorVersion',r.executor_version,'predecessorRevisionId',previous.revision_id,'predecessorFingerprint',previous.artifact_fingerprint)::text,'sha256'),'hex');
 body_fp:=encode(extensions.digest(p_content::text,'sha256'),'hex');
 if not pg_try_advisory_xact_lock(hashtextextended('capital-native-task:'||r.organization_id::text||':'||r.id::text||':'||p_task_id,0))then raise exception 'capital_capture_retry'using errcode='40001';end if;
 select * into s from private.capital_native_result_seals where organization_id=r.organization_id and recipe_id=r.id and task_id=p_task_id;
 if found then
 if s.input_fingerprint<>input_fp or s.body_fingerprint<>body_fp or s.body_byte_length<>octet_length(p_content::text)or s.predecessor_result_id is distinct from previous.id then raise exception 'capital_native_result_conflict'using errcode='23505';end if;
 if exists(select 1 from private.capital_native_result_bindings where organization_id=r.organization_id and seal_id=s.id)then raise exception 'capital_native_result_recovery_required'using errcode='42501';end if;
 else
 run:=private.worker_start_capital_project_task(j.id,p_capability_token,p_task_id,r.family,r.executor_version,input_fp,
 jsonb_build_object('schemaVersion','capital-native-provider-task-context.v1','recipeId',r.id,'contextFingerprint',r.context_fingerprint,'modelCalls',0));
 insert into private.capital_native_result_seals(organization_id,work_id,recipe_id,task_id,artifact_type,task_run_id,input_fingerprint,body_fingerprint,body_byte_length,predecessor_result_id)
 values(r.organization_id,r.work_id,r.id,p_task_id,typ,run,input_fp,body_fp,octet_length(p_content::text),previous.id)returning * into s;
 end if;
 return jsonb_build_object('schemaVersion','capital-native-result-preparation.v1','recipeId',r.id,'sealId',s.id,'taskRunId',s.task_run_id,'taskId',s.task_id,'artifactType',s.artifact_type,
 'inputFingerprint',s.input_fingerprint,'body',private.capital_native_allocate_body_v1(j.id,p_capability_token,r.id,'native_deterministic_result',p_task_id,typ,p_content));
end$$;
-- This commit takes no caller quality array, model acceptance or approval grant.
-- Integrity outcomes are computed from the sealed input and verified body.
create function private.worker_commit_capital_native_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_seal_id uuid,p_retained_payload_id uuid)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_native_recipes;s private.capital_native_result_seals;b private.capital_native_result_bindings;
 a private.capital_public_payload_allocations;previous private.capital_native_result_bindings;manifest jsonb;metadata jsonb;quality jsonb;fp text;aid uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();canonical_id uuid;version integer;previous_head uuid;revision_number integer;
begin
 select * into r from private.capital_native_recipes where organization_id=j.organization_id and id=p_recipe_id and job_id=j.id;
 select * into s from private.capital_native_result_seals where organization_id=j.organization_id and recipe_id=r.id and id=p_seal_id;
 if r.id is null or s.id is null or private.capital_native_recipe_deadline_v1(r.organization_id,r.id,j.authorization_subject_id)is null then raise exception 'capital_native_commit_denied'using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-native-task:'||r.organization_id::text||':'||r.id::text||':'||s.task_id,0))then raise exception 'capital_capture_retry'using errcode='40001';end if;
 select allocation.* into a from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations allocation on allocation.organization_id=retained.organization_id and allocation.id=retained.allocation_id
 join private.capital_body_bases basis on basis.organization_id=allocation.organization_id and basis.id=allocation.body_basis_id
 where retained.organization_id=r.organization_id and retained.id=p_retained_payload_id and allocation.job_id=j.id and basis.native_recipe_id=r.id and basis.kind='native_deterministic_result'
 and basis.native_task_id=s.task_id and basis.native_artifact_type=s.artifact_type and allocation.payload_fingerprint=s.body_fingerprint and allocation.byte_length=s.body_byte_length;
 if not found or not private.capital_body_physical_receipt_v1(r.organization_id,p_retained_payload_id)or private.capital_body_allocation_deadline_v1(r.organization_id,a.id,j.authorization_subject_id)is null then raise exception 'capital_native_commit_body_denied'using errcode='42501';end if;
 select * into b from private.capital_native_result_bindings where organization_id=r.organization_id and seal_id=s.id;
 if found then
 if b.retained_payload_id<>p_retained_payload_id then raise exception 'capital_native_commit_conflict'using errcode='23505';end if;
 return private.capital_native_result_dto_v1(r.organization_id,b.id);
 end if;
 select * into previous from private.capital_native_result_bindings where organization_id=r.organization_id and id=s.predecessor_result_id;
 if s.predecessor_result_id is not null and(not found or not private.capital_body_physical_receipt_v1(r.organization_id,previous.retained_payload_id))then raise exception 'capital_native_commit_dependencies_denied'using errcode='42501';end if;
 perform 1 from public.capital_project_task_runs where organization_id=r.organization_id and id=s.task_run_id and processing_job_id=j.id and status='running'for update;
 if not found then raise exception 'capital_native_commit_task_denied'using errcode='42501';end if;
 metadata:=jsonb_build_object('schemaVersion','capital-native-provider-result-reference.v1','recipeId',r.id,'family',r.family,'taskId',s.task_id,'retainedPayloadId',p_retained_payload_id,
 'contextFingerprint',r.context_fingerprint,'inputFingerprint',s.input_fingerprint,'bodyFingerprint',s.body_fingerprint,'revisionId',rid,'byteLength',s.body_byte_length,'executorVersion',r.executor_version,'modelCalls',0,'grantsApproval',false,'grantsExternalEffect',false);
 fp:=encode(extensions.digest(metadata::text,'sha256'),'hex');
 if exists(select 1 from public.capital_project_artifacts where organization_id=r.organization_id and capital_project_id=r.work_id and artifact_type=s.artifact_type and status in('confirmed','approved'))then
 raise exception 'capital_native_confirmed_contribution_requires_invalidation'using errcode='55000';end if;
 update public.capital_project_artifacts set status='superseded',superseded_at=clock_timestamp()where organization_id=r.organization_id and capital_project_id=r.work_id and artifact_type=s.artifact_type and status not in('stale','superseded');
 select coalesce(max(artifact_version),0)+1 into version from public.capital_project_artifacts where organization_id=r.organization_id and capital_project_id=r.work_id and artifact_type=s.artifact_type;
 insert into public.artifacts(organization_id,work_id,kind,subject)values(r.organization_id,r.work_id,'work_product','native:'||r.family||':'||s.task_id)
 on conflict(organization_id,work_id,kind,subject)do nothing returning id into canonical_id;
 if canonical_id is null then select id,head_revision_id into strict canonical_id,previous_head from public.artifacts where organization_id=r.organization_id and work_id=r.work_id and kind='work_product'and subject='native:'||r.family||':'||s.task_id for update;end if;
 select coalesce(max(revision_no),0)+1 into revision_number from public.artifact_revisions where organization_id=r.organization_id and artifact_id=canonical_id;
 manifest:=jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','format','json','audience','internal','locale',j.payload->>'locale',
 'bytes',jsonb_build_object('sha256',s.body_fingerprint,'byteLength',s.body_byte_length,'storage',jsonb_build_object('bucket',a.bucket_id,'path',a.object_path)),
 'method',null,'execution',null,'inputSnapshot',jsonb_build_object('fingerprint',s.input_fingerprint),'institutionalResult',null,'sources','[]'::jsonb,'claims','[]'::jsonb,
 'traces',jsonb_build_array(jsonb_build_object('kind','native_provider_recipe','recipeId',r.id,'contextFingerprint',r.context_fingerprint,'modelCalls',0)),
 'template',null,'provenance',jsonb_build_object('producer','capital_native_provider','jobId',j.id,'taskRunId',s.task_run_id,'messageId',null,'capability',null),'legacy',null);
 insert into private.capital_native_result_bindings(organization_id,work_id,recipe_id,seal_id,capital_artifact_id,artifact_id,revision_id,retained_payload_id,artifact_fingerprint)
 values(r.organization_id,r.work_id,r.id,s.id,aid,canonical_id,rid,p_retained_payload_id,fp)returning * into b;
 insert into public.artifact_revisions(id,organization_id,artifact_id,revision_no,previous_revision_id,audience,origin,manifest,manifest_fingerprint,content_sha256,byte_length)
 values(rid,r.organization_id,canonical_id,revision_number,previous_head,'internal','worker',manifest,encode(extensions.digest(manifest::text,'sha256'),'hex'),s.body_fingerprint,s.body_byte_length);
 update public.artifacts set head_revision_id=rid where organization_id=r.organization_id and id=canonical_id;
 if previous.id is not null then insert into private.artifact_dependency_links(organization_id,revision_id,link_kind,derived_from_revision_id)values(r.organization_id,rid,'artifact_revision',previous.revision_id);end if;
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,evidence_refs,dependencies,processing_job_id,created_by_kind)
 values(aid,r.organization_id,r.work_id,r.plan_id,s.task_run_id,s.artifact_type,'capital-native-provider-result-reference.v1',version,'draft',s.input_fingerprint,fp,metadata,'[]',
 case when previous.id is null then'[]'::jsonb else jsonb_build_array(jsonb_build_object('artifactId',previous.capital_artifact_id,'artifactFingerprint',previous.artifact_fingerprint))end,j.id,'worker');
 quality:=jsonb_build_array(jsonb_build_object('id','native_input_and_physical_body_bound','passed',true,'recipeId',r.id,'contextFingerprint',r.context_fingerprint,
 'bodyFingerprint',s.body_fingerprint,'retainedPayloadId',p_retained_payload_id),jsonb_build_object('id','zero_model_no_effect','passed',true,'modelCalls',0,'grantsApproval',false,'grantsExternalEffect',false));
 update public.capital_project_task_runs set status='succeeded',completed_at=clock_timestamp(),output_reference=jsonb_build_object('type','capital_project_artifact','id',aid,'revisionId',rid),output_fingerprint=fp,quality_results=quality,usage='{}',error=null where organization_id=r.organization_id and id=s.task_run_id;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token)or private.capital_native_recipe_deadline_v1(r.organization_id,r.id,j.authorization_subject_id)is null
 or not private.capital_body_physical_receipt_v1(r.organization_id,p_retained_payload_id)then raise exception 'capital_native_commit_authority_changed'using errcode='42501';end if;
 return private.capital_native_result_dto_v1(r.organization_id,b.id);
end$$;
create function private.worker_recover_capital_native_provider_v1(p_job_id uuid,p_capability_token text)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_native_recipes;results jsonb;
begin
 if j.payload->>'analysis_scope'not in('provider_research','provider_case_fit')then raise exception 'capital_native_recovery_denied'using errcode='42501';end if;
 select * into r from private.capital_native_recipes where organization_id=j.organization_id and job_id=j.id;
 if r.id is null then return jsonb_build_object('schemaVersion','capital-native-provider-recovery.v1','family',j.payload->>'analysis_scope','recipe',null,'results','[]'::jsonb);end if;
 if private.capital_native_recipe_deadline_v1(r.organization_id,r.id,j.authorization_subject_id)is null then raise exception 'capital_native_recovery_denied'using errcode='42501';end if;
 if not exists(select 1 from private.capital_native_recipe_closures where organization_id=r.organization_id and recipe_id=r.id)then
 if exists(select 1 from private.capital_native_result_seals where organization_id=r.organization_id and recipe_id=r.id)then raise exception 'capital_native_unclosed_result_denied'using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-native-provider-recovery.v1','family',r.family,'recipe',null,'results','[]'::jsonb);end if;
 if exists(select 1 from private.capital_native_result_bindings b where b.organization_id=r.organization_id and b.recipe_id=r.id and not private.capital_body_physical_receipt_v1(r.organization_id,b.retained_payload_id))then raise exception 'capital_native_recovery_body_denied'using errcode='42501';end if;
 select coalesce(jsonb_agg(private.capital_native_result_dto_v1(r.organization_id,b.id)order by s.task_id),'[]'::jsonb)into results
 from private.capital_native_result_bindings b join private.capital_native_result_seals s on s.organization_id=b.organization_id and s.id=b.seal_id where b.organization_id=r.organization_id and b.recipe_id=r.id;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token)or private.capital_native_recipe_deadline_v1(r.organization_id,r.id,j.authorization_subject_id)is null then raise exception 'capital_native_recovery_authority_changed'using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-native-provider-recovery.v1','family',r.family,'recipe',private.capital_native_recipe_dto_v1(r.organization_id,r.id),'results',results);
end$$;
-- Keep the canonical immutable body out of the historical JSON projection.
alter function private.project_legacy_artifact_revision_v1(text,uuid,uuid)rename to project_legacy_artifact_revision_pre_native_v1;
create function private.project_legacy_artifact_revision_v1(p_table text,p_org uuid,p_row uuid)returns integer
language plpgsql security definer set search_path=''as $$begin
 if p_table='capital_project_artifacts'and exists(select 1 from private.capital_native_result_bindings where organization_id=p_org and capital_artifact_id=p_row)then return 0;end if;
 return private.project_legacy_artifact_revision_pre_native_v1(p_table,p_org,p_row);end$$;
-- Server closes the previous provider body writers by family, even on old jobs.
alter function private.worker_record_capital_project_artifact(uuid,text,uuid,text,text,text,text,jsonb,jsonb,jsonb)rename to worker_record_capital_project_artifact_pre_native;
create function private.worker_record_capital_project_artifact(p_job_id uuid,p_capability_token text,p_task_run_id uuid,p_artifact_type text,p_schema_version text,p_status text,p_input_fingerprint text,p_content jsonb,p_evidence_refs jsonb default'[]',p_dependencies jsonb default'[]')returns jsonb
language plpgsql security definer set search_path=''as $$declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);begin
 if j.payload->>'analysis_scope'in('provider_research','provider_case_fit')then raise exception 'capital_native_provider_commit_required'using errcode='42501';end if;
 return private.worker_record_capital_project_artifact_pre_native(p_job_id,p_capability_token,p_task_run_id,p_artifact_type,p_schema_version,p_status,p_input_fingerprint,p_content,p_evidence_refs,p_dependencies);end$$;
alter function private.worker_finish_capital_project_task(uuid,text,uuid,text,jsonb,text,jsonb,jsonb,jsonb)rename to worker_finish_capital_project_task_pre_native;
create function private.worker_finish_capital_project_task(p_job_id uuid,p_capability_token text,p_task_run_id uuid,p_status text,p_output_reference jsonb default null,p_output_fingerprint text default null,p_quality_results jsonb default'[]',p_usage jsonb default'{}',p_error jsonb default null)returns uuid
language plpgsql security definer set search_path=''as $$declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);begin
 if j.payload->>'analysis_scope'in('provider_research','provider_case_fit')and p_status='succeeded'then raise exception 'capital_native_provider_commit_required'using errcode='42501';end if;
 return private.worker_finish_capital_project_task_pre_native(p_job_id,p_capability_token,p_task_run_id,p_status,p_output_reference,p_output_fingerprint,p_quality_results,p_usage,p_error);end$$;

create function private.worker_read_capital_native_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_id text,p_artifact_type text,p_retained_payload_id uuid)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_native_recipes;b private.capital_native_result_bindings;a private.capital_public_payload_allocations;deadline timestamptz;answer jsonb;
begin
 select * into r from private.capital_native_recipes where organization_id=j.organization_id and id=p_recipe_id and job_id=j.id;
 select binding.* into b from private.capital_native_result_bindings binding join private.capital_native_result_seals seal on seal.organization_id=binding.organization_id and seal.id=binding.seal_id
 where binding.organization_id=j.organization_id and binding.recipe_id=r.id and binding.retained_payload_id=p_retained_payload_id and seal.task_id=p_task_id and seal.artifact_type=p_artifact_type;
 if r.id is null or b.id is null then raise exception 'capital_native_reader_scope_denied'using errcode='42501';end if;
 select allocation.* into a from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations allocation on allocation.organization_id=retained.organization_id and allocation.id=retained.allocation_id where retained.organization_id=r.organization_id and retained.id=p_retained_payload_id;
 deadline:=private.capital_body_allocation_deadline_v1(r.organization_id,a.id,j.authorization_subject_id);
 if deadline is null or least(a.purge_at,deadline)<=clock_timestamp()or not private.capital_body_physical_receipt_v1(r.organization_id,p_retained_payload_id)then raise exception 'capital_native_reader_authority_denied'using errcode='42501';end if;
 answer:=private.capital_body_dto_v1(r.organization_id,a.id,deadline,true)||jsonb_build_object('recipeId',r.id,'taskId',p_task_id,'artifactType',p_artifact_type,'retainedPayloadId',p_retained_payload_id);
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token)or private.capital_body_allocation_deadline_v1(r.organization_id,a.id,j.authorization_subject_id)is null
 or not private.capital_body_physical_receipt_v1(r.organization_id,p_retained_payload_id)then raise exception 'capital_native_reader_authority_changed'using errcode='42501';end if;
 return answer;
end$$;
create function private.capital_native_provider_completion_allowed_v1(p_job public.processing_jobs)returns boolean
language plpgsql volatile security definer set search_path=''as $$
declare r private.capital_native_recipes;b private.capital_native_result_bindings;s private.capital_native_result_seals;a private.capital_public_payload_allocations;total integer:=0;
begin
 select * into r from private.capital_native_recipes where organization_id=p_job.organization_id and job_id=p_job.id and family=p_job.payload->>'analysis_scope';
 if not found or p_job.model_calls<>0 or p_job.model_cost_usd<>0 or private.capital_native_recipe_deadline_v1(r.organization_id,r.id,p_job.authorization_subject_id)is null
 or not private.job_authority_is_current_v1(p_job.id)then return false;end if;
 for b in select * from private.capital_native_result_bindings where organization_id=r.organization_id and recipe_id=r.id loop
 select * into strict s from private.capital_native_result_seals where organization_id=r.organization_id and id=b.seal_id;
 select allocation.* into a from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations allocation on allocation.organization_id=retained.organization_id and allocation.id=retained.allocation_id where retained.organization_id=r.organization_id and retained.id=b.retained_payload_id;
 if not private.capital_body_physical_receipt_v1(r.organization_id,b.retained_payload_id)or private.capital_body_allocation_deadline_v1(r.organization_id,a.id,p_job.authorization_subject_id)is null
 or not exists(select 1 from public.capital_project_task_runs tr where tr.organization_id=r.organization_id and tr.id=s.task_run_id and tr.processing_job_id=p_job.id and tr.status='succeeded'
 and tr.input_fingerprint=s.input_fingerprint and tr.output_fingerprint=b.artifact_fingerprint and tr.output_reference->>'id'=b.capital_artifact_id::text
 and tr.executor_key=r.family and tr.executor_version=r.executor_version)then return false;end if;
 if s.task_id='K02'and(p_job.result->>(r.family||'_artifact_id')is distinct from b.capital_artifact_id::text or p_job.result->>'artifact_fingerprint'is distinct from b.artifact_fingerprint)then return false;end if;
 total:=total+1;
 end loop;
 return total=3 and private.capital_native_recipe_deadline_v1(r.organization_id,r.id,p_job.authorization_subject_id)is not null;
end$$;
create or replace function private.guard_provider_research_completion_v1()returns trigger
language plpgsql security definer set search_path=''as $$begin
 if old.kind='capital_project_analysis'and old.payload->>'analysis_scope'='provider_research'and new.status='succeeded'and old.status<>'succeeded'
 and not private.capital_native_provider_completion_allowed_v1(new)then raise exception 'capital_native_provider_completion_invalid'using errcode='42501';end if;return new;end$$;
create or replace function private.guard_provider_case_fit_completion_v1()returns trigger
language plpgsql security definer set search_path=''as $$begin
 if old.kind='capital_project_analysis'and old.payload->>'analysis_scope'='provider_case_fit'and new.status='succeeded'and old.status<>'succeeded'
 and not private.capital_native_provider_completion_allowed_v1(new)then raise exception 'capital_native_provider_completion_invalid'using errcode='42501';end if;return new;end$$;
-- Native restriction propagates through every canonical revision dependency.
create function private.capital_native_ancestry_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)returns boolean
language plpgsql volatile security definer set search_path=''as $$declare candidate record;deadline timestamptz;begin
 for candidate in with recursive ancestry(id,path,cycle)as(
 select p_revision,array[p_revision],false union all
 select l.derived_from_revision_id,a.path||l.derived_from_revision_id,l.derived_from_revision_id=any(a.path)
 from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision'
 where not a.cycle and cardinality(a.path)<128)
 select a.id,a.cycle,cardinality(a.path)depth,b.recipe_id,b.retained_payload_id,allocation.id allocation_id
 from ancestry a left join private.capital_native_result_bindings b on b.organization_id=p_org and b.revision_id=a.id
 left join private.capital_public_retained_payloads retained on retained.organization_id=p_org and retained.id=b.retained_payload_id
 left join private.capital_public_payload_allocations allocation on allocation.organization_id=p_org and allocation.id=retained.allocation_id loop
 if candidate.cycle or candidate.depth>=128 then return false;end if;
 if candidate.recipe_id is not null then deadline:=private.capital_body_allocation_deadline_v1(p_org,candidate.allocation_id,p_actor);
 if deadline is null or not private.capital_body_physical_receipt_v1(p_org,candidate.retained_payload_id)then return false;end if;end if;
 end loop;return true;end$$;
alter function private.artifact_review_sources_allowed_v1(uuid,uuid,uuid)rename to artifact_review_sources_allowed_pre_native_v1;
create function private.artifact_review_sources_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)returns boolean
language plpgsql volatile security definer set search_path=''as $$begin
 if not private.capital_native_ancestry_allowed_v1(p_org,p_revision,p_actor)then return false;end if;
 if not private.artifact_review_sources_allowed_pre_native_v1(p_org,p_revision,p_actor)then return false;end if;
 return private.capital_native_ancestry_allowed_v1(p_org,p_revision,p_actor);end$$;

create function private.wake_capital_native_provider_resources_v1()returns trigger
language plpgsql security definer set search_path=''as $$begin
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct allocation.organization_id,allocation.id from private.capital_native_provider_resource_pins pin
 join private.capital_body_bases basis on basis.organization_id=pin.organization_id and basis.native_recipe_id=pin.recipe_id
 join private.capital_public_payload_allocations allocation on allocation.organization_id=basis.organization_id and allocation.body_basis_id=basis.id
 where(tg_table_name='fund_directory'and pin.directory_id=old.id)or(tg_table_name='funds'and pin.fund_id=old.id);
 return coalesce(new,old);end$$;
create trigger capital_native_provider_directory_wake after update or delete on public.fund_directory for each row execute function private.wake_capital_native_provider_resources_v1();
create trigger capital_native_provider_fund_wake after update or delete on public.funds for each row execute function private.wake_capital_native_provider_resources_v1();

create function private.read_capital_native_provider_result_body_v1(p_revision_id uuid)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare actor uuid:=auth.uid();b private.capital_native_result_bindings;r private.capital_native_recipes;seal private.capital_native_result_seals;a private.capital_public_payload_allocations;deadline timestamptz;answer jsonb;headers jsonb;
begin
 if actor is null or p_revision_id is null then raise exception 'capital_native_human_reader_denied'using errcode='42501';end if;
 begin headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;exception when invalid_text_representation then raise exception 'capital_native_human_reader_denied'using errcode='42501';end;
 select * into b from private.capital_native_result_bindings where revision_id=p_revision_id and organization_id::text=headers->>'x-offroad-workspace';
 if not found then raise exception 'capital_native_human_reader_denied'using errcode='42501';end if;
 select * into strict r from private.capital_native_recipes where organization_id=b.organization_id and id=b.recipe_id;
 select * into strict seal from private.capital_native_result_seals where organization_id=b.organization_id and id=b.seal_id;
 select allocation.* into strict a from private.capital_public_retained_payloads retained join private.capital_public_payload_allocations allocation
 on allocation.organization_id=retained.organization_id and allocation.id=retained.allocation_id where retained.organization_id=b.organization_id and retained.id=b.retained_payload_id;
 deadline:=private.capital_body_allocation_deadline_v1(b.organization_id,a.id,actor);
 if deadline is null or not private.capital_native_ancestry_allowed_v1(b.organization_id,p_revision_id,actor)
 or not private.capital_body_physical_receipt_v1(b.organization_id,b.retained_payload_id)then raise exception 'capital_native_human_reader_denied'using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(a.policy_id,b.organization_id,a.id);
 answer:=private.capital_body_dto_v1(b.organization_id,a.id,deadline,true)||jsonb_build_object('organizationId',b.organization_id,'workId',b.work_id,'revisionId',b.revision_id,
 'recipeId',r.id,'family',r.family,'taskId',seal.task_id,'artifactType',seal.artifact_type,'retainedPayloadId',b.retained_payload_id);
 if private.capital_body_allocation_deadline_v1(b.organization_id,a.id,actor)is null or not private.capital_native_ancestry_allowed_v1(b.organization_id,p_revision_id,actor)
 or not private.capital_body_physical_receipt_v1(b.organization_id,b.retained_payload_id)then raise exception 'capital_native_human_reader_authority_changed'using errcode='42501';end if;
 return answer;
end$$;

-- Same-original-job lease recovery is native-only. Original capture receipt,
-- capability digest, upload window, policy, TTL and path remain immutable.
alter function private.capital_public_allocation_job_current_v1(uuid)rename to capital_public_allocation_job_current_pre_native_v1;
create function private.capital_public_allocation_job_current_v1(p_allocation uuid)returns boolean
language plpgsql volatile security definer set search_path=''as $$declare a private.capital_public_payload_allocations;b private.capital_body_bases;j public.processing_jobs;begin
 select * into a from private.capital_public_payload_allocations where id=p_allocation;
 select * into b from private.capital_body_bases where organization_id=a.organization_id and id=a.body_basis_id;
 if b.native_recipe_id is null then return private.capital_public_allocation_job_current_pre_native_v1(p_allocation);end if;
 select * into j from public.processing_jobs where organization_id=a.organization_id and id=a.job_id and status='leased'and leased_account_user_id=auth.uid()and lease_expires_at>clock_timestamp();
 return j.id is not null and private.job_authority_is_current_v1(j.id)and exists(select 1 from private.capital_native_recipes r where r.organization_id=a.organization_id and r.id=b.native_recipe_id and r.job_id=j.id)
 and private.capital_native_recipe_deadline_v1(a.organization_id,b.native_recipe_id,j.authorization_subject_id)is not null;end$$;
alter function private.capital_body_storage_job_authority_v1(uuid)rename to capital_body_storage_job_authority_pre_native_v1;
create function private.capital_body_storage_job_authority_v1(p_allocation uuid)returns boolean
language plpgsql volatile security definer set search_path=''as $$declare a private.capital_public_payload_allocations;b private.capital_body_bases;headers jsonb;begin
 select * into a from private.capital_public_payload_allocations where id=p_allocation;
 select * into b from private.capital_body_bases where organization_id=a.organization_id and id=a.body_basis_id;
 if b.native_recipe_id is null then return private.capital_body_storage_job_authority_pre_native_v1(p_allocation);end if;
 begin headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;exception when invalid_text_representation then return false;end;
 if headers->>'x-offroad-job-id'is distinct from a.job_id::text or headers->>'x-offroad-workspace'is distinct from a.organization_id::text then return false;end if;
 return private.capital_public_allocation_job_current_v1(a.id)and private.capital_public_capture_clock_current_v1(a.job_id,headers->>'x-offroad-capability');end$$;
create function private.worker_read_capital_native_allocation_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_allocation_id uuid,p_task_id text default null,p_artifact_type text default null)returns jsonb
language plpgsql volatile security definer set search_path=''as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_public_payload_allocations;b private.capital_body_bases;o storage.objects;receipt private.capital_public_retained_payloads;deadline timestamptz;answer jsonb;
begin
 select allocation.* into a from private.capital_public_payload_allocations allocation join private.capital_body_bases basis on basis.organization_id=allocation.organization_id and basis.id=allocation.body_basis_id
 join private.capital_native_recipes recipe on recipe.organization_id=basis.organization_id and recipe.id=basis.native_recipe_id
 where allocation.organization_id=j.organization_id and allocation.job_id=j.id and allocation.id=p_allocation_id and recipe.id=p_recipe_id and recipe.job_id=j.id;
 select * into b from private.capital_body_bases where organization_id=j.organization_id and id=a.body_basis_id;
 if a.id is null or(b.kind='native_recipe_context'and(p_task_id is not null or p_artifact_type is not null))
 or(b.kind='native_deterministic_result'and(b.native_task_id is distinct from p_task_id or b.native_artifact_type is distinct from p_artifact_type
 or not exists(select 1 from private.capital_native_result_seals where organization_id=j.organization_id and recipe_id=p_recipe_id and task_id=p_task_id and artifact_type=p_artifact_type and body_fingerprint=a.payload_fingerprint and body_byte_length=a.byte_length)))then raise exception 'capital_native_allocation_scope_denied'using errcode='42501';end if;
 deadline:=private.capital_body_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if deadline is null or not private.capital_public_retention_healthy_v1(j.leased_by,a.policy_id)then raise exception 'capital_native_allocation_read_denied'using errcode='42501';end if;
 perform private.require_capital_body_retention_ready_v1(a.policy_id,j.organization_id,a.id);
 begin select * into o from storage.objects where bucket_id=a.bucket_id and name=a.object_path for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry'using errcode='40001';end;
 if o.id is null or coalesce(length(o.version),0)not between 1 and 1024 or o.metadata->>'size'is distinct from a.byte_length::text or o.metadata->>'mimetype'is distinct from'application/json'
 or(to_jsonb(o)->>'is_versioned')::boolean is true or(to_jsonb(o)->>'is_delete_marker')::boolean is true or to_jsonb(o)->>'archived_at'is not null then raise exception 'capital_native_allocation_object_denied'using errcode='42501';end if;
 select * into receipt from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id;
 if receipt.id is null then if a.upload_expires_at<=clock_timestamp()then raise exception 'capital_native_allocation_upload_expired'using errcode='42501';end if;
 elsif not private.capital_body_physical_receipt_v1(j.organization_id,receipt.id)then raise exception 'capital_native_allocation_object_denied'using errcode='42501';end if;
 answer:=private.capital_body_dto_v1(j.organization_id,a.id,deadline,true)||jsonb_build_object('recipeId',p_recipe_id,'taskId',p_task_id,'artifactType',p_artifact_type,'storageObjectId',o.id,'storageVersion',o.version);
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token)or private.capital_body_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id)is null then raise exception 'capital_native_allocation_authority_changed'using errcode='42501';end if;
 return answer;
end$$;

alter function private.capital_body_storage_allowed_v1(uuid,text)rename to capital_body_storage_allowed_pre_native_v1;
create function private.capital_body_storage_allowed_v1(p_allocation uuid,p_mode text)returns boolean
language plpgsql volatile security definer set search_path=''as $$declare a private.capital_public_payload_allocations;b private.capital_body_bases;j public.processing_jobs;deadline timestamptz;begin
 select * into a from private.capital_public_payload_allocations where id=p_allocation;
 select * into b from private.capital_body_bases where organization_id=a.organization_id and id=a.body_basis_id;
 if b.native_recipe_id is null then return private.capital_body_storage_allowed_pre_native_v1(p_allocation,p_mode);end if;
 if p_mode is distinct from'upload'or not storage.allow_any_operation(array['object.upload'])or not private.capital_body_storage_job_authority_v1(a.id)
 or a.upload_expires_at<=clock_timestamp()or exists(select 1 from private.capital_public_retained_payloads where organization_id=a.organization_id and allocation_id=a.id)then return false;end if;
 select * into j from public.processing_jobs where organization_id=a.organization_id and id=a.job_id;
 deadline:=private.capital_body_allocation_deadline_v1(a.organization_id,a.id,j.authorization_subject_id);
 return deadline is not null and least(deadline,a.purge_at)>clock_timestamp()and private.capital_public_retention_healthy_v1(j.leased_by,a.policy_id);
end$$;

create function private.guard_capital_native_result_projection_v1()returns trigger
language plpgsql security definer set search_path=''as $$begin
 if exists(select 1 from private.capital_native_result_bindings where organization_id=old.organization_id and capital_artifact_id=old.id)and
 (to_jsonb(new)-array['status','superseded_at']is distinct from to_jsonb(old)-array['status','superseded_at'])then raise exception 'capital_native_result_projection_immutable'using errcode='55000';end if;return new;end$$;
create trigger capital_native_result_projection_immutable before update on public.capital_project_artifacts for each row execute function private.guard_capital_native_result_projection_v1();
do $immutable$declare t text;begin foreach t in array array['capital_native_recipes','capital_native_provider_resource_pins','capital_native_recipe_closures','capital_native_result_seals','capital_native_result_bindings']loop
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_source_version_mutation_v1()',t||'_no_truncate',t);end loop;end $immutable$;

create function private.wake_capital_native_provider_public_rights_v1()returns trigger
language plpgsql security definer set search_path=''as $$declare changed_org uuid;changed_version uuid;changed_binding uuid;begin
 if tg_table_name='source_rights_versions'then changed_org:=new.organization_id;changed_version:=new.source_version_id;
 elsif tg_table_name='source_bindings'then if new.revoked_at is not distinct from old.revoked_at then return new;end if;changed_org:=new.organization_id;changed_binding:=new.id;
 else changed_org:=case when tg_op='DELETE'then old.organization_id else new.organization_id end;changed_version:=case when tg_op='DELETE'then old.derived_version_id else new.derived_version_id end;end if;
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct allocation.organization_id,allocation.id from private.capital_native_recipe_closures closure
 join private.capital_public_retained_payloads retained on retained.organization_id=closure.organization_id and retained.id=closure.catalog_retained_payload_id
 join private.capital_public_payload_allocations catalog on catalog.organization_id=retained.organization_id and catalog.id=retained.allocation_id
 join private.capital_public_delivery_license_pins pin on pin.organization_id=catalog.organization_id and pin.license_id=catalog.license_id
 join private.capital_body_bases basis on basis.organization_id=closure.organization_id and basis.native_recipe_id=closure.recipe_id
 join private.capital_public_payload_allocations allocation on allocation.organization_id=basis.organization_id and allocation.body_basis_id=basis.id
 where pin.licensing_organization_id=changed_org and((changed_version is not null and pin.source_version_id=changed_version)or(changed_binding is not null and pin.source_binding_id=changed_binding));
 return case when tg_op='DELETE'then old else new end;end$$;
create trigger capital_native_public_rights_wake after insert on private.source_rights_versions for each row execute function private.wake_capital_native_provider_public_rights_v1();
create trigger capital_native_public_binding_wake after update of revoked_at on public.source_bindings for each row execute function private.wake_capital_native_provider_public_rights_v1();
create trigger capital_native_public_dependencies_wake after insert or delete on private.resource_dependencies for each row execute function private.wake_capital_native_provider_public_rights_v1();
create function private.wake_capital_native_provider_descendants_v1()returns trigger
language plpgsql security definer set search_path=''as $$begin
 if new.effective_purge_at>=old.effective_purge_at and not(new.status='leased'and old.status<>'leased')then return new;end if;
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct child.organization_id,child.id from private.capital_public_retained_payloads retained
 join private.capital_native_recipe_closures closure on closure.organization_id=retained.organization_id and(retained.id=closure.context_retained_payload_id or retained.id=closure.catalog_retained_payload_id)
 join private.capital_body_bases basis on basis.organization_id=closure.organization_id and basis.native_recipe_id=closure.recipe_id
 join private.capital_public_payload_allocations child on child.organization_id=basis.organization_id and child.body_basis_id=basis.id and child.id<>new.allocation_id
 where retained.organization_id=new.organization_id and retained.allocation_id=new.allocation_id;
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct child.organization_id,child.id from private.capital_body_bases parent
 join private.capital_body_bases sibling on sibling.organization_id=parent.organization_id and sibling.native_recipe_id=parent.native_recipe_id
 join private.capital_public_payload_allocations child on child.organization_id=sibling.organization_id and child.body_basis_id=sibling.id and child.id<>new.allocation_id
 join private.capital_public_payload_allocations original on original.organization_id=parent.organization_id and original.body_basis_id=parent.id
 where original.organization_id=new.organization_id and original.id=new.allocation_id and parent.native_recipe_id is not null;
 return new;end$$;
create trigger capital_native_provider_descendant_wake after update of effective_purge_at,status on private.capital_public_payload_purge_queue for each row execute function private.wake_capital_native_provider_descendants_v1();
-- Until the result ports have been verified, none of this draft is exposed.
revoke all on function private.capital_body_allocation_deadline_v1(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
do $closed$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and(p.proname like '%capital_native%'or p.proname in('capital_body_allocation_deadline_pre_native_v1','project_legacy_artifact_revision_pre_native_v1','worker_record_capital_project_artifact_pre_native','worker_finish_capital_project_task_pre_native','project_legacy_artifact_revision_v1','worker_record_capital_project_artifact','worker_finish_capital_project_task','artifact_review_sources_allowed_v1','artifact_review_sources_allowed_pre_native_v1','guard_provider_research_completion_v1','guard_provider_case_fit_completion_v1','capital_public_allocation_job_current_v1','capital_public_allocation_job_current_pre_native_v1','capital_body_storage_job_authority_v1','capital_body_storage_job_authority_pre_native_v1','capital_body_storage_allowed_v1','capital_body_storage_allowed_pre_native_v1'))loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $closed$;

grant execute on function private.worker_record_capital_project_artifact(uuid,text,uuid,text,text,text,text,jsonb,jsonb,jsonb),private.worker_finish_capital_project_task(uuid,text,uuid,text,jsonb,text,jsonb,jsonb,jsonb)to authenticated;

create function public.worker_prepare_capital_native_recipe_v1(p_job_id uuid,p_capability_token text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_prepare_capital_native_recipe_v1(p_job_id,p_capability_token)$$;
create function public.worker_finalize_capital_native_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_context_retained_payload_id uuid,p_catalog_retained_payload_id uuid default null,p_catalog_payload jsonb default null)returns jsonb language sql security invoker set search_path=''as $$select private.worker_finalize_capital_native_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_context_retained_payload_id,p_catalog_retained_payload_id,p_catalog_payload)$$;
create function public.worker_prepare_capital_native_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_id text,p_artifact_type text,p_content jsonb,p_predecessor_revision_id uuid default null)returns jsonb language sql security invoker set search_path=''as $$select private.worker_prepare_capital_native_result_v1(p_job_id,p_capability_token,p_recipe_id,p_task_id,p_artifact_type,p_content,p_predecessor_revision_id)$$;
create function public.worker_commit_capital_native_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_seal_id uuid,p_retained_payload_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_commit_capital_native_result_v1(p_job_id,p_capability_token,p_recipe_id,p_seal_id,p_retained_payload_id)$$;
create function public.worker_recover_capital_native_provider_v1(p_job_id uuid,p_capability_token text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_recover_capital_native_provider_v1(p_job_id,p_capability_token)$$;
create function public.worker_read_capital_native_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid,p_scope text)returns jsonb language sql security invoker set search_path=''as $$select private.worker_read_capital_native_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_retained_payload_id,p_scope)$$;
create function public.worker_read_capital_native_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_task_id text,p_artifact_type text,p_retained_payload_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.worker_read_capital_native_result_v1(p_job_id,p_capability_token,p_recipe_id,p_task_id,p_artifact_type,p_retained_payload_id)$$;
do $rpc$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public')and p.proname in(
 'worker_prepare_capital_native_recipe_v1','worker_finalize_capital_native_recipe_v1','worker_prepare_capital_native_result_v1','worker_commit_capital_native_result_v1',
 'worker_recover_capital_native_provider_v1','worker_read_capital_native_recipe_v1','worker_read_capital_native_result_v1')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;end $rpc$;

create function public.read_capital_native_provider_result_body_v1(p_revision_id uuid)returns jsonb language sql security invoker set search_path=''as $$select private.read_capital_native_provider_result_body_v1(p_revision_id)$$;
revoke all on function private.read_capital_native_provider_result_body_v1(uuid),public.read_capital_native_provider_result_body_v1(uuid)from public,anon,authenticated,service_role;
grant execute on function private.read_capital_native_provider_result_body_v1(uuid),public.read_capital_native_provider_result_body_v1(uuid)to authenticated;

create function public.worker_read_capital_native_allocation_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_allocation_id uuid,p_task_id text default null,p_artifact_type text default null)returns jsonb language sql security invoker set search_path=''as $$select private.worker_read_capital_native_allocation_v1(p_job_id,p_capability_token,p_recipe_id,p_allocation_id,p_task_id,p_artifact_type)$$;
revoke all on function private.worker_read_capital_native_allocation_v1(uuid,text,uuid,uuid,text,text),public.worker_read_capital_native_allocation_v1(uuid,text,uuid,uuid,text,text)from public,anon,authenticated,service_role;
grant execute on function private.worker_read_capital_native_allocation_v1(uuid,text,uuid,uuid,text,text),public.worker_read_capital_native_allocation_v1(uuid,text,uuid,uuid,text,text)to authenticated;
