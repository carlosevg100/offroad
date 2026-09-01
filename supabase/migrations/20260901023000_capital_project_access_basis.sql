-- Public origination work and authorized private work are different trust states of the same
-- capital project. A project may be promoted from public information to authorized private data,
-- but never downgraded implicitly. Distribution remains governed by its separate exact-release
-- authorization and is not granted here.

alter table public.capital_projects
  add column access_basis text not null default 'authorized_private'
    check (access_basis in ('public_information', 'authorized_private')),
  add column private_access_granted_at timestamptz,
  add column private_access_granted_by uuid references auth.users(id) on delete restrict,
  add constraint capital_projects_private_access_check check (
    (access_basis = 'authorized_private'
      and private_access_granted_at is not null
      and private_access_granted_by is not null)
    or (access_basis = 'public_information'
      and private_access_granted_at is null
      and private_access_granted_by is null)
  ) not valid;

update public.capital_projects project
set private_access_granted_at = project.created_at,
    private_access_granted_by = project.created_by
where project.access_basis = 'authorized_private';

alter table public.capital_projects
  validate constraint capital_projects_private_access_check;

create index capital_projects_private_access_granted_by_idx
  on public.capital_projects (private_access_granted_by)
  where private_access_granted_by is not null;

create or replace function private.normalize_capital_project_access_basis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.access_basis = 'authorized_private' then
    new.private_access_granted_at := coalesce(new.private_access_granted_at, now());
    new.private_access_granted_by := coalesce(new.private_access_granted_by, new.created_by);
  else
    new.private_access_granted_at := null;
    new.private_access_granted_by := null;
  end if;
  return new;
end;
$$;

revoke all on function private.normalize_capital_project_access_basis()
  from public, anon, authenticated;

create trigger capital_projects_normalize_access_basis
  before insert or update of access_basis, private_access_granted_at, private_access_granted_by
  on public.capital_projects
  for each row execute function private.normalize_capital_project_access_basis();

alter table public.document_intake_sessions
  drop constraint document_intake_sessions_privacy_status_check,
  add constraint document_intake_sessions_privacy_status_check
    check (privacy_status in ('public_information', 'private', 'distribution_authorized')),
  drop constraint document_intake_sessions_representation_status_check,
  add constraint document_intake_sessions_representation_status_check
    check (representation_status in (
      'not_claimed', 'declared', 'documented', 'verified', 'rejected', 'revoked'
    ));

create or replace function private.start_public_capital_project(
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_company_name text,
  p_company_website text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  organization_type text;
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

  select organization.id, organization.organization_type
  into target_organization_id, organization_type
  from public.organizations organization
  join public.organization_memberships membership
    on membership.organization_id = organization.id
  where membership.user_id = caller_id
    and membership.status = 'active'
    and organization.organization_type in ('company', 'originator')
  order by membership.created_at asc
  limit 1;
  if not found then
    raise exception 'workspace_membership_not_found' using errcode = 'P0002';
  end if;

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
    target_organization_id, project_id, caller_id, organization_type, p_locale,
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

create or replace function public.start_public_capital_project(
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_company_name text,
  p_company_website text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.start_public_capital_project(
    p_locale, p_project_name, p_entry_job, p_company_name, p_company_website
  );
$$;

revoke all on function private.start_public_capital_project(text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.start_public_capital_project(text, text, text, text, text)
  from public, anon;
grant execute on function private.start_public_capital_project(text, text, text, text, text)
  to authenticated;
grant execute on function public.start_public_capital_project(text, text, text, text, text)
  to authenticated;

create or replace function private.start_public_onboarding_capital_project(
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_company_name text,
  p_company_website text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  session_id uuid;
  target_organization_id uuid;
begin
  session_id := private.start_public_capital_project(
    p_locale, p_project_name, p_entry_job, p_company_name, p_company_website
  );
  select session.organization_id into target_organization_id
  from public.document_intake_sessions session
  where session.id = session_id;

  update public.onboarding_progress progress
  set completed_at = coalesce(progress.completed_at, now()),
      answers = coalesce(progress.answers, '{}'::jsonb) || jsonb_build_object(
        'intake_session_id', session_id::text,
        'project_name', p_project_name,
        'entry_job', p_entry_job
      ),
      updated_at = now()
  where progress.user_id = caller_id
    and progress.organization_id = target_organization_id
    and progress.journey in ('company', 'originator');
  if not found then
    raise exception 'onboarding_progress_not_found' using errcode = 'P0002';
  end if;

  return session_id;
end;
$$;

create or replace function public.start_public_onboarding_capital_project(
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_company_name text,
  p_company_website text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.start_public_onboarding_capital_project(
    p_locale, p_project_name, p_entry_job, p_company_name, p_company_website
  );
$$;

revoke all on function private.start_public_onboarding_capital_project(text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.start_public_onboarding_capital_project(text, text, text, text, text)
  from public, anon;
grant execute on function private.start_public_onboarding_capital_project(text, text, text, text, text)
  to authenticated;
grant execute on function public.start_public_onboarding_capital_project(text, text, text, text, text)
  to authenticated;

create or replace function private.authorize_capital_project_private_work(
  p_project_id uuid,
  p_information_rights_declared boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  project_row public.capital_projects;
  organization_type text;
  target_representation_kind text;
begin
  if caller_id is null or not coalesce(p_information_rights_declared, false) then
    raise exception 'private_work_authorization_required' using errcode = '42501';
  end if;

  select project.* into project_row
  from public.capital_projects project
  join public.organization_memberships membership
    on membership.organization_id = project.organization_id
  where project.id = p_project_id
    and membership.user_id = caller_id
    and membership.status = 'active'
    and project.status <> 'archived'
  for update of project;
  if not found then
    raise exception 'capital_project_not_found' using errcode = 'P0002';
  end if;
  if project_row.access_basis = 'authorized_private' then return project_row.id; end if;

  if not exists (
    select 1
    from public.organization_legal_acceptances acceptance
    join public.platform_legal_documents document on document.id = acceptance.legal_document_id
    where acceptance.organization_id = project_row.organization_id
      and acceptance.document_key = 'private_workspace_terms'
      and acceptance.document_version = document.version
      and acceptance.document_hash = document.document_hash
      and document.status = 'active'
  ) then
    raise exception 'private_workspace_terms_required' using errcode = '42501';
  end if;

  select organization.organization_type into organization_type
  from public.organizations organization
  where organization.id = project_row.organization_id;
  target_representation_kind := case organization_type when 'originator' then 'advisor' else 'company' end;

  update public.capital_projects project
  set access_basis = 'authorized_private',
      private_access_granted_at = now(),
      private_access_granted_by = caller_id,
      updated_at = now()
  where project.id = project_row.id;

  update public.document_intake_sessions session
  set privacy_status = 'private',
      representation_kind = target_representation_kind,
      representation_status = 'declared',
      updated_at = now()
  where session.organization_id = project_row.organization_id
    and session.capital_project_id = project_row.id;

  insert into public.project_representation_evidence (
    organization_id, intake_session_id, representation_kind, evidence_type,
    statement, status, submitted_by
  )
  select
    session.organization_id, session.id, target_representation_kind, 'self_declaration',
    case target_representation_kind
      when 'advisor' then 'The user declares rights to use the private information for project preparation; authority is verified before any market contact.'
      else 'The user declares rights to use the private information for project preparation; authority is verified before any market contact.'
    end,
    'declared', caller_id
  from public.document_intake_sessions session
  where session.organization_id = project_row.organization_id
    and session.capital_project_id = project_row.id
    and not exists (
      select 1 from public.project_representation_evidence evidence
      where evidence.organization_id = session.organization_id
        and evidence.intake_session_id = session.id
        and evidence.evidence_type = 'self_declaration'
    );

  return project_row.id;
end;
$$;

create or replace function public.authorize_capital_project_private_work(
  p_project_id uuid,
  p_information_rights_declared boolean
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.authorize_capital_project_private_work(
    p_project_id, p_information_rights_declared
  );
$$;

revoke all on function private.authorize_capital_project_private_work(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.authorize_capital_project_private_work(uuid, boolean)
  from public, anon;
grant execute on function private.authorize_capital_project_private_work(uuid, boolean)
  to authenticated;
grant execute on function public.authorize_capital_project_private_work(uuid, boolean)
  to authenticated;

create or replace function private.require_authorized_private_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Administrative migrations and trusted repair jobs have no end-user JWT. Browser-originated
  -- files always carry auth.uid() through the security-definer registration command.
  if (select auth.uid()) is not null and exists (
    select 1
    from public.document_intake_sessions session
    join public.capital_projects project
      on project.organization_id = session.organization_id
      and project.id = session.capital_project_id
    where session.organization_id = new.organization_id
      and session.id = new.intake_session_id
      and project.access_basis <> 'authorized_private'
  ) then
    raise exception 'authorized_private_access_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.require_authorized_private_document()
  from public, anon, authenticated;

create trigger source_documents_require_authorized_private_access
  before insert on public.source_documents
  for each row execute function private.require_authorized_private_document();

comment on column public.capital_projects.access_basis is
  'Public-information projects can research and form a thesis without representing the company. Authorized-private projects may receive user-supplied confidential documents after the legal gate.';
comment on function public.start_public_capital_project(text, text, text, text, text) is
  'Starts a public-information company debt, origination or capital-planning project without implying representation or private-information rights.';
comment on function public.authorize_capital_project_private_work(uuid, boolean) is
  'One-way promotion from public information to authorized private preparation; it never authorizes distribution.';
