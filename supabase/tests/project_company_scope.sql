-- Project/company separation smoke test. All fixtures are rolled back.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  '10000000-0000-4000-8000-000000000105',
  'authenticated',
  'authenticated',
  'project-scope-advisor@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(), false, false
);

insert into public.organizations (id, organization_type, name, created_by)
values (
  '20000000-0000-4000-8000-000000000105',
  'originator',
  'Advisor Workspace',
  '10000000-0000-4000-8000-000000000105'
);

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
values (
  '20000000-0000-4000-8000-000000000105',
  '10000000-0000-4000-8000-000000000105',
  'owner', 'active', now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000105","role":"authenticated","aal":"aal1"}',
  true
);

insert into public.document_intake_sessions (
  id, organization_id, started_by, journey, locale, project_name
) values
  (
    '40000000-0000-4000-8000-000000000105',
    '20000000-0000-4000-8000-000000000105',
    '10000000-0000-4000-8000-000000000105',
    'originator', 'pt-BR', 'Projeto Cliente A'
  ),
  (
    '40000000-0000-4000-8000-000000000106',
    '20000000-0000-4000-8000-000000000105',
    '10000000-0000-4000-8000-000000000105',
    'originator', 'pt-BR', 'Projeto Cliente B'
  );

select public.save_project_company_profile(
  '40000000-0000-4000-8000-000000000105',
  'Cliente A', 'Cliente A S.A.', 'https://cliente-a.example',
  'Companhia assessorada no primeiro projeto.', decode(repeat('ab', 32), 'hex'), '0195'
);

do $$
declare
  first_company_id uuid;
begin
  if (select name from public.organizations where id = '20000000-0000-4000-8000-000000000105') <> 'Advisor Workspace' then
    raise exception 'saving a client renamed the advisor workspace';
  end if;

  select client_company_id into first_company_id
  from public.document_intake_sessions
  where id = '40000000-0000-4000-8000-000000000105';

  if first_company_id is null
    or (select company_profile ->> 'name' from public.document_intake_sessions
        where id = '40000000-0000-4000-8000-000000000105') <> 'Cliente A' then
    raise exception 'first project did not retain its client company';
  end if;

  if (select company_profile from public.document_intake_sessions
      where id = '40000000-0000-4000-8000-000000000106') <> '{}'::jsonb
    or (select client_company_id from public.document_intake_sessions
        where id = '40000000-0000-4000-8000-000000000106') is not null then
    raise exception 'a new project inherited another project company';
  end if;
end;
$$;

-- Leaving the identifier empty while editing means keep, not erase.
select public.save_project_company_profile(
  '40000000-0000-4000-8000-000000000105',
  'Cliente A', 'Cliente A S.A.', 'https://cliente-a.example',
  'Descrição atualizada.', null, null
);

do $$
begin
  if (select legal_identifier_last4 from public.companies company
      join public.document_intake_sessions session on session.client_company_id = company.id
      where session.id = '40000000-0000-4000-8000-000000000105') <> '0195' then
    raise exception 'blank identifier erased the stored company identifier';
  end if;
end;
$$;

select public.save_project_company_profile(
  '40000000-0000-4000-8000-000000000106',
  'Cliente B', 'Cliente B Ltda.', 'https://cliente-b.example',
  'Segunda companhia assessorada.', decode(repeat('cd', 32), 'hex'), '0147'
);

do $$
declare
  first_company_id uuid;
  second_company_id uuid;
begin
  select client_company_id into first_company_id from public.document_intake_sessions
  where id = '40000000-0000-4000-8000-000000000105';
  select client_company_id into second_company_id from public.document_intake_sessions
  where id = '40000000-0000-4000-8000-000000000106';

  if first_company_id = second_company_id then
    raise exception 'two advisor projects collapsed different clients into one company';
  end if;
  if (select company_profile ->> 'name' from public.document_intake_sessions
      where id = '40000000-0000-4000-8000-000000000105') <> 'Cliente A' then
    raise exception 'second project changed the first project snapshot';
  end if;
  if (select name from public.organizations where id = '20000000-0000-4000-8000-000000000105') <> 'Advisor Workspace' then
    raise exception 'second client renamed the advisor workspace';
  end if;
end;
$$;

set local role postgres;
rollback;

select 'project_company_scope_passed' as result;
