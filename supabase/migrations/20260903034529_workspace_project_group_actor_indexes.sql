-- Cover the actor foreign keys used by project-group archive and audit lookups.
-- The guard keeps disposable validation databases with older histories replayable.

do $$
begin
  if to_regclass('public.workspace_project_groups') is not null then
    create index if not exists workspace_project_groups_created_by_idx
      on public.workspace_project_groups (created_by);

    create index if not exists workspace_project_groups_archived_by_idx
      on public.workspace_project_groups (archived_by)
      where archived_by is not null;
  end if;
end;
$$;
