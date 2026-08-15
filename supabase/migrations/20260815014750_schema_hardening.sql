-- Harden tenant enforcement and cover every foreign key used by joins/cascades.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'organizations', 'organization_memberships', 'organization_invites',
    'onboarding_progress', 'companies', 'capital_requests', 'opportunities',
    'opportunity_assignments', 'authority_evidence', 'source_documents',
    'evidence_facts', 'financial_periods', 'financial_line_items',
    'calculation_runs', 'structure_scenarios', 'scenario_versions',
    'output_artifacts', 'output_versions', 'funds', 'mandate_versions',
    'published_opportunity_projections', 'match_runs', 'match_results',
    'disclosure_grants', 'access_requests', 'workflow_runs', 'audit_events'
  ]
  loop
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

create index access_requests_requested_by_idx on public.access_requests (requested_by);
create index access_requests_responded_by_idx on public.access_requests (responded_by) where responded_by is not null;
create index access_requests_projection_fk_idx on public.access_requests (source_organization_id, projection_id);
create index audit_events_actor_idx on public.audit_events (actor_user_id) where actor_user_id is not null;
create index authority_evidence_representative_idx on public.authority_evidence (representative_user_id);
create index authority_evidence_verified_by_idx on public.authority_evidence (verified_by) where verified_by is not null;
create index calculation_runs_created_by_idx on public.calculation_runs (created_by);
create index capital_requests_created_by_idx on public.capital_requests (created_by);
create index companies_created_by_idx on public.companies (created_by);
create index disclosure_grants_approved_by_idx on public.disclosure_grants (approved_by) where approved_by is not null;
create index disclosure_grants_created_by_idx on public.disclosure_grants (created_by);
create index disclosure_grants_projection_fk_idx on public.disclosure_grants (organization_id, projection_id);
create index evidence_facts_created_by_idx on public.evidence_facts (created_by);
create index evidence_facts_reviewed_by_idx on public.evidence_facts (reviewed_by) where reviewed_by is not null;
create index financial_line_items_source_fact_idx on public.financial_line_items (organization_id, source_fact_id) where source_fact_id is not null;
create index funds_created_by_idx on public.funds (created_by);
create index mandate_versions_created_by_idx on public.mandate_versions (created_by);
create index match_results_fund_fk_idx on public.match_results (provider_organization_id, fund_id);
create index match_results_mandate_fk_idx on public.match_results (provider_organization_id, mandate_version_id);
create index match_runs_created_by_idx on public.match_runs (created_by);
create index match_runs_scenario_fk_idx on public.match_runs (organization_id, scenario_version_id);
create index onboarding_progress_user_idx on public.onboarding_progress (user_id);
create index opportunities_created_by_idx on public.opportunities (created_by);
create index opportunities_lead_user_idx on public.opportunities (lead_user_id);
create index opportunities_capital_request_fk_idx on public.opportunities (organization_id, capital_request_id);
create index opportunities_company_fk_idx on public.opportunities (organization_id, company_id);
create index opportunity_assignments_assigned_by_idx on public.opportunity_assignments (assigned_by);
create index organization_invites_accepted_by_idx on public.organization_invites (accepted_by) where accepted_by is not null;
create index organization_invites_invited_by_idx on public.organization_invites (invited_by);
create index organizations_created_by_idx on public.organizations (created_by);
create index output_artifacts_created_by_idx on public.output_artifacts (created_by);
create index output_versions_approved_by_idx on public.output_versions (approved_by) where approved_by is not null;
create index published_projections_source_output_idx on public.published_opportunity_projections (organization_id, source_output_version_id) where source_output_version_id is not null;
create index published_projections_approved_by_idx on public.published_opportunity_projections (approved_by) where approved_by is not null;
create index scenario_versions_approved_by_idx on public.scenario_versions (approved_by) where approved_by is not null;
create index scenario_versions_created_by_idx on public.scenario_versions (created_by);
create index source_documents_created_by_idx on public.source_documents (created_by);
create index structure_scenarios_created_by_idx on public.structure_scenarios (created_by);
create index workflow_runs_opportunity_fk_idx on public.workflow_runs (organization_id, opportunity_id) where opportunity_id is not null;
create index workflow_runs_started_by_idx on public.workflow_runs (started_by);

drop policy opportunity_assignments_manage on public.opportunity_assignments;
drop policy opportunity_assignments_select on public.opportunity_assignments;

create policy opportunity_assignments_select on public.opportunity_assignments for select to authenticated
  using (
    (select private.can_manage_organization(organization_id))
    or (select private.can_access_opportunity(organization_id, opportunity_id, 'opportunity.read'))
  );
create policy opportunity_assignments_insert on public.opportunity_assignments for insert to authenticated
  with check ((select private.can_manage_organization(organization_id)) and assigned_by = (select auth.uid()));
create policy opportunity_assignments_update on public.opportunity_assignments for update to authenticated
  using ((select private.can_manage_organization(organization_id)))
  with check ((select private.can_manage_organization(organization_id)));
create policy opportunity_assignments_delete on public.opportunity_assignments for delete to authenticated
  using ((select private.can_manage_organization(organization_id)));

drop policy published_projections_owner_select on public.published_opportunity_projections;
drop policy published_projections_discovery_select on public.published_opportunity_projections;

create policy published_projections_select on public.published_opportunity_projections for select to authenticated
  using (
    (select private.is_org_member(organization_id))
    or (status = 'published' and (expires_at is null or expires_at > now()))
  );

revoke delete on public.scenario_versions from authenticated;
revoke delete on public.output_versions from authenticated;
revoke delete on public.mandate_versions from authenticated;
