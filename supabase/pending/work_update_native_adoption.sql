-- Requires the 3V assessment supplement and installed 3U configuration guard.
-- Only future continuation requests enter this regime. No historical backfill.
set search_path='';
create table private.work_update_native_regimes(
 id uuid not null default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,update_id uuid not null,updated_at timestamptz not null default clock_timestamp(),created_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,update_id),foreign key(organization_id,work_id,update_id) references public.work_continuation_requests(organization_id,work_id,id)
);
create table private.work_update_review_captures(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,update_id uuid not null,
 update_revision integer not null check(update_revision>0),update_payload_fingerprint text not null,
 adopted_milestone_ids uuid[] not null check(cardinality(adopted_milestone_ids)>0),replaced_milestone_ids uuid[] not null,
 basis_fingerprint text not null check(basis_fingerprint~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,update_id,update_revision),
 foreign key(organization_id,work_id,update_id) references public.work_continuation_requests(organization_id,work_id,id)
);
create table private.work_update_milestone_receipts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,capture_id uuid not null,milestone_id uuid not null,
 prepared_by uuid not null references auth.users(id),closure jsonb not null,closure_fingerprint text not null,
 basis_receipt_id uuid not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,capture_id,milestone_id),
 foreign key(organization_id,capture_id) references private.work_update_review_captures(organization_id,id),
 foreign key(organization_id,milestone_id) references public.work_milestones(organization_id,id),
 foreign key(organization_id,basis_receipt_id) references private.review_basis_receipts(organization_id,id),
 check(closure_fingerprint=encode(extensions.digest(closure::text,'sha256'),'hex'))
);
create table private.work_update_review_projections(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,work_id uuid not null,update_id uuid not null,capture_id uuid not null,
 decision_id uuid not null,command_id uuid not null,actor_id uuid not null references auth.users(id),self_approval_declared boolean not null,
 adoption_milestone_id uuid not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,update_id),unique(organization_id,command_id),
 foreign key(organization_id,work_id,update_id) references public.work_continuation_requests(organization_id,work_id,id),
 foreign key(organization_id,capture_id) references private.work_update_review_captures(organization_id,id),
 foreign key(organization_id,decision_id) references public.work_decisions(organization_id,id),
 foreign key(organization_id,adoption_milestone_id) references public.work_milestones(organization_id,id) deferrable initially deferred
);
create function private.mark_native_work_update_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.work_update_native_regimes(organization_id,work_id,update_id) values(new.organization_id,new.work_id,new.id);
 return new;
end $$;
revoke all on function private.mark_native_work_update_v1() from public,anon,authenticated,service_role;
create trigger work_update_native_regime after insert on public.work_continuation_requests for each row execute function private.mark_native_work_update_v1();

create function private.work_update_milestone_closure_v2(p_org uuid,p_work uuid,p_milestone uuid,p_actor uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare m public.work_milestones;closure jsonb;prepared_by uuid;b private.institutional_native_bindings;
begin
 select * into m from public.work_milestones where organization_id=p_org and work_id=p_work and id=p_milestone and kind='execution_result';
 if m.id is null then return null;end if;
 if m.subject_kind='work_execution' then
  closure:=private.execution_result_source_closure_v1(p_org,m.subject_id);
  if closure is null or not private.execution_closure_read_allowed_v1(p_org,closure,p_actor) then return null;end if;
  select p.user_id into prepared_by from public.work_executions e join private.principals p on(p.organization_id,p.id)=(e.organization_id,e.principal_id)
  where e.organization_id=p_org and e.work_id=p_work and e.id=m.subject_id and p.kind='human';
 elsif m.subject_kind='institutional_model_result' then
  select * into b from private.institutional_native_bindings where organization_id=p_org and work_id=p_work and result_id=m.subject_id;
  if b.id is null or not private.institutional_native_read_allowed_v1(p_org,b.revision_id,p_actor) then return null;end if;
  closure:=b.closure;
  select subject_id into prepared_by from private.institutional_input_snapshots where organization_id=p_org and id=b.snapshot_id;
 else return null;end if;
 if prepared_by is null then return null;end if;
 return jsonb_build_object('milestoneId',m.id,'subjectKind',m.subject_kind,'subjectId',m.subject_id,'preparedBy',prepared_by,'closure',closure);
end $$;
revoke all on function private.work_update_milestone_closure_v2(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.work_update_result_set_v2(p_org uuid,p_update uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r public.work_continuation_requests;adopted uuid[];replaced uuid[];link private.work_followup_executions;v_base uuid;
begin
 select * into r from public.work_continuation_requests where organization_id=p_org and id=p_update;
 if r.id is null or r.status<>'ready' then raise exception 'work_update_not_ready' using errcode='55000';end if;
 if r.kind='user_followup' then
  select * into link from private.work_followup_executions l where l.organization_id=p_org and l.request_id=r.id order by l.sequence desc limit 1;
  adopted:=array(select m.id from public.work_milestones m where m.organization_id=p_org and m.work_id=r.work_id and m.kind='execution_result'
   and m.subject_kind='work_execution' and m.subject_id=link.execution_id);
  v_base:=(r.payload#>>'{objective,baseMilestoneId}')::uuid;
  if not exists(select 1 from private.work_continuation_bases_v1(p_org,r.work_id) b where b.milestone_id=v_base) then
   raise exception 'work_continuation_base_superseded' using errcode='40001';end if;
  replaced:=array[v_base];
 else
  adopted:=array(select m.id from public.work_recompute_candidates c join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id
   and m.kind='execution_result' and m.subject_kind='work_execution' and m.subject_id=c.execution_id
   where c.organization_id=p_org and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' order by c.created_at,c.id)
   ||array(select m.id from public.institutional_recompute_candidates c join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id
   and m.kind='execution_result' and m.subject_kind='institutional_model_result' and m.subject_id=c.result_id
   where c.organization_id=p_org and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' order by c.sequence);
  replaced:=array(select x.id from(select distinct on(m.id) m.id,c.created_at,c.id as candidate,e.id as execution
   from public.work_recompute_candidates c cross join unnest(c.execution_ids) e(id)
   join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id and m.kind='execution_result' and m.subject_kind='work_execution' and m.subject_id=e.id
   where c.organization_id=p_org and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' and not(m.id=any(adopted))
   order by m.id,c.created_at,c.id,e.id)x order by x.created_at,x.candidate,x.execution)
   ||array(select x.id from(select distinct on(m.id)m.id,c.sequence,res.position from public.institutional_recompute_candidates c
   cross join unnest(c.result_ids) with ordinality res(id,position) join public.work_milestones m on m.organization_id=c.organization_id and m.work_id=c.work_id
   and m.kind='execution_result' and m.subject_kind='institutional_model_result' and m.subject_id=res.id
   where c.organization_id=p_org and c.work_id=r.work_id and c.request_id=r.id and c.state='settled' and not(m.id=any(adopted))
   order by m.id,c.sequence,res.position)x order by x.sequence,x.position);
 end if;
 if cardinality(adopted)=0 then raise exception 'work_update_result_missing' using errcode='55000';end if;
 return jsonb_build_object('updateId',r.id,'workId',r.work_id,'revision',r.revision,'payloadFingerprint',r.payload_fingerprint,
  'adoptedResults',to_jsonb(adopted),'replacedResults',to_jsonb(replaced));
end $$;
revoke all on function private.work_update_result_set_v2(uuid,uuid) from public,anon,authenticated,service_role;

create function private.work_update_capture_authority_v2(p_org uuid,p_capture uuid,p_actor uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare c private.work_update_review_captures;r private.work_update_milestone_receipts;current_proof jsonb;n integer;
begin
 select * into c from private.work_update_review_captures where organization_id=p_org and id=p_capture;
 if c.id is null then return 'unresolved';end if;
 if not private.resource_access_as_subject_v1(p_org,c.work_id,p_actor,'read') then return 'denied';end if;
 select count(*) into n from private.work_update_milestone_receipts where organization_id=p_org and capture_id=c.id;
 if n<>cardinality(c.adopted_milestone_ids) then return 'unresolved';end if;
 for r in select * from private.work_update_milestone_receipts where organization_id=p_org and capture_id=c.id loop
  if not(r.milestone_id=any(c.adopted_milestone_ids)) then return 'unresolved';end if;
  current_proof:=private.work_update_milestone_closure_v2(p_org,c.work_id,r.milestone_id,p_actor);
  if current_proof is null then return 'denied';end if;
  if current_proof is distinct from r.closure or(current_proof->>'preparedBy')::uuid<>r.prepared_by then return 'unresolved';end if;
 end loop;
 return 'allowed';
end $$;
revoke all on function private.work_update_capture_authority_v2(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.read_work_update_adoption_basis_v2(p_update_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r public.work_continuation_requests;c private.work_update_review_captures;actor uuid:=auth.uid();set_data jsonb;proofs jsonb:='[]';proof jsonb;
 milestone jsonb;mid uuid;versions uuid[];generic_receipt uuid;fp text;prepared uuid[];
begin
 perform 1 from auth.users where id=actor and deleted_at is null and(banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'work_update_review_denied' using errcode='42501';end if;
 select * into r from public.work_continuation_requests where id=p_update_id;
 if r.id is null or not private.can_access_resource_v1(r.organization_id,r.work_id,'read') then raise exception 'work_update_review_denied' using errcode='42501';end if;
 perform 1 from public.capital_projects where organization_id=r.organization_id and id=r.work_id and status<>'archived' for no key update;
 if not found then raise exception 'work_update_review_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('resource-policy:'||r.organization_id::text,0));
 if not exists(select 1 from private.work_update_native_regimes where organization_id=r.organization_id and update_id=r.id) then
  raise exception 'work_update_native_capture_required' using errcode='42501';end if;
 select * into r from public.work_continuation_requests where organization_id=r.organization_id and id=r.id for update;
 select * into c from private.work_update_review_captures where organization_id=r.organization_id and update_id=r.id
  order by update_revision desc limit 1;
 if r.status='adopted' then
  if c.id is null or private.work_update_capture_authority_v2(r.organization_id,c.id,actor)<>'allowed' then
   raise exception 'work_update_basis_denied' using errcode='42501';end if;
 else
  set_data:=private.work_update_result_set_v2(r.organization_id,r.id);
  for milestone in select value from jsonb_array_elements(set_data->'adoptedResults') loop
   mid:=(milestone#>>'{}')::uuid;
   proof:=private.work_update_milestone_closure_v2(r.organization_id,r.work_id,mid,actor);
   if proof is null then raise exception 'work_update_milestone_closure_unproven' using errcode='42501';end if;
   proofs:=proofs||jsonb_build_array(proof);
  end loop;
  fp:=encode(extensions.digest(jsonb_build_object('resultSet',set_data,'proofs',proofs)::text,'sha256'),'hex');
  if c.id is not null and c.update_revision=r.revision then
   if c.basis_fingerprint<>fp then raise exception 'work_update_basis_changed' using errcode='40001';end if;
  else
   insert into private.work_update_review_captures(organization_id,work_id,update_id,update_revision,update_payload_fingerprint,
    adopted_milestone_ids,replaced_milestone_ids,basis_fingerprint)
   values(r.organization_id,r.work_id,r.id,r.revision,r.payload_fingerprint,
    array(select(value#>>'{}')::uuid from jsonb_array_elements(set_data->'adoptedResults')),
    array(select(value#>>'{}')::uuid from jsonb_array_elements(set_data->'replacedResults')),fp) returning * into c;
   for proof in select value from jsonb_array_elements(proofs) loop
    mid:=(proof->>'milestoneId')::uuid;
    select coalesce(array_agg(distinct(value->>'sourceVersionId')::uuid order by(value->>'sourceVersionId')::uuid),'{}'::uuid[]) into versions
    from jsonb_array_elements(proof#>'{closure,sources}');
    generic_receipt:=private.record_review_basis_receipt_v1(r.organization_id,r.work_id,'milestone',jsonb_build_object('milestoneId',mid),versions,'work_milestone');
    insert into private.work_update_milestone_receipts(organization_id,work_id,capture_id,milestone_id,prepared_by,closure,closure_fingerprint,basis_receipt_id)
    values(r.organization_id,r.work_id,c.id,mid,(proof->>'preparedBy')::uuid,proof,encode(extensions.digest(proof::text,'sha256'),'hex'),generic_receipt);
   end loop;
  end if;
  if private.work_update_capture_authority_v2(r.organization_id,c.id,actor)<>'allowed' then raise exception 'work_update_basis_denied' using errcode='42501';end if;
 end if;
 select array_agg(distinct prepared_by order by prepared_by) into prepared from private.work_update_milestone_receipts where organization_id=r.organization_id and capture_id=c.id;
 return jsonb_build_object('updateId',r.id,'workId',r.work_id,'revision',c.update_revision,'basisFingerprint',c.basis_fingerprint,
  'adoptedResults',to_jsonb(c.adopted_milestone_ids),'replacedResults',to_jsonb(c.replaced_milestone_ids),'preparedBy',to_jsonb(prepared),
  'viewerId',actor,'workAccess',private.can_access_resource_v1(r.organization_id,r.work_id,'work'),
  'policy',private.review_policy_snapshot_v1(r.organization_id,r.work_id,actor),'status',r.status);
end $$;
create function public.read_work_update_adoption_basis_v2(p_update_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.read_work_update_adoption_basis_v2(p_update_id);$$;
revoke all on function private.read_work_update_adoption_basis_v2(uuid),public.read_work_update_adoption_basis_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_work_update_adoption_basis_v2(uuid),public.read_work_update_adoption_basis_v2(uuid) to authenticated;

alter function private.adopt_work_update_v1(uuid,uuid,integer) rename to adopt_work_update_before_native_v1;
revoke all on function private.adopt_work_update_before_native_v1(uuid,uuid,integer) from public,anon,authenticated,service_role;
create function private.adopt_work_update_v1(p_command_id uuid,p_update_id uuid,p_expected_revision integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 if exists(select 1 from private.work_update_native_regimes where update_id=p_update_id) then
  raise exception 'work_update_native_command_required' using errcode='42501';end if;
 return private.adopt_work_update_before_native_v1(p_command_id,p_update_id,p_expected_revision);
end $$;
revoke all on function private.adopt_work_update_v1(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function private.adopt_work_update_v1(uuid,uuid,integer) to authenticated;

create function private.adopt_work_update_v2(p_command_id uuid,p_update_id uuid,p_expected_revision integer,p_expected_basis_fingerprint text,p_self_approval_declared boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();r public.work_continuation_requests;c private.work_update_review_captures;existing private.work_update_review_projections;
 dto jsonb;policy jsonb;basis jsonb;decision jsonb;projection_result jsonb;precedence jsonb;mode text;
begin
 if p_command_id is null or p_update_id is null or p_expected_revision is null or p_expected_revision<1
  or p_expected_basis_fingerprint is null or p_expected_basis_fingerprint!~'^[a-f0-9]{64}$' or p_self_approval_declared is null then
  raise exception 'work_update_review_invalid' using errcode='22023';end if;
 dto:=private.read_work_update_adoption_basis_v2(p_update_id);
 select * into strict r from public.work_continuation_requests where id=p_update_id;
 select * into c from private.work_update_review_captures where organization_id=r.organization_id and update_id=r.id and update_revision=p_expected_revision;
 if c.id is null or c.basis_fingerprint<>p_expected_basis_fingerprint then raise exception 'work_update_review_stale' using errcode='40001';end if;
 perform 1 from public.organization_memberships where organization_id=r.organization_id and user_id=actor and status='active' for share nowait;
 if not found then raise exception 'work_update_review_denied' using errcode='42501';end if;
 policy:=private.review_policy_snapshot_v1(r.organization_id,r.work_id,actor);
 if not private.can_access_resource_v1(r.organization_id,r.work_id,'work')
  or ((policy->>'assignmentRequired')::boolean and not(policy->'roles'?'approver'))
  or(not(policy->>'assignmentRequired')::boolean and not private.can_access_resource_v1(r.organization_id,r.work_id,'work')) then
  raise exception 'review_assignment_required' using errcode='42501';end if;
 if exists(select 1 from private.work_update_milestone_receipts where organization_id=r.organization_id and capture_id=c.id and prepared_by=actor)
  and(not(policy->>'selfApprovalAllowed')::boolean or not p_self_approval_declared) then
  raise exception 'capital_project_self_approval_forbidden' using errcode='42501';end if;
 select * into existing from private.work_update_review_projections where organization_id=r.organization_id and command_id=p_command_id;
 if existing.id is not null then
  if(existing.update_id,existing.capture_id,existing.actor_id,existing.self_approval_declared)
   is distinct from(r.id,c.id,actor,p_self_approval_declared) then raise exception 'work_update_review_replay_changed' using errcode='23505';end if;
  precedence:=private.work_decision_precedence_v1(r.organization_id,r.work_id,'update:'||r.id::text);
  if precedence->>'state' is distinct from 'current' or(precedence->>'currentId')::uuid is distinct from existing.decision_id then
   raise exception 'work_update_review_not_effective' using errcode='42501';end if;
  return jsonb_build_object('decisionId',existing.decision_id,'updateId',r.id,'milestoneId',existing.adoption_milestone_id,'replayed',true);
 end if;
 if r.status<>'ready' or r.revision<>p_expected_revision then raise exception 'work_update_review_stale' using errcode='40001';end if;
 basis:=jsonb_build_object('artifacts','[]'::jsonb,'assessments','[]'::jsonb,'decisions','[]'::jsonb,'execution',null,'configuration',null,
  'milestones',(select jsonb_agg(jsonb_build_object('milestoneId',x.id) order by x.position) from unnest(c.adopted_milestone_ids) with ordinality x(id,position)));
 mode:=case when(policy->>'assignmentRequired')::boolean then 'assigned' when(policy->>'selfApprovalAllowed')::boolean then 'individual' else 'open' end;
 -- Adoption changes which existing results are current. It schedules neither
 -- execution nor recomputation; the native projection records that specific effect.
 decision:=private.append_work_decision_v1(r.organization_id,r.work_id,'update:'||r.id::text,'adopt_update',basis,array['none']::text[],'in_product',null,null,
  actor,null,p_command_id,mode,policy,jsonb_build_object('table','work_continuation_requests','id',r.id),p_outcome=>'approved');
 if(decision->>'contested')::boolean then raise exception 'work_update_review_contested' using errcode='40001';end if;
 insert into private.work_update_review_projections(organization_id,work_id,update_id,capture_id,decision_id,command_id,actor_id,self_approval_declared,adoption_milestone_id)
 values(r.organization_id,r.work_id,r.id,c.id,(decision->>'decisionId')::uuid,p_command_id,actor,p_self_approval_declared,
  private.work_command_milestone_id_v1(r.organization_id,p_command_id));
 projection_result:=private.adopt_work_update_before_native_v1(p_command_id,r.id,p_expected_revision);
 if array(select(value#>>'{}')::uuid from jsonb_array_elements(projection_result->'adoptedResults')) is distinct from c.adopted_milestone_ids
  or(projection_result->>'milestoneId')::uuid is distinct from private.work_command_milestone_id_v1(r.organization_id,p_command_id) then
  raise exception 'work_update_projection_changed' using errcode='40001';end if;
 if private.work_update_capture_authority_v2(r.organization_id,c.id,actor)<>'allowed' then raise exception 'work_update_basis_denied' using errcode='42501';end if;
 return projection_result||jsonb_build_object('decisionId',decision->>'decisionId');
end $$;
create function public.adopt_work_update_v2(p_command_id uuid,p_update_id uuid,p_expected_revision integer,p_expected_basis_fingerprint text,p_self_approval_declared boolean)
returns jsonb language sql security invoker set search_path='' as $$select private.adopt_work_update_v2(p_command_id,p_update_id,p_expected_revision,p_expected_basis_fingerprint,p_self_approval_declared);$$;
revoke all on function private.adopt_work_update_v2(uuid,uuid,integer,text,boolean),public.adopt_work_update_v2(uuid,uuid,integer,text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.adopt_work_update_v2(uuid,uuid,integer,text,boolean),public.adopt_work_update_v2(uuid,uuid,integer,text,boolean) to authenticated;

create function private.preserve_native_work_update_adoption_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='adopted' and old.status is distinct from new.status
  and exists(select 1 from private.work_update_native_regimes where organization_id=old.organization_id and update_id=old.id)
  and not exists(select 1 from private.work_update_review_projections p join public.work_decisions d on(d.organization_id,d.id)=(p.organization_id,p.decision_id)
   where p.organization_id=old.organization_id and p.update_id=old.id and p.actor_id=auth.uid() and p.actor_id=d.decided_by
    and d.kind='adopt_update' and d.outcome='approved' and p.work_id=old.work_id) then
  raise exception 'work_update_native_command_required' using errcode='42501';end if;
 return new;
end $$;
revoke all on function private.preserve_native_work_update_adoption_v1() from public,anon,authenticated,service_role;
create trigger work_update_native_adoption_guard before update on public.work_continuation_requests for each row execute function private.preserve_native_work_update_adoption_v1();

-- Extend the generic receipt authority after M07 and 3V's assessment extension.
-- Preserve the installed body rather than re-emitting a historical definition.
alter function private.review_basis_receipt_authority_v1(uuid,uuid,text,jsonb,uuid) rename to review_basis_receipt_authority_before_work_update_v2;
revoke all on function private.review_basis_receipt_authority_before_work_update_v2(uuid,uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
create function private.review_basis_receipt_authority_v1(p_org uuid,p_work uuid,p_kind text,p_ref jsonb,p_actor uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare state text;r private.work_update_milestone_receipts;current_proof jsonb;
begin
 state:=private.review_basis_receipt_authority_before_work_update_v2(p_org,p_work,p_kind,p_ref,p_actor);
 if state='denied' or p_kind<>'milestone' then return state;end if;
 for r in select * from private.work_update_milestone_receipts where organization_id=p_org and work_id=p_work and milestone_id=(p_ref->>'milestoneId')::uuid loop
  current_proof:=private.work_update_milestone_closure_v2(p_org,p_work,r.milestone_id,p_actor);
  if current_proof is null then return 'denied';end if;
  if current_proof is distinct from r.closure then state:='unresolved';end if;
 end loop;
 return state;
end $$;
revoke all on function private.review_basis_receipt_authority_v1(uuid,uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;

do $$declare t text;begin
 foreach t in array array['work_update_native_regimes','work_update_review_captures','work_update_milestone_receipts','work_update_review_projections'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('create policy %I on private.%I for select to authenticated using(false)',t||'_deny_select',t);
  execute format('create policy %I on private.%I for insert to authenticated with check(false)',t||'_deny_insert',t);
  execute format('create policy %I on private.%I for update to authenticated using(false) with check(false)',t||'_deny_update',t);
  execute format('create policy %I on private.%I for delete to authenticated using(false)',t||'_deny_delete',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.reject_review_history_mutation_v1()',t||'_immutable',t);
  execute format('create trigger %I before truncate on private.%I for each statement execute function private.reject_review_history_mutation_v1()',t||'_no_truncate',t);
  execute format('create trigger %I after insert on private.%I for each row execute function private.capture_audit_event()',t||'_audit',t);
 end loop;
end $$;
create index work_update_regime_work_idx on private.work_update_native_regimes(organization_id,work_id);
create index work_update_capture_work_idx on private.work_update_review_captures(organization_id,work_id);
create index work_update_milestone_work_idx on private.work_update_milestone_receipts(organization_id,work_id);
create index work_update_milestone_basis_idx on private.work_update_milestone_receipts(organization_id,basis_receipt_id);
create index work_update_milestone_ref_idx on private.work_update_milestone_receipts(organization_id,milestone_id);
create index work_update_milestone_preparer_idx on private.work_update_milestone_receipts(prepared_by);
create index work_update_projection_work_idx on private.work_update_review_projections(organization_id,work_id);
create index work_update_projection_capture_idx on private.work_update_review_projections(organization_id,capture_id);
create index work_update_projection_decision_idx on private.work_update_review_projections(organization_id,decision_id);
create index work_update_projection_actor_idx on private.work_update_review_projections(actor_id);
create index work_update_projection_milestone_idx on private.work_update_review_projections(organization_id,adoption_milestone_id);
