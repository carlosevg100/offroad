-- Stage 20 / 3P: content-review regime, compare-and-swap and guarded legacy setters.
-- Intended as one new forward migration after 3O. Existing policy tables/columns
-- and audit/serialization triggers remain unchanged.
create function private.review_policy_projection_v2(p_org uuid,p_work uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with snapshot as (
 select jsonb_build_object('version','organization-review-policy-snapshot.v2',
   'organizationId',p_org,'exists',o.organization_id is not null,
   'selfApprovalAllowed',coalesce(o.self_approval_allowed,false),
   'assignmentRequired',coalesce(o.assignment_required,false),
   'updatedAtEpoch',extract(epoch from o.updated_at)) as organization_snapshot,
   jsonb_build_object('version','project-review-policy-snapshot.v2',
   'organizationId',p_org,'projectId',p_work,'exists',p.id is not null,
   'selfApproval',coalesce(p.self_approval,'inherit'),
   'assignmentRequired',coalesce(p.assignment_required,'inherit'),
   'updatedAtEpoch',extract(epoch from p.updated_at)) as project_snapshot
 from (select 1) anchor
 left join public.organization_review_policies o on o.organization_id=p_org
 left join public.capital_project_review_policies p on p.organization_id=p_org and p.capital_project_id=p_work
 ), flags as (
 select *,coalesce(case project_snapshot->>'assignmentRequired' when 'required' then true when 'not_required' then false end,
   (organization_snapshot->>'assignmentRequired')::boolean) assignment_effective,
 coalesce(case project_snapshot->>'selfApproval' when 'allowed' then true when 'forbidden' then false end,
   (organization_snapshot->>'selfApprovalAllowed')::boolean) self_effective
 from snapshot
 )
 select jsonb_build_object(
 'assignment_required',jsonb_build_object('effective',assignment_effective,'project',project_snapshot->>'assignmentRequired','organization',organization_snapshot->'assignmentRequired'),
 'self_approval',jsonb_build_object('effective',self_effective,'project',project_snapshot->>'selfApproval','organization',organization_snapshot->'selfApprovalAllowed'),
 'regime',case when assignment_effective then 'assigned' when self_effective then 'individual' else 'open' end,
 'policy_fingerprint',encode(extensions.digest(convert_to(jsonb_build_object('organization',organization_snapshot,'project',project_snapshot)::text,'UTF8'),'sha256'),'hex'),
 'organization_policy_fingerprint',encode(extensions.digest(convert_to(organization_snapshot::text,'UTF8'),'sha256'),'hex'))
 from flags;
$$;
revoke all on function private.review_policy_projection_v2(uuid,uuid) from public,anon,authenticated,service_role;

create function private.read_capital_project_review_context_v2(p_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); project public.capital_projects; policy jsonb; member_rows jsonb; member_count bigint;
begin
 if actor is null then raise exception 'authentication_required' using errcode='42501';end if;
 if p_project_id is null then raise exception 'invalid_review_policy' using errcode='22023';end if;
 if not exists(select 1 from auth.users where id=actor and deleted_at is null and (banned_until is null or banned_until<=statement_timestamp()))
 then raise exception 'review_context_access_denied' using errcode='42501';end if;
 select * into project from public.capital_projects where id=p_project_id;
 if not found or not exists(select 1 from public.organization_memberships where organization_id=project.organization_id and user_id=actor and status='active')
  or not private.can_access_capital_project(project.organization_id,project.id)
 then raise exception 'review_context_access_denied' using errcode='42501';end if;
 policy:=private.review_policy_projection_v2(project.organization_id,project.id);
 with eligible as materialized (
 select m.user_id,pr.full_name,u.email,m.role
 from public.organization_memberships m join auth.users u on u.id=m.user_id left join public.profiles pr on pr.id=m.user_id
 where m.organization_id=project.organization_id and m.status='active' and u.deleted_at is null
  and (u.banned_until is null or u.banned_until<=statement_timestamp())
 order by coalesce(pr.full_name,u.email),m.user_id limit 501
 ), visible as (
 select * from eligible order by coalesce(full_name,email),user_id limit 500
 )
 select coalesce(jsonb_agg(jsonb_build_object('user_id',v.user_id,'full_name',v.full_name,'email',v.email,'membership_role',v.role,
 'roles',coalesce((select jsonb_agg(a.review_role order by a.review_role) from public.capital_project_review_assignments a
 where a.organization_id=project.organization_id and a.capital_project_id=project.id and a.user_id=v.user_id),'[]'::jsonb))
 order by coalesce(v.full_name,v.email),v.user_id),'[]'::jsonb),(select count(*) from eligible)
 into member_rows,member_count from visible v;
 return policy||jsonb_build_object('schemaVersion','project-review-context.v2','project_id',project.id,'organization_id',project.organization_id,
 'can_manage',private.can_manage_organization(project.organization_id) and private.can_access_resource_v1(project.organization_id,project.id,'manage'),
 'caller',jsonb_build_object('user_id',actor,'roles',to_jsonb(private.capital_project_review_roles(project.organization_id,project.id,actor))),
 'members',member_rows,'members_truncated',member_count>500);
end $$;
create function public.read_capital_project_review_context_v2(p_project_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.read_capital_project_review_context_v2(p_project_id); $$;
revoke all on function private.read_capital_project_review_context_v2(uuid),public.read_capital_project_review_context_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_capital_project_review_context_v2(uuid),public.read_capital_project_review_context_v2(uuid) to authenticated;

-- Must be called only AFTER resource-policy advisory. No blocking membership wait:
-- product principal revocation already owns advisory before updating membership.
create function private.lock_review_policy_member_v2(p_org uuid,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 begin
  perform 1 from public.organization_memberships where organization_id=p_org and user_id=p_actor and status='active' for share nowait;
 exception when lock_not_available then raise exception 'policy_changed' using errcode='40001';end;
 if not found then raise exception 'capital_project_review_management_denied' using errcode='42501';end if;
end $$;
revoke all on function private.lock_review_policy_member_v2(uuid,uuid) from public,anon,authenticated,service_role;

create function private.set_capital_project_review_policy_v2(p_project_id uuid,p_self_approval text,p_assignment_required text,p_expected_policy_fingerprint text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();project public.capital_projects;policy jsonb;
begin
 if actor is null then raise exception 'authentication_required' using errcode='42501';end if;
 if p_project_id is null or p_self_approval is null or p_self_approval not in('inherit','allowed','forbidden')
  or p_assignment_required is null or p_assignment_required not in('inherit','required','not_required')
  or p_expected_policy_fingerprint is null or p_expected_policy_fingerprint !~ '^[0-9a-f]{64}$'
 then raise exception 'invalid_review_policy' using errcode='22023';end if;
 perform 1 from auth.users where id=actor and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'capital_project_review_management_denied' using errcode='42501';end if;
 -- Preflight uses no foreign project/advisory lock; guard again after locking.
 select * into project from public.capital_projects where id=p_project_id and status<>'archived';
 if not found then raise exception 'capital_project_not_found' using errcode='P0002';end if;
 if not private.can_manage_organization(project.organization_id)
  or not private.can_access_capital_project(project.organization_id,project.id)
  or not private.can_access_resource_v1(project.organization_id,project.id,'manage')
 then raise exception 'capital_project_review_management_denied' using errcode='42501';end if;
 select * into project from public.capital_projects where id=p_project_id and organization_id=project.organization_id and status<>'archived' for no key update;
 if not found then raise exception 'capital_project_not_found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||project.organization_id::text,0));
 perform private.lock_review_policy_member_v2(project.organization_id,actor);
 if not private.can_manage_organization(project.organization_id) or not private.can_access_capital_project(project.organization_id,project.id) or not private.can_access_resource_v1(project.organization_id,project.id,'manage')
 then raise exception 'capital_project_review_management_denied' using errcode='42501';end if;
 policy:=private.review_policy_projection_v2(project.organization_id,project.id);
 if p_expected_policy_fingerprint is distinct from policy->>'policy_fingerprint' then raise exception 'policy_changed' using errcode='40001';end if;
 insert into public.capital_project_review_policies(organization_id,capital_project_id,self_approval,assignment_required,updated_by)
 values(project.organization_id,project.id,p_self_approval,p_assignment_required,actor)
 on conflict(organization_id,capital_project_id) do update set self_approval=excluded.self_approval,assignment_required=excluded.assignment_required,updated_by=excluded.updated_by;
 policy:=private.review_policy_projection_v2(project.organization_id,project.id);
 return (policy-'regime')||jsonb_build_object('schemaVersion','project-review-policy-write.v2','project_id',project.id,'organization_id',project.organization_id);
end $$;
create function public.set_capital_project_review_policy_v2(p_project_id uuid,p_self_approval text,p_assignment_required text,p_expected_policy_fingerprint text) returns jsonb
language sql security invoker set search_path='' as $$ select private.set_capital_project_review_policy_v2(p_project_id,p_self_approval,p_assignment_required,p_expected_policy_fingerprint); $$;
revoke all on function private.set_capital_project_review_policy_v2(uuid,text,text,text),public.set_capital_project_review_policy_v2(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.set_capital_project_review_policy_v2(uuid,text,text,text),public.set_capital_project_review_policy_v2(uuid,text,text,text) to authenticated;

create function private.set_organization_review_policy_v2(p_organization_id uuid,p_self_approval_allowed boolean,p_assignment_required boolean,p_expected_policy_fingerprint text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();policy jsonb;
begin
 if actor is null then raise exception 'authentication_required' using errcode='42501';end if;
 if p_organization_id is null or p_self_approval_allowed is null or p_assignment_required is null
  or p_expected_policy_fingerprint is null or p_expected_policy_fingerprint !~ '^[0-9a-f]{64}$'
 then raise exception 'invalid_review_policy' using errcode='22023';end if;
 perform 1 from auth.users where id=actor and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'capital_project_review_management_denied' using errcode='42501';end if;
 if not private.can_manage_organization(p_organization_id) then raise exception 'capital_project_review_management_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||p_organization_id::text,0));
 perform private.lock_review_policy_member_v2(p_organization_id,actor);
 if not private.can_manage_organization(p_organization_id) then raise exception 'capital_project_review_management_denied' using errcode='42501';end if;
 policy:=private.review_policy_projection_v2(p_organization_id,null);
 if p_expected_policy_fingerprint is distinct from policy->>'organization_policy_fingerprint' then raise exception 'policy_changed' using errcode='40001';end if;
 insert into public.organization_review_policies(organization_id,self_approval_allowed,assignment_required,updated_by)
 values(p_organization_id,p_self_approval_allowed,p_assignment_required,actor)
 on conflict(organization_id) do update set self_approval_allowed=excluded.self_approval_allowed,assignment_required=excluded.assignment_required,updated_by=excluded.updated_by;
 policy:=private.review_policy_projection_v2(p_organization_id,null);
 return jsonb_build_object('schemaVersion','organization-review-policy-write.v2','organization_id',p_organization_id,
 'self_approval_allowed',p_self_approval_allowed,'assignment_required',p_assignment_required,'policy_fingerprint',policy->>'organization_policy_fingerprint');
end $$;
create function public.set_organization_review_policy_v2(p_organization_id uuid,p_self_approval_allowed boolean,p_assignment_required boolean,p_expected_policy_fingerprint text) returns jsonb
language sql security invoker set search_path='' as $$ select private.set_organization_review_policy_v2(p_organization_id,p_self_approval_allowed,p_assignment_required,p_expected_policy_fingerprint); $$;
revoke all on function private.set_organization_review_policy_v2(uuid,boolean,boolean,text),public.set_organization_review_policy_v2(uuid,boolean,boolean,text) from public,anon,authenticated,service_role;
grant execute on function private.set_organization_review_policy_v2(uuid,boolean,boolean,text),public.set_organization_review_policy_v2(uuid,boolean,boolean,text) to authenticated;

-- V1 preserves signatures/shapes and legitimate authority. Valid-human guard
-- closes the organization gap; project READ+MANAGE are rechecked after advisory.
-- Existing assignment_v1 already has LRA MANAGE guard; do not redefine it here.
create or replace function private.set_capital_project_review_policy_v1(p_project_id uuid,p_self_approval text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();project public.capital_projects;
begin
 if actor is null then raise exception 'authentication_required' using errcode='42501';end if;
 if p_self_approval not in('inherit','allowed','forbidden') then raise exception 'invalid_review_policy' using errcode='22023';end if;
 perform 1 from auth.users where id=actor and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'capital_project_review_management_denied' using errcode='42501';end if;
 -- Preserve legacy not-found response for missing, archived or unreadable project,
 -- but never let a READ-only caller wait on a project row before MANAGE is checked.
 select * into project from public.capital_projects p where p.id=p_project_id and p.status<>'archived' and private.can_access_capital_project(p.organization_id,p.id);
 if not found then raise exception 'capital_project_not_found' using errcode='P0002';end if;
 if not private.can_manage_organization(project.organization_id)
  or not private.can_access_resource_v1(project.organization_id,project.id,'manage')
 then raise exception 'capital_project_review_management_denied' using errcode='42501';end if;
 select * into project from public.capital_projects p where p.id=p_project_id and p.organization_id=project.organization_id and p.status<>'archived' for no key update;
 if not found then raise exception 'capital_project_not_found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||project.organization_id::text,0));
 perform private.lock_review_policy_member_v2(project.organization_id,actor);
 if not private.can_manage_organization(project.organization_id)
  or not private.can_access_capital_project(project.organization_id,project.id)
  or not private.can_access_resource_v1(project.organization_id,project.id,'manage') then raise exception 'capital_project_review_management_denied' using errcode='42501';end if;
 insert into public.capital_project_review_policies(organization_id,capital_project_id,self_approval,updated_by)
 values(project.organization_id,project.id,p_self_approval,actor)
 on conflict(organization_id,capital_project_id) do update set self_approval=excluded.self_approval,updated_by=excluded.updated_by;
 return jsonb_build_object('project_id',project.id,'self_approval',p_self_approval,'effective',private.capital_project_self_approval_allowed(project.organization_id,project.id));
end $$;
create or replace function private.set_organization_review_policy_v1(p_organization_id uuid,p_self_approval_allowed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null then raise exception 'authentication_required' using errcode='42501';end if;
 if p_organization_id is null or p_self_approval_allowed is null then raise exception 'invalid_review_policy' using errcode='22023';end if;
 perform 1 from auth.users where id=actor and deleted_at is null and (banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception 'capital_project_review_management_denied' using errcode='42501';end if;
 if not private.can_manage_organization(p_organization_id) then raise exception 'capital_project_review_management_denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||p_organization_id::text,0));
 perform private.lock_review_policy_member_v2(p_organization_id,actor);
 if not private.can_manage_organization(p_organization_id) then raise exception 'capital_project_review_management_denied' using errcode='42501';end if;
 insert into public.organization_review_policies(organization_id,self_approval_allowed,updated_by) values(p_organization_id,p_self_approval_allowed,actor)
 on conflict(organization_id) do update set self_approval_allowed=excluded.self_approval_allowed,updated_by=excluded.updated_by;
 return jsonb_build_object('organization_id',p_organization_id,'self_approval_allowed',p_self_approval_allowed);
end $$;
