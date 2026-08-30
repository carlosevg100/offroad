-- A later financing starts with the same legal and project-identity gates as the first one.
-- Keep the setup read to one authenticated round trip and make project edits reversible.

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

  select membership.organization_id
  into target_organization_id
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id
  where membership.user_id = caller_id
    and membership.status = 'active'
    and organization.organization_type in ('company', 'originator')
  order by membership.created_at asc
  limit 1;

  if not found then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;

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

create or replace function public.get_workspace_project_setup(p_locale text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.get_workspace_project_setup(p_locale);
$$;

revoke all on function private.get_workspace_project_setup(text) from public, anon, authenticated;
revoke all on function public.get_workspace_project_setup(text) from public, anon, authenticated;
grant execute on function private.get_workspace_project_setup(text) to authenticated;
grant execute on function public.get_workspace_project_setup(text) to authenticated;

comment on function public.get_workspace_project_setup(text) is
  'Returns the current legal gate and signatory profile for a later private financing in one call.';

create or replace function private.update_workspace_project(
  p_session_id uuid,
  p_project_name text,
  p_identity_policy text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
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

  select membership.organization_id
  into target_organization_id
  from public.organization_memberships membership
  join public.organizations organization on organization.id = membership.organization_id
  where membership.user_id = caller_id
    and membership.status = 'active'
    and organization.organization_type in ('company', 'originator')
  order by membership.created_at asc
  limit 1;

  if not found then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;

  update public.document_intake_sessions session
  set project_name = normalized_project_name,
      identity_policy = p_identity_policy,
      updated_at = now()
  where session.organization_id = target_organization_id
    and session.id = p_session_id
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

create or replace function public.update_workspace_project(
  p_session_id uuid,
  p_project_name text,
  p_identity_policy text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.update_workspace_project(p_session_id, p_project_name, p_identity_policy);
$$;

revoke all on function private.update_workspace_project(uuid, text, text) from public, anon, authenticated;
revoke all on function public.update_workspace_project(uuid, text, text) from public, anon, authenticated;
grant execute on function private.update_workspace_project(uuid, text, text) to authenticated;
grant execute on function public.update_workspace_project(uuid, text, text) to authenticated;

comment on function public.update_workspace_project(uuid, text, text) is
  'Edits the name and future identity policy of an open project without changing its lifecycle or documents.';
