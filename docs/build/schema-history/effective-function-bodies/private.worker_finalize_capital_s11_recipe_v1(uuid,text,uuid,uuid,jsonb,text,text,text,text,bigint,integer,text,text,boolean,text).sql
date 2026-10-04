CREATE OR REPLACE FUNCTION private.worker_finalize_capital_s11_recipe_v1(p_job_id uuid, p_capability_token text, p_recipe_id uuid, p_context_retained_payload_id uuid, p_components jsonb, p_reconstruction_fingerprint text, p_prompt_fingerprint text, p_primary_request_fingerprint text, p_fallback_request_fingerprint text, p_operator_budget_micro_usd bigint, p_operator_max_dispatches integer, p_research_status text, p_jurisdiction text, p_jurisdiction_needs_confirmation boolean, p_strategy_fingerprint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if r.revision_decision_id is not null then
 if dep.id is null or not exists(select 1 from private.capital_s11_revision_inputs lineage
 join private.capital_s11_task_projections proof on proof.organization_id=lineage.organization_id and proof.recipe_id=lineage.predecessor_recipe_id
 join public.capital_project_task_runs tr on tr.organization_id=proof.organization_id and tr.id=proof.task_run_id
 where lineage.organization_id=j.organization_id and lineage.recipe_id=r.id and proof.capital_artifact_id=dep.id
 and proof.task_id in('M01','M02','C11','S10') and proof.artifact_fingerprint=dep.artifact_fingerprint and tr.plan_id=r.plan_id and tr.status='succeeded')
 then raise exception 'capital_s11_revision_dependency_denied' using errcode='42501';end if;
 else if dep.id is null or not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt on pt.organization_id=tr.organization_id and pt.id=tr.plan_task_id join public.capital_project_plan_tasks m07 on m07.organization_id=pt.organization_id and m07.plan_id=r.plan_id and m07.task_id='M04' where tr.organization_id=j.organization_id and tr.id=dep.task_run_id and tr.status='succeeded' and pt.task_id=any(m07.dependencies)) then raise exception 'capital_s11_dependency_denied' using errcode='42501';end if; end if;
 if component->>'bodyFingerprint' is distinct from encode(extensions.digest('{"artifactFingerprint":'||to_jsonb(dep.artifact_fingerprint)::text||'}','sha256'),'hex') then raise exception 'capital_s11_dependency_pin_invalid' using errcode='22023';end if;
 if not exists(select 1 from private.capital_s11_task_projections bridge join private.capital_public_retained_payloads physical on physical.organization_id=bridge.organization_id and physical.id=bridge.derived_retained_payload_id
 join private.capital_public_payload_allocations allocation on allocation.organization_id=physical.organization_id and allocation.id=physical.allocation_id
 where bridge.organization_id=j.organization_id and bridge.capital_artifact_id=dep.id and bridge.artifact_fingerprint=dep.artifact_fingerprint
 and(bridge.recipe_id=r.id or exists(select 1 from private.capital_s11_revision_inputs lineage where lineage.organization_id=j.organization_id and lineage.recipe_id=r.id and lineage.predecessor_recipe_id=bridge.recipe_id and bridge.task_id in('M01','M02','C11','S10')))
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
 if r.revision_decision_id is not null then
 if (select count(*) from jsonb_array_elements(p_components) c where c->>'slot'='dependency')<>4
 or exists(select 1 from private.capital_s11_task_projections proof join private.capital_s11_revision_inputs lineage on lineage.organization_id=proof.organization_id and lineage.predecessor_recipe_id=proof.recipe_id
 where lineage.organization_id=j.organization_id and lineage.recipe_id=r.id and proof.task_id in('M01','M02','C11','S10')
 and not exists(select 1 from jsonb_array_elements(p_components) c where c->>'slot'='dependency' and c->>'id'=proof.capital_artifact_id::text))
 then raise exception 'capital_s11_revision_dependency_closure_invalid' using errcode='42501';end if;
 run:=private.start_capital_s11_revision_producer_v1(j.id,p_capability_token,r.id,p_reconstruction_fingerprint,jsonb_build_object('schemaVersion','capital-s11-task-context.v1','recipeId',r.id,'recipeFingerprint',fp,'contextRetainedPayloadId',p_context_retained_payload_id));
 else run:=private.worker_start_capital_project_task(j.id,p_capability_token,'M04','offroad.capital_planning','2026.09.24-v2',p_reconstruction_fingerprint,jsonb_build_object('schemaVersion','capital-s11-task-context.v1','recipeId',r.id,'recipeFingerprint',fp,'contextRetainedPayloadId',p_context_retained_payload_id)); end if;
 insert into private.capital_s11_recipe_seals(organization_id,work_id,recipe_id,task_run_id,context_retained_payload_id,recipe_fingerprint,reconstruction_fingerprint,prompt_fingerprint,primary_request_fingerprint,fallback_request_fingerprint,research_status,research_jurisdiction,research_jurisdiction_needs_confirmation,research_strategy_fingerprint,budget_version,research_reservation_version,research_reservation_micro_usd,effective_budget_micro_usd,effective_max_dispatches,sealed_at)
 values(j.organization_id,r.work_id,r.id,run,p_context_retained_payload_id,fp,p_reconstruction_fingerprint,p_prompt_fingerprint,p_primary_request_fingerprint,p_fallback_request_fingerprint,p_research_status,p_jurisdiction,p_jurisdiction_needs_confirmation,p_strategy_fingerprint,'capital-s11-operational-budget.v1','public-research-reservation.s11.v1',research_reserve,effective_budget,effective_dispatches,clock_timestamp()) returning * into s;
 end if;
 if private.capital_s11_recipe_deadline_v1(j.organization_id,r.id,j.authorization_subject_id) is null or not private.capital_public_capture_clock_current_v1(j.id,p_capability_token) then raise exception 'capital_s11_denied' using errcode='42501';end if;
 return private.capital_s11_recipe_dto_v1(j.organization_id,r.id);
end; $function$
