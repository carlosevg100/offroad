-- Stage 18, increment 3B: bounded recomputation of the affected executions. When the dependency
-- effect of increment 3A opens or merges a dependency-update request, the executions it affects
-- are planned against the current heads, as planDependencyRecompute
-- (packages/work-plan/src/continuation.ts) defines it, lineage by lineage: the newest live
-- execution of a lineage represents it; when it pins the current heads the lineage is reused by
-- its input fingerprint, otherwise the lineage gets one candidate keyed by dependencyRecomputeKey.
-- A zero-budget candidate is scheduled for the worker; a candidate with a positive budget waits for
-- a person as a persisted wait, with no job and no lease. A key recorded in any state is never
-- scheduled or put to a person again. No candidate is produced while a named hold applies, and
-- every hold records the signal that releases it.
--
-- The database never composes an execution contract: the worker assembles the basis for the
-- original requester at the head inputs through a closed worker RPC, composes the contract, the
-- snapshot and the professional gates in TypeScript, and submits them through another closed
-- worker RPC, which re-checks the key against the current heads, requests the execution for the
-- original requester through the same checks as the human path and records lineage in the same
-- transaction. A recomputed result is a candidate: no result, decision or milestone of a result
-- is rewritten here; adoption is increment 4.
--
-- Nothing here calls the new worker RPCs. Until a worker that knows them is deployed, zero-budget
-- candidates stay scheduled without an execution.
set search_path='';

-- 0. The explicit-subject variants of the human producer path, by the house pattern of
-- 20260923154150_execution_explicit_human_subject.sql: the body of each human function is copied
-- into an *_as_subject_* function with the subject explicit and verified as a live account. The
-- human functions are not changed. The only check the human basis makes through the session
-- rather than through the subject, whether the working basis is readable
-- (can_read_assumption_version_v1), becomes the check the execution core itself applies to a
-- pinned basis for an explicit subject: the work readable for analysis and every decision current
-- (execution_basis_current_v1). The worker path therefore runs the checks of the human path.
create function private.assumption_version_readable_as_subject_v1(p_org uuid,p_version uuid,p_subject uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.assumption_versions v join public.assumption_sets s on s.organization_id=v.organization_id and s.id=v.set_id
  where v.organization_id=p_org and v.id=p_version and s.work_id is not null and v.classification<>'legacy_execution'
  and private.evaluate_resource_policy_v1(p_org,s.work_id,p_subject,'read','analysis'))
 and not exists(select 1 from private.assumption_version_items i where i.organization_id=p_org and i.version_id=p_version
  and not private.execution_basis_current_v1(p_org,i.decision_id,p_subject));
$$;

do $patch$
declare original text;revised text;needle text;guard text:=' if p_subject is null then raise exception ''execution_subject_required'' using errcode=''42501'';end if;';
 live text:=E'\n perform 1 from auth.users where id=p_subject and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;\n if not found then raise exception ''execution_access_denied'' using errcode=''42501'';end if;';
begin
 -- The v1 basis: five reads of the session subject and the session read check of the working basis.
 original:=pg_get_functiondef('private.execution_contract_basis_v1(uuid,uuid,text)'::regprocedure);
 needle:='private.execution_contract_basis_v1(p_work_id uuid, p_version_id uuid, p_method_id text DEFAULT ''prepare-capital-structure-decision''::text)';
 if (length(original)-length(replace(original,needle,'')))/length(needle)<>1 or (length(original)-length(replace(original,'auth.uid()','')))/length('auth.uid()')<>5
 or (length(original)-length(replace(original,'private.can_read_assumption_version_v1(w.organization_id,v.id)','')))/length('private.can_read_assumption_version_v1(w.organization_id,v.id)')<>1 then
  raise exception 'execution_basis_subject_contract_changed';
 end if;
 revised:=replace(replace(replace(original,needle,'private.execution_contract_basis_as_subject_v1(p_subject uuid, p_work_id uuid, p_version_id uuid, p_method_id text)'),'auth.uid()','p_subject'),
  'private.can_read_assumption_version_v1(w.organization_id,v.id)','private.assumption_version_readable_as_subject_v1(w.organization_id,v.id,p_subject)');
 if (length(revised)-length(replace(revised,guard,'')))/length(guard)<>1 then raise exception 'execution_basis_subject_contract_changed';end if;
 execute replace(revised,guard,guard||live);

 -- The v1 producer: three reads of the session subject and the call of the human request core.
 original:=pg_get_functiondef('private.request_work_execution_producer_v1(text,text)'::regprocedure);
 needle:='private.request_work_execution_producer_v1(p_contract_text text, p_snapshot_text text)';
 if (length(original)-length(replace(original,needle,'')))/length(needle)<>1 or (length(original)-length(replace(original,'auth.uid()','')))/length('auth.uid()')<>3
 or (length(original)-length(replace(original,'private.request_work_execution_v1(p.id,p_contract_text,p_snapshot_text)','')))/length('private.request_work_execution_v1(p.id,p_contract_text,p_snapshot_text)')<>1 then
  raise exception 'execution_producer_subject_contract_changed';
 end if;
 revised:=replace(replace(replace(original,needle,'private.request_work_execution_producer_as_subject_v1(p_subject uuid, p_contract_text text, p_snapshot_text text)'),'auth.uid()','p_subject'),
  'private.request_work_execution_v1(p.id,p_contract_text,p_snapshot_text)','private.request_work_execution_as_subject_v1(p_subject,p.id,p_contract_text,p_snapshot_text)');
 if (length(revised)-length(replace(revised,guard,'')))/length(guard)<>1 then raise exception 'execution_producer_subject_contract_changed';end if;
 execute replace(revised,guard,guard||live);

 -- The v2 producer: one read of the session subject, the v2 basis and the v1 producer.
 original:=pg_get_functiondef('private.request_work_execution_producer_v2(text,text,text)'::regprocedure);
 needle:='private.request_work_execution_producer_v2(p_contract_text text, p_snapshot_text text, p_gates_text text)';
 if (length(original)-length(replace(original,needle,'')))/length(needle)<>1 or (length(original)-length(replace(original,'auth.uid()','')))/length('auth.uid()')<>1
 or (length(original)-length(replace(original,'private.execution_contract_basis_v2(target_work,','')))/length('private.execution_contract_basis_v2(target_work,')<>1
 or (length(original)-length(replace(original,'private.request_work_execution_producer_v1(p_contract_text,p_snapshot_text)','')))/length('private.request_work_execution_producer_v1(p_contract_text,p_snapshot_text)')<>1 then
  raise exception 'execution_producer_subject_contract_changed';
 end if;
 revised:=replace(replace(replace(replace(original,needle,'private.request_work_execution_producer_as_subject_v2(p_subject uuid, p_contract_text text, p_snapshot_text text, p_gates_text text)'),'auth.uid()','p_subject'),
  'private.execution_contract_basis_v2(target_work,','private.execution_contract_basis_as_subject_v2(p_subject,target_work,'),
  'private.request_work_execution_producer_v1(p_contract_text,p_snapshot_text)','private.request_work_execution_producer_as_subject_v1(p_subject,p_contract_text,p_snapshot_text)');
 if (length(revised)-length(replace(revised,guard,'')))/length(guard)<>1 then raise exception 'execution_producer_subject_contract_changed';end if;
 execute replace(revised,guard,guard||live);
end $patch$;

-- The v2 basis for an explicit subject: the v1 basis, every check first, plus the company block,
-- exactly as private.execution_contract_basis_v2 builds it for the session subject.
create function private.execution_contract_basis_as_subject_v2(p_subject uuid,p_work_id uuid,p_version_id uuid,p_method_id text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare b jsonb;begin
 b:=private.execution_contract_basis_as_subject_v1(p_subject,p_work_id,p_version_id,p_method_id);
 return b||jsonb_build_object('schemaVersion','execution-contract-basis.v2',
  'company',private.execution_company_basis_v1((b->>'organizationId')::uuid,p_work_id,private.execution_json_projection_v1(b#>>'{envelope,canonical}')->'entries'));
end $$;

-- 1. Canonical identity of the inputs, as continuation.ts computes it.
-- dependencyLogicalKeyId: JSON.stringify of the kind and its ids, without spaces.
create function private.continuation_logical_key_v1(p_kind text,p_first text,p_second text default null) returns text
language sql immutable set search_path='' as $$
 select '['||to_jsonb(p_kind)::text||','||to_jsonb(p_first)::text||case when p_second is null then '' else ','||to_jsonb(p_second)::text end||']';
$$;
-- continuation-input-identity.v1 (inputFingerprint): the [key, value] entries in key order.
create function private.continuation_input_identity_v1(p_entries jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('schemaVersion','continuation-input-identity.v1','inputs',
  coalesce((select jsonb_agg(e.value order by (e.value->>0) collate "C") from jsonb_array_elements(p_entries) e),'[]'::jsonb));
$$;
-- dependencyRecomputeKey: work, root base execution and the new input fingerprint.
create function private.dependency_recompute_key_v1(p_work uuid,p_base uuid,p_fingerprint text) returns text
language sql immutable set search_path='' as $$
 select private.continuation_fingerprint_v1(jsonb_build_object('schemaVersion','dependency-recompute-key.v1','workId',p_work,'baseExecutionId',p_base,'newInputFingerprint',p_fingerprint));
$$;

-- 2. Candidates, leases, lineage and holds.
create table public.work_recompute_candidates (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 request_id uuid not null,
 idempotency_key text not null check(idempotency_key ~ '^[a-f0-9]{64}$'),
 base_execution_id uuid not null,
 new_input_fingerprint text not null check(new_input_fingerprint ~ '^[a-f0-9]{64}$'),
 head_inputs jsonb not null check(jsonb_typeof(head_inputs)='object' and head_inputs->>'schemaVersion'='continuation-input-identity.v1' and jsonb_typeof(head_inputs->'inputs')='array'),
 action text not null check(action in ('recompute','await_authorization')),
 max_cost_microusd bigint not null check(max_cost_microusd>=0),
 max_model_calls bigint not null check(max_model_calls>=0),
 execution_ids uuid[] not null check(cardinality(execution_ids)>0),
 state text not null check(state in ('awaiting_authorization','scheduled','settled','declined','failed')),
 reason text check(reason ~ '^[a-z][a-z0-9_:.-]{1,159}$'),
 execution_id uuid,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 unique(organization_id,work_id,id),
 constraint work_recompute_candidates_key unique(organization_id,work_id,idempotency_key),
 constraint work_recompute_candidates_execution_key unique(organization_id,execution_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,work_id,request_id) references public.work_continuation_requests(organization_id,work_id,id),
 foreign key(organization_id,base_execution_id) references public.work_executions(organization_id,id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 constraint work_recompute_candidates_identity check(new_input_fingerprint=private.continuation_fingerprint_v1(head_inputs)
  and idempotency_key=private.dependency_recompute_key_v1(work_id,base_execution_id,new_input_fingerprint)),
 -- A positive budget always waits for a person; a zero budget never does.
 constraint work_recompute_candidates_budget check((action='await_authorization')=(max_cost_microusd>0 or max_model_calls>0)
  and (state<>'awaiting_authorization' or action='await_authorization')),
 constraint work_recompute_candidates_outcome check((state in ('declined','failed'))=(reason is not null)
  and (state<>'settled' or execution_id is not null) and (state<>'awaiting_authorization' or execution_id is null))
);
create index work_recompute_candidates_work_idx on public.work_recompute_candidates(organization_id,work_id,state);
create index work_recompute_candidates_request_idx on public.work_recompute_candidates(organization_id,work_id,request_id);
create index work_recompute_candidates_base_idx on public.work_recompute_candidates(organization_id,base_execution_id);
create index work_recompute_candidates_schedulable_idx on public.work_recompute_candidates(created_at,id) where state='scheduled' and execution_id is null;
alter table public.work_recompute_candidates enable row level security;
alter table public.work_recompute_candidates force row level security;
revoke all on public.work_recompute_candidates from public,anon,authenticated,service_role;
grant select on public.work_recompute_candidates to authenticated;
-- The same read authority as public.work_milestones: the person must be able to read the work.
create policy work_recompute_candidates_select_authorized on public.work_recompute_candidates for select to authenticated using((select private.can_access_capital_project(organization_id,work_id)));
create policy work_recompute_candidates_deny_insert on public.work_recompute_candidates for insert to authenticated with check(false);
create policy work_recompute_candidates_deny_update on public.work_recompute_candidates for update to authenticated using(false) with check(false);
create policy work_recompute_candidates_deny_delete on public.work_recompute_candidates for delete to authenticated using(false);

-- Candidate states, forward only: a person authorizes (increment 4) or declines a waiting
-- candidate; a scheduled candidate settles with its result, is declined (requester without
-- authority, or superseded by newer heads) or fails (gate refusal, failed execution).
create function private.work_recompute_transition_allowed_v1(p_from text,p_to text) returns boolean
language sql immutable set search_path='' as $$
 select case p_from
  when 'awaiting_authorization' then p_to in ('scheduled','declined')
  when 'scheduled' then p_to in ('settled','declined','failed')
  else false end;
$$;
-- Identity never changes, every write bumps the revision, the execution is attached once to a
-- scheduled candidate, and the state follows the machine. Nothing is deleted or truncated.
create function private.guard_work_recompute_candidate_v1() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'work_continuity_history_immutable' using errcode='23514'; end if;
 if (new.id,new.organization_id,new.work_id,new.request_id,new.idempotency_key,new.base_execution_id,new.new_input_fingerprint,new.head_inputs,new.action,
   new.max_cost_microusd,new.max_model_calls,new.execution_ids,new.created_at)
  is distinct from (old.id,old.organization_id,old.work_id,old.request_id,old.idempotency_key,old.base_execution_id,old.new_input_fingerprint,old.head_inputs,old.action,
   old.max_cost_microusd,old.max_model_calls,old.execution_ids,old.created_at)
 or new.revision<>old.revision+1
 or (new.execution_id is distinct from old.execution_id and (old.execution_id is not null or old.state<>'scheduled' or new.state<>'scheduled'))
 or (new.state<>old.state and not private.work_recompute_transition_allowed_v1(old.state,new.state))
 or (new.state=old.state and new.reason is distinct from old.reason) then
  raise exception 'work_recompute_candidate_transition_invalid' using errcode='23514';
 end if;
 return new;
end $$;
create trigger work_recompute_candidates_guard before update or delete on public.work_recompute_candidates for each row execute function private.guard_work_recompute_candidate_v1();
create trigger work_recompute_candidates_truncate_guard before truncate on public.work_recompute_candidates for each statement execute function private.reject_work_continuity_mutation_v1();
create trigger work_recompute_candidates_updated before update on public.work_recompute_candidates for each row execute function private.set_updated_at();
create trigger work_recompute_candidates_audit after insert or update or delete on public.work_recompute_candidates for each row execute function private.capture_identity_audit_v1();

-- The worker's lease on a scheduled candidate: operational state, never readable through the API.
create table private.work_recompute_leases (
 organization_id uuid not null,
 candidate_id uuid not null,
 lease_id uuid,
 capability_sha256 bytea,
 leased_by uuid references private.worker_tokens(id),
 leased_account_user_id uuid references auth.users(id),
 lease_expires_at timestamptz,
 attempts integer not null default 0,
 max_attempts integer not null default 5 check(max_attempts between 1 and 20),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint work_recompute_leases_pkey primary key(organization_id,candidate_id),
 foreign key(organization_id,candidate_id) references public.work_recompute_candidates(organization_id,id),
 check(attempts between 0 and max_attempts),
 check(num_nulls(lease_id,capability_sha256,leased_by,leased_account_user_id,lease_expires_at) in (0,5))
);
create index work_recompute_leases_worker_idx on private.work_recompute_leases(leased_by) where leased_by is not null;
create index work_recompute_leases_account_idx on private.work_recompute_leases(leased_account_user_id) where leased_account_user_id is not null;
alter table private.work_recompute_leases enable row level security;
alter table private.work_recompute_leases force row level security;
revoke all on private.work_recompute_leases from public,anon,authenticated,service_role;
create policy work_recompute_leases_deny_clients on private.work_recompute_leases as restrictive for all to anon,authenticated using(false) with check(false);
create function private.guard_work_recompute_lease_v1() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'work_continuity_history_immutable' using errcode='23514'; end if;
 if (new.organization_id,new.candidate_id,new.max_attempts,new.created_at) is distinct from (old.organization_id,old.candidate_id,old.max_attempts,old.created_at)
 or new.attempts<old.attempts then raise exception 'work_recompute_lease_transition_invalid' using errcode='23514'; end if;
 return new;
end $$;
create trigger work_recompute_leases_guard before update or delete on private.work_recompute_leases for each row execute function private.guard_work_recompute_lease_v1();
create trigger work_recompute_leases_truncate_guard before truncate on private.work_recompute_leases for each statement execute function private.reject_work_continuity_mutation_v1();
create trigger work_recompute_leases_updated before update on private.work_recompute_leases for each row execute function private.set_updated_at();

-- Lineage: every recomputed execution names its root and its candidate, in the transaction that
-- creates it. A recomputation of a recomputation names the root, never the intermediate.
create table private.execution_lineage (
 id uuid primary key default gen_random_uuid(),
 -- Order of the recomputations of a lineage; the newest live one represents it.
 sequence bigint generated always as identity,
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 execution_id uuid not null,
 root_execution_id uuid not null,
 candidate_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 constraint execution_lineage_sequence_key unique(sequence),
 constraint execution_lineage_execution_key unique(organization_id,execution_id),
 constraint execution_lineage_candidate_key unique(organization_id,candidate_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id),
 foreign key(organization_id,root_execution_id) references public.work_executions(organization_id,id),
 foreign key(organization_id,work_id,candidate_id) references public.work_recompute_candidates(organization_id,work_id,id),
 check(execution_id<>root_execution_id)
);
create index execution_lineage_root_idx on private.execution_lineage(organization_id,root_execution_id,sequence);
create index execution_lineage_work_idx on private.execution_lineage(organization_id,work_id,candidate_id);
alter table private.execution_lineage enable row level security;
alter table private.execution_lineage force row level security;
revoke all on private.execution_lineage from public,anon,authenticated,service_role;
revoke all on sequence private.execution_lineage_sequence_seq from public,anon,authenticated,service_role;
create policy execution_lineage_deny_clients on private.execution_lineage as restrictive for all to anon,authenticated using(false) with check(false);
create function private.validate_execution_lineage_v1() returns trigger
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from private.execution_lineage l where l.organization_id=new.organization_id and l.execution_id=new.root_execution_id)
 or not exists(select 1 from public.work_recompute_candidates c where c.organization_id=new.organization_id and c.id=new.candidate_id
  and c.work_id=new.work_id and c.base_execution_id=new.root_execution_id and c.state='scheduled' and c.execution_id is null)
 or not exists(select 1 from public.work_executions e where e.organization_id=new.organization_id and e.id=new.execution_id and e.work_id=new.work_id)
 or not exists(select 1 from public.work_executions e where e.organization_id=new.organization_id and e.id=new.root_execution_id and e.work_id=new.work_id) then
  raise exception 'execution_lineage_invalid' using errcode='23514';
 end if;
 return new;
end $$;
create trigger execution_lineage_validate before insert on private.execution_lineage for each row execute function private.validate_execution_lineage_v1();
create trigger execution_lineage_immutable before update or delete on private.execution_lineage for each row execute function private.reject_work_continuity_mutation_v1();
create trigger execution_lineage_truncate_guard before truncate on private.execution_lineage for each statement execute function private.reject_work_continuity_mutation_v1();
create trigger execution_lineage_updated before update on private.execution_lineage for each row execute function private.set_updated_at();

-- Holds: an affected execution of an open request that cannot be recomputed yet, and the signal
-- that releases it. A hold is released once, when a later planning no longer finds it.
create table private.dependency_recompute_holds (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 work_id uuid not null,
 request_id uuid not null,
 execution_id uuid not null,
 hold_kind text not null check(hold_kind in ('derived_source_not_rederived','basis_behind_source','source_not_bindable','method_not_executable','graph_incomplete')),
 signal text not null check(signal ~ '^[a-z_]+:[0-9A-Za-z_.:-]{1,200}$'),
 subject jsonb not null check(jsonb_typeof(subject)='object'),
 released_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,id),
 foreign key(organization_id,work_id,request_id) references public.work_continuation_requests(organization_id,work_id,id),
 foreign key(organization_id,execution_id) references public.work_executions(organization_id,id)
);
create unique index dependency_recompute_holds_open_idx on private.dependency_recompute_holds(organization_id,request_id,execution_id,hold_kind,signal) where released_at is null;
create index dependency_recompute_holds_signal_idx on private.dependency_recompute_holds(organization_id,signal) where released_at is null;
create index dependency_recompute_holds_request_idx on private.dependency_recompute_holds(organization_id,work_id,request_id);
create index dependency_recompute_holds_execution_idx on private.dependency_recompute_holds(organization_id,execution_id);
alter table private.dependency_recompute_holds enable row level security;
alter table private.dependency_recompute_holds force row level security;
revoke all on private.dependency_recompute_holds from public,anon,authenticated,service_role;
create policy dependency_recompute_holds_deny_clients on private.dependency_recompute_holds as restrictive for all to anon,authenticated using(false) with check(false);
create function private.guard_dependency_recompute_hold_v1() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'work_continuity_history_immutable' using errcode='23514'; end if;
 if (new.id,new.organization_id,new.work_id,new.request_id,new.execution_id,new.hold_kind,new.signal,new.subject,new.created_at)
  is distinct from (old.id,old.organization_id,old.work_id,old.request_id,old.execution_id,old.hold_kind,old.signal,old.subject,old.created_at)
 or old.released_at is not null or new.released_at is null then
  raise exception 'dependency_recompute_hold_transition_invalid' using errcode='23514';
 end if;
 return new;
end $$;
create trigger dependency_recompute_holds_guard before update or delete on private.dependency_recompute_holds for each row execute function private.guard_dependency_recompute_hold_v1();
create trigger dependency_recompute_holds_truncate_guard before truncate on private.dependency_recompute_holds for each statement execute function private.reject_work_continuity_mutation_v1();
create trigger dependency_recompute_holds_updated before update on private.dependency_recompute_holds for each row execute function private.set_updated_at();

-- 3. Reading an execution against the current heads.
-- An execution still has an output to update while it has a committed result or a live job, the
-- same rule as the impact of increment 3A.
create function private.execution_is_live_v1(p_org uuid,p_execution uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.execution_result_receipts r where r.organization_id=p_org and r.execution_id=p_execution)
  or exists(select 1 from public.processing_jobs j where j.organization_id=p_org and j.execution_id=p_execution and j.status in ('queued','awaiting_approval','leased'));
$$;

-- The source versions a working basis refers to: the adopted observations and the contractual
-- definitions of its decisions, the same references the execution basis pins.
create function private.assumption_version_source_refs_v1(p_org uuid,p_version uuid) returns uuid[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(distinct x.id),'{}'::uuid[]) from (
  select o.source_version_id as id from private.assumption_version_items i
  join public.adoption_decisions a on a.organization_id=i.organization_id and a.id=i.decision_id
  join public.observations o on o.organization_id=a.organization_id and o.id=a.reference_observation_id
  where i.organization_id=p_org and i.version_id=p_version and o.source_version_id is not null
  union all
  select d.contract_source_version_id from private.assumption_version_items i
  join public.adoption_decisions a on a.organization_id=i.organization_id and a.id=i.decision_id
  join public.definition_versions d on d.organization_id=a.organization_id and d.id=a.definition_version_id
  where i.organization_id=p_org and i.version_id=p_version and d.contract_source_version_id is not null) x;
$$;

-- A source version the execution request can pin: bytes verified by the worker and a rights
-- version that allows reading, processing, storing and deriving for analysis now. The requester's
-- own use is checked again when the execution is requested.
create function private.source_version_bindable_v1(p_org uuid,p_version uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.source_version_verifications x where x.organization_id=p_org and x.source_version_id=p_version
   and private.execution_source_bytes_verified_v1(p_org,p_version,x.observed_sha256))
 and exists(select 1 from private.source_rights_versions r where r.organization_id=p_org and r.source_version_id=p_version
   and r.operations @> array['read','process','store','derive'] and 'analysis'=any(r.purposes) and r.valid_from<=clock_timestamp()
   and (r.expires_at is null or r.expires_at>clock_timestamp()) and (r.store_until is null or r.store_until>clock_timestamp()));
$$;

-- Whether a version is, or descends from, another through private.resource_dependencies.
create function private.source_version_descends_from_v1(p_org uuid,p_version uuid,p_ancestor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 with recursive up(version_id) as (
  select p_version
  union
  select r.source_version_id from up join private.resource_dependencies r on r.organization_id=p_org and r.derived_version_id=up.version_id)
 select exists(select 1 from up where up.version_id=p_ancestor);
$$;

-- One execution against the current heads, as assessExecution in continuation.ts: the newest
-- version of each logical input it relied on (directly or through the derivation closure), the
-- slot decisions of the highest pinned revision and the method release; the identity of those
-- inputs pinned and at the heads; the status (unaffected, affected, graph_incomplete with its
-- gaps); the spend ceiling (after a method update, the larger of the pinned and the head profile);
-- and, for an affected execution, the recompute key and what holds it:
--  derived_source_not_rederived  a source it relied on through a derived version moved, and the head
--                                of that derived source does not descend from the new version yet;
--                                released by a newer version of the derived source (source_version).
--  basis_behind_source           a source that reached it through its working basis moved, and the
--                                head basis does not refer to the new version yet; released by a
--                                new revision of the set (assumption_version).
--  source_not_bindable           the new version of a source it pinned is not verified or has no
--                                current rights; released when the version is verified or receives
--                                rights (source_bindable).
--  method_not_executable         the head release of its procedure has no executable profile;
--                                released by a method_release event of the procedure.
create function private.execution_recompute_assessment_v1(p_org uuid,p_execution uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.work_executions;root uuid;pinned_entries jsonb:='[]';head_entries jsonb:='[]';gaps jsonb:='[]';holds jsonb:='[]';moved boolean:=false;
 cost bigint:=0;calls bigint:=0;src record;slot record;m record;slot_head record;method_head record;carrier record;input_key text;head_version uuid;head_no integer;
 bases uuid[];basis_sets uuid[];head_basis uuid;basis_set uuid;method text;identity jsonb;fingerprint text;recompute_key text;
begin
 select * into strict e from public.work_executions where organization_id=p_org and id=p_execution;
 root:=coalesce((select l.root_execution_id from private.execution_lineage l where l.organization_id=p_org and l.execution_id=e.id),e.id);
 select coalesce((p.payload#>>'{limits,maxCostMicrousd}')::bigint,0),coalesce((p.payload#>>'{limits,maxModelCalls}')::bigint,0) into cost,calls
  from private.execution_control_bindings b join private.execution_method_profiles p on p.id=b.profile_id
  where b.organization_id=p_org and b.execution_id=e.id;
 cost:=coalesce(cost,0);calls:=coalesce(calls,0);
 if not exists(select 1 from private.execution_dependencies d where d.organization_id=p_org and d.execution_id=e.id) then
  gaps:=gaps||jsonb_build_array(jsonb_build_object('code','no_recorded_edges'));
 end if;
 bases:=array(select distinct d.assumption_version_id from private.execution_dependencies d
  where d.organization_id=p_org and d.execution_id=e.id and d.dependency_kind='assumption_slot' order by 1);

 for src in
  with recursive pins as (
   select distinct d.source_version_id as pin from private.execution_dependencies d
   where d.organization_id=p_org and d.execution_id=e.id and d.dependency_kind='source_version'),
  carried(pin,version_id) as (
   select pins.pin,pins.pin from pins
   union
   select c.pin,r.source_version_id from carried c join private.resource_dependencies r on r.organization_id=p_org and r.derived_version_id=c.version_id),
  reached as (select c.pin,c.version_id,v.source_id,v.version_no from carried c join public.source_versions v on v.organization_id=p_org and v.id=c.version_id),
  newest as (select distinct on (x.source_id) x.source_id,x.version_id,x.version_no from reached x order by x.source_id,x.version_no desc)
  select n.source_id,n.version_id,n.version_no,exists(select 1 from pins p where p.pin=n.version_id) as direct,
   coalesce((select array_agg(distinct x.pin order by x.pin) from reached x where x.version_id=n.version_id),'{}'::uuid[]) as carriers
  from newest n order by n.source_id
 loop
  input_key:=private.continuation_logical_key_v1('source_version',src.source_id::text);
  pinned_entries:=pinned_entries||jsonb_build_array(jsonb_build_array(input_key,jsonb_build_object('versionNo',src.version_no,'versionId',src.version_id)));
  head_version:=null;head_no:=null;
  select x.version_id,x.version_no into head_version,head_no from private.source_head_v1(p_org,src.source_id) x;
  if head_version is null then
   gaps:=gaps||jsonb_build_array(jsonb_build_object('code','head_unknown','key',input_key));
   continue;
  end if;
  if head_no<src.version_no then
   gaps:=gaps||jsonb_build_array(jsonb_build_object('code','head_behind_pin','key',input_key));
   continue;
  end if;
  head_entries:=head_entries||jsonb_build_array(jsonb_build_array(input_key,jsonb_build_object('versionNo',head_no,'versionId',head_version)));
  if head_no=src.version_no then continue; end if;
  moved:=true;
  if not src.direct then
   -- Carried by derived versions: each one must be re-derived from the new version first.
   for carrier in select x.id as pin,x.source_id,(select hv.version_id from private.source_head_v1(p_org,x.source_id) hv) as head
    from public.source_versions x where x.organization_id=p_org and x.id=any(src.carriers) order by x.id loop
    if not private.source_version_descends_from_v1(p_org,carrier.head,head_version) then
     holds:=holds||jsonb_build_array(jsonb_build_object('kind','derived_source_not_rederived','signal','source_version:'||carrier.source_id::text,
      'subject',jsonb_build_object('sourceId',carrier.source_id,'pinnedVersionId',carrier.pin,'headVersionId',carrier.head,'ancestorSourceId',src.source_id,'ancestorVersionId',head_version)));
    end if;
   end loop;
  else
   if not private.source_version_bindable_v1(p_org,head_version) then
    holds:=holds||jsonb_build_array(jsonb_build_object('kind','source_not_bindable','signal','source_bindable:'||head_version::text,
     'subject',jsonb_build_object('sourceId',src.source_id,'versionId',head_version)));
   end if;
   -- Reached through a working basis: the head basis of that set must refer to the new version.
   basis_sets:=array(select distinct av.set_id from public.assumption_versions av where av.organization_id=p_org and av.id=any(bases)
    and src.version_id=any(private.assumption_version_source_refs_v1(p_org,av.id)) order by 1);
   foreach basis_set in array basis_sets loop
    select av.id into head_basis from public.assumption_versions av where av.organization_id=p_org and av.set_id=basis_set order by av.revision desc limit 1;
    if not (head_version=any(private.assumption_version_source_refs_v1(p_org,head_basis))) then
     holds:=holds||jsonb_build_array(jsonb_build_object('kind','basis_behind_source','signal','assumption_version:'||basis_set::text,
      'subject',jsonb_build_object('setId',basis_set,'headBasisVersionId',head_basis,'sourceId',src.source_id,'versionId',head_version)));
    end if;
   end loop;
  end if;
 end loop;

 for slot in
  select distinct on (d.assumption_set_id,d.slot_key) d.assumption_set_id,d.slot_key,d.assumption_revision,d.decision_id
  from private.execution_dependencies d where d.organization_id=p_org and d.execution_id=e.id and d.dependency_kind='assumption_slot'
  order by d.assumption_set_id,d.slot_key,d.assumption_revision desc,d.id
 loop
  input_key:=private.continuation_logical_key_v1('assumption_slot',slot.assumption_set_id::text,slot.slot_key);
  pinned_entries:=pinned_entries||jsonb_build_array(jsonb_build_array(input_key,jsonb_build_object('decisionId',slot.decision_id)));
  select x.version_id,x.revision,x.decision_id into slot_head from private.assumption_slot_head_v1(p_org,slot.assumption_set_id,slot.slot_key) x;
  if slot_head.version_id is null then
   gaps:=gaps||jsonb_build_array(jsonb_build_object('code','head_unknown','key',input_key));
   continue;
  end if;
  if slot_head.revision<slot.assumption_revision then
   gaps:=gaps||jsonb_build_array(jsonb_build_object('code','head_behind_pin','key',input_key));
   continue;
  end if;
  head_entries:=head_entries||jsonb_build_array(jsonb_build_array(input_key,jsonb_build_object('decisionId',slot_head.decision_id)));
  if slot_head.decision_id is distinct from slot.decision_id then moved:=true; end if;
 end loop;

 for m in select d.method_id,d.platform_release_id,d.house_release_id from private.execution_dependencies d
  where d.organization_id=p_org and d.execution_id=e.id and d.dependency_kind='method_release' order by d.id
 loop
  method:=m.method_id;
  input_key:=private.continuation_logical_key_v1('method_release',m.method_id);
  pinned_entries:=pinned_entries||jsonb_build_array(jsonb_build_array(input_key,jsonb_build_object('platformReleaseId',m.platform_release_id,'houseReleaseId',m.house_release_id)));
  select x.platform_release_id,x.house_release_id,x.profile_id,x.max_cost_microusd,x.max_model_calls into method_head
   from private.method_release_head_v1(p_org,m.method_id,m.house_release_id is not null) x;
  if method_head.platform_release_id is null then
   gaps:=gaps||jsonb_build_array(jsonb_build_object('code','head_unknown','key',input_key));
   continue;
  end if;
  head_entries:=head_entries||jsonb_build_array(jsonb_build_array(input_key,jsonb_build_object('platformReleaseId',method_head.platform_release_id,'houseReleaseId',method_head.house_release_id)));
  if method_head.platform_release_id<>m.platform_release_id or method_head.house_release_id is distinct from m.house_release_id then
   moved:=true;
   -- The recomputation runs under the head release, whose profile can spend too: the larger ceiling decides.
   cost:=greatest(cost,coalesce(method_head.max_cost_microusd,0));calls:=greatest(calls,coalesce(method_head.max_model_calls,0));
  end if;
  if method_head.profile_id is null then
   holds:=holds||jsonb_build_array(jsonb_build_object('kind','method_not_executable','signal','method_release:'||m.method_id,
    'subject',jsonb_build_object('methodId',m.method_id,'platformReleaseId',method_head.platform_release_id,'houseReleaseId',method_head.house_release_id)));
  end if;
 end loop;

 if jsonb_array_length(gaps)=0 then
  identity:=private.continuation_input_identity_v1(head_entries);
  fingerprint:=private.continuation_fingerprint_v1(identity);
  if moved then recompute_key:=private.dependency_recompute_key_v1(e.work_id,root,fingerprint); end if;
 end if;
 return jsonb_build_object('executionId',e.id,'workId',e.work_id,'rootExecutionId',root,
  'status',case when jsonb_array_length(gaps)>0 then 'graph_incomplete' when moved then 'affected' else 'unaffected' end,
  'gaps',gaps,'pinnedInputs',private.continuation_input_identity_v1(pinned_entries),'currentInputs',identity,'currentFingerprint',fingerprint,'key',recompute_key,
  'spend',jsonb_build_object('maxCostMicrousd',cost,'maxModelCalls',calls),'holds',case when moved and jsonb_array_length(gaps)=0 then holds else '[]'::jsonb end,
  'methodId',method);
end $$;

-- A lineage is a root execution and every recomputation that names it. Its newest live execution
-- represents it: when that execution already pins the current heads the whole lineage is reused;
-- otherwise the representative's current input identity keys the one candidate of the lineage, so a
-- lineage is never recomputed twice for the same heads, even when a recomputation pinned a wider or
-- narrower set of inputs than the root (a slot the basis gained, a source it no longer refers to).
create function private.dependency_lineage_representative_v1(p_org uuid,p_root uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select x.id from (
  select l.execution_id as id,l.sequence as rank from private.execution_lineage l where l.organization_id=p_org and l.root_execution_id=p_root
  union all select p_root,0) x
 where private.execution_is_live_v1(p_org,x.id)
 order by x.rank desc limit 1;
$$;

-- A candidate is current while the representative of its lineage is affected and keyed on it: a
-- candidate is never produced for heads that have moved since it was planned.
create function private.dependency_recompute_candidate_current_v1(p_org uuid,p_candidate uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare c public.work_recompute_candidates;representative uuid;a jsonb;begin
 select * into c from public.work_recompute_candidates where organization_id=p_org and id=p_candidate;
 if c.id is null then return false; end if;
 representative:=private.dependency_lineage_representative_v1(p_org,c.base_execution_id);
 if representative is null then return false; end if;
 a:=private.execution_recompute_assessment_v1(p_org,representative);
 return a->>'status'='affected' and a->>'key'=c.idempotency_key;
end $$;

-- Whether a new execution pinned the heads a candidate was keyed on: for every logical input of the
-- key, the new execution relies on the head version or not on that input at all (a slot the head
-- basis no longer holds, a source it no longer refers to); the procedure must be pinned at its head.
create function private.execution_realizes_inputs_v1(p_org uuid,p_execution uuid,p_heads jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 with realized as (select e.value->>0 as key,e.value->1 as value
   from jsonb_array_elements(private.execution_recompute_assessment_v1(p_org,p_execution)#>'{pinnedInputs,inputs}') e),
 heads as (select e.value->>0 as key,e.value->1 as value from jsonb_array_elements(p_heads->'inputs') e)
 select not exists(select 1 from heads h join realized r on r.key=h.key where r.value is distinct from h.value)
  and not exists(select 1 from heads h where h.key like '["method\_release",%' and not exists(select 1 from realized r where r.key=h.key));
$$;

-- 4. Planning, as planDependencyRecompute, lineage by lineage. Runs after every dependency effect for
-- each work with an open request, and when a signal releases a hold.
create function private.plan_dependency_recompute_v1(p_org uuid,p_work uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.work_continuation_requests;lineages jsonb;touched uuid[];produced text[];current_holds jsonb:='[]';hold_list jsonb;covered uuid[];covering uuid;
 c record;g record;created uuid;prior_wait uuid;q record;superseded integer:=0;scheduled integer:=0;waiting integer:=0;held integer:=0;released integer:=0;
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('dependency-recompute-holds:'||p_org::text,0));
 perform pg_advisory_xact_lock(hashtextextended('work-continuation:'||p_org::text||':'||p_work::text,0));
 select * into r from public.work_continuation_requests x where x.organization_id=p_org and x.work_id=p_work and x.kind='dependency_update' and x.status='open' for update;
 if r.id is null then return jsonb_build_object('workId',p_work,'planned',false); end if;
 perform private.rebuild_incomplete_execution_dependencies_v1(p_org);

 -- Every lineage of the work with a live execution, judged by its representative against the current heads.
 select coalesce(jsonb_agg(jsonb_build_object('root',x.root,'representative',x.representative,'executions',to_jsonb(x.executions),
   'assessment',private.execution_recompute_assessment_v1(p_org,x.representative)) order by x.root),'[]'::jsonb) into lineages
 from (select l.root,private.dependency_lineage_representative_v1(p_org,l.root) as representative,array_agg(l.id order by l.id) as executions
  from (select e.id,coalesce((select y.root_execution_id from private.execution_lineage y where y.organization_id=e.organization_id and y.execution_id=e.id),e.id) as root
   from public.work_executions e where e.organization_id=p_org and e.work_id=p_work and private.execution_is_live_v1(p_org,e.id)) l
  group by l.root) x;
 produced:=array(select x.value#>>'{assessment,key}' from jsonb_array_elements(lineages) x where x.value#>>'{assessment,status}'='affected');

 -- Open candidates the current heads no longer produce are superseded, except one whose execution
 -- already pins the current heads: it is the up-to-date representative of its lineage.
 for c in select x.id from public.work_recompute_candidates x where x.organization_id=p_org and x.work_id=p_work
  and x.state in ('scheduled','awaiting_authorization') and not (x.idempotency_key=any(produced))
  and not exists(select 1 from jsonb_array_elements(lineages) l where l.value->>'representative'=x.execution_id::text and l.value#>>'{assessment,status}'='unaffected')
  order by x.created_at,x.id for update loop
  update public.work_recompute_candidates set state='declined',reason='superseded',revision=revision+1 where organization_id=p_org and id=c.id;
  superseded:=superseded+1;
 end loop;

 -- The open request plans the lineages of its live affected executions: reused when the
 -- representative pins the current heads, held while something named holds it, otherwise one
 -- candidate per key. A key already recorded, in any state and for any request, is not recorded again.
 touched:=array(select distinct coalesce((select y.root_execution_id from private.execution_lineage y where y.organization_id=p_org and y.execution_id=a.id::uuid),a.id::uuid)
  from jsonb_array_elements_text(r.payload->'affectedExecutionIds') a(id) where private.execution_is_live_v1(p_org,a.id::uuid));
 for g in select (x.value->>'root')::uuid as root,(x.value->>'representative')::uuid as representative,x.value->'assessment' as a,x.value->'executions' as executions
  from jsonb_array_elements(lineages) x where (x.value->>'root')::uuid=any(touched) order by x.value->>'root' loop
  hold_list:=case g.a->>'status'
   when 'affected' then g.a->'holds'
   -- An incomplete graph holds too, named by its gap; the projection was rebuilt above.
   when 'graph_incomplete' then (select coalesce(jsonb_agg(jsonb_build_object('kind','graph_incomplete',
     'signal',case when gap.value->>'code'='no_recorded_edges' then 'execution_dependencies:'||g.representative::text
      when gap.value->>'key' like '["source\_version",%' then 'source_version:'||((gap.value->>'key')::jsonb->>1)
      when gap.value->>'key' like '["assumption\_slot",%' then 'assumption_version:'||((gap.value->>'key')::jsonb->>1)
      else 'method_release:'||((gap.value->>'key')::jsonb->>1) end,
     'subject',gap.value) order by gap.ordinality),'[]'::jsonb) from jsonb_array_elements(g.a->'gaps') with ordinality gap)
   else '[]'::jsonb end;
  current_holds:=current_holds||(select coalesce(jsonb_agg(h.value||jsonb_build_object('executionId',g.representative) order by h.ordinality),'[]'::jsonb)
   from jsonb_array_elements(hold_list) with ordinality h);
  if g.a->>'status'<>'affected' or jsonb_array_length(hold_list)>0 then continue; end if;
  if exists(select 1 from public.work_recompute_candidates x where x.organization_id=p_org and x.work_id=p_work and x.idempotency_key=g.a->>'key') then continue; end if;
  covered:=array(select distinct z.id::uuid from (select a.id from jsonb_array_elements_text(r.payload->'affectedExecutionIds') a(id)
    where a.id in (select jsonb_array_elements_text(g.executions)) union select g.representative::text) z order by 1);
  created:=gen_random_uuid();
  insert into public.work_recompute_candidates(id,organization_id,work_id,request_id,idempotency_key,base_execution_id,new_input_fingerprint,head_inputs,
   action,max_cost_microusd,max_model_calls,execution_ids,state)
  values(created,p_org,p_work,r.id,g.a->>'key',g.root,g.a->>'currentFingerprint',g.a->'currentInputs',
   case when (g.a#>>'{spend,maxCostMicrousd}')::bigint>0 or (g.a#>>'{spend,maxModelCalls}')::bigint>0 then 'await_authorization' else 'recompute' end,
   (g.a#>>'{spend,maxCostMicrousd}')::bigint,(g.a#>>'{spend,maxModelCalls}')::bigint,covered,
   case when (g.a#>>'{spend,maxCostMicrousd}')::bigint>0 or (g.a#>>'{spend,maxModelCalls}')::bigint>0 then 'awaiting_authorization' else 'scheduled' end);
  if (g.a#>>'{spend,maxCostMicrousd}')::bigint>0 or (g.a#>>'{spend,maxModelCalls}')::bigint>0 then
   -- A persisted wait: an awaiting_human milestone of the candidate, no job and no lease. It closes
   -- the wait of the same lineage whose candidate newer heads superseded.
   prior_wait:=null;
   select m.id into prior_wait from public.work_recompute_candidates x join public.work_milestones m on m.organization_id=x.organization_id
    and m.kind='awaiting_human' and m.subject_kind='work_recompute_candidate' and m.subject_id=x.id
    where x.organization_id=p_org and x.work_id=p_work and x.base_execution_id=g.root and x.state='declined' and x.reason='superseded'
    and not exists(select 1 from public.work_milestones n where n.organization_id=m.organization_id and n.work_id=m.work_id and n.supersedes_milestone_id=m.id)
    order by m.occurred_at desc,m.created_at desc,m.id desc limit 1;
   insert into public.work_milestones(organization_id,work_id,kind,subject_kind,subject_id,label,supersedes_milestone_id,occurred_at)
   values(p_org,p_work,'awaiting_human','work_recompute_candidate',created,'dependency_recompute_authorization',prior_wait,clock_timestamp());
   waiting:=waiting+1;
  else
   scheduled:=scheduled+1;
  end if;
 end loop;

 -- Holds of the open request: new ones recorded with their signal, the ones no longer found released.
 insert into private.dependency_recompute_holds(organization_id,work_id,request_id,execution_id,hold_kind,signal,subject)
 select distinct on (x.execution_id,x.kind,x.signal) p_org,p_work,r.id,x.execution_id,x.kind,x.signal,x.subject
 from (select (h.value->>'executionId')::uuid as execution_id,h.value->>'kind' as kind,h.value->>'signal' as signal,h.value->'subject' as subject
  from jsonb_array_elements(current_holds) h) x
 where not exists(select 1 from private.dependency_recompute_holds o where o.organization_id=p_org and o.request_id=r.id
  and o.execution_id=x.execution_id and o.hold_kind=x.kind and o.signal=x.signal and o.released_at is null)
 order by x.execution_id,x.kind,x.signal,x.subject::text;
 get diagnostics held=row_count;
 update private.dependency_recompute_holds o set released_at=clock_timestamp()
 where o.organization_id=p_org and o.request_id=r.id and o.released_at is null and not exists(select 1 from jsonb_array_elements(current_holds) h
  where (h.value->>'executionId')::uuid=o.execution_id and h.value->>'kind'=o.hold_kind and h.value->>'signal'=o.signal);
 get diagnostics released=row_count;

 -- An open request that plans nothing of its own and holds nothing only repeats changes earlier
 -- requests already cover: it is superseded by the newest request whose candidate covers the
 -- current key of a lineage it touches, or produced the representative that is already up to date.
 if not exists(select 1 from public.work_recompute_candidates x where x.organization_id=p_org and x.work_id=p_work and x.request_id=r.id)
 and not exists(select 1 from private.dependency_recompute_holds h where h.organization_id=p_org and h.request_id=r.id and h.released_at is null) then
  select x.request_id into covering from public.work_recompute_candidates x join jsonb_array_elements(lineages) l on (l.value->>'root')::uuid=any(touched)
   and ((l.value#>>'{assessment,status}'='affected' and x.idempotency_key=l.value#>>'{assessment,key}')
    or (l.value#>>'{assessment,status}'='unaffected' and x.execution_id=(l.value->>'representative')::uuid))
  where x.organization_id=p_org and x.work_id=p_work and x.request_id<>r.id
  order by x.created_at desc,x.id desc limit 1;
  if covering is not null then
   update public.work_continuation_requests set status='superseded',superseded_by_request_id=covering,revision=revision+1 where organization_id=p_org and id=r.id;
  end if;
 end if;

 -- Every request of the work that is still moving takes the status its candidates give it.
 for q in select x.id from public.work_continuation_requests x where x.organization_id=p_org and x.work_id=p_work and x.kind='dependency_update'
  and x.status in ('open','awaiting_authorization','scheduled') order by x.created_at,x.id loop
  perform private.advance_dependency_update_request_v1(p_org,q.id,r.id);
 end loop;
 return jsonb_build_object('workId',p_work,'planned',true,'requestId',r.id,'scheduled',scheduled,'awaitingAuthorization',waiting,'superseded',superseded,'held',held,'released',released);
end $$;

-- The status a request's own candidates and holds give it, against the status machine of 3A:
-- an open request with a hold stays open; any candidate awaiting authorization makes it
-- awaiting_authorization; otherwise any scheduled candidate makes it scheduled; when all are
-- terminal it is superseded (every candidate superseded by newer heads, pointing at p_newer, the
-- open request whose planning superseded them), ready (at least one candidate settled; no decision
-- is written) or declined (none settled: every candidate declined for the requester's authority,
-- failed, or a mix of those with superseded candidates that is not all superseded). A request
-- without candidates of its own (everything reused or covered by an earlier candidate) keeps its
-- status. awaiting_authorization reaches ready through scheduled, the only path the machine allows.
create function private.advance_dependency_update_request_v1(p_org uuid,p_request uuid,p_newer uuid default null) returns text
language plpgsql security definer set search_path='' as $$
declare r public.work_continuation_requests;n record;target text;begin
 select * into r from public.work_continuation_requests where organization_id=p_org and id=p_request for update;
 if r.id is null or r.status not in ('open','awaiting_authorization','scheduled') then return r.status; end if;
 select count(*) as total,count(*) filter(where state='awaiting_authorization') as awaiting,count(*) filter(where state='scheduled') as scheduled,
  count(*) filter(where state='settled') as settled,count(*) filter(where state='declined' and reason<>'superseded') as declined,
  count(*) filter(where state='failed') as failed,count(*) filter(where state='declined' and reason='superseded') as superseded
 into n from public.work_recompute_candidates where organization_id=p_org and work_id=r.work_id and request_id=r.id;
 if n.total=0 then return r.status; end if;
 if r.status='open' and exists(select 1 from private.dependency_recompute_holds h where h.organization_id=p_org and h.request_id=r.id and h.released_at is null) then return r.status; end if;
 target:=case when n.awaiting>0 then 'awaiting_authorization' when n.scheduled>0 then 'scheduled' when n.superseded=n.total then 'superseded'
  when n.settled>0 then 'ready' else 'declined' end;
 if target='superseded' then
  if p_newer is null or p_newer=r.id or not exists(select 1 from public.work_continuation_requests x where x.organization_id=p_org and x.work_id=r.work_id and x.id=p_newer) then
   return r.status;
  end if;
 end if;
 if target=r.status then return r.status; end if;
 if r.status='awaiting_authorization' and target='ready' then
  update public.work_continuation_requests set status='scheduled',revision=revision+1 where organization_id=p_org and id=r.id returning * into r;
 end if;
 if not private.work_continuation_transition_allowed_v1(r.status,target) then return r.status; end if;
 update public.work_continuation_requests set status=target,superseded_by_request_id=case when target='superseded' then p_newer end,revision=revision+1
 where organization_id=p_org and id=r.id;
 return target;
end $$;

-- Every work of the organization with an open dependency-update request, in work order.
create function private.plan_open_dependency_requests_v1(p_org uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w uuid;result jsonb;works integer:=0;scheduled integer:=0;waiting integer:=0;superseded integer:=0;held integer:=0;begin
 for w in select distinct x.work_id from public.work_continuation_requests x where x.organization_id=p_org and x.kind='dependency_update' and x.status='open' order by x.work_id loop
  result:=private.plan_dependency_recompute_v1(p_org,w);
  works:=works+1;scheduled:=scheduled+coalesce((result->>'scheduled')::integer,0);waiting:=waiting+coalesce((result->>'awaitingAuthorization')::integer,0);
  superseded:=superseded+coalesce((result->>'superseded')::integer,0);held:=held+coalesce((result->>'held')::integer,0);
 end loop;
 return jsonb_build_object('works',works,'scheduled',scheduled,'awaitingAuthorization',waiting,'superseded',superseded,'held',held);
end $$;

-- 5. The dependency effect plans after it merges: 3A's effect takes the organization's hold lock
-- before any work lock, so a signal that releases holds serializes with it, and returns the plan.
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.apply_dependency_event_v1(uuid,uuid)'::regprocedure);
 needle:=E' rebuilt:=private.rebuild_incomplete_execution_dependencies_v1(p_org);\n';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'dependency_recompute_effect_contract_changed'; end if;
 body:=replace(body,needle,E' perform pg_advisory_xact_lock_shared(hashtextextended(''dependency-recompute-holds:''||p_org::text,0));\n'||needle);
 needle:=E' return jsonb_build_object(''applied'',true,''rebuilt'',rebuilt,''facts'',facts,''opened'',opened,''merged'',merged);\n';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'dependency_recompute_effect_contract_changed'; end if;
 body:=replace(body,needle,E' return jsonb_build_object(''applied'',true,''rebuilt'',rebuilt,''facts'',facts,''opened'',opened,''merged'',merged,''planned'',private.plan_open_dependency_requests_v1(p_org));\n');
 execute body;
end $patch$;

-- The request names the root of each affected execution from lineage (3A named the execution itself).
do $patch$
declare body text;needle text;
begin
 body:=pg_get_functiondef('private.merge_dependency_update_request_v1(uuid,uuid,uuid,uuid[])'::regprocedure);
 needle:='jsonb_build_object(''executionId'',q.id,''rootExecutionId'',q.id,''resultMilestoneId'',(';
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 then raise exception 'dependency_update_lineage_contract_changed'; end if;
 execute replace(body,needle,'jsonb_build_object(''executionId'',q.id,''rootExecutionId'',coalesce((select l.root_execution_id::text from private.execution_lineage l where l.organization_id=p_org and l.execution_id=q.id::uuid),q.id),''resultMilestoneId'',(');
end $patch$;

-- 6. Settlement. A candidate execution that commits a result settles its candidate; one whose job
-- ends failed, poison or cancelled without a result fails it. The request then takes its status.
-- Both run in the transaction of the commit or of the job change, under the work lock.
create function private.settle_recompute_candidate_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare l private.execution_lineage;c public.work_recompute_candidates;
begin
 select * into l from private.execution_lineage x where x.organization_id=new.organization_id and x.execution_id=new.execution_id;
 if l.id is null then return null; end if;
 if tg_table_name='processing_jobs' and exists(select 1 from private.execution_result_receipts x where x.organization_id=new.organization_id and x.execution_id=new.execution_id) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('work-continuation:'||l.organization_id::text||':'||l.work_id::text,0));
 select * into c from public.work_recompute_candidates x where x.organization_id=l.organization_id and x.id=l.candidate_id for update;
 if c.state<>'scheduled' then return null; end if;
 if tg_table_name='execution_result_receipts' then
  update public.work_recompute_candidates set state='settled',revision=revision+1 where organization_id=c.organization_id and id=c.id;
 else
  update public.work_recompute_candidates set state='failed',reason='execution_'||new.status,revision=revision+1 where organization_id=c.organization_id and id=c.id;
 end if;
 perform private.advance_dependency_update_request_v1(c.organization_id,c.request_id);
 return null;
end $$;
create trigger execution_result_receipts_recompute_settlement after insert on private.execution_result_receipts for each row execute function private.settle_recompute_candidate_v1();
create trigger processing_jobs_recompute_settlement after update of status on public.processing_jobs for each row
 when (new.kind='work_execution' and new.execution_id is not null and new.status in ('failed','poison','cancelled') and old.status is distinct from new.status)
 execute function private.settle_recompute_candidate_v1();

-- 7. Signals that release holds.
-- A platform capability that becomes released and universal, or an execution profile registered
-- for a release, can make the head release of a procedure executable: every organization with an
-- execution of the procedure receives a method_release event, as for a published release.
create function private.capture_method_executable_event_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare org uuid;method text;record_key text;
begin
 if tg_table_name='platform_capability_releases' then
  if not (new.released and new.exposure='universal') then return new; end if;
  if tg_op='UPDATE' and old.released and old.exposure='universal' and old.method_id=new.method_id and old.method_version=new.method_version then return new; end if;
  method:=new.method_id;record_key:=new.capability_key;
 elsif tg_table_name='execution_method_profiles' then
  select r.method_id into method from private.platform_method_releases r where r.id=new.platform_release_id;
  record_key:=new.id::text;
 else
  raise exception 'dependency_event_source_unknown' using errcode='23514';
 end if;
 for org in select distinct m.organization_id from private.execution_manifests m
  join private.platform_method_releases r on r.id=m.platform_release_id
  where r.method_id=method order by m.organization_id loop
  perform private.append_domain_event_v1(gen_random_uuid(),org,'method_release',private.method_procedure_aggregate_v1(method),'changed',
   jsonb_build_object('source',tg_table_name,'record_key',record_key,'methodId',method));
 end loop;
 return new;
end $$;
create trigger platform_capability_releases_dependency_event after insert or update of released,exposure,method_id,method_version on private.platform_capability_releases
 for each row execute function private.capture_method_executable_event_v1();
create trigger execution_method_profiles_dependency_event after insert on private.execution_method_profiles
 for each row execute function private.capture_method_executable_event_v1();

-- A source version that becomes verified, or receives rights, can make a held head bindable. The
-- signal takes the organization's hold lock exclusively, so a planning that is writing a hold on
-- this version finishes first and its hold is seen here, or this row is seen by it; then the works
-- holding on the version are planned again. A failure here never fails the verification or the
-- rights write: the hold stays, and the next dependency event of the organization plans again.
create function private.signal_source_bindable_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare w uuid;
begin
 if not exists(select 1 from private.execution_dependencies d join public.source_versions v on v.organization_id=d.organization_id and v.source_id=d.source_id
  where d.organization_id=new.organization_id and v.id=new.source_version_id) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('dependency-recompute-holds:'||new.organization_id::text,0));
 for w in select distinct h.work_id from private.dependency_recompute_holds h where h.organization_id=new.organization_id and h.released_at is null
  and h.signal='source_bindable:'||new.source_version_id::text order by h.work_id loop
  begin
   perform private.plan_dependency_recompute_v1(new.organization_id,w);
  exception when others then
   raise warning 'dependency_recompute_signal_failed version=% sqlstate=%',new.source_version_id,sqlstate;
  end;
 end loop;
 return null;
end $$;
create trigger source_version_verifications_recompute_signal after insert on private.source_version_verifications for each row execute function private.signal_source_bindable_v1();
create trigger source_rights_versions_recompute_signal after insert on private.source_rights_versions for each row execute function private.signal_source_bindable_v1();

-- 8. The closed worker RPCs. A worker account bound to an active worker token claims a scheduled
-- candidate with a lease, assembles the basis for the original requester at the head inputs,
-- composes in TypeScript and submits; or records the refusal it found before submitting.
create function private.require_recompute_worker_v1(p_worker_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare worker uuid;begin
 perform 1 from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'worker_account_binding_required' using errcode='42501';end if;
 worker:=private.worker_identity(p_worker_token);
 if not exists(select 1 from private.worker_tokens t where t.id=worker and t.execution_account_user_id=auth.uid() and t.status='active' and t.revoked_at is null)
 then raise exception 'worker_account_binding_required' using errcode='42501';end if;
 return worker;
end $$;

-- The candidate under a lease this worker holds, locked after the work lock.
create function private.lock_recompute_lease_v1(p_worker_token text,p_candidate uuid,p_lease uuid,p_capability text) returns public.work_recompute_candidates
language plpgsql security definer set search_path='' as $$
declare worker uuid;c public.work_recompute_candidates;l private.work_recompute_leases;begin
 worker:=private.require_recompute_worker_v1(p_worker_token);
 select * into c from public.work_recompute_candidates where id=p_candidate;
 if c.id is null then raise exception 'recompute_lease_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('work-continuation:'||c.organization_id::text||':'||c.work_id::text,0));
 select * into strict c from public.work_recompute_candidates where organization_id=c.organization_id and id=p_candidate for update;
 select * into l from private.work_recompute_leases where organization_id=c.organization_id and candidate_id=c.id for update;
 if l.lease_id is null or p_lease is null or p_capability is null or length(p_capability)<32 or l.lease_id<>p_lease
 or l.capability_sha256 is distinct from extensions.digest(p_capability,'sha256') or l.leased_by is distinct from worker
 or l.leased_account_user_id is distinct from auth.uid() or l.lease_expires_at<=clock_timestamp() then
  raise exception 'recompute_lease_denied' using errcode='42501';
 end if;
 return c;
end $$;

-- The human who requested the root execution: every recomputation of the lineage runs under them.
create function private.dependency_recompute_requester_v1(p_org uuid,p_root uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select p.user_id from public.work_executions e join private.principals p on p.organization_id=e.organization_id and p.id=e.principal_id and p.kind='human'
 where e.organization_id=p_org and e.id=p_root;
$$;

-- What the root execution was asked: question, objectives and reference date from its input
-- snapshot, situations from its gates receipt, as the capital request records them. Null parts
-- mean the root was not requested through that path.
create function private.dependency_recompute_origin_v1(p_org uuid,p_root uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('methodId',m.payload#>>'{method,methodId}','purpose',m.payload->>'purpose',
  'question',s.payload#>'{decision,review,composition,question}','objectives',s.payload#>'{decision,review,composition,objectives}',
  'asOf',s.payload#>'{decision,review,asOf}','situationIds',(g.canonical_gates::jsonb)#>'{methodSelection,situationIds}')
 from private.execution_manifests m join private.execution_input_snapshots s on s.organization_id=m.organization_id and s.execution_id=m.execution_id
 left join private.execution_gate_receipts g on g.organization_id=m.organization_id and g.execution_id=m.execution_id
 where m.organization_id=p_org and m.execution_id=p_root;
$$;

-- The declined or failed end of a candidate the worker holds, with the request's status after it.
create function private.close_recompute_candidate_v1(p_candidate public.work_recompute_candidates,p_state text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 update public.work_recompute_candidates set state=p_state,reason=p_reason,revision=revision+1 where organization_id=p_candidate.organization_id and id=p_candidate.id;
 return jsonb_build_object('candidateId',p_candidate.id,'state',p_state,'reason',p_reason,'requestStatus',private.advance_dependency_update_request_v1(p_candidate.organization_id,p_candidate.request_id));
end $$;

create function private.worker_claim_dependency_recompute_v1(p_worker_token text,p_lease_seconds integer default 120) returns jsonb
language plpgsql security definer set search_path='' as $$
declare worker uuid;k record;c public.work_recompute_candidates;l private.work_recompute_leases;cap text;lease uuid;t timestamptz;origin jsonb;begin
 worker:=private.require_recompute_worker_v1(p_worker_token);
 for k in select x.id,x.organization_id,x.work_id from public.work_recompute_candidates x
  left join private.work_recompute_leases q on q.organization_id=x.organization_id and q.candidate_id=x.id
  where x.state='scheduled' and x.execution_id is null and (q.lease_expires_at is null or q.lease_expires_at<=clock_timestamp())
  order by x.created_at,x.id limit 16
 loop
  -- The work lock first, as the planner takes it; then the candidate and its lease.
  perform pg_advisory_xact_lock(hashtextextended('work-continuation:'||k.organization_id::text||':'||k.work_id::text,0));
  select * into c from public.work_recompute_candidates where organization_id=k.organization_id and id=k.id for update;
  if c.state<>'scheduled' or c.execution_id is not null then continue; end if;
  insert into private.work_recompute_leases(organization_id,candidate_id) values(c.organization_id,c.id) on conflict do nothing;
  select * into strict l from private.work_recompute_leases where organization_id=c.organization_id and candidate_id=c.id for update;
  t:=clock_timestamp();
  if l.lease_expires_at>t then continue; end if;
  if l.attempts>=l.max_attempts then
   perform private.close_recompute_candidate_v1(c,'failed','recompute_attempts_exhausted');
   continue;
  end if;
  -- Newer heads: the next planning supersedes it; it is never produced for stale heads.
  if not private.dependency_recompute_candidate_current_v1(c.organization_id,c.id) then continue; end if;
  cap:=encode(extensions.gen_random_bytes(32),'hex');lease:=gen_random_uuid();
  update private.work_recompute_leases set lease_id=lease,capability_sha256=extensions.digest(cap,'sha256'),leased_by=worker,leased_account_user_id=auth.uid(),
   lease_expires_at=t+make_interval(secs=>least(greatest(coalesce(p_lease_seconds,120),10),900)),attempts=attempts+1
  where organization_id=c.organization_id and candidate_id=c.id returning * into l;
  origin:=private.dependency_recompute_origin_v1(c.organization_id,c.base_execution_id);
  return jsonb_build_object('claimed',true,'candidateId',c.id,'leaseId',lease,'capability',cap,'attempt',l.attempts,'leaseExpiresAt',l.lease_expires_at,
   'organizationId',c.organization_id,'workId',c.work_id,'requestId',c.request_id,'baseExecutionId',c.base_execution_id,'origin',origin);
 end loop;
 return jsonb_build_object('claimed',false);
end $$;

-- The basis the execution request would assemble for the original requester, at the head
-- revision of the working basis the key names, under the procedure the key names. A requester
-- without current authority declines the candidate; a procedure without one executable profile
-- fails it.
create function private.worker_dependency_recompute_basis_v1(p_worker_token text,p_candidate uuid,p_lease uuid,p_capability text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.work_recompute_candidates;requester uuid;sets uuid[];methods text[];version uuid;begin
 c:=private.lock_recompute_lease_v1(p_worker_token,p_candidate,p_lease,p_capability);
 if c.state<>'scheduled' or c.execution_id is not null then return jsonb_build_object('available',false,'state',c.state,'reason',c.reason); end if;
 sets:=array(select distinct (e.value->>0)::jsonb->>1 from jsonb_array_elements(c.head_inputs->'inputs') e where e.value->>0 like '["assumption\_slot",%')::uuid[];
 methods:=array(select distinct (e.value->>0)::jsonb->>1 from jsonb_array_elements(c.head_inputs->'inputs') e where e.value->>0 like '["method\_release",%');
 if cardinality(sets)<>1 or cardinality(methods)<>1 then return jsonb_build_object('available',false,'state',c.state,'reason','basis_not_pinned'); end if;
 select v.id into version from public.assumption_versions v where v.organization_id=c.organization_id and v.set_id=sets[1] order by v.revision desc limit 1;
 requester:=private.dependency_recompute_requester_v1(c.organization_id,c.base_execution_id);
 begin
  return jsonb_build_object('available',true,'versionId',version,'basis',private.execution_contract_basis_as_subject_v2(requester,c.work_id,version,methods[1]));
 exception when others then
  if sqlerrm in ('execution_subject_required','execution_access_denied','execution_producer_denied','execution_basis_denied') then
   return jsonb_build_object('available',false)||private.close_recompute_candidate_v1(c,'declined','requester_not_authorized:'||sqlerrm);
  elsif sqlerrm in ('execution_method_unavailable','execution_profile_ambiguous') then
   return jsonb_build_object('available',false)||private.close_recompute_candidate_v1(c,'failed',sqlerrm);
  end if;
  raise;
 end;
end $$;

-- The submission: the key is re-checked against the current heads, the execution is requested for
-- the original requester through the v2 producer path (gates, basis registration, producer grant,
-- the single released profile, the request core with the requester's current authority), the new
-- execution must pin the heads of the key, and lineage and the candidate's execution are recorded
-- in the same transaction. A requester without current authority declines the candidate; a gate or
-- pin refusal fails it; a stale contract or budget window is raised for the worker to compose again.
create function private.worker_submit_dependency_recompute_v1(p_worker_token text,p_candidate uuid,p_lease uuid,p_capability text,p_contract_text text,p_snapshot_text text,p_gates_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.work_recompute_candidates;requester uuid;contract jsonb;r jsonb;ex uuid;begin
 c:=private.lock_recompute_lease_v1(p_worker_token,p_candidate,p_lease,p_capability);
 if c.execution_id is not null then return jsonb_build_object('produced',true,'replayed',true,'candidateId',c.id,'executionId',c.execution_id,'state',c.state); end if;
 if c.state<>'scheduled' then return jsonb_build_object('produced',false,'candidateId',c.id,'state',c.state,'reason',c.reason); end if;
 if not private.dependency_recompute_candidate_current_v1(c.organization_id,c.id) then
  return jsonb_build_object('produced',false,'candidateId',c.id,'state',c.state,'reason','heads_moved');
 end if;
 requester:=private.dependency_recompute_requester_v1(c.organization_id,c.base_execution_id);
 begin
  begin
   contract:=private.execution_json_projection_v1(p_contract_text);
  exception when others then raise exception 'recompute_contract_mismatch' using errcode='22023';
  end;
  -- The request id is the candidate: a repeated submission can never create a second execution.
  if contract->>'requestId' is distinct from c.id::text or contract->>'workId' is distinct from c.work_id::text
  or contract->>'organizationId' is distinct from c.organization_id::text then raise exception 'recompute_contract_mismatch' using errcode='22023'; end if;
  r:=private.request_work_execution_producer_as_subject_v2(requester,p_contract_text,p_snapshot_text,p_gates_text);
  if coalesce((r->>'replayed')::boolean,false) then raise exception 'recompute_request_replayed' using errcode='23505'; end if;
  ex:=(r->>'executionId')::uuid;
  if not private.execution_realizes_inputs_v1(c.organization_id,ex,c.head_inputs) then raise exception 'recompute_inputs_not_at_head' using errcode='23514'; end if;
  insert into private.execution_lineage(organization_id,work_id,execution_id,root_execution_id,candidate_id) values(c.organization_id,c.work_id,ex,c.base_execution_id,c.id);
  update public.work_recompute_candidates set execution_id=ex,revision=revision+1 where organization_id=c.organization_id and id=c.id;
  return r||jsonb_build_object('produced',true,'candidateId',c.id,'state','scheduled','requestStatus',private.advance_dependency_update_request_v1(c.organization_id,c.request_id));
 exception when others then
  if sqlerrm in ('execution_subject_required','execution_access_denied','execution_producer_denied','execution_inputs_denied','execution_basis_denied') then
   return jsonb_build_object('produced',false)||private.close_recompute_candidate_v1(c,'declined','requester_not_authorized:'||sqlerrm);
  elsif sqlerrm in ('execution_gates_invalid','execution_gates_blocked','execution_gates_mismatch','execution_method_unavailable','execution_profile_ambiguous',
   'execution_payload_provenance_denied','execution_source_pin_denied','execution_basis_pin_denied','execution_basis_decision_denied','execution_identity_required',
   'execution_input_limit','execution_request_conflict','recompute_contract_mismatch','recompute_request_replayed','recompute_inputs_not_at_head') then
   return jsonb_build_object('produced',false)||private.close_recompute_candidate_v1(c,'failed',sqlerrm);
  end if;
  raise;
 end;
end $$;

-- A refusal the worker found before submitting: a gate that blocks, an origin or basis it cannot
-- compose from. Only named codes are accepted.
create function private.worker_fail_dependency_recompute_v1(p_worker_token text,p_candidate uuid,p_lease uuid,p_capability text,p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.work_recompute_candidates;begin
 c:=private.lock_recompute_lease_v1(p_worker_token,p_candidate,p_lease,p_capability);
 if p_code is null or p_code not in ('company_unregistered','situation_required','situation_unknown','method_not_applicable','selection_invalid','voice_blocked',
  'gates_invalid','method_unavailable','origin_unavailable','basis_unavailable','provenance_denied','composition_failed') then
  raise exception 'recompute_failure_code_invalid' using errcode='22023';
 end if;
 if c.state<>'scheduled' or c.execution_id is not null then return jsonb_build_object('failed',false,'candidateId',c.id,'state',c.state,'reason',c.reason); end if;
 return jsonb_build_object('failed',true)||private.close_recompute_candidate_v1(c,'failed',p_code);
end $$;

create function public.worker_claim_dependency_recompute_v1(p_worker_token text,p_lease_seconds integer default 120) returns jsonb
language sql security invoker set search_path='' as $$ select private.worker_claim_dependency_recompute_v1(p_worker_token,p_lease_seconds); $$;
create function public.worker_dependency_recompute_basis_v1(p_worker_token text,p_candidate uuid,p_lease uuid,p_capability text) returns jsonb
language sql security invoker set search_path='' as $$ select private.worker_dependency_recompute_basis_v1(p_worker_token,p_candidate,p_lease,p_capability); $$;
create function public.worker_submit_dependency_recompute_v1(p_worker_token text,p_candidate uuid,p_lease uuid,p_capability text,p_contract_text text,p_snapshot_text text,p_gates_text text) returns jsonb
language sql security invoker set search_path='' as $$ select private.worker_submit_dependency_recompute_v1(p_worker_token,p_candidate,p_lease,p_capability,p_contract_text,p_snapshot_text,p_gates_text); $$;
create function public.worker_fail_dependency_recompute_v1(p_worker_token text,p_candidate uuid,p_lease uuid,p_capability text,p_code text) returns jsonb
language sql security invoker set search_path='' as $$ select private.worker_fail_dependency_recompute_v1(p_worker_token,p_candidate,p_lease,p_capability,p_code); $$;

-- A worker image that runs the recompute loop requires this capability, so it never boots
-- against a database without these RPCs.
do $patch$
declare body text;needle text:='"provider-resource-retention.v2"]''::jsonb';
begin
 body:=pg_get_functiondef('public.worker_runtime_schema_contract_v1()'::regprocedure);
 if (length(body)-length(replace(body,needle,'')))/length(needle)<>1 or position('dependency-recompute.v1' in body)>0 then raise exception 'dependency_recompute_capability_contract_changed'; end if;
 execute replace(body,needle,'"provider-resource-retention.v2","dependency-recompute.v1"]''::jsonb');
end $patch$;

-- 9. Grants: the worker RPCs to authenticated only, behind the worker binding; everything else
-- created here closed to every API role.
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('assumption_version_readable_as_subject_v1','execution_contract_basis_as_subject_v1','execution_contract_basis_as_subject_v2','request_work_execution_producer_as_subject_v1',
   'request_work_execution_producer_as_subject_v2','continuation_logical_key_v1','continuation_input_identity_v1','dependency_recompute_key_v1',
   'work_recompute_transition_allowed_v1','guard_work_recompute_candidate_v1','guard_work_recompute_lease_v1','validate_execution_lineage_v1','guard_dependency_recompute_hold_v1',
   'execution_is_live_v1','assumption_version_source_refs_v1','source_version_bindable_v1','source_version_descends_from_v1','execution_recompute_assessment_v1',
   'dependency_lineage_representative_v1','dependency_recompute_candidate_current_v1','execution_realizes_inputs_v1','plan_dependency_recompute_v1','advance_dependency_update_request_v1',
   'plan_open_dependency_requests_v1','settle_recompute_candidate_v1','capture_method_executable_event_v1','signal_source_bindable_v1','require_recompute_worker_v1',
   'lock_recompute_lease_v1','dependency_recompute_requester_v1','dependency_recompute_origin_v1','close_recompute_candidate_v1',
   'worker_claim_dependency_recompute_v1','worker_dependency_recompute_basis_v1','worker_submit_dependency_recompute_v1','worker_fail_dependency_recompute_v1'))
 or (n.nspname='public' and p.proname in ('worker_claim_dependency_recompute_v1','worker_dependency_recompute_basis_v1','worker_submit_dependency_recompute_v1','worker_fail_dependency_recompute_v1'))
 loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  if f.proname in ('worker_claim_dependency_recompute_v1','worker_dependency_recompute_basis_v1','worker_submit_dependency_recompute_v1','worker_fail_dependency_recompute_v1') then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
 end loop;
end $$;

comment on table public.work_recompute_candidates is 'Recompute candidates of stage 18: one per organization, work and dependencyRecomputeKey (packages/work-plan/src/continuation.ts), with the root base execution, the head input identity and its fingerprint, the action and the budget of its profile, the executions it covers, the dependency-update request it serves and, once produced, its execution. awaiting_authorization holds a persisted awaiting_human milestone and no job or lease; scheduled is produced by the worker for the original requester; settled when that execution commits a result; declined (requester without authority, or superseded by newer heads) or failed (gate or pin refusal, failed execution). Written only by the planner of the dependency effect, the closed worker RPCs and the settlement triggers. Readable by whoever can read the work; no client insert, update or delete; the state only moves forward.';
comment on column public.work_recompute_candidates.head_inputs is 'continuation-input-identity.v1 of the current heads the key was computed from; new_input_fingerprint is its fingerprint. The produced execution must pin these heads for every input it keeps.';
comment on table private.work_recompute_leases is 'The worker lease on a scheduled candidate: lease id, capability hash, worker token and account, expiry and attempts. Closed to every API role; never returned except the capability to the worker that claimed it.';
comment on table private.execution_lineage is 'Lineage of recomputed executions: the root execution and the candidate, written in the transaction that creates the execution. A recomputation of a recomputation names the root. Immutable; closed to every API role.';
comment on table private.dependency_recompute_holds is 'Affected executions of an open dependency-update request that cannot be recomputed yet, with the signal that releases them: source_version (a newer version of a derived source), assumption_version (a new revision of the working basis), source_bindable (a verification or rights for the new version), method_release (an executable head release). Released once, when a later planning no longer finds the hold. Closed to every API role.';
