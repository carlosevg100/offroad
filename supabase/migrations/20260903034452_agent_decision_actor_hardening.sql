-- Keep decision authorship complete even on environments that received the first assessment
-- projection before the worker command explicitly supplied created_by. The worker remains the
-- recorded execution principal in audit events; the decision belongs to the user who created the
-- project session and is still capability-bound to that exact tenant and project.

create or replace function private.attribute_capital_project_agent_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is null then
    select session.started_by into new.created_by
    from public.document_intake_sessions session
    where session.organization_id = new.organization_id
      and session.capital_project_id = new.capital_project_id
    order by session.created_at asc, session.id asc
    limit 1;
  end if;

  if new.created_by is null then
    raise exception 'agent_decision_actor_not_available' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

revoke all on function private.attribute_capital_project_agent_decision()
  from public, anon, authenticated;

drop trigger if exists capital_project_decisions_attribute_actor
  on public.capital_project_decisions;
create trigger capital_project_decisions_attribute_actor
  before insert on public.capital_project_decisions
  for each row execute function private.attribute_capital_project_agent_decision();

comment on function private.attribute_capital_project_agent_decision() is
  'Fail-closed attribution for capability-bound agent decisions to the user who created the project session.';
