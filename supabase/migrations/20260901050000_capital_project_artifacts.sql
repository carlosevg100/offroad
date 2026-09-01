-- Durable project memory for every entry job, including public-information work that starts
-- before a private intake exists. Artifacts are immutable, versioned outputs of exact TaskRuns.
-- The worker may propose a draft or a corrigible work product; only a separate user decision
-- may later confirm it. Raw documents remain in their governed evidence tables.

create table public.capital_project_artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  plan_id uuid not null,
  task_run_id uuid not null,
  artifact_type text not null check (artifact_type ~ '^[a-z0-9_]{3,80}$'),
  schema_version text not null check (schema_version ~ '^[a-z0-9_.-]{3,80}$'),
  artifact_version integer not null check (artifact_version > 0),
  status text not null check (status in (
    'draft', 'pending_confirmation', 'confirmed', 'approved', 'stale', 'superseded'
  )),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  artifact_fingerprint text not null check (artifact_fingerprint ~ '^[0-9a-f]{64}$'),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  evidence_refs jsonb not null default '[]'::jsonb check (
    jsonb_typeof(evidence_refs) = 'array' and jsonb_array_length(evidence_refs) <= 500
  ),
  dependencies jsonb not null default '[]'::jsonb check (
    jsonb_typeof(dependencies) = 'array' and jsonb_array_length(dependencies) <= 100
  ),
  processing_job_id uuid not null,
  created_by_kind text not null check (created_by_kind in ('worker', 'user')),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, capital_project_id, artifact_type, artifact_version),
  unique (organization_id, task_run_id, artifact_type),
  unique (organization_id, capital_project_id, artifact_fingerprint),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, plan_id)
    references public.capital_project_plans(organization_id, id) on delete restrict,
  foreign key (organization_id, task_run_id)
    references public.capital_project_task_runs(organization_id, id) on delete restrict,
  foreign key (organization_id, processing_job_id)
    references public.processing_jobs(organization_id, id) on delete restrict,
  check (
    (created_by_kind = 'worker' and created_by is null)
    or (created_by_kind = 'user' and created_by is not null)
  ),
  check (
    (status in ('stale', 'superseded') and superseded_at is not null)
    or (status not in ('stale', 'superseded') and superseded_at is null)
  )
);

create table public.capital_project_artifact_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capital_project_id uuid not null,
  artifact_id uuid not null,
  artifact_fingerprint text not null check (artifact_fingerprint ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('confirm', 'request_changes')),
  note text,
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, artifact_id),
  foreign key (organization_id, capital_project_id)
    references public.capital_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, artifact_id)
    references public.capital_project_artifacts(organization_id, id) on delete restrict,
  check (decision = 'confirm' or char_length(trim(coalesce(note, ''))) between 2 and 5000)
);

create unique index capital_project_artifacts_one_current_type_idx
  on public.capital_project_artifacts (organization_id, capital_project_id, artifact_type)
  where status not in ('stale', 'superseded');
create index capital_project_artifacts_project_created_idx
  on public.capital_project_artifacts (
    organization_id, capital_project_id, created_at desc
  );
create index capital_project_artifacts_plan_idx
  on public.capital_project_artifacts (organization_id, plan_id, created_at desc);
create index capital_project_artifacts_processing_job_idx
  on public.capital_project_artifacts (organization_id, processing_job_id);
create index capital_project_artifacts_created_by_idx
  on public.capital_project_artifacts (created_by)
  where created_by is not null;
create index capital_project_artifact_decisions_project_idx
  on public.capital_project_artifact_decisions (
    organization_id, capital_project_id, decided_at desc
  );
create index capital_project_artifact_decisions_decided_by_idx
  on public.capital_project_artifact_decisions (decided_by);

alter table public.capital_project_artifacts enable row level security;
alter table public.capital_project_artifacts force row level security;
alter table public.capital_project_artifact_decisions enable row level security;
alter table public.capital_project_artifact_decisions force row level security;

create policy capital_project_artifacts_select
  on public.capital_project_artifacts for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));
create policy capital_project_artifact_decisions_select
  on public.capital_project_artifact_decisions for select to authenticated
  using ((select private.can_access_capital_project(organization_id, capital_project_id)));

revoke all privileges on public.capital_project_artifacts from public, anon, authenticated;
grant select on public.capital_project_artifacts to authenticated;
revoke all privileges on public.capital_project_artifact_decisions from public, anon, authenticated;
grant select on public.capital_project_artifact_decisions to authenticated;

create trigger capital_project_artifacts_audit
  after insert or update or delete on public.capital_project_artifacts
  for each row execute function private.capture_audit_event();
create trigger capital_project_artifact_decisions_audit
  after insert or update or delete on public.capital_project_artifact_decisions
  for each row execute function private.capture_audit_event();

create or replace function private.enforce_capital_task_artifact_output()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requires_artifact boolean;
begin
  if new.status <> 'succeeded' or new.processing_job_id is null then return new; end if;

  select (job.payload -> 'capital_artifact_required') = 'true'::jsonb
  into requires_artifact
  from public.processing_jobs job
  where job.organization_id = new.organization_id
    and job.id = new.processing_job_id;

  if not coalesce(requires_artifact, false) then return new; end if;
  if coalesce(new.output_reference ->> 'type', '') <> 'capital_project_artifact'
    or coalesce(new.output_reference ->> 'id', '') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or not exists (
      select 1
      from public.capital_project_artifacts artifact
      where artifact.organization_id = new.organization_id
        and artifact.capital_project_id = new.capital_project_id
        and artifact.task_run_id = new.id
        and artifact.id = (new.output_reference ->> 'id')::uuid
        and artifact.artifact_fingerprint = new.output_fingerprint
        and artifact.status not in ('stale', 'superseded')
    ) then
    raise exception 'capital_task_artifact_output_required' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_capital_task_artifact_output()
  from public, anon, authenticated;

create trigger capital_project_task_runs_require_artifact
  before update of status, output_reference, output_fingerprint
  on public.capital_project_task_runs
  for each row execute function private.enforce_capital_task_artifact_output();

create or replace function private.worker_record_capital_project_artifact(
  p_job_id uuid,
  p_capability_token text,
  p_task_run_id uuid,
  p_artifact_type text,
  p_schema_version text,
  p_status text,
  p_input_fingerprint text,
  p_content jsonb,
  p_evidence_refs jsonb default '[]'::jsonb,
  p_dependencies jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  run_row public.capital_project_task_runs;
  artifact_id uuid;
  existing_artifact public.capital_project_artifacts;
  next_version integer;
  computed_fingerprint text;
  dependency_record record;
  current_artifact public.capital_project_artifacts;
  missing_task_dependencies text[];
begin
  if coalesce(p_artifact_type, '') !~ '^[a-z0-9_]{3,80}$'
    or coalesce(p_schema_version, '') !~ '^[a-z0-9_.-]{3,80}$'
    or p_status not in ('draft', 'pending_confirmation')
    or coalesce(p_input_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or coalesce(jsonb_typeof(p_content), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_evidence_refs), 'null') <> 'array'
    or jsonb_array_length(p_evidence_refs) > 500
    or coalesce(jsonb_typeof(p_dependencies), 'null') <> 'array'
    or jsonb_array_length(p_dependencies) > 100 then
    raise exception 'capital_project_artifact_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_evidence_refs) evidence(value)
    where jsonb_typeof(evidence.value) <> 'object'
      or coalesce(evidence.value ->> 'sourceType', '') !~ '^[a-z0-9_]{3,80}$'
      or coalesce(evidence.value ->> 'sourceId', '') = ''
  ) then
    raise exception 'capital_project_artifact_evidence_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_dependencies) dependency_item(value)
    where jsonb_typeof(dependency_item.value) <> 'object'
      or coalesce(dependency_item.value ->> 'artifactId', '') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(dependency_item.value ->> 'artifactFingerprint', '') !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'capital_project_artifact_dependencies_invalid' using errcode = '22023';
  end if;

  select run.* into run_row
  from public.capital_project_task_runs run
  where run.organization_id = job_row.organization_id
    and run.id = p_task_run_id
    and run.processing_job_id = job_row.id
    and run.status = 'running'
    and run.input_fingerprint = p_input_fingerprint
  for update;
  if not found then
    raise exception 'capital_task_run_not_available' using errcode = 'P0002';
  end if;

  for dependency_record in
    select value from jsonb_array_elements(p_dependencies)
  loop
    if not exists (
      select 1
      from public.capital_project_artifacts artifact
      where artifact.organization_id = run_row.organization_id
        and artifact.capital_project_id = run_row.capital_project_id
        and artifact.id = (dependency_record.value ->> 'artifactId')::uuid
        and artifact.artifact_fingerprint = dependency_record.value ->> 'artifactFingerprint'
        and artifact.status not in ('stale', 'superseded')
    ) then
      raise exception 'capital_project_artifact_dependency_not_current' using errcode = '55000';
    end if;
  end loop;

  select array_agg(required_task_id order by required_task_id)
  into missing_task_dependencies
  from (
    select unnest(plan_task.dependencies) as required_task_id
    from public.capital_project_plan_tasks plan_task
    where plan_task.organization_id = run_row.organization_id
      and plan_task.id = run_row.plan_task_id
  ) required
  where not exists (
    select 1
    from jsonb_array_elements(p_dependencies) provided(value)
    join public.capital_project_artifacts artifact
      on artifact.organization_id = run_row.organization_id
      and artifact.capital_project_id = run_row.capital_project_id
      and artifact.id = (provided.value ->> 'artifactId')::uuid
      and artifact.artifact_fingerprint = provided.value ->> 'artifactFingerprint'
    join public.capital_project_task_runs dependency_run
      on dependency_run.organization_id = artifact.organization_id
      and dependency_run.id = artifact.task_run_id
      and dependency_run.status = 'succeeded'
    join public.capital_project_plan_tasks dependency_task
      on dependency_task.organization_id = dependency_run.organization_id
      and dependency_task.id = dependency_run.plan_task_id
      and dependency_task.task_id = required.required_task_id
  );
  if cardinality(missing_task_dependencies) > 0 then
    raise exception 'capital_project_artifact_dependencies_incomplete:%',
      array_to_string(missing_task_dependencies, ',') using errcode = '55000';
  end if;

  computed_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'capitalProjectId', run_row.capital_project_id,
    'planId', run_row.plan_id,
    'taskRunId', run_row.id,
    'artifactType', p_artifact_type,
    'schemaVersion', p_schema_version,
    'inputFingerprint', p_input_fingerprint,
    'content', p_content,
    'evidenceRefs', p_evidence_refs,
    'dependencies', p_dependencies
  )::text, 'utf8'), 'sha256'), 'hex');

  select artifact.* into existing_artifact
  from public.capital_project_artifacts artifact
  where artifact.organization_id = run_row.organization_id
    and artifact.capital_project_id = run_row.capital_project_id
    and artifact.artifact_fingerprint = computed_fingerprint;
  if found then
    return jsonb_build_object(
      'id', existing_artifact.id,
      'artifact_fingerprint', existing_artifact.artifact_fingerprint,
      'artifact_version', existing_artifact.artifact_version,
      'replayed', true
    );
  end if;

  select coalesce(max(artifact.artifact_version), 0) + 1
  into next_version
  from public.capital_project_artifacts artifact
  where artifact.organization_id = run_row.organization_id
    and artifact.capital_project_id = run_row.capital_project_id
    and artifact.artifact_type = p_artifact_type;

  select artifact.* into current_artifact
  from public.capital_project_artifacts artifact
  where artifact.organization_id = run_row.organization_id
    and artifact.capital_project_id = run_row.capital_project_id
    and artifact.artifact_type = p_artifact_type
    and artifact.status not in ('stale', 'superseded')
  for update;
  if found and current_artifact.status in ('confirmed', 'approved') then
    raise exception 'confirmed_capital_project_artifact_requires_explicit_invalidation'
      using errcode = '55000';
  end if;

  update public.capital_project_artifacts artifact
  set status = 'superseded', superseded_at = now()
  where artifact.organization_id = run_row.organization_id
    and artifact.capital_project_id = run_row.capital_project_id
    and artifact.artifact_type = p_artifact_type
    and artifact.status not in ('stale', 'superseded');

  insert into public.capital_project_artifacts (
    organization_id, capital_project_id, plan_id, task_run_id, artifact_type,
    schema_version, artifact_version, status, input_fingerprint,
    artifact_fingerprint, content, evidence_refs, dependencies,
    processing_job_id, created_by_kind
  ) values (
    run_row.organization_id, run_row.capital_project_id, run_row.plan_id, run_row.id,
    p_artifact_type, p_schema_version, next_version, p_status, p_input_fingerprint,
    computed_fingerprint, p_content, p_evidence_refs, p_dependencies,
    job_row.id, 'worker'
  ) returning id into artifact_id;

  return jsonb_build_object(
    'id', artifact_id,
    'artifact_fingerprint', computed_fingerprint,
    'artifact_version', next_version,
    'replayed', false
  );
end;
$$;

create or replace function private.decide_capital_project_artifact(
  p_artifact_id uuid,
  p_artifact_fingerprint text,
  p_decision text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  artifact_row public.capital_project_artifacts;
  decision_id uuid;
  normalized_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if caller_id is null
    or coalesce(p_artifact_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or p_decision not in ('confirm', 'request_changes')
    or (p_decision = 'request_changes' and char_length(coalesce(normalized_note, '')) not between 2 and 5000)
    or coalesce(char_length(normalized_note), 0) > 5000 then
    raise exception 'capital_project_artifact_decision_invalid' using errcode = '22023';
  end if;

  select artifact.* into artifact_row
  from public.capital_project_artifacts artifact
  join public.organization_memberships membership
    on membership.organization_id = artifact.organization_id
  where artifact.id = p_artifact_id
    and artifact.artifact_fingerprint = p_artifact_fingerprint
    and membership.user_id = caller_id
    and membership.status = 'active'
  for update of artifact;
  if not found then
    raise exception 'capital_project_artifact_not_found' using errcode = 'P0002';
  end if;
  if artifact_row.status <> 'pending_confirmation' then
    raise exception 'capital_project_artifact_not_pending_confirmation' using errcode = '55000';
  end if;

  insert into public.capital_project_artifact_decisions (
    organization_id, capital_project_id, artifact_id, artifact_fingerprint,
    decision, note, decided_by
  ) values (
    artifact_row.organization_id, artifact_row.capital_project_id, artifact_row.id,
    artifact_row.artifact_fingerprint, p_decision, normalized_note, caller_id
  ) returning id into decision_id;

  update public.capital_project_artifacts artifact
  set status = case p_decision when 'confirm' then 'confirmed' else 'superseded' end,
      superseded_at = case p_decision when 'request_changes' then now() else null end
  where artifact.organization_id = artifact_row.organization_id
    and artifact.id = artifact_row.id;

  return decision_id;
exception
  when unique_violation then
    select decision.id into decision_id
    from public.capital_project_artifact_decisions decision
    where decision.organization_id = artifact_row.organization_id
      and decision.artifact_id = artifact_row.id
      and decision.decision = p_decision
      and decision.note is not distinct from normalized_note;
    if decision_id is null then
      raise exception 'capital_project_artifact_already_decided' using errcode = '55000';
    end if;
    return decision_id;
end;
$$;

create or replace function public.decide_capital_project_artifact(
  p_artifact_id uuid,
  p_artifact_fingerprint text,
  p_decision text,
  p_note text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.decide_capital_project_artifact(
    p_artifact_id, p_artifact_fingerprint, p_decision, p_note
  );
$$;

create or replace function public.worker_record_capital_project_artifact(
  p_job_id uuid,
  p_capability_token text,
  p_task_run_id uuid,
  p_artifact_type text,
  p_schema_version text,
  p_status text,
  p_input_fingerprint text,
  p_content jsonb,
  p_evidence_refs jsonb default '[]'::jsonb,
  p_dependencies jsonb default '[]'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_capital_project_artifact(
    p_job_id, p_capability_token, p_task_run_id, p_artifact_type, p_schema_version,
    p_status, p_input_fingerprint, p_content, p_evidence_refs, p_dependencies
  );
$$;

revoke all on function private.worker_record_capital_project_artifact(
  uuid, text, uuid, text, text, text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.worker_record_capital_project_artifact(
  uuid, text, uuid, text, text, text, text, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function private.worker_record_capital_project_artifact(
  uuid, text, uuid, text, text, text, text, jsonb, jsonb, jsonb
) to authenticated;
grant execute on function public.worker_record_capital_project_artifact(
  uuid, text, uuid, text, text, text, text, jsonb, jsonb, jsonb
) to authenticated;

revoke all on function private.decide_capital_project_artifact(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.decide_capital_project_artifact(uuid, text, text, text)
  from public, anon;
grant execute on function private.decide_capital_project_artifact(uuid, text, text, text)
  to authenticated;
grant execute on function public.decide_capital_project_artifact(uuid, text, text, text)
  to authenticated;

comment on table public.capital_project_artifacts is
  'Immutable, versioned TaskRun outputs that form the durable memory of a capital project.';
comment on table public.capital_project_artifact_decisions is
  'Append-only user decisions on an exact artifact fingerprint; confirmation never rewrites content.';
comment on function public.worker_record_capital_project_artifact(
  uuid, text, uuid, text, text, text, text, jsonb, jsonb, jsonb
) is 'Persists a capability-bound TaskRun output with evidence and exact artifact dependencies.';
comment on function public.decide_capital_project_artifact(uuid, text, text, text) is
  'Confirms or requests changes to one exact pending work-product fingerprint.';
