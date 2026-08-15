-- Replace platform defaults with least-privilege Data API grants.

revoke create on schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

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
    execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
  end loop;
end;
$$;

revoke all privileges on all sequences in schema public from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_memberships to authenticated;
grant select, insert, update, delete on public.organization_invites to authenticated;
grant select, insert, update on public.onboarding_progress to authenticated;
grant select, insert, update on public.companies to authenticated;
grant select, insert, update on public.capital_requests to authenticated;
grant select, insert, update on public.opportunities to authenticated;
grant select, insert, update, delete on public.opportunity_assignments to authenticated;
grant select, insert, update on public.authority_evidence to authenticated;
grant select, insert, update on public.source_documents to authenticated;
grant select, insert, update on public.evidence_facts to authenticated;
grant select, insert, update, delete on public.financial_periods to authenticated;
grant select, insert, update, delete on public.financial_line_items to authenticated;
grant select, insert, update on public.calculation_runs to authenticated;
grant select, insert, update, delete on public.structure_scenarios to authenticated;
grant select, insert, update on public.scenario_versions to authenticated;
grant select, insert, update, delete on public.output_artifacts to authenticated;
grant select, insert, update on public.output_versions to authenticated;
grant select, insert, update, delete on public.funds to authenticated;
grant select, insert, update on public.mandate_versions to authenticated;
grant select, insert, update on public.published_opportunity_projections to authenticated;
grant select, insert, update on public.match_runs to authenticated;
grant select, insert, update on public.match_results to authenticated;
grant select, insert, update on public.disclosure_grants to authenticated;
grant select, insert, update on public.access_requests to authenticated;
grant select, insert, update on public.workflow_runs to authenticated;
grant select on public.audit_events to authenticated;

revoke all privileges on table storage.objects from anon;
