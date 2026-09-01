-- Cover every foreign key introduced by the universal capital-project runtime. These indexes
-- protect parent updates/deletes and the project-scoped reads used by the workspace and worker.

create index if not exists capital_projects_created_by_idx
  on public.capital_projects (created_by);

create index if not exists capital_projects_archived_by_idx
  on public.capital_projects (archived_by)
  where archived_by is not null;

create index if not exists document_intake_sessions_archived_by_idx
  on public.document_intake_sessions (archived_by)
  where archived_by is not null;

create index if not exists capital_project_plan_tasks_project_idx
  on public.capital_project_plan_tasks (organization_id, capital_project_id);

create index if not exists capital_project_task_runs_project_idx
  on public.capital_project_task_runs (organization_id, capital_project_id);
