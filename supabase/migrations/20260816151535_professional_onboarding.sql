-- Professional registration and role-specific onboarding.
-- Business role selection customizes the journey; database policies remain the authority boundary.

alter table public.organizations
  add column state_code text,
  add column city text,
  add column sector text,
  add column subsector text,
  add column provider_type text,
  add column description text;

alter table public.organizations
  add constraint organizations_state_code_format
    check (state_code is null or state_code ~ '^[A-Z0-9-]{2,8}$'),
  add constraint organizations_provider_type_valid
    check (
      provider_type is null
      or provider_type in ('fund_manager', 'fidc_manager', 'factor', 'bank', 'family_office', 'alternative_lender', 'other')
    ),
  add constraint organizations_description_length
    check (description is null or char_length(description) <= 2000);

alter table public.companies
  add column legal_identifier_last4 text,
  add column subsector text,
  add column headquarters_city text,
  add column headquarters_state text;

alter table public.companies
  add constraint companies_legal_identifier_last4_format
    check (legal_identifier_last4 is null or legal_identifier_last4 ~ '^[0-9A-Z]{4}$');

alter table public.capital_requests
  add column purpose_category text,
  add column rationale text,
  add column strategic_importance text,
  add column expected_outcome text,
  add column desired_timing text,
  add column repayment_source text,
  add column collateral_summary text;

alter table public.capital_requests
  add constraint capital_requests_purpose_category_valid
    check (
      purpose_category is null
      or purpose_category in ('working_capital', 'growth', 'capex', 'acquisition', 'equipment', 'refinance', 'other')
    ),
  add constraint capital_requests_narrative_lengths
    check (
      (rationale is null or char_length(rationale) <= 4000)
      and (strategic_importance is null or char_length(strategic_importance) <= 3000)
      and (expected_outcome is null or char_length(expected_outcome) <= 3000)
      and (desired_timing is null or char_length(desired_timing) <= 500)
      and (repayment_source is null or char_length(repayment_source) <= 2000)
      and (collateral_summary is null or char_length(collateral_summary) <= 2000)
    );

create table public.provider_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  fund_id uuid,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  job_title text,
  email text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone text,
  routing_criteria jsonb not null default '{}'::jsonb check (jsonb_typeof(routing_criteria) = 'object'),
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, fund_id) references public.funds (organization_id, id) on delete cascade
);

create index provider_contacts_org_status_idx
  on public.provider_contacts (organization_id, status, is_primary desc);
create index provider_contacts_fund_idx
  on public.provider_contacts (organization_id, fund_id)
  where fund_id is not null;
create index provider_contacts_created_by_idx
  on public.provider_contacts (created_by);
create index provider_contacts_routing_gin_idx
  on public.provider_contacts using gin (routing_criteria jsonb_path_ops);

create or replace function private.is_org_type_member(
  p_organization_id uuid,
  p_allowed_types text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organizations organization_record
      join public.organization_memberships membership
        on membership.organization_id = organization_record.id
      where organization_record.id = p_organization_id
        and organization_record.organization_type = any (p_allowed_types)
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    );
$$;

revoke all on function private.is_org_type_member(uuid, text[]) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_org_type_member(uuid, text[]) to authenticated;

create or replace function public.initialize_professional_onboarding(
  p_journey text,
  p_full_name text,
  p_job_title text default null,
  p_locale text default 'pt-BR'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  organization_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_journey not in ('company', 'originator', 'capital_provider') then
    raise exception 'invalid_journey' using errcode = '22023';
  end if;

  if char_length(trim(p_full_name)) not between 2 and 160 then
    raise exception 'invalid_full_name' using errcode = '22023';
  end if;

  select membership.organization_id
  into organization_id
  from public.organization_memberships membership
  where membership.user_id = actor_id
    and membership.status = 'active'
  order by membership.created_at
  limit 1;

  if organization_id is not null then
    return organization_id;
  end if;

  update public.profiles
  set full_name = trim(p_full_name),
      job_title = nullif(trim(p_job_title), ''),
      locale = case when p_locale in ('pt-BR', 'en-US') then p_locale else 'pt-BR' end
  where id = actor_id;

  insert into public.organizations (
    organization_type,
    name,
    country_code,
    created_by
  ) values (
    p_journey,
    case p_journey
      when 'company' then 'Empresa em cadastro'
      when 'originator' then 'Assessoria em cadastro'
      else 'Instituição em cadastro'
    end,
    'BR',
    actor_id
  )
  returning id into organization_id;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    joined_at
  ) values (
    organization_id,
    actor_id,
    'owner',
    'active',
    now()
  );

  insert into public.onboarding_progress (
    organization_id,
    user_id,
    journey,
    current_step,
    answers
  ) values (
    organization_id,
    actor_id,
    p_journey,
    'organization',
    jsonb_build_object(
      'registration', jsonb_build_object(
        'full_name', trim(p_full_name),
        'job_title', nullif(trim(p_job_title), '')
      )
    )
  );

  return organization_id;
end;
$$;

revoke all on function public.initialize_professional_onboarding(text, text, text, text) from public;
grant execute on function public.initialize_professional_onboarding(text, text, text, text) to authenticated;

alter table public.provider_contacts enable row level security;
alter table public.provider_contacts force row level security;

create policy provider_contacts_select on public.provider_contacts for select to authenticated
  using ((select private.is_org_type_member(organization_id, array['capital_provider', 'offroad'])));
create policy provider_contacts_insert on public.provider_contacts for insert to authenticated
  with check (
    (select private.is_org_type_member(organization_id, array['capital_provider', 'offroad']))
    and created_by = (select auth.uid())
  );
create policy provider_contacts_update on public.provider_contacts for update to authenticated
  using ((select private.is_org_type_member(organization_id, array['capital_provider', 'offroad'])))
  with check ((select private.is_org_type_member(organization_id, array['capital_provider', 'offroad'])));
create policy provider_contacts_delete on public.provider_contacts for delete to authenticated
  using ((select private.can_manage_organization(organization_id)));

drop policy companies_insert on public.companies;
drop policy companies_update on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (
    (select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad']))
    and created_by = (select auth.uid())
  );
create policy companies_update on public.companies for update to authenticated
  using ((select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad'])))
  with check ((select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad'])));

drop policy capital_requests_insert on public.capital_requests;
drop policy capital_requests_update on public.capital_requests;
create policy capital_requests_insert on public.capital_requests for insert to authenticated
  with check (
    (select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad']))
    and created_by = (select auth.uid())
  );
create policy capital_requests_update on public.capital_requests for update to authenticated
  using ((select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad'])))
  with check ((select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad'])));

drop policy opportunities_insert on public.opportunities;
drop policy opportunities_update on public.opportunities;
create policy opportunities_insert on public.opportunities for insert to authenticated
  with check (
    (select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad']))
    and created_by = (select auth.uid())
  );
create policy opportunities_update on public.opportunities for update to authenticated
  using (
    (select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad']))
    and (select private.can_access_opportunity(organization_id, id, 'opportunity.update'))
  )
  with check (
    (select private.is_org_type_member(organization_id, array['company', 'originator', 'offroad']))
    and (select private.can_access_opportunity(organization_id, id, 'opportunity.update'))
  );

drop policy funds_all on public.funds;
create policy funds_all on public.funds for all to authenticated
  using ((select private.is_org_type_member(organization_id, array['capital_provider', 'offroad'])))
  with check ((select private.is_org_type_member(organization_id, array['capital_provider', 'offroad'])));

drop policy mandate_versions_all on public.mandate_versions;
create policy mandate_versions_all on public.mandate_versions for all to authenticated
  using ((select private.is_org_type_member(organization_id, array['capital_provider', 'offroad'])))
  with check ((select private.is_org_type_member(organization_id, array['capital_provider', 'offroad'])));

create trigger provider_contacts_set_updated_at before update on public.provider_contacts
  for each row execute function private.set_updated_at();
create trigger provider_contacts_audit after insert or update or delete on public.provider_contacts
  for each row execute function private.capture_audit_event();

revoke all privileges on table public.provider_contacts from anon, authenticated;
grant select, insert, update, delete on public.provider_contacts to authenticated;
