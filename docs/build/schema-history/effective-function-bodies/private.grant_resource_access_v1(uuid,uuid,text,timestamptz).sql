CREATE OR REPLACE FUNCTION private.grant_resource_access_v1(p_resource_id uuid, p_subject_user_id uuid, p_action text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r private.access_resources; result uuid; caller uuid := auth.uid(); root_id uuid;
begin
 select * into r from private.access_resources where id=p_resource_id;
 if r.id is null or not (private.can_access_resource_v1(r.organization_id,r.id,'manage') or private.can_admin_resource_policy_v1(r.organization_id,r.id)) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 if p_action not in ('read','work','manage') or p_action is null or (p_expires_at is not null and p_expires_at<=now()) then raise exception 'resource_grant_invalid' using errcode='22023'; end if;
 if not exists(select 1 from public.organization_memberships where organization_id=r.organization_id and user_id=p_subject_user_id and status='active') then raise exception 'resource_subject_inactive' using errcode='42501'; end if;
 root_id := coalesce(r.parent_resource_id,r.id);
 perform pg_advisory_xact_lock(hashtextextended('resource-policy:'||r.organization_id::text,0));
 if not (private.can_access_resource_v1(r.organization_id,r.id,'manage') or private.can_admin_resource_policy_v1(r.organization_id,r.id)) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 if exists(select 1 from private.resource_access_grants where organization_id=r.organization_id and resource_id=root_id and subject_user_id=p_subject_user_id and action=p_action and effect='deny' and grant_basis='explicit' and revoked_at is null) then raise exception 'resource_access_denied' using errcode='42501'; end if;
 update private.resource_access_grants set revoked_at=now(),revoked_by=auth.uid() where organization_id=r.organization_id and resource_id=root_id and subject_user_id=p_subject_user_id and effect='deny' and grant_basis='explicit_revocation' and revoked_at is null;
 perform private.advance_authorization_revision_v1(r.organization_id,root_id,p_subject_user_id);
 insert into private.resource_access_grants(organization_id,resource_id,subject_user_id,action,granted_by,grant_basis,expires_at)
 values(r.organization_id,root_id,p_subject_user_id,p_action,caller,'explicit',p_expires_at)
 on conflict(organization_id,resource_id,subject_user_id,subject_role,action) where subject_group_id is null do update set
 effect='allow',granted_by=caller,grant_basis='explicit',valid_from=now(),expires_at=p_expires_at,revoked_at=null,revoked_by=null,updated_at=now()
 returning id into result;
 return result;
end $function$
