-- A company being financed belongs to one intake project. It is not the workspace identity.
-- This distinction is essential for originators that advise several companies and also keeps
-- company users from silently carrying stale facts from one financing into another.

alter table public.document_intake_sessions
  add column client_company_id uuid,
  add column company_profile jsonb not null default '{}'::jsonb,
  add constraint document_intake_sessions_company_profile_object
    check (jsonb_typeof(company_profile) = 'object'),
  add constraint document_intake_sessions_organization_client_company_fkey
    foreign key (organization_id, client_company_id)
    references public.companies (organization_id, id);

create index document_intake_sessions_client_company_idx
  on public.document_intake_sessions (organization_id, client_company_id)
  where client_company_id is not null;

-- Earlier releases confirmed the milestone without retaining a project-scoped snapshot. The
-- source cannot be reconstructed safely for advisor workspaces, so require an explicit review.
update public.document_intake_sessions
set company_profile_confirmed_at = null,
    updated_at = now()
where company_profile_confirmed_at is not null
  and company_profile = '{}'::jsonb;

create or replace function private.save_project_company_profile(
  p_session_id uuid,
  p_name text,
  p_legal_name text,
  p_website text,
  p_description text,
  p_identifier_hash bytea,
  p_identifier_last4 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  session_row public.document_intake_sessions;
  progress_row public.onboarding_progress;
  resolved_company_id uuid;
  normalized_name text := nullif(btrim(p_name), '');
  normalized_legal_name text := nullif(btrim(p_legal_name), '');
  normalized_website text := nullif(btrim(p_website), '');
  normalized_description text := nullif(btrim(p_description), '');
  normalized_identifier_last4 text := nullif(upper(btrim(p_identifier_last4)), '');
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.id = p_session_id
    and session.started_by = caller_id
    and session.status = 'collecting'
  for update;

  if not found or not (select private.is_org_type_member(
    session_row.organization_id,
    array['company', 'originator']
  )) then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;

  if normalized_name is null or char_length(normalized_name) < 2 then
    raise exception 'company_name_required' using errcode = '22023';
  end if;

  if normalized_identifier_last4 is not null
    and normalized_identifier_last4 !~ '^[0-9A-Z]{4}$' then
    raise exception 'invalid_legal_identifier' using errcode = '22023';
  end if;

  if (p_identifier_hash is null) <> (normalized_identifier_last4 is null) then
    raise exception 'incomplete_legal_identifier' using errcode = '22023';
  end if;

  if normalized_description is null and not exists (
    select 1
    from public.source_documents document
    where document.organization_id = session_row.organization_id
      and document.intake_session_id = session_row.id
  ) then
    raise exception 'company_context_required' using errcode = '22023';
  end if;

  -- A supplied identifier is the strongest key. Reuse an existing client record in this
  -- workspace instead of creating duplicates across projects for the same advised company.
  if p_identifier_hash is not null then
    select company.id into resolved_company_id
    from public.companies company
    where company.organization_id = session_row.organization_id
      and company.jurisdiction_code = 'BR'
      and company.legal_identifier_hash = p_identifier_hash
    limit 1;
  end if;

  resolved_company_id := coalesce(resolved_company_id, session_row.client_company_id);

  -- A direct company workspace may already have its canonical company record from onboarding.
  -- Originator onboarding, however, must never be interpreted as a client company record.
  if resolved_company_id is null and session_row.journey = 'company' then
    select progress.* into progress_row
    from public.onboarding_progress progress
    where progress.organization_id = session_row.organization_id
      and progress.user_id = caller_id
      and progress.journey = 'company'
    for update;

    if found then
      begin
        resolved_company_id := nullif(progress_row.answers ->> 'company_id', '')::uuid;
      exception when invalid_text_representation then
        resolved_company_id := null;
      end;

      if resolved_company_id is not null and not exists (
        select 1 from public.companies company
        where company.organization_id = session_row.organization_id
          and company.id = resolved_company_id
      ) then
        resolved_company_id := null;
      end if;
    end if;
  end if;

  if resolved_company_id is null then
    insert into public.companies (
      organization_id,
      legal_name,
      display_name,
      jurisdiction_code,
      legal_identifier_hash,
      legal_identifier_last4,
      description,
      website,
      reporting_currency,
      created_by
    ) values (
      session_row.organization_id,
      coalesce(normalized_legal_name, normalized_name),
      normalized_name,
      'BR',
      p_identifier_hash,
      normalized_identifier_last4,
      normalized_description,
      normalized_website,
      'BRL',
      caller_id
    ) returning id into resolved_company_id;
  else
    update public.companies company
    set display_name = normalized_name,
        legal_name = coalesce(normalized_legal_name, normalized_name),
        legal_identifier_hash = coalesce(p_identifier_hash, company.legal_identifier_hash),
        legal_identifier_last4 = coalesce(normalized_identifier_last4, company.legal_identifier_last4),
        description = normalized_description,
        website = normalized_website,
        updated_at = now()
    where company.organization_id = session_row.organization_id
      and company.id = resolved_company_id;

    if not found then
      raise exception 'client_company_not_found' using errcode = 'P0002';
    end if;
  end if;

  update public.document_intake_sessions session
  set client_company_id = resolved_company_id,
      company_profile = jsonb_strip_nulls(jsonb_build_object(
        'name', normalized_name,
        'legal_name', normalized_legal_name,
        'website', normalized_website,
        'description', normalized_description,
        'identifier_last4', (
          select company.legal_identifier_last4
          from public.companies company
          where company.organization_id = session_row.organization_id
            and company.id = resolved_company_id
        )
      )),
      company_profile_confirmed_at = coalesce(session.company_profile_confirmed_at, now()),
      updated_at = now()
  where session.id = session_row.id;

  -- Only a direct company journey may update the identity of its own workspace. An originator's
  -- workspace keeps the advisor's identity while every client remains scoped to its project.
  if session_row.journey = 'company' then
    update public.organizations organization
    set name = normalized_name,
        legal_name = coalesce(normalized_legal_name, normalized_name),
        website = normalized_website,
        description = normalized_description,
        updated_at = now()
    where organization.id = session_row.organization_id;

    update public.onboarding_progress progress
    set current_step = 'documents',
        answers = coalesce(progress.answers, '{}'::jsonb)
          || jsonb_build_object(
            'company_id', resolved_company_id,
            'guided_milestone', 'operation',
            'company_profile', (
              select session.company_profile
              from public.document_intake_sessions session
              where session.id = session_row.id
            )
          ),
        updated_at = now()
    where progress.organization_id = session_row.organization_id
      and progress.user_id = caller_id
      and progress.journey = 'company';
  else
    update public.onboarding_progress progress
    set current_step = 'documents',
        answers = coalesce(progress.answers, '{}'::jsonb)
          || jsonb_build_object('guided_milestone', 'operation'),
        updated_at = now()
    where progress.organization_id = session_row.organization_id
      and progress.user_id = caller_id
      and progress.journey = 'originator';
  end if;
end;
$$;

comment on column public.document_intake_sessions.client_company_id is
  'Company being financed in this project; distinct from the workspace organization.';
comment on column public.document_intake_sessions.company_profile is
  'Project-scoped snapshot confirmed by the user; never inherited silently by another project.';
comment on function private.save_project_company_profile(uuid, text, text, text, text, bytea, text) is
  'Saves a project-scoped client company without overwriting an originator workspace identity.';
