-- DRAFT, not applied. Compile after the real debt recipe/closure helpers, before
-- physical parsed/final writers. M06 is an already succeeded physical execution
-- plan, not the paid invocation. This ledger never changes any TaskRun status.
set search_path='';
create table private.capital_debt_operations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,recipe_id uuid not null,execution_plan_task_run_id uuid not null,
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 root_attempt_id uuid not null,renderer_version text not null check(renderer_version='capital-public-task-renderer.company-debt.v1'),
 max_dispatches integer not null default 2 check(max_dispatches between 1 and 2),max_exposure_micro_usd bigint not null default 950000 check(max_exposure_micro_usd between 1 and 950000),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,recipe_id),unique(organization_id,work_id,job_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,execution_plan_task_run_id) references public.capital_project_task_runs(organization_id,id)
);
create table private.capital_debt_gateway_attempts (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,recipe_id uuid not null,invocation_id uuid not null,worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 previous_attempt_id uuid,root_attempt_id uuid not null,used_provider_fallback boolean not null,
 request_fingerprint text not null check(request_fingerprint~'^[a-f0-9]{64}$'),input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),prompt_fingerprint text not null check(prompt_fingerprint~'^[a-f0-9]{64}$'),
 attempt_metadata jsonb not null,route jsonb not null,resources text[] not null check(resources=array['inference','prompt_cache','schema_cache']::text[]),
 purpose text not null check(purpose='case_analysis'),model text not null check(model in ('claude-sonnet-5','gpt-5.6-terra')),
 processing_decision_id uuid not null,allowed boolean not null,renderer_policy_fingerprint text not null check(renderer_policy_fingerprint~'^[a-f0-9]{64}$'),
 reservation_micro_usd bigint not null check(reservation_micro_usd between 0 and 950000),server_reservation_micro_usd bigint not null check(server_reservation_micro_usd between reservation_micro_usd and 950000),
 captured_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,invocation_id),unique(organization_id,operation_id,used_provider_fallback),unique(organization_id,work_id,job_id,operation_id,id),
 foreign key(organization_id,work_id,job_id,operation_id) references private.capital_debt_operations(organization_id,work_id,job_id,id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id),
 foreign key(organization_id,processing_decision_id) references private.processing_eligibility_decisions(organization_id,id),
 foreign key(organization_id,previous_attempt_id) references private.capital_debt_gateway_attempts(organization_id,id),
 foreign key(organization_id,root_attempt_id) references private.capital_debt_gateway_attempts(organization_id,id) deferrable initially deferred,
 check((not used_provider_fallback and previous_attempt_id is null and root_attempt_id=id and model='claude-sonnet-5')
 or(used_provider_fallback and previous_attempt_id is not null and root_attempt_id<>id and model='gpt-5.6-terra'))
);
alter table private.capital_debt_operations add constraint capital_debt_operation_root_fk
 foreign key(organization_id,work_id,job_id,id,root_attempt_id) references private.capital_debt_gateway_attempts(organization_id,work_id,job_id,operation_id,id) deferrable initially deferred;
create table private.capital_debt_input_dispatches (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,attempt_id uuid not null,invocation_id uuid not null,dispatch_claim_id uuid not null default gen_random_uuid(),
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 request_fingerprint text not null check(request_fingerprint~'^[a-f0-9]{64}$'),reservation_micro_usd bigint not null,server_reservation_micro_usd bigint not null,
 claimed_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,attempt_id),unique(organization_id,invocation_id),unique(organization_id,dispatch_claim_id),
 unique(organization_id,work_id,job_id,operation_id,attempt_id,id),
 foreign key(organization_id,work_id,job_id,operation_id,attempt_id) references private.capital_debt_gateway_attempts(organization_id,work_id,job_id,operation_id,id),
 check(reservation_micro_usd between 0 and 950000 and server_reservation_micro_usd between reservation_micro_usd and 950000)
);
create table private.capital_debt_attempt_outcomes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 operation_id uuid not null,attempt_id uuid not null,input_receipt_id uuid not null,invocation_id uuid not null,
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 observation jsonb not null,outcome text not null check(outcome in ('accepted','invalid_output','provider_error','timeout','refusal')),
 outcome_fingerprint text not null check(outcome_fingerprint~'^[a-f0-9]{64}$'),cost_micro_usd bigint,server_exposure_micro_usd bigint not null,
 recorded_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,attempt_id),unique(organization_id,input_receipt_id),unique(organization_id,invocation_id),
 foreign key(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id) references private.capital_debt_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id,id),
 check(cost_micro_usd is null or cost_micro_usd between 0 and 9007199254740991),check(server_exposure_micro_usd between 0 and 9007199254740991)
);
create unique index capital_debt_outcomes_one_accepted on private.capital_debt_attempt_outcomes(organization_id,operation_id) where outcome='accepted';
create table private.capital_debt_accepted_invocations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,recipe_id uuid not null,
 input_receipt_id uuid not null,invocation_id uuid not null,output_fingerprint text not null check(output_fingerprint~'^[a-f0-9]{64}$'),accepted_identity jsonb not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,input_receipt_id),unique(organization_id,recipe_id),
 foreign key(organization_id,work_id,recipe_id) references private.capital_debt_recipes(organization_id,work_id,id),
 foreign key(organization_id,input_receipt_id) references private.capital_debt_input_dispatches(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id)
);
-- Cover every composite FK and principal lookup; append-only audit has no raw bodies.
create index capital_debt_operation_recipe_idx on private.capital_debt_operations(organization_id,work_id,recipe_id);
create index capital_debt_operation_job_idx on private.capital_debt_operations(organization_id,job_id);
create index capital_debt_operation_execution_plan_idx on private.capital_debt_operations(organization_id,execution_plan_task_run_id);
create index capital_debt_operation_root_idx on private.capital_debt_operations(organization_id,work_id,job_id,id,root_attempt_id);
create index capital_debt_attempt_op_idx on private.capital_debt_gateway_attempts(organization_id,work_id,job_id,operation_id);
create index capital_debt_attempt_recipe_idx on private.capital_debt_gateway_attempts(organization_id,work_id,recipe_id);
create index capital_debt_attempt_decision_idx on private.capital_debt_gateway_attempts(organization_id,processing_decision_id);
create index capital_debt_attempt_previous_idx on private.capital_debt_gateway_attempts(organization_id,previous_attempt_id);
create index capital_debt_attempt_root_idx on private.capital_debt_gateway_attempts(organization_id,root_attempt_id);
create index capital_debt_dispatch_attempt_idx on private.capital_debt_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id);
create index capital_debt_outcome_input_idx on private.capital_debt_attempt_outcomes(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id);
create index capital_debt_accepted_recipe_idx on private.capital_debt_accepted_invocations(organization_id,work_id,recipe_id);
create index capital_debt_accepted_job_idx on private.capital_debt_accepted_invocations(organization_id,job_id);
do $$declare t text;begin
 foreach t in array array['capital_debt_operations','capital_debt_gateway_attempts','capital_debt_input_dispatches','capital_debt_attempt_outcomes','capital_debt_accepted_invocations'] loop
 execute format('alter table private.%I enable row level security',t);execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 execute format('create policy deny_clients_select on private.%I as restrictive for select to anon,authenticated using(false)',t);
 execute format('create policy deny_clients_insert on private.%I as restrictive for insert to anon,authenticated with check(false)',t);
 execute format('create policy deny_clients_update on private.%I as restrictive for update to anon,authenticated using(false) with check(false)',t);
 execute format('create policy deny_clients_delete on private.%I as restrictive for delete to anon,authenticated using(false)',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 if t<>'capital_debt_accepted_invocations' then
 execute format('create index %I on private.%I(worker_account_id)',t||'_worker_idx',t);execute format('create index %I on private.%I(human_subject_id)',t||'_subject_idx',t);
 end if;
 end loop;
end;$$;

-- Separate closed registry; existing contribution fingerprint function is unchanged.
create function private.capital_debt_attempt_outcome_fingerprint_v1(p_outcome jsonb)
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
 or p_outcome->>'task' is distinct from 'company_debt_view'
 or p_outcome->>'provider' is distinct from (case when p_outcome->>'configuredModel'='claude-sonnet-5' then 'anthropic' else 'openai' end)
 or p_outcome->>'configuredModel' is null or p_outcome->>'configuredModel' not in ('claude-sonnet-5','gpt-5.6-terra')
 or p_outcome->>'schemaName' is distinct from 'company_debt_diagnostic_v1'
 or p_outcome->>'adapterInputVersion' is distinct from 'gateway-adapter-input.v1' then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['outcomeFingerprint','requestFingerprint','inputFingerprint','promptFingerprint'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'string' or p_outcome->>key !~ '^[a-f0-9]{64}$' then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;end loop;
 foreach key in array array['invocationId','processingDecisionId','inputAttestationReceiptId'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'string' or p_outcome->>key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;end loop;
 if p_outcome->'previousInvocationId'<>'null'::jsonb and(jsonb_typeof(p_outcome->'previousInvocationId') is distinct from 'string'
 or p_outcome->>'previousInvocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['isSameModelRepair','usedProviderFallback','fromCassette'] loop
 if jsonb_typeof(p_outcome->key) is distinct from 'boolean' then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;end loop;
 if p_outcome->>'isSameModelRepair'<>'false' or p_outcome->>'fromCassette'<>'false' or p_outcome->>'retryOrdinal'<>'0'
 or((p_outcome->>'usedProviderFallback')::boolean and p_outcome->'previousInvocationId'='null'::jsonb)
 or(not(p_outcome->>'usedProviderFallback')::boolean and p_outcome->'previousInvocationId'<>'null'::jsonb) then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 foreach key in array array['retryOrdinal','reservationMicroUsd','costMicroUsd','exposureMicroUsd','inputTokens','outputTokens','cachedInputTokens','latencyMillis'] loop
 if p_outcome->key='null'::jsonb and key in ('costMicroUsd','inputTokens','outputTokens','cachedInputTokens') then continue;end if;
 if jsonb_typeof(p_outcome->key) is distinct from 'number' then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 number_value:=(p_outcome->>key)::numeric;
 if number_value<0 or number_value>9007199254740991 or trunc(number_value)<>number_value or scale(number_value)<>0 then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 end loop;
 kind:=p_outcome->>'outcome';status:=p_outcome->>'costStatus';
 if kind is null or kind not in ('accepted','invalid_output','provider_error','timeout','refusal') or status is null or status not in ('measured','unknown') then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 if(status='unknown' and exists(select 1 from unnest(array['costMicroUsd','inputTokens','outputTokens','cachedInputTokens']) k where p_outcome->k<>'null'::jsonb))
 or(status='measured' and exists(select 1 from unnest(array['costMicroUsd','inputTokens','outputTokens','cachedInputTokens']) k where p_outcome->k='null'::jsonb))
 or(kind in ('provider_error','timeout') and status<>'unknown')
 or(p_outcome->>'exposureMicroUsd')::numeric<>greatest((p_outcome->>'reservationMicroUsd')::numeric,coalesce((p_outcome->>'costMicroUsd')::numeric,(p_outcome->>'reservationMicroUsd')::numeric)) then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 if kind='accepted' then
 if p_outcome->'failureCode'<>'null'::jsonb or p_outcome->>'outputFingerprintVersion' is distinct from 'gateway-parsed-output.v1'
 or jsonb_typeof(p_outcome->'outputFingerprint') is distinct from 'string' or p_outcome->>'outputFingerprint'!~'^[a-f0-9]{64}$'
 or p_outcome->>'reportedModel' is distinct from p_outcome->>'configuredModel' or p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 else
 if p_outcome->'outputFingerprintVersion'<>'null'::jsonb or p_outcome->'outputFingerprint'<>'null'::jsonb or p_outcome->'reportedModel'<>'null'::jsonb
 or jsonb_typeof(p_outcome->'failureCode') is distinct from 'string'
 or(kind='invalid_output' and p_outcome->>'failureCode' not in ('schema_invalid','deterministic_invalid','output_truncated'))
 or(kind='provider_error' and p_outcome->>'failureCode'<>'provider_failure')
 or(kind='timeout' and p_outcome->>'failureCode'<>'provider_timeout')
 or(kind='refusal' and p_outcome->>'failureCode'<>'provider_refusal') then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 if kind='invalid_output' then
 if p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb and(jsonb_typeof(p_outcome->'validationIssueCodeFingerprint') is distinct from 'string'
 or p_outcome->>'validationIssueCodeFingerprint'!~'^[a-f0-9]{64}$') then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 if p_outcome->>'failureCode' in ('schema_invalid','deterministic_invalid') and p_outcome->'validationIssueCodeFingerprint'='null'::jsonb then
 raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 elsif p_outcome->'validationIssueCodeFingerprint'<>'null'::jsonb then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
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

-- Closed ASCII registry, independently verified against shared Node serialization.
-- Schema pin refers to actual logical Zod schema; physical SHA remains separate.
create function private.capital_debt_dispatch_policy_v1(p_model text,p_input_bytes bigint)
returns jsonb language plpgsql immutable security definer set search_path='' as $$
declare tuple jsonb;wire text;pricing_wire text;tokens bigint;bound bigint;provider text;output_rate bigint;
begin
 if p_input_bytes is null or p_input_bytes not between 1 and 100000 or p_model is null or p_model not in ('claude-sonnet-5','gpt-5.6-terra') then raise exception 'capital_debt_policy_invalid' using errcode='22023';end if;
 provider:=case when p_model='claude-sonnet-5' then 'anthropic' else 'openai' end;
 output_rate:=case when p_model='claude-sonnet-5' then 10000000 else 12000000 end;
 pricing_wire:=case when p_model='claude-sonnet-5' then '{"cacheWrite":2.5,"cachedInput":0.2,"input":2,"longContext":null,"output":10}'
 else '{"cacheWrite":2.5,"cachedInput":0.2,"input":2,"longContext":{"aboveInputTokens":272000,"inputMultiplier":2,"outputMultiplier":1.5},"output":12}' end;
 tuple:=jsonb_build_array('capital-debt-dispatch-policy.v1','capital-public-task-renderer.company-debt.v1',provider,p_model,'medium',
 '9199aef1808e15ec507b493d078ef3d95c7953c386a3df79eff132654eb06e0c',2820,
 '0f3a7e83259ae20672405d757fb3c4237467c9e21d5befffa57282f93d58893e',
 'company-debt-public-sources-1600.v1',8000,240000,
 'company-debt-diagnostic-v1');
 select '['||string_agg(x.value::text,',' order by x.ordinality)||','||pricing_wire||']' into wire from jsonb_array_elements(tuple) with ordinality x(value,ordinality);
 -- Logical schema (6146B) exceeds strict OpenAI schema (4432B). Reserve the
 -- larger schema on either route, plus fixed framing and 10 percent headroom.
 tokens:=100000+2820+6146+1024;
 bound:=ceil((tokens::numeric*2500000+8000::numeric*output_rate)*11/10000000)::bigint;
 return jsonb_build_object('fingerprint',encode(extensions.digest(wire,'sha256'),'hex'),'serverBoundMicroUsd',bound);
end;$$;

create function private.lock_capital_debt_operation_v1(p_org uuid,p_recipe uuid)
returns void language plpgsql security definer set search_path='' as $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('capital-debt-operation:'||p_org::text||':'||p_recipe::text,0)) then
 raise exception 'capital_capture_retry' using errcode='40001';end if;
end;$$;
create function private.capital_debt_attempt_assurances_current_v1(p_job public.processing_jobs,p_attempt private.capital_debt_gateway_attempts)
returns void language plpgsql security definer set search_path='' as $$
declare decision_row private.processing_eligibility_decisions;assurance_row private.provider_processing_assurances;
 assurance_uuid uuid;seen text[]:='{}';matches integer;
begin
 if p_attempt.organization_id<>p_job.organization_id or p_attempt.job_id<>p_job.id or not p_attempt.allowed
 or p_attempt.worker_account_id<>auth.uid() or p_attempt.human_subject_id<>p_job.authorization_subject_id then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended('provider-processing-assurances',0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 select * into decision_row from private.processing_eligibility_decisions where organization_id=p_job.organization_id and job_id=p_job.id and id=p_attempt.processing_decision_id;
 if decision_row.id is null or not decision_row.allowed or decision_row.route is distinct from p_attempt.route
 or decision_row.classification is distinct from 'restricted' or decision_row.purpose is distinct from 'case_analysis'
 or decision_row.policy_version is distinct from 'offroad-provider-retention-v2' or decision_row.resources is distinct from p_attempt.resources
 or cardinality(decision_row.assurance_ids)<>3 or(select count(distinct x) from unnest(decision_row.assurance_ids)x)<>3 then
 raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 for assurance_uuid in select x from unnest(decision_row.assurance_ids)x order by x loop
 begin select * into assurance_row from private.provider_processing_assurances where id=assurance_uuid for share nowait;
 exception when lock_not_available then raise exception 'capital_capture_retry' using errcode='40001';end;
 if assurance_row.id is null or assurance_row.revoked_at is not null or assurance_row.reviewed_at>clock_timestamp()
 or assurance_row.valid_through<=clock_timestamp() or assurance_row.provider is distinct from p_attempt.route->>'provider'
 or assurance_row.account_ref is distinct from p_attempt.route->>'accountRef' or assurance_row.project_ref is distinct from p_attempt.route->>'projectRef'
 or assurance_row.credential_binding is distinct from p_attempt.route->>'credentialBinding' or assurance_row.endpoint is distinct from p_attempt.route->>'endpoint'
 or assurance_row.region is distinct from p_attempt.route->>'region' or(assurance_row.document->'models' ? p_attempt.model)is distinct from true
 or assurance_row.resource not in ('inference','prompt_cache','schema_cache') or assurance_row.resource=any(seen)
 or assurance_row.document->>'eligibility' is distinct from 'supported' or assurance_row.document->>'trainingUse' is distinct from 'prohibited'
 or(assurance_row.document->'purposes' ? 'case_analysis')is distinct from true or(assurance_row.document->'classifications' ? 'restricted')is distinct from true
 or(assurance_row.document->'rights' ? 'process')is distinct from true then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 select count(*) into matches from private.provider_processing_assurances a where a.revoked_at is null
 and(a.provider,a.account_ref,a.project_ref,a.credential_binding,a.endpoint,a.region,a.resource)
 is not distinct from(assurance_row.provider,assurance_row.account_ref,assurance_row.project_ref,assurance_row.credential_binding,assurance_row.endpoint,assurance_row.region,assurance_row.resource)
 and a.document->'models' ? p_attempt.model;
 if matches<>1 then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 seen:=array_append(seen,assurance_row.resource);
 end loop;
end;$$;
create function private.capital_debt_attempt_current_v1(p_job_id uuid,p_capability_token text,p_attempt private.capital_debt_gateway_attempts)
returns private.capital_debt_recipes language plpgsql security definer set search_path='' as $$
declare recipe private.capital_debt_recipes;job public.processing_jobs;op private.capital_debt_operations;seal private.capital_debt_recipe_seals;prior private.capital_debt_gateway_attempts;
begin
 recipe:=private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_attempt.recipe_id);
 if exists(select 1 from private.capital_debt_quality_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) or exists(select 1 from private.capital_debt_execution_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) then raise exception 'capital_debt_execution_failed_terminal' using errcode='42501';end if;
 job:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 perform private.lock_capital_debt_operation_v1(recipe.organization_id,recipe.id);
 select * into op from private.capital_debt_operations where organization_id=recipe.organization_id and id=p_attempt.operation_id;
 select * into seal from private.capital_debt_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id;
 if op.id is null or seal.recipe_id is null or p_attempt.job_id<>recipe.job_id or p_attempt.work_id<>recipe.work_id
 or p_attempt.worker_account_id<>auth.uid() or p_attempt.human_subject_id<>job.authorization_subject_id
 or op.recipe_id<>recipe.id or op.job_id<>job.id or op.worker_account_id<>auth.uid() or op.human_subject_id<>job.authorization_subject_id
 or op.execution_plan_task_run_id<>seal.execution_plan_task_run_id or op.root_attempt_id<>p_attempt.root_attempt_id
 or p_attempt.input_fingerprint<>seal.reconstruction_fingerprint or p_attempt.prompt_fingerprint<>seal.prompt_fingerprint
 or p_attempt.request_fingerprint<>(case when p_attempt.used_provider_fallback then seal.fallback_request_fingerprint else seal.primary_request_fingerprint end) then
 raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 if not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt
 on(pt.organization_id,pt.id)=(tr.organization_id,tr.plan_task_id)
 where tr.organization_id=recipe.organization_id and tr.id=seal.execution_plan_task_run_id
 and tr.capital_project_id=recipe.work_id and tr.plan_id=recipe.plan_id and tr.status='succeeded' and pt.task_id='M06') then
 raise exception 'capital_debt_execution_plan_denied' using errcode='42501';end if;
 if p_attempt.previous_attempt_id is not null then
 select * into prior from private.capital_debt_gateway_attempts where organization_id=recipe.organization_id and id=p_attempt.previous_attempt_id;
 if prior.id is null or prior.operation_id<>op.id or prior.used_provider_fallback or prior.root_attempt_id<>p_attempt.root_attempt_id
 or prior.worker_account_id<>auth.uid() or prior.human_subject_id<>job.authorization_subject_id then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 if prior.allowed then
 perform private.capital_debt_attempt_assurances_current_v1(job,prior);
 if not exists(select 1 from private.capital_debt_attempt_outcomes o where o.organization_id=recipe.organization_id and o.attempt_id=prior.id and o.outcome<>'accepted') then
 raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 end if;
 end if;
 if p_attempt.allowed then perform private.capital_debt_attempt_assurances_current_v1(job,p_attempt);end if;
 return recipe;
end;$$;

create function private.capital_debt_attempt_dto_v1(p_attempt private.capital_debt_gateway_attempts,p_replayed boolean)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-body-processing-decision.v2','allowed',p_attempt.allowed,'policyVersion',d.policy_version,
 'assuranceId',null,'assuranceIds',to_jsonb(d.assurance_ids),'decisionId',d.id,'classification',d.classification,'reasons',to_jsonb(d.reasons),
 'attemptReceiptId',p_attempt.id,'invocationId',p_attempt.invocation_id,'requestFingerprint',p_attempt.request_fingerprint,
 'eligibilityFingerprint',encode(extensions.digest(jsonb_build_object('decision',d.id,'recipe',p_attempt.recipe_id,'policy',p_attempt.renderer_policy_fingerprint)::text,'sha256'),'hex'),
 'replayed',p_replayed,'operationId',p_attempt.operation_id,'rootAttemptReceiptId',p_attempt.root_attempt_id)
 from private.processing_eligibility_decisions d where d.organization_id=p_attempt.organization_id and d.id=p_attempt.processing_decision_id;
$$;
create function private.worker_authorize_capital_debt_processing_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare recipe private.capital_debt_recipes:=private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,p_recipe_id);
 job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);seal private.capital_debt_recipe_seals;
 op private.capital_debt_operations;a private.capital_debt_gateway_attempts;prior private.capital_debt_gateway_attempts;
 fallback boolean;invocation uuid;prior_invocation uuid;new_attempt_id uuid:=gen_random_uuid();model text;policy jsonb;decision jsonb;
 observed bigint;server_reserve bigint;stamp timestamptz:=clock_timestamp();deadline timestamptz;replayed boolean:=false;
begin
 perform private.lock_capital_debt_operation_v1(recipe.organization_id,recipe.id);
 if exists(select 1 from private.capital_debt_quality_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) or exists(select 1 from private.capital_debt_execution_failures where organization_id=recipe.organization_id and recipe_id=recipe.id) then raise exception 'capital_debt_quality_failed_terminal' using errcode='42501';end if;
 select * into strict seal from private.capital_debt_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id;
 if not exists(select 1 from public.capital_project_task_runs tr join public.capital_project_plan_tasks pt
 on(pt.organization_id,pt.id)=(tr.organization_id,tr.plan_task_id)
 where tr.organization_id=recipe.organization_id and tr.id=seal.execution_plan_task_run_id
 and tr.capital_project_id=recipe.work_id and tr.plan_id=recipe.plan_id and tr.status='succeeded' and pt.task_id='M06') then
 raise exception 'capital_debt_execution_plan_denied' using errcode='42501';end if;
 if jsonb_typeof(p_attempt)is distinct from 'object' or octet_length(p_attempt::text)>4096
 or not(p_attempt?&array['adapterInputVersion','task','schemaName','requestFingerprint','inputFingerprint','promptFingerprint','invocationId','retryOrdinal','isSameModelRepair','usedProviderFallback','reservationUsd'])
 or p_attempt-array['adapterInputVersion','task','schemaName','requestFingerprint','inputFingerprint','promptFingerprint','invocationId','retryOrdinal','isSameModelRepair','usedProviderFallback','reservationUsd','previousInvocationId']<>'{}'::jsonb
 or p_attempt->>'adapterInputVersion'is distinct from 'gateway-adapter-input.v1' or p_attempt->>'task'is distinct from 'company_debt_view'
 or p_attempt->>'schemaName'is distinct from 'company_debt_diagnostic_v1'
 or exists(select 1 from unnest(array['requestFingerprint','inputFingerprint','promptFingerprint'])k where jsonb_typeof(p_attempt->k)is distinct from 'string' or p_attempt->>k !~'^[a-f0-9]{64}$')
 or jsonb_typeof(p_attempt->'invocationId')is distinct from 'string' or p_attempt->>'invocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 or jsonb_typeof(p_attempt->'retryOrdinal')is distinct from 'number' or p_attempt->>'retryOrdinal'is distinct from '0'
 or jsonb_typeof(p_attempt->'isSameModelRepair')is distinct from 'boolean' or p_attempt->>'isSameModelRepair'is distinct from 'false'
 or jsonb_typeof(p_attempt->'usedProviderFallback')is distinct from 'boolean' or jsonb_typeof(p_attempt->'reservationUsd')is distinct from 'number'
 or(p_attempt->>'reservationUsd')::numeric not between 0 and 0.95
 or p_resources is null or cardinality(p_resources)<>3 or not(p_resources@>array['inference','prompt_cache','schema_cache']::text[]) or p_purpose is distinct from 'case_analysis' then
 raise exception 'capital_debt_processing_invalid' using errcode='22023';end if;
 invocation:=(p_attempt->>'invocationId')::uuid;fallback:=(p_attempt->>'usedProviderFallback')::boolean;
 if(fallback and(jsonb_typeof(p_attempt->'previousInvocationId')is distinct from 'string' or p_attempt->>'previousInvocationId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'))
 or(not fallback and p_attempt?'previousInvocationId')then raise exception 'capital_debt_processing_invalid' using errcode='22023';end if;
 if fallback then prior_invocation:=(p_attempt->>'previousInvocationId')::uuid;end if;
 model:=case when fallback then 'gpt-5.6-terra' else 'claude-sonnet-5' end;
 if jsonb_typeof(p_route)is distinct from 'object' or p_route->>'provider'is distinct from (case when fallback then 'openai' else 'anthropic' end) or p_route->>'model'is distinct from model
 or p_route->>'endpoint'is distinct from (case when fallback then 'https://api.openai.com/v1/responses' else 'https://api.anthropic.com/v1/messages' end) then raise exception 'capital_debt_processing_invalid' using errcode='22023';end if;
 if p_attempt->>'inputFingerprint'is distinct from seal.reconstruction_fingerprint or p_attempt->>'promptFingerprint'is distinct from seal.prompt_fingerprint
 or p_attempt->>'requestFingerprint'is distinct from (case when fallback then seal.fallback_request_fingerprint else seal.primary_request_fingerprint end) then
 raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 if exists(select 1 from private.capital_body_invocation_inputs x where x.organization_id=recipe.organization_id and x.invocation_id=invocation)
 or exists(select 1 from private.capital_body_gateway_attempts x where x.organization_id=recipe.organization_id and x.invocation_id=invocation) then
 raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 policy:=private.capital_debt_dispatch_policy_v1(model,100000);observed:=ceil((p_attempt->>'reservationUsd')::numeric*1000000)::bigint;
 server_reserve:=greatest(observed,(policy->>'serverBoundMicroUsd')::bigint);
 select * into op from private.capital_debt_operations where organization_id=recipe.organization_id and recipe_id=recipe.id;
 select * into a from private.capital_debt_gateway_attempts where organization_id=recipe.organization_id and invocation_id=invocation;
 if a.id is not null then
 if op.id is null or a.operation_id<>op.id or a.recipe_id<>recipe.id or a.attempt_metadata is distinct from p_attempt or a.route is distinct from p_route
 or a.reservation_micro_usd<>observed or a.server_reservation_micro_usd<>server_reserve or a.renderer_policy_fingerprint<>policy->>'fingerprint' then
 raise exception 'capital_debt_processing_conflict' using errcode='23505';end if;
 perform private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);replayed:=true;
 else
 if op.id is null then
 if fallback then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 insert into private.capital_debt_operations(organization_id,work_id,job_id,recipe_id,execution_plan_task_run_id,worker_account_id,human_subject_id,root_attempt_id,renderer_version,max_dispatches,max_exposure_micro_usd)
 values(recipe.organization_id,recipe.work_id,job.id,recipe.id,seal.execution_plan_task_run_id,auth.uid(),job.authorization_subject_id,new_attempt_id,recipe.renderer_version,seal.effective_max_dispatches,seal.effective_budget_micro_usd) returning * into op;
 elsif not fallback then raise exception 'capital_debt_processing_denied' using errcode='42501';
 end if;
 if op.job_id<>job.id or op.worker_account_id<>auth.uid() or op.human_subject_id<>job.authorization_subject_id or op.execution_plan_task_run_id<>seal.execution_plan_task_run_id then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 if fallback then
 select * into prior from private.capital_debt_gateway_attempts where organization_id=recipe.organization_id and invocation_id=prior_invocation;
 if prior.id is null or prior.operation_id<>op.id or prior.used_provider_fallback or prior.id<>op.root_attempt_id
 or exists(select 1 from private.capital_debt_attempt_outcomes o where o.organization_id=recipe.organization_id and o.operation_id=op.id and o.outcome='accepted') then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 perform private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,prior);
 if prior.allowed and not exists(select 1 from private.capital_debt_attempt_outcomes o where o.organization_id=recipe.organization_id and o.attempt_id=prior.id and o.outcome<>'accepted') then
 raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 end if;
 deadline:=private.capital_debt_recipe_deadline_v1(recipe.organization_id,recipe.id,job.authorization_subject_id);
 if deadline is null or deadline<=clock_timestamp() then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 decision:=private.provider_processing_decision_with_body_limit_v1(job,p_route,array['inference','prompt_cache','schema_cache'],p_purpose,least(deadline,recipe.expires_at));
 insert into private.capital_debt_gateway_attempts(id,organization_id,work_id,job_id,operation_id,recipe_id,invocation_id,worker_account_id,human_subject_id,
 previous_attempt_id,root_attempt_id,used_provider_fallback,request_fingerprint,input_fingerprint,prompt_fingerprint,attempt_metadata,route,resources,purpose,model,
 processing_decision_id,allowed,renderer_policy_fingerprint,reservation_micro_usd,server_reservation_micro_usd,captured_at)
 values(new_attempt_id,recipe.organization_id,recipe.work_id,job.id,op.id,recipe.id,invocation,auth.uid(),job.authorization_subject_id,
 case when fallback then prior.id else null end,op.root_attempt_id,fallback,p_attempt->>'requestFingerprint',p_attempt->>'inputFingerprint',p_attempt->>'promptFingerprint',p_attempt,p_route,
 array['inference','prompt_cache','schema_cache'],'case_analysis',model,(decision->>'decisionId')::uuid,(decision->>'allowed')::boolean,policy->>'fingerprint',observed,server_reserve,stamp) returning * into a;
 end if;
 perform private.require_capital_debt_recipe_v1(p_job_id,p_capability_token,recipe.id);
 return private.capital_debt_attempt_dto_v1(a,replayed);
end;$$;

create function private.worker_record_capital_debt_input_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_debt_gateway_attempts;
 recipe private.capital_debt_recipes;op private.capital_debt_operations;claim private.capital_debt_input_dispatches;exposure numeric;sends integer;fresh boolean:=false;
 policy jsonb;eligibility jsonb;deadline timestamptz;
begin
 select * into a from private.capital_debt_gateway_attempts where organization_id=job.organization_id and job_id=job.id and id=p_attempt_receipt_id;
 if a.id is null or not a.allowed then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 recipe:=private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into strict op from private.capital_debt_operations where organization_id=job.organization_id and id=a.operation_id;
 policy:=private.capital_debt_dispatch_policy_v1(a.model,100000);
 if a.renderer_policy_fingerprint<>policy->>'fingerprint' or a.server_reservation_micro_usd<>greatest(a.reservation_micro_usd,(policy->>'serverBoundMicroUsd')::bigint)then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 select * into claim from private.capital_debt_input_dispatches where organization_id=job.organization_id and attempt_id=a.id;
 if claim.id is null then
 if exists(select 1 from private.capital_debt_attempt_outcomes where organization_id=job.organization_id and operation_id=op.id and outcome='accepted')then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 select count(*),coalesce(sum(greatest(d.server_reservation_micro_usd,coalesce(o.cost_micro_usd,d.server_reservation_micro_usd))),0) into sends,exposure
 from private.capital_debt_input_dispatches d left join private.capital_debt_attempt_outcomes o on o.organization_id=d.organization_id and o.input_receipt_id=d.id
 where d.organization_id=job.organization_id and d.operation_id=op.id;
 if sends>=op.max_dispatches or exposure+a.server_reservation_micro_usd>op.max_exposure_micro_usd then raise exception 'capital_debt_budget_denied' using errcode='42501';end if;
 -- Re-evaluate provider TTL at the one actual send grant. Replay does not reset it.
 deadline:=private.capital_debt_recipe_deadline_v1(recipe.organization_id,recipe.id,job.authorization_subject_id);
 eligibility:=private.resolve_capital_body_processing_v1(job,a.route,a.resources,a.purpose,least(deadline,recipe.expires_at));
 if eligibility->>'allowed'is distinct from 'true' then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 insert into private.capital_debt_input_dispatches(organization_id,work_id,job_id,operation_id,attempt_id,invocation_id,worker_account_id,human_subject_id,
 request_fingerprint,reservation_micro_usd,server_reservation_micro_usd,claimed_at)
 values(job.organization_id,a.work_id,job.id,op.id,a.id,a.invocation_id,auth.uid(),job.authorization_subject_id,a.request_fingerprint,a.reservation_micro_usd,a.server_reservation_micro_usd,clock_timestamp())returning * into claim;fresh:=true;
 end if;
 if claim.operation_id<>op.id or claim.invocation_id<>a.invocation_id or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id
 or claim.request_fingerprint<>a.request_fingerprint then raise exception 'capital_debt_processing_conflict' using errcode='23505';end if;
 perform private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('schemaVersion','capital-body-input-dispatch.v3','receiptId',claim.id,'invocationId',a.invocation_id,'requestFingerprint',a.request_fingerprint,
 'operationId',op.id,'attemptReceiptId',a.id,'rootAttemptReceiptId',op.root_attempt_id,'dispatchClaimId',claim.dispatch_claim_id,
 'rendererPolicyFingerprint',a.renderer_policy_fingerprint,'reservationMicroUsd',a.reservation_micro_usd,'serverReservationMicroUsd',claim.server_reservation_micro_usd,
 'dispatchAllowed',fresh,'replayed',not fresh);
end;$$;

create function private.worker_record_capital_debt_attempt_outcome_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid,p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_debt_gateway_attempts;prior private.capital_debt_gateway_attempts;
 recipe private.capital_debt_recipes;op private.capital_debt_operations;claim private.capital_debt_input_dispatches;recorded private.capital_debt_attempt_outcomes;
 common_fp text;replayed boolean:=false;
begin
 common_fp:=private.capital_debt_attempt_outcome_fingerprint_v1(p_outcome);
 if common_fp is distinct from p_outcome->>'outcomeFingerprint'then raise exception 'capital_debt_outcome_invalid' using errcode='22023';end if;
 select * into a from private.capital_debt_gateway_attempts where organization_id=job.organization_id and job_id=job.id and id=p_attempt_receipt_id;
 if a.id is null or not a.allowed then raise exception 'capital_debt_processing_denied' using errcode='42501';end if;
 recipe:=private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into strict op from private.capital_debt_operations where organization_id=job.organization_id and id=a.operation_id;
 select * into claim from private.capital_debt_input_dispatches where organization_id=job.organization_id and attempt_id=a.id;
 select * into prior from private.capital_debt_gateway_attempts where organization_id=job.organization_id and id=a.previous_attempt_id;
 if claim.id is null or claim.operation_id<>op.id or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id
 or(p_outcome->>'invocationId',p_outcome->>'task',p_outcome->>'provider',p_outcome->>'configuredModel',p_outcome->>'schemaName',p_outcome->>'adapterInputVersion',
 p_outcome->>'requestFingerprint',p_outcome->>'inputFingerprint',p_outcome->>'promptFingerprint',p_outcome->>'previousInvocationId',p_outcome->>'retryOrdinal',
 p_outcome->>'isSameModelRepair',p_outcome->>'usedProviderFallback',p_outcome->>'processingDecisionId',p_outcome->>'inputAttestationReceiptId')
 is distinct from(a.invocation_id::text,'company_debt_view'::text,(a.route->>'provider')::text,a.model,'company_debt_diagnostic_v1'::text,'gateway-adapter-input.v1'::text,
 a.request_fingerprint,a.input_fingerprint,a.prompt_fingerprint,prior.invocation_id::text,'0'::text,'false'::text,a.used_provider_fallback::text,a.processing_decision_id::text,claim.id::text)
 or(p_outcome->>'reservationMicroUsd')::bigint<>a.reservation_micro_usd then raise exception 'capital_debt_outcome_denied' using errcode='42501';end if;
 select * into recorded from private.capital_debt_attempt_outcomes where organization_id=job.organization_id and attempt_id=a.id;
 if recorded.id is not null then
 if recorded.observation is distinct from p_outcome or recorded.outcome_fingerprint<>common_fp or recorded.input_receipt_id<>claim.id then raise exception 'capital_debt_outcome_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 insert into private.capital_debt_attempt_outcomes(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id,invocation_id,worker_account_id,human_subject_id,
 observation,outcome,outcome_fingerprint,cost_micro_usd,server_exposure_micro_usd,recorded_at)
 values(job.organization_id,a.work_id,job.id,op.id,a.id,claim.id,a.invocation_id,auth.uid(),job.authorization_subject_id,p_outcome,p_outcome->>'outcome',common_fp,
 (p_outcome->>'costMicroUsd')::bigint,greatest(claim.server_reservation_micro_usd,coalesce((p_outcome->>'costMicroUsd')::bigint,claim.server_reservation_micro_usd)),clock_timestamp())returning * into recorded;
 end if;
 perform private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('schemaVersion','capital-body-attempt-outcome-receipt.v1','receiptId',recorded.id,'operationId',op.id,'attemptReceiptId',a.id,'inputReceiptId',claim.id,
 'rootAttemptReceiptId',op.root_attempt_id,'invocationId',a.invocation_id,'requestFingerprint',a.request_fingerprint,'fingerprintVersion','gateway-attempt-outcome-fingerprint.v1',
 'outcomeFingerprint',recorded.outcome_fingerprint,'outcome',recorded.outcome,'failureCode',recorded.observation->'failureCode','replayed',replayed);
end;$$;
create function private.worker_record_capital_debt_accepted_v1(p_job_id uuid,p_capability_token text,p_input_receipt_id uuid,p_accepted jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);a private.capital_debt_gateway_attempts;
 recipe private.capital_debt_recipes;claim private.capital_debt_input_dispatches;outcome_row private.capital_debt_attempt_outcomes;accepted private.capital_debt_accepted_invocations;
 keys text[]:=array['schemaVersion','invocationId','adapterInputVersion','adapterRequestFingerprint','outputFingerprintVersion','outputFingerprint','inputFingerprint','promptFingerprint',
 'provider','configuredModel','reportedModel','schemaName','retryOrdinal','isSameModelRepair','usedProviderFallback','fromCassette','inputAttestationReceiptId'];
begin
 select * into claim from private.capital_debt_input_dispatches where organization_id=job.organization_id and job_id=job.id and id=p_input_receipt_id;
 if claim.id is null or claim.worker_account_id<>auth.uid() or claim.human_subject_id<>job.authorization_subject_id then raise exception 'capital_debt_accepted_denied' using errcode='42501';end if;
 select * into strict a from private.capital_debt_gateway_attempts where organization_id=job.organization_id and id=claim.attempt_id;
 recipe:=private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);
 select * into outcome_row from private.capital_debt_attempt_outcomes where organization_id=job.organization_id and input_receipt_id=claim.id;
 if outcome_row.id is null or outcome_row.outcome<>'accepted' then raise exception 'capital_debt_accepted_denied' using errcode='42501';end if;
 if jsonb_typeof(p_accepted)is distinct from 'object' or not(p_accepted?&keys) or p_accepted-keys<>'{}'::jsonb or octet_length(p_accepted::text)>4096
 or p_accepted->>'schemaVersion'is distinct from 'gateway-accepted-invocation.v1'
 or p_accepted->>'adapterInputVersion'is distinct from 'gateway-adapter-input.v1' or p_accepted->>'outputFingerprintVersion'is distinct from 'gateway-parsed-output.v1'
 or p_accepted->>'provider'is distinct from a.route->>'provider' or p_accepted->>'configuredModel'is distinct from a.model or p_accepted->>'reportedModel'is distinct from a.model
 or p_accepted->>'schemaName'is distinct from 'company_debt_diagnostic_v1' or p_accepted->>'invocationId'is distinct from a.invocation_id::text
 or p_accepted->>'inputAttestationReceiptId'is distinct from claim.id::text or p_accepted->>'adapterRequestFingerprint'is distinct from a.request_fingerprint
 or p_accepted->>'inputFingerprint'is distinct from a.input_fingerprint or p_accepted->>'promptFingerprint'is distinct from a.prompt_fingerprint
 or p_accepted->>'outputFingerprint'is distinct from outcome_row.observation->>'outputFingerprint'
 or jsonb_typeof(p_accepted->'retryOrdinal')is distinct from 'number' or p_accepted->>'retryOrdinal'is distinct from '0'
 or jsonb_typeof(p_accepted->'isSameModelRepair')is distinct from 'boolean' or p_accepted->>'isSameModelRepair'is distinct from 'false'
 or jsonb_typeof(p_accepted->'fromCassette')is distinct from 'boolean' or p_accepted->>'fromCassette'is distinct from 'false'
 or jsonb_typeof(p_accepted->'usedProviderFallback')is distinct from 'boolean' or p_accepted->>'usedProviderFallback'is distinct from a.used_provider_fallback::text
 then raise exception 'capital_debt_accepted_invalid' using errcode='22023';end if;
 select * into accepted from private.capital_debt_accepted_invocations where organization_id=job.organization_id and recipe_id=recipe.id;
 if accepted.id is not null then
 if accepted.input_receipt_id<>claim.id or accepted.accepted_identity is distinct from p_accepted then raise exception 'capital_debt_accepted_conflict' using errcode='23505';end if;
 else
 insert into private.capital_debt_accepted_invocations(organization_id,work_id,job_id,recipe_id,input_receipt_id,invocation_id,output_fingerprint,accepted_identity)
 values(job.organization_id,a.work_id,job.id,recipe.id,claim.id,a.invocation_id,p_accepted->>'outputFingerprint',p_accepted)returning * into accepted;
 end if;
 perform private.capital_debt_attempt_current_v1(p_job_id,p_capability_token,a);
 return jsonb_build_object('acceptedInvocationId',accepted.id,'inputReceiptId',claim.id,'invocationId',accepted.invocation_id,'outputFingerprint',accepted.output_fingerprint);
end;$$;

-- Both orders forbid the old body-input endpoint from supplying a receipt for a
-- native invocation. The trigger also closes the same-job legacy path after seal.
create function private.guard_capital_debt_legacy_input_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipe private.capital_debt_recipes;
begin
 select * into recipe from private.capital_debt_recipes where organization_id=new.organization_id and job_id=new.job_id;
 if recipe.id is not null then
 if not pg_try_advisory_xact_lock(hashtextextended('capital-debt-recipe:'||recipe.organization_id::text||':'||recipe.id::text,0)) then raise exception 'capital_capture_retry' using errcode='40001';end if;
 if exists(select 1 from private.capital_debt_recipe_seals where organization_id=recipe.organization_id and recipe_id=recipe.id)then raise exception 'capital_debt_legacy_input_denied' using errcode='42501';end if;
 end if;
 if exists(select 1 from private.capital_debt_gateway_attempts where organization_id=new.organization_id and invocation_id=new.invocation_id)then raise exception 'capital_debt_legacy_input_denied' using errcode='42501';end if;
 return new;
end;$$;
create trigger capital_debt_legacy_input_guard before insert on private.capital_body_invocation_inputs for each row execute function private.guard_capital_debt_legacy_input_v1();

create function public.worker_authorize_capital_debt_processing_v1(p_job_id uuid,p_capability_token text,p_recipe_id uuid,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_authorize_capital_debt_processing_v1(p_job_id,p_capability_token,p_recipe_id,p_attempt,p_route,p_resources,p_purpose);$$;
create function public.worker_record_capital_debt_input_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_debt_input_v1(p_job_id,p_capability_token,p_attempt_receipt_id);$$;
create function public.worker_record_capital_debt_attempt_outcome_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid,p_outcome jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_debt_attempt_outcome_v1(p_job_id,p_capability_token,p_attempt_receipt_id,p_outcome);$$;
create function public.worker_record_capital_debt_accepted_v1(p_job_id uuid,p_capability_token text,p_input_receipt_id uuid,p_accepted jsonb)
returns jsonb language sql security invoker set search_path='' as $$select private.worker_record_capital_debt_accepted_v1(p_job_id,p_capability_token,p_input_receipt_id,p_accepted);$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
 and p.proname in ('capital_debt_attempt_outcome_fingerprint_v1','capital_debt_dispatch_policy_v1','lock_capital_debt_operation_v1','capital_debt_attempt_assurances_current_v1',
 'capital_debt_attempt_current_v1','capital_debt_attempt_dto_v1','guard_capital_debt_legacy_input_v1') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public')
 and p.proname in ('worker_authorize_capital_debt_processing_v1','worker_record_capital_debt_input_v1','worker_record_capital_debt_attempt_outcome_v1','worker_record_capital_debt_accepted_v1')loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);execute format('grant execute on function %s to authenticated',f.signature);end loop;
end;$$;
