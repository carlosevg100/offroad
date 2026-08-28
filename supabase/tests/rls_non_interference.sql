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
  returned_session uuid;
  workspace_session uuid;
  n integer;
  title_length integer;
begin
  -- Documents: one in the session that will be confirmed (becomes evidence), one in an open session (removable).
  perform public.register_intake_document_command(
    org, session_id, '51000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001', 'opportunity-documents',
    org::text || '/' || session_id::text || '/a.pdf', 'a.pdf', 'application/pdf',
    10, repeat('a', 64)
  );
  -- `insert … returning` must work for the tenant (the app reads the new session id this way).
  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values ('40000000-0000-4000-8000-000000000002', org, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR')
  returning id into returned_session;
  if returned_session is distinct from '40000000-0000-4000-8000-000000000002' then
    raise exception 'insert returning did not expose the new intake session to its tenant';
  end if;
  perform public.register_intake_document_command(
    org, '40000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000002', 'opportunity-documents',
    org::text || '/40000000-0000-4000-8000-000000000002/b.pdf',
    'b.pdf', 'application/pdf', 10, repeat('b', 64)
  );
  perform public.remove_intake_document_command(
    org, '40000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000003',
    '50000000-0000-4000-8000-000000000002'
  );
  if exists (select 1 from public.source_documents where id = '50000000-0000-4000-8000-000000000002') then
    raise exception 'owner command did not remove a document from an open intake session';
  end if;

  -- An unfinished document-first onboarding can be restarted by its creator. The attempt is
  -- cancelled, not deleted, and only registration identity survives in onboarding progress.
  insert into public.onboarding_progress (organization_id, user_id, journey, current_step, answers)
  values (
    org,
    '10000000-0000-4000-8000-000000000001',
    'company',
    'documents',
    jsonb_build_object(
      'registration', jsonb_build_object('full_name', 'RLS Owner'),
      'intake_mode', 'documents',
      'intake_session_id', '40000000-0000-4000-8000-000000000002'
    )
  );
  perform public.restart_onboarding_intake(org, '40000000-0000-4000-8000-000000000002');
  if (select status from public.document_intake_sessions where id = '40000000-0000-4000-8000-000000000002') <> 'cancelled' then
    raise exception 'restart_onboarding_intake did not cancel the unfinished session';
  end if;
  if (select current_step from public.onboarding_progress where organization_id = org and journey = 'company') <> 'organization'
    or (select answers from public.onboarding_progress where organization_id = org and journey = 'company')
      <> '{"registration":{"full_name":"RLS Owner"}}'::jsonb then
    raise exception 'restart_onboarding_intake did not restore the welcome state precisely';
  end if;
  -- Replaying the same command is harmless and leaves the same auditable result.
  perform public.restart_onboarding_intake(org, '40000000-0000-4000-8000-000000000002');

  -- Starting the new guided journey is one atomic command: a session and its onboarding pointer
  -- either both exist or neither does. Gate 0 first records an exact-version acceptance, then
  -- creates a named private project with a representation declaration.
  perform public.accept_private_workspace_terms(
    'pt-BR', 'RLS Owner', 'Diretor', true, true
  );
  if (select count(*) from public.organization_legal_acceptances
      where organization_id = org and document_key = 'private_workspace_terms') <> 1 then
    raise exception 'private workspace acceptance was not recorded exactly once';
  end if;
  if not (select terms_agreed and information_rights_declared
          from public.organization_legal_acceptances
          where organization_id = org and document_key = 'private_workspace_terms')
    or (select char_length(acceptance_statement)
        from public.organization_legal_acceptances
        where organization_id = org and document_key = 'private_workspace_terms') < 20 then
    raise exception 'private workspace acceptance did not preserve both exact declarations';
  end if;
  begin
    update public.organization_legal_acceptances set signatory_name = 'Tampered'
    where organization_id = org;
    raise exception 'legal acceptance ledger accepted an update';
  exception when insufficient_privilege then null;
  end;

  returned_session := public.start_onboarding_intake(
    'pt-BR', 'Projeto Atlas', 'identified_restricted', true
  );
  if returned_session is null
    or (select current_step from public.onboarding_progress where organization_id = org and journey = 'company') <> 'organization'
    or (select answers ->> 'guided_milestone' from public.onboarding_progress where organization_id = org and journey = 'company') <> 'company'
    or (select answers ->> 'intake_session_id' from public.onboarding_progress where organization_id = org and journey = 'company') <> returned_session::text then
    raise exception 'start_onboarding_intake did not atomically open the company milestone';
  end if;
  if (select project_name from public.document_intake_sessions where id = returned_session) <> 'Projeto Atlas'
    or (select privacy_status from public.document_intake_sessions where id = returned_session) <> 'private'
    or (select representation_status from public.document_intake_sessions where id = returned_session) <> 'declared'
    or (select count(*) from public.project_representation_evidence
        where organization_id = org and intake_session_id = returned_session) <> 1 then
    raise exception 'private project identity or representation declaration was not created atomically';
  end if;

  -- Editing project setup updates the same open session. Back and Edit must never cancel or
  -- duplicate the financing, and the declaration ledger remains idempotent.
  if public.start_onboarding_intake(
      'pt-BR', 'Projeto Atlas Atualizado', 'blind_initial', true
    ) <> returned_session then
    raise exception 'editing project setup created a second intake session';
  end if;
  if (select project_name from public.document_intake_sessions where id = returned_session) <> 'Projeto Atlas Atualizado'
    or (select identity_policy from public.document_intake_sessions where id = returned_session) <> 'blind_initial'
    or (select status from public.document_intake_sessions where id = returned_session) <> 'collecting'
    or (select count(*) from public.project_representation_evidence
        where organization_id = org and intake_session_id = returned_session) <> 1 then
    raise exception 'editing project setup did not update the same private project idempotently';
  end if;

  -- Later financings use a separate atomic command but the same confidentiality, identity and
  -- representation contract. They do not mutate onboarding_progress or reuse the first session.
  workspace_session := public.start_workspace_intake(
    org, 'pt-BR', 'Projeto Workspace', 'identified_restricted', true
  );
  if workspace_session is null
    or (select project_name from public.document_intake_sessions where id = workspace_session) <> 'Projeto Workspace'
    or (select privacy_status from public.document_intake_sessions where id = workspace_session) <> 'private'
    or (select representation_kind from public.document_intake_sessions where id = workspace_session) <> 'company'
    or (select count(*) from public.project_representation_evidence
        where organization_id = org and intake_session_id = workspace_session) <> 1 then
    raise exception 'start_workspace_intake did not create the private project and evidence atomically';
  end if;

  perform public.save_guided_company_profile(
    returned_session,
    'RLS Tenant A Atualizada',
    'RLS Tenant A S.A.',
    'https://example.invalid',
    'Companhia operacional usada somente pelo teste de isolamento.',
    decode(repeat('a', 64), 'hex'),
    '0001'
  );
  if (select current_step from public.onboarding_progress where organization_id = org and journey = 'company') <> 'documents'
    or (select answers ->> 'guided_milestone' from public.onboarding_progress where organization_id = org and journey = 'company') <> 'operation'
    or (select name from public.organizations where id = org) <> 'RLS Tenant A Atualizada'
    or not exists (
      select 1 from public.companies
      where organization_id = org
        and display_name = 'RLS Tenant A Atualizada'
        and legal_identifier_last4 = '0001'
    ) then
    raise exception 'save_guided_company_profile did not persist the first milestone atomically';
  end if;

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

  -- The learning ledger. An edit overwrites the candidate in place, so unless the prior value
  -- was written down first, the pair the extractor learns from is gone the moment it is made.
  if (select count(*) from public.extraction_feedback where intake_session_id = session_id) <> 4 then
    raise exception 'extraction_feedback did not record every review decision: %',
      (select count(*) from public.extraction_feedback where intake_session_id = session_id);
  end if;
  if (select f.proposed_value from public.extraction_feedback f
      where f.candidate_id = amount_candidate and f.decision = 'edit') = to_jsonb(12500000) then
    raise exception 'extraction_feedback stored the corrected value as the proposal';
  end if;
  if (select f.corrected_value from public.extraction_feedback f
      where f.candidate_id = amount_candidate and f.decision = 'edit') <> to_jsonb(12500000) then
    raise exception 'extraction_feedback did not record the correction';
  end if;
  if exists (select 1 from public.extraction_feedback f where f.decision <> 'edit' and f.corrected_value is not null) then
    raise exception 'extraction_feedback recorded a correction on a non-edit decision';
  end if;

  -- Append-only: the tenant may write history and read it, never revise it.
  begin
    update public.extraction_feedback set decision = 'accept' where intake_session_id = session_id;
    raise exception 'extraction_feedback allowed an update';
  exception
    when insufficient_privilege then null;
  end;
  begin
    delete from public.extraction_feedback where intake_session_id = session_id;
    raise exception 'extraction_feedback allowed a delete';
  exception
    when insufficient_privilege then null;
  end;

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

  begin
    perform public.restart_onboarding_intake(org, session_id);
    raise exception 'restart_onboarding_intake cancelled a confirmed case';
  exception
    when sqlstate '55000' then null;
  end;

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

  -- Once confirmed, the document is evidence: it is linked to the opportunity and cannot be deleted.
  if (select opportunity_id from public.source_documents where id = '50000000-0000-4000-8000-000000000001') is distinct from first_opportunity then
    raise exception 'confirmation did not link the session document to the opportunity';
  end if;
  begin
    delete from public.source_documents where id = '50000000-0000-4000-8000-000000000001';
    raise exception 'evidence document accepted a direct delete after confirmation';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Sounding tables: tenant A cannot write a sounding into tenant B, and the event log is
-- append-only even for its own tenant.
do $$
declare
  affected_rows integer;
begin
  begin
    insert into public.soundings (organization_id, intake_session_id, target_amount, cdi_pct, created_by)
    values ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000000', 1000000, 10.5, '10000000-0000-4000-8000-000000000001');
    raise exception 'tenant A inserted a sounding into tenant B';
  exception
    when insufficient_privilege then null;
    when foreign_key_violation then raise exception 'RLS let the sounding insert reach the foreign key';
  end;
  if (select count(*) from public.soundings) <> 0 then
    raise exception 'tenant A sees soundings it did not create';
  end if;
  begin
    delete from public.sounding_events where true;
    raise exception 'sounding_events accepted a delete';
  exception
    when insufficient_privilege then null;
  end;
end $$;

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

  begin
    delete from public.source_documents where id = '50000000-0000-4000-8000-000000000001';
    raise exception 'tenant B deleted tenant A document';
  exception when insufficient_privilege then null;
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
  begin
    perform public.restart_onboarding_intake('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002');
    raise exception 'tenant B restarted tenant A onboarding';
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

-- ---------------------------------------------------------------------------------------------
-- P1 pipeline (F1): processing runs, job queue and worker commands.
-- Two credentials, neither sufficient alone: a hashed worker token to claim, a per-job
-- capability token afterwards. The worker account is a member of no organization.
-- ---------------------------------------------------------------------------------------------

reset role;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
) values (
  '10000000-0000-4000-8000-000000000004',
  'authenticated',
  'authenticated',
  'rls-worker@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  false,
  false
);

insert into private.worker_tokens (label, token_sha256)
values ('rls-test-worker', extensions.digest(repeat('w', 64), 'sha256'));

-- A platform mandate note is indexed from its append-only observation. It remains invisible to
-- borrower-side tenants and can be retrieved by a case worker only after that fund id has passed
-- the structured screen.
insert into public.fund_directory (id, legal_name, kind, status)
values ('70000000-0000-4000-8000-000000000701', 'RLS Governed Retrieval Fund', 'credit_fund', 'mapped');

insert into public.fund_mandate_observations (
  id, fund_id, criterion, value, provenance, observed_at, note, source_url
) values (
  '70000000-0000-4000-8000-000000000702',
  '70000000-0000-4000-8000-000000000701',
  'ticket',
  '{"min":"10000000","max":"80000000"}'::jsonb,
  'conversation',
  current_date,
  'Mandato atualizado: busca expansão com estrutura amortizante e garantia de recebíveis.',
  'https://example.invalid/mandate-note'
);

do $$
begin
  if (select count(*) from public.mandate_note_embeddings
      where observation_id = '70000000-0000-4000-8000-000000000702') <> 1 then
    raise exception 'append-only mandate observation did not enter the governed note index';
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

-- Tenant A opens a run for one document of an open session.
do $$
declare
  org constant uuid := '20000000-0000-4000-8000-000000000001';
  session_id constant uuid := '40000000-0000-4000-8000-000000000003';
  document_id constant uuid := '50000000-0000-4000-8000-000000000003';
  result jsonb;
begin
  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values (session_id, org, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR');

  perform public.register_intake_document_command(
    org, session_id, '51000000-0000-4000-8000-000000000004', document_id,
    'opportunity-documents', org::text || '/' || session_id::text || '/df.pdf',
    'df.pdf', 'application/pdf', 4096, repeat('d', 64)
  );

  result := public.begin_processing_run(
    org,
    session_id,
    'upload',
    jsonb_build_array(jsonb_build_object(
      'source_document_id', document_id,
      'download_url', 'https://p.supabase.co/storage/v1/object/sign/opportunity-documents/'
        || org::text || '/' || session_id::text || '/df.pdf?token=one',
      'layer_object_path', org::text || '/' || session_id::text || '/df.layer.json',
      'layer_upload_url', 'https://p.supabase.co/storage/v1/object/upload/sign/document-layers/'
        || org::text || '/' || session_id::text || '/df.layer.json'
    )),
    'pipeline-test-v1',
    '{"max_cost_usd": 15}'::jsonb
  );

  if (result->>'job_count')::integer <> 1 then
    raise exception 'begin_processing_run did not queue one job per document';
  end if;
  if (select status from public.document_intake_sessions where id = session_id) <> 'processing' then
    raise exception 'begin_processing_run did not mark the session processing';
  end if;
  if (select count(*) from public.processing_runs where intake_session_id = session_id) <> 1 then
    raise exception 'tenant cannot read its own processing run';
  end if;

  -- progress is visible, the payload (signed URLs) is not
  if (select count(*) from public.processing_jobs where intake_session_id = session_id) <> 1 then
    raise exception 'tenant cannot read its own job progress';
  end if;
  begin
    perform (select payload::text from public.processing_jobs where intake_session_id = session_id limit 1);
    raise exception 'tenant unexpectedly read the job payload';
  exception
    when insufficient_privilege then null;
  end;

  -- runs are advanced by commands only
  begin
    update public.processing_runs set status = 'succeeded' where intake_session_id = session_id;
    raise exception 'tenant unexpectedly updated a processing run';
  exception
    when insufficient_privilege then null;
  end;

  -- a document that does not belong to the session cannot be queued
  begin
    perform public.begin_processing_run(
      org,
      session_id,
      'manual',
      jsonb_build_array(jsonb_build_object('source_document_id', '50000000-0000-4000-8000-000000000001')),
      'pipeline-test-v1'
    );
    raise exception 'begin_processing_run queued a document from another scope';
  exception
    when sqlstate 'P0002' then null;
  end;
end;
$$;

-- Tenant B sees nothing of tenant A's run.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
  true
);

do $$
begin
  if (select count(*) from public.processing_runs) <> 0 then
    raise exception 'tenant B read processing runs of tenant A';
  end if;
  if (select count(*) from public.processing_jobs) <> 0 then
    raise exception 'tenant B read processing jobs of tenant A';
  end if;
  if (select count(*) from public.document_profiles) <> 0 then
    raise exception 'tenant B read document profiles of tenant A';
  end if;
  if (select count(*) from public.document_layers) <> 0 then
    raise exception 'tenant B read document layers of tenant A';
  end if;
end;
$$;

-- Platform research is private market infrastructure. A case worker may read it only through
-- its live case capability; neither borrower tenant can enumerate the provider or program.
reset role;
do $$
begin
  insert into public.fund_directory (id, legal_name, kind, status)
  values (
    '70000000-0000-4000-8000-000000000799',
    'Financeira Privada do Trilho de Produção S.A.',
    'credit_finance_company',
    'mapped'
  );
  insert into public.capital_provider_programs (
    id, provider_id, program_name, provider_kind, route_ids, status
  ) values (
    '71000000-0000-4000-8000-000000000799',
    '70000000-0000-4000-8000-000000000799',
    'Desconto privado de recebíveis',
    'credit_finance_company',
    array['financial_institution_receivables_discount'],
    'active'
  );
  insert into public.fund_mandate_observations (
    id, fund_id, program_id, criterion, value, provenance, observed_at, valid_until, note
  ) values
    (
      '72000000-0000-4000-8000-000000000799',
      '70000000-0000-4000-8000-000000000799',
      '71000000-0000-4000-8000-000000000799',
      'eligible_routes',
      '["financial_institution_receivables_discount"]'::jsonb,
      'conversation', current_date, current_date + 30,
      'rotas confirmadas no teste de produção'
    ),
    (
      '72000000-0000-4000-8000-000000000798',
      '70000000-0000-4000-8000-000000000799',
      '71000000-0000-4000-8000-000000000799',
      'live_appetite',
      'true'::jsonb,
      'conversation', current_date, current_date + 30,
      'apetite confirmado no teste de produção'
    );
end;
$$;

-- The worker: no membership anywhere, works only through the commands.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  claim jsonb;
  case_claim jsonb;
  job_id uuid;
  case_job_id uuid;
  capability text;
  case_capability text;
  result jsonb;
  case_input jsonb;
  manifest jsonb;
  manifest_id uuid;
  retrieval jsonb;
  evidence_payload bytea := convert_to('receivables-evidence-fixture', 'utf8');
  evidence_result jsonb;
begin
  -- RLS gives the worker account nothing on its own
  if (select count(*) from public.processing_runs) <> 0 then
    raise exception 'worker account read processing runs through RLS';
  end if;

  -- an unknown credential cannot claim
  begin
    perform public.worker_claim_job(repeat('x', 64));
    raise exception 'worker_claim_job accepted an unknown credential';
  exception
    when insufficient_privilege then null;
  end;

  claim := public.worker_claim_job(repeat('w', 64), 600);
  if not (claim->>'claimed')::boolean then
    raise exception 'worker could not claim the queued job';
  end if;
  job_id := (claim->>'job_id')::uuid;
  capability := claim->>'capability_token';
  if capability is null or char_length(capability) < 32 then
    raise exception 'claim did not issue a capability token';
  end if;
  if claim->'payload'->>'download_url' is null then
    raise exception 'job payload did not reach the worker';
  end if;

  -- A valid document capability still cannot open the cross-tenant mandate directory.
  begin
    perform public.worker_load_case_input(job_id, capability);
    raise exception 'a document capability opened case-analysis input';
  exception
    when insufficient_privilege then null;
  end;

  -- a wrong capability cannot write anything
  begin
    perform public.worker_record_document_result(job_id, repeat('y', 64), null, null, null);
    raise exception 'worker_record_document_result accepted a wrong capability';
  exception
    when insufficient_privilege then null;
  end;

  perform public.worker_heartbeat(job_id, capability, 900);
  perform public.worker_write_stage_result(
    job_id, capability, 'gatekeeping', 'succeeded', '{"scanner":"clamav-test"}'::jsonb, '{"input_tokens": 120}'::jsonb
  );

  result := public.worker_record_document_result(
    job_id,
    capability,
    '{"verdict":"clean","scanner":"clamav-test"}'::jsonb,
    jsonb_build_object(
      'document_kind', 'audited_financial_statements',
      'information_class', 'audited',
      'evidence_rank', 1,
      'confidence', 0.97,
      'entity_name', 'Tenant A Company',
      'period_start', '2023-01-01',
      'period_end', '2025-12-31',
      'currency', 'BRL',
      'scale', 1000000,
      'accounting_basis', 'audited',
      'language', 'pt',
      'suggested_folder', 'financial',
      'suggested_name', '2025-12_Demonstracoes_financeiras_auditadas',
      'classifier', jsonb_build_object('provider', 'openai', 'model', 'gpt-5.6-terra')
    ),
    jsonb_build_object(
      'layer_kind', 'pdf',
      'object_path', '20000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000003/df.layer.json',
      'sha256', repeat('c', 64),
      'byte_size', 2048,
      'parser_versions', jsonb_build_object('pdf', 'pdfjs-test'),
      'stats', jsonb_build_object('pageCount', 60)
    )
  );
  if result->>'profile_id' is null or result->>'layer_id' is null then
    raise exception 'worker did not persist the profile and the layer';
  end if;

  begin
    perform public.worker_record_receivables_evidence(
      job_id, repeat('y', 64), 'document_layer', '2026.08.28-v1', repeat('d', 64),
      repeat('e', 64), encode(extensions.digest(evidence_payload, 'sha256'), 'hex'),
      octet_length(evidence_payload), encode(evidence_payload, 'base64')
    );
    raise exception 'receivables evidence accepted a forged capability';
  exception when insufficient_privilege then null;
  end;

  evidence_result := public.worker_record_receivables_evidence(
    job_id, capability, 'document_layer', '2026.08.28-v1', repeat('d', 64),
    repeat('e', 64), encode(extensions.digest(evidence_payload, 'sha256'), 'hex'),
    octet_length(evidence_payload), encode(evidence_payload, 'base64')
  );
  if evidence_result->>'written' <> 'true' or evidence_result->>'replayed' <> 'false' then
    raise exception 'worker did not persist receivables evidence: %', evidence_result;
  end if;
  evidence_result := public.worker_record_receivables_evidence(
    job_id, capability, 'document_layer', '2026.08.28-v1', repeat('d', 64),
    repeat('e', 64), encode(extensions.digest(evidence_payload, 'sha256'), 'hex'),
    octet_length(evidence_payload), encode(evidence_payload, 'base64')
  );
  if evidence_result->>'written' <> 'false' or evidence_result->>'replayed' <> 'true' then
    raise exception 'receivables evidence replay was not idempotent: %', evidence_result;
  end if;
  begin
    perform public.worker_record_receivables_evidence(
      job_id, capability, 'document_layer', '2026.08.28-v1', repeat('d', 64),
      repeat('f', 64), encode(extensions.digest(evidence_payload, 'sha256'), 'hex'),
      octet_length(evidence_payload), encode(evidence_payload, 'base64')
    );
    raise exception 'receivables evidence accepted an immutable conflict';
  exception when unique_violation then null;
  end;

  result := public.worker_record_candidates(
    job_id,
    capability,
    jsonb_build_array(jsonb_build_object(
      'extractor_key', 'scope.related_company',
      'field_path', 'company.legal_name',
      'field_group', 'company',
      'label', 'Razão social mencionada',
      'raw_value', 'Tenant A Related S.A.',
      'normalized_value', to_jsonb('Tenant A Related S.A.'::text),
      'value_type', 'text',
      'information_class', 'audited',
      'evidence_rank', 1,
      'source_anchor', jsonb_build_object('kind', 'page', 'id', 'p1', 'page', 1),
      'confidence', 0.93,
      -- A worker from before the vocabulary migration may still send its former label.
      -- The command boundary must normalize it to the canonical, schema-valid method.
      'extraction_method', 'model_extraction',
      'anchor_verified', true,
      'anchor_precision', 'page',
      'entity_name', 'Tenant A Related S.A.',
      'entity_scope', 'standalone',
      'verifier_flags', '[]'::jsonb
    ))
  );

  if (
    select extraction_method
    from public.intake_field_candidates
    where organization_id = '20000000-0000-4000-8000-000000000001'
      and intake_session_id = '40000000-0000-4000-8000-000000000003'
      and extractor_key = 'scope.related_company'
  ) <> 'llm_anchored' then
    raise exception 'worker did not normalize legacy model_extraction to llm_anchored';
  end if;

  -- A proposal may be anchored while its value remains unparseable. JSON null is evidence of
  -- that state; it must not become SQL NULL and abort every other candidate in the document.
  result := public.worker_record_candidates(
    job_id,
    capability,
    jsonb_build_array(jsonb_build_object(
      'extractor_key', 'scope.unparseable_number',
      'field_path', 'transaction.requested_amount',
      'field_group', 'transaction',
      'label', 'Valor solicitado',
      'raw_value', 'a definir',
      'normalized_value', 'null'::jsonb,
      'value_type', 'number',
      'information_class', 'company_document',
      'evidence_rank', 7,
      'source_anchor', jsonb_build_object('kind', 'page', 'id', 'p2', 'page', 2),
      'confidence', 0.42,
      'extraction_method', 'llm_anchored',
      'anchor_verified', false,
      'anchor_precision', 'page',
      'verifier_flags', jsonb_build_array('value_unparseable')
    ))
  );

  if (result->>'written')::integer <> 1 then
    raise exception 'worker did not persist the unparseable proposal: %', result;
  end if;

  begin
    perform public.worker_record_analysis_scope_suggestions(
      job_id, repeat('y', 64), gen_random_uuid(),
      jsonb_build_array(jsonb_build_object(
        'suggestionId', 'suggestion:tenant-a-related',
        'entityId', 'entity:tenant-a-related',
        'legalName', 'Tenant A Related S.A.',
        'suggestedRole', 'other'
      ))
    );
    raise exception 'scope suggestion accepted a forged capability';
  exception when insufficient_privilege then null;
  end;

  result := public.worker_record_analysis_scope_suggestions(
    job_id, capability, '51000000-0000-4000-8000-000000000080',
    jsonb_build_array(jsonb_build_object(
      'suggestionId', 'suggestion:tenant-a-related',
      'entityId', 'entity:tenant-a-related',
      'legalName', 'Tenant A Related S.A.',
      'suggestedRole', 'other'
    ))
  );
  if result ->> 'replayed' <> 'false'
    or (select analysis_scope_suggestions #>> '{items,0,status}'
        from public.document_intake_sessions
        where id = '40000000-0000-4000-8000-000000000003') <> 'pending'
    or (select analysis_scope from public.document_intake_sessions
        where id = '40000000-0000-4000-8000-000000000003') is not null then
    raise exception 'worker did not persist a suggestion without expanding analysis scope';
  end if;

  begin
    perform public.worker_record_retrieval_chunks(
      job_id,
      repeat('y', 64),
      '[]'::jsonb
    );
    raise exception 'retrieval indexing accepted a wrong capability';
  exception
    when insufficient_privilege then null;
  end;

  result := public.worker_record_retrieval_chunks(
    job_id,
    capability,
    jsonb_build_array(jsonb_build_object(
      'chunk_key', '50000000-0000-4000-8000-000000000003:v1:p1:1',
      'content', 'Receita, dívida e capacidade de pagamento da expansão aparecem na página um.',
      'content_hash', encode(extensions.digest(
        'Receita, dívida e capacidade de pagamento da expansão aparecem na página um.',
        'sha256'
      ), 'hex'),
      'locale', 'pt-BR',
      'source_anchor', jsonb_build_object('kind', 'page', 'id', 'p1', 'page', 1),
      'tags', jsonb_build_array('page', 'native')
    ))
  );
  if (result->>'written')::integer <> 1 then
    raise exception 'worker did not persist its parser-anchored retrieval chunk: %', result;
  end if;

  result := public.worker_complete_job(job_id, capability, '{"documents":1, "spend": {"costUsd": 0.42, "calls": 3}}'::jsonb);
  if (result->>'pending_jobs')::integer <> 1 then
    raise exception 'the final document did not enqueue case analysis';
  end if;

  -- A document is not a case. The session stays processing until the governed economic rail
  -- finishes and attests its snapshot.
  if (select status from public.document_intake_sessions
      where organization_id = '20000000-0000-4000-8000-000000000001'
        and id = '40000000-0000-4000-8000-000000000003') <> 'processing' then
    raise exception 'the session became reviewable before case analysis';
  end if;

  -- And what it cost is on the run, not only in a log line.
  if (select model_cost_usd from public.processing_runs
      where organization_id = '20000000-0000-4000-8000-000000000001'
        and id = (select processing_run_id from public.processing_jobs where id = job_id)) <> 0.42 then
    raise exception 'the run did not record what the job spent';
  end if;

  -- the capability dies with the job
  begin
    perform public.worker_heartbeat(job_id, capability, 600);
    raise exception 'capability token still worked after the job completed';
  exception
    when insufficient_privilege then null;
  end;

  case_claim := public.worker_claim_job(repeat('w', 64), 600);
  if case_claim->>'kind' <> 'case_analysis' then
    raise exception 'the worker did not claim the governed case-analysis job';
  end if;
  case_job_id := (case_claim->>'job_id')::uuid;
  case_capability := case_claim->>'capability_token';

  case_input := public.worker_load_case_input(case_job_id, case_capability);
  if case_input->'session'->>'id' <> '40000000-0000-4000-8000-000000000003'
    or jsonb_array_length(case_input->'documents') <> 1
    or jsonb_array_length(case_input->'receivables_evidence') <> 1
    or jsonb_array_length(case_input->'receivables_provider_context'->'programs') <> 1
    or jsonb_array_length(case_input->'receivables_provider_context'->'observations') <> 2
    or case_input->'receivables_evidence'->0->>'source_sha256' <> repeat('d', 64) then
    raise exception 'case capability did not load its scoped evidence';
  end if;
  begin
    perform public.worker_load_case_input(case_job_id, repeat('z', 64));
    raise exception 'case input accepted a wrong capability';
  exception
    when insufficient_privilege then null;
  end;

  retrieval := public.worker_load_retrieval_context(
    case_job_id,
    case_capability,
    'expansão OR receita OR mandato OR estrutura',
    array['70000000-0000-4000-8000-000000000701'::uuid],
    null,
    20
  );
  if retrieval->>'playbook_version' <> '2026.08.24-v2'
    or not exists (
      select 1 from jsonb_array_elements(retrieval->'results') entry
      where entry->>'source' = 'case'
    )
    or not exists (
      select 1 from jsonb_array_elements(retrieval->'results') entry
      where entry->>'source' = 'house_playbook'
    )
    or not exists (
      select 1 from jsonb_array_elements(retrieval->'results') entry
      where entry->>'source' = 'mandate_note'
    ) then
    raise exception 'governed retrieval did not return the scoped case, approved playbook and allowed note: %', retrieval;
  end if;

  retrieval := public.worker_load_retrieval_context(
    case_job_id,
    case_capability,
    'mandato OR estrutura',
    '{}'::uuid[],
    null,
    20
  );
  if exists (
    select 1 from jsonb_array_elements(retrieval->'results') entry
    where entry->>'source' = 'mandate_note'
  ) then
    raise exception 'mandate note retrieval bypassed the structured allowed-fund list';
  end if;

  begin
    perform public.worker_load_retrieval_context(
      case_job_id, repeat('z', 64), 'receita', '{}'::uuid[], null, 20
    );
    raise exception 'governed retrieval accepted a forged capability';
  exception
    when insufficient_privilege then null;
  end;

  manifest := jsonb_build_object(
    'schemaVersion', '2026.08.24-v2',
    'caseId', '40000000-0000-4000-8000-000000000003',
    'runId', case_claim->>'processing_run_id',
    'createdAt', '2026-08-24T12:00:00.000Z',
    'locale', 'pt-BR',
    'inputFingerprint', repeat('a', 64),
    'manifestFingerprint', repeat('b', 64),
    'capture', jsonb_build_object('sources', 'complete', 'models', 'complete'),
    'versions', '{}'::jsonb,
    'models', '[]'::jsonb,
    'sources', '[]'::jsonb,
    'outputs', '[]'::jsonb
  );
  manifest_id := public.worker_record_case_snapshot(
    case_job_id,
    case_capability,
    manifest,
    jsonb_build_object('fingerprint', repeat('a', 64), 'locale', 'pt')
  );
  if manifest_id is null then
    raise exception 'case workload did not persist the immutable snapshot';
  end if;
  perform public.worker_write_stage_result(
    case_job_id, case_capability, 'case_analysis', 'succeeded', '{}'::jsonb, '{}'::jsonb
  );
  result := public.worker_complete_job(
    case_job_id, case_capability, '{"spend":{"costUsd":0,"calls":0},"model_lineage":[]}'::jsonb
  );
  if (result->>'pending_jobs')::integer <> 0 then
    raise exception 'case analysis did not finish the run';
  end if;
  if (select status from public.document_intake_sessions
      where organization_id = '20000000-0000-4000-8000-000000000001'
        and id = '40000000-0000-4000-8000-000000000003') <> 'review_ready' then
    raise exception 'case analysis did not move the session to review_ready';
  end if;
end;
$$;

reset role;

do $$
declare
  session_id constant uuid := '40000000-0000-4000-8000-000000000003';
  document_id constant uuid := '50000000-0000-4000-8000-000000000003';
begin
  -- The worker intentionally has no tenant membership, so inspect persistence only after
  -- returning to the database owner. The value must be JSON null, never SQL NULL.
  if not exists (
    select 1
    from public.intake_field_candidates
    where organization_id = '20000000-0000-4000-8000-000000000001'
      and intake_session_id = '40000000-0000-4000-8000-000000000003'
      and extractor_key = 'scope.unparseable_number'
      and normalized_value is not null
      and normalized_value = 'null'::jsonb
  ) then
    raise exception 'worker did not preserve an unparseable proposal as JSON null';
  end if;

  if (select status from public.processing_runs where intake_session_id = session_id) <> 'succeeded' then
    raise exception 'the run did not reach succeeded after its jobs finished';
  end if;
  if (select jsonb_array_length(stages) from public.processing_runs where intake_session_id = session_id) <> 2 then
    raise exception 'the stage timeline was not recorded on the run';
  end if;
  if (select usage->>'input_tokens' from public.processing_runs where intake_session_id = session_id) <> '120' then
    raise exception 'usage was not accumulated on the run';
  end if;
  if (select processing_status from public.source_documents where id = document_id) <> 'ready' then
    raise exception 'the document was not marked ready';
  end if;
  if (select scan_result->>'verdict' from public.source_documents where id = document_id) <> 'clean' then
    raise exception 'the scan verdict was not stored';
  end if;
  if (select document_kind from public.document_profiles where source_document_id = document_id) <> 'audited_financial_statements' then
    raise exception 'the document profile was not classified';
  end if;

  -- a human decision must survive a reprocessing run
  update public.document_profiles set review_state = 'accepted' where source_document_id = document_id;
end;
$$;

-- The derived case index is readable only by its tenant and immutable from the browser. Platform
-- playbooks, mandate notes and precedents are not borrower discovery surfaces.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  accepted boolean;
begin
  if (select count(*) from public.case_retrieval_chunks
      where source_document_id = '50000000-0000-4000-8000-000000000003') <> 1 then
    raise exception 'tenant A could not read its own governed case chunk';
  end if;
  if (select count(*) from public.house_playbook_versions) <> 0
    or (select count(*) from public.house_playbook_chunks) <> 0
    or (select count(*) from public.mandate_note_embeddings) <> 0
    or (select count(*) from public.governed_precedents) <> 0 then
    raise exception 'borrower tenant read an internal retrieval corpus';
  end if;

  accepted := true;
  begin
    insert into public.case_retrieval_chunks (
      organization_id, intake_session_id, source_document_id, document_version,
      processing_run_id, chunk_key, content, content_hash, source_anchor
    ) values (
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      '50000000-0000-4000-8000-000000000003',
      1,
      (select id from public.processing_runs where intake_session_id = '40000000-0000-4000-8000-000000000003' order by run_no limit 1),
      'forged',
      'Conteúdo forjado pelo navegador não pode entrar no índice do próprio caso.',
      repeat('a', 64),
      '{"kind":"page","id":"forged"}'::jsonb
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant inserted its own retrieval evidence'; end if;

  accepted := true;
  begin
    update public.case_retrieval_chunks set content = 'Conteúdo reescrito pelo tenant.'
    where source_document_id = '50000000-0000-4000-8000-000000000003';
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant rewrote a retrieval chunk'; end if;

  accepted := true;
  begin
    delete from public.case_retrieval_chunks
    where source_document_id = '50000000-0000-4000-8000-000000000003';
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant deleted a retrieval chunk'; end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
  true
);

do $$
begin
  if (select count(*) from public.case_retrieval_chunks) <> 0 then
    raise exception 'tenant B read tenant A retrieval chunks';
  end if;
end;
$$;

-- Reprocess the same document: the proposal changes nothing that a human already accepted.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  org constant uuid := '20000000-0000-4000-8000-000000000001';
  session_id constant uuid := '40000000-0000-4000-8000-000000000003';
  document_id constant uuid := '50000000-0000-4000-8000-000000000003';
  result jsonb;
begin
  result := public.begin_processing_run(
    org,
    session_id,
    'reprocess',
    jsonb_build_array(jsonb_build_object(
      'source_document_id', document_id,
      'download_url', 'https://p.supabase.co/storage/v1/object/sign/opportunity-documents/'
        || org::text || '/' || session_id::text || '/df.pdf?token=two',
      'layer_object_path', org::text || '/' || session_id::text || '/df.layer.json',
      'layer_upload_url', 'https://p.supabase.co/storage/v1/object/upload/sign/document-layers/'
        || org::text || '/' || session_id::text || '/df.layer.json'
    )),
    'pipeline-test-v1'
  );
  if (result->>'run_no')::integer <> 2 then
    raise exception 'the reprocessing run did not increment run_no';
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  claim jsonb;
  job_id uuid;
  capability text;
begin
  claim := public.worker_claim_job(repeat('w', 64), 600);
  job_id := (claim->>'job_id')::uuid;
  capability := claim->>'capability_token';

  perform public.worker_record_document_result(
    job_id,
    capability,
    '{"verdict":"clean"}'::jsonb,
    jsonb_build_object(
      'document_kind', 'other',
      'information_class', 'company_document',
      'evidence_rank', 7,
      'confidence', 0.4
    ),
    null
  );
  perform public.worker_complete_job(job_id, capability, '{}'::jsonb);
end;
$$;

reset role;

do $$
declare
  document_id constant uuid := '50000000-0000-4000-8000-000000000003';
begin
  if (select document_kind from public.document_profiles where source_document_id = document_id) <> 'audited_financial_statements' then
    raise exception 'a reprocessing proposal overwrote a human-accepted document profile';
  end if;
  if (select review_state from public.document_profiles where source_document_id = document_id) <> 'accepted' then
    raise exception 'a reprocessing proposal reset a human review state';
  end if;
end;
$$;

-- Information answers belong to the session, and only to members of its organization.
do $$
declare
  org_a constant uuid := '20000000-0000-4000-8000-000000000001';
  session_a constant uuid := '40000000-0000-4000-8000-000000000003';
begin
  insert into public.intake_information_answers (organization_id, intake_session_id, requirement_id, answer, answered_by)
  values (org_a, session_a, 'info_why_now', 'Os pontos comerciais já estão contratados.', '10000000-0000-4000-8000-000000000001');

  if (select count(*) from public.intake_information_answers where organization_id = org_a) <> 1 then
    raise exception 'a member could not record an answer for their own session';
  end if;
end;
$$;

-- The candidate command answers to the capability token and to nothing else.
do $$
begin
  begin
    perform public.worker_record_candidates('00000000-0000-4000-8000-000000000000'::uuid, repeat('z', 40), '[]'::jsonb);
    raise exception 'an unknown capability token wrote candidates';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

reset role;

-- ---------------------------------------------------------------------------------------------
-- Layer storage: the app mints the worker's upload link, so the app needs insert rights on
-- `document-layers` — scoped by the path, which is `<organization_id>/<scope_id>/…`.
-- The worker itself never authenticates against Storage; it PUTs to the signed URL.
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  org_a constant uuid := '20000000-0000-4000-8000-000000000001';
  org_b constant uuid := '20000000-0000-4000-8000-000000000002';
  session_a constant uuid := '40000000-0000-4000-8000-000000000003';
  document_id constant uuid := '50000000-0000-4000-8000-000000000003';
begin
  -- Tenant A may write a layer under its own organization and its own session.
  insert into storage.objects (bucket_id, name, owner)
  values (
    'document-layers',
    org_a || '/' || session_a || '/' || document_id || '/attempt-1.json',
    '10000000-0000-4000-8000-000000000001'
  );

  -- ...and may not write one into another tenant's prefix, however well-formed the path is.
  begin
    insert into storage.objects (bucket_id, name, owner)
    values (
      'document-layers',
      org_b || '/' || session_a || '/' || document_id || '/attempt-2.json',
      '10000000-0000-4000-8000-000000000001'
    );
    raise exception 'a member of tenant A wrote a layer into tenant B''s prefix';
  exception
    when insufficient_privilege then null;
  end;

  -- ...nor one outside any known scope, which is what a path helper returning null looks like.
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('document-layers', 'layers/loose.json', '10000000-0000-4000-8000-000000000001');
    raise exception 'a layer was written outside the organization/scope path convention';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

-- Tenant B sees nothing of tenant A's layer, and cannot write into A's prefix either.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
  true
);

do $$
declare
  org_a constant uuid := '20000000-0000-4000-8000-000000000001';
  session_a constant uuid := '40000000-0000-4000-8000-000000000003';
  document_id constant uuid := '50000000-0000-4000-8000-000000000003';
begin
  if exists (select 1 from public.intake_information_answers) then
    raise exception 'tenant B read an information answer belonging to tenant A';
  end if;

  if exists (select 1 from storage.objects where bucket_id = 'document-layers') then
    raise exception 'tenant B read a document layer belonging to tenant A';
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values (
      'document-layers',
      org_a || '/' || session_a || '/' || document_id || '/attempt-3.json',
      '10000000-0000-4000-8000-000000000002'
    );
    raise exception 'tenant B wrote a layer into tenant A''s prefix';
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

-- Schema invariant: the anonymous role holds no privilege inside the Data API schema.
-- This is the invariant that the project drifted away from: Supabase's bootstrap
-- `alter default privileges in schema public grant all ... to anon, authenticated` kept
-- granting every new table and function to both roles, while the migrations revoked them
-- one table at a time. A fresh local stack has no such defaults, so only an explicit
-- assertion keeps CI and the project honest (fixed in 20260818190000).
do $$
declare
  offending text;
begin
  select string_agg(label, ', ' order by label) into offending
  from (
    select c.relname as label
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
      and (
        has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
        or has_any_column_privilege('anon', c.oid, 'select, insert, update, references')
      )
    union all
    select p.proname || '()'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'execute')
  ) leaked;

  if offending is not null then
    raise exception 'anonymous role holds privileges in schema public: %', offending;
  end if;
end;
$$;

-- Schema invariant: security definer functions live in `private` (AGENTS.md §6); `public`
-- exposes only invoker wrappers, so reaching an implementation always requires two grants.
do $$
declare
  offending text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into offending
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

  if offending is not null then
    raise exception 'security definer functions must live in the private schema: %', offending;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The fund directory is platform data, not tenant data.
--
-- The whole commercial premise is that our map of the market is ours: a company receives
-- conclusions drawn from it, never the boxes. So the first assertion is the strongest one — an
-- ordinary tenant, authenticated and in good standing, reads exactly zero rows.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  fund_id uuid;
  visible integer;
  code text;
begin
  set local role postgres;
  insert into public.fund_directory (legal_name, kind, status)
  values ('Fundo de Teste RLS', 'credit_fund', 'mapped')
  returning id into fund_id;

  insert into public.fund_mandate_observations (fund_id, criterion, value, provenance, observed_at, note)
  values (fund_id, 'ticket', '{"min": "10000000", "max": "60000000"}'::jsonb, 'inferred', current_date, 'seed do teste');

  -- A company tenant, fully authenticated, sees nothing at all.
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );

  select count(*) into visible from public.fund_directory;
  if visible <> 0 then
    raise exception 'a tenant can see % rows of the fund directory', visible;
  end if;

  select count(*) into visible from public.fund_mandate_observations;
  if visible <> 0 then
    raise exception 'a tenant can see % mandate observations', visible;
  end if;

  -- And cannot create a fund record: a fund claims one, it never invents one.
  begin
    insert into public.fund_directory (legal_name, kind) values ('Fundo Inventado', 'credit_fund');
    raise exception 'a tenant inserted into the fund directory';
  exception
    when insufficient_privilege then null;
  end;

  -- Observations are append-only. Update and delete are withheld at the grant, so the failure is
  -- loud (42501) rather than a silent zero-row update.
  begin
    update public.fund_mandate_observations set provenance = 'declared';
    raise exception 'fund_mandate_observations allowed an update';
  exception
    when insufficient_privilege then null;
  end;
  begin
    delete from public.fund_mandate_observations;
    raise exception 'fund_mandate_observations allowed a delete';
  exception
    when insufficient_privilege then null;
  end;

  -- A registered fund reads and declares on its own record, and only its own.
  set local role postgres;
  update public.fund_directory
  -- Use the authenticated fixture's organization explicitly. The fixtures share
  -- the same created_at value, so ordering only by created_at is nondeterministic
  -- and can assign the fund to another tenant depending on the query plan.
  set claimed_by_organization_id = '20000000-0000-4000-8000-000000000001'::uuid,
      claimed_at = now(),
      status = 'registered'
  where id = fund_id;

  set local role authenticated;
  select count(*) into visible from public.fund_directory where id = fund_id;
  if visible <> 1 then
    raise exception 'a registered fund cannot read its own record';
  end if;

  insert into public.fund_mandate_observations (fund_id, criterion, value, provenance, observed_at, recorded_by)
  values (fund_id, 'ticket', '{"min": "20000000", "max": "80000000"}'::jsonb, 'declared', current_date,
          '10000000-0000-4000-8000-000000000001');

  -- But it may only state its own position. Writing an "observed" row would be the subject
  -- editing the evidence about itself.
  begin
    insert into public.fund_mandate_observations (fund_id, criterion, value, provenance, observed_at, recorded_by)
    values (fund_id, 'ticket', '{"min": "1", "max": "2"}'::jsonb, 'observed', current_date,
            '10000000-0000-4000-8000-000000000001');
    raise exception 'a fund wrote an observation it did not declare';
  exception
    when insufficient_privilege then null;
  end;

  -- And it cannot hand its record to somebody else, or rewrite what we researched about it.
  begin
    update public.fund_directory set claimed_by_organization_id = null where id = fund_id;
    raise exception 'a fund released its own claim';
  exception
    when insufficient_privilege then null;
  end;
  begin
    update public.fund_directory set kind = 'bank' where id = fund_id;
    raise exception 'a fund rewrote a column that belongs to our research';
  exception
    when insufficient_privilege then null;
  end;

  set local role postgres;
end;
$$;

-- A receivables program belongs to one exact provider record. Ordinary tenants cannot enumerate
-- programs or mandates; a claimed provider can declare only against its own program, and every
-- observation remains append-only.
do $$
declare
  provider_id uuid;
  program_row_id uuid;
  visible integer;
begin
  set local role postgres;
  insert into public.fund_directory (
    legal_name, kind, status, claimed_by_organization_id, claimed_at
  ) values (
    'Financeira Recebíveis RLS S.A.',
    'credit_finance_company',
    'registered',
    '20000000-0000-4000-8000-000000000003',
    now()
  ) returning id into provider_id;

  insert into public.capital_provider_programs (
    provider_id, program_name, provider_kind, route_ids, status
  ) values (
    provider_id,
    'Desconto mercantil RLS',
    'credit_finance_company',
    array['financial_institution_receivables_discount'],
    'active'
  ) returning id into program_row_id;

  insert into public.fund_mandate_observations (
    fund_id, program_id, criterion, value, provenance, observed_at, valid_until, note
  ) values (
    provider_id,
    program_row_id,
    'available_capacity',
    '"15000000"'::jsonb,
    'conversation',
    current_date,
    current_date + 30,
    'capacidade sintética do teste RLS'
  );

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
    true
  );
  select count(*) into visible from public.capital_provider_programs where id = program_row_id;
  if visible <> 0 then
    raise exception 'an unrelated tenant can read a capital-provider program';
  end if;
  begin
    insert into public.capital_provider_programs (
      provider_id, program_name, provider_kind, route_ids, recorded_by
    ) values (
      provider_id,
      'Programa intruso',
      'credit_finance_company',
      array['financial_institution_receivables_discount'],
      '10000000-0000-4000-8000-000000000002'
    );
    raise exception 'an unrelated tenant inserted a capital-provider program';
  exception
    when insufficient_privilege then null;
  end;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',
    true
  );
  select count(*) into visible from public.capital_provider_programs where id = program_row_id;
  if visible <> 1 then
    raise exception 'the claimed provider cannot read its own capital program';
  end if;
  insert into public.fund_mandate_observations (
    fund_id, program_id, criterion, value, provenance, observed_at, valid_until, recorded_by
  ) values (
    provider_id,
    program_row_id,
    'live_appetite',
    'true'::jsonb,
    'declared',
    current_date,
    current_date + 30,
    '10000000-0000-4000-8000-000000000003'
  );
  begin
    update public.capital_provider_programs
      set provider_id = gen_random_uuid()
      where id = program_row_id;
    raise exception 'a provider rewrote the owner of its capital program';
  exception
    when insufficient_privilege then null;
  end;
  begin
    update public.fund_mandate_observations
      set valid_until = current_date + 60
      where fund_mandate_observations.program_id = program_row_id;
    raise exception 'a provider rewrote append-only program evidence';
  exception
    when insufficient_privilege then null;
  end;

  set local role postgres;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The evidence chain is not writable by the company whose evidence it is.
--
-- This is the invariant the whole product rests on: a number in a memo links back to the
-- document, the page and the cell. It is worth exactly as much as the narrowest thing a tenant
-- can write, and for weeks the grants were whole-table, so a PATCH went around all nine
-- determinism mechanisms at once.
--
-- Asserted as a grant check rather than as a behavioural test on purpose. A behavioural test
-- proves one path is closed; this proves there is no path, including one a future migration adds
-- by writing `grant update on ... to authenticated` out of habit.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  offending text;
begin
  select string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name)
  into offending
  from information_schema.role_column_grants
  where table_schema = 'public'
    and grantee = 'authenticated'
    and privilege_type = 'UPDATE'
    and (
      (table_name = 'intake_field_candidates')
      or (table_name = 'document_profiles')
      -- Attaching a document to the opportunity at confirmation is the one legitimate direct
      -- write. Everything else about a document is the system's judgement.
      or (table_name = 'source_documents' and column_name <> 'opportunity_id')
    );

  if offending is not null then
    raise exception 'a tenant can rewrite its own evidence: %', offending;
  end if;
end;
$$;

-- The same tables, on insert: a browser may say where the object is and what it hashed to, and
-- may not declare a document audited, classified or already verified.
do $$
declare
  offending text;
begin
  select string_agg(column_name, ', ' order by column_name) into offending
  from information_schema.role_column_grants
  where table_schema = 'public'
    and table_name = 'source_documents'
    and grantee = 'authenticated'
    and privilege_type = 'INSERT'
    and column_name in ('sha256_verified_at', 'evidence_rank', 'document_kind', 'classification', 'processing_status');

  if offending is not null then
    raise exception 'a tenant can assert a document is trusted at insert: %', offending;
  end if;
end;
$$;

-- Grant parity across every public wrapper that delegates into `private`.
--
-- Every `public.worker_*` wrapper is `security invoker`, so calling one runs as the caller and the
-- caller needs execute on the `private` implementation it delegates to. `worker_record_candidates`
-- had the wrapper grant and not the implementation grant, which made the gap invisible to anything
-- that inspected the public surface, and meant every real run died at the last write after paying
-- for the whole pipeline. Proven by calling both as `authenticated`: one answered "permission
-- denied for function", the other answered "worker_token_invalid", which is the body refusing a
-- bad token.
--
-- So the invariant is parity, not absence: a wrapper that is executable must have an executable
-- implementation, or it is a trap. The capability token is what protects these, and it is checked
-- inside the implementation.
do $$
declare
  offending text;
begin
  select string_agg(wrapper.proname, ', ' order by wrapper.proname) into offending
  from pg_proc wrapper
  join pg_namespace wrapper_ns on wrapper_ns.oid = wrapper.pronamespace
  join pg_proc impl on impl.proname = wrapper.proname
  join pg_namespace impl_ns on impl_ns.oid = impl.pronamespace
  where wrapper_ns.nspname = 'public'
    and impl_ns.nspname = 'private'
    and has_function_privilege('authenticated', wrapper.oid, 'execute')
    and not has_function_privilege('authenticated', impl.oid, 'execute');

  if offending is not null then
    raise exception 'a public wrapper is granted while its private implementation is not: %', offending;
  end if;
end;
$$;

-- And nothing that is not a wrapper's implementation is reachable. `worker_identity` maps a raw
-- token to a service account and is called only from inside `worker_claim_job`; there is no caller
-- outside that needs it.
do $$
begin
  if has_function_privilege('authenticated', 'private.worker_identity(text)', 'execute') then
    raise exception 'private.worker_identity is directly executable by authenticated';
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);

-- The job payload's URLs are bound to the document they claim to carry.
--
-- `begin_processing_run` is granted to `authenticated`, so `download_url` and
-- `layer_upload_url` are, in the worst case, written by a tenant member calling the Data API
-- rather than by the application that signs them. A worker that acted on them as given would
-- be a request forwarder inside our AWS account with a task role attached, and
-- `http://169.254.170.2/v2/credentials/...` is where that role is handed out.
do $$
declare
  org uuid := '20000000-0000-4000-8000-000000000001';
  session_id uuid := '40000000-0000-4000-8000-0000000000f1';
  doc_id uuid := '50000000-0000-4000-8000-0000000000f1';
  path text;
  accepted boolean;
begin
  path := org::text || '/' || session_id::text || '/probe.pdf';

  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values (session_id, org, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR');
  perform public.register_intake_document_command(
    org, session_id, '51000000-0000-4000-8000-000000000005', doc_id,
    'opportunity-documents', path, 'probe.pdf', 'application/pdf', 10, repeat('9', 64)
  );

  -- The ECS task credential endpoint, which is the vector this check exists for.
  accepted := true;
  begin
    perform public.begin_processing_run(org, session_id, 'manual',
      jsonb_build_array(jsonb_build_object('source_document_id', doc_id,
        'download_url', 'http://169.254.170.2/v2/credentials/abc')), 'test');
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'begin_processing_run accepted a download_url pointing at the metadata endpoint'; end if;

  -- The expected object path smuggled into a query string on somebody else's host: the check
  -- has to read the Storage part of the URL, not merely find the text somewhere in it.
  accepted := true;
  begin
    perform public.begin_processing_run(org, session_id, 'manual',
      jsonb_build_array(jsonb_build_object('source_document_id', doc_id,
        'download_url', 'https://evil.example/?p=' || path)), 'test');
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'begin_processing_run accepted a foreign host carrying the object path in its query string'; end if;

  -- A layer written outside `<organization>/<session>/`, which is the prefix the Storage
  -- policies parse into a tenant.
  accepted := true;
  begin
    perform public.begin_processing_run(org, session_id, 'manual',
      jsonb_build_array(jsonb_build_object('source_document_id', doc_id,
        'layer_object_path', 'someone-else/session/x.json',
        'layer_upload_url', 'https://p.supabase.co/storage/v1/object/upload/sign/l/someone-else/session/x.json')), 'test');
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'begin_processing_run accepted a layer path outside the session prefix'; end if;

  -- And the links the application actually signs still start a run, or this check would have
  -- closed the hole by breaking the product.
  perform public.begin_processing_run(org, session_id, 'manual',
    jsonb_build_array(jsonb_build_object('source_document_id', doc_id,
      'download_url', 'https://p.supabase.co/storage/v1/object/sign/opportunity-documents/' || path || '?token=x',
      'layer_object_path', org::text || '/' || session_id::text || '/' || doc_id::text || '/1.json',
      'layer_upload_url', 'https://p.supabase.co/storage/v1/object/upload/sign/document-layers/'
        || org::text || '/' || session_id::text || '/' || doc_id::text || '/1.json')), 'test');
end;
$$;

-- `object_path` is the string the Storage policies parse. The atomic registration command may
-- never register another tenant's object under the authenticated tenant's session.
do $$
declare
  accepted boolean := true;
begin
  begin
    perform public.register_intake_document_command(
      '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-0000000000f1',
      '51000000-0000-4000-8000-0000000000f2', '50000000-0000-4000-8000-0000000000f2',
      'opportunity-documents', '20000000-0000-4000-8000-000000000002/x/y.pdf',
      'y.pdf', 'application/pdf', 10, repeat('7', 64)
    );
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'document command accepted an object_path under another organization'; end if;
end;
$$;

-- The month's ceiling refuses the next run and never the one in flight.
--
-- The two halves are equally load-bearing. A ceiling that let spending run is pointless; a
-- ceiling that stopped a case halfway would be worse than no ceiling at all, because the
-- company mid-analysis is the one least able to do anything about a limit it cannot see.
do $$
declare
  org uuid := '20000000-0000-4000-8000-000000000001';
  session_id uuid := '40000000-0000-4000-8000-0000000000f3';
  doc_id uuid := '50000000-0000-4000-8000-0000000000f3';
  path text;
  first_run jsonb;
  run_id uuid;
  accepted boolean;
  link text;
begin
  path := org::text || '/' || session_id::text || '/spend.pdf';
  link := 'https://p.supabase.co/storage/v1/object/sign/opportunity-documents/' || path;

  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values (session_id, org, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR');
  perform public.register_intake_document_command(
    org, session_id, '51000000-0000-4000-8000-000000000006', doc_id,
    'opportunity-documents', path, 'spend.pdf', 'application/pdf', 10, repeat('5', 64)
  );

  first_run := public.begin_processing_run(org, session_id, 'manual',
    jsonb_build_array(jsonb_build_object('source_document_id', doc_id, 'download_url', link)), 'test');
  run_id := (first_run->>'processing_run_id')::uuid;

  -- Put the month over the ceiling by recording what that run cost.
  set local role postgres;
  update public.processing_runs set model_cost_usd = 10000 where id = run_id;
  set local role authenticated;

  if private.month_spend_usd(org) < 10000 then
    raise exception 'the month total does not see the run it is made of';
  end if;

  -- The run in flight keeps its status and its jobs. Nothing reaches back into it.
  if (select status from public.processing_runs where id = run_id) <> 'queued' then
    raise exception 'the ceiling changed the status of a run already in flight';
  end if;
  if (select count(*) from public.processing_jobs where processing_run_id = run_id) <> 1 then
    raise exception 'the ceiling removed the jobs of a run already in flight';
  end if;

  -- The next run is refused, and leaves nothing behind.
  accepted := true;
  begin
    perform public.begin_processing_run(org, session_id, 'manual',
      jsonb_build_array(jsonb_build_object('source_document_id', doc_id, 'download_url', link)), 'test');
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'begin_processing_run started a run past the month ceiling'; end if;
  if (select count(*) from public.processing_runs where intake_session_id = session_id) <> 1 then
    raise exception 'a refused run left a row behind';
  end if;

  -- Raising the ceiling releases it again, so this is a limit and not a dead end.
  set local role postgres;
  update public.organizations set model_monthly_ceiling_usd = 20000 where id = org;
  set local role authenticated;

  perform public.begin_processing_run(org, session_id, 'manual',
    jsonb_build_array(jsonb_build_object('source_document_id', doc_id, 'download_url', link)), 'test');
end;
$$;

-- And a tenant cannot raise its own ceiling. The update grant on `organizations` is stated
-- column by column, so this holds for any column added later without anyone remembering to.
do $$
begin
  if has_column_privilege('authenticated', 'public.organizations', 'model_monthly_ceiling_usd', 'update') then
    raise exception 'a tenant can raise its own model spend ceiling';
  end if;
end;
$$;

-- The session's state machine is not writable by the company whose session it is.
--
-- `status` is the precondition every intake command reads: `begin_processing_run`,
-- `complete_intake_processing` and `confirm_document_intake` all refuse a confirmed session. A
-- member who could PATCH the column could skip the confirmation command entirely, or set a
-- confirmed case back to `collecting` and reopen something already sent. The same grant covered
-- `pipeline_version` (which extractor produced this evidence) and `result_summary` (the
-- readiness, the capacity, the term sheet and the brief).
do $$
declare
  org uuid := '20000000-0000-4000-8000-000000000001';
  session_id uuid := '40000000-0000-4000-8000-0000000000f4';
  accepted boolean;
begin
  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values (session_id, org, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR');

  -- What the company answers about itself stays its own to change, through the atomic command
  -- that writes the projection and immutable history together.
  perform public.record_intake_capital_need_command(
    org, session_id, '51000000-0000-4000-8000-000000000007', 'working_capital',
    null, 40000000, 'BRL', null, 48, null, null, 'varejo', 'BR',
    '{}'::text[], '{}'::text[], null
  );

  accepted := true;
  begin
    update public.document_intake_sessions set status = 'confirmed'
    where organization_id = org and id = session_id;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'a tenant can write its own session status'; end if;

  accepted := true;
  begin
    update public.document_intake_sessions set pipeline_version = 'not-what-ran'
    where organization_id = org and id = session_id;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'a tenant can rewrite which extractor produced its evidence'; end if;

  accepted := true;
  begin
    update public.document_intake_sessions set result_summary = '{"brief": "forged"}'::jsonb
    where organization_id = org and id = session_id;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'a tenant can author its own analysis'; end if;

  accepted := true;
  begin
    update public.document_intake_sessions set confirmed_at = now(), opportunity_id = gen_random_uuid()
    where organization_id = org and id = session_id;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'a tenant can confirm its own session without the command'; end if;

  -- The analysis command merges rather than replaces, so two writers cannot drop each other's
  -- keys the way the read-modify-write in the application could.
  perform public.record_intake_analysis(org, session_id, '{"readiness": {"score": 1}}'::jsonb);
  perform public.record_intake_analysis(org, session_id, '{"case_run": "abc"}'::jsonb);
  if (select count(*) from jsonb_object_keys(
        (select result_summary from public.document_intake_sessions where id = session_id)) as k) <> 2 then
    raise exception 'record_intake_analysis replaced the summary instead of merging into it';
  end if;
end;
$$;

-- And a confirmed case is closed. Once it has been sent, nobody rewrites the analysis that went
-- with it, which is the half of a terminal state that actually matters.
do $$
declare
  org uuid := '20000000-0000-4000-8000-000000000001';
  session_id uuid := '40000000-0000-4000-8000-0000000000f5';
  opportunity_id uuid;
  accepted boolean;
begin
  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values (session_id, org, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR');

  opportunity_id := public.create_opportunity_intake(
    org, 'Terminal SA', 'varejo', 'capital de giro', 40000000, 'BRL', 48, 'pt-BR');

  -- The manual path's confirmation: one command where the application used to do three writes.
  perform public.attach_intake_session_to_opportunity(org, session_id, opportunity_id);
  if (select status from public.document_intake_sessions where id = session_id) <> 'confirmed' then
    raise exception 'attach_intake_session_to_opportunity did not confirm the session';
  end if;

  accepted := true;
  begin
    perform public.record_intake_analysis(org, session_id, '{"brief": "rewritten after sending"}'::jsonb);
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'the analysis of a confirmed case was rewritten'; end if;

  accepted := true;
  begin
    perform public.fail_intake_session(org, session_id, 'retroactive failure');
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'a confirmed case was failed retroactively'; end if;
end;
$$;

-- A command that takes an organization id by argument proves membership itself.
--
-- This is the invariant that `security definer` turns from a nicety into the only thing there
-- is. While these ran as their caller, RLS filtered the row and an argument naming another
-- tenant simply matched nothing. Running as the owner, RLS is not consulted at all, and a
-- command that trusted its argument would write into any session in the database. Two of the
-- four were in exactly that state when they were moved, and the check went in first.
do $$
declare
  org_a uuid := '20000000-0000-4000-8000-000000000001';
  session_id uuid := '40000000-0000-4000-8000-0000000000f6';
  accepted boolean;
begin
  set local role postgres;
  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values (session_id, org_a, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR');

  -- Tenant B, naming tenant A's organization and session by argument.
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
    true
  );

  accepted := true;
  begin
    perform public.claim_case_brief(org_a, session_id);
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'claim_case_brief accepted an organization the caller does not belong to'; end if;

  accepted := true;
  begin
    perform public.record_case_model_spend(org_a, session_id, 999, 999);
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'record_case_model_spend accepted an organization the caller does not belong to'; end if;

  accepted := true;
  begin
    perform public.begin_intake_processing(org_a, session_id);
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'begin_intake_processing accepted an organization the caller does not belong to'; end if;

  accepted := true;
  begin
    perform public.record_intake_analysis(org_a, session_id, '{"brief": "from another tenant"}'::jsonb);
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'record_intake_analysis accepted an organization the caller does not belong to'; end if;

  -- Nothing of tenant B's reached the row.
  set local role postgres;
  if (select result_summary from public.document_intake_sessions where id = session_id) <> '{}'::jsonb then
    raise exception 'a refused cross-tenant command still wrote to the session';
  end if;
  if (select status from public.document_intake_sessions where id = session_id) <> 'collecting' then
    raise exception 'a refused cross-tenant command still moved the session';
  end if;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );

  -- And the owner's own calls still work, or this would be a lock rather than a boundary.
  if public.claim_case_brief(org_a, session_id) <> true then
    raise exception 'the session owner could not claim its own brief';
  end if;
  if public.claim_case_brief(org_a, session_id) <> false then
    raise exception 'the brief lease let a second claim through';
  end if;
  perform public.record_case_model_spend(org_a, session_id, 1.25, 3);
  if (select (result_summary ->> 'model_spend_usd')::numeric
      from public.document_intake_sessions where id = session_id) <> 1.25 then
    raise exception 'record_case_model_spend did not accumulate the owner''s spend';
  end if;
end;
$$;

-- Case snapshots are atomic, append-only and tenant isolated. Model lineage is exposed only as
-- the content-free fingerprints written by the worker, never through the internal job payload.
do $$
declare
  org_a constant uuid := '20000000-0000-4000-8000-000000000001';
  session_id constant uuid := '40000000-0000-4000-8000-0000000000f7';
  run_id constant uuid := '60000000-0000-4000-8000-0000000000f7';
  claim jsonb;
  job_id uuid;
  capability text;
  first_id uuid;
  second_id uuid;
  decision_id uuid;
  manifest jsonb;
  collision_manifest jsonb;
  lineage jsonb;
  decisions jsonb;
  case_state jsonb;
  accepted boolean;
begin
  set local role postgres;
  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values (session_id, org_a, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR');
  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
  ) values (
    run_id, org_a, session_id, 1, 'manual', 'running', 'test-pipeline',
    '10000000-0000-4000-8000-000000000001'
  );
  insert into public.processing_jobs (
    organization_id, processing_run_id, intake_session_id, kind, status, available_at
  ) values (
    org_a, run_id, session_id, 'case_analysis', 'queued', '2000-01-01T00:00:00Z'
  );

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',
    true
  );

  claim := public.worker_claim_job(repeat('w', 64), 600);
  if claim->>'kind' <> 'case_analysis' or (claim->>'processing_run_id')::uuid <> run_id then
    raise exception 'worker did not claim the isolated case snapshot job';
  end if;
  job_id := (claim->>'job_id')::uuid;
  capability := claim->>'capability_token';

  manifest := jsonb_build_object(
    'schemaVersion', '2026.08.24-v2', 'caseId', session_id::text, 'runId', run_id::text,
    'createdAt', '2026-08-24T12:00:00.000Z', 'locale', 'pt-BR',
    'inputFingerprint', repeat('d', 64), 'manifestFingerprint', repeat('e', 64),
    'capture', jsonb_build_object('sources', 'complete', 'models', 'complete'),
    'versions', '{}'::jsonb, 'models', '[]'::jsonb, 'sources', '[]'::jsonb,
    'outputs', '[]'::jsonb
  );
  case_state := jsonb_build_object(
    'fingerprint', repeat('d', 64),
    'locale', 'pt',
    'claimRegistry', jsonb_build_object(
      'fingerprint', repeat('f', 64),
      'claims', jsonb_build_array(jsonb_build_object(
        'id', 'assessment',
        'fingerprint', repeat('c', 64),
        'kind', 'judgment',
        'material', true
      ))
    )
  );

  -- A fingerprint can be retried for the exact same immutable artifact, but it can never be
  -- rebound to another case. The earlier worker test already owns fingerprint b in this tenant.
  collision_manifest := manifest || jsonb_build_object('manifestFingerprint', repeat('b', 64));
  accepted := true;
  begin
    perform public.worker_record_case_snapshot(
      job_id, capability, collision_manifest,
      case_state
    );
  exception when unique_violation then accepted := false;
  end;
  if accepted then raise exception 'a manifest fingerprint was rebound to a different case'; end if;

  first_id := public.worker_record_case_snapshot(
    job_id, capability, manifest, case_state
  );
  second_id := public.worker_record_case_snapshot(
    job_id, capability, manifest, case_state
  );
  if first_id is distinct from second_id then
    raise exception 'record_case_snapshot was not idempotent';
  end if;

  -- Only a current material judgment can be decided. The command derives the actor and binds
  -- the decision to the immutable manifest already recorded by the worker.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );
  decision_id := public.record_claim_decision(
    org_a, session_id, 'assessment', repeat('c', 64), 'approved', 'A conclusão foi revisada contra as evidências citadas.'
  );
  if decision_id is null or (select count(*) from public.claim_decisions where id = decision_id) <> 1 then
    raise exception 'the current material judgment decision was not persisted';
  end if;

  accepted := true;
  begin
    perform public.record_claim_decision(
      org_a, session_id, 'assessment', repeat('9', 64), 'approved', 'Tentativa com versão antiga.'
    );
  exception when invalid_parameter_value then accepted := false;
  end;
  if accepted then raise exception 'a stale claim fingerprint was approved'; end if;

  -- The browser can append through the command, never forge, rewrite or delete the ledger.
  accepted := true;
  begin
    insert into public.claim_decisions (
      organization_id, intake_session_id, source_manifest_id, source_registry_fingerprint,
      claim_id, claim_fingerprint, decision, reason, decided_by
    ) values (
      org_a, session_id, first_id, repeat('f', 64), 'forged', repeat('1', 64),
      'approved', 'forged', '10000000-0000-4000-8000-000000000001'
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant directly inserted a claim decision'; end if;

  accepted := true;
  begin
    update public.claim_decisions set reason = 'rewritten' where id = decision_id;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant rewrote an append-only claim decision'; end if;

  accepted := true;
  begin
    delete from public.claim_decisions where id = decision_id;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant deleted an append-only claim decision'; end if;

  -- The active worker capability sees only this case's decision trail.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',
    true
  );
  decisions := public.worker_load_claim_decisions(job_id, capability);
  if jsonb_array_length(decisions) <> 1
    or decisions -> 0 ->> 'claimId' <> 'assessment'
    or decisions -> 0 ->> 'decision' <> 'approved' then
    raise exception 'worker did not load the scoped claim decision trail: %', decisions;
  end if;

  perform public.worker_complete_job(job_id, capability, jsonb_build_object(
    'spend', jsonb_build_object('costUsd', 0.01, 'calls', 1),
    'model_lineage', jsonb_build_array(jsonb_build_object(
      'invocationId', '11111111-1111-4111-8111-111111111111',
      'task', 'case_brief', 'provider', 'openai', 'model', 'gpt-test', 'effort', 'medium',
      'outcome', 'ok', 'promptFingerprint', repeat('1', 64),
      'inputFingerprint', repeat('2', 64), 'outputFingerprint', repeat('3', 64),
      'usage', jsonb_build_object('inputTokens', 10, 'outputTokens', 2, 'cachedInputTokens', 0),
      'costUsd', 0.01, 'latencyMs', 12, 'stopReason', 'end',
      'usedFallback', false, 'fromCassette', false, 'schemaName', 'case_brief'
    ))
  ));

  set local role postgres;
  if (select count(*) from public.case_artifact_manifests where intake_session_id = session_id) <> 1 then
    raise exception 'duplicate immutable manifests were inserted';
  end if;
  if (select result_summary -> 'case_manifest' ->> 'id' from public.document_intake_sessions where id = session_id) <> first_id::text then
    raise exception 'case snapshot and manifest were not persisted atomically';
  end if;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );
  if (select count(*) from public.case_artifact_manifests where id = first_id) <> 1 then
    raise exception 'the case owner could not read the worker manifest';
  end if;

  lineage := public.read_processing_model_lineage(org_a, session_id, run_id);
  if (lineage ->> 'expected_calls')::integer <> 1
    or (lineage ->> 'captured_calls')::integer <> 1
    or jsonb_array_length(lineage -> 'calls') <> 1 then
    raise exception 'content-free model lineage did not round-trip';
  end if;

  accepted := true;
  begin
    insert into public.case_artifact_manifests (
      organization_id, intake_session_id, schema_version, locale, input_fingerprint,
      manifest_fingerprint, manifest, created_by
    ) values (
      org_a, session_id, 'forged', 'pt-BR', repeat('c', 64), repeat('d', 64), '{}'::jsonb,
      '10000000-0000-4000-8000-000000000001'
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant directly inserted an artifact manifest'; end if;

  accepted := true;
  begin
    update public.case_artifact_manifests set schema_version = 'rewritten' where id = first_id;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant rewrote an immutable artifact manifest'; end if;

  accepted := true;
  begin
    delete from public.case_artifact_manifests where id = first_id;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant deleted an immutable artifact manifest'; end if;

  accepted := true;
  begin
    perform public.record_case_snapshot(org_a, session_id, run_id, manifest, '{}'::jsonb);
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant browser retained the retired case snapshot write path'; end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
    true
  );
  if (select count(*) from public.case_artifact_manifests where id = first_id) <> 0 then
    raise exception 'tenant B read tenant A manifest';
  end if;
  if (select count(*) from public.claim_decisions where id = decision_id) <> 0 then
    raise exception 'tenant B read tenant A claim decision';
  end if;
  accepted := true;
  begin
    perform public.record_claim_decision(
      org_a, session_id, 'assessment', repeat('c', 64), 'approved', 'Tentativa de outro tenant.'
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant B approved tenant A claim'; end if;
  accepted := true;
  begin
    perform public.worker_load_case_input(job_id, repeat('z', 64));
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant B loaded a case through a forged capability'; end if;

  set local role anon;
  accepted := true;
  begin
    perform public.read_processing_model_lineage(org_a, session_id, run_id);
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'anonymous caller read processing model lineage'; end if;
end;
$$;

-- Controlled production is a separate ledger: the worker freezes the input once, browser
-- sessions can read only their own content-free status, and no tenant can promote itself or
-- manufacture a shadow comparison.
do $$
declare
  org_a constant uuid := '20000000-0000-4000-8000-000000000001';
  session_id constant uuid := '72000000-0000-4000-8000-000000000001';
  run_id constant uuid := '72000000-0000-4000-8000-000000000002';
  execution_id constant uuid := '72000000-0000-4000-8000-000000000003';
  job_id uuid;
  capability text;
  claim jsonb;
  frozen jsonb;
  accepted boolean;
begin
  set local role postgres;
  insert into public.document_intake_sessions (
    id, organization_id, started_by, journey, locale, status, current_run_id, pipeline_version
  ) values (
    session_id, org_a, '10000000-0000-4000-8000-000000000001',
    'company', 'pt-BR', 'processing', null, 'test-controlled'
  );
  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
  ) values (
    run_id, org_a, session_id, 1, 'manual', 'running', 'test-controlled',
    '10000000-0000-4000-8000-000000000001'
  );
  update public.document_intake_sessions set current_run_id = run_id where id = session_id;
  insert into public.controlled_case_executions (
    id, organization_id, intake_session_id, processing_run_id, mode, status,
    pipeline_version, model_policy_version, created_by
  ) values (
    execution_id, org_a, session_id, run_id, 'primary', 'queued',
    'test-controlled', 'test-model-policy', '10000000-0000-4000-8000-000000000001'
  );
  insert into public.processing_jobs (
    organization_id, processing_run_id, intake_session_id, kind, status, available_at,
    controlled_execution_id, payload
  ) values (
    org_a, run_id, session_id, 'case_analysis', 'queued', '2000-01-01T00:00:00Z',
    execution_id, jsonb_build_object(
      'locale', 'pt-BR', 'execution_id', execution_id, 'execution_mode', 'primary'
    )
  );

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',
    true
  );
  claim := public.worker_claim_job(repeat('w', 64), 600);
  if claim ->> 'kind' <> 'case_analysis' then raise exception 'controlled case job was not claimed'; end if;
  job_id := (claim ->> 'job_id')::uuid;
  capability := claim ->> 'capability_token';

  frozen := public.worker_freeze_case_input(
    job_id, capability,
    jsonb_build_object(
      'session', jsonb_build_object('id', session_id, 'locale', 'pt-BR'),
      'facts', jsonb_build_array(jsonb_build_object('field', 'company.name', 'value', 'RLS Tenant A'))
    )
  );
  if frozen -> '_execution' ->> 'id' <> execution_id::text
    or frozen -> '_execution' ->> 'mode' <> 'primary'
    or (frozen -> '_execution' ->> 'input_fingerprint') !~ '^[0-9a-f]{64}$' then
    raise exception 'worker did not receive the frozen controlled input';
  end if;

  perform public.worker_record_controlled_execution(
    job_id, capability,
    jsonb_build_object('status', 'succeeded', 'reportFingerprint', repeat('7', 64)),
    jsonb_build_object('manifestFingerprint', repeat('8', 64)),
    null
  );
  -- At-least-once delivery may repeat the same write, but it may never replace the first result.
  perform public.worker_record_controlled_execution(
    job_id, capability,
    jsonb_build_object('status', 'succeeded', 'reportFingerprint', repeat('7', 64)),
    jsonb_build_object('manifestFingerprint', repeat('8', 64)),
    null
  );
  accepted := true;
  begin
    perform public.worker_record_controlled_execution(
      job_id, capability,
      jsonb_build_object('status', 'succeeded', 'reportFingerprint', repeat('6', 64)),
      jsonb_build_object('manifestFingerprint', repeat('8', 64)),
      null
    );
  exception when unique_violation then accepted := false;
  end;
  if accepted then raise exception 'worker replaced an immutable controlled result'; end if;
  perform public.worker_complete_job(job_id, capability, jsonb_build_object(
    'spend', jsonb_build_object('costUsd', 0, 'calls', 0)
  ));

  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );
  if (select count(*) from public.controlled_case_executions where id = execution_id and status = 'succeeded') <> 1 then
    raise exception 'case owner could not read its controlled execution';
  end if;
  if (select state from public.organization_rollout_policies where organization_id = org_a) is null then
    raise exception 'case owner could not read its rollout status';
  end if;

  accepted := true;
  begin
    update public.organization_rollout_policies
    set state = 'active', external_release_enabled = true
    where organization_id = org_a;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant promoted its own rollout'; end if;

  accepted := true;
  begin
    insert into public.case_execution_comparisons (
      organization_id, baseline_execution_id, candidate_execution_id, mode,
      comparable, passed, critical_count, warning_count, differences, comparison_fingerprint
    ) values (
      org_a, execution_id, execution_id, 'shadow', true, true, 0, 0, '[]'::jsonb, repeat('9', 64)
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant forged a controlled comparison'; end if;

  accepted := true;
  begin
    perform public.worker_freeze_case_input(job_id, repeat('z', 64), '{}'::jsonb);
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'forged capability loaded a frozen input'; end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
    true
  );
  if (select count(*) from public.controlled_case_executions where id = execution_id) <> 0 then
    raise exception 'tenant B read tenant A controlled execution';
  end if;
  if (select count(*) from public.organization_rollout_policies where organization_id = org_a) <> 0 then
    raise exception 'tenant B read tenant A rollout policy';
  end if;
end;
$$;

-- Adaptive-intake commands make the immutable stream and the mutable projections one atomic
-- boundary. Retries replay the first result; a reused key with different content fails closed.
do $$
declare
  org_a constant uuid := '20000000-0000-4000-8000-000000000001';
  session_id constant uuid := '73000000-0000-4000-8000-000000000001';
  frame_event constant uuid := '73000000-0000-4000-8000-000000000002';
  route_event constant uuid := '73000000-0000-4000-8000-000000000003';
  scope_event constant uuid := '73000000-0000-4000-8000-000000000014';
  early_triage_event constant uuid := '73000000-0000-4000-8000-000000000015';
  group_scope_event constant uuid := '73000000-0000-4000-8000-000000000016';
  capital_event constant uuid := '73000000-0000-4000-8000-000000000004';
  document_id constant uuid := '73000000-0000-4000-8000-000000000005';
  receipt_event constant uuid := '73000000-0000-4000-8000-000000000006';
  removal_event constant uuid := '73000000-0000-4000-8000-000000000007';
  answer_event constant uuid := '73000000-0000-4000-8000-000000000008';
  clear_event constant uuid := '73000000-0000-4000-8000-000000000009';
  terminal_answer_event constant uuid := '73000000-0000-4000-8000-000000000010';
  blocked_capital_event constant uuid := '73000000-0000-4000-8000-000000000011';
  blocked_answer_event constant uuid := '73000000-0000-4000-8000-000000000012';
  opportunity_document constant uuid := '73000000-0000-4000-8000-000000000013';
  accessible_opportunity uuid;
  outcome jsonb;
  accepted boolean;
begin
  set local role postgres;
  insert into public.document_intake_sessions (
    id, organization_id, started_by, journey, locale
  ) values (
    session_id, org_a, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR'
  );

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );

  select opportunity.id into accessible_opportunity
  from public.opportunities opportunity
  where opportunity.organization_id = org_a
  order by opportunity.created_at
  limit 1;
  if accessible_opportunity is null then
    raise exception 'adaptive intake test needs one accessible opportunity fixture';
  end if;
  insert into public.source_documents (
    id, organization_id, opportunity_id, intake_session_id, bucket_id, object_path,
    original_name, mime_type, sha256, byte_size, created_by
  ) values (
    opportunity_document, org_a, accessible_opportunity, null, 'opportunity-documents',
    org_a::text || '/' || accessible_opportunity::text || '/direct-opportunity.pdf',
    'direct-opportunity.pdf', 'application/pdf', repeat('e', 64), 1024,
    '10000000-0000-4000-8000-000000000001'
  );
  if not exists (select 1 from public.source_documents where id = opportunity_document) then
    raise exception 'opportunity-scoped direct document insert regressed';
  end if;

  outcome := public.set_intake_operation_context_command(
    org_a, session_id, frame_event, route_event, scope_event, null,
    early_triage_event, group_scope_event, 'growth_expansion', 'medium',
    'Finalidade declarada pelo membro autorizado no intake guiado.',
    array['documentos classificados', 'detalhes da necessidade de capital'], null, null, null
  );
  if outcome #>> '{frame,replayed}' <> 'false'
    or outcome #>> '{route,replayed}' <> 'false'
    or outcome #>> '{scope,replayed}' <> 'false'
    or outcome #>> '{earlyTriage,replayed}' <> 'false'
    or outcome #>> '{groupScope,replayed}' <> 'false'
    or (select archetype from public.document_intake_sessions where id = session_id) <> 'growth_expansion'
    or (select analysis_scope #>> '{entities,0,entityId}' from public.document_intake_sessions where id = session_id)
      <> 'organization:' || org_a::text
    or (select route_checks #>> '{early_triage,outcome}' from public.document_intake_sessions where id = session_id) <> 'clear'
    or (select count(*) from public.intake_domain_events where intake_session_id = session_id) <> 5 then
    raise exception 'operation context command did not atomically record frame, route, scope and triage';
  end if;

  outcome := public.set_intake_operation_context_command(
    org_a, session_id, frame_event, route_event, scope_event, null,
    early_triage_event, group_scope_event, 'growth_expansion', 'medium',
    'Finalidade declarada pelo membro autorizado no intake guiado.',
    array['documentos classificados', 'detalhes da necessidade de capital'], null, null, null
  );
  if outcome #>> '{frame,replayed}' <> 'true'
    or outcome #>> '{route,replayed}' <> 'true'
    or outcome #>> '{scope,replayed}' <> 'true'
    or (select count(*) from public.intake_domain_events where intake_session_id = session_id) <> 5 then
    raise exception 'operation context command is not idempotent';
  end if;

  accepted := true;
  begin
    perform public.set_intake_operation_context_command(
      org_a, session_id, frame_event, route_event, scope_event, null,
      early_triage_event, group_scope_event, 'refinance', 'medium',
      'Tentativa de reutilizar as mesmas chaves para outro conteúdo.', '{}'::text[], null, null, null
    );
  exception when unique_violation then accepted := false;
  end;
  if accepted then raise exception 'operation idempotency keys accepted different content'; end if;

  accepted := true;
  begin
    perform public.set_intake_operation_command(
      org_a, session_id, gen_random_uuid(), gen_random_uuid(), 'refinance', 'medium',
      'A entrada antiga não pode criar uma operação sem perímetro econômico.', '{}'::text[]
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'legacy operation command remained callable'; end if;

  accepted := true;
  begin
    perform public.set_intake_archetype_command(
      org_a, session_id, gen_random_uuid(), 'refinance', 'medium',
      'A rota antiga não pode criar um stream sem a necessidade de capital.', '{}'::text[]
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'legacy archetype-only command remained callable'; end if;

  outcome := public.record_intake_capital_need_command(
    org_a, session_id, capital_event, 'growth_expansion',
    'Abrir três unidades com maturação comprovada.', 48000000, 'BRL', '3_to_6_months',
    60, 12, 'O atraso compromete o calendário de implantação.', 'retail', 'BR',
    array['debenture', 'ccb'], array['recebiveis', 'imovel'], 'CDI mais spread indicativo'
  );
  if outcome ->> 'replayed' <> 'false'
    or not exists (
      select 1 from public.document_intake_sessions session
      where session.id = session_id
        and session.capital_objective = 'Abrir três unidades com maturação comprovada.'
        and session.requested_amount = 48000000
        and session.capital_currency = 'BRL'
        and session.capital_urgency = '3_to_6_months'
        and session.requested_term_months = 60
        and session.requested_grace_months = 12
        and session.geography = 'BR'
    ) then
    raise exception 'capital-need command did not synchronize its projection';
  end if;

  accepted := true;
  begin
    update public.document_intake_sessions set requested_amount = 1 where id = session_id;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant directly rewrote a capital-need projection'; end if;

  accepted := true;
  begin
    insert into public.source_documents (
      id, organization_id, intake_session_id, bucket_id, object_path,
      original_name, mime_type, sha256, byte_size, created_by
    ) values (
      document_id, org_a, session_id, 'opportunity-documents',
      org_a::text || '/' || session_id::text || '/direct.pdf', 'direct.pdf',
      'application/pdf', repeat('d', 64), 1024,
      '10000000-0000-4000-8000-000000000001'
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant directly inserted a session document'; end if;

  outcome := public.register_intake_document_command(
    org_a, session_id, receipt_event, document_id, 'opportunity-documents',
    org_a::text || '/' || session_id::text || '/financials.pdf',
    'financials.pdf', 'application/pdf', 2048, repeat('f', 64)
  );
  if outcome ->> 'replayed' <> 'false'
    or not exists (select 1 from public.source_documents where id = document_id)
    or not exists (
      select 1 from public.intake_domain_events event
      where event.event_id = receipt_event
        and event.event_type = 'document_received'
        and event.payload #>> '{document,originalName}' = 'financials.pdf'
    ) then
    raise exception 'document registration did not atomically persist receipt and row';
  end if;

  accepted := true;
  begin
    delete from public.source_documents where id = document_id;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant directly deleted a session document'; end if;

  outcome := public.remove_intake_document_command(
    org_a, session_id, removal_event, document_id
  );
  if outcome ->> 'replayed' <> 'false'
    or exists (select 1 from public.source_documents where id = document_id)
    or not exists (
      select 1 from public.intake_domain_events event
      where event.event_id = removal_event and event.event_type = 'document_removed'
    ) then
    raise exception 'document removal did not atomically preserve history and remove the row';
  end if;

  perform public.record_intake_information_command(
    org_a, session_id, answer_event, 'expansion_rationale',
    'A expansão replica unidades maduras em três novas praças.', 'provided', null
  );
  if (select answer from public.intake_information_answers
      where intake_session_id = session_id and requirement_id = 'expansion_rationale')
      <> 'A expansão replica unidades maduras em três novas praças.' then
    raise exception 'information command did not update its projection';
  end if;

  perform public.record_intake_information_command(
    org_a, session_id, clear_event, 'expansion_rationale', null, 'provided', null
  );
  if exists (
    select 1 from public.intake_information_answers
    where intake_session_id = session_id and requirement_id = 'expansion_rationale'
  ) or (select array_agg(event_type order by sequence) from public.intake_domain_events where intake_session_id = session_id)
      <> array[
        'capital_need_declared', 'archetype_routed', 'analysis_scope_recorded',
        'route_check_recorded', 'route_check_recorded', 'capital_need_declared',
        'document_received', 'document_removed', 'information_answered', 'information_cleared'
      ] then
    raise exception 'the replay history does not match the accepted command sequence';
  end if;

  perform public.record_intake_information_command(
    org_a, session_id, terminal_answer_event, 'expansion_rationale',
    'Informação vigente no momento da confirmação.', 'provided', null
  );

  set local role postgres;
  update public.document_intake_sessions set status = 'confirmed' where id = session_id;
  set local role authenticated;

  accepted := true;
  begin
    perform public.record_intake_capital_need_command(
      org_a, session_id, blocked_capital_event, 'refinance', null, null, null, null,
      null, null, null, null, null, '{}'::text[], '{}'::text[], null
    );
  exception when object_not_in_prerequisite_state then accepted := false;
  end;
  if accepted then raise exception 'terminal session accepted a capital-need change'; end if;

  accepted := true;
  begin
    perform public.record_intake_information_command(
      org_a, session_id, blocked_answer_event, 'expansion_rationale',
      'Tentativa de reescrever uma resposta confirmada.', 'provided', null
    );
  exception when object_not_in_prerequisite_state then accepted := false;
  end;
  if accepted then raise exception 'terminal session accepted an information change'; end if;
  if (select count(*) from public.intake_domain_events where intake_session_id = session_id) <> 11 then
    raise exception 'rejected terminal commands appended events';
  end if;

  accepted := true;
  begin
    insert into public.intake_domain_events (
      event_id, organization_id, intake_session_id, sequence, event_type, payload,
      event_hash, occurred_at, created_by
    ) values (
      gen_random_uuid(), org_a, session_id, 12, 'information_cleared', '{}'::jsonb,
      repeat('a', 64), now(), '10000000-0000-4000-8000-000000000001'
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant inserted an arbitrary intake event'; end if;

  accepted := true;
  begin
    update public.intake_domain_events set payload = '{"forged":true}'::jsonb
    where organization_id = org_a and event_id = route_event;
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'tenant rewrote an intake event'; end if;

  accepted := true;
  begin
    delete from public.intake_domain_events
    where organization_id = org_a and event_id = route_event;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant deleted an intake event'; end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
    true
  );
  if (select count(*) from public.intake_domain_events where intake_session_id = session_id) <> 0 then
    raise exception 'tenant B read tenant A intake events';
  end if;

  set local role postgres;
  delete from public.document_intake_sessions where id = session_id;
  if exists (select 1 from public.intake_domain_events where intake_session_id = session_id)
    or exists (select 1 from public.intake_information_answers where intake_session_id = session_id) then
    raise exception 'controlled session erasure did not cascade through intake history';
  end if;
end;
$$;

-- An advisor tenant declares the external borrower separately from its own organization. The
-- declaration permits preparation only and must never silently become market access authority.
do $$
declare
  advisor_org constant uuid := '75000000-0000-4000-8000-000000000001';
  session_id constant uuid := '75000000-0000-4000-8000-000000000002';
  frame_event constant uuid := '75000000-0000-4000-8000-000000000003';
  route_event constant uuid := '75000000-0000-4000-8000-000000000004';
  scope_event constant uuid := '75000000-0000-4000-8000-000000000005';
  authorization_event constant uuid := '75000000-0000-4000-8000-000000000006';
  early_triage_event constant uuid := '75000000-0000-4000-8000-000000000007';
  group_scope_event constant uuid := '75000000-0000-4000-8000-000000000008';
  outcome jsonb;
  accepted boolean;
begin
  set local role postgres;
  insert into public.organizations (id, organization_type, name, created_by)
  values (advisor_org, 'originator', 'RLS Advisor', '10000000-0000-4000-8000-000000000001');
  insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
  values (advisor_org, '10000000-0000-4000-8000-000000000001', 'owner', 'active', now());
  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values (session_id, advisor_org, '10000000-0000-4000-8000-000000000001', 'originator', 'pt-BR');

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );
  outcome := public.set_intake_operation_context_command(
    advisor_org, session_id, frame_event, route_event, scope_event, authorization_event,
    early_triage_event, group_scope_event, 'refinance', 'medium',
    'Finalidade e empresa declaradas pelo assessor responsável.', array['documentos classificados'],
    'Indústria Exemplo S.A.', 'engagement_letter', 'Carta assinada em 20/08/2026'
  );
  if outcome #>> '{authorization,replayed}' <> 'false'
    or (select analysis_scope #>> '{entities,0,legalName}' from public.document_intake_sessions where id = session_id)
      <> 'Indústria Exemplo S.A.'
    or (select analysis_scope #>> '{entities,0,entityId}' from public.document_intake_sessions where id = session_id)
      = 'organization:' || advisor_org::text
    or (select advisor_authorization ->> 'status' from public.document_intake_sessions where id = session_id) <> 'declared'
    or (select advisor_authorization #>> '{scopes,0}' from public.document_intake_sessions where id = session_id) <> 'prepare_case'
    or (select advisor_authorization #> '{evidenceReferences}' from public.document_intake_sessions where id = session_id) <> '[]'::jsonb
    or (select count(*) from public.intake_domain_events where intake_session_id = session_id) <> 6 then
    raise exception 'advisor case did not preserve the external borrower and narrow authority';
  end if;

  accepted := true;
  begin
    update public.document_intake_sessions
    set advisor_authorization = advisor_authorization || '{"status":"verified"}'::jsonb
    where id = session_id;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant rewrote the advisor authorization projection'; end if;
end;
$$;

-- Document-derived entities remain suggestions until a tenant member resolves them. Confirming a
-- suggestion expands the authoritative scope and its audit trail in one serialized command.
do $$
declare
  org_a constant uuid := '20000000-0000-4000-8000-000000000001';
  session_id constant uuid := '76000000-0000-4000-8000-000000000001';
  frame_event constant uuid := '76000000-0000-4000-8000-000000000002';
  route_event constant uuid := '76000000-0000-4000-8000-000000000003';
  scope_event constant uuid := '76000000-0000-4000-8000-000000000004';
  early_triage_event constant uuid := '76000000-0000-4000-8000-000000000005';
  group_scope_event constant uuid := '76000000-0000-4000-8000-000000000006';
  pending_event constant uuid := '76000000-0000-4000-8000-000000000007';
  suggestion_event constant uuid := '76000000-0000-4000-8000-000000000008';
  expanded_scope_event constant uuid := '76000000-0000-4000-8000-000000000009';
  pending_suggestions jsonb := '{
    "items":[{
      "suggestionId":"suggestion:related-company",
      "entityId":"entity:related-company",
      "legalName":"Controlada Operacional S.A.",
      "suggestedRole":"operating_company",
      "status":"pending",
      "evidenceReferences":["document:76000000-0000-4000-8000-000000000010"]
    }],
    "version":1
  }'::jsonb;
  outcome jsonb;
  accepted boolean;
begin
  set local role postgres;
  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values (session_id, org_a, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR');

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );
  perform public.set_intake_operation_context_command(
    org_a, session_id, frame_event, route_event, scope_event, null,
    early_triage_event, group_scope_event, 'growth_expansion', 'medium',
    'Finalidade declarada pelo membro autorizado.', array['documentos classificados'], null, null, null
  );

  set local role postgres;
  update public.document_intake_sessions
  set analysis_scope_suggestions = pending_suggestions
  where id = session_id;
  perform private.append_intake_domain_event(
    org_a, session_id, pending_event, 'analysis_scope_suggestions_recorded',
    jsonb_build_object('suggestions', pending_suggestions), clock_timestamp(),
    '10000000-0000-4000-8000-000000000001'
  );

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );
  accepted := true;
  begin
    update public.document_intake_sessions
    set analysis_scope_suggestions = '{"items":[],"version":2}'::jsonb
    where id = session_id;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant rewrote the scope-suggestion projection directly'; end if;

  outcome := public.resolve_analysis_scope_suggestion_command(
    org_a, session_id, suggestion_event, expanded_scope_event,
    'suggestion:related-company', 'confirm', 'operating_company',
    'Entidade confirmada pelo responsável da organização.'
  );
  if outcome ->> 'replayed' <> 'false'
    or (select jsonb_array_length(analysis_scope -> 'entities') from public.document_intake_sessions where id = session_id) <> 2
    or (select analysis_scope_suggestions #>> '{items,0,status}' from public.document_intake_sessions where id = session_id) <> 'confirmed'
    or not exists (
      select 1 from public.intake_domain_events
      where event_id = expanded_scope_event and event_type = 'analysis_scope_recorded'
    ) then
    raise exception 'confirmed suggestion did not expand scope atomically';
  end if;

  outcome := public.resolve_analysis_scope_suggestion_command(
    org_a, session_id, suggestion_event, expanded_scope_event,
    'suggestion:related-company', 'confirm', 'operating_company',
    'Entidade confirmada pelo responsável da organização.'
  );
  if outcome ->> 'replayed' <> 'true' then
    raise exception 'scope-suggestion decision is not idempotent';
  end if;
  accepted := true;
  begin
    perform public.resolve_analysis_scope_suggestion_command(
      org_a, session_id, suggestion_event, expanded_scope_event,
      'suggestion:related-company', 'confirm', 'operating_company', 'Outra justificativa.'
    );
  exception when unique_violation then accepted := false;
  end;
  if accepted then raise exception 'scope-suggestion event id accepted a different command'; end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
    true
  );
  accepted := true;
  begin
    perform public.resolve_analysis_scope_suggestion_command(
      org_a, session_id, gen_random_uuid(), gen_random_uuid(),
      'suggestion:related-company', 'confirm', 'operating_company', 'Tentativa entre tenants.'
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'cross-tenant member resolved a scope suggestion'; end if;

  set local role postgres;
  delete from public.document_intake_sessions where id = session_id;
end;
$$;

-- Authorization is evidence-bearing and monotonic. Only an Offroad operator can verify it; the
-- advisor tenant can revoke it, which irreversibly removes every active scope.
do $$
declare
  advisor_org constant uuid := '75000000-0000-4000-8000-000000000001';
  session_id constant uuid := '75000000-0000-4000-8000-000000000002';
  offroad_org constant uuid := '77000000-0000-4000-8000-000000000001';
  documented_event constant uuid := '77000000-0000-4000-8000-000000000002';
  verified_event constant uuid := '77000000-0000-4000-8000-000000000003';
  revoked_event constant uuid := '77000000-0000-4000-8000-000000000004';
  authorization_value jsonb;
  outcome jsonb;
  accepted boolean;
begin
  set local role postgres;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );
  authorization_value := (
    select advisor_authorization || jsonb_build_object(
      'status', 'documented',
      'evidenceReferences', jsonb_build_array('document:77000000-0000-4000-8000-000000000010'),
      'statusReason', 'Carta de contratação classificada.',
      'version', 2
    )
    from public.document_intake_sessions where id = session_id
  );
  update public.document_intake_sessions set advisor_authorization = authorization_value where id = session_id;
  perform private.append_intake_domain_event(
    advisor_org, session_id, documented_event, 'advisor_authorization_recorded',
    jsonb_build_object('authorization', authorization_value), clock_timestamp(),
    '10000000-0000-4000-8000-000000000001'
  );

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );
  accepted := true;
  begin
    perform public.verify_advisor_authorization_command(
      advisor_org, session_id, verified_event, 'Documento conferido pela mesa Offroad.'
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'advisor verified its own authority'; end if;

  set local role postgres;
  insert into public.organizations (id, organization_type, name, created_by)
  values (offroad_org, 'offroad', 'RLS Offroad Operator', '10000000-0000-4000-8000-000000000003');
  insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
  values (offroad_org, '10000000-0000-4000-8000-000000000003', 'owner', 'active', now());

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',
    true
  );
  outcome := public.verify_advisor_authorization_command(
    advisor_org, session_id, verified_event, 'Documento conferido pela mesa Offroad.'
  );
  if outcome ->> 'replayed' <> 'false'
    or (select advisor_authorization ->> 'status' from public.document_intake_sessions where id = session_id) <> 'verified' then
    raise exception 'Offroad operator did not verify documented authority';
  end if;
  outcome := public.verify_advisor_authorization_command(
    advisor_org, session_id, verified_event, 'Documento conferido pela mesa Offroad.'
  );
  if outcome ->> 'replayed' <> 'true' then
    raise exception 'authorization verification is not idempotent';
  end if;
  accepted := true;
  begin
    perform public.verify_advisor_authorization_command(
      advisor_org, session_id, verified_event, 'Outra justificativa de verificação.'
    );
  exception when unique_violation then accepted := false;
  end;
  if accepted then raise exception 'verification event id accepted a different command'; end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );
  outcome := public.revoke_advisor_authorization_command(
    advisor_org, session_id, revoked_event, 'Mandato encerrado pela organização responsável.'
  );
  if outcome ->> 'replayed' <> 'false'
    or (select advisor_authorization ->> 'status' from public.document_intake_sessions where id = session_id) <> 'revoked'
    or (select advisor_authorization -> 'scopes' from public.document_intake_sessions where id = session_id) <> '[]'::jsonb then
    raise exception 'authorization revocation did not remove every active scope';
  end if;
  outcome := public.revoke_advisor_authorization_command(
    advisor_org, session_id, revoked_event, 'Mandato encerrado pela organização responsável.'
  );
  if outcome ->> 'replayed' <> 'true' then
    raise exception 'authorization revocation is not idempotent';
  end if;
  accepted := true;
  begin
    perform public.revoke_advisor_authorization_command(
      advisor_org, session_id, revoked_event, 'Outra justificativa de revogação.'
    );
  exception when unique_violation then accepted := false;
  end;
  if accepted then raise exception 'revocation event id accepted a different command'; end if;

  set local role postgres;
  delete from public.document_intake_sessions where id = session_id;
end;
$$;

-- Request ladders are versioned against the evidence-bearing stream. Exact concurrent retries
-- collapse to one trace; a new fact makes the prior trace stale and allocates the next version.
do $$
declare
  org_a constant uuid := '20000000-0000-4000-8000-000000000001';
  session_id constant uuid := '74000000-0000-4000-8000-000000000001';
  frame_event constant uuid := '74000000-0000-4000-8000-000000000002';
  route_event constant uuid := '74000000-0000-4000-8000-000000000003';
  scope_event constant uuid := '74000000-0000-4000-8000-000000000004';
  early_triage_event constant uuid := '74000000-0000-4000-8000-000000000005';
  group_scope_event constant uuid := '74000000-0000-4000-8000-000000000006';
  ladder_event constant uuid := '74000000-0000-4000-8000-000000000007';
  duplicate_ladder_event constant uuid := '74000000-0000-4000-8000-000000000008';
  capital_event constant uuid := '74000000-0000-4000-8000-000000000009';
  refreshed_ladder_event constant uuid := '74000000-0000-4000-8000-000000000010';
  attempts constant jsonb := '[
    {"source":"classified_room","outcome":"not_found","detail":"No classified document kind discharges the requirement.","evidenceIds":[]},
    {"source":"declared_derivation","outcome":"not_found","detail":"No structured declaration resolves the requirement.","evidenceIds":[]},
    {"source":"registered_public_source","outcome":"not_permitted","detail":"No governed public substitute is registered.","evidenceIds":[]}
  ]'::jsonb;
  found_attempts constant jsonb := '[
    {"source":"classified_room","outcome":"found","detail":"Claimed evidence.","evidenceIds":["forged:evidence"]}
  ]'::jsonb;
  outcome jsonb;
  accepted boolean;
begin
  set local role postgres;
  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values (session_id, org_a, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR');

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );
  perform public.set_intake_operation_context_command(
    org_a, session_id, frame_event, route_event, scope_event, null,
    early_triage_event, group_scope_event, 'growth_expansion', 'medium',
    'Finalidade declarada pelo membro autorizado.', array['documentos classificados'], null, null, null
  );

  accepted := true;
  begin
    perform public.record_intake_request_ladders_command(
      org_a, session_id,
      jsonb_build_array(jsonb_build_object(
        'eventId', gen_random_uuid(),
        'requirementId', 'expansion_rationale',
        'basisRevision', 1,
        'attempts', attempts
      ))
    );
  exception when serialization_failure then accepted := false;
  end;
  if accepted then raise exception 'stale request ladder was rebound to newer evidence'; end if;

  accepted := true;
  begin
    perform public.record_intake_request_ladders_command(
      org_a, session_id,
      jsonb_build_array(jsonb_build_object(
        'eventId', gen_random_uuid(),
        'requirementId', 'expansion_rationale',
        'basisRevision', 5,
        'attempts', found_attempts
      ))
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant manufactured positive request-ladder evidence'; end if;

  outcome := public.record_intake_request_ladders_command(
    org_a, session_id,
    jsonb_build_array(jsonb_build_object(
      'eventId', ladder_event,
      'requirementId', 'expansion_rationale',
      'basisRevision', 5,
      'attempts', attempts
    ))
  );
  if outcome ->> 'basisRevision' <> '5'
    or outcome #>> '{events,0,replayed}' <> 'false'
    or (select count(*) from public.intake_domain_events
        where intake_session_id = session_id and event_type = 'request_ladder_recorded') <> 1 then
    raise exception 'request ladder was not bound to the current evidence revision';
  end if;

  outcome := public.record_intake_request_ladders_command(
    org_a, session_id,
    jsonb_build_array(jsonb_build_object(
      'eventId', ladder_event,
      'requirementId', 'expansion_rationale',
      'basisRevision', 5,
      'attempts', attempts
    ))
  );
  if outcome #>> '{events,0,replayed}' <> 'true' then
    raise exception 'request ladder event id is not idempotent';
  end if;

  outcome := public.record_intake_request_ladders_command(
    org_a, session_id,
    jsonb_build_array(jsonb_build_object(
      'eventId', duplicate_ladder_event,
      'requirementId', 'expansion_rationale',
      'basisRevision', 5,
      'attempts', attempts
    ))
  );
  if outcome #>> '{events,0,replayed}' <> 'true'
    or outcome #>> '{events,0,eventId}' <> ladder_event::text
    or (select count(*) from public.intake_domain_events
        where intake_session_id = session_id and event_type = 'request_ladder_recorded') <> 1 then
    raise exception 'concurrent equivalent request ladders were not collapsed';
  end if;

  perform public.record_intake_capital_need_command(
    org_a, session_id, capital_event, 'growth_expansion',
    'Abrir uma nova unidade.', null, null, null, null, null, null, null, null,
    '{}'::text[], '{}'::text[], null
  );
  outcome := public.record_intake_request_ladders_command(
    org_a, session_id,
    jsonb_build_array(jsonb_build_object(
      'eventId', refreshed_ladder_event,
      'requirementId', 'expansion_rationale',
      'basisRevision', 6,
      'attempts', attempts
    ))
  );
  if outcome ->> 'basisRevision' <> '6'
    or not exists (
      select 1 from public.intake_domain_events event
      where event.event_id = refreshed_ladder_event
        and event.payload #>> '{trace,traceVersion}' = '2'
        and event.payload #>> '{trace,basisRevision}' = '6'
    ) then
    raise exception 'a new evidence revision did not allocate a new ladder trace';
  end if;

  set local role postgres;
  update public.document_intake_sessions set status = 'confirmed' where id = session_id;
  set local role authenticated;
  accepted := true;
  begin
    perform public.record_intake_request_ladders_command(
      org_a, session_id,
      jsonb_build_array(jsonb_build_object(
        'eventId', gen_random_uuid(),
        'requirementId', 'expansion_rationale',
        'basisRevision', 6,
        'attempts', attempts
      ))
    );
  exception when object_not_in_prerequisite_state then accepted := false;
  end;
  if accepted then raise exception 'terminal session accepted a request ladder'; end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
    true
  );
  accepted := true;
  begin
    perform public.record_intake_request_ladders_command(
      org_a, session_id,
      jsonb_build_array(jsonb_build_object(
        'eventId', gen_random_uuid(),
        'requirementId', 'expansion_rationale',
        'basisRevision', 6,
        'attempts', attempts
      ))
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'cross-tenant member appended a request ladder'; end if;

  set local role postgres;
  delete from public.document_intake_sessions where id = session_id;
end;
$$;

set local role postgres;

-- M8 stops at an append-only qualified introduction. The company authorizes an exact material
-- fingerprint for named recipients only after a separate technical-review attestation.
insert into public.market_distribution_policies (
  version, status, valid_from, mandate_max_age_months, wave_limit,
  learning_gate_anchor_count, methodology_source, approved_by, approved_at
) values (
  'rls-m8-v1', 'active', current_date, 6, 3, 1,
  'RLS fixture for the governed qualified-introduction boundary.',
  '10000000-0000-4000-8000-000000000001', now()
);
insert into public.qualified_introduction_plans (
  id, organization_id, intake_session_id, case_fingerprint, material_fingerprint,
  wave_limit, created_by
) values (
  '81000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  repeat('b', 64), repeat('a', 64), 3,
  '10000000-0000-4000-8000-000000000001'
);
insert into public.qualified_introduction_recipients (
  id, organization_id, intake_session_id, plan_id, fund_directory_id,
  recipient_name, contact_id, contact_name, mandate_fingerprint, rationale,
  material_manifest, position, is_anchor
) values (
  '82000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000701',
  'RLS Governed Retrieval Fund', 'credit-team', 'Credit Team', repeat('c', 64),
  'The current governed mandate accepts the transaction profile and ticket.',
  '["teaser","credit_memo","term_sheet"]'::jsonb, 1, true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
do $$
begin
  if (select count(*) from public.qualified_introduction_plans) <> 1
    or (select count(*) from public.qualified_introduction_recipients) <> 1 then
    raise exception 'tenant A cannot read its own qualified-introduction plan';
  end if;
  perform public.attest_qualified_introduction_plan_technical_review(
    '81000000-0000-4000-8000-000000000001', repeat('a', 64)
  );
  begin
    perform public.authorize_qualified_introduction_plan(
      '81000000-0000-4000-8000-000000000001', repeat('a', 64)
    );
    raise exception 'unverified representation authorized external distribution';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local role postgres;
update public.document_intake_sessions
set representation_kind = 'company', representation_status = 'verified',
    representation_verified_by = '10000000-0000-4000-8000-000000000001',
    representation_verified_at = now()
where organization_id = '20000000-0000-4000-8000-000000000001'
  and id = '40000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
do $$
begin
  perform public.authorize_qualified_introduction_plan(
    '81000000-0000-4000-8000-000000000001', repeat('a', 64)
  );
  if (select status from public.qualified_introduction_plans
      where id = '81000000-0000-4000-8000-000000000001') <> 'authorized' then
    raise exception 'exact-fingerprint technical review and company authorization did not persist';
  end if;
  begin
    update public.qualified_introduction_plans set wave_limit = 10
    where id = '81000000-0000-4000-8000-000000000001';
    raise exception 'tenant directly modified an authorized introduction plan';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local role postgres;
insert into public.qualified_introductions (
  id, organization_id, intake_session_id, plan_id, recipient_id, fund_directory_id,
  contact_id, case_fingerprint, material_fingerprint, mandate_fingerprint, rationale,
  material_manifest, authorization_snapshot, introduced_by
) values (
  '83000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000701',
  'credit-team', repeat('b', 64), repeat('a', 64), repeat('c', 64),
  'Qualified introduction of the exact authorized package to the named contact.',
  '["teaser","credit_memo","term_sheet"]'::jsonb,
  '{"scope":["qualified_introduction"],"identityPolicy":"identified_restricted"}'::jsonb,
  '10000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
do $$
begin
  if (select count(*) from public.qualified_introductions) <> 1 then
    raise exception 'tenant A cannot read its own qualified-introduction record';
  end if;
  begin
    update public.qualified_introductions set rationale = 'tampered';
    raise exception 'qualified-introduction ledger accepted an update';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.qualified_introductions;
    raise exception 'qualified-introduction ledger accepted a delete';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
  true
);
do $$
begin
  if (select count(*) from public.qualified_introduction_plans) <> 0
    or (select count(*) from public.qualified_introduction_recipients) <> 0
    or (select count(*) from public.qualified_introductions) <> 0 then
    raise exception 'tenant B can read tenant A qualified-introduction data';
  end if;
end;
$$;

set local role postgres;

-- M9 findings remain signals until a qualified human binds a review to the exact
-- fingerprint. The resulting mandate decision is Offroad's own engagement decision.
insert into public.red_flag_policies (
  version, status, valid_from, thresholds, materiality, response_sla,
  methodology_source, approved_by, approved_at
) values (
  'rls-m9-v1', 'active', current_date,
  '{"inventoryRevenueGrowthGapPct":"10","changingInformationVersions":3}'::jsonb,
  '{"critical":"desk_decision"}'::jsonb,
  '{"criticalHours":4}'::jsonb,
  'RLS fixture for fingerprint-bound red-flag governance.',
  '10000000-0000-4000-8000-000000000001', now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
do $$
declare
  decision_id uuid;
  communication_id uuid;
begin
  perform public.review_case_red_flag(
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'RF-15', repeat('d', 64), 'confirmed',
    'A companhia recusou o analítico essencial solicitado para concluir o caso.',
    '["intake:essential-analytic"]'::jsonb
  );
  decision_id := public.decide_offroad_mandate(
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    repeat('e', 64), 'decline', '["RF-15"]'::jsonb, '[]'::jsonb,
    'Reabrir o mandato após a entrega do analítico essencial solicitado.'
  );
  communication_id := public.record_decline_communication(
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    decision_id, repeat('f', 64), 'email', 'company@example.com', repeat('a', 64)
  );
  if communication_id is null
    or (select count(*) from public.case_red_flag_reviews) <> 1
    or (select count(*) from public.offroad_mandate_decisions) <> 1
    or (select count(*) from public.decline_communications) <> 1 then
    raise exception 'tenant A did not persist the governed M9 ledger';
  end if;
  begin
    update public.case_red_flag_reviews set rationale = 'tampered';
    raise exception 'red-flag review ledger accepted an update';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.offroad_mandate_decisions;
    raise exception 'mandate-decision ledger accepted a delete';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
  true
);
do $$
declare accepted boolean := true;
begin
  if (select count(*) from public.case_red_flag_reviews) <> 0
    or (select count(*) from public.offroad_mandate_decisions) <> 0
    or (select count(*) from public.decline_communications) <> 0 then
    raise exception 'tenant B can read tenant A M9 governance data';
  end if;
  begin
    perform public.review_case_red_flag(
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'RF-15', repeat('d', 64), 'false_positive',
      'Cross-tenant mutation must never reach the append-only review ledger.', '[]'::jsonb
    );
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant B appended a review to tenant A'; end if;
end;
$$;

set local role postgres;

-- M10 keeps conflict review and communication evidence append-only, tenant-scoped and bound to
-- exact economic and material fingerprints.
insert into public.conduct_policies (
  version,status,disclaimer_id,valid_from,rules,methodology_source,approved_by,approved_at
) values (
  '2026.08.25-v1','active','offroad-dcm-advisory-boundary-2026-08-25',current_date,
  '{"externalRelease":"fail_closed"}'::jsonb,
  'RLS fixture for the language and conduct governance boundary.',
  '10000000-0000-4000-8000-000000000001',now()
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
do $$
declare conflict_id uuid; communication_id uuid; surprise_id uuid;
begin
  conflict_id:=public.review_engagement_conflict(
    '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',repeat('b',64),
    'clear','[]'::jsonb,'A busca não identificou mandato oposto ou representação dos dois lados.'
  );
  communication_id:=public.record_material_communication(
    '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',repeat('a',64),
    'credit-team','email',repeat('c',64),false
  );
  surprise_id:=public.record_diligence_surprise(
    '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
    'O financiador identificou uma restrição contratual que não constava do material recebido.','ES-13','gold-case-es-13'
  );
  if conflict_id is null or communication_id is null or surprise_id is null then raise exception 'M10 commands did not persist'; end if;
  begin update public.engagement_conflict_reviews set rationale='tampered'; raise exception 'conflict ledger accepted update'; exception when insufficient_privilege then null; end;
  begin delete from public.material_communication_records; raise exception 'communication ledger accepted delete'; exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
do $$
declare accepted boolean:=true;
begin
  if (select count(*) from public.engagement_conflict_reviews)<>0 or (select count(*) from public.material_communication_records)<>0 or (select count(*) from public.diligence_surprises)<>0 then raise exception 'tenant B can read tenant A M10 data'; end if;
  begin perform public.review_engagement_conflict('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',repeat('d',64),'clear','[]'::jsonb,'Cross tenant review must never be accepted by the command.'); exception when insufficient_privilege then accepted:=false; end;
  if accepted then raise exception 'tenant B appended M10 conflict review'; end if;
end $$;

set local role postgres;

-- Public research is capability-written external context. Agent proposals are immutable,
-- snapshot-bound impact previews: a tenant can decide them, never rewrite or apply them by
-- editing the ledger directly.
do $$
declare
  org_a constant uuid := '20000000-0000-4000-8000-000000000001';
  session_id constant uuid := '40000000-0000-4000-8000-0000000000a1';
  run_id constant uuid := '60000000-0000-4000-8000-0000000000a1';
  proposal_id constant uuid := 'a1000000-0000-4000-8000-000000000001';
  claim jsonb;
  job_id uuid;
  capability text;
  manifest_id uuid;
  research_id uuid;
  accepted boolean;
begin
  set local role postgres;
  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values (session_id, org_a, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR');
  insert into public.processing_runs (
    id, organization_id, intake_session_id, run_no, trigger, status, pipeline_version, created_by
  ) values (
    run_id, org_a, session_id, 1, 'manual', 'running', 'agent-workspace-test',
    '10000000-0000-4000-8000-000000000001'
  );
  insert into public.processing_jobs (
    organization_id, processing_run_id, intake_session_id, kind, status, available_at
  ) values (org_a, run_id, session_id, 'case_analysis', 'queued', '2000-01-01T00:00:00Z');

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',
    true
  );
  claim := public.worker_claim_job(repeat('w', 64), 600);
  if claim->>'kind' <> 'case_analysis' or (claim->>'processing_run_id')::uuid <> run_id then
    raise exception 'worker did not claim the public-research fixture';
  end if;
  job_id := (claim->>'job_id')::uuid;
  capability := claim->>'capability_token';

  research_id := public.worker_record_public_research(
    job_id,
    capability,
    '[{"topic":"identity","query":"Empresa Exemplo site oficial Brasil"}]'::jsonb,
    jsonb_build_object(
      'status', 'succeeded',
      'providerChain', jsonb_build_array('official'),
      'failures', '[]'::jsonb,
      'sources', jsonb_build_array(jsonb_build_object(
        'topic', 'identity',
        'provider', 'official',
        'title', 'Empresa Exemplo',
        'url', 'https://example.com/institucional',
        'snippet', 'Contexto público, mantido fora das evidências fornecidas pela companhia.',
        'retrievedAt', '2026-08-26T12:00:00.000Z',
        'contentHash', repeat('1', 64)
      ))
    )
  );
  set local role postgres;
  if research_id is null
    or (select count(*) from public.public_research_sources where research_run_id = research_id) <> 1 then
    raise exception 'capability-bound public research did not persist';
  end if;
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',
    true
  );

  manifest_id := public.worker_record_case_snapshot(
    job_id,
    capability,
    jsonb_build_object(
      'schemaVersion', '2026.08.24-v2',
      'caseId', session_id::text,
      'runId', run_id::text,
      'createdAt', '2026-08-26T12:01:00.000Z',
      'locale', 'pt-BR',
      'inputFingerprint', repeat('2', 64),
      'manifestFingerprint', repeat('3', 64),
      'capture', jsonb_build_object('sources', 'complete', 'models', 'complete'),
      'versions', '{}'::jsonb,
      'models', '[]'::jsonb,
      'sources', '[]'::jsonb,
      'outputs', '[]'::jsonb
    ),
    jsonb_build_object('fingerprint', repeat('2', 64), 'locale', 'pt')
  );
  if manifest_id is null then raise exception 'agent proposal fixture has no manifest'; end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );
  if public.record_agent_change_proposal(
    org_a,
    session_id,
    jsonb_build_object(
      'schemaVersion', '2026.08.26-v1',
      'id', proposal_id,
      'caseId', session_id,
      'baseManifestFingerprint', repeat('3', 64),
      'proposalFingerprint', repeat('4', 64),
      'target', 'operation_brief',
      'title', 'Esclarecer a destinação dos recursos',
      'rationale', 'O documento institucional não separa investimento físico de capital de giro.',
      'impactSummary', 'Atualiza somente o contexto da operação e recalcula as etapas dependentes.',
      'patches', jsonb_build_array(jsonb_build_object(
        'operation', 'set',
        'path', '/capitalNeed/useOfProceeds',
        'value', 'Expansão e capital de giro',
        'previousFingerprint', null
      )),
      'evidence', jsonb_build_array(jsonb_build_object(
        'kind', 'document_anchor', 'id', 'source-document:page-2'
      )),
      'recompute', jsonb_build_array('reconciliation', 'metrics', 'gaps', 'structure'),
      'proposedBy', 'offroad_agent',
      'proposedAt', '2026-08-26T12:02:00.000Z',
      'expiresAt', '2099-08-26T12:02:00.000Z'
    )
  ) <> proposal_id then
    raise exception 'snapshot-bound agent proposal did not persist';
  end if;
  if public.decide_agent_change_proposal(org_a, proposal_id, 'accepted', 'Confirmado pelo responsável da empresa.') <> 'accepted' then
    raise exception 'agent proposal decision did not persist';
  end if;

  accepted := true;
  begin
    update public.agent_change_proposals set impact_summary = 'silent mutation' where id = proposal_id;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant rewrote an agent proposal directly'; end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
    true
  );
  if (select count(*) from public.public_research_runs where id = research_id) <> 0
    or (select count(*) from public.public_research_sources where research_run_id = research_id) <> 0
    or (select count(*) from public.agent_change_proposals where id = proposal_id) <> 0 then
    raise exception 'tenant B read tenant A research or agent proposal';
  end if;
  accepted := true;
  begin
    perform public.decide_agent_change_proposal(org_a, proposal_id, 'rejected', 'Tentativa entre organizações.');
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant B decided tenant A agent proposal'; end if;
end;
$$;

set local role postgres;

-- Agent Offroad vertical: a tenant message becomes a capability-bound job and a preview. The
-- operation changes only after explicit acceptance, the other tenant sees nothing, and an Agent
-- failure cannot fail an independently processing intake session.
do $$
declare
  org_a constant uuid := '20000000-0000-4000-8000-000000000001';
  session_id constant uuid := '40000000-0000-4000-8000-0000000000b1';
  message_id constant uuid := 'a2000000-0000-4000-8000-000000000001';
  assistant_id constant uuid := 'a2000000-0000-4000-8000-000000000002';
  proposal_id constant uuid := 'a2000000-0000-4000-8000-000000000003';
  event_id constant uuid := 'a2000000-0000-4000-8000-000000000004';
  failure_message_id constant uuid := 'a2000000-0000-4000-8000-000000000005';
  submitted jsonb;
  replayed jsonb;
  claim jsonb;
  context jsonb;
  applied jsonb;
  failure_claim jsonb;
  job_id uuid;
  capability text;
  snapshot text;
begin
  insert into public.document_intake_sessions (
    id, organization_id, started_by, journey, locale, archetype, requested_amount, capital_currency
  ) values (
    session_id, org_a, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR',
    'growth_expansion', 30000000, 'BRL'
  );

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );
  submitted := public.submit_agent_message(
    org_a, session_id, message_id, 'O valor pretendido passou para R$ 50 milhões.', 'pt-BR'
  );
  replayed := public.submit_agent_message(
    org_a, session_id, message_id, 'O valor pretendido passou para R$ 50 milhões.', 'pt-BR'
  );
  if submitted ->> 'status' <> 'queued' or coalesce((replayed ->> 'replayed')::boolean, false) is not true then
    raise exception 'agent message submission is not idempotent';
  end if;
  if (select requested_amount from public.document_intake_sessions where id = session_id) <> 30000000 then
    raise exception 'agent message silently mutated the operation';
  end if;

  job_id := (submitted ->> 'job_id')::uuid;
  set local role postgres;
  update public.processing_jobs set available_at = '1900-01-01T00:00:00Z' where id = job_id;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',
    true
  );
  claim := public.worker_claim_job(repeat('w', 64), 600);
  if claim ->> 'kind' <> 'agent_operation_brief' then
    raise exception 'worker did not claim the Agent Offroad job: %', claim;
  end if;
  if (claim ->> 'job_id')::uuid <> job_id then
    raise exception 'worker claimed the wrong Agent Offroad job';
  end if;
  capability := claim ->> 'capability_token';
  context := public.worker_load_agent_context(job_id, capability);
  snapshot := context ->> 'snapshot_fingerprint';
  perform public.worker_record_agent_response(
    job_id,
    capability,
    assistant_id,
    '{"state":"proposing","reply":"Preparei a atualização do valor para sua revisão."}'::jsonb,
    jsonb_build_object(
      'schemaVersion', '2026.08.26-v1',
      'id', proposal_id,
      'caseId', session_id,
      'baseManifestFingerprint', snapshot,
      'proposalFingerprint', repeat('5', 64),
      'target', 'operation_brief',
      'title', 'Atualizar o valor pretendido',
      'rationale', 'O novo valor foi informado diretamente pela empresa.',
      'impactSummary', 'Atualiza o pedido e recalcula as etapas dependentes.',
      'patches', jsonb_build_array(jsonb_build_object(
        'operation', 'set', 'path', '/requestedAmount', 'value', 50000000,
        'previousFingerprint', null
      )),
      'evidence', jsonb_build_array(jsonb_build_object(
        'kind', 'user_statement', 'id', message_id
      )),
      'recompute', jsonb_build_array('metrics', 'gaps', 'structure', 'matching'),
      'proposedBy', 'offroad_agent',
      'proposedAt', clock_timestamp(),
      'expiresAt', clock_timestamp() + interval '1 day'
    )
  );
  perform public.worker_complete_job(job_id, capability, '{"state":"proposing"}'::jsonb);

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
    true
  );
  if (select requested_amount from public.document_intake_sessions where id = session_id) <> 30000000
    or (select status from public.agent_change_proposals where id = proposal_id) <> 'proposed' then
    raise exception 'agent preview was not separated from application';
  end if;
  applied := public.accept_and_apply_agent_operation_brief_proposal(org_a, proposal_id, event_id);
  if applied ->> 'status' <> 'applied'
    or (select requested_amount from public.document_intake_sessions where id = session_id) <> 50000000 then
    raise exception 'explicit Agent Offroad acceptance did not apply the operation update';
  end if;

  -- Queue a second turn, then simulate a concurrent document-processing state. Failing the
  -- auxiliary Agent run must not fail the intake session itself.
  submitted := public.submit_agent_message(
    org_a, session_id, failure_message_id, 'Considere também uma carência maior.', 'pt-BR'
  );
  set local role postgres;
  update public.processing_jobs set available_at = '1900-01-01T00:00:00Z'
  where id = (submitted ->> 'job_id')::uuid;
  update public.document_intake_sessions set status = 'processing' where id = session_id;
  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',
    true
  );
  failure_claim := public.worker_claim_job(repeat('w', 64), 600);
  if failure_claim ->> 'kind' <> 'agent_operation_brief' then
    raise exception 'worker did not claim the Agent failure fixture';
  end if;
  perform public.worker_load_agent_context(
    (failure_claim ->> 'job_id')::uuid, failure_claim ->> 'capability_token'
  );
  perform public.worker_record_agent_failure(
    (failure_claim ->> 'job_id')::uuid, failure_claim ->> 'capability_token', 'agent_processing_failed'
  );
  perform public.worker_fail_job(
    (failure_claim ->> 'job_id')::uuid, failure_claim ->> 'capability_token',
    '{"code":"agent_processing_failed"}'::jsonb, false, 60
  );
  set local role postgres;
  if (select status from public.document_intake_sessions where id = session_id) <> 'processing' then
    raise exception 'Agent failure incorrectly failed the intake session';
  end if;

  set local role authenticated;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',
    true
  );
  if (select count(*) from public.agent_conversations where intake_session_id = session_id) <> 0
    or (select count(*) from public.agent_messages where intake_session_id = session_id) <> 0 then
    raise exception 'tenant B read tenant A Agent Offroad conversation';
  end if;
end;
$$;

set local role postgres;

-- House pricing evidence is not a tenant data product. Even an authenticated organization owner
-- cannot enumerate policies or observations; only the capability-bound worker can receive the
-- governed aggregate context through its security-definer command.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',
  true
);
do $$
declare
  accepted boolean;
begin
  accepted := true;
  begin
    perform 1 from public.pricing_policies limit 1;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant could read proprietary pricing policies'; end if;

  accepted := true;
  begin
    perform 1 from public.pricing_observations limit 1;
  exception when insufficient_privilege then accepted := false;
  end;
  if accepted then raise exception 'tenant could read proprietary pricing observations'; end if;
end;
$$;

set local role postgres;

rollback;

select 'rls_non_interference_passed' as result;
