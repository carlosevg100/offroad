-- Verified current mandates: a capital_provider organization registers its own fund and mandate,
-- confirms it through a dated event, renews it, withdraws it, and lets it expire. Another tenant
-- reads nothing and writes nothing. A company organization cannot register one at all. A record
-- cannot be promoted to confirmed without a confirmation event, by any role. The case-fit
-- projection emits dated declared evidence only while the record is confirmed and current, so a
-- draft, an expired window and a withdrawal never reach matching. All fixtures roll back.

begin;

-- ---------------------------------------------------------------------------------------------
-- Helpers (pg_temp only; created before any role switch)
-- ---------------------------------------------------------------------------------------------

create function pg_temp.expect_sqlstate(p_sql text, p_states text[], p_label text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = any (p_states) then
      return;
    end if;
    raise exception '% failed with % (%), expected one of %', p_label, sqlstate, sqlerrm, p_states;
  end;
  raise exception '% did not fail, expected one of %', p_label, p_states;
end;
$$;

/** The observations the case fit would read for one fund, or null when the fund is not projected. */
create function pg_temp.projected_mandate(p_org uuid, p_fund uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select entry->'mandate'
  from jsonb_array_elements(private.provider_case_fit_owned_sources_v1(p_org, now())) entry
  where entry->>'providerId' = p_fund::text;
$$;

create function pg_temp.projected_record(p_org uuid, p_fund uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select entry->'mandateRecord'
  from jsonb_array_elements(private.provider_case_fit_owned_sources_v1(p_org, now())) entry
  where entry->>'providerId' = p_fund::text;
$$;

/** How many criteria carry at least one observation. Zero means nothing can match. */
create function pg_temp.observed_criteria(p_org uuid, p_fund uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from jsonb_each(pg_temp.projected_mandate(p_org, p_fund)) criterion
  where jsonb_array_length(criterion.value) > 0;
$$;

-- ---------------------------------------------------------------------------------------------
-- Fixtures: two financier tenants and one company tenant
-- ---------------------------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
)
select id, 'authenticated', 'authenticated', email, '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, now(), now(), false, false
from (values
  ('10000000-0000-4000-8000-000000000e01'::uuid, 'mandate-owner@example.invalid'),
  ('10000000-0000-4000-8000-000000000e02'::uuid, 'mandate-other-financier@example.invalid'),
  ('10000000-0000-4000-8000-000000000e03'::uuid, 'mandate-company-owner@example.invalid')
) fixture(id, email);

insert into public.organizations (id, organization_type, name, created_by) values
  ('20000000-0000-4000-8000-000000000e01', 'capital_provider', 'Gestora de Credito Verificada', '10000000-0000-4000-8000-000000000e01'),
  ('20000000-0000-4000-8000-000000000e02', 'capital_provider', 'Outra Gestora de Credito', '10000000-0000-4000-8000-000000000e02'),
  ('20000000-0000-4000-8000-000000000e03', 'company', 'Companhia Emissora Sintetica', '10000000-0000-4000-8000-000000000e03');

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at, created_at) values
  ('20000000-0000-4000-8000-000000000e01', '10000000-0000-4000-8000-000000000e01', 'owner', 'active', now(), now() - interval '10 days'),
  ('20000000-0000-4000-8000-000000000e02', '10000000-0000-4000-8000-000000000e02', 'owner', 'active', now(), now() - interval '10 days'),
  ('20000000-0000-4000-8000-000000000e03', '10000000-0000-4000-8000-000000000e03', 'owner', 'active', now(), now() - interval '10 days');

create temporary table mandate_state (key text primary key, value uuid) on commit drop;
grant select, insert on mandate_state to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- 1. The organization registers its own fund and mandate, and confirms it through an event
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000e01","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  registered jsonb;
  confirmed jsonb;
  listed jsonb;
  entry jsonb;
begin
  registered := public.register_provider_mandate_v1(
    '20000000-0000-4000-8000-000000000e01'::uuid, null,
    'FIDC Verificado I', 'Credito estruturado para middle market',
    jsonb_build_object(
      'currency', 'BRL', 'ticketMin', '5000000', 'ticketMax', '40000000',
      'instruments', jsonb_build_array('debenture', 'nota_comercial'),
      'sectors', jsonb_build_array('varejo alimentar'),
      'geographies', jsonb_build_array('BR'),
      'collateral', jsonb_build_array('recebiveis', 'cessao_fiduciaria'),
      'termMonthsMin', 12, 'termMonthsMax', 60,
      'leverageCeiling', '3.5', 'minimumDscr', '1.2',
      'acceptingNewTransactions', true,
      'validFrom', (current_date - 5)::text,
      'sources', jsonb_build_array(jsonb_build_object('kind', 'internal_note', 'reference', 'regulamento v3'))));

  if registered->>'status' is distinct from 'draft' or (registered->>'versionNumber')::integer <> 1 then
    raise exception 'a registered mandate must enter as draft version 1, got %', registered;
  end if;
  insert into mandate_state values
    ('fund', (registered->>'fundId')::uuid), ('mandate', (registered->>'mandateId')::uuid);

  -- Before any event the record is a draft, and nothing in it reaches matching.
  listed := public.list_provider_mandates_v1('20000000-0000-4000-8000-000000000e01'::uuid);
  entry := listed->0;
  if entry->>'effectiveStatus' is distinct from 'draft' or entry->>'confirmedAt' is not null
    or (entry->>'confirmationCount')::integer <> 0 then
    raise exception 'an unconfirmed record must read as a draft with no confirmation, got %', entry;
  end if;

  confirmed := public.confirm_provider_mandate_v1(
    '20000000-0000-4000-8000-000000000e01'::uuid, (registered->>'mandateId')::uuid,
    'official_document', current_date - 5, current_date + 180,
    'Regulamento do fundo, 3a alteracao, clausula 7', null, null,
    'Confirmado pela gestora no proprio produto');

  if confirmed->>'status' is distinct from 'confirmed'
    or confirmed->>'effectiveStatus' is distinct from 'confirmed'
    or confirmed->>'confirmedAt' is null then
    raise exception 'confirmation must date the record, got %', confirmed;
  end if;
end;
$$;

-- The event is on record with its author, its channel and its window.
do $$
declare event public.provider_mandate_confirmations;
begin
  select * into event from public.provider_mandate_confirmations
  where mandate_id = (select value from mandate_state where key = 'mandate');
  if not found or event.channel <> 'official_document'
    or event.confirmed_by <> '10000000-0000-4000-8000-000000000e01'::uuid
    or event.document_reference is null or event.mandate_version_number <> 1 then
    raise exception 'the confirmation event must carry who, when, which version and which source';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. The confirmed mandate is what matching reads, dated at the confirmation
-- ---------------------------------------------------------------------------------------------

set local role postgres;

do $$
declare
  projected jsonb;
  ticket jsonb;
  summary jsonb;
begin
  projected := pg_temp.projected_mandate(
    '20000000-0000-4000-8000-000000000e01'::uuid, (select value from mandate_state where key = 'fund'));
  if projected is null then
    raise exception 'a registered fund must be projected for case fit';
  end if;
  if pg_temp.observed_criteria(
    '20000000-0000-4000-8000-000000000e01'::uuid, (select value from mandate_state where key = 'fund')) <> 10 then
    raise exception 'a confirmed mandate must answer every criterion, got %', projected;
  end if;

  ticket := projected->'ticket'->0;
  if ticket->>'provenance' is distinct from 'declared'
    or ticket->'value'->>'min' is distinct from '5000000'
    or ticket->'value'->>'max' is distinct from '40000000'
    or position('provider_mandates/' in (ticket->>'note')) <> 1 then
    raise exception 'confirmed evidence must be declared, exact and traceable to the record, got %', ticket;
  end if;
  if (projected->'currencies'->0->'value')::text is distinct from '["BRL"]' then
    raise exception 'the mandate currency must travel with the evidence, got %', projected->'currencies';
  end if;

  summary := pg_temp.projected_record(
    '20000000-0000-4000-8000-000000000e01'::uuid, (select value from mandate_state where key = 'fund'));
  if summary->>'effectiveStatus' is distinct from 'confirmed' or summary->>'channel' is distinct from 'official_document'
    or (summary->>'versionNumber')::integer <> 1 or summary->>'confirmedAt' is null then
    raise exception 'the candidate must carry the version, the status and the confirmation date, got %', summary;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. A public record cannot be promoted to confirmed without an event, by any role
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000e01","role":"authenticated","aal":"aal1"}', true);

do $$
declare registered jsonb;
begin
  registered := public.register_provider_mandate_v1(
    '20000000-0000-4000-8000-000000000e01'::uuid, (select value from mandate_state where key = 'fund'),
    null, null,
    jsonb_build_object('currency', 'BRL', 'ticketMin', '1000000', 'ticketMax', '9000000',
      'instruments', jsonb_build_array('ccb'), 'validFrom', current_date::text));
  if (registered->>'versionNumber')::integer <> 2 then
    raise exception 'a second mandate for the same fund must be version 2, got %', registered;
  end if;
  insert into mandate_state values ('unconfirmed', (registered->>'mandateId')::uuid);
end;
$$;

-- The tenant holds no update privilege on `status`: the column is outside the grant.
select pg_temp.expect_sqlstate(
  format('update public.provider_mandates set status = ''confirmed'' where id = %L',
    (select value from mandate_state where key = 'unconfirmed')),
  array['42501'], 'tenant writing status directly');

-- An insert that arrives already confirmed is refused by the insert policy, not by the interface.
select pg_temp.expect_sqlstate(
  format($sql$insert into public.provider_mandates
    (organization_id, fund_id, version_number, status, currency, ticket_min, ticket_max, instruments,
     valid_from, confirmed_at, confirmed_by, created_by)
    values ('20000000-0000-4000-8000-000000000e01', %L, 99, 'confirmed', 'BRL', 1, 2, array['ccb'],
      current_date, now(), '10000000-0000-4000-8000-000000000e01', '10000000-0000-4000-8000-000000000e01')$sql$,
    (select value from mandate_state where key = 'fund')),
  array['42501'], 'tenant inserting an already confirmed record');

-- A confirmation with an official-document channel and no reference is refused by the constraint.
select pg_temp.expect_sqlstate(
  format($sql$select public.confirm_provider_mandate_v1('20000000-0000-4000-8000-000000000e01', %L,
    'official_document', current_date, null, null, null, null, null)$sql$,
    (select value from mandate_state where key = 'unconfirmed')),
  array['23514'], 'confirming an official document with no reference');

-- A contact confirmation with no record id and no date is refused by the same contract.
select pg_temp.expect_sqlstate(
  format($sql$select public.confirm_provider_mandate_v1('20000000-0000-4000-8000-000000000e01', %L,
    'recorded_contact', current_date, null, null, null, null, null)$sql$,
    (select value from mandate_state where key = 'unconfirmed')),
  array['23514'], 'confirming a contact with no record and no date');

set local role postgres;

-- Even the owning role cannot move a record to confirmed while no event exists for that version.
select pg_temp.expect_sqlstate(
  format('update public.provider_mandates set status = ''confirmed'', confirmed_at = now(), confirmed_by = %L where id = %L',
    '10000000-0000-4000-8000-000000000e01', (select value from mandate_state where key = 'unconfirmed')),
  array['42501'], 'privileged role promoting a record with no event');

-- The version 2 draft is now the newest record for the fund, so the fund stops matching until it
-- is confirmed in turn. A record under revision is not still offering the previous terms.
do $$
begin
  if pg_temp.observed_criteria(
    '20000000-0000-4000-8000-000000000e01'::uuid, (select value from mandate_state where key = 'fund')) <> 0 then
    raise exception 'a draft version must remove the fund from matching until it is confirmed';
  end if;
  if pg_temp.projected_record(
    '20000000-0000-4000-8000-000000000e01'::uuid,
    (select value from mandate_state where key = 'fund'))->>'effectiveStatus' is distinct from 'draft' then
    raise exception 'the surface must still see the draft it has to confirm';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Another organization reads nothing and edits nothing here
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000e02","role":"authenticated","aal":"aal1"}', true);

do $$
begin
  if exists (select 1 from public.provider_mandates
    where organization_id = '20000000-0000-4000-8000-000000000e01') then
    raise exception 'another financier must read no mandate of this tenant';
  end if;
  if exists (select 1 from public.provider_mandate_confirmations
    where organization_id = '20000000-0000-4000-8000-000000000e01') then
    raise exception 'another financier must read no confirmation of this tenant';
  end if;
  if public.list_provider_mandates_v1('20000000-0000-4000-8000-000000000e01'::uuid) <> '[]'::jsonb then
    raise exception 'the listing must be scoped to the caller''s own tenant';
  end if;
  -- An update reaches zero rows through the policy rather than raising.
  update public.provider_mandates set ticket_max = 1
  where organization_id = '20000000-0000-4000-8000-000000000e01';
  if found then
    raise exception 'another financier must not edit this tenant''s mandate';
  end if;
end;
$$;

select pg_temp.expect_sqlstate(
  format($sql$select public.confirm_provider_mandate_v1('20000000-0000-4000-8000-000000000e01', %L,
    'direct_declaration', current_date, null, null, null, null, null)$sql$,
    (select value from mandate_state where key = 'unconfirmed')),
  array['42501'], 'another financier confirming this tenant''s mandate');

select pg_temp.expect_sqlstate(
  format($sql$select public.withdraw_provider_mandate_v1('20000000-0000-4000-8000-000000000e01', %L, null)$sql$,
    (select value from mandate_state where key = 'mandate')),
  array['42501'], 'another financier withdrawing this tenant''s mandate');

-- A company organization has no mandate capability at all.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000e03","role":"authenticated","aal":"aal1"}', true);

select pg_temp.expect_sqlstate(
  $sql$select public.register_provider_mandate_v1('20000000-0000-4000-8000-000000000e03', null,
    'Fundo da companhia', 'Estrategia', '{"currency":"BRL","ticketMin":"1","ticketMax":"2","instruments":["ccb"]}'::jsonb)$sql$,
  array['42501'], 'a company organization registering a mandate');

-- ---------------------------------------------------------------------------------------------
-- 5. Freshness: a closed window expires the record for matching with no scheduled job
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000e01","role":"authenticated","aal":"aal1"}', true);

do $$
declare
  registered jsonb;
  confirmed jsonb;
begin
  registered := public.register_provider_mandate_v1(
    '20000000-0000-4000-8000-000000000e01'::uuid, null,
    'FIDC Vencido II', 'Credito pulverizado',
    jsonb_build_object('currency', 'BRL', 'ticketMin', '2000000', 'ticketMax', '8000000',
      'instruments', jsonb_build_array('fidc'), 'validFrom', (current_date - 400)::text));
  insert into mandate_state values
    ('expired_fund', (registered->>'fundId')::uuid), ('expired', (registered->>'mandateId')::uuid);

  confirmed := public.confirm_provider_mandate_v1(
    '20000000-0000-4000-8000-000000000e01'::uuid, (registered->>'mandateId')::uuid,
    'direct_declaration', current_date - 400, current_date - 1, null, null, null, null);
  if confirmed->>'status' is distinct from 'confirmed'
    or confirmed->>'effectiveStatus' is distinct from 'expired' then
    raise exception 'a closed window must read as expired the moment it closes, got %', confirmed;
  end if;
end;
$$;

set local role postgres;

do $$
declare summary jsonb;
begin
  if pg_temp.observed_criteria(
    '20000000-0000-4000-8000-000000000e01'::uuid, (select value from mandate_state where key = 'expired_fund')) <> 0 then
    raise exception 'an expired mandate must never reach matching';
  end if;
  summary := pg_temp.projected_record(
    '20000000-0000-4000-8000-000000000e01'::uuid, (select value from mandate_state where key = 'expired_fund'));
  if summary->>'effectiveStatus' is distinct from 'expired' or summary->>'confirmedAt' is null then
    raise exception 'the surface must show the expiry and the date of the last confirmation, got %', summary;
  end if;
end;
$$;

-- Renewing is a second event with a new window, never an edit of the first.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000e01","role":"authenticated","aal":"aal1"}', true);

do $$
declare renewed jsonb;
begin
  renewed := public.confirm_provider_mandate_v1(
    '20000000-0000-4000-8000-000000000e01'::uuid, (select value from mandate_state where key = 'expired'),
    'recorded_contact', current_date, current_date + 365, null,
    '30000000-0000-4000-8000-0000000000aa'::uuid, current_date, 'Renovado em contato registrado');
  if renewed->>'effectiveStatus' is distinct from 'confirmed' then
    raise exception 'a renewal must bring the record back into its window, got %', renewed;
  end if;
  if (select count(*) from public.provider_mandate_confirmations
      where mandate_id = (select value from mandate_state where key = 'expired')) <> 2 then
    raise exception 'a renewal must add an event, never rewrite the first one';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Withdrawal is terminal and leaves matching in the same transaction
-- ---------------------------------------------------------------------------------------------

do $$
declare withdrawn jsonb;
begin
  withdrawn := public.withdraw_provider_mandate_v1(
    '20000000-0000-4000-8000-000000000e01'::uuid, (select value from mandate_state where key = 'expired'),
    'Fundo encerrou a captacao');
  if withdrawn->>'status' is distinct from 'withdrawn' or withdrawn->>'withdrawnAt' is null then
    raise exception 'a withdrawal must be dated, got %', withdrawn;
  end if;
end;
$$;

select pg_temp.expect_sqlstate(
  format($sql$select public.confirm_provider_mandate_v1('20000000-0000-4000-8000-000000000e01', %L,
    'direct_declaration', current_date, null, null, null, null, null)$sql$,
    (select value from mandate_state where key = 'expired')),
  array['40001'], 'confirming a withdrawn mandate');

set local role postgres;

do $$
begin
  if pg_temp.observed_criteria(
    '20000000-0000-4000-8000-000000000e01'::uuid, (select value from mandate_state where key = 'expired_fund')) <> 0 then
    raise exception 'a withdrawn mandate must never reach matching';
  end if;
  if pg_temp.projected_record(
    '20000000-0000-4000-8000-000000000e01'::uuid,
    (select value from mandate_state where key = 'expired_fund'))->>'effectiveStatus' is distinct from 'withdrawn' then
    raise exception 'the surface must say the mandate was withdrawn';
  end if;
end;
$$;

-- The organization's own reading keeps every version, its status and its last confirmation.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000e01","role":"authenticated","aal":"aal1"}', true);

do $$
declare listed jsonb;
begin
  listed := public.list_provider_mandates_v1('20000000-0000-4000-8000-000000000e01'::uuid);
  if jsonb_array_length(listed) <> 3 then
    raise exception 'every registered version must stay visible to its own tenant, got %', listed;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(listed) entry
    where entry->>'effectiveStatus' = 'withdrawn' and entry->'lastConfirmation'->>'channel' = 'recorded_contact'
      and (entry->>'confirmationCount')::integer = 2) then
    raise exception 'the withdrawn record must keep the date and origin of its last confirmation, got %', listed;
  end if;
end;
$$;

set local role postgres;

rollback;
