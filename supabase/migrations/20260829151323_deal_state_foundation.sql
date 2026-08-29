-- Governed, versioned objects separate understanding, diagnosis, structuring,
-- production and market access. Downstream gates bind to exact upstream fingerprints.

create table public.deal_state_objects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_session_id uuid not null,
  object_type text not null check (object_type in (
    'understanding_snapshot', 'finding_register', 'clarification_batch',
    'structure_option', 'structure_decision', 'production_plan',
    'material_artifact', 'package_review', 'match_screen', 'release_authorization'
  )),
  object_version integer not null check (object_version > 0),
  status text not null check (status in (
    'draft', 'pending_confirmation', 'confirmed', 'approved', 'stale', 'superseded'
  )),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  object_fingerprint text not null check (object_fingerprint ~ '^[0-9a-f]{64}$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  dependencies jsonb not null default '[]'::jsonb check (
    jsonb_typeof(dependencies) = 'array' and jsonb_array_length(dependencies) <= 100
  ),
  created_by uuid references auth.users(id) on delete restrict,
  created_by_kind text not null check (created_by_kind in ('user', 'worker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, intake_session_id, object_type, object_version),
  foreign key (organization_id, intake_session_id)
    references public.document_intake_sessions(organization_id, id) on delete cascade,
  check (
    (created_by_kind = 'user' and created_by is not null)
    or (created_by_kind = 'worker' and created_by is null)
  )
);

create index deal_state_objects_current_idx
  on public.deal_state_objects (
    organization_id, intake_session_id, object_type, object_version desc
  ) where status not in ('stale', 'superseded');

create index deal_state_objects_fingerprint_idx
  on public.deal_state_objects (organization_id, intake_session_id, object_fingerprint);

alter table public.deal_state_objects enable row level security;
alter table public.deal_state_objects force row level security;

create policy deal_state_objects_select
  on public.deal_state_objects for select to authenticated
  using ((select private.can_access_intake_session(organization_id, intake_session_id)));

create policy deal_state_objects_insert_denied
  on public.deal_state_objects for insert to authenticated
  with check (false);

create policy deal_state_objects_update_denied
  on public.deal_state_objects for update to authenticated
  using (false) with check (false);

create policy deal_state_objects_delete_denied
  on public.deal_state_objects for delete to authenticated
  using (false);

revoke all privileges on public.deal_state_objects from anon, authenticated;
grant select on public.deal_state_objects to authenticated;

create trigger deal_state_objects_set_updated_at
  before update on public.deal_state_objects
  for each row execute function private.set_updated_at();

create trigger deal_state_objects_audit
  after insert or update or delete on public.deal_state_objects
  for each row execute function private.capture_audit_event();

create or replace function private.append_deal_state_object(
  p_organization_id uuid,
  p_session_id uuid,
  p_object_type text,
  p_status text,
  p_input_fingerprint text,
  p_payload jsonb,
  p_dependencies jsonb,
  p_created_by uuid,
  p_created_by_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
  object_id uuid;
  object_fingerprint text;
  required_type text;
  required_fingerprint text;
begin
  if p_object_type not in (
    'understanding_snapshot', 'finding_register', 'clarification_batch',
    'structure_option', 'structure_decision', 'production_plan',
    'material_artifact', 'package_review', 'match_screen', 'release_authorization'
  ) or p_status not in (
    'draft', 'pending_confirmation', 'confirmed', 'approved', 'stale', 'superseded'
  ) or p_input_fingerprint !~ '^[0-9a-f]{64}$'
    or coalesce(jsonb_typeof(p_payload), 'null') <> 'object'
    or coalesce(jsonb_typeof(p_dependencies), 'null') <> 'array'
    or jsonb_array_length(p_dependencies) > 100
    or p_created_by_kind not in ('user', 'worker')
    or (p_created_by_kind = 'user' and p_created_by is null)
    or (p_created_by_kind = 'worker' and p_created_by is not null) then
    raise exception 'invalid_deal_state_object' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_dependencies) as dependency(value)
    where jsonb_typeof(dependency.value) <> 'object'
      or dependency.value ->> 'objectType' not in (
        'understanding_snapshot', 'finding_register', 'clarification_batch',
        'structure_option', 'structure_decision', 'production_plan',
        'material_artifact', 'package_review', 'match_screen', 'release_authorization'
      )
      or coalesce(dependency.value ->> 'objectFingerprint', '') !~ '^[0-9a-f]{64}$'
  ) then
    raise exception 'invalid_deal_state_dependencies' using errcode = '22023';
  end if;

  perform 1
  from public.document_intake_sessions session
  where session.organization_id = p_organization_id
    and session.id = p_session_id
  for update;
  if not found then
    raise exception 'intake_session_not_found' using errcode = 'P0002';
  end if;

  required_type := case p_object_type
    when 'structure_decision' then 'understanding_snapshot'
    when 'production_plan' then 'structure_decision'
    when 'material_artifact' then 'production_plan'
    when 'package_review' then 'production_plan'
    when 'match_screen' then 'package_review'
    when 'release_authorization' then 'package_review'
    else null
  end;

  if required_type is not null then
    select state_object.object_fingerprint
    into required_fingerprint
    from public.deal_state_objects state_object
    where state_object.organization_id = p_organization_id
      and state_object.intake_session_id = p_session_id
      and state_object.object_type = required_type
      and state_object.status in ('confirmed', 'approved')
    order by state_object.object_version desc
    limit 1;

    if required_fingerprint is null
      or not p_dependencies @> jsonb_build_array(jsonb_build_object(
        'objectType', required_type,
        'objectFingerprint', required_fingerprint
      )) then
      raise exception 'current_upstream_object_required' using errcode = '55000';
    end if;
  end if;

  select coalesce(max(state_object.object_version), 0) + 1
  into next_version
  from public.deal_state_objects state_object
  where state_object.organization_id = p_organization_id
    and state_object.intake_session_id = p_session_id
    and state_object.object_type = p_object_type;

  object_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'organizationId', p_organization_id,
    'intakeSessionId', p_session_id,
    'objectType', p_object_type,
    'objectVersion', next_version,
    'status', p_status,
    'inputFingerprint', p_input_fingerprint,
    'payload', p_payload,
    'dependencies', p_dependencies
  )::text, 'utf8'), 'sha256'), 'hex');

  update public.deal_state_objects state_object
  set status = 'superseded', superseded_at = now()
  where state_object.organization_id = p_organization_id
    and state_object.intake_session_id = p_session_id
    and state_object.object_type = p_object_type
    and state_object.status not in ('stale', 'superseded');

  insert into public.deal_state_objects (
    organization_id, intake_session_id, object_type, object_version, status,
    input_fingerprint, object_fingerprint, payload, dependencies,
    created_by, created_by_kind
  ) values (
    p_organization_id, p_session_id, p_object_type, next_version, p_status,
    p_input_fingerprint, object_fingerprint, p_payload, p_dependencies,
    p_created_by, p_created_by_kind
  ) returning id into object_id;

  return object_id;
end;
$$;

revoke all on function private.append_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb, uuid, text)
  from public, anon;

create or replace function public.record_deal_state_object(
  p_organization_id uuid,
  p_session_id uuid,
  p_object_type text,
  p_status text,
  p_input_fingerprint text,
  p_payload jsonb,
  p_dependencies jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
    or not (select private.can_access_intake_session(p_organization_id, p_session_id)) then
    raise exception 'deal_state_access_denied' using errcode = '42501';
  end if;

  if not (
    (p_object_type = 'understanding_snapshot' and p_status in ('confirmed', 'approved'))
    or (p_object_type = 'structure_decision' and p_status in ('confirmed', 'approved'))
    or (p_object_type = 'production_plan' and p_status = 'approved')
    or (p_object_type = 'package_review' and p_status = 'approved')
    or (p_object_type = 'release_authorization' and p_status = 'approved')
  ) then
    raise exception 'user_deal_state_transition_denied' using errcode = '42501';
  end if;

  return private.append_deal_state_object(
    p_organization_id, p_session_id, p_object_type, p_status,
    p_input_fingerprint, p_payload, p_dependencies, actor_id, 'user'
  );
end;
$$;

revoke all on function public.record_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.record_deal_state_object(uuid, uuid, text, text, text, jsonb, jsonb)
  to authenticated;

create or replace function private.worker_record_deal_state_object(
  p_job_id uuid,
  p_capability_token text,
  p_object_type text,
  p_status text,
  p_input_fingerprint text,
  p_payload jsonb,
  p_dependencies jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
begin
  if job_row.kind <> 'case_analysis'
    or not (
      (p_object_type in ('understanding_snapshot', 'finding_register', 'clarification_batch', 'structure_option', 'production_plan', 'material_artifact', 'match_screen')
        and p_status in ('draft', 'pending_confirmation'))
    ) then
    raise exception 'worker_deal_state_transition_denied' using errcode = '42501';
  end if;

  return private.append_deal_state_object(
    job_row.organization_id, job_row.intake_session_id, p_object_type, p_status,
    p_input_fingerprint, p_payload, p_dependencies, null, 'worker'
  );
end;
$$;

create or replace function public.worker_record_deal_state_object(
  p_job_id uuid,
  p_capability_token text,
  p_object_type text,
  p_status text,
  p_input_fingerprint text,
  p_payload jsonb,
  p_dependencies jsonb default '[]'::jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.worker_record_deal_state_object(
    p_job_id, p_capability_token, p_object_type, p_status,
    p_input_fingerprint, p_payload, p_dependencies
  );
$$;

revoke all on function private.worker_record_deal_state_object(uuid, text, text, text, text, jsonb, jsonb)
  from public, anon;
revoke all on function public.worker_record_deal_state_object(uuid, text, text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function private.worker_record_deal_state_object(uuid, text, text, text, text, jsonb, jsonb)
  to authenticated;
grant execute on function public.worker_record_deal_state_object(uuid, text, text, text, text, jsonb, jsonb)
  to authenticated;

create or replace function private.worker_load_deal_workflow_state(
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
  objects jsonb := '{}'::jsonb;
  understanding_fingerprint text;
  structure_fingerprint text;
  production_fingerprint text;
  package_fingerprint text;
  release_fingerprint text;
  understanding_confirmed boolean := false;
  structure_confirmed boolean := false;
  production_approved boolean := false;
  package_approved boolean := false;
  release_authorized boolean := false;
  workflow_stage text := 'diagnose';
begin
  if job_row.kind <> 'case_analysis' then
    raise exception 'case_analysis_capability_required' using errcode = '42501';
  end if;

  with latest as (
    select distinct on (state_object.object_type)
      state_object.object_type,
      state_object.status,
      state_object.object_fingerprint,
      state_object.dependencies
    from public.deal_state_objects state_object
    where state_object.organization_id = job_row.organization_id
      and state_object.intake_session_id = job_row.intake_session_id
      and state_object.status not in ('stale', 'superseded')
    order by state_object.object_type, state_object.object_version desc
  )
  select coalesce(jsonb_object_agg(latest.object_type, jsonb_build_object(
    'status', latest.status,
    'fingerprint', latest.object_fingerprint,
    'dependencies', latest.dependencies
  )), '{}'::jsonb)
  into objects
  from latest;

  understanding_fingerprint := objects #>> '{understanding_snapshot,fingerprint}';
  understanding_confirmed := coalesce(objects #>> '{understanding_snapshot,status}', '') in ('confirmed', 'approved');

  structure_fingerprint := objects #>> '{structure_decision,fingerprint}';
  structure_confirmed := understanding_confirmed
    and coalesce(objects #>> '{structure_decision,status}', '') in ('confirmed', 'approved')
    and coalesce(objects #> '{structure_decision,dependencies}', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'objectType', 'understanding_snapshot', 'objectFingerprint', understanding_fingerprint
    ));

  production_fingerprint := objects #>> '{production_plan,fingerprint}';
  production_approved := structure_confirmed
    and coalesce(objects #>> '{production_plan,status}', '') = 'approved'
    and coalesce(objects #> '{production_plan,dependencies}', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'objectType', 'structure_decision', 'objectFingerprint', structure_fingerprint
    ));

  package_fingerprint := objects #>> '{package_review,fingerprint}';
  package_approved := production_approved
    and coalesce(objects #>> '{package_review,status}', '') = 'approved'
    and coalesce(objects #> '{package_review,dependencies}', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'objectType', 'production_plan', 'objectFingerprint', production_fingerprint
    ));

  release_fingerprint := objects #>> '{release_authorization,fingerprint}';
  release_authorized := package_approved
    and coalesce(objects #>> '{release_authorization,status}', '') = 'approved'
    and coalesce(objects #> '{release_authorization,dependencies}', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object(
      'objectType', 'package_review', 'objectFingerprint', package_fingerprint
    ));

  if understanding_confirmed then workflow_stage := 'structure'; end if;
  if understanding_confirmed and structure_confirmed and production_approved then workflow_stage := 'prepare'; end if;
  if package_approved then workflow_stage := 'match'; end if;
  if release_authorized then workflow_stage := 'introduce'; end if;

  return jsonb_build_object(
    'stage', workflow_stage,
    'gates', jsonb_build_object(
      'understandingConfirmed', understanding_confirmed,
      'structureConfirmed', structure_confirmed,
      'productionPlanApproved', production_approved,
      'packageApproved', package_approved,
      'releaseAuthorized', release_authorized
    ),
    'objectFingerprints', (
      select coalesce(jsonb_object_agg(key, value -> 'fingerprint'), '{}'::jsonb)
      from jsonb_each(objects)
    )
  );
end;
$$;

revoke all on function private.worker_load_deal_workflow_state(uuid, text) from public, anon;
grant execute on function private.worker_load_deal_workflow_state(uuid, text) to authenticated;

create or replace function public.worker_load_case_input(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_case_input(p_job_id, p_capability_token)
    || jsonb_build_object('pricing_context', private.worker_load_pricing_context(p_job_id, p_capability_token))
    || jsonb_build_object('market_distribution_context', private.worker_load_market_distribution_context(p_job_id, p_capability_token))
    || jsonb_build_object('red_flag_context', private.worker_load_red_flag_context(p_job_id, p_capability_token))
    || jsonb_build_object('conduct_context', private.worker_load_conduct_context(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_evidence', private.worker_load_receivables_evidence(p_job_id, p_capability_token))
    || jsonb_build_object('receivables_provider_context', private.worker_load_receivables_provider_context(p_job_id, p_capability_token))
    || jsonb_build_object('deal_workflow', private.worker_load_deal_workflow_state(p_job_id, p_capability_token));
$$;

revoke all on function public.worker_load_case_input(uuid, text) from public, anon;
grant execute on function public.worker_load_case_input(uuid, text) to authenticated;

comment on table public.deal_state_objects is
  'Versioned governed case objects. Downstream gates remain valid only while their exact upstream fingerprints are current.';
