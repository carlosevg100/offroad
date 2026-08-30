-- A matching candidate must retain the concrete market record that produced it. Directory
-- providers and funds registered in a provider organization are both valid, but they have
-- different contact and authorization paths. The worker receives those references without
-- receiving any contact data.

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
    'provider_kind', provider.provider_kind,
    'provider_source', provider.provider_source,
    'fund_directory_id', provider.fund_directory_id,
    'provider_organization_id', provider.provider_organization_id,
    'provider_fund_id', provider.provider_fund_id
  ) order by provider.provider_id), '[]'::jsonb)
  into context
  from (
    select
      directory.id::text as provider_id,
      directory.kind as provider_kind,
      'directory'::text as provider_source,
      directory.id as fund_directory_id,
      null::uuid as provider_organization_id,
      null::uuid as provider_fund_id
    from public.fund_directory directory
    where directory.status not in ('declined', 'inactive')

    union all

    select
      fund.id::text as provider_id,
      case organization.provider_type
        when 'fidc_manager' then 'fidc'
        when 'fund_manager' then 'credit_fund'
        when 'factor' then 'factoring'
        when 'bank' then 'bank'
        when 'family_office' then 'family_office'
        when 'alternative_lender' then 'alternative_lender'
        else 'other'
      end as provider_kind,
      'registered'::text as provider_source,
      null::uuid as fund_directory_id,
      mandate.organization_id as provider_organization_id,
      fund.id as provider_fund_id
    from public.mandate_versions mandate
    join public.funds fund
      on fund.organization_id = mandate.organization_id
     and fund.id = mandate.fund_id
    join public.organizations organization on organization.id = mandate.organization_id
    where mandate.status = 'active'
      and fund.status = 'active'
      and mandate.valid_from <= current_date
      and (mandate.valid_until is null or mandate.valid_until >= current_date)
      and not exists (
        select 1
        from public.fund_directory directory
        where directory.claimed_by_organization_id = mandate.organization_id
      )
  ) provider;

  return context;
end;
$$;

revoke all on function private.worker_load_match_provider_context(uuid, text)
  from public, anon;
grant execute on function private.worker_load_match_provider_context(uuid, text)
  to authenticated;
