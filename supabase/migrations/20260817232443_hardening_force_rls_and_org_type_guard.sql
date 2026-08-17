-- Hardening: close three gaps found in the 18 Aug 2026 review.
--
-- 1. FORCE ROW LEVEL SECURITY was missing on the three document-first intake tables
--    (every other public table already has it). Table owners must be subject to RLS too.
-- 2. Any authenticated user could create — or promote their own organization to — the
--    privileged `organization_type = 'offroad'`, which is present in every
--    private.is_org_type_member() allowlist. Self-service organizations may only be
--    company / originator / capital_provider. Internal `offroad` organizations are created
--    by migrations or privileged tooling, never through the Data API as `authenticated`.
-- 3. Document intake sessions could be started by members of capital-provider organizations
--    (the journey check only constrained the label, not the tenant type). Align the insert
--    policy with the borrower-side write gates used by companies / capital_requests /
--    opportunities.

-- 1. FORCE RLS on intake tables -----------------------------------------------------------

alter table public.document_intake_sessions force row level security;
alter table public.intake_field_candidates force row level security;
alter table public.intake_issues force row level security;

-- 2. Organization type guard --------------------------------------------------------------

drop policy if exists organizations_insert_creator on public.organizations;
create policy organizations_insert_creator on public.organizations for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and organization_type in ('company', 'originator', 'capital_provider')
  );

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin on public.organizations for update to authenticated
  using ((select private.can_manage_organization(id)))
  with check (
    (select private.can_manage_organization(id))
    and organization_type in ('company', 'originator', 'capital_provider')
  );

comment on policy organizations_insert_creator on public.organizations is
  'Self-service organizations are limited to company/originator/capital_provider; the internal offroad type is never created through the Data API.';
comment on policy organizations_update_admin on public.organizations is
  'Owners/admins may edit their organization but cannot promote it to the internal offroad type.';

-- 3. Intake sessions: borrower-side tenants only -----------------------------------------

drop policy if exists document_intake_sessions_insert on public.document_intake_sessions;
create policy document_intake_sessions_insert on public.document_intake_sessions for insert to authenticated
  with check (
    (select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad']))
    and started_by = (select auth.uid())
  );
