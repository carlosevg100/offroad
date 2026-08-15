-- Destructive-safe tenant isolation smoke test: every fixture is rolled back.

begin;

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
) values
  (
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'rls-a@example.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    false,
    false
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'rls-b@example.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    false,
    false
  );

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000001', 'company', 'RLS Tenant A', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'company', 'RLS Tenant B', '10000000-0000-4000-8000-000000000002');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'owner', 'active', now());

insert into public.companies (
  id,
  organization_id,
  legal_name,
  jurisdiction_code,
  reporting_currency,
  created_by
) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Tenant A Company', 'BR', 'BRL', '10000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Tenant B Company', 'BR', 'BRL', '10000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  visible_organizations integer;
  visible_companies integer;
  affected_rows integer;
begin
  select count(*) into visible_organizations from public.organizations;
  select count(*) into visible_companies from public.companies;

  if visible_organizations <> 1 or visible_companies <> 1 then
    raise exception 'tenant A isolation failed: organizations=%, companies=%', visible_organizations, visible_companies;
  end if;

  update public.companies
  set display_name = 'forbidden cross-tenant update'
  where id = '30000000-0000-4000-8000-000000000002';
  get diagnostics affected_rows = row_count;

  if affected_rows <> 0 then
    raise exception 'tenant A updated tenant B';
  end if;

  begin
    insert into public.companies (
      organization_id,
      legal_name,
      jurisdiction_code,
      reporting_currency,
      created_by
    ) values (
      '20000000-0000-4000-8000-000000000002',
      'Forbidden Company',
      'BR',
      'BRL',
      '10000000-0000-4000-8000-000000000001'
    );
    raise exception 'tenant A inserted into tenant B';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
  true
);

do $$
begin
  if (select count(*) from public.organizations) <> 1
    or (select count(*) from public.companies) <> 1 then
    raise exception 'tenant B isolation failed';
  end if;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform count(*) from public.organizations;
    raise exception 'anonymous role unexpectedly read organizations';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;

select 'rls_non_interference_passed' as result;
