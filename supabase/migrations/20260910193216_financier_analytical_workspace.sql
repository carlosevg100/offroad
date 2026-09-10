-- Financier analytical workspace (Frente B, lote 2).
--
-- Organizations of type capital_provider (credit teams, managers, analysts) gain the own-analysis
-- capability: create projects and folders, accept the workspace terms with an information-usage
-- declaration that claims no representation, register and read their own documents, answer gaps
-- and continue in the same project. Mandate management stays exactly where it was. Origination,
-- representation and external disclosure remain closed to financiers and are now refused
-- explicitly (`workspace_capability_denied`, 42501) instead of by omission.
--
-- One tenant rule: the workspace bootstrap and every creator resolve the same membership
-- (`private.workspace_membership_v1`, the caller's oldest active membership). When that
-- organization lacks the capability the command refuses; it never creates in another
-- membership of the same user.
--
-- Every replaced function below is copied from the definition installed in the staging branch
-- on 10 September 2026 and only the marked lines change. No policy, check or validation is
-- removed; the journey domain and the borrower-side allowlists are extended deliberately and
-- the extension is covered by supabase/tests/financier_analytical_workspace.sql.

-- ---------------------------------------------------------------------------------------------
-- 1. Capability matrix (docs/product/FINANCIER_ANALYTICAL_WORKSPACE.md)
-- ---------------------------------------------------------------------------------------------

create or replace function private.organization_has_workspace_capability(
  p_organization_type text,
  p_capability text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_capability
    when 'own_analysis' then p_organization_type in ('company', 'originator', 'capital_provider')
    when 'mandate_management' then p_organization_type = 'capital_provider'
    when 'origination_representation' then p_organization_type in ('company', 'originator')
    when 'external_disclosure' then p_organization_type in ('company', 'originator')
    else false
  end;
$$;

revoke all on function private.organization_has_workspace_capability(text, text) from public, anon, authenticated;

comment on function private.organization_has_workspace_capability(text, text) is
  'Single source of the four workspace capabilities per organization type: own_analysis, mandate_management, origination_representation, external_disclosure.';

create or replace function private.require_workspace_capability(
  p_organization_type text,
  p_capability text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not private.organization_has_workspace_capability(p_organization_type, p_capability) then
    raise exception 'workspace_capability_denied'
      using errcode = '42501',
            detail = 'capability=' || coalesce(p_capability, '') || ' organization_type=' || coalesce(p_organization_type, '');
  end if;
end;
$$;

revoke all on function private.require_workspace_capability(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. One tenant: the membership the workspace displays is the membership every creator uses
-- ---------------------------------------------------------------------------------------------

create or replace function private.workspace_membership_v1()
returns table (organization_id uuid, role text, organization_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select membership.organization_id, membership.role, organization.organization_type
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id
  where membership.user_id = (select auth.uid())
    and membership.status = 'active'
  order by membership.created_at asc, membership.organization_id asc
  limit 1;
$$;

revoke all on function private.workspace_membership_v1() from public, anon, authenticated;

comment on function private.workspace_membership_v1() is
  'The caller''s displayed workspace: oldest active membership. Bootstrap, creation, upload, read and execution resolve the tenant through this one rule.';

create or replace function private.get_workspace_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  resolved_organization_id uuid;
  membership_record public.organization_memberships;
  organization_record public.organizations;
  progress_record public.onboarding_progress;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- Changed: the same resolver every creator uses.
  select resolved.organization_id into resolved_organization_id
  from private.workspace_membership_v1() resolved;
  if resolved_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;

  select membership.*
  into strict membership_record
  from public.organization_memberships membership
  where membership.organization_id = resolved_organization_id
    and membership.user_id = caller_id;

  select organization.*
  into strict organization_record
  from public.organizations organization
  where organization.id = membership_record.organization_id;

  select progress.*
  into progress_record
  from public.onboarding_progress progress
  where progress.organization_id = membership_record.organization_id
    and progress.user_id = caller_id
  order by progress.updated_at desc
  limit 1;

  return jsonb_build_object(
    'user_id', caller_id,
    'email', coalesce(auth.jwt() ->> 'email', ''),
    'membership', jsonb_build_object(
      'organization_id', membership_record.organization_id,
      'role', membership_record.role
    ),
    'organization', jsonb_build_object(
      'id', organization_record.id,
      'name', organization_record.name,
      'legal_name', organization_record.legal_name,
      'website', organization_record.website,
      'description', organization_record.description,
      'organization_type', organization_record.organization_type,
      'verification_status', organization_record.verification_status
    ),
    'onboarding', case when progress_record.user_id is null then null else jsonb_build_object(
      'journey', progress_record.journey,
      'current_step', progress_record.current_step,
      'answers', progress_record.answers,
      'completed_at', progress_record.completed_at
    ) end,
    'workspace_ready', progress_record.completed_at is not null
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Session contract: the financier journey exists and its tenant may read and update it
-- ---------------------------------------------------------------------------------------------

alter table public.document_intake_sessions
  drop constraint if exists document_intake_sessions_journey_check;
alter table public.document_intake_sessions
  add constraint document_intake_sessions_journey_check
  check (journey in ('company', 'originator', 'capital_provider'));

drop policy if exists document_intake_sessions_insert on public.document_intake_sessions;
create policy document_intake_sessions_insert on public.document_intake_sessions for insert to authenticated
  with check (
    (select private.is_org_type_member(organization_id, array['company', 'originator', 'capital_provider', 'offroad']))
    and started_by = (select auth.uid())
  );

drop policy if exists document_intake_sessions_select on public.document_intake_sessions;
create policy document_intake_sessions_select on public.document_intake_sessions for select to authenticated
  using ((select private.is_org_type_member(organization_id, array['company', 'originator', 'capital_provider', 'offroad'])));

drop policy if exists document_intake_sessions_update on public.document_intake_sessions;
create policy document_intake_sessions_update on public.document_intake_sessions for update to authenticated
  using ((select private.is_org_type_member(organization_id, array['company', 'originator', 'capital_provider', 'offroad'])))
  with check ((select private.is_org_type_member(organization_id, array['company', 'originator', 'capital_provider', 'offroad'])));

comment on policy document_intake_sessions_select on public.document_intake_sessions is
  'Members of company, originator, capital_provider and offroad tenants see their own intake sessions; membership-only so insert ... returning works.';

-- ---------------------------------------------------------------------------------------------
-- 4. Intake guards: analytical commands admit financiers, origination commands do not
-- ---------------------------------------------------------------------------------------------

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
  -- Changed: own analysis is open to financier tenants.
  if not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'capital_provider', 'offroad'])) then
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

comment on function private.intake_session_for_update(uuid, uuid) is
  'Entry guard for analytical intake commands: authenticated member of a company, originator, capital_provider or offroad tenant, session in scope, row locked.';

create or replace function private.intake_session_for_origination(p_organization_id uuid, p_session_id uuid)
returns public.document_intake_sessions
language plpgsql
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  if session_row.journey = 'capital_provider'
    or not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'offroad'])) then
    raise exception 'workspace_capability_denied'
      using errcode = '42501', detail = 'capability=origination_representation';
  end if;
  return session_row;
end;
$$;

revoke all on function private.intake_session_for_origination(uuid, uuid) from public, anon, authenticated;

comment on function private.intake_session_for_origination(uuid, uuid) is
  'Entry guard for commands that originate an opportunity or represent the company: the borrower-side allowlist of the original guard, never a financier session.';

-- confirm_document_intake_base: creates company, capital request and opportunity (origination).
create or replace function private.confirm_document_intake_base(p_organization_id uuid, p_session_id uuid, p_output_locale text default 'pt-BR'::text)
returns jsonb
language plpgsql
security definer
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
  -- Changed: origination guard.
  session_row := private.intake_session_for_origination(p_organization_id, p_session_id);

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
  if char_length(v_legal_name) not between 2 and 200 or char_length(v_purpose) not between 3 and 500 then
    raise exception 'intake_case_out_of_bounds' using errcode = '22023';
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

-- confirm_document_intake: the governed wrapper refuses financier sessions before any state read.
create or replace function private.confirm_document_intake(p_organization_id uuid, p_session_id uuid, p_output_locale text default 'pt-BR'::text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
  case_input_fingerprint text;
  diagnostic_snapshot public.deal_state_objects;
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'intake_session_access_denied' using errcode = '42501';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id
    and session.id = p_session_id
  for update;
  if not found then raise exception 'intake_session_not_found' using errcode = 'P0002'; end if;

  -- Changed: analyzing a company never originates its opportunity.
  if session_row.journey = 'capital_provider'
    or not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'offroad'])) then
    raise exception 'workspace_capability_denied'
      using errcode = '42501', detail = 'capability=origination_representation';
  end if;

  -- Preserve the original command's exact idempotency after a successful confirmation.
  if session_row.status = 'confirmed' and session_row.opportunity_id is not null then
    return private.confirm_document_intake_base(p_organization_id, p_session_id, p_output_locale);
  end if;

  if not exists (
    select 1
    from public.preliminary_understandings understanding
    where understanding.organization_id = p_organization_id
      and understanding.intake_session_id = p_session_id
      and understanding.status = 'confirmed'
  ) then
    raise exception 'preliminary_understanding_not_confirmed' using errcode = '55000';
  end if;

  if coalesce(jsonb_typeof(session_row.result_summary #> '{case_state,readiness,blockers}'), 'null') <> 'array'
    or jsonb_array_length(session_row.result_summary #> '{case_state,readiness,blockers}') > 0 then
    raise exception 'diagnostic_case_not_ready' using errcode = '55000';
  end if;
  case_input_fingerprint := session_row.result_summary #>> '{case_manifest,input_fingerprint}';
  select understanding.* into diagnostic_snapshot
    from public.deal_state_objects understanding
    where understanding.organization_id = p_organization_id
      and understanding.intake_session_id = p_session_id
      and understanding.object_type = 'understanding_snapshot'
      and understanding.status = 'pending_confirmation'
      and understanding.created_by_kind = 'worker'
      and understanding.input_fingerprint = case_input_fingerprint
      and jsonb_typeof(understanding.payload #> '{readiness,blockers}') = 'array'
      and jsonb_array_length(understanding.payload #> '{readiness,blockers}') = 0
    order by understanding.object_version desc
    limit 1
    for update;
  if case_input_fingerprint !~ '^[a-f0-9]{64}$' or not found then
    raise exception 'governed_diagnostic_snapshot_required' using errcode = '55000';
  end if;

  -- The review checkbox approves one exact diagnostic case. Countersign that worker snapshot
  -- in the same transaction that creates the opportunity. If either operation fails, neither
  -- survives; an opportunity can never exist without the case the company actually approved.
  perform private.record_deal_state_object(
    p_organization_id,
    p_session_id,
    'understanding_snapshot',
    'confirmed',
    diagnostic_snapshot.input_fingerprint,
    diagnostic_snapshot.payload || jsonb_build_object('confirmation', jsonb_build_object(
      'actorId', actor_id,
      'confirmedAt', now(),
      'scope', 'approved_diagnostic_case_for_structuring'
    )),
    '[]'::jsonb
  );

  return private.confirm_document_intake_base(p_organization_id, p_session_id, p_output_locale);
end;
$$;

-- attach_intake_session_to_opportunity: links a session to an opportunity (origination).
create or replace function private.attach_intake_session_to_opportunity(p_organization_id uuid, p_session_id uuid, p_opportunity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
  linked integer;
begin
  -- Changed: origination guard.
  session_row := private.intake_session_for_origination(p_organization_id, p_session_id);

  if session_row.status in ('confirmed', 'cancelled') then
    raise exception 'intake_session_already_confirmed' using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.opportunities
    where organization_id = p_organization_id and id = p_opportunity_id
  ) then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;

  update public.source_documents
  set opportunity_id = p_opportunity_id
  where organization_id = p_organization_id and intake_session_id = p_session_id;
  get diagnostics linked = row_count;

  update public.document_intake_sessions
  set status = 'confirmed',
      opportunity_id = p_opportunity_id,
      confirmed_at = now()
  where organization_id = p_organization_id and id = p_session_id;

  return jsonb_build_object('documents_linked', linked);
end;
$$;

-- record_intake_capital_need_command: declares the company's capital need as company or advisor.
-- A financier does not declare a need on behalf of the company it analyzes.
create or replace function private.record_intake_capital_need_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_event_id uuid,
  p_use_of_proceeds text,
  p_objective text default null::text,
  p_requested_amount numeric default null::numeric,
  p_currency text default null::text,
  p_urgency text default null::text,
  p_requested_term_months integer default null::integer,
  p_requested_grace_months integer default null::integer,
  p_consequence text default null::text,
  p_sector text default null::text,
  p_geography text default null::text,
  p_instruments text[] default '{}'::text[],
  p_collateral_kinds text[] default '{}'::text[],
  p_expected_rate text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  existing public.intake_domain_events;
  event_row public.intake_domain_events;
  frame_version integer;
  actor_role text;
  frame jsonb;
  event_payload jsonb;
  occurred_at timestamptz := clock_timestamp();
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  -- Changed: the declared-by role is company or advisor; a financier session has neither.
  if session_row.journey = 'capital_provider' then
    raise exception 'workspace_capability_denied'
      using errcode = '42501', detail = 'capability=origination_representation';
  end if;
  if session_row.status in ('confirmed', 'cancelled') then
    raise exception 'intake_session_terminal' using errcode = '55000';
  end if;
  if p_use_of_proceeds is null or p_use_of_proceeds not in (
    'working_capital', 'growth_expansion', 'acquisition', 'refinance',
    'equipment_finance', 'venture_debt', 'other'
  ) or p_requested_amount is not null and p_requested_amount <= 0
    or p_currency is not null and p_currency not in ('BRL', 'USD', 'EUR')
    or p_urgency is not null and p_urgency not in ('up_to_3_months', '3_to_6_months', '6_to_12_months', 'no_rush')
    or p_requested_term_months is not null and p_requested_term_months not between 1 and 360
    or p_requested_grace_months is not null and p_requested_grace_months not between 0 and 120
    or p_requested_grace_months is not null and p_requested_term_months is not null
      and p_requested_grace_months >= p_requested_term_months
    or p_geography is not null and trim(p_geography) !~ '^[A-Z]{2}$'
    or char_length(coalesce(nullif(trim(p_objective), ''), '')) > 4000
    or char_length(coalesce(nullif(trim(p_consequence), ''), '')) > 4000
    or char_length(coalesce(nullif(trim(p_sector), ''), '')) > 120
    or char_length(coalesce(nullif(trim(p_expected_rate), ''), '')) > 80
    or not (coalesce(p_instruments, '{}'::text[]) <@ array[
      'debenture', 'nota_comercial', 'ccb', 'cri', 'cra', 'fidc',
      'direct_loan', 'receivables_purchase', 'project_finance', 'equity_kicker_debt'
    ]::text[])
    or not (coalesce(p_collateral_kinds, '{}'::text[]) <@ array[
      'recebiveis', 'imovel', 'equipamento', 'estoque', 'aval_fianca',
      'cessao_fiduciaria', 'alienacao_fiduciaria_quotas', 'conta_reserva', 'quirografario'
    ]::text[]) then
    raise exception 'intake_capital_need_command_invalid' using errcode = '22023';
  end if;

  actor_role := case when session_row.journey = 'originator' then 'advisor' else 'company' end;

  frame := jsonb_strip_nulls(jsonb_build_object(
    'useOfProceeds', p_use_of_proceeds,
    'objective', nullif(trim(coalesce(p_objective, '')), ''),
    'requestedAmount', case when p_requested_amount is null then null else p_requested_amount::text end,
    'currency', p_currency,
    'urgency', p_urgency,
    'requestedTermMonths', p_requested_term_months,
    'requestedGraceMonths', p_requested_grace_months,
    'consequenceIfNotExecuted', nullif(trim(coalesce(p_consequence, '')), ''),
    'sector', nullif(trim(coalesce(p_sector, '')), ''),
    'geography', nullif(trim(coalesce(p_geography, '')), ''),
    'instrumentPreferences', to_jsonb(coalesce(p_instruments, '{}'::text[])),
    'availableCollateral', to_jsonb(coalesce(p_collateral_kinds, '{}'::text[])),
    'expectedRate', nullif(trim(coalesce(p_expected_rate, '')), ''),
    'declaredBy', jsonb_build_object('actorId', actor_id, 'role', actor_role)
  ));

  select * into existing
  from public.intake_domain_events event
  where event.organization_id = p_organization_id and event.event_id = p_event_id;
  if found then
    if existing.intake_session_id is distinct from p_session_id
      or existing.event_type <> 'capital_need_declared'
      or existing.created_by is distinct from actor_id
      or (existing.payload -> 'frame') - 'version' is distinct from frame then
      raise exception 'intake_event_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('eventId', existing.event_id, 'sequence', existing.sequence, 'replayed', true);
  end if;

  select count(*)::integer + 1 into frame_version
  from public.intake_domain_events event
  where event.organization_id = p_organization_id
    and event.intake_session_id = p_session_id
    and event.event_type = 'capital_need_declared';

  frame := frame || jsonb_build_object('version', frame_version);
  event_payload := jsonb_build_object('frame', frame);

  update public.document_intake_sessions
  set capital_objective = nullif(trim(coalesce(p_objective, '')), ''),
      requested_amount = p_requested_amount,
      capital_currency = p_currency,
      capital_urgency = p_urgency,
      requested_term_months = p_requested_term_months,
      requested_grace_months = p_requested_grace_months,
      capital_consequence = nullif(trim(coalesce(p_consequence, '')), ''),
      sector = nullif(trim(coalesce(p_sector, '')), ''),
      geography = nullif(trim(coalesce(p_geography, '')), ''),
      instruments = case when cardinality(coalesce(p_instruments, '{}'::text[])) = 0 then null else p_instruments end,
      collateral_kinds = case when cardinality(coalesce(p_collateral_kinds, '{}'::text[])) = 0 then null else p_collateral_kinds end,
      expected_rate = nullif(trim(coalesce(p_expected_rate, '')), '')
  where organization_id = p_organization_id and id = p_session_id;

  event_row := private.append_intake_domain_event(
    p_organization_id, p_session_id, p_event_id, 'capital_need_declared',
    event_payload, occurred_at, actor_id
  );
  return jsonb_build_object('eventId', event_row.event_id, 'sequence', event_row.sequence, 'replayed', false);
end;
$$;

-- set_intake_operation_context_command: declares the member organization (or the advised client)
-- as the primary borrower. A financier's own organization is never the borrower it analyzes.
create or replace function private.set_intake_operation_context_command(
  p_organization_id uuid,
  p_session_id uuid,
  p_frame_event_id uuid,
  p_route_event_id uuid,
  p_scope_event_id uuid,
  p_authorization_event_id uuid,
  p_early_triage_event_id uuid,
  p_group_scope_event_id uuid,
  p_archetype text,
  p_confidence text,
  p_rationale text,
  p_retest_triggers text[] default '{}'::text[],
  p_client_legal_name text default null::text,
  p_authority_kind text default null::text,
  p_authority_reference text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
  organization_row public.organizations;
  entity_id text;
  legal_name text;
  source_kind text;
  event_ids uuid[];
  frame_result jsonb;
  route_result jsonb;
  scope_result jsonb;
  authorization_result jsonb;
  early_result jsonb;
  group_result jsonb;
begin
  session_row := private.intake_session_for_update(p_organization_id, p_session_id);
  -- Changed: no fallback labels a financier as the company; the guided operation context is
  -- an issuer-side declaration and a financier's analysis lives in the project conversation.
  if session_row.journey = 'capital_provider' then
    raise exception 'workspace_capability_denied'
      using errcode = '42501', detail = 'capability=origination_representation';
  end if;
  select * into organization_row
  from public.organizations organization_record
  where organization_record.id = p_organization_id;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;

  event_ids := array[
    p_frame_event_id, p_route_event_id, p_scope_event_id,
    p_early_triage_event_id, p_group_scope_event_id
  ];
  if session_row.journey = 'originator' then
    event_ids := event_ids || p_authorization_event_id;
  elsif p_authorization_event_id is not null or p_client_legal_name is not null
    or p_authority_kind is not null or p_authority_reference is not null then
    raise exception 'company_intake_cannot_declare_advisor_authority' using errcode = '22023';
  end if;
  if array_position(event_ids, null) is not null
    or cardinality(event_ids) <> (select count(distinct event_id) from unnest(event_ids) event_id) then
    raise exception 'intake_event_ids_must_be_distinct' using errcode = '22023';
  end if;

  if session_row.journey = 'originator' then
    legal_name := nullif(trim(coalesce(p_client_legal_name, '')), '');
    if legal_name is null or char_length(legal_name) > 240
      or p_authority_kind is null then
      raise exception 'advisor_client_context_required' using errcode = '22023';
    end if;
    entity_id := 'advisor-client:' || p_session_id::text || ':borrower';
    source_kind := 'advisor_declaration';
  else
    legal_name := coalesce(nullif(trim(organization_row.legal_name), ''), organization_row.name);
    entity_id := 'organization:' || p_organization_id::text;
    source_kind := 'member_organization';
  end if;

  frame_result := private.record_intake_capital_need_command(
    p_organization_id, p_session_id, p_frame_event_id, p_archetype
  );
  route_result := private.set_intake_archetype_command(
    p_organization_id, p_session_id, p_route_event_id, p_archetype,
    p_confidence, p_rationale, p_retest_triggers
  );
  scope_result := private.record_analysis_scope_command(
    p_organization_id, p_session_id, p_scope_event_id,
    jsonb_build_array(jsonb_build_object(
      'entityId', entity_id,
      'legalName', legal_name,
      'role', 'borrower',
      'source', source_kind,
      'status', 'declared'
    )),
    case
      when session_row.journey = 'originator'
        then 'Primary borrower declared by the authorized advisor for this case.'
      else 'The member organization is the primary borrower initially declared for this case.'
    end
  );

  if session_row.journey = 'originator' then
    authorization_result := private.record_advisor_authorization_command(
      p_organization_id, p_session_id, p_authorization_event_id, entity_id,
      p_authority_kind, array['prepare_case']::text[], p_authority_reference
    );
  end if;

  early_result := private.record_intake_route_check(
    p_organization_id, p_session_id, p_early_triage_event_id,
    'early_triage', 'clear',
    case
      when session_row.journey = 'originator'
        then 'Capital purpose, primary borrower and advisor authority declaration are present.'
      else 'Capital purpose and primary borrower are present.'
    end,
    array['event:' || p_frame_event_id::text, 'event:' || p_scope_event_id::text]
  );
  group_result := private.record_intake_route_check(
    p_organization_id, p_session_id, p_group_scope_event_id,
    'group_scope', 'review_required',
    'Only the primary borrower is declared at day zero. Related entities, guarantors and targets remain subject to document review.',
    array['event:' || p_scope_event_id::text]
  );

  return jsonb_strip_nulls(jsonb_build_object(
    'frame', frame_result,
    'route', route_result,
    'scope', scope_result,
    'authorization', authorization_result,
    'earlyTriage', early_result,
    'groupScope', group_result
  ));
end;
$$;

-- prepare_qualified_introduction_plan: the introduction endpoint. External disclosure is a
-- company or advisor capability; a financier reading shared or own documents never prepares one.
create or replace function private.prepare_qualified_introduction_plan(p_organization_id uuid, p_session_id uuid, p_match_screen_fingerprint text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  match_screen public.deal_state_objects;
  session_row public.document_intake_sessions;
  policy_wave_limit integer;
  plan_id uuid;
  selected_count integer;
  inserted_count integer;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'qualified_introduction_plan_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.user_id = actor_id
      and membership.status = 'active'
      and membership.role in ('owner', 'admin')
  ) then
    raise exception 'qualified_introduction_plan_role_required' using errcode = '42501';
  end if;
  -- Changed: explicit external-disclosure capability check.
  if not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'offroad'])) then
    raise exception 'workspace_capability_denied'
      using errcode = '42501', detail = 'capability=external_disclosure';
  end if;

  select row.* into match_screen
  from public.deal_state_objects row
  where row.organization_id = p_organization_id
    and row.intake_session_id = p_session_id
    and row.object_type = 'match_screen'
    and row.object_fingerprint = p_match_screen_fingerprint
    and row.status = 'approved'
    and row.superseded_at is null
  order by row.object_version desc
  limit 1;
  if not found then
    raise exception 'approved_match_screen_required' using errcode = '22023';
  end if;
  if match_screen.payload ->> 'schemaVersion' <> '2026.08.29-v3'
    or match_screen.payload #>> '{approval,scope}' <> 'match_shortlist_only'
    or jsonb_typeof(match_screen.payload #> '{approval,selectedProviderIds}') <> 'array'
  then
    raise exception 'governed_match_screen_required' using errcode = '22023';
  end if;

  select row.* into session_row
  from public.document_intake_sessions row
  where row.organization_id = p_organization_id and row.id = p_session_id
  for update;
  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;

  select row.wave_limit into policy_wave_limit
  from public.market_distribution_policies row
  where row.status = 'active'
    and row.valid_from <= current_date
    and (row.valid_until is null or row.valid_until >= current_date)
  order by row.valid_from desc
  limit 1;

  select count(distinct selected.provider_id)
  into selected_count
  from jsonb_array_elements_text(match_screen.payload #> '{approval,selectedProviderIds}')
    selected(provider_id);
  if selected_count not between 1 and 20 then
    raise exception 'qualified_introduction_shortlist_invalid' using errcode = '22023';
  end if;

  select row.id into plan_id
  from public.qualified_introduction_plans row
  where row.organization_id = p_organization_id
    and row.intake_session_id = p_session_id
    and row.match_screen_fingerprint = p_match_screen_fingerprint
  limit 1;
  if found then
    return plan_id;
  end if;

  insert into public.qualified_introduction_plans (
    organization_id,
    intake_session_id,
    case_fingerprint,
    material_fingerprint,
    match_screen_fingerprint,
    wave_limit,
    identity_policy,
    status,
    created_by
  ) values (
    p_organization_id,
    p_session_id,
    match_screen.input_fingerprint,
    match_screen.payload ->> 'materialArtifactFingerprint',
    p_match_screen_fingerprint,
    coalesce(policy_wave_limit, 20),
    session_row.identity_policy,
    'draft',
    actor_id
  )
  returning id into plan_id;

  insert into public.qualified_introduction_targets (
    organization_id,
    intake_session_id,
    plan_id,
    match_screen_fingerprint,
    provider_id,
    provider_source,
    provider_kind,
    provider_name,
    fund_directory_id,
    provider_organization_id,
    provider_fund_id,
    mandate_fingerprint,
    rationale,
    position,
    created_by
  )
  select
    p_organization_id,
    p_session_id,
    plan_id,
    p_match_screen_fingerprint,
    selected.provider_id::uuid,
    candidate.value ->> 'providerSource',
    candidate.value ->> 'providerKind',
    candidate.value ->> 'providerName',
    nullif(candidate.value ->> 'fundDirectoryId', '')::uuid,
    nullif(candidate.value ->> 'providerOrganizationId', '')::uuid,
    nullif(candidate.value ->> 'providerFundId', '')::uuid,
    candidate.value ->> 'mandateFingerprint',
    candidate.value ->> 'rationale',
    selected.position::integer,
    actor_id
  from jsonb_array_elements_text(match_screen.payload #> '{approval,selectedProviderIds}')
    with ordinality selected(provider_id, position)
  join lateral (
    select item.value
    from jsonb_array_elements(match_screen.payload -> 'candidates') item(value)
    where item.value ->> 'providerId' = selected.provider_id
      and coalesce((item.value ->> 'eligibleForShortlist')::boolean, false)
    limit 1
  ) candidate on true;

  get diagnostics inserted_count = row_count;
  if inserted_count <> selected_count then
    raise exception 'selected_match_candidate_changed' using errcode = '22023';
  end if;

  return plan_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Analytical helpers with a borrower-side allowlist: the financier tenant joins it
-- ---------------------------------------------------------------------------------------------

create or replace function private.record_document_verification(p_organization_id uuid, p_document_id uuid, p_sha256 text, p_processing_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  -- Changed: allowlist.
  if not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'capital_provider', 'offroad'])) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_digest' using errcode = '22023';
  end if;
  if p_processing_status not in ('quarantined', 'clean', 'rejected') then
    raise exception 'invalid_processing_status' using errcode = '22023';
  end if;

  update public.source_documents
  set sha256 = p_sha256,
      sha256_verified_at = now(),
      processing_status = p_processing_status
  where organization_id = p_organization_id and id = p_document_id;
end;
$$;

create or replace function private.claim_case_brief(p_organization_id uuid, p_session_id uuid, p_lease_seconds integer default 180)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_at timestamptz;
begin
  -- The caller has to be a member of this organization. Reached by argument rather than by
  -- policy, this is the only thing standing between a definer and another tenant's session.
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  -- Changed: allowlist.
  if not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'capital_provider', 'offroad'])) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  -- `for update` on the caller's own row: two concurrent requests serialise here, and the loser
  -- reads the winner's claim rather than a value from before it was written.
  select (result_summary ->> 'brief_claimed_at')::timestamptz into claimed_at
  from public.document_intake_sessions
  where organization_id = p_organization_id and id = p_session_id
  for update;

  if not found then
    return false;
  end if;

  if claimed_at is not null and claimed_at > now() - make_interval(secs => p_lease_seconds) then
    return false;
  end if;

  update public.document_intake_sessions
  set result_summary = jsonb_set(
        coalesce(result_summary, '{}'::jsonb),
        '{brief_claimed_at}',
        to_jsonb(now()),
        true
      )
  where organization_id = p_organization_id and id = p_session_id;

  return true;
end;
$$;

create or replace function private.record_case_model_spend(p_organization_id uuid, p_session_id uuid, p_cost_usd numeric, p_calls integer default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  -- Changed: allowlist.
  if not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'capital_provider', 'offroad'])) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  update public.document_intake_sessions
  set result_summary = jsonb_set(
        jsonb_set(
          coalesce(result_summary, '{}'::jsonb),
          '{model_spend_usd}',
          to_jsonb(coalesce((result_summary ->> 'model_spend_usd')::numeric, 0) + greatest(coalesce(p_cost_usd, 0), 0)),
          true
        ),
        '{model_calls}',
        to_jsonb(coalesce((result_summary ->> 'model_calls')::integer, 0) + greatest(coalesce(p_calls, 0), 0)),
        true
      )
  where organization_id = p_organization_id and id = p_session_id;
end;
$$;

create or replace function private.read_processing_model_lineage(p_organization_id uuid, p_session_id uuid, p_processing_run_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  captured jsonb;
  expected_calls bigint;
begin
  -- Changed: allowlist.
  if (select auth.uid()) is null
    or not (select private.is_org_type_member(p_organization_id, array['company', 'originator', 'capital_provider', 'offroad'])) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.document_intake_sessions session
    where session.organization_id = p_organization_id and session.id = p_session_id
  ) then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;

  if p_processing_run_id is not null and not exists (
    select 1 from public.processing_runs run
    where run.organization_id = p_organization_id
      and run.intake_session_id = p_session_id
      and run.id = p_processing_run_id
  ) then
    raise exception 'processing_run_not_in_session' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(call.value order by job.created_at, call.ordinality)
      filter (where call.value is not null),
    '[]'::jsonb
  )
  into captured
  from public.processing_jobs job
  left join lateral jsonb_array_elements(
    case
      when jsonb_typeof(job.result -> 'model_lineage') = 'array' then job.result -> 'model_lineage'
      when jsonb_typeof(job.last_error -> 'model_lineage') = 'array' then job.last_error -> 'model_lineage'
      else '[]'::jsonb
    end
  ) with ordinality as call(value, ordinality) on true
  where job.organization_id = p_organization_id
    and job.intake_session_id = p_session_id
    and (p_processing_run_id is null or job.processing_run_id = p_processing_run_id);

  select coalesce(sum(job.model_calls), 0)
  into expected_calls
  from public.processing_jobs job
  where job.organization_id = p_organization_id
    and job.intake_session_id = p_session_id
    and (p_processing_run_id is null or job.processing_run_id = p_processing_run_id);

  return jsonb_build_object(
    'calls', coalesce(captured, '[]'::jsonb),
    'expected_calls', coalesce(expected_calls, 0),
    'captured_calls', jsonb_array_length(coalesce(captured, '[]'::jsonb))
  );
end;
$$;

create or replace function private.can_review_intake_claims(p_organization_id uuid, p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.document_intake_sessions session
      join public.organization_memberships membership
        on membership.organization_id = session.organization_id
      join public.organizations organization_record
        on organization_record.id = session.organization_id
      where session.organization_id = p_organization_id
        and session.id = p_session_id
        and session.status <> 'confirmed'
        -- Changed: allowlist.
        and organization_record.organization_type in ('company', 'originator', 'capital_provider', 'offroad')
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and membership.role in ('owner', 'admin', 'analyst', 'compliance')
    );
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Creators: same tenant as the bootstrap, explicit capability, never another membership
-- ---------------------------------------------------------------------------------------------

create or replace function private.start_advisor_project_v1(
  p_request_id uuid,
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_prompt text,
  p_access_basis text,
  p_plan jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
  normalized_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  normalized_prompt text := trim(coalesce(p_prompt, ''));
  project_id uuid;
  session_id uuid;
  conversation_id uuid;
  assistant_message_id uuid := gen_random_uuid();
  assistant_copy text;
  existing_message public.agent_messages;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select message.* into existing_message
  from public.agent_messages message
  where message.id = p_request_id
    and message.created_by = caller_id;
  if found then
    select session.capital_project_id into project_id
    from public.document_intake_sessions session
    where session.organization_id = existing_message.organization_id
      and session.id = existing_message.intake_session_id;
    return jsonb_build_object(
      'capital_project_id', project_id,
      'intake_session_id', existing_message.intake_session_id,
      'conversation_id', existing_message.conversation_id,
      'message_id', existing_message.id,
      'replayed', true
    );
  end if;

  if p_request_id is null
    or p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_name) not between 2 and 80
    or char_length(normalized_prompt) not between 2 and 8000
    or p_entry_job not in (
      'company_debt_view', 'origination_thesis', 'capital_planning',
      'structure_from_documents', 'review_existing_operation'
    )
    or p_access_basis not in ('public_information', 'authorized_private')
    or coalesce(jsonb_typeof(p_plan), 'null') <> 'object'
    or p_plan #>> '{job,id}' <> p_entry_job then
    raise exception 'invalid_advisor_project' using errcode = '22023';
  end if;

  -- Changed: the displayed tenant, checked for the capability the entry needs.
  select resolved.organization_id, resolved.organization_type
  into target_organization_id, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_type, 'own_analysis');
  if p_entry_job = 'origination_thesis' then
    perform private.require_workspace_capability(target_organization_type, 'origination_representation');
  end if;

  -- Private-document work relies on the one organization-level confidentiality acceptance.
  -- It deliberately does not assert authority to represent the company before investors.
  if p_access_basis = 'authorized_private' and not exists (
    select 1
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document
      on document.id = acceptance.legal_document_id
    where acceptance.organization_id = target_organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
      and document.status = 'active'
  ) then
    raise exception 'private_workspace_terms_required' using errcode = '42501';
  end if;

  insert into public.capital_projects (
    organization_id, project_name, entry_job, access_basis,
    status, current_phase, created_by
  ) values (
    target_organization_id, normalized_name, p_entry_job, p_access_basis,
    'active', 'understand', caller_id
  ) returning id into project_id;

  insert into public.document_intake_sessions (
    organization_id, capital_project_id, started_by, journey, locale,
    project_name, identity_policy, privacy_status,
    representation_kind, representation_status, company_profile
  ) values (
    target_organization_id, project_id, caller_id, target_organization_type, p_locale,
    normalized_name, 'identified_restricted',
    case when p_access_basis = 'authorized_private' then 'private' else 'public_information' end,
    null, 'not_claimed', '{}'::jsonb
  ) returning id into session_id;

  perform private.record_capital_project_plan(project_id, p_plan);

  insert into public.agent_conversations (
    organization_id, intake_session_id, state, created_by
  ) values (
    target_organization_id, session_id, 'asking', caller_id
  ) returning id into conversation_id;

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status,
    content, locale, metadata, created_by
  ) values (
    p_request_id, target_organization_id, conversation_id, session_id,
    'user', 'completed', normalized_prompt, p_locale,
    jsonb_build_object('kind', 'request', 'entryJob', p_entry_job), caller_id
  );

  assistant_copy := case p_locale
    when 'en-US' then
      'Understood. This project will keep the company, evidence, decisions and materials in one context. Add any documents you already have or continue describing the assignment. I will first confirm the company and scope, then show the work plan and the information still needed.'
    else
      'Entendi. Este projeto manterá companhia, evidências, decisões e materiais no mesmo contexto. Anexe o que já tiver ou continue descrevendo o trabalho. Primeiro vou confirmar a companhia e o escopo; depois mostro o plano e o que ainda será necessário.'
  end;

  insert into public.agent_messages (
    id, organization_id, conversation_id, intake_session_id, role, status,
    content, locale, reply_to_message_id, metadata, created_by
  ) values (
    assistant_message_id, target_organization_id, conversation_id, session_id,
    'assistant', 'completed', assistant_copy, p_locale, p_request_id,
    jsonb_build_object('kind', 'guidance', 'nextAction', 'add_context'), caller_id
  );

  return jsonb_build_object(
    'capital_project_id', project_id,
    'intake_session_id', session_id,
    'conversation_id', conversation_id,
    'message_id', p_request_id,
    'replayed', false
  );
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$$;

create or replace function private.create_workspace_project_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
  normalized_name text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  group_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if char_length(normalized_name) not between 2 and 80 then
    raise exception 'invalid_project_name' using errcode = '22023';
  end if;

  -- Changed: the displayed tenant, checked for own analysis.
  select resolved.organization_id, resolved.organization_type
  into target_organization_id, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_type, 'own_analysis');

  insert into public.workspace_project_groups (organization_id, name, created_by)
  values (target_organization_id, normalized_name, caller_id)
  returning id into group_id;
  return group_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$$;

create or replace function private.manage_workspace_project(p_session_id uuid, p_action text, p_project_name text default null::text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  target_organization_id uuid;
  target_organization_type text;
  session_row public.document_intake_sessions;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_session_id is null or p_action not in ('rename', 'archive') then
    raise exception 'invalid_project_action' using errcode = '22023';
  end if;

  -- Changed: the displayed tenant, checked for own analysis.
  select resolved.organization_id, resolved.role, resolved.organization_type
  into target_organization_id, caller_role, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_type, 'own_analysis');

  select session.*
  into session_row
  from public.document_intake_sessions session
  where session.organization_id = target_organization_id
    and session.id = p_session_id
  for update;

  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if p_action = 'rename' then
    if session_row.archived_at is not null then
      raise exception 'project_archived' using errcode = '55000';
    end if;
    if char_length(normalized_project_name) not between 2 and 80 then
      raise exception 'invalid_project_name' using errcode = '22023';
    end if;

    update public.document_intake_sessions session
    set project_name = normalized_project_name,
        updated_at = now()
    where session.organization_id = target_organization_id
      and session.id = p_session_id;

    if session_row.opportunity_id is not null then
      update public.opportunities opportunity
      set title = normalized_project_name,
          updated_at = now()
      where opportunity.organization_id = target_organization_id
        and opportunity.id = session_row.opportunity_id;
    end if;

    return jsonb_build_object('action', 'renamed', 'project_name', normalized_project_name);
  end if;

  if caller_role not in ('owner', 'admin') and session_row.started_by <> caller_id then
    raise exception 'project_archive_denied' using errcode = '42501';
  end if;
  if session_row.archived_at is not null then
    return jsonb_build_object('action', 'archived');
  end if;

  update public.document_intake_sessions session
  set status = case when session.status = 'confirmed' then session.status else 'cancelled' end,
      archived_at = now(),
      archived_by = caller_id,
      updated_at = now()
  where session.organization_id = target_organization_id
    and session.id = p_session_id;

  return jsonb_build_object('action', 'archived');
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$$;

create or replace function private.update_workspace_project(p_session_id uuid, p_project_name text, p_identity_policy text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_session_id is null
    or char_length(normalized_project_name) not between 2 and 80
    or p_identity_policy not in ('identified_restricted', 'blind_initial') then
    raise exception 'invalid_private_project_setup' using errcode = '22023';
  end if;

  -- Changed: the displayed tenant, checked for own analysis.
  select resolved.organization_id, resolved.organization_type
  into target_organization_id, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_type, 'own_analysis');

  update public.document_intake_sessions session
  set project_name = normalized_project_name,
      identity_policy = p_identity_policy,
      updated_at = now()
  where session.organization_id = target_organization_id
    and session.id = p_session_id
    and session.archived_at is null
    and session.status not in ('confirmed', 'cancelled');

  if not found then
    raise exception 'intake_session_not_editable' using errcode = 'P0002';
  end if;

  return p_session_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$$;

-- Legacy private project with a representation declaration: company or advisor only.
create or replace function private.start_workspace_project(p_locale text, p_project_name text, p_identity_policy text, p_representation_declared boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- Changed: the displayed tenant, checked for representation; never another membership.
  select resolved.organization_id, resolved.organization_type
  into target_organization_id, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_type, 'origination_representation');

  return private.start_workspace_intake(
    target_organization_id,
    p_locale,
    p_project_name,
    p_identity_policy,
    p_representation_declared
  );
end;
$$;

-- Public-information company view and origination thesis entries: company or advisor only.
create or replace function private.start_public_capital_project(p_locale text, p_project_name text, p_entry_job text, p_company_name text, p_company_website text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
  project_id uuid;
  session_id uuid;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  normalized_company_name text := trim(regexp_replace(coalesce(p_company_name, ''), '\s+', ' ', 'g'));
  normalized_website text := nullif(trim(coalesce(p_company_website, '')), '');
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_project_name) not between 2 and 80
    or char_length(normalized_company_name) not between 2 and 160
    or p_entry_job not in ('company_debt_view', 'origination_thesis', 'capital_planning')
    or coalesce(char_length(normalized_website), 0) > 500
    or (normalized_website is not null and normalized_website !~* '^https?://[^[:space:]]+$') then
    raise exception 'invalid_public_project_setup' using errcode = '22023';
  end if;

  -- Changed: the displayed tenant, checked for the public entry capability.
  select resolved.organization_id, resolved.organization_type
  into target_organization_id, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_type, 'origination_representation');

  insert into public.capital_projects (
    organization_id, project_name, entry_job, access_basis, status, current_phase, created_by
  ) values (
    target_organization_id, normalized_project_name, p_entry_job,
    'public_information', 'active', 'understand', caller_id
  ) returning id into project_id;

  insert into public.document_intake_sessions (
    organization_id, capital_project_id, started_by, journey, locale,
    project_name, identity_policy, privacy_status, representation_kind,
    representation_status, company_profile, company_context_received_at
  ) values (
    target_organization_id, project_id, caller_id, target_organization_type, p_locale,
    normalized_project_name, 'identified_restricted', 'public_information', null,
    'not_claimed', jsonb_strip_nulls(jsonb_build_object(
      'name', normalized_company_name,
      'website', normalized_website
    )), now()
  ) returning id into session_id;

  return session_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. Workspace terms: the same document, an information-usage declaration without representation
-- ---------------------------------------------------------------------------------------------

create or replace function private.financier_information_rights_statement(p_locale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_locale
    when 'en-US' then 'I confirm that my organization is authorized to use the information provided in this private analysis, without representing the analyzed company and without disclosing the case to third parties.'
    else 'Confirmo que minha organização está autorizada a usar as informações fornecidas nesta análise privada, sem representar a companhia analisada e sem divulgar o caso a terceiros.'
  end;
$$;

revoke all on function private.financier_information_rights_statement(text) from public, anon, authenticated;

comment on function private.financier_information_rights_statement(text) is
  'The information-usage declaration a financier signs with the workspace terms. It is what the interface shows and what the acceptance row records; it claims no representation.';

create or replace function private.get_workspace_project_setup(p_locale text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
  profile_record public.profiles;
  legal_document_record public.platform_legal_documents;
  terms_accepted boolean := false;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US') then
    raise exception 'unsupported_locale' using errcode = '22023';
  end if;

  -- Changed: the displayed tenant, checked for own analysis.
  select resolved.organization_id, resolved.organization_type
  into target_organization_id, target_organization_type
  from private.workspace_membership_v1() resolved;
  if target_organization_id is null then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;
  perform private.require_workspace_capability(target_organization_type, 'own_analysis');

  select profile.*
  into profile_record
  from public.profiles profile
  where profile.id = caller_id;

  select document.*
  into legal_document_record
  from public.platform_legal_documents document
  where document.document_key = 'private_workspace_terms'
    and document.locale = p_locale
    and document.status = 'active'
    and document.effective_at <= now()
  order by document.effective_at desc
  limit 1;

  if legal_document_record.id is not null then
    select exists (
      select 1
      from public.organization_legal_acceptances acceptance
      where acceptance.organization_id = target_organization_id
        and acceptance.document_key = legal_document_record.document_key
        and acceptance.document_version = legal_document_record.version
        and acceptance.document_hash = legal_document_record.document_hash
    ) into terms_accepted;
    -- Changed: a financier declares information usage, not representation.
    if target_organization_type = 'capital_provider' then
      legal_document_record.information_rights_statement := private.financier_information_rights_statement(p_locale);
    end if;
  end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'full_name', coalesce(profile_record.full_name, ''),
      'job_title', coalesce(profile_record.job_title, '')
    ),
    'legal_document', case
      when legal_document_record.id is null then null
      else jsonb_build_object(
        'title', legal_document_record.title,
        'version', legal_document_record.version,
        'rendered_text', legal_document_record.rendered_text,
        'body_sections', legal_document_record.body_sections,
        'acceptance_statement', legal_document_record.acceptance_statement,
        'information_rights_statement', legal_document_record.information_rights_statement
      )
    end,
    'terms_accepted', terms_accepted
  );
end;
$$;

create or replace function private.get_onboarding_bootstrap(p_locale text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  progress_record public.onboarding_progress;
  organization_record public.organizations;
  profile_record public.profiles;
  legal_document_record public.platform_legal_documents;
  terms_accepted boolean := false;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US') then
    raise exception 'unsupported_locale' using errcode = '22023';
  end if;

  select progress.*
  into progress_record
  from public.onboarding_progress progress
  join public.organization_memberships membership
    on membership.organization_id = progress.organization_id
   and membership.user_id = caller_id
   and membership.status = 'active'
  where progress.user_id = caller_id
    and progress.completed_at is null
  order by progress.updated_at desc
  limit 1;

  if not found then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;
  target_organization_id := progress_record.organization_id;

  select organization.*
  into strict organization_record
  from public.organizations organization
  where organization.id = target_organization_id;

  select profile.*
  into profile_record
  from public.profiles profile
  where profile.id = caller_id;

  -- Changed: the financier journey also accepts the workspace terms during onboarding.
  if progress_record.journey in ('company', 'originator', 'capital_provider') then
    select document.*
    into legal_document_record
    from public.platform_legal_documents document
    where document.document_key = 'private_workspace_terms'
      and document.locale = p_locale
      and document.status = 'active'
      and document.effective_at <= now()
    order by document.effective_at desc
    limit 1;

    if legal_document_record.id is not null then
      select exists (
        select 1
        from public.organization_legal_acceptances acceptance
        where acceptance.organization_id = target_organization_id
          and acceptance.document_key = legal_document_record.document_key
          and acceptance.document_version = legal_document_record.version
          and acceptance.document_hash = legal_document_record.document_hash
      ) into terms_accepted;
      -- Changed: a financier declares information usage, not representation.
      if organization_record.organization_type = 'capital_provider' then
        legal_document_record.information_rights_statement := private.financier_information_rights_statement(p_locale);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'user_id', caller_id,
    'organization', jsonb_build_object(
      'id', organization_record.id,
      'name', organization_record.name,
      'legal_name', organization_record.legal_name,
      'website', organization_record.website,
      'country_code', organization_record.country_code,
      'state_code', organization_record.state_code,
      'city', organization_record.city,
      'sector', organization_record.sector,
      'subsector', organization_record.subsector,
      'provider_type', organization_record.provider_type,
      'description', organization_record.description
    ),
    'progress', jsonb_build_object(
      'journey', progress_record.journey,
      'current_step', progress_record.current_step,
      'answers', progress_record.answers,
      'completed_at', progress_record.completed_at
    ),
    'profile', case when profile_record.id is null then null else jsonb_build_object(
      'full_name', profile_record.full_name,
      'job_title', profile_record.job_title
    ) end,
    'legal_document', case when legal_document_record.id is null then null else jsonb_build_object(
      'id', legal_document_record.id,
      'title', legal_document_record.title,
      'version', legal_document_record.version,
      'document_hash', legal_document_record.document_hash,
      'rendered_text', legal_document_record.rendered_text,
      'body_sections', legal_document_record.body_sections,
      'acceptance_statement', legal_document_record.acceptance_statement,
      'information_rights_statement', legal_document_record.information_rights_statement
    ) end,
    'terms_accepted', terms_accepted
  );
end;
$$;

create or replace function private.accept_private_workspace_terms(
  p_locale text,
  p_signatory_name text,
  p_signatory_title text,
  p_terms_agreed boolean,
  p_information_rights_declared boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_organization_type text;
  caller_role text;
  legal_document public.platform_legal_documents;
  acceptance_id uuid;
  request_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  client_ip inet;
  user_agent text := left(nullif(request_headers ->> 'user-agent', ''), 1000);
  raw_client_ip text := nullif(
    trim(split_part(coalesce(request_headers ->> 'x-forwarded-for', ''), ',', 1)),
    ''
  );
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(trim(coalesce(p_signatory_name, ''))) not between 2 and 160
    or (nullif(trim(coalesce(p_signatory_title, '')), '') is not null
      and char_length(trim(p_signatory_title)) not between 2 and 160)
    or not coalesce(p_terms_agreed, false)
    or not coalesce(p_information_rights_declared, false) then
    raise exception 'invalid_private_workspace_acceptance' using errcode = '22023';
  end if;

  begin
    if raw_client_ip is not null then
      client_ip := raw_client_ip::inet;
    end if;
  exception when invalid_text_representation then
    client_ip := null;
  end;

  -- Changed: the financier journey is admitted during onboarding.
  select progress.organization_id into target_organization_id
  from public.onboarding_progress progress
  join public.organization_memberships membership
    on membership.organization_id = progress.organization_id
   and membership.user_id = caller_id
   and membership.status = 'active'
  where progress.user_id = caller_id
    and progress.completed_at is null
    and progress.journey in ('company', 'originator', 'capital_provider')
  order by progress.updated_at desc
  limit 1;
  -- Changed: outside onboarding, an owner or admin of the displayed workspace may record the
  -- organization-level acceptance (legacy financier workspaces have none yet).
  if target_organization_id is null then
    select resolved.organization_id, resolved.role
    into target_organization_id, caller_role
    from private.workspace_membership_v1() resolved;
    if target_organization_id is null then
      raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
    end if;
    if caller_role not in ('owner', 'admin') then
      raise exception 'workspace_terms_acceptor_role_required' using errcode = '42501';
    end if;
  end if;

  select organization.organization_type into target_organization_type
  from public.organizations organization
  where organization.id = target_organization_id;

  select document.* into legal_document
  from public.platform_legal_documents document
  where document.document_key = 'private_workspace_terms'
    and document.locale = p_locale
    and document.status = 'active'
    and document.effective_at <= now()
  order by document.effective_at desc
  limit 1;
  if not found then
    raise exception 'active_private_workspace_terms_not_found' using errcode = 'P0002';
  end if;

  select acceptance.id into acceptance_id
  from public.organization_legal_acceptances acceptance
  where acceptance.organization_id = target_organization_id
    and acceptance.document_key = legal_document.document_key
    and acceptance.document_version = legal_document.version;

  if acceptance_id is not null then
    return acceptance_id;
  end if;

  insert into public.organization_legal_acceptances (
    organization_id,
    legal_document_id,
    document_key,
    document_version,
    document_hash,
    accepted_by,
    signatory_name,
    signatory_title,
    authority_declared,
    information_rights_declared,
    terms_agreed,
    acceptance_statement,
    information_rights_statement,
    acceptance_method,
    accepted_ip,
    accepted_user_agent,
    locale
  ) values (
    target_organization_id,
    legal_document.id,
    legal_document.document_key,
    legal_document.version,
    legal_document.document_hash,
    caller_id,
    trim(p_signatory_name),
    nullif(trim(coalesce(p_signatory_title, '')), ''),
    -- Changed: a financier records no authority to represent the analyzed company.
    case when target_organization_type = 'capital_provider' then null else true end,
    true,
    true,
    legal_document.acceptance_statement,
    case when target_organization_type = 'capital_provider'
      then private.financier_information_rights_statement(p_locale)
      else legal_document.information_rights_statement end,
    'clickwrap',
    client_ip,
    user_agent,
    p_locale
  )
  returning id into acceptance_id;

  return acceptance_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 8. Financier onboarding: enter the analytical workspace without activating a mandate
-- ---------------------------------------------------------------------------------------------

create or replace function private.start_financier_analytical_workspace_v1(
  p_locale text,
  p_signatory_name text,
  p_signatory_title text,
  p_terms_agreed boolean,
  p_information_rights_declared boolean,
  p_terms_acceptance_recorded boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  progress_row public.onboarding_progress;
  organization_row public.organizations;
  acceptance_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US') then
    raise exception 'unsupported_locale' using errcode = '22023';
  end if;

  select progress.* into progress_row
  from public.onboarding_progress progress
  join public.organization_memberships membership
    on membership.organization_id = progress.organization_id
   and membership.user_id = caller_id
   and membership.status = 'active'
  where progress.user_id = caller_id
    and progress.completed_at is null
    and progress.journey = 'capital_provider'
  order by progress.updated_at desc
  limit 1
  for update of progress;
  if not found then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;

  select organization.* into strict organization_row
  from public.organizations organization
  where organization.id = progress_row.organization_id;
  perform private.require_workspace_capability(organization_row.organization_type, 'own_analysis');
  perform private.require_workspace_capability(organization_row.organization_type, 'mandate_management');

  if coalesce(p_terms_acceptance_recorded, false) then
    select acceptance.id into acceptance_id
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document on document.id = acceptance.legal_document_id
    where acceptance.organization_id = progress_row.organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
      and document.status = 'active'
    order by acceptance.accepted_at desc
    limit 1;
    if acceptance_id is null then
      raise exception 'private_workspace_terms_required' using errcode = '42501';
    end if;
  else
    acceptance_id := private.accept_private_workspace_terms(
      p_locale, p_signatory_name, p_signatory_title, p_terms_agreed, p_information_rights_declared
    );
    if not exists (
      select 1 from public.organization_legal_acceptances acceptance
      where acceptance.id = acceptance_id
        and acceptance.organization_id = progress_row.organization_id
    ) then
      raise exception 'workspace_terms_organization_mismatch' using errcode = '42501';
    end if;
  end if;

  -- The analytical entry completes onboarding without a fund, a mandate or a contact. Mandate
  -- registration remains its own path and never becomes a prerequisite for analysis.
  update public.onboarding_progress progress
  set current_step = 'complete',
      completed_at = coalesce(progress.completed_at, now()),
      answers = coalesce(progress.answers, '{}'::jsonb) || jsonb_build_object(
        'workspace_entry', 'own_analysis',
        'terms_acceptance_id', acceptance_id
      ),
      updated_at = now()
  where progress.organization_id = progress_row.organization_id
    and progress.user_id = caller_id
    and progress.journey = 'capital_provider';

  return jsonb_build_object(
    'organization_id', progress_row.organization_id,
    'acceptance_id', acceptance_id,
    'workspace_ready', true
  );
end;
$$;

create or replace function public.start_financier_analytical_workspace_v1(
  p_locale text,
  p_signatory_name text,
  p_signatory_title text,
  p_terms_agreed boolean,
  p_information_rights_declared boolean,
  p_terms_acceptance_recorded boolean default false
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.start_financier_analytical_workspace_v1(
    p_locale, p_signatory_name, p_signatory_title, p_terms_agreed,
    p_information_rights_declared, p_terms_acceptance_recorded
  );
$$;

-- Same grant shape as start_advisor_project_v1: the public wrapper is security invoker, so the
-- private implementation must be executable by authenticated callers; anon never reaches it.
revoke all on function private.start_financier_analytical_workspace_v1(text, text, text, boolean, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.start_financier_analytical_workspace_v1(text, text, text, boolean, boolean, boolean)
  from public, anon;
grant execute on function private.start_financier_analytical_workspace_v1(text, text, text, boolean, boolean, boolean)
  to authenticated;
grant execute on function public.start_financier_analytical_workspace_v1(text, text, text, boolean, boolean, boolean)
  to authenticated;

comment on function public.start_financier_analytical_workspace_v1(text, text, text, boolean, boolean, boolean) is
  'Completes the financier onboarding through the analytical entry: records the workspace terms with the information-usage declaration and marks the workspace ready without activating a mandate.';
comment on function private.intake_session_for_origination(uuid, uuid) is
  'Entry guard for commands that originate an opportunity or represent the company: the borrower-side allowlist of the original guard, never a financier session.';
comment on policy document_intake_sessions_insert on public.document_intake_sessions is
  'Company, originator, capital_provider and offroad members start their own intake sessions.';
