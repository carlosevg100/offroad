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

-- Intake commands (still tenant A): processing, review, atomic + idempotent confirmation.
do $$
declare
  org constant uuid := '20000000-0000-4000-8000-000000000001';
  session_id constant uuid := '40000000-0000-4000-8000-000000000001';
  result jsonb;
  first_opportunity uuid;
  second_opportunity uuid;
  candidate_id uuid;
  amount_candidate uuid;
  n integer;
  title_length integer;
begin
  perform public.begin_intake_processing(org, session_id);
  if (select status from public.document_intake_sessions where id = session_id) <> 'processing' then
    raise exception 'begin_intake_processing did not mark the session processing';
  end if;

  result := public.complete_intake_processing(
    org, session_id,
    jsonb_build_array(
      jsonb_build_object('extractor_key', 'legal-name', 'field_path', 'company.legal_name', 'field_group', 'company', 'label', 'Razão social',
        'raw_value', 'RLS Empresa A Ltda.', 'normalized_value', to_jsonb('RLS Empresa A Ltda.'::text), 'value_type', 'text',
        'information_class', 'company_document', 'evidence_rank', 6, 'source_anchor', '{"page":1}'::jsonb, 'confidence', 0.99, 'extraction_method', 'native_text', 'is_primary', true),
      jsonb_build_object('extractor_key', 'purpose', 'field_path', 'transaction.purpose', 'field_group', 'transaction', 'label', 'Finalidade',
        'raw_value', 'x', 'normalized_value', to_jsonb(rtrim(repeat('Finalidade longa ', 18))), 'value_type', 'text',
        'information_class', 'company_document', 'evidence_rank', 6, 'source_anchor', '{"page":1}'::jsonb, 'confidence', 0.98, 'extraction_method', 'native_text', 'is_primary', true),
      jsonb_build_object('extractor_key', 'requested', 'field_path', 'transaction.requested_amount', 'field_group', 'transaction', 'label', 'Valor solicitado',
        'raw_value', 'R$ 12 milhões', 'normalized_value', to_jsonb(12000000), 'value_type', 'number', 'unit', 'currency', 'currency', 'BRL',
        'information_class', 'company_document', 'evidence_rank', 6, 'source_anchor', '{"page":1}'::jsonb, 'confidence', 0.99, 'extraction_method', 'native_text', 'is_primary', true),
      jsonb_build_object('extractor_key', 'requested-alt', 'field_path', 'transaction.requested_amount', 'field_group', 'transaction', 'label', 'Valor solicitado',
        'raw_value', '~12', 'normalized_value', to_jsonb(11900000), 'value_type', 'number', 'unit', 'currency', 'currency', 'BRL',
        'information_class', 'management', 'evidence_rank', 4, 'source_anchor', '{"sheet":"A","cell":"B2"}'::jsonb, 'confidence', 0.7, 'extraction_method', 'spreadsheet_cell', 'is_primary', false)
    ),
    jsonb_build_array(
      jsonb_build_object('issue_type', 'conflict', 'priority', 'analysis', 'field_group', 'transaction', 'field_path', 'transaction.requested_amount',
        'candidate_keys', jsonb_build_array('requested', 'requested-alt'), 'title', 'Valores divergentes', 'description', 'Duas fontes.')
    ),
    '{"fixture":"rls_test"}'::jsonb
  );
  if (result ->> 'candidates')::int <> 4 or (result ->> 'issues')::int <> 1 then
    raise exception 'complete_intake_processing counts wrong: %', result;
  end if;
  if (select status from public.document_intake_sessions where id = session_id) <> 'review_ready' then
    raise exception 'complete_intake_processing did not mark the session review_ready';
  end if;
  if (select cardinality(candidate_ids) from public.intake_issues where intake_session_id = session_id) <> 2 then
    raise exception 'issue candidate keys were not resolved to ids';
  end if;

  -- Confirmation before any review must fail closed (nothing accepted yet).
  begin
    perform public.confirm_document_intake(org, session_id, 'pt-BR');
    raise exception 'confirm_document_intake accepted an unreviewed session';
  exception
    when sqlstate '22023' then null;
  end;

  -- Review: accept the three primaries; edit the amount to a new value.
  for candidate_id in select id from public.intake_field_candidates where intake_session_id = session_id and is_primary loop
    perform public.review_intake_candidate(org, session_id, candidate_id, 'accept');
  end loop;
  select id into amount_candidate from public.intake_field_candidates where intake_session_id = session_id and extractor_key = 'requested';
  perform public.review_intake_candidate(org, session_id, amount_candidate, 'edit', to_jsonb(12500000), 'ajustado');
  if (select normalized_value from public.intake_field_candidates where id = amount_candidate) <> to_jsonb(12500000)
     or (select review_state from public.intake_field_candidates where id = amount_candidate) <> 'edited'
     or (select extraction_method from public.intake_field_candidates where id = amount_candidate) <> 'user_entry' then
    raise exception 'review_intake_candidate edit did not persist';
  end if;
  if (select count(*) from public.intake_field_candidates where intake_session_id = session_id and field_path = 'transaction.requested_amount' and is_primary) <> 1 then
    raise exception 'review_intake_candidate left more than one primary per field path';
  end if;

  -- Atomic confirmation.
  result := public.confirm_document_intake(org, session_id, 'pt-BR');
  first_opportunity := (result ->> 'opportunity_id')::uuid;
  if first_opportunity is null or (result ->> 'already_confirmed')::boolean then
    raise exception 'confirm_document_intake did not create the opportunity: %', result;
  end if;
  select count(*) into n from public.opportunities where organization_id = org;
  if n <> 1 then raise exception 'expected 1 opportunity, found %', n; end if;
  select count(*) into n from public.evidence_facts where opportunity_id = first_opportunity and review_state = 'approved';
  if n <> 3 then raise exception 'expected 3 approved evidence facts, found %', n; end if;
  select char_length(title) into title_length from public.opportunities where id = first_opportunity;
  if title_length > 180 then raise exception 'opportunity title exceeds 180 characters'; end if;
  if (select requested_amount from public.opportunities where id = first_opportunity) <> 12500000 then
    raise exception 'opportunity did not use the edited amount';
  end if;
  if (select status from public.document_intake_sessions where id = session_id) <> 'confirmed' then
    raise exception 'session was not confirmed';
  end if;

  -- Idempotent: confirming again returns the same opportunity and creates nothing.
  result := public.confirm_document_intake(org, session_id, 'pt-BR');
  second_opportunity := (result ->> 'opportunity_id')::uuid;
  if second_opportunity <> first_opportunity or not (result ->> 'already_confirmed')::boolean then
    raise exception 'confirm_document_intake is not idempotent: %', result;
  end if;
  select count(*) into n from public.opportunities where organization_id = org;
  if n <> 1 then raise exception 'idempotent confirmation created a duplicate'; end if;

  -- A confirmed session cannot be reprocessed.
  begin
    perform public.begin_intake_processing(org, session_id);
    raise exception 'begin_intake_processing reopened a confirmed session';
  exception
    when sqlstate '55000' then null;
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

  -- ...nor drive tenant A's session through the intake commands.
  begin
    perform public.confirm_document_intake('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'pt-BR');
    raise exception 'tenant B confirmed tenant A intake session';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform public.begin_intake_processing('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001');
    raise exception 'tenant B reprocessed tenant A intake session';
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
