-- The workspace rail lists conversations flat and folders only when a person made
-- one. That distinction is a column, not a heuristic, so this proves the column is
-- written where it should be and cleared where it should be. All fixtures roll back.

begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) values (
  '10000000-0000-4000-8000-000000000131',
  'authenticated', 'authenticated',
  'folder-owner@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(), false, false
);

insert into public.organizations (id, organization_type, name, created_by)
values (
  '20000000-0000-4000-8000-000000000131',
  'originator', 'Folder Workspace',
  '10000000-0000-4000-8000-000000000131'
);

insert into public.organization_memberships (organization_id, user_id, role, status, joined_at)
values (
  '20000000-0000-4000-8000-000000000131',
  '10000000-0000-4000-8000-000000000131',
  'owner', 'active', now()
);

do $$
declare
  organization_id constant uuid := '20000000-0000-4000-8000-000000000131';
  owner_id constant uuid := '10000000-0000-4000-8000-000000000131';
  project_id constant uuid := '30000000-0000-4000-8000-000000000131';
  trigger_group_id uuid;
  deliberate_group_id uuid;
  marked boolean;
begin
  -- A project the person starts produces a folder the trigger made. The trigger fires
  -- after insert, so the binding is read back rather than returned.
  insert into public.capital_projects (id, organization_id, project_name, entry_job, created_by)
  values (project_id, organization_id, 'Conversa criada pelo produto', 'origination_thesis', owner_id);

  select project.workspace_group_id into trigger_group_id
  from public.capital_projects project
  where project.id = project_id;

  if trigger_group_id is null then
    raise exception 'the trigger did not bind a folder to the project';
  end if;

  select project_group.auto_created into marked
  from public.workspace_project_groups project_group
  where project_group.id = trigger_group_id;
  if marked is distinct from true then
    raise exception 'a folder created by the trigger must be marked, got %', marked;
  end if;

  -- A folder a person creates is never marked, whatever it ends up holding.
  insert into public.workspace_project_groups (organization_id, name, created_by)
  values (organization_id, 'Pasta feita por uma pessoa', owner_id)
  returning id into deliberate_group_id;

  select project_group.auto_created into marked
  from public.workspace_project_groups project_group
  where project_group.id = deliberate_group_id;
  if marked is distinct from false then
    raise exception 'a folder created by a person must not be marked, got %', marked;
  end if;

  -- Naming a folder is the act that makes it the person's own, so it clears the mark.
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform private.manage_workspace_project_group(trigger_group_id, 'rename', 'Camil, preparação de reunião');

  select project_group.auto_created into marked
  from public.workspace_project_groups project_group
  where project_group.id = trigger_group_id;
  if marked is distinct from false then
    raise exception 'renaming a folder must clear the mark, got %', marked;
  end if;

  if not exists (
    select 1 from public.workspace_project_groups project_group
    where project_group.id = trigger_group_id
      and project_group.name = 'Camil, preparação de reunião'
  ) then
    raise exception 'the rename did not persist the new name';
  end if;
end;
$$;

rollback;

select 'workspace_project_folders_passed' as result;
