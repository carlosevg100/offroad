-- Matching is provider-agnostic. Preserve the provider class alongside each governed
-- mandate so the workspace can distinguish FIDCs, funds, banks, factors and other
-- lenders without changing the mandate arithmetic or exposing contact data.

create or replace function private.worker_load_match_provider_context(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  context jsonb;
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider_id', provider.provider_id,
    'provider_kind', provider.provider_kind
  ) order by provider.provider_id), '[]'::jsonb)
  into context
  from (
    select directory.id::text as provider_id, directory.kind as provider_kind
    from public.fund_directory directory
    where directory.status not in ('declined', 'inactive')

    union all

    select fund.id::text as provider_id,
      case organization.provider_type
        when 'fidc_manager' then 'fidc'
        when 'fund_manager' then 'credit_fund'
        when 'factor' then 'factoring'
        when 'bank' then 'bank'
        when 'family_office' then 'family_office'
        when 'alternative_lender' then 'alternative_lender'
        else 'other'
      end as provider_kind
    from public.mandate_versions mandate
    join public.funds fund
      on fund.organization_id = mandate.organization_id
     and fund.id = mandate.fund_id
    join public.organizations organization on organization.id = mandate.organization_id
    where mandate.status = 'active'
      and fund.status = 'active'
      and mandate.valid_from <= current_date
      and (mandate.valid_until is null or mandate.valid_until >= current_date)
  ) provider;

  return context;
end;
$$;

revoke all on function private.worker_load_match_provider_context(uuid, text)
  from public, anon;
grant execute on function private.worker_load_match_provider_context(uuid, text)
  to authenticated;

create or replace function public.worker_load_case_input(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_case_input(p_job_id, p_capability_token)
    || jsonb_build_object('pricing_context', private.worker_load_pricing_context(p_job_id, p_capability_token))
    || jsonb_build_object('market_distribution_context', private.worker_load_market_distribution_context(p_job_id, p_capability_token))
    || jsonb_build_object('red_flag_context', private.worker_load_red_flag_context(p_job_id, p_capability_token))
    || jsonb_build_object('conduct_context', private.worker_load_conduct_context(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_evidence', private.worker_load_receivables_evidence(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_provider_context', private.worker_load_receivables_provider_context(p_job_id, p_capability_token))
    || jsonb_build_object('deal_workflow', private.worker_load_deal_workflow_state(p_job_id, p_capability_token))
    || jsonb_build_object('deal_state_context', private.worker_load_deal_state_context(p_job_id, p_capability_token))
    || jsonb_build_object('match_provider_context', private.worker_load_match_provider_context(p_job_id, p_capability_token));
$$;

revoke all on function public.worker_load_case_input(uuid, text)
  from public, anon;
grant execute on function public.worker_load_case_input(uuid, text)
  to authenticated;
