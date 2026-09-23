CREATE OR REPLACE FUNCTION private.set_resource_policy_grant_v1(p_resource_id uuid, p_user_id uuid, p_group_id uuid, p_action text, p_effect text, p_enabled boolean DEFAULT true, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org uuid:=private.policy_admin_context_v1(); root uuid; result uuid;
begin
 if num_nonnulls(p_user_id,p_group_id)<>1 or p_action is null or p_action not in ('read','work','manage','publish') or p_effect is null or p_effect not in ('allow','deny') or p_enabled is null or (p_expires_at is not null and p_expires_at<=now()) then raise exception 'policy_command_invalid' using errcode='22023'; end if;
 if p_action='publish' and not exists(select 1 from private.access_resources where organization_id=org and id=p_resource_id and resource_kind in ('vault_scope','vault_entry')) then raise exception 'vault_publisher_scope_invalid' using errcode='22023';end if;
 root:=private.resource_root_v1(org,p_resource_id);
 if root is null or (p_group_id is not null and not exists(select 1 from private.access_groups where organization_id=org and id=p_group_id)) or (p_user_id is not null and not exists(select 1 from private.principals p join public.organization_memberships m on m.organization_id=p.organization_id and m.user_id=p.user_id where p.organization_id=org and p.user_id=p_user_id and p.revoked_at is null and m.status='active')) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 if p_user_id is not null then
  insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,effect,granted_by,grant_basis,expires_at,revoked_at)
  values(org,p_resource_id,p_user_id,p_action,p_effect,auth.uid(),'explicit',p_expires_at,case when not p_enabled then now() end)
  on conflict(organization_id,resource_id,subject_user_id,subject_role,action) where subject_group_id is null do update set effect=excluded.effect,grant_basis='explicit',granted_by=excluded.granted_by,valid_from=now(),expires_at=excluded.expires_at,revoked_at=excluded.revoked_at,revoked_by=null returning id into result;
 else
  insert into private.resource_access_grants(organization_id,resource_id,subject_group_id,action,effect,granted_by,grant_basis,expires_at,revoked_at)
  values(org,p_resource_id,p_group_id,p_action,p_effect,auth.uid(),'explicit',p_expires_at,case when not p_enabled then now() end)
  on conflict(organization_id,resource_id,subject_group_id,action) where subject_group_id is not null do update set effect=excluded.effect,grant_basis='explicit',granted_by=excluded.granted_by,valid_from=now(),expires_at=excluded.expires_at,revoked_at=excluded.revoked_at,revoked_by=null returning id into result;
 end if;
 perform private.policy_invalidate_jobs_v1(org);return result;
end $function$
