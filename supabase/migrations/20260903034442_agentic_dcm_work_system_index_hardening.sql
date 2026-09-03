-- Cover every foreign-key access path introduced by the agentic DCM work system.
-- These indexes keep project deletion, plan supersession and timeline reads predictable
-- as the number of projects, plan revisions and evidence-backed decisions grows.

create index capital_project_agent_plans_base_plan_fk_idx
  on public.capital_project_agent_plans (organization_id, base_plan_id);

create index capital_project_agent_plans_supersedes_fk_idx
  on public.capital_project_agent_plans (organization_id, supersedes_plan_id)
  where supersedes_plan_id is not null;

create index capital_project_agent_plans_created_by_fk_idx
  on public.capital_project_agent_plans (created_by);

create index capital_project_agent_work_items_project_fk_idx
  on public.capital_project_agent_work_items (organization_id, capital_project_id);

create index capital_project_decisions_supersedes_fk_idx
  on public.capital_project_decisions (organization_id, supersedes_decision_id)
  where supersedes_decision_id is not null;

create index capital_project_decisions_created_by_fk_idx
  on public.capital_project_decisions (created_by);

create index capital_project_agent_events_plan_fk_idx
  on public.capital_project_agent_events (organization_id, agent_plan_id)
  where agent_plan_id is not null;

create index capital_project_agent_events_work_item_fk_idx
  on public.capital_project_agent_events (organization_id, work_item_id)
  where work_item_id is not null;
