-- Atomic document-first intake commands.
--
-- Until now the intake steps were sequences of independent PostgREST writes from server
-- actions: a failure in the middle could leave a company without an opportunity, an
-- opportunity without evidence, or a session stuck in `processing`. These functions move
-- each multi-row step into one transaction. All of them are SECURITY INVOKER: RLS still
-- applies to every statement, and the tenant is checked explicitly on entry.
--
--   begin_intake_processing     — marks the session `processing` and clears old results
--   complete_intake_processing  — persists candidates + issues + summary and marks `review_ready`
--   review_intake_candidate     — demotes siblings and records the decision atomically
--   confirm_document_intake     — creates company / capital request / opportunity, promotes
--                                 evidence facts, links documents, closes the session; idempotent
--
-- create_opportunity_intake is also amended so the derived title never exceeds the schema limit.

-- ---------------------------------------------------------------------------------------------
-- Helpers (private)
-- ---------------------------------------------------------------------------------------------

create or replace function private.bounded_opportunity_title(p_name text, p_purpose text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(trim(p_purpose), '') = '' then left(trim(p_name), 180)
    when char_length(trim(p_name) || ' · ' || trim(p_purpose)) <= 180 then trim(p_name) || ' · ' || trim(p_purpose)
    when 180 - char_length(trim(p_name)) - 3 >= 12 then trim(p_name) || ' · ' || rtrim(left(trim(p_purpose), 180 - char_length(trim(p_name)) - 3 - 1)) || '…'
    else rtrim(left(trim(p_name) || ' · ' || trim(p_purpose), 179)) || '…'
  end;
$$;

revoke all on function private.bounded_opportunity_title(text, text) from public;
grant execute on function private.bounded_opportunity_title(text, text) to authenticated;

-- Common entry guard for intake commands: authenticated, borrower-side tenant, session in scope.
create or replace function private.intake_session_for_update(p_organization_id uuid, p_session_id uuid)
returns public.document_intake_sessions
language plpgsql
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'offroad'])) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  select * into session_row
  from public.document_intake_sessions
  where organization_id = p_organization_id and id = p_session_id
  for update;

  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;
  return session_row;
end;
$$;

revoke all on function private.intake_session_for_update(uuid, uuid) from public;
grant execute on function private.intake_session_for_update(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- begin_intake_processing
-- ---------------------------------------------------------------------------------------------

create or replace function public.begin_intake_processing(p_organization_id uuid, p_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status = 'confirmed' then
    raise exception 'intake_session_already_confirmed' using errcode = '55000';
  end if;

  delete from public.intake_issues where organization_id = p_organization_id and intake_session_id = p_session_id;
  delete from public.intake_field_candidates where organization_id = p_organization_id and intake_session_id = p_session_id;

  update public.document_intake_sessions
  set status = 'processing',
      processing_started_at = now(),
      processing_completed_at = null,
      result_summary = '{}'::jsonb
  where organization_id = p_organization_id and id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- complete_intake_processing
--   p_candidates: jsonb array of {extractor_key, source_document_id?, field_path, field_group,
--                 label, raw_value?, normalized_value, value_type, unit?, currency?,
--                 period_start?, period_end?, information_class, evidence_rank, source_anchor,
--                 confidence, extraction_method, is_primary?}
--   p_issues:     jsonb array of {issue_type, priority, field_group?, field_path?,
--                 candidate_keys?: text[], title, description, resolution_hint?}
--   p_summary:    jsonb object stored in result_summary
-- ---------------------------------------------------------------------------------------------

create or replace function public.complete_intake_processing(
  p_organization_id uuid,
  p_session_id uuid,
  p_candidates jsonb,
  p_issues jsonb,
  p_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  candidate_count integer := 0;
  issue_count integer := 0;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status = 'confirmed' then
    raise exception 'intake_session_already_confirmed' using errcode = '55000';
  end if;
  if jsonb_typeof(coalesce(p_candidates, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_issues, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_intake_payload' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_summary, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_intake_summary' using errcode = '22023';
  end if;

  -- Fresh start: previous results are discarded so a reprocess never mixes generations.
  delete from public.intake_issues where organization_id = p_organization_id and intake_session_id = p_session_id;
  delete from public.intake_field_candidates where organization_id = p_organization_id and intake_session_id = p_session_id;

  insert into public.intake_field_candidates (
    organization_id, intake_session_id, source_document_id, extractor_key, field_path, field_group,
    label, raw_value, normalized_value, value_type, unit, currency, period_start, period_end,
    information_class, evidence_rank, source_anchor, confidence, extraction_method, is_primary, created_by
  )
  select
    p_organization_id, p_session_id,
    nullif(c.source_document_id, '')::uuid, c.extractor_key, c.field_path, c.field_group,
    c.label, c.raw_value, coalesce(c.normalized_value, 'null'::jsonb), c.value_type, c.unit, c.currency,
    nullif(c.period_start, '')::date, nullif(c.period_end, '')::date,
    c.information_class, c.evidence_rank, coalesce(c.source_anchor, '{}'::jsonb), c.confidence, c.extraction_method,
    coalesce(c.is_primary, false), actor_id
  from jsonb_to_recordset(coalesce(p_candidates, '[]'::jsonb)) as c(
    source_document_id text, extractor_key text, field_path text, field_group text, label text, raw_value text,
    normalized_value jsonb, value_type text, unit text, currency text, period_start text, period_end text,
    information_class text, evidence_rank smallint, source_anchor jsonb, confidence numeric, extraction_method text,
    is_primary boolean
  );
  get diagnostics candidate_count = row_count;

  insert into public.intake_issues (
    organization_id, intake_session_id, issue_type, priority, field_group, field_path, candidate_ids, title, description, resolution_hint
  )
  select
    p_organization_id, p_session_id, i.issue_type, i.priority, i.field_group, i.field_path,
    coalesce(
      (select array_agg(fc.id order by fc.extractor_key)
       from public.intake_field_candidates fc
       where fc.organization_id = p_organization_id
         and fc.intake_session_id = p_session_id
         and fc.extractor_key = any (coalesce(i.candidate_keys, array[]::text[]))),
      array[]::uuid[]
    ),
    i.title, i.description, i.resolution_hint
  from jsonb_to_recordset(coalesce(p_issues, '[]'::jsonb)) as i(
    issue_type text, priority text, field_group text, field_path text, candidate_keys text[], title text, description text, resolution_hint text
  );
  get diagnostics issue_count = row_count;

  update public.source_documents
  set processing_status = 'ready'
  where organization_id = p_organization_id and intake_session_id = p_session_id;

  update public.document_intake_sessions
  set status = 'review_ready',
      processing_completed_at = now(),
      result_summary = coalesce(p_summary, '{}'::jsonb) || jsonb_build_object('candidates', candidate_count, 'issues', issue_count)
  where organization_id = p_organization_id and id = p_session_id;

  return jsonb_build_object('candidates', candidate_count, 'issues', issue_count);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- review_intake_candidate
--   p_decision: accept | edit | reject | not_applicable
--   p_normalized_value: required for `edit` (already parsed/validated by the caller), ignored otherwise
-- ---------------------------------------------------------------------------------------------

create or replace function public.review_intake_candidate(
  p_organization_id uuid,
  p_session_id uuid,
  p_candidate_id uuid,
  p_decision text,
  p_normalized_value jsonb default null,
  p_comment text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  candidate_row public.intake_field_candidates;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.status <> 'review_ready' then
    raise exception 'intake_session_not_ready' using errcode = '55000';
  end if;
  if p_decision not in ('accept', 'edit', 'reject', 'not_applicable') then
    raise exception 'invalid_review_decision' using errcode = '22023';
  end if;

  select * into candidate_row
  from public.intake_field_candidates
  where organization_id = p_organization_id and intake_session_id = p_session_id and id = p_candidate_id
  for update;
  if not found then
    raise exception 'intake_candidate_not_found' using errcode = 'P0002';
  end if;
  if p_decision = 'edit' and p_normalized_value is null then
    raise exception 'edit_requires_value' using errcode = '22023';
  end if;

  if p_decision in ('accept', 'edit') then
    update public.intake_field_candidates
    set is_primary = false
    where organization_id = p_organization_id
      and intake_session_id = p_session_id
      and field_path = candidate_row.field_path
      and id <> candidate_row.id;
  end if;

  update public.intake_field_candidates
  set normalized_value = case when p_decision = 'edit' then p_normalized_value else normalized_value end,
      extraction_method = case when p_decision = 'edit' then 'user_entry' else extraction_method end,
      review_state = case p_decision when 'accept' then 'accepted' when 'edit' then 'edited' else p_decision end,
      is_primary = p_decision in ('accept', 'edit'),
      reviewer_comment = nullif(trim(coalesce(p_comment, '')), ''),
      reviewed_by = actor_id,
      reviewed_at = now()
  where organization_id = p_organization_id and intake_session_id = p_session_id and id = candidate_row.id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- confirm_document_intake
-- ---------------------------------------------------------------------------------------------

create or replace function public.confirm_document_intake(
  p_organization_id uuid,
  p_session_id uuid,
  p_output_locale text default 'pt-BR'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  v_legal_name text;
  v_display_name text;
  v_purpose text;
  v_amount numeric;
  v_currency text;
  v_identifier text;
  v_identifier_hash bytea;
  v_sector text;
  v_subsector text;
  v_website text;
  v_city text;
  v_state text;
  v_title text;
  v_fingerprint bytea;
  v_company_id uuid;
  v_request_id uuid;
  v_opportunity_id uuid;
  v_documents integer;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);

  -- Idempotent: a confirmed session always resolves to the same opportunity.
  if session_row.status = 'confirmed' and session_row.opportunity_id is not null then
    select o.id, o.company_id, o.capital_request_id into v_opportunity_id, v_company_id, v_request_id
    from public.opportunities o
    where o.organization_id = p_organization_id and o.id = session_row.opportunity_id;
    select count(*) into v_documents from public.source_documents
    where organization_id = p_organization_id and intake_session_id = p_session_id;
    return jsonb_build_object(
      'opportunity_id', v_opportunity_id, 'company_id', v_company_id, 'capital_request_id', v_request_id,
      'document_count', v_documents, 'already_confirmed', true
    );
  end if;
  if session_row.status <> 'review_ready' then
    raise exception 'intake_session_not_ready' using errcode = '55000';
  end if;
  if p_output_locale not in ('pt-BR', 'en-US') then
    raise exception 'invalid_output_locale' using errcode = '22023';
  end if;

  -- Confirmed candidates: accepted or edited, primary for their field path.
  with confirmed as (
    select field_path, normalized_value, currency
    from public.intake_field_candidates
    where organization_id = p_organization_id
      and intake_session_id = p_session_id
      and review_state in ('accepted', 'edited')
      and is_primary
  )
  select
    trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.legal_name'), '')),
    trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.display_name'), '')),
    trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'transaction.purpose'), '')),
    (select case when jsonb_typeof(normalized_value) = 'number' then (normalized_value #>> '{}')::numeric end from confirmed where field_path = 'transaction.requested_amount'),
    coalesce((select currency from confirmed where field_path = 'transaction.requested_amount'), 'BRL'),
    regexp_replace(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.legal_identifier'), ''), '[^0-9A-Za-z]', '', 'g'),
    nullif(trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.sector'), '')), ''),
    nullif(trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.subsector'), '')), ''),
    nullif(trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.website'), '')), ''),
    nullif(trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.city'), '')), ''),
    nullif(trim(coalesce((select normalized_value #>> '{}' from confirmed where field_path = 'company.state'), '')), '')
  into v_legal_name, v_display_name, v_purpose, v_amount, v_currency, v_identifier, v_sector, v_subsector, v_website, v_city, v_state;

  if v_legal_name = '' or v_purpose = '' or v_amount is null or v_amount <= 0 then
    raise exception 'intake_case_incomplete' using errcode = '22023';
  end if;
  if v_display_name = '' then
    v_display_name := v_legal_name;
  end if;
  v_title := private.bounded_opportunity_title(v_display_name, v_purpose);
  v_identifier_hash := case when v_identifier <> '' then extensions.digest(v_identifier, 'sha256') else null end;
  v_fingerprint := extensions.digest(
    concat_ws('|', p_organization_id::text, lower(v_legal_name), lower(v_purpose), v_amount::text, v_currency),
    'sha256'
  );

  -- Company: reuse the tenant's record for the same legal identifier, otherwise create it.
  if v_identifier_hash is not null then
    select id into v_company_id from public.companies
    where organization_id = p_organization_id and jurisdiction_code = 'BR' and legal_identifier_hash = v_identifier_hash;
  end if;
  if v_company_id is null then
    insert into public.companies (
      organization_id, legal_name, display_name, jurisdiction_code, legal_identifier_hash, legal_identifier_last4,
      sector, subsector, website, headquarters_city, headquarters_state, reporting_currency, created_by
    ) values (
      p_organization_id, v_legal_name, v_display_name, 'BR', v_identifier_hash,
      case when char_length(v_identifier) >= 4 then upper(right(v_identifier, 4)) end,
      v_sector, v_subsector, v_website, v_city, v_state, v_currency, actor_id
    )
    returning id into v_company_id;
  else
    update public.companies
    set legal_name = v_legal_name,
        display_name = v_display_name,
        sector = coalesce(v_sector, sector),
        subsector = coalesce(v_subsector, subsector),
        website = coalesce(v_website, website),
        headquarters_city = coalesce(v_city, headquarters_city),
        headquarters_state = coalesce(v_state, headquarters_state)
    where organization_id = p_organization_id and id = v_company_id;
  end if;

  insert into public.capital_requests (
    organization_id, company_id, purpose, requested_amount, currency, output_locale, status, created_by
  ) values (
    p_organization_id, v_company_id, v_purpose, v_amount, v_currency, p_output_locale, 'submitted', actor_id
  )
  returning id into v_request_id;

  begin
    insert into public.opportunities (
      organization_id, company_id, capital_request_id, title, purpose, requested_amount, currency, fingerprint_hash, lead_user_id, created_by
    ) values (
      p_organization_id, v_company_id, v_request_id, v_title, v_purpose, v_amount, v_currency, v_fingerprint, actor_id, actor_id
    )
    returning id into v_opportunity_id;
  exception
    when unique_violation then
      raise exception 'duplicate_opportunity' using errcode = '23505';
  end;

  -- Promote confirmed candidates to approved evidence facts, keeping raw value, class and method in the anchor.
  insert into public.evidence_facts (
    organization_id, opportunity_id, source_document_id, fact_type, label, value_numeric, value_text, unit, currency,
    period_start, period_end, confidence, review_state, source_anchor, created_by, reviewed_by, reviewed_at
  )
  select
    p_organization_id, v_opportunity_id, c.source_document_id, c.field_path, c.label,
    case when jsonb_typeof(c.normalized_value) = 'number' then (c.normalized_value #>> '{}')::numeric end,
    case when jsonb_typeof(c.normalized_value) = 'number' then null
         when jsonb_typeof(c.normalized_value) = 'string' then c.normalized_value #>> '{}'
         else c.normalized_value::text end,
    c.unit, c.currency, c.period_start, c.period_end, c.confidence, 'approved',
    c.source_anchor || jsonb_build_object(
      'raw_value', c.raw_value, 'normalized_value', c.normalized_value,
      'information_class', c.information_class, 'extraction_method', c.extraction_method
    ),
    actor_id, actor_id, coalesce(c.reviewed_at, now())
  from public.intake_field_candidates c
  where c.organization_id = p_organization_id
    and c.intake_session_id = p_session_id
    and c.review_state in ('accepted', 'edited')
    and c.is_primary;

  update public.source_documents
  set opportunity_id = v_opportunity_id
  where organization_id = p_organization_id and intake_session_id = p_session_id;
  get diagnostics v_documents = row_count;

  update public.document_intake_sessions
  set status = 'confirmed', opportunity_id = v_opportunity_id, confirmed_at = now()
  where organization_id = p_organization_id and id = p_session_id;

  return jsonb_build_object(
    'opportunity_id', v_opportunity_id, 'company_id', v_company_id, 'capital_request_id', v_request_id,
    'document_count', v_documents, 'already_confirmed', false
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- create_opportunity_intake: bound the derived title (same signature; grants preserved)
-- ---------------------------------------------------------------------------------------------

create or replace function public.create_opportunity_intake(
  p_organization_id uuid,
  p_legal_name text,
  p_sector text,
  p_purpose text,
  p_requested_amount numeric,
  p_currency text,
  p_desired_term_months integer,
  p_output_locale text default 'pt-BR'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  company_id uuid;
  request_id uuid;
  opportunity_id uuid;
  normalized_currency text := upper(p_currency);
  fingerprint bytea;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not (select private.is_org_member(p_organization_id)) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  if p_requested_amount <= 0 or p_desired_term_months not between 1 and 360 then
    raise exception 'invalid_economic_input' using errcode = '22023';
  end if;

  fingerprint := extensions.digest(
    concat_ws(
      '|',
      p_organization_id::text,
      lower(trim(p_legal_name)),
      lower(trim(p_purpose)),
      p_requested_amount::text,
      normalized_currency,
      p_desired_term_months::text
    ),
    'sha256'
  );

  insert into public.companies (
    organization_id, legal_name, display_name, jurisdiction_code, sector, reporting_currency, created_by
  ) values (
    p_organization_id, trim(p_legal_name), trim(p_legal_name), 'BR', nullif(trim(p_sector), ''), normalized_currency, actor_id
  )
  returning id into company_id;

  insert into public.capital_requests (
    organization_id, company_id, purpose, requested_amount, currency, desired_term_months, output_locale, status, created_by
  ) values (
    p_organization_id, company_id, trim(p_purpose), p_requested_amount, normalized_currency, p_desired_term_months, p_output_locale, 'submitted', actor_id
  )
  returning id into request_id;

  insert into public.opportunities (
    organization_id, company_id, capital_request_id, title, purpose, requested_amount, currency, fingerprint_hash, lead_user_id, created_by
  ) values (
    p_organization_id, company_id, request_id,
    private.bounded_opportunity_title(trim(p_legal_name), trim(p_purpose)),
    trim(p_purpose), p_requested_amount, normalized_currency, fingerprint, actor_id, actor_id
  )
  returning id into opportunity_id;

  return opportunity_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants: authenticated only
-- ---------------------------------------------------------------------------------------------

revoke all on function public.begin_intake_processing(uuid, uuid) from public;
revoke all on function public.complete_intake_processing(uuid, uuid, jsonb, jsonb, jsonb) from public;
revoke all on function public.review_intake_candidate(uuid, uuid, uuid, text, jsonb, text) from public;
revoke all on function public.confirm_document_intake(uuid, uuid, text) from public;
grant execute on function public.begin_intake_processing(uuid, uuid) to authenticated;
grant execute on function public.complete_intake_processing(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.review_intake_candidate(uuid, uuid, uuid, text, jsonb, text) to authenticated;
grant execute on function public.confirm_document_intake(uuid, uuid, text) to authenticated;
