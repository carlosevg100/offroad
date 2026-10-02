-- 3Q SDK outcomes: no native M07/repair/recovery activation. Core DTO and hash
-- use the single OUTCOME-PROTOCOL.md specification. Bodies stay in governed
-- retention; this ledger contains only bounded identity and observation metadata.
set search_path='';

alter table private.capital_body_gateway_attempts
 add column terminal_outcome_required boolean not null default false,
 add column operation_id uuid,
 add column reservation_micro_usd bigint,
 add column server_reservation_micro_usd bigint,
 add column renderer_policy_fingerprint text,
 add constraint capital_body_attempt_outcome_regime_check check(
 (terminal_outcome_required and operation_id is not null and reservation_micro_usd between 0 and 1000000
 and num_nonnulls(reservation_micro_usd,server_reservation_micro_usd,renderer_policy_fingerprint)=3
 and server_reservation_micro_usd between reservation_micro_usd and 1000000 and renderer_policy_fingerprint~'^[a-f0-9]{64}$')
 or(not terminal_outcome_required and num_nonnulls(operation_id,reservation_micro_usd,server_reservation_micro_usd,renderer_policy_fingerprint)=0)),
 add constraint capital_body_attempt_operation_identity_key unique(organization_id,work_id,job_id,operation_id,id),
 add constraint capital_body_attempt_input_identity_key
 unique(organization_id,work_id,job_id,id,invocation_id,worker_account_id,human_subject_id);

create table private.capital_body_processing_operations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,contribution_origin_id uuid not null,
 renderer_version text not null check(renderer_version='capital-body-contribution-renderer.v1'),
 retained_payload_id uuid not null,physical_sha256 text not null check(physical_sha256~'^[a-f0-9]{64}$'),
 byte_size bigint not null check(byte_size>0),input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),
 prompt_fingerprint text not null check(prompt_fingerprint~'^[a-f0-9]{64}$'),
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 root_attempt_id uuid not null,retention_policy_id uuid not null references private.capital_public_retention_policies(id),
 budget_version text not null check(budget_version='capital-body-sdk-budget.v1'),
 max_dispatches integer not null check(max_dispatches=2),max_exposure_micro_usd bigint not null check(max_exposure_micro_usd=1000000),
 captured_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,work_id,id),unique(organization_id,work_id,job_id,id),
 unique(organization_id,work_id,contribution_origin_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,work_id,contribution_origin_id) references private.capital_body_origins(organization_id,work_id,id),
 foreign key(organization_id,retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 foreign key(organization_id,work_id,job_id,root_attempt_id) references private.capital_body_gateway_attempts(organization_id,work_id,job_id,id)
 deferrable initially deferred
);
create index capital_body_operation_job_idx on private.capital_body_processing_operations(organization_id,job_id);
create index capital_body_operation_retained_idx on private.capital_body_processing_operations(organization_id,retained_payload_id);
create index capital_body_operation_root_idx on private.capital_body_processing_operations(organization_id,work_id,job_id,root_attempt_id);
create index capital_body_operation_worker_idx on private.capital_body_processing_operations(worker_account_id);
create index capital_body_operation_subject_idx on private.capital_body_processing_operations(human_subject_id);
create index capital_body_operation_policy_idx on private.capital_body_processing_operations(retention_policy_id);
alter table private.capital_body_gateway_attempts add constraint capital_body_attempt_operation_fk
 foreign key(organization_id,work_id,job_id,operation_id) references private.capital_body_processing_operations(organization_id,work_id,job_id,id);
create index capital_body_attempt_operation_fk_idx on private.capital_body_gateway_attempts(organization_id,work_id,job_id,operation_id);
create unique index capital_body_operation_primary_unique on private.capital_body_gateway_attempts(organization_id,operation_id)
 where terminal_outcome_required and not used_provider_fallback;

alter table private.capital_body_invocation_inputs add constraint capital_body_input_outcome_identity_key
 unique(organization_id,work_id,job_id,id,processing_attempt_id,invocation_id,worker_account_id,human_subject_id);

create table private.capital_body_operation_dispatches (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,operation_id uuid not null,attempt_id uuid not null,
 input_receipt_id uuid not null,invocation_id uuid not null,
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 request_fingerprint text not null check(request_fingerprint~'^[a-f0-9]{64}$'),
 reservation_micro_usd bigint not null check(reservation_micro_usd between 0 and 1000000),
 server_reservation_micro_usd bigint not null check(server_reservation_micro_usd between reservation_micro_usd and 1000000),
 claimed_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,attempt_id),unique(organization_id,input_receipt_id),unique(organization_id,invocation_id),
 unique(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id,invocation_id,id),
 foreign key(organization_id,work_id,job_id,operation_id,attempt_id)
 references private.capital_body_gateway_attempts(organization_id,work_id,job_id,operation_id,id),
 foreign key(organization_id,work_id,job_id,input_receipt_id,attempt_id,invocation_id,worker_account_id,human_subject_id)
 references private.capital_body_invocation_inputs(organization_id,work_id,job_id,id,processing_attempt_id,invocation_id,worker_account_id,human_subject_id),
 foreign key(organization_id,work_id,job_id,operation_id) references private.capital_body_processing_operations(organization_id,work_id,job_id,id)
);
create index capital_body_dispatch_attempt_idx on private.capital_body_operation_dispatches(organization_id,work_id,job_id,operation_id,attempt_id);
create index capital_body_dispatch_input_idx on private.capital_body_operation_dispatches(organization_id,work_id,job_id,input_receipt_id,attempt_id,invocation_id,worker_account_id,human_subject_id);
create index capital_body_dispatch_worker_idx on private.capital_body_operation_dispatches(worker_account_id);
create index capital_body_dispatch_subject_idx on private.capital_body_operation_dispatches(human_subject_id);

create table private.capital_body_attempt_outcomes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 work_id uuid not null,job_id uuid not null,operation_id uuid not null,attempt_id uuid not null,
 input_receipt_id uuid not null,invocation_id uuid not null,dispatch_claim_id uuid not null,
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),
 outcome text not null check(outcome in ('accepted','invalid_output','provider_error','timeout','refusal')),
 failure_code text,output_fingerprint_version text,output_fingerprint text,reported_model text,
 observation jsonb not null check(jsonb_typeof(observation)='object'),
 fingerprint_version text not null check(fingerprint_version='gateway-attempt-outcome-fingerprint.v1'),
 outcome_fingerprint text not null check(outcome_fingerprint~'^[a-f0-9]{64}$'),
 reservation_micro_usd bigint not null check(reservation_micro_usd between 0 and 1000000),
 cost_micro_usd bigint check(cost_micro_usd between 0 and 9007199254740991),
 exposure_micro_usd bigint not null check(exposure_micro_usd between 0 and 9007199254740991),
 server_reservation_micro_usd bigint not null check(server_reservation_micro_usd between reservation_micro_usd and 1000000),
 server_exposure_micro_usd bigint not null check(server_exposure_micro_usd between 0 and 9007199254740991),
 recorded_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,attempt_id),unique(organization_id,input_receipt_id),unique(organization_id,invocation_id),
 foreign key(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id,invocation_id,dispatch_claim_id)
 references private.capital_body_operation_dispatches(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id,invocation_id,id),
 foreign key(organization_id,work_id,job_id,input_receipt_id,attempt_id,invocation_id,worker_account_id,human_subject_id)
 references private.capital_body_invocation_inputs(organization_id,work_id,job_id,id,processing_attempt_id,invocation_id,worker_account_id,human_subject_id),
 check(exposure_micro_usd=greatest(reservation_micro_usd,coalesce(cost_micro_usd,reservation_micro_usd))),
 check(server_exposure_micro_usd=greatest(server_reservation_micro_usd,coalesce(cost_micro_usd,server_reservation_micro_usd))),
 check((outcome='accepted' and failure_code is null and num_nonnulls(output_fingerprint_version,output_fingerprint,reported_model)=3 and output_fingerprint_version='gateway-parsed-output.v1' and output_fingerprint~'^[a-f0-9]{64}$' and reported_model is not null)
 or(outcome='invalid_output' and failure_code is not null and failure_code in ('schema_invalid','deterministic_invalid','output_truncated') and num_nonnulls(output_fingerprint_version,output_fingerprint,reported_model)=0)
 or(outcome='provider_error' and failure_code is not null and failure_code='provider_failure' and num_nonnulls(output_fingerprint_version,output_fingerprint,reported_model)=0)
 or(outcome='timeout' and failure_code is not null and failure_code='provider_timeout' and num_nonnulls(output_fingerprint_version,output_fingerprint,reported_model)=0)
 or(outcome='refusal' and failure_code is not null and failure_code='provider_refusal' and num_nonnulls(output_fingerprint_version,output_fingerprint,reported_model)=0))
);
create index capital_body_outcome_dispatch_idx on private.capital_body_attempt_outcomes(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id,invocation_id,dispatch_claim_id);
create index capital_body_outcome_input_idx on private.capital_body_attempt_outcomes(organization_id,work_id,job_id,input_receipt_id,attempt_id,invocation_id,worker_account_id,human_subject_id);
create index capital_body_outcome_worker_idx on private.capital_body_attempt_outcomes(worker_account_id);
create index capital_body_outcome_subject_idx on private.capital_body_attempt_outcomes(human_subject_id);

do $$ declare t text;cmd text;begin
 foreach t in array array['capital_body_processing_operations','capital_body_operation_dispatches','capital_body_attempt_outcomes'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('alter table private.%I force row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 foreach cmd in array array['select','insert','update','delete'] loop
 execute format('create policy %I on private.%I as restrictive for %s to anon,authenticated %s',t||'_deny_'||cmd,t,cmd,
 case when cmd='insert' then 'with check(false)' when cmd='update' then 'using(false) with check(false)' else 'using(false)' end);
 end loop;
 execute format('create trigger %I before update on private.%I for each row execute function private.set_updated_at()',t||'_updated_at',t);
 execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_source_version_mutation_v1()',t||'_immutable',t);
 execute format('create trigger %I after insert or update or delete on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end; $$;

-- Scalar-only, fixed-order wire protocol. JSONB object ordering and global ::text
-- are deliberately NOT the gateway hash algorithm. No body/SDK strings accepted.
create function private.capital_body_attempt_outcome_fingerprint_v1(p_outcome jsonb)
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
 or p_outcome->>'task' is distinct from 'preliminary_understanding'
 or p_outcome->>'provider' not in ('anthropic','openai') or p_outcome->>'provider' is null
 or(p_outcome->>'provider'='anthropic' and p_outcome->>'configuredModel' is distinct from 'claude-sonnet-5')
 or(p_outcome->>'provider'='openai' and p_outcome->>'configuredModel' is distinct from 'gpt-5.6-terra')
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
 if number_value<0 or number_value>9007199254740991 or trunc(number_value)<>number_value then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
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

-- Identity-only traversal. Source/right/physical authority is separately evaluated
-- by the existing full component proof. No empty closure or UUID is a license.
create function private.capital_body_operation_origins_v1(p_org uuid,p_resolved_components jsonb)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare origins uuid[]:='{}';seen text[]:='{}';todo jsonb:=p_resolved_components;depths integer[];
 node jsonb;key text;depth integer;child record;edge_count integer:=0;basis private.capital_body_bases;accepted private.capital_body_accepted_invocations;
begin
 if jsonb_typeof(todo) is distinct from 'array' or jsonb_array_length(todo)>1000 then raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
 depths:=array_fill(0,array[jsonb_array_length(todo)]);
 while jsonb_array_length(todo)>0 loop
 node:=todo->0;todo:=todo-0;depth:=depths[1];depths:=depths[2:];key:=(node->>'kind')||':'||(node->>'id');
 if depth>127 then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 if key=any(seen) then continue;end if;
 if cardinality(seen)>=1000 then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 seen:=array_append(seen,key);
 if node->>'kind'='contribution' then origins:=array_append(origins,(node->>'id')::uuid);continue;end if;
 select b.* into basis from private.capital_public_retained_payloads r
 join private.capital_public_payload_allocations a on a.organization_id=r.organization_id and a.id=r.allocation_id
 join private.capital_body_bases b on b.organization_id=a.organization_id and b.id=a.body_basis_id
 where r.organization_id=p_org and r.id=(node->>'id')::uuid;
 if basis.id is null then continue;end if;
 if basis.kind='contribution_input' then
 todo:=todo||jsonb_build_array(jsonb_build_object('kind','contribution','id',basis.origin_id));depths:=array_append(depths,depth+1);edge_count:=edge_count+1;
 else
 select * into accepted from private.capital_body_accepted_invocations x where x.organization_id=p_org and x.id=basis.accepted_invocation_id;
 for child in select c.component_kind,c.origin_id,c.retained_payload_id from private.capital_body_input_components c
 where c.organization_id=p_org and c.input_receipt_id=accepted.input_receipt_id order by c.component_no loop
 todo:=todo||jsonb_build_array(jsonb_build_object('kind',child.component_kind,'id',coalesce(child.origin_id,child.retained_payload_id)));
 depths:=array_append(depths,depth+1);edge_count:=edge_count+1;
 if edge_count>10000 then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 end loop;
 end if;
 if edge_count>10000 then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 end loop;
 return origins;
end; $$;

create function private.lock_capital_body_operation_origins_v1(p_org uuid,p_work uuid,p_origins uuid[])
returns void language plpgsql security definer set search_path='' as $$
declare origin uuid;
begin
 for origin in select distinct x from unnest(p_origins) x order by x loop
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-operation:'||p_org::text||':'||p_work::text||':'||origin::text,0)) then
 raise exception 'capital_body_processing_retry' using errcode='40001';end if;
 end loop;
end; $$;

create function private.guard_capital_body_legacy_origins_v1(p_org uuid,p_work uuid,p_resolved_components jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare origins uuid[]:=private.capital_body_operation_origins_v1(p_org,p_resolved_components);
begin
 perform private.lock_capital_body_operation_origins_v1(p_org,p_work,origins);
 if exists(select 1 from private.capital_body_processing_operations o
 where o.organization_id=p_org and o.work_id=p_work and o.contribution_origin_id=any(origins)) then
 raise exception 'capital_body_processing_denied' using errcode='42501';end if;
end; $$;

-- The SDK renderer admits exactly one retained contribution-input body. Origin,
-- immutable physical identity and job scope are derived from installed rows.
create function private.capital_body_operation_basis_v1(p_job public.processing_jobs,p_components jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare retained private.capital_public_retained_payloads;a private.capital_public_payload_allocations;
 basis private.capital_body_bases;origin private.capital_body_origins;
 work uuid:=coalesce(p_job.work_id,(p_job.payload->>'capital_project_id')::uuid);
begin
 if jsonb_typeof(p_components) is distinct from 'array' or jsonb_array_length(p_components)<>1
 or jsonb_typeof(p_components->0) is distinct from 'object' or (p_components->0)-array['kind','id']<>'{}'::jsonb
 or p_components#>>'{0,kind}' is distinct from 'retained_payload' or jsonb_typeof(p_components#>'{0,id}') is distinct from 'string' then
 raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
 select * into retained from private.capital_public_retained_payloads r where r.organization_id=p_job.organization_id and r.id=(p_components#>>'{0,id}')::uuid;
 select * into a from private.capital_public_payload_allocations x where x.organization_id=p_job.organization_id and x.id=retained.allocation_id;
 select * into basis from private.capital_body_bases b where b.organization_id=p_job.organization_id and b.id=a.body_basis_id;
 select * into origin from private.capital_body_origins o where o.organization_id=p_job.organization_id and o.work_id=work and o.id=basis.origin_id;
 if retained.id is null or a.job_id is distinct from p_job.id or a.content_kind is distinct from 'typed_body'
 or basis.work_id is distinct from work or basis.kind is distinct from 'contribution_input' or origin.id is null
 or not private.capital_body_physical_receipt_v1(p_job.organization_id,retained.id) then
 raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 return jsonb_build_object('originId',origin.id,'retainedPayloadId',retained.id,'physicalSha256',a.payload_fingerprint,'byteSize',a.byte_length);
end; $$;

-- Renderer/route pins were measured from the actual SDK builders on Node24. The
-- bound counts EVERY UTF8 input byte as one token (above the calibrated estimator),
-- all input at the larger cache-write rate, full output1000, framing1024 and 1.1x.
-- The <=100000-byte closed SDK renderer never enters Terra long-context pricing.
create function private.capital_body_dispatch_policy_v1(p_provider text,p_model text,p_byte_length bigint)
returns jsonb language plpgsql immutable security definer set search_path='' as $$
declare system_sha text:='926c94492e1ff85de2b9b0be7803ce5ebb4e0ce358b908b5b665188434143a29';
 schema_sha text;schema_bytes integer;output_rate bigint;threshold integer;input_num integer;output_num integer;output_den integer;
 tuple jsonb;wire text;tokens bigint;reserve bigint;
begin
 if p_byte_length is null or p_byte_length not between 1 and 100000 then raise exception 'capital_body_renderer_denied' using errcode='42501';end if;
 if p_provider='anthropic' and p_model='claude-sonnet-5' then
 schema_sha:='9ff59776a5ad01758912a6ec57f9468d3068b3e23604932761ddf548e2cb640b';schema_bytes:=10656;output_rate:=10000000;
 threshold:=0;input_num:=1;output_num:=1;output_den:=1;
 elsif p_provider='openai' and p_model='gpt-5.6-terra' then
 schema_sha:='2e71ff14ecbc6727c8cd56fbd96009850d368bfddf8e36472d9b67eb2785d29d';schema_bytes:=5630;output_rate:=12000000;
 threshold:=272000;input_num:=2;output_num:=3;output_den:=2;
 else raise exception 'capital_body_renderer_denied' using errcode='42501';end if;
 tuple:=jsonb_build_array('capital-body-dispatch-policy.v1','capital-body-contribution-renderer.v1',p_provider,p_model,
 system_sha,128,schema_sha,schema_bytes,1024,100000,1000,2000000,2500000,output_rate,11,10,threshold,input_num,1,output_num,output_den);
 select '['||string_agg(x.value::text,',' order by x.ordinality)||']' into wire
 from jsonb_array_elements(tuple) with ordinality x(value,ordinality);
 tokens:=p_byte_length+128+schema_bytes+1024;
 if threshold>0 and tokens>threshold then raise exception 'capital_body_renderer_denied' using errcode='42501';end if;
 reserve:=ceil(((tokens::numeric*2500000)+(1000::numeric*output_rate))*11/(10::numeric*1000000))::bigint;
 return jsonb_build_object('fingerprint',encode(extensions.digest(wire,'sha256'),'hex'),'serverBoundMicroUsd',reserve);
end; $$;

-- Post-dispatch proof keeps the admitted retention window fixed. It checks the
-- exact assurance identities and their live authority, without starting a new TTL.
create function private.capital_body_attempt_assurances_current_v1(p_job public.processing_jobs,p_attempt private.capital_body_gateway_attempts)
returns void language plpgsql security definer set search_path='' as $$
declare decision_row private.processing_eligibility_decisions;assurance_row private.provider_processing_assurances;
 assurance_uuid uuid;seen_resources text[]:=array[]::text[];matches integer;
begin
 if p_attempt.organization_id is distinct from p_job.organization_id or p_attempt.job_id is distinct from p_job.id
 or p_attempt.allowed is distinct from true or p_attempt.worker_account_id is distinct from auth.uid()
 or p_attempt.human_subject_id is distinct from p_job.authorization_subject_id then
 raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock_shared(hashtextextended('provider-processing-assurances',0)) then
 raise exception 'capital_body_processing_retry' using errcode='40001';end if;
 select * into decision_row from private.processing_eligibility_decisions d
 where d.organization_id=p_job.organization_id and d.job_id=p_job.id and d.id=p_attempt.processing_decision_id;
 if decision_row.id is null or not decision_row.allowed or decision_row.route is distinct from p_attempt.route
 or decision_row.purpose is distinct from p_attempt.purpose or decision_row.classification is distinct from 'restricted'
 or decision_row.policy_version is distinct from 'offroad-provider-retention-v2'
 or p_attempt.resources is distinct from array['inference','prompt_cache','schema_cache']::text[]
 or decision_row.resources is distinct from p_attempt.resources
 or cardinality(decision_row.assurance_ids)<>3
 or (select count(distinct x) from unnest(decision_row.assurance_ids) x)<>3 then
 raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 for assurance_uuid in select x from unnest(decision_row.assurance_ids) x order by x loop
 begin
 select * into assurance_row from private.provider_processing_assurances a where a.id=assurance_uuid for share nowait;
 exception when lock_not_available then raise exception 'capital_body_processing_retry' using errcode='40001';end;
 if assurance_row.id is null or assurance_row.revoked_at is not null or assurance_row.reviewed_at>clock_timestamp()
 or (assurance_row.valid_through is not null and assurance_row.valid_through<=clock_timestamp())
 or assurance_row.provider is distinct from p_attempt.route->>'provider'
 or assurance_row.account_ref is distinct from p_attempt.route->>'accountRef'
 or assurance_row.project_ref is distinct from p_attempt.route->>'projectRef'
 or assurance_row.credential_binding is distinct from p_attempt.route->>'credentialBinding'
 or assurance_row.endpoint is distinct from p_attempt.route->>'endpoint'
 or assurance_row.region is distinct from p_attempt.route->>'region'
 or (assurance_row.document->'models' ? (p_attempt.route->>'model')) is distinct from true
 or assurance_row.resource not in ('inference','prompt_cache','schema_cache')
 or assurance_row.resource=any(seen_resources)
 or assurance_row.document->>'eligibility' is distinct from 'supported'
 or assurance_row.document->>'trainingUse' is distinct from 'prohibited'
 or (assurance_row.document->'purposes' ? p_attempt.purpose) is distinct from true
 or (assurance_row.document->'classifications' ? 'restricted') is distinct from true
 or (assurance_row.document->'rights' ? 'process') is distinct from true then
 raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 select count(*) into matches from private.provider_processing_assurances a where a.revoked_at is null
 and a.provider=assurance_row.provider and a.account_ref=assurance_row.account_ref and a.project_ref=assurance_row.project_ref
 and a.credential_binding=assurance_row.credential_binding and a.endpoint=assurance_row.endpoint and a.region=assurance_row.region
 and a.resource=assurance_row.resource and a.document->'models' ? (p_attempt.route->>'model');
 if matches<>1 then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 seen_resources:=array_append(seen_resources,assurance_row.resource);
 end loop;
end; $$;

-- A previously authorized child does not retain a dispatch grant after its
-- sent predecessor's pinned assurance loses current authority.
create function private.capital_body_attempt_predecessor_current_v1(p_job public.processing_jobs,p_attempt private.capital_body_gateway_attempts)
returns void language plpgsql security definer set search_path='' as $$
declare predecessor private.capital_body_gateway_attempts;
begin
 if p_attempt.terminal_outcome_required is distinct from true or p_attempt.organization_id is distinct from p_job.organization_id
 or p_attempt.job_id is distinct from p_job.id or p_attempt.worker_account_id is distinct from auth.uid()
 or p_attempt.human_subject_id is distinct from p_job.authorization_subject_id then
 raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 if p_attempt.previous_attempt_id is null then return;end if;
 select * into predecessor from private.capital_body_gateway_attempts a
 where a.organization_id=p_attempt.organization_id and a.id=p_attempt.previous_attempt_id;
 if predecessor.id is null or predecessor.terminal_outcome_required is distinct from true
 or predecessor.operation_id is distinct from p_attempt.operation_id or predecessor.root_attempt_id is distinct from p_attempt.root_attempt_id
 or predecessor.job_id is distinct from p_job.id or predecessor.work_id is distinct from p_attempt.work_id
 or predecessor.worker_account_id is distinct from auth.uid() or predecessor.human_subject_id is distinct from p_job.authorization_subject_id
 or predecessor.task is distinct from p_attempt.task or predecessor.schema_name is distinct from p_attempt.schema_name
 or predecessor.input_fingerprint is distinct from p_attempt.input_fingerprint or predecessor.prompt_fingerprint is distinct from p_attempt.prompt_fingerprint then
 raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 -- SQL-denied primary had no input/send and needs no fabricated assurance pins.
 if predecessor.allowed then perform private.capital_body_attempt_assurances_current_v1(p_job,predecessor);end if;
end; $$;

-- Complete authorizer body retained; the new regime is controlled by private wrappers.
create function private.worker_authorize_capital_body_processing_core_v2(p_job_id uuid,p_capability_token text,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text,p_components jsonb,p_terminal_outcome_required boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 attempt_row private.capital_body_gateway_attempts;previous_row private.capital_body_gateway_attempts;
 work uuid:=coalesce(job.work_id,(job.payload->>'capital_project_id')::uuid);invocation uuid;previous_invocation uuid;
 policy uuid;body_proof jsonb;decision jsonb;metadata_fp text;eligibility_fp text;stamp timestamptz:=clock_timestamp();
 fallback boolean;new_id uuid:=gen_random_uuid();component jsonb;ordinal integer:=0;result_dto jsonb;
 operation_row private.capital_body_processing_operations;basis jsonb;dispatch_policy jsonb;observed_reserve bigint;server_reserve bigint;
 origins uuid[];
begin
 if p_terminal_outcome_required is null then raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
 if jsonb_typeof(p_attempt) is distinct from 'object' or octet_length(p_attempt::text)>4096
 or not(p_attempt?&array['adapterInputVersion','task','schemaName','requestFingerprint','inputFingerprint','promptFingerprint','invocationId','retryOrdinal','isSameModelRepair','usedProviderFallback','reservationUsd'])
 or p_attempt-array['adapterInputVersion','task','schemaName','requestFingerprint','inputFingerprint','promptFingerprint','invocationId','retryOrdinal','isSameModelRepair','usedProviderFallback','reservationUsd','previousInvocationId']<>'{}'::jsonb
 or p_attempt->>'adapterInputVersion' is distinct from 'gateway-adapter-input.v1' or p_attempt->>'task' is distinct from 'preliminary_understanding'
 or p_attempt->>'schemaName' is distinct from 'origination_senior_readout_v2'
 or exists(select 1 from unnest(array['requestFingerprint','inputFingerprint','promptFingerprint']) k where jsonb_typeof(p_attempt->k) is distinct from 'string' or p_attempt->>k !~ '^[a-f0-9]{64}$')
 or jsonb_typeof(p_attempt->'invocationId') is distinct from 'string'
 or jsonb_typeof(p_attempt->'retryOrdinal') is distinct from 'number' or p_attempt->>'retryOrdinal' is distinct from '0'
 or jsonb_typeof(p_attempt->'isSameModelRepair') is distinct from 'boolean' or p_attempt->>'isSameModelRepair' is distinct from 'false'
 or jsonb_typeof(p_attempt->'usedProviderFallback') is distinct from 'boolean'
 or jsonb_typeof(p_attempt->'reservationUsd') is distinct from 'number' or (p_attempt->>'reservationUsd')::numeric<0 or(p_terminal_outcome_required and (p_attempt->>'reservationUsd')::numeric>1) then
 raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
 invocation:=(p_attempt->>'invocationId')::uuid;fallback:=(p_attempt->>'usedProviderFallback')::boolean;
 if(fallback and jsonb_typeof(p_attempt->'previousInvocationId') is distinct from 'string')or(not fallback and p_attempt?'previousInvocationId')then
 raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
 if fallback then previous_invocation:=(p_attempt->>'previousInvocationId')::uuid;end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-invocation:'||job.organization_id::text||':'||invocation::text,0)) then
 raise exception 'capital_body_processing_retry' using errcode='40001';end if;
 if exists(select 1 from private.capital_body_invocation_inputs i where i.organization_id=job.organization_id and i.invocation_id=invocation and i.lineage_scheme='input-receipt.v1') then
 raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 metadata_fp:=encode(extensions.digest(p_attempt::text,'sha256'),'hex');
 if p_terminal_outcome_required then
 basis:=private.capital_body_operation_basis_v1(job,p_components);
 perform private.lock_capital_body_operation_origins_v1(job.organization_id,work,array[(basis->>'originId')::uuid]);
 select * into operation_row from private.capital_body_processing_operations o where o.organization_id=job.organization_id and o.work_id=work and o.contribution_origin_id=(basis->>'originId')::uuid;
 if operation_row.id is not null and(operation_row.job_id<>job.id or operation_row.worker_account_id<>auth.uid() or operation_row.human_subject_id<>job.authorization_subject_id
 or operation_row.retained_payload_id<>(basis->>'retainedPayloadId')::uuid or operation_row.physical_sha256<>basis->>'physicalSha256' or operation_row.byte_size<>(basis->>'byteSize')::bigint
 or operation_row.input_fingerprint<>p_attempt->>'inputFingerprint' or operation_row.prompt_fingerprint<>p_attempt->>'promptFingerprint') then
 raise exception 'capital_body_operation_denied' using errcode='42501';end if;
 observed_reserve:=ceil((p_attempt->>'reservationUsd')::numeric*1000000)::bigint;
 dispatch_policy:=private.capital_body_dispatch_policy_v1(p_route->>'provider',p_route->>'model',(basis->>'byteSize')::bigint);
 server_reserve:=greatest(observed_reserve,(dispatch_policy->>'serverBoundMicroUsd')::bigint);
 end if;
 select * into attempt_row from private.capital_body_gateway_attempts a where a.organization_id=job.organization_id and a.invocation_id=invocation;
 if found then
 if attempt_row.terminal_outcome_required is distinct from p_terminal_outcome_required
 or(p_terminal_outcome_required and(attempt_row.operation_id is distinct from operation_row.id or attempt_row.reservation_micro_usd<>observed_reserve
 or attempt_row.server_reservation_micro_usd<>server_reserve or attempt_row.renderer_policy_fingerprint<>dispatch_policy->>'fingerprint'))
 or attempt_row.job_id<>job.id or attempt_row.work_id<>work or attempt_row.attempt_metadata_fingerprint<>metadata_fp or attempt_row.route is distinct from p_route
 or p_resources is null or cardinality(p_resources)<>3 or not(p_resources@>attempt_row.resources) or not(p_resources<@attempt_row.resources)
 or attempt_row.purpose is distinct from p_purpose then raise exception 'capital_body_processing_conflict' using errcode='23505';end if;
 body_proof:=private.capital_body_processing_components_v1(job,p_components,attempt_row.captured_at,attempt_row.retention_policy_id);
 if body_proof->>'componentsFingerprint'<>attempt_row.resolved_components_fingerprint then raise exception 'capital_body_processing_conflict' using errcode='23505';end if;
 perform private.capital_body_attempt_current_v1(job,attempt_row);
 result_dto:=private.capital_body_attempt_dto_v1(attempt_row,true);
 else
 select policy_id into strict policy from private.capital_public_retention_controls where singleton;
 body_proof:=private.capital_body_processing_components_v1(job,p_components,stamp,policy);
 if not p_terminal_outcome_required then
 perform private.guard_capital_body_legacy_origins_v1(job.organization_id,work,body_proof->'components');
 elsif not fallback then
 if operation_row.id is not null then raise exception 'capital_body_operation_denied' using errcode='42501';end if;
 -- A previous possible-send is not turned into a new budget by a new root UUID.
 if exists(select 1 from private.capital_body_invocation_inputs i where i.organization_id=job.organization_id and i.work_id=work
 and (basis->>'originId')::uuid=any(private.capital_body_operation_origins_v1(job.organization_id,
 (select coalesce(jsonb_agg(jsonb_build_object('kind',c.component_kind,'id',coalesce(c.origin_id,c.retained_payload_id))order by c.component_no),'[]')
 from private.capital_body_input_components c where c.organization_id=i.organization_id and c.input_receipt_id=i.id)))) then
 raise exception 'capital_body_operation_denied' using errcode='42501';end if;
 insert into private.capital_body_processing_operations(organization_id,work_id,job_id,contribution_origin_id,renderer_version,retained_payload_id,
 physical_sha256,byte_size,input_fingerprint,prompt_fingerprint,worker_account_id,human_subject_id,root_attempt_id,retention_policy_id,budget_version,max_dispatches,max_exposure_micro_usd,captured_at)
 values(job.organization_id,work,job.id,(basis->>'originId')::uuid,'capital-body-contribution-renderer.v1',(basis->>'retainedPayloadId')::uuid,
 basis->>'physicalSha256',(basis->>'byteSize')::bigint,p_attempt->>'inputFingerprint',p_attempt->>'promptFingerprint',auth.uid(),job.authorization_subject_id,new_id,policy,
 'capital-body-sdk-budget.v1',2,1000000,stamp) returning * into operation_row;
 elsif operation_row.id is null then raise exception 'capital_body_operation_denied' using errcode='42501';
 end if;
 if fallback then
 select * into previous_row from private.capital_body_gateway_attempts a where a.organization_id=job.organization_id and a.job_id=job.id and a.work_id=work and a.invocation_id=previous_invocation;
 if previous_row.id is null or previous_row.terminal_outcome_required is distinct from p_terminal_outcome_required
 or(previous_row.allowed and(not p_terminal_outcome_required or not exists(select 1 from private.capital_body_attempt_outcomes outcome_row
 where outcome_row.organization_id=previous_row.organization_id and outcome_row.attempt_id=previous_row.id and outcome_row.operation_id=operation_row.id
 and outcome_row.outcome<>'accepted')))
 or(p_terminal_outcome_required and(previous_row.operation_id<>operation_row.id or previous_row.root_attempt_id<>operation_row.root_attempt_id
 or exists(select 1 from private.capital_body_attempt_outcomes outcome_row where outcome_row.organization_id=job.organization_id and outcome_row.operation_id=operation_row.id and outcome_row.outcome='accepted')))
 or previous_row.used_provider_fallback or previous_row.worker_account_id<>auth.uid()
 or previous_row.human_subject_id<>job.authorization_subject_id or previous_row.captured_at>=stamp
 or previous_row.input_fingerprint<>p_attempt->>'inputFingerprint' or previous_row.prompt_fingerprint<>p_attempt->>'promptFingerprint'
 or previous_row.resolved_components_fingerprint<>body_proof->>'componentsFingerprint'
 or(previous_row.provider,previous_row.model)is not distinct from(p_route->>'provider',p_route->>'model')then
 raise exception 'capital_body_processing_lineage_denied' using errcode='42501';end if;
 if p_terminal_outcome_required and previous_row.allowed then
 perform private.capital_body_attempt_assurances_current_v1(job,previous_row);
 end if;
 end if;
 decision:=private.provider_processing_decision_with_body_limit_v1(job,p_route,p_resources,p_purpose,(body_proof->>'deadline')::timestamptz);
 eligibility_fp:=encode(extensions.digest(jsonb_build_object('body',body_proof->'snapshot','provider',decision->'snapshot',
 'policy',(select to_jsonb(p) from private.capital_public_retention_policies p where p.id=policy))::text,'sha256'),'hex');
 insert into private.capital_body_gateway_attempts(id,organization_id,work_id,job_id,worker_account_id,human_subject_id,invocation_id,
 adapter_input_version,task,schema_name,adapter_request_fingerprint,attempt_metadata_fingerprint,input_fingerprint,prompt_fingerprint,provider,model,route,resources,purpose,
 retry_ordinal,is_same_model_repair,used_provider_fallback,previous_attempt_id,root_attempt_id,processing_decision_id,allowed,
 resolved_components_fingerprint,eligibility_fingerprint,retention_policy_id,observed_deadline,captured_at,terminal_outcome_required,operation_id,reservation_micro_usd,server_reservation_micro_usd,renderer_policy_fingerprint)
 values(new_id,job.organization_id,work,job.id,auth.uid(),job.authorization_subject_id,invocation,'gateway-adapter-input.v1','preliminary_understanding','origination_senior_readout_v2',
 p_attempt->>'requestFingerprint',metadata_fp,p_attempt->>'inputFingerprint',p_attempt->>'promptFingerprint',p_route->>'provider',p_route->>'model',p_route,array['inference','prompt_cache','schema_cache'],p_purpose,
 0,false,fallback,case when fallback then previous_row.id else null end,case when fallback then previous_row.root_attempt_id else new_id end,
 (decision->>'decisionId')::uuid,(decision->>'allowed')::boolean,body_proof->>'componentsFingerprint',eligibility_fp,policy,(body_proof->>'deadline')::timestamptz,stamp,p_terminal_outcome_required,
 case when p_terminal_outcome_required then operation_row.id else null end,case when p_terminal_outcome_required then observed_reserve else null end,
 case when p_terminal_outcome_required then server_reserve else null end,case when p_terminal_outcome_required then dispatch_policy->>'fingerprint' else null end) returning * into attempt_row;
 for component in select value from jsonb_array_elements(body_proof->'components') loop
 ordinal:=ordinal+1;
 insert into private.capital_body_gateway_attempt_components(organization_id,work_id,job_id,attempt_id,component_no,component_kind,origin_id,retained_payload_id,captured_at)
 values(job.organization_id,work,job.id,attempt_row.id,ordinal,component->>'kind',case when component->>'kind'='contribution' then(component->>'id')::uuid end,
 case when component->>'kind'='retained_payload' then(component->>'id')::uuid end,stamp);
 end loop;
 result_dto:=private.capital_body_attempt_dto_v1(attempt_row,false);
 end if;
 if p_terminal_outcome_required then
 perform private.capital_body_attempt_predecessor_current_v1(job,attempt_row);
 result_dto:=result_dto||jsonb_build_object('schemaVersion','capital-body-processing-decision.v2','operationId',operation_row.id,'rootAttemptReceiptId',operation_row.root_attempt_id);
 end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;


-- Full legacy input preserves existing receipts and guards creation by real origins.
create or replace function private.worker_record_capital_body_input_v1(p_job_id uuid,p_capability_token text,p_invocation_id uuid,
 p_adapter_request_fingerprint text,p_input_fingerprint text,p_prompt_fingerprint text,p_provider text,p_model text,p_components jsonb,
 p_retry_ordinal integer default 0,p_is_same_model_repair boolean default false,p_used_provider_fallback boolean default false,p_previous_invocation_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 work uuid;receipt private.capital_body_invocation_inputs;component jsonb;ordinal integer:=0;origin uuid;
 previous_components jsonb;resolved_components jsonb:='[]';parent private.capital_public_payload_allocations;stamp timestamptz:=clock_timestamp();
begin
 work:=coalesce(job.work_id,(job.payload->>'capital_project_id')::uuid);
 if p_invocation_id is null or p_adapter_request_fingerprint is null or p_adapter_request_fingerprint!~'^[a-f0-9]{64}$'
 or p_input_fingerprint is null or p_input_fingerprint!~'^[a-f0-9]{64}$' or p_prompt_fingerprint is null or p_prompt_fingerprint!~'^[a-f0-9]{64}$'
 or p_provider is null or p_provider not in ('openai','anthropic','perplexity') or coalesce(length(p_model),0) not between 1 and 160
 or p_retry_ordinal is null or p_retry_ordinal not in (0,1) or p_is_same_model_repair is null or p_used_provider_fallback is null
 or not ((p_retry_ordinal=0 and not p_is_same_model_repair and not p_used_provider_fallback and p_previous_invocation_id is null)
 or (p_retry_ordinal=1 and p_is_same_model_repair and not p_used_provider_fallback and p_previous_invocation_id is not null)
 or (p_retry_ordinal=0 and not p_is_same_model_repair and p_used_provider_fallback and p_previous_invocation_id is not null))
 or jsonb_typeof(p_components) is distinct from 'array' or jsonb_array_length(p_components) not between 1 and 1000 then
 raise exception 'capital_body_input_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-invocation:'||job.organization_id::text||':'||p_invocation_id::text,0)) then
 raise exception 'capital_capture_retry' using errcode='40001';end if;
 if exists(select 1 from private.capital_body_gateway_attempts a where a.organization_id=job.organization_id and a.invocation_id=p_invocation_id) then
 raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 if p_previous_invocation_id is not null and not exists(select 1 from private.capital_body_invocation_inputs prior
 where prior.organization_id=job.organization_id and prior.job_id=job.id and prior.invocation_id=p_previous_invocation_id
 and not prior.used_provider_fallback and ((p_is_same_model_repair and prior.retry_ordinal=0 and prior.provider=p_provider and prior.model=p_model)
 or (p_used_provider_fallback and (prior.provider,prior.model) is distinct from (p_provider,p_model)))) then
 raise exception 'capital_body_input_invalid' using errcode='22023';end if;
 for component in select value from jsonb_array_elements(p_components) loop
 ordinal:=ordinal+1;
 if jsonb_typeof(component) is distinct from 'object' or component->>'kind' is null or component->>'kind' not in ('contribution','retained_payload')
 or not(component?'id') or (select count(*) from jsonb_object_keys(component))<>2 then raise exception 'capital_body_input_invalid' using errcode='22023';end if;
 if component->>'kind'='contribution' then
 origin:=private.capital_body_capture_origin_v1(job.organization_id,work,(component->>'id')::uuid,job.authorization_subject_id);
 resolved_components:=resolved_components||jsonb_build_array(jsonb_build_object('kind','contribution','id',origin));
 else
 select a.* into parent from private.capital_public_retained_payloads r join private.capital_public_payload_allocations a
 on a.organization_id=r.organization_id and a.id=r.allocation_id where r.organization_id=job.organization_id and r.id=(component->>'id')::uuid;
 if not found or parent.job_id<>job.id or not private.capital_body_physical_receipt_v1(job.organization_id,(component->>'id')::uuid) or private.capital_body_allocation_deadline_v1(job.organization_id,parent.id,job.authorization_subject_id) is null
 or not exists(select 1 from private.capital_public_payload_purge_queue where organization_id=job.organization_id and allocation_id=parent.id and status='pending')
 or (parent.content_kind='typed_body' and not exists(select 1 from private.capital_body_bases where organization_id=job.organization_id and id=parent.body_basis_id and work_id=work))
 or (parent.content_kind='public_source' and not exists(select 1 from private.capital_public_delivery_licenses l join private.capital_public_deliveries d on d.organization_id=l.organization_id and d.id=l.delivery_id
 join private.capital_public_input_snapshots s on s.organization_id=d.organization_id and s.id=d.capture_id where l.organization_id=job.organization_id and l.id=parent.license_id and s.work_id=work)) then
 raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 resolved_components:=resolved_components||jsonb_build_array(jsonb_build_object('kind','retained_payload','id',(component->>'id')::uuid));
 end if;
 end loop;
 select * into receipt from private.capital_body_invocation_inputs where organization_id=job.organization_id and invocation_id=p_invocation_id;
 if found then
 select jsonb_agg(jsonb_build_object('kind',component_kind,'id',coalesce(origin_id,retained_payload_id)) order by component_no) into previous_components
 from private.capital_body_input_components where organization_id=job.organization_id and input_receipt_id=receipt.id;
 if receipt.job_id<>job.id or receipt.work_id<>work or receipt.adapter_request_fingerprint<>p_adapter_request_fingerprint
 or receipt.input_fingerprint<>p_input_fingerprint or receipt.prompt_fingerprint<>p_prompt_fingerprint or receipt.provider<>p_provider or receipt.model<>p_model
 or (receipt.retry_ordinal,receipt.is_same_model_repair,receipt.used_provider_fallback,receipt.previous_invocation_id)
 is distinct from (p_retry_ordinal,p_is_same_model_repair,p_used_provider_fallback,p_previous_invocation_id)
 or previous_components is distinct from resolved_components then raise exception 'capital_body_input_conflict' using errcode='23505';end if;
 else
 perform private.guard_capital_body_legacy_origins_v1(job.organization_id,work,resolved_components);
 insert into private.capital_body_invocation_inputs(organization_id,work_id,job_id,invocation_id,adapter_input_version,adapter_request_fingerprint,input_fingerprint,prompt_fingerprint,provider,model,retry_ordinal,is_same_model_repair,used_provider_fallback,previous_invocation_id,worker_account_id,human_subject_id,captured_at)
 values(job.organization_id,work,job.id,p_invocation_id,'gateway-adapter-input.v1',p_adapter_request_fingerprint,p_input_fingerprint,p_prompt_fingerprint,p_provider,p_model,p_retry_ordinal,p_is_same_model_repair,p_used_provider_fallback,p_previous_invocation_id,auth.uid(),job.authorization_subject_id,stamp) returning * into receipt;
 ordinal:=0;
 for component in select value from jsonb_array_elements(resolved_components) loop
 ordinal:=ordinal+1;
 insert into private.capital_body_input_components(organization_id,work_id,input_receipt_id,component_no,component_kind,origin_id,retained_payload_id)
 values(job.organization_id,work,receipt.id,ordinal,component->>'kind',case when component->>'kind'='contribution' then (component->>'id')::uuid end,
 case when component->>'kind'='retained_payload' then (component->>'id')::uuid end);
 end loop;
 end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return jsonb_build_object('receiptId',receipt.id,'invocationId',receipt.invocation_id,'requestFingerprint',receipt.adapter_request_fingerprint);
end; $$;

create or replace function private.worker_record_capital_body_input_v2(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 a private.capital_body_gateway_attempts;receipt private.capital_body_invocation_inputs;result_dto jsonb;
begin
 if p_attempt_receipt_id is null then raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
 select * into a from private.capital_body_gateway_attempts x where x.organization_id=job.organization_id and x.job_id=job.id and x.id=p_attempt_receipt_id;
 if a.id is null or not a.allowed or a.terminal_outcome_required then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-invocation:'||job.organization_id::text||':'||a.invocation_id::text,0)) then
 raise exception 'capital_body_processing_retry' using errcode='40001';end if;
 perform private.capital_body_attempt_current_v1(job,a);
 select * into receipt from private.capital_body_invocation_inputs i where i.organization_id=job.organization_id and i.invocation_id=a.invocation_id;
 if receipt.id is not null then
 if receipt.lineage_scheme<>'processing-attempt.v1' or receipt.processing_attempt_id<>a.id or receipt.previous_attempt_id is distinct from a.previous_attempt_id then
 raise exception 'capital_body_processing_conflict' using errcode='23505';end if;
 else
 perform private.guard_capital_body_legacy_origins_v1(job.organization_id,a.work_id,
 (select jsonb_agg(jsonb_build_object('kind',c.component_kind,'id',coalesce(c.origin_id,c.retained_payload_id))order by c.component_no)
 from private.capital_body_gateway_attempt_components c where c.organization_id=a.organization_id and c.attempt_id=a.id));
 insert into private.capital_body_invocation_inputs(organization_id,work_id,job_id,invocation_id,adapter_input_version,adapter_request_fingerprint,input_fingerprint,prompt_fingerprint,
 provider,model,retry_ordinal,is_same_model_repair,used_provider_fallback,previous_invocation_id,worker_account_id,human_subject_id,captured_at,
 lineage_scheme,processing_attempt_id,previous_attempt_id,processing_attempt_allowed)
 values(a.organization_id,a.work_id,a.job_id,a.invocation_id,a.adapter_input_version,a.adapter_request_fingerprint,a.input_fingerprint,a.prompt_fingerprint,
 a.provider,a.model,a.retry_ordinal,a.is_same_model_repair,a.used_provider_fallback,null,auth.uid(),job.authorization_subject_id,clock_timestamp(),
 'processing-attempt.v1',a.id,a.previous_attempt_id,true) returning * into receipt;
 insert into private.capital_body_input_components(organization_id,work_id,input_receipt_id,component_no,component_kind,origin_id,retained_payload_id)
 select c.organization_id,c.work_id,receipt.id,c.component_no,c.component_kind,c.origin_id,c.retained_payload_id
 from private.capital_body_gateway_attempt_components c where c.organization_id=a.organization_id and c.attempt_id=a.id order by component_no;
 end if;
 result_dto:=jsonb_build_object('receiptId',receipt.id,'invocationId',receipt.invocation_id,'requestFingerprint',receipt.adapter_request_fingerprint);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;


create function private.capital_body_operation_current_v1(p_job public.processing_jobs,p_attempt private.capital_body_gateway_attempts)
returns private.capital_body_processing_operations language plpgsql security definer set search_path='' as $$
declare operation_row private.capital_body_processing_operations;basis jsonb;policy jsonb;
begin
 select * into operation_row from private.capital_body_processing_operations o where o.organization_id=p_job.organization_id and o.id=p_attempt.operation_id;
 if not p_attempt.terminal_outcome_required or operation_row.id is null or operation_row.work_id<>p_attempt.work_id or operation_row.job_id<>p_job.id
 or operation_row.worker_account_id<>auth.uid() or operation_row.human_subject_id<>p_job.authorization_subject_id
 or operation_row.root_attempt_id<>p_attempt.root_attempt_id then raise exception 'capital_body_operation_denied' using errcode='42501';end if;
 perform private.lock_capital_body_operation_origins_v1(p_job.organization_id,operation_row.work_id,array[operation_row.contribution_origin_id]);
 basis:=private.capital_body_operation_basis_v1(p_job,private.capital_body_attempt_components_request_v1(p_attempt.organization_id,p_attempt.id));
 policy:=private.capital_body_dispatch_policy_v1(p_attempt.provider,p_attempt.model,operation_row.byte_size);
 if operation_row.contribution_origin_id<>(basis->>'originId')::uuid or operation_row.retained_payload_id<>(basis->>'retainedPayloadId')::uuid
 or operation_row.physical_sha256<>basis->>'physicalSha256' or operation_row.byte_size<>(basis->>'byteSize')::bigint
 or operation_row.input_fingerprint<>p_attempt.input_fingerprint or operation_row.prompt_fingerprint<>p_attempt.prompt_fingerprint
 or p_attempt.renderer_policy_fingerprint<>policy->>'fingerprint'
 or p_attempt.server_reservation_micro_usd<>greatest(p_attempt.reservation_micro_usd,(policy->>'serverBoundMicroUsd')::bigint) then
 raise exception 'capital_body_processing_changed' using errcode='40001';end if;
 perform private.capital_body_attempt_predecessor_current_v1(p_job,p_attempt);
 return operation_row;
end; $$;

create function private.worker_record_capital_body_input_v3(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 a private.capital_body_gateway_attempts;receipt private.capital_body_invocation_inputs;
 op private.capital_body_processing_operations;claim private.capital_body_operation_dispatches;
 send_count integer;exposure numeric;result_dto jsonb;fresh boolean:=false;
begin
 if p_attempt_receipt_id is null then raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
 select * into a from private.capital_body_gateway_attempts x where x.organization_id=job.organization_id and x.job_id=job.id and x.id=p_attempt_receipt_id;
 if a.id is null or not a.allowed or not a.terminal_outcome_required then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-invocation:'||job.organization_id::text||':'||a.invocation_id::text,0)) then
 raise exception 'capital_body_processing_retry' using errcode='40001';end if;
 op:=private.capital_body_operation_current_v1(job,a);
 perform private.capital_body_attempt_current_v1(job,a);
 select * into receipt from private.capital_body_invocation_inputs i where i.organization_id=a.organization_id and i.invocation_id=a.invocation_id;
 select * into claim from private.capital_body_operation_dispatches d where d.organization_id=a.organization_id and d.attempt_id=a.id;
 if claim.id is not null then
 if receipt.id is null or claim.input_receipt_id<>receipt.id or claim.operation_id<>op.id
 or claim.worker_account_id<>auth.uid() or claim.request_fingerprint<>a.adapter_request_fingerprint then
 raise exception 'capital_body_processing_conflict' using errcode='23505';end if;
 elsif receipt.id is not null then raise exception 'capital_body_processing_denied' using errcode='42501';
 else
 if exists(select 1 from private.capital_body_attempt_outcomes o where o.organization_id=op.organization_id and o.operation_id=op.id and o.outcome='accepted') then
 raise exception 'capital_body_operation_denied' using errcode='42501';end if;
 select count(*),coalesce(sum(greatest(d.server_reservation_micro_usd,coalesce(o.cost_micro_usd,d.server_reservation_micro_usd))),0)
 into send_count,exposure from private.capital_body_operation_dispatches d
 left join private.capital_body_attempt_outcomes o on o.organization_id=d.organization_id and o.dispatch_claim_id=d.id
 where d.organization_id=op.organization_id and d.operation_id=op.id;
 if send_count>=op.max_dispatches or exposure+a.server_reservation_micro_usd>op.max_exposure_micro_usd then
 raise exception 'capital_body_budget_denied' using errcode='42501';end if;
 insert into private.capital_body_invocation_inputs(organization_id,work_id,job_id,invocation_id,adapter_input_version,adapter_request_fingerprint,input_fingerprint,prompt_fingerprint,
 provider,model,retry_ordinal,is_same_model_repair,used_provider_fallback,previous_invocation_id,worker_account_id,human_subject_id,captured_at,
 lineage_scheme,processing_attempt_id,previous_attempt_id,processing_attempt_allowed)
 values(a.organization_id,a.work_id,a.job_id,a.invocation_id,a.adapter_input_version,a.adapter_request_fingerprint,a.input_fingerprint,a.prompt_fingerprint,
 a.provider,a.model,a.retry_ordinal,a.is_same_model_repair,a.used_provider_fallback,null,auth.uid(),job.authorization_subject_id,clock_timestamp(),
 'processing-attempt.v1',a.id,a.previous_attempt_id,true) returning * into receipt;
 insert into private.capital_body_input_components(organization_id,work_id,input_receipt_id,component_no,component_kind,origin_id,retained_payload_id)
 select c.organization_id,c.work_id,receipt.id,c.component_no,c.component_kind,c.origin_id,c.retained_payload_id
 from private.capital_body_gateway_attempt_components c where c.organization_id=a.organization_id and c.attempt_id=a.id order by component_no;
 insert into private.capital_body_operation_dispatches(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id,invocation_id,worker_account_id,human_subject_id,
 request_fingerprint,reservation_micro_usd,server_reservation_micro_usd,claimed_at)
 values(a.organization_id,a.work_id,a.job_id,op.id,a.id,receipt.id,a.invocation_id,auth.uid(),job.authorization_subject_id,a.adapter_request_fingerprint,
 a.reservation_micro_usd,a.server_reservation_micro_usd,clock_timestamp()) returning * into claim;
 fresh:=true;
 end if;
 result_dto:=jsonb_build_object('schemaVersion','capital-body-input-dispatch.v3','receiptId',receipt.id,'invocationId',a.invocation_id,
 'requestFingerprint',a.adapter_request_fingerprint,'operationId',op.id,'attemptReceiptId',a.id,'rootAttemptReceiptId',op.root_attempt_id,'dispatchClaimId',claim.id,
 'reservationMicroUsd',a.reservation_micro_usd,'serverReservationMicroUsd',claim.server_reservation_micro_usd,
 'rendererPolicyFingerprint',a.renderer_policy_fingerprint,'dispatchAllowed',fresh,'replayed',not fresh);
 perform private.capital_body_attempt_predecessor_current_v1(job,a);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

create function private.capital_body_attempt_outcome_dto_v1(p_outcome private.capital_body_attempt_outcomes,p_root uuid,p_replayed boolean)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-body-attempt-outcome-receipt.v1','receiptId',p_outcome.id,'operationId',p_outcome.operation_id,
 'attemptReceiptId',p_outcome.attempt_id,'inputReceiptId',p_outcome.input_receipt_id,'rootAttemptReceiptId',p_root,'invocationId',p_outcome.invocation_id,
 'requestFingerprint',p_outcome.observation->>'requestFingerprint','fingerprintVersion',p_outcome.fingerprint_version,'outcomeFingerprint',p_outcome.outcome_fingerprint,
 'outcome',p_outcome.outcome,'failureCode',p_outcome.failure_code,'replayed',p_replayed);
$$;

create function private.worker_record_capital_body_attempt_outcome_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid,p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 a private.capital_body_gateway_attempts;receipt private.capital_body_invocation_inputs;
 op private.capital_body_processing_operations;claim private.capital_body_operation_dispatches;outcome_row private.capital_body_attempt_outcomes;
 previous_invocation uuid;common_fp text;result_dto jsonb;replayed boolean:=false;
begin
 if p_attempt_receipt_id is null then raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
 common_fp:=private.capital_body_attempt_outcome_fingerprint_v1(p_outcome);
 if common_fp<>p_outcome->>'outcomeFingerprint' then raise exception 'capital_body_outcome_invalid' using errcode='22023';end if;
 select * into a from private.capital_body_gateway_attempts x where x.organization_id=job.organization_id and x.job_id=job.id and x.id=p_attempt_receipt_id;
 if a.id is null or not a.allowed or not a.terminal_outcome_required then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-invocation:'||job.organization_id::text||':'||a.invocation_id::text,0)) then
 raise exception 'capital_body_processing_retry' using errcode='40001';end if;
 op:=private.capital_body_operation_current_v1(job,a);
 -- Observation follows a dispatch already admitted. Do not restart provider TTL.
 -- Current source/operating authority is still mandatory; no privileged factual bypass.
 perform private.capital_body_attempt_sources_current_v1(job,a);
 perform private.capital_body_attempt_assurances_current_v1(job,a);
 select * into receipt from private.capital_body_invocation_inputs i where i.organization_id=a.organization_id and i.processing_attempt_id=a.id and i.job_id=job.id;
 select * into claim from private.capital_body_operation_dispatches d where d.organization_id=a.organization_id and d.attempt_id=a.id and d.operation_id=op.id;
 if receipt.id is null or claim.id is null or claim.input_receipt_id<>receipt.id or claim.invocation_id<>a.invocation_id or claim.worker_account_id<>auth.uid()
 or receipt.worker_account_id<>auth.uid() or receipt.human_subject_id<>job.authorization_subject_id then
 raise exception 'capital_body_outcome_denied' using errcode='42501';end if;
 select x.invocation_id into previous_invocation from private.capital_body_gateway_attempts x where x.organization_id=a.organization_id and x.id=a.previous_attempt_id;
 if (p_outcome->>'invocationId',p_outcome->>'task',p_outcome->>'provider',p_outcome->>'configuredModel',p_outcome->>'schemaName',p_outcome->>'adapterInputVersion',
 p_outcome->>'requestFingerprint',p_outcome->>'inputFingerprint',p_outcome->>'promptFingerprint',p_outcome->>'previousInvocationId',
 p_outcome->>'retryOrdinal',p_outcome->>'isSameModelRepair',p_outcome->>'usedProviderFallback',p_outcome->>'processingDecisionId',p_outcome->>'inputAttestationReceiptId')
 is distinct from(a.invocation_id::text,a.task,a.provider,a.model,a.schema_name,a.adapter_input_version,a.adapter_request_fingerprint,a.input_fingerprint,a.prompt_fingerprint,
 previous_invocation::text,a.retry_ordinal::text,a.is_same_model_repair::text,a.used_provider_fallback::text,a.processing_decision_id::text,receipt.id::text)
 or(p_outcome->>'reservationMicroUsd')::bigint<>a.reservation_micro_usd then
 raise exception 'capital_body_outcome_denied' using errcode='42501';end if;
 select * into outcome_row from private.capital_body_attempt_outcomes o where o.organization_id=a.organization_id and o.attempt_id=a.id;
 if outcome_row.id is not null then
 if outcome_row.observation is distinct from p_outcome or outcome_row.outcome_fingerprint<>common_fp or outcome_row.dispatch_claim_id<>claim.id then
 raise exception 'capital_body_outcome_conflict' using errcode='23505';end if;
 replayed:=true;
 else
 if exists(select 1 from private.capital_body_accepted_invocations x where x.organization_id=a.organization_id and x.input_receipt_id=receipt.id
 and(p_outcome->>'outcome'<>'accepted' or x.output_fingerprint<>p_outcome->>'outputFingerprint')) then
 raise exception 'capital_body_outcome_conflict' using errcode='23505';end if;
 insert into private.capital_body_attempt_outcomes(organization_id,work_id,job_id,operation_id,attempt_id,input_receipt_id,invocation_id,dispatch_claim_id,worker_account_id,human_subject_id,
 outcome,failure_code,output_fingerprint_version,output_fingerprint,reported_model,observation,fingerprint_version,outcome_fingerprint,
 reservation_micro_usd,cost_micro_usd,exposure_micro_usd,server_reservation_micro_usd,server_exposure_micro_usd,recorded_at)
 values(a.organization_id,a.work_id,a.job_id,op.id,a.id,receipt.id,a.invocation_id,claim.id,auth.uid(),job.authorization_subject_id,
 p_outcome->>'outcome',p_outcome->>'failureCode',p_outcome->>'outputFingerprintVersion',p_outcome->>'outputFingerprint',p_outcome->>'reportedModel',p_outcome,
 p_outcome->>'fingerprintVersion',common_fp,a.reservation_micro_usd,(p_outcome->>'costMicroUsd')::bigint,(p_outcome->>'exposureMicroUsd')::bigint,
 claim.server_reservation_micro_usd,greatest(claim.server_reservation_micro_usd,coalesce((p_outcome->>'costMicroUsd')::bigint,claim.server_reservation_micro_usd)),clock_timestamp()) returning * into outcome_row;
 end if;
 result_dto:=private.capital_body_attempt_outcome_dto_v1(outcome_row,op.root_attempt_id,replayed);
 perform private.capital_body_attempt_assurances_current_v1(job,a);
 perform private.capital_body_attempt_predecessor_current_v1(job,a);
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

-- Full accepted body preserves legitimate historical receipts, with prospective outcome binding.
create or replace function private.worker_record_capital_body_accepted_v1(p_job_id uuid,p_capability_token text,p_input_receipt_id uuid,p_accepted jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 input_row private.capital_body_invocation_inputs;accepted private.capital_body_accepted_invocations;attempt_row private.capital_body_gateway_attempts;
begin
 select * into input_row from private.capital_body_invocation_inputs where organization_id=job.organization_id and id=p_input_receipt_id and job_id=job.id;
 if not found or input_row.worker_account_id<>auth.uid() then raise exception 'capital_body_accepted_denied' using errcode='42501';end if;
 if input_row.lineage_scheme='processing-attempt.v1' then
 select * into attempt_row from private.capital_body_gateway_attempts a where a.organization_id=job.organization_id and a.id=input_row.processing_attempt_id and a.invocation_id=input_row.invocation_id and a.job_id=job.id and a.allowed;
 if attempt_row.id is null then raise exception 'capital_body_accepted_denied' using errcode='42501';end if;
 perform private.capital_body_attempt_sources_current_v1(job,attempt_row);
 end if;
 if jsonb_typeof(p_accepted) is distinct from 'object' or p_accepted->>'schemaVersion' is distinct from 'gateway-accepted-invocation.v1'
 or p_accepted->>'adapterInputVersion' is distinct from input_row.adapter_input_version
 or p_accepted->>'invocationId' is distinct from input_row.invocation_id::text
 or p_accepted->>'inputAttestationReceiptId' is distinct from input_row.id::text
 or p_accepted->>'adapterRequestFingerprint' is distinct from input_row.adapter_request_fingerprint
 or jsonb_typeof(p_accepted->'fromCassette') is distinct from 'boolean' or p_accepted->>'fromCassette' is distinct from 'false'
 or exists(select 1 from unnest(array['schemaVersion','invocationId','adapterInputVersion','adapterRequestFingerprint','outputFingerprintVersion','outputFingerprint','inputFingerprint','promptFingerprint','provider','configuredModel','reportedModel','schemaName','inputAttestationReceiptId']) key where jsonb_typeof(p_accepted->key) is distinct from 'string')
 or p_accepted->>'outputFingerprintVersion' is distinct from 'gateway-parsed-output.v1'
 or p_accepted->>'inputFingerprint' is distinct from input_row.input_fingerprint
 or p_accepted->>'promptFingerprint' is distinct from input_row.prompt_fingerprint
 or p_accepted->>'provider' is distinct from input_row.provider
 or p_accepted->>'configuredModel' is distinct from input_row.model
 or jsonb_typeof(p_accepted->'reportedModel') is distinct from 'string' or coalesce(length(p_accepted->>'reportedModel'),0) not between 1 and 160
 or p_accepted->>'schemaName' is distinct from 'origination_senior_readout_v2'
 or jsonb_typeof(p_accepted->'retryOrdinal') is distinct from 'number' or p_accepted->>'retryOrdinal' is distinct from input_row.retry_ordinal::text
 or p_accepted->>'isSameModelRepair' is distinct from input_row.is_same_model_repair::text
 or p_accepted->>'usedProviderFallback' is distinct from input_row.used_provider_fallback::text
 or jsonb_typeof(p_accepted->'isSameModelRepair') is distinct from 'boolean' or jsonb_typeof(p_accepted->'usedProviderFallback') is distinct from 'boolean'
 or exists(select 1 from jsonb_object_keys(p_accepted) key where key not in ('schemaVersion','invocationId','adapterInputVersion','adapterRequestFingerprint','outputFingerprintVersion','outputFingerprint','inputFingerprint','promptFingerprint','provider','configuredModel','reportedModel','schemaName','retryOrdinal','isSameModelRepair','usedProviderFallback','fromCassette','inputAttestationReceiptId'))
 or p_accepted->>'outputFingerprint' is null or (p_accepted->>'outputFingerprint')!~'^[a-f0-9]{64}$'
 then raise exception 'capital_body_accepted_invalid' using errcode='22023';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-invocation:'||job.organization_id::text||':'||input_row.invocation_id::text,0)) then
 raise exception 'capital_capture_retry' using errcode='40001';end if;
 if attempt_row.terminal_outcome_required then
 perform private.capital_body_operation_current_v1(job,attempt_row);
 perform private.capital_body_attempt_assurances_current_v1(job,attempt_row);
 if not exists(select 1 from private.capital_body_attempt_outcomes outcome_row where outcome_row.organization_id=job.organization_id
 and outcome_row.attempt_id=attempt_row.id and outcome_row.input_receipt_id=input_row.id and outcome_row.invocation_id=input_row.invocation_id
 and outcome_row.operation_id=attempt_row.operation_id and outcome_row.outcome='accepted'
 and outcome_row.output_fingerprint=p_accepted->>'outputFingerprint' and outcome_row.output_fingerprint_version=p_accepted->>'outputFingerprintVersion'
 and outcome_row.reported_model=p_accepted->>'reportedModel') then raise exception 'capital_body_accepted_denied' using errcode='42501';end if;
 end if;
 select * into accepted from private.capital_body_accepted_invocations where organization_id=job.organization_id and input_receipt_id=input_row.id;
 if found then
 if accepted.output_fingerprint<>p_accepted->>'outputFingerprint' or accepted.invocation_id<>input_row.invocation_id or accepted.accepted_identity is distinct from p_accepted then raise exception 'capital_body_accepted_conflict' using errcode='23505';end if;
 else
 insert into private.capital_body_accepted_invocations(organization_id,work_id,input_receipt_id,invocation_id,output_fingerprint,accepted_identity,from_cassette)
 values(job.organization_id,input_row.work_id,input_row.id,input_row.invocation_id,p_accepted->>'outputFingerprint',p_accepted,false) returning * into accepted;
 end if;
 if attempt_row.terminal_outcome_required then
 perform private.capital_body_attempt_assurances_current_v1(job,attempt_row);
 perform private.capital_body_attempt_predecessor_current_v1(job,attempt_row);
 end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return jsonb_build_object('acceptedInvocationId',accepted.id,'inputReceiptId',input_row.id,'invocationId',accepted.invocation_id,'outputFingerprint',accepted.output_fingerprint);
end; $$;


create or replace function private.worker_authorize_capital_body_processing_v1(p_job_id uuid,p_capability_token text,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text,p_components jsonb)
returns jsonb language sql security definer set search_path='' as $$
 select private.worker_authorize_capital_body_processing_core_v2(p_job_id,p_capability_token,p_attempt,p_route,p_resources,p_purpose,p_components,false);
$$;
create function private.worker_authorize_capital_body_processing_v2(p_job_id uuid,p_capability_token text,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text,p_components jsonb)
returns jsonb language sql security definer set search_path='' as $$
 select private.worker_authorize_capital_body_processing_core_v2(p_job_id,p_capability_token,p_attempt,p_route,p_resources,p_purpose,p_components,true);
$$;
create function public.worker_authorize_capital_body_processing_v2(p_job_id uuid,p_capability_token text,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text,p_components jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_authorize_capital_body_processing_v2(p_job_id,p_capability_token,p_attempt,p_route,p_resources,p_purpose,p_components);
$$;
create function public.worker_record_capital_body_input_v3(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_record_capital_body_input_v3(p_job_id,p_capability_token,p_attempt_receipt_id);
$$;
create function public.worker_record_capital_body_attempt_outcome_v1(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid,p_outcome jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_record_capital_body_attempt_outcome_v1(p_job_id,p_capability_token,p_attempt_receipt_id,p_outcome);
$$;

-- Explicit table and function grants are independent of FORCE RLS. Internal
-- mode/proof/fingerprint helpers are never callable by Data API clients.
do $$ declare signature regprocedure;begin
 for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('capital_body_attempt_outcome_fingerprint_v1','capital_body_operation_origins_v1',
 'lock_capital_body_operation_origins_v1','guard_capital_body_legacy_origins_v1','capital_body_operation_basis_v1','capital_body_dispatch_policy_v1',
 'worker_authorize_capital_body_processing_core_v2','capital_body_operation_current_v1','capital_body_attempt_outcome_dto_v1','capital_body_attempt_assurances_current_v1','capital_body_attempt_predecessor_current_v1',
 'worker_authorize_capital_body_processing_v2','worker_record_capital_body_input_v3','worker_record_capital_body_attempt_outcome_v1') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',signature);
 end loop;
end; $$;
revoke all on function public.worker_authorize_capital_body_processing_v2(uuid,text,jsonb,jsonb,text[],text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.worker_record_capital_body_input_v3(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.worker_record_capital_body_attempt_outcome_v1(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.worker_authorize_capital_body_processing_v2(uuid,text,jsonb,jsonb,text[],text,jsonb),
 private.worker_record_capital_body_input_v3(uuid,text,uuid),private.worker_record_capital_body_attempt_outcome_v1(uuid,text,uuid,jsonb),
 public.worker_authorize_capital_body_processing_v2(uuid,text,jsonb,jsonb,text[],text,jsonb),public.worker_record_capital_body_input_v3(uuid,text,uuid),
 public.worker_record_capital_body_attempt_outcome_v1(uuid,text,uuid,jsonb) to authenticated;
