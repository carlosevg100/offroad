-- Make the service-only policy explicit and cover every M8 foreign key used by
-- authorization, audit and qualified-introduction lookups.

create policy market_distribution_policies_service_only
on public.market_distribution_policies
for all
to authenticated
using (false)
with check (false);

create index market_distribution_policies_approved_by_fk_idx
  on public.market_distribution_policies (approved_by);

create index qualified_introduction_plans_technical_reviewed_by_fk_idx
  on public.qualified_introduction_plans (technical_reviewed_by);
create index qualified_introduction_plans_authorized_by_fk_idx
  on public.qualified_introduction_plans (authorized_by);
create index qualified_introduction_plans_revoked_by_fk_idx
  on public.qualified_introduction_plans (revoked_by);
create index qualified_introduction_plans_created_by_fk_idx
  on public.qualified_introduction_plans (created_by);

create index qualified_introduction_recipients_session_fk_idx
  on public.qualified_introduction_recipients (organization_id, intake_session_id);
create index qualified_introduction_recipients_fund_directory_fk_idx
  on public.qualified_introduction_recipients (fund_directory_id);

create index qualified_introductions_plan_fk_idx
  on public.qualified_introductions (organization_id, plan_id);
create index qualified_introductions_fund_directory_fk_idx
  on public.qualified_introductions (fund_directory_id);
create index qualified_introductions_introduced_by_fk_idx
  on public.qualified_introductions (introduced_by);
