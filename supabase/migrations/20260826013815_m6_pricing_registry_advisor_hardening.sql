-- Defense in depth for the platform-owned pricing registry.
--
-- Direct privileges were already revoked and FORCE RLS was already enabled. These explicit deny
-- policies make that intent machine-verifiable, while the covering index keeps approvals from
-- imposing a sequential scan on auth.users lifecycle operations.

create index pricing_policies_approved_by_fk_idx
  on public.pricing_policies (approved_by)
  where approved_by is not null;

create policy "pricing policies are platform only"
  on public.pricing_policies
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "pricing observations are platform only"
  on public.pricing_observations
  for all
  to anon, authenticated
  using (false)
  with check (false);
