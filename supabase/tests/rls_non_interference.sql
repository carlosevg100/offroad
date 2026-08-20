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
  n integer;
  title_length integer;
begin
  -- Documents: one in the session that will be confirmed (becomes evidence), one in an open session (removable).
  insert into public.source_documents (id, organization_id, intake_session_id, bucket_id, object_path, original_name, sha256, byte_size, created_by)
  values ('50000000-0000-4000-8000-000000000001', org, session_id, 'opportunity-documents', org::text || '/' || session_id::text || '/a.pdf', 'a.pdf', repeat('a', 64), 10, '10000000-0000-4000-8000-000000000001');
  -- `insert … returning` must work for the tenant (the app reads the new session id this way).
  insert into public.document_intake_sessions (id, organization_id, started_by, journey, locale)
  values ('40000000-0000-4000-8000-000000000002', org, '10000000-0000-4000-8000-000000000001', 'company', 'pt-BR')
  returning id into returned_session;
  if returned_session is distinct from '40000000-0000-4000-8000-000000000002' then
    raise exception 'insert returning did not expose the new intake session to its tenant';
  end if;
  insert into public.source_documents (id, organization_id, intake_session_id, bucket_id, object_path, original_name, sha256, byte_size, created_by)
  values ('50000000-0000-4000-8000-000000000002', org, '40000000-0000-4000-8000-000000000002', 'opportunity-documents', org::text || '/40000000-0000-4000-8000-000000000002/b.pdf', 'b.pdf', repeat('b', 64), 10, '10000000-0000-4000-8000-000000000001');

  delete from public.source_documents where id = '50000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'owner could not remove a document from an open intake session'; end if;

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
  delete from public.source_documents where id = '50000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'evidence document was deleted after confirmation'; end if;
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

  -- Written through a column the tenant is still allowed to write. `status` would now fail on
  -- the grant before RLS ever ran, and this block is asserting isolation between tenants, not
  -- the column grants: it has to reach the policy to prove the policy holds.
  update public.document_intake_sessions
  set requested_amount = 1
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

  delete from public.source_documents where id = '50000000-0000-4000-8000-000000000001';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'tenant B deleted tenant A document';
  end if;

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

  insert into public.source_documents (
    id, organization_id, intake_session_id, bucket_id, object_path, original_name, mime_type,
    sha256, byte_size, created_by
  ) values (
    document_id, org, session_id, 'opportunity-documents',
    org::text || '/' || session_id::text || '/df.pdf', 'df.pdf', 'application/pdf',
    repeat('d', 64), 4096, '10000000-0000-4000-8000-000000000001'
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
  job_id uuid;
  capability text;
  result jsonb;
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

  result := public.worker_complete_job(job_id, capability, '{"documents":1}'::jsonb);
  if (result->>'pending_jobs')::integer <> 0 then
    raise exception 'run still had pending jobs after the only job completed';
  end if;

  -- the capability dies with the job
  begin
    perform public.worker_heartbeat(job_id, capability, 600);
    raise exception 'capability token still worked after the job completed';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
declare
  session_id constant uuid := '40000000-0000-4000-8000-000000000003';
  document_id constant uuid := '50000000-0000-4000-8000-000000000003';
begin
  if (select status from public.processing_runs where intake_session_id = session_id) <> 'succeeded' then
    raise exception 'the run did not reach succeeded after its jobs finished';
  end if;
  if (select jsonb_array_length(stages) from public.processing_runs where intake_session_id = session_id) <> 1 then
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
  set claimed_by_organization_id = (select id from public.organizations order by created_at limit 1),
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
  insert into public.source_documents (
    id, organization_id, intake_session_id, bucket_id, object_path, original_name, sha256, byte_size, created_by
  ) values (
    doc_id, org, session_id, 'opportunity-documents', path, 'probe.pdf', repeat('9', 64), 10,
    '10000000-0000-4000-8000-000000000001'
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

-- `object_path` is the string the Storage policies parse, and it became tenant-insertable when
-- the write surface narrowed to named columns. A row may not describe another tenant's object.
do $$
declare
  accepted boolean := true;
begin
  begin
    insert into public.source_documents (
      id, organization_id, intake_session_id, bucket_id, object_path, original_name, sha256, byte_size, created_by
    ) values (
      '50000000-0000-4000-8000-0000000000f2', '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-0000000000f1', 'opportunity-documents',
      '20000000-0000-4000-8000-000000000002/x/y.pdf', 'y.pdf', repeat('7', 64), 10,
      '10000000-0000-4000-8000-000000000001'
    );
  exception when others then accepted := false;
  end;
  if accepted then raise exception 'source_documents accepted an object_path under another organization'; end if;
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
  insert into public.source_documents (
    id, organization_id, intake_session_id, bucket_id, object_path, original_name, sha256, byte_size, created_by
  ) values (
    doc_id, org, session_id, 'opportunity-documents', path, 'spend.pdf', repeat('5', 64), 10,
    '10000000-0000-4000-8000-000000000001'
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

  -- What the company answers about itself stays its own to change.
  update public.document_intake_sessions
  set requested_amount = 40000000, requested_term_months = 48, sector = 'varejo', archetype = null
  where organization_id = org and id = session_id;

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

set local role postgres;

rollback;

select 'rls_non_interference_passed' as result;
