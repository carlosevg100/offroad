-- 3Q operational body SDK authority. No M07/task/recipe activation. A route denial
-- is a real processing decision, never an input receipt or a fabricated outcome.
set search_path='';

alter table private.processing_eligibility_decisions add constraint processing_eligibility_attempt_binding_key
 unique(organization_id,job_id,id,allowed);

create table private.capital_body_gateway_attempts (
 id uuid primary key,organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,
 worker_account_id uuid not null references auth.users(id),human_subject_id uuid not null references auth.users(id),invocation_id uuid not null,
 adapter_input_version text not null check(adapter_input_version='gateway-adapter-input.v1'),
 task text not null check(task='preliminary_understanding'),schema_name text not null check(schema_name='origination_senior_readout_v2'),
 adapter_request_fingerprint text not null check(adapter_request_fingerprint~'^[a-f0-9]{64}$'),
 attempt_metadata_fingerprint text not null check(attempt_metadata_fingerprint~'^[a-f0-9]{64}$'),
 input_fingerprint text not null check(input_fingerprint~'^[a-f0-9]{64}$'),prompt_fingerprint text not null check(prompt_fingerprint~'^[a-f0-9]{64}$'),
 provider text not null check(provider in ('anthropic','openai')),model text not null check(length(model) between 1 and 160),
 route jsonb not null,resources text[] not null check(resources=array['inference','prompt_cache','schema_cache']),purpose text not null check(purpose='case_analysis'),
 retry_ordinal integer not null check(retry_ordinal=0),is_same_model_repair boolean not null check(not is_same_model_repair),used_provider_fallback boolean not null,
 previous_attempt_id uuid,root_attempt_id uuid not null,processing_decision_id uuid not null,allowed boolean not null,
 resolved_components_fingerprint text not null check(resolved_components_fingerprint~'^[a-f0-9]{64}$'),
 eligibility_fingerprint text not null check(eligibility_fingerprint~'^[a-f0-9]{64}$'),retention_policy_id uuid not null references private.capital_public_retention_policies(id),
 observed_deadline timestamptz not null check(isfinite(observed_deadline)),captured_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,invocation_id),unique(organization_id,work_id,job_id,id),
 unique(organization_id,work_id,job_id,id,invocation_id,allowed),unique(organization_id,root_attempt_id,used_provider_fallback),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,job_id) references public.processing_jobs(organization_id,id),
 foreign key(organization_id,work_id,job_id,previous_attempt_id) references private.capital_body_gateway_attempts(organization_id,work_id,job_id,id),
 foreign key(organization_id,work_id,job_id,root_attempt_id) references private.capital_body_gateway_attempts(organization_id,work_id,job_id,id),
 foreign key(organization_id,job_id,processing_decision_id,allowed) references private.processing_eligibility_decisions(organization_id,job_id,id,allowed),
 check((not used_provider_fallback and previous_attempt_id is null and root_attempt_id=id)
 or(used_provider_fallback and previous_attempt_id is not null and root_attempt_id<>id))
);
create index capital_body_attempt_job_idx on private.capital_body_gateway_attempts(organization_id,job_id);
create index capital_body_attempt_previous_idx on private.capital_body_gateway_attempts(organization_id,work_id,job_id,previous_attempt_id);
create index capital_body_attempt_root_fk_idx on private.capital_body_gateway_attempts(organization_id,work_id,job_id,root_attempt_id);
create index capital_body_attempt_decision_idx on private.capital_body_gateway_attempts(organization_id,job_id,processing_decision_id,allowed);
create index capital_body_attempt_worker_idx on private.capital_body_gateway_attempts(worker_account_id);
create index capital_body_attempt_subject_idx on private.capital_body_gateway_attempts(human_subject_id);
create index capital_body_attempt_policy_idx on private.capital_body_gateway_attempts(retention_policy_id);

create table private.capital_body_gateway_attempt_components (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),work_id uuid not null,job_id uuid not null,attempt_id uuid not null,
 component_no integer not null check(component_no between 1 and 1000),component_kind text not null check(component_kind in ('contribution','retained_payload')),
 origin_id uuid,retained_payload_id uuid,captured_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,attempt_id,component_no),
 foreign key(organization_id,work_id,job_id,attempt_id) references private.capital_body_gateway_attempts(organization_id,work_id,job_id,id),
 foreign key(organization_id,work_id,origin_id) references private.capital_body_origins(organization_id,work_id,id),
 foreign key(organization_id,retained_payload_id) references private.capital_public_retained_payloads(organization_id,id),
 check((component_kind='contribution' and origin_id is not null and retained_payload_id is null)
 or(component_kind='retained_payload' and retained_payload_id is not null and origin_id is null))
);
create index capital_body_attempt_component_fk_idx on private.capital_body_gateway_attempt_components(organization_id,work_id,job_id,attempt_id);
create index capital_body_attempt_component_origin_idx on private.capital_body_gateway_attempt_components(organization_id,work_id,origin_id);
create index capital_body_attempt_component_retained_idx on private.capital_body_gateway_attempt_components(organization_id,retained_payload_id);

alter table private.capital_body_invocation_inputs add column lineage_scheme text not null default 'input-receipt.v1',
 add column processing_attempt_id uuid,add column previous_attempt_id uuid,
 add column processing_attempt_allowed boolean not null default true check(processing_attempt_allowed);
alter table private.capital_body_invocation_inputs add constraint capital_body_input_attempt_binding_fk
 foreign key(organization_id,work_id,job_id,processing_attempt_id,invocation_id,processing_attempt_allowed)
 references private.capital_body_gateway_attempts(organization_id,work_id,job_id,id,invocation_id,allowed),
 add constraint capital_body_input_previous_attempt_fk foreign key(organization_id,work_id,job_id,previous_attempt_id)
 references private.capital_body_gateway_attempts(organization_id,work_id,job_id,id);
create unique index capital_body_input_attempt_unique on private.capital_body_invocation_inputs(organization_id,processing_attempt_id) where processing_attempt_id is not null;
create index capital_body_input_previous_attempt_idx on private.capital_body_invocation_inputs(organization_id,work_id,job_id,previous_attempt_id);
alter table private.capital_body_invocation_inputs drop constraint capital_body_invocation_inputs_check;
alter table private.capital_body_invocation_inputs add constraint capital_body_inputs_lineage_v2_check check(
 (lineage_scheme='input-receipt.v1' and processing_attempt_id is null and previous_attempt_id is null and
 ((retry_ordinal=0 and not is_same_model_repair and not used_provider_fallback and previous_invocation_id is null)
 or(retry_ordinal=1 and is_same_model_repair and not used_provider_fallback and previous_invocation_id is not null)
 or(retry_ordinal=0 and not is_same_model_repair and used_provider_fallback and previous_invocation_id is not null)))
 or(lineage_scheme='processing-attempt.v1' and processing_attempt_id is not null and previous_invocation_id is null and retry_ordinal=0 and not is_same_model_repair
 and((not used_provider_fallback and previous_attempt_id is null)or(used_provider_fallback and previous_attempt_id is not null))));

do $$ declare t text;cmd text;begin
 foreach t in array array['capital_body_gateway_attempts','capital_body_gateway_attempt_components'] loop
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

create function private.guard_capital_body_input_attempt_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare a private.capital_body_gateway_attempts;
begin
 select * into a from private.capital_body_gateway_attempts x where x.organization_id=new.organization_id and x.invocation_id=new.invocation_id;
 if new.lineage_scheme='input-receipt.v1' then
 if a.id is not null then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 elsif a.id is null or not a.allowed or new.processing_attempt_id is distinct from a.id
 or (new.organization_id,new.work_id,new.job_id,new.worker_account_id,new.human_subject_id,new.adapter_input_version,
 new.adapter_request_fingerprint,new.input_fingerprint,new.prompt_fingerprint,new.provider,new.model,new.retry_ordinal,new.is_same_model_repair,new.used_provider_fallback,new.previous_attempt_id)
 is distinct from(a.organization_id,a.work_id,a.job_id,a.worker_account_id,a.human_subject_id,a.adapter_input_version,
 a.adapter_request_fingerprint,a.input_fingerprint,a.prompt_fingerprint,a.provider,a.model,a.retry_ordinal,a.is_same_model_repair,a.used_provider_fallback,a.previous_attempt_id)
 or new.captured_at<a.captured_at then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 return new;
end; $$;
create trigger capital_body_input_attempt_guard before insert on private.capital_body_invocation_inputs
 for each row execute function private.guard_capital_body_input_attempt_v1();

create function private.worker_record_capital_body_input_v2(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 a private.capital_body_gateway_attempts;receipt private.capital_body_invocation_inputs;result_dto jsonb;
begin
 if p_attempt_receipt_id is null then raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
 select * into a from private.capital_body_gateway_attempts x where x.organization_id=job.organization_id and x.job_id=job.id and x.id=p_attempt_receipt_id;
 if a.id is null or not a.allowed then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('capital-body-invocation:'||job.organization_id::text||':'||a.invocation_id::text,0)) then
 raise exception 'capital_body_processing_retry' using errcode='40001';end if;
 perform private.capital_body_attempt_current_v1(job,a);
 select * into receipt from private.capital_body_invocation_inputs i where i.organization_id=job.organization_id and i.invocation_id=a.invocation_id;
 if receipt.id is not null then
 if receipt.lineage_scheme<>'processing-attempt.v1' or receipt.processing_attempt_id<>a.id or receipt.previous_attempt_id is distinct from a.previous_attempt_id then
 raise exception 'capital_body_processing_conflict' using errcode='23505';end if;
 else
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

-- Post-dispatch retention validates sources, not a fresh provider send. The
-- persisted allowed decision is a fact; provider TTL is not restarted here.
create function private.capital_body_attempt_sources_current_v1(p_job public.processing_jobs,p_attempt private.capital_body_gateway_attempts)
returns void language plpgsql security definer set search_path='' as $$
declare proof jsonb;components jsonb;
begin
 if p_attempt.organization_id<>p_job.organization_id or p_attempt.job_id<>p_job.id or not p_attempt.allowed
 or p_attempt.human_subject_id<>p_job.authorization_subject_id then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 components:=private.capital_body_attempt_components_request_v1(p_attempt.organization_id,p_attempt.id);
 proof:=private.capital_body_processing_components_v1(p_job,components,p_attempt.captured_at,p_attempt.retention_policy_id);
 if proof->>'componentsFingerprint'<>p_attempt.resolved_components_fingerprint then raise exception 'capital_body_processing_changed' using errcode='40001';end if;
end; $$;

create function private.capital_body_attempt_components_request_v1(p_org uuid,p_attempt uuid)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_agg(jsonb_build_object('kind',c.component_kind,'id',case when c.component_kind='contribution' then o.contribution_revision_id else c.retained_payload_id end)order by c.component_no)
 from private.capital_body_gateway_attempt_components c left join private.capital_body_origins o on o.organization_id=c.organization_id and o.id=c.origin_id
 where c.organization_id=p_org and c.attempt_id=p_attempt;
$$;

create function private.capital_body_attempt_current_v1(p_job public.processing_jobs,p_attempt private.capital_body_gateway_attempts)
returns void language plpgsql security definer set search_path='' as $$
declare components jsonb;body_proof jsonb;current_decision jsonb;current_fp text;
begin
 if p_attempt.organization_id<>p_job.organization_id or p_attempt.job_id<>p_job.id
 or p_attempt.worker_account_id<>auth.uid() or p_attempt.human_subject_id<>p_job.authorization_subject_id then
 raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 components:=private.capital_body_attempt_components_request_v1(p_attempt.organization_id,p_attempt.id);
 if components is null then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 body_proof:=private.capital_body_processing_components_v1(p_job,components,p_attempt.captured_at,p_attempt.retention_policy_id);
 current_decision:=private.resolve_capital_body_processing_v1(p_job,p_attempt.route,p_attempt.resources,p_attempt.purpose,(body_proof->>'deadline')::timestamptz);
 current_fp:=encode(extensions.digest(jsonb_build_object('body',body_proof->'snapshot','provider',current_decision->'snapshot',
 'policy',(select to_jsonb(p) from private.capital_public_retention_policies p where p.id=p_attempt.retention_policy_id))::text,'sha256'),'hex');
 if body_proof->>'componentsFingerprint'<>p_attempt.resolved_components_fingerprint or current_fp<>p_attempt.eligibility_fingerprint
 or (current_decision->>'allowed')::boolean is distinct from p_attempt.allowed then
 raise exception 'capital_body_processing_changed' using errcode='40001';end if;
end; $$;

create function private.capital_body_attempt_dto_v1(p_attempt private.capital_body_gateway_attempts,p_replayed boolean)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('schemaVersion','capital-body-processing-decision.v1','allowed',p_attempt.allowed,'policyVersion',d.policy_version,
 'assuranceId',case when cardinality(d.assurance_ids)=1 then d.assurance_ids[1] else null end,'assuranceIds',d.assurance_ids,
 'decisionId',d.id,'classification',d.classification,'reasons',d.reasons,'attemptReceiptId',p_attempt.id,'invocationId',p_attempt.invocation_id,
 'requestFingerprint',p_attempt.adapter_request_fingerprint,'eligibilityFingerprint',p_attempt.eligibility_fingerprint,'replayed',p_replayed)
 from private.processing_eligibility_decisions d where d.organization_id=p_attempt.organization_id and d.job_id=p_attempt.job_id
 and d.id=p_attempt.processing_decision_id and d.allowed=p_attempt.allowed;
$$;

create function private.worker_authorize_capital_body_processing_v1(p_job_id uuid,p_capability_token text,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text,p_components jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.processing_jobs:=private.capital_public_capture_job_v1(p_job_id,p_capability_token);
 attempt_row private.capital_body_gateway_attempts;previous_row private.capital_body_gateway_attempts;
 work uuid:=coalesce(job.work_id,(job.payload->>'capital_project_id')::uuid);invocation uuid;previous_invocation uuid;
 policy uuid;body_proof jsonb;decision jsonb;metadata_fp text;eligibility_fp text;stamp timestamptz:=clock_timestamp();
 fallback boolean;new_id uuid:=gen_random_uuid();component jsonb;ordinal integer:=0;result_dto jsonb;
begin
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
 or jsonb_typeof(p_attempt->'reservationUsd') is distinct from 'number' or (p_attempt->>'reservationUsd')::numeric<0 then
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
 select * into attempt_row from private.capital_body_gateway_attempts a where a.organization_id=job.organization_id and a.invocation_id=invocation;
 if found then
 if attempt_row.job_id<>job.id or attempt_row.work_id<>work or attempt_row.attempt_metadata_fingerprint<>metadata_fp or attempt_row.route is distinct from p_route
 or p_resources is null or cardinality(p_resources)<>3 or not(p_resources@>attempt_row.resources) or not(p_resources<@attempt_row.resources)
 or attempt_row.purpose is distinct from p_purpose then raise exception 'capital_body_processing_conflict' using errcode='23505';end if;
 body_proof:=private.capital_body_processing_components_v1(job,p_components,attempt_row.captured_at,attempt_row.retention_policy_id);
 if body_proof->>'componentsFingerprint'<>attempt_row.resolved_components_fingerprint then raise exception 'capital_body_processing_conflict' using errcode='23505';end if;
 perform private.capital_body_attempt_current_v1(job,attempt_row);
 result_dto:=private.capital_body_attempt_dto_v1(attempt_row,true);
 else
 select policy_id into strict policy from private.capital_public_retention_controls where singleton;
 body_proof:=private.capital_body_processing_components_v1(job,p_components,stamp,policy);
 if fallback then
 select * into previous_row from private.capital_body_gateway_attempts a where a.organization_id=job.organization_id and a.job_id=job.id and a.work_id=work and a.invocation_id=previous_invocation;
 if previous_row.id is null or previous_row.allowed or previous_row.used_provider_fallback or previous_row.worker_account_id<>auth.uid()
 or previous_row.human_subject_id<>job.authorization_subject_id or previous_row.captured_at>=stamp
 or previous_row.input_fingerprint<>p_attempt->>'inputFingerprint' or previous_row.prompt_fingerprint<>p_attempt->>'promptFingerprint'
 or previous_row.resolved_components_fingerprint<>body_proof->>'componentsFingerprint'
 or(previous_row.provider,previous_row.model)is not distinct from(p_route->>'provider',p_route->>'model')then
 raise exception 'capital_body_processing_lineage_denied' using errcode='42501';end if;
 end if;
 decision:=private.provider_processing_decision_with_body_limit_v1(job,p_route,p_resources,p_purpose,(body_proof->>'deadline')::timestamptz);
 eligibility_fp:=encode(extensions.digest(jsonb_build_object('body',body_proof->'snapshot','provider',decision->'snapshot',
 'policy',(select to_jsonb(p) from private.capital_public_retention_policies p where p.id=policy))::text,'sha256'),'hex');
 insert into private.capital_body_gateway_attempts(id,organization_id,work_id,job_id,worker_account_id,human_subject_id,invocation_id,
 adapter_input_version,task,schema_name,adapter_request_fingerprint,attempt_metadata_fingerprint,input_fingerprint,prompt_fingerprint,provider,model,route,resources,purpose,
 retry_ordinal,is_same_model_repair,used_provider_fallback,previous_attempt_id,root_attempt_id,processing_decision_id,allowed,
 resolved_components_fingerprint,eligibility_fingerprint,retention_policy_id,observed_deadline,captured_at)
 values(new_id,job.organization_id,work,job.id,auth.uid(),job.authorization_subject_id,invocation,'gateway-adapter-input.v1','preliminary_understanding','origination_senior_readout_v2',
 p_attempt->>'requestFingerprint',metadata_fp,p_attempt->>'inputFingerprint',p_attempt->>'promptFingerprint',p_route->>'provider',p_route->>'model',p_route,array['inference','prompt_cache','schema_cache'],p_purpose,
 0,false,fallback,case when fallback then previous_row.id else null end,case when fallback then previous_row.root_attempt_id else new_id end,
 (decision->>'decisionId')::uuid,(decision->>'allowed')::boolean,body_proof->>'componentsFingerprint',eligibility_fp,policy,(body_proof->>'deadline')::timestamptz,stamp) returning * into attempt_row;
 for component in select value from jsonb_array_elements(body_proof->'components') loop
 ordinal:=ordinal+1;
 insert into private.capital_body_gateway_attempt_components(organization_id,work_id,job_id,attempt_id,component_no,component_kind,origin_id,retained_payload_id,captured_at)
 values(job.organization_id,work,job.id,attempt_row.id,ordinal,component->>'kind',case when component->>'kind'='contribution' then(component->>'id')::uuid end,
 case when component->>'kind'='retained_payload' then(component->>'id')::uuid end,stamp);
 end loop;
 result_dto:=private.capital_body_attempt_dto_v1(attempt_row,false);
 end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return result_dto;
end; $$;

-- A stable snapshot uses immutable versions and absolute deadlines, not seconds
-- remaining or heartbeat/next-check timestamps. All content stays out of this value.
create function private.capital_body_processing_origin_v1(p_org uuid,p_origin uuid,p_subject uuid,p_policy uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare origin_row private.capital_body_origins;bound timestamptz;rights_snapshot jsonb;
begin
 select * into origin_row from private.capital_body_origins where organization_id=p_org and id=p_origin;
 if not found then raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 bound:=private.capital_body_origin_deadline_v1(p_org,p_origin,p_subject,origin_row.captured_at,p_policy);
 if bound is null then raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_array(p.source_version_id,p.rights_version_id,p.source_binding_id,p.pin_kind,current_right.id)
 order by p.source_version_id,p.rights_version_id,p.pin_kind),'[]') into rights_snapshot
 from private.capital_body_source_pins p join lateral(
 select id from private.source_rights_versions r where r.organization_id=p.organization_id and r.source_version_id=p.source_version_id order by revision desc limit 1
 ) current_right on true where p.organization_id=p_org and p.origin_id=p_origin;
 return jsonb_build_object('deadline',bound,'snapshot',jsonb_build_object('originId',p_origin,'fingerprint',origin_row.origin_fingerprint,
 'closure',origin_row.source_closure_fingerprint,'capturedAt',origin_row.captured_at,'policyId',p_policy,'rights',rights_snapshot,'deadline',bound));
end; $$;

-- Breadth-first unique traversal: every physical ancestor and operating queue is
-- checked explicitly. Legal deadline helpers alone add margin and are insufficient.
create function private.capital_body_processing_allocation_v1(p_job public.processing_jobs,p_allocation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare todo uuid[]:=array[p_allocation];depths integer[]:=array[0];current_depth integer;seen uuid[]:='{}';current_id uuid;edge_count integer:=0;
 a private.capital_public_payload_allocations;q private.capital_public_payload_purge_queue;b private.capital_body_bases;
 i private.capital_body_invocation_inputs;c private.capital_body_input_components;parent private.capital_public_payload_allocations;
 bound timestamptz;license_bound timestamptz;deadline timestamptz:='infinity';operating timestamptz:='infinity';margin integer;orig jsonb;snapshots jsonb:='[]';node jsonb;
begin
 while cardinality(todo)>0 loop
 current_id:=todo[1];todo:=todo[2:];current_depth:=depths[1];depths:=depths[2:];
 if current_depth>127 then raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 if current_id=any(seen) then continue;end if;
 if cardinality(seen)>=1000 then raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 seen:=array_append(seen,current_id);
 begin
 select * into a from private.capital_public_payload_allocations where organization_id=p_job.organization_id and id=current_id for share nowait;
 select * into q from private.capital_public_payload_purge_queue where organization_id=p_job.organization_id and allocation_id=current_id for share nowait;
 exception when lock_not_available then raise exception 'capital_body_processing_retry' using errcode='40001';end;
 if a.id is null or q.id is null or a.job_id<>p_job.id or q.status<>'pending' or q.effective_purge_at<=clock_timestamp() or a.purge_at<=clock_timestamp()
 or not exists(select 1 from private.capital_public_retained_payloads r where r.organization_id=a.organization_id and r.allocation_id=a.id
 and private.capital_body_physical_receipt_v1(r.organization_id,r.id)) then raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 select purge_margin_seconds into strict margin from private.capital_public_retention_policies where id=a.policy_id;
 bound:=least(a.expires_at,q.effective_purge_at+make_interval(secs=>margin));
 operating:=least(operating,a.purge_at,q.effective_purge_at);
 node:=jsonb_build_object('allocationId',a.id,'kind',a.content_kind,'policyId',a.policy_id,'expiresAt',a.expires_at,
 'purgeAt',a.purge_at,'effectivePurgeAt',q.effective_purge_at,'payloadFingerprint',a.payload_fingerprint);
 if a.content_kind='public_source' then
 orig:=null;
 license_bound:=private.capital_public_retention_deadline_v1(a.license_id,a.organization_id,a.retained_at,a.policy_id);
 -- PostgreSQL LEAST ignores NULL; an absent license proof must never look unrestricted.
 if license_bound is null then
 raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 bound:=least(bound,license_bound);
 node:=node||jsonb_build_object('licenseId',a.license_id,'rights',(select coalesce(jsonb_agg(jsonb_build_array(pin.source_version_id,pin.rights_version_id,current_right.id)
 order by pin.source_version_id,pin.rights_version_id,pin.pin_role),'[]') from private.capital_public_delivery_license_pins pin
 join lateral(select id from private.source_rights_versions r where r.organization_id=pin.licensing_organization_id and r.source_version_id=pin.source_version_id order by revision desc limit 1) current_right on true
 where pin.organization_id=a.organization_id and pin.license_id=a.license_id));
 else
 select * into b from private.capital_body_bases where organization_id=a.organization_id and id=a.body_basis_id;
 if b.id is null or not private.capital_body_subject_allowed_v1(a.organization_id,b.work_id,p_job.authorization_subject_id)
 or b.work_id<>coalesce(p_job.work_id,(p_job.payload->>'capital_project_id')::uuid) then raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 if b.kind='contribution_input' then
 orig:=private.capital_body_processing_origin_v1(a.organization_id,b.origin_id,p_job.authorization_subject_id,a.policy_id);
 bound:=least(bound,(orig->>'deadline')::timestamptz);node:=node||jsonb_build_object('origin',orig->'snapshot');
 else
 select input_row.* into i from private.capital_body_accepted_invocations ok join private.capital_body_invocation_inputs input_row
 on input_row.organization_id=ok.organization_id and input_row.id=ok.input_receipt_id
 where ok.organization_id=a.organization_id and ok.id=b.accepted_invocation_id and ok.work_id=b.work_id;
 if i.id is null or i.job_id<>p_job.id or not exists(select 1 from private.capital_body_input_components x where x.organization_id=i.organization_id and x.input_receipt_id=i.id) then
 raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 for c in select * from private.capital_body_input_components x where x.organization_id=i.organization_id and x.input_receipt_id=i.id order by component_no loop
 edge_count:=edge_count+1;if edge_count>10000 then raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 if c.component_kind='contribution' then
 orig:=private.capital_body_processing_origin_v1(a.organization_id,c.origin_id,p_job.authorization_subject_id,a.policy_id);
 bound:=least(bound,(orig->>'deadline')::timestamptz);node:=node||jsonb_build_object('origin:'||c.component_no,orig->'snapshot');
 else
 select parent_row.* into parent from private.capital_public_retained_payloads r join private.capital_public_payload_allocations parent_row
 on parent_row.organization_id=r.organization_id and parent_row.id=r.allocation_id where r.organization_id=a.organization_id and r.id=c.retained_payload_id;
 if parent.id is null or parent.created_at>=b.created_at then raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 todo:=array_append(todo,parent.id);depths:=array_append(depths,current_depth+1);
 node:=node||jsonb_build_object('parent:'||c.component_no,parent.id);
 end if;
 end loop;
 end if;
 end if;
 if bound is null or not isfinite(bound) or bound<=clock_timestamp() then raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 deadline:=least(deadline,bound);
 perform private.require_capital_body_retention_ready_v1(a.policy_id,a.organization_id,a.id);
 snapshots:=snapshots||jsonb_build_array(node||jsonb_build_object('deadline',bound));
 end loop;
 return jsonb_build_object('deadline',deadline,'operatingDeadline',operating,'snapshot',snapshots);
end; $$;

create function private.capital_body_processing_components_v1(p_job public.processing_jobs,p_components jsonb,p_captured_at timestamptz,p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare component jsonb;resolved jsonb:='[]';snapshots jsonb:='[]';proof jsonb;origin uuid;parent private.capital_public_payload_allocations;
 deadline timestamptz:='infinity';work uuid:=coalesce(p_job.work_id,(p_job.payload->>'capital_project_id')::uuid);
begin
 if jsonb_typeof(p_components) is distinct from 'array' or jsonb_array_length(p_components) not between 1 and 1000
 or not isfinite(p_captured_at) or p_captured_at>clock_timestamp() then raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
 for component in select value from jsonb_array_elements(p_components) loop
 if jsonb_typeof(component) is distinct from 'object' or component->>'kind' is null or component->>'kind' not in ('contribution','retained_payload')
 or jsonb_typeof(component->'id') is distinct from 'string' or (select count(*) from jsonb_object_keys(component))<>2 then
 raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
 if component->>'kind'='contribution' then
 origin:=private.capital_body_capture_origin_v1(p_job.organization_id,work,(component->>'id')::uuid,p_job.authorization_subject_id);
 proof:=private.capital_body_processing_origin_v1(p_job.organization_id,origin,p_job.authorization_subject_id,p_policy_id);
 resolved:=resolved||jsonb_build_array(jsonb_build_object('kind','contribution','id',origin));
 -- Direct origin admission is gated by local tenant health; unrelated publisher
 -- wakes do not block it. Retained closures use the exact allocation scopes below.
 perform private.require_capital_body_retention_ready_v1(p_policy_id,p_job.organization_id);
 else
 select a.* into parent from private.capital_public_retained_payloads r join private.capital_public_payload_allocations a
 on a.organization_id=r.organization_id and a.id=r.allocation_id where r.organization_id=p_job.organization_id and r.id=(component->>'id')::uuid;
 if parent.id is null or parent.job_id<>p_job.id then raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 proof:=private.capital_body_processing_allocation_v1(p_job,parent.id);
 resolved:=resolved||jsonb_build_array(jsonb_build_object('kind','retained_payload','id',(component->>'id')::uuid));
 end if;
 -- Provider retention may not outlive the usable operating lifetime of any
 -- retained ancestor, even while its legal storage right includes purge margin.
 deadline:=least(deadline,(proof->>'deadline')::timestamptz,(proof->>'operatingDeadline')::timestamptz);
 snapshots:=snapshots||jsonb_build_array(proof->'snapshot');
 end loop;
 if deadline is null or not isfinite(deadline) or deadline<=clock_timestamp() then raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 return jsonb_build_object('components',resolved,'componentsFingerprint',encode(extensions.digest(resolved::text,'sha256'),'hex'),
 'deadline',deadline,'snapshot',snapshots);
end; $$;

-- Computes current authority without inserting a new decision during replay or
-- input admission. A scalar deadline is private/server-derived, never an API grant.
create function private.resolve_capital_body_processing_v1(p_job public.processing_jobs,p_route jsonb,p_resources text[],p_purpose text,p_body_deadline timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[]:='{}';reasons text[]:='{}';resource text;assurance uuid;rights_deadline timestamptz;limit_seconds integer;
 rights_snapshot jsonb;assurance_snapshot jsonb;absolute_deadline timestamptz;
begin
 if p_job.id is null or p_route is null or jsonb_typeof(p_route)<>'object'
 or p_route-array['provider','model','accountRef','projectRef','credentialBinding','endpoint','region']<>'{}'::jsonb
 or not(p_route?&array['provider','model','accountRef','projectRef','credentialBinding','endpoint','region'])
 or exists(select 1 from jsonb_each(p_route) e where jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}') not between 1 and 1024)
 or octet_length(p_route::text)>2000 or p_route->>'provider' not in ('anthropic','openai')
 or p_resources is null or cardinality(p_resources)<>3 or not(p_resources @>array['inference','prompt_cache','schema_cache']::text[])
 or not(p_resources <@array['inference','prompt_cache','schema_cache']::text[]) or p_purpose is distinct from 'case_analysis'
 or p_body_deadline is null or not isfinite(p_body_deadline) or p_body_deadline<=clock_timestamp() then
 raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
 if not private.job_sources_rights_current_v1(p_job.id) then raise exception 'processing_source_rights_denied' using errcode='42501';end if;
 with recursive dependencies(id) as(
 select d.id from public.source_documents d where d.organization_id=p_job.organization_id
 and((p_job.source_document_id is not null and d.id=p_job.source_document_id)or(p_job.source_document_id is null and d.intake_session_id=p_job.intake_session_id))
 union select d.source_version_id from dependencies g join private.resource_dependencies d on d.organization_id=p_job.organization_id and d.derived_version_id=g.id),
 obligations as(
 select r.id,r.expires_at,r.store_until from dependencies g join lateral(select x.* from private.source_rights_versions x
 where x.organization_id=p_job.organization_id and x.source_version_id=g.id order by revision desc limit 1) r on true
 union select r.id,r.expires_at,r.store_until from dependencies g join private.resource_dependencies d on d.organization_id=p_job.organization_id and d.derived_version_id=g.id
 join private.source_rights_versions r on r.organization_id=d.organization_id and r.id=d.source_rights_version_id)
 select min(least(expires_at,store_until)),coalesce(jsonb_agg(jsonb_build_array(id,expires_at,store_until)order by id),'[]') into rights_deadline,rights_snapshot from obligations;
 absolute_deadline:=least(p_body_deadline,rights_deadline);
 if absolute_deadline<=clock_timestamp() then raise exception 'processing_source_rights_denied' using errcode='42501';end if;
 limit_seconds:=greatest(0,least(2592000,floor(extract(epoch from absolute_deadline-clock_timestamp()))));
 if not pg_try_advisory_xact_lock_shared(hashtextextended('provider-processing-assurances',0)) then
 raise exception 'capital_body_processing_retry' using errcode='40001';end if;
 foreach resource in array array['inference','prompt_cache','schema_cache'] loop
 assurance:=private.provider_resource_allowed_v1(p_route,resource,p_purpose,'restricted',limit_seconds);
 if assurance is null then reasons:=array_append(reasons,'processing_resource_ineligible:'||resource);else ids:=array_append(ids,assurance);end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_array(x.id,x.resource,x.fingerprint,x.revoked_at,x.reviewed_at,x.valid_through)order by x.resource,x.id),'[]') into assurance_snapshot
 from private.provider_processing_assurances x where x.provider=p_route->>'provider' and x.account_ref=p_route->>'accountRef'
 and x.project_ref=p_route->>'projectRef' and x.credential_binding=p_route->>'credentialBinding' and x.endpoint=p_route->>'endpoint'
 and x.region=p_route->>'region' and x.resource=any(array['inference','prompt_cache','schema_cache']) and x.document->'models'?(p_route->>'model');
 return jsonb_build_object('allowed',cardinality(reasons)=0,'policyVersion','offroad-provider-retention-v2',
 'assuranceId',case when cardinality(ids)=1 then ids[1] else null end,'assuranceIds',ids,'classification','restricted','reasons',reasons,
 'snapshot',jsonb_build_object('route',p_route,'resources',array['inference','prompt_cache','schema_cache'],'purpose',p_purpose,
 'jobRights',rights_snapshot,'deadline',absolute_deadline,'assurances',assurance_snapshot));
end; $$;

create function private.provider_processing_decision_with_body_limit_v1(p_job public.processing_jobs,p_route jsonb,p_resources text[],p_purpose text,p_body_deadline timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare decision jsonb:=private.resolve_capital_body_processing_v1(p_job,p_route,p_resources,p_purpose,p_body_deadline);decision_id uuid;
begin
 insert into private.processing_eligibility_decisions(organization_id,job_id,route,resources,purpose,classification,allowed,assurance_ids,reasons,policy_version)
 values(p_job.organization_id,p_job.id,p_route,array['inference','prompt_cache','schema_cache'],p_purpose,'restricted',(decision->>'allowed')::boolean,
 array(select value::uuid from jsonb_array_elements_text(decision->'assuranceIds')),array(select value from jsonb_array_elements_text(decision->'reasons')),'offroad-provider-retention-v2') returning id into decision_id;
 return decision||jsonb_build_object('decisionId',decision_id);
end; $$;

do $$ begin
 if (select md5(prosrc) from pg_proc where oid='private.worker_record_capital_body_input_v1(uuid,text,uuid,text,text,text,text,text,jsonb,integer,boolean,boolean,uuid)'::regprocedure) <> 'f4abc3f8613fc35428ab7b9e7281df13' then raise exception 'capital_body_attempt_baseline_changed';end if;
end; $$;
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

do $$ begin
 if (select md5(prosrc) from pg_proc where oid='private.worker_record_capital_body_accepted_v1(uuid,text,uuid,jsonb)'::regprocedure) <> '44041e00403a177718b9ef483526a7b0' then raise exception 'capital_body_attempt_baseline_changed';end if;
end; $$;
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
 select * into accepted from private.capital_body_accepted_invocations where organization_id=job.organization_id and input_receipt_id=input_row.id;
 if found then
 if accepted.output_fingerprint<>p_accepted->>'outputFingerprint' or accepted.invocation_id<>input_row.invocation_id or accepted.accepted_identity is distinct from p_accepted then raise exception 'capital_body_accepted_conflict' using errcode='23505';end if;
 else
 insert into private.capital_body_accepted_invocations(organization_id,work_id,input_receipt_id,invocation_id,output_fingerprint,accepted_identity,from_cassette)
 values(job.organization_id,input_row.work_id,input_row.id,input_row.invocation_id,p_accepted->>'outputFingerprint',p_accepted,false) returning * into accepted;
 end if;
 if not private.capital_public_capture_clock_current_v1(job.id,p_capability_token) then raise exception 'capital_capture_denied' using errcode='42501';end if;
 return jsonb_build_object('acceptedInvocationId',accepted.id,'inputReceiptId',input_row.id,'invocationId',accepted.invocation_id,'outputFingerprint',accepted.output_fingerprint);
end; $$;

-- Full legacy deadline body, with scoped strict-lineage source revalidation.
do $$ begin
 if (select md5(prosrc) from pg_proc where oid='private.capital_body_allocation_deadline_v1(uuid,uuid,uuid,integer)'::regprocedure) <> 'd8d1c5ad1b03e6197f7911320ad503f9' then raise exception 'capital_body_attempt_baseline_changed';end if;
end; $$;
create or replace function private.capital_body_allocation_deadline_v1(p_org uuid,p_allocation uuid,p_subject uuid,p_depth integer default 0)
returns timestamptz language plpgsql volatile security definer set search_path='' as $$
declare allocation private.capital_public_payload_allocations;basis private.capital_body_bases;input_row private.capital_body_invocation_inputs;
 policy private.capital_public_retention_policies;component private.capital_body_input_components;parent private.capital_public_payload_allocations;
 deadline timestamptz;bound timestamptz;queue_deadline timestamptz;strict_attempt private.capital_body_gateway_attempts;original_job public.processing_jobs;
begin
 if p_depth>127 then return null;end if;
 select * into allocation from private.capital_public_payload_allocations where organization_id=p_org and id=p_allocation;
 if not found then return null;end if;
 select * into policy from private.capital_public_retention_policies where id=allocation.policy_id;
 if not found then return null;end if;
 select q.effective_purge_at+make_interval(secs=>policy.purge_margin_seconds) into queue_deadline from private.capital_public_payload_purge_queue q
 where q.organization_id=p_org and q.allocation_id=allocation.id and q.status='pending';
 if not found then return null;end if;
 if allocation.content_kind='public_source' then
 bound:=private.capital_public_retention_deadline_v1(allocation.license_id,p_org,allocation.retained_at,allocation.policy_id);
 if bound is null then return null;end if;
 return least(bound,allocation.expires_at,queue_deadline);
 end if;
 select * into basis from private.capital_body_bases where organization_id=p_org and id=allocation.body_basis_id;
 if not found or not private.capital_body_subject_allowed_v1(p_org,basis.work_id,p_subject) then return null;end if;
 deadline:=least(allocation.expires_at,queue_deadline);
 if basis.kind='contribution_input' then
 bound:=private.capital_body_origin_deadline_v1(p_org,basis.origin_id,p_subject,allocation.retained_at,allocation.policy_id);
 if bound is null then return null;end if;
 return least(deadline,bound);
 end if;
 select i.* into input_row from private.capital_body_accepted_invocations ok
 join private.capital_body_invocation_inputs i on i.organization_id=ok.organization_id and i.id=ok.input_receipt_id
 where ok.organization_id=p_org and ok.work_id=basis.work_id and ok.id=basis.accepted_invocation_id;
 if not found or not exists(select 1 from private.capital_body_input_components where organization_id=p_org and input_receipt_id=input_row.id) then return null;end if;

 -- Strict input inherits every original operating deadline and current right.
 -- Purger receives NULL for dead authority; contention remains retryable, never
 -- mistaken for proof that erasure can be acknowledged.
 if input_row.lineage_scheme='processing-attempt.v1' then
 select * into strict_attempt from private.capital_body_gateway_attempts a where a.organization_id=p_org and a.job_id=input_row.job_id
 and a.id=input_row.processing_attempt_id and a.invocation_id=input_row.invocation_id and a.allowed;
 select * into original_job from public.processing_jobs j where j.organization_id=p_org and j.id=input_row.job_id;
 if strict_attempt.id is null or original_job.id is null or strict_attempt.human_subject_id<>p_subject then return null;end if;
 begin perform private.capital_body_attempt_sources_current_v1(original_job,strict_attempt);
 exception when insufficient_privilege then return null;end;
 end if;
 for component in select * from private.capital_body_input_components where organization_id=p_org and input_receipt_id=input_row.id order by component_no loop
 if component.component_kind='contribution' then
 bound:=private.capital_body_origin_deadline_v1(p_org,component.origin_id,p_subject,input_row.captured_at,allocation.policy_id);
 else
 select a.* into parent from private.capital_public_retained_payloads r join private.capital_public_payload_allocations a
 on a.organization_id=r.organization_id and a.id=r.allocation_id where r.organization_id=p_org and r.id=component.retained_payload_id;
 if not found or not private.capital_body_physical_receipt_v1(p_org,component.retained_payload_id) or parent.created_at>=basis.created_at or not exists(select 1 from private.capital_public_payload_purge_queue
 where organization_id=p_org and allocation_id=parent.id and status='pending') then return null;end if;
 bound:=private.capital_body_allocation_deadline_v1(p_org,parent.id,p_subject,p_depth+1);
 if bound is null then return null;end if;
 bound:=least(bound,parent.expires_at,parent.purge_at+make_interval(secs=>policy.purge_margin_seconds));
 end if;
 if bound is null then return null;end if;
 deadline:=least(deadline,bound);
 end loop;
 if deadline<=clock_timestamp() or not isfinite(deadline) then return null;end if;
 return deadline;
end; $$;

create function public.worker_authorize_capital_body_processing_v1(p_job_id uuid,p_capability_token text,p_attempt jsonb,p_route jsonb,p_resources text[],p_purpose text,p_components jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_authorize_capital_body_processing_v1(p_job_id,p_capability_token,p_attempt,p_route,p_resources,p_purpose,p_components);
$$;
create function public.worker_record_capital_body_input_v2(p_job_id uuid,p_capability_token text,p_attempt_receipt_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select private.worker_record_capital_body_input_v2(p_job_id,p_capability_token,p_attempt_receipt_id);
$$;
-- Data API grants are explicit. Internal composite helpers cannot become RPCs.
revoke all on function
 private.guard_capital_body_input_attempt_v1(),
 private.capital_body_processing_origin_v1(uuid,uuid,uuid,uuid),
 private.capital_body_processing_allocation_v1(public.processing_jobs,uuid),
 private.capital_body_processing_components_v1(public.processing_jobs,jsonb,timestamptz,uuid),
 private.resolve_capital_body_processing_v1(public.processing_jobs,jsonb,text[],text,timestamptz),
 private.provider_processing_decision_with_body_limit_v1(public.processing_jobs,jsonb,text[],text,timestamptz),
 private.capital_body_attempt_components_request_v1(uuid,uuid),
 private.capital_body_attempt_current_v1(public.processing_jobs,private.capital_body_gateway_attempts),
 private.capital_body_attempt_sources_current_v1(public.processing_jobs,private.capital_body_gateway_attempts),
 private.capital_body_attempt_dto_v1(private.capital_body_gateway_attempts,boolean),
 private.worker_authorize_capital_body_processing_v1(uuid,text,jsonb,jsonb,text[],text,jsonb),
 public.worker_authorize_capital_body_processing_v1(uuid,text,jsonb,jsonb,text[],text,jsonb),
 private.worker_record_capital_body_input_v2(uuid,text,uuid),public.worker_record_capital_body_input_v2(uuid,text,uuid)
from public,anon,authenticated,service_role;
grant execute on function private.worker_authorize_capital_body_processing_v1(uuid,text,jsonb,jsonb,text[],text,jsonb),
 public.worker_authorize_capital_body_processing_v1(uuid,text,jsonb,jsonb,text[],text,jsonb),
 private.worker_record_capital_body_input_v2(uuid,text,uuid),public.worker_record_capital_body_input_v2(uuid,text,uuid) to authenticated;
