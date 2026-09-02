-- A workspace project is the durable subject (a company, mandate or financing theme).
-- Capital projects remain bounded conversations/workstreams inside that subject. This adds the
-- missing Codex-style hierarchy without merging transcripts or leaking context across tenants.

create table public.workspace_project_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  created_by uuid not null references auth.users(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null)
  )
);

create unique index workspace_project_groups_open_name_idx
  on public.workspace_project_groups (organization_id, lower(name))
  where archived_at is null;

create index workspace_project_groups_org_updated_idx
  on public.workspace_project_groups (organization_id, updated_at desc)
  where archived_at is null;

alter table public.workspace_project_groups enable row level security;
alter table public.workspace_project_groups force row level security;

create or replace function private.can_access_workspace_project_group(
  p_organization_id uuid,
  p_group_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.workspace_project_groups project_group
      join public.organization_memberships membership
        on membership.organization_id = project_group.organization_id
      where project_group.organization_id = p_organization_id
        and project_group.id = p_group_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    );
$$;

revoke all on function private.can_access_workspace_project_group(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_access_workspace_project_group(uuid, uuid)
  to authenticated;

create policy workspace_project_groups_select
  on public.workspace_project_groups for select to authenticated
  using ((select private.can_access_workspace_project_group(organization_id, id)));

revoke all privileges on public.workspace_project_groups from public, anon, authenticated;
grant select on public.workspace_project_groups to authenticated;

create trigger workspace_project_groups_set_updated_at
  before update on public.workspace_project_groups
  for each row execute function private.set_updated_at();

create trigger workspace_project_groups_audit
  after insert or update or delete on public.workspace_project_groups
  for each row execute function private.capture_audit_event();

alter table public.capital_projects
  add column workspace_group_id uuid,
  add constraint capital_projects_organization_workspace_group_fkey
    foreign key (organization_id, workspace_group_id)
    references public.workspace_project_groups(organization_id, id) on delete restrict;

do $$
declare
  project_row record;
  group_id uuid;
  candidate_name text;
begin
  for project_row in
    select project.id, project.organization_id, project.project_name, project.created_by,
           project.archived_at, project.archived_by, project.updated_at
    from public.capital_projects project
    where project.workspace_group_id is null
    order by project.created_at, project.id
  loop
    candidate_name := trim(project_row.project_name);
    if exists (
      select 1 from public.workspace_project_groups existing_group
      where existing_group.organization_id = project_row.organization_id
        and existing_group.archived_at is null
        and lower(existing_group.name) = lower(candidate_name)
    ) then
      candidate_name := left(candidate_name, 69) || ' · ' || left(project_row.id::text, 8);
    end if;

    insert into public.workspace_project_groups (
      organization_id, name, created_by, archived_at, archived_by, updated_at
    ) values (
      project_row.organization_id,
      candidate_name,
      project_row.created_by,
      project_row.archived_at,
      project_row.archived_by,
      project_row.updated_at
    )
    returning id into group_id;

    update public.capital_projects project
    set workspace_group_id = group_id
    where project.organization_id = project_row.organization_id
      and project.id = project_row.id;
  end loop;
end;
$$;

create index capital_projects_workspace_group_idx
  on public.capital_projects (organization_id, workspace_group_id, updated_at desc)
  where workspace_group_id is not null;

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
      insert into public.workspace_project_groups (organization_id, name, created_by)
      values (new.organization_id, trim(new.project_name), new.created_by)
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

revoke all on function private.bind_workspace_group_after_capital_project_insert()
  from public, anon, authenticated;

create trigger capital_projects_bind_workspace_group
  after insert on public.capital_projects
  for each row execute function private.bind_workspace_group_after_capital_project_insert();

create or replace function private.create_workspace_project_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  normalized_name text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  group_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if char_length(normalized_name) not between 2 and 80 then
    raise exception 'invalid_project_name' using errcode = '22023';
  end if;

  select organization.id into target_organization_id
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

  insert into public.workspace_project_groups (organization_id, name, created_by)
  values (target_organization_id, normalized_name, caller_id)
  returning id into group_id;
  return group_id;
exception
  when unique_violation then
    raise exception 'project_name_already_in_use' using errcode = '23505';
end;
$$;

create or replace function public.create_workspace_project_group(p_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.create_workspace_project_group(p_name); $$;

revoke all on function private.create_workspace_project_group(text) from public, anon, authenticated;
revoke all on function public.create_workspace_project_group(text) from public, anon;
grant execute on function private.create_workspace_project_group(text) to authenticated;
grant execute on function public.create_workspace_project_group(text) to authenticated;

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
    update public.workspace_project_groups project_group
    set name = normalized_name
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

create or replace function public.manage_workspace_project_group(
  p_group_id uuid,
  p_action text,
  p_name text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.manage_workspace_project_group(p_group_id, p_action, p_name); $$;

revoke all on function private.manage_workspace_project_group(uuid, text, text) from public, anon, authenticated;
revoke all on function public.manage_workspace_project_group(uuid, text, text) from public, anon;
grant execute on function private.manage_workspace_project_group(uuid, text, text) to authenticated;
grant execute on function public.manage_workspace_project_group(uuid, text, text) to authenticated;

create or replace function private.start_advisor_project_in_group_v1(
  p_request_id uuid,
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_prompt text,
  p_access_basis text,
  p_plan jsonb,
  p_group_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  result jsonb;
  project_id uuid;
  target_group_id uuid := p_group_id;
  project_row public.capital_projects;
  generated_group_id uuid;
begin
  result := public.start_advisor_project_v1(
    p_request_id, p_locale, p_project_name, p_entry_job,
    p_prompt, p_access_basis, p_plan
  );
  project_id := (result ->> 'capital_project_id')::uuid;

  select project.* into project_row
  from public.capital_projects project
  where project.id = project_id
    and exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id = project.organization_id
        and membership.user_id = caller_id
        and membership.status = 'active'
    )
  for update;
  if not found then
    raise exception 'capital_project_not_found' using errcode = 'P0002';
  end if;

  generated_group_id := project_row.workspace_group_id;
  if target_group_id is null and generated_group_id is not null then
    target_group_id := generated_group_id;
  elsif target_group_id is null then
    insert into public.workspace_project_groups (organization_id, name, created_by)
    values (project_row.organization_id, project_row.project_name, caller_id)
    returning id into target_group_id;
  elsif not exists (
    select 1 from public.workspace_project_groups project_group
    where project_group.organization_id = project_row.organization_id
      and project_group.id = target_group_id
      and project_group.archived_at is null
  ) then
    raise exception 'workspace_project_group_not_found' using errcode = 'P0002';
  end if;

  update public.capital_projects project
  set workspace_group_id = target_group_id
  where project.organization_id = project_row.organization_id
    and project.id = project_row.id;

  if generated_group_id is not null and generated_group_id is distinct from target_group_id then
    update public.workspace_project_groups project_group
    set archived_at = now(), archived_by = caller_id
    where project_group.organization_id = project_row.organization_id
      and project_group.id = generated_group_id
      and not exists (
        select 1 from public.capital_projects sibling
        where sibling.organization_id = project_row.organization_id
          and sibling.workspace_group_id = generated_group_id
      );
  end if;

  return result || jsonb_build_object('workspace_group_id', target_group_id);
end;
$$;

create or replace function public.start_advisor_project_in_group_v1(
  p_request_id uuid,
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_prompt text,
  p_access_basis text,
  p_plan jsonb,
  p_group_id uuid default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.start_advisor_project_in_group_v1(
    p_request_id, p_locale, p_project_name, p_entry_job,
    p_prompt, p_access_basis, p_plan, p_group_id
  );
$$;

revoke all on function private.start_advisor_project_in_group_v1(uuid, text, text, text, text, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.start_advisor_project_in_group_v1(uuid, text, text, text, text, text, jsonb, uuid)
  from public, anon;
grant execute on function private.start_advisor_project_in_group_v1(uuid, text, text, text, text, text, jsonb, uuid)
  to authenticated;
grant execute on function public.start_advisor_project_in_group_v1(uuid, text, text, text, text, text, jsonb, uuid)
  to authenticated;

comment on table public.workspace_project_groups is
  'Tenant-scoped durable subjects that group multiple independent advisory conversations without merging their transcripts.';
comment on column public.capital_projects.workspace_group_id is
  'Optional parent subject for Codex-style project organization; each capital project remains one bounded conversation/workstream.';
