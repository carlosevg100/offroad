-- Forward correction: a purge wake cannot block the proof needed to drain itself.
-- Only internal retention calculation skips admission health. Tenant, source,
-- rights, physical receipt, ancestor operating lifetime and NOWAIT guards remain.
-- New dispatch/acceptance/read commands continue to require ordinary health.
set search_path='';
create function private.capital_body_processing_allocation_proof_v1(p_job public.processing_jobs,p_allocation uuid,p_require_health boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare todo uuid[]:=array[p_allocation];depths integer[]:=array[0];current_depth integer;seen uuid[]:='{}';current_id uuid;edge_count integer:=0;
 a private.capital_public_payload_allocations;q private.capital_public_payload_purge_queue;b private.capital_body_bases;
 i private.capital_body_invocation_inputs;c private.capital_body_input_components;parent private.capital_public_payload_allocations;
 bound timestamptz;license_bound timestamptz;deadline timestamptz:='infinity';operating timestamptz:='infinity';margin integer;orig jsonb;snapshots jsonb:='[]';node jsonb;
begin
 if p_require_health is null then raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
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
 if p_require_health then perform private.require_capital_body_retention_ready_v1(a.policy_id,a.organization_id,a.id);end if;
 snapshots:=snapshots||jsonb_build_array(node||jsonb_build_object('deadline',bound));
 end loop;
 return jsonb_build_object('deadline',deadline,'operatingDeadline',operating,'snapshot',snapshots);
end; $$;

create function private.capital_body_processing_components_proof_v1(p_job public.processing_jobs,p_components jsonb,p_captured_at timestamptz,p_policy_id uuid,p_require_health boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare component jsonb;resolved jsonb:='[]';snapshots jsonb:='[]';proof jsonb;origin uuid;parent private.capital_public_payload_allocations;
 deadline timestamptz:='infinity';work uuid:=coalesce(p_job.work_id,(p_job.payload->>'capital_project_id')::uuid);
begin
 if p_require_health is null then raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
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
 if p_require_health then perform private.require_capital_body_retention_ready_v1(p_policy_id,p_job.organization_id);end if;
 else
 select a.* into parent from private.capital_public_retained_payloads r join private.capital_public_payload_allocations a
 on a.organization_id=r.organization_id and a.id=r.allocation_id where r.organization_id=p_job.organization_id and r.id=(component->>'id')::uuid;
 if parent.id is null or parent.job_id<>p_job.id then raise exception 'capital_body_parent_denied' using errcode='42501';end if;
 proof:=private.capital_body_processing_allocation_proof_v1(p_job,parent.id,p_require_health);
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

create function private.capital_body_attempt_sources_proof_v1(p_job public.processing_jobs,p_attempt private.capital_body_gateway_attempts,p_require_health boolean)
returns void language plpgsql security definer set search_path='' as $$
declare proof jsonb;components jsonb;
begin
 if p_require_health is null then raise exception 'capital_body_processing_invalid' using errcode='22023';end if;
 if p_attempt.organization_id<>p_job.organization_id or p_attempt.job_id<>p_job.id or not p_attempt.allowed
 or p_attempt.human_subject_id<>p_job.authorization_subject_id then raise exception 'capital_body_processing_denied' using errcode='42501';end if;
 components:=private.capital_body_attempt_components_request_v1(p_attempt.organization_id,p_attempt.id);
 proof:=private.capital_body_processing_components_proof_v1(p_job,components,p_attempt.captured_at,p_attempt.retention_policy_id,p_require_health);
 if proof->>'componentsFingerprint'<>p_attempt.resolved_components_fingerprint then raise exception 'capital_body_processing_changed' using errcode='40001';end if;
end; $$;

do $$ begin
 if (select md5(prosrc) from pg_proc where oid='private.capital_body_processing_allocation_v1(public.processing_jobs,uuid)'::regprocedure) <> 'cf0d8adbafb1867f8934b2523b8bd941' then raise exception 'capital_body_drain_baseline_changed';end if;
end; $$;
create or replace function private.capital_body_processing_allocation_v1(p_job public.processing_jobs,p_allocation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin return private.capital_body_processing_allocation_proof_v1(p_job,p_allocation,true);end; $$;
do $$ begin
 if (select md5(prosrc) from pg_proc where oid='private.capital_body_processing_components_v1(public.processing_jobs,jsonb,timestamptz,uuid)'::regprocedure) <> 'fcfde79ef6dde8e1644e56950020083a' then raise exception 'capital_body_drain_baseline_changed';end if;
end; $$;
create or replace function private.capital_body_processing_components_v1(p_job public.processing_jobs,p_components jsonb,p_captured_at timestamptz,p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin return private.capital_body_processing_components_proof_v1(p_job,p_components,p_captured_at,p_policy_id,true);end; $$;
do $$ begin
 if (select md5(prosrc) from pg_proc where oid='private.capital_body_attempt_sources_current_v1(public.processing_jobs,private.capital_body_gateway_attempts)'::regprocedure) <> '131f7755bdaa9ef072edc1c52d0cb0e3' then raise exception 'capital_body_drain_baseline_changed';end if;
end; $$;
create or replace function private.capital_body_attempt_sources_current_v1(p_job public.processing_jobs,p_attempt private.capital_body_gateway_attempts)
returns void language plpgsql security definer set search_path='' as $$
begin perform private.capital_body_attempt_sources_proof_v1(p_job,p_attempt,true);end; $$;
do $$ begin
 if (select md5(prosrc) from pg_proc where oid='private.capital_body_allocation_deadline_v1(uuid,uuid,uuid,integer)'::regprocedure) <> 'e6bd43a976740658e5ed3475c64b8a35' then raise exception 'capital_body_drain_baseline_changed';end if;
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
 begin perform private.capital_body_attempt_sources_proof_v1(original_job,strict_attempt,false);
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
revoke all on function private.capital_body_processing_allocation_proof_v1(public.processing_jobs,uuid,boolean),
 private.capital_body_processing_components_proof_v1(public.processing_jobs,jsonb,timestamptz,uuid,boolean),
 private.capital_body_attempt_sources_proof_v1(public.processing_jobs,private.capital_body_gateway_attempts,boolean)
 from public,anon,authenticated,service_role;
