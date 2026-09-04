-- How an institution works, as data, versioned and owned.
--
-- A bank, an asset manager and a credit fund analyse the same company differently. The
-- methodology object holds the definitions adopted, the EBITDA adjustments allowed, the
-- thresholds, the eligibility rules, the presentation standard, the review sequence, the minimum
-- scenarios, the mandatory metrics and the decisions and corrections the house recorded. It
-- modifies criteria, checks and presentation; it never decides what the work is, and it never
-- holds capabilities, which stay in institution_capability_profiles with an owner and an origin.
--
-- Every save is a new version. The previous one is superseded, not overwritten, so an analysis
-- can always say which methodology version it ran under.

create table public.organization_methodologies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  status text not null default 'active' check (status in ('active', 'superseded')),
  content jsonb not null check (jsonb_typeof(content) = 'object' and content ->> 'schemaVersion' = 'organization-methodology.v1'),
  source_kind text not null default 'self_declared' check (source_kind in ('house_default', 'self_declared', 'reviewed')),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, version_number)
);

create unique index organization_methodologies_one_active_idx
  on public.organization_methodologies (organization_id)
  where status = 'active';

create trigger organization_methodologies_set_updated_at before update on public.organization_methodologies
  for each row execute function private.set_updated_at();

alter table public.organization_methodologies enable row level security;
alter table public.organization_methodologies force row level security;

create policy organization_methodologies_select on public.organization_methodologies for select to authenticated
  using ((select private.is_org_member(organization_id)));

-- Writes go through the command below; the Data API cannot insert or update rows directly.
grant select on public.organization_methodologies to authenticated;

comment on table public.organization_methodologies is
  'Versioned institutional methodology: definitions, adjustments, thresholds, eligibility, presentation, review '
  'sequence, scenarios, mandatory metrics, prior decisions and corrections. Modifies criteria, checks and '
  'presentation; never the work itself, never capabilities.';

create or replace function private.save_organization_methodology(
  p_organization_id uuid,
  p_content jsonb,
  p_source_kind text default 'self_declared'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  next_version integer;
  created public.organization_methodologies;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.can_manage_organization(p_organization_id)) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object'
    or p_content ->> 'schemaVersion' <> 'organization-methodology.v1'
    or p_content ->> 'capabilitiesReference' <> 'institution_capability_profiles' then
    raise exception 'invalid_methodology' using errcode = '22023';
  end if;
  if p_source_kind not in ('house_default', 'self_declared', 'reviewed') then
    raise exception 'invalid_methodology_source' using errcode = '22023';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.organization_methodologies
  where organization_id = p_organization_id;

  update public.organization_methodologies
  set status = 'superseded'
  where organization_id = p_organization_id and status = 'active';

  insert into public.organization_methodologies (
    organization_id, version_number, status, content, source_kind, confirmed_by, confirmed_at, created_by
  ) values (
    p_organization_id, next_version, 'active', p_content, p_source_kind,
    case when p_source_kind = 'reviewed' then actor_id else null end,
    case when p_source_kind = 'reviewed' then now() else null end,
    actor_id
  ) returning * into created;

  return jsonb_build_object('id', created.id, 'version', created.version_number, 'status', created.status);
end;
$$;

revoke all on function private.save_organization_methodology(uuid, jsonb, text) from public, anon;

create or replace function public.save_organization_methodology_v1(
  p_organization_id uuid,
  p_content jsonb,
  p_source_kind text default 'self_declared'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.save_organization_methodology(p_organization_id, p_content, p_source_kind);
$$;

revoke all on function public.save_organization_methodology_v1(uuid, jsonb, text) from public, anon;
grant execute on function public.save_organization_methodology_v1(uuid, jsonb, text) to authenticated;
grant execute on function private.save_organization_methodology(uuid, jsonb, text) to authenticated;

-- Both agent context loaders deliver the active methodology beside the professional context and
-- the institution capabilities. The rest of each function is reproduced unchanged.

create or replace function private.worker_load_agent_context(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_context jsonb := private.worker_load_agent_context_before_professional_context_v1(
    p_job_id,
    p_capability_token
  );
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  message_actor uuid;
  message_conversation uuid;
  durable_recent_messages jsonb;
begin
  select message.created_by, message.conversation_id
  into message_actor, message_conversation
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = (base_context ->> 'message_id')::uuid;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', recent.id,
      'role', recent.role,
      'content', recent.content,
      'created_at', recent.created_at
    ) order by recent.created_at
  ), '[]'::jsonb)
  into durable_recent_messages
  from (
    select message.id, message.role, message.content, message.created_at
    from public.agent_messages message
    where message.organization_id = job_row.organization_id
      and message.conversation_id = message_conversation
      and message.id <> (base_context ->> 'message_id')::uuid
      and (
        message.status = 'completed'
        or (message.role = 'user' and message.status = 'failed')
      )
    order by message.created_at desc
    limit 12
  ) recent;

  return base_context || jsonb_build_object(
    'recent_messages', durable_recent_messages,
    'professional_context', (
      select jsonb_build_object(
        'useForms', to_jsonb(profile.use_forms),
        'professionalRoles', to_jsonb(profile.professional_roles),
        'practiceAreas', to_jsonb(profile.practice_areas),
        'primaryObjectives', to_jsonb(profile.primary_objectives),
        'institutionName', profile.institution_name,
        'disclosureStatus', profile.disclosure_status,
        'lastConfirmedAt', profile.last_confirmed_at
      )
      from public.professional_context_profiles profile
      where profile.organization_id = job_row.organization_id
        and profile.user_id = message_actor
    ),
    'institution_capabilities', (
      select jsonb_build_object(
        'institutionName', capability.institution_name,
        'institutionKind', capability.institution_kind,
        'operatingModels', to_jsonb(capability.operating_models),
        'productFamilies', to_jsonb(capability.product_families),
        'geographies', to_jsonb(capability.geographies),
        'currencies', to_jsonb(capability.currencies),
        'capabilityNotes', capability.capability_notes,
        'sourceKind', capability.source_kind,
        'disclosureStatus', capability.disclosure_status,
        'lastConfirmedAt', capability.last_confirmed_at
      )
      from public.institution_capability_profiles capability
      where capability.organization_id = job_row.organization_id
    ),
    'organization_methodology', (
      select jsonb_build_object(
        'version', methodology.version_number,
        'content', methodology.content,
        'sourceKind', methodology.source_kind,
        'confirmedAt', methodology.confirmed_at
      )
      from public.organization_methodologies methodology
      where methodology.organization_id = job_row.organization_id
        and methodology.status = 'active'
      order by methodology.version_number desc
      limit 1
    )
  );
end;
$$;

create or replace function private.worker_load_capital_project_context_v4(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_context jsonb := private.worker_load_capital_project_context_v3(p_job_id, p_capability_token);
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  message_actor uuid;
begin
  select run.created_by into message_actor
  from public.processing_runs run
  where run.organization_id = job_row.organization_id
    and run.id = job_row.processing_run_id;

  if message_actor is null then
    raise exception 'capital_project_actor_not_available' using errcode = 'P0002';
  end if;

  return base_context || jsonb_build_object(
    'professional_context', (
      select jsonb_build_object(
        'useForms', to_jsonb(profile.use_forms),
        'professionalRoles', to_jsonb(profile.professional_roles),
        'practiceAreas', to_jsonb(profile.practice_areas),
        'primaryObjectives', to_jsonb(profile.primary_objectives),
        'institutionName', profile.institution_name,
        'disclosureStatus', profile.disclosure_status,
        'lastConfirmedAt', profile.last_confirmed_at
      )
      from public.professional_context_profiles profile
      where profile.organization_id = job_row.organization_id
        and profile.user_id = message_actor
    ),
    'institution_capabilities', (
      select jsonb_build_object(
        'institutionName', capability.institution_name,
        'institutionKind', capability.institution_kind,
        'operatingModels', to_jsonb(capability.operating_models),
        'productFamilies', to_jsonb(capability.product_families),
        'geographies', to_jsonb(capability.geographies),
        'currencies', to_jsonb(capability.currencies),
        'capabilityNotes', capability.capability_notes,
        'sourceKind', capability.source_kind,
        'disclosureStatus', capability.disclosure_status,
        'lastConfirmedAt', capability.last_confirmed_at
      )
      from public.institution_capability_profiles capability
      where capability.organization_id = job_row.organization_id
    ),
    'organization_methodology', (
      select jsonb_build_object(
        'version', methodology.version_number,
        'content', methodology.content,
        'sourceKind', methodology.source_kind,
        'confirmedAt', methodology.confirmed_at
      )
      from public.organization_methodologies methodology
      where methodology.organization_id = job_row.organization_id
        and methodology.status = 'active'
      order by methodology.version_number desc
      limit 1
    )
  );
end;
$$;
