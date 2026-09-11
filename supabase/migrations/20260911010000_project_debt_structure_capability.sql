-- The ordinary project work entry gains a fourth capability: the Case 01 debt methods that reached
-- production on the founder's approval of 10 September 2026 (build-debt-ledger,
-- build-interest-and-indexation-schedule, reconcile-covenant-definitions,
-- reconcile-financial-statements, compare-refinancing-before-after, diagnose-maturity-wall and
-- estimate-exit-cost-by-series). Nothing else moves: the same project review roles decide who may
-- prepare, the request is recorded exactly as the other three are, and no grant is widened. The
-- Case 01 preview keeps its own path untouched for the organizations that hold it.
alter table public.capital_project_work_requests
  drop constraint if exists capital_project_work_requests_capability_check;
alter table public.capital_project_work_requests
  add constraint capital_project_work_requests_capability_check
  check (capability in ('documentary_reading', 'financial_result', 'provider_research', 'debt_structure_analysis'));

create or replace function private.record_capital_project_work_request_v1(
  p_project_id uuid, p_request_id uuid, p_capability text, p_objective text, p_locale text,
  p_registry_version text, p_dispatch jsonb, p_origin_section text, p_status text, p_documentary jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid()); project public.capital_projects; existing public.capital_project_work_requests;
  objective text := trim(coalesce(p_objective, '')); outcome jsonb := '{}'::jsonb;
begin
  if caller_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_request_id is null or p_capability not in ('documentary_reading', 'financial_result', 'provider_research', 'debt_structure_analysis')
    or p_locale not in ('pt-BR', 'en-US') or char_length(objective) not between 3 and 8000
    or coalesce(jsonb_typeof(p_dispatch), 'null') <> 'object' or p_status not in ('dispatched', 'needs_information')
    or char_length(coalesce(p_registry_version, '')) not between 1 and 80
    or (p_origin_section is not null and char_length(p_origin_section) not between 1 and 120) then
    raise exception 'invalid_work_request' using errcode = '22023';
  end if;
  select * into project from public.capital_projects p
    where p.id = p_project_id and p.status <> 'archived' and private.can_access_capital_project(p.organization_id, p.id) for update;
  if not found then raise exception 'capital_project_not_found' using errcode = 'P0002'; end if;
  perform private.assert_capital_project_review_action(project.organization_id, project.id, 'prepare');
  select * into existing from public.capital_project_work_requests r where r.id = p_request_id;
  if found then
    if existing.organization_id <> project.organization_id or existing.capital_project_id <> project.id
      or existing.requested_by <> caller_id or existing.capability <> p_capability or existing.objective <> objective then
      raise exception 'work_request_id_already_in_use' using errcode = '23505';
    end if;
    return jsonb_build_object('request_id', existing.id, 'status', existing.status, 'outcome', existing.outcome, 'replayed', true);
  end if;
  if p_capability = 'documentary_reading' and p_status = 'dispatched' then
    if coalesce(jsonb_typeof(p_documentary), 'null') <> 'object' then raise exception 'invalid_work_request' using errcode = '22023'; end if;
    outcome := private.request_documentary_work_revision_v1(project.id, (p_documentary ->> 'execution_brief_id')::uuid,
      p_documentary ->> 'expected_fingerprint', (p_documentary ->> 'message_id')::uuid, p_locale, objective, p_documentary -> 'plan');
  end if;
  insert into public.capital_project_work_requests (id, organization_id, capital_project_id, requested_by, capability, objective,
    locale, registry_version, dispatch, origin_section, status, outcome)
    values (p_request_id, project.organization_id, project.id, caller_id, p_capability, objective,
      p_locale, p_registry_version, p_dispatch, p_origin_section, p_status, outcome);
  return jsonb_build_object('request_id', p_request_id, 'status', p_status, 'outcome', outcome, 'replayed', false);
end;
$$;
