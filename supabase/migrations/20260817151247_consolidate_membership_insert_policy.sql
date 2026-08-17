drop policy if exists "memberships_insert_admin"
on public.organization_memberships;

drop policy if exists "memberships_insert_creator_owner"
on public.organization_memberships;

create policy "memberships_insert_authorized"
on public.organization_memberships
for insert
to authenticated
with check (
  (
    (select private.can_manage_organization(organization_id))
    and (
      role <> 'owner'
      or user_id = (select auth.uid())
      or (select private.can_manage_organization(organization_id))
    )
  )
  or (
    user_id = (select auth.uid())
    and role = 'owner'
    and status = 'active'
    and exists (
      select 1
      from public.organizations organization
      where organization.id = organization_memberships.organization_id
        and organization.created_by = (select auth.uid())
    )
  )
);
