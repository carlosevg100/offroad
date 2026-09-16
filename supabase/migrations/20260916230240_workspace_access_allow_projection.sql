-- A revocation tombstone denies authority; it is never a grant in the legacy admin projection.
create or replace function private.read_workspace_access_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context record;
begin
 select * into context from private.workspace_membership_v1();
 if context.organization_id is null or context.role not in ('owner','admin') then raise exception 'membership_administration_denied' using errcode='42501'; end if;
 return jsonb_build_object(
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(p.full_name,u.email),'email',u.email,'role',m.role,'status',m.status) order by p.full_name,u.email),'[]'::jsonb)
 from public.organization_memberships m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id where m.organization_id=context.organization_id),
 'resources',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.project_name) order by p.project_name),'[]'::jsonb)
 from public.capital_projects p where p.organization_id=context.organization_id and private.can_access_resource_v1(p.organization_id,p.id,'manage')),
 'grants',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'resource_id',g.resource_id,'user_id',g.subject_user_id,'action',g.action,'expires_at',g.expires_at)),'[]'::jsonb)
 from private.resource_access_grants g where g.organization_id=context.organization_id and g.subject_user_id is not null and g.effect='allow' and g.revoked_at is null and (g.expires_at is null or g.expires_at>now()))
 );
end $$;
