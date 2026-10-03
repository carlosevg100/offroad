-- Concatenate AFTER capital_s11_execution_ledger.sql. This is not independently deployable.
set search_path='';
create table private.capital_s11_native_bindings (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,
 recipe_id uuid not null,producer_task_run_id uuid not null,task_run_id uuid not null,accepted_invocation_id uuid not null,parsed_retained_payload_id uuid not null,final_retained_payload_id uuid not null,
 capital_artifact_id uuid not null,revision_id uuid not null,final_fingerprint text not null check(final_fingerprint~'^[a-f0-9]{64}$'),
 transformation_version text not null check(transformation_version='capital-planning-map.transform.v1'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),unique(organization_id,revision_id),unique(organization_id,capital_artifact_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,producer_task_run_id) references private.capital_s11_recipe_seals(organization_id,task_run_id),
 foreign key(organization_id,task_run_id) references public.capital_project_task_runs(organization_id,id),
 foreign key(organization_id,accepted_invocation_id) references private.capital_s11_accepted_invocations(organization_id,id),
 foreign key(organization_id,parsed_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,final_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,capital_artifact_id) references public.capital_project_artifacts(organization_id,id) deferrable initially deferred,
 foreign key(organization_id,revision_id) references public.artifact_revisions(organization_id,id) deferrable initially deferred
);
create index capital_s11_native_recipe_idx on private.capital_s11_native_bindings(organization_id,work_id,recipe_id);
create index capital_s11_native_accepted_idx on private.capital_s11_native_bindings(organization_id,accepted_invocation_id);
create index capital_s11_native_parsed_idx on private.capital_s11_native_bindings(organization_id,parsed_retained_payload_id);
create index capital_s11_native_final_idx on private.capital_s11_native_bindings(organization_id,final_retained_payload_id);
alter table private.capital_s11_native_bindings enable row level security;
alter table private.capital_s11_native_bindings force row level security;
revoke all on private.capital_s11_native_bindings from public,anon,authenticated,service_role;
create policy capital_s11_native_deny_select on private.capital_s11_native_bindings as restrictive for select to anon,authenticated using(false);
create policy capital_s11_native_deny_insert on private.capital_s11_native_bindings as restrictive for insert to anon,authenticated with check(false);
create policy capital_s11_native_deny_update on private.capital_s11_native_bindings as restrictive for update to anon,authenticated using(false) with check(false);
create policy capital_s11_native_deny_delete on private.capital_s11_native_bindings as restrictive for delete to anon,authenticated using(false);
create trigger capital_s11_native_immutable before update or delete on private.capital_s11_native_bindings for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_s11_native_no_truncate before truncate on private.capital_s11_native_bindings for each statement execute function private.reject_review_history_mutation_v1();
create trigger capital_s11_native_updated_at before update on private.capital_s11_native_bindings for each row execute function private.set_updated_at();
create trigger capital_s11_native_audit after insert on private.capital_s11_native_bindings for each row execute function private.capture_identity_audit_v1();



-- Every native read, review and derived read resolves this actual binding,
-- current private work authority, full licensed source bridge and physical body.
create function private.capital_s11_native_read_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_s11_native_bindings;a private.capital_public_payload_allocations;d timestamptz;r public.artifact_revisions;
 projection record;projection_deadline timestamptz;projection_count integer:=0;
begin
 select * into b from private.capital_s11_native_bindings where organization_id=p_org and revision_id=p_revision;
 if b.id is null then return true;end if;
 if not private.capital_body_subject_allowed_v1(p_org,b.work_id,p_actor) then return false;end if;
 select * into r from public.artifact_revisions where organization_id=p_org and id=p_revision;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=b.final_retained_payload_id;
 d:=private.capital_s11_allocation_deadline_v1(p_org,a.id,p_actor);
 if r.id is null or a.id is null or d is null or not exists(select 1 from public.capital_project_artifacts c where c.organization_id=p_org and c.id=b.capital_artifact_id and c.status not in ('stale','superseded'))
 or r.content_sha256 is distinct from a.payload_fingerprint or r.byte_length is distinct from a.byte_length
 or not private.capital_body_physical_receipt_v1(p_org,b.final_retained_payload_id)
 or not private.capital_body_physical_receipt_v1(p_org,b.parsed_retained_payload_id)
 or not private.capital_body_retention_healthy_v1(a.policy_id,p_org,a.id) then return false;end if;
 -- Every intermediate TaskSpec body is a finite physical dependency of this
 -- final map. A surviving final blob cannot outlive a purged C11/S10 or prelude.
 for projection in select p.*,x.id allocation_id,x.purge_at,tr.status task_status,tr.output_fingerprint,
  c.artifact_fingerprint current_fingerprint,c.status artifact_status
 from private.capital_s11_task_projections p
 join private.capital_public_retained_payloads q on q.organization_id=p.organization_id and q.id=p.derived_retained_payload_id
 join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id
 join public.capital_project_task_runs tr on tr.organization_id=p.organization_id and tr.id=p.task_run_id
 join public.capital_project_artifacts c on c.organization_id=p.organization_id and c.id=p.capital_artifact_id
 where p.organization_id=p_org and p.recipe_id=b.recipe_id loop
  projection_count:=projection_count+1;
  projection_deadline:=private.capital_s11_allocation_deadline_v1(p_org,projection.allocation_id,p_actor);
  if projection_deadline is null or projection.task_status is distinct from 'succeeded'
   or projection.output_fingerprint is distinct from projection.artifact_fingerprint
   or projection.current_fingerprint is distinct from projection.artifact_fingerprint
   or projection.artifact_status in('stale','superseded')
   or not private.capital_body_physical_receipt_v1(p_org,projection.derived_retained_payload_id) then return false;end if;
  d:=least(d,projection_deadline,projection.purge_at);
 end loop;
 if projection_count<>34 then return false;end if;
 return least(d,a.purge_at)>clock_timestamp();
end; $$;

create function private.read_capital_s11_result_v1(p_revision_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare b private.capital_s11_native_bindings;a private.capital_public_payload_allocations;d timestamptz;result jsonb;r public.artifact_revisions;
begin
 select * into b from private.capital_s11_native_bindings where revision_id=p_revision_id;
 select * into r from public.artifact_revisions where id=p_revision_id;
 if b.id is null or r.id is null or private.artifact_revision_release_v1(r)='blocked' or not private.capital_s11_native_read_allowed_v1(b.organization_id,b.revision_id,auth.uid()) then raise exception 'capital_s11_read_denied' using errcode='42501';end if;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=b.organization_id and q.id=b.final_retained_payload_id;
 d:=private.capital_s11_allocation_deadline_v1(b.organization_id,a.id,auth.uid());
 result:=jsonb_build_object('schemaVersion','capital-s11-read-scope.v1','revisionId',b.revision_id,'recipeId',b.recipe_id,'finalFingerprint',b.final_fingerprint,'retention',private.capital_s11_body_dto_v1(b.organization_id,a.id,d,true));
 if private.artifact_revision_release_v1(r)='blocked' or not private.capital_s11_native_read_allowed_v1(b.organization_id,b.revision_id,auth.uid()) then raise exception 'capital_s11_read_denied' using errcode='42501';end if;
 return result;
end; $$;

-- Close the historical S11 writer by actual TaskSpec, not a caller-selected
-- content schema. Its other task families keep the original function unchanged.
alter function private.worker_record_capital_project_artifact(uuid,text,uuid,text,text,text,text,jsonb,jsonb,jsonb) rename to worker_record_capital_project_artifact_pre_s11;
create function private.worker_record_capital_project_artifact(p_job_id uuid,p_capability_token text,p_task_run_id uuid,p_artifact_type text,
 p_schema_version text,p_status text,p_input_fingerprint text,p_content jsonb,p_evidence_refs jsonb default '[]',p_dependencies jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
begin
 if (p_artifact_type='alternative_map' and j.payload->>'analysis_scope'='capital_planning') or exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=j.organization_id and tr.id=p_task_run_id and pt.task_id='S11') then raise exception 'capital_s11_native_commit_required' using errcode='42501';end if;
 return private.worker_record_capital_project_artifact_pre_s11(p_job_id,p_capability_token,p_task_run_id,p_artifact_type,p_schema_version,p_status,p_input_fingerprint,p_content,p_evidence_refs,p_dependencies);
end; $$;
revoke all on function private.worker_record_capital_project_artifact_pre_s11(uuid,text,uuid,text,text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

alter function private.worker_finish_capital_project_task(uuid,text,uuid,text,jsonb,text,jsonb,jsonb,jsonb) rename to worker_finish_capital_project_task_pre_s11;
create function private.worker_finish_capital_project_task(p_job_id uuid,p_capability_token text,p_task_run_id uuid,p_status text,
 p_output_reference jsonb default null,p_output_fingerprint text default null,p_quality_results jsonb default '[]',p_usage jsonb default '{}',p_error jsonb default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs:=private.job_for_capability(p_job_id,p_capability_token);
begin
 if p_status='failed' and exists(select 1 from private.capital_s11_recipe_seals z where z.organization_id=j.organization_id and z.task_run_id=p_task_run_id) then raise exception 'capital_s11_native_quality_required' using errcode='42501';end if;
 if p_status='succeeded' and exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=j.organization_id and tr.id=p_task_run_id and pt.task_id='S11') then raise exception 'capital_s11_native_commit_required' using errcode='42501';end if;
 return private.worker_finish_capital_project_task_pre_s11(p_job_id,p_capability_token,p_task_run_id,p_status,p_output_reference,p_output_fingerprint,p_quality_results,p_usage,p_error);
end; $$;
revoke all on function private.worker_finish_capital_project_task_pre_s11(uuid,text,uuid,text,jsonb,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

alter function private.project_legacy_artifact_revision_v1(text,uuid,uuid) rename to project_legacy_artifact_revision_pre_s11_v1;
create function private.project_legacy_artifact_revision_v1(p_table text,p_org uuid,p_row uuid)
returns integer language plpgsql security definer set search_path='' as $$
begin
 if p_table='capital_project_artifacts' and exists(select 1 from private.capital_s11_native_bindings b where b.organization_id=p_org and b.capital_artifact_id=p_row) then return 0;end if;
 return private.project_legacy_artifact_revision_pre_s11_v1(p_table,p_org,p_row);
end; $$;
revoke all on function private.project_legacy_artifact_revision_pre_s11_v1(text,uuid,uuid) from public,anon,authenticated,service_role;

-- Pre-accepted terminal execution failures cite only real server ledger rows.
create table private.capital_s11_execution_failures (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,
 recipe_id uuid not null,task_run_id uuid not null,reason text not null check(reason in ('model_attempts_exhausted','processing_denied','budget_denied','accepted_body_unavailable')),
 outcome_ids uuid[] not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references private.capital_s11_recipe_seals(organization_id,task_run_id)
);
create index capital_s11_execution_failure_work_idx on private.capital_s11_execution_failures(organization_id,work_id,recipe_id);
alter table private.capital_s11_execution_failures enable row level security;
alter table private.capital_s11_execution_failures force row level security;
revoke all on private.capital_s11_execution_failures from public,anon,authenticated,service_role;
create trigger capital_s11_execution_failure_immutable before update or delete on private.capital_s11_execution_failures for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_s11_execution_failure_no_truncate before truncate on private.capital_s11_execution_failures for each statement execute function private.reject_review_history_mutation_v1();
create function private.worker_record_capital_s11_execution_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_reason text,p_outcome_ids uuid[] default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes:=private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 seal private.capital_s11_recipe_seals;old private.capital_s11_execution_failures;actual uuid[];supplied uuid[];tr public.capital_project_task_runs;replayed boolean:=false;op private.capital_s11_operations;exposure numeric;dispatches integer;server_bound bigint;
begin
 if p_reason is null or p_reason not in ('model_attempts_exhausted','processing_denied','budget_denied','accepted_body_unavailable') or array_position(p_outcome_ids,null) is not null then raise exception 'capital_s11_execution_failure_invalid' using errcode='22023';end if;
 if (p_reason<>'accepted_body_unavailable' and(exists(select 1 from private.capital_s11_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id)
 or exists(select 1 from private.capital_s11_attempt_outcomes o join private.capital_s11_gateway_attempts a on a.organization_id=o.organization_id and a.id=o.attempt_id where a.organization_id=r.organization_id and a.recipe_id=r.id and o.outcome='accepted')))
 or exists(select 1 from private.capital_s11_native_bindings where organization_id=r.organization_id and recipe_id=r.id)
 or exists(select 1 from private.capital_s11_quality_failures where organization_id=r.organization_id and recipe_id=r.id) then raise exception 'capital_s11_execution_failure_proof_denied' using errcode='42501';end if;
 select coalesce(array_agg(o.id order by o.id),'{}'::uuid[]) into actual from private.capital_s11_attempt_outcomes o join private.capital_s11_gateway_attempts a on a.organization_id=o.organization_id and a.id=o.attempt_id where a.organization_id=r.organization_id and a.recipe_id=r.id;
 if p_outcome_ids is null then supplied:=actual;else select coalesce(array_agg(v order by v),'{}'::uuid[]) into supplied from unnest(p_outcome_ids) v;end if;
 if actual is distinct from supplied or(p_reason='model_attempts_exhausted' and(cardinality(actual)=0 or not exists(select 1 from private.capital_s11_gateway_attempts a join private.capital_s11_attempt_outcomes o on o.organization_id=a.organization_id and o.attempt_id=a.id where a.organization_id=r.organization_id and a.recipe_id=r.id and a.used_provider_fallback and o.outcome<>'accepted')))
 or(p_reason='processing_denied' and(cardinality(actual)<>0 or not exists(select 1 from private.capital_s11_gateway_attempts a where a.organization_id=r.organization_id and a.recipe_id=r.id and not a.allowed and not a.used_provider_fallback) or not exists(select 1 from private.capital_s11_gateway_attempts a where a.organization_id=r.organization_id and a.recipe_id=r.id and not a.allowed and a.used_provider_fallback))) then raise exception 'capital_s11_execution_failure_proof_denied' using errcode='42501';end if;
 if p_reason='accepted_body_unavailable' and(not exists(select 1 from private.capital_s11_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id)
 or exists(select 1 from private.capital_s11_body_bases b join private.capital_public_payload_allocations a on a.organization_id=b.organization_id and a.s11_body_basis_id=b.id join private.capital_public_retained_payloads q on q.organization_id=a.organization_id and q.allocation_id=a.id where b.organization_id=r.organization_id and b.recipe_id=r.id and b.kind='parsed' and private.capital_body_physical_receipt_v1(q.organization_id,q.id))) then raise exception 'capital_s11_execution_failure_proof_denied' using errcode='42501';end if;
 if p_reason='budget_denied' then
 select * into op from private.capital_s11_operations where organization_id=r.organization_id and recipe_id=r.id;
 select count(*),coalesce(sum(greatest(d.server_reservation_micro_usd,coalesce(o.cost_micro_usd,d.server_reservation_micro_usd))),0) into dispatches,exposure from private.capital_s11_input_dispatches d left join private.capital_s11_attempt_outcomes o on o.organization_id=d.organization_id and o.input_receipt_id=d.id where d.organization_id=r.organization_id and d.operation_id=op.id;
 select case when dispatches=0 then least((private.capital_s11_dispatch_policy_v1('claude-sonnet-5',100000)->>'serverBoundMicroUsd')::bigint,(private.capital_s11_dispatch_policy_v1('gpt-5.6-terra',100000)->>'serverBoundMicroUsd')::bigint) else(private.capital_s11_dispatch_policy_v1('gpt-5.6-terra',100000)->>'serverBoundMicroUsd')::bigint end into server_bound;
 if not exists(select 1 from private.capital_s11_recipe_seals z where z.organization_id=r.organization_id and z.recipe_id=r.id and(dispatches>=z.effective_max_dispatches or exposure+server_bound>z.effective_budget_micro_usd)) then raise exception 'capital_s11_execution_failure_proof_denied' using errcode='42501';end if;
 end if;
 select * into strict seal from private.capital_s11_recipe_seals where organization_id=r.organization_id and recipe_id=r.id;
 select * into old from private.capital_s11_execution_failures where organization_id=r.organization_id and recipe_id=r.id;
 if old.id is not null then
 if (old.reason,old.outcome_ids) is distinct from(p_reason,supplied) then raise exception 'capital_s11_execution_failure_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 select * into tr from public.capital_project_task_runs where organization_id=r.organization_id and id=seal.task_run_id for update;
 if tr.status is distinct from 'running' then raise exception 'capital_s11_execution_failure_task_denied' using errcode='42501';end if;
 insert into private.capital_s11_execution_failures(organization_id,work_id,recipe_id,task_run_id,reason,outcome_ids) values(r.organization_id,r.work_id,r.id,seal.task_run_id,p_reason,supplied) returning * into old;
 update public.capital_project_task_runs set status='failed',completed_at=clock_timestamp(),quality_results='[]',error=jsonb_build_object('code','capital_s11_execution_failed','reason',p_reason),usage='{}',output_reference=null,output_fingerprint=null where organization_id=r.organization_id and id=tr.id;
 end if;
 perform private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 return jsonb_build_object('schemaVersion','capital-s11-execution-failure-receipt.v1','recipeId',r.id,'taskRunId',seal.task_run_id,'reason',old.reason,'outcomeIds',to_jsonb(old.outcome_ids),'replayed',replayed);
end; $$;

-- Terminal quality failures are native history, never a reusable execution grant.
create table private.capital_s11_quality_failures (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,
 recipe_id uuid not null,task_run_id uuid not null,accepted_invocation_id uuid not null,
 parsed_retained_payload_id uuid not null,final_retained_payload_id uuid not null,
 final_fingerprint text not null check(final_fingerprint~'^[a-f0-9]{64}$'),quality_results jsonb not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,task_run_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_s11_recipes(organization_id,work_id,id),
 foreign key(organization_id,task_run_id) references private.capital_s11_recipe_seals(organization_id,task_run_id),
 foreign key(organization_id,accepted_invocation_id) references private.capital_s11_accepted_invocations(organization_id,id),
 foreign key(organization_id,parsed_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,final_retained_payload_id) references private.capital_public_retained_payloads(organization_id,id)
);
create index capital_s11_quality_work_recipe_idx on private.capital_s11_quality_failures(organization_id,work_id,recipe_id);
create index capital_s11_quality_accepted_idx on private.capital_s11_quality_failures(organization_id,accepted_invocation_id);
create index capital_s11_quality_parsed_idx on private.capital_s11_quality_failures(organization_id,parsed_retained_payload_id);
create index capital_s11_quality_final_idx on private.capital_s11_quality_failures(organization_id,final_retained_payload_id);
alter table private.capital_s11_quality_failures enable row level security;
alter table private.capital_s11_quality_failures force row level security;
revoke all on private.capital_s11_quality_failures from public,anon,authenticated,service_role;
create trigger capital_s11_quality_immutable before update or delete on private.capital_s11_quality_failures for each row execute function private.reject_review_history_mutation_v1();
create trigger capital_s11_quality_no_truncate before truncate on private.capital_s11_quality_failures for each statement execute function private.reject_review_history_mutation_v1();

create function private.capital_s11_quality_failure_dto_v1(p_org uuid,p_recipe uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-s11-quality-failure.v1','acceptedInvocationId',q.accepted_invocation_id,
 'parsedRetainedPayloadId',q.parsed_retained_payload_id,'finalRetainedPayloadId',q.final_retained_payload_id,'finalFingerprint',q.final_fingerprint,'qualityResults',q.quality_results)
 from private.capital_s11_quality_failures q where q.organization_id=p_org and q.recipe_id=p_recipe;
$$;

create function private.worker_record_capital_s11_quality_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,
 p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes:=private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 seal private.capital_s11_recipe_seals;old private.capital_s11_quality_failures;ok private.capital_s11_accepted_invocations;
 pb private.capital_s11_body_bases;fb private.capital_s11_body_bases;pa private.capital_public_payload_allocations;fa private.capital_public_payload_allocations;tr public.capital_project_task_runs;
begin
 if jsonb_typeof(p_quality_results) is distinct from 'array' or jsonb_array_length(p_quality_results)<>4
 or exists(select 1 from jsonb_array_elements(p_quality_results) q where jsonb_typeof(q) is distinct from 'object' or not(q?&array['id','passed']) or q-array['id','passed']<>'{}' or jsonb_typeof(q->'passed') is distinct from 'boolean')
 or not exists(select 1 from jsonb_array_elements(p_quality_results) q where q->'passed'='false'::jsonb)
 or exists(select 1 from unnest(array['schema_valid','citations_allowed','recommendation_consistent','no_invented_terms']) k where(select count(*) from jsonb_array_elements(p_quality_results) q where q->>'id'=k)<>1)
 then raise exception 'capital_s11_quality_failure_invalid' using errcode='22023';end if;
 select * into strict seal from private.capital_s11_recipe_seals where organization_id=r.organization_id and recipe_id=r.id;
 select * into ok from private.capital_s11_accepted_invocations where organization_id=r.organization_id and recipe_id=r.id and id=p_accepted_invocation_id;
 select x.* into pa from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=r.organization_id and q.id=p_parsed_retained_payload_id and x.content_kind='s11_body';
 select x.* into fa from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=r.organization_id and q.id=p_final_retained_payload_id and x.content_kind='s11_body';
 select * into pb from private.capital_s11_body_bases where organization_id=r.organization_id and id=pa.s11_body_basis_id;
 select * into fb from private.capital_s11_body_bases where organization_id=r.organization_id and id=fa.s11_body_basis_id;
 if ok.id is null or pb.kind is distinct from 'parsed' or fb.kind is distinct from 'final' or pb.recipe_id is distinct from r.id or fb.recipe_id is distinct from r.id
 or pb.accepted_invocation_id is distinct from ok.id or fb.accepted_invocation_id is distinct from ok.id or fb.parent_retained_payload_id is distinct from p_parsed_retained_payload_id
 or pb.semantic_fingerprint is distinct from ok.output_fingerprint or fb.semantic_fingerprint is distinct from p_final_fingerprint
 or not private.capital_body_physical_receipt_v1(r.organization_id,p_parsed_retained_payload_id) or not private.capital_body_physical_receipt_v1(r.organization_id,p_final_retained_payload_id)
 or private.capital_s11_allocation_deadline_v1(r.organization_id,pa.id,r.human_subject_id) is null or private.capital_s11_allocation_deadline_v1(r.organization_id,fa.id,r.human_subject_id) is null
 then raise exception 'capital_s11_quality_failure_proof_denied' using errcode='42501';end if;
 select * into old from private.capital_s11_quality_failures where organization_id=r.organization_id and recipe_id=r.id;
 if old.id is not null then
 if (old.accepted_invocation_id,old.parsed_retained_payload_id,old.final_retained_payload_id,old.final_fingerprint,old.quality_results) is distinct from(p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results) then raise exception 'capital_s11_quality_failure_conflict' using errcode='23505';end if;
 return jsonb_build_object('schemaVersion','capital-s11-quality-failure-receipt.v1','recipeId',r.id,'taskRunId',seal.task_run_id,'qualityFailure',private.capital_s11_quality_failure_dto_v1(r.organization_id,r.id),'replayed',true);
 end if;
 select * into tr from public.capital_project_task_runs where organization_id=r.organization_id and id=seal.task_run_id for update;
 if tr.status is distinct from 'running' or exists(select 1 from private.capital_s11_native_bindings where organization_id=r.organization_id and recipe_id=r.id) then raise exception 'capital_s11_quality_failure_task_denied' using errcode='42501';end if;
 insert into private.capital_s11_quality_failures(organization_id,work_id,recipe_id,task_run_id,accepted_invocation_id,parsed_retained_payload_id,final_retained_payload_id,final_fingerprint,quality_results)
 values(r.organization_id,r.work_id,r.id,seal.task_run_id,ok.id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results);
 update public.capital_project_task_runs set status='failed',completed_at=clock_timestamp(),quality_results=p_quality_results,error=jsonb_build_object('code','capital_s11_quality_failed'),usage='{}',output_reference=null,output_fingerprint=null where organization_id=r.organization_id and id=tr.id;
 perform private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 return jsonb_build_object('schemaVersion','capital-s11-quality-failure-receipt.v1','recipeId',r.id,'taskRunId',seal.task_run_id,'qualityFailure',private.capital_s11_quality_failure_dto_v1(r.organization_id,r.id),'replayed',false);
end; $$;

-- Explicit API denial policies and metadata-only audit match the stage contract.
do $$declare t text;op text;begin
 foreach t in array array['capital_s11_quality_failures','capital_s11_execution_failures'] loop
 foreach op in array array['select','insert','update','delete'] loop
 execute format('create policy %I on private.%I as restrictive for %s to anon,authenticated %s',t||'_deny_'||op,t,op,case when op='insert' then 'with check(false)' when op='update' then 'using(false) with check(false)' else 'using(false)' end);
 end loop;
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end;$$;

create function private.capital_s11_commit_result_core_v1(p_org uuid,p_recipe uuid,p_accepted uuid,p_parsed uuid,p_final uuid,p_final_fingerprint text,p_quality_results jsonb,p_job uuid,p_capability text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes;s private.capital_s11_recipe_seals;b private.capital_s11_native_bindings;ok private.capital_s11_accepted_invocations;
 parsed private.capital_public_payload_allocations;final private.capital_public_payload_allocations;pb private.capital_s11_body_bases;fb private.capital_s11_body_bases;
 tr public.capital_project_task_runs;a public.artifacts;head public.artifact_revisions;manifest jsonb;projection jsonb;fp text;
 rid uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();version integer;deps jsonb;receipt uuid;ref jsonb;stamp timestamptz:=clock_timestamp();deadline timestamptz;final_run uuid;authorized_job public.processing_jobs;
begin
 authorized_job:=private.capital_public_capture_job_v1(p_job,p_capability);
 if authorized_job.organization_id is distinct from p_org then raise exception 'capital_s11_task_denied' using errcode='42501';end if;
 if jsonb_typeof(p_quality_results) is distinct from 'array' or jsonb_array_length(p_quality_results)<>4
 or exists(select 1 from jsonb_array_elements(p_quality_results) q where jsonb_typeof(q) is distinct from 'object' or not(q?&array['id','passed']) or q-array['id','passed']<>'{}' or q->'passed' is distinct from 'true'::jsonb)
 or exists(select 1 from unnest(array['schema_valid','citations_allowed','recommendation_consistent','no_invented_terms']) k where(select count(*) from jsonb_array_elements(p_quality_results) q where q->>'id'=k)<>1) then raise exception 'capital_s11_quality_denied' using errcode='42501';end if;
 select * into strict r from private.capital_s11_recipes where organization_id=p_org and id=p_recipe;
 select * into strict s from private.capital_s11_recipe_seals where organization_id=p_org and recipe_id=r.id;
 if exists(select 1 from private.capital_s11_quality_failures where organization_id=p_org and recipe_id=r.id) or exists(select 1 from private.capital_s11_execution_failures where organization_id=p_org and recipe_id=r.id) then raise exception 'capital_s11_quality_failed_terminal' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-recipe:'||p_org::text||':'||r.id::text,0)) then raise exception 'capital_s11_retry' using errcode='40001';end if;
 select * into ok from private.capital_s11_accepted_invocations where organization_id=p_org and recipe_id=r.id and id=p_accepted;
 select x.* into parsed from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=p_parsed and x.content_kind='s11_body';
 select x.* into final from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=p_final and x.content_kind='s11_body';
 select * into pb from private.capital_s11_body_bases where organization_id=p_org and id=parsed.s11_body_basis_id;
 select * into fb from private.capital_s11_body_bases where organization_id=p_org and id=final.s11_body_basis_id;
 if ok.id is null or pb.kind is distinct from 'parsed' or fb.kind is distinct from 'final' or pb.recipe_id<>r.id or fb.recipe_id<>r.id
 or pb.accepted_invocation_id<>ok.id or fb.accepted_invocation_id<>ok.id or fb.parent_retained_payload_id is distinct from p_parsed
 or pb.semantic_fingerprint<>ok.output_fingerprint or fb.semantic_fingerprint is distinct from p_final_fingerprint
 or not private.capital_body_physical_receipt_v1(p_org,p_parsed) or not private.capital_body_physical_receipt_v1(p_org,p_final) then raise exception 'capital_s11_commit_proof_denied' using errcode='42501';end if;
 deadline:=private.capital_s11_recipe_deadline_v1(p_org,r.id,r.human_subject_id);
 if deadline is null or least(deadline,parsed.purge_at,final.purge_at)<=clock_timestamp() or not private.capital_body_retention_healthy_v1(final.policy_id,p_org,final.id) then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 select * into b from private.capital_s11_native_bindings where organization_id=p_org and recipe_id=r.id;
 if b.id is not null then
 if b.accepted_invocation_id<>p_accepted or b.parsed_retained_payload_id<>p_parsed or b.final_retained_payload_id<>p_final or b.final_fingerprint<>p_final_fingerprint then raise exception 'capital_s11_commit_conflict' using errcode='23505';end if;
 return jsonb_build_object('schemaVersion','capital-s11-commit-receipt.v1','recipeId',r.id,'producerTaskRunId',s.task_run_id,'taskRunId',b.task_run_id,'capitalArtifactId',b.capital_artifact_id,'revisionId',b.revision_id,'finalFingerprint',b.final_fingerprint,'artifactFingerprint',(select artifact_fingerprint from public.capital_project_artifacts where organization_id=p_org and id=b.capital_artifact_id),'artifactVersion',(select artifact_version from public.capital_project_artifacts where organization_id=p_org and id=b.capital_artifact_id),'replayed',true);
 end if;
 -- The paid response belongs to producer M04. It must already have an exact
 -- physical derived bridge; S11 starts only after its published predecessors.
 select * into tr from public.capital_project_task_runs where organization_id=p_org and id=s.task_run_id for update;
 if tr.status<>'succeeded' or tr.processing_job_id<>r.job_id or tr.input_fingerprint<>s.reconstruction_fingerprint or tr.plan_id<>r.plan_id
 or not exists(select 1 from private.capital_s11_task_projections d where d.organization_id=p_org and d.recipe_id=r.id and d.task_run_id=s.task_run_id and d.accepted_invocation_id=ok.id and d.parsed_retained_payload_id=p_parsed)
 then raise exception 'capital_s11_producer_not_committed' using errcode='42501';end if;
 if (authorized_job.payload->>'capital_project_plan_id',authorized_job.payload->>'capital_project_brief_id') is distinct from (r.plan_id::text,r.brief_id::text) then raise exception 'capital_s11_task_denied' using errcode='42501';end if;
 -- Existing server command checks the exact capability and all plan dependency
 -- statuses. This does not replace or reorder C11/S10 to accommodate the model.
 final_run:=private.worker_start_capital_project_task(p_job,p_capability,'S11','offroad.capital_planning','2026.09.24-v2',s.reconstruction_fingerprint,
 jsonb_build_object('schemaVersion','capital-s11-final-task-context.v1','recipeId',r.id,'producerTaskRunId',s.task_run_id,'acceptedInvocationId',ok.id));
 select * into tr from public.capital_project_task_runs where organization_id=p_org and id=final_run for update;
 if tr.status<>'running' or tr.processing_job_id<>p_job or tr.plan_id<>r.plan_id then raise exception 'capital_s11_task_denied' using errcode='42501';end if;
 if exists(select 1 from public.capital_project_plan_tasks pt cross join lateral unnest(pt.dependencies) needed(task_id)
 where pt.organization_id=p_org and pt.plan_id=r.plan_id and pt.task_id='S11' and not exists(
 select 1 from public.capital_project_plan_tasks dep join public.capital_project_task_runs rt on rt.organization_id=dep.organization_id and rt.plan_task_id=dep.id and rt.status='succeeded'
 join public.capital_project_artifacts ca on ca.organization_id=rt.organization_id and ca.task_run_id=rt.id and ca.status not in('stale','superseded')
 left join private.capital_s11_task_projections bridge on bridge.organization_id=ca.organization_id and bridge.capital_artifact_id=ca.id
 where dep.organization_id=p_org and dep.plan_id=r.plan_id and dep.task_id=needed.task_id
 and ((r.revision_decision_id is null and bridge.recipe_id=r.id and bridge.accepted_invocation_id=ok.id and private.capital_body_physical_receipt_v1(p_org,bridge.derived_retained_payload_id))
 or(r.revision_decision_id is not null and exists(select 1 from private.capital_s11_recipe_components rc where rc.organization_id=p_org and rc.recipe_id=r.id and rc.slot='dependency' and rc.dependency_artifact_id=ca.id and rc.version=ca.artifact_version)))))
 then raise exception 'capital_s11_final_dependencies_denied' using errcode='42501';end if;
 if exists(select 1 from private.capital_s11_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=p_org and c.recipe_id=r.id and c.slot='dependency' and(d.status in ('stale','superseded') or d.artifact_version<>c.version)) then raise exception 'capital_s11_dependency_denied' using errcode='42501';end if;
 -- Both writers serialize the same plan/work identity. A reviewed current product
 -- can only be replaced after the existing explicit invalidation command.
 perform 1 from public.capital_project_plans where organization_id=p_org and id=r.plan_id for update;
 if exists(select 1 from public.capital_project_artifacts where organization_id=p_org and capital_project_id=r.work_id and artifact_type='alternative_map' and status in ('confirmed','approved')) then raise exception 'capital_artifact_confirmed_requires_invalidation' using errcode='42501';end if;
 select coalesce(max(artifact_version),0)+1 into version from public.capital_project_artifacts where organization_id=p_org and capital_project_id=r.work_id and artifact_type='alternative_map';
 select * into a from public.artifacts where organization_id=p_org and work_id=r.work_id and kind='work_product' and subject='S11 alternative map' for update;
 if a.id is null then insert into public.artifacts(organization_id,work_id,kind,subject) values(p_org,r.work_id,'work_product','S11 alternative map') returning * into a;end if;
 select * into head from public.artifact_revisions where organization_id=p_org and id=a.head_revision_id;
 manifest:=jsonb_build_object('schemaVersion','artifact-manifest.2026.09.26-v1','kind','work_product','audience','internal','format','json',
 'bytes',jsonb_build_object('sha256',final.payload_fingerprint,'byteLength',final.byte_length,'storage',jsonb_build_object('bucket',final.bucket_id,'path',final.object_path)),
 'method',null,'execution',null,'inputSnapshot',jsonb_build_object('fingerprint',s.reconstruction_fingerprint),'institutionalResult',null,
 'sources','[]'::jsonb,'claims','[]'::jsonb,'traces',jsonb_build_array('capital-s11-recipe:'||r.id::text,'capital-s11-accepted:'||ok.id::text),
 'template',null,'provenance',jsonb_build_object('producer','capital-s11-native-producer.v1','jobId',r.job_id,'taskRunId',final_run,'messageId',null,'capability',null),'legacy',null);
 perform private.validate_artifact_manifest_v1(manifest);
 projection:=jsonb_build_object('schemaVersion','capital-s11-projection.v1','revisionId',rid,'recipeId',r.id,'finalFingerprint',p_final_fingerprint,'physicalSha256',final.payload_fingerprint,'byteLength',final.byte_length);
 fp:=encode(extensions.digest(projection::text,'sha256'),'hex');
 select coalesce(jsonb_agg(jsonb_build_object('artifactId',dependency_artifact_id,'artifactFingerprint',d.artifact_fingerprint) order by c.component_no),'[]') into deps from private.capital_s11_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=p_org and c.recipe_id=r.id and c.slot='dependency';
 -- Deferred exact FKs allow the trigger to see real native authority, never a
 -- caller-controlled schema marker, before inserting CPA and revision.
 insert into private.capital_s11_native_bindings(organization_id,work_id,recipe_id,producer_task_run_id,task_run_id,accepted_invocation_id,parsed_retained_payload_id,final_retained_payload_id,capital_artifact_id,revision_id,final_fingerprint,transformation_version)
 values(p_org,r.work_id,r.id,s.task_run_id,final_run,ok.id,p_parsed,p_final,aid,rid,p_final_fingerprint,'capital-planning-map.transform.v1') returning * into b;
 update public.capital_project_artifacts set status='superseded',superseded_at=stamp where organization_id=p_org and capital_project_id=r.work_id and artifact_type='alternative_map' and status in ('draft','pending_confirmation');
 insert into public.capital_project_artifacts(id,organization_id,capital_project_id,plan_id,task_run_id,artifact_type,schema_version,artifact_version,status,input_fingerprint,artifact_fingerprint,content,evidence_refs,dependencies,processing_job_id,created_by_kind)
 values(aid,p_org,r.work_id,r.plan_id,final_run,'alternative_map','capital-s11-projection.v1',version,'pending_confirmation',s.reconstruction_fingerprint,fp,projection,'[]',deps,r.job_id,'worker');
 insert into public.artifact_revisions(id,organization_id,artifact_id,revision_no,previous_revision_id,audience,origin,manifest,manifest_fingerprint,content_sha256,byte_length)
 values(rid,p_org,a.id,coalesce(head.revision_no,0)+1,head.id,'internal','worker',manifest,encode(extensions.digest(manifest::text,'sha256'),'hex'),final.payload_fingerprint,final.byte_length);
 insert into public.artifact_blocks(organization_id,revision_id,block_no,block_key,kind,content,claims,content_fingerprint) values(p_org,rid,1,'s11-result','section',projection,'[]',fp);
 update public.artifacts set head_revision_id=rid where organization_id=p_org and id=a.id;
 ref:=jsonb_build_object('artifactRevisionId',rid,'manifestFingerprint',encode(extensions.digest(manifest::text,'sha256'),'hex'));
 insert into private.review_basis_receipts(organization_id,work_id,basis_kind,basis_reference,reference_fingerprint,source_count,producer)
 values(p_org,r.work_id,'artifact_revision',ref,encode(extensions.digest(ref::text,'sha256'),'hex'),(select count(*) from private.capital_s11_recipe_components where organization_id=p_org and recipe_id=r.id and slot='source'),'capital-s11-native-producer.v1') returning id into receipt;
 update public.capital_project_task_runs set status='succeeded',completed_at=stamp,output_reference=jsonb_build_object('type','capital_project_artifact','id',aid,'revisionId',rid),output_fingerprint=fp,
 quality_results=p_quality_results,usage='{}',error=null
 where organization_id=p_org and id=final_run;
 if private.capital_s11_recipe_deadline_v1(p_org,r.id,r.human_subject_id) is null or least(deadline,parsed.purge_at,final.purge_at)<=clock_timestamp() then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-s11-commit-receipt.v1','recipeId',r.id,'producerTaskRunId',s.task_run_id,'taskRunId',final_run,'capitalArtifactId',aid,'revisionId',rid,'finalFingerprint',p_final_fingerprint,'artifactFingerprint',fp,'artifactVersion',version,'replayed',false);
end; $$;

create function private.worker_commit_capital_s11_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,
 p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes:=private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);result jsonb;
begin
 result:=private.capital_s11_commit_result_core_v1(r.organization_id,r.id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results,p_job_id,p_capability_token);
 if not private.capital_public_capture_clock_current_v1(p_job_id,p_capability_token) then raise exception 'capital_s11_denied' using errcode='42501';end if;
 return result;
end; $$;

-- MIN inheritance includes the parsed object itself, not just its recipe's
-- licensed sources. Purged/changed parent bytes deny the derivative immediately.
create or replace function private.capital_s11_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare a private.capital_public_payload_allocations;b private.capital_s11_body_bases;d timestamptz;parent private.capital_public_payload_allocations;pb private.capital_s11_body_bases;
begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation and content_kind='s11_body';
 select * into b from private.capital_s11_body_bases where organization_id=p_org and id=a.s11_body_basis_id;
 if b.id is null then return null;end if;
 d:=private.capital_s11_recipe_deadline_v1(p_org,b.recipe_id,p_subject);
 if d is null or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=a.id and q.status='pending') then return null;end if;
 if b.kind in('final','derived','prelude') then
 select x.* into parent from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=p_org and q.id=b.parent_retained_payload_id and x.content_kind='s11_body';
 select * into pb from private.capital_s11_body_bases where organization_id=p_org and id=parent.s11_body_basis_id;
 if pb.recipe_id is distinct from b.recipe_id or (b.kind='prelude' and(pb.kind is distinct from 'context' or b.accepted_invocation_id is not null or pb.accepted_invocation_id is not null or parent.payload_fingerprint is distinct from(select context_fingerprint from private.capital_s11_recipes where organization_id=p_org and id=b.recipe_id)))
 or(b.kind<>'prelude' and(pb.kind is distinct from 'parsed' or pb.accepted_invocation_id is distinct from b.accepted_invocation_id))
 or not private.capital_body_physical_receipt_v1(p_org,b.parent_retained_payload_id)
 or not exists(select 1 from private.capital_public_payload_purge_queue q where q.organization_id=p_org and q.allocation_id=parent.id and q.status='pending') then return null;end if;
 d:=least(d,parent.expires_at,parent.purge_at);
 end if;
 if b.kind='final' then
  -- Every completed internal derivative belongs to this accepted body. A lost
  -- or purged predecessor also closes the final artifact's physical lineage.
  if exists(select 1 from private.capital_s11_task_projections bridge where bridge.organization_id=p_org and bridge.recipe_id=b.recipe_id and
   ((bridge.accepted_invocation_id is not null and bridge.accepted_invocation_id is distinct from b.accepted_invocation_id) or not private.capital_body_physical_receipt_v1(p_org,bridge.derived_retained_payload_id)
   or private.capital_s11_allocation_deadline_v1(p_org,(select allocation_id from private.capital_public_retained_payloads where organization_id=p_org and id=bridge.derived_retained_payload_id),p_subject) is null)) then return null;end if;
  select least(d,min(x.purge_at),min(x.expires_at)) into d from private.capital_s11_task_projections bridge
  join private.capital_public_retained_payloads receipt on receipt.organization_id=bridge.organization_id and receipt.id=bridge.derived_retained_payload_id
  join private.capital_public_payload_allocations x on x.organization_id=receipt.organization_id and x.id=receipt.allocation_id
  where bridge.organization_id=p_org and bridge.recipe_id=b.recipe_id;
 end if;
 return case when least(d,a.expires_at,a.purge_at)>clock_timestamp() then least(d,a.expires_at) end;
end; $$;

-- A successor may read immutable retained bytes, but its grant never authorizes
-- model dispatch and never re-labels the recipe's original job or time.
create function private.worker_recover_capital_s11_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_s11_recipes;s private.capital_s11_recipe_seals;
 b private.capital_s11_native_bindings;ok private.capital_s11_accepted_invocations;parsed jsonb;final jsonb;a private.capital_public_payload_allocations;state text;d timestamptz;
begin
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and id=p_recipe_id and work_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid);
 if r.id is null or (r.plan_id,r.brief_id,r.revision_decision_id) is distinct from ((j.payload->>'capital_project_plan_id')::uuid,(j.payload->>'capital_project_brief_id')::uuid,(j.payload->>'correction_decision_id')::uuid) or not private.capital_body_subject_allowed_v1(j.organization_id,r.work_id,j.authorization_subject_id) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-s11-recipe:'||j.organization_id::text||':'||r.id::text,0)) then raise exception 'capital_s11_retry' using errcode='40001';end if;
 d:=private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 select * into s from private.capital_s11_recipe_seals where organization_id=j.organization_id and recipe_id=r.id;
 if d is null or s.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,s.context_retained_payload_id) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 select * into ok from private.capital_s11_accepted_invocations where organization_id=j.organization_id and recipe_id=r.id;
 select * into b from private.capital_s11_native_bindings where organization_id=j.organization_id and recipe_id=r.id;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id join private.capital_s11_body_bases z on z.organization_id=x.organization_id and z.id=x.s11_body_basis_id where q.organization_id=j.organization_id and z.recipe_id=r.id and z.accepted_invocation_id=ok.id and z.kind='parsed' and q.id=coalesce((select f.parsed_retained_payload_id from private.capital_s11_quality_failures f where f.organization_id=j.organization_id and f.recipe_id=r.id),q.id) order by q.created_at limit 1;
 if a.id is not null and private.capital_body_physical_receipt_v1(j.organization_id,(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id)) and private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is not null then parsed:=private.capital_s11_body_dto_v1(j.organization_id,a.id,private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id),true);end if;
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id join private.capital_s11_body_bases z on z.organization_id=x.organization_id and z.id=x.s11_body_basis_id where q.organization_id=j.organization_id and z.recipe_id=r.id and z.accepted_invocation_id=ok.id and z.kind='final' and q.id=coalesce((select f.final_retained_payload_id from private.capital_s11_quality_failures f where f.organization_id=j.organization_id and f.recipe_id=r.id),q.id) order by q.created_at limit 1;
 if a.id is not null and private.capital_body_physical_receipt_v1(j.organization_id,(select id from private.capital_public_retained_payloads where organization_id=j.organization_id and allocation_id=a.id)) and private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is not null then final:=private.capital_s11_body_dto_v1(j.organization_id,a.id,private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id),true);end if;
 state:=case when exists(select 1 from private.capital_s11_execution_failures q where q.organization_id=j.organization_id and q.recipe_id=r.id) then 'unresolved' when exists(select 1 from private.capital_s11_quality_failures q where q.organization_id=j.organization_id and q.recipe_id=r.id) then 'quality_failed' when b.id is not null then 'committed' when final is not null then 'commit' when parsed is not null then 'transform' else 'unresolved' end;
 if state='quality_failed' and(parsed is null or final is null or not exists(select 1 from public.capital_project_task_runs tr join private.capital_s11_quality_failures q on q.organization_id=tr.organization_id and q.task_run_id=tr.id where q.organization_id=j.organization_id and q.recipe_id=r.id and tr.status='failed' and tr.quality_results=q.quality_results and tr.error=jsonb_build_object('code','capital_s11_quality_failed'))) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 if b.id is not null and not private.capital_s11_native_read_allowed_v1(j.organization_id,b.revision_id,j.authorization_subject_id) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-s11-recovery-grant.v1','mode','recovery','state',state,'recipeId',r.id,'originalJobId',r.job_id,'authorizedJobId',j.id,
 'organizationId',j.organization_id,'workId',r.work_id,'taskRunId',s.task_run_id,'recipe',private.capital_s11_recipe_dto_v1(j.organization_id,r.id),
 'requestPins',jsonb_build_object('schemaVersion','capital-s11-reconstruction-pins.v1','promptFingerprint',s.prompt_fingerprint,'primaryRequestFingerprint',s.primary_request_fingerprint,'fallbackRequestFingerprint',s.fallback_request_fingerprint),
 'qualityFailure',private.capital_s11_quality_failure_dto_v1(j.organization_id,r.id),
 'reconstructionMetadata',jsonb_build_object('schemaVersion','capital-s11-reconstruction-metadata.v1','originalAttempt',r.original_attempt,'researchStatus',s.research_status,'jurisdiction',s.research_jurisdiction,'jurisdictionNeedsConfirmation',s.research_jurisdiction_needs_confirmation,'strategyFingerprint',s.research_strategy_fingerprint,'dependencies',(select coalesce(jsonb_agg(jsonb_build_object('id',c.reference_id,'artifactFingerprint',d.artifact_fingerprint) order by c.component_no),'[]') from private.capital_s11_recipe_components c join public.capital_project_artifacts d on d.organization_id=c.organization_id and d.id=c.dependency_artifact_id where c.organization_id=j.organization_id and c.recipe_id=r.id and c.slot='dependency')),
 'accepted',case when ok.id is null then null else jsonb_build_object('acceptedInvocationId',ok.id,'inputReceiptId',ok.input_receipt_id,'invocationId',ok.invocation_id,'outputFingerprint',ok.output_fingerprint,'provider',ok.accepted_identity->>'provider','reportedModel',ok.accepted_identity->>'reportedModel') end,
 'context',(select private.capital_s11_body_dto_v1(j.organization_id,x.id,private.capital_s11_allocation_deadline_v1(j.organization_id,x.id,j.authorization_subject_id),true) from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=s.context_retained_payload_id),'sources',(select coalesce(jsonb_agg(jsonb_build_object('deliveryId',reference_id,'retainedPayloadId',retained_payload_id) order by component_no),'[]') from private.capital_s11_recipe_components where organization_id=j.organization_id and recipe_id=r.id and slot='source'),
 'parsed',parsed,'final',final,'revisionId',b.revision_id,'capitalArtifactId',b.capital_artifact_id,'expiresAt',d,'dispatchAllowed',false);
end; $$;

create function private.capital_s11_native_ancestry_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare rev uuid;
begin
 for rev in with recursive ancestry(id,path,depth) as(select p_revision,array[p_revision],0 union all select l.derived_from_revision_id,a.path||l.derived_from_revision_id,a.depth+1 from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision' where a.depth<64 and not l.derived_from_revision_id=any(a.path)) select distinct id from ancestry loop
 if not private.capital_s11_native_read_allowed_v1(p_org,rev,p_actor) then return false;end if;
 end loop;
 -- Refuse when depth bound cannot prove the full ancestry; no silent truncation.
 if exists(with recursive ancestry(id,path,depth) as(select p_revision,array[p_revision],0 union all select l.derived_from_revision_id,a.path||l.derived_from_revision_id,a.depth+1 from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision' where a.depth<64 and not l.derived_from_revision_id=any(a.path)) select 1 from ancestry a join private.artifact_dependency_links l on l.organization_id=p_org and l.revision_id=a.id and l.link_kind='artifact_revision' where a.depth=64 and not l.derived_from_revision_id=any(a.path)) then return false;end if;
 return true;
end; $$;

alter function private.artifact_review_sources_allowed_v1(uuid,uuid,uuid) rename to artifact_review_sources_allowed_pre_s11_v1;
create function private.artifact_review_sources_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if not private.capital_s11_native_ancestry_allowed_v1(p_org,p_revision,p_actor) then return false;end if;
 if not private.artifact_review_sources_allowed_pre_s11_v1(p_org,p_revision,p_actor) then return false;end if;
 return private.capital_s11_native_ancestry_allowed_v1(p_org,p_revision,p_actor);
end; $$;

alter function private.review_basis_receipt_authority_v1(uuid,uuid,text,jsonb,uuid) rename to review_basis_receipt_authority_pre_s11_v1;
create function private.review_basis_receipt_authority_v1(p_org uuid,p_work uuid,p_kind text,p_reference jsonb,p_actor uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare receipt private.review_basis_receipts;b private.capital_s11_native_bindings;
begin
 select * into receipt from private.review_basis_receipts where organization_id=p_org and work_id=p_work and basis_kind=p_kind and basis_reference=p_reference and reference_fingerprint=encode(extensions.digest(p_reference::text,'sha256'),'hex');
 if receipt.producer is distinct from 'capital-s11-native-producer.v1' then return private.review_basis_receipt_authority_pre_s11_v1(p_org,p_work,p_kind,p_reference,p_actor);end if;
 select * into b from private.capital_s11_native_bindings where organization_id=p_org and work_id=p_work and revision_id=(p_reference->>'artifactRevisionId')::uuid;
 if b.id is null or p_kind<>'artifact_revision' or receipt.source_count<>(select count(*) from private.capital_s11_recipe_components where organization_id=p_org and recipe_id=b.recipe_id and slot='source') then return 'unresolved';end if;
 if not private.capital_s11_native_ancestry_allowed_v1(p_org,b.revision_id,p_actor) then return 'denied';end if;
 return 'allowed';
end; $$;

alter function private.read_artifact_revision_v1(uuid) rename to read_artifact_revision_pre_s11_v1;
create function private.read_artifact_revision_v1(p_revision uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r public.artifact_revisions;result jsonb;
begin
 select * into r from public.artifact_revisions where id=p_revision;
 result:=private.read_artifact_revision_pre_s11_v1(p_revision);
 if not private.capital_s11_native_ancestry_allowed_v1(r.organization_id,r.id,auth.uid()) then
 result:=jsonb_set(jsonb_set(jsonb_set(result,'{blocks}','[]'),'{revision,manifest}', 'null'),'{restriction}',jsonb_build_object('kind','source_rights','linkIds','[]'::jsonb,'unresolvedRevisionIds',jsonb_build_array(r.id)));
 end if;
 return result;
end; $$;

create function private.wake_capital_s11_retention_v1() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;org uuid:=(row_data->>'organization_id')::uuid;allocation uuid;
begin
 if tg_table_name='capital_project_artifacts' then
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_s11_body_bases b on b.organization_id=a.organization_id and b.id=a.s11_body_basis_id
 where a.organization_id=org and b.recipe_id in(select recipe_id from private.capital_s11_recipe_components where organization_id=org and dependency_artifact_id=(row_data->>'id')::uuid union select recipe_id from private.capital_s11_native_bindings where organization_id=org and capital_artifact_id=(row_data->>'id')::uuid);
 elsif tg_table_name='capital_public_payload_purge_queue' then
 allocation:=(row_data->>'allocation_id')::uuid;
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_s11_body_bases b on b.organization_id=a.organization_id and b.id=a.s11_body_basis_id
 where a.organization_id=org and b.recipe_id in(
 select c.recipe_id from private.capital_s11_recipe_components c join private.capital_public_retained_payloads p on p.organization_id=c.organization_id and p.id=c.retained_payload_id where c.organization_id=org and p.allocation_id=allocation
 union select b0.recipe_id from private.capital_public_payload_allocations a0 join private.capital_s11_body_bases b0 on b0.organization_id=a0.organization_id and b0.id=a0.s11_body_basis_id where a0.organization_id=org and a0.id=allocation);
 else
 -- Authority writes only append wake identities. They never wait for purge
 -- leases while holding resource-policy locks; common drain owns q frontier.
 insert into private.capital_body_retention_wakes(organization_id,allocation_id)
 select distinct a.organization_id,a.id from private.capital_public_payload_allocations a join private.capital_s11_body_bases b on b.organization_id=a.organization_id and b.id=a.s11_body_basis_id
 where a.organization_id=org or b.recipe_id in(select c.recipe_id from private.capital_s11_recipe_components c join private.capital_public_delivery_licenses l on l.organization_id=c.organization_id and l.id=c.license_id where l.licensing_organization_id=org);
 end if;
 return case when tg_op='DELETE' then old else new end;
end; $$;
do $$declare t text;begin
 foreach t in array array['source_rights_versions','resource_access_grants','barrier_memberships','access_group_memberships'] loop
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.wake_capital_s11_retention_v1()',t||'_wake_s11',t);
 end loop;
 foreach t in array array['source_bindings','organization_memberships','capital_projects'] loop
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.wake_capital_s11_retention_v1()',t||'_wake_s11',t);
 end loop;
end; $$;
create trigger capital_artifact_wake_s11 after update of status on public.capital_project_artifacts for each row when(new.status is distinct from old.status and new.status in ('stale','superseded')) execute function private.wake_capital_s11_retention_v1();
create trigger capital_purge_wake_s11 after update of status on private.capital_public_payload_purge_queue for each row when(new.status is distinct from old.status) execute function private.wake_capital_s11_retention_v1();

create function private.worker_read_capital_s11_recovery_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_recover_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 a private.capital_public_payload_allocations;b private.capital_s11_body_bases;s private.capital_s11_recipe_seals;d timestamptz;result jsonb;
begin
 select x.* into a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_retained_payload_id and x.content_kind='s11_body';
 select * into b from private.capital_s11_body_bases where organization_id=j.organization_id and id=a.s11_body_basis_id;
 select * into s from private.capital_s11_recipe_seals where organization_id=j.organization_id and recipe_id=p_recipe_id;
 if b.recipe_id is distinct from p_recipe_id or not private.capital_body_physical_receipt_v1(j.organization_id,p_retained_payload_id)
 or not((b.kind='context' and s.context_retained_payload_id=p_retained_payload_id)
 or(b.kind='parsed' and grant_row#>>'{parsed,retainedPayloadId}'=p_retained_payload_id::text)
 or(b.kind='final' and grant_row#>>'{final,retainedPayloadId}'=p_retained_payload_id::text)) then raise exception 'capital_s11_recovery_body_denied' using errcode='42501';end if;
 d:=private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id);
 if d is null or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_s11_recovery_body_denied' using errcode='42501';end if;
 result:=private.capital_s11_body_dto_v1(j.organization_id,a.id,d,true);
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) or private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_s11_recovery_body_denied' using errcode='42501';end if;
 return result;
end; $$;

-- The shared bounded body allocator accepts a recovery principal only through
-- this private discriminant; the ordinary command still requires the original job.


create function private.worker_prepare_capital_s11_output_core_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,
 p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid,p_recovery boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.capital_s11_recipes;grant_row jsonb;
 j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);ok private.capital_s11_accepted_invocations;
 b private.capital_s11_body_bases;parent private.capital_s11_body_bases;a private.capital_public_payload_allocations;
 parent_a private.capital_public_payload_allocations;p private.capital_public_retention_policies;deadline timestamptz;fp text;bytes bigint;stamp timestamptz:=clock_timestamp();replayed boolean:=false;
begin
 if p_recovery then
 grant_row:=private.worker_recover_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id);
 if p_kind is distinct from 'final' or grant_row->>'state' not in ('transform','commit') or grant_row#>>'{accepted,acceptedInvocationId}' is distinct from p_accepted_invocation_id::text or grant_row#>>'{parsed,retainedPayloadId}' is distinct from p_parent_retained_payload_id::text then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 select * into strict r from private.capital_s11_recipes where organization_id=j.organization_id and id=p_recipe_id;
 else r:=private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);end if;
 if exists(select 1 from private.capital_s11_quality_failures where organization_id=j.organization_id and recipe_id=r.id) or exists(select 1 from private.capital_s11_execution_failures where organization_id=j.organization_id and recipe_id=r.id) then raise exception 'capital_s11_quality_failed_terminal' using errcode='42501';end if;
 if p_request_id is null or p_kind not in ('parsed','final') or p_kind is null or jsonb_typeof(p_body) is distinct from 'object'
 or p_output_fingerprint is null or p_output_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'capital_s11_output_invalid' using errcode='22023';end if;
 select * into ok from private.capital_s11_accepted_invocations where organization_id=j.organization_id and job_id=r.job_id and recipe_id=r.id and id=p_accepted_invocation_id;
 if ok.id is null then raise exception 'capital_s11_accepted_denied' using errcode='42501';end if;
 if p_kind='parsed' then
 if p_output_fingerprint<>ok.output_fingerprint or p_parent_retained_payload_id is not null then raise exception 'capital_s11_output_invalid' using errcode='22023';end if;
 else
 if p_body->>'schemaVersion' is distinct from 'capital-planning-map.v1' then raise exception 'capital_s11_final_invalid' using errcode='22023';end if;
 select x.* into parent_a from private.capital_public_retained_payloads q join private.capital_public_payload_allocations x on x.organization_id=q.organization_id and x.id=q.allocation_id where q.organization_id=j.organization_id and q.id=p_parent_retained_payload_id and x.content_kind='s11_body';
 select * into parent from private.capital_s11_body_bases where organization_id=j.organization_id and id=parent_a.s11_body_basis_id;
 if parent.id is null or parent.kind<>'parsed' or parent.recipe_id<>r.id or parent.accepted_invocation_id<>ok.id or parent.semantic_fingerprint<>ok.output_fingerprint
 or not private.capital_body_physical_receipt_v1(j.organization_id,p_parent_retained_payload_id) then raise exception 'capital_s11_parent_denied' using errcode='42501';end if;
 end if;
 select * into strict p from private.capital_public_retention_policies where id=r.retention_policy_id;
 deadline:=private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id);
 if p_kind='final' then deadline:=least(deadline,parent_a.expires_at,parent_a.purge_at);end if;
 if deadline is null or deadline-make_interval(secs=>p.purge_margin_seconds)<=stamp or not private.capital_public_retention_healthy_v1(j.leased_by,p.id) then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 fp:=encode(extensions.digest(p_body::text,'sha256'),'hex');bytes:=octet_length(p_body::text);
 if bytes not between 1 and 1048576 then raise exception 'capital_s11_body_size_invalid' using errcode='22023';end if;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and job_id=j.id and request_id=p_request_id and content_kind='s11_body';
 if a.id is not null then
 select * into strict b from private.capital_s11_body_bases where organization_id=j.organization_id and id=a.s11_body_basis_id;
 if b.recipe_id<>r.id or b.kind<>p_kind or b.accepted_invocation_id<>ok.id or b.parent_retained_payload_id is distinct from p_parent_retained_payload_id or b.semantic_fingerprint<>p_output_fingerprint or a.payload_fingerprint<>fp or a.byte_length<>bytes then raise exception 'capital_s11_output_conflict' using errcode='23505';end if;
 replayed:=true;
 if private.capital_s11_allocation_deadline_v1(j.organization_id,a.id,j.authorization_subject_id) is null then raise exception 'capital_s11_retention_denied' using errcode='42501';end if;
 else
 insert into private.capital_s11_body_bases(organization_id,work_id,recipe_id,kind,semantic_fingerprint,accepted_invocation_id,parent_retained_payload_id)
 values(j.organization_id,r.work_id,r.id,p_kind,p_output_fingerprint,ok.id,p_parent_retained_payload_id) returning * into b;
 insert into private.capital_public_payload_allocations(id,organization_id,request_id,job_id,worker_token_id,worker_account_id,capability_sha256,policy_id,
 payload_fingerprint,byte_length,object_path,retained_at,expires_at,purge_at,upload_expires_at,s11_body_basis_id,content_kind)
 values(b.id,j.organization_id,p_request_id,j.id,j.leased_by,auth.uid(),j.capability_sha256,p.id,fp,bytes,j.organization_id::text||'/'||b.id::text||'/payload.json',stamp,deadline,
 deadline-make_interval(secs=>p.purge_margin_seconds),least(stamp+interval '5 minutes',deadline-make_interval(secs=>p.purge_margin_seconds)),b.id,'s11_body') returning * into a;
 insert into private.capital_public_payload_purge_queue(organization_id,allocation_id,next_check_at,effective_purge_at) values(j.organization_id,a.id,least(a.upload_expires_at,a.purge_at),a.purge_at);
 end if;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_denied' using errcode='42501';end if;
 return private.capital_s11_body_dto_v1(j.organization_id,a.id,deadline,replayed)||jsonb_build_object('canonicalBody',p_body::text);
end; $$;

create function private.worker_prepare_capital_s11_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null)
returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_s11_output_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,false); $$;

create function private.worker_prepare_capital_s11_recovered_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null)
returns jsonb language sql security definer set search_path='' as $$ select private.worker_prepare_capital_s11_output_core_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id,true); $$;

create function private.worker_commit_capital_s11_recovered_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,
 p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_recover_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);result jsonb;
begin
 if grant_row->>'state' not in ('commit','committed') or grant_row#>>'{accepted,acceptedInvocationId}' is distinct from p_accepted_invocation_id::text
 or grant_row#>>'{parsed,retainedPayloadId}' is distinct from p_parsed_retained_payload_id::text or grant_row#>>'{final,retainedPayloadId}' is distinct from p_final_retained_payload_id::text then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 result:=private.capital_s11_commit_result_core_v1(j.organization_id,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results,p_job_id,p_capability_token);
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 return result;
end; $$;

alter function private.decide_capital_project_artifact(uuid,text,text,text) rename to decide_capital_project_artifact_pre_s11;
create function private.decide_capital_project_artifact(p_artifact_id uuid,p_artifact_fingerprint text,p_decision text,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.capital_s11_native_bindings where capital_artifact_id=p_artifact_id) then raise exception 'capital_s11_revision_review_required' using errcode='42501';end if;
 return private.decide_capital_project_artifact_pre_s11(p_artifact_id,p_artifact_fingerprint,p_decision,p_note);
end; $$;
revoke all on function private.decide_capital_project_artifact_pre_s11(uuid,text,text,text) from public,anon,authenticated,service_role;

-- Fixed concrete API surface only; internal cores and legacy aliases remain
-- inaccessible even when a caller can execute another RPC in private schema.
create function public.worker_prepare_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_s11_recipe_v1(p_job_id,p_capability_token); $$;
create function public.worker_prepare_capital_s11_context_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_s11_context_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id); $$;
create function public.worker_finalize_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_context_retained_payload_id uuid,p_components jsonb,p_reconstruction_fingerprint text,p_prompt_fingerprint text,p_primary_request_fingerprint text,p_fallback_request_fingerprint text,p_operator_budget_micro_usd bigint,p_operator_max_dispatches integer,p_research_status text,p_jurisdiction text,p_jurisdiction_needs_confirmation boolean,p_strategy_fingerprint text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_finalize_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id,p_context_retained_payload_id,p_components,p_reconstruction_fingerprint,p_prompt_fingerprint,p_primary_request_fingerprint,p_fallback_request_fingerprint,p_operator_budget_micro_usd,p_operator_max_dispatches,p_research_status,p_jurisdiction,p_jurisdiction_needs_confirmation,p_strategy_fingerprint); $$;
create function public.worker_commit_capital_s11_body_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid,p_storage_object_id uuid,p_storage_version text,p_verified_sha256 text,p_verified_size bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_s11_body_v1(p_job_id,p_capability_token,p_allocation_id,p_storage_object_id,p_storage_version,p_verified_sha256,p_verified_size); $$;
create function public.worker_read_capital_s11_allocation_v1(p_job_id uuid,p_capability_token text,p_allocation_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_s11_allocation_v1(p_job_id,p_capability_token,p_allocation_id); $$;
create function public.worker_prepare_capital_s11_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_s11_output_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_prepare_capital_s11_recovered_output_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_request_id uuid,p_kind text,p_accepted_invocation_id uuid,p_body jsonb,p_output_fingerprint text,p_parent_retained_payload_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_prepare_capital_s11_recovered_output_v1(p_job_id,p_capability_token,p_recipe_id,p_request_id,p_kind,p_accepted_invocation_id,p_body,p_output_fingerprint,p_parent_retained_payload_id); $$;
create function public.worker_commit_capital_s11_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results); $$;
create function public.worker_commit_capital_s11_recovered_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_commit_capital_s11_recovered_result_v1(p_job_id,p_capability_token,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results); $$;
create function public.worker_recover_capital_s11_result_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_recover_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id); $$;
create function public.worker_read_capital_s11_recovery_body_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_s11_recovery_body_v1(p_job_id,p_capability_token,p_recipe_id,p_retained_payload_id); $$;
create function public.read_capital_s11_result_v1(p_revision_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.read_capital_s11_result_v1(p_revision_id); $$;

create function public.worker_record_capital_s11_execution_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_reason text,p_outcome_ids uuid[] default null) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_record_capital_s11_execution_failure_v1(p_job_id,p_capability_token,p_recipe_id,p_reason,p_outcome_ids); $$;
create function public.worker_record_capital_s11_quality_failure_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_accepted_invocation_id uuid,p_parsed_retained_payload_id uuid,p_final_retained_payload_id uuid,p_final_fingerprint text,p_quality_results jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.worker_record_capital_s11_quality_failure_v1(p_job_id,p_capability_token,p_recipe_id,p_accepted_invocation_id,p_parsed_retained_payload_id,p_final_retained_payload_id,p_final_fingerprint,p_quality_results); $$;
do $$declare p record;begin
 for p in select n.nspname,p0.proname,pg_get_function_identity_arguments(p0.oid) args from pg_proc p0 join pg_namespace n on n.oid=p0.pronamespace where n.nspname in ('private','public') and(p0.proname like '%capital_s11%' or p0.proname like '%pre_s11%' or p0.proname in('capital_capture_allocation_deadline_v2','capital_body_storage_job_authority_v1','worker_record_capital_project_artifact','worker_finish_capital_project_task','project_legacy_artifact_revision_v1','artifact_review_sources_allowed_v1','review_basis_receipt_authority_v1','read_artifact_revision_v1','decide_capital_project_artifact')) loop
 execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',p.nspname,p.proname,p.args);
 if p.proname=any(array['worker_load_capital_s11_recovered_projection_state_v1','worker_prepare_capital_s11_recovered_task_projection_v1','worker_commit_capital_s11_recovered_task_projection_v1','worker_read_capital_s11_recovered_task_body_v1','worker_prepare_capital_s11_task_projection_v1','worker_commit_capital_s11_task_projection_v1','worker_read_capital_s11_task_body_v1','worker_record_capital_s11_execution_failure_v1','worker_record_capital_s11_quality_failure_v1','worker_prepare_capital_s11_recipe_v1','worker_prepare_capital_s11_context_v1','worker_finalize_capital_s11_recipe_v1','worker_commit_capital_s11_body_v1','worker_read_capital_s11_allocation_v1','worker_prepare_capital_s11_output_v1','worker_prepare_capital_s11_recovered_output_v1','worker_commit_capital_s11_result_v1','worker_commit_capital_s11_recovered_result_v1','worker_recover_capital_s11_result_v1','worker_read_capital_s11_recovery_body_v1','read_capital_s11_result_v1','worker_authorize_capital_s11_processing_v1','worker_record_capital_s11_input_v1','worker_record_capital_s11_attempt_outcome_v1','worker_record_capital_s11_accepted_v1','worker_record_capital_project_artifact','worker_finish_capital_project_task','read_artifact_revision_v1','decide_capital_project_artifact']) then execute format('grant execute on function %I.%I(%s) to authenticated',p.nspname,p.proname,p.args);end if;
 end loop;
end; $$;

-- Row guards close calls already compiled against the old private OID as well
-- as the public wrapper. Genuine native authority exists before these inserts.
create function private.guard_capital_s11_native_write_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='capital_project_artifacts' then
 if exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id where tr.organization_id=new.organization_id and tr.id=new.task_run_id and(pt.task_id='S11' or(new.artifact_type='alternative_map' and exists(select 1 from public.processing_jobs j where j.organization_id=tr.organization_id and j.id=tr.processing_job_id and j.payload->>'analysis_scope'='capital_planning'))))
 and not exists(select 1 from private.capital_s11_native_bindings b where b.organization_id=new.organization_id and b.task_run_id=new.task_run_id and b.capital_artifact_id=new.id and new.content->>'schemaVersion'='capital-s11-projection.v1' and new.content->>'revisionId'=b.revision_id::text) then raise exception 'capital_s11_native_commit_required' using errcode='42501';end if;
 elsif new.status='failed' and exists(select 1 from private.capital_s11_recipe_seals z where z.organization_id=new.organization_id and z.task_run_id=new.id) then
 if not exists(select 1 from private.capital_s11_quality_failures q where q.organization_id=new.organization_id and q.task_run_id=new.id and q.quality_results=new.quality_results and new.error=jsonb_build_object('code','capital_s11_quality_failed') and new.output_reference is null and new.output_fingerprint is null) and not exists(select 1 from private.capital_s11_execution_failures q where q.organization_id=new.organization_id and q.task_run_id=new.id and new.quality_results='[]'::jsonb and new.error=jsonb_build_object('code','capital_s11_execution_failed','reason',q.reason) and new.output_reference is null and new.output_fingerprint is null) then raise exception 'capital_s11_native_quality_required' using errcode='42501';end if;
 elsif new.status='succeeded' and exists(select 1 from public.capital_project_plan_tasks pt where pt.organization_id=new.organization_id and pt.id=new.plan_task_id and pt.task_id='S11')
 and not exists(select 1 from private.capital_s11_native_bindings b join public.capital_project_artifacts c on c.organization_id=b.organization_id and c.id=b.capital_artifact_id where b.organization_id=new.organization_id and b.task_run_id=new.id and new.output_reference->>'id'=c.id::text and new.output_fingerprint=c.artifact_fingerprint) then raise exception 'capital_s11_native_commit_required' using errcode='42501';end if;
 return new;
end; $$;
create trigger capital_artifact_native_s11_guard before insert on public.capital_project_artifacts for each row execute function private.guard_capital_s11_native_write_v1();
create trigger capital_task_native_s11_guard before update of status,output_reference,output_fingerprint,quality_results,error on public.capital_project_task_runs for each row execute function private.guard_capital_s11_native_write_v1();
revoke all on function private.guard_capital_s11_native_write_v1() from public,anon,authenticated,service_role;

create function private.worker_read_capital_s11_recovery_source_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row jsonb:=private.worker_recover_capital_s11_result_v1(p_job_id,p_capability_token,p_recipe_id);j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 c private.capital_s11_recipe_components;a private.capital_public_payload_allocations;q private.capital_public_retained_payloads;d timestamptz;margin integer;result jsonb;
begin
 select * into c from private.capital_s11_recipe_components where organization_id=j.organization_id and recipe_id=p_recipe_id and slot='source' and retained_payload_id=p_retained_payload_id;
 select * into q from private.capital_public_retained_payloads where organization_id=j.organization_id and id=c.retained_payload_id;
 select * into a from private.capital_public_payload_allocations where organization_id=j.organization_id and id=q.allocation_id and content_kind='public_source' and license_id=c.license_id and delivery_id=c.reference_id;
 if c.id is null or a.id is null or not private.capital_body_physical_receipt_v1(j.organization_id,q.id) then raise exception 'capital_s11_recovery_source_denied' using errcode='42501';end if;
 d:=private.capital_public_retention_deadline_v1(a.license_id,j.organization_id,a.retained_at,a.policy_id);
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=a.policy_id;
 if d is null or least(a.purge_at,d-make_interval(secs=>margin))<=clock_timestamp() or not private.capital_body_retention_healthy_v1(a.policy_id,j.organization_id,a.id) then raise exception 'capital_s11_recovery_source_denied' using errcode='42501';end if;
 result:=jsonb_build_object('schemaVersion','capital-public-storage-scope.v1','state','complete','allocationId',a.id,'retainedPayloadId',q.id,'deliveryId',a.delivery_id,
 'bucket',a.bucket_id,'path',a.object_path,'payloadFingerprint',a.payload_fingerprint,'byteLength',a.byte_length,'storageObjectId',q.storage_object_id,'storageVersion',q.storage_version,
 'retainedAt',a.retained_at,'uploadExpiresAt',a.upload_expires_at,'expiresAt',least(a.expires_at,d),'purgeAt',least(a.purge_at,d-make_interval(secs=>margin)));
 if private.capital_s11_recipe_deadline_v1(j.organization_id,p_recipe_id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recovery_source_denied' using errcode='42501';end if;
 return result;
end; $$;
create function public.worker_read_capital_s11_recovery_source_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_retained_payload_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_read_capital_s11_recovery_source_v1(p_job_id,p_capability_token,p_recipe_id,p_retained_payload_id); $$;
revoke all on function private.worker_read_capital_s11_recovery_source_v1(uuid,text,uuid,uuid),public.worker_read_capital_s11_recovery_source_v1(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_read_capital_s11_recovery_source_v1(uuid,text,uuid,uuid),public.worker_read_capital_s11_recovery_source_v1(uuid,text,uuid,uuid) to authenticated;

create function private.worker_revalidate_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.capital_s11_recipes:=private.require_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
begin
 return private.capital_s11_recipe_dto_v1(r.organization_id,r.id);
end; $$;
create function public.worker_revalidate_capital_s11_recipe_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_revalidate_capital_s11_recipe_v1(p_job_id,p_capability_token,p_recipe_id); $$;
revoke all on function private.worker_revalidate_capital_s11_recipe_v1(uuid,text,uuid),public.worker_revalidate_capital_s11_recipe_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_revalidate_capital_s11_recipe_v1(uuid,text,uuid),public.worker_revalidate_capital_s11_recipe_v1(uuid,text,uuid) to authenticated;

do $$declare t text;begin
 foreach t in array array['professional_context_profiles','institution_capability_profiles','organization_methodologies','capital_project_briefs','capital_project_plans'] loop
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.wake_capital_s11_retention_v1()',t||'_wake_s11',t);
 end loop;
end; $$;
create trigger capital_session_wake_s11 after update of company_profile,locale,privacy_status,representation_status on public.document_intake_sessions for each row execute function private.wake_capital_s11_retention_v1();

create function private.worker_find_capital_s11_recovery_v1(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare j public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);r private.capital_s11_recipes;state text;
begin
 select * into r from private.capital_s11_recipes where organization_id=j.organization_id and work_id=coalesce(j.work_id,(j.payload->>'capital_project_id')::uuid)
 and plan_id=(j.payload->>'capital_project_plan_id')::uuid and brief_id=(j.payload->>'capital_project_brief_id')::uuid
 and revision_decision_id is not distinct from(j.payload->>'correction_decision_id')::uuid;
 state:=case when r.id is null then 'none' when exists(select 1 from private.capital_s11_accepted_invocations a where a.organization_id=j.organization_id and a.recipe_id=r.id)
 and exists(select 1 from private.capital_s11_recipe_seals s where s.organization_id=j.organization_id and s.recipe_id=r.id)
 and private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is not null then 'recovery' else 'unresolved' end;
 if not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_recovery_denied' using errcode='42501';end if;
 return jsonb_build_object('schemaVersion','capital-s11-recovery-discovery.v1','state',state,'recipeId',r.id);
end; $$;
create function public.worker_find_capital_s11_recovery_v1(p_job_id uuid,p_capability_token text) returns jsonb language sql security invoker set search_path='' as $$ select private.worker_find_capital_s11_recovery_v1(p_job_id,p_capability_token); $$;
revoke all on function private.worker_find_capital_s11_recovery_v1(uuid,text),public.worker_find_capital_s11_recovery_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_find_capital_s11_recovery_v1(uuid,text),public.worker_find_capital_s11_recovery_v1(uuid,text) to authenticated;

-- Native capture inherits no historical package/legacy confirmation. Every
-- derived revision needs its own exact current human review before external use.
alter function private.artifact_revision_release_v1(public.artifact_revisions) rename to artifact_revision_release_pre_s11_v1;
create function private.artifact_revision_release_v1(r public.artifact_revisions)
returns text language plpgsql stable security definer set search_path='' as $$
declare approved boolean;
begin
 if exists(with recursive ancestry(id) as(select r.id union select l.derived_from_revision_id from ancestry a join private.artifact_dependency_links l on l.organization_id=r.organization_id and l.revision_id=a.id and l.link_kind='artifact_revision') select 1 from ancestry a join private.capital_s11_native_bindings b on b.organization_id=r.organization_id and b.revision_id=a.id) then
 approved:=exists(select 1 from public.artifact_reviews v join public.artifacts a on a.organization_id=v.organization_id and a.id=v.artifact_id where v.organization_id=r.organization_id and v.artifact_id=r.artifact_id and v.revision_id=r.id and v.work_id=a.work_id and v.manifest_fingerprint=r.manifest_fingerprint and v.audience=r.audience and private.artifact_review_is_active_v1(r.organization_id,v.id));
 return case when approved then 'released' when r.audience='external' then 'blocked' else 'internal' end;
 end if;
 return private.artifact_revision_release_pre_s11_v1(r);
end; $$;
revoke all on function private.artifact_revision_release_pre_s11_v1(public.artifact_revisions),private.artifact_revision_release_v1(public.artifact_revisions) from public,anon,authenticated,service_role;

-- A native S11 uses licensed cross-tenant bridges, never publisher source UUIDs
-- in a consumer manifest. Its real, current recipe/source/body proof supplies
-- review substance without manufacturing financial claims or weakening history.
do $s11_review_substance$
declare definition text;needle text:='has_substance:=';replacement text;matches integer;
begin
 -- Forward review cuts preserve the original foundation under a renamed core.
 -- Locate that one guarded core rather than modifying the current wrapper.
 select count(*),max(pg_get_functiondef(p.oid)) into matches,definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname like 'review_artifact_revision%'
 and p.proargtypes='2950 25 25 2950 25 16 2950 2950'::oidvector
 and position('if not has_substance then raise exception ''review_substance_required''' in p.prosrc)>0
 and position(needle in p.prosrc)>0;
 if matches<>1 then raise exception 's11_review_substance_definition_drift';end if;
 replacement:='has_substance:=(exists(select 1 from private.capital_s11_native_bindings nb where nb.organization_id=org and nb.revision_id=r.id and exists(select 1 from private.capital_s11_recipe_components src where src.organization_id=nb.organization_id and src.recipe_id=nb.recipe_id and src.slot=''source'') and private.capital_s11_native_read_allowed_v1(org,r.id,actor))) or ';
 execute replace(definition,needle,replacement);
end $s11_review_substance$;
