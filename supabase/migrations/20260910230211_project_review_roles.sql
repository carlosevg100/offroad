-- Project review roles: preparer, reviewer and approver per capital project, plus an explicit
-- self-approval setting per organization or per project, enforced inside the commands that
-- prepare, return and approve work. Project access alone no longer grants every action.
--
-- Compatibility policy (also documented in docs/product/PROJECT_REVIEW_ROLES.md):
--   * A project with no review assignment is in "open" mode: every active member with project
--     access may prepare, return and approve, exactly as before this migration, including the
--     person who prepared the plan. Historical approvals and existing single-person projects
--     therefore keep working without any configuration.
--   * The first assignment moves the project to "assigned" mode. Preparing then needs the
--     preparer role, returning needs reviewer or approver, approving needs approver, and the
--     person who prepared a version may approve it only when the effective self-approval setting
--     allows it. Roles are additive per person.
--   * Effective self-approval = project setting when explicit ('allowed'/'forbidden'), otherwise
--     the organization setting, otherwise false.
--   * Organization owners and admins manage assignments and settings. A commercial or
--     professional profile (CFO, banker, analyst, investor) never grants a review role by itself.
--   * Approval records now persist preparer, reviewer, decision and approved revision. Already
--     accepted dispatches are backfilled from their brief history and accepted_by.
--   * A change after approval still requires a new review: the existing input and payload
--     fingerprints supersede the approval, and the new version is approved by an approver again.

create table public.organization_review_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  self_approval_allowed boolean not null default false,
  updated_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organization_review_policies_updated_by_idx on public.organization_review_policies(updated_by) where updated_by is not null;
alter table public.organization_review_policies enable row level security;
alter table public.organization_review_policies force row level security;
create policy organization_review_policies_select on public.organization_review_policies for select to authenticated
  using ((select private.is_org_member(organization_id)));
create policy organization_review_policies_deny_insert on public.organization_review_policies for insert to authenticated with check (false);
create policy organization_review_policies_deny_update on public.organization_review_policies for update to authenticated using (false) with check (false);
create policy organization_review_policies_deny_delete on public.organization_review_policies for delete to authenticated using (false);
revoke all privileges on public.organization_review_policies from public, anon, authenticated;
grant select on public.organization_review_policies to authenticated;
create trigger organization_review_policies_set_updated_at before update on public.organization_review_policies
  for each row execute function private.set_updated_at();
create trigger organization_review_policies_audit after insert or update or delete on public.organization_review_policies
  for each row execute function private.capture_audit_event();

create table public.capital_project_review_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  self_approval text not null default 'inherit' check (self_approval in ('inherit', 'allowed', 'forbidden')),
  updated_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, capital_project_id),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade
);
create index capital_project_review_policies_updated_by_idx on public.capital_project_review_policies(updated_by) where updated_by is not null;
alter table public.capital_project_review_policies enable row level security;
alter table public.capital_project_review_policies force row level security;
create policy capital_project_review_policies_select on public.capital_project_review_policies for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));
create policy capital_project_review_policies_deny_insert on public.capital_project_review_policies for insert to authenticated with check (false);
create policy capital_project_review_policies_deny_update on public.capital_project_review_policies for update to authenticated using (false) with check (false);
create policy capital_project_review_policies_deny_delete on public.capital_project_review_policies for delete to authenticated using (false);
revoke all privileges on public.capital_project_review_policies from public, anon, authenticated;
grant select on public.capital_project_review_policies to authenticated;
create trigger capital_project_review_policies_set_updated_at before update on public.capital_project_review_policies
  for each row execute function private.set_updated_at();
create trigger capital_project_review_policies_audit after insert or update or delete on public.capital_project_review_policies
  for each row execute function private.capture_audit_event();

create table public.capital_project_review_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  review_role text not null check (review_role in ('preparer', 'reviewer', 'approver')),
  assigned_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, capital_project_id, user_id, review_role),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, user_id)
    references public.organization_memberships(organization_id, user_id) on delete cascade
);
create index capital_project_review_assignments_user_idx on public.capital_project_review_assignments(organization_id, user_id);
create index capital_project_review_assignments_assigned_by_idx on public.capital_project_review_assignments(assigned_by);
alter table public.capital_project_review_assignments enable row level security;
alter table public.capital_project_review_assignments force row level security;
create policy capital_project_review_assignments_select on public.capital_project_review_assignments for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));
create policy capital_project_review_assignments_deny_insert on public.capital_project_review_assignments for insert to authenticated with check (false);
create policy capital_project_review_assignments_deny_update on public.capital_project_review_assignments for update to authenticated using (false) with check (false);
create policy capital_project_review_assignments_deny_delete on public.capital_project_review_assignments for delete to authenticated using (false);
revoke all privileges on public.capital_project_review_assignments from public, anon, authenticated;
grant select on public.capital_project_review_assignments to authenticated;
create trigger capital_project_review_assignments_set_updated_at before update on public.capital_project_review_assignments
  for each row execute function private.set_updated_at();
create trigger capital_project_review_assignments_audit after insert or update or delete on public.capital_project_review_assignments
  for each row execute function private.capture_audit_event();

-- The common "new work" entry records what was asked, which capability took it and where the
-- executor's inputs and result live, so a person can resume after a failure and return to the
-- result that originated the request. The executors keep their own versions and approvals.
create table public.capital_project_work_requests (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  capability text not null check (capability in ('documentary_reading', 'financial_result', 'provider_research')),
  objective text not null check (char_length(trim(objective)) between 3 and 8000),
  locale text not null check (locale in ('pt-BR', 'en-US')),
  registry_version text not null check (char_length(registry_version) between 1 and 80),
  dispatch jsonb not null default '{}'::jsonb check (jsonb_typeof(dispatch) = 'object'),
  origin_section text check (origin_section is null or char_length(origin_section) between 1 and 120),
  status text not null check (status in ('dispatched', 'needs_information')),
  outcome jsonb not null default '{}'::jsonb check (jsonb_typeof(outcome) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade
);
create index capital_project_work_requests_project_idx on public.capital_project_work_requests(organization_id, capital_project_id, created_at desc);
create index capital_project_work_requests_requested_by_idx on public.capital_project_work_requests(requested_by);
alter table public.capital_project_work_requests enable row level security;
alter table public.capital_project_work_requests force row level security;
create policy capital_project_work_requests_select on public.capital_project_work_requests for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));
create policy capital_project_work_requests_deny_insert on public.capital_project_work_requests for insert to authenticated with check (false);
create policy capital_project_work_requests_deny_update on public.capital_project_work_requests for update to authenticated using (false) with check (false);
create policy capital_project_work_requests_deny_delete on public.capital_project_work_requests for delete to authenticated using (false);
revoke all privileges on public.capital_project_work_requests from public, anon, authenticated;
grant select on public.capital_project_work_requests to authenticated;
create trigger capital_project_work_requests_set_updated_at before update on public.capital_project_work_requests
  for each row execute function private.set_updated_at();
create trigger capital_project_work_requests_audit after insert or update or delete on public.capital_project_work_requests
  for each row execute function private.capture_audit_event();

-- The approval record keeps who prepared, who reviewed, the decision and the exact approved
-- revision. Preparer of a version = the person whose request produced it (latest plan-edit
-- request before the version existed), otherwise the person who created the plan.
alter table public.capital_project_execution_brief_dispatches
  add column prepared_by uuid references auth.users(id) on delete restrict,
  add column reviewed_by uuid references auth.users(id) on delete restrict,
  add column reviewed_at timestamptz,
  add column review_decision text check (review_decision in ('approved', 'returned')),
  add column approved_brief_version integer check (approved_brief_version > 0),
  add column approved_brief_fingerprint text check (approved_brief_fingerprint ~ '^[a-f0-9]{64}$');
create index execution_brief_dispatch_prepared_by_idx on public.capital_project_execution_brief_dispatches(prepared_by) where prepared_by is not null;
create index execution_brief_dispatch_reviewed_by_idx on public.capital_project_execution_brief_dispatches(reviewed_by) where reviewed_by is not null;

create or replace function private.execution_brief_preparer_v1(p_execution_brief_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select e.actor_user_id from public.capital_project_execution_brief_events e
      where e.organization_id = b.organization_id and e.capital_project_id = b.capital_project_id
        and e.event_type = 'edit_requested' and e.actor_type = 'user' and e.created_at < b.created_at
      order by e.created_at desc, e.id desc limit 1),
    b.created_by)
  from public.capital_project_execution_briefs b where b.id = p_execution_brief_id;
$$;
revoke all on function private.execution_brief_preparer_v1(uuid) from public, anon, authenticated;

update public.capital_project_execution_brief_dispatches d
set prepared_by = private.execution_brief_preparer_v1(d.execution_brief_id),
    reviewed_by = d.accepted_by,
    reviewed_at = d.accepted_at,
    review_decision = 'approved',
    approved_brief_version = b.brief_version,
    approved_brief_fingerprint = b.brief_fingerprint
from public.capital_project_execution_briefs b
where b.organization_id = d.organization_id and b.id = d.execution_brief_id and d.accepted_at is not null;

alter table public.capital_project_execution_brief_dispatches
  add constraint execution_brief_dispatch_approval_record_complete check (
    accepted_at is null
    or (review_decision = 'approved' and reviewed_by is not null and reviewed_at is not null
      and approved_brief_version is not null and approved_brief_fingerprint is not null)
  );

create or replace function private.capital_project_review_mode(p_organization_id uuid, p_project_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from public.capital_project_review_assignments a
    where a.organization_id = p_organization_id and a.capital_project_id = p_project_id
  ) then 'assigned' else 'open' end;
$$;
revoke all on function private.capital_project_review_mode(uuid, uuid) from public, anon, authenticated;

create or replace function private.capital_project_self_approval_allowed(p_organization_id uuid, p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case p.self_approval when 'allowed' then true when 'forbidden' then false else null end
      from public.capital_project_review_policies p
      where p.organization_id = p_organization_id and p.capital_project_id = p_project_id),
    (select o.self_approval_allowed from public.organization_review_policies o where o.organization_id = p_organization_id),
    false);
$$;
revoke all on function private.capital_project_self_approval_allowed(uuid, uuid) from public, anon, authenticated;

create or replace function private.capital_project_review_roles(p_organization_id uuid, p_project_id uuid, p_user_id uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(a.review_role order by a.review_role), '{}'::text[])
  from public.capital_project_review_assignments a
  join public.organization_memberships m
    on m.organization_id = a.organization_id and m.user_id = a.user_id and m.status = 'active'
  where a.organization_id = p_organization_id and a.capital_project_id = p_project_id and a.user_id = p_user_id;
$$;
revoke all on function private.capital_project_review_roles(uuid, uuid, uuid) from public, anon, authenticated;

-- Returns null when the caller may perform the action, otherwise the denial code.
create or replace function private.capital_project_review_action_allowed(
  p_organization_id uuid, p_project_id uuid, p_action text, p_preparer uuid default null
) returns text language plpgsql stable security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); roles text[]; mode text;
begin
  if p_action not in ('prepare', 'return', 'approve') then
    raise exception 'invalid_review_action' using errcode = '22023';
  end if;
  if caller_id is null or not private.can_access_capital_project(p_organization_id, p_project_id) then
    return 'capital_project_not_found';
  end if;
  mode := private.capital_project_review_mode(p_organization_id, p_project_id);
  if mode = 'open' then return null; end if;
  roles := private.capital_project_review_roles(p_organization_id, p_project_id, caller_id);
  if p_action = 'prepare' and not ('preparer' = any(roles)) then return 'capital_project_review_role_required'; end if;
  if p_action = 'return' and not ('reviewer' = any(roles) or 'approver' = any(roles)) then return 'capital_project_review_role_required'; end if;
  if p_action = 'approve' then
    if not ('approver' = any(roles)) then return 'capital_project_review_role_required'; end if;
    if p_preparer is not null and p_preparer = caller_id
      and not private.capital_project_self_approval_allowed(p_organization_id, p_project_id) then
      return 'capital_project_self_approval_forbidden';
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.capital_project_review_action_allowed(uuid, uuid, text, uuid) from public, anon, authenticated;

create or replace function private.assert_capital_project_review_action(
  p_organization_id uuid, p_project_id uuid, p_action text, p_preparer uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare denial text := private.capital_project_review_action_allowed(p_organization_id, p_project_id, p_action, p_preparer);
begin
  if denial = 'capital_project_not_found' then raise exception 'capital_project_not_found' using errcode = 'P0002'; end if;
  if denial is not null then raise exception '%', denial using errcode = '42501', detail = p_action; end if;
end;
$$;
revoke all on function private.assert_capital_project_review_action(uuid, uuid, text, uuid) from public, anon, authenticated;

-- A plan adjustment is preparation when the preparer sends it and a return when a reviewer or
-- approver sends the version back. Read-only members may do neither once roles are assigned.
create or replace function private.review_execution_brief_edit_v1(
  p_organization_id uuid, p_project_id uuid, p_execution_brief_id uuid, p_caller_id uuid
) returns text language plpgsql security definer set search_path = '' as $$
declare
  preparer uuid := private.execution_brief_preparer_v1(p_execution_brief_id);
  mode text := private.capital_project_review_mode(p_organization_id, p_project_id);
  roles text[] := private.capital_project_review_roles(p_organization_id, p_project_id, p_caller_id);
  decision text := 'prepare';
begin
  if mode = 'assigned' and not (roles && array['preparer', 'reviewer', 'approver']) then
    raise exception 'capital_project_review_role_required' using errcode = '42501', detail = 'return';
  end if;
  if p_caller_id is distinct from preparer and (mode = 'open' or roles && array['reviewer', 'approver']) then
    decision := 'return';
    update public.capital_project_execution_brief_dispatches
    set reviewed_by = p_caller_id, reviewed_at = now(), review_decision = 'returned',
        prepared_by = coalesce(prepared_by, preparer)
    where organization_id = p_organization_id and execution_brief_id = p_execution_brief_id and accepted_at is null;
  end if;
  return decision;
end;
$$;
revoke all on function private.review_execution_brief_edit_v1(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Approval: same locks, stale checks, command conflict and replay as before; the approver role,
-- the self-approval setting and the persisted approval record are added.
create or replace function private.approve_advisor_execution_brief_v1(
  p_project_id uuid,p_execution_brief_id uuid,p_expected_fingerprint text,p_command_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  project_row public.capital_projects; b public.capital_project_execution_briefs;
  d public.capital_project_execution_brief_dispatches; j public.processing_jobs; event_id uuid; preparer uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_command_id is null or p_expected_fingerprint is null or p_expected_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_execution_brief_approval' using errcode='22023';
  end if;
  select * into project_row from public.capital_projects p where p.id=p_project_id and p.status<>'archived'
    and private.can_access_capital_project(p.organization_id,p.id);
  if not found then raise exception 'capital_project_not_found' using errcode='P0002'; end if;
  select * into d from public.capital_project_execution_brief_dispatches
    where organization_id=project_row.organization_id and capital_project_id=p_project_id and execution_brief_id=p_execution_brief_id;
  if not found then raise exception 'execution_brief_dispatch_unavailable' using errcode='P0002'; end if;
  -- Same order as worker capabilities: target job, session, project. No bulk job locks in writers.
  select * into j from public.processing_jobs where organization_id=d.organization_id and id=d.processing_job_id for update;
  perform 1 from public.document_intake_sessions where organization_id=j.organization_id and id=j.intake_session_id for update;
  perform 1 from public.capital_projects where organization_id=d.organization_id and id=p_project_id for update;
  select * into d from public.capital_project_execution_brief_dispatches where id=d.id for update;
  select * into b from public.capital_project_execution_briefs where organization_id=d.organization_id and id=p_execution_brief_id;
  if b.brief_fingerprint is distinct from p_expected_fingerprint
    or not private.execution_dispatch_is_current(j.id,false) then
    raise exception 'execution_brief_approval_stale' using errcode='40001';
  end if;
  preparer:=private.execution_brief_preparer_v1(b.id);
  perform private.assert_capital_project_review_action(project_row.organization_id,project_row.id,'approve',preparer);
  if exists(select 1 from public.capital_project_execution_brief_dispatches other
    where other.organization_id=d.organization_id and other.approval_command_id=p_command_id and other.id<>d.id) then
    raise exception 'execution_brief_approval_command_conflict' using errcode='23505';
  end if;
  if d.accepted_at is not null then
    return jsonb_build_object('execution_brief_id',b.id,'processing_job_id',j.id,'status','already_approved','replayed',true);
  end if;
  if exists(select 1 from public.agent_messages m where m.organization_id=j.organization_id and m.intake_session_id=j.intake_session_id and m.role='user' and m.status in ('queued','processing')) then
    raise exception 'advisor_message_in_progress' using errcode='55000';
  end if;
  if j.status<>'awaiting_approval' then raise exception 'execution_brief_dispatch_not_pending' using errcode='40001'; end if;
  -- Separate downstream economic/representation/external-effect gates remain enforced by the
  -- original queued payload and its executor; this consent authorizes only that bounded work.
  insert into public.capital_project_execution_brief_events(organization_id,capital_project_id,execution_brief_id,event_type,actor_type,actor_user_id,event_payload)
    values(d.organization_id,p_project_id,b.id,'accepted','user',auth.uid(),jsonb_build_object(
      'commandId',p_command_id,'briefFingerprint',b.brief_fingerprint,'processingJobId',j.id,
      'payloadFingerprint',d.payload_fingerprint,'inputFingerprint',d.input_fingerprint,
      'preparedBy',preparer,'reviewedBy',auth.uid(),'approvedBriefVersion',b.brief_version,
      'reviewMode',private.capital_project_review_mode(project_row.organization_id,project_row.id))) returning id into event_id;
  update public.capital_project_execution_brief_dispatches set approval_command_id=p_command_id,
    accepted_event_id=event_id,accepted_by=auth.uid(),accepted_at=now(),
    prepared_by=preparer,reviewed_by=auth.uid(),reviewed_at=now(),review_decision='approved',
    approved_brief_version=b.brief_version,approved_brief_fingerprint=b.brief_fingerprint where id=d.id;
  update public.processing_jobs set status='queued',available_at=now() where id=j.id;
  update public.processing_runs set status='queued',completed_at=null where organization_id=j.organization_id and id=j.processing_run_id;
  update public.document_intake_sessions set current_run_id=j.processing_run_id,status='processing',processing_started_at=now(),processing_completed_at=null
    where organization_id=j.organization_id and id=j.intake_session_id;
  return jsonb_build_object('execution_brief_id',b.id,'processing_job_id',j.id,'status','queued','replayed',false);
end;
$$;

create or replace function private.read_advisor_execution_brief_approval_v1(p_project_id uuid,p_execution_brief_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b public.capital_project_execution_briefs; d public.capital_project_execution_brief_dispatches; state text; reason text; preparer uuid;
begin
  select * into b from public.capital_project_execution_briefs where id=p_execution_brief_id and capital_project_id=p_project_id
    and private.can_access_capital_project(organization_id,capital_project_id);
  if not found then raise exception 'execution_brief_not_found' using errcode='P0002'; end if;
  select * into d from public.capital_project_execution_brief_dispatches where organization_id=b.organization_id and execution_brief_id=b.id;
  state:=case when d.id is null then 'unavailable'
    when not private.execution_dispatch_is_current(d.processing_job_id,false) then 'superseded'
    when d.accepted_at is null and not exists(select 1 from public.processing_jobs j where j.id=d.processing_job_id and j.status='awaiting_approval') then 'unavailable'
    when d.accepted_at is null then 'proposed' else 'approved' end;
  reason:=case state when 'approved' then 'approved' when 'proposed' then 'approval_required' when 'superseded' then 'context_changed'
    else case
      when exists(select 1 from public.preliminary_understandings u join public.document_intake_sessions s on s.organization_id=u.organization_id and s.id=u.intake_session_id
        where s.organization_id=b.organization_id and s.capital_project_id=b.capital_project_id and u.status='pending_confirmation') then 'awaiting_preliminary_confirmation'
      when exists(select 1 from public.processing_jobs j join public.document_intake_sessions s on s.organization_id=j.organization_id and s.id=j.intake_session_id
        where s.organization_id=b.organization_id and s.capital_project_id=b.capital_project_id and j.kind='execution_brief_proposal' and j.status in ('queued','leased')) then 'plan_generation_pending'
      when exists(select 1 from public.capital_project_information_requests r where r.organization_id=b.organization_id and r.capital_project_id=b.capital_project_id and r.status='open') then 'required_information_missing'
      else 'dispatch_unavailable' end end;
  preparer:=coalesce(d.prepared_by,private.execution_brief_preparer_v1(b.id));
  return jsonb_build_object('status',state,'reason',reason,'execution_brief_id',b.id,'brief_fingerprint',b.brief_fingerprint,
    'processing_job_id',d.processing_job_id,'accepted_at',d.accepted_at,
    'prepared_by',preparer,'reviewed_by',d.reviewed_by,'reviewed_at',d.reviewed_at,'review_decision',d.review_decision,
    'approved_brief_version',d.approved_brief_version,
    'review_mode',private.capital_project_review_mode(b.organization_id,b.capital_project_id),
    'caller_can_approve',private.capital_project_review_action_allowed(b.organization_id,b.capital_project_id,'approve',preparer) is null,
    'caller_can_return',private.capital_project_review_action_allowed(b.organization_id,b.capital_project_id,'return') is null);
end;
$$;

-- Role checks injected into the existing prepare and return commands, after their own membership
-- and project lookups and before any write. Every existing check remains in place.
do $migration$
declare definition text; needle text;
begin
  definition := pg_get_functiondef('private.submit_advisor_execution_brief_edit_v1(uuid,uuid,text,uuid,text,text)'::regprocedure);
  needle := '  -- The worker that appends a new brief locks the plan. Taking the same lock before the latest';
  if position(needle in definition) = 0 then raise exception 'execution brief edit role patch drift'; end if;
  execute replace(definition, needle, '  perform private.review_execution_brief_edit_v1(project_row.organization_id, project_row.id, current_brief.id, caller_id);' || E'\n' || needle);

  definition := pg_get_functiondef('private.request_documentary_work_revision_v1(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure);
  needle := $needle$  if project_row.access_basis<>'authorized_private' or not private.is_released_documentary_plan_v1(p_plan,project_row.entry_job) then$needle$;
  if position(needle in definition) = 0 then raise exception 'documentary revision role patch drift'; end if;
  execute replace(definition, needle, '  perform private.assert_capital_project_review_action(project_row.organization_id,project_row.id,''prepare'');' || E'\n' || needle);

  definition := pg_get_functiondef('private.submit_institutional_model_setup_v1(uuid,text,jsonb,jsonb,uuid,text)'::regprocedure);
  needle := $needle$ if p.id is null or not private.can_access_capital_project(p.organization_id,p.id) then raise exception 'institutional_setup_forbidden' using errcode='42501';end if;$needle$;
  if position(needle in definition) = 0 then raise exception 'institutional setup role patch drift'; end if;
  execute replace(definition, needle, needle || E'\n' || ' perform private.assert_capital_project_review_action(p.organization_id,p.id,''prepare'');');

  definition := pg_get_functiondef('private.review_institutional_configuration_and_calculate_v1(uuid,uuid,text,text,text,uuid,text)'::regprocedure);
  needle := $needle$ perform 1 from public.capital_projects where organization_id=c.organization_id and id=p_project_id for update;$needle$;
  if position(needle in definition) = 0 then raise exception 'institutional review role patch drift'; end if;
  execute replace(definition, needle, needle || E'\n' || $patch$ perform private.assert_capital_project_review_action(c.organization_id,p_project_id,case when p_decision='approved' then 'approve' else 'return' end,
   (select sub.submitted_by from private.institutional_model_setup_submissions sub where sub.organization_id=c.organization_id and sub.candidate_id=c.id order by sub.submitted_at desc limit 1));$patch$);

  definition := pg_get_functiondef('private.start_provider_case_fit_project_v1(uuid,text,text,text,jsonb,uuid,uuid,text,jsonb)'::regprocedure);
  needle := $needle$   if p_plan#>>'{job,id}' is distinct from project.entry_job then raise exception 'case_fit_entry_mismatch'; end if;$needle$;
  if position(needle in definition) = 0 then raise exception 'provider case fit role patch drift'; end if;
  execute replace(definition, needle, needle || E'\n' || '   perform private.assert_capital_project_review_action(project.organization_id,project.id,''prepare'');');
end;
$migration$;

-- Management commands: organization owners and admins only. Assignments require an active member.
create or replace function private.set_capital_project_review_assignment_v1(
  p_project_id uuid, p_user_id uuid, p_review_role text, p_assigned boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); project public.capital_projects; existing public.capital_project_review_assignments;
begin
  if caller_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_user_id is null or p_review_role not in ('preparer', 'reviewer', 'approver') or p_assigned is null then
    raise exception 'invalid_review_assignment' using errcode = '22023';
  end if;
  select * into project from public.capital_projects p
    where p.id = p_project_id and p.status <> 'archived' and private.can_access_capital_project(p.organization_id, p.id) for update;
  if not found then raise exception 'capital_project_not_found' using errcode = 'P0002'; end if;
  if not private.can_manage_organization(project.organization_id) then
    raise exception 'capital_project_review_management_denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organization_memberships m
      where m.organization_id = project.organization_id and m.user_id = p_user_id and m.status = 'active') then
    raise exception 'review_assignment_member_required' using errcode = '22023';
  end if;
  select * into existing from public.capital_project_review_assignments a
    where a.organization_id = project.organization_id and a.capital_project_id = project.id
      and a.user_id = p_user_id and a.review_role = p_review_role;
  if p_assigned then
    if found then return jsonb_build_object('assignment_id', existing.id, 'status', 'assigned', 'replayed', true); end if;
    insert into public.capital_project_review_assignments (organization_id, capital_project_id, user_id, review_role, assigned_by)
      values (project.organization_id, project.id, p_user_id, p_review_role, caller_id) returning * into existing;
    return jsonb_build_object('assignment_id', existing.id, 'status', 'assigned', 'replayed', false);
  end if;
  if not found then return jsonb_build_object('assignment_id', null, 'status', 'unassigned', 'replayed', true); end if;
  delete from public.capital_project_review_assignments where id = existing.id;
  return jsonb_build_object('assignment_id', existing.id, 'status', 'unassigned', 'replayed', false);
end;
$$;
create or replace function public.set_capital_project_review_assignment_v1(
  p_project_id uuid, p_user_id uuid, p_review_role text, p_assigned boolean
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_capital_project_review_assignment_v1(p_project_id, p_user_id, p_review_role, p_assigned);
$$;
revoke all on function private.set_capital_project_review_assignment_v1(uuid, uuid, text, boolean), public.set_capital_project_review_assignment_v1(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function private.set_capital_project_review_assignment_v1(uuid, uuid, text, boolean), public.set_capital_project_review_assignment_v1(uuid, uuid, text, boolean) to authenticated;

create or replace function private.set_capital_project_review_policy_v1(p_project_id uuid, p_self_approval text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); project public.capital_projects;
begin
  if caller_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_self_approval not in ('inherit', 'allowed', 'forbidden') then raise exception 'invalid_review_policy' using errcode = '22023'; end if;
  select * into project from public.capital_projects p
    where p.id = p_project_id and p.status <> 'archived' and private.can_access_capital_project(p.organization_id, p.id) for update;
  if not found then raise exception 'capital_project_not_found' using errcode = 'P0002'; end if;
  if not private.can_manage_organization(project.organization_id) then
    raise exception 'capital_project_review_management_denied' using errcode = '42501';
  end if;
  insert into public.capital_project_review_policies (organization_id, capital_project_id, self_approval, updated_by)
    values (project.organization_id, project.id, p_self_approval, caller_id)
  on conflict (organization_id, capital_project_id) do update
    set self_approval = excluded.self_approval, updated_by = excluded.updated_by;
  return jsonb_build_object('project_id', project.id, 'self_approval', p_self_approval,
    'effective', private.capital_project_self_approval_allowed(project.organization_id, project.id));
end;
$$;
create or replace function public.set_capital_project_review_policy_v1(p_project_id uuid, p_self_approval text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_capital_project_review_policy_v1(p_project_id, p_self_approval);
$$;
revoke all on function private.set_capital_project_review_policy_v1(uuid, text), public.set_capital_project_review_policy_v1(uuid, text) from public, anon, authenticated;
grant execute on function private.set_capital_project_review_policy_v1(uuid, text), public.set_capital_project_review_policy_v1(uuid, text) to authenticated;

create or replace function private.set_organization_review_policy_v1(p_organization_id uuid, p_self_approval_allowed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid());
begin
  if caller_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_organization_id is null or p_self_approval_allowed is null then raise exception 'invalid_review_policy' using errcode = '22023'; end if;
  if not private.can_manage_organization(p_organization_id) then
    raise exception 'capital_project_review_management_denied' using errcode = '42501';
  end if;
  insert into public.organization_review_policies (organization_id, self_approval_allowed, updated_by)
    values (p_organization_id, p_self_approval_allowed, caller_id)
  on conflict (organization_id) do update
    set self_approval_allowed = excluded.self_approval_allowed, updated_by = excluded.updated_by;
  return jsonb_build_object('organization_id', p_organization_id, 'self_approval_allowed', p_self_approval_allowed);
end;
$$;
create or replace function public.set_organization_review_policy_v1(p_organization_id uuid, p_self_approval_allowed boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.set_organization_review_policy_v1(p_organization_id, p_self_approval_allowed);
$$;
revoke all on function private.set_organization_review_policy_v1(uuid, boolean), public.set_organization_review_policy_v1(uuid, boolean) from public, anon, authenticated;
grant execute on function private.set_organization_review_policy_v1(uuid, boolean), public.set_organization_review_policy_v1(uuid, boolean) to authenticated;

-- One read for the project area: mode, effective setting, what the caller may do and the
-- members that can hold a role. Names come from profiles; the e-mail identifies a colleague
-- without a profile name. Nothing here is a permission by itself; the commands decide.
create or replace function private.read_capital_project_review_context_v1(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); project public.capital_projects; project_setting text; org_setting boolean;
begin
  select * into project from public.capital_projects p
    where p.id = p_project_id and private.can_access_capital_project(p.organization_id, p.id);
  if not found then raise exception 'capital_project_not_found' using errcode = 'P0002'; end if;
  select self_approval into project_setting from public.capital_project_review_policies
    where organization_id = project.organization_id and capital_project_id = project.id;
  select self_approval_allowed into org_setting from public.organization_review_policies where organization_id = project.organization_id;
  return jsonb_build_object(
    'project_id', project.id,
    'organization_id', project.organization_id,
    'mode', private.capital_project_review_mode(project.organization_id, project.id),
    'self_approval', jsonb_build_object(
      'effective', private.capital_project_self_approval_allowed(project.organization_id, project.id),
      'project', coalesce(project_setting, 'inherit'),
      'organization', coalesce(org_setting, false)),
    'can_manage', private.can_manage_organization(project.organization_id),
    'caller', jsonb_build_object(
      'user_id', caller_id,
      'roles', to_jsonb(private.capital_project_review_roles(project.organization_id, project.id, caller_id)),
      'can_prepare', private.capital_project_review_action_allowed(project.organization_id, project.id, 'prepare') is null,
      'can_return', private.capital_project_review_action_allowed(project.organization_id, project.id, 'return') is null,
      'can_approve', private.capital_project_review_action_allowed(project.organization_id, project.id, 'approve') is null),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'full_name', pr.full_name, 'email', u.email, 'membership_role', m.role,
        'roles', coalesce((select jsonb_agg(a.review_role order by a.review_role) from public.capital_project_review_assignments a
          where a.organization_id = m.organization_id and a.capital_project_id = project.id and a.user_id = m.user_id), '[]'::jsonb))
        order by coalesce(pr.full_name, u.email), m.user_id)
      from public.organization_memberships m
      join auth.users u on u.id = m.user_id
      left join public.profiles pr on pr.id = m.user_id
      where m.organization_id = project.organization_id and m.status = 'active'), '[]'::jsonb));
end;
$$;
create or replace function public.read_capital_project_review_context_v1(p_project_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_capital_project_review_context_v1(p_project_id);
$$;
revoke all on function private.read_capital_project_review_context_v1(uuid), public.read_capital_project_review_context_v1(uuid) from public, anon, authenticated;
grant execute on function private.read_capital_project_review_context_v1(uuid), public.read_capital_project_review_context_v1(uuid) to authenticated;

-- The common entry: records the request under the prepare role and, for documentary reading,
-- runs the existing atomic revision command in the same transaction. Financial and provider
-- work continue on their own surfaces, which keep their own inputs, versions and approvals.
create or replace function private.record_capital_project_work_request_v1(
  p_project_id uuid, p_request_id uuid, p_capability text, p_objective text, p_locale text,
  p_registry_version text, p_dispatch jsonb, p_origin_section text, p_status text, p_documentary jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid()); project public.capital_projects; existing public.capital_project_work_requests;
  objective text := trim(coalesce(p_objective, '')); outcome jsonb := '{}'::jsonb;
begin
  if caller_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_request_id is null or p_capability not in ('documentary_reading', 'financial_result', 'provider_research')
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
create or replace function public.record_capital_project_work_request_v1(
  p_project_id uuid, p_request_id uuid, p_capability text, p_objective text, p_locale text,
  p_registry_version text, p_dispatch jsonb, p_origin_section text, p_status text, p_documentary jsonb default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.record_capital_project_work_request_v1(p_project_id, p_request_id, p_capability, p_objective, p_locale,
    p_registry_version, p_dispatch, p_origin_section, p_status, p_documentary);
$$;
revoke all on function private.record_capital_project_work_request_v1(uuid, uuid, text, text, text, text, jsonb, text, text, jsonb),
  public.record_capital_project_work_request_v1(uuid, uuid, text, text, text, text, jsonb, text, text, jsonb) from public, anon, authenticated;
grant execute on function private.record_capital_project_work_request_v1(uuid, uuid, text, text, text, text, jsonb, text, text, jsonb),
  public.record_capital_project_work_request_v1(uuid, uuid, text, text, text, text, jsonb, text, text, jsonb) to authenticated;
