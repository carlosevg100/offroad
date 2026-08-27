-- Collapse the sequential onboarding shell reads into one authenticated database call.
-- This keeps authorization in Postgres while removing avoidable cross-region round trips.

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

  if progress_record.journey in ('company', 'originator') then
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

create or replace function public.get_onboarding_bootstrap(p_locale text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_onboarding_bootstrap(p_locale);
$$;

revoke all on function private.get_onboarding_bootstrap(text) from public, anon, authenticated;
revoke all on function public.get_onboarding_bootstrap(text) from public, anon, authenticated;
grant execute on function private.get_onboarding_bootstrap(text) to authenticated;
grant execute on function public.get_onboarding_bootstrap(text) to authenticated;

comment on function public.get_onboarding_bootstrap(text) is
  'Returns the authenticated user onboarding shell snapshot in one round trip.';
