-- Add the dynamic, auditable work layer above the immutable compiled TaskSpec plan.
-- The compiled plan remains the allowed capability boundary. These records capture how the
-- Deal Captain decomposes the current goal, what evidence is still missing, which decisions were
-- made and why a plan changed as new documents, research or user guidance arrived.

create table public.capital_project_agent_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  base_plan_id uuid not null,
  revision integer not null check (revision > 0),
  status text not null check (status in ('active', 'completed', 'superseded', 'invalidated')),
  goal text not null check (char_length(trim(goal)) between 5 and 2000),
  trigger_type text not null check (trigger_type in (
    'project_created', 'user_message', 'document_ingested', 'research_completed',
    'information_received', 'decision_revised', 'quality_gate_failed'
  )),
  trigger_ref text not null check (char_length(trim(trigger_ref)) between 1 and 300),
  schema_version text not null check (schema_version = 'dcm-agent-plan.v1'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  plan_fingerprint text not null check (plan_fingerprint ~ '^[0-9a-f]{64}$'),
  supersedes_plan_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, capital_project_id, revision),
  unique (organization_id, capital_project_id, plan_fingerprint),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, base_plan_id)
    references public.capital_project_plans(organization_id, id) on delete restrict,
  foreign key (organization_id, supersedes_plan_id)
    references public.capital_project_agent_plans(organization_id, id) on delete restrict
);

create unique index capital_project_agent_plans_one_active_idx
  on public.capital_project_agent_plans (organization_id, capital_project_id)
  where status = 'active';
create index capital_project_agent_plans_project_created_idx
  on public.capital_project_agent_plans (organization_id, capital_project_id, created_at desc);

create table public.capital_project_agent_work_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  agent_plan_id uuid not null,
  task_spec_id text check (task_spec_id is null or task_spec_id ~ '^[A-Z][0-9]{2}$'),
  title text not null check (char_length(trim(title)) between 3 and 240),
  specialist text not null check (specialist in (
    'deal_captain', 'context_intelligence', 'document_intelligence', 'company_and_sector',
    'financial_analysis', 'debt_and_capital_structure', 'transaction_structuring',
    'market_intelligence', 'materials', 'independent_verifier'
  )),
  status text not null check (status in (
    'pending', 'ready', 'running', 'waiting_user', 'blocked', 'review',
    'succeeded', 'failed', 'superseded'
  )),
  effect text not null check (effect in ('none', 'propose_state', 'commit', 'external')),
  dependencies uuid[] not null default '{}'::uuid[] check (cardinality(dependencies) <= 80),
  requirement_keys text[] not null default '{}'::text[] check (cardinality(requirement_keys) <= 80),
  decision_keys text[] not null default '{}'::text[] check (cardinality(decision_keys) <= 80),
  input_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(input_evidence) = 'array'),
  output_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(output_refs) = 'array'),
  approval_required boolean not null default false,
  budget jsonb not null check (jsonb_typeof(budget) = 'object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, agent_plan_id)
    references public.capital_project_agent_plans(organization_id, id) on delete cascade,
  check (effect <> 'external' or approval_required),
  check (status <> 'succeeded' or jsonb_array_length(output_refs) > 0),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index capital_project_agent_work_items_ready_idx
  on public.capital_project_agent_work_items (organization_id, agent_plan_id, status, created_at);

create table public.capital_project_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  decision_key text not null check (decision_key ~ '^[a-z0-9_.-]{3,120}$'),
  revision integer not null check (revision > 0),
  status text not null check (status in ('open', 'directional', 'confirmed', 'rejected', 'superseded')),
  question text not null check (char_length(trim(question)) between 5 and 1000),
  recommendation text check (recommendation is null or char_length(trim(recommendation)) between 3 and 4000),
  alternatives jsonb not null default '[]'::jsonb check (jsonb_typeof(alternatives) = 'array'),
  rationale_summary text not null check (char_length(trim(rationale_summary)) between 3 and 4000),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  assumptions jsonb not null default '[]'::jsonb check (jsonb_typeof(assumptions) = 'array'),
  unresolved jsonb not null default '[]'::jsonb check (jsonb_typeof(unresolved) = 'array'),
  confidence text not null check (confidence in ('insufficient', 'low', 'medium', 'high')),
  proposed_by text not null check (proposed_by in (
    'deal_captain', 'context_intelligence', 'document_intelligence', 'company_and_sector',
    'financial_analysis', 'debt_and_capital_structure', 'transaction_structuring',
    'market_intelligence', 'materials', 'independent_verifier'
  )),
  reviewed_by text check (reviewed_by is null or reviewed_by in (
    'user', 'offroad_operator', 'independent_verifier'
  )),
  supersedes_decision_id uuid,
  schema_version text not null check (schema_version = 'dcm-decision.v1'),
  decision_fingerprint text not null check (decision_fingerprint ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, capital_project_id, decision_key, revision),
  unique (organization_id, capital_project_id, decision_fingerprint),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, supersedes_decision_id)
    references public.capital_project_decisions(organization_id, id) on delete restrict,
  check (status = 'open' or recommendation is not null),
  check (status <> 'confirmed' or reviewed_by is not null),
  check (confidence <> 'high' or jsonb_array_length(evidence) > 0)
);

create index capital_project_decisions_current_idx
  on public.capital_project_decisions (organization_id, capital_project_id, decision_key, revision desc);

create table public.capital_project_requirement_coverage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  requirement_key text not null check (requirement_key ~ '^[a-z0-9_.-]{3,120}$'),
  label text not null check (char_length(trim(label)) between 3 and 240),
  status text not null check (status in (
    'missing', 'candidate', 'partial', 'verified', 'conflicting', 'unavailable', 'not_applicable'
  )),
  materiality text not null check (materiality in ('blocking', 'high', 'medium', 'low')),
  decision_ids uuid[] not null default '{}'::uuid[] check (cardinality(decision_ids) <= 30),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  missing_reason text check (missing_reason is null or char_length(trim(missing_reason)) between 3 and 1000),
  assessed_by text not null check (assessed_by in (
    'deal_captain', 'context_intelligence', 'document_intelligence', 'company_and_sector',
    'financial_analysis', 'debt_and_capital_structure', 'transaction_structuring',
    'market_intelligence', 'materials', 'independent_verifier'
  )),
  assessed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, capital_project_id, requirement_key),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  check (status <> 'verified' or jsonb_array_length(evidence) > 0),
  check (status <> 'missing' or missing_reason is not null)
);

create index capital_project_requirement_coverage_status_idx
  on public.capital_project_requirement_coverage (organization_id, capital_project_id, status, materiality);

create table public.capital_project_information_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  requirement_key text not null check (requirement_key ~ '^[a-z0-9_.-]{3,120}$'),
  question text not null check (char_length(trim(question)) between 5 and 1000),
  why_it_matters text not null check (char_length(trim(why_it_matters)) between 5 and 1000),
  decision_impact text not null check (char_length(trim(decision_impact)) between 5 and 1000),
  acceptable_evidence text[] not null check (cardinality(acceptable_evidence) between 1 and 12),
  answer_kind text not null check (answer_kind in (
    'text', 'number', 'date', 'choice', 'document', 'confirmation'
  )),
  choices text[] not null default '{}'::text[] check (cardinality(choices) <= 12),
  priority text not null check (priority in ('blocking', 'high_value', 'later')),
  information_gain numeric(4,3) not null check (information_gain between 0 and 1),
  materiality numeric(4,3) not null check (materiality between 0 and 1),
  answerability numeric(4,3) not null check (answerability between 0 and 1),
  redundancy_penalty numeric(4,3) not null default 0 check (redundancy_penalty between 0 and 1),
  status text not null check (status in ('open', 'answered', 'waived', 'superseded')),
  answer_ref jsonb check (answer_ref is null or jsonb_typeof(answer_ref) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade
);

create unique index capital_project_information_requests_one_open_idx
  on public.capital_project_information_requests (organization_id, capital_project_id, requirement_key)
  where status = 'open';
create index capital_project_information_requests_priority_idx
  on public.capital_project_information_requests (
    organization_id, capital_project_id, status, priority, information_gain desc, materiality desc
  );

create table public.capital_project_agent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  agent_plan_id uuid,
  work_item_id uuid,
  event_type text not null check (event_type in (
    'plan_created', 'plan_superseded', 'work_started', 'work_progress', 'work_waiting_user',
    'work_completed', 'work_failed', 'decision_recorded', 'requirement_assessed',
    'question_created', 'question_answered', 'quality_gate_failed'
  )),
  summary_pt text not null check (char_length(trim(summary_pt)) between 3 and 500),
  summary_en text not null check (char_length(trim(summary_en)) between 3 and 500),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, agent_plan_id)
    references public.capital_project_agent_plans(organization_id, id) on delete cascade,
  foreign key (organization_id, work_item_id)
    references public.capital_project_agent_work_items(organization_id, id) on delete cascade
);

create index capital_project_agent_events_timeline_idx
  on public.capital_project_agent_events (organization_id, capital_project_id, created_at, id);

alter table public.capital_project_agent_plans enable row level security;
alter table public.capital_project_agent_plans force row level security;
alter table public.capital_project_agent_work_items enable row level security;
alter table public.capital_project_agent_work_items force row level security;
alter table public.capital_project_decisions enable row level security;
alter table public.capital_project_decisions force row level security;
alter table public.capital_project_requirement_coverage enable row level security;
alter table public.capital_project_requirement_coverage force row level security;
alter table public.capital_project_information_requests enable row level security;
alter table public.capital_project_information_requests force row level security;
alter table public.capital_project_agent_events enable row level security;
alter table public.capital_project_agent_events force row level security;

create policy capital_project_agent_plans_select
  on public.capital_project_agent_plans for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));
create policy capital_project_agent_work_items_select
  on public.capital_project_agent_work_items for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));
create policy capital_project_decisions_select
  on public.capital_project_decisions for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));
create policy capital_project_requirement_coverage_select
  on public.capital_project_requirement_coverage for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));
create policy capital_project_information_requests_select
  on public.capital_project_information_requests for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));
create policy capital_project_agent_events_select
  on public.capital_project_agent_events for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));

revoke all privileges on public.capital_project_agent_plans from public, anon, authenticated;
revoke all privileges on public.capital_project_agent_work_items from public, anon, authenticated;
revoke all privileges on public.capital_project_decisions from public, anon, authenticated;
revoke all privileges on public.capital_project_requirement_coverage from public, anon, authenticated;
revoke all privileges on public.capital_project_information_requests from public, anon, authenticated;
revoke all privileges on public.capital_project_agent_events from public, anon, authenticated;
grant select on public.capital_project_agent_plans to authenticated;
grant select on public.capital_project_agent_work_items to authenticated;
grant select on public.capital_project_decisions to authenticated;
grant select on public.capital_project_requirement_coverage to authenticated;
grant select on public.capital_project_information_requests to authenticated;
grant select on public.capital_project_agent_events to authenticated;

create trigger capital_project_agent_plans_audit
  after insert or update or delete on public.capital_project_agent_plans
  for each row execute function private.capture_audit_event();
create trigger capital_project_agent_work_items_set_updated_at
  before update on public.capital_project_agent_work_items
  for each row execute function private.set_updated_at();
create trigger capital_project_agent_work_items_audit
  after insert or update or delete on public.capital_project_agent_work_items
  for each row execute function private.capture_audit_event();
create trigger capital_project_decisions_audit
  after insert or update or delete on public.capital_project_decisions
  for each row execute function private.capture_audit_event();
create trigger capital_project_requirement_coverage_set_updated_at
  before update on public.capital_project_requirement_coverage
  for each row execute function private.set_updated_at();
create trigger capital_project_requirement_coverage_audit
  after insert or update or delete on public.capital_project_requirement_coverage
  for each row execute function private.capture_audit_event();
create trigger capital_project_information_requests_set_updated_at
  before update on public.capital_project_information_requests
  for each row execute function private.set_updated_at();
create trigger capital_project_information_requests_audit
  after insert or update or delete on public.capital_project_information_requests
  for each row execute function private.capture_audit_event();
create trigger capital_project_agent_events_audit
  after insert or update or delete on public.capital_project_agent_events
  for each row execute function private.capture_audit_event();

comment on table public.capital_project_agent_plans is
  'Append-only Deal Captain plan revisions, bounded by the immutable compiled TaskSpec plan.';
comment on table public.capital_project_agent_work_items is
  'Dynamic specialist work items with dependencies, budgets, evidence and approval requirements.';
comment on table public.capital_project_decisions is
  'Versioned decision ledger: recommendation, alternatives, evidence, assumptions and unresolved matters.';
comment on table public.capital_project_requirement_coverage is
  'Current evidence coverage for every material information requirement in a capital project.';
comment on table public.capital_project_information_requests is
  'Prioritized, non-redundant questions or document requests tied to decisions they can change.';
comment on table public.capital_project_agent_events is
  'User-visible, bilingual work timeline backed by real execution events rather than UI animation.';

-- Give every analytical job the same minimal, capability-bound planning context. Public specialist
-- jobs and private document-led jobs therefore enter the same work system. The loader includes the
-- user's declared objective and plan metadata, but never leaks another project or organization.
create or replace function private.worker_load_agent_plan_context_v1(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  project_row public.capital_projects;
  plan_row public.capital_project_plans;
  initial_request text;
  brief_content jsonb := '{}'::jsonb;
begin
  if job_row.kind not in ('preliminary_analysis', 'case_analysis', 'capital_project_analysis') then
    raise exception 'agent_plan_context_capability_required' using errcode = '42501';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.capital_project_id is not null;
  if not found then raise exception 'agent_plan_session_not_available' using errcode = 'P0002'; end if;

  select project.* into project_row
  from public.capital_projects project
  where project.organization_id = job_row.organization_id
    and project.id = session_row.capital_project_id;
  if not found then raise exception 'agent_plan_project_not_available' using errcode = 'P0002'; end if;

  select plan.* into plan_row
  from public.capital_project_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.capital_project_id = project_row.id
    and plan.status = 'active'
    and (
      job_row.kind <> 'capital_project_analysis'
      or plan.id::text = job_row.payload ->> 'capital_project_plan_id'
    );
  if not found then raise exception 'agent_plan_base_plan_not_available' using errcode = 'P0002'; end if;

  select message.content into initial_request
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.intake_session_id = session_row.id
    and message.role = 'user'
    and message.metadata ->> 'kind' = 'request'
    and message.status in ('completed', 'processing')
  order by message.created_at asc, message.id asc
  limit 1;

  select brief.content into brief_content
  from public.capital_project_briefs brief
  where brief.organization_id = job_row.organization_id
    and brief.capital_project_id = project_row.id
    and brief.status = 'active'
  order by brief.brief_version desc, brief.created_at desc
  limit 1;

  return jsonb_build_object(
    'project', jsonb_build_object(
      'id', project_row.id,
      'project_name', project_row.project_name,
      'entry_job', project_row.entry_job,
      'access_basis', project_row.access_basis
    ),
    'objective', jsonb_build_object(
      'initial_request', nullif(trim(coalesce(initial_request, '')), ''),
      'capital_objective', session_row.capital_objective,
      'company_profile', session_row.company_profile,
      'brief', coalesce(brief_content, '{}'::jsonb)
    ),
    'plan', jsonb_build_object(
      'id', plan_row.id,
      'version', plan_row.plan_version,
      'fingerprint', plan_row.plan_fingerprint
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task.task_id,
        'dependencies', task.dependencies,
        'execution_class', task.execution_class,
        'effect', task.effect
      ) order by task.ordinal)
      from public.capital_project_plan_tasks task
      where task.organization_id = job_row.organization_id
        and task.plan_id = plan_row.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.worker_load_agent_plan_context_v1(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_agent_plan_context_v1(p_job_id, p_capability_token);
$$;

revoke all on function private.worker_load_agent_plan_context_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.worker_load_agent_plan_context_v1(uuid, text)
  from public, anon;
grant execute on function private.worker_load_agent_plan_context_v1(uuid, text) to authenticated;
grant execute on function public.worker_load_agent_plan_context_v1(uuid, text) to authenticated;

comment on function public.worker_load_agent_plan_context_v1(uuid, text) is
  'Loads the tenant- and project-bound objective plus the immutable TaskSpec plan for public or private analytical work.';

-- Persist the Deal Captain's first projection of the immutable TaskSpec plan. The worker does
-- not receive a service-role key: the leased processing job and its short-lived capability bind
-- the write to one organization, session, project and compiled plan. The database rejects any
-- invented task, incomplete projection or dependency outside that plan.
create or replace function private.worker_record_agent_plan_v1(
  p_job_id uuid,
  p_capability_token text,
  p_agent_plan jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  session_row public.document_intake_sessions;
  base_plan public.capital_project_plans;
  existing_plan public.capital_project_agent_plans;
  item jsonb;
  agent_plan_id uuid;
  next_revision integer;
  supplied_task_ids text[];
  expected_task_ids text[];
  supplied_work_ids uuid[];
  dependency_id uuid;
begin
  if job_row.kind not in ('preliminary_analysis', 'case_analysis', 'capital_project_analysis')
    or coalesce(jsonb_typeof(p_agent_plan), 'null') <> 'object'
    or p_agent_plan ->> 'schemaVersion' <> 'dcm-agent-plan.v1'
    or coalesce(jsonb_typeof(p_agent_plan -> 'workItems'), 'null') <> 'array'
    or jsonb_array_length(p_agent_plan -> 'workItems') not between 1 and 120
    or coalesce(p_agent_plan ->> 'fingerprint', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'agent_plan_invalid' using errcode = '22023';
  end if;

  select session.* into session_row
  from public.document_intake_sessions session
  where session.organization_id = job_row.organization_id
    and session.id = job_row.intake_session_id
    and session.capital_project_id is not null;
  if not found then raise exception 'agent_plan_session_not_available' using errcode = 'P0002'; end if;

  select plan.* into base_plan
  from public.capital_project_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.capital_project_id = session_row.capital_project_id
    and plan.status = 'active'
    and (
      job_row.kind <> 'capital_project_analysis'
      or plan.id::text = job_row.payload ->> 'capital_project_plan_id'
    )
  for update;
  if not found then raise exception 'agent_plan_base_plan_not_available' using errcode = 'P0002'; end if;

  if p_agent_plan ->> 'projectId' <> session_row.capital_project_id::text then
    raise exception 'agent_plan_project_mismatch' using errcode = '42501';
  end if;

  select plan.* into existing_plan
  from public.capital_project_agent_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.capital_project_id = session_row.capital_project_id
    and plan.base_plan_id = base_plan.id
    and plan.status = 'active'
  limit 1;
  if found then return existing_plan.id; end if;

  select array_agg(task.task_id order by task.task_id)
  into expected_task_ids
  from public.capital_project_plan_tasks task
  where task.organization_id = job_row.organization_id
    and task.plan_id = base_plan.id;

  select
    array_agg(value ->> 'taskSpecId' order by value ->> 'taskSpecId'),
    array_agg((value ->> 'id')::uuid order by value ->> 'taskSpecId')
  into supplied_task_ids, supplied_work_ids
  from jsonb_array_elements(p_agent_plan -> 'workItems') value
  where value ->> 'taskSpecId' is not null;

  if supplied_task_ids is distinct from expected_task_ids
    or cardinality(supplied_work_ids) <> cardinality(expected_task_ids)
    or cardinality(supplied_work_ids) <> cardinality(array(select distinct unnest(supplied_work_ids))) then
    raise exception 'agent_plan_task_boundary_violation' using errcode = '42501';
  end if;

  select coalesce(max(plan.revision), 0) + 1 into next_revision
  from public.capital_project_agent_plans plan
  where plan.organization_id = job_row.organization_id
    and plan.capital_project_id = session_row.capital_project_id;
  agent_plan_id := (p_agent_plan ->> 'id')::uuid;

  update public.capital_project_agent_plans
  set status = 'superseded'
  where organization_id = job_row.organization_id
    and capital_project_id = session_row.capital_project_id
    and status = 'active';

  insert into public.capital_project_agent_plans (
    id, organization_id, capital_project_id, base_plan_id, revision, status, goal,
    trigger_type, trigger_ref, schema_version, snapshot, plan_fingerprint,
    supersedes_plan_id, created_by, created_at
  ) values (
    agent_plan_id, job_row.organization_id, session_row.capital_project_id, base_plan.id,
    next_revision, 'active', p_agent_plan ->> 'goal', p_agent_plan ->> 'trigger',
    p_agent_plan ->> 'triggerRef', p_agent_plan ->> 'schemaVersion', p_agent_plan,
    p_agent_plan ->> 'fingerprint', nullif(p_agent_plan ->> 'supersedesPlanId', '')::uuid,
    session_row.started_by, coalesce((p_agent_plan ->> 'createdAt')::timestamptz, now())
  );

  for item in select value from jsonb_array_elements(p_agent_plan -> 'workItems') value loop
    if item ->> 'projectId' <> session_row.capital_project_id::text
      or coalesce((item ->> 'planRevision')::integer, 0) <> 1
      or coalesce(jsonb_typeof(item -> 'dependencies'), 'null') <> 'array'
      or coalesce(jsonb_typeof(item -> 'requirementKeys'), 'null') <> 'array'
      or coalesce(jsonb_typeof(item -> 'decisionKeys'), 'null') <> 'array'
      or coalesce(jsonb_typeof(item -> 'inputEvidence'), 'null') <> 'array'
      or coalesce(jsonb_typeof(item -> 'outputRefs'), 'null') <> 'array'
      or coalesce(jsonb_typeof(item -> 'budget'), 'null') <> 'object' then
      raise exception 'agent_work_item_invalid' using errcode = '22023';
    end if;
    for dependency_id in
      select value::text::uuid from jsonb_array_elements_text(item -> 'dependencies') value
    loop
      if not dependency_id = any(supplied_work_ids) then
        raise exception 'agent_work_dependency_outside_plan' using errcode = '42501';
      end if;
    end loop;

    insert into public.capital_project_agent_work_items (
      id, organization_id, capital_project_id, agent_plan_id, task_spec_id, title,
      specialist, status, effect, dependencies, requirement_keys, decision_keys,
      input_evidence, output_refs, approval_required, budget
    ) values (
      (item ->> 'id')::uuid, job_row.organization_id, session_row.capital_project_id,
      agent_plan_id, item ->> 'taskSpecId', item ->> 'title', item ->> 'specialist',
      item ->> 'status', item ->> 'effect',
      array(select value::text::uuid from jsonb_array_elements_text(item -> 'dependencies') value),
      array(select value::text from jsonb_array_elements_text(item -> 'requirementKeys') value),
      array(select value::text from jsonb_array_elements_text(item -> 'decisionKeys') value),
      item -> 'inputEvidence', item -> 'outputRefs',
      coalesce((item ->> 'approvalRequired')::boolean, false), item -> 'budget'
    );
  end loop;

  insert into public.capital_project_agent_events (
    organization_id, capital_project_id, agent_plan_id, event_type,
    summary_pt, summary_en, detail
  ) values (
    job_row.organization_id, session_row.capital_project_id, agent_plan_id, 'plan_created',
    'Plano de trabalho construído a partir do objetivo e do contexto disponível.',
    'Work plan built from the objective and available context.',
    jsonb_build_object('base_plan_id', base_plan.id, 'revision', next_revision, 'work_item_count', cardinality(supplied_work_ids))
  );

  return agent_plan_id;
end;
$$;

create or replace function public.worker_record_agent_plan_v1(
  p_job_id uuid,
  p_capability_token text,
  p_agent_plan jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_agent_plan_v1(p_job_id, p_capability_token, p_agent_plan);
$$;

revoke all on function private.worker_record_agent_plan_v1(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.worker_record_agent_plan_v1(uuid, text, jsonb)
  from public, anon;
grant execute on function private.worker_record_agent_plan_v1(uuid, text, jsonb) to authenticated;
grant execute on function public.worker_record_agent_plan_v1(uuid, text, jsonb) to authenticated;

comment on function public.worker_record_agent_plan_v1(uuid, text, jsonb) is
  'Capability-bound command that projects one immutable TaskSpec plan into a user-visible Deal Captain plan.';
