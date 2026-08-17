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
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'rls-provider@example.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    false,
    false
  );

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000001', 'company', 'RLS Tenant A', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'company', 'RLS Tenant B', '10000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000003', 'capital_provider', 'RLS Provider', '10000000-0000-4000-8000-000000000003');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'owner', 'active', now());

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

  begin
    insert into public.funds (organization_id, name, strategy, created_by)
    values (
      '20000000-0000-4000-8000-000000000001',
      'Forbidden Company Fund',
      'Private credit',
      '10000000-0000-4000-8000-000000000001'
    );
    raise exception 'company tenant inserted a capital-provider fund';
  exception
    when insufficient_privilege then null;
  end;

  -- Self-service organizations can never be created as the internal "offroad" type.
  begin
    insert into public.organizations (organization_type, name, created_by)
    values ('offroad', 'Forbidden Internal Org', '10000000-0000-4000-8000-000000000001');
    raise exception 'tenant A created an offroad-type organization';
  exception
    when insufficient_privilege then null;
  end;

  -- ...nor promoted to it by their own owner/admin.
  begin
    update public.organizations
    set organization_type = 'offroad'
    where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'tenant A promoted its organization to offroad';
  exception
    when insufficient_privilege then null;
  end;

  -- A borrower-side tenant can start a document intake session (fixed id reused below).
  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'company',
    'pt-BR'
  );
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
declare
  affected_rows integer;
begin
  if (select count(*) from public.organizations) <> 1
    or (select count(*) from public.companies) <> 1 then
    raise exception 'tenant B isolation failed';
  end if;

  -- Tenant B cannot see, update, or attach candidates to tenant A's intake session.
  if (select count(*) from public.document_intake_sessions) <> 0 then
    raise exception 'tenant B can read tenant A intake sessions';
  end if;

  update public.document_intake_sessions
  set status = 'cancelled'
  where id = '40000000-0000-4000-8000-000000000001';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'tenant B updated tenant A intake session';
  end if;

  begin
    insert into public.intake_field_candidates (
      organization_id, intake_session_id, extractor_key, field_path, field_group, label,
      normalized_value, value_type, information_class, evidence_rank, source_anchor,
      confidence, extraction_method, created_by
    ) values (
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'forbidden', 'company.legal_name', 'company', 'Forbidden',
      '"x"'::jsonb, 'text', 'company_document', 6, '{}'::jsonb,
      0.5, 'user_entry', '10000000-0000-4000-8000-000000000002'
    );
    raise exception 'tenant B inserted a candidate into tenant A session';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',
  true
);

do $$
begin
  if (select count(*) from public.organizations) <> 1 then
    raise exception 'capital provider isolation failed';
  end if;

  begin
    insert into public.companies (
      organization_id,
      legal_name,
      jurisdiction_code,
      reporting_currency,
      created_by
    ) values (
      '20000000-0000-4000-8000-000000000003',
      'Forbidden Provider Company',
      'BR',
      'BRL',
      '10000000-0000-4000-8000-000000000003'
    );
    raise exception 'capital provider inserted a borrower company';
  exception
    when insufficient_privilege then null;
  end;

  -- Capital providers do not run document-first intake (borrower-side journey only).
  begin
    insert into public.document_intake_sessions (organization_id, started_by, journey, locale)
    values (
      '20000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000003',
      'company',
      'pt-BR'
    );
    raise exception 'capital provider started a document intake session';
  exception
    when insufficient_privilege then null;
  end;
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

-- Schema invariants: every public table has RLS enabled and forced (owners included).
do $$
declare
  offending text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into offending
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not (c.relrowsecurity and c.relforcerowsecurity);

  if offending is not null then
    raise exception 'tables without enabled+forced RLS: %', offending;
  end if;
end;
$$;

rollback;

select 'rls_non_interference_passed' as result;
