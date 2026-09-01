-- Give every financing workspace a durable project identity and one of the six approved entry jobs.
-- Existing intake, evidence and Deal State tables remain the project memory; this migration adds
-- the missing root that lets different jobs converge without duplicating company truth.

create table public.capital_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid,
  project_name text not null check (char_length(trim(project_name)) between 2 and 80),
  entry_job text not null default 'capital_planning' check (entry_job in (
    'company_debt_view',
    'origination_thesis',
    'capital_planning',
    'structure_from_documents',
    'review_existing_operation',
    'prepare_materials_and_process'
  )),
  status text not null default 'active' check (status in (
    'active', 'paused', 'completed', 'archived'
  )),
  current_phase text not null default 'understand' check (current_phase in (
    'understand', 'diagnose', 'structure', 'prepare', 'match', 'introduce', 'capture_feedback'
  )),
  created_by uuid not null references auth.users(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, company_id)
    references public.companies(organization_id, id) on delete restrict,
  check (
    (status = 'archived' and archived_at is not null and archived_by is not null)
    or (status <> 'archived' and archived_at is null and archived_by is null)
  )
);

create unique index capital_projects_open_name_idx
  on public.capital_projects (organization_id, lower(project_name))
  where status <> 'archived';

create index capital_projects_org_updated_idx
  on public.capital_projects (organization_id, status, updated_at desc);

create index capital_projects_company_idx
  on public.capital_projects (organization_id, company_id, updated_at desc)
  where company_id is not null;

alter table public.capital_projects enable row level security;
alter table public.capital_projects force row level security;

create or replace function private.can_access_capital_project(
  p_organization_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.capital_projects project
      join public.organization_memberships membership
        on membership.organization_id = project.organization_id
      where project.organization_id = p_organization_id
        and project.id = p_project_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    );
$$;

revoke all on function private.can_access_capital_project(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_access_capital_project(uuid, uuid) to authenticated;

create policy capital_projects_select
  on public.capital_projects for select to authenticated
  using ((select private.can_access_capital_project(organization_id, id)));

revoke all privileges on public.capital_projects from public, anon, authenticated;
grant select on public.capital_projects to authenticated;

create trigger capital_projects_set_updated_at
  before update on public.capital_projects
  for each row execute function private.set_updated_at();

create trigger capital_projects_audit
  after insert or update or delete on public.capital_projects
  for each row execute function private.capture_audit_event();

alter table public.document_intake_sessions
  add column capital_project_id uuid,
  add column company_context_received_at timestamptz;

update public.document_intake_sessions
set company_context_received_at = company_profile_confirmed_at
where company_profile_confirmed_at is not null;

do $$
declare
  session_row record;
  project_id uuid;
  project_status text;
  project_phase text;
  base_project_name text;
  backfill_project_name text;
begin
  for session_row in
    select
      session.id,
      session.organization_id,
      session.client_company_id,
      session.project_name,
      session.started_by,
      session.status as session_status,
      session.archived_at,
      session.archived_by,
      opportunity.stage as opportunity_stage
    from public.document_intake_sessions session
    left join public.opportunities opportunity
      on opportunity.organization_id = session.organization_id
      and opportunity.id = session.opportunity_id
    where session.capital_project_id is null
    order by session.created_at, session.id
  loop
    project_status := case
      when session_row.archived_at is not null or session_row.session_status = 'cancelled'
        then 'archived'
      when session_row.opportunity_stage = 'closed'
        then 'completed'
      else 'active'
    end;
    project_phase := case session_row.opportunity_stage
      when 'analysis' then 'diagnose'
      when 'structuring' then 'structure'
      when 'materials' then 'prepare'
      when 'matching' then 'match'
      when 'market_ready' then 'introduce'
      when 'introduced' then 'introduce'
      when 'closed' then 'capture_feedback'
      else 'understand'
    end;
    base_project_name := coalesce(
      nullif(trim(session_row.project_name), ''),
      'Projeto ' || session_row.id::text
    );
    backfill_project_name := case
      when project_status <> 'archived' and exists (
        select 1
        from public.capital_projects project
        where project.organization_id = session_row.organization_id
          and project.status <> 'archived'
          and lower(project.project_name) = lower(base_project_name)
      ) then left(base_project_name, 35) || ' · ' || session_row.id::text
      else base_project_name
    end;

    insert into public.capital_projects (
      organization_id,
      company_id,
      project_name,
      entry_job,
      status,
      current_phase,
      created_by,
      archived_at,
      archived_by
    ) values (
      session_row.organization_id,
      session_row.client_company_id,
      backfill_project_name,
      'capital_planning',
      project_status,
      project_phase,
      session_row.started_by,
      case when project_status = 'archived'
        then coalesce(session_row.archived_at, now())
        else null
      end,
      case when project_status = 'archived'
        then coalesce(session_row.archived_by, session_row.started_by)
        else null
      end
    )
    returning id into project_id;

    update public.document_intake_sessions session
    set capital_project_id = project_id
    where session.organization_id = session_row.organization_id
      and session.id = session_row.id;
  end loop;
end;
$$;

alter table public.document_intake_sessions
  add constraint document_intake_sessions_capital_project_required
    check (capital_project_id is not null),
  add constraint document_intake_sessions_organization_capital_project_fkey
    foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete restrict;

create index document_intake_sessions_capital_project_idx
  on public.document_intake_sessions (organization_id, capital_project_id, updated_at desc);

alter table public.opportunities
  add column capital_project_id uuid,
  add constraint opportunities_organization_capital_project_fkey
    foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete restrict;

update public.opportunities opportunity
set capital_project_id = session.capital_project_id
from public.document_intake_sessions session
where session.organization_id = opportunity.organization_id
  and session.opportunity_id = opportunity.id
  and opportunity.capital_project_id is null;

create index opportunities_capital_project_idx
  on public.opportunities (organization_id, capital_project_id)
  where capital_project_id is not null;

create or replace function private.bind_capital_project_before_intake_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.capital_project_id is null then
    insert into public.capital_projects (
      organization_id, project_name, entry_job, status, current_phase, created_by
    ) values (
      new.organization_id,
      coalesce(
        nullif(trim(new.project_name), ''),
        'Projeto ' || new.id::text
      ),
      'capital_planning',
      'active',
      'understand',
      new.started_by
    )
    returning id into new.capital_project_id;
  elsif not exists (
    select 1
    from public.capital_projects project
    where project.organization_id = new.organization_id
      and project.id = new.capital_project_id
      and project.status <> 'archived'
  ) then
    raise exception 'capital_project_not_available' using errcode = 'P0002';
  end if;

  return new;
end;
$$;

revoke all on function private.bind_capital_project_before_intake_insert()
  from public, anon, authenticated;

create trigger document_intake_sessions_bind_capital_project
  before insert on public.document_intake_sessions
  for each row execute function private.bind_capital_project_before_intake_insert();

-- Text and documents are equivalent inputs. This stores only the draft context supplied on the
-- first screen; it does not create or mutate a canonical company. Identity becomes canonical
-- only after the user approves the preliminary understanding built from company + operation +
-- documents + public research.
create or replace function private.save_project_company_context(
  p_session_id uuid,
  p_profile jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  profile_name text := nullif(btrim(p_profile ->> 'name'), '');
  profile_description text := nullif(btrim(p_profile ->> 'description'), '');
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  join public.organization_memberships membership
    on membership.organization_id = session.organization_id
  where session.id = p_session_id
    and membership.user_id = caller_id
    and membership.status = 'active'
    and session.status = 'collecting'
    and session.archived_at is null
  for update of session;

  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;
  if coalesce(jsonb_typeof(p_profile), 'null') <> 'object' then
    raise exception 'invalid_company_context' using errcode = '22023';
  end if;

  if exists (
      select 1
      from jsonb_each(p_profile) entry
      where jsonb_typeof(entry.value) <> 'string'
    )
    or p_profile - array[
      'name', 'legal_name', 'website', 'description', 'identifier_hash_hex', 'identifier_last4'
    ] <> '{}'::jsonb
    or (profile_name is not null and char_length(profile_name) not between 2 and 160)
    or coalesce(char_length(p_profile ->> 'legal_name'), 0) > 200
    or coalesce(char_length(p_profile ->> 'website'), 0) > 500
    or coalesce(char_length(profile_description), 0) > 5000
    or (
      p_profile ? 'identifier_hash_hex'
      and coalesce(p_profile ->> 'identifier_hash_hex', '') !~ '^[a-f0-9]{64}$'
    )
    or (
      p_profile ? 'identifier_last4'
      and coalesce(p_profile ->> 'identifier_last4', '') !~ '^[0-9A-Z]{4}$'
    )
    or (p_profile ? 'identifier_hash_hex') <> (p_profile ? 'identifier_last4') then
    raise exception 'invalid_company_context' using errcode = '22023';
  end if;

  if profile_name is null and profile_description is null and not exists (
    select 1
    from public.source_documents document
    where document.organization_id = session_row.organization_id
      and document.intake_session_id = session_row.id
  ) then
    raise exception 'company_context_required' using errcode = '22023';
  end if;

  update public.document_intake_sessions session
  set company_profile = jsonb_strip_nulls(p_profile),
      company_context_received_at = coalesce(session.company_context_received_at, now()),
      updated_at = now()
  where session.organization_id = session_row.organization_id
    and session.id = session_row.id;
end;
$$;

create or replace function public.save_project_company_context(
  p_session_id uuid,
  p_profile jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.save_project_company_context(p_session_id, p_profile);
$$;

revoke all on function private.save_project_company_context(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.save_project_company_context(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.save_project_company_context(uuid, jsonb) to authenticated;
grant execute on function public.save_project_company_context(uuid, jsonb) to authenticated;

-- Adopting the identity that the user just confirmed is part of the same decision, not a new
-- input that should invalidate that decision. Every other company/operation edit keeps the
-- original supersession behavior.
create or replace function private.invalidate_preliminary_understanding_on_input_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('offroad.adopting_preliminary_identity', true) = 'on' then
    return new;
  end if;

  if old.company_profile is distinct from new.company_profile
    or old.archetype is distinct from new.archetype
    or old.capital_objective is distinct from new.capital_objective
    or old.requested_amount is distinct from new.requested_amount
    or old.capital_currency is distinct from new.capital_currency
    or old.capital_urgency is distinct from new.capital_urgency
    or old.requested_term_months is distinct from new.requested_term_months
    or old.requested_grace_months is distinct from new.requested_grace_months
    or old.capital_consequence is distinct from new.capital_consequence
    or old.sector is distinct from new.sector
    or old.geography is distinct from new.geography
    or old.instruments is distinct from new.instruments
    or old.collateral_kinds is distinct from new.collateral_kinds then
    update public.preliminary_understandings understanding
    set status = 'superseded'
    where understanding.organization_id = new.organization_id
      and understanding.intake_session_id = new.id
      and understanding.status in ('pending_confirmation', 'confirmed', 'changes_requested');
  end if;
  return new;
end;
$$;

revoke all on function private.invalidate_preliminary_understanding_on_input_change()
  from public, anon, authenticated;

create or replace function private.adopt_confirmed_preliminary_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.document_intake_sessions;
  resolved_company_id uuid;
  matched_company_id uuid;
  existing_identifier_hash bytea;
  confirmed_company_name text := nullif(btrim(new.payload #>> '{company,name}'), '');
  confirmed_legal_name text := nullif(btrim(new.payload #>> '{company,legalName}'), '');
  confirmed_description text := nullif(btrim(new.payload #>> '{company,description}'), '');
  confirmed_website text := nullif(btrim(new.payload #>> '{company,website}'), '');
  identifier_value text;
  identifier_hash bytea;
  identifier_last4 text;
begin
  if new.status <> 'confirmed' or old.status = 'confirmed' then return new; end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = new.organization_id
    and session.id = new.intake_session_id
  for update;
  if not found then return new; end if;

  if confirmed_company_name is null or lower(confirmed_company_name) in (
    'companhia ainda não identificada', 'company not yet identified'
  ) then
    return new;
  end if;

  select regexp_replace(candidate.normalized_value #>> '{}', '[^0-9A-Za-z]', '', 'g')
  into identifier_value
  from public.intake_field_candidates candidate
  where candidate.organization_id = new.organization_id
    and candidate.intake_session_id = new.intake_session_id
    and candidate.field_path in ('company.legal_identifier', 'company.tax_id')
    and candidate.anchor_verified
  order by candidate.evidence_rank, candidate.confidence desc, candidate.id
  limit 1;

  identifier_value := nullif(identifier_value, '');
  if identifier_value is not null then
    identifier_hash := extensions.digest(convert_to(identifier_value, 'utf8'), 'sha256');
    identifier_last4 := right(identifier_value, 4);
  elsif coalesce(session_row.company_profile ->> 'identifier_hash_hex', '') ~ '^[a-f0-9]{64}$'
    and coalesce(session_row.company_profile ->> 'identifier_last4', '') ~ '^[0-9A-Z]{4}$' then
    identifier_hash := decode(session_row.company_profile ->> 'identifier_hash_hex', 'hex');
    identifier_last4 := session_row.company_profile ->> 'identifier_last4';
  end if;

  resolved_company_id := session_row.client_company_id;
  if identifier_hash is not null then
    select company.id into matched_company_id
    from public.companies company
    where company.organization_id = new.organization_id
      and company.jurisdiction_code = 'BR'
      and company.legal_identifier_hash = identifier_hash
    limit 1;

    if matched_company_id is not null then
      resolved_company_id := matched_company_id;
    elsif resolved_company_id is not null then
      select company.legal_identifier_hash into existing_identifier_hash
      from public.companies company
      where company.organization_id = new.organization_id
        and company.id = resolved_company_id;

      -- A confirmed identifier that belongs to another legal entity starts a new company record;
      -- it never rewrites the identity of an earlier project in an advisor workspace.
      if existing_identifier_hash is not null
        and existing_identifier_hash is distinct from identifier_hash then
        resolved_company_id := null;
      end if;
    end if;
  end if;

  if resolved_company_id is null then
    insert into public.companies (
      organization_id, legal_name, display_name, jurisdiction_code,
      legal_identifier_hash, legal_identifier_last4, description, website,
      reporting_currency, created_by
    ) values (
      new.organization_id, coalesce(confirmed_legal_name, confirmed_company_name),
      confirmed_company_name, 'BR', identifier_hash, identifier_last4,
      confirmed_description, confirmed_website,
      'BRL', new.decided_by
    )
    on conflict (organization_id, jurisdiction_code, legal_identifier_hash)
    do update set
      legal_name = excluded.legal_name,
      display_name = excluded.display_name,
      description = coalesce(excluded.description, public.companies.description),
      website = coalesce(excluded.website, public.companies.website),
      updated_at = now()
    returning id into resolved_company_id;
  else
    update public.companies company
    set legal_name = coalesce(confirmed_legal_name, confirmed_company_name),
        display_name = confirmed_company_name,
        legal_identifier_hash = coalesce(identifier_hash, company.legal_identifier_hash),
        legal_identifier_last4 = coalesce(identifier_last4, company.legal_identifier_last4),
        description = coalesce(confirmed_description, company.description),
        website = coalesce(confirmed_website, company.website),
        updated_at = now()
    where company.organization_id = new.organization_id
      and company.id = resolved_company_id;
  end if;

  perform set_config('offroad.adopting_preliminary_identity', 'on', true);
  update public.document_intake_sessions session
  set client_company_id = resolved_company_id,
      company_profile = jsonb_strip_nulls(jsonb_build_object(
        'name', confirmed_company_name,
        'legal_name', confirmed_legal_name,
        'website', confirmed_website,
        'description', confirmed_description,
        'identifier_last4', identifier_last4
      )),
      company_profile_confirmed_at = coalesce(session.company_profile_confirmed_at, now()),
      company_context_received_at = coalesce(session.company_context_received_at, now()),
      updated_at = now()
  where session.organization_id = new.organization_id
    and session.id = new.intake_session_id;

  return new;
end;
$$;

revoke all on function private.adopt_confirmed_preliminary_company()
  from public, anon, authenticated;

create trigger preliminary_understandings_adopt_confirmed_company
  after update of status on public.preliminary_understandings
  for each row execute function private.adopt_confirmed_preliminary_company();

create or replace function private.sync_capital_project_from_intake()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  opportunity_stage text;
begin
  if new.opportunity_id is not null then
    select opportunity.stage into opportunity_stage
    from public.opportunities opportunity
    where opportunity.organization_id = new.organization_id
      and opportunity.id = new.opportunity_id;

    update public.opportunities opportunity
    set capital_project_id = new.capital_project_id,
        updated_at = now()
    where opportunity.organization_id = new.organization_id
      and opportunity.id = new.opportunity_id
      and opportunity.capital_project_id is distinct from new.capital_project_id;
  end if;

  update public.capital_projects project
  set company_id = new.client_company_id,
      project_name = coalesce(nullif(trim(new.project_name), ''), project.project_name),
      status = case
        when new.archived_at is not null or new.status = 'cancelled' then 'archived'
        when opportunity_stage = 'closed' then 'completed'
        else project.status
      end,
      current_phase = case opportunity_stage
        when 'analysis' then 'diagnose'
        when 'structuring' then 'structure'
        when 'materials' then 'prepare'
        when 'matching' then 'match'
        when 'market_ready' then 'introduce'
        when 'introduced' then 'introduce'
        when 'closed' then 'capture_feedback'
        else project.current_phase
      end,
      archived_at = case
        when new.archived_at is not null or new.status = 'cancelled'
          then coalesce(new.archived_at, now())
        else project.archived_at
      end,
      archived_by = case
        when new.archived_at is not null or new.status = 'cancelled'
          then coalesce(new.archived_by, new.started_by)
        else project.archived_by
      end
  where project.organization_id = new.organization_id
    and project.id = new.capital_project_id;

  return new;
end;
$$;

revoke all on function private.sync_capital_project_from_intake()
  from public, anon, authenticated;

create trigger document_intake_sessions_sync_capital_project
  after update of client_company_id, project_name, status, archived_at, archived_by, opportunity_id
  on public.document_intake_sessions
  for each row execute function private.sync_capital_project_from_intake();

create or replace function private.sync_capital_project_from_opportunity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.capital_project_id is not null then
    update public.capital_projects project
    set current_phase = case new.stage
        when 'analysis' then 'diagnose'
        when 'structuring' then 'structure'
        when 'materials' then 'prepare'
        when 'matching' then 'match'
        when 'market_ready' then 'introduce'
        when 'introduced' then 'introduce'
        when 'closed' then 'capture_feedback'
        else project.current_phase
      end,
      status = case when new.stage = 'closed' then 'completed' else project.status end
    where project.organization_id = new.organization_id
      and project.id = new.capital_project_id;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_capital_project_from_opportunity()
  from public, anon, authenticated;

create trigger opportunities_sync_capital_project
  after insert or update on public.opportunities
  for each row execute function private.sync_capital_project_from_opportunity();

create or replace function private.set_workspace_project_job(
  p_session_id uuid,
  p_entry_job text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_entry_job not in (
    'company_debt_view',
    'origination_thesis',
    'capital_planning',
    'structure_from_documents',
    'review_existing_operation',
    'prepare_materials_and_process'
  ) then
    raise exception 'invalid_capital_project_job' using errcode = '22023';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  join public.organization_memberships membership
    on membership.organization_id = session.organization_id
  where session.id = p_session_id
    and membership.user_id = caller_id
    and membership.status = 'active'
    and session.archived_at is null
    and session.status <> 'cancelled'
  for update of session;

  if not found then
    raise exception 'capital_project_not_found' using errcode = 'P0002';
  end if;

  update public.capital_projects project
  set entry_job = p_entry_job
  where project.organization_id = session_row.organization_id
    and project.id = session_row.capital_project_id;

  return session_row.capital_project_id;
end;
$$;

create or replace function public.set_workspace_project_job(
  p_session_id uuid,
  p_entry_job text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.set_workspace_project_job(p_session_id, p_entry_job);
$$;

revoke all on function private.set_workspace_project_job(uuid, text)
  from public, anon, authenticated;
revoke all on function public.set_workspace_project_job(uuid, text)
  from public, anon, authenticated;
grant execute on function private.set_workspace_project_job(uuid, text) to authenticated;
grant execute on function public.set_workspace_project_job(uuid, text) to authenticated;

create or replace function private.start_workspace_capital_project(
  p_locale text,
  p_project_name text,
  p_identity_policy text,
  p_representation_declared boolean,
  p_entry_job text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_id uuid;
begin
  session_id := private.start_workspace_project(
    p_locale, p_project_name, p_identity_policy, p_representation_declared
  );
  perform private.set_workspace_project_job(session_id, p_entry_job);
  return session_id;
end;
$$;

create or replace function private.start_onboarding_capital_project(
  p_locale text,
  p_project_name text,
  p_identity_policy text,
  p_representation_declared boolean,
  p_entry_job text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_id uuid;
begin
  session_id := private.start_onboarding_project(
    p_locale, p_project_name, p_identity_policy, p_representation_declared
  );
  perform private.set_workspace_project_job(session_id, p_entry_job);
  return session_id;
end;
$$;

create or replace function public.start_onboarding_capital_project(
  p_locale text,
  p_project_name text,
  p_identity_policy text,
  p_representation_declared boolean,
  p_entry_job text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.start_onboarding_capital_project(
    p_locale, p_project_name, p_identity_policy, p_representation_declared, p_entry_job
  );
$$;

create or replace function public.start_workspace_capital_project(
  p_locale text,
  p_project_name text,
  p_identity_policy text,
  p_representation_declared boolean,
  p_entry_job text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.start_workspace_capital_project(
    p_locale, p_project_name, p_identity_policy, p_representation_declared, p_entry_job
  );
$$;

revoke all on function private.start_workspace_capital_project(text, text, text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.start_workspace_capital_project(text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function private.start_workspace_capital_project(text, text, text, boolean, text)
  to authenticated;
grant execute on function public.start_workspace_capital_project(text, text, text, boolean, text)
  to authenticated;

revoke all on function private.start_onboarding_capital_project(text, text, text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.start_onboarding_capital_project(text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function private.start_onboarding_capital_project(text, text, text, boolean, text)
  to authenticated;
grant execute on function public.start_onboarding_capital_project(text, text, text, boolean, text)
  to authenticated;

comment on table public.capital_projects is
  'Durable capital-decision projects. Six entry jobs converge on the existing intake, evidence and Deal State memory linked by capital_project_id.';
comment on column public.capital_projects.entry_job is
  'The user work that compiled the initial task subgraph; never a persona or a separate product.';
comment on column public.document_intake_sessions.capital_project_id is
  'Durable project root for this intake and every downstream object reachable through the session.';
comment on function public.start_workspace_capital_project(text, text, text, boolean, text) is
  'Creates a private workspace intake and binds one of the six canonical entry jobs in the same transaction.';
comment on function public.start_onboarding_capital_project(text, text, text, boolean, text) is
  'Creates the first private workspace intake and binds one of the six canonical entry jobs in the same transaction.';
