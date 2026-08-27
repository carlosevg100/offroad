-- Every later financing uses the same private-project contract as onboarding. Session creation and
-- the self-declaration evidence are one transaction; the browser never assembles partial state.

create function private.start_workspace_intake(
  p_organization_id uuid,
  p_locale text,
  p_project_name text,
  p_identity_policy text,
  p_representation_declared boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  organization_type text;
  session_id uuid;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  target_representation_kind text;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_locale not in ('pt-BR', 'en-US')
    or char_length(normalized_project_name) not between 2 and 80
    or p_identity_policy not in ('identified_restricted', 'blind_initial')
    or not coalesce(p_representation_declared, false) then
    raise exception 'invalid_private_project_setup' using errcode = '22023';
  end if;

  select organization.organization_type into organization_type
  from public.organizations organization
  join public.organization_memberships membership
    on membership.organization_id = organization.id
   and membership.user_id = caller_id
   and membership.status = 'active'
  where organization.id = p_organization_id
    and organization.organization_type in ('company', 'originator')
  limit 1;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document on document.id = acceptance.legal_document_id
    where acceptance.organization_id = p_organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and document.status = 'active'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
  ) then
    raise exception 'private_workspace_terms_required' using errcode = '42501';
  end if;

  target_representation_kind := case organization_type when 'originator' then 'advisor' else 'company' end;

  insert into public.document_intake_sessions (
    organization_id, started_by, journey, locale, project_name, identity_policy,
    privacy_status, representation_kind, representation_status
  ) values (
    p_organization_id, caller_id, organization_type, p_locale, normalized_project_name,
    p_identity_policy, 'private', target_representation_kind, 'declared'
  ) returning id into session_id;

  insert into public.project_representation_evidence (
    organization_id, intake_session_id, representation_kind, evidence_type,
    statement, status, submitted_by
  ) values (
    p_organization_id, session_id, target_representation_kind, 'self_declaration',
    case target_representation_kind
      when 'advisor' then 'The user declares that they are authorized to prepare this project on behalf of the company.'
      else 'The user declares that they represent the company and are authorized to prepare this project.'
    end,
    'declared', caller_id
  );

  return session_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$$;

create function public.start_workspace_intake(
  p_organization_id uuid,
  p_locale text,
  p_project_name text,
  p_identity_policy text,
  p_representation_declared boolean
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.start_workspace_intake(
    p_organization_id,
    p_locale,
    p_project_name,
    p_identity_policy,
    p_representation_declared
  );
$$;

revoke all on function private.start_workspace_intake(uuid, text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.start_workspace_intake(uuid, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function private.start_workspace_intake(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.start_workspace_intake(uuid, text, text, text, boolean) to authenticated;

comment on function public.start_workspace_intake(uuid, text, text, text, boolean) is
  'Atomically starts a named private financing and records the caller representation declaration.';
