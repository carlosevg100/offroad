create policy "memberships_insert_creator_owner"
on public.organization_memberships
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'owner'
  and status = 'active'
  and exists (
    select 1
    from public.organizations organization
    where organization.id = organization_memberships.organization_id
      and organization.created_by = (select auth.uid())
  )
);
