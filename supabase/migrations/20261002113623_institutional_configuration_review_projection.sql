-- Stage 20 / 3U configuration only. Integrator creates/stamps the forward migration.
-- No historical approval backfill. Brief and imported-workbook capture are separate cuts.
set search_path='';

create table private.institutional_configuration_review_projections (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 work_id uuid not null, configuration_id uuid not null, decision_id uuid not null,
 basis_receipt_id uuid not null, command_id uuid not null, actor_id uuid not null references auth.users(id),
 prepared_by uuid not null references auth.users(id), self_approval_declared boolean not null,
 outcome text not null check(outcome in ('approved','rejected')), locale text not null check(locale in ('pt-BR','en-US')),
 lineage_fingerprint text not null check(lineage_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,configuration_id), unique(organization_id,command_id),
 foreign key(organization_id,work_id) references public.capital_projects(organization_id,id),
 foreign key(organization_id,configuration_id) references private.institutional_model_configurations(organization_id,id),
 foreign key(organization_id,decision_id) references public.work_decisions(organization_id,id),
 foreign key(organization_id,basis_receipt_id) references private.review_basis_receipts(organization_id,id)
);
create index institutional_configuration_review_work_idx on private.institutional_configuration_review_projections(organization_id,work_id);
create index institutional_configuration_review_decision_idx on private.institutional_configuration_review_projections(organization_id,decision_id);
create index institutional_configuration_review_basis_idx on private.institutional_configuration_review_projections(organization_id,basis_receipt_id);
create index institutional_configuration_review_actor_idx on private.institutional_configuration_review_projections(actor_id);
create index institutional_configuration_review_preparer_idx on private.institutional_configuration_review_projections(prepared_by);
alter table private.institutional_configuration_review_projections enable row level security;
alter table private.institutional_configuration_review_projections force row level security;
revoke all on private.institutional_configuration_review_projections from public,anon,authenticated,service_role;
create policy institutional_configuration_review_no_select on private.institutional_configuration_review_projections for select to authenticated using(false);
create policy institutional_configuration_review_no_insert on private.institutional_configuration_review_projections for insert to authenticated with check(false);
create policy institutional_configuration_review_no_update on private.institutional_configuration_review_projections for update to authenticated using(false) with check(false);
create policy institutional_configuration_review_no_delete on private.institutional_configuration_review_projections for delete to authenticated using(false);
create trigger institutional_configuration_review_immutable before update or delete on private.institutional_configuration_review_projections for each row execute function private.reject_review_history_mutation_v1();
create trigger institutional_configuration_review_no_truncate before truncate on private.institutional_configuration_review_projections for each statement execute function private.reject_review_history_mutation_v1();
create trigger institutional_configuration_review_updated before update on private.institutional_configuration_review_projections for each row execute function private.set_updated_at();
create trigger institutional_configuration_review_audit after insert on private.institutional_configuration_review_projections for each row execute function private.capture_audit_event();

-- The stored server marker means a current approved row alone is no longer authority.
create function private.institutional_configuration_review_effective_v1(p_org uuid,p_configuration uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare p private.institutional_configuration_review_projections; d public.work_decisions; current_state jsonb;
begin
 select * into p from private.institutional_configuration_review_projections where organization_id=p_org and configuration_id=p_configuration;
 if p.id is null then return true; end if; -- Unmarked historical regime is not promoted by this cut.
 select * into d from public.work_decisions where organization_id=p_org and id=p.decision_id;
 current_state:=private.work_decision_precedence_v1(p_org,p.work_id,'configuration:'||p.configuration_id::text);
 return d.id is not null and d.work_id=p.work_id and d.kind='approve_configuration' and d.outcome='approved'
  and d.decided_by=p.actor_id and d.command_id=p.command_id and p.outcome='approved'
  and current_state->>'state'='current' and current_state->>'currentId'=d.id::text
  and exists(select 1 from private.review_basis_receipts b where (b.organization_id,b.id,b.work_id)=(p_org,p.basis_receipt_id,p.work_id)
   and b.basis_kind='configuration' and b.basis_reference=d.basis->'configuration'
   and b.source_count=(select count(*) from private.review_basis_source_links l where (l.organization_id,l.receipt_id)=(p_org,b.id)));
end $$;
revoke all on function private.institutional_configuration_review_effective_v1(uuid,uuid) from public,anon,authenticated,service_role;

-- Preserve the latest complete precursor; only append the prospective effect guard.
alter function private.institutional_configuration_ancestry_v1(uuid,uuid,uuid)
 rename to institutional_configuration_ancestry_before_review_projection_v1;
revoke all on function private.institutional_configuration_ancestry_before_review_projection_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function private.institutional_configuration_ancestry_v1(p_org uuid,p_work uuid,p_configuration uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare proof jsonb; node jsonb;
begin
 proof:=private.institutional_configuration_ancestry_before_review_projection_v1(p_org,p_work,p_configuration);
 if proof->>'state' is distinct from 'captured_lineage' then return proof; end if;
 for node in select value from jsonb_array_elements(proof->'nodes') loop
  if not private.institutional_configuration_review_effective_v1(p_org,(node->>'configurationId')::uuid) then
   return jsonb_build_object('state','unresolved','authorization','not_evaluated','reason','configuration_review_not_effective');
  end if;
 end loop;
 return proof;
end $$;
revoke all on function private.institutional_configuration_ancestry_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Presence of prospective capture is a boundary even if its mutable evidence later fails.
-- Never turn a damaged native lineage into eligibility for the historical writer.
create function private.institutional_configuration_requires_native_review_v1(p_org uuid,p_configuration uuid)
returns boolean language sql stable security definer set search_path='' as $$
 with recursive chain(id,work_id,parent_fingerprint) as (
  select id,capital_project_id,parent_fingerprint from private.institutional_model_configurations where organization_id=p_org and id=p_configuration
  union
  select parent.id,parent.capital_project_id,parent.parent_fingerprint from chain child
   join private.institutional_model_configurations parent on parent.organization_id=p_org and parent.capital_project_id=child.work_id and parent.configuration_fingerprint=child.parent_fingerprint
 )
 select exists(select 1 from chain c join private.institutional_configuration_review_projections p on (p.organization_id,p.configuration_id)=(p_org,c.id))
  or exists(select 1 from chain c join private.institutional_model_setup_submissions s on (s.organization_id,s.candidate_id)=(p_org,c.id)
   join private.institutional_setup_input_snapshots x on (x.organization_id,x.submission_id)=(s.organization_id,s.id));
$$;
revoke all on function private.institutional_configuration_requires_native_review_v1(uuid,uuid) from public,anon,authenticated,service_role;

-- A primitive keeps all existing queue/budget/canonical-revision behavior, but has no API grant.
alter function private.review_institutional_configuration_and_calculate_v1(uuid,uuid,text,text,text,uuid,text)
 rename to apply_institutional_configuration_calculation_before_projection_v1;
revoke all on function private.apply_institutional_configuration_calculation_before_projection_v1(uuid,uuid,text,text,text,uuid,text) from public,anon,authenticated,service_role;

create function private.review_institutional_configuration_and_calculate_v1(p_project_id uuid,p_candidate_id uuid,p_expected_parent_fingerprint text,p_decision text,p_expected_candidate_fingerprint text,p_request_id uuid,p_locale text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.institutional_model_configurations; proof jsonb;
begin
 select * into c from private.institutional_model_configurations where id=p_candidate_id and capital_project_id=p_project_id;
 if c.id is null or not private.can_access_capital_project(c.organization_id,p_project_id) then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 proof:=private.institutional_configuration_ancestry_before_review_projection_v1(c.organization_id,p_project_id,c.id);
 if proof->>'state'='captured_lineage' or private.institutional_configuration_requires_native_review_v1(c.organization_id,c.id) then
  raise exception 'institutional_configuration_native_review_required' using errcode='42501';
 end if;
 -- Imported/historical proposal remains in its previous regime until its own producer cut.
 return private.apply_institutional_configuration_calculation_before_projection_v1(p_project_id,p_candidate_id,p_expected_parent_fingerprint,p_decision,p_expected_candidate_fingerprint,p_request_id,p_locale);
end $$;
revoke all on function private.review_institutional_configuration_and_calculate_v1(uuid,uuid,text,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.review_institutional_configuration_and_calculate_v1(uuid,uuid,text,text,text,uuid,text) to authenticated;

-- Also guard approval without calculation; no public v1 path may mutate a captured candidate.
alter function private.review_institutional_configuration_v1(uuid,uuid,text,text,text)
 rename to apply_institutional_configuration_review_before_projection_v1;
revoke all on function private.apply_institutional_configuration_review_before_projection_v1(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
create function private.review_institutional_configuration_v1(p_project_id uuid,p_candidate_id uuid,p_expected_parent_fingerprint text,p_decision text,p_expected_candidate_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.institutional_model_configurations; p private.institutional_configuration_review_projections; proof jsonb;
begin
 select * into c from private.institutional_model_configurations where id=p_candidate_id and capital_project_id=p_project_id;
 if c.id is null or not private.can_access_capital_project(c.organization_id,p_project_id) then raise exception 'institutional_review_forbidden' using errcode='42501';end if;
 proof:=private.institutional_configuration_ancestry_before_review_projection_v1(c.organization_id,p_project_id,c.id);
 select * into p from private.institutional_configuration_review_projections where organization_id=c.organization_id and configuration_id=c.id;
 if proof->>'state'='captured_lineage' or private.institutional_configuration_requires_native_review_v1(c.organization_id,c.id) then
  -- Only the v2 transaction has just inserted an exact server projection while still pending.
  if p.id is null or c.status<>'review_required' or (p.actor_id,p.outcome) is distinct from (auth.uid(),p_decision)
   or not exists(select 1 from public.work_decisions d where (d.organization_id,d.id,d.command_id)=(p.organization_id,p.decision_id,p.command_id)
    and d.outcome=p_decision and d.decided_by=auth.uid()) then raise exception 'institutional_configuration_native_review_required' using errcode='42501';end if;
 end if;
 return private.apply_institutional_configuration_review_before_projection_v1(p_project_id,p_candidate_id,p_expected_parent_fingerprint,p_decision,p_expected_candidate_fingerprint);
end $$;
revoke all on function private.review_institutional_configuration_v1(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.review_institutional_configuration_v1(uuid,uuid,text,text,text) to authenticated;

create function private.review_institutional_configuration_and_calculate_v2(
 p_project_id uuid,p_candidate_id uuid,p_expected_parent_fingerprint text,p_decision text,p_expected_candidate_fingerprint text,
 p_expected_lineage_fingerprint text,p_command_id uuid,p_locale text,p_self_approval_declared boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); org uuid;c private.institutional_model_configurations;p private.institutional_configuration_review_projections;
 proof jsonb;pin jsonb;rights private.source_rights_versions;policy jsonb;mode text;preparer uuid;versions uuid[];basis jsonb;receipt uuid;
 decision jsonb;result jsonb;op text;rows_before integer;rows_after integer;node jsonb;precedence jsonb;
begin
 if p_command_id is null or p_self_approval_declared is null or p_decision is null or p_decision not in ('approved','rejected')
  or p_locale is null or p_locale not in ('pt-BR','en-US') or p_expected_candidate_fingerprint is null or p_expected_candidate_fingerprint !~ '^[a-f0-9]{64}$'
  or p_expected_lineage_fingerprint is null or p_expected_lineage_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'institutional_native_review_invalid' using errcode='22023';end if;
 select organization_id into org from public.capital_projects where id=p_project_id and status<>'archived';
 -- Check before taking a foreign work lock; administrator/member status is not authority.
 if org is null or not private.can_access_resource_v1(org,p_project_id,'read') then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 perform 1 from auth.users where id=actor and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=org and id=p_project_id and status<>'archived' for no key update;
 if not found then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||org::text,0));
 perform 1 from public.organization_memberships where organization_id=org and user_id=actor and status='active' for share nowait;
 if not found or not private.can_access_resource_v1(org,p_project_id,'read') then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 policy:=private.review_policy_snapshot_v1(org,p_project_id,actor);
 if ((policy->>'assignmentRequired')::boolean and not (policy->'roles' ? 'approver' or (p_decision='rejected' and policy->'roles' ? 'reviewer')))
  or (not (policy->>'assignmentRequired')::boolean and not private.can_access_resource_v1(org,p_project_id,'work'))
 then raise exception 'review_assignment_required' using errcode='42501';end if;
 mode:=case when (policy->>'assignmentRequired')::boolean then 'assigned' when (policy->>'selfApprovalAllowed')::boolean then 'individual' else 'open' end;
 select * into c from private.institutional_model_configurations where organization_id=org and capital_project_id=p_project_id and id=p_candidate_id for share nowait;
 if c.id is null or c.configuration_fingerprint is distinct from p_expected_candidate_fingerprint or c.parent_fingerprint is distinct from p_expected_parent_fingerprint then raise exception 'institutional_review_stale' using errcode='40001';end if;
 -- Lock mutable evidence before evaluating the immutable configuration chain.
 perform m.id from public.agent_messages m join private.institutional_contribution_receipts cr on (cr.organization_id,cr.message_id)=(m.organization_id,m.id)
 where cr.organization_id=org and cr.work_id=p_project_id order by m.id for share of m nowait;
 proof:=private.institutional_configuration_ancestry_before_review_projection_v1(org,p_project_id,c.id);
 if proof->>'state' is distinct from 'captured_lineage' then raise exception 'institutional_configuration_capture_required' using errcode='42501';end if;
 for node in select value from jsonb_array_elements(proof->'nodes') loop
  if node->>'configurationId'<>c.id::text and not private.institutional_configuration_review_effective_v1(org,(node->>'configurationId')::uuid)
   then raise exception 'institutional_configuration_ancestor_review_required' using errcode='42501';end if;
 end loop;
 if private.institutional_config_hash(proof) is distinct from p_expected_lineage_fingerprint then raise exception 'institutional_review_lineage_changed' using errcode='40001';end if;
 select coalesce((select author_id from private.institutional_contribution_receipts where organization_id=org and candidate_id=c.id),
  (select submitted_by from private.institutional_model_setup_submissions where organization_id=org and candidate_id=c.id)) into preparer;
 if preparer is null then raise exception 'institutional_review_preparer_unproven' using errcode='42501';end if;
 if p_decision='approved' and preparer=actor and (not (policy->>'selfApprovalAllowed')::boolean or not p_self_approval_declared) then raise exception 'capital_project_self_approval_forbidden' using errcode='42501';end if;
 for pin in select value from jsonb_array_elements(proof->'sources') order by value->>'sourceVersionId',value->>'rightsVersionId' loop
  select rr.* into rights from private.source_rights_versions rr join public.source_versions sv on (sv.organization_id,sv.id)=(rr.organization_id,rr.source_version_id)
   where rr.organization_id=org and rr.id=(pin->>'rightsVersionId')::uuid and rr.source_version_id=(pin->>'sourceVersionId')::uuid and sv.declared_sha256=pin->>'declaredSha256' for share of rr nowait;
  if rights.id is null or not (array['read','process','store','derive']::text[] <@ rights.operations) or not ('analysis'=any(rights.purposes))
   or rights.valid_from>clock_timestamp() or rights.expires_at<=clock_timestamp() or rights.store_until<=clock_timestamp() then raise exception 'institutional_review_source_denied' using errcode='42501';end if;
  foreach op in array array['read','process','store','derive'] loop
   if not private.source_use_allowed_v1(org,rights.source_version_id,actor,op,'analysis') then raise exception 'institutional_review_source_denied' using errcode='42501';end if;
  end loop;
 end loop;
 select * into p from private.institutional_configuration_review_projections where organization_id=org and command_id=p_command_id;
 if p.id is not null then
  if (p.work_id,p.configuration_id,p.actor_id,p.outcome,p.locale,p.self_approval_declared,p.lineage_fingerprint)
   is distinct from (p_project_id,c.id,actor,p_decision,p_locale,p_self_approval_declared,p_expected_lineage_fingerprint) then raise exception 'institutional_native_review_replay_mismatch' using errcode='23505';end if;
  precedence:=private.work_decision_precedence_v1(org,p_project_id,'configuration:'||c.id::text);
  if precedence->>'state'<>'current' or precedence->>'currentId'<>p.decision_id::text then raise exception 'institutional_configuration_review_not_effective' using errcode='42501';end if;
  return jsonb_build_object('candidateId',c.id,'status',p.outcome,'decisionId',p.decision_id,'requestId',p.command_id,'replayed',true);
 end if;
 if c.status<>'review_required' or exists(select 1 from private.institutional_configuration_review_projections where organization_id=org and configuration_id=c.id) then raise exception 'institutional_review_stale' using errcode='40001';end if;
 select coalesce(array_agg(distinct (value->>'sourceVersionId')::uuid order by (value->>'sourceVersionId')::uuid),'{}'::uuid[]) into versions from jsonb_array_elements(proof->'sources');
 basis:=jsonb_build_object('configurationFingerprint',c.configuration_fingerprint,'structureFingerprint',null,'uploadFingerprint',null);
 receipt:=private.record_review_basis_receipt_v1(org,p_project_id,'configuration',basis,versions,'institutional_configuration');
 decision:=private.append_work_decision_v1(org,p_project_id,'configuration:'||c.id::text,'approve_configuration',
  jsonb_build_object('artifacts','[]'::jsonb,'milestones','[]'::jsonb,'assessments','[]'::jsonb,'decisions','[]'::jsonb,'execution',null,'configuration',basis),
  case p_decision when 'approved' then array['recompute']::text[] else array['none']::text[] end,'in_product',null,null,actor,null,p_command_id,mode,policy,
  jsonb_build_object('table','institutional_model_configurations','id',c.id),p_outcome=>p_decision);
 if (decision->>'contested')::boolean then raise exception 'institutional_native_review_contested' using errcode='40001';end if;
 insert into private.institutional_configuration_review_projections(organization_id,work_id,configuration_id,decision_id,basis_receipt_id,command_id,actor_id,prepared_by,self_approval_declared,outcome,locale,lineage_fingerprint)
 values(org,p_project_id,c.id,(decision->>'decisionId')::uuid,receipt,p_command_id,actor,preparer,p_self_approval_declared,p_decision,p_locale,p_expected_lineage_fingerprint);
 select count(*) into rows_before from private.institutional_model_results where organization_id=org and id=p_command_id;
 if rows_before<>0 then raise exception 'institutional_native_review_request_reused' using errcode='23505';end if;
 result:=private.apply_institutional_configuration_calculation_before_projection_v1(p_project_id,c.id,p_expected_parent_fingerprint,p_decision,c.configuration_fingerprint,p_command_id,p_locale);
 select count(*) into rows_after from private.institutional_model_results where organization_id=org and id=p_command_id and configuration_id=c.id and requested_by=actor;
 if rows_after<>(case p_decision when 'approved' then 1 else 0 end) then raise exception 'institutional_native_review_effect_missing' using errcode='23514';end if;
 -- Recheck source access after the queue and canonical projection; exception rolls back everything.
 for pin in select value from jsonb_array_elements(proof->'sources') loop
  foreach op in array array['read','process','store','derive'] loop
   if not private.source_use_allowed_v1(org,(pin->>'sourceVersionId')::uuid,actor,op,'analysis') then raise exception 'institutional_review_source_denied' using errcode='42501';end if;
  end loop;
 end loop;
 return result||jsonb_build_object('decisionId',decision->'decisionId','basisReceiptId',receipt,'lineageFingerprint',p_expected_lineage_fingerprint,'replayed',false);
end $$;
create function public.review_institutional_configuration_and_calculate_v2(p_project_id uuid,p_candidate_id uuid,p_expected_parent_fingerprint text,p_decision text,p_expected_candidate_fingerprint text,p_expected_lineage_fingerprint text,p_command_id uuid,p_locale text,p_self_approval_declared boolean)
returns jsonb language sql security invoker set search_path='' as $$
 select private.review_institutional_configuration_and_calculate_v2(p_project_id,p_candidate_id,p_expected_parent_fingerprint,p_decision,p_expected_candidate_fingerprint,p_expected_lineage_fingerprint,p_command_id,p_locale,p_self_approval_declared);
$$;
revoke all on function private.review_institutional_configuration_and_calculate_v2(uuid,uuid,text,text,text,text,uuid,text,boolean),public.review_institutional_configuration_and_calculate_v2(uuid,uuid,text,text,text,text,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.review_institutional_configuration_and_calculate_v2(uuid,uuid,text,text,text,text,uuid,text,boolean),public.review_institutional_configuration_and_calculate_v2(uuid,uuid,text,text,text,text,uuid,text,boolean) to authenticated;

-- No bounded delegation remains live merely because mutable legacy status says approved.
alter function private.review_execution_authority_current_v1(uuid,uuid,uuid) rename to review_execution_authority_before_configuration_projection_v1;
revoke all on function private.review_execution_authority_before_configuration_projection_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function private.review_execution_authority_current_v1(p_id uuid,p_resource_id uuid,p_subject uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare a private.review_execution_authorizations;
begin
 if not private.review_execution_authority_before_configuration_projection_v1(p_id,p_resource_id,p_subject) then return false;end if;
 select * into a from private.review_execution_authorizations where id=p_id;
 if a.configuration_id is not null and not private.institutional_configuration_review_effective_v1(a.organization_id,a.configuration_id) then return false;end if;
 return true;
end $$;
revoke all on function private.review_execution_authority_current_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.read_institutional_configuration_review_basis_v2(p_project_id uuid,p_candidate_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();org uuid;c private.institutional_model_configurations;proof jsonb;pin jsonb;r private.source_rights_versions;preparer uuid;policy jsonb;node jsonb;p private.institutional_configuration_review_projections;
begin
 select organization_id into org from public.capital_projects where id=p_project_id and status<>'archived';
 if org is null or not private.can_access_resource_v1(org,p_project_id,'read') then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 perform 1 from auth.users where id=actor and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share nowait;
 if not found then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||org::text,0));
 perform 1 from public.organization_memberships where organization_id=org and user_id=actor and status='active' for share nowait;
 if not found or not private.can_access_resource_v1(org,p_project_id,'read') then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 select * into c from private.institutional_model_configurations where organization_id=org and capital_project_id=p_project_id and id=p_candidate_id;
 if c.id is null then raise exception 'institutional_result_forbidden' using errcode='42501';end if;
 -- Internal review keeps a rejected/contested target inspectable; it does not grant execution.
 proof:=private.institutional_configuration_ancestry_before_review_projection_v1(org,p_project_id,c.id);
 if proof->>'state' is distinct from 'captured_lineage' then raise exception 'institutional_configuration_capture_required' using errcode='42501';end if;
 for node in select value from jsonb_array_elements(proof->'nodes') loop
  if node->>'configurationId'<>c.id::text and not private.institutional_configuration_review_effective_v1(org,(node->>'configurationId')::uuid)
   then raise exception 'institutional_configuration_ancestor_review_required' using errcode='42501';end if;
 end loop;
 for pin in select value from jsonb_array_elements(proof->'sources') loop
  select rr.* into r from private.source_rights_versions rr join public.source_versions v on (v.organization_id,v.id)=(rr.organization_id,rr.source_version_id)
   where rr.organization_id=org and rr.id=(pin->>'rightsVersionId')::uuid and rr.source_version_id=(pin->>'sourceVersionId')::uuid and v.declared_sha256=pin->>'declaredSha256';
  if r.id is null or not (array['read','store']::text[] <@ r.operations) or not ('analysis'=any(r.purposes)) or r.valid_from>clock_timestamp()
   or r.expires_at<=clock_timestamp() or r.store_until<=clock_timestamp()
   or not private.source_use_allowed_v1(org,r.source_version_id,actor,'read','analysis')
   or not private.source_use_allowed_v1(org,r.source_version_id,actor,'store','analysis') then raise exception 'institutional_review_source_denied' using errcode='42501';end if;
 end loop;
 select coalesce((select author_id from private.institutional_contribution_receipts where organization_id=org and candidate_id=c.id),
  (select submitted_by from private.institutional_model_setup_submissions where organization_id=org and candidate_id=c.id)) into preparer;
 policy:=private.review_policy_snapshot_v1(org,p_project_id,actor);
 select * into p from private.institutional_configuration_review_projections where organization_id=org and configuration_id=c.id;
 return jsonb_build_object('workId',p_project_id,'candidateId',c.id,'configurationFingerprint',c.configuration_fingerprint,'parentFingerprint',c.parent_fingerprint,
  'lineageFingerprint',private.institutional_config_hash(proof),'preparedBy',preparer,'policy',policy,'status',c.status,'sourceCount',jsonb_array_length(proof->'sources'),
  'nativeDecisionId',p.decision_id,'approvalEffective',p.id is not null and c.status='approved' and private.institutional_configuration_review_effective_v1(org,c.id),
  'viewerId',actor,'workAccess',private.can_access_resource_v1(org,p_project_id,'work'));
end $$;
create function public.read_institutional_configuration_review_basis_v2(p_project_id uuid,p_candidate_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.read_institutional_configuration_review_basis_v2(p_project_id,p_candidate_id);$$;
revoke all on function private.read_institutional_configuration_review_basis_v2(uuid,uuid),public.read_institutional_configuration_review_basis_v2(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_institutional_configuration_review_basis_v2(uuid,uuid),public.read_institutional_configuration_review_basis_v2(uuid,uuid) to authenticated;

-- Old raw reviewer primitive is internal only; all wrappers now carry the prospective guard.
revoke all on function private.review_institutional_configuration_before_sources_v1(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;

-- Existing completed native results also inherit the effective decision, not only source rights.
alter function private.institutional_native_read_allowed_v1(uuid,uuid,uuid) rename to institutional_native_read_before_configuration_projection_v1;
revoke all on function private.institutional_native_read_before_configuration_projection_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function private.institutional_native_read_allowed_v1(p_org uuid,p_revision uuid,p_actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare b private.institutional_native_bindings; config jsonb;proof jsonb;
begin
 if not private.institutional_native_read_before_configuration_projection_v1(p_org,p_revision,p_actor) then return false;end if;
 for b in select * from private.institutional_native_ancestry_v1(p_org,p_revision) loop
  if jsonb_typeof(b.closure->'configurations') is distinct from 'array' then return false;end if;
  for config in select value from jsonb_array_elements(b.closure->'configurations') loop
   proof:=private.institutional_configuration_ancestry_v1(p_org,b.work_id,(config->>'configurationId')::uuid);
   if proof->>'state' is distinct from 'captured_lineage' or private.institutional_config_hash(proof) is distinct from config->>'lineageFingerprint' then return false;end if;
  end loop;
 end loop;
 return true;
end $$;
revoke all on function private.institutional_native_read_allowed_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Validate the same chain before a worker obtains a captured context for computation.
alter function private.worker_load_institutional_model_context_v3(uuid,text) rename to worker_load_institutional_model_context_before_review_projection_v3;
revoke all on function private.worker_load_institutional_model_context_before_review_projection_v3(uuid,text) from public,anon,authenticated,service_role;
create function private.worker_load_institutional_model_context_v3(p_job_id uuid,p_capability_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare answer jsonb;node jsonb;j public.processing_jobs;work uuid;proof jsonb;
begin
 answer:=private.worker_load_institutional_model_context_before_review_projection_v3(p_job_id,p_capability_token);
 j:=private.job_for_capability(p_job_id,p_capability_token);
 select capital_project_id into work from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id;
 for node in select value from jsonb_array_elements(coalesce(answer->'approvedConfigurations','[]'::jsonb)) loop
  proof:=private.institutional_configuration_ancestry_before_review_projection_v1(j.organization_id,work,(node->>'id')::uuid);
  if private.institutional_configuration_requires_native_review_v1(j.organization_id,(node->>'id')::uuid)
   and private.institutional_configuration_ancestry_v1(j.organization_id,work,(node->>'id')::uuid)->>'state' is distinct from 'captured_lineage'
   then raise exception 'institutional_configuration_review_not_effective' using errcode='42501';end if;
 end loop;
 return answer;
end $$;
revoke all on function private.worker_load_institutional_model_context_v3(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.worker_load_institutional_model_context_v3(uuid,text) to authenticated;
