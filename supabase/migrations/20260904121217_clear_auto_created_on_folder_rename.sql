-- Naming a folder is the act that makes it the person's own, so renaming one clears the
-- flag the trigger set and it behaves like any other folder from then on. The body below
-- is the one already in `20260902175803`, changed only on that line.

create or replace function private.manage_workspace_project_group(
  p_group_id uuid,
  p_action text,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_role text;
  group_row public.workspace_project_groups;
  normalized_name text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_group_id is null or p_action not in ('rename', 'archive') then
    raise exception 'invalid_project_action' using errcode = '22023';
  end if;

  select project_group.*
  into group_row
  from public.workspace_project_groups project_group
  join public.organization_memberships membership
    on membership.organization_id = project_group.organization_id
  where project_group.id = p_group_id
    and membership.user_id = caller_id
    and membership.status = 'active'
  for update of project_group;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  select membership.role into caller_role
  from public.organization_memberships membership
  where membership.organization_id = group_row.organization_id
    and membership.user_id = caller_id
    and membership.status = 'active';

  if p_action = 'rename' then
    if group_row.archived_at is not null then
      raise exception 'project_archived' using errcode = '55000';
    end if;
    if char_length(normalized_name) not between 2 and 80 then
      raise exception 'invalid_project_name' using errcode = '22023';
    end if;
    -- Naming a folder is the act that makes it the person's own, so it stops
    -- being treated as one the trigger produced.
    update public.workspace_project_groups project_group
    set name = normalized_name, auto_created = false
    where project_group.organization_id = group_row.organization_id
      and project_group.id = group_row.id;
    return jsonb_build_object('action', 'renamed', 'name', normalized_name);
  end if;

  if caller_role not in ('owner', 'admin') and group_row.created_by <> caller_id then
    raise exception 'project_archive_denied' using errcode = '42501';
  end if;
  if group_row.archived_at is not null then
    return jsonb_build_object('action', 'archived');
  end if;

  update public.workspace_project_groups project_group
  set archived_at = now(), archived_by = caller_id
  where project_group.organization_id = group_row.organization_id
    and project_group.id = group_row.id;

  update public.capital_projects project
  set status = 'archived', archived_at = now(), archived_by = caller_id
  where project.organization_id = group_row.organization_id
    and project.workspace_group_id = group_row.id
    and project.status <> 'archived';

  update public.document_intake_sessions session
  set status = case when session.status = 'confirmed' then session.status else 'cancelled' end,
      archived_at = now(), archived_by = caller_id, updated_at = now()
  where session.organization_id = group_row.organization_id
    and session.capital_project_id in (
      select project.id from public.capital_projects project
      where project.organization_id = group_row.organization_id
        and project.workspace_group_id = group_row.id
    )
    and session.archived_at is null;

  return jsonb_build_object('action', 'archived');
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$$;

revoke all on function private.bind_workspace_group_after_capital_project_insert() from public;
revoke all on function private.manage_workspace_project_group(uuid, text, text) from public;
grant execute on function private.manage_workspace_project_group(uuid, text, text) to authenticated;
