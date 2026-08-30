-- The project navigator is a real workspace surface. Projects can be renamed or removed from
-- the visible workspace without destroying evidence, legal acceptances, audit history or files.

alter table public.document_intake_sessions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id);

drop index if exists public.document_intake_sessions_open_project_name_idx;
create unique index document_intake_sessions_open_project_name_idx
  on public.document_intake_sessions (organization_id, lower(project_name))
  where project_name is not null
    and archived_at is null
    and status <> 'cancelled';

create index document_intake_sessions_org_visible_updated_idx
  on public.document_intake_sessions (organization_id, updated_at desc)
  where archived_at is null;

create or replace function private.manage_workspace_project(
  p_session_id uuid,
  p_action text,
  p_project_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  target_organization_id uuid;
  session_row public.document_intake_sessions;
  normalized_project_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_session_id is null or p_action not in ('rename', 'archive') then
    raise exception 'invalid_project_action' using errcode = '22023';
  end if;

  select membership.organization_id, membership.role
  into target_organization_id, caller_role
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

  select session.*
  into session_row
  from public.document_intake_sessions session
  where session.organization_id = target_organization_id
    and session.id = p_session_id
  for update;

  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if p_action = 'rename' then
    if session_row.archived_at is not null then
      raise exception 'project_archived' using errcode = '55000';
    end if;
    if char_length(normalized_project_name) not between 2 and 80 then
      raise exception 'invalid_project_name' using errcode = '22023';
    end if;

    update public.document_intake_sessions session
    set project_name = normalized_project_name,
        updated_at = now()
    where session.organization_id = target_organization_id
      and session.id = p_session_id;

    if session_row.opportunity_id is not null then
      update public.opportunities opportunity
      set title = normalized_project_name,
          updated_at = now()
      where opportunity.organization_id = target_organization_id
        and opportunity.id = session_row.opportunity_id;
    end if;

    return jsonb_build_object('action', 'renamed', 'project_name', normalized_project_name);
  end if;

  if caller_role not in ('owner', 'admin') and session_row.started_by <> caller_id then
    raise exception 'project_archive_denied' using errcode = '42501';
  end if;
  if session_row.archived_at is not null then
    return jsonb_build_object('action', 'archived');
  end if;

  update public.document_intake_sessions session
  set status = case when session.status = 'confirmed' then session.status else 'cancelled' end,
      archived_at = now(),
      archived_by = caller_id,
      updated_at = now()
  where session.organization_id = target_organization_id
    and session.id = p_session_id;

  return jsonb_build_object('action', 'archived');
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$$;

create or replace function public.manage_workspace_project(
  p_session_id uuid,
  p_action text,
  p_project_name text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.manage_workspace_project(p_session_id, p_action, p_project_name);
$$;

revoke all on function private.manage_workspace_project(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.manage_workspace_project(uuid, text, text)
  from public, anon, authenticated;
grant execute on function private.manage_workspace_project(uuid, text, text) to authenticated;
grant execute on function public.manage_workspace_project(uuid, text, text) to authenticated;

comment on column public.document_intake_sessions.archived_at is
  'When the project left the visible workspace without erasing its evidence or audit history.';
comment on column public.document_intake_sessions.archived_by is
  'Authenticated workspace user who removed the project from the visible workspace.';
comment on function public.manage_workspace_project(uuid, text, text) is
  'Renames or recoverably archives one project after organization and action-level authorization.';

-- The older setup editor remains available, but must not edit a project removed from the workspace.
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
    and session.archived_at is null
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
