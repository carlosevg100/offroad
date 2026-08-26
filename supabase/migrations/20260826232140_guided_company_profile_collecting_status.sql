-- Align the guided profile milestone with the canonical intake lifecycle.
-- New document intake sessions are created in `collecting`, not `open`.

create or replace function private.save_guided_company_profile(
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
  company_id uuid;
  normalized_name text := nullif(btrim(p_name), '');
  normalized_legal_name text := nullif(btrim(p_legal_name), '');
  normalized_website text := nullif(btrim(p_website), '');
  normalized_description text := nullif(btrim(p_description), '');
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

  if normalized_description is null and not exists (
    select 1
    from public.source_documents document
    where document.organization_id = session_row.organization_id
      and document.intake_session_id = session_row.id
  ) then
    raise exception 'company_context_required' using errcode = '22023';
  end if;

  select progress.* into progress_row
  from public.onboarding_progress progress
  where progress.organization_id = session_row.organization_id
    and progress.user_id = caller_id
    and progress.journey = session_row.journey
  for update;

  if not found then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;

  update public.organizations organization
  set name = normalized_name,
      legal_name = coalesce(normalized_legal_name, normalized_name),
      website = normalized_website,
      description = normalized_description,
      updated_at = now()
  where organization.id = session_row.organization_id;

  if session_row.journey = 'company' then
    begin
      company_id := nullif(progress_row.answers ->> 'company_id', '')::uuid;
    exception when invalid_text_representation then
      company_id := null;
    end;

    if company_id is not null then
      update public.companies company
      set display_name = normalized_name,
          legal_name = coalesce(normalized_legal_name, normalized_name),
          legal_identifier_hash = p_identifier_hash,
          legal_identifier_last4 = nullif(p_identifier_last4, ''),
          website = normalized_website,
          updated_at = now()
      where company.organization_id = session_row.organization_id
        and company.id = company_id;

      if not found then
        company_id := null;
      end if;
    end if;

    if company_id is null then
      insert into public.companies (
        organization_id,
        legal_name,
        display_name,
        jurisdiction_code,
        legal_identifier_hash,
        legal_identifier_last4,
        website,
        reporting_currency,
        created_by
      ) values (
        session_row.organization_id,
        coalesce(normalized_legal_name, normalized_name),
        normalized_name,
        'BR',
        p_identifier_hash,
        nullif(p_identifier_last4, ''),
        normalized_website,
        'BRL',
        caller_id
      ) returning id into company_id;
    end if;
  end if;

  update public.onboarding_progress progress
  set current_step = 'documents',
      answers = coalesce(progress.answers, '{}'::jsonb)
        || jsonb_build_object(
          'company_id', company_id,
          'guided_milestone', 'operation',
          'company_profile', jsonb_build_object(
            'name', normalized_name,
            'legal_name', normalized_legal_name,
            'website', normalized_website,
            'description', normalized_description,
            'identifier_last4', nullif(p_identifier_last4, '')
          )
        ),
      updated_at = now()
  where progress.organization_id = session_row.organization_id
    and progress.user_id = caller_id
    and progress.journey = session_row.journey;
end;
$$;

comment on function private.save_guided_company_profile(uuid, text, text, text, text, bytea, text) is
  'Saves the company introduction for an authenticated collecting intake session.';
