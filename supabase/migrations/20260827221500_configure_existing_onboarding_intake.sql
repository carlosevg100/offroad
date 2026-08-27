-- Project setup is create-or-configure. Editing a project must never cancel the active intake.

create or replace function private.start_onboarding_intake(
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
  progress_row public.onboarding_progress;
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

  select progress.* into progress_row
  from public.onboarding_progress progress
  join public.organization_memberships membership
    on membership.organization_id = progress.organization_id
   and membership.user_id = progress.user_id
  join public.organizations organization
    on organization.id = progress.organization_id
  where progress.user_id = caller_id
    and progress.completed_at is null
    and progress.journey in ('company', 'originator')
    and membership.status = 'active'
    and organization.organization_type in ('company', 'originator')
  order by progress.updated_at desc
  limit 1
  for update of progress;
  if not found then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document on document.id = acceptance.legal_document_id
    where acceptance.organization_id = progress_row.organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and document.status = 'active'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
  ) then
    raise exception 'private_workspace_terms_required' using errcode = '42501';
  end if;

  target_representation_kind := case progress_row.journey when 'originator' then 'advisor' else 'company' end;

  if coalesce(progress_row.answers ->> 'intake_session_id', '') <> '' then
    select session.id into session_id
    from public.document_intake_sessions session
    where session.organization_id = progress_row.organization_id
      and session.id = (progress_row.answers ->> 'intake_session_id')::uuid
      and session.started_by = caller_id
      and session.status not in ('cancelled', 'confirmed')
    limit 1
    for update;
  end if;

  if session_id is null then
    insert into public.document_intake_sessions (
      organization_id, started_by, journey, locale, project_name, identity_policy,
      privacy_status, representation_kind, representation_status
    ) values (
      progress_row.organization_id, caller_id, progress_row.journey, p_locale,
      normalized_project_name, p_identity_policy, 'private', target_representation_kind, 'declared'
    ) returning id into session_id;
  else
    update public.document_intake_sessions session
    set project_name = normalized_project_name,
        identity_policy = p_identity_policy,
        representation_kind = target_representation_kind,
        updated_at = now()
    where session.organization_id = progress_row.organization_id
      and session.id = session_id;
  end if;

  insert into public.project_representation_evidence (
    organization_id, intake_session_id, representation_kind, evidence_type,
    statement, status, submitted_by
  )
  select
    progress_row.organization_id, session_id, target_representation_kind, 'self_declaration',
    case target_representation_kind
      when 'advisor' then 'The user declares that they are authorized to prepare this project on behalf of the company.'
      else 'The user declares that they represent the company and are authorized to prepare this project.'
    end,
    'declared', caller_id
  where not exists (
    select 1
    from public.project_representation_evidence evidence
    where evidence.organization_id = progress_row.organization_id
      and evidence.intake_session_id = session_id
      and evidence.submitted_by = caller_id
      and evidence.evidence_type = 'self_declaration'
      and evidence.status <> 'revoked'
  );

  update public.onboarding_progress progress
  set current_step = 'organization',
      answers = coalesce(progress.answers, '{}'::jsonb)
        || jsonb_build_object(
          'intake_mode', 'documents',
          'intake_session_id', session_id,
          'guided_milestone', coalesce(progress.answers ->> 'guided_milestone', 'company'),
          'project_name', normalized_project_name,
          'identity_policy', p_identity_policy
        ),
      updated_at = now()
  where progress.organization_id = progress_row.organization_id
    and progress.user_id = caller_id
    and progress.journey = progress_row.journey;

  return session_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$$;

comment on function public.start_onboarding_intake(text, text, text, boolean) is
  'Creates or configures the caller private onboarding intake after current legal acceptance. Repeated calls update the same open session and never cancel it.';
