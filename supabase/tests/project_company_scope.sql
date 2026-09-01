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

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000105","role":"authenticated","aal":"aal1"}',
  true
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

  if (select count(*) from public.capital_projects
      where organization_id = '20000000-0000-4000-8000-000000000105') <> 2
    or (select project.company_id
        from public.capital_projects project
        join public.document_intake_sessions session
          on session.organization_id = project.organization_id
          and session.capital_project_id = project.id
        where session.id = '40000000-0000-4000-8000-000000000105') is distinct from first_company_id then
    raise exception 'durable project roots did not remain isolated and linked to their client company';
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
  if (select project.company_id
      from public.capital_projects project
      join public.document_intake_sessions session
        on session.organization_id = project.organization_id
        and session.capital_project_id = project.id
      where session.id = '40000000-0000-4000-8000-000000000106') is distinct from second_company_id then
    raise exception 'second project root did not bind the second client company';
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

-- A document-only project keeps company identity as draft context until the user confirms the
-- preliminary understanding. It must not inherit either company above or create a canonical
-- company merely because a file was uploaded.
set local role postgres;
insert into public.document_intake_sessions (
  id, organization_id, started_by, journey, locale, project_name
) values (
  '40000000-0000-4000-8000-000000000107',
  '20000000-0000-4000-8000-000000000105',
  '10000000-0000-4000-8000-000000000105',
  'originator', 'pt-BR', 'Projeto Cliente Documento'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000105","role":"authenticated","aal":"aal1"}',
  true
);

select public.register_intake_document_command(
  '20000000-0000-4000-8000-000000000105',
  '40000000-0000-4000-8000-000000000107',
  '51000000-0000-4000-8000-000000000107',
  '50000000-0000-4000-8000-000000000107',
  'opportunity-documents',
  '20000000-0000-4000-8000-000000000105/40000000-0000-4000-8000-000000000107/company.pdf',
  'company.pdf', 'application/pdf', 128, repeat('e', 64)
);
select public.save_project_company_context(
  '40000000-0000-4000-8000-000000000107', '{}'::jsonb
);

do $$
begin
  if (select company_context_received_at is null
      from public.document_intake_sessions
      where id = '40000000-0000-4000-8000-000000000107')
    or (select client_company_id is not null
        from public.document_intake_sessions
        where id = '40000000-0000-4000-8000-000000000107') then
    raise exception 'document-only context was not retained as an unconfirmed project draft';
  end if;
end;
$$;

-- A later project can reference the same legal entity without inheriting another project's
-- draft. The stable identifier is held only as draft until the second confirmation.
set local role postgres;
insert into public.document_intake_sessions (
  id, organization_id, started_by, journey, locale, project_name
) values (
  '40000000-0000-4000-8000-000000000108',
  '20000000-0000-4000-8000-000000000105',
  '10000000-0000-4000-8000-000000000105',
  'originator', 'pt-BR', 'Projeto Cliente A Refinance'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000105","role":"authenticated","aal":"aal1"}',
  true
);
select public.save_project_company_context(
  '40000000-0000-4000-8000-000000000108',
  jsonb_build_object(
    'name', 'Cliente A',
    'identifier_hash_hex', repeat('ab', 32),
    'identifier_last4', '0195'
  )
);

set local role postgres;

insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '60000000-0000-4000-8000-000000000107',
  '20000000-0000-4000-8000-000000000105',
  '40000000-0000-4000-8000-000000000107',
  1, 'manual', 'succeeded', 'project-company-scope-v1',
  '10000000-0000-4000-8000-000000000105'
);

insert into public.preliminary_understandings (
  id, organization_id, intake_session_id, processing_run_id, object_version, status,
  input_fingerprint, object_fingerprint, payload
) values (
  '61000000-0000-4000-8000-000000000107',
  '20000000-0000-4000-8000-000000000105',
  '40000000-0000-4000-8000-000000000107',
  '60000000-0000-4000-8000-000000000107',
  1, 'pending_confirmation', repeat('1', 64), repeat('2', 64),
  jsonb_build_object(
    'schemaVersion', '2026.08.31-v1',
    'caseId', '40000000-0000-4000-8000-000000000107',
    'company', jsonb_build_object(
      'name', 'Cliente Extraído',
      'legalName', 'Cliente Extraído S.A.',
      'description', 'Identidade reconstruída a partir do material recebido.',
      'website', 'https://cliente-extraido.example'
    )
  )
);

update public.preliminary_understandings
set status = 'confirmed',
    decided_by = '10000000-0000-4000-8000-000000000105',
    decided_at = now()
where id = '61000000-0000-4000-8000-000000000107';

insert into public.processing_runs (
  id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
) values (
  '60000000-0000-4000-8000-000000000108',
  '20000000-0000-4000-8000-000000000105',
  '40000000-0000-4000-8000-000000000108',
  1, 'manual', 'succeeded', 'project-company-scope-v1',
  '10000000-0000-4000-8000-000000000105'
);
insert into public.preliminary_understandings (
  id, organization_id, intake_session_id, processing_run_id, object_version, status,
  input_fingerprint, object_fingerprint, payload
) values (
  '61000000-0000-4000-8000-000000000108',
  '20000000-0000-4000-8000-000000000105',
  '40000000-0000-4000-8000-000000000108',
  '60000000-0000-4000-8000-000000000108',
  1, 'pending_confirmation', repeat('3', 64), repeat('4', 64),
  jsonb_build_object(
    'schemaVersion', '2026.08.31-v1',
    'caseId', '40000000-0000-4000-8000-000000000108',
    'company', jsonb_build_object('name', 'Cliente A', 'legalName', 'Cliente A S.A.')
  )
);
update public.preliminary_understandings
set status = 'confirmed',
    decided_by = '10000000-0000-4000-8000-000000000105',
    decided_at = now()
where id = '61000000-0000-4000-8000-000000000108';

do $$
declare
  adopted_company_id uuid;
begin
  select client_company_id into adopted_company_id
  from public.document_intake_sessions
  where id = '40000000-0000-4000-8000-000000000107';

  if adopted_company_id is null
    or (select company_profile ->> 'name'
        from public.document_intake_sessions
        where id = '40000000-0000-4000-8000-000000000107') <> 'Cliente Extraído'
    or (select company_profile_confirmed_at
        from public.document_intake_sessions
        where id = '40000000-0000-4000-8000-000000000107') is null
    or (select project.company_id
        from public.capital_projects project
        join public.document_intake_sessions session
          on session.organization_id = project.organization_id
          and session.capital_project_id = project.id
        where session.id = '40000000-0000-4000-8000-000000000107') is distinct from adopted_company_id
    or (select status from public.preliminary_understandings
        where id = '61000000-0000-4000-8000-000000000107') <> 'confirmed' then
    raise exception 'confirmed document-only identity was not adopted atomically';
  end if;
end;
$$;

do $$
declare
  first_company_id uuid;
  repeated_company_id uuid;
begin
  select client_company_id into first_company_id
  from public.document_intake_sessions
  where id = '40000000-0000-4000-8000-000000000105';
  select client_company_id into repeated_company_id
  from public.document_intake_sessions
  where id = '40000000-0000-4000-8000-000000000108';

  if repeated_company_id is distinct from first_company_id
    or (select count(*) from public.companies
        where organization_id = '20000000-0000-4000-8000-000000000105'
          and legal_identifier_hash = decode(repeat('ab', 32), 'hex')) <> 1 then
    raise exception 'a repeated legal entity did not reuse the canonical company safely';
  end if;
end;
$$;

-- An originator may form a thesis from public information without pretending to represent the
-- company. Private uploads remain blocked until the project crosses the explicit legal gate.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000105","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  target_org constant uuid := '20000000-0000-4000-8000-000000000105';
  actor_id constant uuid := '10000000-0000-4000-8000-000000000105';
  session_id uuid;
  project_id uuid;
  accepted boolean;
begin
  session_id := public.start_public_capital_project(
    'pt-BR', 'Tese Pública Cliente C', 'origination_thesis',
    'Cliente C S.A.', 'https://cliente-c.example'
  );
  select capital_project_id into project_id
  from public.document_intake_sessions
  where id = session_id;

  if project_id is null
    or (select access_basis from public.capital_projects where id = project_id) <> 'public_information'
    or (select privacy_status from public.document_intake_sessions where id = session_id) <> 'public_information'
    or (select representation_status from public.document_intake_sessions where id = session_id) <> 'not_claimed'
    or (select representation_kind from public.document_intake_sessions where id = session_id) is not null
    or (select count(*) from public.project_representation_evidence
        where intake_session_id = session_id) <> 0 then
    raise exception 'public thesis implied private access or company representation';
  end if;

  accepted := true;
  begin
    perform public.register_intake_document_command(
      target_org, session_id,
      '51000000-0000-4000-8000-000000000109',
      '50000000-0000-4000-8000-000000000109',
      'opportunity-documents',
      target_org::text || '/' || session_id::text || '/private.pdf',
      'private.pdf', 'application/pdf', 128, repeat('f', 64)
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'public project accepted a browser-supplied private document'; end if;

  accepted := true;
  begin
    perform public.authorize_capital_project_private_work(project_id, true);
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'public project bypassed the current legal acceptance'; end if;

  set local role postgres;
  insert into public.organization_legal_acceptances (
    organization_id, legal_document_id, document_key, document_version, document_hash,
    accepted_by, signatory_name, signatory_title, authority_declared,
    information_rights_declared, terms_agreed, acceptance_statement,
    information_rights_statement, acceptance_method, locale
  )
  select
    target_org, document.id, document.document_key, document.version, document.document_hash,
    actor_id, 'Advisor Test', 'Assessor', true, true, true,
    document.acceptance_statement, document.information_rights_statement, 'clickwrap', 'pt-BR'
  from public.platform_legal_documents document
  where document.document_key = 'private_workspace_terms'
    and document.locale = 'pt-BR'
    and document.status = 'active'
  order by document.effective_at desc
  limit 1;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000105","role":"authenticated","aal":"aal1"}',
    true
  );
  perform public.authorize_capital_project_private_work(project_id, true);

  if (select access_basis from public.capital_projects where id = project_id) <> 'authorized_private'
    or (select privacy_status from public.document_intake_sessions where id = session_id) <> 'private'
    or (select representation_kind from public.document_intake_sessions where id = session_id) <> 'advisor'
    or (select representation_status from public.document_intake_sessions where id = session_id) <> 'declared'
    or (select count(*) from public.project_representation_evidence
        where intake_session_id = session_id and status = 'declared') <> 1 then
    raise exception 'private authorization did not promote the project atomically';
  end if;

  perform public.register_intake_document_command(
    target_org, session_id,
    '51000000-0000-4000-8000-000000000110',
    '50000000-0000-4000-8000-000000000110',
    'opportunity-documents',
    target_org::text || '/' || session_id::text || '/authorized.pdf',
    'authorized.pdf', 'application/pdf', 128, repeat('0', 64)
  );
  if (select count(*) from public.source_documents where intake_session_id = session_id) <> 1 then
    raise exception 'authorized private project could not retain its document';
  end if;
end;
$$;

rollback;

select 'project_company_scope_passed' as result;
