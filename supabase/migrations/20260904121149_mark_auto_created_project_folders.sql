-- A trigger creates one folder per capital project, named after it, so the workspace
-- rail listed a folder holding a single conversation of the same name for every project.
-- Presentation cannot tell those apart from folders a person made: matching on the name
-- breaks the moment either side is renamed, and matching on the child count would hide a
-- real folder that happens to hold one conversation.
--
-- The distinction is data, so it is recorded as data. Both function bodies below are the
-- ones already in `20260902175803`, changed only where the flag is written.

alter table public.workspace_project_groups
  add column if not exists auto_created boolean not null default false;

comment on column public.workspace_project_groups.auto_created is
  'True when the folder was created by the capital-project trigger rather than by a person. '
  'Renaming clears it. The workspace rail lists the conversations of a marked folder flat, '
  'instead of nesting them under a name that only repeats the conversation.';

-- Existing rows: a folder holding exactly one project of the same name is one the trigger
-- made. Everything else stays a deliberate folder.
update public.workspace_project_groups project_group
set auto_created = true
where project_group.auto_created = false
  and (
    select count(*)
    from public.capital_projects project
    where project.organization_id = project_group.organization_id
      and project.workspace_group_id = project_group.id
  ) = 1
  and exists (
    select 1
    from public.capital_projects project
    where project.organization_id = project_group.organization_id
      and project.workspace_group_id = project_group.id
      and lower(trim(project.project_name)) = lower(trim(project_group.name))
  );

create or replace function private.bind_workspace_group_after_capital_project_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_id uuid;
begin
  if new.workspace_group_id is not null then return new; end if;

  select project_group.id into group_id
  from public.workspace_project_groups project_group
  where project_group.organization_id = new.organization_id
    and project_group.archived_at is null
    and lower(project_group.name) = lower(trim(new.project_name))
  order by project_group.created_at asc
  limit 1;

  if group_id is null then
    begin
      insert into public.workspace_project_groups (organization_id, name, created_by, auto_created)
      values (new.organization_id, trim(new.project_name), new.created_by, true)
      returning id into group_id;
    exception
      when unique_violation then
        select project_group.id into group_id
        from public.workspace_project_groups project_group
        where project_group.organization_id = new.organization_id
          and project_group.archived_at is null
          and lower(project_group.name) = lower(trim(new.project_name))
        order by project_group.created_at asc
        limit 1;
    end;
  end if;

  if group_id is null then
    raise exception 'workspace_project_group_create_failed';
  end if;
  update public.capital_projects project
  set workspace_group_id = group_id
  where project.organization_id = new.organization_id and project.id = new.id;
  new.workspace_group_id := group_id;
  return new;
end;
$$;

revoke all on function private.bind_workspace_group_after_capital_project_insert() from public;
