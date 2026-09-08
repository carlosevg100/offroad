-- These platform-only ledgers already have FORCE RLS and no direct tenant grants.
-- Make their intentional default-deny boundary explicit for auditing. Restrictive
-- policies cannot be overridden by a future permissive tenant policy. No grants,
-- service-role access or capability-controlled writer functions change here.
create policy platform_capability_accreditations_deny_clients
  on private.platform_capability_accreditations
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy human_intervention_ledger_deny_clients
  on private.human_intervention_ledger
  as restrictive for all to anon, authenticated
  using (false) with check (false);
