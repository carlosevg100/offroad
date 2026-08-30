-- Entering the workspace is a lightweight, deterministic operation.
-- Project processing is deliberately not part of this contract.

create or replace function private.start_onboarding_project(
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
  session_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  -- Reuse the canonical transactional project setup (including legal-acceptance
  -- and representation checks), then close account onboarding immediately.
  -- Reading or analysing documents belongs to the project, not account setup.
  session_id := private.start_onboarding_intake(
    p_locale,
    p_project_name,
    p_identity_policy,
    p_representation_declared
  );

  update public.onboarding_progress progress
  set completed_at = coalesce(progress.completed_at, now()),
      updated_at = now()
  where progress.user_id = caller_id
    and progress.journey in ('company', 'originator')
    and progress.answers ->> 'intake_session_id' = session_id::text;

  if not found then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;

  return session_id;
end;
$$;

create or replace function public.start_onboarding_project(
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
  select private.start_onboarding_project(
    p_locale,
    p_project_name,
    p_identity_policy,
    p_representation_declared
  );
$$;

revoke all on function private.start_onboarding_project(text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.start_onboarding_project(text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function private.start_onboarding_project(text, text, text, boolean) to authenticated;
grant execute on function public.start_onboarding_project(text, text, text, boolean) to authenticated;

comment on function public.start_onboarding_project(text, text, text, boolean) is
  'Atomically creates the first private project and releases the user into the workspace.';

create or replace function private.start_workspace_project(
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
  target_organization_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
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
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;

  return private.start_workspace_intake(
    target_organization_id,
    p_locale,
    p_project_name,
    p_identity_policy,
    p_representation_declared
  );
end;
$$;

create or replace function public.start_workspace_project(
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
  select private.start_workspace_project(
    p_locale,
    p_project_name,
    p_identity_policy,
    p_representation_declared
  );
$$;

revoke all on function private.start_workspace_project(text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.start_workspace_project(text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function private.start_workspace_project(text, text, text, boolean) to authenticated;
grant execute on function public.start_workspace_project(text, text, text, boolean) to authenticated;

comment on function public.start_workspace_project(text, text, text, boolean) is
  'Creates a later private project for the caller active workspace in one round trip.';

-- Users who already accepted the current terms and created a private project
-- were incorrectly left in account onboarding until document confirmation.
-- Repair that state without touching capital-provider onboarding.
update public.onboarding_progress progress
set completed_at = coalesce(progress.completed_at, now()),
    updated_at = now()
where progress.completed_at is null
  and progress.journey in ('company', 'originator')
  and exists (
    select 1
    from public.document_intake_sessions session
    where session.organization_id = progress.organization_id
      and session.started_by = progress.user_id
      and session.id::text = progress.answers ->> 'intake_session_id'
      and session.status <> 'cancelled'
  )
  and exists (
    select 1
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document
      on document.id = acceptance.legal_document_id
    where acceptance.organization_id = progress.organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
      and document.status = 'active'
  );

create or replace function private.get_workspace_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  membership_record public.organization_memberships;
  organization_record public.organizations;
  progress_record public.onboarding_progress;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select membership.*
  into membership_record
  from public.organization_memberships membership
  where membership.user_id = caller_id
    and membership.status = 'active'
  order by membership.created_at asc
  limit 1;

  if not found then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;

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

create or replace function public.get_workspace_bootstrap()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_workspace_bootstrap();
$$;

revoke all on function private.get_workspace_bootstrap() from public, anon, authenticated;
revoke all on function public.get_workspace_bootstrap() from public, anon, authenticated;
grant execute on function private.get_workspace_bootstrap() to authenticated;
grant execute on function public.get_workspace_bootstrap() to authenticated;

comment on function public.get_workspace_bootstrap() is
  'Returns the authenticated workspace authorization and shell snapshot in one round trip.';
