CREATE OR REPLACE FUNCTION private.evaluate_resource_policy_v1(p_org uuid, p_resource uuid, p_subject uuid, p_action text, p_purpose text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare root uuid; principal uuid; groups uuid[]; allowed boolean;
begin
 if p_subject is null or p_action is null or p_action not in ('read','work','manage','publish') or p_purpose is null or p_purpose not in ('analysis','retrieval','publication','export') then return false; end if;
 select p.id into principal from private.principals p join auth.users u on u.id=p.user_id
 join public.organization_memberships m on m.organization_id=p.organization_id and m.user_id=p.user_id
 where p.organization_id=p_org and p.user_id=p_subject and p.kind='human' and p.revoked_at is null and m.status='active'
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp());
 if principal is null then return false; end if;
 if p_action='publish' and not exists(select 1 from private.access_resources where organization_id=p_org and id=p_resource and resource_kind in ('vault_scope','vault_entry')) then return false;end if;
 root:=private.resource_root_v1(p_org,p_resource); if root is null then return false; end if;
 -- Both the child and root can narrow purposes. Missing resources never grant authority.
 if exists(select 1 from private.access_resources where organization_id=p_org and id in (root,p_resource) and not(p_purpose=any(allowed_purposes))) then return false; end if;
 select coalesce(array_agg(id),'{}'::uuid[]) into groups from private.policy_group_ids_v1(p_org,principal) id;
 -- Role grants administer relationships through the separate administrative command only.
 -- They never satisfy content actions, including destructive legacy 'manage' paths.
 select coalesce(bool_or(g.effect='allow'),false) and not coalesce(bool_or(g.effect='deny'),false) into allowed
 from private.resource_access_grants g
 where g.organization_id=p_org and g.resource_id in (root,p_resource) and (g.subject_user_id=p_subject or g.subject_group_id=any(groups))
 and (g.action=p_action or (g.action='manage' and p_action<>'publish') or (p_action='read' and g.action='work'))
 and g.revoked_at is null and g.valid_from<=clock_timestamp() and (g.expires_at is null or g.expires_at>clock_timestamp());
 if not allowed then return false; end if;
 -- All barriers must pass; an explicit deny dominates every allow and every group.
 if exists(
  select 1 from private.information_barriers b where b.organization_id=p_org and b.resource_id in(root,p_resource) and b.enabled and (
   not exists(select 1 from private.barrier_memberships m where m.organization_id=p_org and m.barrier_id=b.id and m.effect='allow'
    and (m.principal_id=principal or m.group_id=any(groups)) and m.revoked_at is null and m.valid_from<=clock_timestamp() and (m.expires_at is null or m.expires_at>clock_timestamp()))
   or exists(select 1 from private.barrier_memberships m where m.organization_id=p_org and m.barrier_id=b.id and m.effect='deny'
    and (m.principal_id=principal or m.group_id=any(groups)) and m.revoked_at is null and m.valid_from<=clock_timestamp() and (m.expires_at is null or m.expires_at>clock_timestamp()))
  )) then return false; end if;
 return true;
end $function$
